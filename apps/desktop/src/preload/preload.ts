import {RUNTIME_PROTOCOL_VERSION} from '@between/contracts/protocol-version';
import {contextBridge,ipcRenderer} from 'electron';
// Exact methods only. No channel names, filesystem paths or command strings.
contextBridge.exposeInMainWorld('relationship',{
 snapshot:()=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'snapshot'}),
 planDeletion:(conversation_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'plan_deletion',conversation_id,kind:'whole_relationship'}),
 confirmDeletion:(conversation_id:string,plan_id:string,digest:string,confirmation_token:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'confirm_deletion',conversation_id,plan_id,digest,confirmation_token,confirmation:'confirm_delete_this_relationship'}),
 cancelDeletion:(conversation_id:string,plan_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'cancel_deletion',conversation_id,plan_id}),
 resumeDeletion:(conversation_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'resume_deletion',conversation_id}),
 start:(eligible:boolean,accepted:boolean,memory:boolean)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'start',eligible,accepted,memory}),
 send:(conversation_id:string,turn_id:string,text:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'send',conversation_id,turn_id,text}),
 ack:(conversation_id:string,turn_id:string,message_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'ack',conversation_id,turn_id,message_id}),
 cancel:(conversation_id:string,turn_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'cancel',conversation_id,turn_id}),
 retry:(conversation_id:string,turn_id:string)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'retry',conversation_id,turn_id}),
 control:(conversation_id:string,changes:unknown)=>ipcRenderer.invoke('relationship',{schema_version:RUNTIME_PROTOCOL_VERSION,action:'control',conversation_id,changes}),
 window:(action:string)=>ipcRenderer.invoke('window-action',action)
});
