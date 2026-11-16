# Ograde za terase — analiza elemenata i materijala

Ovo je samo analiza. U aplikaciju ništa nije ubačeno.

**Izvori**
- `katalog-aluminijumske-ograde.pdf` — BTS Aluminium, *Aluminium Railing Systems* V8.0 (78 str.): modeli SL/RL/LX/CL i spisak profila i okova.
- `katalog-elegant-staklene-ograde.pdf` — BTS Aluminium, *Frameless Glass Railing Systems* V11 (96 str.): podni kanali za staklo, spigoti, Juliet.
- lyctum.com — Lyctum je zastupnik BTS-a u Srbiji. Na sajtu su strane: aluminijumske ograde i gelenderi, SlimLine, staklene ograde (Elegant), inox ograde, francuski balkoni (Juliet).
- 12 slika koje si poslao: radovi Alu Tim 012 i postojeća kartica „Inox — horizontalne prečke”.

Oznake u tabelama:
- ✔ = šifra već postoji u aplikaciji (`mat_bts_*`, model `rail_inox` po RL10).
- *kurziv* = mera nije pročitana iz kataloga. Proračunata je iz kg/m (gustina aluminijuma 2,7) ili procenjena sa slike, pa je treba proveriti.

---

## 1. Po čemu se ograde za terase razlikuju od dvorišnih

| | Dvorišna ograda (postojeći katalog) | Ograda za terasu / stepenište / galeriju |
|---|---|---|
| Glavni gornji element | Ram ili gornja maska polja | **Rukohvat** (Ø40/Ø50 ili 60×25 / 80×30) preko stubova, sa prepustom i završecima |
| Stub | Kvadratna cev sa kapom, u zemlju ili na stopu | Ø40, 40×40, 50×25 ili lama (pljosnati). Montaža **odozgo** (flanša), **bočno na čelo ploče** ili **u beton** (ankerno gvožđe) |
| Ispuna | Letvice, lamele, paneli u polju | Prečke Ø16 / 14×14 **provučene kroz držače na stubu**, vertikalne prečke između dva nosača, staklo u stezaljkama ili u podnom kanalu |
| Veze | Uglavnom zavarivanje ili vijci u ramu | **Sve na okovu**: veze stub–rukohvat, prstenovi za prečke, kolena, kugle, spojnice, kape |
| Geometrija | Ravna polja, visina 1–2 m | Visina **90–110 cm**, **uglovi 90°/135°**, **nagib stepeništa** (prelom ravno–koso), zidni rukohvat |
| Boja | Jedna boja modela | Često **različita boja po elementu**: drvo-dekor stubovi i rukohvat sa srebrnim prečkama (sl. 3), crni stubovi sa inox rukohvatom (sl. 6) |
| Bezbednost | — | Otvor u ispuni obično ≤ 10–11 cm (opšte pravilo, nije iz kataloga, treba potvrditi). Staklo je **kaljeno laminirano** |

Zaključak: ograde za terase treba da budu posebna stranica „Modeli ograda za terase”. Grupe elemenata su druge (rukohvati, držači prečki, stezaljke, kanali za staklo), a crtanje mora da zna za **nagib, uglove i montažu sa strane**.

---

## 2. Porodice sistema

| # | Porodica | BTS modeli | Kako izgleda | Slike |
|---|---|---|---|---|
| A | Stubovi + **horizontalne okrugle prečke Ø16** | RL10, RL11 | Stub Ø40, rukohvat Ø50, 3–5 prečki u prstenovima ispred stuba | 1, 2a, 3, 4 |
| B | Stubovi + **horizontalne kvadratne prečke 14×14** | SL10, LX14 (gotov lama stub) | Stub 40×40 ili lama, rukohvat 60×25, prečke 14×14 u držačima | 2b, 6, 11 |
| C | Stubovi + **horizontalne cevi Ø26/Ø30** | CL11 | Kvadratni stub, deblje prečke Ø26 (P-AL3879) na spojevima | — |
| D | Stubovi + **vertikalne prečke** između dva vodoravna nosača | SL11, SL22 (14×14), RL vertikalni (Ø16) | Donji i gornji nosač (Ø30 / 32×25), vertikalne prečke, rukohvat iznad | 7, 9, 2d (pljosnate lamele) |
| E | Stubovi + **staklo u stezaljkama** | RL12, SL12, SL16, CL13, LX15, LX18, LX20 | Staklo između ili ispred stubova, 4 stezaljke po polju | 2c, 10 |
| F | Stubovi + **staklo u donjem nosaču** (ugradni profil) | SL14, SL15, LX17, RL14 | Stub 50×25, staklo sedi u žlebu donjeg nosača, rukohvat 80×30 pokriva staklo | — |
| G | **Monoblok baza** (kanal sa staklom i rukohvatom) | SL17, S40, S40E | Nizak kanal 44×65, staklo 12 mm, rukohvat na staklu | — |
| H | **Bezramno staklo u podnom kanalu** (Elegant) | U50, N50, X50, A50, C50, … | Staklo 12–21,5 mm u U kanalu, bez stubova, rukohvat po želji | 5, 8 |
| I | **Spigot / tačkasti nosači stakla** | Vista V100–V330, AL50 | Staklo na kratkim nosačima ili na čelu ploče | — |
| J | **Francuski balkon** | Juliet J100 (špaletna), J120 (na štok) | Jedno staklo između zidova, visina 900–1100 | — |
| K | **Zidni rukohvat** | RL16 | Samo rukohvat Ø40/Ø50 na zidnim nosačima | 7 (levo uz zid) |
| L | **SlimLine** (Lyctum) | P-1600…P-1604 | Uski stubovi i rukohvat 65×15 / 65×13, vertikalna ispuna, sve na vijke | — |
| M | **Kapijica u stilu gelendera** | AK-5060 / AK-5061 | Ram od savijene cevi Ø50, unutrašnji stubovi, prečke Ø16 | 12 |

---

## 3. Analiza slika

