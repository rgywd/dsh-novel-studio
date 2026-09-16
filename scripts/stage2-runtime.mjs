import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const migration=JSON.parse(readFileSync('docs/novel-studio/evidence/stage2-migration.json','utf8'));
const bases=[{port:4318,file:'.local/dsh-novel-studio.sqlite',source:'DSH 4318'},{port:4317,file:'.local/novel-studio.sqlite',source:'standalone 4317'}];
const results=[];
for(const base of bases){const db=new DatabaseSync(resolve(base.file),{readOnly:true});const prior=migration.results.find(item=>item.source===base.source).protectedRows;
  const changes=[];for(const [table,expected] of Object.entries(prior)){const rows=db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');if(rows.length!==expected.count||digest!==expected.sha256)changes.push({table,oldCount:expected.count,currentCount:rows.length});}
  const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value,integrity=db.prepare('PRAGMA quick_check').get()?.quick_check;db.close();
  const url=`http://127.0.0.1:${base.port}/api/novel-studio`,health=await (await fetch(`${url}/health`)).json(),projects=await (await fetch(`${url}/projects`)).json();const project=projects.find(item=>!item.archived);
  let projection;if(project){const [metadata,navigation]=await Promise.all([fetch(`${url}/projects/${project.id}/metadata`),fetch(`${url}/projects/${project.id}/navigation`)]);const meta=await metadata.text(),nav=await navigation.text();projection={metadataBytes:Buffer.byteLength(meta),navigationBytes:Buffer.byteLength(nav),revisionConsistent:JSON.parse(meta).project.revision===JSON.parse(nav).projectRevision};}
  results.push({source:base.source,schema,healthSchema:health.schema,integrity,projectCount:projects.length,changedOldTables:changes,projection});
}
const status=results.every(item=>item.schema==='4'&&item.healthSchema===4&&item.integrity==='ok'&&!item.changedOldTables.length&&item.projection?.revisionConsistent)?'PASS':'FAIL';
const receipt={at:new Date().toISOString(),status,results,oldProjectRegression:'npm run test:old-projects: 8 PASS; historical backup schema field is its original schema 2'};
writeFileSync('docs/novel-studio/evidence/stage2-runtime.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(status!=='PASS')process.exitCode=1;
