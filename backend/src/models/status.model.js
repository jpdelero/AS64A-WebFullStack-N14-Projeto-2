import { pool } from '../config/db.js';

// Consulta simples para testar se a conexao com o banco funciona.
export async function horarioDoBanco() {
  const resultado = await pool.query('SELECT NOW() AS horario');
  return resultado.rows[0].horario;
}
