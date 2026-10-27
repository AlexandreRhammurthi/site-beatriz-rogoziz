# Roadmap — Agenda Studio B

Atualizado em 27 de outubro de 2026.

Este roadmap organiza a evolução do agendamento sem cadastro, preservando a integração já ativa com Supabase, Google Agenda e Gmail. Cada entrega só é considerada concluída depois de testes automatizados, QA funcional e publicação.

## Critérios gerais de entrega

1. Código e migrações versionados no Git.
2. Testes automatizados relevantes executados com sucesso.
3. QA responsivo em desktop e celular para alterações visuais.
4. Verificação de segurança e permissões para alterações de dados.
5. Publicação no Supabase quando houver backend ou banco.
6. Publicação no domínio `www.beatrizrogoziz.com.br` quando houver interface.
7. Smoke test público após a publicação.

## Fase 1 — Prioridades operacionais

### 1.1 Privacidade no agendamento

**Estado:** concluído em produção

- Exibir link direto para a Política de Privacidade junto ao consentimento do formulário.
- Manter o agendamento condicionado à confirmação do cliente.
- Validar legibilidade, foco por teclado e abertura da política.

**Testes:** contrato HTML, link público e QA responsivo.

### 1.2 Bloqueios e horários excepcionais

**Estado:** concluído em produção

- Criar bloqueios integrais ou parciais com início, fim e motivo.
- Listar bloqueios futuros no painel administrativo.
- Permitir exclusão explícita de um bloqueio.
- Garantir que qualquer sessão sobreposta deixe de aparecer ao cliente.

**Testes:** validação de período, conversão do fuso de São Paulo, autorização administrativa, persistência e indisponibilidade pública.

### 1.3 Painel de agendamentos

**Estado:** concluído em produção

- Listar próximos agendamentos e histórico recente.
- Filtrar por status, período, cliente, telefone, e-mail ou serviço.
- Exibir detalhes essenciais sem expor dados fora da área autenticada.
- Preparar a base visual para ações administrativas futuras.

**Testes:** filtros, formatação, estados vazios, autorização e responsividade.

## Fase 2 — Reagendamento seguro

**Estado:** planejado

- Permitir nova escolha de data e horário usando o link privado existente.
- Revalidar disponibilidade e impedir concorrência de horários.
- Atualizar o evento do Google Agenda e enviar nova confirmação.
- Manter o fluxo sem cadastro e registrar a alteração.

**Testes:** sucesso, conflito simultâneo, link inválido, prazo encerrado e atualização do evento.

## Fase 3 — Lembretes automáticos

**Estado:** planejado

- Configurar antecedência no painel.
- Enviar lembrete por e-mail com serviço, horário, endereço e link privado.
- Impedir mensagens duplicadas e ignorar agendamentos cancelados.
- Ativar somente depois da aprovação definitiva do Google.

**Testes:** seleção de destinatários, idempotência, cancelamentos e falha de provedor.

## Fase 4 — Melhorias operacionais

**Estado:** planejado

- Intervalo de preparação entre sessões.
- Limite diário de atendimentos.
- Observações administrativas privadas.
- Estados de atendimento: confirmado, concluído, ausência e cancelado.
- Exportação controlada de agendamentos.

**Testes:** regras de capacidade, transições de estado, privacidade e exportação.

## Fase 5 — Segurança e confiabilidade

**Estado:** planejado

- Revisar RLS e privilégios das tabelas do Supabase.
- Reforçar limites contra automação abusiva.
- Revisar recuperação e cancelamento seguro.
- Adicionar verificações operacionais da agenda e do envio de e-mails.
- Documentar recuperação de falhas e rotação de credenciais.

**Testes:** acesso anônimo negado, abuso, tokens inválidos, concorrência e indisponibilidade externa.

## Fase 6 — Qualidade contínua

**Estado:** planejado

- Consolidar testes de contrato, unidade, integração e smoke.
- Executar verificações em cada mudança antes da publicação.
- Manter checklist de QA para desktop, celular, teclado e leitores de tela.
- Registrar as entregas e evidências de publicação neste roadmap.

## Registro de entregas

| Data | Entrega | Testes | Produção |
| --- | --- | --- | --- |
| 27/10/2026 | Roadmap inicial | revisão estrutural | publicado |
| 27/10/2026 | Link de privacidade no agendamento | 3 testes automatizados + QA móvel | publicado |
| 27/10/2026 | Bloqueios de datas e horários | 6 testes automatizados + segurança RLS | publicado |
| 27/10/2026 | Painel administrativo de agendamentos | 6 testes automatizados + QA responsivo | publicado |
