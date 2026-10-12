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
export default function Resources() {
  const { data, busy, mutate } = useModel('admin');
  const { modal } = App.useApp();
  const importItem = (item: CommunityItem) =>
    modal.confirm({
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
              expectedVersion: data!.config.version,
            }),
          '社区角色及世界书已导入。',
        ),
    });
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
                <>
                  <div className="mb-5 rounded-xl bg-forest-50 p-5 text-sm leading-7 text-muted">
                    {data.community.verification}
                    <br />
                    {data.community.license}
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    {data.community.items.map((item) => {
                      const imported = data.config.roles.some(
                        (r) => r.id === `community-${item.id}`,
                      );
                      return (
                        <Card
                          key={item.id}
                          title={item.name}
                          extra={
                            <Tag color={imported ? 'green' : 'default'}>
                              {imported
                                ? '已导入'
                                : `${item.entryCount} 条世界书`}
                            </Tag>
                          }
                        >
                          <div className="mb-4 text-sm font-medium text-forest-600">
                            {item.scenarios}
                          </div>
                          <p className="text-sm leading-7 text-muted">
                            {item.quality}
                          </p>
                          <p className="text-sm leading-7 text-muted">
                            {item.packaging}
                          </p>
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                            <a
                              href={item.sourceURL}
                              target="_blank"
                              rel="noreferrer"
                            >
                              查看原始来源 ↗
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
                        </Card>
                      );
                    })}
                  </div>
                  <p className="mt-5 text-xs leading-6 text-muted">
                    {data.community.heatEvidence} · 记录日期{' '}
                    {data.community.evidenceDate}
                    <br />
                    只导入已校验的内置资源，不接受远程地址或任意文件。静态内容质量不等于真实模型表现。
                  </p>
                </>
              ),
            },
            {
              key: 'diagnostics',
              label: '运行诊断',
              children: (
                <div className="space-y-6">
                  <Card title="服务状态">
                    <Descriptions
                      column={1}
                      items={Object.entries(data.diagnostics).map(
                        ([key, value]) => ({
                          key,
                          label: diagnosticLabels[key] || key,
                          children:
                            typeof value === 'boolean'
                              ? value
                                ? '已验证'
                                : '未验证'
                              : value,
                        }),
                      )}
                    />
                    <p className="text-sm leading-7 text-muted">
                      世界书最终纳入条目诊断尚未接入，关键词命中不等于最终纳入。
                    </p>
                  </Card>
                  <ProTable<Audit>
                    rowKey="sequence"
                    headerTitle="最近操作记录"
                    columns={columns}
                    dataSource={[...data.audit].reverse()}
                    search={false}
                    options={false}
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    scroll={{ x: 800 }}
                    locale={{ emptyText: <Empty description="暂无操作记录" /> }}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
    </Workspace>
  );
}
