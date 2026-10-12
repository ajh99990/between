// 用户已确认的默认值；后端仍须显式启用。
export const DEFAULT_PLAN_MODEL = 'gpt-6.1-sol';
export const DEFAULT_PLAN_REASONING = 'medium';
export const PLAN_REASONING_EFFORTS = Object.freeze(['medium', 'high']);
export const validReasoningEffort = value => PLAN_REASONING_EFFORTS.includes(value);
