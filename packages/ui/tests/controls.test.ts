import { type ComponentProps, createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  Accordion,
  Button,
  Checkbox,
  Field,
  Input,
  RadioGroup,
  Switch,
  Tabs,
} from "../src/components/controls";
import {
  getPageSelection,
  nextTableSort,
  paginationInfo,
  setPageSelection,
} from "../src/components/data-table";
import { UiInteractionProvider } from "../src/provider";

// Observe only the adapter boundary; the real Base UI roots still render their
// semantic markup. DOM attachment and keyboard focus remain browser checks.
const forwardedRoots = vi.hoisted(() => new Map<string, object>());
vi.mock("@base-ui/react/checkbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/checkbox")>();
  return {
    ...actual,
    Checkbox: {
      ...actual.Checkbox,
      Root(props: ComponentProps<typeof actual.Checkbox.Root>) {
        forwardedRoots.set("checkbox", props);
        return createElement(actual.Checkbox.Root, props);
      },
    },
  };
});
vi.mock("@base-ui/react/switch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/switch")>();
  return {
    ...actual,
    Switch: {
      ...actual.Switch,
      Root(props: ComponentProps<typeof actual.Switch.Root>) {
        forwardedRoots.set("switch", props);
        return createElement(actual.Switch.Root, props);
      },
    },
  };
});
vi.mock("@base-ui/react/radio-group", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/radio-group")>();
  return {
    ...actual,
    RadioGroup(props: ComponentProps<typeof actual.RadioGroup>) {
      forwardedRoots.set("radio", props);
      return createElement(actual.RadioGroup, props);
    },
  };
});
vi.mock("@base-ui/react/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/tabs")>();
  return {
    ...actual,
    Tabs: {
      ...actual.Tabs,
      Root(props: ComponentProps<typeof actual.Tabs.Root>) {
        forwardedRoots.set("tabs", props);
        return createElement(actual.Tabs.Root, props);
      },
    },
  };
});
vi.mock("@base-ui/react/accordion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/accordion")>();
  return {
    ...actual,
    Accordion: {
      ...actual.Accordion,
      Root(props: ComponentProps<typeof actual.Accordion.Root>) {
        forwardedRoots.set("accordion", props);
        return createElement(actual.Accordion.Root, props);
      },
    },
  };
});

describe("shared control contracts", () => {
  it("keeps the button label while exposing a real disabled busy state", () => {
    const html = renderToStaticMarkup(createElement(Button, { loading: true, type: "submit" }, "保存修改"));
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("保存修改");
  });

  it("disables ordinary controls when interaction authorization is withdrawn", () => {
    const html = renderToStaticMarkup(
      createElement(
        UiInteractionProvider,
        { enabled: false } as ComponentProps<typeof UiInteractionProvider>,
        createElement(Button, null, "保存"),
        createElement(Input, { value: "草稿仍然保留", onChange: () => undefined }),
      ),
    );
    expect(html.match(/ disabled=""/g)).toHaveLength(2);
    expect(html).toContain("草稿仍然保留");
  });

  it("preserves existing descriptions while associating an external field error", () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        { label: "标题", error: "标题必填" } as ComponentProps<typeof Field>,
        createElement("input", { id: "title", required: true, "aria-describedby": "format-help" }),
      ),
    );
    expect(html).toContain('for="title"');
    expect(html).toContain('aria-describedby="format-help title-hint"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="title-hint"');
    expect(html).toContain("标题必填");
  });

  it.each([
    "checkbox",
    "switch",
  ] as const)("forwards %s refs, readonly form state and accessible help to Base UI", (kind) => {
    const ref = createRef<HTMLElement>();
    const inputRef = createRef<HTMLInputElement>();
    const onBlur = vi.fn();
    const props = {
      label: "接收提醒",
      checked: true,
      onChange: vi.fn(),
      ref,
      inputRef,
      readOnly: true,
      required: true,
      name: "notifications",
      value: "enabled",
      "aria-describedby": "notification-help",
      "aria-invalid": true,
      onBlur,
    };
    const html = renderToStaticMarkup(
      kind === "checkbox" ? createElement(Checkbox, props) : createElement(Switch, props),
    );
    expect(forwardedRoots.get(kind)).toMatchObject({
      ref,
      inputRef,
      readOnly: true,
      required: true,
      name: "notifications",
      "aria-describedby": "notification-help",
      "aria-invalid": true,
      onBlur,
    });
    expect(html).toContain('aria-describedby="notification-help"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('name="notifications"');
    expect(html).toMatch(/readonly=""/i);
    expect(html).toContain('required=""');
  });

  it("forwards radio-group root customization, form state and an explicit accessible label", () => {
    const ref = createRef<HTMLDivElement>();
    const onBlur = vi.fn();
    const html = renderToStaticMarkup(
      createElement(RadioGroup, {
        label: "阅读模式",
        options: [{ value: "quiet", label: "安静" }],
        value: "quiet",
        onChange: vi.fn(),
        ref,
        className: "reading-mode",
        id: "reading-mode",
        name: "mode",
        readOnly: true,
        "aria-labelledby": "external-title",
        "aria-describedby": "mode-help",
        onBlur,
      }),
    );
    expect(forwardedRoots.get("radio")).toMatchObject({
      ref,
      className: "bt-radio-group reading-mode",
      id: "reading-mode",
      name: "mode",
      readOnly: true,
      "aria-labelledby": "external-title",
      "aria-describedby": "mode-help",
      onBlur,
    });
    expect(html).toContain('aria-labelledby="external-title"');
    expect(html).toContain('aria-describedby="mode-help"');
    expect(html).toContain('role="radiogroup"');
  });

  it("associates each radio with its complete description when option values contain spaces", () => {
    const options = [
      { value: "team one", label: "第一组", description: "第一组成员可以编辑。" },
      { value: "team  two", label: "第二组", description: "第二组成员只能阅读。" },
    ];
    const html = renderToStaticMarkup(
      createElement(RadioGroup, {
        label: "协作范围",
        options,
        value: options[0].value,
        onChange: vi.fn(),
      }),
    );
    const descriptions = new Map(
      [...html.matchAll(/<span id="([^"]+)" class="bt-choice-description">([^<]+)<\/span>/g)].map(
        ([, id, text]) => [id, text],
      ),
    );
    const radios = [...html.matchAll(/<[^>]+\brole="radio"[^>]*>/g)].map(([tag]) => tag);
    expect(radios).toHaveLength(options.length);
    radios.forEach((radio, index) => {
      const references = radio.match(/\baria-describedby="([^"]+)"/)?.[1].split(/\s+/) || [];
      expect(references).toHaveLength(1);
      expect(descriptions.get(references[0])).toBe(options[index].description);
    });
  });

  it.each(["tabs", "accordion"] as const)("preserves %s root refs, classes and descriptions", (kind) => {
    const ref = createRef<HTMLDivElement>();
    const onBlur = vi.fn();
    const common = { ref, className: "document-sections", "aria-describedby": "section-help", onBlur };
    const element =
      kind === "tabs"
        ? createElement(Tabs, {
            ...common,
            value: "one",
            onChange: vi.fn(),
            items: [{ value: "one", label: "正文", content: "内容" }],
          })
        : createElement(Accordion, {
            ...common,
            disabled: true,
            value: ["one"],
            onChange: vi.fn(),
            items: [{ value: "one", title: "正文", content: "内容" }],
          });
    const html = renderToStaticMarkup(element);
    expect(forwardedRoots.get(kind)).toMatchObject({
      ref,
      className: kind === "tabs" ? "bt-tabs document-sections" : "bt-accordion document-sections",
      "aria-describedby": "section-help",
      onBlur,
    });
    expect(html).toContain('aria-describedby="section-help"');
    if (kind === "accordion") expect(forwardedRoots.get(kind)).toMatchObject({ disabled: true });
  });
});

