# ALU TIM 012 — Projektovanje ograda i kapija

Demonstraciona web aplikacija za projektovanje aluminijumskih ograda i kapija. Radi potpuno lokalno
(bez servera, naloga i spoljašnjih servisa). Glavni deo je **funkcionalni 2D editor** i **sinhronizovani 3D editor**: segmenti ograde,
kapije i stubovi se slažu po trasi, a 2D crtež sa kotama (SVG) i 3D scena (Three.js) nastaju programski iz istog modela projekta.

> Svi modeli, dimenzije, cene i pravila obračuna su **ilustrativni** i ne predstavljaju specifikacije,
> cene ni normative firme ALU TIM 012.

## Pokretanje

```bash
npm install
npm run dev          # razvojni server: http://localhost:5173
npm run build        # produkcioni build (dist/)
npm run preview      # preview builda: http://localhost:4173
npm test             # unit testovi (Vitest)
npx playwright install chromium   # jednom, za E2E
npm run test:e2e     # E2E testovi (Playwright; sam pravi build i podiže preview)
```

Stek: React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, React Router, lucide-react, idb (IndexedDB),
pdfmake (PDF sa fontom Roboto), Three.js + React Three Fiber + Drei (3D, učitava se na zahtev), Vitest, Playwright.

## Prijava (Supabase) i Vercel

Prijava koristi Supabase Auth (email + lozinka). Dok nisu podešene dve promenljive okruženja, aplikacija radi bez prijave.

1. **Ključevi:** u Supabase-u, Project Settings → API, kopirajte *Project URL* i *anon public* ključ.
   Lokalno ih upišite u `.env.local` (vidi `.env.example`), a na Vercel-u u Project → Settings → Environment Variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), pa uradite Redeploy.
