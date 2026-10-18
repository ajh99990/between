import { Button, Combobox, Dialog, Field, Input, Menu, Popover, UiInteractionProvider, UiProvider } from "../src";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/index.css";

declare global {
  interface Window {
    uiFixture: { revoke(): void; reopen(): void; close(): void; setReduced(value: boolean): void };
  }
}

function Fixture() {
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("受控浮层");
  const [draft, setDraft] = useState("完整草稿仍由调用方持有");
  const [selected, setSelected] = useState("one");
  const [reduced, setReduced] = useState(false);
  window.uiFixture = {
    revoke: () => setEnabled(false),
    close: () => { setOpen(false); setTitle("业务状态已重置"); },
    reopen: () => {
      setOpen(false);
      setTitle("业务状态已重置");
      setTimeout(() => { setTitle("中断后重新打开"); setOpen(true); }, 30);
    },
    setReduced,
  };
  return <UiProvider reducedMotion={reduced}>
    <div className="glass-workbench" style={{ minHeight: "2500px", padding: "32px", background: "#19212b" }}>
      <h1>纯测试浮层入口</h1>
      <p>此文件仅由自动化临时构建，不进入组件工作台或后台产物。</p>
      <output data-testid="authorization">{enabled ? "允许交互" : "权限失效"}</output>
      <UiInteractionProvider enabled={enabled}>
        <Button onMouseDown={(event) => event.preventDefault()} onClick={() => { setTitle("受控浮层"); setOpen(true); }}>打开测试窗口</Button>
        <Input aria-label="后台原有草稿" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Menu label="权限菜单" trigger={<Button>权限菜单</Button>} items={[{ id: "edit", label: "编辑", onSelect: () => setOpen(true) }]} />
        <Dialog open={open} title={title} onClose={() => { setOpen(false); setTitle("业务状态已重置"); }} footer={<Button onClick={() => setOpen(false)}>完成</Button>}>
          <Field label="窗口草稿"><Input value={draft} onChange={(event) => setDraft(event.target.value)} /></Field>
          <Combobox label="窗口负责人" value={selected} onChange={setSelected} options={[{ value: "one", label: "成员甲" }, { value: "two", label: "成员乙" }]} />
          <Popover label="权限气泡" trigger={<Button>权限气泡</Button>}><p>当前可见的浮层内容。</p></Popover>
        </Dialog>
        <Dialog open={false} title="始终挂载的其他窗口" onClose={() => undefined}>{null}</Dialog>
      </UiInteractionProvider>
      <p style={{ marginTop: "1900px" }}>后台滚动位置的终点。</p>
    </div>
  </UiProvider>;
}

const root = document.getElementById("root");
if (!root) throw new Error("回归入口不存在");
createRoot(root).render(<Fixture />);