| Sl. | Šta je | Elementi koje vidim | Napomena za crtanje |
|---|---|---|---|
| 1 | Postojeća kartica „Inox — horizontalne prečke” | Stub Ø40 sa stopom, rukohvat Ø50 na vezi, 3 prečke Ø16 kroz prstenove | Već urađeno po RL10. Prelazi na novu stranicu |
| 2a | RL10 | Stub Ø40, rukohvat Ø50 na fiksnoj vezi (AK-5039N), 4 prečke Ø16 u prstenovima AK-5011 **ispred stuba**, prečke izlaze preko krajnjeg stuba, maska stope AK-5002 | Prepust prečki i rukohvata preko krajnjeg stuba |
| 2b | SL10 | Stub 40×40 sa maskom P-AL6505, rukohvat 60×25 (P-1072) na vezi AK-5126, 4 prečke 14×14 u držačima AK-5247, kape AK-5244, stopa AK-5200 | Kvadratna varijanta A. Isti raspored, drugi okov |
| 2c | Staklo na prečkama (CL13 / RL12) | Okrugli stub, rukohvat Ø50, **2 prečke Ø16 i 4 kvadratne stezaljke stakla** (AK-5121 tip) na prečkama, dimljeno staklo | Staklo ne dodiruje stub. Stezaljke idu na prečku |
| 2d | Vertikalne lamele | Okrugli stub, rukohvat Ø50, **gornji i donji vodoravni nosač Ø26–30** (AK-5035), između njih **pljosnate vertikalne lamele** *≈40×10 mm* | Ispuna kao „polje” između dva nosača |
| 3 | RL10 na stepeništu | Stub i rukohvat u **dekoru drveta**, prečke Ø16 srebrne **paralelne nagibu**, kuglasti zglob AK-5020K na prelomu, završetak AK-5009, nosači AK-5011Y (podesivi) | **Boja po elementu** + nagib + prelom ravno/koso |
| 4 | RL10 unutrašnje stepenište | Početni stub (deblji, *verovatno Ø50/Ø60,3 P-1637*) sa kuglom na vrhu, rukohvat Ø50 koso, 5 prečki Ø16 koso | Početni stub kao poseban element |
| 5 | Bezramno staklo (Elegant U50 / N50) | Prozirno staklo u podnom kanalu, bez rukohvata, ugao staklo–staklo, drvena obloga | Ugao kanala 90°. Kanal ide celom dužinom |
| 6 | SL10 na stepeništu | **Crn stub 40×40**, srebrni rukohvat 80×30 / 60×25, 3 prečke (*14×14 ili 20×10*) u podesivim držačima AK-5276 | Dve boje + nagib |
| 7 | Vertikalne prečke, stepenište + galerija | Rukohvat Ø50, kuglasta kolena na prelomima, **donji i gornji nosač Ø30**, vertikalne prečke Ø16 sa **kapama iznad gornjeg nosača**, zidni rukohvat levo | Prečke prolaze kroz gornji nosač i izlaze iznad njega |
| 8 | Mat (satinirano) staklo u kanalu | Satinato staklo u niskom podnom U profilu, bez rukohvata | Vrsta stakla: prozirno / mat / dimljeno |
| 9 | Galerija sa vertikalnim prečkama | Isto kao 7, ravno. Kuglasto koleno na uglu (AK-5020K), stopa sa maskom | Ugao 90° na stubu |
| 10 | Paneli na bočno montiranim stubovima | Kvadratni stubovi **bočno na čelu ploče** (AK-65031U), mat staklo ili HPL u stezaljkama (2 sa svake strane), ravan rukohvat preko | **Bočna montaža**. Panel ispred stuba |
| 11 | SL10 bočno na fasadi | Stubovi 40×40 bočno na čelu ploče (AK-65031U-15), 5 prečki, ravan rukohvat. Desno je spoj u zid (AK-5093 / AK-5267) | Bočna montaža + spoj sa zidom |
| 12 | Kapijica od savijenih cevi | Ram od **Ø50 savijenog u luk** na gornjim uglovima, unutrašnji vertikalni Ø40, prečke Ø16, šarka i reza | Savijanje cevi (u aplikaciji već postoji `mat_pipe_bend`). Pripada kapijama ili posebnom modelu |

---

## 4. Tabela materijala

### 4.1 Stubovi (dikme)

| Šifra | Naziv | Presek | kg/m | Jed. | Modeli | Napomena |
|---|---|---|---|---|---|---|
| ✔ P-1054 | Okrugli stub sa kanalom | Ø40 × 2 | 1,163 | m | RL10, RL12, RL14 | Kanal se zatvara maskicom P-AL2647 |
| P-1073 | Okrugli stub sa kanalom | Ø40 | 0,976 | m | RL10 (alt.) | Lakša varijanta |
| P-1087 | Okrugli stub | Ø40 | 0,815 | m | — | |
| P-1318 | Okrugli stub | Ø40 | 0,699 | m | — | Najlakši |
| P-1387 | Okrugli stub | Ø40 | 0,814 | m | RL12, RL14 | |
| P-1591 | Okrugli stub | Ø40 | 0,747 | m | — | |
| P-1335 | Okrugli stub | Ø40 | 0,921 | m | RL10, RL12 (alt.) | |
| P-1266 | Okrugli stub | Ø40 | 1,128 | m | — | |
| ✔ P-AL2647 | Maskica kanala okruglog stuba | 11,9 × 8 | 0,067 | m | sve RL | |
| P-1057 | Kvadratni stub sa kanalom | 40×40 × *1,3* | 1,090 | m | SL10, SL11, SL12, SL16, SL22, CL11, CL13 | Maskica P-AL6505 |
| P-1067 | Kvadratni stub | 40×40 | 0,905 | m | — | |
| P-1317 | Kvadratni stub | 40×40 | 0,799 | m | — | |
| P-1401 | Kvadratni stub | 40×40 × 1,3 | 0,934 | m | — | Maskica P-AL6505 / P-AL9958 |
| P-1632 | Kvadratni stub, ojačan | 40×40 × 1,8 | 1,187 | m | — | |
| P-1633 | Kvadratni stub | 40×40 × 1,5 | 1,027 | m | SL10, SL11, SL16, CL13 | |
| P-AL6505 | Maskica kanala kvadratnog stuba | 11,9 × 7,6 | 0,068 | m | sve SL/CL | |
| P-AL9958 | Maskica kanala, široka | 15,2 × 7,6 | 0,084 | m | — | |
| P-1070 | Pravougaoni stub za staklo | 50×25 × 1,5 | 0,938 | m | SL14, SL15 | Maskica P-AL7588. Lyctum: „stub širok 25 mm” |
| P-1238 | Pravougaoni stub, ojačan | 50×25 × 2,5 | 1,200 | m | SL14, SL15 (alt.) | |
| P-AL7588 | Maskica stuba 50×25 / nosača P-1075 | 14,8 × 9,6 | 0,098 | m | SL14, SL15 | |
| P-1604 | SlimLine vertikalni profil (stub) | 65×15 × 2 | 1,331 | m | SlimLine | Lyctum P-1604-CR, mat crna |
| P-1637 | Početni stub, okrugli | Ø60,3 × *3* | 1,504 | m | stepeništa | Sl. 4 |
| P-1638 | Početni stub, kvadratni | 70×70 × *2,5* | 2,425 | m | stepeništa | |
| AK-5184 | Gotov lama stub, ojačan, sa držačem stakla | lama | — | kom | LX20 | |
| AK-5185 | Gotov lama stub LX17, staklo spreda | lama | — | kom | LX17 | |
| AK-5191 | Gotov lama stub sa držačem stakla | lama | — | kom | LX18 | |
| AK-5175 | Gotov lama stub sa 7 držača prečki 14×14 | lama | — | kom | LX14 | |
| AK-5176 | Gotov lama srednji stub, dupli držač stakla | lama | — | kom | LX15 | |
| AK-5178 | Gotov lama krajnji stub, držač stakla | lama | — | kom | LX15 | |

