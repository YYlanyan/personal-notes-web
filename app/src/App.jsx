import React, { useEffect, useRef, useState } from 'react';
import Vditor from 'vditor';
import { BookOpen, Search, Plus, ChevronRight, ChevronDown, Folder, FolderPlus, FileText, Table2, Sun, Moon, CloudUpload, Check, Loader2, PanelLeftClose, PanelLeftOpen, Link2, Hash, X, ArrowUpRight, MoreHorizontal, Pencil, FolderInput, AlertCircle, Settings2, CircleHelp, Trash2, RotateCcw, Globe, Eye, ImageUp } from 'lucide-react';
import Editor from './Editor';
import Database from './Database';
import ImageLibrary from './ImageLibrary';
import { NewBlogDialog, NewPublicNoteDialog, BlogProperties, PublishDialog } from './Blog';
import { PublicPublishDialog } from './PublicNotes';
import { api as request, basename, withoutExt, resolveLink, links, headings, parseNoteLink, blockAnchors } from './model';

function ReadableTitle({ title }) {
  const [html,setHtml]=useState('');
  useEffect(()=>{let active=true;Vditor.md2html(title||'',{markdown:{sanitize:true}}).then(markup=>{if(active)setHtml(markup.replace(/^<p>|<\/p>\s*$/g,''));}).catch(()=>{if(active)setHtml(title||'');});return()=>{active=false;};},[title]);
  return <span className="document-title-rendered" dangerouslySetInnerHTML={{__html:html}}/>;
}

