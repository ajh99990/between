import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, Panel } from "../src/components/controls";
import {
  ColumnVisibilityControl,
  type DataColumn,
  DataTable,
  FilterBar,
  Pagination,
  type TableSort,
} from "../src/components/data-table";
import { Dialog } from "../src/components/overlays";
import { Select } from "../src/components/selection";

type RecordRow = { id: string; name: string; owner: string; state: string; date: string };
const records: RecordRow[] = Array.from({ length: 28 }, (_, index) => ({
  id: `DOC-${String(index + 1).padStart(3, "0")}`,
  name: [
    "整理阶段交接清单",
    "核对资料与下一班需要复查的事项",
    "汇总长周期访谈记录、任务依赖及公开资料索引",
    "补充内容审核意见",
  ][index % 4],
  owner: ["林知夏", "陈予安", "周序"][index % 3],
  state: ["todo", "active", "done"][index % 3],
  date: `2026-11-${String((index % 27) + 1).padStart(2, "0")}`,
}));
const states: Record<string, string> = { todo: "待开始", active: "进行中", done: "已完成" };

export function DataTableExtendedDemo() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const columns: DataColumn<RecordRow>[] = [
    {
      key: "id",
      header: "编号",
      width: 120,
      minWidth: 100,
      required: true,
      sortable: true,
      render: (row) => row.id,
    },
    {
      key: "name",
      header: "资料名称",
      width: 300,
      minWidth: 200,
      maxWidth: 600,
      wrap: true,
      sortable: true,
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: "state",
      header: "状态",
      width: 140,
      minWidth: 120,
      sortable: true,
      render: (row) => (
        <Badge tone={row.state === "done" ? "success" : row.state === "active" ? "info" : "neutral"}>
          {states[row.state]}
        </Badge>
      ),
    },
    { key: "owner", header: "负责人", width: 160, minWidth: 100, sortable: true, render: (row) => row.owner },
    { key: "date", header: "更新时间", width: 170, minWidth: 140, sortable: true, render: (row) => row.date },
    {
      key: "actions",
      header: "操作",
      width: 110,
      minWidth: 100,
      maxWidth: 160,
      sticky: "end",
      resizable: false,
      render: (row) => (
        <Button size="sm" variant="ghost" aria-label={`查看${row.id}`} onClick={() => setDetail(row)}>
          查看
        </Button>
      ),
    },
  ];
  const filtered = useMemo(() => {
    const result = records.filter(
      (row) =>
        (!query || `${row.id} ${row.name} ${row.owner}`.includes(query)) &&
        (status === "all" || row.state === status) &&
        (owner === "all" || row.owner === owner),
    );
    if (!sort) return result;
    return [...result].sort(
      (a, b) =>
        String(a[sort.key as keyof RecordRow] || "").localeCompare(
          String(b[sort.key as keyof RecordRow] || ""),
          "zh-CN",
        ) * (sort.direction === "asc" ? 1 : -1),
    );
  }, [query, status, owner, sort]);
  const reset = () => {
    setQuery("");
    setStatus("all");
    setOwner("all");
    setPage(1);
  };
  const active = [
    ...(query
      ? [
          {
            key: "query",
            label: `关键词：${query}`,
            onRemove: () => {
              setQuery("");
              setPage(1);
            },
          },
        ]
      : []),
    ...(status !== "all"
      ? [
          {
            key: "status",
            label: `状态：${states[status]}`,
            onRemove: () => {
              setStatus("all");
              setPage(1);
            },
          },
        ]
      : []),
    ...(owner !== "all"
      ? [
          {
            key: "owner",
            label: `负责人：${owner}`,
            onRemove: () => {
              setOwner("all");
              setPage(1);
            },
          },
        ]
      : []),
  ];
  return (
    <Panel className="bt-extended-table-demo">
      <h2>可调整的数据表</h2>
      <FilterBar
        label="资料复合筛选"
        activeFilters={active}
        onClear={reset}
        resultCount={filtered.length}
        actions={
          <>
            <ColumnVisibilityControl
              columns={columns}
              value={visibility}
              onChange={setVisibility}
              label="资料显示列"
            />
            <Button size="sm" onClick={() => setError(true)}>
              模拟刷新失败
            </Button>
            <Button
              size="sm"
              onClick={() => {
                reset();
                setWidths({});
                setVisibility({});
                setError(false);
                setSelected([]);
              }}
            >
              恢复表格示例
            </Button>
          </>
        }
      >
        <Field label="检索资料">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="名称、编号或负责人…"
          />
        </Field>
        <Field label="资料状态">
          <Select
            label="资料状态"
            value={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部状态" },
              ...Object.entries(states).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Field>
        <Field label="资料负责人">
          <Select
            label="资料负责人"
            value={owner}
            onChange={(next) => {
              setOwner(next);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部负责人" },
              ...["林知夏", "陈予安", "周序"].map((name) => ({ value: name, label: name })),
            ]}
          />
        </Field>
      </FilterBar>
      <p className="bt-structured-note">已选 {selected.length} 项</p>
      <DataTable
        label="可调资料表"
        rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
        columns={columns}
        getRowKey={(row) => row.id}
        sort={sort}
        onSort={setSort}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        columnWidths={widths}
        onColumnWidthsChange={setWidths}
        columnVisibility={visibility}
        stickyHeader
        maxHeight={420}
        error={error ? "刷新失败，当前资料仍可查看。" : undefined}
        onRetry={() => setError(false)}
        emptyTitle="没有匹配的资料"
        emptyDescription={
          <Button size="sm" onClick={reset}>
            清除全部条件
          </Button>
        }
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
      <Dialog
        open={Boolean(detail)}
        title={detail?.name || "资料"}
        onClose={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        <p>
          {detail?.id} · {detail?.owner} · {detail ? states[detail.state] : ""}
        </p>
      </Dialog>
    </Panel>
  );
}
