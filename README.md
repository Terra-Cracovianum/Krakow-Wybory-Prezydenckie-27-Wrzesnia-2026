# Wybory prezydenta Krakowa · 27 września 2026

Statyczna strona na wieczór wyborczy: mapa Krakowa, wszystkie lokale i obwody oraz lista kandydatów. W `data/results.json` są teraz dane przykładowe (`"sample": true`), żeby widać było spływające obwody. Przed prawdziwymi wynikami trzeba je zastąpić.

## Co jest na mapie

- 412 obwodów stałych (poligony) z warstwy MSIP „Aktualny podział na obwody wyborcze”
- 252 lokale wyborcze
- 455 punktów komisji w warstwie MSIP, o numerach 1–456. Brakuje numeru 417 (w postanowieniu komisarza z 17 sierpnia 2026 r. to Szpital na Siemiradzkiego). Ogłoszenia o tych wyborach podają 454 komisje: 412 stałych i 42 odrębne. Numer 444 to jeden obwód, nie suma.

Źródło geometrii: [MSIP Kraków, K05_Wybory_Dzielnice](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K05_Wybory_Dzielnice/MapServer). Kandydaci: obwieszczenie Miejskiej Komisji Wyborczej w Krakowie z 14 września 2026 r.

## Jak wgrać wyniki

Jedyny plik do zmiany to [`data/results.json`](data/results.json). Przy oficjalnych liczbach ustaw `"sample": false` albo usuń to pole. Dopóki jest `true`, strona pokazuje baner, że dane są przykładowe.

- `status`: `awaiting`, dopóki nie ma liczb; po pierwszych obwodach np. `partial`; po komplecie `final`
- `updatedAt`: czas aktualizacji, np. `"2026-09-27T22:40:00+02:00"`
- `round`: `1` albo `2`
- `precinctsReporting` i `precinctsTotal` (455)
- `ballots`, `validVotes`, `invalidVotes`, `turnout` (frekwencja jako liczba procent, np. `54.2`)
- `candidates`: głosy w całym mieście, klucze jak w [`data/candidates.json`](data/candidates.json)
- `precincts`: jeden wpis na numer obwodu. Uzupełniony obwód ma `"reported": true` i liczby w `votes`. Mapa koloruje go barwą prowadzącego. Dopóki `reported` jest `false`, obwód zostaje szary

Nie dopisujemy wyników z sondaży ani ze zrzutów nieoficjalnych. Kolory przy nazwiskach służą tylko do czytania mapy.

## GitHub Pages

Po zmergowaniu do `main`: Settings → Pages → Deploy from a branch → `main` → `/ (root)`. Strona nie wymaga budowania.
