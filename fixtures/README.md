# Fixtures

`contract-events.v2.json`, `contract-scenario.v2.json` and `contract-stream.v2.json` (real events, base64 XDR,
emitted by the contract in its test host) are **mirrored copies** of `torrent-contracts/bindings/*.v2.json` at
commit `c83e23e` (ABI v2). They are the versioned handshake with the contracts repo. A test
(`tests/spec-mirror.test.ts`) fails if the decoder's built-in event table drifts from `contract-events.v2.json`.
Update by copying, never by hand.

The stream records every v2 event except `contract_upgraded` (executing an upgrade needs real wasm bytes);
`tests/decode.test.ts` builds that one event with the Stellar SDK in exactly the shape `events.v2.json` defines.
