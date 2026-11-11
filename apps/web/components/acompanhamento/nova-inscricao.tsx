'use client';
import {
  MENTORIAS,
  ORIGEM_LABEL,
  ORIGENS,
  STATUS_FINANCEIRO,
  STATUS_FINANCEIRO_LABEL,
  type FichaDTO,
  type Mentoria,
  type TipoInscricao,
} from '@npac/shared/mentoria';
import { parseCents } from '@npac/shared/money';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { ICONES, Icone } from './ui';

const VOLTAR = '/acompanhamento/mentorados';

type PessoaForm = { nome: string; apelido: string; whatsapp: string; email: string };
const NOVA: PessoaForm = { nome: '', apelido: '', whatsapp: '', email: '' };

/** Só os campos preenchidos: vazio é ausente no cadastro. */
const preenchidos = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim() !== ''));

function valorEmCentavos(t: string): number | undefined {
  const limpo = t.replace(/[R$\s]/g, '');
  if (!limpo) return undefined;
  return parseCents(limpo.includes(',') ? limpo.replace(/\./g, '') : limpo);
}

/** Cadastro com o essencial; o resto se completa na ficha. */
export function NovaInscricao({
  responsaveis,
  responsavelPadrao,
}: {
  /** Só quem pode ser escolhido (perfil Acompanhamento, conta ativa). */
  responsaveis: { id: string; nome: string }[];
  responsavelPadrao: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoInscricao>('INDIVIDUAL');
  const [mentoria, setMentoria] = useState<Mentoria>('RDV');
  const [pessoas, setPessoas] = useState<PessoaForm[]>([NOVA, NOVA]);
  const [compra, setCompra] = useState({
    dataCompra: '',
    valor: '',
    formaPagamento: '',
    // O PDF não define um padrão: fica sem valor até alguém informar.
    statusFinanceiro: '',
    origem: '',
    responsavelId: responsavelPadrao,
  });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const casal = tipo === 'CASAL';
  const visiveis = casal ? pessoas : pessoas.slice(0, 1);

  const mudarPessoa = (i: number, campo: keyof PessoaForm, v: string) =>
    setPessoas((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: v } : p)));

  async function cadastrar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOcupado(true);
    try {
      const { valor, ...resto } = compra;
      const valorCentavos = valorEmCentavos(valor);
      const ficha = await clientApi<FichaDTO>('/api/mentoria/inscricoes', 'POST', {
        tipo,
        mentoria,
        ...preenchidos(resto),
        ...(valorCentavos === undefined ? {} : { valorCentavos }),
        pessoas: visiveis.map((p) => preenchidos(p)),
      });
      router.push(`/acompanhamento/ficha/${ficha.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <section className="view ac-sem-nav">
      <Link className="back" href={VOLTAR}>
        <Icone d={ICONES.voltar} />
        Mentorados
      </Link>
      <div>
        <h1 className="h1">Nova inscrição</h1>
        <p className="sub">Só o essencial agora. O resto você completa na ficha.</p>
      </div>
      <form className="nf" onSubmit={(e) => void cadastrar(e)}>
        <section className="card sec">
          <div className="form">
            <div className="f w">
              <span>Tipo</span>
              <div className="seg" role="group" aria-label="Tipo de inscrição">
                {(['INDIVIDUAL', 'CASAL'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={tipo === t ? 'on' : ''}
                    aria-pressed={tipo === t}
                    onClick={() => setTipo(t)}
                  >
                    {t === 'CASAL' ? 'Casal' : 'Individual'}
                  </button>
                ))}
              </div>
            </div>
            <div className="f w">
              <span>Mentoria</span>
              <div className="seg" role="group" aria-label="Mentoria">
                {MENTORIAS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={mentoria === m ? 'on' : ''}
                    aria-pressed={mentoria === m}
                    onClick={() => setMentoria(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {visiveis.map((p, i) => (
          <section className="card sec" key={i}>
            <header>
              <h2>{casal ? `Pessoa ${i + 1}` : 'Pessoa'}</h2>
            </header>
            <div className="form">
              <label className="f w">
                <span>Nome completo</span>
                <input
                  className={control}
                  placeholder="Obrigatório"
                  required
                  maxLength={200}
                  value={p.nome}
                  onChange={(e) => mudarPessoa(i, 'nome', e.target.value)}
                />
              </label>
              <label className="f w">
                <span>Como prefere ser chamado</span>
                <input
                  className={control}
                  maxLength={80}
                  value={p.apelido}
                  onChange={(e) => mudarPessoa(i, 'apelido', e.target.value)}
                />
              </label>
              <label className="f w">
                <span>WhatsApp com DDD</span>
                <input
                  className={control}
                  inputMode="tel"
                  value={p.whatsapp}
                  onChange={(e) => mudarPessoa(i, 'whatsapp', e.target.value)}
                />
              </label>
              <label className="f w">
                <span>E-mail</span>
                <input
                  className={control}
                  type="email"
                  value={p.email}
                  onChange={(e) => mudarPessoa(i, 'email', e.target.value)}
                />
              </label>
            </div>
          </section>
        ))}

        <section className="card sec">
          <header>
            <h2>Compra</h2>
          </header>
          <div className="form">
            <label className="f">
              <span>Data de compra</span>
              <input
                className={control}
                type="date"
                value={compra.dataCompra}
                onChange={(e) => setCompra({ ...compra, dataCompra: e.target.value })}
              />
            </label>
            <label className="f">
              <span>Valor</span>
              <input
                className={control}
                placeholder="R$ 0,00"
                inputMode="decimal"
                value={compra.valor}
                onChange={(e) => setCompra({ ...compra, valor: e.target.value })}
              />
            </label>
            <label className="f w">
              <span>Forma de pagamento</span>
              <input
                className={control}
                maxLength={120}
                value={compra.formaPagamento}
                onChange={(e) => setCompra({ ...compra, formaPagamento: e.target.value })}
              />
            </label>
            <label className="f">
              <span>Status financeiro</span>
              <select
                className={control}
                value={compra.statusFinanceiro}
                onChange={(e) => setCompra({ ...compra, statusFinanceiro: e.target.value })}
              >
                <option value="">Não informado</option>
                {STATUS_FINANCEIRO.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_FINANCEIRO_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              <span>Origem</span>
              <select
                className={control}
                value={compra.origem}
                onChange={(e) => setCompra({ ...compra, origem: e.target.value })}
              >
                <option value="">Selecione</option>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>
                    {ORIGEM_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="f w">
              <span>Responsável</span>
              <select
                className={control}
                value={compra.responsavelId}
                onChange={(e) => setCompra({ ...compra, responsavelId: e.target.value })}
              >
                <option value="">Sem responsável</option>
                {responsaveis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <FormError message={erro} />
        <div className="nf-barra">
          <p className="nf-nota">
            Ao cadastrar, entra na Fila da Operação: criar o grupo e enviar as boas-vindas.
          </p>
          <div className="nf-botoes">
            <Link className={quietButton} href={VOLTAR}>
              Cancelar
            </Link>
            <button type="submit" className={button} disabled={ocupado}>
              Cadastrar inscrição
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
