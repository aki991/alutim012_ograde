# Korisnici: prijava, uloge i nalozi

Ograde i Stolarija koriste **isti Supabase projekat, iste naloge i iste uloge**. Ograde nema svoj sistem uloga: sve što se promeni u jednoj aplikaciji važi i u drugoj.

## Uloge

| Uloga | Gde se čuva | Šta može u Ogradama |
| --- | --- | --- |
| **Administrator** | `field_team_private.app_admins` (postavlja se samo u bazi) | sve što i šef; menja i stvarnu e-mail adresu naloga |
| **Šef** | `public.field_team_members.role = 'manager'` | ekran **Podešavanja → Nalozi zaposlenih**: pravi naloge šefova i majstora i postavlja im početnu lozinku, menja ime i korisničko ime, briše naloge |
| **Majstor** | `public.field_team_members.role = 'worker'` | radi u aplikaciji; ne vidi ekran naloga; ime mu menja šef |

Svako (šef i majstor) menja **svoju** lozinku u **Podešavanja → Firma i korisnik → Promeni lozinku** (traži trenutnu lozinku). Nova lozinka važi i u Stolariji. Lozinke se u bazi čuvaju samo kao heš, pa ih niko (ni administrator) ne može da vidi.

## Kako radi u kodu

- Uloga i ime: RPC `field_team_my_profile` (`src/services/teamAccounts.ts`, `src/services/auth.tsx`). Poslednji profil se pamti na uređaju, pa uloga važi i bez interneta.
- Spisak naloga: RPC `field_team_list_accounts`.
- Pravljenje (`create`), dodela uloge postojećem nalogu (`link`), izmena profila (`update`) i brisanje (`delete`): Edge Function **`field-team-accounts`** iz repozitorijuma Stolarije (`supabase/functions/field-team-accounts`). Funkcija proverava ulogu pozivaoca u bazi pre svake izmene.
- Promena sopstvene lozinke: isti postupak kao u Stolariji (provera trenutne lozinke zasebnom prijavom, pa `updateUser`).
- Prijava: korisničko ime se pretvara u `<ime>@alutim012.local` (`src/services/loginName.ts`), isto kao u Stolariji.

Raniji sistem Ograda (`app_metadata.role` + serverska funkcija `api/users.ts`) je uklonjen.

## Podešavanje

Tabele, RLS i funkcija postoje u bazi iz migracija Stolarije (`supabase/migrations/2026111*_team_*.sql` u repozitorijumu Stolarije) i objavljene funkcije `field-team-accounts`. Ograde u bazi ništa ne dodaje. Nalog bez reda u `field_team_members` može da se prijavi, ali nema ulogu; šef mu je dodeljuje kroz **Postojeći nalog**.

## Ograničenja

- Ekran naloga radi samo uz internet.
- Administratora briše i menja samo administrator; sopstveni nalog se ne može obrisati.
- Brisanjem naloga korisnik više ne može da se prijavi ni u jednu aplikaciju.
- Korisničko ime: 3–32 znaka, mala slova, brojevi, tačka, crtica i donja crta.
- Podaci Ograda (projekti, kupci, materijali, modeli, magacin, podešavanja) su u tabelama `ograde_*` (`supabase/migrations/202611160001_ograde_sync.sql`, sinhronizacija `src/services/cloudSync.ts`).
