# Studio B — Beatriz Rogoziz

Site institucional responsivo, criado em HTML, CSS e JavaScript, com serviços e valores gerenciados pelo Supabase.

## Executar localmente

Abra `index.html` no navegador ou, para uma visualização mais fiel, execute nesta pasta:

```powershell
python -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Painel administrativo

O painel está disponível em `admin.html`. No primeiro acesso:

1. crie uma conta com e-mail e senha;
2. informe o código único de ativação fornecido separadamente;
3. cadastre, edite, oculte ou remova serviços, sessões e pacotes.

Cada opção de preço pode receber um valor numérico ou um texto como “A consultar”. Também é possível marcá-la como promocional e informar o valor anterior. As mudanças salvas aparecem automaticamente no site público.

O frontend usa somente a chave pública do Supabase. As alterações são protegidas por autenticação e Row Level Security; nenhuma chave administrativa fica no site.

## Agendamento online

O fluxo não exige cadastro do cliente. Ele informa nome, WhatsApp, e-mail, serviço, data e horário. A disponibilidade combina:

- duração configurada do serviço;
- horários semanais cadastrados no painel;
- bloqueios e agendamentos existentes no Supabase;
- períodos ocupados no Google Agenda `Studio B - Beatriz Rogoziz`.

Cada confirmação gera um link privado de gerenciamento. O banco armazena apenas o hash do token. Se o cliente perder o link, a recuperação exige os dados do agendamento e um código temporário enviado ao e-mail cadastrado. E-mail, telefone e data nunca cancelam diretamente um horário.

O agendamento permanece desativado até que a integração Google esteja autorizada e os horários sejam cadastrados no painel.

### Autorizar Google Agenda e Gmail

1. No Google Cloud, crie um projeto e ative **Google Calendar API** e **Gmail API**.
2. Configure a tela de consentimento OAuth e inclua `contato.beatrizrogoziz@gmail.com` como usuário de teste, se o aplicativo ainda estiver em modo de testes.
3. Crie uma credencial **OAuth Client ID — Web application** com o URI de redirecionamento `http://localhost:53682/callback`.
4. No PowerShell, nesta pasta, execute:

```powershell
$env:GOOGLE_CLIENT_ID="seu-client-id"
$env:GOOGLE_CLIENT_SECRET="seu-client-secret"
node scripts/google-oauth-helper.mjs
```

5. Entre exclusivamente com `contato.beatrizrogoziz@gmail.com`, autorize os acessos solicitados e copie o refresh token exibido no terminal.
6. Salve os três valores diretamente nos Secrets do Supabase:

```powershell
npx supabase secrets set --project-ref exqprqsnxdyzonkjippe GOOGLE_CLIENT_ID="seu-client-id" GOOGLE_CLIENT_SECRET="seu-client-secret" GOOGLE_REFRESH_TOKEN="seu-refresh-token"
```

Nunca salve essas credenciais em arquivos versionados ou no frontend.

## Banco de dados

As tabelas, regras de acesso e dados iniciais estão versionados em `supabase/migrations/`. Para aplicar as migrações em um projeto previamente vinculado pela CLI:

```powershell
npx supabase db push
```

## Configurar o WhatsApp

Abra `config.js` e preencha `whatsappNumber` somente com números, incluindo o código do país e o DDD. Exemplo: `5511999999999`.

Enquanto o número estiver vazio, os botões informam que o WhatsApp ainda não foi configurado e não encaminham o visitante para um contato incorreto.

## Conteúdo confirmado

- Drenagem linfática: 1 hora; sessão avulsa R$ 99,00; 5 sessões R$ 399,00; 10 sessões R$ 699,00.
- Relax com aromaterapia: 1 hora; sessão avulsa R$ 99,00; 5 sessões R$ 333,00.
- Fitness/modeladora: 40 minutos; sessão avulsa R$ 99,00; 4 sessões R$ 333,00; 8 sessões R$ 660,00.
- Limpeza de pele: 40 minutos; sessão valor promocional R$ 145,00; pacotes a consultar.
- Agendamentos mediante disponibilidade.
- Unidade Casa Verde: Praça Delegado Amoroso Neto, 74 — Casa Verde, São Paulo — SP, CEP 02518-050.

Não foram adicionados credenciais ou depoimentos não fornecidos.

## Arquivos

- `index.html`: estrutura e conteúdo;
- `styles.css`: identidade visual e responsividade;
- `app.js`: navegação, animações e leitura dos serviços publicados no Supabase;
- `admin.html`, `admin.css` e `admin.js`: painel autenticado de gestão;
- `booking.html` e `booking.js`: criação de agendamentos sem cadastro;
- `manage-booking.html` e `manage-booking.js`: consulta, recuperação segura e cancelamento;
- `booking.css`: interface responsiva dos fluxos de agenda;
- `supabase-config.js`: URL e chave pública de conexão;
- `config.js`: número e mensagem do WhatsApp, além do conteúdo de fallback;
- `supabase/`: configuração local e migrações do banco;
- `supabase/functions/booking-api/`: disponibilidade, integração Google, e-mails e cancelamentos;
- `scripts/google-oauth-helper.mjs`: autorização local da conta do Studio B;
- `assets/`: fotos e vídeo originais enviados.

