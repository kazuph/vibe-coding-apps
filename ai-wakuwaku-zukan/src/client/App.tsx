import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, BookOpen, Sparkles, RefreshCw, Trash2, Home, Star, X, ChevronDown, Volume2 } from 'lucide-react';
import { useLocale } from './hooks/useLocale';
import { useTTS, type TTSSpeed } from './hooks/useTTS';

type GalleryItem = {
  id: string;
  prompt: string;
  imageUrl: string;
  category?: string;
  categoryId?: number;
  createdAt?: string;
  isFavorite?: boolean;
  isPreset?: boolean;
  nameJa?: string;
  nameEn?: string;
  nameHiragana?: string;
  nameKatakana?: string;
  nameRomaji?: string;
  descriptionJa?: string;
  descriptionEn?: string;
};

type Category = {
  id: number;
  name: string;
  nameEn: string;
  icon: string;
  isDefault: boolean;
};

const App = () => {
  const { locale, setLocale, t, isJa } = useLocale();
  const { speak, isSupported: ttsSupported, speed, setSpeed } = useTTS(locale);

  const [view, setView] = useState('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedItem, setGeneratedItem] = useState<GalleryItem | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [detailModal, setDetailModal] = useState<{
    showing: boolean;
    item: GalleryItem | null;
  }>({ showing: false, item: null });

  const [deleteModal, setDeleteModal] = useState<{
    showing: boolean;
    targetId: string | null;
    num1: number;
    num2: number;
    userAnswer: string;
    wrongAttempt: boolean;
  }>({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const recognitionRef = useRef<any>(null);

  // viewが変わったらスクロールをトップにリセット
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // 初期化
  useEffect(() => {
    fetchData();
    setupSpeechRecognition();
  }, []);

  // 言語が変わったら音声認識の言語も変更
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = locale === 'ja' ? 'ja-JP' : 'en-US';
    }
  }, [locale]);

  function setupSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'ja-JP';
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;

    recognitionRef.current.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setIsRecording(false);
    };
    recognitionRef.current.onerror = () => {
      setIsRecording(false);
      setError(t.micError);
    };
    recognitionRef.current.onend = () => setIsRecording(false);
  }

  const fetchData = async () => {
    try {
      const catRes = await fetch('/api/categories');
      if (catRes.ok) setCategories(await catRes.json());
    } catch (e) { console.error('Categories error:', e); }

    try {
      const histRes = await fetch('/api/history');
      if (histRes.ok) setGallery(await histRes.json());
    } catch (e) { console.error('History error:', e); }
  };

  const startRecording = () => {
    if (!recognitionRef.current) {
      setError(t.browserError);
      return;
    }
    setError(null);
    setTranscript('');
    setIsRecording(true);
    try { recognitionRef.current.start(); } catch (e) {
      console.error(e);
      setIsRecording(false);
    }
  };

  const generateImage = async (promptText: string) => {
    if (!promptText) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      if (!res.ok) throw new Error('Generation failed');

      const data = await res.json() as GalleryItem;
      setGeneratedItem(data);
      setGallery(prev => [data, ...prev]);

      const catRes = await fetch('/api/categories');
      if (catRes.ok) setCategories(await catRes.json());
    } catch {
      setError(t.generateError);
    } finally {
      setIsGenerating(false);
    }
  };

  const openDetailModal = (item: GalleryItem) => {
    setDetailModal({ showing: true, item });
  };

  const closeDetailModal = () => {
    setDetailModal({ showing: false, item: null });
    setShowCategoryPicker(false);
  };

  const toggleFavorite = async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}/favorite`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGallery(prev => prev.map(item =>
          item.id === id ? { ...item, isFavorite: data.isFavorite } : item
        ));
        if (detailModal.item?.id === id) {
          setDetailModal(prev => ({
            ...prev,
            item: prev.item ? { ...prev.item, isFavorite: data.isFavorite } : null
          }));
        }
      }
    } catch (e) { console.error('Failed to toggle favorite:', e); }
  };

  const updateCategory = async (id: string, categoryId: number) => {
    try {
      const res = await fetch(`/api/images/${id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId })
      });
      if (res.ok) {
        const data = await res.json();
        setGallery(prev => prev.map(item =>
          item.id === id ? { ...item, categoryId: data.categoryId, category: data.categoryName } : item
        ));
        if (detailModal.item?.id === id) {
          setDetailModal(prev => ({
            ...prev,
            item: prev.item ? { ...prev.item, categoryId: data.categoryId, category: data.categoryName } : null
          }));
        }
        setShowCategoryPicker(false);
      }
    } catch (e) { console.error('Failed to update category:', e); }
  };

  const handleDeleteClick = (id: string) => {
    const item = gallery.find(g => g.id === id);
    if (item?.isFavorite) {
      setError(`⭐ ${t.favoriteProtected}`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    const num1 = Math.floor(Math.random() * 90) + 10;
    const num2 = Math.floor(Math.random() * 8) + 2;
    setDeleteModal({ showing: true, targetId: id, num1, num2, userAnswer: '', wrongAttempt: false });
  };

  const handleDeleteConfirm = async () => {
    const correctAnswer = deleteModal.num1 * deleteModal.num2;
    const userNum = parseInt(deleteModal.userAnswer, 10);
    if (userNum === correctAnswer) {
      try {
        const res = await fetch(`/api/images/${deleteModal.targetId}`, { method: 'DELETE' });
        if (res.ok) {
          setGallery(prev => prev.filter(item => item.id !== deleteModal.targetId));
          setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
          if (detailModal.item?.id === deleteModal.targetId) closeDetailModal();
        } else {
          const data = await res.json();
          if (data.code === 'FAVORITE_PROTECTED') {
            setError(`⭐ ${t.favoriteProtected}`);
            setTimeout(() => setError(null), 3000);
          }
          setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
        }
      } catch {
        setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
      }
    } else {
      setDeleteModal(prev => ({ ...prev, userAnswer: '', wrongAttempt: true }));
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
  };

  // ヘルパー: アイテムの表示名を言語に応じて取得
  const displayName = (item: GalleryItem) => {
    if (isJa) return item.nameJa || item.prompt;
    return item.nameEn || item.nameJa || item.prompt;
  };

  // ヘルパー: テキストが日本語を含むか判定してTTS用lang決定
  const detectLang = (text: string): string => {
    // ひらがな・カタカナ・CJK漢字が含まれていれば日本語
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) return 'ja-JP';
    return 'en-US';
  };

  // ヘルパー: カテゴリ名を言語に応じて取得
  const catName = (cat: Category) => isJa ? cat.name : (cat.nameEn || cat.name);

  const estimateAlbumCategory = (promptText: string): Category | null => {
    const normalized = promptText.trim().toLowerCase();
    if (!normalized) return null;

    const keywordMap: Array<[string, string[]]> = [
      ['どうぶつ', ['ぞう', 'ねこ', 'いぬ', 'うさぎ', 'ぱんだ', 'きりん', 'らいおん', 'くま', 'ぺんぎん', 'さる']],
      ['のりもの', ['くるま', 'でんしゃ', 'ひこうき', 'ばす', 'ふね', 'じてんしゃ', 'しょうぼうしゃ', 'ぱとかー']],
      ['たべもの', ['りんご', 'いちご', 'ばなな', 'ぱん', 'けーき', 'らーめん', 'すし', 'かれー']],
      ['むし', ['むし', 'ちょうちょ', 'かぶとむし', 'くわがた', 'とんぼ', 'あり']],
      ['おはな', ['はな', 'さくら', 'ひまわり', 'ちゅーりっぷ', 'たんぽぽ']],
      ['しぜん', ['やま', 'うみ', 'にじ', 'たいよう', 'つき', 'ほし']],
      ['うちゅう', ['うちゅう', 'ろけっと', 'ちきゅう', 'かせい', 'ぎんが']],
      ['がっこう', ['えんぴつ', 'のーと', 'らんどせる', 'つくえ', 'がっこう']],
    ];

    for (const [categoryName, keywords] of keywordMap) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        return categories.find((category) => category.name === categoryName) ?? null;
      }
    }

    return categories.find((category) => category.name === 'その他') ?? null;
  };

  const albumLabel = (categoryName?: string | null) => {
    if (!categoryName) return isJa ? '...' : '...';
    return isJa ? `${categoryName}の ずかん` : categoryName;
  };

  // ヘルパー: カテゴリ名をIDから取得
  const catNameById = (item: GalleryItem) => {
    const cat = categories.find(c => c.id === item.categoryId);
    if (cat) return catName(cat);
    return item.category || (isJa ? 'その他' : 'Others');
  };

  // 読み方サマリー（カード用）
  const readingSummary = (item: GalleryItem) => {
    const parts: string[] = [];
    if (item.nameEn) parts.push(item.nameEn);
    if (item.nameKatakana && !isJa) parts.push(item.nameKatakana);
    if (item.nameHiragana && isJa && item.nameJa !== item.nameHiragana) parts.push(item.nameHiragana);
    if (item.nameRomaji) parts.push(item.nameRomaji);
    return parts.join(' / ');
  };

  // カテゴリごとのアイテム数を計算
  const countByCategory = (catId: number) => {
    return gallery.filter(item => item.categoryId === catId).length;
  };

  // TTSボタンコンポーネント
  const TTSButton = ({ text, lang, size = 'sm' }: { text: string; lang?: string; size?: 'sm' | 'md' | 'lg' }) => {
    if (!ttsSupported) return null;
    const sizeClass = size === 'lg' ? 'p-3' : size === 'md' ? 'p-2' : 'p-1.5';
    const iconSize = size === 'lg' ? 22 : size === 'md' ? 18 : 14;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); speak(text, lang); }}
        className={`${sizeClass} bg-blue-500/20 text-blue-500 rounded-full hover:bg-blue-500/30 transition-colors flex-shrink-0`}
        aria-label="Read aloud"
      >
        <Volume2 size={iconSize} />
      </button>
    );
  };

  // 言語切替トグル
  const LanguageToggle = () => (
    <div className="flex bg-stone-200 rounded-full p-0.5">
      <button
        onClick={() => setLocale('ja')}
        className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${locale === 'ja' ? 'bg-stone-800 text-white' : 'text-stone-500'}`}
      >
        JP
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${locale === 'en' ? 'bg-stone-800 text-white' : 'text-stone-500'}`}
      >
        EN
      </button>
    </div>
  );

  // TTSスピードコントロール
  const TTSSpeedControl = () => {
    if (!ttsSupported) return null;
    const speeds: { key: TTSSpeed; label: string }[] = [
      { key: 'slow', label: t.ttsSlow },
      { key: 'normal', label: t.ttsNormal },
      { key: 'fast', label: t.ttsFast },
    ];
    return (
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-stone-100 px-4 py-2.5">
        <span className="text-sm text-stone-600 flex items-center gap-1.5">
          <Volume2 size={16} className="text-blue-500" />
          {t.ttsSpeed}:
        </span>
        <div className="flex gap-1">
          {speeds.map(s => (
            <button
              key={s.key}
              onClick={() => setSpeed(s.key)}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${speed === s.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const Card = ({ children, onClick, className = '' }: any) => (
    <div
      onClick={onClick}
      className={`bg-white rounded-3xl shadow-sm border border-stone-100 p-6 cursor-pointer active:scale-95 transition-all transform hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );

  const ImageCard = ({ item, showCategory = false, compact = false }: { item: GalleryItem; showCategory?: boolean; compact?: boolean }) => (
    <div
      onClick={() => openDetailModal(item)}
      className="bg-white rounded-3xl overflow-hidden border border-stone-100 shadow-sm relative group hover:shadow-lg transition-all cursor-pointer"
    >
      <div className="relative aspect-square">
        <img src={item.imageUrl} alt={displayName(item)} className="w-full h-full object-cover" />
        {item.isFavorite && (
          <div className="absolute top-2 right-2 bg-yellow-400 p-1.5 rounded-full shadow-md">
            <Star size={14} className="text-white fill-white" />
          </div>
        )}
        {item.isPreset && (
          <div className="absolute top-2 left-2 bg-blue-500 px-2 py-0.5 rounded-full shadow-md">
            <span className="text-sm font-bold text-white">{t.presetBadge}</span>
          </div>
        )}
      </div>
      <div className={`${compact ? 'p-2' : 'p-3'} bg-white relative z-10`}>
        <div className="flex items-center justify-between gap-1">
          <p className={`font-bold ${compact ? 'text-xs text-center flex-1' : 'text-sm'} text-stone-800 truncate`}>
            {displayName(item)}
          </p>
          {!compact && ttsSupported && (
            <TTSButton text={displayName(item)} lang={detectLang(displayName(item))} />
          )}
        </div>
        {!compact && (
          <>
            {readingSummary(item) && (
              <p className="text-sm text-blue-500 mt-0.5 truncate">{readingSummary(item)}</p>
            )}
            {showCategory && (
              <span className="inline-block bg-stone-100 text-stone-500 text-xs px-2 py-0.5 rounded-full mt-1">
                {catNameById(item)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-24 md:pb-0 md:pl-24">
      {/* Header (Mobile) */}
      <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center md:hidden">
        <h1
          className="text-xl font-bold text-stone-700 flex items-center gap-2 cursor-pointer"
          onClick={() => setView('home')}
        >
          <BookOpen className="text-stone-500" />
          {t.appName}
        </h1>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {view !== 'home' && (
            <button onClick={() => setView('home')} className="p-2 bg-stone-100 rounded-full">
              <Home size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Desktop Sidebar Navigation */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-24 bg-white border-r border-stone-200 items-center py-6 z-20">
        <div className="mb-4 p-2 bg-stone-100 rounded-xl">
          <BookOpen size={32} className="text-stone-700" />
        </div>
        <div className="mb-4">
          <LanguageToggle />
        </div>
        <div className="flex flex-col gap-4 w-full px-2">
          <button onClick={() => setView('home')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'home' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
            <Home size={24} />
            <span className="text-sm font-bold mt-1">{t.navHome}</span>
          </button>
          <button onClick={() => setView('create')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'create' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
            <Mic size={24} />
            <span className="text-sm font-bold mt-1">{t.navCreate}</span>
          </button>
          <button onClick={() => setView('gallery')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'gallery' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
            <BookOpen size={24} />
            <span className="text-sm font-bold mt-1">{t.navGallery}</span>
          </button>
        </div>
      </nav>

      <main className="w-full px-4 md:px-6">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 mb-6 rounded-2xl text-sm font-medium border border-red-100 flex items-center gap-2">
            <span className="text-xl">🥺</span> {error}
          </div>
        )}

        {/* HOME VIEW */}
        {view === 'home' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center md:text-left mb-8">
              <h2 className="text-2xl font-bold text-stone-800">{t.greeting}</h2>
              <p className="text-stone-500 font-medium mt-1">{t.greetingSub}</p>
            </div>

            {/* CTA Card */}
            <div
              onClick={() => setView('create')}
              className="bg-stone-800 text-white rounded-3xl shadow-lg p-6 cursor-pointer active:scale-95 transition-all transform hover:shadow-xl hover:bg-stone-900 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Mic size={120} />
              </div>
              <div className="flex items-center gap-6 relative z-10 p-4">
                <div className="bg-stone-700 p-4 rounded-full text-white shadow-lg">
                  <Mic size={32} />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold mb-1">{t.ctaTitle}</h2>
                  <p className="text-stone-300">{t.ctaSub}</p>
                </div>
              </div>
              {/* NanoBanana2 Badge */}
              <div className="absolute top-4 right-4 bg-green-500 px-2.5 py-1 rounded-full">
                <span className="text-sm font-bold text-white">⚡ {t.modelBadge}</span>
              </div>
            </div>

            {/* Categories */}
            <div>
              <h3 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                <Sparkles size={20} className="text-yellow-500" />
                {t.categories}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map(cat => (
                  <Card key={cat.id} onClick={() => { setSelectedCategory(cat); setView('category'); }} className="hover:border-stone-300">
                    <div className="text-center">
                      <span className="text-4xl mb-3 block">{cat.icon}</span>
                      <h3 className="font-bold text-stone-700">{catName(cat)}</h3>
                      {cat.nameEn && isJa && (
                        <p className="text-sm text-blue-500 mt-0.5">{cat.nameEn}</p>
                      )}
                      {countByCategory(cat.id) > 0 && (
                        <span className="inline-block bg-blue-500 text-white text-sm font-bold px-2 py-0.5 rounded-full mt-1.5">
                          {countByCategory(cat.id)}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Recent */}
            <div className="bg-white rounded-3xl p-6 border border-stone-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-stone-700">{t.recentItems}</h3>
                <button onClick={() => setView('gallery')} className="text-sm text-stone-400 hover:text-stone-600">{t.viewAll} &rarr;</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                {gallery.slice(0, 5).map(item => (
                  <div key={item.id} className="min-w-[140px] md:min-w-[180px] snap-start">
                    <ImageCard item={item} compact={false} />
                  </div>
                ))}
                {gallery.length === 0 && <p className="text-sm text-stone-400 italic">{t.noneYet}</p>}
              </div>
            </div>

            {/* TTS Speed Control */}
            <TTSSpeedControl />
          </div>
        )}

        {/* CREATE VIEW */}
        {view === 'create' && (
          <div className="flex flex-col items-center gap-8 pt-8 animate-in slide-in-from-bottom-8 duration-500 w-full max-w-2xl mx-auto">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">{t.createTitle}</h2>
              <p className="text-stone-500">{t.createSub}</p>
            </div>

            <button
              onClick={isRecording ? () => recognitionRef.current?.stop() : startRecording}
              disabled={isGenerating}
              className={`w-40 h-40 rounded-full flex items-center justify-center shadow-xl transition-all ${
                isRecording ? 'bg-red-500 animate-pulse scale-105 ring-4 ring-red-200' : 'bg-stone-800 hover:bg-stone-900 hover:scale-105'
              } ${isGenerating ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {isRecording ? <MicOff size={64} color="white" /> : <Mic size={64} color="white" />}
            </button>

            <div className="w-full">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t.inputPlaceholder}
                  value={transcript}
                  onChange={(e) => {
                    setTranscript(e.target.value);
                    if (generatedItem) setGeneratedItem(null);
                  }}
                  disabled={isGenerating || isRecording}
                  className="flex-1 px-4 py-3 rounded-full border-2 border-stone-200 focus:border-stone-400 focus:outline-none text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
                    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
                    if (e.key === 'Enter' && transcript.trim() && !isGenerating) generateImage(transcript);
                  }}
                />
                <button
                  onClick={() => transcript.trim() && generateImage(transcript)}
                  disabled={!transcript.trim() || isGenerating}
                  className="px-6 py-3 bg-stone-800 text-white rounded-full font-bold hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {t.createBtn}
                </button>
              </div>
              {transcript.trim() && !isGenerating && (
                <div className="mt-4 rounded-[2rem] border border-stone-200 bg-white px-5 py-4 shadow-sm">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-400">{t.albumLabel}</p>
                  <p className="mt-2 text-sm text-stone-500">{t.goingToAlbum}</p>
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <p className="text-xl font-bold text-stone-800">
                      {albumLabel(catName(estimateAlbumCategory(transcript) ?? categories.find((category) => category.name === 'その他') ?? {
                        id: -1,
                        name: 'その他',
                        nameEn: 'Others',
                        icon: '📦',
                        isDefault: false,
                      }))}
                    </p>
                    <button
                      onClick={() => setTranscript('')}
                      className="bg-stone-100 text-stone-500 px-5 py-2 rounded-full font-bold text-sm hover:bg-stone-200 shrink-0"
                    >
                      {t.wrongInput}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {isGenerating && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-stone-200 border-t-stone-800" />
                <p className="text-lg font-bold text-stone-600 animate-pulse">{t.generating}</p>
              </div>
            )}

            {generatedItem && !isGenerating && (
              <div className="w-full animate-in zoom-in duration-500">
                <Card className="p-3 overflow-hidden border-stone-200 bg-white">
                  <div className="px-3 pt-3 text-center">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-400">{t.albumLabel}</p>
                    <p className="mt-2 text-sm text-stone-500">{t.generatedForAlbum}</p>
                    <p className="mt-1 text-2xl font-bold text-stone-800">{albumLabel(catNameById(generatedItem))}</p>
                  </div>
                  <div className="px-3 pt-5 pb-3 text-center">
                    <p className="text-3xl font-bold text-stone-800">「{generatedItem.prompt}」</p>
                  </div>
                  <img src={generatedItem.imageUrl} alt={generatedItem.prompt} className="w-full h-auto rounded-2xl shadow-inner" />
                  <div className="p-6 text-center">
                    <p className="font-bold text-xl text-stone-800 mb-2">{t.done}</p>
                    <div className="flex justify-center gap-4 mt-4">
                      <button
                        onClick={() => { setGeneratedItem(null); setTranscript(''); }}
                        className="bg-stone-100 text-stone-600 px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-stone-200"
                      >
                        <RefreshCw size={16} /> {t.retry}
                      </button>
                      <button
                        onClick={() => setView('gallery')}
                        className="bg-yellow-400 text-stone-900 px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-yellow-500 shadow-sm"
                      >
                        <BookOpen size={16} /> {t.viewGallery}
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* CATEGORY VIEW */}
        {view === 'category' && selectedCategory && (
          <div className="animate-in fade-in duration-300 pt-6">
            <button onClick={() => setView('home')} className="mb-6 text-stone-400 hover:text-stone-600 flex items-center gap-1 font-bold">
              &larr; {t.back}
            </button>
            <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-stone-800">
              <span className="text-4xl">{selectedCategory.icon}</span> {catName(selectedCategory)}
            </h2>

            {gallery.filter(item => item.categoryId === selectedCategory.id).length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-stone-100 border-dashed">
                <p className="text-stone-400">{t.emptyCat}</p>
                <button onClick={() => setView('create')} className="mt-4 text-stone-600 underline font-bold">{t.tryCreate}</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery
                  .filter(item => item.categoryId === selectedCategory.id)
                  .map(item => (
                    <ImageCard key={item.id} item={item} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* GALLERY VIEW */}
        {view === 'gallery' && (
          <div className="animate-in fade-in duration-300 pt-6">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-stone-700">
              <BookOpen size={28} /> {t.galleryTitle}
            </h2>
            {gallery.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-stone-100 border-dashed">
                <p className="text-stone-400 font-medium">{t.noImages}</p>
                <button onClick={() => setView('create')} className="mt-4 bg-stone-800 text-white px-6 py-2 rounded-full font-bold hover:bg-stone-700">{t.letsStart}</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery.map(item => (
                  <ImageCard key={item.id} item={item} showCategory />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Footer Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-stone-100 px-6 py-3 flex justify-between items-center z-20 pb-safe">
        <NavButton icon={<Home size={24} />} label={t.navHome} active={view === 'home'} onClick={() => setView('home')} />
        <NavButton icon={<Mic size={24} />} label={t.navCreate} active={view === 'create'} onClick={() => setView('create')} />
        <NavButton icon={<BookOpen size={24} />} label={t.navGallery} active={view === 'gallery'} onClick={() => setView('gallery')} />
      </nav>

      {/* 削除確認モーダル */}
      {deleteModal.showing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-stone-800 text-center mb-2">🧮 {t.deleteQuestion}</h3>
            <p className="text-stone-500 text-center text-sm mb-6">{t.deleteHint}</p>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-stone-800 tracking-wider">
                {deleteModal.num1} × {deleteModal.num2} = ?
              </p>
            </div>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t.answer}
              value={deleteModal.userAnswer}
              onChange={(e) => setDeleteModal(prev => ({ ...prev, userAnswer: e.target.value, wrongAttempt: false }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && deleteModal.userAnswer) handleDeleteConfirm(); }}
              className={`w-full px-4 py-4 text-center text-2xl font-bold rounded-2xl border-2 ${
                deleteModal.wrongAttempt ? 'border-red-300 bg-red-50' : 'border-stone-200 focus:border-stone-400'
              } focus:outline-none`}
              autoFocus
            />
            {deleteModal.wrongAttempt && (
              <p className="text-red-500 text-center mt-3 font-medium">🙅 {t.wrongAnswer}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={handleDeleteCancel} className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 rounded-full font-bold hover:bg-stone-200 transition-colors">
                {t.cancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={!deleteModal.userAnswer}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {detailModal.showing && detailModal.item && (
        <div className="fixed inset-0 bg-stone-50 flex flex-col z-50 animate-in fade-in duration-200 overflow-y-auto">
          {/* ヘッダー */}
          <div className="flex justify-between items-center p-4 bg-stone-50 sticky top-0 z-10 border-b border-stone-200">
            <button onClick={closeDetailModal} className="p-2 bg-stone-200 text-stone-700 rounded-full hover:bg-stone-300 transition-colors">
              <X size={24} />
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => toggleFavorite(detailModal.item!.id)}
                className={`p-2 rounded-full transition-colors ${
                  detailModal.item.isFavorite ? 'bg-yellow-400 text-white' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                <Star size={24} className={detailModal.item.isFavorite ? 'fill-white' : ''} />
              </button>
              <button
                onClick={() => handleDeleteClick(detailModal.item!.id)}
                className="p-2 bg-stone-200 text-stone-700 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                <Trash2 size={24} />
              </button>
            </div>
          </div>

          {/* 画像 */}
          <div className="flex items-center justify-center p-4 min-h-[40vh] bg-stone-100">
            <img
              src={detailModal.item.imageUrl}
              alt={displayName(detailModal.item)}
              className="max-w-full max-h-[50vh] object-contain rounded-2xl shadow-lg"
            />
          </div>

          {/* メイン名前 + TTS */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold text-stone-800">{displayName(detailModal.item)}</h3>
              <TTSButton text={displayName(detailModal.item)} lang={detectLang(displayName(detailModal.item))} size="lg" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-base font-semibold text-stone-500">
              {detailModal.item.nameHiragana && detailModal.item.nameHiragana !== displayName(detailModal.item) && (
                <span className="rounded-full bg-white px-3 py-1.5 border border-stone-200">
                  {detailModal.item.nameHiragana}
                </span>
              )}
              {detailModal.item.nameKatakana && detailModal.item.nameKatakana !== detailModal.item.nameHiragana && (
                <span className="rounded-full bg-white px-3 py-1.5 border border-stone-200">
                  {detailModal.item.nameKatakana}
                </span>
              )}
              {detailModal.item.nameEn && detailModal.item.nameEn !== displayName(detailModal.item) && (
                <span className="rounded-full bg-white px-3 py-1.5 border border-stone-200">
                  {detailModal.item.nameEn}
                </span>
              )}
              {detailModal.item.nameRomaji && (
                <span className="rounded-full bg-white px-3 py-1.5 border border-stone-200 lowercase">
                  {detailModal.item.nameRomaji}
                </span>
              )}
            </div>
          </div>

          {/* 説明セクション */}
          <div className="mx-6 mb-4 bg-white rounded-2xl px-4 py-3 border border-stone-200 shadow-sm">
            <span className="text-sm font-bold text-stone-400">{t.description}</span>
            <p className="text-stone-700 text-base mt-1">
              {(isJa ? detailModal.item.descriptionJa : detailModal.item.descriptionEn) || t.noDescription}
            </p>
            {(isJa ? detailModal.item.descriptionJa : detailModal.item.descriptionEn) && (
              <div className="mt-2">
                <TTSButton
                  text={(isJa ? detailModal.item.descriptionJa : detailModal.item.descriptionEn)!}
                  lang={detectLang((isJa ? detailModal.item.descriptionJa : detailModal.item.descriptionEn) || '')}
                  size="lg"
                />
              </div>
            )}
          </div>

          {/* カテゴリーピッカー */}
          <div className="px-6 pb-8">
            <div className="relative inline-block">
              <button
                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                className="flex items-center gap-1 bg-stone-200 text-stone-700 text-base px-4 py-2 rounded-full hover:bg-stone-300 transition-colors"
              >
                <span>{catNameById(detailModal.item)}</span>
                <ChevronDown size={14} className={`transition-transform ${showCategoryPicker ? 'rotate-180' : ''}`} />
              </button>
              {showCategoryPicker && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg overflow-hidden min-w-[160px] animate-in slide-in-from-bottom-2 duration-200">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => updateCategory(detailModal.item!.id, cat.id)}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-stone-100 transition-colors flex items-center gap-2 ${
                        cat.id === detailModal.item?.categoryId ? 'bg-stone-100 font-bold' : ''
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{catName(cat)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TTS Speed Control */}
          <div className="px-6 pb-8">
            <TTSSpeedControl />
          </div>
        </div>
      )}
    </div>
  );
};

const NavButton = ({ icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-colors w-16 ${active ? 'text-stone-900' : 'text-stone-300'}`}
  >
    <div className={`p-1 rounded-xl transition-all ${active ? 'bg-stone-100 transform -translate-y-1' : ''}`}>
      {icon}
    </div>
    <span className="text-sm font-bold">{label}</span>
  </button>
);

export default App;
