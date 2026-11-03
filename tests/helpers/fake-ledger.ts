import { readFileSync } from "node:fs";
import { xdr } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type {
  ChainStateReader,
  Clock,
  EventPage,
  EventQuery,
  LedgerSource,
  RawChainEvent,
  Totals,
} from "../../src/types/index.js";
import { Indexer, type IndexerConfig } from "../../src/indexer/indexer.js";
import type { StateStore } from "../../src/indexer/store.js";
import { MemoryStateStore } from "../../src/indexer/store.js";

interface StreamFile {
  networkPassphrase: string;
  contractId: string;
  events: { step: string; ledger: number; closeTime: number; eventIndex: number; topics: string[]; value: string }[];
}

export const stream: StreamFile = JSON.parse(readFileSync(new URL("../../fixtures/contract-stream.v2.json", import.meta.url), "utf8"));

export function eventId(ledger: number, index: number): string {
  const toid = (BigInt(ledger) << 32n) | 4096n;
  return `${toid.toString().padStart(19, "0")}-${String(index).padStart(10, "0")}`;
}

/** Real contract events (from the contracts repo test host) as RawChainEvents. */
export function streamEvents(): RawChainEvent[] {
  return stream.events.map((e) => ({
    id: eventId(e.ledger, e.eventIndex),
    ledger: e.ledger,
    ledgerClosedAt: new Date(e.closeTime * 1000).toISOString(),
    txHash: createHash("sha256").update(`${e.step}`).digest("hex"),
    contractId: stream.contractId,
    topics: e.topics.map((t) => xdr.ScVal.fromXDR(t, "base64")),
    value: xdr.ScVal.fromXDR(e.value, "base64"),
    inSuccessfulContractCall: true,
  }));
}

/** Number of real events in the recorded stream. */
export const STREAM_LEN = stream.events.length;

export const LAST_LEDGER = Math.max(...stream.events.map((e) => e.ledger));

export class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-01-01T00:00:00.000Z");
  }
}

/**
 * TEST ADAPTER (not an integration): an in-memory ledger that serves pre-recorded events,
 * and can duplicate, fork (reorg), and fail on demand. It stands in for Soroban RPC only.
 */
export class FakeLedgerSource implements LedgerSource {
  private events: RawChainEvent[] = [];
  private salt = new Map<number, string>(); // ledger >= key uses salt (fork simulation)
  tip = 0;
  failNext: Error | null = null;
  redeliver = 0; // number of already-delivered events to prepend again on next call
  inject: RawChainEvent[] = []; // arbitrary events prepended to the next response (then cleared)
  private lastServed: RawChainEvent[] = [];
  calls: EventQuery[] = [];

  constructor(events: RawChainEvent[] = [], tip?: number) {
    this.events = [...events].sort((a, b) => (a.id < b.id ? -1 : 1));
    this.tip = tip ?? Math.max(0, ...events.map((e) => e.ledger));
  }

  add(events: RawChainEvent[]): void {
    this.events = [...this.events, ...events].sort((a, b) => (a.id < b.id ? -1 : 1));
    this.tip = Math.max(this.tip, ...events.map((e) => e.ledger));
  }

  /** Replace everything at or after `fromLedger` and change the hashes (a reorg). */
  fork(fromLedger: number, replacement: RawChainEvent[]): void {
    this.events = [...this.events.filter((e) => e.ledger < fromLedger), ...replacement].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    this.salt.set(fromLedger, `fork-${fromLedger}-${this.salt.size}`);
    this.tip = Math.max(this.tip, ...replacement.map((e) => e.ledger), fromLedger);
  }

  setTip(n: number): void {
    this.tip = n;
  }

  async getEvents(query: EventQuery, limit: number): Promise<EventPage> {
    this.calls.push(query);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const pool = this.events.filter((e) =>
      "cursor" in query ? e.id > query.cursor : e.ledger >= query.startLedger,
    );
    const page = pool.slice(0, limit);
    let out = page;
    if (this.redeliver > 0) {
      out = [...this.lastServed.slice(-this.redeliver), ...page];
      this.redeliver = 0;
    }
    if (this.inject.length > 0) {
      out = [...this.inject, ...out];
      this.inject = [];
    }
    this.lastServed = [...this.lastServed, ...page];
    const last = page.at(-1);
    const scannedThrough = page.length < limit ? this.tip : last ? last.ledger - 1 : 0;
    return { events: out, latestLedger: this.tip, scannedThrough };
  }

  async getLedgerHash(ledger: number): Promise<string | null> {
    if (ledger > this.tip) return null;
    let s = "";
    for (const [from, v] of this.salt) if (ledger >= from) s += v;
    return createHash("sha256").update(`ledger-${ledger}-${s}`).digest("hex");
  }
}

/** TEST ADAPTER for authoritative chain state: returns whatever the test configures. */
export class FakeChainReader implements ChainStateReader {
  totals = new Map<string, Totals>();
  owners = new Map<string, { owner: string; claimed: boolean }>();
  async getTotals(poolId: string): Promise<Totals> {
    return this.totals.get(poolId) ?? { funded: 0n, reserved: 0n, claimed: 0n, withdrawn: 0n };
  }
  pools = new Map<string, { status: "Active" | "Paused" | "Closed"; controller: string }>();
  governance: { admin: string; pendingUpgrade: string | null; upgradesLocked: boolean } = { admin: "?", pendingUpgrade: null, upgradesLocked: false };
  async getRightOwner(rightId: string) {
    return this.owners.get(rightId) ?? { owner: "?", claimed: false };
  }
  async getPool(poolId: string) {
    return this.pools.get(poolId) ?? { status: "Active" as const, controller: "?" };
  }
  async getGovernance() {
    return this.governance;
  }
}

export function testConfig(over: Partial<IndexerConfig> = {}): IndexerConfig {
  return {
    network: "testnet",
    networkPassphrase: stream.networkPassphrase,
    contractId: stream.contractId,
    startLedger: 100,
    confirmations: 0,
    pageSize: 50,
    maxCheckpoints: 64,
    ...over,
  };
}

export function makeIndexer(
  source: LedgerSource,
  over: Partial<IndexerConfig> = {},
  store: StateStore = new MemoryStateStore(),
): Indexer {
  return new Indexer(testConfig(over), source, store, new FixedClock());
}
