import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { EstadoSinc, SituacaoSinc } from '../dados/sincronizacao';
import { formatarData, formatarHora } from '../dominio/datas';
import { useApp } from '../estado';
import { Botao, Campo, Cartao, Confirmar, Entrada, cx } from './ui';

/** Repositório privado de dados do usuário (sugestão no primeiro uso). */
const REPOSITORIO_SUGERIDO = 'Rodrigo-Bowie-tech/organizador-dados';

const semAssinatura = () => () => undefined;

/** Estado da sincronização com o GitHub; `null` fora do app instalado. */
export function useSinc(): EstadoSinc | null {
  const sinc = useApp().recursos.sinc;
  return useSyncExternalStore(sinc ? sinc.assinar : semAssinatura, () => sinc?.estado ?? null);
}

const quando = (iso: string | null) => (iso ? `${formatarData(iso)} às ${formatarHora(iso)}` : 'ainda não');

const SITUACOES: Record<Exclude<SituacaoSinc, 'desligada'>, { rotulo: string; icone: LucideIcon; classe: string }> = {
  ok: { rotulo: 'Sincronizado', icone: CloudCheck, classe: 'text-suave' },
  sincronizando: { rotulo: 'Sincronizando…', icone: RefreshCw, classe: 'text-suave' },
  sem_internet: { rotulo: 'Sem internet', icone: CloudOff, classe: 'text-alerta' },
  erro: { rotulo: 'Erro ao sincronizar', icone: CloudAlert, classe: 'text-perigo' },
};

function descricao(e: EstadoSinc): string {
  if (e.situacao === 'ok') return `Sincronizado com o GitHub em ${quando(e.ultimaEm)}.`;
  if (e.situacao === 'sincronizando') return 'Sincronizando com o GitHub…';
  return e.mensagem ?? SITUACOES[e.situacao === 'desligada' ? 'erro' : e.situacao].rotulo;
}

/** A consulta de cada minuto é rápida: só mostra "sincronizando" se demorar. */
function useSituacaoVisivel(situacao: SituacaoSinc): SituacaoSinc {
  const estavel = useRef<SituacaoSinc>(situacao === 'sincronizando' ? 'ok' : situacao);
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    if (situacao !== 'sincronizando') {
      estavel.current = situacao;
      setDemorou(false);
      return;
    }
    const t = setTimeout(() => setDemorou(true), 700);
    return () => clearTimeout(t);
  }, [situacao]);
  return situacao === 'sincronizando' && !demorou ? estavel.current : situacao;
}

/** Indicador no topo, só com a sincronização ligada; leva para Configurações. */
export function IndicadorSinc() {
  const estado = useSinc();
  const { irPara } = useApp();
  const situacao = useSituacaoVisivel(estado?.situacao ?? 'desligada');
  if (!estado?.repositorio || situacao === 'desligada') return null;
  const { rotulo, icone: Icone, classe } = SITUACOES[situacao];
  const texto = situacao === estado.situacao ? descricao(estado) : rotulo;
  return (
    <button
      type="button"
      onClick={() => irPara('configuracoes')}
      title={texto}
      aria-label={`${rotulo}. ${texto}`}
      className={cx('flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-bold hover:bg-superficie-2', classe)}
    >
      <Icone size={18} aria-hidden className={situacao === 'sincronizando' ? 'motion-safe:animate-spin' : undefined} />
      <span className="hidden sm:inline">{rotulo}</span>
    </button>
  );
}

