import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { Indexer } from "../src/indexer/indexer.js";
import { FileStateStore, MemoryStateStore } from "../src/indexer/store.js";
import type { RawChainEvent } from "../src/types/index.js";
import {
  FakeChainReader,
  FakeLedgerSource,
  FixedClock,
  LAST_LEDGER,
  eventId,
  makeIndexer,
  stream,
  streamEvents,
  testConfig,
} from "./helpers/fake-ledger.js";

const snap = (ix: Indexer) => JSON.stringify(ix.model.snapshot());
const reference = async () => {
  const ix = makeIndexer(new FakeLedgerSource(streamEvents()));
  await ix.catchUp();
  return { ix, snapshot: snap(ix) };
};

describe("backfill and cursor", () => {
  it("backfills the whole stream from the deployment ledger", async () => {
    const { ix } = await reference();
    expect(ix.events).toHaveLength(14);
    expect(ix.status).toBe("SYNCED");
    expect(ix.info.cursor).toBe(ix.events.at(-1)!.id);
    expect(ix.info.scannedThrough).toBe(LAST_LEDGER);
    expect(ix.model.pools.get("1")!.totals.claimed).toBe(600n);
  });

  it("is independent of page size (1, 3, 50 give identical projections)", async () => {
    const { snapshot } = await reference();
    for (const pageSize of [1, 3, 50]) {
      const ix = makeIndexer(new FakeLedgerSource(streamEvents()), { pageSize });
      await ix.catchUp();
      expect(snap(ix), `pageSize ${pageSize}`).toBe(snapshot);
      expect(ix.status).toBe("SYNCED");
    }
  });

  it("uses the cursor, not startLedger, after the first page", async () => {
    const src = new FakeLedgerSource(streamEvents());
    const ix = makeIndexer(src, { pageSize: 5 });
    await ix.catchUp();
    expect("startLedger" in src.calls[0]!).toBe(true);
    expect(src.calls.slice(1).every((c) => "cursor" in c)).toBe(true);
  });

  it("reports SYNCING while behind the tip and lag in /status info", async () => {
    const src = new FakeLedgerSource(streamEvents(), LAST_LEDGER + 50);
    const ix = makeIndexer(src, { pageSize: 5 });
    await ix.tick();
    expect(ix.status).toBe("SYNCING");
    await ix.catchUp();
    expect(ix.status).toBe("SYNCED");
    expect(ix.info.lagLedgers).toBe(0);
  });

  it("labels finality by depth: SUBMITTED until `confirmations` ledgers deep", async () => {
    const src = new FakeLedgerSource(streamEvents(), LAST_LEDGER);
    const ix = makeIndexer(src, { confirmations: 3 });
    await ix.catchUp();
    const last = ix.events.at(-1)!;
    expect(ix.finalityOf(last)).toBe("SUBMITTED");
    expect(ix.finalityOf(ix.events[0]!)).toBe("CONFIRMED");
    src.setTip(LAST_LEDGER + 3);
    await ix.tick();
    expect(ix.finalityOf(last)).toBe("CONFIRMED");
  });
});

describe("idempotency", () => {
  it("drops redelivered identical events", async () => {
    const { snapshot } = await reference();
    const src = new FakeLedgerSource(streamEvents());
    const ix = makeIndexer(src, { pageSize: 4 });
    await ix.tick();
    src.redeliver = 3;
    const r = await ix.tick();
    expect(r.duplicates).toBe(3);
    await ix.catchUp();
    expect(ix.events).toHaveLength(14);
    expect(snap(ix)).toBe(snapshot);
    expect(ix.status).toBe("SYNCED");
  });

  it("halts when an id is redelivered with a DIFFERENT payload", async () => {
    const evs = streamEvents();
    const src = new FakeLedgerSource(evs);
    const ix = makeIndexer(src, { pageSize: 4 });
    await ix.tick();
    const forged: RawChainEvent = { ...evs[3]!, value: evs[4]!.value, topics: evs[4]!.topics };
    src.inject = [forged];
    await ix.tick();
    expect(ix.status).toBe("RECONCILING");
    expect(ix.faults[0]!.code).toBe("INTEGRITY_CONFLICT");
  });

  it("halts on an unseen event id behind the cursor (missed/out-of-order delivery)", async () => {
    const evs = streamEvents();
    const src = new FakeLedgerSource(evs.filter((e) => e !== evs[2]));
    const ix = makeIndexer(src);
    await ix.catchUp();
    // the skipped event is now (wrongly) delivered late
    src.inject = [evs[2]!];
    await ix.tick();
    expect(ix.faults.map((f) => f.code)).toContain("OUT_OF_ORDER");
  });
});

