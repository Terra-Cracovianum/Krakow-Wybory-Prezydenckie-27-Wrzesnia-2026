# Wybory prezydenta Krakowa · 27 września 2026

Statyczna strona na wieczór wyborczy: mapa Krakowa, wszystkie lokale i obwody oraz lista kandydatów. `data/results.json` jest pusty i czeka na oficjalne wyniki.

## Co jest na mapie

- 454 obwodowe komisje wyborcze, numery 1–454, z listy PKW dla gminy Kraków: 412 stałych i 42 odrębne. Numer 417 to Szpital na Siemiradzkiego. Numer 444 to jeden obwód, nie suma.
- 250 lokali (kilka obwodów bywa w jednym budynku)
- 412 obwodów stałych (poligony) z warstwy MSIP „Aktualny podział na obwody wyborcze”

Lista komisji: [PKW, komisje obwodowe, gmina 4485](https://wybory.gov.pl/wojtburmistrz_2024_2029/pl/4485/organy_wyborcze/komisje_obwodowe). Położenie budynków: [MSIP Kraków, K05_Wybory_Dzielnice](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K05_Wybory_Dzielnice/MapServer). Cztery adresy z listy PKW nie miały punktu w MSIP (Lubelska 29, Wadowicka 8W, Henryka Siemiradzkiego 1, Forteczna 22) — ich współrzędne pochodzą z OpenStreetMap. Kandydaci: obwieszczenie Miejskiej Komisji Wyborczej w Krakowie z 14 września 2026 r.

## Jak wgrać wyniki

Jedyny plik do zmiany to [`data/results.json`](data/results.json). Wpisz oficjalne liczby. Pole `"sample": true` zostawia baner, że dane są przykładowe — przy prawdziwych wynikach go nie ustawiaj.

- `status`: `awaiting`, dopóki nie ma liczb; po pierwszych obwodach np. `partial`; po komplecie `final`
- `updatedAt`: czas aktualizacji, np. `"2026-09-27T22:40:00+02:00"`
- `round`: `1` albo `2`
- `precinctsReporting` i `precinctsTotal` (454)
- `ballots`, `validVotes`, `invalidVotes`, `turnout` (frekwencja jako liczba procent, np. `54.2`)
- `candidates`: głosy w całym mieście, klucze jak w [`data/candidates.json`](data/candidates.json)
- `precincts`: jeden wpis na numer obwodu. Uzupełniony obwód ma `"reported": true` i liczby w `votes`. Mapa koloruje go barwą prowadzącego. Dopóki `reported` jest `false`, obwód zostaje szary

Nie dopisujemy wyników z sondaży ani ze zrzutów nieoficjalnych. Kolory przy nazwiskach służą tylko do czytania mapy.

## GitHub Pages

Po zmergowaniu do `main`: Settings → Pages → Deploy from a branch → `main` → `/ (root)`. Strona nie wymaga budowania.
