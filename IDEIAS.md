# Ideias para depois

Coisas que ficaram de fora para manter as fases simples. Não são compromisso.

## Cronômetro
- Pedir o motivo da pausa (o modelo já tem `Pausa.motivo`, falta a interface).
- Mostrar a lista de pausas da sessão em andamento, com horários.

## Edital
- Arrastar e soltar para reordenar tópicos (hoje são as setas ↑ ↓).
- Mover um tópico para outro pai ou outra disciplina.
- Filtro "só não iniciados" e busca por texto no edital.

## Planejamento
- Ajuste do assunto para baixo: quando os tópicos andam bem mais rápido que o previsto, sugerir
  diminuir a estimativa dos que faltam (hoje só sugere aumentar).
- Gestão semanal: guardar data de fim das inscrições e do boleto no concurso, para a lista avisar o prazo.
- Capacidade real: não ajustar enquanto a janela de 14 dias tiver dias de antes da disponibilidade atual
  (em 11/10 o plano de Embu encolheu para 1 bloco por dia e levou a 14 cortes logo depois de criado).
  Também perguntar antes de cortar, mostrando quantas horas a mais por semana fechariam o edital.
- Simulados dentro do app: fazer a prova cronometrada e lançar o resultado por assunto direto na tela
  Simulados (hoje é uma página separada no claude.ai e o resultado volta pela conversa).
- Diagnóstico: escolher os pesos das três notas (hoje 1/3 cada) e uma meta de domínio por assunto para o
  1º lugar; dar mais peso aos acertos recentes, como o planejador já faz no domínio do tópico.
- Cadernos: importar um caderno novo pela tela (PDF de questões + PDF de gabaritos), sem passar pela conversa;
  folha de respostas rápida (todas as letras de uma parte numa tela só) para quem resolve no papel.

## Painel e histórico
- Escolher se a semana começa no domingo ou na segunda.

## Banco
- Arquivar semanas antigas num documento por ano, se o limite de 5.000 documentos começar a pesar.

## Radar e provas
- Mais fontes públicas no radar (a interface `FonteConcursos` já separa o parser de cada site).
- Guardar o PDF da prova anterior junto do gabarito oficial, quando a banca publica em arquivos separados.

## Próximas etapas da hospedagem própria (Fase 9)
O app instalável (GitHub Pages, offline) já sincroniza entre aparelhos por um repositório privado do
GitHub. Falta:
- IA fora do claude.ai: uma função no servidor (ex.: Cloudflare Worker ou Supabase Edge Function) com a
  chave da API da Anthropic como segredo, nunca no código (`.env`).
- PDFs da biblioteca e dos editais no app instalado (o repositório de dados aguenta arquivos de até
  100 MB, mas incharia o histórico; melhor um Storage).
- Notificações do Pomodoro, das revisões e do radar com o app fechado (push precisa de servidor).
- Radar no app instalado: a rotina diária gravaria em `dados/oportunidades/` do repositório de dados.
- Sincronização quase em tempo real (hoje: ao abrir, depois de gravar e a cada minuto).
- Vários usuários por convite, cada um com seus dados; editais compartilhados.

## IA
- Guardar as questões geradas na prática com IA para refazer depois (hoje só o resultado vai para o histórico).
