// Erro de negocio/validacao que o middleware central sabe transformar em
// resposta HTTP. Os models lancam ErroHttp e as rotas nao precisam repetir
// o formato { erro, campos }.
export class ErroHttp extends Error {
  constructor(status, mensagem, campos = {}) {
    super(mensagem);
    this.name = 'ErroHttp';
    this.status = status;
    this.campos = campos;
  }
}
