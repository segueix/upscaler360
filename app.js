const imageInput = document.querySelector('#imageInput');
const dropZone = document.querySelector('#dropZone');
const previewGrid = document.querySelector('#previewGrid');
const previewImage = document.querySelector('#previewImage');
const originalResolution = document.querySelector('#originalResolution');
const finalResolution = document.querySelector('#finalResolution');
const ratioInfo = document.querySelector('#ratioInfo');
const ratioWarning = document.querySelector('#ratioWarning');
const memoryWarning = document.querySelector('#memoryWarning');
const oculusNotice = document.querySelector('#oculusNotice');
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
const aiDiagnostic = document.querySelector('#aiDiagnostic');
const aiCheckButton = document.querySelector('#aiCheckButton');
const aiStatusText = document.querySelector('#aiStatusText');
const fallbackPicaButton = document.querySelector('#fallbackPicaButton');

const TARGET_RATIO = 2;
const RATIO_TOLERANCE = 0.03;
const TILE_SIZE = 768;
const AI_TILE_SIZE = 384;
const TILE_OVERLAP = 32;
const MEMORY_WARNING_PIXELS = 48_000_000;
const MEMORY_DANGER_PIXELS = 96_000_000;
const MIN_OCULUS_WIDTH = 4096;
const MIN_OCULUS_HEIGHT = 2048;
const IDEAL_OCULUS_WIDTH = 8192;
const IDEAL_OCULUS_HEIGHT = 4096;
const MAX_OUTPUT_WIDTH = 8192;
const MAX_OUTPUT_HEIGHT = 4096;
const MAX_AI_ITERATIONS = 2;
const MAX_TOTAL_SCALE = 4;
const TFJS_VERSION = '4.22.0';
const UPSCALER_VERSION = '1.0.0-beta.19';
const ESRGAN_MODEL_VERSION = '1.0.0-beta.17';
const AI_SCRIPT_SOURCES = [
  {
    globalName: 'tf',
    label: 'TensorFlow.js',
    src: `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@${TFJS_VERSION}/dist/tf.min.js`,
  },
  {
    globalName: 'ESRGANMedium',
    label: '@upscalerjs/esrgan-medium (2x)',
    src: `https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-medium@${ESRGAN_MODEL_VERSION}/dist/umd/2x.min.js`,
  },
  {
    globalName: 'Upscaler',
    label: 'UpscalerJS',
    src: `https://cdn.jsdelivr.net/npm/upscaler@${UPSCALER_VERSION}/dist/browser/umd/upscaler.min.js`,
  },
];

let loadedImage = null;
let loadedFileName = 'imatge-360';
let currentObjectUrl = null;
let lastDownloadUrl = null;
let picaInstance = null;
let aiLibraryPromise = null;
let aiUpscaler = null;
let aiDiagnosticState = 'idle';
let aiDiagnosticPromise = null;

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

function getSourceWidth(source) {
  return source.naturalWidth || source.width;
}

function getSourceHeight(source) {
  return source.naturalHeight || source.height;
}

