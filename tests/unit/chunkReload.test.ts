import { describe, expect, it } from "vitest";
import { shouldAutoReloadForChunkError } from "../../src/lib/chunkReload";

const origin = "https://modrekplus.com";

describe("automatic reload after a failed code download", () => {
  it("never reloads while a live class is on screen", () => {
    expect(shouldAutoReloadForChunkError({
      message: `Failed to fetch dynamically imported module: ${origin}/assets/a.js`,
      liveClassOpen: true,
      appOrigin: origin,
    })).toBe(false);
  });

  it("ignores Zoom's own chunk failures", () => {
    expect(shouldAutoReloadForChunkError({
      message: "Loading chunk 512 failed.\n(error: https://source.zoom.us/6.2.0/lib/av/x.js)",
      errorName: "ChunkLoadError",
      liveClassOpen: false,
      appOrigin: origin,
    })).toBe(false);
  });

  it("still recovers from our own stale deploy files", () => {
    expect(shouldAutoReloadForChunkError({
      message: `Failed to fetch dynamically imported module: ${origin}/assets/a.js`,
      liveClassOpen: false,
      appOrigin: origin,
    })).toBe(true);
  });
});
