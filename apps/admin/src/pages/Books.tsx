import {
  Badge,
  Button,
  Checkbox,
  CollectionList,
  Dialog,
  DiffViewer,
  DocumentReader,
  Empty,
  Field,
  HighlightText,
  Icon,
  Input,
  JSONEditor,
  JSONViewer,
  LongTextEditor,
  NumberField,
  PageHeader,
  Select,
  SplitPane,
  TagInput,
} from "@between/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book, BookEntry } from "../api";
import { useReaderTransition } from "../reader-motion";
import { useAdmin, useDirtyGuard } from "../state";
import type { BookDraft, EntryDraft } from "./book-utils";
import {
  bookSearchText,
  bookUnchanged,
  changedBookFields,
  draftChanged,
  makeBookDraft,
  newEntry,
  replaceBook,
  serializeBookDraft,
} from "./book-utils";

const positions = [
  { value: "0", label: "角色描述之前" },
  { value: "1", label: "角色描述之后" },
  { value: "4", label: "指定聊天深度" },
  { value: "5", label: "示例消息之前" },
  { value: "6", label: "示例消息之后" },
];
const logics = [
  { value: "0", label: "AND ANY · 任一二级词匹配" },
  { value: "1", label: "NOT ALL · 二级词不全部匹配" },
  { value: "2", label: "NOT ANY · 二级词均不匹配" },
  { value: "3", label: "AND ALL · 全部二级词匹配" },
];
const entryTitle = (entry: BookEntry, index: number) => entry.comment?.trim() || `条目 ${index + 1}`;

