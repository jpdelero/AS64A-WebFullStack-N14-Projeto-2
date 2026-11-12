-- =============================================================================
-- Projeto 2 - Controle Financeiro
-- Schema completo para PostgreSQL.
--
-- Para recriar o banco do zero (apaga os dados):
--   cd backend
--   npm run db:reset
--   npm run db:seed
-- ou apenas:
--   npm run db:setup
--
-- Decisoes de modelagem documentadas no README:
--  * e-mail sempre em minusculas e CPF sempre com 11 digitos (CHECK no banco);
--  * dinheiro em NUMERIC(12,2), nunca float;
--  * cada parcela e um lancamento com o mesmo grupo_parcelamento (UUID);
--  * a fatura do cartao e calculada na aplicacao a partir da data da compra
--    e de parcela_atual (ver src/models/utilitarios.js).
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(120) NOT NULL CHECK (btrim(nome) <> ''),
  email      VARCHAR(160) NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  cpf        VARCHAR(11) NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  senha_hash VARCHAR(100) NOT NULL,
  criado_em  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome       VARCHAR(60) NOT NULL CHECK (nome = btrim(nome) AND nome <> ''),
  tipo       VARCHAR(7)  NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  UNIQUE (usuario_id, nome, tipo)
);

CREATE TABLE IF NOT EXISTS fontes_destinos (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome           VARCHAR(60) NOT NULL CHECK (nome = btrim(nome) AND nome <> ''),
  tipo           VARCHAR(14) NOT NULL CHECK (tipo IN ('renda', 'conta', 'cartao_credito')),
  dia_fechamento SMALLINT CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite         NUMERIC(12,2) CHECK (limite >= 0),
  -- Campo usado apenas pelo desafio de saude financeira (reserva de emergencia).
  reserva        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (usuario_id, nome),
  CHECK (
    tipo <> 'cartao_credito'
    OR (dia_fechamento IS NOT NULL AND dia_vencimento IS NOT NULL AND limite IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo               VARCHAR(7)     NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  descricao          VARCHAR(120)   NOT NULL CHECK (descricao = btrim(descricao) AND descricao <> ''),
  valor              NUMERIC(12,2)  NOT NULL CHECK (valor > 0),
  data               DATE           NOT NULL,
  categoria_id       INTEGER NOT NULL REFERENCES categorias(id),
  fonte_destino_id   INTEGER NOT NULL REFERENCES fontes_destinos(id),
  parcela_atual      SMALLINT NOT NULL DEFAULT 1,
  total_parcelas     SMALLINT NOT NULL DEFAULT 1 CHECK (total_parcelas BETWEEN 1 AND 48),
  grupo_parcelamento UUID,
  criado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Compra parcelada: todas as parcelas compartilham um grupo e a numeracao
  -- vai de 1 ate total_parcelas. Lancamento simples nao tem grupo.
  CHECK (
    (total_parcelas = 1 AND parcela_atual = 1 AND grupo_parcelamento IS NULL)
    OR
    (total_parcelas > 1 AND parcela_atual BETWEEN 1 AND total_parcelas
      AND grupo_parcelamento IS NOT NULL)
  )
);

-- Filtros por periodo (RF6) e listagem padrao.
CREATE INDEX IF NOT EXISTS idx_lancamentos_usuario_data
  ON lancamentos (usuario_id, data);

-- Relatorios por categoria e por fonte/destino (RF7 e RF8).
CREATE INDEX IF NOT EXISTS idx_lancamentos_usuario_tipo_data
  ON lancamentos (usuario_id, tipo, data);

-- Verificacao de exclusao de categoria/fonte com lancamentos vinculados.
CREATE INDEX IF NOT EXISTS idx_lancamentos_categoria
  ON lancamentos (categoria_id);

CREATE INDEX IF NOT EXISTS idx_lancamentos_fonte_destino
  ON lancamentos (fonte_destino_id);

-- Exclusao de todas as parcelas de uma compra (RF6).
CREATE INDEX IF NOT EXISTS idx_lancamentos_grupo_parcelamento
  ON lancamentos (grupo_parcelamento)
  WHERE grupo_parcelamento IS NOT NULL;
