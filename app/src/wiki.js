// Keep wiki notation on disk while presenting ordinary clickable links to Vditor.
function prose(markdown, transform) {
  return markdown.split(/(`{3,}[^\n]*\n[\s\S]*?`{3,}|~{3,}[^\n]*\n[\s\S]*?~{3,}|`+[^`\n]*`+|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)
    .map((part,index)=>index%2?part:transform(part)).join('');
}
export function renderWikiLinks(markdown) {
  return prose(markdown, text=>text.replace(/\[\[([^\]\n]+)\]\]/g,(_,value)=>{
    const label=(value.split('|')[1]||value.split('|')[0]).replace(/([\\\[\]])/g,'\\$1').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const encoded=encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    return `[${label}](#wiki=${encoded})`;
  }));
}
export function restoreWikiLinks(markdown) {
  return prose(markdown,text=>text.replace(/\[((?:\\.|[^\]\\\n])*)\]\([^\s)]*#wiki=([^\s)]+)\)/g,(all,label,encoded)=>{
    try{return '[['+decodeURIComponent(encoded)+']]';}catch{return all;}
  }));
}
