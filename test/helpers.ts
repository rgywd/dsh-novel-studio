import { Store } from '../src/store.js';
import { Domain } from '../src/domain.js';
import { Runner } from '../src/runtime.js';
import { DemoProvider } from '../src/demo.js';
import { taskInputSchema, type StoryObject } from '../src/contracts.js';
export function fixture(path=':memory:'){
  const store=new Store(path);const domain=new Domain(store);const p=domain.createProject({title:'可靠性测试作品',premise:'港口的信件保存人的记忆'});
  const add=(input:unknown)=>domain.createObject(p.id,domain.project(p.id).revision,input);
  const book=store.objects(p.id,'book')[0];const volume=add({kind:'volume',title:'第一卷',parentId:book.id,status:'planned'});
  const a=add({kind:'character',title:'沈砚',status:'accepted',body:'邮差',fields:{identity:'邮差'}});const b=add({kind:'character',title:'闻溪',status:'accepted',body:'灯匠'});const key=add({kind:'world',title:'铜钥匙',status:'accepted',body:'唯一钥匙',fields:{type:'物品'}});
  const chapter=add({kind:'chapter',title:'第一章',parentId:volume.id,status:'planned',order:1,fields:{participants:[a.id,b.id,key.id],goal:'把铜钥匙交给闻溪'}});
  const runner=new Runner(domain,new DemoProvider(),new DemoProvider(),1000);
  const task=(input:unknown)=>domain.createTask(p.id,taskInputSchema.parse({kind:'write',goal:'创作完整章节',provider:'demo',autoAccept:true,targetWords:600,...input as any}));
  return {store,domain,p,add,a,b,key,chapter,volume,runner,task};
}
export const reviewFor=(entityId:string,value:string,quote:string,extra:Record<string,unknown>={})=>({summary:'正文的真实摘要',claims:[{entityId,property:'holder',value,quote,modality:'objective',inference:false,...extra}],events:[],issues:[],foreshadowUpdates:[]});
export async function until(fn:()=>unknown,timeout=2500){const started=Date.now();while(!fn()){if(Date.now()-started>timeout)throw new Error('condition timed out');await new Promise(r=>setTimeout(r,10));}}
