const imageInput = document.querySelector('#imageInput');
const dropZone = document.querySelector('#dropZone');
const previewGrid = document.querySelector('#previewGrid');
const previewImage = document.querySelector('#previewImage');
const originalResolution = document.querySelector('#originalResolution');
const finalResolution = document.querySelector('#finalResolution');
const ratioInfo = document.querySelector('#ratioInfo');
const ratioWarning = document.querySelector('#ratioWarning');
const memoryWarning = document.querySelector('#memoryWarning');
const compatNotice = document.querySelector('#compatNotice');
const aiWarning = document.querySelector('#aiWarning');
const processButton = document.querySelector('#processButton');
const progressBar = document.querySelector('#progressBar');
const statusText = document.querySelector('#statusText');
const outputCanvas = document.querySelector('#outputCanvas');
const downloadLink = document.querySelector('#downloadLink');
const formatSelect = document.querySelector('#formatSelect');
const engineSelect = document.querySelector('#engineSelect');
const qualityInput = document.querySelector('#qualityInput');
const qualityOutput = document.querySelector('#qualityOutput');
const qualityField = document.querySelector('#qualityField');

const TARGET_RATIO = 2;
const RATIO_TOLERANCE = 0.03;
const TILE_SIZE = 768;
const AI_TILE_SIZE = 256;
const TILE_OVERLAP = 24;
const MEMORY_WARNING_PIXELS = 48_000_000;
const MEMORY_DANGER_PIXELS = 96_000_000;

let loadedImage = null;
let loadedFileName = 'imatge-360';
let currentObjectUrl = null;
let lastDownloadUrl = null;
let picaInstance = null;
let aiLibraryPromise = null;
let aiUpscaler = null;

function formatNumber(value) {
  return new Intl.NumberFormat('ca-ES').format(value);
}

function formatResolution(width, height) {
  return `${formatNumber(width)} × ${formatNumber(height)} px`;
}

function getSelectedScale() {
  return Number(document.querySelector('input[name="scale"]:checked').value);
}

function getSelectedEngine() {
  return engineSelect.value;
}

function selectScale(scale) {
  const input = document.querySelector(`input[name="scale"][value="${scale}"]`);
  if (input) input.checked = true;
}

function setStatus(message, progress = null) {
  statusText.textContent = message;
  if (progress !== null) {
    progressBar.value = Math.max(0, Math.min(100, progress));
    progressBar.textContent = `${Math.round(progressBar.value)}%`;
  }
}

function revokeDownloadUrl() {
  if (lastDownloadUrl) {
    URL.revokeObjectURL(lastDownloadUrl);
    lastDownloadUrl = null;
  }
}

function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+$/, '') || 'imatge-360';
}

function updateImageInfo() {
  if (!loadedImage) return;

  const isAi = getSelectedEngine() === 'ai';
  const scale = isAi ? 2 : getSelectedScale();
  const finalWidth = loadedImage.naturalWidth * scale;
  const finalHeight = loadedImage.naturalHeight * scale;
  const ratio = loadedImage.naturalWidth / loadedImage.naturalHeight;
  const ratioDelta = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO;
  const finalPixels = finalWidth * finalHeight;
  const estimatedRgbaMiB = Math.round((finalPixels * 4) / 1024 / 1024);

  originalResolution.textContent = formatResolution(loadedImage.naturalWidth, loadedImage.naturalHeight);
  finalResolution.textContent = formatResolution(finalWidth, finalHeight);
  ratioInfo.textContent = `${ratio.toFixed(3)}:1`;

  if (ratioDelta > RATIO_TOLERANCE) {
    ratioWarning.hidden = false;
    ratioWarning.textContent = `Avís: aquesta imatge no sembla equirectangular 2:1 (relació detectada ${ratio.toFixed(3)}:1). Pots continuar, però el visor 360 pot mostrar deformacions.`;
  } else {
    ratioWarning.hidden = true;
    ratioWarning.textContent = '';
  }

  if (isAi || scale === 4 || finalPixels > MEMORY_WARNING_PIXELS) {
    memoryWarning.hidden = false;
    const level = finalPixels > MEMORY_DANGER_PIXELS ? 'Molt important' : 'Avís';
    const aiExtra = isAi ? ' A més, el model IA necessita memòria addicional per a TensorFlow.js i per a cada rajola.' : '';
    memoryWarning.textContent = `${level}: el resultat tindrà ${formatResolution(finalWidth, finalHeight)} (${formatNumber(finalPixels)} píxels) i pot requerir aproximadament ${estimatedRgbaMiB} MiB només per al llenç final.${aiExtra} En Chromebook, prova primer el mode ràpid pica 2x o una imatge més petita si Chrome es torna lent.`;
  } else {
    memoryWarning.hidden = true;
    memoryWarning.textContent = '';
  }

  downloadLink.hidden = true;
  revokeDownloadUrl();
}

