'use client';
import type { EvolucaoDTO, FichaDTO, CampoEvolucao } from '@npac/shared/mentoria';
import { useCallback, useEffect, useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { readPrefs } from '@npac/shared/screen-prefs';
import { FICHA_REGRAS, atualizarAc } from '@/lib/acompanhamento-prefs';
import { readPreference } from '@/lib/read-preference';
import { filaDeSalvamento, registrarVersion } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { CartoesEvolucao, Icone16 } from './evolucao-cartoes';
import { Conquistas } from './evolucao-conquistas';
import { Momentos } from './evolucao-momentos';
import { NotasPilares, NumerosPartida, temPartida } from './evolucao-partida';
import { dataBR, diaBR } from './ui';

export type Vista = 'lado' | 'linha';
const BAIXAR = 'M12 4v11M7 10l5 5 5-5M5 20h14';

/**
 * Aba Evolução da ficha (NPAC-57, spec §5): cartões antes → hoje, os dois momentos, pontos de partida e
 * conquistas. Busca a evolução ao abrir; os textos salvam ao sair do campo pela fila do módulo.
 */
export function Evolucao({
  ficha,
  vistaInicial,
  memoria,
  irMomento,
}: {
  ficha: FichaDTO;
  vistaInicial: Vista;
  /** Cookie da ficha (`AC_PREFS`): a vista fica lembrada no aparelho. */
  memoria: string;
  irMomento: () => void;
}) {
  const [ev, setEv] = useState<EvolucaoDTO | null>(null);
  const [erro, setErro] = useState(false);
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const chave = `evolucao:${ficha.id}`;
  const edita = ficha.pode.evolucao && !!ev?.podeEditar;

  const recarregar = useCallback(async () => {
    const d = await clientApi<EvolucaoDTO>(`/api/mentoria/inscricoes/${ficha.id}/evolucao`);
    // Foto enviada soma 1 na version: a fila passa a usar a nova (registrar só sobe).
    registrarVersion(chave, d.version);
    setEv(d);
  }, [ficha.id, chave]);

  useEffect(() => {
    recarregar().catch(() => setErro(true));
  }, [recarregar]);

  // Voltar à aba depois de trocar a vista nesta página: vale a gravada agora, não a da carga.
  useEffect(() => {
    const v = readPrefs(readPreference(memoria), FICHA_REGRAS).vista === 'linha' ? 'linha' : 'lado';
    setVista(v);
  }, [memoria]);

  const aoMudar = useCallback(
    (campo: CampoEvolucao, valor: string | null) => {
      setEv((e) => (e ? { ...e, campos: { ...e.campos, [campo]: valor } } : e));
      // O rodapé "Atualizado em … por …" vem da API depois de salvar o momento atual.
      if (campo === 'atualNotas')
        void filaDeSalvamento()
          .idle()
          .then(() => recarregar())
          .catch(() => undefined);
    },
    [recarregar],
  );

  function trocarVista(v: Vista) {
    setVista(v);
    atualizarAc('ficha', memoria, FICHA_REGRAS, { vista: v === 'linha' ? 'linha' : undefined });
  }

  return (
    <section className="card evs" role="tabpanel" aria-label="Evolução" aria-busy={!ev && !erro}>
      <div className="ev-h">
        <div>
          <span className="eyebrow">Evolução na mentoria</span>
          <h2>Como chegaram e como estão agora</h2>
          {edita && <p>Clique num texto para editar. Salva ao sair do campo.</p>}
        </div>
        <div className="ev-acts">
          <div className="seg2" role="group" aria-label="Como ver os dois momentos">
            {(
              [
                ['lado', 'Lado a lado'],
                ['linha', 'Linha do tempo'],
              ] as const
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                className={vista === v ? 'on' : ''}
                aria-pressed={vista === v}
                onClick={() => trocarVista(v)}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <a
            className={`${quietButton} sm`}
            href={`/acompanhamento/ficha/${ficha.id}/evolucao/pdf`}
            target="_blank"
            rel="noopener"
          >
            <Icone16 d={BAIXAR} />
            Baixar PDF
          </a>
        </div>
      </div>

      {erro && <p className="fila-erro">Não foi possível carregar.</p>}
      {ev && (
        <>
          <CartoesEvolucao campos={ev.campos} edita={edita} chave={chave} aoMudar={aoMudar} />
          <Momentos
            ficha={ficha}
            ev={ev}
            edita={edita}
            vista={vista}
            chave={chave}
            aoMudar={aoMudar}
            recarregar={recarregar}
            irMomento={irMomento}
          />
          {temPartida(ev) && (
            <div>
              <div className="sec-h">
                <span className="sec-t">Pontos de partida</span>
                <small>
                  Da aba Momento inicial
                  {ev.partida.concluidoEm
                    ? `, concluída em ${dataBR(diaBR(ev.partida.concluidoEm))}`
                    : ''}
                </small>
              </div>
              <div className="partida">
                <NumerosPartida e={ev} />
                <NotasPilares e={ev} />
              </div>
            </div>
          )}
          <Conquistas
            inscricaoId={ficha.id}
            conquistas={ev.conquistas}
            edita={edita}
            recarregar={recarregar}
          />
        </>
      )}
    </section>
  );
}
