import { enhanceSelect } from '../components/select.js';
/* Controlled data controls. Callers own queries, row order, selection and requests. */
let controlId = 0;
const textValue = value => value == null ? '' : String(value);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const setText = (element, value) => {
  const next = textValue(value);
  if (element.textContent !== next) element.textContent = next;
};
const listen = (element, type, handler, cleanups) => {
  element.addEventListener(type, handler);
  cleanups.push(() => element.removeEventListener(type, handler));
};
const dispose = cleanups => cleanups.splice(0).forEach(cleanup => cleanup());
const isNode = value => !!value && typeof value.nodeType === 'number';
const sameItems = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
function syncChildren(parent, children) {
  let cursor = parent.firstChild;
  children.forEach(child => {
    if (cursor === child) cursor = cursor.nextSibling;
    else parent.insertBefore(child, cursor);
  });
  while (cursor) {
    const next = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
  }
}
function button(label, className = '') {
  const element = node('button', `gw-admin-data-button ${className}`.trim(), label);
  element.type = 'button';
  return element;
}
function keyed(items, getKey, name) {
  const keys = new Set();
  return items.map(item => {
    const raw = getKey(item);
    if (raw == null || textValue(raw) === '' || keys.has(textValue(raw))) {
      throw new TypeError(`${name} must have unique, non-empty keys.`);
    }
    const key = textValue(raw);
    keys.add(key);
    return { key, item };
  });
}

export function createFilterBar(initialProps = {}) {
  let props = { filters: [], actions: [], resultLabel: '', disabled: false, ...initialProps };
  let destroyed = false;
  const cleanups = [];
  const records = new Map();
  const element = node('div', 'gw-admin-filter-bar');
  const fields = node('div', 'gw-admin-filter-fields');
  const tail = node('div', 'gw-admin-filter-tail');
  const result = node('span', 'gw-admin-filter-result');
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  const reset = button('重置筛选', 'gw-admin-filter-reset');
  const actions = node('div', 'gw-admin-filter-actions');
  tail.append(result, reset, actions);
  element.append(fields, tail);
  listen(reset, 'click', () => {
    if (!props.disabled) props.onReset?.();
  }, cleanups);

  function createField(key, type) {
    const cleanups = [];
    const wrapper = node('div', `gw-admin-filter-field gw-admin-filter-field--${type}`);
    const label = node('label', 'gw-admin-filter-label');
    const input = node(type === 'select' ? 'select' : 'input', 'gw-admin-filter-control');
    input.id = `gw-admin-filter-${++controlId}`;
    label.htmlFor = input.id;
    if (type === 'search') input.type = 'search';
    const record = { key, type, wrapper, label, input, cleanups, composing: false, skipValue: null, options: [] };
    const emit = () => {
      if (!props.disabled && !record.filter.disabled) props.onFilterChange?.(record.key, input.value);
    };
    if (type === 'search') {
      listen(input, 'compositionstart', () => { record.composing = true; record.skipValue = null; }, cleanups);
      listen(input, 'compositionend', () => {
        record.composing = false;
        record.skipValue = input.value;
        emit();
      }, cleanups);
      listen(input, 'input', event => {
        if (record.composing || event.isComposing) return;
        if (record.skipValue === input.value) { record.skipValue = null; return; }
        record.skipValue = null;
        emit();
      }, cleanups);
    } else listen(input, 'change', () => { emit(); if (!destroyed) input.value = textValue(record.filter.value); }, cleanups);
    wrapper.append(label, input);
    if (type === 'select') { record.selectUI = enhanceSelect(input); cleanups.push(() => record.selectUI.destroy()); }
    return record;
  }

  function render() {
    const entries = keyed(props.filters || [], filter => filter.key, 'Filters');
    const liveKeys = new Set(entries.map(entry => entry.key));
    for (const [key, record] of records) {
      if (!liveKeys.has(key)) { dispose(record.cleanups); record.wrapper.remove(); records.delete(key); }
    }
    const ordered = entries.map(({ key, item: filter }) => {
      const type = filter.type === 'select' ? 'select' : 'search';
      let record = records.get(key);
      if (record && record.type !== type) {
        dispose(record.cleanups);
        record.wrapper.remove();
        records.delete(key);
        record = null;
      }
      if (!record) { record = createField(key, type); records.set(key, record); }
      record.filter = filter;
      setText(record.label, filter.label || key);
      record.input.disabled = !!(props.disabled || filter.disabled);
      if (type === 'select') {
        const options = (filter.options || []).map(option => ({ value: textValue(option.value), label: textValue(option.label) }));
        if (filter.placeholder && !options.some(option => option.value === '')) options.unshift({ value: '', label: textValue(filter.placeholder) });
        const signature = options.map(option => `${option.value.length}:${option.value}${option.label}`);
        if (!sameItems(signature, record.options)) {
          record.input.replaceChildren(...options.map(option => {
            const item = node('option', '', option.label);
            item.value = option.value;
            return item;
          }));
          record.options = signature;
        }
      } else record.input.placeholder = textValue(filter.placeholder);
      if (!record.composing && record.input.value !== textValue(filter.value)) record.input.value = textValue(filter.value);
      record.selectUI?.refresh();
      return record.wrapper;
    });
    syncChildren(fields, ordered);
    setText(result, props.resultLabel);
    result.hidden = !props.resultLabel;
    reset.disabled = !!props.disabled;
    actions.inert = !!props.disabled;
    actions.setAttribute('aria-disabled', String(!!props.disabled));
    syncChildren(actions, (props.actions || []).filter(isNode));
    actions.hidden = !actions.childNodes.length;
  }
  render();
  return {
    element,
    update(nextProps = {}) { if (!destroyed) { props = { ...props, ...nextProps }; render(); } },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dispose(cleanups);
      records.forEach(record => dispose(record.cleanups));
      records.clear();
      element.remove();
    }
  };
}

