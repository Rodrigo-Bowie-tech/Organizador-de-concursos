import { useEffect, useRef } from 'react';
import { fasePomodoro } from '../dominio/cronometro';
import { useAgora, useApp } from '../estado';
import { tocarAlerta } from '../plataforma';

/**
 * Toca o alerta do Pomodoro em qualquer tela do app. Só avisa transições que
 * acontecem com o app aberto: ao recarregar, o estado atual vira a referência.
 */
export function VigiaPomodoro() {
  const { dados, avisar } = useApp();
  const ativa = dados.ativa;
  const cfg = dados.config.pomodoro;
  const ligado = Boolean(ativa && cfg.ativo);
  const agora = useAgora(1000, ligado);
  const anterior = useRef<{ sessao: string; ciclos: number; pausaEsgotada: boolean } | null>(null);

  useEffect(() => {
    if (!ligado || !ativa) {
      anterior.current = null;
      return;
    }
    const f = fasePomodoro(ativa, cfg, agora);
    const atual = { sessao: ativa.id, ciclos: f.ciclosCompletos, pausaEsgotada: f.fase !== 'foco' && f.restante <= 0 };
    const antes = anterior.current;
    anterior.current = atual;
    if (!antes || antes.sessao !== atual.sessao) return;

    if (f.fase === 'foco' && atual.ciclos > antes.ciclos) {
      tocarAlerta();
      const longa = atual.ciclos % Math.max(1, cfg.ciclosAtePausaLonga) === 0;
      avisar(`Fim do foco! Hora da pausa ${longa ? `longa (${cfg.pausaLongaMin} min)` : `curta (${cfg.pausaCurtaMin} min)`}.`);
    } else if (atual.pausaEsgotada && !antes.pausaEsgotada) {
      tocarAlerta();
      avisar('A pausa acabou. Hora de voltar ao estudo.');
    }
  }, [agora, ligado, ativa, cfg, avisar]);

  return null;
}
