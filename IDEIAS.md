# Ideias para depois

Coisas que ficaram de fora para manter as fases simples. Não são compromisso.

## Cronômetro
- Pedir o motivo da pausa (o modelo já tem `Pausa.motivo`, falta a interface).
- Mostrar a lista de pausas da sessão em andamento, com horários.

## Edital
- Arrastar e soltar para reordenar tópicos (hoje são as setas ↑ ↓).
- Mover um tópico para outro pai ou outra disciplina.
- Filtro "só não iniciados" e busca por texto no edital.

## Painel e histórico
- Escolher se a semana começa no domingo ou na segunda.

## Banco
- Arquivar semanas antigas num documento por ano, se o limite de 5.000 documentos começar a pesar.

## Radar e provas
- Mais fontes públicas no radar (a interface `FonteConcursos` já separa o parser de cada site).
- Guardar o PDF da prova anterior junto do gabarito oficial, quando a banca publica em arquivos separados.

## Dependem da hospedagem própria (Supabase + Vercel)
Os itens da Fase 8 da SPEC que o claude.ai não permite:
- PWA: instalar como app e cronômetro offline no celular, com fila de sincronização (o claude.ai não
  permite service worker).
- Notificações do Pomodoro, das revisões e do radar com o app fechado.
- Deploy fora do claude.ai (Vercel + Postgres/Supabase), com login próprio e vários usuários por
  convite, cada um com seus dados; editais compartilhados entre usuários.
- A troca é localizada: `src/dados/store.ts` já isola o banco atrás da interface `Store`; a IA passaria a
  usar a API da Anthropic por uma função no servidor (chave só no `.env`).

## IA
- Guardar as questões geradas na prática com IA para refazer depois (hoje só o resultado vai para o histórico).
