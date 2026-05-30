# Upscaler 360

Aplicació web estàtica, en català, per ampliar imatges 360 equirectangulars directament al navegador. Està pensada per publicar-se tal qual a GitHub Pages i per funcionar bé a Chrome en Chromebook, prioritzant una ampliació **2x estable**.

## Característiques

- Carrega imatges **JPG** o **PNG** des de l’ordinador.
- Comprova si la imatge és aproximadament equirectangular **2:1** i mostra un avís si no ho és.
- Permet triar el motor **Ràpid i estable (pica)**, **IA experimental 2x** o **Objectiu Oculus/Quest automàtic**; pica continua sent el motor per defecte.
- En mode pica, permet ampliació **2x** o **4x experimental**; el mode IA manual comença només amb **2x**.
- El mode **Objectiu Oculus/Quest automàtic** calcula 1 o 2 iteracions IA 2x amb límits estrictes: màxim `8192×4096`, màxim 2 iteracions i màxim 4x total respecte de l’original.
- Inclou una comprovació **Comprova IA 2x** que carrega TensorFlow.js, UpscalerJS i el model abans de processar una imatge grossa.
- Processa per **tiles/rajoles** amb solapament per reduir pics de memòria. En imatges 2:1, el solapament esquerra/dreta és circular per reduir costures visibles a la unió 360.
- Mostra estat del procés i barra de progrés.
- Manté exactament la proporció original en reconstruir la imatge final.
- Exporta en **JPG** o **PNG**.
- Mostra resolució original i resolució final.
- Avisa quan la imatge final pot ser massa gran per a dispositius amb poca memòria.
- No utilitza backend, servidor propi ni API externa: el processament es fa localment al navegador.

## Tecnologia

La interfície és HTML, CSS i JavaScript sense pas de compilació. Les CDN estan fixades a versions concretes, no `@latest`, per evitar canvis inesperats.

