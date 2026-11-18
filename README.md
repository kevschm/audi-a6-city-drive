# Audi A6 C4 Avant · City Drive

Browser-Fahrsimulation mit einem schwarzmetallic lackierten, eigens modellierten Audi A6 C4 Avant und einem frei befahrbaren europäischen Stadtviertel. Das Spiel ist ein unabhängiges Projekt.

[Öffentliche Spieladresse](https://audi-a6-city-drive.schmidtkevinprivat.workers.dev/)

## Steuerung

| Aktion | Tastatur | Touch |
| --- | --- | --- |
| Gas, Lenkung, Bremse | WASD oder Pfeiltasten | Lenktasten links, Pedale rechts |
| Rückwärtsfahren | Im Stand S oder ↓ drücken | Im Stand erneut Bremse antippen |
| Handbremse | Leertaste | Handbr. |
| Kamera | V | Kamerataste |
| Pause | P oder Escape | Pause |
| Neustart | R | Im Pausenmenü |
| Scheinwerfer | L | Licht im Fahrtmenü |
| Blinker | Q / E | Pfeile neben dem Tacho |
| Bahnhofsrunde | T | Zeitfahrt im Fahrtmenü |
| Ton und Grafik | Fahrtmenü oben rechts | Fahrtmenü oben rechts |

Im Querformat können Gas und Lenkung gleichzeitig gehalten werden. Zur Auswahl stehen die Verfolger-, Schräg-, Motorhauben- und Frontansicht. Im Pausenmenü lassen sich Tageszeit, Lenkeinschlag und Lautstärke einstellen. Der Ton startet über „Motor starten“ und lässt sich im Fahrtmenü stummschalten. Bei Standard-Gamepads lenkt der linke Stick, RT gibt Gas, LT bremst und A zieht die Handbremse.

Für die Bahnhofsrunde vom Startplatz aus durch das erste Tor fahren und den goldenen Markierungen folgen. Die Uhr startet beim Überqueren der ersten Markierung und die Minikarte zeigt das nächste Tor. Die Bestzeit wird im Browser gespeichert.

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

- `src/render/` enthält den WebGL-Renderer, prozedurale Oberflächen, spiegelnde Materialien, Tag- und Abendlicht, die Fahrzeuggeometrie und die Grafikstufen. Performance reduziert Pixelbudget und Sichtweite. Balanced ergänzt statische Schatten mit zwischengespeicherter Schattenkarte. Quality ergänzt dynamische Fahrzeugschatten und Kantenglättung über FXAA.
- `src/world/` erzeugt Stadt, Straßen, Ampeln, Parkbuchten, statische Kollisionen und KI-Verkehr aus lokalem Quellcode.
- `src/simulation/` berechnet die Fahrt mit 60 Hz. Das Zweiachsmodell nutzt einen frontlastigen Schwerpunkt, eine V6-Drehmomentkurve und ein Automatikgetriebe. Vier getrennte Radkontakte liefern Höhe, Schlupf und Grip für gemischte Untergründe. Die Zeitfahrt nutzt dieselbe Simulationsuhr.
- `src/ui/` enthält Kamera, Minikarte und synthetischen Web-Audio-Ton mit Drehzahl und Last sowie belagsabhängigem Abrollgeräusch.

Das Avant-Modell entstand anhand der Proportionen des [Audi-Datenblatts zum A6 Avant C4](https://www.audi.de/content/dam/nemo/customer-area/more-information/predecessor-models/a6/pdf/a6avc4/1995_06_a6av_c4_28quattro.pdf). Die Fahrphysik verwendet einen angenäherten Frontantrieb. Fahrzeug, Stadt und Audio verwenden eigene prozedurale Assets.

WebGL und das Zweiachsmodell bleiben erhalten. Die vorhandenen Mesh-Gruppen und Oberflächenhöhen ermöglichen die für diese Version benötigten Reflexionen, Radkontakte und Kollisionen im statischen Build. Ein glTF-Workflow mit vollständigen PBR-Texturen und eine 3D-Starrkörpersimulation sind mögliche nächste Architekturentscheidungen, sobald passende Assets und Gelände vorhanden sind.

## Veröffentlichung

Der vorhandene Cloudflare Worker `audi-a6-city-drive` liefert statische Dateien aus. In `wrangler.jsonc` zeigt `assets.directory` auf `./dist`. Die Produktionskonfiguration verwendet `main`, `npm run build` und `npx wrangler deploy`.

Für einen direkten Upload dieselben gebauten Dateien aus `dist/` im bestehenden Worker auswählen. Die Struktur um `index.html` und `src/` ist Teil des Builds. Anschließend die Spieladresse, die JavaScript-Module und die Fahrt im Browser prüfen.
