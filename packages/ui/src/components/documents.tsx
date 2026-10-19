import {
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../icons";
import { useUiEnabled, useUiReducedMotion } from "../provider";
import { Button, Empty, IconButton, Input } from "./controls";

const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(" ");

export interface TextMatch {
  start: number;
  end: number;
}

/** Literal, case-insensitive matches retain original UTF-16 offsets and text. */
export function findTextMatches(text: string, query: string): TextMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(escaped, "giu"))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function nextTextMatchIndex(index: number, count: number, direction: number) {
  if (count <= 0) return -1;
  if (index < 0) return direction < 0 ? count - 1 : 0;
  return (((index + direction) % count) + count) % count;
}

export interface HighlightTextProps {
  text: string;
  query: string;
  activeMatch?: number;
  onMatchRef?: (index: number, node: HTMLElement | null) => void;
}

/** No HTML interpretation, replacement, trimming or hidden DOM traversal. */
export function HighlightText({ text, query, activeMatch, onMatchRef }: HighlightTextProps) {
  const matches = useMemo(() => findTextMatches(text, query), [text, query]);
  const parts: ReactNode[] = [];
  let offset = 0;
  matches.forEach((match, index) => {
    if (match.start > offset) parts.push(text.slice(offset, match.start));
    parts.push(
      <mark
        key={`${match.start}-${match.end}`}
        className="bt-document-match"
        data-current={activeMatch === index || undefined}
        ref={onMatchRef ? (node) => onMatchRef(index, node) : undefined}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    offset = match.end;
  });
  if (offset < text.length) parts.push(text.slice(offset));
  return <>{matches.length ? parts : text}</>;
}

export interface DocumentSection {
  id: string;
  /** Optional integration anchor. The caller must keep explicit DOM IDs unique. */
  domId?: string;
  title: ReactNode;
  content: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  /** Searchable metadata for custom React content; hits locate its section. */
  searchText?: string;
}

type MatchPart = "title" | "description" | "content" | "searchText";
export interface DocumentMatch extends TextMatch {
  sectionId: string;
  part: MatchPart;
  index: number;
}

export function findDocumentMatches(sections: readonly DocumentSection[], query: string): DocumentMatch[] {
  return sections.flatMap((section) =>
    (["title", "description", "content", "searchText"] as const).flatMap((part) => {
      const text = section[part];
      if (typeof text !== "string") return [];
      return findTextMatches(text, query).map((match, index) => ({
        ...match,
        sectionId: section.id,
        part,
        index,
      }));
    }),
  );
}

export interface DocumentReaderProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  sections: readonly DocumentSection[];
  label?: string;
  searchLabel?: string;
  outlineLabel?: string;
  clearSearchLabel?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  activeSectionId?: string;
  onActiveSectionChange?: (id: string) => void;
  header?: ReactNode;
  toolbar?: ReactNode;
  empty?: ReactNode;
  emptyTitle?: string;
  showOutline?: boolean;
  stickySearch?: boolean;
  renderText?: (
    text: string,
    context: { query: string; sectionId: string; highlighted: ReactNode },
  ) => ReactNode;
}

