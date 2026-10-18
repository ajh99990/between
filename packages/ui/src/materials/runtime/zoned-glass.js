/** Mix sharp and frosted samples after applying the same displacement field. */
const NS = 'http://www.w3.org/2000/svg';
let serial = 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
function distance(x, y, width, height, radius) {
  const dx = Math.abs(x - width / 2) - width / 2 + radius;
  const dy = Math.abs(y - height / 2) - height / 2 + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

export function mountZonedGlass(surface, options = {}) {
  const document = surface.ownerDocument;
  const window = document.defaultView;
  const settings = { blur: 2, strength: 14, edge: 20, clearOnly: false, ...options };
  const preference = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const previous = [surface.style.backdropFilter, surface.style.webkitBackdropFilter];
  const make = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const id = `gw-zoned-${++serial}`;
  const host = make('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
  host.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden';
  const filter = make('filter', { id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  host.append(filter); document.body.append(host);
  let frame = 0, disposed = false;
  const restore = () => { [surface.style.backdropFilter, surface.style.webkitBackdropFilter] = previous; };
  function render() {
    frame = 0;
    if (disposed) return;
    if (preference.matches) { restore(); return; }
    const bounds = surface.getBoundingClientRect();
    const width = Math.round(bounds.width), height = Math.round(bounds.height);
    if (width < 2 || height < 2) { restore(); return; }
    const cssRadius = parseFloat(window.getComputedStyle(surface).borderTopLeftRadius);
    const radius = clamp(Number.isFinite(cssRadius) ? cssRadius : 18, 0, Math.min(width, height) / 2);
    const edge = Math.max(1, settings.edge);
    const canvas = document.createElement('canvas');
    const mapWidth = Math.min(width, 384), mapHeight = Math.min(height, 1024);
    canvas.width = mapWidth; canvas.height = mapHeight;
    const context = canvas.getContext('2d');
    if (!context) { restore(); return; }
    const map = context.createImageData(mapWidth, mapHeight);
    const mask = context.createImageData(mapWidth, mapHeight);
    const sdf = (x, y) => distance(x, y, width, height, radius);
    for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
      const px = (x + .5) * width / mapWidth, py = (y + .5) * height / mapHeight;
      const inset = Math.max(0, -sdf(px, py));
      const weight = 1 - smooth(inset / edge);
      const nx = sdf(px + .5, py) - sdf(px - .5, py);
      const ny = sdf(px, py + .5) - sdf(px, py - .5);
      const length = Math.hypot(nx, ny) || 1, i = (y * mapWidth + x) * 4;
      map.data[i] = Math.round((.5 - .5 * nx / length * weight) * 255);
      map.data[i + 1] = Math.round((.5 - .5 * ny / length * weight) * 255);
      map.data[i + 2] = 128; map.data[i + 3] = 255;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255;
      mask.data[i + 3] = Math.round(smooth((inset - 3) / Math.min(22, edge * .55)) * 255);
    }
    context.putImageData(map, 0, 0); const mapURL = canvas.toDataURL();
    context.putImageData(mask, 0, 0); const maskURL = canvas.toDataURL();
    canvas.width = canvas.height = 0;
    filter.replaceChildren();
    const padding = Math.ceil(settings.strength + Math.max(settings.blur, .3) * 3 + 8);
    for (const [name, value] of Object.entries({ x: -padding, y: -padding, width: width + padding * 2, height: height + padding * 2 })) filter.setAttribute(name, String(value));
    const image = (href, result) => make('feImage', { href, x: 0, y: 0, width, height, result, preserveAspectRatio: 'none' });
    filter.append(image(mapURL, 'displacement'));
    filter.append(make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: settings.clearOnly ? .3 : settings.blur, result: 'softBackdrop', edgeMode: 'duplicate' }));
    filter.append(make('feDisplacementMap', { in: 'softBackdrop', in2: 'displacement', scale: settings.strength * 2, xChannelSelector: 'R', yChannelSelector: 'G', result: 'softRefracted' }));
    if (!settings.clearOnly) {
      filter.append(make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: .3, result: 'clearBackdrop', edgeMode: 'duplicate' }));
      filter.append(make('feDisplacementMap', { in: 'clearBackdrop', in2: 'displacement', scale: settings.strength * 2, xChannelSelector: 'R', yChannelSelector: 'G', result: 'clearRefracted' }));
      filter.append(image(maskURL, 'frostMask'));
      filter.append(make('feComposite', { in: 'softRefracted', in2: 'frostMask', operator: 'in', result: 'center' }));
      filter.append(make('feComposite', { in: 'clearRefracted', in2: 'frostMask', operator: 'out', result: 'rim' }));
      filter.append(make('feComposite', { in: 'center', in2: 'rim', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'mixed' }));
    }
    filter.append(make('feColorMatrix', { in: settings.clearOnly ? 'softRefracted' : 'mixed', type: 'saturate', values: 1.18 }));
    surface.style.backdropFilter = surface.style.webkitBackdropFilter = `url(#${id})`;
  }
  function refresh() { if (!frame && !disposed) frame = window.requestAnimationFrame(render); }
  const observer = new window.ResizeObserver(refresh);
  observer.observe(surface); preference.addEventListener('change', refresh); refresh();
  return {
    refresh,
    destroy() {
      if (disposed) return;
      disposed = true; observer.disconnect(); preference.removeEventListener('change', refresh);
      if (frame) window.cancelAnimationFrame(frame);
      restore(); host.remove();
    }
  };
}
