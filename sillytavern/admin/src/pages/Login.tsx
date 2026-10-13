import { LockOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Alert } from 'antd';
import { Orbit } from '@/components/Workspace';
import { useEffect, useState } from 'react';
import { login } from '@/services/admin';
export default function Login() {
  const { initialState, setInitialState } = useModel('@@initialState');
  const [error, setError] = useState('');
  useEffect(() => {
    if (initialState?.authenticated) history.replace('/roles');
  }, [initialState?.authenticated]);
  return (
    <div className="login-stage"><div className="brand"><img width="38" height="38" src="/admin/logo.svg" alt=""/><span>between<span className="brand-caption">CHARACTER STUDIO</span></span></div><section className="login-world"><div className="eyebrow">WHERE CHARACTERS COME ALIVE</div><h1>构建你的角色，<br/><span>连接无限的可能。</span></h1><p>一处工作室，承载每个角色的个性与世界。</p><Orbit/></section><main className="login-form-panel glass-panel"><div className="eyebrow">PRIVATE WORKSPACE / 管理员入口</div>
          <LoginForm
            title="欢迎回来"
            subTitle="登录 Between 管理控制台"
            logo="/admin/logo.svg"
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
          <p className="login-security">使用本机服务的现有口令登录。<br/>此入口不登录模型账号，也不显示模型密钥。</p></main></div>
  );
}
