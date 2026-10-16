const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
const inputPolicies = new WeakMap();

export function trackMotionInput(doc) {
  let policy = inputPolicies.get(doc);
  if (!policy) {
    policy = { keyboard: false, users: 0 };
    policy.pointer = () => { policy.keyboard = false; };
    policy.key = event => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) policy.keyboard = true; };
    doc.addEventListener('pointerdown', policy.pointer, true);
    doc.addEventListener('keydown', policy.key, true);
    inputPolicies.set(doc, policy);
  }
  policy.users++;
  let disposed = false;
  return {
    isKeyboard: () => policy.keyboard,
    destroy() {
      if (disposed) return;
      disposed = true;
      if (--policy.users) return;
      doc.removeEventListener('pointerdown', policy.pointer, true);
      doc.removeEventListener('keydown', policy.key, true);
      inputPolicies.delete(doc);
    },
  };
}

export function createSurfaceMotion({ surface, foregrounds = () => [], moveSurface = true, fadeSurface = false, fadeDecorations = false, distance = 6, axis = 'y', enterDuration = 210, exitDuration = 150 }) {
  const view = surface.ownerDocument.defaultView;
  const reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const opacity = new WeakMap();
  let state = 'closed', desired = false, disposed = false, revision = 0, animations = [];
  let baseTransform = null, baseDecorations = null, finish = null;
  const read = node => view.getComputedStyle(node);
  const setState = next => { state = next; surface.dataset.motionState = next; };
  const cancel = () => { for (const animation of animations) animation.cancel(); animations = []; };
  const settle = (open, current) => {
    if (disposed || current !== revision) return;
    setState(open ? 'open' : 'closed');
    const callback = finish;
    finish = null;
    cancel();
    callback?.();
  };
  function set(open, { immediate = false, onFinish } = {}) {
    if (disposed) return;
    if (desired === open && (state === 'entering' || state === 'exiting')) {
      if (!immediate) return;
    } else if (desired === open && state === (open ? 'open' : 'closed')) {
      onFinish?.();
      return;
    }
    const fromClosed = state === 'closed';
    desired = open;
    const current = ++revision;
    const nodes = [...new Set(foregrounds())].filter(node => node && (fadeSurface || node !== surface));
    if (baseTransform === null) baseTransform = read(surface).transform || 'none';
    const offset = typeof distance === 'function' ? distance() : distance;
    const shift = reduced?.matches ? 0 : offset;
    const closedTransform = `${baseTransform === 'none' ? '' : `${baseTransform} `}translate${axis.toUpperCase()}(${shift}px)`;
    const surfaceFrom = fromClosed ? closedTransform : read(surface).transform || baseTransform;
    const frames = nodes.map(node => {
      if (!opacity.has(node)) opacity.set(node, read(node).opacity || '1');
      return { node, from: fromClosed ? '0' : read(node).opacity, to: open ? opacity.get(node) : '0' };
    });
    let decorationFrames;
    if (fadeDecorations) {
      const style = read(surface);
      baseDecorations ||= { borderColor: style.borderColor, boxShadow: style.boxShadow };
      const clear = { borderColor: 'transparent', boxShadow: baseDecorations.boxShadow.replace(/rgba?\([^)]*\)/g, 'transparent') };
      decorationFrames = [fromClosed ? clear : { borderColor: style.borderColor, boxShadow: style.boxShadow }, open ? baseDecorations : clear];
    }
    cancel();
    finish = onFinish;
    setState(open ? 'entering' : 'exiting');
    if (immediate || typeof surface.animate !== 'function') { settle(open, current); return; }
    const duration = reduced?.matches ? 60 : open ? enterDuration : exitDuration;
    const easing = read(surface).getPropertyValue('--bt-motion-ease-out').trim() || easeOut;
    const options = { duration, easing, fill: 'both' };
    if (moveSurface && !reduced?.matches) animations.push(surface.animate([{ transform: surfaceFrom }, { transform: open ? baseTransform : closedTransform }], options));
    if (decorationFrames) animations.push(surface.animate(decorationFrames, options));
    for (const frame of frames) {
      if (typeof frame.node.animate === 'function') animations.push(frame.node.animate([{ opacity: frame.from }, { opacity: frame.to }], options));
    }
    if (!animations.length) { settle(open, current); return; }
    Promise.all(animations.map(animation => animation.finished.catch(() => null))).then(() => settle(open, current));
  }
  const onReduced = () => { if (state === 'entering' || state === 'exiting') set(desired, { immediate: true, onFinish: finish }); };
  reduced?.addEventListener?.('change', onReduced);
  setState('closed');
  return {
    set,
    get state() { return state; },
    destroy() {
      if (disposed) return;
      disposed = true;
      revision++;
      finish = null;
      cancel();
      reduced?.removeEventListener?.('change', onReduced);
      setState('closed');
    },
  };
}
