import { consultar } from '../config/db.js';
import { ErroHttp } from './erros.js';
import { arredondarReais, dataValida, periodoAnterior } from './utilitarios.js';

function validarPeriodo(inicio, fim) {
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
}

// Agregacao no banco (GROUP BY + SUM), nunca somando no front-end.
async function porCategoria(usuarioId, inicio, fim, tipo) {
  const { rows } = await consultar(
    `SELECT c.id, c.nome, SUM(l.valor) AS total
       FROM lancamentos l
       JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1
        AND l.tipo = $2
        AND l.data BETWEEN $3 AND $4
      GROUP BY c.id, c.nome
      ORDER BY total DESC, c.nome`,
    [usuarioId, tipo, inicio, fim]
  );

  return rows.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    total: arredondarReais(linha.total),
  }));
}

// RF7 - relatorio por categoria, com percentuais e comparacao com o
// periodo anterior de mesmo tamanho.
export async function relatorioCategorias(usuarioId, inicio, fim) {
  validarPeriodo(inicio, fim);
  const anterior = periodoAnterior(inicio, fim);

  const [saidas, entradas, saidasAnteriores] = await Promise.all([
    porCategoria(usuarioId, inicio, fim, 'saida'),
    porCategoria(usuarioId, inicio, fim, 'entrada'),
    porCategoria(usuarioId, anterior.inicio, anterior.fim, 'saida'),
  ]);

  const totalSaidas = arredondarReais(saidas.reduce((soma, c) => soma + c.total, 0));
  const totalEntradas = arredondarReais(entradas.reduce((soma, c) => soma + c.total, 0));
  const anterioresPorId = new Map(saidasAnteriores.map((c) => [c.id, c.total]));

  const categorias = saidas.map((categoria) => {
    const totalAnterior = anterioresPorId.get(categoria.id) ?? 0;
    return {
      ...categoria,
      percentual:
        totalSaidas > 0 ? arredondarReais((categoria.total / totalSaidas) * 100) : 0,
      periodoAnterior: totalAnterior,
      variacao: arredondarReais(categoria.total - totalAnterior),
      variacaoPercentual:
        totalAnterior > 0
          ? arredondarReais(((categoria.total - totalAnterior) / totalAnterior) * 100)
          : null,
    };
  });

  const entradasDetalhadas = entradas.map((categoria) => ({
    ...categoria,
    percentual:
      totalEntradas > 0 ? arredondarReais((categoria.total / totalEntradas) * 100) : 0,
  }));

  return {
    periodo: { inicio, fim },
    periodoAnterior: anterior,
    totalSaidas,
    totalEntradas,
    categorias,
    entradas: entradasDetalhadas,
  };
}

// RF8 - entradas por fonte, saidas por destino e saldo por fonte/destino.
export async function relatorioFontesDestinos(usuarioId, inicio, fim) {
  validarPeriodo(inicio, fim);

  const { rows } = await consultar(
    `SELECT f.id,
            f.nome,
            f.tipo,
            COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN l.tipo = 'saida'   THEN l.valor ELSE 0 END), 0) AS saidas
       FROM fontes_destinos f
       LEFT JOIN lancamentos l
              ON l.fonte_destino_id = f.id
             AND l.usuario_id = $1
             AND l.data BETWEEN $2 AND $3
      WHERE f.usuario_id = $1
      GROUP BY f.id, f.nome, f.tipo
      ORDER BY f.nome`,
    [usuarioId, inicio, fim]
  );

  const fontes = rows.map((linha) => {
    const entradas = arredondarReais(linha.entradas);
    const saidas = arredondarReais(linha.saidas);
    return {
      id: linha.id,
      nome: linha.nome,
      tipo: linha.tipo,
      entradas,
      saidas,
      saldo: arredondarReais(entradas - saidas),
    };
  });

  const totais = fontes.reduce(
    (acumulado, fonte) => ({
      entradas: arredondarReais(acumulado.entradas + fonte.entradas),
      saidas: arredondarReais(acumulado.saidas + fonte.saidas),
    }),
    { entradas: 0, saidas: 0 }
  );

  return {
    periodo: { inicio, fim },
    fontes,
    totais: {
      ...totais,
      saldo: arredondarReais(totais.entradas - totais.saidas),
    },
  };
}
