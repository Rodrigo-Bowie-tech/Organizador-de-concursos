import { BookCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatarDuracao } from '../dominio/datas';
import { estimativaComMais, estimativaTeoria, meioBloco, sugestaoDeAjuste, teoriasAConfirmar } from '../dominio/teoria';
import type { AjusteDoAssunto, TeoriaAConfirmar } from '../dominio/teoria';
import type { Disciplina, Id } from '../dominio/tipos';
import { useApp } from '../estado';
import { Botao, Cartao, Modal } from './ui';

type Alvo = { disciplinaId: Id; topicoId: Id };

const blocos = (n: number) => `${meioBloco(n).toLocaleString('pt-BR')} ${meioBloco(n) === 1 ? 'bloco' : 'blocos'}`;
const vezes = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')}×`;

/** Tópicos em que os blocos de teoria previstos acabaram (a confirmar). */
export function useTeoriasAConfirmar(): TeoriaAConfirmar[] {
  const { dados, repo } = useApp();
  return useMemo(() => teoriasAConfirmar(dados.disciplinas, repo.blocosFeitos()), [dados, repo]);
}

/**
 * "Terminou a teoria?": terminei (teoria concluída) ou ainda não (+N blocos). Depois, se o
 * assunto está levando mais que o previsto, oferece ajustar os tópicos que ainda não começaram.
 */
export function ModalTeoria({ alvo, aoFechar }: { alvo: Alvo | null; aoFechar: () => void }) {
  const { dados, repo, executar, avisar } = useApp();
  const [etapa, setEtapa] = useState<'pergunta' | 'mais' | 'ajuste'>('pergunta');
  const [ajuste, setAjuste] = useState<AjusteDoAssunto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const d = alvo ? dados.disciplinas.find((x) => x.id === alvo.disciplinaId) : undefined;
  const t = alvo && d ? d.topicos[alvo.topicoId] : undefined;
  const feitos = alvo ? repo.blocosFeitos().get(alvo.topicoId) ?? 0 : 0;
  const pendente = Boolean(alvo && t && teoriasAConfirmar([d as Disciplina], repo.blocosFeitos()).some((p) => p.topico.id === alvo.topicoId));

  useEffect(() => {
    if (!alvo) {
      setEtapa('pergunta');
      setAjuste(null);
    }
  }, [alvo]);
  // Respondida em outro lugar (outra aba, outro aparelho): a pergunta some.
  useEffect(() => {
    if (alvo && etapa === 'pergunta' && !pendente && !ocupado) aoFechar();
  }, [alvo, etapa, pendente, ocupado, aoFechar]);

  if (!alvo || !d || !t) return null;

  /** Depois da resposta: ajuste do assunto, se houver; senão, fecha com o aviso. */
  const seguir = (disciplinaDepois: Disciplina, aviso: string) => {
    const s = sugestaoDeAjuste(disciplinaDepois, repo.blocosFeitos());
    if (s) {
      setAjuste(s);
      setEtapa('ajuste');
    } else {
      avisar(aviso);
      aoFechar();
    }
  };

  const terminei = async () => {
    setOcupado(true);
    const ok = await executar(() => repo.concluirTeoria(d.id, t.id).then(() => true));
    setOcupado(false);
    if (ok) seguir({ ...d, topicos: { ...d.topicos, [t.id]: { ...t, status: 'teoria_concluida' } } }, `Teoria de ${t.titulo} concluída. A revisão vem amanhã.`);
  };

  const mais = async (n: number) => {
    setOcupado(true);
    const ok = await executar(() => repo.pedirMaisTeoria(d.id, t.id, n).then(() => true));
    setOcupado(false);
    if (ok) seguir({ ...d, topicos: { ...d.topicos, [t.id]: { ...t, ...estimativaComMais(t, feitos, n) } } }, `Mais ${blocos(n)} para ${t.titulo}. Plano refeito.`);
  };

  const ajustar = async () => {
    if (!ajuste) return;
    setOcupado(true);
    const ok = await executar(
      () => repo.ajustarEstimativas(d.id, ajuste.mudancas.map((m) => ({ topicoId: m.topico.id, blocos: m.para }))).then(() => true),
      'Estimativas ajustadas e plano refeito.',
    );
    setOcupado(false);
    if (ok) aoFechar();
  };

  const minutos = formatarDuracao(Math.max(15, dados.disponibilidade.blocoMin || 60) * 60);

  if (etapa === 'ajuste' && ajuste) {
    return (
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo={`Ajustar ${d.nome}?`}
        rodape={
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Agora não
            </Botao>
            <Botao disabled={ocupado} onClick={() => void ajustar()}>
              Ajustar {ajuste.mudancas.length === 1 ? '1 tópico' : `${ajuste.mudancas.length} tópicos`}
            </Botao>
          </>
        }
      >
        <p>
          {d.nome} está levando <strong>{vezes(ajuste.ritmo.fator)}</strong> o previsto: {blocos(ajuste.ritmo.real)} em vez de {blocos(ajuste.ritmo.previsto)} em{' '}
          {ajuste.ritmo.topicos === 1 ? '1 tópico' : `${ajuste.ritmo.topicos} tópicos`}. Ajustar a estimativa dos que ainda não começaram, na mesma proporção?
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-1 text-sm">
          {ajuste.mudancas.map((m) => (
            <li key={m.topico.id} className="flex justify-between gap-3 rounded-md bg-superficie-2 px-3 py-1.5">
              <span className="min-w-0">{m.topico.titulo}</span>
              <span className="numeros shrink-0 font-bold">
                {m.de} → {m.para} blocos
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-suave">Dá para mudar cada estimativa depois no Edital (Blocos de teoria).</p>
      </Modal>
    );
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Terminou a teoria?"
      rodape={
        <Botao variante="fantasma" onClick={aoFechar}>
          Responder depois
        </Botao>
      }
    >
      <p>
        Os blocos previstos para <strong>{t.titulo}</strong> ({d.nome}) acabaram: {blocos(feitos)} de {estimativaTeoria(t)}.
      </p>
      {etapa === 'pergunta' ? (
        <>
          <p className="mt-2 text-sm text-suave">
            Se terminou, a revisão vem amanhã e o tópico passa a entrar nos blocos de questões. Se não, diga quantos blocos ainda precisa: o plano se
            ajusta.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao disabled={ocupado} onClick={() => void terminei()}>
              Terminei
            </Botao>
            <Botao variante="secundario" disabled={ocupado} onClick={() => setEtapa('mais')}>
              Ainda não
            </Botao>
          </div>
        </>
      ) : (
        <fieldset className="mt-4">
          <legend className="font-bold">Quantos blocos de {minutos} ainda precisa?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Botao key={n} variante="secundario" disabled={ocupado} onClick={() => void mais(n)}>
                +{n}
              </Botao>
            ))}
          </div>
        </fieldset>
      )}
    </Modal>
  );
}

