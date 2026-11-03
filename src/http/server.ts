import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Indexer } from "../indexer/indexer.js";
import { SCHEMA_VERSION, SOURCE_REPO, type IndexedEvent } from "../types/index.js";
import { EVENT_ID_RE } from "../ledger/decode.js";
import { ABI_VERSION } from "../ledger/spec.js";

/** Reconciliation event contract (docs/ARCHITECTURE.md). */
export const reconciliationEventSchema = z.object({
  id: z.string(),
  sourceRepo: z.literal(SOURCE_REPO),
  schemaVersion: z.literal(SCHEMA_VERSION),
  network: z.string(),
  ledgerCursor: z.string(),
  entityRef: z.string(),
  status: z.enum(["SUBMITTED", "CONFIRMED"]),
  observedAt: z.string(),
});

export const ledgerEventSchema = z.object({
  id: z.string(),
  ledger: z.number().int(),
  ledgerClosedAt: z.string(),
  txHash: z.string(),
  contractId: z.string(),
  name: z.string(),
  refs: z.object({ poolId: z.string().optional(), rightId: z.string().optional(), transferId: z.string().optional() }),
  data: z.record(z.string(), z.string()),
  finality: z.enum(["SUBMITTED", "CONFIRMED"]),
  reconciliation: reconciliationEventSchema,
});

export const eventsResponseSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  network: z.string(),
  events: z.array(ledgerEventSchema),
  nextCursor: z.string().nullable(),
  indexerStatus: z.enum(["SYNCING", "SYNCED", "RECONCILING"]),
});

const query = z.object({
  cursor: z.string().regex(EVENT_ID_RE, "cursor must be an event id").optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});


function entityRef(e: IndexedEvent): string {
  if (e.refs.transferId) return `transfer:${e.refs.transferId}`;
  if (e.refs.rightId) return `right:${e.refs.rightId}`;
  if (e.refs.poolId) return `pool:${e.refs.poolId}`;
  return `contract:${e.contractId}`; // v2 governance events carry no id topic
}

export function toLedgerEvent(ix: Indexer, e: IndexedEvent) {
  const finality = ix.finalityOf(e);
  return {
    id: e.id,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    contractId: e.contractId,
    name: e.name,
    refs: e.refs,
    data: e.data,
    finality,
    reconciliation: {
      id: `${SOURCE_REPO}:${e.id}`,
      sourceRepo: SOURCE_REPO,
      schemaVersion: SCHEMA_VERSION,
      network: ix.info.network,
      ledgerCursor: e.id,
      entityRef: entityRef(e),
      status: finality,
      observedAt: e.ingestedAt,
    },
  } as const;
}

const ser = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x)));

function send(res: ServerResponse, code: number, body: unknown, requestId: string): void {
  res.writeHead(code, { "content-type": "application/json", "x-request-id": requestId, "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function error(res: ServerResponse, code: number, errCode: string, message: string, requestId: string): void {
  send(res, code, { error: { code: errCode, message, requestId } }, requestId);
}

export function handle(ix: Indexer, req: IncomingMessage, res: ServerResponse): void {
  const requestId = randomUUID();
  if (req.method !== "GET") return error(res, 405, "METHOD_NOT_ALLOWED", "read-only API", requestId);
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const m = ix.model;

  if (path === "/healthz") return send(res, 200, { ok: true }, requestId);
  if (path === "/v1/status") return send(res, 200, ser(ix.info), requestId);
  if (path === "/v1/contract") {
    // Governance as derived from events. `admin` is null until an admin event is seen (the
    // constructor emits none); the contract's get_governance is authoritative.
    const g = m.governance;
    return send(res, 200, ser({
      contractId: ix.info.contractId, abiVersion: ABI_VERSION, admin: g.admin, pendingAdmin: g.pendingAdmin,
      pendingUpgrade: g.pendingUpgrade, upgradesLocked: g.upgradesLocked, upgrades: g.upgrades,
      indexerStatus: ix.status, latestObservedLedger: ix.info.latestObservedLedger,
    }), requestId);
  }

  if (path === "/v1/ledger/events") {
    const q = query.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success) return error(res, 400, "INVALID_QUERY", q.error.issues.map((i) => i.message).join("; "), requestId);
    const after = q.data.cursor;
    const page = ix.events.filter((e) => after === undefined || e.id > after).slice(0, q.data.limit);
    const body = {
      schemaVersion: SCHEMA_VERSION,
      network: ix.info.network,
      events: page.map((e) => toLedgerEvent(ix, e)),
      nextCursor: page.at(-1)?.id ?? after ?? null,
      indexerStatus: ix.status,
    };
    return send(res, 200, body, requestId);
  }

  const id = /^\/v1\/(pools|rights|transfers)\/(\d{1,20})(\/rights)?$/.exec(path);
  if (id) {
    const [, kind, key, sub] = id as unknown as [string, string, string, string | undefined];
    const meta = { indexerStatus: ix.status, latestObservedLedger: ix.info.latestObservedLedger };
    if (kind === "pools" && !sub) {
      const p = m.pools.get(key);
      if (!p) return error(res, 404, "NOT_FOUND", "pool not found", requestId);
      const free = p.totals.funded - p.totals.claimed - p.totals.withdrawn - p.totals.reserved;
      return send(res, 200, ser({ ...p, coverage: { unreserved: free, fullyBacked: free >= 0n }, ...meta }), requestId);
    }
    if (kind === "pools" && sub) {
      if (!m.pools.has(key)) return error(res, 404, "NOT_FOUND", "pool not found", requestId);
      return send(res, 200, ser({ rights: [...m.rights.values()].filter((r) => r.poolId === key), ...meta }), requestId);
    }
    if (kind === "rights" && !sub) {
      const r = m.rights.get(key);
      return r ? send(res, 200, ser({ ...r, ...meta }), requestId) : error(res, 404, "NOT_FOUND", "right not found", requestId);
    }
    if (kind === "transfers" && !sub) {
      const t = m.transfers.get(key);
      return t ? send(res, 200, ser({ ...t, ...meta }), requestId) : error(res, 404, "NOT_FOUND", "transfer not found", requestId);
    }
  }
  return error(res, 404, "NOT_FOUND", "no such route", requestId);
}

export function createApp(ix: Indexer): Server {
  return createServer((req, res) => {
    try {
      handle(ix, req, res);
    } catch {
      error(res, 500, "INTERNAL", "internal error", randomUUID());
    }
  });
}

