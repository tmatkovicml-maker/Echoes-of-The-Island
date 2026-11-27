# Echoes of the Island, Advent na Lošinju 2026.: prijava smjena i QR narudžbe

Mala web aplikacija preko koje punoljetni učenici sami biraju smjene u adventskoj kućici na Trgu Republike Hrvatske u Malom Lošinju (10. 12. 2026. – 2. 1. 2027.). Stranica se otvara skeniranjem QR koda s letka, s mobitela i bez ikakvog računa.

- **Učenik** (`/`) bira termine po danima (blok A i B), upisuje ime i prezime i broj mobitela, potvrđuje da ima 18 godina i pristaje na obradu podataka. Nakon prijave dobiva **privatnu poveznicu** (`/moji/…`) na kojoj vidi svoje termine i može ih otkazati do roka.
- **Organizator** (`/admin`, lozinka) vidi tko je na kojem terminu (ime, mobitel) i koliko je mjesta ostalo. Ima i pregled po osobi sa satima po tjednu, ručno dodavanje i uklanjanje prijava, broj mjesta po terminu, otvaranje i zatvaranje prijava, izvoz u CSV za Excel, učitavanje termina iz CSV-a, QR kod i brisanje podataka.

## Pravila (provjerava ih poslužitelj, ne samo preglednik)
- **Pun termin se odmah zatvara.** Broj mjesta provjerava se na poslužitelju u jednoj transakciji. Sve prijave obrađuje jedan Cloudflare Durable Object, i to jednu po jednu, pa dvije istovremene prijave ne mogu zauzeti isto zadnje mjesto. To dokazuje test u kojem se 30 ljudi istovremeno prijavljuje na jedno mjesto i samo jedan uspije.
- **Najviše 30 sati tjedno** po osobi, po ISO tjednima (10.–13.12. je 50. tjedan, a 28.12.–2.1. je 53. tjedan).
- **Najviše jedan blok dnevno** po osobi.
- **12 sati odmora**: nakon večernjeg bloka B osoba ne može sutradan raditi jutarnji blok A.
- **Studenti i učenici**: osoba odabere „Student” (Student servis Rijeka, SCRI) ili „Učenik 18+” (Učenički servis Dom mladih Rijeka). Redoviti učenici smiju raditi samo za zimskih praznika, pa mogu birati termine tek **od 24. 12.** Studenti mogu od 10. 12. Vi i prijatelji dodajete se u adminu kao „Drugo”, bez servisa.
- Nakon prijave stranica podsjeti studenta da prije prvog rada generira e-ugovor na rad.uniri.hr, a učenika da mora biti učlanjen u Dom mladih i da se ugovor naručuje do 18. 12.
- Osoba se prepoznaje po **broju mobitela**. Zapisi „091 234 5678”, „+385 91 234 5678” i „00385912345678” vode se kao isti broj.
- Ako jedan termin iz prijave ne prolazi, ne sprema se ništa i učenik dobiva objašnjenje zašto.
- Zaštita od zlouporabe: najviše 15 prijava po IP adresi u 10 minuta, skriveno polje (honeypot) za botove i 10 pogrešnih lozinki po IP adresi u 15 minuta.

## Termini
Početni termini učitavaju se iz **`Termini_prijave.csv`** (48 termina, ukupno 86 mjesta) kad je baza prazna:
- **Običan dan:** blok A (09:00–16:00, 7 h) ima 1 mjesto, a blok B (16:00–24:00, 8 h) 2 mjesta.
- **Koncertni dani** (10., 12., 26., 27., 29., 30. i 31. 12.): A ima 2 mjesta, a B 3 mjesta. Na stranici su označeni oznakom „koncert”.
- Blok B traje do 03:00 (11 h) na 24., 27. i 31. 12.
- Uz svaki dan prikazuje se program na Trgu RH iz stupca **Događaj** (preuzet iz lista „Smjene plan”), da učenici znaju kad je gužva.

Kasnije promjene:
- Broj mjesta za pojedini termin mijenja se izravno u popisu termina u `/admin`.
- Za veće izmjene: `/admin` → **Postavke** → **Termini iz CSV-a**. Datoteka je istog oblika kao `Termini_prijave.csv`.
  - Stupci se prepoznaju po nazivima: Datum, Blok, Vrijeme (ili Od i Do), Sati, Mjesta i po želji Tip dana i Događaj.
  - Ostali stupci (Dan, Naziv termina) se zanemaruju.
  - Postojeće prijave ostaju. Termin na kojem već ima prijava ne može se maknuti.
- Ako promijenite `Termini_prijave.csv` u repozitoriju, to vrijedi samo za novu, praznu bazu. Na postojećoj stranici datoteku učitajte u adminu.

