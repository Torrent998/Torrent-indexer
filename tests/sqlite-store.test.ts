import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStateStore } from "../src/indexer/sqlite-store.js";
import { FakeLedgerSource, LAST_LEDGER, STREAM_LEN, makeIndexer, streamEvents } from "./helpers/fake-ledger.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const path = () => { const d = mkdtempSync(join(tmpdir(), "torrent-ix-sql-")); dirs.push(d); return join(d, "indexer.db"); };
const snap = (ix: ReturnType<typeof makeIndexer>) => JSON.stringify(ix.model.snapshot());

describe("SqliteStateStore", () => {
  it("fresh database loads as null", () => {
    expect(new SqliteStateStore(":memory:").load()).toBeNull();
  });

  it("indexer state survives a restart and resumes from the stored cursor", async () => {
    const p = path();
    const src = new FakeLedgerSource(streamEvents());
    const s1 = new SqliteStateStore(p);
    const first = makeIndexer(src, { pageSize: 5 }, s1);
    await first.tick(); await first.tick();
    expect(first.events).toHaveLength(10);
    const cursor = first.info.cursor;
    s1.close();

    src.calls = [];
    const second = makeIndexer(src, { pageSize: 5 }, new SqliteStateStore(p));
    expect(second.info.cursor).toBe(cursor);
    expect(second.events).toHaveLength(10);
    await second.catchUp();
    expect(src.calls[0]).toEqual({ cursor });
    const ref = makeIndexer(new FakeLedgerSource(streamEvents())); await ref.catchUp();
    expect(snap(second)).toBe(snap(ref));
  });

  it("reorg rollback deletes only the dropped rows and persists the new branch", async () => {
    const p = path();
    const evs = streamEvents();
    const src = new FakeLedgerSource(evs, LAST_LEDGER);
    const store = new SqliteStateStore(p);
    const ix = makeIndexer(src, { pageSize: 4 }, store);
    await ix.catchUp();
    const claimLedger = ix.events.find((e) => e.name === "right_claimed")!.ledger;
    src.fork(claimLedger, []);
    await ix.tick();
    expect(ix.info.reorgCount).toBe(1);
    store.close();
    const reopened = makeIndexer(src, {}, new SqliteStateStore(p));
    expect(reopened.events.every((e) => e.ledger < claimLedger)).toBe(true);
    expect(reopened.info.reorgCount).toBe(1);
    expect(reopened.model.rights.get("1")!.state).toBe("Issued");
  });

  it("faults are persisted: a halted indexer stays halted after restart", async () => {
    const p = path();
    const evs = streamEvents();
    const store = new SqliteStateStore(p);
    const ix = makeIndexer(new FakeLedgerSource([...evs.slice(0, 3), ...evs.slice(4)]), {}, store);
    await ix.catchUp();
    expect(ix.status).toBe("RECONCILING");
    store.close();
    const again = makeIndexer(new FakeLedgerSource(evs), {}, new SqliteStateStore(p));
    expect(again.status).toBe("RECONCILING");
    expect(again.faults[0]!.code).toBe("PROJECTION_INCONSISTENT");
  });

  it("a failed write rolls back the whole save (cursor never ahead of events)", async () => {
    const store = new SqliteStateStore(":memory:");
    const ix = makeIndexer(new FakeLedgerSource(streamEvents()), { pageSize: 5 }, store);
    await ix.tick();
    const before = store.load()!;
    store.close();
    await expect(ix.tick()).rejects.toThrow();
    expect(before.cursor).toBe(before.events.at(-1)!.id);
  });

  it("replay reset empties the tables", async () => {
    const store = new SqliteStateStore(":memory:");
    const ix = makeIndexer(new FakeLedgerSource(streamEvents()), {}, store);
    await ix.catchUp();
    ix.resetForReplay();
    expect(store.load()!.events).toHaveLength(0);
    await ix.catchUp();
    expect(store.load()!.events).toHaveLength(STREAM_LEN);
  });
});
