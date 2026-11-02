import { decodeEvent, EVENT_ID_RE, networkIdOf, type DecodeConfig } from "../ledger/decode.js";
import { IndexerFault } from "../ledger/errors.js";
import { Projection } from "../ledger/projection.js";
import {
  SCHEMA_VERSION,
  type ChainStateReader,
  type Clock,
  type Fault,
  type IndexedEvent,
  type IndexerStatus,
  type LedgerSource,
  type Logger,
  type PersistedState,
  type RawChainEvent,
} from "../types/index.js";
import type { StateStore } from "./store.js";

export interface IndexerConfig {
  /** e.g. "testnet". Must be a Stellar network the operator intends; stored and re-checked on boot. */
  network: string;
  networkPassphrase: string;
  /** Deployed escrow contract id (strkey C...). Events from other contracts are ignored. */
  contractId: string;
  /** Deployment ledger: a fresh indexer backfills from here. */
  startLedger: number;
  /** Ledgers behind the tip before an event is reported CONFIRMED. */
  confirmations: number;
  pageSize: number;
  /** Ledger checkpoints retained for reorg detection. */
  maxCheckpoints: number;
}

export interface TickResult {
  ingested: number;
  duplicates: number;
  skipped: number;
  reorged: boolean;
  status: IndexerStatus;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/**
 * Cursor-based indexer. Guarantees:
 *  - idempotent: re-delivered events (same id, same payload) are dropped; same id with a
 *    different payload, or an unseen id behind the cursor, halts the indexer;
 *  - durable: state is saved after every page; restart resumes from the stored cursor;
 *  - deterministic: the projection is a pure function of the stored event log, so a rebuild
 *    from scratch (replay) yields an identical read model;
 *  - fail closed: unknown network, unknown schema, inconsistent events, or too-deep reorgs
 *    record a Fault, set status RECONCILING and stop advancing until an operator intervenes.
 */
export class Indexer {
  private state: PersistedState;
  private projection: Projection;
  private byId = new Map<string, IndexedEvent>();
  private readonly decodeCfg: DecodeConfig;

  constructor(
    private readonly cfg: IndexerConfig,
    private readonly source: LedgerSource,
    private readonly store: StateStore,
    private readonly clock: Clock,
    private readonly log: Logger = silentLogger,
  ) {
    this.decodeCfg = { contractId: cfg.contractId, networkId: networkIdOf(cfg.networkPassphrase) };
    const loaded = store.load();
    if (loaded) {
      if (loaded.network !== cfg.network || loaded.contractId !== cfg.contractId) {
        throw new Error(
          `stored state is for ${loaded.network}/${loaded.contractId}, configured ${cfg.network}/${cfg.contractId}: refusing to mix networks`,
        );
      }
      this.state = loaded;
    } else {
      this.state = this.fresh();
    }
    this.projection = this.rebuild();
  }

  // ---- read side ---------------------------------------------------------------------

  get status(): IndexerStatus {
    if (this.state.faults.length > 0) return "RECONCILING";
    return this.state.scannedThrough >= this.state.latestObservedLedger && this.state.latestObservedLedger > 0
      ? "SYNCED"
      : "SYNCING";
  }
  get model(): Projection {
    return this.projection;
  }
  get events(): readonly IndexedEvent[] {
    return this.state.events;
  }
  get faults(): readonly Fault[] {
    return this.state.faults;
  }
  get info() {
    const s = this.state;
    return {
      schemaVersion: SCHEMA_VERSION,
      network: s.network,
      contractId: s.contractId,
      status: this.status,
      cursor: s.cursor,
      scannedThrough: s.scannedThrough,
      latestObservedLedger: s.latestObservedLedger,
      lagLedgers: Math.max(0, s.latestObservedLedger - s.scannedThrough),
      eventCount: s.events.length,
      reorgCount: s.reorgCount,
      confirmations: this.cfg.confirmations,
      faults: s.faults,
    };
  }

  /** Finality as observed now: CONFIRMED once `confirmations` ledgers deep, else SUBMITTED. */
  finalityOf(ev: IndexedEvent): "CONFIRMED" | "SUBMITTED" {
    return this.state.latestObservedLedger - ev.ledger >= this.cfg.confirmations ? "CONFIRMED" : "SUBMITTED";
  }