export function DocumentReader({
  sections,
  label = "文档阅读",
  searchLabel = "在文档中查找",
  outlineLabel = "文档目录",
  clearSearchLabel = "清空文档查找",
  query: controlledQuery,
  onQueryChange,
  activeSectionId,
  onActiveSectionChange,
  header,
  toolbar,
  empty,
  emptyTitle = "暂无正文",
  showOutline = true,
  stickySearch = true,
  renderText,
  className,
  ...props
}: DocumentReaderProps) {
  const instance = useId();
  const reduced = useUiReducedMotion();
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const [localSection, setLocalSection] = useState<string>();
  const currentSection = activeSectionId ?? localSection;
  const [matchIndex, setMatchIndex] = useState(-1);
  const searchInput = useRef<HTMLInputElement>(null);
  const sectionNodes = useRef(new Map<string, HTMLElement>());
  const matchNodes = useRef(new Map<string, HTMLElement>());
  const matches = useMemo(() => findDocumentMatches(sections, query), [sections, query]);
  const selectedIndex = matches.length ? Math.min(matchIndex, matches.length - 1) : -1;
  const currentMatch = matches[selectedIndex];
  const matchKey = (section: string, part: MatchPart, index: number) =>
    `${section}\u0000${part}\u0000${index}`;
  useEffect(() => setMatchIndex(-1), [query]);

  const scrollTo = (node: HTMLElement | undefined) => {
    node?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start", inline: "nearest" });
  };
  const chooseSection = (id: string) => {
    setLocalSection(id);
    onActiveSectionChange?.(id);
    scrollTo(sectionNodes.current.get(id));
  };
  const previousControlledSection = useRef(activeSectionId);
  useEffect(() => {
    if (previousControlledSection.current !== activeSectionId && activeSectionId) {
      scrollTo(sectionNodes.current.get(activeSectionId));
    }
    previousControlledSection.current = activeSectionId;
  }, [activeSectionId, reduced]);

  const moveMatch = (direction: number) => {
    if (!matches.length) return;
    const index = nextTextMatchIndex(selectedIndex, matches.length, direction);
    setMatchIndex(index);
    const match = matches[index];
    setLocalSection(match.sectionId);
    onActiveSectionChange?.(match.sectionId);
    const node = matchNodes.current.get(matchKey(match.sectionId, match.part, match.index));
    (node || sectionNodes.current.get(match.sectionId))?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  };
  const highlighted = (text: string, sectionId: string, part: MatchPart) => (
    <HighlightText
      text={text}
      query={query}
      activeMatch={
        currentMatch?.sectionId === sectionId && currentMatch.part === part ? currentMatch.index : undefined
      }
      onMatchRef={(index, node) => {
        const key = matchKey(sectionId, part, index);
        if (node) matchNodes.current.set(key, node);
        else matchNodes.current.delete(key);
      }}
    />
  );

  return (
    <section
      {...props}
      className={cx("bt-document-reader", className)}
      aria-label={label}
      data-sticky-search={stickySearch || undefined}
    >
      {header}
      <div className="bt-document-toolbar">
        <div className="bt-document-search">
          <Icon name="search" size={16} />
          <Input
            ref={searchInput}
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => {
              setLocalQuery(event.target.value);
              onQueryChange?.(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                moveMatch(event.shiftKey ? -1 : 1);
              }
            }}
          />
          {query && (
            <IconButton
              label={clearSearchLabel}
              variant="ghost"
              size="sm"
              onClick={() => {
                setLocalQuery("");
                onQueryChange?.("");
                searchInput.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </IconButton>
          )}
        </div>
        {query && (
          <div className="bt-document-find-controls">
            <span role="status" aria-live="polite" className="bt-document-match-count">
              {matches.length
                ? selectedIndex < 0
                  ? `${matches.length} 个匹配`
                  : `${selectedIndex + 1} / ${matches.length}`
                : "无匹配内容"}
            </span>
            <IconButton label="上一个匹配" size="sm" disabled={!matches.length} onClick={() => moveMatch(-1)}>
              <Icon name="chevronLeft" size={14} />
            </IconButton>
            <IconButton label="下一个匹配" size="sm" disabled={!matches.length} onClick={() => moveMatch(1)}>
              <Icon name="chevronRight" size={14} />
            </IconButton>
          </div>
        )}
        {toolbar && <div className="bt-document-toolbar-slot">{toolbar}</div>}
      </div>
      {showOutline && sections.length > 1 && (
        <nav className="bt-document-outline" aria-label={outlineLabel}>
          {sections.map((section, index) => (
            <Button
              key={section.id}
              variant="ghost"
              size="sm"
              aria-current={currentSection === section.id ? "location" : undefined}
              onClick={() => chooseSection(section.id)}
            >
              <span className="bt-document-outline-index">{index + 1}.</span>
              {section.title}
            </Button>
          ))}
        </nav>
      )}
      {sections.length ? (
        <div className="bt-document-sections">
          {sections.map((section) => {
            const titleId = `${instance}-${encodeURIComponent(section.id)}-title`;
            const text = typeof section.content === "string" ? section.content : undefined;
            const marked = text !== undefined ? highlighted(text, section.id, "content") : undefined;
            return (
              <section
                key={section.id}
                id={section.domId || `${instance}-${encodeURIComponent(section.id)}`}
                className="bt-document-section"
                aria-labelledby={titleId}
                ref={(node) => {
                  if (node) sectionNodes.current.set(section.id, node);
                  else sectionNodes.current.delete(section.id);
                }}
              >
                <header className="bt-document-section-heading">
                  <div className="bt-document-section-title">
                    <h2 id={titleId}>
                      {typeof section.title === "string"
                        ? highlighted(section.title, section.id, "title")
                        : section.title}
                    </h2>
                    {section.meta && <div className="bt-document-meta">{section.meta}</div>}
                  </div>
                  {section.actions && <div className="bt-document-section-actions">{section.actions}</div>}
                </header>
                {section.description && (
                  <div className="bt-document-description">
                    {typeof section.description === "string"
                      ? highlighted(section.description, section.id, "description")
                      : section.description}
                  </div>
                )}
                <div className={cx("bt-document-content", section.contentClassName)}>
                  {text !== undefined
                    ? renderText
                      ? renderText(text, { query, sectionId: section.id, highlighted: marked })
                      : marked
                    : section.content}
                </div>
                {section.footer && <footer className="bt-document-section-footer">{section.footer}</footer>}
              </section>
            );
          })}
        </div>
      ) : (
        empty || <Empty icon="book" title={emptyTitle} />
      )}
    </section>
  );
}

export function splitPaneBounds(containerWidth: number, minimum = 220, maximum = 480, contentMinimum = 360) {
  const available = Math.max(0, containerWidth - Math.max(0, contentMinimum) - 10);
  const max = Math.min(Math.max(0, maximum), available);
  const min = Math.min(Math.max(0, minimum), max);
  return { min, max };
}

export function clampPaneWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(width) ? width : min, min), Math.max(min, max));
}

