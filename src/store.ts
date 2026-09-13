import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { id, now, DomainError, type Project, type StoryObject, type CreativeTask, type Artifact, type ChapterVersion } from './contracts.js';
export const hash = (data:unknown) => createHash('sha256').update(typeof data==='string'?data:JSON.stringify(data)).digest('hex');
type Tables = {projects:Project; objects:StoryObject; tasks:CreativeTask; artifacts:Artifact; versions:ChapterVersion};
export class Store {
  db:DatabaseSync;
  // ponytail: one synchronous SQLite writer per local host; WAL handles readers. No multi-host writer.
  constructor(public path:string) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('schema','1');
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS objects(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS objects_project_kind ON objects(projectId,kind);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),taskId TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),chapterId TEXT NOT NULL,commitKey TEXT UNIQUE,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS version_chapter ON versions(chapterId);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,projectId TEXT NOT NULL,taskId TEXT,at TEXT NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL,data TEXT);
      CREATE TABLE IF NOT EXISTS changesets(id TEXT PRIMARY KEY,projectId TEXT NOT NULL,at TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,projectId TEXT NOT NULL,name TEXT NOT NULL,raw TEXT NOT NULL,at TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,projectId UNINDEXED,title,body,tokenize='unicode61');`);
    const schema=this.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
    if(!['1','2'].includes(String(schema))) throw new DomainError('SCHEMA','数据库版本不兼容',500);
    // Additive migration: existing rows, immutable prose and the host database are untouched.
    if(schema==='1')this.transaction(()=>{this.db.exec(`
      CREATE TABLE config_versions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE config_bindings(scope TEXT PRIMARY KEY,versionId TEXT NOT NULL REFERENCES config_versions(id));
      CREATE TABLE requests(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),taskId TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX requests_project ON requests(projectId);
      CREATE TABLE memories(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),data TEXT NOT NULL);
      CREATE INDEX memories_project ON memories(projectId);
      UPDATE meta SET value='2' WHERE key='schema';`);});
  }
  transaction<T>(fn:()=>T):T { this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  get<K extends keyof Tables>(table:K,key:string):Tables[K] {
    const row=this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key);
    if(!row)throw new DomainError('NOT_FOUND','找不到对象',404);
    return JSON.parse(row.data as string);
  }
  list<K extends keyof Tables>(table:K,projectId?:string):Tables[K][] {
    const rows=projectId?this.db.prepare(`SELECT data FROM ${table} WHERE projectId=?`).all(projectId):this.db.prepare(`SELECT data FROM ${table}`).all();
    return rows.map(row=>JSON.parse(row.data as string));
  }
  objects(projectId:string,kind?:string):StoryObject[]{
    return (kind?this.db.prepare('SELECT data FROM objects WHERE projectId=? AND kind=?').all(projectId,kind):this.db.prepare('SELECT data FROM objects WHERE projectId=?').all(projectId)).map(r=>JSON.parse(r.data as string));
  }
  put<K extends keyof Tables>(table:K,value:Tables[K]):void {
    const v=value as any;
    if(table==='projects') this.db.prepare('INSERT INTO projects(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(v.id,JSON.stringify(v));
    else if(table==='objects') {
      this.db.prepare('INSERT INTO objects(id,projectId,kind,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,kind=excluded.kind').run(v.id,v.projectId,v.kind,JSON.stringify(v));
      this.db.prepare('DELETE FROM search WHERE id=?').run(v.id);
      this.db.prepare('INSERT INTO search(id,projectId,title,body) VALUES(?,?,?,?)').run(v.id,v.projectId,v.title,`${v.body}\n${JSON.stringify(v.fields)}`);
    } else if(table==='versions') this.db.prepare('INSERT INTO versions(id,projectId,chapterId,commitKey,data) VALUES(?,?,?,?,?)').run(v.id,v.projectId,v.chapterId,v.commitKey??null,JSON.stringify(v));
    else if(table==='artifacts') this.db.prepare('INSERT INTO artifacts(id,projectId,taskId,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(v.id,v.projectId,v.taskId,JSON.stringify(v));
    else this.db.prepare('INSERT INTO tasks(id,projectId,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(v.id,v.projectId,JSON.stringify(v));
  }
  event(projectId:string,taskId:string|null,type:string,message:string,data?:unknown){ this.db.prepare('INSERT INTO events(projectId,taskId,at,type,message,data) VALUES(?,?,?,?,?,?)').run(projectId,taskId,now(),type,message,JSON.stringify(data??{})); }
  events(projectId:string,taskId?:string){return taskId?this.db.prepare('SELECT * FROM events WHERE projectId=? AND taskId=? ORDER BY id DESC LIMIT 150').all(projectId,taskId):this.db.prepare('SELECT * FROM events WHERE projectId=? ORDER BY id DESC LIMIT 150').all(projectId);}
  change(projectId:string,kind:string,data:unknown){const key=id('change');this.db.prepare('INSERT INTO changesets VALUES(?,?,?,?,?)').run(key,projectId,now(),kind,JSON.stringify(data));return key;}
  close(){this.db.close();}
}
