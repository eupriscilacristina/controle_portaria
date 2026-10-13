# API de Visitas por QR Code: contrato

Contrato do módulo de visitas da API eu-gestão. Descreve, para cada rota, o
método, o caminho, os papéis permitidos, o corpo da requisição, a resposta de
sucesso e os códigos de erro.

Base: `/api/visitas` (autenticada) e `/api/visitas-publico` (pública, fase 2).

## Convenções

### Autenticação

Rotas de `/api/visitas` exigem o cabeçalho:

```http
Authorization: Bearer <token JWT de login>
```

O token é o mesmo emitido por `POST /api/auth/login`, assinado com `JWT_SECRET`.

### Papéis

| Papel | Descrição |
| --- | --- |
| `ADMIN` | Gerencia tudo, inclusive exclusões. |
| `PORTEIRO` | Opera visitas (cadastrar, validar QR, entrada/saída, cancelar, aprovar). Não exclui. |
| `SINDICO` | Sem acesso ao módulo. |
| Público | Sem token. Só nas rotas de `/api/visitas-publico`. |

Na coluna **Papel** das tabelas abaixo:

- `ADMIN`: somente ADMIN.
- `OPERACAO`: ADMIN e PORTEIRO.
- `Público`: sem autenticação.

### Erros comuns

| Código | Quando |
| --- | --- |
| `400` | Corpo ou query inválidos (ver `error` com a mensagem). |
| `401` | Token ausente, inválido ou expirado. |
| `403` | Papel sem permissão, ou troca de senha obrigatória pendente (`"Troca de senha obrigatória"`). |
| `404` | Registro não encontrado no condomínio do usuário. |
| `409` | Conflito de estado (ex.: cancelar visita já finalizada), duplicidade ou registro em uso. |
| `422` | QR Code rejeitado (ver seção "Motivos do 422"). |
| `429` | Limite de tentativas excedido (somente rotas públicas). |
| `500` | Erro interno. Inclui ausência ou formato inválido de `QR_SECRET`. Corpo: `{ "error": "Erro interno" }`. |

Formato de erro padrão: `{ "error": "mensagem" }`.

### Formato de data e hora

- `data`: `AAAA-MM-DD` (ex.: `2026-10-20`).
- `horaInicio` e `horaFim`: `HH:mm` (ex.: `08:00`).
- Todos os horários são de Brasília (fuso fixo `-03:00`).
- Datas inexistentes (ex.: `2026-02-31`) são rejeitadas com `400`.

### Formato de um objeto Visita

Retornado por `POST /`, `GET /`, `GET /:id`, aprovação, reemissão, cancelamento
e saída. Todos os campos da tabela `visitas_visitas`, exceto `qrHash`, mais:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `statusEfetivo` | string | `status` gravado, exceto `VENCIDA` (`AUTORIZADA` com `validoAte` no passado). |
| `temQrAtivo` | boolean | `true` se há um QR vigente para a visita. |
| `apartamento` | objeto | `{ id, bloco, numero }` |
| `morador` | objeto | `{ id, nome }` (quem autorizou) |
| `visitante` | objeto | `{ id, nome, documento }` |
| `registros` | array | Só em `GET /:id` e nas respostas de entrada, saída, aprovação, reemissão e cancelamento. Lista de `{ id, tipo, porteiroNome, porteiroId, criadoEm }`, em ordem cronológica. |

Principais campos gravados:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string (UUID) | Identificador da visita. |
| `status` | enum | `PENDENTE`, `AUTORIZADA`, `EM_VISITA`, `FINALIZADA`, `CANCELADA`. |
| `origem` | string | `PORTEIRO` ou `PUBLICO`. |
| `validoDe`, `validoAte` | ISO 8601 | Início e fim da validade (UTC). |
| `autorizadoPorNome` | string | Nome do morador que autorizou (snapshot). |
| `criadoPorNome`, `aprovadoPorNome`, `canceladoPorNome` | string | Porteiro ou admin responsável (snapshot). |
| `qrEmitidoEm`, `qrUsadoEm`, `aprovadoEm`, `canceladoEm` | ISO 8601 ou null | Datas dos eventos. |
| `obs` | string ou null | Observação. |

Exemplo:

