# Masa i površina za plastifikaciju

- Na dnu krojne liste i radnog naloga (i u PDF-u) prikazuju se masa i razvijena površina neto ugrađenih delova.
- Uz svaki element radnog naloga prikazana je masa tog elementa bez zajedničkih stubova, okova i stakla. Zajednički stubovi i njihove izabrane kape/dna uključuju se jednom u ukupni zbir. Kod modela sa neprekinutim rukohvatom nalog već prikazuje karticu niza; navedena masa se odnosi na ceo taj niz.
- Zatvoreni profili: spoljašnji obim preseka × neto dužina. Unutrašnje komore i čela rezova se ne obračunavaju. Kod otvorenih U/L/C preseka računa se obim dostupnih zidova preseka (i unutrašnje strane otvorenog kanala).
- Lim: obe strane, odnosno 2 × ugrađena površina. Ne dodaje se površina tankih bočnih ivica. Kape, rozetne, stope i drugi komadni delovi: približne površine njihovih tela iz crteža; dodirne površine nisu oduzete. Složeni/šematski preseci daju procenu. Perforirane/profilisane ploče se približno tretiraju kao ravne ploče.
- Masa koristi punu preciznost mase materijala (katalog, formula ili ručna/procenjena masa) i neto količine. Jedinica prikaza cene (m/kg/kom) ne menja rezultat.
- Površina za plastificiranje obuhvata aluminijumske delove. Okov, staklo, automatika, inox, čelik, beton, guma, plastika, WPC/HPL i usluge ne ulaze u površinu. Masa ostalih neizuzetih materijala i dalje ulazi u masu materijala.
- Otpad, rez testere, nabavne šipke i finansijska rezerva nisu delovi za plastifikaciju. Model 08 i kod nabavke cele šipke koristi samo dužine isečenih delova.
- `≈` označava procenu. `≥` označava poznati deo nepotpunog zbira; ispod se navode materijali za koje nedostaje masa ili površina. Cena u tom slučaju obuhvata samo poznatu površinu i kalkulacija to označava.
- Izdvajanje pojedinačnog polja iz neprekinutog starog modela 04/RL10 menja krajnje prepuste/spojeve, pa se ta pojedinačna vrednost dodatno označava kao približna. Ukupan obračun projekta zadržava originalni niz. Ugaono parče uz stepenište u nalogu ima sopstvenu masu.

## Cena

Podešavanja → Plastificiranje: neto RSD/m² razvijene površine. Promena važi za sve postojeće i buduće projekte; pojedinačan projekat može imati posebnu cenu u Kalkulaciji, do sledeće promene opšte cene. Cena i projektne vrednosti čuvaju se u postojećoj bazi i sinhronizuju zajedno sa podešavanjima/projektima.

`trošak plastificiranja = površina × cena po m²`

Trošak se dodaje materijalu, radu i montaži pre primene postojeće zarade, popusta i PDV-a. Cena usluge je neto i ne menja se kada se uključi opcija bruto cena **materijala**. U evrima se prikazuje/preračunava kroz postojeći kurs. Stari projekti bez ovog polja imaju cenu 0, pa njihov ukupan iznos ostaje isti dok se ne zada cena plastificiranja.

Provera: `src/tests/finishing.test.ts` obuhvata geometriju, zbir stubova i elemenata, jedinice, otpad, opseg štampe, cenu i čuvanje; `e2e/finishing.spec.ts` proverava ekran, osvežavanje, kalkulaciju i izvoz oba PDF-a.
