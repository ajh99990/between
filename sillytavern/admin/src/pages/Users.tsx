import {
  ApiOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { type ProColumns, ProTable } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { App, Button, Empty, Switch, Tag } from 'antd';
import { date, Workspace } from '@/components/Workspace';
import { api, saveConfig } from '@/services/admin';
import type { User } from '@/services/types';
export default function Users() {
  const { data, busy, mutate } = useModel('admin');
  const { modal } = App.useApp();
  const global = (key: 'acceptNew' | 'paused', value: boolean) => {
    if (!data) return;
    const config = data.config;
    return modal.confirm({
      title:
        key === 'acceptNew'
          ? value
            ? '允许新用户进入？'
            : '暂停新用户进入？'
          : value
            ? '暂停新生成请求？'
            : '恢复新生成请求？',
      content:
        key === 'acceptNew'
          ? '立即生效，已有浏览器用户不受影响。'
          : '立即生效。已运行的任务需到会话与任务页单独停止。',
      okText: '确认更改',
      cancelText: '取消',
      onOk: () =>
        mutate(
          () => saveConfig({ ...config, [key]: value }),
          '全局开关已更新。',
        ),
    });
  };
  const columns: ProColumns<User>[] = [
    {
      title: '用户 ID',
      dataIndex: 'id',
      render: (_, u) => <span className="break-all text-sm">{u.id}</span>,
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      width: 110,
      render: (_, u) => (
        <Tag color={u.disabled ? 'default' : 'green'}>
          {u.disabled ? '已停用' : '正常'}
        </Tag>
      ),
    },
    { title: '会话', width: 90, render: (_, u) => u.conversations.length },
    {
      title: '首次进入',
      dataIndex: 'createdAt',
      width: 200,
      render: (_, u) => date(u.createdAt),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 110,
      render: (_, u) => [
        <Button
          key="toggle"
          type="link"
          danger={!u.disabled}
          disabled={busy}
          onClick={() =>
            modal.confirm({
              title: u.disabled ? '恢复此用户？' : '停用此用户？',
              content: u.disabled
                ? '恢复该浏览器用户的访问。'
                : '停止该用户当前生成并拒绝后续访问，已保存会话仍保留。',
              okText: u.disabled ? '恢复用户' : '停用用户',
              cancelText: '取消',
              okButtonProps: { danger: !u.disabled },
              onOk: () =>
                mutate(
                  () =>
                    api('/user', 'PUT', {
                      userId: u.id,
                      disabled: !u.disabled,
                      confirm: true,
                    }),
                  '用户状态已更新。',
                ),
            })
          }
        >
          {u.disabled ? '恢复' : '停用'}
        </Button>,
      ],
    },
  ];
  return (
    <Workspace
      title="用户与全局"
      description="控制新用户访问和生成状态，管理本机匿名浏览器身份。"
    >
      {data && (
        <div className="page-stack">
          <div className="ops-grid">
            <section
              className="glass-panel"
              aria-labelledby="access-control-title"
            >
              <div className="panel-header flex-wrap gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ApiOutlined
                    aria-hidden
                    className="text-2xl text-[#78bdff]"
                  />
                  <div>
                    <div className="panel-kicker">ACCESS CONTROL</div>
                    <h2 id="access-control-title" className="section-title">
                      允许新用户进入
                    </h2>
                  </div>
                </div>
                <Switch
                  aria-label="允许新用户进入"
                  checked={data.config.acceptNew}
                  loading={busy}
                  checkedChildren="允许"
                  unCheckedChildren="关闭"
                  onChange={(v) => global('acceptNew', v)}
                />
              </div>
              <div className="mb-4">
                <Tag color={data.config.acceptNew ? 'cyan' : 'default'}>
                  {data.config.acceptNew
                    ? '新用户接入开放'
                    : '新用户接入已关闭'}
                </Tag>
              </div>
              <p className="muted m-0 text-sm leading-7">
                新浏览器可以创建身份。关闭后，已有用户仍可访问。
              </p>
            </section>
            <section
              className="glass-panel"
              aria-labelledby="generation-control-title"
            >
              <div className="panel-header flex-wrap gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ThunderboltOutlined
                    aria-hidden
                    className="text-2xl text-[#78bdff]"
                  />
                  <div>
                    <div className="panel-kicker">GENERATION CONTROL</div>
                    <h2 id="generation-control-title" className="section-title">
                      暂停新生成请求
                    </h2>
                  </div>
                </div>
                <Switch
                  aria-label="暂停新生成请求"
                  checked={data.config.paused}
                  loading={busy}
                  checkedChildren="暂停"
                  unCheckedChildren="开放"
                  onChange={(v) => global('paused', v)}
                />
              </div>
              <div className="mb-4">
                <Tag color={data.config.paused ? 'orange' : 'cyan'}>
                  {data.config.paused ? '新生成请求已暂停' : '新生成请求未暂停'}
                </Tag>
              </div>
              <p className="muted m-0 text-sm leading-7">
                暂停后不接受新的生成请求，正在运行的任务不会自动停止。
              </p>
            </section>
          </div>
          <section
            className="glass-panel data-panel"
            aria-labelledby="browser-users-title"
          >
            <div className="panel-header flex-wrap gap-4">
              <div>
                <div className="panel-kicker">BROWSER IDENTITIES</div>
                <h2 id="browser-users-title" className="section-title">
                  <TeamOutlined aria-hidden /> 浏览器用户
                </h2>
                <p className="muted mb-0 mt-2 text-sm">
                  管理本机身份的访问状态与已保存会话。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag>{data.users.length} 个用户</Tag>
                <Tag color="cyan">
                  {data.users.filter((user) => !user.disabled).length} 正常
                </Tag>
                <Tag>
                  {data.users.filter((user) => user.disabled).length} 已停用
                </Tag>
              </div>
            </div>
            <ProTable<User>
              rowKey="id"
              columns={columns}
              dataSource={data.users}
              search={false}
              options={false}
              toolBarRender={false}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 800 }}
              locale={{ emptyText: <Empty description="还没有浏览器用户" /> }}
            />
          </section>
          <div className="status-strip">
            <InfoCircleOutlined aria-hidden />
            <span className="min-w-0 flex-1 text-sm leading-7">
              这是本机浏览器会话身份，非生产账户系统；租户由现有服务固定。
            </span>
          </div>
        </div>
      )}
    </Workspace>
  );
}
