/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
/* Server-backed flow: no client SDK usage */
import {
  Download,
  LoaderCircle,
  SendHorizontal,
  Trash2,
  Eraser,
  Pencil,
  Copy,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import { buildPrompt, type Mode, type UseCase, type Tone } from './prompt';

// In production, we call our Workers API with Basic Auth; no API keys in the client.

const modes: { key: Mode; label: string }[] = [
  { key: 'sketch_restyle', label: '手書き' },
  { key: 'autoshape', label: 'オートシェイプ' },
  { key: 'figma_vectorize', label: 'Figma' },
  { key: 'photoreal', label: 'フォトリアル' },
  { key: 'kawaii_illustration', label: 'かわいいイラスト' },
];


export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [isUiHidden, setIsUiHidden] = useState(false);
  const uiVisibilityTimeoutRef = useRef<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [useCase, setUseCase] = useState<UseCase>('資料図');
  const [tone, setTone] = useState<Tone>('フォーマル');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const preGenSnapshotRef = useRef<string | null>(null);
  // Basic Auth is enforced server-side for the whole origin.

  // Paste & Drag support helpers
  const drawImageFit = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    // clear + white background
    ctx.save();
    // Reset any prior transform to avoid non-uniform scaling affecting aspect ratio
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Apply uniform device-pixel scaling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, cw, ch);
    const iw = (img as any).naturalWidth || img.width;
    const ih = (img as any).naturalHeight || img.height;
    const scale = Math.min(cw / iw, ch / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    // Ensure image smoothing is enabled but aspect ratio strictly preserved by equal scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    setIsCanvasEmpty(false);
  };

  const drawBlob = (blob: Blob) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      drawImageFit(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const drawDataUrl = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      drawImageFit(img);
    };
    img.src = dataUrl;
  };

  const handlePasteEvent = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) drawBlob(file);
        e.preventDefault();
        break;
      }
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      drawBlob(files[0]);
      return;
    }
    const items = e.dataTransfer?.items;
    if (items) {
      for (const item of items) {
        if (item.kind === 'string' && item.type === 'text/uri-list') {
          item.getAsString((uri) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => drawImageFit(img);
            img.src = uri;
          });
          break;
        }
      }
    }
  };

  const pasteFromClipboard = async () => {
    try {
      // navigator.clipboard.read is preferred when permitted
      // Safari(iPadOS 17+) supports reading images from clipboard in secure context.
      // Fallback to paste shortcut if not available.
      // @ts-ignore
      if (navigator.clipboard && navigator.clipboard.read) {
        // @ts-ignore
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              drawBlob(blob);
              return;
            }
          }
        }
        setError('クリップボードに画像が見つかりません。');
      } else {
        setError('このブラウザではボタンでのペースト非対応です。キーボードの貼り付けまたはドラッグ＆ドロップをお試しください。');
      }
    } catch (e: any) {
      console.error(e);
      setError('クリップボードへのアクセスが拒否されました。設定をご確認ください。');
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Use { desynchronized: true } for lower latency rendering, which helps with drawing responsiveness.
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;
    ctxRef.current = ctx;

    const setCanvasDimensions = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 5;
    };

    setCanvasDimensions();
    window.addEventListener('resize', setCanvasDimensions);
    return () => {
      window.removeEventListener('resize', setCanvasDimensions);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (uiVisibilityTimeoutRef.current) {
        clearTimeout(uiVisibilityTimeoutRef.current);
      }
    };
  }, []);

  const startDrawing = useCallback((e: PointerEvent) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;
    e.preventDefault();

    if (uiVisibilityTimeoutRef.current) {
      clearTimeout(uiVisibilityTimeoutRef.current);
      uiVisibilityTimeoutRef.current = null;
    }
    setIsUiHidden(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.documentElement.classList.add('no-select');

    canvas.setPointerCapture(e.pointerId);
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : 'black';
    ctx.lineWidth = tool === 'eraser' ? 24 : 5; // ignore pressure; fixed widths
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
    lastPointRef.current = { x: e.offsetX, y: e.offsetY };
    setDrawing(true);
    setIsCanvasEmpty(false);
  }, [tool]);

  const stopDrawing = useCallback((e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    lastPointRef.current = null;

    uiVisibilityTimeoutRef.current = window.setTimeout(() => {
      setIsUiHidden(false);
    }, 700);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }
    ctxRef.current?.closePath();
    document.documentElement.classList.remove('no-select');
  }, [drawing]);

  const draw = useCallback((e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const last = lastPointRef.current;
    const x = e.offsetX;
    const y = e.offsetY;
    if (!last) {
      ctx.moveTo(x, y);
      lastPointRef.current = { x, y };
      return;
    }
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    // If there is an abnormal jump (e.g., pen hover artifact), start a new segment to avoid spikes.
    if (dist > 48) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPointRef.current = { x, y };
  }, [drawing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const options = { passive: false };
    canvas.addEventListener('pointerdown', startDrawing, options);
    canvas.addEventListener('pointermove', draw, options);
    canvas.addEventListener('pointerup', stopDrawing, options);
    canvas.addEventListener('pointercancel', stopDrawing, options);
    canvas.addEventListener('lostpointercapture', stopDrawing, options);

    const preventDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener('touchstart', preventDefault, options);
    canvas.addEventListener('touchmove', preventDefault, options);

    // Drag & drop support on canvas
    const onDragOver = (e: DragEvent) => e.preventDefault();
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', handleDrop as any);

    // Global paste handler
    window.addEventListener('paste', handlePasteEvent as any);

    return () => {
      canvas.removeEventListener('pointerdown', startDrawing);
      canvas.removeEventListener('pointermove', draw);
      canvas.removeEventListener('pointerup', stopDrawing);
      canvas.removeEventListener('pointercancel', stopDrawing);
      canvas.removeEventListener('lostpointercapture', stopDrawing);
      canvas.removeEventListener('touchstart', preventDefault);
      canvas.removeEventListener('touchmove', preventDefault);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', handleDrop as any);
      window.removeEventListener('paste', handlePasteEvent as any);
    };
  }, [startDrawing, draw, stopDrawing]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      setError(null);
      setIsCanvasEmpty(true);
    }
  };

  const deleteOrRevert = () => {
    const snap = preGenSnapshotRef.current;
    if (snap) {
      drawDataUrl(snap);
      preGenSnapshotRef.current = null;
      setError(null);
    } else {
      // No snapshot; clear fully
      clearCanvas();
    }
  };

  // Toggle tool via keyboard (E = eraser, P = pen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
      if (e.key === 'p' || e.key === 'P') setTool('pen');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.fillStyle = 'white';
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(canvas, 0, 0);
    const url = tctx.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyCanvasToClipboard = async () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');
      if (!tctx) return;
      tctx.fillStyle = 'white';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, 0);
      const blob: Blob | null = await new Promise((resolve) => tmp.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) throw new Error('画像の準備に失敗しました');
      // @ts-ignore ClipboardItem may not be in lib DOM typing in some envs
      const item = new ClipboardItem({ 'image/png': blob });
      // @ts-ignore
      await navigator.clipboard.write([item]);
    } catch (e) {
      console.error(e);
      setError('クリップボードへのコピーに失敗しました。ブラウザの許可設定をご確認ください。');
    }
  };

  const generateImage = async (finalPrompt: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !finalPrompt) {
      setError('描画またはプロンプトがありません。');
      return;
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    const dataUrl = tempCanvas.toDataURL('image/png');
    const base64ImageData = dataUrl.split(',')[1];

    if (!base64ImageData) {
      setError('画像の書き出しに失敗しました。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageDataUrl: dataUrl, prompt: finalPrompt }),
      });

      if (res.status === 401) {
        setError('認証に失敗しました。ユーザー名/パスワードを確認してください。');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(`サーバーエラー: ${err?.error || res.statusText}`);
        return;
      }
      const json = await res.json();
      if (json.imageDataUrl) {
        drawDataUrl(json.imageDataUrl);
      } else {
        setError('画像の生成に失敗しました。');
      }
    } catch (e: any) {
      console.error(e);
      setError(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCanvasEmpty) {
      setError('スケッチまたは画像を用意してください（プロンプトは空でもOKです）');
      return;
    }
    const userPrompt = prompt.trim();
    // Snapshot current canvas before applying generation result
    const cvs = canvasRef.current;
    if (cvs) preGenSnapshotRef.current = cvs.toDataURL('image/png');

    const finalPrompt = buildPrompt({
      mode: selectedMode,
      useCase,
      tone,
      
      content: userPrompt,
    });

    generateImage(finalPrompt);
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-50 flex flex-col items-center p-3 md:p-4 text-[13px] md:text-[14px] lg:text-base">
      <main className="w-full max-w-6xl flex-1 flex flex-col gap-3 md:gap-4 overflow-hidden">
        <div
          className={`flex flex-col gap-4 transition-opacity duration-500 ${
            isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 w-full"
          >
            <div className="relative flex flex-col">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    // Prefer requestSubmit to trigger native form submission flow
                    formRef.current?.requestSubmit();
                  }
                }}
                placeholder="ここに補足があれば入力（空でもOK / 例: 注釈は太字で）"
                className="w-full p-3 pr-12 text-sm border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={2}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-2 rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                aria-label="プロンプトを送信"
              >
                {loading ? (
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                ) : (
                  <SendHorizontal className="w-5 h-5" />
                )}
              </button>
            </div>
            {/* Basic Auth field removed: origin-level auth handles this */}

            <fieldset className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs mb-1 text-gray-600">モード</div>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-5 gap-2 min-w-max">
                    {modes.map((m, idx) => (
                      <label
                        htmlFor={`mode-${idx}`}
                        key={m.key}
                        className="flex items-center p-3 rounded-lg border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 transition-colors cursor-pointer"
                      >
                        <input
                          type="radio"
                          id={`mode-${idx}`}
                          name="mode"
                          value={m.key}
                          checked={selectedMode === m.key}
                          onChange={(e) => setSelectedMode(e.target.value as Mode)}
                          onClick={(e) => {
                            if (selectedMode === m.key) {
                              e.preventDefault();
                              setSelectedMode(null);
                            }
                          }}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="ml-3 text-xs md:text-sm font-medium text-gray-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">用途</span>
                  <select
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value as UseCase)}
                    className="p-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="資料図">資料図</option>
                    <option value="Webサイト">Webサイト</option>
                    <option value="アプリUI">アプリUI</option>
                    <option value="プレゼン背景">プレゼン背景</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">トーン</span>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as Tone)}
                    className="p-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="フォーマル">フォーマル</option>
                    <option value="スタイリッシュ">スタイリッシュ</option>
                    <option value="サイバー">サイバー</option>
                    <option value="ポップ">ポップ</option>
                  </select>
                </label>
              </div>

              {/* 背景透過トグルは削除（常に白背景） */}
            </fieldset>
          </form>
        </div>

        <div className="relative w-full flex-1 border-2 border-gray-300 rounded-lg shadow-sm overflow-hidden bg-white">
          <canvas
            id="draw"
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onContextMenu={(e) => e.preventDefault()}
          ></canvas>
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-gray-500">
              <LoaderCircle className="w-8 h-8 animate-spin" />
              <p>画像を生成中...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4">
              <p className="text-red-500 text-center">{error}</p>
            </div>
          )}
          {!loading && !error && isCanvasEmpty && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">ここにスケッチを描いてください</p>
          )}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-full overflow-hidden border border-gray-200">
              <button
                onClick={() => setTool('pen')}
                className={`px-2 py-1 flex items-center gap-1 ${tool === 'pen' ? 'bg-white text-blue-600' : 'text-gray-700 hover:bg-white'}`}
                aria-label="ペンに切り替え"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">ペン</span>
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`px-2 py-1 flex items-center gap-1 ${tool === 'eraser' ? 'bg-white text-blue-600' : 'text-gray-700 hover:bg-white'}`}
                aria-label="消しゴムに切り替え"
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden sm:inline">消しゴム</span>
              </button>
            </div>
            <button
              onClick={pasteFromClipboard}
              className="px-2 py-1 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              aria-label="画像を貼り付け"
            >
              貼り付け
            </button>
            {!isCanvasEmpty && (
              <button
                onClick={downloadImage}
                className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                aria-label="画像をダウンロード"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            {!isCanvasEmpty && (
              <button
                onClick={copyCanvasToClipboard}
                className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                aria-label="クリップボードにコピー"
              >
                <Copy className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={deleteOrRevert}
              disabled={loading}
              className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              aria-label="キャンバスを消去"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
