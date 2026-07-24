| 出典 | 目的 | 具体対象 | 役割 | 前後関係 | 初出定義 | 候補語 |
|---|---|---|---|---|---|---|
| ユーザー実機報告「とにかく左に旋回を続けます」 | 身体の右手だけを視点操作へ割り当てる | 非ミラーのカメラ画像に対して MediaPipe が返す左右手ラベルを、撮影された本人の身体上の左右へ読み替えた値 | 値 | MediaPipe の推論後、校正と操作割り当ての前 | physical handedness とは、撮影された本人の身体上の左手または右手を指す | physicalHandedness |
| MediaPipe Hands 公式仕様「非ミラー入力では handedness output を交換する」 | 左手の移動入力が右手の視点入力へ混入する状態をなくす | `detectForVideo` に渡す非ミラー video の推論ラベル `Left` と `Right` を交換する処理 | 手段 | MediaPipe の推論後、`RawHand` の生成時 | handedness correction とは、非ミラー入力に対する MediaPipe の左右手ラベルを交換する処理を指す | correctHandednessForUnmirroredInput |
| ユーザー指定「画面中央基準」 | 右手を身体のどこで校正してもyaw中立を画面の中央へ固定する | 正規化されたカメラ画像の水平座標における画面中央 `x=0.5` | 値 | 右手パーム中心の検出後、yawのデッドゾーン判定前 | screen center x とは、正規化画像の左端を0、右端を1としたときの中央座標0.5を指す | screenCenterX |
| `OneEuroFilter` 適用後の非ゼロ値を `PlayerController` が旋回速度として毎フレーム積算する現行実装 | 右手が画面中央の中立範囲へ戻った時点で旋回を停止する | 画面中央からの水平差に既存deadzoneを適用した旋回速度がゼロのとき、平滑化器の過去値を残さずゼロを出力する処理 | 手段 | 右手の画面中央からの水平差のデッドゾーン判定後、player yawの積算前 | neutral filter reset とは、画面中央のデッドゾーン内で旋回速度がゼロになった時に平滑化器の履歴を消去する処理を指す | resetViewFilterAtNeutral |
| ユーザー指定「鏡像プレビュー上で右手が画面中央ならyawRate=0」 | 中央復帰後に旋回入力とplayer yawの変化を止める | 右手パーム中心が画面中央の既存deadzone内にあり、`yawRate` がゼロでplayer yawが連続して不変となる条件 | 条件 | 右手による左右旋回後、右手を画面中央へ戻した時 | screen-center neutral view condition とは、右手が画面中央の既存deadzoneへ戻り旋回速度がゼロとなる条件を指す | screenCenterNeutralViewCondition |
| human-camera E2E の移動段階が左右補正後に視点操作へ流れた観測 | 実在人物手画素 fixture の段階を身体上の操作担当へ対応させる | 非ミラー入力の handedness 補正後に、移動・ジェット段階を `Left`、視点・射撃段階を `Right` として MediaPipe が返すよう Y4M の全フレームを水平方向に反転した映像 | 手段 | fixture を Chrome の fake camera へ渡す前、MediaPipe 推論の前 | fixture horizontal flip とは、旧ラベル前提で合成された camera fixture 全体を左右反転し、非ミラー入力の handedness 補正と同じ身体上の左右対応へそろえる処理を指す | fixtureHorizontalFlip |

## 非ミラー移動と操作ガイド

| 出典 | 目的 | 具体対象 | 役割 | 前後関係 | 初出定義 | 候補語 |
|---|---|---|---|---|---|---|
| ユーザー確定「非ミラー raw xではユーザーが自分の右へ動かすとx減少」 | 撮影者が身体の右へ左手を動かした時にゲーム内の右ストラフへ対応させる | 左手パームの正規化xが校正xより小さい時に正の移動xを出す差分 | 値 | handedness補正後、左手move写像時 | non-mirrored move x delta とは、校正xから現在xを引いた左手移動の水平差分を指す | nonMirroredMoveXDelta |
| ユーザー確定「yawはscreen center x=0.5、pitchはcalibration yで中立不一致」 | 右手を画面中央へ戻した時にyawとpitchをともに停止する | 正規化画像の垂直座標における画面中央 `y=0.5` | 値 | 右手パーム中心の検出後、pitchのデッドゾーン判定前 | screen center y とは、正規化画像の上端を0、下端を1としたときの中央座標0.5を指す | screenCenterY |
| ユーザー確定「aim常時0なのにhud crosshair transformがdead code」 | 照準が常に画面中央である実装とHUD表示を一致させる | `aim`値を使わず、画面中央へ固定表示するクロスヘア | 状態 | ControlStateの更新後、HUD描画時 | center-fixed crosshair とは、`aim`の変化に依存せず画面中央に表示される照準を指す | centerFixedCrosshair |
| ユーザー確定「calibration完了直後open、8秒後auto-collapse、? button click/tap toggle」 | 初回操作を案内しつつプレイ中の視界を妨げない | 校正完了で開き、8秒後に閉じ、ユーザー操作で開閉できるCONTROLS panelの表示状態 | 状態 | 校正完了後、HUD表示中 | controls panel visibility とは、操作ガイドが展開中か折りたたみ中かを指す | controlsPanelOpen |
| ユーザー訂正「Unicode記号だけは不可」およびAGENTS.mdの手描き視覚要素禁止 | 操作ガイドの手・方向の視覚表現をアクセシブルにし、禁止された記号・手描きSVG/CSSを使わない | `public/ui/controls-left-hand.png`（SHA-256 `2466f156628f88aada1202e54ba9ca0dc7063cc28158e64256345c33f1f1263c`）と`public/ui/controls-right-hand.png`（SHA-256 `39966367056af67a422fb16dba5a0a4dcee7efd40a98de2cf1b938b9a51f0ef2`）を、各操作説明の代替テキスト付き画像として表示する領域 | 表示要素 | PNG保存先の受領後、CONTROLS panel 描画時 | controls guide PNG icon とは、操作説明に対応する生成済みPNG画像を指し、`alt`で操作の意味を伝える | controlsGuidePngIcon |
| 追加受入「LEFT見出しに左PNGを1枚＋配下2行」「RIGHT見出しに右PNGを1枚＋配下3行」 | 同じ手の操作を一枚の画像と複数の説明行で対応させ、反復した小画像をなくす | 左右の各見出しに72〜96pxのPNGを1枚だけ置き、その配下に手ごとの操作説明を置く構造 | 表示要素 | CONTROLS panel展開後、各手の操作説明を読む前 | hand control group とは、片手のPNG一枚とその手が担う操作説明行をまとめた表示要素を指す | handControlGroup |
| 追加受入「上下→前後 / 左右→ストラフ」「OPEN PALM JET・燃料制」 | 左手の移動方向とジェットの制約を誤解なく伝える | 左手の上下を前後移動、左右をストラフとして説明し、開いた手で起動するジェットが燃料制であると説明する文 | 記録 | 左手のPNGを見た後、実際の移動またはジェットを始める前 | left movement and fuel-limited jet text とは、左手の2操作を方向と燃料制約まで含めて伝える説明文を指す | leftMoveAndJetText |
| 追加受入「R行は画像を使わずCSSの文字キーキャップR」 | Rキーが両手を含む操作位置の再校正であることを画像なしで伝える | CSSで表示する文字キーキャップ`R`と「両手の操作位置を再校正する」説明 | 表示要素 | CONTROLS panel展開後、再校正の操作を読む時 | recalibration keycap とは、画像ではなく文字Rで表す再校正キーと両手対象の説明を指す | recalibrationKeycap |
