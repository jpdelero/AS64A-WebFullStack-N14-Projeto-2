import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// ---------------------------------------------------------------------------
// Parsers globais do driver.
// ---------------------------------------------------------------------------

// NUMERIC/DECIMAL: o pg devolve string por padrao. Convertemos para Number
// para que valor, limite e SUM() cheguem como numero na API. Os calculos de
// dinheiro internos continuam sendo feitos em centavos inteiros.
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

// BIGINT/COUNT: idem, evita "12" (string) em contagens.
types.setTypeParser(20, (valor) => (valor === null ? null : Number(valor)));

// DATE: mantem "AAAA-MM-DD" em vez de criar um Date no fuso local, o que
// poderia deslocar o dia em um dia (ex.: 2026-11-01 virar 2026-10-31).
types.setTypeParser(1082, (valor) => valor);

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL nao definida. Copie backend/.env.example para backend/.env.');
}

// Pool de conexoes: uma unica instancia e compartilhada por todos os models.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (erro) => {
  console.error('[db] Erro inesperado em conexao ociosa do pool:', erro.message);
});

// Atalho para consultas parametrizadas ($1, $2, ...). Nunca concatenar
// valores de usuario no texto do SQL.
export function consultar(texto, parametros = []) {
  return pool.query(texto, parametros);
}

// Executa um bloco dentro de uma transacao. Se a funcao lancar qualquer erro,
// tudo e revertido (ROLLBACK). Usado, por exemplo, no cadastro de usuario
// (usuario + categorias + fontes padrao) e na criacao das parcelas.
export async function transacao(funcao) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await funcao(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}
