import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

// Se nao houver token, manda o usuario para a tela de login
export default function RotaProtegida({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
