import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Botao, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Progresso, Selecao, cx } from '../componentes/ui';
import type { Backup } from '../dados/repositorio';
import { diaSP, formatarData } from '../dominio/datas';
import { csvQuestoes, csvSessoes } from '../dominio/exportacao';
import type { Configuracao, Tema } from '../dominio/tipos';
import { useApp } from '../estado';
import { dentroDoClaude, salvarArquivo } from '../plataforma';

const LIMITE_DOCUMENTOS = 5000;

const horas = (min: number) => String(Math.round((min / 60) * 10) / 10);
const minutosDe = (h: string) => Math.max(0, Math.round((Number(h.replace(',', '.')) || 0) * 60));

export function Configuracoes() {
  const { dados, repo, executar, avisar } = useApp();
  const [metas, setMetas] = useState({ dia: '', semana: '', mes: '' });
  const [pomodoro, setPomodoro] = useState(dados.config.pomodoro);
  const [backupPendente, setBackupPendente] = useState<Backup | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMetas({
      dia: horas(dados.config.metaDiariaMin),
      semana: horas(dados.config.metaSemanalMin),
      mes: horas(dados.config.metaMensalMin),
    });
    setPomodoro(dados.config.pomodoro);
  }, [dados.config]);

  const salvar = (c: Configuracao, msg = 'Configurações salvas.') => void executar(() => repo.salvarConfig(c), msg);
  const documentos = Object.keys(repo.exportar().documentos).length;

  async function exportar() {
    const backup = repo.exportar();
    await executar(async () => {
      const ok = await salvarArquivo(`organizador-concursos-backup-${diaSP(Date.now())}.json`, JSON.stringify(backup, null, 2));
      if (ok) {
        await repo.marcarBackup();
        avisar('Backup exportado.');
      }
    });
  }

  async function planilha(qual: 'sessoes' | 'questoes') {
    const sessoes = dados.ativa ? [...dados.sessoes, dados.ativa] : dados.sessoes;
    const csv =
      qual === 'sessoes'
        ? csvSessoes(sessoes, dados.concursos, dados.disciplinas, new Date())
        : csvQuestoes(dados.sessoes, dados.registrosQuestoes, dados.concursos, dados.disciplinas);
    await executar(async () => {
      const ok = await salvarArquivo(`organizador-${qual}-${diaSP(Date.now())}.csv`, csv, 'text/csv;charset=utf-8');
      if (ok) avisar('Planilha exportada.');
    });
  }

  function lerArquivo(f: File | undefined) {
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const b = JSON.parse(String(leitor.result)) as Backup;
        if (b?.app !== 'organizador-de-concursos') throw new Error();
        setBackupPendente(b);
      } catch {
        avisar('Este arquivo não é um backup do Organizador de Concursos.', 'erro');
      }
    };
    leitor.readAsText(f);
    if (arquivo.current) arquivo.current.value = '';
  }

  return (
    <>
      <CabecalhoTela titulo="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Metas de horas líquidas">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              salvar({
                ...dados.config,
                metaDiariaMin: minutosDe(metas.dia),
                metaSemanalMin: minutosDe(metas.semana),
                metaMensalMin: minutosDe(metas.mes),
              }, 'Metas salvas.');
            }}
          >
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Por dia (h)">
                {(id) => <Entrada id={id} inputMode="decimal" value={metas.dia} onChange={(e) => setMetas({ ...metas, dia: e.target.value })} />}
              </Campo>
              <Campo rotulo="Por semana (h)">
                {(id) => <Entrada id={id} inputMode="decimal" value={metas.semana} onChange={(e) => setMetas({ ...metas, semana: e.target.value })} />}
              </Campo>
              <Campo rotulo="Por mês (h)">
                {(id) => <Entrada id={id} inputMode="decimal" value={metas.mes} onChange={(e) => setMetas({ ...metas, mes: e.target.value })} />}
              </Campo>
            </div>
            <Botao type="submit" className="justify-self-start">
              Salvar metas
            </Botao>
          </form>
        </Cartao>

        <Cartao titulo="Pomodoro">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              salvar({ ...dados.config, pomodoro }, 'Pomodoro salvo.');
            }}
          >
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={pomodoro.ativo} onChange={(e) => setPomodoro({ ...pomodoro, ativo: e.target.checked })} />
              Usar Pomodoro no cronômetro
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['focoMin', 'Foco (min)'],
                  ['pausaCurtaMin', 'Pausa curta'],
                  ['pausaLongaMin', 'Pausa longa'],
                  ['ciclosAtePausaLonga', 'Ciclos até a longa'],
                ] as const
              ).map(([chave, rotulo]) => (
                <Campo key={chave} rotulo={rotulo}>
                  {(id) => (
                    <Entrada id={id} type="number" min={1} max={180} value={pomodoro[chave]}
                      onChange={(e) => setPomodoro({ ...pomodoro, [chave]: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                  )}
                </Campo>
              ))}
            </div>
            <p className="text-sm text-suave">O alerta sonoro toca enquanto o app estiver aberto.</p>
            <Botao type="submit" className="justify-self-start">
              Salvar Pomodoro
            </Botao>
          </form>
        </Cartao>

        <Cartao titulo="Planejamento">
          <div className="mb-4 grid gap-1">
            <Campo
              rotulo="Intercalar assuntos"
              dica="Teoria em rodízio entre os assuntos (disciplinas) de maior prioridade: cada bloco vai para o que você estudou há mais tempo."
            >
              {(id) => (
                <Selecao
                  id={id}
                  value={dados.config.intercalarAssuntos ?? 0}
                  onChange={(e) => salvar({ ...dados.config, intercalarAssuntos: Number(e.target.value) }, 'Planejamento atualizado.')}
                >
                  <option value={0}>Desligado (até 2 blocos seguidos do mesmo assunto)</option>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} assuntos em rodízio
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--verde)]"
              checked={dados.config.usarCapacidadeReal}
              onChange={(e) => salvar({ ...dados.config, usarCapacidadeReal: e.target.checked }, 'Planejamento atualizado.')}
            />
            <span>
              <span className="font-bold">Planejar com a capacidade real</span>
              <span className="block text-sm text-suave">
                Se nos últimos 14 dias você estudou bem menos que a disponibilidade de um dia da semana, o plano usa a sua média real nesse dia.
              </span>
            </span>
          </label>
        </Cartao>

        <Cartao titulo="Tema">
          <div role="radiogroup" aria-label="Tema" className="flex flex-wrap gap-2">
            {(
              [
                ['sistema', 'Igual ao Claude'],
                ['claro', 'Claro'],
                ['escuro', 'Escuro'],
              ] as [Tema, string][]
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={dados.config.tema === valor}
                onClick={() => salvar({ ...dados.config, tema: valor }, 'Tema alterado.')}
                className={cx(
                  'rounded-lg border px-4 py-2 font-bold transition',
                  dados.config.tema === valor ? 'border-verde bg-verde-suave text-verde-forte' : 'border-borda text-suave hover:bg-superficie-2',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Backup">
          <p className="text-suave">
            Exporte tudo (concursos, edital, sessões e configurações) num arquivo JSON. Importar um backup substitui todo o
            conteúdo atual.
          </p>
          <p className="mt-2 text-sm font-bold text-suave">
            {dados.ultimoBackup ? `Último backup: ${formatarData(dados.ultimoBackup)}` : 'Nenhum backup exportado ainda.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao onClick={() => void exportar()}>
              <Download size={18} /> Exportar backup
            </Botao>
            <Botao variante="secundario" onClick={() => arquivo.current?.click()}>
              <Upload size={18} /> Importar backup
            </Botao>
            <input ref={arquivo} type="file" accept="application/json,.json" className="hidden" onChange={(e) => lerArquivo(e.target.files?.[0])} />
          </div>
        </Cartao>

        <Cartao titulo="Planilhas">
          <p className="text-suave">Sessões e questões em CSV, para abrir no Excel ou no Google Planilhas (separador “;”).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={() => void planilha('sessoes')}>
              <FileSpreadsheet size={18} /> Sessões (CSV)
            </Botao>
            <Botao variante="secundario" onClick={() => void planilha('questoes')}>
              <FileSpreadsheet size={18} /> Questões (CSV)
            </Botao>
          </div>
        </Cartao>

        <Cartao titulo="Banco de dados" className="lg:col-span-2">
          <p className="text-suave">
            {dados.modo === 'claude'
              ? 'Os dados ficam no banco deste app no claude.ai e sincronizam entre notebook, desktop e celular.'
              : dentroDoClaude()
                ? 'O banco do claude.ai não respondeu nesta visita; os dados estão só neste navegador.'
                : 'Modo local de desenvolvimento: os dados ficam só neste navegador.'}
          </p>
          <div className="mt-3 grid max-w-md gap-1">
            <div className="numeros flex justify-between text-sm">
              <span>Registros usados</span>
              <span>
                {documentos.toLocaleString('pt-BR')} de {LIMITE_DOCUMENTOS.toLocaleString('pt-BR')}
              </span>
            </div>
            <Progresso rotulo="Registros usados no banco" fracao={documentos / LIMITE_DOCUMENTOS} />
            <p className="text-xs text-suave">Cada semana de sessões e cada disciplina (com todos os tópicos) contam como um registro.</p>
          </div>
        </Cartao>
      </div>

      <Confirmar
        aberto={Boolean(backupPendente)}
        aoFechar={() => setBackupPendente(null)}
        titulo="Importar backup?"
        texto={
          backupPendente && (
            <>
              O backup de {new Date(backupPendente.exportadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} tem{' '}
              {Object.keys(backupPendente.documentos ?? {}).length} registros. Tudo o que está no app agora será substituído.
            </>
          )
        }
        rotuloAcao="Substituir e importar"
        aoConfirmar={() => backupPendente && void executar(() => repo.importar(backupPendente), 'Backup importado.')}
      />
    </>
  );
}
