import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import statusRoutes from './routes/status.routes.js';
import { tratarErros } from './middlewares/erros.js';

const app = express();
const porta = Number(process.env.PORT) || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensagem: 'API de controle financeiro funcionando!' });
});
app.use('/api', statusRoutes);

app.use(tratarErros);

app.listen(porta, () => console.log(`Servidor rodando na porta ${porta}`));
