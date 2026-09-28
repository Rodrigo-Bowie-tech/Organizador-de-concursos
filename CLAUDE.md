# CLAUDE.md

App pessoal de estudos para concursos (usuário único). A especificação completa está em
`SPEC_plataforma_estudos.md`; as referências visuais (Estudei) estão em `docs/referencias/`.

- Interface em português do Brasil, datas `dd/mm/aaaa`, fuso America/Sao_Paulo.
- Trabalhar em fases (seção 9 da SPEC). Antes de codar uma fase, apresentar o plano e esperar aprovação.
  Ao fim, rodar os testes, fazer commit e resumir o que ficou pronto e como testar.
- Na dúvida entre simples e elaborado, escolher o simples e anotar a ideia em `IDEIAS.md`.

## Onde o app roda

O app é um **Artifact privado do claude.ai**, aberto com o login do Claude no notebook, no desktop e no celular.

- Link: https://claude.ai/artifact/WaU6p8RVuBizYJRdFQ44LC
- Capacidades declaradas: `db` (banco de documentos), `downloads` (exportar backup), `sample` (IA do
  Claude, paga pelo plano de quem usa: prática com IA e, na Fase 2, editais) e `assets` (PDFs da biblioteca).
  Ao republicar, **omitir `capabilities`** mantém as atuais; um objeto novo substitui o conjunto inteiro:
  `{"db": {}, "downloads": true, "sample": {}, "assets": {}}`.
- Já foi confirmado em produção (27/09/2026): a página carrega o React do CDN e grava no banco.
- Para atualizar de outra conversa: `npm run build` e publicar `dist/organizador-de-concursos.html`
  com a ferramenta Artifact passando `url` = o link acima (senão cria outro artifact).

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências |
| `npm run dev` | Vite em modo desenvolvimento (banco local no navegador) |
| `npm test` | testes unitários (Vitest) |
| `npm run typecheck` | checagem de tipos (TypeScript) |
| `npm run build` | tipos + build + monta `dist/organizador-de-concursos.html` (página publicada) e `dist/preview.html` |
| `npm run preview` | serve `dist/preview.html` em http://localhost:4173 |
| `npm run radar:coletar` | coleta o PCI para `.cache/radar/oportunidades.json` (precisa da rede liberada) |
| `npm run radar:mesclar` | junta a coleta com o banco baixado e gera `.cache/radar/escritas/lote.json` |
| `npm run test:e2e` | Playwright (celular e desktop) sobre o build; rode `npm run build` antes. No container remoto: `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e` |

O GitHub Actions (`.github/workflows/testes.yml`) roda tipos, unitários, build e Playwright a cada push.

Não há `migrate`: o banco é de documentos JSON, sem esquema. O seed é aplicado pela ferramenta
ArtifactData (ver "Seed").

## Arquitetura

