import { DemoProvider } from '../src/demo.js';
import type { ModelRequest } from '../src/provider.js';

// Original synthetic prose, with explicit evidence markers for a deterministic test provider.
// This is not an AI extraction quality benchmark. Real-model recall is measured separately.
export const names=Array.from({length:64},(_,i)=>'岑唐陆莫邵江温顾'[Math.floor(i/8)]+['初禾','见川','知夏','怀舟','予安','清越','照野','南星'][i%8]);
export const person=(i:number)=>`【人物 c${i}】${names[i-1]}，身份：渡口记录员${i}。`;
export function sourceFixture(){return Array.from({length:60},(_,n)=>{
 const chapter=n+1;let text=`这是原创合成原作。第${chapter}天，渡口记录船只，纸上的潮位与岸边刻痕一致。`;
 if(chapter<=16)text+=Array.from({length:4},(_,j)=>person(n*4+j+1)).join('');
 if(chapter===17)text+=`【物件 key】潮门钥匙，规则：只有一把，开启潮门需要付出一昼夜的等待。${names[0]}交出钥匙。【事实 transfer|key|holder|${names[16]}】${names[0]}把潮门钥匙交给${names[16]}保管。`;
 if(chapter===18)text+=`${person(1)}${person(17)}【关系 trust|c1|c17|信任】${names[0]}信任${names[16]}，托他守住账本。`;
 if(chapter===19)text+=`【伏笔 promise】紫色船票，票背约定：潮门开启后交还失主，尚未兑现。`;
 if(chapter===20)text+=Array.from({length:20},(_,j)=>person(45+j)).join('')+'众人在同一张长桌上核对记号。这是密集单段，不可只保留前十六人。';
 if(chapter===45)text+=`${person(1)}【事实 death|c1|health|死亡】${names[0]}于今日死亡，这一事件只在第四十五章发生。`;
 if(chapter===50)text+=`${person(17)}【事实 alias|c17|alias|无面客】第五十章才揭露，${names[16]}就是无面客。【事实 secret|c17|secret|第五章前的密约】今日才公开第五章之前签下的密约，早期读者与${names[0]}不知道它。`;
 return `第${chapter}章 潮位${chapter}\n${text}\n`;
}).join('\n');}

export class SourceFixtureProvider extends DemoProvider {
 seen:{prompt:string;input:any;compiled:any}[]=[];
 override info(){return {available:true,name:'原创来源 Fixture · 确定性替身',detail:'只识别测试标记，不能替代真实模型抽取'};}
 override async generate(r:ModelRequest){
  this.seen.push({prompt:r.prompt,input:structuredClone(r.input),compiled:r.compiled});
  if(!r.prompt.startsWith('source')&&r.prompt!=='write')return super.generate(r);
  const text=String(r.input.text??''),evidence=(quote:string)=>({quote,modality:'objective',inference:false,storyTime:'本章',knownBy:[]});let value:any;
  if(r.prompt==='sourceDiscover'){
   const all=[...text.matchAll(/【人物 (c\d+)】([^，]+)，身份：([^。]+)。/gu)].map(m=>({key:m[1],name:m[2],kind:'character',identity:m[3],aliases:[],evidence:evidence(m[0])}));
   for(const m of text.matchAll(/【物件 (\w+)】([^，]+)，规则：([^。]+)。/gu))all.push({key:m[1],name:m[2],kind:'world',identity:m[3],aliases:[],evidence:evidence(m[0])});
   value={entities:all.slice(0,r.input.batchSize),saturated:all.length>=r.input.batchSize};
  }else if(r.prompt==='sourceExtract'){
   const items:any[]=[];
   for(const m of text.matchAll(/【事实 ([^|]+)\|([^|]+)\|([^|]+)\|([^】]+)】([^。]+)。/gu))items.push({key:m[1],kind:'fact',name:m[1],description:m[5],fields:{property:m[3],value:m[4]},refs:{entityId:m[2]},evidence:evidence(m[0])});
   for(const m of text.matchAll(/【关系 ([^|]+)\|([^|]+)\|([^|]+)\|([^】]+)】([^。]+)。/gu))items.push({key:m[1],kind:'relationship',name:m[4],description:m[5],fields:{type:m[4],state:'有效'},refs:{fromId:m[2],toId:m[3]},evidence:evidence(m[0])});
   for(const m of text.matchAll(/【伏笔 (\w+)】([^，]+)，([^。]+)。/gu))items.push({key:m[1],kind:'foreshadow',name:m[2],description:m[3],fields:{state:'open'},refs:{},evidence:evidence(m[0])});
   value={summary:'已处理片段：'+text.slice(0,160),items:items.slice(0,r.input.batchSize),saturated:items.length>=r.input.batchSize};
  }else if(r.prompt==='sourceProfile')value={identity:'依据已提供证据的身份',appearance:'未知',voice:'未知',desire:'未知',boundaries:'未知',uncertainties:['没有证据的特征不补写'],evidence:[]};
  else {const lead=r.input.objects?.find((o:any)=>o.kind==='character')?.title??names[0];value=`${lead}在渡口打开新账本。`+ (String(r.input.context).includes('蓝色缎带')?'蓝色缎带仍系在门边。':'门边只有一盏灯。')+'\n'+Array.from({length:16},(_,i)=>`第${i+1}次核对时，潮位比昨天低了一寸。他逐个记下经过的船，遇到不确定的名字就留下空格，请同伴补证。岸边的风吹起纸角，他用石头压稳，等对岸回信才继续。`).join('\n');}
  const response=typeof value==='string'?value:JSON.stringify(value);r.onRequest?.({system:r.compiled?.system,messages:r.compiled?.messages,model:'fixture'});r.onDelta(response);return {text:response,outputTokens:Math.ceil(response.length/3),estimated:true};
 }
}
