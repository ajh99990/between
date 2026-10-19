import { type CSSProperties, type HTMLAttributes, type ReactNode, useRef } from "react";
import { Icon } from "../icons";
import { useUiEnabled, useUiReducedMotion } from "../provider";
import { Button, Checkbox, Empty, ErrorNotice, Skeleton } from "./controls";
import { Popover } from "./overlays";

export type TableSort = { key: string; direction: "asc" | "desc" };

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Opt long prose into wrapping; short labels stay intact in horizontal scroll. */
  wrap?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  /** Required and sticky columns cannot be hidden. Row-selection is always retained. */
  required?: boolean;
  sticky?: "start" | "end";
}

export type ColumnWidths = Record<string, number>;
export type ColumnVisibility = Record<string, boolean>;

export function columnWidthBounds(column: Pick<DataColumn<unknown>, "width" | "minWidth" | "maxWidth">) {
  const min = Number.isFinite(column.minWidth) ? Math.max(56, Math.min(1200, column.minWidth as number)) : 88;
  const max = Number.isFinite(column.maxWidth)
    ? Math.max(min, Math.min(2400, column.maxWidth as number))
    : Math.max(min, 800);
  const preferred = Number.isFinite(column.width) ? (column.width as number) : 180;
  return { min, max, initial: Math.max(min, Math.min(max, preferred)) };
}

export function clampColumnWidth(
  column: Pick<DataColumn<unknown>, "width" | "minWidth" | "maxWidth">,
  width: number,
) {
  const bounds = columnWidthBounds(column);
  return Math.round(
    Math.max(bounds.min, Math.min(bounds.max, Number.isFinite(width) ? width : bounds.initial)),
  );
}

/** Always retain required/sticky columns and at least one data column, even for malformed external state. */
export function visibleTableColumns<T>(
  columns: readonly DataColumn<T>[],
  visibility: ColumnVisibility = {},
): DataColumn<T>[] {
  const visible = columns.filter(
    (column) => column.required || column.sticky || visibility[column.key] !== false,
  );
  return visible.length ? visible : columns.slice(0, 1);
}

export function setColumnVisibility<T>(
  columns: readonly DataColumn<T>[],
  visibility: ColumnVisibility,
  key: string,
  visible: boolean,
): ColumnVisibility {
  const column = columns.find((item) => item.key === key);
  if (!column || column.required || column.sticky) return visibility;
  const next = { ...visibility, [key]: visible };
  if (!columns.some((item) => item.required || item.sticky || next[item.key] !== false)) return visibility;
  return next;
}

/** Toggle only visible rows. Selection on other pages is owned by the caller. */
export function setPageSelection(
  selected: readonly string[],
  pageKeys: readonly string[],
  checked: boolean,
): string[] {
  const next = new Set(selected);
  for (const key of pageKeys) {
    if (checked) next.add(key);
    else next.delete(key);
  }
  return [...next];
}

export function getPageSelection(
  selected: readonly string[],
  pageKeys: readonly string[],
): boolean | "indeterminate" {
  if (!pageKeys.length) return false;
  const keys = new Set(selected);
  const count = pageKeys.filter((key) => keys.has(key)).length;
  return count === pageKeys.length ? true : count === 0 ? false : "indeterminate";
}

export function nextTableSort(sort: TableSort | null | undefined, key: string): TableSort {
  return {
    key,
    direction: sort?.key === key && sort.direction === "asc" ? "desc" : "asc",
  };
}

export function paginationInfo(page: number, total: number, pageSize: number) {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Number.isFinite(page) ? Math.min(pages, Math.max(1, Math.floor(page))) : 1;
  return {
    page: current,
    pages,
    pageSize: size,
    total: count,
    from: count ? (current - 1) * size + 1 : 0,
    to: Math.min(current * size, count),
  };
}

export interface DataTableProps<T> {
  label: string;
  rows: T[];
  columns: DataColumn<T>[];
  getRowKey: (row: T) => string;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  sort?: TableSort | null;
  onSort?: (sort: TableSort) => void;
  loading?: boolean;
  error?: ReactNode;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  columnWidths?: ColumnWidths;
  onColumnWidthsChange?: (widths: ColumnWidths) => void;
  columnVisibility?: ColumnVisibility;
  stickyHeader?: boolean;
  maxHeight?: CSSProperties["maxHeight"];
}

