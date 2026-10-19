import { useMemo, useState } from "react";
import { Badge, Button, Checkbox, Input, Panel, Toast } from "../src/components/controls";
import {
  CollectionList,
  DocumentReader,
  HighlightText,
  LongTextEditor,
  SplitPane,
} from "../src/components/documents";
import { Icon } from "../src/icons";

const DOCUMENTS = [
  {
    id: "harbor",
    title: "雨后港口的公共阅读室",
    description: "空间档案 · 场地与活动安排",
    body: "阅读室在旧港口东侧，一扇窄门通向临水的长廊。雨停后，工作人员会先把走廊的木椅擦干，再将门口的伞架移到屋檐下。\n\n上午的阅读时间不安排扩音活动。来访者可以自由取阅书架上的书，也可以把正在阅读的书留在服务台，次日继续。长桌靠窗的一侧留给需要充电的读者，另一侧保持空置，方便轮椅通行。\n\n风大的下午，应关闭长廊尽头的玻璃门。门旁的便签只记录需要交接的事项，不留下来访者的联系方式或私人留言。",
    notes:
      "开放时间：周二至周日 09:00—18:00。\n活动申请请提前三天提交；夜间活动需要额外确认照明与人员安排。\n\n发现书页破损时，将书放入修补篮并记录页码，不直接在原书上贴胶带。",
  },
  {
    id: "garden",
    title: "屋顶花园的季节观察与共同维护约定",
    description: "维护记录 · 本月巡查",
    body: "花园分为耐旱植物、香草与季节花卉三个区域。巡查时先观察叶面、排水口与土壤状态，再决定是否浇水。阴雨天不按固定日程补水。\n\n本月发现西侧花箱的排水较慢。维护前先拍照并记下位置，确认排水层是否堵塞，再处理表面的积水。不要一次搬动整个花箱，以免损伤根系或影响屋面。\n\n日落后的照明保持低亮度。小径灯只照向地面，不照入相邻住户的窗户。聚会结束后，应将活动桌椅归位，留出连续、可通行的道路。",
    notes:
      "本周关注：西侧花箱排水、北侧防风网、两处小径灯。\n\n需要补充的材料统一记录后采购，不由每位志愿者各自临时购买。",
  },
  {
    id: "archive",
    title: "地方声音档案：采集、整理与开放使用",
    description: "档案规范 · 资料整理",
    body: "声音档案以街区日常生活为主题，优先采集公共环境声。录制前检查场所是否允许录音；涉及清晰的人声和可识别身份时，必须先获得相关人员同意。\n\n每份录音应同时记录时间、地点、设备和简要情境。情境说明采用中性描述，区分实际听到的声音与采集者的推测。不要把未经核实的推测写成确定事实。\n\n原始文件保持不变。降噪、裁切与音量调整另存为工作版本，并在说明中记录处理方法。开放使用的版本应移除私人谈话及可能暴露身份的信息。",
    notes:
      "目录结构：原始录音、工作版本、使用许可、文字记录。\n\n开放前由两人共同复核。发现授权范围不清楚时，先暂停公开并补充确认。",
  },
];

export function DocumentsDemo() {
  const [selectedId, setSelectedId] = useState(DOCUMENTS[0].id);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: string } | null>(null);
  const document = DOCUMENTS.find((item) => item.id === selectedId) || DOCUMENTS[0];
  const storedBody = saved[document.id] ?? document.body;
  const draft = drafts[document.id] ?? storedBody;
  const dirty = draft !== storedBody;
  const visible = useMemo(() => {
    const keyword = filter.toLocaleLowerCase();
    return DOCUMENTS.filter((item) =>
      `${item.title}\n${item.body}\n${item.notes}`.toLocaleLowerCase().includes(keyword),
    );
  }, [filter]);

  return (
    <div className="bt-documents-demo">
      <Panel>
        <div className="bt-documents-demo-heading">
          <div>
            <h2>文档与长文编辑</h2>
            <p className="bt-field-description">
              检索完整正文，切换文档保留草稿；分栏可拖动，也可聚焦分隔线后用方向键调整。
            </p>
          </div>
          <Checkbox label="只读编辑区" checked={readOnly} onChange={setReadOnly} />
        </div>
        <SplitPane
          label="资料阅读与编辑"
          sidebarLabel="资料列表"
          minSidebarWidth={200}
          defaultSidebarWidth={240}
          sidebar={
            <CollectionList
              label="资料列表"
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setEditing(false);
              }}
              header={
                <Input
                  type="search"
                  aria-label="查找资料"
                  placeholder="搜索名称与全文"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              }
              items={visible.map((item) => ({
                id: item.id,
                title: <HighlightText text={item.title} query={filter} />,
                description: item.description,
                icon: <Icon name="book" size={20} />,
                meta:
                  drafts[item.id] !== undefined && drafts[item.id] !== (saved[item.id] ?? item.body)
                    ? "有未保存草稿"
                    : "2 个章节",
              }))}
              footer="示例内容只在当前页面内存中保存。刷新后恢复初始内容。"
            />
          }
        >
          <div className="bt-documents-demo-heading">
            <div>
              <h3>{document.title}</h3>
              <p className="bt-field-description">{document.description}</p>
            </div>
            <div className="bt-actions">
              {dirty && <Badge tone="warning">未保存</Badge>}
              <Button onClick={() => setEditing(!editing)}>{editing ? "返回阅读" : "编辑正文"}</Button>
            </div>
          </div>
          {editing ? (
            <LongTextEditor
              key={document.id}
              label="资料正文"
              value={draft}
              readOnly={readOnly}
              rows={14}
              onChange={(value) => setDrafts((current) => ({ ...current, [document.id]: value }))}
              description="保持段落与换行；展开编辑时不重新创建输入框。"
              toolbar={
                <Button
                  variant="primary"
                  disabled={!dirty || readOnly}
                  onClick={() => {
                    setSaved((current) => ({ ...current, [document.id]: draft }));
                    setFeedback({ message: "已保存到本页", tone: "success" });
                  }}
                >
                  保存到本页
                </Button>
              }
            />
          ) : (
            <DocumentReader
              label="资料正文阅读"
              query={query}
              onQueryChange={setQuery}
              searchLabel="在此资料中查找"
              outlineLabel="资料章节目录"
              sections={[
                {
                  id: "body",
                  title: "正文",
                  content: storedBody,
                  meta: `${storedBody.length.toLocaleString()} 字符`,
                  footer: (
                    <details>
                      <summary>记录属性</summary>
                      <pre>
                        {JSON.stringify({ category: "公共资料", language: "zh-CN", revision: 1 }, null, 2)}
                      </pre>
                    </details>
                  ),
                },
                { id: "handoff", title: "补充与交接", content: document.notes },
              ]}
            />
          )}
        </SplitPane>
      </Panel>
      <Toast feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}
