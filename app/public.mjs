import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const repository=Object.hasOwn(process.env,'NOTES_PUBLIC_REPOSITORY')?process.env.NOTES_PUBLIC_REPOSITORY:'git@github.com:YYlanyan/personal-notes-web.git';
const repositoryUrl=repository?repository.replace(/^git@github\.com:/,'https://github.com/').replace(/\.git$/,''):'';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export async function seedPublicWorkspace(directory, stateDirectory) {
  const exampleFiles={
    'README.md':`# YYlanyan 的公开笔记\n\n这里保存我主动公开的 Markdown 笔记与示例。本仓库不包含 Notes 程序或私人笔记。\n\n## 用 Notes 编辑\n\n1. 启动 Notes，在左上角切换到「公开笔记」。\n2. 直接编辑或新建 Markdown 笔记。\n3. 阅读并确认公开清单后，点击「发布到 GitHub」。\n4. 也可以直接用任意 Markdown 编辑器修改本仓库中的文件。\n\n## 示例\n\n- [快速开始](notes/快速开始.md)\n- [Markdown 写法示例](notes/Markdown%20写法示例.md)\n\n图片放入 \`assets/\` 并用相对路径引用。上传到本仓库的所有内容都可公开访问，请不要放入隐私资料或秘密。\n`,
    'notes/快速开始.md':`---\ntitle: 快速开始\ntags: [使用说明, Notes]\n---\n# 快速开始\n\n这篇示例介绍如何使用一个 Markdown 工作空间。你可以在「修改」视图中直接替换示例内容。\n\n## 用 Markdown 写作\n\n一级标题以 \`# \` 开始，二级标题以 \`## \` 开始。用空行分隔段落。\n\n- 在标题下编辑标签。\n- 停止输入后，内容会自动保存到本机文件。\n- 阅读 / 修改视图可以同时查看原文和预览。\n\n## 公开发布\n\n「公开笔记」工作空间使用单独的公开仓库。点击发布前可以查看会推送的文件。只有点击发布，工作区内容才会上传。\n\n请勿在这里记录不希望公开的私人内容。公开仓库内容可以被任何人阅读与复制。\n\n## 再试试双向链接\n\nMarkdown 正文也可以插入图片、链接和代码。再阅读 [[Markdown 写法示例|下一篇写法示例]]。\n`,
    'notes/Markdown 写法示例.md':`---\ntitle: Markdown 写法示例\ntags: [Markdown, 示例]\n---\n# Markdown 写法示例\n\n## 文本与链接\n\n可以使用 **粗体**、*斜体* 和 [外部链接](https://www.markdownguide.org/)。\n\n公开笔记之间可以互相链接：[[快速开始#公开发布|回到发布说明]]。\n\n## 待办事项\n\n- [x] 阅读示例\n- [ ] 写下第一篇公开笔记\n\n## 代码\n\n\`\`\`js\nconst message = '用 Markdown 写下想法';\nconsole.log(message);\n\`\`\`\n\n## 表格\n\n| 语法 | 用途 |\n| --- | --- |\n| \`# 标题\` | 区分内容层次 |\n| \`- [ ] 任务\` | 记录待办 |\n| \`[[笔记标题]]\` | 连接其他笔记 |\n\n## 图片\n\n![公开笔记示意图](../assets/笔记示意图.svg)\n`,
    'assets/笔记示意图.svg':`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 320"><rect width="720" height="320" rx="24" fill="#f3f6f3"/><rect x="44" y="42" width="632" height="236" rx="16" fill="#fff" stroke="#dce6dd" stroke-width="2"/><rect x="78" y="77" width="250" height="19" rx="9" fill="#287252"/><rect x="78" y="116" width="510" height="10" rx="5" fill="#dce6dd"/><rect x="78" y="140" width="420" height="10" rx="5" fill="#dce6dd"/><rect x="78" y="182" width="158" height="64" rx="10" fill="#dceee3"/><rect x="259" y="182" width="158" height="64" rx="10" fill="#e7e9fa"/><rect x="440" y="182" width="158" height="64" rx="10" fill="#faedda"/></svg>`
  };
  const seedMarker=path.join(stateDirectory,'examples-seeded');
  try{await fs.access(seedMarker);return;}catch{}
  for(const [relative,content]of Object.entries(exampleFiles)) {
    const file=path.join(directory,relative);await fs.mkdir(path.dirname(file),{recursive:true});
    try{await fs.writeFile(file,content,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  await fs.mkdir(stateDirectory,{recursive:true});
  await fs.writeFile(seedMarker,'1',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
}
const checkedPath=(root,relative)=>{
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'||(p.startsWith('.')&&p!=='.gitignore')))throw Error('公开笔记文件路径无效');
  const result=path.resolve(root,relative);
  if(!result.startsWith(root+path.sep))throw Error('公开笔记文件路径超出工作区');
  return result;
};

export function attachPublicRoutes(app,{root,notes,publishDirectory=notes,local,git,gitStatus,safe,fail}) {
  const manifestPath=path.join(local,'published-files.json');
  const gitRun=(directory,args)=>exec('git',args,{cwd:directory,timeout:90000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:'ssh -o BatchMode=yes -o ConnectTimeout=12'}}).then(result=>result.stdout.trim());
  async function readManifest(){try{return JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch{return {};}}
  async function filesUnder(directory,prefix='') {
    const result=[];
    for(const item of await fs.readdir(directory,{withFileTypes:true})) {
      if((item.name.startsWith('.')&&item.name!=='.gitignore')||item.name==='node_modules'||item.isSymbolicLink())continue;
      const relative=prefix+item.name;
      if(item.isDirectory())result.push(...await filesUnder(path.join(directory,item.name),relative+'/'));
      else if(item.isFile())result.push(relative);
    }
    return result.sort();
  }
  async function snapshot() {
    const files=await filesUnder(publishDirectory),content=new Map();
    for(const relative of files) {
      const full=checkedPath(publishDirectory,relative),stat=await fs.lstat(full);
      if(!stat.isFile()||stat.size>50*1024*1024)throw fail('公开文件不是普通文件，或超过 50 MB：'+relative);
      const bytes=await fs.readFile(full);
      content.set(relative,{bytes,digest:hash(bytes)});
    }
    return content;
  }
  async function publicPlan() {
    const state=await gitStatus(),content=await snapshot(),manifest=await readManifest();
    if(!repository)return {connected:false,publishEnabled:false,repository:'',repositoryUrl:'',files:[...content.keys()],ahead:0,behind:0,draftPaths:[]};
    if(!state.connected)return {connected:false,publishEnabled:true,repository,repositoryUrl,repositoryName:repositoryUrl.replace('https://github.com/',''),files:[...content.keys()],ahead:0,behind:0,draftPaths:[]};
    if(state.repositoryUrl!==repositoryUrl)return {connected:false,publishEnabled:true,staleConnection:true,previousRepositoryUrl:state.repositoryUrl,repository,repositoryUrl,repositoryName:repositoryUrl.replace('https://github.com/',''),files:[...content.keys()],ahead:0,behind:0,draftPaths:[]};
    if(await gitRun(root,['branch','--show-current'])!=='main')throw fail('公开笔记镜像必须位于 main 分支。',409);
    let head;
    try{head=await gitRun(root,['rev-parse','HEAD']);}catch{head='empty-repository';}
    const files=[];
    for(const [relative,item] of content)if(manifest[relative]!==item.digest)files.push({path:relative,action:manifest[relative]?'更新':'新增'});
    for(const relative of Object.keys(manifest))if(!content.has(relative))files.push({path:relative,action:'删除'});
    const token=hash(head+JSON.stringify(files)+[...content].map(([name,item])=>name+item.digest).join('\0')+JSON.stringify(manifest));
    return {connected:true,publishEnabled:true,repository,repositoryUrl,repositoryName:repositoryUrl.replace('https://github.com/',''),files,token,ahead:state.ahead,behind:state.behind,draftPaths:[]};
  }

  app.get('/api/public-state',async(req,res)=>res.json(await gitStatus()));
  app.post('/api/connect',async(req,res)=>{
    if(!repository)throw fail('尚未配置公开仓库。请先设置 NOTES_PUBLIC_REPOSITORY；默认只在本机使用公开笔记工作区。');
    const current=await gitStatus();
    if(current.connected&&current.repositoryUrl===repositoryUrl)return res.json({...current,message:'公开笔记仓库已连接'});
    if(current.connected&&current.repositoryUrl!==repositoryUrl) {
      const changes=await gitRun(root,['status','--porcelain']);
      if(changes)throw fail('旧公开仓库镜像有未提交改动，已保留原状。请先处理本机镜像后再切换仓库。',409);
      const suffix='.previous-'+new Date().toISOString().replace(/[:.]/g,'-');
      await fs.rename(root,root+suffix);
      try{await fs.rename(manifestPath,manifestPath+suffix);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await fs.mkdir(local,{recursive:true});await fs.mkdir(path.dirname(root),{recursive:true});
    const temporary=root+'.connect-'+crypto.randomUUID();
    try {
      await gitRun(path.dirname(root),['clone','--',repository,temporary]);
      await fs.rename(temporary,root);
      try{await gitRun(root,['symbolic-ref','--short','refs/remotes/origin/HEAD']);}
      catch {
        try{await gitRun(root,['checkout','-B','main']);}catch{}
      }
      const branch=await gitRun(root,['branch','--show-current']);
      if(branch!=='main')throw fail('请将新仓库的默认分支设为 main，然后重新连接。',409);
      await gitRun(root,['fetch','origin']);
      return res.json({...await gitStatus(),message:'已连接公开仓库'});
    }catch(error) {
      await fs.rm(temporary,{recursive:true,force:true});
      if(error.status)throw error;
      const detail=(error.stderr||error.message||'').slice(-1200);
      throw fail('连接公开仓库失败。请确认已配置的 GitHub 仓库存在、默认分支为 main，并检查 GitHub SSH 凭据。'+(detail?'\n'+detail:''),409);
    }
  });
  app.get('/api/publish-plan',async(req,res)=>res.json(await publicPlan()));
  app.post('/api/publish',async(req,res)=>res.json(await (async()=>{
    const plan=await publicPlan();
    if(!plan.connected)throw fail('请先配置并连接公开仓库。');
    if(req.body.token!==plan.token)throw fail('公开笔记发生了变化，请重新打开发布窗口查看文件清单。',409);
    if(!plan.files.length&&!plan.ahead)return {...await gitStatus(),message:'公开工作区没有新的改动。'};
    try{await gitRun(root,['fetch','origin']);}
    catch(error){throw fail('读取公开仓库失败：'+(error.stderr||error.message).slice(-1200),409);}
    let counts;try{counts=(await gitRun(root,['rev-list','--left-right','--count','HEAD...origin/main'])).split(/\s+/).map(Number);}catch{counts=[0,0];}
    if(counts[1]>0)throw fail('公开仓库的 main 分支有本机尚未包含的提交；为避免覆盖远端内容，已停止发布。',409);
    const beforeStage=(await gitRun(root,['diff','--cached','--name-only','-z'])).split('\0').filter(Boolean);
    if(beforeStage.length) {
      const publishable=new Set(plan.files.map(file=>file.path));
      if(beforeStage.some(relative=>!publishable.has(relative)))throw fail('公开仓库中存在不属于当前发布清单的暂存改动，请先处理后再发布。',409);
      // These are pending files from an interrupted publish. Unstage only paths
      // in the freshly confirmed workspace plan; the copy below restores their
      // contents from the canonical local workspace before committing.
      await gitRun(root,['reset','--quiet','--',...beforeStage]);
    }
    const fresh=await publicPlan();if(fresh.token!==plan.token)throw fail('公开笔记在发布期间发生了变化，请重新确认。',409);
    const content=await snapshot(),manifest=await readManifest();
    const touched=[];
    for(const relative of content.keys()) {
      if(manifest[relative]===content.get(relative).digest)continue;
      const destination=checkedPath(root,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
      const temporary=destination+'.'+crypto.randomUUID()+'.tmp';
      await fs.writeFile(temporary,content.get(relative).bytes);
      await fs.rename(temporary,destination);
      touched.push(relative);
    }
    // Only remove files this publisher previously copied from the public workspace.
    for(const relative of Object.keys(manifest))if(!content.has(relative)) {
      const destination=checkedPath(root,relative);
      try{await fs.unlink(destination);touched.push(relative);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(touched.length)await gitRun(root,['add','-f','--',...touched]);
    if(await gitRun(root,['diff','--cached','--name-only']))await gitRun(root,['commit','-m','public notes: '+new Date().toISOString()]);
    try{await gitRun(root,['push','-u','origin','main']);}
    catch(error){throw fail('笔记已在本地暂存仓库提交，但推送失败。请检查 GitHub SSH 凭据和远端变化后重试：'+(error.stderr||error.message).slice(-1200),409);}
    await fs.mkdir(local,{recursive:true});await fs.writeFile(manifestPath,JSON.stringify(Object.fromEntries([...content].map(([name,item])=>[name,item.digest])),null,2)+'\n');
    const result=await gitStatus();
    return {...result,message:'公开笔记已推送到 GitHub。仓库网页现已可查看 Markdown 内容。',repositoryUrl,repository,filesPublished:touched.length};
  })()));
}
