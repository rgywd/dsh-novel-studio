import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../src/store.ts';
import { Domain } from '../src/domain.ts';

const sources=process.argv.slice(2).map(path=>resolve(path));
if(!sources.length)throw new Error('Provide absolute source SQLite paths; copies only, never migrates a live source');
const backupDir=resolve('.local/backups/stage2-20260916');mkdirSync(backupDir,{recursive:true});
const tables=['projects','objects','versions','tasks','artifacts','requests','memories','source_works','source_versions','source_runs','source_assets','source_decisions','import_manifests'];
function evidence(db){return Object.fromEntries(tables.map(name=>{const rows=db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();return [name,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];}));}
const results=[];
for(const source of sources){if(!existsSync(source))throw new Error(`Source missing: ${source}`);const target=resolve(backupDir,source.endsWith('dsh-novel-studio.sqlite')?'dsh-copy.sqlite':'local-copy.sqlite');if(existsSync(target))throw new Error(`Refusing to overwrite existing backup: ${target}`);
  const input=new DatabaseSync(source,{readOnly:true});const original=evidence(input);const oldSchema=input.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
  input.exec(`VACUUM INTO '${target.replaceAll("'","''")}'`);input.close();
  const copied=new DatabaseSync(target,{readOnly:true});const copy=evidence(copied);if(JSON.stringify(copy)!==JSON.stringify(original))throw new Error('Online backup contents differ');copied.close();
  const migrated=new Store(target),after=evidence(migrated.db);if(JSON.stringify(after)!==JSON.stringify(original))throw new Error('Migration changed protected rows');
  const schema=migrated.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;const integrity=migrated.db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  if(schema!=='4'||integrity!=='ok')throw new Error('Migration schema/integrity failed');
  const projects=migrated.db.prepare("SELECT id FROM projects WHERE json_extract(data,'$.sourceWorkspace') IS NULL OR json_extract(data,'$.sourceWorkspace')=0").all();let independentRestore='NOT_RUN';
  if(projects.length){const domain=new Domain(migrated),backup=domain.backup(String(projects[0].id));const restored=domain.restoreBackup(backup);if(restored.id===projects[0].id)throw new Error('Backup restored onto original project');independentRestore='PASS';}
  migrated.close();results.push({source:source.endsWith('dsh-novel-studio.sqlite')?'DSH 4318':'standalone 4317',oldSchema,schema,backup:target,integrity,protectedRows:original,independentRestore});
}
const receipt={at:new Date().toISOString(),status:'PASS',method:'SQLite read-only source VACUUM INTO distinct ignored copy, migrate copy to schema 4, byte-equivalent JSON row checks, independent project backup restore on copy',results};writeFileSync('docs/novel-studio/evidence/stage2-migration.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,results:results.map(({source,oldSchema,schema,backup,integrity,independentRestore})=>({source,oldSchema,schema,backup,integrity,independentRestore}))},null,2));
