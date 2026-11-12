import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

// ATENCAO: este script APAGA as tabelas do projeto e recria o schema.
// Use apenas em desenvolvimento. Depois dele, rode `npm run db:seed`.
const pasta = dirname(fileURLToPath(import.meta.url));

async function executar() {
  const cliente = await pool.connect();
  try {
    await cliente.query(
      'DROP TABLE IF EXISTS lancamentos, categorias, fontes_destinos, usuarios CASCADE'
    );
    const schema = await readFile(join(pasta, 'schema.sql'), 'utf8');
    await cliente.query(schema);
    console.log('Schema recriado com sucesso. Rode `npm run db:seed` para carregar os dados.');
  } catch (erro) {
    console.error('Erro ao recriar o schema:', erro.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

executar();
