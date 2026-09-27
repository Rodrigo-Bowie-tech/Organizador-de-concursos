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
- Capacidades declaradas: `db` (banco de documentos do Artifact) e `downloads` (exportar backup).
  As próximas fases vão acrescentar `sample` (IA dos editais, Fase 2) e `assets` (PDFs).
  Ao republicar, **omitir `capabilities`** mantém as atuais; um objeto novo substitui o conjunto inteiro.
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
    topicos.ts     árvore de tópicos (achatar, descendentes, mover)
  dados/
    store.ts       interface Store; ArtifactStore (claude.use("db")) e MemoriaStore (localStorage)
    repositorio.ts espelho do banco via assinaturas + todas as gravações
  estado.tsx     contexto React: dados, concurso ativo, navegação, avisos
  telas/         Home, Concursos, Disciplinas, Edital, Cronometro, Historico, Configuracoes
  componentes/   ui.tsx (botões, modal <dialog>, campos), campos/modais de sessão, botão flutuante, Pomodoro
  plataforma.ts  downloads do claude.ai, wake lock, bipes, localStorage
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

## Banco de dados (Artifact `db`)

Limites: **5.000 documentos** no total e 256 KiB por documento. Por isso os registros são agrupados:

| Caminho | Conteúdo |
|---|---|
| `concursos/<id>` | Concurso |
| `disciplinas/<id>` | Disciplina **com os tópicos dentro** (`topicos: { <id>: Topico }`) |
| `sessoes/<AAAA-MM-DD>` | `{ semana, itens: { <id>: Sessao } }`, semana de domingo a sábado (dia de SP do início) |
| `estado/cronometro` | `{ sessao: Sessao \| null }`, a sessão em andamento (rodando ou pausada) |
| `config/geral` | Configuracao (metas, Pomodoro, tema). Ausente = `CONFIG_PADRAO` |
| `radar_filtros/<id>` | FiltroRadar (Fase 6; já vem no seed) |

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

## Estado das fases

- [x] Fase 1: fundação (modelo, CRUD manual, cronômetro persistido, painel, backup JSON)
- [ ] Fase 2: editais com IA (`sample` + `assets`)
- [ ] Fase 3: calendário e planejador
- [ ] Fase 4: adaptação e revisões
- [ ] Fase 5: desempenho
- [ ] Fase 6: radar
- [ ] Fase 7: provas anteriores
- [ ] Fase 8: polimento
