(function () {
  'use strict';
  var LETTER_RE = null;
  try { LETTER_RE = new RegExp('[^\\p{L}\\p{N}]', 'gu'); } catch (e) { LETTER_RE = /[^0-9a-zA-Z]/g; }
  function synthesizeWords(cue) {
    var parts = String(cue.text).split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    var weights = parts.map(function (p) {
      var core = p.replace(LETTER_RE, '');
      return Math.max(2, core.length || 2);
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var fullSpan = (cue.end - cue.start) + 80;
    var span = (cue._beat && cue._beat < fullSpan) ? cue._beat : fullSpan;
    span -= 80;
    var usable = Math.max(600, span * 0.94);
    var t = cue.start + Math.min(200, span * 0.05);
    return parts.map(function (p, i) {
      var d = usable * (weights[i] / total);
      var w = { text: p, start: t, end: t + d };
      t += d;
      return w;
    });
  }
  function readTime() {
    try {
      var a = window.AU;
      if (a && isFinite(a.currentTime)) return a.currentTime;
    } catch (e) { }
    try { if (typeof S !== 'undefined' && S.pt) return S.pt; } catch (e) { }
    return 0;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function Stage(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.leadMs = this.opts.leadMs != null ? this.opts.leadMs : 180;
    this.offsetLines = 0;
    this.cues = [];
    this.activeIdx = -1;
    this.scrollY = 0; this.scrollVel = 0; this.targetY = 0;
    this.winLo = 0; this.winHi = -1;
    this.lastTs = 0; this.lastTimeMs = null;
    this.userPauseUntil = 0;
    this.curWordEl = null;
    this._dirty = true;
    this._onLineClick = this.opts.onLineClick || null;
    this._enterT = null;
    this._touchY = null;
    this._buildShell();
    this._bind();
    var self = this;
    this._raf = requestAnimationFrame(function (t) {
      self.lastTs = t;
      self.frame(t);
    });
  }
  Stage.prototype._buildShell = function () {
    var vp = document.createElement('div');
    vp.className = 'fx-stage fx-blur' + (this.opts.small ? ' fx-small' : '') + (this.opts.pop ? ' fx-pop' : '');
    var tr = document.createElement('div');
    tr.className = 'fx-track';
    vp.appendChild(tr);
    this.root.innerHTML = '';
    this.root.classList.add('fx-host');
    this.root.appendChild(vp);
    this.viewport = vp;
    this.track = tr;
  };
  Stage.prototype._bind = function () {
    var self = this;
    this._onWheel = function (e) { e.preventDefault(); self._manual(e.deltaY); };
    this._onTouchStart = function (e) { self._touchY = e.touches[0].clientY; };
    this._onTouchMove = function (e) {
      if (self._touchY == null) return;
      var y = e.touches[0].clientY;
      var dy = self._touchY - y;
      self._touchY = y;
      if (dy !== 0) self._manual(dy);
    };
    this._onTouchEnd = function () { self._touchY = null; };
    this._onClick = function (e) {
      var lineEl = e.target && e.target.closest ? e.target.closest('.fx-line') : null;
      if (!lineEl) return;
      var cue = self.cues[+lineEl.dataset.i];
      if (cue && self._onLineClick) self._onLineClick(cue.timeSec);
    };
    this.viewport.addEventListener('wheel', this._onWheel, { passive: false });
    this.viewport.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.viewport.addEventListener('touchmove', this._onTouchMove, { passive: true });
    this.viewport.addEventListener('touchend', this._onTouchEnd, { passive: true });
    this.track.addEventListener('click', this._onClick);
  };
  Stage.prototype.setCues = function (lines) {
    var arr = [];
    for (var i = 0; i < (lines || []).length; i++) {
      var li = lines[i];
      var t = +li.time;
      if (!isFinite(t) || t < 0) continue;
      arr.push({ start: t * 1000, timeSec: t, text: li.text, translation: li.translation });
    }
    arr.sort(function (a, b) { return a.start - b.start; });
    var gaps = [];
    for (var g = 0; g < arr.length - 1; g++) {
      var gd = arr[g + 1].start - arr[g].start;
      if (gd > 150) gaps.push(gd);
    }
    gaps.sort(function (a, b) { return a - b; });
    var beat = gaps.length ? gaps[gaps.length >> 1] : 0;
    for (var j = 0; j < arr.length; j++) {
      arr[j]._beat = beat;
      var next = arr[j + 1] ? arr[j + 1].start : arr[j].start + 5000;
      arr[j].end = Math.max(arr[j].start + 320, next - 80);
    }
    this.cues = arr;
    this.activeIdx = -1;
    this.curWordEl = null;
    this.buildTrack();
    this._dirty = true;
  };
  Stage.prototype.buildTrack = function () {
    var track = this.track;
    track.textContent = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < this.cues.length; i++) {
      var cue = this.cues[i];
      var el = document.createElement('div');
      el.className = 'fx-line';
      el.dataset.i = i;
      el.style.setProperty('--i', i);
      var inner = document.createElement('div');
      inner.className = 'fx-inner';
      var words = cue.w = synthesizeWords(cue);
      for (var j = 0; j < words.length; j++) {
        var w = words[j];
        var span = document.createElement('span');
        span.className = 'fx-word';
        span.textContent = w.text;
        span.style.setProperty('--p', '0');
        span.style.setProperty('--j', j);
        inner.appendChild(span);
        if (j < words.length - 1) inner.appendChild(document.createTextNode(' '));
        w.el = span;
        w._p = 0;
      }
      el.appendChild(inner);
      if (cue.translation && String(cue.translation).trim()) {
        var te = document.createElement('div');
        te.className = 'fx-trans';
        te.textContent = '(' + cue.translation + ')';
        el.appendChild(te);
      }
      cue.el = el;
      frag.appendChild(el);
    }
    var end = document.createElement('div');
    end.className = 'fx-end';
    end.textContent = '——— end ———';
    frag.appendChild(end);
    track.appendChild(frag);
    track.classList.add('entering');
    clearTimeout(this._enterT);
    this._enterT = setTimeout(function () { track.classList.remove('entering'); }, 1800);
  };
  Stage.prototype.setOffsetLines = function (n) { this.offsetLines = n | 0; this._dirty = true; };
  Stage.prototype.snap = function () { this._dirty = true; };
  Stage.prototype._computeTarget = function (idx) {
    if (idx < 0 || idx >= this.cues.length) return 0;
    var el = this.cues[idx].el;
    if (!el) return 0;
    var frac = this.opts.centerY != null ? this.opts.centerY : 0.42;
    return this.viewport.clientHeight * frac - (el.offsetTop + el.offsetHeight / 2);
  };
  Stage.prototype._clampY = function (y) {
    if (!this.cues.length) return 0;
    var a = this._computeTarget(0);
    var b = this._computeTarget(this.cues.length - 1);
    var lo = Math.min(a, b), hi = Math.max(a, b);
    return clamp(y, lo, hi);
  };
  Stage.prototype._applyTransform = function () {
    this.track.style.transform = 'translate3d(0,' + this.scrollY.toFixed(2) + 'px,0)';
  };
  Stage.prototype._follow = function (dt) {
    var real = Math.min(0.25, Math.max(0, dt));
    var diff = this.targetY - this.scrollY;
    if (Math.abs(diff) < 0.1) {
      this.scrollY = this.targetY;
    } else {
      this.scrollY += diff * (1 - Math.exp(-real * 16));
    }
    this._applyTransform();
  };
  Stage.prototype._userPaused = function () { return Date.now() < this.userPauseUntil; };
  Stage.prototype._manual = function (dy) {
    if (!this.cues.length) return;
    this.userPauseUntil = Date.now() + 2500;
    this.scrollVel = 0;
    this.targetY = this._clampY(this.targetY - dy);
    this.scrollY = this.targetY;
    this._applyTransform();
  };
  Stage.prototype._findActive = function (t) {
    var cues = this.cues, lo = 0, hi = cues.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  };
  Stage.prototype._setLineFill = function (i, v) {
    var cue = this.cues[i];
    if (!cue || !cue.w) return;
    for (var k = 0; k < cue.w.length; k++) {
      var w = cue.w[k];
      if (w._p !== v) { w.el.style.setProperty('--p', v); w._p = v; }
    }
  };
  Stage.prototype._resetFills = function (upTo) {
    for (var i = 0; i < this.cues.length; i++) {
      this._setLineFill(i, i < upTo ? 1 : 0);
    }
  };
  Stage.prototype._update = function (tReal, force) {
    if (!this.cues.length) return;
    var ni = this._findActive(tReal + this.leadMs);
    var idx = ni + this.offsetLines;
    if (idx < -1) idx = -1;
    if (idx > this.cues.length - 1) idx = this.cues.length - 1;
    if (idx < 0) {
      this.activeIdx = -1;
      for (var pi = 0; pi < this.cues.length; pi++) {
        var pel = this.cues[pi].el;
        pel.classList.remove('is-active', 'near');
        pel.style.setProperty('--ad', 3);
      }
      if (this.curWordEl) {
        this.curWordEl.classList.remove('is-current');
        this.curWordEl = null;
      }
      if (!this._userPaused()) this.targetY = this._computeTarget(0);
      this.winLo = 0;
      this.winHi = -1;
      return;
    }
    if (idx !== this.activeIdx || force) {
      var prev = this.activeIdx;
      this.activeIdx = idx;
      for (var i = 0; i < this.cues.length; i++) {
        this.cues[i].el.classList.toggle('is-active', i === idx);
      }
      if (prev >= 0 && prev !== idx) this._setLineFill(prev, prev < idx ? 1 : 0);
    }
    if (!this._userPaused()) {
      var ty = this._computeTarget(idx);
      if (Math.abs(ty - this.targetY) > 0.5) this.targetY = ty;
    }
    var lo = Math.max(0, idx - 4);
    var hi = Math.min(this.cues.length - 1, idx + 4);
    for (var w = lo; w <= hi; w++) {
      var el = this.cues[w].el;
      el.style.setProperty('--ad', Math.abs(w - idx));
      if (!el.classList.contains('near')) el.classList.add('near');
    }
    for (var x = this.winLo; x < lo; x++) this._exitWindow(x);
    for (var y = hi + 1; y <= this.winHi; y++) this._exitWindow(y);
    this.winLo = lo; this.winHi = hi;
    var liveWordEl = null;
    if (idx >= 0) {
      var cue = this.cues[idx];
      for (var k = 0; k < cue.w.length; k++) {
        var ww = cue.w[k];
        var span = ww.end - ww.start;
        var p = span > 0 ? (tReal - ww.start) / span : 1;
        p = clamp(p, 0, 1);
        p = Math.round(p * 200) / 200;
        if (p !== ww._p) { ww.el.style.setProperty('--p', p); ww._p = p; }
        if (tReal >= ww.start && tReal < ww.end) liveWordEl = ww.el;
      }
    }
    if (liveWordEl !== this.curWordEl) {
      if (this.curWordEl) this.curWordEl.classList.remove('is-current');
      if (liveWordEl) liveWordEl.classList.add('is-current');
      this.curWordEl = liveWordEl;
    }
  };
  Stage.prototype._exitWindow = function (i) {
    var el = this.cues[i] && this.cues[i].el;
    if (!el) return;
    el.classList.remove('near');
    el.style.setProperty('--ad', 5);
  };
  Stage.prototype.frame = function (now) {
    var dt = Math.min(0.05, (now - this.lastTs) / 1000 || 0.016);
    this.lastTs = now;
    if (this.viewport && this.viewport.clientHeight > 0) {
      var tMs = readTime() * 1000;
      if (this.lastTimeMs !== null && Math.abs(tMs - this.lastTimeMs) > 400) {
        this.activeIdx = -1;
        if (this.curWordEl) { this.curWordEl.classList.remove('is-current'); this.curWordEl = null; }
        var ni2 = this._findActive(tMs + this.leadMs);
        this._resetFills(ni2 + this.offsetLines);
        this.targetY = this._clampY(this._computeTarget(ni2 + this.offsetLines));
        this.scrollY = this.targetY;
        this.scrollVel = 0;
        this._dirty = true;
      }
      this.lastTimeMs = tMs;
      if (this._dirty) {
        this._update(tMs, true);
        this.scrollY = this._clampY(this.targetY);
        this.scrollVel = 0;
        this._applyTransform();
        this._dirty = false;
      } else {
        this._update(tMs, false);
      }
      this._follow(dt);
    }
    var self = this;
    this._raf = requestAnimationFrame(function (t) { self.frame(t); });
  };
  Stage.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._enterT);
    this.viewport.removeEventListener('wheel', this._onWheel);
    this.viewport.removeEventListener('touchstart', this._onTouchStart);
    this.viewport.removeEventListener('touchmove', this._onTouchMove);
    this.viewport.removeEventListener('touchend', this._onTouchEnd);
    this.track.removeEventListener('click', this._onClick);
    this.root.innerHTML = '';
    this.root.classList.remove('fx-host');
    if (this.root._fxStage === this) this.root._fxStage = null;
    this.cues = [];
    this.viewport = null;
    this.track = null;
  };
  window.LyricsFX = {
    create: function (root, opts) {
      if (!root) return null;
      if (root._fxStage) root._fxStage.destroy();
      var st = new Stage(root, opts);
      root._fxStage = st;
      return st;
    }
  };
})();