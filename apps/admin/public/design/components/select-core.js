// A controlled, select-only combobox. Only open/active/typeahead are local state.
// update() merges props; onSelect(value) emits an intent and never writes value.
import { createSurfaceMotion, trackMotionInput } from '../surface-motion.js';

let sequence = 0;
let openSelect = null;
const SVG = 'http://www.w3.org/2000/svg';
const sameValue = (a, b) => Object.is(a, b);
const text = value => String(value ?? '');

function icon(path, className) {
  const node = document.createElementNS(SVG, 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.6');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  node.setAttribute('class', className);
  const shape = document.createElementNS(SVG, 'path');
  shape.setAttribute('d', path);
  node.append(shape);
  return node;
}

/**
 * Props: value, options:[{value,label,disabled?,hidden?}], disabled?, required?,
 * label? (field accessible name), id? (trigger id), describedBy?, invalid?,
 * className? (classes on trigger), placeholder?, onSelect?(value).
 * No hidden form input is created. The owner persists/submits the controlled value.
 */
export function createSelect(initial = {}) {
  const instance = `gw-select-${++sequence}`;
  const element = document.createElement('span');
  element.className = 'gw-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  const valueNode = document.createElement('span');
  valueNode.className = 'gw-select-value';
  trigger.append(valueNode, icon('m7 10 5 5 5-5', 'gw-select-chevron'));
  const panel = document.createElement('div');
  panel.id = `${instance}-listbox`;
  panel.className = 'gw-select-panel gw-popup';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;
  trigger.setAttribute('aria-controls', panel.id);
  element.append(trigger, panel);

  let usePopover = typeof panel.showPopover === 'function' && typeof panel.hidePopover === 'function';
  if (usePopover) panel.setAttribute('popover', 'manual');
  let props = { ...initial };
  let options = [], visible = [], rows = [];
  let active = -1, opened = false, disposed = false;
  let openEvents = null, resizeObserver = null, frame = 0;
  let typeahead = '', typeTimer = 0;
  let pointerGuard = null, pointerGuardTimer = 0;
  const input = trackMotionInput(panel.ownerDocument);
  const motion = createSurfaceMotion({
    surface: panel,
    foregrounds: () => [panel],
    moveSurface: false,
    fadeSurface: true,
    distance: () => panel.dataset.side === 'top' ? 3 : -3,
    enterDuration: 170,
    exitDuration: 120,
  });
  const localEvents = new AbortController();
  const on = (target, type, handler, settings = {}) => target.addEventListener(type, handler, { ...settings, signal: localEvents.signal });
  const setOptional = (node, name, value) => {
    if (value === undefined || value === null || value === '') node.removeAttribute(name);
    else node.setAttribute(name, String(value));
  };
  const enabled = index => index >= 0 && index < visible.length && !visible[index].disabled;
  const enabledIndices = () => visible.map((_, index) => index).filter(enabled);
  const selectedIndex = () => visible.findIndex(option => sameValue(option.value, props.value) && !option.disabled);
  const containsEvent = event => event.composedPath ? event.composedPath().includes(element) : element.contains(event.target);

  function resetTypeahead() {
    clearTimeout(typeTimer);
    typeTimer = 0;
    typeahead = '';
  }

  function clearPointerGuard() {
    pointerGuard?.abort();
    pointerGuard = null;
    clearTimeout(pointerGuardTimer);
    pointerGuardTimer = 0;
  }

  // A backdrop press dismisses this popup and consumes its pointer sequence.
  // Ordinary outside controls remain usable with the same click.
  function guardOutsidePointer(pointerId) {
    clearPointerGuard();
    pointerGuard = new AbortController();
    const settings = { capture: true, signal: pointerGuard.signal };
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    window.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      consume(event);
      pointerGuardTimer = window.setTimeout(clearPointerGuard, 100);
    }, settings);
    window.addEventListener('click', event => {
      consume(event);
      clearPointerGuard();
    }, settings);
    window.addEventListener('pointercancel', clearPointerGuard, settings);
    window.addEventListener('blur', clearPointerGuard, settings);
  }

  function ensureActiveVisible() {
    if (!opened || !rows[active]) return;
    const rowRect = rows[active].getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const padding = 6;
    if (rowRect.top < panelRect.top + padding) panel.scrollTop -= panelRect.top + padding - rowRect.top;
    else if (rowRect.bottom > panelRect.bottom - padding) panel.scrollTop += rowRect.bottom - panelRect.bottom + padding;
  }

  function paintActive(scroll = false) {
    rows.forEach((row, index) => { row.dataset.active = String(index === active); });
    if (opened && enabled(active)) trigger.setAttribute('aria-activedescendant', rows[active].id);
    else trigger.removeAttribute('aria-activedescendant');
    if (scroll) ensureActiveVisible();
  }

  function setActive(index, scroll = true) {
    active = enabled(index) ? index : -1;
    paintActive(scroll);
  }

  function positionPanel() {
    if (!opened || disposed) return;
    if (!trigger.isConnected || trigger.getClientRects().length === 0) { close({ immediate: true }); return; }
    const anchor = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const edge = 8, gap = 5;
    const leftEdge = (viewport?.offsetLeft || 0) + edge;
    const topEdge = (viewport?.offsetTop || 0) + edge;
    const rightEdge = (viewport?.offsetLeft || 0) + (viewport?.width || document.documentElement.clientWidth) - edge;
    const bottomEdge = (viewport?.offsetTop || 0) + (viewport?.height || document.documentElement.clientHeight) - edge;
    if (anchor.bottom < topEdge || anchor.top > bottomEdge || anchor.right < leftEdge || anchor.left > rightEdge) { close({ immediate: true }); return; }
    const width = Math.max(0, Math.min(Math.max(anchor.width, 132), rightEdge - leftEdge));
    panel.style.width = `${width}px`;
    const naturalHeight = Math.min(320, panel.scrollHeight + 2);
    const below = Math.max(0, bottomEdge - anchor.bottom - gap);
    const above = Math.max(0, anchor.top - topEdge - gap);
    const upward = naturalHeight > below && above > below;
    const maxHeight = Math.min(320, upward ? above : below);
    const height = Math.min(naturalHeight, maxHeight);
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - width))}px`;
    panel.style.top = `${Math.max(topEdge, Math.min(upward ? anchor.top - gap - height : anchor.bottom + gap, bottomEdge - height))}px`;
    panel.dataset.side = upward ? 'top' : 'bottom';
  }

  function schedulePosition(event) {
    if (event?.target === panel || frame || !opened) return;
    frame = window.requestAnimationFrame(() => { frame = 0; positionPanel(); ensureActiveVisible(); });
  }

  function finishClose() {
    if (usePopover) {
      try { panel.hidePopover(); } catch { /* Already closed or disconnected. */ }
    }
    panel.hidden = true;
  }

  function close({ immediate = false } = {}) {
    if (openSelect === registryEntry) openSelect = null;
    opened = false;
    openEvents?.abort();
    openEvents = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    resetTypeahead();
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.style.pointerEvents = 'none';
    delete panel.dataset.open;
    element.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    active = -1;
    rows.forEach(row => { row.dataset.active = 'false'; });
    motion.set(false, { immediate: immediate || input.isKeyboard(), onFinish: finishClose });
  }

  function open(preference = 'selected') {
    if (disposed || props.disabled || !trigger.isConnected) return;
    if (opened) return;
    openSelect?.close();
    clearPointerGuard();
    opened = true;
    openSelect = registryEntry;
    const choices = enabledIndices();
    const selected = selectedIndex();
    active = preference === 'first' ? (choices[0] ?? -1)
      : preference === 'last' ? (choices.at(-1) ?? -1)
        : selected >= 0 ? selected : preference === 'up' ? (choices.at(-1) ?? -1) : (choices[0] ?? -1);
    const wasVisible = !panel.hidden;
    panel.hidden = false;
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    panel.style.removeProperty('pointer-events');
    panel.dataset.open = 'true';
    element.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    if (usePopover && !wasVisible) {
      try { panel.showPopover(); } catch { panel.removeAttribute('popover'); usePopover = false; }
    }
    trigger.focus({ preventScroll: true });
    positionPanel();
    if (!opened) return;
    paintActive(true);
    motion.set(true, { immediate: input.isKeyboard() });
    openEvents = new AbortController();
    const settings = { capture: true, signal: openEvents.signal };
    window.addEventListener('keydown', onOpenKeydown, settings);
    window.addEventListener('pointerdown', event => {
      if (containsEvent(event)) return;
      const overlay = event.target.closest?.('.gw-admin-overlay, .gd-overlay, .app-modal-backdrop');
      const backdropPress = overlay && event.target === overlay;
      if (backdropPress) { event.preventDefault(); event.stopImmediatePropagation(); }
      const pointerId = event.pointerId;
      close();
      if (backdropPress) guardOutsidePointer(pointerId);
    }, settings);
    window.addEventListener('scroll', schedulePosition, { ...settings, passive: true });
    window.addEventListener('resize', schedulePosition, { signal: openEvents.signal, passive: true });
    window.addEventListener('blur', () => close({ immediate: true }), { signal: openEvents.signal });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedulePosition, { signal: openEvents.signal, passive: true });
      window.visualViewport.addEventListener('scroll', schedulePosition, { signal: openEvents.signal, passive: true });
    }
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(schedulePosition);
      resizeObserver.observe(trigger);
    }
  }

  function commit(index) {
    if (!enabled(index) || props.disabled || disposed) return;
    const value = visible[index].value;
    const notify = props.onSelect;
    close();
    if (typeof notify === 'function') notify(value);
  }

  function move(direction) {
    const choices = enabledIndices();
    const current = choices.indexOf(active);
    const next = current < 0 ? (direction > 0 ? 0 : choices.length - 1)
      : Math.max(0, Math.min(choices.length - 1, current + direction));
    setActive(choices[next] ?? -1);
  }

  function searchByCharacter(character) {
    clearTimeout(typeTimer);
    typeahead += character.toLocaleLowerCase();
    // Repeated letters cycle through same-initial items instead of building "aaa".
    const repeated = [...typeahead].every(letter => letter === typeahead[0]);
    const query = repeated ? typeahead[0] : typeahead;
    const choices = enabledIndices();
    const current = choices.indexOf(active);
    const start = repeated || typeahead.length === character.length ? current + 1 : Math.max(0, current);
    for (let offset = 0; offset < choices.length; offset++) {
      const index = choices[(start + offset + choices.length) % choices.length];
      if (visible[index].label.trimStart().toLocaleLowerCase().startsWith(query)) { setActive(index); break; }
    }
    typeTimer = window.setTimeout(resetTypeahead, 700);
  }

  function onOpenKeydown(event) {
    if (!opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key === 'Tab') { close(); return; }
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!containsEvent(event)) return;
    const handled = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key) || event.key.length === 1;
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { resetTypeahead(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Home' || event.key === 'End') { resetTypeahead(); const choices = enabledIndices(); setActive(event.key === 'Home' ? (choices[0] ?? -1) : (choices.at(-1) ?? -1)); }
    else if (event.key === 'Enter' || event.key === ' ') commit(active);
    else searchByCharacter(event.key);
  }

  on(trigger, 'click', event => {
    event.stopPropagation();
    if (props.disabled) return;
    if (opened) close(); else open();
  });
  on(trigger, 'keydown', event => {
    if (opened || props.disabled || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      open(event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : event.key === 'ArrowUp' ? 'up' : 'selected');
    } else if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      open();
      if (opened) searchByCharacter(event.key);
    }
  });
  on(panel, 'pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
  on(panel, 'click', event => {
    event.preventDefault();
    event.stopPropagation();
    const row = event.target.closest?.('[data-select-index]');
    if (row && row.parentNode === panel) commit(Number(row.dataset.selectIndex));
  });
  on(panel, 'pointermove', event => {
    if (event.pointerType === 'touch') return;
    const row = event.target.closest?.('[data-select-index]');
    if (row && row.parentNode === panel && enabled(Number(row.dataset.selectIndex))) setActive(Number(row.dataset.selectIndex), false);
  });
  on(element, 'focusout', event => {
    if (event.relatedTarget && element.contains(event.relatedTarget)) return;
    queueMicrotask(() => { if (!disposed && opened && !element.contains(document.activeElement)) close(); });
  });

  function update(next = {}) {
    if (disposed) return;
    const previousActive = visible[active];
    props = { ...props, ...next };
    options = (Array.isArray(props.options) ? props.options : []).map(option => ({
      value: option.value, label: text(option.label ?? option.value), disabled: Boolean(option.disabled), hidden: Boolean(option.hidden),
    }));
    visible = options.filter(option => !option.hidden);
    trigger.className = `gw-select-trigger${props.className ? ` ${text(props.className)}` : ''}`;
    trigger.id = text(props.id) || `${instance}-trigger`;
    trigger.disabled = Boolean(props.disabled);
    trigger.setAttribute('aria-expanded', String(opened && !props.disabled));
    trigger.setAttribute('aria-required', String(Boolean(props.required)));
    setOptional(trigger, 'aria-label', props.label);
    setOptional(trigger, 'aria-describedby', props.describedBy);
    setOptional(trigger, 'aria-invalid', props.invalid ? 'true' : null);
    if (props.label) { panel.setAttribute('aria-label', text(props.label)); panel.removeAttribute('aria-labelledby'); }
    else { panel.setAttribute('aria-labelledby', trigger.id); panel.removeAttribute('aria-label'); }
    const selected = options.find(option => sameValue(option.value, props.value));
    valueNode.textContent = selected ? selected.label : text(props.placeholder || '请选择');
    trigger.dataset.placeholder = String(!selected);
    rows = visible.map((option, index) => {
      const row = rows[index] || document.createElement('div');
      row.className = 'gw-select-option';
      row.id = `${instance}-option-${index}`;
      row.dataset.selectIndex = String(index);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(sameValue(option.value, props.value)));
      row.setAttribute('aria-disabled', String(option.disabled));
      const label = row.firstElementChild || document.createElement('span');
      label.className = 'gw-select-option-label';
      label.textContent = option.label;
      if (!row.firstElementChild) row.append(label, icon('m5 12 4 4L19 6', 'gw-select-check'));
      return row;
    });
    if (panel.children.length !== rows.length || rows.some((row, index) => panel.children[index] !== row)) panel.replaceChildren(...rows);
    if (props.disabled) { close({ immediate: true }); clearPointerGuard(); }
    else if (opened) {
      const preserved = previousActive ? visible.findIndex(option => sameValue(option.value, previousActive.value) && !option.disabled) : -1;
      active = preserved >= 0 ? preserved : selectedIndex() >= 0 ? selectedIndex() : (enabledIndices()[0] ?? -1);
      paintActive();
      positionPanel();
      ensureActiveVisible();
    } else paintActive();
  }

  const registryEntry = { close };
  const api = {
    element, trigger, update,
    destroy() {
      if (disposed) return;
      disposed = true;
      close({ immediate: true });
      motion.destroy();
      input.destroy();
      clearPointerGuard();
      localEvents.abort();
      element.remove();
    },
  };
  update();
  return api;
}
