import { animate, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import "./reader-motion.css";

/** A short state cue on the new document; never retain the previous private text. */
export function useReaderTransition(identity: string) {
  const target = useRef<HTMLDivElement>(null);
  const previous = useRef({ identity, node: null as HTMLDivElement | null });
  const running = useRef<ReturnType<typeof animate> | null>(null);
  const keyboardInitiated = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const onKeyDown = () => {
      keyboardInitiated.current = true;
    };
    const onPointerDown = () => {
      keyboardInitiated.current = false;
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  useLayoutEffect(() => {
    const node = target.current;
    const changed = previous.current.identity !== identity;
    const sameNode = previous.current.node === node;
    previous.current = { identity, node };
    if (!node) return;

    if (reducedMotion || keyboardInitiated.current) {
      running.current?.stop();
      running.current = null;
      node.style.removeProperty("opacity");
      return;
    }
    // First mount belongs to the containing page. Keystrokes, search and data
    // refreshes keep the same identity, so the text never flashes while editing.
    if (!changed || !sameNode) return;
    // A fast second selection keeps the current fade, rather than flashing back
    // to its beginning. The actual document has already switched synchronously.
    if (running.current) return;
    const animation = animate(
      node,
      { opacity: [0.84, 1] },
      {
        duration: 0.12,
        ease: [0.23, 1, 0.32, 1],
      },
    );
    running.current = animation;
    void animation.then(() => {
      if (running.current !== animation) return;
      running.current = null;
      node.style.removeProperty("opacity");
    });
  }, [identity, reducedMotion]);

  useEffect(
    () => () => {
      running.current?.stop();
      running.current = null;
      target.current?.style.removeProperty("opacity");
    },
    [],
  );

  return target;
}

/** Native scrolling is also an animation and must honour the same preference. */
export function readerScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
