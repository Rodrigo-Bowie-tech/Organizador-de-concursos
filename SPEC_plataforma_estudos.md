# Plataforma de Estudos para Concursos: Especificação para o Claude Code

> Como usar: coloque este arquivo na raiz de um repositório vazio e diga ao Claude Code: "Leia SPEC_plataforma_estudos.md, proponha o plano da Fase 1 e só comece a codar depois que eu aprovar."

## 0. Instruções para você, Claude Code

- Trabalhe em fases (seção 9). Ao fim de cada fase, rode os testes, faça commit e me mostre um resumo do que ficou pronto e como testar.
- Antes de codar cada fase, apresente o plano (arquivos, modelos, telas) e espere minha aprovação.
- Crie um `CLAUDE.md` com a arquitetura, os comandos (dev, test, migrate, seed) e as decisões tomadas. Mantenha-o atualizado.
- Interface toda em português do Brasil. Datas no formato dd/mm/aaaa. Fuso horário America/Sao_Paulo.
- O algoritmo de planejamento (seção 5) é o coração do app e precisa de testes unitários com cenários reais.
- Na dúvida entre algo simples que funciona e algo elaborado, escolha o simples e anote a ideia em `IDEIAS.md`.

## 1. Visão geral

App pessoal de estudos para concursos, inspirado no Estudei. Com ele eu quero:

1. Cadastrar concursos e importar editais (PDF), separando o conteúdo programático em disciplinas, tópicos e subtópicos (o "edital verticalizado").
2. Cronometrar horas líquidas de estudo, descontando as pausas.
3. Ter um calendário adaptativo que redistribui o conteúdo conforme o que eu realmente estudo e marco, em vez de um plano fixo.
4. Ter um calendário diário com os blocos de horário que eu separar para estudar.
5. Acompanhar um radar de concursos, com dados de concursos abertos e previstos (PCI Concursos etc.).
6. Controlar questões, revisões e desempenho por tópico, para priorizar o que dá pontos.

Usuário único (eu). Tem que funcionar bem no celular, porque o cronômetro vai rodar no celular durante o estudo.

## 2. Stack

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui; gráficos com Recharts; calendário com FullCalendar (visões de dia, semana e mês)
- Prisma + SQLite no desenvolvimento, pronto para migrar para Postgres (ex.: Supabase/Neon) no deploy
- PWA (instalável no celular, com o cronômetro funcionando em segundo plano)
- API da Anthropic (SDK oficial, chave em `.env`) para ler editais e provas em PDF
- Vitest para testes unitários e Playwright para os fluxos principais
- Autenticação simples (senha única via variável de ambiente), para quando o app for para a internet

## 3. Modelo de dados (ponto de partida; ajuste se necessário)

- **Concurso**: nome, órgão, banca, cargo, área, data da prova, status (previsto / edital aberto / inscrito / prova feita), link, nota de corte histórica (opcional), prioridade
- **Edital**: concurso, arquivo PDF, texto extraído, data de publicação
- **Disciplina**: edital, nome, peso, nº de questões na prova, tipo (básica / específica / discursiva)
- **Topico**: disciplina, tópico pai (para subtópicos), título, ordem, status (não iniciado / em estudo / teoria concluída / revisado / dominado), autoavaliação 1–5, incidência (quantas vezes caiu nessa banca, se eu souber)
- **SessaoEstudo**: tópico, tipo (teoria / questões / revisão / lei seca / resumo / simulado), início, fim, segundos líquidos, páginas, anotações
- **Pausa**: sessão, início, fim, motivo opcional
- **RegistroQuestoes**: tópico, data, feitas, acertos, fonte (livre: "QConcursos", "prova FCC 2023"...)
- **ErroCaderno**: tópico, enunciado ou resumo, por que errei (falta de conteúdo / pegadinha / desatenção / interpretação), resposta certa, próxima revisão
- **Revisao**: tópico, data prevista, data feita, origem (sessão de teoria)
- **Disponibilidade**: dia da semana, blocos de horário (início–fim), rótulo opcional
- **ExcecaoDisponibilidade**: data específica com blocos alterados (plantão, viagem, folga)
- **BlocoPlanejado**: data, início, fim, tópico, tipo, status (planejado / feito / parcial / pulado / remanejado)
- **Simulado**: concurso, data, duração, nota por disciplina, nota total, observações
- **Oportunidade** (radar): título, órgão, banca, cargos, salário, vagas, UF, inscrições até, link, fonte, data da coleta

## 4. Módulos e telas