```
src/
  dominio/       lógica pura, sem React e sem banco (é o que os testes unitários cobrem)
    tipos.ts       modelo de dados completo (Fase 1 e tipos das fases seguintes)
    datas.ts       fuso de SP com Intl, formatação dd/mm/aaaa, semanas começando no domingo
    cronometro.ts  tempo líquido, tempo por dia (corta na meia-noite de SP), Pomodoro
    painel.ts      totais por período, sequência de dias, cobertura, contagem regressiva
    lote.ts        cadastro de tópicos em lote (numeração 1.1.1 ou recuo)
    topicos.ts     árvore de tópicos (achatar, descendentes, mover, caminho)
    revisoes.ts    repetição espaçada adaptativa (escada D+1/7/30/90 + facilidade estilo SM-2)
    pratica.ts     pedido de questões no estilo da banca e validação da resposta da IA
    balanco.ts     tempo × peso, disciplinas esquecidas, tópicos parados, projeção de cobertura
    edital.ts      importação: achar o conteúdo programático, dividir para a IA, validar/juntar, equivalências
    planejador.ts  núcleo (5.1/5.2/5.4): slots da disponibilidade, domínio, fila por prioridade, gerarPlano
    adaptacao.ts   capacidade real (média de 14 dias por dia da semana) e viabilidade do edital com cortes
    desempenho.ts  questões (sessões + avulsas), CSV, caderno de erros (D+3/D+14), simulados, séries das estatísticas
    provas.ts      provas anteriores: dividir para a IA, pedido/validação, gabarito colado, incidência por tópico e banca
  radar/         radar de concursos, sem React (roda também no Node pelo coletor)
    radar.ts       interface FonteConcursos, filtros (área por radical), id estável, junção com o banco
    pci.ts         parser das listagens do PCI Concursos (testado sobre HTML salvo) e leitor de robots.txt
    texto.ts       pedido à IA para extrair oportunidades de um texto colado + validação
  dados/
    store.ts       interface Store; ArtifactStore (claude.use("db")) e MemoriaStore (localStorage)
    repositorio.ts espelho do banco via assinaturas + todas as gravações
  estado.tsx     contexto React: dados, concurso ativo, navegação, avisos
  telas/         Home, Concursos, Disciplinas, Edital, ImportarEdital, Planejamento, Disponibilidade,
                 Revisoes, Questoes, CadernoErros, Simulados, Historico, Estatisticas, Balanco, Biblioteca,
                 Provas, ImportarProva, Radar, Cronometro, Configuracoes
  componentes/   ui.tsx (botões, modal <dialog>, campos), campos/modais de sessão, botão flutuante,
                 Pomodoro, Materiais (biblioteca), PraticaIA, Alternativas (questão respondida com um clique),
                 QuestoesProva (revisão de assunto/gabarito/anulada das questões de uma prova)
  plataforma.ts  recursos do claude.ai (IA, arquivos, downloads), wake lock, bipes, localStorage
  pdf.ts         texto de PDFs com pdf.js 3.11 (cdnjs, carregado sob demanda; worker na própria página)
scripts/
  montar-artifact.mjs  junta app.js + app.css numa página única (React via cdnjs, reserva no jsDelivr)
  servir-preview.mjs   servidor local do preview com React de node_modules
  radar/coletar.ts     coletor do PCI (Node 22, robots.txt, User-Agent, 1 req/4 s, cache do dia em .cache/radar)
  radar/mesclar.ts     junta a coleta com o banco e gera o lote de escritas para o ArtifactData
```

- **Build**: Vite 8 (Rolldown) em modo biblioteca IIFE. React 18.3.1 **fica fora do bundle** e vem do
  cdnjs como UMD (`React`/`ReactDOM` globais), como pedem as regras dos Artifacts. Por isso o JSX usa o
  runtime clássico (`oxc.jsx` + `jsxInject` no `vite.config.ts`): nunca importar `React` por padrão
  nos arquivos, só hooks nomeados. React 19 não tem UMD; não atualizar sem trocar essa estratégia.
- **Página do Artifact**: sem `<!doctype>/<html>/<head>/<body>`; o claude.ai envolve a página nesse esqueleto.
  O `<title>` precisa estar nos primeiros 8 KB (fica no topo).
- **Tema**: tokens CSS em `src/estilos.css`. O claude.ai marca `data-theme` no `:root`; a escolha feita no
  app (Configurações > Tema) usa `data-tema` e vence.
- **Sem `alert/confirm/prompt`** (o claude.ai bloqueia): confirmações são modais (`Confirmar`).
- **Downloads**: dentro do claude.ai só pelo recurso `downloads` (`plataforma.ts#salvarArquivo`).
- **Recursos do claude.ai** (`ia`, `arquivos`) são resolvidos em `main.tsx` e ficam em `useApp().recursos`;
  `null` fora do claude.ai. Telas escondem o que depende deles (ex.: `BotaoPraticar`).
- **IA (`sample`)**: chamar só em clique, nunca em laço; `cache: false` para gerar questões novas; erros
  viram mensagem por `mensagemErroIA`. O e2e simula `window.claude` só com `sample` (ver `melhorias.spec.ts`).
- **Gráficos**: tokens `--grafico-tempo`/`--grafico-peso` validados com o script do skill dataviz nos dois
  temas (contraste, daltonismo). Barras ≤ 24 px, ponta arredondada, legenda sempre presente.

## Banco de dados (Artifact `db`)

Limites: **5.000 documentos** no total e 256 KiB por documento. Por isso os registros são agrupados:

