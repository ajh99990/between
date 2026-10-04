import type {ObservationAttributes} from './normalize.js';
export type ObservationRecord=Readonly<{execution_id:string;event_id:string;sequence:number;attributes:Readonly<ObservationAttributes>}>;
export type ObservationResult='accepted'|'dropped'|'disabled';
/** A synchronous bounded handoff only; network flush must be owned by the OTel SDK/collector. */
export interface ObservationSink {emit(event:ObservationRecord):ObservationResult}
export const disabledObservationSink:ObservationSink={emit:()=> 'disabled'};