  // ---- write side --------------------------------------------------------------------

  /** One poll: reorg check, fetch a page, ingest it, checkpoint, persist. */
  async tick(): Promise<TickResult> {
    const res: TickResult = { ingested: 0, duplicates: 0, skipped: 0, reorged: false, status: this.status };
    if (this.state.faults.length > 0) return res; // halted: never advance past a fault

    try {
      res.reorged = await this.detectReorg();
      if (this.state.faults.length > 0) return { ...res, status: this.status };

      const query = this.state.cursor
        ? { cursor: this.state.cursor }
        : { startLedger: Math.max(this.cfg.startLedger, 1) };
      const page = await this.source.getEvents(query, this.cfg.pageSize);
      this.state.latestObservedLedger = Math.max(this.state.latestObservedLedger, page.latestLedger);

      for (const raw of page.events) {
        const outcome = this.ingest(raw);
        res[outcome] += 1;
        if (this.state.faults.length > 0) break;
      }
      if (this.state.faults.length === 0 && page.scannedThrough > this.state.scannedThrough) {
        this.state.scannedThrough = page.scannedThrough;
        await this.checkpoint(page.scannedThrough);
      }
    } finally {
      this.store.save(this.state); // persist progress and any recorded fault
    }
    res.status = this.status;
    return res;
  }