### 4.2 Rukohvati (küpeşte)

| Šifra | Naziv | Presek | kg/m | Jed. | Modeli | Napomena |
|---|---|---|---|---|---|---|
| P-1388 | Rukohvat okrugli | Ø50 × *2,5* | 1,011 | m | RL12, RL14 | |
| ✔ P-1033 | Rukohvat okrugli | Ø50 × 2 | 0,816 | m | RL10, RL12, RL16, CL13, LX20 | Najčešći |
| P-1346 | Rukohvat okrugli | Ø50 × *1,8* | 0,739 | m | — | |
| P-1344 | Rukohvat okrugli | Ø50 × *1,5* | 0,621 | m | — | |
| P-1334 | Rukohvat okrugli | Ø50 × *1,35* | 0,558 | m | — | Ekonomični |
| P-1560 | Rukohvat okrugli | Ø40 × *2,5* | 0,798 | m | — | |
| P-1037 | Rukohvat okrugli | Ø40 × *2* | 0,648 | m | RL16 (Ø40) | |
| P-1071 | Rukohvat pravougaoni | 80×30 × 1,5 | 1,108 | m | SL14, SL15 | Prekriva staklo |
| P-1081 | Rukohvat pravougaoni, ojačan | 80×30 × 2 | 1,521 | m | — | |
| P-1748 | Rukohvat pravougaoni | 80×30 | 1,116 | m | SL22 | |
| P-1328 | Rukohvat pravougaoni sa žlebom 12 | 80×30 × 1,5 | 1,003 | m | — | Za staklo |
| P-1072 | Rukohvat pravougaoni | 60×25 × 1,5 | 0,783 | m | SL10, SL11, SL12, SL16, CL11, LX14, LX15, LX18 | Najčešći ravni |
| P-1321 | Rukohvat pravougaoni | 60×25 × 1,4 | 0,729 | m | — | |
| P-1319 | Rukohvat pravougaoni sa uloškom | 60×25 × 1,4 | 0,694 | m | — | Uložak P-AL4228 / P-AL10143 |
| P-1126 | Rukohvat pravougaoni sa žlebom 13 | 60×25 × 1,5 | 0,794 | m | SL17 | |
| P-1108 | Rukohvat pravougaoni | 60×25 × 2 | 0,844 | m | — | |
| P-1327 | Rukohvat pravougaoni sa žlebom 12 | 60×25 × 1,5 | 0,799 | m | — | |
| P-1634 | Rukohvat pravougaoni | 60×25 × 2 | 0,943 | m | — | |
| P-1523 | Rukohvat pravougaoni | 50×25 × 1,7 | 0,964 | m | — | |
| P-1600 | SlimLine pokrivni profil (rukohvat) | 65×13 × 1,2 | 0,343 | m | SlimLine | Lyctum P-1600-CR |
| P-1602 | SlimLine horizontalni profil | 65×10 × 2 | 0,640 | m | SlimLine | Lyctum P-1602-CR |
| P-AL10143 / P-AL4228 | Ulošci rukohvata | 26,7 / 18,2 | 0,145 / 0,123 | m | — | |

**Rukohvati na staklu** (kapa po gornjoj ivici stakla, uz staklene ograde)

| Šifra | Naziv | Presek | kg/m | Napomena |
|---|---|---|---|---|
| P-1030 | Okrugli rukohvat sa žlebom za staklo | Ø42,5 | 0,721 | |
| P-AL7798 | Okrugli rukohvat sa žlebom 12 | Ø50 | 0,872 | |
| P-1032 | Rukohvat na staklu | 50,2 × 43,3 | 1,168 | |
| P-1231 | Rukohvat na staklu | *50×40* | 0,981 | |
| P-1537 | Rukohvat na staklu | 40 × 28,2 | 0,734 | |
| P-AL6528 | Rukohvat na staklu, kvadratni | 30×30 | 0,628 | |
| P-AL6423 | Široki rukohvat na staklu | 75 × 22,6 | 1,418 | |
| P-AL6948 | Široki rukohvat na staklu | 76 × 38,8 | 1,013 | |
| P-1031 | U kapa stakla | 27,7 × 25 | 0,295 | |
| P-AL6728 | U kapa stakla | — | 0,178 | LX17 |
| P-AL8184 | Gornja kapa stakla | — | — | LX17, LX20 |
| P-AL8735 | Rukohvat sa žlebom | 60×25 | 1,626 | SL17, S40E |
| PR-9183 (/12, /20) | Rukohvat sa LED kanalom | — | — | Elegant |
| PR-8788, PR-3442, PR-7610 | Rukohvati Elegant (slim, kvadratni, okrugli) | — | — | Okov AK-8788A/B/D/TA/DV, AK-9183F/D/B/TA |

### 4.3 Prečke i ispuna

