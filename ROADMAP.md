# Entwicklungsstand und offene Arbeiten

## Version 0.9

Sieben reproduzierbare Szenarien im Crashlabor mit einstellbarem Starttempo, Streckenkamera, Zeitlupe und Telemetrie. Der Kontaktlöser berücksichtigt relative Geschwindigkeit am Kontaktpunkt, Masse, Gierträgheit und materialabhängige Reibung und Restitution. Fahrzeuge übertragen Impulse im Stadtverkehr und in der Kettenkollision.

Kollisionen können Stoßfänger oder Spiegel ablösen, Scheiben beschädigen, Kühlung und Bremsen schwächen und den Motor zum Stillstand bringen. Lose Fahrzeugelemente, Fässer, Kisten und Kegel bewegen sich mit Schwerkraft und können weitere Objekte treffen. Der Betriebshof hat einen interaktiven Ladebereich. Fußgänger weichen auf ihren Wegen aus und können in eine nicht-grafische Gelenksimulation wechseln. Die gleiche Gelenksimulation bewegt den Dummy.

## Version 0.8

Der Avant hat einen stärker profilierten Kühlergrill, überarbeitete Streuscheiben, separate Scheinwerferwaschdüsen und eine ausgeformte untere Stoßfängerkante. Im Cockpit ergänzen ein Vier-Speichen-Lenkrad, beschriftete Rundinstrumente, Kassettenradio, Klimabedienung und prozedurales Holzdekor die Fahreransicht.

Die bestehende 60-Hz-Kollision ermittelt eine Kontaktstelle am Fahrzeuggestell. Bis zu sechs Dellen können sich lokal überlagern. Jedes Rad und beide Achsen speichern getrennt Schäden. Ein beschädigtes Rad kann eiern, die Spur verziehen und hörbar ungleichmäßig abrollen. Je nach Achsschaden sinken Seitenführung und Bremsgriff. Die Dellen werden im WebGL-Shader für Modell und Schatten berechnet.

## Version 0.7

Cockpit mit bewegtem Lenkrad, Tacho und Drehzahlmesser, nasse Straßen mit Spiegelung und angepasstem Grip sowie animierte Fußgänger an Bahnhof, Markt und Park. Glattere Spiegelgehäuse und Baumkronen, Fahrräder vor dem Bahnhof und stärkere Reflexionsdetails ergänzen die vorhandenen Modelle.

Sprühnebel, Staub, Abgasfahnen und Dampf nach Frontschaden teilen sich ein begrenztes Partikelbudget. Risse in stark beschädigten Leuchten und ein nasses Abrollgeräusch ergänzen das Feedback. Die Spiegelansicht im Quality-Profil nutzt einen kleineren Renderpuffer und wird über mehrere Frames verteilt aktualisiert.

## Version 0.6

Die freie Kamera lässt sich mit Touch-Gesten oder Maus einstellen. Ein Reset im Fahrtmenü repariert das Fahrzeug und setzt es zurück. Aufprall und Streifkontakt verformen betroffene Karosseriebereiche und verschlechtern je nach Schaden Licht, Antrieb oder Spur. Funken, Staub und mehrschichtiger Aufprallton begleiten sichtbare Schäden.

Die V6-Kennlinie, Übersetzung und Schaltphasen reagieren kräftiger. Scheinwerfer und nahe Straßenlaternen beleuchten die Szene mit eigener Reichweite und gerichtetem Licht. Der synthetische Ton unterscheidet Motorlast, Ansaugung, Schaltwechsel, Reifen und Streifgeräusche.

## Version 0.5

Die Spielversion hat Tag- und Abendlicht, Scheinwerferprojektion, verbesserte Lack-, Chrom- und Glasreflexionen sowie drei Grafikprofile. Quality bietet dynamische Fahrzeugschatten und Kantenglättung. Das überarbeitete Avant-Modell hat geglättete Karosserieflächen, überarbeitete Felgen, modellierte Leuchten und getrennt animierte Blinker.

Bahnhof, Markt und Park bilden die Kernroute der Zeitfahrt. Der Stadtkern hat einen neuen Bahnhofseingang, Ladenbeschriftungen, eine Bushaltestelle, abwechslungsreichere Bäume, Gullys und asphaltierte Ausbesserungen. Die Bahnhofsrunde ergänzt freie Fahrt um gerichtete Tore, Minikartenführung, eine Stoppuhr und lokal gespeicherte Bestzeiten.

Die 60-Hz-Fahrphysik liest die Straßenhöhe an vier Radpositionen. Bordsteine, Mischbeläge, die getrennten Lenkwinkel der Vorderräder und blockierende Hinterräder bei Handbremse sind in Tests erfasst. Der Browser-Smoke-Test prüft den statischen Build einschließlich Kamera, Licht, Zeitfahrt, Pause, Neustart und Mehrfingertouch.

## Nächste Ausbauschritte

- Auf einem Galaxy S24+ über längere Fahrten Frametimes und Thermik messen und Grafikstufen damit einstellen.
- Räumliche Fahrzeugkontakte für Rampen und Überschläge, Reifenverlust und Aufzeichnung für Wiederholungen entwickeln.
- Weitere Stadtviertel und Fußgängerquerungen mit Ampelsteuerung ergänzen.
- Eine Pipeline für glTF und lizenzierte PBR-Texturen mit dem vorhandenen Renderer vergleichen. Rapier für geneigte Straßen und vollständige Kollisionskörper evaluieren.
