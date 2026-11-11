import type { PerfilLinha } from '@npac/shared/mentoria';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PerfisAdmin } from '@/components/acompanhamento/perfis-admin';
import { ICONES, Icone } from '@/components/acompanhamento/ui';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Configurações' };

export default async function ConfiguracoesPage() {
  if (!(await sessaoDoModulo())) return null;
  if (!(await lerEu())?.admin) notFound();
  const perfis = await apiGet<PerfilLinha[]>('/api/mentoria/perfis');
  return (
    <section className="view">
      <Link className="back so-cel" href="/acompanhamento/mais">
        <Icone d={ICONES.voltar} />
        Mais
      </Link>
      <div>
        <h1 className="h1">Configurações</h1>
        <p className="sub">Quem usa o Acompanhamento e o que cada pessoa pode fazer.</p>
      </div>
      <div className="tabs">
        <a className="on" href="#perfis">
          Perfis
        </a>
        <span className="off">Plano-modelo</span>
        <span className="off">Mensagens-modelo</span>
        <span className="off">Importação</span>
        <span className="off">Transferir carteira</span>
      </div>
      <PerfisAdmin inicial={perfis} />
      <p className="pf-nota">
        A Diretoria é Admin automaticamente. Conta nova: a liderança cria o login com o cargo
        Acompanhamento, e você define o perfil aqui.
      </p>
    </section>
  );
}
