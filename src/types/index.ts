import type { xdr } from "@stellar/stellar-sdk";

/** Schema version of everything this service emits (API payloads, persisted state). */
export const SCHEMA_VERSION = 1;
export const SOURCE_REPO = "torrent-indexer";

export type EventName =
  | "pool_created"
  | "member_joined"
  | "funded"
  | "right_issued"
  | "transfer_proposed"
  | "transfer_completed"
  | "transfer_cancelled"
  | "right_claimed"
  | "unreserved_withdrawn"
  | "pool_paused"
  | "pool_unpaused"
  | "pool_closed"
  | "member_removed"
  | "member_left"
  | "controller_proposed"
  | "controller_changed"
  | "admin_proposed"
  | "admin_changed"
  | "upgrade_proposed"
  | "upgrade_cancelled"
  | "contract_upgraded"
  | "upgrades_locked";

/** A Soroban contract event exactly as delivered by the ledger source (undecoded). */
export interface RawChainEvent {
  /** Soroban event id: `<19-digit toid>-<10-digit index>`; lexicographic order == ledger order. */
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  contractId: string;
  topics: xdr.ScVal[];
  value: xdr.ScVal;
  /** false => emitted inside a failed call; must never be indexed. */
  inSuccessfulContractCall: boolean;
}

/** Decoded, JSON-safe contract event. Amounts and ids are decimal strings. */
export interface IndexedEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  contractId: string;
  name: EventName;
  /** Opaque entity refs taken from event topics. */
  refs: { poolId?: string; rightId?: string; transferId?: string };
  data: Record<string, string>;
  /** When this indexer first stored the event (ISO). Not chain data. */
  ingestedAt: string;
}

export interface Totals {
  funded: bigint;
  reserved: bigint;
  claimed: bigint;
  withdrawn: bigint;
}

export interface LedgerCheckpoint {
  ledger: number;
  hash: string;
}

export interface EventPage {
  events: RawChainEvent[];
  latestLedger: number;
  /** Highest ledger known to be fully scanned for this query (no event missing at or below). */
  scannedThrough: number;
}

export type EventQuery = { startLedger: number } | { cursor: string };

/** Where chain data comes from. Real: SorobanRpcSource. Tests: FakeLedgerSource (TEST ADAPTER). */
export interface LedgerSource {
  getEvents(query: EventQuery, limit: number): Promise<EventPage>;
  /** Hash of a closed ledger, or null when the source cannot (no longer) vouch for it. */
  getLedgerHash(ledger: number): Promise<string | null>;
}

/** Reads authoritative contract state for reconciliation. */
export interface ChainStateReader {
  getTotals(poolId: string): Promise<Totals>;
  getRightOwner(rightId: string): Promise<{ owner: string; claimed: boolean }>;
  /** `get_pool` (ABI v2): lifecycle status and current controller. */
  getPool(poolId: string): Promise<{ status: "Active" | "Paused" | "Closed"; controller: string }>;
  /** `get_governance` (ABI v2). */
  getGovernance(): Promise<{ admin: string; pendingUpgrade: string | null; upgradesLocked: boolean }>;
}

export type FaultCode =
  | "NETWORK_MISMATCH"
  | "SCHEMA_MISMATCH"
  | "UNKNOWN_EVENT"
  | "BAD_EVENT_ID"
  | "INTEGRITY_CONFLICT"
  | "OUT_OF_ORDER"
  | "PROJECTION_INCONSISTENT"
  | "REORG_TOO_DEEP"
  | "RECONCILIATION_MISMATCH";

export interface Fault {
  code: FaultCode;
  message: string;
  eventId?: string;
  at: string;
}

export type IndexerStatus = "SYNCING" | "SYNCED" | "RECONCILING";

export interface PersistedState {
  schemaVersion: typeof SCHEMA_VERSION;
  network: string;
  contractId: string;
  startLedger: number;
  cursor: string | null;
  scannedThrough: number;
  latestObservedLedger: number;
  events: IndexedEvent[];
  checkpoints: LedgerCheckpoint[];
  faults: Fault[];
  reorgCount: number;
}

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}
