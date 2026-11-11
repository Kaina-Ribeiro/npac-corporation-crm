import Link from 'next/link';
import { button } from '@/lib/button';
import { ICONES, Icone } from './ui';

/** Aba que entra numa próxima etapa. Até a Fila existir (Parte 5), leva aos Mentorados. */
export function EmBreve() {
  return (
    <section className="card vazio">
      <span className="i">
        <Icone d={ICONES.pmes} />
      </span>
      <h1>Esta aba chega em breve</h1>
      <p>
        Ela entra numa próxima etapa do sistema. Por enquanto, siga pelas fichas dos mentorados.
      </p>
      <Link className={button} href="/acompanhamento/mentorados">
        Ir para Mentorados
      </Link>
    </section>
  );
}
