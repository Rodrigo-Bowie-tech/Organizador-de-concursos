import { ClipboardPaste, ExternalLink, Eye, EyeOff, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AreaTexto, Botao, BotaoIcone, CabecalhoTela, Campo, Cartao, Confirmar, Entrada, Etiqueta, Modal, Vazio } from '../componentes/ui';
import { diasEntre, formatarData, formatarHora } from '../dominio/datas';
import { hojeSP } from '../dominio/painel';
import type { FiltroRadar, Oportunidade } from '../dominio/tipos';
import { useApp } from '../estado';
import { mensagemErroIA } from '../plataforma';
import { aberta, casaAlgumFiltro, casaFiltro, ehUF, idOportunidade } from '../radar/radar';
import { montarPedidoRadar, validarOportunidades } from '../radar/texto';

const lista = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function ModalFiltro({ inicial, aoFechar }: { inicial: FiltroRadar | null; aoFechar: () => void }) {
  const { repo, executar } = useApp();
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [areas, setAreas] = useState(inicial?.areas.join(', ') ?? '');
  const [ufs, setUfs] = useState(inicial?.ufs.join(', ') ?? '');
  const [bancas, setBancas] = useState(inicial?.bancas.join(', ') ?? '');
  const [salario, setSalario] = useState(inicial?.salarioMinimo != null ? String(inicial.salarioMinimo) : '');
  const ufsLidas = lista(ufs).map((u) => u.toUpperCase());
  const ufsInvalidas = ufsLidas.filter((u) => !ehUF(u));

  async function salvar() {
    const id = await executar(
      () =>
        repo.salvarFiltroRadar({
          id: inicial?.id,
          nome: nome.trim() || 'Filtro',
          areas: lista(areas),
          ufs: ufsLidas,
          bancas: lista(bancas),
          salarioMinimo: Number(salario) > 0 ? Number(salario) : null,
        }),
      'Filtro salvo.',
    );
    if (id) aoFechar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={inicial ? 'Editar filtro' : 'Novo filtro'}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={ufsInvalidas.length > 0} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Campo rotulo="Nome">{(id) => <Entrada id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Elétrica no Sudeste" />}</Campo>
        <Campo rotulo="Áreas" dica="Separadas por vírgula. “Engenharia Elétrica” também acha “Engenheiro Eletricista”.">
          {(id) => <Entrada id={id} value={areas} onChange={(e) => setAreas(e.target.value)} />}
        </Campo>
        <Campo rotulo="UFs" dica={ufsInvalidas.length ? `Sigla inválida: ${ufsInvalidas.join(', ')}` : 'Ex.: SP, RJ. Concursos nacionais sempre aparecem.'}>
          {(id) => <Entrada id={id} value={ufs} onChange={(e) => setUfs(e.target.value)} />}
        </Campo>
        <Campo rotulo="Bancas" dica="Opcional. Ex.: FCC, Cesgranrio.">
          {(id) => <Entrada id={id} value={bancas} onChange={(e) => setBancas(e.target.value)} />}
        </Campo>
        <Campo rotulo="Salário mínimo (R$)" dica="Opcional. Sem salário informado, a oportunidade não passa neste filtro.">
          {(id) => <Entrada id={id} type="number" min={0} step="100" value={salario} onChange={(e) => setSalario(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  );
}

function ModalManual({ aoFechar }: { aoFechar: () => void }) {
  const { repo, executar } = useApp();
  const [f, setF] = useState({ orgao: '', cargos: '', uf: 'SP', banca: '', salario: '', vagas: '', inscricoesAte: '', link: '' });
  const muda = (campo: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [campo]: e.target.value });
  const uf = f.uf.trim().toUpperCase();
  const ok = f.orgao.trim() && (ehUF(uf) || uf === 'BR');

  async function salvar() {
    const o: Oportunidade = {
      id: '',
      titulo: f.orgao.trim(),
      orgao: f.orgao.trim(),
      banca: f.banca.trim(),
      cargos: lista(f.cargos),
      salario: Number(f.salario) > 0 ? Number(f.salario) : null,
      vagas: Number(f.vagas) > 0 ? Math.round(Number(f.vagas)) : null,
      uf,
      inscricoesAte: f.inscricoesAte || null,
      link: f.link.trim(),
      fonte: 'manual',
      coletadoEm: new Date().toISOString(),
    };
    o.id = idOportunidade(o);
    const r = await executar(() => repo.salvarOportunidades([o]), 'Oportunidade adicionada.');
    if (r) aoFechar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Adicionar oportunidade"
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao disabled={!ok} onClick={() => void salvar()}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Órgão" className="sm:col-span-2">{(id) => <Entrada id={id} value={f.orgao} onChange={muda('orgao')} />}</Campo>
        <Campo rotulo="Cargos" dica="Separados por vírgula." className="sm:col-span-2">{(id) => <Entrada id={id} value={f.cargos} onChange={muda('cargos')} />}</Campo>
        <Campo rotulo="UF" dica="Sigla, ou BR se for nacional.">{(id) => <Entrada id={id} value={f.uf} maxLength={2} onChange={muda('uf')} />}</Campo>
        <Campo rotulo="Banca">{(id) => <Entrada id={id} value={f.banca} onChange={muda('banca')} />}</Campo>
        <Campo rotulo="Salário (R$)">{(id) => <Entrada id={id} type="number" min={0} value={f.salario} onChange={muda('salario')} />}</Campo>
        <Campo rotulo="Vagas">{(id) => <Entrada id={id} type="number" min={0} value={f.vagas} onChange={muda('vagas')} />}</Campo>
        <Campo rotulo="Inscrições até">{(id) => <Entrada id={id} type="date" value={f.inscricoesAte} onChange={muda('inscricoesAte')} />}</Campo>
        <Campo rotulo="Link">{(id) => <Entrada id={id} type="url" value={f.link} onChange={muda('link')} placeholder="https://" />}</Campo>
      </div>
    </Modal>
  );
}

type Extraida = Oportunidade & { incluir: boolean };

/** Cola o texto de uma página (PCI, notícia, edital) e a IA lista os concursos. */
function ModalColar({ aoFechar }: { aoFechar: () => void }) {
  const { repo, executar, avisar, recursos } = useApp();
  const [texto, setTexto] = useState('');
  const [itens, setItens] = useState<Extraida[] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => () => controle.current?.abort(), []);

  async function extrair() {
    if (!recursos.ia) return;
    setErro(null);
    setLendo(true);
    const ctl = new AbortController();
    controle.current = ctl;
    try {
      const resposta = await recursos.ia.json(montarPedidoRadar(texto.slice(0, 60000), hojeSP()), { signal: ctl.signal, modelTier: 'default', cache: false });
      const achadas = validarOportunidades(resposta, 'texto colado', new Date().toISOString());
      if (!achadas.length) setErro('A IA não encontrou concursos neste texto.');
      else setItens(achadas.map((o) => ({ ...o, incluir: true })));
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      if (codigo !== 'cancelled') setErro(mensagemErroIA(codigo));
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    const escolhidas = (itens ?? []).filter((i) => i.incluir).map(({ incluir: _, ...o }) => o);
    const r = await executar(() => repo.salvarOportunidades(escolhidas));
    if (r) {
      avisar(`${r.novas} ${r.novas === 1 ? 'nova' : 'novas'} no radar${r.atualizadas ? `, ${r.atualizadas} atualizadas` : ''}.`);
      aoFechar();
    }
  }

  const marcadas = itens?.filter((i) => i.incluir).length ?? 0;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Colar página"
      largo
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          {itens ? (
            <Botao disabled={!marcadas} onClick={() => void salvar()}>
              Salvar {marcadas} {marcadas === 1 ? 'oportunidade' : 'oportunidades'}
            </Botao>
          ) : (
            <Botao disabled={texto.trim().length < 20 || lendo || !recursos.ia} onClick={() => void extrair()}>
              {lendo ? 'Lendo…' : 'Extrair com IA'}
            </Botao>
          )}
        </>
      }
    >
      {!itens ? (
        <div className="grid gap-3">
          <p className="text-sm text-suave">
            Abra a listagem do PCI Concursos (ou uma notícia de concurso), selecione tudo, copie e cole aqui. A IA do Claude separa os concursos
            para você conferir antes de salvar.
          </p>
          <Campo rotulo="Texto da página">{(id) => <AreaTexto id={id} className="min-h-48" value={texto} onChange={(e) => setTexto(e.target.value)} />}</Campo>
          {erro && (
            <p role="alert" className="font-bold text-perigo">
              {erro}
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-2">
          {itens.map((o, i) => (
            <li key={o.id + i}>
              <label className="flex items-start gap-3 rounded-lg bg-superficie-2 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--verde)]"
                  checked={o.incluir}
                  onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, incluir: e.target.checked } : x)))}
                />
                <span className="min-w-0">
                  <span className="block font-bold">
                    {o.titulo} <span className="text-suave">· {o.uf}</span>
                  </span>
                  <span className="block text-sm text-suave">
                    {[o.cargos.join(', '), o.salario !== null && reais(o.salario), o.vagas !== null && `${o.vagas} vagas`, o.inscricoesAte && `até ${formatarData(o.inscricoesAte)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function CartaoOportunidade({ o, nova, hoje }: { o: Oportunidade; nova: boolean; hoje: string }) {
  const { dados, repo, executar, escolherConcurso, irPara } = useApp();
  const jaCadastrado = dados.concursos.find((c) => (o.link && c.link === o.link) || c.nome === (o.orgao || o.titulo));
  const encerrada = !aberta(o, hoje);
  const faltam = o.inscricoesAte ? diasEntre(hoje, o.inscricoesAte) : null;

  async function transformar() {
    const filtro = dados.filtrosRadar.find((f) => casaFiltro(o, f));
    const area = filtro?.areas.find((a) => casaFiltro(o, { ...filtro, areas: [a] })) ?? '';
    const id = await executar(() => repo.transformarEmConcurso(o, area), 'Concurso criado. Agora importe o edital.');
    if (id) {
      escolherConcurso(id);
      irPara('importar');
    }
  }

  return (
    <li className="rounded-xl bg-superficie p-4 shadow-cartao">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="flex flex-wrap items-center gap-2 font-extrabold">
            {o.titulo}
            {nova && <Etiqueta tom="roxo">nova</Etiqueta>}
            {o.ignorada && <Etiqueta>ignorada</Etiqueta>}
          </p>
          <p className="text-sm text-suave">
            {[o.uf === 'BR' ? 'Nacional' : o.uf, o.banca && `Banca ${o.banca}`, `via ${o.fonte}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {encerrada ? (
          <Etiqueta>encerrada</Etiqueta>
        ) : faltam !== null ? (
          <Etiqueta tom={faltam <= 7 ? 'alerta' : 'verde'}>
            {faltam === 0 ? 'inscrições até hoje' : `inscrições até ${formatarData(o.inscricoesAte as string)}`}
          </Etiqueta>
        ) : (
          <Etiqueta>prazo não informado</Etiqueta>
        )}
      </div>
      {o.cargos.length > 0 && <p className="mt-2 text-sm">{o.cargos.join(', ')}</p>}
      <p className="numeros mt-1 text-sm font-bold">
        {[o.salario !== null && `até ${reais(o.salario)}`, o.vagas !== null && `${o.vagas} ${o.vagas === 1 ? 'vaga' : 'vagas'}`].filter(Boolean).join(' · ') ||
          'Salário e vagas não informados'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {jaCadastrado ? (
          <Etiqueta tom="verde">já está em Concursos</Etiqueta>
        ) : (
          <Botao tamanho="pequeno" onClick={() => void transformar()}>
            <FolderPlus size={16} /> Transformar em concurso
          </Botao>
        )}
        {o.link && (
          <a
            href={o.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold text-verde-forte hover:bg-verde-suave"
          >
            <ExternalLink size={16} /> Abrir anúncio
          </a>
        )}
        <Botao tamanho="pequeno" variante="fantasma" className="ml-auto" onClick={() => void executar(() => repo.ignorarOportunidade(o, !o.ignorada))}>
          {o.ignorada ? <Eye size={16} /> : <EyeOff size={16} />} {o.ignorada ? 'Mostrar de novo' : 'Ignorar'}
        </Botao>
      </div>
    </li>
  );
}

function Alternar({ rotulo, valor, mudar }: { rotulo: string; valor: boolean; mudar: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      <input type="checkbox" className="h-4 w-4 accent-[var(--verde)]" checked={valor} onChange={(e) => mudar(e.target.checked)} />
      {rotulo}
    </label>
  );
}

export function Radar() {
  const { dados, repo, executar, recursos } = useApp();
  const hoje = hojeSP();
  // "Nova" = chegou depois da visita anterior; a marca fica até sair da tela.
  const [vistoAte] = useState(dados.radarVistoAte);
  const [soFiltros, setSoFiltros] = useState(true);
  const [encerradas, setEncerradas] = useState(false);
  const [ignoradas, setIgnoradas] = useState(false);
  const [filtro, setFiltro] = useState<FiltroRadar | null | 'novo'>(null);
  const [excluir, setExcluir] = useState<FiltroRadar | null>(null);
  const [modal, setModal] = useState<'colar' | 'manual' | null>(null);

  const ops = dados.oportunidades;
  useEffect(() => {
    if (ops.some((o) => !dados.radarVistoAte || o.coletadoEm > dados.radarVistoAte)) void repo.marcarRadarVisto().catch(() => undefined);
    // Só ao abrir a tela e quando chegarem oportunidades.
  }, [ops.length]);

  const visiveis = useMemo(
    () =>
      ops.filter(
        (o) => (ignoradas || !o.ignorada) && (encerradas || aberta(o, hoje)) && (!soFiltros || casaAlgumFiltro(o, dados.filtrosRadar)),
      ),
    [ops, ignoradas, encerradas, soFiltros, hoje, dados.filtrosRadar],
  );
  const ultimaColeta = ops.filter((o) => o.fonte === 'PCI Concursos').reduce<string | null>((m, o) => (!m || o.coletadoEm > m ? o.coletadoEm : m), null);

  return (
    <>
      <CabecalhoTela
        titulo="Radar de concursos"
        subtitulo={
          ultimaColeta
            ? `Última coleta do PCI: ${formatarData(ultimaColeta)} às ${formatarHora(ultimaColeta)}`
            : 'A coleta diária do PCI ainda não rodou. Cole a página ou adicione à mão.'
        }
        acoes={
          <>
            {recursos.ia && (
              <Botao variante="secundario" onClick={() => setModal('colar')}>
                <ClipboardPaste size={18} /> Colar página
              </Botao>
            )}
            <Botao onClick={() => setModal('manual')}>
              <Plus size={18} /> Adicionar
            </Botao>
          </>
        }
      />

      <div className="grid gap-4">
        <Cartao
          titulo="Meus filtros"
          acao={
            <Botao tamanho="pequeno" variante="secundario" onClick={() => setFiltro('novo')}>
              <Plus size={16} /> Novo filtro
            </Botao>
          }
        >
          {!dados.filtrosRadar.length ? (
            <p className="text-sm text-suave">Sem filtros: todas as oportunidades aparecem e geram alerta na Home.</p>
          ) : (
            <ul className="grid gap-2">
              {dados.filtrosRadar.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-superficie-2 px-3 py-2">
                  <span className="font-bold">{f.nome}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {f.areas.map((a) => (
                      <Etiqueta key={a} tom="verde">
                        {a}
                      </Etiqueta>
                    ))}
                    {f.ufs.map((u) => (
                      <Etiqueta key={u}>{u}</Etiqueta>
                    ))}
                    {f.bancas.map((b) => (
                      <Etiqueta key={b} tom="roxo">
                        {b}
                      </Etiqueta>
                    ))}
                    {f.salarioMinimo !== null && <Etiqueta>a partir de {reais(f.salarioMinimo)}</Etiqueta>}
                  </span>
                  <BotaoIcone rotulo={`Editar filtro ${f.nome}`} onClick={() => setFiltro(f)}>
                    <Pencil size={16} />
                  </BotaoIcone>
                  <BotaoIcone rotulo={`Excluir filtro ${f.nome}`} onClick={() => setExcluir(f)}>
                    <Trash2 size={16} />
                  </BotaoIcone>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Alternar rotulo="Só o que bate com meus filtros" valor={soFiltros} mudar={setSoFiltros} />
          <Alternar rotulo="Mostrar encerradas" valor={encerradas} mudar={setEncerradas} />
          <Alternar rotulo="Mostrar ignoradas" valor={ignoradas} mudar={setIgnoradas} />
        </div>

        {!visiveis.length ? (
          <Vazio
            titulo={ops.length ? 'Nada com esses filtros' : 'Radar vazio'}
            texto={
              ops.length
                ? 'Nenhuma oportunidade aberta bate com os filtros. Desmarque “Só o que bate com meus filtros” para ver todas.'
                : 'As oportunidades chegam pela coleta diária do PCI Concursos, pela página colada ou pelo cadastro manual.'
            }
          />
        ) : (
          <ul className="grid gap-3" aria-label="Oportunidades">
            {visiveis.map((o) => (
              <CartaoOportunidade key={o.id} o={o} hoje={hoje} nova={!o.ignorada && (!vistoAte || o.coletadoEm > vistoAte)} />
            ))}
          </ul>
        )}
      </div>

      {filtro && <ModalFiltro inicial={filtro === 'novo' ? null : filtro} aoFechar={() => setFiltro(null)} />}
      {modal === 'colar' && <ModalColar aoFechar={() => setModal(null)} />}
      {modal === 'manual' && <ModalManual aoFechar={() => setModal(null)} />}
      <Confirmar
        aberto={Boolean(excluir)}
        titulo="Excluir filtro"
        texto={`Excluir o filtro “${excluir?.nome}”? As oportunidades continuam no radar.`}
        rotuloAcao="Excluir"
        aoConfirmar={() => excluir && void executar(() => repo.excluirFiltroRadar(excluir.id), 'Filtro excluído.')}
        aoFechar={() => setExcluir(null)}
      />
    </>
  );
}