| Šifra | Naziv | Presek | kg/m | Jed. | Modeli | Napomena |
|---|---|---|---|---|---|---|
| ✔ P-1146 | Okrugla prečka | Ø16 (15,8) × 1,5 | 0,182 | m | RL10, RL12, CL13 | Horizontalna ili vertikalna |
| P-1594 | Okrugla prečka, laka | Ø16 × *1,2* | 0,149 | m | — | |
| P-1055 | Okrugla prečka, ojačana | Ø16 × *2* | 0,233 | m | — | |
| P-1336 | Kvadratna prečka | 14×14 × *2* | 0,257 | m | SL10, SL11, SL22, LX14 | |
| P-AL3879 | Okrugla cev | Ø26 × 1,5 | 0,312 | m | CL11 | Debela horizontalna prečka |
| P-1074 | Okrugla cev | Ø30 × 2 | 0,477 | m | — | Nosač ili prečka |
| P-1546 | Okrugla cev | Ø30 × 1,5 | 0,364 | m | — | |
| P-1603 | SlimLine vertikalna ispuna | 65×15 × 1,3 | 0,698 | m | SlimLine, sl. 2d | Pljosnata lamela |
| — | Pljosnata lamela | *40×10* | — | m | sl. 2d | Nema u katalogu, procena sa slike |
| — | Perforirani alu lim / HPL kompakt | ploča | — | m² | sl. 10 (moguće) | Lyctum navodi kao ispunu |

### 4.4 Vodoravni nosači ispune (transom: donji i gornji nosač između stubova)

| Šifra | Naziv | Presek | kg/m | Modeli | Napomena |
|---|---|---|---|---|---|
| P-1075 | Donji nosač stakla sa žlebom | 32,8 × 27 × 1,3 | 0,531 | SL14 | Maskica P-AL7588, ugao AK-5220, spojnica AK-5221, kape AK-5144 |
| P-1076 | Donji nosač stakla | 30 × 23,6 × 1,8 | 0,555 | SL15 | Kape AK-5145 |
| P-1631 | Nosač vertikalnih prečki | 32 × 25 × 1,8 | 0,547 | SL11, SL22 | Maskica P-AL10243, spoj AK-5596 / AK-5597 |
| P-AL10243 | Maskica nosača P-1631 | 15 × 7 | 0,086 | SL11, SL22 | |
| P-1400 | Nosač sa kanalom | 22 × 23,6 × 1,7 | 0,351 | SL16 | Spoj AK-5133 |
| P-1118 | Okrugli nosač sa kanalom | Ø28,6 × 1,7 | 0,571 | — | |
| P-1322 | Okrugli nosač | Ø30 × 1,3 | 0,412 | sl. 7, 9 | |
| P-AL9905 + P-AL9906 | Okrugli nosač Ø30 + uložak | Ø30 × 1,4 | 0,366 + 0,062 | — | |
| P-1592 + P-AL10179 | Okrugli nosač Ø30 + uložak | Ø30 × 1,4 | 0,359 + 0,067 | — | |
| P-AL7619 | Okrugli nosač Ø26 sa žlebom za staklo | Ø26 × 1,5 | 0,400 | RL14 | Spoj AK-5096 / AK-5035-26 |
| P-1320 | Nosač | 25 × 18,4 × 2 | 0,300 | — | |
| P-1635 | Nosač | *22×16* | 0,284 | — | |

### 4.5 Staklo i staklene ograde

**Staklo**

| Vrsta | Debljine | Gde |
|---|---|---|
| Kaljeno laminirano (PVB 0,76 / 1,52) | 4+4, 5+5 | LX15, LX18, S40 |
| | 6+6, 8+8 | LX17, LX20, SL14/15/16, CL13, X50 |
| | 8+8, 10+10 (17,52 / 21,52) | Podni kanali Elegant, Juliet |
| Kaljeno 10 / 12 mm | 10, 12 | S40E, SL17, C50 |
| Prozirno / satinato (mat) / dimljeno (bronza, siva) | — | sl. 5, 8, 10, 2c |

Lyctum: u standardne alu ograde ide staklo 6, 8, 10 i 12 mm. 16 i 20 mm idu samo u Elegant kanale.

**Podni i bočni kanali za staklo (Elegant)**

| Serija | Profil | Presek Š×V (mm) | kg/m | Dužina | Montaža | Staklo | Pribor |
|---|---|---|---|---|---|---|---|
| U50 | P-1358 | 46 × 125 | 5,83 | 600 | odozgo | 12–21,52 | Klinovi U50-KM12/16/20, kapa U50-1358K, anker BTS-VJ10X140 |
| U50F | P-1519 + maska P-1345 | 95 × 125 | 7,14 | 600 | odozgo / u košuljicu | 12–21,52 | Kapa U50F-1519K |
| U50 Max | P-1518 | 65 × 145 | 7,10 | 600 | odozgo | 12–21,52 | U50M-KM |
| U50F Max | P-1522 + P-AL7405 | 138 × 145 | 9,84 | 400 | odozgo | 12–21,52 | |
| U50R Max | P-1521 + P-1520 + P-AL9205 | 67 × 186 | 7,25 | 600 | **bočno** | 12–21,52 | |
| N50 | P-1024 | — | 4,50 | 500 | odozgo | 10,76–21,52 | Odvodnja AK-5292, kapa N50-1024K |
| N50F | P-1025 + P-1345 | — | 5,70 | 500 | odozgo / u košuljicu | 10,76–21,52 | |
| N50R | P-1026 + P-AL9204 + P-AL9205 | 56,5 × 150 | 4,73 | 500 | **bočno** | 12,76–21,52 | |
| N50S | P-1516 | 80 × 115 | 5,45 | 600 | odozgo | 13,52–21,52 | |
| X50 | P-1210 | 80 × 106 | 4,22 | 500 | odozgo | 6+6, 8+8 | Lyctum: RAL 7016, rukohvat obavezan |
| EX50 | P-1354 | 70 × 115 | 4,50 | 500 | odozgo | 6+6 … 10+10 | |
| A50 | P-1512 | 90 × 128 | 7,53 | 500 | odozgo | 12–21,52 | A50-KM |
| C50 / C50+ | Segmenti 15 / 30 cm (C50-6548, P-1515) + maske P-1002/1003/1004 | — | — | — | odozgo, segmentno | 12–21,52 | Klinovi KMS12/16/20, razmak segmenata najviše 275 mm |
| C60, C70 | Segmenti 15 / 30 cm, podesiv ugao stakla | 77 × 122 (C60) | 5,85 | — | odozgo | 12–17,52 | C70 „Magic pack” |
| FX50, CX50, D50, D55 | — | — | 9–10 | 200 | **bočno** | 8+8, 10+10, 20 | D55 se savija |
| CA50, RX50 | — | — | 8,70 | — | **u pod** | 8+8, 10+10 | |
| S40 | S40-6981 | 56 × 71,5 | — | 600 | odozgo | 4+4, 5+5 | Rukohvat PR-5148T / PR-7116 |
| S40E / SL17 | P-1082 (monoblok baza) | 44 × 65 | 1,525 | — | odozgo | 10–12 | Rukohvat P-AL8735 / P-1126 |
| — | P-1357 (monoblok baza) | 44 × 73 | 1,741 | — | odozgo | — | |

