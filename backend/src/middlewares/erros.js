import { ErroHttp } from '../models/erros.js';

// Middleware central de erros: toda rota que chamar next(erro) cai aqui.
// Formato unico de resposta do projeto: { erro, campos }.
export function tratarErros(erro, req, res, next) {
  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message, campos: erro.campos });
  }

  // Corpo JSON malformado enviado pelo cliente.
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.', campos: {} });
  }

  // Corpo maior que o limite configurado no express.json().
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Corpo da requisição muito grande.', campos: {} });
  }

  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.', campos: {} });
}
