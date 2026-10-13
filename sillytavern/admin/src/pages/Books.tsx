import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import {
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
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
  const remove=(book:Book)=>{if(!data)return;const config=data.config;modal.confirm({title:`移除「${book.name}」？`,content:'将解除所有角色与此世界书的绑定，仅影响新会话。',okText:'移除世界书',cancelText:'取消',okButtonProps:{danger:true},onOk:()=>mutate(()=>saveConfig(removeBook(config,book.id)),'世界书已移除，角色绑定已解除。')})};
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
          <div className="archive-layout"><aside className="archive-intro glass-panel"><span className="eyebrow">WORLD ARCHIVE</span><div className="archive-glyph" aria-hidden="true"><ReadOutlined/></div><h2>每个世界，<br/>都有自己的规则。</h2><p>背景、地点、关系与线索。将设定编入世界书，让不同角色共享同一片宇宙。</p><div className="archive-total"><strong>{data.config.books.length}</strong><span>本世界书</span></div><p className="small-note">完整保留条目与触发条件。<br/>更新配置用于新会话。</p></aside><div className="archive-shelf"><div className="collection-toolbar"><h2>设定档案</h2><Input.Search placeholder="搜索世界书或关键词" aria-label="搜索世界书" allowClear value={query} onChange={e=>setQuery(e.target.value)}/></div>{data.config.books.filter(b=>`${b.name} ${b.keys.join(' ')}`.includes(query)).map((book,i)=><article key={book.id} className="world-volume glass-panel"><div className="volume-spine" aria-hidden="true">{String(i+1).padStart(2,'0')}<ReadOutlined/></div><div className="volume-body"><span className="eyebrow">{book.source?'COMMUNITY ARCHIVE':'LOCAL ARCHIVE'}</span><h3>{book.name}</h3><div className="volume-bindings"><Tag>{book.entries?.length??1} 条设定</Tag>{data.config.roles.filter(r=>r.bookIds.includes(book.id)).map(r=><Tag key={r.id}>{r.name}</Tag>)}</div><p>{book.source?book.source.attribution:'本地创建'} · 完整内容与独立触发规则</p><div className="volume-actions"><Button onClick={()=>history.push(`/books/${book.id}`)}>阅读全文</Button><Button type="text" onClick={()=>edit(book)}>编辑</Button><Button danger type="text" disabled={busy} onClick={()=>remove(book)}>移除</Button></div></div></article>)}{!data.config.books.some(b=>`${b.name} ${b.keys.join(' ')}`.includes(query))&&<Empty description={query?'没有匹配的世界书':'还没有世界书，创建第一份世界设定'}>{query&&<Button onClick={()=>setQuery('')}>清空搜索</Button>}</Empty>}</div></div>
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
