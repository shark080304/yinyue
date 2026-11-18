function staticResponse(request) {
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'microphone=(self)' });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers });
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Invalid URL', { status: 400 }); }
  const asset = embeddedAssets[path === '/' ? '/index.html' : path];
  if (!asset) return new Response('Not found', { status: 404, headers });
  headers.set('Content-Type', asset[0]);
  const etag = String.fromCharCode(34) + asset[2] + String.fromCharCode(34);
  headers.set('ETag', etag);
  headers.set('Cache-Control', path === '/' || path.endsWith('.html') ? 'no-store' : 'public, max-age=86400');
  headers.set('Accept-Ranges', 'bytes');
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  const raw = atob(asset[1]);
  const size = raw.length;
  const range = request.headers.get('Range');
  let start = 0, end = size - 1, status = 200;
  if (range && (!request.headers.get('If-Range') || request.headers.get('If-Range') === etag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(size - 1, Number(match[2])); }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    status = 206;
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  }
  headers.set('Content-Length', String(end - start + 1));
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(Uint8Array.from(raw.slice(start, end + 1), (char) => char.charCodeAt(0)), { status, headers });
}
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleMusicApi(request, env);
    return staticResponse(request);
  },
};
