import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../icons";
import { DIALOG_PRESET, Glass } from "../materials/glass";
import { blockOverlayExitScroll, createOverlayMotion, type SurfaceMotion } from "../motion/overlay-motion";
import { isKeyboardInput, useOverlayContainer, useUiEnabled, useUiReducedMotion } from "../provider";
import { Button } from "./controls";
import "./overlays.css";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
  description?: ReactNode;
  className?: string;
  initialFocus?: BaseDialog.Popup.Props["initialFocus"];
  ref?: Ref<HTMLDivElement>;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

const activationTargets = new WeakMap<
  Document,
  { users: number; target: HTMLElement | null; dispose: () => void }
>();

function trackActivation(document: Document) {
  let record = activationTargets.get(document);
  if (!record) {
    const next = { users: 0, target: null as HTMLElement | null, dispose: () => {} };
    const pointer = (event: PointerEvent) => {
      const element = event.composedPath().find((node): node is Element => node instanceof Element);
      next.target =
        element?.closest<HTMLElement>("button, a[href], input, select, textarea, [tabindex]") || null;
    };
    document.addEventListener("pointerdown", pointer, true);
    next.dispose = () => document.removeEventListener("pointerdown", pointer, true);
    activationTargets.set(document, next);
    record = next;
  }
  record.users++;
  return {
    target: () => record.target,
    destroy: () => {
      if (--record.users === 0) {
        record.dispose();
        activationTargets.delete(document);
      }
    },
  };
}

