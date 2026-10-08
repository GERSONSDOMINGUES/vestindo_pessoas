/* =========================================================
   Provador Virtual — versão com upload de texturas
   - Tecidos procedurais (embutidos)
   - Upload por arquivo, drag&drop, Ctrl+V e URL
   - Persistência via localStorage (até ~5MB)
   ========================================================= */

const video      = document.getElementById('video');
const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d', { willReadFrequently: true });
const loadingEl  = document.getElementById('loading');

const intensityEl  = document.getElementById('textureIntensity');
const foldEl       = document.getElementById('foldStrength');
const smoothEl     = document.getElementById('edgeSmooth');
const scaleEl      = document.getElementById('textureScale');
const rotationEl   = document.getElementById('textureRotation');
const shadowToggle = document.getElementById('shadowToggle');
const expandToggle = document.getElementById('expandToggle');
const captureBtn   = document.getElementById('captureBtn');
const downloadLink = document.getElementById('downloadLink');

const swatchesEl     = document.getElementById('swatches');
const userSwatchesEl = document.getElementById('userSwatches');
const uploadArea     = document.getElementById('uploadArea');
const fileInput      = document.getElementById('fileInput');
const pickBtn        = document.getElementById('pickBtn');
const urlBtn         = document.getElementById('urlBtn');
const clearBtn       = document.getElementById('clearBtn');
const dropOverlay    = document.getElementById('dropOverlay');
const regionsEl      = document.getElementById('regions');

let net = null;
let currentRegion = 'upperTorso';

/* Região → chave da textura. Chaves podem ser:
   - nome de tecido procedural ("denim", "silk", …)
   - "user:<id>" para texturas enviadas pelo usuário */
const regionFabric = {
  upperTorso: 'denim',
  lowerTorso: 'denim',
  fullLegs:   'denim',
  leftArm:    'denim',
  rightArm:   'denim',
  wholeBody:  'denim',
};

