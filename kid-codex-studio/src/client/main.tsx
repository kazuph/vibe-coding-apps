import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BadgeCheck, Check, Gamepad2, Image, LoaderCircle, Maximize2, Play, Sparkles, Trash2, Upload, UserRound, Video, WandSparkles, X } from 'lucide-react';
import './styles.css';

type Asset = {
  id: string;
  kind: 'upload' | 'image' | 'character' | 'game' | 'video';
  title: string;
  prompt: string;
  path: string;
  url: string;
  thumbnailUrl?: string;
  version?: string;
  createdAt: string;
};

type Job = {
  id: string;
  mode: Mode;
  prompt: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  message: string;
  result?: { text: string; assets: Array<{ kind: string; url: string; title: string }> };
};

type AssetDetail = {
  asset: Asset;
  files: Array<{ name: string; path: string; url: string }>;
  manifest?: {
    rows?: Array<{ state: string; frames: number; strip: string }>;
    frames?: string[];
    thumbnail?: string;
    spritesheet?: string;
    atlas?: string;
    sources?: string[];
  };
};

type Mode = 'image' | 'character' | 'game' | 'video';

const modeInfo = {
  image: { label: 'えをつくる', icon: Image },
  character: { label: 'キャラづくり', icon: UserRound },
  game: { label: 'ゲームをつくる', icon: Gamepad2 },
  video: { label: 'どうがをつくる', icon: Video }
};

