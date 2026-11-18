(() => {
  'use strict';
  function create(api) {
    const { sheet, element, icon, openSheet, notice } = api;
    let controller, recorder, microphone, timer, stopTimer, player;
    let urls = [];
    let session = 0;
    let loading = false;
    let abortNotice;
    const keyInputs = new Set();
    function control(label, glyph, action, className = 'hub-subtle') {
      const node = element('button', className);
      node.type = 'button';
      node.append(icon(glyph), document.createTextNode(label));
      node.addEventListener('click', () => action(node));
      return node;
    }
    function field(name, type = 'text', value = '') {
      const input = element('input');
      input.type = type;
      input.value = value;
      input.setAttribute('aria-label', name);
      const label = element('label', 'cloud-field', name);
      label.append(input);
      return { input, label };
    }
    function select(name, options) {
      const input = element('select');
      input.setAttribute('aria-label', name);
      for (const [value, label] of options) {
        const option = element('option', '', label);
        option.value = value;
        input.append(option);
      }
      const label = element('label', 'cloud-field', name);
      label.append(input);
      return { input, label };
    }
    function link(label, url) {
      const anchor = element('a', 'hub-external', label);
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      return anchor;
    }
    function connection(service, items) {
      const names = { audd: 'AudD', elevenlabs: 'ElevenLabs Music', minimax: 'MiniMax Music' };
      const details = element('details', 'cloud-connection');
      const summary = element('summary', '', '服务设置 · ' + names[service]);
      const status = element('p', 'connection-status', '正在检查服务…');
      const own = field(names[service] + ' API 密钥', 'password');
      own.input.autocomplete = 'off';
      own.input.spellcheck = false;
      own.input.maxLength = 1024;
      own.input.placeholder = '使用自己的密钥（仅本次窗口）';
      keyInputs.add(own.input);
      const address = service === 'audd' ? 'https://dashboard.audd.io/' : service === 'elevenlabs' ? 'https://elevenlabs.io/app/developers/api-keys' : 'https://platform.minimax.io/user-center/basic-information/interface-key';
      details.append(summary, own.label, element('small', '', '密钥仅在本窗口中使用，关闭即清除；使用自己的密钥时，费用计入你的服务账号。'), link('获取 ' + names[service] + ' 密钥', address));
      items.append(status, details);
      let shared = false;
      fetch('/api/ai/status', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      }).then((data) => {
        if (!status.isConnected) return;
        shared = Boolean(data.services?.[service]?.ready);
        status.textContent = shared ? '网站服务已配置 · ' + names[service] : '网站服务待配置 · 可使用自己的 ' + names[service] + ' 密钥';
        status.dataset.connected = String(shared);
        details.open = !shared;
      }).catch(() => {
        if (status.isConnected) status.textContent = '暂时无法连接服务，请刷新页面后重试。';
      });
      return {
        hasAccess() {
          if (shared || own.input.value.trim()) return true;
          details.open = true;
          own.input.focus();
          notice('请先配置 ' + names[service] + ' 服务密钥。');
          return false;
        },
        headers() { return own.input.value.trim() ? { 'X-Sunny-Provider-Key': own.input.value.trim() } : {}; },
        remove() { keyInputs.delete(own.input); own.input.value = ''; status.remove(); details.remove(); },
      };
    }
    function cancelRecording() {
      clearInterval(timer);
      clearTimeout(stopTimer);
      if (recorder?.state === 'recording') recorder.stop();
      microphone?.getTracks().forEach((track) => track.stop());
      microphone = null;
    }
    function cleanup() {
      session++;
      controller?.abort();
      cancelRecording();
      player?.pause();
      if (player) { player.removeAttribute('src'); player.load(); }
      player = null;
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
      for (const input of keyInputs) input.value = '';
      keyInputs.clear();
      loading = false;
      abortNotice = null;
    }
    function stopAudio() { player?.pause(); }
    function makeAudio(source, name) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = source;
      audio.setAttribute('aria-label', name);
      audio.addEventListener('play', () => { api.pauseMusic(); api.stopOtherAudio(); });
      player?.pause();
      player = audio;
      return audio;
    }
    async function parseError(response) {
      const data = await response.json().catch(() => ({}));
      return new Error(data.error?.message || '服务暂时无法响应，请稍后重试。');
    }
    function showRecognition() {
      cleanup();
      const items = openSheet('AI 听音识曲', 'recognize-cloud');
      items.append(element('p', 'feature-scope', '云端原曲识别 · 录音 / 上传音频 · 中外歌曲'));
      const access = connection('audd', items);
      const status = element('p', 'recognition-status', '准备 10 秒清晰的原曲片段，避开人声交谈和长前奏。');
      status.setAttribute('role', 'status');
      const result = element('div', 'recognition-result');
      const start = field('片段开始（秒）', 'number', '0');
      start.input.min = '0';
      start.input.step = '1';
      const file = field('选择待识别的音频', 'file');
      file.input.accept = 'audio/*';
      let selected;
      file.input.addEventListener('change', () => {
        selected = file.input.files?.[0];
        status.textContent = selected ? '已选择：' + selected.name + '。可调整片段开始位置后识别。' : '请选择音频文件。';
      });
      async function identify(source, offset = 0) {
        if (loading || !access.hasAccess()) return;
        loading = true;
        controller = new AbortController();
        const signal = controller.signal;
        record.disabled = upload.disabled = true;
        result.replaceChildren();
        status.textContent = '正在提取 10 秒音频片段…';
        try {
          const clip = await prepareClip(source, offset);
          if (signal.aborted) return;
          const data = new FormData();
          data.append('file', clip, 'recognition.wav');
          status.textContent = '正在检索云端曲库…';
          const response = await fetch('/api/ai/recognize', { method: 'POST', body: data, headers: { ...access.headers(), 'X-Request-ID': crypto.randomUUID() }, signal });
          if (!response.ok) throw await parseError(response);
          const found = (await response.json()).result;
          if (signal.aborted || !result.isConnected) return;
          if (!found) { status.textContent = '暂未找到匹配。请换一个更清晰的原唱片段，再试一次。'; return; }
          status.textContent = '识别成功 · AudD 云端曲库';
          if (found.cover) {
            const cover = element('img', 'recognized-cover');
            cover.src = found.cover;
            cover.alt = found.title + '封面';
            cover.referrerPolicy = 'no-referrer';
            result.append(cover);
          }
          result.append(element('h3', '', found.title), element('p', '', found.artist));
          if (found.album) result.append(element('small', '', found.album));
          if (found.preview) result.append(makeAudio(found.preview, '识别结果官方试听'));
          const links = element('div', 'hub-buttons');
          for (const item of found.links || []) links.append(link(item.label, item.url));
          result.append(links);
        } catch (error) {
          if (!signal.aborted) status.textContent = error.message || '无法解析这段音频。请换成 MP3、WAV 或重新录音。';
        } finally {
          loading = false;
          if (record.isConnected) record.disabled = upload.disabled = false;
        }
      }
      const upload = control('识别所选片段', 'graphic_eq', () => {
        if (!selected) { status.textContent = '请先选择音频文件。'; return; }
        identify(selected, Math.max(0, Number(start.input.value) || 0));
      }, 'hub-primary');
      const record = control('录音识别 · 10 秒', 'mic', async () => {
        if (recorder?.state === 'recording') { cancelRecording(); return; }
        if (loading || !access.hasAccess()) return;
        api.pauseMusic(); api.stopOtherAudio(); stopAudio();
        record.disabled = true;
        status.textContent = '等待麦克风授权…';
        const attempt = session;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          if (attempt !== session || !record.isConnected) { stream.getTracks().forEach((track) => track.stop()); return; }
          microphone = stream;
          const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((value) => MediaRecorder.isTypeSupported(value));
          const capture = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          recorder = capture;
          const chunks = [];
          const began = Date.now();
          capture.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
          capture.addEventListener('stop', () => {
            clearInterval(timer); clearTimeout(stopTimer);
            stream.getTracks().forEach((track) => track.stop());
            if (microphone === stream) microphone = null;
            if (attempt !== session || !record.isConnected) return;
            record.replaceChildren(icon('mic'), document.createTextNode('录音识别 · 10 秒'));
            record.disabled = false;
            identify(new Blob(chunks, { type: capture.mimeType }));
          }, { once: true });
          capture.start();
          record.disabled = false;
          record.replaceChildren(icon('stop'), document.createTextNode('停止并识别'));
          status.textContent = '正在聆听 · 0 / 10 秒';
          timer = setInterval(() => { status.textContent = '正在聆听 · ' + Math.min(10, Math.floor((Date.now() - began) / 1000)) + ' / 10 秒'; }, 250);
          stopTimer = setTimeout(cancelRecording, 10000);
        } catch (error) {
          record.disabled = false;
          status.textContent = error.name === 'NotAllowedError' ? '麦克风未授权，也可以选择音频文件。' : '无法打开麦克风，请选择音频文件。';
        }
      }, 'hub-primary');
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) record.disabled = true;
      const controls = element('div', 'recognition-controls');
      controls.append(record, file.label, start.label, upload);
      items.append(controls, status, result, element('small', '', '仅截取 10 秒上传至 AudD；识别结果取决于服务曲库与录音质量。此模式识别原曲录音。'));
      items.append(control('离线试识本站 3 首试听', 'offline_bolt', () => { cleanup(); api.showLocalRecognition(); }));
    }
    function showComposer() {
      cleanup();
      const items = openSheet('AI 写歌 · 人声创作室', 'composer');
      items.append(element('p', 'feature-scope', '原创歌词 + 演唱 + 伴奏 · 生成后可完整播放与下载 MP3'));
      const form = element('form', 'composer-form cloud-composer');
      const topic = field('歌曲主题', 'text', '把夏日的晚风写成一封寄给未来的信');
      topic.input.required = true; topic.input.maxLength = 400;
      const style = select('音乐风格', [['pop', '华语流行'], ['folk', '温暖民谣'], ['rnb', 'R&B 律动'], ['rock', '热烈摇滚'], ['electronic', '电子舞曲'], ['cinematic', '电影感抒情']]);
      const mood = select('歌曲情绪', [['hope', '充满希望'], ['calm', '安静治愈'], ['bright', '轻快明亮'], ['sad', '遗憾思念']]);
      const vocal = select('演唱音色', [['female', '清亮女声'], ['male', '温暖男声'], ['duet', '男女对唱']]);
      const language = select('歌词语言', [['zh', '中文'], ['en', 'English'], ['mixed', '中英双语']]);
      const duration = select('歌曲时长', [['120', '约 2 分钟'], ['180', '约 3 分钟'], ['240', '约 4 分钟']]);
      const provider = select('音乐生成服务', [['elevenlabs', 'ElevenLabs Music'], ['minimax', 'MiniMax · 已有付费账号']]);
      const ownLyrics = element('textarea', 'generated-lyrics');
      ownLyrics.setAttribute('aria-label', '自定义歌词'); ownLyrics.maxLength = 3000;
      ownLyrics.placeholder = '可留空，让 AI 创作歌词；也可以填写原创歌词，支持 [Verse]、[Chorus] 等段落。';
      const lyricsLabel = element('label', 'cloud-lyrics-label', '自定义歌词（可选）');
      lyricsLabel.append(ownLyrics);
      const connections = element('div', 'composer-connection');
      let access = connection('elevenlabs', connections);
      provider.input.addEventListener('change', () => {
        access.remove(); access = connection(provider.input.value, connections);
        duration.input.disabled = provider.input.value === 'minimax';
        if (provider.input.value === 'minimax') notice('MiniMax 需填写原创歌词，成品时长由歌词与服务决定。');
      });
      const submit = element('button', 'hub-primary', '生成完整人声歌曲');
      submit.type = 'submit';
      const state = element('p', 'composer-state', '选择风格和人声，写下你的故事。生成会消耗所选服务的额度。');
      state.setAttribute('role', 'status');
      const stages = element('div', 'generation-stages');
      for (const label of ['歌词与编排', '人声与伴奏', '完整成品']) stages.append(element('span', '', label));
      stages.hidden = true;
      const output = element('div', 'composer-output');
      const cancel = control('停止等待', 'stop_circle', () => { abortNotice = '已停止等待。服务可能已开始处理并计费，请先检查服务账号的记录，再决定是否重新生成。'; controller?.abort(); });
      cancel.hidden = true;
      form.append(topic.label, style.label, mood.label, vocal.label, language.label, duration.label, provider.label, lyricsLabel, connections, submit);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (loading || !access.hasAccess()) return;
        loading = true; submit.disabled = true; cancel.hidden = false; abortNotice = null;
        for (const input of form.querySelectorAll('input,select,textarea')) input.disabled = true;
        const attempt = session;
        controller = new AbortController();
        const signal = controller.signal;
        const started = Date.now();
        const elapsed = setInterval(() => { state.dataset.elapsed = String(Math.floor((Date.now() - started) / 1000)); }, 1000);
        stages.hidden = false;
        stages.dataset.step = '1';
        output.replaceChildren(); stopAudio();
        state.textContent = '正在提交创作请求…';
        let complete = false, chunks = [], bytes = 0, generatedLyrics = ownLyrics.value;
        try {
          const response = await fetch('/api/ai/song', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...access.headers(), 'X-Request-ID': crypto.randomUUID() }, signal,
            body: JSON.stringify({ provider: provider.input.value, topic: topic.input.value, style: style.input.value, mood: mood.input.value, vocal: vocal.input.value, language: language.input.value, duration: Number(duration.input.value), lyrics: ownLyrics.value }),
          });
          if (!response.ok) throw await parseError(response);
          if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('歌曲服务返回了无法读取的结果。');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = '';
          while (true) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const messages = pending.split('\n\n'); pending = messages.pop();
            for (const message of messages) {
              const text = message.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('\n');
              if (!text) continue;
              const data = JSON.parse(text);
              if (data.type === 'error') throw new Error(data.message);
              if (data.type === 'phase') { state.textContent = data.message; stages.dataset.step = String(data.step); }
              if (data.type === 'lyrics') { generatedLyrics = data.lyrics; ownLyrics.value = data.lyrics; }
              if (data.type === 'audio') {
                const raw = atob(data.data); const buffer = Uint8Array.from(raw, (char) => char.charCodeAt(0));
                bytes += buffer.length;
                if (bytes > 30 * 1024 * 1024) throw new Error('成品文件超出接收限制，请在服务账号中查看。');
                chunks.push(buffer);
              }
              if (data.type === 'complete') complete = true;
            }
            if (done) break;
          }
          if (!complete || bytes < 1024) throw new Error('歌曲传输未完成。请先检查服务账号记录，避免重复扣费。');
          if (attempt !== session || signal.aborted) return;
          const url = URL.createObjectURL(new Blob(chunks, { type: 'audio/mpeg' })); urls.push(url);
          const textUrl = URL.createObjectURL(new Blob([generatedLyrics], { type: 'text/plain;charset=utf-8' })); urls.push(textUrl);
          const audio = makeAudio(url, 'AI 完整人声歌曲');
          const saveAudio = element('a', 'hub-external', '下载完整歌曲 MP3'); saveAudio.href = url; saveAudio.download = 'sunny-original-song.mp3';
          const saveLyrics = element('a', 'hub-external', '下载歌词'); saveLyrics.href = textUrl; saveLyrics.download = 'sunny-original-lyrics.txt';
          const actions = element('div', 'hub-buttons'); actions.append(saveAudio, saveLyrics);
          output.append(element('h3', '', '你的原创歌曲'), audio, actions);
          stages.dataset.step = '3';
          state.textContent = '生成完成 · 点击播放，听听你的故事。';
          audio.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(audio.duration)) state.textContent = '生成完成 · 完整时长 ' + Math.floor(audio.duration / 60) + ':' + String(Math.floor(audio.duration % 60)).padStart(2, '0');
          }, { once: true });
          output.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
        } catch (error) {
          if (attempt === session && state.isConnected) state.textContent = signal.aborted ? abortNotice || '等待已结束。' : error.message || '生成未完成，请稍后查看服务账号记录。';
          stages.dataset.step = 'error';
        } finally {
          if (!complete && !signal.aborted) controller?.abort();
          clearInterval(elapsed); chunks = []; delete state.dataset.elapsed;
          if (attempt === session) {
            loading = false; submit.disabled = false; cancel.hidden = true;
            for (const input of form.querySelectorAll('input,select,textarea')) input.disabled = false;
            duration.input.disabled = provider.input.value === 'minimax';
          }
        }
      });
      items.append(form, stages, state, cancel, output, element('small', '', '生成期间请保持此窗口打开。完成后请及时下载保存；成品不会自动公开。'));
    }
    sheet.addEventListener('close', cleanup);
    window.addEventListener('pagehide', cleanup);
    return { showRecognition, showComposer, stopAudio };
  }
  async function prepareClip(file, offset) {
    if (file.size > 25 * 1024 * 1024) throw new Error('请选择 25 MB 以内的音频文件。');
    const context = new AudioContext();
    try {
      const source = await context.decodeAudioData(await file.arrayBuffer());
      if (offset >= source.duration - 3) throw new Error('这个起点之后不足 3 秒，请将片段开始位置提前。');
      const seconds = Math.min(10, source.duration - offset);
      const rate = 16000;
      const count = Math.floor(seconds * rate);
      const bytes = new ArrayBuffer(44 + count * 2);
      const view = new DataView(bytes);
      const text = (at, value) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
      const channels = Array.from({ length: source.numberOfChannels }, (_, index) => source.getChannelData(index));
      let energy = 0;
      for (let i = 0; i < count; i++) {
        const position = Math.min(source.length - 1, Math.floor((offset + i / rate) * source.sampleRate));
        let value = channels.reduce((sum, channel) => sum + channel[position], 0) / channels.length;
        value = Math.max(-1, Math.min(1, value)); energy += value * value;
        view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
      }
      if (Math.sqrt(energy / count) < .0015) throw new Error('片段过于安静，请换一个能清楚听到旋律的位置。');
      return new Blob([bytes], { type: 'audio/wav' });
    } catch (error) {
      if (error.name === 'EncodingError' || error.name === 'NotSupportedError') throw new Error('浏览器无法解码该音频。请换成 MP3、WAV 或重新录音。');
      throw error;
    } finally { await context.close(); }
  }
  window.SunnyCloudMusic = Object.freeze({ create });
})();
