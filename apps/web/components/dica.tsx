'use client';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';

/** O que o alvo recebe: a ligação acessível e os eventos que abrem e fecham a dica. */
export type AlvoDaDica = {
  'aria-describedby': string;
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
};

const MARGEM = 8;
const DISTANCIA = 8;
const TOQUE_MS = 2500;

/**
 * Dica curta ao passar o mouse, no foco do teclado e no toque (some sozinha no celular), no visual do
 * tooltip do trilho (`.side-tip`). Fica na camada de cima do navegador (`popover`), acima de janelinha,
 * e nunca passa da borda da tela: acima do alvo, ou abaixo se não couber. O texto também é a descrição
 * acessível do alvo (`aria-describedby`), aberta ou não.
 */
export function ComDica({
  texto,
  children,
}: {
  texto: string;
  children: (alvo: AlvoDaDica) => ReactElement;
}) {
  const id = useId();
  const dica = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLElement | null>(null);
  const toque = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aberta, setAberta] = useState(false);

  const abrir = useCallback((el: HTMLElement) => {
    alvo.current = el;
    setAberta(true);
  }, []);
  const fechar = useCallback(() => setAberta(false), []);

  // Posição medida antes de pintar: sem pulo nem corte na borda.
  useLayoutEffect(() => {
    const d = dica.current;
    const el = alvo.current;
    if (!d || !el) return;
    // Sem `popover` (navegador antigo) a dica fica `position: fixed` comum, mostrada pelo `data-aberta`.
    const camada = typeof d.showPopover === 'function';
    if (!aberta) {
      if (camada && d.matches(':popover-open')) d.hidePopover();
      return;
    }
    if (camada && !d.matches(':popover-open')) d.showPopover();
    const r = el.getBoundingClientRect();
    const { width, height } = d.getBoundingClientRect();
    const acima = r.top - height - DISTANCIA;
    const top = acima >= MARGEM ? acima : r.bottom + DISTANCIA;
    const centro = r.left + r.width / 2 - width / 2;
    const left = Math.min(Math.max(centro, MARGEM), window.innerWidth - width - MARGEM);
    d.style.top = `${Math.round(top)}px`;
    d.style.left = `${Math.round(left)}px`;
    d.dataset.lado = top >= r.bottom ? 'baixo' : 'cima';
  }, [aberta]);

  // Rolar ou Esc fecham; o toque fecha sozinho.
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    addEventListener('scroll', fechar, true);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('scroll', fechar, true);
      removeEventListener('keydown', esc);
    };
  }, [aberta, fechar]);
  useEffect(() => () => void (toque.current && clearTimeout(toque.current)), []);

  return (
    <>
      {children({
        'aria-describedby': id,
        onPointerEnter: (e) => e.pointerType === 'mouse' && abrir(e.currentTarget),
        onPointerLeave: (e) => e.pointerType === 'mouse' && fechar(),
        onPointerDown: (e) => {
          if (e.pointerType === 'mouse') return;
          abrir(e.currentTarget);
          if (toque.current) clearTimeout(toque.current);
          toque.current = setTimeout(fechar, TOQUE_MS);
        },
        onFocus: (e) => e.currentTarget.matches(':focus-visible') && abrir(e.currentTarget),
        onBlur: fechar,
      })}
      <div
        ref={dica}
        id={id}
        role="tooltip"
        popover="manual"
        className="dica-tip"
        data-aberta={aberta || undefined}
      >
        {texto}
      </div>
    </>
  );
}
