import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useUiEnabled, useUiReducedMotion } from "../provider";
import { Button, ErrorNotice, Input, Textarea } from "./controls";

export interface JsonIssue {
  message: string;
  offset: number;
  line: number;
  column: number;
}
export interface JsonNode {
  kind: "object" | "array" | "string" | "number" | "boolean" | "null";
  start: number;
  end: number;
  key?: string;
  keyStart?: number;
  keyEnd?: number;
  children?: JsonNode[];
}
export interface JsonAnalysis {
  valid: boolean;
  root?: JsonNode;
  error?: JsonIssue;
  duplicates: JsonIssue[];
  limited: boolean;
}

const JSON_LENGTH_LIMIT = 2_000_000;
const JSON_NODE_LIMIT = 25_000;
const JSON_DEPTH_LIMIT = 100;

function issueAt(text: string, offset: number, message: string): JsonIssue {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text[i] === "\n" || text[i] === "\r") {
      if (text[i] !== "\n" || text[i - 1] !== "\r") line += 1;
      column = 1;
    } else column += 1;
  }
  return { message, offset, line, column };
}

/** Syntax-only parser. Numeric and string literals are retained verbatim, never round-tripped through JS values. */
export function analyzeJsonText(text: string): JsonAnalysis {
  if (text.length > JSON_LENGTH_LIMIT) {
    return {
      valid: false,
      limited: true,
      duplicates: [],
      error: issueAt("", 0, "内容过大，已暂停结构校验；原文仍可阅读和编辑。"),
    };
  }
  let cursor = 0;
  let nodes = 0;
  const duplicates: JsonIssue[] = [];
  const fail = (message: string, offset = cursor): never => {
    throw issueAt(text, offset, message);
  };
  const whitespace = () => {
    while (/^[\t\n\r ]$/.test(text[cursor] || "")) cursor += 1;
  };
  const string = () => {
    const start = cursor;
    if (text[cursor] !== '"') fail("此处需要双引号字符串。");
    cursor += 1;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '"') return { start, end: cursor };
      if (char.charCodeAt(0) < 0x20) fail("字符串中包含未转义的控制字符。", cursor - 1);
      if (char === "\\") {
        const escaped = text[cursor++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(cursor, cursor + 4)))
            fail("Unicode 转义需要四位十六进制数字。");
          cursor += 4;
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped))
          fail("字符串转义无效。", Math.min(cursor - 1, text.length));
      }
    }
    return fail("字符串缺少结束双引号。");
  };
  const parse = (depth: number): JsonNode => {
    whitespace();
    if (depth > JSON_DEPTH_LIMIT || ++nodes > JSON_NODE_LIMIT)
      fail("结构过深或节点过多，已暂停结构校验；原文不会被改写。");
    const start = cursor;
    const char = text[cursor];
    if (char === "{" || char === "[") {
      const object = char === "{";
      const close = object ? "}" : "]";
      const children: JsonNode[] = [];
      const keys = new Set<string>();
      cursor += 1;
      whitespace();
      if (text[cursor] !== close) {
        while (cursor < text.length) {
          let key: string | undefined;
          let keyStart: number | undefined;
          let keyEnd: number | undefined;
          if (object) {
            whitespace();
            const token = string();
            keyStart = token.start;
            keyEnd = token.end;
            // Decoding only a string key cannot round or coerce numeric values.
            key = JSON.parse(text.slice(token.start, token.end)) as string;
            if (keys.has(key) && duplicates.length < 100)
              duplicates.push(issueAt(text, token.start, `重复键 ${JSON.stringify(key)}。`));
            keys.add(key);
            whitespace();
            if (text[cursor] !== ":") fail("属性名称后需要冒号。");
            cursor += 1;
          }
          children.push({ ...parse(depth + 1), key, keyStart, keyEnd });
          whitespace();
          if (text[cursor] === close) break;
          if (text[cursor] !== ",") fail(`此处需要逗号或 ${close}。`);
          cursor += 1;
          whitespace();
          if (text[cursor] === close) fail("JSON 不允许结尾逗号。");
        }
      }
      if (text[cursor] !== close) fail(`缺少结束符号 ${close}。`);
      cursor += 1;
      return { kind: object ? "object" : "array", start, end: cursor, children };
    }
    if (char === '"') {
      const token = string();
      return { kind: "string", ...token };
    }
    const literal = /^(?:true|false|null)/.exec(text.slice(cursor, cursor + 5))?.[0];
    if (literal) {
      cursor += literal.length;
      return { kind: literal === "null" ? "null" : "boolean", start, end: cursor };
    }
    const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    numberPattern.lastIndex = cursor;
    const number = numberPattern.exec(text)?.[0];
    if (number) {
      cursor += number.length;
      return { kind: "number", start, end: cursor };
    }
    return fail(
      cursor >= text.length ? "需要 JSON 内容。" : "此处需要对象、数组、字符串、数字、布尔值或 null。",
    );
  };
  try {
    const root = parse(0);
    whitespace();
    if (cursor !== text.length) fail("JSON 内容后存在多余字符。");
    return { valid: true, root, duplicates, limited: false };
  } catch (error) {
    const issue = error as JsonIssue;
    return {
      valid: false,
      error: issue,
      duplicates,
      limited: nodes > JSON_NODE_LIMIT || issue.message.includes("结构过深"),
    };
  }
}

