'use client';
import {
  parseData,
  QUADRO_CHAVES,
  QUADRO_ROTULO,
  type MidiaDTO,
  type QuadroChave,
  type RdvDetalhe,
} from '@npac/shared/mentoria';
import { useId, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { enviarMidia, removerMidia } from './midia';
import { Gaveta } from './rdv-eventos';

export type ItemQuadro = RdvDetalhe['quadros'][number];

/** Ordem do quadro (D34): data, depois id; item sem data vai para o fim. */
export const ordenarItens = (l: ItemQuadro[]) =>
  [...l].sort((a, b) => {
    const da = a.data ? parseData(a.data).data : null;
    const db = b.data ? parseData(b.data).data : null;
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });

/**
 * Quadros rápidos ("Evoluções dentro da mentoria"): só leitura até "Editar". No modo de edição
 * dá para adicionar item, anexar mídia e remover (com confirmação). A data do item é de fonte:
 * não tem campo depois de gravada (D34).
 */
export function RdvQuadros({
  pessoaId,
  itens,
  setItens,
  versao,
  novaVersao,
  midias,
  setMidias,
  onErro,
  onRemover,
}: {
  pessoaId: string;
  itens: ItemQuadro[];
  setItens: React.Dispatch<React.SetStateAction<ItemQuadro[]>>;
  versao: () => number;
  novaVersao: (v: number) => void;
  midias: MidiaDTO[];
  setMidias: React.Dispatch<React.SetStateAction<MidiaDTO[]>>;
  onErro: (m: string) => void;
  onRemover: (i: ItemQuadro) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="px-1 text-base font-semibold">Evoluções dentro da mentoria</h2>
      {QUADRO_CHAVES.map((q) => (
        <Quadro
          key={q}
          quadro={q}
          pessoaId={pessoaId}
          itens={itens.filter((i) => i.quadro === q)}
          onNovo={(i, v) => {
            novaVersao(v);
            setItens((l) => ordenarItens([...l, i]));
          }}
          versao={versao}
          midias={midias}
          setMidias={setMidias}
          onErro={onErro}
          onRemover={onRemover}
        />
      ))}
    </div>
  );
}

function Quadro({
  quadro,
  pessoaId,
  itens,
  onNovo,
  versao,
  midias,
  setMidias,
  onErro,
  onRemover,
}: {
  quadro: QuadroChave;
  pessoaId: string;
  itens: ItemQuadro[];
  onNovo: (i: ItemQuadro, version: number) => void;
  versao: () => number;
  midias: MidiaDTO[];
  setMidias: React.Dispatch<React.SetStateAction<MidiaDTO[]>>;
  onErro: (m: string) => void;
  onRemover: (i: ItemQuadro) => void;
}) {
  const [editar, setEditar] = useState(false);
  const [novo, setNovo] = useState(false);
  const rotulo = QUADRO_ROTULO[quadro];
  return (
    <section aria-label={rotulo} className="glass-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-[0.06em] text-ink3 uppercase">{rotulo}</h3>
        <button
          type="button"
          onClick={() => setEditar((x) => !x)}
          aria-pressed={editar}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-ink2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
        >
          {editar ? 'Concluir' : 'Editar'}
        </button>
      </div>
      {itens.length === 0 ? (
        <p className="text-[13px] text-ink3 italic">Nada registrado ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {itens.map((i) => (
            <Item
              key={i.id}
              i={i}
              editar={editar}
              midias={midias.filter((m) => m.donoId === i.id)}
              setMidias={setMidias}
              onErro={onErro}
              onRemover={() => onRemover(i)}
            />
          ))}
        </ul>
      )}
      {editar && (
        <button
          type="button"
          className={`${quietButton} h-8 self-start`}
          onClick={() => setNovo(true)}
        >
          Adicionar item
        </button>
      )}
      {novo && (
        <NovoItem
          quadro={quadro}
          pessoaId={pessoaId}
          versao={versao}
          onFechar={() => setNovo(false)}
          onCriado={onNovo}
        />
      )}
    </section>
  );
}

function Item({
  i,
  editar,
  midias,
  setMidias,
  onErro,
  onRemover,
}: {
  i: ItemQuadro;
  editar: boolean;
  midias: MidiaDTO[];
  setMidias: React.Dispatch<React.SetStateAction<MidiaDTO[]>>;
  onErro: (m: string) => void;
  onRemover: () => void;
}) {
  const id = useId();
  async function anexar(f: File) {
    try {
      const m = await enviarMidia('rdv-quadro', i.id, f);
      setMidias((l) => [...l, { ...m, donoTipo: 'RDV_QUADRO_ITEM' }]);
    } catch (e) {
      onErro((e as Error).message);
    }
  }
  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <span className="text-sm font-semibold break-words">{i.descricao ?? '—'}</span>
      <small className="text-xs text-ink3">{i.data ?? 'Sem data'}</small>
      {(midias.length > 0 || editar) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {midias.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-2.5 text-xs font-semibold"
            >
              <a
                href={`/api/mentoria/midia/${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {m.tipo === 'FOTO' ? 'Foto' : m.tipo === 'VIDEO' ? 'Vídeo' : 'PDF'}
              </a>
              {editar && (
                <button
                  type="button"
                  aria-label="Remover anexo"
                  title="Remove na hora"
                  onClick={() => {
                    setMidias((l) => l.filter((x) => x.id !== m.id));
                    void removerMidia(m.id).catch((e: Error) => {
                      onErro(e.message);
                      setMidias((l) => [...l, m]);
                    });
                  }}
                  className="inline-flex size-5 items-center justify-center rounded-full text-ink3 hover:bg-black/10 hover:text-ink"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {editar && (
            <>
              <label
                htmlFor={id}
                className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs font-semibold text-ink2 hover:text-ink"
              >
                + mídia
              </label>
              <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                aria-label="Anexar mídia ao item"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void anexar(f);
                }}
              />
              <button
                type="button"
                onClick={onRemover}
                className="rounded-lg px-2 py-0.5 text-xs font-semibold text-ink3 hover:bg-rose-500/10 hover:text-rose-700"
              >
                Remover item
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function NovoItem({
  quadro,
  pessoaId,
  versao,
  onFechar,
  onCriado,
}: {
  quadro: QuadroChave;
  pessoaId: string;
  versao: () => number;
  onFechar: () => void;
  onCriado: (i: ItemQuadro, version: number) => void;
}) {
  const [data, setData] = useState('');
  const [desc, setDesc] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Gaveta
      titulo={`Adicionar em ${QUADRO_ROTULO[quadro]}`}
      sub="Data opcional (MM/AAAA ou DD/MM/AAAA). Depois de gravada, a data não muda."
      onFechar={onFechar}
    >
      {(fechar) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErro('');
            if (!desc.trim()) return setErro('Informe a descrição');
            if (data.trim() && !parseData(data).data) return setErro('Use MM/AAAA ou DD/MM/AAAA');
            setOcupado(true);
            try {
              const r = await clientApi<{ id: string; version: number }>(
                `/api/mentoria/rdv/${pessoaId}/quadros`,
                'POST',
                { version: versao(), quadro, data: data.trim(), descricao: desc },
              );
              onCriado(
                { id: r.id, quadro, data: data.trim() || null, descricao: desc.trim() },
                r.version,
              );
              fechar();
            } catch (err) {
              setErro((err as Error).message);
              setOcupado(false);
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Data do item
            <input
              aria-label="Data do item"
              className={control}
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="MM/AAAA"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
            Descrição do item
            <input
              aria-label="Descrição do item"
              className={control}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              autoFocus
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
