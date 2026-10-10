'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbDownload, TbX } from 'react-icons/tb';
import type { RenderQuality, TrickVideoOptions } from '@skrobot/animations/three/video';

interface Props {
  video: TrickVideoOptions;
  onClose: () => void;
  onExport: (quality: RenderQuality) => void;
}

/** Compare the exact same pose, then film with the chosen finish. */
export default function ExportDialog({ video, onClose, onExport }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [quality, setQuality] = useState<RenderQuality>('cinematic');
  const [preview, setPreview] = useState<{ standard: string; cinematic: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void import('@skrobot/animations/three/video')
      .then(({ renderTrickPreview }) => renderTrickPreview({ ...video, signal: controller.signal }))
      .then(result => { if (!controller.signal.aborted) setPreview(result); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [video]);

  return createPortal(
    <dialog ref={dialog} className="export-dialog" aria-labelledby={title} onCancel={onClose}>
      <header className="export-dialog-header">
        <div><span className="export-eyebrow">YOUR SHOT</span><h2 id={title}>Export video</h2></div>
        <button className="export-close" type="button" aria-label="Close export" onClick={onClose}><TbX aria-hidden /></button>
      </header>
      <p className="export-trick">{video.trick.name}</p>
      <div className="export-finishes" role="group" aria-label="Video finish">
        {(['standard', 'cinematic'] as const).map(finish => (
          <button type="button" key={finish} aria-pressed={quality === finish} onClick={() => setQuality(finish)}>
            {finish === 'standard' ? 'Original' : 'Cinematic'}
          </button>
        ))}
      </div>
      <div className="export-preview" aria-busy={!preview && !failed}>
        {preview ? (
          // Browser-generated local canvas image, not a remote asset.
          <img src={preview[quality]} alt={`${quality === 'standard' ? 'Original' : 'Cinematic'} finish of ${video.trick.name}`} />
        ) : <p role="status">{failed ? 'Preview unavailable. You can still try exporting.' : 'Rendering your comparison…'}</p>}
        {preview && <span className="export-preview-label">{quality === 'standard' ? 'Original' : 'Cinematic'} · Same trick, same camera</span>}
      </div>
      <p className="export-description">
        {quality === 'cinematic'
          ? 'Smooth lighting, polished surfaces and contact shading. 1920 px · 30 fps. Takes longer to render.'
          : 'The original stage finish. 1280 px · 60 fps.'}
      </p>
      <button type="button" className="export-save" onClick={() => onExport(quality)}>
        <TbDownload aria-hidden /> Download {quality === 'cinematic' ? 'cinematic' : 'original'} video
      </button>
    </dialog>, document.body,
  );
}
