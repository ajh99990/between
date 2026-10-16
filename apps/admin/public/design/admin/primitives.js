import { enhanceSelect } from '../components/select.js';
import { DIALOG_PRESET } from '../material-presets.js';
import { createGlassSurface } from '../components/ui.js';
import { createSurfaceMotion, trackMotionInput } from '../surface-motion.js';

// Presentation state belongs to the caller. Events report intent only.
// Updates shallow-merge props and preserve mounted controls and supplied Nodes.
let sequence = 0;
const text = value => value == null ? '' : String(value);
const element = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = text(value);
  return node;
};
const button = (className, label) => {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
};
const emit = (props, name, ...args) => {
  if (typeof props[name] === 'function') props[name](...args);
};
const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const setText = (node, value) => {
  const next = text(value);
  if (node.textContent !== next) node.textContent = next;
};
const setOptionalText = (node, value) => {
  setText(node, value);
  node.hidden = !text(value);
};
const listen = (node, type, handler, cleanups, options) => {
  node.addEventListener(type, handler, options);
  cleanups.push(() => node.removeEventListener(type, handler, options));
};
function controller(host, initial, render, cleanups = []) {
  let props = { ...initial };
  let disposed = false;
  const api = {
    element: host,
    update(next = {}) {
      if (disposed) return;
      props = { ...props, ...next };
      render(props);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      host.remove();
    },
  };
  api.update();
  return api;
}
function syncNodes(host, supplied) {
  const nodes = [...new Set((Array.isArray(supplied) ? supplied : [])
    .filter(node => node && typeof node.nodeType === 'number' && node !== host && !node.contains?.(host)))];
  for (const child of [...host.childNodes]) if (!nodes.includes(child)) child.remove();
  nodes.forEach((node, index) => {
    const reference = host.childNodes[index] || null;
    if (node !== reference) host.insertBefore(node, reference);
  });
}
function spinner() {
  const node = element('span', 'gw-admin-spinner');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** label, variant, size, loading, disabled, onClick(event). */
export function createButton(initial = {}) {
  const host = button('gw-admin-button');
  const progress = spinner();
  const label = element('span', 'gw-admin-button-label');
  host.append(progress, label);
  const cleanups = [];
  let props;
  listen(host, 'click', event => {
    if (!props.disabled && !props.loading) emit(props, 'onClick', event);
  }, cleanups);
  return controller(host, initial, next => {
    props = next;
    host.dataset.variant = choice(props.variant, ['primary', 'secondary', 'ghost', 'danger'], 'secondary');
    host.dataset.size = choice(props.size, ['sm', 'md'], 'md');
    host.disabled = Boolean(props.disabled || props.loading);
    host.setAttribute('aria-busy', String(Boolean(props.loading)));
    progress.hidden = !props.loading;
    setText(label, props.label);
  }, cleanups);
}

/** label and tone: neutral | success | warning | danger | info. */
export function createBadge(initial = {}) {
  const host = element('span', 'gw-admin-badge');
  const dot = element('span', 'gw-admin-badge-dot');
  dot.setAttribute('aria-hidden', 'true');
  const label = element('span', 'gw-admin-badge-label');
  host.append(dot, label);
  return controller(host, initial, props => {
    host.dataset.tone = choice(props.tone, ['neutral', 'success', 'warning', 'danger', 'info'], 'neutral');
    setText(label, props.label);
  });
}

/** value and onInput always use strings, including number and select controls.
 * Keep the same control family to preserve the exact input DOM node on update. */
export function createFormField(initial = {}) {
  const host = element('div', 'gw-admin-field');
  const id = `gw-admin-field-${++sequence}`;
  const label = element('label', 'gw-admin-field-label');
  label.htmlFor = id;
  const labelText = element('span');
  const required = element('span', 'gw-admin-required', ' *');
  required.setAttribute('aria-hidden', 'true');
  label.append(labelText, required);
  const description = element('p', 'gw-admin-field-description');
  description.id = `${id}-description`;
  const error = element('p', 'gw-admin-field-error');
  error.id = `${id}-error`;
  error.setAttribute('aria-live', 'polite');
  host.append(label, description, error);
  const cleanups = [];
  let props, control, family = '', composing = false, committedComposition = null, selectUI = null;
  let controlCleanups = [];
  const syncValue = () => {
    if (!composing && control.value !== text(props.value)) control.value = text(props.value);
  };
  const requestInput = () => {
    if (!props.disabled) emit(props, 'onInput', control.value);
    syncValue();
  };
  const replaceControl = nextFamily => {
    selectUI?.destroy(); selectUI = null;
    controlCleanups.splice(0).forEach(cleanup => cleanup());
    control?.remove();
    composing = false;
    committedComposition = null;
    control = element(nextFamily, 'gw-admin-field-control');
    control.id = id;
    listen(control, 'compositionstart', () => { composing = true; committedComposition = null; }, controlCleanups);
    listen(control, 'compositionend', () => {
      composing = false;
      committedComposition = control.value;
      requestInput();
    }, controlCleanups);
    listen(control, 'input', event => {
      if (composing || event.isComposing) return;
      if (committedComposition !== null) {
        const duplicate = control.value === committedComposition || control.value === text(props.value);
        committedComposition = null;
        if (duplicate) { syncValue(); return; }
      }
      requestInput();
    }, controlCleanups);
    host.insertBefore(control, description);
    family = nextFamily;
  };
  cleanups.push(() => { selectUI?.destroy(); selectUI = null; controlCleanups.splice(0).forEach(cleanup => cleanup()); });
  return controller(host, initial, next => {
    props = next;
    const type = choice(props.type, ['text', 'search', 'number', 'select', 'textarea'], 'text');
    const nextFamily = type === 'select' || type === 'textarea' ? type : 'input';
    if (nextFamily !== family) replaceControl(nextFamily);
    if (nextFamily === 'input') control.type = type;
    setText(labelText, props.label);
    required.hidden = !props.required;
    setOptionalText(description, props.description);
    setOptionalText(error, props.error);
    if (nextFamily === 'select') {
      const options = (Array.isArray(props.options) ? props.options : []).map(option => ({
        value: text(option.value), label: text(option.label), disabled: Boolean(option.disabled),
      }));
      if (props.placeholder && !options.some(option => option.value === '')) {
        options.unshift({ value: '', label: text(props.placeholder), disabled: true, placeholder: true });
      }
      options.forEach((option, index) => {
        let node = control.options[index];
        if (!node) { node = element('option'); control.append(node); }
        node.value = option.value;
        setText(node, option.label);
        node.disabled = option.disabled;
        node.hidden = Boolean(option.placeholder);
      });
      while (control.options.length > options.length) control.lastElementChild.remove();
    } else control.placeholder = text(props.placeholder);
    syncValue();
    control.disabled = Boolean(props.disabled);
    control.required = Boolean(props.required);
    control.setAttribute('aria-invalid', String(Boolean(props.error)));
    const descriptions = [props.description && description.id, props.error && error.id].filter(Boolean);
    if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '));
    else control.removeAttribute('aria-describedby');
    if (props.error) control.setAttribute('aria-errormessage', error.id);
    else control.removeAttribute('aria-errormessage');
    if (nextFamily === 'select') { selectUI ||= enhanceSelect(control); selectUI.refresh(); }
  }, cleanups);
}

/** Dismiss and action callbacks report intent; the notice never removes itself. */
export function createNotice(initial = {}) {
  const host = element('div', 'gw-admin-notice');
  const copy = element('div', 'gw-admin-notice-copy');
  const title = element('p', 'gw-admin-notice-title');
  const message = element('p', 'gw-admin-notice-message');
  const action = button('gw-admin-button gw-admin-notice-action');
  action.dataset.variant = 'ghost';
  const dismiss = button('gw-admin-icon-button gw-admin-notice-dismiss', '×');
  dismiss.setAttribute('aria-label', '关闭提示');
  copy.append(title, message);
  host.append(copy, action, dismiss);
  let props;
  const cleanups = [];
  listen(action, 'click', () => emit(props, 'onAction'), cleanups);
  listen(dismiss, 'click', () => { if (props.dismissible) emit(props, 'onDismiss'); }, cleanups);
  return controller(host, initial, next => {
    props = next;
    const tone = choice(props.tone, ['neutral', 'success', 'warning', 'danger', 'error', 'info'], 'info');
    host.dataset.tone = tone === 'error' ? 'danger' : tone;
    host.setAttribute('role', tone === 'danger' || tone === 'error' ? 'alert' : 'status');
    setOptionalText(title, props.title);
    setOptionalText(message, props.message);
    setOptionalText(action, props.actionLabel);
    dismiss.hidden = !props.dismissible;
  }, cleanups);
}

/** Empty/loading/error presentation; retries and other actions stay external. */
export function createFeedback(initial = {}) {
  const host = element('div', 'gw-admin-feedback');
  const visual = element('div', 'gw-admin-feedback-visual');
  visual.setAttribute('aria-hidden', 'true');
  const progress = spinner();
  const symbol = element('span', 'gw-admin-feedback-symbol');
  visual.append(progress, symbol);
  const title = element('p', 'gw-admin-feedback-title');
  const description = element('p', 'gw-admin-feedback-description');
  const action = button('gw-admin-button');
  host.append(visual, title, description, action);
  let props;
  const cleanups = [];
  listen(action, 'click', () => emit(props, 'onAction'), cleanups);
  return controller(host, initial, next => {
    props = next;
    const kind = choice(props.kind, ['empty', 'loading', 'error'], 'empty');
    host.dataset.kind = kind;
    host.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    host.setAttribute('aria-busy', String(kind === 'loading'));
    progress.hidden = kind !== 'loading';
    symbol.hidden = kind === 'loading';
    setText(symbol, kind === 'error' ? '!' : '—');
    setText(title, props.title ?? { empty: '暂无内容', loading: '正在加载', error: '加载失败' }[kind]);
    setOptionalText(description, props.description);
    setOptionalText(action, props.actionLabel);
  }, cleanups);
}

/** value/trend/hint are supplied display values; no business calculation occurs. */
export function createStatCard(initial = {}) {
  const host = element('div', 'gw-admin-stat');
  const label = element('p', 'gw-admin-stat-label');
  const value = element('p', 'gw-admin-stat-value');
  const hint = element('p', 'gw-admin-stat-hint');
  const trend = element('p', 'gw-admin-stat-trend');
  host.append(label, value, hint, trend);
  return controller(host, initial, props => {
    host.setAttribute('aria-busy', String(Boolean(props.loading)));
    host.dataset.loading = String(Boolean(props.loading));
    setText(label, props.label);
    setText(value, props.loading ? '加载中' : (props.value ?? '—'));
    setOptionalText(hint, props.hint);
    setOptionalText(trend, props.trend);
  });
}

/** Manual activation: arrows move focus; Enter/Space request selection.
 * The caller owns selected, panel visibility and matching panel ARIA attributes. */
export function createTabs(initial = {}) {
  const host = element('div', 'gw-admin-tabs');
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-orientation', 'horizontal');
  const id = `gw-admin-tabs-${++sequence}`;
  const entries = new Map();
  const cleanups = [];
  let props, items = [], focusValue = null, nextId = 0;
  const enabled = () => items.filter(item => !item.disabled);
  const rove = value => {
    focusValue = value;
    for (const [key, entry] of entries) entry.button.tabIndex = key === value && !entry.button.disabled ? 0 : -1;
  };
  const request = value => {
    const item = items.find(candidate => candidate.value === value);
    if (item && !item.disabled) emit(props, 'onSelect', value);
  };
  listen(host, 'keydown', event => {
    const current = event.target.closest?.('[role="tab"]');
    if (!current || current.parentNode !== host || current.disabled) return;
    const value = current.dataset.value;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); request(value); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const available = enabled();
    if (!available.length) return;
    event.preventDefault();
    let index = available.findIndex(item => item.value === value);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = available.length - 1;
    else index = (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + available.length) % available.length;
    rove(available[index].value);
    entries.get(available[index].value).button.focus();
  }, cleanups);
  listen(host, 'click', event => {
    const target = event.target.closest?.('[role="tab"]');
    if (!target || target.parentNode !== host || target.disabled) return;
    rove(target.dataset.value);
    request(target.dataset.value);
  }, cleanups);
  listen(host, 'focusin', event => {
    const target = event.target.closest?.('[role="tab"]');
    if (target?.parentNode === host && !target.disabled) rove(target.dataset.value);
  }, cleanups);
  return controller(host, initial, next => {
    props = next;
    host.setAttribute('aria-label', text(props.label) || '内容标签');
    const seen = new Set();
    items = (Array.isArray(props.items) ? props.items : []).filter(item => {
      const value = text(item.value);
      if (seen.has(value)) return false;
      seen.add(value); return true;
    }).map(item => ({ ...item, value: text(item.value) }));
    for (const [value, entry] of entries) {
      if (!seen.has(value)) { entry.button.remove(); entries.delete(value); }
    }
    items.forEach((item, index) => {
      let entry = entries.get(item.value);
      if (!entry) {
        const tab = button('gw-admin-tab');
        tab.id = `${id}-${++nextId}`;
        tab.setAttribute('role', 'tab');
        const label = element('span', 'gw-admin-tab-label');
        const count = element('span', 'gw-admin-tab-count');
        tab.append(label, count);
        entry = { button: tab, label, count };
        entries.set(item.value, entry);
      }
      const tab = entry.button;
      tab.dataset.value = item.value;
      tab.disabled = Boolean(item.disabled);
      tab.setAttribute('aria-disabled', String(Boolean(item.disabled)));
      tab.setAttribute('aria-selected', String(item.value === text(props.selected)));
      if (item.panelId) tab.setAttribute('aria-controls', text(item.panelId));
      else tab.removeAttribute('aria-controls');
      setText(entry.label, item.label);
      setOptionalText(entry.count, item.count);
      const reference = host.children[index] || null;
      if (reference !== tab) host.insertBefore(tab, reference);
    });
    const active = host.ownerDocument.activeElement;
    const focused = items.find(item => entries.get(item.value)?.button === active && !item.disabled);
    const selected = items.find(item => item.value === text(props.selected) && !item.disabled);
    const remembered = items.find(item => item.value === focusValue && !item.disabled);
    rove(focused?.value ?? selected?.value ?? remembered?.value ?? enabled()[0]?.value ?? null);
  }, cleanups);
}

