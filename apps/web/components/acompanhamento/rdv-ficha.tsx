'use client';
import type { DiagnosticoPrevia, MidiaDTO, RdvDetalhe } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFieldSaver } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { iniciais } from './fichas-lista';
import { enviarMidia, removerMidia } from './midia';
import {
  AdicionarEvento,
  ColarEventos,
  Gaveta,
  ordenarEventos,
  RdvEventos,
  type Evento,
} from './rdv-eventos';
import { RdvQuadros, type ItemQuadro } from './rdv-quadros';
import { RemoverConfirma } from './remover-confirma';

const ro = (
  <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink3 dark:bg-white/10">
    <svg
      viewBox="0 0 24 24"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
    Somente leitura
  </span>
);

/**
 * Ficha do RDV (Módulo 3): cabeçalho com nome editável e foto de perfil, eventos em ordem
 * cronológica, quadros rápidos, diagnóstico e link da pasta só de leitura (mudam só colando,
 * regra 5). Exportar PDF usa a impressão do navegador (sem botões nem campos).
 */
export function RdvFicha({ inicial }: { inicial: RdvDetalhe }) {
  const router = useRouter();
  const saver = useFieldSaver();
  const key = `rdv:${inicial.id}`;
  const [p, setP] = useState(inicial);
  const [midias, setMidias] = useState<MidiaDTO[]>(inicial.midias);
  const [nome, setNome] = useState(inicial.nome);
  const [base, setBase] = useState(inicial.nome);
  const [erro, setErro] = useState('');
  const [eventos, setEventos] = useState<Evento[]>(inicial.eventos);
  const [quadros, setQuadros] = useState<ItemQuadro[]>(inicial.quadros);
  const [gaveta, setGaveta] = useState<
    'diag' | 'pasta' | 'foto' | 'remover' | 'evento' | 'colar' | null
  >(null);
  const [removerFilho, setRemoverFilho] = useState<{
    kind: 'rdv-evento' | 'rdv-quadro';
    id: string;
  } | null>(null);

  useEffect(() => {
    saver.registrar(key, inicial.version);
  }, [key, inicial.version]);
  const versao = () => saver.versionDe(key) ?? p.version;
  /** Rotas de "Colar" sobem a version fora da fila: a fila passa a usar a nova. */
  const novaVersao = (v: number) => {
    saver.registrar(key, v);
    setP((x) => ({ ...x, version: v }));
  };

  // Foto de perfil: só a mídia da própria pessoa (eventos e quadros têm as suas).
  const foto = midias.find((m) => m.donoId === p.id && m.tipo === 'FOTO');

  /** Depois de "Colar vários eventos", relê a pessoa (eventos e quadros novos, version). */
  async function recarregar() {
    const r = await clientApi<RdvDetalhe>(`/api/mentoria/rdv/${p.id}`, 'GET');
    novaVersao(r.version);
    setEventos(r.eventos);
    setQuadros(r.quadros);
    setMidias(r.midias);
  }

  async function trocarFoto(arquivo: File) {
    setErro('');
    try {
      const m = await enviarMidia('rdv-pessoa', p.id, arquivo);
      const antiga = foto;
      setMidias((l) => [...l.filter((x) => x.id !== antiga?.id), { ...m, donoTipo: 'RDV_PESSOA' }]);
      if (antiga) await removerMidia(antiga.id);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function exportarPdf() {
    void clientApi(`/api/mentoria/rdv/${p.id}/imprimir`, 'POST', {}).catch(() => {});
    setTimeout(() => window.print(), 50);
  }

  return (
    <div className="ficha-imprimivel flex flex-col gap-6">
      <Link
        href="/acompanhamento/rdv"
        className="no-print inline-flex items-center gap-1.5 self-start text-sm font-semibold text-ink2 hover:text-ink"
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
        Linha do tempo RDV
      </Link>

      <section className="glass-card flex flex-wrap items-center gap-4 p-4 md:p-5">
        {foto ? (
          <img
            src={`/api/mentoria/midia/${foto.id}`}
            alt="Foto de perfil"
            className="size-16 flex-none rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-16 flex-none items-center justify-center rounded-full bg-black/[0.06] text-lg font-bold text-ink2 dark:bg-white/10"
          >
            {iniciais(p.nome)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="px-1 text-xs font-semibold tracking-[0.06em] text-ink3 uppercase">
            Linha do tempo RDV
          </span>
          <b className="hidden px-1 text-2xl font-bold print:block">{p.nome}</b>
          {/* Textarea de uma linha que quebra: nome longo de casal não some no celular. */}
          <textarea
            aria-label="Nome do mentorado"
            rows={1}
            className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 text-xl leading-tight font-bold tracking-[-0.03em] [field-sizing:content] hover:border-line focus:border-ink/30 md:text-2xl print:hidden"
            value={nome}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onChange={(e) => setNome(e.target.value.replace(/\n/g, ' '))}
            onBlur={() => {
              const v = nome.trim();
              if (!v || v === base.trim()) return setNome(base);
              setBase(v);
              setP((x) => ({ ...x, nome: v }));
              saver.salvar(key, 'nome', v);
            }}
          />
          <p className="no-print mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
            <label className="cursor-pointer font-semibold text-ink2 underline-offset-2 hover:text-ink hover:underline">
              {foto ? 'Trocar foto' : 'Adicionar foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={foto ? 'Trocar foto' : 'Adicionar foto'}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void trocarFoto(f);
                }}
              />
            </label>
            {foto && (
              <button
                type="button"
                onClick={() => setGaveta('foto')}
                aria-label="Remover foto de perfil"
                className="font-semibold text-ink3 underline-offset-2 hover:text-rose-700 hover:underline"
              >
                Remover foto
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGaveta('colar')}
            className="rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-transform active:scale-[.98]"
          >
            Colar vários eventos
          </button>
          <button
            type="button"
            onClick={exportarPdf}
            className="rounded-xl border border-line px-3 py-2 text-sm font-semibold transition-transform active:scale-[.98]"
          >
            Exportar PDF
          </button>
          <button
            type="button"
            onClick={() => setGaveta('remover')}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-500/10 active:scale-[.98] dark:text-rose-300"
          >
            Remover mentorado
          </button>
        </div>
      </section>

      <FormError message={erro} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <RdvEventos
            eventos={eventos}
            setEventos={setEventos}
            onAdicionar={() => setGaveta('evento')}
            ctx={{
              pessoaId: p.id,
              versao,
              novaVersao,
              salvar: (campo, v) => saver.salvar(key, campo, v),
              midias,
              setMidias,
              onErro: setErro,
              onRemover: (e) => setRemoverFilho({ kind: 'rdv-evento', id: e.id }),
            }}
          />

          <section aria-label="Diagnóstico inicial" className="glass-card flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Diagnóstico inicial {ro}
              </h2>
              <button
                type="button"
                className={`${quietButton} h-8`}
                onClick={() => setGaveta('diag')}
              >
                Colar dados do diagnóstico
              </button>
            </div>
            <dl className="grid gap-x-4 gap-y-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              {p.diagnostico.map((d) => (
                <div
                  key={d.chave}
                  className={`flex min-w-0 flex-col gap-0.5 ${d.chave === 'sonhos_objetivos' ? 'sm:col-span-2 lg:col-span-4' : ''}`}
                >
                  <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink3 uppercase">
                    {d.rotulo}
                  </dt>
                  <dd
                    className={`text-sm break-words whitespace-pre-line ${d.valor ? 'font-semibold' : 'text-ink3'}`}
                  >
                    {d.valor ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-label="Link da pasta"
            className="glass-card flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Link da pasta {ro}
              </h2>
              {p.pastaUrl ? (
                <a
                  href={p.pastaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-sm font-semibold text-ink2 underline-offset-2 hover:text-ink hover:underline"
                >
                  {p.pastaUrl}
                </a>
              ) : (
                <p className="mt-1 text-sm text-ink3">Nenhum link definido ainda.</p>
              )}
            </div>
            <button
              type="button"
              className={`${quietButton} h-8`}
              onClick={() => setGaveta('pasta')}
            >
              Colar link
            </button>
          </section>
        </div>

        <RdvQuadros
          pessoaId={p.id}
          itens={quadros}
          setItens={setQuadros}
          versao={versao}
          novaVersao={novaVersao}
          midias={midias}
          setMidias={setMidias}
          onErro={setErro}
          onRemover={(i) => setRemoverFilho({ kind: 'rdv-quadro', id: i.id })}
        />
      </div>

      {gaveta === 'evento' && (
        <AdicionarEvento
          pessoaId={p.id}
          versao={versao}
          onFechar={() => setGaveta(null)}
          onCriado={(e, v) => {
            novaVersao(v);
            setEventos((l) => ordenarEventos([...l, e]));
          }}
        />
      )}
      {gaveta === 'colar' && (
        <ColarEventos
          pessoaId={p.id}
          versao={versao}
          onFechar={() => setGaveta(null)}
          onGravado={() => void recarregar().catch((e: Error) => setErro(e.message))}
        />
      )}
      {removerFilho && (
        <RemoverConfirma
          kind={removerFilho.kind}
          id={removerFilho.id}
          version={versao()}
          titulo={
            removerFilho.kind === 'rdv-evento' ? 'Remover este evento?' : 'Remover este item?'
          }
          texto={
            removerFilho.kind === 'rdv-evento'
              ? 'O evento e os anexos dele saem da linha do tempo.'
              : 'O item e a mídia dele saem do quadro.'
          }
          onFechar={() => setRemoverFilho(null)}
          onFeito={() => {
            novaVersao(versao() + 1);
            const alvo = removerFilho.id;
            if (removerFilho.kind === 'rdv-evento')
              setEventos((l) => l.filter((x) => x.id !== alvo));
            else setQuadros((l) => l.filter((x) => x.id !== alvo));
            setMidias((l) => l.filter((m) => m.donoId !== alvo));
          }}
        />
      )}

      {gaveta === 'diag' && (
        <ColarDiagnostico
          id={p.id}
          versao={versao}
          onFechar={() => setGaveta(null)}
          onGravado={(v, campos) => {
            novaVersao(v);
            setP((x) => ({
              ...x,
              diagnostico: x.diagnostico.map((d) => {
                const novo = campos.find((c) => c.chave === d.chave);
                return novo ? { ...d, valor: novo.novo || null } : d;
              }),
            }));
          }}
        />
      )}
      {gaveta === 'pasta' && (
        <ColarLink
          id={p.id}
          versao={versao}
          onFechar={() => setGaveta(null)}
          onGravado={(v, url) => {
            novaVersao(v);
            setP((x) => ({ ...x, pastaUrl: url }));
          }}
        />
      )}
      {gaveta === 'foto' && foto && (
        <Gaveta
          titulo="Remover a foto de perfil?"
          sub="A foto sai da ficha e do armazenamento. Não há como desfazer."
          onFechar={() => setGaveta(null)}
        >
          {(fechar) => (
            <div className="flex justify-end gap-2">
              <button type="button" className={quietButton} onClick={fechar}>
                Cancelar
              </button>
              <button
                type="button"
                className={`${button} !bg-rose-600`}
                onClick={() => {
                  const m = foto;
                  setMidias((l) => l.filter((x) => x.id !== m.id));
                  fechar();
                  void removerMidia(m.id).catch((e: Error) => {
                    setErro(e.message);
                    setMidias((l) => [...l, m]);
                  });
                }}
              >
                Remover foto
              </button>
            </div>
          )}
        </Gaveta>
      )}
      {gaveta === 'remover' && (
        <RemoverConfirma
          kind="rdv-pessoa"
          id={p.id}
          version={versao()}
          titulo={`Remover ${p.nome} do RDV?`}
          texto="A ficha, os eventos, os quadros e as mídias saem da Linha do tempo RDV."
          onFechar={() => setGaveta(null)}
          onFeito={() => router.push('/acompanhamento/rdv')}
        />
      )}
    </div>
  );
}

/** "Colar dados do diagnóstico" (D30): prévia "atual → novo" por campo; só grava ao confirmar. */
function ColarDiagnostico({
  id,
  versao,
  onFechar,
  onGravado,
}: {
  id: string;
  versao: () => number;
  onFechar: () => void;
  onGravado: (version: number, campos: DiagnosticoPrevia['campos']) => void;
}) {
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState<DiagnosticoPrevia | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function verPrevia() {
    setErro('');
    try {
      setPrevia(
        await clientApi<DiagnosticoPrevia>(`/api/mentoria/rdv/${id}/diagnostico/previa`, 'POST', {
          texto,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Gaveta
      titulo="Colar dados do diagnóstico"
      sub="Cole as linhas no formato “Rótulo: valor”. Só os campos reconhecidos mudam; os outros ficam como estão."
      onFechar={onFechar}
    >
      {(fechar) => (
        <>
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Texto do diagnóstico
            <textarea
              aria-label="Texto do diagnóstico"
              className={`${control} min-h-40 resize-y leading-relaxed`}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPrevia(null);
              }}
            />
            <span className="text-xs font-normal text-ink3">
              Rótulos reconhecidos, sem diferenciar maiúsculas ou acentos: idade, situação conjugal,
              filho(s), trabalho, renda atual, dinheiro guardado, patrimônio, dívidas, sonhos e
              objetivos.
            </span>
          </label>
          {previa && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                {previa.campos.length} de 9 campos reconhecidos
                {previa.desconhecidos > 0 &&
                  ` · ${previa.desconhecidos} ${previa.desconhecidos === 1 ? 'linha sem rótulo conhecido fica' : 'linhas sem rótulo conhecido ficam'} de fora`}
              </p>
              {previa.campos.length > 0 && (
                <div className="max-h-60 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/[0.03] text-xs text-ink3 dark:bg-white/[0.04]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Campo</th>
                        <th className="px-3 py-2 font-semibold">Atual</th>
                        <th className="px-3 py-2 font-semibold">Novo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {previa.campos.map((c) => (
                        <tr key={c.chave}>
                          <td className="px-3 py-2 font-semibold">{c.rotulo}</td>
                          <td className="px-3 py-2 break-words text-ink3">{c.atual ?? '—'}</td>
                          <td className="px-3 py-2 break-words font-semibold">{c.novo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {previa.faltam.length > 0 && (
                <p className="text-xs text-ink3">Ficam como estão: {previa.faltam.join(', ')}.</p>
              )}
            </div>
          )}
          <FormError message={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={fechar}>
              Cancelar
            </button>
            {previa && previa.campos.length > 0 ? (
              <button
                type="button"
                className={button}
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  setErro('');
                  try {
                    const r = await clientApi<{ version: number }>(
                      `/api/mentoria/rdv/${id}/diagnostico/colar`,
                      'POST',
                      { version: versao(), texto },
                    );
                    onGravado(r.version, previa.campos);
                    fechar();
                  } catch (e) {
                    setErro((e as Error).message);
                    setOcupado(false);
                  }
                }}
              >
                Gravar diagnóstico
              </button>
            ) : (
              <button
                type="button"
                className={button}
                disabled={!texto.trim()}
                onClick={() => void verPrevia()}
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

/** "Colar link" da pasta: campo de fonte, só muda colando de novo (regra 5). */
function ColarLink({
  id,
  versao,
  onFechar,
  onGravado,
}: {
  id: string;
  versao: () => number;
  onFechar: () => void;
  onGravado: (version: number, url: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Gaveta
      titulo="Colar link da pasta"
      sub="Endereço da planilha ou pasta do mentorado no Google Drive."
      onFechar={onFechar}
    >
      {(fechar) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setOcupado(true);
            setErro('');
            try {
              const r = await clientApi<{ version: number }>(
                `/api/mentoria/rdv/${id}/pasta`,
                'POST',
                {
                  version: versao(),
                  url: url.trim(),
                },
              );
              onGravado(r.version, url.trim());
              fechar();
            } catch (err) {
              setErro((err as Error).message);
              setOcupado(false);
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Link da pasta
            <input
              aria-label="Link da pasta"
              className={control}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              autoFocus
            />
          </label>
          <FormError message={erro} />
          <div className="flex justify-end gap-2">
            <button type="button" className={quietButton} onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className={button} disabled={ocupado || !url.trim()}>
              Gravar link
            </button>
          </div>
        </form>
      )}
    </Gaveta>
  );
}
