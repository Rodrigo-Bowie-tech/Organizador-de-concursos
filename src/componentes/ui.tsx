import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-verde-botao text-sobre-verde hover:brightness-95 shadow-sm',
  secundario: 'bg-superficie text-verde-forte border border-borda hover:bg-verde-suave',
  fantasma: 'text-suave hover:bg-superficie-2 hover:text-texto',
  perigo: 'bg-perigo text-sobre-perigo hover:brightness-95',
};

export function Botao({
  variante = 'primario',
  tamanho = 'normal',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: 'normal' | 'pequeno' | 'grande' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:opacity-50 disabled:pointer-events-none',
        tamanho === 'pequeno' && 'px-2.5 py-1 text-sm',
        tamanho === 'normal' && 'px-4 py-2',
        tamanho === 'grande' && 'px-6 py-3 text-lg',
        VARIANTES[variante],
        className,
      )}
    />
  );
}

export function BotaoIcone({ rotulo, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      {...props}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-suave transition hover:bg-superficie-2 hover:text-texto disabled:opacity-40',
        className,
      )}
    />
  );
}

export function Cartao({ className, children, titulo, acao }: { className?: string; children: ReactNode; titulo?: ReactNode; acao?: ReactNode }) {
  return (
    <section className={cx('rounded-xl bg-superficie p-4 shadow-cartao sm:p-5', className)}>
      {(titulo || acao) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-extrabold">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

const estiloCampo =
  'w-full rounded-lg border border-borda bg-superficie px-3 py-2 outline-none transition focus:border-verde focus:ring-2 focus:ring-verde/25';

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-bold text-suave">
        {rotulo}
      </label>
      {children(id)}
      {dica && <p className="text-xs text-suave">{dica}</p>}
    </div>
  );
}

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(estiloCampo, className)} />;
}

export function Selecao({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(estiloCampo, 'pr-8', className)} />;
}

export function AreaTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(estiloCampo, 'min-h-24', className)} />;
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  rodape,
  largo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  rodape?: ReactNode;
  largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className={cx(
        'm-auto w-[calc(100%-32px)] rounded-2xl border-0 bg-superficie p-0 shadow-cartao',
        largo ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {aberto && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-4">
            <h2 id={idTitulo} className="text-lg font-extrabold">
              {titulo}
            </h2>
            <BotaoIcone rotulo="Fechar" onClick={aoFechar}>
              ✕
            </BotaoIcone>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {rodape && <footer className="flex flex-wrap justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Confirmar({
  aberto,
  titulo,
  texto,
  rotuloAcao,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  texto: ReactNode;
  rotuloAcao: string;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              aoConfirmar();
              aoFechar();
            }}
          >
            {rotuloAcao}
          </Botao>
        </>
      }
    >
      <div className="text-suave">{texto}</div>
    </Modal>
  );
}

export function Progresso({ fracao, cor, rotulo }: { fracao: number; cor?: string; rotulo: string }) {
  const pct = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-superficie-2 ring-1 ring-borda ring-inset"
    >
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: cor ?? 'var(--verde)' }} />
    </div>
  );
}

export function Etiqueta({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'verde' | 'alerta' | 'roxo' }) {
  const tons = {
    neutro: 'bg-superficie-2 text-suave ring-1 ring-borda ring-inset',
    verde: 'bg-verde-suave text-verde-forte',
    alerta: 'bg-alerta/15 text-alerta',
    roxo: 'bg-roxo/12 text-roxo',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap', tons[tom])}>{children}</span>;
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-borda px-6 py-10 text-center">
      <p className="text-lg font-extrabold">{titulo}</p>
      <p className="max-w-md text-suave">{texto}</p>
      {acao}
    </div>
  );
}

export function CabecalhoTela({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-borda pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-suave">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}
