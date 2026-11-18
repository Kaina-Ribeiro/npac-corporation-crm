'use client';
import { MFA_LIGADO } from '@npac/shared/enums';
import { cleanProfileName, PROFILE_NAME_ERROR, type ProfileDTO } from '@npac/shared/profile';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Avatar, AVATAR_EU } from '@/components/avatar';
import { showToast } from '@/components/toast';
import { authClient } from '@/lib/auth-client';
import { clientApi } from '@/lib/client-api';

// Igual ao `minPasswordLength` da API (provisório enquanto o time testa).
const SENHA_MIN = 3;

function Icone({ d, className = 'size-4' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

export const ICONE = {
  cadeado: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  email: 'M3 6h18v12H3zM3 7l9 6 9-6',
  sino: 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  seta: 'M9 6l6 6-6 6',
  alerta: 'M12 8v5M12 16.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};

/** Erro de um campo: vermelho único (`--danger`), lido pelo leitor de tela. */
export function Erro({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-[13px] font-medium text-danger"
    >
      <Icone d={ICONE.alerta} className="mt-px size-4" />
      {children}
    </p>
  );
}

/** Uma seção do perfil: título e explicação à esquerda (desktop), conteúdo à direita. */
function Secao({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className="glass-card grid gap-3 p-[18px] md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:px-7 md:py-[26px]"
    >
      <div>
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{titulo}</h2>
        <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink2 md:mt-1.5 md:text-[13px] md:leading-[19px]">
          {texto}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

/** Valor só de leitura: texto com ícone, sem caixa de campo (não parece editável). */
function Valor({ icone, children }: { icone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[15px] break-all">
      <Icone d={icone} className="size-4 text-ink3" />
      {children}
    </span>
  );
}

function Nome({ inicial }: { inicial: string }) {
  const router = useRouter();
  const salvo = useRef(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const erroId = useId();
  async function salvar(valor: string) {
    const nome = cleanProfileName(valor);
    if (!nome) return setErro(PROFILE_NAME_ERROR);
    setErro(null);
    if (nome === salvo.current) return;
    try {
      await clientApi<ProfileDTO>('/api/me/profile', 'PATCH', { name: nome });
      salvo.current = nome;
      showToast();
      // A sidebar e o Mais mostram o nome novo.
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
        Nome
        <input
          className="field w-full"
          name="name"
          defaultValue={inicial}
          autoComplete="name"
          maxLength={80}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          onBlur={(e) => void salvar(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      {erro ? (
        <Erro id={erroId}>{erro}</Erro>
      ) : (
        <span className="text-[12.5px] text-ink2">Salva sozinho quando você sai do campo.</span>
      )}
    </div>
  );
}

function Senha() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nova = String(f.get('new') ?? '');
    if (nova.length < SENHA_MIN)
      return setErro(`A nova senha precisa ter ${SENHA_MIN} caracteres ou mais.`);
    if (nova !== String(f.get('confirm') ?? '')) return setErro('As senhas não conferem.');
    setOcupado(true);
    setErro(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(f.get('current') ?? ''),
      newPassword: nova,
      revokeOtherSessions: true,
    });
    setOcupado(false);
    if (error) return setErro('Não foi possível trocar a senha. Confira a senha atual.');
    setAberto(false);
    showToast();
  }
  if (!aberto)
    return (
      <div className="flex min-h-[50px] items-center gap-3">
        <Valor icone={ICONE.cadeado}>
          <span className="tracking-[0.14em]">••••••••</span>
        </Valor>
        <button
          type="button"
          className="btn btn-secondary ml-auto"
          aria-expanded="false"
          onClick={() => setAberto(true)}
        >
          Trocar senha
        </button>
      </div>
    );
  return (
    <form className="grid gap-3.5 md:grid-cols-2" onSubmit={salvar} aria-label="Trocar senha">
      {(
        [
          ['current', 'Senha atual', 'current-password'],
          ['new', 'Nova senha', 'new-password'],
          ['confirm', 'Confirme a nova senha', 'new-password'],
        ] as const
      ).map(([name, label, ac], i) => (
        <label
          key={name}
          className={`flex flex-col gap-2 text-[13px] font-semibold text-ink2 ${i === 0 ? 'md:col-span-2' : ''}`}
        >
          {label}
          <input
            name={name}
            type="password"
            className="field w-full"
            autoComplete={ac}
            required
            autoFocus={i === 0}
          />
        </label>
      ))}
      {erro && (
        <div className="md:col-span-2">
          <Erro>{erro}</Erro>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 md:col-span-2">
        <button className="btn-dark h-11 px-5 text-[15px]" type="submit" disabled={ocupado}>
          Salvar senha
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
        >
          Cancelar
        </button>
        <span className="ml-auto text-[12.5px] text-ink2">{SENHA_MIN} caracteres ou mais.</span>
      </div>
    </form>
  );
}

/** Tela Meu perfil (NPAC-53). Foto e e-mail ganham as janelinhas nas Tarefas 6 e 7. */
export function Perfil({ profile, cargo }: { profile: ProfileDTO; cargo: React.ReactNode }) {
  return (
    <>
      <Secao
        titulo="Foto e nome"
        texto="Aparecem na sidebar, no Chat, na Equipe e nas listas do Acompanhamento."
      >
        <div className="flex flex-col items-center gap-3.5 md:flex-row md:gap-5">
          <Avatar
            name={profile.name}
            photo={profile.photo}
            className={`${AVATAR_EU} size-[108px] text-[40px] font-bold shadow-[0_0_0_3px_rgba(255,255,255,.85),0_12px_28px_-12px_rgba(0,0,0,.45)] md:size-[88px] md:text-[32px] dark:shadow-[0_0_0_3px_rgba(255,255,255,.14),0_12px_28px_-12px_rgba(0,0,0,.8)]`}
          />
          <div className="text-center md:hidden">
            <b className="block text-xl leading-[26px] font-bold tracking-[-0.02em]">
              {profile.name}
            </b>
            <span className="mt-1.5 inline-flex">{cargo}</span>
          </div>
        </div>
        <Nome inicial={profile.name} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-ink2">Usuário</span>
          <span className="flex min-h-9 items-center gap-2.5">
            <Valor icone={ICONE.cadeado}>{profile.username}</Valor>
            <span className="text-[12.5px] text-ink2">É o seu login.</span>
          </span>
        </div>
      </Secao>

      <Secao titulo="E-mail" texto="Recebe o link do “Esqueci minha senha”.">
        <div className="flex min-h-[50px] flex-wrap items-center gap-3">
          <Valor icone={ICONE.email}>{profile.email}</Valor>
        </div>
        {!profile.mailEnabled && (
          <p className="flex items-start gap-2.5 rounded-[14px] bg-white/40 px-3.5 py-3 text-[13.5px] leading-[19px] text-ink2 shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.18)] dark:bg-white/[0.05]">
            <Icone d={ICONE.alerta} className="mt-0.5 size-4" />
            Para trocar o e-mail, peça à liderança. Ela muda no Admin.
          </p>
        )}
      </Secao>

      <Secao titulo="Senha" texto="Ao trocar, os outros aparelhos saem da conta.">
        <Senha />
      </Secao>

      <Secao titulo="Este aparelho" texto="Vale só para este navegador.">
        <div className="flex flex-col gap-2">
          {(
            [
              ['/conta/avisos', 'Avisos neste aparelho', ICONE.sino],
              ...(MFA_LIGADO ? ([['/conta/mfa', 'Autenticador', ICONE.cadeado]] as const) : []),
            ] as const
          ).map(([href, rotulo, icone]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-14 items-center gap-3 rounded-[14px] bg-white/50 px-4 font-semibold shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.2)] transition-colors hover:bg-white/80 dark:bg-white/[0.05] dark:hover:bg-white/10"
            >
              <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-black/5 dark:bg-white/10">
                <Icone d={icone} className="size-[18px]" />
              </span>
              {rotulo}
              <Icone d={ICONE.seta} className="ml-auto size-[18px] text-ink3" />
            </Link>
          ))}
        </div>
      </Secao>
    </>
  );
}
