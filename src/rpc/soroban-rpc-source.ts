import { rpc } from "@stellar/stellar-sdk";
import type { EventPage, EventQuery, LedgerSource, RawChainEvent } from "../types/index.js";

/**
 * Real Soroban RPC source (getEvents / getLedgers).
 *
 * STATUS: written against @stellar/stellar-sdk types and compiled, but NOT yet exercised
 * against a live Testnet RPC in this repository (no network access during authoring and no
 * deployed contract exists). Everything downstream of `LedgerSource` is tested with the
 * labeled TEST ADAPTER in tests/helpers/fake-ledger.ts. Soroban RPC retains only a limited
 * history window, so a backfill from an old deployment ledger needs an archive/ledger-meta source.
 */
export class SorobanRpcSource implements LedgerSource {
  private readonly server: rpc.Server;

  constructor(
    rpcUrl: string,
    private readonly contractId: string,
    opts: { allowHttp?: boolean } = {},
  ) {
    this.server = new rpc.Server(rpcUrl, { allowHttp: opts.allowHttp ?? false });
  }

  async getEvents(query: EventQuery, limit: number): Promise<EventPage> {
    const filters = [{ type: "contract" as const, contractIds: [this.contractId] }];
    const res = await this.server.getEvents(
      "cursor" in query ? { filters, cursor: query.cursor, limit } : { filters, startLedger: query.startLedger, limit },
    );
    const events: RawChainEvent[] = res.events.map((e) => ({
      id: e.id,
      ledger: e.ledger,
      ledgerClosedAt: e.ledgerClosedAt,
      txHash: e.txHash,
      contractId: e.contractId?.contractId() ?? "",
      topics: e.topic,
      value: e.value,
      // Newer RPC servers omit the flag and only return events of successful calls.
      inSuccessfulContractCall: e.inSuccessfulContractCall ?? true,
    }));
    // A short page means everything up to the tip was returned; a full page only proves
    // completeness up to its last event's ledger.
    const last = events.at(-1);
    const scannedThrough = events.length < limit ? res.latestLedger : last ? last.ledger - 1 : 0;
    return { events, latestLedger: res.latestLedger, scannedThrough };
  }

  async getLedgerHash(ledger: number): Promise<string | null> {
    try {
      const res = await this.server.getLedgers({ startLedger: ledger, pagination: { limit: 1 } });
      const l = res.ledgers[0];
      return l && l.sequence === ledger ? l.hash : null;
    } catch {
      return null; // outside retention or transient: unverifiable, not "changed"
    }
  }
}
