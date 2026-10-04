import {z} from 'zod';
import {RUNTIME_PROTOCOL_VERSION} from './protocol-version.js';
const id=z.string().uuid();
export const requestSchema=z.discriminatedUnion('action',[
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('snapshot')}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('plan_deletion'),conversation_id:z.string(),kind:z.literal('whole_relationship')}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('confirm_deletion'),conversation_id:z.string(),plan_id:id,digest:z.string().regex(/^[a-f0-9]{64}$/),confirmation_token:z.string().min(64).max(128),confirmation:z.literal('confirm_delete_this_relationship')}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('cancel_deletion'),conversation_id:z.string(),plan_id:id}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('resume_deletion'),conversation_id:z.string()}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('start'),eligible:z.boolean(),accepted:z.boolean(),memory:z.boolean()}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('send'),conversation_id:z.string().min(1).max(128),turn_id:id,text:z.string().min(1).max(8000)}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('ack'),conversation_id:z.string(),turn_id:id,message_id:id}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('cancel'),conversation_id:z.string(),turn_id:id}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('retry'),conversation_id:z.string(),turn_id:id}).strict(),
 z.object({schema_version:z.literal(RUNTIME_PROTOCOL_VERSION),id,action:z.literal('control'),conversation_id:z.string(),changes:z.object({memory:z.enum(['on','off']).optional(),role:z.enum(['active','paused']).optional(),nicknameState:z.literal('suspended').optional(),direction:z.literal('friends').optional()}).strict()}).strict()
]);
export const schema_version=RUNTIME_PROTOCOL_VERSION;
export type RuntimeRequest=z.infer<typeof requestSchema>;
