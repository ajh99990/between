import { StyleProvider } from '@ant-design/cssinjs';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import {
  Button,
  ConfigProvider,
  type ConfigProviderProps,
  Result,
  theme,
} from 'antd';
import type { ReactNode } from 'react';
import { ApiError, api, getState } from '@/services/admin';
import type { AdminState } from '@/services/types';
import defaultSettings from '../config/defaultSettings';
import { PrismHeader } from '@/components/PrismHeader';

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
export const layout: RunTimeLayoutConfig = ({ initialState }) => ({
  ...defaultSettings,
  headerRender: () => <PrismHeader />,
  onPageChange: () => {
    if (
      !initialState?.authenticated &&
      !initialState?.error &&
      history.location.pathname !== '/login'
    )
      history.replace('/login');
  },
  childrenRender: (children) => <SessionBoundary>{children}</SessionBoundary>,
});
export function rootContainer(container: ReactNode) {
  return (
    <StyleProvider layer>
      <ConfigProvider csp={{ nonce }}>{container}</ConfigProvider>
    </StyleProvider>
  );
}
