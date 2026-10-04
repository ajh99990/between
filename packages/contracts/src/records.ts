export type Controls = { memory: 'on'|'off'; role: 'active'|'paused'; direction: 'unspecified'|'friends'; nickname: string; nicknameState: 'none'|'allowed'|'suspended'; revision: number; epoch: number; started: boolean };
export type Message = { id:string; role:'user'|'character'; text:string; status:string; at:number; turn_order?:number };
export type Turn = { id:string; token:string; source:string; revision:number; epoch:number; text:string; memory:boolean };