```json
{
  "id": "5c1f0a7e-7b2d-4d8e-9a10-2f4b6e1c9d33",
  "tenantId": "3a9b...",
  "apartamentoId": "9e2d...",
  "moradorId": "7f11...",
  "visitanteId": "b4a0...",
  "origem": "PORTEIRO",
  "status": "AUTORIZADA",
  "validoDe": "2026-10-20T11:00:00.000Z",
  "validoAte": "2026-10-20T15:00:00.000Z",
  "obs": "Entrega",
  "qrEmitidoEm": "2026-10-20T10:58:12.000Z",
  "qrUsadoEm": null,
  "autorizadoPorNome": "Maria Souza",
  "criadoPorId": "...",
  "criadoPorNome": "Porteiro Teste",
  "aprovadoPorNome": null,
  "aprovadoEm": null,
  "canceladoPorNome": null,
  "canceladoEm": null,
  "criadoEm": "2026-10-20T10:58:12.000Z",
  "statusEfetivo": "AUTORIZADA",
  "temQrAtivo": true,
  "apartamento": { "id": "9e2d...", "bloco": "A", "numero": "101" },
  "morador": { "id": "7f11...", "nome": "Maria Souza" },
  "visitante": { "id": "b4a0...", "nome": "Ana Lima", "documento": null }
}
```

### Formato do qrToken

`qrToken` é um JWT assinado com algoritmo `HS256` e segredo `QR_SECRET`. O
frontend deve renderizá-lo como QR Code. A API não gera imagem.

Claims do payload:

| Claim | Tipo | Descrição |
| --- | --- | --- |
| `vid` | string | ID da visita. |
| `tid` | string | ID do condomínio (tenant). |
| `typ` | string | Sempre `"visita-qr"`. |
| `jti` | string (UUID) | Identificador aleatório da emissão. Cada emissão gera um token diferente. |
| `iat` | number | Emissão, em segundos Unix (adicionado pela biblioteca `jsonwebtoken`). |
| `exp` | number | Fim da validade (`validoAte`), em segundos Unix. |

Exemplo de payload decodificado:

```json
{
  "vid": "5c1f0a7e-7b2d-4d8e-9a10-2f4b6e1c9d33",
  "tid": "3a9b...",
  "typ": "visita-qr",
  "jti": "e0c7...-...",
  "iat": 1792523892,
  "exp": 1792543200
}
```

Regras:

- No banco guarda-se apenas o SHA-256 do token vigente. Reemissão e cancelamento
  invalidam o token anterior.
- O token é de uso único: a primeira validação bem-sucedida registra a entrada.

---

## Rotas autenticadas (`/api/visitas`)

### Apartamentos

#### `GET /api/visitas/apartamentos`

- **Papel:** OPERACAO
- **Resposta `200`:** array de apartamentos, ordenado por `bloco` e `numero`.

```json
[{ "id": "9e2d...", "tenantId": "3a9b...", "bloco": "A", "numero": "101", "ativo": true, "criadoEm": "2026-10-13T12:00:00.000Z" }]
```

#### `POST /api/visitas/apartamentos`

- **Papel:** ADMIN
- **Corpo:**

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `bloco` | string | não | até 20 caracteres. Padrão `""`. |
| `numero` | string | sim | 1 a 20 caracteres (após trim). |

- **Resposta `201`:** apartamento criado.
- **Erros:** `400` (número vazio ou longo demais), `403` (não ADMIN), `409` (mesmo bloco e número já existem).

#### `PATCH /api/visitas/apartamentos/:id`

- **Papel:** ADMIN
- **Corpo** (pelo menos um campo):

| Campo | Tipo | Regras |
| --- | --- | --- |
| `bloco` | string | até 20 caracteres |
| `numero` | string | 1 a 20 caracteres |
| `ativo` | boolean | `false` impede novas visitas e solicitações públicas |

- **Resposta `200`:** apartamento atualizado.
- **Erros:** `400` (corpo vazio ou inválido), `403`, `404`, `409` (duplicidade de bloco/número).

#### `DELETE /api/visitas/apartamentos/:id`

- **Papel:** ADMIN
- **Resposta `200`:** `{ "ok": true }`
- **Erros:** `403`, `404`, `409` (apartamento possui moradores ou visitas; use `ativo: false`).

### Moradores

O PIN nunca é devolvido. A resposta traz apenas `pinDefinido`.

Formato do morador na resposta:

```json
{ "id": "7f11...", "apartamentoId": "9e2d...", "nome": "Maria Souza", "ativo": true, "criadoEm": "2026-10-13T12:00:00.000Z", "pinDefinido": true }
```

#### `GET /api/visitas/moradores`

- **Papel:** OPERACAO
- **Query:** `apartamentoId` (opcional) filtra por apartamento.
- **Resposta `200`:** array de moradores, ordenado por nome.