function getOculusPlan(width, height) {
  const alreadyMeetsMinimum = width >= MIN_OCULUS_WIDTH && height >= MIN_OCULUS_HEIGHT;
  const preferredWidth = alreadyMeetsMinimum ? IDEAL_OCULUS_WIDTH : MIN_OCULUS_WIDTH;
  const preferredHeight = alreadyMeetsMinimum ? IDEAL_OCULUS_HEIGHT : MIN_OCULUS_HEIGHT;
  const preferredScale = Math.max(preferredWidth / width, preferredHeight / height);
  const requiredIterations = Math.max(0, Math.ceil(Math.log2(preferredScale)));
  const iterations = Math.min(requiredIterations, MAX_AI_ITERATIONS);
  const totalScale = 2 ** iterations;
  const outputWidth = width * totalScale;
  const outputHeight = height * totalScale;
  const reachesMinimum = outputWidth >= MIN_OCULUS_WIDTH && outputHeight >= MIN_OCULUS_HEIGHT;
  const reachesIdeal = outputWidth === IDEAL_OCULUS_WIDTH && outputHeight === IDEAL_OCULUS_HEIGHT;
  const exceedsOutputLimit = outputWidth > MAX_OUTPUT_WIDTH || outputHeight > MAX_OUTPUT_HEIGHT;
  const exceedsScaleLimit = totalScale > MAX_TOTAL_SCALE;
  const exceedsIterationLimit = requiredIterations > MAX_AI_ITERATIONS;
  const canProcess = iterations > 0 && !exceedsOutputLimit && !exceedsScaleLimit;
  const alreadyMeetsIdeal = width >= IDEAL_OCULUS_WIDTH && height >= IDEAL_OCULUS_HEIGHT;
  const wantsIdeal = alreadyMeetsMinimum && !alreadyMeetsIdeal && preferredWidth <= MAX_OUTPUT_WIDTH && preferredHeight <= MAX_OUTPUT_HEIGHT;

  return {
    iterations: canProcess ? iterations : 0,
    totalScale: canProcess ? totalScale : 1,
    outputWidth: canProcess ? outputWidth : width,
    outputHeight: canProcess ? outputHeight : height,
    reachesMinimum: canProcess ? reachesMinimum : alreadyMeetsMinimum,
    reachesIdeal: canProcess ? reachesIdeal : alreadyMeetsIdeal,
    alreadyMeetsMinimum,
    wantsIdeal,
    recommendationNeeded: wantsIdeal && (!canProcess || requiredIterations > MAX_AI_ITERATIONS || totalScale > MAX_TOTAL_SCALE),
    insufficientMinimum: canProcess && !reachesMinimum,
    blockedReason: exceedsOutputLimit
      ? 'El càlcul superaria el límit màxim de sortida 8192×4096.'
      : exceedsIterationLimit
        ? 'Caldrien més de 2 iteracions IA.'
        : exceedsScaleLimit
          ? 'Caldria una escala total superior a 4x.'
          : '',
  };
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

  const engine = getSelectedEngine();
  const isAi = engine === 'ai';
  const isOculusAuto = engine === 'oculus-auto';
  const oculusPlan = isOculusAuto ? getOculusPlan(loadedImage.naturalWidth, loadedImage.naturalHeight) : null;
  const scale = isAi ? 2 : isOculusAuto ? oculusPlan.totalScale : getSelectedScale();
  const finalWidth = isOculusAuto ? oculusPlan.outputWidth : loadedImage.naturalWidth * scale;
  const finalHeight = isOculusAuto ? oculusPlan.outputHeight : loadedImage.naturalHeight * scale;
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

  if (isOculusAuto && oculusPlan) {
    oculusNotice.hidden = false;
    if (oculusPlan.insufficientMinimum) {
      oculusNotice.textContent = 'La imatge original és massa petita per garantir qualitat suficient en Oculus/Quest. Es pot ampliar, però no arribarà al mínim recomanat.';
    } else if (oculusPlan.recommendationNeeded) {
      oculusNotice.textContent = `${oculusPlan.blockedReason} Per aspirar a 8192×4096 sense superar ${MAX_AI_ITERATIONS} iteracions IA ni ${MAX_TOTAL_SCALE}x totals, és recomanable partir d’una imatge original més gran.`;
    } else if (oculusPlan.reachesIdeal) {
      oculusNotice.textContent = `Objectiu automàtic: ${formatResolution(oculusPlan.outputWidth, oculusPlan.outputHeight)} amb ${oculusPlan.iterations} iteració IA 2x. És l’objectiu ideal si el navegador aguanta.`;
    } else if (oculusPlan.reachesMinimum) {
      oculusNotice.textContent = `Objectiu automàtic: ${formatResolution(oculusPlan.outputWidth, oculusPlan.outputHeight)} amb ${oculusPlan.iterations} iteració/iteracions IA 2x. Arriba al mínim recomanat per Oculus/Quest.`;
    } else {
      oculusNotice.textContent = `${oculusPlan.blockedReason || 'No cal cap ampliació automàtica segura amb aquests límits.'} Es recomana partir d’una imatge original més gran.`;
    }
  } else {
    oculusNotice.hidden = true;
    oculusNotice.textContent = '';
  }

  if (isAi || isOculusAuto || scale === 4 || finalPixels > MEMORY_WARNING_PIXELS) {
    memoryWarning.hidden = false;
    const level = finalPixels > MEMORY_DANGER_PIXELS ? 'Molt important' : 'Avís';
    const aiExtra = isAi || isOculusAuto ? ' A més, el model IA necessita memòria addicional per a TensorFlow.js i per a cada rajola.' : '';
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

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function drawWrappedHorizontalImagePart(ctx, source, sx, sy, sw, sh) {
  let remaining = sw;
  let destinationX = 0;
  const sourceWidth = getSourceWidth(source);
  let sourceX = positiveModulo(sx, sourceWidth);

  while (remaining > 0) {
    const sliceWidth = Math.min(remaining, sourceWidth - sourceX);
    ctx.drawImage(source, sourceX, sy, sliceWidth, sh, destinationX, 0, sliceWidth, sh);
    remaining -= sliceWidth;
    destinationX += sliceWidth;
    sourceX = 0;
  }
}

function canvasFromImagePart(source, sx, sy, sw, sh, wrapHorizontal = false) {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { alpha: true });

  if (wrapHorizontal) {
    drawWrappedHorizontalImagePart(ctx, source, sx, sy, sw, sh);
  } else {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  return canvas;
}

function isEquirectangularImage(image) {
  const ratio = getSourceWidth(image) / getSourceHeight(image);
  return Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO <= RATIO_TOLERANCE;
}

function getTileBounds(x, y, innerWidth, innerHeight, sourceWidth, sourceHeight, wrapHorizontal) {
  const leftOverlap = wrapHorizontal || x > 0 ? TILE_OVERLAP : 0;
  const rightOverlap = wrapHorizontal || x + innerWidth < sourceWidth ? TILE_OVERLAP : 0;
  const sx = wrapHorizontal ? x - leftOverlap : Math.max(0, x - leftOverlap);
  const sy = Math.max(0, y - TILE_OVERLAP);
  const sx2 = wrapHorizontal ? x + innerWidth + rightOverlap : Math.min(sourceWidth, x + innerWidth + rightOverlap);
  const sy2 = Math.min(sourceHeight, y + innerHeight + TILE_OVERLAP);

  return {
    sx,
    sy,
    sw: sx2 - sx,
    sh: sy2 - sy,
  };
}

function resizeWithCanvas(sourceCanvas, destCanvas) {
  const ctx = destCanvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, destCanvas.width, destCanvas.height);
  return Promise.resolve(destCanvas);
}

function loadScript({ src, globalName, label }) {
  if (window[globalName]) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-upscaler-ai="${globalName}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`No s’ha pogut carregar ${label}.`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.upscalerAi = globalName;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No s’ha pogut carregar ${label}.`));
    document.head.appendChild(script);
  });
}

