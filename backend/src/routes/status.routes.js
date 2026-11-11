import { Router } from 'express';
import { horarioDoBanco } from '../models/status.model.js';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const horario = await horarioDoBanco();
    res.json({ api: 'ok', banco: 'conectado', horario });
  } catch (erro) {
    next(erro);
  }
});

export default router;
