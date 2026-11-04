'use client';
import {
  MENTORADO_STATUS,
  MENTORADO_STATUS_LABEL,
  parseColaPlanilha,
  type MentoradoStatus,
} from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';

export type ModuloImport = 'dashboard' | 'linha-do-tempo' | 'rdv';
export const NOME_MODULO: Record<ModuloImport, string> = {
  dashboard: 'Dashboard',
  'linha-do-tempo': 'Linha do tempo',
  rdv: 'Linha do tempo RDV',
};

type Previa = {
  linhas: number;
  entram: number;
  jaExistem: number;
  repetidos: number;
  pendentes: { linha: number; faltando: ('STATUS' | 'TIPO_MENTORIA')[] }[];
  invalidas: number[];
  midiasNaoRecuperadas: number;
};
type Resultado = { gravados: number; ignorados: number; midiasNaoRecuperadas: number };
type Escolha = { status?: MentoradoStatus; tipoMentoria?: string };

/**
 * Gaveta de importação (D27, D36): prévia sem gravar ("X entram · Y já existem"), escolha por
 * linha para o que falta e confirmação. O texto colado e o arquivo ficam só na memória da
 * página: nada vai para URL nem storage.
 */
export function ImportarGaveta({
  modulo,
  modoInicial,
  onClose,
}: {
  modulo: ModuloImport;
  /** Dashboard: abre já em "Colar planilha" ou em "Arquivo .json". */
  modoInicial?: 'planilha' | 'json';
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titulo = `Importar no ${NOME_MODULO[modulo]}`;
  const tituloId = useId();
  const [modo, setModo] = useState<'planilha' | 'json'>(
    modulo === 'dashboard' ? (modoInicial ?? 'planilha') : 'json',
  );
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<{ nome: string; json: unknown } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const corpo = () =>
    modo === 'planilha' ? { tipo: 'planilha', texto } : { tipo: 'json', arquivo: arquivo?.json };
  const linhasColadas = modo === 'planilha' ? parseColaPlanilha(texto).linhas : [];
  const faltaEscolher = (previa?.pendentes ?? []).some((p) =>
    p.faltando.some((f) =>
      f === 'STATUS' ? !escolhas[p.linha]?.status : !escolhas[p.linha]?.tipoMentoria?.trim(),
    ),
  );

  async function preVisualizar() {
    setErro('');
    setResultado(null);
    setOcupado(true);
    try {
      setPrevia(
        await clientApi<Previa>(`/api/mentoria/${modulo}/importar/previa`, 'POST', corpo()),
      );
      setEscolhas({});
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    setErro('');
    setOcupado(true);
    try {
      const body =
        modo === 'planilha'
          ? { ...corpo(), escolhas: Object.fromEntries(Object.entries(escolhas)) }
          : corpo();
      setResultado(await clientApi<Resultado>(`/api/mentoria/${modulo}/importar`, 'POST', body));
      setPrevia(null);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function lerArquivo(f: File | undefined) {
    setPrevia(null);
    setResultado(null);
    setErro('');
    if (!f) return setArquivo(null);
    try {
      setArquivo({ nome: f.name, json: JSON.parse(await f.text()) });
    } catch {
      setArquivo(null);
      setErro('O arquivo não é um .json válido.');
    }
  }

  const escolher = (linha: number, e: Escolha) =>
    setEscolhas((s) => ({ ...s, [linha]: { ...s[linha], ...e } }));

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onClose={onClose}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-[560px] overflow-y-auto bg-[var(--bg)] p-0 text-ink shadow-[-20px_0_60px_-20px_rgba(0,0,0,.35)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px] md:rounded-l-3xl"
    >
      <div className="flex min-h-full flex-col gap-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink3">
              Acompanhamento · {NOME_MODULO[modulo]}
            </p>
            <h2 id={tituloId} className="text-xl font-bold tracking-[-0.02em]">
              {titulo}
            </h2>
            <p className="mt-1 text-sm text-ink2">
              Mostra quantos registros entram e pede confirmação antes de gravar. Nomes já
              existentes são ignorados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fechar"
            className="inline-flex size-10 flex-none items-center justify-center rounded-xl text-ink2 hover:bg-black/5 active:scale-95 dark:hover:bg-white/10"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {modulo === 'dashboard' && (
          <div
            role="group"
            aria-label="Origem"
            className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]"
          >
            {(['planilha', 'json'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                onClick={() => {
                  setModo(m);
                  setPrevia(null);
                  setResultado(null);
                }}
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${modo === m ? 'bg-[var(--on)] text-ink shadow-sm' : 'text-ink2 hover:text-ink'}`}
              >
                {m === 'planilha' ? 'Colar planilha' : 'Arquivo .json'}
              </button>
            ))}
          </div>
        )}

        {modo === 'planilha' ? (
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Cole as linhas copiadas da planilha, na ordem: nome, tipo, tipo de mentoria, data de
            entrada, status
            <textarea
              aria-label="Linhas da planilha"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPrevia(null);
              }}
              rows={8}
              className={`${control} font-mono text-[13px] font-normal`}
            />
            <span className="text-xs font-normal text-ink3">
              Colunas separadas por tabulação (como vêm da planilha) ou ponto e vírgula. Linha sem
              status ou sem tipo de mentoria fica marcada e só entra com a sua escolha.
            </span>
          </label>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm font-semibold text-ink2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 3v12M7 10l5 5 5-5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            {arquivo ? arquivo.nome : 'Escolher o .json de backup do módulo'}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Arquivo .json"
              onChange={(e) => void lerArquivo(e.target.files?.[0])}
            />
          </label>
        )}

        <FormError message={erro} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={quietButton}
            disabled={ocupado || (modo === 'planilha' ? !texto.trim() : !arquivo)}
            onClick={() => void preVisualizar()}
          >
            Pré-visualizar
          </button>
        </div>

        {previa && (
          <section className="flex flex-col gap-4" aria-label="Pré-visualização">
            <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-ink">
              <b className="font-semibold">
                {previa.entram} entram · {previa.jaExistem} já existem
              </b>
              {previa.repetidos > 0 && ` · ${previa.repetidos} repetidos no arquivo`}
              {previa.pendentes.length > 0 && ` · ${previa.pendentes.length} para escolher`}
              {previa.invalidas.length > 0 && ` · ${previa.invalidas.length} sem nome (não entram)`}
              {previa.midiasNaoRecuperadas > 0 &&
                ` · ${previa.midiasNaoRecuperadas} mídias não recuperadas (reanexar depois)`}
              {' · nada é gravado antes de confirmar'}
            </p>

            {previa.pendentes.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">Escolha o que falta em cada linha marcada</h3>
                {previa.pendentes.map((p) => {
                  const l = linhasColadas.find((x) => x.linha === p.linha);
                  return (
                    <div key={p.linha} className="glass-card flex flex-col gap-2 p-3">
                      <p className="text-sm">
                        <span className="text-ink3">Linha {p.linha} · </span>
                        <b className="font-semibold">{l?.nome}</b>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {p.faltando.includes('STATUS') && (
                          <select
                            aria-label={`Status da linha ${p.linha}`}
                            className={control}
                            value={escolhas[p.linha]?.status ?? ''}
                            onChange={(e) =>
                              escolher(p.linha, {
                                status: (e.target.value || undefined) as MentoradoStatus,
                              })
                            }
                          >
                            <option value="">Escolha o status</option>
                            {MENTORADO_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {MENTORADO_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        )}
                        {p.faltando.includes('TIPO_MENTORIA') && (
                          <input
                            aria-label={`Tipo de mentoria da linha ${p.linha}`}
                            placeholder="Tipo de mentoria"
                            className={control}
                            value={escolhas[p.linha]?.tipoMentoria ?? ''}
                            onChange={(e) => escolher(p.linha, { tipoMentoria: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              className={`${button} self-start`}
              disabled={ocupado || faltaEscolher || previa.entram === 0}
              onClick={() => void confirmar()}
            >
              Confirmar importação
            </button>
          </section>
        )}

        {resultado && (
          <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold">
            {resultado.gravados} gravados · {resultado.ignorados} ignorados
            {resultado.midiasNaoRecuperadas > 0 &&
              ` · ${resultado.midiasNaoRecuperadas} mídias não recuperadas`}
          </p>
        )}
      </div>
    </dialog>
  );
}
