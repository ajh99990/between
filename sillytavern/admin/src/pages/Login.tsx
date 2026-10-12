import { LockOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { Alert, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { login } from '@/services/admin';
export default function Login() {
  const { initialState, setInitialState } = useModel('@@initialState');
  const [error, setError] = useState('');
  useEffect(() => {
    if (initialState?.authenticated) history.replace('/roles');
  }, [initialState?.authenticated]);
  return (
    <div className="grid min-h-screen bg-[#f3f5f3] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#142a27] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <img width="40" height="40" src="/admin/logo.svg" alt="" />
          between
        </div>
        <div className="max-w-lg">
          <div className="mb-6 text-xs tracking-[0.3em] text-[#b7ccb9]">
            CREATIVE WORKSPACE
          </div>
          <h1 className="m-0 text-5xl font-medium leading-[1.4]">
            好的对话，
            <br />
            始于完整的世界。
          </h1>
          <p className="mt-7 text-lg leading-8 text-[#b8c9c0]">
            阅读角色的每一面，编织世界的每个细节。
            <br />
            在这里，为下一次相遇做好准备。
          </p>
        </div>
        <div className="text-sm text-[#93afa2]">角色 · 世界书 · 对话</div>
      </section>
      <main className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-md">
          <Tag color="green" variant="filled">
            本机管理员入口
          </Tag>
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
          <p className="px-8 text-center text-xs leading-6 text-muted">
            使用本机服务的现有口令登录。
            <br />
            此入口不登录模型账号，也不显示模型密钥。
          </p>
        </div>
      </main>
    </div>
  );
}
