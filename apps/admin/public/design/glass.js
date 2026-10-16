const NS = 'http://www.w3.org/2000/svg';
let instanceId = 0;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function node(document, name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function roundedRectDistance(x, y, width, height, radius) {
  const qx = Math.abs(x - width / 2) - width / 2 + radius;
  const qy = Math.abs(y - height / 2) - height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}


export function mountGlassRefraction(surface, options = {}) {
  if (!surface) return { destroy() {}, refresh() {} };
  const document = surface.ownerDocument;
  const win = document.defaultView;
  const settings = { edge: 64, strength: 28, radius: 14, mapMaxWidth: 384, mapMaxHeight: 1024,
    rimBlur: .25,
    enabled: true, ...options };
  const media = win.matchMedia('(prefers-reduced-transparency: reduce)');
  const cssSupported = win.CSS?.supports('backdrop-filter', 'url("#gw-probe")') ||
    win.CSS?.supports('-webkit-backdrop-filter', 'url("#gw-probe")');
  const id = `gw-glass-refraction-${++instanceId}`;
  const svg = node(document, 'svg', { width: 0, height: 0, 'aria-hidden': 'true' });
  svg.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;overflow:hidden';
  const defs = node(document, 'defs');
  const filter = node(document, 'filter', { id, filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  const map = node(document, 'feImage', { result: 'map', preserveAspectRatio: 'none' });
  const displace = node(document, 'feDisplacementMap', { in: 'SourceGraphic', in2: 'map',
    scale: settings.strength * 2, xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted' });
  // The displacement field itself eases to zero in the interior.
  // Do not crossfade an undisplaced image over this image: that causes ghost text.
  filter.append(map, displace,
    node(document, 'feGaussianBlur', { in: 'refracted', stdDeviation: settings.rimBlur }));
  defs.append(filter); svg.append(defs); document.body.append(svg);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  let destroyed = false, frame = 0, previousSize = '';
  const oldRefraction = surface.style.getPropertyValue('--gw-glass-refraction');
  const oldBlur = surface.style.getPropertyValue('--gw-glass-filter-blur');
  const resetProperty = (name, previous) => previous ? surface.style.setProperty(name, previous) : surface.style.removeProperty(name);
  const disable = () => {
    resetProperty('--gw-glass-refraction', oldRefraction);
    resetProperty('--gw-glass-filter-blur', oldBlur);
    surface.dataset.refractionMode = 'fallback';
  };
  function render() {
    frame = 0;
    if (destroyed) return;
    if (!settings.enabled || settings.strength <= 0 || media.matches || !cssSupported || !context) { disable(); return; }
    const rect = surface.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (width < 2 || height < 2) { disable(); return; }
    const key = `${width}x${height}`;
    if (key !== previousSize) {
      previousSize = key;
      const w = Math.min(width, settings.mapMaxWidth), h = Math.min(height, settings.mapMaxHeight);
      canvas.width = w; canvas.height = h;
      const image = context.createImageData(w, h);
      const radius = Math.min(settings.radius, width / 2, height / 2);
      const distance = (x, y) => roundedRectDistance(x, y, width, height, radius);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = (x + .5) * width / w, py = (y + .5) * height / h;
        const inside = Math.max(0, -distance(px, py));
        const edgeFactor = 1 - smooth(inside / settings.edge);
        const gx = distance(px + .5, py) - distance(px - .5, py);
        const gy = distance(px, py + .5) - distance(px, py - .5);
        const length = Math.hypot(gx, gy) || 1;
        // Sample inward at the rim; preserve the center. scale=2*strength.
        const dx = -gx / length * edgeFactor, dy = -gy / length * edgeFactor;
        const i = (y * w + x) * 4;
        image.data[i] = Math.round((.5 + dx * .5) * 255);
        image.data[i + 1] = Math.round((.5 + dy * .5) * 255);
        image.data[i + 2] = 128; image.data[i + 3] = 255;

      }
      filter.setAttribute('x', '0'); filter.setAttribute('y', '0');
      filter.setAttribute('width', width); filter.setAttribute('height', height);
      for (const imageNode of [map]) {
        imageNode.setAttribute('x', '0'); imageNode.setAttribute('y', '0');
        imageNode.setAttribute('width', width); imageNode.setAttribute('height', height);
      }
      context.putImageData(image, 0, 0); map.setAttribute('href', canvas.toDataURL());
    }
    surface.style.setProperty('--gw-glass-refraction', `url("#${id}")`);
    surface.style.setProperty('--gw-glass-filter-blur', '0px');
    surface.dataset.refractionMode = 'enhanced';
  }
  function refresh() {
    if (!frame && !destroyed) frame = win.requestAnimationFrame(render);
  }
  const observer = new win.ResizeObserver(refresh);
  observer.observe(surface);
  media.addEventListener('change', refresh);
  refresh();
  return {
    refresh,
    destroy() {
      destroyed = true; if (frame) win.cancelAnimationFrame(frame);
      observer.disconnect(); media.removeEventListener('change', refresh);
      disable(); delete surface.dataset.refractionMode; svg.remove();
      canvas.width = canvas.height = 0;
    }
  };
}
