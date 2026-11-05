'use client';
import {
  converterFormulario,
  MENTORADO_STATUS,
  MENTORADO_STATUS_LABEL,
  nomesDoArquivo,
  parseColaPlanilha,
  type MentoradoStatus,
} from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';

export type ModuloImport = 'dashboard' | 'linha-do-tempo' | 'rdv';
/** "Importar no Dashboard", "Importar na Linha do tempo"… */
export const EM_MODULO: Record<ModuloImport, string> = {
  dashboard: 'no Dashboard',
  'linha-do-tempo': 'na Linha do tempo',
  rdv: 'na Linha do tempo RDV',
};
export const DO_MODULO: Record<ModuloImport, string> = {
  dashboard: 'do Dashboard',
  'linha-do-tempo': 'da Linha do tempo',
  rdv: 'da Linha do tempo RDV',
};
export const NOME_MODULO: Record<ModuloImport, string> = {
  dashboard: 'Dashboard',
  'linha-do-tempo': 'Linha do tempo',
  rdv: 'Linha do tempo RDV',
};

type Modo = 'planilha' | 'json' | 'formulario';
const MODOS: Record<ModuloImport, Modo[]> = {
  dashboard: ['planilha', 'json'],
  'linha-do-tempo': ['json', 'formulario'],
  rdv: ['json'],
};
const ROTULO_MODO: Record<Modo, string> = {
  planilha: 'Colar planilha',
  json: 'Arquivo .json',
  formulario: 'Planilha .csv do formulário',
};

type Previa = {
  linhas: number;
  entram: number;
  jaExistem: number;
  repetidos: number;
  pendentes: { linha: number; faltando: ('STATUS' | 'TIPO_MENTORIA')[] }[];
  invalidas: number[];
  midiasNaoRecuperadas: number;
  coincidencias: { naBase: number[]; noArquivo: number[] };
  notasDeFora: number;
  eventosSemData: number;
};
type Resultado = {
  gravados: number;
  atualizados: number;
  ignorados: number;
  midiasNaoRecuperadas: number;
};
type Escolha = { status?: MentoradoStatus; tipoMentoria?: string };
type Coincidencia = { acao: 'MESMA' | 'OUTRA'; nome: string };

/**
 * Gaveta de importação (D27, D36, 12B, 12C): prévia sem gravar ("X entram · Y já existem"),
 * lista das coincidências de nome para a equipe confirmar (mesma pessoa ou pessoa diferente),
 * escolha por linha para o que falta e confirmação. Aceita o `.json` do CRM e o da ferramenta
 * antiga; na Linha do tempo, também a planilha .csv do formulário. O conteúdo fica só na
 * memória da página: nada vai para URL nem storage; a API recebe e devolve só índices.
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
  const titulo = `Importar ${EM_MODULO[modulo]}`;
  const tituloId = useId();
  const [modo, setModo] = useState<Modo>(
    modulo === 'dashboard' ? (modoInicial ?? 'planilha') : 'json',
  );
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<{ nome: string; json: unknown } | null>(null);
  const [csv, setCsv] = useState<{ nome: string; texto: string } | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({});
  const [coinc, setCoinc] = useState<Record<number, Coincidencia>>({});
  const [conferi, setConferi] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const corpo = () =>
    modo === 'planilha'
      ? { tipo: 'planilha', texto }
      : modo === 'formulario'
        ? { tipo: 'formulario', texto: csv?.texto ?? '' }
        : { tipo: 'json', arquivo: arquivo?.json };
  const linhasColadas = modo === 'planilha' ? parseColaPlanilha(texto).linhas : [];
  /** Nomes pelo índice da prévia (a API não devolve nomes). */
  const nomes: string[] =
    modo === 'planilha'
      ? linhasColadas.map((l) => l.nome)
      : modo === 'formulario'
        ? converterFormulario(csv?.texto ?? '', () => '').arquivo.registros.map((r) => r.nome)
        : nomesDoArquivo(arquivo?.json);

  const naBase = previa?.coincidencias.naBase ?? [];
  const noArquivo = previa?.coincidencias.noArquivo ?? [];
  const todas = [...naBase, ...noArquivo];
  const escolhaDe = (i: number): Coincidencia => coinc[i] ?? { acao: 'MESMA', nome: '' };
  const outras = todas.filter((i) => escolhaDe(i).acao === 'OUTRA');
  const semNome = outras.some((i) => !escolhaDe(i).nome.trim());
  const atualiza =
    modulo === 'dashboard' ? naBase.filter((i) => escolhaDe(i).acao === 'MESMA') : [];

  // Pendências só das linhas que entram: as novas e as marcadas como "pessoa diferente".
  const entramIdx = new Set(
    nomes.map((_, i) => i).filter((i) => !todas.includes(i) || escolhaDe(i).acao === 'OUTRA'),
  );
  const pendentes = (previa?.pendentes ?? []).filter((p) =>
    linhasColadas.some((l, i) => l.linha === p.linha && entramIdx.has(i)),
  );
  const faltaEscolher = pendentes.some((p) =>
    p.faltando.some((f) =>
      f === 'STATUS' ? !escolhas[p.linha]?.status : !escolhas[p.linha]?.tipoMentoria?.trim(),
    ),
  );
  const nada = (previa?.entram ?? 0) + outras.length + atualiza.length === 0;

  function limpar() {
    setPrevia(null);
    setResultado(null);
    setCoinc({});
    setConferi(false);
  }

  async function preVisualizar() {
    setErro('');
    setResultado(null);
    setOcupado(true);
    try {
      setPrevia(
        await clientApi<Previa>(`/api/mentoria/${modulo}/importar/previa`, 'POST', corpo()),
      );
      setEscolhas({});
      setCoinc({});
      setConferi(false);
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
      const coincidencias = Object.fromEntries(
        todas.map((i) => {
          const c = escolhaDe(i);
          return [
            String(i),
            c.acao === 'OUTRA' ? { acao: 'OUTRA', nome: c.nome.trim() } : { acao: 'MESMA' },
          ];
        }),
      );
      const body = {
        ...corpo(),
        coincidencias,
        ...(modo === 'planilha' && { escolhas: Object.fromEntries(Object.entries(escolhas)) }),
      };
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
    limpar();
    setErro('');
    if (!f) return setArquivo(null);
    try {
      setArquivo({ nome: f.name, json: JSON.parse(await f.text()) });
    } catch {
      setArquivo(null);
      setErro('O arquivo não é um .json válido.');
    }
  }

  async function lerCsv(f: File | undefined) {
    limpar();
    setErro('');
    setCsv(f ? { nome: f.name, texto: await f.text() } : null);
  }

  const escolher = (linha: number, e: Escolha) =>
    setEscolhas((s) => ({ ...s, [linha]: { ...s[linha], ...e } }));
  const marcar = (i: number, c: Partial<Coincidencia>) =>
    setCoinc((s) => ({ ...s, [i]: { ...escolhaDe(i), ...s[i], ...c } }));

  const pronto = modo === 'planilha' ? !!texto.trim() : modo === 'formulario' ? !!csv : !!arquivo;

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
              Mostra quantos registros entram e pede confirmação antes de gravar. Nome que já existe
              (sem diferença de maiúscula, acento ou espaço) aparece numa lista para você confirmar
              se é a mesma pessoa.
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

        {MODOS[modulo].length > 1 && (
          <div
            role="group"
            aria-label="Origem"
            className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]"
          >
            {MODOS[modulo].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                onClick={() => {
                  setModo(m);
                  limpar();
                }}
                className={`h-9 rounded-lg px-2 text-sm font-semibold transition-colors ${modo === m ? 'bg-[var(--on)] text-ink shadow-sm' : 'text-ink2 hover:text-ink'}`}
              >
                {ROTULO_MODO[m]}
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
                limpar();
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
          <Arquivo
            rotulo={modo === 'formulario' ? 'Arquivo .csv' : 'Arquivo .json'}
            aceita={modo === 'formulario' ? 'text/csv,.csv' : 'application/json,.json'}
            nome={modo === 'formulario' ? csv?.nome : arquivo?.nome}
            vazio={
              modo === 'formulario'
                ? 'Escolher a planilha .csv das respostas do formulário'
                : 'Escolher o .json de backup do módulo (do CRM ou da ferramenta antiga)'
            }
            dica={
              modo === 'formulario'
                ? 'Planilha do Google Forms baixada em .csv. A 1ª linha (cabeçalho) é ignorada; as 9 colunas são lidas pela posição: data de envio, nome, fé, saúde, dinheiro, relacionamentos, notas iniciais, tempo de mentoria e evolução.'
                : undefined
            }
            onArquivo={(f) => void (modo === 'formulario' ? lerCsv(f) : lerArquivo(f))}
          />
        )}

        <FormError message={erro} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={quietButton}
            disabled={ocupado || !pronto}
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
              {pendentes.length > 0 && ` · ${pendentes.length} para escolher`}
              {previa.invalidas.length > 0 && ` · ${previa.invalidas.length} sem nome (não entram)`}
              {previa.midiasNaoRecuperadas > 0 &&
                ` · ${previa.midiasNaoRecuperadas} mídias não recuperadas (reanexar depois)`}
              {' · nada é gravado antes de confirmar'}
            </p>
            {previa.eventosSemData > 0 && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-ink">
                {previa.eventosSemData}{' '}
                {previa.eventosSemData === 1
                  ? 'evento sem data não entra'
                  : 'eventos sem data não entram'}
                : todo evento precisa de data. Cadastre à mão depois, se precisar.
              </p>
            )}
            {previa.notasDeFora > 0 && (
              <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-ink">
                {previa.notasDeFora} {previa.notasDeFora === 1 ? 'ficha tem' : 'fichas têm'}{' '}
                &quot;notas importantes&quot; no arquivo antigo. Esse campo não existe no RDV e não
                é importado: copie à mão o que precisar.
              </p>
            )}

            {todas.length > 0 && (
              <section
                aria-label="Nomes que já existem"
                className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-3"
              >
                <div>
                  <h3 className="text-sm font-semibold">
                    Confira{' '}
                    {todas.length === 1
                      ? 'o nome que já existe'
                      : `os ${todas.length} nomes que já existem`}
                  </h3>
                  <p className="text-xs text-ink2">
                    Casais com grafias diferentes e homônimos acontecem: diga se é a mesma pessoa.
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {todas.map((i) => {
                    const c = escolhaDe(i);
                    const daBase = naBase.includes(i);
                    const mesma = daBase
                      ? modulo === 'dashboard'
                        ? 'Mesma pessoa · atualizar a ficha'
                        : 'Mesma pessoa · não importar'
                      : 'Mesma pessoa · não importar de novo';
                    return (
                      <li key={i} className="glass-card flex flex-col gap-2 p-3">
                        <p className="text-sm">
                          <b className="font-semibold break-words">{nomes[i] || '—'}</b>
                          <span className="ml-2 text-xs text-ink3">
                            {daBase ? 'já existe na base' : 'repetido no próprio arquivo'}
                          </span>
                        </p>
                        <div
                          role="radiogroup"
                          aria-label={`O que fazer com ${nomes[i]}`}
                          className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
                        >
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`coinc-${i}`}
                              checked={c.acao === 'MESMA'}
                              onChange={() => marcar(i, { acao: 'MESMA' })}
                            />
                            {mesma}
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`coinc-${i}`}
                              checked={c.acao === 'OUTRA'}
                              onChange={() => marcar(i, { acao: 'OUTRA' })}
                            />
                            Pessoa diferente
                          </label>
                        </div>
                        {c.acao === 'OUTRA' && (
                          <input
                            aria-label={`Nome da nova ficha para ${nomes[i]}`}
                            placeholder="Ex.: com sobrenome"
                            className={control}
                            value={c.nome}
                            onChange={(e) => marcar(i, { nome: e.target.value })}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={conferi}
                    onChange={(e) => setConferi(e.target.checked)}
                  />
                  Conferi {todas.length === 1 ? 'o nome' : `os ${todas.length} nomes`}
                </label>
              </section>
            )}

            {pendentes.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">Escolha o que falta em cada linha marcada</h3>
                {pendentes.map((p) => {
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
              disabled={
                ocupado || faltaEscolher || nada || semNome || (todas.length > 0 && !conferi)
              }
              onClick={() => void confirmar()}
            >
              Confirmar importação
            </button>
          </section>
        )}

        {resultado && (
          <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold">
            {resultado.gravados} gravados · {resultado.ignorados} ignorados
            {resultado.atualizados > 0 && ` · ${resultado.atualizados} atualizados`}
            {resultado.midiasNaoRecuperadas > 0 &&
              ` · ${resultado.midiasNaoRecuperadas} mídias não recuperadas`}
          </p>
        )}
      </div>
    </dialog>
  );
}

function Arquivo({
  rotulo,
  aceita,
  nome,
  vazio,
  dica,
  onArquivo,
}: {
  rotulo: string;
  aceita: string;
  nome?: string;
  vazio: string;
  dica?: string;
  onArquivo: (f: File | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
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
        {nome ?? vazio}
        <input
          type="file"
          accept={aceita}
          className="sr-only"
          aria-label={rotulo}
          onChange={(e) => onArquivo(e.target.files?.[0])}
        />
      </label>
      {dica && <span className="text-xs text-ink3">{dica}</span>}
    </div>
  );
}