2. **Nalozi:** Authentication → Users → Add user (email + lozinka, štiklirati „Auto Confirm User").
3. **Zabrana samostalne registracije:** Authentication → Sign In / Providers → isključiti „Allow new users to sign up".
   Anon ključ je javan, pa bi inače svako mogao da napravi nalog.
4. `vercel.json` preusmerava sve adrese na `index.html` (React Router).
5. Test prijave sa lažnim Supabase serverom: `npm run test:e2e:auth`.

## Pregled funkcionalnosti

- **Početna** — hero, 4 funkcionalne kartice, 6 popularnih modela (klik otvara novi projekat sa modelom),
  nedavni projekti (otvori / dupliraj / obriši) i statistika izvedena iz lokalnih podataka.
- **2D editor**
  - Pogled spreda (detaljan), pogled odozgo (linijski, sa smerovima otvaranja i prostorom klizne kapije),
    tabele „Dimenzije" i „Lista materijala", **3D prikaz** i podeljeni **2D + 3D** (samo desktop).
  - Elementi: 15 kataloških modela ograde (slike iz klijentovih uzoraka), prazan otvor, 4 vrste kapija
    (pešačka, klizna, dvokrilna sa različitim krilima, jednokrilna), 4 tipa stubova.
  - Dodavanje klikom na „Dodaj" ili prevlačenjem iz kataloga (miš; na dodir preko ručke ⋮⋮ ili dugmeta),
    promena redosleda prevlačenjem ili „Pomeri levo/desno", dupliranje, brisanje, izmena širine/visine/modela/boje
    — bez dugmeta „Primeni". Indikator ubacivanja i „duh" elementa tokom prevlačenja.
  - Zajednički stubovi (n+1 stubova za n elemenata, svaki sa jedinstvenim ID-jem); razlikuju se modularna
    širina (osa–osa), svetli otvor i ukupna zauzeta dužina.
  - Režim A (automatska ukupna dužina) i B (fiksna dužina) sa upozorenjem o prekoračenju, slobodnim prostorom
    i automatskim raspoređivanjem (proporcionalno / ravnomerno; kapije se ne šire; razlog ako nije moguće).
  - Kote (ukupno, po segmentu, svetli otvor kapije, pozicije stubova, visina), mreža, oznake — mogu se
    uključiti/isključiti; izvoz SVG; zoom, fit, reset, pan (prevlačenje pozadine), Ctrl+točkić, pun ekran.
  - Undo/Redo (uzastopne izmene istog polja se spajaju), prečice: Delete, Ctrl+Z, Ctrl+Shift+Z, Esc.
  - Validacija dimenzija sa objašnjenjem (vrednost se nikad ne menja potajno).
  - Kalkulacija: spisak materijala (geometrijska vs. nabavna količina), rad, montaža, marža *ili* uvećanje,
    popust, PDV (osnovica navedena uz svaki red; bruto cene ne dupliraju PDV), izmena cena materijala u modalu.
- **Projekti** (pretraga, filter statusa, izmena, dupliranje, brisanje, JSON izvoz/uvoz sa validacijom),
  **Modeli ograda**, **Materijali i cene** (CRUD, pretraga, filter), **Kupci** (CRUD, povezani projekti),
  **Ponude** (pregled + stvarni PDF), **Proizvodnja** (PDF specifikacija, CSV lista materijala, okvirna lista
  delova), **Izveštaji**, **Podešavanja** (valuta RSD/EUR, podrazumevana kalkulacija, reset demo podataka sa potvrdom).

## 3D editor (nova iteracija)

Tab **3D prikaz** (ili **2D + 3D** na desktopu) crta pravu 3D geometriju iz istog projekta (isti `Project`, isti ID-jevi,
ista selekcija, isti panel parametara, ista kalkulacija). Nema CDN-a, HDRI-ja ni udaljenih tekstura.

- **Modeli (15, prema klijentovim uzorcima):** uske/široke/kombinovane horizontalne letvice, daske sa dekorom drveta, rukohvat sa crnim i inox prečkama,
  pun panel sa srebrnim linijama, vertikalne letvice sa zaobljenim vrhovima (uske, braon, široke), žaluzine (svetlosiva, antracit, bela), vertikalna ispuna u ramu,
  inox + staklo. Svaki model ima sliku za katalog i sopstvenu parametarsku ispunu (isti geometrijski opis za 2D, 3D i kalkulaciju). Isti modeli važe i za sve četiri vrste kapija.
  Stari modeli (horizontal, solid, vertical, lamele, decor, glass) su uklonjeni; postojeći projekti i JSON uvozi se migriraju (šema v3) na najbliži novi model; širine i visine ostaju.
  Od kojih profila se modeli prave (vertikale i horizontale prema podacima radnika, sa uzorcima i otvorenim pitanjima) piše u `docs/konstrukcija-modela.md` i na karticama na strani Modeli ograda.
  Ograničenja: slike u katalogu su vizuelne rekonstrukcije (ne fotografije); 2D/3D crtež je parametarska aproksimacija bez teksture drveta; model 15 (inox i staklo) je pretpostavka prema delimično vidljivom uzorku; 4 tipa stubova (kape, montažni detalji); različite visine; prazan otvor ostaje otvor.
- **3D modeli kapija (paket „ALU TIM 60 modela kapija", `src/assets/gates3d/*.glb`, 15 dizajna × 4 vrste):** krilo kapije u 3D uzima se iz GLB modela
  (okvir, ispuna, šarke, kvaka, točkići) i prilagođava merama projekta u `three/gateGlb.ts`: okviri i prečke se rastežu, letvice i prečke se dodaju ili uklanjaju u celim
  periodima, okovi zadržavaju meru. Otvaranje, strana i položaj krila i dalje dolaze iz projekta (`gates.ts`). Ograda i stubovi ostaju parametarski; ako GLB ne može da se učita,
  kapija se crta parametarski. Ograničenje: debljina letvice, razmak i profil rama kapije u 3D potiču iz modela (parametri „Letvica/Razmak/Ram" menjaju 2D, kalkulaciju i krojnu listu, ne i 3D kapiju).
  Mere u paketu su demonstracione, ne iz tehničke dokumentacije.
- **Kapije:** pešačka/jednokrilna (rotacija oko ose šarki, strana šarki + unutra/spolja, ručka i brava prate krilo),
  dvokrilna (jednaka i nejednaka krila), klizna (translacija duž trase, točkići, šina, motor). Kontrole: Otvori / Zatvori / Pauza,
  klizač 0–100 %, „Otvori/Zatvori sve", zone zahvata krila (mogu se isključiti). Stanje otvaranja je stanje PRIKAZA — ne menja
  cenu, undo istoriju ni čuvanje, a zaustavlja se kada se projekat izmeni.
- **Režimi:** *Pregled* (orbit levo dugme, pan desno, zoom točkić; klik bira) i *Uređivanje* (prevlačenje elementa duž trase
  sa indikatorom ubacivanja; ručke za širinu i visinu sa prikazom mere; Esc otkazuje; jedan drag/resize = jedna undo radnja).
  Dodavanje iz kataloga klikom ili prevlačenjem direktno na scenu; „Pomeri levo/desno", „Dupliraj", „Obriši" i numerička polja
  rade kao alternativa (posebno na telefonu).
- **Kamera:** izometrija, spreda, odozgo, sa strane, uklopi; kamera se pamti po projektu pri prelasku između tabova i ne resetuje se
  pri promeni boje/parametara. Pun ekran i promena veličine rade bez rastezanja.
- **Izvoz:** „3D slika" daje PNG kadra bez UI kontrola. Ako WebGL nije dostupan ili se izgubi kontekst, prikazuje se poruka sa
  „Pokušaj ponovo" i „Nastavi u 2D" (podaci se ne gube).
- **Konvencije:** 1 jedinica scene = 1000 mm; X duž trase, Y visina, Z dubina; **+Z je „spolja" (ulica)**, −Z „unutra".
  Strana šarki se gleda sa ulice. Konverzija i pivot pravila su u `src/domain/geometry/gates.ts` (čiste funkcije, pokrivene testovima).
  Zajednički opis ispune (`geometry/infill.ts`) koriste i SVG i 3D, pa su broj i položaj letvica uvek isti.
- **Klizna kapija:** opciono se zadaje raspoloživ prostor za povlačenje; ako nije dovoljan prikazuje se upozorenje (orijentaciono,
  nije sertifikovana provera). Dužina šine/kontra-tega se NE proračunava.

## Šta je ispravljeno u ovoj iteraciji (D1–D5)

| # | Problem | Uzrok | Status |
|---|---------|-------|--------|
| D1 | Prazan projekat je imao usamljen stub; uputstvo odsečeno | `createProject` je uvek pravio `n+1` stubova (i za n=0); poruka je bila SVG tekst u `viewBox`-u | **Ispravljeno.** Prazan projekat nema stubova (invarijanta: 0 stubova za 0 elemenata, inače n+1); prvi element dodaje 2 granična stuba, poslednji obrisan ih uklanja. Uputstvo je HTML sloj preko platna. Radi u 2D/3D, uz undo/redo i ponovno otvaranje. |
| D2 | „Novi projekat" 0,0 m sa 5.356 RSD materijala | Fantomski stub iz D1 ulazio u BOM | **Ispravljeno u domenu** (ne u tabeli izveštaja): prazan projekat daje praznu listu i cenu 0 u editoru, kalkulaciji, ponudi, proizvodnji i izveštajima. |
| D3 | Minijature neupotrebljive | Razmak oko crteža računat u px/skali, pa je pri maloj skali geometrija bila sitna | **Ispravljeno.** `compact` režim: ravnomeran prostor u mm, fiksan odnos stranica, uklopljeno bez rastezanja; lagan SVG bez 3D-a. |
| D4 | Kalkulacija skriva iznose, tri zone skrola | Tabela sa `min-w` + unutrašnji `max-h` skrol | **Ispravljeno.** Jedna zona skrola (telo modala), zaglavlje i podnožje fiksni, ukupni iznos u podnožju, tabela bez horizontalnog skrola, fokus ulazi u dijalog/vraća se. Formule nisu menjane. |
| D5 | Panel selektovanog elementa nije vidljiv | Ispod 1280 px panel je bio ispod sadržaja iza dugmeta | **Ispravljeno.** Izabrani element je na vrhu panela (sa tipom i ID-jem); na užim ekranima klik otvara fioku (desno/dole) sa zatvaranjem. Dijalog „Primeni na izabrani segment" prikazuje projekat i segment ili objašnjava šta treba izabrati. |

Promene ponašanja: posle Undo/Redo selekcija ostaje ako element i dalje postoji (ranije se brisala); šema projekta je **v2**
(`migrateProject` pri učitavanju iz IndexedDB-a i JSON uvozu; stari projekti se otvaraju bez gubitka podataka).
Samostalni (ručno dodati) stubovi nisu postojali u prethodnoj verziji i nisu uvedeni; modelovanje ostaje „n+1 granični stubovi".

## Čuvanje podataka

Sve se čuva u **IndexedDB** (`alu-tim-012`: projekti, kupci, materijali, podešavanja). Izmene se upisuju
automatski sa debounce-om od 500 ms; indikator prikazuje „Čuvanje...", „Sačuvano" (tek kad je transakcija
zaista završena) ili „Greška pri čuvanju". Demonstracioni podaci se kreiraju samo pri prvom pokretanju
(zastavica `seeded`) i ne pregaze postojeće podatke. „Reset demonstracionih podataka" traži potvrdu.

## Arhitektura

`src/domain` (čiste funkcije bez UI-ja: `geometry`, `pricing`, `validation`, `models`) · `src/store` (Zustand) ·
`src/db` + `src/services` (IndexedDB, autosave, PDF/izvoz) · `src/components` (`editor`, `fences`, `gates`,
`forms`, `layout`, `ui`) · `src/pages` · `src/data` (demo podaci, cenovnik) · `src/tests` (Vitest) · `e2e` (Playwright).
Pravila obračuna su u `src/domain/pricing/rules.ts`, granice dimenzija u `src/domain/validation/limits.ts`.
Prevlačenje je implementirano sopstvenim hook-om nad Pointer Events (`useDragController`) umesto dnd-kit-a,
jer isti mehanizam mora da radi nad SVG crtežom sa preračunavanjem u milimetre i za miš i za dodir.

## Demonstracione pretpostavke

- Širina elementa = **modularni raspon osa–osa stubova**; svetli otvor = raspon − po pola širine susednih stubova.
  Primer: 2000 + 2000 + 4000 + 1000 + 2000 = **11000 mm** modularne dužine.
- „Otvaranje" kapije: za krilne kapije označava stranu šarki, za kliznu smer klizanja.
- Profili, šifre, cene, otpad, marža (25%), popust (10%), PDV (20%), cena rada i montaže su ilustrativni.
- Min/max dimenzije su demonstracione (npr. ograda 500–4000 mm, pešačka kapija 700–1500 mm).
- Fotografija za „ALU Vertikal 01" nije dostavljena — prikazuje se generisana SVG ilustracija.
- Lista delova u proizvodnji je okvirna geometrijska specifikacija bez optimizacije sečenja.
- U ponudi nema PIB-a, matičnog broja ni bankovnog računa jer stvarni podaci firme nisu uneti.

## Poznata ograničenja

- Nema AR-a, backend-a, naloga, višekorisničkog rada ni stvarnih proizvodnih normativa. 3D slika se ne ubacuje u PDF ponudu.
- Samo pravolinijska trasa. Dužina šine/kontra-tega klizne kapije se ne proračunava (samo upozorenje).
- Pogled odozgo je pojednostavljen (linijski), prikazuje zone ali ne animira otvaranje kapija (animacija je u 3D prikazu).
- 3D: nema detekcije kolizija ni potvrde bezbednosti; debljine, zazori i okovi su vizuelne pretpostavke koje ne utiču na obračun.
- PDF crtež se rasterizuje (PNG) i koristi sistemski sans font za oznake.
- JS paket je velik (pdfmake + font Roboto, učitavaju se tek pri prvom izvozu PDF-a).
- Vizuelna provera (screenshot-ovi, poređenje sa referentnim slikama) **nije rađena** jer korisnik to proverava sam u pregledaču;
  ponašanje je proveravano automatskim testovima. Snimak `alutim.mp4` nije mogao biti otvoren u ovom okruženju — problemi D1–D5
  uzeti su iz opisa u zadatku i potvrđeni u kodu/testovima.
- Samostalni stubovi (bez susednih elemenata) i teren/uglovi nisu podržani.

## Rezultati testova (poslednje pokretanje)

- Početno stanje pre izmena: `npm test` 29/29 (pokrenuto), E2E 7/7 (rezultat prethodne iteracije).
- `npm test` — **45/45** unit testova (domen, migracija v1→v2, prazan projekat, pivot/smerovi svih kapija, zajednička geometrija 2D/3D,
  view-store animacije, redosled autosave upisa, IndexedDB).
- `npm run test:e2e` — **21/21** Playwright scenarija (desktop 1440×900 + dodatno 1366×768, 1100×800, 1460×1308; mobilni 390×844 sa dodirom):
  glavni tok iz prethodne iteracije, prazan projekat, 3D crtanje (proverava se broj boja u renderovanom kadru, ne samo `<canvas>`),
  klik na objekat u 3D → isti panel, izmena iz panela, drag redosleda sa Esc otkazivanjem, ručka za širinu + jedan undo, prevlačenje iz kataloga u 3D,
  sve 4 kapije 0→100→0 bez uticaja na cenu, upozorenje za klizanje, PNG izvoz (potpis, dimenzije), nedostupan WebGL → nastavak u 2D,
  minijature, kalkulacija bez horizontalnog skrola, vidljivost panela, JSON/PDF/CSV/SVG, bez JS grešaka.
- `npm run build` — bez grešaka (3D je zaseban chunk ≈ 960 kB / 256 kB gzip, učitava se tek na prvom otvaranju 3D prikaza).
- Performanse (headless Chromium sa softverskim renderovanjem na Windows 11 — **nije pravi GPU**): projekat sa 100 segmenata:
  prvi kadar ≈ 0,5 s, 1205 draw call-ova, ≈ 82 hiljade trouglova, ≈ 43 kadra/s pri orbitu. Na pravom GPU-u očekuje se bolje, ali nije mereno.
- Test hook: `window.__aluTest` (pick, snapshot, screenPointOf, stats) postoji samo da E2E testovi mogu da pogode stvarne 3D objekte.

## Predloženi sledeći koraci

1. Prikupiti stvarne profile, okove, cenovnik i pravila montaže od ALU TIM 012 i zameniti demo podatke.
2. Podrška za kosine/stepenaste terene i trasu sa uglovima (tlocrt kao glavni prikaz).
3. Optimizacija sečenja standardnih šipki i proizvodni nalozi.
4. Backend sa nalozima i sinhronizacijom (arhitektura je razdvojena za to); opciona 3D vizualizacija u PDF ponudi; spajanje geometrije radi manjeg broja draw call-ova.
5. Dodatni E2E testovi za dodir i prevlačenje iz kataloga na telefonu.
