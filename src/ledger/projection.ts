import type { IndexedEvent, Totals } from "../types/index.js";
import { IndexerFault } from "./errors.js";

export interface PoolView {
  poolId: string;
  controller: string;
  token: string;
  membershipPolicyHash: string;
  startLedger: number;
  status: "Active" | "Paused";
  members: string[];
  receipts: number;
  totals: Totals;
  createdAtLedger: number;
}

export interface RightView {
  rightId: string;
  poolId: string;
  amount: bigint;
  owner: string;
  maturity: number;
  state: "Issued" | "Claimed";
  pendingTransfer: string | null;
  issuedAtLedger: number;
  claimedAtLedger: number | null;
}

export interface TransferView {
  transferId: string;
  rightId: string;
  from: string;
  to: string;
  expiry: number;
  /** Superseded: an expired proposal replaced by a newer one (the contract emits no event for it). */
  status: "Pending" | "Completed" | "Cancelled" | "Superseded";
}

const bi = (s: string | undefined): bigint => BigInt(s ?? "0");
const secs = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

/**
 * Deterministic read model derived ONLY from contract events. It never decides what the
 * contract should allow; it checks that the event stream is self-consistent and agrees with
 * the totals the contract itself reports. Any disagreement throws (fail closed).
 */
export class Projection {
  readonly pools = new Map<string, PoolView>();
  readonly rights = new Map<string, RightView>();
  readonly transfers = new Map<string, TransferView>();

  static replay(events: Iterable<IndexedEvent>): Projection {
    const p = new Projection();
    for (const e of events) p.apply(e);
    return p;
  }

  private fail(e: IndexedEvent, msg: string): never {
    throw new IndexerFault("PROJECTION_INCONSISTENT", `${e.name}: ${msg}`, e.id);
  }

  private pool(e: IndexedEvent): PoolView {
    const p = this.pools.get(e.refs.poolId ?? "");
    return p ?? this.fail(e, `unknown pool ${e.refs.poolId}`);
  }

  private right(e: IndexedEvent): RightView {
    const r = this.rights.get(e.refs.rightId ?? "");
    return r ?? this.fail(e, `unknown right ${e.refs.rightId}`);
  }

  private transfer(e: IndexedEvent): TransferView {
    const t = this.transfers.get(e.refs.transferId ?? "");
    return t ?? this.fail(e, `unknown transfer ${e.refs.transferId}`);
  }

  private checkInvariant(e: IndexedEvent, t: Totals): void {
    if (t.reserved < 0n || t.reserved > t.funded - t.claimed - t.withdrawn) {
      this.fail(e, "overcollateralization invariant violated in event stream");
    }
  }

