'use client';
import {
  naoVistas,
  novidadesPara,
  ULTIMA_NOVIDADE,
  type IconeNovidade,
  type Novidade,
  type PessoaNovidades,
  type TipoNovidade,
} from '@npac/shared/novidades';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { closeWithMotion } from '@/lib/dialog-motion';

/** O que o layout passa (servidor → cliente): quem é, a última vista e a versão no ar. */
export type NovidadesDados = PessoaNovidades & { vista: string | null; versao: string };

export type JanelaProps = {
  /** `novas`: o que a pessoa ainda não viu; `todas`: o histórico do "O que mudou". */
  modo: 'novas' | 'todas';
  dados: NovidadesDados;
  onClose: () => void;
};

const TIPO: Record<TipoNovidade, string> = {
  novo: 'Novo',
  melhorou: 'Melhorou',
  corrigido: 'Corrigido',
  acao: 'Faça isso',
};

// Traços dos ícones do protótipo aprovado (`docs/prototipos/novidades/index.html`): constantes.
const ICONE: Record<IconeNovidade, string> = {
  versao:
    '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/><path d="M19 3v4M17 5h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.4"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
  send: '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4.5-4.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  tablet: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M9 6v12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
};

/** "2026-11-25" → "25/11". */
const dia = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const mudancas = (n: number) => (n === 1 ? '1 mudança' : `${n} mudanças`);

/** Agrupa por data (S1: o número final só existe depois do merge), na ordem do arquivo. */
function porData(lista: readonly Novidade[]): [string, Novidade[]][] {
  const grupos = new Map<string, Novidade[]>();
  for (const n of lista) grupos.set(n.data, [...(grupos.get(n.data) ?? []), n]);
  return [...grupos];
}

// Uma vez por carga: fechar de novo (histórico) não repete o pedido.
let marcado = false;

/** "Já vi" na conta (D2) e some o ponto dourado do rodapé (`html[data-novidades-vistas]`). */
function marcarVisto(vista: string | null) {
  document.documentElement.dataset.novidadesVistas = '';
  if (marcado || vista === ULTIMA_NOVIDADE) return;
  marcado = true;
  // keepalive: o link "Abrir" navega logo em seguida.
  void fetch('/api/me/novidades/vista', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ate: ULTIMA_NOVIDADE }),
    keepalive: true,
  }).then(
    (r) => {
      if (!r.ok) marcado = false;
    },
    () => {
      marcado = false;
    },
  );
}

function Item({ n, onAbrir }: { n: Novidade; onAbrir: () => void }) {
  const seta = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
  return (
    <article className="nov-item" data-tipo={n.tipo}>
      <span
        className="nov-ic"
        aria-hidden="true"
        // Constante do arquivo acima, nunca texto de fora.
        dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICONE[n.icone]}</svg>` }}
      />
      <div className="min-w-0">
        <div className="nov-it-t">
          <h3>{n.titulo}</h3>
          <span className="nov-tipo">{TIPO[n.tipo]}</span>
        </div>
        <p>{n.texto}</p>
        {n.href ? (
          <Link href={n.href} prefetch={false} className="nov-onde" onClick={onAbrir}>
            {n.onde}
            {seta}
          </Link>
        ) : (
          <span className="nov-onde nov-onde-texto">{n.onde}</span>
        )}
      </div>
    </article>
  );
}

/**
 * Janela "O que mudou no CRM" (NPAC-77, protótipo `docs/prototipos/novidades/`, decisões 1A–4A e
 * S1–S3). Novas agrupadas por data, com o que pede uma ação ("Faça isso") no topo, em "Precisa de
 * você"; o histórico lista tudo o que a pessoa vê. Entendi, X, Esc, clique fora e o link de um item
 * marcam "já vi". No celular é uma folha de baixo (`.nov` em `globals.css`).
 */
export default function NovidadesJanela({ modo: inicial, dados, onClose }: JanelaProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    ok.current?.focus();
  }, []);

  const historico = modo === 'todas';
  const fechar = () => {
    marcarVisto(dados.vista);
    closeWithMotion(ref.current, onClose);
  };
  // O link navega: fecha já (sem esperar a saída), para a tela nova não abrir atrás da janela.
  const abrir = () => {
    marcarVisto(dados.vista);
    ref.current?.close();
    onClose();
  };

  const lista = historico ? novidadesPara(dados) : naoVistas(dados, dados.vista);
  const acoes = historico ? [] : lista.filter((n) => n.tipo === 'acao');
  const grupos = porData(lista.filter((n) => !acoes.includes(n)));
  const datas = new Set(lista.map((n) => n.data)).size;
  const comCabeca = historico || datas > 1 || acoes.length > 0;
  const ultimaData = lista[0]?.data;

  const subtitulo = historico
    ? `Você está na versão ${dados.versao}. Aqui aparece só o que mexe no seu trabalho.`
    : datas > 1
      ? `${mudancas(lista.length)} em ${datas} atualizações desde a sua última visita.`
      : `Atualização de ${ultimaData ? dia(ultimaData) : ''}. ${mudancas(lista.length)} no seu trabalho.`;

  return (
    <dialog
      ref={ref}
      className="dlg nov"
      aria-labelledby="nov-titulo"
      aria-describedby="nov-sub"
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      onClick={(e) => {
        // Clique no véu (fora da janela) fecha.
        const r = ref.current?.getBoundingClientRect();
        const dentro =
          r &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (e.target === ref.current && !dentro) fechar();
      }}
    >
      <header className="nov-h">
        <span className="nov-eyebrow">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
            <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
          </svg>
          {historico ? 'Histórico' : 'Novidades'}
        </span>
        <h2 id="nov-titulo">{historico ? 'Todas as atualizações' : 'O que mudou no CRM'}</h2>
        <p id="nov-sub">{subtitulo}</p>
        <button type="button" className="nov-x" aria-label="Fechar" onClick={fechar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="nov-b" ref={corpo}>
        {acoes.length > 0 && (
          <section aria-label="Precisa de você">
            <div className="nov-vhead">Precisa de você</div>
            {acoes.map((n) => (
              <Item key={n.id} n={n} onAbrir={abrir} />
            ))}
          </section>
        )}
        {grupos.map(([data, itens]) => (
          <section key={data} aria-label={`Atualização de ${dia(data)}`}>
            {comCabeca && <div className="nov-vhead">Atualização de {dia(data)}</div>}
            {itens.map((n) => (
              <Item key={n.id} n={n} onAbrir={abrir} />
            ))}
          </section>
        ))}
        {lista.length === 0 && <p className="nov-vazio">Nada por aqui ainda.</p>}
      </div>
      <footer className="nov-f">
        {!historico && (
          <button
            type="button"
            className="nov-link"
            onClick={() => {
              marcarVisto(dados.vista);
              setModo('todas');
              corpo.current?.scrollTo({ top: 0 });
            }}
          >
            Ver versões anteriores
          </button>
        )}
        <button type="button" ref={ok} className="nov-ok" onClick={fechar}>
          {historico ? 'Fechar' : 'Entendi'}
        </button>
      </footer>
    </dialog>
  );
}
