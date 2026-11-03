import { describe, expect, it } from "vitest";
import { Address, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { decodeEvent, networkIdOf } from "../src/ledger/decode.js";
import { IndexerFault } from "../src/ledger/errors.js";
import { stream, streamEvents } from "./helpers/fake-ledger.js";

const cfg = { contractId: stream.contractId, networkId: networkIdOf(stream.networkPassphrase) };
const at = "2026-01-01T00:00:00.000Z";

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof IndexerFault) return e.code;
    throw e;
  }
  return "NO_ERROR";
}

describe("decodeEvent against REAL contract events", () => {
  const raws = streamEvents();

  it("decodes every event the contract emitted, in order, with refs and data", () => {
    const evs = raws.map((r) => decodeEvent(r, cfg, at));
    expect(evs.map((e) => e.name)).toEqual([
      "pool_created", "member_joined", "member_joined", "funded", "right_issued",
      "transfer_proposed", "transfer_completed", "right_claimed", "right_issued",
      "transfer_proposed", "transfer_cancelled", "unreserved_withdrawn", "pool_paused", "pool_unpaused",
      // v2
      "funded", "right_issued", "transfer_proposed", "transfer_cancelled", "transfer_proposed",
      "transfer_cancelled", "right_claimed", "member_left", "controller_proposed", "controller_changed",
      "pool_closed", "pool_created", "member_joined", "member_removed", "admin_proposed", "admin_changed",
      "upgrade_proposed", "upgrade_cancelled", "upgrade_proposed", "upgrade_cancelled", "upgrades_locked",
    ]);
    const funded = evs[3]!;
    expect(funded.refs).toEqual({ poolId: "1" });
    expect(funded.data["amount"]).toBe("1000");
    expect(funded.data["funded_total"]).toBe("1000");
    const issued = evs[4]!;
    expect(issued.refs).toEqual({ poolId: "1", rightId: "1" });
    expect(issued.data["reserved_total"]).toBe("600");
    expect(evs[0]!.data["membership_policy_hash"]).toBe("07".repeat(32));
    expect(evs[0]!.data["network_id"]).toBeUndefined(); // verified, then dropped
  });

  it("fails closed when the event belongs to another network", () => {
    const other = { ...cfg, networkId: networkIdOf("Public Global Stellar Network ; September 2015") };
    expect(code(() => decodeEvent(raws[0]!, other, at))).toBe("NETWORK_MISMATCH");
  });

  it("rejects unknown event names (newer schema) instead of skipping them", () => {
    const bad = { ...raws[0]!, topics: [nativeToScVal("pool_exploded", { type: "symbol" }), raws[0]!.topics[1]!] };
    expect(code(() => decodeEvent(bad, cfg, at))).toBe("UNKNOWN_EVENT");
  });

  const mapOf = (v: xdr.ScVal): xdr.ScMapEntry[] => {
    if (v.type !== "scvMap" || !v.map) throw new Error("fixture value is not a map");
    return v.map;
  };
  const withMap = (entries: xdr.ScMapEntry[]): xdr.ScVal => xdr.ScVal.scvMap(entries);
  const keyName = (e: xdr.ScMapEntry): string => String(scValToNative(e.key));
  const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: nativeToScVal(k, { type: "symbol" }), val: v });

  it("rejects wrong topic count, missing data fields and extra data fields", () => {
    const r = raws[3]!; // funded
    expect(code(() => decodeEvent({ ...r, topics: [r.topics[0]!] }, cfg, at))).toBe("SCHEMA_MISMATCH");
    const entries = mapOf(r.value);
    expect(code(() => decodeEvent({ ...r, value: withMap(entries.slice(1)) }, cfg, at))).toBe("SCHEMA_MISMATCH");
    const extra = withMap([...entries, entry("surprise", nativeToScVal(1, { type: "u32" }))]);
    expect(code(() => decodeEvent({ ...r, value: extra }, cfg, at))).toBe("SCHEMA_MISMATCH");
  });

  it("rejects wrong field types (amount as u32, not i128)", () => {
    const r = raws[3]!;
    const entries = mapOf(r.value).map((e) => (keyName(e) === "amount" ? entry("amount", nativeToScVal(5, { type: "u32" })) : e));
    expect(code(() => decodeEvent({ ...r, value: withMap(entries) }, cfg, at))).toBe("SCHEMA_MISMATCH");
  });

  it("rejects non-u64 topics and malformed ids", () => {
    const r = raws[3]!;
    const addr = new Address(stream.contractId).toScVal();
    expect(code(() => decodeEvent({ ...r, topics: [r.topics[0]!, addr] }, cfg, at))).toBe("SCHEMA_MISMATCH");
    expect(code(() => decodeEvent({ ...r, id: "not-an-id" }, cfg, at))).toBe("BAD_EVENT_ID");
  });

  it("rejects an event with no topics and a non-map payload", () => {
    const r = raws[3]!;
    expect(code(() => decodeEvent({ ...r, topics: [] }, cfg, at))).toBe("SCHEMA_MISMATCH");
    expect(code(() => decodeEvent({ ...r, value: nativeToScVal(1, { type: "u32" }) }, cfg, at))).toBe("SCHEMA_MISMATCH");
  });
});

describe("contract_upgraded (not in the recorded stream: executing an upgrade needs real wasm)", () => {
  const raws = streamEvents();
  // upgrade_cancelled has exactly contract_upgraded's shape ({network_id, wasm_hash}, no id topic);
  // reuse its real payload bytes and change only the name symbol.
  const cancelled = raws.find((r) => scValToNative(r.topics[0]!) === "upgrade_cancelled")!;
  const upgraded = { ...cancelled, topics: [nativeToScVal("contract_upgraded", { type: "symbol" })] };

  it("decodes with no id refs and the wasm hash as hex", () => {
    const e = decodeEvent(upgraded, cfg, at);
    expect(e.name).toBe("contract_upgraded");
    expect(e.refs).toEqual({});
    expect(e.data["wasm_hash"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an id topic on a contract-level event", () => {
    const withTopic = { ...upgraded, topics: [...upgraded.topics, nativeToScVal(1n, { type: "u64" })] };
    expect(code(() => decodeEvent(withTopic, cfg, at))).toBe("SCHEMA_MISMATCH");
  });
});
