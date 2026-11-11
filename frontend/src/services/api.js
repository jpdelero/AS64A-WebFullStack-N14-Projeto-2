// Unico ponto de comunicacao com a API.
// Todas as telas usam a funcao requisicao() em vez de chamar fetch direto.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// O AuthContext registra aqui o que fazer quando o token expira (fazer logout).
let aoExpirar = null;
export function definirAoExpirar(funcao) {
  aoExpirar = funcao;
}

export async function requisicao(caminho, { metodo = 'GET', corpo } = {}) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (corpo) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    // Servidor desligado ou sem rede
    throw { status: 0, erro: 'Não foi possível conectar ao servidor.', campos: {} };
  }

  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    // 401 com token guardado = token expirado ou invalido: volta ao login
    if (resposta.status === 401 && token && aoExpirar) aoExpirar();
    // Erros do servidor vem no formato { erro, campos }
    throw { status: resposta.status, erro: dados.erro || 'Erro inesperado.', campos: dados.campos || {} };
  }
  return dados;
}
