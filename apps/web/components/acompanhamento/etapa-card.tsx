'use client';
import {
  ETAPA_LABEL,
  ETAPA_STATUS_LABEL,
  diasParado,
  etapaAtual,
  etapaFechada,
  podeEnviar,
  type Etapa,
  type EtapaDTO,
  type FichaDTO,
} from '@npac/shared/mentoria';
import { useState } from 'react';
import { button, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, salvarCampo } from '@/lib/acompanhamento-saver';
import { CaixaForm } from './caixa-form';
import { CampoPr, useCampo } from './campo';
import { Dialogo } from './dialogo';
import { dataBR, ICONES, Icone } from './ui';

const sm = (classe: string) => `${classe} sm`;
const BOOL = {
  paraTexto: (v: unknown) => (v === true ? '1' : ''),
  deTexto: (t: string) => t === '1',
};

const chaveDe = (fichaId: string, etapa: EtapaDTO) => `etapa:${fichaId}:${etapa.id}`;

/** Sim ou não do PDF, na linha rótulo/valor: uma chave que salva ao tocar. */
function CampoSimNao({
  chave,
  campo,
  rotulo,
  valor,
  editavel,
  aoSalvar,
}: {
  chave: string;
  campo: string;
  rotulo: string;
  valor: boolean | null;
  editavel: boolean;
  aoSalvar?: () => void;
}) {
  const c = useCampo(chave, campo, valor, BOOL);
  const ligado = c.texto === '1';
  return (
    <div className="pr">
      <span>{rotulo}</span>
      <div className="ob-sw">
        <button
          type="button"
          className={`sw ${ligado ? 'on' : ''}`}
          role="switch"
          aria-checked={ligado}
          aria-label={rotulo}
          disabled={!editavel}
          onClick={() => {
            if (c.salvar(ligado ? '' : '1')) aoSalvar?.();
          }}
        >
          <i />
        </button>
      </div>
    </div>
  );
}

function CamposEtapa({
  ficha,
  etapa,
  atualizar,
}: {
  ficha: FichaDTO;
  etapa: EtapaDTO;
  atualizar: () => void;
}) {
  const chave = chaveDe(ficha.id, etapa);
  const editavel = ficha.pode.onboarding && etapa.status !== 'ANTERIOR_AO_SISTEMA';
  const base = { chave, editavel };
  if (etapa.etapa === 'BOAS_VINDAS')
    return (
      <>
        <CampoPr
          {...base}
          rotulo="Data do grupo"
          campo="grupoCriadoEm"
          valor={etapa.grupoCriadoEm}
          tipo="date"
        />
        <CampoSimNao
          {...base}
          rotulo="Formulário preenchido"
          campo="formularioPreenchido"
          valor={etapa.formularioPreenchido}
          aoSalvar={atualizar}
        />
      </>
    );
  if (etapa.etapa === 'GRUPOS')
    return (
      <>
        <CampoSimNao {...base} rotulo="Avisos" campo="grupoAvisos" valor={etapa.grupoAvisos} />
        <CampoSimNao
          {...base}
          rotulo="Clube da Riqueza"
          campo="grupoClube"
          valor={etapa.grupoClube}
        />
        <CampoSimNao
          {...base}
          rotulo="Nação Milionária"
          campo="grupoNacao"
          valor={etapa.grupoNacao}
        />
      </>
    );
  if (etapa.etapa === 'AQUECIMENTO')
    return (
      <>
        <CampoSimNao
          {...base}
          rotulo="Aulas concluídas"
          campo="aulasConcluidas"
          valor={etapa.aulasConcluidas}
        />
        <CampoPr
          {...base}
          rotulo="Data das aulas"
          campo="aulasConcluidasEm"
          valor={etapa.aulasConcluidasEm}
          tipo="date"
        />
      </>
    );
  return null;
}

