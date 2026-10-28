'use client';
import { useEffect, useRef, useState } from 'react';

const DURATION = 900;
// Desacelera no fim, como os contadores da Apple.
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/**
 * Número que conta até o valor ao aparecer e ao mudar (ex.: troca de período). Com
 * "reduzir movimento" mostra o valor direto. `format` recebe o número já arredondado.
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString('pt-BR'),
}: {
  value: number;
  format?: (n: number) => string;
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
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / DURATION);
      const v = Math.round(start + (value - start) * easeOutQuart(t));
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}