async function loadAiLibraries() {
  if (!aiLibraryPromise) {
    aiLibraryPromise = AI_SCRIPT_SOURCES.reduce(
      (promise, source) => promise.then(() => loadScript(source)),
      Promise.resolve(),
    ).catch((error) => {
      aiLibraryPromise = null;
      throw error;
    });
  }
  return aiLibraryPromise;
}

async function getAiUpscaler() {
  await loadAiLibraries();

  if (!window.tf || !window.Upscaler || !window.ESRGANMedium) {
    throw new Error('El motor IA no està disponible al navegador.');
  }

  aiUpscaler ||= new window.Upscaler({
    model: window.ESRGANMedium,
  });

  return aiUpscaler;
}

function setAiDiagnosticState(state, message) {
  aiDiagnosticState = state;
  aiStatusText.textContent = message;
  aiCheckButton.disabled = state === 'checking';
  fallbackPicaButton.hidden = state !== 'failed';
}

function createAiProbeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#0b66d8';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(1, 0, 1, 1);
  ctx.fillStyle = '#18a058';
  ctx.fillRect(0, 1, 1, 1);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(1, 1, 1, 1);
  return canvas;
}

async function runAiDiagnostic() {
  if (aiDiagnosticPromise) return aiDiagnosticPromise;

  setAiDiagnosticState('checking', 'Comprovant TensorFlow.js, UpscalerJS i el model IA 2x amb una rajola mínima…');
  aiDiagnosticPromise = (async () => {
    const upscaler = await getAiUpscaler();
    const probeCanvas = createAiProbeCanvas();
    const result = await upscaler.upscale(probeCanvas, {
      awaitNextFrame: true,
      output: 'base64',
    });
    const probeImage = await imageFromSource(result);
    if (probeImage.naturalWidth < probeCanvas.width * 2 || probeImage.naturalHeight < probeCanvas.height * 2) {
      throw new Error('El model IA ha respost amb una mida inesperada.');
    }
    setAiDiagnosticState('ready', 'IA 2x comprovada: TensorFlow.js, UpscalerJS i el model han carregat i han processat una prova mínima.');
    return true;
  })().catch((error) => {
    aiDiagnosticPromise = null;
    aiUpscaler = null;
    setAiDiagnosticState('failed', `La IA no està disponible ara: ${error.message} Pots tornar a pica sense recarregar la pàgina.`);
    throw error;
  });

  return aiDiagnosticPromise;
}

