import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Repositorio } from './dados/repositorio';
import { abrirStore } from './dados/store';
import { ProvedorDados } from './estado';
import './estilos.css';

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
  const repo = new Repositorio(await abrirStore());
  repo.iniciar();
  await repo.pronto();
  raiz.render(
    <ProvedorDados repo={repo}>
      <App />
    </ProvedorDados>,
  );
}

void iniciar();
