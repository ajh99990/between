import { request } from '@umijs/max';
import type { AdminState, Config } from './types';
let csrf = '';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  try {
    return await request<T>(`/api/admin${path}`, { method, data, headers: { 'X-CSRF-Token': csrf }, skipErrorHandler: true, timeout: 15000 });
  } catch (error) {
    const e = error as { response?: { status?: number; data?: { error?: string } } };
    const status = e.response?.status ?? 0;
    throw new ApiError(e.response?.data?.error ?? '无法连接服务，请检查连接后重试。', status);
  }
}
export async function getState() { const data = await api<AdminState>('/state'); csrf = data.csrf; return data; }
export async function login(password: string) { const result = await api<{ csrf: string }>('/login', 'POST', { password }); csrf = result.csrf; return getState(); }
export async function logout() { await api('/logout', 'POST', {}); csrf = ''; }
export function saveConfig(config: Config) { return api('/config', 'PUT', { config, expectedVersion: config.version, confirm: true }); }
