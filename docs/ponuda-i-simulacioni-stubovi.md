# Ponuda i simulacioni stubovi

Betonski stubovi i betonski stubovi sa podnožjem ostaju u projektu radi prikaza, položaja i svetlih otvora. Ne brišu se iz projekta. Isključeni su iz sastavnice/cene, nabavnog spiska, trebovanja, krojne liste, radnog naloga, proizvodne specifikacije, brojanja stubova za izradu i zbira mase/površine za plastifikaciju. U proizvodnim prikazima ne crtaju se kao delovi za izradu. Simulacioni crtež u editoru i ponudi ih zadržava.

Pravilo važi i za posebne modele 04 i RL10: betonski oslonac ne dodaje aluminijumsku cev stuba, njegove lajsne, stope ili kape. Ako je betonski artikal upisan u specifikaciju, filtrira se iz materijala i rezanja. Podaci o geometriji betonskog oslonca ostaju potrebni za pravilne dužine ograde i kapija.

PDF ponude sadrži zaglavlje firme, osnovne podatke kupca/projekta, crtež, konačnu cenu svakog platna i kapije i ukupan iznos. Nema specifikacije materijala, nabavnih cena, rada/montaže/plastificiranja kao odvojenih troškova, marže, uvećanja, popusta ili interne kalkulacije. Interni obračun u aplikaciji ostaje dostupan.

## Raspodela cene po elementima

Ukupan iznos se i dalje dobija postojećom kalkulacijom. Trošak svake materijalne stavke deli se po utrošku tog materijala po elementima, a zajednički stubovi i ostali zajednički troškovi po širini elemenata. Izrada i montaža po kapiji pripadaju kapiji. Plastificiranje prati površinu elemenata, uz raspodelu zajedničke površine stubova po širini. Cele nabavne šipke i otpad dele se kroz cenu iste BOM stavke, ne dodaju se ponovo po elementu.

Na raspodeljeni trošak primenjuje se isti ukupan faktor zarade, popusta i PDV-a kao u kalkulaciji. U ponudi se prikazuju konačne cene sa PDV-om. Raspodela zaokruživanja obezbeđuje da zbir prikazanih cena bude tačno jednak prikazanom ukupnom iznosu i u RSD i u EUR. Prazni otvori nisu stavke ponude.

Provere: `simulationPosts.test.ts`, `quote.test.ts`, `quotePdf.test.ts` i `e2e/quote.spec.ts`.
