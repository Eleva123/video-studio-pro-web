import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon} from './Icon.jsx';
import {Preview} from './Preview.jsx';
import {readAsset} from './media.js';
import {ExportEngine} from './exporter.js';
import {exportFrame} from './frameExport.js';
import {createId} from './id.js';
import {changeFps, DEFAULT_SETTINGS, distributeFrames, PRESETS, readPresets, secondsLabel, secondsToFrames, totalFrames, validateProject} from './model.js';
import './style.css';

const initial = {settings: {...DEFAULT_SETTINGS}, clips: []};
const sizeLabel = size => `${(size / 1024 / 1024).toLocaleString('pt-BR', {maximumFractionDigits: 1})} MB`;
function NumberField({label, value, onChange, suffix, ...props}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== '' && Number.isFinite(Number(draft)) && Number(draft) !== Number(value)) onChange(Number(draft));
    else setDraft(value);
  };
  return <label className="field"><span>{label}</span><div className="input-unit"><input type="number" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur();}} {...props}/>{suffix && <span>{suffix}</span>}</div></label>;
}
function Thumbnail({asset}) {return asset.kind === 'image' ? <img src={asset.url} alt=""/> : <video src={asset.url} muted preload="metadata" aria-hidden="true"/>;}

function App() {
  const [history, setHistory] = useState({past: [], present: initial, future: []});
  const project = history.present;
  const {clips, settings} = project;
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({message: '', progress: 0});
  const [results, setResults] = useState([]);
  const [customPresets, setCustomPresets] = useState(() => readPresets(localStorage));
  const [presetDialog, setPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [equalSeconds, setEqualSeconds] = useState(10);
  const [dragOver, setDragOver] = useState(false);
  const [dragged, setDragged] = useState(null);
  const [savingFrame, setSavingFrame] = useState(false);
  const fileInput = useRef(null);
  const playerRef = useRef(null);
  const engine = useRef(new ExportEngine());
  const assetUrls = useRef(new Set());
  const resultUrls = useRef(new Set());
  const frames = totalFrames(clips);
  const current = clips.find(c => c.id === selected) || clips[0];
  const index = clips.findIndex(c => c.id === current?.id);
  const change = useCallback((updater) => {
    playerRef.current?.pause();
    setHistory(h => ({past: [...h.past.slice(-29), h.present], present: updater(h.present), future: []}));
    setNotice('');
  }, []);
  const patchSettings = patch => change(p => ({...p, settings: {...p.settings, ...patch}}));
  const patchClip = patch => change(p => ({...p, clips: p.clips.map(c => c.id === current.id ? {...c, ...patch} : c)}));
  useEffect(() => () => {engine.current.cancel(); assetUrls.current.forEach(url => URL.revokeObjectURL(url)); resultUrls.current.forEach(url => URL.revokeObjectURL(url));}, []);
  useEffect(() => {
    if (playerRef.current && playerRef.current.getCurrentFrame() >= frames) playerRef.current.seekTo(Math.max(0, frames - 1));
  }, [frames]);
  async function addFiles(files) {
    if (busy || importing) return;
    setImporting(true); setNotice('');
    const added = [], errors = [];
    for (const file of [...files]) {
      try {
        const asset = await readAsset(file);
        assetUrls.current.add(asset.url);
        added.push({id: createId(), asset, frames: secondsToFrames(asset.kind === 'image' ? 10 : asset.duration, settings.fps), trimStart: 0, trimEnd: asset.duration, timing: 'hold'});
      } catch (error) {errors.push(error.message);}
    }
    if (added.length) {change(p => ({...p, clips: [...p.clips, ...added]})); setSelected(added[0].id);}
    setNotice(errors.join(' ')); setImporting(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  function selectClip(clip) {
    setSelected(clip.id);
    playerRef.current?.pause();
    const start = totalFrames(clips.slice(0, clips.indexOf(clip)));
    playerRef.current?.seekTo(start);
  }
  function move(from, to) {
    if (to < 0 || to >= clips.length || from === to) return;
    change(p => {const moved = [...p.clips]; moved.splice(to, 0, moved.splice(from, 1)[0]); return {...p, clips: moved};});
  }
  function undo(redo = false) {
    playerRef.current?.pause();
    setHistory(h => redo ? h.future.length ? {past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1)} : h : h.past.length ? {past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future]} : h);
    setNotice('');
  }
  function equalize() {
    try {const allocation = distributeFrames(secondsToFrames(equalSeconds, settings.fps), clips.length); change(p => ({...p, clips: p.clips.map((c, i) => ({...c, frames: allocation[i]}))}));}
    catch (error) {setNotice(error.message);}
  }
  async function exportVideo(onlySelected = false) {
    if (busy || importing) return;
    const exporting = {...project, clips: onlySelected ? [current] : clips};
    try {validateProject(exporting);} catch (error) {setNotice(error.message); return;}
    setBusy(true); setNotice(''); playerRef.current?.pause();
    setProgress({message: 'Iniciando exportação…', progress: 0});
    try {
      const result = await engine.current.export(exporting, setProgress);
      resultUrls.current.add(result.url);
      setResults(r => [result, ...r]);
    } catch (error) {setNotice(error.message); setProgress({message: '', progress: 0});}
    finally {setBusy(false);}
  }
  async function saveCurrentFrame(frame) {
    if (busy || importing || savingFrame) return;
    setSavingFrame(true); setNotice('');
    try { await exportFrame(project, frame); setNotice('Quadro salvo como PNG.'); }
    catch (error) { setNotice(error.message); }
    finally { setSavingFrame(false); }
  }
  function savePreset(e) {
    e.preventDefault();
    try {
      validateProject({settings, clips: [{frames: 1, asset: {kind: 'image'}}]});
      const name = presetName.trim();
      if (!name) return;
      const next = [...customPresets.filter(p => p.name !== name), {name, width: Number(settings.width), height: Number(settings.height)}];
      localStorage.setItem('eleva-presets-v2', JSON.stringify(next));
      setCustomPresets(next); setPresetDialog(false); setPresetName(''); setNotice('');
    } catch (error) {setNotice(`Não foi possível salvar o painel. ${error.message}`);}
  }
  const presets = [...PRESETS, ...customPresets];
  const presetValue = presets.findIndex(p => p.width === Number(settings.width) && p.height === Number(settings.height));
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/" aria-label="Eleva Studio, início"><span className="brand-mark">e<span>↗</span></span><div>eleva<span className="brand-sub">STUDIO</span></div></a><div className="header-separator"/><span className="header-label">Editor para painéis de LED</span><div className="header-end"><span className="local-badge"><i/> Processamento local</span><button className="button primary" disabled={busy || importing || !clips.length} onClick={() => exportVideo()}><Icon name="arrow"/> Exportar vídeo</button></div></header>
    <main>
      <div className="page-heading"><div><p className="eyebrow">DA IDEIA AO PAINEL</p><h1>Seu vídeo. No formato certo.</h1><p className="page-description">Ajuste as dimensões, edite as cenas e tenha controle de cada quadro.</p></div><div className="history-buttons"><button className="icon-btn" aria-label="Desfazer edição" title="Desfazer" disabled={busy || !history.past.length} onClick={() => undo()}><Icon name="undo"/></button><button className="icon-btn" aria-label="Refazer edição" title="Refazer" disabled={busy || !history.future.length} onClick={() => undo(true)}><Icon name="redo"/></button></div></div>
      {notice && <div className="notice" role="alert"><span>{notice}</span><button className="icon-btn" aria-label="Fechar aviso" onClick={() => setNotice('')}><Icon name="close"/></button></div>}
      <div className="workspace">
        <aside className="media-panel panel">
          <div className="section-header"><h2><Icon name="layers"/> Suas mídias</h2><span className="count-badge">{clips.length}</span></div>
          <button className={`upload-zone ${dragOver ? 'drag-over' : ''}`} disabled={busy || importing} onClick={() => fileInput.current.click()} onDragOver={e => {e.preventDefault(); setDragOver(true);}} onDragLeave={() => setDragOver(false)} onDrop={e => {e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files);}}><span className="upload-icon"><Icon name="upload" size={24}/></span><strong>{importing ? 'Lendo arquivos…' : 'Adicionar mídias'}</strong><span>Arraste ou clique para selecionar</span><small>Vídeos, PNG, JPG, WebP e BMP • até 250 MB</small></button>
          <input ref={fileInput} type="file" accept="video/*,image/png,image/jpeg,image/webp,image/bmp" multiple hidden onChange={e => addFiles(e.target.files)}/>
          <div className="media-list">{clips.map((clip, i) => <button key={clip.id} className={`media-item ${current?.id === clip.id ? 'selected' : ''}`} disabled={busy} onClick={() => selectClip(clip)}><div className="media-thumb"><Thumbnail asset={clip.asset}/><span><Icon name={clip.asset.kind === 'video' ? 'film' : 'image'} size={12}/></span></div><div className="media-info"><strong title={clip.asset.name}>{clip.asset.name}</strong><span>{clip.asset.width} × {clip.asset.height} • {clip.asset.kind === 'image' ? 'Imagem' : `${clip.asset.duration.toLocaleString('pt-BR', {maximumFractionDigits: 2})} s`}</span><small>Cena {i + 1} • {secondsLabel(clip.frames, settings.fps)} s</small></div></button>)}</div>
          {!clips.length && <p className="media-empty">Suas imagens e vídeos aparecem aqui. Cada arquivo vira uma cena.</p>}
          <div className="workflow-tip"><span className="tip-number">01</span><div><strong>Um fluxo feito para LED</strong><p>Importe → ajuste → confira → exporte.</p></div></div>
        </aside>
        <div className="center-column"><Preview project={project} playerRef={playerRef} onAdd={() => fileInput.current.click()} onExportFrame={saveCurrentFrame}/>
          <section className="timeline panel"><div className="section-header"><h2><Icon name="film"/> Linha do tempo</h2><span className="muted">{clips.length} {clips.length === 1 ? 'cena' : 'cenas'}</span></div>
            <div className="timeline-summary"><div><strong>{secondsLabel(frames, settings.fps)} <small>s</small></strong><span>Duração total</span></div><div><strong>{frames} <small>quadros</small></strong><span>{settings.fps} quadros por segundo</span></div><div className="summary-format"><strong>{settings.width || '—'} × {settings.height || '—'}</strong><span>Resolução de saída</span></div></div>
            <div className="scene-strip">{clips.length ? clips.map((clip, i) => <button key={clip.id} disabled={busy} draggable={!busy} onDragStart={() => setDragged(i)} onDragEnd={() => setDragged(null)} onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); if (dragged !== null) move(dragged, i); setDragged(null);}} onClick={() => selectClip(clip)} className={`scene-block ${clip.id === current?.id ? 'active' : ''}`} style={{flexGrow: clip.frames}}><span className="scene-number">{String(i + 1).padStart(2, '0')}</span><strong>{clip.asset.name}</strong><span>{secondsLabel(clip.frames, settings.fps)} s · {clip.frames} q</span></button>) : <div className="timeline-empty">Adicione arquivos para montar a sequência de cenas.</div>}</div>
            <div className="equalize"><div><strong>Mesmo tempo para cada cena</strong><span>Divide o tempo total em quadros inteiros.</span></div><div className="equalize-action"><label className="sr-only" htmlFor="equal-seconds">Tempo total para distribuir</label><div className="input-unit"><input id="equal-seconds" type="number" min="0.1" max="1800" step="0.1" value={equalSeconds} disabled={busy} onChange={e => setEqualSeconds(e.target.value === '' ? '' : Number(e.target.value))}/><span>s</span></div><button className="button secondary" disabled={busy || !clips.length || equalSeconds <= 0} onClick={equalize}>Distribuir</button></div></div>
            <p className="timeline-note">A 30 FPS, 10 segundos = 300 quadros. Em 3 cenas: 100 quadros para cada uma.</p>
          </section>
        </div>
        <aside className="settings-panel panel"><div className="section-header"><h2><Icon name="settings"/> Ajustes do projeto</h2></div><fieldset disabled={busy || importing}>
          <div className="settings-group"><h3>Formato do painel</h3><label className="field"><span>Painel salvo</span><select value={presetValue < 0 ? '' : presetValue} onChange={e => {if (e.target.value !== '') {const preset = presets[Number(e.target.value)]; patchSettings({width: preset.width, height: preset.height});}}}><option value="">Personalizado</option>{presets.map((p, i) => <option key={`${p.name}-${i}`} value={i}>{p.name}</option>)}</select></label>
          <div className="field-row"><NumberField label="Largura" value={settings.width} min="2" max="4096" step="2" suffix="px" onChange={width => patchSettings({width})}/><NumberField label="Altura" value={settings.height} min="2" max="4096" step="2" suffix="px" onChange={height => patchSettings({height})}/></div>
          <button className="text-button" onClick={() => setPresetDialog(true)}><Icon name="save" size={15}/> Salvar este painel</button>
          <label className="field"><span>Preenchimento do vídeo</span><select value={settings.fit} onChange={e => patchSettings({fit: e.target.value})}><option value="stretch">Esticar até as bordas</option><option value="contain">Manter proporção com bordas</option><option value="cover">Preencher cortando as bordas</option></select></label><p className="field-help">{settings.fit === 'stretch' ? 'Ocupa toda a resolução escolhida, alterando a proporção da imagem.' : settings.fit === 'contain' ? 'Preserva a proporção e completa o espaço vazio com preto.' : 'Preserva a proporção e corta o excesso para preencher o painel.'}</p></div>
          <div className="settings-group"><h3>Reprodução e exportação</h3><label className="field"><span>Quadros por segundo (FPS)</span><select value={settings.fps} onChange={e => change(p => changeFps(p, Number(e.target.value)))}>{[24,25,30,60].map(fps => <option key={fps} value={fps}>{fps} FPS</option>)}</select></label><label className="field"><span>Qualidade do arquivo</span><select value={settings.quality} onChange={e => patchSettings({quality: Number(e.target.value)})}><option value="18">Alta • arquivo maior</option><option value="20">Equilibrada</option><option value="23">Compacta • arquivo menor</option></select></label><label className="switch-label"><div><strong>Manter áudio original</strong><span>Imagens e vídeos sem áudio ficam silenciosos.</span></div><input type="checkbox" checked={settings.audio} onChange={e => patchSettings({audio: e.target.checked})}/></label><div className="export-spec"><Icon name="check" size={14}/><span>MP4 · H.264 · FPS constante</span></div></div>
        </fieldset></aside>
      </div>
      {current && <section className="clip-editor panel"><div className="section-header"><h2><Icon name="scissors"/> Editar cena {index + 1}<span className="clip-name">{current.asset.name}</span></h2><div className="clip-actions"><button className="icon-btn" disabled={busy || index === 0} aria-label="Mover cena para antes" onClick={() => move(index, index - 1)}><Icon name="up"/></button><button className="icon-btn" disabled={busy || index === clips.length - 1} aria-label="Mover cena para depois" onClick={() => move(index, index + 1)}><Icon name="down"/></button><button className="icon-btn" disabled={busy} aria-label="Duplicar cena" onClick={() => {const duplicate = {...current, id: createId()}; change(p => ({...p, clips: [...p.clips.slice(0, index + 1), duplicate, ...p.clips.slice(index + 1)]})); setSelected(duplicate.id);}}><Icon name="copy"/></button><button className="icon-btn danger" disabled={busy} aria-label="Remover cena" onClick={() => change(p => ({...p, clips: p.clips.filter(c => c.id !== current.id)}))}><Icon name="trash"/></button></div></div>
        <fieldset disabled={busy || importing} className="clip-fields"><div className="clip-duration"><NumberField label="Duração da cena" value={Number((current.frames / settings.fps).toFixed(3))} min={1 / settings.fps} max="600" step={1 / settings.fps} suffix="s" onChange={seconds => patchClip({frames: secondsToFrames(seconds, settings.fps)})}/><NumberField label="Quantidade de quadros" value={current.frames} min="1" max={settings.fps * 600} step="1" suffix="q" onChange={n => patchClip({frames: Math.max(1, Math.round(Number(n)) || 1)})}/></div>
          {current.asset.kind === 'video' ? <><div className="clip-cuts"><NumberField label="Cortar início em" value={current.trimStart} min="0" max={current.asset.duration} step="0.001" suffix="s" onChange={trimStart => {if (trimStart !== '' && trimStart >= 0 && trimStart < current.trimEnd) patchClip({trimStart});}}/><NumberField label="Cortar fim em" value={current.trimEnd} min="0" max={current.asset.duration} step="0.001" suffix="s" onChange={trimEnd => {if (trimEnd !== '' && trimEnd > current.trimStart && trimEnd <= current.asset.duration) patchClip({trimEnd});}}/></div><div className="clip-behavior"><label className="field"><span>Como ajustar o tempo</span><select value={current.timing} onChange={e => patchClip({timing: e.target.value})}><option value="hold">Manter velocidade original</option><option value="speed">Ajustar velocidade à duração</option></select></label><p className="field-help">{current.timing === 'hold' ? 'Se o trecho for curto, segura o último quadro. Se for longo, termina no tempo escolhido.' : `Velocidade: ${((current.trimEnd - current.trimStart) / (current.frames / settings.fps)).toLocaleString('pt-BR', {maximumFractionDigits: 2})}×. O trecho inteiro cabe na duração da cena.`}</p></div></> : <div className="image-tip"><Icon name="image" size={25}/><p>A imagem permanece na tela pelo tempo exato da cena. Use “Distribuir” para dar o mesmo tempo a todas.</p></div>}
        </fieldset><div className="clip-bottom"><button className="text-button" disabled={busy} onClick={() => patchClip({trimStart: 0, trimEnd: current.asset.duration, frames: secondsToFrames(current.asset.kind === 'image' ? 10 : current.asset.duration, settings.fps)})}>Restaurar tempo original</button><button className="text-button" disabled={busy} onClick={() => exportVideo(true)}><Icon name="arrow" size={15}/> Exportar só esta cena</button></div></section>}
      {(busy || progress.message) && <section className="export-progress panel" aria-live="polite"><div><strong>{progress.message}</strong><span>{Math.round(progress.progress * 100)}%</span></div><progress value={progress.progress} max="1"/>{busy && <button className="text-button" onClick={() => engine.current.cancel()}>Cancelar exportação</button>}</section>}
      {results.length > 0 && <section className="results"><div className="section-header"><h2><Icon name="check"/> Arquivos prontos</h2><span className="muted">Validados após a exportação</span></div>{results.map(result => <div key={result.id} className="result-card panel"><div className="result-icon"><Icon name="film" size={24}/></div><div className="result-info"><strong>{result.name}</strong><span>{result.width} × {result.height} px · {secondsLabel(result.frames, result.fps)} s · {result.frames} quadros · {result.fps} FPS · {sizeLabel(result.size)}</span></div><span className="validated"><Icon name="check" size={14}/> Validado</span><a className="button primary" href={result.url} download={result.name}><Icon name="arrow"/> Baixar MP4</a><button className="icon-btn" aria-label={`Remover resultado ${result.name}`} onClick={() => {URL.revokeObjectURL(result.url); resultUrls.current.delete(result.url); setResults(r => r.filter(x => x.id !== result.id));}}><Icon name="close"/></button></div>)}</section>}
      <footer><span>Eleva Studio <span className="footer-dot">•</span> Feito para sua rotina no painel</span><span>Espaço: reproduzir · ← →: avançar por quadro</span></footer>
    </main>
    {presetDialog && <div className="modal-backdrop"><form className="preset-modal panel" role="dialog" aria-modal="true" aria-labelledby="preset-title" onSubmit={savePreset}><div className="section-header"><h2 id="preset-title">Salvar formato do painel</h2><button className="icon-btn" type="button" aria-label="Fechar janela" onClick={() => setPresetDialog(false)}><Icon name="close"/></button></div><p>{settings.width} × {settings.height} pixels</p><label className="field"><span>Nome do painel</span><input autoFocus required maxLength="60" value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Ex.: Painel Centro"/></label><button className="button primary" type="submit">Salvar painel</button><p className="field-help">Disponível neste navegador nas próximas visitas.</p></form></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
