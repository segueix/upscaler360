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
const autoPlanDisplay = document.querySelector('#autoPlanDisplay');
const scaleOptions = document.querySelector('#scaleOptions');

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

function getSourceWidth(source) {
  return source.naturalWidth || source.width;
}

function getSourceHeight(source) {
  return source.naturalHeight || source.height;
}

function getAutoPlan(w, h) {
  var steps = [];
  var cw = w;
  var ch = h;

  if (cw >= IDEAL_OCULUS_WIDTH && ch >= IDEAL_OCULUS_HEIGHT) {
    return { steps: steps, outputWidth: cw, outputHeight: ch, tier: 'ideal', needsAi: false };
  }

  if (cw >= MIN_OCULUS_WIDTH && cw * 2 > MAX_OUTPUT_WIDTH) {
    return { steps: steps, outputWidth: cw, outputHeight: ch, tier: 'above-min', needsAi: false };
  }

  if (cw < 1024) {
    steps.push({ engine: 'pica', scale: 2 });
    cw *= 2;
    ch *= 2;
  }

  var aiPasses = 0;
  while (aiPasses < MAX_AI_ITERATIONS && cw * 2 <= MAX_OUTPUT_WIDTH && ch * 2 <= MAX_OUTPUT_HEIGHT && cw < IDEAL_OCULUS_WIDTH) {
    steps.push({ engine: 'ai', scale: 2 });
    cw *= 2;
    ch *= 2;
    aiPasses++;
  }

  var reachesMin = cw >= MIN_OCULUS_WIDTH && ch >= MIN_OCULUS_HEIGHT;
  var reachesIdeal = cw >= IDEAL_OCULUS_WIDTH && ch >= IDEAL_OCULUS_HEIGHT;
  var tier = reachesIdeal ? 'ideal' : reachesMin ? 'minimum' : 'below-min';
  var needsAi = steps.some(function(s) { return s.engine === 'ai'; });

  return { steps: steps, outputWidth: cw, outputHeight: ch, tier: tier, needsAi: needsAi };
}

function describeAutoPlan(plan, originalWidth, originalHeight) {
  if (plan.steps.length === 0) {
    if (plan.tier === 'ideal') {
      return '<strong>Resolució ideal per Oculus.</strong> La imatge ja té ' +
        formatResolution(originalWidth, originalHeight) +
        '. Només s’aplicarà sharpening per millorar la nitidesa.';
    }
    return '<strong>Resolució acceptable per Oculus.</strong> La imatge (' +
      formatResolution(originalWidth, originalHeight) +
      ') ja supera el mínim. S’aplicarà sharpening. ESRGAN 2x excediria el límit de ' +
      formatResolution(MAX_OUTPUT_WIDTH, MAX_OUTPUT_HEIGHT) + '.';
  }

  var stepsDesc = plan.steps.map(function(s) {
    return s.engine === 'ai' ? '<strong>ESRGAN 2x</strong>' : '<strong>Pica 2x</strong>';
  });
  stepsDesc.push('<strong>Sharpening</strong>');

  var pipeline = stepsDesc.join(' → ');
  var tierMsg;
  if (plan.tier === 'ideal') {
    tierMsg = 'Arribarà a resolució ideal per Oculus/Quest.';
  } else if (plan.tier === 'minimum') {
    tierMsg = 'Arribarà al mínim recomanat per Oculus/Quest.';
  } else {
    tierMsg = 'Atenció: la imatge original és massa petita per arribar al mínim recomanat (4096×2048). El resultat serà el millor possible.';
  }

  return '<strong>Pla automàtic:</strong> ' + pipeline +
    ' → ' + formatResolution(plan.outputWidth, plan.outputHeight) +
    '<br>' + tierMsg;
}

