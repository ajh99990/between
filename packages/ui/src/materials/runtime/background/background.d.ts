export interface BackgroundProps {
  element?: HTMLElement;
  preset?: string;
  motion?: boolean;
  intensity?: number;
}
export interface AmbientController {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  update: (next?: BackgroundProps) => void;
  seek: (seconds: number) => void;
  getState: () => {
    preset: string;
    elapsed: number;
    playing: boolean;
    reducedMotion: boolean;
    frames: number;
    width: number;
    height: number;
    dpr: number;
    disposed: boolean;
    pendingFrame: boolean;
  };
  destroy: () => void;
}
export const PRESETS: readonly { id: string; label: string }[];
export function createAmbientBackground(props?: BackgroundProps): AmbientController;
