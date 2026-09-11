/**
 * Shared adaptive polling helper.
 *
 * Purpose: cut database load without changing any feature behaviour.
 * - Pauses completely while the browser tab is hidden.
 * - Starts at `baseMs` and slows down towards `maxMs` while nothing changes.
 * - Resets back to `baseMs` as soon as the caller reports a change.
 *
 * Usage:
 *   const stop = startAdaptivePoll(async () => { const changed = await load(); return changed; },
 *     { baseMs: 3000, maxMs: 15000 });
 *   return stop;
 */
export type AdaptivePollOptions = {
  baseMs?: number;
  maxMs?: number;
  /** Multiplier applied every time the tick reports "no change". */
  factor?: number;
  /** Run immediately on start (default true). */
  immediate?: boolean;
  /** Pause while the tab is hidden (default true). */
  pauseWhenHidden?: boolean;
};

/**
 * The tick may return:
 *  - `true`  => something changed, reset the interval to baseMs
 *  - `false` => nothing changed, slow down
 *  - `"stop"` => terminal state reached, stop polling entirely
 *  - `void`  => treated as "changed" (safe default)
 */
export type AdaptiveTick = () => Promise<boolean | "stop" | void> | boolean | "stop" | void;

export function startAdaptivePoll(tick: AdaptiveTick, options: AdaptivePollOptions = {}): () => void {
  const baseMs = Math.max(500, options.baseMs ?? 5000);
  const maxMs = Math.max(baseMs, options.maxMs ?? Math.max(baseMs * 5, 30_000));
  const factor = options.factor ?? 1.6;
  const pauseWhenHidden = options.pauseWhenHidden !== false;

  let delay = baseMs;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  const isHidden = () => pauseWhenHidden && typeof document !== "undefined" && document.visibilityState === "hidden";

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  const run = async () => {
    if (stopped || running) return;
    if (isHidden()) {
      // Do not touch the database while nobody is looking; re-check shortly.
      schedule(Math.min(maxMs, 5000));
      return;
    }
    running = true;
    try {
      const result = await tick();
      if (result === "stop") {
        stop();
        return;
      }
      delay = result === false ? Math.min(maxMs, Math.round(delay * factor)) : baseMs;
    } catch {
      // Back off on failures too, so an error loop cannot hammer the database.
      delay = Math.min(maxMs, Math.round(delay * factor));
    } finally {
      running = false;
    }
    schedule(delay);
  };

  const onVisible = () => {
    if (stopped) return;
    if (document.visibilityState === "visible") {
      delay = baseMs;
      schedule(0);
    }
  };

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };

  if (typeof document !== "undefined" && pauseWhenHidden) {
    document.addEventListener("visibilitychange", onVisible);
  }

  schedule(options.immediate === false ? baseMs : 0);
  return stop;
}
