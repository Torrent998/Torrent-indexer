import { createHash } from "node:crypto";
import { scValToNative } from "@stellar/stellar-sdk";
import type { EventName, IndexedEvent, RawChainEvent } from "../types/index.js";
import { IndexerFault } from "./errors.js";
import { EVENT_SPECS, type FieldType } from "./spec.js";

export const EVENT_ID_RE = /^\d{19}-\d{10}$/;

/** sha256(network passphrase) as lowercase hex == `network_id` emitted by the contract. */
export function networkIdOf(passphrase: string): string {
  return createHash("sha256").update(passphrase, "utf8").digest("hex");
}

export interface DecodeConfig {
  contractId: string;
  networkId: string;
}

function str(v: unknown, t: FieldType, ctx: string, id: string): string {
  const bad = (): never => {
    throw new IndexerFault("SCHEMA_MISMATCH", `field ${ctx}: expected ${t}`, id);
  };
  switch (t) {
    case "address":
      return typeof v === "string" && /^[GC][A-Z2-7]{55}$/.test(v) ? v : bad();
    case "bytes32":
      return v instanceof Uint8Array && v.length === 32 ? Buffer.from(v).toString("hex") : bad();
    case "u64":
    case "i128":
      return typeof v === "bigint" ? v.toString() : bad();
    case "u32":
      return typeof v === "number" && Number.isInteger(v) ? String(v) : typeof v === "bigint" ? v.toString() : bad();
  }
}

/**
 * Decode one raw event into a normalized one. Throws IndexerFault for anything that does not
 * match ABI v1 or belongs to another network: callers must stop, not skip.
 */
export function decodeEvent(raw: RawChainEvent, cfg: DecodeConfig, ingestedAt: string): IndexedEvent {
  if (!EVENT_ID_RE.test(raw.id)) throw new IndexerFault("BAD_EVENT_ID", `malformed event id ${raw.id}`, raw.id);
  const first = raw.topics[0];
  if (!first) throw new IndexerFault("SCHEMA_MISMATCH", "event has no topics", raw.id);
  const name = scValToNative(first);
  if (typeof name !== "string" || !Object.hasOwn(EVENT_SPECS, name)) {
    throw new IndexerFault("UNKNOWN_EVENT", `unknown event name ${String(name)}`, raw.id);
  }
  const spec = EVENT_SPECS[name as EventName];
  if (raw.topics.length !== 1 + spec.topics.length) {
    throw new IndexerFault("SCHEMA_MISMATCH", `${name}: expected ${1 + spec.topics.length} topics`, raw.id);
  }
  const refs: IndexedEvent["refs"] = {};
  spec.topics.forEach((t, i) => {
    const v = scValToNative(raw.topics[i + 1]!) as unknown;
    const key = t === "pool_id" ? "poolId" : t === "right_id" ? "rightId" : "transferId";
    refs[key] = str(v, "u64", `topic ${t}`, raw.id);
  });
  const native = scValToNative(raw.value) as unknown;
  if (typeof native !== "object" || native === null || Array.isArray(native) || native instanceof Uint8Array) {
    throw new IndexerFault("SCHEMA_MISMATCH", `${name}: data is not a map`, raw.id);
  }
  const map = native as Record<string, unknown>;
  const want = Object.keys(spec.data).sort();
  const have = Object.keys(map).sort();
  if (want.join() !== have.join()) {
    throw new IndexerFault("SCHEMA_MISMATCH", `${name}: data fields [${have}] != [${want}]`, raw.id);
  }
  const data: Record<string, string> = {};
  for (const [k, t] of Object.entries(spec.data)) data[k] = str(map[k], t, `${name}.${k}`, raw.id);
  if (data["network_id"] !== cfg.networkId) {
    throw new IndexerFault("NETWORK_MISMATCH", `${name}: network_id does not match configured network`, raw.id);
  }
  delete data["network_id"];
  return {
    id: raw.id,
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    txHash: raw.txHash,
    contractId: raw.contractId,
    name: name as EventName,
    refs,
    data,
    ingestedAt,
  };
}
