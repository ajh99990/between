import { useLayoutEffect, useRef } from "react";
import { useUiReducedMotion } from "../provider";
import { createAmbientBackground, PRESETS } from "./runtime/background/background.js";

export const BACKGROUND_PRESETS: readonly { id: string; label: string }[] = PRESETS as readonly {
  id: string;
  label: string;
}[];

export function AmbientBackground({
  preset = "ribbon",
  motion = false,
  intensity = 0.8,
  className = "",
}: {
  preset?: string;
  motion?: boolean;
  intensity?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useUiReducedMotion();
  const running = motion && !reduced;
  const controller = useRef<ReturnType<typeof createAmbientBackground> | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    const instance = createAmbientBackground({ element: host.current, preset, motion: running, intensity });
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    controller.current?.update({ preset, motion: running, intensity });
  }, [preset, running, intensity]);
  return <div ref={host} className={`bt-ambient ${className}`} />;
}
