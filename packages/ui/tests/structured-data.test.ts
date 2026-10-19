import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  analyzeJsonText,
  compareTextLines,
  DiffViewer,
  formatJsonText,
  JSONEditor,
  JSONViewer,
  splitTextLines,
} from "../src/components/structured-data";

describe("lossless JSON text handling", () => {
  it("formats whitespace without rounding large numbers or rewriting escaped strings and keys", () => {
    const source =
      '{"a:b":900719925474099312345,"tiny":1e-999,"escaped":"\\u4e2d\\/", "unknown":{"x":-0.0000000000000000001234}}';
    const formatted = formatJsonText(source);
    expect(formatted.ok).toBe(true);
    if (!formatted.ok) return;
    expect(formatted.text).toContain('"a:b": 900719925474099312345');
    expect(formatted.text).toContain('"tiny": 1e-999');
    expect(formatted.text).toContain('"escaped": "\\u4e2d\\/"');
    expect(formatted.text).toContain('"x": -0.0000000000000000001234');
    expect(analyzeJsonText(formatted.text).valid).toBe(true);
  });

  it("detects escaped duplicate keys in the same object and rejects formatting instead of dropping a value", () => {
    const source = '{"a":1,"\\u0061":2,"child":{"a":3}}';
    const analysis = analyzeJsonText(source);
    expect(analysis.valid).toBe(true);
    expect(analysis.duplicates).toHaveLength(1);
    expect(analysis.duplicates[0]).toMatchObject({ offset: 7, line: 1, column: 8 });
    expect(formatJsonText(source).ok).toBe(false);
    expect(formatJsonText('{"a":1,"child":{"a":2}}').ok).toBe(true);
  });

  it.each([
    '{"a":01}',
    '{"a":1.}',
    "[true,]",
    "[1e+]",
    '{"a" 2}',
    '"bad\\q"',
    '"bad\nline"',
    "null false",
    '{"a":undefined}',
    "",
  ])("rejects invalid syntax without coercion: %s", (source) => {
    expect(analyzeJsonText(source).valid).toBe(false);
    expect(formatJsonText(source).ok).toBe(false);
  });

  it("locates a bad value by source offset, line and column", () => {
    const source = '{\n  "name": "资料",\n  "broken": }';
    expect(analyzeJsonText(source).error).toMatchObject({ line: 3, column: 13, offset: source.indexOf("}") });
  });

  it("counts CRLF as one newline and points to the actual invalid escape", () => {
    expect(analyzeJsonText('{\r\n  "a": }').error).toMatchObject({ line: 2, column: 8 });
    expect(analyzeJsonText('"a\\q"').error).toMatchObject({ offset: 3, line: 1, column: 4 });
  });

  it.each([
    "null",
    "true",
    "false",
    "-0",
    "1E+40",
    '"正文"',
    "[]",
    "{}",
    '[null,{"x":[]} ]',
  ])("accepts all JSON root kinds: %s", (source) => {
    expect(analyzeJsonText(source).valid).toBe(true);
    expect(formatJsonText(source).ok).toBe(true);
  });

  it("bounds structure parsing without changing oversized or deeply nested source", () => {
    expect(analyzeJsonText(`"${"x".repeat(2_000_000)}"`)).toMatchObject({ valid: false, limited: true });
    expect(analyzeJsonText(`${"[".repeat(110)}0${"]".repeat(110)}`)).toMatchObject({
      valid: false,
      limited: true,
    });
  });

  it("keeps raw JSON input editable and labels syntax errors without disabling a caller's save action", () => {
    const html = renderToStaticMarkup(
      createElement(JSONEditor, { label: "扩展配置", value: '{"bad":}', onChange() {} }),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("定位问题");
    expect(html).toContain("格式化");
    expect(html).not.toContain("保存");
  });

  it("keeps unknown keys and duplicated original values visible in the viewer", () => {
    const html = renderToStaticMarkup(
      createElement(JSONViewer, { label: "原始内容", text: '{"unknown":1,"unknown":2}' }),
    );
    expect(html).toContain("重复键");
    expect(html).toContain("unknown");
    expect(html).toContain('data-json-kind="number">1');
    expect(html).toContain('data-json-kind="number">2');
  });
});

describe("bounded textual diff", () => {
  it("reconstructs both originals including empty lines and exact line endings", () => {
    const before = "开头\r\n\r\n原内容\n最后";
    const after = "开头\r\n\r\n新内容\n最后\n";
    const diff = compareTextLines(before, after);
    expect(
      diff.rows
        .filter((row) => row.kind !== "added")
        .map((row) => row.line.text + row.line.ending)
        .join(""),
    ).toBe(before);
    expect(
      diff.rows
        .filter((row) => row.kind !== "removed")
        .map((row) => row.line.text + row.line.ending)
        .join(""),
    ).toBe(after);
    expect(diff.rows.some((row) => row.kind === "removed" && row.line.ending === "")).toBe(true);
    expect(
      diff.rows.some((row) => row.kind === "added" && row.line.text === "最后" && row.line.ending === "\n"),
    ).toBe(true);
  });

  it("does not create an extra empty line after a final newline", () => {
    expect(splitTextLines("")).toEqual([]);
    expect(splitTextLines("\n")).toEqual([{ text: "", ending: "\n" }]);
    expect(splitTextLines("x\r\n")).toEqual([{ text: "x", ending: "\r\n" }]);
    expect(compareTextLines("", "").rows).toEqual([]);
  });

  it("uses bounded fallback for unrelated large texts while retaining every original line", () => {
    const before = Array.from({ length: 600 }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: 600 }, (_, i) => `b${i}`).join("\n");
    const diff = compareTextLines(before, after);
    expect(diff).toMatchObject({ limited: true, plain: false });
    expect(diff.rows).toHaveLength(1200);
    expect(compareTextLines("x".repeat(2_000_001), "")).toMatchObject({
      limited: true,
      plain: true,
      rows: [],
    });
  });

  it("treats LF versus CRLF as a textual change and never auto-merges either source", () => {
    const diff = compareTextLines("a\n", "a\r\n");
    expect(diff.rows.map((row) => row.kind)).toEqual(["removed", "added"]);
    const html = renderToStaticMarkup(
      createElement(DiffViewer, { label: "草稿差异", before: "a", after: "a\n" }),
    );
    expect(html).toContain("无结尾换行");
    expect(html).toContain("LF");
    expect(html).not.toContain("应用修改");
  });
});
