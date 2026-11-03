# Specifikacije sa terena (aplikacija za stolare → ova aplikacija)

Aplikacija za radnike na terenu (stolari) šalje specifikaciju u **isti Supabase projekat**. Ova aplikacija je prikazuje u zvončiću kao obaveštenje i otvara PDF.

## Šta je u bazi (podatak druge aplikacije)

- Tabela `public.field_specifications`: jedan red = jedna pristigla specifikacija (`id`, `created_at`, `status`, `customer_name`, `technician`, `position_count`, `total_amount`, `currency`, `has_unpriced`, `bucket_id`, `storage_path`, `file_name`, `file_size`, …).
- Privatni bucket `field-specifications`, putanja `<id>/specifikacija.pdf`.
- `anon` i `authenticated` nemaju pristup tabeli ni bucketu, pa se čita samo preko servera.

## Kako radi ovde

- **Serverska funkcija** `api/field-specs.ts` (isti tajni ključ `SUPABASE_SERVICE_ROLE_KEY` kao za korisnike, ništa novo za podešavanje):
  - `GET /api/field-specs` → spisak (najnovije prvo, do 50), bez putanje u Storage-u;
  - `GET /api/field-specs?id=<uuid>` → dva privremena linka (pregled i preuzimanje, važe 120 s).
  - Pozivalac mora biti prijavljen korisnik aplikacije (token se proverava na serveru).
- **Zvončić** u zaglavlju: broj nepročitanih na zvončiću; lista (kupac, majstor, broj pozicija, okvirna cena, vreme, status). Klik na stavku otvara specifikaciju: podaci i PDF u prozoru, dugme **Preuzmi PDF**.
- **Provera:** pri otvaranju aplikacije, na svakih 60 s dok je prozor vidljiv, kad se prozor vrati u fokus i kad se otvori zvončić. (Realtime obaveštenja i push za zatvorenu aplikaciju nisu uvedeni.)
- **Pročitano:** pamti se po korisniku u ovom pregledaču (`localStorage`). Na novom pregledaču su sve postojeće specifikacije nepročitane; „Označi sve kao pročitano" ih utiša. Status u bazi (`received`, `processing`, `processed`, `rejected`) se samo prikazuje; aplikacija ga ne menja.
- PDF se učitava u pregledaču i prikazuje iz lokalnog objekta (direktan link iz Storage-a ne može u okvir zbog zaštite koju Supabase postavlja). Ako učitavanje ne uspe, ostaje dugme za preuzimanje.
- Bez prijave (aplikacija bez Supabase-a, ili gost) nema provere, a zvončić kaže „Nema obaveštenja".

## Ograničenja

- Svaki prijavljeni korisnik ove aplikacije vidi sve specifikacije (nema odvojenih ovlašćenja).
- Lokalno (`npm run dev`) serverske funkcije ne rade, pa zvončić kaže da provera nije uspela; radi na Vercel-u.
- Redovi u tabeli bez PDF-a (prekinuto slanje) se ne prikazuju ako nemaju red; red bez `storage_path` se otvara sa greškom „nema sačuvan PDF".
