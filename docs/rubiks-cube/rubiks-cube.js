// ルービックキューブソルバー - Three.js実装

console.log('Rubiks Cube Solver script loaded');

// グローバルエラーハンドリング
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    alert('エラーが発生しました: ' + e.message);
});

// グローバル変数
let scene, camera, renderer;
let cubeGroup;
let cubies = [];
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cubeState;
let solutionSteps = [];
let currentStepIndex = 0;
let isAnimating = false;

// 色定義
const COLORS = {
    white: 0xFFFFFF,
    yellow: 0xFFD700,
    red: 0xFF0000,
    orange: 0xFF8C00,
    green: 0x00FF00,
    blue: 0x0000FF,
    gray: 0x333333
};

// 面の定義（標準的なルービックキューブの記法）
// U=上(白), D=下(黄), F=前(赤), B=後(オレンジ), L=左(緑), R=右(青)
const FACES = {
    U: 'white',   // Up (上)
    D: 'yellow',  // Down (下)
    F: 'red',     // Front (前)
    B: 'orange',  // Back (後)
    L: 'green',   // Left (左)
    R: 'blue'     // Right (右)
};

// 初期化
function init() {
    console.log('Initializing Rubiks Cube...');
    console.log('THREE.js version:', THREE.REVISION);

    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error('Container element not found!');
        return;
    }
    console.log('Container found:', container);

    // シーン作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    console.log('Scene created');

    // カメラ作成
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    // レンダラー作成
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // ライト追加
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // キューブグループ作成
    cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    // ルービックキューブ作成
    createRubiksCube();
    console.log('Rubiks cube created, cubies count:', cubies.length);

    // イベントリスナー設定
    setupEventListeners();
    console.log('Event listeners setup');

    // アニメーション開始
    animate();
    console.log('Animation started');

    // キューブの状態を初期化
    resetCube();
    console.log('Cube reset, initialization complete!');
}

// ルービックキューブ作成
function createRubiksCube() {
    const size = 0.95;
    const gap = 0.05;

    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                const geometry = new THREE.BoxGeometry(size, size, size);
                const materials = createCubieMaterials(x, y, z);
                const cubie = new THREE.Mesh(geometry, materials);

                cubie.position.set(
                    x * (size + gap),
                    y * (size + gap),
                    z * (size + gap)
                );

                cubie.userData = {
                    position: { x, y, z },
                    originalPosition: { x, y, z }
                };

                cubeGroup.add(cubie);
                cubies.push(cubie);
            }
        }
    }
}

// 小キューブの各面のマテリアル作成
function createCubieMaterials(x, y, z) {
    const materials = [];
    const positions = [
        { axis: 'x', value: 1, face: 'R', color: FACES.R },   // 右
        { axis: 'x', value: -1, face: 'L', color: FACES.L },  // 左
        { axis: 'y', value: 1, face: 'U', color: FACES.U },   // 上
        { axis: 'y', value: -1, face: 'D', color: FACES.D },  // 下
        { axis: 'z', value: 1, face: 'F', color: FACES.F },   // 前
        { axis: 'z', value: -1, face: 'B', color: FACES.B }   // 後
    ];

    const faceOrder = ['R', 'L', 'U', 'D', 'F', 'B'];

    faceOrder.forEach((faceName, index) => {
        const pos = positions[index];
        let color = COLORS.gray;

        if ((pos.axis === 'x' && x === pos.value) ||
            (pos.axis === 'y' && y === pos.value) ||
            (pos.axis === 'z' && z === pos.value)) {
            color = COLORS[pos.color];
        }

        materials.push(new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.3,
            metalness: 0.1
        }));
    });

    return materials;
}

