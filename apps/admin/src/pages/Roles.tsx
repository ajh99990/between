import { type ReactNode, useMemo, useState } from "react";
import type { Config, Role } from "../api";
import { useAdmin, useDirtyGuard } from "../state";
import { Badge, Button, Dialog, Empty, Field, Icon, PageHeader } from "../ui";

export const roleSections = [
  {
    key: "description",
    label: "公开简介",
    hint: "本地角色的这段简介会出现在用户角色列表。请勿填写内部提示词；社区角色使用固定公开简介。",
  },
  { key: "detail", label: "角色设定", hint: "人物身份、背景与行为方式，仅供管理员和模型上下文使用。" },
  { key: "personality", label: "性格", hint: "人物的核心性格、表达习惯与边界。" },
  { key: "scenario", label: "场景", hint: "对话发生的环境和当前情境。" },
  { key: "greeting", label: "开场白", hint: "创建新会话时会作为第一条角色消息展示给用户。" },
  { key: "examples", label: "示例对话", hint: "完整保留对话示范及换行；示例不是用户真实聊天记录。" },
  { key: "system", label: "系统提示词", hint: "角色内部系统指令，不进入用户状态或朗读输入。" },
  { key: "persona", label: "用户人设", hint: "提供给模型的对话对象设定。" },
  { key: "postHistory", label: "历史后指令", hint: "附加于历史后的角色指令，独立于全局提示预设。" },
  { key: "creatorNotes", label: "作者说明", hint: "管理员可见的创作和使用说明。" },
  {
    key: "world",
    label: "原始世界设定",
    hint: "保留原角色字段；实际世界书注入来自绑定世界书，修改此处不会改写独立书库。",
  },
] as const;
type Section = (typeof roleSections)[number]["key"];

