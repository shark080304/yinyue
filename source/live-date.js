(() => {
  'use strict';
  let mounted;
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const pad = value => String(value).padStart(2, '0');
  function refresh() {
    if (!mounted?.isConnected) return;
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1, day = now.getDate();
    const weekday = weekdays[now.getDay()];
    const clock = pad(now.getHours()) + ':' + pad(now.getMinutes());
    const stamp = [year, month, day, clock].join('-');
    if (mounted.dataset.minute === stamp) return;
    mounted.dataset.minute = stamp;
    const full = year + ' 年 ' + month + ' 月 ' + day + ' 日 · ' + weekday;
    const time = mounted.querySelector('time');
    time.dateTime = now.toISOString();
    mounted.querySelector('.date-full').textContent = full;
    mounted.querySelector('.date-short').textContent = month + '/' + day + ' ' + weekday;
    mounted.querySelector('.date-clock').textContent = clock;
    mounted.setAttribute('aria-label', full + ' ' + clock);
    mounted.title = full + ' ' + clock + ' · 当地时间 ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function mount(topbar) {
    mounted = null;
    if (!topbar) return;
    const node = topbar.querySelector('.chip-day') || document.createElement('div');
    node.className = 'chip-day live-date';
    const glyph = document.createElement('span');
    glyph.className = 'material-icons'; glyph.textContent = 'calendar_today'; glyph.setAttribute('aria-hidden', 'true');
    const time = document.createElement('time');
    for (const name of ['date-full', 'date-short', 'date-clock']) {
      const copy = document.createElement('span'); copy.className = name; copy.setAttribute('aria-hidden', 'true'); time.append(copy);
    }
    node.replaceChildren(glyph, time);
    if (!node.isConnected) topbar.insertBefore(node, topbar.querySelector('.avatar'));
    mounted = node;
    refresh();
  }
  setInterval(refresh, 1000);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.SunnyLiveDate = Object.freeze({ mount });
})();
