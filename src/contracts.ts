import { z } from 'zod';
import { memoryContentSchema } from './memory-contracts.js';
import { configOverrideSchema,type ConfigSnapshot } from './config-contracts.js';
import { sourceTaskSchema } from './source-contracts.js';

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();
export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function requireThat(test: unknown, code: string, message: string, status = 409): asserts test {
  if (!test) throw new DomainError(code, message, status);
}
export const str = z.string().max(100_000);
export const statusSchema = z.enum(['candidate','planned','draft','accepted','revoked','stale']);
export const kinds = ['book','volume','chapter','character','world','relationship','fact','event','foreshadow','idea'] as const;
export type Kind = typeof kinds[number];
export const sourceSchema = z.object({
  type: z.enum(['user','chapter','ai','import']), chapterId: z.string().optional(), versionId: z.string().optional(),
  quote: str.default(''), start: z.number().int().nonnegative().optional(), end: z.number().int().nonnegative().optional(),
  time: str.default('未知'), fromChapter: z.number().optional(), toChapter: z.number().optional(),
  inference: z.boolean().default(false), modality: z.enum(['objective','knowledge','rumor','memory','dream','uncertain']).default('objective'),
  supersedes: z.string().optional(), taskId: z.string().optional(), policy: z.string().optional(),
  sourceWorkId:z.string().optional(),sourceVersionId:z.string().optional(),sourceChapterId:z.string().optional(),sourceAssetId:z.string().optional(),manifestId:z.string().optional(),provenance:z.enum(['source','baseline','adaptation','branch']).optional()
});
export type Source = z.infer<typeof sourceSchema>;
export const objectSchema = z.object({
  kind: z.enum(kinds), title: z.string().trim().min(1).max(240), parentId: z.string().nullable().default(null),
  order: z.number().finite().default(0), status: statusSchema.default('draft'), locked: z.boolean().default(false),
  tags: z.array(z.string().max(120)).max(100).default([]), body: str.default(''),
  fields: z.record(z.union([str,z.number().finite(),z.boolean(),z.array(z.string().max(1000)),z.null()])).default({}),
  source: sourceSchema.optional()
}).strict();
export type ObjectInput = z.infer<typeof objectSchema>;
export interface StoryObject extends ObjectInput { id: string; projectId: string; revision: number; updatedAt: string; }
export function orderedChapters(objects:StoryObject[]):StoryObject[] {
  const parents=new Map(objects.map(o=>[o.id,o.order]));
  return objects.filter(o=>o.kind==='chapter').sort((a,b)=>(parents.get(a.parentId??'')??0)-(parents.get(b.parentId??'')??0)||(a.parentId??'').localeCompare(b.parentId??'')||a.order-b.order||a.id.localeCompare(b.id));
}
export const projectSchema = z.object({
  title: z.string().trim().min(1).max(160), premise: str.default(''), genre: z.string().max(100).default(''),
  style: str.default('克制、具体，以行动与对白推动故事。'), constraints: z.array(z.string().max(4000)).max(50).default([]),
  archived: z.boolean().default(false)
}).strict();
export interface Project extends z.infer<typeof projectSchema> { id: string; revision: number; createdAt: string; updatedAt: string; sourceWorkspace?:boolean; lineage?:{workId:string;versionId:string;manifestId:string;manifestRevision:number;cutoff:number;mode:string;template:string;sourceTitle:string;author:string;origin:string;rights:string;contract:string;referenceTextAllowed?:boolean;}; }
export interface ChapterVersion { id: string; projectId: string; chapterId: string; content: string; chapterRevision: number; createdAt: string; actor: string; accepted: boolean; summary: string; restoredFrom?: string; commitKey?: string; }
export const taskInputSchema = z.object({
  kind: z.enum(['bootstrap','write','review','replan','extract','ideas','assist','summarize','source-scan','source-profile']), goal: z.string().trim().min(1).max(6000),
  sourceScan:sourceTaskSchema.optional(),
  chapterId: z.string().optional(), count: z.number().int().min(1).max(3).default(1), targetWords: z.number().int().min(300).max(8000).default(2000),
  constraints: z.array(z.string().max(2000)).max(30).default([]), autoAccept: z.boolean().default(false),
  provider: z.enum(['dsh','demo']).default('dsh'),
  reasoning: z.enum(['balanced','configured']).default('balanced'),
  configuration: configOverrideSchema.optional(),
  perspective: z.object({asOfChapter:z.number().int().nonnegative().optional(),viewpointId:z.string().optional(),audience:z.enum(['author','character','reader']).default('author'),branch:z.string().max(100).default('main')}).optional(),
  budget: z.object({calls:z.number().int().min(1).max(1000).default(18),outputTokens:z.number().int().min(500).max(3000000).default(48000),contextChars:z.number().int().min(1000).max(48000).default(18000)}).default({}),
  range: z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),expectedText:str}).optional()
  ,draft: str.optional(), draftArtifactId:z.string().optional()
}).strict();
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskStatus = 'QUEUED'|'RUNNING'|'PAUSE_REQUESTED'|'PAUSED'|'NEEDS_INPUT'|'FAILED'|'COMPLETED'|'CANCELED';
export interface RunStep {
  key: string; name: string; inputHash: string; inputRevision: number; status: 'RUNNING'|'COMPLETED'|'FAILED'|'STALE';
  attempts: number; startedAt: string; endedAt?: string; output?: unknown; partial?: string; error?: string;
  usage?: {outputTokens: number; estimated: boolean};
  requestIds?:string[];
  calls?: {attempt:number;reserved:number;outputTokens:number;estimated:boolean;status:'RUNNING'|'COMPLETED'|'FAILED';startedAt:string;endedAt?:string;error?:string;diagnostic?:string;model?:{provider:string;model:string;reasoningEffort?:string}}[];
}
export interface CreativeTask extends TaskInput {
  configSnapshot?:ConfigSnapshot;
  id: string; projectId: string; status: TaskStatus; inputRevision: number; expectedRevision: number; epoch: number;
  createdAt: string; updatedAt: string; currentStep: string; completedChapters: number; steps: RunStep[];
  usage: {calls: number; outputTokens: number; estimated: boolean}; error?: {code: string; message: string};
  contract: {scope: string; lockedIds: string[]; permitted: string[]; forbidden: string[]; deliverables: string[]; stop: string[]; brief?:{objective:string;approach:string;assumptions:string[];constraints:string[];question?:string}; briefEpoch?:number};
  checkpoint: {chapterId?: string; artifactId?: string; committed: string[]};
}
export interface Artifact { id: string; taskId: string; projectId: string; type: 'chapter'|'state-review'|'setup'|'replan'|'ideas'|'extraction'|'edit'|'memory'; status: 'pending'|'accepted'|'rejected'|'stale'; baseRevision: number; chapterId?: string; chapterRevision?: number; createdAt: string; data: any; }
export const claimSchema = z.object({
  entityId: z.string(), property: z.enum(['holder','location','health','status','identity','alias','name','ability','relationship','known','goal','rule','inventory','decision']), value: z.string().min(1).max(2000), quote: z.string().min(1).max(4000),
  modality: z.enum(['objective','knowledge','rumor','memory','dream','uncertain']).default('objective'),
  time: z.string().max(300).default('当前章'), inference: z.boolean().default(false),
  transition: z.object({from:z.string().max(2000),reason:z.string().max(1200)}).optional()
  ,supersedes:z.string().optional()
});
export type Claim = z.infer<typeof claimSchema>;
export const issueSchema = z.object({
  category:z.string().max(100), severity:z.enum(['advice','warning','critical']), quote:z.string().max(4000),
  message:z.string().max(3000), sourceId:z.string().optional(), sourceQuote:z.string().max(4000).default(''),
  rationale:z.string().max(3000).default(''), suggestion:z.string().max(3000).default(''), blocks:z.boolean().default(false)
});
export type ReviewIssue = z.infer<typeof issueSchema> & {id:string; start:number; end:number; status:'open'|'ignored'|'intentional'|'resolved'; reason?:string; engine:'deterministic'|'ai'};
export const reviewSchema = z.object({
  memory:memoryContentSchema.optional(),
  relationships:z.array(z.object({fromId:z.string(),toId:z.string(),type:z.string().min(1).max(100),state:z.string().max(500),quote:z.string().min(1).max(2000),cause:z.string().max(1000),visibility:z.enum(['public','hidden']).default('public'),knownByIds:z.array(z.string()).max(20).default([]),perspectiveFrom:z.string().max(1000).default('未证实'),perspectiveTo:z.string().max(1000).default('未证实')})).max(12).optional(),
  summary:z.string().min(1).max(3000), claims:z.array(claimSchema).max(50),
  events:z.array(z.object({title:z.string().max(240),quote:z.string().min(1).max(3000),time:z.string().max(240).default('未知'),entityIds:z.array(z.string()).default([]),modality:sourceSchema.shape.modality,inference:z.boolean().default(false)})).max(30),
  issues:z.array(issueSchema).max(30),
  foreshadowUpdates:z.array(z.object({id:z.string(),state:z.enum(['planted','advancing','resolved']),quote:z.string().min(1).max(2000)})).max(20).default([])
});
export type Review = Omit<z.infer<typeof reviewSchema>,'issues'> & {issues:ReviewIssue[]};
export const setupSchema = z.object({
  title:z.string().max(160), rationale:z.string().max(2000),
  directions:z.array(z.object({title:z.string(),premise:z.string(),hook:z.string(),protagonist:z.string(),desire:z.string(),conflict:z.string(),engine:z.string(),world:z.string(),firstStage:z.string(),risk:z.string()})).min(2).max(4),
  chosen:z.number().int().min(0).max(3), objects:z.array(objectSchema).max(30)
});
export const replanSchema = z.object({rationale:z.string(),changes:z.array(z.object({id:z.string(),title:z.string().optional(),body:z.string(),fields:objectSchema.shape.fields})).max(30),impacts:z.array(z.object({id:z.string(),reason:z.string(),certainty:z.enum(['known','possible'])})).max(50)});
export const ideaSchema = z.object({ideas:z.array(z.object({title:z.string(),body:z.string(),tradeoff:z.string()})).min(2).max(5)});
export function countWords(text:string):number { return (text.match(/\p{Script=Han}|[\p{Script=Latin}\p{N}]+/gu)??[]).length; }
export const activeStatuses:TaskStatus[]=['QUEUED','RUNNING','PAUSE_REQUESTED'];
