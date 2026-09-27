// Recursos do navegador e do claude.ai usados pelas telas.

import { recursoClaude } from './dados/store';

interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}

/** Estamos dentro do claude.ai (o runtime dos Artifacts existe)? */
export function dentroDoClaude(): boolean {
  return typeof (globalThis as { claude?: { use?: unknown } }).claude?.use === 'function';
}

/**
 * Oferece um arquivo para salvar. No claude.ai usa o recurso `downloads`
 * (o navegador pede confirmação); fora dele, um download comum.
 * Devolve `false` se a pessoa recusou.
 */
export async function salvarArquivo(nome: string, conteudo: string): Promise<boolean> {
  if (dentroDoClaude()) {
    const downloads = await recursoClaude<Downloads>('downloads');
    if (!downloads) throw { codigo: 'indisponivel', mensagem: 'Salvar arquivos não está disponível nesta visualização.' };
    try {
      await downloads.save({ filename: nome, data: conteudo });
      return true;
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      if (codigo === 'declined') return false;
      throw { codigo: codigo ?? 'indisponivel', mensagem: 'Não foi possível salvar o arquivo. Tente de novo.' };
    }
  }
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Mantém a tela acesa enquanto o cronômetro roda (quando o aparelho permite). */
export async function manterTelaAcesa(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    const trava = await nav.wakeLock?.request('screen');
    return () => void trava?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}

let audio: AudioContext | null = null;

/** Três bipes curtos (fim do foco ou da pausa no Pomodoro). */
export function tocarAlerta(): void {
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const ganho = audio.createGain();
      osc.frequency.value = 880;
      ganho.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      ganho.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.35 + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      osc.connect(ganho).connect(audio.destination);
      osc.start(t0 + i * 0.35);
      osc.stop(t0 + i * 0.35 + 0.3);
    }
  } catch {
    // sem áudio: o aviso visual continua
  }
}

/** Libera o áudio a partir de um clique (navegadores só tocam som após interação). */
export function prepararAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // idem
  }
}

export function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarLocal(chave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // preferência só desta visita
  }
}
