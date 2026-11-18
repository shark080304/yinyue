import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { handleMusicApi } from '../worker/music-api.mjs';
import './build-frontend.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(project, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read .env. Check the file and restart.'); }
const publicRoot = resolve(project, 'public');
const dataRoot = resolve(project, 'data');
await mkdir(dataRoot, { recursive: true });
const database = new DatabaseSync(resolve(dataRoot, 'local.sqlite'));
const existing = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_requests','ai_daily_usage')").all();
if (existing.length === 0) {
  database.exec(await readFile(resolve(project, 'drizzle/0000_ai_quota.sql'), 'utf8'));
} else if (existing.length !== 2) {
  throw new Error('The local database schema is incomplete. Inspect data/local.sqlite before restarting.');
}
const DB = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() { return { meta: { changes: Number(database.prepare(sql).run(...values).changes) } }; },
          async first() { return database.prepare(sql).get(...values) || null; },
        };
      },
    };
  },
};
const environment = { ...process.env, DB };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
async function serveStatic(incoming, outgoing, url) {
  if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405).end('Method not allowed'); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { outgoing.writeHead(400).end('Invalid path'); return; }
  const target = resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(publicRoot + sep)) { outgoing.writeHead(404).end('Not found'); return; }
  let info;
  try { info = await stat(target); } catch { outgoing.writeHead(404).end('Not found'); return; }
  if (!info.isFile()) { outgoing.writeHead(404).end('Not found'); return; }
  const size = info.size;
  let start = 0, end = size - 1, code = 200;
  const headers = { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'microphone=(self)' };
  if (incoming.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(incoming.headers.range);
    if (!range || (!range[1] && !range[2])) { outgoing.writeHead(416, { 'Content-Range': 'bytes */' + size }).end(); return; }
    if (!range[1]) start = Math.max(0, size - Number(range[2]));
    else { start = Number(range[1]); if (range[2]) end = Math.min(size - 1, Number(range[2])); }
    if (start > end || start >= size) { outgoing.writeHead(416, { 'Content-Range': 'bytes */' + size }).end(); return; }
    code = 206;
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  outgoing.writeHead(code, headers);
  if (incoming.method === 'HEAD' || size === 0) { outgoing.end(); return; }
  createReadStream(target, { start, end }).on('error', () => outgoing.destroy()).pipe(outgoing);
}
const server = http.createServer(async (incoming, outgoing) => {
  const abort = new AbortController();
  incoming.once('aborted', () => abort.abort());
  outgoing.once('close', () => { if (!outgoing.writableEnded) abort.abort(); });
  try {
    const url = new URL(incoming.url || '/', 'http://' + incoming.headers.host);
    if (!url.pathname.startsWith('/api/')) { await serveStatic(incoming, outgoing, url); return; }
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      signal: abort.signal,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await handleMusicApi(request, environment);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).on('error', () => outgoing.destroy()).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    outgoing.end(JSON.stringify({ error: { message: 'Local server error. Check the terminal and restart.' } }));
  }
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
server.once('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'The port is already in use. Set PORT in .env and restart.' : 'Could not start the local server.');
  database.close(); process.exitCode = 1;
});
server.listen({ host, port }, () => {
  console.log('Sunny Music: http://' + host + ':' + server.address().port + '/');
  console.log('Press Ctrl+C to stop.');
});
function stop() { server.close(() => { database.close(); process.exit(0); }); server.closeIdleConnections(); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
