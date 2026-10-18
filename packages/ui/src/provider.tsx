import { CSPProvider } from "@base-ui/react/csp-provider";
import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const InteractionContext = createContext(true);
const OverlayContext = createContext<HTMLElement | null>(null);
const ReducedContext = createContext<boolean | undefined>(undefined);

export function UiProvider({
  children,
  reducedMotion,
  nonce,
}: {
  children: ReactNode;
  reducedMotion?: boolean;
  nonce?: string;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.inputModality = "keyboard";
    };
    const pointer = () => {
      document.documentElement.dataset.inputModality = "pointer";
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
      delete document.documentElement.dataset.inputModality;
    };
  }, []);
  return (
    <CSPProvider nonce={nonce}>
      <ReducedContext.Provider value={reducedMotion}>
        <MotionConfig reducedMotion={reducedMotion === true ? "always" : "user"}>
          <OverlayContext.Provider value={container}>
            {children}
            <div
              ref={setContainer}
              className="glass-workbench bt-overlay-root"
              data-glass-style="zoned"
              data-reduced-motion={reducedMotion || undefined}
            />
          </OverlayContext.Provider>
        </MotionConfig>
      </ReducedContext.Provider>
    </CSPProvider>
  );
}

export function UiInteractionProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const parent = useContext(InteractionContext);
  return <InteractionContext.Provider value={enabled && parent}>{children}</InteractionContext.Provider>;
}

export const useUiEnabled = () => useContext(InteractionContext);
export const useOverlayContainer = () => useContext(OverlayContext);
export function useUiReducedMotion() {
  const override = useContext(ReducedContext);
  const system = useReducedMotion();
  return override === true || Boolean(system);
}

export function isKeyboardInput() {
  return typeof document !== "undefined" && document.documentElement.dataset.inputModality === "keyboard";
}
