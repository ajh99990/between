/** Schema 6 quoted user reports. Active means eligible evidence, never independently
 * verified truth or an automatic claim that the described fact is still current. */
export const ADMISSION_VERSION='explicit-save-v1' as const;
export const REVISION_ADMISSION_VERSION='explicit-revision-v1' as const;
export type MemoryProposalKind='fact'|'preference'|'history';
export type StandingMemoryInput={quote:string;expected_version:number;operation_id:string};
export type ProposedMemoryInput=StandingMemoryInput&{proposed_kind:MemoryProposalKind};
export type ReviseMemoryInput={target_id:string;target_revision:number;mode:'correction'|'change';quote:string;replacement_quote:string;expected_version:number;operation_id:string};
export type MemoryRow={id:string;source:string;text:string;evidence_text:string;at:number;scope:string;revision:number;record_kind:'raw_quote'|'resident_quote'|'proposed_user_report';status:'active'|'invalid'|'superseded'|'needs_review';kind:'history'|'preference'|'fact';evidence_kind:'user_report';source_revision:number;projection_json:string|null;fact_key:string|null;admission_version:string|null;valid_from:number;valid_until:number|null;supersedes:string|null;source_order:number;source_at:number};
export type SelectedMemory={id:string;text:string;evidence_quote:string;source:string;revision:number;record_kind:MemoryRow['record_kind'];status:MemoryRow['status'];kind:MemoryRow['kind'];evidence_kind:'user_report';interpretation:'quoted_self_report_only';as_of:number;subject:null;object:null;condition:null;source_revision:number;valid_from:number;valid_until:number|null;supersedes:string|null;layer:'resident'|'retrieval'};
export type CandidateDescriptor=Readonly<{id:string;kind:MemoryRow['kind'];quote:string}>;
/** Disabled by default. Pure synchronous IDs-only seam, no external service.
 * Candidate descriptions are a bounded authorized subset, not all memory. */
export type CandidateRanker=(query:string,candidates:readonly CandidateDescriptor[])=>unknown;
export type MemoryOptions={candidateRanker?:CandidateRanker;memoryByteBudget?:number};
export const MEMORY_LIMIT=3,RESIDENT_LIMIT=2,MEMORY_BYTE_BUDGET=6144,RANKER_CANDIDATE_LIMIT=128;

/** The only first-version deterministic standing admission is an explicit save
 * request in the complete trusted input. Ordinary preferences remain a semantic
 * admission gap; no domain whitelist or host label pretends to solve it. */
export function admitStanding(source:string,quote:string):boolean {
  return quote===source&&quote.length<=500&&/^(?:请记住|记住)[：:]\s*\S[\s\S]*$/u.test(source.trim());
}
/** Literal, explicit old/new memory instruction. No meaning is inferred from a
 * shared category, recency, a keyword, or the host's choice of target ID alone. */
export function admitRevision(source:string,quote:string,replacement:string,mode:'correction'|'change',oldQuote:string):boolean {
  if(quote!==source||quote.length>500||!replacement||replacement.length>500||replacement===oldQuote||/[「」\n\r]/u.test(replacement+oldQuote))return false;
  const command=mode==='correction'?'更正记忆':'更新记忆';
  return source===`${command}：「${oldQuote}」为「${replacement}」`;
}
export function residentEligible(row:MemoryRow){return row.record_kind==='resident_quote'&&[ADMISSION_VERSION,REVISION_ADMISSION_VERSION].includes(row.admission_version as typeof ADMISSION_VERSION)&&row.status==='active';}
export function lexicalMatch(query:string,text:string):boolean {
  const q=query.normalize('NFC').trim().toLowerCase(),t=text.normalize('NFC').toLowerCase();
  if(q.length>=2&&t.includes(q))return true;
  const terms=q.match(/[\p{L}\p{N}]+/gu)||[];
  return terms.some(term=>term.length>=2&&t.includes(term));
}
/** Pure bounded ID merge. SQL supplies the rotated resident and lexical lists;
 * this helper has no database, promotion, timestamp or truth authority. */
export function chooseIds(residentIds:readonly string[],retrievalIds:readonly string[]):{id:string;layer:'resident'|'retrieval'}[]{
  const selected:{id:string;layer:'resident'|'retrieval'}[]=[];
  if(retrievalIds.length)selected.push({id:retrievalIds[0],layer:'retrieval'});
  for(const id of residentIds){if(selected.filter(r=>r.layer==='resident').length>=RESIDENT_LIMIT||selected.length>=MEMORY_LIMIT)break;if(!selected.some(r=>r.id===id))selected.push({id,layer:'resident'});}
  for(const id of retrievalIds){if(selected.length>=MEMORY_LIMIT)break;if(!selected.some(r=>r.id===id))selected.push({id,layer:'retrieval'});}
  return selected;
}
export function toSelected(row:MemoryRow,layer:SelectedMemory['layer']):SelectedMemory{return {id:row.id,text:row.text,evidence_quote:row.evidence_text,source:row.source,revision:row.revision,record_kind:row.record_kind,status:row.status,kind:row.kind,evidence_kind:'user_report',interpretation:'quoted_self_report_only',as_of:row.source_at,subject:null,object:null,condition:null,source_revision:row.source_revision,valid_from:row.valid_from,valid_until:row.valid_until,supersedes:row.supersedes,layer};}
