import { z } from 'zod';
import type { Domain } from './domain.js';
import { objectSchema,id,now,requireThat,type ObjectInput } from './contracts.js';
import { hash } from './store.js';
import { safeRaw } from './config.js';
import type { Compatibility } from './config-contracts.js';
export function previewLorebook(raw:string,name:string){
 const data=safeRaw(raw);const entries=Array.isArray(data.entries)?data.entries:Object.values(data.entries??data.character_book?.entries??{});requireThat(entries.length>0&&entries.length<=500,'LORE_FORMAT','World Info/Lorebook 需要 1–500 个 entries 条目',422);const report:Compatibility[]=[],objects:ObjectInput[]=[];const sourceHash=hash(raw);
 for(const [n,value] of entries.entries()){const e=value as any;requireThat(e&&typeof e.content==='string','LORE_FORMAT',`entries.${n}.content 必须为文本`,422);const uid=String(e.uid??e.id??n);let supported=true;
 const unsupported=(field:string,message:string)=>{supported=false;report.push({field:`entries.${uid}.${field}`,status:'UNSUPPORTED',message});};
 if(e.position!==undefined&&![0,1,'before_char','after_char'].includes(e.position))unsupported('position','没有对应小说层，条目先停用。');
 if(e.probability!==undefined&&e.probability!==100)unsupported('probability','不执行随机概率触发，条目先停用。');
 if(e.selectiveLogic!==undefined&&e.selectiveLogic!==0)unsupported('selectiveLogic','只支持主关键字命中且任一副关键字命中。');
 if(e.extensions&&Object.keys(e.extensions).some(k=>/script|trigger|depth|position|vector/i.test(k)))unsupported('extensions','高级脚本/深度/向量触发没有等价实现。');
 const keys=z.array(z.string().max(200)).max(100).parse(e.key??e.keys??[]),secondary=z.array(z.string().max(200)).max(100).parse(e.keysecondary??e.secondary_keys??[]);
 const known=['uid','id','key','keys','keysecondary','secondary_keys','comment','name','content','constant','selective','selectiveLogic','order','insertion_order','position','disable','enabled','probability','extensions','tags','excludeRecursion'];for(const k of Object.keys(e))if(!known.includes(k))report.push({field:`entries.${uid}.${k}`,status:'UNSUPPORTED',message:'未知设置只保存在原始导入文件，不执行。'});
 report.push({field:`entries.${uid}`,status:'PARTIAL',message:'内容与关键字映射到同一个世界树；核心常驻、优先级和有限递归按小说范围执行，不保留聊天注入楼层。'});
 objects.push(objectSchema.parse({kind:'world',title:String(e.comment||e.name||keys[0]||`世界条目 ${n+1}`).slice(0,240),body:e.content,status:'accepted',order:n,fields:{type:'世界规则',keys,secondaryKeys:secondary,core:!!e.constant,selective:!!e.selective,priority:Number(e.order??e.insertion_order??0),enabled:supported&&!e.disable&&e.enabled!==false,recursive:!e.excludeRecursion,loreUid:uid,loreHash:sourceHash,loreSource:name,branch:'main'},tags:Array.isArray(e.tags)?e.tags:[],source:{type:'import',quote:e.content,time:'作者接受导入的世界设定',modality:'objective',inference:false,policy:'author-lorebook-accept'}}));
 }
 return {format:'lorebook',converter:'novel-lore/1',name,sourceHash,raw,objects,report};
}
export function acceptLorebook(domain:Domain,pid:string,revision:number,raw:string,name:string,expectedHash:string){const preview=previewLorebook(raw,name);requireThat(preview.sourceHash===expectedHash,'STALE','导入预览与提交文件不同');return domain.store.transaction(()=>{
 domain.guard(pid,revision);const existing=domain.store.objects(pid,'world').filter(o=>o.fields.loreHash===preview.sourceHash);if(existing.length)return {objects:existing,report:preview.report,reused:true};
 domain.invalidateTasks(pid,'作者接受了世界设定，重新委派以使用新资料');const objects=preview.objects.map(o=>domain.addObject(pid,o));const importId=id('import');domain.store.db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(importId,pid,name,raw,now());domain.bump(pid);domain.store.change(pid,'lorebook.accept',{importId,sourceHash:preview.sourceHash,converter:preview.converter,report:preview.report,ids:objects.map(o=>o.id)});return {objects,report:preview.report,reused:false};
});}
