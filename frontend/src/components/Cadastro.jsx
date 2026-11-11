import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { cpfValido, mascaraCpf, emailValido, senhaValida } from '../services/validacoes.js';

export default function Cadastro() {
  const { cadastrar } = useAuth();
  const navegar = useNavigate();
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', senha: '', confirmar: '' });
  const [erros, setErros] = useState({});   // erro de cada campo: { cpf: '...', email: '...' }
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  function alterar(campo, valor) {
    setForm({ ...form, [campo]: valor });
  }

  // Validacao no cliente (o servidor valida de novo; esta e so para ajudar o usuario)
  function validar() {
    const e = {};
    if (!form.nome.trim()) e.nome = 'Informe o nome.';
    if (!emailValido(form.email)) e.email = 'E-mail inválido.';
    if (!cpfValido(form.cpf)) e.cpf = 'CPF inválido.';
    if (!senhaValida(form.senha)) e.senha = 'A senha deve ter no mínimo 8 caracteres, com letras e números.';
    if (form.senha !== form.confirmar) e.confirmar = 'As senhas não conferem.';
    return e;
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErroGeral('');
    const encontrados = validar();
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    try {
      await cadastrar({
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        cpf: form.cpf.replace(/\D/g, ''),
        senha: form.senha,
      });
      navegar('/login', { state: { mensagem: 'Cadastro realizado! Faça login.' } });
    } catch (e) {
      // Ex.: 409 com campos: { cpf: 'Já existe um usuário com este CPF.' }
      setErros(e.campos || {});
      setErroGeral(e.erro || 'Erro ao cadastrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="pagina-form">
      <div className="marca">$</div>
      <h1>Cadastro</h1>
      <form className="painel" onSubmit={enviar}>
        <label>
          Nome
          <input value={form.nome} onChange={(e) => alterar('nome', e.target.value)} />
          {erros.nome && <span className="erro">{erros.nome}</span>}
        </label>
        <label>
          E-mail
          <input type="email" value={form.email} onChange={(e) => alterar('email', e.target.value)} />
          {erros.email && <span className="erro">{erros.email}</span>}
        </label>
        <label>
          CPF
          <input
            value={form.cpf}
            placeholder="000.000.000-00"
            onChange={(e) => alterar('cpf', mascaraCpf(e.target.value))}
          />
          {erros.cpf && <span className="erro">{erros.cpf}</span>}
        </label>
        <label>
          Senha
          <input type="password" value={form.senha} onChange={(e) => alterar('senha', e.target.value)} />
          {erros.senha && <span className="erro">{erros.senha}</span>}
        </label>
        <label>
          Confirmar senha
          <input type="password" value={form.confirmar} onChange={(e) => alterar('confirmar', e.target.value)} />
          {erros.confirmar && <span className="erro">{erros.confirmar}</span>}
        </label>
        {erroGeral && <p className="erro">{erroGeral}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Cadastrando...' : 'Cadastrar'}</button>
        <p>Já tem conta? <Link to="/login">Entrar</Link></p>
      </form>
    </main>
  );
}
