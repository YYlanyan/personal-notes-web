import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTable,serializeTable,resolveLink,links} from '../src/model.js';
test('database roundtrip preserves escaped pipes, linebreaks and markup',()=>{const cols=[{name:'名字'},{name:'内容'}];const rows=[['A|B','line1\nline2'],['<>','&lt;']];assert.deepEqual(parseTable(serializeTable(cols,rows)).rows,rows);});
test('links resolve full paths and relative paths; code is excluded',()=>{const pages=[{path:'书/想法.md',title:'想法'},{path:'日记.md',title:'日记'}];assert.equal(resolveLink('想法',pages,'书/摘录.md').path,'书/想法.md');assert.equal(resolveLink('../日记',pages,'书/摘录.md').path,'日记.md');assert.deepEqual(links('[[日记]] `[[代码]]`\n```\n[[忽略]]\n```'),['日记']);});
