# Echoes of the Island, Advent na Lošinju 2026.: prijava smjena i QR narudžbe

Mala web aplikacija preko koje punoljetni učenici sami biraju smjene u adventskoj kućici na Trgu Republike Hrvatske u Malom Lošinju (10. 12. 2026. – 2. 1. 2027.). Stranica se otvara skeniranjem QR koda s letka, s mobitela i bez ikakvog računa.

- **Učenik** (`/`) bira termine po danima (blok A i B), upisuje ime i prezime i broj mobitela, potvrđuje da ima 18 godina i pristaje na obradu podataka. Nakon prijave dobiva **privatnu poveznicu** (`/moji/…`) na kojoj vidi svoje termine i može ih otkazati do roka.
- **Organizator** (`/admin`, lozinka) vidi tko je na kojem terminu (ime, mobitel) i koliko je mjesta ostalo. Ima i pregled po osobi sa satima po tjednu, ručno dodavanje i uklanjanje prijava, broj mjesta po terminu, otvaranje i zatvaranje prijava, izvoz u CSV za Excel, učitavanje termina iz CSV-a, QR kod i brisanje podataka.

## Pravila (provjerava ih poslužitelj, ne samo preglednik)
- **Pun termin se odmah zatvara.** Broj mjesta provjerava se na poslužitelju u jednoj transakciji. Sve prijave obrađuje jedan Cloudflare Durable Object, i to jednu po jednu, pa dvije istovremene prijave ne mogu zauzeti isto zadnje mjesto. To dokazuje test u kojem se 30 ljudi istovremeno prijavljuje na jedno mjesto i samo jedan uspije.
- **Najviše 30 sati tjedno** po osobi, po ISO tjednima (10.–13.12. je 50. tjedan, a 28.12.–2.1. je 53. tjedan).
- **Najviše jedan blok dnevno** po osobi.
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
| Satnica i uvjeti rada | prazno | Prikazuju se učenicima samo ako ih upišete. |
| Organizator | prazno | Naziv i kontakt za obavijest o privatnosti. |
| Automatsko brisanje | **31. 1. 2027.** | Tog dana se brišu sva imena i mobiteli, a prijave se zatvaraju. |

## Tablica Advent_2026 (list „Prijave”)
U `/admin` gumb **⬇ Za tablicu (list Prijave)** daje CSV sa stupcima *Ime i prezime; Datum; Blok*, s datumom u obliku `2026-12-10`, koji Excel čita kao datum.
1. Otvorite CSV i kopirajte retke ispod naslova (stupci A–C).
2. U tablici, list **Prijave**, kliknite ćeliju **A5** i zalijepite.

Formule u listovima Prijave, Smjene plan i Učenici tada same izračunaju sate, tjedan, broj prijavljenih i status. Imena za list Učenici upišite točno kao u CSV-u. Provjereno je na kopiji vaše tablice.

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
- `public/`: logo i fontovi
- `test/`: testovi
