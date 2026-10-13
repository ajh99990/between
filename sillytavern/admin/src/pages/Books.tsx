import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import {
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components';
import { history, useModel, useParams } from '@umijs/max';
import { App, Button, Collapse, Empty, Input, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import Reader from '@/components/Reader';
import { Metric, Workspace } from '@/components/Workspace';
import { saveConfig } from '@/services/admin';
import { newBook, removeBook, replaceBook } from '@/services/config';
import type { Book, Config } from '@/services/types';
export default function Books() {
  const { data, busy, mutate, clearFeedback } = useModel('admin');
  const { modal } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ book: Book; config: Config }>();
  const edit = (book: Book) => {
    if (!data) return;
    clearFeedback();
    setEditor({
      book: structuredClone(book),
      config: structuredClone(data.config),
    });
  };
  const remove = (book: Book) => {
    if (!data) return;
    const config = data.config;
    modal.confirm({
      title: `移除「${book.name}」？`,
      content: '将解除所有角色与此世界书的绑定，仅影响新会话。',
      okText: '移除世界书',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () =>
        mutate(
          () => saveConfig(removeBook(config, book.id)),
          '世界书已移除，角色绑定已解除。',
        ),
    });
  };
  const selected = data?.config.books.find((b) => b.id === id);
  return (
    <Workspace
      title={id ? '世界书阅读' : '世界书'}
      description="将背景、地点和规则整理为独立资源，在角色之间复用，完整保留每一条设定。"
      extra={
        !id && (
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={busy || (data?.config.books.length ?? 0) >= 100}
            onClick={() => edit(newBook())}
          >
            新建世界书
          </Button>
        )
      }
    >
      {data &&
        (id ? (
          selected ? (
            <Reader
              book={selected}
              books={data.config.books}
              onEdit={() => edit(selected)}
            />
          ) : (
            <Empty description="此世界书已移除">
              <Button onClick={() => history.push('/books')}>返回世界书</Button>
            </Empty>
          )
        ) : (
          <>
            <div className="metric-strip">
              <Metric
                label="世界书"
                value={data.config.books.length.toString().padStart(2, '0')}
                detail="独立管理，可在多个角色间复用"
              />
              <Metric
                label="内容条目"
                value={data.config.books.reduce(
                  (sum, book) => sum + (book.entries?.length ?? 1),
                  0,
                )}
                detail="完整保留触发条件与注入顺序"
              />
              <Metric
                label="关联角色"
                value={data.config.roles
                  .filter((role) => role.bookIds.length)
                  .length.toString()
                  .padStart(2, '0')}
                detail="每个故事都有自己的知识网络"
              />
            </div>
            <div className="library-heading">
              <div className="library-title">
                <h2 className="section-title">世界档案</h2>
                <span>WORLD COLLECTION</span>
              </div>
              <Input.Search
                placeholder="搜索世界书或关键词"
                aria-label="搜索世界书"
                allowClear
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="book-grid">
              {data.config.books
                .filter((book) =>
                  `${book.name} ${book.keys.join(' ')}`
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
                )
                .map((book, index) => (
                  <article key={book.id} className="book-card">
                    <div className="book-spine" aria-hidden>
                      <ReadOutlined />
                      <span>VOL.{String(index + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="book-card-body">
                      <h3>
                        <Button
                          type="link"
                          onClick={() =>
                            history.push(
                              `/books/${encodeURIComponent(book.id)}`,
                            )
                          }
                        >
                          {book.name}
                        </Button>
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <Tag color="cyan">
                          {book.entries?.length ?? 1} 条设定
                        </Tag>
                        <Tag>{book.source ? '社区资源' : '本地创建'}</Tag>
                      </div>
                      <p className="book-card-description line-clamp-2">
                        {book.entries?.[0]?.content ||
                          book.content ||
                          '尚未写入内容，编辑世界书补全世界的细节。'}
                      </p>
                      <div className="text-xs text-muted mb-4">
                        绑定角色：
                        {data.config.roles
                          .filter((role) => role.bookIds.includes(book.id))
                          .map((role) => role.name)
                          .join(' · ') || '尚未绑定'}
                      </div>
                      <div className="role-card-actions">
                        <Button
                          type="link"
                          onClick={() =>
                            history.push(
                              `/books/${encodeURIComponent(book.id)}`,
                            )
                          }
                        >
                          阅读全文
                        </Button>
                        <div>
                          <Button
                            type="text"
                            disabled={busy}
                            onClick={() => edit(book)}
                          >
                            编辑
                          </Button>
                          <Button
                            type="text"
                            danger
                            disabled={busy}
                            onClick={() => remove(book)}
                          >
                            移除
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
            {!data.config.books.some((book) =>
              `${book.name} ${book.keys.join(' ')}`
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            ) && (
              <div className="glass-panel">
                <Empty
                  description={
                    query
                      ? '没有匹配的世界书'
                      : '还没有世界书，创建第一份世界设定'
                  }
                >
                  {query && (
                    <Button onClick={() => setQuery('')}>清空搜索</Button>
                  )}
                </Empty>
              </div>
            )}
          </>
        ))}
      {editor && (
        <Editor<Book>
          title={`编辑世界书 · ${editor.book.name || '新资源'}`}
          initialValues={editor.book}
          onClose={() => setEditor(undefined)}
          onSave={(values) =>
            mutate(
              () =>
                saveConfig(
                  replaceBook(editor.config, {
                    ...editor.book,
                    ...values,
                    entries: editor.book.entries?.map((entry, i) => ({
                      ...entry,
                      ...values.entries?.[i],
                    })),
                  }),
                ),
              '世界书已保存，全文与条目条件已保留。',
            )
          }
        >
          <ProFormText
            name="name"
            label="世界书名称"
            rules={[
              { required: true, whitespace: true, message: '请输入世界书名称' },
            ]}
          />
          {editor.book.entries ? (
            <Collapse
              defaultActiveKey={[String(editor.book.entries[0]?.uid)]}
              items={editor.book.entries.map((entry, i) => ({
                key: String(entry.uid),
                label: `${i + 1}. ${entry.comment || '条目'} · UID ${entry.uid}`,
                forceRender: true,
                children: (
                  <>
                    <ProFormText
                      name={['entries', i, 'comment']}
                      label="条目标题"
                    />
                    <ProFormSelect
                      name={['entries', i, 'key']}
                      label="主关键词"
                      mode="tags"
                      fieldProps={{ tokenSeparators: ['，'] }}
                    />
                    <ProFormSelect
                      name={['entries', i, 'keysecondary']}
                      label="二级关键词"
                      mode="tags"
                      fieldProps={{ tokenSeparators: ['，'] }}
                    />
                    <ProFormTextArea
                      name={['entries', i, 'content']}
                      label="条目内容"
                      fieldProps={{
                        autoSize: { minRows: 8, maxRows: 22 },
                        maxLength: 24000,
                        showCount: true,
                      }}
                    />
                    <div className="grid gap-x-5 sm:grid-cols-2">
                      {(
                        [
                          'constant',
                          'selective',
                          'useProbability',
                          'disable',
                        ] as const
                      ).map((key, n) => (
                        <ProFormSwitch
                          key={key}
                          name={['entries', i, key]}
                          label={
                            [
                              '常驻条目',
                              '启用二级条件',
                              '启用概率',
                              '停用条目',
                            ][n]
                          }
                        />
                      ))}
                      <ProFormSelect
                        name={['entries', i, 'selectiveLogic']}
                        label="二级逻辑"
                        options={[
                          'AND ANY',
                          'NOT ALL',
                          'NOT ANY',
                          'AND ALL',
                        ].map((label, value) => ({ label, value }))}
                      />
                      <ProFormDigit
                        name={['entries', i, 'probability']}
                        label="触发概率（%）"
                        min={0}
                        max={100}
                        rules={[{ required: true }]}
                      />
                      <ProFormDigit
                        name={['entries', i, 'order']}
                        label="排序"
                        rules={[{ required: true }]}
                      />
                    </div>
                    <ProFormDigit
                      name={['entries', i, 'position']}
                      label="注入位置"
                      fieldProps={{ precision: 0 }}
                      rules={[{ required: true }]}
                    />
                    <p className="text-sm text-muted">
                      原始 UID
                      与未知扩展字段会随本次修改完整保留，可在阅读视图查看全部字段。
                    </p>
                  </>
                ),
              }))}
            />
          ) : (
            <>
              <ProFormSelect
                name="keys"
                label="关键词"
                mode="tags"
                fieldProps={{ tokenSeparators: ['，'] }}
              />
              <ProFormTextArea
                name="content"
                label="条目内容"
                fieldProps={{
                  autoSize: { minRows: 12, maxRows: 26 },
                  maxLength: 20000,
                  showCount: true,
                }}
              />
            </>
          )}
        </Editor>
      )}
    </Workspace>
  );
}
