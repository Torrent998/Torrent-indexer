# AI Coding Agent Instructions — torrent-indexer

## Mission
Implement **only the `torrent-indexer` subsystem** as defined in `docs/PROJECT_MASTER.md`, `docs/ARCHITECTURE.md`, `docs/SRD.md`, and `docs/TECHNICAL_BUILD.md`. The entire product is Torrent: A fully funded savings-circle financial system in which verified eligible members can exchange the timing/ownership of scheduled payout claims. No claim can be traded unless an equivalent supported asset amount is actually reserved on Stellar. This is a prototype of a rights market, not a guarantee of future unpaid contributions.

## Neighbor repositories
`torrent-web`, `torrent-api`, `torrent-contracts`. You are responsible for your own component and versioned integrations; do not duplicate their owners' logic.

## Current state (read before trusting older docs)

This repository is **built and CI-verified, not yet run against a live network**. Code, tests, docs, the
landing page and release workflows are complete and on `main`. What has never been done: deploying to Stellar
Testnet, running on real phones or with a real wallet, any security audit, any store listing, any
Drips Wave approval. Do not describe those as done. Older text in `docs/` that says the repo is only a
scaffold is superseded by `README.md` (status table) and `CHANGELOG.md`.

## Execution
1. Read all project docs and verify the **domain safety constraints** first.
2. Define your contracts with sibling repos using schema/ABI and fixtures. Agree on versioned handshake.
3. Complete M0 and M1 before style polish or unrelated new features.
4. Make small, testable commits (PRs only if the owner asks) and record architecture changes in ADRs.
5. Never pretend missing product or chain integrations are working; use clearly labeled test adapters.
6. Write real tests for system logic and failure paths, not only mocked happy paths.
7. Don't ask for production funds/credentials; use Testnet and synthetic providers.
8. Keep UI architecture flexible and let design be refined while respecting the brand's flat-icon and functional requirements.

---

> You are in `Torrent-indexer` (GitHub `Torrent998/Torrent-indexer`). The sections below apply to the whole Torrent project (4 repos).
> Run the runbook from the repo it names; stay inside this project's repos.

## START HERE: how to use this file

You are an AI coding agent working **on the owner's own computer** (not the cloud sandbox that built
this code). When the owner says only "read AGENTS.md", do this:

1. Read this whole file, then `docs/PROJECT_MASTER.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`
   and `CHANGELOG.md` of the repo you are in.
2. Detect the workspace (section "Workspace layout"), fetch any missing sibling repos.
3. Run the **Local continuation runbook** below, phase by phase, in order. Do all the work you can
   do yourself. Stop and ask the owner only at the points marked **HUMAN**.
4. When the phases are done, produce the **Final checklist for the owner** (last section) with the
   real values you obtained (contract ids, URLs, hashes) filled in. That checklist is the final
   deliverable. After the owner completes it, the project is ready to submit to Drips Wave.

### Why this section exists

The code was written in a cloud sandbox with **no route to Stellar Testnet, no stellar-cli, no
Android SDK and no real wallet or phone**. Everything that needs those was written and tested
offline (unit tests, property tests, golden vectors, fake adapters) but **never run for real**.
Running it for real, fixing whatever breaks, and recording the evidence is your job.

## Truth rules (non-negotiable)

- Never claim that something works, is deployed, audited or listed unless **you ran it and saw the
  output**. Quote the command and result in your commit message or in `docs/DEPLOYMENT.md`.
- Never invent a contract id, transaction hash, URL, store listing, metric, user or partner.
- If a script, command or test fails, **fix the root cause** (script flags, RPC parameters, fees,
  code) and rerun. Do not skip, delete or weaken a test to get green. Do not mark a step done on a
  partial success.
- If something cannot be done on this machine (wallet click, phone, store account), say so plainly and
  put it in the owner's checklist instead of faking it.
- Everything is **Stellar Testnet and synthetic data only**. Never use Mainnet or real funds. The
  deploy scripts refuse Mainnet; do not remove that guard.

## Secrets and safety rules

- Never commit, print, log or paste into chat any secret key, seed phrase, keystore, token, password
  or `.env` file. Use `stellar keys` **aliases** (the key stays in the local stellar-cli keystore).
  `stellar keys show <alias>` prints a secret: never run it where the output is recorded; the Sideband
  smoke script uses it only inside a pipe.
- `.env` files are gitignored. Only `.env.example` (placeholders) is committed. Before every commit run
  `git diff --cached` and look for keys (`S` + 55 characters is a Stellar secret seed), tokens and
  passwords. Check that generated files such as `.testnet-channel.env` are gitignored or contain
  only public ids (add them to `.gitignore` if not).
