# AERO HAND 実人間画像E2E・操作体系修正記録（承認前）

> 「君がE2Eでテストして完成させて。」
>
> 「E2Eをどれだけ実在の人間に近づけられるかが焦点です。そこで本気を出して。」

## 2026-07-24 操作体系の修正とUI改善（承認前）

> 「非ミラー raw xではユーザーが自分の右へ動かすとx減少。mapHandToMoveのX符号が逆で左ストラフになる。yawはscreen center x=0.5、pitchはcalibration yで中立不一致。… CONTROLS panelを追加し、full Playwright human含むgreen、desktop/mobile × expanded/collapsed 4 PNGを保存する。」

### WHY

非ミラーのカメラでは、左手を本人の右へ動かすと正規化xが減るため、従来の移動写像は右ストラフと左ストラフを逆にしていた。右手もyawだけ画面中央基準で、pitchは校正時の高さ基準だったため、右手を画面中央に戻しても視点が上下へ動き続けた。さらに、照準は常に中央なのにHUDだけが`aim`変形を持ち、ゲーム開始後の操作案内もなかった。

### HOW

- 左手移動xを`neutral.x - palm.x`へ反転し、右手yaw/pitchはともに正規化画面中央`0.5`と既存deadzoneから導出した。中立では既存のfilter resetを維持する。
- HUDの照準表示は中央固定にし、校正完了で開き8秒後に閉じるCONTROLS panelと`?`によるアクセシブルな開閉を追加した。
- CONTROLSの視覚要素は手描きSVG/CSSやUnicode記号を使わず、manager提供・Preview確認済みのPNGを左右各1枚だけ`alt`付きで使用する。左は「上下: 前後 / 左右: ストラフ」と「OPEN PALM JET（燃料制）」、右はneutral/yaw-pitch/fireをまとめ、Rは画像なしの文字キーキャップで「両手の操作位置を再校正」と示す。`controls-left-hand.png` SHA-256は`2466f156628f88aada1202e54ba9ca0dc7063cc28158e64256345c33f1f1263c`、`controls-right-hand.png` SHA-256は`39966367056af67a422fb16dba5a0a4dcee7efd40a98de2cf1b938b9a51f0ef2`。
- human fixtureは右手view後に画面中央へ復帰し、中央のthumb-index pinchで射撃する実手画素の640×480・3fps・60秒Y4Mへ更新した。`getUserMedia → HandLandmarker → IntentMapper → GameLoop`を通し、landmarkや`ControlState`は注入していない。

### WHAT

- 校正位置が右側へ偏っていても、右手が画面中央なら`yawRate=0`かつ`pitch=0`になる。左手move/jet中も右手が中央なら視点は中立である。
- `?debug=1`の本番camera pathで、fixtureの本人右への左手移動は`move.x=0.1549008812010402 > 0`、player.xは拳時の`0`から`0.025816813533506698`へ増加した。human-camera E2Eも`move.x > 0`とX増加を必須assertする。
- human-cameraの診断で、右手view後に`yaw=6.4586`、中央復帰後は`yawRate=0`/`pitch=0`で連続不変、中央pinchで`hits=3`/`kills=1`を確認した。
- 390pxとdesktopの展開・折りたたみで、左右各1PNGとRキーキャップを含むCONTROLS panelはクリップも縦横overflowもない。

### PNG表示証跡

| Desktop collapsed | Desktop expanded |
|---|---|
| ![desktop collapsed](.artifacts/webcam-vr-fps/images/controls-desktop-collapsed.png) | ![desktop expanded](.artifacts/webcam-vr-fps/images/controls-desktop-expanded.png) |
| Mobile collapsed (390px) | Mobile expanded (390px) |
| ![mobile collapsed](.artifacts/webcam-vr-fps/images/controls-mobile-collapsed.png) | ![mobile expanded](.artifacts/webcam-vr-fps/images/controls-mobile-expanded.png) |

4枚は実アプリから保存し、desktop/390px・展開/折りたたみの全状態を目視確認した。

### 検証job

