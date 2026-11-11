// Middleware central de erros: toda rota que chamar next(erro) cai aqui.
// Formato de resposta padrao do projeto: { erro: "mensagem" }
export function tratarErros(erro, req, res, next) {
  console.error(erro.message);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
}