Uz sve kanale idu: EPDM gumice **CNT-xxx** (unutrašnja i spoljna, po debljini stakla), plastični klinovi, alat AK-5299, hemijski anker AK-5027K i navojna šipka M8/M10 × 150 (BTS-GJ…).

**Spigoti, tačkasti nosači, Juliet**

| Šifra | Naziv | Staklo | Napomena |
|---|---|---|---|
| Vista V100 | Spoljni nosač stakla 100×100 | — | Anker BTS-VJ10X140 |
| Vista V300 / V310 / V320 / V330 | Spigot (kratak stubić u koji ulazi staklo) | 8+8 (17,52) | V330: 50 × 140. Najviše 1000 mm visine, 3 kom/m, rukohvat obavezan (Lyctum) |
| AK-5008DC3 / DC4 / DC5 / DC6 | Tačkasti nosač (AL50), 3D podesiv | 16–20 | Raspon najviše 1200, od ivice najviše 200 |
| J100BG | Juliet set, montaža na špaletu | 6+6 … 10+10 | Bočni pinovi AK-5287 (4 kom), gumica AK-FT11 |
| J120BG | Juliet set, montaža na štok | 6+6 … 10+10 | Pinovi AK-5288, profili P-1222 / P-1223 |
| PR-9198 | Juliet profil | — | Visina 900 / 1000 / 1100. Najveća širina stakla: 1200 → 10,76 · 1400 → 12,76 · 1700 → 16,76 · 2800 → 21,52 |

### 4.6 Okov — veze stuba i rukohvata (mafsale)

| Šifra | Opis | Stub → rukohvat | Tip |
|---|---|---|---|
| ✔ AK-5039N | Duga fiksna veza | Ø40 → Ø50 | fiksna |
| AK-5039 | Fiksna veza | Ø40 → Ø50 | fiksna |
| AK-5039Y / AK-5039YE | Fiksna, spolja nataknuta (eko) | Ø40 → Ø50 | fiksna |
| AK-5039-40 | Fiksna veza | Ø40 → Ø40 | fiksna |
| AK-5237 | Fiksna veza | Ø40 → cev Ø40 | fiksna |
| ✔ AK-5001 / AK-5001E | Podesiva veza (stepenice) | Ø40 → Ø50 | podesiva |
| AK-5066 | Podesiva veza | Ø40 → Ø50 | podesiva |
| AK-5052 | Podesiva veza | Ø50 → Ø50 | podesiva |
| AK-5038 | Fiksna veza | Ø50 → Ø50 | fiksna |
| AK-5128 | Podesiva veza | Ø40 → 60×25 | podesiva |
| AK-65039Y / AK-65039YE | Fiksna veza | 40×40 → Ø50 | fiksna |
| AK-65001 / AK-65001E | Podesiva veza | 40×40 → Ø50 | podesiva |
| AK-5209 | Podesiva veza | 40 kv. → Ø50 | podesiva |
| AK-5126 | Fiksna veza | 40×40 → 60×25 | fiksna |
| AK-5125 | Podesiva veza | 40×40 → 60×25 | podesiva |
| AK-5137 | Fiksna veza | 25×50 → 80×30 | fiksna |
| AK-5255 | Podesiva veza | 25×50 → 80×30 | podesiva |
| AK-5017 | L veza, podesiva | → Ø50 | Kraj rukohvata u zid ili stub |
| AK-5135 | L veza, podesiva | → 60×25 | |
| ✔ AK-5062 | Kapa / prsten preko vrha stuba Ø40 | Ø40 | Ispod veze |

### 4.7 Okov — kolena, uglovi, zglobovi

| Šifra | Opis | Za |
|---|---|---|
| AK-5020S / AK-5020SA | Koleno 90° / 135° sa bilezikom | Ø50 |
| AK-5020X | Stezno koleno | Ø50 |
| AK-5020NX / AK-5020NX-40 | Oštro (zavareno) koleno | Ø50 / Ø40 |
| ✔ AK-5020K, AK-5020KE, AK-5162 | **Kuglasti zglob, podesiv ugao** (prelom stepeništa, uglovi; sl. 3, 4, 7, 9) | Ø50 |
| AK-5020K-40, AK-5164 / AK-5020K-30 | Kuglasti zglob | Ø40 / Ø30 |
| AK-5222 | Kugla Ø50 sa vezom na stub 40×40 | Ø50 / 40×40 |
| AK-5020KM | Podesiv spoj dva rukohvata i stuba (ugaoni stub) | Ø50 |
| AK-5092 / AK-5224 | Oštro koleno sa vezom na okrugli / kvadratni stub | Ø50 |
| AK-5138 | Zavareno koleno | 80×30 |
| AK-5201 | Koleno sa srednjim kanalom | 80×30 |
| AK-5165 | Zavareno koleno | 60×25 |
| AK-5139 | Koleno sa vezom na stub | 60×25 |
| AK-5129, AK-5099, AK-5339, AK-5341, AK-5100, AK-5108, AK-5268, AK-5269, AK-5334 | Podesivi uglovi gore–dole i levo–desno (stepenice, ugaoni stub) | 60×25 |
| AK-5220 | Ugao donjeg nosača SL14 | P-1075 |
| ✔ AK-5022A / AK-5022B | Koleno prečke 90° / 135° | Ø16 |
| ✔ AK-5022Y | Podesivi zglob prečke | Ø16 |
| AK-5253 / AK-5254 | Koleno prečke 90° / 135° | 14×14 |
| AK-5245 / AK-5266 | Podesiv ugao prečke, kvadratni / okrugli dizajn | 14×14 |

### 4.8 Okov — spojnice (nastavak profila u liniji)