export default function BooksPage() {
  const { state, save, refresh, notify } = useAdmin();
  const config = state.config;
  const [selectedId, setSelectedId] = useState(
    () => decodeURIComponent(location.hash.split("/")[2] || "") || config.books[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const [readQuery, setReadQuery] = useState("");
  const [draft, setDraft] = useState<BookDraft>();
  const [activeEntry, setActiveEntry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [formError, setFormError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState("entries");
  const [deleteBook, setDeleteBook] = useState<Book>();
  const [deleteEntry, setDeleteEntry] = useState<number>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBook, setReviewBook] = useState<Book>();
  const [conflictBackups, setConflictBackups] = useState<{ book: Book; version: number }[]>([]);
  const pending = useRef<(() => void) | undefined>(undefined);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});
  const pendingKeywords = useRef<Record<string, string>>({});
  const hasPendingKeyword = Object.values(keywordDrafts).some((value) => value.trim());
  const dirty = Boolean(draft && (draftChanged(draft) || hasPendingKeyword));
  useDirtyGuard(dirty || conflictBackups.length > 0);

  useEffect(() => {
    if (!draft && !config.books.some((book) => book.id === selectedId))
      setSelectedId(config.books[0]?.id ?? "");
  }, [config.books, draft, selectedId]);

  const selected = config.books.find((book) => book.id === selectedId);
  const display = draft?.book ?? selected;
  const filtered = useMemo(
    () => config.books.filter((book) => bookSearchText(book).includes(query.trim().toLocaleLowerCase())),
    [config.books, query],
  );
  const boundRoles = display ? config.roles.filter((role) => role.bookIds.includes(display.id)) : [];
  const versionChanged = Boolean(draft && draft.base.version !== config.version);
  const latestBook = draft && config.books.find((book) => book.id === draft.book.id);
  const currentEntry = draft?.entries?.[activeEntry];
  const readerTransition = useReaderTransition(`${display?.id ?? ""}:${draft ? "edit" : "read"}`);
  const entryTransition = useReaderTransition(String(currentEntry?.entry.uid ?? ""));

  function guarded(action: () => void) {
    if (saving) return;
    if (dirty || conflictBackups.length > 0) {
      pending.current = action;
      setDiscardOpen(true);
    } else action();
  }
  function clearDraft() {
    pendingKeywords.current = {};
    setKeywordDrafts({});
    setDraft(undefined);
    setSaveFailed(false);
    setFormError("");
    setConflictBackups([]);
  }
  function selectBook(id: string) {
    guarded(() => {
      clearDraft();
      setSelectedId(id);
      setReadQuery(query.trim());
    });
  }
  function startEdit(book: Book) {
    pendingKeywords.current = {};
    setKeywordDrafts({});
    setDraft(makeBookDraft(book, config));
    setActiveEntry(0);
    setFormError("");
    setSaveFailed(false);
  }
  function updateBook(patch: Partial<Book>) {
    setDraft((current) => (current ? { ...current, book: { ...current.book, ...patch } } : current));
    setFormError("");
  }
  function updateEntry(patch: Partial<BookEntry>) {
    setDraft((current) =>
      current?.entries
        ? {
            ...current,
            entries: current.entries.map((item, index) =>
              index === activeEntry ? { ...item, entry: { ...item.entry, ...patch } } : item,
            ),
          }
        : current,
    );
    setFormError("");
  }
  function updateEntryBuffer(patch: Partial<Pick<EntryDraft, "keys" | "secondary" | "extra">>) {
    setDraft((current) =>
      current?.entries
        ? {
            ...current,
            entries: current.entries.map((item, index) =>
              index === activeEntry ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
    setFormError("");
  }
  function setKeywordDraft(key: string, value: string) {
    pendingKeywords.current[key] = value;
    setKeywordDrafts((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }
  function allowEntryChange() {
    if (Object.values(pendingKeywords.current).some((value) => value.trim())) {
      setFormError("请先完成或移除正在输入的关键词，再切换条目。");
      return false;
    }
    return true;
  }
  function appendEntry() {
    if (!allowEntryChange()) return;
    if (!draft?.entries || draft.entries.length >= 100) return;
    const entry = newEntry(draft.entries);
    setDraft({ ...draft, entries: [...draft.entries, { entry, keys: "", secondary: "", extra: "{}" }] });
    setActiveEntry(draft.entries.length);
  }
  function createDraft() {
    if (!createName.trim()) {
      setFormError("请输入世界书名称。");
      return;
    }
    const book: Book = { id: crypto.randomUUID(), name: createName.trim(), keys: [], content: "" };
    if (createMode === "entries") book.entries = [newEntry([])];
    setDraft(makeBookDraft(book, config, true));
    setSelectedId(book.id);
    setActiveEntry(0);
    setCreateOpen(false);
    setFormError("");
    setSaveFailed(false);
    setReadQuery("");
  }
  async function persist(useLatest = false) {
    if (!draft || saving) return;
    if (Object.values(pendingKeywords.current).some((value) => value.trim())) {
      setFormError("请先完成或移除正在输入的关键词，再保存。");
      return;
    }
    let book: Book;
    try {
      book = serializeBookDraft(draft);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请检查世界书字段。");
      return;
    }
    if (useLatest && !draft.isNew && !bookUnchanged(draft.original, latestBook)) {
      setFormError("服务端世界书本身已变化，请保留旧草稿副本并载入最新版本后处理。");
      return;
    }
    const base = useLatest ? config : draft.base;
    if (draft.isNew && base.books.some((item) => item.id === book.id)) {
      setFormError("此世界书 ID 已存在，请重新创建。");
      return;
    }
    if (!base.books.some((item) => item.id === book.id) && base.books.length >= 100) {
      setFormError("世界书库已满，最多可保存 100 本。");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const ok = await save(replaceBook(base, book));
      if (ok) {
        setSelectedId(book.id);
        clearDraft();
        setReviewOpen(false);
        notify("世界书已保存，将用于新会话。", "success");
      } else {
        setSaveFailed(true);
        setReviewOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }
  function compareVersions() {
    if (!allowEntryChange()) return;
    if (!draft) return;
    try {
      setReviewBook(serializeBookDraft(draft));
      setReviewOpen(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "请先修正草稿字段。");
    }
  }
  function loadLatestWithBackup() {
    if (!allowEntryChange()) return;
    if (!draft || !reviewBook) return;
    setConflictBackups((current) => [
      ...current,
      { book: structuredClone(reviewBook), version: draft.base.version },
    ]);
    const next = latestBook ?? { ...reviewBook, id: crypto.randomUUID() };
    setDraft(makeBookDraft(next, config, !latestBook));
    setSelectedId(next.id);
    setActiveEntry(0);
    setReviewOpen(false);
    setSaveFailed(false);
    setFormError("");
  }
  async function copyBackup(book: Book) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(book, null, 2));
      notify("完整草稿 JSON 已复制。", "success");
    } catch {
      notify("复制失败，草稿仍在下方；可手动选择 JSON 复制。", "error");
    }
  }
  async function refreshKeepingDraft() {
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      notify("刷新失败，当前草稿仍保留。", "error");
    } finally {
      setRefreshing(false);
    }
  }
  async function confirmDeleteBook() {
    if (!deleteBook || saving) return;
    const id = deleteBook.id;
    setSaving(true);
    try {
      const ok = await save({
        ...config,
        books: config.books.filter((book) => book.id !== id),
        roles: config.roles.map((role) => ({
          ...role,
          bookIds: role.bookIds.filter((bookId) => bookId !== id),
        })),
      });
      if (ok) {
        setDeleteBook(undefined);
        if (selectedId === id) setSelectedId(config.books.find((book) => book.id !== id)?.id ?? "");
        notify("世界书已删除，角色绑定已解除。", "success");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack library-page books-page">
      <PageHeader
        title="世界书"
        description="维护角色使用的背景、地点与规则。修改仅用于新会话。"
        actions={
          <Button
            variant="primary"
            disabled={saving || config.books.length >= 100}
            onClick={() =>
              guarded(() => {
                clearDraft();
                setCreateName("");
                setCreateMode("entries");
                setCreateOpen(true);
              })
            }
          >
            <Icon name="plus" />
            新建世界书
          </Button>
        }
      />
      <SplitPane
        className="admin-library-split"
        label="世界书库与全文"
        sidebarLabel="世界书库"
        defaultSidebarWidth={280}
        minSidebarWidth={220}
        maxSidebarWidth={420}
        minContentWidth={420}
        sidebar={
          <CollectionList
            label="世界书列表"
            selectedId={selectedId}
            onSelect={selectBook}
            items={filtered.map((book) => ({
              id: book.id,
              title: <HighlightText text={book.name} query={query} />,
              description:
                book.entries !== undefined
                  ? `条目世界书 · ${book.entries.length} 个条目`
                  : "简单世界书 · 1 条设定",
              meta: `${config.roles.filter((role) => role.bookIds.includes(book.id)).length} 个角色绑定`,
            }))}
            header={
              <>
                <div className="collection-heading">
                  <span>世界书库</span>
                  <span className="meta" aria-live="polite">
                    {filtered.length} / {config.books.length}
                  </span>
                </div>
                <div className="book-library-search">
                  <label className="bt-field-label" htmlFor="book-library-search">
                    管理库全文搜索
                  </label>
                  <div className="search-box">
                    <Icon name="search" size={16} />
                    <Input
                      id="book-library-search"
                      type="search"
                      className="search-input"
                      aria-label="管理库全文搜索"
                      placeholder="搜索名称、正文、关键词…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="清空世界书搜索"
                        onClick={() => setQuery("")}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            }
            empty={
              <Empty
                icon={query ? "search" : "book"}
                title={query ? "没有匹配的世界书" : "还没有世界书"}
                description={
                  query ? "尝试名称、正文中的词句或条目关键词。" : "创建第一本世界书，再在角色页中绑定。"
                }
                action={query ? <Button onClick={() => setQuery("")}>清空搜索</Button> : undefined}
              />
            }
          />
        }
      >
        <section className="reader-pane book-reader" aria-label={draft ? "编辑世界书" : "世界书全文"}>
          <div className="reader-transition-content" ref={readerTransition}>
            {!display ? (
              <Empty
                icon="book"
                title="选择一本世界书"
                description="在左侧打开世界书，查看正文或编辑触发条件。"
              />
            ) : (
              <>
                <header className="document-header">
                  <div>
                    <h2>
                      <HighlightText text={display.name || "未命名世界书"} query={draft ? "" : readQuery} />
                    </h2>
                    {draft && (
                      <div className="inline-actions">
                        <Badge tone="warning">{draft.isNew ? "新建草稿" : dirty ? "未保存" : "编辑中"}</Badge>
                        <span className="meta">基于配置 v{draft.base.version}</span>
                      </div>
                    )}
                    <p className="meta book-binding-summary">
                      绑定角色：{boundRoles.map((role) => role.name).join("、") || "尚未绑定"} ·{" "}
                      {display.entries !== undefined
                        ? `${draft?.entries?.length ?? display.entries.length} 个条目`
                        : "简单世界书"}
                    </p>
                  </div>
                  {!draft ? (
                    <div className="inline-actions">
                      <Button variant="secondary" onClick={() => startEdit(display)}>
                        <Icon name="edit" />
                        编辑世界书
                      </Button>
                      <Button variant="danger" disabled={saving} onClick={() => setDeleteBook(display)}>
                        删除
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" disabled={saving} onClick={() => guarded(clearDraft)}>
                      退出编辑
                    </Button>
                  )}
                </header>
                <div className="book-metadata">
                  {display.source && (
                    <details className="book-meta-item">
                      <summary>来源与许可 · {display.source.license}</summary>
                      <p>
                        {display.source.attribution} · {display.source.adaptation}
                      </p>
                      <p className="meta">
                        来源：{display.source.repository}
                        <br />
                        版本：{display.source.commit}
                      </p>
                    </details>
                  )}
                  <details className="book-meta-item">
                    <summary>世界书原始元数据（只读）</summary>
                    <p className="muted">查看书级关键词、正文与来源。各条目的正文和配置在下方展开。</p>
                    <JSONViewer
                      label="世界书原始元数据 JSON"
                      text={JSON.stringify(
                        Object.fromEntries(Object.entries(display).filter(([key]) => key !== "entries")),
                        null,
                        2,
                      )}
                    />
                  </details>
                </div>
                {draft ? (
                  <div className="page-stack book-editor-content">
                    {(saveFailed || versionChanged) && (
                      <div className="notice" role="alert">
                        <strong>{versionChanged ? "服务端配置版本已变化" : "保存未完成"}</strong>
                        <p>
                          你的草稿仍保留在本页。刷新服务端状态不会清除草稿；如果此书也有并发修改，需保留副本、载入最新版本后手工处理。
                        </p>
                        <div className="inline-actions">
                          <Button
                            variant="secondary"
                            loading={refreshing}
                            disabled={saving}
                            onClick={refreshKeepingDraft}
                          >
                            刷新服务端状态
                          </Button>
                          {versionChanged && (
                            <Button variant="secondary" disabled={saving} onClick={compareVersions}>
                              比较完整版本
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {conflictBackups.length > 0 && (
                      <section className="notice">
                        <strong>已保留 {conflictBackups.length} 份旧草稿副本</strong>
                        <p>
                          当前表单已载入最新服务端记录。请对照副本手工迁移需要的修改；副本仅保留在本页，保存新版或确认放弃编辑后会清除。
                        </p>
                        {conflictBackups.map((backup, index) => (
                          <details key={`${backup.book.id}:${backup.version}`} className="section-card">
                            <summary>
                              旧草稿 {index + 1} · {backup.book.name} · 基于 v{backup.version}
                            </summary>
                            <Button variant="secondary" onClick={() => copyBackup(backup.book)}>
                              复制完整旧草稿
                            </Button>
                            <JSONViewer
                              label={`旧草稿 ${index + 1} 完整 JSON`}
                              text={JSON.stringify(backup.book, null, 2)}
                            />
                          </details>
                        ))}
                      </section>
                    )}
                    <Field label="世界书名称">
                      <Input
                        className="text-input"
                        aria-label="世界书名称"
                        value={draft.book.name}
                        disabled={saving}
                        onChange={(event) => updateBook({ name: event.target.value })}
                      />
                    </Field>
                    {draft.entries !== undefined ? (
                      <>
                        <div className="toolbar">
                          <div>
                            <h3>条目目录</h3>
                            <p className="muted">切换条目会保留本页所有未保存编辑。</p>
                          </div>
                          <Button
                            variant="secondary"
                            disabled={saving || draft.entries.length >= 100}
                            onClick={appendEntry}
                          >
                            <Icon name="plus" />
                            新增条目
                          </Button>
                        </div>
                        <nav className="inline-actions book-entry-tabs" aria-label="编辑条目目录">
                          {draft.entries.map((item, index) => (
                            <Button
                              key={item.entry.uid}
                              variant={index === activeEntry ? "primary" : "ghost"}
                              disabled={saving}
                              aria-pressed={index === activeEntry}
                              onClick={() => {
                                if (allowEntryChange()) setActiveEntry(index);
                              }}
                            >
                              {index + 1}. {entryTitle(item.entry, index)}
                            </Button>
                          ))}
                        </nav>
                        <div className="reader-transition-content" ref={entryTransition}>
                          {currentEntry ? (
                            <div className="page-stack" key={currentEntry.entry.uid}>
                              <div className="toolbar">
                                <h3>编辑条目 · UID {currentEntry.entry.uid}</h3>
                                <Button
                                  variant="danger"
                                  disabled={saving}
                                  onClick={() => setDeleteEntry(activeEntry)}
                                >
                                  删除此条目
                                </Button>
                              </div>
                              <Field label="条目标题">
                                <Input
                                  className="text-input"
                                  aria-label="条目标题"
                                  disabled={saving}
                                  value={currentEntry.entry.comment ?? ""}
                                  onChange={(event) => updateEntry({ comment: event.target.value })}
                                />
                              </Field>
                              <LongTextEditor
                                label="条目全文"
                                description="内容只进入角色上下文。"
                                rows={16}
                                maxLength={24000}
                                disabled={saving}
                                value={currentEntry.entry.content}
                                onChange={(content) => updateEntry({ content })}
                              />
                              <section className="section-card">
                                <h3>运行时触发条件</h3>
                                <p className="muted">
                                  这些关键词决定新会话中条目何时进入模型上下文，与上方管理库搜索相互独立。
                                </p>
                                <div className="field-grid">
                                  <Checkbox
                                    label="启用条目"
                                    className="checkbox-row"
                                    disabled={saving}
                                    checked={!currentEntry.entry.disable}
                                    onChange={(checked) => updateEntry({ disable: !checked })}
                                  />
                                  <Checkbox
                                    label="常驻条目（无需关键词匹配）"
                                    className="checkbox-row"
                                    disabled={saving}
                                    checked={currentEntry.entry.constant}
                                    onChange={(checked) => updateEntry({ constant: checked })}
                                  />
                                  <Field
                                    label="主触发关键词"
                                    description="输入完整关键词后按 Enter 添加；普通条目至少命中一个主词才有机会触发。"
                                  >
                                    <TagInput
                                      label="主触发关键词"
                                      key={`${currentEntry.entry.uid}-primary`}
                                      onDraftChange={(value) => setKeywordDraft("primary", value)}
                                      disabled={saving}
                                      value={currentEntry.keys ? currentEntry.keys.split("\n") : []}
                                      onChange={(keys) => updateEntryBuffer({ keys: keys.join("\n") })}
                                    />
                                  </Field>
                                  <Field
                                    label="二级触发关键词"
                                    description="输入完整关键词后按 Enter 添加；启用二级条件后按所选逻辑进一步筛选。"
                                  >
                                    <TagInput
                                      label="二级触发关键词"
                                      key={`${currentEntry.entry.uid}-secondary`}
                                      onDraftChange={(value) => setKeywordDraft("secondary", value)}
                                      disabled={saving}
                                      value={currentEntry.secondary ? currentEntry.secondary.split("\n") : []}
                                      onChange={(keys) => updateEntryBuffer({ secondary: keys.join("\n") })}
                                    />
                                  </Field>
                                  <Checkbox
                                    label="启用二级关键词条件"
                                    className="checkbox-row"
                                    disabled={saving}
                                    checked={currentEntry.entry.selective}
                                    onChange={(checked) => updateEntry({ selective: checked })}
                                  />
                                  <Field label="二级关键词逻辑">
                                    <Select
                                      label="二级关键词逻辑"
                                      value={String(currentEntry.entry.selectiveLogic)}
                                      options={logics}
                                      disabled={saving || !currentEntry.entry.selective}
                                      onChange={(value) => updateEntry({ selectiveLogic: Number(value) })}
                                    />
                                  </Field>
                                  <Checkbox
                                    label="启用概率筛选"
                                    className="checkbox-row"
                                    disabled={saving}
                                    checked={currentEntry.entry.useProbability}
                                    onChange={(checked) => updateEntry({ useProbability: checked })}
                                  />
                                  <Field label="触发概率（%）">
                                    <NumberField
                                      label="触发概率（%）"
                                      min={0}
                                      max={100}
                                      step={1}
                                      disabled={saving || !currentEntry.entry.useProbability}
                                      value={
                                        Number.isFinite(currentEntry.entry.probability)
                                          ? currentEntry.entry.probability
                                          : null
                                      }
                                      onChange={(probability) =>
                                        updateEntry({ probability: probability ?? Number.NaN })
                                      }
                                    />
                                  </Field>
                                  <Field label="条目排序" description="用于条目优先级与注入排序。">
                                    <NumberField
                                      label="条目排序"
                                      step={1}
                                      disabled={saving}
                                      value={
                                        Number.isFinite(currentEntry.entry.order)
                                          ? currentEntry.entry.order
                                          : null
                                      }
                                      onChange={(order) => updateEntry({ order: order ?? Number.NaN })}
                                    />
                                  </Field>
                                  <Field label="注入位置">
                                    <Select
                                      label="注入位置"
                                      value={String(currentEntry.entry.position)}
                                      options={positions}
                                      disabled={saving}
                                      onChange={(value) => updateEntry({ position: Number(value) })}
                                    />
                                  </Field>
                                </div>
                              </section>
                              <details className="section-card">
                                <summary>高级配置与原始扩展</summary>
                                <p className="muted">
                                  此处编辑其余扩展字段。保存会整体替换，删除键也会删除对应设置。UID
                                  是只读的条目标识；常用触发条件请在上方编辑。向量匹配、自动化和 outlet
                                  暂不支持。
                                </p>
                                <JSONEditor
                                  label="扩展配置（JSON 对象）"
                                  minRows={14}
                                  disabled={saving}
                                  value={currentEntry.extra}
                                  onChange={(extra) => updateEntryBuffer({ extra })}
                                />
                              </details>
                            </div>
                          ) : (
                            <Empty
                              icon="book"
                              title="这本世界书暂无条目"
                              description="添加条目后编辑正文与触发条件，也可以保存为空条目集合。"
                              action={
                                <Button variant="secondary" disabled={saving} onClick={appendEntry}>
                                  新增条目
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <LongTextEditor
                          label="世界书全文"
                          description="简单世界书按一条设定参与上下文。"
                          rows={20}
                          maxLength={20000}
                          disabled={saving}
                          value={draft.book.content}
                          onChange={(content) => updateBook({ content })}
                        />
                        <Field
                          label="运行时触发关键词"
                          description="输入完整关键词后按 Enter 添加。简单世界书的触发规则由服务默认条目提供。"
                        >
                          <TagInput
                            label="运行时触发关键词"
                            onDraftChange={(value) => setKeywordDraft("simple", value)}
                            disabled={saving}
                            value={draft.keys ? draft.keys.split("\n") : []}
                            onChange={(keys) => setDraft({ ...draft, keys: keys.join("\n") })}
                          />
                        </Field>
                      </>
                    )}
                    {formError && (
                      <div className="notice" role="alert">
                        {formError}
                      </div>
                    )}
                    <div className="editor-footer">
                      <span className="muted">
                        {dirty ? "更改尚未保存。" : "尚未修改。"} 取消会放弃本次草稿。
                      </span>
                      <div className="inline-actions">
                        <Button variant="secondary" disabled={saving} onClick={() => guarded(clearDraft)}>
                          取消编辑
                        </Button>
                        <Button
                          variant="primary"
                          loading={saving}
                          disabled={!dirty || versionChanged}
                          onClick={() => persist()}
                        >
                          {draft.isNew ? "创建世界书" : "保存世界书"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <DocumentReader
                    label="世界书内容"
                    searchLabel="在此书全文中查找"
                    clearSearchLabel="清空书内查找"
                    outlineLabel="世界书条目目录"
                    query={readQuery}
                    onQueryChange={setReadQuery}
                    emptyTitle="这本世界书暂无条目"
                    sections={
                      display.entries !== undefined
                        ? display.entries.map((entry, index) => ({
                            id: String(entry.uid),
                            domId: `book-entry-${index}`,
                            title: entryTitle(entry, index),
                            content: entry.content || <span className="empty-value">此条目尚无内容。</span>,
                            searchText: [...entry.key, ...entry.keysecondary].join("\n"),
                            meta: (
                              <>
                                <Badge tone={entry.disable ? "neutral" : "success"}>
                                  {entry.disable ? "已停用" : "已启用"}
                                </Badge>
                                {entry.constant && <Badge>常驻</Badge>}
                                <span>UID {entry.uid}</span>
                              </>
                            ),
                            description: (
                              <>
                                <p>
                                  主触发词：
                                  <HighlightText text={entry.key.join("、") || "无"} query={readQuery} />
                                  {entry.selective && (
                                    <>
                                      {" "}
                                      · 二级触发词：
                                      <HighlightText
                                        text={entry.keysecondary.join("、") || "无"}
                                        query={readQuery}
                                      />
                                    </>
                                  )}
                                </p>
                                <p>
                                  {positions.find((position) => position.value === String(entry.position))
                                    ?.label ?? `原始位置 ${entry.position}`}{" "}
                                  · 排序 {entry.order} ·{" "}
                                  {entry.useProbability ? `触发概率 ${entry.probability}%` : "概率筛选关闭"}
                                </p>
                              </>
                            ),
                            footer: (
                              <details className="book-meta-item">
                                <summary>全部触发配置与原始字段（只读）</summary>
                                <JSONViewer
                                  label={`条目 ${index + 1} 完整配置 JSON`}
                                  text={JSON.stringify(
                                    Object.fromEntries(
                                      Object.entries(entry).filter(([key]) => key !== "content"),
                                    ),
                                    null,
                                    2,
                                  )}
                                />
                              </details>
                            ),
                          }))
                        : [
                            {
                              id: "content",
                              title: "世界设定",
                              description: (
                                <>
                                  运行时触发词：
                                  <HighlightText text={display.keys.join("、") || "无"} query={readQuery} />
                                </>
                              ),
                              searchText: display.keys.join("\n"),
                              content: display.content || (
                                <span className="empty-value">此世界书尚无内容。</span>
                              ),
                            },
                          ]
                    }
                  />
                )}
              </>
            )}
          </div>
        </section>
      </SplitPane>
      <Dialog
        open={createOpen}
        title="新建世界书"
        size="md"
        onClose={() => {
          setCreateOpen(false);
          setFormError("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setFormError("");
              }}
            >
              取消
            </Button>
            <Button variant="primary" disabled={!createName.trim()} onClick={createDraft}>
              创建草稿
            </Button>
          </>
        }
      >
        <div className="page-stack">
          <p className="muted">先建立草稿，填写正文后保存入库。之后可在角色页绑定，供新会话使用。</p>
          <Field label="世界书名称">
            <Input
              className="text-input"
              autoFocus
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
            />
          </Field>
          <Field label="内容结构">
            <Select
              label="内容结构"
              value={createMode}
              options={[
                { value: "entries", label: "条目世界书 · 独立触发条件与高级配置" },
                { value: "simple", label: "简单世界书 · 一份全文与关键词" },
              ]}
              onChange={setCreateMode}
            />
          </Field>
          {formError && (
            <p className="notice" role="alert">
              {formError}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={discardOpen}
        title="放弃尚未保存的更改？"
        size="sm"
        onClose={() => {
          setDiscardOpen(false);
          pending.current = undefined;
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDiscardOpen(false);
                pending.current = undefined;
              }}
            >
              继续编辑
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDiscardOpen(false);
                const action = pending.current;
                pending.current = undefined;
                action?.();
              }}
            >
              放弃更改
            </Button>
          </>
        }
      >
        <p>
          「{draft?.book.name || "未命名世界书"}」的草稿{conflictBackups.length > 0 ? "及保留的冲突副本" : ""}
          尚未保存。放弃后将无法恢复本次修改。
        </p>
      </Dialog>
      <Dialog
        open={Boolean(deleteBook)}
        title={`删除「${deleteBook?.name ?? ""}」？`}
        size="sm"
        closeDisabled={saving}
        onClose={() => {
          if (!saving) setDeleteBook(undefined);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteBook(undefined)}>
              取消
            </Button>
            <Button variant="danger" loading={saving} onClick={confirmDeleteBook}>
              确认删除世界书
            </Button>
          </>
        }
      >
        <p>
          将永久从世界书库移除这本书，并解除{" "}
          {config.roles.filter((role) => role.bookIds.includes(deleteBook?.id ?? "")).length}{" "}
          个角色的绑定。已有会话的上下文快照保持原状。
        </p>
      </Dialog>
      <Dialog
        open={deleteEntry !== undefined}
        title="删除此条目？"
        size="sm"
        onClose={() => setDeleteEntry(undefined)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteEntry(undefined)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (draft?.entries && deleteEntry !== undefined) {
                  const entries = draft.entries.filter((_, index) => index !== deleteEntry);
                  pendingKeywords.current = {};
                  setKeywordDrafts({});
                  setDraft({ ...draft, entries });
                  setActiveEntry(Math.max(0, Math.min(activeEntry, entries.length - 1)));
                }
                setDeleteEntry(undefined);
              }}
            >
              从草稿删除条目
            </Button>
          </>
        }
      >
        <p>
          「
          {draft?.entries && deleteEntry !== undefined
            ? entryTitle(draft.entries[deleteEntry].entry, deleteEntry)
            : ""}
          」将从草稿中删除，保存世界书后生效。
        </p>
      </Dialog>
      <Dialog
        open={reviewOpen}
        title="比较完整世界书版本"
        size="lg"
        closeDisabled={saving}
        onClose={() => {
          if (!saving) setReviewOpen(false);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setReviewOpen(false)}>
              返回草稿
            </Button>
            {draft && (bookUnchanged(draft.original, latestBook) || (draft.isNew && !latestBook)) ? (
              <Button variant="primary" loading={saving} onClick={() => persist(true)}>
                基于最新配置重试保存
              </Button>
            ) : (
              <Button variant="primary" disabled={saving} onClick={loadLatestWithBackup}>
                {latestBook ? "载入最新版本，保留旧草稿副本" : "以新 ID 另建草稿，保留副本"}
              </Button>
            )}
          </>
        }
      >
        <div className="page-stack">
          <div className="notice">
            <p>
              草稿基于 v{draft?.base.version}，当前已载入服务端 v{config.version}。以下 JSON
              包含全部正文、关键词、开关、顺序、扩展和归因。
            </p>
            {draft && bookUnchanged(draft.original, latestBook) ? (
              <p>此书在服务端没有变化，版本变化来自其他配置。可以保留最新其他配置并重试保存。</p>
            ) : (
              <p>此书已有服务端改动。载入最新版会保留完整旧草稿副本，供你手工迁移修改。</p>
            )}
            {draft && !latestBook && !draft.isNew && (
              <p>服务端已移除此书。可使用新 ID 另建草稿，原角色绑定不会自动恢复。</p>
            )}
          </div>
          <p className="meta">
            服务端变化字段：{draft ? changedBookFields(draft.original, latestBook).join("、") || "无" : "无"}
          </p>
          <p className="meta">
            本页变化字段：
            {draft && reviewBook ? changedBookFields(draft.original, reviewBook).join("、") || "无" : "无"}
          </p>
          <DiffViewer
            label="服务端变更"
            beforeLabel="开始编辑时"
            afterLabel="服务端当前"
            before={draft ? JSON.stringify(draft.original, null, 2) : ""}
            after={latestBook ? JSON.stringify(latestBook, null, 2) : "服务端尚无此书。"}
          />
          <DiffViewer
            label="草稿修改"
            beforeLabel="开始编辑时"
            afterLabel="本页草稿"
            before={draft ? JSON.stringify(draft.original, null, 2) : ""}
            after={reviewBook ? JSON.stringify(reviewBook, null, 2) : ""}
          />
          <JSONViewer
            label="开始编辑时的完整版本"
            text={draft ? JSON.stringify(draft.original, null, 2) : ""}
          />
          <JSONViewer
            label="服务端当前完整版本"
            text={latestBook ? JSON.stringify(latestBook, null, 2) : "服务端尚无此书。"}
          />
          <JSONViewer label="本页完整草稿" text={reviewBook ? JSON.stringify(reviewBook, null, 2) : ""} />
          {formError && (
            <p className="notice" role="alert">
              {formError}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
