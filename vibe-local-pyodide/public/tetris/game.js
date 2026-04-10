const canvas = document.getElementById('playfield');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL_SIZE = 20;

const TETROMINOES = {
    I: { shape: [[1, 1, 1, 1]], color: '#00FFFF' },
    O: { shape: [[1, 1], [1, 1]], color: '#FFFF00' },
    T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#800080' },
    S: { shape: [[1, 1, 0], [0, 1, 1]], color: '#00FF00' },
    Z: { shape: [[0, 1, 1], [1, 1, 0]], color: '#FF0000' },
    J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#0000FF' },
    L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#FFA500' }
};

let board = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
let currentPiece = null;
let nextPiece = null;
let score = 0;
let fallInterval = 500;
let lastFallTime = 0;
let isGameOver = false;
let animationId = null;

function getRandomTetromino() {
    const keys = Object.keys(TETROMINOES);
    const type = keys[Math.floor(Math.random() * keys.length)];
    return {
        type: type,
        shape: TETROMINOES[type].shape,
        color: TETROMINOES[type].color,
        x: Math.floor(BOARD_WIDTH / 2) - Math.floor(TETROMINOES[type].shape[0].length / 2),
        y: 0
    };
}

function drawRect(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            if (board[y][x]) drawRect(ctx, x, y, board[y][x]);
        }
    }
    if (currentPiece) {
        for (let y = 0; y < currentPiece.shape.length; y++) {
            for (let x = 0; x < currentPiece.shape[y].length; x++) {
                if (currentPiece.shape[y][x]) {
                    drawRect(ctx, currentPiece.x + x, currentPiece.y + y, currentPiece.color);
                }
            }
        }
    }
}

function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;
    const offsetX = 2;
    const offsetY = 2;
    for (let y = 0; y < nextPiece.shape.length; y++) {
        for (let x = 0; x < nextPiece.shape[y].length; x++) {
            if (nextPiece.shape[y][x]) {
                drawRect(nextCtx, offsetX + x, offsetY + y, nextPiece.color);
            }
        }
    }
}

function isOccupied(x, y) {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return true;
    return board[y][x] !== 0;
}

function isValidMove(piece, xOffset = 0, yOffset = 0) {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                if (isOccupied(piece.x + x + xOffset, piece.y + y + yOffset)) return false;
            }
        }
    }
    return true;
}

function rotate(piece) {
    const shape = piece.shape;
    const N = shape.length;
    const newShape = shape.map((row, i) => row.map((val, j) => shape[N - 1 - j][i]));
    return { ...piece, shape: newShape };
}

function drop() {
    if (isValidMove(currentPiece, 0, 1)) {
        currentPiece.y++;
    } else {
        board[currentPiece.y][currentPiece.x] = currentPiece.color;
        currentPiece = nextPiece;
        nextPiece = getRandomTetromino();
        drawNext();
        if (!isValidMove(currentPiece, 0, 0)) {
            isGameOver = true;
            cancelAnimationFrame(animationId);
            document.getElementById('game-over').style.display = 'flex';
        }
    }
}

function hardDrop() {
    while (isValidMove(currentPiece, 0, 1)) {
        currentPiece.y++;
        score += 2;
    }
    drop();
}

function clearLines() {
    let lines = 0;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(BOARD_WIDTH).fill(0));
            lines++;
            y++;
        }
    }
    if (lines > 0) {
        score += lines * 100 * lines;
        scoreElement.textContent = score;
    }
}

function gameLoop(timestamp) {
    if (isGameOver) return;
    if (timestamp - lastFallTime > fallInterval) {
        drop();
        clearLines();
        lastFallTime = timestamp;
    }
    drawBoard();
    animationId = requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    if (isGameOver && e.key === 'Enter') {
        resetGame();
        return;
    }
    if (!currentPiece) return;
    switch (e.key) {
        case 'ArrowLeft':
            if (isValidMove(currentPiece, -1, 0)) currentPiece.x--;
            break;
        case 'ArrowRight':
            if (isValidMove(currentPiece, 1, 0)) currentPiece.x++;
            break;
        case 'ArrowDown':
            if (isValidMove(currentPiece, 0, 1)) {
                currentPiece.y++;
                score += 1;
                scoreElement.textContent = score;
            }
            break;
        case 'ArrowUp':
            currentPiece = rotate(currentPiece);
            if (!isValidMove(currentPiece, 0, 0)) currentPiece.x = Math.floor(BOARD_WIDTH / 2) - Math.floor(currentPiece.shape[0].length / 2);
            break;
        case ' ':
            hardDrop();
            clearLines();
            break;
    }
    drawBoard();
});

function resetGame() {
    board = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
    score = 0;
    scoreElement.textContent = score;
    isGameOver = false;
    document.getElementById('game-over').style.display = 'none';
    nextPiece = getRandomTetromino();
    currentPiece = getRandomTetromino();
    drawNext();
    lastFallTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

nextPiece = getRandomTetromino();
currentPiece = getRandomTetromino();
drawNext();
lastFallTime = performance.now();
animationId = requestAnimationFrame(gameLoop);