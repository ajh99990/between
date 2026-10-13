import { App, Button, Drawer } from 'antd';
import { AppstoreOutlined, BookOutlined, ControlOutlined, MessageOutlined, TeamOutlined, ExperimentOutlined, LogoutOutlined, ExportOutlined, MenuOutlined } from '@ant-design/icons';
import { Link, useLocation } from '@umijs/max';
import { useEffect, useState } from 'react';
import { logout } from '@/services/admin';
const links=[['/roles','角色库',AppstoreOutlined],['/books','世界书',BookOutlined],['/models','模型与提示词',ControlOutlined],['/sessions','会话与任务',MessageOutlined],['/users','用户与全局',TeamOutlined],['/resources','素材与诊断',ExperimentOutlined]] as const;
export function PrismHeader(){
 const {pathname}=useLocation();const [open,setOpen]=useState(false);const {modal,message}=App.useApp();
 useEffect(()=>{setOpen(false);document.getElementById('workspace-title')?.focus({preventScroll:true});},[pathname]);
 const nav=<nav className="prism-navigation" aria-label="管理导航">{links.map(([path,label,Icon])=><Link key={path} to={path} aria-current={pathname.startsWith(path)?'page':undefined}><Icon aria-hidden/><span>{label}</span></Link>)}</nav>;
 return <><a className="skip-link" href="#workspace-main">跳到主要内容</a><header className="prism-header"><Link className="brand" to="/roles" aria-label="Between 角色工作室"><img src="/admin/logo.svg" width="36" height="36" alt=""/><span>between<span className="brand-caption">CHARACTER STUDIO</span></span></Link><div className="desktop-navigation">{nav}</div><div className="account-tools"><a href="/" target="_blank" rel="noreferrer" className="chat-link"><ExportOutlined aria-hidden/><span>打开聊天</span></a><Button type="text" aria-label="退出" icon={<LogoutOutlined aria-hidden/>} onClick={()=>modal.confirm({title:'退出管理控制台？',content:'已保存的配置会保留。',okText:'退出登录',cancelText:'取消',onOk:async()=>{try{await logout();window.location.reload()}catch(e){message.error((e as Error).message)}}})}/><Button className="mobile-menu" aria-label="打开导航" icon={<MenuOutlined aria-hidden/>} onClick={()=>setOpen(true)}/></div></header><Drawer title="工作室导航" open={open} onClose={()=>setOpen(false)} placement="top" height="auto">{nav}</Drawer></>;
}
