import {
  MENTORIAS,
  type Mentoria,
  type PerfilLinha,
  type PlanoModeloLinha,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ImportarCarteira } from '@/components/acompanhamento/importar-carteira';
import { PerfisAdmin } from '@/components/acompanhamento/perfis-admin';
import { PlanoModeloAdmin } from '@/components/acompanhamento/plano-modelo-admin';
import { ICONES, Icone } from '@/components/acompanhamento/ui';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Configurações' };

const SUB = {
  perfis: 'Quem usa o Acompanhamento e o que cada pessoa pode fazer.',
  plano: 'A ação de cada mês, por mentoria.',
  importacao: 'Traga a carteira atual do gerenciador e da planilha, sem redigitar.',
};

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; mentoria?: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const q = await searchParams;
  const aba = q.aba === 'importacao' || q.aba === 'plano' ? q.aba : 'perfis';
  const mentoria = MENTORIAS.includes(q.mentoria as Mentoria) ? (q.mentoria as Mentoria) : 'RDV';
  const perfis = aba === 'perfis' ? await apiGet<PerfilLinha[]>('/api/mentoria/perfis') : [];
  const modelo =
    aba === 'plano' ? await apiGet<PlanoModeloLinha[]>('/api/mentoria/plano-modelo') : [];
  return (
    <section className="view">
      <Link className="back so-cel" href="/acompanhamento/mais">
        <Icone d={ICONES.voltar} />
        Mais
      </Link>
      <div>
        <h1 className="h1">Configurações</h1>
        <p className="sub">{SUB[aba]}</p>
      </div>
      <div className="tabs">
        <Link className={aba === 'perfis' ? 'on' : ''} href="/acompanhamento/configuracoes">
          Perfis
        </Link>
        <Link
          className={aba === 'plano' ? 'on' : ''}
          href="/acompanhamento/configuracoes?aba=plano"
        >
          Plano-modelo
        </Link>
        <span className="off">Mensagens-modelo</span>
        <Link
          className={aba === 'importacao' ? 'on' : ''}
          href="/acompanhamento/configuracoes?aba=importacao"
        >
          Importação
        </Link>
        <span className="off">Transferir carteira</span>
      </div>
      {aba === 'importacao' && <ImportarCarteira />}
      {aba === 'plano' && <PlanoModeloAdmin linhas={modelo} mentoria={mentoria} />}
      {aba === 'perfis' && (
        <>
          <PerfisAdmin inicial={perfis} />
          <p className="pf-nota">
            A Diretoria é Admin automaticamente. Conta nova: a liderança cria o login com o cargo
            Acompanhamento, e você define o perfil aqui.
          </p>
        </>
      )}
    </section>
  );
}
