import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown, Search } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { useOverlayContainer, useUiEnabled, useUiReducedMotion } from "../provider";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SelectionProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  readOnly,
  required,
  id,
  name,
  className = "",
  placeholder = "请选择",
  ref,
  ...aria
}: SelectionProps & { ref?: Ref<HTMLButtonElement> }) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const container = useOverlayContainer();
  const [open, setOpen] = useState(false);
  const inactive = disabled || !enabled;
  useEffect(() => {
    if (inactive) setOpen(false);
  }, [inactive]);
  return (
    <BaseSelect.Root
      value={value}
      items={options}
      onValueChange={(next) => {
        if (!inactive) onChange(next ?? "");
      }}
      open={open && !inactive}
      onOpenChange={setOpen}
      disabled={inactive}
      readOnly={readOnly}
      required={required}
      name={name}
    >
      <BaseSelect.Trigger
        {...aria}
        ref={ref}
        id={id}
        aria-label={label}
        className={`bt-choice-trigger ${className}`}
      >
        <BaseSelect.Value className="bt-choice-value" placeholder={placeholder} />
        <BaseSelect.Icon>
          <ChevronDown size={15} strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      {enabled && (
        <BaseSelect.Portal container={container}>
          <BaseSelect.Positioner
            className="bt-choice-positioner"
            sideOffset={5}
            alignItemWithTrigger={false}
            inert={!open || inactive}
          >
            <BaseSelect.Popup className="bt-choice-popup" data-reduced-motion={reduced || undefined}>
              <BaseSelect.List aria-label={label}>
                {options.length ? (
                  options.map((option) => (
                    <BaseSelect.Item
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="bt-choice-option"
                    >
                      <BaseSelect.ItemText className="bt-choice-option-label">
                        {option.label}
                      </BaseSelect.ItemText>
                      <BaseSelect.ItemIndicator className="bt-choice-check">
                        <Check size={15} />
                      </BaseSelect.ItemIndicator>
                    </BaseSelect.Item>
                  ))
                ) : (
                  <div className="bt-choice-empty">暂无可选项</div>
                )}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      )}
    </BaseSelect.Root>
  );
}

export function Combobox({
  label,
  value,
  options,
  onChange,
  disabled = false,
  readOnly,
  required,
  id,
  name,
  className = "",
  placeholder = "搜索并选择…",
  ref,
  ...aria
}: SelectionProps & { ref?: Ref<HTMLInputElement> }) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const container = useOverlayContainer();
  const [open, setOpen] = useState(false);
  const inactive = disabled || !enabled;
  const selected = options.find((item) => item.value === value) ?? null;
  useEffect(() => {
    if (inactive) setOpen(false);
  }, [inactive]);
  return (
    <BaseCombobox.Root
      items={options}
      value={selected}
      onInputValueChange={(_, details) => {
        if (details.reason === "escape-key" && !open) {
          details.cancel();
          details.allowPropagation();
        }
      }}
      onValueChange={(next, details) => {
        if (details.reason === "escape-key" && !open) {
          details.cancel();
          details.allowPropagation();
          return;
        }
        if (!inactive) onChange(next?.value ?? "");
      }}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open && !inactive}
      onOpenChange={setOpen}
      disabled={inactive}
      readOnly={readOnly}
      required={required}
      name={name}
    >
      <BaseCombobox.InputGroup className={`bt-combobox ${className}`}>
        <Search className="bt-combobox-search" size={15} strokeWidth={1.75} aria-hidden="true" />
        <BaseCombobox.Input
          {...aria}
          ref={ref}
          id={id}
          aria-label={label}
          placeholder={placeholder}
          className="bt-combobox-input"
        />
        <BaseCombobox.Trigger className="bt-combobox-trigger" aria-label={`展开${label}`}>
          <ChevronDown size={15} strokeWidth={1.75} />
        </BaseCombobox.Trigger>
      </BaseCombobox.InputGroup>
      {enabled && (
        <BaseCombobox.Portal container={container}>
          <BaseCombobox.Positioner className="bt-choice-positioner" sideOffset={5} inert={!open || inactive}>
            <BaseCombobox.Popup className="bt-choice-popup" data-reduced-motion={reduced || undefined}>
              <BaseCombobox.Empty className="bt-choice-empty">没有匹配的选项</BaseCombobox.Empty>
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
                      <Check size={15} />
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
