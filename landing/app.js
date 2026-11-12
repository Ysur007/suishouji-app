/* 随手记 · 落地页交互
   无依赖。所有效果在 JS 缺失时优雅退化。 */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 导航：滚动后出现发丝线 ─────────────────────────── */
  var nav = document.getElementById('nav');
  var lastY = -1;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if ((y > 8) !== (lastY > 8)) nav.classList.toggle('is-scrolled', y > 8);
    lastY = y;
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── 复制命令 ───────────────────────────────────────── */
  var COPY_ICON = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M13 4.6H6a2 2 0 00-2 2V13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  var DONE_ICON = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10.5l3.6 3.6 7.4-8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      copyText(text).then(function (ok) {
        if (!ok) { live.textContent = '复制失败，请手动选择命令'; return; }
        btn.classList.add('is-done');
        btn.innerHTML = DONE_ICON;
        live.textContent = '已复制：' + text;
        window.setTimeout(function () {
          btn.classList.remove('is-done');
          btn.innerHTML = COPY_ICON;
        }, 1600);
      });
    });
  });

  /* ── 移动端：截图默认落在内容区，而不是侧栏 ─────────── */
  var shotFig = document.querySelector('.shot__fig');
  if (shotFig && window.matchMedia('(max-width: 620px)').matches) {
    shotFig.scrollLeft = 262;
  }

  /* ── 首屏：最后一条气泡入场 ─────────────────────────── */
  var incoming = document.querySelector('.bubble--in');
  if (incoming) {
    if (reduce) {
      incoming.classList.add('is-shown');
    } else {
      window.setTimeout(function () { incoming.classList.add('is-shown'); }, 420);
    }
  }

  /* ── 界面预览：标签切换 ─────────────────────────────── */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    function preload(tab) {
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (!panel) return;
      var img = panel.querySelector('img');
      if (img && !img.complete) img.loading = 'eager';
    }

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        if (on) {
          panel.hidden = false;
          panel.classList.remove('is-entering');
          void panel.offsetWidth;
          if (!reduce) panel.classList.add('is-entering');
        } else {
          panel.hidden = true;
        }
      });
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('mouseenter', function () { preload(tab); });
      tab.addEventListener('focus', function () { preload(tab); });
      tab.addEventListener('keydown', function (e) {
        var next = -1;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        select(tabs[next], true);
      });
    });

    preload(tabs[0]);
  }

  /* ── 试一次：真的能记一条 ───────────────────────────── */
  var form = document.getElementById('tryForm');
  var input = document.getElementById('tryInput');
  var feed = document.getElementById('tryFeed');
  var empty = document.getElementById('tryEmpty');

  if (form && input && feed) {
    var mine = 0;
    var MAX = 6;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }

      var el = document.createElement('div');
      el.className = 'bubble bubble--me';
      if (!reduce) el.style.transform = 'translateY(16px) scale(.96)';
      var p = document.createElement('p');
      p.textContent = text.length > 120 ? text.slice(0, 120) + '…' : text;
      el.appendChild(p);
      feed.appendChild(el);
      if (!reduce) {
        requestAnimationFrame(function () {
          el.style.transition = 'opacity .38s cubic-bezier(.16,1,.3,1), transform .38s cubic-bezier(.16,1,.3,1)';
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      }

      if (empty) empty.hidden = true;
      mine++;
      while (feed.querySelectorAll('.bubble').length > MAX) {
        var first = feed.querySelector('.bubble');
        if (!first) break;
        first.remove();
      }
      feed.scrollTop = feed.scrollHeight;
      input.value = '';
      input.focus();
      live.textContent = '已记下：' + text;
    });
  }

  /* ── 滚动揭示 ───────────────────────────────────────── */
  var targets = document.querySelectorAll('.row, .scene, .path, .limits__box, .try__panel, .shot__fig, .closing');
  if (!('IntersectionObserver' in window) || reduce) {
    // 不支持或用户要求减少动效：保持全部可见
  } else {
    var vh = window.innerHeight || 800;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px 140px 0px', threshold: 0 });

    Array.prototype.forEach.call(targets, function (el) {
      // 已经在视口里的元素保持可见，不做隐藏再显示
      if (el.getBoundingClientRect().top < vh) return;
      el.classList.add('reveal');
      io.observe(el);
    });

    // 兜底：任何原因导致观察器失效时，2.4 秒后全部显示
    window.setTimeout(function () {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-in'); });
    }, 2400);
  }
})();