  apply(e: IndexedEvent): void {
    const d = e.data;
    switch (e.name) {
      case "pool_created": {
        const id = e.refs.poolId!;
        if (this.pools.has(id)) this.fail(e, `pool ${id} already exists`);
        this.pools.set(id, {
          poolId: id,
          controller: d["controller"]!,
          token: d["token"]!,
          membershipPolicyHash: d["membership_policy_hash"]!,
          startLedger: Number(d["start_ledger"]),
          status: "Active",
          members: [],
          receipts: 0,
          totals: { funded: 0n, reserved: 0n, claimed: 0n, withdrawn: 0n },
          createdAtLedger: e.ledger,
        });
        return;
      }
      case "member_joined": {
        const p = this.pool(e);
        if (p.members.includes(d["member"]!)) this.fail(e, "member already joined");
        p.members.push(d["member"]!);
        return;
      }
      case "funded": {
        const p = this.pool(e);
        const amount = bi(d["amount"]);
        if (amount <= 0n) this.fail(e, "non-positive amount");
        if (Number(d["receipt_id"]) !== p.receipts + 1) this.fail(e, "receipt id gap or replay");
        const next = p.totals.funded + amount;
        if (next !== bi(d["funded_total"])) this.fail(e, `funded_total mismatch: derived ${next}, reported ${d["funded_total"]}`);
        p.totals.funded = next;
        p.receipts += 1;
        return;
      }
      case "right_issued": {
        const p = this.pool(e);
        const id = e.refs.rightId!;
        if (this.rights.has(id)) this.fail(e, `right ${id} already exists`);
        const amount = bi(d["amount"]);
        if (amount <= 0n) this.fail(e, "non-positive amount");
        if (!p.members.includes(d["owner"]!)) this.fail(e, "owner is not a pool member");
        const next = p.totals.reserved + amount;
        if (next !== bi(d["reserved_total"])) this.fail(e, `reserved_total mismatch: derived ${next}, reported ${d["reserved_total"]}`);
        const totals = { ...p.totals, reserved: next };
        this.checkInvariant(e, totals);
        p.totals = totals;
        this.rights.set(id, {
          rightId: id,
          poolId: p.poolId,
          amount,
          owner: d["owner"]!,
          maturity: Number(d["maturity"]),
          state: "Issued",
          pendingTransfer: null,
          issuedAtLedger: e.ledger,
          claimedAtLedger: null,
        });
        return;
      }
      case "transfer_proposed": {
        const r = this.right(e);
        const id = e.refs.transferId!;
        if (this.transfers.has(id)) this.fail(e, `transfer ${id} already exists`);
        if (r.state !== "Issued") this.fail(e, "right is not active");
        if (r.owner !== d["from"]) this.fail(e, "proposer is not the current owner");
        if (r.pendingTransfer !== null) {
          const old = this.transfers.get(r.pendingTransfer);
          if (old?.status === "Pending") {
            // The contract silently replaces an *expired* proposal; anything else is a divergence.
            if (old.expiry > secs(e.ledgerClosedAt)) this.fail(e, "new proposal while previous one is still live");
            old.status = "Superseded";
          }
        }
        this.transfers.set(id, {
          transferId: id,
          rightId: r.rightId,
          from: d["from"]!,
          to: d["to"]!,
          expiry: Number(d["expiry"]),
          status: "Pending",
        });
        r.pendingTransfer = id;
        return;
      }
      case "transfer_completed": {
        const r = this.right(e);
        const t = this.transfer(e);
        if (t.rightId !== r.rightId) this.fail(e, "transfer belongs to a different right");
        if (t.status !== "Pending") this.fail(e, `transfer is ${t.status}, cannot complete (replay?)`);
        if (r.owner !== t.from || r.owner !== d["from"] || t.to !== d["to"]) this.fail(e, "owner/party mismatch");
        if (t.expiry <= secs(e.ledgerClosedAt)) this.fail(e, "completed after expiry");
        r.owner = t.to;
        r.pendingTransfer = null;
        t.status = "Completed";
        return;
      }
      case "transfer_cancelled": {
        const r = this.right(e);
        const t = this.transfer(e);
        if (t.rightId !== r.rightId || t.status !== "Pending") this.fail(e, "nothing to cancel");
        t.status = "Cancelled";
        if (r.pendingTransfer === t.transferId) r.pendingTransfer = null;
        return;
      }
      case "right_claimed": {
        const p = this.pool(e);
        const r = this.right(e);
        if (r.poolId !== p.poolId) this.fail(e, "right belongs to a different pool");
        if (r.state !== "Issued") this.fail(e, "double claim");
        if (r.owner !== d["owner"]) this.fail(e, `claimant ${d["owner"]} is not the indexed owner ${r.owner}`);
        if (r.amount !== bi(d["amount"])) this.fail(e, "amount differs from issued amount");
        if (secs(e.ledgerClosedAt) < r.maturity) this.fail(e, "claimed before maturity");
        const claimed = p.totals.claimed + r.amount;
        if (claimed !== bi(d["claimed_total"])) this.fail(e, `claimed_total mismatch: derived ${claimed}, reported ${d["claimed_total"]}`);
        const totals = { ...p.totals, reserved: p.totals.reserved - r.amount, claimed };
        this.checkInvariant(e, totals);
        p.totals = totals;
        r.state = "Claimed";
        r.claimedAtLedger = e.ledger;
        if (r.pendingTransfer !== null) {
          // The contract voids an open proposal on claim without a separate event.
          const t = this.transfers.get(r.pendingTransfer);
          if (t?.status === "Pending") t.status = "Cancelled";
          r.pendingTransfer = null;
        }
        return;
      }
      case "unreserved_withdrawn": {
        const p = this.pool(e);
        const amount = bi(d["amount"]);
        if (amount <= 0n) this.fail(e, "non-positive amount");
        const withdrawn = p.totals.withdrawn + amount;
        if (withdrawn !== bi(d["withdrawn_total"])) this.fail(e, `withdrawn_total mismatch: derived ${withdrawn}, reported ${d["withdrawn_total"]}`);
        const totals = { ...p.totals, withdrawn };
        this.checkInvariant(e, totals);
        p.totals = totals;
        return;
      }
      case "pool_paused": {
        const p = this.pool(e);
        if (p.status === "Paused") this.fail(e, "already paused");
        p.status = "Paused";
        return;
      }
      case "pool_unpaused": {
        const p = this.pool(e);
        if (p.status !== "Paused") this.fail(e, "not paused");
        p.status = "Active";
        return;
      }
    }
  }

  /** Canonical JSON-safe snapshot used to compare two projections byte-for-byte. */
  snapshot(): unknown {
    const ser = (v: unknown): unknown =>
      JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x)));
    const sorted = <T>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1)).map(([, v]) => v);
    return ser({ pools: sorted(this.pools), rights: sorted(this.rights), transfers: sorted(this.transfers) });
  }
}
