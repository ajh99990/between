import {
  AppstoreOutlined,
  BookOutlined,
  ControlOutlined,
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useLocation } from '@umijs/max';
import type { ReactNode } from 'react';

const destinations = [
  { path: '/roles', label: '角色库', icon: <TeamOutlined aria-hidden /> },
  { path: '/books', label: '世界书', icon: <BookOutlined aria-hidden /> },
  {
    path: '/models',
    label: '模型与提示词',
    icon: <ControlOutlined aria-hidden />,
  },
  {
    path: '/sessions',
    label: '会话与任务',
    icon: <MessageOutlined aria-hidden />,
  },
  { path: '/users', label: '用户与全局', icon: <UserOutlined aria-hidden /> },
  {
    path: '/resources',
    label: '素材与诊断',
    icon: <AppstoreOutlined aria-hidden />,
  },
];
export function Brand() {
  return (
    <>
      <span className="brand-mark" aria-hidden>
        <i />
        <i />
      </span>
      <span>
        between<span className="brand-caption">ORBIT CONSOLE</span>
      </span>
    </>
  );
}
export default function OrbitShell({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  const location = useLocation();
  return (
    <div className="orbit-shell">
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('workspace-main')?.focus();
          document.getElementById('workspace-main')?.scrollIntoView();
        }}
      >
        跳到主要内容
      </a>
      <header className="orbit-header">
        <div className="orbit-topbar">
          <Link to="/roles" className="orbit-brand" aria-label="Between 角色库">
            <Brand />
          </Link>
          <div className="orbit-account">
            <span className="local-indicator">
              <i /> 本机工作空间
            </span>
            {actions}
          </div>
        </div>
        <nav className="orbit-nav" aria-label="管理导航">
          {destinations.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={
                location.pathname.startsWith(item.path) ? 'page' : undefined
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main id="workspace-main" tabIndex={-1} className="orbit-main">
        {children}
      </main>
      <footer className="orbit-footer">
        <span>BETWEEN / 让设定生长，让对话发生。</span>
        <span>角色 · 世界 · 连接</span>
      </footer>
    </div>
  );
}