/** Configurações › Sincronizar com o GitHub (app instalado). */
export function CartaoSincronizacao() {
  const { recursos, avisar } = useApp();
  const sinc = recursos.sinc;
  const estado = useSinc();
  const [repositorio, setRepositorio] = useState(estado?.repositorio ?? REPOSITORIO_SUGERIDO);
  const [token, setToken] = useState('');
  const [trocandoToken, setTrocandoToken] = useState(false);
  const [desligar, setDesligar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!sinc || !estado) return null;
  const ligada = Boolean(estado.repositorio) && estado.situacao !== 'desligada';

  async function ligar() {
    if (!sinc) return;
    setOcupado(true);
    const ok = await sinc.ligar(ligada && estado?.repositorio ? estado.repositorio : repositorio, token);
    setOcupado(false);
    if (!ok) return;
    setToken('');
    setTrocandoToken(false);
    avisar('Sincronização com o GitHub ligada.');
  }

  const formToken = (
    <form
      className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void ligar();
      }}
    >
      {!ligada && (
        <Campo rotulo="Repositório (dono/nome)">
          {(id) => <Entrada id={id} value={repositorio} autoCapitalize="none" spellCheck={false} onChange={(e) => setRepositorio(e.target.value)} />}
        </Campo>
      )}
      <Campo rotulo="Token do GitHub">
        {(id) => (
          <Entrada id={id} type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
        )}
      </Campo>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Botao type="submit" disabled={ocupado || !token.trim() || (!ligada && !repositorio.trim())}>
          {ocupado ? 'Conferindo…' : ligada ? 'Salvar token' : 'Ligar sincronização'}
        </Botao>
        {ligada && (
          <Botao variante="secundario" onClick={() => setTrocandoToken(false)}>
            Cancelar
          </Botao>
        )}
      </div>
    </form>
  );

  return (
    <Cartao titulo="Sincronizar com o GitHub" className="lg:col-span-2">
      {ligada ? (
        <>
          <p className="text-suave">
            Os dados deste aparelho vão e vêm do repositório privado <strong className="break-all">{estado.repositorio}</strong>: ao abrir o app, alguns
            segundos depois de cada mudança e a cada minuto com o app aberto.
          </p>
          <p role="status" className={cx('mt-2 text-sm font-bold', SITUACOES[estado.situacao === 'desligada' ? 'ok' : estado.situacao].classe)}>
            {descricao(estado)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao onClick={() => void sinc.sincronizar()} disabled={estado.situacao === 'sincronizando'}>
              <RefreshCw size={18} aria-hidden /> Sincronizar agora
            </Botao>
            <Botao variante="secundario" onClick={() => setTrocandoToken(true)}>
              Trocar token
            </Botao>
            <Botao variante="fantasma" onClick={() => setDesligar(true)}>
              Desligar
            </Botao>
          </div>
          {trocandoToken && formToken}
        </>
      ) : (
        <>
          <p className="text-suave">
            Use os mesmos dados no celular e no computador: o app guarda uma cópia num repositório <strong>privado</strong> do seu GitHub, e cada
            aparelho busca e envia as mudanças. Sem internet, tudo continua funcionando e vai depois.
          </p>
          {estado.mensagem && (
            <p role="alert" className="mt-2 text-sm font-bold text-perigo">
              {estado.mensagem}
            </p>
          )}
          {formToken}
        </>
      )}
      <details className="mt-3 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-bold">Como gerar o token</summary>
        <ol className="mt-2 grid list-decimal grid-cols-1 gap-1 pl-5 text-suave">
          <li>
            No GitHub, abra{' '}
            <a className="font-bold text-verde-forte underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              Fine-grained tokens › Generate new token
            </a>{' '}
            (foto do perfil › Settings › Developer settings).
          </li>
          <li>Dê um nome (ex.: “Organizador”) e escolha a validade (até 1 ano).</li>
          <li>
            Em <strong>Repository access</strong>, marque <strong>Only select repositories</strong> e escolha o repositório de dados.
          </li>
          <li>
            Em <strong>Permissions › Repository permissions</strong>, ponha <strong>Contents</strong> em <strong>Read and write</strong>.
          </li>
          <li>
            <strong>Generate token</strong>, copie e cole aqui. Ele fica só neste aparelho; use o mesmo nos outros. Não mande o token para ninguém.
          </li>
        </ol>
      </details>
      <Confirmar
        aberto={desligar}
        titulo="Desligar a sincronização?"
        texto="Os dados continuam neste aparelho; ele só para de enviar e receber mudanças. O token é apagado daqui."
        rotuloAcao="Desligar"
        aoConfirmar={() => {
          setDesligar(false);
          void sinc.desligar().then(() => avisar('Sincronização desligada.'));
        }}
        aoFechar={() => setDesligar(false)}
      />
    </Cartao>
  );
}
