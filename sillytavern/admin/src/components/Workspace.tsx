import { ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useModel, useLocation } from '@umijs/max';
import { Alert, Button, Skeleton } from 'antd';
import type { ReactNode } from 'react';
const chapters:Record<string,string>={roles:'01 / CHARACTER STUDIO',books:'02 / WORLD ARCHIVE',models:'03 / MODEL CONTROL',sessions:'04 / CONVERSATION FLOW',users:'05 / ACCESS CONTROL',resources:'06 / DISCOVERY LAB'};
export function Workspace({title,description,children,extra}:{title:string;description:string;children:ReactNode;extra?:ReactNode}){
 const {data,reload,busy,error,notice}=useModel('admin');const {pathname}=useLocation();
 return <PageContainer header={{title:false,breadcrumb:undefined}} className="prism-workspace"><main id="workspace-main" tabIndex={-1}><div className="page-heading"><div><div className="eyebrow">{chapters[pathname.split('/')[1]]}<span className="version-chip">{data?`CONFIG / ${String(data.config.version).padStart(2,'0')}`:'LOADING'}</span></div><h1 id="workspace-title" tabIndex={-1}>{title}</h1><p>{description}</p></div><div className="page-actions"><Button icon={<ReloadOutlined aria-hidden/>} loading={busy} onClick={()=>void reload().catch(()=>{})}>刷新状态</Button>{extra}</div></div>{error&&<Alert className="feedback" type="error" title={error} showIcon/>}{notice&&<Alert className="feedback" role="status" type="success" title={notice} showIcon/>}{!data?<div className="glass-panel loading-panel"><Skeleton active paragraph={{rows:7}}/></div>:<div className="page-content">{children}</div>}</main><footer className="studio-footer"><span>BETWEEN / IMAGINE. DEFINE. CONNECT.</span><span>本机工作室 · 配置按需刷新</span></footer></PageContainer>;
}
export function ScopeNote(){return <p className="scope-note">角色、世界书与预设用于之后创建的新会话，已有会话保留创建时的设定。</p>}
export function Metric({label,value,detail}:{label:string;value:ReactNode;detail:string}){return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
export function date(value:string){return new Date(value).toLocaleString('zh-CN',{hour12:false})}
export function Orbit({small=false}:{small?:boolean}){return <div className={`orbit-scene ${small?'orbit-small':''}`} aria-hidden="true"><div className="orbit-grid"/><div className="orbital-ring ring-one"/><div className="orbital-ring ring-two"/><div className="orbital-ring ring-three"/><div className="prism-core"><i/><i/><i/></div><span className="orbit-spark spark-one"/><span className="orbit-spark spark-two"/><span className="orbit-coordinate">PERSONA / WORLD / MEMORY</span></div>}