## Postavke (`/admin` → Postavke)
| Postavka | Zadano | Značenje |
|---|---|---|
| Rok za otkazivanje | **48 h** prije početka smjene | Poslije toga učenik ne može sam otkazati, nego se javlja organizatoru. 0 znači da može otkazati sve do početka smjene. |
| Ručna potvrda | **isključena**, prijava vrijedi odmah | Ako je uključite, svaka prijava čeka vašu potvrdu, ali mjesto je već zauzeto. Učenik stanje vidi na svojoj poveznici. |
| Uvjeti (tekst na stranici prijava) | preko kojeg servisa se radi; „Satnicu dogovaramo sa svakim osobno” | Satnica se ne prikazuje javno. |
| Organizator | prazno | Naziv i kontakt za obavijest o privatnosti. |
| Automatsko brisanje | **31. 1. 2027.** | Tog dana se brišu sva imena i mobiteli, a prijave se zatvaraju. |

## Vaše smjene i stalni radnici
- **Stalni radnici u blokovima:** stalne radnike (npr. Kristijan, Mihael, Ozren od 16. 12.) upisujete u blokove kao i ostale: admin → Termini → **+ Dodaj** → **Drugo (ja, prijatelji)**. Tako zauzimaju mjesto, pa učenicima ostaju samo prazna mjesta.
- **Vaše vrijeme izvan blokova** (nabava 08–09, otvaranje 09–12, popodne 16–19) upisuje se u admin → Termini → **Dodatne smjene izvan blokova A i B**.
  - Upišete ime, vremena odvojena s „;” (npr. `08:00-09:00 Nabava; 09:00-12:00 Otvaranje; 16:00-19:00 Popodne`), raspon datuma i dane koje treba preskočiti (npr. `14.12., 15.12., 16.12., 25.12.`).
  - Te smjene vide se samo u adminu, uz svaki dan, s ukupnim satima. Više od 8 h je označeno crveno.
  - Ne zauzimaju mjesto u bloku i ne ulaze u obračun servisima.

## Obračun sati za servise
`/admin` → **Osobe** → **⬇ Obračun sati za servise (CSV)**. Za svaku osobu i godinu daje: servis, redovne sate, sate uz +50 % (noću 22–06, nedjeljom, blagdanom 25. 12., 26. 12. i 1. 1.), ukupno, satnicu te osobe i procjenu neto iznosa. **Satnicu svake osobe** (redovno / +50 %) upisujete na kartici Osobe i vidite je samo vi. Zadano je 11,15 / 16,73 €, a prazno +50 % znači 1,5 × redovno. Prosinac 2026. i siječanj 2027. su u odvojenim recima, jer se godine obračunavaju posebno. Na primjer, blok B 31. 12. daje 6 redovnih sati i 2 sata +50 % u 2026. te 3 sata +50 % u 2027. Iste brojke vide se u tablici na kartici Osobe.

## Tablica Advent_2026 (list „Prijave”)
U `/admin` gumb **⬇ Za tablicu (list Prijave)** daje CSV sa stupcima *Ime i prezime; Datum; Blok*, s datumom u obliku `2026-12-10`, koji Excel čita kao datum.
1. Otvorite CSV i kopirajte retke ispod naslova (stupci A–C).
2. U tablici, list **Prijave**, kliknite ćeliju **A5** i zalijepite.

Formule u listovima Prijave, Smjene plan i Učenici tada same izračunaju sate, tjedan, broj prijavljenih i status. Imena za list Učenici upišite točno kao u CSV-u. Provjereno je na kopiji vaše tablice.

## Telegram obavijesti o narudžbama
Za svaku novu narudžbu stiže poruka na Telegram: broj, stavke, iznos, kartica ili gotovina, ime, napomena i upozorenje „18+” ako je u narudžbi alkohol.
1. U Telegramu otvorite @BotFather, pošaljite `/newbot` i spremite token.
2. U Cloudflareu dodajte Secret `TELEGRAM_BOT_TOKEN`, pod Runtime variables and secrets.
3. Svatko tko treba obavijesti pošalje botu bilo koju poruku.
4. Kliknite admin → **Jelovnik** → **Poveži**. **Isključi obavijesti** ih gasi.

## Blagajne (A1 Fresh Pay)
QR narudžbe nisu računi. Račun se izdaje na jednom od dva A1 Fresh Pay uređaja: jedan prima samo gotovinu, a drugi gotovinu i kartice. Na ekranu narudžbi narudžba plaćena karticom ima oznaku **„Kartica · blagajna s karticom”**, pa osoblje zna na kojem uređaju je naplatiti.

## QR narudžbe (jelovnik)
Gosti skeniraju QR kod, naruče hranu i piće na mobitelu i dobiju broj narudžbe. Kad je narudžba spremna, mobitel im to pokaže, a plaćaju na šanku **gotovinom ili karticom** kroz vašu postojeću blagajnu. QR narudžbe su samo narudžbe. Nisu računi i ne zamjenjuju fiskalnu blagajnu.