| Caminho | Conteúdo |
|---|---|
| `concursos/<id>` | Concurso |
| `disciplinas/<id>` | Disciplina **com os tópicos dentro** (`topicos: { <id>: Topico }`) |
| `sessoes/<AAAA-MM-DD>` | `{ semana, itens: { <id>: Sessao } }`, semana de domingo a sábado (dia de SP do início) |
| `estado/cronometro` | `{ sessao: Sessao \| null }`, a sessão em andamento (rodando ou pausada) |
| `config/geral` | Configuracao (metas, Pomodoro, tema). Ausente = `CONFIG_PADRAO` |
| `revisoes/<AAAA-MM-DD>` | `{ semana, itens: { <id>: RegistroRevisao } }`, histórico de revisões feitas |
| `biblioteca/<disciplinaId>` | `{ disciplinaId, itens: { <id>: Material } }`; PDFs no `assets`, id em `arquivoId` |
| `editais/<id>` | Edital importado (cargo, trecho usado, PDF em `arquivoId`) |
| `estado/vinculos` | `{ ignorados: string[] }` sugestões de tópicos equivalentes recusadas (`chavePar`) |
| `disponibilidade/geral` | Disponibilidade: `dias` ("0"–"6" → janelas), `excecoes` (dia → janelas + motivo), `blocoMin` |
| `plano/<AAAA-MM-DD>` | `{ semana, itens: { <id>: BlocoPlanejado } }`, blocos do calendário por semana |
| `estado/planejamento` | `{ ultimoReplanejamento }`: dia do último replanejamento (o "de madrugada") |
| `questoes/<AAAA-MM-DD>` | `{ semana, itens: { <id>: RegistroQuestoes } }`, questões avulsas (lançamento rápido, CSV) |
| `erros/<disciplinaId>` | `{ disciplinaId, itens: { <id>: ErroCaderno } }`, caderno de erros |
| `simulados/<id>` | Simulado (notas por disciplina, total e máximo) |
| `oportunidades/<UF>` | `{ uf, itens: { <id>: Oportunidade } }`, radar ("BR" = nacional); id = hash do link |
| `radar_filtros/<id>` | FiltroRadar (áreas, UFs, bancas, salário mínimo; o `padrao` vem do seed) |
| `estado/radar` | `{ vistoAte }`: oportunidades coletadas depois disso são "novas" (alerta na Home) |
| `provas/<id>` | ProvaAnterior com as questões dentro (`questoes: { <id>: QuestaoProva }`); PDF em `arquivoId` |

- O estado da revisão de cada tópico fica no próprio tópico (`topico.revisao`), junto com `concluidoEm`.
  `atualizarTopico` agenda D+1 ao concluir e limpa ao voltar para "em estudo".

- Pausas ficam dentro da sessão. Questões feitas/acertos do fechamento ficam na própria sessão; registros
  avulsos de questões (Fase 5) terão documento próprio agrupado.
- `mesclar` (update) mescla objetos recursivamente e substitui arrays; exige documento existente.
  Remover uma chave de mapa = regravar o documento inteiro (`definir`).
- Uma gravação por vez por documento (fila em `ArtifactStore`), com uma nova tentativa em `unavailable`.
- Finalizar sessão: grava primeiro na semana e depois limpa `estado/cronometro`. Se a segunda gravação
  falhar, `reconciliarAtiva` limpa ao carregar, sem duplicar.
- Tempo líquido é sempre calculado de `inicio`, `fim` e `pausas`; `segundosLiquidos` gravado é só conveniência.
- Semana começa no **domingo** (igual ao calendário do Estudei).
- Fora do claude.ai (dev, testes) ou se `claude.use("db")` falhar, o app usa `MemoriaStore` com
  localStorage e mostra um aviso amarelo.

## Seed

`seed/seed.json` tem os dados iniciais da seção 6 (4 concursos de engenharia elétrica e o filtro do
radar SP/RJ). Já foi aplicado no banco do Artifact em 27/09/2026. Para reaplicar num banco vazio, use a
ferramenta ArtifactData com `action: "batch"` e uma escrita `set` por documento. O app nunca grava
seed sozinho.

## Decisões

- **App dentro do claude.ai** (Artifact) em vez de Vercel + Neon, a pedido do usuário: login do Claude,
  banco na nuvem do próprio Artifact, IA pelo plano do Claude.
  Custos aceitos: sem PWA/notificação com o app fechado; coletor do PCI (Fase 6) será uma rotina
  agendada do Claude Code gravando no banco; "replanejar de madrugada" vira "na primeira abertura do dia".
