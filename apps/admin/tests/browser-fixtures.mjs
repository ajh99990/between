import { roles as bundledRoles, snapshot } from '../../server/roles.mjs';

// Fictional, disposable data only. Nothing here reads user data or credentials.
export const syntheticPassword = 'synthetic-admin-new-qa-password';
export const forbiddenServicePorts = new Set(['8787', '8766', '59720']);
export const roleFields = [
  ['description', '公开简介'], ['detail', '角色设定'], ['personality', '性格'],
  ['scenario', '场景'], ['greeting', '开场白'], ['examples', '示例对话'],
  ['system', '系统提示词'], ['persona', '用户人设'], ['postHistory', '历史后指令'],
  ['creatorNotes', '作者说明'], ['world', '原始世界设定'],
];
export const unknownFields = { schemaFromFuture: 7, opaque: { keep: [false, 0, null, '', { label: '虚构扩展必须保留' }] } };
export const syntheticSource = {
  id: 'synthetic-new-admin-fixture', repository: 'https://example.invalid/fictional-fixture',
  commit: 'synthetic-fixture-revision', license: 'CC0-1.0', attribution: '虚构验收作者',
  adaptation: '仅用于隔离自动测试，不代表真实外部素材', unknownProvenance: { keep: true },
};
export const longText = (key, revision = 'original') => `虚构_${key}_${revision}_起点\n${'这是一段用于检验完整阅读和换行保留的虚构内容。'.repeat(55)}\n虚构_${key}_${revision}_尾部`;
export const entry = (uid, extra = {}) => ({
  uid, comment: `虚构条目 ${uid}`, key: ['灯塔'], keysecondary: ['为什么'],
  content: longText(`entry_${uid}`), constant: false, selective: true, selectiveLogic: 0,
  order: 100 - uid, position: 0, disable: false, useProbability: true, probability: 80,
  depth: 2, role: 0, scanDepth: 4, caseSensitive: false, matchWholeWords: false,
  ignoreBudget: false, excludeRecursion: false, preventRecursion: false, delayUntilRecursion: 0,
  group: '', groupOverride: false, groupWeight: 100, useGroupScoring: false,
  sticky: 2, cooldown: 3, delay: 0, displayIndex: uid, triggers: [],
  extensions: { fictional_raw_extension: { keep: true } }, qaEntryExtension: structuredClone(unknownFields),
  ...extra,
});

export function initialConfig() {
  const roles = bundledRoles.map(role => ({
    ...structuredClone(role), examples: snapshot(role).character.mes_example,
    personality: '虚构性格。', scenario: '虚构场景。', postHistory: '虚构历史后指令。', creatorNotes: '虚构作者说明。',
    bookIds: [`${role.id}-world`], source: structuredClone(syntheticSource), qaRoleExtension: structuredClone(unknownFields),
  }));
  for (const [key] of roleFields) roles[0][key] = longText(key);
  roles[0].bookIds.push('synthetic-entries');
  return {
    version: 1, roles,
    books: [
      ...roles.map(role => ({ id: `${role.id}-world`, name: `${role.name}的虚构世界`, keys: ['灯塔'], content: longText(`${role.id}_simple`), source: structuredClone(syntheticSource), qaBookExtension: structuredClone(unknownFields) })),
      { id: 'synthetic-entries', name: '虚构多条目世界书', keys: [], content: '', entries: [entry(0), entry(1, { selective: false }), entry(2)], source: structuredClone(syntheticSource), qaBookExtension: structuredClone(unknownFields) },
    ],
    preset: { context: 32000, maxTokens: 512, temperature: 0.7, pinExamples: false, postHistory: '虚构全局指令。', qaPresetExtension: structuredClone(unknownFields) },
    acceptNew: true, paused: false, model: null,
    planBackend: { enabled: false, model: 'synthetic-plan-model', reasoningEffort: 'medium' },
    qaConfigExtension: structuredClone(unknownFields),
  };
}

export function fictionalPlanProvider() {
  const calls = { status: 0, generate: 0, resume: 0, disconnect: 0 };
  let connection = 'usage_limit';
  return {
    calls,
    async status(_principal, model, reasoningEffort) {
      calls.status += 1;
      return { mode: 'chatgpt-plan', connection, model, reasoningEffort, canGenerate: false,
        description: '虚构套餐状态，未连接任何真实授权或模型。', authorization: 'required',
        capabilities: { imageInput: false, audioInput: false, voice: false, tts: false, image: false, caption: false } };
    },
    async generate() { calls.generate += 1; throw new Error('The automatic browser test must never generate through a plan backend'); },
    resume() { calls.resume += 1; connection = 'ready'; },
    disconnect() { calls.disconnect += 1; connection = 'disconnected'; },
  };
}
