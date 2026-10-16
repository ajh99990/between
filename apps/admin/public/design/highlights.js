/** Pointer-local reflection for .gw-lens-button. Returns an unmount function. */
export function mountLensReflections(root = globalThis.document) {
  if (!root?.addEventListener) throw new TypeError('A DOM event root is required.');
  const document = root.nodeType === 9 ? root : root.ownerDocument;
  const preference = document.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  const clear = element => {
    element.style.removeProperty('--lens-x');
    element.style.removeProperty('--lens-y');
    active.delete(element);
  };
  const clearAll = () => { for (const element of [...active]) clear(element); };
  const locate = target => {
    const element = target?.closest?.('.gw-lens-button');
    return element && (element === root || root.contains(element)) ? element : null;
  };
  const move = event => {
    const element = locate(event.target);
    if (!element) return;
    if (preference.matches || element.disabled || element.getAttribute('aria-disabled') === 'true') { clear(element); return; }
    const bounds = element.getBoundingClientRect();
    element.style.setProperty('--lens-x', `${event.clientX - bounds.x}px`);
    element.style.setProperty('--lens-y', `${event.clientY - bounds.y}px`);
    active.add(element);
  };
  const leave = event => {
    const element = locate(event.target);
    if (element && !element.contains(event.relatedTarget)) clear(element);
  };
  const cancel = event => { const element = locate(event.target); if (element) clear(element); };
  for (const [name, listener] of [['pointermove', move], ['pointerout', leave], ['pointercancel', cancel]]) root.addEventListener(name, listener, { passive: true });
  preference.addEventListener('change', clearAll);
  return () => {
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerout', leave);
    root.removeEventListener('pointercancel', cancel);
    preference.removeEventListener('change', clearAll);
    clearAll();
  };
}