#### `POST /api/visitas/moradores`

- **Papel:** ADMIN
- **Corpo:**

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `apartamentoId` | string | sim | Apartamento do condomínio. |
| `nome` | string | sim | 1 a 120 caracteres. |
| `pin` | string | não | Exatamente 6 dígitos (`/^\d{6}$/`). Armazenado como hash bcrypt. |

- **Resposta `201`:** morador criado.
- **Erros:** `400`, `403`, `404` (apartamento não encontrado).

#### `PATCH /api/visitas/moradores/:id`

- **Papel:** ADMIN
- **Corpo** (pelo menos um campo):

| Campo | Tipo | Regras |
| --- | --- | --- |
| `nome` | string | 1 a 120 caracteres |
| `ativo` | boolean | `false` impede o morador de autorizar visitas, inclusive por PIN |
| `pin` | string ou null | 6 dígitos para definir; `null` remove o PIN |

- **Resposta `200`:** morador atualizado.
- **Erros:** `400`, `403`, `404`.

#### `DELETE /api/visitas/moradores/:id`

- **Papel:** ADMIN
- **Resposta `200`:** `{ "ok": true }`
- **Erros:** `403`, `404`, `409` (morador possui visitas; use `ativo: false`).

### Visitantes

#### `GET /api/visitas/visitantes`

- **Papel:** OPERACAO
- **Query:** `q` (opcional) busca por nome, sem diferenciar maiúsculas.
- **Resposta `200`:** até 200 visitantes, do mais recente ao mais antigo.

#### `POST /api/visitas/visitantes`

- **Papel:** OPERACAO
- **Corpo:**

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `nome` | string | sim | 1 a 120 caracteres. |
| `documento` | string | não | até 30 caracteres. |

- **Resposta `201`:** visitante criado.
- **Erros:** `400`, `403`.

#### `PATCH /api/visitas/visitantes/:id`

- **Papel:** ADMIN
- **Corpo** (pelo menos um campo):

| Campo | Tipo | Regras |
| --- | --- | --- |
| `nome` | string | 1 a 120 caracteres |
| `documento` | string ou null | até 30 caracteres; `null` remove |

- **Resposta `200`:** visitante atualizado.
- **Erros:** `400`, `403`, `404`.

#### `DELETE /api/visitas/visitantes/:id`

- **Papel:** ADMIN
- **Resposta `200`:** `{ "ok": true }`
- **Erros:** `403`, `404`, `409` (visitante possui visitas).

### Visitas

#### `POST /api/visitas`: cadastrar visita (fase 1)

- **Papel:** OPERACAO
- **Corpo:**

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `apartamentoId` | string | sim | Apartamento ativo do condomínio. |
| `moradorId` | string | sim | Quem autorizou. Precisa ser morador ativo do apartamento. |
| `visitanteId` | string | um dos dois | Visitante já cadastrado. Tem prioridade sobre `visitante`. |
| `visitante` | objeto | um dos dois | `{ nome (obrigatório, até 120), documento (opcional, até 30) }`. Cria um visitante novo. |
| `data` | string | sim | `AAAA-MM-DD` |
| `horaInicio` | string | sim | `HH:mm` |
| `horaFim` | string | sim | `HH:mm`. Deve ser posterior a `horaInicio`. |
| `obs` | string | não | até 300 caracteres |

Exemplo:

```json
{
  "apartamentoId": "9e2d...",
  "moradorId": "7f11...",
  "visitante": { "nome": "Ana Lima" },
  "data": "2026-10-20",
  "horaInicio": "08:00",
  "horaFim": "12:00",
  "obs": "Entrega"
}
```

- **Resposta `201`:**

```json
{ "visita": { "...Visita, status AUTORIZADA..." }, "qrToken": "eyJhbGciOiJIUzI1NiJ9...." }
```

- **Erros:**
  - `400`: campos inválidos; sem visitante; `horaFim` não posterior a `horaInicio`; período já terminou; data ou horário inexistente; morador de outro apartamento.
  - `403`: papel sem permissão.
  - `404`: apartamento, morador ou `visitanteId` não encontrado.

#### `GET /api/visitas`: histórico (fase 1)

- **Papel:** OPERACAO
- **Query** (todos opcionais):

