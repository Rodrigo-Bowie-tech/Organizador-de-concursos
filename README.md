# Organizador de Concursos

App pessoal de estudos para concursos, inspirado no Estudei: edital verticalizado, cronômetro de horas
líquidas, planejamento que se adapta à sua rotina, desempenho em questões e radar de concursos abertos.
Funciona dentro do **claude.ai**, com o seu login do Claude, no notebook, no desktop e no celular. Os
dados ficam no banco do próprio app, na nuvem.

**Abrir o app:** https://claude.ai/artifact/WaU6p8RVuBizYJRdFQ44LC

No celular, abra o link no navegador e use "Adicionar à tela inicial" para ter um ícone como o de um app.

## O que o app faz

**Base (Fase 1)**
- **Concursos**, **disciplinas** (peso, número de questões, cor) e **edital** em árvore de tópicos, com
  status, autoavaliação, incidência, horas e acerto por tópico. Dá para colar uma lista de tópicos.
- **Cronômetro** de horas líquidas: pausar, retomar, trocar de tópico, Pomodoro opcional. Recarregar,
  fechar ou trocar de aparelho não perde a sessão. No desktop, a barra de espaço pausa e retoma.
- **Histórico** com registro manual e edição; **Home** com metas do dia/semana/mês, provas, cobertura do
  edital e sequência de dias.

**Editais com IA (Fase 2)**: importe o PDF (ou o texto) do edital; a IA separa disciplinas, tópicos e
subtópicos e você revisa antes de salvar. Tópicos iguais em editais diferentes podem ser vinculados.

**Planejamento (Fases 3 e 4)**: você diz os horários livres de cada dia (e as exceções) e o app monta os
blocos de estudo das próximas 4 semanas, por prioridade (peso, incidência, domínio e proximidade da
prova), com revisões espaçadas. Ele se ajusta sozinho: replaneja quando você estuda, quando pula um bloco
e uma vez por dia; se você estuda menos do que declarou, usa a sua média real; se o edital não fecha até
a prova, sugere o que cortar.

**Desempenho (Fase 5)**: lançamento rápido de questões, importação de CSV, caderno de erros com revisão
em D+3 e D+14, simulados com nota de corte e estatísticas (acerto por disciplina, heatmap do ano,
planejado × realizado, melhor horário).

**Radar (Fase 6)**: concursos abertos que batem com os seus filtros (área, UF, banca, salário), com
alerta na Home e o botão "Transformar em concurso", que já abre a importação do edital. Chegam pela
rotina diária do PCI Concursos (ver `CLAUDE.md`), colando a página do PCI ou cadastrando à mão.

**Provas anteriores (Fase 7)**: importe provas da banca; a IA separa as questões pelos tópicos do seu
edital. O app conta quantas vezes cada assunto caiu naquela banca e usa isso na prioridade do
planejamento. Dá para refazer a prova e mandar as erradas para o caderno de erros.

**Polimento (Fase 8)**: planilhas CSV de sessões e questões, lembrete de backup, contraste de cores
revisado (WCAG AA nos temas claro e escuro, verificado por teste automático) e atalho de teclado no
cronômetro.

**Outras melhorias**: revisões adaptativas (D+1, D+7, D+30, D+90 ajustadas pela sua avaliação),
biblioteca de materiais por tópico, prática com IA no estilo da banca e balanço semanal.

As funções com IA usam o seu plano do Claude. A especificação completa está em
[`SPEC_plataforma_estudos.md`](SPEC_plataforma_estudos.md) e os detalhes técnicos em [`CLAUDE.md`](CLAUDE.md).

## Desenvolvimento

```bash
npm install
npm run dev        # app local, dados só no navegador
npm test           # testes unitários
npm run build      # gera dist/organizador-de-concursos.html (página publicada no claude.ai)
npm run test:e2e   # testes de ponta a ponta, incluindo acessibilidade (depois do build)
```
