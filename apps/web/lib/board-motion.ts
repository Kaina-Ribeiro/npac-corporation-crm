/**
 * Motor do dashboard organizável: arrasto por ponteiro (mouse, toque, caneta) ou teclado,
 * reordenação ao vivo com FLIP e molas no estilo SwiftUI. Durante o gesto mexe direto no DOM
 * (`style.order`, `transform`) e só entrega a ordem final ao React ao soltar: o DOM não muda
 * de lugar no meio do gesto, então o foco e o toque não se perdem.
 */

type Spring = { k: number; c: number };
type Body = { x: number; y: number; vx: number; vy: number; s: Spring };
type Box = { x: number; y: number; w: number; h: number };

/** Mola como no SwiftUI: `response` em segundos e fração de amortecimento (1 = sem rebote). */
const spring = (response: number, damping: number): Spring => ({
  k: ((2 * Math.PI) / response) ** 2,
  c: (4 * Math.PI * damping) / response,
});
const MAKE_ROOM = spring(0.36, 0.86); // os vizinhos abrem espaço
const SETTLE = spring(0.48, 0.72); // o card assenta no encaixe ao soltar, com leve rebote
const MAGNET = spring(0.16, 1); // o encaixe "segura" o card de leve enquanto arrasta

const LONG_PRESS_MS = 300; // no toque, segurar levanta o card (o arrasto curto é rolagem)
const EDGE = 80; // faixa da borda da tela que rola a página durante o arrasto
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [contenteditable]';

/** Integra a mola até o alvo; devolve true enquanto ainda se move. */
function step(b: Body, dt: number, tx = 0, ty = 0) {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    b.vx += (b.s.k * (tx - b.x) - b.s.c * b.vx) * h;
    b.vy += (b.s.k * (ty - b.y) - b.s.c * b.vy) * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
  }
  const moving =
    Math.abs(tx - b.x) > 0.25 || Math.abs(ty - b.y) > 0.25 || Math.hypot(b.vx, b.vy) > 3;
  if (!moving) Object.assign(b, { x: tx, y: ty, vx: 0, vy: 0 });
  return moving;
}

const inside = (b: Box, x: number, y: number) =>
  x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

type Drag = {
  id: string;
  pointer: boolean;
  /** Ponteiro na tela e onde o card foi pego (relativo ao canto dele). */
  px: number;
  py: number;
  gx: number;
  gy: number;
  /** Altura do ponteiro ao levantar: a página só rola se o gesto seguir para a borda. */
  y0: number;
  reduced: boolean;
  lag: Body;
  trail: { t: number; x: number; y: number }[];
  origin: string[];
  /** Card recém-trocado: ignorado até o ponteiro sair dele (evita troca e destroca). */
  hold?: string;
  /** Ponteiro (relativo ao board) na última troca. */
  at?: { x: number; y: number };
};