/** O passo aberto na Jornada: campos da etapa e a ação que o faz andar. */
function EtapaCard({
  ficha,
  etapa,
  atualizar,
}: {
  ficha: FichaDTO;
  etapa: EtapaDTO;
  atualizar: () => void;
}) {
  const [dispensando, setDispensando] = useState(false);
  const [erro, setErro] = useState('');
  const ed = ficha.pode.onboarding && ficha.status === 'ONBOARDING';
  const aberta = !etapaFechada(etapa.status);
  const mensagem = etapa.etapa !== 'CAIXA' && etapa.etapa !== 'IDR';
  const liberada = podeEnviar(etapa.etapa, ficha.onboarding);
  const podeDispensar = ed && aberta && ficha.mentoria !== 'RDV';

  function andar(status: 'ENVIADA' | 'CONCLUIDA') {
    setErro('');
    salvarCampo(chaveDe(ficha.id, etapa), 'status', status, etapa.status);
    void filaDeSalvamento().idle().then(atualizar);
  }

  return (
    <div className="ob-card">
      {etapa.etapa === 'CAIXA' && etapa.status !== 'DISPENSADA' ? (
        etapa.status === 'ANTERIOR_AO_SISTEMA' ? null : (
          <CaixaForm ficha={ficha} atualizar={atualizar} />
        )
      ) : (
        <CamposEtapa ficha={ficha} etapa={etapa} atualizar={atualizar} />
      )}
      {etapa.etapa === 'IDR' && aberta && (
        <p className="ob-nota">
          {liberada
            ? 'A Caixa já chegou. O agendamento da IDR entra com a aba Reuniões.'
            : 'A IDR é agendada depois que a Caixa chega.'}
        </p>
      )}
      <FormError message={erro} />
      {ed && aberta && (mensagem || podeDispensar) && (
        <div className="ob-acoes">
          {mensagem && etapa.status === 'PENDENTE' && (
            <button
              type="button"
              className={sm(button)}
              disabled={!liberada}
              onClick={() => andar('ENVIADA')}
            >
              Marcar enviada
            </button>
          )}
          {mensagem && etapa.status === 'ENVIADA' && (
            <button type="button" className={sm(button)} onClick={() => andar('CONCLUIDA')}>
              Marcar concluída
            </button>
          )}
          {podeDispensar && (
            <button type="button" className={sm(quietButton)} onClick={() => setDispensando(true)}>
              Dispensar
            </button>
          )}
          {mensagem && etapa.status === 'PENDENTE' && !liberada && (
            <p className="ob-nota">Conclua a etapa anterior primeiro.</p>
          )}
        </div>
      )}
      {dispensando && (
        <Dialogo
          titulo={`Dispensar ${ETAPA_LABEL[etapa.etapa]}?`}
          texto="A etapa conta como feita e libera a próxima. Não pode ser desfeito."
          rotulo="Dispensar"
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`/api/mentoria/onboarding/${etapa.id}/dispensar`, 'POST', {
              version: etapa.version,
            });
            atualizar();
          }}
          onFechar={() => setDispensando(false)}
        />
      )}
    </div>
  );
}

function situacao(e: EtapaDTO, liberada: boolean, agora: Date) {
  if (e.status === 'ENVIADA' && e.enviadaEm) {
    const dias = diasParado(e.enviadaEm, agora);
    return dias === 0 ? 'Enviada hoje' : `Enviada há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  if (e.status === 'PENDENTE') return liberada ? 'Próximo passo' : 'Pendente';
  return ETAPA_STATUS_LABEL[e.status];
}

/** Coluna de passos com o passo aberto ao lado; no celular o aberto vem primeiro. */
export function OnboardingFicha({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const atual = etapaAtual(ficha.onboarding);
  const [escolhida, setEscolhida] = useState<Etapa | null>(null);
  const nome = escolhida ?? atual;
  const etapa = ficha.onboarding.find((e) => e.etapa === nome);
  const anterior = ficha.onboarding.every((e) => e.status === 'ANTERIOR_AO_SISTEMA');
  const agora = new Date();

  const passos = (
    <div>
      <h3>Onboarding</h3>
      <ol className="steps">
        {ficha.onboarding.map((e, i) => {
          const fechada = etapaFechada(e.status);
          const liberada = podeEnviar(e.etapa, ficha.onboarding);
          const quando =
            e.status === 'CONCLUIDA' && e.concluidaEm
              ? dataBR(
                  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
                    new Date(e.concluidaEm),
                  ),
                ).slice(0, 5)
              : '';
          return (
            <li key={e.id} className={`st ${i < ficha.onboarding.length - 1 ? 'linha' : ''}`}>
              <button
                type="button"
                className={`st-b ${nome === e.etapa ? 'on' : ''}`}
                aria-pressed={nome === e.etapa}
                disabled={anterior}
                onClick={() => setEscolhida(e.etapa)}
              >
                <span
                  aria-hidden="true"
                  className={`n ${
                    e.status === 'CONCLUIDA'
                      ? ''
                      : fechada
                        ? 'cinza'
                        : e.etapa === atual
                          ? 'atual'
                          : 'futuro'
                  }`}
                >
                  {fechada ? <Icone d={ICONES.check} largura={3} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <b>{ETAPA_LABEL[e.etapa]}</b>
                  <span className="d">{situacao(e, liberada, agora)}</span>
                </div>
                {quando && <em>{quando}</em>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );

  if (anterior)
    return (
      <div className="jg">
        <p className="jg-aviso">
          Entrou antes do sistema: as etapas do onboarding já tinham acontecido.
        </p>
        {passos}
      </div>
    );
  return (
    <div className="jg">
      {etapa ? (
        <div>
          <h3>{ETAPA_LABEL[etapa.etapa]}</h3>
          <EtapaCard key={etapa.id} ficha={ficha} etapa={etapa} atualizar={atualizar} />
        </div>
      ) : (
        <p className="jg-aviso">Onboarding concluído.</p>
      )}
      {passos}
    </div>
  );
}