describe("fail-closed behaviour", () => {
  it("never advances past a fault, and persists it", async () => {
    const evs = streamEvents();
    const bad = { ...evs[3]!, value: nativeToScVal(1, { type: "u32" }) }; // not a map
    const src = new FakeLedgerSource([...evs.slice(0, 3), bad, ...evs.slice(4)]);
    const store = new MemoryStateStore();
    const ix = makeIndexer(src, {}, store);
    await ix.catchUp();
    expect(ix.status).toBe("RECONCILING");
    expect(ix.events).toHaveLength(3); // only what came before the bad event
    const calls = src.calls.length;
    const r = await ix.tick();
    expect(r.ingested).toBe(0);
    expect(src.calls.length).toBe(calls); // no more fetching while halted
    // a restart keeps the halt
    const again = new Indexer(testConfig(), src, store, new FixedClock());
    expect(again.status).toBe("RECONCILING");
  });

  it("halts on events from another network", async () => {
    const ix = makeIndexer(new FakeLedgerSource(streamEvents()), {
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });
    await ix.catchUp();
    expect(ix.faults[0]!.code).toBe("NETWORK_MISMATCH");
    expect(ix.events).toHaveLength(0);
  });

  it("halts on an inconsistent stream (right issued with no funding) and keeps the good prefix", async () => {
    const evs = streamEvents();
    // drop the `funded` event: the contract-reported reserved_total can no longer be backed
    const src = new FakeLedgerSource([...evs.slice(0, 3), ...evs.slice(4)]);
    const ix = makeIndexer(src);
    await ix.catchUp();
    expect(ix.status).toBe("RECONCILING");
    expect(ix.faults[0]!.code).toBe("PROJECTION_INCONSISTENT");
    expect(ix.events).toHaveLength(3);
    expect(ix.model.rights.size).toBe(0); // model rebuilt from the good prefix only
  });

  it("ignores events of other contracts and events from failed calls", async () => {
    const evs = streamEvents();
    const other = { ...evs[0]!, contractId: "C" + "A".repeat(55), id: eventId(100, 5) };
    const failed = { ...evs[1]!, inSuccessfulContractCall: false, id: eventId(100, 6) };
    const ix = makeIndexer(new FakeLedgerSource([other, failed, ...evs]));
    await ix.catchUp();
    expect(ix.status).toBe("SYNCED");
    expect(ix.events).toHaveLength(14);
  });

  it("refuses to boot on state persisted for another network/contract", () => {
    const store = new MemoryStateStore();
    makeIndexer(new FakeLedgerSource(), {}, store).resetForReplay();
    expect(() => makeIndexer(new FakeLedgerSource(), { network: "mainnet" }, store)).toThrow(/refusing to mix/);
    expect(() => makeIndexer(new FakeLedgerSource(), { contractId: "C" + "B".repeat(55) }, store)).toThrow(/refusing to mix/);
  });

  it("surfaces source errors without corrupting state, then resumes", async () => {
    const src = new FakeLedgerSource(streamEvents());
    const ix = makeIndexer(src, { pageSize: 5 });
    await ix.tick();
    const before = ix.events.length;
    src.failNext = new Error("rpc timeout");
    await expect(ix.tick()).rejects.toThrow("rpc timeout");
    expect(ix.events).toHaveLength(before);
    await ix.catchUp();
    expect(ix.events).toHaveLength(14);
    expect(ix.faults).toHaveLength(0);
  });
});

describe("durability and replay", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "torrent-ix-"));
    dirs.push(d);
    return join(d, "state.json");
  };

  it("restarts from the persisted cursor without refetching history", async () => {
    const { snapshot } = await reference();
    const path = tmp();
    const src = new FakeLedgerSource(streamEvents());
    const first = makeIndexer(src, { pageSize: 5 }, new FileStateStore(path));
    await first.tick();
    await first.tick(); // 10 events then "crash"
    const cursor = first.info.cursor;
    expect(first.events.length).toBe(10);

    src.calls = [];
    const second = makeIndexer(src, { pageSize: 5 }, new FileStateStore(path));
    expect(second.info.cursor).toBe(cursor);
    expect(snap(second)).toBe(JSON.stringify(first.model.snapshot()));
    await second.catchUp();
    expect(src.calls[0]).toEqual({ cursor });
    expect(snap(second)).toBe(snapshot);
  });

  it("a torn temp file never replaces the good state", async () => {
    const path = tmp();
    const ix = makeIndexer(new FakeLedgerSource(streamEvents()), {}, new FileStateStore(path));
    await ix.catchUp();
    writeFileSync(`${path}.tmp`, "{ half a wri"); // simulated crash mid-write
    const back = makeIndexer(new FakeLedgerSource(streamEvents()), {}, new FileStateStore(path));
    expect(back.events).toHaveLength(14);
    expect(JSON.parse(readFileSync(path, "utf8")).events).toHaveLength(14);
  });

  it("replay from the deployment ledger rebuilds an identical projection", async () => {
    const { ix, snapshot } = await reference();
    const eventsBefore = JSON.stringify(ix.events.map((e) => [e.id, e.name, e.data, e.refs]));
    ix.resetForReplay();
    expect(ix.events).toHaveLength(0);
    expect(ix.model.pools.size).toBe(0);
    await ix.catchUp();
    expect(snap(ix)).toBe(snapshot);
    expect(JSON.stringify(ix.events.map((e) => [e.id, e.name, e.data, e.refs]))).toBe(eventsBefore);
  });

  it("indexer that missed ledgers catches up to the same projection as one that saw them live", async () => {
    const { snapshot } = await reference();
    const src = new FakeLedgerSource(streamEvents().filter((e) => e.ledger <= 105), 105);
    const live = makeIndexer(src);
    await live.catchUp();
    src.add(streamEvents().filter((e) => e.ledger > 105)); // chain moved on while we were away
    await live.catchUp();
    expect(snap(live)).toBe(snapshot);
  });
});