export function createDataTable(initialProps = {}) {
  let props = {
    label: '数据列表', columns: [], rows: [], rowKey: 'id', selectedKeys: [], sort: null,
    loading: false, error: null, selectable: false, actions: [], ...initialProps
  };
  let destroyed = false;
  let columnEntries = [];
  let rowEntries = [];
  let actionEntries = [];
  const cleanups = [];
  const headers = new Map();
  const rows = new Map();
  const element = node('div', 'gw-admin-data-table');
  const feedback = node('div', 'gw-admin-table-feedback');
  const busy = node('div', 'gw-admin-table-busy', '正在更新数据…');
  busy.setAttribute('role', 'status');
  busy.setAttribute('aria-live', 'polite');
  const failure = node('div', 'gw-admin-table-error');
  failure.setAttribute('role', 'alert');
  const failureText = node('span');
  const retry = button('重试', 'gw-admin-table-retry');
  failure.append(failureText, retry);
  feedback.append(busy, failure);
  const scroll = node('div', 'gw-admin-table-scroll');
  scroll.setAttribute('role', 'region');
  scroll.tabIndex = 0;
  const table = node('table', 'gw-admin-table');
  const caption = node('caption', 'gw-admin-data-sr-only');
  const colgroup = node('colgroup');
  const thead = node('thead');
  const headRow = node('tr');
  const tbody = node('tbody');
  const selectHead = node('th', 'gw-admin-table-select');
  selectHead.scope = 'col';
  const selectHeadLabel = node('label', 'gw-admin-table-check-target');
  const selectAll = node('input', 'gw-admin-table-checkbox');
  selectAll.type = 'checkbox';
  selectAll.setAttribute('aria-label', '选择本页可选行');
  selectHeadLabel.append(selectAll);
  selectHead.append(selectHeadLabel);
  const selectCol = node('col', 'gw-admin-table-select-col');
  const actionHead = node('th', 'gw-admin-table-actions-head', '操作');
  actionHead.scope = 'col';
  const actionCol = node('col', 'gw-admin-table-actions-col');
  const blankRow = node('tr', 'gw-admin-table-placeholder');
  const blankCell = node('td');
  const blankText = node('div', 'gw-admin-table-placeholder-text');
  blankText.setAttribute('role', 'status');
  blankCell.append(blankText);
  blankRow.append(blankCell);
  thead.append(headRow);
  table.append(caption, colgroup, thead, tbody);
  scroll.append(table);
  element.append(feedback, scroll);
  listen(retry, 'click', () => props.onRetry?.(), cleanups);

  const selection = () => new Set((props.selectedKeys || []).map(textValue));
  const canSelect = row => props.isRowSelectable ? !!props.isRowSelectable(row) : true;
  const rowName = (row, key) => textValue(props.rowLabel ? props.rowLabel(row) : key);
  function refreshSelection() {
    const selected = selection();
    const eligible = rowEntries.filter(({ item }) => canSelect(item));
    const selectedCount = eligible.filter(({ key }) => selected.has(key)).length;
    selectAll.checked = eligible.length > 0 && selectedCount === eligible.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < eligible.length;
    selectAll.disabled = !eligible.length;
    for (const { key, item } of rowEntries) {
      const record = rows.get(key);
      const checked = selected.has(key);
      record.checkbox.checked = checked;
      record.checkbox.disabled = !canSelect(item);
      record.tr.classList.toggle('is-selected', !!props.selectable && checked);
      if (props.selectable) record.tr.setAttribute('aria-selected', String(checked));
      else record.tr.removeAttribute('aria-selected');
    }
  }
  listen(selectAll, 'change', () => {
    const checked = selectAll.checked;
    const next = selection();
    const changedKeys = [];
    rowEntries.forEach(({ key, item }) => {
      if (!canSelect(item) || next.has(key) === checked) return;
      changedKeys.push(key);
      if (checked) next.add(key); else next.delete(key);
    });
    if (props.selectable && changedKeys.length) props.onSelectionChange?.([...next], { scope: 'page', changedKeys, checked });
    if (!destroyed) refreshSelection();
  }, cleanups);

  function createHeader(key) {
    const cleanups = [];
    const th = node('th');
    th.scope = 'col';
    const label = node('span', 'gw-admin-table-column-label');
    const sortButton = button('', 'gw-admin-table-sort');
    const sortLabel = node('span');
    const sortMark = node('span', 'gw-admin-table-sort-mark');
    sortMark.setAttribute('aria-hidden', 'true');
    sortButton.append(sortLabel, sortMark);
    const record = { key, th, col: node('col'), label, sortButton, sortLabel, sortMark, cleanups };
    listen(sortButton, 'click', () => {
      if (!record.column.sortable) return;
      const current = props.sort?.key === record.column.key ? props.sort.direction : null;
      const next = current === 'asc' ? { key: record.column.key, direction: 'desc' }
        : current === 'desc' ? null : { key: record.column.key, direction: 'asc' };
      props.onSort?.(next);
    }, cleanups);
    return record;
  }
  function createRow(key) {
    const cleanups = [];
    const tr = node('tr');
    const selectCell = node('td', 'gw-admin-table-select');
    const target = node('label', 'gw-admin-table-check-target');
    const checkbox = node('input', 'gw-admin-table-checkbox');
    checkbox.type = 'checkbox';
    target.append(checkbox);
    selectCell.append(target);
    const actionCell = node('td', 'gw-admin-table-actions');
    const actionGroup = node('div', 'gw-admin-table-action-group');
    actionCell.append(actionGroup);
    const record = { key, tr, selectCell, checkbox, actionCell, actionGroup, cells: new Map(), actions: new Map(), cleanups };
    listen(checkbox, 'change', () => {
      const checked = checkbox.checked;
      if (props.selectable && canSelect(record.row)) {
        const next = selection();
        const changed = next.has(key) !== checked;
        if (checked) next.add(key); else next.delete(key);
        if (changed) props.onSelectionChange?.([...next], { scope: 'row', changedKeys: [key], checked });
      }
      if (!destroyed) refreshSelection();
    }, cleanups);
    return record;
  }
  function destroyRow(record) {
    dispose(record.cleanups);
    record.actions.forEach(action => dispose(action.cleanups));
    record.tr.remove();
  }
  function renderRow(record, row) {
    const previousRow = record.row;
    record.row = row;
    record.checkbox.setAttribute('aria-label', `选择行：${rowName(row, record.key)}`);
    const liveColumns = new Set(columnEntries.map(entry => entry.key));
    for (const [key, cell] of record.cells) {
      if (!liveColumns.has(key)) { cell.td.remove(); record.cells.delete(key); }
    }
    const cells = columnEntries.map(({ key, item: column }, index) => {
      let cell = record.cells.get(key);
      if (!cell) { cell = { td: node('td'), initialized: false }; record.cells.set(key, cell); }
      cell.td.classList.toggle('gw-admin-table-primary', index === 0);
      cell.td.dataset.align = ['center', 'right'].includes(column.align) ? column.align : 'left';
      const value = row[column.key];
      if (!cell.initialized || previousRow !== row || cell.value !== value || cell.render !== column.render) {
        const content = column.render ? column.render(value, row) : textValue(value);
        if (isNode(content)) {
          if (cell.td.childNodes.length !== 1 || cell.td.firstChild !== content) cell.td.replaceChildren(content);
        } else setText(cell.td, content);
        cell.initialized = true;
        cell.value = value;
        cell.render = column.render;
      }
      return cell.td;
    });
    const liveActions = new Set(actionEntries.map(entry => entry.key));
    for (const [key, action] of record.actions) {
      if (!liveActions.has(key)) { dispose(action.cleanups); action.button.remove(); record.actions.delete(key); }
    }
    const actionButtons = actionEntries.map(({ key, item: action }) => {
      let entry = record.actions.get(key);
      if (!entry) {
        entry = { button: button('', 'gw-admin-table-action'), cleanups: [] };
        listen(entry.button, 'click', () => {
          if (!entry.button.disabled) props.onRowAction?.(entry.action.id, record.row);
        }, entry.cleanups);
        record.actions.set(key, entry);
      }
      entry.action = action;
      setText(entry.button, action.label);
      entry.button.setAttribute('aria-label', `${textValue(action.label)}：${rowName(row, record.key)}`);
      entry.button.disabled = typeof action.disabled === 'function' ? !!action.disabled(row) : !!action.disabled;
      entry.button.classList.toggle('is-danger', !!action.danger);
      return entry.button;
    });
    syncChildren(record.actionGroup, actionButtons);
    syncChildren(record.tr, [...(props.selectable ? [record.selectCell] : []), ...cells, ...(actionEntries.length ? [record.actionCell] : [])]);
  }
  function render() {
    columnEntries = keyed(props.columns || [], column => column.key, 'Columns');
    rowEntries = keyed(props.rows || [], row => typeof props.rowKey === 'function' ? props.rowKey(row) : row[props.rowKey || 'id'], 'Rows');
    actionEntries = keyed(props.actions || [], action => action.id, 'Actions');
    const liveColumns = new Set(columnEntries.map(entry => entry.key));
    for (const [key, header] of headers) {
      if (!liveColumns.has(key)) { dispose(header.cleanups); header.th.remove(); header.col.remove(); headers.delete(key); }
    }
    const headCells = [];
    const cols = [];
    if (props.selectable) { headCells.push(selectHead); cols.push(selectCol); }
    columnEntries.forEach(({ key, item: column }) => {
      let record = headers.get(key);
      if (!record) { record = createHeader(key); headers.set(key, record); }
      record.column = column;
      record.th.dataset.align = ['center', 'right'].includes(column.align) ? column.align : 'left';
      record.col.style.width = column.width == null ? '' : typeof column.width === 'number' ? `${column.width}px` : textValue(column.width);
      if (column.sortable) {
        setText(record.sortLabel, column.label);
        const current = props.sort?.key === column.key ? props.sort.direction : null;
        record.th.setAttribute('aria-sort', current === 'asc' ? 'ascending' : current === 'desc' ? 'descending' : 'none');
        const nextLabel = current === 'asc' ? '降序' : current === 'desc' ? '取消排序' : '升序';
        record.sortButton.setAttribute('aria-label', `${textValue(column.label)}：${nextLabel}`);
        setText(record.sortMark, current === 'asc' ? '↑' : current === 'desc' ? '↓' : '↕');
        syncChildren(record.th, [record.sortButton]);
      } else {
        record.th.removeAttribute('aria-sort');
        setText(record.label, column.label);
        syncChildren(record.th, [record.label]);
      }
      headCells.push(record.th);
      cols.push(record.col);
    });
    if (actionEntries.length) { headCells.push(actionHead); cols.push(actionCol); }
    syncChildren(headRow, headCells);
    syncChildren(colgroup, cols);
    const liveRows = new Set(rowEntries.map(entry => entry.key));
    for (const [key, record] of rows) {
      if (!liveRows.has(key)) { destroyRow(record); rows.delete(key); }
    }
    const rowNodes = rowEntries.map(({ key, item: row }) => {
      let record = rows.get(key);
      if (!record) { record = createRow(key); rows.set(key, record); }
      renderRow(record, row);
      return record.tr;
    });
    if (!rowNodes.length) {
      blankCell.colSpan = Math.max(1, headCells.length);
      setText(blankText, props.error ? '数据暂时无法加载。' : props.loading ? '正在加载数据…' : '暂无数据');
      rowNodes.push(blankRow);
    }
    syncChildren(tbody, rowNodes);
    setText(caption, props.label || '数据列表');
    scroll.setAttribute('aria-label', `${textValue(props.label || '数据列表')}，可横向滚动`);
    table.setAttribute('aria-busy', String(!!props.loading));
    busy.hidden = !props.loading;
    failure.hidden = !props.error;
    const errorMessage = props.error instanceof Error ? props.error.message : typeof props.error === 'string' ? props.error : '数据加载失败，请重试。';
    setText(failureText, errorMessage || '数据加载失败，请重试。');
    retry.hidden = typeof props.onRetry !== 'function';
    feedback.hidden = !props.loading && !props.error;
    refreshSelection();
  }
  render();
  return {
    element,
    update(nextProps = {}) { if (!destroyed) { props = { ...props, ...nextProps }; render(); } },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dispose(cleanups);
      rows.forEach(destroyRow);
      headers.forEach(record => dispose(record.cleanups));
      rows.clear();
      headers.clear();
      element.remove();
    }
  };
}

