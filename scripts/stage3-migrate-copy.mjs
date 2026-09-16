import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../src/store.ts';
import { Domain } from '../src/domain.ts';
import { shelfProjects } from '../src/shelf.ts';

const [destination,...files]=process.argv.slice(2);
if(!destination||!files.length)throw new Error('Usage: node --import tsx scripts/stage3-migrate-copy.mjs BACKUP_DIRECTORY SOURCE_SQLITE...');
const backupDir=resolve(destination);
const sources=files.map(file=>resolve(file));
if(sources.some(source=>source===backupDir||backupDir.startsWith(source+'\\')))throw new Error('Backup location cannot be a source database');
mkdirSync(backupDir,{recursive:true});
const tables=['projects','objects','versions','tasks','artifacts','requests','request_summaries','request_details','memories','source_works','source_versions','source_runs','source_assets','source_decisions','import_manifests','config_versions','config_bindings','events','changesets','imports'];
function evidence(db){return Object.fromEntries(tables.map(name=>{
  const rows=db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
  return [name,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];
}));}
const results=[];
for(const source of sources){
  if(!existsSync(source))throw new Error(`Source missing: ${source}`);
  const target=resolve(backupDir,source.endsWith('dsh-novel-studio.sqlite')?'dsh-copy.sqlite':'local-copy.sqlite');
  if(existsSync(target))throw new Error(`Refusing to overwrite backup: ${target}`);
  const input=new DatabaseSync(source,{readOnly:true});
  const oldSchema=input.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  if(oldSchema!=='4')throw new Error(`Expected schema 4 before upgrade, got ${oldSchema}`);
  input.exec(`VACUUM INTO '${target.replaceAll("'","''")}'`);
  input.close();
  const copy=new DatabaseSync(target,{readOnly:true}),before=evidence(copy);copy.close();
  const migrated=new Store(target),after=evidence(migrated.db);
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Migration changed protected rows');
  const schema=migrated.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  const integrity=migrated.db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if(schema!=='5'||integrity!=='ok')throw new Error('Migration schema/integrity failed');
  const domain=new Domain(migrated),shelf=shelfProjects(domain);
  const projects=migrated.db.prepare("SELECT id FROM projects WHERE json_extract(data,'$.sourceWorkspace') IS NULL OR json_extract(data,'$.sourceWorkspace')=0").all();
  let independentRestore='NOT_RUN';
  if(projects.length){const backup=domain.backup(String(projects[0].id)),restored=domain.restoreBackup(backup);if(restored.id===projects[0].id)throw new Error('Restore reused original project ID');independentRestore='PASS';}
  migrated.close();
  results.push({source:source.endsWith('dsh-novel-studio.sqlite')?'DSH 4318':'standalone 4317',oldSchema,schema,backup:target,integrity,protectedRows:before,shelfCount:shelf.length,independentRestore});
}
const receipt={at:new Date().toISOString(),status:'PASS',method:'Read-only source VACUUM INTO ignored distinct copy; migrate only copy to v5; compare pre/post protected row hashes; restore old project as independent copy',results};
writeFileSync('docs/novel-studio/evidence/stage3-migration.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({status:receipt.status,results:results.map(({source,oldSchema,schema,backup,integrity,shelfCount,independentRestore})=>({source,oldSchema,schema,backup,integrity,shelfCount,independentRestore}))},null,2));