export type JsonFormatResult = { ok: true; text: string } | { ok: false; error: JsonIssue };

/** Adds whitespace only. Duplicate keys are rejected instead of silently collapsed. */
export function formatJsonText(text: string, indent = 2): JsonFormatResult {
  const analysis = analyzeJsonText(text);
  if (!analysis.valid || !analysis.root)
    return { ok: false, error: analysis.error || issueAt(text, 0, "无法格式化。") };
  if (analysis.duplicates.length)
    return {
      ok: false,
      error: { ...analysis.duplicates[0], message: "存在重复键，请先明确每个键的值再格式化。" },
    };
  const step = " ".repeat(Math.max(0, Math.min(8, Math.floor(Number.isFinite(indent) ? indent : 2))));
  const format = (node: JsonNode, depth: number): string => {
    if (!node.children) return text.slice(node.start, node.end);
    const [open, close] = node.kind === "object" ? ["{", "}"] : ["[", "]"];
    if (!node.children.length) return open + close;
    return `${open}\n${node.children.map((child) => `${step.repeat(depth + 1)}${child.keyStart === undefined ? "" : `${text.slice(child.keyStart, child.keyEnd)}: `}${format(child, depth + 1)}`).join(",\n")}\n${step.repeat(depth)}${close}`;
  };
  return { ok: true, text: format(analysis.root, 0) };
}

type CopyHandler = (text: string) => Promise<void> | Promise<boolean>;
async function defaultCopy(text: string) {
  if (!globalThis.navigator?.clipboard?.writeText) throw new Error("当前环境不支持剪贴板。");
  await navigator.clipboard.writeText(text);
}

function useCopyFeedback(copy: CopyHandler = defaultCopy) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );
  return {
    feedback,
    busy,
    copy: async (text: string) => {
      const current = ++revision.current;
      setBusy(true);
      setFeedback("");
      try {
        if ((await copy(text)) === false) throw new Error("copy rejected");
        if (current === revision.current) setFeedback("已复制");
      } catch {
        if (current === revision.current) setFeedback("复制失败，请选择文字后手动复制。");
      } finally {
        if (current === revision.current) setBusy(false);
      }
    },
  };
}

export interface JSONEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  minRows?: number;
  onCopy?: CopyHandler;
  onValidationChange?: (analysis: JsonAnalysis) => void;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
}

