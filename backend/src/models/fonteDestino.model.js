import { consultar } from '../config/db.js';
import { ErroHttp } from './erros.js';
import { FONTES_PADRAO } from './padroes.js';
import { arredondarReais, paraCentavos } from './utilitarios.js';

const TIPOS = ['renda', 'conta', 'cartao_credito'];

function mapear(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    tipo: linha.tipo,
    diaFechamento: linha.dia_fechamento,
    diaVencimento: linha.dia_vencimento,
    limite: linha.limite,
    reserva: linha.reserva,
  };
}

// Valida e normaliza os dados. Cartao exige fechamento, vencimento e limite;
// os demais tipos nao podem carregar esses campos (evita dado inconsistente).
function normalizar({ nome, tipo, diaFechamento, diaVencimento, limite, reserva }) {
  const erros = {};
  const nomeLimpo = String(nome ?? '').trim();
  if (!nomeLimpo) erros.nome = 'Informe o nome.';
  else if (nomeLimpo.length > 60) erros.nome = 'O nome deve ter no máximo 60 caracteres.';

  if (!TIPOS.includes(tipo)) erros.tipo = 'O tipo deve ser renda, conta ou cartao_credito.';

  let fechamento = null;
  let vencimento = null;
  let limiteNumerico = null;

  if (tipo === 'cartao_credito') {
    fechamento = Number(diaFechamento);
    vencimento = Number(diaVencimento);
    const centavosLimite = paraCentavos(limite);
    limiteNumerico = centavosLimite === null ? null : arredondarReais(centavosLimite / 100);

    if (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31) {
      erros.diaFechamento = 'Informe um dia de fechamento entre 1 e 31.';
    }
    if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
      erros.diaVencimento = 'Informe um dia de vencimento entre 1 e 31.';
    }
    if (limiteNumerico === null || limiteNumerico <= 0) {
      erros.limite = 'Informe um limite maior que zero.';
    }
  }

  if (Object.keys(erros).length > 0) {
    throw new ErroHttp(400, 'Dados inválidos.', erros);
  }

  return {
    nome: nomeLimpo,
    tipo,
    diaFechamento: fechamento,
    diaVencimento: vencimento,
    limite: limiteNumerico,
    reserva: Boolean(reserva),
  };
}

function tratarDuplicidade(erro) {
  if (erro.code === '23505') {
    throw new ErroHttp(409, 'Já existe uma fonte/destino com este nome.', {
      nome: 'Já existe uma fonte/destino com este nome.',
    });
  }
  throw erro;
}

export async function listar(usuarioId, { tipo } = {}) {
  const parametros = [usuarioId];
  let sql = `SELECT id, nome, tipo, dia_fechamento, dia_vencimento, limite, reserva
               FROM fontes_destinos
              WHERE usuario_id = $1`;
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
    `SELECT id, nome, tipo, dia_fechamento, dia_vencimento, limite, reserva
       FROM fontes_destinos
      WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  );
  return mapear(rows[0]);
}

export async function listarCartoes(usuarioId) {
  return listar(usuarioId, { tipo: 'cartao_credito' });
}

export async function criar(usuarioId, dados) {
  const fonte = normalizar(dados);
  try {
    const { rows } = await consultar(
      `INSERT INTO fontes_destinos
         (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite, reserva)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nome, tipo, dia_fechamento, dia_vencimento, limite, reserva`,
      [
        usuarioId,
        fonte.nome,
        fonte.tipo,
        fonte.diaFechamento,
        fonte.diaVencimento,
        fonte.limite,
        fonte.reserva,
      ]
    );
    return mapear(rows[0]);
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

export async function atualizar(usuarioId, id, dados) {
  const fonte = normalizar(dados);
  try {
    const { rows } = await consultar(
      `UPDATE fontes_destinos
          SET nome = $3,
              tipo = $4,
              dia_fechamento = $5,
              dia_vencimento = $6,
              limite = $7,
              reserva = $8
        WHERE id = $1 AND usuario_id = $2
        RETURNING id, nome, tipo, dia_fechamento, dia_vencimento, limite, reserva`,
      [
        id,
        usuarioId,
        fonte.nome,
        fonte.tipo,
        fonte.diaFechamento,
        fonte.diaVencimento,
        fonte.limite,
        fonte.reserva,
      ]
    );
    return mapear(rows[0]);
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

// Lancamentos vinculados impedem a exclusao (RF5) -> 409.
export async function excluir(usuarioId, id) {
  const usada = await consultar(
    'SELECT 1 FROM lancamentos WHERE fonte_destino_id = $1 AND usuario_id = $2 LIMIT 1',
    [id, usuarioId]
  );
  if (usada.rowCount > 0) {
    throw new ErroHttp(
      409,
      'Não é possível excluir: existem lançamentos vinculados a esta fonte/destino.'
    );
  }

  try {
    const { rowCount } = await consultar(
      'DELETE FROM fontes_destinos WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId]
    );
    return rowCount > 0;
  } catch (erro) {
    if (erro.code === '23503') {
      throw new ErroHttp(
        409,
        'Não é possível excluir: existem lançamentos vinculados a esta fonte/destino.'
      );
    }
    throw erro;
  }
}

// Cria as fontes/destinos iniciais do usuario dentro de uma transacao existente.
export async function criarPadrao(cliente, usuarioId) {
  for (const fonte of FONTES_PADRAO) {
    await cliente.query(
      `INSERT INTO fontes_destinos (usuario_id, nome, tipo, reserva)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, nome) DO NOTHING`,
      [usuarioId, fonte.nome, fonte.tipo, fonte.reserva]
    );
  }
}