async function loadFile(file) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) {
    setStatus('Tria un fitxer JPG o PNG vàlid.', 0);
    return;
  }

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  loadedFileName = baseName(file.name);

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    loadedImage = img;
    previewImage.src = currentObjectUrl;
    previewGrid.hidden = false;
    processButton.disabled = false;
    updateImageInfo();
    setStatus('Imatge carregada. Revisa els avisos i prem “Ampliar imatge”.', 0);
  };
  img.onerror = () => {
    setStatus('No s’ha pogut llegir la imatge. Prova amb un altre JPG o PNG.', 0);
    processButton.disabled = true;
  };
  img.src = currentObjectUrl;
}

function canvasFromImagePart(image, sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function resizeWithCanvas(sourceCanvas, destCanvas) {
  const ctx = destCanvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, destCanvas.width, destCanvas.height);
  return Promise.resolve(destCanvas);
}

function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-upscaler-ai="${globalName}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`No s’ha pogut carregar ${globalName}.`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.upscalerAi = globalName;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No s’ha pogut carregar ${globalName}.`));
    document.head.appendChild(script);
  });
}

async function loadAiLibraries() {
  if (!aiLibraryPromise) {
    aiLibraryPromise = loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js', 'tf')
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/dist/umd/index.min.js', 'DefaultUpscalerJSModel'))
      .then(() => loadScript('https://cdn.jsdelivr.net/npm/upscaler@latest/dist/browser/umd/upscaler.min.js', 'Upscaler'))
      .catch((error) => {
        aiLibraryPromise = null;
        throw error;
      });
  }
  return aiLibraryPromise;
}

async function getAiUpscaler() {
  await loadAiLibraries();

  if (!window.tf || !window.Upscaler || !window.DefaultUpscalerJSModel) {
    throw new Error('El motor IA no està disponible al navegador.');
  }

  aiUpscaler ||= new window.Upscaler({
    model: window.DefaultUpscalerJSModel,
  });

  return aiUpscaler;
}

function imageFromSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No s’ha pogut llegir la rajola generada per la IA.'));
    img.src = src;
  });
}

async function resizeTileWithPica(sourceCanvas, destCanvas) {
  if (window.pica) {
    picaInstance ||= window.pica({ features: ['js', 'wasm', 'ww'] });
    return picaInstance.resize(sourceCanvas, destCanvas, {
      quality: 3,
      alpha: true,
      unsharpAmount: 45,
      unsharpRadius: 0.6,
      unsharpThreshold: 2,
    });
  }
  return resizeWithCanvas(sourceCanvas, destCanvas);
}

async function resizeTileWithAi(sourceCanvas, destCanvas) {
  const upscaler = await getAiUpscaler();
  const upscaledSrc = await upscaler.upscale(sourceCanvas, {
    awaitNextFrame: true,
    output: 'base64',
  });
  const upscaledImage = await imageFromSource(upscaledSrc);
  const ctx = destCanvas.getContext('2d', { alpha: true });
  ctx.drawImage(upscaledImage, 0, 0, destCanvas.width, destCanvas.height);
  return destCanvas;
}

async function resizeTile(sourceCanvas, destCanvas, engine) {
  if (engine === 'ai') {
    return resizeTileWithAi(sourceCanvas, destCanvas);
  }
  return resizeTileWithPica(sourceCanvas, destCanvas);
}

