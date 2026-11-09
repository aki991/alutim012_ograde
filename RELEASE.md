# Objavljivanje desktop verzije (Electron)

Aplikacija se pakuje u Windows instaler (NSIS) i objavljuje na GitHub Releases
(`aki991/alutim012_ograde`). Instalirane aplikacije same proveravaju da li postoji nova verzija
(pri pokretanju i na svaka 4 sata), preuzimaju je u pozadini i prikažu baner
„Dostupna je nova verzija X.X.X“.

## 1. Podešavanje GH_TOKEN (jednom)

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → *Generate new token*.
2. Označi dozvolu **`repo`** (za javni repozitorijum je dovoljno `public_repo`). Kopiraj token.
3. U PowerShell-u, za trenutni prozor:

   ```powershell
   $env:GH_TOKEN = "ghp_tvoj_token"
   ```

   Ili trajno (novi prozori):

   ```powershell
   setx GH_TOKEN "ghp_tvoj_token"
   ```

Token nikada ne stavljaj u repozitorijum (nije u `.env.example` ni u kodu).

> Ako je repozitorijum **privatan**, instalirana aplikacija ne može da preuzme ažuriranja bez tokena.
> Najlakše rešenje je javni repozitorijum samo za izdanja ili poseban javni repozitorijum za Releases
> (promeni `owner`/`repo` u `build.publish` u `package.json`).

## 2. Adresa servera za /api

Prijava, upravljanje korisnicima i „Specifikacije sa terena“ koriste serverske funkcije na Vercelu.
U desktop aplikaciji se te pozive prosleđuju na adresu upisanu u `electron/config.json`:

```json
{ "apiOrigin": "https://tvoj-projekat.vercel.app" }
```

Dok je `apiOrigin` prazan, ti delovi ne rade u desktop verziji.
Supabase ključevi (`VITE_SUPABASE_*`) se ugrađuju pri build-u iz `.env.local`, zato ga popuni pre build-a.

## 3. Nova verzija i objava

1. Povećaj verziju u `package.json` (mora biti veća od prethodne):

   ```powershell
   npm version patch --no-git-tag-version   # 0.1.0 -> 0.1.1  (minor / major za veće izmene)
   ```

2. Commit izmene (po želji i tag).
3. Objavi:

   ```powershell
   npm run release
   ```

   Ovo radi `tsc` + `vite build`, pravi instaler i otprema ga na GitHub Releases kao **draft**
   (fajlovi: `ALU TIM 012 Ograde Setup X.X.X.exe`, `.blockmap`, `latest.yml`).
4. Na GitHub-u otvori *Releases*, nađi draft i klikni **Publish release**.
   Dok nije objavljen (nije draft), korisnici ne dobijaju ažuriranje.

Lokalni instaler bez objave: `npm run electron:build` (izlaz je u folderu `release/`).
Razvoj sa hot reloadom: `npm run electron:dev`.

## 4. Testiranje ažuriranja

1. Postavi verziju npr. `0.1.1`, uradi `npm run release`, objavi release (korak 3) i instaliraj taj
   `Setup` fajl na računar. Pokreni aplikaciju (u Podešavanjima piše „Verzija aplikacije: 0.1.1“).
2. Povećaj verziju na `0.1.2`, ponovo `npm run release` i **Publish release** na GitHub-u.
3. Pokreni (ili ostavi otvorenu) staru instaliranu aplikaciju. Posle nekoliko trenutaka (provera pri
   pokretanju ili najviše 4 sata) u donjem desnom uglu se pojavi baner
   „Dostupna je nova verzija 0.1.2“.
4. **Restartuj i ažuriraj** odmah instalira novu verziju; **Kasnije** sakriva baner, a ažuriranje se
   instalira pri sledećem zatvaranju aplikacije.

Greške pri proveri (npr. nema interneta) se ne prikazuju; upisuju se u
`%APPDATA%\ALU TIM 012 Ograde\main.log`.

## Napomene

- Podaci (IndexedDB/localStorage) se čuvaju pod stabilnim izvorom `app://app`, pa ostaju sačuvani
  između verzija. Podaci iz veb verzije (Vercel) su odvojeni i ne prenose se automatski.
- Instaler nije potpisan sertifikatom, pa Windows SmartScreen može prikazati upozorenje
  („Više informacija“ → „Svejedno pokreni“).
- Veb verzija na Vercelu ostaje PWA kao do sada.