type Pending = {
  id: string;
  pointerId: number;
  /** Onde o toque começou e onde está agora. */
  x: number;
  y: number;
  cx: number;
  cy: number;
  touch: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

export type BoardHooks = {
  title: (id: string) => string;
  commit: (order: string[]) => void;
  announce: (text: string) => void;
};

export class BoardMotion {
  board: HTMLElement | null = null;
  slot: HTMLElement | null = null;
  order: string[] = [];
  hooks: BoardHooks = { title: (id) => id, commit: () => {}, announce: () => {} };
  private els = new Map<string, HTMLElement>();
  private bodies = new Map<string, Body>();
  private layout = new Map<string, Box>();
  private before: Map<string, Box> | null = null;
  private slotBody: Body = { x: 0, y: 0, vx: 0, vy: 0, s: MAKE_ROOM };
  private drag: Drag | null = null;
  private pending: Pending | null = null;
  private frame = 0;
  private last = 0;
  private refocus: string | null = null;
  private observer: ResizeObserver | null = null;

  register(id: string, el: HTMLElement | null) {
    const old = this.els.get(id);
    if (old === el) return;
    if (old) this.observer?.unobserve(old);
    if (!el) return void this.els.delete(id);
    this.els.set(id, el);
    this.observer ??= new ResizeObserver(() => this.measure());
    this.observer.observe(el);
  }

  /** Bloqueia rolagem/menu do toque só enquanto um card está levantado. */
  blocking(kind: 'scroll' | 'menu') {
    return kind === 'scroll' ? !!this.drag?.pointer : !!this.drag?.pointer || !!this.pending?.touch;
  }

  private reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private body(id: string) {
    let b = this.bodies.get(id);
    if (!b) this.bodies.set(id, (b = { x: 0, y: 0, vx: 0, vy: 0, s: MAKE_ROOM }));
    return b;
  }

  private grip(id: string) {
    return this.els.get(id)?.querySelector<HTMLElement>('[data-grip]') ?? null;
  }

  /** Posição de layout (sem o transform da mola), relativa ao board. */
  private measure() {
    if (!this.board) return;
    const origin = this.board.getBoundingClientRect();
    for (const [id, el] of this.els) {
      const r = el.getBoundingClientRect();
      const b = this.bodies.get(id);
      this.layout.set(id, {
        x: r.left - origin.left - (b?.x ?? 0),
        y: r.top - origin.top - (b?.y ?? 0),
        w: r.width,
        h: r.height,
      });
    }
  }

  /** FLIP, parte 1: guarda onde cada card está antes de mudar a ordem. */
  capture() {
    this.measure();
    this.before = new Map(this.layout);
  }

  /** FLIP, parte 2: cada card continua onde estava na tela e a mola leva ao lugar novo. */
  private play() {
    const before = this.before;
    this.before = null;
    this.measure();
    if (!before) return;
    const reduced = this.reduced();
    for (const [id, now] of this.layout) {
      const was = before.get(id);
      if (!was || (this.drag?.pointer && this.drag.id === id)) continue;
      const b = this.body(id);
      b.x = reduced ? 0 : b.x + was.x - now.x;
      b.y = reduced ? 0 : b.y + was.y - now.y;
      if (reduced) b.vx = b.vy = 0;
      this.write(id, b);
    }
    this.start();
  }

  private write(id: string, b: Body) {
    const el = this.els.get(id);
    if (el) el.style.transform = b.x || b.y ? `translate3d(${b.x}px, ${b.y}px, 0)` : '';
  }

  private start() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const d = this.drag;
    let moving = !!d?.pointer;
    if (d?.pointer) {
      this.autoscroll(d, dt);
      this.hit(d);
      this.follow(d, dt);
    }
    for (const [id, b] of this.bodies) {
      if (d?.pointer && d.id === id) continue;
      if (step(b, dt)) moving = true;
      else if (b.s === SETTLE) {
        b.s = MAKE_ROOM;
        this.els.get(id)?.removeAttribute('data-settling');
      }
      this.write(id, b);
    }
    this.frame = moving ? requestAnimationFrame(this.tick) : 0;
  };

  /** O card segue o ponteiro, com um leve atraso magnético perto do encaixe. */
  private follow(d: Drag, dt: number) {
    const slot = this.layout.get(d.id);
    if (!slot || !this.board) return;
    const origin = this.board.getBoundingClientRect();
    const rx = d.px - d.gx - origin.left - slot.x;
    const ry = d.py - d.gy - origin.top - slot.y;
    const pull = d.reduced ? 0 : 0.3 * Math.exp(-Math.hypot(rx, ry) / 70);
    step(d.lag, dt, -rx * pull, -ry * pull);
    const b = this.body(d.id);
    b.x = rx + d.lag.x;
    b.y = ry + d.lag.y;
    this.write(d.id, b);
    // O encaixe vazio desliza até o lugar novo.
    const s = this.slotBody;
    if (d.reduced) Object.assign(s, { x: slot.x, y: slot.y });
    else step(s, dt, slot.x, slot.y);
    this.placeSlot(s.x, s.y, slot);
  }

  private placeSlot(x: number, y: number, box: Box) {
    const el = this.slot;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
  }

  private autoscroll(d: Drag, dt: number) {
    const bottom = window.innerHeight - EDGE;
    const pull =
      d.py < EDGE && d.py < d.y0 - 8
        ? -(1 - d.py / EDGE)
        : d.py > bottom && d.py > d.y0 + 8
          ? (d.py - bottom) / EDGE
          : 0;
    if (pull) window.scrollBy(0, Math.sign(pull) * Math.min(1, pull * pull) * 1100 * dt);
  }

  /** Qual card está sob o ponteiro: o levantado assume o lugar dele. */
  private hit(d: Drag) {
    if (!this.board) return;
    const origin = this.board.getBoundingClientRect();
    const x = d.px - origin.left;
    const y = d.py - origin.top;
    if (d.hold && !inside(this.layout.get(d.hold) ?? { x: 0, y: 0, w: 0, h: 0 }, x, y))
      d.hold = undefined;
    if (d.at && Math.hypot(x - d.at.x, y - d.at.y) < 8) return;
    let target = this.order.find((id) => {
      const box = this.layout.get(id);
      return id !== d.id && id !== d.hold && !!box && inside(box, x, y);
    });
    // Abaixo do último card: vai para o fim.
    const last = this.order.at(-1)!;
    const end = this.layout.get(last);
    if (!target && end && last !== d.id && last !== d.hold && y > end.y + end.h) target = last;
    if (!target) return;
    const from = this.order.indexOf(d.id);
    const to = this.order.indexOf(target);
    d.hold = target;
    d.at = { x, y };
    this.reorder(from, to);
  }

  private reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...this.order];
    next.splice(to, 0, ...next.splice(from, 1));
    this.setOrder(next);
  }

  private setOrder(next: string[]) {
    this.capture();
    this.order = next;
    next.forEach((id, i) => this.els.get(id)?.style.setProperty('order', String(i)));
    this.play();
  }

  private position(id: string) {
    return `posição ${this.order.indexOf(id) + 1} de ${this.order.length}`;
  }

  // ——— Ponteiro ———

  pointerDown(e: PointerEvent, id: string) {
    if (this.drag || this.pending || !e.isPrimary || (e.pointerType === 'mouse' && e.button))
      return;
    const target = e.target as Element;
    const grip = !!target.closest('[data-grip]');
    if (!grip && (target.closest(INTERACTIVE) || onScrollbar(e))) return;
    const touch = e.pointerType !== 'mouse';
    const [x, y] = [e.clientX, e.clientY];
    this.pending = { id, pointerId: e.pointerId, x, y, cx: x, cy: y, touch };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    if (grip) {
      e.preventDefault();
      this.lift(id, e.clientX, e.clientY);
    } else if (touch) {
      this.pending.timer = setTimeout(() => {
        const p = this.pending;
        if (p) this.lift(p.id, p.cx, p.cy);
      }, LONG_PRESS_MS);
    }
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pending;
    if (!p || e.pointerId !== p.pointerId) return;
    if (!this.drag) {
      Object.assign(p, { cx: e.clientX, cy: e.clientY });
      const far = Math.hypot(p.cx - p.x, p.cy - p.y);
      if (p.touch) {
        if (far > 10) this.release(); // é rolagem
      } else if (far > 4) this.lift(p.id, p.x, p.y);
      if (!this.drag) return;
    }
    const d = this.drag;
    d.px = e.clientX;
    d.py = e.clientY;
    const t = performance.now();
    d.trail = [...d.trail.filter((s) => t - s.t < 100), { t, x: d.px, y: d.py }];
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pending?.pointerId) return;
    if (this.drag) {
      // O clique que o navegador dispara ao soltar não deve abrir nada embaixo do card.
      const swallow = (c: Event) => c.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      this.drop(false);
    }
    this.release();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.drag?.pointer) return;
    e.preventDefault();
    this.drop(true);
    this.release();
  };

  private release() {
    clearTimeout(this.pending?.timer);
    this.pending = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
  }

  private lift(id: string, x: number, y: number, pointer = true) {
    const el = this.els.get(id);
    if (!el || !this.board) return;
    // A entrada da página (reveal) também anima transform: termina antes de assumir o card.
    for (const a of this.board.getAnimations({ subtree: true }))
      if (a instanceof CSSAnimation && a.animationName === 'reveal') a.finish();
    this.measure();
    const r = el.getBoundingClientRect();
    this.drag = {
      id,
      pointer,
      px: x,
      py: y,
      gx: x - r.left,
      gy: y - r.top,
      y0: y,
      reduced: this.reduced(),
      lag: { x: 0, y: 0, vx: 0, vy: 0, s: MAGNET },
      trail: [{ t: performance.now(), x, y }],
      origin: [...this.order],
    };
    el.setAttribute('data-lifted', '');
    el.removeAttribute('data-settling');
    this.grip(id)?.setAttribute('aria-pressed', 'true');
    this.board.setAttribute('data-dragging', '');
    if (pointer) {
      // O card mantém o tamanho enquanto está na mão; os vizinhos fecham a linha em volta.
      el.style.transition = '';
      el.style.flex = `0 0 ${r.width}px`;
      el.style.height = `${r.height}px`;
      document.documentElement.setAttribute('data-dash-dragging', '');
      window.getSelection()?.removeAllRanges();
      const slot = this.layout.get(id)!;
      Object.assign(this.slotBody, { x: slot.x, y: slot.y, vx: 0, vy: 0 });
      this.slot?.style.setProperty('transition', 'none');
      this.placeSlot(slot.x, slot.y, slot);
      void this.slot?.offsetWidth;
      this.slot?.style.removeProperty('transition');
      this.slot?.setAttribute('data-on', '');
      if (this.pending?.touch) navigator.vibrate?.(8);
    }
    this.hooks.announce(
      `${this.hooks.title(id)} levantado, ${this.position(id)}.` +
        (pointer ? '' : ' Use as setas para mover, espaço para soltar e Esc para cancelar.'),
    );
    this.start();
  }

  private drop(cancel: boolean) {
    const d = this.drag;
    const el = d && this.els.get(d.id);
    if (!d || !el || !this.board) return;
    this.drag = null;
    const b = this.body(d.id);
    if (d.pointer) {
      // Solta com o embalo do gesto: a mola parte da velocidade do dedo/mouse.
      const now = performance.now();
      const trail = d.trail.filter((s) => now - s.t < 100);
      const [a, z] = [trail[0], trail.at(-1)];
      const dt = a && z ? (z.t - a.t) / 1000 : 0;
      const v = a && z && dt > 0.01 ? { x: (z.x - a.x) / dt, y: (z.y - a.y) / dt } : { x: 0, y: 0 };
      const cap = Math.min(1, 2000 / (Math.hypot(v.x, v.y) || 1));
      b.vx = v.x * cap;
      b.vy = v.y * cap;
      this.unfix(el);
      document.documentElement.removeAttribute('data-dash-dragging');
      this.slot?.removeAttribute('data-on');
    }
    b.s = SETTLE;
    if (this.reduced()) Object.assign(b, { x: 0, y: 0, vx: 0, vy: 0 });
    this.write(d.id, b);
    el.removeAttribute('data-lifted');
    el.setAttribute('data-settling', '');
    this.grip(d.id)?.setAttribute('aria-pressed', 'false');
    this.board.removeAttribute('data-dragging');
    const title = this.hooks.title(d.id);
    if (cancel) {
      this.setOrder(d.origin);
      this.hooks.announce(`Movimento cancelado. ${title} voltou para a ${this.position(d.id)}.`);
    } else {
      this.hooks.announce(`${title} solto na ${this.position(d.id)}.`);
      if (d.origin.join() !== this.order.join()) {
        if (!d.pointer) this.refocus = d.id;
        this.capture();
        this.hooks.commit([...this.order]);
      }
    }
    this.start();
  }

  /** Devolve o tamanho natural ao card solto, animando a largura/altura até lá. */
  private unfix(el: HTMLElement) {
    const [w0, h0] = [el.offsetWidth, el.offsetHeight];
    el.style.flex = el.style.height = '';
    const [w1, h1] = [el.offsetWidth, el.offsetHeight];
    if (this.reduced() || (Math.abs(w1 - w0) < 1 && Math.abs(h1 - h0) < 1)) return;
    el.style.flex = `0 0 ${w0}px`;
    el.style.height = `${h0}px`;
    void el.offsetWidth;
    el.style.transition = 'flex-basis 0.45s var(--ease-out), height 0.45s var(--ease-out)';
    el.style.flexBasis = `${w1}px`;
    el.style.height = `${h1}px`;
    setTimeout(() => {
      if (el.hasAttribute('data-lifted')) return;
      el.style.transition = el.style.flex = el.style.height = '';
    }, 500);
  }

  // ——— Teclado (no puxador) ———

  key(e: KeyboardEvent, id: string) {
    const d = this.drag;
    if (!d) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      this.lift(id, 0, 0, false);
      return;
    }
    if (d.id !== id || d.pointer) return;
    const i = this.order.indexOf(id);
    const to: Record<string, number> = {
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      Home: 0,
      End: this.order.length - 1,
    };
    if (e.key in to) {
      e.preventDefault();
      const j = Math.max(0, Math.min(this.order.length - 1, to[e.key]!));
      if (j === i) return;
      this.reorder(i, j);
      this.hooks.announce(`${this.hooks.title(id)}: ${this.position(id)}.`);
      this.reveal(id);
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      this.drop(e.key === 'Escape');
    }
  }

  /** Sair do puxador com o card levantado solta onde está. */
  blur(id: string) {
    if (this.drag?.id === id && !this.drag.pointer) this.drop(false);
  }

  /** Rola até o lugar novo do card movido pelo teclado, se ele saiu da tela. */
  private reveal(id: string) {
    const box = this.layout.get(id);
    if (!box || !this.board) return;
    const top = this.board.getBoundingClientRect().top + box.y;
    const pad = 96;
    const delta =
      top < pad ? top - pad : top + box.h > innerHeight - pad ? top + box.h - innerHeight + pad : 0;
    if (delta) window.scrollBy({ top: delta, behavior: this.reduced() ? 'instant' : 'smooth' });
  }

  // ——— React ———

  /**
   * Depois que o React aplica uma ordem (ao soltar, ao restaurar ou ao abrir): o DOM já está
   * na ordem certa, então `style.order` sai; o que foi capturado antes anima até o lugar novo.
   */
  sync(order: string[]) {
    this.order = [...order];
    for (const el of this.els.values()) el.style.order = '';
    if (!this.before) return this.measure();
    // Mover nós no DOM reinicia animações CSS (entrada, gráficos): termina-as antes de pintar.
    for (const a of this.board?.getAnimations({ subtree: true }) ?? [])
      try {
        a.finish();
      } catch {
        // animação infinita: não tem fim
      }
    this.play();
    if (this.refocus) this.grip(this.refocus)?.focus({ preventScroll: true });
    this.refocus = null;
  }

  destroy() {
    this.release();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    this.observer = null;
    document.documentElement.removeAttribute('data-dash-dragging');
  }
}

/** Clique na barra de rolagem de uma área rolável (ex.: tabela larga) não começa arrasto. */
function onScrollbar(e: PointerEvent) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  const scrolls = t.scrollWidth > t.clientWidth || t.scrollHeight > t.clientHeight;
  return scrolls && (e.offsetX > t.clientWidth || e.offsetY > t.clientHeight);
}
