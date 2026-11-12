import { consultar } from '../config/db.js';
import { ErroHttp } from './erros.js';
import { CATEGORIAS_PADRAO } from './padroes.js';

function mapear(linha) {
  if (!linha) return null;
  return { id: linha.id, nome: linha.nome, tipo: linha.tipo };
}

function tratarDuplicidade(erro) {
  if (erro.code === '23505') {
    throw new ErroHttp(409, 'Já existe uma categoria com este nome para este tipo.', {
      nome: 'Já existe uma categoria com este nome para este tipo.',
    });
  }
  throw erro;
}

export async function listar(usuarioId, { tipo } = {}) {
  const parametros = [usuarioId];
  let sql = 'SELECT id, nome, tipo FROM categorias WHERE usuario_id = $1';
  if (tipo) {
    parametros.push(tipo);
    sql += ' AND tipo = $2';
  }
  sql += ' ORDER BY tipo, nome';
  const { rows } = await consultar(sql, parametros);
  return rows.map(mapear);
}

export async function buscarPorId(usuarioId, id) {
  const { rows } = await consultar(
    'SELECT id, nome, tipo FROM categorias WHERE id = $1 AND usuario_id = $2',
    [id, usuarioId]
  );
  return mapear(rows[0]);
}

export async function criar(usuarioId, { nome, tipo }) {
  try {
    const { rows } = await consultar(
      `INSERT INTO categorias (usuario_id, nome, tipo)
       VALUES ($1, $2, $3)
       RETURNING id, nome, tipo`,
      [usuarioId, nome, tipo]
    );
    return mapear(rows[0]);
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

export async function atualizar(usuarioId, id, { nome, tipo }) {
  try {
    const { rows } = await consultar(
      `UPDATE categorias
          SET nome = $3, tipo = $4
        WHERE id = $1 AND usuario_id = $2
        RETURNING id, nome, tipo`,
      [id, usuarioId, nome, tipo]
    );
    return mapear(rows[0]);
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

// Retorna true se excluiu, false se a categoria nao existe para este usuario.
// Lancamentos vinculados impedem a exclusao (RF4) -> 409.
export async function excluir(usuarioId, id) {
  const usada = await consultar(
    'SELECT 1 FROM lancamentos WHERE categoria_id = $1 AND usuario_id = $2 LIMIT 1',
    [id, usuarioId]
  );
  if (usada.rowCount > 0) {
    throw new ErroHttp(
      409,
      'Não é possível excluir: existem lançamentos vinculados a esta categoria.'
    );
  }

  try {
    const { rowCount } = await consultar(
      'DELETE FROM categorias WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId]
    );
    return rowCount > 0;
  } catch (erro) {
    // Fallback para condicao de corrida: o banco garante a FK.
    if (erro.code === '23503') {
      throw new ErroHttp(
        409,
        'Não é possível excluir: existem lançamentos vinculados a esta categoria.'
      );
    }
    throw erro;
  }
}

// Cria as categorias iniciais do usuario dentro de uma transacao existente.
export async function criarPadrao(cliente, usuarioId) {
  for (const categoria of CATEGORIAS_PADRAO) {
    await cliente.query(
      `INSERT INTO categorias (usuario_id, nome, tipo)
       VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id, nome, tipo) DO NOTHING`,
      [usuarioId, categoria.nome, categoria.tipo]
    );
  }
}
