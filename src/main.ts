/**
 * Process entrypoint. Configuration is read from the environment (see .env.example); there are
 * no secrets: the indexer only reads public chain data.
 * STATUS: wired to the real Soroban RPC source, which has not yet been run against a live
 * Testnet in this repository. Tests use the labeled FakeLedgerSource instead.
 */
import { Indexer } from "./indexer/indexer.js";
import { FileStateStore } from "./indexer/store.js";
import { createApp } from "./http/server.js";
import { SorobanRpcSource } from "./rpc/soroban-rpc-source.js";
import { ContractChainReader, SorobanSimulateCaller } from "./rpc/soroban-chain-reader.js";
import type { Logger } from "./types/index.js";

const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === "") throw new Error(`missing required env ${k}`);
  return v;
};

const log: Logger = {
  info: (m, x) => console.log(JSON.stringify({ level: "info", msg: m, ...x })),
  warn: (m, x) => console.warn(JSON.stringify({ level: "warn", msg: m, ...x })),
  error: (m, x) => console.error(JSON.stringify({ level: "error", msg: m, ...x })),
};

const network = env("STELLAR_NETWORK", "testnet");
if (network !== "testnet" && process.env["ALLOW_NON_TESTNET"] !== "1") {
  throw new Error("MVP is Testnet-only; set ALLOW_NON_TESTNET=1 only after the go-live review in docs/PROJECT_MASTER.md");
}
const contractId = env("TORRENT_ESCROW_CONTRACT_ID");
const cfg = {
  network,
  networkPassphrase: env("STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015"),
  contractId,
  startLedger: Number(env("CHAIN_START_LEDGER")),
  confirmations: Number(env("CONFIRMATIONS", "1")),
  pageSize: Number(env("PAGE_SIZE", "100")),
  maxCheckpoints: 256,
};
const source = new SorobanRpcSource(env("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"), contractId);
const indexer = new Indexer(cfg, source, new FileStateStore(env("STATE_FILE", "data/state.json")), { now: () => new Date() }, log);
const server = createApp(indexer).listen(Number(env("PORT", "3002")), () => log.info("listening"));

const reader = new ContractChainReader(new SorobanSimulateCaller(env("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"), contractId, cfg.networkPassphrase));
const reconcileEvery = Number(env("RECONCILE_EVERY_TICKS", "60"));
let ticks = 0;
let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function loop(): Promise<void> {
  let backoff = 1000;
  while (!stopping) {
    try {
      const r = await indexer.tick();
      backoff = 1000;
      if (++ticks % reconcileEvery === 0 && indexer.status === "SYNCED") await indexer.reconcile(reader);
      await sleep(r.ingested > 0 ? 0 : Number(env("POLL_MS", "5000")));
    } catch (e) {
      log.error("tick failed", { error: e instanceof Error ? e.message : String(e) });
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000); // bounded retry
    }
  }
}
const done = loop();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    server.close();
    void done.then(() => process.exit(0));
  });
}
