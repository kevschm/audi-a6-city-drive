# Audi A6 C5 Avant · City Drive

Browser-Fahrsimulation mit einem schwarzmetallic lackierten, eigens modellierten Audi A6 C5 Avant und einem frei befahrbaren europäischen Stadtviertel. Das Spiel ist ein unabhängiges Projekt.

[Öffentliche Spieladresse](https://audi-a6-city-drive.schmidtkevinprivat.workers.dev/)

## Steuerung

| Aktion | Tastatur | Touch |
| --- | --- | --- |
| Gas, Lenkung, Bremse | WASD oder Pfeiltasten | Lenktasten links, Pedale rechts |
| Rückwärtsfahren | Im Stand S oder ↓ drücken | Im Stand erneut Bremse antippen |
| Handbremse | Leertaste | Handbr. |
| Kamera | V oder mit der Maus ziehen und scrollen | Kamerataste oder auf der Szene ziehen und mit zwei Fingern zoomen |
| Pause | P oder Escape | Pause |
| Neustart und Reparatur | R | Reset im Fahrtmenü |
| Scheinwerfer | L | Licht im Fahrtmenü |
| Blinker | Q / E | Pfeile neben dem Tacho |
| Bahnhofsrunde | T | Zeitfahrt im Fahrtmenü |
| Ton und Grafik | Fahrtmenü oben rechts | Fahrtmenü oben rechts |

Im Querformat können Gas und Lenkung gleichzeitig gehalten werden. Die freie Kamera lässt sich um das Auto drehen, neigen und zoomen. Im Cockpit bewegen sich das Vier-Speichen-Lenkrad, der Tachometer und der Drehzahlmesser mit dem Fahrzeugzustand. Das Licht schaltet die Instrumentenbeleuchtung heller. Im Pausenmenü lassen sich Tageszeit, Fahrbahnzustand, Lenkeinschlag und Lautstärke einstellen. Der Ton startet über „Motor starten“ und lässt sich im Fahrtmenü stummschalten. Bei Standard-Gamepads lenkt der linke Stick, RT gibt Gas, LT bremst und A zieht die Handbremse.

Auf nasser Fahrbahn stehen weniger Reifenkräfte zur Verfügung. Bremswege verlängern sich und die Räder werfen Sprühnebel auf. Das Ultra-Profil zeichnet für nasse Straßen eine niedrig aufgelöste Spiegelansicht. Balanced und Performance nutzen eine günstigere Umgebungsreflexion.

Aufprall und Streifkontakt hinterlassen Dellen um die ermittelte Kontaktstelle. Harte Kollisionen können Haube und Heck verformen, Leuchten und Scheiben beschädigen, Stoßfänger oder Spiegel lösen und die Kühlung, Bremsen und den Motor beeinträchtigen. Treffer am Rad können das Rad sichtbar schräg stellen und die Spur verziehen. In der Stadt reagieren Verkehr, Fußgänger und ausgewählte Gegenstände auf Kollisionen. Reset repariert das Fahrzeug und stellt es an den Start.

Für die Bahnhofsrunde vom Startplatz aus durch das erste Tor fahren und den goldenen Markierungen folgen. Die Uhr startet beim Überqueren der ersten Markierung und die Minikarte zeigt das nächste Tor. Die Bestzeit wird im Browser gespeichert.

## Freie Fahrt

Das Außenmodell orientiert sich an zwei Fotoperspektiven des schwarzen Avant. In den Wohnstraßen liegen Vorgärten hinter niedrigen Mauern. Der Wasserturm markiert die Gießerei. Ein gestaffelter Hügelhorizont verbindet die Viertel optisch.

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
Mit `GAME_URL` prüft derselbe Test eine Veröffentlichung. Er erwartet die Versionsnummer aus `package.json`. Mit `VISUAL_COMPARE=1` und einem bestehenden Ordner in `SCREENSHOT_DIR` erzeugt er reproduzierbare Front-, Heck- und Schadensansichten bei festen Kamerapositionen. Falls der Treiber WebGL-Timer-Abfragen unterstützt, protokolliert er auch die GPU-Zeit der Schadensansicht.

```sh
npm run test:browser
```

## Architektur

- `src/render/` enthält den WebGL-Renderer, prozedurale Oberflächen, spiegelnde Materialien, Tag- und Abendlicht, die Fahrzeuggeometrie und die Grafikstufen. Performance reduziert Pixelbudget und Sichtweite. Balanced ergänzt statische Schatten mit zwischengespeicherter Schattenkarte. Balanced und Ultra erfassen die statische Umgebung des Audi für Lack und Glas in einer lokalen 64-Pixel-Cubemap. Pro Frame wird höchstens eine Seite erneuert. Ultra ergänzt dynamische Fahrzeugschatten und Kantenglättung über FXAA.
- `src/world/` erzeugt Stadt, Straßen, Ampeln, Parkbuchten, statische Kollisionen und KI-Verkehr aus lokalem Quellcode.
- `src/simulation/` berechnet die Fahrt mit 60 Hz. Das frontlastige Zweiachsmodell koppelt vier Radkontakte mit einem planaren Kontaktlöser für Fahrzeuge. Lose Gegenstände und abgelöste Teile haben vereinfachte räumliche Bewegung mit Schwerkraft, Boden und begrenzten Kollisionsschritten. Figuren nutzen gewichtete Knoten mit Gelenkgrenzen. Auch die Zeitfahrt verwendet die Simulationsuhr.
- `src/ui/` enthält Kamera, Minikarte und synthetischen Web-Audio-Ton mit Drehzahl und Last sowie belagsabhängigem Abrollgeräusch.

Die Fahrphysik verwendet einen angenäherten Frontantrieb mit einer für das Spiel kräftiger abgestimmten V6-Kennlinie. Fahrzeug, Stadt und Audio verwenden eigene prozedurale Assets.

Für Scheinwerferwaschdüsen, Zusatzinstrumente und Mittelkonsole diente ein [A6 Avant von 1996](https://bringatrailer.com/listing/1996-audi-a6-3/) als Referenz. Das Holzdekor orientiert sich an der dokumentierten Ausstattung eines [späten C4 Avant](https://carsandbids.com/auctions/9lRbeyjE/1998-audi-a6-avant-28-quattro).

Die Lösung kombiniert lokale GPU-Verformung, abtrennbare Mesh-Gruppen und einen planaren Fahrzeuglöser. Im Stadtverkehr bleiben Fahrzeuge an das Straßenprofil gekoppelt. Der separate Bordsteinversuch berechnet seitliche und vertikale Bewegung sowie Drehimpuls um die Längsachse mit sechs Kontaktteilschritten pro Tick. Reifen, Schweller und Dachkanten können die Stufe und den Boden berühren. Die Ausrichtung freier Teile und die Kollisionskörper sind vereinfacht. Die vorhandene statische Cloudflare-Auslieferung benötigt dafür keine neue Laufzeitabhängigkeit. [Rapier 3D](https://rapier.rs/docs/user_guides/javascript/getting_started_js/) ist für spätere räumliche Fahrzeuge und Gelenke geeignet und würde eine asynchrone WebAssembly-Initialisierung in den Build aufnehmen.

## Veröffentlichung

Der vorhandene Cloudflare Worker `audi-a6-city-drive` liefert statische Dateien aus. In `wrangler.jsonc` zeigt `assets.directory` auf `./dist`. Die Produktionskonfiguration verwendet `main`, `npm run build` und `npx wrangler deploy`.

Für einen direkten Upload dieselben gebauten Dateien aus `dist/` im bestehenden Worker auswählen. Die Struktur um `index.html` und `src/` ist Teil des Builds. Anschließend die Spieladresse, die JavaScript-Module und die Fahrt im Browser prüfen.
