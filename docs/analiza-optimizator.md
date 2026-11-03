# Analiza programa OPTIMIZATOR (optimizator.rs) i predlog za aplikaciju za ograde

Cilj: radnici koji rade u Optimizatoru treba lako da se snađu u aplikaciji za ograde i kapije. Ne kopira se izgled, nego **nazivi, redosled rada i sadržaj dokumenata**.

## 1. Šta je analizirano

- Stranica programa, stranica „Softver za krojne liste", stranica „Uputstva".
- 12 snimaka ekrana programa i 15 primera štampanih izveštaja sa sajta.
- Uputstvo za štampu (PDF, 15 strana) i arhiva primera izveštaja (15 PDF-ova), oba javna sa stranice Preuzimanja.
- Nije pregledano: video prezentacija (ZIP, oko 50 MB) i PDF „referenca".

Napomena: primeri su iz 2011. godine, a firma i podaci na njima su probni (Total profil, kupac Genex). Program je za **prozore i vrata**, pa se deo sadržaja (štok, krilo, okov, roletne) ne odnosi na ograde. Samo dokumenti i način rada su koristan uzor.

## 2. Šta je Optimizator

- Desktop program (Windows), na srpskom, nastao 2003. Prodaje se jednokratno, bez pretplate. Podržava obuku i podršku.
- Radi sa bazom profila i okova različitih proizvođača, sa više od 200 gotovih crteža pozicija.
- Cilj programa: od zadatih mera dobiti **ponudu, cenu, krojnu listu, sastavnice, trebovanje materijala i račun**.
- Opciono: magacin (lager, prijemnice), evidencija reslova (ostataka šipki) i narudžbenice po stanju magacina.
- Sadrži „Backup" (kompletno čuvanje stanja programa).

### Glavni meni (12 dugmadi, bez podmenija)

| Red | Dugmad |
|---|---|
| 1 | Prijemnice · Pregled magacina · Otpaci |
| 2 | Grupe materijala · Grupe aps. šabl. · Grupe šablona |
| 3 | Materijali · Apstraktni šabloni · Šabloni |
| 4 | **Ponude** · **Proračun** · Nivelacija cena |
| 5 | Backup · Komintenti (kupci) · Podaci o preduzeću |
| 6 | Serije · Repro-materijal |

Ceo program je jedan ravan meni sa velikim dugmadima. Svaki ekran je poseban prozor sa tabelom, poljima za unos i dugmadima sa desne strane.

## 3. Tok rada (kako radnik radi)

