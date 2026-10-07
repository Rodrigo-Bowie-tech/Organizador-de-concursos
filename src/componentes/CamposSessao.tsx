import type { DetalhesSessao } from '../dados/repositorio';
import { TIPO_SESSAO } from '../dominio/rotulos';
import { achatar } from '../dominio/topicos';
import type { TipoSessao } from '../dominio/tipos';
import { useApp } from '../estado';
import { AreaTexto, Campo, Entrada, Selecao } from './ui';

/** Concurso, disciplina, tópico e tipo de estudo. */
export function CamposEstudo({
  valor,
  aoMudar,
}: {
  valor: DetalhesSessao;
  aoMudar: (v: DetalhesSessao) => void;
}) {
  const { dados } = useApp();
  const disciplinas = dados.disciplinas.filter((d) => d.concursoId === valor.concursoId);
  const disciplina = disciplinas.find((d) => d.id === valor.disciplinaId);
  const linhas = disciplina ? achatar(disciplina.topicos) : [];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Campo rotulo="Concurso">
        {(id) => (
          <Selecao
            id={id}
            value={valor.concursoId ?? ''}
            onChange={(e) => aoMudar({ ...valor, concursoId: e.target.value || null, disciplinaId: null, topicoId: null })}
          >
            <option value="">Sem concurso</option>
            {dados.concursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Disciplina">
        {(id) => (
          <Selecao
            id={id}
            value={valor.disciplinaId ?? ''}
            disabled={!disciplinas.length}
            onChange={(e) => aoMudar({ ...valor, disciplinaId: e.target.value || null, topicoId: null })}
          >
            <option value="">{disciplinas.length ? 'Escolha a disciplina' : 'Nenhuma disciplina cadastrada'}</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Tópico" className="sm:col-span-2">
        {(id) => (
          <Selecao
            id={id}
            value={valor.topicoId ?? ''}
            disabled={!linhas.length}
            onChange={(e) => aoMudar({ ...valor, topicoId: e.target.value || null })}
          >
            <option value="">{linhas.length ? 'Disciplina inteira (sem tópico específico)' : 'Sem tópicos nesta disciplina'}</option>
            {linhas.map((l) => (
              <option key={l.topico.id} value={l.topico.id}>
                {'  '.repeat(l.nivel)}
                {l.numero} {l.topico.titulo}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Tipo de estudo" className="sm:col-span-2">
        {(id) => (
          <Selecao id={id} value={valor.tipo} onChange={(e) => aoMudar({ ...valor, tipo: e.target.value as TipoSessao })}>
            {Object.entries(TIPO_SESSAO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
    </div>
  );
}

const inteiro = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/** Questões, páginas, anotação e "concluí a teoria". */
export function CamposResultado({
  valor,
  aoMudar,
}: {
  valor: DetalhesSessao;
  aoMudar: (v: DetalhesSessao) => void;
}) {
  const feitas = valor.questoesFeitas ?? 0;
  const acertos = valor.acertos ?? 0;
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Questões feitas">
          {(id) => (
            <Entrada id={id} type="number" inputMode="numeric" min={0} value={feitas || ''} placeholder="0"
              onChange={(e) => aoMudar({ ...valor, questoesFeitas: inteiro(e.target.value) })} />
          )}
        </Campo>
        <Campo rotulo="Acertos">
          {(id) => (
            <Entrada id={id} type="number" inputMode="numeric" min={0} max={feitas} value={acertos || ''} placeholder="0"
              onChange={(e) => aoMudar({ ...valor, acertos: inteiro(e.target.value) })} />
          )}
        </Campo>
        <Campo rotulo="Páginas">
          {(id) => (
            <Entrada id={id} type="number" inputMode="numeric" min={0} value={valor.paginas || ''} placeholder="0"
              onChange={(e) => aoMudar({ ...valor, paginas: inteiro(e.target.value) })} />
          )}
        </Campo>
      </div>
      {acertos > feitas && <p className="text-sm text-alerta">Os acertos não podem passar das questões feitas.</p>}
      <Campo rotulo="Anotação rápida">
        {(id) => (
          <AreaTexto id={id} maxLength={1000} value={valor.anotacoes ?? ''} placeholder="O que ficou pendente, dúvidas, onde parou..."
            onChange={(e) => aoMudar({ ...valor, anotacoes: e.target.value })} />
        )}
      </Campo>
      {valor.topicoId && (
        <label className="flex items-center gap-2 rounded-lg bg-verde-suave px-3 py-2 font-bold text-verde-forte">
          <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={valor.concluiuTeoria ?? false}
            onChange={(e) => aoMudar({ ...valor, concluiuTeoria: e.target.checked })} />
          Concluí a teoria deste tópico
        </label>
      )}
    </div>
  );
}
