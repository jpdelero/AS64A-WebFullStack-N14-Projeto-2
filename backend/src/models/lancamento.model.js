import { randomUUID } from 'node:crypto';
import { consultar, transacao } from '../config/db.js';
import { ErroHttp } from './erros.js';
import {
  arredondarReais,
  dataValida,
  deCentavos,
  dividirParcelas,
  fimDoMes,
  inicioDoMes,
  intervaloDoMesAtual,
  paraCentavos,
} from './utilitarios.js';

// Consulta base com os nomes de categoria e fonte/destino ja resolvidos.
// Sempre filtrar por l.usuario_id (RF3).
const SELECT_BASE = `
  SELECT l.id,
         l.tipo,
         l.descricao,
         l.valor,
         l.data,
         l.categoria_id,
         l.fonte_destino_id,
         l.parcela_atual,
         l.total_parcelas,
         l.grupo_parcelamento,
         l.criado_em,
         c.nome AS categoria_nome,
         c.tipo AS categoria_tipo,
         f.nome AS fonte_destino_nome,
         f.tipo AS fonte_destino_tipo
    FROM lancamentos l
    JOIN categorias c ON c.id = l.categoria_id
    JOIN fontes_destinos f ON f.id = l.fonte_destino_id`;

function mapear(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    tipo: linha.tipo,
    descricao: linha.descricao,
    valor: linha.valor,
    data: linha.data,
    categoriaId: linha.categoria_id,
    categoriaNome: linha.categoria_nome,
    categoriaTipo: linha.categoria_tipo,
    fonteDestinoId: linha.fonte_destino_id,
    fonteDestinoNome: linha.fonte_destino_nome,
    fonteDestinoTipo: linha.fonte_destino_tipo,
    parcelaAtual: linha.parcela_atual,
    totalParcelas: linha.total_parcelas,
    grupoParcelamento: linha.grupo_parcelamento,
    criadoEm: linha.criado_em,
  };
}

function validarIds(dados) {
  const categoriaId = Number(dados.categoriaId);
  const fonteDestinoId = Number(dados.fonteDestinoId);
  const erros = {};

  if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
    erros.categoriaId = 'Informe a categoria.';
  }
  if (!Number.isInteger(fonteDestinoId) || fonteDestinoId <= 0) {
    erros.fonteDestinoId = 'Informe a fonte/destino.';
  }
  if (Object.keys(erros).length > 0) throw new ErroHttp(400, 'Dados inválidos.', erros);

  return { categoriaId, fonteDestinoId };
}

async function buscarVinculos(cliente, usuarioId, categoriaId, fonteDestinoId) {
  const categoria = (
    await cliente.query(
      'SELECT id, nome, tipo FROM categorias WHERE id = $1 AND usuario_id = $2',
      [categoriaId, usuarioId]
    )
  ).rows[0];

  const fonte = (
    await cliente.query(
      `SELECT id, nome, tipo, dia_fechamento, dia_vencimento, limite
         FROM fontes_destinos
        WHERE id = $1 AND usuario_id = $2`,
      [fonteDestinoId, usuarioId]
    )
  ).rows[0];

  const campos = {};
  if (!categoria) campos.categoriaId = 'Categoria não encontrada.';
  if (!fonte) campos.fonteDestinoId = 'Fonte/destino não encontrada.';
  if (Object.keys(campos).length > 0) {
    throw new ErroHttp(404, 'Registro não encontrado.', campos);
  }

  return { categoria, fonte };
}

// Regras do RF6. Recebe os vinculos ja carregados e devolve dados normalizados.
function validarDados(dados, { categoria, fonte }) {
  const erros = {};
  const tipo = dados.tipo;
  if (!['entrada', 'saida'].includes(tipo)) {
    erros.tipo = 'O tipo deve ser entrada ou saída.';
  }

  const descricao = String(dados.descricao ?? '').trim();
  if (!descricao) erros.descricao = 'Informe a descrição.';
  else if (descricao.length > 120) {
    erros.descricao = 'A descrição deve ter no máximo 120 caracteres.';
  }

  const centavos = paraCentavos(dados.valor);
  if (centavos === null || centavos <= 0) {
    erros.valor = 'O valor deve ser maior que zero.';
  } else if (centavos > 999_999_999_999) {
    erros.valor = 'O valor está acima do limite permitido.';
  }

  if (!dataValida(dados.data)) {
    erros.data = 'Informe uma data válida (AAAA-MM-DD).';
  }

  if (categoria && tipo && categoria.tipo !== tipo) {
    erros.categoriaId = `A categoria informada é de ${categoria.tipo}, mas o lançamento é de ${tipo}.`;
  }

  let totalParcelas =
    dados.totalParcelas === undefined || dados.totalParcelas === null
      ? 1
      : Number(dados.totalParcelas);

  if (!Number.isInteger(totalParcelas) || totalParcelas < 1 || totalParcelas > 48) {
    erros.totalParcelas = 'O número de parcelas deve ser entre 1 e 48.';
  } else if (totalParcelas > 1) {
    if (tipo !== 'saida') {
      erros.totalParcelas = 'Parcelamento é permitido apenas para saídas.';
    } else if (fonte && fonte.tipo !== 'cartao_credito') {
      erros.totalParcelas = 'Parcelamento é permitido apenas em cartão de crédito.';
    } else if (centavos !== null && centavos < totalParcelas) {
      erros.valor = 'O valor é menor que o número de parcelas.';
    }
  }

  if (Object.keys(erros).length > 0) {
    throw new ErroHttp(400, 'Dados inválidos.', erros);
  }

  return {
    tipo,
    descricao,
    valor: deCentavos(centavos),
    data: dados.data,
    categoriaId: Number(dados.categoriaId),
    fonteDestinoId: Number(dados.fonteDestinoId),
    totalParcelas,
  };
}

