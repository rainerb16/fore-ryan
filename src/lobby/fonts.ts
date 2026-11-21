// The lobby's 3D signs, poster and graffiti are painted once, on canvases, so
// they wait for their web fonts: painting first would keep the fallback face.
// The stylesheet loads without blocking the page, so that comes first.

interface Stylesheet extends EventTarget {
  readonly sheet: unknown;
  /** `state` is "done" once the page's own onload or onerror has run. */
  readonly dataset: { state?: string };
}

/** A frame, so a stylesheet just switched on has applied (with a fallback for hidden tabs). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const raf = globalThis.requestAnimationFrame;
    if (raf) {
      raf(() => resolve());
      setTimeout(resolve, 100);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Resolves once `link`'s stylesheet and then `faces` have loaded, or after
 * `limitMs`, whichever is first. Never rejects.
 */
export async function webFonts(
  link: Stylesheet | null,
  fonts: Pick<FontFaceSet, "load"> | undefined,
  faces: string[],
  limitMs: number,
): Promise<void> {
  if (!link || !fonts) return;
  const ready = (async () => {
    // Loaded or failed already (the module runs after the page has parsed, so
    // its events may be long gone): nothing to wait for.
    if (!link.sheet && link.dataset.state !== "done") {
      await new Promise<void>((resolve) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => resolve(), { once: true });
      });
      // Asking in the same moment it switched on could find no fonts yet.
      await nextFrame();
    }
    await Promise.all(faces.map((face) => fonts.load(face)));
  })();
  await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, limitMs))]).catch(() => undefined);
}