function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [mode, setMode] = useState<Mode>('image');
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds]
  );

  useEffect(() => {
    void refreshAssets();
    void refreshJobs();
  }, []);

  const activeJobIds = useMemo(
    () => jobs.filter((item) => item.status !== 'done' && item.status !== 'failed').map((item) => item.id),
    [jobs]
  );

  useEffect(() => {
    if (activeJobIds.length === 0) return;
    const timer = window.setInterval(async () => {
      const results = await Promise.all(
        activeJobIds.map(async (id) => {
          const res = await fetch(`/api/jobs/${id}`);
          return res.ok ? ((await res.json()) as Job) : null;
        })
      );
      const nextJobs = results.filter(Boolean) as Job[];
      if (nextJobs.length === 0) return;
      let completed = false;
      setJobs((current) =>
        current.map((item) => {
          const next = nextJobs.find((candidate) => candidate.id === item.id);
          if (!next) return item;
          if (item.status !== 'done' && next.status === 'done') completed = true;
          return next;
        })
      );
      if (completed) void refreshAssets();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [activeJobIds.join('|')]);

  async function refreshAssets() {
    const res = await fetch('/api/assets');
    if (res.ok) setAssets(await res.json());
  }

  async function refreshJobs() {
    const res = await fetch('/api/jobs');
    if (res.ok) setJobs(((await res.json()) as Job[]).slice(0, 20));
  }

  async function uploadPhoto(file: File) {
    setError('');
    const form = new FormData();
    form.append('photo', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: form });
    if (!res.ok) {
      setError('アップロードできませんでした');
      return;
    }
    const asset = (await res.json()) as Asset;
    setAssets((current) => [asset, ...current]);
    setSelectedIds((current) => [asset.id, ...current]);
  }

  async function startJob() {
    setError('');
    if (!prompt.trim()) {
      setError('なにをつくりたいか書いてね');
      return;
    }
    if (mode === 'game' && selectedAssets.length === 0) {
      setError('ゲームはライブラリの画像を1つ以上えらんでね');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        mode,
        prompt,
        imagePath: selectedAssets[0]?.path,
        assetPaths: selectedAssets.map((asset) => asset.path)
      };
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'はじめられませんでした');
      }
      const created = (await res.json()) as Job;
      setJobs((current) => [created, ...current].slice(0, 20));
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'はじめられませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleAsset(id: string) {
    const asset = assets.find((item) => item.id === id);
    if (!asset || !isReferenceable(asset)) return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [id, ...current].slice(0, 8)
    );
  }

  async function openAsset(asset: Asset) {
    const res = await fetch(`/api/assets/${asset.id}/detail`);
    if (res.ok) setDetail(await res.json());
  }

  async function deleteCard(asset: Asset) {
    if (!window.confirm(`${assetLabel(asset)}をけしますか？`)) return;
    const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('けせませんでした');
      return;
    }
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setSelectedIds((current) => current.filter((id) => id !== asset.id));
    if (detail?.asset.id === asset.id) setDetail(null);
  }

  const ActiveIcon = modeInfo[mode].icon;

  return (
    <main className="app-shell">
      <section className="workbench">
        <header className="topbar">
          <div>
            <p className="eyebrow">Kid Codex Studio</p>
            <h1>つくりたいものをえらぼう</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => fileRef.current?.click()} aria-label="写真をアップロード">
            <Upload size={24} />
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
              event.currentTarget.value = '';
            }}
          />
        </header>

        <div className="mode-grid">
          {(Object.keys(modeInfo) as Mode[]).map((key) => {
            const Icon = modeInfo[key].icon;
            return (
              <button className={mode === key ? 'mode active' : 'mode'} type="button" onClick={() => setMode(key)} key={key}>
                <Icon size={22} />
                <span>{modeInfo[key].label}</span>
              </button>
            );
          })}
        </div>

        <section className="reference-panel">
          <div>
            <strong>さんこう画像</strong>
            <p>
              {selectedAssets.length
                ? `${selectedAssets.length}こ えらんでいます`
                : mode === 'game'
                  ? 'ゲームは画像をえらんでね'
                  : 'ライブラリからえらべます'}
            </p>
          </div>
          {selectedAssets.length > 0 ? (
            <div className="reference-thumbs" aria-label="えらんださんこう画像">
              {selectedAssets.map((asset) => (
                <button type="button" onClick={() => toggleAsset(asset.id)} key={asset.id} aria-label={`${assetLabel(asset)}をはずす`}>
                  {asset.kind === 'video' ? (
                    <video src={asset.url} muted playsInline />
                  ) : (
                    <img src={assetPreviewUrl(asset)} alt="" />
                  )}
                  <span>{assetLabel(asset)}</span>
                </button>
              ))}
            </div>
          ) : (
            <BadgeCheck size={24} />
          )}
        </section>

        <label className="prompt-box">
          <span>
            <ActiveIcon size={20} />
            おねがい
          </span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例: うちゅうをとぶ、にじいろのドラゴン"
          />
        </label>

        <button className="create-button" type="button" onClick={startJob} disabled={submitting}>
          {submitting ? <LoaderCircle className="spin" size={24} /> : <WandSparkles size={24} />}
          <span>{submitting ? 'おねがい中' : 'Codex におねがいする'}</span>
        </button>
        {error && <p className="error">{error}</p>}

        {jobs.length > 0 && (
          <section className="job-list">
            {jobs.map((item, index) => (
              <article className={`job ${item.status}`} key={item.id}>
                <div>
                  <strong>{index + 1}. {item.message}</strong>
                  <p>{statusLabel(item.status)}</p>
                </div>
                {item.status === 'running' || item.status === 'queued' ? <LoaderCircle className="spin" size={24} /> : null}
                {item.status === 'done' && <Sparkles size={28} />}
              </article>
            ))}
          </section>
        )}
      </section>

      <section className="library">
        <div className="library-head">
          <h2>ライブラリ</h2>
          <button type="button" onClick={() => void refreshAssets()}>更新</button>
        </div>
        <div className="asset-grid">
          {assets.map((asset) => (
            <article
              className={selectedIds.includes(asset.id) ? 'asset selected' : 'asset'}
              key={asset.id}
            >
              <span className="asset-kind-badge" aria-label={assetKindBadge(asset).label}>
                {assetKindBadge(asset).emoji}
              </span>
              {assetVersionText(asset) && <span className="asset-version-badge">{assetVersionText(asset)}</span>}
              <button className="asset-delete" type="button" onClick={() => void deleteCard(asset)} aria-label={`${assetLabel(asset)}を削除`}>
                <Trash2 size={16} />
              </button>
              <button className="asset-main" type="button" onClick={() => (isReferenceable(asset) ? toggleAsset(asset.id) : openAsset(asset))}>
                {asset.kind === 'video' ? (
                  <video src={asset.url} muted playsInline />
                ) : asset.kind === 'game' ? (
                  asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <span className="game-tile"><Play size={28} /></span>
                ) : (
                  <img src={asset.url} alt="" />
                )}
                <span>{assetLabel(asset)}</span>
              </button>
              <div className="asset-actions">
                {isReferenceable(asset) && (
                  <button type="button" onClick={() => toggleAsset(asset.id)} aria-label="さんこう画像にする">
                    {selectedIds.includes(asset.id) ? <Check size={18} /> : <BadgeCheck size={18} />}
                  </button>
                )}
                <button type="button" onClick={() => openAsset(asset)} aria-label="大きく見る">
                  <Maximize2 size={18} />
                </button>
              </div>
            </article>
          ))}
          {assets.length === 0 && (
            <div className="empty">
              <Upload size={32} />
              <p>写真を入れるか、最初の作品をつくってね</p>
            </div>
          )}
        </div>
      </section>
      {detail && <AssetModal detail={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

function AssetModal({ detail, onClose }: { detail: AssetDetail; onClose: () => void }) {
  const asset = detail.asset;
  return (
    <div className="modal-backdrop">
      <section className={asset.kind === 'game' ? 'asset-modal game-modal-full' : 'asset-modal'}>
        <header>
          <div>
            <p className="eyebrow">{assetLabel(asset)}</p>
            <h2>{asset.kind === 'game' ? 'ゲームをプレイ' : asset.kind === 'character' ? 'キャラの成果物' : '大きく見る'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる">
            <X size={24} />
          </button>
        </header>
        {asset.kind === 'character' ? (
          <CharacterPreview detail={detail} />
        ) : asset.kind === 'game' ? (
          <iframe className="game-frame" src={asset.url} title={asset.title} />
        ) : asset.kind === 'video' ? (
          <video className="modal-media" src={asset.url} controls autoPlay playsInline />
        ) : (
          <img className="modal-media" src={asset.url} alt="" />
        )}
      </section>
    </div>
  );
}

function CharacterPreview({ detail }: { detail: AssetDetail }) {
  const rows = detail.manifest?.rows ?? [];
  const [rowIndex, setRowIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [petOffset, setPetOffset] = useState({ x: 0, y: 0, rotate: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionError, setMotionError] = useState('');
  const [motionDebug, setMotionDebug] = useState('傾きOFF');
  const stageRef = useRef<HTMLDivElement>(null);
  const gravityRef = useRef({ x: 0, y: 0 });
  const physicsRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, rotate: 0 });
  const fileByName = useMemo(() => new Map(detail.files.map((file) => [file.name, file])), [detail.files]);
  const activeRow = rows[rowIndex] ?? rows[0];
  const activeFrameName = activeRow ? `frames/${activeRow.state}-${frameIndex % activeRow.frames}.png` : '';
  const activeFrame = fileByName.get(activeFrameName);
  const spritesheet = detail.manifest?.spritesheet ? fileByName.get(detail.manifest.spritesheet) : null;

  useEffect(() => {
    setFrameIndex(0);
  }, [rowIndex]);

  useEffect(() => {
    if (!activeRow) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % activeRow.frames);
    }, 130);
    return () => window.clearInterval(timer);
  }, [activeRow?.state, activeRow?.frames]);

  useEffect(() => {
    if (!motionEnabled) return;
    let animationFrame = 0;
    let previousTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min(0.035, (time - previousTime) / 1000 || 0.016);
      previousTime = time;
      const rect = stageRef.current?.getBoundingClientRect();
      const maxX = rect ? Math.max(0, (rect.width - 192) / 2 - 8) : 120;
      const maxY = rect ? Math.max(0, (rect.height - 208) / 2 - 8) : 80;
      const state = physicsRef.current;
      const gravity = gravityRef.current;
      const accel = 950;
      const damping = Math.pow(0.15, dt);

      state.vx = (state.vx + gravity.x * accel * dt) * damping;
      state.vy = (state.vy + gravity.y * accel * dt) * damping;
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      if (state.x < -maxX || state.x > maxX) {
        state.x = Math.max(-maxX, Math.min(maxX, state.x));
        state.vx *= -0.22;
      }
      if (state.y < -maxY || state.y > maxY) {
        state.y = Math.max(-maxY, Math.min(maxY, state.y));
        state.vy *= -0.22;
      }

      state.rotate = state.rotate * 0.82 + Math.max(-12, Math.min(12, state.vx / 28)) * 0.18;
      setPetOffset({ x: state.x, y: state.y, rotate: state.rotate });
      animationFrame = window.requestAnimationFrame(animate);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const gamma = Math.max(-30, Math.min(30, event.gamma ?? 0));
      const beta = Math.max(-30, Math.min(30, (event.beta ?? 0) - 35));
      gravityRef.current = {
        x: gravityRef.current.x * 0.82 + (-gamma / 30) * 0.18,
        y: gravityRef.current.y * 0.82 + (beta / 30) * 0.18
      };
      setMotionDebug(`重力 x:${gravityRef.current.x.toFixed(2)} y:${gravityRef.current.y.toFixed(2)}`);
    };
    const onMotion = (event: DeviceMotionEvent) => {
      const gravity = event.accelerationIncludingGravity;
      if (!gravity) return;
      const x = Math.max(-8, Math.min(8, gravity.x ?? 0));
      const y = Math.max(-8, Math.min(8, gravity.y ?? 0));
      gravityRef.current = {
        x: gravityRef.current.x * 0.85 + (-x / 8) * 0.15,
        y: gravityRef.current.y * 0.85 + (y / 8) * 0.15
      };
      setMotionDebug(`重力 x:${gravityRef.current.x.toFixed(2)} y:${gravityRef.current.y.toFixed(2)}`);
    };
    animationFrame = window.requestAnimationFrame(animate);
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, [motionEnabled]);

  async function enableMotion() {
    setMotionError('');
    setMotionDebug('許可を確認中');
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setMotionDebug('HTTPSが必要');
      setMotionError('iPadの傾きセンサーはHTTPSで開く必要があります');
      return;
    }
    const maybeDeviceOrientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };
    const maybeDeviceMotion = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<PermissionState>;
    };
    try {
      if (typeof maybeDeviceOrientation.requestPermission === 'function') {
        const permission = await maybeDeviceOrientation.requestPermission();
        if (permission !== 'granted') {
          setMotionError('傾きが許可されませんでした');
          return;
        }
      }
      if (typeof maybeDeviceMotion.requestPermission === 'function') {
        const permission = await maybeDeviceMotion.requestPermission();
        if (permission !== 'granted') {
          setMotionError('加速度が許可されませんでした');
          return;
        }
      }
      gravityRef.current = { x: 0, y: 0 };
      physicsRef.current = { x: 0, y: 0, vx: 0, vy: 0, rotate: 0 };
      setMotionEnabled(true);
      setMotionDebug('センサー待ち');
    } catch {
      setMotionError('傾きを使えませんでした');
    }
  }

  function trackPointer(event: React.PointerEvent<HTMLElement>) {
    if (motionEnabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 180;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 120;
    setPetOffset({ x, y, rotate: x / 28 });
  }

  return (
    <section className="character-preview">
      <div
        className={motionEnabled ? 'character-stage motion-active' : 'character-stage'}
        ref={stageRef}
        onPointerMove={trackPointer}
        onPointerLeave={() => {
          if (!motionEnabled) setPetOffset({ x: 0, y: 0, rotate: 0 });
        }}
      >
        <div
          className="pet-runner"
          style={{ transform: `translate(${petOffset.x}px, ${petOffset.y}px) rotate(${petOffset.rotate}deg)` }}
        >
          {activeFrame ? <img src={activeFrame.url} alt="" /> : <img src={detail.asset.url} alt="" />}
        </div>
      </div>
      <div className="state-tabs">
        {rows.map((row, index) => (
          <button
            type="button"
            className={index === rowIndex ? 'active' : ''}
            onClick={() => setRowIndex(index)}
            key={row.state}
          >
            {row.state}
          </button>
        ))}
      </div>
      <div className="motion-controls">
        <button type="button" onClick={enableMotion} className={motionEnabled ? 'active' : ''}>
          {motionEnabled ? '傾きON' : '傾きでうごかす'}
        </button>
        <span>{motionDebug}</span>
        {motionError && <span>{motionError}</span>}
      </div>
      {spritesheet && (
        <a className="spritesheet-link" href={spritesheet.url} target="_blank" rel="noreferrer">
          <img src={spritesheet.url} alt="" />
          <span>spritesheet.webp</span>
        </a>
      )}
      <div className="file-grid character-files">
        {detail.files.map((file) => (
          <a href={file.url} target="_blank" rel="noreferrer" key={file.url}>
            <img src={file.url} alt="" />
            <span>{file.name}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function isReferenceable(asset: Asset) {
  return asset.kind === 'upload' || asset.kind === 'image' || asset.kind === 'character' || asset.kind === 'game';
}

function assetLabel(asset: Asset) {
  if (asset.kind === 'character') return 'キャラ';
  if (asset.kind === 'game') return asset.title || 'ゲーム';
  if (asset.kind === 'video') return 'どうが';
  if (asset.kind === 'upload') return 'アップロード';
  return asset.title;
}

function assetPreviewUrl(asset: Asset) {
  return asset.kind === 'game' && asset.thumbnailUrl ? asset.thumbnailUrl : asset.url;
}

function assetKindBadge(asset: Asset) {
  if (asset.kind === 'game') return { emoji: '🎮', label: 'ゲーム' };
  if (asset.kind === 'video') return { emoji: '🎬', label: 'どうが' };
  if (asset.kind === 'character') return { emoji: '🙂', label: 'キャラ' };
  if (asset.kind === 'upload') return { emoji: '📷', label: 'アップロード' };
  return { emoji: '🖼️', label: '生成画像' };
}

function assetVersionText(asset: Asset) {
  const version = asset.version?.match(/v\d+/i)?.[0];
  return version ? version.toLowerCase() : '';
}

function statusLabel(status: Job['status']) {
  if (status === 'done') return 'ライブラリに入りました';
  if (status === 'failed') return 'おとなに見てもらってね';
  if (status === 'queued') return 'じゅんばん待ちです';
  return 'できたものから先に出ます';
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
