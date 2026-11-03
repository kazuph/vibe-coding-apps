// iPad などのタッチ端末で、ブラウザの文字選択・長押しメニュー・ダブルタップ拡大・ピンチ拡大が
// ゲーム中に起きないようにする。ホーム画面から起動したときにアプリのように見せる設定は index.html 側。
const blockAll = { passive: false };
const prevent = e => e.preventDefault();

// Safari 独自のピンチ（拡大縮小）ジェスチャー
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, prevent, blockAll);

// 2本指以上のタッチ移動（ピンチ・スクロール）
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.scale !== undefined && e.scale !== 1) e.preventDefault(); }, blockAll);

// 連打（ダブルタップ）での拡大。直前のタップから 350ms 以内の2回目は既定動作を止める。
// ボタン操作は pointerdown で受けているので、ここで止めてもゲームの入力は失われない。
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = e.timeStamp;
  if (now - lastTouchEnd < 350 && !e.target.closest?.('input,label,a')) e.preventDefault();
  lastTouchEnd = now;
}, blockAll);
document.addEventListener('dblclick', prevent, blockAll);

// 文字選択と長押しメニュー
document.addEventListener('selectstart', e => { if (!e.target.closest?.('input,textarea')) e.preventDefault(); }, blockAll);
document.addEventListener('contextmenu', prevent, blockAll);
