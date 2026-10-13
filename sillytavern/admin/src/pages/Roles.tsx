import { PlusOutlined, ReadOutlined, ArrowRightOutlined, CompassOutlined } from '@ant-design/icons';
import {
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { history, useModel, useParams } from '@umijs/max';
import { App, Button, Empty, Form, Input, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import Reader, { roleFields } from '@/components/Reader';
import { Metric, Orbit, Workspace } from '@/components/Workspace';
import { saveConfig } from '@/services/admin';
import { newRole, replaceRole } from '@/services/config';
import type { Config, Role } from '@/services/types';
export default function Roles() {
  const { data, busy, mutate, clearFeedback } = useModel('admin');
  const { modal } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ role: Role; config: Config }>();
  const [form] = Form.useForm<Role>();
  const edit = (role: Role) => {
    if (!data) return;
    clearFeedback();
    form.resetFields();
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
            <section className="studio-hero glass-panel">
              <div className="hero-copy"><span className="eyebrow">YOUR CHARACTERS. THEIR UNIVERSE.</span><h2>让想象，<br/><em>成为可对话的世界。</em></h2><p>从一段性格、一份记忆，到一个完整的人物。<br/>在这里构建下一次相遇。</p><Button icon={<CompassOutlined aria-hidden/>} onClick={()=>history.push('/resources')}>探索社区素材 <ArrowRightOutlined aria-hidden/></Button></div>
              <Orbit/>
              <div className="hero-metrics"><Metric label="角色档案" value={data.config.roles.length} detail="PERSONAS"/><Metric label="关联世界书" value={new Set(data.config.roles.flatMap(r=>r.bookIds)).size} detail="CONNECTED WORLDS"/><Metric label="社区角色" value={data.config.roles.filter(r=>r.source).length} detail="COMMUNITY"/></div>
            </section>
            <div className="collection-toolbar"><div><span className="eyebrow">YOUR COLLECTION</span><h2>角色档案 <span className="inline-count">{data.config.roles.length}</span></h2></div><Input.Search placeholder="搜索角色名称、简介或标签" aria-label="搜索角色" allowClear value={query} onChange={e=>setQuery(e.target.value)}/></div>
            <div className="persona-grid">{data.config.roles.filter(r=>`${r.name} ${r.tag} ${r.description}`.includes(query)).map((role,i)=><article className={`persona-card glass-panel tone-${i%4}`} key={role.id}>
              <div className="persona-art" aria-hidden="true"><div className="persona-aura"/><span className="persona-monogram">{role.name.slice(0,1)}</span><span className="persona-index">{String(i+1).padStart(2,'0')} / PERSONA</span></div>
              <div className="persona-content"><div className="persona-meta"><Tag>{role.source?'社区资源':'本地角色'}</Tag><span>{role.bookIds.length} 个世界</span></div><h3><button className="text-title-button" onClick={()=>history.push(`/roles/${role.id}`)}>{role.name}</button></h3><p className="persona-description">{role.description||'故事尚待书写，为这个角色添加第一段设定。'}</p><div className="tag-line">{role.tag||'未设置标签'}</div><div className="persona-actions"><Button type="primary" icon={<ReadOutlined aria-hidden/>} onClick={()=>history.push(`/roles/${role.id}`)}>阅读</Button><Button onClick={()=>edit(role)}>编辑</Button><Button type="text" danger disabled={busy||data.config.roles.length<=1} onClick={()=>remove(role)}>移除</Button></div></div>
            </article>)}</div>
            {!data.config.roles.some(r=>`${r.name} ${r.tag} ${r.description}`.includes(query))&&<Empty description="没有匹配的角色"><Button onClick={()=>setQuery('')}>清空搜索</Button></Empty>}
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
          form={form}
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
            <ProFormTextArea
              key={f.key}
              name={f.key}
              label={f.label}
              fieldProps={{
                autoSize: {
                  minRows: f.key === 'description' ? 2 : 4,
                  maxRows: 18,
                },
                maxLength: [
                  'personality',
                  'scenario',
                  'creatorNotes',
                  'postHistory',
                ].includes(f.key)
                  ? 24000
                  : 10000,
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
