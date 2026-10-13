import {
  AuditOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { type ProColumns, ProTable } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import { App, Button, Card, Descriptions, Empty, Tabs, Tag } from 'antd';
import { date, Workspace } from '@/components/Workspace';
import { api } from '@/services/admin';
import type { Audit, CommunityItem } from '@/services/types';

const diagnosticLabels: Record<string, string> = {
  langfuse: '追踪系统',
  audit: '操作记录范围',
  storage: '存储方式',
  plan: '套餐授权范围',
  modelVerified: '真实模型验证',
  version: '服务版本',
};
const actions: Record<string, string> = {
  'config.update': '保存配置',
  'community.import': '导入社区资源',
  'model.update': '更新模型连接',
  'plan.backend.update': '更新套餐设置',
  'user.disable': '停用用户',
  'user.enable': '恢复用户',
  'conversation.delete': '删除会话',
  'task.stop': '停止任务',
  'turn.complete': '对话完成',
  'turn.cancel': '对话取消',
  'turn.fail': '对话失败',
};
const serviceDiagnosticKeys = new Set(['storage', 'modelVerified', 'version']);
export default function Resources() {
  const { data, busy, mutate } = useModel('admin');
  const { modal } = App.useApp();
  const importItem = (item: CommunityItem) => {
    if (!data) return;
    const expectedVersion = data.config.version;
    return modal.confirm({
      title: `导入「${item.name}」？`,
      content: `包含角色卡和 ${item.entryCount} 条世界书。保留原始内容、冲突与 Foreverse Team / CC BY 4.0 归因。导入后对新会话生效。`,
      okText: '导入资源',
      cancelText: '取消',
      onOk: () =>
        mutate(
          () =>
            api('/community/import', 'POST', {
              id: item.id,
              confirm: true,
              expectedVersion,
            }),
          '社区角色及世界书已导入。',
        ),
    });
  };
  const columns: ProColumns<Audit>[] = [
    {
      title: '时间',
      dataIndex: 'at',
      width: 190,
      render: (_, r) => date(r.at),
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 180,
      render: (_, r) => actions[r.action] || r.action,
    },
    { title: '操作者', dataIndex: 'actor', width: 160, ellipsis: true },
    { title: '对象', dataIndex: 'target', ellipsis: true },
    {
      title: '结果',
      dataIndex: 'result',
      width: 90,
      render: (_, r) => (
        <Tag color={r.result === 'ok' ? 'green' : 'red'}>
          {r.result === 'ok' ? '成功' : '失败'}
        </Tag>
      ),
    },
  ];
  const diagnosticItems = (service: boolean) =>
    Object.entries(data?.diagnostics ?? {})
      .filter(([key]) => serviceDiagnosticKeys.has(key) === service)
      .map(([key, value]) => ({
        key,
        label: diagnosticLabels[key] || key,
        children:
          typeof value === 'boolean' ? (
            <Tag color={value ? 'cyan' : 'default'}>
              {value ? '已验证' : '未验证'}
            </Tag>
          ) : (
            value
          ),
      }));
  return (
    <Workspace
      title="素材与诊断"
      description="浏览已核验的社区素材，了解运行状态和最近的管理操作。"
    >
      {data && (
        <Tabs
          defaultActiveKey="community"
          items={[
            {
              key: 'community',
              label: '社区素材',
              children: (
                <div className="page-stack">
                  <section
                    className="glass-panel"
                    aria-labelledby="community-library-title"
                  >
                    <div className="panel-header flex-wrap gap-4">
                      <div>
                        <div className="panel-kicker">CURATED LIBRARY</div>
                        <h2
                          id="community-library-title"
                          className="section-title"
                        >
                          精选社区素材
                        </h2>
                      </div>
                      <Tag
                        icon={<SafetyCertificateOutlined aria-hidden />}
                        color="cyan"
                      >
                        {data.community.items.length} 份内置资源
                      </Tag>
                    </div>
                    <p className="muted mb-3 mt-0 text-sm leading-7">
                      {data.community.verification}
                    </p>
                    <p className="muted m-0 text-sm leading-7">
                      {data.community.license}
                    </p>
                  </section>
                  <div className="ops-grid">
                    {data.community.items.map((item) => {
                      const imported = data.config.roles.some(
                        (r) => r.id === `community-${item.id}`,
                      );
                      return (
                        <Card
                          key={item.id}
                          data-testid={`community-${item.id}`}
                          className="glass-panel min-w-0 h-full"
                          styles={{ body: { padding: 0, height: '100%' } }}
                        >
                          <div className="flex h-full flex-col">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <BookOutlined
                                  aria-hidden
                                  className="text-2xl text-[#78bdff]"
                                />
                                <div>
                                  <div className="panel-kicker">
                                    COMMUNITY CARD
                                  </div>
                                  <h3 className="m-0 break-all text-xl font-semibold">
                                    {item.name}
                                  </h3>
                                </div>
                              </div>
                              <Tag
                                color={imported ? 'cyan' : 'default'}
                                icon={
                                  imported ? (
                                    <CheckCircleOutlined aria-hidden />
                                  ) : undefined
                                }
                              >
                                {imported ? '已导入' : '待导入'}
                              </Tag>
                            </div>
                            <p className="mb-3 mt-5 text-sm leading-7 text-[#b9d9ff]">
                              {item.scenarios}
                            </p>
                            <div className="mb-5 flex flex-wrap gap-2">
                              <Tag>{item.entryCount} 条世界书</Tag>
                              {item.language && <Tag>{item.language}</Tag>}
                            </div>
                            <dl className="m-0 flex-1 text-sm leading-7">
                              <dt className="mb-1 font-medium">内容质量</dt>
                              <dd className="muted mb-4 ml-0 break-words">
                                {item.quality}
                              </dd>
                              <dt className="mb-1 font-medium">封装说明</dt>
                              <dd className="muted m-0 break-words">
                                {item.packaging}
                              </dd>
                            </dl>
                            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-white/10 pt-5">
                              <a
                                href={item.sourceURL}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-sm"
                              >
                                查看原始来源 <ExportOutlined aria-hidden />
                              </a>
                              {imported ? (
                                <Button
                                  onClick={() =>
                                    history.push(`/roles/community-${item.id}`)
                                  }
                                >
                                  阅读角色
                                </Button>
                              ) : (
                                <Button
                                  type="primary"
                                  disabled={
                                    busy || data.config.roles.length >= 20
                                  }
                                  loading={busy}
                                  onClick={() => importItem(item)}
                                >
                                  导入角色与世界书
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                  {data.community.items.length === 0 && (
                    <div className="glass-panel">
                      <Empty description="暂无内置社区素材" />
                    </div>
                  )}
                  <div className="glass-panel">
                    <div className="panel-kicker">SOURCE & EVIDENCE</div>
                    <p className="muted mb-2 mt-0 text-sm leading-7">
                      {data.community.heatEvidence} · 记录日期{' '}
                      {data.community.evidenceDate}
                    </p>
                    <p className="muted m-0 text-sm leading-7">
                      只导入已校验的内置资源，不接受远程地址或任意文件。静态内容质量不等于真实模型表现。
                    </p>
                    {data.config.roles.length >= 20 && (
                      <p className="mb-0 mt-3 text-sm text-[#ffd594]">
                        当前角色已达到 20 个上限，导入前请先整理现有角色。
                      </p>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'diagnostics',
              label: '运行诊断',
              children: (
                <div className="page-stack">
                  <div className="ops-grid">
                    <section
                      className="glass-panel"
                      aria-labelledby="service-status-title"
                    >
                      <div className="panel-header">
                        <div>
                          <div className="panel-kicker">SERVICE STATUS</div>
                          <h2
                            id="service-status-title"
                            className="section-title"
                          >
                            <CloudServerOutlined aria-hidden /> 服务状态
                          </h2>
                        </div>
                      </div>
                      <Descriptions column={1} items={diagnosticItems(true)} />
                    </section>
                    <section
                      className="glass-panel"
                      aria-labelledby="diagnostic-scope-title"
                    >
                      <div className="panel-header">
                        <div>
                          <div className="panel-kicker">DIAGNOSTIC SCOPE</div>
                          <h2
                            id="diagnostic-scope-title"
                            className="section-title"
                          >
                            <SafetyCertificateOutlined aria-hidden /> 诊断范围
                          </h2>
                        </div>
                      </div>
                      <Descriptions column={1} items={diagnosticItems(false)} />
                    </section>
                  </div>
                  <div className="status-strip">
                    <InfoCircleOutlined aria-hidden />
                    <span className="min-w-0 flex-1 text-sm leading-7">
                      世界书最终纳入条目诊断尚未接入，关键词命中不等于最终纳入。
                    </span>
                  </div>
                  <section
                    className="glass-panel data-panel"
                    aria-labelledby="audit-log-title"
                  >
                    <div className="panel-header flex-wrap gap-4">
                      <div>
                        <div className="panel-kicker">ACTIVITY LOG</div>
                        <h2 id="audit-log-title" className="section-title">
                          <AuditOutlined aria-hidden /> 最近操作记录
                        </h2>
                      </div>
                      <Tag>{data.audit.length} 条记录</Tag>
                    </div>
                    <ProTable<Audit>
                      rowKey="sequence"
                      columns={columns}
                      dataSource={[...data.audit].reverse()}
                      search={false}
                      options={false}
                      toolBarRender={false}
                      pagination={{ pageSize: 10, hideOnSinglePage: true }}
                      scroll={{ x: 800 }}
                      locale={{
                        emptyText: <Empty description="暂无操作记录" />,
                      }}
                    />
                  </section>
                </div>
              ),
            },
          ]}
        />
      )}
    </Workspace>
  );
}