function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  closeDisabled = false,
  description,
  className = "",
  initialFocus,
  ref,
  kind,
}: DialogProps & { kind: "dialog" | "drawer" }) {
  const container = useOverlayContainer();
  const reduced = useUiReducedMotion();
  const actions = useRef<BaseDialog.Root.Actions | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);
  const scrim = useRef<HTMLDivElement | null>(null);
  const motion = useRef<SurfaceMotion | null>(null);
  const releaseScroll = useRef<(() => void) | null>(null);
  const activation = useRef<ReturnType<typeof trackActivation> | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    activation.current = trackActivation(document);
    return () => {
      activation.current?.destroy();
      activation.current = null;
    };
  }, []);
  if (open && !wasOpen.current && motion.current?.state !== "exiting" && typeof document !== "undefined") {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = (isKeyboardInput() ? active : activation.current?.target()) || active;
    opener.current =
      target?.isConnected && target !== document.body && !popup.current?.contains(target) ? target : null;
  }
  wasOpen.current = open;
  const latest = useRef({ open, onClose, closeDisabled });
  latest.current = { open, onClose, closeDisabled };
  const presentation = useRef({
    title,
    children,
    footer,
    size,
    description,
    className,
  });
  if (open)
    presentation.current = {
      title,
      children,
      footer,
      size,
      description,
      className,
    };
  const visual = presentation.current;
  const connectPopup = useCallback(
    (element: HTMLDivElement | null) => {
      motion.current?.destroy();
      popup.current = element;
      setPopupElement(element);
      motion.current = element
        ? createOverlayMotion({
            surface: element,
            foregrounds: () => [
              ...Array.from(element.children).filter(
                (child): child is HTMLElement => child instanceof HTMLElement,
              ),
              scrim.current,
            ],
            fadeDecorations: true,
          })
        : null;
      assignRef(ref, element);
    },
    [ref],
  );
  useLayoutEffect(() => {
    if (!container || !popupElement || !motion.current) return;
    releaseScroll.current?.();
    releaseScroll.current = null;
    if (!open) {
      releaseScroll.current = blockOverlayExitScroll(popupElement.ownerDocument);
      actions.current?.close();
    }
    motion.current.set(open, {
      immediate: isKeyboardInput(),
      reduced,
      onFinish: open
        ? undefined
        : () => {
            if (!latest.current.open) {
              releaseScroll.current?.();
              releaseScroll.current = null;
              actions.current?.unmount();
            }
          },
    });
    return () => {
      releaseScroll.current?.();
      releaseScroll.current = null;
    };
  }, [open, reduced, container, popupElement]);
  return (
    <BaseDialog.Root
      open={open}
      actionsRef={actions}
      disablePointerDismissal={!open || closeDisabled}
      onOpenChange={(next, details) => {
        if (next) return;
        if (latest.current.open && latest.current.closeDisabled) {
          details.cancel();
          return;
        }
        details.preventUnmountOnClose();
        if (latest.current.open) latest.current.onClose();
      }}
    >
      <BaseDialog.Portal
        container={container}
        className="bt-ui-dialog-portal"
        style={
          {
            "--bt-dialog-content-wash": DIALOG_PRESET.contentWash,
            "--bt-dialog-scrim": DIALOG_PRESET.scrimOpacity,
          } as CSSProperties
        }
      >
        <BaseDialog.Backdrop ref={scrim} className="bt-ui-dialog-scrim" />
        <BaseDialog.Viewport className={`bt-ui-dialog-viewport bt-ui-dialog-viewport--${kind}`} inert={!open}>
          <BaseDialog.Popup
            ref={connectPopup}
            render={<Glass preset="dialog" />}
            className={`bt-ui-modal ${visual.className}`}
            data-size={visual.size}
            data-kind={kind}
            initialFocus={initialFocus}
            finalFocus={() => {
              const target = opener.current;
              const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              if (
                active &&
                active !== document.body &&
                active !== target &&
                !popup.current?.contains(active) &&
                !active.closest("[inert]")
              )
                return false;
              if (!target?.isConnected) return true;
              if (target.matches(":disabled, [aria-disabled='true']") || target.closest("[inert]"))
                return false;
              return target;
            }}
          >
            <header className="bt-ui-modal-header">
              <div className="bt-ui-modal-heading">
                <BaseDialog.Title className="bt-ui-modal-title">{visual.title}</BaseDialog.Title>
                {visual.description && (
                  <BaseDialog.Description className="bt-ui-modal-description">
                    {visual.description}
                  </BaseDialog.Description>
                )}
              </div>
              <BaseDialog.Close className="bt-ui-modal-close" aria-label="关闭" disabled={closeDisabled}>
                <Icon name="close" />
              </BaseDialog.Close>
            </header>
            <div className="bt-ui-modal-body">{visual.children}</div>
            {visual.footer && <footer className="bt-ui-modal-footer">{visual.footer}</footer>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function Dialog(props: DialogProps) {
  const enabled = useUiEnabled();
  return enabled ? <Modal {...props} kind="dialog" /> : null;
}

export function Drawer(props: DialogProps) {
  const enabled = useUiEnabled();
  return enabled ? <Modal {...props} kind="drawer" /> : null;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = "确认",
  busy = false,
  danger = false,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      closeDisabled={busy}
      size="sm"
      initialFocus={cancel}
      footer={
        <>
          <Button ref={cancel} disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="bt-ui-confirm-description">{description}</p>}
    </Dialog>
  );
}

export interface MenuItem {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}
export interface MenuProps {
  trigger: ReactElement;
  items: MenuItem[];
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function usePopupControl(open: boolean | undefined, onOpenChange?: (open: boolean) => void) {
  const [internal, setInternal] = useState(false);
  const enabled = useUiEnabled();
  useLayoutEffect(() => {
    if (!enabled) setInternal(false);
  }, [enabled]);
  return {
    open: enabled && (open ?? internal),
    change: (next: boolean) => {
      if (enabled) {
        if (open === undefined) setInternal(next);
        onOpenChange?.(next);
      }
    },
    enabled,
  };
}

export function Menu({ trigger, items, label, open, onOpenChange }: MenuProps) {
  const state = usePopupControl(open, onOpenChange);
  const container = useOverlayContainer();
  const reduced = useUiReducedMotion();
  return (
    <BaseMenu.Root open={state.open} onOpenChange={state.change} disabled={!state.enabled}>
      <BaseMenu.Trigger render={trigger} />
      {state.enabled && (
        <BaseMenu.Portal container={container}>
          <BaseMenu.Positioner
            sideOffset={6}
            align="end"
            className="bt-ui-popup-positioner"
            inert={!state.open}
          >
            <BaseMenu.Popup
              aria-label={label}
              className="bt-ui-popup bt-ui-menu"
              data-reduced-motion={reduced || undefined}
            >
              {items.map((item) => (
                <BaseMenu.Item
                  key={item.id}
                  disabled={item.disabled}
                  className="bt-ui-menu-item"
                  data-danger={item.danger || undefined}
                  onClick={item.onSelect}
                >
                  {item.icon && (
                    <span className="bt-ui-menu-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </BaseMenu.Item>
              ))}
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      )}
    </BaseMenu.Root>
  );
}

export interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
}

export function Popover({ trigger, children, label, open, onOpenChange, side = "bottom" }: PopoverProps) {
  const state = usePopupControl(open, onOpenChange);
  const container = useOverlayContainer();
  const reduced = useUiReducedMotion();
  return (
    <BasePopover.Root open={state.open} onOpenChange={state.change}>
      <BasePopover.Trigger render={trigger} disabled={!state.enabled} />
      {state.enabled && (
        <BasePopover.Portal container={container}>
          <BasePopover.Positioner
            side={side}
            sideOffset={8}
            className="bt-ui-popup-positioner"
            inert={!state.open}
          >
            <BasePopover.Popup
              aria-label={label}
              className="bt-ui-popup bt-ui-popover"
              data-reduced-motion={reduced || undefined}
            >
              {children}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      )}
    </BasePopover.Root>
  );
}

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ children, content, side = "top" }: TooltipProps) {
  const state = usePopupControl(undefined);
  const container = useOverlayContainer();
  const reduced = useUiReducedMotion();
  const id = useId();
  const describedBy = (children.props as { "aria-describedby"?: string })["aria-describedby"];
  return (
    <BaseTooltip.Provider delay={500}>
      <BaseTooltip.Root disabled={!state.enabled} open={state.open} onOpenChange={state.change}>
        <BaseTooltip.Trigger
          render={children}
          aria-describedby={[describedBy, state.open ? id : undefined].filter(Boolean).join(" ") || undefined}
        />
        {state.enabled && (
          <BaseTooltip.Portal container={container}>
            <BaseTooltip.Positioner
              side={side}
              sideOffset={8}
              className="bt-ui-popup-positioner bt-ui-tooltip-positioner"
            >
              <BaseTooltip.Popup
                id={id}
                role="tooltip"
                className="bt-ui-popup bt-ui-tooltip"
                data-reduced-motion={reduced || undefined}
              >
                {content}
              </BaseTooltip.Popup>
            </BaseTooltip.Positioner>
          </BaseTooltip.Portal>
        )}
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
