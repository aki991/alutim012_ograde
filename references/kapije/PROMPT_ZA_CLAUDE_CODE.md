# Zadatak za Claude Code — 4 klizne kapije za ALU Tim 012

Radi u postojećem repozitorijumu aplikacije za crtanje ograda i kapija za ALU Tim 012. Implementiraj funkcionalnost kroz postojeći tok **dodavanje elementa → uređivanje na crtežu → čuvanje projekta → ponovno otvaranje**. Cilj je da majstor može da ubaci gotovu varijantu, promeni mere, vidi kretanje i dobije sastavnicu, zatim da njeno podešavanje sačuva kao svoj šablon za sledeći posao. Zadrži postojeći stil aplikacije.

## Materijal koji sam priložio

Raspakovan paket sadrži:

| Početni šablon | Prilog |
|---|---|
| Klizna na donjoj šini, ručna | `klizna_sina_rucna.svg` |
| Klizna na donjoj šini, motorna | `klizna_sina_motorna.svg` |
| Samonoseća klizna, ručna | `samonoseca_rucna.svg` |
| Samonoseća klizna, motorna | `samonoseca_motorna.svg` |

`kapije_demo_parametri.json` daje parametre polaznih primera u milimetrima. Svaki SVG prikazuje zatvorenu kapiju, isprekidanu konturu otvorenog položaja i legendu. Koristi SVG za izgled i raspored komponenti i eventualno za sličice u biraču. Vidljiva geometrija u editoru i izvoz treba da nastaju iz podataka projekta i da reaguju na izmene mera, položaja i smera. Reference su ilustrativne. Mere iz njih služe kao demo vrednosti. Za eventualno priloženi Excel s prethodne sastavnice važi isti status. U neslaganju priloga, za polazne brojčane parametre koristi JSON i u izveštaju zabeleži odstupanje.

## 1. Upoznaj postojeći kod i uklopi se u njega

- Pročitaj uputstva repozitorijuma. Nađi registar elemenata, modele kapija i ograda, postojeći 2D renderer, upravljanje selekcijom i kotama, slobodno crtanje, skladištenje projekata, šablone, sastavnicu i 3D/DXF/PDF samo ako ih aplikacija ima.
- Uvedi četiri opcije u postojeći birač kapija. Podeli tip oslonca i način otvaranja u podatkovnom modelu, uz četiri konkretna šablona u UI. Koristi postojeći sistem identiteta, koordinata i jedinica. Generiši komponente i sastavnicu iz istih parametara umesto četiri odvojene kopije renderera.
- Ako su crteži i parametri van repozitorijuma, otvori ih iz priloženog foldera i smesti potrebne resurse na predviđeno mesto u projektu. Ako prilog nije dostupan, nastavi sa brojčanim primerima i pravilima iz ovog prompta i prijavi tačno koji file nedostaje.
- Stari projekti i postojeći tipovi elemenata moraju da se otvore i ponašaju kao pre. Ako je potrebno proširenje formata, koristi migraciju ili kompatibilne podrazumevane vrednosti u postojećem mehanizmu. Sačuvaj undo/redo, pomeranje, poravnanje, rotaciju i kopiranje ako ih editor već podržava.

## 2. Zajednički model i unos mera

Prikaži odvojene vrednosti za **svetli otvor** (izmereno između prepreka), **spoljnu širinu i visinu rama**, **hod**, **slobodan prostor na strani otvaranja** i **montažne zazore/preklop** kada ih korisnik unosi. Ako svetli otvor ili slobodan prostor nisu poznati, ostavi polje prazno i prikaži da provera prolaza čeka merenje. Hod se meri kao uzdužno pomeranje krila od zatvorenog do otvorenog položaja. Šina, C-profil i zupčasta letva su zasebne mere.