| Parâmetro | Tipo | Regras |
| --- | --- | --- |
| `status` | string | `PENDENTE`, `AUTORIZADA`, `VENCIDA`, `EM_VISITA`, `FINALIZADA`, `CANCELADA` |
| `apartamentoId` | string | |
| `moradorId` | string | |
| `visitante` | string | busca por nome, sem diferenciar maiúsculas |
| `de` | string | `AAAA-MM-DD`. Início inclusivo, por `validoDe`. |
| `ate` | string | `AAAA-MM-DD`. Fim inclusivo, por `validoDe`. |
| `pagina` | inteiro | padrão `1`, mínimo `1` |
| `limite` | inteiro | padrão `50`, entre `1` e `200` |

- **Resposta `200`:**

```json
{ "itens": [ { "...Visita..." } ], "total": 42, "pagina": 1, "limite": 50 }
```

Itens ordenados por `validoDe` decrescente.

- **Erros:** `400` (status inválido, data inválida, `limite` fora do intervalo, `pagina` menor que 1).

#### `GET /api/visitas/:id`

- **Papel:** OPERACAO
- **Resposta `200`:** objeto Visita com `registros`.
- **Erros:** `404`.

#### `POST /api/visitas/qr/validar`: leitura do QR (entrada)

- **Papel:** OPERACAO
- **Corpo:**

```json
{ "token": "eyJhbGciOiJIUzI1NiJ9...." }
```

- **Efeito:** em caso de sucesso, registra `ENTRADA` com o porteiro e o horário,
  muda o status para `EM_VISITA` e consome o token (uso único). A operação é
  atômica: duas leituras simultâneas do mesmo QR geram só uma entrada.
- **Resposta `200`:**

```json
{ "ok": true, "mensagem": "Entrada registrada", "visita": { "...Visita, status EM_VISITA, registros: [ENTRADA]..." } }
```

- **Erros:**
  - `400`: `token` ausente ou vazio.
  - `422`: QR rejeitado. Corpo `{ "error": "<mensagem>", "motivo": "<MOTIVO>" }`.

##### Motivos do 422

Ordem de verificação, da primeira para a última condição:

| `motivo` | `error` (mensagem) | Quando ocorre |
| --- | --- | --- |
| `INVALIDO` | QR Code inválido ou substituído | Assinatura inválida, token mal formado ou de tipo diferente, visita inexistente ou de outro condomínio, token substituído por reemissão, ou visita não autorizada (ex.: pendente). |
| `VENCIDO` | QR Code vencido | `exp` do token já passou (checado antes da consulta ao banco). Também ocorre quando `validoAte` já passou. |
| `CANCELADO` | Visita cancelada | Visita com status `CANCELADA`. |
| `USADO` | QR Code já utilizado | Já houve entrada com esse QR (status `EM_VISITA` ou `FINALIZADA`), ou o token já foi consumido. |
| `FORA_DA_JANELA` | Visita fora do período autorizado | `validoDe` ainda não chegou. |

Observação: a verificação de `VENCIDO` pelo `exp` do token acontece antes da
consulta ao banco. Por isso um QR vencido aparece como `VENCIDO` mesmo que a
visita tenha sido cancelada.

#### `POST /api/visitas/:id/saida`: registra SAÍDA

- **Papel:** OPERACAO
- **Efeito:** muda o status de `EM_VISITA` para `FINALIZADA` e cria um registro `SAIDA`.
- **Resposta `200`:** `{ "ok": true, "mensagem": "Saída registrada", "visita": { ... } }`
- **Erros:**
  - `404`: visita não encontrada.
  - `409`: visita não está `EM_VISITA` (sem entrada em aberto).

#### `POST /api/visitas/:id/cancelar`

- **Papel:** OPERACAO
- **Efeito:** muda o status para `CANCELADA` e invalida o QR (`qrHash` vira null).
  Só é permitido em `PENDENTE` ou `AUTORIZADA`.
- **Resposta `200`:** `{ "ok": true, "visita": { ... } }`
- **Erros:**
  - `404`: visita não encontrada.
  - `409`: status não permite cancelamento (ex.: `EM_VISITA`, `FINALIZADA`, `CANCELADA`).

#### `POST /api/visitas/:id/qr`: reemite o QR

- **Papel:** OPERACAO
- **Efeito:** gera um novo `qrToken`. O token anterior deixa de valer imediatamente.
  Só é permitido para visita `AUTORIZADA`, com validade não encerrada e sem uso.
- **Resposta `200`:** `{ "visita": { ... }, "qrToken": "..." }`
- **Erros:**
  - `404`: visita não encontrada.
  - `409`: não é possível reemitir (status diferente de `AUTORIZADA`, já usado ou vencido).

