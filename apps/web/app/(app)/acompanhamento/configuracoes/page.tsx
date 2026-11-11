import type { PerfilLinha } from '@npac/shared/mentoria';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportarCarteira } from '@/components/acompanhamento/importar-carteira';
import { PerfisAdmin } from '@/components/acompanhamento/perfis-admin';
import { ICONES, Icone } from '@/components/acompanhamento/ui';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Configurações' };

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const importacao = (await searchParams).aba === 'importacao';
  const perfis = importacao ? [] : await apiGet<PerfilLinha[]>('/api/mentoria/perfis');
  return (
    <section className="view">
      <Link className="back so-cel" href="/acompanhamento/mais">
        <Icone d={ICONES.voltar} />
        Mais
      </Link>
      <div>
        <h1 className="h1">Configurações</h1>
        <p className="sub">
          {importacao
            ? 'Traga a carteira atual do gerenciador e da planilha, sem redigitar.'
            : 'Quem usa o Acompanhamento e o que cada pessoa pode fazer.'}
        </p>
      </div>
      <div className="tabs">
        <Link className={importacao ? '' : 'on'} href="/acompanhamento/configuracoes">
          Perfis
        </Link>
        <span className="off">Plano-modelo</span>
        <span className="off">Mensagens-modelo</span>
        <Link
          className={importacao ? 'on' : ''}
          href="/acompanhamento/configuracoes?aba=importacao"
        >
          Importação
        </Link>
        <span className="off">Transferir carteira</span>
      </div>
      {importacao ? (
        <ImportarCarteira />
      ) : (
        <>
          <PerfisAdmin inicial={perfis} />
          <p className="pf-nota">
            A Diretoria é Admin automaticamente. Conta nova: a Diretoria cria o login no Admin do
            CRM, já com o perfil. Aqui você troca o perfil de quem já está na equipe.
          </p>
        </>
      )}
    </section>
  );
}