const modalStacks = new WeakMap();
const focusSelector = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,iframe,object,embed,[contenteditable="true"],[tabindex]';
function focusable(panel) {
  return [...panel.querySelectorAll(focusSelector)].filter(node => {
    if (node.disabled || node.tabIndex < 0 || node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none' && node.getClientRects().length > 0;
  });
}
function focusNode(node) {
  if (!node?.isConnected || typeof node.focus !== 'function' || node.disabled) return false;
  try { node.focus({ preventScroll: true }); } catch { node.focus(); }
  return node.ownerDocument.activeElement === node;
}
function initialFocus(entry) {
  const nodes = focusable(entry.panel);
  const preferred = nodes.find(node => node.hasAttribute('autofocus')) || nodes.find(node => entry.body.contains(node)) || nodes[0];
  focusNode(preferred || entry.panel);
}
function getModalStack(doc) {
  let stack = modalStacks.get(doc);
  if (stack) return stack;
  const entries = [];
  let redirecting = false;
  const top = () => entries[entries.length - 1];
  const onKeydown = event => {
    const entry = top();
    if (!entry) return;
    if (entry.closing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      entry.requestClose('escape');
    } else if (event.key === 'Tab') {
      const nodes = focusable(entry.panel);
      const active = doc.activeElement;
      if (!nodes.length) { event.preventDefault(); focusNode(entry.panel); }
      else if (event.shiftKey && (active === nodes[0] || !nodes.includes(active))) {
        event.preventDefault(); focusNode(nodes[nodes.length - 1]);
      } else if (!event.shiftKey && (active === nodes[nodes.length - 1] || !nodes.includes(active))) {
        event.preventDefault(); focusNode(nodes[0]);
      }
    }
  };
  const onFocusin = event => {
    const entry = top();
    if (!entry || entry.closing || redirecting) return;
    if (entry.panel.contains(event.target)) entry.lastFocused = event.target;
    else {
      redirecting = true;
      if (!focusNode(entry.lastFocused)) initialFocus(entry);
      redirecting = false;
    }
  };
  const reorder = () => entries.forEach((entry, index) => {
    entry.element.style.zIndex = String(1000 + index);
    const isTop = index === entries.length - 1;
    entry.panel.setAttribute('aria-modal', String(isTop));
    entry.element.inert = !isTop;
  });
  stack = {
    isTop: entry => top() === entry,
    add(entry) {
      if (entries.includes(entry)) return;
      if (!entries.length) {
        doc.addEventListener('keydown', onKeydown, true);
        doc.addEventListener('focusin', onFocusin, true);
      }
      entries.push(entry);
      reorder();
      initialFocus(entry);
    },
    remove(entry) {
      const index = entries.indexOf(entry);
      if (index < 0) return;
      const wasTop = top() === entry;
      entries.splice(index, 1);
      entry.element.style.removeProperty('z-index');
      entry.element.inert = false;
      entry.element.removeAttribute('aria-hidden');
      reorder();
      if (!entries.length) {
        doc.removeEventListener('keydown', onKeydown, true);
        doc.removeEventListener('focusin', onFocusin, true);
      }
      if (wasTop) {
        const next = top();
        if (next) {
          if (!(next.panel.contains(entry.opener) && focusNode(entry.opener)) && !focusNode(next.lastFocused)) initialFocus(next);
        } else focusNode(entry.opener);
      }
    },
  };
  modalStacks.set(doc, stack);
  return stack;
}
// Overlay optics accept values only; caller-owned Nodes and layout stay private.
function overlayGlassOptions(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    mode: choice(source.mode, ['zoned', 'frosted', 'refractive', 'off'], DIALOG_PRESET.glass.mode),
    blur: Number.isFinite(source.blur) ? Math.max(0, source.blur) : DIALOG_PRESET.glass.blur,
    strength: Number.isFinite(source.strength) ? Math.max(0, source.strength) : DIALOG_PRESET.glass.strength,
    edge: Number.isFinite(source.edge) ? Math.max(1, source.edge) : DIALOG_PRESET.glass.edge,
    tint: typeof source.tint === 'string' && /^#[0-9a-f]{6}$/i.test(source.tint) ? source.tint.toLowerCase() : DIALOG_PRESET.glass.tint,
    opacity: Number.isFinite(source.opacity) ? Math.min(1, Math.max(0, source.opacity)) : DIALOG_PRESET.glass.opacity,
  };
}
function createOverlay(kind, initial) {
  const host = element('div', `gw-admin-overlay gw-admin-overlay--${kind}`);
  host.hidden = true;
  const panel = element('section', `gw-admin-modal gw-admin-${kind}`);
  panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const id = `gw-admin-modal-${++sequence}`;
  const header = element('header', 'gw-admin-modal-header');
  const copy = element('div', 'gw-admin-modal-heading');
  const title = element('h2', 'gw-admin-modal-title');
  title.id = `${id}-title`;
  const description = element('p', 'gw-admin-modal-description');
  description.id = `${id}-description`;
  copy.append(title, description);
  const close = button('gw-admin-icon-button gw-admin-modal-close', '×');
  close.setAttribute('aria-label', '关闭');
  header.append(copy, close);
  const body = element('div', 'gw-admin-modal-body');
  const footer = element('footer', 'gw-admin-modal-footer');
  panel.append(header, body, footer);
  const glass = createGlassSurface({ element: panel, ...DIALOG_PRESET.glass });
  let glassKey = JSON.stringify(overlayGlassOptions());
  host.append(panel);
  const input = trackMotionInput(host.ownerDocument);
  const motion = createSurfaceMotion({
    surface: panel,
    foregrounds: () => [...panel.children],
    moveSurface: false,
    fadeDecorations: true,
    axis: kind === 'drawer' ? 'x' : 'y',
  });
  const stack = getModalStack(host.ownerDocument);
  let props, active = false, disposed = false, revision = 0;
  const entry = {
    element: host, panel, body, opener: null, lastFocused: null, closing: false,
    requestClose(reason) {
      if (active && props.open && stack.isTop(entry) && !props.closeDisabled) emit(props, 'onClose', reason);
    },
  };
  const cleanups = [];
  listen(close, 'click', () => entry.requestClose('button'), cleanups);
  listen(host, 'click', event => { if (event.target === host) entry.requestClose('backdrop'); }, cleanups);
  const restorePanelInteraction = () => {
    entry.closing = false;
    panel.inert = false;
    panel.style.removeProperty('pointer-events');
  };
  const finishDeactivate = () => {
    if (!active) { restorePanelInteraction(); return; }
    active = false;
    host.hidden = true;
    restorePanelInteraction();
    stack.remove(entry);
    entry.lastFocused = null;
  };
  const deactivate = () => {
    if (!active) { host.hidden = true; return; }
    entry.closing = true;
    panel.inert = true;
    panel.style.pointerEvents = 'none';
    motion.set(false, { immediate: Boolean(props.immediate) || input.isKeyboard(), onFinish: finishDeactivate });
  };
  const activate = () => {
    if (disposed || !props.open || !host.isConnected) return;
    const wasActive = active;
    active = true;
    restorePanelInteraction();
    if (!wasActive) entry.opener = host.ownerDocument.activeElement;
    host.hidden = false;
    if (!wasActive) stack.add(entry);
    glass.update();
    motion.set(true, { immediate: Boolean(props.immediate) || input.isKeyboard() });
  };
  const update = (next = {}) => {
    if (disposed) return;
    props = { ...props, ...next };
    const currentRevision = ++revision;
    panel.dataset.size = choice(props.size, ['sm', 'md', 'lg'], 'md');
    setText(title, props.title);
    panel.setAttribute('aria-labelledby', title.id);
    setOptionalText(description, props.description);
    if (props.description) panel.setAttribute('aria-describedby', description.id);
    else panel.removeAttribute('aria-describedby');
    close.disabled = Boolean(props.closeDisabled);
    syncNodes(body, props.children);
    syncNodes(footer, props.footer);
    footer.hidden = !footer.childNodes.length;
    const material = overlayGlassOptions(props.glass);
    const nextGlassKey = JSON.stringify(material);
    if (nextGlassKey !== glassKey) {
      glass.update(material);
      glassKey = nextGlassKey;
    }
    // These backgrounds quiet dense content without fading or filtering text.
    if (Number.isFinite(props.contentWash)) {
      const alpha = Math.min(1, Math.max(0, props.contentWash));
      panel.style.setProperty('--gw-admin-content-wash', `rgb(21 24 29 / ${alpha * 100}%)`);
    } else panel.style.removeProperty('--gw-admin-content-wash');
    if (Number.isFinite(props.scrimOpacity)) {
      const alpha = Math.min(1, Math.max(0, props.scrimOpacity));
      host.style.background = `rgb(4 7 11 / ${alpha * 100}%)`;
    } else host.style.removeProperty('background');
    if (props.open) {
      host.hidden = false;
      activate();
      if (!active) queueMicrotask(() => { if (currentRevision === revision) activate(); });
    } else {
      deactivate();
    }
    // Replacing child arrays may remove the active control; keep focus inside.
    if (active && !entry.closing && stack.isTop(entry) && host.ownerDocument.hasFocus() && !panel.contains(host.ownerDocument.activeElement)) initialFocus(entry);
  };
  props = { open: false, children: [], footer: [], ...initial };
  update();
  return {
    element: host,
    update,
    destroy() {
      if (disposed) return;
      disposed = true;
      revision++;
      motion.destroy();
      input.destroy();
      finishDeactivate();
      cleanups.splice(0).forEach(cleanup => cleanup());
      glass.destroy();
      host.remove();
    },
  };
}

/** Append while closed, then update({open:true}); close only via caller update.
 * onClose receives escape | backdrop | button. children/footer contain DOM Nodes.
 * glass is an optical snapshot; contentWash/scrimOpacity are independent 0..1 backgrounds.
 * immediate closes without retaining an exit frame (for permission/authentication changes). */
export function createDialog(initial = {}) { return createOverlay('dialog', initial); }

/** Same controlled contract as createDialog, with an independently scrolling body. */
export function createDrawer(initial = {}) { return createOverlay('drawer', initial); }