export function highlighted(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const lower = text.toLocaleLowerCase(),
    needle = query.toLocaleLowerCase(),
    pieces: ReactNode[] = [];
  let from = 0,
    index = lower.indexOf(needle);
  while (index !== -1) {
    pieces.push(text.slice(from, index), <mark key={index}>{text.slice(index, index + needle.length)}</mark>);
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  pieces.push(text.slice(from));
  return pieces;
}
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
  const dirty = Boolean(editor && JSON.stringify(editor.role) !== JSON.stringify(editor.original));
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
  const cancel = () =>
    request(() => {
      setEditor(null);
      setError("");
    });
  const commit = async () => {
    if (!editor || busy) return;
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
  const readingSections = selected
    ? roleSections.filter(
        (section) =>
          !find ||
          `${section.label}\n${textOf(selected, section.key)}`
            .toLocaleLowerCase()
            .includes(find.toLocaleLowerCase()),
      )
    : [];
  const activeSection = field === "basic" ? null : roleSections.find((section) => section.key === field);
  return (
    <div className="page-stack library-page">
      <PageHeader
        title="角色卡"
        description="阅读与维护完整的人物档案。内容修改用于新会话，既有会话快照保持不变。"
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
      <div className="split-workspace">
        <aside className="collection-list" aria-label="角色卡列表">
          <div className="collection-heading">
            <span>角色库</span>
            <span className="meta">
              {roles.length} / {state.config.roles.length}
            </span>
          </div>
          <div className="search-box">
            <Icon name="search" />
            <input
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
          <div className="collection-scroll">
            {roles.map((role) => (
              <button
                key={role.id}
                className={`collection-item role-list-item ${role.id === selectedId ? "is-selected" : ""}`}
                aria-pressed={role.id === selectedId}
                onClick={() => select(role)}
              >
                <span className="role-monogram" aria-hidden="true">
                  {role.name.slice(0, 1) || "?"}
                </span>
                <span className="collection-copy">
                  <strong>{role.name}</strong>
                  <small>{role.tag || "未设置标签"}</small>
                  <span className="meta">{role.bookIds.length} 本关联世界书</span>
                </span>
                <Icon name="arrow" size={14} />
              </button>
            ))}
            {!roles.length && (
              <Empty
                title="没有匹配的角色"
                description="搜索覆盖完整设定和对话。"
                action={<Button onClick={() => setQuery("")}>清空搜索</Button>}
              />
            )}
          </div>
          <div className="collection-footnote">
            <Icon name="lock" size={14} />
            <span>完整设定仅在管理员界面展示</span>
          </div>
        </aside>
        <section className="reader-pane" aria-label={editor ? "编辑角色卡" : "角色卡全文"}>
          {editor ? (
            <>
              <header className="document-header">
                <div>
                  <span className="eyebrow">角色卡编辑</span>
                  <h2>{editor.role.name || "新建角色"}</h2>
                  <div className="inline-actions">
                    <Badge tone={dirty ? "warning" : "neutral"}>{dirty ? "有未保存修改" : "尚未修改"}</Badge>
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
              <div className="document-editor">
                <nav className="document-outline" aria-label="角色编辑字段">
                  <button
                    aria-current={field === "basic" ? "page" : undefined}
                    onClick={() => setField("basic")}
                  >
                    基本资料与关联
                  </button>
                  {roleSections.map((section) => (
                    <button
                      key={section.key}
                      aria-current={field === section.key ? "page" : undefined}
                      onClick={() => setField(section.key)}
                    >
                      {section.label}
                      <small>{textOf(editor.role, section.key).length.toLocaleString()}</small>
                    </button>
                  ))}
                </nav>
                <div className="editor-content">
                  {field === "basic" ? (
                    <>
                      <h3>基本资料</h3>
                      <p className="muted">名称与标签帮助用户辨认角色；内部内容请在对应字段维护。</p>
                      <div className="field-grid grid gap-4 md:grid-cols-2">
                        <Field
                          label="角色名称"
                          error={error && !editor.role.name.trim() ? "请输入角色名称" : undefined}
                        >
                          <input
                            className="text-input"
                            required
                            maxLength={10000}
                            value={editor.role.name}
                            onChange={(e) => update({ name: e.target.value })}
                          />
                        </Field>
                        <Field label="标签">
                          <input
                            className="text-input"
                            maxLength={10000}
                            value={editor.role.tag}
                            onChange={(e) => update({ tag: e.target.value })}
                          />
                        </Field>
                        <Field label="角色标记" description="最多16个字符；不会加载外部图片。">
                          <input
                            className="text-input"
                            maxLength={16}
                            value={editor.role.icon || ""}
                            onChange={(e) => update({ icon: e.target.value })}
                          />
                        </Field>
                        <Field label="原始关键词" description="逗号分隔。实际世界书注入由下方绑定决定。">
                          <input
                            className="text-input"
                            value={editor.role.keys.join(", ")}
                            onChange={(e) =>
                              update({
                                keys: e.target.value
                                  .split(/[,，]/)
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <section className="reading-section">
                        <h3>关联世界书</h3>
                        <p className="muted">勾选已有世界书，保留正文和触发配置的独立管理。</p>
                        <div className="binding-list">
                          {state.config.books.map((book) => (
                            <label key={book.id} className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={editor.role.bookIds.includes(book.id)}
                                onChange={(e) =>
                                  update({
                                    bookIds: e.target.checked
                                      ? [...editor.role.bookIds, book.id]
                                      : editor.role.bookIds.filter((id) => id !== book.id),
                                  })
                                }
                              />
                              <span>{book.name}</span>
                              <span className="meta">{book.entries?.length ?? 1} 条目</span>
                            </label>
                          ))}
                          {!state.config.books.length && (
                            <p className="muted">当前没有世界书。可先保存角色，再在世界书页面创建。</p>
                          )}
                        </div>
                      </section>
                      {editor.role.source && (
                        <div className="notice">
                          <strong>来源归因保留</strong>
                          <p>
                            {editor.role.source.attribution} · {editor.role.source.license}
                          </p>
                          <p className="meta">保存完整保留 source 及未编辑的扩展字段。</p>
                        </div>
                      )}
                    </>
                  ) : (
                    activeSection && (
                      <>
                        <div className="editor-section-heading">
                          <h3>{activeSection.label}</h3>
                          <span className="meta">
                            {textOf(editor.role, activeSection.key).length.toLocaleString()} / 24,000 字符
                          </span>
                        </div>
                        <p className="field-description">{activeSection.hint}</p>
                        <textarea
                          className={`text-area long-editor ${activeSection.key === "examples" ? "dialogue-editor" : ""}`}
                          aria-label={activeSection.label}
                          maxLength={24000}
                          value={textOf(editor.role, activeSection.key)}
                          onChange={(e) => update({ [activeSection.key]: e.target.value })}
                          spellCheck={false}
                        />
                      </>
                    )
                  )}
                </div>
              </div>
              <footer className="editor-footer">
                <p className="meta">保存整份角色档案，保留未编辑字段与原始归因。</p>
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
                    <span className="eyebrow">角色档案</span>
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
              <div className="document-toolbar">
                <div className="search-box">
                  <Icon name="search" />
                  <input
                    className="search-input"
                    aria-label="在角色卡中查找"
                    placeholder="在全文中定位…"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                  {find && (
                    <button aria-label="清空全文查找" className="icon-button" onClick={() => setFind("")}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
                <span className="meta">
                  {find ? `${readingSections.length} 个匹配段落` : "完整内容 · 保留原始换行"}
                </span>
              </div>
              <div className="document-reading">
                <article className="reading-body">
                  {readingSections.map((section) => (
                    <section key={section.key} id={`role-${section.key}`} className="reading-section">
                      <header>
                        <h3>{section.label}</h3>
                        <span className="meta">
                          {textOf(selected, section.key).length.toLocaleString()} 字符
                        </span>
                      </header>
                      <p className="field-description">{section.hint}</p>
                      <div className={`prose ${section.key === "examples" ? "dialogue-text" : ""}`}>
                        {textOf(selected, section.key) ? (
                          highlighted(textOf(selected, section.key), find)
                        ) : (
                          <span className="empty-value">未设置</span>
                        )}
                      </div>
                    </section>
                  ))}
                  {!readingSections.length && (
                    <Empty
                      title="全文中没有匹配内容"
                      action={<Button onClick={() => setFind("")}>清空查找</Button>}
                    />
                  )}
                  <section className="reading-section" id="role-books">
                    <h3>关联世界书</h3>
                    <div className="related-books">
                      {selected.bookIds.map((id) => {
                        const book = state.config.books.find((book) => book.id === id);
                        return (
                          <button key={id} onClick={() => navigate(`/books/${encodeURIComponent(id)}`)}>
                            <Icon name="book" />
                            <span>
                              <strong>{book?.name || id}</strong>
                              <small>{book?.entries?.length ?? 1} 条完整条目与触发配置</small>
                            </span>
                            <Icon name="arrow" size={16} />
                          </button>
                        );
                      })}
                      {!selected.bookIds.length && <p className="muted">没有绑定世界书。</p>}
                    </div>
                  </section>
                  {selected.source && (
                    <section className="reading-section source-section">
                      <h3>来源与许可</h3>
                      <dl>
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
                    </section>
                  )}
                </article>
                <nav className="document-outline" aria-label="角色卡目录">
                  {readingSections.map((section) => (
                    <a
                      key={section.key}
                      href={`#${location.hash.slice(1).split("#")[0]}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document
                          .getElementById(`role-${section.key}`)
                          ?.scrollIntoView({ block: "start", behavior: "smooth" });
                      }}
                    >
                      {section.label}
                    </a>
                  ))}
                  <button
                    onClick={() =>
                      document
                        .getElementById("role-books")
                        ?.scrollIntoView({ block: "start", behavior: "smooth" })
                    }
                  >
                    关联世界书
                  </button>
                </nav>
              </div>
            </>
          ) : (
            <Empty title="选择一个角色卡" description="从左侧角色库开始阅读全文，或创建新角色。" />
          )}
        </section>
      </div>
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
