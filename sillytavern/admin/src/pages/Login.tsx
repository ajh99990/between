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
      <section className="login-story">
        <div className="orbit-brand">
          <Brand />
        </div>
        <div>
          <div className="panel-kicker">WHERE CHARACTERS COME ALIVE</div>
          <h1>
            所有相遇，
            <br />
            始于一个<em>完整的世界。</em>
          </h1>
          <p>
            为角色赋予个性，为故事构建记忆。
            <br />
            从这里，开启 Between 的下一段对话。
          </p>
        </div>
        <div className="panel-kicker">CHARACTER / WORLD / INTELLIGENCE</div>
        <div className="orbit-scene" aria-hidden>
          <div className="orbit-orb" />
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-satellite" />
        </div>
      </section>
      <main className="login-entry">
        <span className="login-eyebrow">ADMIN ACCESS / 管理员入口</span>
        <LoginForm
          title="欢迎回来"
          subTitle="登录 Between 管理控制台"
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
        <p>
          使用本机服务的现有口令登录。
          <br />
          此入口不登录模型账号，也不显示模型密钥。
        </p>
      </main>
    </div>
  );
}
