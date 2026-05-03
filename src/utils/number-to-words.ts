const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const TEENS = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const TENS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function toWords(num: number): string {
  let words = '';
  if (num >= 1000000) {
    const m = Math.floor(num / 1000000);
    words += m === 1 ? 'UN MILLÓN ' : toWords(m) + ' MILLONES ';
    num %= 1000000;
  }
  if (num >= 1000) {
    words += toWords(Math.floor(num / 1000)) + ' MIL ';
    num %= 1000;
  }
  if (num >= 100) {
    words += HUNDREDS[Math.floor(num / 100)] + ' ';
    num %= 100;
  }
  if (num >= 30) {
    words += TENS[Math.floor(num / 10)] + (num % 10 !== 0 ? ' Y ' : '');
    num %= 10;
  } else if (num >= 20) {
    words += 'VEINTI';
    num %= 10;
  } else if (num >= 10) {
    words += TEENS[num - 10] + ' ';
    num = 0;
  }
  if (num > 0) words += UNITS[num] + ' ';
  return words.trim();
}

export function numberToWords(amount: number): string {
  if (amount === 0) return 'CERO';
  const intPart = Math.floor(amount);
  const centsPart = Math.round((amount - intPart) * 100);
  let result = toWords(intPart);
  if (centsPart > 0) result += ` CON ${centsPart.toString().padStart(2, '0')}/100`;
  return result.toUpperCase();
}
