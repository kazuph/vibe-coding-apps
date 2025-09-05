/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {
  Download,
  LoaderCircle,
  SendHorizontal,
  Trash2,
  Eraser,
  Pencil,
  PencilLine,
  Copy,
  Share2,
  // Undo2, // removed
  X,
  FilePlus2,
  Check,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import { buildPrompt, type Mode, type UseCase, type Tone, type Background } from './prompt';
import { addHistoryItem, getAllHistoryItems, deleteHistoryItem as deleteHistoryItemFromDB, clearHistory as clearHistoryFromDB, type HistoryRecord } from './db';

const modes: { key: Mode | 'none'; label: string }[] = [
  { key: 'none', label: 'なし' },
  { key: 'pencil_sketch', label: '鉛筆スケッチ' },
  { key: 'autoshape', label: 'オートシェイプ' },
  { key: 'figma_vectorize', label: 'Figma' },
  { key: 'photoreal', label: 'フォトリアル' },
  { key: 'kawaii_illustration', label: 'かわいいイラスト' },
  { key: '3d_cg', label: '3D CG' },
];

const colors = [
  { name: 'black', hex: '#000000', label: '黒' },
  { name: 'red', hex: '#E53E3E', label: '赤' },
  { name: 'blue', hex: '#3B82F6', label: '青' },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'pencil' | 'eraser'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(colors[0].hex);
  const [isUiHidden, setIsUiHidden] = useState(false);
  const uiVisibilityTimeoutRef = useRef<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [background, setBackground] = useState<Background>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyIdCounter = useRef<number>(Date.now());
  const [canvasHistory, setCanvasHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<number>>(new Set());
  const pressTimeoutRef = useRef<number | null>(null);
  const isLongPressHandled = useRef(false);
  const [canShare, setCanShare] = useState(false);
  const [isIPad, setIsIPad] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Draw helpers
  const drawImageFit = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    setIsCanvasEmpty(false);
  };

  const drawBlob = (blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        drawImageFit(img);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image from blob.'));
      };
      img.src = url;
    });
  };

  const drawDataUrl = (dataUrl: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        drawImageFit(img);
        resolve();
      };
      img.onerror = () => {
        console.error('Failed to load image from data URL.');
        resolve();
      };
      img.src = dataUrl;
    });
  };

  const addNewHistoryItem = async (dataUrl: string) => {
    const newId = historyIdCounter.current++;
    const newItem = { id: newId, dataUrl };
    setCanvasHistory(prev => [...prev, newItem]);
    try {
      await addHistoryItem(newItem);
    } catch (dbError) {
      console.error('Failed to save history item to DB:', dbError);
      setCanvasHistory(prev => prev.filter(item => item.id !== newId));
      setError('履歴の保存に失敗しました。');
    }
  };

  // Platform + history init
  useEffect(() => {
    (async () => {
      const items = await getAllHistoryItems();
      setCanvasHistory(items);
      if (items.length > 0) {
        const maxId = Math.max(...items.map(i => i.id));
        historyIdCounter.current = maxId + 1;
      }
    })();
    setIsIPad(/iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if (navigator.share && typeof (navigator as any).canShare === 'function') setCanShare(true);
  }, []);

  // Auto-clear error
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Auto-clear toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2800);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const prettyProvider = (p?: string): string => {
    if (!p) return '';
    if (p === 'openrouter') return 'OpenRouter';
    if (p === 'workers') return 'Cloudflare Workers';
    if (p === 'gas') return 'GAS';
    return p;
  };

  const handlePastedImage = async (imageBlob: Blob) => {
    try {
      await drawBlob(imageBlob);
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        await addNewHistoryItem(dataUrl);
      }
    } catch (e) {
      console.error(e);
      setError('画像の読み込みに失敗しました。');
    }
  };

  const handlePasteEvent = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handlePastedImage(file);
          break;
        }
      }
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      await handlePastedImage(files[0]);
      return;
    }
    const items = e.dataTransfer?.items;
    if (items) {
      for (const item of items) {
        if (item.kind === 'string' && item.type === 'text/uri-list') {
          item.getAsString(async (uri) => {
            try {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = uri;
              });
              drawImageFit(img);
              if (canvasRef.current) {
                const dataUrl = canvasRef.current.toDataURL('image/png');
                await addNewHistoryItem(dataUrl);
              }
            } catch {
              setError('URIからの画像読み込みに失敗しました。');
            }
          });
          break;
        }
      }
    }
  };

  const pasteFromClipboard = async () => {
    try {
      // @ts-ignore
      if (navigator.clipboard && navigator.clipboard.read) {
        // @ts-ignore
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              await handlePastedImage(blob);
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

  // Canvas init + resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;
    ctxRef.current = ctx;

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      let hasContent = false;
      if (tempCtx && canvas.width > 0 && canvas.height > 0) {
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCtx.drawImage(canvas, 0, 0);
        hasContent = true;
      }

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      if (hasContent) ctx.drawImage(tempCanvas, 0, 0, width, height);
    });
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (uiVisibilityTimeoutRef.current) clearTimeout(uiVisibilityTimeoutRef.current);
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
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.documentElement.classList.add('no-select');
    canvas.setPointerCapture(e.pointerId);
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = 24;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      if (tool === 'pen') {
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 5;
      } else if (tool === 'pencil') {
        ctx.strokeStyle = hexToRgba(selectedColor, 0.7);
        ctx.lineWidth = 2;
      }
    }
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
    lastPointRef.current = { x: e.offsetX, y: e.offsetY };
    setDrawing(true);
    setIsCanvasEmpty(false);
  }, [tool, selectedColor]);

  const stopDrawing = useCallback((e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    lastPointRef.current = null;
    uiVisibilityTimeoutRef.current = window.setTimeout(() => setIsUiHidden(false), 700);
    const canvas = canvasRef.current;
    if (canvas) canvas.releasePointerCapture(e.pointerId);
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
    const options = { passive: false } as const;
    canvas.addEventListener('pointerdown', startDrawing, options);
    canvas.addEventListener('pointermove', draw, options);
    canvas.addEventListener('pointerup', stopDrawing, options);
    canvas.addEventListener('pointercancel', stopDrawing, options);
    canvas.addEventListener('lostpointercapture', stopDrawing, options);
    const preventDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener('touchstart', preventDefault, options);
    canvas.addEventListener('touchmove', preventDefault, options);
    const onDragOver = (e: DragEvent) => e.preventDefault();
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', handleDrop as any);
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
      setSelectedHistoryIds(new Set());
    }
  };

  const handleClearHistory = () => {
    setConfirmation({
      message: 'すべての履歴を削除してキャンバスをクリアしますか？この操作は元に戻せません。',
      onConfirm: async () => {
        await clearHistoryFromDB();
        setCanvasHistory([]);
        clearCanvas();
      },
    });
  };

  const handleDeleteHistoryItem = (idToDelete: number) => {
    setConfirmation({
      message: 'この履歴を削除しますか？',
      onConfirm: async () => {
        const itemToDelete = canvasHistory.find(item => item.id === idToDelete);
        if (!itemToDelete) return;
        await deleteHistoryItemFromDB(idToDelete);
        setSelectedHistoryIds(prev => { const ns = new Set(prev); ns.delete(idToDelete); return ns; });
        const newHistory = canvasHistory.filter((item) => item.id !== idToDelete);
        const currentCanvasState = canvasRef.current?.toDataURL('image/png');
        setCanvasHistory(newHistory);
        if (currentCanvasState === itemToDelete.dataUrl) {
          if (newHistory.length > 0) await drawDataUrl(newHistory[newHistory.length - 1].dataUrl);
          else clearCanvas();
        }
      }
    });
  };

  const handleNewCanvas = () => {
    if (isCanvasEmpty) return;
    setConfirmation({
      message: 'キャンバスをクリアしますか？この操作は元に戻せません。',
      onConfirm: () => clearCanvas(),
    });
  };

  // Removed: undo (最新の画像削除) 機能

  // Keyboard tool toggle
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
    const url = tmp.toDataURL('image/png');
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

  const handleShare = async () => {
    if (!navigator.share) { setError('お使いのブラウザはこの機能をサポートしていません。'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const tctx = tmp.getContext('2d');
      if (!tctx) throw new Error('Canvas context could not be created.');
      tctx.fillStyle = 'white';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, 0);
      const blob: Blob | null = await new Promise((resolve) => tmp.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('画像の準備に失敗しました');
      const file = new File([blob], 'diagram.png', { type: 'image/png' });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: 'ダイアグラム', text: 'Gemini Co-Drawingで作成しました' });
      } else {
        setError('この画像を共有できません。');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') { console.error(e); setError(`共有に失敗しました: ${e.message}`); }
    }
  };

  const generateImage = async (finalPrompt: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !finalPrompt) { setError('描画またはプロンプトがありません。'); return; }
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/png');
    if (!dataUrl.includes(',')) { setError('画像の書き出しに失敗しました。'); return; }
    const selectedHistoryItems = canvasHistory.filter(item => selectedHistoryIds.has(item.id));
    const historyDataUrls = selectedHistoryItems.map(i => i.dataUrl);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, prompt: finalPrompt, historyDataUrls }),
      });
      if (res.status === 401) {
        setError('認証に失敗しました。ユーザー名/パスワードを確認してください。');
        setToast({ type: 'error', message: '認証に失敗しました' });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        const provider = prettyProvider((err as any)?.provider);
        const msg = (err as any)?.error || res.statusText || 'エラー';
        setError(`サーバーエラー: ${msg}`);
        setToast({ type: 'error', message: provider ? `${msg}（${provider}）` : `${msg}` });
        return;
      }
      const json = await res.json();
      if (json.imageDataUrl) {
        await drawDataUrl(json.imageDataUrl);
        if (canvasRef.current) {
          const newState = canvasRef.current.toDataURL('image/png');
          await addNewHistoryItem(newState);
        }
        const provider = prettyProvider(json.provider);
        // If previous stage failed, show its error + the succeeding provider
        if (json.prevError && json.prevError.message) {
          const prevFrom = prettyProvider(json.prevError.from);
          const msg = `${prevFrom} のエラー: ${json.prevError.message} → ${provider || '次段'}で生成`;
          setToast({ type: 'success', message: msg });
        } else {
          setToast({ type: 'success', message: provider ? `画像を生成しました（${provider}）` : '画像を生成しました' });
        }
      } else {
        setError('画像の生成に失敗しました。');
        setToast({ type: 'error', message: '画像の生成に失敗しました' });
      }
    } catch (e: any) {
      console.error(e);
      setError(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
      setSelectedHistoryIds(new Set());
    }
  };

  const handleHistoryClick = async (dataUrl: string) => {
    if (isLongPressHandled.current) { isLongPressHandled.current = false; return; }
    setSelectedHistoryIds(new Set());
    await drawDataUrl(dataUrl);
  };
  const handlePointerDown = (id: number) => {
    isLongPressHandled.current = false;
    pressTimeoutRef.current = window.setTimeout(() => {
      setSelectedHistoryIds(prev => { const ns = new Set(prev); if (ns.has(id)) ns.delete(id); else ns.add(id); return ns; });
      isLongPressHandled.current = true;
    }, 500);
  };
  const handlePointerUp = () => { if (pressTimeoutRef.current) { clearTimeout(pressTimeoutRef.current); pressTimeoutRef.current = null; } };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCanvasEmpty) { setError('スケッチまたは画像を用意してください（プロンプトは空でもOKです）'); return; }
    const userPrompt = prompt.trim();
    const finalPrompt = buildPrompt({ mode: selectedMode, useCase, tone, background, content: userPrompt });
    generateImage(finalPrompt);
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-50 flex justify-center p-3 md:p-4 text-[13px] md:text-[14px] lg:text-base">
      <div className="w-full max-w-7xl h-full flex flex-row items-start gap-3 md:gap-4">
        {/* History Sidebar */}
        <aside className="h-full w-24 md:w-32 flex-shrink-0">
          <div className="h-full bg-gray-100 border border-gray-200 rounded-lg p-2 flex flex-col">
            {canvasHistory.length > 0 ? (
              <>
                <div className="flex-1 overflow-y-auto">
                  <div className="flex flex-col-reverse justify-start items-center gap-2">
                    {canvasHistory.map((item, index) => (
                      <div key={item.id} className={`relative w-full group transition-all ${selectedHistoryIds.has(item.id) ? 'ring-2 ring-blue-500 rounded-md p-0.5' : ''}`}>
                        <button
                          onClick={() => handleHistoryClick(item.dataUrl)}
                          onPointerDown={() => handlePointerDown(item.id)}
                          onPointerUp={handlePointerUp}
                          onPointerLeave={handlePointerUp}
                          className="w-full p-0 bg-transparent border-none rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          aria-label={`履歴 ${index + 1} を読み込む`}
                        >
                          <img src={item.dataUrl} alt={`History step ${index + 1}`} className="w-full h-auto object-contain rounded-md border border-gray-300 shadow-sm transition-all hover:shadow-lg hover:border-blue-400 cursor-pointer" />
                        </button>
                        {selectedHistoryIds.has(item.id) && (
                          <div className="absolute top-1 left-1 p-0.5 bg-blue-500 text-white rounded-full pointer-events-none ring-1 ring-white">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteHistoryItem(item.id); }}
                          className="absolute top-1 right-1 p-0.5 bg-black/40 text-white rounded-full hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
                          aria-label={`履歴 ${index + 1} を削除`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleClearHistory}
                  className="mt-2 p-2 flex items-center justify-center gap-2 text-sm text-gray-600 hover:bg-gray-200 rounded-md transition-colors cursor-pointer"
                  aria-label="履歴をすべて削除"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>クリア</span>
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-gray-500 text-xs px-2">生成した画像はここに保存されます</div>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col gap-3 md:gap-4 overflow-hidden h-full">
          <div className={`flex flex-col gap-4 transition-opacity duration-500 ${isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
              <div className="relative flex flex-col">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); } }}
                  placeholder="ここに補足があれば入力（空でもOK / 例: 注釈は太字で）"
                  className="w-full p-3 pr-12 text-sm border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={1}
                  disabled={loading}
                />
                <button type="submit" disabled={loading} className="absolute top-1/2 right-2 -translate-y-1/2 p-2 rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" aria-label="プロンプトを送信">
                  {loading ? (<LoaderCircle className="w-5 h-5 animate-spin" />) : (<SendHorizontal className="w-5 h-5" />)}
                </button>
              </div>

              <fieldset className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs mb-1 text-gray-600">モード</div>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-7 gap-2 min-w-max">
                      {modes.map((m, idx) => (
                        <label htmlFor={`mode-${idx}`} key={m.key} className="flex items-center p-3 rounded-lg border border-gray-300 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 transition-colors cursor-pointer">
                          <input type="radio" id={`mode-${idx}`} name="mode" value={m.key}
                            checked={m.key === 'none' ? selectedMode === null : selectedMode === (m.key as Mode)}
                            onChange={(e) => { const val = e.target.value as Mode | 'none'; setSelectedMode(val === 'none' ? null : (val as Mode)); }}
                            className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                          <span className="ml-3 text-xs md:text-sm font-medium text-gray-700">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">用途</span>
                    <select value={useCase ?? ''} onChange={(e) => setUseCase(e.target.value ? (e.target.value as UseCase) : null)} className="p-2 border border-gray-300 rounded-lg bg-white">
                      <option value="">なし</option>
                      <option value="資料図">資料図</option>
                      <option value="Webサイト">Webサイト</option>
                      <option value="アプリUI">アプリUI</option>
                      <option value="プレゼン背景">プレゼン背景</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-600">トーン</span>
                    <select value={tone ?? ''} onChange={(e) => setTone(e.target.value ? (e.target.value as Tone) : null)} className="p-2 border border-gray-300 rounded-lg bg-white">
                      <option value="">なし</option>
                      <option value="フォーマル">フォーマル</option>
                      <option value="スタイリッシュ">スタイリッシュ</option>
                      <option value="サイバー">サイバー</option>
                      <option value="ポップ">ポップ</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 col-span-2 md:col-span-1">
                    <span className="text-xs text-gray-600">背景</span>
                    <select value={background} onChange={(e) => setBackground(e.target.value as Background)} className="p-2 border border-gray-300 rounded-lg bg-white">
                      <option value="default">操作なし</option>
                      <option value="white">白背景</option>
                      <option value="transparent">透明背景</option>
                    </select>
                  </label>
                </div>
              </fieldset>
            </form>
          </div>

          <div className="relative w-full flex-1 border-2 border-gray-300 rounded-lg shadow-sm overflow-hidden bg-white">
            <canvas id="draw" ref={canvasRef} className="w-full h-full cursor-crosshair" onContextMenu={(e) => e.preventDefault()}></canvas>
            {loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-gray-500">
                <LoaderCircle className="w-8 h-8 animate-spin" />
                <p>画像を生成中...</p>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 bg-red-100/80 backdrop-blur-sm flex items-center justify-center p-4">
                <p className="text-red-600 text-center">{error}</p>
              </div>
            )}
            {!loading && !error && isCanvasEmpty && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">ここにスケッチを描いてください</p>
            )}
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-full p-1 border border-gray-200">
                {colors.map((color) => (
                  <button key={color.name} onClick={() => setSelectedColor(color.hex)} className={`w-6 h-6 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${selectedColor === color.hex ? 'ring-2 ring-blue-500' : 'hover:scale-110'}`} style={{ backgroundColor: color.hex }} aria-label={color.label} />
                ))}
              </div>
              <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-full overflow-hidden border border-gray-200">
                <button onClick={() => setTool('pen')} className={`px-2 py-1 flex items-center gap-1 ${tool === 'pen' ? 'bg-white text-blue-600' : 'text-gray-700 hover:bg-white'}`} aria-label="ペンに切り替え">
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">ペン</span>
                </button>
                <button onClick={() => setTool('pencil')} className={`px-2 py-1 flex items-center gap-1 ${tool === 'pencil' ? 'bg-white text-blue-600' : 'text-gray-700 hover:bg-white'}`} aria-label="鉛筆に切り替え">
                  <PencilLine className="w-4 h-4" />
                  <span className="hidden sm:inline">鉛筆</span>
                </button>
                <button onClick={() => setTool('eraser')} className={`px-2 py-1 flex items-center gap-1 ${tool === 'eraser' ? 'bg-white text-blue-600' : 'text-gray-700 hover:bg-white'}`} aria-label="消しゴムに切り替え">
                  <Eraser className="w-4 h-4" />
                  <span className="hidden sm:inline">消しゴム</span>
                </button>
              </div>
              <button onClick={pasteFromClipboard} className="px-2 py-1 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" aria-label="画像を貼り付け">貼り付け</button>
              {!isCanvasEmpty && (
                <button onClick={downloadImage} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" aria-label="画像をダウンロード">
                  <Download className="w-5 h-5" />
                </button>
              )}
              {!isIPad && !isCanvasEmpty && (
                <button onClick={copyCanvasToClipboard} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" aria-label="クリップボードにコピー">
                  <Copy className="w-5 h-5" />
                </button>
              )}
              {!isCanvasEmpty && canShare && (
                <button onClick={handleShare} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" aria-label="共有">
                  <Share2 className="w-5 h-5" />
                </button>
              )}
              <button onClick={handleNewCanvas} disabled={loading || isCanvasEmpty} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50" aria-label="キャンバスをクリア">
                <FilePlus2 className="w-5 h-5" />
              </button>
              {/* Undo button removed as requested */}
            </div>
          </div>
        </main>
      </div>
      {confirmation && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <p className="text-lg text-gray-800 mb-4">{confirmation.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmation(null)} className="px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400">キャンセル</button>
              <button onClick={() => { confirmation.onConfirm(); setConfirmation(null); }} className="px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">実行</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60]">
          <div className={`min-w-[240px] max-w-[90vw] text-sm px-4 py-3 rounded-md shadow-lg border ${toast.type === 'success' ? 'bg-white text-gray-800 border-green-200' : 'bg-white text-gray-800 border-red-200'}`}>
            <div className="flex items-start gap-2">
              {toast.type === 'success' ? (
                <span className="mt-0.5 inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>
              ) : (
                <span className="mt-0.5 inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span>
              )}
              <div className="leading-snug">{toast.message}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
