import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { Button as BaseButton } from "@base-ui/react/button";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { AnimatePresence, motion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  cloneElement,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { Icon, type IconName } from "../icons";
import { isKeyboardInput, useUiEnabled, useUiReducedMotion } from "../provider";

const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(" ");

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading = false, disabled, className, children, size = "md", ...props },
  ref,
) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  return (
    <BaseButton
      {...props}
      ref={ref}
      type={props.type || "button"}
      className={cx("bt-button", className)}
      data-variant={variant}
      data-size={size}
      data-reduced-motion={reduced || undefined}
      disabled={disabled || loading || !enabled}
      aria-busy={loading}
    >
      <span className="bt-button-content">{children}</span>
      <span className="bt-button-busy" aria-hidden="true">
        {loading && <Spinner />}
      </span>
    </BaseButton>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, ...props },
  ref,
) {
  return (
    <Button {...props} ref={ref} className={cx("bt-icon-button icon-button", className)} aria-label={label} />
  );
});

export function Spinner({ label, className }: { label?: string; className?: string }) {
  const reduced = useUiReducedMotion();
  return label ? (
    <span className={cx("bt-loading", className)} role="status" data-reduced-motion={reduced || undefined}>
      <span className="bt-spinner" aria-hidden="true" />
      <span className="bt-sr-only">{label}</span>
    </span>
  ) : (
    <span
      className={cx("bt-spinner", className)}
      aria-hidden="true"
      data-reduced-motion={reduced || undefined}
    />
  );
}

export function Skeleton({ className, style, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx("bt-skeleton", className)} style={style} aria-hidden="true" />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  return (
    <span {...props} className={cx("bt-badge status-badge", className)} data-tone={tone}>
      <span className="bt-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Panel({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={cx("bt-panel section-card", className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="bt-page-header page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="bt-actions inline-actions">{actions}</div>}
    </header>
  );
}

export function Empty({
  icon = "search",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bt-empty empty-state">
      <Icon name={icon} size={26} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("bt-notice notice danger", className)} role="alert">
      {children}
    </div>
  );
}

export function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const id = String(child?.props.id || generated);
  const hint = description || error ? `${id}-hint` : undefined;
  const describedBy = [child?.props["aria-describedby"], hint].filter(Boolean).join(" ") || undefined;
  return (
    <BaseField.Root className="bt-field field" invalid={Boolean(error)}>
      <BaseField.Label className="bt-field-label" htmlFor={id}>
        {label}
        {child?.props.required ? (
          <span className="bt-required required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </BaseField.Label>
      {child
        ? cloneElement(child, {
            id,
            "aria-describedby": describedBy,
            "aria-invalid": Boolean(error) || child.props["aria-invalid"],
          })
        : children}
      {(description || error) && (
        <p
          id={hint}
          className={error ? "bt-field-error field-error" : "bt-field-description field-description"}
        >
          {error || description}
        </p>
      )}
    </BaseField.Root>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, disabled, ...props },
  ref,
) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  return (
    <BaseInput
      {...props}
      ref={ref}
      disabled={disabled || !enabled}
      className={cx("bt-input text-input", className)}
      data-reduced-motion={reduced || undefined}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, disabled, ...props }, ref) {
    const enabled = useUiEnabled();
    const reduced = useUiReducedMotion();
    return (
      <textarea
        {...props}
        ref={ref}
        disabled={disabled || !enabled}
        className={cx("bt-textarea text-area", className)}
        data-reduced-motion={reduced || undefined}
      />
    );
  },
);

export interface CheckboxProps
  extends Omit<
    BaseCheckbox.Root.Props,
    | "checked"
    | "defaultChecked"
    | "indeterminate"
    | "onCheckedChange"
    | "onChange"
    | "children"
    | "className"
    | "render"
    | "nativeButton"
    | "ref"
    | "parent"
  > {
  label: ReactNode;
  checked: boolean | "indeterminate";
  onChange: (value: boolean) => void;
  className?: string;
  ref?: Ref<HTMLElement>;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  id,
  className,
  ref,
  ...props
}: CheckboxProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const generated = useId();
  const inputId = id || generated;
  return (
    <label
      className={cx("bt-choice", className)}
      htmlFor={inputId}
      data-disabled={disabled || !enabled || undefined}
      data-reduced-motion={reduced || undefined}
    >
      <BaseCheckbox.Root
        {...props}
        ref={ref}
        id={inputId}
        className="bt-checkbox"
        disabled={disabled || !enabled}
        checked={checked === true}
        indeterminate={checked === "indeterminate"}
        onCheckedChange={onChange}
      >
        <BaseCheckbox.Indicator className="bt-choice-indicator">
          <Icon name={checked === "indeterminate" ? "minus" : "check"} size={12} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className="bt-choice-label">{label}</span>
    </label>
  );
}

export interface SwitchProps
  extends Omit<
    BaseSwitch.Root.Props,
    | "checked"
    | "defaultChecked"
    | "onCheckedChange"
    | "onChange"
    | "children"
    | "className"
    | "render"
    | "nativeButton"
    | "ref"
  > {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  ref?: Ref<HTMLElement>;
}

