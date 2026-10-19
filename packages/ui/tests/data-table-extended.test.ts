import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  clampColumnWidth,
  columnWidthBounds,
  type DataColumn,
  DataTable,
  FilterBar,
  setColumnVisibility,
  visibleTableColumns,
} from "../src/components/data-table";

const columns: DataColumn<{ id: string }>[] = [
  { key: "id", header: "编号", render: (row) => row.id, required: true, width: 120 },
  { key: "name", header: "名称", render: () => "资料", width: 240, minWidth: 160, maxWidth: 500 },
  { key: "actions", header: "操作", render: () => "查看", sticky: "end", width: 100 },
];

describe("controlled table layout", () => {
  it("retains required and fixed action columns even if external visibility says otherwise", () => {
    expect(
      visibleTableColumns(columns, { id: false, name: false, actions: false }).map((column) => column.key),
    ).toEqual(["id", "actions"]);
    expect(setColumnVisibility(columns, {}, "id", false)).toEqual({});
    expect(setColumnVisibility(columns, {}, "actions", false)).toEqual({});
  });

  it("refuses to hide the last data column and recovers malformed all-hidden state without mutation", () => {
    const ordinary = columns.slice(0, 2).map((column) => ({ ...column, required: false }));
    const state = Object.freeze({ id: false });
    expect(setColumnVisibility(ordinary, state, "name", false)).toBe(state);
    expect(visibleTableColumns(ordinary, { id: false, name: false }).map((column) => column.key)).toEqual([
      "id",
    ]);
    expect(state).toEqual({ id: false });
  });

  it("clamps pointer and keyboard intents to finite minimum and maximum sizes", () => {
    expect(clampColumnWidth(columns[1], 10)).toBe(160);
    expect(clampColumnWidth(columns[1], 900)).toBe(500);
    expect(clampColumnWidth(columns[1], Number.NaN)).toBe(240);
    expect(columnWidthBounds({ minWidth: 400, maxWidth: 100, width: -1 })).toEqual({
      min: 400,
      max: 400,
      initial: 400,
    });
  });

  it("renders fixed columns, sticky headers and operable keyboard resize without altering row order", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<{ id: string }>, {
        label: "资料表",
        rows: [{ id: "b" }, { id: "a" }],
        columns,
        getRowKey: (row) => row.id,
        onColumnWidthsChange() {},
        stickyHeader: true,
        maxHeight: 240,
        selectedKeys: ["outside"],
        onSelectionChange() {},
      }),
    );
    expect(html).toContain('data-sticky="end"');
    expect(html).toContain('data-sticky-header="true"');
    expect(html).toContain('<hr aria-orientation="vertical"');
    expect(html).toContain('aria-valuemin="160"');
    expect(html).toContain('aria-valuemax="500"');
    expect(html.indexOf("选择行 b")).toBeLessThan(html.indexOf("选择行 a"));
  });

  it("does not expose an inert resize affordance without a controlled callback", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<{ id: string }>, {
        label: "资料表",
        rows: [{ id: "a" }],
        columns,
        getRowKey: (row) => row.id,
      }),
    );
    expect(html).not.toContain("bt-column-resizer");
  });

  it("renders removable filters and truthful result count without owning filtering or page state", () => {
    const props: ComponentProps<typeof FilterBar> = {
      children: "筛选控件",
      activeFilters: [{ key: "status", label: "状态：进行中", onRemove() {} }],
      resultCount: 0,
      onClear() {},
    };
    const html = renderToStaticMarkup(createElement(FilterBar, props));
    expect(html).toContain("0 条结果");
    expect(html).toContain('aria-label="移除筛选：状态：进行中"');
    expect(html).toContain("清除筛选");
  });
});
