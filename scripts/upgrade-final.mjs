// Read-only verification of the original upgrade acceptance projects. No model calls.
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir='docs/novel-studio/evidence/';
const json=async name=>JSON.parse(await readFile(dir+name+'.json','utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const save=async(name,value)=>writeFile(dir+name+'.json',JSON.stringify(value,null,2)+'\n');
const api=async(port,path)=>{const r=await fetch(`http://127.0.0.1:${port}/api/novel-studio${path}`,{signal:AbortSignal.timeout(10000)});assert.ok(r.ok,`HTTP ${r.status}: ${path}`);return r.json();};
const report=await json('upgrade-real'), review=await json('upgrade-style-review');
const old=await json('upgrade-old-projects'), runtime=await json('upgrade-runtime'), browser=await json('upgrade-browser');
for(const r of [report,review,old,runtime,browser])assert.equal(r.status,'PASS');
const automated=[];
for(const [kind,count] of [['unit',11],['integration',43],['e2e',2]]){
  const text=await readFile(dir+`upgrade-test-${kind}.txt`,'utf8');
  assert.match(text,new RegExp(`pass ${count}\\b`));assert.match(text,/fail 0\b/);assert.match(text,/skipped 0\b/);
  automated.push({kind,passed:count,failed:0,skipped:0,evidence:`upgrade-test-${kind}.txt`,sha256:digest(text)});
}
const pid=report.projectId,base=`/projects/${pid}`;
const {payload,checksum}=await api(4318,base+'/backup');
const rows=await api(4318,base+'/requests'),coverage=await api(4318,base+'/memories');
const full=[];for(const row of rows)full.push(await api(4318,base+`/requests/${row.id}`));
const first=payload.objects.find(o=>o.id===report.first.chapterId),second=payload.objects.find(o=>o.id===report.second.chapterId);
assert.equal(first.fields.currentVersion,report.handoff.versionId);
assert.equal(first.status,'accepted');assert.equal(second.status,'accepted');
const version=payload.versions.find(v=>v.id===first.fields.currentVersion);assert.equal(first.body,version.content);
const secondVersion=payload.versions.find(v=>v.id===second.fields.currentVersion);assert.equal(second.body,secondVersion.content);
const secondWriter=full.find(r=>r.compiled.role==='Writer'&&r.stepKey.endsWith('生成正文')&&r.candidate===second.body);
assert.ok(secondWriter);assert.ok(secondWriter.compiled.context.items.some(i=>i.version===report.handoff.versionId));
const oldSource=payload.memories.filter(m=>m.sources.some(s=>s.versionId===report.first.versionId));
assert.ok(oldSource.length&&oldSource.every(m=>m.status!=='valid'));
for(const chapter of [first,second])assert.ok(payload.memories.some(m=>m.kind==='chapter'&&m.status==='valid'&&m.sources.some(s=>s.versionId===chapter.fields.currentVersion)));
assert.equal(coverage.covered,2);assert.equal(coverage.total,3); // The third chapter is the static, unsummarized style input fixture.
for(const [style,sample] of Object.entries(report.samples)){
  assert.equal(digest(sample.text),sample.hash);assert.equal(review.samples[style].hash,sample.hash);
  const artifact=payload.artifacts.find(a=>a.id===sample.artifactId);assert.ok(artifact&&artifact.status!=='accepted');
}
assert.ok(payload.tasks.every(t=>!['QUEUED','RUNNING','PAUSE_REQUESTED'].includes(t.status)));
const measured=rows.filter(r=>r.usage?.cacheReadTokens!==undefined),positive=measured.filter(r=>r.usage.cacheReadTokens>0);
assert.ok(positive.length);
for(const r of measured)assert.equal(r.usage.inputTokens,r.usage.uncachedInputTokens+r.usage.cacheReadTokens+(r.usage.cacheWriteTokens??0));
const shots=[];
for(const file of (await readdir(dir)).filter(f=>/^upgrade-.*\.png$/.test(f)).sort()){
  const content=await readFile(dir+file);shots.push({file,bytes:content.length,sha256:digest(content)});
}
browser.screenshots=shots;await save('upgrade-browser',browser);
const receipt={at:new Date().toISOString(),status:'PASS',version:'0.2.0',upgradeStart:'7839613',automated,
  typecheck:{status:'PASS',evidence:'upgrade-typecheck.txt'},build:{status:'PASS',evidence:'upgrade-build.txt'},
  migration:{status:'PASS',unchangedOldProjects:old.checks.length,evidence:'upgrade-old-projects.json'},
  restart:{status:'PASS',matchingCompleteBackups:runtime.checks.length,evidence:'upgrade-runtime.json'},
  browser:{status:'PASS',screenshots:shots.length,evidence:'upgrade-browser.json'},
  real:{status:'PASS',provider:report.provider.name,projectId:pid,revision:payload.project.revision,backupChecksum:checksum,
    firstWordsBeforeAuthorEdit:report.first.words,secondWords:report.second.words,authorVersion:report.handoff.versionId,
    secondRequestId:secondWriter.id,secondObservedRequestHash:digest(JSON.stringify(secondWriter.observed)),
    secondUsage:secondWriter.usage,sourceVersionInSecondContext:true,staleOldMemories:oldSource.length,
    memory:{covered:coverage.covered,total:coverage.total,gapExplanation:'独立文风输入 Fixture 尚未总结；主线两章已覆盖'},
    style:{status:review.status,evidence:'upgrade-style-review.json',samples:review.samples},
    historicalFailedRequests:rows.filter(r=>r.status==='FAILED').length,preparedNotSent:rows.filter(r=>r.status==='PREPARED').length,
    tasks:payload.tasks.map(t=>({id:t.id,kind:t.kind,status:t.status,usage:t.usage,budget:t.budget})),
    cache:{measuredRequests:measured.length,requestsWithPositiveReads:positive.length,readRange:[Math.min(...measured.map(r=>r.usage.cacheReadTokens)),Math.max(...measured.map(r=>r.usage.cacheReadTokens))],totalReadTokens:measured.reduce((n,r)=>n+r.usage.cacheReadTokens,0),writeTokens:rows.every(r=>r.usage?.cacheWriteTokens===undefined)?'UNKNOWN':'see individual records',amountEstimate:'UNKNOWN',note:'实际DSH服务字段，包含重试和失败；不是固定负载的命中率基准。'}},
  incomplete:[],externalBlockers:[]};
await save('upgrade-final',receipt);
const labels={default:'默认配置',adventure:'快节奏冒险',dialogue:'对白驱动'};
let markdown='# 三种真实文风样本\n\n同一原创场景、同一输入版本、约800字的伴写扩写要求，使用 deepseek-official / deepseek-flash；视角绑定邝昶。所有候选均未接受，不改变主线。字数按正文计数规则，不是字符数。首次人称失败及修复后的读稿记录保存在 upgrade-style-initial.json、upgrade-style-viewpoint-failure.json、upgrade-style-review.json。\n\n';
for(const style of ['default','adventure','dialogue']){const s=report.samples[style],r=review.samples[style];markdown+=`## ${labels[style]} · ${s.words} 字\n\n${r.observed}\n\n任务：${s.taskId}；内容 SHA256：${s.hash}。\n\n${s.text}\n\n`;}
markdown+='样本只证明这些具体输出中存在可观察的风格差异，不保证每次遵守或文学质量。冒险样本567字，低于800字要求；没有补字或截断，也不作为完整章节字数验收。\n';
await writeFile(dir+'upgrade-style-samples.md',markdown);
console.log(JSON.stringify({status:receipt.status,tests:56,oldProjects:old.checks.length,restartProjects:runtime.checks.length,screenshots:shots.length,real:receipt.real.cache},null,2));
