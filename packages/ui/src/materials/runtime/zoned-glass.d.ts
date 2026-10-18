export interface ZonedGlassOptions {
  blur?: number;
  strength?: number;
  edge?: number;
  clearOnly?: boolean;
}
export function mountZonedGlass(
  surface: HTMLElement,
  options?: ZonedGlassOptions,
): { refresh: () => void; destroy: () => void };
