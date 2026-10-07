import { Check, X } from 'lucide-react';
import { LETRAS } from '../dominio/pratica';
import { cx } from './ui';

/**
 * Alternativas de uma questão: um clique responde e revela a certa.
 * Sem `correta` (prova sem gabarito), só marca a escolhida.
 */
export function Alternativas({
  alternativas,
  correta,
  escolhida,
  comLetras,
  aoEscolher,
}: {
  alternativas: string[];
  correta: number | null;
  escolhida: number | null;
  comLetras: boolean;
  aoEscolher: (i: number) => void;
}) {
  const revelada = escolhida !== null;
  return (
    <div className="grid grid-cols-1 gap-2" role="group" aria-label="Alternativas">
      {alternativas.map((alt, i) => {
        const certa = i === correta;
        return (
          <button
            key={i}
            type="button"
            disabled={revelada}
            onClick={() => aoEscolher(i)}
            className={cx(
              'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition',
              !revelada && 'border-borda hover:border-verde hover:bg-verde-suave',
              revelada && certa && 'border-ok bg-ok/10',
              revelada && !certa && i === escolhida && (correta === null ? 'border-roxo bg-roxo/10' : 'border-perigo bg-perigo-suave'),
              revelada && !certa && i !== escolhida && 'border-borda opacity-60',
            )}
          >
            <span className="font-extrabold">{comLetras ? `${LETRAS[i]})` : ''}</span>
            <span className="flex-1">{alt}</span>
            {revelada && certa && <Check size={18} className="text-ok" aria-label="Correta" />}
            {revelada && correta !== null && !certa && i === escolhida && <X size={18} className="text-perigo" aria-label="Sua resposta" />}
          </button>
        );
      })}
    </div>
  );
}