export function Switch({ label, checked, onChange, disabled, id, className, ref, ...props }: SwitchProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const generated = useId();
  const inputId = id || generated;
  return (
    <label
      className={cx("bt-choice", className)}
      htmlFor={inputId}
      data-disabled={disabled || !enabled || undefined}
      data-reduced-motion={reduced || undefined}
    >
      <BaseSwitch.Root
        {...props}
        ref={ref}
        id={inputId}
        className="bt-switch"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled || !enabled}
      >
        <BaseSwitch.Thumb className="bt-switch-thumb" />
      </BaseSwitch.Root>
      <span className="bt-choice-label">{label}</span>
    </label>
  );
}

export interface RadioGroupProps
  extends Omit<
    BaseRadioGroup.Props<string>,
    "children" | "value" | "defaultValue" | "onValueChange" | "onChange" | "className" | "render" | "ref"
  > {
  label: string;
  options: {
    value: string;
    label: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
  }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
  ref,
  "aria-labelledby": labelledBy,
  ...props
}: RadioGroupProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  const id = useId();
  return (
    <div className="bt-radio-field" data-reduced-motion={reduced || undefined}>
      <p id={id} className="bt-field-label">
        {label}
      </p>
      <BaseRadioGroup
        {...props}
        ref={ref}
        className={cx("bt-radio-group", className)}
        aria-labelledby={labelledBy || (props["aria-label"] ? undefined : id)}
        value={value}
        onValueChange={onChange}
        disabled={disabled || !enabled}
      >
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${encodeURIComponent(option.value)}-input`}
            className="bt-choice bt-radio-option"
            data-disabled={option.disabled || disabled || !enabled || undefined}
          >
            <BaseRadio.Root
              id={`${id}-${encodeURIComponent(option.value)}-input`}
              value={option.value}
              className="bt-radio"
              disabled={option.disabled}
              aria-describedby={
                option.description ? `${id}-${encodeURIComponent(option.value)}-description` : undefined
              }
            >
              <BaseRadio.Indicator className="bt-radio-dot" />
            </BaseRadio.Root>
            <span className="bt-choice-label">
              {option.label}
              {option.description && (
                <span
                  id={`${id}-${encodeURIComponent(option.value)}-description`}
                  className="bt-choice-description"
                >
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </BaseRadioGroup>
    </div>
  );
}

export interface TabsProps
  extends Omit<
    BaseTabs.Root.Props,
    "children" | "value" | "defaultValue" | "onValueChange" | "onChange" | "className" | "render" | "ref"
  > {
  label?: string;
  items: {
    value: string;
    label: ReactNode;
    content: ReactNode;
    disabled?: boolean;
  }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function Tabs({ label = "内容分类", items, value, onChange, className, ref, ...props }: TabsProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  return (
    <BaseTabs.Root
      {...props}
      ref={ref}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      className={cx("bt-tabs", className)}
      data-reduced-motion={reduced || undefined}
    >
      <BaseTabs.List aria-label={label} className="bt-tab-list" activateOnFocus={false}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            className="bt-tab"
            disabled={item.disabled || !enabled}
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel key={item.value} value={item.value} className="bt-tab-panel" keepMounted>
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}

export interface AccordionProps
  extends Omit<
    BaseAccordion.Root.Props<string>,
    | "children"
    | "value"
    | "defaultValue"
    | "onValueChange"
    | "onChange"
    | "className"
    | "render"
    | "ref"
    | "multiple"
    | "keepMounted"
  > {
  items: {
    value: string;
    title: ReactNode;
    content: ReactNode;
    disabled?: boolean;
  }[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function Accordion({ items, value, onChange, disabled, className, ref, ...props }: AccordionProps) {
  const enabled = useUiEnabled();
  const reduced = useUiReducedMotion();
  return (
    <BaseAccordion.Root
      {...props}
      ref={ref}
      className={cx("bt-accordion", className)}
      multiple
      value={value}
      onValueChange={onChange}
      disabled={disabled || !enabled}
      keepMounted
      data-reduced-motion={reduced || undefined}
    >
      {items.map((item) => (
        <BaseAccordion.Item
          key={item.value}
          value={item.value}
          className="bt-accordion-item"
          disabled={item.disabled}
        >
          <BaseAccordion.Header className="bt-accordion-heading">
            <BaseAccordion.Trigger className="bt-accordion-trigger">
              {item.title}
              <Icon name="chevronDown" size={16} />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="bt-accordion-panel">
            <div>{item.content}</div>
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}

export function Toast({
  feedback,
  onClose,
}: {
  feedback: { message: string; tone: string } | null;
  onClose: () => void;
}) {
  const reduce = useUiReducedMotion() || isKeyboardInput();
  const enabled = useUiEnabled();
  if (!enabled) return null;
  return (
    <AnimatePresence initial={false}>
      {feedback && (
        <motion.div
          key="feedback"
          className="bt-toast toast"
          data-tone={feedback.tone}
          role={feedback.tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              duration: reduce ? 0 : 0.18,
              ease: [0.23, 1, 0.32, 1],
            },
          }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : 8,
            transition: {
              duration: reduce ? 0 : 0.14,
              ease: [0.23, 1, 0.32, 1],
            },
          }}
        >
          <Icon name={feedback.tone === "error" ? "alert" : "check"} />
          <span>{feedback.message}</span>
          <IconButton label="关闭通知" variant="ghost" onClick={onClose}>
            <Icon name="close" size={14} />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
