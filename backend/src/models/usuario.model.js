import { consultar, transacao } from '../config/db.js';
import { ErroHttp } from './erros.js';
import { criarPadrao as criarCategoriasPadrao } from './categoria.model.js';
import { criarPadrao as criarFontesPadrao } from './fonteDestino.model.js';

const CAMPOS_PUBLICOS = 'id, nome, email, cpf, criado_em';

function mapear(linha) {
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    cpf: linha.cpf,
    criadoEm: linha.criado_em,
  };
}

// Cria o usuario e, na MESMA transacao, as categorias e fontes/destinos
// padrao (RF1). Se qualquer etapa falhar, nada e gravado.
export function criarComPadroes({ nome, email, cpf, senhaHash }) {
  return transacao(async (cliente) => {
    let resultado;
    try {
      resultado = await cliente.query(
        `INSERT INTO usuarios (nome, email, cpf, senha_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING ${CAMPOS_PUBLICOS}`,
        [nome, email, cpf, senhaHash]
      );
    } catch (erro) {
      // 23505 = unique_violation no PostgreSQL.
      if (erro.code === '23505') {
        const restricao = String(erro.constraint ?? '');
        const campo = restricao.includes('cpf') ? 'cpf' : 'email';
        throw new ErroHttp(409, 'Usuário já cadastrado.', {
          [campo]:
            campo === 'cpf'
              ? 'Já existe um usuário com este CPF.'
              : 'Já existe um usuário com este e-mail.',
        });
      }
      throw erro;
    }

    const usuario = mapear(resultado.rows[0]);
    await criarCategoriasPadrao(cliente, usuario.id);
    await criarFontesPadrao(cliente, usuario.id);
    return usuario;
  });
}

// Usado apenas pelo login: inclui senha_hash. Nunca devolver este objeto
// diretamente em uma resposta HTTP.
export async function buscarPorEmail(email) {
  const { rows } = await consultar(
    'SELECT id, nome, email, cpf, senha_hash, criado_em FROM usuarios WHERE email = $1',
    [email]
  );
  return rows[0] ?? null;
}

export async function buscarPorId(id) {
  const { rows } = await consultar(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = $1`,
    [id]
  );
  return mapear(rows[0]);
}
