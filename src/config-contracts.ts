import { z } from 'zod';

export const taskRoles=['Writer','Planner','Reviewer','Summarizer','Extractor'] as const;
export type TaskRole=typeof taskRoles[number];
const text=z.string().max(16000);
export const nativeStyleSchema=z.object({base:text.optional(),viewpoint:text.optional(),tense:text.optional(),dialogue:text.optional(),project:text.optional(),scene:text.optional(),forbidden:z.array(z.string().max(200)).max(80).optional()}).strict();
export const bindingsSchema=z.object({characterId:z.string().optional(),viewpointId:z.string().optional(),authorName:z.string().max(100).optional(),audience:z.enum(['author','character','reader']).optional(),variables:z.record(z.string().max(2000)).optional()}).strict();
export const entrySchema=z.object({id:z.string().max(150),name:z.string().max(200),content:text,role:z.enum(['system','user','assistant']).default('system'),enabled:z.boolean().default(true),order:z.number().default(0),position:z.enum(['relative','before-task','after-task']).default('relative'),marker:z.string().optional(),roles:z.array(z.enum(taskRoles)).default(['Writer']),triggers:z.array(z.string()).default([]),supported:z.boolean().default(true),original:z.record(z.unknown()).optional()}).strict();
export const regexRuleSchema=z.object({id:z.string().max(150),name:z.string().max(200),pattern:z.string().max(2000),flags:z.string().max(10).default('gu'),replacement:z.string().max(8000),enabled:z.boolean().default(true),order:z.number().default(0),stage:z.enum(['before','after','display']),scope:z.enum(['goal','selection','world','prose']).default('prose'),onEdit:z.boolean().default(false),macros:z.enum(['none','raw','escaped']).default('none'),minDepth:z.number().int().min(-1).optional(),maxDepth:z.number().int().min(-1).optional(),supported:z.boolean().default(true)}).strict();
export type RegexRule=z.infer<typeof regexRuleSchema>;
export const configPatchSchema=z.object({enabled:z.boolean().optional(),strategy:z.enum(['compatible','novel']).optional(),native:nativeStyleSchema.optional(),entries:z.array(entrySchema).max(100).optional(),sampling:z.object({temperature:z.number().min(0).max(2).optional(),maxTokens:z.number().int().min(100).max(24000).optional(),stop:z.array(z.string().min(1).max(200)).max(4).optional()}).strict().optional(),regex:z.array(regexRuleSchema).max(40).optional(),bindings:bindingsSchema.optional(),memory:z.object({enabled:z.boolean().default(false),checkpointEvery:z.number().int().min(3).max(12).default(5),recallLimit:z.number().int().min(1).max(12).default(6)}).optional()}).strict();
export type ConfigPatch=z.infer<typeof configPatchSchema>;
export const configOverrideSchema=z.object({versionId:z.string().optional(),patch:configPatchSchema.optional()}).strict();
export interface Compatibility {field:string;status:'SUPPORTED'|'PARTIAL'|'UNSUPPORTED';message:string;}
export interface ConfigVersion {id:string;name:string;createdAt:string;parentId?:string;converter:string;format:string;raw?:string;source:string;config:ConfigPatch;report:Compatibility[];unknown:Record<string,unknown>;applicable:boolean;}
export interface ConfigSnapshot {hash:string;versions:{scope:string;id:string;name:string}[];config:ConfigPatch;origins:Record<string,string>;report:Compatibility[];seed:string;date:string;}
export const nativePresets:{id:string;name:string;config:ConfigPatch}[]=[
  {id:'restrained',name:'克制叙述',config:{enabled:true,strategy:'novel',native:{base:'克制而具体。以可观察的动作、物件与留白呈现情绪；避免抒情总结和夸张比喻。句子长短自然交替。',viewpoint:'第三人称限知；只写视角人物能感知或有依据推断的内容。',tense:'过去时叙述，时间关系清楚。',dialogue:'对白简短，有停顿和未说尽的意思。',forbidden:['命运的齿轮','一切才刚刚开始']}}},
  {id:'adventure',name:'快节奏冒险',config:{enabled:true,strategy:'novel',native:{base:'每个场景由清楚的行动目标、阻力和选择推进。多用短句与主动动词，在转折处换段，避免重复解释紧迫感。',viewpoint:'第三人称限知，不提前揭露角色未知的机关或答案。',dialogue:'对白短促，服务行动、分歧和决策。',forbidden:['时间仿佛静止','命运的齿轮']}}},
  {id:'dialogue',name:'对白驱动',config:{enabled:true,strategy:'novel',native:{base:'用人物之间有目的的交谈推动场景，多数推进由对白完成。动作与环境简短穿插，不用旁白替人物解释真实想法。',viewpoint:'第一人称，仅叙述我看见、听见与有依据知道的事。',dialogue:'双方有不同词汇和说话节奏；请求、回避、追问与误解形成对白变化。',forbidden:['不言而喻','无声地诉说']}}}
];
