import { BookOpenCheck, FolderOpen, History, House, Layers, Menu, Settings, Timer, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { BotaoCronometro } from './componentes/BotaoCronometro';
import { VigiaPomodoro } from './componentes/VigiaPomodoro';
import { cx } from './componentes/ui';
import { useApp } from './estado';
import type { Tela } from './estado';
import { dentroDoClaude } from './plataforma';
import { Concursos } from './telas/Concursos';
import { Configuracoes } from './telas/Configuracoes';
import { Cronometro } from './telas/Cronometro';
import { Disciplinas } from './telas/Disciplinas';
import { Edital } from './telas/Edital';
import { Historico } from './telas/Historico';
import { Home } from './telas/Home';

const ITENS: { tela: Tela; rotulo: string; icone: LucideIcon }[] = [
  { tela: 'home', rotulo: 'Home', icone: House },
  { tela: 'concursos', rotulo: 'Concursos', icone: FolderOpen },
  { tela: 'disciplinas', rotulo: 'Disciplinas', icone: Layers },
  { tela: 'edital', rotulo: 'Edital', icone: BookOpenCheck },
  { tela: 'cronometro', rotulo: 'Cronômetro', icone: Timer },
  { tela: 'historico', rotulo: 'Histórico', icone: History },
  { tela: 'configuracoes', rotulo: 'Configurações', icone: Settings },
];

const TELAS: Record<Tela, ComponentType> = {
  home: Home,
  concursos: Concursos,
  disciplinas: Disciplinas,
  edital: Edital,
  cronometro: Cronometro,
  historico: Historico,
  configuracoes: Configuracoes,
};

function Marca() {
  return (
    <div className="flex items-center gap-2.5 text-menu-texto">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20 text-lg font-extrabold">OC</span>
      <span className="leading-tight">
        <span className="block text-lg font-extrabold">Organizador</span>
        <span className="block text-xs font-bold opacity-80">de concursos</span>
      </span>
    </div>
  );
}

function MenuLateral({ aoNavegar }: { aoNavegar?: () => void }) {
  const { tela, irPara } = useApp();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1 px-3">
      {ITENS.map(({ tela: t, rotulo, icone: Icone }) => (
        <button
          key={t}
          type="button"
          aria-current={tela === t ? 'page' : undefined}
          onClick={() => {
            irPara(t);
            aoNavegar?.();
          }}
          className={cx(
            'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left font-bold text-menu-texto transition hover:bg-menu-ativo',
            tela === t && 'bg-menu-ativo',
          )}
        >
          {tela === t && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1.5 rounded-r bg-white" aria-hidden />}
          <Icone size={20} strokeWidth={2.2} />
          {rotulo}
        </button>
      ))}
    </nav>
  );
}

function Avisos() {
  const { avisos } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tipo === 'erro' ? 'alert' : 'status'}
          className={cx(
            'pointer-events-auto max-w-md rounded-lg px-4 py-2.5 font-bold shadow-cartao',
            a.tipo === 'erro' ? 'bg-perigo text-white' : 'bg-texto text-fundo',
          )}
        >
          {a.texto}
        </div>
      ))}
    </div>
  );
}

function SeletorConcurso() {
  const { dados, concursoAtivo, escolherConcurso } = useApp();
  if (!dados.concursos.length) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-suave">
      <span className="hidden sm:inline">Concurso</span>
      <select
        aria-label="Concurso ativo"
        value={concursoAtivo?.id ?? ''}
        onChange={(e) => escolherConcurso(e.target.value)}
        className="min-w-0 max-w-[60vw] truncate rounded-lg border-2 border-roxo/40 bg-superficie px-3 py-1.5 font-bold text-roxo outline-none focus:border-roxo sm:max-w-xs"
      >
        {dados.concursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function App() {
  const { tela, dados } = useApp();
  const [gaveta, setGaveta] = useState(false);
  const Conteudo = TELAS[tela];

  useEffect(() => {
    const raiz = document.documentElement;
    if (dados.config.tema === 'sistema') delete raiz.dataset.tema;
    else raiz.dataset.tema = dados.config.tema;
  }, [dados.config.tema]);

  return (
    <div className="min-h-full lg:pl-64">
      <aside className="menu-lateral fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 py-5 lg:flex">
        <div className="px-5">
          <Marca />
        </div>
        <MenuLateral />
      </aside>

      {gaveta && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setGaveta(false)} />
          <aside className="menu-lateral relative flex h-full w-72 max-w-[85vw] flex-col gap-6 pb-5"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
            <div className="flex items-center justify-between px-5">
              <Marca />
              <button type="button" aria-label="Fechar menu" onClick={() => setGaveta(false)} className="rounded-md p-1 text-menu-texto hover:bg-menu-ativo">
                <X size={22} />
              </button>
            </div>
            <MenuLateral aoNavegar={() => setGaveta(false)} />
          </aside>
        </div>
      )}

      <header className="sticky z-20 flex items-center gap-3 border-b border-borda bg-fundo/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <button type="button" aria-label="Abrir menu" onClick={() => setGaveta(true)}
          className="rounded-md p-1.5 text-verde-forte hover:bg-verde-suave lg:hidden">
          <Menu size={24} />
        </button>
        <span className="font-extrabold text-verde-forte lg:hidden">Organizador</span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <SeletorConcurso />
        </div>
      </header>

      {dados.modo === 'local' && (
        <div className="mx-4 mt-3 rounded-lg bg-alerta/15 px-4 py-2 text-sm font-bold text-alerta sm:mx-6 lg:mx-8">
          {dentroDoClaude()
            ? 'Não consegui conectar ao banco do claude.ai. Nesta visita, os dados ficam só neste navegador.'
            : 'Modo local: os dados ficam só neste navegador (desenvolvimento).'}
        </div>
      )}
      {dados.erro && (
        <div role="alert" className="mx-4 mt-3 rounded-lg bg-perigo-suave px-4 py-2 text-sm font-bold text-perigo sm:mx-6 lg:mx-8">
          {dados.erro.mensagem}
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-8">
        <Conteudo />
      </main>

      {tela !== 'cronometro' && <BotaoCronometro />}
      <VigiaPomodoro />
      <Avisos />
    </div>
  );
}
