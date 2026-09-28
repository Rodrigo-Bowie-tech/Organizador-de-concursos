import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Repositorio } from './dados/repositorio';
import type { Arquivos } from './dados/repositorio';
import { abrirStore, recursoClaude } from './dados/store';
import { ProvedorDados } from './estado';
import './estilos.css';
import type { Amostra, ArmazemArquivos, Recursos } from './plataforma';

function Carregando() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-xl font-extrabold text-verde-forte">Organizador de Concursos</p>
        <p className="mt-1 text-suave">Carregando seus dados…</p>
      </div>
    </div>
  );
}

async function iniciar() {
  const raiz = createRoot(document.getElementById('raiz') as HTMLElement);
  raiz.render(<Carregando />);
  const [store, ia, armazem] = await Promise.all([
    abrirStore(),
    recursoClaude<Amostra>('sample'),
    recursoClaude<ArmazemArquivos>('assets'),
  ]);
  const arquivos: Arquivos | null = armazem && {
    enviar: async (arquivo) => {
      const r = await armazem.upload(arquivo, arquivo.type ? undefined : { type: 'application/pdf' });
      return { id: r.id, url: r.url };
    },
    remover: async (id) => void (await armazem.delete(id)),
  };
  const recursos: Recursos = { ia, arquivos: armazem };
  const repo = new Repositorio(store, undefined, arquivos);
  repo.iniciar();
  await repo.pronto();
  // O "replanejar de madrugada": na primeira abertura do dia.
  void repo.replanejarDoDia().catch(() => undefined);
  raiz.render(
    <ProvedorDados repo={repo} recursos={recursos}>
      <App />
    </ProvedorDados>,
  );
}

void iniciar();
