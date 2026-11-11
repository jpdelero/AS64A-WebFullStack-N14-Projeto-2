import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../src/config/db.js';

const usuarios = [
  { nome: 'Ana Teste', email: 'ana@example.com', cpf: '52998224725' },
  { nome: 'Bruno Teste', email: 'bruno@example.com', cpf: '11144477735' },
];

async function executar() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash('Teste1234', 10);
    for (const usuario of usuarios) {
      const criado = await client.query(
        `INSERT INTO usuarios (nome, email, cpf, senha_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome
         RETURNING id`,
        [usuario.nome, usuario.email, usuario.cpf, hash]
      );
      const id = criado.rows[0].id;
      const categorias = [
        ['Salário', 'entrada'], ['Alimentação', 'saida'],
        ['Moradia', 'saida'], ['Saúde', 'saida'],
        ['Mobilidade', 'saida'], ['Lazer', 'saida'],
        ['Educação', 'saida'], ['Outros', 'saida'],
      ];
      for (const [nome, tipo] of categorias) {
        await client.query(
          `INSERT INTO categorias (usuario_id, nome, tipo) VALUES ($1, $2, $3)
           ON CONFLICT (usuario_id, nome, tipo) DO NOTHING`,
          [id, nome, tipo]
        );
      }
      for (const [nome, tipo, fechamento, vencimento, limite] of [
        ['Conta corrente', 'conta', null, null, null],
        ['Salário', 'renda', null, null, null],
        ['Cartão de teste', 'cartao_credito', 3, 10, 2500],
      ]) {
        await client.query(
          `INSERT INTO fontes_destinos (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (usuario_id, nome) DO NOTHING`,
          [id, nome, tipo, fechamento, vencimento, limite]
        );
      }
      const existe = await client.query('SELECT 1 FROM lancamentos WHERE usuario_id = $1 LIMIT 1', [id]);
      if (existe.rowCount) continue;
      const cats = await client.query('SELECT id, nome FROM categorias WHERE usuario_id = $1', [id]);
      const fontes = await client.query('SELECT id, nome FROM fontes_destinos WHERE usuario_id = $1', [id]);
      const cat = Object.fromEntries(cats.rows.map(c => [c.nome, c.id]));
      const fonte = Object.fromEntries(fontes.rows.map(f => [f.nome, f.id]));
      // Três meses de dados para a demonstração, sem depender do mês atual.
      for (const mes of ['2026-09', '2026-10', '2026-11']) {
        for (const [tipo, descricao, valor, dia, categoria, destino] of [
          ['entrada', 'Salário mensal', 2800, '05', 'Salário', 'Salário'],
          ['saida', 'Supermercado', 320.45, '08', 'Alimentação', 'Conta corrente'],
          ['saida', 'Aluguel', 850, '10', 'Moradia', 'Conta corrente'],
          ['saida', 'Cinema', 65, '17', 'Lazer', 'Cartão de teste'],
        ]) {
          await client.query(
            `INSERT INTO lancamentos
              (usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, tipo, descricao, valor, `${mes}-${dia}`, cat[categoria], fonte[destino]]
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log('Seed concluído: 2 usuários e lançamentos de 3 meses.');
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro no seed:', erro.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

executar();
