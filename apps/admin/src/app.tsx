import { useCallback, useEffect, useRef, useState } from "react";
import { type AdminState, ApiError, type Config, getState, login, logout, saveConfig } from "./api";
import { FeedbackToast, RouteContent } from "./motion";
import BooksPage from "./pages/Books";
import { DiagnosticsPage, ModelsPage, ResourcesPage, SessionsPage, UsersPage } from "./pages/Operations";
import RolesPage from "./pages/Roles";
import { type BackgroundController, designModule } from "./skill";
import { AdminProvider } from "./state";
import { Badge, Button, Dialog, Field, Glass, Icon, Select, UiInteractionProvider } from "./ui";

const navigation = [
  { route: "/roles", label: "角色卡", icon: "roles", group: "内容管理" },
  { route: "/books", label: "世界书", icon: "book", group: "内容管理" },
  { route: "/resources", label: "素材库", icon: "resources", group: "内容管理" },
  { route: "/models", label: "模型与提示词", icon: "models", group: "运行管理" },
  { route: "/sessions", label: "会话与任务", icon: "sessions", group: "运行管理" },
  { route: "/users", label: "用户与全局", icon: "users", group: "运行管理" },
  { route: "/diagnostics", label: "诊断与审计", icon: "diagnostics", group: "运行管理" },
] as const;
const routeFromHash = () => location.hash.slice(1) || "/roles";
const backgrounds = [
  { value: "terrace", label: "层光漫游" },
  { value: "ribbon", label: "蓝灰流带" },
  { value: "mist", label: "青灰雾光" },
  { value: "ember", label: "琥珀微晕" },
  { value: "curtain", label: "虹纱织幕" },
  { value: "orbit", label: "游弧微光" },
  { value: "caustic", label: "浮光涟域" },
  { value: "tide", label: "薄雾波面" },
];

