import { ReloadOutlined } from '@ant-design/icons';
import { useLocation, useModel } from '@umijs/max';
import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';

const pageIdentity: Record<
  string,
  { code: string; title: ReactNode; accent: string }
> = {
  roles: {
    code: '01 / CHARACTER STUDIO',
    title: (
      <>
        每个角色，
        <br />
        <em>都是一个世界。</em>
      </>
    ),
    accent: 'violet',
  },
  books: {
    code: '02 / WORLD ARCHIVE',
    title: (
      <>
        把想象，
        <br />
        <em>写进世界的细节。</em>
      </>
    ),
    accent: 'cyan',
  },
  models: {
    code: '03 / INTELLIGENCE ENGINE',
    title: (
      <>
        连接智能，
        <br />
        <em>定义对话的深度。</em>
      </>
    ),
    accent: 'blue',
  },
  sessions: {
    code: '04 / LIVE OPERATIONS',
    title: (
      <>
        每一次对话，
        <br />
        <em>都在此刻发生。</em>
      </>
    ),
    accent: 'cyan',
  },
  users: {
    code: '05 / ACCESS CONTROL',
    title: (
      <>
        掌握全局，
        <br />
        <em>守护每一份连接。</em>
      </>
    ),
    accent: 'violet',
  },
  resources: {
    code: '06 / DISCOVERY & SYSTEM',
    title: (
      <>
        探索新世界，
        <br />
        <em>洞察系统脉搏。</em>
      </>
    ),
    accent: 'blue',
  },
};
export function Workspace({
  title,
  description,
  children,
  extra,
}: {
  title: string;
  description: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  const { data, reload, busy, error, notice } = useModel('admin');
  const [section, id] = useLocation().pathname.split('/').filter(Boolean);
  const identity = pageIdentity[section] || pageIdentity.roles;
  return (
    <div
      className={`workspace workspace-${identity.accent}`}
      data-testid={data ? 'workspace-ready' : 'workspace-loading'}
    >
      <section
        className={`workspace-hero ${id ? 'workspace-hero-compact' : ''}`}
        aria-labelledby="page-title"
      >
        <div className="hero-copy">
          <div className="panel-kicker">
            {identity.code}
            <span className="hero-line" />
          </div>
          <h1 id="page-title">{id ? title : identity.title}</h1>
          <p>{description}</p>
          <div className="hero-actions">
            {extra}
            <Button
              icon={<ReloadOutlined aria-hidden />}
              loading={busy}
              onClick={() => void reload().catch(() => {})}
            >
              刷新状态
            </Button>
            <span className="version-label">
              配置 v{data?.config.version ?? '—'}
            </span>
          </div>
        </div>
        {!id && (
          <div className="orbit-scene" aria-hidden>
            <div className="orbit-orb" />
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-satellite" />
            <div className="orb-label">
              BETWEEN
              <br />
              <strong>{title}</strong>
            </div>
          </div>
        )}
      </section>
      <div className="workspace-content">
        {error && (
          <Alert className="mb-5" type="error" title={error} showIcon />
        )}
        {notice && (
          <Alert className="mb-5" type="success" title={notice} showIcon />
        )}
        {!data ? (
          <div className="glass-panel" role="status">
            <Skeleton active paragraph={{ rows: 7 }} />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
export function ScopeNote() {
  return (
    <p className="m-0 text-sm leading-6 text-muted">
      角色、世界书与预设用于之后创建的新会话，已有会话保留创建时的设定。
    </p>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="orbit-metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
export function date(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
