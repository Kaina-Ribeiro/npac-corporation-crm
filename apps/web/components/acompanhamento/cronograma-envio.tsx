'use client';
import {
  BLOCO_PLURAL,
  BLOCOS,
  jaRecebido,
  MODELO_PME,
  nomePme,
  sugerirItens,
  type Bloco,
  type CronogramaDTO,
  type ItemBanco,
  type Recebido,
} from '@npac/shared/mentoria';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { closeWithMotion } from '@/lib/dialog-motion';
import { nomeMinusculo } from './cronograma-banco';
import { IconeBloco, IconeCr, partesItem } from './cronograma-ui';
import { Troca, type Posicao } from './cronograma-troca';
import { ICONES, Icone } from './ui';

/** Um item escolhido: do banco (`itemId`) ou "só desta pessoa" (só `texto`, C3). */
type Escolha = { chave: string; bloco: Bloco; itemId?: string; texto: string };

export type ModoEnvio =
  /** Enviar o próximo PME (card da ficha e Fila `ENVIAR_PME`). */
  | { tipo: 'envio'; numero: number; aviso?: string }
  /** Montar o cronograma do PME em andamento, que nasceu sem itens. */
  | { tipo: 'incluir'; numero: number; cicloId: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const MODELO_TEXTO = [
  `${MODELO_PME.EAP} EAP`,
  plural(MODELO_PME.EXPERIENCIA, 'experiência', 'experiências'),
  plural(MODELO_PME.DESAFIO, 'desafio', 'desafios'),
  plural(MODELO_PME.FILME, 'filme', 'filmes'),
  plural(MODELO_PME.LIVRO, 'livro', 'livros'),
].join(' · ');

/** Onde a pessoa já recebeu o item: "1º PME", "RDV" ou "Já tinha". */
const ondeRecebeu = (r: Recebido) =>
  !r.propria ? r.mentoria : r.pmeNumero == null ? 'Já tinha' : `${r.pmeNumero}º PME`;

let seq = 0;
const nova = (e: Omit<Escolha, 'chave'>): Escolha => ({ ...e, chave: `e${++seq}` });

/**
 * Janela "Enviar o Nº PME" (NPAC-60, §9.1): data do envio e os itens do cronograma, que já vêm com a
 * sugestão do modelo entre o que a pessoa ainda não recebeu (nem em outra inscrição). Tocar num item
 * abre a troca; "+ Adicionar" no fim de cada bloco. Os itens viram tarefas do ciclo.
 */
export default function CronogramaEnvio({
  inscricaoId,
  nome,
  hoje,
  modo,
  onFechar,
  onFeito,
}: {
  inscricaoId: string;
  /** Nome do mentorado (ou do casal), para a frase da sugestão. */
  nome: string;
  hoje: string;
  modo: ModoEnvio;
  onFechar: () => void;
  onFeito: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const tituloId = useId();
  const [dto, setDto] = useState<CronogramaDTO | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [escolhas, setEscolhas] = useState<Escolha[]>([]);
  const [data, setData] = useState(hoje);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [troca, setTroca] = useState<{
    bloco: Bloco;
    alvo: string | null;
    modo: 'pop' | 'tela';
    posicao?: Posicao;
  } | null>(null);
  const numero = modo.tipo === 'envio' ? (dto?.proximo ?? modo.numero) : modo.numero;
  const pme = nomePme(numero);

  useEffect(() => {
    ref.current?.showModal();
    let vivo = true;
    clientApi<CronogramaDTO>(`/api/mentoria/inscricoes/${inscricaoId}/cronograma`)
      .then((d) => {
        if (!vivo) return;
        setDto(d);
        const n = modo.tipo === 'envio' ? (d.proximo ?? modo.numero) : modo.numero;
        const sug =
          modo.tipo === 'envio'
            ? d.sugestao
            : sugerirItens(d.banco, d.recebidos, n, d.semCronograma);
        setEscolhas(
          BLOCOS.flatMap((b) =>
            sug[b].map((i) => nova({ bloco: b, itemId: i.id, texto: i.texto })),
          ),
        );
      })
      .catch((e: Error) => vivo && setErroCarga(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  /** Item → onde a pessoa já o recebeu (os que não podem ir de novo). */
  const recebido = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dto?.recebidos ?? []) if (jaRecebido(r)) m.set(r.itemId, ondeRecebeu(r));
    return m;
  }, [dto]);
  /** `PLANEJADO` da própria inscrição: do PME deste envio ou reservado para outro. */
  const planejado = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dto?.recebidos ?? [])
      if (r.resultado === 'PLANEJADO' && r.propria && r.pmeNumero != null)
        m.set(r.itemId, r.pmeNumero);
    return m;
  }, [dto]);
  const outras = useMemo(
    () => [...new Set((dto?.recebidos ?? []).filter((r) => !r.propria).map((r) => r.mentoria))],
    [dto],
  );

  const fecharJanela = () => closeWithMotion(ref.current);
  const fecharTroca = useCallback(() => setTroca(null), []);

  function abrirTroca(bloco: Bloco, alvo: string | null, linha: HTMLElement) {
    const f = form.current;
    if (!f || window.innerWidth < 768) {
      setTroca({ bloco, alvo, modo: 'tela' });
      return;
    }
    // Caixa suspensa presa ao item: a linha sobe para perto do topo, e a caixa abre embaixo (ou em
    // cima, quando a linha está no fim da lista e não há espaço).
    const rodape = f.querySelector<HTMLElement>('.cr-rodape');
    const fRect = () => f.getBoundingClientRect();
    const r0 = linha.getBoundingClientRect();
    f.scrollTop += r0.top - fRect().top - 140;
    const r = linha.getBoundingClientRect();
    const base = fRect();
    const fundo = rodape ? rodape.getBoundingClientRect().top : base.bottom;
    const abaixo = fundo - r.bottom - 12;
    const acima = r.top - base.top - 12;
    const emCima = abaixo < 300 && acima > abaixo;
    const espaco = emCima ? acima : abaixo;
    setTroca({
      bloco,
      alvo,
      modo: 'pop',
      posicao: {
        top: (emCima ? r.top - 4 : r.bottom + 4) - base.top + f.scrollTop,
        right: base.right - r.right + 8,
        acima: emCima,
        // Busca (46) e rodapé (52) ficam fora da lista que rola.
        max: Math.max(160, Math.min(380, espaco - 100)),
      },
    });
  }

  const daTroca = troca ? (escolhas.find((e) => e.chave === troca.alvo) ?? null) : null;
  const usados = new Set(escolhas.flatMap((e) => (e.itemId ? [e.itemId] : [])));
  const banco = dto?.banco ?? [];
  const disponiveis = (b: Bloco) =>
    banco
      .filter((i) => i.bloco === b && i.ativo && !recebido.has(i.id) && !usados.has(i.id))
      .sort((x, y) => x.ordem - y.ordem)
      .map((i) => {
        const p = planejado.get(i.id);
        return p != null && p !== numero ? { ...i, nota: `Na planilha: ${p}º PME` } : i;
      });
  const jaRecebidos = (b: Bloco) =>
    banco
      .filter((i) => i.bloco === b && recebido.has(i.id))
      .sort((x, y) => x.ordem - y.ordem)
      .map((item) => ({ item, rotulo: recebido.get(item.id)! }));

  function trocarPor(e: Omit<Escolha, 'chave'>) {
    setEscolhas((lista) => {
      if (!troca?.alvo) {
        // Adicionar: entra no fim do bloco, na ordem da lista.
        const ultimo = lista.map((x) => x.bloco).lastIndexOf(e.bloco);
        const pos = ultimo >= 0 ? ultimo + 1 : lista.length;
        return [...lista.slice(0, pos), nova(e), ...lista.slice(pos)];
      }
      return lista.map((x) => (x.chave === troca.alvo ? nova(e) : x));
    });
    setTroca(null);
  }

  async function enviar() {
    setErro('');
    setOcupado(true);
    const cronograma = escolhas.map((e) =>
      e.itemId ? { itemId: e.itemId, bloco: e.bloco } : { bloco: e.bloco, texto: e.texto },
    );
    try {
      if (modo.tipo === 'envio')
        await clientApi(`/api/mentoria/inscricoes/${inscricaoId}/ciclos`, 'POST', {
          enviadoEm: data,
          cronograma,
        });
      else
        await clientApi(`/api/mentoria/ciclos/${modo.cicloId}/cronograma`, 'POST', { cronograma });
      onFeito();
      fecharJanela();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const total = escolhas.length;
  const contador =
    total === 0
      ? 'Nenhum item do cronograma'
      : plural(total, 'item do cronograma', 'itens do cronograma');
  const rotulo = modo.tipo === 'envio' ? `Enviar o ${pme}` : `Incluir no ${pme}`;
  const podeEnviar =
    !ocupado && !!dto && (modo.tipo === 'envio' ? !!data && dto.proximo !== null : total > 0);

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onClose={onFechar}
      onCancel={(e) => {
        e.preventDefault();
        if (troca) setTroca(null);
        else fecharJanela();
      }}
      data-own-motion
      className="ac-dialogo dlg cr-dlg"
    >
      <form
        ref={form}
        method="dialog"
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeEnviar && !troca) void enviar();
        }}
      >
        <div>
          <h2 id={tituloId} className="text-lg font-bold tracking-[-0.02em]">
            {modo.tipo === 'envio' ? `Enviar o ${pme}` : `Cronograma do ${pme}`}
          </h2>
          <p className="mt-1 text-sm text-ink2">
            {modo.tipo === 'envio'
              ? 'O ciclo nasce com as atividades extras, o cronograma abaixo e o encerramento. Prazo de 30 dias.'
              : 'Os itens entram no PME em andamento, com o mesmo prazo dele.'}
          </p>
        </div>
        {modo.tipo === 'envio' && (
          <label className="f">
            <span>Data do envio</span>
            <input
              className={control}
              type="date"
              max={hoje}
              value={data}
              required
              onChange={(e) => setData(e.target.value)}
            />
          </label>
        )}

        <div className="cr-sec">
          <div className="cr-cab">
            <h3>
              Cronograma deste PME<span>{total}</span>
            </h3>
            <small>Modelo da planilha: {MODELO_TEXTO}</small>
          </div>
          {erroCarga ? (
            <FormError message={erroCarga} />
          ) : !dto ? (
            <p className="cr-nota" aria-busy="true">
              Carregando o cronograma…
            </p>
          ) : (
            <>
              {dto.semCronograma ? (
                <p className="pme-aviso">
                  Inscrição sem cronograma: nada vem sugerido. Dá para escolher os itens à mão.
                </p>
              ) : (
                <p className="cr-nota">
                  Já vem com o que {nome} ainda não recebeu
                  {outras.length ? `, nem no ${outras.join(' nem no ')}` : ''}. Toque num item para
                  trocar.
                </p>
              )}
              <ul className="cr-lst" aria-label="Itens do cronograma deste PME">
                {BLOCOS.map((b) => {
                  const doBloco = escolhas.filter((e) => e.bloco === b);
                  return [
                    <li key={`h-${b}`}>
                      <div className="cr-gh">
                        <IconeBloco bloco={b} pequeno />
                        {BLOCO_PLURAL[b]}
                        <span className="n">
                          {doBloco.length} de {MODELO_PME[b]}
                        </span>
                      </div>
                    </li>,
                    ...doBloco.map((e) => {
                      const { titulo, site } = partesItem(e.texto);
                      const notas = [
                        site ? `Vídeo · ${site}` : '',
                        e.itemId && planejado.get(e.itemId) === numero
                          ? 'Estava na planilha para este PME'
                          : '',
                        e.itemId ? '' : 'Só desta pessoa',
                      ].filter(Boolean);
                      const ativo = troca?.alvo === e.chave;
                      return (
                        <li key={e.chave}>
                          <button
                            type="button"
                            className={`pl-mod cr-row ${ativo ? 'cr-alvo' : ''}`}
                            aria-label={`Trocar: ${titulo}`}
                            aria-expanded={ativo}
                            onClick={(ev) => abrirTroca(b, e.chave, ev.currentTarget)}
                          >
                            <div className="min-w-0">
                              <span className="t">{titulo}</span>
                              {notas.length > 0 && <span className="d">{notas.join(' · ')}</span>}
                            </div>
                            <Icone d={ICONES.seta} className="seta cr-seta" />
                          </button>
                        </li>
                      );
                    }),
                    <li key={`a-${b}`}>
                      <button
                        type="button"
                        className="cr-add"
                        aria-expanded={troca?.alvo === null && troca.bloco === b}
                        onClick={(ev) => abrirTroca(b, null, ev.currentTarget)}
                      >
                        <IconeCr d={ICONES.mais} />
                        Adicionar {nomeMinusculo(b)}
                      </button>
                    </li>,
                  ];
                })}
              </ul>
            </>
          )}
        </div>
        {modo.tipo === 'envio' && modo.aviso && <p className="pme-aviso">{modo.aviso}</p>}
        <FormError message={erro} />
        <div className="cr-rodape">
          <span className="cr-cont">{contador}</span>
          <button type="button" className={quietButton} onClick={fecharJanela}>
            Cancelar
          </button>
          <button type="submit" className={button} disabled={!podeEnviar}>
            {rotulo}
          </button>
        </div>
        {troca?.modo === 'pop' && (
          <Troca
            key={`${troca.bloco}-${troca.alvo}`}
            bloco={troca.bloco}
            atual={daTroca?.texto ?? null}
            disponiveis={disponiveis(troca.bloco)}
            recebidos={jaRecebidos(troca.bloco)}
            modo="pop"
            posicao={troca.posicao}
            escolher={(i: ItemBanco) => trocarPor({ bloco: i.bloco, itemId: i.id, texto: i.texto })}
            escrever={(texto) => trocarPor({ bloco: troca.bloco, texto })}
            tirar={
              troca.alvo
                ? () => {
                    setEscolhas((l) => l.filter((x) => x.chave !== troca.alvo));
                    setTroca(null);
                  }
                : undefined
            }
            fechar={fecharTroca}
          />
        )}
      </form>
      {troca?.modo === 'tela' && (
        <Troca
          key={`${troca.bloco}-${troca.alvo}`}
          bloco={troca.bloco}
          atual={daTroca?.texto ?? null}
          disponiveis={disponiveis(troca.bloco)}
          recebidos={jaRecebidos(troca.bloco)}
          modo="tela"
          escolher={(i: ItemBanco) => trocarPor({ bloco: i.bloco, itemId: i.id, texto: i.texto })}
          escrever={(texto) => trocarPor({ bloco: troca.bloco, texto })}
          tirar={
            troca.alvo
              ? () => {
                  setEscolhas((l) => l.filter((x) => x.chave !== troca.alvo));
                  setTroca(null);
                }
              : undefined
          }
          fechar={fecharTroca}
        />
      )}
    </dialog>
  );
}
