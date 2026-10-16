import type { Book, BookEntry, Config } from "../api";

const commonEntryFields = new Set([
  "uid",
  "comment",
  "key",
  "keysecondary",
  "content",
  "constant",
  "selective",
  "useProbability",
  "disable",
  "selectiveLogic",
  "probability",
  "order",
  "position",
]);
const forbiddenProperties = new Set(["__proto__", "prototype", "constructor"]);

export interface EntryDraft {
  entry: BookEntry;
  keys: string;
  secondary: string;
  extra: string;
}
export interface BookDraft {
  book: Book;
  original: Book;
  base: Config;
  isNew: boolean;
  keys: string;
  entries?: EntryDraft[];
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const entryDraft = (entry: BookEntry): EntryDraft => ({
  entry,
  keys: entry.key.join("\n"),
  secondary: entry.keysecondary.join("\n"),
  extra: JSON.stringify(
    Object.fromEntries(Object.entries(entry).filter(([key]) => !commonEntryFields.has(key))),
    null,
    2,
  ),
});

export function makeBookDraft(book: Book, config: Config, isNew = false): BookDraft {
  const copy = structuredClone(book);
  return {
    book: copy,
    original: structuredClone(book),
    base: structuredClone(config),
    isNew,
    keys: copy.keys.join("\n"),
    entries: copy.entries?.map(entryDraft),
  };
}

export function draftChanged(draft: BookDraft) {
  return (
    draft.isNew ||
    !same(draft.book, draft.original) ||
    draft.keys !== draft.original.keys.join("\n") ||
    !same(draft.entries, draft.original.entries?.map(entryDraft))
  );
}

function keywords(text: string, original: string[]) {
  if (text === original.join("\n")) return original;
  const values = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (values.some((value) => value.length > 200)) throw new Error("每个触发关键词最多 200 字。");
  return values;
}

function extraFields(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text, (key, item) => {
      if (forbiddenProperties.has(key)) throw new Error("配置含有保留字段。");
      return item;
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === "配置含有保留字段。"
        ? error.message
        : "扩展配置必须是有效的 JSON 对象。",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("扩展配置必须是 JSON 对象。");
  if (Object.keys(value).some((key) => commonEntryFields.has(key)))
    throw new Error("扩展配置不能覆盖 UID 或上方的常用字段。");
  return value as Record<string, unknown>;
}

export function serializeBookDraft(draft: BookDraft): Book {
  const book: Book = { ...draft.book, keys: keywords(draft.keys, draft.book.keys) };
  if (!book.name.trim()) throw new Error("请输入世界书名称。");
  if (book.keys.length > 100) throw new Error("简单世界书最多 100 个触发关键词。");
  if (book.content.length > 20000) throw new Error("简单世界书内容最多 20,000 字。");
  if (draft.entries !== undefined) {
    if (draft.entries.length > 100) throw new Error("每本世界书最多 100 个条目。");
    const seen = new Set<number>();
    book.entries = draft.entries.map((item, index) => {
      const entry = {
        ...Object.fromEntries(Object.entries(item.entry).filter(([key]) => commonEntryFields.has(key))),
        ...extraFields(item.extra),
        key: keywords(item.keys, item.entry.key),
        keysecondary: keywords(item.secondary, item.entry.keysecondary),
      } as BookEntry;
      const prefix = `第 ${index + 1} 条：`;
      if (!Number.isSafeInteger(entry.uid) || entry.uid < 0 || seen.has(entry.uid))
        throw new Error(`${prefix}UID 必须是唯一的非负整数。`);
      seen.add(entry.uid);
      if (entry.content.length > 24000) throw new Error(`${prefix}内容最多 24,000 字。`);
      if (
        !Number.isFinite(entry.order) ||
        !Number.isFinite(entry.probability) ||
        entry.probability < 0 ||
        entry.probability > 100
      )
        throw new Error(`${prefix}排序须为有限数字，概率须为 0–100。`);
      if (![0, 1, 2, 3].includes(entry.selectiveLogic)) throw new Error(`${prefix}二级关键词逻辑无效。`);
      if (![0, 1, 4, 5, 6].includes(entry.position))
        throw new Error(`${prefix}当前服务仅支持注入位置 0、1、4、5、6。`);
      if (entry.vectorized || entry.automationId || entry.outletName)
        throw new Error(`${prefix}当前服务不支持向量、自动化或 outlet 配置。原字段仍保留在草稿中。`);
      return entry;
    });
  }
  return book;
}

export function replaceBook(config: Config, book: Book): Config {
  return {
    ...config,
    books: config.books.some((item) => item.id === book.id)
      ? config.books.map((item) => (item.id === book.id ? book : item))
      : [...config.books, book],
  };
}

export function bookSearchText(book: Book) {
  return [
    book.id,
    book.name,
    book.keys.join(" "),
    book.content,
    ...(book.entries ?? []).map((entry) =>
      [entry.comment, entry.key.join(" "), entry.keysecondary.join(" "), entry.content].join(" "),
    ),
  ]
    .join("\n")
    .toLocaleLowerCase();
}

export function matchingBookEntries(book: Book, query: string): number[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return (book.entries ?? []).flatMap((entry, index) =>
    [entry.comment ?? "", entry.content, ...entry.key, ...entry.keysecondary].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    )
      ? [index]
      : [],
  );
}

export function newEntry(entries: EntryDraft[]): BookEntry {
  const used = new Set(entries.map((item) => item.entry.uid));
  let uid = 0;
  while (used.has(uid)) uid++;
  return {
    uid,
    comment: "",
    key: [],
    keysecondary: [],
    content: "",
    constant: false,
    selective: false,
    useProbability: true,
    disable: false,
    selectiveLogic: 0,
    probability: 100,
    order: 100,
    position: 0,
  };
}

export function bookUnchanged(original: Book, latest: Book | undefined) {
  return latest !== undefined && same(original, latest);
}

export function changedBookFields(before: unknown, after: unknown, path = ""): string[] {
  if (same(before, after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    Array.isArray(before) === Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>,
      right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
      changedBookFields(
        left[key],
        right[key],
        Array.isArray(before) ? `${path}[${key}]` : path ? `${path}.${key}` : key,
      ),
    );
  }
  return [path || "整个世界书"];
}
