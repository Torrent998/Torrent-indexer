import { describe, expect, it } from "vitest";
import { Account, StrKey, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { ContractChainReader, ZERO_ACCOUNT, type ContractCaller } from "../src/rpc/soroban-chain-reader.js";
import { Projection } from "../src/ledger/projection.js";
import { decodeEvent, networkIdOf } from "../src/ledger/decode.js";
import { FakeLedgerSource, makeIndexer, stream, streamEvents } from "./helpers/fake-ledger.js";

const views = (stream as unknown as { views: Record<string, string> }).views;
const sc = (k: string) => xdr.ScVal.fromXDR(views[k]!, "base64");

/** Serves the REAL return values the contract produced, keyed by function+arg. */
class RecordedCaller implements ContractCaller {
  calls: string[] = [];
  constructor(private readonly override: Record<string, xdr.ScVal> = {}) {}
  async call(fn: string, args: xdr.ScVal[]) {
    const key = `${fn}(${String(scValToNative(args[0]!))})`;
    this.calls.push(key);
    const hit = this.override[key] ?? (views[key] ? sc(key) : null);
    if (!hit) throw new Error(`no recorded value for ${key}`);
    return hit;
  }
}

describe("ContractChainReader on the contract's real view results", () => {
  const reader = new ContractChainReader(new RecordedCaller());
  it("decodes get_totals", async () => {
    expect(await reader.getTotals("1")).toEqual({ funded: 1000n, reserved: 100n, claimed: 600n, withdrawn: 300n });
  });
  it("decodes get_right including the unit-enum state", async () => {
    const r1 = await reader.getRightOwner("1");
    expect(r1.claimed).toBe(true);
    const r2 = await reader.getRightOwner("2");
    expect(r2.claimed).toBe(false);
    expect(r2.owner).toMatch(/^[GC][A-Z2-7]{55}$/);
  });
  it("rejects malformed contract output instead of guessing", async () => {
    const bad = new ContractChainReader(new RecordedCaller({ "get_totals(1)": nativeToScVal({ funded: 1 }) , "get_right(1)": nativeToScVal(7, { type: "u32" }) }));
    await expect(bad.getTotals("1")).rejects.toThrow();
    await expect(bad.getRightOwner("1")).rejects.toThrow();
  });
  it("placeholder simulation account is a valid public key", () => {
    expect(StrKey.isValidEd25519PublicKey(ZERO_ACCOUNT)).toBe(true);
    expect(new Account(ZERO_ACCOUNT, "0").accountId()).toBe(ZERO_ACCOUNT);
  });
});

describe("reconciliation: projection vs the contract's recorded state", () => {
  it("agrees for the full event stream (the indexer's replay equals contract truth)", async () => {
    const ix = makeIndexer(new FakeLedgerSource(streamEvents()));
    await ix.catchUp();
    expect(await ix.reconcile(new ContractChainReader(new RecordedCaller()))).toEqual([]);
    expect(ix.status).toBe("SYNCED");
  });
  it("detects divergence: an indexer that missed the final claim disagrees with the chain", async () => {
    const evs = streamEvents();
    const noClaim = evs.filter((e) => e.ledger < evs[7]!.ledger); // stops before the claim
    const ix = makeIndexer(new FakeLedgerSource(noClaim));
    await ix.catchUp();
    const found = await ix.reconcile(new ContractChainReader(new RecordedCaller()));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.code === "RECONCILIATION_MISMATCH")).toBe(true);
    expect(ix.status).toBe("RECONCILING");
  });
  it("projection used directly also matches", () => {
    const cfg = { contractId: stream.contractId, networkId: networkIdOf(stream.networkPassphrase) };
    const p = Projection.replay(streamEvents().map((r) => decodeEvent(r, cfg, "t")));
    expect(p.pools.get("1")!.totals.withdrawn).toBe(300n);
  });
});
