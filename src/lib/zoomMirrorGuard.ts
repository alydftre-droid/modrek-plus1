/**
 * Zoom's Web SDK mirrors the FRONT camera in three different ways, depending on
 * the device and the media path it picks:
 *   - self view <video>:            inline `rotateY(180deg)`
 *   - self view player (WebRTC):    inline `matrix(-1, 0, 0, 1, 0, 0)` (DOMMatrix scale(-1,1))
 *   - every receiver of the stream: inline `scaleX(-N)` driven by the sender's
 *                                   mirror metadata, so students saw it flipped too.
 * `ZoomMtg.mirrorVideo({ mirrored:false })` only reaches the first path and is
 * re-enabled whenever the camera switches, so the teacher kept seeing (and
 * sending) a flipped picture. This guard rewrites only the horizontal flip out
 * of those inline transforms and keeps every other scale/rotation Zoom applies.
 */

const NUM = String.raw`-?\d*\.?\d+(?:e[-+]?\d+)?`;

function fixMatrix(values: number[]): number[] | null {
  if (values.length === 6) {
    const [a, b, c, d] = values;
    // Negative 2D determinant = the picture is horizontally mirrored.
    if (a * d - b * c >= 0) return null;
    return [-a, -b, c, d, values[4], values[5]];
  }
  if (values.length === 16) {
    const [m11, m12, , , m21, m22] = values;
    if (m11 * m22 - m12 * m21 >= 0) return null;
    const next = values.slice();
    // Column-major: the first four values are the x column (right-multiply by scaleX(-1)).
    for (let i = 0; i < 4; i += 1) next[i] = -next[i];
    return next;
  }
  return null;
}

/** Returns the transform without any horizontal mirroring (unchanged when not mirrored). */
export function unmirrorTransform(transform: string): string {
  if (!transform || transform === "none") return transform;
  let out = transform;
  // rotateY(180deg) / rotateY(3.14159rad) / rotateY(0.5turn)
  out = out.replace(new RegExp(String.raw`rotateY\(\s*(${NUM})\s*(deg|rad|turn|grad)?\s*\)`, "gi"), (match, raw, unit) => {
    const value = Number(raw);
    const deg = unit === "rad" ? (value * 180) / Math.PI : unit === "turn" ? value * 360 : unit === "grad" ? value * 0.9 : value;
    const normalized = ((deg % 360) + 360) % 360;
    return normalized > 90 && normalized < 270 ? "rotateY(0deg)" : match;
  });
  out = out.replace(new RegExp(String.raw`scaleX\(\s*-(${NUM})\s*\)`, "gi"), "scaleX($1)");
  out = out.replace(new RegExp(String.raw`scale\(\s*-(${NUM})\s*,\s*(${NUM})\s*\)`, "gi"), (match, x, y) =>
    Number(y) >= 0 ? `scale(${x}, ${y})` : match,
  );
  out = out.replace(/matrix(3d)?\(([^)]*)\)/gi, (match, is3d, body) => {
    const values = String(body).split(",").map((v) => Number(v.trim()));
    if (values.some((v) => !Number.isFinite(v))) return match;
    if ((is3d && values.length !== 16) || (!is3d && values.length !== 6)) return match;
    const fixed = fixMatrix(values);
    return fixed ? `matrix${is3d ? "3d" : ""}(${fixed.join(", ")})` : match;
  });
  return out;
}

const MEDIA_SELECTOR = "video, canvas, video-player, video-player-container, [class*='video-player'], [id*='video-player']";

function isZoomMedia(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.matches(MEDIA_SELECTOR)) return true;
  // Some builds flip the wrapper of the self-view video instead of the video.
  return !!el.querySelector?.("video, canvas") && !!el.closest("#zmmtg-root, video-player-container, [class*='video-player']");
}

function unmirrorElement(el: Element) {
  if (!isZoomMedia(el)) return;
  const node = el as HTMLElement;
  const current = node.style.transform;
  if (!current) return;
  const fixed = unmirrorTransform(current);
  if (fixed !== current) node.style.transform = fixed;
}

function sweep(root: ParentNode = document) {
  root.querySelectorAll?.<HTMLElement>("[style*='transform']").forEach(unmirrorElement);
}

let observer: MutationObserver | null = null;
let sweepTimer: number | null = null;

/** Keeps every Zoom video (self view and received streams) un-mirrored. */
export function startZoomMirrorGuard() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") unmirrorElement(record.target as Element);
      else record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          unmirrorElement(node);
          sweep(node);
        }
      });
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
  sweep();
  // Safety net for transforms written inside the same task as the node insert.
  sweepTimer = window.setInterval(() => sweep(), 1000);
}

export function stopZoomMirrorGuard() {
  observer?.disconnect();
  observer = null;
  if (sweepTimer !== null) window.clearInterval(sweepTimer);
  sweepTimer = null;
}