- Disciplina ligada ao concurso (`editalId` opcional) para permitir cadastro manual.
- Sessão pode ficar sem tópico (disciplina inteira) ou sem disciplina.
- Editar horário/duração de uma sessão gravada a transforma num trecho contínuo (pausas descartadas).
- Cobertura do edital = tópicos-folha com status teoria concluída, revisado ou dominado.
- Sequência de dias: dia conta com ≥ 1 min líquido; se hoje ainda não teve estudo, vale a sequência de ontem.
- Concurso ativo (seletor no topo) é preferência do navegador (localStorage), não vai para o banco.
- **Revisões adaptativas** (aprovadas como melhoria): com "bom" segue a escada da SPEC (D+1, D+7, D+30,
  D+90); "fácil" ×1,5 e aumenta a facilidade; "difícil" metade do intervalo e repete o degrau; "errei"
  volta para D+1 e recomeça. Facilidade entre 1,3 e 3,0. Revisar com "bom"/"fácil" muda o status para
  "revisado".
- **Prática com IA**: o resultado soma na sessão do cronômetro em andamento ou vira uma sessão de
  questões (`origem: 'pratica_ia'`) com o tempo da prática.
- **Projeção de cobertura**: ritmo = tópicos-folha concluídos nas últimas 4 semanas; data de conclusão
  vem de `concluidoEm` ou da sessão com "concluí a teoria".
- **Importação de edital** (Fase 2): pdf.js extrai o texto no navegador; o trecho do conteúdo
  programático é o mais longo entre "conteúdo programático" e o próximo "ANEXO"; a IA recebe partes de
  até 48 KB (uma chamada cada) e devolve disciplinas → tópicos → subtópicos (até 3 níveis). A tela de
  revisão é obrigatória; disciplinas com o mesmo nome de uma existente vão para ela por padrão.
- **Tópicos equivalentes**: sugestão por Jaccard das palavras-chave dos títulos (≥ 0,6) entre concursos
  diferentes. Vinculados compartilham `grupoEquivalenciaId`; status, conclusão e revisões se propagam no
  repositório (`aplicarEmTopicos`), e o Edital soma horas e questões do grupo.
- **Planejador** (Fase 3, `dominio/planejador.ts`, testes da seção 5.5 em `planejador.test.ts`):
  - janelas divididas em blocos de `blocoMin` (sobra ≥ 25 min vira bloco menor; menor que isso estica o último);
  - domínio = teoria (até 0,5) + autoavaliação (0,25) + acerto recente com meia-vida de 30 dias (0,25, a
    partir de 5 questões); prioridade = peso×questões normalizado × incidência (1 a 2) × (1 − domínio) ×
    urgência (cresce nos 120 dias antes da prova) × prioridade do concurso;
  - teoria estimada em 2 blocos por tópico não iniciado e 1 em estudo; ao fim, o plano já agenda D+1 e D+7;
  - revisão atrasada entra no primeiro bloco livre; revisão/questões ocupam 20% dos blocos, subindo até
    60% nas últimas 3 semanas; no máximo 2 blocos seguidos da mesma disciplina quando há outra;
  - tópicos vinculados entram uma vez só (prioridades somadas); horizonte de 28 dias, até a última prova;
  - replanejar troca só os blocos `planejado` que ainda não começaram e não foram movidos (`fixo`);
    marcados ficam para sempre.
- **Adaptação** (Fase 4, `dominio/adaptacao.ts`): replaneja ao finalizar/registrar sessão, ao marcar bloco e
  na primeira abertura do dia (`replanejarDoDia` em `main.tsx`). Capacidade real = média dos últimos 14 dias
  por dia da semana; com ≥ 14 dias de uso e real < 80% do declarado, o plano usa a média (mínimo 1 bloco) e
  avisa. Viabilidade: blocos de teoria necessários × os que cabem até a prova (descontada a cota de
  revisão); se não fecha, sugere cortar os de menor prioridade (`topico.cortado`, reversível no Edital).
- **Desempenho** (Fase 5): acerto = sessões + questões avulsas (`todasAsQuestoes`), usado no Edital, nas
  estatísticas e no domínio do planejador. CSV genérico (tópico, feitas, acertos, data, fonte; `;`, `,` ou tab)
  com o tópico achado por título/Jaccard e revisão antes de importar. Caderno de erros: D+3 e D+14 a partir
  da anotação; errar de novo recomeça em D+3; "Explicar com IA" guarda o texto no erro; da prática com IA dá
  para mandar as erradas para o caderno. Simulados: nota de corte do concurso na mesma escala da nota total.
