'use client';
import { MENTORIAS, type FichaDTO, type Mentoria } from '@npac/shared/mentoria';
import { diaMes, mesesDaJornada } from '@npac/shared/renovacoes';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { button, control, quietButton } from '@/components/crm-ui';
import { filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { showToast } from '@/components/toast';
import { Dialogo } from './dialogo';
import { dataBR, diaBR } from './ui';

const sm = `${quietButton} sm`;
const chave = (f: FichaDTO) => `inscricao:${f.id}`;

/** A version mais nova da inscrição: a da fila de salvamento, se já andou, ou a da tela. */
async function versao(f: FichaDTO) {
  const q = filaDeSalvamento();
  await q.idle();
  return q.version(chave(f)) ?? f.version;
}

/** "18/11/2027" de "2026-11-18" + 12 meses, sem fuso. */
function maisUmAno(iso: string) {
  // 29/02 + 12 meses = 28/02, como o `interval '12 months'` do banco.
  const dia = iso.slice(5, 10) === '02-29' ? '28' : iso.slice(8, 10);
  return `${dia}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 1}`;
}

/** Ano da jornada e o total de meses (NPAC-79): 1º ano = 12; depois de uma renovação, 2º ano = 24. */
export function anoDaFicha(f: FichaDTO) {
  return { ano: f.renovacoes.length + 1, total: mesesDaJornada(f.renovacoes.length) };
}

/** Selo dourado "Renovado em DD/MM" (G1): a ficha continua Ativo. */
export function SeloRenovado({ ficha }: { ficha: FichaDTO }) {
  const ultima = ficha.renovacoes.at(-1);
  return ultima ? <span className="tag gold">Renovado em {diaMes(ultima.data)}</span> : null;
}

/** Janelinha "Registrar renovação" (opção 2, NPAC-79): RDV, 2M ou 6M em botões, a data e o que muda. */
function Registrar({ ficha, onFechar }: { ficha: FichaDTO; onFechar: () => void }) {
  const router = useRouter();
  const hoje = diaBR(new Date().toISOString());
  const [mentoria, setMentoria] = useState<Mentoria>(ficha.mentoria);
  const [data, setData] = useState(hoje);
  const min = `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`;
  const { ano, total } = anoDaFicha(ficha);
  return (
    <Dialogo
      titulo="Registrar renovação"
      rotulo="Registrar renovação"
      podeConfirmar={!!data}
      onConfirmar={async () => {
        const r = await clientApi<{ version: number }>(
          `/api/mentoria/inscricoes/${ficha.id}/renovacoes`,
          'POST',
          { version: await versao(ficha), mentoria, data },
        );
        filaDeSalvamento().setVersion(chave(ficha), r.version);
        showToast();
        router.refresh();
      }}
      onFechar={onFechar}
    >
      <fieldset className="rv-escolha">
        <legend>Renova para</legend>
        <div role="radiogroup" aria-label="Renova para">
          {MENTORIAS.map((m) => (
            <label key={m} className={mentoria === m ? 'on' : ''}>
              <input
                type="radio"
                name="rv-mentoria"
                value={m}
                checked={mentoria === m}
                onChange={() => setMentoria(m)}
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="f">
        <span>Data da renovação</span>
        <input
          type="date"
          className={control}
          value={data}
          min={min}
          max={hoje}
          onChange={(e) => setData(e.target.value)}
        />
      </label>
      {ficha.terminoPrevisto && (
        <dl className="rv-resumo">
          <div>
            <dt>Novo término</dt>
            <dd>
              <s>{dataBR(ficha.terminoPrevisto)}</s> {maisUmAno(ficha.terminoPrevisto)}
            </dd>
          </div>
          <div>
            <dt>{ano + 1}º ano</dt>
            <dd>
              Meses {total + 1} a {total + 12}
            </dd>
          </div>
        </dl>
      )}
    </Dialogo>
  );
}

function Desfazer({ ficha, onFechar }: { ficha: FichaDTO; onFechar: () => void }) {
  const router = useRouter();
  const ultima = ficha.renovacoes.at(-1)!;
  return (
    <Dialogo
      titulo="Desfazer a renovação"
      texto={`O término volta para ${dataBR(ultima.terminoAnterior)} e a mentoria para ${ultima.mentoriaAnterior}. As ações do ${ultima.ano}º ano saem do plano.`}
      rotulo="Desfazer"
      perigo
      onConfirmar={async () => {
        const r = await clientApi<{ version: number }>(
          `/api/mentoria/inscricoes/${ficha.id}/renovacoes/ultima`,
          'DELETE',
          { version: await versao(ficha) },
        );
        filaDeSalvamento().setVersion(chave(ficha), r.version);
        showToast();
        router.refresh();
      }}
      onFechar={onFechar}
    />
  );
}

/** Botões do topo da Jornada: "Desfazer" (só a Admin) e "Registrar renovação" (Admin e Acompanhamento). */
export function RenovacaoAcoes({ ficha }: { ficha: FichaDTO }) {
  const [aberta, setAberta] = useState<null | 'registrar' | 'desfazer'>(null);
  if (!ficha.pode.renovar && !ficha.pode.desfazerRenovacao) return null;
  return (
    <div className="rv-acoes">
      {ficha.pode.desfazerRenovacao && (
        <button type="button" className={sm} onClick={() => setAberta('desfazer')}>
          Desfazer
        </button>
      )}
      {ficha.pode.renovar && (
        <button type="button" className={`${button} sm`} onClick={() => setAberta('registrar')}>
          Registrar renovação
        </button>
      )}
      {aberta === 'registrar' && <Registrar ficha={ficha} onFechar={() => setAberta(null)} />}
      {aberta === 'desfazer' && <Desfazer ficha={ficha} onFechar={() => setAberta(null)} />}
    </div>
  );
}