| 範囲 | job | 結果 |
|---|---|---|
| mapping RED（変更前の符号と中立契約） | `job-1784875255811-98673` | 意図どおり失敗 |
| 全unit | `job-1784878645475-32107` | 4 files / 15 tests PASS |
| build（グループ化後） | `job-1784878644974-32105` | PASS。既存の500kB chunk警告のみ |
| grouped controls UI | `job-1784878644837-32103` | desktop/mobile 2 PASS。画像2枚、R画像なし、必須文言、全viewport境界をassert |
| grouped PNG表示証跡 | `job-1784878692285-93331` | 4 PNGを再保存・全4枚目視確認済み |
| production正符号診断 | `job-1784878832757-3420` | `move.x=0.1549008812010402`、player.x `0 → 0.025816813533506698` |
| human-camera | `job-1784878728425-96454` | 2 PASS。`move.x > 0`とplayer.x増加を含む |
| full E2E（最終） | `job-1784878892333-6927` | 10 PASS（human-camera 2を含む） |

最終fixture SHA-256: `0bda65ae9955af7fb928cbfc2d1898ae70eedc9676016560fc0bf4e25df93ead`。出典と加工範囲は[`e2e/fixtures/HUMAN_HANDS_LICENSE.md`](e2e/fixtures/HUMAN_HANDS_LICENSE.md)に記録した。

実機カメラでのdogfood受入は未完である。yunomiの起動と人間の承認はmanagerが行うため、このレポートは承認前の証拠準備として扱う。

## 以前のhuman-camera E2E記録

実装と自動検証は完了した。従来のscripted E2E 6件を残したまま、実在人物の手画素をGoogle Chromeのカメラへ入力し、`getUserMedia → HandLandmarker → IntentMapper → GameLoop`を迂回せず通すhuman-camera E2Eを追加した。最終full verifyはbuild、unit 13件、E2E 7件すべてPASSした。

完成の残りは、このレポートと実物に対するユーザー承認である。

## 敵を倒すシーン

最終human-camera E2E録画の撃破前後だけを切り出した3.56秒の実映像。右下の実在人物のOK/ピンチ手画像で射撃し、中央の敵が白く被弾した後、敵が1体消えてHUDが`TARGETS 5 → 4`、`SCORE 0 → 100`へ変化する。

![実在人物のピンチ射撃で敵を倒す3.56秒](.artifacts/webcam-vr-fps/videos/human-camera-enemy-defeat.webm)

| 撃破前: TARGETS 5 / SCORE 0 | 撃破後: TARGETS 4 / SCORE 100 |
|---|---|
| ![撃破前](.artifacts/webcam-vr-fps/images/human-camera-enemy-before.png) | ![撃破後](.artifacts/webcam-vr-fps/images/human-camera-enemy-after.png) |

このクリップと2枚のフレームは、最終証拠WebMの41.5–45.0秒からそのまま抽出した。演出、HUD値、敵数、入力画像の合成や差し替えはしていない。

## Why: 従来の6件ではWebカメラ認識を証明できなかった

従来のPlaywright E2Eはすべて`?source=script`から`ControlState`を直接再生していた。ゲームの移動・飛行・射撃回帰は確認できても、カメラ画素からMediaPipeが手を認識し、操作信号へ変換する本番経路は通っていなかった。

human-camera E2Eを実行した結果、次の3件の実不具合も検出して修正した。

1. `R`再校正が内部で完了してもCALIBRATION表示が消えない
2. `/favicon.ico`の404がブラウザ失敗として残る
3. 非射撃中のcooldownが負値へ蓄積され、最初のピンチで373発を連射する

## How: 実在人物の手画素をChromeのカメラへ入力した

