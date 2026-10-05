import { createHash } from 'node:crypto';

/** sha256(email normalizado + salt). Sem salt ou sem e-mail → null. Nunca devolve o e-mail. */
export function hashContactEmail(email, salt) {
  if (!email || !salt) return null;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return null;
  return createHash('sha256').update(normalized + String(salt)).digest('hex');
}
