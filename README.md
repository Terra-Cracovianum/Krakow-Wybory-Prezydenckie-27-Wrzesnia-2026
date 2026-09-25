# Wybory prezydenta Krakowa · 27 września 2026

Statyczna strona na wieczór wyborczy: mapa Krakowa, wszystkie lokale i obwody oraz lista kandydatów. Wyników jeszcze nie ma. Gdy przyjdą oficjalne liczby, wystarczy uzupełnić jeden plik.

## Co jest na mapie

- 412 obwodów stałych (poligony) z warstwy MSIP „Aktualny podział na obwody wyborcze”
- 252 lokale wyborcze
- 455 obwodowych komisji, w tym obwody odrębne (szpitale, DPS-y, areszty), które nie mają własnego poligonu i są przypisane do lokalu

Źródło geometrii: [MSIP Kraków, K05_Wybory_Dzielnice](https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K05_Wybory_Dzielnice/MapServer). Kandydaci: obwieszczenie Miejskiej Komisji Wyborczej w Krakowie z 14 września 2026 r.

## Jak wgrać wyniki

Jedyny plik do zmiany to [`data/results.json`](data/results.json).

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
