(() => {
  'use strict';

  const app = document.querySelector('#app');
  const sheet = document.querySelector('#sheet');
  const status = document.querySelector('#notice');
  const audio = document.querySelector('#media-player');
  const media = JSON.parse(document.querySelector('#media-catalog').textContent);
  const titles = { home: '首页推荐', hot: '热门音乐', mine: '我的音乐', playlist: '歌单详情', search: '搜索', player: '播放器与歌词' };
  const nav = ['home', 'hot', 'mine', 'playlist', 'search'];
  const template = (view) => document.querySelector('#view-' + view).content;
  const query = (selector, root = app) => root.querySelector(selector);
  const all = (selector, root = app) => [...root.querySelectorAll(selector)];
  const text = (selector, root = app) => query(selector, root)?.textContent.trim() ?? '';
  const setText = (selector, value, root = app) => { const node = query(selector, root); if (node) node.textContent = value; };
  const normalize = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const formatTime = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  const searchHref = (keyword) => '#search?q=' + encodeURIComponent(keyword);
  const playlistHref = (id) => '#playlist/' + id;
  const colors = [
    'linear-gradient(135deg,#ff6fb5,#ffb772)',
    'linear-gradient(135deg,#4cc9f0,#a680ef)',
    'linear-gradient(135deg,#2ec4b6,#a8eaca)',
    'linear-gradient(135deg,#7b6ef6,#ff8fd0)',
    'linear-gradient(135deg,#ffb347,#ff6f91)',
  ];

  function getStored(key, fallback) {
    try { return JSON.parse(localStorage.getItem('sunny-music.' + key)) ?? fallback; }
    catch { return fallback; }
  }

  function store(key, value) {
    try { localStorage.setItem('sunny-music.' + key, JSON.stringify(value)); }
    catch { /* The current browser session can still use the site. */ }
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function icon(name) {
    const node = element('span', 'material-icons', name);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function linkify(node, href, label) {
    if (!node) return;
    const anchor = element('a', node.className);
    anchor.href = href;
    if (node.style.cssText) anchor.style.cssText = node.style.cssText;
    if (label) anchor.setAttribute('aria-label', label);
    anchor.append(...node.childNodes);
    node.replaceWith(anchor);
    return anchor;
  }

  function bind(node, action, value = '', label = '') {
    if (!node) return;
    node.dataset.action = action;
    node.dataset.value = value;
    if (node.classList.contains('material-icons')) node.removeAttribute('aria-hidden');
    if (!node.matches('button, a, input')) {
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
    }
    if (label) {
      node.setAttribute('aria-label', label);
      node.title = label;
    }
    return node;
  }

  function button(label, action, value, glyph) {
    const node = element('button', 'reset');
    node.type = 'button';
    if (glyph) node.append(icon(glyph), document.createTextNode(' '));
    node.append(label);
    return action ? bind(node, action, value) : node;
  }

  function plainTitle(node) {
    const clean = node.cloneNode(true);
    all('.tag,.r-tag', clean).forEach((tag) => tag.remove());
    return clean.textContent.trim();
  }

  const tracks = new Map();
  const lists = {};
  const rowSelectors = {
    playlist: '.list-card > .row',
    hot: '.chart > .row',
    mine: '.two-col .track',
    search: '.grid2 > div:first-child .card:nth-child(2) > .row',
    home: '.track-panel .track',
  };

  for (const [view, selector] of Object.entries(rowSelectors)) {
    const ids = [];
    for (const row of all(selector, template(view))) {
      const name = plainTitle(query('.t-name,.r-name', row));
      const id = normalize(name);
      const parts = text('.r-artist,.t-artist', row).split(' · ');
      const time = text('.t-play,.r-time,.t-dur,.r-dur', row);
      const duration = /^\d+:\d\d$/.test(time) ? time : parts.find((part) => /^\d+:\d\d$/.test(part));
      const [minutes, seconds] = (duration ?? '3:00').split(':').map(Number);
      const album = view === 'search' ? parts[1] : text('.t-alb,.r-alb', row) || parts[1];
      const cover = text('.mini,.cover', row);
      if (!tracks.has(id)) {
        tracks.set(id, { id, name, artist: parts[0], album: album ?? '', duration: minutes * 60 + seconds, cover, color: colors[tracks.size % colors.length] });
      }
      row.dataset.trackId = id;
      ids.push(id);
    }
    lists[view] = ids;
  }

  for (const [index, recording] of media.music.entries()) {
    tracks.set(recording.id, {
      ...recording,
      name: recording.title,
      audioUrl: recording.url,
      color: ['linear-gradient(135deg,#f97a88,#ffc285)', 'linear-gradient(135deg,#70aec2,#6676dc)', 'linear-gradient(135deg,#36bba7,#9dd890)'][index % 3],
      cover: recording.title.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
    });
  }
  const demoIds = media.music.map((recording) => recording.id);
  const playable = (id) => Boolean(tracks.get(id)?.audioUrl);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const portraitByKey = new Map(media.portraits.flatMap((portrait) => [portrait.slug, portrait.name, portrait.nameZh]
    .filter(Boolean).map((key) => [key, portrait])));
  const portraitName = (portrait) => portrait.nameZh || portrait.name;
  const artworkForPlaylist = {
    previews: 'records', guide: 'taylor-swift', taylor: 'taylor-swift', newjeans: 'dance',
    beach: 'seaside', western: 'stage', lover: 'romance', attention: 'dance', study: 'study', morning: 'dawn',
    night: 'midnight', energy: 'workout',
  };
  const backdropGroup = element('div', 'page-ambience');
  backdropGroup.setAttribute('aria-hidden', 'true');
  document.body.prepend(backdropGroup);
  let spotlight = Math.max(0, media.portraits.findIndex((item) => item.slug === getStored('wallpaper', '')));
  let rotateSpotlight = getStored('spotlight-rotation', !reducedMotion.matches);
  let spotlightInteraction = Date.now();
  const homePagers = [];
  const swipeCleanups = [];
  let firstMount = true;
  let homeFeatures;
  let hotFeatures;

  const trackIds = (...names) => names.map(normalize).filter((id) => tracks.has(id));
  const byArtist = (name) => [...tracks.values()].filter((track) => track.artist.includes(name)).map((track) => track.id);
  const playlists = {
    previews: { title: '夏日试听曲库', cover: 'LIVE', tag: '独立音乐 · 带歌词', tracks: demoIds },
    guide: { title: '梅梅的夏日入坑指南', cover: 'LOVER', tag: '粉紫恋歌', tracks: lists.playlist },
    taylor: { title: 'Taylor Swift 必听 20 首', cover: 'TS', tag: '官方推荐', tracks: byArtist('Taylor Swift') },
    newjeans: { title: 'NewJeans 全记录', cover: 'NJ', tag: '韩语流行', tracks: byArtist('NewJeans') },
    beach: { title: '夏日海边 FM', cover: '☀', tag: '清爽', tracks: trackIds('As It Was', 'Watermelon Sugar', 'Super Shy', 'Sunroof', 'Attention') },
    western: { title: '欧美热歌榜 Top 50', cover: '#', tag: '欧美流行', tracks: lists.hot.filter((id) => !byArtist('NewJeans').includes(id)) },
    lover: { title: 'Lover · 专辑精选', cover: 'L', tag: '粉紫恋歌', tracks: trackIds('Cruel Summer', 'Lover') },
    attention: { title: 'Attention 循环池', cover: 'A', tag: 'NewJeans', tracks: trackIds('Attention', 'Hype Boy', 'Ditto', 'OMG') },
    study: { title: '晚自习轻音乐', cover: '♪', tag: '专注', tracks: trackIds('Golden Hour', "I'm Yours", 'Ditto') },
    morning: { title: '晨间唤醒曲', cover: '◐', tag: '元气', tracks: trackIds('Levitating', 'Sunroof', 'Super Shy', 'Hype Boy') },
    night: { title: '深夜电台', cover: '☾', tag: '慢节奏', tracks: ['swansong', ...trackIds('Ditto', 'Lover', 'Golden Hour')] },
    energy: { title: '元气运动', cover: '↗', tag: '律动', tracks: ['good-to-go', ...trackIds('Levitating', 'Super Shy', 'As It Was')] },
  };
  const artistData = [...tracks.values()].reduce((artists, track) => {
    if (!artists.has(track.artist)) artists.set(track.artist, track);
    return artists;
  }, new Map());
  for (const portrait of media.portraits) {
    const name = portraitName(portrait);
    if (!artistData.has(name)) artistData.set(name, { artist: name, portrait });
  }

  const seededFavorites = lists.mine.filter((id) => query('[data-track-id="' + id + '"] .t-act .material-icons', template('mine'))?.textContent === 'favorite');
  const favorites = new Set(getStored('favorites', seededFavorites));
  const playlistSaves = new Set(getStored('playlists', []));
  const follows = new Set(getStored('follows', ['NewJeans']));
  let recent = getStored('recent', []).filter(playable);
  let historyItems = getStored('history', ['newjeans', 'taylor swift', 'cruel summer', 'ditto', '夏日歌单', 'hype boy']);
  let profileName = getStored('name', 'Summer_S');
  let route, previousView = '#home', scrollToRestore = 0;
  let hotTab = '可试听', mineTab = '歌曲', searchTab = '单曲';
  let autoScroll = true, lyricIndex = -1, lyricLanguage = '双语';
  const playlistFilters = new Map();
  const savedPlayback = getStored('playback', {});
  const savedQueue = Array.isArray(savedPlayback.queue) ? savedPlayback.queue.filter(playable) : [];
  let queue = savedQueue.length ? [...new Set(savedQueue)] : [...demoIds];
  let current = queue.includes(savedPlayback.current) ? savedPlayback.current : queue[0];
  let elapsed = savedPlayback.current === current && Number.isFinite(savedPlayback.elapsed)
    ? Math.max(0, Math.min(savedPlayback.elapsed, tracks.get(current).duration))
    : 0;
  let playing = false, shuffle = savedPlayback.shuffle === true, repeat = savedPlayback.repeat === true;
  let volume = Number.isFinite(savedPlayback.volume) ? Math.min(1, Math.max(0, savedPlayback.volume)) : .78;
  let speed = [0.75, 1, 1.25, 1.5, 2].includes(savedPlayback.speed) ? savedPlayback.speed : 1;
  let muted = savedPlayback.muted === true;
  let sleepUntil = 0, sleepMinutes = 0, playbackState = 'pause', playbackEpoch = 0;
  let pendingSeek = null;
  const localFile = location.protocol === 'file:';
  const clipBuffers = new Map();
  const clipRequests = new Map();
  let lastSavedSecond = Math.floor(elapsed);
  let toastTimer;

  function applyArtwork(node, key, panel = false) {
    if (!node) return;
    const portrait = portraitByKey.get(key);
    const url = portrait?.url || media.artwork[key] || media.artwork.records;
    node.style.setProperty('--cover-image', 'url("' + url + '")');
    node.style.setProperty('--cover-position', portrait?.position || 'center');
    node.dataset.artwork = key;
    node.classList.add(panel ? 'art-panel' : 'image-cover');
    if (!panel) {
      node.style.removeProperty('background');
      for (const child of [...node.childNodes]) {
        if (child.nodeType !== Node.ELEMENT_NODE || !child.matches('.material-icons')) child.remove();
      }
    }
  }

  function trackArtwork(track) {
    if (track.audioUrl) return track.id;
    if (portraitByKey.has(track.artist)) return track.artist;
    if (track.artist.includes('NewJeans')) return 'dance';
    if (/Golden|Sunroof/i.test(track.name)) return 'dawn';
    if (/Lover|Adore|Smile/i.test(track.name)) return 'romance';
    if (/Dua Lipa|Harry Styles|Benson Boone|Miley Cyrus/.test(track.artist)) return 'stage';
    return 'records';
  }

  function savePlayback() {
    lastSavedSecond = Math.floor(elapsed);
    store('playback', { queue, current, elapsed: Number(elapsed.toFixed(2)), shuffle, repeat, volume, speed, muted });
  }

  function notice(message) {
    clearTimeout(toastTimer);
    status.textContent = message;
    status.classList.add('visible');
    toastTimer = setTimeout(() => status.classList.remove('visible'), 2600);
  }

  function readRoute() {
    const [path, params] = location.hash.slice(1).split('?');
    const [page, key] = path.split('/');
    const search = new URLSearchParams(params);
    return {
      page: Object.hasOwn(titles, page) ? page : 'home',
      playlist: Object.hasOwn(playlists, key) ? key : 'guide',
      keyword: search.get('q') ?? 'newjeans',
      track: search.get('track'),
      time: search.has('t') ? Number(search.get('t')) : undefined,
    };
  }

  function setupShell() {
    setSpotlight(spotlight);
    window.SunnyLiveDate.mount(route.page === 'player' ? null : query('.topbar'));
    const primary = query('.sidebar .nav-group');
    if (primary) {
      primary.setAttribute('role', 'navigation');
      primary.setAttribute('aria-label', '主导航');
      all('.nav-item', primary).forEach((item, i) => {
        const anchor = linkify(item, '#' + nav[i]);
        if (route.page === nav[i]) anchor.setAttribute('aria-current', 'page');
      });
      linkify(query('.logo'), '#home', '夏日音乐首页');
      const shuffleLaunch = button('随机试听', 'random-preview', '', 'shuffle');
      shuffleLaunch.classList.add('shuffle-launch');
      shuffleLaunch.setAttribute('aria-label', '随机试听');
      shuffleLaunch.append(element('small', 'shuffle-detail', demoIds.length + ' 首可试听'));
      query('.sidebar').append(shuffleLaunch);
    }
    const searchLink = linkify(query('.topbar .search'), searchHref(''), '搜索音乐');
    if (searchLink) {
      const shortcut = element('kbd', 'search-shortcut', /Mac/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
      shortcut.setAttribute('aria-hidden', 'true');
      searchLink.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
      searchLink.append(shortcut);
    }
    linkify(query('.topbar .avatar'), '#mine', '我的音乐');
    if (query('.topbar .avatar')) setText('.topbar .avatar', [...profileName][0].toUpperCase());
    all('.note,.page-tag').forEach((note) => note.remove());

    if (route.page !== 'hot' && route.page !== 'search') {
      for (const entry of all('.pl-item')) {
        const label = entry.textContent.trim().replace(/^(favorite)/, '');
        if (label.includes('我喜欢')) bind(entry, 'go-favorites');
        else if (label.includes('NewJeans')) linkify(entry, playlistHref('newjeans'));
        else if (label.includes('梅梅')) linkify(entry, playlistHref('guide'));
        else if (label.includes('海边')) linkify(entry, playlistHref('beach'));
        else if (label.includes('欧美')) linkify(entry, playlistHref('western'));
        else if (label.includes('自习')) linkify(entry, playlistHref('study'));
      }
    }

    if (!query('.playerbar')) return;
    const left = query('.pb-left');
    const track = element('a', 'pb-track');
    track.href = '#player';
    track.setAttribute('aria-label', '打开播放器与歌词');
    track.append(left.firstElementChild, left.firstElementChild);
    left.prepend(track);
    bind(query('.pb-left > .material-icons'), 'favorite');
    const [lyrics, queueIcon, volume] = all('.pb-right > .material-icons');
    bind(lyrics, 'open-player', '', '打开歌词');
    const queueTrigger = button('', 'queue');
    queueTrigger.classList.add('queue-trigger');
    queueTrigger.setAttribute('aria-label', '播放队列');
    queueTrigger.append(icon('queue_music'), element('span', 'queue-badge'));
    queueIcon.replaceWith(queueTrigger);
    volume.textContent = 'volume_up';
    bind(volume, 'playback-settings', '', '音量、倍速与睡眠定时');
    setupTransport('.pb-center', '.play', '.progress', '.bar');
  }

  function setupTransport(controls, play, timeline, bar) {
    bind(query(play), 'toggle-play', '', '播放');
    const labels = { shuffle: '随机播放', skip_previous: '上一首', skip_next: '下一首', repeat: '单曲循环' };
    const actions = { shuffle: 'shuffle', skip_previous: 'previous', skip_next: 'next', repeat: 'repeat' };
    for (const node of all(controls + ' > .material-icons')) {
      bind(node, actions[node.textContent], '', labels[node.textContent]);
    }
    const seek = element('input', 'seek');
    seek.type = 'range';
    seek.min = '0';
    seek.step = '0.01';
    seek.setAttribute('aria-label', '播放进度');
    query(bar)?.replaceWith(seek);
    const times = all(timeline + ' > span:not(.material-icons)');
    times[0].dataset.time = 'current';
    times[1].dataset.time = 'duration';
  }

  function enhanceTrackRows(root = app) {
    for (const row of all('[data-track-id]', root)) {
      if (row.dataset.ready) continue;
      const track = tracks.get(row.dataset.trackId);
      if (!track) continue;
      row.dataset.ready = 'true';
      const name = query('.t-name,.r-name,.s-name', row);
      if (name) {
        const trigger = button('', 'play-track', track.id);
        trigger.setAttribute('aria-label', (playable(track.id) ? '播放 ' : '查看 ') + track.name);
        trigger.classList.add('song-title');
        trigger.append(...name.childNodes);
        name.append(trigger);
        if (playable(track.id)) name.append(element('span', 'available-label', '试听'));
      }
      const actions = {
        favorite: ['favorite', '收藏歌曲'],
        favorite_border: ['favorite', '收藏歌曲'],
        more_horiz: ['track-actions', '歌曲选项'],
        queue_music: ['add-queue', '加入播放队列'],
        download: ['download', '离线下载'],
        play_circle_outline: ['play-track', '播放歌曲'],
      };
      for (const node of all('.material-icons', row)) {
        const action = actions[node.textContent];
        if (action) bind(node, action[0], track.id, action[1] + ' · ' + track.name);
      }
      row.classList.toggle('has-audio', playable(track.id));
      applyArtwork(query('.mini,.cover', row), trackArtwork(track));
    }
  }

  function makeRow(id, view, number) {
    const track = tracks.get(id);
    const personal = view === 'mine';
    const row = element('div', personal ? 'track' : 'row');
    row.dataset.trackId = id;
    if (number) row.append(element('div', personal ? 'tk' : 'rk', number));
    const cover = element('div', view === 'hot' ? 'cover' : 'mini', track.cover);
    cover.style.background = track.color;
    const info = element('div', personal ? 't-info' : 'r-info');
    const parts = [track.artist];
    if (view === 'search' || view === 'hot') parts.push(track.album);
    if (view === 'search') parts.push(formatTime(track.duration));
    const detail = parts.filter(Boolean).join(' · ');
    info.append(element('div', personal ? 't-name' : 'r-name', track.name), element('div', personal ? 't-artist' : 'r-artist', detail));
    row.append(cover, info);
    if (view === 'hot') row.append(element('div', 'r-time', formatTime(track.duration)));
    else if (view !== 'search') row.append(element('div', personal ? 't-alb' : 'r-alb', track.album), element('div', personal ? 't-dur' : 'r-dur', formatTime(track.duration)));
    const actions = element('div', personal ? 't-act' : 'r-act');
    actions.append(icon('favorite_border'), icon('queue_music'));
    row.append(actions);
    return row;
  }

  function empty(message) { return element('p', 'no-results', message); }

  function setSpotlight(index, manual = false) {
    const count = media.portraits.length;
    if (index !== spotlight || manual) spotlightInteraction = Date.now();
    spotlight = (index + count) % count;
    const portrait = media.portraits[spotlight];
    if (manual) store('wallpaper', portrait.slug);
    let photo = query('[data-portrait="' + portrait.slug + '"]', backdropGroup);
    if (!photo) {
      photo = element('img', 'wallpaper-photo');
      photo.dataset.portrait = portrait.slug;
      photo.alt = '';
      photo.src = portrait.url;
      photo.decoding = 'async';
      photo.style.objectPosition = portrait.position || 'center';
      backdropGroup.append(photo);
    }
    for (const image of backdropGroup.children) image.classList.toggle('active', image === photo);
    backdropGroup.style.setProperty('--portrait-color', portrait.theme || '#675084');
    for (const choice of document.querySelectorAll('[data-action="spotlight-select"]')) {
      choice.setAttribute('aria-pressed', String(Number(choice.dataset.value) === spotlight));
    }
    const stage = query('.artist-stage');
    if (!stage) return;
    const slides = all('.spotlight-image', stage);
    slides.forEach((img, i) => {
      if ((i === spotlight || i === (spotlight + 1) % count) && !img.hasAttribute('src')) img.src = media.portraits[i].url;
      img.classList.toggle('active', i === spotlight);
    });
    setText('.stage-name', portraitName(portrait), stage);
    setText('.stage-context', portrait.context, stage);
    setText('.stage-counter', String(spotlight + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0'), stage);
  }

  function addSwipe(surface, advance, onInteract) {
    swipeCleanups.push(window.SunnySwipe.attach(surface, advance, onInteract));
  }

  function addPager(heading, viewport, { id, title, capacity, period, columns = false }) {
    const cards = [...viewport.children];
    const controls = element('div', 'pager-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', title + '翻页');
    const previous = queueButton('keyboard_arrow_left', '', '', title + '上一页');
    const next = queueButton('keyboard_arrow_right', '', '', title + '下一页');
    const toggle = queueButton('pause', '', '', '');
    const display = element('span', 'pager-count');
    controls.append(previous, display, next, toggle);
    heading.append(controls);
    viewport.dataset.gallery = id;
    viewport.classList.add('pager-viewport');
    viewport.setAttribute('aria-label', title);
    viewport.setAttribute('aria-roledescription', '轮播');

    let size = capacity();
    let page = 0;
    let enabled = getStored('pager:' + id, !reducedMotion.matches);
    let nextTick = Date.now() + period;
    let transition;
    const pageCount = () => Math.ceil(cards.length / size);

    function displayPage(animate = false, slideDirection = 0) {
      const low = page * size;
      for (const [i, card] of cards.entries()) card.hidden = i < low || i >= low + size;
      if (columns) viewport.style.setProperty('--gallery-columns', String(size));
      viewport.dataset.page = String(page + 1);
      controls.hidden = pageCount() <= 1;
      display.textContent = (page + 1) + ' / ' + pageCount();
      display.setAttribute('aria-label', '第 ' + (page + 1) + ' 页，共 ' + pageCount() + ' 页');
      toggle.title = (enabled ? '暂停' : '开启') + title + '自动翻页';
      toggle.setAttribute('aria-label', toggle.title);
      setText('.material-icons', enabled ? 'pause' : 'play_arrow', toggle);
      if (animate && !reducedMotion.matches) {
        transition?.cancel();
        transition = viewport.animate(
          slideDirection ? [
            { opacity: .4, transform: 'translateX(' + (slideDirection * 4) + '%) scale(.97)' },
            { opacity: 1, transform: 'translateX(' + (-slideDirection * .4) + '%) scale(1.005)', offset: .7 },
            { opacity: 1, transform: 'translateX(0) scale(1)' },
          ] : [
            { opacity: .2, transform: 'translateY(24px) scale(.92)' },
            { opacity: 1, transform: 'translateY(-8px) scale(1.025)', offset: .5 },
            { transform: 'translateY(3px) scale(.992)', offset: .76 },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: slideDirection ? 470 : 630, easing: 'cubic-bezier(.2,.7,.2,1)' },
        );
      }
    }

    function advance(direction, gesture) {
      if (pageCount() < 2) return;
      page = (page + direction + pageCount()) % pageCount();
      nextTick = Date.now() + period;
      displayPage(true, gesture === 'swipe' ? direction : 0);
    }

    previous.addEventListener('click', () => advance(-1));
    next.addEventListener('click', () => advance(1));
    toggle.addEventListener('click', () => {
      enabled = !enabled;
      nextTick = Date.now() + period;
      store('pager:' + id, enabled);
      displayPage();
    });
    addSwipe(viewport, advance, () => { nextTick = Date.now() + period; });
    homePagers.push({
      tick(now) {
        if (!enabled || now < nextTick || viewport.classList.contains('swipe-active') || viewport.matches(':hover, :focus-within')) return;
        advance(1);
      },
      resize() {
        const wanted = capacity();
        if (wanted === size) return;
        page = Math.floor(page * size / wanted);
        size = wanted;
        displayPage();
      },
    });
    displayPage();
  }

  function setupSpotlight() {
    const stage = element('section', 'artist-stage');
    stage.setAttribute('aria-roledescription', '轮播');
    stage.setAttribute('aria-label', '热门歌手舞台写真');
    const art = element('div', 'stage-images');
    art.setAttribute('aria-hidden', 'true');
    for (const [i, view] of media.portraits.entries()) {
      const img = element('img', 'spotlight-image');
      img.alt = '';
      img.decoding = 'async';
      img.fetchPriority = i === spotlight ? 'high' : 'low';
      img.style.objectPosition = view.stagePosition || view.position || 'center';
      art.append(img);
    }

    const copy = element('div', 'stage-copy');
    const browse = button('开始试听', 'listen-now', '', 'play_arrow');
    browse.classList.add('stage-play');
    copy.append(element('p', 'stage-label', '舞台聚光'), element('h1', 'stage-name'), element('p', 'stage-context'), browse);
    const navigation = element('div', 'stage-navigation');
    const counter = element('span', 'stage-counter');
    const toggle = queueButton(rotateSpotlight ? 'pause' : 'play_arrow', 'spotlight-toggle', '', rotateSpotlight ? '暂停写真轮播' : '开启写真轮播');
    const source = queueButton('copyright', 'credits', '', '素材署名');
    source.classList.add('stage-source');
    const previous = queueButton('keyboard_arrow_left', 'spotlight-move', '-1', '上一张写真');
    const next = queueButton('keyboard_arrow_right', 'spotlight-move', '1', '下一张写真');
    navigation.append(previous, counter, next, toggle, source);
    const hint = element('span', 'stage-swipe-hint');
    hint.setAttribute('aria-hidden', 'true');
    hint.append(icon('swipe'), document.createTextNode('左右滑动切换写真'));
    stage.append(art, copy, navigation, hint);
    addSwipe(stage, (direction) => {
      setSpotlight(spotlight + direction, true);
      if (!reducedMotion.matches) query('.spotlight-image.active', stage)?.animate([
        { transform: 'translateX(' + (direction * 4) + '%) scale(1.1)', opacity: .35 },
        { transform: 'translateX(0) scale(1)', opacity: 1 },
      ], { duration: 480, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }, () => { spotlightInteraction = Date.now(); });
    query('.hero').replaceWith(stage);
    query('.banners')?.remove();
    setSpotlight(spotlight);
  }

  function setupListenSection() {
    const library = element('section', 'listen-library');
    library.id = 'listen';
    const header = element('div', 'listen-header');
    const textBlock = element('div');
    textBlock.append(element('h2', '', '试听曲库'), element('p', '', demoIds.length + ' 首独立音乐 · 同步歌词'));
    const link = element('a', 'listen-link', '全部曲目');
    link.href = playlistHref('previews');
    link.append(icon('arrow_forward'));
    header.append(textBlock, link);
    const grid = element('div', 'preview-grid');
    for (const id of demoIds) {
      const track = tracks.get(id);
      const tile = element('article', 'preview-tile');
      tile.dataset.trackId = id;
      tile.dataset.ready = 'true';
      const cover = element('span', 'preview-cover');
      applyArtwork(cover, trackArtwork(track));
      applyArtwork(tile, trackArtwork(track), true);
      const info = element('div', 'preview-info');
      info.append(element('h3', '', track.name), element('p', '', track.artist + ' · ' + formatTime(track.duration)));
      const play = queueButton('play_arrow', 'preview-play', id, '试听 ' + track.name);
      play.classList.add('preview-play');
      tile.append(cover, info, play);
      grid.append(tile);
    }
    library.append(header, grid);
    query('.artist-stage').after(library);
  }

  function portraitChoices() {
    return media.portraits.map((portrait, i) => {
      const control = button('', 'spotlight-select', String(i));
      control.classList.add('portrait-choice');
      control.setAttribute('aria-pressed', String(i === spotlight));
      control.setAttribute('aria-label', '切换写真：' + portraitName(portrait));
      const image = element('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = portrait.url;
      image.style.objectPosition = portrait.position || 'center';
      control.append(image, element('span', '', portraitName(portrait)));
      return control;
    });
  }

  function setupPortraitRail(parent) {
    const section = element('section', 'portrait-section');
    const heading = element('div', 'section-head');
    heading.append(element('h2', '', '歌手写真'));
    const grid = element('div', 'portrait-rail');
    grid.append(...portraitChoices());
    section.append(heading, grid);
    parent.after(section);
    addPager(heading, grid, {
      id: 'portraits', title: '歌手写真', period: 8100, columns: true,
      capacity: () => innerWidth <= 720 ? 3 : innerWidth <= 1080 ? 4 : 5,
    });
  }

  function setupHomeTrackPager() {
    const card = query('.track-panel .card:not(.mood)');
    const heading = query('.section-head', card);
    query('span', heading)?.remove();
    const rows = element('div', 'guess-items');
    const list = [...new Set([...recent, ...demoIds, ...lists.home, ...lists.hot])].slice(0, 9);
    for (const id of list) {
      const row = makeRow(id, 'mine');
      query('.t-alb', row)?.remove();
      query('.t-dur', row).className = 't-play';
      rows.append(row);
    }
    card.replaceChildren(heading, rows);
    addPager(heading, rows, { id: 'guess', title: '猜你想听', period: 9350, capacity: () => 3 });
  }

  function setupMoodPager() {
    const card = query('.track-panel .mood');
    const grid = query('.mood-grid', card);
    const ids = ['beach', 'lover', 'night', 'energy'];
    all('.mood-item', grid).forEach((node, i) => applyArtwork(linkify(node, playlistHref(ids[i])), artworkForPlaylist[ids[i]], true));
    for (const [title, line, key, art, glyph] of [
      ['晚自习', '把注意力留给此刻', 'study', 'study', 'headphones'],
      ['通勤路上', '轻松开始新一天', 'morning', 'offline', 'train'],
      ['现场热浪', '抬高音量', 'western', 'stage', 'graphic_eq'],
      ['舞池心情', '跟着节拍动起来', 'newjeans', 'dance', 'music_note'],
    ]) {
      const link = element('a', 'mood-item');
      link.href = playlistHref(key);
      link.append(icon(glyph), document.createTextNode(title), element('span', '', line));
      applyArtwork(link, art, true);
      grid.append(link);
    }
    addPager(query('.section-head', card), grid, { id: 'moods', title: '按心情听', period: 10400, capacity: () => 4 });
  }

  function setupHome() {
    setupSpotlight();
    setupListenSection();
    const ids = ['taylor', 'newjeans', 'beach', 'western', 'lover', 'attention', 'study', 'morning'];
    all('.album').forEach((node, i) => {
      applyArtwork(query('.cover', node), artworkForPlaylist[ids[i]]);
      linkify(node, playlistHref(ids[i]));
    });
    linkify(query('.section-head .more'), '#hot');
    setText('.content > .section-head > span:not(.more)', '曲目索引');
    const features = element('div', 'discovery-feature');
    const stage = query('.artist-stage');
    stage.before(features);
    features.append(stage, query('.listen-library'));
    const collections = element('section', 'home-collections');
    const heading = query('.content > .section-head');
    heading.before(collections);
    const grid = query('.content > .grid');
    collections.append(heading, grid);
    addPager(heading, grid, {
      id: 'recommendations', title: '今日推荐', period: 6900, columns: true,
      capacity: () => innerWidth <= 720 ? 2 : innerWidth <= 900 ? 3 : 4,
    });
    all('.track-panel .card').forEach((card, i) => applyArtwork(card, i === 0 ? 'recent' : 'records', true));
    setupPortraitRail(collections);
    setupHomeTrackPager();
    setupMoodPager();
    homeFeatures.mount(features);
  }

  const hotFilters = {
    可试听: () => demoIds,
    热歌榜: (ids) => ids,
    新歌榜: (ids) => [...ids].reverse(),
    飙升榜: (ids) => trackIds('OMG', 'Blank Space', 'Super Shy', 'Attention', 'Beautiful Things'),
    'K-Pop': (ids) => ids.filter((id) => byArtist('NewJeans').includes(id)),
    欧美: (ids) => ids.filter((id) => !byArtist('NewJeans').includes(id)),
  };

  function setupHot() {
    const ids = hotFilters[hotTab](lists.hot);
    const chart = query('.chart');
    setText('.page-head .sub', '试听独立音乐，浏览流行曲目索引');
    if (hotTab !== '热歌榜') {
      setText('.chart h2', hotTab === '可试听' ? '独立音乐精选' : hotTab + ' TOP ' + ids.length);
      setText('.chart p', hotTab === '可试听' ? '开放授权录音片段 · 带同步歌词' : '夏日音乐 · 榜单示例');
      all('.chart > .row').forEach((row) => row.remove());
      chart.append(...ids.map((id, i) => makeRow(id, 'hot', i + 1)));
    }
    query('.page-head .tabs').prepend(element('div', 'tab', '可试听'));
    for (const tab of all('.tabs .tab')) {
      tab.classList.toggle('on', tab.textContent === hotTab);
      bind(tab, 'hot-tab', tab.textContent);
      tab.setAttribute('aria-pressed', String(tab.textContent === hotTab));
    }
    all('.sidebar .pl-item').forEach((node, i) => bind(node, 'hot-tab', ['热歌榜', 'K-Pop', '欧美', '新歌榜'][i]));
    bind(query('.btn-play'), 'play-list', ids.join('|'));
    applyArtwork(query('.page-head'), 'stage', true);
    applyArtwork(query('.chart-top'), hotTab === '可试听' ? 'records' : hotTab === 'K-Pop' ? 'dance' : 'stage', true);
    all('.side-card').forEach((card, i) => applyArtwork(card, ['comments', 'stage'][i], true));
    for (const row of all('.surge')) {
      const id = normalize(text('.s-name', row));
      applyArtwork(query('.s-mini', row), tracks.has(id) ? trackArtwork(tracks.get(id)) : 'stage');
      bind(row, tracks.has(id) ? 'play-track' : 'go-search', tracks.has(id) ? id : text('.s-name', row));
    }
    hotFeatures.mount(query('.content'), chart);
  }

  function makeGroup(title, subtitle, glyph, href) {
    const node = element('a', 'group-item');
    node.href = href;
    const block = element('div', '', title);
    block.append(element('small', '', subtitle));
    const cover = element('span', 'group-cover');
    cover.setAttribute('aria-hidden', 'true');
    const record = [...tracks.values()].find((track) => track.name === title || track.album === title);
    const fallback = { album: 'records', queue_music: 'discovery', person: 'stage', download: 'offline' };
    const key = artworkForPlaylist[href.split('/')[1]] || (record && trackArtwork(record)) || fallback[glyph];
    applyArtwork(cover, portraitByKey.has(title) ? title : key);
    node.append(cover, block);
    return node;
  }

  function setupMine() {
    const list = query('.two-col > div');
    const listHead = query('.list-head');
    const savedTracks = [...favorites].filter((id) => tracks.has(id));
    const ids = [...new Set([...lists.mine, ...savedTracks])];
    const albums = [...new Set(savedTracks.map((id) => tracks.get(id).album).filter(Boolean))];
    const artists = [...new Set([...follows, ...savedTracks.map((id) => tracks.get(id).artist)])];
    const savedLists = [...new Set(['guide', 'newjeans', 'beach', 'study', ...playlistSaves])];
    const counts = { 歌曲: ids.length, 专辑: albums.length, 歌单: savedLists.length, 歌手: artists.length, 已下载: 0 };
    const badge = query('.p-badge');
    query('.p-name').replaceChildren(document.createTextNode(profileName), badge);
    applyArtwork(query('.profile'), 'records', true);
    const stats = all('.p-num');
    [savedTracks.length, savedLists.length, follows.size, '412'].forEach((value, index) => stats[index].textContent = value);
    bind(query('.p-btn'), 'edit-profile');
    const quick = all('.q-card');
    setText('.q-sub', savedTracks.length + ' 首 · 私密', quick[0]);
    setText('.q-sub', recent.length + ' 首', quick[1]);
    setText('.q-sub', '查看可下载的试听', quick[2]);
    setText('.q-sub', '暂无订阅', quick[3]);
    quick.forEach((node, i) => bind(node, 'mine-tab', ['我喜欢', '最近播放', '已下载', '我的播客'][i]));
    quick.forEach((node, i) => applyArtwork(node, ['favorite', 'recent', 'offline', 'podcast'][i], true));
    all('.side-card').forEach((card, i) => applyArtwork(card, i === 0 ? 'recent' : 'records', true));

    for (const tab of all('.tabs > div')) {
      const label = tab.firstChild.textContent.trim();
      setText('.count', counts[label], tab);
      const active = mineTab === label;
      tab.classList.toggle('on', active);
      bind(tab, 'mine-tab', label);
      tab.setAttribute('aria-pressed', String(active));
    }
    const defaultRows = all('.track', list);
    const displayIds = { 歌曲: ids, 我喜欢: savedTracks, 最近播放: recent.filter((id) => tracks.has(id)) }[mineTab];
    listHead.hidden = !displayIds?.length;
    query('.lh-act')?.remove();
    if (mineTab === '歌曲') {
      const extras = ids.filter((id) => !lists.mine.includes(id));
      list.append(...extras.map((id, i) => makeRow(id, 'mine', defaultRows.length + i + 1)));
    } else {
      defaultRows.forEach((row) => row.remove());
      if (displayIds?.length) list.append(...displayIds.map((id, i) => makeRow(id, 'mine', i + 1)));
      else {
        const groups = element('div', 'view-groups');
        if (mineTab === '专辑') groups.append(...albums.map((name) => makeGroup(name, '查看专辑中的歌曲', 'album', searchHref(name))));
        if (mineTab === '歌单') groups.append(...savedLists.map((id) => makeGroup(playlists[id].title, playlists[id].tracks.length + ' 首示例歌曲', 'queue_music', playlistHref(id))));
        if (mineTab === '歌手') groups.append(...artists.map((name) => makeGroup(name, '查看歌手作品', 'person', searchHref(name))));
        if (mineTab === '已下载') groups.append(...demoIds.map((id) => {
          const track = tracks.get(id);
          const download = makeGroup(track.name, track.artist + ' · 下载试听片段', 'download', track.audioUrl);
          download.download = track.file;
          return download;
        }));
        const labels = { 我喜欢: '点击歌曲旁的爱心，就能在这里找到它。', 最近播放: '试听一首歌后，播放记录会出现在这里。', 已下载: '可保存的试听曲目', 我的播客: '暂无订阅。' };
        if (mineTab in labels) groups.prepend(element('h2', '', mineTab));
        if (!groups.querySelector('a')) groups.append(empty(labels[mineTab] ?? '暂无内容。'));
        list.append(groups);
      }
    }

    const recentCard = query('.two-col .side-card');
    all('.recent', recentCard).forEach((node) => node.remove());
    for (const id of recent.slice(0, 5).filter((id) => tracks.has(id))) {
      const track = tracks.get(id);
      const node = element('div', 'recent');
      const cover = element('div', 'r-mini', track.cover);
      applyArtwork(cover, trackArtwork(track));
      const info = element('div');
      info.append(element('div', 'r-name', track.name), element('div', 'r-time', track.artist));
      node.append(cover, info);
      recentCard.append(bind(node, 'play-track', id));
    }
  }

  function setupPlaylist() {
    const entry = playlists[route.playlist];
    const original = route.playlist === 'guide';
    const playlistArtwork = artworkForPlaylist[route.playlist];
    applyArtwork(query('.head'), playlistArtwork, true);
    applyArtwork(query('.big-cover'), playlistArtwork, true);
    query('.big-cover').classList.add('playlist-cover');
    if (!original) {
      setText('.head-info h1', entry.title);
      setText('.crumb b', entry.title);
      setText('.bc-mark', entry.cover);
      setText('.big-cover > div:last-child', '歌单封面 · ' + entry.tag);
      setText('.head-desc', entry.tag + ' · ' + entry.tracks.length + ' 首示例歌曲');
      query('.head-tag').replaceChildren(element('i', '', entry.tag));
      query('.owner').hidden = true;
    }
    const stats = all('.head-stats > div');
    setText('b', entry.tracks.length, stats[0]);
    setText('b', Math.round(entry.tracks.reduce((total, id) => total + tracks.get(id).duration, 0) / 60) + ' 分钟', stats[1]);
    if (!original) stats.slice(2).forEach((node) => node.hidden = true);

    all('.list-card > .row').forEach((row) => row.remove());
    query('.list-card > div:last-child').remove();
    const rows = element('div', 'playlist-rows');
    const count = element('p', 'playlist-count');
    count.setAttribute('aria-live', 'polite');
    query('.list-card').append(rows, count);
    const actions = all('.head-acts button');
    bind(query('.bc-play'), 'play-list', '', '播放全部');
    bind(actions[0], 'play-list');
    bind(actions[1], 'save-playlist', route.playlist);
    actions[2].replaceChildren(icon('download'), document.createTextNode('试听下载'));
    bind(actions[2], 'downloads');
    bind(actions[3], 'share');
    const tabs = all('.ltabs > div:not(.right-tools)');
    ['.list-card', '.side-card', '.side-card:last-child'].forEach((selector, i) => bind(tabs[i], 'playlist-section', selector));
    setText('.ltabs > div:nth-child(2)', '评论');
    query('.right-tools')?.remove();
    const filters = playlistFilters.get(route.playlist) ?? { keyword: '', order: 'default' };
    playlistFilters.set(route.playlist, filters);
    const tools = element('div', 'playlist-tools');
    const field = element('label', 'playlist-search');
    const filter = element('input', 'playlist-filter');
    filter.type = 'search';
    filter.value = filters.keyword;
    filter.placeholder = '在此歌单中搜索';
    filter.setAttribute('aria-label', '在此歌单中搜索');
    const clear = queueButton('close', 'clear-playlist-filter', '', '清空歌单筛选');
    field.append(icon('search'), filter);
    tools.append(field, clear);
    const select = element('select', 'playlist-sort');
    select.setAttribute('aria-label', '歌单排序');
    for (const [value, label] of Object.entries({ default: '默认顺序', title: '按歌名排序', duration: '时长从短到长' })) {
      const option = element('option', '', label);
      option.value = value;
      select.append(option);
    }
    select.value = filters.order;
    tools.append(select);
    query('.l-head').before(tools);
    all('.similar').forEach((node, i) => {
      const id = ['newjeans', 'taylor', 'beach', 'western'][i];
      applyArtwork(query('.s-cover', node), artworkForPlaylist[id]);
      linkify(node, playlistHref(id));
    });
    all('.side-card').forEach((card, i) => applyArtwork(card, i === 0 ? 'comments' : 'discovery', true));
    refreshPlaylistRows();
  }

  function refreshPlaylistRows() {
    const entry = playlists[route.playlist];
    const filters = playlistFilters.get(route.playlist);
    const ids = entry.tracks.filter((id) => {
      const track = tracks.get(id);
      return matches(filters.keyword, [track.name, track.artist, track.album]);
    });
    if (filters.order === 'title') ids.sort((a, b) => tracks.get(a).name.localeCompare(tracks.get(b).name, 'zh-CN'));
    if (filters.order === 'duration') ids.sort((a, b) => tracks.get(a).duration - tracks.get(b).duration);
    const rows = query('.playlist-rows');
    rows.replaceChildren(...ids.map((id, index) => {
      if (route.playlist !== 'guide') return makeRow(id, 'playlist', index + 1);
      const source = all(rowSelectors.playlist, template('playlist')).find((row) => row.dataset.trackId === id);
      const row = source.cloneNode(true);
      setText('.rk', index + 1, row);
      return row;
    }));
    if (!ids.length) rows.append(empty('没有符合条件的歌曲。试试歌名、歌手或专辑。'));
    setText('.playlist-count', filters.keyword ? '找到 ' + ids.length + ' 首 · 共 ' + entry.tracks.length + ' 首' : '共 ' + ids.length + ' 首示例歌曲');
    query('[data-action="clear-playlist-filter"]').hidden = !filters.keyword;
    for (const node of all('.head [data-action="play-list"]')) {
      node.dataset.value = ids.join('|');
      if (node.matches('button')) node.disabled = ids.length === 0;
      node.setAttribute('aria-disabled', String(ids.length === 0));
    }
    enhanceTrackRows(rows);
    refreshControls();
  }

  const aliases = new Map([
    ['泰勒', 'taylor swift'], ['梅梅', 'taylor swift'], ['泰勒·斯威夫特', 'taylor swift'],
    ['夏日歌单', '夏日'], ['欧美热歌 50', '欧美'], ['晚自习专注', '专注'],
  ]);

  function matches(keyword, values) {
    const haystack = normalize(values.join(' ')).replace(/[·×]/g, ' ');
    const needle = normalize(aliases.get(keyword) ?? keyword).replace(/[·×]/g, ' ');
    return needle.split(/\s+/).filter(Boolean).every((part) => haystack.includes(part));
  }

  function historyRow(container) {
    container.replaceChildren(...historyItems.map((word) => {
      const chip = element('div', 'chip');
      const link = element('a', '', word);
      link.href = searchHref(word);
      chip.append(link, bind(icon('close'), 'remove-history', word, '移除搜索记录 ' + word));
      return chip;
    }));
    if (!historyItems.length) container.append(empty('暂无搜索历史'));
  }

  function highlight(node, value, keyword) {
    const words = keyword.trim().split(/[\s·×]+/).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!words.length) { node.textContent = value; return; }
    const pattern = new RegExp(words.map((word) => word.replace(/[.*+?^$(){}|\[\]\\]/g, '\\$&')).join('|'), 'giu');
    let end = 0;
    const content = [];
    for (const hit of value.matchAll(pattern)) {
      content.push(document.createTextNode(value.slice(end, hit.index)), element('mark', '', hit[0]));
      end = hit.index + hit[0].length;
    }
    content.push(document.createTextNode(value.slice(end)));
    node.replaceChildren(...content);
  }

  function searchSuggestions(keyword) {
    if (!keyword) return historyItems.slice(0, 5).map((value) => ({ kind: 'history', title: value, value, detail: '最近搜索' }));
    const songs = [...tracks.values()]
      .filter((track) => matches(keyword, [track.name]))
      .slice(0, 4)
      .map((track) => ({ kind: 'track', title: track.name, value: track.id, detail: '单曲 · ' + track.artist }));
    const artists = [...artistData.keys()]
      .filter((artist) => matches(keyword, [artist]))
      .slice(0, 2)
      .map((artist) => ({ kind: 'artist', title: artist, value: artist, detail: '歌手' }));
    const lists = Object.entries(playlists)
      .filter(([, entry]) => matches(keyword, [entry.title, entry.tag]))
      .slice(0, 2)
      .map(([value, entry]) => ({ kind: 'playlist', title: entry.title, value, detail: '歌单 · ' + entry.tracks.length + ' 首' }));
    return [...songs, ...artists, ...lists];
  }

  function selectSuggestion(index) {
    const options = all('.search-option');
    if (!options.length) return;
    const active = (index + options.length) % options.length;
    options.forEach((node, i) => node.setAttribute('aria-selected', String(i === active)));
    query('.kw').setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  }

  function showSuggestions(field) {
    const popup = query('.search-suggestions');
    const list = query('#search-options', popup);
    const keyword = field.value.trim();
    const glyphs = { track: 'music_note', artist: 'person', playlist: 'queue_music', history: 'history' };
    const results = searchSuggestions(keyword);
    list.replaceChildren(...results.map((result, i) => {
      const row = element('div', 'search-option');
      row.id = 'suggestion-' + i;
      row.dataset.action = 'suggestion';
      row.dataset.value = result.value;
      row.dataset.kind = result.kind;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      const detail = element('span', 'suggestion-text');
      const name = element('strong');
      highlight(name, result.title, keyword);
      detail.append(name, element('small', '', result.detail));
      row.append(icon(glyphs[result.kind]), detail, icon('arrow_forward'));
      return row;
    }));
    popup.hidden = results.length === 0;
    field.removeAttribute('aria-activedescendant');
    field.setAttribute('aria-expanded', String(results.length > 0));
  }

  function hideSuggestions() {
    const field = query('.kw');
    const popup = query('.search-suggestions');
    if (!field || !popup) return;
    popup.hidden = true;
    field.removeAttribute('aria-activedescendant');
    field.setAttribute('aria-expanded', 'false');
  }

  function setupSearch() {
    const keyword = route.keyword.trim();
    applyArtwork(query('.search-hero'), 'discovery', true);
    const field = query('.kw');
    field.value = keyword;
    field.type = 'search';
    field.setAttribute('aria-label', '搜索歌曲、歌手、歌单或专辑');
    field.setAttribute('role', 'combobox');
    field.setAttribute('aria-controls', 'search-options');
    field.setAttribute('aria-autocomplete', 'list');
    field.setAttribute('aria-expanded', 'false');
    field.autocomplete = 'off';
    const box = query('.search-hero .box');
    const form = element('form', 'box');
    form.setAttribute('role', 'search');
    form.append(...box.childNodes);
    box.replaceWith(form);
    query('.s-btn').type = 'submit';
    bind(query('.clear'), 'clear-search', '', '清空搜索框');
    const popup = element('div', 'search-suggestions');
    popup.hidden = true;
    const list = element('div', 'search-options');
    list.id = 'search-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '搜索联想');
    const instructions = element('div', 'search-keys', '↑ ↓ 选择  ·  Enter 确认  ·  Esc 收起');
    instructions.setAttribute('aria-hidden', 'true');
    popup.append(list, instructions);
    form.after(popup);

    const ids = [...tracks.values()].filter((track) => matches(keyword, [track.name, track.artist, track.album])).map((track) => track.id);
    const playlistResults = Object.entries(playlists).filter(([, entry]) => matches(keyword, [entry.title, entry.tag, ...entry.tracks.map((id) => tracks.get(id).artist)]));
    const artistResults = [...artistData.values()].filter((track) => matches(keyword, [track.artist, track.portrait?.name || '']));
    const albums = [...new Map([...tracks.values()].map((track) => [track.album, track])).values()]
      .filter((track) => track.album && matches(keyword, [track.album, track.artist]));
    const lyricResults = demoIds.filter((id) => {
      const track = tracks.get(id);
      return matches(keyword, [track.name, track.artist, ...track.lyrics.flatMap(([, line, translated]) => [line, translated])]);
    });
    const cards = all('.grid2 > div:first-child .card');
    const [artists, songs, collections] = cards;
    cards.forEach((card, i) => applyArtwork(card, ['comments', 'records', 'discovery'][i], true));
    const auditions = ids.filter(playable);
    const counts = [ids.length, artistResults.length, playlistResults.length, albums.length, lyricResults.length, auditions.length];
    const categories = ['单曲', '歌手', '歌单', '专辑', '歌词'];

    all('.tabs > div').forEach((tab, i) => {
      if (!categories[i]) {
        tab.remove();
        return;
      }
      const label = categories[i];
      setText('.cnt', counts[i], tab);
      bind(tab, 'search-tab', label);
      const active = searchTab === label;
      tab.classList.toggle('on', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    const previewTab = element('div', searchTab === '可试听' ? 'on' : '', '可试听');
    previewTab.append(element('span', 'cnt', auditions.length));
    bind(previewTab, 'search-tab', '可试听');
    previewTab.setAttribute('aria-pressed', String(searchTab === '可试听'));
    query('.tabs').prepend(previewTab);
    if (searchTab === '可试听') ids.splice(0, ids.length, ...auditions);
    songs.hidden = searchTab !== '单曲' && searchTab !== '可试听';
    artists.hidden = searchTab !== '歌手' && (searchTab !== '单曲' || artistResults.length === 0);
    collections.hidden = searchTab !== '歌单' && (searchTab !== '单曲' || playlistResults.length === 0);

    const singers = query('.singers', artists);
    const originalSinger = query('.singer', singers);
    singers.replaceChildren(...artistResults.map((track) => {
      const singer = originalSinger.cloneNode(true);
      setText('.s-name', track.artist, singer);
      setText('.s-sub', track.portrait?.context || byArtist(track.artist).length + ' 首示例歌曲', singer);
      const initials = track.artist === 'NewJeans' ? 'NJ' : track.artist.split(/\s+/).slice(0, 2).map((name) => name[0]).join('').toUpperCase();
      setText('.s-pic', initials, singer);
      applyArtwork(query('.s-pic', singer), trackArtwork(track));
      if (track.portrait) bind(query('.s-name', singer), 'portrait-home', String(media.portraits.indexOf(track.portrait)), '查看 ' + track.artist + ' 写真');
      else linkify(query('.s-name', singer), searchHref(track.artist));
      bind(query('.s-follow', singer), 'follow', track.artist);
      return singer;
    }));
    bind(query('h3 > span:last-child', artists), 'search-tab', '歌手');
    if (!artistResults.length) singers.append(empty('未找到匹配的歌手。'));

    const line = query('.result-line');
    line.textContent = (keyword ? '找到 ' + ids.length + ' 首与「' + keyword + '」相关的歌曲' : '共 ' + ids.length + ' 首歌曲') + ' · ' + auditions.length + ' 首可试听';
    all('.row', songs).forEach((row) => row.remove());
    const start = query('h3 > span:last-child', songs);
    start.textContent = '播放可试听曲目';
    start.hidden = auditions.length === 0;
    bind(start, 'play-list', auditions.join('|'));
    songs.append(...ids.map((id) => {
      const row = makeRow(id, 'search');
      for (const selector of ['.r-name', '.r-artist']) {
        const node = query(selector, row);
        highlight(node, node.textContent, keyword);
      }
      return row;
    }));
    if (!ids.length) songs.append(empty('试试歌名、歌手名或专辑名，例如 NewJeans。'));

    all('.row', collections).forEach((row) => row.remove());
    const seePlaylists = query('h3 > span:last-child', collections);
    seePlaylists.textContent = '查看歌单 ›';
    bind(seePlaylists, 'search-tab', '歌单');
    collections.append(...playlistResults.map(([id, entry]) => makeGroup(entry.title, entry.tag + ' · ' + entry.tracks.length + ' 首示例歌曲', 'queue_music', playlistHref(id))));
    if (!playlistResults.length) collections.append(empty('未找到匹配的歌单。'));

    if (searchTab === '专辑' || searchTab === '歌词') {
      const results = element('div', 'card');
      applyArtwork(results, searchTab === '歌词' ? 'comments' : 'records', true);
      results.append(element('h3', '', searchTab + '结果'));
      if (searchTab === '专辑') {
        results.append(...albums.map((track) => makeGroup(track.album, track.artist, 'album', searchHref(track.album))));
        if (!albums.length) results.append(empty('未找到匹配的专辑。'));
      } else if (lyricResults.length) {
        for (const id of lyricResults) {
          const result = button(tracks.get(id).name + ' · 同步歌词', 'play-open', id, 'lyrics');
          result.classList.add('group-item');
          results.append(result);
        }
      } else {
        results.append(empty('未找到匹配的示例歌词。'));
      }
      cards[0].parentNode.append(results);
    }

    const historyCard = query('.side-card');
    bind(query('h3 > .material-icons:last-child', historyCard), 'clear-history', '', '清空搜索历史');
    historyRow(query('.chips', historyCard));
    for (const row of all('.hot-row')) bind(row, 'go-search', text('.h-name', row).split(' · ')[0]);
    const suggested = ['NewJeans', 'Taylor Swift', '欧美', '专注', '粉紫恋歌', '夏日海边'];
    all('.side-card:last-child .chip').forEach((node, i) => linkify(node, searchHref(suggested[i])));
    const sidebarSearches = ['NewJeans', 'Taylor Swift', '夏日海边'];
    all('.sidebar .pl-item').forEach((node, i) => linkify(node, searchHref(sidebarSearches[i])));
    all('.side-card').forEach((card, i) => applyArtwork(card, ['recent', 'stage', 'discovery'][i], true));
  }

  function setupPlayer() {
    bind(query('.tb-btn'), 'close-player', '', '收起播放器');
    bind(query('.tb-btn:last-child'), 'track-actions', current, '歌曲选项');
    linkify(query('.meta .alb'), searchHref(tracks.get(current).album));
    setupTransport('.controls', '.c-play', '.timeline', '.tl-bar');
    bind(query('.timeline > .material-icons'), 'favorite');
    const tags = query('.q-tags');
    const settings = button('播放设置', 'playback-settings', '', 'tune');
    settings.classList.add('q-tag', 'settings-trigger');
    tags.replaceChildren(element('div', 'q-tag on playback-indicator'), settings);
    const follow = bind(element('span', '', '跟随进度'), 'auto-scroll');
    const languages = ['双语', '英文', '中文'].map((name) => bind(element('span', '', name), 'lyric-language', name));
    query('.ly-head .lang').replaceChildren(...languages, follow);
    const lyrics = query('.lyrics');
    lyrics.tabIndex = 0;
    lyrics.setAttribute('aria-label', '同步歌词，点击任一行跳转播放');
    lyrics.dataset.language = lyricLanguage;
    const credit = element('a', 'lyric-credit');
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    const shareButton = queueButton('share', 'share-track', '', '分享当前曲目和进度');
    query('.ly-foot').replaceChildren(credit, shareButton);
    lyricIndex = -1;
    refreshPlayer();
  }

  function refreshPlayer() {
    const track = tracks.get(current);
    const miniTitle = query('.title-mini');
    setText('b', track.name, miniTitle);
    setText('span', [track.artist, track.album].filter(Boolean).join(' · '), miniTitle);
    setText('.meta h1', track.name);
    setText('.meta p', track.artist);
    const album = query('.meta .alb');
    album.href = searchHref(track.album);
    album.replaceChildren(icon('album'), document.createTextNode(' ' + (track.album || track.artist)));
    const cover = query('.disc-in');
    setText('b', track.name.toUpperCase(), cover);
    setText('span:not(.material-icons)', track.artist, cover);
    setText('em', 'SUNNY MUSIC', cover);
    applyArtwork(cover, trackArtwork(track), true);
    query('.tb-btn:last-child').dataset.value = current;

    const lyrics = query('.lyrics');
    if (lyrics.dataset.song !== current) {
      lyrics.dataset.song = current;
      lyrics.replaceChildren(...track.lyrics.map(([seconds, line, translated]) => {
        const row = element('div', 'line');
        const time = formatTime(seconds);
        row.append(element('b', '', line), element('span', '', translated));
        row.dataset.timestamp = time;
        return bind(row, 'seek-lyric', String(seconds), '跳转到 ' + time + ' · ' + line);
      }));
      lyricIndex = -1;
    }
    const credit = query('.lyric-credit');
    credit.href = track.source;
    credit.textContent = track.artist + ' · ' + track.license + ' · 片段来源';
    const list = query('.queue');
    const queueHead = element('div', 'inline-queue-head');
    const edit = button('管理', 'queue', '', 'queue_music');
    queueHead.append(element('h4', '', '播放队列 (' + queue.length + ')'), edit);
    list.replaceChildren(queueHead, ...orderedQueue().map((id) => {
      const item = tracks.get(id);
      const row = button('', 'play-track', id);
      row.className = 'q-row reset' + (id === current ? ' on' : '');
      const miniature = element('span', 'mini', item.cover);
      applyArtwork(miniature, trackArtwork(item));
      row.append(icon(id === current ? 'play_arrow' : 'music_note'), miniature, element('span', '', item.name), element('span', 'dur', formatTime(item.duration)));
      if (id === current) row.setAttribute('aria-current', 'true');
      return row;
    }));
  }

  function syncProgress() {
    const track = tracks.get(current);
    const duration = track.duration;
    setText('[data-time="current"]', formatTime(elapsed));
    setText('[data-time="duration"]', formatTime(duration));
    const seek = query('.seek');
    if (!seek) return;
    seek.max = duration;
    seek.value = elapsed;
    seek.style.setProperty('--fill', elapsed / duration * 100 + '%');
    seek.setAttribute('aria-valuetext', formatTime(elapsed) + ' / ' + formatTime(duration));
    const lyrics = query('.lyrics');
    if (!lyrics || !query('.line', lyrics)) return;
    const lines = all('.line', lyrics);
    const active = track.lyrics.findLastIndex(([seconds]) => elapsed + .01 >= seconds);
    if (lyricIndex === active) return;
    lyricIndex = active;
    lines.forEach((node, i) => {
      node.classList.toggle('on', i === active);
      node.classList.toggle('past', i < active);
      if (i === active) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
    if (autoScroll && lines[active]) {
      const top = lines[active].offsetTop - lyrics.clientHeight / 2 + lines[active].offsetHeight / 2;
      lyrics.scrollTo({ top, behavior: playing && !reducedMotion.matches ? 'smooth' : 'auto' });
    }
  }

  function refreshControls() {
    const track = tracks.get(current);
    app.classList.toggle('is-playing', playing);
    setText('.pb-name', track.name);
    setText('.pb-artist', track.artist);
    const cover = query('.pb-cover');
    if (cover) applyArtwork(cover, trackArtwork(track));
    for (const row of all('[data-track-id]')) {
      row.classList.toggle('current-track', row.dataset.trackId === current);
      if (route.page === 'playlist') row.classList.toggle('playing', row.dataset.trackId === current && playing);
    }
    for (const node of all('[data-action="favorite"]')) {
      const id = node.dataset.value || current;
      const active = favorites.has(id);
      node.textContent = active ? 'favorite' : 'favorite_border';
      node.style.color = active ? '#ee5186' : '';
      node.setAttribute('aria-pressed', String(active));
      const label = (active ? '取消收藏 ' : '收藏 ') + tracks.get(id).name;
      node.setAttribute('aria-label', label);
      node.title = label;
    }
    const save = query('[data-action="save-playlist"]');
    if (save) {
      const saved = playlistSaves.has(route.playlist);
      save.setAttribute('aria-pressed', String(saved));
      const label = saved ? '已收藏' : '收藏歌单';
      save.replaceChildren(icon(saved ? 'favorite' : 'favorite_border'), document.createTextNode(label));
    }
    for (const node of all('[data-action="follow"]')) {
      const active = follows.has(node.dataset.value);
      node.textContent = active ? '已关注' : '+ 关注';
      node.classList.toggle('on', active);
      node.setAttribute('aria-pressed', String(active));
    }
    for (const node of all('[data-action="auto-scroll"]')) {
      node.classList.toggle('on', autoScroll);
      node.setAttribute('aria-pressed', String(autoScroll));
    }
    for (const node of all('[data-action="lyric-language"]')) {
      const active = node.dataset.value === lyricLanguage;
      node.classList.toggle('on', active);
      node.setAttribute('aria-pressed', String(active));
    }
    query('[data-action="shuffle"]')?.setAttribute('aria-pressed', String(shuffle));
    query('[data-action="repeat"]')?.setAttribute('aria-pressed', String(repeat));
    const queueBadge = query('.queue-badge');
    if (queueBadge) {
      queueBadge.hidden = queue.length < 2;
      queueBadge.textContent = String(queue.length - 1);
      queueBadge.parentElement.title = '播放队列 · ' + queue.length + ' 首';
    }
    const play = query('[data-action="toggle-play"]');
    setText('.material-icons', playing ? 'pause' : 'play_arrow', play);
    play.title = playing ? '暂停' : '播放';
    play.setAttribute('aria-label', play.title);
    const captions = { pause: '可试听', loading: '正在缓冲', playing: '正在播放', error: '音频加载失败' };
    setText('.playback-indicator', captions[playbackState] || captions.pause);
    setText('.pb-right [data-action="playback-settings"]', muted || volume === 0 ? 'volume_off' : 'volume_up');
    for (const tile of all('.preview-play')) {
      const active = tile.dataset.value === current && playing;
      const title = tracks.get(tile.dataset.value).name;
      setText('.material-icons', active ? 'pause' : 'play_arrow', tile);
      tile.setAttribute('aria-label', (active ? '暂停 ' : '试听 ') + title);
    }
    app.dataset.loading = String(playbackState === 'loading');
    syncProgress();
    homeFeatures?.updatePlayback();
  }

  function applyAudioSettings() {
    audio.volume = volume;
    audio.muted = muted;
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
  }

  function seekTo(seconds) {
    if (!Number.isFinite(seconds)) return;
    elapsed = Math.max(0, Math.min(seconds, tracks.get(current).duration));
    if (!localFile && !audio.src.startsWith('blob:')) pendingSeek = elapsed;
    audio.currentTime = elapsed;
    syncProgress();
  }

  function cacheClip(id) {
    if (clipBuffers.has(id)) return Promise.resolve(clipBuffers.get(id));
    if (!clipRequests.has(id)) {
      const request = fetch(tracks.get(id).audioUrl).then((response) => {
        if (!response.ok) throw new Error('Could not load the complete audio clip');
        return response.blob();
      }).then((file) => {
        const url = URL.createObjectURL(file);
        clipBuffers.set(id, url);
        return url;
      }).catch(() => null).finally(() => clipRequests.delete(id));
      clipRequests.set(id, request);
    }
    return clipRequests.get(id);
  }

  function loadAudioSource(url, seconds) {
    playbackEpoch++;
    audio.pause();
    if (audio.src !== url || audio.error) {
      audio.preload = localFile || url.startsWith('blob:') ? 'metadata' : 'none';
      audio.src = url;
      audio.load();
    }
    applyAudioSettings();
    pendingSeek = null;
    seekTo(seconds);
    if (seconds === 0) pendingSeek = null;
    playing = false;
    playbackState = 'pause';
  }

  function loadAudio(seconds = 0) {
    const id = current;
    const url = clipBuffers.get(id) || new URL(tracks.get(id).audioUrl, document.baseURI).href;
    loadAudioSource(url, seconds);
    if (localFile || clipBuffers.has(id)) return;
    const attempt = playbackEpoch;
    cacheClip(id).then((buffer) => {
      if (attempt !== playbackEpoch || id !== current) return;
      if (!buffer) { pendingSeek = null; syncAudioTime(); return; }
      const resume = !audio.paused;
      const position = pendingSeek ?? (audio.readyState > 0 ? audio.currentTime : elapsed);
      loadAudioSource(buffer, position);
      if (resume) beginPlayback();
      refreshControls();
    });
  }

  function beginPlayback() {
    if (audio.ended) seekTo(0);
    if (audio.error) loadAudio(elapsed);
    const attempt = playbackEpoch;
    audio.play().catch((error) => {
      if (attempt !== playbackEpoch || error.name === 'AbortError') return;
      playing = false;
      playbackState = audio.error ? 'error' : 'pause';
      refreshControls();
      notice('暂时无法播放，请再次点击播放。');
    });
  }

  function addRecent(id) {
    recent = [id, ...recent.filter((item) => item !== id)].slice(0, 20);
    store('recent', recent);
  }

  function setTrack(id, start = true, position = 0) {
    if (!playable(id)) return false;
    if (!queue.includes(id)) queue.push(id);
    current = id;
    loadAudio(position);
    if (start) beginPlayback();
    savePlayback();
    if (route.page === 'player') refreshPlayer();
    refreshControls();
    setMediaSessionTrack();
    return true;
  }

  function moveTrack(direction, start = playing) {
    const index = queue.indexOf(current);
    const next = shuffle && queue.length > 1
      ? (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length
      : (index + direction + queue.length) % queue.length;
    setTrack(queue[next], start);
    if (sheet.open && sheet.dataset.kind === 'queue') {
      const focus = document.activeElement;
      showQueue(focus?.dataset.action, focus?.dataset.value);
    }
  }

  function playList(ids, first) {
    const next = [...new Set(ids.filter(playable))];
    if (!next.length) { showTrackActions(ids.find((id) => tracks.has(id)) || current, true); return false; }
    queue = next;
    return setTrack(next.includes(first) ? first : next[0]);
  }

  function playRow(id, node) {
    if (!playable(id)) { showTrackActions(id); return; }
    if (node.closest('.queue,#sheet')) {
      setTrack(id);
      return;
    }
    const row = node.closest('[data-track-id]');
    const selection = row && all('[data-track-id]', row.parentNode).map((item) => item.dataset.trackId);
    if (selection?.length) playList(selection, id);
    else setTrack(id);
  }

  function switchSet(items, value, key) {
    if (items.has(value)) items.delete(value);
    else items.add(value);
    store(key, [...items]);
    return items.has(value);
  }

  function openSheet(title, kind = 'menu') {
    sheet.dataset.kind = kind;
    const header = element('header');
    const heading = element('h2', '', title);
    heading.id = 'sheet-title';
    const close = button('', 'close-sheet');
    close.classList.add('sheet-close');
    close.setAttribute('aria-label', '关闭');
    close.append(icon('close'));
    close.setAttribute('autofocus', '');
    header.append(heading, close);
    const items = element('div');
    items.id = 'sheet-items';
    sheet.replaceChildren(header, items);
    if (!sheet.open) sheet.showModal();
    close.focus();
    return items;
  }

  function sheetAction(label, action, value, glyph) {
    const item = button(label, action, value, glyph);
    item.classList.add('sheet-row');
    return item;
  }

  function orderedQueue() {
    const from = queue.indexOf(current);
    return [...queue.slice(from), ...queue.slice(0, from)];
  }

  function queueButton(glyph, action, id, label, disabled = false) {
    const control = button('', action, id);
    control.classList.add('queue-action');
    control.append(icon(glyph));
    control.setAttribute('aria-label', label);
    control.title = label;
    control.disabled = disabled;
    return control;
  }

  function showQueue(focusAction, focusId) {
    const itemList = query('#sheet-items', sheet);
    const scrollPosition = sheet.open && sheet.dataset.kind === 'queue' ? itemList.scrollTop : 0;
    const items = openSheet('播放队列', 'queue');
    const ids = orderedQueue();
    const title = element('div', 'queue-summary');
    title.append(element('span', '', '接下来 · ' + (queue.length - 1) + ' 首'));
    if (ids.length > 1) {
      const clear = button('清空待播', 'clear-queue');
      clear.classList.add('clear-queue');
      title.append(clear);
    }
    items.append(title);
    ids.forEach((id, index) => {
      const track = tracks.get(id);
      const active = id === current;
      const row = element('div', 'queue-entry' + (active ? ' active' : ''));
      const item = button('', 'queue-play', id);
      item.classList.add('queue-song');
      item.setAttribute('aria-label', '播放 ' + track.name);
      const cover = element('span', 'queue-cover', track.cover);
      applyArtwork(cover, trackArtwork(track));
      const label = element('span', 'queue-song-label', track.name);
      label.append(element('small', '', active ? '当前曲目 · ' + track.artist : track.artist + ' · ' + formatTime(track.duration)));
      item.append(cover, label);
      if (active) item.setAttribute('aria-current', 'true');
      row.append(item);
      if (!active) {
        const controls = element('div', 'queue-actions');
        controls.append(
          queueButton('keyboard_arrow_up', 'queue-up', id, '上移 ' + track.name, index === 1),
          queueButton('keyboard_arrow_down', 'queue-down', id, '下移 ' + track.name, index === ids.length - 1),
          queueButton('close', 'queue-remove', id, '移除 ' + track.name)
        );
        row.append(controls);
      }
      items.append(row);
    });
    if (ids.length === 1) items.append(empty('在歌曲菜单里选择「加入播放队列」，就能继续添加。'));
    items.scrollTop = scrollPosition;
    if (focusAction) {
      const controls = all('button[data-action]', items);
      const target = controls.find((node) => node.dataset.action === focusAction && node.dataset.value === focusId && !node.disabled)
        ?? controls.find((node) => node.dataset.action === 'queue-play' && node.dataset.value === (focusId || current));
      target?.focus({ preventScroll: true });
    }
  }

  function updateQueue(ids, focusAction, focusId) {
    queue = ids;
    savePlayback();
    if (route.page === 'player') refreshPlayer();
    refreshControls();
    if (sheet.open && sheet.dataset.kind === 'queue') showQueue(focusAction, focusId);
  }

  function reorderQueue(id, direction, focusAction) {
    const next = orderedQueue();
    const from = next.indexOf(id);
    const to = from + direction;
    if (from < 1 || to < 1 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    updateQueue(next, focusAction, id);
  }

  function showTrackActions(id, wholeList = false) {
    const track = tracks.get(id);
    if (!track) return;
    const items = openSheet(track.name);
    if (playable(id) && !wholeList) {
      items.append(
        sheetAction('播放并打开歌词', 'play-open', id, 'lyrics'),
        sheetAction('下一首播放', 'play-next', id, 'skip_next'),
        sheetAction('加入播放队列', 'add-queue', id, 'queue_music'),
        downloadLink(track),
      );
    } else {
      const note = wholeList ? '这个列表暂未收录音频。' : track.artist + ' · 暂未收录可播放音频。';
      items.append(element('p', '', note), sheetAction('播放试听曲库', 'listen-now', '', 'play_arrow'));
    }
    items.append(sheetAction(favorites.has(id) ? '取消收藏' : '收藏歌曲', 'favorite', id, favorites.has(id) ? 'favorite' : 'favorite_border'));
  }

  function downloadLink(track) {
    const link = element('a', 'sheet-row');
    link.href = track.audioUrl;
    link.download = track.file;
    link.append(icon('download'), document.createTextNode('下载 ' + track.name));
    return link;
  }

  function showDownloads() {
    const items = openSheet('下载试听片段');
    items.append(element('p', '', '音频使用开放许可，分享时请保留署名。'), ...demoIds.map((id) => downloadLink(tracks.get(id))));
  }

  function externalLink(label, href) {
    const anchor = element('a', '', label);
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function showCredits() {
    const items = openSheet('素材署名', 'credits');
    const append = (listing, heading, makeEntry) => {
      items.append(element('h3', '', heading));
      for (const item of listing) {
        const [title, credit, note] = makeEntry(item);
        const entry = element('article', 'credit-entry');
        const links = element('div', 'credit-links');
        links.append(externalLink('原作', item.source), externalLink(item.license, item.licenseUrl));
        entry.append(element('strong', '', title), element('p', '', credit), links);
        if (note) entry.append(element('small', '', note));
        items.append(entry);
      }
    };
    append(media.music, '试听与同步歌词', (item) => [item.title, item.credit || item.artist, '截取录音片段，歌词已标注逐行时间，并配有中文翻译。']);
    append(media.portraits, '舞台照片', (item) => [item.name, item.author, item.modifications || '已适配显示尺寸。']);
    items.append(element('p', '', '歌单主题与试听曲目封面为本网站原创生成图像。'));
    homeFeatures?.appendCredits(items);
  }

  function settingLabel(name, control) {
    const label = element('div', 'settings-row');
    label.append(element('span', '', name), control);
    return label;
  }

  function showPlaybackSettings() {
    const items = openSheet('播放设置', 'settings');
    const level = element('input');
    level.type = 'range';
    level.min = '0';
    level.max = '100';
    level.value = String(Math.round(volume * 100));
    level.dataset.setting = 'volume';
    level.setAttribute('aria-label', '音量');
    const mute = button(muted ? '取消静音' : '静音', 'mute');
    mute.classList.add('settings-mute');
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', '静音');
    const wrapper = element('div', 'volume-setting');
    wrapper.append(level, element('output', 'volume-readout', level.value + '%'), mute);
    items.append(settingLabel('音量', wrapper));
    const rate = element('select');
    rate.dataset.setting = 'speed';
    rate.setAttribute('aria-label', '播放倍速');
    for (const multiplier of [.75, 1, 1.25, 1.5, 2]) {
      const option = element('option', '', multiplier + '×');
      option.value = String(multiplier);
      rate.append(option);
    }
    rate.value = String(speed);
    items.append(settingLabel('播放倍速', rate));
    const timer = element('select');
    timer.dataset.setting = 'sleep';
    timer.setAttribute('aria-label', '睡眠定时');
    for (const minutes of [0, 15, 30, 60]) {
      const option = element('option', '', minutes ? minutes + ' 分钟后暂停' : '关闭定时');
      option.value = String(minutes);
      timer.append(option);
    }
    timer.value = String(sleepMinutes);
    items.append(settingLabel('睡眠定时', timer), element('p', 'sleep-status'));
    updateSleepLabel();
  }

  function updateSleepLabel() {
    const left = Math.ceil((sleepUntil - Date.now()) / 1000);
    setText('.sleep-status', left > 0 ? '将在 ' + formatTime(left) + ' 后暂停播放' : '当前未开启定时', sheet);
  }

  function showProfile() {
    const items = openSheet('编辑资料');
    const form = element('form');
    form.dataset.form = 'profile';
    const field = element('input');
    field.id = 'profile-name';
    field.required = true;
    field.maxLength = 24;
    field.value = profileName;
    const label = element('label', '', '昵称');
    label.htmlFor = field.id;
    const submit = element('button', 'sheet-row', '保存');
    submit.type = 'submit';
    form.append(label, field, submit);
    items.replaceChildren(form);
    field.select();
  }

  async function share(trackLink = false) {
    if (location.protocol === 'file:') {
      notice('分享此网页时，请发送 HTML 文件。');
      return;
    }
    const address = new URL(location.href);
    if (trackLink) address.hash = '#player?' + new URLSearchParams({ track: current, t: elapsed.toFixed(2) });
    try {
      await navigator.clipboard.writeText(address.href);
      notice('已复制当前页面链接');
    } catch {
      const items = openSheet('复制当前页面链接');
      const input = element('input');
      input.readOnly = true;
      input.value = address.href;
      input.setAttribute('aria-label', '当前页面链接');
      items.append(input);
      input.select();
    }
  }

  const setups = { home: setupHome, hot: setupHot, mine: setupMine, playlist: setupPlaylist, search: setupSearch, player: setupPlayer };
  let lastHash = '#home';

  function render({ keepScroll = false, focusAction, focusValue, fromNavigation = false } = {}) {
    const next = readRoute();
    const scroller = query('.content, .shell:has(.player)');
    const oldScroll = scroller?.scrollTop ?? 0;
    if (next.page === 'player' && route && route.page !== 'player') {
      previousView = lastHash;
      scrollToRestore = oldScroll;
    }
    const returning = route?.page === 'player' && next.page !== 'player' && location.hash === previousView;
    const incoming = next.page === 'player' && playable(next.track) && (next.track !== current || location.hash !== lastHash);
    if (incoming) {
      current = next.track;
      if (!queue.includes(current)) queue.push(current);
      loadAudio(Number.isFinite(next.time) ? next.time : 0);
      setMediaSessionTrack();
    }
    route = next;
    lastHash = location.hash || '#home';
    document.title = '夏日音乐 · ' + titles[route.page];
    app.dataset.view = route.page;
    for (const cleanup of swipeCleanups.splice(0)) cleanup();
    homePagers.length = 0;
    app.replaceChildren(template(route.page).cloneNode(true));
    all('.material-icons').forEach((node) => node.setAttribute('aria-hidden', 'true'));
    setupShell();
    setups[route.page]();
    enhanceTrackRows();
    refreshControls();
    if (firstMount) {
      firstMount = false;
      if (!reducedMotion.matches) {
        app.classList.add('first-arrival');
        window.setTimeout(() => app.classList.remove('first-arrival'), 1200);
      }
    }
    const view = query('.content, .shell:has(.player)');
    view.scrollTop = keepScroll ? oldScroll : returning ? scrollToRestore : 0;
    window.SunnyMotion.mount(app);
    if (focusAction) {
      all('[data-action]').find((node) => node.dataset.action === focusAction && node.dataset.value === focusValue)?.focus({ preventScroll: true });
    } else if (fromNavigation) {
      if (route.page === 'search') query('.kw').focus({ preventScroll: true });
      else {
        const heading = query('h1') ?? query('main');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  function go(target) {
    if (location.hash === target) render();
    else location.hash = target;
  }

  function runSearch(keyword) {
    const word = keyword.trim();
    searchTab = '单曲';
    hideSuggestions();
    rememberSearch(word);
    go(searchHref(word));
  }

  function rememberSearch(word) {
    if (word) {
      historyItems = [word, ...historyItems.filter((item) => normalize(item) !== normalize(word))].slice(0, 10);
      store('history', historyItems);
    }
  }

  function rerender(node) {
    render({ keepScroll: true, focusAction: node?.dataset.action, focusValue: node?.dataset.value });
  }

  const actions = {
    'hot-tab': (value, node) => { hotTab = value; rerender(node); },
    'mine-tab': (value, node) => { mineTab = value; rerender(node); },
    'search-tab': (value, node) => { searchTab = value; rerender(node); },
    'go-favorites': () => { mineTab = '我喜欢'; go('#mine'); },
    'go-search': (value) => runSearch(value),
    'clear-search': () => runSearch(''),
    suggestion: (value, node) => {
      hideSuggestions();
      if (node.dataset.kind === 'track') {
        rememberSearch(tracks.get(value).name);
        if (setTrack(value)) go('#player');
        else runSearch(tracks.get(value).name);
      } else if (node.dataset.kind === 'playlist') {
        rememberSearch(playlists[value].title);
        go(playlistHref(value));
      } else runSearch(value);
    },
    'remove-history': (value) => {
      historyItems = historyItems.filter((word) => word !== value);
      store('history', historyItems);
      historyRow(query('.side-card .chips'));
    },
    'clear-history': () => {
      historyItems = [];
      store('history', historyItems);
      historyRow(query('.side-card .chips'));
    },
    'edit-profile': showProfile,
    'clear-playlist-filter': () => {
      const field = query('.playlist-filter');
      field.value = '';
      playlistFilters.get(route.playlist).keyword = '';
      refreshPlaylistRows();
      field.focus();
    },
    'playlist-section': (selector, node) => {
      all('.ltabs > [data-action="playlist-section"]').forEach((tab) => tab.classList.toggle('on', tab === node));
      query(selector)?.scrollIntoView({ block: 'start' });
    },
    'save-playlist': (id) => {
      const saved = switchSet(playlistSaves, id, 'playlists');
      refreshControls();
      notice(saved ? '歌单已收藏，可在「我的音乐」中查看' : '已取消收藏歌单');
    },
    follow: (artist) => { switchSet(follows, artist, 'follows'); refreshControls(); },
    favorite: (id, node) => {
      if (sheet.open) sheet.close();
      const saved = switchSet(favorites, id || current, 'favorites');
      if (route.page === 'mine') rerender(node);
      else refreshControls();
      if (saved && node.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }], { duration: 235 });
      }
      notice(saved ? '已添加到「我喜欢」' : '已从「我喜欢」移除');
    },
    'play-track': (id, node) => {
      if (sheet.open && playable(id)) sheet.close();
      playRow(id, node);
    },
    'play-open': (id) => {
      if (sheet.open) sheet.close();
      if (id === current) { beginPlayback(); go('#player'); }
      else if (setTrack(id)) go('#player');
      else showTrackActions(id);
    },
    'preview-play': (id) => {
      if (id === current) actions['toggle-play']();
      else playList(demoIds, id);
    },
    'listen-now': () => {
      if (sheet.open) sheet.close();
      if (playList(demoIds)) go('#player');
    },
    'random-preview': () => {
      const choices = demoIds.length > 1 ? demoIds.filter((id) => id !== current) : demoIds;
      const choice = choices[Math.floor(Math.random() * choices.length)];
      if (playList(demoIds, choice)) go('#player');
    },
    'spotlight-select': (index) => setSpotlight(Number(index), true),
    'portrait-home': (index) => { setSpotlight(Number(index), true); go('#home'); },
    'spotlight-move': (direction) => setSpotlight(spotlight + Number(direction), true),
    'spotlight-toggle': () => {
      rotateSpotlight = !rotateSpotlight;
      store('spotlight-rotation', rotateSpotlight);
      spotlightInteraction = Date.now();
      for (const node of document.querySelectorAll('[data-action="spotlight-toggle"]')) {
        setText('.material-icons', rotateSpotlight ? 'pause' : 'play_arrow', node);
        node.title = rotateSpotlight ? '暂停写真轮播' : '开启写真轮播';
        node.setAttribute('aria-label', node.title);
      }
    },
    'play-list': (value) => playList(value.split('|').filter(Boolean)),
    'toggle-play': () => {
      if (audio.paused) beginPlayback();
      else audio.pause();
    },
    previous: () => moveTrack(-1),
    next: () => moveTrack(1),
    shuffle: () => { shuffle = !shuffle; savePlayback(); refreshControls(); notice(shuffle ? '已开启随机播放' : '已恢复顺序播放'); },
    repeat: () => { repeat = !repeat; savePlayback(); refreshControls(); notice(repeat ? '已开启单曲循环' : '已关闭单曲循环'); },
    'open-player': () => go('#player'),
    'close-player': () => go(previousView),
    'track-actions': showTrackActions,
    queue: () => showQueue(),
    'queue-play': (id) => { setTrack(id); showQueue('queue-play', id); },
    'queue-up': (id) => reorderQueue(id, -1, 'queue-up'),
    'queue-down': (id) => reorderQueue(id, 1, 'queue-down'),
    'queue-remove': (id) => {
      if (id === current) return;
      updateQueue(queue.filter((item) => item !== id), 'queue-play', current);
      notice('已移出播放队列');
    },
    'clear-queue': () => { updateQueue([current], 'queue-play', current); notice('待播歌曲已清空'); },
    'play-next': (id) => {
      sheet.close();
      if (!playable(id)) { showTrackActions(id); return; }
      if (id === current) { notice('这首歌正在播放'); return; }
      updateQueue([current, id, ...orderedQueue().slice(1).filter((item) => item !== id)]);
      notice('下一首 · ' + tracks.get(id).name);
    },
    'add-queue': (id) => {
      if (sheet.open) sheet.close();
      if (!playable(id)) { showTrackActions(id); return; }
      if (queue.includes(id)) {
        notice('这首歌已在播放队列中');
        return;
      }
      updateQueue([...orderedQueue(), id]);
      notice('已加入播放队列');
    },
    'close-sheet': () => sheet.close(),
    download: (id) => playable(id) ? downloadLink(tracks.get(id)).click() : showDownloads(),
    downloads: showDownloads,
    'demo-info': (message) => notice(message || '这项内容目前只有曲目信息。'),
    credits: showCredits,
    'playback-settings': showPlaybackSettings,
    mute: (_, node) => {
      muted = !muted;
      applyAudioSettings();
      savePlayback();
      node.setAttribute('aria-pressed', String(muted));
      node.textContent = muted ? '取消静音' : '静音';
      refreshControls();
    },
    'auto-scroll': () => { autoScroll = !autoScroll; lyricIndex = -1; refreshControls(); },
    'lyric-language': (value) => {
      lyricLanguage = value;
      query('.lyrics').dataset.language = value;
      lyricIndex = -1;
      refreshControls();
    },
    'seek-lyric': (seconds) => {
      seekTo(Number(seconds));
      savePlayback();
    },
    share: () => share(),
    'share-track': () => share(true),
  };

  homeFeatures = window.SunnyHomeModules.create({
    app, sheet, media, tracks, demoIds, element, icon, button, openSheet, applyArtwork, notice,
    playList,
    playTrack: setTrack,
    goPlayer: () => go('#player'),
    pauseMusic: () => audio.pause(),
    getPlayback: () => ({ current, playing }),
    getRecent: () => recent,
    getFavorites: () => [...favorites],
  });
  hotFeatures = window.SunnyHotModules.create({
    element, icon, button, media, tracks, demoIds, playlists, applyArtwork, playlistHref, searchHref,
    showVideo: homeFeatures.showVideo,
  });

  document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!event.target.closest('.search-hero')) hideSuggestions();
    if (control) {
      if (control.getAttribute('aria-disabled') === 'true') return;
      actions[control.dataset.action]?.(control.dataset.value, control);
      return;
    }
    const row = event.target.closest('[data-track-id]');
    if (row) playRow(row.dataset.trackId, row);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
      event.preventDefault();
      if (sheet.open) sheet.close();
      if (route.page === 'search') { query('.kw').focus(); query('.kw').select(); }
      else go(searchHref(''));
      return;
    }
    if (event.target.matches('.kw') && !event.isComposing && event.keyCode !== 229) {
      const selectedId = event.target.getAttribute('aria-activedescendant');
      const active = all('.search-option').findIndex((node) => node.id === selectedId);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (query('.search-suggestions').hidden) showSuggestions(event.target);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        selectSuggestion(active < 0 ? (direction === 1 ? 0 : -1) : active + direction);
      } else if (event.key === 'Escape' && !query('.search-suggestions').hidden) {
        event.preventDefault();
        hideSuggestions();
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        all('.search-option')[active].click();
      }
      return;
    }
    const control = event.target.closest('[role="button"][data-action]');
    if (control && !event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      control.click();
    } else if (event.key === ' ' && !event.repeat && !sheet.open &&
      !event.target.closest('button,a,input,select,textarea,[contenteditable],[role="button"]')) {
      event.preventDefault();
      actions['toggle-play']();
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.matches('.search-hero form')) {
      event.preventDefault();
      runSearch(query('.kw').value);
    }
    if (event.target.dataset.form === 'profile') {
      event.preventDefault();
      const name = query('#profile-name', sheet).value.trim();
      if (!name) return;
      profileName = name;
      store('name', profileName);
      sheet.close();
      render({ keepScroll: true, focusAction: 'edit-profile', focusValue: '' });
    }
  });

  app.addEventListener('input', (event) => {
    if (event.target.matches('.kw') && !event.isComposing) showSuggestions(event.target);
    if (event.target.matches('.playlist-filter') && !event.isComposing) {
      playlistFilters.get(route.playlist).keyword = event.target.value.trim();
      refreshPlaylistRows();
    }
    if (!event.target.matches('.seek')) return;
    seekTo(Number(event.target.value));
  });
  app.addEventListener('change', (event) => {
    if (event.target.matches('.seek')) savePlayback();
    if (event.target.matches('.playlist-sort')) {
      playlistFilters.get(route.playlist).order = event.target.value;
      refreshPlaylistRows();
    }
  });
  app.addEventListener('compositionend', (event) => {
    if (event.target.matches('.kw')) showSuggestions(event.target);
    if (event.target.matches('.playlist-filter')) {
      playlistFilters.get(route.playlist).keyword = event.target.value.trim();
      refreshPlaylistRows();
    }
  });
  app.addEventListener('focusout', (event) => {
    if (event.target.matches('.kw')) hideSuggestions();
  });
  app.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.search-option')) event.preventDefault();
  });

  sheet.addEventListener('input', (event) => {
    if (event.target.dataset.setting !== 'volume') return;
    volume = Number(event.target.value) / 100;
    if (volume > 0 && muted) {
      muted = false;
      const control = query('[data-action="mute"]', sheet);
      control.setAttribute('aria-pressed', 'false');
      control.textContent = '静音';
    }
    audio.volume = volume;
    audio.muted = muted;
    setText('.volume-readout', event.target.value + '%', sheet);
    savePlayback();
    setText('.pb-right [data-action="playback-settings"]', muted || volume === 0 ? 'volume_off' : 'volume_up');
  });

  sheet.addEventListener('change', (event) => {
    if (event.target.dataset.setting === 'speed') {
      speed = Number(event.target.value);
      audio.defaultPlaybackRate = speed;
      audio.playbackRate = speed;
      savePlayback();
    }
    if (event.target.dataset.setting === 'sleep') {
      sleepMinutes = Number(event.target.value);
      sleepUntil = sleepMinutes > 0 ? Date.now() + sleepMinutes * 60_000 : 0;
      updateSleepLabel();
    }
  });

  function setMediaSessionTrack() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const track = tracks.get(current);
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.name, artist: track.artist, album: track.album });
  }

  function syncAudioTime() {
    if (pendingSeek !== null || audio.readyState < 1 || !Number.isFinite(audio.currentTime)) return;
    elapsed = audio.currentTime;
    if (Math.abs(Math.floor(elapsed) - lastSavedSecond) >= 5) savePlayback();
    syncProgress();
  }

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) tracks.get(current).duration = audio.duration;
    syncAudioTime();
  });
  audio.addEventListener('timeupdate', syncAudioTime);
  audio.addEventListener('seeked', syncAudioTime);
  audio.addEventListener('play', () => {
    if (audio.paused) return;
    homeFeatures?.stopAuxiliary();
    playing = true;
    playbackState = 'loading';
    refreshControls();
  });
  audio.addEventListener('playing', () => {
    if (audio.paused) return;
    playing = true;
    playbackState = 'playing';
    addRecent(current);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    refreshControls();
  });
  audio.addEventListener('waiting', () => {
    if (audio.paused) return;
    playbackState = 'loading';
    refreshControls();
  });
  audio.addEventListener('pause', () => {
    if (!audio.paused) return;
    playing = false;
    playbackState = audio.error ? 'error' : 'pause';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    syncAudioTime();
    savePlayback();
    refreshControls();
  });
  audio.addEventListener('error', () => {
    playing = false;
    playbackState = 'error';
    refreshControls();
  });
  audio.addEventListener('ended', () => {
    if (repeat) {
      seekTo(0);
      beginPlayback();
    } else if (queue.length > 1) {
      moveTrack(1, true);
    } else {
      syncAudioTime();
      savePlayback();
      refreshControls();
    }
  });

  if ('mediaSession' in navigator) {
    for (const [event, handler] of Object.entries({
      play: beginPlayback,
      pause: () => audio.pause(),
      previoustrack: () => moveTrack(-1),
      nexttrack: () => moveTrack(1),
      seekto: (data) => { seekTo(data.seekTime); savePlayback(); },
    })) {
      try { navigator.mediaSession.setActionHandler(event, handler); }
      catch { /* This media key is unavailable in the current browser. */ }
    }
  }

  window.addEventListener('hashchange', () => render({ fromNavigation: true }));
  window.addEventListener('resize', () => homePagers.forEach((pager) => pager.resize()));
  window.addEventListener('pagehide', savePlayback);
  render();
  if (!audio.src) loadAudio(elapsed);
  setMediaSessionTrack();

  window.setInterval(() => {
    const now = Date.now();
    if (!document.hidden && !sheet.open) {
      if (rotateSpotlight && now - spotlightInteraction >= 6200 && !query('.artist-stage.swipe-active,.stage-play:is(:hover, :focus-visible)')) {
        setSpotlight(spotlight + 1);
      }
      for (const pager of homePagers) pager.tick(now);
    }
    if (sleepUntil && now >= sleepUntil) {
      audio.pause();
      sleepMinutes = 0;
      sleepUntil = 0;
      const timer = query('[data-setting="sleep"]', sheet);
      if (timer) timer.value = '0';
      notice('睡眠定时已结束');
    }
    if (sheet.open && sheet.dataset.kind === 'settings') updateSleepLabel();
  }, 500);
})();
