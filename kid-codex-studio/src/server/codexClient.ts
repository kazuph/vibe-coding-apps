import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { appRoot, assetUrlFor, generatedDir, gamesDir, timestampId, workspaceRoot } from './paths.js';
import { generateSeedanceVideo } from './fal.js';

type RpcMessage = { id?: number | string; method?: string; params?: any; result?: any; error?: any };
type JobMode = 'image' | 'character' | 'game' | 'video';

export type CodexJobInput = {
  mode: JobMode;
  prompt: string;
  imagePath?: string;
  assetPaths?: string[];
};

export type CodexJobResult = {
  text: string;
  assets: Array<{ kind: 'image' | 'character' | 'game' | 'video'; path: string; url: string; title: string }>;
};

const dynamicTools = [
  {
    name: 'fal_seedance_video',
    description: 'Generate a short Seedance video with fal.ai and save it into the local video library.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          imagePaths: { type: 'array', items: { type: 'string' } }
        }
      }
    }
];

export class CodexClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private seq = 1;
  private pending = new Map<number | string, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private initialized = false;
  private transcript = '';
  private runtimeAssets: CodexJobResult['assets'] = [];
  private expectedGameIndexPath = '';
  private expectedGameDir = '';
  private videoReferencePaths: string[] = [];

  async runJob(input: CodexJobInput): Promise<CodexJobResult> {
    await this.ensureStarted();
    this.transcript = '';
    this.runtimeAssets = [];
    this.videoReferencePaths = input.mode === 'video' ? Array.from(new Set(input.assetPaths ?? [])).slice(0, 9) : [];
    const thread = await this.request('thread/start', {
      model: process.env.CODEX_MODEL || undefined,
      cwd: workspaceRoot,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      dynamicTools,
      baseInstructions: this.baseInstructions()
    });
    const threadId = thread.thread.id as string;
    const prompt = this.promptFor(input);
    if (input.mode === 'game') await this.prepareGameVendor();
    const turnCompleted = this.waitForTurn(threadId);
    await this.request('turn/start', {
      threadId,
      input: this.turnInput(prompt, input),
      cwd: workspaceRoot,
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [workspaceRoot, generatedDir, gamesDir],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      }
    });
    await turnCompleted;
    const read = await this.request('thread/read', { threadId, includeTurns: true });
    return this.extractResult(read.thread, input.mode);
  }

  close() {
    this.proc?.kill('SIGTERM');
    this.proc = null;
    this.initialized = false;
    this.pending.clear();
  }

  private async ensureStarted() {
    if (this.proc && this.initialized) return;
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(generatedDir, { recursive: true });
    await fs.mkdir(gamesDir, { recursive: true });
    const codexBin = process.env.CODEX_BIN || 'codex';
    this.proc = spawn(codexBin, ['app-server', '--listen', 'stdio://', '--enable', 'image_generation'], {
      cwd: workspaceRoot,
      env: { ...process.env, FAL_KEY: process.env.FAL_KEY ?? '' }
    });
    this.proc.stderr.on('data', (chunk) => this.emit('log', String(chunk)));
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => this.onLine(line));
    await this.request('initialize', {
      clientInfo: { name: 'kid-codex-studio', title: 'Kid Codex Studio', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    });
    this.notify('initialized', {});
    this.initialized = true;
  }

  private onLine(line: string) {
    if (!line.trim()) return;
    let message: RpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit('log', line);
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message ?? 'Codex RPC error')) : pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.emit('log', `server request: ${message.method}`);
      void this.handleServerRequest(message);
      return;
    }
    if (message.method === 'agentMessage/delta') {
      this.transcript += message.params?.delta ?? '';
    }
    this.emit('event', message);
    if (message.method) this.emit('log', `server event: ${message.method}`);
  }

  private async handleServerRequest(message: RpcMessage) {
    if (!this.proc || message.id === undefined) return;
    const method = message.method;
    try {
      if (method === 'item/tool/call') {
        const params = message.params ?? {};
        const tool = params.tool ?? params.name;
        if (tool !== 'fal_seedance_video') {
          this.send({ id: message.id, result: { success: false, contentItems: [{ type: 'inputText', text: `Unsupported tool: ${tool}` }] } });
          return;
        }
        const args = params.arguments ?? {};
        const requestedPaths = Array.isArray(args.imagePaths) ? args.imagePaths.map(String) : [];
        const referencePaths = this.videoReferencePaths.length > 0 ? this.videoReferencePaths : requestedPaths;
        const video = await generateSeedanceVideo(String(args.prompt ?? ''), referencePaths);
        this.runtimeAssets.push({ kind: 'video', path: video.filePath, url: assetUrlFor(video.filePath), title: 'Seedance動画' });
        this.send({
          id: message.id,
          result: {
            success: true,
            contentItems: [{ type: 'inputText', text: JSON.stringify({ savedPath: video.filePath, url: assetUrlFor(video.filePath) }) }]
          }
        });
        return;
      }
      if (method?.includes('requestApproval')) {
        this.send({ id: message.id, result: { decision: 'acceptForSession' } });
        return;
      }
      this.send({ id: message.id, result: {} });
    } catch (error) {
      this.send({
        id: message.id,
        result: { success: false, contentItems: [{ type: 'inputText', text: error instanceof Error ? error.message : String(error) }] }
      });
    }
  }

  private request(method: string, params?: any) {
    const id = this.seq++;
    this.send({ id, method, params });
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`Codex RPC timed out: ${method}`));
      }, 20 * 60 * 1000);
    });
  }

  private notify(method: string, params?: any) {
    this.send({ method, params });
  }

  private send(message: RpcMessage) {
    if (!this.proc) throw new Error('Codex app-server is not running.');
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private waitForTurn(threadId: string) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Codex turn timed out.'));
      }, 30 * 60 * 1000);
      const onEvent = (message: RpcMessage) => {
        if (message.method === 'turn/completed' && message.params?.threadId === threadId) {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.off('event', onEvent);
      };
      this.on('event', onEvent);
    });
  }

  private baseInstructions() {
    return [
      'You are running inside Kid Codex Studio for a child using an iPad on a trusted local network.',
      'Keep all generated files inside the provided workspace or library directories.',
      'For image generation, use only gpt-image-2 via the built-in image generation capability.',
      'For games, create a self-contained browser game in the local games directory and use selected image assets directly or create sprite sheets when it improves play.',
      'For videos, call the fal_seedance_video dynamic tool. Never print API keys or secrets.',
      'Avoid unsafe, adult, violent, or personally identifying content. If a prompt is unsafe, make it child-safe and explain briefly.'
    ].join('\n');
  }

  private promptFor(input: CodexJobInput) {
    const assetPaths = input.assetPaths ?? [];
    const assets =
      assetPaths
        .map((p, index) => {
          let url = '';
          try {
            url = assetUrlFor(p);
          } catch {
            url = '(outside library; do not use)';
          }
          return `- asset_${index + 1}: local_path=${p} public_url=${url}`;
        })
        .join('\n') || '- none';
    if (input.mode === 'image') {
      return `Generate one child-safe image with gpt-image-2. Save the final PNG under ${generatedDir}. Prompt: ${input.prompt}`;
    }
    if (input.mode === 'character') {
      return this.characterPrompt(input.prompt, assets);
    }
    if (input.mode === 'game') {
      const gameDir = `${gamesDir}/${timestampId('game')}`;
      this.expectedGameDir = gameDir;
      this.expectedGameIndexPath = `${gameDir}/index.html`;
      return `Create a playable browser game under ${gameDir} using the OpenAI Game Studio workflow.
This is a 2D browser game request, so use the Game Studio default path: Phaser + JavaScript, simulation state outside the renderer, DOM HUD over the canvas, stable asset manifest keys, and a playtest-ready first screen.

Selected image assets are mandatory. Do not create an assetless HTML/canvas game. Use these selected assets as the main player, enemy, item, or world sprites:
${assets}

Child request: ${input.prompt}

Requirements:
- Create exactly one self-contained index.html at ${gameDir}/index.html.
- Use local Phaser from ./vendor/phaser.min.js. It has already been copied into ${gameDir}/vendor/phaser.min.js.
- Do not use external CDNs, remote URLs, Vite, React dev routes, npm runtime imports, or absolute file:// URLs.
- Create an in-file asset manifest with stable keys. Every selected image must appear in that manifest with its public_url.
- The game must visibly use at least one selected image asset during normal play. HTML games made only from text, emoji, gradients, SVG drawings, geometric shapes, or placeholder blocks are forbidden.
- Keep gameplay state outside Phaser sprite objects. Use simple systems or state objects for score, speed, player state, hazards, progression, and failure or restart.
- Use a DOM HUD overlay for score, objective, and restart state. Keep the playfield readable on iPad and desktop.
- Include pointer/touch input and keyboard input when useful.
- Include boot, play, failure/restart, and progression states.
- Add a small debug-safe playtest checklist as an HTML comment at the end covering boot, main verb, selected asset visibility, HUD readability, restart, and mobile viewport.
- The game must be playable directly when opened from /assets/games/.../index.html in an iframe.
- At the end, return the exact local path ${gameDir}/index.html.`;
    }
    return `Generate a 15-second Seedance 2.0 Fast video with fal_seedance_video.
Use this child request as the video prompt: ${input.prompt}

Selected reference image paths:
${assets}

Requirements:
- If any reference image paths are listed, pass them to fal_seedance_video as imagePaths.
- Treat selected images as visual references for the subject, style, colors, and identity, not as first or last frames.
- Write the tool prompt as a complete 15-second story with clear kishotenketsu structure: introduction, development, twist or change, and satisfying ending.
- Use a polished adventure-anime or energetic hobby-anime tone for elementary-school kids. Keep it child-safe, but do not make it preschool TV, babyish, overly cute, or cheerleader-like.
- Include synchronized sound direction in Japanese by default: natural short Japanese dialogue, light narration only when useful, ambient sound, and action sound effects. Do not use English speech unless explicitly requested.
- The fal tool is already configured to use Seedance 2.0 Fast Reference-to-Video with 480p, 15 seconds, and generated audio.
- Do not invent unrelated Disney, movie, theme-park, or copyrighted franchise scenes unless explicitly present in the selected reference and prompt.`;
  }

  private async extractResult(thread: any, mode: JobMode): Promise<CodexJobResult> {
    const items = (thread.turns ?? []).flatMap((turn: any) => turn.items ?? []);
    const assets: CodexJobResult['assets'] = [...this.runtimeAssets];
    for (const item of items) {
      if (item.type === 'imageGeneration' && item.savedPath) {
        const localPath = await this.ensureLibraryCopy(item.savedPath, generatedDir, 'image');
        assets.push({
          kind: mode === 'character' ? 'character' : 'image',
          path: localPath,
          url: assetUrlFor(localPath),
          title: mode === 'character' ? 'キャラ' : '生成画像'
        });
      }
      if (item.type === 'dynamicToolCall' && item.contentItems) {
        for (const content of item.contentItems) {
          const text = content.text ?? '';
          const savedPath = this.findSavedPath(text);
          if (savedPath) assets.push({ kind: 'video', path: savedPath, url: assetUrlFor(savedPath), title: 'Seedance動画' });
        }
      }
    }
    if (mode === 'game') {
      const indexPath = await this.findGameIndexPath(items);
      if (indexPath) assets.push({ kind: 'game', path: indexPath, url: assetUrlFor(indexPath), title: 'ゲーム' });
    }
    return { text: this.transcript.trim(), assets };
  }

  private async prepareGameVendor() {
    if (!this.expectedGameDir) return;
    const vendorDir = path.join(this.expectedGameDir, 'vendor');
    await fs.mkdir(vendorDir, { recursive: true });
    const source = path.join(appRoot, 'node_modules', 'phaser', 'dist', 'phaser.min.js');
    const target = path.join(vendorDir, 'phaser.min.js');
    await fs.copyFile(source, target);
  }

  private turnInput(prompt: string, input: CodexJobInput) {
    const imagePaths = Array.from(new Set([...(input.assetPaths ?? []), input.imagePath].filter(Boolean))) as string[];
    return [
      { type: 'text', text: prompt, text_elements: [] },
      ...imagePaths.map((imagePath) => ({ type: 'localImage', path: imagePath }))
    ];
  }

  private characterPrompt(userPrompt: string, assets: string) {
    return `Create a full Codex app digital pet animation set, matching the /pet workflow row structure.

User request: ${userPrompt}

Reference image paths, if any:
${assets}

Use this as the authoritative /pet-derived production spec:
- Codex digital pet sprite style: pixel-art-adjacent low-resolution mascot sprite, compact chibi proportions, chunky readable silhouette, thick dark 1-2 px outline, visible stepped/pixel edges, limited palette, flat cel shading, simple expressive face, tiny limbs.
- If reference images are attached, preserve the character identity, main shape, face, markings, palette, and important accessories, but simplify high-detail references into the Codex digital pet house style.
- Generate exactly nine gpt-image-2 PNG images, one horizontal sprite strip per animation state. Do not generate separate per-frame images.
- Generate the row strips in this exact order and save them under ${generatedDir} with clear filenames:
  1. idle: 6 equal-width frames, neutral breathing/blinking loop.
  2. running-right: 8 equal-width frames, rightward locomotion loop.
  3. running-left: 8 equal-width frames, leftward locomotion loop.
  4. waving: 4 equal-width frames, greeting through paw pose only.
  5. jumping: 5 equal-width frames, anticipation, lift, peak, descent, settle.
  6. failed: 8 equal-width frames, sad/slumped/deflated reaction.
  7. waiting: 6 equal-width frames, patient waiting loop with small motion.
  8. running: 6 equal-width frames, generic in-place running loop.
  9. review: 6 equal-width frames, focused inspecting/review loop.
- Each row image must contain only that row's equal-width frame slots, left-to-right, on one horizontal strip.
- Every slot must contain the same pet identity, one centered complete full-body pose, with safe padding. Do not leave slots blank, do not overlap slots, and do not place more than one pose in a slot.
- Keep identity locked across all rows and all frames: same head shape, face design, markings, palette, outline weight, body proportions, prop/accessory design, and silhouette. Only pose, limbs, expression, and small body movement may change.
- Do not simply duplicate, translate, rotate, or scale one pose. The poses must create readable animation cycles while remaining the same character.
- Use a perfectly flat pure chroma-key background across every strip. Do not include scenery, text, labels, frame numbers, borders, visible grid lines, checkerboard transparency, shadows, glows, detached effects, speech bubbles, UI, or extra props not present in the reference unless explicitly requested.
- Do not produce polished illustration, painterly character image, anime key art, 3D render, vector mascot, glossy app icon, or realistic portrait.

Save the nine final row strip PNGs under ${generatedDir}.`;
  }

  private findSavedPath(text: string) {
    try {
      return JSON.parse(text).savedPath as string | undefined;
    } catch {
      return text.match(/"savedPath"\s*:\s*"([^"]+)"/)?.[1];
    }
  }

  private async ensureLibraryCopy(filePath: string, targetDir: string, prefix: string) {
    try {
      assetUrlFor(filePath);
      return filePath;
    } catch {
      const ext = path.extname(filePath) || '.png';
      const target = path.join(targetDir, `${timestampId(prefix)}${ext}`);
      await fs.copyFile(filePath, target);
      return target;
    }
  }

  private async findGameIndexPath(items: any[]) {
    if (this.expectedGameIndexPath) {
      try {
        await fs.access(this.expectedGameIndexPath);
        return this.expectedGameIndexPath;
      } catch {
        // Fall through to transcript extraction.
      }
    }
    const joined = items
      .map((item: any) => item.text ?? item.aggregatedOutput ?? item.output ?? '')
      .join('\n');
    const mentioned = joined.match(/(\/[^\s"'`]+index\.html)/)?.[1];
    if (mentioned) return mentioned;
    const commandPaths = items
      .flatMap((item: any) => [item.command, item.cwd, item.path, item.savedPath])
      .filter(Boolean)
      .join('\n');
    return commandPaths.match(/(\/[^\s"'`]+index\.html)/)?.[1];
  }
}
