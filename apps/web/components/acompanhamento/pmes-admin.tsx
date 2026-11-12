'use client';
import { nomePme, NUMEROS_PME, type PmeDTO } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { quietButton, FormError } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion, salvarCampo } from '@/lib/acompanhamento-saver';
import { CampoPr } from './campo';
import { CampoSimNao } from './etapa-card';
import { IndicadorSalvo } from './indicador-salvo';
import { ICONES, Icone } from './ui';

const raiz = '/acompanhamento/configuracoes';
export const AVISO_PMES =
  'Vale para os próximos envios. Os ciclos já enviados mantêm as tarefas com que nasceram.';

const resumo = (p: PmeDTO) => {
  const extras = p.atividadesExtras.length;
  const partes = [
    extras === 0
      ? 'Sem atividades extras'
      : `${extras} atividade${extras > 1 ? 's' : ''} extra${extras > 1 ? 's' : ''}`,
    p.encerramento ? 'encerramento próprio' : 'encerramento padrão',
  ];
  return partes.join(', ');
};

/** Configurações > PMEs: os 13 números, cadastrados ou não. */
export function PmesAdmin({ pmes }: { pmes: PmeDTO[] }) {
  const router = useRouter();
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState<number | null>(null);

  async function cadastrar(numero: number) {
    setErro('');
    setCriando(numero);
    try {
      const r = await clientApi<{ id: string }>('/api/mentoria/pmes', 'PUT', { numero });
      router.push(`${raiz}/pmes/${r.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setCriando(null);
    }
  }

  return (
    <>
      <section className="card overflow-hidden">
        <ul className="pl-lista">
          {NUMEROS_PME.map((n) => {
            const p = pmes.find((x) => x.numero === n);
            if (!p)
              return (
                <li key={n}>
                  <div className="pl-mod pme-vazio">
                    <b className="pl-n">{n}</b>
                    <div className="min-w-0">
                      <span className="t">{nomePme(n)}</span>
                      <span className="d">Não cadastrado</span>
                    </div>
                    <button
                      type="button"
                      className={`${quietButton} sm`}
                      disabled={criando !== null}
                      aria-label={`Cadastrar o ${nomePme(n)}`}
                      onClick={() => void cadastrar(n)}
                    >
                      Cadastrar
                    </button>
                  </div>
                </li>
              );
            return (
              <li key={n}>
                <Link className={`pl-mod ${p.ativo ? '' : 'off'}`} href={`${raiz}/pmes/${p.id}`}>
                  <b className="pl-n">{n}</b>
                  <div className="min-w-0">
                    <span className="t">{nomePme(n, p.titulo)}</span>
                    <span className="d">{p.foco ?? resumo(p)}</span>
                  </div>
                  <span className="r">{p.foco ? resumo(p) : ''}</span>
                  {!p.ativo && <span className="tag">Inativo</span>}
                  <Icone d={ICONES.seta} className="seta" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <FormError message={erro} />
      <p className="pf-nota">
        {AVISO_PMES} O número 0 é o PME de Aquecimento do onboarding; os ciclos vão do 1º ao 12º.
      </p>
    </>
  );
}

const paraLinhas = (t: string) =>
  t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Um PME do catálogo, aberto em página própria. Salva ao sair de cada campo. */
export function PmeForm({ pme }: { pme: PmeDTO }) {
  const router = useRouter();
  const chave = `pme:${pme.id}`;
  const [extras, setExtras] = useState(pme.atividadesExtras.join('\n'));
  const [encerramento, setEncerramento] = useState(pme.encerramento ?? '');
  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());
  useEffect(() => {
    registrarVersion(chave, pme.version);
  }, [chave, pme.version]);
  const base = { chave };
  const nome = nomePme(pme.numero);
  return (
    <section className="view pl-acao">
      <Link className="back" href={`${raiz}?aba=pmes`}>
        <Icone d={ICONES.voltar} />
        PMEs
      </Link>
      <div>
        <h1 className="h1">{nomePme(pme.numero, pme.titulo)}</h1>
        <p className="sub">{AVISO_PMES}</p>
        <div className="fh-tags">
          <span className="tag gold">{nome}</span>
          {!pme.ativo && <span className="tag">Inativo</span>}
          <IndicadorSalvo />
        </div>
      </div>
      <section className="card pa">
        <CampoPr
          {...base}
          rotulo="Título"
          campo="titulo"
          valor={pme.titulo}
          placeholder={nome}
          aoSalvar={atualizar}
        />
        <CampoPr {...base} rotulo="Foco" campo="foco" valor={pme.foco} classe="longo" />
        <CampoPr
          {...base}
          rotulo="Material"
          campo="linkMaterial"
          valor={pme.linkMaterial}
          inputMode="url"
          placeholder="https://drive.google.com/..."
        />
        <CampoSimNao
          {...base}
          editavel
          rotulo="Ativo"
          campo="ativo"
          valor={pme.ativo}
          aoSalvar={atualizar}
        />
        <div className="tx pl-tx">
          <label>
            <small>
              Atividades extras, uma por linha (cada uma vira uma tarefa com comprovante)
            </small>
            <textarea
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              onBlur={() => {
                const novo = paraLinhas(extras);
                if (JSON.stringify(novo) !== JSON.stringify(pme.atividadesExtras))
                  salvarCampo(
                    chave,
                    'atividadesExtras',
                    novo,
                    JSON.stringify(pme.atividadesExtras),
                  );
              }}
            />
          </label>
        </div>
        <div className="tx pl-tx">
          <label>
            <small>Tarefa de encerramento (vazio: &ldquo;Encerramento do {nome}&rdquo;)</small>
            <textarea
              value={encerramento}
              onChange={(e) => setEncerramento(e.target.value)}
              onBlur={() => {
                const novo = encerramento.trim();
                if (novo !== (pme.encerramento ?? ''))
                  salvarCampo(chave, 'encerramento', novo || null, pme.encerramento);
              }}
            />
          </label>
        </div>
      </section>
    </section>
  );
}
