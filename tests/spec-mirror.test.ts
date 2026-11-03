import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_SPECS } from "../src/ledger/spec.js";

interface MirrorEvent { name: string; topics: string[]; data: Record<string, string> }
const mirror = JSON.parse(readFileSync(new URL("../fixtures/contract-events.v2.json", import.meta.url), "utf8")) as {
  abiVersion: number;
  events: MirrorEvent[];
};

describe("decoder table == mirrored torrent-contracts bindings/events.v2.json", () => {
  it("has the same events, topics and typed fields", () => {
    expect(mirror.abiVersion).toBe(2);
    expect(Object.keys(EVENT_SPECS).sort()).toEqual(mirror.events.map((e) => e.name).sort());
    for (const e of mirror.events) {
      const s = EVENT_SPECS[e.name as keyof typeof EVENT_SPECS];
      expect(s.topics, e.name).toEqual(e.topics);
      expect(s.data, e.name).toEqual(e.data);
    }
  });
});
