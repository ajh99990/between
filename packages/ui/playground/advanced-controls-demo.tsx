import { useState } from "react";
import { MultiSelect, NumberField, Slider, TagInput } from "../src/components/advanced-controls";
import { Button, Checkbox, ErrorNotice, Field, Panel } from "../src/components/controls";

const options = [
  { value: "harbor", label: "港湾与来信" },
  { value: "garden", label: "雨后的花园" },
  { value: "archive", label: "旧档案馆与漫长旅途中尚未整理完毕的线索" },
  { value: "workshop", label: "山间工坊" },
  { value: "unavailable", label: "暂不可选的集合", disabled: true },
];

/** Isolated memory example: the caller owns all values and the failed-save
 * switch. It makes no request and never writes application storage.
 */
export function AdvancedControlsDemo({
  disabled = false,
  error = false,
  long = false,
}: {
  disabled?: boolean;
  error?: boolean;
  long?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(["harbor"]);
  const [tags, setTags] = useState<string[]>(["雨后 港口", "未寄出的信"]);
  const [temperature, setTemperature] = useState<number | null>(0.7);
  const [limit, setLimit] = useState<number | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [failure, setFailure] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingTag, setPendingTag] = useState("");
  return (
    <div className="bt-advanced-controls-demo">
      <Panel>
        <h2>多项选择与关键词</h2>
        <div className="bt-advanced-controls-grid">
          <Field
            label="关联集合"
            description="可以搜索并连续选择；已选内容保留在输入框中。"
            error={error ? "请至少保留一个可用集合。" : undefined}
          >
            <MultiSelect
              label="关联集合"
              name="collections"
              value={selected}
              options={options}
              onChange={(value) => {
                setSelected(value);
                setSaved(false);
              }}
              required
              disabled={disabled}
            />
          </Field>
          <Field
            label="触发词"
            description="一个词组可以包含空格与标点。点击词组可修改，粘贴不会自动拆分。"
            error={error ? "请检查关键词是否重复。" : undefined}
          >
            <TagInput
              label="触发词"
              name="keywords"
              value={tags}
              onDraftChange={setPendingTag}
              onChange={(value) => {
                setTags(value);
                setSaved(false);
              }}
              required
              disabled={disabled}
              placeholder={long ? "输入包含空格和标点的完整中文词组后按 Enter" : undefined}
            />
          </Field>
          <Field label="只读集合">
            <MultiSelect
              label="只读集合"
              value={["harbor", "archive"]}
              options={options}
              onChange={() => undefined}
              readOnly
            />
          </Field>
          <Field label="无可选项">
            <MultiSelect
              label="无可选项"
              value={[]}
              options={[]}
              onChange={() => undefined}
              disabled={disabled}
              emptyText="尚未添加可选集合"
            />
          </Field>
          <Field label="保留不可用已选项" description="选项列表更新后，不会自动丢弃此前已选的值。">
            <MultiSelect
              label="保留不可用已选项"
              value={["retired-collection", "harbor"]}
              options={options}
              onChange={() => undefined}
              readOnly
            />
          </Field>
        </div>
      </Panel>
      <Panel>
        <h2>精确数值与滑块</h2>
        <div className="bt-demo-numeric-pair">
          <Slider
            label="采样温度"
            value={temperature ?? 0}
            min={0}
            max={2}
            step={0.1}
            onChange={(value) => {
              setTemperature(value);
              setSaved(false);
            }}
            disabled={disabled}
            formatValue={(value) => value.toFixed(1)}
          />
          <Field label="精确输入" error={error ? "请输入 0 到 2。" : undefined}>
            <NumberField
              label="精确输入"
              value={temperature}
              onChange={(value) => {
                setTemperature(value);
                setSaved(false);
              }}
              min={0}
              max={2}
              step={0.1}
              disabled={disabled}
              required
            />
          </Field>
        </div>
        <Field
          label="可选条数上限"
          description="留空表示未指定；不会自动改成 0。"
          error={error ? "请输入 0 到 1000 的整数。" : undefined}
        >
          <NumberField
            label="可选条数上限"
            value={limit}
            onChange={(value) => {
              setLimit(value);
              setSaved(false);
            }}
            min={0}
            max={1000}
            step={1}
            disabled={disabled}
            placeholder="未指定"
          />
        </Field>
      </Panel>
      <Panel>
        <h2>保存与恢复</h2>
        <p className="bt-demo-note">仅在本页内存中演示，不连接后台。失败后保留上述选择与输入。</p>
        <Checkbox label="下一次保存失败" checked={failNext} onChange={setFailNext} disabled={disabled} />
        {pendingTag && <p className="bt-demo-note">待添加：{pendingTag}</p>}
        {failure && <ErrorNotice>本次未保存，请保留当前内容后重试。</ErrorNotice>}
        <div className="bt-actions">
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => {
              if (failNext) {
                setFailNext(false);
                setFailure(true);
                setSaved(false);
              } else {
                setFailure(false);
                setSaved(true);
              }
            }}
          >
            {failure ? "重试保存" : "保存本页配置"}
          </Button>
          {saved && (
            <span role="status" className="bt-demo-note">
              已保留在本页
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}
