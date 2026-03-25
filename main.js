import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ============== ELEMENTS ==============
const dropZone = document.getElementById('dropZone');
const pickInputBtn = document.getElementById('pickInputBtn');
const fileInput = document.getElementById('fileInput');
const fileListContainer = document.getElementById('fileListContainer');
const fileCountEl = document.getElementById('fileCount');
const queueActions = document.getElementById('queueActions');
const clearAllBtn = document.getElementById('clearAllBtn');
const convertBtn = document.getElementById('convertBtn');
const convertBtnText = document.getElementById('convertBtnText');
const statusBox = document.getElementById('statusBox');
const engineBadge = document.getElementById('engineBadge');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resW = document.getElementById('resW');
const resH = document.getElementById('resH');
const durationInput = document.getElementById('durationInput');
const audioSelect = document.getElementById('audioSelect');
const formatSelect = document.getElementById('formatSelect');
const presetSelect = document.getElementById('presetSelect');
const savePresetBtn = document.getElementById('savePresetBtn');
const promptModal = document.getElementById('promptModal');
const presetNameInput = document.getElementById('presetNameInput');
const cancelPresetBtn = document.getElementById('cancelPresetBtn');
const confirmPresetBtn = document.getElementById('confirmPresetBtn');
const previewRes = document.getElementById('previewRes');
const previewDur = document.getElementById('previewDur');
const previewFmt = document.getElementById('previewFmt');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');

// ============== STATE ==============
let ffmpeg = null;
let ffmpegLoaded = false;
let filesQueue = [];
let fileIdCounter = 0;
let isConverting = false;

