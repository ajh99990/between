import { ExpandOutlined } from '@ant-design/icons';
import { App, Button, Form, type FormItemProps, Input, Modal } from 'antd';
import type { TextAreaProps } from 'antd/es/input';
import { useState } from 'react';

function TextInput({
  value = '',
  onChange,
  id,
  label,
  fieldProps,
}: {
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  label: string;
  fieldProps?: TextAreaProps;
}) {
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState('');
  const { modal } = App.useApp();
  const close = () => {
    const discard = () => {
      onChange?.(original);
      setOpen(false);
    };
    if (value !== original) {
      modal.confirm({
        title: '放弃本次展开编辑？',
        content: '恢复展开前的字段内容，其余表单修改不受影响。',
        okText: '放弃展开修改',
        cancelText: '继续编辑',
        onOk: discard,
      });
    } else setOpen(false);
  };
  const count = `${value.length}${fieldProps?.maxLength ? ` / ${fieldProps.maxLength}` : ' 字'}`;
  return (
    <>
      <Input.TextArea
        {...fieldProps}
        showCount={false}
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <div className="long-text-tools">
        <span className="long-text-count">{count}</span>
        <Button
          type="text"
          size="small"
          icon={<ExpandOutlined aria-hidden />}
          aria-label={`展开编辑 ${label}`}
          onClick={() => {
            setOriginal(value);
            setOpen(true);
          }}
        >
          展开编辑
        </Button>
      </div>
      <Modal
        title={label}
        open={open}
        destroyOnHidden
        width="min(1120px, 96vw)"
        className="fulltext-editor"
        mask={{ closable: false }}
        onCancel={close}
        okText="应用到表单"
        cancelText="放弃本次展开编辑"
        onOk={() => {
          setOpen(false);
        }}
      >
        <Input.TextArea
          aria-label="全文编辑内容"
          value={value}
          maxLength={fieldProps?.maxLength}
          autoFocus
          onChange={(event) => onChange?.(event.target.value)}
        />
        <div className="fulltext-count long-text-count">{count}</div>
      </Modal>
    </>
  );
}
export default function LongTextField({
  name,
  label,
  rules,
  tooltip,
  fieldProps,
}: {
  name: FormItemProps['name'];
  label: string;
  rules?: FormItemProps['rules'];
  tooltip?: FormItemProps['tooltip'];
  fieldProps?: TextAreaProps;
}) {
  return (
    <Form.Item name={name} label={label} rules={rules} tooltip={tooltip}>
      <TextInput label={label} fieldProps={fieldProps} />
    </Form.Item>
  );
}
