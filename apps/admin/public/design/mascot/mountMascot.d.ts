export type MascotOptions = { color?: string; ink?: string; paused?: boolean };
export declare function mountMascot(canvas: HTMLCanvasElement, options?: MascotOptions): {
  setPaused(value: boolean): void;
  dispose(): void;
};