| Šifra | Opis | Za |
|---|---|---|
| AK-5007 / AK-5007A | Spoljni bilezik / dugi bilezik | Ø50 |
| AK-5007NX | Unutrašnja spojnica | Ø50 |
| AK-5007X | Stezna spojnica | Ø50 |
| AK-5007-40 / AK-5007NX-40 | Bilezik / unutrašnja spojnica | Ø40 |
| AK-5158 | Spoljna spojnica | 80×30 |
| AK-5111 / AK-5111A | Spoljna spojnica, kratka / duga | 60×25 |
| AK-5221 | Spojnica donjeg nosača | P-1075 |
| AK-5022 | Spojnica prečke | Ø16 |
| AK-5246 / AK-5279 | Unutrašnja / spoljna spojnica prečke | 14×14 |
| AK-5021 / AK-5021a | Unutrašnji uložak za koleno / stub Ø50 | — |

### 4.9 Okov — držači prečki na stubu (prstenovi)

| Šifra | Opis | Prečka | Stub |
|---|---|---|---|
| AK-5011 / AK-5011A / AK-5011AE / AK-5011E | Prsten za prečku | Ø16 | Ø40 |
| AK-5011T | Prsten sa navojem | Ø16 | Ø40 |
| ✔ AK-5011Y | Podesivi prsten (prečke koso, stepenice) | Ø16 | Ø40 |
| AK-5120 | Podesivi prsten za kvadratni stub | Ø16 | 40×40 |
| AK-5247 / AK-5275 | Držač prečke | 14×14 | 40×40 |
| AK-5277 / AK-5278 | Držač, okrugli tip / sa pinom | 14×14 | — |
| AK-5276 | Podesivi držač (stepenice, sl. 6) | 14×14 | — |

### 4.10 Okov — spoj nosača ili debele prečke sa stubom

| Šifra | Opis |
|---|---|
| AK-5035 / AK-5035N | Ø40 stub → cev Ø30 |
| AK-5123 | Ø40 stub → cev Ø30, podesiv |
| AK-5035-26 | Ø40 stub → cev Ø26 |
| AK-5096 | Ø40 stub → cev Ø26, podesiv |
| AK-5035-30F | 40×40 stub → cev Ø30 |
| AK-5124 | 40×40 stub → cev Ø30, podesiv |
| AK-5095 / AK-5097 | 40×40 stub → cev Ø26, fiksni / podesiv |
| AK-5133 | Nosač 22×25 (P-1400) → kvadratni stub |
| AK-5596 / AK-5597 | Nosač 32×25 (P-1631) → kvadratni stub, fiksni / podesiv |

### 4.11 Okov — stezaljke za staklo

| Šifra | Opis | Za |
|---|---|---|
| AK-5025X | Podesiva stezaljka | Ø40 stub |
| AK-5127 | Velika stezaljka | Ø40 stub |
| AK-5204 | Stezaljka sa kapom i vijkom | Ø40 stub |
| AK-5014N | Okrugla stezaljka | Ø40 stub |
| AK-5105 | Podesiva stezaljka | kvadratni stub |
| AK-5106 | Velika stezaljka | 40×40 |
| AK-5205 | Stezaljka sa kapom i vijkom | 40×40 |
| AK-5025A | Stezaljka sa kapom i vijkom | — |
| AK-5121 | **Horizontalni držač stakla** (na prečki, sl. 2c) | prečka |
| AK-5015A / AK-5016A | Spider, jednostruki / dvostruki | — |
| AK-5010 / AK-5010AE | Graničnik stakla | — |
| AK-FT10 / AK-FT11 | Gumice za staklo | SL14, SL15, LX, Juliet |

### 4.12 Okov — stope, flanše, maske (montaža odozgo i na zid)

| Šifra | Opis | Za |
|---|---|---|
| ✔ AK-5036X | Spoljna flanša sa čaurom | Ø40 |
| AK-5186 | Spoljna flanša | Ø40 |
| AK-5089 | Unutrašnja flanša sa pločom i ankerom | Ø40 |
| AK-5196 | Unutrašnja flanša, ploča Ø80 | Ø40 |
| AK-5036C | Flanša sa ankerom | Ø40 |
| AK-5036 (-30, -35, -50, -55, -60, -65), AK-5206 (80 mm) | Podna i zidna flanša sa maskom, visina 30–80 mm | Ø40 |
| AK-5037 (-30 … -65) | Podna i zidna flanša sa maskom | Ø50 |
| AK-5008 / AK-5008YA | Podna i zidna flanša / podesiva zidna | Ø50 |
| AK-5159 | Podesiva zidna flanša | Ø40 |
| AK-5101 | Gotova flanša na parapetu | Ø50 rukohvat |
| AK-5002 / AK-5002S / AK-5002NT | Maska stope, obična / eko / bez zuba | Ø40 |
| AK-5200 / AK-5200/30 | Spoljna flanša (30 mm visine) | 40×40 |
| AK-5234 | Podna flanša, 4 vijka | 40×40 |
| AK-5141 | Flanša sa ankerom | 40×40 |
| AK-5107 / AK-65002 | Maska stope | 40×40 |
| AK-5136 | Maska stope | 25×50 |
| AK-5093 | Zidna flanša rukohvata | 60×25 |
| AK-5094 | Zidna flanša rukohvata | 80×30 |
| AK-5040 / AK-3063 | Podna i zidna flanša | Ø16 / Ø30 |
| AK-5059 (-40, -30, -16) / AK-5267 | Veza u plafon ili zid | Ø50, Ø40, Ø30, Ø16 / 40×40 |

### 4.13 Okov — bočna montaža i zidni rukohvat

| Šifra | Opis |
|---|---|
| AK-5031U / AK-5031U-15 | Bočna obujmica stuba Ø40 na beton (kratka / 15 cm) |
| AK-65031U / AK-65031U-15 | Bočna obujmica stuba 40×40 (sl. 10, 11) |
| AK-5030 / AK-5031 | Maska bočne veze, jednostrana / dvostrana |
| AK-5161 / AK-5163 | Zidni nosač rukohvata Ø50 / Ø40 |
| AK-5091 | Podesiv zidni nosač Ø50 |
| AK-5019 / AK-5019-50 / AK-5157-50 | L zidni nosač Ø50 (rukohvat uz zid) |
| AK-5032 / AK-5252 | Zidni nosač Ø50 / zidna ručka |
| AK-5355 | L zidni nosač 60×25 |
| AK-5018 | Podloška |

### 4.14 Okov — završeci, kape, ukrasi

