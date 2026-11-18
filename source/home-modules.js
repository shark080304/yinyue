(() => {
  'use strict';

  function create(api) {
    const { app, sheet, media, tracks, demoIds, element, icon, button, openSheet, applyArtwork, notice } = api;
    const storedBookProgress = read('spoken-progress', {});
    let personalOrder = 0;
    let renderedPersonal;
    let spokenAudio;
    let activeBook;
    let bookControl;
    const spokenBuffers = new Map();
    let matchEngine;
    let analysis;
    let recorder;
    let microphone;
    let recordingTimer;
    let recordingEnd;
    const cloud = window.SunnyCloudMusic.create({
      sheet, element, icon, openSheet, notice,
      pauseMusic: api.pauseMusic,
      stopOtherAudio: () => { spokenAudio?.pause(); },
      showLocalRecognition: showRecognition,
    });

    function read(key, fallback) {
      try { return JSON.parse(localStorage.getItem('sunny-music.' + key)) ?? fallback; }
      catch { return fallback; }
    }

    function save(key, value) {
      try { localStorage.setItem('sunny-music.' + key, JSON.stringify(value)); }
      catch { /* Current-session playback still works. */ }
    }

    function control(label, glyph, action, className = '') {
      const node = button(label, '', '', glyph);
      if (className) node.className += ' ' + className;
      node.addEventListener('click', (event) => { event.stopPropagation(); action(node); });
      return node;
    }

    function external(label, url, className = '') {
      const node = element('a', className, label);
      node.href = url;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      return node;
    }

    function picture(key, className = '') {
      const node = element('span', 'module-art ' + className);
      node.setAttribute('aria-hidden', 'true');
      applyArtwork(node, key);
      return node;
    }

    function heading(title, subtitle) {
      const row = element('div', 'hub-heading');
      const block = element('div');
      block.append(element('h2', '', title));
      if (subtitle) block.append(element('p', '', subtitle));
      row.append(block);
      return row;
    }

    function section(title, subtitle, id) {
      const node = element('section', 'hub-section');
      node.id = id;
      node.setAttribute('aria-label', title);
      node.append(heading(title, subtitle));
      return node;
    }

    function buildPersonal() {
      const node = section('私人专属好歌', '根据你在本站的收藏与最近试听整理', 'personal-mix');
      const layout = element('div', 'personal-layout');
      const spotlight = element('div', 'personal-feature');
      applyArtwork(spotlight, 'romance', true);
      const tag = element('p', 'personal-kicker', '为你而来');
      spotlight.append(tag, element('h3', '', '把喜欢的旋律\n留在今天'));
      const play = control('播放专属歌单', 'play_arrow', () => api.playList(personalIds()), 'hub-primary');
      const more = control('换一组', 'refresh', () => { personalOrder++; renderPersonal(); }, 'hub-subtle');
      const actions = element('div', 'hub-buttons');
      actions.append(play, more);
      spotlight.append(actions);
      renderedPersonal = element('div', 'personal-tracks');
      layout.append(spotlight, renderedPersonal);
      node.append(layout);
      renderPersonal();
      return node;
    }

    function personalIds() {
      const recorded = [...api.getFavorites(), ...api.getRecent(), ...demoIds].filter((id) => demoIds.includes(id));
      const unique = [...new Set(recorded)];
      const start = personalOrder % unique.length;
      return [...unique.slice(start), ...unique.slice(0, start)];
    }

    function renderPersonal() {
      if (!renderedPersonal) return;
      const ids = personalIds();
      renderedPersonal.replaceChildren(...ids.map((id) => {
        const track = tracks.get(id);
        const row = element('div', 'personal-row');
        const info = element('div', 'personal-info');
        info.append(element('strong', '', track.name), element('span', '', track.artist));
        const play = control('', 'play_arrow', () => {
          const playback = api.getPlayback();
          if (playback.current === id && playback.playing) api.pauseMusic();
          else api.playList(ids, id);
        }, 'personal-play');
        play.dataset.personalPlay = id;
        play.setAttribute('aria-label', '播放推荐 ' + track.name);
        row.append(picture(id), info, play);
        return row;
      }));
      updatePlayback();
    }

    function buildTools() {
      const grid = element('div', 'music-tools');
      const matcher = section('AI 听音识曲', 'AudD 云端曲库 · 录音与文件识别', 'sound-recognition');
      matcher.classList.add('tool-panel', 'recognition-panel');
      applyArtwork(matcher, 'podcast', true);
      const equalizer = element('div', 'sound-bars');
      equalizer.setAttribute('aria-hidden', 'true');
      for (const size of [12, 26, 43, 58, 36, 22, 48, 31, 16]) {
        const bar = element('i');
        bar.style.height = size + 'px';
        equalizer.append(bar);
      }
      matcher.append(equalizer, element('p', 'tool-description', '听到熟悉的旋律？录一段，或选择音频文件。'));
      matcher.append(control('开始识曲', 'mic', cloud.showRecognition, 'hub-primary'));

      const composer = section('AI 写歌', '云端原创歌曲 · 歌词、人声与完整伴奏', 'song-studio');
      composer.classList.add('tool-panel', 'composer-panel');
      applyArtwork(composer, 'dance', true);
      const pitch = element('div', 'composer-mark');
      pitch.append(icon('auto_awesome'), icon('music_note'));
      composer.append(pitch, element('p', 'tool-description', '写下一个主题，让 AI 把你的故事唱出来。'));
      composer.append(control('打开创作室', 'edit_note', cloud.showComposer, 'hub-primary'));
      grid.append(matcher, composer);
      return grid;
    }

    function buildBooks() {
      const node = section('听书', '原创中文微故事 · 合成人声朗读', 'audiobooks');
      const grid = element('div', 'book-grid');
      media.spoken.forEach((book, index) => {
        const card = element('article', 'book-card');
        const cover = picture(['dawn', 'already-there', 'discovery'][index], 'book-cover');
        const info = element('div', 'book-info');
        info.append(element('h3', '', book.title), element('p', '', book.description.split('。')[0] + '。'));
        const action = control('开始听 · ' + Math.round(book.duration) + ' 秒', 'headphones', () => showBook(book), 'book-play');
        info.append(action);
        card.append(cover, info);
        grid.append(card);
      });
      node.append(grid);
      return node;
    }

    function showBook(book) {
      api.pauseMusic();
      stopAuxiliary();
      activeBook = book.id;
      const items = openSheet(book.title, 'book');
      items.append(element('p', '', '原创微故事 · 合成人声朗读'));
      spokenAudio = document.createElement('audio');
      const reader = spokenAudio;
      reader.controls = true;
      reader.preload = 'metadata';
      reader.setAttribute('aria-label', book.title + '朗读');
      reader.addEventListener('loadedmetadata', () => {
        if (reader.isConnected && activeBook === book.id) {
          reader.currentTime = Math.min(storedBookProgress[book.id] || 0, Math.max(0, book.duration - .5));
        }
      }, { once: true });
      reader.addEventListener('timeupdate', () => {
        if (spokenAudio === reader && reader.readyState > 0) storedBookProgress[book.id] = reader.currentTime;
      });
      reader.addEventListener('play', () => { api.pauseMusic(); cloud.stopAudio(); });
      const speed = element('select');
      speed.setAttribute('aria-label', '朗读速度');
      for (const rate of [.8, 1, 1.25, 1.5]) {
        const option = element('option', '', rate + '×');
        option.value = String(rate);
        speed.append(option);
      }
      speed.value = '1';
      speed.addEventListener('change', () => { if (spokenAudio) spokenAudio.playbackRate = Number(speed.value); });
      const transcript = element('div', 'book-transcript');
      transcript.append(...book.transcript.split('\n\n').map((line) => element('p', '', line)));
      bookControl = control('播放朗读', 'play_arrow', () => {
        if (spokenAudio?.paused) startSpoken();
        else spokenAudio?.pause();
      }, 'hub-primary');
      reader.addEventListener('play', () => setBookControl(true));
      reader.addEventListener('pause', () => setBookControl(false));
      const options = element('div', 'book-options');
      const label = element('label', '', '朗读速度');
      label.append(speed);
      options.append(bookControl, label);
      items.append(reader, options, transcript, element('small', '', book.credit));
      bookControl.disabled = true;
      bookControl.textContent = '正在加载朗读…';
      const source = spokenBuffers.has(book.id)
        ? Promise.resolve(spokenBuffers.get(book.id))
        : fetch(book.url).then((response) => {
          if (!response.ok) throw new Error('Could not load the story');
          return response.blob();
        }).then((file) => {
          const url = URL.createObjectURL(file);
          spokenBuffers.set(book.id, url);
          return url;
        });
      source.then((url) => {
        if (!reader.isConnected || spokenAudio !== reader) return;
        reader.src = url;
        bookControl.disabled = false;
        setBookControl(false);
        startSpoken();
      }).catch(() => {
        if (reader.isConnected) {
          bookControl.textContent = '朗读加载失败';
          notice('朗读暂时无法加载，请稍后重试。');
        }
      });
    }

    function startSpoken() {
      spokenAudio?.play().catch(() => notice('点击播放朗读即可开始。'));
    }

    function setBookControl(active) {
      if (!bookControl) return;
      bookControl.replaceChildren(icon(active ? 'pause' : 'play_arrow'), document.createTextNode(active ? '暂停朗读' : '播放朗读'));
    }

    function buildVideos() {
      const node = section('MV 专区', '从舞台到镜头，换一种方式听歌', 'music-videos');
      const filters = element('div', 'video-filters');
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'MV 分类');
      const grid = element('div', 'video-grid');
      function display(category) {
        grid.replaceChildren(...media.videos.filter((video, index) => category === '全部' || (category === '华语' ? index < 2 : index >= 2)).map((video) => {
          const card = control('', '', () => showVideo(video), 'video-card');
          const art = picture(video.artwork, 'video-cover');
          art.append(icon('play_circle_filled'));
          const copy = element('span', 'video-copy');
          copy.append(element('strong', '', video.title), element('small', '', video.artist));
          card.append(art, copy);
          card.setAttribute('aria-label', '播放 MV ' + video.title);
          return card;
        }));
        for (const choice of filters.children) choice.setAttribute('aria-pressed', String(choice.textContent === category));
      }
      for (const label of ['全部', '华语', '欧美']) filters.append(control(label, '', () => display(label), 'video-filter'));
      node.querySelector('.hub-heading').append(filters);
      node.append(grid);
      display('全部');
      return node;
    }

    function showVideo(video) {
      api.pauseMusic();
      stopAuxiliary();
      const items = openSheet(video.artist + ' · ' + video.title, 'video');
      const frame = document.createElement('iframe');
      const address = new URL('https://www.youtube.com/embed/' + video.videoId);
      address.search = new URLSearchParams({ playsinline: '1', rel: '0' }).toString();
      frame.src = address.href;
      frame.title = video.artist + ' — ' + video.title;
      frame.allow = 'encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      const fallback = external('打开官方 MV', video.source, 'hub-external');
      items.append(frame, element('p', '', video.description + ' · YouTube 播放器'), fallback);
      items.append(element('small', '', '若播放器受地区或网络限制，可以打开官方 MV 页面观看。'));
    }

    function buildWeekly() {
      const source = media.weekly;
      const node = section('本周上榜好歌', source.title + ' · ' + source.date + ' 榜单快照', 'weekly-hits');
      node.querySelector('.hub-heading').append(external('查看完整榜单', source.source, 'hub-external'));
      const grid = element('div', 'weekly-grid');
      for (const entry of source.tracks) {
        const link = external('', entry.source, 'weekly-entry');
        link.setAttribute('aria-label', '在 QQ 音乐查看 ' + entry.title);
        const cover = document.createElement('img');
        cover.alt = '';
        cover.loading = 'lazy';
        cover.src = entry.image;
        cover.addEventListener('error', () => {
          if (cover.dataset.fallback) return;
          cover.dataset.fallback = 'true';
          cover.src = media.artwork.records;
        });
        const info = element('span', 'weekly-info');
        info.append(element('strong', '', entry.title), element('small', '', entry.artist));
        link.append(element('span', 'weekly-rank', String(entry.rank).padStart(2, '0')), cover, info, icon('open_in_new'));
        grid.append(link);
      }
      node.append(grid);
      return node;
    }

    function mount(after) {
      const content = element('div', 'home-modules');
      content.append(buildPersonal(), buildTools(), buildBooks(), buildVideos(), buildWeekly());
      after.after(content);
    }

    function updatePlayback() {
      const state = api.getPlayback();
      for (const node of app.querySelectorAll('[data-personal-play]')) {
        const active = state.playing && state.current === node.dataset.personalPlay;
        node.replaceChildren(icon(active ? 'pause' : 'play_arrow'));
        node.title = active ? '当前正在播放' : '播放推荐';
      }
    }

    function showRecognition() {
      const items = openSheet('离线试听指纹', 'recognize');
      items.append(element('p', 'feature-scope', '仅匹配站内 3 首试听 · 本地音频指纹'));
      const status = element('p', 'recognition-status', '准备好 8–12 秒的音频，让旋律给出答案。');
      status.setAttribute('role', 'status');
      const result = element('div', 'recognition-result');
      const record = control('录音识别 · 10 秒', 'mic', () => beginRecording(status, result, record), 'hub-primary');
      const fileLabel = element('label', 'file-choice', '选择音频文件');
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'audio/*';
      file.setAttribute('aria-label', '选择待识别的音频');
      fileLabel.append(file);
      file.addEventListener('change', () => {
        const selected = file.files?.[0];
        if (selected) identify(selected, status, result);
      });
      const trial = control('用试听片段试一下', 'science', async () => {
        const response = await fetch(tracks.get(demoIds[0]).audioUrl);
        if (response.ok) identify(await response.blob(), status, result);
        else status.textContent = '试听文件加载失败，请稍后重试。';
      }, 'hub-subtle');
      const controls = element('div', 'recognition-controls');
      controls.append(record, fileLabel, trial);
      items.append(controls, status, result, element('small', '', '音频只在当前浏览器内分析。暂不支持全网曲库或哼唱识别。'));
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        record.disabled = true;
        record.title = '当前浏览器未提供麦克风录音，请选择音频文件。';
      }
    }

    function stopRecording() {
      clearInterval(recordingTimer);
      clearTimeout(recordingEnd);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      microphone?.getTracks().forEach((track) => track.stop());
      microphone = null;
    }

    async function beginRecording(status, result, button) {
      if (recorder && recorder.state === 'recording') { stopRecording(); return; }
      api.pauseMusic();
      stopAuxiliary();
      button.disabled = true;
      status.textContent = '等待麦克风授权…';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (!status.isConnected || sheet.dataset.kind !== 'recognize' || !sheet.open) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        microphone = stream;
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((format) => MediaRecorder.isTypeSupported(format));
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        const chunks = [];
        const start = Date.now();
        recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
        recorder.addEventListener('stop', () => {
          button.disabled = false;
          button.replaceChildren(icon('mic'), document.createTextNode('录音识别 · 10 秒'));
          const file = new Blob(chunks, { type: recorder.mimeType });
          microphone?.getTracks().forEach((track) => track.stop());
          microphone = null;
          if (status.isConnected && sheet.open && sheet.dataset.kind === 'recognize') identify(file, status, result);
        }, { once: true });
        recorder.start();
        button.disabled = false;
        button.replaceChildren(icon('stop'), document.createTextNode('停止并识别'));
        status.textContent = '正在录音 · 0 / 10 秒';
        recordingTimer = setInterval(() => { status.textContent = '正在录音 · ' + Math.min(10, Math.floor((Date.now() - start) / 1000)) + ' / 10 秒'; }, 250);
        recordingEnd = setTimeout(stopRecording, 10000);
      } catch (error) {
        status.textContent = error.name === 'NotAllowedError' ? '麦克风未授权。你也可以直接选择音频文件。' : '无法打开麦克风，请选择音频文件。';
        button.disabled = false;
        stopRecording();
      }
    }

    async function identify(file, status, result) {
      if (file.size > 20 * 1024 * 1024) { status.textContent = '文件较大，请选择不超过 20 MB 的短片段。'; return; }
      analysis?.abort();
      analysis = new AbortController();
      const signal = analysis.signal;
      if (!matchEngine) matchEngine = window.SunnyAudioMatch.create({
        tracks: demoIds.map((id) => ({ id, title: tracks.get(id).name, url: tracks.get(id).audioUrl })),
      });
      status.textContent = '正在分析音频指纹…';
      result.replaceChildren();
      try {
        const found = await matchEngine.identify(file, { signal });
        if (signal.aborted || !result.isConnected) return;
        if (!found.matched) {
          const reasons = { silence: '这段音频较安静，请换一个更清晰的片段。', 'too-short': '片段太短，请提供 8–12 秒的清晰音频。' };
          status.textContent = reasons[found.reason] || '本站试听曲库中没有找到匹配。';
          return;
        }
        status.textContent = '找到了 · 匹配度 ' + Math.round(found.confidence * 100) + '%';
        result.append(picture(found.id), element('strong', '', found.title), element('p', '', tracks.get(found.id).artist));
        result.append(control('从匹配位置播放', 'play_arrow', () => {
          sheet.close();
          api.playTrack(found.id, true, Math.max(0, found.offset));
          api.goPlayer();
        }, 'hub-primary'));
      } catch (error) {
        if (signal.aborted) return;
        status.textContent = '暂时无法解析这个音频。请换一个 MP3、WAV 或录音片段。';
      }
    }

    function stopAuxiliary() {
      spokenAudio?.pause();
      cloud.stopAudio();
    }

    function clearDialogMedia() {
      analysis?.abort();
      stopRecording();
      stopAuxiliary();
      save('spoken-progress', storedBookProgress);
      if (spokenAudio) { spokenAudio.removeAttribute('src'); spokenAudio.load(); }
      spokenAudio = null;
      bookControl = null;
      for (const iframe of sheet.querySelectorAll('iframe')) iframe.remove();
    }

    sheet.addEventListener('close', clearDialogMedia);
    window.addEventListener('pagehide', () => {
      clearDialogMedia();
      matchEngine?.dispose();
      for (const url of spokenBuffers.values()) URL.revokeObjectURL(url);
    });

    return {
      mount, updatePlayback, stopAuxiliary, showVideo,
      appendCredits(items) {
        items.append(element('h3', '', '听书 · 原创微故事'));
        for (const book of media.spoken) {
          const item = element('article', 'credit-entry');
          item.append(element('strong', '', book.title), element('p', '', book.credit), external(book.license, book.licenseUrl));
          items.append(item);
        }
        items.append(external('本周榜单来源 · ' + media.weekly.date, media.weekly.source));
      },
    };
  }

  window.SunnyHomeModules = Object.freeze({ create });
})();
