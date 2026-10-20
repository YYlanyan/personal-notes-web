import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'notes-test-'));
process.env.NOTES_ROOT=root;
const { createApp }=await import('../server.mjs');
let server,url;
before(async()=>{execFileSync('git',['init','-b','main'],{cwd:root});const app=await createApp();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
async function call(route,data,method='POST',extra={}){const r=await fetch(url+'/api/'+route,{method:data===undefined?'GET':method,headers:{'Content-Type':'application/json',...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()};}
test('create, save, revisions, external edits, backup and persistence',async()=>{
 let r=await call('note',{path:'学习/测试.md'});assert.equal(r.status,200);const original=r.data;
 r=await call('note',{path:original.path,rev:original.rev,meta:{title:'测试',tags:['学习']},body:'# 标题\n\n- [x] 完成\n\n$$x^2$$\n'},'PUT');assert.equal(r.status,200);assert.notEqual(r.data.rev,original.rev);
 const saved=await fs.readFile(path.join(root,'notes/学习/测试.md'),'utf8');assert.match(saved,/学习/);assert.match(saved,/\[x\]/);
 const stale=await call('note',{...original,body:'stale'},'PUT');assert.equal(stale.status,409);assert.equal(await fs.readFile(path.join(root,'notes/学习/测试.md'),'utf8'),saved);
 await fs.appendFile(path.join(root,'notes/学习/测试.md'),'external edit');const conflict=await call('note',{...r.data,body:'overwrite'},'PUT');assert.equal(conflict.status,409);
 assert.ok((await fs.readdir(path.join(root,'.local/history'))).length);const idx=await call('index');assert.ok(idx.data.pages.find(p=>p.tags.includes('学习')));
});
test('duplicate creation, unsafe paths, foreign origin and symlink protection',async()=>{
 assert.equal((await call('note',{path:'学习/测试.md'})).status,409);
 for(const p of ['../bad.md','/tmp/bad.md','.hidden.md','x/../../bad.md','file.txt','x\\a.md'])assert.equal((await call('note',{path:p})).status,400);
 assert.equal((await call('note',{path:'cross.md'},'POST',{Origin:'https://evil.example'})).status,403);
 await fs.symlink(os.tmpdir(),path.join(root,'notes/escape'));assert.equal((await call('note',{path:'escape/secret.md'})).status,400);
});
test('upload, relative image path and moves preserve images and incoming links',async()=>{
 let n=(await call('note',{path:'图片.md'})).data;
 const image=await call('upload',{path:n.path,mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM6kAAAAASUVORK5CYII='});assert.equal(image.status,200);assert.match(image.data.url,/^\.\.\/assets\//);
 await call('note',{...n,body:`![图](${image.data.url})\n`},'PUT');
 let ref=(await call('note',{path:'引用.md'})).data;await call('note',{...ref,body:'[[图片]]\n[图片](图片.md)\n'},'PUT');
 assert.equal((await call('move',{from:'图片.md',to:'学习/新图片.md'})).status,200);
 n=(await call('note?path='+encodeURIComponent('学习/新图片.md'))).data;assert.match(n.body,/\.\.\/\.\.\/assets\//);
 ref=(await call('note?path='+encodeURIComponent('引用.md'))).data;assert.match(ref.body,/\[\[学习\/新图片\]\]/);assert.match(ref.body,/\[图片\]\(/);
 const bytes=await fetch(url+'/files/assets/'+image.data.url.split('/').pop());assert.equal(bytes.status,200);assert.equal(bytes.headers.get('content-type'),'image/png');
 assert.equal((await call('upload',{path:n.path,mime:'image/svg+xml',data:'PHN2Zz4='})).status,400);
});
test('folders are tracked, database remains Markdown, sync gives actionable disconnected error',async()=>{
 assert.equal((await call('folder',{path:'空文件夹'})).status,200);assert.equal(await fs.readFile(path.join(root,'notes/空文件夹/.gitkeep'),'utf8'),'');
 const db=await call('note',{path:'清单.md',type:'database'});assert.equal(db.data.meta.columns.length,3);assert.match(db.data.body,/\| 名称 \|/);
 const sync=await call('sync',{});assert.equal(sync.status,400);assert.match(sync.data.error,/尚未连接/);
});
test('moving duplicate titles updates only resolved links and keeps code examples intact',async()=>{
 for(const file of ['甲/重复.md','乙/重复.md','乙/引用.md'])await call('note',{path:file});
 let p=(await call('note?path='+encodeURIComponent('乙/引用.md'))).data;
 await call('note',{...p,body:'[[重复]]\n[[甲/重复]]\n`[[甲/重复]]`\n'},'PUT');
 assert.equal((await call('move',{from:'甲/重复.md',to:'甲/改名.md'})).status,200);
 p=(await call('note?path='+encodeURIComponent('乙/引用.md'))).data;
 assert.equal(p.body.trim(),'[[重复]]\n[[甲/改名]]\n`[[甲/重复]]`');
});
