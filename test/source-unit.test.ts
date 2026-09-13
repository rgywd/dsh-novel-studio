import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource,boundaryOf,correctDirectory,createSource } from '../src/sources.js';
import { Store,hash } from '../src/store.js';
import { Domain } from '../src/domain.js';

test('source parsing: exact offsets, repeat numbering, missing chapters, volume boundaries and immutable corrections',()=>{
 const raw='序章\r\n第一段。\r\n第一卷 渡口\r\n第1章 同名\r\n原文一。\r\n第3章 缺章\r\n原文三。\r\n第二卷\r\n第1章 同名\r\n另一卷。\r\n';
 const store=new Store(':memory:'),domain=new Domain(store);try{const {work,version:v}=createSource(domain,{title:'目录测试',files:[{name:'目录.txt',raw}]});assert.equal(v.raw,raw);assert.equal(v.hash,hash(raw));assert.equal(v.chapters.length,4);assert.ok(v.warnings.some(w=>w.includes('不连续')));assert.ok(v.warnings.some(w=>w.includes('重名')));assert.equal(new Set(v.chapters.map(c=>c.id)).size,4);
  assert.equal(boundaryOf(v,{kind:'after-chapter',id:v.chapters[2].id}).cutoff,3);assert.equal(boundaryOf(v,{kind:'before-chapter',id:v.chapters[2].id}).cutoff,2);assert.equal(boundaryOf(v,{kind:'after-volume',id:v.chapters[1].volumeId}).cutoff,3);assert.equal(boundaryOf(v,{kind:'before-volume',id:v.chapters[3].volumeId}).cutoff,3);
  const revised=correctDirectory(domain,v.id,v.chapters.map(({ordinal,...c})=>({...c,title:c.title+'校正'})));assert.notEqual(revised.id,v.id);assert.equal(revised.raw,raw);assert.equal(revised.hash,v.hash);assert.equal(JSON.parse(store.db.prepare('SELECT data FROM source_versions WHERE id=?').get(v.id)!.data as string).chapters[0].title,'序章');
  assert.throws(()=>correctDirectory(domain,v.id,[v.chapters[0],v.chapters[0]]),/ID不能重复/);
 }finally{store.close();}
});
test('source text package: original bytes, Chinese legacy decoding, excluded author-only materials and explicit format errors',()=>{
 const gb=Buffer.from([0xd6,0xd0,0xce,0xc4]);const v=parseSource({title:'资料包',files:[{name:'人物.txt',base64:gb.toString('base64'),encoding:'gb18030',kind:'character'},{name:'世界.md',raw:'规则：火焰需要空气。',kind:'world'},{name:'后期.txt',raw:'作者隔离参考秘密',scope:'author-reference'}]});assert.equal(v.raw.slice(0,2),'中文');assert.equal(v.materials[0].originalBase64,gb.toString('base64'));assert.equal(boundaryOf(v,{kind:'all-materials',id:null}).chapters.length,2);assert.ok(v.chapters[2].excluded);assert.throws(()=>parseSource({title:'空',files:[{name:'a.md',raw:''}]}),/为空/);assert.throws(()=>parseSource({title:'epub',files:[{name:'a.epub',raw:'x'}]}),/支持TXT/);
});
