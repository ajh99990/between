import type { AdminState, Config } from "./types";

export type * from "./types";

let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(path: string, method = "GET", data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError("服务暂时无法连接，请保留草稿后重试。", 0);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("between-admin-expired"));
    throw new ApiError(result.error || "操作未完成，请重试。", response.status);
  }
  return result as T;
}
export async function getState() {
  const result = await api<AdminState>("/state");
  csrf = result.csrf;
  return result;
}
export async function login(password: string) {
  const result = await api<{ csrf: string }>("/login", "POST", { password });
  csrf = result.csrf;
  return getState();
}
export async function logout() {
  await api("/logout", "POST", {});
  csrf = "";
}
export function saveConfig(config: Config) {
  return api<{ version: number }>("/config", "PUT", {
    config,
    expectedVersion: config.version,
    confirm: true,
  });
}
