/**
 * Genera un UUID versión 4 estándar usando criptografía nativa del navegador.
 * Importable en cualquier proyecto: 
 * import { generateUUIDv4 } from './tools/uuidv4/uuidv4.js';
 */
export function generateUUIDv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback por compatibilidad estricta
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}