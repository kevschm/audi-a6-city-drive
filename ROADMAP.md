# Entwicklungsstand und offene Arbeiten

## Version 0.4

Die Spielversion hat einen modularen WebGL-Renderer mit prozeduralen Straßen- und Fassadenoberflächen, Himmelsreflexionen, Blickfeldprüfung für 25 Stadtsektoren und einer lokalen Schattenkarte. Das eigene Avant-Modell zeigt Dachreling, Leuchten, spiegelnde Scheiben, drehende Räder und sichtbaren Lenkeinschlag.

Die Stadt besitzt unterschiedlich breite Straßenzüge, markierte Kreuzungen, Radstreifen, einen Bahnhof, einen Marktplatz, Parks, 30 parkende Fahrzeuge und 14 fahrende KI-Autos. Kreuzungen nutzen eine Vorrangreservierung. Ampelphasen und die Lage der Haltelinien bestimmen, wann die KI weiterfährt.

Die Fahrphysik läuft mit 60 Hz und modelliert Radschlupf, Untersteuern, Lasttransfer, Automatikschaltungen, Handbremse und Rückwärtsfahrt. Die Tests prüfen unter anderem Bremsweg, Zeitschrittstabilität, Hindernisse und eine fünfminütige KI-Fahrt. Der Browser-Smoke-Test startet den Produktionsbuild und deckt Tastatur, Kamera, Pause, Neustart und Mehrfingertouch ab.

## Nächste Ausbauschritte

- Auf einem Galaxy S24+ über längere Fahrten Frametimes und Thermik messen und Grafikstufen damit einstellen.
- Ein detailliertes Interieur für eine echte Cockpitperspektive und zusätzliche Referenzen für Licht, Material und Fahrgefühl ergänzen.
- Kanten und Übergänge in der Stadt mit weiteren Gebäudetypen, niveauabhängigem Fahrwerk, Texturdetails und Geländeprofil ausbauen.
- Three.js und glTF an einem unabhängigen Prototyp für PBR-Assets und das Beleuchtungsbudget messen. Rapier anhand unabhängiger Radkontakte und dynamischer Hindernisse erneut bewerten.
