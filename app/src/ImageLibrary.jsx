import React, { useEffect, useState } from 'react';
import { api } from './model';

const PAGE_SIZE = 100;
const IMAGE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp|ico)$/i;

function toServerImage(file, endpoint) {
  const name = typeof file?.name === 'string' ? file.name : '';
  const metadata = file?.metadata || {};
  const mime = metadata.MimeType || metadata.ContentType || metadata.mimeType || metadata.MIMEType || '';
  if (!name || (!IMAGE_EXTENSION.test(name) && !/^image\//i.test(mime))) return null;
  const encodedPath = name.split('/').map(part => encodeURIComponent(part)).join('/');
  const url = new URL(`/file/${encodedPath}`, endpoint).href;
  const filename = name.split('/').pop();
  const alt = filename.replace(/\.[^.]+$/, '').replace(/[\[\]\\\n]/g, '');
  return { id: name, name: filename, path: name, url, markdown: `![${alt}](${url})` };
}

export default function ImageLibrary({ workspace, notePath, onClose }) {
  const [settings, setSettings] = useState({ endpoint: '', uploadFolder: '', configured: false });
  const [token, setToken] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [serverFiles, setServerFiles] = useState([]);
  const [serverSearch, setServerSearch] = useState('');
  const [serverLoading, setServerLoading] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [serverProgress, setServerProgress] = useState(null);
  const [serverError, setServerError] = useState('');

  async function loadServerImages(endpoint = settings.endpoint) {
    if (!settings.configured && !endpoint) return;
    setServerLoading(true);
    setServerError('');
    setServerProgress({ loaded: 0, total: null });
    try {
      const allFiles = [];
      const seen = new Set();
      let start = 0;
      let total = 0;
      while (true) {
        const page = await api(`imgbed/files?start=${start}`, undefined, 'GET', workspace);
        const entries = Array.isArray(page.files) ? page.files : [];
        for (const entry of entries) {
          if (entry?.name && !seen.has(entry.name)) {
            seen.add(entry.name);
            allFiles.push(entry);
          }
        }
        total = Number(page.totalCount) || total;
        start += entries.length;
        setServerProgress({ loaded: start, total: total || null });
        if (!entries.length || entries.length < PAGE_SIZE || (total && start >= total)) break;
      }
      const images = allFiles.map(file => toServerImage(file, endpoint)).filter(Boolean);
      setServerFiles(images);
      setServerLoaded(true);
    } catch (e) {
      setServerError(e.message);
      setServerLoaded(false);
    } finally {
      setServerLoading(false);
      setServerProgress(null);
    }
  }

  async function loadSettings() {
    try {
      const result = await api('imgbed/settings', undefined, 'GET', workspace);
      setSettings(result);
      if (result.configured) await loadServerImages(result.endpoint);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await api('imgbed/settings', { endpoint: settings.endpoint, token, uploadFolder: settings.uploadFolder }, 'PUT', workspace);
      setSettings(result);
      setToken('');
      setMessage('ImgBed 配置和上传目录已保存');
      await loadServerImages(result.endpoint);
    } catch (e) {
      setError(e.message);
    }
  }

  async function upload(event) {
    const selected = [...(event.target.files || [])];
    event.target.value = '';
    if (!selected.length) return;
    if (!notePath) {
      setError('请先打开一篇笔记，再上传图片。');
      return;
    }
    setUploading(true);
    setError('');
    setMessage('');
    const results = [];
    try {
      for (const file of selected) {
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} 超过 10 MB，已跳过。`);
          continue;
        }
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
          setError(`${file.name} 不是支持的图片格式，已跳过。`);
          continue;
        }
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await api('upload', { data, mime: file.type, path: notePath, name: file.name, uploadFolder: settings.uploadFolder }, 'POST', workspace);
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]\\\n]/g, '');
        results.push({ name: file.name, markdown: `![${alt}](${result.url})` });
      }
      setFiles(previous => [...results, ...previous]);
      if (results.length) {
        setMessage(`成功上传 ${results.length} 张图片，Markdown 链接已生成。`);
        await loadServerImages(settings.endpoint);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function copy(markdown) {
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage('Markdown 图片链接已复制');
    } catch {
      setError('无法访问剪贴板，请检查浏览器权限。');
    }
  }

  const visibleServerFiles = serverFiles.filter(file => `${file.name} ${file.path}`.toLowerCase().includes(serverSearch.trim().toLowerCase()));

  return <section className="image-library-page"><header><div><h1>图片上传</h1><p>上传后会保存本机备份并发送到 ImgBed，生成可直接粘贴到 Markdown 的图片链接。</p></div><button className="secondary" onClick={onClose}>返回笔记</button></header><div className="image-library">
    <form className="imgbed-settings" onSubmit={save}><div><strong>CloudFlare ImgBed</strong><small>{settings.configured ? '已配置；Token 保存在本机 .local 配置中' : '配置 ImgBed 地址和 API Token'}</small></div><label>服务地址<input type="url" required value={settings.endpoint} onChange={e => setSettings({ ...settings, endpoint: e.target.value })} placeholder="https://your-imgbed.example.com"/></label><label>API Token<input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder={settings.configured ? '已保存；留空则保持不变' : '填写 ImgBed API Token'} autoComplete="new-password"/></label><label>服务器文件夹<input value={settings.uploadFolder} onChange={e => setSettings({ ...settings, uploadFolder: e.target.value })} placeholder="留空上传到根目录，例如 images/notes"/><small>输入相对路径；该目录用于此工作台后续上传。</small></label><button className="secondary">保存配置</button></form>
    <label className="image-upload-drop">{uploading ? '正在上传…' : '选择图片上传'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={uploading || !settings.configured} onChange={upload}/><small>支持 PNG、JPG、WebP、GIF，单张最大 10 MB。当前笔记：{notePath || '未打开'}</small></label>
    {error && <p className="form-error">{error}</p>}{message && <p className="muted">{message}</p>}
    {files.length > 0 && <div className="uploaded-markdown"><h2>Markdown 图片链接</h2>{files.map((file, index) => <article key={file.markdown + index}><strong>{file.name}</strong><code>{file.markdown}</code><button className="secondary" onClick={() => copy(file.markdown)}>复制 Markdown</button></article>)}</div>}
    <section className="server-image-library">
      <header><div><h2>服务器图片</h2><p>{serverLoaded ? `共 ${serverFiles.length} 张图片` : '查看 ImgBed 所有文件夹中的图片'}</p></div><div className="server-image-actions"><input type="search" placeholder="搜索图片名称或文件夹" value={serverSearch} onChange={e => setServerSearch(e.target.value)}/><button className="secondary" disabled={!settings.configured || serverLoading} onClick={() => loadServerImages()}>{serverLoading ? '正在读取…' : serverLoaded ? '刷新列表' : '查看服务器图片'}</button></div></header>
      {serverLoading && <p className="muted">正在读取服务器图片{serverProgress ? `（${serverProgress.loaded}${serverProgress.total ? ` / ${serverProgress.total}` : ''}）` : '…'}</p>}
      {serverError && <p className="form-error">{serverError}</p>}
      {serverLoaded && serverFiles.length === 0 && <p className="muted">服务器上还没有图片。</p>}
      {serverLoaded && serverFiles.length > 0 && visibleServerFiles.length === 0 && <p className="muted">没有找到匹配的图片。</p>}
      <div className="server-image-grid">{visibleServerFiles.map(file => <article className="server-image-card" key={file.id}>
        <a className="server-image-preview" href={file.url} target="_blank" rel="noreferrer" title={file.path}><img src={file.url} alt={file.name} loading="lazy"/></a>
        <div className="server-image-details"><strong title={file.name}>{file.name}</strong><small title={file.path}>{file.path}</small><button className="secondary" onClick={() => copy(file.markdown)}>复制 Markdown</button></div>
      </article>)}</div>
    </section>
  </div></section>;
}
