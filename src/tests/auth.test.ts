import { describe, expect, it } from 'vitest';
import { loginErrorMessage } from '../services/supabase';

describe('poruke o greškama prijave', () => {
  it('prevodi poznate greške Supabase-a na srpski', () => {
    expect(loginErrorMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe('Pogrešan email ili lozinka.');
    expect(loginErrorMessage({ message: 'Email not confirmed' })).toMatch(/potvrđena/);
    expect(loginErrorMessage({ message: 'x', status: 429 })).toMatch(/Previše pokušaja/);
    expect(loginErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Nema veze/);
    expect(loginErrorMessage({ message: 'nešto drugo' })).toBe('Prijava nije uspela. Pokušajte ponovo.');
    expect(loginErrorMessage(null)).toBe('Prijava nije uspela. Pokušajte ponovo.');
  });
});
