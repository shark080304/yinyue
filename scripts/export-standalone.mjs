import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import './build-frontend.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(project, 'public');
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(project, 'standalone.html');
if (extname(output).toLowerCase() !== '.html') throw new Error('The standalone output must be an HTML file.');
const html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
const pattern = /(<script id="media-catalog" type="application\/json">)([\s\S]*?)(<\/script>)/;
const match = pattern.exec(html);
if (!match) throw new Error('Missing embedded media catalog.');
const mime = { '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const embedded = new Map();
async function inline(value) {
  if (Array.isArray(value)) return Promise.all(value.map(inline));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await inline(child)])));
  if (typeof value !== 'string' || !value.startsWith('media/')) return value;
  if (!embedded.has(value)) {
    const target = resolve(publicRoot, value);
    if (!target.startsWith(publicRoot + sep) || !mime[extname(target)]) throw new Error('Invalid media path: ' + value);
    embedded.set(value, readFile(target).then(bytes => 'data:' + mime[extname(target)] + ';base64,' + bytes.toString('base64')));
  }
  return embedded.get(value);
}
const catalog = await inline(JSON.parse(match[2]));
const body = JSON.stringify(catalog).replaceAll('<', '\\u003c');
const page = html.replace(pattern, () => match[1] + body + match[3]);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, page);
console.log(JSON.stringify({ standalone: output, embeddedMedia: embedded.size, bytes: Buffer.byteLength(page) }));
