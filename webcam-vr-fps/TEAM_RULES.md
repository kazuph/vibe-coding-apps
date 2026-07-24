# Webcam VR FPS E2E Team Rules

## TODO

- 継続条件: 非ミラー左手X、右手yaw/pitch画面中央、CONTROLS panel、unit、build、human-camera E2E、full E2E、desktop/mobileの展開/折りたたみ証跡がすべてそろい、実機dogfoodは未完として明記するまで完了報告しない
- context compaction、pane restart、または状態が不明になった後はこのファイルを最初に読む

Referent table: `webcam-vr-fps/referent-table-webcam-human-e2e.md`
SHA-256: `9ca9f95fa8c82a08c4024b1ec3d247d6df25871f86192b265fea1ef3e9dc4dae`

Yaw referent table: `webcam-vr-fps/referent-table-handedness-fix.md`
SHA-256: `4ef3ee57edfb7197e2e1b61c6ff0f805ae6e5fffd13d5c6214750aef9fbf05b5`

## Original user goal

> 君がE2Eでテストして完成させて。
>
> E2Eをどれだけ実在の人間に近づけられるかが焦点です。そこで本気を出して。

## Completion contract

- Main proof uses a staged sequence of real-human hand photographs injected as Chrome's camera input.
- The production path `getUserMedia → HandLandmarker → IntentMapper → GameLoop` must run without bypass.
- Scripted `ControlState` fixtures remain regression tests but do not prove human-like input.
- Verify calibration, left-hand movement, open-palm jet, right-hand view control, pinch fire, and enemy defeat as far as the available staged real-human images support.
- Build, unit tests, scripted E2E, staged-real-human-image E2E, browser console, and visible rendering must be checked.
- Implementation and verification reach two thirds; final user approval via yunomi reaches completion.

## Required source files

- `AGENTS.md`
- `webcam-vr-fps/PLAN.md`
- `webcam-vr-fps/playwright.config.ts`
- `webcam-vr-fps/e2e/**`
- `webcam-vr-fps/src/perception/**`
- `webcam-vr-fps/src/control/**`
- `webcam-vr-fps/src/game/**`
- `webcam-vr-fps/TEAM_RULES.md`

## Roles and side effects

- Manager: owns scope, checks all evidence and diffs, runs final verification, and launches yunomi.
- Implementer: may inspect first. Editing is allowed only after the manager sends an explicit file scope. It must not commit, push, delete, deploy, restart shared services, or send external messages.
- Advisor: read-only persona and regression review. It must not edit, delete, commit, push, deploy, restart, or send external messages.

## Strict prohibitions

- Do not add mocks, API bypasses, backdoors, checkpoint/rollback, file watchers, or auto-test loops.
- Do not install Playwright browsers. Reuse existing Chrome or the installed browser.
- Do not create `.artifacts/` without an explicit user request.
- Do not overwrite or clean the existing untracked implementation or the modified `src/assets/contract.ts`.
- Do not edit `src/assets/**` unless the manager explicitly authorizes a precise file; those files came from another contributor.
- Do not invent product thresholds or other behavior-changing numbers.

## Reporting

- After context compaction, pane restart, or unclear state, read this file first.
- Implementer reports affected files, proposed smallest diff, verification commands, and remaining risks.
- Advisor reports facts separately from assumptions, focusing on how closely the E2E represents an actual human and what it still cannot prove.
- Reports return to the manager through Herdr.
