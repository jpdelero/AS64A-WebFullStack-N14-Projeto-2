import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { pool } from '../src/config/db.js';
import { CATEGORIAS_PADRAO, FONTES_PADRAO } from '../src/models/padroes.js';
import {
  dividirParcelas,
  hojeIso,
  somarMesesReferencia,
} from '../src/models/utilitarios.js';

// ---------------------------------------------------------------------------
// Carga de demonstracao (RF nao funcional "seed"):
//  * 2 usuarios com senha bcrypt;
//  * categorias e fontes/destinos padrao;
//  * 3 meses de lancamentos (mes atual e os dois anteriores);
//  * compras parceladas no cartao para demonstrar o RF9.
// O script pode ser executado novamente sem duplicar lancamentos.
// ---------------------------------------------------------------------------

const usuarios = [
  {
    nome: 'Ana Teste',
    email: 'ana@example.com',
    cpf: '52998224725',
    parceladas: [
      // Compra feita antes do fechamento (dia 3): 1a parcela na fatura do mes.
      { descricao: 'Notebook', valor: 1200, dia: 2, categoria: 'Lazer', totalParcelas: 10 },
      // Compra no dia do fechamento: 1a parcela cai na fatura seguinte.
      { descricao: 'Curso online', valor: 300, dia: 3, categoria: 'Educação', totalParcelas: 3 },
    ],
  },
  {
    nome: 'Bruno Teste',
    email: 'bruno@example.com',
    cpf: '11144477735',
    parceladas: [
      { descricao: 'Fone de ouvido', valor: 240, dia: 1, categoria: 'Lazer', totalParcelas: 4 },
    ],
  },
];

// Movimentos recorrentes. Cada posicao de "valores" corresponde a um mes
// (dois meses atras, mes passado, mes atual).
const movimentos = [
  {
    tipo: 'entrada',
    descricao: 'Salário mensal',
    valores: [3200, 3200, 3350],
    dia: 5,
    categoria: 'Salário',
    fonte: 'Salário',
  },
  {
    tipo: 'entrada',
    descricao: 'Freelance',
    valores: [0, 450, 600],
    dia: 20,
    categoria: 'Freelance',
    fonte: 'Conta corrente',
  },
  {
    tipo: 'saida',
    descricao: 'Supermercado',
    valores: [342.8, 389.9, 412.35],
    dia: 8,
    categoria: 'Alimentação',
    fonte: 'Conta corrente',
  },
  {
    tipo: 'saida',
    descricao: 'Aluguel',
    valores: [900, 900, 900],
    dia: 10,
    categoria: 'Moradia',
    fonte: 'Conta corrente',
  },
  {
    tipo: 'saida',
    descricao: 'Farmácia',
    valores: [74.5, 89.9, 96.2],
    dia: 12,
    categoria: 'Saúde',
    fonte: 'Conta corrente',
  },
  {
    tipo: 'saida',
    descricao: 'Combustível',
    valores: [210.3, 198.7, 235.4],
    dia: 15,
    categoria: 'Mobilidade',
    fonte: 'Conta corrente',
  },
  {
    tipo: 'saida',
    descricao: 'Cinema',
    valores: [60, 60, 80],
    dia: 17,
    categoria: 'Lazer',
    fonte: 'Cartão de teste',
  },
  {
    tipo: 'saida',
    descricao: 'Curso de inglês',
    valores: [129.9, 129.9, 129.9],
    dia: 22,
    categoria: 'Educação',
    fonte: 'Cartão de teste',
  },
];

const CARTAO_DEMO = {
  nome: 'Cartão de teste',
  tipo: 'cartao_credito',
  diaFechamento: 3,
  diaVencimento: 10,
  limite: 2500,
};

function dataDoMes(mesReferencia, dia) {
  return `${mesReferencia}-${String(dia).padStart(2, '0')}`;
}

async function inserirLancamento(cliente, dados) {
  await cliente.query(
    `INSERT INTO lancamentos
       (usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      dados.usuarioId,
      dados.tipo,
      dados.descricao,
      dados.valor,
      dados.data,
      dados.categoriaId,
      dados.fonteDestinoId,
    ]
  );
}

// Grava todas as parcelas de uma compra no cartao com o mesmo grupo.
async function inserirParcelado(cliente, dados) {
  const valores = dividirParcelas(dados.valor, dados.totalParcelas);
  const grupo = randomUUID();

  for (let indice = 0; indice < valores.length; indice += 1) {
    await cliente.query(
      `INSERT INTO lancamentos
         (usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id,
          parcela_atual, total_parcelas, grupo_parcelamento)
       VALUES ($1, 'saida', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        dados.usuarioId,
        dados.descricao,
        valores[indice],
        dados.data,
        dados.categoriaId,
        dados.fonteDestinoId,
        indice + 1,
        dados.totalParcelas,
        grupo,
      ]
    );
  }
}

