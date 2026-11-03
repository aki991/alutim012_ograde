# Od čega se prave ograde: profili po modelima

Izvor: podaci radnika ALU TIM 012 napisani na fotografijama uzoraka (tri fotografije izloga sa ljubičastim tačkama). **Nije potvrđeno** u cenovniku ni u specifikacijama modela: šifre profila, debljine zida, spojevi i cene nisu određeni. Ovo je podsetnik za izradu i osnova za buduće specifikacije.

Svaki uzorak je povezan sa modelom iz kataloga po izgledu (slika u katalogu = broj modela). Veza uzorak–model je **zaključak po izgledu**, ne podatak radnika.

## Šta je radnik rekao

| Fotografija | Uzorci sa tačkom | Podatak radnika |
|---|---|---|
| 1 | donji red, prvi zdesna (tamnosiva žaluzina) | **U profil 60×28** i **Z profil** |
| 2 | gornji red: crna sa horizontalnim letvicama, braon sa horizontalnim letvicama, tamnosiva sa srebrnim linijama; donji red: bela žaluzina i tamnosiva žaluzina (skroz desno) | **Sve vertikale:** U profil sa maskom 25×30 ili U profil 25×20. **Horizontale** zavisno od modela: 80×20, 20×20, 40×20, 60×20, ili kombinacija više profila (npr. 80×20 i 20×20) |
| 3 | donji red: prva i druga sleva (svetlosiva i tamna žaluzina) | **U profil 60×28** i **kutijasti profil 80×20** |

## Po modelima iz kataloga

| Model | Vertikale | Horizontale |
|---|---|---|
| 01 Crna — uske horizontalne letvice | U profil sa maskom 25×30 ili U profil 25×20 | zavisno od modela: 80×20, 20×20, 40×20, 60×20 ili kombinacija (npr. 80×20 + 20×20) |
| 03 Braon — kombinovane horizontalne letvice | isto | isto; široke i uske letvice naizmenično, dakle kombinacija više profila |
| 05 Antracit panel — srebrne linije | isto | isto |
| 11 Bela — horizontalne letvice | isto | isto |
| 08 Svetlosiva — horizontalne žaluzine | U profil 60×28 | kutijasti profil 80×20 |
| 09 Antracit — horizontalne žaluzine | U profil 60×28 | kutijasti profil 80×20; za uzorak sa Z profilom: Z profil |

Modeli bez podatka radnika (02, 04, 06, 07, 10, 12, 13, 14, 15) nisu obeleženi na fotografijama. Za njih nema navedenih profila.

## Otvorena pitanja (razjasniti sa radnikom)

1. **Tamnosiva žaluzina skroz desno** (fotografije 1 i 2) ima dva podatka: „U profil 60×28 i Z profil" (fotografija 1) i „U profil sa maskom 25×30 ili U profil 25×20" (fotografija 2, uz ostale označene uzorke). Koji važi, ili važe oba (npr. različite izvedbe)? Takođe: da li je to model 09 (antracit žaluzine) ili neki drugi?
2. **Horizontale po modelu:** radnik je naveo skup (80×20, 20×20, 40×20, 60×20, kombinacije), ali ne koji model koristi koju meru. Treba tačna dodela za 01, 03, 05 i 11.
3. **U profil sa maskom 25×30 / U profil 25×20:** kada se koristi koji; da li su u cenovniku Ekoluka (npr. U 25×20 ili maska KU000003/KU000004).
4. **Z profil:** koji tačno (u cenovniku su KZ000001 Z mali i KZ000002 Z veliki, a zakošena letvica 80×20 je KZ000003/KZ000004).
5. **U profil 60×28:** šifra, debljina zida i cena (nije u cenovniku Ekoluka; KU000002 je U 60×20×2 i nije zamena).

## Gde je ovo u aplikaciji

- Strana **Modeli ograda**: na kartici modela redovi „Vertikale" i „Horizontale" sa napomenom „podatak radnika, nije potvrđen".
- `src/domain/models/catalog.ts` (`MODEL_CONSTRUCTION`).
- Model 08 (žaluzine) ima i radnu sastavnicu i krojnu listu (`src/domain/pricing/louverSpec.ts`), sa istim podacima kao u ovoj tabeli (U 60×28, letvica 80×20).
