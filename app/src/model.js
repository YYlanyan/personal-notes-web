export const withoutExt = value => value.replace(/\.md$/i, '');
export const basename = value => withoutExt(value.split('/').pop());
export function parseNoteLink(value) {
  const [target, ...label] = value.split('|');
  const hash = target.indexOf('#');
  return { path: (hash < 0 ? target : target.slice(0, hash)).trim(), anchor: hash < 0 ? '' : target.slice(hash + 1).trim(), label: label.join('|') };
}
export function resolveLink(target, pages, source = '') {
  const clean = withoutExt(parseNoteLink(target).path);
  if (!clean) return pages.find(p => p.path === source);
  const parts = source.split('/').slice(0, -1);
  for (const bit of clean.split('/')) { if (bit === '..') parts.pop(); else if (bit !== '.') parts.push(bit); }
  return pages.find(p => withoutExt(p.path) === clean)
    || pages.find(p => withoutExt(p.path) === parts.join('/'))
    || pages.find(p => p.title === clean || basename(p.path) === clean);
}
export function links(body = '') {
  const stripped = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  return [...stripped.matchAll(/\[\[([^\]\n]+)\]\]/g)].map(m => m[1]);
}
export function headings(body = '') {
  const counts = new Map();
  return [...proseOnly(body).matchAll(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map(m => {
    const title = headingText(m[2]), count = (counts.get(title) || 0) + 1;
    counts.set(title, count);
    return { level:m[1].length, title, anchor:title + (count > 1 ? '~' + count : '') };
  });
}
export const headingText = value => value.replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`_~]/g, '').replace(/\u200b/g, '').trim();
function proseOnly(body) { return body.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, ''); }
export function blockAnchors(body = '') {
  const result = [], lines = proseOnly(body).split('\n');
  let previous = '';
  for (const line of lines) {
    const match = line.match(/(?:^|\s)\^([\p{L}\p{N}_-]+)\s*$/u);
    if (match) result.push({anchor:'^'+match[1],title:line.slice(0,match.index).trim() || previous || match[1]});
    if (line.trim()) previous = line.trim();
  }
  return result;
}
export function parseTable(body) {
  const lines = body.trim().split('\n').filter(l => l.trim().startsWith('|'));
  const cells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(v => v.trim().replace(/\\\|/g, '|').replace(/<br\s*\/?>/g, '\n').replace(/&lt;/g,'<').replace(/&amp;/g,'&'));
  if(lines.length < 2) return { headers:[], rows:[] };
  return { headers:cells(lines[0]), rows:lines.slice(2).map(cells) };
}
export function serializeTable(columns, rows) {
  const escape = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\|/g,'\\|').replace(/\n/g,'<br>');
  const line = values => '| ' + values.map(escape).join(' | ') + ' |';
  return [line(columns.map(c=>c.name)), line(columns.map(()=>'---')), ...rows.map(r=>line(columns.map((_,i)=>r[i] || '')))].join('\n') + '\n';
}
export async function api(url, data, method = 'POST', workspace = 'notes') {
  const prefix=workspace==='blog'?'/workspaces/blog':workspace==='public'?'/workspaces/public':'';
  const response = await fetch(prefix + '/api/' + url, data === undefined ? {} : { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const result = await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error || '操作失败'),{status:response.status});
  return result;
}
