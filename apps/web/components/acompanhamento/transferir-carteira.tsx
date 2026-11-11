'use client';
import type { PerfilLinha } from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { button, control, FormError } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';

type Pessoa = { id: string; nome: string };

/**
 * Configurações > Transferir carteira (§5): as inscrições em andamento de uma pessoa (que saiu,
 * por exemplo) vão para outra do Acompanhamento, com as ações pendentes.
 */
export function TransferirCarteira({
  responsaveis,
  perfis,
}: {
  responsaveis: Pessoa[];
  perfis: PerfilLinha[];
}) {
  const router = useRouter();
  const [de, setDe] = useState('');
  const [para, setPara] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<{ inscricoes: number; acoes: number } | null>(null);
  const recebem = perfis.filter((p) => p.perfil === 'ACOMPANHAMENTO');
  const nome = (id: string) =>
    [...responsaveis, ...perfis].find((p) => p.id === id)?.nome ?? 'a pessoa';

  return (
    <>
      <FormError message={erro} />
      <section className="card tc">
        <label className="tc-campo">
          <span>De</span>
          <select
            className={control}
            value={de}
            onChange={(e) => {
              setDe(e.target.value);
              setFeito(null);
            }}
          >
            <option value="">Escolha quem sai</option>
            {responsaveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="tc-campo">
          <span>Para</span>
          <select
            className={control}
            value={para}
            onChange={(e) => {
              setPara(e.target.value);
              setFeito(null);
            }}
          >
            <option value="">Escolha quem recebe</option>
            {recebem
              .filter((p) => p.id !== de)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className={button}
          disabled={!de || !para || de === para}
          onClick={() => setConfirmar(true)}
        >
          Transferir
        </button>
        {feito && (
          <p role="status" className="tc-ok">
            {feito.inscricoes} {feito.inscricoes === 1 ? 'inscrição passou' : 'inscrições passaram'}{' '}
            para {nome(para)}, com {feito.acoes}{' '}
            {feito.acoes === 1 ? 'ação pendente' : 'ações pendentes'}.
          </p>
        )}
      </section>
      <p className="pf-nota">
        Vão as inscrições em onboarding, ativas e pausadas. As concluídas e canceladas ficam com
        quem acompanhou. Quem recebe precisa ter o perfil Acompanhamento.
      </p>
      {confirmar && (
        <Dialogo
          titulo="Transferir carteira"
          texto={`As inscrições em andamento de ${nome(de)} e as ações pendentes passam para ${nome(para)}.`}
          rotulo="Transferir"
          onConfirmar={async () => {
            setErro('');
            try {
              setFeito(
                await clientApi<{ inscricoes: number; acoes: number }>(
                  '/api/mentoria/carteira/transferir',
                  'POST',
                  { de, para },
                ),
              );
              router.refresh();
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
          onFechar={() => setConfirmar(false)}
        />
      )}
    </>
  );
}
