// Funcoes puras de dominio: validacao, dinheiro e datas.
// Nao acessam o banco de dados e podem ser testadas isoladamente.
// Documentado no README: utilitarios ficam em models/ por serem regras de
// negocio reutilizaveis pelo back-end (e equivalentes no front-end).

// ---------------------------------------------------------------------------
// Texto e documentos
// ---------------------------------------------------------------------------

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

// Valida os dois digitos verificadores do CPF.
export function cpfValido(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

// Minimo 8 caracteres, com letras e numeros.
export function senhaValida(senha) {
  return (
    typeof senha === 'string' &&
    senha.length >= 8 &&
    /[A-Za-z]/.test(senha) &&
    /\d/.test(senha)
  );
}

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

// Aceita number (preferencial) ou string "1234.56" / "1.234,56".
// Retorna o valor em centavos inteiros ou null se invalido.
export function paraCentavos(valor) {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }
  if (typeof valor === 'string') {
    let texto = valor.trim().replace(/[R$\s]/g, '');
    if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isFinite(numero) ? Math.round(numero * 100) : null;
  }
  return null;
}

export function deCentavos(centavos) {
  return Math.round(centavos) / 100;
}

export function arredondarReais(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

// Divide um valor em N parcelas sem perder centavos. A diferenca de
// arredondamento vai para a primeira parcela.
// Ex.: 100,00 em 3x -> [33.34, 33.33, 33.33].
export function dividirParcelas(valorTotal, totalParcelas) {
  if (!Number.isInteger(totalParcelas) || totalParcelas < 1) {
    throw new Error('Numero de parcelas invalido.');
  }
  const totalCentavos = paraCentavos(valorTotal);
  if (totalCentavos === null || totalCentavos <= 0) {
    throw new Error('Valor invalido para parcelamento.');
  }
  const base = Math.floor(totalCentavos / totalParcelas);
  const sobra = totalCentavos - base * totalParcelas;
  return Array.from({ length: totalParcelas }, (_, indice) =>
    deCentavos(indice === 0 ? base + sobra : base)
  );
}

// ---------------------------------------------------------------------------
// Datas (sempre em UTC, no formato AAAA-MM-DD)
// ---------------------------------------------------------------------------

export function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return false;
  const [ano, mes, dia] = String(data).split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

export function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isoData(data) {
  return data.toISOString().slice(0, 10);
}

// mes: 0 a 11
export function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

// Aceita mes > 11 e mes < 0, ajustando dia 31 em meses curtos.
export function dataSegura(ano, mes, dia) {
  const a = ano + Math.floor(mes / 12);
  const m = ((mes % 12) + 12) % 12;
  return new Date(Date.UTC(a, m, Math.min(dia, ultimoDiaDoMes(a, m))));
}

export function somarDias(dataIso, dias) {
  const [ano, mes, dia] = String(dataIso).split('-').map(Number);
  return isoData(new Date(Date.UTC(ano, mes - 1, dia + dias)));
}

export function inicioDoMes(dataIso) {
  return `${String(dataIso).slice(0, 7)}-01`;
}

export function fimDoMes(dataIso) {
  const [ano, mes] = String(dataIso).split('-').map(Number);
  return isoData(new Date(Date.UTC(ano, mes, 0)));
}

export function intervaloDoMesAtual() {
  const hoje = hojeIso();
  return { inicio: inicioDoMes(hoje), fim: fimDoMes(hoje) };
}

// Periodo anterior para comparacao (RF7).
// Se o periodo for um mes fechado (ex.: 01/10 a 31/10), usa o mes anterior
// (01/09 a 30/09). Para periodos livres, usa a mesma quantidade de dias.
export function periodoAnterior(inicio, fim) {
  const ehMesFechado = inicio === inicioDoMes(inicio) && fim === fimDoMes(inicio);
  if (ehMesFechado) {
    const fimAnterior = somarDias(inicio, -1);
    return { inicio: inicioDoMes(fimAnterior), fim: fimAnterior };
  }

  const [a1, m1, d1] = inicio.split('-').map(Number);
  const [a2, m2, d2] = fim.split('-').map(Number);
  const dias =
    Math.round(
      (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
    ) + 1;
  const fimAnterior = somarDias(inicio, -1);
  return { inicio: somarDias(fimAnterior, -(dias - 1)), fim: fimAnterior };
}

// Soma meses a uma referencia "AAAA-MM" (mes do vencimento da fatura).
export function somarMesesReferencia(referencia, meses) {
  const [ano, mes] = referencia.split('-').map(Number);
  return isoData(new Date(Date.UTC(ano, mes - 1 + meses, 1))).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Faturas de cartao de credito (RF9)
// ---------------------------------------------------------------------------

// Regra de fechamento do enunciado. cartao: { diaFechamento, diaVencimento }.
// Retorna { referencia: 'AAAA-MM', fechamento: 'AAAA-MM-DD', vencimento: 'AAAA-MM-DD' }.
export function calcularFatura(dataCompra, cartao, numeroParcela = 1) {
  const [ano, mes, dia] = String(dataCompra).split('-').map(Number);
  const m = mes - 1;
  const fechamentoDoMes = Math.min(cartao.diaFechamento, ultimoDiaDoMes(ano, m));

  // Compra antes do fechamento entra na fatura do mes; no dia do
  // fechamento ou depois, entra na fatura seguinte.
  let mesFechamento = dia < fechamentoDoMes ? m : m + 1;
  mesFechamento += numeroParcela - 1;

  const fechamento = dataSegura(ano, mesFechamento, cartao.diaFechamento);
  const mesVencimento =
    cartao.diaVencimento > cartao.diaFechamento ? mesFechamento : mesFechamento + 1;
  const vencimento = dataSegura(ano, mesVencimento, cartao.diaVencimento);

  return {
    referencia: isoData(vencimento).slice(0, 7),
    fechamento: isoData(fechamento),
    vencimento: isoData(vencimento),
  };
}

// Caminho inverso: dada a referencia "AAAA-MM" (mes do vencimento), devolve
// as datas de fechamento e vencimento daquela fatura.
export function faturaDaReferencia(cartao, referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  const mesVencimento = mes - 1;
  const mesFechamento =
    cartao.diaVencimento > cartao.diaFechamento ? mesVencimento : mesVencimento - 1;

  return {
    referencia,
    fechamento: isoData(dataSegura(ano, mesFechamento, cartao.diaFechamento)),
    vencimento: isoData(dataSegura(ano, mesVencimento, cartao.diaVencimento)),
  };
}
