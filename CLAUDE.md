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
  dados/
    store.ts       interface Store; ArtifactStore (claude.use("db")) e MemoriaStore (localStorage)
    repositorio.ts espelho do banco via assinaturas + todas as gravações
  estado.tsx     contexto React: dados, concurso ativo, navegação, avisos
  telas/         Home, Concursos, Disciplinas, Edital, ImportarEdital, Planejamento, Disponibilidade,
                 Revisoes, Historico, Balanco, Biblioteca, Cronometro, Configuracoes
  componentes/   ui.tsx (botões, modal <dialog>, campos), campos/modais de sessão, botão flutuante,
                 Pomodoro, Materiais (biblioteca), PraticaIA
  plataforma.ts  recursos do claude.ai (IA, arquivos, downloads), wake lock, bipes, localStorage
  pdf.ts         texto de PDFs com pdf.js 3.11 (cdnjs, carregado sob demanda; worker na própria página)
scripts/
  montar-artifact.mjs  junta app.js + app.css numa página única (React via cdnjs, reserva no jsDelivr)
  servir-preview.mjs   servidor local do preview com React de node_modules
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
| `radar_filtros/<id>` | FiltroRadar (Fase 6; já vem no seed) |

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
  - replanejar troca só os blocos `planejado` que ainda não começaram; marcados ficam para sempre.
- **Rede do container**: o proxy bloqueia cdnjs e pciconcursos.com.br. A Fase 6 (coletor do PCI) precisa
  liberar `www.pciconcursos.com.br` nas configurações de rede do ambiente.

## Estado das fases

- [x] Fase 1: fundação (modelo, CRUD manual, cronômetro persistido, painel, backup JSON)
- [x] Melhorias: revisões adaptativas, biblioteca, prática com IA, balanço semanal, CI no GitHub
  (offline/PWA e editais compartilhados dependem da hospedagem própria; ver IDEIAS.md)
- [x] Fase 2: editais com IA (PDF ou texto, revisão editável, tópicos equivalentes entre editais)
- [x] Fase 3: disponibilidade (grade + exceções), Planejamento dia/semana/mês, planejador, blocos na Home
- [ ] Fase 4: adaptação e revisões
- [ ] Fase 5: desempenho
- [ ] Fase 6: radar
- [ ] Fase 7: provas anteriores
- [ ] Fase 8: polimento