export function DataTable<T>({
  label,
  rows,
  columns,
  getRowKey,
  selectedKeys = [],
  onSelectionChange,
  sort,
  onSort,
  loading = false,
  error,
  onRetry,
  emptyTitle = "暂无数据",
  emptyDescription,
  columnWidths = {},
  onColumnWidthsChange,
  columnVisibility = {},
  stickyHeader = false,
  maxHeight,
}: DataTableProps<T>) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const pageKeys = rows.map(getRowKey);
  const selected = new Set(selectedKeys);
  const visibleColumns = visibleTableColumns(columns, columnVisibility);
  const span = Math.max(1, visibleColumns.length + (onSelectionChange ? 1 : 0));
  const constrained = Boolean(
    onColumnWidthsChange ||
      Object.keys(columnWidths).length ||
      columns.some((column) => column.width !== undefined || column.sticky),
  );
  const widths = visibleColumns.map((column) =>
    clampColumnWidth(column, columnWidths[column.key] ?? columnWidthBounds(column).initial),
  );
  const totalWidth = widths.reduce((sum, width) => sum + width, onSelectionChange ? 44 : 0);
  const drag = useRef<{ key: string; x: number; width: number; pointerId: number } | null>(null);
  const stickyStyle = (column: DataColumn<T>, index: number): CSSProperties | undefined => {
    if (!column.sticky) return undefined;
    if (column.sticky === "start")
      return {
        left:
          (onSelectionChange ? 44 : 0) +
          visibleColumns
            .slice(0, index)
            .reduce((sum, item, i) => sum + (item.sticky === "start" ? widths[i] : 0), 0),
      };
    return {
      right: visibleColumns
        .slice(index + 1)
        .reduce((sum, item, i) => sum + (item.sticky === "end" ? widths[index + 1 + i] : 0), 0),
    };
  };
  const updateWidth = (column: DataColumn<T>, width: number) => {
    if (!enabled || loading || !onColumnWidthsChange) return;
    onColumnWidthsChange({ ...columnWidths, [column.key]: clampColumnWidth(column, width) });
  };
  return (
    <div className="bt-data-region" aria-busy={loading} data-reduced-motion={reduced || undefined}>
      {error && (
        <div className="bt-table-error">
          <ErrorNotice>{error}</ErrorNotice>
          {onRetry && (
            <Button onClick={onRetry} disabled={loading}>
              重试
            </Button>
          )}
        </div>
      )}
      <section
        className="bt-table-scroll"
        style={{ maxHeight }}
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: A wide table region must be keyboard-scrollable.
        tabIndex={0}
        data-sticky-header={stickyHeader || undefined}
      >
        <table
          className="bt-data-table"
          data-constrained={constrained || undefined}
          style={constrained ? { minWidth: totalWidth, width: totalWidth } : undefined}
        >
          <caption className="bt-sr-only">{label}</caption>
          {constrained && (
            <colgroup>
              {onSelectionChange && <col style={{ width: 44 }} />}
              {visibleColumns.map((column, index) => (
                <col key={column.key} style={{ width: widths[index] }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {onSelectionChange && (
                <th
                  scope="col"
                  className="bt-table-selection"
                  data-sticky={constrained ? "start" : undefined}
                  style={constrained ? { left: 0 } : undefined}
                >
                  <Checkbox
                    label={<span className="bt-sr-only">选择当前页</span>}
                    checked={getPageSelection(selectedKeys, pageKeys)}
                    disabled={loading || !rows.length}
                    onChange={(checked) =>
                      onSelectionChange(setPageSelection(selectedKeys, pageKeys, checked))
                    }
                  />
                </th>
              )}
              {visibleColumns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  data-sticky={column.sticky}
                  style={stickyStyle(column, index)}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="bt-table-heading">
                    {column.sortable && onSort ? (
                      <button
                        className="bt-table-sort"
                        type="button"
                        disabled={loading || !enabled}
                        onClick={() => onSort(nextTableSort(sort, column.key))}
                      >
                        {column.header}
                        <Icon
                          name={
                            sort?.key !== column.key
                              ? "sort"
                              : sort.direction === "asc"
                                ? "sortAsc"
                                : "sortDesc"
                          }
                          size={14}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </span>
                  {onColumnWidthsChange &&
                    column.resizable !== false &&
                    (() => {
                      const bounds = columnWidthBounds(column);
                      return (
                        <hr
                          aria-orientation="vertical"
                          aria-label={`调整${column.header}列宽`}
                          aria-valuemin={bounds.min}
                          aria-valuemax={bounds.max}
                          aria-valuenow={widths[index]}
                          aria-disabled={!enabled || loading}
                          tabIndex={!enabled || loading ? -1 : 0}
                          className="bt-column-resizer"
                          onPointerDown={(event) => {
                            if (!enabled || loading || event.button !== 0) return;
                            event.preventDefault();
                            event.currentTarget.focus();
                            drag.current = {
                              key: column.key,
                              x: event.clientX,
                              width: widths[index],
                              pointerId: event.pointerId,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            if (
                              drag.current?.key === column.key &&
                              drag.current.pointerId === event.pointerId
                            )
                              updateWidth(column, drag.current.width + event.clientX - drag.current.x);
                          }}
                          onPointerUp={() => {
                            drag.current = null;
                          }}
                          onPointerCancel={() => {
                            drag.current = null;
                          }}
                          onLostPointerCapture={() => {
                            drag.current = null;
                          }}
                          onDoubleClick={() => updateWidth(column, bounds.initial)}
                          onKeyDown={(event) => {
                            const step = event.shiftKey ? 24 : 8;
                            const next =
                              event.key === "ArrowLeft"
                                ? widths[index] - step
                                : event.key === "ArrowRight"
                                  ? widths[index] + step
                                  : event.key === "Home"
                                    ? bounds.min
                                    : event.key === "End"
                                      ? bounds.max
                                      : null;
                            if (next !== null) {
                              event.preventDefault();
                              updateWidth(column, next);
                            }
                          }}
                        />
                      );
                    })()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              ["first", "second", "third", "fourth"].map((placeholder) => (
                <tr key={placeholder}>
                  <td colSpan={span}>
                    <Skeleton className="bt-table-skeleton" />
                  </td>
                </tr>
              ))
            ) : rows.length ? (
              rows.map((row) => {
                const key = getRowKey(row);
                return (
                  <tr key={key} data-selected={selected.has(key) || undefined}>
                    {onSelectionChange && (
                      <td
                        className="bt-table-selection"
                        data-sticky={constrained ? "start" : undefined}
                        style={constrained ? { left: 0 } : undefined}
                      >
                        <Checkbox
                          label={<span className="bt-sr-only">选择行 {key}</span>}
                          checked={selected.has(key)}
                          disabled={loading}
                          onChange={(checked) =>
                            onSelectionChange(setPageSelection(selectedKeys, [key], checked))
                          }
                        />
                      </td>
                    )}
                    {visibleColumns.map((column, index) => (
                      <td
                        key={column.key}
                        data-wrap={column.wrap || undefined}
                        data-sticky={column.sticky}
                        style={stickyStyle(column, index)}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={span}>
                  <Empty
                    icon={error ? "alert" : "search"}
                    title={error ? "数据暂时无法加载" : emptyTitle}
                    description={error ? "请重试，或稍后再查看。" : emptyDescription}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <span className="bt-sr-only" role="status">
        {loading
          ? rows.length
            ? "正在刷新，暂时显示原有数据。"
            : "正在加载数据。"
          : `${rows.length} 条数据`}
      </span>
    </div>
  );
}

export interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizes = [5, 10, 20, 50],
}: PaginationProps) {
  const info = paginationInfo(page, total, pageSize);
  const sizes = [
    ...new Set([...pageSizes.filter((size) => Number.isInteger(size) && size > 0), info.pageSize]),
  ];
  return (
    <nav className="bt-pagination" aria-label="分页">
      <span className="bt-pagination-summary">
        {info.from}–{info.to} / 共 {info.total} 条
      </span>
      <div className="bt-pagination-controls">
        <span className="bt-pagination-size-label">每页 {info.pageSize} 条</span>
        {onPageSizeChange && (
          <fieldset className="bt-page-sizes" aria-label="每页条数">
            {sizes.map((size) => (
              <Button
                key={size}
                size="sm"
                variant={size === info.pageSize ? "secondary" : "ghost"}
                aria-pressed={size === info.pageSize}
                onClick={() => onPageSizeChange(size)}
              >
                {size}
              </Button>
            ))}
          </fieldset>
        )}
        <Button size="sm" disabled={info.page <= 1} onClick={() => onPageChange(1)} aria-label="首页">
          <Icon name="first" size={14} />
        </Button>
        <Button
          size="sm"
          disabled={info.page <= 1}
          onClick={() => onPageChange(info.page - 1)}
          aria-label="上一页"
        >
          <Icon name="chevronLeft" size={14} />
        </Button>
        <span className="bt-pagination-page" aria-live="polite">
          第 {info.page} / {info.pages} 页
        </span>
        <Button
          size="sm"
          disabled={info.page >= info.pages}
          onClick={() => onPageChange(info.page + 1)}
          aria-label="下一页"
        >
          <Icon name="arrow" size={14} />
        </Button>
        <Button
          size="sm"
          disabled={info.page >= info.pages}
          onClick={() => onPageChange(info.pages)}
          aria-label="末页"
        >
          <Icon name="last" size={14} />
        </Button>
      </div>
    </nav>
  );
}

export function Toolbar({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`bt-toolbar toolbar ${className}`} />;
}

export interface ColumnVisibilityControlProps<T> {
  columns: readonly DataColumn<T>[];
  value: ColumnVisibility;
  onChange: (value: ColumnVisibility) => void;
  label?: string;
  disabled?: boolean;
}

export function ColumnVisibilityControl<T>({
  columns,
  value,
  onChange,
  label = "显示列",
  disabled = false,
}: ColumnVisibilityControlProps<T>) {
  const visible = visibleTableColumns(columns, value);
  return (
    <Popover
      label={`${label}设置`}
      trigger={
        <Button size="sm" disabled={disabled}>
          <Icon name="more" size={14} />
          {label}
        </Button>
      }
    >
      <fieldset className="bt-column-visibility" disabled={disabled}>
        <legend>{label}</legend>
        {columns.map((column) => {
          const checked = visible.some((item) => item.key === column.key);
          const required = Boolean(column.required || column.sticky);
          return (
            <Checkbox
              key={column.key}
              label={
                <>
                  {column.header}
                  {required && <span className="bt-column-required">必需</span>}
                </>
              }
              checked={checked}
              disabled={disabled || required || (checked && visible.length === 1)}
              onChange={(next) => onChange(setColumnVisibility(columns, value, column.key, next))}
            />
          );
        })}
      </fieldset>
    </Popover>
  );
}

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove?: () => void;
}

export interface FilterBarProps {
  children: ReactNode;
  activeFilters?: readonly ActiveFilter[];
  onClear?: () => void;
  actions?: ReactNode;
  resultCount?: number;
  label?: string;
  className?: string;
}

/** Controlled composition only: callers own filters, query/page changes and requests. */
export function FilterBar({
  children,
  activeFilters = [],
  onClear,
  actions,
  resultCount,
  label = "筛选",
  className = "",
}: FilterBarProps) {
  return (
    <section className={`bt-filter-bar ${className}`} aria-label={label}>
      <div className="bt-filter-controls">
        <div className="bt-filter-fields">{children}</div>
        {actions && <div className="bt-filter-actions">{actions}</div>}
      </div>
      {(activeFilters.length > 0 || resultCount !== undefined) && (
        <div className="bt-filter-summary">
          <div className="bt-filter-tags">
            {activeFilters.map((filter) =>
              filter.onRemove ? (
                <Button
                  key={filter.key}
                  size="sm"
                  variant="ghost"
                  className="bt-filter-tag"
                  aria-label={`移除筛选：${filter.label}`}
                  onClick={filter.onRemove}
                >
                  {filter.label}
                  <Icon name="close" size={12} />
                </Button>
              ) : (
                <span key={filter.key} className="bt-filter-tag">
                  {filter.label}
                </span>
              ),
            )}
          </div>
          <div className="bt-filter-results">
            {resultCount !== undefined && (
              <span role="status">
                {Math.max(0, Number.isFinite(resultCount) ? resultCount : 0).toLocaleString()} 条结果
              </span>
            )}
            {onClear && activeFilters.length > 0 && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                清除筛选
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
