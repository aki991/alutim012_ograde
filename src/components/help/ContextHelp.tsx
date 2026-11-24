import { CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../ui/Modal';
export const QUICK_HELP = {
  company: { title: 'Firma i dokumenti', text: 'Podaci firme koriste se u ponudama i dokumentima. Njihova izmena važi pri sledećem pravljenju dokumenta, uključujući postojeće projekte.' },
  account: { title: 'Nalog i zaposleni', text: 'Ime i lozinka pripadaju prijavljenom nalogu. Ovlašćenja za upravljanje zaposlenima zavise od uloge korisnika.' },
  pricing: { title: 'Kalkulacija i valuta', text: 'Podrazumevana kalkulacija važi za nove projekte. Valuta i kurs menjaju prikaz iznosa. Plastificiranje je zajednička cena za postojeće i nove projekte, uz mogućnost posebne cene u kalkulaciji projekta.' },
  cutting: { title: 'Sečenje i magacin', text: 'Širina testere, dužina šipke i štednja materijala utiču na raspored sečenja. Najkraći sačuvani ostatak određuje šta se posle knjiženja vraća u magacin. Ova podešavanja koriste i postojeći projekti pri novom proračunu.' },
  display: { title: 'Prikaz i rad', text: 'Napredne dužine prikazuju ose, svetle otvore i fiksnu ukupnu dužinu. Simulacija omogućava postavljanje ograde na fotografiju. Ove opcije menjaju dostupne prikaze, a sačuvani crteži ostaju.' },
  data: { title: 'Čuvanje i podaci', text: 'Izmene se čuvaju automatski. „Sačuvaj sada“ odmah pokreće upis. Brisanje svih podataka vraća probne podatke i traži posebnu potvrdu; kada je zajednička baza uključena, utiče na sve korisnike.' },
  stock: { title: 'Stanje, rezervacije i slobodan materijal', text: 'Na stanju su komadi koji su fizički evidentirani u magacinu. Rezervisano su komadi izabrani za projekte čije sečenje još nije proknjiženo. Slobodno je stanje umanjeno za rezervacije. Kada potvrdite sečenje ili projekat pređe u „U izradi“ ili „Završeno“, iskorišćeni komadi skidaju se sa stanja, a dovoljno dugi ostaci vraćaju se u magacin. Povratak na „Nacrt“ ili „Ponuda“ povlači knjiženje. Višak rezervacija označava manjak; ne predstavlja raspoloživ materijal.' },
  reports: { title: 'Period i potpunost izveštaja', text: 'Period se odnosi na datum poslednje izmene projekta. Početni i završni dan uključeni su u celosti. Svi zbirovi i grafikoni prate iste filtere. Nepotpuna kalkulacija ima materijale bez cene ili sa cenom nula; njen iznos obuhvata samo obračunate troškove.' },
} as const;
export type HelpTopic = keyof typeof QUICK_HELP;
export function ContextHelp({ topic }: { topic: HelpTopic }) {
 const [open, setOpen] = useState(false); const item = QUICK_HELP[topic];
 return <><button type="button" className="btn btn-sm" aria-label={`Pomoć: ${item.title}`} onClick={() => setOpen(true)}><CircleHelp size={15} />Pomoć</button>{open && <Modal title={item.title} onClose={() => setOpen(false)} footer={<><Link className="btn" to={`/pomoc#vodic-${topic}`}>Otvori celo uputstvo</Link><button className="btn" onClick={() => setOpen(false)}>Zatvori</button></>}><p className="text-sm leading-relaxed">{item.text}</p></Modal>}</>;
}