| Šifra | Opis | Za |
|---|---|---|
| ✔ AK-5009 | Završetak rukohvata | Ø50 |
| AK-5009EL / AK-5009Y / AK-5009S | Završetak za zid 2 mm / spoljni / unutrašnji | Ø50 |
| AK-5013 / AK-5013A / AK-5013S | Završetak, obični / ravan | Ø40 |
| AK-3062Y | Spoljni završetak | Ø30 |
| AK-5117 | Završetak nosača Ø30 | Ø30 |
| AK-5154 | Završetak | Ø26 |
| ✔ AK-5012A / AK-5012Y / AK-5197 | Završetak prečke | Ø16 |
| AK-5058 / AK-5058A | Kapa vertikalne prečke, plastična / alu (sl. 7, 9) | Ø16 |
| AK-5244 | Završetak prečke, okrugla čela | 14×14 |
| AK-5104 | Završetak rukohvata | 60×25 |
| AK-5142 | Završetak rukohvata | 80×30 |
| AK-5225 | Gornja kapa stuba | 25×50 |
| AK-5134 | Kapa stuba | 40×40 |
| AK-5144 / AK-5145 | Završeci donjeg nosača, levi i desni | P-1075 / P-1076 |
| AK-5051 / AK-5151-40 / AK-5051-16 / AK-5051A-16 | Ukrasna kugla (topuz) | Ø50 / Ø40 / Ø16 |

### 4.15 Sidrenje, vijci, kapija

| Šifra | Opis |
|---|---|
| ✔ AK-5027K | Hemijsko sidro (ETA) |
| AK-5027 / AK-5027B / AK-5027C / AK-5027D | Lepak za aluminijum / pištolj / lepak za mermer / kruna za bušenje |
| AK-5003/21, /24, /30, /33, /40, /45, /60 | Ankerno gvožđe za betoniranje (21–60 cm) |
| AK-5003E, AK-5003-40 | Varijante ankera |
| BTS-VT75100 / 75120 / 75150 | Vijak za beton 7,5 × 100 / 120 / 150 (flanše) |
| BTS-VS4540 | Vijak 4,5×40 sa tiplom (zidne flanše) |
| BTS-VP4219 / VP4238 / VP4838 / VP4825 | Inox samobušivi vijci (okov) |
| BTS-KSG10X100 | Anker M10×100 sa ukrasnom kapom (SlimLine) |
| AK-5060 | Reza kapijice u liniji ograde (sl. 12) |
| AK-5061 | Šarka kapijice u liniji ograde (sl. 12) |

### 4.16 SlimLine okov (Lyctum, mat crna „-CR”)

| Šifra | Opis |
|---|---|
| AK-5417-CR | Podna stopa |
| AK-5418 | Konektor |
| AK-5419-CR | Zidna rozetna |
| AK-5434-CR | Čep rukohvata |
| AK-5448-CR | Ugaona skretnica 90° |
| AK-5449 | Ugaona spojnica (čelik) |
| AK-5398-CT | Bočni nosač |

### 4.17 Inox sistem (Lyctum, AISI 304, satinirano ili polirano „-L”)

| Šifra | Opis | Mera |
|---|---|---|
| — | Cev stuba i rukohvata | Ø42,4 · Ø48,3 · 40×40 |
| — | Ispuna | Ø16 |
| A/0718-242, A/0718-200-B, A/0719-248 | Nosač rukohvata na stubu | Ø42,4 → Ø42,4 / 40×40; Ø48,3 → Ø48,3 |
| A/4718-000-B, A/4718-042 | Nosač rukohvata na stubu 40×40 | → 40×40 / Ø42,4 |
| A/0710-842, A/0711-842, A/4710-842 | Nosač na ugaonom stubu | Ø42,4 / 40×40 |
| A/0840-042, A/0840-048, A/0840-000 | Držač ispune Ø16 | na Ø42,4 / Ø48,3 / ravan |
| A/0305-242, A/0305-248, A/0305-016 | Koleno | Ø42,4 / Ø48,3 / Ø16 |
| A/0302-242 | Podesivo koleno | Ø42,4 × 2 |
| A/0790-242, A/0790-248 | Spojnica | Ø42,4 / Ø48,3 |
| A/5729-…, A/5730-…, A/5735-242-R-L, A10/0010-016, A/4732-040 | Kape | Ø42,4 / Ø48,3 / Ø16 / 40×40 |
| A6/105x42x25, A6/105x48x25, A/0505-042, A/4511-040, A/4513-9340 | Rozetne | Ø42,4 / Ø48,3 / 40×40 |
| A/0156-042 | Nosač rukohvata na staklu (staklo 8–18) | Ø42,4 |
| ZY-J487, A22/6200-000-C, A14/6300-000, SPTOP-SS3D, SPSIDE-SS3D | Inox spigoti, podni i bočni | Staklo 6+6 … 17,52 |

---

## 5. Sastav modela iz BTS kataloga