Koristi unutrašnju lokalnu osu X u smeru otvaranja. JSON koristi X prema zoni otvaranja i Y naviše od kote tla. Nula X u JSON-u je projekcija zatvorene prednje ivice krila, a nula Y je nivo tla. Prilagodi ose postojećem 2D/3D prikazu. Pri promeni smera u levo preslikaj čitav sklop u okviru njegove lokalne ose, uključujući fiksne komponente, graničnike, kotiranje, krajnju poziciju, zonu uvlačenja i položaje motora i prihvata. Posle lokalnog preslikavanja primeni uobičajenu poziciju i rotaciju elementa u projektu. Oznake i tekst ostaju čitljivi.

- Osnovni prikaz krila ima ram, dva bočna U-profila i 12 horizontalnih kvadratnih prečki 40 × 40 mm, po uzoru na priloge. Visina rama iz demo geometrije je oko 1.285 mm. U modelu drži profil rama, profil ispune, broj/raspored prečki i njihove dužine kao zasebne podatke, uz reuse postojećeg kataloga profila ako postoji.
- Za šablon koristi 3.000 mm spoljne širine rama. Izbor slobodno nacrtanog oblika koristi postojeći editor konture, ako je dostupan. Montažni oslonci vezuju se za lokalne referentne tačke kapije. Izmena jedne mere ne sme proporcionalno da razvlači kupljeni okov, širinu profila, točkiće ili motor.
- Koristi integer milimetre u UI i postojeću konvenciju za decimalna mesta, zum, klik na kotu i zaključavanje. Obavezna polja za početno umetanje neka ostanu kratka. Zazore, okov, pozicije i montažne detalje stavi u postojeće napredne opcije.
- Posle izmene rama, repa, hoda ili profila, preračunaj geometriju, kote i zavisne stavke. Razlikuj preračunljive podrazumevane pozicije i ručno podešene pozicije. Čuvaj ručne vrednosti i pokaži konkretno odstupanje ako nova geometrija više ne odgovara. Krojnu dužinu ostavi nepotvrđenu tamo gde zavisi od nepoznatog spoja ili dubine ulaska u kanal.

## 3. Tip oslonca

**Klizna na donjoj šini**

- Pokretno: ram, ispuna, 2 donja točkića s nosačima i okov koji se montira na krilo.
- Fiksno: podna šina kroz otvor i u zonu uvlačenja, stub/konzola s parom gornjih valjaka, prihvatnik krila, mehanički krajevi hoda i okov na stubovima.
- Demo: ram 3.000, hod 2.900, šina 6.500 mm. Šina ide od X = −350 do X = 6.150. Centri točkića na krilu su X = 420 i 2.580, prečnik modela 104 mm.
- Proveri da oba točkića u zatvorenom i potpuno otvorenom položaju ostaju na šini uz unesenu rezervu. Za pravolinijski hod na jednoj kontinuiranoj trasi minimum i maksimum uzdužne pozicije obuhvataju ceo hod. Kad je trasa nepoznata, prikaži status za proveru.

**Samonoseća klizna**

- Pokretno: glavni ram, ispuna, trouglasti rep s uspravnim ojačanjem, noseći donji C-profil kroz ram i rep, čeoni točkić i završni čep.
- Fiksno: dvoja kolica na pločama/temelju sa strane uvlačenja, gornja vođica na stubu, prihvatnik, donji prihvat čeonog točkića i mehanički kraj otvaranja. U prolazu prikaži liniju tla.
- Demo: ram 3.000, rep 1.500, C-profil 4.500 i hod 2.930 mm. Fiksna kolica na X = 3.200 i 4.170 mm u koordinatama ručnog/motornog primera. Rep prati krilo u stranu uvlačenja, zajedno sa C-profilom. Tačke oslonca ostaju fiksne.
- Proveri da C-profil pokriva oba fiksna sklopa kolica kroz hod, sa rezervama i dužinama kontaktnih zona prema odabranom okovu ako su poznate. Položaj i razmak kolica, dužina repa, dozvoljeni prepust i veličina temelja zavise od konkretnog kompleta. Demo proporcija repa služi kao početna vrednost. Sačuvaj stvarne vrednosti konkretnog sklopa kada ih majstor unese.