async function executar() {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const hash = await bcrypt.hash('Teste1234', 10);
    const hoje = hojeIso();
    const diaHoje = Number(hoje.slice(8, 10));
    const mesAtual = hoje.slice(0, 7);
    const meses = [-2, -1, 0].map((deslocamento) =>
      somarMesesReferencia(mesAtual, deslocamento)
    );

    for (const usuario of usuarios) {
      const criado = await cliente.query(
        `INSERT INTO usuarios (nome, email, cpf, senha_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE
           SET nome = EXCLUDED.nome,
               senha_hash = EXCLUDED.senha_hash
         RETURNING id`,
        [usuario.nome, usuario.email, usuario.cpf, hash]
      );
      const usuarioId = criado.rows[0].id;

      for (const categoria of CATEGORIAS_PADRAO) {
        await cliente.query(
          `INSERT INTO categorias (usuario_id, nome, tipo)
           VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id, nome, tipo) DO NOTHING`,
          [usuarioId, categoria.nome, categoria.tipo]
        );
      }

      for (const fonte of FONTES_PADRAO) {
        await cliente.query(
          `INSERT INTO fontes_destinos (usuario_id, nome, tipo, reserva)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (usuario_id, nome) DO NOTHING`,
          [usuarioId, fonte.nome, fonte.tipo, fonte.reserva]
        );
      }

      await cliente.query(
        `INSERT INTO fontes_destinos
           (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (usuario_id, nome) DO NOTHING`,
        [
          usuarioId,
          CARTAO_DEMO.nome,
          CARTAO_DEMO.tipo,
          CARTAO_DEMO.diaFechamento,
          CARTAO_DEMO.diaVencimento,
          CARTAO_DEMO.limite,
        ]
      );

      // Nao duplica lancamentos se o seed for executado de novo.
      const existe = await cliente.query(
        'SELECT 1 FROM lancamentos WHERE usuario_id = $1 LIMIT 1',
        [usuarioId]
      );
      if (existe.rowCount > 0) continue;

      const categorias = await cliente.query(
        'SELECT id, nome, tipo FROM categorias WHERE usuario_id = $1',
        [usuarioId]
      );
      const fontes = await cliente.query(
        'SELECT id, nome FROM fontes_destinos WHERE usuario_id = $1',
        [usuarioId]
      );

      const categoriaPorChave = new Map(
        categorias.rows.map((linha) => [`${linha.nome}|${linha.tipo}`, linha.id])
      );
      const fontePorNome = new Map(fontes.rows.map((linha) => [linha.nome, linha.id]));

      for (let indiceMes = 0; indiceMes < meses.length; indiceMes += 1) {
        const mes = meses[indiceMes];
        const ehMesAtual = indiceMes === meses.length - 1;

        for (const movimento of movimentos) {
          const valor = movimento.valores[indiceMes];
          if (!valor) continue;
          // No mes atual, nao cria lancamentos com data futura.
          if (ehMesAtual && movimento.dia > diaHoje) continue;

          await inserirLancamento(cliente, {
            usuarioId,
            tipo: movimento.tipo,
            descricao: movimento.descricao,
            valor,
            data: dataDoMes(mes, movimento.dia),
            categoriaId: categoriaPorChave.get(`${movimento.categoria}|${movimento.tipo}`),
            fonteDestinoId: fontePorNome.get(movimento.fonte),
          });
        }
      }

      for (const compra of usuario.parceladas) {
        await inserirParcelado(cliente, {
          usuarioId,
          descricao: compra.descricao,
          valor: compra.valor,
          data: dataDoMes(mesAtual, compra.dia),
          categoriaId: categoriaPorChave.get(`${compra.categoria}|saida`),
          fonteDestinoId: fontePorNome.get(CARTAO_DEMO.nome),
          totalParcelas: compra.totalParcelas,
        });
      }
    }

    await cliente.query('COMMIT');
    console.log('Seed concluído: 2 usuários, 3 meses de lançamentos e compras parceladas.');
    console.log('Login de demonstração: ana@example.com / bruno@example.com — senha Teste1234');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    console.error('Erro no seed:', erro.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

executar();