export function JSONEditor({
  label,
  value,
  onChange,
  readOnly = false,
  disabled = false,
  minRows = 12,
  onCopy,
  onValidationChange,
  className = "",
  id,
  "aria-describedby": describedBy,
}: JSONEditorProps) {
  const enabled = useUiEnabled();
  const generated = useId();
  const editorId = id || generated;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const analysis = useMemo(() => analyzeJsonText(value), [value]);
  const issue = analysis.error || analysis.duplicates[0];
  const copy = useCopyFeedback(onCopy);
  const [formatError, setFormatError] = useState("");
  const inactive = disabled || !enabled;
  const change = (next: string) => {
    setFormatError("");
    onChange(next);
    onValidationChange?.(analyzeJsonText(next));
  };
  return (
    <section className={`bt-json-editor ${className}`} aria-label={`${label}编辑器`}>
      <div className="bt-structured-toolbar">
        <label htmlFor={editorId}>{label}</label>
        <div className="bt-structured-actions">
          <Button
            size="sm"
            disabled={inactive || readOnly || !analysis.valid || Boolean(analysis.duplicates.length)}
            onClick={() => {
              const result = formatJsonText(value);
              if (result.ok) change(result.text);
              else setFormatError(result.error.message);
            }}
          >
            格式化
          </Button>
          <Button size="sm" disabled={inactive} loading={copy.busy} onClick={() => void copy.copy(value)}>
            复制 JSON
          </Button>
        </div>
      </div>
      <Textarea
        ref={textarea}
        id={editorId}
        rows={minRows}
        value={value}
        onChange={(event) => change(event.target.value)}
        readOnly={readOnly}
        disabled={inactive}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={!analysis.valid && !analysis.limited}
        aria-describedby={[describedBy, `${editorId}-validation`].filter(Boolean).join(" ")}
      />
      <div
        id={`${editorId}-validation`}
        className="bt-json-validation"
        data-invalid={Boolean(issue) || undefined}
      >
        {issue ? (
          <>
            <span>
              {analysis.limited
                ? issue.message
                : `第 ${issue.line} 行，第 ${issue.column} 列：${issue.message}`}
            </span>
            {!analysis.limited && (
              <Button
                size="sm"
                variant="ghost"
                disabled={inactive}
                onClick={() => {
                  textarea.current?.focus();
                  textarea.current?.setSelectionRange(issue.offset, Math.min(value.length, issue.offset + 1));
                }}
              >
                定位问题
              </Button>
            )}
          </>
        ) : (
          <span>JSON 语法正确</span>
        )}
      </div>
      {analysis.duplicates.length > 0 && (
        <p className="bt-structured-note">重复键可能被其他读取器覆盖。格式化已停用，原文保持不变。</p>
      )}
      {formatError && <ErrorNotice>{formatError}</ErrorNotice>}
      <span className="bt-copy-feedback" role="status">
        {copy.feedback}
      </span>
    </section>
  );
}

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type JSONViewerSource = { text: string; value?: never } | { value: JSONValue; text?: never };
export type JSONViewerProps = JSONViewerSource & {
  label: string;
  defaultExpanded?: boolean;
  onCopy?: CopyHandler;
  maxHeight?: CSSProperties["maxHeight"];
  className?: string;
};

/** A value input is a presentation serialization, not a lossless source/round-trip contract. Use text for source fidelity. */
function viewerSource(props: JSONViewerSource): { text: string; error?: string } {
  if (props.text !== undefined) return { text: props.text };
  try {
    const text = JSON.stringify(
      props.value,
      (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error("nonfinite");
        if (
          typeof value === "bigint" ||
          value === undefined ||
          typeof value === "function" ||
          typeof value === "symbol"
        )
          throw new Error("unsupported");
        return value;
      },
      2,
    );
    return typeof text === "string"
      ? { text }
      : { text: "", error: "无法将这个值显示为 JSON，请传入 JSON 文本。" };
  } catch {
    return { text: "", error: "无法将这个值显示为 JSON，请传入有效 JSON 文本。" };
  }
}

