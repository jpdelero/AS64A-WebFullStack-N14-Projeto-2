# Projeto 2 — Controle Financeiro

Projeto da disciplina Programação Web Full Stack. **Entrega parcial: marco 1 (estrutura, modelagem e seed).**

## Requisitos
- Node.js 20.19+ ou 22.12+ (Vite atual)
- PostgreSQL instalado e rodando
- CMD do Windows / VS Code

## Instalação no CMD
Execute na pasta raiz:

```bat
cd backend
npm install
copy .env.example .env
```

Edite `backend/.env` com usuário, senha e nome do seu banco PostgreSQL.

Crie o banco pelo pgAdmin ou com `createdb -U postgres projeto2_financas` (se `createdb` estiver no PATH).

No pgAdmin, abra Query Tool do banco `projeto2_financas` e execute `backend/database/schema.sql`.

Depois, no CMD:

```bat
cd backend
npm run seed
npm run dev
```

Em outro terminal, na raiz:

```bat
cd frontend
npm install
npm run dev
```

- API: http://localhost:3000/
- Teste do banco: http://localhost:3000/api/status (precisa de banco configurado)
- React: http://localhost:5173/

## Dados de demonstração
`npm run seed` insere dois usuários com senhas bcrypt, categorias, fontes/destinos e lançamentos de três meses. Credenciais de demonstração: `ana@example.com` e `bruno@example.com`, senha `Teste1234`. **Somente para desenvolvimento.** O seed pode ser executado novamente sem duplicar dados.

## Organização
- `backend/database/schema.sql`: tabelas, relacionamentos, restrições e índices
- `backend/database/seed.js`: carga de demonstração
- `backend/src/config/db.js`: pool PostgreSQL
- `backend/src/routes/status.routes.js`: rota de teste
- `backend/src/server.js`: inicialização da API
- `frontend/src/App.jsx`: tela inicial (sem integração financeira ainda)

## Escopo do commit 1
Inclui estrutura, backend Express, frontend React, esquema PostgreSQL, seed e verificação da conexão. **Não inclui** cadastro/login/JWT, CRUDs, relatórios nem faturas — previstos para os próximos commits.

## Próximos marcos
2. Cadastro, validações, login JWT, AuthContext e isolamento dos dados.
3. CRUDs de categorias, fontes/destinos e lançamentos, parcelamento e filtros.
4. Relatórios, previsão de faturas, gráficos, testes, README final e apresentação.

## Segurança
Não versionar `.env` nem `node_modules`. `JWT_SECRET` deve ser substituído por valor longo e aleatório antes de implementar autenticação. Consultas futuras devem ser parametrizadas e sempre filtrar por usuário autenticado.

## Repositório da equipe
https://github.com/jpdelero/AS64A-WebFullStack-N14-Projeto-2

Copie **o conteúdo** deste ZIP para a raiz do clone existente, preservando o `.git` e o histórico. Não execute `git init`.
