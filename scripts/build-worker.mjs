import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (dirname(output) !== root || !output.endsWith('dist')) throw new Error('Invalid output directory');
const hosting = JSON.parse(await readFile(join(root, '.openai/hosting.json'), 'utf8'));
if (hosting.static || !hosting.project_id) throw new Error('Expected Worker hosting configuration');
const assets = {};
const mimes = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
async function collect(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    if (item.isDirectory()) await collect(join(directory, item.name), prefix + item.name + '/');
    else if (item.isFile()) {
      const bytes = await readFile(join(directory, item.name));
      assets['/' + prefix + item.name] = [mimes[extname(item.name)] || 'application/octet-stream', bytes.toString('base64'), createHash('sha256').update(bytes).digest('hex').slice(0, 24)];
    }
  }
}
await collect(join(root, 'public'));
if (!assets['/index.html']) throw new Error('Missing public/index.html');
const api = (await readFile(join(root, 'worker/music-api.mjs'), 'utf8')).replace('export async function handleMusicApi', 'async function handleMusicApi');
const serving = await readFile(join(root, 'worker/static.mjs'), 'utf8');
const source = ['// Generated from public/ and worker/. Run node scripts/build-worker.mjs.', api, 'const embeddedAssets = ' + JSON.stringify(assets) + ';', serving].join('\n');
const compressed = gzipSync(source).length;
if (compressed > 10 * 1024 * 1024) throw new Error('Worker exceeds the compressed script limit');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'server'), { recursive: true });
await mkdir(join(output, '.openai'), { recursive: true });
await writeFile(join(output, 'server/index.js'), source);
await writeFile(join(output, '.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
console.log(JSON.stringify({ assets: Object.keys(assets).length, workerBytes: Buffer.byteLength(source), compressedBytes: compressed }));
