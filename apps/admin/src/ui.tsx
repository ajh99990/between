import {
  type ButtonHTMLAttributes,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";
import { type Controller, designModule } from "./skill";

export { Icon } from "./icons";

const UiInteractionContext = createContext(true);

export function UiInteractionProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const parentEnabled = useContext(UiInteractionContext);
  return (
    <UiInteractionContext.Provider value={enabled && parentEnabled}>{children}</UiInteractionContext.Provider>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}
export function Button({
  variant = "secondary",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={props.type || "button"}
      className={`gw-admin-button bt-button inline-flex items-center justify-center gap-2 ${className}`}
      data-variant={variant}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return (
    <span className="status-badge" data-tone={tone}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`section-card ${className}`}>{children}</section>;
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
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="inline-actions">{actions}</div>}
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
    <div className="empty-state">
      <Icon name={icon} size={26} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice danger" role="alert">
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
  return (
    <div className="field">
      <label className="gw-admin-field-label" htmlFor={id}>
        {label}
        {child?.props.required ? (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {child
        ? cloneElement(child, {
            id,
            "aria-describedby": description || error ? `${id}-hint` : undefined,
            "aria-invalid": Boolean(error),
          })
        : children}
      {(description || error) && (
        <p id={`${id}-hint`} className={error ? "field-error" : "field-description"}>
          {error || description}
        </p>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  id,
  ...rest
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const enabled = useContext(UiInteractionContext);
  const effectiveDisabled = disabled || !enabled;
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Controller | null>(null);
  const current = useRef({ label, value, options, onChange, disabled: effectiveDisabled, id, ...rest });
  current.current = { label, value, options, onChange, disabled: effectiveDisabled, id, ...rest };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void designModule("components/select.js")
      .then((module) => {
        if (cancelled || !host.current) return;
        const select: Controller = module.createSelect({
          ...current.current,
          onSelect: (next: string) => {
            if (!current.current.disabled) current.current.onChange(next);
          },
          describedBy: current.current["aria-describedby"],
          invalid: current.current["aria-invalid"],
        });
        instance.current = select;
        host.current.append(select.element);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);
  useLayoutEffect(
    () =>
      instance.current?.update({
        ...current.current,
        describedBy: rest["aria-describedby"],
        invalid: rest["aria-invalid"],
      }),
    [label, value, options, effectiveDisabled, id, rest["aria-describedby"], rest["aria-invalid"]],
  );
  return (
    <div className="select-host" ref={host}>
      {failed && <span role="alert">选择控件加载失败，请刷新重试。</span>}
    </div>
  );
}

export function Glass({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "aside" | "header";
}) {
  const host = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false,
      controller: Controller | undefined;
    void designModule("components/ui.js")
      .then((module) => {
        if (!cancelled && host.current) controller = module.createGlassSurface({ element: host.current });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      controller?.destroy();
    };
  }, []);
  const Component = as;
  return (
    <Component ref={host as never} className={className} data-glass-fallback={failed || undefined}>
      {failed && (
        <p className="notice" role="status">
          视觉效果暂时无法加载，当前内容仍可正常使用。
        </p>
      )}
      {children}
    </Component>
  );
}

function DialogUnavailable({
  title,
  onClose,
  closeDisabled,
}: {
  title: string;
  onClose: () => void;
  closeDisabled: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog-unavailable"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <section className="gw-admin-modal gw-admin-dialog">
        <header className="gw-admin-modal-header">
          <h2 id={`${id}-title`} className="gw-admin-modal-title">
            {title}
          </h2>
          <Button variant="ghost" disabled={closeDisabled} aria-label="关闭加载失败的窗口" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </header>
        <div className="gw-admin-modal-body">
          <p id={`${id}-message`} role="alert">
            窗口暂时无法加载，当前修改仍保留。请取消返回，再刷新页面重试。
          </p>
        </div>
        <footer className="gw-admin-modal-footer">
          <Button variant="secondary" disabled={closeDisabled} onClick={onClose}>
            取消返回
          </Button>
        </footer>
      </section>
    </dialog>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  closeDisabled = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
}) {
  const enabled = useContext(UiInteractionContext);
  const effectiveOpen = open && enabled;
  const latest = useRef({ open: effectiveOpen, title, onClose, size, closeDisabled });
  latest.current = { open: effectiveOpen, title, onClose, size, closeDisabled };
  const controller = useRef<Controller | null>(null);
  const [slots, setSlots] = useState<{ body: HTMLElement; footer: HTMLElement } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void designModule("admin/ui.js")
      .then((module) => {
        if (cancelled) return;
        const root = document.querySelector(".glass-workbench");
        if (!root) throw new Error("窗口容器不可用。");
        const body = document.createElement("div"),
          footer = document.createElement("div");
        footer.className = "inline-actions dialog-actions";
        const dialog: Controller = module.createDialog({
          open: false,
          children: [body],
          footer: [footer],
          title: latest.current.title,
          size: latest.current.size,
          onClose: () => {
            if (latest.current.open) latest.current.onClose();
          },
        });
        controller.current = dialog;
        root.append(dialog.element);
        setSlots({ body, footer });
      })
      .catch(() => {
        if (cancelled) return;
        controller.current?.destroy();
        controller.current = null;
        setSlots(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    controller.current?.update({
      ...latest.current,
      onClose: () => {
        if (latest.current.open) latest.current.onClose();
      },
    });
  }, [effectiveOpen, title, size, closeDisabled, slots]);
  if (failed) {
    return effectiveOpen ? (
      <DialogUnavailable title={title} onClose={onClose} closeDisabled={closeDisabled} />
    ) : null;
  }
  return slots ? (
    <>
      {createPortal(children, slots.body)}
      {createPortal(footer, slots.footer)}
    </>
  ) : null;
}
