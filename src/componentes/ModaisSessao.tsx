import { useState } from 'react';
import type { DetalhesSessao } from '../dados/repositorio';
import { segundosLiquidos } from '../dominio/cronometro';
import { diaSP, formatarDuracao, formatarHora, instanteSP } from '../dominio/datas';
import type { Sessao } from '../dominio/tipos';
import { useApp } from '../estado';
import { CamposEstudo, CamposResultado } from './CamposSessao';
import { Botao, Campo, Entrada, Modal, useAoAbrir } from './ui';

function detalhesDe(s: Sessao): DetalhesSessao {
  return {
    concursoId: s.concursoId,
    disciplinaId: s.disciplinaId,
    topicoId: s.topicoId,
    tipo: s.tipo,
    questoesFeitas: s.questoesFeitas,
    acertos: s.acertos,
    paginas: s.paginas,
    anotacoes: s.anotacoes,
    concluiuTeoria: s.concluiuTeoria,
  };
}

/** Fechamento da sessão do cronômetro. */
export function ModalFinalizar({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { dados, repo, executar, avisar } = useApp();
  const ativa = dados.ativa;
  const [valor, setValor] = useState<DetalhesSessao | null>(null);

  // Só ao abrir: edições no formulário não devem ser sobrescritas.
  useAoAbrir(aberto, () => ativa && setValor(detalhesDe(ativa)));

  if (!ativa || !valor) return null;
  const liquido = segundosLiquidos(ativa, new Date());

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Finalizar sessão"
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Voltar ao cronômetro
          </Botao>
          <Botao
            disabled={(valor.acertos ?? 0) > (valor.questoesFeitas ?? 0)}
            onClick={async () => {
              const s = await executar(() => repo.finalizarSessao(valor));
              if (s) {
                aoFechar();
                avisar(`Sessão salva: ${formatarDuracao(s.segundosLiquidos ?? 0)} líquidas.`);
              }
            }}
          >
            Salvar sessão
          </Botao>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-verde-suave px-3 py-2 font-bold text-verde-forte">
        {formatarDuracao(liquido)} líquidas desde {formatarHora(ativa.inicio)}
        {ativa.pausas.length > 0 && `, com ${ativa.pausas.length} ${ativa.pausas.length === 1 ? 'pausa' : 'pausas'}`}.
      </p>
      <div className="grid grid-cols-1 gap-5">
        <CamposEstudo valor={valor} aoMudar={setValor} />
        <CamposResultado valor={valor} aoMudar={setValor} />
      </div>
    </Modal>
  );
}

/**
 * Registro manual retroativo e edição de sessões já gravadas. Ao editar
 * horário ou duração, a sessão passa a ser um trecho contínuo, sem pausas.
 */
export function ModalSessao({
  aberto,
  aoFechar,
  sessao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Sessão a editar; sem ela, é um registro novo. */
  sessao?: Sessao | null;
}) {
  const { repo, executar, concursoAtivo } = useApp();
  const [valor, setValor] = useState<DetalhesSessao>({ concursoId: null, disciplinaId: null, topicoId: null, tipo: 'teoria' });
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [horas, setHoras] = useState('1');
  const [minutos, setMinutos] = useState('0');

  useAoAbrir(
    aberto,
    () => {
      if (sessao) {
        setValor(detalhesDe(sessao));
        setDia(diaSP(sessao.inicio));
        setHora(formatarHora(sessao.inicio));
        const seg = segundosLiquidos(sessao, Date.now());
        setHoras(String(Math.floor(seg / 3600)));
        setMinutos(String(Math.floor((seg % 3600) / 60)));
      } else {
        setValor({ concursoId: concursoAtivo?.id ?? null, disciplinaId: null, topicoId: null, tipo: 'teoria' });
        setDia(diaSP(Date.now()));
        setHora('');
        setHoras('1');
        setMinutos('0');
      }
    },
    sessao?.id,
  );

  const segundos = (Math.max(0, Number(horas) || 0) * 60 + Math.max(0, Number(minutos) || 0)) * 60;
  const valido = Boolean(dia && hora && segundos > 0 && (valor.acertos ?? 0) <= (valor.questoesFeitas ?? 0));

  async function salvar() {
    const inicio = instanteSP(dia, hora);
    const ok = await executar(async () => {
      if (sessao) {
        const original = segundosLiquidos(sessao, Date.now());
        const mudouTempo = sessao.inicio !== inicio.toISOString() || Math.abs(original - segundos) >= 60;
        const tempo = mudouTempo
          ? {
              inicio: inicio.toISOString(),
              fim: new Date(inicio.getTime() + segundos * 1000).toISOString(),
              pausas: [],
              segundosLiquidos: segundos,
            }
          : {};
        await repo.gravarSessao({
          ...sessao,
          ...valor,
          ...tempo,
          acertos: Math.min(valor.acertos ?? 0, valor.questoesFeitas ?? 0),
        } as Sessao);
      } else {
        await repo.registrarManual({ ...valor, inicio, segundosLiquidos: segundos });
      }
      return true;
    }, sessao ? 'Sessão atualizada.' : 'Estudo registrado.');
    if (ok) aoFechar();
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={sessao ? 'Editar sessão' : 'Registrar estudo manual'}
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!valido} onClick={salvar}>
            {sessao ? 'Salvar alterações' : 'Registrar'}
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo rotulo="Dia" className="col-span-2 sm:col-span-1">
            {(id) => <Entrada id={id} type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />}
          </Campo>
          <Campo rotulo="Começou às" className="col-span-2 sm:col-span-1">
            {(id) => <Entrada id={id} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />}
          </Campo>
          <Campo rotulo="Horas líquidas">
            {(id) => <Entrada id={id} type="number" inputMode="numeric" min={0} max={23} value={horas} onChange={(e) => setHoras(e.target.value)} />}
          </Campo>
          <Campo rotulo="Minutos">
            {(id) => <Entrada id={id} type="number" inputMode="numeric" min={0} max={59} value={minutos} onChange={(e) => setMinutos(e.target.value)} />}
          </Campo>
        </div>
        {sessao && sessao.pausas.length > 0 && (
          <p className="text-sm text-suave">
            Se mudar o horário ou a duração, as pausas desta sessão deixam de ser listadas e ela vira um trecho contínuo.
          </p>
        )}
        <CamposEstudo valor={valor} aoMudar={setValor} />
        <CamposResultado valor={valor} aoMudar={setValor} />
      </div>
    </Modal>
  );
}
