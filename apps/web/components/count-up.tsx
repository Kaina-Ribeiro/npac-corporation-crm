'use client';
import { useEffect, useRef, useState } from 'react';

const DURATION = 1600;
// Curva suave: acelera de leve e assenta devagar (easeOutCubic).
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Número que conta até o valor ao aparecer e ao mudar (ex.: troca de período). Com
 * "reduzir movimento" mostra o valor direto. `format` recebe o número já arredondado;
 * `delay` sincroniza com a entrada do card (só na primeira contagem).
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString('pt-BR'),
  delay = 0,
}: {
  value: number;
  format?: (n: number) => string;
  delay?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now() + (start === 0 ? delay : 0);
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / DURATION));
      const v = Math.round(start + (value - start) * ease(t));
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, delay]);

  return <>{format(shown)}</>;
}
