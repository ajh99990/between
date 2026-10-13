import {
  AppstoreOutlined,
  BookOutlined,
  ControlOutlined,
  MenuOutlined,
  MessageOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useLocation } from '@umijs/max';
import { Button, Drawer } from 'antd';
import { type ReactNode, useState } from 'react';

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
      <span>between</span>
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
  const [open, setOpen] = useState(false);
  const navigation = (
    <nav className="orbit-nav" aria-label="管理导航">
      {destinations.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setOpen(false)}
          aria-current={
            location.pathname.startsWith(item.path) ? 'page' : undefined
          }
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
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
      <aside className="admin-sidebar">
        <Link to="/roles" className="orbit-brand" aria-label="Between 角色库">
          <Brand />
        </Link>
        {navigation}
      </aside>
      <header className="admin-topbar">
        <div className="topbar-location">
          <Button
            className="mobile-menu"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开管理导航"
            onClick={() => setOpen(true)}
          />
          <span>管理控制台</span>
          <span className="topbar-divider">/</span>
          <span>
            {destinations.find((item) =>
              location.pathname.startsWith(item.path),
            )?.label || 'Between'}
          </span>
        </div>
        <div className="orbit-account">{actions}</div>
      </header>
      <Drawer
        title="Between 管理导航"
        placement="left"
        size={260}
        open={open}
        onClose={() => setOpen(false)}
      >
        {open && navigation}
      </Drawer>
      <main id="workspace-main" tabIndex={-1} className="orbit-main">
        {children}
      </main>
    </div>
  );
}