- **Ràpid i estable (pica)**: fa servir la llibreria oberta [pica](https://github.com/nodeca/pica) `9.0.1` carregada des d’una CDN per redimensionar amb qualitat. Pica no és un model d’IA: reescala els píxels amb un algorisme de redimensionament d’alta qualitat. Si pica no està disponible, l’aplicació fa servir el redimensionament natiu de Canvas com a alternativa.
- **IA experimental 2x**: carrega opcionalment [TensorFlow.js](https://www.tensorflow.org/js) `4.22.0` i [UpscalerJS](https://upscalerjs.com/) `1.0.0-beta.19` amb el model obert `@upscalerjs/default-model` `1.0.0-beta.17`. Aquest mode intenta reconstruir detall amb una xarxa neuronal 2x, però pot afegir artefactes, ser molt més lent i consumir molta més memòria.
- **Objectiu Oculus/Quest automàtic**: reutilitza la mateixa IA experimental 2x i la comprovació prèvia **Comprova IA 2x**. Calcula automàticament quantes ampliacions 2x cal aplicar per arribar al mínim recomanat `4096×2048` o, si la imatge ja hi arriba, a l’objectiu preferent `8192×4096`, sempre sense superar `8192×4096`, 2 iteracions IA ni 4x totals.

> Nota: pica continua sent el motor per defecte perquè és més estable, lleuger i adequat per a Chrome en Chromebook. El mode IA és només 2x per iteració en aquesta fase. Més iteracions no sempre vol dir més qualitat; a partir de 4x la imatge pot semblar artificial. Si TensorFlow.js, UpscalerJS o el model no es poden carregar des de la CDN, l’app mostra un missatge clar i permet tornar a pica sense recarregar la pàgina.

## Ús local

Només cal obrir `index.html` en un navegador modern. Per evitar restriccions ocasionals de fitxers locals, també pots servir la carpeta amb un servidor estàtic simple:

```bash
python3 -m http.server 8080
```

Després obre:

```text
http://localhost:8080
```

## Proves manuals mínimes

Abans de publicar una nova versió, serveix la carpeta amb `python3 -m http.server 8080`, obre `http://localhost:8080` en Chrome i comprova aquests casos:

| Cas | Motor i escala | Resultat esperat |
| --- | --- | --- |
| JPG `1024×512` | pica `2x` | Exportació correcta a `2048×1024`, sense avís de proporció. |
| JPG `1024×512` | IA experimental `2x` | Prem primer **Comprova IA 2x**; si la diagnosi és correcta, exportació a `2048×1024`. Si falla, missatge clar i retorn a pica sense recarregar. |
| JPG `2048×1024` | pica `2x` | Exportació correcta a `4096×2048`; revisa especialment la costura esquerra/dreta en un visor 360. |
| JPG `2048×1024` | IA experimental `2x` | Diagnosi IA prèvia correcta i exportació a `4096×2048`, assumint que el navegador té memòria suficient. |
| JPG `1024×512` | Objectiu Oculus/Quest automàtic | Diagnosi IA prèvia correcta i exportació a `4096×2048` amb 2 iteracions IA. |
| JPG `512×256` | Objectiu Oculus/Quest automàtic | Exportació a `2048×1024` amb avís que no arriba al mínim recomanat per Oculus/Quest. |
| Qualsevol imatge de prova | Exportació JPG i PNG | El botó de descàrrega genera fitxer `.jpg` amb qualitat configurada i fitxer `.png` quan es canvia el format. |
| Imatge no `2:1` | Qualsevol motor | L’app mostra l’avís de proporció i permet continuar sota responsabilitat de l’usuari. |

Per al mode IA, la comprovació ha de validar en un navegador real que es carreguen les CDN fixades de TensorFlow.js, UpscalerJS i `@upscalerjs/default-model`, i que el model pot ampliar una rajola mínima abans d’una imatge grossa.

## Publicació a GitHub Pages

1. Puja aquests fitxers a un repositori de GitHub.
2. Ves a **Settings → Pages**.
3. A **Build and deployment**, tria **Deploy from a branch**.
4. Selecciona la branca principal i la carpeta `/ (root)`.
5. Desa els canvis i espera que GitHub publiqui la pàgina.

No cal `npm install`, build, servidor ni secrets. Les llibreries de navegador es carreguen des de CDN públiques quan cal; no s’utilitza cap API externa, backend, servidor propi ni clau privada.

## Recomanacions per a imatges 360 Oculus/Quest

- Mantén una proporció exacta o molt propera a **2:1**. Exemples habituals: `4096×2048`, `5760×2880`, `8192×4096`.
- Per a Quest, `4096×2048` és el mínim recomanat d’aquest projecte i `8192×4096` és l’objectiu ideal pràctic, però depèn de l’app/visor que farà la reproducció.
- El mode **Objectiu Oculus/Quest automàtic** manté la proporció 2:1 original i no supera mai `8192×4096`, 2 iteracions IA ni 4x totals. Si no pot arribar a `4096×2048`, mostra l’avís: “La imatge original és massa petita per garantir qualitat suficient en Oculus/Quest. Es pot ampliar, però no arribarà al mínim recomanat.”
- Si una sortida `8192×4096` exigiria més de 2 iteracions IA o més de 4x totals, l’app no ho força automàticament i recomana partir d’una imatge original més gran.
- Si el fitxer original ja és gran, prova primer **2x amb pica**. El mode **4x** pot crear llenços molt grans i pot fallar en Chromebook.
- Fes servir **IA experimental 2x** només amb imatges petites o mitjanes al principi: pot trigar força i carregar molt la memòria/GPU, especialment en Chromebook.

| Original | Objectiu automàtic | Resultat |
| --- | --- | --- |
| `1024×512` | `4096×2048` amb 2 iteracions IA | Acceptable mínim. |
| `2048×1024` | `4096×2048` amb 1 iteració IA | Acceptable. |
| `4096×2048` | `8192×4096` amb 1 iteració IA | Ideal si el navegador aguanta. |
| `512×256` | `2048×1024` amb 2 iteracions IA | Insuficient per Oculus. |

- Exporta en **JPG** si vols fitxers més lleugers per compartir o visualitzar. Exporta en **PNG** només si necessites evitar compressió amb pèrdua; els fitxers seran molt més grans.
- Evita ampliar imatges molt borroses o amb compressió JPG forta: l’ampliació també farà més visibles els defectes.
- Revisa la línia d’unió esquerra/dreta de la panoràmica en el visor 360 final, especialment si la imatge original ja tenia costures visibles.

## Limitacions

- El navegador encara ha de crear un **llenç final complet** per exportar la imatge. El processament per rajoles redueix memòria intermèdia, però no elimina el cost del resultat final.
- Alguns navegadors o GPUs limiten la mida màxima de Canvas. Si l’exportació falla, baixa a 2x o redueix la resolució original.
- El mode 4x està marcat com a experimental perquè multiplica per 16 el nombre de píxels respecte de l’original.
- El mode IA manual només està disponible en **2x**. El mode automàtic pot encadenar com a màxim dues iteracions IA 2x. Tots dos mantenen el processament per rajoles, però cada rajola passa pel model d’UpscalerJS i pot requerir molta més memòria que pica.
- Sense connexió a internet, pica no es carregarà des de la CDN i l’app farà servir Canvas natiu. El mode IA tampoc no podrà carregar TensorFlow.js/UpscalerJS/model si no estan en memòria cau del navegador.

## Estructura del projecte

```text
index.html   # Estructura de la interfície
styles.css   # Estils responsive
app.js       # Lògica de càrrega, validació, tiles, progrés i exportació
README.md    # Documentació d’ús i publicació
AGENTS.md    # Instruccions per a futures modificacions
```
