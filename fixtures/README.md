# Fixtures

`contract-events.v1.json`, `contract-scenario.v1.json` and `contract-stream.v1.json` (real events, base64 XDR, emitted by the contract in its test host) are **mirrored copies** of
`torrent-contracts/bindings/*.v1.json` at commit `6b2bd11` (ABI v1). They are the versioned
handshake with the contracts repo. A test (`tests/spec-mirror.test.ts`) fails if the decoder's
built-in event table drifts from `contract-events.v1.json`. Update by copying, never by hand.
