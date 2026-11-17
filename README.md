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

## Ohne Download im Browser ausprobieren (GitHub Codespaces)

Das Projekt startet im Codespace automatisch einen Node-Webserver auf Port 8000 und versucht, die Spielvorschau im Browser zu öffnen.

**[Codespaces für Audi A6 City Drive öffnen](https://codespaces.new/kevschm/audi-a6-city-drive?quickstart=1)**

GitHub-Anmeldung und gegebenenfalls Erstellung eines Codespace können erforderlich sein. Im Browser kann eine Bestätigung zur Vorschau erscheinen. Ein Codespace ist eine temporäre Entwicklungsumgebung und **keine dauerhafte öffentliche Website**; die laufende Umgebung verbraucht Codespaces-Ressourcen und kann nach Freikontingent Kosten verursachen.

## Veröffentlichung

Die Veröffentlichung erfolgt über **Cloudflare Pages** mit GitHub-Anbindung. Das Repository darf privat bleiben; die bereitgestellte Spielwebsite ist standardmäßig **öffentlich erreichbar**. Die produktive URL ist noch nicht eingerichtet oder verifiziert.

Einmalig im Cloudflare-Dashboard ein Pages-Projekt über **Workers & Pages → Create application → Pages → Connect to Git** anlegen und das private Repository `kevschm/audi-a6-city-drive` autorisieren. Als Produktionszweig `main` festlegen.

| Cloudflare-Einstellung | Wert |
| --- | --- |
| Project name | `audi-a6-city-drive` (falls verfügbar) |
| Framework preset | `None` |
| Production branch | `main` |
| Root directory | `/` (Repository-Wurzel) |
| Build command | `npm run build` |
| Build output directory | `dist` |

Der Build kopiert **nur die zur Ausführung benötigten Spiel-Dateien** in `dist/`. Entwicklungsdateien und Tests werden nicht bereitgestellt. Nach jeder Änderung an `main` kann Cloudflare automatisch neu veröffentlichen. Die URL wird erst nach erfolgreicher Bereitstellung angezeigt.

**Hinweis:** Auch bei privatem Repository können Besucher einer öffentlichen Browser-Spielseite das ausgelieferte HTML, CSS und JavaScript sehen. Für eine ausschließlich private Spielseite wäre zusätzlich eine Zugriffskontrolle erforderlich.

## Entwicklung

Die priorisierte technische Bestandsaufnahme und weitere Planung stehen in [ROADMAP.md](ROADMAP.md).
