import { type ComponentProps, createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CollectionList,
  clampPaneWidth,
  DocumentReader,
  findDocumentMatches,
  findTextMatches,
  HighlightText,
  LongTextEditor,
  nextTextMatchIndex,
  SplitPane,
  splitPaneBounds,
  textRangeScrollOffset,
} from "../src/components/documents";
import { UiInteractionProvider } from "../src/provider";

describe("lossless document search", () => {
  it("treats punctuation as literal text and preserves original-case offsets", () => {
    expect(findTextMatches("A+b a+B [x].*", "a+b")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ]);
    expect(findTextMatches("A+b a+B [x].*", "[x].*")).toEqual([{ start: 8, end: 13 }]);
  });

  it("keeps Chinese, emoji and line-break offsets compatible with native textarea selections", () => {
    const value = "🌧️雨后\n港口的灯\n\n雨后仍亮着灯。";
    const matches = findTextMatches(value, "雨后");
    expect(matches.map(({ start, end }) => value.slice(start, end))).toEqual(["雨后", "雨后"]);
    expect(findTextMatches(value, "灯\n\n雨")).toHaveLength(1);
    expect(findTextMatches(value, "")).toEqual([]);
  });

  it("does not produce case-folded indexes that point into the wrong original character", () => {
    const value = "İstanbul istanbul";
    const matches = findTextMatches(value, "istanbul");
    expect(matches).toEqual([{ start: 9, end: 17 }]);
    expect(value.slice(matches[0].start, matches[0].end)).toBe("istanbul");
  });

  it("searches visible string fields and explicit metadata without parsing React internals", () => {
    const sections = [
      {
        id: "one",
        title: "灯塔",
        description: "触发词：灯塔、港口",
        content: "他在灯塔等候。",
        meta: createElement("span", null, "内部节点灯塔"),
      },
      { id: "two", title: "附件", content: createElement("p", null, "自定义正文"), searchText: "灯塔资料" },
    ];
    expect(findDocumentMatches(sections, "灯塔").map(({ sectionId, part }) => [sectionId, part])).toEqual([
      ["one", "title"],
      ["one", "description"],
      ["one", "content"],
      ["two", "searchText"],
    ]);
  });

  it("navigates every match including the first backwards action and wrap-around", () => {
    expect(nextTextMatchIndex(-1, 4, 1)).toBe(0);
    expect(nextTextMatchIndex(-1, 4, -1)).toBe(3);
    expect(nextTextMatchIndex(0, 4, -1)).toBe(3);
    expect(nextTextMatchIndex(3, 4, 1)).toBe(0);
    expect(nextTextMatchIndex(0, 0, 1)).toBe(-1);
  });

  it("escapes user content as text and retains each original line break", () => {
    const html = renderToStaticMarkup(
      createElement(HighlightText, { text: "<script>\n灯\n\n灯", query: "灯", activeMatch: 1 }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;\n");
    expect(html).toContain("\n\n");
    expect(html.match(/<mark/g)).toHaveLength(2);
    expect(html).toContain('data-current="true"');
  });
});

describe("document component contracts", () => {
  it("gives separate readers unique generated anchors and preserves business slots", () => {
    const sections = [
      {
        id: "same-section",
        title: "完整正文",
        content: "第一行\n\n第二行",
        footer: createElement("details", null, createElement("summary", null, "原始字段"), "未改动字段"),
      },
    ];
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(DocumentReader, { sections, label: "左侧阅读" }),
        createElement(DocumentReader, { sections, label: "右侧阅读" }),
      ),
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain("第一行\n\n第二行");
    expect(html).toContain("未改动字段");
  });

  it("exposes reader names and disabled navigation for a failed search without hiding the original", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentReader, {
        sections: [{ id: "one", title: "设定", content: "完整且不能丢失的正文" }],
        query: "不存在",
        searchLabel: "在档案中查找",
        clearSearchLabel: "清空档案查找",
      }),
    );
    expect(html).toContain('aria-label="在档案中查找"');
    expect(html).toContain('aria-label="清空档案查找"');
    expect(html).toContain("无匹配内容");
    expect(html).toContain("完整且不能丢失的正文");
    expect(html.match(/aria-label="(?:上一个|下一个)匹配"/g)).toHaveLength(2);
  });

  it("keeps editor native form, readonly and error semantics without trimming a controlled value", () => {
    const value = "  开头\n\n末尾  ";
    const html = renderToStaticMarkup(
      createElement(LongTextEditor, {
        id: "archive-body",
        label: "正文",
        value,
        onChange: () => undefined,
        readOnly: true,
        required: true,
        name: "body",
        form: "archive-form",
        expanded: true,
        maxLength: 5,
        error: "内容超出上限",
        "aria-describedby": "external-help",
      }),
    );
    expect(html).toContain(value);
    expect(html).toContain('for="archive-body"');
    expect(html).toContain('form="archive-form"');
    expect(html).toMatch(/readonly=""/i);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="external-help archive-body-help archive-body-count"');
    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('data-over-limit="true"');
    expect(html.match(/<textarea/g)).toHaveLength(1);
  });

  it("keeps collection selection caller-owned with complete long titles and disabled rows", () => {
    const title = "这是一个需要完整显示而不能被静默截断的长中文文档标题";
    const html = renderToStaticMarkup(
      createElement(CollectionList, {
        selectedId: "one",
        onSelect: () => undefined,
        items: [
          { id: "one", title },
          { id: "two", title: "不可选择", disabled: true },
        ],
      }),
    );
    expect(html).toContain(title);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('disabled=""');
  });

  it("revokes editor and resizing interaction through the shared provider", () => {
    const html = renderToStaticMarkup(
      createElement(
        UiInteractionProvider,
        { enabled: false } as ComponentProps<typeof UiInteractionProvider>,
        createElement(
          Fragment,
          null,
          createElement(LongTextEditor, { label: "正文", value: "保留草稿", onChange: () => undefined }),
          createElement(SplitPane, { sidebar: "文档" } as ComponentProps<typeof SplitPane>, "正文"),
        ),
      ),
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("保留草稿");
    expect(html).toMatch(/<textarea[^>]+disabled=""/);
  });
});

describe("split pane bounds", () => {
  it("reserves content space, handles shrinking containers and clamps dragging", () => {
    expect(splitPaneBounds(1000, 220, 480, 360)).toEqual({ min: 220, max: 480 });
    expect(splitPaneBounds(600, 220, 480, 360)).toEqual({ min: 220, max: 230 });
    expect(splitPaneBounds(390, 220, 480, 360)).toEqual({ min: 20, max: 20 });
    expect(clampPaneWidth(999, 220, 480)).toBe(480);
    expect(clampPaneWidth(-1, 220, 480)).toBe(220);
    expect(clampPaneWidth(Number.NaN, 220, 480)).toBe(220);
  });
});

describe("native textarea range reveal", () => {
  it("preserves an already visible range and reveals late or earlier measured lines", () => {
    expect(textRangeScrollOffset(120, 140, 100, 100, 1000)).toBe(100);
    expect(textRangeScrollOffset(900, 920, 0, 100, 1000)).toBe(860);
    expect(textRangeScrollOffset(10, 30, 800, 100, 1000)).toBe(0);
  });

  it("respects real scroll bounds and shows the start of a selection larger than the viewport", () => {
    expect(textRangeScrollOffset(100, 400, 0, 100, 1000)).toBe(88);
    expect(textRangeScrollOffset(1000, 1010, 0, 100, 1050)).toBe(950);
    expect(textRangeScrollOffset(0, 10, 0, 100, 50)).toBe(0);
  });
});
