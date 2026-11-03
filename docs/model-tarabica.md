# Model „Bela — široke vertikalne letvice" (tarabica)

Ovo je postojeći model 13 (nije dodat novi model); „Bela — uske vertikalne letvice" je ostala kakva je bila. Ograda sa belim vertikalnim letvicama (tarabicama); slika modela i kartica su ostale iste, a crtež, mere i sastavnica prate opis ispod. Stari projekti sa ovim modelom dobijaju nove podrazumevane mere (80 / 20 / 30 mm). Mere i šifre su iz kataloga **Ekoluka Key — aluminijumski profili za ograde** (strane 9 i 21), a opis konstrukcije iz naloga: letvica je kvadratna cev 80×20 sa čepom tarabice na vrhu, razmak 20 mm, dve spojne cevi 30×30 vire po 30 mm sa obe strane.

## Šta se zadaje u aplikaciji

| Polje (panel izabranog elementa) | Podrazumevano | Značenje |
|---|---|---|
| Broj tarabica | 6 | menja širinu polja tako da n tarabica stane sa zadatim razmakom i prepustom |
| Širina tarabice | 80 mm | cev 80×20, vidi se šira strana |
| Razmak između tarabica | 20 mm | najmanji razmak; stvarni razmak je ispod polja („Tarabica: 17, stvarni razmak 23,8 mm") |
| Prepust cevi 30×30 | 30 mm | koliko spojna cev viri iza krajnje tarabice sa svake strane |

Broj tarabica je najveći broj koji staje: `n·80 + (n−1)·razmak ≤ svetli otvor − 2·prepust`. Ostatak se ravnomerno deli na sve razmake, tako da krajnje tarabice ostaju tačno na zadatom prepustu (razmak je zato jednak ili nešto veći od zadatog). Za razmak tačno 20 mm menja se širina polja.

Pri dodavanju polje ima svetli otvor **640 × 1200 mm** sa **6 tarabica** (6·80 + 5·20 + 2·30 = 640); širina koju prikazuje panel je 840 mm jer uključuje stubove 100×100.

## Stubovi i kape

Uz polje (ili kapiju) sa tarabicom stub se obračunava kao **kvadratna cev po dužini stuba** i izabrane kape. Na izabranom stubu: **Kapa na vrhu** i **Kapa u dnu** — *Bez kape*, *Kapa ravna*, *Kapa pismo* ili *Rozetna*. Bez izbora: ravna kapa na vrhu, u dnu ništa. Širina stuba: 80×80 ili 100×100 (dugmad u panelu stuba).

| Stub | Cev | Kapa ravna | Kapa pismo | Rozetna |
|---|---|---|---|---|
| 80×80 | KTF808030 (3 mm) | K100013 | K100010 | K100007 |
| 100×100 | KTF10010020 (2 mm) | K100014 | K100011 | K100008 |

Za druge širine stuba (npr. 120 mm uz kapiju) obračunava se najbliža veličina iz kataloga (do 89 mm → 80, ostalo → 100). Betonski i dekorativni stubovi ostaju obični.

## Sastavnica po polju (menja se u „Modeli ograda → Specifikacija")

| Deo | Šifra | Količina | Dužina |
|---|---|---|---|
| Tarabica — kvadratna cev 80×20 | KV000007 (KTWM3865) | N | visina − 40 mm |
| Čep tarabice pun 80×20 | K100018 | N | — |
| Spojna cev 30×30 (gore i dole) | KTWM3899 (2 mm) | 2 | svetli otvor |
| Vijci | — | 2·N | — |

Krojna lista i radni nalog uzimaju iste dužine; cevi stubova ulaze u krojnu listu kao pozicije S1, S2… (tabela stubova u radnom nalogu).

## Radne pretpostavke (nisu u katalogu — proveriti sa majstorom)

- **Visina čepa 40 mm** (polukružni čep 80 mm): tarabica se seče na visinu polja − 40 mm.
- **Spojne cevi** su na 200 mm od vrha i od dna polja i duge su koliko svetli otvor (oslanjaju se na stubove, bez zazora).
- **Debljina zida:** cev 80×20 je 1 mm (KV000007); spojna cev 30×30 je 2 mm (može 1 mm, KTF303010); stub 80×80 je 3 mm, a 100×100 je 2 mm. Katalog nudi i druge debljine.
- **Dužina cevi stuba** je visina stuba iz projekta (bez ukopavanja u beton).
- **Cene:** katalog nema cene, pa su novi materijali u listi „Materijali i cene" sa cenom 0 — uneti nabavne cene da bi kalkulacija bila tačna.
- Prepust se čuva u polju „debljina rama" modela (kod ove ograde nema rama); zato kod kapije sa tarabicom isto polje znači i prepust.
