# Model „Bela — široke vertikalne letvice" (tarabica)

Ovo je postojeći model 13 (nije dodat novi model); „Bela — uske vertikalne letvice" je ostala kakva je bila. Ograda sa belim vertikalnim letvicama (tarabicama); slika modela i kartica su ostale iste, a crtež, mere i sastavnica prate opis ispod. Stari projekti sa ovim modelom dobijaju nove podrazumevane mere (80 / 20 / 30 mm). Mere i šifre su iz kataloga **Ekoluka Key — aluminijumski profili za ograde** (strane 9 i 21), a opis konstrukcije iz naloga: letvica je kvadratna cev 80×20 sa čepom tarabice na vrhu, razmak 20 mm, dve spojne cevi 30×30 vire po 30 mm sa obe strane.

## Šta se zadaje u aplikaciji

| Polje (panel izabranog elementa) | Podrazumevano | Značenje |
|---|---|---|
| Broj tarabica | 7 | menja širinu polja tako da n tarabica stane sa zadatim razmakom i prepustom |
| Širina tarabice | 80 mm | cev 80×20, vidi se šira strana |
| Razmak između tarabica | 20 mm | najmanji razmak; stvarni razmak je ispod polja („Tarabica: 17, stvarni razmak 23,8 mm") |
| Prepust cevi 30×30 | 30 mm | koliko spojna cev viri iza krajnje tarabice sa svake strane |
| Razmak od poda | 40 mm | tarabice su podignute od poda (podrazumevano koliko je visina čepa); vrh polja ostaje na zadatoj visini |

Broj tarabica je najveći broj koji staje: `n·80 + (n−1)·razmak ≤ svetli otvor − 2·prepust`. Ostatak se ravnomerno deli na sve razmake, tako da krajnje tarabice ostaju tačno na zadatom prepustu (razmak je zato jednak ili nešto veći od zadatog). Za razmak tačno 20 mm menja se širina polja.

Prvo polje se dodaje u veličini **1000 × 1000 mm** (spoljna širina kao u panelu; sa stubovima 100×100 to je 7 tarabica), a stubovi su visine ograde (ne vire 200 mm kao kod drugih modela). Svako sledeće dodato polje (dugme „Dodaj“, prevlačenje ili plus) ima **iste mere i izgled kao ograda koja je već u projektu**: izabrano polje, inače poslednja ograda. Kapija preuzima visinu, a prazan otvor visinu i širinu ograde.

## Šta je nacrtano (2D i 3D)

Svaki deo je prikazan prema fotografijama i merama iz kataloga:

- **Tarabica** — kvadratna cev 80×20 sa **čepom tarabice pun K100018**: okovratnik (6 mm, po 2 mm širi od cevi) i kupola u obliku polu-elipse visine 0,425 × širina (34 mm za tarabicu 80) sa povišenim obodom.
- **Dve spojne cevi 30×30** iza tarabica, preko celog svetlog otvora; vide se u razmacima i iza krajnjih tarabica (prepust). Tarabica ih zaklanja i baca senku na njih.
- **Bez vidljivih spojeva:** na fotografiji ograde se zavrtnji ne vide, pa se ne crtaju. Način spajanja (vijci sa zadnje strane ili varenje) nije potvrđen; vijci su u specifikaciji isključeni i uključuju se ako se spaja vijcima.
- **Boja i pozadina:** podrazumevana boja je „Bela (čista)“ (#FFFFFF), a kad u projektu ima svetle ograde editor (2D i 3D) ima sivu pozadinu da se bela lepo vidi.
- **Stub** — kvadratna cev sa ivicama; **Kapa ravna** (ploča 8 mm), **Kapa pismo** (podnožje 10 mm i četvorostrana piramida) i **Rozetna** (široka ploča sa kosim ivicama i povišenim vratom) u 2D i 3D, po veličini stuba (80 ili 100).

Visina čepa za sastavnicu je promenljiva `CAPH` (kupola + okovratnik) u specifikaciji modela; dužina cevi tarabice je `MAINLEN-CAPH`.

## Stubovi i kape

Uz polje (ili kapiju) sa tarabicom stub se obračunava kao **kvadratna cev po dužini stuba** i izabrane kape. Na izabranom stubu: **Kapa na vrhu** — *Bez kape*, *Kapa ravna* ili *Kapa pismo* (rozetna ne ide na vrh) — i prekidač **Rozetna u dnu** (Da/Ne). Više stubova se bira sa **Ctrl+klik** (Shift+klik bira niz), a prekidač **Izmene važe za: Sve stubove** menja sve stubove odjednom. Izbor kape, veličina, boja, visina i ostala podešavanja stuba važe za sve izabrane stubove. Bez izbora: ravna kapa na vrhu, u dnu ništa. Širina stuba: 80×80 ili 100×100 (dugmad u panelu stuba).

| Stub | Cev | Kapa ravna | Kapa pismo | Rozetna |
|---|---|---|---|---|
| 80×80 | KTF808030 (3 mm) | K100013 | K100010 | K100007 |
| 100×100 | KTF10010020 (2 mm) | K100014 | K100011 | K100008 |

Za druge širine stuba (npr. 120 mm uz kapiju) obračunava se najbliža veličina iz kataloga (do 89 mm → 80, ostalo → 100). Betonski i dekorativni stubovi ostaju obični.

## Sastavnica po polju (menja se u „Modeli ograda → Specifikacija")

| Deo | Šifra | Količina | Dužina |
|---|---|---|---|
| Tarabica — kvadratna cev 80×20 | KV000007 (KTWM3865) | N | visina − čep (40 mm) |
| Čep tarabice pun 80×20 | K100018 | N | — |
| Spojna cev 30×30 (gore i dole) | KTWM3899 (2 mm) | 2 | svetli otvor |
| Vijci (isključeni dok se ne potvrdi spoj) | — | 2·N | — |

Krojna lista i radni nalog uzimaju iste dužine; cevi stubova ulaze u krojnu listu kao pozicije S1, S2… (tabela stubova u radnom nalogu).

## Radne pretpostavke (nisu u katalogu — proveriti sa majstorom)

- **Oblik čepa** (kupola 0,425 × širina, okovratnik 6 mm) je procenjen sa fotografije iz kataloga; tarabica se seče na visinu polja − visina čepa (40 mm za tarabicu 80).
- **Spojne cevi** su na 200 mm od vrha i od dna polja i duge su koliko svetli otvor (oslanjaju se na stubove, bez zazora).
- **Debljina zida:** cev 80×20 je 1 mm (KV000007); spojna cev 30×30 je 2 mm (može 1 mm, KTF303010); stub 80×80 je 3 mm, a 100×100 je 2 mm. Katalog nudi i druge debljine.
- **Dužina cevi stuba** je visina stuba iz projekta (bez ukopavanja u beton).
- **Cene:** katalog nema cene, pa su novi materijali u listi „Materijali i cene" sa cenom 0 — uneti nabavne cene da bi kalkulacija bila tačna.
- Prepust se čuva u polju „debljina rama" modela (kod ove ograde nema rama); zato kod kapije sa tarabicom isto polje znači i prepust.

## Katalog i dodavanje elementa

Projekat ima jedan model ograde: katalog ispod crteža i prozor „Dodaj element“ (plus pored ograde) nude model koji projekat već ima, pa se bira samo kod praznog projekta.

Sličice u katalogu i u prozoru „Dodaj element“ su isti 2D crtež modela (ograda, kapije, otvor, stubovi), a za belu ogradu pozadina je siva kao u editoru. Za tarabicu su uvek vidljivi svi stubovi (aluminijumski, betonski, betonski sa podnožjem, dekorativni, stub kapije) i **Betonsko podnožje** — samo podnožje ispod ograde bez betonskog stuba (400 mm, menja se u polju „Betonsko podnožje“ izabrane ograde; 0 = bez). Podnožje ulazi u sastavnicu kao beton po m².

## Podnožje, stubovi na podnožju i prazan otvor

- **Betonsko podnožje** je jedan komad ispod polja i njegovih stubova: ograda i stubovi stoje na njemu. Za svako polje se zadaju **visina podnožja** (0 = bez) i **širina podnožja** (podrazumevano od spoljne ivice levog do spoljne ivice desnog stuba). Šire podnožje **širi i ogradu** (spoljna širina polja postaje širina podnožja, a susedni elementi se pomeraju), pa podnožje nikad ne prelazi preko stuba, drugog podnožja ni ograde; kraće podnožje je centrirano ispod polja. Ako stub na podnožju ima **rozetnu u dnu**, podnožje se produžava ispod nje: kraj rozetne je kraj podnožja. Visina stuba se meri od vrha podnožja, kao visina polja, pa su vrhovi u istoj liniji. Cev stuba je visine stuba iznad podnožja. Stub između polja sa različitim podnožjem stoji na nižem, a stub uz kapiju ili ogradu bez podnožja na tlu. Beton ulazi u sastavnicu po m².
- **Prazan otvor** je samo razmak između ograda (simulacija dvorišta) i nema svoje stubove: stub koji graniči samo sa praznim otvorom (ili krajem niza) se ne crta, ne računa i nema širinu. Stubovi susednih ograda ostaju.

## Kapija sa svojim stubovima

Podrazumevano ograda i kapija dele jedan stub. U panelu izabrane kapije prekidač **Stubovi kapije** daje kapiji **svoje stubove**: između ograde i kapije su dva stuba (stub ograde 100×100 i pojačan stub kapije 120×120) sa razmakom između (podrazumevano 40 mm, polje „Razmak stubova“ u panelu kapije). U panelu „Osnovne karakteristike" prekidač **Stubovi kapija** to menja za sve kapije odjednom, a nova kapija prati izbor ostalih. Oba stuba ulaze u sastavnicu, krojnu listu i radni nalog; razmak između njih (tehnički razmaknik, širine razmaka stubova) nije element i ne pojavljuje se u listama ni brojevima pozicija.

Kapija bez svojih stubova se „hvata“ za stub susednog elementa: uz ogradu ili uz susednu kapiju koja ima svoje stubove ostaje jedan stub (ne dva). Ponovno uključivanje daje običan stub ograde (isti kao ostali stubovi ograde), ne veći stub kapije.

## Visina stuba

**Visina stuba** u panelu je visina iznad podnožja ograde (ista kao visina polja plus prepust) i **ne zavisi od visine podnožja**. Stvarna dužina stuba (od mesta na kome stoji do vrha) piše ispod polja: stub koji stoji na podnožju ima istu dužinu kao visina, a stub između kapije na tlu i ograde na podnožju je duži za visinu podnožja, pa su vrhovi u istoj liniji. Ručno zadatu visinu vraća dugme „Vrati automatsku visinu“.

## Katalog stubova i podnožje

U katalogu su samo **aluminijumski**, **betonski** i **betonski stub sa podnožjem** („Primeni na sve“ menja sve stubove ili izabrani stub). Dekorativni stub, stub kapije (postavlja se sam uz kapiju) i kartica podnožja su izbačeni. Podnožje se bira na ogradi prekidačem **„Betonsko podnožje"** (visina i širina se pojave kad je uključeno), a za sve ograde odjednom u „Osnovnim karakteristikama" („Podnožje ograda"). Širi ili uži stubovi **ne troše polja**: svetli otvor ostaje isti, a ukupna dužina se menja za razliku širina stubova; povratak sa betonskog stuba vraća uobičajenu širinu.
