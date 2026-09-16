import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const migration=JSON.parse(readFileSync('docs/novel-studio/evidence/stage3-migration.json','utf8'));
const bases=[{port:4318,file:'.local/dsh-novel-studio.sqlite',source:'DSH 4318'},{port:4317,file:'.local/novel-studio.sqlite',source:'standalone 4317'}];
const results=[];
for(const base of bases){
  const db=new DatabaseSync(resolve(base.file),{readOnly:true});
  const prior=migration.results.find(item=>item.source===base.source).protectedRows;
  const changes=[];
  for(const [table,expected] of Object.entries(prior)){
    const rows=db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    if(rows.length!==expected.count||digest!==expected.sha256)changes.push({table,oldCount:expected.count,currentCount:rows.length});
  }
  const schema=db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  const integrity=db.prepare('PRAGMA quick_check').get()?.quick_check;
  const shelfCount=Number(db.prepare('SELECT COUNT(*) count FROM project_shelf').get()?.count);
  const projectCount=Number(db.prepare('SELECT COUNT(*) count FROM projects').get()?.count);db.close();
  const url=`http://127.0.0.1:${base.port}/api/novel-studio`;
  const health=await (await fetch(`${url}/health`)).json();
  const shelf=await (await fetch(`${url}/shelf`)).json();
  const assets=await (await fetch(`${url}/creative-assets`)).json();
  results.push({source:base.source,schema,healthSchema:health.schema,integrity,projectCount,shelfCount,shelfVisible:shelf.length,configVersions:assets.versions.length,changedOldTables:changes});
}
const status=results.every(item=>item.schema==='5'&&item.healthSchema===5&&item.integrity==='ok'&&item.shelfCount===item.projectCount&&!item.changedOldTables.length)?'PASS':'FAIL';
const receipt={at:new Date().toISOString(),status,results,method:'Read-only live DB hash/row comparison to pre-upgrade VACUUM copy, quick_check, live /health /shelf /creative-assets'};
writeFileSync('docs/novel-studio/evidence/stage3-runtime.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));if(status!=='PASS')process.exitCode=1;
