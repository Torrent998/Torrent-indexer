import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_VERSION, type Fault, type IndexedEvent, type LedgerCheckpoint, type PersistedState } from "../types/index.js";
import type { StateStore } from "./store.js";

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE events (id TEXT PRIMARY KEY, ledger INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE INDEX events_ledger ON events (ledger);
      CREATE TABLE checkpoints (ledger INTEGER PRIMARY KEY, hash TEXT NOT NULL);
      CREATE TABLE faults (seq INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
      CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `,
  },
];

/**
 * Durable SQLite store (node:sqlite, WAL). Events are rows keyed by id, so appending a page writes
 * only the new rows and a reorg rollback deletes only the dropped rows; everything commits in one
 * transaction together with the cursor, so the cursor can never run ahead of the stored events.
 * node:sqlite is experimental in Node 22.
 */
export class SqliteStateStore implements StateStore {
  private readonly db: DatabaseSync;
  private known = new Set<string>();

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
    const done = new Set((this.db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      this.db.exec("BEGIN");
      try {
        this.db.exec(m.sql);
        this.db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(m.version);
        this.db.exec("COMMIT");
      } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    }
  }

  close(): void { this.db.close(); }

  load(): PersistedState | null {
    const meta = new Map((this.db.prepare("SELECT k, v FROM meta").all() as { k: string; v: string }[]).map((r) => [r.k, r.v]));
    if (!meta.has("network")) return null;
    const events = (this.db.prepare("SELECT body FROM events ORDER BY id").all() as { body: string }[]).map((r) => JSON.parse(r.body) as IndexedEvent);
    this.known = new Set(events.map((e) => e.id));
    return {
      schemaVersion: SCHEMA_VERSION,
      network: meta.get("network")!, contractId: meta.get("contractId")!,
      startLedger: Number(meta.get("startLedger")), cursor: meta.get("cursor") || null,
      scannedThrough: Number(meta.get("scannedThrough")), latestObservedLedger: Number(meta.get("latestObservedLedger")),
      reorgCount: Number(meta.get("reorgCount")), events,
      checkpoints: (this.db.prepare("SELECT ledger, hash FROM checkpoints ORDER BY ledger").all() as unknown as LedgerCheckpoint[]),
      faults: (this.db.prepare("SELECT body FROM faults ORDER BY seq").all() as { body: string }[]).map((r) => JSON.parse(r.body) as Fault),
    };
  }

  save(s: PersistedState): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const ids = new Set(s.events.map((e) => e.id));
      const ins = this.db.prepare("INSERT INTO events (id, ledger, body) VALUES (?, ?, ?)");
      const added: string[] = [];
      for (const e of s.events) if (!this.known.has(e.id)) { ins.run(e.id, e.ledger, JSON.stringify(e)); added.push(e.id); }
      const del = this.db.prepare("DELETE FROM events WHERE id = ?");
      const removed = [...this.known].filter((id) => !ids.has(id));
      for (const id of removed) del.run(id);

      this.db.exec("DELETE FROM checkpoints");
      const cp = this.db.prepare("INSERT INTO checkpoints (ledger, hash) VALUES (?, ?)");
      for (const c of s.checkpoints) cp.run(c.ledger, c.hash);

      this.db.exec("DELETE FROM faults");
      const fa = this.db.prepare("INSERT INTO faults (body) VALUES (?)");
      for (const f of s.faults) fa.run(JSON.stringify(f));

      const up = this.db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
      const kv: [string, string][] = [
        ["network", s.network], ["contractId", s.contractId], ["startLedger", String(s.startLedger)], ["cursor", s.cursor ?? ""],
        ["scannedThrough", String(s.scannedThrough)], ["latestObservedLedger", String(s.latestObservedLedger)], ["reorgCount", String(s.reorgCount)],
      ];
      for (const [k, v] of kv) up.run(k, v);
      this.db.exec("COMMIT");
      for (const id of added) this.known.add(id);
      for (const id of removed) this.known.delete(id);
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
