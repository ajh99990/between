import { type HTMLAttributes, type ReactNode, type Ref, useLayoutEffect, useRef } from "react";
import { DIALOG_PRESET } from "./runtime/material-presets.js";
import { mountZonedGlass } from "./runtime/zoned-glass.js";

export { DIALOG_PRESET };
export const NAVIGATION_PRESET = Object.freeze({
  blur: 2,
  strength: 14,
  edge: 20,
  tint: "#667585",
  opacity: 0.24,
});

export interface GlassProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "aside" | "header" | "section";
  preset?: "navigation" | "dialog";
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Glass({
  as = "div",
  preset = "navigation",
  className = "",
  children,
  style,
  ref,
  ...props
}: GlassProps) {
  const material = useRef<HTMLDivElement>(null);
  const optics = preset === "dialog" ? DIALOG_PRESET.glass : NAVIGATION_PRESET;
  useLayoutEffect(() => {
    if (!material.current) return;
    const controller = mountZonedGlass(material.current, {
      blur: optics.blur,
      strength: optics.strength,
      edge: optics.edge,
    });
    return () => controller.destroy();
  }, [optics]);
  const rgb = [1, 3, 5].map((i) => Number.parseInt(optics.tint.slice(i, i + 2), 16));
  const Component = as;
  return (
    <Component
      {...props}
      ref={ref as Ref<HTMLDivElement>}
      className={`gw-glass gw-component-glass ${className}`}
      data-glass-mode="zoned"
      data-material={preset}
      style={
        {
          "--gw-glass-tint": `rgb(${rgb.join(" ")} / ${optics.opacity * 100}%)`,
          "--gw-glass-blur": `${optics.blur}px`,
          ...style,
        } as React.CSSProperties
      }
    >
      <div ref={material} className="gw-glass-backdrop" aria-hidden="true" />
      {children}
    </Component>
  );
}
