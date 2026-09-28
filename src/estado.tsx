import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dados, Repositorio } from './dados/repositorio';
import type { ErroStore } from './dados/store';
import type { Concurso, Disciplina } from './dominio/tipos';
import { gravarLocal, lerLocal } from './plataforma';
import type { Recursos } from './plataforma';

export type Tela =
  | 'home'
  | 'concursos'
  | 'disciplinas'
  | 'edital'
  | 'revisoes'
  | 'historico'
  | 'balanco'
  | 'biblioteca'
  | 'cronometro'
  | 'configuracoes';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

interface Contexto {
  repo: Repositorio;
  dados: Dados;
  /** Recursos do claude.ai disponíveis nesta visita (IA e arquivos). */
  recursos: Recursos;
  concursoAtivo: Concurso | null;
  escolherConcurso(id: string | null): void;
  /** Disciplinas do concurso ativo. */
  disciplinas: Disciplina[];
  tela: Tela;
  irPara(t: Tela): void;
  avisos: Aviso[];
  avisar(texto: string, tipo?: Aviso['tipo']): void;
  /** Roda uma gravação e mostra o erro (ou a mensagem de sucesso) num aviso. */
  executar<T>(fn: () => Promise<T>, sucesso?: string): Promise<T | undefined>;
}

const Ctx = createContext<Contexto | null>(null);

const CHAVE_CONCURSO = 'organizador-concursos:concurso-ativo';

export function ProvedorDados({ repo, recursos, children }: { repo: Repositorio; recursos: Recursos; children: ReactNode }) {
  const [dados, setDados] = useState<Dados>(repo.atual);
  const [ativoId, setAtivoId] = useState<string | null>(() => lerLocal(CHAVE_CONCURSO));
  const [tela, setTela] = useState<Tela>('home');
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoAviso = useRef(1);

  useEffect(() => repo.assinar(setDados), [repo]);

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'ok') => {
    const id = proximoAviso.current++;
    setAvisos((a) => [...a.slice(-2), { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);

  const executar = useCallback(
    async <T,>(fn: () => Promise<T>, sucesso?: string) => {
      try {
        const r = await fn();
        if (sucesso) avisar(sucesso);
        return r;
      } catch (e) {
        const erro = e as Partial<ErroStore>;
        avisar(erro?.mensagem ?? 'Algo deu errado. Tente de novo.', 'erro');
        return undefined;
      }
    },
    [avisar],
  );

  const concursoAtivo = useMemo(
    () => dados.concursos.find((c) => c.id === ativoId) ?? dados.concursos[0] ?? null,
    [dados.concursos, ativoId],
  );

  const disciplinas = useMemo(
    () => (concursoAtivo ? dados.disciplinas.filter((d) => d.concursoId === concursoAtivo.id) : []),
    [dados.disciplinas, concursoAtivo],
  );

  const escolherConcurso = useCallback((id: string | null) => {
    setAtivoId(id);
    gravarLocal(CHAVE_CONCURSO, id);
  }, []);

  const irPara = useCallback((t: Tela) => {
    setTela(t);
    window.scrollTo?.({ top: 0 });
  }, []);

  const valor: Contexto = {
    repo,
    dados,
    recursos,
    concursoAtivo,
    escolherConcurso,
    disciplinas,
    tela,
    irPara,
    avisos,
    avisar,
    executar,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do ProvedorDados');
  return c;
}

/** Hora atual, atualizada a cada `ms` (só enquanto `ativo`). */
export function useAgora(ms = 1000, ativo = true): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ativo) return;
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), ms);
    return () => clearInterval(t);
  }, [ms, ativo]);
  return agora;
}