function Login({
  onLogin,
  expired,
  error: outerError,
  onRetry,
}: {
  onLogin: (state: AdminState) => void;
  expired: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-stage">
      <Glass className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            b.
          </span>
          <span>
            Between <small>管理员控制台</small>
          </span>
        </div>
        <h1>{expired ? "重新验证管理员身份" : "登录管理后台"}</h1>
        <p className="muted">
          {expired
            ? "会话已过期。本页草稿仍在，重新登录后可继续处理。"
            : "使用本机服务配置的管理员口令登录。此入口与用户聊天会话隔离。"}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const state = await login(password);
              setPassword("");
              onLogin(state);
            } catch (e) {
              setError(e instanceof Error ? e.message : "登录未完成");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="管理员口令">
            <input
              className="text-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {(error || outerError) && (
            <div className="notice danger" role="alert">
              {error || outerError}
            </div>
          )}
          {outerError && <Button onClick={onRetry}>重试会话验证</Button>}
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!password}
            className="login-submit"
          >
            登录
          </Button>
        </form>
        <p className="login-footnote">
          <Icon name="lock" size={14} />
          口令不写入浏览器存储，也不进入页面诊断。
        </p>
      </Glass>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AdminState | null>(null),
    [initializing, setInitializing] = useState(true),
    [expired, setExpired] = useState(false),
    [initialError, setInitialError] = useState("");
  const [route, setRoute] = useState(routeFromHash),
    [dirty, setDirtyValue] = useState(false),
    [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false),
    [appearance, setAppearance] = useState(false),
    [preset, setPreset] = useState("terrace"),
    [motion, setMotion] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null),
    [refreshing, setRefreshing] = useState(false),
    [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const backgroundElement = useRef<HTMLDivElement>(null),
    background = useRef<BackgroundController | null>(null),
    root = useRef<HTMLDivElement>(null),
    stateRef = useRef(state),
    dirtyRef = useRef(dirty),
    routeRef = useRef(route),
    saving = useRef(false);
  stateRef.current = state;
  dirtyRef.current = dirty;
  routeRef.current = route;
  const setDirty = useCallback((value: boolean) => setDirtyValue(value), []);
  const notify = useCallback(
    (message: string, tone: "success" | "error" = "success") => setToast({ message, tone }),
    [],
  );
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getState();
      setState(fresh);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    void getState()
      .then((data) => {
        if (alive) {
          setState(data);
          setLastRefresh(new Date());
        }
      })
      .catch((error) => {
        if (alive && !(error instanceof ApiError && error.status === 401)) setInitialError(error.message);
      })
      .finally(() => {
        if (alive) setInitializing(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const expiredListener = () => {
      if (stateRef.current) setExpired(true);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const changed = () => {
      const next = routeFromHash();
      if (next === routeRef.current) return;
      if (dirtyRef.current) {
        history.replaceState(null, "", `#${routeRef.current}`);
        setPendingNavigation(() => () => {
          location.hash = next;
          setRoute(next);
          setSidebarOpen(false);
        });
      } else {
        setRoute(next);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("between-admin-expired", expiredListener);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("between-admin-expired", expiredListener);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let disposed = false;
    void designModule("background/background.js")
      .then(async (module) => {
        if (disposed || !backgroundElement.current) return;
        background.current = module.createAmbientBackground({
          element: backgroundElement.current,
          preset: "terrace",
          motion: false,
          intensity: 1,
        });
        if (new URL(location.href).searchParams.has("qa")) {
          const probeModule = await designModule("qa/probe.js");
          if (!disposed && root.current) {
            (window as unknown as Record<string, unknown>).uiEvidence = probeModule.createVisualProbe({
              root: root.current,
              background: background.current,
              backgroundHost: "#admin-background",
              roles: [
                {
                  name: "field-label",
                  selector: ".gw-admin-field-label",
                  expected: { fontSize: 14, lineHeight: 22 },
                },
              ],
              foregroundSelectors: ["#admin-foreground"],
            });
          }
        }
      })
      .catch(() => notify("背景资源未完成加载，当前使用静态底色。", "error"));
    return () => {
      disposed = true;
      background.current?.destroy();
      background.current = null;
      delete (window as unknown as Record<string, unknown>).uiEvidence;
    };
  }, [notify]);
  useEffect(() => background.current?.update({ preset, motion }), [preset, motion]);
  const navigate = useCallback((next: string) => {
    const action = () => {
      setDirtyValue(false);
      dirtyRef.current = false;
      location.hash = next;
      setRoute(next);
      setSidebarOpen(false);
    };
    if (dirtyRef.current) setPendingNavigation(() => action);
    else action();
  }, []);
  const save = useCallback(
    async (config: Config) => {
      if (saving.current) return false;
      saving.current = true;
      try {
        const result = await saveConfig(config);
        setState((previous) =>
          previous ? { ...previous, config: { ...config, version: result.version } } : previous,
        );
        try {
          await refresh();
          notify("配置已保存。角色、世界书和提示预设用于新会话。");
        } catch {
          notify("已写入服务器，但刷新未完成。请刷新核对，不要重复提交。", "error");
        }
        return true;
      } catch (error) {
        notify(
          error instanceof ApiError && error.status === 409
            ? "配置版本已更新，未覆盖服务器。请保留草稿并对比处理。"
            : error instanceof Error
              ? error.message
              : "保存失败，草稿仍在。",
          "error",
        );
        return false;
      } finally {
        saving.current = false;
      }
    },
    [refresh, notify],
  );
  const current = navigation.find((item) => route === item.route || route.startsWith(`${item.route}/`));
  const Page =
    current?.route === "/roles"
      ? RolesPage
      : current?.route === "/books"
        ? BooksPage
        : current?.route === "/models"
          ? ModelsPage
          : current?.route === "/sessions"
            ? SessionsPage
            : current?.route === "/users"
              ? UsersPage
              : current?.route === "/resources"
                ? ResourcesPage
                : current?.route === "/diagnostics"
                  ? DiagnosticsPage
                  : null;
  return (
    <div className="glass-workbench app-shell" data-glass-style="zoned" ref={root}>
      <div className="gw-atmosphere" id="admin-background" ref={backgroundElement} aria-hidden="true" />
      {state && (
        <UiInteractionProvider enabled={!expired}>
          <AdminProvider value={{ state, refresh, save, notify, navigate, setDirty }}>
            <div id="admin-foreground" className="app-foreground" hidden={expired}>
              {sidebarOpen && (
                <button
                  className="sidebar-scrim"
                  aria-label="关闭导航遮罩"
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              <Glass as="aside" className={`main-sidebar ${sidebarOpen ? "is-open" : ""}`}>
                <button
                  className="brand-link"
                  onClick={() => navigate("/roles")}
                  aria-label="Between 管理后台"
                >
                  <span className="brand-mark" aria-hidden="true">
                    b.
                  </span>
                  <span>
                    <strong>Between</strong>
                    <small>管理员工作台</small>
                  </span>
                </button>
                <button
                  className="sidebar-close icon-button"
                  aria-label="关闭导航"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon name="close" />
                </button>
                <nav aria-label="后台主导航">
                  {["内容管理", "运行管理"].map((group) => (
                    <div className="nav-group" key={group}>
                      <h2>{group}</h2>
                      {navigation
                        .filter((item) => item.group === group)
                        .map((item) => (
                          <button
                            className="nav-item"
                            aria-current={current?.route === item.route ? "page" : undefined}
                            key={item.route}
                            onClick={() => navigate(item.route)}
                          >
                            <Icon name={item.icon} />
                            <span>{item.label}</span>
                            {item.route === "/roles" && <small>{state.config.roles.length}</small>}
                            {item.route === "/books" && <small>{state.config.books.length}</small>}
                          </button>
                        ))}
                    </div>
                  ))}
                </nav>
                <footer className="sidebar-footer">
                  <span className="admin-avatar" aria-hidden="true">
                    <Icon name="lock" size={16} />
                  </span>
                  <div>
                    <strong>管理员</strong>
                    <small>独立会话 · 本机服务</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="退出管理员登录"
                    onClick={() => {
                      const action = async () => {
                        try {
                          await logout();
                          setState(null);
                          setExpired(false);
                          setDirtyValue(false);
                        } catch (error) {
                          notify(error instanceof Error ? error.message : "退出未完成", "error");
                        }
                      };
                      if (dirty) setPendingNavigation(() => () => void action());
                      else void action();
                    }}
                  >
                    <Icon name="logout" size={17} />
                  </button>
                </footer>
              </Glass>
              <div className="main-workspace">
                <header className="topbar">
                  <div className="breadcrumb">
                    <button
                      className="icon-button mobile-menu"
                      aria-label={sidebarOpen ? "关闭导航" : "打开导航"}
                      aria-expanded={sidebarOpen}
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                      <Icon name="menu" />
                    </button>
                    <span>管理工作台</span>
                    <span aria-hidden="true">/</span>
                    <strong>{current?.label || "页面不存在"}</strong>
                  </div>
                  <div className="topbar-actions">
                    {state.model.mode === "demo" && <Badge>合成演示</Badge>}
                    <span className="sync-status">
                      <i />
                      配置 v{state.config.version}
                      {lastRefresh && (
                        <small>
                          {" "}
                          · {lastRefresh.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </small>
                      )}
                    </span>
                    <button
                      className="icon-button topbar-refresh"
                      aria-label="刷新后台数据"
                      aria-busy={refreshing}
                      disabled={refreshing}
                      onClick={() =>
                        void refresh()
                          .then(() => notify("后台数据已刷新。"))
                          .catch((error) => notify(error.message, "error"))
                      }
                    >
                      <Icon name="refresh" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="工作台外观"
                      onClick={() => setAppearance(true)}
                    >
                      <Icon name="appearance" />
                    </button>
                  </div>
                </header>
                <RouteContent key={current?.route + route.split("/").slice(2).join("/")}>
                  {Page ? (
                    <Page />
                  ) : (
                    <div className="empty-state">
                      <h1>页面不存在</h1>
                      <Button onClick={() => navigate("/roles")}>返回角色卡</Button>
                    </div>
                  )}
                </RouteContent>
              </div>
            </div>
            <Dialog
              open={Boolean(pendingNavigation) && !expired}
              title="离开前处理未保存的修改"
              onClose={() => setPendingNavigation(null)}
              footer={
                <>
                  <Button onClick={() => setPendingNavigation(null)}>继续编辑</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const action = pendingNavigation;
                      setDirtyValue(false);
                      dirtyRef.current = false;
                      setPendingNavigation(null);
                      action?.();
                    }}
                  >
                    放弃修改并继续
                  </Button>
                </>
              }
            >
              <p>本页修改尚未保存到服务器。离开将放弃当前草稿。</p>
            </Dialog>
            <Dialog
              open={appearance && !expired}
              title="工作台外观"
              onClose={() => setAppearance(false)}
              footer={
                <Button variant="primary" onClick={() => setAppearance(false)}>
                  完成
                </Button>
              }
            >
              <div className="page-stack">
                <p className="muted">仅调整当前页面的背景，不改变内容、玻璃配方或业务配置。</p>
                <Field label="背景">
                  <Select label="背景" value={preset} options={backgrounds} onChange={setPreset} />
                </Field>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={motion}
                    onChange={(event) => setMotion(event.target.checked)}
                  />
                  <span>正常速度动态背景</span>
                </label>
                <p className="field-description">默认静止以方便长文本阅读。开启后尊重系统减少动态设置。</p>
              </div>
            </Dialog>
          </AdminProvider>
        </UiInteractionProvider>
      )}
      {initializing ? (
        <div className="login-stage" role="status">
          <span className="spinner" />
          正在验证管理员会话…
        </div>
      ) : (
        (!state || expired) && (
          <Login
            expired={expired}
            error={initialError}
            onRetry={() => {
              setInitializing(true);
              setInitialError("");
              void getState()
                .then((fresh) => {
                  setState(fresh);
                  setExpired(false);
                  setLastRefresh(new Date());
                })
                .catch((error) => {
                  if (!(error instanceof ApiError && error.status === 401)) {
                    setInitialError(error instanceof Error ? error.message : "会话验证未完成，请重试。");
                  }
                })
                .finally(() => setInitializing(false));
            }}
            onLogin={(fresh) => {
              setState(fresh);
              setExpired(false);
              setLastRefresh(new Date());
              setInitialError("");
            }}
          />
        )
      )}
      {!expired && state && <FeedbackToast feedback={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