- **Gost** (`/meni`):
  - bira stavke i plaćanje (kartica ili gotovina) i po želji upisuje ime za prozivanje i napomenu;
  - prati stanje na `/narudzba/…` (zaprimljena → priprema → spremno), a stranica se sama osvježava;
  - može otkazati narudžbu dok nije u pripremi;
  - za alkohol (označen 18+) mora potvrditi da ima 18 godina, a osoblje svejedno provjerava osobnu.
- **Ekran narudžbi u kućici** (`/kuhinja`, na tabletu ili računalu):
  - narudžbe su u tri stupca (Nove, U pripremi, Spremno), a dodirom idu u sljedeći korak; „Preuzeto i plaćeno” ih zatvara;
  - na novu narudžbu oglašava se zvuk (dodirnite 🔔 jednom nakon otvaranja);
  - **Rasprodano** odmah skriva stavku s jelovnika za goste;
  - gumb **Otvori/Zatvori** uključuje i isključuje narudžbe mobitelom.
  - Otvara se **PIN-om osoblja**: u Cloudflareu dodajte Secret `STAFF_PIN`, npr. 4–6 znamenki. Osoblje tako ne vidi imena i mobitele iz prijava smjena. Radi i organizatorova lozinka.
- **Organizator** (`/admin` → **Jelovnik**):
  - uređuje stavke (naziv, opis, cijena, alergeni, dostupno, 18+) ili ih učitava iz CSV-a lista „Jelovnik”;
  - vidi promet po danu (zbroj preuzetih narudžbi, samo informativno) i preuzima izvoz svih narudžbi;
  - otvara i zatvara narudžbe;
  - preuzima **QR kod za jelovnik** (`/qr-meni.svg`, `/qr-meni.png`).
- Početni jelovnik je u `Jelovnik.csv`, prepisan iz vaše tablice. „Gostujući mesni specijalitet” i „Slastica (odluči)” su **skriveni** dok ih ne uredite i označite kao dostupne.
- Narudžbe su **zatvorene** dok ih ne otvorite (na ekranu narudžbi ili u adminu). Otvorite ih 10.12.
- Brojevi narudžbi kreću od #1 svaki dan. Dan se mijenja u 06:00, pa narudžbe poslije ponoći pripadaju večeri prije.

## Puštanje na internet (Cloudflare Workers, besplatni plan)
Cloudflare sam objavljuje aplikaciju iz ovog GitHub repozitorija.

1. Na dash.cloudflare.com: **Workers & Pages** → **Create** → **Import a repository** → odaberite repozitorij **Echoes-of-The-Island**. Cloudflare čita `wrangler.toml` i napravi Worker **`echoes-of-the-island`**.
2. **Settings → Variables and Secrets → Add** → vrsta **Secret**, naziv `ADMIN_PASSWORD`, vrijednost je vaša lozinka (dugačka, ne ista kao drugdje). Isto tako dodajte `STAFF_PIN` za ekran narudžbi. Tajne idu pod *Runtime variables and secrets*, a ne pod *Build*.
3. Stranica radi na `https://echoes-of-the-island.<vaš-račun>.workers.dev/`. HTTPS je uključen sam od sebe.
4. *(Po želji)* Vlastita domena: **Settings → Domains & Routes → Add → Custom domain**, npr. `prijave.vasa-domena.hr`. Zatim dodajte varijablu `PUBLIC_URL` = `https://prijave.vasa-domena.hr/` (vrsta Text), da QR kod vodi na nju.
5. Otvorite `/admin`, upišite lozinku, učitajte svoj CSV termina i ispunite postavke.

## QR kod za letak (prijave smjena)
- U `/admin` → **Postavke** → **QR kod za letak** preuzmite **SVG** (vektorski, najbolji za tisak) ili **PNG** (≈1500 px ili ≈3000 px, 300 dpi). QR kod vodi na adresu na kojoj je stranica otvorena (ili na `PUBLIC_URL`).
- Izravne adrese: `/qr.svg` i `/qr.png`.
- Na računalu: `npm install` pa `npm run qr -- https://echoes-of-the-island.<vaš-račun>.workers.dev/`. Datoteke se spreme u mapu `qr/`.
- Prije tiska skenirajte QR kod mobitelom.

## Letak i naljepnice za stolove (mapa `tisak/`)
Gotove datoteke s QR kodovima koji vode na `echoes-of-the-island.t-matkovicml.workers.dev`:
- `letak-A5.pdf`: letak za prijave smjena (A5), za ispis u uredu ili za pregled.
- `letak-A5-za-tiskaru.pdf`: isti letak s 3 mm za obrez (154 × 216 mm), za tiskaru.
- `naljepnica-90mm.pdf`: naljepnica za stol za QR narudžbe, 90 × 90 mm, s 2 mm za obrez.
- `naljepnice-A4-6kom.pdf`: 6 naljepnica na A4 s isprekidanim linijama za rezanje (samoljepivi papir, ili izrezati i plastificirati).
- `.png` datoteke su pregledi.