// Monta WHERE + parametros compartilhados por listagem, resumo e relatorios.
// Sem inicio/fim informados, usa o mes corrente (padrao do RF6).
function montarFiltros(usuarioId, filtros = {}) {
  let inicio = filtros.inicio || null;
  let fim = filtros.fim || null;

  // Valida antes de derivar o outro extremo do periodo.
  if (inicio && !dataValida(inicio)) {
    throw new ErroHttp(400, 'Dados inválidos.', {
      periodo: 'Informe datas válidas no formato AAAA-MM-DD.',
    });
  }
  if (fim && !dataValida(fim)) {
    throw new ErroHttp(400, 'Dados inválidos.', {
      periodo: 'Informe datas válidas no formato AAAA-MM-DD.',
    });
  }

  if (!inicio && !fim) {
    const atual = intervaloDoMesAtual();
    inicio = atual.inicio;
    fim = atual.fim;
  } else if (inicio && !fim) {
    fim = fimDoMes(inicio);
  } else if (!inicio && fim) {
    inicio = inicioDoMes(fim);
  }

  if (!dataValida(inicio) || !dataValida(fim)) {
    throw new ErroHttp(400, 'Dados inválidos.', {
      periodo: 'Informe datas válidas no formato AAAA-MM-DD.',
    });
  }
  if (inicio > fim) {
    throw new ErroHttp(400, 'Dados inválidos.', {
      periodo: 'A data inicial não pode ser maior que a data final.',
    });
  }

  const partes = ['l.usuario_id = $1'];
  const parametros = [usuarioId];

  parametros.push(inicio);
  partes.push(`l.data >= $${parametros.length}`);
  parametros.push(fim);
  partes.push(`l.data <= $${parametros.length}`);

  if (filtros.tipo) {
    if (!['entrada', 'saida'].includes(filtros.tipo)) {
      throw new ErroHttp(400, 'Dados inválidos.', {
        tipo: 'O tipo deve ser entrada ou saída.',
      });
    }
    parametros.push(filtros.tipo);
    partes.push(`l.tipo = $${parametros.length}`);
  }

  for (const [chave, coluna] of [
    ['categoriaId', 'categoria_id'],
    ['fonteDestinoId', 'fonte_destino_id'],
  ]) {
    if (filtros[chave] === undefined || filtros[chave] === null || filtros[chave] === '') {
      continue;
    }
    const id = Number(filtros[chave]);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ErroHttp(400, 'Dados inválidos.', { [chave]: 'Identificador inválido.' });
    }
    parametros.push(id);
    partes.push(`l.${coluna} = $${parametros.length}`);
  }

  return { where: partes.join(' AND '), parametros, inicio, fim };
}

