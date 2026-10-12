import { useModel } from '@umijs/max';
import { App, Alert, Button, Drawer, Form, type FormInstance, Space } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { ScopeNote } from './Workspace';
export default function Editor<T extends object>({ title, initialValues, children, onSave, onClose, form, scope, confirmText }: { title: string; initialValues: T; children: ReactNode; onSave: (values: T) => Promise<boolean>; onClose: () => void; form: FormInstance<T>; scope?: string; confirmText?: string }) {
  const { modal } = App.useApp(); const { busy, error } = useModel('admin'); const [dirty, setDirty] = useState(false);
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
  const close = () => { if (busy) return; if (dirty) modal.confirm({ title: '放弃未保存的修改？', content: '返回后会保留服务器上的原内容。', okText: '放弃修改', cancelText: '继续编辑', onOk: onClose }); else onClose(); };
  return <Drawer open title={title} size={760} onClose={close} mask={{ closable: false }} keyboard={!busy} destroyOnHidden footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted">{dirty ? '有尚未保存的修改' : '编辑后保存到服务器'}</span><Space><Button onClick={close} disabled={busy}>取消返回</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>保存修改</Button></Space></div>}>
    <div className="mb-6 rounded-lg bg-forest-50 p-4">{scope ? <p className="m-0 text-sm leading-7 text-muted">{scope}</p> : <ScopeNote />}</div>
    {error && <Alert className="mb-5" type="error" showIcon title={error} description="修改仍保留在编辑器中。若版本冲突，请取消返回并刷新最新配置后再编辑。" />}
    <Form<T> form={form} layout="vertical" initialValues={initialValues} onValuesChange={() => setDirty(true)} onFinish={values => { modal.confirm({ title: '保存本次修改？', content: confirmText || '更新角色或世界书将应用到新会话。', okText: '确认保存', cancelText: '继续编辑', onOk: async () => { if (await onSave(values)) onClose(); } }); }}>{children}</Form>
  </Drawer>;
}
