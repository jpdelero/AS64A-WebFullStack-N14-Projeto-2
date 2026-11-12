// Dados criados automaticamente para cada novo usuario (RF1).
// Ficam em um modulo proprio para que o cadastro e o seed usem a mesma lista.

export const CATEGORIAS_PADRAO = [
  { nome: 'Salário', tipo: 'entrada' },
  { nome: 'Freelance', tipo: 'entrada' },
  { nome: 'Investimentos', tipo: 'entrada' },
  { nome: 'Outros', tipo: 'entrada' },
  { nome: 'Alimentação', tipo: 'saida' },
  { nome: 'Moradia', tipo: 'saida' },
  { nome: 'Saúde', tipo: 'saida' },
  { nome: 'Mobilidade', tipo: 'saida' },
  { nome: 'Lazer', tipo: 'saida' },
  { nome: 'Educação', tipo: 'saida' },
  { nome: 'Outros', tipo: 'saida' },
];

export const FONTES_PADRAO = [
  { nome: 'Conta corrente', tipo: 'conta', reserva: false },
  { nome: 'Poupança', tipo: 'conta', reserva: true },
  { nome: 'Salário', tipo: 'renda', reserva: false },
];
