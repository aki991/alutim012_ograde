# Korisnici: prijava i pravljenje naloga

## Kako radi

- **Prijava:** prvo polje prima **e-mail ili korisničko ime** (npr. `petar.petrovic`), pa lozinku.
- **Korisničko ime** Supabase Auth ne poznaje (traži e-mail), pa se čuva kao e-mail sa izmišljenom adresom: `petar.petrovic@alutim012.local`. Aplikacija to radi sama pri prijavi i prikazu; korisnik i administrator vide samo `petar.petrovic`.
- **Administrator** (uloga `admin`) u **Podešavanjima → Korisnici** vidi spisak naloga, pravi nove, menja ih i briše (korisničko ime ili e-mail, ime i prezime, lozinka od najmanje 8 znakova). Novi korisnik odmah može da se prijavi tim podacima.
- **Ostali korisnici** nemaju ulogu (prazno): ne vide odeljak Korisnici.
- Nalozi se prave na serveru (`api/users.ts`), jer to traži tajni `service_role` ključ koji ne sme u pregledač. Funkcija proverava da je pozivalac prijavljen i da ima ulogu `admin` (iz njegovog tokena), pa tek onda radi.

## Podešavanje (jednom)

1. **Administrator u bazi.** U Supabase **SQL Editor** pokrenuti:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
   where email = 'andrejamilenkovic991@gmail.com';

   -- provera: ko ima koju ulogu (ostali ostaju bez uloge)
   select email, raw_app_meta_data ->> 'role' as uloga from auth.users order by created_at;
   ```

   Posle toga se administrator odjavi i ponovo prijavi, da nova uloga stigne u aplikaciju.

2. **Tajni ključ na Vercel-u.** Supabase → Project Settings → API → **service_role** (tajni) ključ. Na Vercel-u: Project → Settings → Environment Variables, dodati `SUPABASE_SERVICE_ROLE_KEY` (bez `VITE_` na početku, označiti kao **Sensitive**), za Production (i Preview). Zatim **Redeploy**. `VITE_SUPABASE_URL` se koristi i na serveru; ništa drugo se ne dodaje.

3. **Ne stavljati** `service_role` ključ u `.env.local` sa prefiksom `VITE_` niti ga slati ikome: ko ga ima, može sve u bazi.

## Ograničenja

- Lokalno (`npm run dev`) serverske funkcije ne rade, pa odeljak Korisnici prikazuje grešku; radi na Vercel-u (ili uz `vercel dev`).
- **Izmena** (dugme „Izmeni"): ime i prezime, korisničko ime ili e-mail, nova lozinka (prazno = ostaje ista) i uloga administratora. **Brisanje** traži potvrdu. Zaštite: administrator ne može da obriše sebe, sebi oduzme ulogu ni promeni sopstvenu prijavu (lozinku može), a poslednji administrator se ne može obrisati ni degradirati.
- Brisanjem naloga korisnik više ne može da se prijavi, ali projekti i kupci u njegovom pregledaču ostaju tamo.
- Korisničko ime: 3–32 znaka, mala slova, brojevi, tačka, crtica i donja crta.
- Podaci (projekti, kupci, cenovnik) i dalje žive u pregledaču; nalog samo kontroliše ulaz u aplikaciju.
