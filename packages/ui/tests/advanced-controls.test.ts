import { type ComponentProps, createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  editTagValues,
  MultiSelect,
  NumberField,
  Slider,
  TagInput,
} from "../src/components/advanced-controls";
import { Field } from "../src/components/controls";
import { UiInteractionProvider } from "../src/provider";

const roots = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock("@base-ui/react/number-field", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/number-field")>();
  return {
    ...actual,
    NumberField: {
      ...actual.NumberField,
      Root(props: ComponentProps<typeof actual.NumberField.Root>) {
        roots.set("number", props as Record<string, unknown>);
        return createElement(actual.NumberField.Root, props);
      },
    },
  };
});
vi.mock("@base-ui/react/combobox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/combobox")>();
  return {
    ...actual,
    Combobox: {
      ...actual.Combobox,
      Root(props: ComponentProps<typeof actual.Combobox.Root>) {
        roots.set("multi", props as Record<string, unknown>);
        return createElement(actual.Combobox.Root, props);
      },
    },
  };
});

describe("controlled tag edits", () => {
  it("keeps spaces and punctuation inside a tag, without mutating caller values", () => {
    const initial = Object.freeze(["港口"]);
    expect(editTagValues(initial, "  雨后 港口, 来信  ")).toEqual({
      accepted: true,
      values: ["港口", "雨后 港口, 来信"],
    });
    expect(initial).toEqual(["港口"]);
  });
  it("can preserve caller-required outer whitespace", () => {
    expect(editTagValues([], "  exact phrase  ", { trim: false })).toEqual({
      accepted: true,
      values: ["  exact phrase  "],
    });
  });
  it("replaces exactly the edited occurrence and rejects stale indexes", () => {
    const initial = ["旧词", "另一项", "旧词"];
    expect(editTagValues(initial, "新词", { index: 2, original: "旧词" })).toEqual({
      accepted: true,
      values: ["旧词", "另一项", "新词"],
    });
    expect(editTagValues(initial, "新词", { index: 1, original: "旧词" })).toEqual({
      accepted: false,
      reason: "stale",
    });
  });
  it("rejects empty and duplicate additions, but allows an unchanged edit or an explicit duplicate policy", () => {
    expect(editTagValues(["港口"], "  ")).toEqual({ accepted: false, reason: "empty" });
    expect(editTagValues(["港口"], "港口")).toEqual({ accepted: false, reason: "duplicate" });
    expect(editTagValues(["港口"], "港口", { index: 0, original: "港口" })).toEqual({
      accepted: true,
      values: ["港口"],
    });
    expect(editTagValues(["港口"], "港口", { allowDuplicates: true })).toEqual({
      accepted: true,
      values: ["港口", "港口"],
    });
  });
});

describe("advanced field contracts", () => {
  it("keeps unknown multi-select IDs rather than silently dropping them when options change", () => {
    const onChange = vi.fn();
    renderToStaticMarkup(
      createElement(MultiSelect, {
        label: "集合",
        value: ["known", "legacy"],
        options: [{ value: "known", label: "港口" }],
        onChange,
        required: true,
        name: "sets",
      }),
    );
    const root = roots.get("multi");
    expect(root).toMatchObject({
      multiple: true,
      value: [
        { value: "known", label: "港口" },
        { value: "legacy", label: "legacy" },
      ],
      required: true,
      name: "sets",
    });
    const change = root?.onValueChange as (
      value: { value: string; label: string }[],
      details: object,
    ) => void;
    change([{ value: "legacy", label: "legacy" }], { reason: "chip-remove-press" });
    expect(onChange).toHaveBeenCalledWith(["legacy"]);
  });
  it("does not emit value writes when the shared interaction scope is disabled", () => {
    const onChange = vi.fn();
    renderToStaticMarkup(
      createElement(
        UiInteractionProvider,
        { enabled: false } as ComponentProps<typeof UiInteractionProvider>,
        createElement(MultiSelect, {
          label: "集合",
          value: ["one"],
          options: [{ value: "one", label: "第一项" }],
          onChange,
        }),
      ),
    );
    expect(roots.get("multi")).toMatchObject({ disabled: true, open: false });
    const change = roots.get("multi")?.onValueChange as (value: unknown[], details: object) => void;
    change([], { reason: "none" });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("associates tags with Field help and submits each original complete value", () => {
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "关键词",
          error: "请检查关键词",
        } as ComponentProps<typeof Field>,
        createElement(TagInput, {
          label: "关键词",
          id: "tags",
          value: ["rain after", "a,b"],
          name: "tags",
          onChange: vi.fn(),
          required: true,
          readOnly: true,
        }),
      ),
    );
    expect(html).toContain('for="tags"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="tags-hint [^"]+-tag-hint"/);
    expect(html).toContain('name="tags" value="rain after"');
    expect(html).toContain('name="tags" value="a,b"');
    expect(html).not.toContain('aria-label="移除');
  });
  it("passes null, decimal stepping and validation through without enabling wheel scrub", () => {
    const onChange = vi.fn();
    const inputRef = createRef<HTMLInputElement>();
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          label: "温度",
          error: "请输入温度",
        } as ComponentProps<typeof Field>,
        createElement(NumberField, {
          label: "温度",
          id: "temperature",
          value: null,
          onChange,
          min: -2,
          max: 2,
          step: 0.1,
          required: true,
          name: "temperature",
          ref: inputRef,
        }),
      ),
    );
    expect(roots.get("number")).toMatchObject({
      value: null,
      min: -2,
      max: 2,
      step: 0.1,
      required: true,
      name: "temperature",
      allowWheelScrub: false,
    });
    expect(html).toContain('id="temperature"');
    expect(html).toContain('aria-describedby="temperature-hint"');
    expect(html).toContain('aria-invalid="true"');
    const change = roots.get("number")?.onValueChange as (value: number | null, details: object) => void;
    change(null, { reason: "input-clear" });
    expect(onChange).toHaveBeenCalledWith(null, { reason: "input-clear" });
  });
  it("renders a named slider with its exact visible value and one native range input", () => {
    const html = renderToStaticMarkup(
      createElement(Slider, {
        label: "概率",
        value: 24,
        min: 0,
        max: 100,
        step: 1,
        name: "probability",
        onChange: vi.fn(),
        formatValue: (value) => `${value}%`,
      }),
    );
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).toContain('name="probability"');
    expect(html).toContain('aria-valuetext="24%"');
    expect(html).toContain("24%</output>");
    expect(html).toContain("概率");
  });
});
