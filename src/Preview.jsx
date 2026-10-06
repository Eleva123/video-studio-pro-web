import React, {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {Video} from '@remotion/media';
import {AbsoluteFill, CanvasImage, Freeze, Sequence} from 'remotion';
import {Icon} from './Icon.jsx';
import {timecode, totalFrames} from './model.js';

export function EditComposition({clips, settings}) {
  let start = 0;
  const fit = settings.fit === 'stretch' ? 'fill' : settings.fit;
  return <AbsoluteFill style={{backgroundColor: '#000'}}>{clips.map(clip => {
    const from = start;
    start += clip.frames;
    const mediaFrames = Math.max(1, Math.round((clip.trimEnd - clip.trimStart) * settings.fps));
    const rate = clip.timing === 'speed' ? (clip.trimEnd - clip.trimStart) / (clip.frames / settings.fps) : 1;
    const liveFrames = Math.min(clip.frames, Math.max(1, Math.ceil(mediaFrames / rate)));
    const video = <Video src={clip.asset.url} trimBefore={Math.round(clip.trimStart * settings.fps)} durationInFrames={mediaFrames} playbackRate={rate} muted={!settings.audio} objectFit={fit} style={{width: '100%', height: '100%'}} />;
    return <Sequence key={clip.id} from={from} durationInFrames={clip.frames}>
      {clip.asset.kind === 'image' ? <CanvasImage src={clip.asset.url} width={Number(settings.width)} height={Number(settings.height)} fit={fit} style={{width: '100%', height: '100%'}} /> : <>
        <Sequence durationInFrames={liveFrames}>{video}</Sequence>
        {liveFrames < clip.frames && <Sequence from={liveFrames} durationInFrames={clip.frames - liveFrames}><Freeze frame={liveFrames - 1}>{React.cloneElement(video, {muted: true})}</Freeze></Sequence>}
      </>}
    </Sequence>;
  })}</AbsoluteFill>;
}
function Transport({playerRef, frames, fps, onExportFrame, onFrameChange}) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = ({detail}) => {setFrame(detail.frame); onFrameChange?.(detail.frame);};
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    player.addEventListener('frameupdate', update);
    player.addEventListener('play', play);
    player.addEventListener('pause', pause);
    player.addEventListener('ended', pause);
    const initialFrame = player.getCurrentFrame();
    setFrame(initialFrame);
    onFrameChange?.(initialFrame);
    return () => {player.removeEventListener('frameupdate', update); player.removeEventListener('play', play); player.removeEventListener('pause', pause); player.removeEventListener('ended', pause);};
  }, [playerRef, frames, fps, onFrameChange]);
  const seek = (f) => {playerRef.current?.pause(); playerRef.current?.seekTo(Math.min(frames - 1, Math.max(0, f)));};
  useEffect(() => {
    const keydown = (event) => {
      if (event.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
      if (event.code === 'Space') {event.preventDefault(); playerRef.current?.toggle();}
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {event.preventDefault(); seek(playerRef.current.getCurrentFrame() + (event.code === 'ArrowLeft' ? -1 : 1));}
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [frames, playerRef]);
  return <div className="transport">
    <div className="transport-top"><div className="transport-buttons">
      <button className="icon-btn" aria-label="Quadro anterior" onClick={() => seek(frame - 1)}><Icon name="prev"/></button>
      <button className="play-btn" aria-label={playing ? 'Pausar prévia' : 'Reproduzir prévia'} onClick={() => playerRef.current?.toggle()}><Icon name={playing ? 'pause' : 'play'} size={19}/></button>
      <button className="icon-btn" aria-label="Próximo quadro" onClick={() => seek(frame + 1)}><Icon name="next"/></button>
    </div><div className="timecode">{timecode(frame, fps)} <span>/ {timecode(frames, fps)}</span></div><span className="frame-counter">Quadro {frame + 1} de {frames}</span><button className="button secondary frame-export" onClick={() => onExportFrame(frame)}><Icon name="image" size={14}/> Salvar quadro</button></div>
    <input className="scrubber" aria-label="Posição da prévia em quadros" type="range" min="0" max={frames - 1} value={Math.min(frame, frames - 1)} onChange={e => seek(Number(e.target.value))}/>
  </div>;
}
export function Preview({project, playerRef, onAdd, onExportFrame, onFrameChange}) {
  const {settings, clips} = project;
  const frames = totalFrames(clips);
  const inputProps = useMemo(() => ({clips, settings}), [clips, settings]);
  // Remount after an edit so the Player can recover from a failed media decode.
  // The transport uses the same key to bind its listeners to the new Player.
  const previewKey = [settings.width, settings.height, settings.fps, settings.fit, settings.audio, ...clips.map(c => `${c.id}:${c.frames}:${c.trimStart}:${c.trimEnd}:${c.timing}`)].join('|');
  const validSize = Number(settings.width) > 0 && Number(settings.height) > 0;
  return <section className="preview-card">
    <div className="section-header"><h2><Icon name="screen"/> Prévia do painel</h2><span className="badge">{settings.width || '—'} × {settings.height || '—'} px</span></div>
    <div className="preview-stage">{clips.length && validSize ? <Player key={previewKey} ref={playerRef} component={EditComposition} inputProps={inputProps} durationInFrames={frames} fps={settings.fps} compositionWidth={Number(settings.width)} compositionHeight={Number(settings.height)} controls={false} clickToPlay={false} loop={false} style={{width: '100%', maxHeight: 350, aspectRatio: `${settings.width}/${settings.height}`}} errorFallback={() => <div className="preview-error">Não foi possível mostrar esta mídia. Remova a cena ou importe uma versão em MP4 H.264.</div>} /> : <div className="preview-empty"><div className="empty-symbol"><Icon name="film" size={35}/></div><h3>Seu próximo vídeo começa aqui</h3><p>Adicione as mídias, ajuste o painel e confira cada quadro.</p><button className="button secondary" onClick={onAdd}><Icon name="add"/> Adicionar mídias</button></div>}</div>
    {clips.length > 0 && validSize ? <Transport key={previewKey} playerRef={playerRef} frames={frames} fps={settings.fps} onExportFrame={onExportFrame} onFrameChange={onFrameChange}/> : <div className="preview-footnote">Prévia por quadro com Remotion <span>•</span> Arquivos processados no seu navegador</div>}
  </section>;
}