- Committing contract ids, wasm hashes, Testnet account **public** addresses and transaction hashes
  is correct and expected (they are public). Commit them under `deployments/` and in the README.
- Do not call any paid or third-party service, create accounts, or sign up for anything for the owner.

## Git rules

- Work on `main`. Make small commits, one logical change each, with an honest message (`fix(scripts):
  pass --source-account to stellar contract invoke`). Run the repo's full check before each commit.
- Do not backdate, squash to hide history, force-push, rewrite published history, open pull
  requests, or push tags/releases unless the owner asks. Releases are created by the owner in the GitHub UI
  with a **lowercase** tag such as `v0.1.0`, because the release workflows trigger on `v*`.
- Keep the author identity from the machine's git config. Follow any commit trailer your own tool
  requires. Never put a model name in code comments or docs.

## Workspace layout

The repos reference each other by relative path (`file:../Sideband-channels`, `../Unbound-stellar`,
`../Sideband-gateway`, ...), and several cross-repo tests are skipped when a sibling is missing. So the
sibling folder names must match the GitHub repo names exactly. Supported layouts:

```
A) one folder per project (4 repos)      B) one folder with all 12 repos
   Unbound/                                 workspace/
     Unbound-core/ Unbound-stellar/           Unbound-core/  Unbound-stellar/  Unbound-site/  Unbound-mobile/
     Unbound-site/ Unbound-mobile/            Torrent-api/   Torrent-contracts/ Torrent-indexer/ Torrent-web/
                                              Sideband-protocol/ Sideband-channels/ Sideband-gateway/ Sideband-mobile/
```

Detect with `pwd` and `ls ..`. For any sibling of **your project** that is missing, clone it next to
this repo: `git clone https://github.com/<Org>/<Repo> ../<Repo>` (orgs: `Unbound224`, `Torrent998`,
`Sideband34`). Never clone into, or modify, another project's repos unless the owner asks.
In layout B, work only on the project the owner names (or the repo you are standing in) and leave the
other projects alone.

## Tools to install first (check with `command -v`; ask the owner before installing anything global)

| Tool | Needed for | Notes |
|---|---|---|
| git, curl, jq, bash | everything | jq and curl are used by the deploy scripts |
| Node.js 22.13+ and npm | TypeScript repos | `node -v` |
| Rust stable + `rustup target add wasm32v1-none` | Soroban contracts | the old `wasm32-unknown-unknown` target is not used |
| stellar-cli 25.2 or newer (28.x recommended) | deploy and smoke scripts | see https://developers.stellar.org/docs/tools/cli/install-cli ; verify with `stellar --version` |
| Flutter stable (Dart 3.13+) | mobile repos | `flutter doctor`; Android toolchain only for APK builds |
| shellcheck | CI runs it on the scripts | optional locally |
| Playwright browsers | only for screenshots | optional |

If you build a contract with plain `cargo` (not `stellar contract build`) export
`SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1`. `stellar contract build` is the canonical way
and does the spec shaking soroban-sdk 29 expects.

## Funding and keys on Testnet

```
stellar network ls                                   # testnet should be listed; add it if not
stellar keys generate --fund <alias> --network testnet   # creates a key in the local keystore and funds it with friendbot
stellar keys address <alias>                         # PUBLIC address, safe to print and commit
```

If friendbot is rate-limited, wait and retry; do not create keys with real funds. Aliases used by the
scripts are named in each project's runbook.

## Definition of done for every phase

A phase is done only when: the commands ran on this machine, their output is recorded in
`docs/DEPLOYMENT.md` (date, command, ids/hashes, result), the repo's full check is green, the change is
committed and pushed to `main`, and CI on `main` is green (check the repo's Actions tab, or
`gh run list` if the GitHub CLI is installed).

---

## Project: Torrent (org `Torrent998`)

Torrent is a fully funded savings-circle system on Stellar. A payout right can be traded only while
the equivalent amount is actually reserved in the Soroban contract. Repos and roles:

| Repo | Role | Check command | Run for real |
|---|---|---|---|
| `Torrent-contracts` | Soroban contract `torrent-escrow` (ABI v2), bindings, deploy + smoke scripts | `./scripts/check.sh` and `./scripts/check-bindings.sh` | `scripts/deploy-testnet.sh`, `scripts/smoke-testnet.sh` |
| `Torrent-indexer` | Reads contract events from Soroban RPC into SQLite, reconciles against the chain, serves `/v1/*` | `npm run check` | `npm run build && npm start` (port 3002) |
| `Torrent-api` | Builds unsigned transaction intents, validates rules, reads via the indexer | `npm run check` | `npm run build && npm start` (port 3001) |
| `Torrent-web` | Next.js app + landing page, Freighter wallet adapter | `npm run check`, `npm run build` | `npm run dev` (port 3000) |