  /** Poll until caught up with the tip (or halted). Returns total events ingested. */
  async catchUp(maxTicks = 10_000): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxTicks; i++) {
      const before = this.state.scannedThrough;
      const r = await this.tick();
      total += r.ingested;
      if (this.state.faults.length > 0) break;
      if (r.ingested === 0 && !r.reorged && this.state.scannedThrough === before) break;
      if (this.state.scannedThrough >= this.state.latestObservedLedger && r.ingested < this.cfg.pageSize) break;
    }
    return total;
  }

  /**
   * Compare projection against authoritative contract state. A mismatch halts the indexer
   * (RECONCILING) instead of silently trusting either side.
   */
  async reconcile(reader: ChainStateReader): Promise<Fault[]> {
    const found: Fault[] = [];
    const add = (message: string) =>
      found.push({ code: "RECONCILIATION_MISMATCH", message, at: this.clock.now().toISOString() });
    for (const p of this.projection.pools.values()) {
      const chain = await reader.getTotals(p.poolId);
      for (const k of ["funded", "reserved", "claimed", "withdrawn"] as const) {
        if (chain[k] !== p.totals[k]) add(`pool ${p.poolId} ${k}: chain ${chain[k]} != indexed ${p.totals[k]}`);
      }
    }
    for (const r of this.projection.rights.values()) {
      const chain = await reader.getRightOwner(r.rightId);
      if (chain.owner !== r.owner) add(`right ${r.rightId} owner: chain ${chain.owner} != indexed ${r.owner}`);
      if (chain.claimed !== (r.state === "Claimed")) add(`right ${r.rightId} claimed flag differs from chain`);
    }
    if (found.length > 0) {
      this.state.faults.push(...found);
      this.store.save(this.state);
      this.log.error("reconciliation mismatch; indexer halted", { count: found.length });
    }
    return found;
  }

  /**
   * Operator action: discard all indexed data and backfill from the deployment ledger. The
   * projection after catch-up must equal the previous one if the chain did not diverge.
   */
  resetForReplay(): void {
    this.state = this.fresh();
    this.projection = new Projection();
    this.byId.clear();
    this.store.save(this.state);
  }

  // ---- internals ---------------------------------------------------------------------

  private fresh(): PersistedState {
    return {
      schemaVersion: SCHEMA_VERSION,
      network: this.cfg.network,
      contractId: this.cfg.contractId,
      startLedger: this.cfg.startLedger,
      cursor: null,
      scannedThrough: Math.max(this.cfg.startLedger - 1, 0),
      latestObservedLedger: 0,
      events: [],
      checkpoints: [],
      faults: [],
      reorgCount: 0,
    };
  }

  private rebuild(): Projection {
    this.byId = new Map(this.state.events.map((e) => [e.id, e]));
    try {
      return Projection.replay(this.state.events);
    } catch (e) {
      // Stored log no longer replays: do not serve a half-built model.
      const f = e instanceof IndexerFault ? e : new IndexerFault("PROJECTION_INCONSISTENT", String(e));
      this.recordFault(f);
      return new Projection();
    }
  }

  private recordFault(f: IndexerFault): void {
    const fault: Fault = { code: f.code, message: f.message, at: this.clock.now().toISOString() };
    if (f.eventId !== undefined) fault.eventId = f.eventId;
    this.state.faults.push(fault);
    this.log.error("indexer halted", { code: f.code, message: f.message, eventId: f.eventId });
  }

  private ingest(raw: RawChainEvent): "ingested" | "duplicates" | "skipped" {
    try {
      if (raw.contractId !== this.cfg.contractId) return "skipped";
      if (!raw.inSuccessfulContractCall) return "skipped";
      if (!EVENT_ID_RE.test(raw.id)) throw new IndexerFault("BAD_EVENT_ID", `malformed event id ${raw.id}`, raw.id);

      const ev = decodeEvent(raw, this.decodeCfg, this.clock.now().toISOString());
      const known = this.byId.get(ev.id);
      if (known) {
        const same = known.txHash === ev.txHash && known.name === ev.name && known.ledger === ev.ledger &&
          JSON.stringify(known.data) === JSON.stringify(ev.data) && JSON.stringify(known.refs) === JSON.stringify(ev.refs);
        if (same) return "duplicates";
        throw new IndexerFault("INTEGRITY_CONFLICT", `event ${ev.id} re-delivered with a different payload`, ev.id);
      }
      if (this.state.cursor !== null && ev.id <= this.state.cursor) {
        throw new IndexerFault("OUT_OF_ORDER", `unseen event ${ev.id} is behind cursor ${this.state.cursor}`, ev.id);
      }
      this.projection.apply(ev); // may throw; projection mutates only on success paths below
      this.state.events.push(ev);
      this.byId.set(ev.id, ev);
      this.state.cursor = ev.id;
      return "ingested";
    } catch (e) {
      if (!(e instanceof IndexerFault)) throw e;
      this.recordFault(e);
      // A failed apply may have left the in-memory model half-updated: rebuild from the log.
      this.projection = Projection.replay(this.state.events);
      return "skipped";
    }
  }

  private async checkpoint(ledger: number): Promise<void> {
    if (ledger <= 0) return;
    const hash = await this.source.getLedgerHash(ledger);
    if (hash === null) return;
    const cps = this.state.checkpoints;
    if (cps.at(-1)?.ledger === ledger) cps.pop();
    cps.push({ ledger, hash });
    while (cps.length > this.cfg.maxCheckpoints) cps.shift();
  }

  /**
   * Walk checkpoints newest to oldest. Ledgers the source cannot vouch for (null) are skipped.
   * The first verifiable checkpoint that still matches is the common ancestor; if any newer
   * verifiable checkpoint differed, everything after the ancestor is rolled back.
   * Returns true if a reorg was found and rolled back.
   */
  private async detectReorg(): Promise<boolean> {
    const cps = this.state.checkpoints;
    let diverged = false;
    for (let i = cps.length - 1; i >= 0; i--) {
      const cp = cps[i]!;
      const h = await this.source.getLedgerHash(cp.ledger);
      if (h === null) continue;
      if (h === cp.hash) {
        if (!diverged) return false;
        this.rollbackTo(cp.ledger, i + 1);
        return true;
      }
      diverged = true;
    }
    if (diverged) {
      this.recordFault(
        new IndexerFault("REORG_TOO_DEEP", "ledger hashes changed and no retained checkpoint matches; rebuild required"),
      );
    }
    return false;
  }

  private rollbackTo(ledger: number, keepCheckpoints: number): void {
    const kept = this.state.events.filter((e) => e.ledger <= ledger);
    const dropped = this.state.events.length - kept.length;
    this.state.events = kept;
    this.state.cursor = kept.at(-1)?.id ?? null;
    this.state.scannedThrough = ledger;
    this.state.checkpoints = this.state.checkpoints.slice(0, keepCheckpoints);
    this.state.reorgCount += 1;
    this.projection = this.rebuild();
    this.log.warn("reorg detected; rolled back", { toLedger: ledger, droppedEvents: dropped });
  }
}
