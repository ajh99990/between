import { history, useModel } from '@umijs/max';
import { Alert, App, Button, Drawer, Form, Space } from 'antd';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ScopeNote } from './Workspace';
export default function Editor<T extends object>({
  title,
  initialValues,
  children,
  onSave,
  onClose,
  scope,
  confirmText,
}: {
  title: string;
  initialValues: T;
  children: ReactNode;
  onSave: (values: T) => Promise<boolean>;
  onClose: () => void;
  scope?: string;
  confirmText?: string;
}) {
  const [form] = Form.useForm<T>();
  const { modal } = App.useApp();
  const { busy, error } = useModel('admin');
  const [dirty, setDirty] = useState(false);
  const snapshot = useRef(structuredClone(initialValues));
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const originPath = useRef(history.location.pathname);
  useEffect(
    () => () => {
      // Return to the opening control after the portal leaves the document.
      // Navigation (including an expired login) owns its own focus destination.
      setTimeout(() => {
        if (
          history.location.pathname === originPath.current &&
          returnFocus.current?.isConnected &&
          !document.querySelector('.orbit-editor')
        ) {
          returnFocus.current.focus({ preventScroll: true });
        }
      }, 0);
    },
    [],
  );
  useEffect(() => {
    if (!dirty && !busy) return;
    const unblock = history.block(({ retry, location }) => {
      if (location.pathname === '/login') {
        unblock();
        retry();
        return;
      }
      if (busy) return;
      modal.confirm({
        title: '离开并放弃未保存的修改？',
        content: '服务端原内容不会改变。',
        okText: '放弃并离开',
        cancelText: '继续编辑',
        onOk: () => {
          unblock();
          retry();
        },
      });
    });
    return unblock;
  }, [dirty, busy, modal]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const close = () => {
    if (busy) return;
    if (dirty)
      modal.confirm({
        title: '放弃未保存的修改？',
        content: '返回后会保留服务器上的原内容。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: onClose,
      });
    else onClose();
  };
  return (
    <Drawer
      open
      data-testid="admin-editor"
      rootClassName="orbit-editor"
      title={title}
      size={760}
      onClose={close}
      mask={{ closable: false }}
      keyboard={!busy}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">
            {dirty ? '有尚未保存的修改' : '编辑后保存到服务器'}
          </span>
          <Space>
            <Button onClick={close} disabled={busy}>
              取消返回
            </Button>
            <Button type="primary" loading={busy} onClick={() => form.submit()}>
              保存修改
            </Button>
          </Space>
        </div>
      }
    >
      <div className="editor-context">
        {scope ? (
          <p className="m-0 text-sm leading-7 text-muted">{scope}</p>
        ) : (
          <ScopeNote />
        )}
      </div>
      {error && (
        <Alert
          className="mb-5"
          type="error"
          showIcon
          title={error}
          description="修改仍保留在编辑器中。若配置被其他操作修改，请取消返回并刷新最新配置后再编辑。"
        />
      )}
      <Form<T>
        form={form}
        layout="vertical"
        scrollToFirstError={{ focus: true }}
        initialValues={snapshot.current}
        onValuesChange={() => setDirty(true)}
        onFinish={(values) => {
          modal.confirm({
            title: '保存本次修改？',
            content: confirmText || '更新角色或世界书将应用到新会话。',
            okText: '确认保存',
            cancelText: '继续编辑',
            onOk: async () => {
              if (await onSave(values)) onClose();
            },
          });
        }}
      >
        {children}
      </Form>
    </Drawer>
  );
}
