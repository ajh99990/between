import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import { ProTable, type ProColumns, ProFormText, ProFormTextArea, ProFormSelect } from '@ant-design/pro-components';
import { history, useModel, useParams } from '@umijs/max';
import { App, Button, Empty, Form, Input, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import Reader, { roleFields } from '@/components/Reader';
import { Metric, Workspace } from '@/components/Workspace';
import { saveConfig } from '@/services/admin';
import { newRole, replaceRole } from '@/services/config';
import type { Config, Role } from '@/services/types';
export default function Roles() {
  const { data, busy, mutate, clearFeedback } = useModel('admin'); const { modal } = App.useApp(); const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState(''); const [editor, setEditor] = useState<{ role: Role; config: Config }>(); const [form] = Form.useForm<Role>();
  const edit = (role: Role) => { if (!data) return; clearFeedback(); form.resetFields(); setEditor({ role: structuredClone(role), config: structuredClone(data.config) }); };
  const remove = (role: Role) => modal.confirm({ title: `移除「${role.name}」？`, content: '从新会话的角色库移除，已有会话不删除。', okText: '移除角色', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => mutate(() => saveConfig({ ...data!.config, roles: data!.config.roles.filter(r => r.id !== role.id) }), '角色已移除。') });
  const columns: ProColumns<Role>[] = [
    { title: '角色', dataIndex: 'name', width: 280, render: (_, role) => <div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-xl text-forest-600">{role.icon || '◇'}</div><div className="min-w-0"><Button type="link" className="h-auto max-w-full whitespace-normal p-0 text-left font-semibold" onClick={() => history.push(`/roles/${role.id}`)}>{role.name}</Button><div className="mt-1 text-xs leading-5 text-muted">{role.tag || '未设置标签'}</div></div></div> },
    { title: '简介', dataIndex: 'description', search: false, render: (_, role) => <div className="line-clamp-2 max-w-md text-sm leading-6 text-muted">{role.description || '暂无简介'}</div> },
    { title: '世界书', dataIndex: 'bookIds', search: false, width: 180, render: (_, role) => <div className="flex flex-wrap gap-1">{role.bookIds.length ? role.bookIds.map(bookId => <Tag key={bookId}>{data?.config.books.find(b => b.id === bookId)?.name}</Tag>) : <span className="text-muted">未绑定</span>}</div> },
    { title: '来源', dataIndex: 'source', search: false, width: 130, render: (_, role) => <Tag variant="filled" color={role.source ? 'blue' : 'default'}>{role.source ? '社区资源' : '本地角色'}</Tag> },
    { title: '操作', valueType: 'option', width: 200, render: (_, role) => [<Button key="read" type="link" icon={<ReadOutlined />} onClick={() => history.push(`/roles/${role.id}`)}>阅读</Button>, <Button key="edit" type="link" onClick={() => edit(role)}>编辑</Button>, <Button key="remove" type="link" danger disabled={busy || data!.config.roles.length <= 1} onClick={() => remove(role)}>移除</Button>] },
  ];
  const selected = data?.config.roles.find(r => r.id === id);
  return <Workspace title={id ? '角色档案' : '角色库'} description="管理角色的个性、故事与对话方式，让每次相遇都有完整的设定。" extra={!id && <Button key="create" type="primary" icon={<PlusOutlined />} disabled={busy || (data?.config.roles.length ?? 0) >= 20} onClick={() => edit(newRole())}>新建角色</Button>}>
    {data && (id ? selected ? <Reader role={selected} books={data.config.books} onEdit={() => edit(selected)} /> : <Empty description="此角色已移除"><Button onClick={() => history.push('/roles')}>返回角色库</Button></Empty> : <><div className="mb-6 grid gap-4 sm:grid-cols-3"><Metric label="角色总数" value={data.config.roles.length} detail="每一份设定，都是一个对话起点" /><Metric label="已关联世界书" value={new Set(data.config.roles.flatMap(r => r.bookIds)).size} detail="为角色提供可复用的背景知识" /><Metric label="社区角色" value={data.config.roles.filter(r => r.source).length} detail="保留作者归因与原始内容" /></div><ProTable<Role> rowKey="id" headerTitle="全部角色" columns={columns} dataSource={data.config.roles.filter(r => `${r.name} ${r.tag} ${r.description}`.includes(query))} search={false} options={{ reload: false, density: true, setting: true }} toolBarRender={() => [<Input.Search key="search" placeholder="搜索角色名称、简介或标签" aria-label="搜索角色" allowClear value={query} onChange={e => setQuery(e.target.value)} />]} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 900 }} locale={{ emptyText: <Empty description="没有匹配的角色" /> }} /></>)}
    {editor && <Editor<Role> title={editor.config.roles.some(r => r.id === editor.role.id) ? `编辑角色 · ${editor.role.name}` : '新建角色'} initialValues={editor.role} form={form} onClose={() => setEditor(undefined)} onSave={values => mutate(() => saveConfig(replaceRole(editor.config, { ...editor.role, ...values })), '角色已保存，新会话将使用此设定。')}>
      <div className="grid gap-x-5 sm:grid-cols-2"><ProFormText name="name" label="角色名称" rules={[{ required: true, whitespace: true, message: '请输入角色名称' }, { max: 10000 }]} /><ProFormText name="tag" label="标签" fieldProps={{ maxLength: 10000 }} /></div>
      <ProFormSelect name="bookIds" label="绑定世界书" mode="multiple" options={editor.config.books.map(b => ({ label: b.name, value: b.id }))} placeholder="选择可复用的世界书" />
      {roleFields.filter(f => f.key !== 'world').map(f => <ProFormTextArea key={f.key} name={f.key} label={f.label} fieldProps={{ autoSize: { minRows: f.key === 'description' ? 2 : 4, maxRows: 18 }, maxLength: ['personality', 'scenario', 'creatorNotes', 'postHistory'].includes(f.key) ? 24000 : 10000, showCount: true }} />)}
      {editor.role.source && <p className="text-sm leading-7 text-muted">来源：{editor.role.source.attribution} / {editor.role.source.license}。原始归因将保留。</p>}
    </Editor>}
  </Workspace>;
}