[HaGRID公式リポジトリ](https://github.com/hukenovs/hagrid)の実在人物3写真から、拳・開掌・OK/ピンチ・左右移動・右手欠損・復帰を60秒の段階映像へ構成した。Google Chromeのfake camera入力へY4Mを渡すが、ランドマークや`ControlState`は注入していない。出典、画像ID、加工内容、SHA-256、[公式ライセンス](https://github.com/hukenovs/hagrid/blob/master/license/en_us.pdf)は[`e2e/fixtures/HUMAN_HANDS_LICENSE.md`](e2e/fixtures/HUMAN_HANDS_LICENSE.md)と[`e2e/fixtures/HAGRID_LICENSE.pdf`](e2e/fixtures/HAGRID_LICENSE.pdf)に保存した。

試験は次を一連で確認する。

1. 両手認識と校正完了
2. 拳ではjet/fireが発火しない
3. 左手移動でplayer位置が変わる
4. 左手開掌でjetが発火し、高度上昇・燃料減少
5. 右手移動でyaw/pitchが変化
6. 右手OK/ピンチで射撃し、敵を撃破
7. 右手だけ欠損するとfireが即false、viewが0へ減衰
8. 両手復帰後、`R`再校正が完了し、拳の非発火状態へ戻る

## What: 最終状態と証拠

- Full verify: `job-1784862110017-4480`、exit 0
- Build: PASS
- Unit: 3 files / 13 tests PASS
- E2E: scripted 6件 + human-camera 1件 = 7件PASS
- 最終HTML evidence: `job-1784861739303-69888`、exit 0
- HTML stats: total 1 / expected 1 / unexpected 0 / flaky 0 / ok true
- human-camera test: 68.153秒
- HTML report全体: 75.049秒
- ブラウザ失敗: pageerror 0 / console error 0 / requestfailed 0 / HTTP error response 0

最終状態JSON:

- 拳: 両手tracking、jet=false、fire=false、shots=0
- 左移動: move.x=0.145、player.x=0.411、jet/fire=false
- 開掌: jet=true、player.y=2.310、fuel=3.233
- 右手視点: yawRate/pitchが非ゼロ、player yaw/pitchが変化
- 敵撃破: hits=3、kills=1、score=100、enemyCount=4
- 右手欠損: left=true、right=false、fire=false
- 入力減衰後: yawRate=0、pitch=0
- 再校正後: 両手tracking、score=100、enemyCount=4、jet/fire=false
- 12秒射撃: 88発。8Hzの上限96発以内で、human-camera E2Eでも上限をassert

### 目視証拠

![再校正後の両手拳とHUD](.artifacts/webcam-vr-fps/images/human-camera-recalibrated.png)

![再校正後HUDの数値](.artifacts/webcam-vr-fps/images/human-camera-recalibrated-hud.png)

- [状態JSON](.artifacts/webcam-vr-fps/human-camera-observed-states.json)
- [Playwright HTML report](.artifacts/webcam-vr-fps/human-camera-report/index.html)
- ![本番認識経路の録画](.artifacts/webcam-vr-fps/videos/human-camera-production-path.webm) — VP8、800×450、25fps、68.24秒、音声なし

## 証明範囲と残る制約

このE2Eが証明するのは、640×480・3fpsの段階映像に含まれる実在人物の手画素が、本番認識経路を通って各操作へ変換されたことまでである。

fixtureは3枚の静止写真から構成しており、自然な連続関節運動、速いジェスチャー、一般的な約30fpsのカメラ、実機固有の権限UI・露出・オートフォーカス、未収録の照明・距離・肌・手サイズ・利き手・遮蔽への一般化は証明しない。ここは実際の人間と実カメラによるdogfoodingが必要である。

同じfixtureでも試験時間は55.5秒から123秒超まで変動した。60秒fixtureの3倍である180秒を全体上限にしたが、認識条件と各状態の25秒待ち条件は緩めていない。短い移動・視点区間はブラウザ内で各animation frameの`debugState()`を順序付き履歴へ記録し、Playwright側がCPU遅延しても通過済み状態を検証する。履歴は観測専用であり、入力・landmark・`ControlState`・ゲーム状態は変更しない。

継続警告はMediaPipeの`NORM_RECT without IMAGE_DIMENSIONS`、OpenGL error checking disabled、Nodeの`module.register()` deprecation、Viteの500kB超chunkである。今回の試験では失敗として発生していないが、警告として残る。
