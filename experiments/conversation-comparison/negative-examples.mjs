import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

export const suiteId = 'negative-examples-v01';
export const scope = '18-turn same-persona comparison: base facts versus the exact negative-example v0.1 module; one run per group';
export const title = '普通中文聊天反面案例对照记录';
export const preset = { context: 32768, maxTokens: 1024, temperature: 0.7, pinExamples: false, postHistory: '' };
export const basePrompt = '你是周宁，27岁，住在杭州，在一家小公司做行政。你和对方是认识几个月的朋友。今天下班后你已经吃过饭，现在在家休息。这是你们的聊天，请回复对方新发来的消息。';
const promptUrl = new URL('./prompts/普通中文聊天反面案例-v0.1.md', import.meta.url);
const promptBytes = readFileSync(promptUrl);
export const negativePrompt = promptBytes.toString('utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const promptSha256 = hash(promptBytes);
const marker = id => `BETWEEN_LOCAL_NEGATIVE_CASE_PROFILE_${id}`;
const role = (id, name) => ({
  id, name, tag: name, description: name, icon: '', system: marker(id), detail: '',
  greeting: '', examples: '', persona: '用户', personality: '', scenario: '',
  postHistory: '', world: '', keys: [], bookIds: [],
});
export const profiles = [
  { id: 'plain-base', label: '周宁 · 基础设定', marker: marker('plain-base'), role: role('plain-base', '周宁 · 基础设定') },
  { id: 'plain-negative', label: '周宁 · 反面案例 v0.1', marker: marker('plain-negative'), role: role('plain-negative', '周宁 · 反面案例 v0.1') },
];

export async function verifySources() {
  if (!(await fs.readFile(promptUrl)).equals(promptBytes)) throw new Error('The candidate prompt changed after this suite was loaded');
  if (!negativePrompt.startsWith('# 普通中文聊天：反面案例\n') || !negativePrompt.includes('## N10：')) {
    throw new Error('Expected the complete negative-example v0.1 module');
  }
}

export function compileRequest(request) {
  const selected = profiles.filter(p => request.messages.some(m => m.role === 'system'
    && typeof m.content === 'string' && m.content.includes(p.marker)));
  if (selected.length !== 1) throw new Error('Missing or ambiguous negative-example profile');
  const profile = selected[0];
  const history = request.messages.filter(m => ['user', 'assistant'].includes(m.role)
    && typeof m.content === 'string' && m.content.length > 0).map(({ role, content }) => ({ role, content }));
  if (history.at(-1)?.role !== 'user') throw new Error('Expected the actual latest user message');
  const useNegative = profile.id === 'plain-negative';
  return {
    id: profile.id,
    messages: [{ role: 'system', content: basePrompt },
      ...(useNegative ? [{ role: 'system', content: negativePrompt }] : []), ...history],
    metadata: {
      suite: suiteId, basePrompt, basePromptSha256: hash(basePrompt),
      authoredPromptBlocks: useNegative ? [{ file: 'prompts/普通中文聊天反面案例-v0.1.md', sha256: promptSha256 }] : [],
      scope: 'Authored base persona; no upstream prompt, host world, examples, or post-history prose',
      outputProcessing: 'none',
    },
  };
}

export const inputs = Object.freeze([
  '今天在公司冻了一天，空调估计开到十八度了。',
  '中午那份盖饭也离谱，米饭夹生，肉就三小块。',
  '不过下午买饮料中了再来一瓶，没白跑。',
  '晚上就想开电脑打两局，别的懒得弄了。',
  '我刚下班，正在等公交。',
  '到小区门口了，今天这车倒挺快。',
  '顺路买了个烤肠，已经吃完了。',
  '我先坐沙发上玩会儿手机。',
  '嗯，先这样。',
  '我要下楼拿个东西，先不聊了。',
  '又来了。拿完东西回家，顺手翻到高中时的饭卡，照片丑得我不敢认。',
  '卡后面还有我同桌写的字。那阵我妈住院，她天天帮我带饭，后来我们就没怎么联系了。',
  '这周团建我不太想去，想找个借口在家躺着。',
  '有件事想让你帮我出出主意。同事总把当天快下班的活推给我，我明天想跟他说一下，怎么开口不至于吵起来？',
  '你展开说说吧，我怕他回一句“大家都忙”我就不知道怎么接了。最好举两个说法。',
  '唉，今天其实挺委屈的，忙半天还被说效率低。我现在不想分析了，你安慰我几句吧。',
  '说出来好一点了。刚才烤肠还挺香，就是我一口咬下去差点烫着。',
  '我关电脑了，今天就聊到这儿，晚安。',
]);
