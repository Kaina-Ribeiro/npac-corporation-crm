'use client';
import { ENVIO_STATUS_LABEL, podeEnviar, type FichaDTO } from '@npac/shared/mentoria';
import { useState } from 'react';
import { button, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { dataBR } from './ui';

const sm = (classe: string) => `${classe} sm`;

/** Registro do envio físico: endereço, data de envio, rastreio e recebimento (PDF, etapa 5). */
export function CaixaForm({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const caixa = ficha.caixa;
  const [enviadoEm, setEnviadoEm] = useState(caixa?.enviadoEm ?? '');
  const [rastreio, setRastreio] = useState(caixa?.rastreio ?? '');
  const [entregueEm, setEntregueEm] = useState(caixa?.entregueEm ?? '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const liberada = podeEnviar('CAIXA', ficha.onboarding);
  const ed = ficha.pode.onboarding;
  const status = caixa?.status ?? 'PREPARANDO';

  async function salvar(novo: 'ENVIADO' | 'ENTREGUE') {
    setErro('');
    setOcupado(true);
    try {
      await filaDeSalvamento().idle();
      await clientApi(`/api/mentoria/inscricoes/${ficha.id}/caixa`, 'PUT', {
        version: caixa?.version ?? 0,
        status: novo,
        enviadoEm: enviadoEm || null,
        rastreio: rastreio || null,
        ...(novo === 'ENTREGUE' ? { entregueEm: entregueEm || null } : {}),
      });
      atualizar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <div className="pr">
        <span>Situação</span>
        <span className="pv-fixo">{caixa ? ENVIO_STATUS_LABEL[status] : 'Ainda não enviada'}</span>
      </div>
      <div className="pr">
        <span>Endereço</span>
        <span className="pv-fixo ob-texto">
          {ficha.endereco?.endereco ?? 'Preencha na aba Pessoa'}
        </span>
      </div>
      {status === 'ENTREGUE' ? (
        <>
          <div className="pr">
            <span>Enviada em</span>
            <span className="pv-fixo">{dataBR(caixa?.enviadoEm)}</span>
          </div>
          <div className="pr">
            <span>Rastreio</span>
            <span className="pv-fixo">{caixa?.rastreio ?? '—'}</span>
          </div>
          <div className="pr">
            <span>Recebida em</span>
            <span className="pv-fixo">{dataBR(caixa?.entregueEm)}</span>
          </div>
        </>
      ) : (
        <>
          <label className="pr">
            <span>Data de envio</span>
            <input
              className={`pv ${enviadoEm ? '' : 'vazia'}`}
              type="date"
              value={enviadoEm}
              readOnly={!ed}
              onChange={(e) => setEnviadoEm(e.target.value)}
            />
          </label>
          <label className="pr">
            <span>Rastreio</span>
            <input
              className="pv"
              value={rastreio}
              maxLength={120}
              readOnly={!ed}
              placeholder={ed ? 'Código dos Correios' : undefined}
              onChange={(e) => setRastreio(e.target.value)}
            />
          </label>
          {status === 'ENVIADO' && (
            <label className="pr">
              <span>Data de recebimento</span>
              <input
                className={`pv ${entregueEm ? '' : 'vazia'}`}
                type="date"
                value={entregueEm}
                readOnly={!ed}
                onChange={(e) => setEntregueEm(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      <FormError message={erro} />
      {ed && status !== 'ENTREGUE' && (
        <div className="ob-acoes">
          {status === 'ENVIADO' ? (
            <>
              <button
                type="button"
                className={sm(button)}
                disabled={ocupado || !entregueEm}
                onClick={() => void salvar('ENTREGUE')}
              >
                Marcar entregue
              </button>
              <button
                type="button"
                className={sm(quietButton)}
                disabled={ocupado}
                onClick={() => void salvar('ENVIADO')}
              >
                Salvar envio
              </button>
            </>
          ) : (
            <button
              type="button"
              className={sm(button)}
              disabled={ocupado || !enviadoEm || !liberada}
              onClick={() => void salvar('ENVIADO')}
            >
              Registrar envio
            </button>
          )}
          {!liberada && <p className="ob-nota">Falta o formulário preenchido, nas Boas-vindas.</p>}
        </div>
      )}
    </div>
  );
}
