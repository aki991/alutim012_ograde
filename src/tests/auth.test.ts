import { describe, expect, it } from 'vitest';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { isOfflineAuthFailure, loginErrorMessage, parseStoredSession } from '../services/supabase';

describe('poruke o greškama prijave', () => {
  it('prevodi poznate greške Supabase-a na srpski', () => {
    expect(loginErrorMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe('Pogrešno korisničko ime, e-mail ili lozinka.');
    expect(loginErrorMessage({ message: 'Email not confirmed' })).toMatch(/potvrđena/);
    expect(loginErrorMessage({ message: 'x', status: 429 })).toMatch(/Previše pokušaja/);
    expect(loginErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Nema veze/);
    expect(loginErrorMessage({ message: 'nešto drugo' })).toBe('Prijava nije uspela. Pokušajte ponovo.');
    expect(loginErrorMessage(null)).toBe('Prijava nije uspela. Pokušajte ponovo.');
  });
});

import { initialsOf } from '../utils/units';
describe('inicijali', () => {
  it('ime i prezime → dva slova; jedna reč ili email → prva dva slova bez brojeva', () => {
    expect(initialsOf('Andreja Milenković')).toBe('AM');
    expect(initialsOf('nikola đorđević')).toBe('NĐ');
    expect(initialsOf('andrejamilenkovic991')).toBe('AN');
    expect(initialsOf('andreja.milenkovic')).toBe('AM');
    expect(initialsOf('')).toBe('');
  });
});

describe('prijava bez interneta', () => {
  it('sačuvana sesija se čita i kad je token istekao; neispravan zapis daje null', () => {
    const raw = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } });
    expect(parseStoredSession(raw)?.user.id).toBe('u1');
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession('{neispravno')).toBeNull();
    expect(parseStoredSession(JSON.stringify({ access_token: 'a' }))).toBeNull();
  });

  it('poslednja prijava ostaje samo kad obnova ne uspe zbog veze', () => {
    expect(isOfflineAuthFailure(null, false)).toBe(true);
    expect(isOfflineAuthFailure(new AuthRetryableFetchError('Failed to fetch', 0), true)).toBe(true);
    expect(isOfflineAuthFailure(null, true)).toBe(false);
    expect(isOfflineAuthFailure(new Error('Invalid Refresh Token'), true)).toBe(false);
  });
});