describe("reorg handling", () => {
  it("rolls back to the last matching checkpoint and re-ingests the new branch", async () => {
    const evs = streamEvents();
    const src = new FakeLedgerSource(evs, 112);
    const ix = makeIndexer(src, { pageSize: 4 });
    await ix.catchUp();
    expect(ix.model.rights.get("1")!.state).toBe("Claimed");

    // Fork at the claim's ledger: on the canonical chain the claim (and all later events) never
    // happened (the chain tip keeps advancing past it).
    const cutoff = ix.events.find((x) => x.name === "right_claimed")!.ledger;
    src.fork(cutoff, []);
    const r = await ix.tick();
    expect(r.reorged).toBe(true);
    expect(ix.info.reorgCount).toBe(1);
    expect(ix.model.rights.get("1")!.state).toBe("Issued");
    expect(ix.model.pools.get("1")!.totals.claimed).toBe(0n);
    expect(ix.events.every((e) => e.ledger < cutoff)).toBe(true);
    expect(ix.status).not.toBe("RECONCILING");

    // The new branch re-includes the claim: indexer converges again to the reference state.
    const { snapshot } = await reference();
    src.add(evs.filter((e) => e.ledger >= cutoff));
    await ix.catchUp();
    expect(snap(ix)).toBe(snapshot);
  });

  it("goes RECONCILING when the fork is deeper than the retained checkpoints", async () => {
    const evs = streamEvents();
    const src = new FakeLedgerSource(evs, 112);
    const ix = makeIndexer(src, { pageSize: 50, maxCheckpoints: 1 });
    await ix.catchUp();
    src.fork(101, []);
    await ix.tick();
    expect(ix.status).toBe("RECONCILING");
    expect(ix.faults[0]!.code).toBe("REORG_TOO_DEEP");
  });

  it("does not treat an unverifiable (pruned) ledger hash as a reorg", async () => {
    const src = new FakeLedgerSource(streamEvents(), 112);
    const ix = makeIndexer(src);
    await ix.catchUp();
    const orig = src.getLedgerHash.bind(src);
    src.getLedgerHash = async () => null;
    const r = await ix.tick();
    expect(r.reorged).toBe(false);
    src.getLedgerHash = orig;
    expect(ix.faults).toHaveLength(0);
  });
});

describe("reconciliation against authoritative chain state", () => {
  it("passes when chain and projection agree", async () => {
    const { ix } = await reference();
    const reader = new FakeChainReader();
    for (const p of ix.model.pools.values()) reader.totals.set(p.poolId, { ...p.totals });
    for (const r of ix.model.rights.values()) reader.owners.set(r.rightId, { owner: r.owner, claimed: r.state === "Claimed" });
    expect(await ix.reconcile(reader)).toEqual([]);
    expect(ix.status).toBe("SYNCED");
  });

  it("halts (RECONCILING) when chain disagrees on totals or ownership", async () => {
    const { ix } = await reference();
    const reader = new FakeChainReader();
    for (const p of ix.model.pools.values()) reader.totals.set(p.poolId, { ...p.totals, claimed: 599n });
    for (const r of ix.model.rights.values()) reader.owners.set(r.rightId, { owner: "GSOMEONEELSE", claimed: r.state === "Claimed" });
    const found = await ix.reconcile(reader);
    expect(found.length).toBe(3);
    expect(ix.status).toBe("RECONCILING");
    expect((await ix.tick()).ingested).toBe(0);
  });
});

it("fixture sanity: stream matches configured contract", () => {
  expect(testConfig().contractId).toBe(stream.contractId);
});