Data flow: web -> api (intents) -> user signs in Freighter -> Soroban RPC -> contract events -> indexer -> api -> web.
ABI v2 replaced v1 outright (v1 was never deployed). Bindings live in `Torrent-contracts/bindings/*.v2.json`
and are mirrored as fixtures in indexer and api; keep them in sync after any contract change.

### Local continuation runbook (Torrent)

**Phase 0. Verify the baseline (15 min).** In every Torrent repo run `git pull`, then the check command from
the table. All must pass before you start. Fix anything environmental (Node version, Rust target) first.

**Phase 1. Deploy the contract to Testnet (Torrent-contracts).**
1. `rustup target add wasm32v1-none`; confirm `stellar --version`.
2. `stellar keys generate --fund torrent-deployer --network testnet`.
3. `STELLAR_SOURCE_ALIAS=torrent-deployer ./scripts/deploy-testnet.sh`. It checks the RPC passphrase,
   builds, uploads and deploys the wasm with `--admin`, and writes `deployments/testnet.json`.
   The script has **never run**: expect small CLI/flag/format problems. Read the real error, fix the script,
   rerun. Optional: `TORRENT_ADMIN_ADDRESS=<G...>` to separate the admin from the deployer
   (the admin has no authority over pools).
4. `./scripts/smoke-testnet.sh`. It creates and funds `torrent-controller`, `torrent-alice`, `torrent-bob`,
   drives create_pool, join, deposit, issue_right, transfer (two signatures), claim, double-claim refusal,
   leave, close_pool and withdraw, and writes every transaction hash to `deployments/testnet-smoke.json`.
   All steps must pass. Failures that look like contract bugs: reproduce in a cargo test first, fix the
   contract, bump bindings (`bindings/*.v2.json`, golden stream), rerun all checks and mirror fixtures into
   indexer and api.
5. The CI artifact wasm is built with plain cargo and is not spec-shaken. Build once with
   `stellar contract build`, compare the sha256 with `deployments/testnet.json`, and record both. If the
   CI build recipe should change to `stellar contract build`, change `.github/workflows` accordingly and
   confirm CI is green.
6. Commit `deployments/testnet.json` and `deployments/testnet-smoke.json` (public data only). Add the
   contract id, wasm hash, deploy ledger and a Stellar Expert Testnet link
   (`https://stellar.expert/explorer/testnet/contract/<ID>`) to the README "Deployments" section and
   `docs/DEPLOYMENT.md`.

**Phase 2. Connect indexer, API and web to the deployed contract.**
1. Indexer: copy `.env.example` to `.env`, set `TORRENT_ESCROW_CONTRACT_ID` and `CHAIN_START_LEDGER`
   (the deploy ledger from `deployments/testnet.json`). Build and start. Confirm it ingests every smoke
   event, that reconciliation (`RECONCILE_EVERY_TICKS`) finds no drift, and `GET /v1/contract` shows
   status, controller and governance. Known gap: the constructor emits no event, so the admin shows
   `null` until the first admin rotation (listed in `docs/CONTRIBUTOR_ISSUES.md`; fix it in the contract and
   redeploy, or document it).
2. API: set the same contract id and `INDEXER_BASE_URL=http://localhost:3002`. Exercise the intent
   endpoints against the real chain: create an intent, sign it with a Testnet identity through
   `stellar tx sign` (or the smoke identities), submit it, and confirm the indexer reflects it. Fix any
   mismatch between the XDR the API builds and what the real network accepts (fees, footprint, auth).
