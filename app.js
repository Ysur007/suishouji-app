/* 随手记 · 落地页
   无依赖。JS 缺失时：舞台停在终态、内容全部可见、复制按钮退化为普通按钮。 */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 状态播报 ───────────────────────────────────────── */
  var live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  var toast = document.createElement('p');
  toast.className = 'toast';
  toast.setAttribute('aria-hidden', 'true');
  document.body.appendChild(toast);
  var toastTimer = null;

  function say(msg) {
    live.textContent = msg;
    toast.textContent = msg;
    toast.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('is-on'); }, 2200);
  }

  /* ── 同步舞台 ───────────────────────────────────────── */

  var stage = document.querySelector('.stage');
  var fly = document.getElementById('fly');
  var lane = document.querySelector('.stage__lane');
  var countRoll = document.querySelector('.count__roll');

  function setLaneDistance() {
    if (!stage || !lane || !fly) return;
    var laneW = lane.getBoundingClientRect().width;
    var flyW = fly.getBoundingClientRect().width;
    var dx = Math.max(60, laneW - flyW * 0.82);
    stage.style.setProperty('--lane-dx', dx.toFixed(1) + 'px');
  }

  if (stage && fly && !reduce) {
    var plays = 0;
    var MAX_PLAYS = 3;
    var base = 14;

    var play = function () {
      if (plays >= MAX_PLAYS) return;
      plays++;
      setLaneDistance();
      if (countRoll) {
        var rows = countRoll.querySelectorAll('b');
        if (rows.length >= 2) {
          rows[0].textContent = String(base);
          rows[1].textContent = String(base + 1);
        }
      }
      stage.classList.remove('is-playing');
      void stage.offsetWidth;
      stage.classList.add('is-playing');
    };

    // 入场后稍等一拍，让首帧文字先光栅化
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { play(); }, { timeout: 900 });
    } else {
      window.setTimeout(play, 420);
    }

    // 离开视口再回来，最多重播到 3 次
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && plays > 0 && plays < MAX_PLAYS) play();
        });
      }, { threshold: 0.45 }).observe(stage);
    }

    // 点一下舞台再看一遍
    stage.addEventListener('click', function () {
      if (plays < MAX_PLAYS) play();
    });

    window.addEventListener('resize', setLaneDistance, { passive: true });
  }

  /* ── 深色区块：nav 反色 ─────────────────────────────── */

  var nav = document.getElementById('nav');
  var darks = Array.prototype.slice.call(document.querySelectorAll('.dark-sec'));
  var darkIO = null;

  function watchDarks() {
    if (darkIO) darkIO.disconnect();
    if (!('IntersectionObserver' in window) || !darks.length) return;

    var navH = nav ? nav.offsetHeight : 64;
    var band = Math.max(1, window.innerHeight - navH - 1);
    var inside = 0;

    darkIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        inside += e.isIntersecting ? 1 : -1;
        if (inside < 0) inside = 0;
      });
      nav.classList.toggle('nav--invert', inside > 0);
    }, { rootMargin: '-' + navH + 'px 0px -' + band + 'px 0px', threshold: 0 });

    darks.forEach(function (s) { darkIO.observe(s); });
  }

  if (nav && darks.length) {
    watchDarks();
    var rTimer;
    window.addEventListener('resize', function () {
      window.clearTimeout(rTimer);
      rTimer = window.setTimeout(watchDarks, 180);
    }, { passive: true });
  }

  /* ── 复制命令 ───────────────────────────────────────── */

  var COPY_ICON = '<svg class="act__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M13 4.6H6a2 2 0 00-2 2V13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  var DONE_ICON = '<svg class="act__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10.5l3.6 3.6 7.4-8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  function copyText(text) {
    // 先在点击的同步上下文里试 execCommand（最可靠），失败再走 async API
    if (legacyCopy(text)) return Promise.resolve(true);
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    var original = btn.innerHTML;
    var label = btn.querySelector('.act__label') || btn;
    var originalLabel = label.textContent;
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      copyText(text).then(function (ok) {
        if (!ok) { say('复制失败，请手动选中命令'); return; }
        btn.classList.add('is-done');
        label.textContent = '已复制';
        var icon = btn.querySelector('svg');
        if (icon) icon.outerHTML = DONE_ICON;
        say('已复制 ' + text + '，去终端粘贴');
        window.setTimeout(function () {
          btn.classList.remove('is-done');
          btn.innerHTML = original;
          label = btn.querySelector('.act__label') || btn;
        }, 2000);
      });
    });
  });

  /* ── 界面预览 ───────────────────────────────────────── */

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ui__tab'));
  var shots = Array.prototype.slice.call(document.querySelectorAll('.ui__shot'));
  var cap = document.getElementById('uiCap');

  var CAPS = [
    '记录 · 当一个聊天窗口用。往上翻超过一屏，右下角浮出「最新」，点一下回到底部。',
    '整理 · 批处理：选范围、生成、看结果，报告留在左侧历史里，可以回头比。',
    '对话 · 检索式问答，回答下面挂着可点回原文的引用。可流式输出，也可以中途停。',
    '时间线 · 按时间铺开，标出隔了多久、是当天第几条、来自哪台设备。',
    '空间 · 卡片流加全文搜索，适合"我记得写过，但不记得哪天"。',
    '文件夹 · 五层 CSS 叠出厚度的拟物图标，六种色调其实是六个明度档。',
    '手机 · 单列记录流，底部四个标签，长按气泡出菜单。'
  ];

  if (tabs.length && shots.length) {
    var current = 0;

    var warm = function (i) {
      var img = shots[i];
      if (img && img.loading === 'lazy' && !img.complete) img.loading = 'eager';
    };

    var pick = function (i, focus) {
      current = (i + shots.length) % shots.length;
      tabs.forEach(function (t, k) {
        var on = k === current;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      shots.forEach(function (s, k) { s.classList.toggle('is-on', k === current); });
      if (cap) cap.textContent = CAPS[current] || '';
      if (focus) tabs[current].focus();
    };

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { pick(i, false); });
      tab.addEventListener('mouseenter', function () { warm(i); });
      tab.addEventListener('focus', function () { warm(i); });
      tab.addEventListener('keydown', function (e) {
        var next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current + 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current - 1;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        pick(next, true);
      });
    });

    warm(1);
  }

  /* ── 揭示 ───────────────────────────────────────────── */
  /* 由 CSS 的 animation-timeline: view() 驱动，JS 只负责打标记，
     不隐藏任何内容；不支持的浏览器直接跳过。 */

  var SEL = [
    '.dark-sec__copy', '.bigfile',
    '.h2:not(.h2--dark)', '.sec__lede', '.dark-sec__lede',
    '.ui__stage', '.find__copy', '.ask', '.tl', '.limit', '.route',
    '.closing__h', '.closing__p', '.closing__a'
  ].join(',');

  if (window.CSS && CSS.supports && CSS.supports('animation-timeline: view()')) {
    Array.prototype.forEach.call(document.querySelectorAll('main > section'), function (sec) {
      if (sec.classList.contains('hero')) return;
      Array.prototype.forEach.call(sec.querySelectorAll(SEL), function (el) {
        el.classList.add('rise');
      });
    });
  }
})();
