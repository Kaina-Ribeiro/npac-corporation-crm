'use client';
import { TIPO_INSCRICAO_LABEL, type InscricaoItem } from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { Rostos } from './ui';

/**
 * Busca do topo: nome por trecho, telefone e e-mail só completos (índice cego). O termo vai no
 * corpo do POST, nunca na URL. Resultados em lista, no padrão do Ctrl+K do CRM.
 */
export function BuscaModulo() {
  const router = useRouter();
  const lista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<InscricaoItem[] | null>(null);
  const [sel, setSel] = useState(0);
  const pedido = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    const n = ++pedido.current;
    if (t.length < 2) {
      setItens(null);
      return;
    }
    const espera = setTimeout(() => {
      clientApi<{ itens: InscricaoItem[] }>('/api/mentoria/busca', 'POST', { termo: t })
        .then((r) => {
          if (n !== pedido.current) return;
          setItens(r.itens);
          setSel(0);
        })
        .catch(() => n === pedido.current && setItens([]));
    }, 220);
    return () => clearTimeout(espera);
  }, [termo]);

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setItens(null);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, []);

  function abrir(item: InscricaoItem) {
    setTermo('');
    setItens(null);
    router.push(`/acompanhamento/ficha/${item.id}`);
  }

  return (
    <div className="search" ref={raiz}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="field w-full text-ink dark:!bg-white/10"
        type="search"
        aria-label="Buscar mentorados"
        aria-controls={lista}
        placeholder="Nome, fone com DDD ou e-mail"
        autoComplete="off"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setItens(null);
          if (!itens?.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, itens.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          }
          if (e.key === 'Enter') abrir(itens[sel]!);
        }}
      />
      {itens && (
        <div id={lista} role="listbox" aria-label="Resultados" className="busca-res card">
          {itens.length === 0 && (
            <p className="busca-vazia">
              Nada encontrado. Telefone e e-mail precisam estar completos, com DDD.
            </p>
          )}
          {itens.map((i, k) => (
            <div
              key={i.id}
              role="option"
              aria-selected={k === sel}
              className={`busca-item ${k === sel ? 'sel' : ''}`}
              onPointerEnter={() => setSel(k)}
              onClick={() => abrir(i)}
            >
              <Rostos pessoas={i.pessoas} />
              <div className="min-w-0">
                <b className="truncate">{i.nome}</b>
                <small>
                  {TIPO_INSCRICAO_LABEL[i.tipo]}, {i.mentoria}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
