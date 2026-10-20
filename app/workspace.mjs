import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { attachBlogRoutes } from './blog.mjs';
import { attachPublicRoutes } from './public.mjs';
import { resolveLink, withoutExt, parseNoteLink } from './src/model.js';

const exec = promisify(execFile);
export async function createWorkspace({root,localDir,isBlog=false,isPublic=false,notesDir=null,assetsDir=null,imgbedConfigPath=null}) {
const notes = notesDir || path.join(root, isBlog ? 'content' : 'notes');
const assets = assetsDir || path.join(root, 'assets');
const local = localDir;
const imgbedConfig = imgbedConfigPath || path.join(local, 'imgbed.json');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
let queue = Promise.resolve();
const exclusive = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };

async function safe(base, relative, extension = false) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(s => !s || s === '.' || s === '..' || s.startsWith('.')) || path.isAbsolute(relative)) throw fail('文件名无效');
  if (extension && !relative.endsWith('.md')) throw fail('笔记必须使用 .md 扩展名');
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw fail('路径超出了笔记目录');
  let part = base;
  for (const seg of ['', ...relative.split('/')]) {
    if (seg) part = path.join(part, seg);
    try { if ((await fs.lstat(part)).isSymbolicLink()) throw fail('不允许访问符号链接'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}
async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, data, { mode: 0o600 });
  await fs.rename(temp, file);
}
async function backup(relative, content) {
  const dir = path.join(local, 'history', sha(relative));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, Date.now() + '-' + crypto.randomUUID() + '.md'), content);
  await fs.writeFile(path.join(dir, 'path.txt'), relative);
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.md')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) await fs.unlink(path.join(dir, f));
}
function unpack(relative, raw, stat) {
  if(isBlog && /^\+\+\+/.test(raw)) throw fail('这篇文章使用 TOML 头部，请先转为 YAML 后编辑；原文件已保留。');
  const parsed = matter(raw);
  const meta = parsed.data || {};
  return { path: relative, title: String(meta.title || path.basename(relative, '.md')), tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [], type: meta.type === 'database' ? 'database' : 'note', meta, body: parsed.content, rev: sha(raw), updated: stat?.mtime.toISOString() };
}
async function readNote(relative) {
  const file = await safe(notes, relative, true);
  const [raw, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
  const note=unpack(relative,raw,stat);
  if(isBlog&&path.basename(relative)==='index.md')note.cover=(await fs.readdir(path.dirname(file))).find(name=>/^cover\.(png|jpe?g|gif|webp)$/i.test(name))||'';
  return note;
}
async function index() {
  const pages = [], folders = [];
  async function visit(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) { folders.push(rel); await visit(path.join(dir, entry.name), rel + '/'); }
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        try { pages.push(await readNote(rel)); } catch (e) { pages.push({ path: rel, title: entry.name, tags: [], body: '', error: e.message }); }
      }
    }
  }
  await visit(notes);
  return { pages: pages.sort((a,b) => a.path.localeCompare(b.path, 'zh-CN')), folders: folders.sort() };
}
const git = (...args) => exec('git', args, { cwd: root, timeout: 60000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=12' } }).then(r => r.stdout.trim());
async function gitStatus() {
  if(!isBlog&&!isPublic) {
    try { await fs.access(path.join(root,'.git')); }
    catch { return {remote:'',repositoryUrl:null,changed:0,ahead:0,behind:0,syncedAt:null,connected:false}; }
  }
  if(isPublic) {
    try { await fs.access(path.join(root,'.git')); }
    catch { return {remote:'',repositoryUrl:null,changed:0,ahead:0,behind:0,syncedAt:null,connected:false}; }
  }
  const changes = await git('status', '--porcelain');
  let remote = '', ahead = 0, behind = 0;
  try { remote = await git('remote', 'get-url', 'origin'); } catch {}
  try { const nums = (await git('rev-list', '--left-right', '--count', 'HEAD...@{upstream}')).split(/\s+/); ahead = +nums[0]; behind = +nums[1]; } catch { try { if (await git('rev-parse', '--verify', 'HEAD')) ahead = 1; } catch {} }
  let syncedAt = null;
  try { syncedAt = JSON.parse(await fs.readFile(path.join(local, 'sync.json'), 'utf8')).syncedAt; } catch {}
  const match = remote.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/]+?)(?:\.git)?$/);
  return { remote, repositoryUrl: match ? 'https://github.com/' + match[1] : null, changed: changes ? changes.split('\n').length : 0, ahead, behind, syncedAt,...(isPublic?{connected:true}:{}) };
}
function rewriteLinks(body, source, target, oldPath, newPath, pages) {
  return body.split(/(```[\s\S]*?```|`[^`]*`)/g).map((chunk, i) => {
  if (i % 2) return chunk;
  body = chunk;
  body = body.replace(/\[\[([^\]\n]+)\]\]/g, (all, val) => {
    const { path:dest, anchor, label:alias } = parseNoteLink(val);
    if (!dest) return all;
    const resolved = resolveLink(dest, pages, source);
    if (!resolved || (resolved.path !== oldPath && source === target)) return all;
    return `[[${withoutExt(resolved.path === oldPath ? newPath : resolved.path)}${anchor ? '#' + anchor : ''}${alias ? '|' + alias : ''}]]`;
  });
  return body.replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (all, start, href, end) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(href)) return all;
    const fragmentAt = href.indexOf('#'), fragment = fragmentAt < 0 ? '' : href.slice(fragmentAt);
    let decoded; try { decoded = decodeURIComponent(fragmentAt < 0 ? href : href.slice(0,fragmentAt)); } catch { return all; }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded));
    const next = resolved === oldPath ? newPath : resolved;
    if (next === resolved && source === target) return all;
    return start + encodeURI(path.posix.relative(path.posix.dirname(target), next)) + fragment + end;
  });
  }).join('');
}

async function createRouter() {
  if(isBlog) await fs.access(notes);
  else { await fs.mkdir(notes, { recursive:true }); await fs.mkdir(assets, { recursive:true }); }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return res.status(403).json({ error: '只允许本机访问' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({ error: '拒绝跨站请求' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', (req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
  app.use('/api', (req,res,next) => {
    if (!['GET','HEAD'].includes(req.method) && !req.is('application/json')) return res.status(415).json({error:'请使用 JSON 请求'});
    next();
  });
  app.use(express.json({ limit: '16mb', type: 'application/json' }));
  app.get('/api/index', async (req,res) => res.json(await index()));
  app.get('/api/note', async (req,res) => res.json(await readNote(req.query.path)));
  app.put('/api/note', async (req,res) => res.json(await exclusive(async () => {
    const { path: relative, body, meta, rev } = req.body;
    if (typeof body !== 'string' || !meta || typeof meta !== 'object' || Array.isArray(meta)) throw fail('笔记数据无效');
    const file = await safe(notes, relative, true);
    const raw = await fs.readFile(file, 'utf8');
    if (sha(raw) !== rev) throw fail('磁盘上的笔记已改变。你的草稿仍保留，请复制草稿后重新打开笔记。', 409);
    const next = matter.stringify(body, meta);
    if (next !== raw) { await backup(relative, raw); await atomic(file, next); }
    return readNote(relative);
  })));
  app.post('/api/note', async (req,res) => res.json(await exclusive(async () => {
    const { path: relative, type } = req.body;
    const file = await safe(notes, relative, true);
    if(isBlog && !/^(essays|journal|tech|fun)\/\d{4}\/[a-z0-9][a-z0-9-]*\/index\.md$/.test(relative)) throw fail('新文章请使用 栏目/年份/网址名称/index.md 格式');
    if(isBlog&&req.body.date&&!Number.isFinite(new Date(req.body.date).getTime()))throw fail('发布日期无效');
    const meta = { title: isBlog ? String(req.body.title || path.basename(path.dirname(relative))) : isPublic ? String(req.body.title || path.basename(relative,'.md')) : path.basename(relative, '.md'), tags: [], ...(isBlog ? {date:req.body.date || new Date().toISOString(),draft:true,description:''} : {}), ...(type === 'database' ? { type, columns: [{ name: '名称', type: 'text' }, { name: '状态', type: 'status' }, { name: '日期', type: 'date' }] } : {}) };
    const body = type === 'database' ? '| 名称 | 状态 | 日期 |\n| --- | --- | --- |\n| 第一条记录 | 待开始 |  |\n' : '';
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.writeFile(file, matter.stringify(body,meta), { flag: 'wx' }); } catch(e) { if(e.code === 'EEXIST') throw fail('同名笔记已经存在',409); throw e; }
    return readNote(relative);
  })));
  app.post('/api/folder', async (req,res) => res.json(await exclusive(async () => {
    const folder = await safe(notes, req.body.path);
    try { await fs.mkdir(folder, { recursive: false }); } catch(e) { if(e.code === 'EEXIST') throw fail('文件夹已经存在',409); throw e; }
    await fs.writeFile(path.join(folder, '.gitkeep'), '');
    return { ok:true };
  })));
  app.post('/api/folder/move', async (req,res) => res.json(await exclusive(async () => {
    if(isBlog) throw fail('博客文章保持现有网址路径，暂不支持移动文件夹。');
    const { from, to } = req.body;
    if(typeof from!=='string'||typeof to!=='string'||!from||!to) throw fail('文件夹路径无效');
    if(from===to)return {ok:true};
    if(to.startsWith(from+'/')) throw fail('不能把文件夹移动到自身或其子文件夹中');
    const source=await safe(notes,from),target=await safe(notes,to);
    const sourceStat=await fs.stat(source).catch(()=>null);
    if(!sourceStat?.isDirectory()) throw fail('文件夹不存在',404);
    try { await fs.access(target); throw fail('目标位置已存在同名文件夹',409); } catch(e) { if(e.code!=='ENOENT') throw e; }
    const all=await index(),mapPath=relative=>relative===from||relative.startsWith(from+'/')?to+relative.slice(from.length):relative;
    const updates=[];
    for(const page of all.pages){
      if(page.error) throw fail('存在无法解析的笔记，请先修复：'+page.path);
      const nextBody=page.body.split(/(```[\s\S]*?```|`[^`]*`)/g).map((chunk,i)=>i%2?chunk:chunk.replace(/\[\[([^\]\n]+)\]\]/g,(allLink,value)=>{
        const {path:destination,anchor,label}=parseNoteLink(value),resolved=resolveLink(destination,all.pages,page.path);
        if(!resolved)return allLink;
        const moved=mapPath(resolved.path),sourceMoved=mapPath(page.path)!==page.path;
        if(moved===resolved.path&&!sourceMoved)return allLink;
        return `[[${withoutExt(moved)}${anchor?'#'+anchor:''}${label?'|'+label:''}]]`;
      })).join('');
      if(nextBody!==page.body)updates.push({oldPath:page.path,newPath:mapPath(page.path),raw:matter.stringify(nextBody,page.meta),original:page.body});
    }
    for(const update of updates)await backup(update.oldPath,await fs.readFile(await safe(notes,update.oldPath,true),'utf8'));
    await fs.rename(source,target);
    for(const update of updates)await atomic(await safe(notes,update.newPath,true),update.raw);
    return {ok:true};
  })));
  app.post('/api/move', async (req,res) => res.json(await exclusive(async () => {
    if(isBlog) throw fail('博客文章保持现有网址路径，请通过文章标题修改显示名称。');
    const { from, to } = req.body;
    if (from === to) return { ok: true };
    const src = await safe(notes, from, true), dest = await safe(notes, to, true);
    try { await fs.access(dest); throw fail('目标位置已存在同名笔记',409); } catch(e) { if(e.code !== 'ENOENT') throw e; }
    const all = await index();
    const updates = [];
    for (const p of all.pages) {
      if (p.error) throw fail('存在无法解析的笔记，请先修复：' + p.path);
      const target = p.path === from ? to : p.path;
      const body = rewriteLinks(p.body, p.path, target, from, to, all.pages);
      const meta = { ...p.meta, ...(p.path === from ? { title: path.basename(to,'.md') } : {}) };
      if (body !== p.body || p.path === from) updates.push({ p, target, raw: matter.stringify(body, meta) });
    }
    if(!updates.some(x=>x.p.path===from)) throw fail('笔记不存在',404);
    // Back up every affected file before changing any of them.
    for(const u of updates) await backup(u.p.path, await fs.readFile(await safe(notes,u.p.path,true),'utf8'));
    for(const u of updates) await atomic(await safe(notes,u.target,true),u.raw);
    await fs.unlink(src);
    return { ok:true };
  })));
  app.get('/api/trash', async (req,res) => {
    const dir = path.join(local, 'trash');
    await fs.mkdir(dir, { recursive:true });
    const items = [];
    for (const id of await fs.readdir(dir)) {
      if (!/^\d+-[a-f0-9-]+$/.test(id)) continue;
      try {
        await fs.access(path.join(dir,id,'content'));
        items.push({ ...JSON.parse(await fs.readFile(path.join(dir,id,'info.json'),'utf8')), id });
      } catch {}
    }
    res.json({items:items.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))});
  });
  app.post('/api/trash', async (req,res) => res.json(await exclusive(async () => {
    const { path:relative, rev } = req.body;
    const source = await safe(notes,relative);
    const stat = await fs.lstat(source);
    if (!stat.isDirectory() && (!stat.isFile() || !relative.endsWith('.md'))) throw fail('只能删除笔记或笔记文件夹');
    if (stat.isFile() && sha(await fs.readFile(source,'utf8')) !== rev) throw fail('这篇笔记已被其他窗口修改，请重新打开后再删除。',409);
    const id = Date.now() + '-' + crypto.randomUUID();
    const dir = path.join(local,'trash',id);
    const info = {path:relative,type:stat.isDirectory()?'folder':'note',deletedAt:new Date().toISOString()};
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'info.json'),JSON.stringify(info));
    await fs.rename(source,path.join(dir,'content'));
    return {ok:true,id,...info};
  })));
  app.post('/api/trash/restore', async (req,res) => res.json(await exclusive(async () => {
    const {id}=req.body;
    if(typeof id!=='string'||!/^\d+-[a-f0-9-]+$/.test(id))throw fail('回收记录无效');
    const dir=path.join(local,'trash',id);
    const info=JSON.parse(await fs.readFile(path.join(dir,'info.json'),'utf8'));
    const target=await safe(notes,info.path);
    try {await fs.lstat(target);throw fail('原位置已有同名内容，请先将它重命名或移动再恢复。',409);}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.rename(path.join(dir,'content'),target);
    await fs.unlink(path.join(dir,'info.json'));
    await fs.rmdir(dir);
    return {ok:true,path:info.path};
  })));
  app.post('/api/upload', async (req,res) => res.json(await exclusive(async () => {
    const { data, mime, path: relative } = req.body;
    const ext = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif' }[mime];
    if(!ext || typeof data !== 'string') throw fail('支持 PNG、JPG、GIF、WebP 图片');
    await safe(notes, relative, true);
    const bytes = Buffer.from(data, 'base64');
    if(bytes.length > 10 * 1024 * 1024) throw fail('图片请小于 10 MB');
    let localUrl;
    if(isBlog) {
      const bundle=path.posix.basename(relative)==='index.md';
      if(req.body.cover&&!bundle)throw fail('封面需要 index.md 文章目录，请为新文章使用默认目录格式。');
      const folder=path.posix.dirname(relative);
      const name=req.body.cover?'cover.'+ext:sha(bytes).slice(0,24)+'.'+ext;
      const file=await safe(notes,folder+'/'+name);
      if(req.body.cover) {
        for(const entry of await fs.readdir(path.dirname(file))) {
          if(!/^cover\.(png|jpg|jpeg|gif|webp)$/i.test(entry))continue;
          const old=await safe(notes,folder+'/'+entry);
          await atomic(path.join(local,'media-history',Date.now()+'-'+crypto.randomUUID()+'-'+entry),await fs.readFile(old));
          if(entry!==name)await fs.unlink(old);
        }
      }
      await atomic(file,bytes);
      localUrl=name;
    } else {
      const name = sha(bytes).slice(0,24) + '.' + ext;
      if(isPublic) {
        const backupDir=path.join(local,'image-backups');
        await fs.mkdir(backupDir,{recursive:true});
        await atomic(path.join(backupDir,name),bytes);
        localUrl='.local/public-notes/state/image-backups/'+name;
      } else {
        const file = await safe(assets,name);
        await atomic(file,bytes);
        localUrl=path.posix.relative(path.posix.join('notes',path.posix.dirname(relative)), 'assets/' + name);
      }
    }
    let imgbed;
    try { imgbed=JSON.parse(await fs.readFile(imgbedConfig,'utf8')); } catch { throw fail(`本机备份已保存（${localUrl}），但 ImgBed 尚未配置；设置地址与 Token 后重试上传。`,502); }
    if(typeof imgbed.endpoint!=='string'||typeof imgbed.token!=='string'||!imgbed.endpoint||!imgbed.token)throw fail(`本机备份已保存（${localUrl}），但 ImgBed 配置不完整；请检查设置后重试上传。`,502);
    const uploadFolder=String(req.body.uploadFolder??imgbed.uploadFolder??'').trim();
    if(uploadFolder&&(uploadFolder.startsWith('/')||uploadFolder.includes('\\')||uploadFolder.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))))throw fail(`本机备份已保存（${localUrl}），但 ImgBed 服务器文件夹路径无效；请使用如 images/2026 的相对路径。`);
    const form=new FormData();
    const filename=typeof req.body.name==='string'?path.basename(req.body.name).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180):'';
    form.append('file',new Blob([bytes],{type:mime}),filename||path.basename(relative).replace(/\.md$/i,'')+'.'+ext);
    let response;
    const uploadUrl=new URL('/upload',imgbed.endpoint);uploadUrl.searchParams.set('returnFormat','full');if(uploadFolder)uploadUrl.searchParams.set('uploadFolder',uploadFolder);
    try { response=await fetch(uploadUrl,{method:'POST',headers:{Authorization:`Bearer ${imgbed.token}`},body:form,signal:AbortSignal.timeout(60000)}); }
    catch { throw fail(`本机备份已保存（${localUrl}），连接 ImgBed 失败；请检查网络后重试上传。`,502); }
    const raw=await response.text();
    let payload;try{payload=JSON.parse(raw);}catch{payload=null;}
    if(!response.ok)throw fail(`本机备份已保存（${localUrl}），ImgBed 上传失败（HTTP ${response.status}）；请检查 Token 或服务状态后重试。`,502);
    const uploaded=Array.isArray(payload)?payload[0]:payload;
    let url=uploaded?.publicUrl||uploaded?.src||uploaded?.url;
    if(typeof url!=='string'&&typeof payload==='string')url=payload;
    if(typeof url!=='string'||!url)throw fail(`本机备份已保存（${localUrl}），但 ImgBed 返回内容无法识别；请检查服务版本后重试。`,502);
    if(!/^https?:\/\//i.test(url))url=new URL(url,imgbed.endpoint).href;
    return {url,localUrl};
  })));
  app.get('/api/imgbed/settings',async(req,res)=>{
    let config={};try{config=JSON.parse(await fs.readFile(imgbedConfig,'utf8'));}catch{}
    res.json({endpoint:config.endpoint||'',uploadFolder:config.uploadFolder||'',configured:Boolean(config.endpoint&&config.token)});
  });
  app.put('/api/imgbed/settings',async(req,res)=>{
    const endpoint=String(req.body.endpoint||'').trim().replace(/\/+$/,'');
    const token=String(req.body.token||'').trim();
    const uploadFolder=String(req.body.uploadFolder??'').trim();
    let parsed;try{parsed=new URL(endpoint);}catch{throw fail('ImgBed 地址无效。');}
    if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw fail('ImgBed 地址请填写不带路径、查询参数或凭据的 HTTP(S) 站点地址。');
    if(uploadFolder&&(uploadFolder.startsWith('/')||uploadFolder.includes('\\')||uploadFolder.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))))throw fail('服务器文件夹请使用相对路径，例如 images/2026；不要以斜线开头或使用 . 开头的路径段。');
    let previous={};try{previous=JSON.parse(await fs.readFile(imgbedConfig,'utf8'));}catch{}
    if(!token&&!previous.token)throw fail('请填写 ImgBed API Token。');
    await atomic(imgbedConfig,JSON.stringify({endpoint,token:token||previous.token,uploadFolder},null,2)+'\n');
    res.json({endpoint,uploadFolder,configured:true});
  });
  app.get('/api/imgbed/files',async(req,res)=>{
    let config={};try{config=JSON.parse(await fs.readFile(imgbedConfig,'utf8'));}catch{}
    if(typeof config.endpoint!=='string'||typeof config.token!=='string'||!config.endpoint||!config.token)throw fail('请先配置 ImgBed 地址和 API Token。');
    const start=Number.parseInt(req.query.start,10);
    if(!Number.isInteger(start)||start<0)throw fail('服务器图片列表页码无效。');
    const listUrl=new URL('/api/manage/list',config.endpoint);
    listUrl.searchParams.set('start',String(start));
    listUrl.searchParams.set('count','100');
    listUrl.searchParams.set('recursive','true');
    let response;
    try{response=await fetch(listUrl,{headers:{Authorization:`Bearer ${config.token}`},signal:AbortSignal.timeout(30000)});}
    catch{throw fail('连接 ImgBed 读取服务器图片失败，请检查网络或服务地址。',502);}
    const raw=await response.text();
    let payload;try{payload=JSON.parse(raw);}catch{payload=null;}
    if(!response.ok)throw fail(`读取 ImgBed 图片列表失败（HTTP ${response.status}），请检查 Token 或服务状态。`,502);
    if(!payload||!Array.isArray(payload.files))throw fail('ImgBed 返回的图片列表格式无法识别。',502);
    res.setHeader('Cache-Control','no-store');
    res.json({files:payload.files,totalCount:Number(payload.totalCount)||0,returnedCount:Number(payload.returnedCount)||payload.files.length});
  });
  app.get('/api/git', async (req,res) => res.json(await gitStatus()));
  app.post('/api/sync', async (req,res) => res.json(await exclusive(async () => {
    if(isBlog||isPublic)throw fail(isBlog?'请使用博客发布入口。':'请使用公开笔记发布入口。');
    const status = await gitStatus();
    if (!status.remote) throw fail('尚未连接 GitHub 私人仓库。请先按 README 中的说明关联 Notes 仓库。');
    if (await git('diff', '--name-only', '--diff-filter=U')) throw fail('Git 存在合并冲突，请先处理后再同步。',409);
    await git('add', '--', '.');
    if(await git('diff', '--cached', '--name-only')) await git('commit', '-m', `notes: ${new Date().toISOString()}`);
    await git('fetch', 'origin');
    let hasRemote = true;
    try { await git('rev-parse', '--verify', 'refs/remotes/origin/main'); } catch { hasRemote = false; }
    if(hasRemote) {
      const counts = (await git('rev-list','--left-right','--count','HEAD...origin/main')).split(/\s+/).map(Number);
      if(counts[1] > 0) throw fail('GitHub 有本机尚未包含的提交。已保留本地提交，请先在终端合并远端修改，再同步。',409);
    }
    await git('push','-u','origin','main');
    const syncedAt = new Date().toISOString();
    await atomic(path.join(local,'sync.json'),JSON.stringify({syncedAt}));
    return { ...(await gitStatus()), message:'已同步到 GitHub', syncedAt };
  })));
  // Expose only supported image/video attachments, never repository files.
  if(!isPublic&&!isBlog)app.get('/files/assets/:name', async(req,res) => {
    if(!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp|mp4|webm|ogv)$/.test(req.params.name)) throw fail('附件不存在',404);
    res.sendFile(await safe(assets,req.params.name));
  });
  if(isBlog||isPublic) {
    app.get('/files/:source/{*file}',async(req,res)=>{
      if(!(isBlog?['content','static']:['assets']).includes(req.params.source))throw fail('附件不存在',404);
      const relative=req.params.file.join('/');
      if(!/\.(png|jpe?g|gif|webp|svg|mp4|webm|ogv|avif)$/i.test(relative))throw fail('附件类型不支持',404);
      if(/\.svg$/i.test(relative))res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
      res.sendFile(await safe(isBlog?path.join(root,req.params.source):assets,relative));
    });
    if(isBlog)attachBlogRoutes(app,{root,local,git,gitStatus,index,readNote,safe,atomic,exclusive,fail});
    else attachPublicRoutes(app,{root,notes,publishDirectory:path.dirname(notes),local,git,gitStatus,safe,fail});
  }
  app.use((error,req,res,next) => {
    let message = error.message || '操作失败';
    if(error.code === 'ENOENT') message = '文件不存在';
    if(error.stderr) message = '操作失败：' + error.stderr.slice(0,1600);
    res.status(error.status || (error.code === 'ENOENT' ? 404 : 500)).json({ error:message });
  });
  return app;
}
return createRouter();
}