// イベントリスナー設定
function setupEventListeners() {
    const canvas = renderer.domElement;

    // マウスドラッグでキューブを回転
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && !isAnimating) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            cubeGroup.rotation.y += deltaX * 0.01;
            cubeGroup.rotation.x += deltaY * 0.01;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // マウスホイールでズーム
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.01;
        camera.position.z = Math.max(3, Math.min(10, camera.position.z));
    });

    // ウィンドウリサイズ
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // UIボタン
    document.getElementById('btn-scramble').addEventListener('click', scrambleCube);
    document.getElementById('btn-reset').addEventListener('click', resetCube);
    document.getElementById('btn-solve').addEventListener('click', solveCube);
    document.getElementById('btn-prev').addEventListener('click', prevStep);
    document.getElementById('btn-next').addEventListener('click', nextStep);
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// キューブをリセット
function resetCube() {
    // すべての小キューブを削除
    while (cubeGroup.children.length > 0) {
        cubeGroup.remove(cubeGroup.children[0]);
    }
    cubies = [];

    // 新しいキューブを作成
    createRubiksCube();

    // ソリューションをクリア
    solutionSteps = [];
    currentStepIndex = 0;
    document.getElementById('solution-container').classList.add('hidden');
}

// キューブをシャッフル
function scrambleCube() {
    if (isAnimating) return;

    const moves = ['U', 'D', 'F', 'B', 'L', 'R'];
    const scrambleLength = 20;

    let scrambleSequence = [];
    for (let i = 0; i < scrambleLength; i++) {
        const move = moves[Math.floor(Math.random() * moves.length)];
        const modifier = Math.random() > 0.5 ? "'" : '';
        scrambleSequence.push(move + modifier);
    }

    executeMovesSequence(scrambleSequence);
}

// 移動シーケンスを実行
async function executeMovesSequence(moves) {
    isAnimating = true;
    for (const move of moves) {
        await executeMove(move);
        await sleep(300);
    }
    isAnimating = false;
}

// 単一の移動を実行
function executeMove(move) {
    return new Promise((resolve) => {
        const face = move[0];
        const isPrime = move.includes("'");
        const angle = isPrime ? Math.PI / 2 : -Math.PI / 2;

        rotateFace(face, angle);
        setTimeout(resolve, 300);
    });
}

// 面を回転
function rotateFace(face, angle) {
    const axis = new THREE.Vector3();
    const cubesToRotate = [];

    switch (face) {
        case 'U': // 上面
            axis.set(0, 1, 0);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.y - 1) < 0.1));
            break;
        case 'D': // 下面
            axis.set(0, 1, 0);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.y + 1) < 0.1));
            break;
        case 'F': // 前面
            axis.set(0, 0, 1);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.z - 1) < 0.1));
            break;
        case 'B': // 後面
            axis.set(0, 0, 1);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.z + 1) < 0.1));
            break;
        case 'L': // 左面
            axis.set(1, 0, 0);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.x + 1) < 0.1));
            break;
        case 'R': // 右面
            axis.set(1, 0, 0);
            cubesToRotate.push(...cubies.filter(c => Math.abs(c.position.x - 1) < 0.1));
            break;
    }

    // グループを作成して回転
    const rotationGroup = new THREE.Group();
    scene.add(rotationGroup);

    cubesToRotate.forEach(cubie => {
        cubeGroup.remove(cubie);
        rotationGroup.add(cubie);
    });

    // 回転を適用
    rotationGroup.rotateOnAxis(axis, angle);

    // 回転後、キューブを元のグループに戻す
    const worldMatrix = new THREE.Matrix4();
    cubesToRotate.forEach(cubie => {
        cubie.updateMatrixWorld();
        worldMatrix.copy(cubie.matrixWorld);

        rotationGroup.remove(cubie);
        cubeGroup.add(cubie);

        cubie.position.setFromMatrixPosition(worldMatrix);
        cubie.rotation.setFromRotationMatrix(worldMatrix);

        // 位置を丸める（数値誤差対策）
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);
    });

    scene.remove(rotationGroup);
}

// キューブを解く
function solveCube() {
    // 簡易的な解法ステップを生成（デモ用）
    solutionSteps = generateSimpleSolution();
    currentStepIndex = 0;

    document.getElementById('solution-container').classList.remove('hidden');
    updateStepDisplay();
}

