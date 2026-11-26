'use client';
import {
  BLOCO_LABEL,
  BLOCO_PLURAL,
  BLOCOS,
  LIMITE_TEXTO_ITEM,
  normalizarItem,
  type Bloco,
  type ItemBancoDTO,
} from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { button, control, quietButton } from '@/components/crm-ui';
import { showToast } from '@/components/toast';
import { clientApi } from '@/lib/client-api';
import { ICONE_BUSCA, IconeCr } from './cronograma-ui';
import { Dialogo } from './dialogo';
import { ICONES, Icone } from './ui';

/** "Novo desafio", "Buscar experiência": o nome do bloco no meio da frase. */
export const nomeMinusculo = (b: Bloco) => (b === 'EAP' ? 'EAP' : BLOCO_LABEL[b].toLowerCase());

const uso = (i: ItemBancoDTO) => {
  const envios =
    i.envios === 0 ? 'Nunca enviado' : `${i.envios} ${i.envios === 1 ? 'envio' : 'envios'}`;
  if (i.ativo) return envios;
  return i.envios === 0 ? 'Escondido · 0 envios' : `Escondido · ${envios}`;
};

type Edicao = { tipo: 'novo' } | { tipo: 'editar'; item: ItemBancoDTO } | null;

/**
 * Configurações → Cronograma (NPAC-60, só a Admin): os itens de cada bloco que vão nos PMEs, na
 * ordem da planilha. Item enviado não se apaga: escondido, sai das sugestões e continua no histórico.
 */
export function CronogramaBanco({ itens }: { itens: ItemBancoDTO[] }) {
  const router = useRouter();
  const [bloco, setBloco] = useState<Bloco>('EXPERIENCIA');
  const [busca, setBusca] = useState('');
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [texto, setTexto] = useState('');

  const contagem = useMemo(() => {
    const c = Object.fromEntries(BLOCOS.map((b) => [b, 0])) as Record<Bloco, number>;
    for (const i of itens) c[i.bloco] += 1;
    return c;
  }, [itens]);
  const termo = normalizarItem(busca);
  const doBloco = itens.filter((i) => i.bloco === bloco);
  const lista = termo ? doBloco.filter((i) => normalizarItem(i.texto).includes(termo)) : doBloco;
  const numero = new Map(doBloco.map((i, k) => [i.id, k + 1]));

  const abrir = (e: Edicao) => {
    setTexto(e?.tipo === 'editar' ? e.item.texto : '');
    setEdicao(e);
  };
  const pronto = () => {
    showToast();
    router.refresh();
  };

  return (
    <>
      <div className="cr-top">
        <div className="cr-rola">
          <div className="seg" role="group" aria-label="Bloco do cronograma">
            {BLOCOS.map((b) => (
              <button
                key={b}
                type="button"
                className={bloco === b ? 'on' : ''}
                aria-pressed={bloco === b}
                onClick={() => setBloco(b)}
              >
                {BLOCO_PLURAL[b]}
                <em>{contagem[b]}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="cr-busca-acts">
          <label className="cr-busca">
            <IconeCr d={ICONE_BUSCA} />
            <input
              type="search"
              value={busca}
              placeholder={`Buscar ${nomeMinusculo(bloco)}`}
              aria-label={`Buscar ${nomeMinusculo(bloco)}`}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <button type="button" className={button} onClick={() => abrir({ tipo: 'novo' })}>
            Novo {nomeMinusculo(bloco)}
          </button>
        </div>
      </div>
      <section className="card overflow-hidden">
        {lista.length === 0 ? (
          <p className="cr-vazio">
            {termo
              ? `Nenhum item de ${BLOCO_PLURAL[bloco]} com esse texto.`
              : `Nenhum item de ${BLOCO_PLURAL[bloco]} ainda. Toque em “Novo ${nomeMinusculo(bloco)}”.`}
          </p>
        ) : (
          <ul className="pl-lista cr-banco">
            {lista.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`pl-mod ${i.ativo ? '' : 'off'}`}
                  onClick={() => abrir({ tipo: 'editar', item: i })}
                >
                  <b className="pl-n">{numero.get(i.id)}</b>
                  <div className="min-w-0">
                    <span className="t cr-t">{i.texto}</span>
                    <span className="d">{uso(i)}</span>
                  </div>
                  <Icone d={ICONES.seta} className="seta" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {edicao && (
        <Dialogo
          titulo={
            edicao.tipo === 'novo'
              ? `Novo ${nomeMinusculo(bloco)}`
              : `${BLOCO_LABEL[edicao.item.bloco]} ${numero.get(edicao.item.id) ?? ''}`.trim()
          }
          texto={
            edicao.tipo === 'novo'
              ? 'Entra no fim da lista e aparece nas sugestões do envio.'
              : edicao.item.envios > 0
                ? 'Corrigir o texto não muda os PMEs já enviados.'
                : undefined
          }
          rotulo="Salvar"
          podeConfirmar={!!texto.trim()}
          onFechar={() => setEdicao(null)}
          onConfirmar={async () => {
            if (edicao.tipo === 'novo')
              await clientApi('/api/mentoria/cronograma/itens', 'POST', { bloco, texto });
            else if (texto.trim() !== edicao.item.texto)
              await clientApi(`/api/mentoria/cronograma/itens/${edicao.item.id}`, 'PATCH', {
                version: edicao.item.version,
                texto,
              });
            pronto();
          }}
        >
          <label className="f">
            <span>Texto</span>
            <textarea
              className={`${control} cr-texto`}
              value={texto}
              rows={4}
              maxLength={LIMITE_TEXTO_ITEM}
              required
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          {edicao.tipo === 'editar' && (
            <EsconderMostrar
              item={edicao.item}
              feito={() => {
                setEdicao(null);
                pronto();
              }}
            />
          )}
        </Dialogo>
      )}
    </>
  );
}

/** Esconder tira das sugestões; o item continua nos PMEs que já o levaram. */
function EsconderMostrar({ item, feito }: { item: ItemBancoDTO; feito: () => void }) {
  const [erro, setErro] = useState('');
  return (
    <div className="cr-esconder">
      <p>
        {item.ativo
          ? 'Escondido, o item sai das sugestões do envio. Os PMEs que já o levaram não mudam.'
          : 'Escondido: não aparece nas sugestões do envio.'}
      </p>
      <button
        type="button"
        className={`${quietButton} sm`}
        onClick={async () => {
          setErro('');
          try {
            await clientApi(`/api/mentoria/cronograma/itens/${item.id}`, 'PATCH', {
              version: item.version,
              ativo: !item.ativo,
            });
            feito();
          } catch (e) {
            setErro((e as Error).message);
          }
        }}
      >
        {item.ativo ? 'Esconder' : 'Mostrar'}
      </button>
      {erro && (
        <p role="alert" className="cr-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
