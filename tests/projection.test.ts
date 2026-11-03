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
    expect(pool.totals).toEqual({ funded: 1200n, reserved: 100n, claimed: 650n, withdrawn: 300n });
    expect(pool.status).toBe("Closed");
    expect(pool.members).toHaveLength(1); // bob left
    expect(pool.departedMembers).toHaveLength(1);
    expect(pool.controller).not.toBe(events()[0]!.data["controller"]); // rotated
    expect(pool.pendingController).toBeNull();
    expect(p.pools.get("2")).toMatchObject({ status: "Active", members: [] }); // carol removed
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

  it("a new proposal while the previous one is still live", () => {
    const live = clone(evs[9]!, { id: "9".repeat(19) + "-0000000002", refs: { rightId: "2", transferId: "3" } });
    expect(faultOf(() => Projection.replay([...upTo(10), live])).message).toMatch(/still live/);
  });

  it("v2: a replaced or claim-voided offer must be evented (no silent status changes)", () => {
    // Real stream: 16 propose t3, 17 cancel t3, 18 propose t4, 19 cancel t4, 20 claim r3.
    expect(evs[17]!.name).toBe("transfer_cancelled");
    expect(evs[19]!.name).toBe("transfer_cancelled");
    const ok = Projection.replay(upTo(21));
    expect(ok.transfers.get("3")!.status).toBe("Cancelled");
    expect(ok.transfers.get("4")!.status).toBe("Cancelled");
    expect(ok.rights.get("3")).toMatchObject({ state: "Claimed", pendingTransfer: null });
    expect(faultOf(() => Projection.replay([...upTo(17), evs[18]!])).message).toMatch(/without a transfer_cancelled/);
    expect(faultOf(() => Projection.replay([...upTo(19), evs[20]!])).message).toMatch(/not cancelled first/);
  });
});

describe("v2 lifecycle and governance consistency (fail closed)", () => {
  const evs = events();
  const upTo = (n: number) => evs.slice(0, n);
  const at = (e: IndexedEvent, secs: number) => clone(e, { ledgerClosedAt: new Date(secs * 1000).toISOString() });

  it("timing rules: no offer on a matured right, none beyond maturity, none after close", () => {
    const r3 = Projection.replay(upTo(16)).rights.get("3")!;
    expect(faultOf(() => Projection.replay([...upTo(16), at(evs[16]!, r3.maturity)])).message).toMatch(/matured right/);
    expect(faultOf(() => Projection.replay([...upTo(16), clone(evs[16]!, { data: { expiry: String(r3.maturity + 1) } })])).message).toMatch(/outlives/);
  });

  it("nothing new enters a closed pool", () => {
    const closed = upTo(25); // ... pool_closed (24)
    expect(Projection.replay(closed).pools.get("1")!.status).toBe("Closed");
    const f = (e: IndexedEvent) => faultOf(() => Projection.replay([...closed, clone(e, { id: "9".repeat(19) + "-0000000003" })])).message;
    expect(f(clone(evs[14]!, { data: { receipt_id: "3", funded_total: "1400" } }))).toMatch(/closed/);
    expect(f(evs[12]!)).toMatch(/closed/); // pause
    expect(f(evs[24]!)).toMatch(/already closed/);
  });

  it("membership: leaving while owning a right, removal after funding", () => {
    // alice owns right 2 (unclaimed) throughout
    const aliceLeaves = clone(evs[21]!, { data: { member: evs[15]!.data["owner"]! } });
    expect(faultOf(() => Projection.replay([...upTo(21), aliceLeaves])).message).toMatch(/owning an unclaimed right/);
    const removeAfterFunding = clone(evs[27]!, { refs: { poolId: "1" } });
    expect(faultOf(() => Projection.replay([...upTo(21), removeAfterFunding])).message).toMatch(/after funding/);
    const p = Projection.replay(upTo(28)).pools.get("2")!;
    expect(p.members).toEqual([]);
  });

  it("controller rotation must match the pending proposal", () => {
    const wrong = clone(evs[23]!, { data: { controller: evs[0]!.data["token"]! } });
    expect(faultOf(() => Projection.replay([...upTo(23), wrong])).message).toMatch(/pending proposal/);
    expect(faultOf(() => Projection.replay([...upTo(22), evs[23]!])).message).toMatch(/pending proposal/);
  });

  it("upgrades: one pending at a time, cancel must match, none after lock, executed only after the timelock", () => {
    expect(faultOf(() => Projection.replay([...upTo(31), evs[32]!])).message).toMatch(/while one is pending/);
    expect(faultOf(() => Projection.replay([...upTo(30), clone(evs[31]!, { data: { wasm_hash: "00".repeat(32) } })])).message).toMatch(/not the pending one/);
    expect(faultOf(() => Projection.replay([...upTo(35), clone(evs[32]!, { id: "9".repeat(19) + "-0000000004" })])).message).toMatch(/locked/);
    const proposed = Projection.replay(upTo(33)).governance.pendingUpgrade!;
    const exec = (secs: number): IndexedEvent => ({
      ...evs[33]!, name: "contract_upgraded", data: { wasm_hash: proposed.wasmHash }, ledgerClosedAt: new Date(secs * 1000).toISOString(),
    });
    expect(faultOf(() => Projection.replay([...upTo(33), exec(proposed.executableAfter - 1)])).message).toMatch(/before its timelock/);
    const done = Projection.replay([...upTo(33), exec(proposed.executableAfter)]).governance;
    expect(done.pendingUpgrade).toBeNull();
    expect(done.upgrades).toEqual([{ wasmHash: proposed.wasmHash, ledger: evs[33]!.ledger }]);
    expect(faultOf(() => Projection.replay([...upTo(31), exec(proposed.executableAfter)])).message).toMatch(/never proposed/);
  });

  it("admin rotation: learned from events and checked from then on", () => {
    const g = Projection.replay(upTo(30)).governance;
    expect(g.admin).toBe(evs[29]!.data["admin"]);
    expect(g.pendingAdmin).toBeNull();
    const forged = clone(evs[28]!, { id: "9".repeat(19) + "-0000000005", data: { admin: evs[0]!.data["controller"]! } });
    expect(faultOf(() => Projection.replay([...upTo(30), forged])).message).toMatch(/not the indexed admin/);
  });
});
