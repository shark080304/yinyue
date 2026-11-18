const MAX_CLIP = 700000;
const encoder = new TextEncoder();
class PublicError extends Error {
  constructor(message, status = 400, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const validUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};
async function readBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError('请求内容为空。');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new PublicError('提交的内容超出大小限制。', 413); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}
function failure(error) {
  return json({ error: { code: error.code || 'upstream_failure', message: error instanceof PublicError ? error.message : '服务暂时无法响应，请稍后重试。' } }, error.status || 502);
}
function credential(request, env, service) {
  const personal = request.headers.get('X-Sunny-Provider-Key')?.trim();
  if (personal) {
    if (personal.length > 1024 || /[\s\x00-\x1f]/.test(personal)) throw new PublicError('密钥格式不正确，请重新填写。');
    return { key: personal, shared: false, service };
  }
  const names = { audd: 'AUDD_API_TOKEN', elevenlabs: 'ELEVENLABS_API_KEY', minimax: 'MINIMAX_API_KEY' };
  const key = env[names[service]];
  const budget = Number(env[service === 'audd' ? 'SUNNY_AI_RECOGNITIONS_PER_DAY' : 'SUNNY_AI_MUSIC_MINUTES_PER_DAY'] || 0);
  if (!key || !Number.isFinite(budget) || budget <= 0 || !env.DB) throw new PublicError('网站服务尚未开通。请在“服务设置”中使用自己的 API 密钥，或联系站长配置服务。', 503, 'not_configured');
  return { key, shared: true, service, budget: Math.floor(budget) };
}
async function reserve(request, env, auth, units) {
  const requestId = request.headers.get('X-Request-ID');
  if (!/^[0-9a-f-]{36}$/i.test(requestId || '')) throw new PublicError('请求标识无效，请刷新页面后再试。');
  // Shared quota and request deduplication are durable across Worker instances.
  // No credentials, lyrics, recordings, or finished music are stored in D1.
  if (!env.DB) return;
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(auth.key));
  const identity = [...new Uint8Array(hash)].slice(0, 16).map((value) => value.toString(16).padStart(2, '0')).join('');
  const day = new Date().toISOString().slice(0, 10);
  const id = auth.service + ':' + identity + ':' + requestId;
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO ai_requests (id, created_at) VALUES (?, ?)').bind(id, Date.now()).run();
  if (!inserted.meta?.changes) throw new PublicError('这次请求已经提交。为避免重复扣费，请等待原请求或查看服务账号记录。', 409, 'duplicate_request');
  if (auth.shared) {
    const quotaService = auth.service === 'audd' ? 'recognition' : 'music_minutes';
    const allowed = await env.DB.prepare('INSERT INTO ai_daily_usage (day, service, used) SELECT ?, ?, ? WHERE ? <= ? ON CONFLICT(day, service) DO UPDATE SET used = used + excluded.used WHERE used + excluded.used <= ? RETURNING used')
      .bind(day, quotaService, units, units, auth.budget, auth.budget).first();
    if (!allowed) throw new PublicError('网站今日的服务额度已用完。可使用自己的密钥，或明天再来。', 429, 'daily_limit');
  }
}
async function upstream(fetcher, url, options, service) {
  const response = await fetcher(url, options);
  if (response.ok) return response;
  // Provider errors can echo credentials and prompts. Return only controlled messages.
  await response.body?.cancel();
  if ([401, 403].includes(response.status)) throw new PublicError(service + ' 密钥或音乐 API 权限不可用，请在服务后台检查。', 401, 'provider_auth');
  if ([402, 429].includes(response.status)) throw new PublicError(service + ' 额度不足或请求过于频繁，请在服务后台检查后再试。', 429, 'provider_quota');
  if ([400, 422].includes(response.status)) throw new PublicError(service + ' 未接受这次内容或参数，请调整主题、歌词后再试。', 422, 'provider_validation');
  throw new PublicError(service + ' 暂时无法处理请求。请先查看账号记录，再决定是否重新提交。', 502, 'provider_unavailable');
}
function recognized(result) {
  if (!result) return null;
  const apple = result.apple_music || {};
  const spotify = result.spotify || {};
  const cover = validUrl(apple.artwork?.url?.replace('{w}', '300').replace('{h}', '300')) || validUrl(spotify.album?.images?.[0]?.url);
  const links = [
    ['Apple Music', apple.url], ['Spotify', spotify.external_urls?.spotify], ['查看歌曲', result.song_link],
  ].map(([label, value]) => ({ label, url: validUrl(value) })).filter((entry) => entry.url);
  return {
    title: String(result.title || '未知曲名').slice(0, 300), artist: String(result.artist || '').slice(0, 300), album: String(result.album || '').slice(0, 300),
    cover, preview: validUrl(apple.previews?.[0]?.url), links,
  };
}
async function recognize(request, env, fetcher) {
  const auth = credential(request, env, 'audd');
  if (Number(request.headers.get('Content-Length') || 0) > MAX_CLIP + 20000) throw new PublicError('请上传 10 秒以内的短音频。', 413);
  const bytes = await readBody(request, MAX_CLIP + 20000);
  let form;
  try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData(); }
  catch { throw new PublicError('音频上传格式不正确，请通过网页重新选择文件。'); }
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size < 1000 || file.size > MAX_CLIP) throw new PublicError('请提供清晰的 3–10 秒音频片段。');
  await reserve(request, env, auth, 1);
  const payload = new FormData();
  payload.append('api_token', auth.key);
  payload.append('file', file, 'recognition.wav');
  payload.append('return', 'apple_music,spotify');
  const response = await upstream(fetcher, 'https://api.audd.io/', { method: 'POST', body: payload, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) }, 'AudD');
  const data = await response.json();
  if (data.status !== 'success') {
    const code = Number(data.error?.error_code);
    if ([900, 901].includes(code)) throw new PublicError('AudD 密钥或额度不可用，请在服务后台检查。', 401, 'provider_auth');
    throw new PublicError('AudD 无法解析这次音频，请换一个清晰片段。', 422, 'recognition_failed');
  }
  return json({ result: recognized(data.result), provider: 'AudD' });
}
const styles = { pop: 'Mandopop, polished pop arrangement', folk: 'warm acoustic folk, fingerpicked guitar', rnb: 'contemporary R&B, groovy bass and drums', rock: 'melodic rock, live drums, electric guitar', electronic: 'melodic electronic dance, dynamic synths', cinematic: 'cinematic pop ballad, piano and strings' };
const moods = { hope: 'hopeful and uplifting', calm: 'intimate, calm and healing', bright: 'bright, joyful and energetic', sad: 'bittersweet, nostalgic and emotional' };
const voices = { female: 'expressive female lead singing voice', male: 'warm expressive male lead singing voice', duet: 'female and male lead vocal duet with harmonies' };
const languages = { zh: 'Mandarin Chinese', en: 'English', mixed: 'Mandarin Chinese and English' };
function settings(value) {
  if (!value || typeof value !== 'object') throw new PublicError('歌曲参数不完整。');
  const topic = String(value.topic || '').trim();
  const lyrics = String(value.lyrics || '').trim();
  const duration = Number(value.duration);
  const provider = value.provider;
  if (!topic || topic.length > 400 || lyrics.length > 3500 || ![120, 180, 240].includes(duration) || !['elevenlabs', 'minimax'].includes(provider)) throw new PublicError('请检查主题、歌词和歌曲时长。');
  if (!styles[value.style] || !moods[value.mood] || !voices[value.vocal] || !languages[value.language]) throw new PublicError('请选择有效的风格、情绪、人声与语言。');
  const prompt = [
    'Create a complete original song with clearly sung lead vocals and full instrumental accompaniment.',
    'Use ' + languages[value.language] + ' lyrics. ' + voices[value.vocal] + '. ' + styles[value.style] + '. Mood: ' + moods[value.mood] + '.',
    'Song theme: ' + topic + '.',
    'Include an intro, two verses, memorable choruses, a bridge, a final chorus and an ending. The vocal sections must contain lyrics and melodic singing.',
    lyrics ? 'Use these user-provided original lyrics:\n' + lyrics : 'Write original meaningful lyrics that develop the theme across the complete song.',
  ].join('\n');
  if (provider === 'elevenlabs' && prompt.length > 4100) throw new PublicError('歌词与主题较长，请适当缩短后再生成。');
  if (provider === 'minimax' && !lyrics) throw new PublicError('MiniMax 模式请先填写原创歌词。已有付费账号可使用此服务。');
  return { topic, lyrics, duration, provider, prompt, vocal: voices[value.vocal], language: languages[value.language] };
}
function cleanPlan(value, model, config) {
  if (model === 'music_v1') {
    if (!Array.isArray(value.sections) || value.sections.length < 2 || value.sections.length > 30) throw new PublicError('服务没有返回完整的歌曲编排，请在账号记录中检查。', 502);
    const sections = value.sections.map((section) => ({
      section_name: String(section.section_name || 'Verse').slice(0, 100),
      positive_local_styles: [...(section.positive_local_styles || []).slice(0, 12), config.vocal, 'melodic sung vocals'],
      negative_local_styles: (section.negative_local_styles || []).slice(0, 10),
      duration_ms: Number(section.duration_ms),
      lines: (section.lines || []).slice(0, 30).map((line) => String(line).slice(0, 200)),
    }));
    return { positive_global_styles: [...(value.positive_global_styles || []).slice(0, 12), config.vocal, config.language + ' sung lyrics'], negative_global_styles: (value.negative_global_styles || []).slice(0, 10), sections };
  }
  if (!Array.isArray(value.chunks) || value.chunks.length < 2 || value.chunks.length > 30) throw new PublicError('服务没有返回完整的歌曲编排，请在账号记录中检查。', 502);
  return { chunks: value.chunks.map((chunk) => ({ text: String(chunk.text || '').slice(0, 6500), duration_ms: Number(chunk.duration_ms), positive_styles: [...(chunk.positive_styles || []).slice(0, 14), config.vocal, config.language + ' sung lyrics'], negative_styles: (chunk.negative_styles || []).slice(0, 10) })) };
}
function validatePlan(plan, config) {
  const sections = plan.chunks || plan.sections;
  const total = sections.reduce((sum, section) => sum + section.duration_ms, 0);
  if (sections.some((section) => !Number.isInteger(section.duration_ms) || section.duration_ms < 3000 || section.duration_ms > 120000) || total < 90000 || total > config.duration * 1000 + 1000) throw new PublicError('服务返回的编排时长异常，已停止歌曲生成。请调整主题后再试。', 502);
  const lyrics = plan.chunks ? sections.map((chunk) => chunk.text).join('\n\n') : sections.map((section) => '[' + section.section_name + ']\n' + section.lines.join('\n')).join('\n\n');
  if (lyrics.replace(/\[[^\]]*\]|\{[^}]*\}|\s/g, '').length < 40) throw new PublicError('歌词内容不足，已停止生成。请补充原创歌词后再试。', 502);
  return lyrics;
}
function base64(bytes) {
  let value = '';
  for (let start = 0; start < bytes.length; start += 8192) value += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(value);
}
async function song(request, env, fetcher) {
  if (Number(request.headers.get('Content-Length') || 0) > 20000) throw new PublicError('歌曲创作内容过长。', 413);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(await readBody(request, 20000))); }
  catch (error) { if (error instanceof PublicError) throw error; throw new PublicError('歌曲参数格式不正确。'); }
  const config = settings(body);
  const auth = credential(request, env, config.provider);
  await reserve(request, env, auth, config.provider === 'minimax' ? 6 : config.duration / 60);
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(12 * 60 * 1000)]);
  let closed = false;
  let keepAlive;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => { if (!closed) controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n')); };
      keepAlive = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(': waiting\n\n')); }, 15000);
      try {
        let audioResponse;
        if (config.provider === 'elevenlabs') {
          const model = ['music_v1', 'music_v2', 'music_v2_5'].includes(env.ELEVENLABS_MUSIC_MODEL) ? env.ELEVENLABS_MUSIC_MODEL : 'music_v2_5';
          const headers = { 'Content-Type': 'application/json', 'xi-api-key': auth.key };
          send({ type: 'phase', step: 1, message: 'AI 正在创作原创歌词与完整歌曲编排…' });
          const response = await upstream(fetcher, 'https://api.elevenlabs.io/v1/music/plan', { method: 'POST', headers, body: JSON.stringify({ prompt: config.prompt, music_length_ms: config.duration * 1000, model_id: model }), signal }, 'ElevenLabs');
          const plan = cleanPlan(await response.json(), model, config);
          const lyrics = validatePlan(plan, config);
          send({ type: 'lyrics', lyrics });
          send({ type: 'phase', step: 2, message: '正在合成人声演唱与完整伴奏，请保持窗口打开…' });
          audioResponse = await upstream(fetcher, 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', { method: 'POST', headers, body: JSON.stringify({ model_id: model, composition_plan: plan }), signal }, 'ElevenLabs');
          if (!/audio|octet-stream/i.test(audioResponse.headers.get('Content-Type') || '')) throw new PublicError('音乐服务返回了无法读取的音频。请检查服务账号记录。', 502);
          const reader = audioResponse.body.getReader();
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 30 * 1024 * 1024) { await reader.cancel(); throw new PublicError('成品音频超出传输限制，请在服务账号中查看。', 502); }
            send({ type: 'audio', data: base64(value) });
          }
          if (size < 1024) throw new PublicError('服务返回的歌曲文件为空。', 502);
        } else {
          send({ type: 'phase', step: 1, message: '正在提交 MiniMax 人声歌曲创作…' });
          const model = ['music-3.0', 'music-2.6'].includes(env.MINIMAX_MUSIC_MODEL) ? env.MINIMAX_MUSIC_MODEL : 'music-3.0';
          // MiniMax's public API controls duration from the lyrics. It has no duration parameter.
          if (!config.lyrics) throw new PublicError('MiniMax 模式请先填写原创歌词。已有付费账号可使用此服务。');
          send({ type: 'lyrics', lyrics: config.lyrics });
          send({ type: 'phase', step: 2, message: '正在生成完整人声演唱与伴奏，成品时长由歌词与服务决定…' });
          const endpoint = env.MINIMAX_REGION === 'cn' ? 'https://api.minimaxi.com/v1/music_generation' : 'https://api.minimax.io/v1/music_generation';
          const response = await upstream(fetcher, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.key }, body: JSON.stringify({ model, prompt: config.prompt.slice(0, 2000), lyrics: config.lyrics, is_instrumental: false, output_format: 'hex', audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' } }), signal }, 'MiniMax');
          const result = await response.json();
          if (result.base_resp?.status_code !== 0 || !result.data?.audio) throw new PublicError('MiniMax 未完成歌曲生成。请检查账号权限、额度或内容要求。', 502);
          const hex = result.data.audio;
          if (typeof hex !== 'string' || hex.length > 50 * 1024 * 1024 || !/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw new PublicError('MiniMax 返回的音频数据异常。', 502);
          for (let offset = 0; offset < hex.length; offset += 64000) {
            const slice = hex.slice(offset, offset + 64000);
            const bytes = Uint8Array.from({ length: slice.length / 2 }, (_, index) => parseInt(slice.slice(index * 2, index * 2 + 2), 16));
            send({ type: 'audio', data: base64(bytes) });
          }
        }
        send({ type: 'complete' });
      } catch (error) {
        if (!closed) send({ type: 'error', message: signal.aborted ? '连接已中断或等待超时。请先查看服务账号记录，避免重复提交。' : error instanceof PublicError ? error.message : '生成过程中连接中断。请先查看服务账号记录，避免重复提交。' });
      } finally {
        clearInterval(keepAlive);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; clearInterval(keepAlive); abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' } });
}
export async function handleMusicApi(request, env = {}, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/ai/status' && request.method === 'GET') {
      const services = {};
      for (const service of ['audd', 'elevenlabs', 'minimax']) {
        try { credential(new Request(request.url), env, service); services[service] = { ready: true }; }
        catch { services[service] = { ready: false }; }
      }
      return json({ services });
    }
    if (!['/api/ai/recognize', '/api/ai/song'].includes(path)) return json({ error: { message: '接口不存在。' } }, 404);
    if (request.method !== 'POST') return json({ error: { message: '请通过网页提交。' } }, 405);
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new PublicError('请从本站页面发起请求。', 403, 'origin_rejected');
    return path === '/api/ai/recognize' ? await recognize(request, env, fetcher) : await song(request, env, fetcher);
  } catch (error) { return failure(error); }
}
