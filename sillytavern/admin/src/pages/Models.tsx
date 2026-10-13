import {
  ApiOutlined,
  EditOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Alert, App, Button, Space, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import { Metric, Workspace } from '@/components/Workspace';
import { api, saveConfig } from '@/services/admin';
import type { Config, PlanConfig, Preset } from '@/services/types';

type ModelEdit =
  | { kind: 'plan'; config: Config }
  | { kind: 'model'; config: Config }
  | { kind: 'preset'; config: Config };
export default function Models() {
  const { data, busy, mutate, clearFeedback } = useModel('admin');
  const { modal } = App.useApp();
  const [editing, setEditing] = useState<ModelEdit>();
  const edit = (kind: ModelEdit['kind']) => {
    if (!data || busy) return;
    clearFeedback();
    setEditing({ kind, config: structuredClone(data.config) });
  };
  const planActive = data?.config.planBackend.enabled;
  const demoActive = !planActive && data?.model.mode === 'demo';
  const planCompleted = data?.plan.connection === 'completed';
  const planStatus =
    (
      {
        completed: '当前模型与档位已完成请求',
        ready: '授权就绪 · 尚未验证推理',
        unavailable: '套餐服务暂不可用',
        rate_limited: '请求频率受限',
        incomplete: '上次请求未完成',
        cancelled: '上次请求已取消',
        failed: '上次请求失败',
        usage_limit: '额度暂停',
        authorization_required: '尚未授权',
        scope_missing: '缺少套餐推理权限',
        expired: '授权已过期',
        forbidden: '账户或策略限制',
        auth_rejected: '授权未被接受',
        disconnected: '本地连接已断开',
        unsupported: '请求能力不受支持',
      } as Record<string, string>
    )[data?.plan.connection || ''] || '等待授权或恢复';
  const modelStatus =
    data?.model.mode === 'demo'
      ? '离线合成演示'
      : data?.model.connection === 'connected'
        ? '连接已验证'
        : '尚未验证真实模型';
  return (
    <Workspace
      title="模型与提示词"
      description="选择后续请求使用的模型后端，调整新会话的上下文与提示词。每一处变更都有明确的生效范围。"
    >
      {data && (
        <div className="page-stack">
          <section
            className="glass-panel"
            aria-labelledby="active-backend-title"
          >
            <div className="panel-header">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-solid border-cyan-300/20 bg-cyan-300/10 text-2xl text-cyan-200">
                  {planActive ? (
                    <ThunderboltOutlined aria-hidden />
                  ) : (
                    <ApiOutlined aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="panel-kicker">当前模型后端</div>
                  <h2 id="active-backend-title" className="section-title">
                    {planActive
                      ? 'ChatGPT 套餐'
                      : demoActive
                        ? '本地合成演示'
                        : 'Chat Completions'}
                  </h2>
                </div>
              </div>
              <Tag
                color={
                  planActive
                    ? planCompleted
                      ? 'green'
                      : data.plan.canGenerate
                        ? 'blue'
                        : 'orange'
                    : data.model.connection === 'connected'
                      ? 'green'
                      : 'default'
                }
              >
                {planActive ? planStatus : modelStatus}
              </Tag>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <div className="muted text-sm">当前选择的模型</div>
                <div className="mt-2 break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
                  {planActive
                    ? data.config.planBackend.model
                    : data.config.model?.name || data.model.model || '尚未配置'}
                </div>
                <p className="muted mb-0 mt-3 text-sm leading-7">
                  {planActive
                    ? '后续请求共用本机 Between 授权与额度，不会自动切换账单来源。'
                    : demoActive
                      ? '当前使用本地合成响应，未连接真实模型，不代表模型推理效果。'
                      : '后续请求使用已配置的兼容服务，服务商可能按请求计费。'}
                </p>
              </div>
              <div className="rounded-2xl border border-solid border-white/10 bg-white/5 p-5">
                <div className="muted text-sm">
                  {planActive ? '思考档位' : '运行时密钥'}
                </div>
                <div className="mt-2 text-xl font-semibold">
                  {planActive
                    ? data.config.planBackend.reasoningEffort === 'high'
                      ? 'high · 高'
                      : 'medium · 中等'
                    : data.model.credentialConfigured
                      ? '已配置（不展示）'
                      : '未配置'}
                </div>
                <div className="muted mt-2 text-sm leading-6">
                  {planActive
                    ? '切换模型或档位后，需要新的请求验证。'
                    : '密钥由服务端管理，此页面不接收凭据。'}
                </div>
              </div>
            </div>
            <div className="status-strip mt-6 model-scope-note">
              <SafetyCertificateOutlined aria-hidden />
              <span>
                连接配置影响所有用户之后发出的请求；保存设置不会发送模型生成请求。
              </span>
            </div>
          </section>
          <div className="ops-grid">
            <section className="glass-panel" aria-labelledby="plan-title">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">01 / 套餐后端</div>
                  <h2 id="plan-title" className="section-title">
                    ChatGPT 套餐
                  </h2>
                </div>
                <Button
                  icon={<EditOutlined aria-hidden />}
                  disabled={busy}
                  onClick={() => edit('plan')}
                >
                  编辑套餐
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Tag color={planActive ? 'blue' : 'default'}>
                  {planActive ? '当前使用 · 已启用' : '未启用'}
                </Tag>
                <span className="muted text-sm">{planStatus}</span>
              </div>
              <p className="muted mb-5 text-sm leading-7">
                {data.plan.description}
              </p>
              <dl className="m-0 grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-solid border-white/10 bg-white/5 p-4">
                  <dt className="muted text-sm">模型</dt>
                  <dd className="m-0 mt-2 break-all font-mono text-base font-semibold">
                    {data.config.planBackend.model}
                  </dd>
                </div>
                <div className="rounded-xl border border-solid border-white/10 bg-white/5 p-4">
                  <dt className="muted text-sm">思考档位</dt>
                  <dd className="m-0 mt-2 text-base font-semibold">
                    {data.config.planBackend.reasoningEffort === 'high'
                      ? '高 · high'
                      : '中等 · medium'}
                  </dd>
                </div>
              </dl>
              <p className="muted my-5 text-sm leading-7">
                共用管理员配置的独立 Between
                授权与额度。套餐模式忽略温度和输出上限，仍遵循上下文预算。
              </p>
              <div className="border-0 border-t border-solid border-white/10 pt-5">
                <div className="mb-3 text-sm font-semibold">套餐请求管理</div>
                <Space wrap>
                  <Button
                    disabled={busy || data.plan.connection !== 'usage_limit'}
                    onClick={() =>
                      modal.confirm({
                        title: '手动恢复套餐请求？',
                        content:
                          '请先自行查看 Usage 并确认额度可用。本操作只解除本地额度暂停，不检查额度、不重新授权，也不发送生成请求。',
                        okText: '已查看 Usage，恢复',
                        cancelText: '取消',
                        onOk: () =>
                          mutate(
                            () =>
                              api('/plan', 'PUT', {
                                action: 'resume',
                                confirm: true,
                              }),
                            '已解除本地额度暂停。后续请求仍由服务商校验额度。',
                          ),
                      })
                    }
                  >
                    手动恢复额度暂停
                  </Button>
                  <Button
                    danger
                    disabled={busy}
                    onClick={() =>
                      modal.confirm({
                        title: '断开本地套餐连接？',
                        content:
                          '会停止所有正在运行的生成任务，并断开本地套餐连接。OpenAI 侧的授权撤销需另行操作。',
                        okText: '断开连接',
                        cancelText: '取消',
                        onOk: () =>
                          mutate(
                            () =>
                              api('/plan', 'PUT', {
                                action: 'disconnect',
                                confirm: true,
                              }),
                            '已断开本地套餐连接。',
                          ),
                      })
                    }
                  >
                    断开连接
                  </Button>
                </Space>
              </div>
              <Alert
                className="mt-5"
                type="info"
                showIcon
                title="授权由本机助手管理"
                description="此页面不接收或展示凭据。需要登录时，请使用既有本机授权助手；多人托管的官方适用性尚未确认。"
              />
            </section>
            <section className="glass-panel" aria-labelledby="model-title">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">02 / 兼容服务</div>
                  <h2 id="model-title" className="section-title">
                    Chat Completions
                  </h2>
                </div>
                <Button
                  icon={<EditOutlined aria-hidden />}
                  disabled={busy || data.model.mode === 'demo'}
                  onClick={() => edit('model')}
                >
                  编辑连接
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Tag color={planActive ? 'default' : 'blue'}>
                  {planActive ? '未选用' : '当前使用'}
                </Tag>
                <span className="muted text-sm">{modelStatus}</span>
              </div>
              <p className="muted mb-5 text-sm leading-7">
                {data.model.description}
              </p>
              <dl className="m-0 space-y-5">
                <div>
                  <dt className="muted text-sm">模型</dt>
                  <dd className="m-0 mt-2 break-all font-mono text-lg font-semibold">
                    {data.config.model?.name || data.model.model || '尚未配置'}
                  </dd>
                </div>
                <div>
                  <dt className="muted text-sm">服务地址</dt>
                  <dd className="m-0 mt-2 break-all rounded-xl border border-solid border-white/10 bg-white/5 p-4 font-mono text-sm leading-6">
                    {data.config.model?.url || '尚未配置'}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-solid border-white/10 pb-5">
                  <dt className="muted text-sm">运行时密钥</dt>
                  <dd className="m-0 text-sm">
                    {data.model.credentialConfigured
                      ? '已配置（不展示）'
                      : '未配置'}
                  </dd>
                </div>
              </dl>
              <p className="muted mb-0 mt-5 text-sm leading-7">
                连接变更影响之后发出的请求。Token 计数固定使用
                gpt-4o-mini，其他模型的预算为估计值。
              </p>
              {planActive && (
                <p className="muted mb-0 mt-3 text-sm leading-7">
                  当前由 ChatGPT
                  套餐处理请求。关闭套餐后端后，后续请求才会使用此连接。
                </p>
              )}
              {data.model.mode === 'demo' && (
                <Alert
                  className="mt-5"
                  type="info"
                  showIcon
                  title="当前为合成演示模式，不能切换模型连接"
                />
              )}
            </section>
          </div>
          <section className="glass-panel" aria-labelledby="preset-title">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">03 / 新会话预设</div>
                <h2 id="preset-title" className="section-title">
                  提示词与生成参数
                </h2>
              </div>
              <Button
                icon={<EditOutlined aria-hidden />}
                disabled={busy}
                onClick={() => edit('preset')}
              >
                编辑预设
              </Button>
            </div>
            <p className="muted mb-5 mt-3 text-sm leading-7">
              预设用于新会话；已有会话保留创建时的参数。
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="上下文预算"
                value={data.config.preset.context.toLocaleString()}
                detail="Token · 两种后端均遵循"
              />
              <Metric
                label="回复上限"
                value={data.config.preset.maxTokens.toLocaleString()}
                detail="Token · 套餐模式忽略此项"
              />
              <Metric
                label="Temperature"
                value={data.config.preset.temperature}
                detail="生成温度 · 套餐模式忽略此项"
              />
              <Metric
                label="优先保留示例"
                value={data.config.preset.pinExamples ? '开启' : '关闭'}
                detail="在上下文中优先保留对话示例"
              />
            </div>
            <div className="mt-6 grid gap-5 border-0 border-t border-solid border-white/10 pt-6 lg:grid-cols-4">
              <div>
                <h3 className="m-0 text-base font-semibold">全局历史后指令</h3>
                <p className="muted mb-0 mt-2 text-sm leading-7">
                  用于新会话的全局提示词设置。
                </p>
              </div>
              <div className="reading-text min-w-0 rounded-2xl border border-solid border-white/10 bg-white/5 p-5 lg:col-span-3">
                {data.config.preset.postHistory || (
                  <span className="muted">
                    未设置 · 可通过编辑预设添加指令。
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {editing?.kind === 'plan' && (
        <Editor<PlanConfig>
          title="编辑 ChatGPT 套餐"
          initialValues={editing.config.planBackend}
          scope="切换后影响所有用户之后的模型请求，共用本机 Between 授权与额度。"
          confirmText="确认切换后续请求的套餐模型及思考档位？"
          onClose={() => setEditing(undefined)}
          onSave={(values) =>
            mutate(
              () =>
                api('/plan', 'PUT', {
                  ...values,
                  expectedVersion: editing.config.version,
                  confirm: true,
                }),
              '套餐设置已保存。',
            )
          }
        >
          <ProFormSwitch name="enabled" label="启用套餐后端" />
          <ProFormText
            name="model"
            label="套餐模型名称"
            rules={[{ required: true, whitespace: true }, { max: 200 }]}
          />
          <ProFormSelect
            name="reasoningEffort"
            label="思考档位"
            options={[
              { label: '中等 · medium', value: 'medium' },
              { label: '高 · high', value: 'high' },
            ]}
            rules={[{ required: true }]}
          />
        </Editor>
      )}
      {editing?.kind === 'model' && (
        <Editor<{ url: string; name: string }>
          title="编辑模型连接"
          initialValues={
            editing.config.model ?? { url: '', name: data?.model.model || '' }
          }
          scope="连接变更影响后续请求，后续生成可能产生服务商费用。密钥沿用既有服务端配置。"
          confirmText="保存模型地址与名称？本次保存不发送模型生成请求。"
          onClose={() => setEditing(undefined)}
          onSave={(values) =>
            mutate(
              () => api('/model', 'PUT', { ...values, confirm: true }),
              '连接已保存，尚未验证真实模型。',
            )
          }
        >
          <ProFormText
            name="url"
            label="兼容服务根地址"
            placeholder="https://example.com/v1"
            rules={[
              { required: true },
              { type: 'url', message: '请输入有效的完整 URL' },
            ]}
          />
          <ProFormText
            name="name"
            label="模型名称"
            rules={[{ required: true, whitespace: true }, { max: 200 }]}
          />
        </Editor>
      )}
      {editing?.kind === 'preset' && (
        <Editor<Preset>
          title="编辑提示词与生成参数"
          initialValues={editing.config.preset}
          scope="预设仅用于之后创建的新会话；已有会话保留创建时的参数。套餐模式忽略温度和回复上限，仍遵循上下文预算。"
          confirmText="保存提示词与生成参数，并应用于之后创建的新会话？"
          onClose={() => setEditing(undefined)}
          onSave={(values) =>
            mutate(
              () =>
                saveConfig({
                  ...editing.config,
                  preset: { ...editing.config.preset, ...values },
                }),
              '预设已保存，将应用于新会话。',
            )
          }
        >
          <div className="grid gap-x-5 sm:grid-cols-2">
            <ProFormDigit
              name="context"
              label="上下文预算"
              min={2}
              max={128000}
              fieldProps={{ precision: 0 }}
              rules={[{ required: true }]}
            />
            <ProFormDigit
              name="maxTokens"
              label="回复 Token 上限"
              min={1}
              fieldProps={{ precision: 0 }}
              rules={[
                { required: true },
                ({
                  getFieldValue,
                }: {
                  getFieldValue: (name: string) => number;
                }) => ({
                  validator: (_: unknown, v: number) =>
                    v < getFieldValue('context')
                      ? Promise.resolve()
                      : Promise.reject(new Error('回复上限须小于上下文预算')),
                }),
              ]}
            />
            <ProFormDigit
              name="temperature"
              label="Temperature"
              min={0}
              max={2}
              fieldProps={{ step: 0.1 }}
              rules={[{ required: true }]}
            />
            <ProFormSwitch name="pinExamples" label="优先保留对话示例" />
          </div>
          <ProFormTextArea
            name="postHistory"
            label="全局历史后指令"
            fieldProps={{
              autoSize: { minRows: 8, maxRows: 20 },
              maxLength: 10000,
              showCount: true,
            }}
          />
        </Editor>
      )}
    </Workspace>
  );
}
