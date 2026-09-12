import { type ModelProvider, type ModelRequest } from './provider.js';
// Explicit deterministic fixture, never a fallback for a failed real model call.
export class DemoProvider implements ModelProvider {
  info(){return {available:true,name:'演示提供方 · 非真实 AI',detail:'使用原创固定样本，供检查界面和可靠性；不代表模型创作能力。建议目标 600 字。'};}
  async generate(r:ModelRequest){
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,180);r.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});});
    const objects=r.input.objects??[];const char=objects.find((x:any)=>x.kind==='character');const item=objects.find((x:any)=>x.kind==='world'&&x.title.includes('钥匙'));
    const lead=char?.title??'沈砚';const next=r.task.completedChapters>0||String(r.input.context??'').includes('【accepted-body ');
    let value:any;
    switch(r.prompt){
      case 'bootstrap':value={title:'雾港来信',rationale:'选择以记忆税与失踪航线推动长篇；每一封未送达的信都打开一桩具体事件。',directions:[{title:'雾港来信',premise:'收信人消失后，邮差必须替她记住整座城。',hook:'信件能保存被雾夺走的记忆',protagonist:'沈砚，港口邮差',desire:'找回母亲留下的最后一条航线',conflict:'城市秩序依靠遗忘维持',engine:'送达信件逐步恢复记忆并改变城市关系',world:'以记忆支付灯火的雾港',firstStage:'追查无人签收的蓝色信封',risk:'规则过多可能压过人物选择'},{title:'无声潮汐',premise:'测潮员发现明天的潮声可以被写进今天的账本。',hook:'预报会改变被预报者的命运',protagonist:'林秋，失聪测潮员',desire:'保住即将废弃的观测站',conflict:'准确的预报需要付出某个人的声音',engine:'每次潮灾引出不同的人生债务',world:'潮汐决定城邦边界',firstStage:'阻止一次已经记在档案里的沉船',risk:'预知设定需要严格限制'}],chosen:0,objects:[{kind:'character',title:'沈砚',status:'accepted',body:'二十四岁的港口邮差。习惯把每一次承诺记在纸上。',fields:{group:'雾港邮局',identity:'邮差',desire:'找到母亲的航线',fear:'失去关于家人的记忆',boundaries:'不拆私信',weakness:'不肯求助',voice:'短句，习惯先问收件人的姓名',arc:'从守规则到承担选择',location:'旧邮局',health:'健康',known:'不知导师真实身份'}},{kind:'character',title:'闻溪',status:'accepted',body:'修灯匠，总会留下不能点亮的旧灯。',fields:{group:'雾港居民',identity:'修灯匠',desire:'让港口的灯不再索取记忆',voice:'以具体的修理细节解释问题',location:'旧邮局',health:'健康'}},{kind:'world',title:'雾港',status:'accepted',body:'雾会带走未被别人记住的事物。港灯消耗自愿交出的记忆。',fields:{type:'地点',rule:'灯火不能凭空复原记忆'}},{kind:'world',title:'铜钥匙',status:'accepted',body:'旧邮局地下档案室唯一的铜钥匙。',fields:{type:'物品',unique:true}},{kind:'volume',title:'第一卷 · 无人签收',status:'planned',fields:{goal:'沿着退信寻找消失的街道'}},{kind:'chapter',title:'第一章 · 蓝色信封',order:1,status:'planned',fields:{goal:'主角收到没有地址的信，并选择与闻溪合作',participants:['沈砚','闻溪'],ending:'发现一条消失的街道',targetWords:600}},{kind:'chapter',title:'第二章 · 留灯的人',order:2,status:'planned',fields:{goal:'依照最新事实调查灯塔',participants:['沈砚','闻溪'],ending:'决定走进雾里',targetWords:600}}]};break;
      case 'brief':value={objective:r.task.goal,approach:'读取最新资料，完成范围内成果并审查；遇到冲突或预算耗尽暂停。',assumptions:['使用当前作品版本'],constraints:r.task.constraints};break;
      case 'plan':value={title:next?'留灯的人':'蓝色信封',goal:r.task.goal,conflict:'守住承诺还是追问信的来处',participants:char?[char.id]:[],events:'调查未送达的信',change:'愿意请人共同承担',reveal:'档案存在缺页',foreshadow:'蓝色信封的压痕',ending:'踏向港灯',constraints:r.task.constraints.join('；')};break;
      case 'write':value=next?secondChapter(lead,r.input.context):firstChapter(lead);break;
      case 'review':{
        const body=String(r.input.draft??'');const keyName=body.includes('银钥匙')?'银钥匙':'铜钥匙';const quote=body.includes(`把${keyName}交给了闻溪`)?`${lead}把${keyName}交给了闻溪。`:body.includes(`${keyName}仍在闻溪的围裙内袋里。`)?`${keyName}仍在闻溪的围裙内袋里。`:'';
        value={summary:body.slice(0,160),claims:quote&&item&&body.includes(quote)?[{entityId:item.id,property:'holder',value:'闻溪',quote,modality:'objective',time:'本章',inference:false}]:[],events:[{title:'调查雾港的来信',quote:body.split('\n').find(x=>x.trim())??'',time:'未知',entityIds:char?[char.id]:[]}],issues:[],foreshadowUpdates:[]};break;
      }
      case 'repair':value={edits:[],summary:'演示提供方不会伪装修复成功，请手工修改或接入真实模型。'};break;
      case 'ideas':value={ideas:[{title:'寄给昨日的信',body:'让一封退信的邮戳比投递日期早一天，迫使主角核对自己的记忆。',tradeoff:'需要尽早明确时间规则'},{title:'灯匠的空白账本',body:'闻溪修好的每盏灯都对应账本上一处被擦去的姓名。',tradeoff:'关系推进应通过行动而非解释'}]};break;
      case 'extract':value={objects:char?[]:[{kind:'character',title:'沈砚',body:'待确认的港口邮差',fields:{identity:'邮差'},source:{type:'import',quote:String(r.input.draft??'').slice(0,60)}}]};break;
      case 'replan':value={rationale:'将调查行动提前，让主角以选择推动情节。',changes:(r.input.editablePlans??[]).slice(0,1).map((x:any)=>({id:x.id,body:'让人物先承担一个具体代价，再追问信件的真相',fields:{goal:'主动调查港灯'}})),impacts:(r.input.dependencies??[]).slice(0,4).map((x:any)=>({id:x.id,reason:'可能影响后续揭示节奏，需随正文复核',certainty:'possible'}))};break;
      case 'assist':value=`${r.input.selection?.expectedText??''}窗外的雾贴着玻璃，他没有再解释，只把信推近了一寸。`;break;
    }
    const text=typeof value==='string'?value:JSON.stringify(value);r.onDelta(text);return {text,outputTokens:Math.ceil(text.length*.7),estimated:true};
  }
}
export function firstChapter(lead='沈砚'){return `雾在傍晚六点抵达旧邮局，比钟声早了半刻。${lead}把最后一袋退信搬上柜台，发现最底下那封信是干的。蓝色信封没有地址，封口压着一枚已经停用的灯塔邮戳。

他没有拆开。邮局的规矩印在每一个抽屉背面：没有收件人的信，要等到有人记起它为止。可这封信的右下角，写着母亲的小名。那两个字很轻，像一个人隔着门试探着叫他。

闻溪来取修灯用的旧报纸时，他正用拇指摸那道压痕。她把工具箱搁在地上，先看信，又看他身后空了三年的挂钩。“你今晚还要送？”她问。${lead}把信翻过去。纸背浮出一点潮湿的蓝，像地图上一段尚未命名的水。

“我想去档案室查邮戳。”他说。他说得很平，仿佛只是要补一张领料单。闻溪没有拆穿，把手伸向柜台边沿。那里有一道被旧钥匙磨出的凹槽，木屑颜色比周围浅。

${lead}把铜钥匙交给了闻溪。

“先替我拿着。”他说，“我去关后门。”他第一次把这件事交给另一个人，心里却没有想象中轻松。钥匙离开掌心时留下一点冰凉，像突然不必再握紧的某种责任。

后门外的石阶上躺着一张投递回执。上面没有签名，只有一行铅笔字：不要在第七盏灯亮起之后叫我的名字。他蹲下，把回执夹进随身的小本子。石阶下的水没有流动，却传来一声很远的船笛。

闻溪站在楼梯口等他。她没有问回执上写了什么，只拎起工具箱，让出半级台阶。两个人一前一后下楼，邮局的钟终于敲响。钟声穿过楼板的时候，蓝色信封里的纸，轻轻响了一下。

档案室的灯没有亮。墙上挂着一幅缺了右下角的港口地图，缺口的形状恰好能容下一条街。${lead}记得那条街。他每天回家都经过那里，可他想不起街口那家面包店是什么时候关的。

“明天先去这里。”他在地图的缺口旁画了一个小圆，没有写下母亲的名字。闻溪点点头。她把钥匙收进围裙的内袋，随后擦去灯罩上的灰，为他们留出一小片可以看清彼此的光。`;}
function secondChapter(lead:string,context:string){const change=String(context??'').includes('银钥匙')?'银钥匙':'铜钥匙';return `早晨的港灯还亮着。${lead}在窗边读昨夜记下的回执，没有把它当成命令。他要先确认写字的人是谁，也要确认自己究竟答应过什么。

闻溪带着工具箱来敲门。${change}仍在闻溪的围裙内袋里。钥匙的事，他们在出门前重新核对了一次；没有人凭空多出一把能够打开档案室的钥匙。她指着小本子里的地图缺口，说灯塔维修册上也少了同一个街名。

他们沿海堤走到第六盏港灯。石缝里嵌着陈旧的纸屑，脚下的积水映出一扇并不存在的门。${lead}没有立刻敲门，而是先问闻溪，昨天这个地方有没有台阶。她蹲下来，摸了摸石面新露出的断口。

“有东西被搬走了。”她说，“不是塌掉的。灰尘还在原来的高度。”她用螺丝刀柄量了一遍，把长度记在维修册边角。他看着那些很小的数字，忽然觉得比一句保证更可靠。

灯塔管理员在午前出现，提着一桶尚未干透的白漆。他听见他们提到那条街，先看了一眼海堤尽头，又低头去擦桶沿。“旧地图经常出错。”他说。可是他没有问他们说的是哪一张地图。

${lead}把这个细节记下来。他开始怀疑，有人比自己更早读过那封信。怀疑还不能成为指认；他没有追上去逼问，也没有用自己没见过的事作证。他向管理员借了一把尺，说想量量灯座。

闻溪等管理员走远，才把维修册翻到最后一页。纸上印着一枚蓝色压痕。她没有替他下结论，只将信封放在压痕旁。两枚图样相差一个很短的缺口，像同一枚邮戳在断裂前后留下的影子。

海风从那扇不存在的门里吹出来。风里有烤面包的味道。${lead}想起母亲曾在清晨等他穿好鞋，却仍旧想不起那家店的招牌。他把回执放进内袋，向闻溪伸手，示意她先不要进去。

“如果我忘了今天，”他说，“你就把这些数字念给我听。”闻溪合上维修册，认真答应了。她没有答应一定能找到谁，只答应会把亲眼见过的事保存下来。

第七盏灯在白昼里闪了一下。${lead}这才看见门后的街道。街上的每一家店都挂着同样的蓝色信封。他们在石面上画下返回的记号，然后并肩走进那片尚未被地图承认的雾。`;}
