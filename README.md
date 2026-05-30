# Upscaler 360

Aplicació web estàtica, en català, per ampliar imatges 360 equirectangulars directament al navegador. Està pensada per publicar-se tal qual a GitHub Pages i per funcionar bé a Chrome en Chromebook, prioritzant una ampliació **2x estable**.

## Característiques

- Carrega imatges **JPG** o **PNG** des de l’ordinador.
- Comprova si la imatge és aproximadament equirectangular **2:1** i mostra un avís si no ho és.
- Permet triar ampliació **2x** o **4x experimental**.
- Processa per **tiles/rajoles** amb solapament per reduir pics de memòria.
- Mostra estat del procés i barra de progrés.
- Manté exactament la proporció original en reconstruir la imatge final.
- Exporta en **JPG** o **PNG**.
- Mostra resolució original i resolució final.
- Avisa quan la imatge final pot ser massa gran per a dispositius amb poca memòria.
- No utilitza backend, servidor propi ni API externa: el processament es fa localment al navegador.

## Tecnologia

La interfície és HTML, CSS i JavaScript sense pas de compilació. Per al redimensionament d’alta qualitat s’utilitza la llibreria oberta [pica](https://github.com/nodeca/pica) carregada des d’una CDN. Si pica no està disponible, l’aplicació fa servir el redimensionament natiu de Canvas com a alternativa.

> Nota: pica és un redimensionador d’alta qualitat, no un model d’IA generativa. S’ha triat per tenir una versió estable, lleugera i compatible amb GitHub Pages/Chromebook. La ruta 4x és experimental perquè la mida del llenç final pot superar fàcilment la memòria disponible.

## Ús local

Només cal obrir `index.html` en un navegador modern. Per evitar restriccions ocasionals de fitxers locals, també pots servir la carpeta amb un servidor estàtic simple:

```bash
python3 -m http.server 8080
```

Després obre:

```text
http://localhost:8080
```

## Publicació a GitHub Pages

1. Puja aquests fitxers a un repositori de GitHub.
2. Ves a **Settings → Pages**.
3. A **Build and deployment**, tria **Deploy from a branch**.
4. Selecciona la branca principal i la carpeta `/ (root)`.
5. Desa els canvis i espera que GitHub publiqui la pàgina.

No cal `npm install`, build, servidor ni secrets.

## Recomanacions per a imatges 360 Oculus/Quest

- Mantén una proporció exacta o molt propera a **2:1**. Exemples habituals: `4096×2048`, `5760×2880`, `8192×4096`.
- Per a Quest, `8192×4096` sol ser un objectiu pràctic d’alta qualitat, però depèn de l’app/visor que farà la reproducció.
- Si el fitxer original ja és gran, prova primer **2x**. El mode **4x** pot crear llenços molt grans i pot fallar en Chromebook.
- Exporta en **JPG** si vols fitxers més lleugers per compartir o visualitzar. Exporta en **PNG** només si necessites evitar compressió amb pèrdua; els fitxers seran molt més grans.
- Evita ampliar imatges molt borroses o amb compressió JPG forta: l’ampliació també farà més visibles els defectes.
- Revisa la línia d’unió esquerra/dreta de la panoràmica en el visor 360 final, especialment si la imatge original ja tenia costures visibles.

## Limitacions

- El navegador encara ha de crear un **llenç final complet** per exportar la imatge. El processament per rajoles redueix memòria intermèdia, però no elimina el cost del resultat final.
- Alguns navegadors o GPUs limiten la mida màxima de Canvas. Si l’exportació falla, baixa a 2x o redueix la resolució original.
- El mode 4x està marcat com a experimental perquè multiplica per 16 el nombre de píxels respecte de l’original.
- Sense connexió a internet, pica no es carregarà des de la CDN i l’app farà servir Canvas natiu.

## Estructura del projecte

```text
index.html   # Estructura de la interfície
styles.css   # Estils responsive
app.js       # Lògica de càrrega, validació, tiles, progrés i exportació
README.md    # Documentació d’ús i publicació
AGENTS.md    # Instruccions per a futures modificacions
```
