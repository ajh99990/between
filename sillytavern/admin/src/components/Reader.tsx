import {
  ArrowLeftOutlined,
  EditOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { history } from '@umijs/max';
import { Button, Collapse, Empty, Input, Tag } from 'antd';
import { useState } from 'react';
import type { Book, Role } from '@/services/types';
export const roleFields: { key: keyof Role; label: string; hint?: string }[] = [
  { key: 'description', label: '角色简介' },
  { key: 'detail', label: '角色描述' },
  { key: 'personality', label: '性格' },
  { key: 'scenario', label: '场景' },
  { key: 'greeting', label: '开场白' },
  { key: 'examples', label: '对话示例' },
  { key: 'system', label: '系统提示词' },
  { key: 'persona', label: '默认用户 Persona' },
  { key: 'postHistory', label: '角色历史后指令' },
  { key: 'creatorNotes', label: '作者备注' },
  {
    key: 'world',
    label: '原始世界设定',
    hint: '原始角色字段；实际注入来自绑定的独立世界书。',
  },
];
const jump = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
export default function Reader({
  role,
  book,
  books,
  onEdit,
}: {
  role?: Role;
  book?: Book;
  books: Book[];
  onEdit: () => void;
}) {
  const [query, setQuery] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const item = role ?? book;
  if (!item) return null;
  const entries =
    book?.entries ??
    (book
      ? [
          {
            uid: 0,
            comment: book.name,
            key: book.keys,
            keysecondary: [],
            content: book.content,
            constant: false,
            selective: false,
            useProbability: false,
            probability: 100,
            order: 100,
            position: 0,
            disable: false,
            selectiveLogic: 0,
          },
        ]
      : []);
  const sections = role
    ? roleFields.map((f) => ({
        id: `field-${f.key}`,
        title: f.label,
        text: String(role[f.key] ?? ''),
        hint: f.hint,
      }))
    : entries.map((e, i) => ({
        id: `entry-${e.uid}`,
        title: e.comment || `条目 ${i + 1}`,
        text: e.content,
        hint: undefined,
      }));
  const filtered = sections.filter(
    (s) =>
      !query ||
      `${s.title}\n${s.text}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="reader">
      <div className="reader-toolbar">
        <Button
          icon={<ArrowLeftOutlined aria-hidden />}
          onClick={() => history.push(role ? '/roles' : '/books')}
        >
          返回{role ? '角色库' : '世界书'}
        </Button>
        <Button
          type="primary"
          icon={<EditOutlined aria-hidden />}
          onClick={onEdit}
        >
          编辑{role ? '角色' : '世界书'}
        </Button>
      </div>
      <section className="reader-cover">
        <div>
          <div className="panel-kicker">
            {role ? 'CHARACTER DOSSIER' : 'WORLD MANUSCRIPT'} / 完整档案
          </div>
          <h2>{item.name}</h2>
          <p>
            {role
              ? '从背景到开场白，完整阅读角色的设定。这里的内容仅用于管理员查看与配置。'
              : '按资源中的原始条目顺序完整展示。排序、注入位置和触发条件独立保留。'}
          </p>
          <div className="reader-cover-id">{item.id}</div>
        </div>
        <div className="reader-count">
          <div>
            <strong>{String(sections.length).padStart(2, '0')}</strong>
            <span>{role ? '正文字段' : '原始条目'}</span>
          </div>
          <div>
            <strong>
              {sections
                .reduce((n, section) => n + section.text.length, 0)
                .toLocaleString()}
            </strong>
            <span>全文字符</span>
          </div>
        </div>
      </section>
      <div className="reader-layout">
        <aside className="reading-nav">
          <div className="panel-kicker mb-4">READING INDEX / 目录</div>
          <Input.Search
            allowClear
            placeholder="搜索正文或标题"
            aria-label="搜索全文"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="my-4 text-xs text-muted" aria-live="polite">
            显示 {filtered.length} / {sections.length} 项 · 全文不截断
          </div>
          <Button
            className="directory-toggle mb-3"
            aria-expanded={directoryOpen}
            aria-controls="reader-directory"
            onClick={() => setDirectoryOpen((value) => !value)}
          >
            {directoryOpen ? '收起目录' : '展开目录'}
          </Button>
          <nav
            id="reader-directory"
            data-open={directoryOpen}
            aria-label="全文目录"
          >
            {filtered.map((section) => (
              <Button
                key={section.id}
                type="text"
                onClick={() => jump(section.id)}
              >
                {section.title}
              </Button>
            ))}
          </nav>
          <Button
            className="mt-3"
            type="link"
            onClick={() => jump('resource-metadata')}
          >
            来源与关联信息
          </Button>
        </aside>
        <article className="reader-document" aria-label="完整正文">
          {!filtered.length && (
            <Empty description="没有匹配的正文，清空搜索可阅读全部内容">
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            </Empty>
          )}
          {filtered.map((section) => {
            const entry = entries.find(
              (value) => `entry-${value.uid}` === section.id,
            );
            return (
              <section
                key={section.id}
                id={section.id}
                className="reading-section"
              >
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <ReadOutlined className="text-accent" aria-hidden />
                  <h3 className="m-0 text-lg font-semibold">{section.title}</h3>
                  {entry && (
                    <span className="text-xs text-muted">UID {entry.uid}</span>
                  )}
                </div>
                {section.hint && (
                  <p className="text-sm text-muted">{section.hint}</p>
                )}
                {entry && (
                  <div className="entry-conditions mb-5">
                    <div className="flex flex-wrap gap-2">
                      <Tag color={entry.disable ? 'default' : 'cyan'}>
                        {entry.disable ? '已停用' : '已启用'}
                      </Tag>
                      <Tag>{entry.constant ? '常驻' : '关键词触发'}</Tag>
                      <span>
                        排序 {entry.order} · 注入位置 {entry.position} ·{' '}
                        {entry.useProbability
                          ? `触发概率 ${entry.probability}%`
                          : '不使用概率'}
                      </span>
                    </div>
                    <div className="mt-2 break-words">
                      主关键词：{entry.key.join('、') || '无'}
                    </div>
                    <div className="break-words">
                      二级关键词：{entry.keysecondary.join('、') || '无'}
                      {entry.selective
                        ? ` · ${['AND ANY', 'NOT ALL', 'NOT ANY', 'AND ALL'][entry.selectiveLogic]}`
                        : ' · 未启用二级条件'}
                    </div>
                  </div>
                )}
                <div className="reading-text" data-content-id={section.id}>
                  {section.text || <span className="text-muted">未设置</span>}
                </div>
                {entry && (
                  <Collapse
                    className="mt-6"
                    size="small"
                    items={[
                      {
                        key: 'parameters',
                        label: '查看此条目的全部配置字段',
                        children: (
                          <pre className="m-0 whitespace-pre-wrap break-all text-xs leading-6">
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(entry).filter(
                                  ([key]) => key !== 'content',
                                ),
                              ),
                              null,
                              2,
                            )}
                          </pre>
                        ),
                      },
                    ]}
                  />
                )}
              </section>
            );
          })}
          <section id="resource-metadata" className="reading-section">
            <div className="panel-kicker mb-3">PROVENANCE / 资源谱系</div>
            <h3 className="m-0 mb-4 text-lg font-semibold">来源与关联信息</h3>
            {role && (
              <>
                <p className="text-sm leading-7 text-muted">
                  标签：{role.tag || '未设置'} · 图标：{role.icon || '未设置'}
                  <br />
                  原始关键词：{role.keys.join('、') || '无'}
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {role.bookIds.length ? (
                    role.bookIds.map((bookId) => (
                      <Button
                        key={bookId}
                        onClick={() =>
                          history.push(`/books/${encodeURIComponent(bookId)}`)
                        }
                      >
                        {books.find((value) => value.id === bookId)?.name ||
                          bookId}
                      </Button>
                    ))
                  ) : (
                    <span className="text-sm text-muted">未绑定世界书</span>
                  )}
                </div>
              </>
            )}
            {item.source ? (
              <div className="space-y-2 text-sm leading-7 text-muted">
                <div>
                  {item.source.attribution} · {item.source.license}
                </div>
                <a
                  className="break-all"
                  href={item.source.repository}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看原始来源
                </a>
                <div className="break-all">源版本：{item.source.commit}</div>
                <div>{item.source.adaptation}</div>
              </div>
            ) : (
              <p className="text-sm text-muted">本地创建的资源</p>
            )}
            <Collapse
              className="mt-4"
              items={[
                {
                  key: 'raw-meta',
                  label: book ? '查看世界书原始元数据' : '查看角色完整原始字段',
                  children: (
                    <pre className="whitespace-pre-wrap break-all text-xs leading-6">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(item).filter(
                            ([key]) => key !== 'entries',
                          ),
                        ),
                        null,
                        2,
                      )}
                    </pre>
                  ),
                },
              ]}
            />
          </section>
        </article>
      </div>
    </div>
  );
}
