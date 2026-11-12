# TijdBeeld-data

Openbare fotocatalogus voor de Android-app TijdBeeld. De app leest `photos.json`; afbeeldingen blijven op hun oorspronkelijke beeldbanklocatie staan.

## Catalogus

- Bestand: [photos.json](./photos.json)
- Iedere foto heeft een vast `id`, titel, afbeeldings-URL, objectcoördinaten, fotograafcoördinaten en `imageWidthMeters`.
- De afbeeldingsbestanden worden niet naar deze repository gekopieerd of verkleind.

## Beveiligd publiceren via Cloudflare Worker

De Worker in [worker.js](./worker.js) geeft de catalogus openbaar door en accepteert alleen publicatie met een geheime beheersleutel. De GitHub-token staat uitsluitend als Cloudflare Worker-secret opgeslagen; hij komt nooit in de Android-app.

### Eenmalige installatie

1. Maak in Cloudflare een Worker met de naam **tijdbeeld-catalogus**.
2. Plak de inhoud van `worker.js` in de Worker en deploy.
3. Voeg bij Worker → Settings → Variables and Secrets twee secrets toe:
   - `GITHUB_TOKEN`: een GitHub fine-grained personal access token, alleen voor repository `leeuw008-nl/TijdBeeld-data`, met **Contents: Read and write**.
   - `ADMIN_SECRET`: een eigen lange, willekeurige geheime sleutel (minimaal 32 tekens). Bewaar deze in een wachtwoordmanager.
4. Deploy de Worker opnieuw als Cloudflare daarom vraagt.

De app gebruikt daarna als publicatieadres:

```
https://tijdbeeld-catalogus.<jouw-cloudflare-subdomein>.workers.dev/photos
```

Vul dit adres en de `ADMIN_SECRET` in bij **Gedeelde catalogus publiceren** in TijdBeeld. De beheersleutel wordt niet opgeslagen in de app en wordt na een geslaagde publicatie uit het invoerveld gewist.

### Beveiliging

- Alleen iemand met de geheime beheersleutel kan de openbare catalogus wijzigen.
- De GitHub-token blijft aan de serverzijde in Cloudflare.
- De Worker accepteert alleen een geldige catalogus met unieke foto-ID's, HTTPS-afbeeldingsadressen, geldige coördinaten en een fotobreedte van 1 tot 12 meter.
- De catalogus blijft openbaar leesbaar; dat is nodig zodat iedere TijdBeeld-installatie de foto's kan ophalen.
