# Audi A6 C4 Avant · City Drive

Browser-Fahrsimulation mit einem schwarzmetallic lackierten, eigens modellierten Audi A6 C4 Avant und einem frei befahrbaren europäischen Stadtviertel. Das Spiel ist ein unabhängiges Projekt.

**Spiel starten:** [Audi A6 City Drive](https://audi-a6-city-drive.schmidtkevinprivat.workers.dev/)

## Steuerung

| Aktion | Tastatur | Touch |
| --- | --- | --- |
| Gas, Lenkung, Bremse | WASD oder Pfeiltasten | Lenktasten links, Pedale rechts |
| Rückwärtsfahren | Im Stand S oder ↓ drücken | Im Stand erneut Bremse antippen |
| Handbremse | Leertaste | Handbr. |
| Kamera | V | Kamerataste |
| Pause | P oder Escape | Pause |
| Neustart | R | Im Pausenmenü |
| Ton und Grafik | Fahrtmenü oben rechts | Fahrtmenü oben rechts |

In Querformat können Gas und Lenkung gleichzeitig gehalten werden. Die Motorhaubenansicht blickt nach vorn über das Fahrzeug. Der Ton startet über „Motor starten“ und lässt sich im Fahrtmenü stummschalten.

## Lokal entwickeln

Node.js 20 oder neuer genügt für Build, Server und Modultests. Es gibt keine externen Laufzeitpakete.

```sh
npm start
npm run verify
```

Der Spielserver ist unter `http://localhost:8000/` erreichbar. Der Build legt die statischen Dateien in `dist/` ab. Um genau diese Dateien lokal zu testen, kann der Node-Server aus diesem Verzeichnis gestartet werden.

```sh
npm run build
cd dist
node ../scripts/serve.mjs
```

Der Browser-Smoke-Test benötigt Node.js 22 oder neuer und Chromium. Unter Windows verwendet er standardmäßig Edge. Mit `BROWSER_BIN` kann der Browserpfad und mit `BROWSER_ANGLE=d3d11` auf Windows der Grafikpfad für eine separate Hardwareprüfung gesetzt werden. Der Standard verwendet SwiftShader. Der Test bedient die gebaute Seite mit Tastatur und emuliertem Mehrfingertouch.

```sh
npm run test:browser
```

## Architektur

- `src/render/` enthält den WebGL-Renderer, prozedurale Oberflächen, die Fahrzeuggeometrie und die Grafikstufen. Sektorgrenzen reduzieren die sichtbare Stadtgeometrie. Auto und Hoch nutzen hardwareabhängig eine Schattenkarte. Eco reduziert Auflösung und Sichtweite und verwendet Kontaktschatten.
- `src/world/` erzeugt Stadt, Straßen, Ampeln, Parkbuchten, statische Kollisionen und KI-Verkehr aus lokalem Quellcode.
- `src/simulation/` berechnet die Fahrt mit 60 Hz. Das planare Zweiachsmodell nutzt einen frontlastigen Schwerpunkt, eine V6-Drehmomentkurve, ein Automatikgetriebe, unterschiedlich griffige Oberflächen und Dämpfung für Hub-, Roll- und Nickbewegung.
- `src/ui/` enthält Kamera, Minikarte und synthetischen Web-Audio-Ton.

Das Avant-Modell entstand anhand der Proportionen des [Audi-Datenblatts zum A6 Avant C4](https://www.audi.de/content/dam/nemo/customer-area/more-information/predecessor-models/a6/pdf/a6avc4/1995_06_a6av_c4_28quattro.pdf). Die Fahrphysik verwendet einen angenäherten Frontantrieb. Fahrzeug, Stadt und Audio verwenden eigene prozedurale Assets.

Für diese Version bleibt WebGL erhalten. Der Renderer setzt auf vorhandener gebündelter Geometrie auf und liefert denselben statischen HTTP-Einstieg auf Windows und Mobilgeräten. Three.js kann bei einem späteren Wechsel zu glTF und einem PBR-Asset-Workflow den Szenengraph und die Materialpflege vereinfachen. Rapier bietet einen Raycast-Fahrzeugcontroller für einzelne Radkontakte und 3D-Starrkörper; die derzeitige ebene Stadt nutzt den vorhandenen Simulations- und Kollisionsansatz weiter.

## Veröffentlichung

Der vorhandene Cloudflare Worker `audi-a6-city-drive` liefert statische Dateien aus. In `wrangler.jsonc` zeigt `assets.directory` auf `./dist`. Die Produktionskonfiguration verwendet `main`, `npm run build` und `npx wrangler deploy`.

Für einen direkten Upload dieselben gebauten Dateien aus `dist/` im bestehenden Worker auswählen. Die Struktur um `index.html` und `src/` ist Teil des Builds. Anschließend die Spieladresse, die JavaScript-Module und die Fahrt im Browser prüfen.
