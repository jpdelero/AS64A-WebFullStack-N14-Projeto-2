import { useAuth } from '../contexts/AuthContext.jsx';

// Pagina provisoria: depois vira o resumo do mes.
export default function Dashboard() {
  const { usuario, logout } = useAuth();
  return (
    <main className="pagina">
      <div className="marca">$</div>
      <h1>Controle Financeiro</h1>
      <section className="painel">
        <h2>Olá, {usuario?.nome ?? 'usuário'}!</h2>
        <p>Login realizado com sucesso. As próximas telas serão adicionadas nos próximos commits.</p>
        <button onClick={logout}>Sair</button>
      </section>
    </main>
  );
}
