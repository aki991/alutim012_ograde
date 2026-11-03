/**
 * Prijava korisničkim imenom: Supabase Auth traži e-mail, pa se korisničko ime čuva kao „<ime>@alutim012.local".
 * Isto mapiranje radi i server (api/users.ts) pri pravljenju korisnika.
 */
export const LOGIN_DOMAIN = 'alutim012.local';

/** Šta korisnik ukuca (e-mail ili korisničko ime) → e-mail za Supabase. */
export function toLoginEmail(identifier: string): string {
  const v = identifier.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`;
}

/** E-mail iz naloga → ono što se prikazuje (korisničko ime bez izmišljene adrese). */
export function displayLogin(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email;
}