export async function listar(usuarioId, filtros = {}) {
  const { where, parametros, inicio, fim } = montarFiltros(usuarioId, filtros);

  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(filtros.limite) || 20));

  const totalResultado = await consultar(
    `SELECT COUNT(*)::int AS total FROM lancamentos l WHERE ${where}`,
    parametros
  );
  const total = totalResultado.rows[0].total;

  const { rows } = await consultar(
    `${SELECT_BASE}
      WHERE ${where}
      ORDER BY l.data DESC, l.id DESC
      LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, limite, (pagina - 1) * limite]
  );

  return {
    itens: rows.map(mapear),
    filtros: { inicio, fim },
    paginacao: {
      pagina,
      limite,
      total,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}

// Totais do periodo para o dashboard (RF6): entradas, saidas e saldo.
export async function resumo(usuarioId, filtros = {}) {
  const { where, parametros, inicio, fim } = montarFiltros(usuarioId, filtros);

  const { rows } = await consultar(
    `SELECT COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN l.tipo = 'saida'   THEN l.valor ELSE 0 END), 0) AS saidas
       FROM lancamentos l
      WHERE ${where}`,
    parametros
  );

  const entradas = arredondarReais(rows[0].entradas);
  const saidas = arredondarReais(rows[0].saidas);

  return {
    periodo: { inicio, fim },
    entradas,
    saidas,
    saldo: arredondarReais(entradas - saidas),
  };
}

export async function buscarPorId(usuarioId, id) {
  const { rows } = await consultar(
    `${SELECT_BASE} WHERE l.id = $1 AND l.usuario_id = $2`,
    [id, usuarioId]
  );
  return mapear(rows[0]);
}

// Cria um lancamento simples ou todas as parcelas de uma compra no cartao.
// As parcelas sao gravadas em uma unica transacao (todas ou nenhuma).
export function criar(usuarioId, dados) {
  return transacao(async (cliente) => {
    const { categoriaId, fonteDestinoId } = validarIds(dados);
    const { categoria, fonte } = await buscarVinculos(
      cliente,
      usuarioId,
      categoriaId,
      fonteDestinoId
    );

    const validado = validarDados(
      { ...dados, categoriaId, fonteDestinoId },
      { categoria, fonte }
    );

    const valores =
      validado.totalParcelas === 1
        ? [validado.valor]
        : dividirParcelas(validado.valor, validado.totalParcelas);

    const grupo = validado.totalParcelas > 1 ? randomUUID() : null;

    const parametros = [];
    const linhas = valores.map((valorParcela, indice) => {
      const base = parametros.length;
      parametros.push(
        usuarioId,
        validado.tipo,
        validado.descricao,
        valorParcela,
        validado.data,
        categoriaId,
        fonteDestinoId,
        indice + 1,
        validado.totalParcelas,
        grupo
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
               $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
    });

    const inseridos = await cliente.query(
      `INSERT INTO lancamentos
         (usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id,
          parcela_atual, total_parcelas, grupo_parcelamento)
       VALUES ${linhas.join(', ')}
       RETURNING id`,
      parametros
    );

    const ids = inseridos.rows.map((linha) => linha.id);
    const { rows } = await cliente.query(
      `${SELECT_BASE}
        WHERE l.id = ANY($1::int[]) AND l.usuario_id = $2
        ORDER BY l.parcela_atual, l.id`,
      [ids, usuarioId]
    );

    return rows.map(mapear);
  });
}

// Atualiza apenas os campos do lancamento selecionado. Parcelamento nao e
// alterado por aqui (evita quebrar o grupo de parcelas).
export function atualizar(usuarioId, id, dados) {
  return transacao(async (cliente) => {
    const existe = await cliente.query(
      'SELECT id FROM lancamentos WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId]
    );
    if (existe.rowCount === 0) return null;

    const { categoriaId, fonteDestinoId } = validarIds(dados);
    const { categoria, fonte } = await buscarVinculos(
      cliente,
      usuarioId,
      categoriaId,
      fonteDestinoId
    );

    const validado = validarDados(
      { ...dados, categoriaId, fonteDestinoId, totalParcelas: 1 },
      { categoria, fonte }
    );

    await cliente.query(
      `UPDATE lancamentos
          SET tipo = $3,
              descricao = $4,
              valor = $5,
              data = $6,
              categoria_id = $7,
              fonte_destino_id = $8
        WHERE id = $1 AND usuario_id = $2`,
      [
        id,
        usuarioId,
        validado.tipo,
        validado.descricao,
        validado.valor,
        validado.data,
        categoriaId,
        fonteDestinoId,
      ]
    );

    const { rows } = await cliente.query(
      `${SELECT_BASE} WHERE l.id = $1 AND l.usuario_id = $2`,
      [id, usuarioId]
    );
    return mapear(rows[0]);
  });
}

// Exclui uma parcela ou todas as parcelas do mesmo grupo (RF6).
export async function excluir(usuarioId, id, { todasParcelas = false } = {}) {
  const lancamento = (
    await consultar(
      'SELECT id, grupo_parcelamento FROM lancamentos WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId]
    )
  ).rows[0];

  if (!lancamento) return { encontrado: false, excluidos: 0 };

  let resultado;
  if (todasParcelas && lancamento.grupo_parcelamento) {
    resultado = await consultar(
      'DELETE FROM lancamentos WHERE usuario_id = $1 AND grupo_parcelamento = $2',
      [usuarioId, lancamento.grupo_parcelamento]
    );
  } else {
    resultado = await consultar(
      'DELETE FROM lancamentos WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId]
    );
  }

  return { encontrado: true, excluidos: resultado.rowCount };
}
