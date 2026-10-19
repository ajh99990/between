import {
  Badge,
  Button,
  CollectionList,
  Dialog,
  DocumentReader,
  Empty,
  Field,
  HighlightText,
  Icon,
  Input,
  LongTextEditor,
  MultiSelect,
  PageHeader,
  SplitPane,
  TagInput,
  UiInteractionProvider,
} from "@between/ui";
import { useMemo, useRef, useState } from "react";
import type { Config, Role } from "../api";
import { useReaderTransition } from "../reader-motion";
import { useAdmin, useDirtyGuard } from "../state";

export const roleSections = [
  {
    key: "description",
    label: "公开简介",
    hint: "显示在用户的角色列表中，请勿填写内部指令。社区角色采用固定公开简介。",
  },
  { key: "detail", label: "角色设定", hint: "供模型使用的人物身份、背景与行为方式。" },
  { key: "personality", label: "性格", hint: "人物的核心性格、表达习惯与边界。" },
  { key: "scenario", label: "场景", hint: "对话发生的环境和当前情境。" },
  { key: "greeting", label: "开场白", hint: "创建新会话时会作为第一条角色消息展示给用户。" },
  { key: "examples", label: "示例对话", hint: "供模型参考的对话风格与回应示范。" },
  { key: "system", label: "系统提示词", hint: "约束角色行为与回答方式的内部指令。" },
  { key: "persona", label: "用户人设", hint: "提供给模型的对话对象设定。" },
  { key: "postHistory", label: "历史后指令", hint: "附加于历史后的角色指令，独立于全局提示预设。" },
  { key: "creatorNotes", label: "作者说明", hint: "管理员可见的创作和使用说明。" },
  {
    key: "world",
    label: "原始世界设定",
    hint: "角色卡附带的世界设定。对话中使用的世界书由关联决定，修改此处不会改动书库。",
  },
] as const;
type Section = (typeof roleSections)[number]["key"];

const textOf = (role: Role, key: Section) => (typeof role[key] === "string" ? role[key] : "");
export function createRole(): Role {
  return {
    id: crypto.randomUUID(),
    name: "",
    icon: "",
    tag: "",
    description: "",
    system: "",
    detail: "",
    greeting: "",
    examples: "",
    persona: "",
    personality: "",
    scenario: "",
    postHistory: "",
    creatorNotes: "",
    bookIds: [],
    world: "",
    keys: [],
  };
}
export function replaceRole(config: Config, role: Role): Config {
  return {
    ...config,
    roles: config.roles.some((item) => item.id === role.id)
      ? config.roles.map((item) => (item.id === role.id ? role : item))
      : [...config.roles, role],
  };
}