## 4. Ručno i motorno

| Način | Pokretne komponente | Fiksne komponente |
|---|---|---|
| Ručno | Ručka, klizni zasun i njegova pločica na krilu | Prihvatna pločica zasuna i nosač na strani zatvaranja |
| Motorno | Zupčasta letva, nosači i aktivatori krajnjih položaja gde ih odabrani sistem ima na krilu | Motor sa centralom na ploči, pogonski zupčanik i fiksna automatika |

Motor može da stoji ispred ili iza ravni krila prema sistemu. U 2D nacrtu je projekcija iz dvorišta. U CAD/3D podacima zadrži odmak montaže ako postojeći model ima treću osu. Proveri zahvat letve sa zupčanikom po dužini hoda. Sa lokalnom X osom i pravolinijskim pomeranjem, zupčanik na fiksnom X mora da pripada intervalu letve `[rackStart + offset, rackEnd + offset]` za oba krajnja položaja, uz potrebnu rezervu. Ova uzdužna provera ne pokriva visinu, modul i zazor zubaca, koji zavise od kompleta.

Za demo na šini letva je 2.910 mm od X = 55, pinion je na X = 2.940 i hod je 2.900 mm. U punom otvaranju letva počinje na X = 2.955, pa zupčanik ostaje 15 mm van letve. Zadrži primer kao referencu i prikaži razumljivo upozorenje. Podesive pozicije i mere moraju da omoguće da korisnik otkloni upozorenje. Samonoseća motorna ima letvu 4.120 mm od X = 60, zupčanik na X = 3.140 i hod 2.930 mm. Ne izračunavaj dužinu za naručivanje iz same širine krila.

Za motornu sastavnicu uključi mesta za aktivatore, fotoćelije, signalizaciju, sigurnosnu opremu, kabliranje i spojni materijal. Količine koje zavise od kompleta, terena i procene rizika ostaju za potvrdu. Neki delovi dolaze u istom kompletu, pa ih je potrebno prikazati kao delove kompleta ili kao posebnu nabavku, bez dupliranja.

## 5. Prikaz u editoru

1. Klik na bilo koji od četiri šablona dodaje jednu kapiju kao grupisan element na crtež. Podesi naziv varijante, osnovne mere i smer.
2. Crtaj ram i ispunu kao zasebne komponente na normalnom zumu, a sitan okov prikaži kada je dovoljno uvećan ili u detaljnom pregledu. Razlikuj pokretne i fiksne delove referentnim bojama priloga ili postojećim bojama aplikacije. Koristi istu logiku koordinata za selekciju i kote.
3. Dodaj probu hoda **Zatvoreno ↔ Otvoreno**, najmanje klizačem 0–100%. Za određeni procenat pomeraj samo pokretne komponente zajedno za `hod × procenat / 100`. Prihvati, stubovi, šina ili kolica, gornja vođica, graničnici i motor ostaju fiksni. Označi zonu uvlačenja i učini prikaz isprekidanog otvorenog položaja podesivim u detaljnom prikazu.
4. Pokaži čitljive kote rama, hoda i šine ili repa/C-profila. Svetli otvor kotiraj između referentnih tačaka stvarnog prolaza kad je unet. Proveri da je izmereni prolaz slobodan pri otvorenom položaju i da krilo i rep staju u raspoloživ bočni prostor. Ako validacija koristi pojednostavljene pravolinijske granice, prikaži šta se tačno proverava. Testni hod je prikaz i nemoj ga pretvarati u radioničku meru.
5. Unos neispravne mere daje upozorenje uz konkretno polje. Korisnik može da sačuva radni nacrt s nepotvrđenim merama. Izvozi treba da poštuju uobičajen tok aplikacije i da obeleže sklop kao ilustrativan/nepotvrđen gde je to primenljivo. Ako postoji 3D ili izvoz crteža, prenesi geometriju kroz isti podatkovni model i postojeći tok. Ako nisu deo repozitorijuma, 2D, sastavnica i čuvanje projekta su isporuka ovog zadatka.

