import { StyleProvider } from '@ant-design/cssinjs';
import { ExportOutlined, LogoutOutlined } from '@ant-design/icons';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import {
  App,
  Button,
  ConfigProvider,
  type ConfigProviderProps,
  Result,
  theme,
} from 'antd';
import type { ReactNode } from 'react';
import OrbitShell from '@/components/OrbitShell';
import { ApiError, api, getState, logout } from '@/services/admin';
import type { AdminState } from '@/services/types';
import defaultSettings from '../config/defaultSettings';

const nonce =
  typeof document === 'undefined'
    ? ''
    : document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')
        ?.content || '';
export const antd = (config: ConfigProviderProps) => ({
  ...config,
  csp: { nonce },
  theme: {
    ...config.theme,
    algorithm: theme.darkAlgorithm,
    token: {
      ...config.theme?.token,
      motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
  },
});
export async function getInitialState(): Promise<{
  data?: AdminState;
  authenticated?: boolean;
  initialized?: boolean;
  error?: string;
}> {
  try {
    const auth = await api<{ initialized: boolean }>('/auth');
    try {
      return {
        data: await getState(),
        authenticated: true,
        initialized: auth.initialized,
      };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        return { authenticated: false, initialized: auth.initialized };
      throw e;
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '读取失败' };
  }
}
function SessionBoundary({ children }: { children: ReactNode }) {
  const { initialState, refresh, loading } = useModel('@@initialState');
  if (initialState?.error)
    return (
      <Result
        status="warning"
        title="暂时无法读取控制台"
        subTitle={initialState.error}
        extra={
          <Button loading={loading} onClick={() => void refresh()}>
            重新连接
          </Button>
        }
      />
    );
  return children;
}
function AccountActions() {
  const { modal, message } = App.useApp();
  return (
    <div className="flex items-center gap-3">
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="text-muted text-sm"
      >
        <ExportOutlined aria-hidden /> 打开聊天
      </a>
      <Button
        type="text"
        icon={<LogoutOutlined aria-hidden />}
        onClick={() =>
          modal.confirm({
            title: '退出管理控制台？',
            content: '已保存的配置会保留。',
            okText: '退出登录',
            cancelText: '取消',
            onOk: async () => {
              try {
                await logout();
                window.location.reload();
              } catch (e) {
                message.error((e as Error).message);
              }
            },
          })
        }
      >
        退出
      </Button>
    </div>
  );
}
export const layout: RunTimeLayoutConfig = ({ initialState }) => ({
  ...defaultSettings,
  headerRender: false,
  menuRender: false,
  footerRender: false,
  contentStyle: { padding: 0, minHeight: '100vh' },
  onPageChange: () => {
    if (
      !initialState?.authenticated &&
      !initialState?.error &&
      history.location.pathname !== '/login'
    )
      history.replace('/login');
  },
  childrenRender: (children) => (
    <OrbitShell actions={<AccountActions />}>
      <SessionBoundary>{children}</SessionBoundary>
    </OrbitShell>
  ),
});
export function rootContainer(container: ReactNode) {
  return (
    <StyleProvider layer>
      <ConfigProvider csp={{ nonce }}>{container}</ConfigProvider>
    </StyleProvider>
  );
}