function JsonBranch({ node, text, expanded }: { node: JsonNode; text: string; expanded: boolean }) {
  const prefix = node.keyStart === undefined ? "" : `${text.slice(node.keyStart, node.keyEnd)}: `;
  if (!node.children)
    return (
      <div className="bt-json-leaf">
        <span className="bt-json-key">{prefix}</span>
        <span data-json-kind={node.kind}>{text.slice(node.start, node.end)}</span>
      </div>
    );
  const [open, close] = node.kind === "object" ? ["{", "}"] : ["[", "]"];
  return (
    <details className="bt-json-branch" open={expanded || undefined}>
      <summary>
        <span className="bt-json-key">{prefix}</span>
        {open}
        <span className="bt-json-child-count">{node.children.length} 项</span>
        {close}
      </summary>
      <div className="bt-json-children">
        {node.children.map((child) => (
          <JsonBranch key={child.start} node={child} text={text} expanded={expanded} />
        ))}
      </div>
    </details>
  );
}

function markedText(text: string, query: string): { content: ReactNode; count: number } {
  if (!query) return { content: text, count: 0 };
  const parts: ReactNode[] = [];
  let from = 0;
  let count = 0;
  let found = text.indexOf(query, from);
  while (found !== -1 && count < 500) {
    parts.push(text.slice(from, found), <mark key={found}>{text.slice(found, found + query.length)}</mark>);
    from = found + query.length;
    count += 1;
    found = text.indexOf(query, from);
  }
  parts.push(text.slice(from));
  return { content: parts, count };
}

export function JSONViewer(props: JSONViewerProps) {
  const { label, onCopy, maxHeight = 480, defaultExpanded = false, className = "" } = props;
  const source = useMemo(() => viewerSource(props), [props.text, props.value]);
  const analysis = useMemo(() => analyzeJsonText(source.text), [source.text]);
  const [fullText, setFullText] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState("");
  const copy = useCopyFeedback(onCopy);
  const marked = useMemo(() => markedText(source.text, query), [source.text, query]);
  const structureAvailable = useMemo(() => {
    if (!analysis.valid || !analysis.root || source.text.length >= 200_000) return false;
    const pending = [analysis.root];
    let count = 0;
    while (pending.length) {
      const node = pending.pop();
      if (++count > 1500) return false;
      if (node?.children) pending.push(...node.children);
    }
    return true;
  }, [analysis, source.text]);
  const raw = fullText || Boolean(query) || !structureAvailable;
  return (
    <section className={`bt-json-viewer ${className}`} aria-label={label}>
      <div className="bt-structured-toolbar">
        <h3>{label}</h3>
        <div className="bt-structured-actions">
          {structureAvailable && (
            <Button size="sm" aria-pressed={fullText} onClick={() => setFullText(!fullText)}>
              {fullText ? "结构视图" : "显示全文"}
            </Button>
          )}
          {!raw && (
            <Button size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? "全部折叠" : "全部展开"}
            </Button>
          )}
          <Button
            size="sm"
            disabled={Boolean(source.error)}
            loading={copy.busy}
            onClick={() => void copy.copy(source.text)}
          >
            复制 JSON
          </Button>
        </div>
      </div>
      {source.error ? (
        <ErrorNotice>{source.error}</ErrorNotice>
      ) : (
        <>
          <div className="bt-json-search">
            <Input
              aria-label={`在${label}中查找`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="查找键或值…"
            />
            <span role="status">
              {query ? `${marked.count >= 500 ? "前 500" : marked.count} 处匹配` : ""}
            </span>
          </div>
          {!analysis.valid && <p className="bt-structured-note">{analysis.error?.message} 当前显示原文。</p>}
          {analysis.duplicates.length > 0 && (
            <p className="bt-structured-note">
              发现 {analysis.duplicates.length === 100 ? "至少 100" : analysis.duplicates.length}{" "}
              处重复键；下方保留所有原始条目。
            </p>
          )}
          <section
            className="bt-json-content"
            style={{ maxHeight }}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Long JSON must remain keyboard-scrollable.
            tabIndex={0}
            aria-label={`${label}内容`}
          >
            {raw ? (
              <section aria-label={`${label}原文`}>
                <pre>{marked.content || <span className="bt-structured-note">空内容</span>}</pre>
              </section>
            ) : (
              analysis.root && (
                <JsonBranch
                  key={expanded ? "expanded" : "collapsed"}
                  node={analysis.root}
                  text={source.text}
                  expanded={expanded}
                />
              )
            )}
          </section>
        </>
      )}
      <span className="bt-copy-feedback" role="status">
        {copy.feedback}
      </span>
    </section>
  );
}

