import { BookOpen } from 'lucide-react';
import { isValidElement, useState, type ReactNode } from 'react';
import { ManualDownloadButton, ManualViewer } from '../../components/help/ManualViewer';
import { FEATURES } from '../../config/features';
import { Page, PageHeader } from '../../components/ui/Common';

interface Topic { title: string; items: ReactNode[] }

/** Tekst o ograda za terase: prikazuje se samo kad su ograde za terase uključene (config/features.ts). */
const TerraceOnly = ({ children }: { children?: ReactNode }) => <>{children}</>;
const shown = (items: ReactNode[]): ReactNode[] => items.filter((it) => FEATURES.terraceFences || !(isValidElement(it) && it.type === TerraceOnly));

const TOPICS: Topic[] = [
  {
    title: 'Kako se projektuje',
    items: [
      <><b>Trenutni projekat</b> u meniju otvara projekat na kome ste poslednji radili (pamti se i posle zatvaranja aplikacije). Novi projekat pravite dugmetom <b>Novi projekat</b> u zaglavlju (gore desno) ili na Početnoj.</>,
      <>U katalogu ispod crteža izaberite <b>Model ograde</b> (menja se na svim elementima projekta), pa kliknite <b>Dodaj</b> na elementu ili ga prevucite na crtež. Mesto ubacivanja pokazuje crvena linija.</>,
      <>Katalog nudi elemente izabranog modela: ogradu, pešačku, kliznu, dvokrilnu i jednokrilnu kapiju, kapiju sa betonskim stubom i prazan otvor.</>,
      <>Dugme <b>+</b> desno od poslednjeg stuba u 2D prikazu dodaje sledeći element na kraj niza: izaberete vrstu, zadate dužinu i visinu i tip novog krajnjeg stuba. Tu se dodaje i ugaoni spoj.</>,
      <>Kliknite element ili stub na crtežu (2D ili 3D) da menjate njegove mere, model i boju. Parametri izabranog elementa se prikazuju na vrhu panela svojstava.</>,
      <>Redosled menjate prevlačenjem ili dugmadima <b>Pomeri levo / desno</b>.</>,
    ],
  },
  {
    title: 'Mere i kote',
    items: [
      <>Klik na kotu <b>ukupne dužine</b> ispod crteža menja dužinu cele ograde: sva polja ograde dobijaju istu dužinu (razlika od zaokruživanja je najviše 1 mm), a kapije, otvori i ugaoni spojevi ostaju isti.</>,
      <>Kliknite na <b>kotu</b> širine iznad elementa ili na kotu <b>H</b> (visina) da promenite meru. Dozvoljeni opseg piše u prozoru; van opsega se javlja poruka.</>,
      <>Mera elementa je njegova <b>ukupna (spoljna) dužina</b>: element od 1000 mm zauzima 1000 mm na terenu, zajedno sa po pola širine susednih stubova. <b>Ukupna dužina</b> ograde računa zajednički stub samo jednom.</>,
      <>Modularna dužina (osa–osa stubova), zbir svetlih otvora i fiksna ukupna dužina dostupni su kad u <b>Podešavanjima → Napredne opcije</b> uključite <b>Napredni prikaz dužina</b>; tada se prikazuju i položaji stubova po osama.</>,
      <>U naprednom prikazu režim <b>Fiksna</b> zadaje ukupnu dužinu; kapije se pri raspodeli ne šire automatski, menjaju se samo segmenti ograde i otvori.</>,
      <><b>Visina (svi)</b> postavlja visinu svih elemenata odjednom.</>,
      <>Letvice i paneli imaju stalnu dimenziju: veća visina daje više letvica, a ne deblje. Letvice susednih polja različite visine leže u istim linijama od tla.</>,
    ],
  },
  {
    title: 'Crtanje ograde po trasi',
    items: [
      <>Dugme <b>Nacrtaj ogradu</b> otvara crtanje u pogledu odozgo: klik postavlja tačku, a uz svaku stranicu stoji kota. Model ograde birate u traci iznad crteža.</>,
      <>Kucajte dužinu u mm i pritisnite <b>Enter</b> za tačnu meru u pravcu kursora. <b>Shift</b> isključuje hvatanje ugla (inače 15°), <b>Backspace</b> vraća poslednju tačku.</>,
      <><b>Završi crtanje</b> (Enter bez broja ili dvoklik) prelazi u izmenu: dužine i uglove menjate u tabeli, a tačke povlačite mišem. <b>Nastavi crtanje</b> dodaje nove stranice.</>,
      <>Ograda se pravi tek na <b>Napravi ogradu</b>: svaka stranica se deli na polja do 2000 mm sa stubovima na podelama. Na skretanju nastaje ugaoni spoj (modeli sa prečkama) ili stub sa uglom skretanja. Postojeći elementi se zamenjuju; može se poništiti sa Ctrl+Z.</>,
    ],
  },
  {
    title: 'Simulacija na fotografiji',
    items: [
      <>Tab <b>Simulacija</b> iznad crteža (uključuje se i isključuje u <b>Podešavanjima → Napredne opcije</b>): učitajte sliku dvorišta ili kuće sa računara, ili je fotografišite telefonom. Ograda iz projekta se postavlja na sliku.</>,
      <>Četiri kružića su uglovi ograde: povucite ih da se ograda poklopi sa stubovima na slici (perspektiva). Prevlačenjem same ograde pomera se cela.</>,
      <><b>Vrati položaj</b> vraća ogradu na sredinu, <b>Zameni sliku</b> učitava drugu, <b>Preuzmi sliku</b> čuva sliku sa ogradom (JPG). Slika i položaj se čuvaju uz projekat; izmene ograde se odmah vide na slici.</>,
    ],
  },
  {
    title: 'Stubovi i uglovi',
    items: [
      <>Stubovi se dele između susednih elemenata i računaju se samo jednom. Tip, širinu preseka (demo preseci 80, 100 i 120 mm), visinu i boju menjate klikom na stub.</>,
      <>Širina stuba utiče na svetli otvor susednih elemenata. Betonski stub sa podnožjem ima i visinu podnožja (betonski deo ispod ograde i kapije, između ovog i susednog stuba).</>,
      <><b>Ugao skretanja</b> se zadaje na međustubovima: + skreće udesno, − ulevo (gledano duž trase), 0 je prava ograda. Dužina elemenata se ne menja. Krajnji stubovi nemaju skretanje.</>,
      <><b>Ugaoni spoj</b> je razmak između dva stuba u kome se prečke i rukohvat savijaju; ugao se ne pravi na stubu. Ugao savijanja: + udesno, − ulevo.</>,
    ],
  },
  {
    title: 'Kapije',
    items: [
      <>Dvokrilnoj kapiji možete da zadate nejednaka krila; prikazuje se i širina desnog krila.</>,
      <>Klizna kapija traži slobodan prostor za povlačenje; ako ga nema, javlja se upozorenje sa potrebnom dužinom (orijentaciona provera).</>,
      <>U 3D prikazu kapije se otvaraju i zatvaraju, što ne utiče na cenu.</>,
      <TerraceOnly><b>Ograde za terase</b> (Srebrni stubovi — crne prečke, Inox — horizontalne prečke, Inox i staklo) nemaju kapije ni zasebne stubove iz kataloga (betonski, dekorativni, stub kapije): njihovi stubovi su deo ograde. Model za terasu se ne može izabrati dok u projektu ima kapija.</TerraceOnly>,
      <TerraceOnly><b>Stepenište</b> (samo ograde za terase): kartica „Stepenište" u katalogu ili prekidač „Stepenište" na polju. Širina polja je horizontalna dužina u osnovi; zadaju se smer (penje se / silazi, gledano s leva nadesno), visinska razlika i broj stepenika (oko 170 mm po stepeniku). Stubovi ostaju uspravni, rukohvat, prečke i staklo prate nagib, a ograda posle stepeništa je na novom nivou. U sastavnici i krojnoj listi rukohvat i prečke idu po kosoj dužini sa kosim rezom, a staklo je paralelogram.</TerraceOnly>,
    ],
  },
  {
    title: 'Prikaz i prečice',
    items: [
      <><b>Izbor više polja:</b> Ctrl+klik dodaje polje u izbor ili ga izbacuje, Shift+klik bira sva polja od izabranog do kliknutog, a prevlačenje levim tasterom po pozadini crteža crta okvir i bira polja koja on dodiruje (Ctrl uz okvir dodaje na postojeći izbor). Za izabrana polja se visina i boja menjaju odjednom, a mogu se i obrisati; Esc poništava izbor.</>,
      <>Pomeranje prikaza 2D crteža: srednji taster miša ili Razmaknica + prevlačenje; <b>Ctrl + točkić</b> zumira.</>,
      <>3D prikaz: levo dugme — orbit, desno — pomeranje, točkić — zoom. U režimu <b>Uređivanje</b> prevlačite elemente i ručke.</>,
      <>Prečice: <b>Delete</b> briše, <b>Ctrl+Z</b> / <b>Ctrl+Shift+Z</b> poništava i ponavlja, <b>Esc</b> poništava selekciju.</>,
      <>Kote i oznake elemenata su podrazumevano isključene: uključite ih u opcijama prikaza (dugme sa klizačima iznad crteža), gde je i izvoz u SVG. Dugme <b>Sačuvaj</b> je uz dugmad za zoom. Projekti se pretražuju na strani <b>Projekti</b>.</>
    ],
  },
  {
    title: 'Model i specifikacija',
    items: [
      <>Na strani <b>Modeli ograda</b>, <b>Koristi model</b> primenjuje model, a <b>Sastavnica</b> otvara spisak svega što ide uz polje ograde (delovi crteža i dodat materijal, npr. vijci); to ulazi u spisak materijala, krojnu listu i cenu.</>,
      <>Na kartici modela (strana <b>Modeli ograda</b>) pišu <b>vertikalni i horizontalni profili</b> od kojih se model pravi.</>,
      <>U specifikaciji dodajete i brišete elemente; količina i dužina reza su formule (+ − × / zagrade, ceil, floor, round, min, max, abs). Promenljive su navedene u prozoru, npr. N, W, H.</>,
    ],
  },
  {
    title: 'Krojna lista',
    items: [
      <>Dugme <b>Krojna lista</b> u panelu desno (pored <b>PDF ponude</b>, u okviru <b>Kalkulacija cene</b>) prvo pita ima li ostataka materijala, pa otvara pregled krojne liste izabranog projekta, a <b>Sačuvaj PDF</b> je preuzima. Ista lista je na strani <b>Proizvodnja</b>, gde se vidi i na ekranu.</>,
      <>Svi komadi profila se raspoređuju na nabavne šipke: dužina šipke i širina testere (rez) zadaju se na strani Proizvodnja (podrazumevano 6000 i 3 mm). Svaki rez troši širinu testere; šrafirani deo šipke je ostatak.</>,
      <>Svaki komad je u boji svoje <b>pozicije</b> (elementa projekta: ograda, kapija…), sa dužinom u mm; oznaka P1, P2… ispod komada se čita iz legende na vrhu. Šipke sa istim rasporedom se spajaju u jednu liniju („Šipke 1–14 × 14"). Ispod svakog profila je zbirni spisak: dužina, komada i pozicije.</>,
      <>Zaglavlje sadrži logotip, naziv i podatke firme (adresa, telefon, email, PIB se unose u <b>Podešavanjima → Firma i korisnik</b>), kupca, status, broj ponude i datum. Na dnu su napomene i mesta za potpis.</>,
      <>Staklo, stubovi iz cenovnika (kom), okovi i delovi bez dužine reza nisu u krojnoj listi. Rezovi su ravni (90°), osim delova rama: oni se crtaju kao trapez sa oznakom 45 na oba kraja (rez pod 45°, dužina je spoljna mera). Modeli 04 i 08 koriste svoje planske mere (vidi napomene na listi).</>,
    ],
  },
  {
    title: 'Magacin i ostaci',
    items: [
      <>Strana <b>Magacin</b> vodi materijal na stanju: cele šipke i ostatke (materijal, dužina, broj komada i napomena, npr. polica).</>,
      <>Pre krojne liste aplikacija pita: <b>Imate li ostatke materijala koje treba prvo iskoristiti?</b> Odgovorite <b>Nema ostataka</b> ili unesite komade ručno ili klikom na stavke iz magacina. Nude se samo profili koji se seku u tom projektu.</>,
      <>Ostaci se koriste prvi, a nova šipka se otvara tek kad u njih više ništa ne staje. U krojnoj listi su označeni kao „Ostatak 3300", a broj šipki za nabavku se smanjuje.</>,
    ],
  },
  {
    title: 'Crtanje sopstvenog modela',
    items: [
      <>Na strani <b>Modeli ograda</b> dugme <b>Napravi model</b> otvara crtanje: levo izaberite materijal iz cenovnika i povucite ga na polju (profil od početka do kraja, ploču kao pravougaonik).</>,
      <><b>Izbor:</b> levi klik na deo ga bira, <b>Ctrl + klik</b> dodaje ili skida deo iz izbora, a prevlačenje levim tasterom po praznom bira sve delove koje okvir dotakne. <b>Desni taster</b> pomera papir, točkić zumira. Strelice pomeraju izabrane delove, Delete ih briše.</>,
      <>Kad je izabrano više delova, panel desno menja dužinu, ugao, okretanje i nagib preseka, rez 45° i dubinu svima odjednom. Za više prečki u U profilima postoji <b>Postavi sve pod uglom uklapanja</b>.</>,
      <><b>Zameni materijal</b> menja materijal izabranog dela. Bočni U profili idu u paru, pa se uz potvrdu menja i onaj na suprotnoj strani; prečke iste grupe se menjaju zajedno. Prečke se same prilagođavaju novom U profilu (ulaz u kanal, ugao uklapanja, razmak).</>,
      <>Prečka nacrtana između dva uspravna U profila se sama uklapa u njih i ne može da izađe iz kanala. <b>Raspored prečki</b> zadaje broj prečki, odstojanje od vrha i dna i razmak (sa luftom ili bez lufta).</>,
      <>Svi delovi staju u okvir modela (širina × visina): deo koji viri se vraća unutra, a deo duži od okvira povećava širinu ili visinu modela.</>,
      <>Prikaz <b>Skica</b> daje skicu sa kotama za majstora (lanci mera, mesta zavarivanja, tabela delova i presek prečke u U profilu), koja se preuzima kao PDF ili SVG.</>,
      <><b>Dodaj ram</b> pita od kog je profila ram i sa kojih strana ide (<b>levo, desno, gore, dole</b>). Uglovi od 45° prave se samo tamo gde se dve strane ramom sastaju; slobodan kraj (npr. donji kraj uspravnih cevi kad nema donjeg rama) ostaje ravan, i tako se vidi u krojnoj listi („45° / 90°“). Ako ste ram već nacrtali običnim cevima, prvo ih obrišite, pa dodajte ram sa željenim stranama.</>,
      <><b>Privlačenje</b> (štiklirano podrazumevano): ivice i krajevi dela koji crtate, pomerate ili lepite privlače se uz ivice susednih delova i tlo, pa cev „sedne“ tačno uz ram ili sused. Prikazuje se ljubičasta isprekidana linija uz koju je privučeno. Držite <b>Alt</b> da privremeno isključite privlačenje, ili ga odštikliranjem isključite.</>,
      <><b>Slobodno crtanje</b> dozvoljava sve: delovi mogu da se preklapaju, uglovi i razmaci su proizvoljni, prečke se ne uklapaju same u U profile (npr. razdelne cevi preko letvica). Dugme <b>Normalno crtanje</b> vraća uobičajena pravila i otvara spisak upozorenja.</>,
      <>Dugme <b>Upozorenja</b> pokazuje koliko upozorenja važi za crtež: preklapanja delova, cevi koje su skoro (ali ne tačno) vodoravne ili uspravne i nejednake razmake u nizu istih cevi. Pored toga se model proverava i na drugim veličinama polja (usko, uobičajeno, visoko, široko): prijavljuje se deo koji izlazi iz polja, preklapanja koja na crtežu ne postoje i materijal koji nestane. Dugme <b>Proba veličina</b> prikazuje isti model na tim veličinama jedan pored drugog, pre čuvanja. Klik na upozorenje bira delove na crtežu. Upozorenje koje ima smisla možete da <b>prihvatite</b> — tada se više ne prikazuje kao aktivno i ostaje na spisku <b>Prihvaćena upozorenja</b>, odakle može da se vrati. Prihvaćena upozorenja se čuvaju uz model.</>,
      <>Zalazak jednog dela u drugi do <b>3 mm</b> smatra se dodirom ili zavarom (npr. U profil uz cev) i ne prijavljuje se. Veća preklapanja se prijavljuju, a pri običnom crtanju se novo preklapanje ne dozvoljava.</>,
      <>Promena <b>širine</b> modela sa više polja razvlači polja između krutih delova (ram, U profili, razdelne cevi) podjednako: svako polje raste za isti iznos, a cevi i U profili zadržavaju svoju širinu.</>,
    ],
  },
  {
    title: 'Radni nalog',
    items: [
      <>Dugme <b>Radni nalog</b> (u panelu desno, ispod Krojne liste, i na strani <b>Proizvodnja</b>) otvara pregled naloga za majstora koji sklapa ogradu; <b>Sačuvaj PDF</b> ga preuzima.</>,
      <>Na vrhu je shema ograde u bojama pozicija (P1, P2… iste kao na krojnoj listi, S1, S2… su stubovi), sa ukupnom dužinom. Zatim sledi kartica za svaki element: delovi sa dužinom i brojem komada, podaci (mere, boja, okov kapije) i kontrolne tačke za čekiranje.</>,
      <>Na kraju su tabela stubova (položaj, tip, presek, visina, montaža), okovi i sitan materijal za ceo projekat, napomene projekta i mesta za potpise (nalog izdao, majstor, kontrola, datum). Rok i ime majstora se upisuju rukom u zaglavlju.</>,
    ],
  },
  {
    title: 'Cenovnik: uvoz i izvoz',
    items: [
      <>Na strani <b>Materijali i cene</b>, <b>Izvezi materijale</b> preuzima ceo cenovnik kao <b>PDF</b> (za štampu i slanje) ili kao <b>Excel / CSV</b> tabelu (šifra, naziv, kategorija, jedinica, cena, otpad i ID). Izvezeni PDF može ponovo da se uveze.</>,
      <><b>Uvezi materijale</b> menja postojeće cene iz PDF, Excel (.xlsx) ili CSV dokumenta. PDF mora imati pravi tekst (ne sken): tabela se čita kao Excel — kolone se prepoznaju po naslovu (šifra, naziv, JM, cena bez PDV-a), spojene ćelije važe za sve redove koje obuhvataju, a cena po šipki (JM 6m) se deli dužinom šipke da bi se dobila cena po metru. Dokument mora imati prvi red sa naslovima i kolone <b>Šifra</b> (ili ID) i <b>Cena</b>; otpad je neobavezan. Najlakše je izvesti tabelu, promeniti cene u Excelu i sačuvati (.xlsx ili CSV). Čitaju se prvi list i prikazane vrednosti, ne formule. Redosled kolona nije bitan: kolone se prepoznaju po naslovu (Šifra / ID / Kod, Naziv / Opis, Cena, Jedinica…), pa se tabela dobavljača može uvesti direktno. Cena u dokumentu mora biti u istoj jedinici i bez PDV-a; promene od 30% i više se posebno označavaju u pregledu.</>,
      <>Pre primene se prikazuje pregled: stara i nova cena, procenat promene i redovi koji se ne mogu upariti. Menjaju se samo cena i otpad; naziv, jedinica i kategorija ostaju. Izmene važe za sve projekte i ne poništavaju se, pa je dobro prvo izvesti rezervnu kopiju.</>,
      <>Materijal dodat u <b>Specifikaciji modela</b> bira se iz ovog cenovnika; novi materijal prvo dodajte ovde („Dodaj materijal"), pa ga zatim izaberite u specifikaciji.</>,
    ],
  },
  {
    title: 'Kalkulacija, lista materijala i ponuda',
    items: [
      <>Geometrijska količina potiče iz crteža; <b>nabavna količina</b> uključuje procenat otpada iz cenovnika. U kalkulaciji je iznad miša prikazana geometrijska količina.</>,
      <>Izmena cene u kalkulaciji menja cenovnik (važi za sve projekte) i odmah ažurira obračun.</>,
      <><b>Marža</b> je udeo u prodajnoj ceni (cena = trošak / (1 − marža)); <b>uvećanje</b> je procenat na nabavnu osnovicu (cena = trošak × (1 + uvećanje)). <b>Popust</b> se odnosi na prodajnu cenu (neto), a <b>PDV</b> na osnovicu posle popusta.</>,
      <>Dugme <b>PDF ponuda</b> prvo prikazuje pregled ponude; tek <b>Sačuvaj PDF</b> preuzima fajl.</>,
      <>Cene u cenovniku se čuvaju u RSD; EUR prikaz je preračun po kursu iz podešavanja.</>,
      <>Ponuda ne sadrži PIB, matični broj ni bankovni račun dok se stvarni podaci firme ne unesu.</>,
    ],
  },
  {
    title: 'Desktop aplikacija',
    items: [
      <>Aplikacija se instalira na računar iz Chrome-a ili Edge-a: otvorite sajt i kliknite ikonicu <b>Instaliraj</b> na desnom kraju adresne trake (ili meni ⋮ → <b>Instaliraj ALU TIM 012</b>). Dobija se ikonica na desktopu i u Start meniju, a aplikacija se otvara u svom prozoru, bez adresne trake.</>,
      <>Instalirana aplikacija je ista kao na sajtu i koristi iste podatke ovog pregledača. Nova verzija se preuzima sama kad postoji internet; primenjuje se pri sledećem otvaranju.</>,
      <>Bez interneta aplikacija se otvara i radi sa sačuvanim podacima (crtanje, kalkulacija, PDF). Prijava na nalog traži internet.</>,
      <>Deinstalacija: u prozoru aplikacije meni ⋯ → <b>Deinstaliraj</b>, ili kroz Windows podešavanja → Aplikacije.</>,
    ],
  },
  {
    title: 'Podešavanja i podaci',
    items: [
      <>Prijava: u prvo polje se upisuje <b>e-mail ili korisničko ime</b>. Šef u <b>Podešavanja → Nalozi zaposlenih</b> pravi naloge (korisničko ime ili e-mail, ime i prezime, početna lozinka od najmanje 8 znakova, uloga šef ili majstor), menja ih i briše. Svoju lozinku svako menja sam: <b>Podešavanja → Firma i korisnik → Promeni lozinku</b>. Isti nalozi važe i u Stolariji.</>,
      <>Podrazumevana kalkulacija (zarada, popust, PDV, rad i montaža) važi samo za projekte koji se naprave posle izmene; postojeći projekti zadržavaju svoja podešavanja.</>,
      <>Podaci (projekti, kupci, cenovnik, modeli, podešavanja) čuvaju se na uređaju i šalju u zajedničku bazu firme; bez interneta se radi normalno, a izmene se šalju kad se veza vrati.</>,
      <><b>Zvončić</b> u zaglavlju prikazuje specifikacije koje su radnici sa terena poslali iz aplikacije za stolare: broj nepročitanih na zvončiću, a klik na stavku otvara specifikaciju (PDF) sa dugmetom <b>Preuzmi PDF</b>. Proverava se na svakih minut dok je prozor otvoren. Detalji: <code>docs/specifikacije-sa-terena.md</code>.</>,
      <>Statistika na nadzornoj tabli računa se iz lokalno sačuvanih podataka; vrednost ponuda je zbir ukupnih iznosa sa PDV-om za projekte u statusu „Ponuda".</>,
    ],
  },
];

export default function HelpPage() {
  const [manual, setManual] = useState(false);
  return (
    <Page>
      <PageHeader title="Pomoć" subtitle="Podsetnik kako radi editor, crtanje, kalkulacija i podešavanja." />
      {/* kompletno uputstvo za upotrebu: pregled u aplikaciji ili PDF za preuzimanje i štampu */}
      <section className="card p-5 mb-5 flex flex-wrap items-center gap-4" data-testid="help-manual">
        <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 bg-primary-50 text-primary"><BookOpen size={24} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[16px]">Uputstvo za upotrebu</b>
          <span className="block text-sm text-muted">Kompletno uputstvo korak po korak: prijava, projekti, crtanje ograde i kapija, modeli, cene, magacin, krojna lista, radni nalog i skica.</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" data-testid="manual-open" onClick={() => setManual(true)}><BookOpen size={16} />Pregledaj uputstvo</button>
          <ManualDownloadButton />
        </span>
      </section>
      {manual && <ManualViewer onClose={() => setManual(false)} />}
      {/* sadržaj: klik vodi na poglavlje */}
      <nav className="card p-4 mb-5" aria-label="Sadržaj pomoći" data-testid="help-toc">
        <div className="text-[13px] font-semibold text-muted mb-2">Sadržaj</div>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t, i) => <a key={t.title} href={`#tema-${i}`} className="btn btn-sm" onClick={(e) => { e.preventDefault(); document.getElementById(`tema-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t.title}</a>)}
        </div>
      </nav>
      <div className="grid gap-5 lg:grid-cols-2 items-start" data-testid="help-topics">
        {TOPICS.map((t, i) => (
          <section key={t.title} id={`tema-${i}`} className="card p-5 scroll-mt-4">
            <h2 className="font-bold mb-2">{t.title}</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
              {shown(t.items).map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
