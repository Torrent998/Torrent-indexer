import type { EventName } from "../types/index.js";

export type FieldType = "address" | "bytes32" | "u64" | "u32" | "i128";

export interface EventSpec {
  /** Names of u64 topics after the leading name symbol, in order. */
  topics: ("pool_id" | "right_id" | "transfer_id")[];
  /** Data map fields (always includes network_id: bytes32). */
  data: Record<string, FieldType>;
}

const N = { network_id: "bytes32" } as const;

/**
 * ABI v1 event table. MUST equal torrent-contracts bindings/events.v1.json
 * (mirrored in fixtures/); tests/spec-mirror.test.ts enforces that.
 */
export const EVENT_SPECS: Record<EventName, EventSpec> = {
  pool_created: {
    topics: ["pool_id"],
    data: { ...N, controller: "address", token: "address", membership_policy_hash: "bytes32", start_ledger: "u32" },
  },
  member_joined: { topics: ["pool_id"], data: { ...N, member: "address" } },
  funded: {
    topics: ["pool_id"],
    data: { ...N, receipt_id: "u64", from: "address", amount: "i128", funded_total: "i128" },
  },
  right_issued: {
    topics: ["pool_id", "right_id"],
    data: { ...N, owner: "address", amount: "i128", maturity: "u64", reserved_total: "i128" },
  },
  transfer_proposed: {
    topics: ["right_id", "transfer_id"],
    data: { ...N, from: "address", to: "address", expiry: "u64" },
  },
  transfer_completed: {
    topics: ["right_id", "transfer_id"],
    data: { ...N, from: "address", to: "address" },
  },
  transfer_cancelled: { topics: ["right_id", "transfer_id"], data: { ...N } },
  right_claimed: {
    topics: ["pool_id", "right_id"],
    data: { ...N, owner: "address", recipient: "address", amount: "i128", claimed_total: "i128" },
  },
  unreserved_withdrawn: {
    topics: ["pool_id"],
    data: { ...N, to: "address", amount: "i128", withdrawn_total: "i128" },
  },
  pool_paused: { topics: ["pool_id"], data: { ...N } },
  pool_unpaused: { topics: ["pool_id"], data: { ...N } },
};

export const ABI_VERSION = 1;
