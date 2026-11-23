'use client';
import {
  ENVIO_TIPO_LABEL,
  ENVIO_TIPOS_MANUAIS,
  type EnvioDTO,
  type EnviosDTO,
  type EnvioTipo,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition, type FormEvent } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { showToast } from '@/components/toast';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { EscolherMentorado, type Escolhido } from './reuniao-nova';
import { dataBR, Icone, ICONES } from './ui';

/**
 * Envios físicos (NPAC-56, Parte 2; protótipo aprovado pelo Gabriel, "A"). O cargo Envios (a Maria) vê só
 * esta aba: nome, endereço e a foto do presente. Marca enviado (data e rastreio) e entregue; a Caixa
 * entregue conclui a etapa Caixa do onboarding (no banco). A gestão vê o mesmo, com "Abrir ficha" e
 * "Novo envio" (kit ou certificado).
 */

const TIPO_CURTO: Record<EnvioTipo, string> = {
  CAIXA: 'Caixa',
  PRESENTE_FAMILIA: 'Presente',
  KIT: 'Kit',
  CERTIFICADO: 'Certificado',
};

const TIPO_ICONE: Record<EnvioTipo, string> = {
  CAIXA: ICONES.envios,
  PRESENTE_FAMILIA:
    'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10 3 7.5 4 9 7 12 7M12 7s2-4 4.5-3S15 7 12 7',
  KIT: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  CERTIFICADO: 'M5 4h14v11H5zM9 8h6M9 11h4M10 15l-1 6 3-2 3 2-1-6',
};

/** Caixa e presente sem linha no banco ainda (id nulo) são um por inscrição. */
const chave = (e: EnvioDTO) => e.id ?? `${e.inscricaoId}:${e.tipo}`;
const juntarNomes = (n: string[]) => n.join(' e ');
const cepBR = (c: string | null) => (c && /^\d{8}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : c);

type Marcacao = {
  e: EnvioDTO;
  status: 'ENVIADO' | 'ENTREGUE';
  data: string;
  rastreio: string | null;
};
type Marcar = (m: Marcacao) => void;

function CopiarEndereco({ e }: { e: EnvioDTO }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="ef-copiar"
      onClick={() => {
        const texto = [juntarNomes(e.nomes), e.endereco, e.cep ? `CEP ${cepBR(e.cep)}` : '']
          .filter(Boolean)
          .join('\n');
        void navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        });
      }}
    >
      {copiado ? 'Copiado' : 'Copiar endereço'}
    </button>
  );
}

