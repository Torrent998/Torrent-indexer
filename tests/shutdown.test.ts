import { describe, expect, it, vi } from "vitest";
import { SqliteStateStore } from "../src/indexer/sqlite-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("process shutdown", () => {
  it("drains the loop and cleanly closes the SQLite store without throwing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "torrent-shutdown-"));
    const dbPath = join(dir, "indexer.db");
    const store = new SqliteStateStore(dbPath);

    let stopping = false;
    let closed = false;
    const server = { close: vi.fn() };
    const exit = vi.fn();
    const closeSpy = vi.spyOn(store, "close");

    let loopFinished = false;
    const done = (async () => {
      while (!stopping) {
        await new Promise((r) => setTimeout(r, 10));
      }
      loopFinished = true;
    })();

    const handleSignal = () => {
      if (stopping) return;
      stopping = true;
      server.close();
      void done.then(() => {
        if (!closed) {
          closed = true;
          store.close();
        }
        exit(0);
      });
    };

    // First signal initiates graceful shutdown
    handleSignal();
    expect(stopping).toBe(true);
    expect(server.close).toHaveBeenCalledTimes(1);

    // Second signal while draining is ignored (no double-close)
    expect(() => handleSignal()).not.toThrow();
    expect(server.close).toHaveBeenCalledTimes(1);

    await done;
    await new Promise((r) => setTimeout(r, 20));

    expect(loopFinished).toBe(true);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);

    // Re-issuing signal after shutdown completed does not throw or re-close
    expect(() => handleSignal()).not.toThrow();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    // Verify DB file can be cleaned up without lock errors
    rmSync(dir, { recursive: true, force: true });
  });
});
