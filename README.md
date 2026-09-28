# Organizador de Concursos

App pessoal de estudos para concursos, inspirado no Estudei: edital verticalizado, cronômetro de horas
líquidas e painel de metas. Funciona dentro do **claude.ai**, com o seu login do Claude, no notebook, no
desktop e no celular. Os dados ficam no banco do próprio app, na nuvem.

**Abrir o app:** https://claude.ai/artifact/WaU6p8RVuBizYJRdFQ44LC

## O que já funciona (Fase 1)

- **Concursos**: cadastro com banca, cargo, data da prova, situação, prioridade e nota de corte.
- **Disciplinas**: peso, número de questões, tipo e cor.
- **Edital**: árvore de tópicos e subtópicos com status, autoavaliação, incidência e horas estudadas.
  Dá para colar uma lista de tópicos de uma vez.
- **Cronômetro**: iniciar, pausar, retomar e finalizar. Conta só o tempo líquido. Recarregar a página,
  fechar o app ou trocar de aparelho não perde a sessão. Tem Pomodoro opcional.
- **Histórico**: sessões por dia, edição, exclusão e registro manual ("esqueci de ligar o cronômetro").
- **Home**: horas de hoje, da semana e do mês comparadas com a meta, contagem regressiva das provas,
  cobertura do edital e sequência de dias estudados.
- **Configurações**: metas, Pomodoro, tema claro/escuro e backup em JSON.

## Melhorias
- **Revisões**: ao concluir a teoria de um tópico, a primeira revisão fica para o dia seguinte. Depois,
  D+7, D+30 e D+90, ajustados pela sua avaliação (errei, difícil, bom, fácil).
- **Biblioteca**: PDFs, videoaulas, links, livros e resumos ligados a cada tópico. Aparecem no
  cronômetro e na revisão do tópico.
- **Praticar com IA**: questões no estilo da banca (FCC, Cebraspe…) sobre o tópico, com gabarito e
  explicação. Usa o seu plano do Claude.
- **Balanço**: horas da semana, tempo × peso de cada disciplina na prova, disciplinas esquecidas,
  tópicos parados e projeção de cobertura do edital até a prova.
- **Testes automáticos** no GitHub a cada envio.

A especificação completa e as próximas fases estão em [`SPEC_plataforma_estudos.md`](SPEC_plataforma_estudos.md).
Detalhes técnicos estão em [`CLAUDE.md`](CLAUDE.md).

## Desenvolvimento

```bash
npm install
npm run dev        # app local, dados só no navegador
npm test           # testes unitários
npm run build      # gera dist/organizador-de-concursos.html (página publicada no claude.ai)
npm run test:e2e   # testes de ponta a ponta (depois do build)
```