export interface TextLine {
  text: string;
  ending: "\n" | "\r\n" | "\r" | "";
}
export interface DiffLine {
  kind: "same" | "added" | "removed";
  line: TextLine;
  beforeLine?: number;
  afterLine?: number;
}
export interface TextDiff {
  rows: DiffLine[];
  limited: boolean;
  plain: boolean;
  reason?: string;
}

export function splitTextLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) break;
    lines.push({ text: match[1], ending: match[2] as TextLine["ending"] });
  }
  return lines;
}

/** Bounded line LCS; on large middle sections every changed line is still displayed, with a simpler alignment. */
export function compareTextLines(before: string, after: string): TextDiff {
  if (before.length + after.length > 2_000_000)
    return { rows: [], limited: true, plain: true, reason: "内容较大，改为并排原文，未进行逐行对齐。" };
  const left = splitTextLines(before);
  const right = splitTextLines(after);
  if (left.length + right.length > 6_000)
    return { rows: [], limited: true, plain: true, reason: "行数较多，改为并排原文，未进行逐行对齐。" };
  const equal = (a: TextLine, b: TextLine) => a.text === b.text && a.ending === b.ending;
  const rows: DiffLine[] = [];
  let start = 0;
  while (start < Math.min(left.length, right.length) && equal(left[start], right[start])) {
    rows.push({ kind: "same", line: left[start], beforeLine: start + 1, afterLine: start + 1 });
    start += 1;
  }
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && equal(left[leftEnd - 1], right[rightEnd - 1])) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  const width = rightEnd - start + 1;
  const height = leftEnd - start + 1;
  const limited = width * height > 250_000;
  if (limited) {
    for (let i = start; i < leftEnd; i += 1) rows.push({ kind: "removed", line: left[i], beforeLine: i + 1 });
    for (let j = start; j < rightEnd; j += 1) rows.push({ kind: "added", line: right[j], afterLine: j + 1 });
  } else {
    const grid = new Uint16Array(width * height);
    for (let i = height - 2; i >= 0; i -= 1)
      for (let j = width - 2; j >= 0; j -= 1)
        grid[i * width + j] = equal(left[start + i], right[start + j])
          ? 1 + grid[(i + 1) * width + j + 1]
          : Math.max(grid[(i + 1) * width + j], grid[i * width + j + 1]);
    let i = start;
    let j = start;
    while (i < leftEnd || j < rightEnd) {
      if (i < leftEnd && j < rightEnd && equal(left[i], right[j])) {
        rows.push({ kind: "same", line: left[i], beforeLine: i + 1, afterLine: j + 1 });
        i += 1;
        j += 1;
      } else if (
        i < leftEnd &&
        (j >= rightEnd ||
          grid[(i - start + 1) * width + j - start] >= grid[(i - start) * width + j - start + 1])
      ) {
        rows.push({ kind: "removed", line: left[i], beforeLine: i + 1 });
        i += 1;
      } else {
        rows.push({ kind: "added", line: right[j], afterLine: j + 1 });
        j += 1;
      }
    }
  }
  for (let i = leftEnd, j = rightEnd; i < left.length; i += 1, j += 1)
    rows.push({ kind: "same", line: left[i], beforeLine: i + 1, afterLine: j + 1 });
  return {
    rows,
    limited,
    plain: false,
    reason: limited ? "变更较多，使用简化逐行对比；所有原文行均保留。" : undefined,
  };
}

export interface DiffViewerProps {
  label: string;
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  contextLines?: number;
  maxHeight?: CSSProperties["maxHeight"];
  className?: string;
}

