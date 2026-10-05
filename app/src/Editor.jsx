import React, { useEffect, useRef } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { api, withoutExt } from './model';
import { renderNotePreview } from './preview';
import useOutlineTracking, { outlineOffset, outlineTargets } from './useOutlineTracking';

const escape = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default function Editor({ note, mode, theme, onChange, onError, editorRef, pages, onNavigate, anchorRequest, onActiveHeadingChange, busy, toolbarHost, workspace='notes' }) {
  const host = useRef(null), toolbar = useRef(null), instance = useRef(null), pinnedHeading = useRef(''), live = useRef({onChange,onError,pages,onNavigate,theme,toolbarHost});
  live.current = {onChange,onError,pages,onNavigate,theme,toolbarHost,onActiveHeadingChange,body:note.body};
  useOutlineTracking(host,mode,live,pinnedHeading);
  useEffect(() => {
    let disposed = false, ready = false;
    const folder = note.path.split('/').slice(0,-1).map(encodeURIComponent).join('/');
    const fileRoot=workspace==='blog'?'/workspaces/blog/files/content/':workspace==='public'?'/workspaces/public/files/':'/files/notes/';
    const base = fileRoot + (folder ? folder+'/' : '');
    const editor = new Vditor(host.current, {
      cdn:'/vendor/vditor', lang:'zh_CN', mode:'sv',
      cache:{enable:false}, undoDelay:100, value:note.body, height:'auto', minHeight:360,
      placeholder:'写下你的想法…', theme:live.current.theme === 'dark' ? 'dark' : 'classic',
      toolbar:['headings','bold','italic','strike','|','list','ordered-list','check','quote','|','link','upload','code','inline-code','table','|','undo','redo'],
      link:{isOpen:false}, toolbarConfig:{pin:false}, counter:{enable:false}, outline:{enable:false},
      preview:{ delay:150, maxWidth:900, mode:mode==='edit'?'editor':'both', markdown:{sanitize:true,linkBase:location.origin+base}, math:{engine:'KaTeX'}, hljs:{enable:true,lineNumber:false,style:'github'}, theme:{current:live.current.theme === 'dark' ? 'dark' : 'light',path:'/vendor/vditor/dist/css/content-theme'}, actions:[],
        transform:html=>renderNotePreview(html,location.origin+base,workspace)
      },
      hint:{delay:150,extend:workspace==='blog'?[]:[{key:'[[',hint:query=>live.current.pages.filter(p=>p.title.includes(query)||p.path.includes(query)).slice(0,8).map(p=>({html:escape(p.title),value:'[['+withoutExt(p.path)+']]'}))}]},
      input(value) { if(!disposed&&ready&&mode!=='read')live.current.onChange(value); },
      after() {
        ready=true;if(disposed){editor.destroy();return;}
        instance.current=editor;
        if(mode==='read')editor.disabled();else editorRef.current=editor;
        toolbar.current=host.current.querySelector('.vditor-toolbar');
        if(mode!=='read'&&toolbar.current&&live.current.toolbarHost)live.current.toolbarHost.appendChild(toolbar.current);
        editor.setTheme(live.current.theme==='dark'?'dark':'classic',live.current.theme==='dark'?'dark':'light',live.current.theme==='dark'?'github-dark':'github','/vendor/vditor/dist/css/content-theme');
      },
      upload:{accept:'image/png,image/jpeg,image/webp,image/gif',max:10*1024*1024,
        async handler(files) {
          try {
            for(const file of files) {
              if(file.size>10*1024*1024) throw new Error('图片请小于 10 MB');
              const data = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
              const result=await api('upload',{data,mime:file.type,path:note.path},'POST',workspace);
              if(!disposed) { editor.insertMD(`![${file.name.replace(/[\[\]\\\n]/g,'')}](${result.url})\n`);live.current.onChange(editor.getValue()); }
            }
            return null;
          } catch(e){live.current.onError(e.message);return e.message;}
        }
      }
    });
    const container=host.current;
    const click = event => {
      const a=event.target.closest('a');if(!a)return;
      const href=a.getAttribute('href')||'';
      if(href.includes('#wiki=')) {
        event.preventDefault();event.stopImmediatePropagation();
        try{live.current.onNavigate(decodeURIComponent(href.split('#wiki=')[1]));}catch{live.current.onError('笔记链接格式无效');}
      } else if(href.startsWith('#')) {
        event.preventDefault();event.stopImmediatePropagation();
        try{live.current.onNavigate(decodeURIComponent(href));}catch{live.current.onError('笔记链接格式无效');}
      } else if(/\.md(?:#|$)/i.test(href)) {
        const url=new URL(href,location.origin+base);
        if(url.origin!==location.origin||!url.pathname.startsWith(fileRoot))return;
        event.preventDefault();event.stopImmediatePropagation();
        try{live.current.onNavigate(decodeURIComponent(url.pathname.slice(fileRoot.length))+decodeURIComponent(url.hash));}catch{live.current.onError('笔记链接格式无效');}
      } else if(/^https?:/.test(href)) {
        event.preventDefault();event.stopImmediatePropagation();window.open(href,'_blank','noopener,noreferrer');
      }
    };
    container.addEventListener('click',click,true);
    return ()=>{disposed=true;container.removeEventListener('click',click,true);toolbar.current?.remove();toolbar.current=null;instance.current=null;if(editorRef.current===editor)editorRef.current=null;if(ready)editor.destroy();};
  }, []);
  useEffect(()=>{
    if(!anchorRequest || anchorRequest.path!==note.path)return;
    const root=host.current;
    let finished=false,frame,highlightTimer,highlighted;
    const locate=()=>{
      if(finished)return;
      const preview=root?.querySelector('.vditor-preview');
      const candidates=preview?[...preview.querySelectorAll('[data-note-anchor],[id]')]:[];
      const entries=outlineTargets(root,mode,live.current.body);
      const target=mode==='edit'?entries.find(item=>item.anchor===anchorRequest.anchor)?.element:candidates.find(el=>el.dataset.noteAnchor===anchorRequest.anchor)||candidates.find(el=>el.id===anchorRequest.anchor);
      if(!target)return;
      finished=true;observer.disconnect();clearTimeout(timeout);
      frame=requestAnimationFrame(()=>{
        const scroller=root.closest('.document-scroll');
        const entry=entries.find(item=>item.element===target);
        pinnedHeading.current=entry?.anchor||'';
        if(entry)live.current.onActiveHeadingChange?.(entry.anchor);
        if(scroller)scroller.scrollTo({top:scroller.scrollTop+target.getBoundingClientRect().top-scroller.getBoundingClientRect().top-outlineOffset(scroller),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        target.classList.add('note-anchor-highlight');highlighted=target;
        highlightTimer=setTimeout(()=>target.classList.remove('note-anchor-highlight'),2200);
      });
    };
    const observer=new MutationObserver(locate);
    observer.observe(root,{childList:true,subtree:true});
    const timeout=setTimeout(()=>{observer.disconnect();if(!finished)live.current.onError('已打开笔记，但找不到位置：'+anchorRequest.anchor+'。标题或段落标识可能已被修改。');},6000);
    locate();
    return()=>{observer.disconnect();clearTimeout(timeout);clearTimeout(highlightTimer);cancelAnimationFrame(frame);highlighted?.classList.remove('note-anchor-highlight');};
  },[anchorRequest,mode,note.path]);
  useEffect(()=>{if(mode!=='read'&&toolbar.current&&toolbarHost)toolbarHost.appendChild(toolbar.current);},[toolbarHost]);
  useEffect(()=>{instance.current?.setTheme(theme==='dark'?'dark':'classic',theme==='dark'?'dark':'light',theme==='dark'?'github-dark':'github','/vendor/vditor/dist/css/content-theme');},[theme]);
  useEffect(()=>{if(instance.current){if(busy||mode==='read')instance.current.disabled();else instance.current.enable();}},[busy]);
  return <div className={'editor-host editor-mode-'+mode} ref={host}/>;
}
