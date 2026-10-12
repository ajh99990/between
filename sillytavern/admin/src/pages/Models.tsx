import { EditOutlined } from '@ant-design/icons';
import {
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Alert, App, Button, Card, Descriptions, Form, Space, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import { Workspace } from '@/components/Workspace';
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
  const [planForm] = Form.useForm<PlanConfig>();
  const [modelForm] = Form.useForm<{ url: string; name: string }>();
  const [presetForm] = Form.useForm<Preset>();
  const edit = (kind: ModelEdit['kind']) => {
    clearFeedback();
    planForm.resetFields();
    modelForm.resetFields();
    presetForm.resetFields();
    setEditing({ kind, config: structuredClone(data!.config) });
  };
  return (
    <Workspace
      title="模型与提示词"
      description="管理对话所使用的模型连接与生成参数，清楚了解每一项设置的生效范围。"
    >
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-solid border-[#dce7de] bg-forest-50 px-6 py-5">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">
                当前模型后端
              </div>
              <div className="text-lg font-semibold">
                {data.config.planBackend.enabled
                  ? 'ChatGPT 套餐'
                  : 'Chat Completions'}
              </div>
            </div>
            <Tag
              color={
                data.config.planBackend.enabled
                  ? data.plan.canGenerate
                    ? 'green'
                    : 'orange'
                  : data.model.connection === 'connected'
                    ? 'green'
                    : 'default'
              }
            >
              {data.config.planBackend.enabled
                ? data.plan.canGenerate
                  ? '可用'
                  : '等待授权或恢复'
                : data.model.connection === 'connected'
                  ? '连接已验证'
                  : '尚未验证真实模型'}
            </Tag>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              title="ChatGPT 套餐"
              extra={
                <Button
                  icon={<EditOutlined aria-hidden />}
                  onClick={() => edit('plan')}
                >
                  编辑套餐
                </Button>
              }
            >
              <p className="mt-0 text-sm leading-7 text-muted">
                {data.plan.description}
              </p>
              <Descriptions
                column={1}
                items={[
                  {
                    key: 'enabled',
                    label: '启用状态',
                    children: (
                      <Tag
                        color={
                          data.config.planBackend.enabled ? 'green' : 'default'
                        }
                      >
                        {data.config.planBackend.enabled ? '已启用' : '未启用'}
                      </Tag>
                    ),
                  },
                  {
                    key: 'model',
                    label: '模型',
                    children: data.config.planBackend.model,
                  },
                  {
                    key: 'effort',
                    label: '思考档位',
                    children:
                      data.config.planBackend.reasoningEffort === 'high'
                        ? '高 · high'
                        : '中等 · medium',
                  },
                ]}
              />
              <p className="text-sm leading-7 text-muted">
                共用管理员配置的独立 Between
                授权与额度。套餐模式忽略温度和输出上限，不会自动切换账单来源。
              </p>
              <Space wrap>
                <Button
                  disabled={busy}
                  onClick={() =>
                    modal.confirm({
                      title: '恢复套餐请求？',
                      content:
                        '由套餐服务检查 Usage 后恢复。本操作不发送模型生成请求。',
                      okText: '检查并恢复',
                      cancelText: '取消',
                      onOk: () =>
                        mutate(
                          () =>
                            api('/plan', 'PUT', {
                              action: 'resume',
                              confirm: true,
                            }),
                          '已请求恢复套餐连接。',
                        ),
                    })
                  }
                >
                  检查并恢复请求
                </Button>
                <Button
                  danger
                  disabled={busy}
                  onClick={() =>
                    modal.confirm({
                      title: '断开本地套餐连接？',
                      content:
                        '会停止当前套餐请求。OpenAI 侧的授权撤销需另行操作。',
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
              <Alert
                className="mt-5"
                type="info"
                title="授权由本机助手管理"
                description="此页面不接收或展示凭据。需要登录时，请使用既有本机授权助手；多人托管的官方适用性尚未确认。"
              />
            </Card>
            <Card
              title="Chat Completions"
              extra={
                <Button
                  icon={<EditOutlined aria-hidden />}
                  disabled={data.model.mode === 'demo'}
                  onClick={() => edit('model')}
                >
                  编辑连接
                </Button>
              }
            >
              <p className="mt-0 text-sm leading-7 text-muted">
                {data.model.description}
              </p>
              <Descriptions
                column={1}
                items={[
                  {
                    key: 'name',
                    label: '模型',
                    children:
                      data.config.model?.name || data.model.model || '尚未配置',
                  },
                  {
                    key: 'url',
                    label: '服务地址',
                    children: (
                      <span className="break-all">
                        {data.config.model?.url || '尚未配置'}
                      </span>
                    ),
                  },
                  {
                    key: 'key',
                    label: '运行时密钥',
                    children: data.model.credentialConfigured
                      ? '已配置（不展示）'
                      : '未配置',
                  },
                ]}
              />
              <p className="text-sm leading-7 text-muted">
                连接变更影响之后发出的请求。Token 计数固定使用
                gpt-4o-mini，其他模型的预算为估计值。
              </p>
              {data.model.mode === 'demo' && (
                <Alert
                  type="info"
                  title="当前为合成演示模式，不能切换模型连接"
                />
              )}
            </Card>
          </div>
          <Card
            title="提示词与生成参数"
            extra={
              <Button
                icon={<EditOutlined aria-hidden />}
                onClick={() => edit('preset')}
              >
                编辑预设
              </Button>
            }
          >
            <Descriptions
              column={{ xs: 1, sm: 2, lg: 4 }}
              items={[
                {
                  key: 'context',
                  label: '上下文预算',
                  children: data.config.preset.context.toLocaleString(),
                },
                {
                  key: 'max',
                  label: '回复上限',
                  children: data.config.preset.maxTokens.toLocaleString(),
                },
                {
                  key: 'temp',
                  label: 'Temperature',
                  children: data.config.preset.temperature,
                },
                {
                  key: 'pin',
                  label: '优先保留示例',
                  children: data.config.preset.pinExamples ? '是' : '否',
                },
              ]}
            />
            <div className="mt-5 rounded-lg bg-[#f6f8f6] p-5">
              <div className="mb-3 text-xs font-semibold text-muted">
                全局历史后指令
              </div>
              <div className="reading-text">
                {data.config.preset.postHistory || '未设置'}
              </div>
            </div>
            <p className="mb-0 text-sm leading-7 text-muted">
              预设用于新会话；已有会话保留创建时的参数。
            </p>
          </Card>
        </div>
      )}
      {editing?.kind === 'plan' && (
        <Editor<PlanConfig>
          title="编辑 ChatGPT 套餐"
          form={planForm}
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
          form={modelForm}
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
          form={presetForm}
          initialValues={editing.config.preset}
          onClose={() => setEditing(undefined)}
          onSave={(values) =>
            mutate(
              () => saveConfig({ ...editing.config, preset: values }),
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