describe("controlled table selection", () => {
  it("selects the visible page without removing selections from other pages", () => {
    expect(setPageSelection(["previous-page", "a"], ["a", "b"], true)).toEqual(["previous-page", "a", "b"]);
  });

  it("deselects only the visible page and leaves the caller inputs unchanged", () => {
    const selected = Object.freeze(["outside", "a", "b"]);
    const page = Object.freeze(["a", "b"]);
    expect(setPageSelection(selected, page, false)).toEqual(["outside"]);
    expect(selected).toEqual(["outside", "a", "b"]);
    expect(page).toEqual(["a", "b"]);
  });

  it("reports all, mixed, none and empty page states independently of outside selections", () => {
    expect(getPageSelection(["outside"], [])).toBe(false);
    expect(getPageSelection(["outside"], ["a", "b"])).toBe(false);
    expect(getPageSelection(["outside", "a"], ["a", "b"])).toBe("indeterminate");
    expect(getPageSelection(["outside", "a", "b"], ["a", "b"])).toBe(true);
  });

  it("does not duplicate keys across repeated controlled selection intents", () => {
    expect(setPageSelection(["a"], ["a", "a", "b"], true)).toEqual(["a", "b"]);
  });
});

describe("table sorting and pagination intents", () => {
  it("starts a new column ascending and alternates a selected column", () => {
    expect(nextTableSort(null, "title")).toEqual({ key: "title", direction: "asc" });
    expect(nextTableSort({ key: "title", direction: "asc" }, "title")).toEqual({
      key: "title",
      direction: "desc",
    });
    expect(nextTableSort({ key: "title", direction: "desc" }, "status")).toEqual({
      key: "status",
      direction: "asc",
    });
  });

  it("reports exact page bounds for full, partial and empty pages", () => {
    expect(paginationInfo(2, 19, 5)).toEqual({ page: 2, pages: 4, pageSize: 5, total: 19, from: 6, to: 10 });
    expect(paginationInfo(4, 19, 5)).toEqual({ page: 4, pages: 4, pageSize: 5, total: 19, from: 16, to: 19 });
    expect(paginationInfo(1, 0, 5)).toEqual({ page: 1, pages: 1, pageSize: 5, total: 0, from: 0, to: 0 });
  });

  it("normalizes invalid bounds for display without changing caller-owned page state", () => {
    expect(paginationInfo(999, 8, 5).page).toBe(2);
    expect(paginationInfo(-4, -10, 0)).toEqual({ page: 1, pages: 1, pageSize: 1, total: 0, from: 0, to: 0 });
    expect(paginationInfo(Number.NaN, Infinity, Number.NaN)).toEqual({
      page: 1,
      pages: 1,
      pageSize: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });
});
