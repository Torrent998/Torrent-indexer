import { readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, eventsResponseSchema } from "../src/http/server.js";
import type { Indexer } from "../src/indexer/indexer.js";
import { FakeLedgerSource, LAST_LEDGER, STREAM_LEN, makeIndexer, streamEvents } from "./helpers/fake-ledger.js";

let server: Server;
let base: string;
let ix: Indexer;

beforeEach(async () => {
  ix = makeIndexer(new FakeLedgerSource(streamEvents(), LAST_LEDGER + 5), { confirmations: 3 });
  await ix.catchUp();
  server = createApp(ix).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise((r) => server.close(() => r(undefined))));

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("GET /v1/ledger/events", () => {
  it("returns schema-valid events with finality and a reconciliation record", async () => {
    const { status, body } = await get("/v1/ledger/events?limit=200");
    expect(status).toBe(200);
    const parsed = eventsResponseSchema.parse(body);
    expect(parsed.events).toHaveLength(STREAM_LEN);
    expect(parsed.network).toBe("testnet");
    const first = parsed.events[0]!;
    expect(first.finality).toBe("CONFIRMED");
    expect(first.reconciliation).toMatchObject({
      sourceRepo: "torrent-indexer",
      schemaVersion: 1,
      network: "testnet",
      ledgerCursor: first.id,
      entityRef: "pool:1",
      status: "CONFIRMED",
    });
    expect(parsed.events.at(-1)!.finality).toBe("CONFIRMED"); // tip is 5 ahead, confirmations 3
  });

  it("paginates by cursor without gaps or repeats", async () => {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const { body } = await get(`/v1/ledger/events?limit=4${cursor ? `&cursor=${cursor}` : ""}`);
      const page = eventsResponseSchema.parse(body);
      if (page.events.length === 0) break;
      ids.push(...page.events.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
    }
    expect(ids).toEqual(ix.events.map((e) => e.id));
    // an exhausted cursor stays put (clients can poll safely)
    const end = await get(`/v1/ledger/events?cursor=${cursor}`);
    expect(end.body["events"]).toEqual([]);
    expect(end.body["nextCursor"]).toBe(cursor);
  });

  it("rejects bad cursors and limits with the standard error schema", async () => {
    for (const q of ["cursor=abc", "limit=0", "limit=1000", "limit=x"]) {
      const { status, body } = await get(`/v1/ledger/events?${q}`);
      expect(status, q).toBe(400);
      expect(body["error"]).toMatchObject({ code: "INVALID_QUERY" });
      expect(typeof (body["error"] as { requestId: string }).requestId).toBe("string");
      expect(typeof (body["error"] as { message: string }).message).toBe("string");
    }
  });
});

describe("read models", () => {
  it("pool shows coverage and honest indexer status", async () => {
    const { status, body } = await get("/v1/pools/1");
    expect(status).toBe(200);
    expect(body["totals"]).toEqual({ funded: "1200", reserved: "100", claimed: "650", withdrawn: "300" });
    expect(body["status"]).toBe("Closed");
    expect(body["coverage"]).toEqual({ unreserved: "150", fullyBacked: true });
    expect(body["indexerStatus"]).toBe("SYNCED");
  });

  it("rights, transfers and pool rights", async () => {
    expect((await get("/v1/rights/1")).body["state"]).toBe("Claimed");
    expect((await get("/v1/rights/2")).body["state"]).toBe("Issued");
    expect((await get("/v1/transfers/2")).body["status"]).toBe("Cancelled");
    expect(((await get("/v1/pools/1/rights")).body["rights"] as unknown[]).length).toBe(3);
  });

  it("contract governance and v2 pool lifecycle fields", async () => {
    const c = (await get("/v1/contract")).body;
    expect(c).toMatchObject({ abiVersion: 2, pendingAdmin: null, pendingUpgrade: null, upgradesLocked: true, upgrades: [] });
    expect(c["admin"]).toMatch(/^[GC][A-Z2-7]{55}$/);
    const p1 = (await get("/v1/pools/1")).body;
    expect(p1).toMatchObject({ status: "Closed", pendingController: null });
    expect(p1["departedMembers"]).toHaveLength(1);
    expect((await get("/v1/pools/2")).body).toMatchObject({ status: "Active", members: [] });
    // the expired offer replaced by a new one, and the one voided by the claim, are both evented
    expect((await get("/v1/transfers/3")).body["status"]).toBe("Cancelled");
    expect((await get("/v1/transfers/4")).body["status"]).toBe("Cancelled");
    const evs = (await get("/v1/ledger/events?limit=200")).body["events"] as { name: string; reconciliation: { entityRef: string } }[];
    expect(evs.find((e) => e.name === "upgrades_locked")!.reconciliation.entityRef).toMatch(/^contract:C/);
  });

  it("404s for unknown ids and routes; refuses writes", async () => {
    expect((await get("/v1/pools/99")).status).toBe(404);
    expect((await get("/v1/rights/99")).status).toBe(404);
    expect((await get("/v1/nope")).status).toBe(404);
    const res = await fetch(base + "/v1/pools/1", { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("status exposes cursor, lag and faults; health is cheap", async () => {
    const { body } = await get("/v1/status");
    expect(body).toMatchObject({ status: "SYNCED", network: "testnet", eventCount: STREAM_LEN, lagLedgers: 5 - 5 });
    expect((await get("/healthz")).body).toEqual({ ok: true });
  });
});

describe("example responses (consumed by torrent-api contract tests)", () => {
  it("matches generated/api-examples.v1.json", async () => {
    const paths = [
      "/v1/status", "/v1/ledger/events?limit=200", "/v1/pools/1", "/v1/pools/1/rights",
      "/v1/rights/1", "/v1/rights/2", "/v1/transfers/1", "/v1/transfers/2",
      "/v1/pools/2", "/v1/rights/3", "/v1/transfers/3", "/v1/transfers/4", "/v1/contract",
    ];
    const out: Record<string, unknown> = {};
    for (const p of paths) out[p] = (await get(p)).body;
    const doc =
      JSON.stringify(
        {
          $comment:
            "Real responses of torrent-indexer for the recorded torrent-escrow scenario (confirmations=3, tip=LAST+5). Generated by tests/http.test.ts; mirrored into torrent-api/fixtures.",
          schemaVersion: 1,
          responses: out,
        },
        null,
        2,
      ) + "\n";
    const path = new URL("../generated/api-examples.v1.json", import.meta.url);
    if (process.env["UPDATE_GOLDEN"]) writeFileSync(path, doc);
    expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(doc);
  });
});
