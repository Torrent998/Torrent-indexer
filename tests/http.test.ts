import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, eventsResponseSchema } from "../src/http/server.js";
import type { Indexer } from "../src/indexer/indexer.js";
import { FakeLedgerSource, LAST_LEDGER, makeIndexer, streamEvents } from "./helpers/fake-ledger.js";

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
    expect(parsed.events).toHaveLength(14);
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
    expect(body["totals"]).toEqual({ funded: "1000", reserved: "100", claimed: "600", withdrawn: "300" });
    expect(body["coverage"]).toEqual({ unreserved: "0", fullyBacked: true });
    expect(body["indexerStatus"]).toBe("SYNCED");
  });

  it("rights, transfers and pool rights", async () => {
    expect((await get("/v1/rights/1")).body["state"]).toBe("Claimed");
    expect((await get("/v1/rights/2")).body["state"]).toBe("Issued");
    expect((await get("/v1/transfers/2")).body["status"]).toBe("Cancelled");
    expect(((await get("/v1/pools/1/rights")).body["rights"] as unknown[]).length).toBe(2);
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
    expect(body).toMatchObject({ status: "SYNCED", network: "testnet", eventCount: 14, lagLedgers: 5 - 5 });
    expect((await get("/healthz")).body).toEqual({ ok: true });
  });
});
