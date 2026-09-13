import test from 'node:test';import assert from 'node:assert/strict';
import { validateReview } from '../src/review.js';import { fixture,reviewFor } from './helpers.js';
test('E: unique-key conflict cites both exact sources and location',()=>{const f=fixture();const fact=f.add({kind:'fact',title:'钥匙持有者',status:'accepted',fields:{entityId:f.key.id,property:'holder',value:'闻溪'},source:{type:'user',quote:'沈砚把铜钥匙交给了闻溪。'}});const body='下一刻，沈砚取出钥匙开了门。';const r=validateReview(reviewFor(f.key.id,'沈砚','沈砚取出钥匙开了门。'),body,f.store.objects(f.p.id),[fact]);assert.equal(r.issues.length,1);assert.equal(r.issues[0].blocks,true);assert.equal(r.issues[0].start,4);assert.equal(r.issues[0].sourceQuote,'沈砚把铜钥匙交给了闻溪。');f.store.close();});
test('E: memory and explicit retrieval are not current-state conflicts',()=>{const f=fixture();const fact=f.add({kind:'fact',title:'持有者',status:'accepted',fields:{entityId:f.key.id,property:'holder',value:'闻溪'},source:{type:'user',quote:'钥匙交给闻溪'}});const body='他回忆起昨日，自己用钥匙开了门。';assert.equal(validateReview(reviewFor(f.key.id,'沈砚',body,{modality:'memory'}),body,f.store.objects(f.p.id),[fact]).issues.length,0);const retrieval='闻溪把钥匙还给沈砚，他接过钥匙开了门。';assert.equal(validateReview(reviewFor(f.key.id,'沈砚',retrieval,{transition:{from:'闻溪',reason:'闻溪在正文中明确归还钥匙'}}),retrieval,f.store.objects(f.p.id),[fact]).issues.length,0);f.store.close();});
test('evidence fabrication and empty short chapters fail validation',()=>{const f=fixture();assert.throws(()=>validateReview(reviewFor(f.key.id,'沈砚','不存在的引文'),'真正的正文',f.store.objects(f.p.id),[]),/claims\[0\].quote/);const review=validateReview({summary:'短文',claims:[],events:[],issues:[]},'短文',[],[],2000);assert.ok(review.issues.some(i=>i.category==='length'&&i.blocks));f.store.close();});
test('holder identity IDs and names refer to the same character without erasing source values',()=>{const f=fixture();const fact=f.add({kind:'fact',title:'持有者',status:'accepted',fields:{entityId:f.key.id,property:'holder',value:f.b.id},source:{type:'user',quote:'闻溪持有铜钥匙'}});const body='铜钥匙仍在闻溪的口袋里。';const review=validateReview(reviewFor(f.key.id,'闻溪',body),body,f.store.objects(f.p.id),[fact]);assert.equal(review.issues.length,0);assert.equal(f.domain.object(f.p.id,fact.id).fields.value,f.b.id);f.store.close();});
test('inherited obligations cannot be reattributed to a new chapter memory; diagnostics identify the exact path',()=>{
 const f=fixture();try{const body='沈砚望着门外。',review={summary:'望向门外',claims:[],events:[],issues:[],memory:{summary:'本章',scenes:[],obligations:[{content:'旧承诺',quote:'旧章约定归还钥匙。',entityIds:[],state:'open',inference:false}]}};
 assert.throws(()=>validateReview(review,body,f.store.objects(f.p.id),[]),/memory.obligations\[0\].quote/);
 review.memory.obligations[0].quote=body;assert.ok(validateReview(review,body,f.store.objects(f.p.id),[]).memory);
 }finally{f.store.close();}
});

test('task evidence diagnostics identify the actual source without accepting a wrong chapter attribution',()=>{
 const f=fixture();try{
  const goal='核对度量，不改写已经接受的上一章。',source={...f.chapter,id:'task-contract:test',body:goal,fields:{goal}};
  const issue={category:'scope',severity:'warning',quote:'他核对水尺。',message:'范围核对',sourceId:f.chapter.id,sourceQuote:goal,rationale:'需引用任务约定',suggestion:'核对出处',blocks:false};
  const raw={summary:'核对',claims:[],events:[],issues:[issue]};const objects=[...f.store.objects(f.p.id),source];
  assert.throws(()=>validateReview(raw,issue.quote,objects,[]),/实际存在于以下来源.*task-contract:test/);
  issue.sourceId=source.id;assert.equal(validateReview(raw,issue.quote,objects,[]).issues[0].sourceId,source.id);
 }finally{f.store.close();}
});
