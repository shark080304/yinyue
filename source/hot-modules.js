(() => {
  'use strict';
  function create(api) {
    const { element, icon, button, media, tracks, demoIds, playlists, applyArtwork, playlistHref, searchHref, showVideo } = api;
    function section(id, title, subtitle) {
      const node = element('section', 'hot-section');
      node.id = id; node.setAttribute('aria-label', title);
      const heading = element('div', 'hot-section-head');
      const copy = element('div'); copy.append(element('h2', '', title), element('p', '', subtitle));
      heading.append(copy); node.append(heading);
      return node;
    }
    function external(label, href) {
      const node = element('a', 'hot-more', label); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer';
      node.append(icon('north_east')); return node;
    }
    function action(label, glyph, callback, style = '') {
      const node = button(label, '', '', glyph); node.classList.add('hot-button'); if (style) node.classList.add(style);
      node.addEventListener('click', callback); return node;
    }
    function art(key, className) {
      const cover = element('span', className); cover.setAttribute('aria-hidden', 'true'); applyArtwork(cover, key); return cover;
    }
    function radio() {
      const node = section('hot-radio', '独立音乐电台', '3 首开放试听 · 连续播放与同步歌词');
      node.classList.add('hot-radio'); applyArtwork(node, 'seaside', true);
      const body = element('div', 'hot-radio-body');
      const covers = element('div', 'hot-radio-covers');
      demoIds.forEach((id, i) => { const cover = art(id, 'hot-radio-cover'); cover.style.setProperty('--record-index', i); covers.append(cover); });
      const copy = element('div', 'hot-radio-copy');
      const order = element('div', 'hot-radio-moods'); order.setAttribute('role', 'group'); order.setAttribute('aria-label', '电台氛围');
      const start = button('开启电台', 'play-list', demoIds.join('|'), 'play_arrow'); start.classList.add('hot-radio-start');
      const hint = element('p', 'hot-radio-hint');
      function choose(mode) {
        let ids = mode === '轻快出发' ? [...demoIds] : mode === '放松夜晚' ? [...demoIds].reverse() : [...demoIds];
        if (mode === '随机漫游') for (let i = ids.length - 1; i > 0; i--) { const next = Math.floor(Math.random() * (i + 1)); [ids[i], ids[next]] = [ids[next], ids[i]]; }
        start.dataset.value = ids.join('|'); hint.textContent = '从 ' + tracks.get(ids[0]).name + ' 开始';
        for (const control of order.children) control.setAttribute('aria-pressed', String(control.textContent === mode));
      }
      for (const mode of ['轻快出发', '放松夜晚', '随机漫游']) order.append(action(mode, '', () => choose(mode)));
      copy.append(order, start, hint); body.append(covers, copy); node.append(body); choose('轻快出发'); return node;
    }
    function pulse() {
      const source = media.weekly;
      const node = section('hot-chart-pulse', '榜单速览', source.title + ' · ' + source.date + ' 快照');
      node.querySelector('.hot-section-head').append(external('去 QQ 音乐看完整榜单', source.source));
      const grid = element('div', 'hot-pulse-grid');
      for (const entry of source.tracks) {
        const card = external('', entry.source); card.className = 'hot-pulse-card'; card.setAttribute('aria-label', '查看上榜歌曲 ' + entry.title);
        card.replaceChildren();
        const image = document.createElement('img'); image.src = entry.image; image.alt = ''; image.loading = 'lazy';
        const copy = element('span', 'hot-pulse-copy'); copy.append(element('strong', '', entry.title), element('small', '', entry.artist));
        card.append(element('b', 'hot-pulse-rank', String(entry.rank).padStart(2, '0')), image, copy, icon('north_east')); grid.append(card);
      }
      node.append(grid); return node;
    }
    function artists() {
      const node = section('hot-artists', '歌手聚光', '华语与海外歌手 · 进入歌手曲目索引');
      const filters = element('div', 'hot-artist-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '歌手地区');
      const grid = element('div', 'hot-artist-grid');
      const slugs = ['gem', 'taylor-swift', 'jay-chou', 'bruno-mars', 'jj-lin', 'dua-lipa', 'eason-chan', 'billie-eilish'];
      const chinese = new Set(['gem', 'jay-chou', 'jj-lin', 'eason-chan']);
      function display(region) {
        const entries = slugs.map(slug => media.portraits.find(portrait => portrait.slug === slug)).filter(Boolean).filter(portrait => region === '全部' || (region === '华语' ? chinese.has(portrait.slug) : !chinese.has(portrait.slug)));
        grid.replaceChildren(...entries.map(portrait => {
          const name = portrait.nameZh || portrait.name;
          const card = element('a', 'hot-artist-card'); card.href = searchHref(name); card.setAttribute('aria-label', '查看歌手 ' + name);
          const cover = element('span', 'hot-artist-photo');
          const image = document.createElement('img'); image.src = portrait.url; image.alt = ''; image.loading = 'lazy'; image.style.objectPosition = portrait.position || 'center'; cover.append(image);
          const copy = element('span', 'hot-artist-copy'); copy.append(element('strong', '', name), element('small', '', chinese.has(portrait.slug) ? '华语 · 舞台焦点' : '海外 · 流行现场'));
          card.append(cover, copy, icon('arrow_outward')); return card;
        }));
        for (const control of filters.children) control.setAttribute('aria-pressed', String(control.textContent === region));
      }
      for (const region of ['全部', '华语', '海外']) filters.append(action(region, '', () => display(region)));
      node.querySelector('.hot-section-head').append(filters); node.append(grid); display('全部'); return node;
    }
    function genres() {
      const node = section('hot-genres', '风格歌单漫游', '从流行旋律到深夜节拍，找到此刻的频道');
      const grid = element('div', 'hot-genre-grid');
      const entries = [
        { id: 'western', title: '欧美流行', subtitle: '把耳朵交给舞台', image: 'stage', mark: 'POP' },
        { id: 'newjeans', title: 'K-Pop 律动', subtitle: '轻快节拍，循环心动', image: 'dance', mark: 'K-POP' },
        { id: 'energy', title: '元气运动', subtitle: '跟着节奏，一起向前', image: 'workout', mark: 'ENERGY' },
        { id: 'night', title: '深夜抒情', subtitle: '留一段旋律给自己', image: 'midnight', mark: 'LATE NIGHT' },
      ];
      for (const entry of entries) {
        const card = element('a', 'hot-genre-card'); card.href = playlistHref(entry.id); applyArtwork(card, entry.image, true);
        card.append(element('span', 'hot-genre-mark', entry.mark), element('h3', '', entry.title), element('p', '', entry.subtitle), element('small', '', playlists[entry.id].tracks.length + ' 首收录'), icon('arrow_forward'));
        grid.append(card);
      }
      node.append(grid); return node;
    }
    function videos() {
      const node = section('hot-video-zone', 'MV 精选现场', '从音乐到影像，打开歌手的另一个舞台');
      const grid = element('div', 'hot-video-grid');
      for (const video of media.videos.slice(0, 4)) {
        const card = action('', '', () => showVideo(video), 'hot-video-card'); card.setAttribute('aria-label', '播放热门 MV ' + video.title);
        const cover = art(video.artwork, 'hot-video-cover'); cover.append(icon('play_circle_filled'));
        const copy = element('span', 'hot-video-copy'); copy.append(element('strong', '', video.title), element('small', '', video.artist));
        card.append(cover, copy); grid.append(card);
      }
      node.append(grid); return node;
    }
    function mount(content, chart) {
      const side = chart.nextElementSibling;
      const overview = element('div', 'hot-overview');
      const primary = element('div', 'hot-primary');
      chart.before(overview); primary.append(chart, radio()); overview.append(primary);
      if (side) { side.classList.add('hot-aside'); overview.append(side); }
      const modules = element('div', 'hot-modules'); modules.append(pulse(), artists(), genres(), videos()); content.append(modules);
      // Give the existing compact MV cards the same working official players.
      for (const [index, tile] of [...content.querySelectorAll('.mv')].entries()) {
        const video = media.videos[index]; if (!video) continue;
        const card = action('', '', () => showVideo(video), 'hot-side-video'); card.classList.add('mv'); applyArtwork(card, video.artwork, true);
        card.append(icon('play_arrow'), element('b', '', video.title + ' · ' + video.artist), element('span', '', '打开官方 MV'));
        tile.replaceWith(card);
      }
    }
    return { mount };
  }
  window.SunnyHotModules = Object.freeze({ create });
})();
