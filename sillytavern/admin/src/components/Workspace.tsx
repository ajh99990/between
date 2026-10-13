import { ReloadOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';
export function Workspace({
  title,
  children,
  extra,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  const { data, reload, busy, error, notice } = useModel('admin');
  return (
    <div
      className="workspace"
      data-testid={data ? 'workspace-ready' : 'workspace-loading'}
    >
      <section className="workspace-heading" aria-labelledby="page-title">
        <h1 id="page-title">{title}</h1>
        <div className="workspace-actions">
          {extra}
          <Button
            icon={<ReloadOutlined aria-hidden />}
            loading={busy}
            onClick={() => void reload().catch(() => {})}
          >
            刷新状态
          </Button>
        </div>
      </section>
      <div className="workspace-content">
        {error && (
          <Alert className="mb-4" type="error" title={error} showIcon />
        )}
        {notice && (
          <Alert className="mb-4" type="success" title={notice} showIcon />
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
