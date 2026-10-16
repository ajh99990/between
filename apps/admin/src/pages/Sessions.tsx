import {
  ClockCircleOutlined,
  DatabaseOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { type ProColumns, ProTable } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { App, Button, Empty, Input, Tag } from 'antd';
import { useState } from 'react';
import { date, Workspace } from '@/components/Workspace';
import { api } from '@/services/admin';
import type { Conversation, Task } from '@/services/types';

type SessionRow = Conversation & { userId: string };
export default function Sessions() {
  const { data, busy, mutate } = useModel('admin');
  const { modal } = App.useApp();
  const [query, setQuery] = useState('');
  const sessions: SessionRow[] =
    data?.users.flatMap((user) =>
      user.conversations.map((conversation) => ({
        ...conversation,
        userId: user.id,
      })),
    ) ?? [];
  const filteredSessions = sessions.filter((session) =>
    `${session.title} ${session.name} ${session.id} ${session.userId}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const stopTask = (task: Task) =>
    modal.confirm({
      title: '停止此生成任务？',
      content: '未完成的轮次不会保存。',
      okText: '停止任务',
      cancelText: '取消',
      onOk: () =>
        mutate(
          () => api('/stop', 'POST', { taskId: task.id }),
          '停止请求已发送。',
        ),
    });
  const columns: ProColumns<SessionRow>[] = [
    {
      title: '会话',
      dataIndex: 'title',
      render: (_, r) => (
        <div>
          <div className="font-medium">{r.title}</div>
          <div className="mt-1 break-all text-xs text-muted">{r.id}</div>
        </div>
      ),
    },
    { title: '角色', dataIndex: 'name', width: 120 },
    {
      title: '配置版本',
      dataIndex: 'configVersion',
      width: 120,
      render: (_, r) => <Tag>v{r.configVersion}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (_, r) => date(r.createdAt),
    },
    {
      title: '所属用户',
      dataIndex: 'userId',
      width: 220,
      render: (_, r) => (
        <span className="break-all text-xs text-muted">{r.userId}</span>
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 110,
      render: (_, r) => [
        <Button
          key="delete"
          type="link"
          danger
          disabled={busy}
          onClick={() =>
            modal.confirm({
              title: '永久删除此会话？',
              content: (
                <div className="break-all leading-7">
                  {r.title}
                  <br />
                  {r.id}
                  <br />
                  会停止它的任务并删除本机保存的数据，无法撤销；不删除外部服务数据。
                </div>
              ),
              okText: '删除会话',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () =>
                mutate(
                  () =>
                    api('/conversation', 'DELETE', {
                      userId: r.userId,
                      conversation: r.id,
                      confirm: true,
                    }),
                  '会话已删除。',
                ),
            })
          }
        >
          删除会话
        </Button>,
      ],
    },
  ];
  return (
    <Workspace
      title="会话与任务"
      description="查看已保存的会话与正在执行的任务，管理对话的运行状态。"
    >
      {data && (
        <div className="page-stack">
          <section
            className="glass-panel"
            aria-labelledby="running-tasks-title"
          >
            <div className="panel-header flex-wrap gap-4">
              <div>
                <h2 id="running-tasks-title" className="section-title">
                  <ThunderboltOutlined aria-hidden /> 运行任务
                </h2>
                <p className="muted mb-0 mt-2 text-sm">
                  按会话独立控制生成任务，运行状态以最近一次刷新为准。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Tag color={data.tasks.length ? 'processing' : 'default'}>
                  {data.tasks.length} 个任务运行中
                </Tag>
              </div>
            </div>
            {data.tasks.length ? (
              <ul className="ops-grid m-0 list-none p-0">
                {data.tasks.map((task) => {
                  const conversation = sessions.find(
                    (session) =>
                      session.id === task.conversation &&
                      session.userId === task.userId,
                  );
                  return (
                    <li
                      key={task.id}
                      className="glass-panel min-w-0"
                      style={{
                        borderColor: 'rgba(81, 183, 255, 0.3)',
                        background: 'rgba(24, 64, 102, 0.2)',
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Tag color="processing">生成中</Tag>
                        <span className="muted text-xs">
                          模式 · {task.mode}
                        </span>
                      </div>
                      <h3 className="mb-2 mt-5 break-all text-lg font-semibold">
                        {conversation?.title || task.conversation}
                      </h3>
                      <div className="muted break-all font-mono text-xs leading-6">
                        会话 {task.conversation}
                        <br />
                        用户 {task.userId}
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                        <span className="muted text-xs">
                          <ClockCircleOutlined aria-hidden /> 开始于{' '}
                          <time dateTime={task.startedAt}>
                            {date(task.startedAt)}
                          </time>
                        </span>
                        <Button
                          icon={<PauseCircleOutlined aria-hidden />}
                          disabled={busy}
                          onClick={() => stopTask(task)}
                        >
                          停止任务
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted my-3 text-sm">当前没有运行任务</p>
            )}
          </section>
          <section
            className="glass-panel data-panel"
            aria-labelledby="saved-sessions-title"
          >
            <div className="panel-header flex-wrap gap-4">
              <div>
                <h2 id="saved-sessions-title" className="section-title">
                  <DatabaseOutlined aria-hidden /> 已保存会话
                </h2>
                <p className="muted mb-0 mt-2 text-sm">
                  共 {sessions.length} 个会话 · 保留创建时的配置版本
                </p>
              </div>
              <Input.Search
                placeholder="搜索会话、角色或用户 ID"
                aria-label="搜索会话"
                allowClear
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 340, maxWidth: '100%' }}
              />
            </div>
            <ProTable<SessionRow>
              rowKey="id"
              columns={columns}
              dataSource={filteredSessions}
              search={false}
              options={false}
              toolBarRender={false}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={query ? '没有匹配的会话' : '还没有保存的会话'}
                  />
                ),
              }}
            />
          </section>
        </div>
      )}
    </Workspace>
  );
}
