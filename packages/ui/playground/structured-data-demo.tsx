import { useState } from "react";
import { Button, Checkbox, Panel } from "../src/components/controls";
import { DiffViewer, JSONEditor, JSONViewer } from "../src/components/structured-data";

const jsonSample =
  '{"name":"资料维护","budget":900719925474099312345,"enabled":true,"unknown":{"retained":"\\u4e2d\\u6587","ratio":1e-999},"sections":["正文","触发条件","扩展配置"]}';
const beforeText = "雨落在回廊上。\n\n先核对访谈记录，再整理交接清单。\n未确认的事项保留原始注释。";
const afterText = "雨落在回廊上。\n\n先核对访谈记录，再整理交接清单。\n把待确认事项交给下一班复核。\n";

export function StructuredDataDemo() {
  const [source, setSource] = useState(jsonSample);
  const [copyFailure, setCopyFailure] = useState(false);
  const [newlineOnly, setNewlineOnly] = useState(false);
  const copy = copyFailure
    ? async () => {
        throw new Error("playground clipboard failure");
      }
    : undefined;
  return (
    <div className="bt-structured-demo">
      <Panel>
        <div className="bt-structured-toolbar">
          <h2>JSON 编辑与阅读</h2>
          <div className="bt-structured-actions">
            <Button size="sm" onClick={() => setSource('{\n  "mode": "quiet",\n  "mode": "active"\n}')}>
              载入重复键
            </Button>
            <Button size="sm" onClick={() => setSource('{\n  "name": "资料",\n  "broken": }')}>
              载入语法错误
            </Button>
            <Button size="sm" onClick={() => setSource(jsonSample)}>
              恢复 JSON 示例
            </Button>
          </div>
        </div>
        <Checkbox label="复制失败" checked={copyFailure} onChange={setCopyFailure} />
        <JSONEditor label="扩展配置 JSON" value={source} onChange={setSource} minRows={10} onCopy={copy} />
        <JSONViewer label="原始配置" text={source} onCopy={copy} maxHeight={340} />
      </Panel>
      <Panel>
        <div className="bt-structured-toolbar">
          <h2>纯文本差异</h2>
          <Checkbox label="只改变结尾换行" checked={newlineOnly} onChange={setNewlineOnly} />
        </div>
        <DiffViewer
          label="配置正文差异"
          before={beforeText}
          after={newlineOnly ? `${beforeText}\n` : afterText}
          beforeLabel="已保存正文"
          afterLabel="当前草稿"
        />
      </Panel>
    </div>
  );
}