1. **Priprema (jednom):** materijali sa cenama i dužinom šipke, serije profila, apstraktni šabloni (crteži sa kotama A, B, C…), pa **konkretizacija**: apstraktnom crtežu se dodele konkretni profili, okov i način otvaranja. Nastaje „šablon" proizvoda.
2. **Ponude (unos pozicija):** izbor serije i grupe (npr. Roplasto 7K → Prozori), klik na šablon, unos mera (A, B, C…) i broja komada, dugme **Unesi**. Ponavlja se za svaku poziciju, a na kraju **Unesi narudžbinu**.
3. **Proračun:** izbor kupca, naziv lista („Ponuda"), broj ponude (npr. 22/2011), gornja i donja napomena. U tabeli su sve pozicije sa cenama.
4. **Izveštaji** iz istog ekrana (dugmad desno): Ponuda, Račun-otpremnica, Pregled isečenog materijala, Krojne liste, Okov ponaosob, Okov total, **Trebovanje**, **Štampaj sve sastavnice**, Sa krilima, Izveštaj sa cenama, Sastavnica po poziciji.
5. **Krojne liste:** tabela svih šipkastih materijala, desni klik na materijal otvara njegovu optimizaciju. Dugmad: *Preoptimizuj* (uz opciju „koristi otpatke") i *Štampaj sve*.
6. **Trebovanje materijala:** zbir po vrstama (Profilni materijali, Gume, Popune, Ostalo bez okova, Okov pojedinačno, Okov po falcnim merama). Dugmad „Trebovati sve bez obzira na stanje magacina" i „Trebovati obzirom na stanje magacina", pa **REALIZUJ (magacin, reslovi, obrada)**. Količina se po stavci može ručno korigovati (kolona „Za nar.").
7. **Račun / otpremnica** i **statistika sečenja**.

Važno: u javnim materijalima **ne postoji dokument zvani „radni nalog"**. Ulogu radnog naloga u radionici imaju krojne liste + sastavnice po pozicijama + trebovanje. Pravi radni nalog firme (ako ga ima) treba da pošalješ ti (vidi 7).

## 4. Dokumenti: kako izgledaju i šta sadrže

Svi dokumenti su A4, crno-beli, jednostavni, tabelarni. Zajedničko: na vrhu logotip i podaci firme (PIB, matični broj, adresa, telefon), pa naslov dokumenta, broj ponude, datum i kupac.

| Dokument | Sadržaj |
|---|---|
| **Ponuda** | Zaglavlje firme, datum, okvir sa kupcem (naziv, adresa, PIB), „Ponuda br. 21/2011". Tabela pozicija: crtež sa kotama levo; naziv pozicije, kratak opis (štok, krilo, staklo, okov) u sredini; Kom., Cena, Rabat, Ukupno desno. Ispod: cena, rabat, cena sa rabatom, PDV, **Ukupno**, linije „Kupac" i „Izvođač". |
| **Sastavnice po pozicijama** | Svaka pozicija: crtež sa merama, broj komada i spisak profila sa dužinama i brojem komada u obliku „1175 x 4 · 640 x 2". |
| **Detaljna sastavnica jedne pozicije** | Crtež sa slovima (A), (B), (C)… na svakom delu. Ispod spisak: slovo, šifra, naziv profila i dužine u obliku „2500 x 2 · 1350 x 1". Sa strane okov, zavrtnji i sitan materijal u kom. |
| **Izveštaj sa cenama (po poziciji)** | Za svaki materijal: naziv, dužine, „metri × cena = iznos". Na dnu cela formula u jednoj liniji: `122.01+58.07%+117.60=310.46+2.66=313.12-1.00%=309.99+18.00%=365.79x4=1463.16` (nabavna cena + provizija + roletna + troškovi − rabat + PDV × komada). |
| **Krojna lista** | Po profilu: naslov (šifra i naziv), **L šipke**, **širina testere**, broj ponude, kupac, mali presek profila. Zatim po jedna **traka za svaku šipku**: komadi u redosledu sečenja sa dužinom iznad, **brojem pozicije** ispod, oznakom ugla na krajevima (45, 45/45, 90) i **ostatkom** u mm desno. |
| **Trebovanje profila (po dobavljaču)** | Tabela: R.b., Naziv, J.m., L šipke, Kom. (npr. „šipka 6500m — 9"). |
| **Trebovanje popune (staklo, paneli)** | Po artiklu: širina, visina, komada, kvadrata, sa zbirom. |
| **Trebovanje okova** | Po tipu otvaranja i falcnim merama (širina, visina, komada), ili zbirno: R.b., naziv, količina. |
| **Isečen materijal** | Grupisano: Štokovi, Krila, Kit lajsne, Parapeti, Okapnice, Pragovi, Ojačanja, Popune. Kolone: Dužina, Visina, Komada, Pozicija, Dobavljač, Metri, Suma, Cena, sa zbirom po grupi. |
| **Lager lista, Prijemnica, Otpremnica / Faktura** | Tabele: R.b., Naziv, Grupa, Dobavljač, J.m., Dim., Kom., Cena. Račun: osnovica, PDV, ukupno, „slovima", linije za potpis. |

Ekrani programa:
- **Materijali:** prozor sa poljima (naziv, grupa, proizvođač, tip materijala: štok / krilo / T-profil / lajsna / parapet / okapnica / prag / ojačanje…, cena po m, kg/m, **dužina šipke 6000**, otpadak), uz **sliku preseka profila** sa kotama.
- **Šabloni:** tabela delova sa **formulama** (npr. `(B-41)-(41)+4`, `(C-8)/2-41`), količinama i uglovima sečenja.
- **Proračun:** tabela pozicija sa kolonama Ef.cen., Cena/m², Provizija, Cena 1–3, Rabat, Total i zbirom.

## 5. Pojmovi koje radnici već znaju

Pozicija · komada · serija · grupa · šablon · konkretizacija · proračun · ponuda · narudžbina · sastavnica · krojna lista · trebovanje · reslovi (ostaci šipki) · otpaci · nivelacija cena · provizija · rabat · prijemnica · otpremnica · lager lista · komitent · okov · popuna · šipka · testera · ger/ugao.

Osim „provizija" (zarada na cenu) i nekoliko oznaka, ovi pojmovi se mogu preuzeti u istom obliku.

## 6. Poređenje sa našom aplikacijom (ograde)

Šta već ima:
- Ponuda u PDF-u sa pregledom pre čuvanja, kalkulacija sa maržom/uvećanjem, popustom i PDV-om.
- Cenovnik sa uvozom/izvozom, crtežima preseka profila i izvozom.
- Proizvodna specifikacija (PDF/CSV), a za modele 04 i 08 sastavnica, krojna lista i **raspored na šipke sa ostatkom**.
- Specifikacija modela sa **formulama** (sličan princip kao „šabloni" u Optimizatoru).

Šta nedostaje u odnosu na Optimizator:
- Optimizacija sečenja postoji samo za modele 04 i 08. Za ostale piše da je lista „okvirna" i bez optimizacije.
- Nema širine testere ni uglova sečenja na krojnoj listi, ni oznake pozicije komada.
- Nema trebovanja po dobavljaču ni popune (paneli) i okova kao zasebnih lista.
- Nema sastavnice po poziciji sa slovima (A), (B)… na crtežu.
- Nema formule cene po poziciji, računanja cene „unazad" (zadata ukupna cena), ni promene cena grupe u procentima (nivelacija).
- Nema magacina, prijemnica, reslova i otpremnice/računa.

## 7. Predlog šta da radimo (po prioritetu)

**Faza 1: dokumenta koja radnici koriste svaki dan** (najviše uticaja, bez promene izgleda)
1. **Krojna lista** za sve modele, istog oblika: po profilu naslov, dužina šipke, širina testere, broj ponude i kupac; zatim trake šipki sa komadima, **brojem pozicije**, uglovima i **ostatkom**. Prvo nad postojećim algoritmom za modele 04 i 08, pa za sve.
2. **Sastavnica po poziciji**: crtež elementa sa slovima delova, ispod spisak „šifra, naziv, dužina × komada", a sa strane okov i sitan materijal.
3. **Trebovanje po dobavljaču** (R.b., naziv, J.m., L šipke, Kom.) uz posebne liste za popune (panele/letvice) i okov (brave, šarke, automatika).
4. **Radni nalog ograde** (naš dokument, jer ga Optimizator nema): naslov, kupac, rok, status, spisak pozicija sa crtežom i merama, uz sastavnicu i krojnu listu. Treba nam pravi uzorak od vas.

**Faza 2: cene**
5. Izveštaj cene po poziciji sa formulom u jednoj liniji (nabavna + marža + troškovi − rabat + PDV × komada).
6. Računanje cene unazad (zadajem ukupnu cenu, program razvrstava maržu po pozicijama).
7. „Nivelacija cena": promena cena grupe materijala za procenat.

**Faza 3: magacin** (veći posao, ako je potreban)
8. Lager lista, prijemnica, evidencija ostataka šipki (reslovi) i „preoptimizuj sa otpacima", trebovanje po stanju magacina, otpremnica/račun.

**Pojmovi u aplikaciji:** uskladiti nazive: Pozicija, Komada, Sastavnica, Krojna lista, Trebovanje, Reslovi, Prijemnica, Otpremnica. Na stranici Proizvodnja postaviti dugmad istim redosledom kao u meniju Proračun (Ponuda, Krojne liste, Sastavnice, Trebovanje).

## 8. Šta mi treba od vas

- Pravi **radni nalog i krojna lista** iz firme (slika ili PDF). Javni primeri su iz 2011.
- Dužine šipki, širina testere (mm) i uglovi koji se koriste za ograde i kapije.
- Da li se u radionici koristi **magacin i reslovi** u Optimizatoru. Ako ne, Faza 3 otpada.
- Da li radnici štampaju sve dokumente ili neke rade na ekranu (npr. krojna lista na računaru kraj testere).
