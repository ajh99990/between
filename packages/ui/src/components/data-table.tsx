import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../icons";
import { useUiEnabled, useUiReducedMotion } from "../provider";
import { Button, Checkbox, Empty, ErrorNotice, Skeleton } from "./controls";

export type TableSort = { key: string; direction: "asc" | "desc" };

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Opt long prose into wrapping; short labels stay intact in horizontal scroll. */
  wrap?: boolean;
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
}: DataTableProps<T>) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const pageKeys = rows.map(getRowKey);
  const selected = new Set(selectedKeys);
  const span = columns.length + (onSelectionChange ? 1 : 0);
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
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the wide table region. */}
      <section className="bt-table-scroll" aria-label={label} tabIndex={0}>
        <table className="bt-data-table">
          <caption className="bt-sr-only">{label}</caption>
          <thead>
            <tr>
              {onSelectionChange && (
                <th scope="col" className="bt-table-selection">
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
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
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
                      <td className="bt-table-selection">
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
                    {columns.map((column) => (
                      <td key={column.key} data-wrap={column.wrap || undefined}>
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