#### `POST /api/visitas/:id/aprovar`: aprova solicitação pública (fase 2)

- **Papel:** OPERACAO
- **Efeito:** muda `PENDENTE` para `AUTORIZADA` e emite o QR.
- **Resposta `200`:** `{ "visita": { ... }, "qrToken": "..." }`
- **Erros:**
  - `404`: visita não encontrada.
  - `409`: a visita não está `PENDENTE`; o período já terminou; ou a solicitação foi processada por outra operação.

#### `DELETE /api/visitas/:id`

- **Papel:** ADMIN
- **Efeito:** exclui a visita e seus registros de entrada e saída.
- **Resposta `200`:** `{ "ok": true }`
- **Erros:** `403`, `404`.

---

## Rotas públicas (fase 2, `/api/visitas-publico`)

Sem autenticação. O morador é identificado pelo apartamento e pelo PIN de 6
dígitos cadastrado pelo ADMIN. A visita fica `PENDENTE` até um PORTEIRO ou ADMIN
aprovar. Nenhum QR é devolvido aqui.

#### `POST /api/visitas-publico/:tenantId/solicitacoes`

- **Parâmetro de caminho:** `tenantId`, ID do condomínio.
- **Corpo:**

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `apartamento` | string | sim | 1 a 20 caracteres. Número do apartamento. |
| `bloco` | string | não | até 20 caracteres. Se omitido, usa vazio. |
| `pin` | string | sim | Exatamente 6 dígitos. |
| `visitante` | objeto | sim | `{ nome (obrigatório, até 120), documento (opcional, até 30) }` |
| `data` | string | sim | `AAAA-MM-DD` |
| `horaInicio` | string | sim | `HH:mm` |
| `horaFim` | string | sim | `HH:mm`, posterior a `horaInicio` |
| `obs` | string | não | até 300 caracteres |

Exemplo:

```json
{
  "bloco": "A",
  "apartamento": "101",
  "pin": "123456",
  "visitante": { "nome": "Visitante Público" },
  "data": "2026-10-20",
  "horaInicio": "08:00",
  "horaFim": "12:00"
}
```

- **Resposta `201`:**

```json
{ "id": "5c1f0a7e-7b2d-4d8e-9a10-2f4b6e1c9d33", "status": "PENDENTE", "mensagem": "Solicitação enviada. Aguarde a aprovação da portaria." }
```

- **Erros:**
  - `400`: dados inválidos, período inválido ou já terminado.
  - `401`: apartamento ou PIN inválidos. A mesma mensagem é usada nos dois casos, para não revelar quais apartamentos existem: `"Apartamento ou PIN inválidos"`.
  - `404`: condomínio inexistente ou inativo.
  - `429`: bloqueio por tentativas (ver abaixo).

Regras de tentativas:

| Limite | Valor | Janela | Efeito |
| --- | --- | --- | --- |
| Geral por IP | 30 requisições | 1 hora | `429` para todas as requisições excedentes |
| Falhas de PIN por apartamento | 5 falhas | 1 hora | `429` para qualquer PIN desse apartamento, mesmo correto |
| Falhas de PIN por IP | 20 falhas | 1 hora | `429` para o IP |

Mensagem do `429`: `"Muitas tentativas de PIN. Tente novamente mais tarde."`
(ou a mensagem do limite geral, do middleware de rate limit).

Os contadores ficam em memória, por instância da API.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `QR_SECRET` | sim, para usar QR | nenhum | Segredo que assina os `qrToken`. Mínimo 32 caracteres. Deve ser diferente de `JWT_SECRET`. Se ausente ou curto, as rotas que emitem ou validam QR respondem `500`. |
| `VISITAS_RETENCAO_DIAS` | não | `90` | Dias após o fim da visita até o job de retenção apagar o histórico. Valores inválidos (não inteiros ou menores que 1) usam o padrão. |
| `TEST_DATABASE_URL` | só para testes | nenhum | Banco dedicado a testes, usado por `npm test`. |

`JWT_SECRET` continua sendo usado para autenticar os usuários, sem mudança.

---

## Job de retenção (LGPD)

Não é uma rota. Executado pelo agendador do servidor:

```bash
node src/jobs/visitas-retencao.js --dry-run   # apenas conta
node src/jobs/visitas-retencao.js             # apaga
```

Apaga visitas cujo `validoAte` é anterior a `VISITAS_RETENCAO_DIAS` dias atrás,
junto com seus registros. Em seguida apaga os visitantes com mais de esse prazo
e sem visitas. Apartamentos e moradores não são apagados.
