import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import {
  type ProColumns,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import { history, useModel, useParams } from '@umijs/max';
import { App, Button, Collapse, Empty, Form, Input, Tag } from 'antd';
import { useState } from 'react';
import Editor from '@/components/Editor';
import Reader from '@/components/Reader';
import { Workspace } from '@/components/Workspace';
import { saveConfig } from '@/services/admin';
import { newBook, removeBook, replaceBook } from '@/services/config';
import type { Book, Config } from '@/services/types';
export default function Books() {
  const { data, busy, mutate, clearFeedback } = useModel('admin');
  const { modal } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ book: Book; config: Config }>();
  const [form] = Form.useForm<Book>();
  const edit = (book: Book) => {
    if (!data) return;
    clearFeedback();
    form.resetFields();
    setEditor({
      book: structuredClone(book),
      config: structuredClone(data.config),
    });
  };
  const columns: ProColumns<Book>[] = [
    {
      title: '世界书',
      dataIndex: 'name',
      width: 280,
      render: (_, book) => (
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eee2] text-xl text-[#8c7145]">
            <ReadOutlined aria-hidden />
          </div>
          <Button
            type="link"
            className="h-auto whitespace-normal p-0 text-left font-semibold"
            onClick={() => history.push(`/books/${book.id}`)}
          >
            {book.name}
          </Button>
        </div>
      ),
    },
    {
      title: '条目',
      width: 100,
      render: (_, book) => (
        <Tag variant="filled">{book.entries?.length ?? 1} 条</Tag>
      ),
    },
    {
      title: '绑定角色',
      render: (_, book) => (
        <div className="flex flex-wrap gap-1">
          {data?.config.roles
            .filter((r) => r.bookIds.includes(book.id))
            .map((r) => (
              <Tag key={r.id}>{r.name}</Tag>
            ))}
        </div>
      ),
    },
    {
      title: '来源',
      width: 140,
      render: (_, book) => (
        <span className="text-sm text-muted">
          {book.source ? 'Foreverse Team' : '本地创建'}
        </span>
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 200,
      render: (_, book) => [
        <Button
          key="read"
          type="link"
          onClick={() => history.push(`/books/${book.id}`)}
        >
          阅读全文
        </Button>,
        <Button key="edit" type="link" onClick={() => edit(book)}>
          编辑
        </Button>,
        <Button
          key="remove"
          danger
          type="link"
          disabled={busy}
          onClick={() =>
            modal.confirm({
              title: `移除「${book.name}」？`,
              content: '将解除所有角色与此世界书的绑定，仅影响新会话。',
              okText: '移除世界书',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () =>
                mutate(
                  () => saveConfig(removeBook(data!.config, book.id)),
                  '世界书已移除，角色绑定已解除。',
                ),
            })
          }
        >
          移除
        </Button>,
      ],
    },
  ];
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
          <ProTable<Book>
            rowKey="id"
            headerTitle={`资源库 · ${data.config.books.length} 本`}
            columns={columns}
            dataSource={data.config.books.filter((b) =>
              `${b.name} ${b.keys.join(' ')}`.includes(query),
            )}
            search={false}
            toolBarRender={() => [
              <Input.Search
                key="search"
                placeholder="搜索世界书或关键词"
                aria-label="搜索世界书"
                allowClear
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />,
            ]}
            options={false}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 850 }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    query
                      ? '没有匹配的世界书'
                      : '还没有世界书，创建第一份世界设定'
                  }
                />
              ),
            }}
          />
        ))}
      {editor && (
        <Editor<Book>
          title={`编辑世界书 · ${editor.book.name || '新资源'}`}
          initialValues={editor.book}
          form={form}
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
                    <p className="text-sm text-muted">
                      注入位置 {entry.position}
                      ；其他原始参数不变，可在阅读视图查看全部字段。
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
