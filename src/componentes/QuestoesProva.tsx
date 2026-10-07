import { useMemo, useState } from 'react';
import { LETRAS } from '../dominio/pratica';
import { aplicarGabarito, codigosDoEdital, lerGabarito } from '../dominio/provas';
import type { QuestaoImportada } from '../dominio/provas';
import type { Disciplina } from '../dominio/tipos';
import { AreaTexto, Botao, Etiqueta, cx } from './ui';

export type QuestaoEditavel = QuestaoImportada & { chave: string };

const ehCertoErrado = (q: Pick<QuestaoImportada, 'alternativas'>) =>
  q.alternativas.length === 2 && /^certo$/i.test(q.alternativas[0]) && /^errado$/i.test(q.alternativas[1]);

export const letraDaResposta = (q: Pick<QuestaoImportada, 'alternativas'>, i: number) => (ehCertoErrado(q) ? q.alternativas[i] : LETRAS[i]);

/** Revisão das questões: assunto do edital, gabarito e anulada. */
export function EditorQuestoes({
  questoes,
  disciplinas,
  aoMudar,
}: {
  questoes: QuestaoEditavel[];
  disciplinas: Disciplina[];
  aoMudar: (q: QuestaoEditavel[]) => void;
}) {
  const [soSemAssunto, setSoSemAssunto] = useState(false);
  const [gabarito, setGabarito] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const codigos = useMemo(() => codigosDoEdital(disciplinas), [disciplinas]);
  const mudar = (chave: string, patch: Partial<QuestaoEditavel>) => aoMudar(questoes.map((q) => (q.chave === chave ? { ...q, ...patch } : q)));
  const semAssunto = questoes.filter((q) => !q.disciplinaId).length;
  const semGabarito = questoes.filter((q) => q.correta === null && !q.anulada).length;
  const visiveis = soSemAssunto ? questoes.filter((q) => !q.disciplinaId) : questoes;

  function aplicar() {
    const g = lerGabarito(gabarito);
    if (!g.size) {
      setAviso('Não achei pares de número e letra. Exemplo: 1-A 2-C 3-E.');
      return;
    }
    aoMudar(aplicarGabarito(questoes, g));
    setAviso(`Gabarito aplicado a ${questoes.filter((q) => g.has(q.numero)).length} questões.`);
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Etiqueta tom="verde">{questoes.length} questões</Etiqueta>
        <Etiqueta tom={semAssunto ? 'alerta' : 'neutro'}>{semAssunto} sem assunto</Etiqueta>
        <Etiqueta tom={semGabarito ? 'alerta' : 'neutro'}>{semGabarito} sem gabarito</Etiqueta>
        <label className="ml-auto flex items-center gap-2 font-bold">
          <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={soSemAssunto} onChange={(e) => setSoSemAssunto(e.target.checked)} />
          Só as sem assunto
        </label>
      </div>
      <details className="rounded-lg bg-superficie-2 px-3 py-2">
        <summary className="cursor-pointer font-bold">Colar gabarito</summary>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <AreaTexto
            aria-label="Gabarito"
            className="min-h-20 font-mono text-sm"
            placeholder={'1-A 2-C 3-E 4-X (X = anulada)\nou a tabela do gabarito oficial'}
            value={gabarito}
            onChange={(e) => setGabarito(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Botao tamanho="pequeno" variante="secundario" disabled={!gabarito.trim()} onClick={aplicar}>
              Aplicar gabarito
            </Botao>
            {aviso && <span className="text-sm font-bold text-suave" role="status">{aviso}</span>}
          </div>
        </div>
      </details>
      <ol className="grid grid-cols-1 gap-2">
        {visiveis.map((q) => (
          <li key={q.chave} className={cx('grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-borda px-3 py-2.5', q.anulada && 'opacity-60')}>
            <p className="text-sm">
              <span className="numeros mr-1.5 font-extrabold">Q{q.numero}</span>
              <span className="line-clamp-3 whitespace-pre-line">{q.enunciado}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Assunto da questão ${q.numero}`}
                value={q.disciplinaId ? `${q.disciplinaId}|${q.topicoId ?? ''}` : ''}
                onChange={(e) => {
                  const [disciplinaId, topicoId] = e.target.value.split('|');
                  mudar(q.chave, { disciplinaId: disciplinaId || null, topicoId: topicoId || null });
                }}
                className={cx('w-full min-w-0 flex-1 basis-56 rounded-md border bg-superficie px-2 py-1.5 text-sm', q.disciplinaId ? 'border-borda' : 'border-alerta')}
              >
                <option value="">Sem assunto do edital</option>
                {disciplinas.map((d) => (
                  <optgroup key={d.id} label={d.nome}>
                    <option value={`${d.id}|`}>{d.nome} (disciplina inteira)</option>
                    {codigos
                      .filter((c) => c.disciplinaId === d.id && c.topicoId)
                      .map((c) => (
                        <option key={c.codigo} value={`${d.id}|${c.topicoId}`}>
                          {c.rotulo.split(' › ').slice(1).join(' › ')}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label={`Gabarito da questão ${q.numero}`}
                value={q.correta ?? ''}
                disabled={q.anulada || !q.alternativas.length}
                onChange={(e) => mudar(q.chave, { correta: e.target.value === '' ? null : Number(e.target.value) })}
                className="rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm"
              >
                <option value="">Gabarito –</option>
                {q.alternativas.map((a, i) => (
                  <option key={i} value={i}>
                    {ehCertoErrado(q) ? a : `${LETRAS[i]}) ${a.slice(0, 40)}`}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm font-bold">
                <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={q.anulada} onChange={(e) => mudar(q.chave, { anulada: e.target.checked })} />
                Anulada
              </label>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
