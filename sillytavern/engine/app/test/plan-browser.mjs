import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=await fs.mkdtemp('/tmp/between-plan-browser-');let app,browser;
try{
 app=await createApp({root,port:0,demo:true,adminPassword:'synthetic-plan-admin'});
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(app.url))external.push(r.url())});page.on('dialog',d=>d.accept());
 await page.goto(app.url+'/admin');await page.locator('#password').fill('synthetic-plan-admin');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'提示词与模型',exact:true}).click();
 assert.ok(!(await page.getByLabel('显式启用套餐后端').isChecked()));
 await page.getByLabel('显式启用套餐后端').check();await page.getByLabel('套餐模型名称').fill('synthetic-model');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/plan')&&r.request().method()==='PUT'),page.getByRole('button',{name:'保存套餐后端',exact:true}).click()]);
 await page.waitForFunction(()=>document.querySelector('input[type=checkbox]')!==null);
 assert.ok(await page.getByRole('button',{name:'Continue with ChatGPT（在本机授权助手中继续）',exact:true}).isDisabled());
 await page.goto(app.url);await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('尚未授权'));
 await page.locator('#roles button').first().click();await page.getByRole('button',{name:'进入对话',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('title').textContent==='米拉'&&document.querySelectorAll('.message').length>0);assert.ok(await page.locator('#send').isDisabled());
 await page.screenshot({path:new URL('../evidence/plan-shared-unbound.png',import.meta.url).pathname,fullPage:true});
 await page.goto(app.url+'/admin');await page.getByRole('button',{name:'提示词与模型',exact:true}).click();await page.getByLabel('显式启用套餐后端').uncheck();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/plan')&&r.request().method()==='PUT'),page.getByRole('button',{name:'保存套餐后端',exact:true}).click()]);
 await page.goto(app.url);await page.waitForFunction(()=>!document.getElementById('send').disabled);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',sandbox:true,checks:['管理员显式启用共享套餐后端','未授权状态明确','登录按钮不启动OAuth','无授权禁止发送','管理员可显式切回原连接','无外部请求','无浏览器异常'],externalRequests:external,browserErrors:errors},null,2));
}finally{await browser?.close();await app?.close();await fs.rm(root,{recursive:true,force:true})}
