# eu-gestão · Controle de Acesso de Portaria

Sistema web para controle de acesso de portaria de obra e prestadores: registra quem entra e sai, com veículo, placa, nota fiscal, obra e status. Funciona no celular como app instalável (PWA) e roda em infraestrutura própria.

**Produção:** https://control.euprojetos.cloud

## Funcionalidades

- Registro de entrada e saída de pessoas e veículos (nome, função, empresa, documento, placa, nota fiscal, obra e status)
- Cadastro de pessoas e histórico de acessos
- Configuração por obra (ObraConfig) e checklist
- Login por usuário ou por e-mail
- Troca obrigatória de senha no primeiro acesso
- Gestão de usuários (criar porteiros, ativar/desativar, redefinir senha) restrita a contas de suporte
- Contato de suporte via WhatsApp
- PWA instalável (Android e iPhone), com aviso de "Sem conexão"

## Perfis e permissões

| Perfil | O que faz |
|---|---|
| **ADMIN** | Acesso completo às telas de operação (acessos, pessoas, histórico) |
| **PORTEIRO** | Registra entradas e saídas |
| **Suporte** | Conta ADMIN autorizada por configuração a gerir usuários |

A gestão de usuários não depende só do papel. A API exige que o usuário esteja na lista `SUPORTE_USERNAMES` (variável de ambiente) e consulta o banco a cada requisição. Se a lista estiver vazia, ninguém gerencia usuários (falha fechada). O papel SINDICO existe no modelo, reservado para uma versão futura (ADMIN cria SINDICO, SINDICO cria PORTEIRO).

## Arquitetura

```
Celular / navegador (PWA)
        │ HTTPS
        ▼
   nginx (container web)  ──►  arquivos estáticos (HTML/CSS/JS)
        │
        ▼  /api
   API Node.js + Express (container api)
        │
        ▼
   PostgreSQL 16 (container postgres)
```

- **Frontend:** HTML, CSS e JavaScript puro, sem framework. Uma camada de abstração (`watch`, `docAdd`, `docUpdate`, `docDelete`) isola o acesso à API.
- **Backend:** API REST em Node.js + Express, com Prisma 7 e validação de entrada com zod.
- **Banco:** PostgreSQL, com tabelas `tenants`, `users`, `pessoas`, `acessos`, `autorizacoes`, `obra_configs` e `checklist_itens`.
- **Infraestrutura:** VPS na Hostinger, com Docker Compose (serviços `api`, `postgres` e `web`).
- **Multi-tenant:** os dados são separados por `tenantId`, e as consultas sempre filtram por ele.
- **Histórico:** o projeto foi migrado do Firebase para backend próprio.

## Segurança

- **Autenticação com JWT**, com o papel e o tenant no token.
- **Senhas com hash bcrypt**; o hash nunca é retornado pela API nem aparece em logs.
- **Rate limit no login e na troca de senha:** 5 tentativas por 15 minutos.
- **Mensagem de erro genérica** no login ("Credenciais inválidas"), sem revelar se o usuário existe.
- **Troca obrigatória de senha:** enquanto pendente, o token só acessa a rota de troca; as demais retornam 403.
- **Usuário desativado não entra**, e o histórico de acessos é preservado.
- **Autorização no servidor:** esconder uma tela no frontend é só visual; quem barra é a API (403).
- **PWA seguro:** o service worker nunca faz cache de `/api` nem de requisições com `Authorization`.
- **Segredos fora do código:** configuração por variáveis de ambiente, com `.env.example` sem valores reais.

## PWA

- Manifest com ícones 192/512 (any e maskable)
- Service worker com cache versionado e estratégia rede-primeiro para HTML, JS e CSS
- Atualizações chegam sem prender o usuário em uma versão antiga

Para instalar: no Android, menu do Chrome → "Instalar app"; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início".

## Operação e deploy

- Código no GitHub: repositórios `controle_portaria` (frontend, branch `migracao-vps`) e `eu-gestao-api` (backend, branch `main`).
- Deploy do frontend: script que baixa a branch e atualiza o container `web`.
- Deploy do backend: `git pull`, rebuild da imagem da API, migrations com `prisma migrate deploy` e recriação só do container `api`.
- Backups do PostgreSQL com `pg_dump` compactado, e novo backup antes de qualquer migration.
- Nunca usar `docker compose down -v` em produção.

## Variáveis de ambiente (backend)

Veja o `.env.example` da API. Entre elas:

- `SUPORTE_USERNAMES`: usernames (separados por vírgula) autorizados a gerir usuários.
- Segredo do JWT e dados de conexão com o banco (nunca versionar valores reais).

## Roadmap

- Rotas de QR para autorização de acesso (tabela `autorizacoes` já criada)
- Papel SUPORTE próprio no modelo, no lugar da lista por variável de ambiente
- Perfil SINDICO, com criação de PORTEIRO por tenant

## Tecnologias

HTML · CSS · JavaScript · Node.js · Express · Prisma · PostgreSQL · JWT · bcrypt · zod · Docker · Docker Compose · nginx · PWA

## Autoria

Projeto desenvolvido por Priscila, com apoio de IA na codificação e na revisão de segurança.