export interface SplitPaneProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  sidebar: ReactNode;
  children: ReactNode;
  label?: string;
  sidebarLabel?: string;
  sidebarWidth?: number;
  defaultSidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  minContentWidth?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  sidebarClassName?: string;
  contentClassName?: string;
}

export function SplitPane({
  sidebar,
  children,
  label = "阅读工作区",
  sidebarLabel = "列表",
  sidebarWidth,
  defaultSidebarWidth = 280,
  onSidebarWidthChange,
  minSidebarWidth = 220,
  maxSidebarWidth = 480,
  minContentWidth = 360,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  sidebarClassName,
  contentClassName,
  className,
  style,
  ...props
}: SplitPaneProps) {
  const enabled = useUiEnabled();
  const root = useRef<HTMLElement>(null);
  const sidebarId = useId();
  const [containerWidth, setContainerWidth] = useState(0);
  const [localWidth, setLocalWidth] = useState(defaultSidebarWidth);
  const [localCollapsed, setLocalCollapsed] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ pointerId: number; clientX: number; width: number } | null>(null);
  const collapsed = controlledCollapsed ?? localCollapsed;
  const narrow = containerWidth > 0 && containerWidth <= 700;
  const bounds = splitPaneBounds(containerWidth || 1000, minSidebarWidth, maxSidebarWidth, minContentWidth);
  const width = clampPaneWidth(sidebarWidth ?? localWidth, bounds.min, bounds.max);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const resize = () => setContainerWidth(node.getBoundingClientRect().width);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const updateWidth = (next: number) => {
    const clamped = clampPaneWidth(next, bounds.min, bounds.max);
    setLocalWidth(clamped);
    onSidebarWidthChange?.(clamped);
  };
  return (
    <section
      {...props}
      ref={root}
      className={cx("bt-split-pane", className)}
      aria-label={label}
      data-narrow={narrow || undefined}
      data-collapsed={collapsed || undefined}
      data-dragging={dragging || undefined}
      style={{ ...style, "--bt-sidebar-width": `${width}px` } as CSSProperties}
    >
      <div className="bt-split-mobile-toolbar">
        <Button
          aria-expanded={!collapsed}
          aria-controls={sidebarId}
          onClick={() => {
            setLocalCollapsed(!collapsed);
            onCollapsedChange?.(!collapsed);
          }}
        >
          <Icon name="menu" size={15} />
          {collapsed ? `展开${sidebarLabel}` : `收起${sidebarLabel}`}
        </Button>
      </div>
      <div className="bt-split-layout">
        <div id={sidebarId} className={cx("bt-split-sidebar", sidebarClassName)} hidden={narrow && collapsed}>
          {sidebar}
        </div>
        <hr
          aria-label={`调整${sidebarLabel}宽度`}
          aria-orientation="vertical"
          aria-controls={sidebarId}
          aria-valuemin={Math.round(bounds.min)}
          aria-valuemax={Math.round(bounds.max)}
          aria-valuenow={Math.round(width)}
          aria-valuetext={`${Math.round(width)} 像素`}
          aria-disabled={!enabled || undefined}
          tabIndex={enabled && !narrow ? 0 : -1}
          className="bt-split-separator"
          onPointerDown={(event) => {
            if (!enabled || narrow || event.button !== 0) return;
            event.preventDefault();
            dragStart.current = { pointerId: event.pointerId, clientX: event.clientX, width };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = dragStart.current;
            if (!start || start.pointerId !== event.pointerId || !enabled) return;
            updateWidth(start.width + event.clientX - start.clientX);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            dragStart.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            dragStart.current = null;
            setDragging(false);
          }}
          onKeyDown={(event) => {
            if (!enabled) return;
            const step = event.shiftKey ? 32 : 16;
            const next =
              event.key === "ArrowLeft"
                ? width - step
                : event.key === "ArrowRight"
                  ? width + step
                  : event.key === "Home"
                    ? bounds.min
                    : event.key === "End"
                      ? bounds.max
                      : undefined;
            if (next !== undefined) {
              event.preventDefault();
              updateWidth(next);
            }
          }}
        />
        <div className={cx("bt-split-content", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}

export interface CollectionItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface CollectionListProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect" | "children"> {
  items: readonly CollectionItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  label?: string;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
}

export function CollectionList({
  items,
  selectedId,
  onSelect,
  label = "文档列表",
  header,
  footer,
  empty,
  className,
  ...props
}: CollectionListProps) {
  return (
    <div {...props} className={cx("bt-collection", className)}>
      {header && <div className="bt-collection-header">{header}</div>}
      {items.length ? (
        <ul className="bt-collection-list" aria-label={label}>
          {items.map((item) => (
            <li key={item.id}>
              <Button
                className="bt-collection-item"
                variant="ghost"
                aria-current={item.id === selectedId ? "true" : undefined}
                disabled={item.disabled}
                onClick={() => onSelect(item.id)}
              >
                {item.icon && <span className="bt-collection-icon">{item.icon}</span>}
                <span className="bt-collection-copy">
                  <span className="bt-collection-title">{item.title}</span>
                  {item.description && <span className="bt-collection-description">{item.description}</span>}
                  {item.meta && <span className="bt-collection-meta">{item.meta}</span>}
                </span>
                <Icon name="chevronRight" size={15} className="bt-collection-arrow" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        empty || <Empty title="没有匹配文档" />
      )}
      {footer && <div className="bt-collection-footer">{footer}</div>}
    </div>
  );
}

export interface LongTextEditorProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "defaultValue" | "onChange" | "children"
  > {
  label: string;
  value: string;
  onChange: (value: string) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
  description?: ReactNode;
  error?: ReactNode;
  toolbar?: ReactNode;
  textareaClassName?: string;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

/** Keep a real measured range visible, centering only when it is outside view. */
export function textRangeScrollOffset(
  start: number,
  end: number,
  current: number,
  viewport: number,
  extent: number,
) {
  const maximum = Math.max(0, extent - viewport);
  const clamp = (offset: number) => Math.max(0, Math.min(maximum, offset));
  if (viewport <= 0) return clamp(current);
  const margin = Math.min(12, viewport / 4);
  if (start >= current + margin && end <= current + viewport - margin) return clamp(current);
  return clamp(end - start > viewport - margin * 2 ? start - margin : (start + end - viewport) / 2);
}

/** Browsers do not consistently scroll native text controls when selecting a
 * range programmatically. Measure actual wrapping rather than estimating a
 * character ratio, then scroll the unchanged textarea explicitly. The temporary
 * mirror exists synchronously, is hidden/inert and is removed before returning.
 */
function revealTextareaRange(textarea: HTMLTextAreaElement, start: number, end: number) {
  const document = textarea.ownerDocument;
  const view = document.defaultView;
  if (!view || !textarea.clientWidth || !textarea.clientHeight) return;
  const computed = view.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  mirror.setAttribute("aria-hidden", "true");
  mirror.setAttribute("data-bt-textarea-measure", "");
  mirror.inert = true;
  const properties = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variant",
    "font-feature-settings",
    "font-variation-settings",
    "font-kerning",
    "font-optical-sizing",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-indent",
    "text-transform",
    "text-align",
    "text-rendering",
    "direction",
    "tab-size",
    "word-break",
    "overflow-wrap",
    "hyphens",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
  ];
  for (const property of properties) mirror.style.setProperty(property, computed.getPropertyValue(property));
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    width: `${textarea.clientWidth}px`,
    minWidth: "0",
    maxWidth: "none",
    height: "auto",
    minHeight: "0",
    maxHeight: "none",
    margin: "0",
    border: "0",
    overflow: "visible",
    whiteSpace: textarea.wrap === "off" ? "pre" : "pre-wrap",
  });
  marker.textContent = textarea.value.slice(start, end) || "\u200b";
  mirror.append(
    document.createTextNode(textarea.value.slice(0, start)),
    marker,
    document.createTextNode(textarea.value.slice(end)),
  );
  (document.body || document.documentElement).append(mirror);
  try {
    const bounds = mirror.getBoundingClientRect();
    const rectangles = Array.from(marker.getClientRects()).filter((rectangle) => rectangle.height > 0);
    if (!rectangles.length) return;
    const first = rectangles[0];
    const last = rectangles[rectangles.length - 1];
    textarea.scrollTop = textRangeScrollOffset(
      first.top - bounds.top,
      last.bottom - bounds.top,
      textarea.scrollTop,
      textarea.clientHeight,
      textarea.scrollHeight,
    );
    // A textarea can be only partly visible inside a shorter scroll host. Its
    // internal scroll range still uses the full control height, so additionally
    // reveal the measured selection line in actual scrollable ancestors.
    const selectionTop = first.top - bounds.top;
    const selectionBottom = last.bottom - bounds.top;
    const lineBounds = () => {
      const top = textarea.getBoundingClientRect().top + textarea.clientTop - textarea.scrollTop;
      return { top: top + selectionTop, bottom: top + selectionBottom };
    };
    const revealDelta = (top: number, bottom: number) => {
      const line = lineBounds();
      const margin = Math.min(8, Math.max(0, (bottom - top) / 4));
      if (line.bottom - line.top > bottom - top - margin * 2 || line.top < top + margin) {
        return line.top - top - margin;
      }
      return line.bottom > bottom - margin ? line.bottom - bottom + margin : 0;
    };
    for (let parent = textarea.parentElement; parent; parent = parent.parentElement) {
      const overflow = view.getComputedStyle(parent).overflowY;
      if (!/^(auto|scroll)$/.test(overflow) || parent.scrollHeight <= parent.clientHeight) continue;
      const parentTop = parent.getBoundingClientRect().top + parent.clientTop;
      const delta = revealDelta(parentTop, parentTop + parent.clientHeight);
      if (delta) parent.scrollTo({ top: parent.scrollTop + delta, behavior: "instant" });
    }
    const scrollingElement = document.scrollingElement;
    if (scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight) {
      const overflow = view.getComputedStyle(scrollingElement).overflowY;
      if (overflow !== "hidden" && overflow !== "clip") {
        const viewportTop = view.visualViewport?.offsetTop || 0;
        const viewportHeight = view.visualViewport?.height || view.innerHeight;
        const delta = revealDelta(viewportTop, viewportTop + viewportHeight);
        if (delta) view.scrollBy({ top: delta, behavior: "instant" });
      }
    }
    // Wrapped prose has no horizontal movement. Preserve the native RTL model;
    // unwrapped LTR text can reveal a long-line selection on the same metric.
    if (textarea.wrap === "off" && computed.direction !== "rtl") {
      textarea.scrollLeft = textRangeScrollOffset(
        first.left - bounds.left,
        last.right - bounds.left,
        textarea.scrollLeft,
        textarea.clientWidth,
        textarea.scrollWidth,
      );
    }
  } finally {
    mirror.remove();
  }
}

export const LongTextEditor = forwardRef<HTMLTextAreaElement, LongTextEditorProps>(function LongTextEditor(
  {
    label,
    value,
    onChange,
    query: controlledQuery,
    onQueryChange,
    expanded: controlledExpanded,
    onExpandedChange,
    description,
    error,
    toolbar,
    className,
    textareaClassName,
    id: providedId,
    disabled,
    maxLength,
    "aria-describedby": describedBy,
    "aria-label": ariaLabel,
    onScroll,
    ...props
  },
  ref,
) {
  const enabled = useUiEnabled();
  const generated = useId();
  const id = providedId || generated;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [localExpanded, setLocalExpanded] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1);
  const scrollPosition = useRef({ top: 0, left: 0 });
  const query = controlledQuery ?? localQuery;
  const expanded = controlledExpanded ?? localExpanded;
  const previousExpanded = useRef(expanded);
  const matches = useMemo(() => findTextMatches(value, query), [value, query]);
  const currentMatch = matches.length ? Math.min(matchIndex, matches.length - 1) : -1;
  const textareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textarea.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  const hintId = description || error ? `${id}-help` : undefined;
  const countId = `${id}-count`;
  useEffect(() => setMatchIndex(-1), [query]);
  useLayoutEffect(() => {
    const node = textarea.current;
    if (node && previousExpanded.current !== expanded) {
      node.scrollTop = Math.min(
        scrollPosition.current.top,
        Math.max(0, node.scrollHeight - node.clientHeight),
      );
      node.scrollLeft = scrollPosition.current.left;
      scrollPosition.current = { top: node.scrollTop, left: node.scrollLeft };
    }
    previousExpanded.current = expanded;
  }, [expanded]);
  const moveMatch = (direction: number) => {
    if (!matches.length || !textarea.current) return;
    const next = nextTextMatchIndex(currentMatch, matches.length, direction);
    const match = matches[next];
    setMatchIndex(next);
    const node = textarea.current;
    node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    node.focus({ preventScroll: true });
    node.setSelectionRange(match.start, match.end);
    revealTextareaRange(node, match.start, match.end);
    scrollPosition.current = { top: node.scrollTop, left: node.scrollLeft };
  };
  return (
    <div className={cx("bt-long-editor", className)} data-expanded={expanded || undefined}>
      <div className="bt-long-editor-heading">
        <label htmlFor={id} className="bt-field-label">
          {label}
          {props.required && <span className="bt-required"> *</span>}
        </label>
        <div className="bt-actions">
          {toolbar}
          <Button
            size="sm"
            aria-pressed={expanded}
            aria-controls={id}
            onClick={() => {
              const node = textarea.current;
              if (node) scrollPosition.current = { top: node.scrollTop, left: node.scrollLeft };
              setLocalExpanded(!expanded);
              onExpandedChange?.(!expanded);
            }}
          >
            {expanded ? "收起编辑区" : "展开编辑区"}
          </Button>
        </div>
      </div>
      <div className="bt-long-editor-find">
        <Input
          ref={searchInput}
          type="search"
          aria-label={`在${label}中查找`}
          placeholder="查找文本"
          value={query}
          disabled={disabled || !enabled}
          onChange={(event) => {
            setLocalQuery(event.target.value);
            onQueryChange?.(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              moveMatch(event.shiftKey ? -1 : 1);
            }
          }}
        />
        {query && (
          <>
            <IconButton
              label={`清空${label}查找`}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setLocalQuery("");
                onQueryChange?.("");
                searchInput.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </IconButton>
            <span role="status" className="bt-document-match-count">
              {matches.length
                ? currentMatch < 0
                  ? `${matches.length} 个匹配`
                  : `${currentMatch + 1} / ${matches.length}`
                : "无匹配内容"}
            </span>
            <IconButton
              label={`在${label}中查找上一个`}
              size="sm"
              disabled={!matches.length || disabled}
              onClick={() => moveMatch(-1)}
            >
              <Icon name="chevronLeft" size={14} />
            </IconButton>
            <IconButton
              label={`在${label}中查找下一个`}
              size="sm"
              disabled={!matches.length || disabled}
              onClick={() => moveMatch(1)}
            >
              <Icon name="chevronRight" size={14} />
            </IconButton>
          </>
        )}
      </div>
      <textarea
        {...props}
        ref={textareaRef}
        id={id}
        className={cx("bt-textarea bt-long-editor-input", textareaClassName)}
        aria-label={ariaLabel || label}
        aria-describedby={[describedBy, hintId, countId].filter(Boolean).join(" ")}
        aria-invalid={Boolean(error) || props["aria-invalid"]}
        disabled={disabled || !enabled}
        value={value}
        maxLength={maxLength}
        onScroll={(event) => {
          scrollPosition.current = {
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
          };
          onScroll?.(event);
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="bt-long-editor-footer">
        {hintId && (
          <div id={hintId} className={error ? "bt-field-error" : "bt-field-description"}>
            {error || description}
          </div>
        )}
        <span
          id={countId}
          className="bt-long-editor-count"
          data-over-limit={(maxLength !== undefined && value.length > maxLength) || undefined}
        >
          {value.length.toLocaleString()}
          {maxLength !== undefined ? ` / ${maxLength.toLocaleString()}` : ""} 字符
        </span>
      </div>
    </div>
  );
});
