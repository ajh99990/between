import { roles } from '../../apps/server/roles.mjs';
import { createRequest } from './maibot/adapter.mjs';
import { createMessages, verifyOriginals } from './xiyu/adapter.mjs';

// Markers select a trusted local adapter. They are removed before model transport.
// They are not prompts, and none of the upstream prompt prose is rewritten here.
const marker = id => `BETWEEN_LOCAL_COMPARISON_PROFILE_${id}`;
const emptyRole = (id, name, tag) => ({
  id, name, tag, description: tag, icon: '', system: marker(id), detail: '',
  greeting: '', examples: '', persona: '用户', personality: '', scenario: '',
  postHistory: '', world: '', keys: [], bookIds: [],
});
export const profiles = [
  { id: 'between', label: '当前内置米拉', role: { ...structuredClone(roles[0]), bookIds: ['mira-world'] } },
  { id: 'maibot', label: 'MaiBot · Replyer 原文', marker: marker('maibot'),
    role: emptyRole('maibot', '麦麦', 'MaiBot · Replyer 原文') },
  { id: 'xiyu', label: '溪语 · 主提示词原文', marker: marker('xiyu'),
    role: emptyRole('xiyu', '溪语', '溪语 · 主提示词原文') },
];

export async function verifySources() {
  await verifyOriginals();
  // MaiBot checks every original and derived default hash on each render.
  createRequest({ input: '校验', now: '2026-10-19T12:00:00' });
}

export function compileRequest(request, now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T') + '+08:00') {
  const selected = profiles.filter(p => p.marker && request.messages.some(m =>
    m.role === 'system' && typeof m.content === 'string' && m.content.includes(p.marker)));
  if (selected.length > 1) throw new Error('Ambiguous comparison profile');
  if (!selected.length) return {
    id: 'between', messages: request.messages,
    metadata: { scope: 'current built-in Mira through unchanged role-engine core',
      authoredPromptGlue: [], outputProcessing: 'none' },
  };
  // These experiment roles have no example dialogue, greeting, WI or other prose.
  // Discard the host's system glue; upstream receives only visible chat history.
  const history = request.messages.filter(m => ['user', 'assistant'].includes(m.role)
    && typeof m.content === 'string' && m.content.length > 0).map(({ role, content }) => ({ role, content }));
  const last = history.pop();
  if (last?.role !== 'user') throw new Error('Expected the actual latest user message');
  const profile = selected[0];
  if (profile.id === 'maibot') {
    const original = createRequest({ history, input: last.content, userName: '用户', now,
      replyStyle: '正常回复', replyReference: '' });
    return { id: profile.id, messages: original.messages,
      metadata: { ...original.provenance, glue: original.glue } };
  }
  const original = createMessages({ history, input: last.content });
  return { id: profile.id, messages: original.messages,
    metadata: { ...original.metadata, originalSampling: original.parameters } };
}

export const inputs = Object.freeze([
  '刚下班，地铁上人好多。',
  '今天老板又临时加了点活，晚饭还没吃。',
  '你吃了吗？',
  '我懒得做饭了，家里就俩鸡蛋和半包挂面。',
  '行',
  '我刚才打错了，是三个鸡蛋。',
  '你今天在忙啥？',
  '我其实不太想听建议，就想吐槽两句。',
  '同事把他没做完的活说成是我拖着，我当时愣住了。',
  '算了，不想提他了。你最近有没有什么小事挺开心的？',
  '哈哈这有什么好开心的',
  '没有嘲笑你的意思，我今天说话有点冲。',
  '我妈又催我相亲，我现在一想到周末回家就烦。',
  '你别老顺着我，你真觉得我一点问题都没有？',
  '有点困了，先不聊了。',
]);
