'use client';
import type { FichaDetalhe, MidiaDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFieldSaver } from '@/lib/acompanhamento-saver';
import { dangerButton, quietButton } from '@/lib/button';
import { clientApi } from '@/lib/client-api';
import { FormError } from '@/components/crm-ui';
import { iniciais } from './fichas-lista';
import { enviarMidia, removerMidia } from './midia';
import { FichaLadoALado } from './ficha-lado-a-lado';
import { FichaLinha, useCampo } from './ficha-linha';
import { RemoverConfirma } from './remover-confirma';

/**
 * Ficha da Linha do tempo (Módulo 2): cabeçalho, alternância de visão e estado. A visão "Linha
 * do tempo" fica em `ficha-linha.tsx`; a "Lado a lado", em `ficha-lado-a-lado.tsx`.
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
          <button type="button" onClick={imprimir} className={quietButton}>
            Exportar PDF
          </button>
          {extra}
          <button
            type="button"
            onClick={() => setRemover({ kind: 'ficha', id: f.id })}
            className={dangerButton}
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
        <FichaLinha
          f={f}
          midias={midias}
          campos={{ dataInicio, notasIni, notasAtual, tempo }}
          anexar={anexar}
          tirar={tirar}
          novaConquista={() => void novaConquista()}
          evolucaoSalvar={evolucaoSalvar}
          conquistaSalvar={conquistaSalvar}
          onRemoverConquista={(id) => setRemover({ kind: 'conquista', id })}
        />
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
