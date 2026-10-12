import { ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Alert, Button, Skeleton, Tag } from 'antd';
import type { ReactNode } from 'react';
export function Workspace({ title, description, children, extra }: { title: string; description: string; children: ReactNode; extra?: ReactNode }) {
  const { data, reload, busy, error, notice } = useModel('admin');
  return <PageContainer title={title} subTitle={data ? <Tag variant="filled">配置 v{data.config.version}</Tag> : undefined} content={<p className="m-0 max-w-3xl text-muted leading-7">{description}</p>} extra={[<Button key="refresh" icon={<ReloadOutlined />} loading={busy} onClick={() => void reload().catch(() => {})}>刷新状态</Button>, extra].filter(Boolean)}>
    {error && <Alert className="mb-5" type="error" title={error} showIcon />}
    {notice && <Alert className="mb-5" type="success" title={notice} showIcon />}
    {!data ? <div className="rounded-xl bg-white p-8"><Skeleton active paragraph={{ rows: 7 }} /></div> : children}
  </PageContainer>;
}
export function ScopeNote() { return <p className="m-0 text-sm leading-6 text-muted">角色、世界书与预设用于之后创建的新会话，已有会话保留创建时的设定。</p>; }
export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail: string }) { return <div className="rounded-xl border border-solid border-[#e3e9e4] bg-white p-5"><div className="text-sm text-muted">{label}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</div><div className="mt-2 text-xs text-muted">{detail}</div></div>; }
export function date(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }
