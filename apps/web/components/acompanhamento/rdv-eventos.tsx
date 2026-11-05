'use client';
import {
  DATA_COMPLETA,
  parseData,
  type LinhaEventoColada,
  type MidiaDTO,
  type RdvDetalhe,
} from '@npac/shared/mentoria';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { enviarMidia, removerMidia } from './midia';

export type Evento = RdvDetalhe['eventos'][number];

/** Célula de edição direta (como no protótipo): sem borda até passar o mouse ou focar. */
const celula =
  'rounded-lg border border-transparent bg-transparent px-2 py-1 text-ink transition-colors hover:border-line focus:border-ink/30 focus:bg-[var(--on)]';

/** Ordem da linha do tempo (regra 4): data, depois id; calculada, nunca reordenada à mão. */
export const ordenarEventos = (l: Evento[]) =>
  [...l].sort((a, b) => {
    const da = parseData(a.data).data ?? '';
    const db = parseData(b.data).data ?? '';
    return da !== db ? (da < db ? -1 : 1) : a.id < b.id ? -1 : 1;
  });

/** Gaveta modal nativa, com o título como nome acessível. */
export function Gaveta({
  titulo,
  sub,
  largura = 560,
  onFechar,
  children,
}: {
  titulo: string;
  sub?: string;
  largura?: number;
  onFechar: () => void;
  children: (fechar: () => void) => React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onFechar}
      style={{ width: `min(${largura}px, calc(100vw - 32px))` }}
      className="m-auto max-h-[calc(100dvh-32px)] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30"
    >
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 id={id} className="text-lg font-bold tracking-[-0.02em]">
            {titulo}
          </h2>
          {sub && <p className="mt-1 text-sm text-ink2">{sub}</p>}
        </div>
        {children(() => ref.current?.close())}
      </div>
    </dialog>
  );
}

type Ctx = {
  pessoaId: string;
  versao: () => number;
  novaVersao: (v: number) => void;
  salvar: (campo: string, v: string | null) => void;
  midias: MidiaDTO[];
  setMidias: React.Dispatch<React.SetStateAction<MidiaDTO[]>>;
  onErro: (msg: string) => void;
  onRemover: (e: Evento) => void;
};

/**
 * Eventos do RDV: sempre do mais antigo para o mais recente (regra 4). Data e descrição
 * salvam ao sair do campo (version da pessoa, D5). Mídia por evento: foto, vídeo, PDF ou
 * link de vídeo; o "×" remove na hora. Remover o evento pede confirmação (regra 6).
 */
export function RdvEventos({
  eventos,
  setEventos,
  ctx,
  onAdicionar,
}: {
  eventos: Evento[];
  setEventos: React.Dispatch<React.SetStateAction<Evento[]>>;
  ctx: Ctx;
  onAdicionar: () => void;
}) {
  return (
    <section aria-label="Eventos" className="glass-card flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold">
          Eventos <span className="text-xs font-normal text-ink3">{eventos.length}</span>
        </h2>
        <span className="text-xs text-ink3">
          Sempre do mais antigo para o mais recente, sem reordenar à mão
        </span>
      </div>
      {eventos.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-ink3">
          Nenhum evento ainda. Use &quot;Colar vários eventos&quot;, uma linha por evento:
          DD/MM/AAAA - descrição.
        </p>
      ) : (
        <ol className="relative flex flex-col px-4 pb-2">
          {eventos.map((e, i) => (
            <EventoItem
              key={e.id}
              e={e}
              n={i + 1}
              ultimo={i === eventos.length - 1}
              ctx={ctx}
              onData={(v) => {
                setEventos((l) =>
                  ordenarEventos(l.map((x) => (x.id === e.id ? { ...x, data: v } : x))),
                );
              }}
              onDescricao={(v) =>
                setEventos((l) => l.map((x) => (x.id === e.id ? { ...x, descricao: v } : x)))
              }
            />
          ))}
        </ol>
      )}
      <div className="no-print flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button type="button" className={`${quietButton} h-8`} onClick={onAdicionar}>
          Adicionar um evento
        </button>
        <span className="text-xs text-ink3">
          Participação em evento presencial vai para o quadro &quot;Eventos presenciais&quot;, não
          para esta linha.
        </span>
      </div>
    </section>
  );
}

function EventoItem({
  e,
  n,
  ultimo,
  ctx,
  onData,
  onDescricao,
}: {
  e: Evento;
  n: number;
  ultimo: boolean;
  ctx: Ctx;
  onData: (v: string) => void;
  onDescricao: (v: string | null) => void;
}) {
  const [data, setData] = useState(e.data);
  const [desc, setDesc] = useState(e.descricao ?? '');
  const [link, setLink] = useState(false);
  const inputId = useId();
  const dataRuim = !DATA_COMPLETA.test(data.trim()) || !parseData(data).data;
  const anexos = ctx.midias.filter((m) => m.donoId === e.id);

  async function anexar(arquivo: File) {
    try {
      const m = await enviarMidia('rdv-evento', e.id, arquivo);
      ctx.setMidias((l) => [...l, { ...m, donoTipo: 'RDV_EVENTO' }]);
    } catch (err) {
      ctx.onErro((err as Error).message);
    }
  }
  function tirar(m: MidiaDTO) {
    ctx.setMidias((l) => l.filter((x) => x.id !== m.id));
    void removerMidia(m.id).catch((err: Error) => {
      ctx.onErro(err.message);
      ctx.setMidias((l) => [...l, m]);
    });
  }

  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 py-3">
      {!ultimo && (
        <span aria-hidden="true" className="absolute top-10 bottom-0 left-[13px] w-px bg-line" />
      )}
      <span
        aria-hidden="true"
        className="relative z-[1] inline-flex size-7 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-800 dark:text-amber-200"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="hidden text-xs font-semibold text-ink2 print:block">{e.data}</span>
        <input
          aria-label="Data do evento"
          placeholder="DD/MM/AAAA"
          aria-invalid={dataRuim || undefined}
          value={data}
          onChange={(x) => setData(x.target.value)}
          onBlur={() => {
            const v = data.trim();
            if (v === e.data) return;
            if (dataRuim) return;
            onData(v);
            ctx.salvar(`eventos.${e.id}.data`, v);
          }}
          className={`${celula} -ml-2 w-32 text-xs font-semibold text-ink2 tabular-nums print:hidden ${dataRuim ? '!border-rose-500/60' : ''}`}
        />
        <span className="hidden text-sm whitespace-pre-line print:block">{e.descricao}</span>
        <textarea
          aria-label="Descrição do evento"
          rows={1}
          value={desc}
          onChange={(x) => setDesc(x.target.value)}
          onBlur={() => {
            const v = desc.trim();
            if (v === (e.descricao ?? '')) return;
            onDescricao(v || null);
            ctx.salvar(`eventos.${e.id}.descricao`, v || null);
          }}
          className={`${celula} -ml-2 w-[calc(100%+8px)] resize-none text-sm leading-relaxed [field-sizing:content] print:hidden`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {anexos.map((m) => (
            <span
              key={m.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-black/[0.03] py-0.5 pr-1 pl-2.5 text-xs font-semibold dark:bg-white/[0.05]"
            >
              <a
                href={m.tipo === 'LINK_VIDEO' ? (m.urlVideo ?? '#') : `/api/mentoria/midia/${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:underline"
              >
                {m.tipo === 'FOTO'
                  ? 'Foto'
                  : m.tipo === 'VIDEO'
                    ? 'Vídeo'
                    : m.tipo === 'PDF'
                      ? 'PDF'
                      : 'Vídeo por link'}
              </a>
              <button
                type="button"
                onClick={() => tirar(m)}
                aria-label="Remover anexo"
                title="Remove na hora"
                className="inline-flex size-5 items-center justify-center rounded-full text-ink3 hover:bg-black/10 hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
          <label
            htmlFor={inputId}
            className="no-print inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs font-semibold text-ink2 hover:bg-black/[0.03] hover:text-ink"
          >
            + foto, vídeo ou PDF
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
            aria-label="Anexar foto, vídeo ou PDF"
            className="sr-only"
            onChange={(x) => {
              const f = x.target.files?.[0];
              x.target.value = '';
              if (f) void anexar(f);
            }}
          />
          <button
            type="button"
            onClick={() => setLink(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs font-semibold text-ink2 hover:bg-black/[0.03] hover:text-ink"
          >
            Link de vídeo
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => ctx.onRemover(e)}
        aria-label="Remover evento"
        title="Pede confirmação"
        className="inline-flex size-8 items-center justify-center self-start rounded-lg text-ink3 hover:bg-rose-500/10 hover:text-rose-700"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
      </button>
      {link && (
        <LinkVideo
          eventoId={e.id}
          onFechar={() => setLink(false)}
          onAnexado={(m) => ctx.setMidias((l) => [...l, m])}
        />
      )}
    </li>
  );
}

function LinkVideo({
  eventoId,
  onFechar,
  onAnexado,
}: {
  eventoId: string;
  onFechar: () => void;
  onAnexado: (m: MidiaDTO) => void;
}) {
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  return (
    <Gaveta
      titulo="Link de vídeo"
      sub="O vídeo continua onde está (YouTube, Vimeo ou Google Drive); o evento guarda só o endereço."
      onFechar={onFechar}
    >
      {(fechar) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (x) => {
            x.preventDefault();
            setErro('');
            try {
              const r = await clientApi<{ id: string }>(
                `/api/mentoria/rdv-evento/${eventoId}/midia/link`,
                'POST',
                { urlVideo: url.trim() },
              );
              onAnexado({
                id: r.id,
                donoTipo: 'RDV_EVENTO',
                donoId: eventoId,
                tipo: 'LINK_VIDEO',
                urlVideo: url.trim(),
                mime: null,
                tamanhoBytes: null,
              });
              fechar();
            } catch (err) {
              setErro(
                (err as Error).message === 'Dados inválidos'
                  ? 'Link não aceito: use um link do YouTube, Vimeo ou Google Drive'
                  : (err as Error).message,
              );
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Endereço do vídeo
            <input
              aria-label="Endereço do vídeo"
              className={control}
              value={url}
              onChange={(x) => setUrl(x.target.value)}
              placeholder="https://youtube.com/…"
              autoFocus
            />
          </label>
          <FormError message={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className={button} disabled={!url.trim()}>
              Anexar link
            </button>
          </div>
        </form>
      )}
    </Gaveta>
  );
}

/** "Adicionar um evento": data obrigatória e sem data padrão (regra 4). */
export function AdicionarEvento({
  pessoaId,
  versao,
  onFechar,
  onCriado,
}: {
  pessoaId: string;
  versao: () => number;
  onFechar: () => void;
  onCriado: (e: Evento, version: number) => void;
}) {
  const [data, setData] = useState('');
  const [desc, setDesc] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Gaveta titulo="Adicionar um evento" onFechar={onFechar}>
      {(fechar) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (x) => {
            x.preventDefault();
            setErro('');
            if (!DATA_COMPLETA.test(data.trim()) || !parseData(data).data)
              return setErro('Informe a data no formato DD/MM/AAAA');
            setOcupado(true);
            try {
              const r = await clientApi<{ id: string; version: number }>(
                `/api/mentoria/rdv/${pessoaId}/eventos`,
                'POST',
                { version: versao(), data: data.trim(), descricao: desc },
              );
              onCriado({ id: r.id, data: data.trim(), descricao: desc.trim() || null }, r.version);
              fechar();
            } catch (err) {
              setErro((err as Error).message);
              setOcupado(false);
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Data do evento
            <input
              aria-label="Data do evento"
              className={control}
              value={data}
              onChange={(x) => setData(x.target.value)}
              placeholder="DD/MM/AAAA"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Descrição do evento
            <textarea
              aria-label="Descrição do evento"
              className={`${control} min-h-24 resize-y`}
              value={desc}
              onChange={(x) => setDesc(x.target.value)}
            />
          </label>
          <FormError message={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className={button} disabled={ocupado}>
              Adicionar
            </button>
          </div>
        </form>
      )}
    </Gaveta>
  );
}

type LinhaPrevia = LinhaEventoColada & {
  escolha: 'EVENTO' | 'QUADRO' | 'DUVIDA';
  dataEdit: string;
};

/**
 * "Colar vários eventos": uma linha por evento (DD/MM/AAAA - descrição). Na prévia a equipe
 * escolhe o tipo de cada linha (D22): a palavra "presencial" só sugere o quadro. Linha sem data
 * é dúvida: não é gravada (fato ambíguo vai para a equipe confirmar fora do sistema).
 */
export function ColarEventos({
  pessoaId,
  versao,
  onFechar,
  onGravado,
}: {
  pessoaId: string;
  versao: () => number;
  onFechar: () => void;
  onGravado: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<LinhaPrevia[] | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const gravaveis = (linhas ?? []).filter((l) => l.escolha !== 'DUVIDA');
  const semData = gravaveis.some(
    (l) =>
      l.escolha === 'EVENTO' &&
      (!DATA_COMPLETA.test(l.dataEdit.trim()) || !parseData(l.dataEdit).data),
  );
  const ROTULO = { EVENTO: 'Evento', QUADRO: 'Eventos presenciais', DUVIDA: 'Dúvida' } as const;

  return (
    <Gaveta
      titulo="Colar vários eventos"
      sub="Uma linha por evento: DD/MM/AAAA - descrição. Você confere cada linha antes de gravar."
      largura={720}
      onFechar={onFechar}
    >
      {(fechar) => (
        <>
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Eventos colados
            <textarea
              aria-label="Eventos colados"
              className={`${control} min-h-32 resize-y leading-relaxed`}
              value={texto}
              onChange={(x) => {
                setTexto(x.target.value);
                setLinhas(null);
              }}
              placeholder={'14/08/2026 - Iniciou a mentoria RDV\n20/08/2026 - Recebeu a caixa'}
            />
          </label>
          {linhas && (
            <div className="flex max-h-[45dvh] flex-col gap-2 overflow-auto">
              {linhas.map((l, i) => (
                <div
                  key={l.linha}
                  className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[150px_120px_minmax(0,1fr)] sm:items-center ${
                    l.escolha === 'DUVIDA'
                      ? 'border-amber-500/40 bg-amber-500/[0.06]'
                      : l.escolha === 'QUADRO'
                        ? 'border-sky-500/40 bg-sky-500/[0.06]'
                        : 'border-line'
                  }`}
                >
                  <select
                    aria-label={`Tipo da linha ${l.linha}`}
                    value={l.escolha}
                    onChange={(x) => {
                      const v = x.target.value as LinhaPrevia['escolha'];
                      setLinhas((a) => a!.map((y, j) => (j === i ? { ...y, escolha: v } : y)));
                    }}
                    className={`${control} h-9 text-sm`}
                  >
                    <option value="EVENTO">{ROTULO.EVENTO}</option>
                    <option value="QUADRO">{ROTULO.QUADRO}</option>
                    <option value="DUVIDA">Dúvida (não grava)</option>
                  </select>
                  <input
                    aria-label={`Data da linha ${l.linha}`}
                    value={l.dataEdit}
                    placeholder="DD/MM/AAAA"
                    onChange={(x) => {
                      const v = x.target.value;
                      setLinhas((a) => a!.map((y, j) => (j === i ? { ...y, dataEdit: v } : y)));
                    }}
                    className={`${control} h-9 text-sm`}
                  />
                  <div className="min-w-0 text-sm">
                    <p className="break-words">{l.descricao}</p>
                    {l.sugestao !== l.escolha && l.sugestao === 'QUADRO' && (
                      <small className="text-xs text-sky-700 dark:text-sky-300">
                        Sugestão: Eventos presenciais
                      </small>
                    )}
                    {l.escolha === 'DUVIDA' && (
                      <small className="block text-xs text-amber-800 dark:text-amber-200">
                        Fato ambíguo: não vira evento. Confirme com a equipe e, se for o caso,
                        troque para Evento com a data.
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {semData && (
            <p className="text-xs text-danger">Evento precisa de data no formato DD/MM/AAAA.</p>
          )}
          <FormError message={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={fechar}>
              Cancelar
            </button>
            {linhas ? (
              <button
                type="button"
                className={button}
                disabled={ocupado || semData || gravaveis.length === 0}
                onClick={async () => {
                  setOcupado(true);
                  setErro('');
                  try {
                    await clientApi(`/api/mentoria/rdv/${pessoaId}/eventos/colar`, 'POST', {
                      version: versao(),
                      linhas: gravaveis.map((l) => ({
                        tipo: l.escolha,
                        data: l.dataEdit.trim(),
                        descricao: l.descricao,
                      })),
                    });
                    onGravado();
                    fechar();
                  } catch (err) {
                    setErro((err as Error).message);
                    setOcupado(false);
                  }
                }}
              >
                Gravar {gravaveis.length} {gravaveis.length === 1 ? 'linha' : 'linhas'}
              </button>
            ) : (
              <button
                type="button"
                className={button}
                disabled={!texto.trim()}
                onClick={async () => {
                  setErro('');
                  try {
                    const r = await clientApi<{ linhas: LinhaEventoColada[] }>(
                      `/api/mentoria/rdv/${pessoaId}/eventos/colar/previa`,
                      'POST',
                      { texto },
                    );
                    setLinhas(
                      r.linhas.map((l) => ({ ...l, escolha: l.tipo, dataEdit: l.dataTexto ?? '' })),
                    );
                  } catch (err) {
                    setErro((err as Error).message);
                  }
                }}
              >
                Ver prévia
              </button>
            )}
          </div>
        </>
      )}
    </Gaveta>
  );
}