| Model | Stub + maska | Rukohvat | Ispuna | Nosač / držač | Veza stub–rukohvat | Stopa | Ostalo |
|---|---|---|---|---|---|---|---|
| **RL10** ✔ | P-1054 + P-AL2647 (alt. P-1073, P-1335) | P-1033 Ø50 | P-1146 Ø16 horiz. | AK-5011 / 5011A / 5011Y | AK-5039 / 5039N / 5039Y, AK-5001, AK-5066 | AK-5036X / 5036C / 5089 / 5196 / 5186 + AK-5002 | AK-5062, AK-5009, AK-5012A, AK-5022A, AK-5020S/X/NX/K, AK-5162, AK-5037, AK-5027K |
| **RL12** (staklo) | P-1054 / P-1387 + P-AL2647 | P-1033 / P-1388 | Staklo | AK-5025X / 5014N / 5127 / 5204 | AK-5039N, AK-5092, AK-5020KM | kao RL10 | AK-5008, AK-5062 |
| **RL14** (staklo) | P-1054 | P-1033 / P-1388 | Staklo u nosaču | P-AL7619 Ø26 + AK-5096 / 5035-26 | AK-5001 | AK-5089 | AK-5051 kugla, AK-5062, AK-5020K/X |
| **RL16** (zidni) | — | P-1033 Ø50 / P-1037 Ø40 | — | — | — | AK-5161 / 5163 / 5091 / 5019 / 5032 / 5101 | AK-5009, AK-5020K/X |
| **SL10** | P-1057 / P-1633 + P-AL6505 | P-1072 60×25 | P-1336 14×14 horiz. | AK-5247 / 5276 | AK-5126 / 5125, AK-5135 | AK-5200 / 5141 + AK-5107 / 65002 | AK-5244, AK-5245, AK-5129, AK-5093, AK-5003 |
| **SL11** | P-1057 + P-AL6505 | P-1072 | P-1336 vertik. | P-1631 + P-AL10243, AK-5596 | AK-5126 | AK-5200 + AK-5107 | AK-5104, AK-5129, AK-5093 |
| **SL22** | P-1057 + P-AL6505 | P-1748 80×30 | P-1336 vertik. | P-1631 + P-AL10243 | AK-5126 / 5125 | AK-5200 + AK-5107 / 65002 | AK-5158, AK-5138, AK-5003 |
| **SL12** (staklo) | P-1057 / P-1633 | P-1072 | Staklo | AK-5105 / 5106 / 5205 | AK-5126 | AK-5200 / 5141 | AK-5104, AK-5093, AK-5165, AK-5129, AK-5139 |
| **SL16** (staklo) | P-1057 / P-1633 + P-AL6505 | P-1072 | Staklo | P-1400 + AK-5133 | AK-5126 / 5125 | AK-5200 / 5141 | AK-5104, AK-5093, AK-5165, AK-5139 |
| **SL14** (staklo) | P-1070 50×25 + P-AL7588 (alt. P-1238) | P-1071 80×30 | Staklo | P-1075 + P-AL7588 | AK-5137 | AK-5003 + AK-5136 | AK-5144, AK-5142, AK-5138, AK-5094, AK-5220, AK-5221, AK-FT10 / FT11 |
| **SL15** (staklo) | P-1070 + P-AL7588 | P-1071 | Staklo spolja | P-1076 | AK-5137 | AK-5003 + AK-5136 | AK-5145, AK-5142, AK-5094, AK-FT10 |
| **SL17** (monoblok) | — | P-1126 / P-AL8735 | Staklo 12 | P-1082 baza 44×65 | — | vijci | AK-5093, AK-5165 |
| **CL11** | P-1057 + P-AL6505 | P-1072 | P-AL3879 Ø26 horiz. | AK-5095 / 5097 | AK-5126 | AK-5141 + AK-5107 | AK-5100, AK-5129, AK-5093 |
| **CL13** (staklo) | P-1057 / P-1633 | P-1033 Ø50 | Staklo | AK-5121 | AK-65001 / 65039Y, AK-5017 | AK-5141 + AK-5107, AK-5037-55 | AK-5020X/NX/S/K, AK-5162 |
| **LX14** | AK-5175 (lama) | P-1072 | P-1336 horiz. | u stubu | — | ankeri | AK-5244, AK-5245, AK-5104, AK-5165, AK-5093. Visina 110 |
| **LX15** | AK-5176 / 5178 | P-1072 | Staklo 4+4 | u stubu | — | — | AK-5104, AK-5165, AK-5093. Visina 110 |
| **LX17** | AK-5185 | P-AL8184 + P-AL6728 | Staklo 5+5 … 8+8 | u stubu | — | — | AK-FT10. Visina 95 / 110 |
| **LX18** | AK-5191 | P-1072 | Staklo 4+4 / 5+5 | u stubu | — | — | AK-5104, AK-5165, AK-5093. Visina 110 |
| **LX20** | AK-5184 | P-1033 + P-AL8184 | Staklo 6+6 / 8+8 | u stubu | — | AK-5008 | AK-5020S, AK-5009. Visina 100 |

---

## 6. Šta crtanje ograda za terase treba da zna (predlog, nije urađeno)

1. **Posebna stranica** „Modeli ograda za terase”. Na nju prelaze `rail_inox` (RL10) i `rail_black` (`TERRACE_MODELS` u `catalog.ts`).
2. **Nove grupe materijala** pored postojećih (`MATERIAL_GROUPS`):
   - rukohvati,
   - nosači ispune (transom),
   - držači prečki,
   - veze stub–rukohvat,
   - kolena i zglobovi,
   - spojnice,
   - stezaljke stakla,
   - kanali za staklo,
   - bočna i zidna montaža.

   Stope, flanše i maske već postoje kao „Stope”, „Rozetne” i „Kape”.
3. **Delovi ograde i njihova pravila**:
   - stub: okrugli, kvadratni, lama ili početni;
   - rukohvat: prepust preko krajnjeg stuba i završetak;
   - ispuna: horizontalna, vertikalna ili staklo, broj prečki i razmak;
   - donji i gornji nosač;
   - okov na svakom spoju.
4. **Montaža stuba**: odozgo (flanša i maska), bočno (obujmica, prepust stuba ispod ploče), u beton (ankerno gvožđe), zid. Od montaže zavise stopa, broj ankera i dužina stuba.
5. **Geometrija**:
   - ugao 90° i 135° (koleno ili kugla);
   - **nagib stepeništa** (ugao, prelom ravno/koso, podesivi prstenovi AK-5011Y i AK-5276);
   - zidni rukohvat;
   - savijena cev (sl. 12).
6. **Boja po elementu** (stub, rukohvat, prečke). Na slikama 3 i 6 delovi su u različitim bojama. Boje: RAL, eloksaža mat/inox, dekor drveta.
7. **Staklo kao ispuna**: debljina i vrsta (prozirno, mat, dimljeno). Stezaljke idu na stub ili na prečku, ili staklo ide u kanal.
8. **Mere**: visina 90–110 cm (BTS: 95, 100, 110). Razmak stubova i otvor ispune treba potvrditi.

## 7. Šta treba da potvrdiš

- Koje od ovih sistema Alu Tim 012 zaista radi. Po slikama: RL10, SL10, staklo na prečkama, vertikalne prečke (sl. 7, 9), bočna montaža (sl. 10, 11), staklo u kanalu (sl. 5, 8) i kapijica (sl. 12).
- Dobavljač okova: BTS (Lyctum) ili PEGA. U aplikaciji već postoje PEGA šifre za `rail_black`.
- Uobičajen razmak stubova (npr. 100–130 cm) i najveći dozvoljen otvor u ispuni.
- Mere lamela na sl. 2d i prečki na sl. 6. Na slici se ne vidi da li je 14×14 ili pravougaona prečka.
- Da li kapijica sa sl. 12 ide uz ograde za terase ili uz kapije.
- Mere u *kurzivu* su proračunate ili procenjene. Tačne mere su na crtežima u katalogu (str. 42–53), koje nisu mogle da se pročitaju kao tekst.