### 4.1 Painel (tela inicial)

- Horas líquidas: hoje / semana / mês, comparadas com a meta
- Blocos do dia (do calendário diário), com botão "começar" que já abre o cronômetro no tópico certo
- Contagem regressiva para cada prova com data definida
- Cobertura do edital (% de tópicos com teoria concluída) e projeção: "no seu ritmo real, você cobre X% do edital até a prova"
- Revisões atrasadas e as de hoje
- Sequência de dias estudados

### 4.2 Concursos e editais

- CRUD de concursos
- Importar edital PDF: extrair o texto (pdf-parse ou similar) → mandar o trecho do conteúdo programático para a API da Anthropic pedindo JSON estruturado (disciplinas → tópicos → subtópicos, com peso e nº de questões quando o edital informar) → mostrar uma tela de revisão editável antes de salvar. Nunca salvar direto sem eu revisar.
- Opção de colar o texto do conteúdo programático em vez de enviar o PDF
- Edital verticalizado: árvore com checkboxes, status por tópico, horas estudadas, % de acerto e data da última revisão
- Detecção de sobreposição entre editais: quando dois concursos têm tópicos equivalentes (ex.: "Máquinas Elétricas" em dois editais), sugerir vinculá-los, para que o estudo de um conte para o outro

### 4.3 Cronômetro de horas líquidas

- Iniciar / pausar / retomar / finalizar. Só conta tempo líquido; as pausas ficam registradas.
- O estado persiste no banco (timestamp de início + pausas), então recarregar a página ou fechar o app não perde a sessão
- Modo Pomodoro opcional (tempos configuráveis)
- Ao finalizar: confirmar tópico e tipo, informar questões feitas e acertos, páginas, anotação rápida e se o tópico foi "concluído"
- Registro manual retroativo (esqueci de ligar o cronômetro)
- Notificação ou alerta sonoro no fim do Pomodoro (PWA)

### 4.4 Disponibilidade e calendário diário

- Configurar a grade semanal de blocos disponíveis (ex.: seg 06:00–07:30 e 20:00–22:30)
- Exceções por data
- Visão diária e semanal: blocos com o tópico planejado, cor por disciplina, arrastar e soltar para remanejar
- Marcar bloco como feito, parcial ou pulado (se houve sessão cronometrada no horário, sugerir automaticamente)

### 4.5 Questões, erros e revisões

- Lançamento rápido de questões (feitas/acertos por tópico)
- Caderno de erros com revisão programada
- Revisões espaçadas geradas automaticamente (seção 5.3)

### 4.6 Estatísticas

- Horas por disciplina × peso da disciplina na prova (mostrar onde estou investindo pouco em algo que vale muito)
- % de acerto por disciplina e por tópico, com evolução no tempo
- Horas planejadas × horas realizadas, por semana
- Heatmap de dias estudados (estilo GitHub)
- Melhor horário do dia (em que faixa eu mais rendo em acertos e horas)

### 4.7 Simulados

- Registrar simulados com notas por disciplina
- Comparar com a nota de corte histórica (quando cadastrada) e mostrar a distância até ela

### 4.8 Radar de concursos

- Coletor do PCI Concursos (páginas públicas de listagem):
  - Respeitar `robots.txt`, User-Agent identificado, no máximo 1 requisição a cada poucos segundos, cache local e execução no máximo 1–2 vezes por dia
  - Extrair órgão, cargos, salário, vagas, UF, prazo de inscrição e link
  - Isolar o parser num módulo próprio com testes em HTML salvo (fixtures), porque o layout pode mudar
- Filtros salvos: área (engenharia elétrica), UF (SP, RJ), banca, salário mínimo
- Alertas no painel quando surgir oportunidade que bate com os filtros
- Botão "transformar em concurso" (cria o concurso e abre o fluxo de importar edital)
- QConcursos e sites com login ou paywall: NÃO fazer scraping. Os termos de uso proíbem e o conteúdo é pago. Em vez disso:
  - campo de fonte livre no registro de questões, para eu lançar o desempenho que tive lá
  - importação de CSV genérico de desempenho (tópico, feitas, acertos)
  - importação de provas anteriores em PDF (publicadas pelas bancas) → a IA separa as questões por tópico do meu edital e calcula a incidência por assunto daquela banca
- Arquitetura de "fontes" plugável (interface `FonteConcursos`), para acrescentar outras fontes públicas depois

## 5. Algoritmo de planejamento adaptativo (núcleo, com testes obrigatórios)

