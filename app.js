const imageInput = document.querySelector('#imageInput');
const dropZone = document.querySelector('#dropZone');
const previewGrid = document.querySelector('#previewGrid');
const previewImage = document.querySelector('#previewImage');
const originalResolution = document.querySelector('#originalResolution');
const finalResolution = document.querySelector('#finalResolution');
const ratioInfo = document.querySelector('#ratioInfo');
const ratioWarning = document.querySelector('#ratioWarning');
const memoryWarning = document.querySelector('#memoryWarning');
const processButton = document.querySelector('#processButton');
const progressBar = document.querySelector('#progressBar');
const statusText = document.querySelector('#statusText');
const outputCanvas = document.querySelector('#outputCanvas');
const downloadLink = document.querySelector('#downloadLink');
const formatSelect = document.querySelector('#formatSelect');
const qualityInput = document.querySelector('#qualityInput');
const qualityOutput = document.querySelector('#qualityOutput');
const qualityField = document.querySelector('#qualityField');

const TARGET_RATIO = 2;
const RATIO_TOLERANCE = 0.03;
const TILE_SIZE = 768;
const TILE_OVERLAP = 24;
const MEMORY_WARNING_PIXELS = 48_000_000;
const MEMORY_DANGER_PIXELS = 96_000_000;

let loadedImage = null;
let loadedFileName = 'imatge-360';
let currentObjectUrl = null;
let lastDownloadUrl = null;
let picaInstance = null;

function formatNumber(value) {
  return new Intl.NumberFormat('ca-ES').format(value);
}

function formatResolution(width, height) {
  return `${formatNumber(width)} × ${formatNumber(height)} px`;
}

function getSelectedScale() {
  return Number(document.querySelector('input[name="scale"]:checked').value);
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

  const scale = getSelectedScale();
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

  if (scale === 4 || finalPixels > MEMORY_WARNING_PIXELS) {
    memoryWarning.hidden = false;
    const level = finalPixels > MEMORY_DANGER_PIXELS ? 'Molt important' : 'Avís';
    memoryWarning.textContent = `${level}: el resultat tindrà ${formatResolution(finalWidth, finalHeight)} (${formatNumber(finalPixels)} píxels) i pot requerir aproximadament ${estimatedRgbaMiB} MiB només per al llenç final. En Chromebook, prova primer 2x o una imatge més petita si Chrome es torna lent.`;
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

async function resizeTile(sourceCanvas, destCanvas) {
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

async function upscaleImage() {
  if (!loadedImage) return;

  processButton.disabled = true;
  downloadLink.hidden = true;
  revokeDownloadUrl();

  const scale = getSelectedScale();
  const sourceWidth = loadedImage.naturalWidth;
  const sourceHeight = loadedImage.naturalHeight;
  const outputWidth = sourceWidth * scale;
  const outputHeight = sourceHeight * scale;
  const outputCtx = outputCanvas.getContext('2d', { alpha: true, willReadFrequently: false });

  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  outputCtx.clearRect(0, 0, outputWidth, outputHeight);

  const columns = Math.ceil(sourceWidth / TILE_SIZE);
  const rows = Math.ceil(sourceHeight / TILE_SIZE);
  const totalTiles = columns * rows;
  let completedTiles = 0;

  setStatus(`Preparant ${totalTiles} rajoles per a ampliació ${scale}x…`, 2);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    for (let y = 0; y < sourceHeight; y += TILE_SIZE) {
      for (let x = 0; x < sourceWidth; x += TILE_SIZE) {
        const innerWidth = Math.min(TILE_SIZE, sourceWidth - x);
        const innerHeight = Math.min(TILE_SIZE, sourceHeight - y);
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

        await resizeTile(sourceTile, resizedTile);

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
    setStatus('El procés s’ha aturat. Pot ser per falta de memòria; prova 2x o una imatge més petita.', 0);
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
      downloadLink.download = `${loadedFileName}-${scale}x.${extension}`;
      downloadLink.hidden = false;
      resolve();
    }, mimeType, quality);
  });
}

imageInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
processButton.addEventListener('click', upscaleImage);

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
