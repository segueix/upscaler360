# Instruccions per a agents

Aquest projecte és una aplicació web estàtica per GitHub Pages. Mantén-lo simple, portable i en català.

## Principis del projecte

- No afegeixis backend, servidor obligatori, API externa ni procés de build obligatori.
- Mantén l’app publicable directament des de l’arrel del repositori a GitHub Pages.
- Escriu la interfície, missatges d’error, avisos i documentació d’usuari en català.
- Prioritza Chrome en Chromebook i dispositius amb memòria limitada.
- Prioritza que el mode 2x sigui estable abans d’afegir millores al mode 4x.
- Si afegeixes dependències de navegador, han de ser obertes, compatibles amb navegadors moderns i carregables en una pàgina estàtica.

## Codi i arquitectura

- Evita frameworks pesats si no són imprescindibles.
- Mantén separats `index.html`, `styles.css` i `app.js` mentre el projecte continuï sent petit.
- Conserva el processament per tiles/rajoles o una alternativa igualment segura per a memòria.
- No introdueixis càrregues automàtiques de fitxers de l’usuari a serveis remots.
- No afegeixis blocs `try/catch` al voltant d’importacions.

## Documentació i proves

- Actualitza `README.md` quan canviïn l’ús, les limitacions, les dependències o el flux de GitHub Pages.
- Comprova la pàgina amb un servidor estàtic local abans de donar la feina per acabada.
- Si fas canvis visuals perceptibles, intenta capturar una pantalla de verificació.
