import { StyleProvider } from '@ant-design/cssinjs';
import { ExportOutlined, LogoutOutlined } from '@ant-design/icons';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, Link, useModel } from '@umijs/max';
import { App, Button, ConfigProvider, Result, Tag } from 'antd';
import type { ReactNode } from 'react';
import { ApiError, api, getState, logout } from '@/services/admin';
import type { AdminState } from '@/services/types';
import defaultSettings from '../config/defaultSettings';
const nonce = typeof document === 'undefined' ? '' : document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content || '';
export async function getInitialState(): Promise<{ data?: AdminState; authenticated?: boolean; initialized?: boolean; error?: string }> {
  try {
    const auth = await api<{ initialized: boolean }>('/auth');
    try { return { data: await getState(), authenticated: true, initialized: auth.initialized }; }
    catch (e) { if (e instanceof ApiError && e.status === 401) return { authenticated: false, initialized: auth.initialized }; throw e; }
  } catch (e) { return { error: e instanceof Error ? e.message : '读取失败' }; }
}
function SessionBoundary({ children }: { children: ReactNode }) {
  const { initialState, refresh, loading } = useModel('@@initialState');
  if (initialState?.error) return <Result status="warning" title="暂时无法读取控制台" subTitle={initialState.error} extra={<Button loading={loading} onClick={() => void refresh()}>重新连接</Button>} />;
  return children;
}
function AccountActions() {
  const { modal, message } = App.useApp();
  return <div className="flex items-center gap-3"><a href="/" target="_blank" rel="noreferrer" className="text-muted text-sm"><ExportOutlined /> 打开聊天</a><Button type="text" icon={<LogoutOutlined />} onClick={() => modal.confirm({ title: '退出管理控制台？', content: '已保存的配置会保留。', okText: '退出登录', cancelText: '取消', onOk: async () => { try { await logout(); window.location.assign('/admin#/login'); } catch (e) { message.error((e as Error).message); } } })}>退出</Button></div>;
}
export const layout: RunTimeLayoutConfig = ({ initialState }) => ({
  ...defaultSettings,
  menuItemRender: (item, dom) => item.path ? <Link to={item.path}>{dom}</Link> : dom,
  actionsRender: () => [<Tag key="mode" variant="filled" color="green">本机管理</Tag>, <AccountActions key="account" />],
  onPageChange: () => { if (!initialState?.authenticated && !initialState?.error && history.location.pathname !== '/login') history.replace('/login'); },
  menuFooterRender: collapsed => collapsed ? null : <div className="px-4 pb-5 text-xs leading-6 text-[#a9bdb6]"><div className="font-semibold text-[#e1ebe5]">让每一个角色，拥有自己的世界</div><div className="mt-2 opacity-65">BETWEEN / WORKSPACE</div></div>,
  childrenRender: children => <SessionBoundary>{children}</SessionBoundary>,
});
export function rootContainer(container: ReactNode) {
  return <StyleProvider layer><ConfigProvider csp={{ nonce }}>{container}</ConfigProvider></StyleProvider>;
}
