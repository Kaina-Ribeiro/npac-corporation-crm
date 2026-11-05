'use client';
import { parseData, type FichaDetalhe, type MidiaDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFieldSaver } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { FormError } from '@/components/crm-ui';
import { iniciais } from './fichas-lista';
import { EnviarArquivo, enviarMidia, MidiaCartao, removerMidia } from './midia';
import { FichaLadoALado, Topicos } from './ficha-lado-a-lado';
import { RemoverConfirma } from './remover-confirma';

const caixa =
  'field w-full text-sm text-ink dark:!bg-white/10 transition-shadow focus:shadow-[0_0_0_3px_rgba(0,0,0,.06)]';
const area = `${caixa} min-h-24 resize-y leading-relaxed`;

/** Campo que guarda o texto local e salva ao sair, só se mudou (regra 2). */
function useCampo(inicial: string | null, salvar: (v: string | null) => void) {
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

function Secao({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-bold tracking-[-0.02em]">{titulo}</h2>
        <small className="text-xs text-ink3">{sub}</small>
      </div>
      {children}
    </section>
  );
}

/**
 * Ficha da Linha do tempo (Módulo 2), visão "Linha do tempo": edição direta nas caixas, salva
 * ao sair do campo pela fila (version da ficha, D5). Fotos e mídias com "×" que remove na hora.
 */
export function FichaView({ inicial, extra }: { inicial: FichaDetalhe; extra?: React.ReactNode }) {
  const router = useRouter();
  const saver = useFieldSaver();
  const key = `ficha:${inicial.id}`;
  const [f, setF] = useState(inicial);
  const [midias, setMidias] = useState<MidiaDTO[]>(inicial.midias);
  const [erro, setErro] = useState('');
  const [remover, setRemover] = useState<{ kind: 'ficha' | 'conquista'; id: string } | null>(null);

  useEffect(() => {
    saver.registrar(key, inicial.version);
  }, [key, inicial.version]);

  const salvar = (campo: string) => (v: string | null) => saver.salvar(key, campo, v);
  const versao = () => saver.versionDe(key) ?? f.version;

  const nome = useCampo(f.nome, (v) => {
    if (!v) return;
    setF((x) => ({ ...x, nome: v }));
    salvar('nome')(v);
  });
  /** Salva pela fila e mantém a ficha local em dia (a visão lado a lado lê dela). */
  const guardar =
    (campo: string, local: (x: FichaDetalhe, v: string | null) => FichaDetalhe) =>
    (v: string | null) => {
      setF((x) => local(x, v));
      salvar(campo)(v);
    };
  const dataInicio = useCampo(
    f.dataInicioTexto,
    guardar('dataInicio', (x, v) => ({ ...x, dataInicioTexto: v })),
  );
  const notasIni = useCampo(
    f.notasMomentoInicial,
    guardar('notasMomentoInicial', (x, v) => ({ ...x, notasMomentoInicial: v })),
  );
  const notasAtual = useCampo(
    f.notasMomentoAtual,
    guardar('notasMomentoAtual', (x, v) => ({ ...x, notasMomentoAtual: v })),
  );
  const tempo = useCampo(
    f.tempoMentoria,
    guardar('tempoMentoria', (x, v) => ({ ...x, tempoMentoria: v })),
  );
  const [vista, setVista] = useState<'tl' | 'lado'>('tl');

  function imprimir() {
    setVista('lado');
    void clientApi(`/api/mentoria/fichas/${f.id}/imprimir`, 'POST', {}).catch(() => {});
    setTimeout(() => window.print(), 50);
  }
  const dataRuim = !!dataInicio.value.trim() && !parseData(dataInicio.value).data;

  const midiaDe = (tipo: string, dono: string) =>
    midias.filter((m) => m.donoTipo === tipo && m.donoId === dono);
  const fotoAntes = midiaDe('FICHA_ANTES', f.id)[0] ?? midiaDe('ficha-antes', f.id)[0];
  const fotoDepois = midiaDe('FICHA_DEPOIS', f.id)[0] ?? midiaDe('ficha-depois', f.id)[0];

  async function anexar(
    dono: 'ficha-antes' | 'ficha-depois' | 'conquista',
    donoId: string,
    arquivo: File,
  ) {
    const m = await enviarMidia(dono, donoId, arquivo);
    const tipo =
      dono === 'ficha-antes'
        ? 'FICHA_ANTES'
        : dono === 'ficha-depois'
          ? 'FICHA_DEPOIS'
          : 'CONQUISTA';
    setMidias((l) => [...l, { ...m, donoTipo: tipo }]);
  }
  function tirar(m: MidiaDTO) {
    setMidias((l) => l.filter((x) => x.id !== m.id));
    void removerMidia(m.id).catch((e: Error) => {
      setErro(e.message);
      setMidias((l) => [...l, m]);
    });
  }

  async function novaConquista() {
    setErro('');
    try {
      const r = await clientApi<{ id: string; version: number }>(
        `/api/mentoria/fichas/${f.id}/conquistas`,
        'POST',
        { version: versao() },
      );
      saver.registrar(key, r.version);
      setF((x) => ({
        ...x,
        conquistas: [...x.conquistas, { id: r.id, data: null, descricao: null }],
      }));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const evolucaoSalvar = (chave: string, lado: 'antes' | 'depois') =>
    guardar(`campos.${chave}.${lado}`, (x, v) => ({
      ...x,
      pilares: x.pilares.map((c) => (c.chave === chave ? { ...c, [lado]: v } : c)),
      evolucao: x.evolucao.map((c) => (c.chave === chave ? { ...c, [lado]: v } : c)),
    }));
  const conquistaSalvar = (id: string, campo: 'data' | 'descricao') =>
    guardar(`conquistas.${id}.${campo}`, (x, v) => ({
      ...x,
      conquistas: x.conquistas.map((c) => (c.id === id ? { ...c, [campo]: v } : c)),
    }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/acompanhamento/linha-do-tempo"
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink2 hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Linha do tempo
      </Link>

      <section className="glass-card flex flex-wrap items-center gap-4 p-4 md:p-5">
        <span
          aria-hidden="true"
          className="inline-flex size-14 flex-none items-center justify-center rounded-full bg-black/[0.06] text-lg font-bold text-ink2 dark:bg-white/10"
        >
          {iniciais(f.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <input
            aria-label="Nome da ficha"
            className="w-full rounded-lg border border-transparent bg-transparent px-1 text-2xl font-bold tracking-[-0.03em] hover:border-line focus:border-ink/30"
            {...nome}
          />
          <p className="mt-1 flex flex-wrap gap-x-2 px-1 text-sm text-ink2">
            <span>Início {f.dataInicioTexto ?? '—'}</span>·
            <span>{tempo.value || 'tempo não informado'} de mentoria</span>·
            <span>{f.conquistas.length} conquistas na galeria</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div
            role="tablist"
            aria-label="Como ver a ficha"
            className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]"
          >
            {(
              [
                ['tl', 'Linha do tempo'],
                ['lado', 'Lado a lado'],
              ] as const
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={`h-9 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors ${vista === v ? 'bg-[var(--on)] text-ink shadow-sm' : 'text-ink2 hover:text-ink'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={imprimir}
            className="rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-transform active:scale-[.98]"
          >
            Exportar PDF
          </button>
          {extra}
          <button
            type="button"
            onClick={() => setRemover({ kind: 'ficha', id: f.id })}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-500/10 active:scale-[.98] dark:text-rose-300"
          >
            Remover ficha
          </button>
        </div>
      </section>

      <FormError message={erro} />

      {vista === 'lado' ? (
        <div role="tabpanel" aria-label="Lado a lado">
          <FichaLadoALado f={f} midias={midias} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Linha do tempo" className="flex flex-col gap-6">
          <Secao titulo="Momento inicial" sub={`Como chegou · ${f.dataInicioTexto ?? 'sem data'}`}>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="glass-card flex flex-col gap-3 p-4">
                <span className="text-xs font-semibold tracking-[0.06em] text-ink3 uppercase">
                  Foto de antes
                </span>
                {fotoAntes ? (
                  <MidiaCartao
                    m={fotoAntes}
                    rotulo="foto de antes"
                    onRemover={() => tirar(fotoAntes)}
                  />
                ) : (
                  <EnviarArquivo
                    rotulo="Enviar foto de antes"
                    aceita="image/jpeg,image/png,image/webp"
                    altura="h-44"
                    onArquivo={(a) => anexar('ficha-antes', f.id, a)}
                  />
                )}
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink2">
                  Data de início
                  <input
                    aria-label="Data de início"
                    placeholder="DD/MM/AAAA"
                    aria-invalid={dataRuim || undefined}
                    className={`${caixa} ${dataRuim ? '!shadow-[0_0_0_1px_rgba(225,29,72,.5)]' : ''}`}
                    {...dataInicio}
                  />
                </label>
              </div>
              <div className="glass-card flex flex-col gap-2 p-4 lg:col-span-2">
                <span className="text-xs font-semibold tracking-[0.06em] text-ink3 uppercase">
                  Notas livres
                </span>
                <textarea
                  aria-label="Notas do momento inicial"
                  className={`${area} min-h-40`}
                  {...notasIni}
                />
                <ComoFica notas={notasIni.value} />
                <span className="text-xs text-ink3">
                  Profissão, como conheceu a mentoria, o que buscava, disciplina, comunicação,
                  sonhos, se guardava ou investia dinheiro. Cada linha (cada Enter) vira um tópico;
                  &quot;Rótulo: texto&quot; destaca o rótulo. Salva ao sair do campo.
                </span>
              </div>
            </div>
          </Secao>

          <Secao titulo="Os 4 pilares" sub="Fé, saúde, dinheiro e relacionamentos · antes e hoje">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {f.pilares.map((p) => (
                <Pilar
                  key={p.chave}
                  p={p}
                  onAntes={evolucaoSalvar(p.chave, 'antes')}
                  onDepois={evolucaoSalvar(p.chave, 'depois')}
                />
              ))}
            </div>
          </Secao>

          <Secao titulo="Evolução" sub="Antes → depois · valores como vieram da fonte">
            <div className="glass-card overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_20px_minmax(0,1fr)] gap-3 border-b border-line bg-black/[0.03] px-4 py-2 text-xs text-ink3 md:grid dark:bg-white/[0.03]">
                <span>Item</span>
                <span>Antes</span>
                <span />
                <span>Depois</span>
              </div>
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
          </Secao>

          <Secao titulo="Depois da mentoria" sub="Como está agora">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="glass-card flex flex-col gap-3 p-4">
                <span className="text-xs font-semibold tracking-[0.06em] text-amber-700 uppercase dark:text-amber-300">
                  Foto de depois
                </span>
                {fotoDepois ? (
                  <MidiaCartao
                    m={fotoDepois}
                    rotulo="foto de depois"
                    onRemover={() => tirar(fotoDepois)}
                  />
                ) : (
                  <EnviarArquivo
                    rotulo="Enviar foto de depois"
                    aceita="image/jpeg,image/png,image/webp"
                    altura="h-44"
                    onArquivo={(a) => anexar('ficha-depois', f.id, a)}
                  />
                )}
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink2">
                  Tempo de mentoria
                  <input
                    aria-label="Tempo de mentoria"
                    placeholder="ex.: 8 meses"
                    className={caixa}
                    {...tempo}
                  />
                </label>
              </div>
              <div className="glass-card flex flex-col gap-2 p-4 lg:col-span-2">
                <span className="text-xs font-semibold tracking-[0.06em] text-amber-700 uppercase dark:text-amber-300">
                  Notas do momento atual
                </span>
                <textarea
                  aria-label="Notas do momento atual"
                  className={`${area} min-h-40`}
                  {...notasAtual}
                />
                <ComoFica notas={notasAtual.value} />
                <span className="text-xs text-ink3">
                  Cada linha vira um tópico. &quot;Rótulo: texto&quot; destaca o rótulo. Salva ao
                  sair do campo.
                </span>
              </div>
            </div>
          </Secao>

          <Secao
            titulo="Galeria de conquistas"
            sub="Fotos ou vídeos com data e descrição · do mais antigo ao mais recente"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {f.conquistas.map((c) => (
                <Conquista
                  key={c.id}
                  c={c}
                  midias={midias.filter((m) => m.donoId === c.id)}
                  onData={conquistaSalvar(c.id, 'data')}
                  onDescricao={conquistaSalvar(c.id, 'descricao')}
                  onAnexar={(a) => anexar('conquista', c.id, a)}
                  onTirar={tirar}
                  onRemover={() => setRemover({ kind: 'conquista', id: c.id })}
                />
              ))}
              <button
                type="button"
                onClick={() => void novaConquista()}
                className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line px-4 text-center text-sm font-semibold text-ink2 transition-colors hover:bg-black/[0.03] active:scale-[.99] dark:hover:bg-white/[0.04]"
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
          </Secao>
        </div>
      )}

      {remover && (
        <RemoverConfirma
          kind={remover.kind}
          id={remover.id}
          version={versao()}
          titulo={
            remover.kind === 'ficha' ? `Remover a ficha de ${f.nome}?` : 'Remover esta conquista?'
          }
          texto={
            remover.kind === 'ficha'
              ? 'A ficha, as conquistas e as fotos saem da Linha do tempo.'
              : 'A conquista e a mídia dela saem da galeria.'
          }
          onFechar={() => setRemover(null)}
          onFeito={() => {
            if (remover.kind === 'ficha') return router.push('/acompanhamento/linha-do-tempo');
            saver.registrar(key, versao() + 1);
            setF((x) => ({ ...x, conquistas: x.conquistas.filter((c) => c.id !== remover.id) }));
          }}
        />
      )}
    </div>
  );
}

function Pilar({
  p,
  onAntes,
  onDepois,
}: {
  p: FichaDetalhe['pilares'][number];
  onAntes: (v: string | null) => void;
  onDepois: (v: string | null) => void;
}) {
  const antes = useCampo(p.antes, onAntes);
  const depois = useCampo(p.depois, onDepois);
  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      <h3 className="text-sm font-bold">{p.rotulo}</h3>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink3">
        Antes
        <textarea aria-label={`${p.rotulo} antes`} className={area} {...antes} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink3">
        Hoje
        <textarea aria-label={`${p.rotulo} hoje`} className={area} {...depois} />
      </label>
    </div>
  );
}

function Evolucao({
  e,
  onAntes,
  onDepois,
}: {
  e: FichaDetalhe['evolucao'][number];
  onAntes: (v: string | null) => void;
  onDepois: (v: string | null) => void;
}) {
  const antes = useCampo(e.antes, onAntes);
  const depois = useCampo(e.depois, onDepois);
  return (
    <li className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_20px_minmax(0,1fr)] md:items-center md:gap-3">
      <span className="text-sm font-semibold">{e.rotulo}</span>
      <input aria-label={`${e.rotulo} antes`} placeholder="Antes" className={caixa} {...antes} />
      <svg
        viewBox="0 0 24 24"
        className="hidden size-4 text-ink3 md:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      <input
        aria-label={`${e.rotulo} depois`}
        placeholder="Depois"
        className={`${caixa} font-semibold`}
        {...depois}
      />
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
  onData: (v: string | null) => void;
  onDescricao: (v: string | null) => void;
  onAnexar: (a: File) => Promise<void>;
  onTirar: (m: MidiaDTO) => void;
  onRemover: () => void;
}) {
  const data = useCampo(c.data, onData);
  const desc = useCampo(c.descricao, onDescricao);
  const ruim = !!data.value.trim() && !parseData(data.value).data;
  return (
    <div className="glass-card flex flex-col gap-2 p-3">
      {midias.map((m) => (
        <MidiaCartao key={m.id} m={m} rotulo="mídia da conquista" onRemover={() => onTirar(m)} />
      ))}
      {midias.length === 0 && (
        <EnviarArquivo rotulo="Enviar foto ou vídeo" altura="h-28" onArquivo={onAnexar} />
      )}
      <input
        aria-label="Data da conquista"
        placeholder="DD/MM/AAAA"
        aria-invalid={ruim || undefined}
        className={caixa}
        {...data}
      />
      <input
        aria-label="Descrição da conquista"
        placeholder="Descrição"
        className={`${caixa} font-semibold`}
        {...desc}
      />
      <button
        type="button"
        onClick={onRemover}
        aria-label="Remover conquista"
        className="self-end rounded-lg px-2 py-1 text-xs font-semibold text-ink3 hover:bg-rose-500/10 hover:text-rose-700"
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
    <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-ink3 uppercase">
        Como fica
      </span>
      <Topicos notas={notas} vazio="" />
    </div>
  );
}
