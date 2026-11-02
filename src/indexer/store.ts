import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { SCHEMA_VERSION, type PersistedState } from "../types/index.js";

export interface StateStore {
  load(): PersistedState | null;
  save(state: PersistedState): void;
}

const eventSchema = z.object({
  id: z.string(),
  ledger: z.number().int(),
  ledgerClosedAt: z.string(),
  txHash: z.string(),
  contractId: z.string(),
  name: z.string(),
  refs: z.object({ poolId: z.string().optional(), rightId: z.string().optional(), transferId: z.string().optional() }),
  data: z.record(z.string(), z.string()),
  ingestedAt: z.string(),
});

const stateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  network: z.string(),
  contractId: z.string(),
  startLedger: z.number().int(),
  cursor: z.string().nullable(),
  scannedThrough: z.number().int(),
  latestObservedLedger: z.number().int(),
  events: z.array(eventSchema),
  checkpoints: z.array(z.object({ ledger: z.number().int(), hash: z.string() })),
  faults: z.array(
    z.object({ code: z.string(), message: z.string(), eventId: z.string().optional(), at: z.string() }),
  ),
  reorgCount: z.number().int(),
});

/** In-memory store. Used by tests and ephemeral runs; loses everything on exit. */
export class MemoryStateStore implements StateStore {
  private state: PersistedState | null = null;
  load(): PersistedState | null {
    return this.state ? structuredClone(this.state) : null;
  }
  save(state: PersistedState): void {
    this.state = structuredClone(state);
  }
}

/**
 * Durable single-file JSON store: write temp file, fsync, atomic rename. A crash leaves either
 * the previous or the new complete state, never a torn one. Whole-file rewrite is O(n); fine for
 * the Testnet demo, replace with a database when volume requires it.
 */
export class FileStateStore implements StateStore {
  constructor(private readonly path: string) {}

  load(): PersistedState | null {
    if (!existsSync(this.path)) return null;
    const parsed = stateSchema.parse(JSON.parse(readFileSync(this.path, "utf8")));
    return parsed as PersistedState;
  }

  save(state: PersistedState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    const fd = openSync(tmp, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.path);
  }
}
