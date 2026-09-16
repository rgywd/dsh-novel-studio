export async function api<T=any>(path:string,body?:unknown,method='POST',signal?:AbortSignal):Promise<T>{
  let response:Response;try{response=await fetch('/api/novel-studio'+path,body===undefined?{cache:'no-store',signal}:{method,headers:{'Content-Type':'application/json','X-Novel-Studio':'1'},body:JSON.stringify(body),signal});}catch(error){if(signal?.aborted)throw error;throw new Error('连接已中断。未保存的编辑仍保留，请恢复服务后重试。');}
  const data=await response.json();if(!response.ok)throw new Error(`${data.error?.message??'操作失败'}${data.error?.code?' ['+data.error.code+']':''}`);return data;
}
export function download(name:string,text:string,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function downloadProject(projectId:string,format:string){const a=document.createElement('a');a.href=`/api/novel-studio/projects/${projectId}/download?format=${format}`;a.download='';a.click();}
export function inputOf(o:any){const {id,revision,projectId,updatedAt,...input}=o;return input;}
export const statusText:Record<string,string>={QUEUED:'等待执行',RUNNING:'正在创作',PAUSE_REQUESTED:'正在暂停',PAUSED:'已暂停',NEEDS_INPUT:'等待审阅',FAILED:'执行失败',COMPLETED:'已完成',CANCELED:'已取消',pending:'待审阅',accepted:'已接受',planned:'规划',draft:'工作稿',candidate:'候选',revoked:'已撤销',stale:'已过期',rejected:'已拒绝'};