function Cartao({
  e,
  gestao,
  hoje,
  marcar,
}: {
  e: EnvioDTO;
  gestao: boolean;
  hoje: string;
  marcar: Marcar;
}) {
  const [aberto, setAberto] = useState(false);
  const enviar = (x: FormEvent<HTMLFormElement>) => {
    x.preventDefault();
    const f = new FormData(x.currentTarget);
    const rastreio = String(f.get('rastreio') ?? '').trim();
    setAberto(false);
    marcar({ e, status: 'ENVIADO', data: String(f.get('data') ?? ''), rastreio: rastreio || null });
  };
  return (
    <article
      className="card ef-card"
      aria-label={`${ENVIO_TIPO_LABEL[e.tipo]}: ${juntarNomes(e.nomes)}`}
    >
      <div className="ef-topo">
        <span className="ef-ico">
          <Icone d={TIPO_ICONE[e.tipo]} />
        </span>
        <span className="ef-tipo">{ENVIO_TIPO_LABEL[e.tipo]}</span>
      </div>
      <div className="ef-corpo">
        <div className="ef-dados">
          <h3 className="ef-nome">{juntarNomes(e.nomes)}</h3>
          {e.endereco ? (
            <>
              <p className="ef-end">
                {e.endereco}
                {e.cep && <span>CEP {cepBR(e.cep)}</span>}
              </p>
              <CopiarEndereco e={e} />
            </>
          ) : (
            <p className="ef-end falta">Sem endereço na ficha</p>
          )}
        </div>
        {e.fotoMidiaId && (
          <a
            className="ef-foto"
            href={`/api/mentoria/midia/${e.fotoMidiaId}`}
            target="_blank"
            rel="noreferrer"
          >
            <img src={`/api/mentoria/midia/${e.fotoMidiaId}`} alt="Foto da família" />
            <span>Ver foto</span>
          </a>
        )}
      </div>
      {aberto ? (
        <form className="ef-form" onSubmit={enviar}>
          <label>
            <span>Data de envio</span>
            <input
              className={control}
              type="date"
              name="data"
              required
              defaultValue={hoje}
              max={hoje}
            />
          </label>
          <label>
            <span>Rastreio (opcional)</span>
            <input className={control} type="text" name="rastreio" maxLength={120} />
          </label>
          <div className="ef-acoes">
            <button type="submit" className={button}>
              Marcar enviado
            </button>
            <button type="button" className={quietButton} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="ef-acoes">
          <button
            type="button"
            className={button}
            disabled={!e.endereco}
            onClick={() => setAberto(true)}
          >
            Marcar enviado
          </button>
          {gestao && (
            <Link
              className={quietButton}
              href={`/acompanhamento/ficha/${e.inscricaoId}`}
              prefetch={false}
            >
              Abrir ficha
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

function Transito({
  e,
  primeira,
  hoje,
  marcar,
}: {
  e: EnvioDTO;
  primeira: boolean;
  hoje: string;
  marcar: Marcar;
}) {
  const [aberto, setAberto] = useState(false);
  const entregar = (x: FormEvent<HTMLFormElement>) => {
    x.preventDefault();
    const data = String(new FormData(x.currentTarget).get('data') ?? '');
    setAberto(false);
    marcar({ e, status: 'ENTREGUE', data, rastreio: null });
  };
  return (
    <li className={`ef-r ${primeira ? 'p1' : ''}`}>
      <div className="ef-id">
        <b>{juntarNomes(e.nomes)}</b>
        <small>
          {TIPO_CURTO[e.tipo]} · enviado em {dataBR(e.enviadoEm)}
          {e.rastreio ? ` · ${e.rastreio}` : ''}
        </small>
      </div>
      {aberto ? (
        <form className="ef-form ef-form-l" onSubmit={entregar}>
          <label>
            <span>Recebido em</span>
            <input
              className={control}
              type="date"
              name="data"
              required
              defaultValue={hoje}
              min={e.enviadoEm ?? undefined}
              max={hoje}
            />
          </label>
          <div className="ef-acoes">
            <button type="submit" className={`${button} sm`}>
              Marcar entregue
            </button>
            <button type="button" className={`${quietButton} sm`} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${button} sm`} onClick={() => setAberto(true)}>
          Marcar entregue
        </button>
      )}
    </li>
  );
}

/** "Novo envio" da gestão: kit ou certificado (G10); caixa e presente entram sozinhos. */
function NovoEnvio({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const [mentorado, setMentorado] = useState<Escolhido | null>(null);
  const [tipo, setTipo] = useState<(typeof ENVIO_TIPOS_MANUAIS)[number]>('KIT');
  return (
    <Dialogo
      titulo="Novo envio"
      texto="Caixa e presente da família entram sozinhos."
      rotulo="Criar envio"
      podeConfirmar={!!mentorado}
      onFechar={onFechar}
      onConfirmar={async () => {
        await clientApi('/api/mentoria/envios', 'POST', { inscricaoId: mentorado!.id, tipo });
        showToast();
        router.refresh();
      }}
    >
      <div className="flex flex-col gap-3">
        <EscolherMentorado rotulo="Mentorado" valor={mentorado} aoEscolher={setMentorado} />
        <label className="f w">
          <span>O que enviar</span>
          <select
            className={control}
            value={tipo}
            onChange={(x) => setTipo(x.target.value as typeof tipo)}
          >
            {ENVIO_TIPOS_MANUAIS.map((t) => (
              <option key={t} value={t}>
                {ENVIO_TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Dialogo>
  );
}

export function Envios({ dados, gestao }: { dados: EnviosDTO; gestao: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<EnvioTipo | ''>('');
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Marcar (NPAC-47): o envio muda de bloco no clique; erro da API o devolve, com a mensagem.
  const [marcados, aplicar] = useOptimistic<Map<string, Marcacao>, Marcacao>(new Map(), (m, x) =>
    new Map(m).set(chave(x.e), x),
  );

  const todos = [...dados.aEnviar, ...dados.emTransito, ...dados.entregues].map((e): EnvioDTO => {
    const m = marcados.get(chave(e));
    if (!m) return e;
    return m.status === 'ENVIADO'
      ? { ...e, status: 'ENVIADO', enviadoEm: m.data, rastreio: m.rastreio }
      : { ...e, status: 'ENTREGUE', entregueEm: m.data };
  });
  const lista = todos.filter((e) => !filtro || e.tipo === filtro);
  const aEnviar = lista.filter((e) => e.status === 'PREPARANDO');
  const emTransito = lista.filter((e) => e.status === 'ENVIADO');
  const entregues = lista
    .filter((e) => e.status === 'ENTREGUE')
    .sort((a, b) => (b.entregueEm ?? '').localeCompare(a.entregueEm ?? ''));

  const marcar: Marcar = (m) => {
    setErro(null);
    startTransition(async () => {
      aplicar(m);
      try {
        await clientApi('/api/mentoria/envios/marcar', 'POST', {
          inscricaoId: m.e.inscricaoId,
          tipo: m.e.tipo,
          envioId: m.e.id,
          version: m.e.version,
          status: m.status,
          data: m.data || null,
          ...(m.rastreio ? { rastreio: m.rastreio } : {}),
        });
        showToast();
        router.refresh();
      } catch (x) {
        setErro((x as Error).message);
      }
    });
  };

  const filtros: [EnvioTipo | '', string][] = [
    ['', 'Todos'],
    ['CAIXA', 'Caixa'],
    ['PRESENTE_FAMILIA', 'Presente'],
    ['KIT', 'Kit'],
    ['CERTIFICADO', 'Certificado'],
  ];

  return (
    <section className="view ef">
      <div className="hrow">
        <div>
          <h1 className="h1">Envios físicos</h1>
          <p className="sub">
            {aEnviar.length} a enviar, {emTransito.length} em trânsito.
          </p>
        </div>
        <div className="acts">
          <div className="seg ef-seg" role="group" aria-label="Tipo de envio">
            {filtros.map(([id, rotulo]) => (
              <button
                key={id || 'todos'}
                type="button"
                className={filtro === id ? 'on' : ''}
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {gestao && (
            <button type="button" className={button} onClick={() => setNovo(true)}>
              Novo envio
            </button>
          )}
        </div>
      </div>

      <FormError message={erro ?? ''} />

      <div>
        <h2 className="ef-h">
          A enviar<span>{aEnviar.length}</span>
        </h2>
        {aEnviar.length > 0 ? (
          <div className="ef-grade">
            {aEnviar.map((e) => (
              <Cartao key={chave(e)} e={e} gestao={gestao} hoje={dados.hoje} marcar={marcar} />
            ))}
          </div>
        ) : (
          <div className="card ob-vazio">Nada a enviar agora.</div>
        )}
      </div>

      <div className="ef-baixo">
        <section className="card overflow-hidden" aria-label="Em trânsito">
          <h2 className="ob-h">
            Em trânsito<span>{emTransito.length}</span>
          </h2>
          {emTransito.length > 0 ? (
            <ul className="ef-lista">
              {emTransito.map((e, i) => (
                <Transito
                  key={chave(e)}
                  e={e}
                  primeira={i === 0}
                  hoje={dados.hoje}
                  marcar={marcar}
                />
              ))}
            </ul>
          ) : (
            <p className="ob-vazio">Nada em trânsito.</p>
          )}
        </section>
        <section className="card overflow-hidden" aria-label="Entregues">
          <h2 className="ob-h">
            Entregues<span>{entregues.length}</span>
            <small className="ef-30">últimos 30 dias</small>
          </h2>
          {entregues.length > 0 ? (
            <ul className="ef-lista">
              {entregues.map((e, i) => (
                <li key={chave(e)} className={`ef-r ${i === 0 ? 'p1' : ''}`}>
                  <div className="ef-id">
                    <b>{juntarNomes(e.nomes)}</b>
                    <small>
                      {TIPO_CURTO[e.tipo]} · entregue em {dataBR(e.entregueEm)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ob-vazio">Nada entregue nos últimos 30 dias.</p>
          )}
        </section>
      </div>
      {novo && <NovoEnvio onFechar={() => setNovo(false)} />}
    </section>
  );
}
