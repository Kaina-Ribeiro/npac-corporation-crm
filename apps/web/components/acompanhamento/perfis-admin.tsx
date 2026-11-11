'use client';
import { PERFIL_LABEL, PERFIS, type Perfil, type PerfilLinha } from '@npac/shared/mentoria';
import { useState } from 'react';
import { control, FormError } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Rostos } from './ui';

/** Configurações > Perfis: perfil e selo de Admin de cada pessoa com o cargo Acompanhamento. */
export function PerfisAdmin({ inicial }: { inicial: PerfilLinha[] }) {
  const [linhas, setLinhas] = useState(inicial);
  const [erro, setErro] = useState('');

  async function definir(id: string, perfil: Perfil | null, admin: boolean) {
    const antes = linhas;
    setErro('');
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, perfil, admin } : l)));
    try {
      await clientApi('/api/mentoria/perfis', 'PUT', { userId: id, perfil, admin });
    } catch (e) {
      setLinhas(antes);
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <FormError message={erro} />
      <section className="card overflow-hidden">
        {linhas.map((u, i) => (
          <div className={`pf ${i ? '' : 'p1'}`} key={u.id}>
            <Rostos pessoas={[{ nome: u.nome, fotoMidiaId: null }]} />
            <div className="nm">
              <b>{u.nome}</b>
              <span>Cargo Acompanhamento</span>
            </div>
            <select
              className={control}
              aria-label={`Perfil de ${u.nome}`}
              value={u.perfil ?? ''}
              onChange={(e) => {
                const perfil = (e.target.value || null) as Perfil | null;
                void definir(u.id, perfil, perfil ? u.admin : false);
              }}
            >
              <option value="">Sem perfil</option>
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {PERFIL_LABEL[p]}
                </option>
              ))}
            </select>
            <div className="pf-admin">
              Admin
              <button
                type="button"
                className={`sw ${u.admin ? 'on' : ''}`}
                role="switch"
                aria-checked={u.admin}
                aria-label={`Admin para ${u.nome}`}
                disabled={!u.perfil}
                title={u.perfil ? undefined : 'Defina um perfil antes'}
                onClick={() => void definir(u.id, u.perfil, !u.admin)}
              >
                <i />
              </button>
            </div>
          </div>
        ))}
        {linhas.length === 0 && (
          <div className="vazio">
            <h2>Ninguém com o cargo Acompanhamento</h2>
            <p>A liderança cria o login com esse cargo, e você define o perfil aqui.</p>
          </div>
        )}
      </section>
    </>
  );
}
