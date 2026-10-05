import React, { useState } from 'react';
import { ImagePlus, Loader2, ExternalLink } from 'lucide-react';

const sections=[['essays','随笔'],['journal','日志'],['tech','技术'],['fun','小乐趣']];
const localDate=value=>{
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  return parts.replace(' ','T');
};
const toISO=value=>value?value.slice(0,16)+':00+08:00':'';
export function NewPublicNoteDialog({Dialog,close,onCreate}) {
  const [title,setTitle]=useState(''),[slug,setSlug]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);setError('');try{if(!slug.trim()||/[\\/]/.test(slug)||slug.startsWith('.'))throw Error('文件名不能为空、不能以点开头，也不能包含斜杠');await onCreate({path:'notes/'+slug.trim()+'.md',title:title.trim()});close();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title="新建公开笔记" close={close}><form onSubmit={submit}><label>标题<input autoFocus required value={title} onChange={e=>setTitle(e.target.value)} placeholder="给公开笔记起个名字"/></label><label>文件名<input required value={slug} onChange={e=>setSlug(e.target.value)} placeholder="例如：我的公开笔记"/><small>保存为 public-notes/notes/{slug||'文件名'}.md。</small></label><p className="publish-notice">这篇内容会被设计为公开仓库中的普通 Markdown。发布前仍可以在清单里查看具体改动。</p>{error&&<p className="form-error">{error}</p>}<div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy}>{busy?'创建中…':'创建笔记'}</button></div></form></Dialog>;
}

export function NewBlogDialog({Dialog,close,onCreate}) {
  const [title,setTitle]=useState(''),[section,setSection]=useState('essays'),[slug,setSlug]=useState(''),[date,setDate]=useState(()=>localDate(new Date())),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await onCreate({path:`${section}/${date.slice(0,4)}/${slug}/index.md`,title:title.trim(),date:toISO(date)});close();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title="新建博客文章" close={close}><form onSubmit={submit}><label>标题<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="这次想写什么？"/></label><label>栏目<select value={section} onChange={e=>setSection(e.target.value)}>{sections.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>文章网址名称<input required pattern="[a-z0-9][a-z0-9-]*" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())} placeholder="例如 my-first-post"/><small>使用英文小写、数字和短横线；发布后建议保持不变。</small></label><label>发布日期（北京时间）<input type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></label><p className="muted">新文章默认是草稿。保存到 content/{section}/{date.slice(0,4)}/{slug||'文章网址名称'}/index.md。</p>{error&&<p className="form-error">{error}</p>}<div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy}>{busy?'创建中…':'创建草稿'}</button></div></form></Dialog>;
}
export function BlogProperties({note,readOnly,onMeta,api,onError}) {
  const [coverBusy,setCoverBusy]=useState(false),[coverVersion,setCoverVersion]=useState(0),[uploadedCover,setUploadedCover]=useState('');
  const update=(key,value)=>onMeta({...note.meta,[key]:value});
  const folder=note.path.split('/').slice(0,-1).map(encodeURIComponent).join('/');
  const cover=uploadedCover||note.cover;
  async function upload(file){
    if(!file)return;setCoverBusy(true);
    try {
      if(file.size>10*1024*1024)throw Error('封面请小于 10 MB');
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
      const result=await api('upload',{data,mime:file.type,path:note.path,cover:true});setUploadedCover(result.url);setCoverVersion(Date.now());
    }catch(e){onError(e.message);}finally{setCoverBusy(false);}
  }
  return <details className="blog-properties" open><summary>文章设置 <span className={'draft-badge '+(note.meta.draft?'':'ready')}>{note.meta.draft?'草稿':'正式文章'}</span></summary><div className="blog-fields"><label>发布日期（北京时间）<input type="datetime-local" readOnly={readOnly} value={localDate(note.meta.date)} onChange={e=>update('date',toISO(e.target.value))}/></label><label>状态<select disabled={readOnly} value={note.meta.draft===true?'draft':'ready'} onChange={e=>update('draft',e.target.value==='draft')}><option value="draft">草稿 · 仅预览网站可见</option><option value="ready">正式文章 · 发布后显示</option></select></label><label className="full">简介<textarea readOnly={readOnly} rows={2} value={note.meta.description||''} onChange={e=>update('description',e.target.value)} placeholder="技术与小乐趣卡片中的一两句介绍"/></label><label>自定义网址名称（可选）<input readOnly={readOnly} value={note.meta.slug||''} onChange={e=>update('slug',e.target.value)} placeholder="留空沿用文件路径"/></label><label>互动演示链接（可选）<input readOnly={readOnly} value={note.meta.demo||''} onChange={e=>update('demo',e.target.value)} placeholder="demos/fireworks/"/></label>{/^(tech|fun)\/.+\/index\.md$/.test(note.path)&&<div className="full blog-cover">{cover&&<img alt="文章封面" src={'/workspaces/blog/files/content/'+folder+'/'+encodeURIComponent(cover)+'?v='+coverVersion}/>}<label className={'secondary cover-upload '+(readOnly?'disabled':'')}>{coverBusy?<Loader2 className="spin" size={15}/>:<ImagePlus size={15}/>} {cover?'替换封面':'添加封面'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={readOnly||coverBusy} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label><small>保存在文章目录的 cover.*，沿用博客主题的展示方式。</small></div>}</div><p className="blog-meta-help">本地自动保存。草稿和未来日期文章不会出现在正式网站；发布会上传它们的 Markdown 源码。</p></details>;
}
export function PublishDialog({Dialog,api,close,onPublished}) {
  const [plan,setPlan]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  React.useEffect(()=>{let active=true;api('publish-plan').then(p=>{if(active)setPlan(p);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function publish(){setBusy(true);setError('');try{const result=await api('publish',{token:plan.token});setResult(result);onPublished(result);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title="发布博客" close={()=>{if(!busy)close();}}>{loading?<p className="muted">正在整理博客改动…</p>:result?<><p>{result.message}</p><a className="repository-link" href={result.actionsUrl} target="_blank" rel="noreferrer">查看 GitHub 部署记录 <ExternalLink size={14}/></a><p><a href={result.siteUrl} target="_blank" rel="noreferrer">打开正式博客</a></p></>:plan&&<><p>将以下博客仓库改动提交并推送至 <strong>main</strong>，由 GitHub Actions 部署。</p><a className="repository-link" href={plan.repositoryUrl} target="_blank" rel="noreferrer">YYlanyan/YYlanyan.github.io <ExternalLink size={14}/></a><div className="publish-files">{plan.files.length?plan.files.map(file=><div key={file}>{file}</div>):<p className="muted">没有未提交的文件改动</p>}</div>{plan.ahead>0&&<p>还会推送 {plan.ahead} 个本地提交。</p>}<p className="publish-notice">这是公开仓库，发布会上传博客中的草稿源码。目前有 {plan.drafts.length} 篇草稿、{plan.future.length} 篇未来日期文章；它们默认不会生成正式网页。私人笔记属于另一个仓库。</p></>}{error&&<p className="form-error">{error}</p>}<div className="dialog-footer"><button className="secondary" disabled={busy} onClick={close}>{result?'完成':'取消'}</button>{!result&&<button className="primary" disabled={loading||busy||!plan||(!plan.files.length&&!plan.ahead)} onClick={publish}>{busy?'构建并发布中…':'确认发布'}</button>}</div></Dialog>;
}
