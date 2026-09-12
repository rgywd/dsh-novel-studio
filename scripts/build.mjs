import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/server.ts','src/plugin.ts'], outdir: 'dist', bundle: true, platform: 'node', format: 'esm', target: 'node24', external: ['@deepseek-ai/*'], sourcemap: true });
await build({ entryPoints: ['src/ui/main.tsx'], outfile: 'dist/app.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', sourcemap: true, minify: true });
await writeFile('dist/index.html', '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>DSH Novel Studio</title><link rel="stylesheet" href="./app.css"></head><body><div id="root"></div><script type="module" src="./app.js"></script></body></html>');
