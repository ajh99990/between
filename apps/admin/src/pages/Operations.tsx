import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  Input,
  PageHeader,
  Pagination,
  Panel,
  Select,
  Textarea,
} from "@between/ui";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { api } from "../api";
import { readerScrollBehavior } from "../reader-motion";
import { useAdmin, useDirtyGuard } from "../state";
import type { Config, PlanConfig, Preset } from "../types";

const clone = <T,>(value: T): T => structuredClone(value);
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
};
const message = (error: unknown) => (error instanceof Error ? error.message : "操作失败，请重试。");
const normalized = (value: string) => value.trim().toLocaleLowerCase();
const match = (query: string, ...values: unknown[]) =>
  values.join(" ").toLocaleLowerCase().includes(normalized(query));
const numberValue = (value: number) => (Number.isFinite(value) ? value : "");

type Confirmation = {
  title: string;
  description: ReactNode;
  label: string;
  danger?: boolean;
  action: () => Promise<boolean>;
};
function useConfirmation() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const confirm = async () => {
    if (!confirmation || lock.current) return;
    lock.current = true;
    setPending(true);
    setFailed(false);
    try {
      if (await confirmation.action()) setConfirmation(null);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  return {
    ask: (next: Confirmation) => {
      setFailed(false);
      setConfirmation(next);
    },
    dialog: (
      <Dialog
        open={!!confirmation}
        title={confirmation?.title ?? ""}
        size="sm"
        closeDisabled={pending}
        onClose={() => {
          if (!pending) setConfirmation(null);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              variant={confirmation?.danger ? "danger" : "primary"}
              loading={pending}
              onClick={() => void confirm()}
            >
              {confirmation?.label ?? "确认"}
            </Button>
          </>
        }
      >
        <div className="confirmation-copy">{confirmation?.description}</div>
        {failed && (
          <div className="notice error" role="alert">
            操作未完成，当前内容已保留。请取消返回查看错误提示，调整后重试。
          </div>
        )}
      </Dialog>
    ),
  };
}

function useOperation() {
  const { refresh, notify } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      try {
        await refresh();
      } catch {
        notify("操作已完成，但读取最新状态失败。请刷新状态，不要重复提交。", "error");
        return true;
      }
      notify(success, "success");
      return true;
    } catch (error) {
      const text = message(error);
      setError(text);
      notify(text, "error");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Search({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <Input
        className="text-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

function usePagination<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  return {
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    reset: () => setPage(1),
    control:
      rows.length > pageSize ? (
        <Pagination page={current} total={rows.length} pageSize={pageSize} onPageChange={setPage} />
      ) : null,
  };
}

const planLabels: Record<string, string> = {
  unbound: "未连接",
  authorization_required: "等待授权",
  scope_missing: "授权范围不足",
  expired: "授权已过期",
  disconnected: "本地已断开",
  auth_rejected: "授权被拒绝",
  ready: "已授权 · 等待首次响应",
  completed: "推理已完成",
  usage_limit: "额度暂停",
  unsupported: "配置不受支持",
  unavailable: "服务暂不可用",
  rate_limited: "请求限流",
  incomplete: "响应未完成",
  cancelled: "已取消",
  failed: "请求失败",
};
const connectionLabels: Record<string, string> = {
  unconfigured: "未配置",
  unchecked: "已配置 · 未验证",
  connected: "模型已响应",
  "auth-required": "需要授权",
  error: "连接异常",
  demo: "演示模式",
};
type Editor =
  | {
      kind: "connection";
      config: Config;
      initial: { url: string; name: string };
      value: { url: string; name: string };
    }
  | { kind: "plan"; config: Config; initial: PlanConfig; value: PlanConfig }
  | { kind: "preset"; config: Config; initial: Preset; value: Preset };

export function ModelsPage() {
  const { state, save } = useAdmin();
  const { busy, error, run } = useOperation();
  const { ask, dialog } = useConfirmation();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [validation, setValidation] = useState("");
  const dirty = !!editor && JSON.stringify(editor.value) !== JSON.stringify(editor.initial);
  useDirtyGuard(dirty);
  const begin = (kind: Editor["kind"]) => {
    const config = clone(state.config);
    setValidation("");
    if (kind === "connection") {
      const value = clone(config.model ?? { url: "", name: state.model.model || "" });
      setEditor({ kind, config, initial: clone(value), value });
    }
    if (kind === "plan") {
      const value = clone(config.planBackend);
      setEditor({ kind, config, initial: clone(value), value });
    }
    if (kind === "preset") {
      const value = clone(config.preset);
      setEditor({ kind, config, initial: clone(value), value });
    }
    requestAnimationFrame(() =>
      document
        .getElementById("model-editor")
        ?.scrollIntoView({ block: "start", behavior: readerScrollBehavior() }),
    );
  };
  const cancel = () => {
    if (!dirty) {
      setEditor(null);
      return;
    }
    ask({
      title: "放弃未保存的修改？",
      description: "本次编辑尚未写入服务。放弃后将保留原设置。",
      label: "放弃修改",
      danger: true,
      action: async () => {
        setEditor(null);
        return true;
      },
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setValidation("");
    if (editor.kind === "preset") {
      const value = editor.value;
      if (
        !Number.isInteger(value.context) ||
        !Number.isInteger(value.maxTokens) ||
        value.context < 2 ||
        value.context > 128000 ||
        value.maxTokens < 1 ||
        value.maxTokens >= value.context ||
        !Number.isFinite(value.temperature) ||
        value.temperature < 0 ||
        value.temperature > 2
      ) {
        setValidation("请输入有效参数：上下文须为 2–128000 的整数，回复上限须小于上下文，温度须为 0–2。");
        return;
      }
    }
    ask({
      title:
        editor.kind === "connection"
          ? "保存模型连接？"
          : editor.kind === "plan"
            ? "保存套餐后端？"
            : "保存提示预设？",
      description:
        editor.kind === "preset"
          ? "仅影响之后创建的新会话，已有会话保留原快照。"
          : editor.kind === "plan"
            ? "影响所有用户之后的模型请求，共用本机 Between 授权与额度。本次保存不发送推理请求。"
            : "影响后续请求。密钥沿用服务端运行配置，本次保存不发送推理请求。",
      label: "确认保存",
      action: async () => {
        let ok = false;
        if (editor.kind === "preset") {
          ok = await save({ ...editor.config, preset: { ...editor.config.preset, ...editor.value } });
        }
        if (editor.kind === "connection")
          ok = await run(
            () => api("/model", "PUT", { ...editor.value, confirm: true }),
            "连接已保存，等待后续请求验证。",
          );
        if (editor.kind === "plan")
          ok = await run(
            () =>
              api("/plan", "PUT", { ...editor.value, expectedVersion: editor.config.version, confirm: true }),
            "套餐设置已保存，未发送推理请求。",
          );
        if (ok) setEditor(null);
        return ok;
      },
    });
  };
  const preset = state.config.preset;
  return (
    <div className="page-stack">
      <PageHeader title="模型与提示词" description="管理后续请求的连接，以及新会话使用的提示预设。" />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel className="section-card">
        <div className="toolbar">
          <div>
            <h2>ChatGPT 套餐后端</h2>
            <p className="muted">{state.plan.description}</p>
          </div>
          <Badge tone={state.config.planBackend.enabled ? "success" : "neutral"}>
            {state.config.planBackend.enabled ? "当前启用" : "未启用"}
          </Badge>
        </div>
        <dl className="field-grid">
          <div>
            <dt>模型</dt>
            <dd>{state.config.planBackend.model || "未设置"}</dd>
          </div>
          <div>
            <dt>思考档位</dt>
            <dd>{state.config.planBackend.reasoningEffort === "high" ? "高 · high" : "中等 · medium"}</dd>
          </div>
          <div>
            <dt>连接状态</dt>
            <dd>{planLabels[String(state.plan.connection)] ?? String(state.plan.connection ?? "未知")}</dd>
          </div>
        </dl>
        <p className="notice">
          共用本机独立 Between
          授权与额度。套餐模式忽略温度和回复上限，仍遵循上下文预算。授权由既有本机助手管理，此页面不接收或显示凭据。
        </p>
        <div className="inline-actions">
          <Button variant="secondary" disabled={busy || !!editor} onClick={() => begin("plan")}>
            编辑套餐设置
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !!editor || state.plan.connection !== "usage_limit"}
            onClick={() =>
              ask({
                title: "恢复套餐请求？",
                description:
                  "请先自行查看 Usage 并确认额度可用。本操作只解除本地额度暂停，不检查额度、不重新授权，也不发送推理请求。",
                label: "已查看额度，恢复",
                action: () =>
                  run(
                    () => api("/plan", "PUT", { action: "resume", confirm: true }),
                    "已解除本地额度暂停。后续请求仍由服务商校验额度。",
                  ),
              })
            }
          >
            恢复额度暂停
          </Button>
          <Button
            variant="danger"
            disabled={busy || !!editor}
            onClick={() =>
              ask({
                title: "断开本地套餐连接？",
                description: "会停止所有正在运行的生成任务并断开本地套餐连接。服务商侧的授权撤销需另行操作。",
                label: "断开本地连接",
                danger: true,
                action: () =>
                  run(
                    () => api("/plan", "PUT", { action: "disconnect", confirm: true }),
                    "本地套餐连接已断开。",
                  ),
              })
            }
          >
            断开连接
          </Button>
        </div>
      </Panel>
      <Panel className="section-card">
        <div className="toolbar">
          <div>
            <h2>Chat Completions 连接</h2>
            <p className="muted">
              {state.model.mode === "demo" ? "未连接模型服务，回复为演示内容。" : state.model.description}
            </p>
          </div>
          <Badge tone={state.model.connection === "connected" ? "success" : "neutral"}>
            {connectionLabels[state.model.connection] ?? state.model.connection}
          </Badge>
        </div>
        <dl className="field-grid">
          <div>
            <dt>服务根地址</dt>
            <dd className="meta">{state.config.model?.url || "由启动配置提供，后台未保存地址"}</dd>
          </div>
          <div>
            <dt>模型名称</dt>
            <dd>{state.model.model || "未设置"}</dd>
          </div>
          <div>
            <dt>运行时密钥</dt>
            <dd>{state.model.credentialConfigured ? "服务端已配置 · 不可读取" : "未提供"}</dd>
          </div>
        </dl>
        <p className="muted">
          Token 预算按 gpt-4o-mini 估算，其他模型可能有差异。
          {state.model.mode === "demo" ? "演示模式下不可修改连接。" : "保存后，在首次请求时检查连接。"}
        </p>
        <Button
          variant="secondary"
          disabled={busy || !!editor || state.model.mode === "demo"}
          onClick={() => begin("connection")}
        >
          编辑模型连接
        </Button>
      </Panel>
      <Panel className="section-card">
        <div className="toolbar">
          <div>
            <h2>提示词与生成参数</h2>
            <p className="muted">仅用于新会话；已有会话保留创建时的参数。</p>
          </div>
          <Button variant="secondary" disabled={busy || !!editor} onClick={() => begin("preset")}>
            编辑预设
          </Button>
        </div>
        <dl className="field-grid">
          <div>
            <dt>上下文预算</dt>
            <dd>{preset.context.toLocaleString()} tokens</dd>
          </div>
          <div>
            <dt>回复上限</dt>
            <dd>{preset.maxTokens.toLocaleString()} tokens</dd>
          </div>
          <div>
            <dt>生成温度</dt>
            <dd>{preset.temperature}</dd>
          </div>
          <div>
            <dt>优先保留示例</dt>
            <dd>{preset.pinExamples ? "开启" : "关闭"}</dd>
          </div>
        </dl>
        <h3>全局历史后指令</h3>
        <div className="prompt-text">{preset.postHistory || <span className="muted">未设置</span>}</div>
      </Panel>
      {editor && (
        <Panel className="section-card">
          <section id="model-editor" aria-labelledby="model-editor-title">
            <div className="toolbar">
              <h2 id="model-editor-title">
                {editor.kind === "connection"
                  ? "编辑模型连接"
                  : editor.kind === "plan"
                    ? "编辑套餐后端"
                    : "编辑提示预设"}
              </h2>
              <Badge tone="info">{dirty ? "未保存的修改" : "编辑中"}</Badge>
            </div>
            {editor.kind !== "connection" && editor.config.version !== state.config.version && (
              <div className="notice warning">
                服务配置已更新。当前草稿保留原版本 v{editor.config.version}，保存时将进行版本检查。
              </div>
            )}
            <form onSubmit={submit}>
              {editor.kind === "connection" && (
                <div className="field-grid">
                  <Field
                    label="兼容服务根地址"
                    description="HTTPS 或本机 HTTP，不得包含用户名、密码或查询参数。"
                  >
                    <Input
                      className="text-input"
                      type="url"
                      required
                      value={editor.value.url}
                      placeholder="https://example.com/v1"
                      onChange={(event) => {
                        const url = event.target.value;
                        setEditor({ ...editor, value: { ...editor.value, url } });
                      }}
                    />
                  </Field>
                  <Field label="模型名称">
                    <Input
                      className="text-input"
                      required
                      maxLength={200}
                      value={editor.value.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        setEditor({ ...editor, value: { ...editor.value, name } });
                      }}
                    />
                  </Field>
                </div>
              )}
              {editor.kind === "plan" && (
                <div className="page-stack">
                  <Checkbox
                    label="启用套餐后端"
                    className="checkbox-row"
                    checked={editor.value.enabled}
                    onChange={(checked) => {
                      const enabled = checked;
                      setEditor({ ...editor, value: { ...editor.value, enabled } });
                    }}
                  />
                  <div className="field-grid">
                    <Field label="套餐模型名称">
                      <Input
                        className="text-input"
                        required={editor.value.enabled}
                        maxLength={200}
                        value={editor.value.model}
                        onChange={(event) => {
                          const model = event.target.value;
                          setEditor({ ...editor, value: { ...editor.value, model } });
                        }}
                      />
                    </Field>
                    <Field label="思考档位">
                      <Select
                        label="思考档位"
                        value={editor.value.reasoningEffort}
                        options={[
                          { value: "medium", label: "中等 · medium" },
                          { value: "high", label: "高 · high" },
                        ]}
                        onChange={(value) =>
                          setEditor({
                            ...editor,
                            value: {
                              ...editor.value,
                              reasoningEffort: value as PlanConfig["reasoningEffort"],
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                  {state.tasks.length > 0 && (
                    <div className="notice warning">
                      当前有 {state.tasks.length} 个任务，切换后端前需先在会话与任务页停止任务。
                    </div>
                  )}
                </div>
              )}
              {editor.kind === "preset" && (
                <div className="page-stack">
                  <div className="field-grid">
                    <Field label="上下文预算" description="两种后端均遵循，最多 128000 tokens。">
                      <Input
                        className="text-input"
                        type="number"
                        min={2}
                        max={128000}
                        step={1}
                        required
                        value={numberValue(editor.value.context)}
                        onChange={(event) => {
                          const context = event.target.valueAsNumber;
                          setEditor({ ...editor, value: { ...editor.value, context } });
                        }}
                      />
                    </Field>
                    <Field label="回复 Token 上限" description="须小于上下文预算，套餐模式忽略此项。">
                      <Input
                        className="text-input"
                        type="number"
                        min={1}
                        max={numberValue(editor.value.context - 1)}
                        step={1}
                        required
                        value={numberValue(editor.value.maxTokens)}
                        onChange={(event) => {
                          const maxTokens = event.target.valueAsNumber;
                          setEditor({ ...editor, value: { ...editor.value, maxTokens } });
                        }}
                      />
                    </Field>
                    <Field label="生成温度" description="0–2，套餐模式忽略此项。">
                      <Input
                        className="text-input"
                        type="number"
                        min={0}
                        max={2}
                        step="any"
                        required
                        value={numberValue(editor.value.temperature)}
                        onChange={(event) => {
                          const temperature = event.target.valueAsNumber;
                          setEditor({ ...editor, value: { ...editor.value, temperature } });
                        }}
                      />
                    </Field>
                    <Checkbox
                      label="优先保留对话示例"
                      className="checkbox-row"
                      checked={editor.value.pinExamples}
                      onChange={(checked) => {
                        const pinExamples = checked;
                        setEditor({ ...editor, value: { ...editor.value, pinExamples } });
                      }}
                    />
                  </div>
                  <Field label="全局历史后指令" description="最多 10000 字符，仅进入新会话的模型上下文。">
                    <Textarea
                      className="text-area"
                      rows={12}
                      maxLength={10000}
                      value={editor.value.postHistory}
                      onChange={(event) => {
                        const postHistory = event.target.value;
                        setEditor({ ...editor, value: { ...editor.value, postHistory } });
                      }}
                    />
                  </Field>
                </div>
              )}
              {validation && <ErrorNotice>{validation}</ErrorNotice>}
              <div className="editor-footer">
                <Button variant="secondary" type="button" disabled={busy} onClick={cancel}>
                  取消编辑
                </Button>
                <Button variant="primary" type="submit" loading={busy} disabled={!dirty}>
                  保存设置
                </Button>
              </div>
            </form>
          </section>
        </Panel>
      )}
      {dialog}
    </div>
  );
}

export function SessionsPage() {
  const { state } = useAdmin();
  const { busy, error, run } = useOperation();
  const { ask, dialog } = useConfirmation();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const sessions = state.users.flatMap((user) =>
    user.conversations.map((conversation) => ({ ...conversation, userId: user.id })),
  );
  const filtered = sessions.filter(
    (item) =>
      (role === "all" || item.role === role) && match(query, item.title, item.name, item.id, item.userId),
  );
  const pagination = usePagination(filtered);
  const roleOptions = [...new Map(sessions.map((item) => [item.role, item.name])).entries()].map(
    ([value, label]) => ({ value, label }),
  );
  const modes: Record<string, string> = {
    normal: "文本对话",
    regenerate: "重新生成",
    voice: "语音",
    image: "生成图片",
    caption: "图像描述",
  };
  return (
    <div className="page-stack">
      <PageHeader title="会话与任务" description="查看会话、停止生成或删除会话。" />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel className="section-card task-overview">
        <div className="toolbar">
          <div>
            <h2>正在运行的任务</h2>
            <p className="muted">停止后，本轮未完成内容不会保存。</p>
          </div>
          <Badge tone={state.tasks.length ? "info" : "neutral"}>{state.tasks.length} 个任务</Badge>
        </div>
        {state.tasks.length ? (
          <DataTable
            label="正在运行的生成任务"
            rows={state.tasks}
            getRowKey={(task) => task.id}
            columns={[
              {
                key: "task",
                header: "任务 / 会话",
                render: (task) => (
                  <>
                    <div className="meta">{task.id}</div>
                    <div className="meta muted">{task.conversation}</div>
                  </>
                ),
              },
              { key: "user", header: "用户", render: (task) => <span className="meta">{task.userId}</span> },
              { key: "mode", header: "类型", render: (task) => <>{modes[task.mode] ?? task.mode}</> },
              { key: "started", header: "开始时间", render: (task) => <>{date(task.startedAt)}</> },
              {
                key: "actions",
                header: "操作",
                render: (task) => (
                  <>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() =>
                        ask({
                          title: "停止此生成任务？",
                          description: (
                            <>
                              <p className="meta">{task.id}</p>
                              <p>未完成的本轮内容不会保存。</p>
                            </>
                          ),
                          label: "停止任务",
                          danger: true,
                          action: () =>
                            run(() => api("/stop", "POST", { taskId: task.id }), "停止请求已发送。"),
                        })
                      }
                    >
                      停止任务
                    </Button>
                  </>
                ),
              },
            ]}
          />
        ) : (
          <Empty icon="sessions" title="当前没有生成任务" description="任务运行时会出现在这里。" />
        )}
      </Panel>
      <Panel className="section-card">
        <div className="toolbar">
          <h2>已保存的会话</h2>
          <span className="meta">
            {filtered.length} / {sessions.length} 个会话
          </span>
        </div>
        <div className="field-grid">
          <Search
            label="搜索会话"
            value={query}
            placeholder="会话名称、会话 ID 或用户 ID"
            onChange={(value) => {
              setQuery(value);
              pagination.reset();
            }}
          />
          <Field label="角色">
            <Select
              label="角色"
              value={role}
              options={[{ value: "all", label: "全部角色" }, ...roleOptions]}
              onChange={(value) => {
                setRole(value);
                pagination.reset();
              }}
            />
          </Field>
        </div>
        {filtered.length ? (
          <>
            <DataTable
              label="已保存的会话"
              rows={pagination.rows}
              getRowKey={(item) => `${item.userId}:${item.id}`}
              columns={[
                {
                  key: "session",
                  wrap: true,
                  header: "会话",
                  render: (item) => (
                    <>
                      <div>{item.title}</div>
                      <div className="meta muted">{item.id}</div>
                    </>
                  ),
                },
                { key: "role", header: "角色", render: (item) => <>{item.name}</> },
                {
                  key: "user",
                  header: "所属用户",
                  render: (item) => <span className="meta">{item.userId}</span>,
                },
                {
                  key: "version",
                  header: "配置版本",
                  render: (item) => (
                    <>
                      <Badge>v{item.configVersion}</Badge>
                    </>
                  ),
                },
                { key: "created", header: "创建时间", render: (item) => <>{date(item.createdAt)}</> },
                {
                  key: "actions",
                  header: "操作",
                  render: (item) => (
                    <>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() =>
                          ask({
                            title: `删除「${item.title}」？`,
                            description: (
                              <>
                                <p className="meta">{item.id}</p>
                                <p>
                                  会停止此会话的任务并永久删除本机保存的聊天、媒体与幂等记录。不能撤销，不删除外部服务数据。
                                </p>
                              </>
                            ),
                            label: "永久删除会话",
                            danger: true,
                            action: () =>
                              run(
                                () =>
                                  api("/conversation", "DELETE", {
                                    userId: item.userId,
                                    conversation: item.id,
                                    confirm: true,
                                  }),
                                "会话已删除。",
                              ),
                          })
                        }
                      >
                        删除
                      </Button>
                    </>
                  ),
                },
              ]}
            />
            {pagination.control}
          </>
        ) : (
          <Empty
            icon={sessions.length ? "search" : "sessions"}
            title={sessions.length ? "没有匹配的会话" : "还没有会话"}
            description={sessions.length ? "调整搜索内容或角色筛选后重试。" : "用户创建会话后会出现在这里。"}
            action={
              sessions.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setRole("all");
                    pagination.reset();
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        )}
        <p className="muted">此处仅显示会话信息，不含聊天正文。配置版本为会话创建时的版本。</p>
      </Panel>
      {dialog}
    </div>
  );
}

export function UsersPage() {
  const { state, save } = useAdmin();
  const { busy, error, run } = useOperation();
  const { ask, dialog } = useConfirmation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const users = state.users.filter(
    (user) =>
      (status === "all" || (status === "disabled" ? user.disabled : !user.disabled)) && match(query, user.id),
  );
  const pagination = usePagination(users);
  const changeGlobal = (key: "paused" | "acceptNew", value: boolean) => {
    const config = clone(state.config);
    ask({
      title:
        key === "paused"
          ? value
            ? "暂停新的生成请求？"
            : "恢复新的生成请求？"
          : value
            ? "开放新用户进入？"
            : "暂停新用户进入？",
      description:
        key === "paused"
          ? "该设置控制之后的生成请求。已经运行的任务会继续，需在会话与任务页单独停止。"
          : "该设置只影响尚未初始化的浏览器身份，已有用户仍可进入。",
      label: "确认更改",
      danger: key === "paused" ? value : !value,
      action: () => save({ ...config, [key]: value }),
    });
  };
  return (
    <div className="page-stack">
      <PageHeader title="用户与全局" description="管理浏览器用户，以及新用户进入和生成请求。" />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel className="section-card">
        <h2>全局控制</h2>
        <div className="setting-row">
          <div>
            <h3>新用户进入</h3>
            <p className="muted">只控制新浏览器身份的初始化，已有用户不受影响。</p>
          </div>
          <Badge tone={state.config.acceptNew ? "success" : "warning"}>
            {state.config.acceptNew ? "开放" : "已暂停"}
          </Badge>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => changeGlobal("acceptNew", !state.config.acceptNew)}
          >
            {state.config.acceptNew ? "暂停新用户" : "开放新用户"}
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <h3>生成请求</h3>
            <p className="muted">暂停新的生成，正在运行的任务需单独停止。</p>
          </div>
          <Badge tone={state.config.paused ? "warning" : "success"}>
            {state.config.paused ? "已暂停" : "正常"}
          </Badge>
          <Button
            variant={state.config.paused ? "secondary" : "danger"}
            disabled={busy}
            onClick={() => changeGlobal("paused", !state.config.paused)}
          >
            {state.config.paused ? "恢复生成" : "暂停生成"}
          </Button>
        </div>
      </Panel>
      <Panel className="section-card">
        <div className="toolbar">
          <h2>浏览器用户</h2>
          <span className="meta">
            {state.users.filter((user) => !user.disabled).length} 正常 ·{" "}
            {state.users.filter((user) => user.disabled).length} 已停用
          </span>
        </div>
        <div className="field-grid">
          <Search
            label="搜索用户"
            value={query}
            placeholder="用户 ID"
            onChange={(value) => {
              setQuery(value);
              pagination.reset();
            }}
          />
          <Field label="用户状态">
            <Select
              label="用户状态"
              value={status}
              options={[
                { value: "all", label: "全部状态" },
                { value: "active", label: "正常" },
                { value: "disabled", label: "已停用" },
              ]}
              onChange={(value) => {
                setStatus(value);
                pagination.reset();
              }}
            />
          </Field>
        </div>
        {users.length ? (
          <>
            <DataTable
              label="浏览器身份用户"
              rows={pagination.rows}
              getRowKey={(user) => user.id}
              columns={[
                { key: "user", header: "用户 ID", render: (user) => <span className="meta">{user.id}</span> },
                {
                  key: "status",
                  header: "状态",
                  render: (user) => (
                    <>
                      <Badge tone={user.disabled ? "warning" : "success"}>
                        {user.disabled ? "已停用" : "正常"}
                      </Badge>
                    </>
                  ),
                },
                { key: "sessions", header: "会话数", render: (user) => <>{user.conversations.length}</> },
                { key: "created", header: "创建时间", render: (user) => <>{date(user.createdAt)}</> },
                {
                  key: "actions",
                  header: "操作",
                  render: (user) => (
                    <>
                      <Button
                        variant={user.disabled ? "secondary" : "danger"}
                        disabled={busy}
                        onClick={() =>
                          ask({
                            title: user.disabled ? "恢复此用户？" : "停用此用户？",
                            description: (
                              <>
                                <p className="meta">{user.id}</p>
                                <p>
                                  {user.disabled
                                    ? "恢复后，该浏览器身份可继续访问自己的会话。"
                                    : "会停止该用户正在运行的任务并禁止访问，不删除已有会话。"}
                                </p>
                              </>
                            ),
                            label: user.disabled ? "恢复用户" : "停用用户",
                            danger: !user.disabled,
                            action: () =>
                              run(
                                () =>
                                  api("/user", "PUT", {
                                    userId: user.id,
                                    disabled: !user.disabled,
                                    confirm: true,
                                  }),
                                user.disabled ? "用户已恢复。" : "用户已停用。",
                              ),
                          })
                        }
                      >
                        {user.disabled ? "恢复" : "停用"}
                      </Button>
                    </>
                  ),
                },
              ]}
            />
            {pagination.control}
          </>
        ) : (
          <Empty
            icon={state.users.length ? "search" : "users"}
            title={state.users.length ? "没有匹配的用户" : "还没有浏览器用户"}
            description={
              state.users.length
                ? "调整搜索或状态筛选后重试。"
                : "用户首次进入聊天页并初始化会话后，会出现在这里。"
            }
            action={
              state.users.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    pagination.reset();
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        )}
        <p className="muted">用户由浏览器标识区分。同一个人在不同浏览器中会显示为不同用户。</p>
      </Panel>
      {dialog}
    </div>
  );
}

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  let safe = false;
  try {
    safe = new URL(url).protocol === "https:";
  } catch {
    /* Invalid references remain plain text. */
  }
  return safe ? (
    <a href={url} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}

export function ResourcesPage() {
  const { state } = useAdmin();
  const { busy, error, run } = useOperation();
  const { ask, dialog } = useConfirmation();
  const [query, setQuery] = useState("");
  const items = state.community.items.filter((item) =>
    match(query, item.name, item.scenarios, item.language),
  );
  return (
    <div className="page-stack">
      <PageHeader title="社区素材" description="导入角色卡与关联世界书，供新会话使用。" />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel className="section-card">
        <div className="toolbar">
          <h2>素材目录</h2>
          <span className="meta">
            {items.length} / {state.community.items.length} 份素材
          </span>
        </div>
        <Search label="搜索素材" value={query} placeholder="角色名称、适用场景或语言" onChange={setQuery} />
        {items.length ? (
          <div className="resource-list">
            {items.map((item) => {
              const imported = state.config.roles.find((role) => role.id === `community-${item.id}`);
              const bookCollision =
                !imported && state.config.books.some((book) => book.id === `community-${item.id}-world`);
              const capacity = state.config.roles.length >= 20 || state.config.books.length >= 100;
              const disabledReason =
                state.community.importBlocker ||
                (bookCollision
                  ? "同 ID 世界书已存在，请先在世界书页处理。"
                  : capacity
                    ? "角色或世界书已达到容量上限。"
                    : "");
              return (
                <article className="resource-row" key={item.id}>
                  <div className="toolbar">
                    <div>
                      <h3>{item.name}</h3>
                      <p className="meta">
                        {item.language} · 世界书 {item.entryCount} 条目
                      </p>
                    </div>
                    {imported && <Badge tone="success">已导入</Badge>}
                  </div>
                  <dl>
                    <div>
                      <dt>适用场景</dt>
                      <dd>{item.scenarios}</dd>
                    </div>
                    <div>
                      <dt>内容说明</dt>
                      <dd>{item.contentNotes}</dd>
                    </div>
                  </dl>
                  <div className="toolbar">
                    <SourceLink url={item.sourceURL}>查看原始素材</SourceLink>
                    {!imported && (
                      <Button
                        variant="secondary"
                        disabled={busy || !!disabledReason}
                        onClick={() => {
                          const expectedVersion = state.config.version;
                          ask({
                            title: `导入「${item.name}」？`,
                            description: (
                              <>
                                <p>将新增角色卡和包含 {item.entryCount} 条目的世界书，二者会自动关联。</p>
                                <p>仅用于新会话，已有会话不变。</p>
                                <p className="muted">作者 Foreverse Team · CC BY 4.0</p>
                              </>
                            ),
                            label: "确认导入",
                            action: () =>
                              run(
                                () =>
                                  api("/community/import", "POST", {
                                    id: item.id,
                                    expectedVersion,
                                    confirm: true,
                                  }),
                                "角色及世界书已导入，将用于新会话。",
                              ),
                          });
                        }}
                      >
                        导入素材
                      </Button>
                    )}
                  </div>
                  {disabledReason && !imported && <p className="notice warning">{disabledReason}</p>}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="没有匹配的素材"
            description="调整关键词后重试。"
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                清除搜索
              </Button>
            }
          />
        )}
      </Panel>
      <Panel className="section-card">
        <h2>素材来源</h2>
        <p>{state.community.license}</p>
        <SourceLink url={state.community.source}>Foreverse Team 角色卡库</SourceLink>
        <p className="muted">当前可导入此目录中的素材，暂不支持文件上传、外部链接导入或导出。</p>
      </Panel>
      {dialog}
    </div>
  );
}

const auditLabels: Record<string, string> = {
  "config.update": "保存配置",
  "community.import": "导入社区素材",
  "model.update": "更新模型连接",
  "plan.backend.update": "更新套餐设置",
  "user.disable": "停用用户",
  "user.enable": "恢复用户",
  "conversation.delete": "删除会话",
  "task.stop": "停止任务",
  "turn.complete": "对话完成",
  "turn.cancel": "对话取消",
  "turn.fail": "对话失败",
};
const diagnosticLabels: Record<string, string> = {
  langfuse: "Langfuse 追踪",
  audit: "操作记录范围",
  storage: "存储与隔离",
  plan: "套餐授权范围",
  modelVerified: "Chat Completions 响应验证",
  version: "服务版本",
};

export function DiagnosticsPage() {
  const { state, refresh, notify } = useAdmin();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const audit = [...state.audit]
    .reverse()
    .filter(
      (item) =>
        (result === "all" || (result === "ok" ? item.result === "ok" : item.result !== "ok")) &&
        match(query, item.actor, item.action, auditLabels[item.action] ?? "", item.target),
    );
  const pagination = usePagination(audit);
  const reload = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      await refresh();
      notify("运行状态已刷新。", "success");
    } catch (error) {
      setError(message(error));
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="page-stack">
      <PageHeader
        title="诊断与审计"
        description="查看运行状态与最近操作记录。"
        actions={
          <Button variant="secondary" loading={refreshing} onClick={() => void reload()}>
            刷新状态
          </Button>
        }
      />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel className="section-card">
        <h2>运行诊断</h2>
        <dl className="diagnostic-list">
          {Object.entries(state.diagnostics).map(([key, value]) => (
            <div key={key}>
              <dt>{diagnosticLabels[key] ?? key}</dt>
              <dd>
                {typeof value === "boolean" ? (
                  <Badge tone={value ? "success" : "neutral"}>{value ? "已验证" : "未验证"}</Badge>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="notice">世界书上下文详情暂不可用；关键词匹配不表示条目已进入模型上下文。</div>
        <p className="muted">连接响应状态仅适用于 Chat Completions，不包含套餐后端、语音或图片服务。</p>
      </Panel>
      <Panel className="section-card">
        <div className="toolbar">
          <h2>最近操作记录</h2>
          <span className="meta">本进程最近 {state.audit.length} 条</span>
        </div>
        <div className="field-grid">
          <Search
            label="搜索操作记录"
            value={query}
            placeholder="操作、操作者或对象 ID"
            onChange={(value) => {
              setQuery(value);
              pagination.reset();
            }}
          />
          <Field label="操作结果">
            <Select
              label="操作结果"
              value={result}
              options={[
                { value: "all", label: "全部结果" },
                { value: "ok", label: "成功" },
                { value: "error", label: "失败" },
              ]}
              onChange={(value) => {
                setResult(value);
                pagination.reset();
              }}
            />
          </Field>
        </div>
        {audit.length ? (
          <>
            <DataTable
              label="最近操作记录"
              rows={pagination.rows}
              getRowKey={(item) => String(item.sequence)}
              columns={[
                { key: "at", header: "时间", render: (item) => <>{date(item.at)}</> },
                {
                  key: "action",
                  header: "操作",
                  render: (item) => <>{auditLabels[item.action] ?? item.action}</>,
                },
                {
                  key: "actor",
                  header: "操作者",
                  render: (item) => <span className="meta">{item.actor}</span>,
                },
                {
                  key: "target",
                  header: "对象",
                  render: (item) => <span className="meta">{item.target}</span>,
                },
                {
                  key: "result",
                  header: "结果",
                  render: (item) => (
                    <>
                      <Badge tone={item.result === "ok" ? "success" : "danger"}>
                        {item.result === "ok" ? "成功" : "失败"}
                      </Badge>
                    </>
                  ),
                },
              ]}
            />
            {pagination.control}
          </>
        ) : (
          <Empty
            icon={state.audit.length ? "search" : "diagnostics"}
            title={state.audit.length ? "没有匹配的记录" : "本进程还没有操作记录"}
            description={state.audit.length ? "调整搜索内容或结果筛选后重试。" : undefined}
            action={
              state.audit.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setResult("all");
                    pagination.reset();
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        )}
      </Panel>
    </div>
  );
}
