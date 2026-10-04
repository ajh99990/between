// Synthetic layout fixture only. Original text and geometric art; no imported screenshots.
// This content never enters Store, MCP or model history.
export function draw({contact,message,$}){
 $('title').textContent='布局示例';document.querySelector('.own').textContent='你';
 const contacts=[['示例甲','一条较长的示例消息，用于测试省略显示','14:06'],['布局示例','查看合成布局','14:01'],['示例乙','明天下午见','13:57'],['示例丙','今天阳光很好','13:52'],['示例丁','这是一条短消息','13:06']];
 contacts.forEach(([name,preview,time],i)=>contact({name,preview,time,active:i===1}));
 const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="150" viewBox="0 0 220 150"><rect width="220" height="150" fill="#e5ece7"/><circle cx="170" cy="35" r="17" fill="#d5b86b"/><path d="M0 150L65 55L140 150M70 150L150 75L220 150" fill="#92aa96"/><text x="16" y="134" font-size="12" fill="#344e40">SYNTHETIC LAYOUT</text></svg>');
 $('messages').append(message({role:'character',text:'这是用于检查窗口布局的合成消息。'}),message({role:'character',text:'下方几何图是原创测试素材。'}),message({role:'character',image:art}));
 const stamp=document.createElement('div');stamp.className='stamp';stamp.textContent='14:01';$('messages').append(stamp,message({role:'user',text:'收到，继续检查长文字和图片在聊天区域中的位置。'}));
}