/**
 * Abre a pergunta quando um tópico chega ao fim dos blocos previstos por algo feito neste
 * aparelho (fechar ou registrar a sessão, marcar o bloco). O que chega de outro aparelho pela
 * sincronização não abre nada: fica no cartão da Home.
 */
export function VigiaTeoria() {
  const { repo } = useApp();
  const pendentes = useTeoriasAConfirmar();
  const anteriores = useRef<Set<Id> | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  useEffect(() => {
    const antes = anteriores.current;
    anteriores.current = new Set(pendentes.map((p) => p.topico.id));
    // Na abertura do app, os que já estavam pendentes ficam no cartão da Home.
    if (!antes || alvo) return;
    const novo = pendentes.find((p) => !antes.has(p.topico.id) && repo.tocouATeoria(p.topico));
    if (novo) setAlvo({ disciplinaId: novo.disciplina.id, topicoId: novo.topico.id });
  }, [pendentes, alvo, repo]);
  return <ModalTeoria alvo={alvo} aoFechar={() => setAlvo(null)} />;
}

/** Cartão da Home com os tópicos que esperam a resposta, agrupados por assunto. */
export function CartaoFimDaTeoria() {
  const pendentes = useTeoriasAConfirmar();
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const porAssunto = new Map<Id, TeoriaAConfirmar[]>();
  for (const p of pendentes) porAssunto.set(p.disciplina.id, [...(porAssunto.get(p.disciplina.id) ?? []), p]);
  // O modal fica sempre no mesmo lugar: respondido o último tópico, o cartão some, mas o
  // modal continua para o passo do ajuste do assunto.
  return (
    <>
      {pendentes.length > 0 && (
        <Cartao titulo={<span className="flex items-center gap-2"><BookCheck size={18} /> Terminou a teoria?</span>}>
          <p className="text-sm text-suave">Os blocos previstos para estes tópicos acabaram. Confirme o fim da teoria ou diga quantos blocos ainda faltam.</p>
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {[...porAssunto.values()].map((lista) => (
              <li key={lista[0].disciplina.id} className="grid grid-cols-1 gap-1.5">
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: lista[0].disciplina.cor }} aria-hidden />
                  {lista[0].disciplina.nome}
                </p>
                <ul className="grid grid-cols-1 gap-1.5">
                  {lista.map((p) => (
                    <li key={p.topico.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-superficie-2 px-3 py-2">
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block font-bold">{p.topico.titulo}</span>
                        <span className="numeros block text-sm text-suave">
                          {blocos(p.feitos)} de {p.estimativa} previstos
                        </span>
                      </span>
                      <Botao tamanho="pequeno" aria-label={`Responder sobre ${p.topico.titulo}`} onClick={() => setAlvo({ disciplinaId: p.disciplina.id, topicoId: p.topico.id })}>
                        Responder
                      </Botao>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <ModalTeoria alvo={alvo} aoFechar={() => setAlvo(null)} />
    </>
  );
}
