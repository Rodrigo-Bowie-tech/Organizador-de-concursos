import { Pause, Timer } from 'lucide-react';
import { estadoDaSessao, segundosLiquidos } from '../dominio/cronometro';
import { formatarRelogio } from '../dominio/datas';
import { useAgora, useApp } from '../estado';

/** Botão flutuante, sempre à mão, como no Estudei. Mostra o tempo quando há sessão. */
export function BotaoCronometro() {
  const { dados, irPara } = useApp();
  const ativa = dados.ativa;
  const agora = useAgora(1000, Boolean(ativa));
  const pausada = ativa && estadoDaSessao(ativa) === 'pausada';

  return (
    <button
      type="button"
      onClick={() => irPara('cronometro')}
      aria-label={ativa ? 'Abrir cronômetro (sessão em andamento)' : 'Abrir cronômetro'}
      className="fixed right-4 z-30 flex items-center gap-2 rounded-full bg-verde px-4 py-3.5 font-extrabold text-white shadow-cartao ring-4 ring-fundo transition hover:brightness-95 sm:right-6"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      {pausada ? <Pause size={22} /> : <Timer size={22} />}
      {ativa && <span className="numeros font-mono text-base">{formatarRelogio(segundosLiquidos(ativa, agora))}</span>}
    </button>
  );
}
