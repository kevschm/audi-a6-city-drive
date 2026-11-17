# Audi A6 C4 Avant – City Drive

Privates Entwicklungsprojekt einer 3D-Fahrsimulation mit einem schwarzen Audi A6 C4 Avant und einer europäischen Stadt. **Prototyp**, keine Verbindung oder offizielle Zusammenarbeit mit Audi AG oder Rockstar Games.

## Stand

Version 0.3 (technische Grundlage). Aktueller Renderer: eigenes WebGL 1.0, keine externen Laufzeitbibliotheken. Die ursprüngliche Darstellung und Fahrzeugphysik werden vorerst erhalten; ein fester Simulationstakt und eine modulare Dateistruktur wurden ergänzt.

## Lokal starten

Das Spiel nutzt JavaScript-Module und muss daher über einen lokalen HTTP-Server oder eine veröffentlichte HTTPS-Seite gestartet werden. Ein direkter `file://`-Aufruf ist nicht zuverlässig.

```bash
python -m http.server 8000
```

Dann `http://localhost:8000/` öffnen. Alternativ einen beliebigen statischen Webserver nutzen.

## Steuerung

- **Smartphone:** eingeblendete Tasten für Gas, Bremse, Lenkung und Handbremse.
- **PC:** WASD / Pfeiltasten, Leertaste für Handbremse, V für Kamera, R für Reset, P für Pause.

## Tests

Node.js >=20 benötigt, keine Pakete zu installieren:

```bash
npm run verify
```

## Veröffentlichung

Das Repository ist privat. Ziel ist eine HTTPS-Bereitstellung über Cloudflare Pages mit GitHub-Anbindung. Die öffentliche Spiel-URL ist noch nicht eingerichtet oder verifiziert. Statisches Hosting: Root-Verzeichnis `/`, kein Build-Befehl erforderlich. `index.html` lädt `src/main.js` und `src/styles.css` direkt.

## Entwicklung

Die priorisierte technische Bestandsaufnahme und weitere Planung stehen in [ROADMAP.md](ROADMAP.md).
