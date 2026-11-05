import { quebrarTopicos, type FichaDetalhe, type MidiaDTO } from '@npac/shared/mentoria';

/** Notas em tópicos: "Rótulo: texto" com o rótulo em negrito; tudo como texto, nunca HTML. */
export function Topicos({ notas, vazio }: { notas: string | null; vazio: string }) {
  const t = quebrarTopicos(notas);
  if (!t.length) return <p className="text-[13px] text-ink3">{vazio}</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {t.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 size-1.5 flex-none rounded-full bg-ink3" />
          <span>
            {x.rotulo && <b className="font-semibold">{x.rotulo}: </b>}
            {x.texto}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Foto({ m, vazio }: { m?: MidiaDTO; vazio: string }) {
  if (!m)
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-ink3">
        {vazio}
      </div>
    );
  if (m.tipo !== 'FOTO')
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-line text-sm text-ink2">
        {m.tipo === 'PDF' ? 'PDF anexado' : 'Vídeo anexado'}
      </div>
    );
  // Stream autenticado da API: <img> simples.
  return (
    <img
      src={`/api/mentoria/midia/${m.id}`}
      alt={vazio.replace('Sem ', '')}
      className="h-56 w-full rounded-2xl object-cover"
    />
  );
}

/**
 * Visão "Lado a lado" (Módulo 2): antes × depois, só leitura e imprimível. Sem campos nem
 * botões no conteúdo (a impressão esconde o resto da tela).
 */
export function FichaLadoALado({ f, midias }: { f: FichaDetalhe; midias: MidiaDTO[] }) {
  const de = (tipo: string, dono: string) =>
    midias.find((m) => m.donoTipo === tipo && m.donoId === dono);
  return (
    <div className="ficha-imprimivel flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="glass-card flex flex-col gap-3 p-5">
          <div>
            <span className="text-xs font-semibold tracking-[0.06em] text-ink3 uppercase">
              Antes
            </span>
            <b className="block text-lg font-bold">{f.nome}</b>
            <small className="text-xs text-ink2">
              Quando chegou · {f.dataInicioTexto ?? 'sem data'}
            </small>
          </div>
          <Foto m={de('FICHA_ANTES', f.id)} vazio="Sem foto de antes" />
          <Topicos notas={f.notasMomentoInicial} vazio="Sem notas do momento inicial." />
        </section>
        <section className="glass-card flex flex-col gap-3 p-5">
          <div>
            <span className="text-xs font-semibold tracking-[0.06em] text-amber-700 uppercase dark:text-amber-300">
              Depois
            </span>
            <b className="block text-lg font-bold">
              {f.tempoMentoria ?? 'Tempo não informado'} de mentoria
            </b>
            <small className="text-xs text-ink2">Como está agora</small>
          </div>
          <Foto m={de('FICHA_DEPOIS', f.id)} vazio="Sem foto de depois" />
          <Topicos notas={f.notasMomentoAtual} vazio='O "depois" ainda não foi escrito.' />
        </section>
      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
          <h3 className="text-base font-semibold">Os 4 pilares e a evolução</h3>
          <span className="text-xs text-ink3">Antes × depois</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink3">
            <tr className="border-y border-line">
              <th className="px-4 py-2 font-semibold">
                <span className="sr-only">Item</span>
              </th>
              <th className="px-4 py-2 font-semibold">Antes</th>
              <th className="px-4 py-2 font-semibold">Depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...f.pilares, ...f.evolucao].map((c) => (
              <tr key={c.chave}>
                <td className="px-4 py-2 font-semibold">{c.rotulo}</td>
                <td className="px-4 py-2 text-ink2">{c.antes ?? '—'}</td>
                <td className="px-4 py-2 font-medium">{c.depois ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="text-lg font-bold tracking-[-0.02em]">Galeria de conquistas</h3>
          <small className="text-xs text-ink3">
            {f.conquistas.length} · do mais antigo ao mais recente
          </small>
        </div>
        {f.conquistas.length === 0 ? (
          <p className="text-[13px] text-ink3">Nenhuma conquista na galeria.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {f.conquistas.map((c) => {
              const m = midias.find((x) => x.donoId === c.id);
              return (
                <li key={c.id} className="glass-card flex flex-col gap-1 p-3">
                  {m?.tipo === 'FOTO' ? (
                    <img
                      src={`/api/mentoria/midia/${m.id}`}
                      alt=""
                      className="h-32 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <span className="text-xs text-ink3">{m ? 'Mídia anexada' : 'Sem mídia'}</span>
                  )}
                  <small className="text-xs text-ink2">{c.data ?? 'Sem data'}</small>
                  <b className="text-sm font-semibold">{c.descricao ?? '—'}</b>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
