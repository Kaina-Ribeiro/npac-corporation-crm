'use client';
import type { EvolucaoDTO, FichaDTO } from '@npac/shared/mentoria';
import { useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { showToast } from '@/components/toast';
import { avisar, filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { CaixaTexto, type AoMudar } from './evolucao-cartoes';
import { inicioDaFicha, ListaTopicos, rotuloMesAtual, topicosDaAba } from './evolucao-topicos';
import { enviarFoto } from './midia';
import { dataBR, diaBR } from './ui';

const sm = `${quietButton} sm`;
const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8';
const DICA = 'Cada linha vira um tópico. "Rótulo: texto" deixa o rótulo em negrito.';
const FOTOS = 'image/jpeg,image/png,image/webp';

function Foto({ foto, alt, atual }: { foto: { id: string } | null; alt: string; atual: boolean }) {
  if (!foto)
    return (
      <div
        className="foto"
        role="img"
        aria-label={`Sem foto ${atual ? 'de agora' : 'de quando chegaram'}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={CAMERA} />
        </svg>
        <span aria-hidden="true">Sem foto</span>
      </div>
    );
  const src = `/api/mentoria/midia/${foto.id}`;
  // Clicar abre o arquivo em tamanho maior (spec §5.4).
  return (
    <a className={`foto cheia ${atual ? 'ouro' : ''}`} href={src} target="_blank" rel="noopener">
      <img src={src} alt={alt} />
    </a>
  );
}

function BotaoFoto({
  rotulo,
  temFoto,
  enviando,
  aoEscolher,
}: {
  rotulo: string;
  temFoto: boolean;
  enviando: boolean;
  aoEscolher: (f: File) => void;
}) {
  return (
    <label className={`${sm} foto-btn ${enviando ? 'ocupado' : ''}`}>
      {enviando ? 'Enviando…' : temFoto ? 'Trocar foto' : 'Anexar foto'}
      <input
        type="file"
        className="sr-only"
        accept={FOTOS}
        aria-label={rotulo}
        disabled={enviando}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) aoEscolher(f);
        }}
      />
    </label>
  );
}

/** Os dois momentos (spec §5.4), em "Lado a lado" ou "Linha do tempo". */
export function Momentos({
  ficha,
  ev,
  edita,
  vista,
  chave,
  aoMudar,
  recarregar,
  irMomento,
}: {
  ficha: FichaDTO;
  ev: EvolucaoDTO;
  edita: boolean;
  vista: 'lado' | 'linha';
  chave: string;
  aoMudar: AoMudar;
  recarregar: () => Promise<void>;
  irMomento: () => void;
}) {
  const [editIni, setEditIni] = useState(false);
  const [editAtual, setEditAtual] = useState(false);
  const [enviando, setEnviando] = useState<'evolucao-inicial' | 'evolucao-atual' | null>(null);
  const inicio = inicioDaFicha(ficha);
  const daAba = topicosDaAba(ev.daAba);
  const casal = ficha.tipo === 'CASAL';

  async function enviar(dono: 'evolucao-inicial' | 'evolucao-atual', arquivo: File) {
    setEnviando(dono);
    try {
      // A foto soma 1 na version da evolução: a fila termina antes e relê depois.
      await filaDeSalvamento().idle();
      await enviarFoto(dono, ficha.id, arquivo);
      await recarregar();
      showToast();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  const botao = (aberto: boolean, alternar: () => void, nome: string) =>
    edita && (
      <button
        type="button"
        className={sm}
        aria-label={aberto ? undefined : `Editar ${nome}`}
        onClick={alternar}
      >
        {aberto ? 'Pronto' : 'Editar'}
      </button>
    );

  return (
    <div className={`mom ${vista}`}>
      <div className="mc">
        <div className="mc-h">
          <span className="mc-n">1</span>
          <div className="mc-tit">
            <b>Momento inicial</b>
            <span>Quando chegaram</span>
          </div>
          {botao(editIni, () => setEditIni((x) => !x), 'momento inicial')}
        </div>
        <div className="quem-foto">
          <Foto foto={ev.fotoInicial} alt="Foto de quando chegaram" atual={false} />
          <div className="foto-info">
            {inicio && (
              <span className="data">
                Iniciou em <b>{dataBR(inicio)}</b>
              </span>
            )}
            {edita && (
              <BotaoFoto
                rotulo="Foto do momento inicial"
                temFoto={!!ev.fotoInicial}
                enviando={enviando === 'evolucao-inicial'}
                aoEscolher={(f) => void enviar('evolucao-inicial', f)}
              />
            )}
          </div>
        </div>
        <div className="bloco">
          <div className="bloco-h">
            <span>Da aba Momento inicial</span>
            <a
              className="ver-aba"
              href="?aba=momento"
              onClick={(e) => {
                e.preventDefault();
                irMomento();
              }}
            >
              Ver a aba
            </a>
          </div>
          {daAba.length ? (
            <ListaTopicos itens={daAba} />
          ) : (
            <p className="nada">Nada escrito ainda na aba Momento inicial.</p>
          )}
        </div>
        <div className="bloco">
          <div className="bloco-h">
            <span>Outras anotações</span>
          </div>
          {editIni ? (
            <>
              <CaixaTexto
                chave={chave}
                campo="inicialNotas"
                valor={ev.campos.inicialNotas}
                rotulo="Outras anotações do momento inicial"
                aoMudar={aoMudar}
                autoFocus
              />
              <span className="dica">{DICA}</span>
            </>
          ) : ev.campos.inicialNotas ? (
            <ListaTopicos texto={ev.campos.inicialNotas} />
          ) : (
            <p className="nada">Nada escrito ainda.</p>
          )}
        </div>
      </div>

      <div className="mc atual">
        <div className="mc-h">
          <span className="mc-n">2</span>
          <div className="mc-tit">
            <b>Momento atual</b>
            <span>{rotuloMesAtual(ficha)}</span>
          </div>
          {botao(editAtual, () => setEditAtual((x) => !x), 'momento atual')}
        </div>
        <div className="quem-foto">
          <Foto
            foto={ev.fotoAtual}
            alt={casal ? 'Foto do casal no momento atual' : 'Foto do momento atual'}
            atual
          />
          <div className="foto-info">
            {ev.fotoAtual && (
              <span className="data">
                Foto de <b>{dataBR(diaBR(ev.fotoAtual.em))}</b>
              </span>
            )}
            {edita && (
              <BotaoFoto
                rotulo="Foto do momento atual"
                temFoto={!!ev.fotoAtual}
                enviando={enviando === 'evolucao-atual'}
                aoEscolher={(f) => void enviar('evolucao-atual', f)}
              />
            )}
          </div>
        </div>
        {editAtual ? (
          <>
            <CaixaTexto
              chave={chave}
              campo="atualNotas"
              valor={ev.campos.atualNotas}
              rotulo="Tópicos do momento atual"
              aoMudar={aoMudar}
              autoFocus
            />
            <span className="dica">{DICA}</span>
          </>
        ) : ev.campos.atualNotas ? (
          <ListaTopicos texto={ev.campos.atualNotas} />
        ) : (
          <p className="nada">Ainda não escrito.</p>
        )}
        {ev.atualAtualizadoEm && ev.atualAtualizadoPor && (
          <span className="rodape-mc">
            Atualizado em {dataBR(diaBR(ev.atualAtualizadoEm))} por {ev.atualAtualizadoPor}
          </span>
        )}
      </div>
    </div>
  );
}
