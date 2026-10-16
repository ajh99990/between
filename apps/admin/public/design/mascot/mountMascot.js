/** A neutral three-orb ambient illustration, drawn entirely with Canvas 2D. */
export function mountMascot(canvas, options = {}) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required.');
  const document = canvas.ownerDocument;
  const window = document.defaultView;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const color = options.color || '#b8e2bd';
  let paused = Boolean(options.paused), disposed = false, onScreen = true;
  let frame = 0, lastPaint = 0, phase = 0;

  function sphere(x, y, radius, depth) {
    context.save();
    context.translate(x, y);
    context.globalAlpha = depth;
    context.shadowColor = 'rgba(124, 210, 162, .17)';
    context.shadowBlur = 13;
    const body = context.createRadialGradient(-radius * .3, -radius * .4, 1, 0, 0, radius);
    body.addColorStop(0, '#e4f4d9');
    body.addColorStop(.28, color);
    body.addColorStop(.8, '#88bc9e');
    body.addColorStop(1, '#6b9e89');
    context.fillStyle = body;
    context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0;
    const sheen = context.createRadialGradient(-radius * .32, -radius * .4, 0, -radius * .32, -radius * .4, radius * .65);
    sheen.addColorStop(0, 'rgba(255, 255, 255, .48)'); sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = sheen;
    context.beginPath(); context.arc(-radius * .22, -radius * .25, radius * .6, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  function paint() {
    context.setTransform(canvas.width / 100, 0, 0, canvas.height / 100, 0, 0);
    context.clearRect(0, 0, 100, 100);
    const float = Math.sin(phase * 1.4) * 2;
    context.save();
    context.translate(50, 79);
    context.scale(1, .22);
    const shadow = context.createRadialGradient(0, 0, 1, 0, 0, 34);
    shadow.addColorStop(0, 'rgba(122, 208, 163, .18)'); shadow.addColorStop(1, 'rgba(122, 208, 163, 0)');
    context.fillStyle = shadow; context.beginPath(); context.arc(0, 0, 34, 0, Math.PI * 2); context.fill();
    context.restore();
    sphere(63 + Math.sin(phase * .8) * 1.6, 46 - float, 15, .83);
    sphere(32 - Math.sin(phase * .8) * 1.6, 51 + float * .55, 18, .94);
    sphere(52, 57 + float, 22, 1);
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round((bounds.height || bounds.width) * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    paint();
  }
  function stop() { if (frame) window.cancelAnimationFrame(frame); frame = 0; lastPaint = 0; }
  function tick(now) {
    frame = 0;
    if (disposed || paused || preference.matches || document.hidden || !onScreen) return;
    if (!lastPaint) lastPaint = now;
    const elapsed = now - lastPaint;
    if (elapsed >= 1000 / 24) { phase += Math.min(elapsed, 100) / 1000; lastPaint = now; paint(); }
    frame = window.requestAnimationFrame(tick);
  }
  function sync() {
    if (disposed || paused || preference.matches || document.hidden || !onScreen) stop();
    else if (!frame) frame = window.requestAnimationFrame(tick);
  }
  const resizeObserver = new window.ResizeObserver(resize);
  const intersectionObserver = new window.IntersectionObserver(entries => { onScreen = entries[0]?.isIntersecting ?? false; sync(); });
  resizeObserver.observe(canvas); intersectionObserver.observe(canvas);
  preference.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
  resize(); sync();
  return {
    setPaused(value) { paused = Boolean(value); sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; stop(); resizeObserver.disconnect(); intersectionObserver.disconnect();
      preference.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
    }
  };
}
