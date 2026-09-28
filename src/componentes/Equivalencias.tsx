import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { sugerirEquivalencias } from '../dominio/edital';
import type { RefTopico } from '../dominio/edital';
import { useApp } from '../estado';
import { Botao, Cartao } from './ui';

/**
 * Sugestões de tópicos equivalentes entre o concurso ativo e os outros
 * concursos. Vincular faz o estudo de um contar para o outro.
 */
export function PainelEquivalencias() {
  const { dados, concursoAtivo, repo, executar } = useApp();
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const sugestoes = useMemo(() => {
    if (!concursoAtivo || dados.concursos.length < 2) return [];
    const refs: RefTopico[] = dados.disciplinas.flatMap((d) =>
      Object.values(d.topicos).map((topico) => ({ concursoId: d.concursoId, disciplinaId: d.id, topico })),
    );
    return sugerirEquivalencias(refs, dados.vinculosIgnorados).filter(
      (s) => s.a.concursoId === concursoAtivo.id || s.b.concursoId === concursoAtivo.id,
    );
  }, [dados.disciplinas, dados.concursos, dados.vinculosIgnorados, concursoAtivo]);

  if (!sugestoes.length || !concursoAtivo) return null;
  const nome = (id: string) => dados.concursos.find((c) => c.id === id)?.nome ?? '';
  const visiveis = mostrarTodas ? sugestoes : sugestoes.slice(0, 5);

  return (
    <Cartao className="mt-4" titulo={<span className="flex items-center gap-2"><Link2 size={18} /> Tópicos parecidos em outros editais ({sugestoes.length})</span>}>
      <p className="mb-3 text-sm text-suave">
        Vincular faz o estudo de um contar para o outro: status, revisões, horas e questões passam a valer para os dois.
      </p>
      <ul className="grid gap-2">
        {visiveis.map((s) => {
          const [daqui, dali] = s.a.concursoId === concursoAtivo.id ? [s.a, s.b] : [s.b, s.a];
          return (
            <li key={`${s.a.topico.id}|${s.b.topico.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-superficie-2 px-3 py-2">
              <p className="min-w-0 flex-1 basis-64 text-sm">
                <strong>{daqui.topico.titulo}</strong>
                <span className="text-suave"> ≈ </span>
                <strong>{dali.topico.titulo}</strong>
                <span className="text-suave"> ({nome(dali.concursoId)})</span>
              </p>
              <div className="flex gap-2">
                <Botao
                  tamanho="pequeno"
                  onClick={() =>
                    void executar(
                      () => repo.vincularTopicos({ disciplinaId: daqui.disciplinaId, topicoId: daqui.topico.id }, { disciplinaId: dali.disciplinaId, topicoId: dali.topico.id }),
                      'Tópicos vinculados.',
                    )
                  }
                >
                  Vincular
                </Botao>
                <Botao tamanho="pequeno" variante="fantasma" onClick={() => void executar(() => repo.ignorarEquivalencia(s.a.topico.id, s.b.topico.id))}>
                  Ignorar
                </Botao>
              </div>
            </li>
          );
        })}
      </ul>
      {sugestoes.length > 5 && (
        <Botao tamanho="pequeno" variante="fantasma" className="mt-2" onClick={() => setMostrarTodas((v) => !v)}>
          {mostrarTodas ? 'Mostrar menos' : `Mostrar todas (${sugestoes.length})`}
        </Botao>
      )}
    </Cartao>
  );
}
