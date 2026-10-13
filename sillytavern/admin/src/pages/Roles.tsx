import {
  ArrowRightOutlined,
  BookOutlined,
  PlusOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { ProFormSelect, ProFormText } from '@ant-design/pro-components';
import { history, useModel, useParams } from '@umijs/max';
import { App, Button, Empty, Input, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import LongTextField from '@/components/LongTextField';
import Reader, { roleFields } from '@/components/Reader';
import { Workspace } from '@/components/Workspace';
import { saveConfig } from '@/services/admin';
import { newRole, replaceRole } from '@/services/config';
import type { Config, Role } from '@/services/types';
export default function Roles() {
  const { data, busy, mutate, clearFeedback } = useModel('admin');
  const { modal } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ role: Role; config: Config }>();
  const edit = (role: Role) => {
    if (!data) return;
    clearFeedback();
    setEditor({
      role: structuredClone(role),
      config: structuredClone(data.config),
    });
  };
  const remove = (role: Role) => {
    if (!data) return;
    const config = data.config;
    modal.confirm({
      title: `移除「${role.name}」？`,
      content: '从新会话的角色库移除，已有会话不删除。',
      okText: '移除角色',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () =>
        mutate(
          () =>
            saveConfig({
              ...config,
              roles: config.roles.filter((r) => r.id !== role.id),
            }),
          '角色已移除。',
        ),
    });
  };
  const selected = data?.config.roles.find((r) => r.id === id);
  return (
    <Workspace
      title={id ? '角色档案' : '角色库'}
      description="管理角色的个性、故事与对话方式，让每次相遇都有完整的设定。"
      extra={
        !id && (
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={busy || (data?.config.roles.length ?? 0) >= 20}
            onClick={() => edit(newRole())}
          >
            新建角色
          </Button>
        )
      }
    >
      {data &&
        (id ? (
          selected ? (
            <Reader
              role={selected}
              books={data.config.books}
              onEdit={() => edit(selected)}
            />
          ) : (
            <Empty description="此角色已移除">
              <Button onClick={() => history.push('/roles')}>返回角色库</Button>
            </Empty>
          )
        ) : (
          <>
            <div className="library-heading">
              <div className="library-title">
                <span className="muted">{data.config.roles.length} 个角色</span>
              </div>
              <Input.Search
                placeholder="搜索角色名称、简介或标签"
                aria-label="搜索角色"
                allowClear
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="role-grid">
              {data.config.roles
                .filter((role) =>
                  `${role.name} ${role.tag} ${role.description}`
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
                )
                .map((role) => (
                  <article className="role-card" key={role.id}>
                    <h3>
                      <Button
                        type="link"
                        onClick={() =>
                          history.push(`/roles/${encodeURIComponent(role.id)}`)
                        }
                      >
                        {role.name}
                      </Button>
                    </h3>
                    <div className="role-card-tags">
                      {role.tag && <Tag>{role.tag}</Tag>}
                    </div>
                    <p className="role-card-description line-clamp-3">
                      {role.description || '未设置简介'}
                    </p>
                    <div className="role-card-books">
                      <BookOutlined aria-hidden />{' '}
                      {role.bookIds.length
                        ? role.bookIds
                            .map(
                              (bookId) =>
                                data.config.books.find(
                                  (book) => book.id === bookId,
                                )?.name || bookId,
                            )
                            .join(' · ')
                        : '尚未绑定世界书'}
                    </div>
                    <div className="role-card-actions">
                      <Button
                        type="link"
                        icon={<ReadOutlined aria-hidden />}
                        onClick={() =>
                          history.push(`/roles/${encodeURIComponent(role.id)}`)
                        }
                      >
                        阅读 <ArrowRightOutlined aria-hidden />
                      </Button>
                      <div>
                        <Button
                          type="text"
                          disabled={busy}
                          onClick={() => edit(role)}
                        >
                          编辑
                        </Button>
                        <Button
                          type="text"
                          danger
                          disabled={busy || data.config.roles.length <= 1}
                          onClick={() => remove(role)}
                        >
                          移除
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {!data.config.roles.some((role) =>
              `${role.name} ${role.tag} ${role.description}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            ) && (
              <div className="glass-panel">
                <Empty description="没有匹配的角色">
                  <Button onClick={() => setQuery('')}>清空搜索</Button>
                </Empty>
              </div>
            )}
          </>
        ))}
      {editor && (
        <Editor<Role>
          title={
            editor.config.roles.some((r) => r.id === editor.role.id)
              ? `编辑角色 · ${editor.role.name}`
              : '新建角色'
          }
          initialValues={editor.role}
          onClose={() => setEditor(undefined)}
          onSave={(values) =>
            mutate(
              () =>
                saveConfig(
                  replaceRole(editor.config, { ...editor.role, ...values }),
                ),
              '角色已保存，新会话将使用此设定。',
            )
          }
        >
          <div className="grid gap-x-5 sm:grid-cols-2">
            <ProFormText
              name="name"
              label="角色名称"
              rules={[
                { required: true, whitespace: true, message: '请输入角色名称' },
                { max: 10000 },
              ]}
            />
            <ProFormText
              name="tag"
              label="标签"
              fieldProps={{ maxLength: 10000 }}
            />
          </div>
          <ProFormText
            name="icon"
            label="角色标记"
            fieldProps={{ maxLength: 16 }}
          />
          <ProFormSelect
            name="keys"
            label="原始关键词（实际注入使用绑定世界书）"
            mode="tags"
          />
          <ProFormSelect
            name="bookIds"
            label="绑定世界书"
            mode="multiple"
            options={editor.config.books.map((b) => ({
              label: b.name,
              value: b.id,
            }))}
            placeholder="选择可复用的世界书"
          />
          {roleFields.map((f) => (
            <LongTextField
              key={f.key}
              name={f.key}
              label={f.label}
              tooltip={
                f.key === 'description'
                  ? editor.role.source
                    ? '社区角色在用户端使用固定公开简介，此字段保留为管理员原始档案。'
                    : '用户端会展示这段简介，请勿填写内部提示词。'
                  : f.hint
              }
              fieldProps={{
                autoSize: {
                  minRows: f.key === 'description' ? 2 : 4,
                  maxRows: 18,
                },
                maxLength: 24000,
                showCount: true,
              }}
            />
          ))}
          {editor.role.source && (
            <p className="text-sm leading-7 text-muted">
              来源：{editor.role.source.attribution} /{' '}
              {editor.role.source.license}。原始归因将保留。
            </p>
          )}
        </Editor>
      )}
    </Workspace>
  );
}
