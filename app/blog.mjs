import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
const repositoryUrl='https://github.com/YYlanyan/YYlanyan.github.io';
const siteUrl='https://yylanyan.github.io/';

function csv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift()||[];
  return rows.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]||''])));
}
const freePort=()=>new Promise((resolve,reject)=>{
  const server=net.createServer();server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolve(port));});
});

export function attachBlogRoutes(app,{root,local,git,gitStatus,index,readNote,safe,atomic,exclusive,fail}) {
  const binary=path.join(root,'.tools/hugo');
  const env={...process.env,HUGO_RESOURCEDIR:path.join(local,'resources'),TZ:'Asia/Shanghai'};
  let preview=null,starting=null;
  const hugo=async args=>{
    try{return await exec(binary,args,{cwd:root,env,timeout:120000,maxBuffer:8*1024*1024});}
    catch(error){throw fail('Hugo 操作失败：'+(error.stderr||error.stdout||error.message).slice(-2400),500);}
  };
  const stop=()=>{preview?.child.kill();};
  process.once('exit',stop);
  process.once('SIGTERM',()=>{stop();process.exit(0);});
  process.once('SIGINT',()=>{stop();process.exit(0);});
  async function startPreview() {
    if(preview?.ready)return preview;
    if(starting)return starting;
    starting=(async()=>{
      await fs.access(binary);
      await fs.mkdir(local,{recursive:true});
      const port=await freePort(),url=`http://127.0.0.1:${port}/`;
      const child=spawn(binary,['server','--bind','127.0.0.1','--port',String(port),'--baseURL',url,'--buildDrafts','--buildFuture','--disableFastRender','--noBuildLock','--renderToMemory','--cacheDir',path.join(local,'cache')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
      const state={child,url,ready:false,log:''};preview=state;
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{child.kill();reject(fail('Hugo 启动超时：'+state.log.slice(-1600),500));},45000);
        const collect=data=>{
          state.log=(state.log+data.toString()).slice(-6000);
          if(/Web Server is available at/i.test(state.log)&&!state.ready){state.ready=true;clearTimeout(timeout);resolve();}
        };
        child.stdout.on('data',collect);child.stderr.on('data',collect);
        child.once('error',error=>{clearTimeout(timeout);if(preview===state)preview=null;reject(fail('无法启动 Hugo：'+error.message,500));});
        child.once('exit',()=>{clearTimeout(timeout);if(preview===state)preview=null;if(!state.ready)reject(fail('Hugo 预览未启动：'+state.log.slice(-2400),500));});
      });
      return state;
    })().finally(()=>{starting=null;});
    return starting;
  }
  app.post('/api/preview',async(req,res)=>{
    if(req.body.path)await readNote(req.body.path);
    const state=await startPreview();
    let url=state.url,warning='';
    if(req.body.path) {
      try {
        const result=await hugo(['list','all','--noBuildLock','--cacheDir',path.join(local,'cache')]);
        const target=path.join(root,'content',req.body.path);
        const row=csv(result.stdout).find(row=>row.path&&path.resolve(root,row.path)===target);
        if(row?.permalink)url=new URL(new URL(row.permalink).pathname,state.url).href;
        else warning='已打开博客首页，可从栏目进入当前文章。';
      } catch(error) {warning=error.message+'；已打开博客首页。';}
    }
    res.json({url,warning});
  });
  async function publishPlan() {
    const status=await gitStatus();
    const branch=await git('branch','--show-current');
    if(status.repositoryUrl!==repositoryUrl)throw fail('博客远端与 YYlanyan/YYlanyan.github.io 不一致，请先确认仓库配置。',409);
    if(branch!=='main')throw fail('当前博客不在 main 分支，请先切回 main 再发布。',409);
    if(await git('diff','--name-only','--diff-filter=U'))throw fail('博客仓库有合并冲突，请先处理。',409);
    const head=await git('rev-parse','HEAD');
    const files=[...new Set((await git('diff','--name-only','-z','HEAD')).split('\0').concat((await git('ls-files','--others','--exclude-standard','-z')).split('\0')).filter(Boolean))].sort();
    const digest=crypto.createHash('sha256').update(head).update(await git('diff','--raw','--no-abbrev','HEAD')).update(await git('diff','--cached','--raw','--no-abbrev'));
    for(const file of files) {
      digest.update(file);
      try {
        const full=path.resolve(root,file);
        if(!full.startsWith(root+path.sep)||file.split('/').some(part=>part==='..'||part==='.'))throw fail('发布文件路径无效');
        let ancestor=root;
        for(const part of file.split('/')){ancestor=path.join(ancestor,part);if((await fs.lstat(ancestor)).isSymbolicLink())throw fail('发布列表含符号链接，请先在终端处理：'+file);}
        const stat=await fs.lstat(full);
        if(stat.isFile())digest.update(await fs.readFile(full));else digest.update('directory');
      } catch(error) {if(error.code==='ENOENT')digest.update('deleted');else throw error;}
    }
    const content=await index();
    const invalid=content.pages.find(p=>p.error);if(invalid)throw fail('文章头部无法解析：'+invalid.path+'。请修复后再发布。');
    return {token:digest.digest('hex'),files,branch,ahead:status.ahead,behind:status.behind,repositoryUrl,siteUrl,actionsUrl:repositoryUrl+'/actions',drafts:content.pages.filter(p=>p.meta.draft===true).map(p=>p.path),future:content.pages.filter(p=>new Date(p.meta.publishDate||p.meta.date).getTime()>Date.now()).map(p=>p.path)};
  }
  app.get('/api/publish-plan',async(req,res)=>res.json(await publishPlan()));
  app.post('/api/publish',async(req,res)=>res.json(await exclusive(async()=>{
    const plan=await publishPlan();
    if(req.body.token!==plan.token)throw fail('博客改动已发生变化，请重新打开发布窗口确认。',409);
    await git('fetch','origin');
    const counts=(await git('rev-list','--left-right','--count','HEAD...origin/main')).split(/\s+/).map(Number);
    if(counts[1]>0)throw fail('远端博客有本机未合并的更新，请先合并后再发布。',409);
    if(!plan.files.length&&!counts[0])return {...await gitStatus(),message:'没有需要发布的改动。',actionsUrl:plan.actionsUrl,siteUrl};
    await hugo(['build','--minify','--panicOnWarning','--noBuildLock','--destination',path.join(local,'publish'),'--cacheDir',path.join(local,'cache'),'--baseURL',siteUrl]);
    if((await publishPlan()).token!==plan.token)throw fail('构建期间博客文件发生变化，请重新确认发布。',409);
    if(plan.files.length)await git('add','--',...plan.files);
    if(await git('diff','--cached','--name-only'))await git('commit','-m','blog: '+new Date().toISOString());
    await git('push','-u','origin','main');
    const syncedAt=new Date().toISOString();
    await atomic(path.join(local,'sync.json'),JSON.stringify({syncedAt}));
    return {...await gitStatus(),message:'已推送博客，GitHub Actions 正在处理部署，请在部署记录中查看结果。',actionsUrl:plan.actionsUrl,siteUrl};
  })));
}
