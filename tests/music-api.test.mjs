import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { handleMusicApi } from '../worker/music-api.mjs';
function dbBinding() {
  const database = new DatabaseSync(':memory:');
  database.exec('CREATE TABLE ai_requests (id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE ai_daily_usage (day TEXT NOT NULL, service TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,service));');
  return { database, prepare(sql) { return { bind(...args) { return { async run() { return { meta: { changes: Number(database.prepare(sql).run(...args).changes) } }; }, async first() { return database.prepare(sql).get(...args) || null; } }; } }; } };
}
const base = 'https://music.example';
const headers = (id = crypto.randomUUID(), key = 'fixture_only_not_a_credential') => ({ Origin: base, 'X-Request-ID': id, ...(key ? { 'X-Sunny-Provider-Key': key } : {}) });
const config = { provider: 'elevenlabs', topic: '寄给未来的晚风', style: 'folk', mood: 'hope', vocal: 'female', language: 'zh', duration: 120, lyrics: '' };
function requestSong(value = config, extra = headers()) { return new Request(base + '/api/ai/song', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) }); }
const plan = { chunks: [
  { text: '[Verse 1]\n把晚风写进一封信\n寄给远方未到的黎明\n沿着回忆的街慢慢前行\n你会听见我的心', duration_ms: 60000, positive_styles: ['folk', 'acoustic guitar'] },
  { text: '[Chorus]\n让微光照亮新的旅途\n把梦想放进温柔的风里\n每一次相遇都值得记住\n让我们继续唱着走下去', duration_ms: 60000, positive_styles: ['uplifting', 'lead singing'] },
] };
test('unconfigured service stays explicit and never calls providers', async () => {
  let calls = 0;
  const response = await handleMusicApi(requestSong(config, headers(crypto.randomUUID(), null)), {}, async () => { calls++; });
  assert.equal(response.status, 503); assert.equal(calls, 0);
  assert.equal((await response.json()).error.code, 'not_configured');
  const status = await handleMusicApi(new Request(base + '/api/ai/status'));
  assert.deepEqual((await status.json()).services, { audd: { ready: false }, elevenlabs: { ready: false }, minimax: { ready: false } });
});
test('reject cross-origin, invalid settings, and oversized payload before provider calls', async () => {
  const noFetch = async () => { throw new Error('Unexpected network call'); };
  assert.equal((await handleMusicApi(requestSong(config, { ...headers(), Origin: 'https://other.example' }), {}, noFetch)).status, 403);
  assert.equal((await handleMusicApi(requestSong({ ...config, duration: 600 }), {}, noFetch)).status, 400);
  assert.equal((await handleMusicApi(requestSong({ ...config, topic: 'x'.repeat(21000) }), {}, noFetch)).status, 413);
});
test('recognition sends only the clip and redacts provider credentials', async () => {
  const form = new FormData(); form.append('file', new Blob([new Uint8Array(2000)], { type: 'audio/wav' }), 'clip.wav');
  let calls = 0;
  const response = await handleMusicApi(new Request(base + '/api/ai/recognize', { method: 'POST', headers: headers(), body: form }), {}, async (url, options) => {
    calls++; assert.equal(url, 'https://api.audd.io/'); assert.equal(options.body.get('file').size, 2000); assert.equal(options.body.get('api_token'), 'fixture_only_not_a_credential');
    return Response.json({ status: 'success', result: { title: 'Fixture Track', artist: 'Fixture Artist', album: 'Fixture Album', song_link: 'javascript:alert(1)', apple_music: { url: 'https://music.apple.com/track', previews: [{ url: 'https://audio.example/preview.m4a' }], artwork: { url: 'https://image.example/{w}x{h}.jpg' } } } });
  });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  const text = await response.text(); assert.ok(!text.includes('fixture_only_not_a_credential')); const data = JSON.parse(text);
  assert.equal(data.result.title, 'Fixture Track'); assert.equal(data.result.cover, 'https://image.example/300x300.jpg'); assert.equal(data.result.links.length, 1);
});
test('full vocal song uses actual provider plan and streams binary audio without retries', async () => {
  const calls = [];
  const audio = new Uint8Array(4096).map((_, i) => i % 256);
  const response = await handleMusicApi(requestSong(), {}, async (url, options) => {
    calls.push(url); const value = JSON.parse(options.body);
    assert.equal(value.model_id, 'music_v2_5');
    if (url.endsWith('/plan')) {
      assert.equal(value.music_length_ms, 120000); assert.match(value.prompt, /female lead singing/); assert.match(value.prompt, /Mandarin/);
      return Response.json(plan);
    }
    assert.ok(value.composition_plan.chunks.every((chunk) => chunk.positive_styles.some((style) => /singing/.test(style))));
    assert.equal(value.prompt, undefined); assert.equal(value.music_length_ms, undefined); assert.equal(value.force_instrumental, undefined);
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  const text = await response.text();
  const events = text.split('\n\n').filter((part) => part.startsWith('data: ')).map((part) => JSON.parse(part.slice(6)));
  assert.equal(calls.length, 2); assert.equal(events.at(-1).type, 'complete'); assert.ok(events.find((event) => event.type === 'lyrics').lyrics.includes('晚风'));
  assert.deepEqual(Buffer.concat(events.filter((event) => event.type === 'audio').map((event) => Buffer.from(event.data, 'base64'))), Buffer.from(audio));
  assert.ok(!text.includes('fixture_only_not_a_credential'));
});
test('upstream permission and transport failures produce no fabricated successful song', async () => {
  let calls = 0;
  const response = await handleMusicApi(requestSong(), {}, async () => { calls++; return Response.json({ detail: 'fixture_only_not_a_credential' }, { status: 401 }); });
  const text = await response.text(); assert.equal(calls, 1); assert.ok(text.includes('权限')); assert.ok(!text.includes('"type":"complete"')); assert.ok(!text.includes('fixture_only_not_a_credential'));
});
test('shared daily minute limit and idempotency are enforced by SQLite', async () => {
  const DB = dbBinding();
  const env = { DB, ELEVENLABS_API_KEY: 'fixture_shared_key', SUNNY_AI_MUSIC_MINUTES_PER_DAY: '2' };
  const id = crypto.randomUUID();
  const fixture = async (url) => url.endsWith('/plan') ? Response.json(plan) : new Response(new Uint8Array(3000), { headers: { 'Content-Type': 'audio/mpeg' } });
  const first = await handleMusicApi(requestSong(config, headers(id, null)), env, fixture); await first.text();
  const duplicate = await handleMusicApi(requestSong(config, headers(id, null)), env, fixture); assert.equal(duplicate.status, 409);
  const limited = await handleMusicApi(requestSong(config, headers(crypto.randomUUID(), null)), env, fixture); assert.equal(limited.status, 429);
  assert.equal(DB.database.prepare('SELECT used FROM ai_daily_usage').get().used, 2);
  DB.database.close();
});
test('SQLite accepts the exact shipped migration', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../drizzle/0000_ai_quota.sql', import.meta.url), 'utf8'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%'").get().n, 2); db.close();
});
