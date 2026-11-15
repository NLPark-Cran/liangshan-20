/**
 * scroll.js — 手卷的长轴拖拽与吸附
 *
 * 交互逻辑：手卷不是缩放的地图，是一段一段展开的。
 * 拖拽 / 滚轮 / 方向键 / 触摸滑动都能移动，松手后吸附到最近的点位。
 */

export class ScrollController {
  /**
   * @param {object} o
   *   viewport  可拖拽的容器（.scroll__viewport）
   *   track     被移动的内容（.scroll__track）
   *   points    点位数组 [{ id, name, u }]，u 是 0-1 的位置比例
   *   onFocus   点位成为焦点时的回调 (index) => void
   *   onProgress 进度变化回调 (ratio) => void
   */
  constructor(o) {
    this.viewport = o.viewport;
    this.track = o.track;
    this.points = o.points || [];
    this.onFocus = o.onFocus || (() => {});
    this.onProgress = o.onProgress || (() => {});

    this.offset = 0; // 当前平移（负数向左）
    this.velocity = 0;
    this.minOffset = 0;
    this.maxOffset = 0;
    this.raf = null;
    this.dragging = false;
    this.lastX = 0;
    this.lastT = 0;
    this.activeIndex = 0;
    this.hasInteracted = false;

    this._bind();
    this.measure();
  }

  /* ── 测量 ───────────────────────────────────────────── */

  measure() {
    const vw = this.viewport.clientWidth;
    const tw = this.track.scrollWidth || this.track.offsetWidth;
    this.viewW = vw;
    this.trackW = tw;
    this.maxOffset = 0;
    this.minOffset = Math.min(0, vw - tw);
    this.offset = Math.max(this.minOffset, Math.min(this.maxOffset, this.offset));
    this._apply();
  }

  /** 点位在 track 中的像素位置 */
  pxOf(u) {
    return u * (this.trackW || this.viewW);
  }

  /** 把某个点位滚到屏幕中心附近 */
  focusIndex(i, smooth = true) {
    if (i < 0 || i >= this.points.length) return;
    this.activeIndex = i;
    const target = this._clamp(this.viewW * 0.5 - this.pxOf(this.points[i].u));
    this._animateTo(target, smooth);
    this.onFocus(i);
    this.onProgress(this.progress);
  }

  get progress() {
    if (this.minOffset === 0) return 0;
    return this.offset / this.minOffset;
  }

  /* ── 内部 ───────────────────────────────────────────── */

  _clamp(v) {
    return Math.max(this.minOffset, Math.min(this.maxOffset, v));
  }

  _apply() {
    this.track.style.transform = `translate3d(${this.offset.toFixed(2)}px,0,0)`;
    this.onProgress(this.progress);
  }

  _animateTo(target, smooth) {
    if (this.raf) cancelAnimationFrame(this.raf);
    const from = this.offset;
    const to = this._clamp(target);
    if (!smooth || Math.abs(to - from) < 1) {
      this.offset = to;
      this._apply();
      return;
    }
    const t0 = performance.now();
    const dur = 620;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      // easeOutQuint 的近似，配合 CSS 的 cubic 感觉
      const e = 1 - Math.pow(1 - t, 5);
      this.offset = from + (to - from) * e;
      this._apply();
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.raf = null;
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 松手后找最近点位并吸附 */
  _snap() {
    if (!this.points.length) return;
    // 视口中心对应的 track 位置
    const center = -this.offset + this.viewW * 0.5;
    let best = 0;
    let bestD = Infinity;
    this.points.forEach((p, i) => {
      const d = Math.abs(this.pxOf(p.u) - center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    // 阈值：超过 0.42 屏宽就不吸了，让用户自由停
    if (bestD < this.viewW * 0.42) {
      this.focusIndex(best, true);
    } else {
      this.offset = this._clamp(this.offset);
      this._apply();
    }
  }

  _bind() {
    const v = this.viewport;

    // 指针拖拽
    v.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      // 点在按钮上不拖
      if (e.target.closest('.mark')) return;
      this.dragging = true;
      this.hasInteracted = true;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      this.velocity = 0;
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = null;
      }
      v.classList.add('is-dragging');
      v.setPointerCapture(e.pointerId);
    });

    v.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT);
      const dx = e.clientX - this.lastX;
      this.offset = this._clamp(this.offset + dx);
      this.velocity = (dx / dt) * 16;
      this.lastX = e.clientX;
      this.lastT = now;
      this._apply();
    });

    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      v.classList.remove('is-dragging');
      try {
        v.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* 指针已释放 */
      }

      // 惯性
      if (Math.abs(this.velocity) > 1.6) {
        const glide = () => {
          this.velocity *= 0.92;
          this.offset = this._clamp(this.offset + this.velocity);
          this._apply();
          if (Math.abs(this.velocity) > 0.4) {
            this.raf = requestAnimationFrame(glide);
          } else {
            this.raf = null;
            this._snap();
          }
        };
        this.raf = requestAnimationFrame(glide);
      } else {
        this._snap();
      }
    };

    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);

    // 滚轮：竖向滚动转横向
    v.addEventListener(
      'wheel',
      (e) => {
        // 如果按住 shift 或本来就是横向滚动，直接用
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 1) return;
        e.preventDefault();
        this.hasInteracted = true;
        this.offset = this._clamp(this.offset - d * 1.05);
        this._apply();
        if (this._wheelTimer) clearTimeout(this._wheelTimer);
        this._wheelTimer = setTimeout(() => this._snap(), 160);
      },
      { passive: false }
    );

    // 键盘
    v.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.hasInteracted = true;
        this.focusIndex(Math.min(this.activeIndex + 1, this.points.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.hasInteracted = true;
        this.focusIndex(Math.max(this.activeIndex - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.focusIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.focusIndex(this.points.length - 1);
      }
    });

    // 尺寸变化
    window.addEventListener('resize', () => {
      this.measure();
      this.focusIndex(this.activeIndex, false);
    });
  }
}
