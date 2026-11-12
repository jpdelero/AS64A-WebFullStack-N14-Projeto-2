# Projeto 2 — Controle Financeiro

Projeto da disciplina Programação Web Full Stack. **Estado atual: banco de dados completo (schema, seed, pool, models de persistência e relatórios) e telas de login/cadastro preparadas para o JWT.**

## Requisitos
- Node.js 20.19+ ou 22.12+ (Vite atual)
- PostgreSQL 13+ instalado e rodando
- CMD do Windows / VS Code

## Instalação

```bat
cd backend
npm install
copy .env.example .env
```

Edite `backend/.env` com usuário, senha e nome do seu banco PostgreSQL. Crie o banco pelo pgAdmin ou com:

```bat
createdb -U postgres projeto2_financas
```

## Banco de dados

O jeito mais rápido de deixar o banco pronto (recria as tabelas e carrega os dados de demonstração):

```bat
cd backend
npm run db:setup
```

Comandos disponíveis:

| Comando | O que faz |
|---|---|
| `npm run db:setup` | `db:reset` + `db:seed` (apaga e recria tudo) |
| `npm run db:reset` | Apaga as tabelas do projeto e executa `database/schema.sql` |
| `npm run db:seed` | Carrega os dados de demonstração (pode ser repetido) |

Alternativa manual: abra o Query Tool do banco `projeto2_financas` no pgAdmin, execute `backend/database/schema.sql` e depois rode `npm run db:seed`.

> **Atenção:** `db:reset` e `db:setup` apagam os dados existentes. Use-os apenas em desenvolvimento. Se você já tinha o schema do marco 1, rode `npm run db:setup` para receber as novas restrições, índices e o campo `reserva`.

### Modelo de dados

| Tabela | Papel | Restrições principais |
|---|---|---|
| `usuarios` | conta do usuário | `email` e `cpf` UNIQUE; e-mail em minúsculas e CPF com 11 dígitos garantidos por CHECK; senha apenas como hash |
| `categorias` | classifica lançamentos | pertence ao usuário; `tipo ∈ {entrada, saida}`; UNIQUE `(usuario_id, nome, tipo)` |
| `fontes_destinos` | origem/destino do dinheiro | `tipo ∈ {renda, conta, cartao_credito}`; cartão exige fechamento, vencimento e limite; UNIQUE `(usuario_id, nome)`; campo `reserva` para o desafio |
| `lancamentos` | movimentação financeira | `tipo ∈ {entrada, saida}`; `valor > 0` em NUMERIC(12,2); data obrigatória; FKs para categoria e fonte; parcelamento com `grupo_parcelamento` |

Decisões de modelagem:

- **Normalização no banco:** além de normalizar no código (`trim().toLowerCase()` e só dígitos), o schema tem CHECK garantindo e-mail minúsculo e CPF com 11 dígitos. A unicidade é garantida pelo SGBD, não por consulta prévia.
- **Dinheiro:** `NUMERIC(12,2)`. Os cálculos de parcelamento são feitos em centavos inteiros (`dividirParcelas`) para nunca perder centavos.
- **Parcelamento:** cada parcela é um lançamento com o mesmo `grupo_parcelamento` (UUID). Um CHECK garante que lançamento simples não tenha grupo e que parcelado tenha grupo e numeração válida.
- **Faturas (RF9):** a fatura é calculada na aplicação a partir da data da compra e de `parcela_atual` (`calcularFatura`), sem gravar campo derivado. Vantagem: editar/excluir parcelas não deixa dados de fatura desatualizados.
- **Exclusão de categoria/fonte:** as FKs de `lancamentos` usam o comportamento padrão (`NO ACTION`), então o banco também impede excluir registros em uso. A API verifica antes para devolver 409 com mensagem amigável.
- **Índices:** `(usuario_id, data)` para filtros, `(usuario_id, tipo, data)` para relatórios, índices nas FKs e índice parcial em `grupo_parcelamento`.
- **Validação de tipo categoria × lançamento:** feita na API (models), conforme permitido pelo enunciado. Um trigger no banco seria possível, mas foi evitado para manter o código explicável na apresentação.

