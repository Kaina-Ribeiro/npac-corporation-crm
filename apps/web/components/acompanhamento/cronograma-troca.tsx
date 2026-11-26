'use client';
import {
  LIMITE_TEXTO_ITEM,
  normalizarItem,
  type Bloco,
  type ItemBanco,
} from '@npac/shared/mentoria';
import { useEffect, useRef, useState } from 'react';
import { button, ghostButton } from '@/components/crm-ui';
import { nomeMinusculo } from './cronograma-banco';
import { ICONE_BUSCA, IconeCr, partesItem } from './cronograma-ui';
import { ICONES, Icone } from './ui';

export type Posicao = { top: number; right: number; acima: boolean; max: number };

/**
 * Trocar ou adicionar um item do cronograma (NPAC-60, §9.2). No computador, caixa suspensa presa ao
 * item, com a busca primeiro (`modo = 'pop'`); no celular, tela própria por cima da janela, com
 * "Voltar" (`modo = 'tela'`). Tocar numa linha escolhe; o que a pessoa já recebeu vem apagado.
 */
export function Troca({
  bloco,
  atual,
  disponiveis,
  recebidos,
  modo,
  posicao,
  escolher,
  escrever,
  tirar,
  fechar,
}: {
  bloco: Bloco;
  /** Texto do item que sai; nulo = adicionar. */
  atual: string | null;
  /** Ainda não recebeu, na ordem do banco (sem o que já está neste PME). */
  disponiveis: (ItemBanco & { nota?: string })[];
  /** Já recebeu, com onde ("1º PME", "RDV", "Já tinha"). */
  recebidos: { item: ItemBanco; rotulo: string }[];
  modo: 'pop' | 'tela';
  posicao?: Posicao;
  escolher: (item: ItemBanco) => void;
  escrever: (texto: string) => void;
  tirar?: () => void;
  fechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [foco, setFoco] = useState(0);
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const nome = nomeMinusculo(bloco);
  const termo = normalizarItem(busca);
  const achou = <T extends ItemBanco>(i: T) => !termo || normalizarItem(i.texto).includes(termo);
  const lista = disponiveis.filter(achou);
  const ja = recebidos.filter((r) => achou(r.item));
  const titulo = atual ? `Trocar ${nome}` : `Adicionar ${nome}`;

  // Clique fora fecha a caixa suspensa (na tela própria, só o "Voltar").
  useEffect(() => {
    if (modo !== 'pop') return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, [modo, fechar]);

  useEffect(() => {
    if (foco >= lista.length) setFoco(Math.max(0, lista.length - 1));
  }, [foco, lista.length]);

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFoco((f) => Math.min(f + 1, lista.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFoco((f) => Math.max(f - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const i = lista[foco];
      if (i) escolher(i);
    }
  };

  useEffect(() => {
    if (modo !== 'pop') return;
    raiz.current?.querySelector<HTMLElement>('.cr-op.foco')?.scrollIntoView({ block: 'nearest' });
  }, [foco, modo]);

  const escrita = (
    <div className="cr-escrever">
      <label className="f">
        <span>Item só desta pessoa ({nome})</span>
        <textarea
          className="field w-full text-ink dark:!bg-white/10"
          value={texto}
          rows={4}
          maxLength={LIMITE_TEXTO_ITEM}
          autoFocus={modo === 'pop'}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <p className="cr-nota">Vira tarefa deste PME e não entra no banco.</p>
    </div>
  );
  const incluir = () => texto.trim() && escrever(texto.trim());

  if (modo === 'pop')
    return (
      <div
        ref={raiz}
        className={`cr-pop ${posicao?.acima ? 'acima' : ''}`}
        role="dialog"
        aria-label={titulo}
        style={posicao ? { top: posicao.top, right: posicao.right } : undefined}
      >
        {escrevendo ? (
          <>
            {escrita}
            <div className="cr-pop-f">
              <button
                type="button"
                className={`${ghostButton} sm`}
                onClick={() => setEscrevendo(false)}
              >
                Voltar
              </button>
              <button
                type="button"
                className={`${button} sm`}
                disabled={!texto.trim()}
                onClick={incluir}
              >
                Incluir no PME
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="cr-busca">
              <IconeCr d={ICONE_BUSCA} />
              <input
                type="search"
                autoFocus
                value={busca}
                placeholder={atual ? `Trocar por outro ${nome}…` : `Buscar ${nome}…`}
                aria-label={atual ? `Trocar por outro ${nome}` : `Buscar ${nome}`}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setFoco(0);
                }}
                onKeyDown={teclas}
              />
            </label>
            <div className="cr-pop-lista" style={posicao ? { maxHeight: posicao.max } : undefined}>
              <div className="cr-pop-sec">Ainda não recebeu · {lista.length}</div>
              {lista.map((i, k) => (
                <button
                  key={i.id}
                  type="button"
                  className={`cr-op ${k === foco ? 'foco' : ''}`}
                  onMouseEnter={() => setFoco(k)}
                  onClick={() => escolher(i)}
                >
                  <span>{partesItem(i.texto).titulo}</span>
                  {i.nota && <small>{i.nota}</small>}
                </button>
              ))}
              {lista.length === 0 && (
                <p className="cr-pop-vazio">
                  {termo
                    ? 'Nenhum item com esse texto.'
                    : `Não sobrou ${nome} que a pessoa não recebeu.`}
                </p>
              )}
              {ja.length > 0 && (
                <>
                  <div className="cr-pop-sec">Já recebeu · não dá para repetir</div>
                  {ja.map(({ item, rotulo }) => (
                    <div key={item.id} className="cr-op off" aria-disabled="true">
                      <span>{partesItem(item.texto).titulo}</span>
                      <small>{rotulo}</small>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="cr-pop-f">
              {tirar ? (
                <button type="button" className={`${ghostButton} sm`} onClick={tirar}>
                  Tirar do PME
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className={`${ghostButton} sm`}
                onClick={() => setEscrevendo(true)}
              >
                <IconeCr d={ICONES.mais} />
                Escrever só para ele
              </button>
            </div>
          </>
        )}
      </div>
    );

  return (
    <div ref={raiz} className="cr-sheet" role="dialog" aria-label={titulo}>
      <div className="cr-sheet-h">
        <button
          type="button"
          className="cr-volta"
          onClick={escrevendo ? () => setEscrevendo(false) : fechar}
        >
          <Icone d={ICONES.voltar} />
          Voltar
        </button>
        <span>{titulo}</span>
        <span />
      </div>
      <div className="cr-sheet-c">
        {atual && (
          <p className="cr-ctx">
            No lugar de: <b>{partesItem(atual).titulo}</b>
          </p>
        )}
        {escrevendo ? (
          escrita
        ) : (
          <>
            <label className="cr-busca">
              <IconeCr d={ICONE_BUSCA} />
              <input
                type="search"
                value={busca}
                placeholder={`Buscar ${nome}`}
                aria-label={`Buscar ${nome}`}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <div className="cr-cab">
              <h3>
                Ainda não recebeu<span>{lista.length}</span>
              </h3>
            </div>
            {lista.length > 0 ? (
              <ul className="cr-lst">
                {lista.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="pl-mod cr-row" onClick={() => escolher(i)}>
                      <div className="min-w-0">
                        <span className="t">{partesItem(i.texto).titulo}</span>
                        {i.nota && <span className="d">{i.nota}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cr-nota">
                {termo
                  ? 'Nenhum item com esse texto.'
                  : `Não sobrou ${nome} que a pessoa não recebeu.`}
              </p>
            )}
            {ja.length > 0 && (
              <>
                <div className="cr-cab">
                  <h3>
                    Já recebeu<span>{ja.length}</span>
                  </h3>
                  <small>não dá para repetir</small>
                </div>
                <ul className="cr-lst">
                  {ja.map(({ item, rotulo }) => (
                    <li key={item.id}>
                      <div className="pl-mod cr-row off" aria-disabled="true">
                        <div className="min-w-0">
                          <span className="t">{partesItem(item.texto).titulo}</span>
                        </div>
                        <span className="q">{rotulo}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <div className="cr-sheet-f">
        {escrevendo ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!texto.trim()}
            onClick={incluir}
          >
            Incluir no PME
          </button>
        ) : (
          <>
            {tirar && (
              <button type="button" className="btn btn-secondary" onClick={tirar}>
                Tirar do PME
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setEscrevendo(true)}>
              <IconeCr d={ICONES.mais} />
              Escrever só para ele
            </button>
          </>
        )}
      </div>
    </div>
  );
}
