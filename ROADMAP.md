# Entwicklungsstand und offene Arbeiten

## Version 0.5

Die Spielversion hat Tag- und Abendlicht, Scheinwerferprojektion, verbesserte Lack-, Chrom- und Glasreflexionen sowie drei Grafikprofile. Quality bietet dynamische Fahrzeugschatten und Kantenglättung. Das überarbeitete Avant-Modell hat geglättete Karosserieflächen, überarbeitete Felgen, modellierte Leuchten und getrennt animierte Blinker.

Bahnhof, Markt und Park bilden die Kernroute der Zeitfahrt. Der Stadtkern hat einen neuen Bahnhofseingang, Ladenbeschriftungen, eine Bushaltestelle, abwechslungsreichere Bäume, Gullys und asphaltierte Ausbesserungen. Die Bahnhofsrunde ergänzt freie Fahrt um gerichtete Tore, Minikartenführung, eine Stoppuhr und lokal gespeicherte Bestzeiten.

Die 60-Hz-Fahrphysik liest die Straßenhöhe an vier Radpositionen. Bordsteine, Mischbeläge, die getrennten Lenkwinkel der Vorderräder und blockierende Hinterräder bei Handbremse sind in Tests erfasst. Der Browser-Smoke-Test prüft den statischen Build einschließlich Kamera, Licht, Zeitfahrt, Pause, Neustart und Mehrfingertouch.

## Nächste Ausbauschritte

- Auf einem Galaxy S24+ über längere Fahrten Frametimes und Thermik messen und Grafikstufen damit einstellen.
- Ein detailliertes Interieur für eine Cockpitperspektive erstellen und weitere Aktivitäten für Parken und Erkundung erproben.
- Weitere städtebauliche Varianten, Geländeprofile und Fernsicht ergänzen.
- Eine Pipeline für glTF und lizenzierte PBR-Texturen mit dem vorhandenen Renderer vergleichen. Eine Starrkörper-Engine anhand geneigter Straßen und beweglicher Hindernisse bewerten.
