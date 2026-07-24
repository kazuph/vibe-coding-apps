(() => {
    // 調整可能: レベル n から n+1 へ進むための距離（km）。
    const LEVEL_STEP_KM = 1.0;
    const STORAGE_KEY = 'walkingpad_wellness_ledger_v1';
    const DISPLAY_MODE_KEY = 'walkingpad_display_mode_v1';
    const MAX_SAMPLES = 190;
    const GATE_METERS = 100;
    const query = new URLSearchParams(location.search);
    const isPanelsDemo = query.has('panels');
    const previewDisplayMode = isPanelsDemo && query.get('mode') === 'run' ? 'run' : null;

    // 既存の1秒タイマーは残すが、描画はこのファイルのタブ対応実装に一本化する。
    window.drawChart = () => {};

    const chartMetrics = {
        speed: { label: 'SPEED', unit: 'km/h', color: '#3dffa0', format: value => value.toFixed(1) },
        distance: { label: 'DIST', unit: 'km', color: '#6ec9ff', format: value => value.toFixed(2) },
        kcal: { label: 'KCAL', unit: 'kcal', color: '#ffc861', format: value => value.toFixed(0) }
    };

    const dateKey = (date = new Date()) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatDuration = seconds => {
        const wholeSeconds = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(wholeSeconds / 60);
        const remainder = wholeSeconds % 60;
        return `${minutes}:${String(remainder).padStart(2, '0')}`;
    };

    const formatClock = timestamp => new Date(timestamp).toLocaleTimeString('ja-JP', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    function levelFromTotal(totalKm) {
        let level = 1;
        let levelStartKm = 0;
        let levelSpanKm = LEVEL_STEP_KM;
        while (totalKm >= levelStartKm + levelSpanKm) {
            levelStartKm += levelSpanKm;
            level += 1;
            levelSpanKm = level * LEVEL_STEP_KM;
        }
        return { level, levelStartKm, levelSpanKm, progressKm: totalKm - levelStartKm };
    }

    class WellnessLedger {
        constructor() {
            this.data = this.load();
        }

        load() {
            try {
                const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (stored && typeof stored === 'object' && stored.days && typeof stored.days === 'object') {
                    return {
                        days: stored.days,
                        total: stored.total || { distanceKm: 0, seconds: 0, kcal: 0 },
                        deviceCounters: stored.deviceCounters || null
                    };
                }
            } catch (error) {
                console.warn('[WalkPad] wellness ledger could not be read', error);
            }
            return { days: {}, total: { distanceKm: 0, seconds: 0, kcal: 0 }, deviceCounters: null };
        }

        save() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        }

        ensureDay(key) {
            if (!this.data.days[key]) {
                this.data.days[key] = { date: key, distanceKm: 0, seconds: 0, kcal: 0 };
            }
            return this.data.days[key];
        }

        delta(name, value) {
            const previous = this.data.deviceCounters && this.data.deviceCounters[name];
            if (!Number.isFinite(previous)) return value;
            return value >= previous ? value - previous : value;
        }

        record(metrics) {
            const today = this.ensureDay(dateKey());
            const distanceDelta = this.delta('distanceKm', metrics.distanceKm);
            const secondsDelta = this.delta('seconds', metrics.seconds);
            const kcalDelta = this.delta('kcal', metrics.kcal);
            today.distanceKm += distanceDelta;
            today.seconds += secondsDelta;
            today.kcal += kcalDelta;
            this.data.deviceCounters = {
                distanceKm: metrics.distanceKm,
                seconds: metrics.seconds,
                kcal: metrics.kcal
            };
            this.recalculate();
            this.save();
        }

        recalculate() {
            this.data.total = Object.values(this.data.days).reduce((total, day) => ({
                distanceKm: total.distanceKm + Number(day.distanceKm || 0),
                seconds: total.seconds + Number(day.seconds || 0),
                kcal: total.kcal + Number(day.kcal || 0)
            }), { distanceKm: 0, seconds: 0, kcal: 0 });
        }

        getSummary() {
            const today = this.ensureDay(dateKey());
            const total = this.data.total;
            let streak = 0;
            const cursor = new Date();
            while (this.data.days[dateKey(cursor)] && this.data.days[dateKey(cursor)].distanceKm > 0) {
                streak += 1;
                cursor.setDate(cursor.getDate() - 1);
            }
            return { today, total, streak };
        }
    }

    const wellnessLedger = new WellnessLedger();
    let activeChartMetric = 'speed';
    let metricHistory = [];
    let chartPoints = [];
    let lastLiveMetrics = null;
    let runnerView = null;
    let demoStartedAt = Date.now();

    function renderWellness(summary) {
        const level = levelFromTotal(summary.total.distanceKm);
        const progressPercent = Math.min(100, (level.progressKm / level.levelSpanKm) * 100);
        document.getElementById('todayDistance').textContent = `${summary.today.distanceKm.toFixed(2)} KM`;
        document.getElementById('todayDetail').textContent = `${formatDuration(summary.today.seconds)} · ${summary.today.kcal.toFixed(0)} KCAL`;
        document.getElementById('totalDistance').textContent = summary.total.distanceKm.toFixed(2);
        document.getElementById('streakDays').textContent = String(summary.streak);
        document.getElementById('levelLabel').textContent = `LV ${level.level}`;
        document.getElementById('levelProgress').textContent = `${progressPercent.toFixed(0)}%`;
        document.getElementById('levelDetail').textContent = `${level.progressKm.toFixed(2)} / ${level.levelSpanKm.toFixed(2)} KM`;
    }

    function readMetrics() {
        const status = window.controller.status;
        const rawKcal = status.deviceCalories > 0 ? status.deviceCalories : window.controller.calculateCalories();
        const reset = lastLiveMetrics && (status.distance < lastLiveMetrics.distanceKm || status.time < lastLiveMetrics.seconds);
        const kcal = reset || !lastLiveMetrics ? rawKcal : Math.max(rawKcal, lastLiveMetrics.kcal);
        const metrics = {
            t: Date.now(),
            speed: status.speed / 10,
            distanceKm: status.distance,
            seconds: status.time,
            kcal,
            reset
        };
        lastLiveMetrics = metrics;
        return metrics;
    }

    function demoMetrics() {
        const elapsedSeconds = (Date.now() - demoStartedAt) / 1000;
        return {
            t: Date.now(),
            speed: 3,
            distanceKm: 0.13 + (elapsedSeconds * 3 / 3600),
            seconds: 154 + elapsedSeconds,
            kcal: 8,
            reset: false
        };
    }

    function appendMetricSample(metrics) {
        if (metrics.reset) metricHistory = [];
        metricHistory.push({ t: metrics.t, speed: metrics.speed, distance: metrics.distanceKm, kcal: metrics.kcal });
        if (metricHistory.length > MAX_SAMPLES) metricHistory.shift();
    }

    function currentChartValue(metrics) {
        return activeChartMetric === 'distance' ? metrics.distanceKm : metrics[activeChartMetric];
    }

    function drawChart(hoverIndex = null) {
        const canvas = document.getElementById('speedChart');
        const context = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        const pad = { left: 35, right: 12, top: 8, bottom: 23 };
        const plotWidth = width - pad.left - pad.right;
        const plotHeight = height - pad.top - pad.bottom;
        const metric = chartMetrics[activeChartMetric];
        const values = metricHistory.map(point => point[activeChartMetric]);
        const maxValue = Math.max(...values, activeChartMetric === 'speed' ? 6 : 1);
        const yPosition = value => pad.top + plotHeight * (1 - value / maxValue);
        const firstTime = metricHistory[0] ? metricHistory[0].t : Date.now() - 180000;
        const lastTime = metricHistory.at(-1) ? metricHistory.at(-1).t : Date.now();
        const xPosition = timestamp => pad.left + plotWidth * ((timestamp - firstTime) / Math.max(1, lastTime - firstTime));

        context.font = '9px "Chakra Petch", monospace';
        context.lineWidth = 1;
        context.fillStyle = '#7e948a';
        context.strokeStyle = '#1d2b25';
        context.textBaseline = 'middle';
        context.textAlign = 'right';
        [0, maxValue / 2, maxValue].forEach(value => {
            const y = yPosition(value);
            context.beginPath();
            context.moveTo(pad.left, y);
            context.lineTo(width - pad.right, y);
            context.stroke();
            context.fillText(metric.format(value), pad.left - 6, y);
        });
        context.textAlign = 'center';
        context.textBaseline = 'top';
        for (let tick = 0; tick < 4; tick += 1) {
            const ratio = tick / 3;
            const x = pad.left + plotWidth * ratio;
            const timestamp = firstTime + (lastTime - firstTime) * ratio;
            context.beginPath();
            context.moveTo(x, pad.top);
            context.lineTo(x, pad.top + plotHeight);
            context.stroke();
            context.fillText(formatClock(timestamp), x, pad.top + plotHeight + 5);
        }

        chartPoints = metricHistory.map(point => ({
            x: xPosition(point.t), y: yPosition(point[activeChartMetric]), value: point[activeChartMetric], t: point.t
        }));
        if (chartPoints.length < 2) {
            context.fillText('接続後に記録を開始します', pad.left + plotWidth / 2, pad.top + plotHeight / 2);
            return;
        }
        const gradient = context.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
        gradient.addColorStop(0, `${metric.color}33`);
        gradient.addColorStop(1, `${metric.color}00`);
        context.beginPath();
        chartPoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.lineTo(chartPoints.at(-1).x, yPosition(0));
        context.lineTo(chartPoints[0].x, yPosition(0));
        context.closePath();
        context.fillStyle = gradient;
        context.fill();
        context.beginPath();
        chartPoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.strokeStyle = metric.color;
        context.lineWidth = 2;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke();

        const latest = chartPoints.at(-1);
        context.beginPath();
        context.arc(latest.x, latest.y, 3.5, 0, Math.PI * 2);
        context.fillStyle = metric.color;
        context.fill();
        if (hoverIndex !== null && chartPoints[hoverIndex]) {
            const point = chartPoints[hoverIndex];
            context.strokeStyle = '#3d5a4d';
            context.setLineDash([3, 3]);
            context.beginPath();
            context.moveTo(point.x, pad.top);
            context.lineTo(point.x, pad.top + plotHeight);
            context.stroke();
            context.setLineDash([]);
            context.beginPath();
            context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
            context.fillStyle = '#0b110e';
            context.fill();
            context.strokeStyle = metric.color;
            context.lineWidth = 2;
            context.stroke();
        }
    }

    function setChartMetric(metric) {
        activeChartMetric = metric;
        const selected = chartMetrics[metric];
        document.querySelectorAll('[data-chart-metric]').forEach(button => {
            button.setAttribute('aria-selected', String(button.dataset.chartMetric === metric));
        });
        const latest = metricHistory.at(-1);
        document.getElementById('chartNow').textContent = latest
            ? `${selected.format(latest[metric])} ${selected.unit}`
            : '—';
        drawChart();
    }

    class RunnerView {
        constructor(mount) {
            this.mount = mount;
            this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x07100d);
            this.scene.fog = new THREE.Fog(0x07100d, 8, 48);
            this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
            this.camera.position.set(0, 2.7, 5.4);
            this.camera.lookAt(0, 1.15, -9);
            this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.setClearColor(0x07100d, 1);
            this.mount.prepend(this.renderer.domElement);
            this.speedKmh = 0;
            this.distanceOffset = 0;
            this.lastGate = null;
            this.lastFrame = 0;
            this.frameRequest = null;
            this.scenerySegments = [];
            this.roadSegments = [];
            this.addNightSky();
            this.buildRoad();
            this.addLights();
            this.ready = this.loadSceneAssets();
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.mount);
            this.resize();
        }

        addNightSky() {
            const stars = new Float32Array(180);
            for (let index = 0; index < stars.length; index += 3) {
                const point = index / 3;
                stars[index] = ((point * 17) % 19) - 9.5;
                stars[index + 1] = 2 + ((point * 11) % 13) * 0.34;
                stars[index + 2] = -12 - ((point * 7) % 34);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
            this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa9ffd8, size: 0.055, transparent: true, opacity: 0.78 })));
        }

        buildRoad() {
            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(44, 100),
                new THREE.MeshStandardMaterial({ color: 0x0b1d16, roughness: 0.96, metalness: 0.04 })
            );
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(0, -0.025, -40);
            this.scene.add(ground);

            this.roadSegmentLength = 17;
            const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x101b17, roughness: 0.82, metalness: 0.12 });
            for (let index = 0; index < 5; index += 1) {
                const road = new THREE.Mesh(new THREE.PlaneGeometry(5.2, this.roadSegmentLength), roadMaterial);
                road.rotation.x = -Math.PI / 2;
                road.position.set(0, 0, this.roadSegmentLength / 2 - index * this.roadSegmentLength);
                this.scene.add(road);
                this.roadSegments.push(road);
            }

            const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x2dc989, emissive: 0x0d4c32, emissiveIntensity: 1.1 });
            [-2.72, 2.72].forEach(x => {
                const edge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 100), edgeMaterial);
                edge.position.set(x, 0.02, -40);
                this.scene.add(edge);
            });
        }

        addLights() {
            this.scene.add(new THREE.HemisphereLight(0x476a91, 0x0b1b13, 1.8));
            const moonlight = new THREE.DirectionalLight(0xb8dbff, 2.1);
            moonlight.position.set(-5, 8, 2);
            this.scene.add(moonlight);
            const roadGlow = new THREE.PointLight(0x3dffa0, 10, 22, 2);
            roadGlow.position.set(0, 2.3, -7);
            this.scene.add(roadGlow);
        }

        async loadSceneAssets() {
            const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js');
            const loader = new GLTFLoader();
            const loadAsset = path => new Promise((resolve, reject) => loader.load(path, resolve, undefined, reject));
            const [soldier, trees, tallTrees, building] = await Promise.all([
                loadAsset('./assets/Soldier.glb'),
                loadAsset('./assets/grass-trees.glb'),
                loadAsset('./assets/grass-trees-tall.glb'),
                loadAsset('./assets/building-small-a.glb')
            ]);
            this.addRunner(soldier);
            this.addScenery([trees.scene, tallTrees.scene, building.scene]);
            this.mount.dataset.loaded = 'true';
            this.mount.querySelector('.runner-loading').hidden = true;
        }

        addRunner(gltf) {
            this.runner = gltf.scene;
            this.runner.position.set(0, 0, 0.65);
            this.runner.scale.multiplyScalar(1.05);
            this.scene.add(this.runner);
            this.mixer = new THREE.AnimationMixer(this.runner);
            this.animationActions = Object.fromEntries(gltf.animations.map(clip => [clip.name, this.mixer.clipAction(clip)]));
            this.activeAction = this.animationActions.Idle;
            this.activeAction.reset().play();
            this.updateAnimation();
        }

        addScenery(templates) {
            const segmentLength = 17;
            for (let index = 0; index < 5; index += 1) {
                const segment = new THREE.Group();
                segment.position.z = -index * segmentLength;
                const placements = [
                    [templates[0], -5.3, 0, -3.8, 0.95],
                    [templates[1], 5.6, 0, -8.7, 1.08],
                    [templates[2], -8.3, 0, -11.8, 1.2]
                ];
                placements.forEach(([template, x, y, z, scale]) => {
                    const prop = template.clone(true);
                    prop.position.set(x, y, z);
                    prop.scale.setScalar(scale);
                    segment.add(prop);
                });
                this.scene.add(segment);
                this.scenerySegments.push(segment);
            }
            this.scenerySegmentLength = segmentLength;
        }

        getMovementState() {
            if (this.speedKmh <= 0) return 'Idle';
            const maximumKmh = Number(document.getElementById('speedSlider').max) / 10;
            return this.speedKmh <= maximumKmh / 2 ? 'Walk' : 'Run';
        }

        updateAnimation() {
            if (!this.animationActions) return;
            const movementState = this.getMovementState();
            const nextAction = this.animationActions[movementState];
            const maximumKmh = Number(document.getElementById('speedSlider').max) / 10;
            if (nextAction !== this.activeAction) {
                nextAction.reset().play();
                this.activeAction.crossFadeTo(nextAction, 0.25, false);
                this.activeAction = nextAction;
            }
            this.activeAction.paused = movementState === 'Idle';
            this.activeAction.timeScale = movementState === 'Idle' ? 0 : this.speedKmh / (maximumKmh / 2);
        }

        resize() {
            const { clientWidth: width, clientHeight: height } = this.mount;
            if (!width || !height) return;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(width, height, false);
            this.renderer.render(this.scene, this.camera);
        }

        syncMetrics(metrics) {
            this.speedKmh = metrics.speed;
            this.updateAnimation();
            const meters = metrics.distanceKm * 1000;
            const passedGate = Math.floor(meters / GATE_METERS);
            if (this.lastGate !== null && passedGate > this.lastGate) this.celebrate();
            this.lastGate = passedGate;
            document.getElementById('runnerDistance').textContent = metrics.distanceKm.toFixed(2);
            document.getElementById('runnerGate').textContent = `NEXT GATE ${(passedGate + 1) * GATE_METERS}M`;
        }

        celebrate() {
            this.mount.classList.add('celebrate');
            setTimeout(() => this.mount.classList.remove('celebrate'), 600);
        }

        renderFrame = now => {
            if (document.hidden || this.reducedMotion) {
                this.frameRequest = null;
                this.lastFrame = 0;
                return;
            }
            if (now - this.lastFrame >= 1000 / 30) {
                const elapsedSeconds = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
                this.lastFrame = now;
                this.distanceOffset += this.speedKmh * 1000 / 3600 * elapsedSeconds;
                const travelDistance = this.speedKmh * 1000 / 3600 * elapsedSeconds;
                this.roadSegments.forEach(segment => {
                    segment.position.z += travelDistance;
                    if (segment.position.z - this.roadSegmentLength / 2 > this.camera.position.z) {
                        segment.position.z -= this.roadSegmentLength * this.roadSegments.length;
                    }
                });
                this.scenerySegments.forEach(segment => {
                    segment.position.z += travelDistance;
                    if (segment.position.z > this.camera.position.z + this.scenerySegmentLength) {
                        segment.position.z -= this.scenerySegmentLength * this.scenerySegments.length;
                    }
                });
                if (this.mixer) this.mixer.update(elapsedSeconds);
                this.renderer.render(this.scene, this.camera);
            }
            this.frameRequest = requestAnimationFrame(this.renderFrame);
        };

        start() {
            return this.ready.then(() => {
                if (this.reducedMotion || this.frameRequest || document.hidden) return;
                this.frameRequest = requestAnimationFrame(this.renderFrame);
            });
        }

        stop() {
            if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
            this.frameRequest = null;
            this.lastFrame = 0;
        }

        dispose() {
            this.stop();
            this.resizeObserver?.disconnect();
            this.renderer?.dispose();
            this.mount.querySelector('canvas')?.remove();
        }
    }

    function handleRunViewFailure(error) {
        console.warn('[WalkPad] RUN mode fell back to METER', error);
        const gaugeWrap = document.querySelector('.gauge-wrap');
        const runnerMount = document.getElementById('runnerMount');
        runnerView?.dispose();
        runnerView = null;
        gaugeWrap.classList.remove('meter-hidden');
        runnerMount.hidden = true;
        runnerMount.dataset.loaded = 'false';
        document.querySelector('[data-display-mode="meter"]').setAttribute('aria-pressed', 'true');
        document.querySelector('[data-display-mode="run"]').setAttribute('aria-pressed', 'false');
        try { localStorage.setItem(DISPLAY_MODE_KEY, 'meter'); } catch (storageError) { console.warn(storageError); }
    }

    function setDisplayMode(mode, shouldPersist = true) {
        const gaugeWrap = document.querySelector('.gauge-wrap');
        const runnerMount = document.getElementById('runnerMount');
        const isRun = mode === 'run';
        document.querySelectorAll('[data-display-mode]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.displayMode === mode));
        });
        if (shouldPersist) {
            try { localStorage.setItem(DISPLAY_MODE_KEY, mode); } catch (error) { console.warn(error); }
        }
        if (!isRun) {
            gaugeWrap.classList.remove('meter-hidden');
            runnerMount.hidden = true;
            runnerView?.stop();
            return;
        }
        try {
            if (!runnerView) runnerView = new RunnerView(runnerMount);
            gaugeWrap.classList.add('meter-hidden');
            runnerMount.hidden = false;
            runnerView.start().catch(handleRunViewFailure);
        } catch (error) {
            handleRunViewFailure(error);
        }
    }

    function sampleMetrics() {
        if (!isPanelsDemo && !(window.controller && window.controller.connected)) return;
        const metrics = isPanelsDemo ? demoMetrics() : readMetrics();
        if (!isPanelsDemo) {
            wellnessLedger.record(metrics);
            renderWellness(wellnessLedger.getSummary());
        }
        appendMetricSample(metrics);
        const active = chartMetrics[activeChartMetric];
        document.getElementById('chartNow').textContent = `${active.format(currentChartValue(metrics))} ${active.unit}`;
        runnerView?.syncMetrics(metrics);
        drawChart();
    }

    function initializeDemo() {
        document.getElementById('connectOverlay').classList.add('hidden');
        const now = Date.now();
        metricHistory = Array.from({ length: MAX_SAMPLES }, (_, index) => {
            const ratio = index / (MAX_SAMPLES - 1);
            const speed = ratio < 0.2 ? 1.8 + ratio * 6 : ratio < 0.65 ? 3.2 : 3.0;
            return { t: now - (MAX_SAMPLES - index) * 1000, speed, distance: 0.13 * ratio, kcal: 8 * ratio };
        });
        renderWellness({
            today: { distanceKm: 1.32, seconds: 1540, kcal: 82 },
            total: { distanceKm: 12.4, seconds: 11740, kcal: 634 },
            streak: 4
        });
        const demo = demoMetrics();
        document.getElementById('currentSpeed').textContent = demo.speed.toFixed(1);
        document.getElementById('currentSpeed').classList.remove('idle');
        document.getElementById('currentDistance').textContent = demo.distanceKm.toFixed(2);
        document.getElementById('currentTime').textContent = formatDuration(demo.seconds);
        document.getElementById('currentCalories').textContent = demo.kcal.toFixed(0);
        document.getElementById('beltState').textContent = '走行中';
        document.getElementById('beltState').className = 'stat-value on';
        document.getElementById('speedZone').classList.add('running');
        setGauge(demo.speed);
    }

    function initializeChartInteraction() {
        const originalCanvas = document.getElementById('speedChart');
        const canvas = originalCanvas.cloneNode(false);
        originalCanvas.replaceWith(canvas);
        canvas.addEventListener('mousemove', event => {
            if (!chartPoints.length) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const nearest = chartPoints.reduce((best, point, index) => (
                Math.abs(point.x - x) < Math.abs(chartPoints[best].x - x) ? index : best
            ), 0);
            const point = chartPoints[nearest];
            const metric = chartMetrics[activeChartMetric];
            const tip = document.getElementById('chartTip');
            tip.textContent = `${metric.format(point.value)} ${metric.unit} · ${formatClock(point.t)}`;
            tip.style.left = `${point.x}px`;
            tip.style.top = `${point.y}px`;
            tip.hidden = false;
            drawChart(nearest);
        });
        canvas.addEventListener('mouseleave', () => {
            document.getElementById('chartTip').hidden = true;
            drawChart();
        });
    }

    initializeChartInteraction();
    document.querySelectorAll('[data-chart-metric]').forEach(button => {
        button.addEventListener('click', () => setChartMetric(button.dataset.chartMetric));
    });
    document.querySelectorAll('[data-display-mode]').forEach(button => {
        button.addEventListener('click', () => setDisplayMode(button.dataset.displayMode));
    });
    document.addEventListener('visibilitychange', () => {
        if (!runnerView) return;
        if (document.hidden) runnerView.stop();
        else if (document.querySelector('[data-display-mode="run"]').getAttribute('aria-pressed') === 'true') runnerView.start();
    });
    window.addEventListener('resize', () => drawChart());

    if (isPanelsDemo) initializeDemo();
    else renderWellness(wellnessLedger.getSummary());
    const savedMode = localStorage.getItem(DISPLAY_MODE_KEY);
    setDisplayMode(previewDisplayMode || (savedMode === 'run' ? 'run' : 'meter'), !previewDisplayMode);
    setChartMetric(activeChartMetric);
    sampleMetrics();
    setInterval(sampleMetrics, 1000);
})();
