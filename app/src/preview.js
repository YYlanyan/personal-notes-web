import { headingText } from './model';

export function renderNotePreview(html, base, workspace='notes') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if(workspace==='blog') {
    for(const image of doc.querySelectorAll('img[src]')) {
      const src=image.getAttribute('src');
      if(src.startsWith('/')&&!src.startsWith('//')&&!src.startsWith('/workspaces/'))image.src='/workspaces/blog/files/static'+src;
      else {try{image.src=new URL(src,base).href;}catch{}}
    }
  }
  const counts = new Map();
  for (const heading of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const title = headingText(heading.textContent), count = (counts.get(title) || 0) + 1;
    counts.set(title, count);
    heading.dataset.noteAnchor = title + (count > 1 ? '~' + count : '');
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!node.parentElement || node.parentElement.closest('code,pre,a,script,style')) continue;
    const block = node.parentElement.closest('p,li,blockquote');
    const marker = node.textContent.match(/(?:^|\s)\^([\p{L}\p{N}_-]+)\s*$/u);
    if (marker && block && block.textContent.trim().endsWith('^' + marker[1])) {
      const target = block.textContent.trim() === '^' + marker[1] ? block.previousElementSibling || block : block;
      target.dataset.noteAnchor = '^' + marker[1];
      node.textContent = node.textContent.slice(0, marker.index);
      if (target !== block) block.hidden = true;
    }
    if (!node.textContent.includes('[[')) continue;
    const fragment = doc.createDocumentFragment();
    for (const part of node.textContent.split(/(\[\[[^\]\n]+\]\])/g)) {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const value = part.slice(2,-2), link = doc.createElement('a');
        link.href = '#wiki=' + encodeURIComponent(value);
        link.textContent = value.split('|')[1] || value.split('|')[0];
        link.className = 'wiki-link';
        fragment.append(link);
      } else fragment.append(doc.createTextNode(part));
    }
    node.replaceWith(fragment);
  }
  // A normal Markdown link to a video remains portable and renders as a local player.
  for (const link of doc.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(link.getAttribute('href'), base); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !/\.(mp4|webm|ogv)$/i.test(url.pathname)) continue;
    const video = doc.createElement('video');
    video.controls = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.src = url.href;
    video.setAttribute('aria-label', link.textContent || '笔记视频');
    video.textContent = '浏览器不支持播放此视频。';
    const wrapper = doc.createElement('span');
    wrapper.className = 'note-video';
    link.textContent = (link.textContent || '视频') + ' · 打开原视频';
    link.className = 'video-download';
    link.replaceWith(wrapper);
    wrapper.append(video, link);
  }
  return doc.body.innerHTML;
}