## 6. Sastavnica i čuvanje šablona

- Iz postojećih komponenti generiši stavke sa nazivom, količinom, JM, dužinom po komadu i ukupnom dužinom ako je primenljiva. Zadrži odvojene veličine **prikazana mera**, **krojna mera** i **nabavna dužina** tamo gde se razlikuju. Oznaka izrada/kupovina i opis montaže idu uz stavku ako postojeći model to podržava.
- Uključi ram, U-profile, prečke, prihvat, vođicu, mehaničke graničnike i pričvršćenje. Oslonac određuje da li idu šina i donji točkići ili rep, noseći C-profil, kolica, čeoni točkić, donji prihvat i završni čep. Način otvaranja određuje ručni okov ili pogon i automatiku.
- Stavke kojima nedostaje šifra, krojna mera ili količina ostavi za potvrdu. Prikaži poznate vrednosti iz odabranog okova i korisnikovog unosa kad postoje.
- Kroz postojeći mehanizam sačuvaj prilagođenu kapiju kao imenovan korisnički šablon. Ako toga nema, uvedi minimalan tok **Sačuvaj kao šablon** u postojećem skladištu, uz dodavanje iz birača šablona. Sačuvaj mere, smer, konturu, profile, ručne pozicije, tipove mehanike i stanje potvrde. Ubacivanje šablona stvara nezavisnu kopiju, a kasnije izmene jedne kapije ne utiču na druge postojeće kapije. Korišćenje drugog tipa oslonca ili ručno/motorno treba da obnovi samo pripadajuće komponente u nacrtu i sastavnici.

## 7. Provera i završetak

Prođi kroz normalni tok aplikacije i pokreni odgovarajuće postojeće testove. Dodaj ciljanu regresionu proveru gde je potrebno za geometriju, ogledanje ili čuvanje.

- Umetanje svake od četiri varijante, promena širine, visine, hoda i smera. Na 0%, 50% i 100% identitet i položaj fiksnih delova ostaju stabilni.
- Za levu i desnu kapiju potvrdi kako se preslikavaju vođica, prihvat, motor, rep/šina, kote i zona uvlačenja. Proveri i van početne tačke projekta, po mogućnosti nakon rotacije u editoru.
- Šina od 6.500 mm sa demo točkićima i hodom prolazi osnovnu uzdužnu proveru bez dodatne rezerve. Skrati šinu ispod potrebne trase i potvrdi upozorenje.
- Samonoseći C-profil ostaje preko demo centara kolica na oba kraja hoda bez dodatne rezerve. Testiraj i položaj van opsega profila. Proveri otvorenu konturu i graničnik po realnoj kontaktnoj tački ako je definisana.
- Prikaži upozorenje za demo motornu na šini sa opisanim gubitkom zahvata na kraju. Proveri primer s korigovanim položajem/dužinom koji zahvat postiže i uklanja upozorenje.
- Prazan svetli otvor ostaje prazan pri snimanju i učitavanju. Nedovoljan bočni prostor, probijanje prolaza ili nevažeći unos treba da imaju poruku sa konkretnim razlogom.
- Promena tipa menja pripadajuće stavke sastavnice bez zaostalih delova. Proveri snimanje, ponovno učitavanje, kloniranje i korišćenje novog šablona. Otvori jedan stari projekat i potvrdi da se postojeći elementi ponašaju očekivano.
- Dovrši izmenu u kodu i pokreni odgovarajući build/test. U završnom odgovoru napiši gde se četiri opcije nalaze u UI, šta je implementirano, koje provere su stvarno prošle i šta od mera/okova zahteva podatke sa terena.