function setStatus(message, progress) {
  statusText.textContent = message;
  if (progress !== undefined && progress !== null) {
    progressBar.value = Math.max(0, Math.min(100, progress));
    progressBar.textContent = Math.round(progressBar.value) + '%';
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

  var engine = getSelectedEngine();
  var isAuto = engine === 'auto';
  var isAi = engine === 'ai';
  var w = loadedImage.naturalWidth;
  var h = loadedImage.naturalHeight;
  var ratio = w / h;
  var ratioDelta = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO;

  var finalWidth, finalHeight;
  var autoPlan = null;

  if (isAuto) {
    autoPlan = getAutoPlan(w, h);
    finalWidth = autoPlan.outputWidth;
    finalHeight = autoPlan.outputHeight;
  } else if (isAi) {
    finalWidth = w * 2;
    finalHeight = h * 2;
  } else {
    var scale = getSelectedScale();
    finalWidth = w * scale;
    finalHeight = h * scale;
  }

  var finalPixels = finalWidth * finalHeight;
  var estimatedRgbaMiB = Math.round((finalPixels * 4) / 1024 / 1024);

  originalResolution.textContent = formatResolution(w, h);
  finalResolution.textContent = formatResolution(finalWidth, finalHeight);
  ratioInfo.textContent = ratio.toFixed(3) + ':1';

  if (ratioDelta > RATIO_TOLERANCE) {
    ratioWarning.hidden = false;
    ratioWarning.textContent = 'Avís: aquesta imatge no sembla equirectangular 2:1 (relació detectada ' + ratio.toFixed(3) + ':1). Pots continuar, però el visor 360 pot mostrar deformacions.';
  } else {
    ratioWarning.hidden = true;
    ratioWarning.textContent = '';
  }

  if (isAuto && autoPlan) {
    autoPlanDisplay.hidden = false;
    autoPlanDisplay.innerHTML = describeAutoPlan(autoPlan, w, h);
  } else {
    autoPlanDisplay.hidden = true;
  }

  oculusNotice.hidden = true;
  oculusNotice.textContent = '';

  var usesAi = isAuto ? (autoPlan && autoPlan.needsAi) : isAi;
  if (usesAi || finalPixels > MEMORY_WARNING_PIXELS) {
    memoryWarning.hidden = false;
    var level = finalPixels > MEMORY_DANGER_PIXELS ? 'Molt important' : 'Avís';
    var aiExtra = usesAi ? ' El model IA necessita memòria addicional per a TensorFlow.js.' : '';
    memoryWarning.textContent = level + ': el resultat tindrà ' + formatResolution(finalWidth, finalHeight) + ' (~' + estimatedRgbaMiB + ' MiB).' + aiExtra;
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

  var img = new Image();
  img.decoding = 'async';
  img.onload = function() {
    loadedImage = img;
    previewImage.src = currentObjectUrl;
    previewGrid.hidden = false;
    processButton.disabled = false;
    updateEngineOptions();
    setStatus('Imatge carregada. Revisa el pla i prem “Ampliar imatge”.', 0);
  };
  img.onerror = function() {
    setStatus('No s’ha pogut llegir la imatge. Prova amb un altre JPG o PNG.', 0);
    processButton.disabled = true;
  };
  img.src = currentObjectUrl;
}

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function drawWrappedHorizontalImagePart(ctx, source, sx, sy, sw, sh) {
  var remaining = sw;
  var destinationX = 0;
  var sourceWidth = getSourceWidth(source);
  var sourceX = positiveModulo(sx, sourceWidth);

  while (remaining > 0) {
    var sliceWidth = Math.min(remaining, sourceWidth - sourceX);
    ctx.drawImage(source, sourceX, sy, sliceWidth, sh, destinationX, 0, sliceWidth, sh);
    remaining -= sliceWidth;
    destinationX += sliceWidth;
    sourceX = 0;
  }
}

function canvasFromImagePart(source, sx, sy, sw, sh, wrapHorizontal) {
  var canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  var ctx = canvas.getContext('2d', { alpha: true });

  if (wrapHorizontal) {
    drawWrappedHorizontalImagePart(ctx, source, sx, sy, sw, sh);
  } else {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  return canvas;
}

function isEquirectangularImage(image) {
  var ratio = getSourceWidth(image) / getSourceHeight(image);
  return Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO <= RATIO_TOLERANCE;
}

function getTileBounds(x, y, innerWidth, innerHeight, sourceWidth, sourceHeight, wrapHorizontal) {
  var leftOverlap = wrapHorizontal || x > 0 ? TILE_OVERLAP : 0;
  var rightOverlap = wrapHorizontal || x + innerWidth < sourceWidth ? TILE_OVERLAP : 0;
  var sx = wrapHorizontal ? x - leftOverlap : Math.max(0, x - leftOverlap);
  var sy = Math.max(0, y - TILE_OVERLAP);
  var sx2 = wrapHorizontal ? x + innerWidth + rightOverlap : Math.min(sourceWidth, x + innerWidth + rightOverlap);
  var sy2 = Math.min(sourceHeight, y + innerHeight + TILE_OVERLAP);

  return { sx: sx, sy: sy, sw: sx2 - sx, sh: sy2 - sy };
}

function resizeWithCanvas(sourceCanvas, destCanvas) {
  var ctx = destCanvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, destCanvas.width, destCanvas.height);
  return Promise.resolve(destCanvas);
}

function loadScript(info) {
  var src = info.src;
  var globalName = info.globalName;
  var label = info.label;

  if (window[globalName]) return Promise.resolve();

  return new Promise(function(resolve, reject) {
    var existingScript = document.querySelector('script[data-upscaler-ai="' + globalName + '"]');
    if (existingScript) {
      existingScript.addEventListener('load', function() { resolve(); }, { once: true });
      existingScript.addEventListener('error', function() { reject(new Error('No s’ha pogut carregar ' + label + '.')); }, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.upscalerAi = globalName;
    script.onload = function() { resolve(); };
    script.onerror = function() { reject(new Error('No s’ha pogut carregar ' + label + '.')); };
    document.head.appendChild(script);
  });
}

async function loadAiLibraries() {
  if (!aiLibraryPromise) {
    aiLibraryPromise = AI_SCRIPT_SOURCES.reduce(
      function(promise, source) { return promise.then(function() { return loadScript(source); }); },
      Promise.resolve()
    ).catch(function(error) {
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

  aiUpscaler = aiUpscaler || new window.Upscaler({ model: window.ESRGANMedium });
  return aiUpscaler;
}

function setAiDiagnosticState(state, message) {
  aiDiagnosticState = state;
  aiStatusText.textContent = message;
  aiCheckButton.disabled = state === 'checking';
  fallbackPicaButton.hidden = state !== 'failed';
}

function createAiProbeCanvas() {
  var canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  var ctx = canvas.getContext('2d', { alpha: false });
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

  setAiDiagnosticState('checking', 'Comprovant TensorFlow.js, UpscalerJS i ESRGAN-medium 2x…');
  aiDiagnosticPromise = (async function() {
    var upscaler = await getAiUpscaler();
    var probeCanvas = createAiProbeCanvas();
    var result = await upscaler.upscale(probeCanvas, { awaitNextFrame: true, output: 'base64' });
    var probeImage = await imageFromSource(result);
    if (probeImage.naturalWidth < probeCanvas.width * 2 || probeImage.naturalHeight < probeCanvas.height * 2) {
      throw new Error('El model IA ha respost amb una mida inesperada.');
    }
    setAiDiagnosticState('ready', 'ESRGAN 2x comprovada correctament.');
    return true;
  })().catch(function(error) {
    aiDiagnosticPromise = null;
    aiUpscaler = null;
    setAiDiagnosticState('failed', 'La IA no està disponible: ' + error.message);
    throw error;
  });

  return aiDiagnosticPromise;
}

function switchToPica() {
  engineSelect.value = 'pica';
  updateEngineOptions();
  setStatus('S’ha tornat al motor Pica. Pots continuar sense recarregar.', 0);
}

function imageFromSource(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('No s’ha pogut llegir la rajola generada per la IA.')); };
    img.src = src;
  });
}

async function resizeTileWithPica(sourceCanvas, destCanvas) {
  if (window.pica) {
    picaInstance = picaInstance || window.pica({ features: ['js', 'wasm', 'ww'] });
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
  var upscaler = await getAiUpscaler();
  var upscaledSrc = await upscaler.upscale(sourceCanvas, { awaitNextFrame: true, output: 'base64' });
  var upscaledImage = await imageFromSource(upscaledSrc);
  var ctx = destCanvas.getContext('2d', { alpha: true });
  ctx.drawImage(upscaledImage, 0, 0, destCanvas.width, destCanvas.height);
  return destCanvas;
}

async function resizeTile(sourceCanvas, destCanvas, engine) {
  if (engine === 'ai') {
    return resizeTileWithAi(sourceCanvas, destCanvas);
  }
  return resizeTileWithPica(sourceCanvas, destCanvas);
}

function applySharpen(canvas, amount) {
  var w = canvas.width;
  var h = canvas.height;
  var ctx = canvas.getContext('2d', { alpha: true });
  var stripHeight = 512;

  for (var startY = 0; startY < h; startY += stripHeight) {
    var readY = Math.max(0, startY - 1);
    var endY = Math.min(h, startY + stripHeight);
    var readEndY = Math.min(h, endY + 1);
    var readH = readEndY - readY;
    var strip = ctx.getImageData(0, readY, w, readH);
    var src = strip.data;
    var sw = w;

    var outH = endY - startY;
    var out = ctx.createImageData(w, outH);
    var dst = out.data;

    for (var ly = 0; ly < outH; ly++) {
      var sy = startY + ly - readY;
      for (var x = 0; x < w; x++) {
        var si = (sy * sw + x) * 4;
        var di = (ly * w + x) * 4;
        for (var c = 0; c < 3; c++) {
          var val = src[si + c] * 5;
          val -= (sy > 0 ? src[((sy - 1) * sw + x) * 4 + c] : src[si + c]);
          val -= (sy < readH - 1 ? src[((sy + 1) * sw + x) * 4 + c] : src[si + c]);
          val -= (x > 0 ? src[(sy * sw + x - 1) * 4 + c] : src[si + c]);
          val -= (x < w - 1 ? src[(sy * sw + x + 1) * 4 + c] : src[si + c]);
          var sharpened = src[si + c] + (val - src[si + c]) * amount;
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

async function processUpscalePass(opts) {
  var source = opts.source;
  var scale = opts.scale;
  var engine = opts.engine;
  var tileSize = opts.tileSize;
  var outputCanvasTarget = opts.outputCanvasTarget;
  var progressStart = opts.progressStart;
  var progressEnd = opts.progressEnd;
  var label = opts.label;

  var sourceWidth = getSourceWidth(source);
  var sourceHeight = getSourceHeight(source);
  var outputWidth = sourceWidth * scale;
  var outputHeight = sourceHeight * scale;
  var wrapHorizontal = isEquirectangularImage(source);
  var outputCtx = outputCanvasTarget.getContext('2d', { alpha: true, willReadFrequently: false });

  outputCanvasTarget.width = outputWidth;
  outputCanvasTarget.height = outputHeight;
  outputCtx.clearRect(0, 0, outputWidth, outputHeight);

  var columns = Math.ceil(sourceWidth / tileSize);
  var rows = Math.ceil(sourceHeight / tileSize);
  var totalTiles = columns * rows;
  var completedTiles = 0;

  setStatus('Preparant ' + totalTiles + ' rajoles per a ' + label + '…', progressStart);
  await new Promise(function(resolve) { requestAnimationFrame(resolve); });

  for (var y = 0; y < sourceHeight; y += tileSize) {
    for (var x = 0; x < sourceWidth; x += tileSize) {
      var innerWidth = Math.min(tileSize, sourceWidth - x);
      var innerHeight = Math.min(tileSize, sourceHeight - y);
      var bounds = getTileBounds(x, y, innerWidth, innerHeight, sourceWidth, sourceHeight, wrapHorizontal);

      var sourceTile = canvasFromImagePart(source, bounds.sx, bounds.sy, bounds.sw, bounds.sh, wrapHorizontal);
      var resizedTile = document.createElement('canvas');
      resizedTile.width = bounds.sw * scale;
      resizedTile.height = bounds.sh * scale;

      await resizeTile(sourceTile, resizedTile, engine);

      var cropX = (x - bounds.sx) * scale;
      var cropY = (y - bounds.sy) * scale;
      var cropWidth = innerWidth * scale;
      var cropHeight = innerHeight * scale;
      outputCtx.drawImage(resizedTile, cropX, cropY, cropWidth, cropHeight, x * scale, y * scale, cropWidth, cropHeight);

      sourceTile.width = 1;
      sourceTile.height = 1;
      resizedTile.width = 1;
      resizedTile.height = 1;

      completedTiles += 1;
      var progress = progressStart + (completedTiles / totalTiles) * (progressEnd - progressStart);
      setStatus('Processant rajola ' + completedTiles + ' de ' + totalTiles + ' (' + label + ')…', progress);

      if (engine === 'ai' && completedTiles % 4 === 0) forceGarbageCollection();
      await new Promise(function(resolve) { setTimeout(resolve, 0); });
    }
  }
}

async function runAutoPlanSteps(plan) {
  if (plan.steps.length === 0) {
    outputCanvas.width = loadedImage.naturalWidth;
    outputCanvas.height = loadedImage.naturalHeight;
    outputCanvas.getContext('2d').drawImage(loadedImage, 0, 0);
    return 1;
  }

  if (plan.needsAi) {
    setStatus('Comprovant la IA…', 3);
    await runAiDiagnostic();
  }

  var source = loadedImage;
  var totalScale = 1;
  var totalSteps = plan.steps.length;

  for (var i = 0; i < totalSteps; i++) {
    var step = plan.steps[i];
    var isLast = i === totalSteps - 1;
    var target = isLast ? outputCanvas : document.createElement('canvas');
    var progressStart = 5 + (i / totalSteps) * 85;
    var progressEnd = 5 + ((i + 1) / totalSteps) * 85;
    var tileSize = step.engine === 'ai' ? AI_TILE_SIZE : TILE_SIZE;
    var stepNum = i + 1;
    var label = step.engine === 'ai'
      ? 'ESRGAN 2x (pas ' + stepNum + ' de ' + totalSteps + ')'
      : 'Pica 2x pre-ampliació (pas ' + stepNum + ' de ' + totalSteps + ')';

    await processUpscalePass({
      source: source,
      scale: step.scale,
      engine: step.engine === 'ai' ? 'ai' : 'pica',
      tileSize: tileSize,
      outputCanvasTarget: target,
      progressStart: progressStart,
      progressEnd: progressEnd,
      label: label,
    });

    if (source instanceof HTMLCanvasElement && source !== outputCanvas) {
      source.width = 1;
      source.height = 1;
    }
    source = target;
    totalScale *= step.scale;
  }

  return totalScale;
}

async function upscaleImage() {
  if (!loadedImage) return;

  processButton.disabled = true;
  downloadLink.hidden = true;
  revokeDownloadUrl();

  var engine = getSelectedEngine();

  try {
    var exportScale;
    var usedAi = false;

    if (engine === 'auto') {
      var plan = getAutoPlan(loadedImage.naturalWidth, loadedImage.naturalHeight);
      usedAi = plan.needsAi;
      exportScale = await runAutoPlanSteps(plan);
    } else {
      var scale = engine === 'ai' ? 2 : getSelectedScale();
      var tileSize = engine === 'ai' ? AI_TILE_SIZE : TILE_SIZE;
      var engineLabel = engine === 'ai' ? 'ESRGAN 2x' : 'Pica ' + scale + 'x';
      usedAi = engine === 'ai';

      if (usedAi) {
        setStatus('Comprovant la IA…', 3);
        await runAiDiagnostic();
      }

      await processUpscalePass({
        source: loadedImage,
        scale: scale,
        engine: engine,
        tileSize: tileSize,
        outputCanvasTarget: outputCanvas,
        progressStart: 5,
        progressEnd: 90,
        label: engineLabel,
      });
      exportScale = scale;
    }

    setStatus('Aplicant sharpening final…', 92);
    await new Promise(function(resolve) { requestAnimationFrame(resolve); });
    applySharpen(outputCanvas, usedAi ? 0.4 : 0.3);

    setStatus('Generant el fitxer d’exportació…', 96);
    await exportCanvas(exportScale);
    setStatus('Procés completat. Ja pots descarregar la imatge ampliada.', 100);
  } catch (error) {
    console.error(error);
    if (engine === 'auto' || engine === 'ai') {
      fallbackPicaButton.hidden = false;
      setStatus(error.message || 'Error amb el model IA. Tria Pica manual per continuar.', 0);
    } else {
      setStatus('El procés s’ha aturat. Pot ser per falta de memòria; prova una imatge més petita.', 0);
    }
  } finally {
    processButton.disabled = false;
  }
}

function exportCanvas(scale) {
  return new Promise(function(resolve, reject) {
    var mimeType = formatSelect.value;
    var extension = mimeType === 'image/png' ? 'png' : 'jpg';
    var quality = mimeType === 'image/jpeg' ? Number(qualityInput.value) : undefined;

    outputCanvas.toBlob(function(blob) {
      if (!blob) {
        reject(new Error('No s’ha pogut crear el fitxer de sortida.'));
        return;
      }
      revokeDownloadUrl();
      lastDownloadUrl = URL.createObjectURL(blob);
      downloadLink.href = lastDownloadUrl;
      var selectedEngine = getSelectedEngine();
      var engineSuffix = selectedEngine === 'auto' ? 'auto-' + scale + 'x' : selectedEngine === 'ai' ? 'esrgan-2x' : 'pica-' + scale + 'x';
      downloadLink.download = loadedFileName + '-' + engineSuffix + '.' + extension;
      downloadLink.hidden = false;
      resolve();
    }, mimeType, quality);
  });
}

function updateEngineOptions() {
  var engine = getSelectedEngine();
  var isAuto = engine === 'auto';
  var isAi = engine === 'ai';
  var isPica = engine === 'pica';

  scaleOptions.hidden = !isPica;
  autoPlanDisplay.hidden = true;

  var showAiControls = isAi;
  if (isAuto && loadedImage) {
    var plan = getAutoPlan(loadedImage.naturalWidth, loadedImage.naturalHeight);
    showAiControls = plan.needsAi;
    autoPlanDisplay.hidden = false;
    autoPlanDisplay.innerHTML = describeAutoPlan(plan, loadedImage.naturalWidth, loadedImage.naturalHeight);
  }

  if (isAuto) {
    compatNotice.innerHTML = 'El mode <strong>automàtic</strong> analitza la resolució i decideix la millor estratègia: Pica per pre-ampliació, ESRGAN per generar detalls, i sharpening final. Optimitzat per Chromebook 8 GB i Oculus/Quest.';
  } else if (isAi) {
    compatNotice.innerHTML = '<strong>ESRGAN 2x manual</strong>: una passada del model ESRGAN-medium. Fes servir “Comprova IA 2x” abans de processar.';
  } else {
    compatNotice.innerHTML = '<strong>Pica manual</strong>: redimensionament d’alta qualitat sense IA. Ràpid i estable.';
  }

  aiWarning.hidden = !showAiControls;
  aiDiagnostic.hidden = !showAiControls;
  downloadLink.hidden = true;
  revokeDownloadUrl();
  updateImageInfo();
}

imageInput.addEventListener('change', function(event) { loadFile(event.target.files[0]); });
processButton.addEventListener('click', upscaleImage);
aiCheckButton.addEventListener('click', function() {
  runAiDiagnostic().catch(function(error) { console.error(error); });
});
fallbackPicaButton.addEventListener('click', switchToPica);
engineSelect.addEventListener('change', updateEngineOptions);

document.querySelectorAll('input[name="scale"]').forEach(function(input) {
  input.addEventListener('change', updateImageInfo);
});

formatSelect.addEventListener('change', function() {
  qualityField.hidden = formatSelect.value !== 'image/jpeg';
  downloadLink.hidden = true;
  revokeDownloadUrl();
});

qualityInput.addEventListener('input', function() {
  qualityOutput.textContent = Math.round(Number(qualityInput.value) * 100) + '%';
});

dropZone.addEventListener('dragover', function(event) {
  event.preventDefault();
  dropZone.classList.add('is-dragover');
});

dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('is-dragover'); });

dropZone.addEventListener('drop', function(event) {
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  loadFile(event.dataTransfer.files[0]);
});

updateEngineOptions();