### 5.1 Prioridade de cada tópico

```
prioridade = pesoDisciplina × incidencia × (1 − dominio) × fatorUrgencia
```

- `pesoDisciplina`: peso × nº de questões (normalizado)
- `incidencia`: padrão 1; maior se o tópico cai muito na banca (dado das provas importadas)
- `dominio` (0–1): combina autoavaliação, % de acerto nas últimas questões (com peso maior para as recentes) e se a teoria está concluída
- `fatorUrgencia`: cresce conforme a prova se aproxima e o tópico ainda não foi visto

### 5.2 Geração do plano

- Distribuir os tópicos nos blocos de disponibilidade até a data da prova, em ciclo de estudos (alternar disciplinas; evitar mais de 2 blocos seguidos da mesma)
- Reservar uma fração dos blocos para revisões e questões, que aumenta perto da prova (ex.: 20% no início, 60% nas últimas 3 semanas)
- Com vários concursos, dividir o tempo pela prioridade do concurso e pela proximidade da prova, aproveitando os tópicos vinculados entre editais

### 5.3 Revisões espaçadas

- Teoria concluída gera revisões em D+1, D+7, D+30 e D+90
- Erro no caderno gera revisão em D+3 e D+14
- Revisão atrasada entra com prioridade alta no próximo bloco livre

### 5.4 Ajuste à realidade (o diferencial)

- Replanejar sempre que uma sessão for registrada, um bloco for marcado e toda madrugada (rotina diária)
- Bloco pulado ou parcial: o conteúdo restante volta para a fila e não é empurrado cegamente para o dia seguinte
- Capacidade real: calcular a média móvel de 14 dias de horas líquidas por dia da semana. Se eu rendo bem menos do que a disponibilidade declarada, planejar com a capacidade real e avisar: "você planeja 4h às terças mas estuda 2h10 em média; ajustei o plano".
- Se no ritmo real o edital não fecha até a prova, mostrar o alerta e sugerir cortar os tópicos de menor prioridade (peso baixo, incidência baixa), com a lista para eu aprovar
- Nunca apagar o histórico: planejado e realizado ficam registrados para as estatísticas

### 5.5 Testes do planejador (mínimo)

- Plano gerado respeita os blocos de disponibilidade e as exceções
- Tópico de peso alto e domínio baixo vem antes do de peso baixo e domínio alto
- Pular 3 dias seguidos replaneja sem perder tópicos
- Capacidade real menor que a declarada reduz a carga planejada
- Revisões são geradas nos intervalos corretos
- Dois concursos com tópico vinculado não duplicam o estudo

## 6. Dados iniciais (seed)

Pré-cadastrar como concursos de exemplo, sem edital importado, para eu completar:

- Fundação Florestal SP: Edital 01/2026, banca FCC, engenharia elétrica
- Petrobras, Transpetro e tribunais: engenharia elétrica (banca e data a confirmar)

Pré-configurar o filtro do radar: engenharia elétrica, SP e RJ.

## 7. Requisitos não funcionais

- Responsivo, com prioridade para o celular nas telas de cronômetro, painel e dia
- Modo escuro
- Exportar e importar backup completo em JSON
- Chaves e senhas só em `.env` (fornecer `.env.example`)
- Chamadas à IA com tratamento de erro e retry; mostrar o custo aproximado antes de processar PDFs grandes

## 8. Fora do escopo (por enquanto)

- Multiusuário, pagamentos, app nativo de loja
- Scraping de sites com login ou paywall

## 9. Fases de entrega

1. **Fundação**: setup, modelo de dados, CRUD de concursos/disciplinas/tópicos (manual), cronômetro de horas líquidas com persistência, painel básico
2. **Editais com IA**: importação de PDF/texto, tela de revisão, edital verticalizado
3. **Calendário**: disponibilidade, exceções, calendário diário e semanal, planejador (5.1 e 5.2) com testes
4. **Adaptação e revisões**: 5.3 e 5.4, rotina diária de replanejamento, alertas de capacidade e cobertura
5. **Desempenho**: questões, caderno de erros, simulados, estatísticas
6. **Radar**: coletor do PCI, filtros, alertas, "transformar em concurso"
7. **Provas anteriores**: importação de provas em PDF, incidência por assunto e banca alimentando a prioridade
8. **Polimento**: PWA, notificações, backup, deploy (Vercel + Postgres)

## 10. Requisitos adicionais

1. Deve ser web para notebook e desktop, como também para celular.
2. Deve ter banco de dados na nuvem.
