import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = '.local/backups/upgrade-20260913';
const checks = [];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const changedRows = (before, after, key) => {
  const current = new Map(after.map(row => [row.id, row]));
  return before.flatMap(row => !current.has(row.id) || hash(row) !== hash(current.get(row.id)) ? [`${key}:${row.id}`] : []);
};

for (const file of await readdir(directory)) {
  if (!file.endsWith('.json')) continue;
  const match = file.match(/(4317|4318)/);
  if (!match) continue;
  const before = JSON.parse(await readFile(`${directory}/${file}`, 'utf8')).payload;
  const response = await fetch(`http://127.0.0.1:${match[1]}/api/novel-studio/projects/${before.project.id}/backup`);
  if (!response.ok) throw Error('Backup read failed');
  const after = (await response.json()).payload;
  const differences = ['project', 'objects', 'versions', 'imports'].filter(key => hash(before[key]) !== hash(after[key]));
  differences.push(...changedRows(before.tasks, after.tasks, 'tasks'));
  differences.push(...changedRows(before.artifacts, after.artifacts, 'artifacts'));
  checks.push({
    port: Number(match[1]),
    projectId: before.project.id,
    status: differences.length ? 'FAIL' : 'PASS',
    differences,
    objects: after.objects.length,
    versions: after.versions.length,
    revision: after.project.revision,
    appendedTasks: after.tasks.length - before.tasks.length,
    appendedArtifacts: after.artifacts.length - before.artifacts.length,
    objectsHash: hash(after.objects),
    schema: after.schema,
  });
}

const result = { at: new Date().toISOString(), status: checks.every(check => check.status === 'PASS') ? 'PASS' : 'FAIL', checks };
await writeFile('docs/novel-studio/evidence/upgrade-old-projects.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = result.status === 'PASS' ? 0 : 1;
