import type { ReactNode } from 'react';
import { Page, PageHeader } from '../../components/ui/Common';

interface Topic { title: string; items: ReactNode[] }

const TOPICS: Topic[] = [
  {
    title: 'Kako se projektuje',
    items: [
      <><b>Trenutni projekat</b> u meniju otvara projekat na kome ste poslednji radili (pamti se i posle zatvaranja aplikacije). Novi projekat pravite dugmetom <b>Novi projekat</b> na Početnoj ili na strani Projekti.</>,
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
      <><b>Ograde za terase</b> (Srebrni stubovi — crne prečke, Inox — horizontalne prečke, Inox i staklo) nemaju kapije ni zasebne stubove iz kataloga (betonski, dekorativni, stub kapije): njihovi stubovi su deo ograde. Model za terasu se ne može izabrati dok u projektu ima kapija.</>,
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
      <>Na strani <b>Modeli ograda</b>, <b>Koristi model</b> primenjuje model, a <b>Specifikacija</b> otvara spisak elemenata modela koji ulaze u krojnu listu i cenu.</>,
      <>Na kartici modela (strana <b>Modeli ograda</b>) pišu <b>vertikalni i horizontalni profili</b> od kojih se model pravi (podatak radnika prema uzorcima; nije potvrđen u cenovniku). Sav sadržaj i otvorena pitanja su u dokumentaciji <code>docs/konstrukcija-modela.md</code>.</>,
      <>U specifikaciji dodajete i brišete elemente; količina i dužina reza su formule (+ − × / zagrade, ceil, floor, round, min, max, abs). Promenljive su navedene u prozoru, npr. N, W, H.</>,
      <>Dok specifikacija modela 04 i 08 nije sačuvana, važi njihova detaljna sastavnica; čuvanjem se prelazi na obračun po polju. „Vrati podrazumevanu" briše izmenu.</>,
    ],
  },
  {
    title: 'Krojna lista',
    items: [
      <>Dugme <b>Krojna lista</b> u panelu desno (ispod <b>PDF ponude</b>) otvara pregled krojne liste izabranog projekta, a <b>Sačuvaj PDF</b> je preuzima. Ista lista je na strani <b>Proizvodnja</b>, gde se vidi i na ekranu.</>,
      <>Svi komadi profila se raspoređuju na nabavne šipke: dužina šipke i širina testere (rez) zadaju se na strani Proizvodnja (podrazumevano 6000 i 3 mm). Svaki rez troši širinu testere; šrafirani deo šipke je ostatak.</>,
      <>Svaki komad je u boji svoje <b>pozicije</b> (elementa projekta: ograda, kapija…), sa dužinom u mm; oznaka P1, P2… ispod komada se čita iz legende na vrhu. Šipke sa istim rasporedom se spajaju u jednu liniju („Šipke 1–14 × 14"). Ispod svakog profila je zbirni spisak: dužina, komada i pozicije.</>,
      <>Zaglavlje sadrži logotip, naziv i podatke firme (adresa, telefon, email, PIB se unose u <b>Podešavanjima → Firma i korisnik</b>), kupca, status, broj ponude i datum. Na dnu su napomene i mesta za potpis.</>,
      <>Staklo, stubovi iz cenovnika (kom), okovi i delovi bez dužine reza nisu u krojnoj listi. Rezovi su ravni (90°). Modeli 04 i 08 koriste svoje planske mere (vidi napomene na listi).</>,
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
      <>Podrazumevana kalkulacija (zarada, popust, PDV, rad i montaža) važi samo za projekte koji se naprave posle izmene; postojeći projekti zadržavaju svoja podešavanja.</>,
      <>Podaci (projekti, kupci, cenovnik, podešavanja) čuvaju se u IndexedDB bazi ovog pregledača. Nema servera ni naloga.</>,
      <>Statistika na nadzornoj tabli računa se iz lokalno sačuvanih podataka; vrednost ponuda je zbir ukupnih iznosa sa PDV-om za projekte u statusu „Ponuda".</>,
    ],
  },
  {
    title: 'Demonstracione pretpostavke',
    items: [
      <>Profili, cene, otpad, marža i pravila obračuna su <b>ilustrativni</b>, ne stvarni podaci proizvođača, a obračun je demonstracioni.</>,
      <>Granične dimenzije (min/max) su demonstracione.</>,
      <>Proizvodna lista je okvirna geometrijska specifikacija bez optimizacije sečenja (osim detaljne sastavnice modela 04 i 08).</>,
    ],
  },
];

export default function HelpPage() {
  return (
    <Page>
      <PageHeader title="Pomoć" subtitle="Podsetnik kako radi editor, crtanje, kalkulacija i podešavanja." />
      <div className="grid gap-5 lg:grid-cols-2" data-testid="help-topics">
        {TOPICS.map((t) => (
          <section key={t.title} className="card p-5">
            <h2 className="font-bold mb-2">{t.title}</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
              {t.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