Ako stranica dobije drugu adresu (vlastita domena), napravite datoteke ponovno: `node scripts/tisak.js https://nova-adresa/` (treba Playwright). Prije tiska skenirajte QR kod mobitelom. Tamna pozadina troši puno boje, pa je za veće naklade bolje tiskati u tiskari.

## Promo letci i logo (mape `tisak/promo/` i `tisak/logo/`)
- **Promo letci A5** (svaki i u inačici „-za-tiskaru” s 3 mm za obrez). Svi imaju QR kod za jelovnik i narudžbe mobitelom.
  - `advent`: „Zimska kućica na Trgu”, jelovnik i koncerti na Trgu.
  - `bozic`: „Badnjak do 3 ujutro”, Badnjak, Božić, Dellboys i studentska večer.
  - `novagodina`: „Doček uz SuperCover Band”, zadnji tjedan i radno vrijeme.
- **Logo**:
  - `logo-winter-edition.png` (prozirna podloga) i `-tamna-podloga.png`: logo s natpisom Winter Edition;
  - `logo-badge-advent.png`: okrugli znak za društvene mreže i naljepnice;
  - `logo-roza.svg`, `logo-krem.svg` i `logo-crni.svg`: vektorski logo u tri boje (krem za tamnu podlogu, crni za jednobojni tisak).
- Datumi koncerata su program Adventa na Trgu RH iz tablice planiranja. Prije tiska provjerite ih s organizatorom programa.
- Nove datoteke: `node scripts/promo.js` (treba Playwright).

## Privatnost
- Prijave smjena: prikuplja se samo ime i prezime, broj mobitela i odabrani termini. Narudžbe: stavke, iznos, način plaćanja i po želji ime za prozivanje i napomena. Uz to se za ograničenje broja zahtjeva čuva IP adresa, najviše jedan dan.
- Javni dio ne prikazuje ni imena ni brojeve, nego samo broj slobodnih mjesta. Na privatnoj poveznici osoba vidi samo svoje termine.
- Nema analitike, kolačića ni vanjskih servisa. Fontovi (Barlow, licenca OFL) i logo poslužuju se iz same aplikacije, a podaci se ne šalju trećim stranama.
- Stranice `/moji/…` i `/admin` nisu indeksirane.

## Brisanje podataka nakon sezone
1. **Izvoz**: `/admin` → **⬇ Izvoz CSV (Excel)** (datum, dan, tjedan, blok, vrijeme, sati, ime, mobitel, status).
2. **Brisanje** (briše prijave smjena te imena i napomene iz narudžbi; stavke i iznosi narudžbi ostaju za statistiku):
   - Automatski: na datum iz postavke „Automatsko brisanje” (zadano 31. 1. 2027.) brišu se sve prijave i zatvaraju se prijave.
   - Odmah: `/admin` → **Postavke** → **Brisanje podataka** → upišite `OBRIŠI` → **Obriši sve prijave**.
3. **Potpuno uklanjanje** (po želji): na Cloudflareu **Workers & Pages → echoes-of-the-island → Settings → Delete**. To briše i bazu.

## Lokalno pokretanje i testovi
```bash
npm install
printf 'ADMIN_PASSWORD=test\nSTAFF_PIN=1234\n' > .dev.vars
npm run dev                 # http://localhost:8787  i  /admin (lozinka: test)
npm test                    # pravila: mobitel, ISO tjedni, 30 h, jedan blok dnevno, CSV termina, jelovnik i cijene narudžbi
npm run test:server         # pravi poslužitelj (wrangler dev): istovremene prijave, otkazivanje, admin, izvoz, QR, narudžbe
```

## Datoteke
- `src/index.js`: poslužitelj (Worker) i baza (Durable Object, SQLite)
- `Termini_prijave.csv`: početni termini
- `src/rules.js`: pravila (mobitel, tjedni, 30 h, jedan blok dnevno, CSV termina)
- `src/public.html`: stranica za učenike
- `src/menu.html`: jelovnik i narudžba za goste
- `src/kitchen.html`: ekran narudžbi u kućici
- `src/orders.js`: jelovnik, cijene i narudžbe
- `Jelovnik.csv`: početni jelovnik
- `src/admin.html`: stranica za organizatora
- `src/qr.js` i `scripts/qr.js`: QR kod (SVG i PNG)
- `scripts/tisak.js`, `scripts/promo.js` i `tisak/`: letci, naljepnice, promo letci i logo
- `public/`: logo i fontovi
- `test/`: testovi