function switchToPica(message = 'S’ha tornat al motor pica. Pots continuar sense recarregar la pàgina.') {
  engineSelect.value = 'pica';
  updateEngineOptions();
  setStatus(message, 0);
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
      unsharpAmount: 80,
      unsharpRadius: 0.8,
      unsharpThreshold: 1,
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

function applySharpen(canvas, amount = 0.4) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  const stripHeight = 512;

  for (let startY = 0; startY < h; startY += stripHeight) {
    const readY = Math.max(0, startY - 1);
    const endY = Math.min(h, startY + stripHeight);
    const readEndY = Math.min(h, endY + 1);
    const readH = readEndY - readY;
    const strip = ctx.getImageData(0, readY, w, readH);
    const src = strip.data;
    const sw = w;

    const outH = endY - startY;
    const out = ctx.createImageData(w, outH);
    const dst = out.data;

    for (let ly = 0; ly < outH; ly++) {
      const sy = startY + ly - readY;
      for (let x = 0; x < w; x++) {
        const si = (sy * sw + x) * 4;
        const di = (ly * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = src[si + c] * 5;
          sum -= (sy > 0 ? src[((sy - 1) * sw + x) * 4 + c] : src[si + c]);
          sum -= (sy < readH - 1 ? src[((sy + 1) * sw + x) * 4 + c] : src[si + c]);
          sum -= (x > 0 ? src[(sy * sw + x - 1) * 4 + c] : src[si + c]);
          sum -= (x < w - 1 ? src[(sy * sw + x + 1) * 4 + c] : src[si + c]);
          const sharpened = src[si + c] + (sum - src[si + c]) * amount;
          dst[di + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
        dst[di + 3] = src[si + 3];
      }
    }

    ctx.putImageData(out, 0, startY);
  }
}

function forceGarbageCollection() {
  if (window.tf && window.tf.engine) {
    window.tf.engine().startScope();
    window.tf.engine().endScope();
  }
}

async function processUpscalePass({ source, scale, engine, tileSize, outputCanvasTarget, progressStart, progressEnd, label }) {
  const sourceWidth = getSourceWidth(source);
  const sourceHeight = getSourceHeight(source);
  const outputWidth = sourceWidth * scale;
  const outputHeight = sourceHeight * scale;
  const wrapHorizontal = isEquirectangularImage(source);
  const outputCtx = outputCanvasTarget.getContext('2d', { alpha: true, willReadFrequently: false });

  outputCanvasTarget.width = outputWidth;
  outputCanvasTarget.height = outputHeight;
  outputCtx.clearRect(0, 0, outputWidth, outputHeight);

  const columns = Math.ceil(sourceWidth / tileSize);
  const rows = Math.ceil(sourceHeight / tileSize);
  const totalTiles = columns * rows;
  let completedTiles = 0;

  setStatus(`Preparant ${totalTiles} rajoles per a ${label}…`, progressStart);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  for (let y = 0; y < sourceHeight; y += tileSize) {
    for (let x = 0; x < sourceWidth; x += tileSize) {
      const innerWidth = Math.min(tileSize, sourceWidth - x);
      const innerHeight = Math.min(tileSize, sourceHeight - y);
      const { sx, sy, sw, sh } = getTileBounds(
        x,
        y,
        innerWidth,
        innerHeight,
        sourceWidth,
        sourceHeight,
        wrapHorizontal,
      );

      const sourceTile = canvasFromImagePart(source, sx, sy, sw, sh, wrapHorizontal);
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
      const progress = progressStart + (completedTiles / totalTiles) * (progressEnd - progressStart);
      setStatus(`Processant rajola ${completedTiles} de ${totalTiles} (${label})…`, progress);

      if (engine === 'ai' && completedTiles % 4 === 0) forceGarbageCollection();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

async function runOculusAutoUpscale() {
  const plan = getOculusPlan(loadedImage.naturalWidth, loadedImage.naturalHeight);

  if (plan.iterations < 1) {
    const message = plan.recommendationNeeded
      ? `${plan.blockedReason} Per aspirar a 8192×4096 sense superar ${MAX_AI_ITERATIONS} iteracions IA ni ${MAX_TOTAL_SCALE}x totals, parteix d’una imatge original més gran.`
      : 'Aquesta imatge ja compleix els límits del mode automàtic; no s’ha aplicat cap ampliació IA.';
    throw new Error(message);
  }

  setStatus('Comprovant la IA abans de processar la imatge grossa…', 3);
  await runAiDiagnostic();

  let source = loadedImage;
  let workingCanvas = outputCanvas;

  for (let iteration = 1; iteration <= plan.iterations; iteration += 1) {
    const isLastIteration = iteration === plan.iterations;
    workingCanvas = isLastIteration ? outputCanvas : document.createElement('canvas');
    const progressStart = 5 + ((iteration - 1) / plan.iterations) * 85;
    const progressEnd = 5 + (iteration / plan.iterations) * 85;
    await processUpscalePass({
      source,
      scale: 2,
      engine: 'ai',
      tileSize: AI_TILE_SIZE,
      outputCanvasTarget: workingCanvas,
      progressStart,
      progressEnd,
      label: `iteració IA ${iteration} de ${plan.iterations}`,
    });

    if (source instanceof HTMLCanvasElement && source !== outputCanvas) {
      source.width = 1;
      source.height = 1;
    }
    source = workingCanvas;
  }

  return plan.totalScale;
}

async function upscaleImage() {
  if (!loadedImage) return;

  processButton.disabled = true;
  downloadLink.hidden = true;
  revokeDownloadUrl();

  const engine = getSelectedEngine();

  try {
    let exportScale;

    if (engine === 'oculus-auto') {
      exportScale = await runOculusAutoUpscale();
    } else {
      const scale = engine === 'ai' ? 2 : getSelectedScale();
      const tileSize = engine === 'ai' ? AI_TILE_SIZE : TILE_SIZE;
      const engineLabel = engine === 'ai' ? 'ampliació ESRGAN 2x' : `ampliació ${scale}x amb pica`;

      if (engine === 'ai') {
        setStatus('Comprovant la IA abans de processar la imatge grossa…', 3);
        await runAiDiagnostic();
      }

      await processUpscalePass({
        source: loadedImage,
        scale,
        engine,
        tileSize,
        outputCanvasTarget: outputCanvas,
        progressStart: 5,
        progressEnd: 90,
        label: engineLabel,
      });
      exportScale = scale;
    }

    setStatus(‘Aplicant sharpening final per millorar la nitidesa…’, 92);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    applySharpen(outputCanvas, engine === ‘pica’ ? 0.3 : 0.4);

    setStatus(‘Generant el fitxer d’exportació…’, 96);
    await exportCanvas(exportScale);
    setStatus(‘Procés completat. Ja pots descarregar la imatge ampliada.’, 100);
  } catch (error) {
    console.error(error);
    if (engine === 'ai' || engine === 'oculus-auto') {
      fallbackPicaButton.hidden = false;
      setStatus(error.message || 'No s’ha pogut carregar o executar el model IA. Prem “Torna a pica” o tria “Ràpid i estable (pica)” per continuar sense recarregar.', 0);
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
      const selectedEngine = getSelectedEngine();
      const engineSuffix = selectedEngine === 'ai' ? 'ia-2x' : selectedEngine === 'oculus-auto' ? `oculus-auto-${scale}x` : `${scale}x`;
      downloadLink.download = `${loadedFileName}-${engineSuffix}.${extension}`;
      downloadLink.hidden = false;
      resolve();
    }, mimeType, quality);
  });
}


function updateEngineOptions() {
  const engine = getSelectedEngine();
  const isAi = engine === 'ai';
  const isOculusAuto = engine === 'oculus-auto';
  const usesAi = isAi || isOculusAuto;
  const fourXInput = document.querySelector('input[name="scale"][value="4"]');

  if (usesAi) {
    selectScale(2);
    fourXInput.disabled = true;
    if (isOculusAuto) {
      compatNotice.innerHTML = `El mode <strong>Objectiu Oculus/Quest automàtic</strong> utilitza ESRGAN-medium per calcular 1-2 iteracions IA 2x fins a ${MAX_TOTAL_SCALE}x i ${MAX_OUTPUT_WIDTH}×${MAX_OUTPUT_HEIGHT}. Optimitzat per Chromebook 8 GB. Fes servir “Comprova IA 2x” abans de processar.`;
    } else {
      compatNotice.innerHTML = `El mode <strong>IA ESRGAN 2x</strong> utilitza TensorFlow.js ${TFJS_VERSION}, UpscalerJS ${UPSCALER_VERSION} i ESRGAN-medium ${ESRGAN_MODEL_VERSION}. Genera detalls reals amb xarxa neuronal, no només interpolació. Fes servir “Comprova IA 2x” abans de processar una imatge grossa.`;
    }
  } else {
    fourXInput.disabled = false;
    compatNotice.innerHTML = 'El mode per defecte utilitza la llibreria oberta <strong>pica</strong> per fer redimensionament d’alta qualitat al navegador. Si la CDN no respon, l’app fa servir Canvas natiu com a alternativa.';
  }

  aiWarning.hidden = !usesAi;
  aiDiagnostic.hidden = !usesAi;
  downloadLink.hidden = true;
  revokeDownloadUrl();
  updateImageInfo();
}

imageInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
processButton.addEventListener('click', upscaleImage);
aiCheckButton.addEventListener('click', () => {
  runAiDiagnostic().catch((error) => console.error(error));
});
fallbackPicaButton.addEventListener('click', () => switchToPica());
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

updateEngineOptions();
