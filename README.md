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

Não foram adicionados endereço, telefone, credenciais ou depoimentos não fornecidos.

## Arquivos

- `index.html`: estrutura e conteúdo;
- `styles.css`: identidade visual e responsividade;
- `app.js`: navegação, animações e leitura dos serviços publicados no Supabase;
- `admin.html`, `admin.css` e `admin.js`: painel autenticado de gestão;
- `supabase-config.js`: URL e chave pública de conexão;
- `config.js`: número e mensagem do WhatsApp, além do conteúdo de fallback;
- `supabase/`: configuração local e migrações do banco;
- `assets/`: fotos e vídeo originais enviados.

