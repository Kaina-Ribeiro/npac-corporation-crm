'use client';
import { parseData, type FichaDetalhe, type MidiaDTO } from '@npac/shared/mentoria';
import { useState } from 'react';
import { EnviarArquivo, MidiaCartao } from './midia';
import { Topicos } from './ficha-lado-a-lado';

/** Campo discreto (`.campo-quieto` em globals.css): sem caixa em repouso, cresce com o texto. */
const quieto = 'campo-quieto';
const legenda = 'block px-2.5 text-[11px] font-semibold tracking-[0.06em] text-ink3 uppercase';
const legendaFim = `${legenda} !text-emerald-700 dark:!text-emerald-300`;
/** Vazio some da impressão (`.campo-vazio` em `@media print`). */
const vazio = (...v: string[]) => (v.some((x) => x.trim()) ? '' : 'campo-vazio');

/** Campo que guarda o texto local e salva ao sair, só se mudou (regra 2). */
export function useCampo(inicial: string | null, salvar: (v: string | null) => void) {
  const [v, setV] = useState(inicial ?? '');
  const [base, setBase] = useState(inicial ?? '');
  return {
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: () => {
      if (v.trim() === base.trim()) return;
      setBase(v);
      salvar(v.trim() || null);
    },
  };
}
export type Campo = ReturnType<typeof useCampo>;

type Salvar = (v: string | null) => void;

export type FichaLinhaProps = {
  f: FichaDetalhe;
  midias: MidiaDTO[];
  /** Campos do topo ficam na ficha: o cabeçalho lê o tempo e o texto sobrevive à troca de visão. */
  campos: { dataInicio: Campo; notasIni: Campo; notasAtual: Campo; tempo: Campo };
  anexar: (
    dono: 'ficha-antes' | 'ficha-depois' | 'conquista',
    donoId: string,
    arquivo: File,
  ) => Promise<void>;
  tirar: (m: MidiaDTO) => void;
  novaConquista: () => void;
  evolucaoSalvar: (chave: string, lado: 'antes' | 'depois') => Salvar;
  conquistaSalvar: (id: string, campo: 'data' | 'descricao') => Salvar;
  onRemoverConquista: (id: string) => void;
};

const estrela = (
  <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
);

