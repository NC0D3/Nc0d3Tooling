/**
 * Genera un UUID versión 6 (ordenado por tiempo).
 * Importable en cualquier proyecto:
 * import { generateUUIDv6 } from './tools/uuidv6/uuidv6.js';
 */
export function generateUUIDv6() {
  // Obtener milisegundos desde el epoch gregoriano o timestamp actual ajustado
  const timeMs = Date.now();
  
  // Convertir timestamp a hexadecimal de 60 bits
  const timestampHex = timeMs.toString(16).padStart(15, '0');
  
  const timeHigh = timestampHex.slice(0, 7);
  const timeMid = timestampHex.slice(7, 11);
  const versionTimeLow = '6' + timestampHex.slice(11, 15); // Versión 6

  // Generar bytes aleatorios para los campos restantes (clk_seq y node)
  const randomBytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 8; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Ajustar variante RFC 4122 (los dos bits más altos de clock_seq_hi_and_reserved deben ser 1 y 0)
  randomBytes[0] = (randomBytes[0] & 0x3f) | 0x80;

  const hexVals = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0'));
  
  const clkSeqHi = hexVals[0];
  const clkSeqLo = hexVals[1];
  const node = hexVals.slice(2).join('');

  return `${timeHigh}-${timeMid}-${versionTimeLow}-${clkSeqHi}${clkSeqLo}-${node}`;
}