3. Web: set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_STELLAR_NETWORK=testnet`,
   `NEXT_PUBLIC_STELLAR_RPC_URL`. `npm run build` must pass.
4. Record the whole run (commands, ids, hashes) in `docs/DEPLOYMENT.md` of each repo you touched, commit.

**Phase 3. Real wallet test (HUMAN needed).** Freighter is a browser extension and cannot be driven by
this agent. Prepare: start indexer, api and web locally and print a numbered click-through script for the
owner (install Freighter, switch to Testnet, fund the account through friendbot, connect, create/join a
circle, deposit, issue a right, propose and accept a transfer, claim, withdraw an offer, leave). Ask the
owner to run it and report problems or paste error text. Fix every problem found in the adapter
(`@stellar/freighter-api` 6.0.1, fail-closed design in ADR 0002) and add a regression test. Never ask the
owner to paste a seed phrase.

**Phase 4. Remaining engineering (do if time allows, in this order).** Items from
`docs/CONTRIBUTOR_ISSUES.md`: organizer signing-request flow in the API (create pool, issue right, close
pool); constructor event for the admin; consent-based rule amendments; a Playwright end-to-end suite in CI
against a local indexer/api and a mocked wallet. Each item needs tests and a CHANGELOG line.

**Phase 5.** Produce the final checklist (last section).

### Torrent specifics for the final checklist

- Landing: Vercel project from `Torrent998/Torrent-web`, Root Directory blank, framework Next.js, env
  `NEXT_PUBLIC_API_BASE_URL` = the public API URL, `NEXT_PUBLIC_STELLAR_NETWORK=testnet`,
  `NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org`.
- Backends (`Torrent-indexer`, `Torrent-api`) are long-running Node services with SQLite files: host on
  Render, Railway or Fly with a persistent disk, same env as local; the indexer starts from
  `CHAIN_START_LEDGER`.
- Torrent has no mobile app; the "Android/iOS" buttons do not apply.

---

## Final checklist for the owner (the last thing you produce)

When the runbook phases are done, write `docs/OWNER_CHECKLIST.md` in the repo you are in (and print it in
the chat). Fill every `<...>` with the real value you obtained; remove items that no longer apply; keep the
steps that only the owner can do. Start with a short **status table** (phase, done/not done, evidence link).
Say honestly which items are still unverified. Include at least these sections, in this order:

1. **What is proven and what is not.** Contract ids and Testnet links, smoke-run results, tests, CI links.
   State plainly: no audit, Testnet only, which hardware or wallet paths were or were not tested.
2. **Releases (owner, GitHub UI).** For each mobile repo: Releases -> Draft a new release -> choose tag ->
   type a **lowercase** `vX.Y.Z` and "Create new tag on publish" -> target `main` -> tick "Set as the latest
   release" -> Publish -> wait for the `release` workflow (about 10 to 15 minutes) -> open the
   `/releases/latest/download/<name>-android.apk` link on a phone to confirm it downloads.
3. **Android signing (optional).** `keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048
   -validity 10000 -alias upload`; `base64 -w0 release.jks`; add repository secrets `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` to the mobile repo. Keep the
   keystore backed up and never commit it.
4. **Vercel (landing page).** vercel.com -> sign in with GitHub, allow the org -> Add New -> Project ->
   import the repo -> set **Root Directory** exactly as in the project section above (Edit button next to
   Root Directory) -> framework Next.js -> add the environment variables for Production (project section)
   -> Deploy -> open the live URL and click every link and the download button. Then put the URL in the
   repo's Website field and the org profile. Docs: https://vercel.com/docs/monorepos
5. **Backends (if the project has one).** Create a Render, Railway or Fly service per Node service with a
   persistent disk for SQLite; paste the environment variables (generated secrets, never from the repo);
   check the health endpoint; set CORS and proxy variables to the Vercel URL; redeploy the landing page
   with the final backend URL.
6. **GitHub org and repo settings.** Per org: upload the avatar (`brand/org-avatar.png`); create a public
   `.github` repo with `profile/README.md` copied from `brand/ORG_PROFILE.md`. Per repo: Settings -> Code
   security -> enable private vulnerability reporting, Dependabot alerts and secret scanning; add topics
   (`stellar`, `soroban`, `drips-wave` plus the domain); add the website URL; pin the main repos.
7. **Drips Wave application.** Read the current maintainer steps at https://www.drips.network/wave , then:
   apply with the project's main repos; create real GitHub issues from `docs/CONTRIBUTOR_ISSUES.md` (clear
   scope, acceptance test, labels as Wave's docs require); complete any identity/KYC Drips asks for;
   describe the project truthfully using section 1.
8. **Store listings (optional, later).** Google Play developer account (one-time fee) and a signed app
   bundle; Apple Developer Program and a Mac for iOS builds. Only after a listing is live, set
   `NEXT_PUBLIC_PLAY_STORE_URL` / `NEXT_PUBLIC_APP_STORE_URL` on Vercel (https URLs on
   `play.google.com` / `apps.apple.com`) so the real badges appear. Until then the landing page correctly
   says "Coming soon" for iOS.
9. **Before Mainnet (not part of this application).** Independent security audit, a bug bounty, legal review,
   key-management plan. Do not describe the project as production-ready before this.
10. **Hand-back.** If anything in 1 to 9 fails, send the error text (never keys or seed phrases) back to a
    coding agent in this repo and tell it to read `AGENTS.md`.

Do not tick any item for the owner. Do not ask the owner for secrets: they type secrets only into
Vercel/Render/GitHub settings pages themselves.
