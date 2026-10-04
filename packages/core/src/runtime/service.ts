import {RUNTIME_PROTOCOL_VERSION} from '@between/contracts/protocol-version';
import {requestSchema} from '@between/contracts/commands';
import {Store,ProductError} from '../store.js';
import {TurnCoordinator} from './turn-coordinator.js';
/** Only a trusted local channel may construct these requests. The model never owns this API. */
export class RuntimeService {
 private snapshotVersion=0;
 constructor(readonly store:Store,readonly coordinator:TurnCoordinator){}
 snapshot(){return {...this.coordinator.snapshot(),schema_version:RUNTIME_PROTOCOL_VERSION,snapshot_version:++this.snapshotVersion};}
 async handle(payload:unknown){const request=requestSchema.parse(payload);switch(request.action){
  case 'snapshot':return this.snapshot();
  case 'plan_deletion':return {plan:this.coordinator.planDeletion(request.conversation_id),...this.snapshot()};
  case 'confirm_deletion':this.coordinator.confirmDeletion(request.conversation_id,request.plan_id,request.digest,request.confirmation_token);return this.snapshot();
  case 'cancel_deletion':this.coordinator.cancelDeletion(request.conversation_id,request.plan_id);return this.snapshot();
  case 'resume_deletion':if(request.conversation_id!==this.store.scope)throw new ProductError('NOT_AUTHORIZED');this.coordinator.resumeDeletion();return this.snapshot();
  case 'start':this.store.start(request.eligible,request.accepted,request.memory);return this.snapshot();
  case 'send':{const receipt=this.coordinator.accept(request.conversation_id,request.turn_id,request.text);return {...this.snapshot(),receipt};}
  case 'ack':this.coordinator.ack(request.conversation_id,request.turn_id,request.message_id);return this.snapshot();
  case 'cancel':await this.coordinator.cancelTurn(request.conversation_id,request.turn_id);return this.snapshot();
  case 'retry':this.coordinator.retryTurn(request.conversation_id,request.turn_id);return this.snapshot();
  case 'control':this.coordinator.control(request.conversation_id,request.changes);return this.snapshot();
 }}
 async close(){await this.coordinator.close();}
}