/* ---------- MAPA DE PARTES DO CORPO ---------- */
const PART_GROUPS = {
  upperTorso: [5, 6, 17],
  lowerTorso: [11, 12, 18],
  fullLegs:   [11, 12, 13, 14, 15, 16, 19, 20, 21, 22],
  leftArm:    [5, 7, 9],
  rightArm:   [6, 8, 10],
  wholeBody:  [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
};
const FACE_PARTS = [0, 1, 2, 3, 4];

/* =========================================================
   1. TECIDOS PROCEDURAIS (embutidos)
   ========================================================= */
const fabrics = {
  denim:   { base: '#33507a', weft: '#25395a', noise: 18, weave: 'twill' },
  linen:   { base: '#d9cdb8', weft: '#c7b89e', noise: 12, weave: 'plain' },
  wool:    { base: '#5c4a3d', weft: '#4a3a30', noise: 22, weave: 'diag'  },
  silk:    { base: '#b03060', weft: '#8e2450', noise: 6,  weave: 'satin' },
  cotton:  { base: '#e8e8ea', weft: '#d0d0d4', noise: 10, weave: 'plain' },
  leather: { base: '#3a2a22', weft: '#2a1e18', noise: 28, weave: 'cells' },
  plaid:   { base: '#1f4d3a', weft: '#c23b3b', noise: 8,  weave: 'plaid' },
  lace:    { base: '#f4eee0', weft: '#d8cfbb', noise: 14, weave: 'lace'  },
};

function generateFabricCanvas(kind) {
  const f = fabrics[kind];
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = f.base;
  g.fillRect(0, 0, S, S);

  switch (f.weave) {
    case 'plain':
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 2) {
          g.fillStyle = ((x + y) / 2) % 2 === 0 ? f.weft : f.base;
          g.fillRect(x, y, 2, 2);
        }
      break;
    case 'twill':
      for (let i = -S; i < S * 2; i += 6) {
        g.strokeStyle = f.weft; g.lineWidth = 3;
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
      }
      break;
    case 'diag':
      for (let i = -S; i < S * 2; i += 4) {
        g.strokeStyle = f.weft; g.lineWidth = 2;
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i - S, S); g.stroke();
      }
      break;
    case 'satin':
      for (let y = 0; y < S; y += 8) { g.fillStyle = f.weft; g.fillRect(0, y, S, 2); }
      break;
    case 'cells':
      for (let i = 0; i < 400; i++) {
        const x = Math.random() * S, y = Math.random() * S;
        const r = 4 + Math.random() * 12;
        g.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.12})`;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'plaid': {
      const bands = [20, 60, 120, 180, 220];
      g.fillStyle = f.weft;
      bands.forEach(p => { g.fillRect(p, 0, 8, S); g.fillRect(0, p, S, 8); });
      break;
    }
    case 'lace':
      g.clearRect(0, 0, S, S);
      for (let y = 8; y < S; y += 16)
        for (let x = 8; x < S; x += 16) {
          g.strokeStyle = f.weft; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
          g.fillStyle = f.base;
          g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
        }
      break;
  }

  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * f.noise;
    d[i] = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* =========================================================
   2. CACHE DE TEXTURAS (procedurais + usuário)
   Guarda canvas prontos por chave, seja "denim" ou "user:xyz"
   ========================================================= */
const textureCache = {}; // key → HTMLCanvasElement

function getTextureCanvas(key) {
  if (textureCache[key]) return textureCache[key];
  if (fabrics[key]) {
    textureCache[key] = generateFabricCanvas(key);
    return textureCache[key];
  }
  return null; // textura de usuário ainda não carregada
}

/* =========================================================
   3. TECIDOS DO USUÁRIO
   ========================================================= */

const USER_STORE_KEY = 'provador.userTextures.v1';
let userTextures = []; // [{id, name, dataURL}]

/* --- 3.1 Persistência --- */
function loadUserTextures() {
  try {
    const raw = localStorage.getItem(USER_STORE_KEY);
    if (raw) userTextures = JSON.parse(raw);
  } catch (e) {
    console.warn('Falha ao ler texturas do usuário:', e);
    userTextures = [];
  }
}

function saveUserTextures() {
  try {
    localStorage.setItem(USER_STORE_KEY, JSON.stringify(userTextures));
  } catch (e) {
    toast('Armazenamento cheio. Remova texturas antigas.', 'error');
  }
}

/* --- 3.2 Pré-carregamento em canvas (com downscale) --- */
const MAX_TEX_SIDE = 512; // redimensiona p/ performance e economia de espaço

function imageToCanvas(img) {
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const scale = Math.min(1, MAX_TEX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, 0, 0, cw, ch);
  return c;
}

function dataURLToImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });
}

/** Garante que a textura do usuário está no cache (carrega do dataURL). */
async function ensureUserTextureLoaded(id) {
  const key = 'user:' + id;
  if (textureCache[key]) return textureCache[key];
  const t = userTextures.find(u => u.id === id);
  if (!t) return null;
  const img = await dataURLToImage(t.dataURL);
  const c = imageToCanvas(img);
  textureCache[key] = c;
  return c;
}

/** Pré-carrega todas as texturas de usuário após carregar a página. */
async function preloadUserTextures() {
  for (const t of userTextures) {
    try { await ensureUserTextureLoaded(t.id); }
    catch (e) { console.warn('Falha ao carregar', t.name, e); }
  }
}

/* --- 3.3 Adicionar textura --- */

function addUserTextureFromDataURL(dataURL, name) {
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  userTextures.push({ id, name: name || 'Textura', dataURL });
  saveUserTextures();
  ensureUserTextureLoaded(id).then(() => renderUserSwatches());
  return id;
}

async function addUserTexturesFromFiles(files) {
  const valid = [...files].filter(f => f.type.startsWith('image/'));
  if (!valid.length) {
    toast('Nenhuma imagem válida.', 'error');
    return;
  }
  for (const file of valid) {
    try {
      const dataURL = await fileToDataURL(file);
      addUserTextureFromDataURL(dataURL, file.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      console.error(e);
      toast('Erro ao carregar ' + file.name, 'error');
    }
  }
  toast(valid.length + ' textura(s) adicionada(s).', 'success');
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* --- 3.4 Remover / limpar --- */

function removeUserTexture(id) {
  userTextures = userTextures.filter(t => t.id !== id);
  delete textureCache['user:' + id];
  saveUserTextures();
  // Se alguma região usava essa textura, volta para "denim"
  for (const k in regionFabric) {
    if (regionFabric[k] === 'user:' + id) regionFabric[k] = 'denim';
  }
  renderUserSwatches();
  toast('Textura removida.', 'success');
}

function clearUserTextures() {
  if (!userTextures.length) { toast('Nada para limpar.'); return; }
  if (!confirm('Remover TODAS as suas texturas? Isso não pode ser desfeito.')) return;
  userTextures = [];
  for (const k in textureCache) if (k.startsWith('user:')) delete textureCache[k];
  for (const k in regionFabric)
    if (regionFabric[k].startsWith('user:')) regionFabric[k] = 'denim';
  saveUserTextures();
  renderUserSwatches();
  toast('Texturas removidas.', 'success');
}

/* =========================================================
   4. RENDERIZAÇÃO DOS SWATCHES
   ========================================================= */

function renderBuiltinSwatches() {
  swatchesEl.innerHTML = '';
  Object.keys(fabrics).forEach(kind => {
    const el = document.createElement('div');
    el.className = 'swatch';
    el.dataset.kind = kind;
    el.title = kind;
    el.style.backgroundImage = `url(${getTextureCanvas(kind).toDataURL()})`;
    el.addEventListener('click', () => selectTextureForCurrentRegion(kind));
    swatchesEl.appendChild(el);
  });
}

function renderUserSwatches() {
  userSwatchesEl.innerHTML = '';
  userTextures.forEach(t => {
    const el = document.createElement('div');
    el.className = 'swatch user';
    el.dataset.kind = 'user:' + t.id;
    el.title = t.name;
    el.style.backgroundImage = `url(${t.dataURL})`;

    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '×';
    btn.title = 'Remover';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeUserTexture(t.id);
    });
    el.appendChild(btn);

    el.addEventListener('click', () => selectTextureForCurrentRegion('user:' + t.id));
    userSwatchesEl.appendChild(el);
  });
  syncActiveSwatches();
}

/** Marca visualmente qual swatch está ativo para a região atual. */
function syncActiveSwatches() {
  const activeKey = regionFabric[currentRegion];
  document.querySelectorAll('.swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.kind === activeKey);
  });
}

/* =========================================================
   5. SELEÇÃO DE TEXTURA POR REGIÃO
   ========================================================= */

async function selectTextureForCurrentRegion(key) {
  // Se for textura do usuário, garante que está carregada
  if (key.startsWith('user:')) {
    await ensureUserTextureLoaded(key.slice(5));
  }
  regionFabric[currentRegion] = key;
  syncActiveSwatches();
  const label = key.startsWith('user:')
    ? userTextures.find(t => 'user:' + t.id === key)?.name || 'Textura'
    : key;
  toast(`"${label}" aplicada em ${prettyRegion(currentRegion)}`, 'success');
}

function prettyRegion(r) {
  return ({
    upperTorso: 'Tronco',
    lowerTorso: 'Barriga/quadril',
    fullLegs:   'Calça',
    leftArm:    'Braço esq.',
    rightArm:   'Braço dir.',
    wholeBody:  'Corpo inteiro',
  })[r] || r;
}

/* =========================================================
   6. UI: REGIÕES
   ========================================================= */

regionsEl.querySelectorAll('.region-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentRegion = btn.dataset.region;
    regionsEl.querySelectorAll('.region-btn')
      .forEach(b => b.classList.toggle('active', b === btn));
    syncActiveSwatches();
  });
});

/* =========================================================
   7. UI: UPLOAD (arquivo, drag&drop, colar, URL)
   ========================================================= */

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files?.length) addUserTexturesFromFiles(e.target.files);
  e.target.value = '';
});

/* Drag & drop na área de upload E no palco */
['dragenter', 'dragover'].forEach(ev => {
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(ev => {
  uploadArea.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
  });
});
uploadArea.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (files?.length) addUserTexturesFromFiles(files);
});

/* Arrastar direto sobre o vídeo */
const stage = document.querySelector('.stage');
['dragenter', 'dragover'].forEach(ev => {
  stage.addEventListener(ev, (e) => {
    e.preventDefault();
    dropOverlay.classList.add('active');
  });
});
stage.addEventListener('dragleave', (e) => {
  if (e.target === stage) dropOverlay.classList.remove('active');
});
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  const files = e.dataTransfer?.files;
  if (files?.length) addUserTexturesFromFiles(files);
});

/* Colar com Ctrl+V */
window.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    await addUserTexturesFromFiles(files);
  }
});

/* Da URL */
urlBtn.addEventListener('click', async () => {
  const url = prompt('Cole a URL da imagem (deve permitir CORS):');
  if (!url) return;
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Não é imagem');
    const dataURL = await blobToDataURL(blob);
    const name = url.split('/').pop().split('?')[0] || 'Da URL';
    addUserTextureFromDataURL(dataURL, name);
    toast('Textura adicionada da URL.', 'success');
  } catch (err) {
    console.error(err);
    toast('Falha: ' + err.message + ' (CORS?)', 'error');
  }
});

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

clearBtn.addEventListener('click', clearUserTextures);

/* =========================================================
   8. TOAST DE FEEDBACK
   ========================================================= */

let toastEl = null;
let toastTimer = null;
function toast(msg, type = '') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'toast ' + type;
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* =========================================================
   9. LOOP PRINCIPAL (segmentação + aplicação)
   ========================================================= */

async function init() {
  loadUserTextures();
  renderBuiltinSwatches();
  renderUserSwatches();
  await preloadUserTextures();
  renderUserSwatches();

  net = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;

  // Seleciona o primeiro tecido por padrão
  syncActiveSwatches();

  loadingEl.style.display = 'none';
  loop();
}

async function loop() {
  requestAnimationFrame(loop);
  if (!net || video.readyState < 2) return;

  const W = canvas.width;
  const H = canvas.height;

  const partsSeg = await net.segmentPersonParts(video, {
    internalResolution: 'medium',
    segmentationThreshold: 0.7,
    maxDetections: 1,
    scoreThreshold: 0.3,
    nmsRadius: 20,
  });

  ctx.drawImage(video, 0, 0, W, H);

  for (const [region, groupIds] of Object.entries(PART_GROUPS)) {
    const key = regionFabric[region];
    if (!key) continue;
    // Pula se a textura ainda não carregou (ex.: usuário enviada que falhou)
    const texCanvas = getTextureCanvas(key);
    if (!texCanvas) continue;

    const regionMask = buildPartMask(
      partsSeg.data, groupIds, W, H,
      parseInt(smoothEl.value, 10),
      expandToggle.checked
    );

    applyTextureToMask(regionMask, texCanvas, W, H, shadowToggle.checked);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function buildPartMask(data, groupIds, W, H, feather, expand) {
  const raw = document.createElement('canvas');
  raw.width = W; raw.height = H;
  const rctx = raw.getContext('2d');
  const img = rctx.createImageData(W, H);
  const d = img.data;
  const allowed = new Set(groupIds);

  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const partId = data[i];
    const on = allowed.has(partId) && !FACE_PARTS.includes(partId);
    d[j] = d[j+1] = d[j+2] = 0;
    d[j+3] = on ? 255 : 0;
  }
  rctx.putImageData(img, 0, 0);

  let expanded = raw;
  if (expand) {
    expanded = document.createElement('canvas');
    expanded.width = W; expanded.height = H;
    const ectx = expanded.getContext('2d');
    const R = Math.max(3, Math.floor(feather * 0.6));
    for (let dx = -R; dx <= R; dx += 3)
      for (let dy = -R; dy <= R; dy += 3) {
        if (dx*dx + dy*dy > R*R) continue;
        ectx.drawImage(raw, dx, dy);
      }
  }

  const smooth = document.createElement('canvas');
  smooth.width = W; smooth.height = H;
  const sctx = smooth.getContext('2d');
  sctx.filter = `blur(${feather}px)`;
  sctx.drawImage(expanded, 0, 0);
  return smooth;
}

/* Aplica textura (canvas) dentro da máscara, respeitando luz/sombra
   e permitindo escala + rotação via parâmetros globais. */
function applyTextureToMask(maskCanvas, texCanvas, W, H, useShadow) {
  const texLayer = document.createElement('canvas');
  texLayer.width = W; texLayer.height = H;
  const tctx = texLayer.getContext('2d');

  // Transformação: escala + rotação em torno do centro
  const scale = parseFloat(scaleEl.value);
  const rot   = parseFloat(rotationEl.value) * Math.PI / 180;
  tctx.save();
  tctx.translate(W / 2, H / 2);
  tctx.rotate(rot);
  tctx.scale(scale, scale);
  tctx.translate(-W / 2, -H / 2);

  // Preenche a área (maior que o canvas para cobrir rotações)
  const pattern = tctx.createPattern(texCanvas, 'repeat');
  tctx.fillStyle = pattern;
  const over = Math.max(W, H) * 1.5;
  tctx.fillRect(-over, -over, W + over * 2, H + over * 2);
  tctx.restore();

  // Preserva iluminação natural
  if (useShadow) {
    tctx.globalCompositeOperation = 'soft-light';
    tctx.globalAlpha = 0.9;
    tctx.drawImage(video, 0, 0, W, H);

    tctx.globalCompositeOperation = 'multiply';
    tctx.globalAlpha = 0.3;