export function createPagination(initialProps = {}) {
  let props = { page: 1, pageSize: 10, total: 0, pageSizeOptions: [5, 10, 20], disabled: false, ...initialProps };
  let destroyed = false;
  const cleanups = [];
  const element = node('nav', 'gw-admin-pagination');
  element.setAttribute('aria-label', '数据分页');
  const summary = node('span', 'gw-admin-pagination-summary');
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const sizeLabel = node('label', 'gw-admin-pagination-size-label', '每页');
  const size = node('select', 'gw-admin-pagination-size');
  size.id = `gw-admin-page-size-${++controlId}`;
  sizeLabel.htmlFor = size.id;
  sizeLabel.append(size, document.createTextNode('条'));
  const sizeUI = enhanceSelect(size); cleanups.push(() => sizeUI.destroy());
  const controls = node('div', 'gw-admin-pagination-controls');
  const first = button('首页');
  const previous = button('上一页');
  const current = node('span', 'gw-admin-pagination-current');
  const next = button('下一页');
  const last = button('末页');
  controls.append(first, previous, current, next, last);
  const notice = node('span', 'gw-admin-pagination-notice');
  notice.setAttribute('role', 'status');
  element.append(summary, sizeLabel, controls, notice);
  const count = () => Math.ceil(Math.max(0, Number(props.total) || 0) / Math.max(1, Number(props.pageSize) || 1));
  const emitPage = page => {
    if (!props.disabled && Number(props.total) > 0) props.onChange?.({ page, pageSize: props.pageSize });
  };
  listen(first, 'click', () => { if (!first.disabled) emitPage(1); }, cleanups);
  listen(previous, 'click', () => { if (!previous.disabled) emitPage(Number(props.page) - 1); }, cleanups);
  listen(next, 'click', () => { if (!next.disabled) emitPage(Number(props.page) + 1); }, cleanups);
  listen(last, 'click', () => { if (!last.disabled) emitPage(count()); }, cleanups);
  listen(size, 'change', () => {
    if (!props.disabled) props.onChange?.({ page: 1, pageSize: Number(size.value) });
    if (!destroyed) size.value = textValue(props.pageSize);
  }, cleanups);
  let optionValues = [];
  function render() {
    const total = Math.max(0, Number(props.total) || 0);
    const page = Number(props.page);
    const pageSize = Math.max(1, Number(props.pageSize) || 1);
    const pages = count();
    const from = (page - 1) * pageSize + 1;
    const inRange = total > 0 && page >= 1 && from <= total;
    setText(summary, `${inRange ? from : 0}-${inRange ? Math.min(page * pageSize, total) : 0} / 共 ${total} 条`);
    setText(current, total === 0 ? '暂无分页' : `第 ${textValue(props.page)} / ${pages} 页`);
    const options = [...new Set((props.pageSizeOptions || []).map(Number).filter(value => Number.isInteger(value) && value > 0))];
    if (!options.includes(Number(props.pageSize))) options.push(Number(props.pageSize));
    const values = options.filter(value => Number.isInteger(value) && value > 0).map(String);
    if (!sameItems(values, optionValues)) {
      size.replaceChildren(...values.map(value => {
        const option = node('option', '', value);
        option.value = value;
        return option;
      }));
      optionValues = values;
    }
    size.value = textValue(props.pageSize);
    size.disabled = !!props.disabled; sizeUI.refresh();
    first.disabled = previous.disabled = !!props.disabled || total === 0 || page <= 1;
    next.disabled = last.disabled = !!props.disabled || total === 0 || page >= pages;
    notice.hidden = total === 0 || (page >= 1 && page <= pages);
    setText(notice, '当前页超出范围，请调整页码。');
  }
  render();
  return {
    element,
    update(nextProps = {}) { if (!destroyed) { props = { ...props, ...nextProps }; render(); } },
    destroy() { if (!destroyed) { destroyed = true; dispose(cleanups); element.remove(); } }
  };
}
