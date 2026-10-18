export interface SurfaceMotionOptions {
  surface: HTMLElement;
  foregrounds?: () => (HTMLElement | null)[];
  fadeSurface?: boolean;
  fadeDecorations?: boolean;
  enterDuration?: number;
  exitDuration?: number;
}

export type SurfaceMotionState = "closed" | "entering" | "open" | "exiting";

export interface SurfaceMotion {
  readonly state: SurfaceMotionState;
  set(open: boolean, options?: { immediate?: boolean; reduced?: boolean; onFinish?: () => void }): void;
  destroy(): void;
}

export function blockOverlayExitScroll(document: Document) {
  const prevent = (event: Event) => event.preventDefault();
  const options = { capture: true, passive: false };
  document.addEventListener("wheel", prevent, options);
  document.addEventListener("touchmove", prevent, options);
  return () => {
    document.removeEventListener("wheel", prevent, options);
    document.removeEventListener("touchmove", prevent, options);
  };
}

export function createOverlayMotion({
  surface,
  foregrounds = () => [],
  fadeSurface = false,
  fadeDecorations = false,
  enterDuration = 210,
  exitDuration = 150,
}: SurfaceMotionOptions): SurfaceMotion {
  const view = surface.ownerDocument.defaultView;
  const opacity = new WeakMap<HTMLElement, string>();
  let state: SurfaceMotionState = "closed";
  let desired = false;
  let disposed = false;
  let revision = 0;
  let animations: Animation[] = [];
  let decorations: { borderColor: string; boxShadow: string } | undefined;
  const read = (node: HTMLElement) => view?.getComputedStyle(node) ?? node.style;
  const mark = (next: SurfaceMotionState) => {
    state = next;
    surface.dataset.motionState = next;
  };
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  return {
    get state() {
      return state;
    },
    set(open, { immediate = false, reduced = false, onFinish } = {}) {
      if (disposed) return;
      if (desired === open && state === (open ? "open" : "closed")) {
        onFinish?.();
        return;
      }
      desired = open;
      const current = ++revision;
      const fromClosed = state === "closed";
      const nodes = [...new Set([...(fadeSurface ? [surface] : []), ...foregrounds()])].filter(
        (node): node is HTMLElement => node !== null && (fadeSurface || node !== surface),
      );
      const frames = nodes.map((node) => {
        if (!opacity.has(node)) opacity.set(node, read(node).opacity || "1");
        return {
          node,
          from: fromClosed ? "0" : read(node).opacity,
          to: open ? opacity.get(node) || "1" : "0",
        };
      });
      let decorationFrames: Keyframe[] | undefined;
      if (fadeDecorations) {
        const style = read(surface);
        decorations ??= {
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
        };
        const clear = {
          borderColor: "transparent",
          boxShadow: decorations.boxShadow.replace(/rgba?\([^)]*\)/g, "transparent"),
        };
        decorationFrames = [
          fromClosed ? clear : { borderColor: style.borderColor, boxShadow: style.boxShadow },
          open ? decorations : clear,
        ];
      }
      cancel();
      mark(open ? "entering" : "exiting");
      const finish = () => {
        if (disposed || current !== revision) return;
        mark(open ? "open" : "closed");
        cancel();
        onFinish?.();
      };
      if (immediate || typeof surface.animate !== "function") {
        finish();
        return;
      }
      const options: KeyframeAnimationOptions = {
        duration: reduced ? 60 : open ? enterDuration : exitDuration,
        easing: "cubic-bezier(.23,1,.32,1)",
        fill: "both",
      };
      if (decorationFrames) animations.push(surface.animate(decorationFrames, options));
      for (const frame of frames)
        if (typeof frame.node.animate === "function")
          animations.push(frame.node.animate([{ opacity: frame.from }, { opacity: frame.to }], options));
      if (!animations.length) {
        finish();
        return;
      }
      void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(finish);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      revision++;
      cancel();
      mark("closed");
    },
  };
}
