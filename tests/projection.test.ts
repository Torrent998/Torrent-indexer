import { describe, expect, it } from "vitest";
import { decodeEvent, networkIdOf } from "../src/ledger/decode.js";
import { IndexerFault } from "../src/ledger/errors.js";
import { Projection } from "../src/ledger/projection.js";
import type { IndexedEvent } from "../src/types/index.js";
import { stream, streamEvents } from "./helpers/fake-ledger.js";

const cfg = { contractId: stream.contractId, networkId: networkIdOf(stream.networkPassphrase) };
const events = (): IndexedEvent[] => streamEvents().map((r) => decodeEvent(r, cfg, "2026-01-01T00:00:00.000Z"));
const clone = (e: IndexedEvent, patch: Partial<IndexedEvent> & { data?: Record<string, string> }): IndexedEvent => ({
  ...e,
  ...patch,
  data: { ...e.data, ...(patch.data ?? {}) },
});

function faultOf(fn: () => unknown): IndexerFault {
  try {
    fn();
  } catch (e) {
    if (e instanceof IndexerFault) return e;
    throw e;
  }
  throw new Error("expected a fault");
}

describe("Projection from the real event stream", () => {
  it("derives the exact end state of the contract scenario", () => {
    const p = Projection.replay(events());
    const pool = p.pools.get("1")!;
    expect(pool.totals).toEqual({ funded: 1000n, reserved: 100n, claimed: 600n, withdrawn: 300n });
    expect(pool.status).toBe("Active");
    expect(pool.members).toHaveLength(2);
    const r1 = p.rights.get("1")!;
    expect(r1).toMatchObject({ state: "Claimed", amount: 600n, pendingTransfer: null });
    expect(r1.owner).toBe(events()[6]!.data["to"]); // bob, via the completed transfer
    expect(p.rights.get("2")).toMatchObject({ state: "Issued", pendingTransfer: null });
    expect(p.transfers.get("1")!.status).toBe("Completed");
    expect(p.transfers.get("2")!.status).toBe("Cancelled");
  });

  it("replay is deterministic: same log, byte-identical snapshot", () => {
    expect(JSON.stringify(Projection.replay(events()).snapshot())).toBe(
      JSON.stringify(Projection.replay(events()).snapshot()),
    );
  });
});

describe("Projection refuses inconsistent streams (fail closed)", () => {
  const evs = events();
  const upTo = (n: number) => evs.slice(0, n);

  it("double claim", () => {
    const claim = evs[7]!;
    const f = faultOf(() => Projection.replay([...upTo(8), clone(claim, { id: "9".repeat(19) + "-0000000000" })]));
    expect(f.code).toBe("PROJECTION_INCONSISTENT");
    expect(f.message).toMatch(/double claim/);
  });

  it("claim by someone other than the indexed owner (stale/forged ownership)", () => {
    const claim = evs[7]!;
    const f = faultOf(() => Projection.replay([...upTo(7), clone(claim, { data: { owner: evs[5]!.data["from"]! } })]));
    expect(f.message).toMatch(/not the indexed owner/);
  });

  it("claim before maturity", () => {
    const claim = evs[7]!;
    const early = new Date(Date.parse(claim.ledgerClosedAt) - 10 * 86_400_000).toISOString();
    expect(faultOf(() => Projection.replay([...upTo(7), clone(claim, { ledgerClosedAt: early })])).message).toMatch(/before maturity/);
  });

  it("contract-reported totals that disagree with the derived ones", () => {
    expect(faultOf(() => Projection.replay([...upTo(3), clone(evs[3]!, { data: { funded_total: "999" } })])).message).toMatch(/funded_total mismatch/);
    expect(faultOf(() => Projection.replay([...upTo(4), clone(evs[4]!, { data: { reserved_total: "601" } })])).message).toMatch(/reserved_total mismatch/);
    expect(faultOf(() => Projection.replay([...upTo(7), clone(evs[7]!, { data: { claimed_total: "1" } })])).message).toMatch(/claimed_total mismatch/);
  });

  it("a right issued beyond funded value (invariant violated in the stream)", () => {
    const f = faultOf(() => Projection.replay([...upTo(4), clone(evs[4]!, { data: { amount: "1001", reserved_total: "1001" } })]));
    expect(f.message).toMatch(/overcollateralization/);
  });

  it("references to unknown entities and replayed transfers", () => {
    expect(faultOf(() => Projection.replay(upTo(4).slice(3))).message).toMatch(/unknown pool/);
    expect(faultOf(() => Projection.replay([...upTo(7), clone(evs[6]!, { id: "9".repeat(19) + "-0000000001" })])).message).toMatch(/cannot complete|replay/);
    expect(faultOf(() => Projection.replay([...upTo(5), evs[6]!])).message).toMatch(/unknown transfer/);
  });

  it("duplicate pool, member, right ids", () => {
    expect(faultOf(() => Projection.replay([...upTo(1), evs[0]!])).message).toMatch(/already exists/);
    expect(faultOf(() => Projection.replay([...upTo(2), evs[1]!])).message).toMatch(/already joined/);
    expect(faultOf(() => Projection.replay([...upTo(5), evs[4]!])).message).toMatch(/already exists/);
  });

  it("pause/unpause out of order and a funded receipt gap", () => {
    expect(faultOf(() => Projection.replay([...upTo(1), evs[13]!])).message).toMatch(/not paused/);
    expect(faultOf(() => Projection.replay([...upTo(3), clone(evs[3]!, { data: { receipt_id: "2" } })])).message).toMatch(/receipt/);
  });

  it("withdrawing reserved value", () => {
    expect(
      faultOf(() => Projection.replay([...upTo(11), clone(evs[11]!, { data: { amount: "400", withdrawn_total: "400" } })])).message,
    ).toMatch(/overcollateralization/);
  });

  it("a new proposal while the previous one is still live, but not when it expired", () => {
    const live = clone(evs[9]!, { id: "9".repeat(19) + "-0000000002", refs: { rightId: "2", transferId: "3" } });
    const base = upTo(10); // second proposal (transfer 2, right 2) is pending, expiry = START+40d
    expect(faultOf(() => Projection.replay([...base, live])).message).toMatch(/still live/);
    const afterExpiry = clone(live, { ledgerClosedAt: new Date((1_000_000 + 41 * 86_400) * 1000).toISOString() });
    const p = Projection.replay([...base, afterExpiry]);
    expect(p.transfers.get("2")!.status).toBe("Superseded");
    expect(p.rights.get("2")!.pendingTransfer).toBe("3");
  });

  it("claiming voids a pending transfer implicitly (contract emits no cancel event)", () => {
    const e = evs;
    const proposal = clone(e[5]!, { refs: { rightId: "1", transferId: "1" } });
    // right 1: propose, then claim without completing
    const claim = clone(e[7]!, { data: { owner: e[5]!.data["from"]! } });
    const p = Projection.replay([...e.slice(0, 5), proposal, claim]);
    expect(p.transfers.get("1")!.status).toBe("Cancelled");
    expect(p.rights.get("1")!.pendingTransfer).toBeNull();
  });
});