- **Radar** (Fase 6): o app não acessa sites de fora (CSP do Artifact); as oportunidades chegam por três
  caminhos: a rotina diária (abaixo), "Colar página" (texto copiado do PCI ou de uma notícia → IA separa
  os concursos, com revisão antes de salvar) e cadastro manual. Filtro por área compara radicais de 6
  letras ("Engenharia Elétrica" acha "Engenheiro Eletricista"); UF "BR" passa em qualquer filtro de UF.
  Já conhecida (mesmo id) mantém a data em que apareceu e o "ignorada"; encerradas há mais de 30 dias
  saem do banco (`mesclarOportunidades`, a mesma regra no app e na rotina). Abrir a tela Radar marca tudo
  como visto. "Transformar em concurso" cria o concurso com status edital aberto, torna-o o ativo e abre
  Importar edital. QConcursos e sites com login: nunca raspar.
- **Provas anteriores** (Fase 7): o texto (PDF via pdf.js ou colado) vai para a IA em partes de até
  24 KB cortadas antes de uma linha que abre questão; o pedido leva o edital como códigos curtos (D1 =
  disciplina, T1 = tópico-folha com o caminho) e a resposta volta com o código, validado contra a lista.
  Gabarito colado ("1-A 2-C", X/* = anulada, ou a tabela oficial) é lido sem IA. Revisão obrigatória
  antes de salvar (assunto, gabarito, anulada). Incidência = questões não anuladas por tópico nas provas
  da **mesma banca** do concurso (sem banca: as importadas para ele); tópico vinculado de outro concurso
  conta pelo grupo. Ela é calculada na hora (`comIncidenciaDasProvas`) e entra no planejador e na
  viabilidade só onde `topico.incidencia` está vazio: o valor digitado no Edital vence. Refazer a prova
  grava um RegistroQuestoes por tópico (fonte = título da prova) e as erradas podem ir para o caderno.
  Prova com mais de ~240 KB de questões: importar em duas partes.
- **Rede do container**: o proxy bloqueia cdnjs e pciconcursos.com.br. A rotina do radar só funciona
  depois de liberar `www.pciconcursos.com.br` nas configurações de rede do ambiente.

## Radar: rotina diária

Uma rotina agendada do Claude Code (1 vez por dia, sessão nova a cada disparo, neste repositório):

1. `npm install` (se preciso) e `npm run radar:coletar`. Se sair com erro (rede bloqueada, HTTP 403), parar e avisar.
2. ArtifactData `list` da coleção `oportunidades` do app, com `out_dir` = `.cache/radar/banco`.
3. `npm run radar:mesclar`.
4. ArtifactData `batch` com `writes` = o conteúdo de `.cache/radar/escritas/lote.json` (até 50 por lote;
   cada `set` aponta `file_path` para o JSON da UF).
5. Responder com o resumo impresso pelo passo 3 (quantas novas).

Para testar o parser com a página real: `npm run radar:amostra` (troca o fixture; confira com `npm test`).

## Estado das fases

- [x] Fase 1: fundação (modelo, CRUD manual, cronômetro persistido, painel, backup JSON)
- [x] Melhorias: revisões adaptativas, biblioteca, prática com IA, balanço semanal, CI no GitHub
  (offline/PWA e editais compartilhados dependem da hospedagem própria; ver IDEIAS.md)
- [x] Fase 2: editais com IA (PDF ou texto, revisão editável, tópicos equivalentes entre editais)
- [x] Fase 3: disponibilidade (grade + exceções), Planejamento dia/semana/mês, planejador, blocos na Home
- [x] Fase 4: replanejamento automático, capacidade real, edital que não fecha com cortes, blocos fixos
- [x] Fase 5: questões avulsas e CSV, caderno de erros, simulados, estatísticas
- [x] Fase 6: radar (parser do PCI + rotina diária, colar página com IA, filtros, alerta, transformar em concurso)
- [x] Fase 7: provas anteriores (PDF/texto → questões por tópico com IA, gabarito, incidência no planejador, refazer)
- [ ] Fase 8: polimento