function Seta({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-3.5 flex-none text-ink3 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Um ponto da linha vertical: nó (número ou ícone) no fio à esquerda, título e subtítulo na
 * mesma linha. `tom` dá a cor: início dourado, meio neutro, fim verde (fio em degradê no CSS).
 */
function NoLinha({
  titulo,
  sub,
  tom,
  marca,
  children,
}: {
  titulo: string;
  sub: string;
  tom: 'inicio' | 'meio' | 'fim';
  marca: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="linha-ponto flex flex-col gap-3" aria-label={titulo} data-tom={tom}>
      <span className="linha-no" aria-hidden="true">
        {marca}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg leading-7 font-bold tracking-[-0.02em]">{titulo}</h2>
        <small className="text-xs text-ink3">{sub}</small>
      </div>
      {children}
    </section>
  );
}

/** Foto de antes/depois em miniatura (96 px) com o envio atual. */
function Miniatura({
  foto,
  rotulo,
  onEnviar,
  onTirar,
}: {
  foto: MidiaDTO | undefined;
  rotulo: string;
  onEnviar: (a: File) => Promise<void>;
  onTirar: (m: MidiaDTO) => void;
}) {
  return foto ? (
    <MidiaCartao m={foto} rotulo={rotulo} altura="h-24" onRemover={() => onTirar(foto)} />
  ) : (
    <div className="no-print">
      <EnviarArquivo
        rotulo={`Enviar ${rotulo}`}
        aceita="image/jpeg,image/png,image/webp"
        altura="h-24"
        texto={
          <>
            <span className="@sm:hidden">{`Enviar ${rotulo} (até 20 MB)`}</span>
            <span className="hidden flex-col text-xs leading-4 @sm:flex">
              Foto
              <small className="text-[10px] font-normal text-ink3">até 20 MB</small>
            </span>
          </>
        }
        onArquivo={onEnviar}
      />
    </div>
  );
}

/**
 * Visão "Linha do tempo" da ficha (Módulo 2): uma linha vertical do Momento inicial ao Depois da
 * mentoria. Edição direta nos campos, salva ao sair pela fila (version da ficha, D5). Fotos e
 * mídias com "×" que remove na hora.
 */
export function FichaLinha({
  f,
  midias,
  campos: { dataInicio, notasIni, notasAtual, tempo },
  anexar,
  tirar,
  novaConquista,
  evolucaoSalvar,
  conquistaSalvar,
  onRemoverConquista,
}: FichaLinhaProps) {
  const dataRuim = !!dataInicio.value.trim() && !parseData(dataInicio.value).data;
  const midiaDe = (tipo: string, dono: string) =>
    midias.filter((m) => m.donoTipo === tipo && m.donoId === dono);
  const fotoAntes = midiaDe('FICHA_ANTES', f.id)[0] ?? midiaDe('ficha-antes', f.id)[0];
  const fotoDepois = midiaDe('FICHA_DEPOIS', f.id)[0] ?? midiaDe('ficha-depois', f.id)[0];

  return (
    <div role="tabpanel" aria-label="Linha do tempo">
      <div className="linha-rail @container flex flex-col">
        <NoLinha
          tom="inicio"
          marca="1"
          titulo="Momento inicial"
          sub={`Como chegou · ${f.dataInicioTexto ?? 'sem data'}`}
        >
          <div className="glass-card flex flex-col gap-4 p-4 @sm:flex-row @2xl:p-5">
            <div className="flex flex-col gap-2 @sm:w-24 @sm:flex-none">
              <Miniatura
                foto={fotoAntes}
                rotulo="foto de antes"
                onEnviar={(a) => anexar('ficha-antes', f.id, a)}
                onTirar={tirar}
              />
              <div className={`flex flex-col gap-0.5 @sm:-mx-2.5 ${vazio(dataInicio.value)}`}>
                <span className={legenda} aria-hidden="true">
                  Início
                </span>
                <input
                  aria-label="Data de início"
                  placeholder="DD/MM/AAAA"
                  inputMode="numeric"
                  aria-invalid={dataRuim || undefined}
                  className={`${quieto} tabular-nums`}
                  {...dataInicio}
                />
              </div>
            </div>
            <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${vazio(notasIni.value)}`}>
              <span className={legenda} aria-hidden="true">
                Notas livres
              </span>
              <textarea
                aria-label="Notas do momento inicial"
                placeholder="Adicionar…"
                className={quieto}
                {...notasIni}
              />
              <ComoFica notas={notasIni.value} />
              <span className="no-print px-2.5 text-xs text-ink3">
                Profissão, como conheceu a mentoria, o que buscava, disciplina, comunicação, sonhos,
                se guardava ou investia dinheiro. Cada linha (cada Enter) vira um tópico;
                &quot;Rótulo: texto&quot; destaca o rótulo. Salva ao sair do campo.
              </span>
            </div>
          </div>
        </NoLinha>

        <NoLinha
          tom="meio"
          marca="2"
          titulo="Os 4 pilares"
          sub="Fé, saúde, dinheiro e relacionamentos · antes e hoje"
        >
          <div className="grid gap-3 @xl:grid-cols-2">
            {f.pilares.map((p) => (
              <Pilar
                key={p.chave}
                p={p}
                onAntes={evolucaoSalvar(p.chave, 'antes')}
                onDepois={evolucaoSalvar(p.chave, 'depois')}
              />
            ))}
          </div>
        </NoLinha>

        <NoLinha
          tom="meio"
          marca="3"
          titulo="Evolução"
          sub="Antes → depois · valores como vieram da fonte"
        >
          <div className="glass-card overflow-hidden">
            <ul className="divide-y divide-line">
              {f.evolucao.map((e) => (
                <Evolucao
                  key={e.chave}
                  e={e}
                  onAntes={evolucaoSalvar(e.chave, 'antes')}
                  onDepois={evolucaoSalvar(e.chave, 'depois')}
                />
              ))}
            </ul>
          </div>
        </NoLinha>

        <NoLinha tom="fim" marca="4" titulo="Depois da mentoria" sub="Como está agora">
          <div className="glass-card flex flex-col gap-4 p-4 @sm:flex-row @2xl:p-5">
            <div className="flex flex-col gap-2 @sm:w-24 @sm:flex-none">
              <Miniatura
                foto={fotoDepois}
                rotulo="foto de depois"
                onEnviar={(a) => anexar('ficha-depois', f.id, a)}
                onTirar={tirar}
              />
              <div className={`flex flex-col gap-0.5 @sm:-mx-2.5 ${vazio(tempo.value)}`}>
                <span className={legendaFim} aria-hidden="true">
                  Tempo
                </span>
                <input
                  aria-label="Tempo de mentoria"
                  placeholder="ex.: 8 meses"
                  className={quieto}
                  {...tempo}
                />
              </div>
            </div>
            <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${vazio(notasAtual.value)}`}>
              <span className={legendaFim} aria-hidden="true">
                Notas do momento atual
              </span>
              <textarea
                aria-label="Notas do momento atual"
                placeholder="Adicionar notas do momento atual"
                className={quieto}
                {...notasAtual}
              />
              <ComoFica notas={notasAtual.value} />
              <span className="no-print px-2.5 text-xs text-ink3">
                Cada linha vira um tópico. &quot;Rótulo: texto&quot; destaca o rótulo. Salva ao sair
                do campo.
              </span>
            </div>
          </div>
        </NoLinha>

        <NoLinha
          tom="fim"
          marca={estrela}
          titulo="Galeria de conquistas"
          sub="Fotos ou vídeos com data e descrição · do mais antigo ao mais recente"
        >
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4">
            {f.conquistas.map((c) => (
              <Conquista
                key={c.id}
                c={c}
                midias={midias.filter((m) => m.donoId === c.id)}
                onData={conquistaSalvar(c.id, 'data')}
                onDescricao={conquistaSalvar(c.id, 'descricao')}
                onAnexar={(a) => anexar('conquista', c.id, a)}
                onTirar={tirar}
                onRemover={() => onRemoverConquista(c.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => void novaConquista()}
              className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line px-3 text-center text-sm font-semibold text-ink2 transition-[background-color,scale] duration-[var(--dur)] hover:bg-black/[0.03] active:scale-[.99] dark:hover:bg-white/[0.04]"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Adicionar conquista
              <small className="text-xs font-normal text-ink3">
                foto ou vídeo, data e descrição
              </small>
            </button>
          </div>
        </NoLinha>
      </div>
    </div>
  );
}

/** Pilar: card com o nome e "Antes" → "Hoje", um embaixo do outro (a seta não empurra o texto). */
function Pilar({
  p,
  onAntes,
  onDepois,
}: {
  p: FichaDetalhe['pilares'][number];
  onAntes: Salvar;
  onDepois: Salvar;
}) {
  const antes = useCampo(p.antes, onAntes);
  const depois = useCampo(p.depois, onDepois);
  return (
    <div className={`glass-card flex flex-col gap-2 p-4 ${vazio(antes.value, depois.value)}`}>
      <h3 className="px-2.5 text-sm font-bold">{p.rotulo}</h3>
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-baseline gap-x-1 gap-y-1">
        <span
          className={`pl-2.5 text-xs font-semibold text-ink3 ${vazio(antes.value)}`}
          aria-hidden="true"
        >
          Antes
        </span>
        <textarea
          aria-label={`${p.rotulo} antes`}
          placeholder="Adicionar antes"
          className={`${quieto} ${vazio(antes.value)}`}
          {...antes}
        />
        <span
          className={`flex items-center gap-1 pl-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ${vazio(depois.value)}`}
          aria-hidden="true"
        >
          <Seta className="!size-3 !text-current" />
          Hoje
        </span>
        <textarea
          aria-label={`${p.rotulo} hoje`}
          placeholder="Adicionar hoje"
          className={`${quieto} font-semibold ${vazio(depois.value)}`}
          {...depois}
        />
      </div>
    </div>
  );
}

/** Uma linha "rótulo: antes → depois"; no celular o rótulo fica em cima. */
function Evolucao({
  e,
  onAntes,
  onDepois,
}: {
  e: FichaDetalhe['evolucao'][number];
  onAntes: Salvar;
  onDepois: Salvar;
}) {
  const antes = useCampo(e.antes, onAntes);
  const depois = useCampo(e.depois, onDepois);
  return (
    <li
      className={`grid gap-1 px-4 py-2.5 ${vazio(antes.value, depois.value)} @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @xl:items-center @xl:gap-3`}
    >
      <span className="px-2.5 text-sm font-semibold @xl:px-0">{e.rotulo}</span>
      <div className="grid grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-1.5">
        <input
          aria-label={`${e.rotulo} antes`}
          placeholder="Adicionar antes"
          className={quieto}
          {...antes}
        />
        <Seta />
        <input
          aria-label={`${e.rotulo} depois`}
          placeholder="Adicionar depois"
          className={`${quieto} font-semibold`}
          {...depois}
        />
      </div>
    </li>
  );
}

function Conquista({
  c,
  midias,
  onData,
  onDescricao,
  onAnexar,
  onTirar,
  onRemover,
}: {
  c: FichaDetalhe['conquistas'][number];
  midias: MidiaDTO[];
  onData: Salvar;
  onDescricao: Salvar;
  onAnexar: (a: File) => Promise<void>;
  onTirar: (m: MidiaDTO) => void;
  onRemover: () => void;
}) {
  const data = useCampo(c.data, onData);
  const desc = useCampo(c.descricao, onDescricao);
  const ruim = !!data.value.trim() && !parseData(data.value).data;
  return (
    <div className="glass-card flex flex-col gap-1.5 p-2.5">
      {midias.map((m) => (
        <MidiaCartao
          key={m.id}
          m={m}
          rotulo="mídia da conquista"
          altura="h-32"
          onRemover={() => onTirar(m)}
        />
      ))}
      {midias.length === 0 && (
        <div className="no-print">
          <EnviarArquivo rotulo="Enviar foto ou vídeo" altura="h-32" onArquivo={onAnexar} />
        </div>
      )}
      <input
        aria-label="Data da conquista"
        placeholder="DD/MM/AAAA"
        inputMode="numeric"
        aria-invalid={ruim || undefined}
        className={`${quieto} text-xs tabular-nums ${vazio(data.value)}`}
        {...data}
      />
      <input
        aria-label="Descrição da conquista"
        placeholder="Adicionar…"
        className={`${quieto} font-semibold ${vazio(desc.value)}`}
        {...desc}
      />
      <button
        type="button"
        onClick={onRemover}
        aria-label="Remover conquista"
        className="self-end rounded-lg px-2 py-1 text-xs font-semibold text-ink3 transition-colors duration-[var(--dur-fast)] hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
      >
        Remover
      </button>
    </div>
  );
}

/** Prévia "Como fica" das notas: cada linha vira tópico, "Rótulo: texto" em destaque. */
function ComoFica({ notas }: { notas: string }) {
  if (!notas.trim()) return null;
  return (
    <div className="no-print rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-ink3 uppercase">
        Como fica
      </span>
      <Topicos notas={notas} vazio="" />
    </div>
  );
}