export function DiffViewer({
  label,
  before,
  after,
  beforeLabel = "原内容",
  afterLabel = "修改后",
  contextLines = 3,
  maxHeight = 560,
  className = "",
}: DiffViewerProps) {
  const diff = useMemo(() => compareTextLines(before, after), [before, after]);
  const reduced = useUiReducedMotion();
  const [showAll, setShowAll] = useState(false);
  const context = Math.max(0, Math.min(100, Math.floor(Number.isFinite(contextLines) ? contextLines : 3)));
  const relevant = new Set<number>();
  for (let index = 0; index < diff.rows.length; index += 1)
    if (diff.rows[index].kind !== "same")
      for (
        let offset = Math.max(0, index - context);
        offset <= Math.min(diff.rows.length - 1, index + context);
        offset += 1
      )
        relevant.add(offset);
  const changed = diff.rows.some((row) => row.kind !== "same");
  let hidden = 0;
  return (
    <section
      className={`bt-diff-viewer ${className}`}
      aria-label={label}
      data-reduced-motion={reduced || undefined}
    >
      <div className="bt-structured-toolbar">
        <h3>{label}</h3>
        {changed && !diff.plain && (
          <Button size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "仅看变更上下文" : "显示全部行"}
          </Button>
        )}
      </div>
      <div className="bt-diff-legend">
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
        <span>
          <b data-kind="removed">− 删除</b>
          <b data-kind="added">+ 新增</b>
        </span>
      </div>
      {diff.reason && <p className="bt-structured-note">{diff.reason}</p>}
      {!diff.plain && !changed && <p className="bt-structured-note">{before ? "内容相同" : "两侧均为空"}</p>}
      <section
        className="bt-diff-scroll"
        style={{ maxHeight }}
        aria-label={`${label}逐行内容`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Long diffs must remain keyboard-scrollable.
        tabIndex={0}
      >
        {diff.plain ? (
          <div className="bt-diff-plain">
            <section aria-label={beforeLabel}>
              <pre>{before || "（空）"}</pre>
            </section>
            <section aria-label={afterLabel}>
              <pre>{after || "（空）"}</pre>
            </section>
          </div>
        ) : (
          <table className="bt-diff-table">
            <caption className="bt-sr-only">
              {beforeLabel}与{afterLabel}逐行对比
            </caption>
            <thead>
              <tr>
                <th>原行</th>
                <th>新行</th>
                <th>变更</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {diff.rows.flatMap((row, index) => {
                const visible = showAll || !changed || relevant.has(index);
                if (!visible) {
                  hidden += 1;
                  if (index !== diff.rows.length - 1) return [];
                }
                const result: ReactNode[] = [];
                if (hidden) {
                  result.push(
                    <tr key={`gap-${row.beforeLine}-${row.afterLine}`} className="bt-diff-gap">
                      <td colSpan={4}>
                        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                          展开 {hidden} 行未更改内容
                        </Button>
                      </td>
                    </tr>,
                  );
                  hidden = 0;
                }
                if (visible)
                  result.push(
                    <tr key={`${row.kind}-${row.beforeLine}-${row.afterLine}`} data-kind={row.kind}>
                      <td className="bt-diff-number">{row.beforeLine}</td>
                      <td className="bt-diff-number">{row.afterLine}</td>
                      <td className="bt-diff-sign">
                        <span className="bt-sr-only">
                          {row.kind === "added" ? "新增" : row.kind === "removed" ? "删除" : "相同"}
                        </span>
                        <span aria-hidden="true">
                          {row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}
                        </span>
                      </td>
                      <td className="bt-diff-text">
                        <span>{row.line.text || " "}</span>
                        <small className="bt-diff-ending">
                          {row.line.ending === ""
                            ? "无结尾换行"
                            : row.line.ending === "\r\n"
                              ? "CRLF"
                              : row.line.ending === "\r"
                                ? "CR"
                                : "LF"}
                        </small>
                      </td>
                    </tr>,
                  );
                return result;
              })}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
