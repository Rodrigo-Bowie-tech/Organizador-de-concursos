import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { ListaMateriais, ModalMaterial } from '../componentes/Materiais';
import { Botao, CabecalhoTela, Cartao, Confirmar, Entrada, Vazio } from '../componentes/ui';
import { achatar } from '../dominio/topicos';
import type { Material } from '../dominio/tipos';
import { useApp } from '../estado';

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function Biblioteca() {
  const { dados, disciplinas, concursoAtivo, repo, executar, irPara } = useApp();
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<{ disciplinaId: string } | null>(null);
  const [editando, setEditando] = useState<Material | null>(null);
  const [excluir, setExcluir] = useState<Material | null>(null);

  if (!concursoAtivo || !disciplinas.length) {
    return (
      <>
        <CabecalhoTela titulo="Biblioteca" />
        <Vazio
          titulo="Cadastre as disciplinas primeiro"
          texto="A biblioteca guarda PDFs, videoaulas, links e trechos de livro ligados a cada tópico do edital."
          acao={<Botao onClick={() => irPara(concursoAtivo ? 'disciplinas' : 'concursos')}>{concursoAtivo ? 'Ir para Disciplinas' : 'Ir para Concursos'}</Botao>}
        />
      </>
    );
  }

  const termo = normalizar(busca.trim());
  const combina = (m: Material, tituloTopico: string) =>
    !termo || normalizar([m.titulo, m.trecho, m.observacao, m.arquivoNome ?? '', tituloTopico].join(' ')).includes(termo);
  const total = dados.materiais.filter((m) => disciplinas.some((d) => d.id === m.disciplinaId)).length;

  return (
    <>
      <CabecalhoTela
        titulo="Biblioteca"
        subtitulo={`${concursoAtivo.nome} · ${total} ${total === 1 ? 'material' : 'materiais'}`}
        acoes={
          <Botao onClick={() => setNovo({ disciplinaId: disciplinas[0].id })}>
            <Plus size={18} /> Adicionar material
          </Botao>
        }
      />

      <label className="relative mb-4 block max-w-md">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-suave" aria-hidden />
        <Entrada aria-label="Buscar na biblioteca" className="pl-9" value={busca} placeholder="Buscar material ou tópico" onChange={(e) => setBusca(e.target.value)} />
      </label>

      <div className="grid grid-cols-1 gap-4">
        {disciplinas.map((d) => {
          const doDisc = dados.materiais.filter((m) => m.disciplinaId === d.id);
          const gerais = doDisc.filter((m) => !m.topicoId || !d.topicos[m.topicoId]).filter((m) => combina(m, ''));
          const porTopico = achatar(d.topicos)
            .map((l) => ({ linha: l, lista: doDisc.filter((m) => m.topicoId === l.topico.id && combina(m, l.topico.titulo)) }))
            .filter((x) => x.lista.length);
          const vazio = !gerais.length && !porTopico.length;
          if (termo && vazio) return null;
          return (
            <Cartao
              key={d.id}
              titulo={
                <span className="flex items-center gap-2">
                  <span className="h-5 w-1.5 rounded-full" style={{ background: d.cor }} aria-hidden />
                  {d.nome}
                </span>
              }
              acao={
                <Botao tamanho="pequeno" variante="secundario" onClick={() => setNovo({ disciplinaId: d.id })}>
                  <Plus size={16} /> Material
                </Botao>
              }
            >
              {vazio ? (
                <p className="text-sm text-suave">Nenhum material. Adicione a apostila, as videoaulas e os livros desta disciplina.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {gerais.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-extrabold text-suave">Disciplina inteira</p>
                      <ListaMateriais materiais={gerais} aoEditar={setEditando} aoExcluir={setExcluir} />
                    </div>
                  )}
                  {porTopico.map(({ linha, lista }) => (
                    <div key={linha.topico.id}>
                      <p className="mb-1 text-sm font-extrabold text-suave">
                        {linha.numero} {linha.topico.titulo}
                      </p>
                      <ListaMateriais materiais={lista} aoEditar={setEditando} aoExcluir={setExcluir} />
                    </div>
                  ))}
                </div>
              )}
            </Cartao>
          );
        })}
      </div>

      <ModalMaterial
        aberto={Boolean(novo || editando)}
        aoFechar={() => {
          setNovo(null);
          setEditando(null);
        }}
        inicial={editando}
        disciplinaId={novo?.disciplinaId}
      />
      <Confirmar
        aberto={Boolean(excluir)}
        aoFechar={() => setExcluir(null)}
        titulo="Excluir material?"
        texto={excluir && <><strong>{excluir.titulo}</strong> sai da biblioteca{excluir.arquivoId ? ' e o PDF enviado é apagado' : ''}.</>}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.removerMaterial(excluir), 'Material excluído.')}
      />
    </>
  );
}
