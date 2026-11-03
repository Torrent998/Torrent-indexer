import { Account, Contract, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { ChainStateReader, Totals } from "../types/index.js";

/** Executes a read-only contract call and returns its result value. */
export interface ContractCaller {
  call(fn: string, args: xdr.ScVal[]): Promise<xdr.ScVal>;
}

/** All-zero ed25519 key: a placeholder source for read-only simulation. */
export const ZERO_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const toBig = (v: unknown, what: string): bigint => {
  if (typeof v === "bigint") return v;
  throw new Error(`unexpected ${what} type from contract`);
};

/**
 * Reads authoritative state from the escrow contract's view functions (`get_totals`, `get_right`).
 * Decoding is tested on the contract's real recorded return values (fixtures/contract-stream.v2.json).
 */
export class ContractChainReader implements ChainStateReader {
  constructor(private readonly caller: ContractCaller) {}

  async getTotals(poolId: string): Promise<Totals> {
    const v = scValToNative(await this.caller.call("get_totals", [nativeToScVal(BigInt(poolId), { type: "u64" })])) as Record<string, unknown>;
    return {
      funded: toBig(v["funded"], "funded"), reserved: toBig(v["reserved"], "reserved"),
      claimed: toBig(v["claimed"], "claimed"), withdrawn: toBig(v["withdrawn"], "withdrawn"),
    };
  }

  async getPool(poolId: string): Promise<{ status: "Active" | "Paused" | "Closed"; controller: string }> {
    const v = scValToNative(await this.caller.call("get_pool", [nativeToScVal(BigInt(poolId), { type: "u64" })])) as Record<string, unknown>;
    const status = Array.isArray(v["status"]) ? v["status"][0] : v["status"];
    if (typeof v["controller"] !== "string" || (status !== "Active" && status !== "Paused" && status !== "Closed")) throw new Error("unexpected get_pool shape");
    return { status, controller: v["controller"] };
  }

  async getGovernance(): Promise<{ admin: string; pendingUpgrade: string | null; upgradesLocked: boolean }> {
    const v = scValToNative(await this.caller.call("get_governance", [])) as Record<string, unknown>;
    const pending = v["pending_upgrade"];
    if (typeof v["admin"] !== "string" || typeof v["upgrades_locked"] !== "boolean") throw new Error("unexpected get_governance shape");
    if (pending !== null && pending !== undefined && !(pending instanceof Uint8Array && pending.length === 32)) throw new Error("unexpected pending_upgrade");
    return { admin: v["admin"], upgradesLocked: v["upgrades_locked"], pendingUpgrade: pending instanceof Uint8Array ? Buffer.from(pending).toString("hex") : null };
  }

  async getRightOwner(rightId: string): Promise<{ owner: string; claimed: boolean }> {
    const v = scValToNative(await this.caller.call("get_right", [nativeToScVal(BigInt(rightId), { type: "u64" })])) as Record<string, unknown>;
    const state = Array.isArray(v["state"]) ? v["state"][0] : v["state"]; // unit enum variants decode as ["Claimed"]
    if (typeof v["owner"] !== "string" || (state !== "Issued" && state !== "Claimed")) throw new Error("unexpected get_right shape");
    return { owner: v["owner"], claimed: state === "Claimed" };
  }
}

/**
 * Real RPC caller via simulateTransaction with a throwaway source account (reads need no
 * signature and no funds). STATUS: compiled; NOT run against a live RPC in this repository.
 */
export class SorobanSimulateCaller implements ContractCaller {
  private readonly server: rpc.Server;
  constructor(rpcUrl: string, private readonly contractId: string, private readonly networkPassphrase: string, allowHttp = false) {
    this.server = new rpc.Server(rpcUrl, { allowHttp });
  }
  async call(fn: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
    const source = new Account(ZERO_ACCOUNT, "0");
    const tx = new TransactionBuilder(source, { fee: "100", networkPassphrase: this.networkPassphrase })
      .addOperation(new Contract(this.contractId).call(fn, ...args)).setTimeout(30).build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed for ${fn}`);
    const ret = sim.result?.retval;
    if (!ret) throw new Error(`no return value for ${fn}`);
    return ret;
  }
}
