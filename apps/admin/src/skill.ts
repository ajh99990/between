/** Adapters load the bundled, unmodified design implementation; no remote code. */
export interface Controller {
  element: HTMLElement;
  trigger?: HTMLButtonElement;
  update: (props?: Record<string, unknown>) => void;
  destroy: () => void;
}
export interface BackgroundController extends Controller {
  canvas: HTMLCanvasElement;
  getState: () => Record<string, unknown>;
}
type Module = Record<string, (...args: any[]) => any>;
const modules = new Map<string, Promise<Module>>();
export function designModule(path: string): Promise<Module> {
  const url = `/admin/design/${path}`;
  let pending = modules.get(url);
  if (!pending) {
    pending = import(/* @vite-ignore */ url);
    modules.set(url, pending);
  }
  return pending;
}
