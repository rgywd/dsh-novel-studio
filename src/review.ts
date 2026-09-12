import { claimSchema, countWords, id, requireThat, reviewSchema, type Review, type ReviewIssue, type StoryObject } from './contracts.js';

export function validateReview(raw:unknown,body:string,objects:StoryObject[],canon:StoryObject[],targetWords?:number):Review {
  const parsed=reviewSchema.parse(raw);const byId=new Map(objects.map(o=>[o.id,o]));
  const issues:ReviewIssue[]=parsed.issues.map(i=>{
    requireThat(i.quote===''||body.includes(i.quote),'INVALID_EVIDENCE','审校问题引用未出现在本章',422);
    if(i.sourceId)requireThat(byId.has(i.sourceId),'INVALID_EVIDENCE','审校引用了不存在的资料',422);
    if(i.sourceId&&i.sourceQuote){const o=byId.get(i.sourceId)!;requireThat([o.body,o.source?.quote,JSON.stringify(o.fields)].some(x=>x?.includes(i.sourceQuote)),'INVALID_EVIDENCE','冲突资料引用无法核对',422);}
    const start=i.quote?body.indexOf(i.quote):0;return {...i,blocks:i.blocks||i.severity==='critical',id:id('issue'),start,end:start+i.quote.length,status:'open',engine:'ai'};
  });
  for(const c of parsed.claims){claimSchema.parse(c);requireThat(byId.has(c.entityId),'INVALID_ENTITY','事实引用了未知实体',422);requireThat(body.includes(c.quote),'INVALID_EVIDENCE','事实引用未出现在本章',422);}
  for(const e of parsed.events){requireThat(body.includes(e.quote),'INVALID_EVIDENCE','事件引用未出现在本章',422);requireThat(e.entityIds.every(x=>byId.has(x)),'INVALID_ENTITY','事件引用了未知实体',422);}
  for(const f of parsed.foreshadowUpdates)requireThat(byId.get(f.id)?.kind==='foreshadow'&&body.includes(f.quote),'INVALID_EVIDENCE','伏笔依据无法核对',422);
  const add=(category:string,quote:string,message:string,source:StoryObject|undefined,suggestion:string,blocks=true)=>{const start=quote?body.indexOf(quote):0;issues.push({id:id('issue'),category,severity:blocks?'critical':'warning',quote,start,end:start+quote.length,message,sourceId:source?.id,sourceQuote:source?.source?.quote??source?.body??'',rationale:'基于有来源的结构化属性校验；非关键词推断',suggestion,blocks,status:'open',engine:'deterministic'});};
  const stateful=new Set(['holder','持有者','location','地点','health','身体状态','relationship','关系','ability','能力','known','已知信息','status','状态']);
  for(const claim of parsed.claims){
    if(claim.inference||!['objective','knowledge'].includes(claim.modality))continue;
    // The AI identifies narrative context; exact quotations and structured ownership/lock constraints are checked here.
    const existing=canon.filter(f=>f.fields.entityId===claim.entityId&&f.fields.property===claim.property&&f.status==='accepted'&&f.source?.modality!=='memory').sort((a,b)=>(b.source?.fromChapter??0)-(a.source?.fromChapter??0)||b.updatedAt.localeCompare(a.updatedAt))[0];
    if(!existing||existing.fields.value===claim.value)continue;
    if(claim.modality==='knowledge'&&existing.source?.modality!=='knowledge')continue;
    const entity=byId.get(claim.entityId)!;
    if(existing.locked||entity.locked&&!stateful.has(claim.property)){add('locked-setting',claim.quote,`「${entity.title}」的锁定属性 ${claim.property} 与正式资料冲突`,existing,'保留锁定设定，局部修正当前草稿');continue;}
    if(stateful.has(claim.property)){
      if(claim.transition&&claim.transition.from===String(existing.fields.value)&&claim.transition.reason.trim())continue;
      add('state-transition',claim.quote,`「${entity.title}」${claim.property} 从「${existing.fields.value}」变为「${claim.value}」，缺少有依据的转移或时间变化`,existing,'补充实际取回、转移、移动或时间变化；若是回忆/传闻则标记正确叙述层级');
    } else add('identity-rule',claim.quote,`「${entity.title}」${claim.property} 与既有事实不一致`,existing,'核对身份、别名、能力与规则；如有意变更，请提出设定变更');
  }
  if(!body.trim())add('missing-body','','正文为空',undefined,'重新生成正文');
  if(targetWords){const words=countWords(body);if(words<targetWords*.6)add('length','',`正文 ${words} 字，低于目标 ${targetWords} 字的 60%`,undefined,'扩写必要情节后重新审校，不能用重复文本凑字');else if(words<targetWords*.75||words>targetWords*1.35)add('length','',`正文 ${words} 字，偏离目标 ${targetWords} 字的建议范围`,undefined,'结合场景完整性决定是否调整篇幅',false);}
  return {...parsed,issues};
}
