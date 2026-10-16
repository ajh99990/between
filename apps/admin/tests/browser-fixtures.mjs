import { roles as bundledRoles, snapshot } from '../../server/roles.mjs';

// Every value in this file is fictional. No user configuration, credentials, or
// services are read by the browser acceptance harness.
export const syntheticPassword = 'synthetic-admin-qa-password';
export const forbiddenServicePorts = new Set(['8787', '8766', '59720']);
export const roleFieldKeys = [
  'description', 'detail', 'personality', 'scenario', 'greeting', 'examples',
  'system', 'persona', 'postHistory', 'creatorNotes', 'world',
];
export const unknownFields = {
  schemaFromFuture: 7,
  opaque: { keep: [false, 0, null, '', { label: '虚构扩展字段必须完整保留' }] },
};
export const syntheticSource = {
  id: 'synthetic-acceptance-fixture',
  repository: 'https://example.invalid/fictional-fixture',
  commit: 'synthetic-fixture-revision',
  license: 'CC0-1.0',
  attribution: '虚构验收作者',
  adaptation: '仅用于隔离浏览器测试，不代表外部素材',
  unknownProvenance: { keep: true },
};

export function initialConfig() {
  const roles = bundledRoles.map((role) => ({
    ...structuredClone(role),
    examples: snapshot(role).character.mes_example,
    personality: '耐心而具体的虚构人物。',
    scenario: '仅用于浏览器验收的场景。',
    postHistory: '这是一份虚构测试指令。',
    creatorNotes: '测试夹具，无个人数据。',
    bookIds: [`${role.id}-world`],
    source: structuredClone(syntheticSource),
    qaRoleExtension: structuredClone(unknownFields),
  }));
  return {
    version: 1,
    roles,
    books: roles.map((role) => ({
      id: `${role.id}-world`, name: `${role.name}的虚构世界`,
      keys: role.keys, content: role.world,
      source: structuredClone(syntheticSource),
      qaBookExtension: structuredClone(unknownFields),
    })),
    preset: {
      context: 8192, maxTokens: 512, temperature: 0.7,
      pinExamples: false, postHistory: '仅用于虚构测试。',
      qaPresetExtension: structuredClone(unknownFields),
    },
    acceptNew: true, paused: false, model: null,
    planBackend: { enabled: false, model: 'gpt-6.1-sol', reasoningEffort: 'medium' },
    qaConfigExtension: structuredClone(unknownFields),
  };
}

export function fictionalPlanProvider() {
  const calls = { status: 0, generate: 0, resume: 0, disconnect: 0 };
  return {
    calls,
    async status(_principal, model, reasoningEffort) {
      calls.status += 1;
      return {
        mode: 'chatgpt-plan', connection: 'unconfigured', canGenerate: false,
        description: '虚构离线套餐状态，未连接任何授权或模型。',
        model, reasoningEffort, credentialConfigured: false,
      };
    },
    async generate() {
      calls.generate += 1;
      throw new Error('Browser acceptance must never generate a model response');
    },
    resume() { calls.resume += 1; },
    disconnect() { calls.disconnect += 1; },
  };
}
