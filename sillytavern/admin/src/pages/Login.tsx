import { LockOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/OrbitShell';
import { login } from '@/services/admin';
export default function Login() {
  const { initialState, setInitialState } = useModel('@@initialState');
  const [error, setError] = useState('');
  useEffect(() => {
    if (initialState?.authenticated) history.replace('/roles');
  }, [initialState?.authenticated]);
  return (
    <div className="login-shell">
      <main className="login-entry">
        <div className="orbit-brand">
          <Brand />
        </div>
        <LoginForm
          title="管理控制台"
          subTitle=""
          submitter={{
            searchConfig: { submitText: '登录控制台' },
            submitButtonProps: {
              disabled: initialState?.initialized === false,
            },
          }}
          onFinish={async ({ password }: { password: string }) => {
            setError('');
            try {
              const data = await login(password);
              await setInitialState((s) => ({
                ...s,
                data,
                authenticated: true,
                error: undefined,
              }));
              return true;
            } catch (e) {
              setError((e as Error).message);
              return false;
            }
          }}
        >
          {initialState?.initialized === false && (
            <Alert
              type="warning"
              title="管理员尚未初始化"
              description="请在本机启动服务时设置管理员口令。"
              className="mb-6"
            />
          )}
          {(error || initialState?.error) && (
            <Alert
              type="error"
              title={error || initialState?.error}
              showIcon
              className="mb-6"
            />
          )}
          <ProFormText.Password
            name="password"
            label="管理员口令"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined aria-hidden />,
              autoComplete: 'current-password',
            }}
            placeholder="输入启动服务时设置的口令"
            rules={[{ required: true, message: '请输入管理员口令' }]}
          />
        </LoginForm>
      </main>
    </div>
  );
}
