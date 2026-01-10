import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, BookOpen, Sparkles, RefreshCw, Trash2, Home, Star, X, ChevronDown } from 'lucide-react';

// 画像アイテムの型定義
type GalleryItem = {
  id: string;
  prompt: string;
  imageUrl: string;
  category?: string;
  categoryId?: number;
  createdAt?: string;
  isFavorite?: boolean;
};

const App = () => {
  const [view, setView] = useState('home'); // 'home', 'category', 'create', 'gallery'
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 詳細モーダル用のstate
  const [detailModal, setDetailModal] = useState<{
    showing: boolean;
    item: GalleryItem | null;
  }>({ showing: false, item: null });

  // 削除確認モーダル用のstate
  const [deleteModal, setDeleteModal] = useState<{
    showing: boolean;
    targetId: string | null;
    num1: number;  // 2桁の数
    num2: number;  // 1桁の数
    userAnswer: string;
    wrongAttempt: boolean;
  }>({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });

  // カテゴリーピッカー用のstate
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const recognitionRef = useRef<any>(null);

  // viewが変わったらスクロールをトップにリセット
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // 初期化
  useEffect(() => {
    fetchData();

    // 音声認識セットアップ
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
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
          setError("おみみが きこえなかったみたい。もういちど おねがい。");
        };
        
        recognitionRef.current.onend = () => {
             setIsRecording(false);
        }
      }
    }
  }, []);

  const fetchData = async () => {
    // Categories
    try {
      const catRes = await fetch('/api/categories');
      if (catRes.ok) {
          const data = await catRes.json();
          setCategories(data);
      } else {
          console.error("Categories fetch failed:", catRes.status);
      }
    } catch (e) {
      console.error("Categories error:", e);
    }

    // History
    try {
      const histRes = await fetch('/api/history');
      if (histRes.ok) {
          setGallery(await histRes.json());
      } else {
          console.error("History fetch failed:", histRes.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) {
      setError("このブラウザでは おはなし できないみたい。");
      return;
    }
    setError(null);
    setTranscript("");
    setIsRecording(true);
    try {
        recognitionRef.current.start();
    } catch(e) {
        // すでに開始されている場合などのエラーハンドリング
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: promptText })
      });

      if (!res.ok) throw new Error('AIが つくるのに しっぱいしちゃった。');

      const data = await res.json();
      setGeneratedImage(data.imageUrl);
      setGallery(prev => [data, ...prev]);
      
      // カテゴリーを再取得（新しいカテゴリーが増えている可能性があるため）
      const catRes = await fetch('/api/categories');
      if (catRes.ok) setCategories(await catRes.json());

    } catch (err) {
      setError("ごめんね、うまく かけなかったよ。もういちど やってみて！");
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 詳細モーダルを開く
  const openDetailModal = (item: GalleryItem) => {
    setDetailModal({ showing: true, item });
  };

  // 詳細モーダルを閉じる
  const closeDetailModal = () => {
    setDetailModal({ showing: false, item: null });
    setShowCategoryPicker(false);
  };

  // お気に入りトグル
  const toggleFavorite = async (id: string) => {
    try {
      const res = await fetch(`/api/images/${id}/favorite`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGallery(prev => prev.map(item =>
          item.id === id ? { ...item, isFavorite: data.isFavorite } : item
        ));
        // 詳細モーダルのアイテムも更新
        if (detailModal.item?.id === id) {
          setDetailModal(prev => ({
            ...prev,
            item: prev.item ? { ...prev.item, isFavorite: data.isFavorite } : null
          }));
        }
      }
    } catch (e) {
      console.error('Failed to toggle favorite:', e);
    }
  };

  // カテゴリー変更
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
        // 詳細モーダルのアイテムも更新
        if (detailModal.item?.id === id) {
          setDetailModal(prev => ({
            ...prev,
            item: prev.item ? { ...prev.item, categoryId: data.categoryId, category: data.categoryName } : null
          }));
        }
        setShowCategoryPicker(false);
      }
    } catch (e) {
      console.error('Failed to update category:', e);
    }
  };

  // 削除ボタンをクリック時 - かけ算問題を出題
  const handleDeleteClick = (id: string) => {
    // お気に入りチェック
    const item = gallery.find(g => g.id === id);
    if (item?.isFavorite) {
      setError('⭐ おきにいりの えは けせないよ！');
      setTimeout(() => setError(null), 3000);
      return;
    }
    // 2桁の数 (10-99) と 1桁の数 (2-9) を生成
    const num1 = Math.floor(Math.random() * 90) + 10; // 10-99
    const num2 = Math.floor(Math.random() * 8) + 2;   // 2-9
    setDeleteModal({
      showing: true,
      targetId: id,
      num1,
      num2,
      userAnswer: '',
      wrongAttempt: false
    });
  };

  // かけ算の答えを確認して削除
  const handleDeleteConfirm = async () => {
    const correctAnswer = deleteModal.num1 * deleteModal.num2;
    const userNum = parseInt(deleteModal.userAnswer, 10);

    if (userNum === correctAnswer) {
      // 正解 - API呼び出しで削除実行
      try {
        const res = await fetch(`/api/images/${deleteModal.targetId}`, { method: 'DELETE' });
        if (res.ok) {
          const newGallery = gallery.filter(item => item.id !== deleteModal.targetId);
          setGallery(newGallery);
          setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
          // 詳細モーダルも閉じる
          if (detailModal.item?.id === deleteModal.targetId) {
            closeDetailModal();
          }
        } else {
          const data = await res.json();
          if (data.code === 'FAVORITE_PROTECTED') {
            setError('⭐ おきにいりの えは けせないよ！');
            setTimeout(() => setError(null), 3000);
          }
          setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
        }
      } catch (e) {
        console.error('Failed to delete:', e);
        setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
      }
    } else {
      // 不正解
      setDeleteModal(prev => ({ ...prev, userAnswer: '', wrongAttempt: true }));
    }
  };

  // 削除モーダルを閉じる
  const handleDeleteCancel = () => {
    setDeleteModal({ showing: false, targetId: null, num1: 0, num2: 0, userAnswer: '', wrongAttempt: false });
  };

  const Card = ({ children, onClick, className = "" }: any) => (
    <div
      onClick={onClick}
      className={`bg-white rounded-3xl shadow-sm border border-stone-100 p-6 cursor-pointer active:scale-95 transition-all transform hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );

  // 統一ImageCardコンポーネント - すべてのビューで使用
  const ImageCard = ({ item, showCategory = false, compact = false }: { item: GalleryItem; showCategory?: boolean; compact?: boolean }) => (
    <div
      onClick={() => openDetailModal(item)}
      className={`bg-white rounded-3xl overflow-hidden border border-stone-100 shadow-sm relative group hover:shadow-lg transition-all cursor-pointer ${compact ? '' : ''}`}
    >
      <div className={`relative ${compact ? 'aspect-square' : 'aspect-square'}`}>
        <img src={item.imageUrl} alt={item.prompt} className="w-full h-full object-cover" />
        {item.isFavorite && (
          <div className="absolute top-2 right-2 bg-yellow-400 p-1.5 rounded-full shadow-md">
            <Star size={14} className="text-white fill-white" />
          </div>
        )}
      </div>
      <div className={`${compact ? 'p-2' : 'p-4'} bg-white relative z-10`}>
        <p className={`font-bold ${compact ? 'text-xs text-center' : 'text-lg'} text-stone-800 truncate`}>{item.prompt}</p>
        {showCategory && !compact && (
          <span className="inline-block bg-stone-100 text-stone-500 text-xs px-2 py-1 rounded-full mt-1">
            {categories.find(c => c.id === item.categoryId)?.name || item.category || 'その他'}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-24 md:pb-0 md:pl-24">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center md:hidden">
        <h1 
          className="text-xl font-bold text-stone-700 flex items-center gap-2 cursor-pointer"
          onClick={() => setView('home')}
        >
          <BookOpen className="text-stone-500" />
          ワクワクずかん
        </h1>
        {view !== 'home' && (
          <button onClick={() => setView('home')} className="p-2 bg-stone-100 rounded-full">
            <Home size={20} />
          </button>
        )}
      </header>

      {/* Desktop/iPad Sidebar Navigation */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-24 bg-white border-r border-stone-200 items-center py-8 z-20">
         <div className="mb-8 p-2 bg-stone-100 rounded-xl">
             <BookOpen size={32} className="text-stone-700" />
         </div>
         <div className="flex flex-col gap-6 w-full px-2">
            <button onClick={() => setView('home')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'home' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
                <Home size={24} />
                <span className="text-[10px] font-bold mt-1">ホーム</span>
            </button>
            <button onClick={() => setView('create')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'create' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
                <Mic size={24} />
                <span className="text-[10px] font-bold mt-1">つくる</span>
            </button>
            <button onClick={() => setView('gallery')} className={`flex flex-col items-center p-3 rounded-2xl transition-all ${view === 'gallery' ? 'bg-stone-100 text-stone-900' : 'text-stone-400 hover:bg-stone-50'}`}>
                <BookOpen size={24} />
                <span className="text-[10px] font-bold mt-1">ずかん</span>
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
               <h2 className="text-2xl font-bold text-stone-800">こんにちは！</h2>
               <p className="text-stone-500 font-medium mt-1">きょうは なにを みつける？</p>
            </div>

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
                <div>
                  <h2 className="text-xl font-bold mb-1">おはなしして つくる</h2>
                  <p className="text-stone-300">こえを イラストに するよ</p>
                </div>
              </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-stone-700 mb-4 flex items-center gap-2">
                    <Sparkles size={20} className="text-yellow-500" />
                    カテゴリー
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {categories.map(cat => (
                    <Card key={cat.id} onClick={() => { setSelectedCategory(cat); setView('category'); }} className="hover:border-stone-300">
                    <div className="text-center">
                        <span className="text-4xl mb-3 block transform group-hover:scale-110 transition-transform">{cat.icon}</span>
                        <h3 className="font-bold text-stone-700">{cat.name}</h3>
                    </div>
                    </Card>
                ))}
                </div>
            </div>
            
            <div className="bg-white rounded-3xl p-6 border border-stone-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-stone-700">さいきんの ずかん</h3>
                    <button onClick={() => setView('gallery')} className="text-sm text-stone-400 hover:text-stone-600">ぜんぶ みる &rarr;</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                    {gallery.slice(0, 5).map(item => (
                        <div key={item.id} className="min-w-[120px] md:min-w-[160px] snap-start">
                            <ImageCard item={item} compact={true} />
                        </div>
                    ))}
                    {gallery.length === 0 && <p className="text-sm text-stone-400 italic">まだ ないよ</p>}
                </div>
            </div>
          </div>
        )}

        {/* CREATE VIEW */}
        {view === 'create' && (
          <div className="flex flex-col items-center gap-8 pt-8 animate-in slide-in-from-bottom-8 duration-500 w-full max-w-2xl mx-auto">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">なにを しらべる？</h2>
              <p className="text-stone-500">マイクで はなすか、キーボードで うってね</p>
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

            {/* テキスト入力フォーム */}
            <div className="w-full">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="なにを かく？ (れい: かわいいねこ)"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  disabled={isGenerating || isRecording}
                  className="flex-1 px-4 py-3 rounded-full border-2 border-stone-200 focus:border-stone-400 focus:outline-none text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && transcript.trim() && !isGenerating) {
                      generateImage(transcript);
                    }
                  }}
                />
                <button
                  onClick={() => transcript.trim() && generateImage(transcript)}
                  disabled={!transcript.trim() || isGenerating}
                  className="px-6 py-3 bg-stone-800 text-white rounded-full font-bold hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  つくる
                </button>
              </div>
            </div>

            {transcript && (
              <div className="bg-white p-8 rounded-[2rem] border-2 border-stone-100 w-full text-center shadow-sm">
                <p className="text-2xl font-bold mb-6 text-stone-800">「{transcript}」</p>
                {!isGenerating && (
                  <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setTranscript("")}
                        className="bg-stone-100 text-stone-500 px-6 py-3 rounded-full font-bold text-sm hover:bg-stone-200"
                      >
                        ちがうよ
                      </button>
                      <button
                        onClick={() => generateImage(transcript)}
                        className="bg-stone-800 text-white px-8 py-3 rounded-full font-bold text-sm hover:bg-stone-900 shadow-md"
                      >
                        つくる！
                      </button>
                  </div>
                )}
              </div>
            )}

            {isGenerating && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-stone-200 border-t-stone-800"></div>
                <p className="text-lg font-bold text-stone-600 animate-pulse">AIが いっしょうけんめい かいてるよ...</p>
              </div>
            )}

            {generatedImage && !isGenerating && (
              <div className="w-full animate-in zoom-in duration-500">
                <Card className="p-2 overflow-hidden border-stone-200 bg-white">
                  <img src={generatedImage} alt="Generated" className="w-full h-auto rounded-2xl shadow-inner" />
                  <div className="p-6 text-center">
                    <p className="font-bold text-xl text-stone-800 mb-2">できたよ！</p>
                    <div className="flex justify-center gap-4 mt-4">
                        <button 
                        onClick={() => { setGeneratedImage(null); setTranscript(""); }}
                        className="bg-stone-100 text-stone-600 px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-stone-200"
                        >
                        <RefreshCw size={16} /> もういちど
                        </button>
                        <button 
                        onClick={() => setView('gallery')}
                        className="bg-yellow-400 text-stone-900 px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-yellow-500 shadow-sm"
                        >
                        <BookOpen size={16} /> ずかんを みる
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
                 &larr; もどる
             </button>
            <h2 className="text-3xl font-bold mb-8 flex items-center gap-3 text-stone-800">
              <span className="text-4xl">{selectedCategory.icon}</span> {selectedCategory.name}
            </h2>
            
            {gallery.filter(item => item.categoryId === selectedCategory.id || (item.category === selectedCategory.name)).length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-stone-100 border-dashed">
                    <p className="text-stone-400">このなかまは まだ いないよ</p>
                    <button onClick={() => setView('create')} className="mt-4 text-stone-600 underline font-bold">つくってみる？</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery
                    .filter(item => item.categoryId === selectedCategory.id || (item.category === selectedCategory.name))
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
              <BookOpen size={28} /> みんなの ずかん
            </h2>
            {gallery.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-stone-100 border-dashed">
                <p className="text-stone-400 font-medium">まだ イラストが ありません。</p>
                <button onClick={() => setView('create')} className="mt-4 bg-stone-800 text-white px-6 py-2 rounded-full font-bold hover:bg-stone-700">はじめよう！</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery.map(item => (
                  <ImageCard key={item.id} item={item} showCategory={true} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Footer Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-stone-100 px-6 py-3 flex justify-between items-center z-20 pb-safe">
        <NavButton icon={<Home size={24} />} label="ホーム" active={view === 'home'} onClick={() => setView('home')} />
        <NavButton icon={<Mic size={24} />} label="つくる" active={view === 'create'} onClick={() => setView('create')} />
        <NavButton icon={<BookOpen size={24} />} label="ずかん" active={view === 'gallery'} onClick={() => setView('gallery')} />
      </nav>

      {/* 削除確認モーダル (かけ算) */}
      {deleteModal.showing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-stone-800 text-center mb-2">🧮 もんだい</h3>
            <p className="text-stone-500 text-center text-sm mb-6">けすには けいさん してね</p>

            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-stone-800 tracking-wider">
                {deleteModal.num1} × {deleteModal.num2} = ?
              </p>
            </div>

            <input
              type="number"
              inputMode="numeric"
              placeholder="こたえ"
              value={deleteModal.userAnswer}
              onChange={(e) => setDeleteModal(prev => ({ ...prev, userAnswer: e.target.value, wrongAttempt: false }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deleteModal.userAnswer) {
                  handleDeleteConfirm();
                }
              }}
              className={`w-full px-4 py-4 text-center text-2xl font-bold rounded-2xl border-2 ${
                deleteModal.wrongAttempt
                  ? 'border-red-300 bg-red-50'
                  : 'border-stone-200 focus:border-stone-400'
              } focus:outline-none`}
              autoFocus
            />

            {deleteModal.wrongAttempt && (
              <p className="text-red-500 text-center mt-3 font-medium animate-in shake">
                🙅 ちがうよ！もういちど
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 rounded-full font-bold hover:bg-stone-200 transition-colors"
              >
                やめる
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={!deleteModal.userAnswer}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                けす
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 詳細モーダル (フルスクリーン) */}
      {detailModal.showing && detailModal.item && (
        <div className="fixed inset-0 bg-black/90 flex flex-col z-50 animate-in fade-in duration-200">
          {/* ヘッダー */}
          <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/50 to-transparent">
            <button
              onClick={closeDetailModal}
              className="p-2 bg-white/20 backdrop-blur-sm text-white rounded-full hover:bg-white/30 transition-colors"
            >
              <X size={24} />
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => toggleFavorite(detailModal.item!.id)}
                className={`p-2 rounded-full transition-colors ${
                  detailModal.item.isFavorite
                    ? 'bg-yellow-400 text-white'
                    : 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30'
                }`}
              >
                <Star size={24} className={detailModal.item.isFavorite ? 'fill-white' : ''} />
              </button>
              <button
                onClick={() => handleDeleteClick(detailModal.item!.id)}
                className="p-2 bg-white/20 backdrop-blur-sm text-white rounded-full hover:bg-red-500/80 transition-colors"
              >
                <Trash2 size={24} />
              </button>
            </div>
          </div>

          {/* 画像 */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <img
              src={detailModal.item.imageUrl}
              alt={detailModal.item.prompt}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
            />
          </div>

          {/* フッター */}
          <div className="p-6 bg-gradient-to-t from-black/70 to-transparent">
            <h3 className="text-2xl font-bold text-white mb-2">{detailModal.item.prompt}</h3>
            <div className="relative inline-block">
              <button
                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                className="flex items-center gap-1 bg-white/20 text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm hover:bg-white/30 transition-colors"
              >
                <span>{categories.find(c => c.id === detailModal.item?.categoryId)?.name || detailModal.item.category || 'その他'}</span>
                <ChevronDown size={14} className={`transition-transform ${showCategoryPicker ? 'rotate-180' : ''}`} />
              </button>

              {/* カテゴリーピッカー */}
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
                      <span>{cat.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
        <span className="text-[10px] font-bold">{label}</span>
    </button>
);

export default App;
