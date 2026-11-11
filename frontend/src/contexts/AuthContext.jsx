import { createContext, useContext, useEffect, useState } from 'react';
import { requisicao, definirAoExpirar } from '../services/api.js';

const AuthContext = createContext(null);

// Le o usuario salvo no navegador (para nao perder o login ao recarregar a pagina)
function usuarioSalvo() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(usuarioSalvo());

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
  }

  // Se a API responder 401 (token expirado), faz logout automaticamente
  useEffect(() => {
    definirAoExpirar(logout);
  }, []);

  // A API devolve { token, usuario }
  async function login(email, senha) {
    const dados = await requisicao('/api/auth/login', {
      metodo: 'POST',
      corpo: { email, senha },
    });
    localStorage.setItem('token', dados.token);
    localStorage.setItem('usuario', JSON.stringify(dados.usuario));
    setToken(dados.token);
    setUsuario(dados.usuario);
  }

  // O cadastro nao faz login: depois de cadastrar, o usuario entra pela tela de login
  async function cadastrar({ nome, email, cpf, senha }) {
    await requisicao('/api/auth/cadastro', {
      metodo: 'POST',
      corpo: { nome, email, cpf, senha },
    });
  }

  return (
    <AuthContext.Provider value={{ token, usuario, login, logout, cadastrar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