// 簡易的な解法を生成（デモ用）
function generateSimpleSolution() {
    return [
        {
            phase: 'フェーズ 1: ホワイトクロス',
            description: '白い面に十字を作ります',
            moves: ['F', 'R', 'U', "R'", "U'", "F'"],
            explanation: '白いエッジピースを上面に移動させます'
        },
        {
            phase: 'フェーズ 2: ホワイトコーナー',
            description: '白い面を完成させます',
            moves: ['R', 'U', "R'", 'U'],
            explanation: '白いコーナーピースを正しい位置に配置します'
        },
        {
            phase: 'フェーズ 3: ミドルレイヤー',
            description: '中間層を揃えます',
            moves: ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],
            explanation: '中間層のエッジピースを配置します'
        },
        {
            phase: 'フェーズ 4: イエロークロス',
            description: '黄色い面に十字を作ります',
            moves: ['F', 'R', 'U', "R'", "U'", "F'"],
            explanation: '上面に黄色い十字を作ります'
        },
        {
            phase: 'フェーズ 5: イエローエッジ',
            description: '黄色いエッジを揃えます',
            moves: ['R', 'U', "R'", 'U', 'R', 'U', 'U', "R'"],
            explanation: '黄色いエッジピースの向きを揃えます'
        },
        {
            phase: 'フェーズ 6: イエローコーナー位置',
            description: '黄色いコーナーの位置を合わせます',
            moves: ['U', 'R', "U'", "L'", 'U', "R'", "U'", 'L'],
            explanation: 'コーナーピースを正しい位置に移動します'
        },
        {
            phase: 'フェーズ 7: 完成',
            description: 'キューブを完成させます',
            moves: ["R'", 'D', "R'", 'D', "R'", 'D', "R'", 'D'],
            explanation: '最後のコーナーピースの向きを調整します'
        }
    ];
}

// ステップ表示を更新
function updateStepDisplay() {
    if (solutionSteps.length === 0) return;

    const step = solutionSteps[currentStepIndex];

    document.getElementById('phase-name').textContent = step.phase;
    document.getElementById('phase-description').textContent = step.description;

    const stepDisplay = document.getElementById('step-display');
    stepDisplay.innerHTML = `
        <div class="step-card">
            <h4 class="font-semibold text-lg mb-2 text-gray-800">${step.explanation}</h4>
            <div class="bg-white p-3 rounded-lg mb-3">
                <div class="text-sm text-gray-600 mb-1">手順:</div>
                <div class="flex flex-wrap gap-2">
                    ${step.moves.map(move => `
                        <span class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-lg font-mono font-bold">
                            ${move}
                        </span>
                    `).join('')}
                </div>
            </div>
            <div class="text-sm text-gray-600">
                <p><strong>記法:</strong></p>
                <p>U=上, D=下, F=前, B=後, L=左, R=右</p>
                <p>' マークは反時計回りを意味します</p>
            </div>
        </div>
    `;

    document.getElementById('step-counter').textContent =
        `ステップ: ${currentStepIndex + 1} / ${solutionSteps.length}`;

    document.getElementById('btn-prev').disabled = currentStepIndex === 0;
    document.getElementById('btn-next').disabled = currentStepIndex === solutionSteps.length - 1;
}

// 前のステップ
function prevStep() {
    if (currentStepIndex > 0) {
        currentStepIndex--;
        updateStepDisplay();
    }
}

// 次のステップ
async function nextStep() {
    if (currentStepIndex < solutionSteps.length - 1) {
        // 現在のステップの動きを実行
        const currentStep = solutionSteps[currentStepIndex];
        await executeMovesSequence(currentStep.moves);

        currentStepIndex++;
        updateStepDisplay();
    }
}

// スリープ関数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 初期化実行
if (document.readyState === 'loading') {
    console.log('Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired, initializing...');
        init();
    });
} else {
    console.log('DOM already loaded, initializing immediately...');
    init();
}
