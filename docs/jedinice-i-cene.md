# Jedinice mere i preračunavanje cena

Pregled i provera: 18.11.2026. Cenovnik Ekoluke, definicije materijala ugrađenih modela i katalog za terase pregledani su zajedno. Brojevi ispod odnose se na lokalne izvore projekta; korisnički sačuvani katalog proverava se istim pravilima pri učitavanju, uvozu i izmeni.

Pregledano 295 zapisa, odnosno 283 različitih šifara. U lokalnim izvorima 0 fizičkih jedinica zahtevalo je ispravku. Ranije je problem bio i to što je svaki red nudio svih pet jedinica, čak i bez mogućnosti preračuna cene.

## Pravila

- Cevi, profili, lamele, lajsne i trake: m; kg se nudi kada postoji odgovarajuća masa. Komad cele šipke se nudi samo kada je poznata njena dužina.
- Lim, ploče i staklo: m². Komad se nudi kada su poznate mere cele ploče. Kg se nudi za ploče koje imaju podatak o masi; staklo ostaje bez kg jer je iz obračuna mase izuzeto.
- Kape, rozetne, završeci, stope i spojni delovi: kom; kg kada je poznata/procenjena masa konkretnog komada. Ne nude se m ili m².
- Setovi: set; kom samo kada je poznat broj delova, npr. levi i desni = 2. Kg se nudi kada se masa odnosi na ceo set.
- Brave, kvake, šarke, cilindri, automatika i sličan okov: kom ili odgovarajući set. Ne nude se kg bez mase, niti m i m².
- Nosač stakla nije staklena ploča, flanša sa pločom nije lim, a U profil za staklo ostaje profil.
- Kod starih besmislenih jedinica naziv/vrsta određuju ispravnu fizičku jedinicu. Ako postoji pouzdana konverzija, cena se preračuna. Ako veza ne postoji, broj cene ostaje sačuvan i prikazuje se oznaka „Proveri osnovicu cene“; unos cene ili potvrda kroz Izmeni uklanja tu oznaku.

## Primeri računice

| Polazna cena i podatak | Izabrana jedinica | Izračunata cena |
|---|---|---|
| 100 RSD/m, cev 20×20×2 ima 0,3888 kg/m | kg | 100 ÷ 0,3888 = 257,201646… RSD/kg; prikaz 257,20 |
| 540 RSD/m², lim od 2 mm ima 5,4 kg/m² | kg | 100 RSD/kg |
| 50 RSD/kom, kapa mase 0,1 kg/kom | kg | 500 RSD/kg |
| 100 RSD/m, poznata šipka 6,5 m | kom | 650 RSD/kom |
| 540 RSD/m², ploča 2000×1000 mm | kom | 1.080 RSD/kom |
| 100 RSD/set, dva dela u setu | kom | 50 RSD/kom |

Primeri služe za proveru formula i nisu novi tržišni cenovnik. Ako masa nosi ≈, preračunata cena po kg je takođe približna i u tabeli je označena.

## Dostupne kombinacije u lokalnom katalogu

| Jedinice koje se nude | Broj stavki |
|---|---|
| m / kg | 109 |
| m / kom / kg | 3 |
| kom / kg | 131 |
| kom | 27 |
| set | 1 |
| m² / kg | 1 |
| set / kg | 3 |
| m² | 7 |
| set / kom / kg | 1 |

## Čuvanje, obračun i izvoz

- Promena izabrane jedinice odmah preračunava cenu u tabeli i u formi Izmeni. Izbor se čuva posle osvežavanja.
- Osnovna cena se ne zaokružuje pri promeni prikaza, pa ponovljeni izbor m → kg → m ne menja cenu materijala ni ukupnu cenu projekta. Izmena cene po kg pravilno menja odgovarajuću cenu po metru/komadu u obračunu.
- CSV i PDF izvoze izabranu jedinicu i odgovarajuću preračunatu cenu. CSV čuva i obračunsku jedinicu, punu masu, izvor mase i poznate mere komada/seta; uvoz cene po kg pravilno je prevodi u osnovu za kalkulaciju.
- Cena iz uvoza u neprimenljivoj jedinici odbija se sa objašnjenjem, umesto da se broj primeni uz pogrešnu oznaku. Dužina šipke iz cenovnika čuva se i kada je nova cena ista kao postojeća.

## Provera

849 testova prolazi, 2 su preskočena. Dva testa pokrenute lokalne aplikacije prošla su: preračun i izmena cene po kg, m², komadu šipke/ploče i setu; uklanjanje neprimerenih jedinica; ispravka stare jedinice; čuvanje posle osvežavanja; ranije dodata masa i nove kategorije. Produkcioni build je prošao.