## Rodar o projeto

Backend:

```bat
cd backend
npm run dev
```

Frontend (outro terminal):

```bat
cd frontend
npm install
npm run dev
```

- API: http://localhost:3000/
- Teste do banco: http://localhost:3000/api/status
- React: http://localhost:5173/

## Dados de demonstração

`npm run db:seed` cria:

- 2 usuários: `ana@example.com` e `bruno@example.com`, senha `Teste1234` (**somente desenvolvimento**);
- categorias e fontes/destinos padrão (`Conta corrente`, `Poupança` marcada como reserva, `Salário`);
- cartão de demonstração com fechamento dia 3, vencimento dia 10 e limite de R$ 2.500,00;
- lançamentos do mês atual e dos dois anteriores;
- compras parceladas para demonstrar as faturas:
  - **Notebook** — R$ 1.200,00 em 10×, compra no dia 2 (antes do fechamento);
  - **Curso online** — R$ 300,00 em 3×, compra no dia 3 (dia do fechamento, cai na fatura seguinte);
  - **Fone de ouvido** — R$ 240,00 em 4× (usuário Bruno).

O seed pode ser executado novamente sem duplicar lançamentos.

## Camada de dados (`backend/src/models`)

| Arquivo | Responsabilidade |
|---|---|
| `padroes.js` | categorias e fontes/destinos criados no cadastro |
| `utilitarios.js` | CPF, dinheiro, datas e regra de faturamento (funções puras) |
| `erros.js` | `ErroHttp` (status + mensagem + campos) usado pelos models |
| `usuario.model.js` | cadastro transacional (usuário + padrões), busca por e-mail/id |
| `categoria.model.js` | CRUD e proteção contra exclusão com lançamentos |
| `fonteDestino.model.js` | CRUD, regras de cartão e proteção contra exclusão |
| `lancamento.model.js` | CRUD, filtros/paginação, totais e parcelamento em transação |
| `relatorio.model.js` | agregações do RF7 e RF8 no banco (`GROUP BY`/`SUM`) |
| `fatura.model.js` | previsão de faturas, parcelas futuras e limite utilizado (RF9) |

O acesso ao banco acontece somente nesses arquivos. As rotas (próximo marco) apenas validam a entrada e chamam os models. Todas as consultas são parametrizadas e filtram por `usuario_id`.

## Organização

```
projeto2-financas/
├── backend/
│   ├── database/
│   │   ├── schema.sql          → tabelas, restrições e índices
│   │   ├── seed.js             → carga de demonstração
│   │   └── reset.js            → recria o schema (apaga dados)
│   └── src/
│       ├── server.js
│       ├── routes/             → rotas + controladores
│       ├── models/             → acesso ao banco e regras de persistência
│       ├── middlewares/        → autenticação, validação, erros
│       └── config/             → pool PostgreSQL e configurações
├── frontend/
│   └── src/
│       ├── components/         → páginas e componentes
│       ├── contexts/           → AuthContext
│       └── services/           → cliente HTTP único e validações
└── README.md
```

## Próximos marcos

2. **Autenticação:** `auth.routes.js`, cadastro com normalização/UNIQUE → 409, login JWT, `autenticar` e rate limiting.
3. **CRUDs:** rotas de categorias, fontes/destinos e lançamentos usando os models já implementados.
4. **Relatórios:** rotas para `relatorio.model.js` e `fatura.model.js`, telas com gráficos.
5. **Acabamento:** desafio de saúde financeira, README final e ensaio da apresentação.

## Segurança

Não versionar `.env` nem `node_modules`. `JWT_SECRET` deve ser substituído por um valor longo e aleatório antes de implementar autenticação. Consultas são parametrizadas e sempre filtram pelo usuário autenticado.

## Repositório da equipe

https://github.com/jpdelero/AS64A-WebFullStack-N14-Projeto-2

Copie **o conteúdo** deste ZIP para a raiz do clone existente, preservando o `.git` e o histórico. Não execute `git init`.
