'use client';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { BoardMotion } from '@/lib/board-motion';
import { DASH_COOKIE_PATH, mergeOrder, serializeOrder } from '@/lib/dashboard-layout';

/** Largura do card na linha (no celular todos ocupam a linha inteira; ver `.dash-item`). */
export type CardSize = 'kpi' | 'wide' | 'narrow' | 'half';
export type BoardCard = { id: string; title: string; size: CardSize; node: ReactNode };

type Board = {
  order: string[];
  motion: BoardMotion;
  customized: boolean;
  commit: (order: string[]) => void;
  restore: () => void;
};
const BoardContext = createContext<Board | null>(null);

function readCookie(name: string) {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

/** Salva a ordem no cookie da pessoa; a ordem padrão apaga o cookie. */
function persist(cookie: string, order: string[], defaults: readonly string[]) {
  if (!cookie) return;
  const value = serializeOrder(order);
  const isDefault = value === serializeOrder(defaults);
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${cookie}=${isDefault ? '' : value}; Path=${DASH_COOKIE_PATH}; Max-Age=${isDefault ? 0 : 31_536_000}; SameSite=Lax${secure}`;
}

/** Ordem dos cards do dashboard, compartilhada entre o board e o botão de restaurar. */
export function BoardProvider({
  defaults,
  saved,
  cookie,
  children,
}: {
  defaults: string[];
  saved?: string;
  cookie: string;
  children: ReactNode;
}) {
  const [order, setOrder] = useState(() => mergeOrder(saved, defaults));
  const [motion] = useState(() => new BoardMotion());
  // Voltar no navegador reaproveita a página antiga: ao montar, o cookie tem a ordem mais
  // recente. Só na montagem (sem cookie, por exemplo bloqueado, a ordem da sessão continua).
  const mounted = useRef({ cookie, defaults });
  useLayoutEffect(() => {
    const { cookie, defaults } = mounted.current;
    const now = mergeOrder(readCookie(cookie), defaults);
    setOrder((prev) => (serializeOrder(prev) === serializeOrder(now) ? prev : now));
  }, []);
  const board = useMemo<Board>(
    () => ({
      order,
      motion,
      customized: serializeOrder(order) !== serializeOrder(defaults),
      commit(next) {
        setOrder(next);
        persist(cookie, next, defaults);
      },
      restore() {
        motion.capture();
        setOrder([...defaults]);
        persist(cookie, defaults, defaults);
        motion.hooks.announce('Ordem padrão dos cards restaurada.');
      },
    }),
    [order, motion, cookie, defaults],
  );
  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

/** Aparece só quando a pessoa mudou a ordem dos cards. */
export function RestoreOrder() {
  const board = useContext(BoardContext);
  if (!board?.customized) return null;
  return (
    <button
      type="button"
      onClick={() => {
        board.restore();
        // O botão some: o foco vai para o primeiro card, não para o topo da página.
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('.dash-board [data-grip]')?.focus(),
        );
      }}
      className="dash-pop inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/5 px-3.5 text-sm font-semibold whitespace-nowrap text-ink2 transition-colors hover:text-ink dark:bg-white/10"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path
          d="M2.5 8a5.5 5.5 0 1 0 1.7-3.98M2.5 2.5v3.5H6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Ordem padrão
    </button>
  );
}

/**
 * Cards do dashboard que a pessoa reorganiza: arrasta com mouse (puxador ou o próprio card),
 * toque (segura o card ou arrasta o puxador) ou teclado (espaço, setas, espaço/Esc).
 */
export function DashboardBoard({ cards, style }: { cards: BoardCard[]; style?: CSSProperties }) {
  const board = useContext(BoardContext)!;
  const { order, motion } = board;
  const help = useId();
  const live = useRef<HTMLParagraphElement>(null);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Refs estáveis por card: o motor observa o tamanho de cada um.
  const refs = useMemo(() => new Map<string, (el: HTMLDivElement | null) => void>(), []);
  const refFor = (id: string) => {
    let ref = refs.get(id);
    if (!ref) refs.set(id, (ref = (el) => motion.register(id, el)));
    return ref;
  };

  useLayoutEffect(() => {
    motion.hooks = {
      title: (id) => byId.get(id)?.title ?? 'Card',
      commit: board.commit,
      announce: (text) => {
        if (live.current) live.current.textContent = text;
      },
    };
  });
  useLayoutEffect(() => motion.sync(order), [motion, order]);

  useEffect(() => {
    const el = motion.board;
    if (!el) return;
    // Registrados antes do toque começar, para poderem impedir a rolagem com o card na mão.
    const scroll = (e: Event) => motion.blocking('scroll') && e.preventDefault();
    const menu = (e: Event) => motion.blocking('menu') && e.preventDefault();
    el.addEventListener('touchmove', scroll, { passive: false });
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('touchmove', scroll);
      el.removeEventListener('contextmenu', menu);
      motion.destroy();
    };
  }, [motion]);

  return (
    <>
      <p id={help} className="sr-only">
        Para mudar a ordem pelo teclado: espaço levanta o card, as setas movem, espaço solta e Esc
        cancela. Com mouse, arraste o card; no celular, toque e segure.
      </p>
      <p ref={live} aria-live="assertive" className="sr-only" />
      <div
        ref={(el) => {
          motion.board = el;
        }}
        className="dash-board dash-lift liquid reveal-grid"
        style={style}
      >
        {/* Primeiro filho: fica por baixo dos cards que deslizam por cima dele. */}
        <div
          aria-hidden="true"
          className="dash-slot"
          ref={(el) => {
            motion.slot = el;
          }}
        />
        {order.map((id) => {
          const card = byId.get(id);
          if (!card) return null;
          return (
            <div
              key={id}
              ref={refFor(id)}
              data-card={id}
              data-size={card.size}
              className="dash-item"
              onPointerDown={(e) => motion.pointerDown(e.nativeEvent, id)}
            >
              <button
                type="button"
                data-grip
                className="dash-grip"
                aria-label={`Mover card ${card.title}`}
                aria-describedby={help}
                onKeyDown={(e) => motion.key(e.nativeEvent, id)}
                onBlur={() => motion.blur(id)}
              />
              {card.node}
            </div>
          );
        })}
      </div>
    </>
  );
}
