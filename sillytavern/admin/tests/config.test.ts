import { describe, expect, it } from 'vitest';
import { newBook, newRole, removeBook, replaceBook, replaceRole } from '../src/services/config';
import type { Config } from '../src/services/types';
const config: Config = { version: 7, roles: [{...newRole(), id:'a',name:'角色',bookIds:['b'],source:{id:'x',repository:'https://example.invalid',commit:'fixture',license:'fixture',attribution:'fictional',adaptation:'fixture'}}], books: [{...newBook(),id:'b',name:'书',content:'完整正文'}], preset:{context:8192,maxTokens:512,temperature:.7,pinExamples:false,postHistory:''},acceptNew:true,paused:false,model:null,planBackend:{enabled:false,model:'fixture',reasoningEffort:'medium'} };
describe('配置编辑保持边界',()=>{
 it('角色编辑保留归因、完整内容和原始版本，不修改输入',()=>{const original=structuredClone(config);const result=replaceRole(config,{...config.roles[0],detail:'长内容'.repeat(2000)});expect(result.version).toBe(7);expect(result.roles[0].source).toEqual(config.roles[0].source);expect(result.roles[0].detail).toHaveLength(6000);expect(config).toEqual(original)});
 it('书籍编辑保持其他资源及未知条目字段',()=>{const entries=[{uid:7,key:[],keysecondary:[],content:'尾部完整内容',constant:false,selective:false,useProbability:false,disable:false,selectiveLogic:0,probability:100,order:100,position:0,sticky:4,custom:'保留'}];const result=replaceBook(config,{...config.books[0],entries});expect(result.books[0].entries).toEqual(entries);expect(result.roles).toEqual(config.roles);expect(result.version).toBe(7)});
 it('移除书籍只解除对应绑定，不删除角色与输入',()=>{const result=removeBook(config,'b');expect(result.books).toEqual([]);expect(result.roles[0].bookIds).toEqual([]);expect(config.roles[0].bookIds).toEqual(['b']);expect(result.roles[0].source).toEqual(config.roles[0].source)});
 it('新增资源使用唯一身份并保留既有资源',()=>{const role=newRole();expect(role.id).not.toBe(newRole().id);expect(replaceRole(config,role).roles).toHaveLength(2);const book=newBook();expect(replaceBook(config,book).books).toHaveLength(2)});
});
