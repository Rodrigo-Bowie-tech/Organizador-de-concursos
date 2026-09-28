import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CamposEstudo } from '../componentes/CamposSessao';
import { ListaMateriais, materiaisDe } from '../componentes/Materiais';
import { BotaoPraticar } from '../componentes/PraticaIA';
import { ModalFinalizar, ModalSessao } from '../componentes/ModaisSessao';
import { Botao, Cartao, Confirmar, Etiqueta, Progresso, cx } from '../componentes/ui';
import type { DetalhesSessao } from '../dados/repositorio';
import { estadoDaSessao, fasePomodoro, segundosDePausa, segundosLiquidos } from '../dominio/cronometro';
import { formatarDuracao, formatarHora, formatarRelogio } from '../dominio/datas';
import { TIPO_SESSAO } from '../dominio/rotulos';
import { useAgora, useApp } from '../estado';
import { manterTelaAcesa, prepararAudio } from '../plataforma';

const FASES = { foco: 'Foco', pausa_curta: 'Pausa curta', pausa_longa: 'Pausa longa' };

export function Cronometro() {
  const { dados, repo, executar, concursoAtivo, disciplinas } = useApp();
  const ativa = dados.ativa;
  const estado = ativa ? estadoDaSessao(ativa) : null;
  const agora = useAgora(250, Boolean(ativa));
  const [inicio, setInicio] = useState<DetalhesSessao>(() => ({
    concursoId: concursoAtivo?.id ?? null,
    disciplinaId: disciplinas[0]?.id ?? null,
    topicoId: null,
    tipo: 'teoria',
  }));
  const [finalizando, setFinalizando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [manual, setManual] = useState(false);
  const pomodoro = dados.config.pomodoro;

  // Mantém a tela do celular acesa enquanto o relógio corre.
  useEffect(() => {
    if (estado !== 'rodando') return;
    let soltar: (() => void) | null = null;
    let ativo = true;
    void manterTelaAcesa().then((f) => (ativo ? (soltar = f) : f()));
    return () => {
      ativo = false;
      soltar?.();
    };
  }, [estado]);

  // Atalho no teclado: espaço pausa ou retoma (fora de campos, botões e modais).
  useEffect(() => {
    if (!estado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input, textarea, select, button, a, [contenteditable="true"], dialog[open]') || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      if (estado === 'rodando') void executar(() => repo.pausarSessao());
      else {
        prepararAudio();
        void executar(() => repo.retomarSessao());
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [estado, executar, repo]);

  const liquido = ativa ? segundosLiquidos(ativa, agora) : 0;
  const fase = ativa && pomodoro.ativo ? fasePomodoro(ativa, pomodoro, agora) : null;
  const disciplina = ativa ? dados.disciplinas.find((d) => d.id === ativa.disciplinaId) : null;
  const topico = ativa && disciplina && ativa.topicoId ? disciplina.topicos[ativa.topicoId] : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="sr-only">Cronômetro</h1>

      <Cartao className="text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          {estado === 'rodando' && <Etiqueta tom="verde">Estudando</Etiqueta>}
          {estado === 'pausada' && <Etiqueta tom="alerta">Pausado</Etiqueta>}
          {!ativa && <Etiqueta>Pronto para começar</Etiqueta>}
        </div>
        <p
          aria-label="Tempo líquido"
          className={cx(
            'numeros font-mono text-[clamp(3.2rem,16vw,6.5rem)] leading-none font-semibold tracking-tight',
            estado === 'pausada' ? 'text-suave' : 'text-texto',
          )}
        >
          {formatarRelogio(liquido)}
        </p>
        <p className="mt-2 text-suave">
          {ativa
            ? `Começou às ${formatarHora(ativa.inicio)} · ${formatarDuracao(segundosDePausa(ativa, agora))} em pausas`
            : 'Só conta o tempo líquido: as pausas ficam registradas à parte.'}
        </p>

        {ativa && (
          <div className="mt-4 rounded-lg bg-superficie-2 px-3 py-2 text-left">
            <p className="font-extrabold" style={{ color: disciplina?.cor }}>
              {disciplina?.nome ?? 'Sem disciplina'}
            </p>
            <p className="text-sm text-suave">
              {topico ? topico.titulo : 'Disciplina inteira'} · {TIPO_SESSAO[ativa.tipo]}
            </p>
            {!trocando && (
              <button type="button" className="mt-1 text-sm font-bold text-verde-forte underline" onClick={() => setTrocando(true)}>
                Trocar tópico ou tipo
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!ativa && (
            <Botao
              tamanho="grande"
              className="min-w-48"
              onClick={() => {
                prepararAudio();
                void executar(() => repo.iniciarSessao(inicio));
              }}
            >
              <Play size={22} /> Iniciar
            </Botao>
          )}
          {estado === 'rodando' && (
            <Botao tamanho="grande" variante="secundario" className="min-w-40" onClick={() => void executar(() => repo.pausarSessao())}>
              <Pause size={22} /> Pausar
            </Botao>
          )}
          {estado === 'pausada' && (
            <Botao tamanho="grande" className="min-w-40" onClick={() => { prepararAudio(); void executar(() => repo.retomarSessao()); }}>
              <Play size={22} /> Retomar
            </Botao>
          )}
          {ativa && (
            <Botao tamanho="grande" variante="secundario" className="min-w-40" onClick={() => setFinalizando(true)}>
              <Square size={20} /> Finalizar
            </Botao>
          )}
        </div>
        {ativa && (
          <p className="mt-3 hidden text-xs text-suave lg:block">
            Atalho: <kbd className="rounded border border-borda bg-superficie-2 px-1.5 py-0.5 font-mono">espaço</kbd> pausa e retoma.
          </p>
        )}
      </Cartao>

      {(!ativa || trocando) && (
        <Cartao titulo={ativa ? 'Trocar tópico ou tipo' : 'O que você vai estudar?'}>
          {ativa ? (
            <TrocarEstudo aoFechar={() => setTrocando(false)} />
          ) : (
            <CamposEstudo valor={inicio} aoMudar={setInicio} />
          )}
        </Cartao>
      )}

      {ativa?.disciplinaId && (
        <Cartao titulo="Materiais" acao={<BotaoPraticar disciplinaId={ativa.disciplinaId} topicoId={ativa.topicoId} />}>
          <ListaMateriais
            materiais={materiaisDe(dados.materiais, ativa.disciplinaId, ativa.topicoId)}
            vazio="Nenhum material para este tópico. Cadastre em Biblioteca ou no Edital."
          />
        </Cartao>
      )}

      <Cartao
        titulo="Pomodoro"
        acao={
          <label className="flex items-center gap-2 font-bold text-suave">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--verde)]"
              checked={pomodoro.ativo}
              onChange={(e) => {
                prepararAudio();
                void executar(() => repo.salvarConfig({ ...dados.config, pomodoro: { ...pomodoro, ativo: e.target.checked } }));
              }}
            />
            Usar Pomodoro
          </label>
        }
      >
        {fase ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-extrabold">
                {FASES[fase.fase]} · ciclo {fase.ciclosCompletos + (fase.fase === 'foco' ? 1 : 0)}
              </span>
              <span className={cx('numeros font-mono text-xl', fase.restante < 0 && 'text-alerta')}>
                {fase.restante < 0 ? `+${formatarRelogio(-fase.restante)}` : formatarRelogio(fase.restante)}
              </span>
            </div>
            <Progresso rotulo="Progresso da fase" fracao={1 - fase.restante / fase.duracao} cor={fase.fase === 'foco' ? undefined : 'var(--roxo)'} />
            <p className="text-sm text-suave">
              {fase.fase === 'foco'
                ? 'Ao fim do foco, um alerta sonoro avisa a hora da pausa. Pause o cronômetro para descansar.'
                : fase.restante < 0
                  ? 'A pausa acabou. Retome quando estiver pronto.'
                  : 'Descanse. O alerta toca quando a pausa terminar.'}
            </p>
          </div>
        ) : (
          <p className="text-suave">
            {pomodoro.ativo
              ? `Foco de ${pomodoro.focoMin} min, pausa curta de ${pomodoro.pausaCurtaMin} min e longa de ${pomodoro.pausaLongaMin} min a cada ${pomodoro.ciclosAtePausaLonga} ciclos. Começa com a sessão.`
              : 'Desligado. Os tempos podem ser ajustados em Configurações. O alerta toca enquanto o app estiver aberto.'}
          </p>
        )}
      </Cartao>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="font-bold text-verde-forte underline" onClick={() => setManual(true)}>
          Esqueceu de ligar o cronômetro? Registrar manualmente
        </button>
        {ativa && (
          <Botao variante="fantasma" tamanho="pequeno" onClick={() => setDescartar(true)}>
            <Trash2 size={16} /> Descartar sessão
          </Botao>
        )}
      </div>

      <ModalFinalizar aberto={finalizando} aoFechar={() => setFinalizando(false)} />
      <ModalSessao aberto={manual} aoFechar={() => setManual(false)} />
      <Confirmar
        aberto={descartar}
        aoFechar={() => setDescartar(false)}
        titulo="Descartar sessão?"
        texto={`Os ${formatarDuracao(liquido)} desta sessão não vão para o histórico.`}
        rotuloAcao="Descartar"
        aoConfirmar={() => void executar(() => repo.descartarSessaoAtiva(), 'Sessão descartada.')}
      />
    </div>
  );
}

function TrocarEstudo({ aoFechar }: { aoFechar: () => void }) {
  const { dados, repo, executar } = useApp();
  const ativa = dados.ativa;
  const [valor, setValor] = useState<DetalhesSessao | null>(() =>
    ativa ? { concursoId: ativa.concursoId, disciplinaId: ativa.disciplinaId, topicoId: ativa.topicoId, tipo: ativa.tipo } : null,
  );
  if (!ativa || !valor) return null;
  return (
    <div className="grid gap-4">
      <CamposEstudo valor={valor} aoMudar={setValor} />
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao
          onClick={async () => {
            await executar(() => repo.atualizarSessaoAtiva(valor), 'Sessão atualizada.');
            aoFechar();
          }}
        >
          Salvar
        </Botao>
      </div>
    </div>
  );
}