// ============== FFMPEG INIT ==============
async function loadFFmpeg() {
  ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.round(progress * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '%';
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  engineBadge.textContent = '✅ Motor pronto';
  engineBadge.classList.add('ready');
  updateConvertButton();
}

// ============== HELPERS ==============
function setStatus(msg, type = '') {
  statusBox.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>${msg}</span>`;
  if (type === 'success') statusBox.style.borderLeft = '3px solid var(--success)';
  else if (type === 'error') statusBox.style.borderLeft = '3px solid var(--error)';
  else statusBox.style.borderLeft = 'none';
}

function updateConvertButton() {
  if (filesQueue.length === 0) {
    convertBtn.disabled = true;
    convertBtnText.textContent = 'Adicione arquivos para começar';
  } else if (!ffmpegLoaded) {
    convertBtn.disabled = true;
    convertBtnText.textContent = 'Motor carregando...';
  } else if (isConverting) {
    convertBtn.disabled = true;
  } else {
    convertBtn.disabled = false;
    convertBtnText.textContent = `Converter ${filesQueue.length} arquivo(s)`;
  }
}

function updateFileStatusUI(id, msg, type = '') {
  const el = document.getElementById(`status-${id}`);
  if (el) { el.textContent = msg; el.className = `file-status ${type}`.trim(); }
}

function slugifyFileName(name, opts) {
  const lastDot = name.lastIndexOf('.');
  let base = lastDot > -1 ? name.substring(0, lastDot) : name;
  base = base.replace(/\s+/g, '_');
  return `${base}_${opts.width}x${opts.height}_${opts.duration}s${opts.format}`;
}

function getOptions() {
  return {
    width: Number(resW.value) || 600,
    height: Number(resH.value) || 360,
    duration: parseFloat(durationInput.value) || 10,
    audio: audioSelect.value,
    format: formatSelect.value
  };
}

// ============== FILE QUEUE ==============
function addFilesToQueue(fileList) {
  for (const file of fileList) {
    const id = fileIdCounter++;
    filesQueue.push({ id, file, name: file.name });

    const el = document.createElement('div');
    el.className = 'file-item';
    el.id = `file-${id}`;
    el.innerHTML = `
      <span class="file-name" title="${file.name}">${file.name}</span>
      <span class="file-status" id="status-${id}">Pronto</span>
      <button class="remove-btn" data-id="${id}">✕</button>
    `;
    el.querySelector('.remove-btn').addEventListener('click', () => removeFile(id));
    fileListContainer.appendChild(el);
  }
  fileCountEl.textContent = filesQueue.length;
  queueActions.style.display = filesQueue.length > 0 ? 'block' : 'none';
  updateConvertButton();
  setStatus('Arquivos adicionados. Clique em Converter!');
}

function removeFile(id) {
  if (isConverting) return;
  filesQueue = filesQueue.filter(f => f.id !== id);
  document.getElementById(`file-${id}`)?.remove();
  fileCountEl.textContent = filesQueue.length;
  queueActions.style.display = filesQueue.length > 0 ? 'block' : 'none';
  updateConvertButton();
}

function clearAllFiles() {
  if (isConverting) return;
  filesQueue = [];
  fileListContainer.innerHTML = '';
  fileCountEl.textContent = '0';
  queueActions.style.display = 'none';
  updateConvertButton();
  setStatus('Fila limpa.');
}

// ============== DROP / PICK ==============
dropZone.addEventListener('click', () => fileInput.click());
pickInputBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) { addFilesToQueue(fileInput.files); fileInput.value = ''; } });
clearAllBtn.addEventListener('click', clearAllFiles);

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); if (!isConverting) dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (isConverting) return;
  if (e.dataTransfer.files?.length > 0) addFilesToQueue(e.dataTransfer.files);
});

// ============== CONVERSION ==============
convertBtn.addEventListener('click', async () => {
  if (filesQueue.length === 0 || !ffmpegLoaded || isConverting) return;

  const opts = getOptions();
  isConverting = true;
  updateConvertButton();

  const oldHtml = convertBtn.innerHTML;
  convertBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg> <span>Processando lote...</span>`;
  progressWrap.style.display = 'flex';

  let successCount = 0;

  for (let i = 0; i < filesQueue.length; i++) {
    const fileObj = filesQueue[i];
    setStatus(`Convertendo arquivo ${i + 1} de ${filesQueue.length}...`);
    updateFileStatusUI(fileObj.id, 'Convertendo...', 'processing');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    const outName = slugifyFileName(fileObj.name, opts);
    const inputName = `input_${fileObj.id}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(fileObj.file));

      const args = ['-i', inputName, '-t', String(opts.duration), '-vf', `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`];

      if (opts.audio === 'none') args.push('-an');
      if (opts.format === '.webm') { args.push('-c:v', 'libvpx', '-b:v', '1M'); }
      else { args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23'); }

      args.push('-y', outName);

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outName);
      const mimeType = opts.format === '.webm' ? 'video/webm' : 'video/mp4';
      const blob = new Blob([data.buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url; a.download = outName; a.click();
      URL.revokeObjectURL(url);

      // Cleanup
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outName);

      updateFileStatusUI(fileObj.id, 'Sucesso ✓', 'success');
      successCount++;
    } catch (err) {
      console.error(err);
      updateFileStatusUI(fileObj.id, 'Falha ✕', 'error');
    }
  }

  isConverting = false;
  updateConvertButton();
  convertBtn.innerHTML = oldHtml;
  updateConvertButton();
  progressWrap.style.display = 'none';

  if (successCount === filesQueue.length) {
    setStatus(`Finalizado! Todos os ${successCount} arquivos convertidos!`, 'success');
  } else {
    setStatus(`Concluído: ${successCount} ok, ${filesQueue.length - successCount} falharam.`, 'error');
  }
});

// ============== PRESETS ==============
const defaultPresets = {
  padrao:   { name: 'Padrão 10s (600x360)', w: 600, h: 360, dur: 10, aud: 'none', fmt: '.mp4' },
  stories:  { name: 'Stories / Reels (1080x1920)', w: 1080, h: 1920, dur: 15, aud: 'keep', fmt: '.mp4' },
  feed:     { name: 'Feed Quadrado (1080x1080)', w: 1080, h: 1080, dur: 15, aud: 'keep', fmt: '.mp4' }
};

let customPresets = JSON.parse(localStorage.getItem('video10web_presets') || '{}');
let allPresets = { ...defaultPresets, ...customPresets };
let isUpdatingPreset = false;
let editingPresetKey = null;

function renderPresetOptions() {
  const currentValue = presetSelect.value;
  presetSelect.innerHTML = '';
  for (const key in allPresets) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = allPresets[key].name;
    presetSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom'; customOpt.textContent = '⚙️ Configurado a mão';
  presetSelect.appendChild(customOpt);
  presetSelect.value = allPresets[currentValue] ? currentValue : 'custom';
}

presetSelect.addEventListener('change', () => {
  const p = allPresets[presetSelect.value];
  if (p) {
    isUpdatingPreset = true;
    resW.value = p.w; resH.value = p.h; durationInput.value = p.dur;
    audioSelect.value = p.aud; formatSelect.value = p.fmt;
    isUpdatingPreset = false;
  }
});

function markCustom() { if (!isUpdatingPreset) presetSelect.value = 'custom'; }
resW.addEventListener('input', markCustom);
resH.addEventListener('input', markCustom);
durationInput.addEventListener('input', markCustom);
audioSelect.addEventListener('change', markCustom);
formatSelect.addEventListener('change', markCustom);

// -- Modal --
savePresetBtn.addEventListener('click', () => {
  const pKey = presetSelect.value;
  previewRes.textContent = `${resW.value}×${resH.value}`;
  previewDur.textContent = `${durationInput.value}s`;
  previewFmt.textContent = formatSelect.value.toUpperCase().replace('.', '');

  if (pKey.startsWith('custom_')) {
    editingPresetKey = pKey;
    presetNameInput.value = customPresets[pKey].name.replace('⭐ ', '');
    modalDeleteBtn.classList.remove('d-none');
    document.querySelector('.modal-header h3').textContent = 'Gerenciar Predefinição';
  } else {
    editingPresetKey = null;
    presetNameInput.value = '';
    modalDeleteBtn.classList.add('d-none');
    document.querySelector('.modal-header h3').textContent = 'Nova Predefinição';
  }
  promptModal.classList.remove('d-none');
  presetNameInput.focus();
});

cancelPresetBtn.addEventListener('click', () => promptModal.classList.add('d-none'));

confirmPresetBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) return;
  const key = editingPresetKey || ('custom_' + Date.now());
  customPresets[key] = { name: `⭐ ${name}`, w: Number(resW.value) || 600, h: Number(resH.value) || 360, dur: parseFloat(durationInput.value) || 10, aud: audioSelect.value, fmt: formatSelect.value };
  localStorage.setItem('video10web_presets', JSON.stringify(customPresets));
  allPresets = { ...defaultPresets, ...customPresets };
  promptModal.classList.add('d-none');
  renderPresetOptions();
  isUpdatingPreset = true; presetSelect.value = key; isUpdatingPreset = false;
  setStatus('✨ Predefinição salva com sucesso!', 'success');
});

modalDeleteBtn.addEventListener('click', () => {
  if (editingPresetKey && customPresets[editingPresetKey]) {
    delete customPresets[editingPresetKey];
    localStorage.setItem('video10web_presets', JSON.stringify(customPresets));
    allPresets = { ...defaultPresets, ...customPresets };
    renderPresetOptions();
    promptModal.classList.add('d-none');
    setStatus('🗑️ Predefinição excluída!', 'success');
    presetSelect.value = 'padrao';
    presetSelect.dispatchEvent(new Event('change'));
  }
});

// ============== INIT ==============
renderPresetOptions();
isUpdatingPreset = true; presetSelect.value = 'padrao'; isUpdatingPreset = false;
presetSelect.dispatchEvent(new Event('change'));

loadFFmpeg().catch(err => {
  console.error('Erro ao carregar FFmpeg:', err);
  engineBadge.textContent = '❌ Erro no motor';
  setStatus('Erro ao carregar o motor de conversão. Tente recarregar a página.', 'error');
});
