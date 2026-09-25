# Portaria · Controle de Acesso

Sistema de controle de entrada e saída de veículos e pessoas, desenvolvido com HTML, CSS e JavaScript puros. Usa Firebase Authentication para acesso e Cloud Firestore para armazenamento.

## Recursos

- Registro de entrada e saída com data e hora automáticas
- Cadastro de pessoas com CPF, RG ou CNH
- Tela de pessoas dentro do local
- Espelho semanal com filtros e exportação CSV
- Histórico com busca e exportação CSV
- Cadastro de pessoas e importação de uma base local opcional
- Persistência offline do Firestore
- Modo local para demonstração sem Firebase

## Estrutura

```text
Controle_Portaria/
├── index.html
├── css/styles.css
├── js/firebase-config.js
├── js/app.js
├── js/base-planilha.js
├── firestore.rules
├── firebase.json
└── README.md
```

`js/base-planilha.js` é opcional e fica fora do Git e do Firebase Hosting. A planilha original também é ignorada para impedir a publicação de dados pessoais.

## Configurar o Firebase

### 1. Criar o projeto

1. Abra o [console.firebase.google.com](https://console.firebase.google.com/).
2. Crie um projeto e escolha uma região.
3. O identificador do projeto pode ser definido em `.firebaserc`.

### 2. Criar o Firestore

1. Em **Build → Firestore Database**, crie o banco.
2. Escolha **Iniciar em modo de produção**.
3. Selecione a região mais próxima dos usuários.

### 3. Ativar a autenticação

1. Abra **Authentication → Sign-in method**.
2. Ative **E-mail/Password**.
3. Em **Users**, cadastre os operadores que poderão acessar o sistema.

O código de acesso do aplicativo não deve ser mantido no JavaScript. A validação é feita pelo Firebase Authentication.

### 4. Publicar as regras protegidas

O arquivo `firestore.rules` permite leitura e escrita somente para uma sessão autenticada:

```bash
firebase login
firebase deploy --only firestore:rules
```

Todos os usuários cadastrados no Authentication devem ser considerados confiáveis. Para permissões diferentes por função, use Firebase custom claims e valide essas permissões também nas regras do Firestore.

### 5. Configurar o aplicativo Web

1. Em **Project settings**, crie um aplicativo Web.
2. Copie o objeto de configuração para `js/firebase-config.js`.
3. Mantenha o arquivo com o formato `firebaseConfig` esperado pela aplicação.

A configuração de um aplicativo Web do Firebase é enviada ao navegador e não deve ser tratada como credencial administrativa. A proteção dos dados depende do Authentication e das regras do Firestore.

### 6. Executar localmente

Use um servidor HTTP local:

```bash
npx serve .
```

Se o Firebase não estiver configurado, a tela oferece o modo local. Nesse modo, os registros ficam no `localStorage` do navegador e não são enviados ao Firestore.

### 7. Publicar o site

```bash
firebase login
firebase deploy --only firestore:rules,hosting
```

O comando publica as regras protegidas e o site no Firebase Hosting.

## Base local opcional

Para importar pessoas, crie `js/base-planilha.js` com o formato abaixo:

```js
var BASE_PLANILHA = [
  { nome: "Nome Exemplo", funcao: "Função", empresa: "Empresa" }
];

var BASE_OBRAS = ["Obra A", "Obra B"];
```

O arquivo é ignorado pelo Git e pelo Firebase Hosting. O botão de importação só aparece quando a base existe, o Firebase está autenticado e a aplicação está usando a nuvem.

## Dados e privacidade

- Nenhuma planilha ou lista de trabalhadores é distribuída pelo repositório.
- A base local e os arquivos `*.xlsx` permanecem apenas na máquina de desenvolvimento.
- O modo local não oferece proteção para dados reais, pois usa o armazenamento do navegador.
- Antes de usar em produção, revise as regras, cree usuários individuais e faça backup dos dados necessários.