export default function RolesPage() {
  const { state, save, navigate } = useAdmin();
  const [selectedId, setSelectedId] = useState(
    () => decodeURIComponent(location.hash.split("/")[2] || "") || state.config.roles[0]?.id || "",
  );
  const [query, setQuery] = useState(""),
    [find, setFind] = useState("");
  const [editor, setEditor] = useState<{ role: Role; config: Config; original: Role } | null>(null);
  const [field, setField] = useState<Section | "basic">("basic");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState<(() => void) | null>(null),
    [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [keywordDraft, setKeywordDraft] = useState("");
  const pendingKeyword = useRef("");
  const dirty = Boolean(
    editor && (JSON.stringify(editor.role) !== JSON.stringify(editor.original) || keywordDraft),
  );
  useDirtyGuard(dirty);
  const selected = state.config.roles.find((role) => role.id === selectedId);
  const roles = useMemo(
    () =>
      state.config.roles.filter((role) =>
        [role.name, role.tag, ...roleSections.map((s) => textOf(role, s.key))]
          .join("\n")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [state.config.roles, query],
  );
  const request = (action: () => void) => {
    if (busy) return;
    if (dirty) setPending(() => action);
    else action();
  };
  const select = (role: Role) =>
    request(() => {
      setEditor(null);
      setSelectedId(role.id);
      setFind("");
      setError("");
    });
  const edit = (role: Role, isNew = false) => {
    pendingKeyword.current = "";
    setKeywordDraft("");
    const draft = structuredClone(role);
    setEditor({
      role: draft,
      original: isNew ? { ...structuredClone(draft), name: "__new__" } : structuredClone(draft),
      config: structuredClone(state.config),
    });
    setField("basic");
    setError("");
  };
  const update = (patch: Partial<Role>) =>
    setEditor((current) => (current ? { ...current, role: { ...current.role, ...patch } } : current));
  const selectField = (next: Section | "basic") => {
    if (busy) return;
    if (pendingKeyword.current.trim()) {
      setError("请先完成或移除正在输入的关键词，再切换字段。");
      return;
    }
    setError("");
    setField(next);
  };
  const cancel = () =>
    request(() => {
      setEditor(null);
      setError("");
    });
  const commit = async () => {
    if (!editor || busy) return;
    if (pendingKeyword.current.trim()) {
      setError("请先完成或移除正在输入的关键词，再保存。");
      setField("basic");
      return;
    }
    if (!editor.role.name.trim()) {
      setError("请填写角色名称。");
      setField("basic");
      return;
    }
    setBusy(true);
    setError("");
    if (await save(replaceRole(editor.config, editor.role))) {
      setSelectedId(editor.role.id);
      setEditor(null);
    } else
      setError(
        "未保存。草稿仍在；若版本已更新，请先复制本次修改，再取消并重新载入，避免覆盖其他管理员的改动。",
      );
    setBusy(false);
  };
  const remove = async () => {
    if (!deleteRole || busy) return;
    setBusy(true);
    if (await save({ ...state.config, roles: state.config.roles.filter((r) => r.id !== deleteRole.id) })) {
      setSelectedId(state.config.roles.find((r) => r.id !== deleteRole.id)?.id || "");
      setDeleteRole(null);
    }
    setBusy(false);
  };
  const activeSection = field === "basic" ? null : roleSections.find((section) => section.key === field);
  const readerTransition = useReaderTransition(
    `${editor?.role.id ?? selectedId}:${editor ? "edit" : "read"}`,
  );
  const fieldTransition = useReaderTransition(field);
  return (
    <div className="page-stack library-page">
      <PageHeader
        title="角色卡"
        description="修改仅用于新会话，已有会话保持原设定。"
        actions={
          <Button
            variant="primary"
            disabled={busy || state.config.roles.length >= 20}
            onClick={() => request(() => edit(createRole(), true))}
          >
            <Icon name="plus" />
            新建角色
          </Button>
        }
      />
      <SplitPane
        className="admin-library-split"
        label="角色库与全文"
        sidebarLabel="角色库"
        defaultSidebarWidth={280}
        minSidebarWidth={220}
        maxSidebarWidth={420}
        minContentWidth={420}
        sidebar={
          <CollectionList
            label="角色卡列表"
            selectedId={selectedId}
            onSelect={(id) => {
              const role = state.config.roles.find((item) => item.id === id);
              if (role) select(role);
            }}
            items={roles.map((role) => ({
              id: role.id,
              disabled: busy,
              title: <HighlightText text={role.name} query={query} />,
              description: role.tag,
              meta: `${role.bookIds.length} 本关联世界书`,
              icon: (
                <span className="role-monogram" aria-hidden="true">
                  {role.name.slice(0, 1) || "?"}
                </span>
              ),
            }))}
            header={
              <>
                <div className="collection-heading">
                  <span>角色库</span>
                  <span className="meta">
                    {roles.length} / {state.config.roles.length}
                  </span>
                </div>
                <div className="search-box">
                  <Icon name="search" />
                  <Input
                    className="search-input"
                    aria-label="搜索角色全文"
                    placeholder="搜索名称、设定、对话…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button className="icon-button" aria-label="清空角色搜索" onClick={() => setQuery("")}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </>
            }
            empty={
              <Empty
                title="没有匹配的角色"
                description="尝试角色名称、设定或对话中的词句。"
                action={<Button onClick={() => setQuery("")}>清空搜索</Button>}
              />
            }
          />
        }
      >
        <section className="reader-pane" aria-label={editor ? "编辑角色卡" : "角色卡全文"}>
          <div className="reader-transition-content" ref={readerTransition}>
            {editor ? (
              <>
                <header className="document-header">
                  <div>
                    <h2>{editor.role.name || "新建角色"}</h2>
                    <div className="inline-actions">
                      <Badge tone={dirty ? "warning" : "neutral"}>
                        {dirty ? "有未保存修改" : "尚未修改"}
                      </Badge>
                      <span className="meta">基于版本 {editor.config.version}</span>
                    </div>
                  </div>
                  <Button disabled={busy} onClick={cancel}>
                    退出编辑
                  </Button>
                </header>
                {error && (
                  <div className="notice danger" role="alert">
                    {error}
                  </div>
                )}
                <UiInteractionProvider enabled={!busy}>
                  <div className="document-editor">
                    <nav className="document-outline" aria-label="角色编辑字段">
                      <button
                        aria-current={field === "basic" ? "page" : undefined}
                        onClick={() => selectField("basic")}
                      >
                        基本资料与关联
                      </button>
                      {roleSections.map((section) => (
                        <button
                          key={section.key}
                          aria-current={field === section.key ? "page" : undefined}
                          onClick={() => selectField(section.key)}
                        >
                          {section.label}
                          <small>{textOf(editor.role, section.key).length.toLocaleString()}</small>
                        </button>
                      ))}
                    </nav>
                    <div className="editor-content" ref={fieldTransition}>
                      {field === "basic" ? (
                        <>
                          <h3>基本资料</h3>
                          <div className="field-grid grid gap-4 md:grid-cols-2">
                            <Field
                              label="角色名称"
                              error={error && !editor.role.name.trim() ? "请输入角色名称" : undefined}
                            >
                              <Input
                                className="text-input"
                                required
                                maxLength={10000}
                                value={editor.role.name}
                                onChange={(e) => update({ name: e.target.value })}
                              />
                            </Field>
                            <Field label="标签">
                              <Input
                                className="text-input"
                                maxLength={10000}
                                value={editor.role.tag}
                                onChange={(e) => update({ tag: e.target.value })}
                              />
                            </Field>
                            <Field label="角色标记" description="最多16个字符；不会加载外部图片。">
                              <Input
                                className="text-input"
                                maxLength={16}
                                value={editor.role.icon || ""}
                                onChange={(e) => update({ icon: e.target.value })}
                              />
                            </Field>
                            <Field
                              label="原始关键词"
                              description="输入完整关键词后按 Enter 添加。实际世界书注入由下方绑定决定。"
                            >
                              <TagInput
                                label="原始关键词"
                                value={editor.role.keys}
                                onDraftChange={(value) => {
                                  pendingKeyword.current = value;
                                  setKeywordDraft(value);
                                }}
                                onChange={(keys) => update({ keys })}
                              />
                            </Field>
                          </div>
                          <section className="reading-section">
                            <h3>关联世界书</h3>
                            <Field label="供此角色使用的世界书">
                              <MultiSelect
                                label="供此角色使用的世界书"
                                value={editor.role.bookIds}
                                options={state.config.books.map((book) => ({
                                  value: book.id,
                                  label: `${book.name} · ${book.entries?.length ?? 1} 条目`,
                                }))}
                                onChange={(bookIds) => update({ bookIds })}
                                placeholder="搜索并关联世界书…"
                              />
                            </Field>
                            {!state.config.books.length && (
                              <p className="muted">当前没有世界书。可先保存角色，再在世界书页面创建。</p>
                            )}
                          </section>
                          {editor.role.source && (
                            <div className="notice">
                              <strong>来源与许可</strong>
                              <p>
                                {editor.role.source.attribution} · {editor.role.source.license}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        activeSection && (
                          <LongTextEditor
                            label={activeSection.label}
                            description={activeSection.hint}
                            textareaClassName={
                              activeSection.key === "examples" ? "dialogue-editor" : undefined
                            }
                            maxLength={24000}
                            value={textOf(editor.role, activeSection.key)}
                            onChange={(value) => update({ [activeSection.key]: value })}
                            spellCheck={false}
                          />
                        )
                      )}
                    </div>
                  </div>
                </UiInteractionProvider>
                <footer className="editor-footer">
                  <p className="meta">{dirty ? "有未保存的修改。" : "尚未修改。"}</p>
                  <div className="inline-actions">
                    <Button disabled={busy} onClick={cancel}>
                      取消
                    </Button>
                    <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void commit()}>
                      保存角色
                    </Button>
                  </div>
                </footer>
              </>
            ) : selected ? (
              <>
                <header className="document-header">
                  <div className="identity-heading">
                    <span className="role-monogram large" aria-hidden="true">
                      {selected.name.slice(0, 1)}
                    </span>
                    <div>
                      <h2>{selected.name}</h2>
                      <div className="inline-actions">
                        {selected.tag && <Badge>{selected.tag}</Badge>}
                        <span className="meta">{selected.bookIds.length} 本世界书</span>
                        {selected.source && <span className="meta">{selected.source.license}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="inline-actions">
                    <Button onClick={() => edit(selected)}>
                      <Icon name="edit" />
                      编辑角色
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={state.config.roles.length <= 1}
                      aria-label={`移除角色 ${selected.name}`}
                      onClick={() => setDeleteRole(selected)}
                    >
                      <Icon name="trash" />
                    </Button>
                  </div>
                </header>
                <DocumentReader
                  label="角色卡内容"
                  searchLabel="在角色卡中查找"
                  clearSearchLabel="清空全文查找"
                  outlineLabel="角色卡目录"
                  query={find}
                  onQueryChange={setFind}
                  sections={[
                    ...roleSections.map((section) => ({
                      id: section.key,
                      domId: `role-${section.key}`,
                      title: section.label,
                      description: section.hint,
                      meta: `${textOf(selected, section.key).length.toLocaleString()} 字符`,
                      content: textOf(selected, section.key) || <span className="empty-value">未设置</span>,
                      contentClassName: section.key === "examples" ? "dialogue-text" : undefined,
                    })),
                    {
                      id: "related-books",
                      title: "关联世界书",
                      searchText: selected.bookIds
                        .map((id) => state.config.books.find((book) => book.id === id)?.name || id)
                        .join("\n"),
                      content: (
                        <div className="related-books">
                          {selected.bookIds.map((id) => {
                            const book = state.config.books.find((book) => book.id === id);
                            return (
                              <button key={id} onClick={() => navigate(`/books/${encodeURIComponent(id)}`)}>
                                <Icon name="book" />
                                <span>
                                  <strong>{book?.name || id}</strong>
                                  <small>{book?.entries?.length ?? 1} 个条目</small>
                                </span>
                                <Icon name="arrow" size={16} />
                              </button>
                            );
                          })}
                          {!selected.bookIds.length && <p className="muted">没有绑定世界书。</p>}
                        </div>
                      ),
                    },
                    ...(selected.source
                      ? [
                          {
                            id: "source",
                            title: "来源与许可",
                            content: (
                              <dl className="source-section">
                                <dt>作者</dt>
                                <dd>{selected.source.attribution}</dd>
                                <dt>许可</dt>
                                <dd>{selected.source.license}</dd>
                                <dt>来源</dt>
                                <dd>{selected.source.repository}</dd>
                                <dt>固定版本</dt>
                                <dd className="mono">{selected.source.commit}</dd>
                                <dt>适配</dt>
                                <dd>{selected.source.adaptation}</dd>
                              </dl>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            ) : (
              <Empty icon="roles" title="选择一个角色卡" description="从左侧角色库中选择，或创建新角色。" />
            )}
          </div>
        </section>
      </SplitPane>
      <Dialog
        open={Boolean(pending)}
        title="放弃未保存的角色修改？"
        onClose={() => setPending(null)}
        footer={
          <>
            <Button onClick={() => setPending(null)}>继续编辑</Button>
            <Button
              variant="danger"
              onClick={() => {
                const action = pending;
                setPending(null);
                action?.();
              }}
            >
              放弃修改
            </Button>
          </>
        }
      >
        <p>未保存的修改尚未写入服务器。你可以继续编辑并保存，再切换。</p>
      </Dialog>
      <Dialog
        open={Boolean(deleteRole)}
        title={`移除「${deleteRole?.name || ""}」？`}
        onClose={() => !busy && setDeleteRole(null)}
        closeDisabled={busy}
        footer={
          <>
            <Button disabled={busy} onClick={() => setDeleteRole(null)}>
              取消
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              移除角色
            </Button>
          </>
        }
      >
        <p>从新会话的角色库移除此角色。已有会话及其角色快照不会删除。</p>
      </Dialog>
    </div>
  );
}
