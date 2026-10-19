import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Input as BaseInput } from "@base-ui/react/input";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Check, ChevronDown, Minus, Pencil, Plus, X } from "lucide-react";
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOverlayContainer, useUiEnabled, useUiReducedMotion } from "../provider";
import type { SelectOption } from "./selection";

type TextControlProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type" | "size" | "children"
>;

export interface MultiSelectProps extends TextControlProps {
  label: string;
  value: readonly string[];
  options: readonly SelectOption[];
  onChange: (value: string[]) => void;
  ref?: Ref<HTMLInputElement>;
  emptyText?: string;
}

/** Search and selected chips use one Base UI multiple Combobox controller.
 * Unknown selected IDs stay visible and submitted; changing an option list must
 * never silently erase caller-owned selections.
 */
export function MultiSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  readOnly,
  required,
  name,
  id,
  className = "",
  placeholder = "搜索并添加…",
  emptyText = "没有匹配的选项",
  ref,
  ...inputProps
}: MultiSelectProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const container = useOverlayContainer();
  const [open, setOpen] = useState(false);
  const inactive = Boolean(disabled || !enabled);
  const selected = useMemo(
    () => value.map((key) => options.find((option) => option.value === key) ?? { value: key, label: key }),
    [value, options],
  );
  useEffect(() => {
    if (inactive || readOnly) setOpen(false);
  }, [inactive, readOnly]);
  return (
    <BaseCombobox.Root<SelectOption, true>
      multiple
      items={options}
      value={selected}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key" && !open) {
          details.cancel();
          details.allowPropagation();
          return;
        }
        if (!inactive && !readOnly) onChange(next.map((option) => option.value));
      }}
      onInputValueChange={(_, details) => {
        if (details.reason === "escape-key" && !open) {
          details.cancel();
          details.allowPropagation();
        }
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open && !inactive && !readOnly}
      onOpenChange={(next, details) => {
        // Keep the list open for consecutive picks; Esc/outside still close it.
        if (!next && details.reason === "item-press") {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
      disabled={inactive}
      readOnly={readOnly}
      required={required}
      name={name}
    >
      <BaseCombobox.InputGroup
        className={`bt-multi-select ${className}`}
        data-disabled={inactive || undefined}
        data-readonly={readOnly || undefined}
      >
        <BaseCombobox.Chips className="bt-token-list">
          {selected.map((option) => (
            <BaseCombobox.Chip key={option.value} className="bt-token">
              <span className="bt-token-label">{option.label}</span>
              {!readOnly && (
                <BaseCombobox.ChipRemove className="bt-token-remove" aria-label={`移除${option.label}`}>
                  <X size={12} aria-hidden="true" />
                </BaseCombobox.ChipRemove>
              )}
            </BaseCombobox.Chip>
          ))}
          <BaseCombobox.Input
            {...inputProps}
            ref={ref}
            id={id}
            className="bt-token-input"
            aria-label={label}
            placeholder={placeholder}
          />
        </BaseCombobox.Chips>
        {!readOnly && (
          <BaseCombobox.Trigger className="bt-combobox-trigger" aria-label={`展开${label}`}>
            <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
          </BaseCombobox.Trigger>
        )}
      </BaseCombobox.InputGroup>
      {enabled && (
        <BaseCombobox.Portal container={container}>
          <BaseCombobox.Positioner
            className="bt-choice-positioner"
            sideOffset={5}
            inert={!open || inactive || readOnly}
          >
            <BaseCombobox.Popup className="bt-choice-popup" data-reduced-motion={reduced || undefined}>
              <BaseCombobox.Empty className="bt-choice-empty">{emptyText}</BaseCombobox.Empty>
              <BaseCombobox.List aria-label={label}>
                {(option: SelectOption) => (
                  <BaseCombobox.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className="bt-choice-option"
                  >
                    <span className="bt-choice-option-label">{option.label}</span>
                    <BaseCombobox.ItemIndicator className="bt-choice-check">
                      <Check size={15} aria-hidden="true" />
                    </BaseCombobox.ItemIndicator>
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      )}
    </BaseCombobox.Root>
  );
}

export interface TagInputProps extends TextControlProps {
  label: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Keyboard keys that commit one complete tag. Pasting never implicitly splits text. */
  separator?: string | readonly string[];
  /** Outer whitespace may be normalized; internal spaces, punctuation and newlines are not delimiters. */
  trim?: boolean;
  allowDuplicates?: boolean;
  /** Commit a nonempty pending tag when focus leaves the whole control. */
  commitOnBlur?: boolean;
  /** Lets the caller include pending free-form text in its unsaved-draft guard. */
  onDraftChange?: (draft: string) => void;
  ref?: Ref<HTMLInputElement>;
}

export type TagEditResult =
  | { accepted: true; values: string[] }
  | { accepted: false; reason: "empty" | "duplicate" | "stale" };

/** Pure edit intent used by the controlled adapter; no business keyword parsing. */
export function editTagValues(
  values: readonly string[],
  draft: string,
  options: { index?: number; original?: string; trim?: boolean; allowDuplicates?: boolean } = {},
): TagEditResult {
  const tag = options.trim === false ? draft : draft.trim();
  if (!tag.trim()) return { accepted: false, reason: "empty" };
  const index = options.index ?? -1;
  if (index >= 0 && (index >= values.length || values[index] !== options.original)) {
    return { accepted: false, reason: "stale" };
  }
  if (!options.allowDuplicates && values.some((value, i) => value === tag && i !== index)) {
    return { accepted: false, reason: "duplicate" };
  }
  return {
    accepted: true,
    values: index < 0 ? [...values, tag] : values.map((value, i) => (i === index ? tag : value)),
  };
}

/** Free-form tags are deliberately separate from fixed-option Combobox.
 * Enter adds/updates one tag, Esc cancels an edit, empty Backspace focuses the
 * previous tag, and its focused edit button supports Delete/Backspace removal.
 */
export function TagInput({
  label,
  value,
  onChange,
  separator = "Enter",
  trim = true,
  allowDuplicates = false,
  commitOnBlur = true,
  onDraftChange,
  disabled,
  readOnly,
  required,
  name,
  form,
  id,
  className = "",
  placeholder = "输入一项后按 Enter",
  ref,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
  ...inputProps
}: TagInputProps) {
  const enabled = useUiEnabled();
  const inactive = Boolean(disabled || !enabled);
  const input = useRef<HTMLInputElement | null>(null);
  const control = useRef<HTMLDivElement | null>(null);
  const chipButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const composing = useRef(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ index: number; original: string; priorDraft: string } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [draftError, setDraftError] = useState("");
  const generated = useId();
  const hintId = `${generated}-tag-hint`;
  const keys = typeof separator === "string" ? [separator] : separator;
  function updateDraft(next: string) {
    setDraft(next);
    // Parent navigation guards read their pending ref in the same blur/click
    // cycle; a passive effect alone would publish accepted edits too late.
    onDraftChange?.(next);
  }
  useEffect(() => {
    input.current?.setCustomValidity(
      !inactive && !readOnly ? draftError || (required && value.length === 0 ? "请至少添加一项" : "") : "",
    );
  }, [required, value.length, inactive, readOnly, draftError]);
  // Initial subscription / replacement callbacks receive the current draft;
  // user edits and commits are published synchronously by updateDraft above.
  useEffect(() => {
    onDraftChange?.(draft);
  }, [onDraftChange]);
  useEffect(() => {
    if (editing && value[editing.index] !== editing.original) {
      updateDraft(editing.priorDraft);
      setEditing(null);
      setNotice("该项已变化，请重新选择后编辑");
    }
  }, [editing, value]);
  function cancelEdit() {
    if (!editing) return;
    updateDraft(editing.priorDraft);
    setEditing(null);
    setDraftError("");
    setNotice("已取消编辑");
  }
  function commit({ focus = true }: { focus?: boolean } = {}) {
    if (inactive || readOnly) return;
    const result = editTagValues(value, draft, {
      index: editing?.index,
      original: editing?.original,
      trim,
      allowDuplicates,
    });
    if (!result.accepted) {
      const message =
        result.reason === "duplicate"
          ? "该项已存在"
          : result.reason === "stale"
            ? "该项已变化，请重新编辑"
            : "请输入内容后添加";
      setNotice(message);
      setDraftError(message);
      return;
    }
    onChange(result.values);
    updateDraft(editing?.priorDraft ?? "");
    setEditing(null);
    setDraftError("");
    setNotice(editing ? "已更新一项" : "已添加一项");
    if (focus) input.current?.focus();
  }
  function remove(index: number) {
    if (inactive || readOnly) return;
    if (editing) cancelEdit();
    onChange(value.filter((_, i) => i !== index));
    setNotice("已移除一项");
    input.current?.focus();
  }
  function startEdit(index: number) {
    if (inactive || readOnly) return;
    setEditing({ index, original: value[index], priorDraft: editing?.priorDraft ?? draft });
    updateDraft(value[index]);
    setNotice("");
    setDraftError("");
    input.current?.focus();
  }
  function inputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      inactive ||
      readOnly ||
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    if (keys.includes(event.key)) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && editing) {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      event.preventDefault();
      chipButtons.current[value.length - 1]?.focus();
    }
  }
  return (
    <div
      ref={control}
      className={`bt-tag-control ${className}`}
      data-disabled={inactive || undefined}
      data-readonly={readOnly || undefined}
    >
      <div
        className="bt-tag-input"
        data-invalid={inputProps["aria-invalid"] || Boolean(draftError) || undefined}
      >
        <div className="bt-token-list">
          {value.map((tag, index) => (
            // The index supports an explicit allowDuplicates policy; labels are never silently deduplicated.
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: String-array API can intentionally contain identical tags; tokens have no internal draft state.
              key={`${index}-${tag}`}
              className="bt-token"
              data-editing={editing?.index === index || undefined}
            >
              {readOnly ? (
                <span className="bt-token-label">{tag}</span>
              ) : (
                <button
                  type="button"
                  className="bt-token-edit"
                  ref={(element) => {
                    chipButtons.current[index] = element;
                  }}
                  disabled={inactive}
                  aria-label={`编辑${tag}`}
                  onClick={() => startEdit(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      remove(index);
                    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      const next = index + (event.key === "ArrowLeft" ? -1 : 1);
                      if (next >= 0 && next < value.length) chipButtons.current[next]?.focus();
                      else input.current?.focus();
                    }
                  }}
                >
                  <span className="bt-token-label">{tag}</span>
                  <Pencil size={11} aria-hidden="true" />
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="bt-token-remove"
                  disabled={inactive}
                  aria-label={`移除${tag}`}
                  onClick={() => remove(index)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          <BaseInput
            {...inputProps}
            id={id}
            ref={(element: HTMLInputElement | null) => {
              input.current = element;
              if (typeof ref === "function") ref(element);
              else if (ref) ref.current = element;
            }}
            aria-label={label}
            aria-invalid={inputProps["aria-invalid"] || Boolean(draftError) || undefined}
            aria-describedby={[inputProps["aria-describedby"], hintId].filter(Boolean).join(" ")}
            className="bt-token-input"
            value={draft}
            onChange={(event) => {
              updateDraft(event.target.value);
              setNotice("");
              setDraftError("");
            }}
            disabled={inactive}
            readOnly={readOnly}
            required={required && value.length === 0}
            form={form}
            placeholder={readOnly ? undefined : placeholder}
            onKeyDown={inputKeyDown}
            onBlur={(event) => {
              onBlur?.(event);
              if (
                !event.defaultPrevented &&
                commitOnBlur &&
                draft.trim() &&
                !composing.current &&
                !control.current?.contains(event.relatedTarget as Node | null)
              )
                commit({ focus: false });
            }}
            onCompositionStart={(event) => {
              composing.current = true;
              onCompositionStart?.(event);
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              onCompositionEnd?.(event);
            }}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            className="bt-tag-add"
            disabled={inactive || !draft.trim()}
            aria-label={editing ? `更新${label}` : `添加${label}`}
            onClick={() => commit()}
          >
            {editing ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          </button>
        )}
      </div>
      <span id={hintId} className="bt-tag-hint" data-error={Boolean(draftError) || undefined}>
        {draftError || (readOnly ? "" : editing ? "Enter 更新 · Esc 取消" : `${keys.join(" / ")} 添加一项`)}
      </span>
      <span className="bt-sr-only" role="status">
        {notice}
      </span>
      {name &&
        value.map((tag, index) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: Duplicate submitted values need one hidden input per occurrence.
            key={`${index}-${tag}`}
            type="hidden"
            name={name}
            value={tag}
            form={form}
            disabled={inactive}
          />
        ))}
    </div>
  );
}

export interface NumberFieldProps
  extends Omit<
    BaseNumberField.Root.Props,
    "onChange" | "onValueChange" | "defaultValue" | "className" | "children" | "render"
  > {
  label: string;
  value: number | null;
  onChange: (value: number | null, details: BaseNumberField.Root.ChangeEventDetails) => void;
  className?: string;
  placeholder?: string;
  /** Ref targets the visible text input; rootRef targets the Base UI wrapper. */
  ref?: Ref<HTMLInputElement>;
  rootRef?: Ref<HTMLDivElement>;
  inputProps?: Omit<
    BaseNumberField.Input.Props,
    "value" | "defaultValue" | "className" | "ref" | "disabled" | "readOnly" | "name" | "id"
  >;
  showStepper?: boolean;
}

/** Base UI owns the raw editing string, including '-', decimals and incomplete
 * input. The wrapper never reformats on each keystroke or maps null to zero.
 */
export function NumberField({
  label,
  value,
  onChange,
  disabled,
  readOnly,
  className = "",
  placeholder,
  ref,
  rootRef,
  id,
  inputProps,
  showStepper = true,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  allowWheelScrub = false,
  ...rootProps
}: NumberFieldProps) {
  const enabled = useUiEnabled();
  const inactive = Boolean(disabled || !enabled);
  return (
    <BaseNumberField.Root
      {...rootProps}
      id={id}
      ref={rootRef}
      className={`bt-number-field ${className}`}
      value={value}
      onValueChange={(next, details) => {
        if (!inactive && !readOnly) onChange(next, details);
      }}
      disabled={inactive}
      readOnly={readOnly}
      allowWheelScrub={allowWheelScrub}
    >
      <BaseNumberField.Group className="bt-number-group">
        {showStepper && (
          <BaseNumberField.Decrement className="bt-number-step" aria-label={`减少${label}`}>
            <Minus size={14} aria-hidden="true" />
          </BaseNumberField.Decrement>
        )}
        <BaseNumberField.Input
          {...inputProps}
          ref={ref}
          id={id}
          className="bt-number-input"
          aria-label={label}
          aria-describedby={
            [describedBy, inputProps?.["aria-describedby"]].filter(Boolean).join(" ") || undefined
          }
          aria-invalid={invalid ?? inputProps?.["aria-invalid"]}
          placeholder={placeholder}
        />
        {showStepper && (
          <BaseNumberField.Increment className="bt-number-step" aria-label={`增加${label}`}>
            <Plus size={14} aria-hidden="true" />
          </BaseNumberField.Increment>
        )}
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}

export interface SliderProps
  extends Omit<
    BaseSlider.Root.Props<number>,
    "onChange" | "onValueChange" | "defaultValue" | "className" | "children" | "render" | "orientation"
  > {
  label: string;
  value: number;
  onChange: (value: number, details: BaseSlider.Root.ChangeEventDetails) => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
  rootRef?: Ref<HTMLDivElement>;
  /** Human-readable value and unit, shared by visible output and assistive text. */
  formatValue?: (value: number) => string;
  showValue?: boolean;
}

/** Single-value horizontal slider. Pair with NumberField when exact entry is
 * useful; range values intentionally aren't represented by this API.
 */
export function Slider({
  label,
  value,
  onChange,
  disabled,
  className = "",
  ref,
  rootRef,
  formatValue,
  showValue = true,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}: SliderProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const inactive = Boolean(disabled || !enabled);
  return (
    <BaseSlider.Root
      {...props}
      ref={rootRef}
      className={`bt-slider ${className}`}
      value={value}
      onValueChange={(next, details) => {
        if (!inactive) onChange(next, details);
      }}
      disabled={inactive}
      data-reduced-motion={reduced || undefined}
    >
      <div className="bt-slider-heading">
        <BaseSlider.Label className="bt-slider-label">{label}</BaseSlider.Label>
        {showValue && (
          <BaseSlider.Value className="bt-slider-value">
            {(_, values) => (formatValue ? formatValue(values[0]) : String(values[0]))}
          </BaseSlider.Value>
        )}
      </div>
      <BaseSlider.Control className="bt-slider-control">
        <BaseSlider.Track className="bt-slider-track">
          <BaseSlider.Indicator className="bt-slider-indicator" />
          <BaseSlider.Thumb
            className="bt-slider-thumb"
            inputRef={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            getAriaValueText={formatValue ? (_, next) => formatValue(next) : undefined}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
