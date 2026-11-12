import { consultar } from '../config/db.js';
import { ErroHttp } from './erros.js';
import {
  arredondarReais,
  calcularFatura,
  faturaDaReferencia,
  hojeIso,
  somarMesesReferencia,
} from './utilitarios.js';

function mapearCartao(linha) {
  return {
    id: linha.id,
    nome: linha.nome,
    diaFechamento: linha.dia_fechamento,
    diaVencimento: linha.dia_vencimento,
    limite: linha.limite,
  };
}

// RF9 - fatura atual (aberta) + proximas N faturas de cada cartao.
// As datas de fatura sao calculadas a partir da data da compra e do numero
// da parcela (calcularFatura), sem precisar gravar campo derivado.
export async function previsaoFaturas(usuarioId, { meses = 3 } = {}) {
  const quantidade = Number(meses);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 12) {
    throw new ErroHttp(400, 'Dados inválidos.', {
      meses: 'O parâmetro meses deve ser um número entre 1 e 12.',
    });
  }

  const { rows: linhasCartoes } = await consultar(
    `SELECT id, nome, dia_fechamento, dia_vencimento, limite
       FROM fontes_destinos
      WHERE usuario_id = $1 AND tipo = 'cartao_credito'
      ORDER BY nome`,
    [usuarioId]
  );

  const hoje = hojeIso();
  const cartoes = linhasCartoes.map(mapearCartao);
  if (cartoes.length === 0) {
    return { hoje, meses: quantidade, cartoes: [] };
  }

  const { rows: linhasParcelas } = await consultar(
    `SELECT l.id,
            l.descricao,
            l.valor,
            l.data,
            l.parcela_atual,
            l.total_parcelas,
            l.fonte_destino_id,
            c.nome AS categoria_nome
       FROM lancamentos l
       JOIN fontes_destinos f ON f.id = l.fonte_destino_id
       JOIN categorias c ON c.id = l.categoria_id
      WHERE l.usuario_id = $1
        AND l.tipo = 'saida'
        AND f.tipo = 'cartao_credito'
      ORDER BY l.data, l.id`,
    [usuarioId]
  );

  const porCartao = new Map();
  for (const cartao of cartoes) {
    porCartao.set(cartao.id, { parcelas: [], porReferencia: new Map() });
  }

  for (const linha of linhasParcelas) {
    const cartao = cartoes.find((c) => c.id === linha.fonte_destino_id);
    if (!cartao) continue;

    const parcela = {
      id: linha.id,
      descricao: linha.descricao,
      valor: linha.valor,
      data: linha.data,
      categoriaNome: linha.categoria_nome,
      parcelaAtual: linha.parcela_atual,
      totalParcelas: linha.total_parcelas,
    };
    const fatura = calcularFatura(parcela.data, cartao, parcela.parcelaAtual);
    const dados = porCartao.get(cartao.id);
    dados.parcelas.push({ ...parcela, ...fatura });

    if (!dados.porReferencia.has(fatura.referencia)) {
      dados.porReferencia.set(fatura.referencia, []);
    }
    dados.porReferencia.get(fatura.referencia).push({ ...parcela, ...fatura });
  }

  const resultado = cartoes.map((cartao) => {
    const dados = porCartao.get(cartao.id);

    // Fatura que uma compra feita hoje cairia = fatura atualmente aberta.
    const referenciaAtual = calcularFatura(hoje, cartao, 1).referencia;

    const faturas = [];
    for (let indice = 0; indice <= quantidade; indice += 1) {
      const referencia = somarMesesReferencia(referenciaAtual, indice);
      const base = faturaDaReferencia(cartao, referencia);

      const lancamentos = (dados.porReferencia.get(referencia) ?? [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((parcela) => ({
          id: parcela.id,
          descricao: parcela.descricao,
          valor: parcela.valor,
          data: parcela.data,
          categoriaNome: parcela.categoriaNome,
          parcelaAtual: parcela.parcelaAtual,
          totalParcelas: parcela.totalParcelas,
          rotulo: `${parcela.descricao} — ${parcela.parcelaAtual}/${parcela.totalParcelas}`,
        }));

      faturas.push({
        ...base,
        atual: indice === 0,
        total: arredondarReais(lancamentos.reduce((soma, l) => soma + l.valor, 0)),
        lancamentos,
      });
    }

    // Limite comprometido: parcelas cujo vencimento ainda nao passou.
    const limiteUtilizado = arredondarReais(
      dados.parcelas
        .filter((parcela) => parcela.vencimento >= hoje)
        .reduce((soma, parcela) => soma + parcela.valor, 0)
    );

    return {
      id: cartao.id,
      nome: cartao.nome,
      diaFechamento: cartao.diaFechamento,
      diaVencimento: cartao.diaVencimento,
      limite: cartao.limite,
      limiteUtilizado,
      limiteDisponivel: arredondarReais(Math.max(0, cartao.limite - limiteUtilizado)),
      faturas,
    };
  });

  return { hoje, meses: quantidade, cartoes: resultado };
}