function Dialog({ title, children, close }) {
  const box=useRef(null);
  useEffect(()=>{const prev=document.activeElement;box.current?.querySelector('input,select,button')?.focus();const listener=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const list=[...box.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled);const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);prev?.focus();};},[]);
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section ref={box} className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={close}><X size={19}/></button></div>{children}</section></div>;
}
function FolderPicker({ folders, value, onChange, workspaceName }) {
  const [expanded,setExpanded]=useState(()=>{const open={};const parts=(value||'').split('/');for(let i=1;i<parts.length;i++)open[parts.slice(0,i).join('/')]=true;return open;});
  const childrenOf=parent=>folders.filter(path=>path.split('/').slice(0,-1).join('/')===parent);
  function render(parent='',depth=0){return childrenOf(parent).map(path=>{const children=childrenOf(path),open=!!expanded[path];return <div className="folder-picker-node" key={path}><div className={'folder-picker-row '+(value===path?'selected':'')} style={{paddingLeft:8+depth*17}}>{children.length?<button type="button" className="folder-picker-chevron" aria-label={(open?'收起':'展开')+' '+path.split('/').at(-1)} onClick={()=>setExpanded(previous=>({...previous,[path]:!previous[path]}))}>{open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="folder-picker-spacer"/>}<button type="button" className="folder-picker-name" onClick={()=>onChange(path)}><Folder size={15}/><span>{path.split('/').at(-1)}</span></button></div>{open&&render(path,depth+1)}</div>;});}
  return <div className="folder-picker"><button type="button" className={'folder-picker-row folder-picker-root '+(!value?'selected':'')} onClick={()=>onChange('')}><Folder size={15}/>{workspaceName} /</button>{render()}</div>;
}
function FileDialog({ kind, note, folders, onSubmit, close, workspaceName='我的笔记' }) {
  const isFolder=kind==='folder'||kind==='folder-move';
  const [name,setName]=useState(kind==='move'?basename(note.path):kind==='folder-move'?note.path.split('/').at(-1):''),[folder,setFolder]=useState(kind==='move'||kind==='folder-move'?note.path.split('/').slice(0,-1).join('/'):''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const title={note:'新建笔记',database:'新建数据库',folder:'新建文件夹',move:'重命名 / 移动笔记','folder-move':'重命名 / 移动文件夹'}[kind];
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{if(!name.trim()||/[\\/]/.test(name)||name.startsWith('.'))throw Error('请输入有效名称，不要包含斜杠或以点开头');const path=(folder?folder+'/':'')+name.trim()+(isFolder?'':name.endsWith('.md')?'':'.md');await onSubmit(path);close();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title={title} close={close}><form onSubmit={submit}><label>名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder={kind==='folder'?'例如：读书笔记':'例如：一个新的想法'} required/></label><div className="dialog-field"><span>保存位置</span><FolderPicker folders={folders} value={folder} onChange={setFolder} workspaceName={workspaceName}/></div>{error&&<p className="form-error">{error}</p>}<div className="dialog-footer"><button type="button" className="secondary" onClick={close}>取消</button><button className="primary" disabled={busy}>{busy?'正在保存…':kind==='move'?'保存修改':'创建'}</button></div></form></Dialog>;
}
function TreeActions({item,onMove,onRename,onDelete,canMove=true,canRename=true,open,onToggle}) {
  const key=item.type+':'+item.path;
  return <div className="tree-menu-wrap"><button className="icon-button tree-more" title="更多操作" aria-label={'更多操作 '+(item.title||item.path)} aria-expanded={open} onClick={()=>onToggle(key)}><MoreHorizontal size={17}/></button>{open&&<div className="popover tree-popover">{canRename&&<button onClick={()=>{onToggle('');onRename(item);}}><Pencil size={15}/>重命名</button>}{canMove&&<button onClick={()=>{onToggle('');onMove(item);}}><FolderInput size={15}/>移动到</button>}<button className="danger-text" onClick={()=>{onToggle('');onDelete(item);}}><Trash2 size={15}/>删除</button></div>}</div>;
}
function Tree({ pages, folders, current, onOpen, onDelete, onMove, onToggleMenu, openMenuKey, onPressStart, onFolderClick, onFolderDrop, onFolderHover, onFileClick, draggingPath='', dragOverPath='', prefix='', level=0 }) {
  const childFolders=folders.filter(f=>f.split('/').slice(0,-1).join('/')===prefix);
  const childPages=pages.filter(p=>p.path.split('/').slice(0,-1).join('/')===prefix);
  const [closed,setClosed]=useState(()=>Object.fromEntries(childFolders.map(f=>[f,true])));
  useEffect(()=>setClosed(previous=>{const next={...previous};for(const folder of childFolders)if(!(folder in next))next[folder]=true;return next;}),[folders,prefix]);
  return <>{childFolders.map(f=><div key={f}><div className="tree-row"><button className={'tree-item folder-item '+(dragOverPath===f?'drop-target':'')} style={{paddingLeft:14+level*16}} onClick={e=>{if(!onFolderClick(f,e))setClosed(previous=>({...previous,[f]:!previous[f]}));}} onPointerEnter={()=>onFolderHover(f)} onPointerUp={e=>onFolderDrop(f,e)} aria-expanded={!closed[f]}>{closed[f]?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<Folder size={16}/><span>{f.split('/').pop()}</span></button><TreeActions item={{path:f,type:'folder'}} onDelete={onDelete} onMove={onMove} onRename={onMove} open={openMenuKey==='folder:'+f} onToggle={onToggleMenu}/></div>{!closed[f]&&<Tree {...{pages,folders,current,onOpen,onDelete,onMove,onToggleMenu,openMenuKey,onPressStart,onFolderClick,onFolderDrop,onFolderHover,onFileClick,draggingPath,dragOverPath}} prefix={f} level={level+1}/>}</div>)}{childPages.map(p=><div className="tree-row" key={p.path}><button title={p.path} style={{paddingLeft:level?32+level*16:16}} className={'tree-item '+(p.path===current?'selected ':'')+(draggingPath===p.path?'dragging':'')} onPointerDown={e=>onPressStart(p.path,e)} onClick={e=>onFileClick(p.path,e)}>{p.type==='database'?<Table2 size={17}/>:<FileText size={17}/>}<span>{p.title}</span>{p.path===current&&<span className="selected-mark"/>}</button><TreeActions item={p} onMove={onMove} onRename={item=>{setMoveTarget(item);setDialog('move');}} onDelete={onDelete} open={openMenuKey==='note:'+p.path} onToggle={onToggleMenu}/></div>)}</>;
}
function TrashDialog({close,onRestored,api,workspaceName}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[restoring,setRestoring]=useState(''),[error,setError]=useState('');
  useEffect(()=>{api('trash').then(d=>setItems(d.items)).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  async function restore(id){setRestoring(id);setError('');try{await api('trash/restore',{id});setItems(items=>items.filter(i=>i.id!==id));await onRestored();}catch(e){setError(e.message);}finally{setRestoring('');}}
  return <Dialog title="回收站" close={close}><p className="muted">删除的笔记和文件夹保留在本机，可以恢复到原位置。{workspaceName==='公开笔记'?'下次公开发布时才会把删除同步到仓库。':workspaceName==='博客'?'下次发布时才会把删除同步到仓库。':'删除会在下次 GitHub 同步时反映到远端。'}</p>{error&&<p className="form-error">{error}</p>}{loading?<p className="muted">正在读取…</p>:!items.length?<div className="empty small">回收站是空的</div>:<div className="trash-list">{items.map(item=><div className="trash-item" key={item.id}>{item.type==='folder'?<Folder size={18}/>:<FileText size={18}/>}<div><strong>{item.path}</strong><small>{new Date(item.deletedAt).toLocaleString('zh-CN')}</small></div><button className="secondary" disabled={!!restoring} onClick={()=>restore(item.id)}><RotateCcw size={14}/>{restoring===item.id?'恢复中…':'恢复'}</button></div>)}</div>}</Dialog>;
}
function LinkDialog({ pages, current, close, insert }) {
  const [path,setPath]=useState(current.path),[anchor,setAnchor]=useState(''),[label,setLabel]=useState('');
  const page=path===current.path?current:pages.find(p=>p.path===path);
  const targets=[...headings(page?.body),...blockAnchors(page?.body)];
  const value='[['+withoutExt(path)+(anchor?'#'+anchor:'')+(label.trim()?'|'+label.trim():'')+']]';
  return <Dialog title="链接到笔记中的内容" close={close}><form onSubmit={e=>{e.preventDefault();insert(value);}}><label>笔记<select value={path} onChange={e=>{setPath(e.target.value);setAnchor('');}}>{pages.map(p=><option key={p.path} value={p.path}>{p.path===current.path?'本篇 · ':''}{p.title} — {p.path}</option>)}</select></label><label>具体位置<select value={anchor} onChange={e=>setAnchor(e.target.value)}><option value="">笔记开头</option>{targets.map((h,i)=><option key={i} value={h.anchor}>{h.anchor.startsWith('^')?'段落 · ':'标题 · '}{h.title}{h.anchor.match(/~\d+$/)?.[0]||''}</option>)}</select></label><label>显示文字（可选）<input value={label} onChange={e=>setLabel(e.target.value.replace(/[|\[\]\n]/g,''))} placeholder="例如：查看关键结论"/></label><p className="muted">指定段落：在段落末尾加上空格和 ^标识，再从这里选择。</p><code className="link-preview">{value}</code><div className="dialog-footer"><button type="button" className="secondary" onClick={close}>取消</button><button className="primary">插入链接</button></div></form></Dialog>;
}
export default function App() {
  const [workspaces,setWorkspaces]=useState(null),[workspaceId,setWorkspaceId]=useState(()=>localStorage.getItem('notes-workspace')||'notes'),[error,setError]=useState('');
  useEffect(()=>{request('workspaces').then(({workspaces})=>{setWorkspaces(workspaces);if(!workspaces.some(w=>w.id===workspaceId&&w.available))setWorkspaceId('notes');}).catch(e=>setError(e.message));},[]);
  if(error)return <div className="empty"><p>{error}</p><button className="secondary" onClick={()=>location.reload()}>重新加载</button></div>;
  if(!workspaces)return <div className="empty"><Loader2 className="spin"/>正在打开工作空间…</div>;
  const workspace=workspaces.find(w=>w.id===workspaceId)||workspaces[0];
  return <Workspace key={workspace.id} workspace={workspace} workspaces={workspaces} onWorkspaceChange={id=>{localStorage.setItem('notes-workspace',id);setWorkspaceId(id);}}/>;
}
function Workspace({workspace,workspaces,onWorkspaceChange}) {
  const isBlog=workspace.id==='blog',isPublic=workspace.id==='public',draftPrefix=isBlog?'blog-draft:':isPublic?'public-draft:':'notes-draft:',lastKey=isBlog?'blog-last':isPublic?'public-last':'notes-last';
  const api=(url,data,method)=>request(url,data,method,workspace.id);
  const [data,setData]=useState({pages:[],folders:[]}),[note,setNote]=useState(null),[loading,setLoading]=useState(true),[saveState,setSaveState]=useState('saved'),[theme,setTheme]=useState(()=>localStorage.getItem('notes-theme')||'light'),[mode,setMode]=useState(()=>{const saved=localStorage.getItem('notes-mode');return ['read','edit','split'].includes(saved)?saved:saved==='source'?'split':'read';}),[dialog,setDialog]=useState(null),[toast,setToast]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState(''),[tag,setTag]=useState(''),[sidebar,setSidebar]=useState(true),[info,setInfo]=useState(true),[infoMobile,setInfoMobile]=useState(false),[git,setGit]=useState(null),[syncing,setSyncing]=useState(false),[tagsInput,setTagsInput]=useState(''),[menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[deleteTarget,setDeleteTarget]=useState(null),[deleting,setDeleting]=useState(false),[toolsMount,setToolsMount]=useState(null),[anchorRequest,setAnchorRequest]=useState(null),[tagsCollapsed,setTagsCollapsed]=useState(()=>localStorage.getItem('notes-tags-collapsed')==='true'),[activeHeading,setActiveHeading]=useState(''),[previewing,setPreviewing]=useState(false);
  const [showImageLibrary,setShowImageLibrary]=useState(false);
  const [moveTarget,setMoveTarget]=useState(null),[draggingPath,setDraggingPath]=useState(''),[dragOverPath,setDragOverPath]=useState(''),[openMenuKey,setOpenMenuKey]=useState('');
  const current=useRef(null),dirty=useRef(false),version=useRef(0),saving=useRef(null),timer=useRef(null),editorRef=useRef(null),searchRef=useRef(null),documentScroll=useRef(null),openToken=useRef(0),outlineList=useRef(null),holdTimer=useRef(null),pressOrigin=useRef(null),draggingRef=useRef(''),suppressClick=useRef(false);
  useEffect(()=>{if(!openMenuKey)return;const closeOutside=event=>{if(!event.target.closest('.tree-menu-wrap'))setOpenMenuKey('');};document.addEventListener('pointerdown',closeOutside);const timeout=setTimeout(()=>setOpenMenuKey(''),5000);return()=>{document.removeEventListener('pointerdown',closeOutside);clearTimeout(timeout);};},[openMenuKey]);
  useEffect(()=>()=>{clearTimeout(timer.current);openToken.current++;},[]);
  useEffect(()=>{
    const move=e=>{const origin=pressOrigin.current;if(origin&&!draggingRef.current&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>8){clearTimeout(holdTimer.current);holdTimer.current=null;pressOrigin.current=null;}};
    const up=()=>{clearTimeout(holdTimer.current);holdTimer.current=null;pressOrigin.current=null;if(draggingRef.current){draggingRef.current='';setDraggingPath('');setDragOverPath('');setToast('没有放到目标文件夹，笔记位置未改变');}if(suppressClick.current)setTimeout(()=>{suppressClick.current=false;},0);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);clearTimeout(holdTimer.current);};
  },[]);
  function startFileHold(path,event){if(event.button!==0)return;clearTimeout(holdTimer.current);pressOrigin.current={path,x:event.clientX,y:event.clientY};holdTimer.current=setTimeout(()=>{if(pressOrigin.current?.path!==path)return;draggingRef.current=path;suppressClick.current=true;setDraggingPath(path);setToast('已抓取笔记，拖到目标文件夹即可移动');},520);}
  function openTreeFile(path){if(suppressClick.current){suppressClick.current=false;return;}open(path);}
  function toggleTreeFolder(){if(suppressClick.current){suppressClick.current=false;return true;}return false;}
  function hoverTreeFolder(folder){if(draggingRef.current)setDragOverPath(folder);}
  function dropOnFolder(folder,event){const from=draggingRef.current;if(!from)return;event.preventDefault();const to=folder+'/'+from.split('/').pop();draggingRef.current='';setDraggingPath('');setDragOverPath('');suppressClick.current=true;relocateNote(from,to).catch(e=>showError(e.message));}
  function dropOnRoot(event){const from=draggingRef.current;if(!from)return;event.preventDefault();const to=from.split('/').pop();draggingRef.current='';setDraggingPath('');setDragOverPath('');suppressClick.current=true;if(from!==to)relocateNote(from,to).catch(e=>showError(e.message));else setToast('笔记已在根目录');}
  const showError = message => setError(message);
  const refresh=async()=>{const d=await api('index');setData(d);return d;};
  const refreshGit=async()=>{try{setGit(await api('git'));}catch{}};
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('notes-theme',theme);},[theme]);
  useEffect(()=>{localStorage.setItem('notes-mode',mode);},[mode]);
  useEffect(()=>{localStorage.setItem('notes-tags-collapsed',String(tagsCollapsed));},[tagsCollapsed]);
  useEffect(()=>{
    const list=outlineList.current,item=list?.querySelector('[aria-current="location"]');
    if(!list||!item)return;
    const bounds=list.getBoundingClientRect(),row=item.getBoundingClientRect();
    if(row.top<bounds.top+12||row.bottom>bounds.bottom-12)list.scrollTo({top:list.scrollTop+row.top-bounds.top-list.clientHeight/2+row.height/2,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[activeHeading,info,infoMobile,mode]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);
  async function flush() {
    clearTimeout(timer.current);
    const latest=editorRef.current?.getValue();
    if(current.current && latest!==undefined && latest!==current.current.body) change(latest);
    clearTimeout(timer.current);
    if(saving.current){await saving.current;return flush();}
    if(!dirty.current||!current.current)return;
    const snapshot={...current.current,meta:{...current.current.meta}}, v=version.current;
    setSaveState('saving');
    const job=api('note',{path:snapshot.path,meta:snapshot.meta,body:snapshot.body,rev:snapshot.rev},'PUT');
    saving.current=job;
    try {
      const result=await job;
      if(current.current?.path===snapshot.path){current.current={...current.current,rev:result.rev,updated:result.updated};setNote(current.current);}
      if(v===version.current){dirty.current=false;setSaveState('saved');try{localStorage.removeItem(draftPrefix+snapshot.path);}catch{}}else {try{localStorage.setItem(draftPrefix+snapshot.path,JSON.stringify(current.current));}catch{}}
      setData(d=>({...d,pages:d.pages.map(p=>p.path===result.path?result:p)}));
      setError('');refreshGit();
    } catch(e){setSaveState('error');setError(e.message);throw e;}
    finally{saving.current=null;}
    if(dirty.current)return flush();
  }
  function change(body,meta=current.current?.meta||{}) {
    if(!current.current)return;
    const next={...current.current,body,meta,title:meta.title||basename(current.current.path),tags:meta.tags||[]};
    current.current=next;setNote(next);dirty.current=true;version.current++;setSaveState('pending');
    try {localStorage.setItem(draftPrefix+next.path,JSON.stringify(next));}catch{}
    clearTimeout(timer.current);timer.current=setTimeout(()=>flush().catch(()=>{}),650);
  }
  async function open(path, skipFlush=false, anchor='') {
    const token=++openToken.current;setBusy(true);
    try {
      if(!skipFlush)await flush();
      const next=await api('note?path='+encodeURIComponent(path));
      if(token!==openToken.current)return;
      let draft;try{draft=JSON.parse(localStorage.getItem(draftPrefix+path));}catch{}
      if(draft&&(draft.body!==next.body||JSON.stringify(draft.meta)!==JSON.stringify(next.meta))){current.current={...next,...draft};dirty.current=true;setSaveState('pending');setToast('已恢复上次未保存的草稿');}else {current.current=next;dirty.current=false;setSaveState('saved');}
      setNote(current.current);setActiveHeading(anchor||headings(current.current.body)[0]?.anchor||'');setAnchorRequest(anchor?{path,anchor,id:Date.now()}:null);if(documentScroll.current)documentScroll.current.scrollTop=0;setTagsInput((current.current.meta.tags||[]).join(', '));setError('');localStorage.setItem(lastKey,path);setMenu(false);if(window.innerWidth<700)setSidebar(false);
      if(dirty.current)timer.current=setTimeout(()=>flush().catch(()=>{}),650);
    }catch(e){showError(e.message);}finally{if(token===openToken.current)setBusy(false);}
  }
  useEffect(()=>{(async()=>{try{const d=await refresh();const last=localStorage.getItem(lastKey);const path=d.pages.find(p=>p.path===last)?.path||d.pages.find(p=>p.path==='开始使用.md')?.path||d.pages[0]?.path;if(path)await open(path,true);await refreshGit();}catch(e){showError(e.message);}finally{setLoading(false);}})();
    const before=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);
  },[]);
  useEffect(()=>{const key=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopPropagation();setSidebar(true);setTimeout(()=>searchRef.current?.focus(),0);}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();flush().catch(()=>{});}if(e.key==='Escape'){setMenu(false);setQuery('');setTag('');}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
  const navigate=async value=>{
    const target=resolveLink(value,data.pages,current.current?.path),{anchor}=parseNoteLink(value);
    if(!target){setToast('还没有这篇笔记：'+value+'，可以通过“新建笔记”创建');return;}
    try{await flush();}catch{return;}
    if(anchor&&(mode==='edit'||target.type==='database'))setMode('split');
    if(target.path===current.current?.path){setAnchorRequest(anchor?{path:target.path,anchor,id:Date.now()}:null);if(!anchor)documentScroll.current?.scrollTo({top:0,behavior:'smooth'});}
    else await open(target.path,true,anchor);
  };
  function selectHeading(anchor){setActiveHeading(anchor);setAnchorRequest({path:current.current.path,anchor,id:Date.now()});}
  const allTags=[...new Set(data.pages.flatMap(p=>p.tags))];
  const filtered=data.pages.filter(p=>(!tag||p.tags.includes(tag))&&(!query||`${p.title}\n${p.body}\n${p.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  const outgoing=note?[...new Set(links(note.body))]:[];
  const backlinks=note?data.pages.filter(p=>p.path!==note.path&&links(p.body).some(l=>resolveLink(l,data.pages,p.path)?.path===note.path)):[];
  const outline=headings(note?.body);
  const isDB=note?.meta.type==='database';
  async function relocateNote(from,to){const activePath=current.current?.path;await flush();await api('move',{from,to});localStorage.removeItem(draftPrefix+from);await refresh();if(activePath)await open(activePath===from?to:activePath,true);setMoveTarget(null);setToast('已移动笔记并更新相关链接');}
  async function relocateFolder(from,to){const activePath=current.current?.path;await flush();await api('folder/move',{from,to});const drafts=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(draftPrefix+from+'/'))drafts.push([key,draftPrefix+to+key.slice((draftPrefix+from).length),localStorage.getItem(key)]);}for(const [oldKey,newKey,value] of drafts){localStorage.setItem(newKey,value);localStorage.removeItem(oldKey);}await refresh();if(activePath)await open(activePath.startsWith(from+'/')?to+activePath.slice(from.length):activePath,true);setMoveTarget(null);setToast('已移动文件夹并更新相关链接');}
  async function create(path){if(dialog==='move'){await relocateNote(moveTarget?.path||current.current.path,path);}else if(dialog==='folder-move'){await relocateFolder(moveTarget.path,path);}else if(dialog==='folder'){await flush();await api('folder',{path});await refresh();setToast('文件夹已创建');}else{await flush();const n=await api('note',{path,type:dialog==='database'?'database':'note'});await refresh();await open(n.path,true);} }
  async function removeFile(){
    if(!deleteTarget||deleting)return;
    const target=deleteTarget;
    setDeleting(true);setBusy(true);
    try{
      await flush();
      const affected=current.current&&(current.current.path===target.path||current.current.path.startsWith(target.path+'/'));
      const rev=current.current?.path===target.path?current.current.rev:target.rev;
      await api('trash',{path:target.path,rev});
      for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key===draftPrefix+target.path||key?.startsWith(draftPrefix+target.path+'/'))localStorage.removeItem(key);}
      if(affected){clearTimeout(timer.current);dirty.current=false;current.current=null;editorRef.current=null;setNote(null);setTagsInput('');setSaveState('saved');localStorage.removeItem(lastKey);}
      setDeleteTarget(null);setMenu(false);
      const next=await refresh();await refreshGit();
      if(affected&&next.pages.length)await open(next.pages[0].path,true);
      setToast(isPublic?'已移入公开笔记回收站；下次发布会更新 GitHub':isBlog?'已移入博客回收站；下次发布会更新 GitHub':'已移入回收站；下次同步会更新 GitHub');
    }catch(e){showError(e.message);setDeleteTarget(null);}finally{setDeleting(false);setBusy(false);}
  }
  async function switchMode(next){if(next===mode)return;setBusy(true);try{await flush();setMode(next);}catch{}finally{setBusy(false);}}
  async function changeWorkspace(id){if(id===workspace.id)return;setBusy(true);try{await flush();onWorkspaceChange(id);}catch{}finally{setBusy(false);}}
  async function previewBlog(){if(previewing)return;const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;setPreviewing(true);try{await flush();const result=await api('preview',{path:current.current?.path});if(tab)tab.location.href=result.url;else setToast('预览已启动：'+result.url);if(result.warning)setToast(result.warning);}catch(e){tab?.close();showError(e.message);}finally{setPreviewing(false);}}
  async function preparePublish(){try{await flush();setDialog('publish');}catch{}}
  async function preparePublicPublish(){try{await flush();setDialog('publish-public');}catch{}}
  async function sync(){if(syncing)return;setSyncing(true);try{await flush();const result=await api('sync',{});setGit(result);setToast(result.message);await refresh();}catch(e){showError(e.message);}finally{setSyncing(false);}}
  function updateTags(value=tagsInput,normalize=true){
    if(!current.current)return;
    const tags=[...new Set(value.split(/[,，]/).map(s=>s.trim().replace(/^#/, '')).filter(Boolean))];
    if(JSON.stringify(tags)!==JSON.stringify(current.current.meta.tags||[]))change(editorRef.current?.getValue()??current.current.body,{...current.current.meta,tags});
    if(normalize)setTagsInput(tags.join(', '));
  }
  async function rescue(){try{const original=current.current;const created=await api('note',{path:isBlog?(original.path.split('/')[0]&&['essays','journal','tech','fun'].includes(original.path.split('/')[0])?original.path.split('/')[0]:'essays')+'/'+new Date().getFullYear()+'/recovered-'+Date.now()+'/index.md':withoutExt(original.path)+' 草稿 '+Date.now()+'.md',type:original.meta.type});await api('note',{...created,body:editorRef.current?.getValue()??original.body,meta:{...original.meta,title:isBlog?original.title+'（恢复草稿）':basename(created.path),...(isBlog?{draft:true}:{})}},'PUT');localStorage.removeItem(draftPrefix+original.path);dirty.current=false;clearTimeout(timer.current);await refresh();await open(created.path,true);setToast('草稿已另存，原文件保留磁盘版本');}catch(e){showError(e.message);}}

  return <div className={'app-shell '+(!sidebar?'sidebar-hidden':'')+(!info?' info-hidden':'')+(infoMobile?' info-open-mobile':'')}>
    {sidebar&&<aside className="sidebar"><div className="workspace"><div className="brand">N<span>.</span></div><div className="workspace-choice"><strong>{isBlog?'Blog':isPublic?'Public':'Notes'}</strong><select aria-label="切换工作空间" disabled={busy||syncing||previewing} value={workspace.id} onChange={e=>changeWorkspace(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id} disabled={!w.available}>{w.name}{!w.available?'（未连接）':''}</option>)}</select></div><button className="icon-button collapse" aria-label="收起侧栏" onClick={()=>setSidebar(false)}><PanelLeftClose size={18}/></button></div>
      <div className="search-box"><Search size={17}/><input ref={searchRef} aria-label="搜索所有笔记" placeholder="搜索笔记与内容" value={query} onChange={e=>setQuery(e.target.value)}/>{query?<button className="icon-button" onClick={()=>setQuery('')} aria-label="清除搜索"><X size={13}/></button>:<kbd>⌘ K</kbd>}</div>
      <button className="new-note" onClick={()=>setDialog('note')}><Plus size={17}/>{isBlog?'新建文章':isPublic?'新建公开笔记':'新建笔记'}</button>
      <button className={'tree-item image-library-button '+(showImageLibrary?'selected':'')} onClick={()=>setShowImageLibrary(true)}><ImageUp size={16}/><span>图片上传</span><ArrowUpRight size={14}/></button>
      <div className="sidebar-scroll"><div className="section-label"><span>{query?'搜索结果':isBlog?'博客文章':isPublic?'公开笔记':'我的笔记'}</span><span>{data.pages.length}</span><button className="icon-button" title="新建文件夹" aria-label="新建文件夹" onClick={()=>setDialog('folder')}><FolderPlus size={16}/></button></div>
      {query||tag ? (
        <div className="search-results">
          {tag&&<button className="tag-filter" onClick={()=>setTag('')}>#{tag}<X size={12}/></button>}
          {filtered.map(p=><button key={p.path} className={'result '+(note?.path===p.path?'selected':'')} onClick={()=>open(p.path)}><span><FileText size={15}/>{p.title}</span><small>{query?p.body.slice(Math.max(0,p.body.toLowerCase().indexOf(query.toLowerCase())-25),Math.max(0,p.body.toLowerCase().indexOf(query.toLowerCase())-25)+95).replace(/[#*\n]/g,' '):p.path}</small></button>)}
          {!filtered.length&&<p className="muted empty small">没有找到匹配的笔记</p>}
        </div>
      ) : (
        <><Tree pages={data.pages} folders={data.folders} current={note?.path} onOpen={open} onDelete={setDeleteTarget} onMove={item=>{setMoveTarget(item);setDialog(item.type==='folder'?'folder-move':'move');}} onToggleMenu={key=>setOpenMenuKey(previous=>previous===key?'':key)} openMenuKey={openMenuKey} onPressStart={startFileHold} onFolderClick={toggleTreeFolder} onFolderDrop={dropOnFolder} onFolderHover={hoverTreeFolder} onFileClick={openTreeFile} draggingPath={draggingPath} dragOverPath={dragOverPath}/>{draggingPath&&<button className={'root-drop-target '+(dragOverPath==='__root__'?'drop-target':'')} onPointerEnter={()=>setDragOverPath('__root__')} onPointerUp={dropOnRoot}><Folder size={15}/>移动到根目录</button>}</>
      )}
      <button hidden={isBlog||isPublic} className="tree-item add-database" onClick={()=>setDialog('database')}><Table2 size={16}/><span>新建数据库</span><Plus size={14}/></button>
      <button className="section-label tags-heading tags-toggle" aria-expanded={!tagsCollapsed} aria-controls="sidebar-tags" onClick={()=>setTagsCollapsed(value=>!value)}>{tagsCollapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<span>标签</span><span className="tag-total">{allTags.length}</span><Hash size={14}/></button><div id="sidebar-tags" className="tag-list" hidden={tagsCollapsed}>{allTags.length?allTags.map(t=><button key={t} onClick={()=>setTag(tag===t?'':t)} className={'tag '+(tag===t?'active':'')}>#{t}<span>{data.pages.filter(p=>p.tags.includes(t)).length}</span></button>):<p className="muted">在笔记标题下添加标签</p>}</div></div>
      <div className="sidebar-bottom"><button className="repo-status" onClick={()=>setDialog('trash')}><Trash2 size={15}/><span>回收站</span><ChevronRight size={14}/></button><div className="local-label"><span className="status-dot"/><span>本地工作空间</span><span className="grow"/><button aria-label={theme==='light'?'切换深色主题':'切换浅色主题'} className="icon-button" onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</button></div><button className="repo-status" onClick={()=>isBlog?preparePublish():isPublic?preparePublicPublish():setDialog('sync')}><CloudUpload size={15}/><span>{isPublic?(git?.connected?(git.ahead?`${git.ahead} 个待发布提交`:git.repositoryUrl?'已连接公开仓库':'公开仓库已连接'):'公开仓库尚未连接'):git?.remote?(git.changed||git.ahead?`${git.changed} 处修改 · ${git.ahead} 个待推送提交`:git.behind?`${git.behind} 个远端提交待处理`:git.syncedAt?'已同步 GitHub':'已连接 GitHub'):'GitHub 尚未连接'}</span><ChevronRight size={14}/></button></div>
    </aside>}
    <main className="main"><header className="topbar">{!sidebar&&<button className="icon-button" aria-label="展开侧栏" onClick={()=>setSidebar(true)}><PanelLeftOpen size={18}/></button>}<nav className="breadcrumbs"><BookOpen size={15}/><span>{workspace.name}</span><ChevronRight size={13}/><span>{note?.path.split('/').slice(0,-1).join(' / ')||'工作空间'}</span>{note&&<><ChevronRight size={13}/><strong>{note.title}</strong></>}</nav><span className="grow"/>
    <span className={'save-state '+(saveState==='error'?'error':'')} role="status">{saveState==='saving'?<Loader2 className="spin" size={13}/>:saveState==='saved'?<Check size={13}/>:saveState==='error'?<AlertCircle size={13}/>:null}{saveState==='saved'?'已保存到本机':saveState==='saving'?'保存中…':saveState==='error'?'保存失败':'待保存'}</span>{note&&<div className="view-switcher" role="group" aria-label="笔记视图">{[['read','📖','阅读'],['edit','🖊️','修改'],['split','◫','阅读/修改']].map(([value,icon,label])=><button key={value} className={mode===value?'active':''} aria-pressed={mode===value} disabled={busy} onClick={()=>switchMode(value)}><span aria-hidden="true">{icon}</span><span>{label}</span></button>)}</div>}</header>
    <div className={'workspace-toolbar '+(busy?'is-busy':'')} aria-label="笔记工具栏">
      <div className={'editor-tools-slot '+(theme==='dark'?'vditor--dark':'')} ref={setToolsMount}/>
      <div className="workspace-actions">
        {note&&!isDB&&!isBlog&&!isPublic&&mode!=='read'&&<button className="subtle insert-link" onClick={()=>setDialog('link')}><Link2 size={15}/>插入笔记链接</button>}
        {note&&<div className="menu-wrap"><button className="icon-button" aria-label="笔记操作" onClick={()=>setMenu(!menu)}><MoreHorizontal size={21}/></button>{menu&&<div className="popover"><button hidden={isBlog} onClick={()=>{setMoveTarget(note);setDialog('move');setMenu(false);}}><Pencil size={15}/>重命名 / 移动</button><button hidden={isBlog} onClick={()=>{navigator.clipboard.writeText('[['+withoutExt(note.path)+']]').then(()=>setToast('双向链接已复制')).catch(()=>setToast('链接：[['+withoutExt(note.path)+']]'));setMenu(false);}}><Link2 size={15}/>复制双向链接</button><button className="danger-text" onClick={()=>{setDeleteTarget({path:note.path,type:'note',rev:note.rev});setMenu(false);}}><Trash2 size={15}/>删除笔记</button></div>}</div>}
        {isPublic?<button className="sync-button" disabled={busy} onClick={preparePublicPublish}><Globe size={15}/><span>发布到 GitHub</span></button>:isBlog?<><button className="sync-button" disabled={previewing||busy} onClick={previewBlog}>{previewing?<Loader2 size={15} className="spin"/>:<Eye size={15}/>}<span>{previewing?'启动预览…':'预览博客'}</span></button><button className="primary blog-publish-button" disabled={busy||previewing} onClick={preparePublish}><CloudUpload size={15}/>发布</button></>:<button className="sync-button" disabled={syncing} onClick={()=>git?.remote?sync():setDialog('sync')}>{syncing?<Loader2 size={15} className="spin"/>:<CloudUpload size={15}/>}<span>同步</span></button>}<button className={'icon-button '+(info?'toggled':'')} title="页面信息" aria-label="切换页面信息" onClick={()=>{if(window.innerWidth<980){setInfo(true);setInfoMobile(!infoMobile);}else setInfo(!info);}}><Settings2 size={17}/></button>
      </div>
    </div>
    {error&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{error}</span>{saveState==='error'&&<><button onClick={()=>flush().catch(()=>{})}>重试保存</button><button onClick={rescue}>另存草稿</button></>}<button className="icon-button" aria-label="关闭错误提示" onClick={()=>setError('')}><X size={16}/></button></div>}
    {showImageLibrary?<ImageLibrary workspace={workspace.id} notePath={note?.path} onClose={()=>setShowImageLibrary(false)}/>:loading?<div className="empty"><Loader2 className="spin"/>正在打开你的笔记…</div>:!note?<div className="empty"><BookOpen size={42}/><h1>从一个想法开始</h1><p>笔记保存在你的电脑，随时可以用 Markdown 打开。</p><button className="primary" onClick={()=>setDialog('note')}><Plus size={17}/>创建第一篇笔记</button></div>:<div className="work-area"><section className={'document '+(mode==='split'?'wide':'')}>
      <div className="document-scroll" ref={documentScroll}><div className="document-heading"><div className="document-eyebrow">{isDB?<><Table2 size={15}/> 数据库</>:<><FileText size={15}/> {isBlog?'HUGO 文章':isPublic?'PUBLIC MARKDOWN':'MARKDOWN 笔记'}</>}<span className="grow"/></div>
      <h1 className="document-title">{mode==='read'?<ReadableTitle title={note.meta.title??note.title}/>:<input className="document-title-input" aria-label="笔记标题" placeholder="无标题" value={note.meta.title??note.title} onChange={e=>change(editorRef.current?.getValue()??note.body,{...current.current.meta,title:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}/>}</h1><div className="document-properties"><label><Hash size={14}/><input aria-label="笔记标签" readOnly={mode==='read'} placeholder="添加标签，以逗号分隔" value={tagsInput} onChange={e=>{setTagsInput(e.target.value);updateTags(e.target.value,false);}} onBlur={()=>updateTags()} onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}/></label><span className="property-divider"/><span>{note.updated?new Date(note.updated).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'今天'}更新</span></div>{isBlog&&<BlogProperties key={note.path} note={note} readOnly={mode==='read'} onMeta={meta=>change(editorRef.current?.getValue()??current.current.body,meta)} api={api} onError={showError}/>}</div>

      <div className={'editor-area '+(busy?'busy':'')}>{isDB&&mode!=='split'?<Database key={note.path+mode} readOnly={mode==='read'} toolbarHost={toolsMount} note={note} onChange={body=>change(body)} onMeta={(meta,body)=>change(body,meta)}/>:<Editor workspace={workspace.id} key={note.path+mode} toolbarHost={toolsMount} note={note} mode={mode} theme={theme} onChange={body=>change(body)} onError={showError} editorRef={editorRef} pages={data.pages} onNavigate={navigate} anchorRequest={anchorRequest} onActiveHeadingChange={setActiveHeading} busy={busy}/>}</div>
      </div><footer className="document-footer"><span>{note.body.replace(/\s/g,'').length.toLocaleString()} 字符</span><span>{note.path}</span><span className="grow"/><span>Markdown · UTF-8</span></footer>
    </section>{info&&<aside className="page-info"><div className="info-section outline-section"><h3>本页目录</h3><nav className="outline-list" aria-label="本页目录" ref={outlineList}>{outline.length?outline.map(h=><button className={'outline-item '+(activeHeading===h.anchor?'active':'')} key={h.anchor} aria-current={activeHeading===h.anchor?'location':undefined} title={h.title} style={{paddingLeft:10+(h.level-1)*10}} onClick={()=>selectHeading(h.anchor)}><span>{h.title}</span></button>):<p>添加标题后显示目录</p>}</nav></div>{!isBlog&&<><div className="info-section"><h3><Link2 size={14}/>反向链接<span>{backlinks.length}</span></h3>{backlinks.length?backlinks.map(p=><button className="related-note" key={p.path} onClick={()=>open(p.path)}><FileText size={14}/>{p.title}<ArrowUpRight size={12}/></button>):<p>引用这篇笔记的页面会出现在这里。</p>}</div><div className="info-section"><h3>提到的笔记<span>{outgoing.length}</span></h3>{outgoing.length?outgoing.map(l=><button className="related-note" key={l} onClick={()=>navigate(l)}><Link2 size={14}/><span>{l.split('|')[1]||l.split('|')[0]}</span>{!resolveLink(l,data.pages,note.path)&&<small>未创建</small>}</button>):<p>使用 [[笔记名称]] 连接想法。</p>}</div></>}<div className="writing-tip"><CircleHelp size={16}/><p>{isBlog?'图片保存在文章目录。短代码、封面和主题效果请使用“预览博客”查看。':'直接粘贴图片即可保存。公式使用 $…$ 或 $$…$$ 书写。'}</p></div></aside>}</div>}
    </main>
    {dialog==='note'&&isPublic&&<NewPublicNoteDialog Dialog={Dialog} close={()=>setDialog(null)} onCreate={async values=>{await flush();const created=await api('note',values);await refresh();await open(created.path,true);setMode('edit');}}/>}
    {dialog==='note'&&isBlog&&<NewBlogDialog Dialog={Dialog} close={()=>setDialog(null)} onCreate={async values=>{await flush();const created=await api('note',values);await refresh();await open(created.path,true);setMode('edit');}}/>}
    {['note','database','folder','move','folder-move'].includes(dialog)&&!((isBlog||isPublic)&&dialog==='note')&&<FileDialog key={dialog} kind={dialog} workspaceName={workspace.name} note={dialog==='move'||dialog==='folder-move'?(moveTarget||note):note} folders={dialog==='folder-move'?data.folders.filter(folder=>folder!==moveTarget?.path&&!folder.startsWith((moveTarget?.path||'')+'/')):data.folders} close={()=>{setDialog(null);setMoveTarget(null);}} onSubmit={create}/>} 
    {deleteTarget&&<Dialog title={deleteTarget.type==='folder'?'删除文件夹':'删除笔记'} close={()=>{if(!deleting)setDeleteTarget(null);}}><p className="delete-description">将「{deleteTarget.path}」移入回收站？{deleteTarget.type==='folder'&&'文件夹内的所有笔记与子文件夹会一起移动。'}</p><p className="muted">可以在左下角的回收站恢复。{isPublic?'下次公开发布时，GitHub 中也会移除这些文件。':isBlog?'下次发布时，GitHub 中也会移除这些文件。':'点击同步后，GitHub 中也会移除这些文件。'}</p><div className="dialog-footer"><button className="secondary" disabled={deleting} onClick={()=>setDeleteTarget(null)}>取消</button><button className="danger-button" disabled={deleting} onClick={removeFile}>{deleting?'正在移动…':'移入回收站'}</button></div></Dialog>}
    {dialog==='trash'&&<TrashDialog api={api} workspaceName={workspace.name} close={()=>setDialog(null)} onRestored={async()=>{await refresh();await refreshGit();setToast('已恢复到原位置');}}/>}
    {dialog==='images'&&<ImageLibrary Dialog={Dialog} workspace={workspace.id} onClose={()=>setDialog(null)}/>}
    {dialog==='link'&&<LinkDialog pages={data.pages} current={note} close={()=>setDialog(null)} insert={value=>{editorRef.current?.insertMD(value);if(editorRef.current)change(editorRef.current.getValue());setDialog(null);}}/>}
    {dialog==='publish-public'&&isPublic&&<PublicPublishDialog Dialog={Dialog} api={api} close={()=>setDialog(null)} onPublished={result=>{setGit(result);refresh();}}/>}
    {dialog==='publish'&&isBlog&&<PublishDialog Dialog={Dialog} api={api} close={()=>setDialog(null)} onPublished={result=>{setGit(result);refresh();}}/>}
    {dialog==='sync'&&<Dialog title="GitHub 同步" close={()=>setDialog(null)}><div className="sync-details"><div className="sync-illustration"><CloudUpload size={28}/></div><h3>{git?.remote?'手动同步你的工作空间':'你的笔记已经保存在本机'}</h3><p>{git?.remote?'点击同步会先保存笔记，再将新增、修改和删除一并提交并推送到私人仓库。':'尚未关联 GitHub 仓库，笔记仍会正常保存到本机。'}</p>{git?.remote&&<><code>{git.remote}</code>{git.repositoryUrl&&<a className="repository-link" href={git.repositoryUrl} target="_blank" rel="noreferrer">打开 GitHub 仓库 <ArrowUpRight size={14}/></a>}<p>{git.syncedAt?'上次同步：'+new Date(git.syncedAt).toLocaleString('zh-CN'):'尚未完成首次网页同步'}</p></>}<div className="sync-fact"><Check size={16}/>编辑后自动保存至 notes 文件夹</div><div className="sync-fact"><Check size={16}/>图片保存在 assets 文件夹</div></div><div className="dialog-footer"><button className="secondary" onClick={()=>setDialog(null)}>关闭</button>{git?.remote&&<button className="primary" disabled={syncing} onClick={()=>{setDialog(null);sync();}}>立即同步</button>}</div></Dialog>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  </div>;
}
