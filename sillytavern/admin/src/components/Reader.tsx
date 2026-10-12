import { ArrowLeftOutlined, EditOutlined, ReadOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { Button, Collapse, Empty, Input, Tag } from 'antd';
import { useState } from 'react';
import type { Book, Role } from '@/services/types';
export const roleFields: { key: keyof Role; label: string; hint?: string }[] = [
  { key: 'description', label: '角色简介' }, { key: 'detail', label: '角色描述' }, { key: 'personality', label: '性格' },
  { key: 'scenario', label: '场景' }, { key: 'greeting', label: '开场白' }, { key: 'examples', label: '对话示例' },
  { key: 'system', label: '系统提示词' }, { key: 'persona', label: '默认用户 Persona' },
  { key: 'postHistory', label: '角色历史后指令' }, { key: 'creatorNotes', label: '作者备注' }, { key: 'world', label: '原始世界设定', hint: '原始角色字段；实际注入来自绑定的独立世界书。' },
];
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });
export default function Reader({ role, book, books, onEdit }: { role?: Role; book?: Book; books: Book[]; onEdit: () => void }) {
  const [query, setQuery] = useState(''); const item = role ?? book;
  if (!item) return null;
  const entries = book?.entries ?? (book ? [{ uid: 0, comment: book.name, key: book.keys, keysecondary: [], content: book.content, constant: false, selective: false, useProbability: false, probability: 100, order: 100, position: 0, disable: false, selectiveLogic: 0 }] : []);
  const sections = role ? roleFields.map(f => ({ id: `field-${f.key}`, title: f.label, text: String(role[f.key] ?? ''), hint: f.hint })) : entries.map((e, i) => ({ id: `entry-${e.uid}`, title: e.comment || `条目 ${i + 1}`, text: e.content, hint: undefined }));
  const filtered = sections.filter(s => !query || `${s.title}\n${s.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button icon={<ArrowLeftOutlined />} onClick={() => history.push(role ? '/roles' : '/books')}>返回{role ? '角色库' : '世界书'}</Button><Button type="primary" icon={<EditOutlined />} onClick={onEdit}>编辑{role ? '角色' : '世界书'}</Button></div>
    <div className="rounded-2xl border border-solid border-[#e0e7e1] bg-white px-7 py-7"><div className="mb-3 flex flex-wrap gap-2"><Tag variant="filled" color="green">{role ? '角色档案' : '世界书全文'}</Tag><Tag variant="filled">{sections.length} {role ? '个正文字段' : '个条目'}</Tag><Tag variant="filled">{sections.reduce((n, s) => n + s.text.length, 0).toLocaleString()} 字符</Tag></div><h2 className="m-0 break-words text-3xl font-semibold leading-normal text-ink">{item.name}</h2><div className="mt-3 break-all text-xs text-muted">{item.id}</div><p className="mb-0 mt-4 text-sm leading-7 text-muted">{role ? '从背景到开场白，完整阅读角色的设定。这里的内容仅用于管理员查看与配置。' : '按资源中的原始条目顺序完整展示。排序、注入位置和触发条件独立保留。'}</p></div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="reading-nav min-w-0 xl:sticky xl:top-24 xl:self-start"><div className="mb-4 text-xs font-semibold tracking-widest text-muted">内容目录</div><Input.Search allowClear placeholder="搜索正文或标题" aria-label="搜索全文" value={query} onChange={e => setQuery(e.target.value)} /><div className="my-3 text-xs text-muted">显示 {filtered.length} / {sections.length} 项 · 全文不截断</div><nav className="max-h-[60vh] space-y-1 overflow-y-auto" aria-label="全文目录">{filtered.map(s => <Button key={s.id} type="text" onClick={() => jump(s.id)}>{s.title}</Button>)}</nav><Button type="link" onClick={() => jump('resource-metadata')}>来源与关联信息</Button></aside>
      <article className="min-w-0 rounded-xl border border-solid border-[#e0e7e1] bg-white" aria-label="完整正文">
        {!filtered.length && <Empty className="py-12" description="没有匹配的正文，清空搜索可阅读全部内容" />}
        {filtered.map(s => { const e = entries.find(x => `entry-${x.uid}` === s.id); return <section key={s.id} id={s.id} className="reading-section px-6 py-7 md:px-9 md:py-8"><div className="mb-5 flex flex-wrap items-center gap-3"><ReadOutlined className="text-forest-600" /><h3 className="m-0 text-lg font-semibold text-ink">{s.title}</h3>{e && <span className="text-xs text-muted">UID {e.uid}</span>}</div>{s.hint && <p className="text-sm text-muted">{s.hint}</p>}
          {e && <div className="mb-5 rounded-lg bg-[#f4f7f4] p-4 text-sm leading-7 text-muted"><div className="flex flex-wrap gap-2"><Tag color={e.disable ? 'default' : 'green'}>{e.disable ? '已停用' : '已启用'}</Tag><Tag>{e.constant ? '常驻' : '关键词触发'}</Tag><span>排序 {e.order} · 注入位置 {e.position} · {e.useProbability ? `触发概率 ${e.probability}%` : '不使用概率'}</span></div><div className="mt-2 break-words">主关键词：{e.key.join('、') || '无'}</div><div className="break-words">二级关键词：{e.keysecondary.join('、') || '无'}{e.selective ? ` · ${['AND ANY', 'NOT ALL', 'NOT ANY', 'AND ALL'][e.selectiveLogic]}` : ' · 未启用二级条件'}</div></div>}
          <div className="reading-text" data-content-id={s.id}>{s.text || <span className="text-muted">未设置</span>}</div>
          {e && <Collapse className="mt-6" size="small" items={[{ key: 'parameters', label: '查看此条目的全部配置字段', children: <pre className="m-0 whitespace-pre-wrap break-all text-xs leading-6">{JSON.stringify(Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'content')), null, 2)}</pre> }]} />}
        </section>; })}
        <section id="resource-metadata" className="reading-section px-6 py-8 md:px-9"><h3 className="m-0 mb-4 text-lg font-semibold">来源与关联信息</h3>
          {role && <><p className="text-sm leading-7 text-muted">标签：{role.tag || '未设置'} · 图标：{role.icon || '未设置'}<br />原始关键词：{role.keys.join('、') || '无'}</p><div className="mb-4 flex flex-wrap gap-2">{role.bookIds.length ? role.bookIds.map(id => <Button key={id} onClick={() => history.push(`/books/${encodeURIComponent(id)}`)}>{books.find(b => b.id === id)?.name || id}</Button>) : <span className="text-sm text-muted">未绑定世界书</span>}</div></>}
          {item.source ? <div className="space-y-2 text-sm leading-7 text-muted"><div>{item.source.attribution} · {item.source.license}</div><a className="break-all" href={item.source.repository} target="_blank" rel="noreferrer">查看原始来源</a><div className="break-all">源版本：{item.source.commit}</div><div>{item.source.adaptation}</div></div> : <p className="text-sm text-muted">本地创建的资源</p>}
          {book && <Collapse className="mt-4" items={[{key: 'book-meta', label: '查看世界书原始元数据', children: <pre className="whitespace-pre-wrap break-all text-xs leading-6">{JSON.stringify(Object.fromEntries(Object.entries(book).filter(([key]) => key !== 'entries')), null, 2)}</pre>}]} />}
        </section>
      </article>
    </div>
  </div>;
}
