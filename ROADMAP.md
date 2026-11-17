# Audi A6 C4 Avant – technische Roadmap

Stand: 17. November 2026. Qualitätsziel: spielbare, glaubwürdige Fahrzeug- und Stadtsimulation, zunächst als mobilefähige Browser-Anwendung.

## Bestandsaufnahme des Ausgangsstands (v2.0)

| Bereich | Ist-Zustand | Hauptdefizit |
| --- | --- | --- |
| Architektur | Ein HTML-Dokument (~45 KB) enthält CSS, Rendering, Geometrie, Physik, UI und Stadt | Schwer wartbar und testbar |
| Grafik | Eigener einfacher WebGL-1-Renderer, Vertexfarben, mathematisch erzeugte Gebäude, rudimentäre Lichtberechnung | Keine PBR-Materialien, Texturen, echten dynamischen Schatten oder Detail-Assets |
| Audi | Programmatisch generiertes, kantiges Modell mit einzelnen Merkmalen des C4 Avant | Proportionen nur angenähert, kein professionelles Mesh und kein Innenraum |
| Fahrzeugphysik | Handgeschriebenes Reifen-/Lenk-Modell, Kollisionsprüfung gegen AABB-Punkte | Keine Physik-Engine, kein Fahrwerk, vereinfachte Reifenkräfte, bisher variable Substeps |
| Stadt | Starres Straßengitter, einige Viertel und einfache Verkehrsfahrzeuge | Repetitive Straßenführung, keine Streaming-Sektoren, vereinfachte KI |
| Performance | Geometriepuffer werden einmalig hochgeladen, Mobil-Eco-Modus | Kein Profiling, kein Frustum-Culling/LOD; FPS-Ziele nicht gemessen |
| Deployment | Statische Dateien, privates GitHub-Repo | Keine verifizierte Website; Cloudflare-Pages-Verbindung ausstehend |
| Tests | Ursprünglich keine Testsuite | Gameplay-Regressionsrisiko |

## Priorisierte Phasen und Abnahmekriterien

### P0 – Wartbarkeit und verlässlicher Start (begonnen)
- [x] HTML, Styles und JavaScript in getrennte Dateien aufteilen.
- [x] Fester 60-Hz-Physiktakt, begrenztes Aufholen, Unterbrechungen ohne Zeitsprung.
- [x] Node-basierte Tests für Simulationsuhr sowie Syntaxprüfung hinzufügen.
- [ ] Starten und Fahren auf Samsung Internet, Chrome/Android und Windows/Chrome **auf echten Geräten prüfen**.
- [x] Produktions-Build für Cloudflare Pages vorbereitet (`npm run build`, Ausgabe `dist/`).
- [ ] Cloudflare Pages an das private GitHub-Repo anbinden; produktive URL prüfen.
- [x] GitHub Actions führt Syntaxprüfung und Simulationsuhr-Unit-Tests bei Push/PR aus.
- [ ] Später: Vite-Entwicklungsserver für weitere Module und Assets ergänzen.

**Abnahme P0:** Spiel startet ohne Fehlermeldung über HTTPS; Gas, Bremse, Lenkung, Pause und Reset funktionieren; Testskript läuft fehlerfrei.

### P1 – Fahrphysik und belastbares Fahrzeugmodell
- [ ] Physik-Engine (z. B. Rapier) anhand Web-Bundle, Performance und Vehicle-Modell evaluieren.
- [ ] Fahrzeugparameter (Gewicht, Radstand, Spur, Schwerpunkt, Antrieb, Reifen) in eigenem Datenmodell.
- [ ] Federung, Schlupfwinkel, Untersteuern, Handbremse und Kollisionskörper implementieren.
- [ ] Referenzfahrten (0–100, Bremsweg, Kurvenradius) und Regressionstests.
- [ ] Detailgenaueres, rechtmäßig nutzbares A6-C4-Avant-Modell (glTF) inklusive LOD und Lichtfunktionen integrieren.

**Abnahme P1:** Reproduzierbarer Fahreindruck bei 30/60 FPS, plausibles Verhalten; deutlich besseres Fahrzeugmodell ohne gravierenden Performanceverlust.

### P2 – Visual-Vertical-Slice Stadtviertel
- [ ] Modernisierung Renderpfad (Three.js / WebGL2-Option) begründet entscheiden.
- [ ] Ein hochwertiges Stadtviertel mit gekrümmter Hauptstraße, Nebenstraße, Parkfläche und glaubwürdigen Kreuzungen.
- [ ] PBR-Texturen, Schattenbudget, Lichtstimmung, Asphalt/Markierungen und passende Architektur-Assets.
- [ ] Sichtweitenmanagement/LOD, Frustum-Culling, Mesh-Instancing, Profiling.

**Abnahme P2:** Ein kurzes Stadtviertel wirkt sichtbar überzeugender; mobile Performance mit Messdaten dokumentiert.

### P3 – Lebendige Stadt
- [ ] Einfache Verkehrs-KI mit Spurführung, Kreuzungen und Ampeln.
- [ ] Parkende Autos, Verkehrszeichen und Sound; Fußgänger erst bei stabiler Performance.
- [ ] Mobile Grafikstufen und Kameraqualität verbessern.

### P4 – Welt, Wetter und langfristige Qualität
- [ ] Weitere Stadtteile mit Streaming-System, Tag/Nacht, Wetter und optional Cockpit ergänzen.
- [ ] Auf realen Geräten regelmäßig Frametimes, RAM- und GPU-Budget messen.

## Technische Leitplanken

1. Keine Behauptung von GTA-IV-Grafikqualität ohne entsprechende Assets und Messungen.
2. Kleine, hochwertig gebaute Umgebung vor großer, generischer Stadt.
3. Bestehende Spielfunktionen bei Refactoring erhalten und durch Tests absichern.
4. Repository bleibt privat; öffentliches Hosting der Web-App ist eine **getrennte** Entscheidung.
5. Jede Verbesserung mit Git-Commit, überprüfbarem Teststatus und offenen Risiken dokumentieren.
