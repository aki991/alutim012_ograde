/**
 * Uputstvo za upotrebu aplikacije ALU TIM 012 — Ograde i kapije. Jedan izvor teksta: prikazuje se na stranici Pomoć (pregled) i
 * pravi se kao PDF za preuzimanje (services/pdfManual.ts). Podebljan tekst se piše između dvostrukih zvezdica: **ovako**.
 */

export type ManualBlock =
  | { p: string }
  /** koraci redom (numerisano) */
  | { steps: string[] }
  /** nabrajanje */
  | { list: string[] }
  /** savet */
  | { tip: string }
  /** upozorenje / važno */
  | { warn: string };

export interface ManualSection { title: string; blocks: ManualBlock[] }
export interface ManualChapter { id: string; title: string; intro?: string; sections: ManualSection[] }

export const MANUAL_TITLE = 'Uputstvo za upotrebu';
export const MANUAL_SUBTITLE = 'Aplikacija za projektovanje ograda i kapija — ALU TIM 012';
export const MANUAL_DATE = 'novembar 2026.';

export const MANUAL: ManualChapter[] = [
  {
    id: 'uvod',
    title: 'Uvod',
    intro: 'Aplikacija služi za projektovanje aluminijumskih ograda i kapija po meri: od crteža i mera, preko obračuna materijala i cene, do ponude za kupca i dokumenata za radionicu (krojna lista, radni nalog, skica).',
    sections: [
      {
        title: 'Šta aplikacija radi',
        blocks: [
          { list: [
            '**Projektovanje**: ograda se slaže od platna (polja), kapija, praznih prostora i stubova, na 2D crtežu i u 3D prikazu.',
            '**Modeli ograda**: svaki model je crtež jednog polja ograde (letvice, prečke, ram, U profili) od materijala iz cenovnika. Model se crta u aplikaciji i sam se prilagođava svakoj meri polja.',
            '**Kapije**: pešačka, jednokrilna, dvokrilna, klizna po šini i samostojeća (samonoseća) klizna kapija, sa okovom i automatikom.',
            '**Kalkulacija**: materijal iz crteža i sastavnice modela, rad, montaža, marža, popust i PDV.',
            '**Dokumenti**: PDF ponuda, krojna lista sa rasporedom na šipke, radni nalog za majstora, skica sa kotama i spisak materijala (tabela ili PDF).',
            '**Magacin**: cele šipke i ostaci; ostaci se koriste prvi pri sečenju.',
            '**Zajednički rad**: podaci se čuvaju na uređaju i usklađuju preko interneta za sve naloge firme.',
          ] },
        ],
      },
      {
        title: 'Uobičajen tok rada',
        blocks: [
          { steps: [
            'Napravite **Novi projekat** (dugme u zaglavlju) i izaberite kupca.',
            'U katalogu ispod crteža izaberite **Model ograde** i dodajte platna i kapije.',
            'Podesite mere: ukupnu dužinu, širinu i visinu polja, stubove i kapije.',
            'Proverite cenu u panelu **Kalkulacija cene** i po potrebi **Detaljan obračun**.',
            'Napravite **PDF ponudu** i pošaljite je kupcu; status projekta promenite u „Ponuda“.',
            'Kad kupac prihvati: **Krojna lista**, **Radni nalog** i **Skica** za radionicu, a status „U izradi“.',
            'Po završetku status „Završeno“ (ostaci sečenja idu u magacin).',
          ] },
          { tip: 'Sve se čuva samo. Ne postoji dugme koje morate da pritisnete da se projekat sačuva (status čuvanja vidi se u zaglavlju).' },
        ],
      },
    ],
  },
  {
    id: 'prijava',
    title: 'Prijava, nalozi i lozinka',
    sections: [
      {
        title: 'Prijava',
        blocks: [
          { steps: [
            'U polje **E-mail ili korisničko ime** upišite svoje korisničko ime (npr. „bojan“) ili e-mail adresu.',
            'Upišite lozinku i kliknite **Prijavi se**. Ikonica oka prikazuje lozinku dok kucate.',
          ] },
          { p: 'Ako piše „Pogrešno korisničko ime, e-mail ili lozinka.“, proverite da li je dobro upisano korisničko ime i da li je uključen Caps Lock. Nalog dobijate od šefa ili administratora; isti nalog važi u Ogradama i u aplikaciji Stolarija.' },
          { p: '**Rad bez interneta**: kad nema interneta, a prijava je istekla, na ekranu za prijavu izaberite **Nastavi bez interneta (gost)**. Radite sa podacima sačuvanim na uređaju; sve izmene se šalju čim se veza vrati i ponovo se prijavite.' },
        ],
      },
      {
        title: 'Uloge',
        blocks: [
          { list: [
            '**Administrator**: sva ovlašćenja, uključujući naloge drugih administratora.',
            '**Šef**: projekti, cene, modeli i podešavanja; pravi i menja naloge zaposlenih.',
            '**Majstor**: rad na projektima i dokumentima; ime na svom profilu menja šef.',
          ] },
        ],
      },
      {
        title: 'Promena sopstvene lozinke',
        blocks: [
          { steps: [
            'Otvorite **Podešavanja** (meni levo ili korisnički meni gore desno).',
            'U kartici **Firma i korisnik** nađite okvir **Lozinka naloga …** i kliknite **Promeni lozinku**. (Šef to isto dugme ima i kao **Lozinka** u svom redu u tabeli **Nalozi zaposlenih**.)',
            'Upišite trenutnu lozinku, pa dva puta novu (najmanje 8 znakova) i kliknite **Sačuvaj lozinku**.',
          ] },
          { p: 'Nova lozinka odmah važi i u Ogradama i u Stolariji.' },
        ],
      },
      {
        title: 'Nalozi zaposlenih (šef i administrator)',
        blocks: [
          { p: 'U **Podešavanja → Nalozi zaposlenih** šef pravi nalog: korisničko ime ili e-mail, ime i prezime, početna lozinka (najmanje 8 znakova) i uloga (šef ili majstor), pa **Napravi nalog**. **Postojeći nalog** povezuje nalog koji već postoji u Stolariji.' },
          { list: [
            '**Izmeni**: ime i prezime i korisničko ime. Stvarnu e-mail adresu menja samo administrator.',
            '**Obriši**: nalog više ne može da se prijavi ni u Ograde ni u Stolariju; sačuvani poslovi ostaju. Ne može se obrisati sopstveni nalog ni administrator.',
            'Lozinku zaposlenog šef ne menja: posle prve prijave svako je menja sam.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'izgled',
    title: 'Izgled aplikacije i Početna strana',
    sections: [
      {
        title: 'Meni i zaglavlje',
        blocks: [
          { p: 'Meni levo vodi na stranice: Početna, Projekti, Modeli ograda, Modeli kapija, Materijali i cene, Magacin, Kupci, Ponude, Proizvodnja, Izveštaji, Podešavanja i Pomoć. Na telefonu se meni otvara dugmetom sa tri crte.' },
          { list: [
            '**Novi projekat** (žuto dugme gore desno) pravi prazan projekat i otvara editor.',
            '**Zvonce** prikazuje obaveštenja (specifikacije sa terena, vidi poglavlje Obaveštenja).',
            '**Status čuvanja i oblak**: da li su izmene sačuvane i poslate u bazu, ili se čeka internet.',
            '**Korisnički meni** (ime gore desno): naziv firme, Podešavanja, Pomoć i Odjava.',
          ] },
        ],
      },
      {
        title: 'Početna strana',
        blocks: [
          { list: [
            '**Novi projekat / Pogledaj projekte**: brz početak rada.',
            '**Kartice** Projektovanje, Kalkulacija, Ponuda i Proizvodnja otvaraju poslednji projekat ili odgovarajuću stranicu.',
            '**Popularni modeli ograda**: pet modela sa stranice Modeli ograda; prvi su oni koji se najviše koriste u projektima. Klik pravi nov projekat sa tim modelom.',
            '**Nedavni projekti**: poslednja četiri projekta sa akcijama Otvori, Dupliraj i Obriši.',
            '**Brzi statistički pregled**: aktivni projekti, broj kupaca, vrednost ponuda (projekti u statusu „Ponuda“, sa PDV-om) i završeni projekti; za sve projekte ili ovaj mesec.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'projekti',
    title: 'Projekti',
    sections: [
      {
        title: 'Spisak projekata',
        blocks: [
          { p: 'Stranica **Projekti** prikazuje sve projekte sa sličicom crteža, kupcem, statusom, ukupnom dužinom i datumom izmene. Pretraga radi po nazivu projekta, kupcu i broju ponude; filter bira status.' },
          { list: [
            '**Statusi**: Nacrt → Ponuda → U izradi → Završeno. Status „U izradi“ i „Završeno“ knjiže materijal u magacinu (vidi Magacin).',
            '**Materijal** (dugme u redu): spisak materijala tog projekta kao **Tabela (Excel / CSV)** ili **PDF**, bez cena — sve što treba za ogradu i kapije, grupisano (profili, ramovi, stubovi, nosači, vijci, šarke…), sa količinom po crtežu i količinom za nabavku.',
            '**⋯ meni**: Otvori, Izmeni podatke (naziv, kupac, status, napomena), Dupliraj, Izvezi JSON, Obriši.',
            '**Uvezi JSON** (gore desno): vraća projekat iz ranije izvezenog fajla.',
          ] },
          { warn: 'Obrisan projekat se ne može vratiti. Za rezervnu kopiju pre brisanja koristite Izvezi JSON.' },
        ],
      },
      {
        title: 'Podaci o projektu i kupcu',
        blocks: [
          { p: 'U editoru, ispod kataloga, kartica **Podaci o projektu / kupcu** sadrži kupca, status, datum, broj ponude i napomenu. **Uredi** otvara isti sadržaj u prozoru, sa nazivom projekta i brojem ponude.' },
          { p: 'Kupca birate iz padajućeg menija. Ako kupac još ne postoji, izaberite **+ Novi kupac (ručni upis)…**, upišite podatke i sačuvajte: kupac se odmah pravi na stranici Kupci i postavlja na projekat.' },
        ],
      },
    ],
  },
  {
    id: 'editor',
    title: 'Editor: crtanje ograde',
    intro: 'Editor se otvara iz projekta. Gore je crtež (2D ili 3D), ispod njega katalog elemenata i podaci o projektu, a desno panel svojstava sa cenom i dokumentima.',
    sections: [
      {
        title: 'Katalog elemenata',
        blocks: [
          { p: '**Model ograde** (padajući meni na vrhu kataloga) važi za ceo projekat: promena modela menja sva platna i kapije.' },
          { list: [
            '**Platno**: polje ograde izabranog modela.',
            '**Pešačka, Jednokrilna i Dvokrilna kapija**: krilna kapija od istog modela. Ako za ogradu postoje vaši tipovi kapija, iznad dugmeta je izbor tipa („Osnovna kapija“ ili tip).',
            '**Klizna kapija** (po šini u podu) i **Samostojeća klizna kapija** (samonoseća, sa kolicima i repom): dugmad **Ručna** i **Motorna**.',
            '**Prazan prostor**: slobodan otvor bez ispune.',
            '**Stubovi** (aluminijumski, betonski, betonski sa podnožjem…): primenjuju se na izabrani stub ili na sve.',
          ] },
          { steps: [
            'Kliknite **Dodaj** na kartici: element se dodaje na kraj ograde.',
            'Ili prevucite karticu na crtež: crvena linija pokazuje gde će element biti ubačen.',
          ] },
          { tip: 'Novi element preuzima mere i izgled izabranog (ili poslednjeg) polja ograde.' },
        ],
      },
      {
        title: 'Rad na crtežu',
        blocks: [
          { list: [
            '**Klik** na element ili stub ga bira; desno se otvara njegov panel.',
            '**Ctrl + klik** dodaje polje u izbor, **Shift + klik** bira niz polja, a prevlačenje po pozadini crta okvir za izbor. Za izabrana polja menjaju se visina i boja odjednom.',
            '**Dugme +** desno od poslednjeg stuba dodaje sledeći element (vrsta, dužina, visina i tip krajnjeg stuba).',
            '**Pomeri levo / desno** ili prevlačenje menja redosled; **Dupliraj** pravi kopiju; **Obriši** (ili taster Delete) briše.',
            '**Poništi / Ponovi** (Ctrl+Z / Ctrl+Shift+Z) vraćaju izmene.',
            '**Zoom** (Ctrl + točkić ili dugmad), **Uklopi u ekran** i **Pun ekran** su iznad crteža; srednji taster ili Razmaknica + prevlačenje pomeraju prikaz.',
            '**Opcije prikaza** (dugme sa klizačima): kote, oznake elemenata, mreža i izvoz crteža u SVG.',
          ] },
        ],
      },
      {
        title: '3D prikaz',
        blocks: [
          { p: 'Tab **3D** prikazuje ogradu u prostoru: levi taster okreće, desni pomera, točkić zumira. Kapije se otvaraju i zatvaraju (bez uticaja na cenu). U režimu **Uređivanje** elementi se prevlače i u 3D prikazu.' },
        ],
      },
      {
        title: 'Crtanje ograde po trasi',
        blocks: [
          { steps: [
            'Kliknite **Nacrtaj ogradu**: otvara se pogled odozgo.',
            'Klikom postavljate tačke trase; uz svaku stranicu stoji kota. Upišite dužinu u mm i pritisnite Enter za tačnu meru. Shift isključuje hvatanje ugla (15°), Backspace vraća poslednju tačku.',
            '**Završi crtanje** (Enter ili dvoklik): dužine i uglove menjate u tabeli ili povlačenjem tačaka.',
            '**Napravi ogradu**: svaka stranica se deli na polja do 2000 mm sa stubovima; na skretanju nastaje stub sa uglom.',
          ] },
          { warn: 'Napravi ogradu zamenjuje postojeće elemente projekta (može se poništiti sa Ctrl+Z).' },
        ],
      },
      {
        title: 'Simulacija na fotografiji',
        blocks: [
          { p: 'Uključuje se u **Podešavanja → Napredne opcije**. Tab **Simulacija** učitava fotografiju dvorišta (ili je slikate telefonom) i postavlja ogradu na nju. Četiri kružića su uglovi ograde: povucite ih da se poklope sa mestom na slici. **Preuzmi sliku** čuva sliku sa ogradom (JPG).' },
        ],
      },
    ],
  },
  {
    id: 'mere',
    title: 'Mere i raspored',
    sections: [
      {
        title: 'Dužine i kote',
        blocks: [
          { list: [
            '**Mera elementa** je njegova ukupna (spoljna) dužina na terenu, zajedno sa po pola susednih stubova. **Svetli otvor** je čist prostor između stubova (iz njega se seku delovi ispune).',
            '**Ukupna dužina**: klik na kotu ispod crteža menja dužinu cele ograde; platna dobijaju istu dužinu, a kapije i otvori ostaju isti.',
            '**Kota širine** iznad elementa i **kota H** (visina) menjaju meru klikom. Dozvoljen opseg piše u prozoru.',
            '**Katanac** na koti zaključava meru: zaključano polje se ne menja pri automatskom raspoređivanju.',
            '**Visina (svi)** u panelu menja visinu svih platna ili svih kapija odjednom.',
          ] },
          { p: 'U **Osnovnim karakteristikama** (panel desno kad ništa nije izabrano) su naziv projekta, model, boja i visina za sve, ukupna dužina, broj stubova i razmak stubova, podnožje i raspodela: **Automatski rasporedi** deli zadatu dužinu na jednaka polja, a **Ostavi slobodan prostor** ostavlja ostatak kao prazan prostor.' },
          { tip: 'Napredni prikaz dužina (osa–osa stubova, zbir svetlih otvora, fiksna ukupna dužina) uključuje se u Podešavanja → Napredne opcije.' },
        ],
      },
      {
        title: 'Rotacija polja',
        blocks: [
          { p: 'Kod ograde za terasu **Rotacija polja** zadaje ugao prema prethodnom polju, gledano odozgo: pozitivan ugao skreće udesno, a negativan ulevo. Izaberite **−90°, −45°, Ravno, +45° ili +90°**, ili upišite ugao ručno. Prvo polje je polazno; skretanje zadajte na sledećem polju.' },
        ],
      },
      {
        title: 'Ojačanje platna',
        blocks: [
          { p: 'Kod ručno nacrtanih modela platno šire od **2,5 m** automatski dobija uspravne cevi koje ga dele na manje delove, širine do 2,5 m. U **Svojstva → Ojačanje (cevi)** uspravne i vodoravne cevi uključujete prekidačima **Da/Ne**. Kada su uspravne cevi uključene, prikazuje se polje **Broj uspravnih cevi**. **Vrati automatski**, kada je dostupno, vraća automatski obračun broja cevi.' },
          { p: '**Vodoravna cev** deli platno po visini i spaja se sa ramom ili bočnim vođicama. Posle uključivanja zadajte visinu ose od dna ispune u milimetrima. **Materijal cevi** birate iz cenovnika; program predlaže cev prema dubini modela. Ojačanje važi i za krila kapija ručno nacrtanih modela.' },
        ],
      },
      {
        title: 'Raspored ispune',
        blocks: [
          { p: 'U panelu izabranog platna su mere rasporeda: razmak između letvica ili prečki, odstojanje od stubova (od levog stuba do prve letvice, od poslednje do desnog) i od dna i vrha ispune. Broj letvica i prečki se sam preračunava za širinu i visinu polja, sa jednakim razmakom. **Vrati podrazumevane mere** vraća mere iz modela.' },
          { p: '**Podnožje** (betonsko): visina i širina podnožja ispod polja; može se zadati za izabrano polje ili za sve.' },
          { p: 'Ograda i stubovi stoje na podnožju zadate visine. Podrazumevana širina podnožja obuhvata polje i stubove. Šire podnožje širi i ogradu, pa se susedni elementi pomeraju; kraće podnožje je centrirano ispod polja.' },
        ],
      },
    ],
  },
  {
    id: 'stubovi',
    title: 'Stubovi',
    sections: [
      {
        title: 'Izbor i izmena stuba',
        blocks: [
          { p: 'Kliknite stub na crtežu. Prekidač **Izmene važe za** bira „Sve stubove“ ili „Samo ovaj stub“; sa Ctrl + klik birate više stubova.' },
          { list: [
            '**Tip**: aluminijumski, betonski, betonski sa podnožjem. Stub uz kapiju se sam postavlja kao stub kapije.',
            '**Širina preseka** (80, 100, 120 mm ili upisano), **Visina** (automatska prati ogradu; ručna se vraća dugmetom **Vrati automatsku visinu**), **Boja** i **Montaža** (na betonsku podlogu, ugradnja u beton, na zid).',
            '**Ugao skretanja** (na međustubovima): + udesno, − ulevo; dugmad −90°, −45°, Ravno, 45°, 90°. Na poslednjem stubu **Ugao ograde** nastavlja ogradu novim platnom pod uglom.',
          ] },
        ],
      },
      {
        title: 'Kapa i dno stuba',
        blocks: [
          { p: '**Kapa (vrh)** i **Dno (rozetna)** biraju se iz cenovnika. Nude se samo delovi koji odgovaraju stubu: za vrh kape, čepovi i poklopci, za dno rozetne, stope i prirubnice, i to samo one čija mera u nazivu odgovara preseku stuba (stub 100×100 → „Kapa … 100×100“, okrugli Ø40 → „… Ø40“).' },
          { p: 'Izabrana kapa i dno se crtaju u 2D i 3D prikazu u boji stuba i ulaze u cenu i spisak materijala, po komad na svaki stub.' },
          { tip: 'Ako za presek stuba nema dela, ispod polja piše „U cenovniku nema kape ni čepa za stub …“. Dodajte materijal u Materijali i cene sa merom u nazivu.' },
        ],
      },
      {
        title: 'Šabloni stubova',
        blocks: [
          { p: 'Šabloni se menjaju u **Podešavanja → Šabloni stubova**. Izbor šablona u svojstvima važi za stubove obuhvaćene podešavanjem **Izmene važe za**.' },
          { p: 'Šablon je sačuvan stub (tip, presek iz cenovnika, visina, montaža, boja, kapa i dno). Pravi se u **Podešavanja → Šabloni stubova** ili dugmetom **Sačuvaj stub kao šablon** u panelu stuba.' },
          { steps: [
            'Izaberite stub (ili sve stubove).',
            'U meniju **Šablon stuba** izaberite šablon: stub dobija sve njegove osobine.',
            'Stavka **Osnovni stub** vraća stub kakav je bio kad je ograda postavljena.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'kapije',
    title: 'Kapije',
    sections: [
      {
        title: 'Krilne kapije (pešačka, jednokrilna, dvokrilna)',
        blocks: [
          { list: [
            '**Otvaranje**: levo ili desno, ka unutra ili ka spolja.',
            '**Šarke**, **Brava** (standardna, sa cilindrom, elektro-brava) i **Automatika** (tip pogona).',
            '**Dvokrilna**: **Različita krila** sa širinom levog krila i **Razmak između krila**.',
            '**Stubovi kapije**: **Svoj stub sa strane** daje kapiji sopstveni stub pored stuba ograde (dva stuba sa razmakom).',
          ] },
          { p: 'Svako krilo dvokrilne kapije je zasebno: ima svoj ram i svoju ispunu, pa krojna lista i sastavnica idu po krilu. Skica dvokrilne kapije prikazuje jedno krilo („krilo … (2 krila)“).' },
        ],
      },
      {
        title: 'Mere kapije',
        blocks: [
          { p: 'Dugme **Mere kapije** u panelu kapije otvara prozor sa tabovima (gore su i **Sačuvaj kao model** i **PDF mera kapije**):' },
          { list: [
            '**Mere**: ručne kote kapije (svetli otvor, zazori, širina krila…), sa skicom mera.',
            '**Okovi**: šarke, brave, točkići i ostali okov iz cenovnika (neupisan okov ostaje „nepoznata oznaka“ dok se ne doda u cenovnik).',
            '**Sastavnica**: delovi kapije sa količinama.',
            '**Stubovi**: stubovi uz kapiju.',
          ] },
        ],
      },
      {
        title: 'Moji tipovi kapija',
        blocks: [
          { p: 'Tip kapije je drugačije nacrtana kapija za određenu ogradu (npr. samonoseća klizna od letvica te ograde). Tip se nudi i dodaje samo uz svoju ogradu. U katalogu editora se bira u meniju iznad kartice kapije; **Osnovna kapija** vraća običnu kapiju ograde. Tipovi se prave na stranici **Modeli kapija** (vidi to poglavlje) ili iz projekta: Mere kapije → **Sačuvaj kao model**.' },
        ],
      },
      {
        title: 'Klizne kapije',
        blocks: [
          { list: [
            '**Klizna po šini**: krilo na točkićima po podnoj šini.',
            '**Samostojeća (samonoseća)**: krilo visi na kolicima preko nosećeg C-profila, sa repom; nema šine u otvoru.',
            '**Ručna / Motorna**: motorna dobija zupčastu letvu, motor, krajnje prekidače, fotoćelije i lampu.',
          ] },
          { p: 'Panel klizne kapije prikazuje sklop: hod, odstojanje rama od tla, točkiće ili kolica, šinu ili C-profil, rep i provere (npr. da li su točkići na šini kroz ceo hod). **Prostor za povlačenje** upozorava ako krilu nema mesta da se otvori.' },
          { p: '**Šina i C-profil**: polazna podna šina je 6000 mm (jedna nabavna šipka). Ako je šina ili C-profil duži od 6 m (npr. 6500 mm), krojna lista i radni nalog daju jednu celu šipku od 6000 mm i nastavak od 500 mm, koji se spajaju varenjem.' },
          { warn: 'Materijal šine, C-profila i delova repa birate u panelu kapije. Dok nije izabran, u krojnoj listi piše „… — nije definisano“.' },
        ],
      },
    ],
  },
  {
    id: 'modeli',
    title: 'Modeli ograda',
    sections: [
      {
        title: 'Stranica Modeli ograda',
        blocks: [
          { p: 'Svaka kartica je jedan model sa crtežom polja. Dugmad na kartici:' },
          { list: [
            '**Otvori crtež**: crtanje modela (izmena delova).',
            '**Koristi model**: nov projekat sa modelom, ili primena na izabrano polje otvorenog projekta.',
            '**Sastavnica**: sav materijal modela (vidi poglavlje Sastavnica). Tačkica na dugmetu znači da je sastavnica dopunjena ili menjana.',
            '**Obriši** (crvena ikona): briše model. Projekti koji ga koriste prelaze na drugi model.',
          ] },
          { p: '**Napravi model** (gore desno) otvara prazno crtanje za nov model.' },
          { warn: 'Originalni modeli iz kataloga su obrisani i ne postoje u aplikaciji; koriste se vaši nacrtani (dorađeni) modeli.' },
        ],
      },
    ],
  },
  {
    id: 'crtanje',
    title: 'Crtanje modela',
    intro: 'Model je crtež jednog polja ograde (ili krila kapije) od stvarnih materijala iz cenovnika. Iz crteža se računaju krojna lista, cena i skica, a model se sam prilagođava svakoj meri polja.',
    sections: [
      {
        title: 'Crtanje i izbor delova',
        blocks: [
          { steps: [
            'Levo izaberite materijal iz cenovnika (grupe: cevi, U profili, letvice, ploče, kape, okov…).',
            'Povucite po polju: profil od početka do kraja, ploču kao pravougaonik. Profili se crtaju vodoravno ili uspravno.',
            'Klik bira deo, Ctrl + klik dodaje u izbor, okvir po praznom bira više delova. Strelice pomeraju, Delete briše; desni taster pomera papir, točkić zumira.',
          ] },
          { list: [
            '**Privlačenje** (uključeno): ivice dela se privlače uz susedne delove i tlo (ljubičasta linija); Alt ga privremeno isključuje.',
            'Prečka nacrtana između dva uspravna **U profila** sama se uklapa u njihov kanal. **Raspored prečki** zadaje broj, odstojanje od vrha i dna i razmak (sa luftom ili bez).',
            '**Postavi pod uglom uklapanja**: nagnute prečke u U profilu (žaluzine).',
            '**Zameni materijal**: drugi materijal za izabrane delove (U profili u paru, prečke iste grupe zajedno).',
            '**Dupliraj / Napravi kopije**: niz istih delova sa razmakom.',
            '**Slobodno crtanje** dozvoljava preklapanja i proizvoljne uglove; **Vrati normalno crtanje** vraća pravila.',
          ] },
        ],
      },
      {
        title: 'Ram, pad terena, šarke',
        blocks: [
          { list: [
            '**Dodaj ram**: profil i strane rama (levo, desno, gore, dole). Uglovi su pod 45° samo gde se dve strane sastaju; slobodan kraj je ravan. **Obriši ram** ga uklanja.',
            '**Dodaj pad**: ograda na terenu u padu (koso sečeni donji krajevi, lim za popunu ili **Bez lima**).',
            '**Dodaj šarke** (kapija): šarke duž jedne ivice krila. Klizna kapija dobija klizni okov dugmićima u traci okova.',
          ] },
          { p: 'Model sa ramom zadržava debljinu rama na svakoj meri; unutrašnji delovi se produžavaju za razliku. Krojna lista prati crtež i kod modela sa ramom.' },
        ],
      },
      {
        title: 'Mere, pravila i provera',
        blocks: [
          { list: [
            '**Mere ograde**: ukupna širina i visina crteža.',
            '**Pravila promene veličine po delu**: svaki deo može da se drži leve, desne, donje ili gornje ivice, da se proteže ili da raste srazmerno; preračun niza letvica može da se isključi.',
            '**Upozorenja**: preklapanja, skoro vodoravni ili uspravni delovi, nejednaki razmaci i problemi na drugim merama polja. Upozorenje koje ima smisla se **prihvata** (ostaje na spisku prihvaćenih).',
            '**Proba veličina**: isti model na uskom, uobičajenom, visokom i širokom polju, jedan pored drugog.',
            '**Boja modela**: svi delovi dobijaju boju modela.',
          ] },
        ],
      },
      {
        title: 'Skica i čuvanje',
        blocks: [
          { p: 'Prikaz **Skica** daje skicu sa kotama za majstora: lanci mera, mesta zavarivanja, tabela delova (broj, presek, dužina, komada) i presek prečke u U profilu. Preuzima se kao PDF ili **SVG**.' },
          { p: '**Sačuvaj kao nov model** čuva crtež kao nov model; **Sačuvaj na istom tipu** zamenjuje model iz kog je dorada nastala.' },
        ],
      },
    ],
  },
  {
    id: 'sastavnica',
    title: 'Sastavnica modela',
    sections: [
      {
        title: 'Šta je sastavnica',
        blocks: [
          { p: 'Sastavnica je spisak svega što se troši za **jedno polje** ograde (i za kapiju sa tom ispunom). Iz nje se računaju spisak materijala, krojna lista i cena svakog projekta sa tim modelom. Otvara se dugmetom **Sastavnica** na kartici modela.' },
          { list: [
            '**Sivi redovi** su delovi crteža modela (ram, U profili, letvice). Menjaju se u crtanju modela, ne ovde.',
            '**Dodaj element** dodaje sav ostali materijal koji ide uz ogradu: vijke, nosače, čepove, kape… Izaberite materijal i grupu i upišite količinu po polju.',
            '**Ukloni dodati materijal** briše sve dodato; **Sačuvaj sastavnicu** čuva izmene.',
          ] },
          { p: 'Primer: ako uz svako polje idu 8 vijaka, dodajte element „Vijak“ sa količinom 8. U projektu sa tri polja i kapijom vijci se pojavljuju u ukupnom spisku materijala, krojnoj listi okova i ceni.' },
        ],
      },
      {
        title: 'Formule',
        blocks: [
          { p: 'Količina i dužina reza su formule (+ − × / zagrade, ceil, floor, round, min, max, abs). Najvažnije promenljive:' },
          { list: [
            '**W** — svetli otvor polja (mm), **H** — visina polja (mm), **A** — razmak osa stubova.',
            '**HBAR0, HBAR1…** — broj vodoravnih prečki svake vrste iz crteža, preračunat za visinu polja.',
            '**SLATS** — broj uspravnih letvica, preračunat za širinu polja (kod dvokrilne kapije po krilu).',
            '**PERIM, AREA** — obim i površina polja.',
          ] },
          { p: 'Kolona **Rezultat (primer)** računa za primer polja (menja se gore, npr. 2000 × 1600 mm). U projektu se računa sa stvarnim merama svakog polja.' },
        ],
      },
    ],
  },
  {
    id: 'modeli-kapija',
    title: 'Modeli kapija',
    sections: [
      {
        title: 'Stranica Modeli kapija',
        blocks: [
          { list: [
            '**Osnovne kapije**: kapije koje se prave od ograde iz projekta (pešačka, jednokrilna, dvokrilna, klizne). **Doradi** otvara crtež osnovne kapije za izmenu.',
            '**Moji tipovi kapija**: nacrtane kapije za određenu ogradu, sa dugmadima Koristi model, Otvori crtež i Obriši. Tip može biti podrazumevan za svoju ogradu (tada je unapred izabran u katalogu editora).',
            '**Napravi model**: nov tip kapije od nule (izbor vrste kapije, crtanje krila, Mere kapije, klizni okov).',
          ] },
        ],
      },
    ],
  },
  {
    id: 'materijali',
    title: 'Materijali i cene',
    sections: [
      {
        title: 'Cenovnik',
        blocks: [
          { p: 'Cenovnik koriste kalkulacija, crtanje modela i sastavnice. Klik na red prikazuje crtež preseka i karakteristike.' },
          { list: [
            '**Dodaj materijal**: šifra, naziv, kategorija, jedinica (m, kom, set, m², kg), cena i otpad (%).',
            '**Izmeni**: cena, otpad, mere preseka (A, B, zid), masa (kg/m); **Vrati mere iz cenovnika** poništava ručne mere.',
            '**Nacrtaj element** / **Presek iz slike**: ručno nacrtan presek profila (ima prednost nad presekom iz naziva).',
            'Mera u nazivu je važna: po njoj se prepoznaju presek, kape i rozetne za stub.',
          ] },
        ],
      },
      {
        title: 'Uvoz i izvoz cenovnika',
        blocks: [
          { p: '**Izvezi materijale** preuzima cenovnik kao PDF ili Excel/CSV. **Uvezi materijale** menja cene iz PDF-a (sa pravim tekstom, ne sken), Excel (.xlsx) ili CSV tabele: kolone se prepoznaju po naslovu (Šifra, Naziv, Jedinica, Cena bez PDV-a). Pre primene se prikazuju stara i nova cena, procenat promene i redovi koji se ne mogu upariti.' },
          { warn: 'Izmene cena važe za sve projekte. Pre velikog uvoza izvezite rezervnu kopiju cenovnika.' },
        ],
      },
    ],
  },
  {
    id: 'magacin',
    title: 'Magacin i ostaci',
    sections: [
      {
        title: 'Stanje',
        blocks: [
          { p: 'Stranica **Magacin** vodi cele šipke i ostatke: materijal, dužina, broj komada i napomena (npr. polica). **Dodaj na stanje** upisuje komade, a **Obriši sve** prazni magacin.' },
        ],
      },
      {
        title: 'Ostaci pri sečenju',
        blocks: [
          { steps: [
            'Pre krojne liste aplikacija pita da li imate ostatke koje treba prvo iskoristiti.',
            'Dodajte ostatke ručno ili klikom na stavke iz magacina (nude se samo profili ovog projekta), pa **Prikaži krojnu listu**.',
            'Ostaci se koriste prvi; nova šipka se otvara tek kad u ostatke više ništa ne staje.',
          ] },
          { p: 'Kad projekat pređe u status **U izradi** ili **Završeno** (ili se klikne **Potvrdi sečenje** u pregledu krojne liste), korišćeni ostaci se skidaju sa stanja, a novi ostaci duži od zadate mere (Podešavanja → Sečenje materijala → Najkraći ostatak za magacin) se dodaju. Vraćanje statusa ili **Poništi sečenje** to poništava.' },
        ],
      },
    ],
  },
  {
    id: 'kupci',
    title: 'Kupci',
    sections: [
      {
        title: 'Kupci',
        blocks: [
          { p: 'Stranica **Kupci**: ime ili naziv firme, telefon, e-mail, adresa i napomena. **Dodaj kupca** pravi novog, **Izmeni** i **Obriši** u redu. Klik na ime prikazuje projekte kupca. Kupac se može dodati i iz projekta (**+ Novi kupac (ručni upis)…**).' },
          { p: 'Brisanjem kupca projekti ostaju, ali bez kupca.' },
        ],
      },
    ],
  },
  {
    id: 'kalkulacija',
    title: 'Kalkulacija i ponuda',
    sections: [
      {
        title: 'Kalkulacija cene',
        blocks: [
          { p: 'Panel **Kalkulacija cene** (desno u editoru) prikazuje materijal, rad, montažu, popust i ukupno sa PDV-om. **Detaljan obračun** otvara spisak materijala sa količinama i cenama i parametre cene projekta.' },
          { list: [
            '**Geometrijska količina** je iz crteža; **nabavna** uključuje otpad iz cenovnika (profili) i zaokruživanje komada.',
            '**Marža** je udeo u prodajnoj ceni, **uvećanje** procenat na nabavnu osnovicu; **popust** se računa na prodajnu cenu, **PDV** na osnovicu posle popusta.',
            'Izmena cene u obračunu menja cenovnik (važi za sve projekte).',
            '**Delovi ograde (materijali)** u panelu polja menja materijal pojedinog mesta u sastavnici samo za ovaj projekat.',
          ] },
        ],
      },
      {
        title: 'PDF ponuda',
        blocks: [
          { p: 'Dugme **PDF ponuda** otvara pregled ponude: zaglavlje sa logotipom i podacima firme, kupac, crtež, pogled odozgo i 3D prikaz, lista elemenata, specifikacija materijala i obračun. **Sačuvaj PDF** preuzima fajl. Isti pregled je na stranici **Ponude**.' },
          { tip: 'Podaci firme (adresa, telefon, e-mail, PIB) unose se u Podešavanja → Firma i korisnik i štampaju se na svim dokumentima.' },
        ],
      },
    ],
  },
  {
    id: 'proizvodnja',
    title: 'Dokumenti za radionicu',
    intro: 'Krojna lista, radni nalog i skica otvaraju se iz panela desno u editoru (ispod cene) ili sa stranice Proizvodnja. Svaki prvo prikazuje pregled, a Sačuvaj PDF ga preuzima. Izbor Štampa bira: Ceo projekat, Samo kapije ili Ograda bez kapija.',
    sections: [
      {
        title: 'Krojna lista',
        blocks: [
          { list: [
            'Svi komadi profila se raspoređuju na nabavne šipke (dužina šipke i širina testere iz Podešavanja → Sečenje materijala; svaki rez troši širinu testere). Šrafirani deo šipke je ostatak.',
            'Komad je u boji svoje **pozicije** (P1, P2… = element projekta; S1, S2… = stubovi), sa dužinom u mm. Šipke istog rasporeda su spojene („Šipke 1–4 × 4“). Ispod profila je zbirni spisak: dužina, komada i pozicije.',
            'Delovi rama se crtaju kao trapez sa oznakom 45° (rez pod 45°, dužina je spoljna mera). Komadi sa drugim uglovima imaju upisane uglove.',
            '**Štednja materijala** (Podešavanja): komadi sa istim kosim rezom dele jedan rez kad to štedi šipke.',
            'Staklo, okov i delovi bez dužine reza nisu u krojnoj listi (vide se u spisku materijala i radnom nalogu).',
          ] },
        ],
      },
      {
        title: 'Radni nalog',
        blocks: [
          { p: 'Nalog za majstora koji sklapa ogradu: shema ograde u bojama pozicija, kartica svakog elementa (delovi sa dužinom i brojem komada, mere, boja, okov kapije, kod klizne kapije izvedba, krilo, šina ili C-profil, rep i hod) sa sklopnim crtežom i brojevima delova, tabela stubova, okovi i sitan materijal za ceo projekat, kontrolne tačke i mesta za potpis.' },
        ],
      },
      {
        title: 'Skica',
        blocks: [
          { p: 'Skica sa kotama za svaki element: polje ograde na meri svetlog otvora, krilo kapije na meri krila. Isti elementi ograde (isti model i mera) crtaju se jednom („Element 1, 2 (2 kom)“). Na skici su lanci mera, mesta zavarivanja i tabela delova; mere su iste kao u krojnoj listi.' },
        ],
      },
      {
        title: 'Spisak materijala i strana Proizvodnja',
        blocks: [
          { p: 'Spisak materijala projekta (bez cena) preuzima se dugmetom **Materijal** na stranici Projekti, kao tabela (Excel/CSV) ili PDF. Stranica **Proizvodnja** za izabrani projekat prikazuje redosled elemenata, delove, krojnu listu na ekranu, okove i automatiku, sa dugmadima Radni nalog, Skica, PDF specifikacija i CSV lista materijala. **Potvrdi sečenje** / **Poništi sečenje** su u pregledu krojne liste.' },
        ],
      },
    ],
  },
  {
    id: 'izvestaji',
    title: 'Izveštaji',
    sections: [
      {
        title: 'Izveštaji',
        blocks: [
          { p: 'Stranica **Izveštaji**: projekti po statusu, vrednost po projektu i vrednost po kupcu, iz svih sačuvanih projekata.' },
        ],
      },
    ],
  },
  {
    id: 'podesavanja',
    title: 'Podešavanja',
    sections: [
      {
        title: 'Kartice podešavanja',
        blocks: [
          { list: [
            '**Firma i korisnik**: naziv, adresa, telefon, e-mail i PIB firme (na dokumentima), vaše ime i prezime, lozinka naloga, valuta (RSD/EUR) i kurs.',
            '**Podrazumevana kalkulacija (novi projekti)**: marža ili uvećanje, popust, PDV, rad i montaža. Važi za projekte napravljene posle izmene.',
            '**Sečenje materijala (krojna lista)**: dužina nabavne šipke, širina testere, štednja materijala, najkraći ostatak za magacin.',
            '**Napredne opcije**: napredni prikaz dužina, simulacija na fotografiji.',
            '**Šabloni stubova**: pravljenje i izmena šablona (tip, presek, mere, montaža, boja, kapa i dno).',
            '**Nalozi zaposlenih** (šef): nalozi i uloge.',
            '**Podaci**: **Sačuvaj sada** i (napredno) brisanje svih podataka uz vraćanje probnih.',
          ] },
          { warn: '„Obriši sve i vrati probne podatke“ briše projekte, kupce i cenovnik na ovom uređaju. Koristite samo ako ste sigurni.' },
        ],
      },
    ],
  },
  {
    id: 'obavestenja',
    title: 'Obaveštenja',
    sections: [
      {
        title: 'Zvonce u zaglavlju',
        blocks: [
          { p: 'Zvonce prikazuje specifikacije koje su radnici sa terena poslali iz aplikacije za stolare. Broj na zvoncu je broj nepročitanih. Klik na stavku otvara specifikaciju (PDF) sa dugmetom za preuzimanje; proverava se na svaki minut dok je prozor otvoren.' },
          { list: [
            '**Označi sve kao pročitano**: uklanja oznaku nepročitanog.',
            '**Obriši sva** (drugi klik potvrđuje): obaveštenja više se ne prikazuju u Ogradama, za sve korisnike. U Stolariji ostaju.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'podaci',
    title: 'Čuvanje podataka, internet i desktop aplikacija',
    sections: [
      {
        title: 'Čuvanje i usklađivanje',
        blocks: [
          { p: 'Projekti, kupci, cenovnik, modeli i podešavanja čuvaju se na uređaju i šalju u zajedničku bazu firme. Svi nalozi vide iste podatke. Bez interneta se radi normalno; izmene se šalju čim se veza vrati (na svakih 45 sekundi, pri povratku interneta i fokusu prozora).' },
          { warn: 'Ako isti projekat istovremeno menjaju dvoje (jedan bez interneta), poslednja poslata izmena važi.' },
        ],
      },
      {
        title: 'Desktop aplikacija i web',
        blocks: [
          { p: 'Aplikacija radi u pregledaču (web adresa firme) i kao desktop program za Windows. Desktop program se ažurira novim izdanjem; web verzija je uvek najnovija. Iz Chrome-a ili Edge-a sajt može da se instalira kao aplikacija (ikonica **Instaliraj** u adresnoj traci).' },
        ],
      },
    ],
  },
  {
    id: 'precice',
    title: 'Prečice na tastaturi',
    sections: [
      {
        title: 'Editor',
        blocks: [
          { list: [
            '**Delete** — briše izabrano; **Esc** — poništava izbor.',
            '**Ctrl+Z / Ctrl+Shift+Z** — poništi / ponovi.',
            '**Ctrl + klik / Shift + klik / okvir** — izbor više polja ili stubova.',
            '**Ctrl + točkić** — zoom; **srednji taster** ili **Razmaknica + prevlačenje** — pomeranje prikaza.',
          ] },
        ],
      },
      {
        title: 'Crtanje modela i trase',
        blocks: [
          { list: [
            '**Strelice** — pomeraju izabrane delove; **Delete** — briše.',
            '**Alt** — privremeno isključuje privlačenje; **desni taster** — pomera papir.',
            '**Enter** — tačna dužina stranice trase / završetak crtanja; **Shift** — bez hvatanja ugla; **Backspace** — vraća poslednju tačku.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'pitanja',
    title: 'Česta pitanja i rešavanje problema',
    sections: [
      {
        title: 'Pitanja',
        blocks: [
          { list: [
            '**Ne vidim promenu lozinke.** Podešavanja → Firma i korisnik → okvir „Lozinka naloga“ → Promeni lozinku. Vidi se kad ste prijavljeni nalogom (ne kao gost).',
            '**U krojnoj listi piše „nije definisano“.** Deo klizne kapije (šina, C-profil, rep) nema izabran materijal: izaberite ga u panelu kapije.',
            '**Na skici piše „materijal je obrisan iz cenovnika“.** Deo modela koristi materijal koga više nema; aplikacija ga sama prebacuje na materijal iste šifre ako postoji. Inače izaberite drugi materijal (Zameni materijal u crtanju).',
            '**Kapa ili rozetna se ne nudi za stub.** Mera u nazivu materijala mora da odgovara preseku stuba (npr. „100×100“ ili „Ø40“).',
            '**Cena se razlikuje od očekivane.** Proverite cenovnik (cena, jedinica, otpad), sastavnicu modela i parametre cene projekta (Detaljan obračun).',
            '**Komad duži od šipke.** Šina i C-profil se dele na celu šipku i nastavak; za ostale profile proverite meru ili dužinu nabavne šipke u podešavanjima.',
            '**Promene se ne vide na drugom računaru.** Proverite internet i status oblaka u zaglavlju; izmene se šalju čim se veza uspostavi.',
          ] },
        ],
      },
    ],
  },
];

/** Delovi teksta sa podebljanim delovima: **tekst** → { bold: true }. */
export function manualRuns(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((s) => (s.startsWith('**') && s.endsWith('**') ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }));
}
