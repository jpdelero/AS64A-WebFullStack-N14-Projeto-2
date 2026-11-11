import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const resultado = await pool.query('SELECT NOW() AS horario');
    res.json({ api: 'ok', banco: 'conectado', horario: resultado.rows[0].horario });
  } catch (erro) {
    next(erro);
  }
});

export default router;
