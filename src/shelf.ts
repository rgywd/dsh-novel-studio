import type { Domain } from './domain.js';
import { now, requireThat, type Project } from './contracts.js';

export interface ShelfProject extends Project {recentChapter?:{id:string;title:string;at:string};pendingReview:number;coverRevision?:number;}

export function shelfProjects(domain:Domain):ShelfProject[] {
  return domain.store.db.prepare(`SELECT p.data project,s.recentChapterId,s.recentTitle,s.recentAt,s.pendingReview,c.revision coverRevision
    FROM projects p JOIN project_shelf s ON s.projectId=p.id LEFT JOIN project_covers c ON c.projectId=p.id
    ORDER BY json_extract(p.data,'$.updatedAt') DESC`).all().map(row=>{
    const project=JSON.parse(String(row.project)) as Project;
    return {...project,recentChapter:row.recentChapterId?{id:String(row.recentChapterId),title:String(row.recentTitle),at:String(row.recentAt)}:undefined,pendingReview:Number(row.pendingReview),coverRevision:row.coverRevision===null?undefined:Number(row.coverRevision)};
  }).filter(project=>!project.sourceWorkspace);
}

export function coverGet(domain:Domain,projectId:string){domain.project(projectId);return domain.store.db.prepare('SELECT revision,mime,data,updatedAt FROM project_covers WHERE projectId=?').get(projectId) as {revision:number;mime:string;data:Uint8Array;updatedAt:string}|undefined;}

export function decodeCover(mime:string,base64:string){
  requireThat(['image/png','image/jpeg','image/webp'].includes(mime),'COVER','封面仅支持 PNG、JPEG 或 WebP',422);
  requireThat(typeof base64==='string'&&base64.length<=3_000_000&&/^[A-Za-z0-9+/]*={0,2}$/.test(base64),'COVER','封面编码或大小不受支持',422);
  const bytes=Buffer.from(base64,'base64');requireThat(bytes.length>0&&bytes.length<=2_000_000,'COVER','封面限 2 MB',422);
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  requireThat(mime===(png?'image/png':jpeg?'image/jpeg':webp?'image/webp':''),'COVER','文件内容与封面格式不符',422);
  return bytes;
}

export function coverSave(domain:Domain,projectId:string,input:{base64:string;mime:string;expectedRevision:number|null}){
  const project=domain.project(projectId);requireThat(!project.sourceWorkspace,'SOURCE_SCOPE','原作工作空间不能设置作品封面',403);
  const bytes=decodeCover(input.mime,input.base64);
  return domain.store.transaction(()=>{
    const old=coverGet(domain,projectId);requireThat((old?.revision??null)===input.expectedRevision,'STALE','封面已变化，请刷新书架',409);
    const revision=(old?.revision??0)+1,updatedAt=now();domain.store.db.prepare('INSERT INTO project_covers VALUES(?,?,?,?,?) ON CONFLICT(projectId) DO UPDATE SET revision=excluded.revision,mime=excluded.mime,data=excluded.data,updatedAt=excluded.updatedAt').run(projectId,revision,input.mime,bytes,updatedAt);
    return {revision,mime:input.mime,updatedAt};
  });
}

export function coverRemove(domain:Domain,projectId:string,expectedRevision:number){
  return domain.store.transaction(()=>{const old=coverGet(domain,projectId);requireThat(old?.revision===expectedRevision,'STALE','封面已变化，请刷新书架',409);domain.store.db.prepare('DELETE FROM project_covers WHERE projectId=?').run(projectId);return {removed:true};});
}
