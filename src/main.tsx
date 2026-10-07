import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Repositorio } from './dados/repositorio';
import type { Arquivos } from './dados/repositorio';
import { abrirBancoDoAparelho } from './dados/aparelho';
import { Sincronizador } from './dados/sincronizacao';
import { abrirStore, recursoClaude } from './dados/store';
import { ProvedorDados } from './estado';
import './estilos.css';
import { APP_INSTALAVEL, prepararAppInstalavel } from './plataforma';
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
  // A página do Artifact não tem <html> próprio: o idioma vai por aqui (leitores de tela, hifenização).
  document.documentElement.lang = 'pt-BR';
  if (APP_INSTALAVEL) prepararAppInstalavel();
  const raiz = createRoot(document.getElementById('raiz') as HTMLElement);
  raiz.render(<Carregando />);
  const [aparelho, ia, armazem] = await Promise.all([
    APP_INSTALAVEL ? abrirBancoDoAparelho() : null,
    recursoClaude<Amostra>('sample'),
    recursoClaude<ArmazemArquivos>('assets'),
  ]);
  const store = aparelho ?? (await abrirStore());
  const arquivos: Arquivos | null = armazem && {
    enviar: async (arquivo) => {
      const r = await armazem.upload(arquivo, arquivo.type ? undefined : { type: 'application/pdf' });
      return { id: r.id, url: r.url };
    },
    remover: async (id) => void (await armazem.delete(id)),
  };
  const sinc = aparelho && new Sincronizador(aparelho);
  const recursos: Recursos = { ia, arquivos: armazem, sinc };
  const repo = new Repositorio(store, undefined, arquivos);
  repo.iniciar();
  await repo.pronto();
  if (sinc) {
    // Plano mudado em dois aparelhos soma os blocos dos dois; replanejar refaz uma vez só.
    sinc.aoJuntar((caminhos) => {
      if (caminhos.some((c) => c.startsWith('plano/'))) void repo.replanejarSePuder().catch(() => undefined);
    });
    // Antes de replanejar o dia, traz o que os outros aparelhos fizeram (espera no máximo 4 s).
    await sinc.iniciar(4000);
  }
  // O "replanejar de madrugada": na primeira abertura do dia.
  void repo.replanejarDoDia().catch(() => undefined);
  raiz.render(
    <ProvedorDados repo={repo} recursos={recursos}>
      <App />
    </ProvedorDados>,
  );
}

void iniciar();
