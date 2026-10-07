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

## Próximas etapas da hospedagem própria (Fase 9)
O app instalável (GitHub Pages, offline, banco no aparelho) já existe. Falta:
- Sincronizar entre aparelhos (Supabase: login, banco e tempo real), com fila de gravações feitas sem
  internet; hoje os dados de cada aparelho só viajam por backup.
- IA fora do claude.ai: uma função no servidor (ex.: Supabase Edge Function) com a chave da API da
  Anthropic como segredo, nunca no código (`.env`).
- PDFs da biblioteca e dos editais no Storage do Supabase.
- Notificações do Pomodoro, das revisões e do radar com o app fechado (push precisa de servidor).
- Vários usuários por convite, cada um com seus dados; editais compartilhados.
- A troca é localizada: `src/dados/store.ts` isola o banco atrás da interface `Store`.

## IA
- Guardar as questões geradas na prática com IA para refazer depois (hoje só o resultado vai para o histórico).