async function upscaleImage() {
  if (!loadedImage) return;

  processButton.disabled = true;
  downloadLink.hidden = true;
  revokeDownloadUrl();

  const engine = getSelectedEngine();
  const scale = engine === 'ai' ? 2 : getSelectedScale();
  const tileSize = engine === 'ai' ? AI_TILE_SIZE : TILE_SIZE;
  const sourceWidth = loadedImage.naturalWidth;
  const sourceHeight = loadedImage.naturalHeight;
  const outputWidth = sourceWidth * scale;
  const outputHeight = sourceHeight * scale;
  const outputCtx = outputCanvas.getContext('2d', { alpha: true, willReadFrequently: false });

  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  outputCtx.clearRect(0, 0, outputWidth, outputHeight);

  const columns = Math.ceil(sourceWidth / tileSize);
  const rows = Math.ceil(sourceHeight / tileSize);
  const totalTiles = columns * rows;
  let completedTiles = 0;

  const engineLabel = engine === 'ai' ? 'IA experimental 2x' : `${scale}x amb pica`;
  setStatus(`Preparant ${totalTiles} rajoles per a ampliació ${engineLabel}…`, 2);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    if (engine === 'ai') {
      setStatus('Carregant TensorFlow.js, UpscalerJS i el model IA 2x…', 3);
      await getAiUpscaler();
    }

    for (let y = 0; y < sourceHeight; y += tileSize) {
      for (let x = 0; x < sourceWidth; x += tileSize) {
        const innerWidth = Math.min(tileSize, sourceWidth - x);
        const innerHeight = Math.min(tileSize, sourceHeight - y);
        const sx = Math.max(0, x - TILE_OVERLAP);
        const sy = Math.max(0, y - TILE_OVERLAP);
        const sx2 = Math.min(sourceWidth, x + innerWidth + TILE_OVERLAP);
        const sy2 = Math.min(sourceHeight, y + innerHeight + TILE_OVERLAP);
        const sw = sx2 - sx;
        const sh = sy2 - sy;

        const sourceTile = canvasFromImagePart(loadedImage, sx, sy, sw, sh);
        const resizedTile = document.createElement('canvas');
        resizedTile.width = sw * scale;
        resizedTile.height = sh * scale;

        await resizeTile(sourceTile, resizedTile, engine);

        const cropX = (x - sx) * scale;
        const cropY = (y - sy) * scale;
        const cropWidth = innerWidth * scale;
        const cropHeight = innerHeight * scale;
        outputCtx.drawImage(
          resizedTile,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          x * scale,
          y * scale,
          cropWidth,
          cropHeight,
        );

        sourceTile.width = 1;
        sourceTile.height = 1;
        resizedTile.width = 1;
        resizedTile.height = 1;

        completedTiles += 1;
        const progress = 5 + (completedTiles / totalTiles) * 85;
        setStatus(`Processant rajola ${completedTiles} de ${totalTiles}…`, progress);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    setStatus('Generant el fitxer d’exportació…', 94);
    await exportCanvas(scale);
    setStatus('Procés completat. Ja pots descarregar la imatge ampliada.', 100);
  } catch (error) {
    console.error(error);
    if (engine === 'ai') {
      setStatus('No s’ha pogut carregar o executar el model IA. Pots canviar el motor a “Ràpid i estable (pica)” i continuar sense IA.', 0);
    } else {
      setStatus('El procés s’ha aturat. Pot ser per falta de memòria; prova 2x o una imatge més petita.', 0);
    }
  } finally {
    processButton.disabled = false;
  }
}

function exportCanvas(scale) {
  return new Promise((resolve, reject) => {
    const mimeType = formatSelect.value;
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const quality = mimeType === 'image/jpeg' ? Number(qualityInput.value) : undefined;

    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No s’ha pogut crear el fitxer de sortida.'));
        return;
      }
      revokeDownloadUrl();
      lastDownloadUrl = URL.createObjectURL(blob);
      downloadLink.href = lastDownloadUrl;
      const engineSuffix = getSelectedEngine() === 'ai' ? 'ia-2x' : `${scale}x`;
      downloadLink.download = `${loadedFileName}-${engineSuffix}.${extension}`;
      downloadLink.hidden = false;
      resolve();
    }, mimeType, quality);
  });
}


function updateEngineOptions() {
  const isAi = getSelectedEngine() === 'ai';
  const fourXInput = document.querySelector('input[name="scale"][value="4"]');

  if (isAi) {
    selectScale(2);
    fourXInput.disabled = true;
    compatNotice.innerHTML = 'El mode <strong>IA experimental 2x</strong> utilitza TensorFlow.js, UpscalerJS i un model obert 2x carregats al navegador. Si el model no es pot carregar, canvia a “Ràpid i estable (pica)” per continuar.';
  } else {
    fourXInput.disabled = false;
    compatNotice.innerHTML = 'El mode per defecte utilitza la llibreria oberta <strong>pica</strong> per fer redimensionament d’alta qualitat al navegador. Si la CDN no respon, l’app fa servir Canvas natiu com a alternativa.';
  }

  aiWarning.hidden = !isAi;
  downloadLink.hidden = true;
  revokeDownloadUrl();
  updateImageInfo();
}

imageInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
processButton.addEventListener('click', upscaleImage);
engineSelect.addEventListener('change', updateEngineOptions);

document.querySelectorAll('input[name="scale"]').forEach((input) => {
  input.addEventListener('change', updateImageInfo);
});

formatSelect.addEventListener('change', () => {
  qualityField.hidden = formatSelect.value !== 'image/jpeg';
  downloadLink.hidden = true;
  revokeDownloadUrl();
});

qualityInput.addEventListener('input', () => {
  qualityOutput.textContent = `${Math.round(Number(qualityInput.value) * 100)}%`;
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('is-dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  loadFile(event.dataTransfer.files[0]);
});
