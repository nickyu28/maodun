        // ══════════════════════════════════════════════════════════
        //  猫盾工业（硬核模式）· 第 1 阶段：骨架
        //  基地永久保留，每次出门远征一张新的开放地图，带东西回基地。设计稿在 docs/industry.md。
        //  这个文件只新增，不改别的模式：大厅按钮是运行时插进去的，selectGameMode / lobbyPrimaryStart 是包了一层，
        //  原来的函数照样调用。整个功能默认藏起来：IND_ENABLED 为 false 时，只有网址带 ?hcdebug=1（记在本机，?hcdebug=0 清掉）才看得到。
        //  存档单独放在浏览器的 IndexedDB（库 maodun_industry），不进主存档白名单，SAVE_VER 不动。
        //  第 1 阶段有：隐藏入口、基地（仓库箱、出发门、地上放的东西永久保存）、远征地图（地形、七种地貌、资源点、两个撤离点）、
        //  采集、撤离（站在撤离圈里 3 秒）、半路回大厅身上的东西丢掉。还没有：生存值、灶台、电、机器（后面的阶段）。
        // ══════════════════════════════════════════════════════════
        const IND_ENABLED = false;
        const IND_DBG_KEY = 'TH_hcdebug';
        function indDebugRead() {
            let q = null;
            try { let m = /[?&]hcdebug=([01])(&|$)/.exec(location.search); if (m) q = m[1]; } catch (e) { }
            if (q === '1') { try { localStorage.setItem(IND_DBG_KEY, '1'); } catch (e) { } return true; }
            if (q === '0') { try { localStorage.removeItem(IND_DBG_KEY); } catch (e) { } return false; }
            try { return localStorage.getItem(IND_DBG_KEY) === '1'; } catch (e) { return false; }
        }
        let IND_DBG_CACHE = null;
        function indDebugOn() { if (IND_DBG_CACHE === null) IND_DBG_CACHE = indDebugRead(); return IND_DBG_CACHE; }
        function indVisible() { return IND_ENABLED || indDebugOn(); }

        // ── 数值（冒烟测试可以改小）──
        const IND_T = { extract: 3, pickR: 2.6, gateR: 2.2, exitR: 3, speed: 7, run: 1.6 };
        const IND_BASE = { x: 20, z: 15 };            // 基地半宽、半深（40 × 30 米）
        const IND_MAP = 150;                          // 远征地图半宽（300 × 300 米）
        const IND_BAG_CAP = 6, IND_STACK = 99;        // 身上 6 种，每种最多 99 个
        const IND_EYE = 1.8;
        const IND_CAM = { back: 4.4, up: 1.2 };

        // ── 物品 ──
        // tool：采这个资源点要的稿子等级（0 空手，1 石稿，2 铁稿，3 钢稿）
        const IND_ITEMS = {
            wood: { name: '木头', col: 0x8d6e63 },
            stone: { name: '石头', col: 0x9e9e9e },
            sand: { name: '沙子', col: 0xffe082 },
            clay: { name: '黏土', col: 0xbcaaa4 },
            salt: { name: '盐', col: 0xf5f5f5 },
            coal: { name: '煤', col: 0x263238 },
            oil: { name: '石油', col: 0x212121 },
            ore_cu: { name: '铜矿', col: 0xd84315 },
            ore_zn: { name: '锌矿', col: 0x90a4ae },
            ore_fe: { name: '铁矿', col: 0x795548 },
            sulfur: { name: '硫', col: 0xfdd835 },
            ore_u: { name: '铀矿', col: 0x7cb342 },
            pick_stone: { name: '石稿', col: 0x757575, tool: 1 }
        };
        function indName(k) { return (IND_ITEMS[k] && IND_ITEMS[k].name) || k; }
        // 资源点：每种给几个、要什么稿子
        const IND_NODES = {
            wood: { give: [2, 4], tool: 0 }, stone: { give: [2, 3], tool: 0 }, sand: { give: [2, 4], tool: 0 }, clay: { give: [1, 3], tool: 0 },
            salt: { give: [1, 3], tool: 0 }, coal: { give: [1, 3], tool: 1 }, oil: { give: [1, 1], tool: 0 },
            ore_cu: { give: [1, 2], tool: 1 }, ore_zn: { give: [1, 2], tool: 1 }, ore_fe: { give: [1, 2], tool: 2 },
            sulfur: { give: [1, 3], tool: 1 }, ore_u: { give: [1, 1], tool: 3 }
        };
        const IND_TOOL_NAME = ['空手', '石稿', '铁稿', '钢稿'];
        // 地貌：名字、地面颜色、会刷什么资源（权重）
        const IND_BIOMES = {
            plain: { name: '平原', col: 0x9ccc65, res: { sand: 2, clay: 2, stone: 2, wood: 1 } },
            forest: { name: '森林', col: 0x558b2f, res: { wood: 6, clay: 1 } },
            beach: { name: '海边', col: 0xfff59d, res: { sand: 4, salt: 3 } },
            mountain: { name: '山地', col: 0x8d8d8d, res: { stone: 3, ore_cu: 2, ore_zn: 2, ore_fe: 2, coal: 2 } },
            desert: { name: '盐湖沙漠', col: 0xe6c27a, res: { sand: 3, salt: 3, oil: 1 } },
            volcano: { name: '火山', col: 0x5d4037, res: { sulfur: 5, stone: 1 } },
            ancient: { name: '古老岩层', col: 0x546e7a, res: { ore_u: 2, stone: 2, ore_fe: 1 } }
        };

        // ── 随机数和噪声（同一个种子生成同一张图）──
        function indRng(seed) {
            let s = (seed >>> 0) || 1;
            return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        }
        function indHash(ix, iz, seed) {
            let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        }
        function indNoise(x, z, seed) {
            let ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
            let u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
            let a = indHash(ix, iz, seed), b = indHash(ix + 1, iz, seed), c = indHash(ix, iz + 1, seed), d = indHash(ix + 1, iz + 1, seed);
            return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
        }
        function indFbm(x, z, seed) { return indNoise(x, z, seed) * 0.6 + indNoise(x * 2.1, z * 2.1, seed + 7) * 0.28 + indNoise(x * 4.3, z * 4.3, seed + 13) * 0.12; }

        // 一张远征地图：种子 → 地形高度、地貌、火山位置
        function indMakeMap(seed) {
            let r = indRng(seed), M = { seed: seed, volc: [] };
            // 1～2 座火山，在离出生点 60% 以外的地方
            let nv = 1 + (r() < 0.5 ? 1 : 0);
            for (let i = 0; i < nv; i++) { let a = r() * Math.PI * 2, d = IND_MAP * (0.62 + r() * 0.25); M.volc.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 16 + r() * 6 }); }
            return M;
        }
        function indElev(M, x, z) { return indFbm(x / 70, z / 70, M.seed); }
        function indMoist(M, x, z) { return indFbm(x / 90, z / 90, M.seed + 101); }
        function indBiome(M, x, z) {
            for (let i = 0; i < M.volc.length; i++) { let v = M.volc[i]; if (Math.hypot(x - v.x, z - v.z) < v.r) return 'volcano'; }
            let e = indElev(M, x, z), m = indMoist(M, x, z), rr = Math.hypot(x, z) / IND_MAP;
            if (Math.hypot(x, z) < 14) return 'plain';   // 出生点附近总是平地
            if (e < -0.28) return 'beach';
            if (e > 0.32) return rr > 0.78 ? 'ancient' : 'mountain';
            if (m < -0.25) return 'desert';
            if (m > 0.2) return 'forest';
            return 'plain';
        }
        function indHeight(M, x, z) {
            let h = indElev(M, x, z) * 9;
            let spawn = Math.max(0, 1 - Math.hypot(x, z) / 14); h *= (1 - spawn);   // 出生点压平
            for (let i = 0; i < M.volc.length; i++) {   // 火山：锥形，山顶有个坑
                let v = M.volc[i], d = Math.hypot(x - v.x, z - v.z);
                if (d < v.r * 1.6) { let t = 1 - d / (v.r * 1.6); h += t * t * 22 - (d < v.r * 0.3 ? (1 - d / (v.r * 0.3)) * 8 : 0); }
            }
            return Math.max(-3, h);
        }

        // ── 存档（IndexedDB，单独存）──
        const IND_DB = 'maodun_industry', IND_STORE = 'base', IND_SAVE_VER = 1;
        function indDb(cb) {
            try {
                let rq = indexedDB.open(IND_DB, 1);
                rq.onupgradeneeded = function () { try { rq.result.createObjectStore(IND_STORE); } catch (e) { } };
                rq.onsuccess = function () { cb(rq.result); };
                rq.onerror = function () { cb(null); };
            } catch (e) { cb(null); }
        }
        function indKey() { return 'p_' + (gState.id || 'guest'); }
        function indNewBase() { return { ver: IND_SAVE_VER, box: { pick_stone: 1 }, ground: [], trips: 0 }; }
        function indFixBase(b) {
            if (!b || typeof b !== 'object') b = indNewBase();
            if (!b.box || typeof b.box !== 'object') b.box = {};
            if (!Array.isArray(b.ground)) b.ground = [];
            b.ground = b.ground.filter(function (g) { return g && IND_ITEMS[g.k] && isFinite(g.x) && isFinite(g.z); });
            Object.keys(b.box).forEach(function (k) { if (!IND_ITEMS[k] || !(b.box[k] > 0)) delete b.box[k]; });
            if (typeof b.trips !== 'number') b.trips = 0;
            b.ver = IND_SAVE_VER;
            return b;
        }
        function indLoad(cb) {
            indDb(function (db) {
                if (!db) { cb(indNewBase()); return; }
                try {
                    let q = db.transaction(IND_STORE, 'readonly').objectStore(IND_STORE).get(indKey());
                    q.onsuccess = function () { cb(indFixBase(q.result)); db.close(); };
                    q.onerror = function () { cb(indNewBase()); db.close(); };
                } catch (e) { cb(indNewBase()); }
            });
        }
        let IND_SAVING = 0;
        function indSave(cb) {
            if (!ind) { if (cb) cb(false); return; }
            let data = JSON.parse(JSON.stringify(ind.base));
            IND_SAVING++;
            indDb(function (db) {
                let done = function (ok) { IND_SAVING--; if (db) try { db.close(); } catch (e) { } if (cb) cb(ok); };
                if (!db) { done(false); return; }
                try {
                    let tx = db.transaction(IND_STORE, 'readwrite');
                    tx.objectStore(IND_STORE).put(data, indKey());
                    tx.oncomplete = function () { done(true); };
                    tx.onerror = function () { done(false); };
                } catch (e) { done(false); }
            });
        }

        // ── 背包（身上 6 种）──
        function indBagAdd(k, n) {
            let B = ind.bag;
            if (!B[k] && Object.keys(B).length >= IND_BAG_CAP) return 0;
            let room = IND_STACK - (B[k] || 0), take = Math.max(0, Math.min(n, room));
            if (take > 0) B[k] = (B[k] || 0) + take;
            return take;
        }
        function indBagDel(k, n) { let B = ind.bag; if (!B[k]) return 0; let t = Math.min(n, B[k]); B[k] -= t; if (B[k] <= 0) delete B[k]; return t; }
        function indSel() { let ks = Object.keys(ind.bag); if (!ks.length) return null; ind.selIdx = Math.max(0, Math.min(ind.selIdx, ks.length - 1)); return ks[ind.selIdx]; }
        function indTool() { let t = 0; Object.keys(ind.bag).forEach(function (k) { if (IND_ITEMS[k].tool) t = Math.max(t, IND_ITEMS[k].tool); }); return t; }
        function indBoxAdd(k, n) { let b = ind.base.box; b[k] = (b[k] || 0) + n; }

        // ── 进出 ──
        let ind = null;
        function indFlash(t) { try { blazeFlash(t); } catch (e) { } }
        function indEnter() {
            if (!indVisible() || ind) return;
            ind = { loading: true };
            indLoad(function (base) {
                if (!ind || !ind.loading) return;
                indStart(base);
            });
        }
        function indStart(base) {
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            ensureScene();
            ind = {
                loading: false, over: false, t: 0, last: performance.now(), raf: null, base: base, bag: {}, selIdx: 0,
                where: 'base', map: null, nodes: [], exits: [], exitT: 0, k: {}, p: { x: 0, y: 0, z: 0, vy: 0 },
                objs: [], geos: [], mats: [], hudT: 0, hudSig: '', panel: null, oldBg: scene.background, oldFog: scene.fog, itemMesh: null, nodeMesh: null
            };
            indBuildPlayer();
            indGoBase(null);
            indBuildHud(); indBindKeys();
            camera.rotation.set(-0.3, 0, 0, 'YXZ');
            document.body.onmousedown = function (e) {
                if (!ind || ind.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal') || e.target.closest('#ind-panel'))) return;
                if (ind.panel) return;
                if (!document.pointerLockElement) safeLockPointer();
            };
            ind.onMouse = function (e) {
                if (!ind || ind.over || !document.pointerLockElement) return;
                if (e.target && e.target.closest && e.target.closest('button, #ind-panel, #sys-modal')) return;
                if (e.button === 0) indAction();
            };
            document.addEventListener('mousedown', ind.onMouse);
            if (gState.control !== 'pad') indFlash('点一下画面锁住鼠标：左键 采集／拿／用，Q 放下，Shift 跑，Esc 松开');
            ind.last = performance.now();
            ind.raf = requestAnimationFrame(indLoop);
        }
        // 半路回大厅：在基地里身上的东西收回仓库箱；在远征里身上的东西丢掉（和寻宝队一样，没撤离就不算）
        function indExit(confirmed) {
            if (!ind) return;
            if (ind.loading) { ind = null; return; }
            if (ind.where === 'trip' && !confirmed && Object.keys(ind.bag).length) {
                showSysModal('猫盾工业', '还没撤离，现在回大厅身上的东西会丢。', [{ label: '丢了也回', color: '#d84315', onClick: function () { indExit(true); } }, { label: '再想想' }]);
                return;
            }
            let R = ind; R.over = true;
            if (R.raf) cancelAnimationFrame(R.raf);
            if (R.where === 'base') Object.keys(R.bag).forEach(function (k) { indBoxAdd(k, R.bag[k]); });
            R.bag = {};
            indUnbindKeys(); indPanelClose();
            document.body.onmousedown = null;
            if (R.onMouse) document.removeEventListener('mousedown', R.onMouse);
            if (document.pointerLockElement) document.exitPointerLock();
            let hud = document.getElementById('ind-hud'); if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
            indClearWorld();
            if (R.me) { scene.remove(R.me); }
            scene.background = R.oldBg; scene.fog = R.oldFog;
            indSave(function () { });
            ind = null;
            nav('screen-lobby'); selectGameMode('industry');
        }

        // ── 场景 ──
        function indAdd(o) { scene.add(o); ind.objs.push(o); return o; }
        function indGeo(g) { ind.geos.push(g); return g; }
        function indMat(m) { ind.mats.push(m); return m; }
        function indClearWorld() {
            ind.objs.forEach(function (o) { scene.remove(o); if (o.material && o.material.map) o.material.map.dispose(); });
            ind.geos.forEach(function (g) { g.dispose(); });
            ind.mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
            ind.objs = []; ind.geos = []; ind.mats = []; ind.itemMesh = null; ind.nodeMesh = null; ind.nodes = []; ind.exits = [];
        }
        function indBox(w, h, d, col, x, y, z) {
            let m = new THREE.Mesh(indGeo(new THREE.BoxGeometry(w, h, d)), indMat(new THREE.MeshLambertMaterial({ color: col })));
            m.position.set(x, y, z); return indAdd(m);
        }
        function indSign(text, x, y, z, w, h) {
            let cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
            let g = cv.getContext('2d'); g.font = 'bold 80px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(text, 256, 68);
            g.fillStyle = '#fff'; g.fillText(text, 256, 68);
            let m = new THREE.Sprite(indMat(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })));
            m.scale.set(w * 1.3, h * 1.3, 1); m.position.set(x, y, z);
            return indAdd(m);
        }
        function indBuildPlayer() {
            let me = raceMakeBody(mySkinColor(0x42a5f5), 0, true, gState.acc, myFace());
            me.scale.setScalar(0.2); scene.add(me); ind.me = me;
        }
        // 地上的东西（基地里放的）：一个 InstancedMesh 画完，颜色按物品
        const IND_ITEM_CAP = 600;
        function indItemMesh() {
            let m = new THREE.InstancedMesh(indGeo(new THREE.BoxGeometry(0.5, 0.5, 0.5)), indMat(new THREE.MeshLambertMaterial({ color: 0xffffff })), IND_ITEM_CAP);
            m.count = 0; m.frustumCulled = false; indAdd(m); ind.itemMesh = m; ind.itemDirty = true;
        }
        let IND_DUMMY = null, IND_COL = null;
        function indSyncItems() {
            if (!ind.itemMesh || !ind.itemDirty) return;
            if (!IND_DUMMY) { IND_DUMMY = new THREE.Object3D(); IND_COL = new THREE.Color(); }
            let G = ind.base.ground, n = Math.min(G.length, IND_ITEM_CAP);
            for (let i = 0; i < n; i++) {
                IND_DUMMY.position.set(G[i].x, 0.25, G[i].z); IND_DUMMY.rotation.set(0, (i * 0.7) % 6.28, 0); IND_DUMMY.updateMatrix();
                ind.itemMesh.setMatrixAt(i, IND_DUMMY.matrix); ind.itemMesh.setColorAt(i, IND_COL.setHex(IND_ITEMS[G[i].k].col));
            }
            ind.itemMesh.count = n; ind.itemMesh.instanceMatrix.needsUpdate = true;
            if (ind.itemMesh.instanceColor) ind.itemMesh.instanceColor.needsUpdate = true;
            ind.itemDirty = false;
        }

        // 基地：一块地、一圈矮篱笆、仓库箱、出发门
        const IND_BASE_ST = { box: { x: -6, z: -10, name: '仓库箱' }, gate: { x: 0, z: -IND_BASE.z, name: '出发' } };
        function indGoBase(fromTrip) {
            indClearWorld();
            ind.where = 'base'; ind.map = null; ind.exitT = 0;
            scene.background = new THREE.Color(0xcfe8ff); scene.fog = null;
            let X = IND_BASE.x, Z = IND_BASE.z;
            let fl = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(2 * X + 20, 2 * Z + 20)), indMat(new THREE.MeshLambertMaterial({ color: 0xa5d6a7 })));
            fl.rotation.x = -Math.PI / 2; indAdd(fl);
            let pad = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(2 * X, 2 * Z)), indMat(new THREE.MeshLambertMaterial({ color: 0xbcaaa4 })));
            pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01; indAdd(pad);
            indBox(2 * X, 0.6, 0.2, 0x6d4c41, 0, 0.3, Z); indBox(0.2, 0.6, 2 * Z, 0x6d4c41, -X, 0.3, 0); indBox(0.2, 0.6, 2 * Z, 0x6d4c41, X, 0.3, 0);
            indBox(X - 2.5, 0.6, 0.2, 0x6d4c41, -(X + 2.5) / 2, 0.3, -Z); indBox(X - 2.5, 0.6, 0.2, 0x6d4c41, (X + 2.5) / 2, 0.3, -Z);
            let b = IND_BASE_ST.box; indBox(2.2, 1.2, 1.6, 0x455a64, b.x, 0.6, b.z); indSign(b.name, b.x, 2.2, b.z, 2.4, 0.6);
            let g = IND_BASE_ST.gate; indBox(0.4, 3.2, 0.4, 0x5d4037, g.x - 2.4, 1.6, g.z); indBox(0.4, 3.2, 0.4, 0x5d4037, g.x + 2.4, 1.6, g.z); indBox(5.2, 0.5, 0.5, 0x5d4037, g.x, 3.3, g.z);
            indSign('出发（远征）', g.x, 4.3, g.z, 3.2, 0.8);
            indItemMesh();
            ind.p.x = 0; ind.p.z = fromTrip ? -IND_BASE.z + 4 : 4; ind.p.y = 0; ind.p.vy = 0;
            if (fromTrip) {
                // 带回来的东西直接进仓库箱
                let got = Object.keys(ind.bag).map(function (k) { indBoxAdd(k, ind.bag[k]); return indName(k) + '×' + ind.bag[k]; });
                ind.bag = {}; ind.base.trips++;
                indSave();
                indFlash(got.length ? '撤离成功，带回：' + got.join('、') + '（都放进仓库箱了）' : '撤离成功，这次空手回来');
            }
        }

        // 远征：地形（一个网格，颜色按地貌）、水面、资源点（一个 InstancedMesh）、两个撤离点
        const IND_SEG = 120, IND_NODE_N = 420;
        function indGoTrip(seed) {
            indClearWorld();
            ind.where = 'trip'; ind.exitT = 0;
            let M = ind.map = indMakeMap(seed === undefined ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed);
            scene.background = new THREE.Color(0xbfe3ff); scene.fog = new THREE.Fog(0xbfe3ff, 60, 160);
            let geo = indGeo(new THREE.PlaneGeometry(IND_MAP * 2, IND_MAP * 2, IND_SEG, IND_SEG));
            geo.rotateX(-Math.PI / 2);
            let pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i), z = pos.getZ(i), h = indHeight(M, x, z), bm = indBiome(M, x, z);
                pos.setY(i, h);
                c.setHex(IND_BIOMES[bm].col); let sh = 0.92 + indHash(i, 3, M.seed) * 0.12; cols[i * 3] = c.r * sh; cols[i * 3 + 1] = c.g * sh; cols[i * 3 + 2] = c.b * sh;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            geo.computeVertexNormals();
            indAdd(new THREE.Mesh(geo, indMat(new THREE.MeshLambertMaterial({ vertexColors: true }))));
            let wat = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(IND_MAP * 2, IND_MAP * 2)), indMat(new THREE.MeshLambertMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.75 })));
            wat.rotation.x = -Math.PI / 2; wat.position.y = -1.2; indAdd(wat);
            // 资源点：按地貌的权重挑，铀只在古老岩层、硫只在火山（地貌表里已经限定）
            let r = indRng(M.seed ^ 0x9e3779b9);
            for (let i = 0; i < IND_NODE_N; i++) {
                let x = (r() * 2 - 1) * (IND_MAP - 4), z = (r() * 2 - 1) * (IND_MAP - 4);
                if (Math.hypot(x, z) < 8) continue;
                let h = indHeight(M, x, z); if (h < -1.0) continue;   // 水下不放
                let bm = indBiome(M, x, z), res = IND_BIOMES[bm].res, tot = 0;
                Object.keys(res).forEach(function (k) { tot += res[k]; });
                let pick = r() * tot, key = null;
                Object.keys(res).some(function (k) { pick -= res[k]; if (pick <= 0) { key = k; return true; } return false; });
                if (!key) continue;
                let nd = IND_NODES[key];
                ind.nodes.push({ key: key, x: x, z: z, y: h, n: nd.give[0] + Math.floor(r() * (nd.give[1] - nd.give[0] + 1)), dead: false });
            }
            let nm = new THREE.InstancedMesh(indGeo(new THREE.DodecahedronGeometry(0.7, 0)), indMat(new THREE.MeshLambertMaterial({ color: 0xffffff })), ind.nodes.length || 1);
            nm.frustumCulled = false; indAdd(nm); ind.nodeMesh = nm; ind.nodeDirty = true;
            // 出生点在地图中间；撤离点：回出发的门（出生点旁边）+ 地图上随机两个
            ind.exits.push({ x: 0, z: 6, name: '回家的门' });
            for (let i = 0; i < 2; i++) { let a = r() * Math.PI * 2, d = IND_MAP * (0.45 + r() * 0.35); ind.exits.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, name: '撤离点' }); }
            ind.exits.forEach(function (e) {
                let y = indHeight(M, e.x, e.z);
                let ring = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(IND_T.exitR, IND_T.exitR, 0.2, 24)), indMat(new THREE.MeshLambertMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.55 })));
                ring.position.set(e.x, y + 0.1, e.z); indAdd(ring);
                let beam = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(0.3, 0.3, 30, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.35 })));
                beam.position.set(e.x, y + 15, e.z); indAdd(beam);
                indSign(e.name, e.x, y + 3.2, e.z, 2.6, 0.65);
            });
            ind.p.x = 0; ind.p.z = -4; ind.p.y = indHeight(M, 0, -4); ind.p.vy = 0;
            indSave();   // 出门前存一次（基地里放的东西）
            indFlash('出发了！走回绿色撤离圈里站 ' + IND_T.extract + ' 秒才算带回来');
        }
        function indSyncNodes() {
            if (!ind.nodeMesh || !ind.nodeDirty) return;
            if (!IND_DUMMY) { IND_DUMMY = new THREE.Object3D(); IND_COL = new THREE.Color(); }
            let n = 0;
            ind.nodes.forEach(function (o, i) {
                if (o.dead) return;
                IND_DUMMY.position.set(o.x, o.y + 0.45, o.z); IND_DUMMY.rotation.set(0, i, 0);
                IND_DUMMY.scale.setScalar(o.key === 'wood' ? 1.3 : 1); IND_DUMMY.updateMatrix();
                ind.nodeMesh.setMatrixAt(n, IND_DUMMY.matrix); ind.nodeMesh.setColorAt(n, IND_COL.setHex(IND_ITEMS[o.key].col)); n++;
            });
            ind.nodeMesh.count = n; ind.nodeMesh.instanceMatrix.needsUpdate = true;
            if (ind.nodeMesh.instanceColor) ind.nodeMesh.instanceColor.needsUpdate = true;
            ind.nodeDirty = false;
        }

        // ── 主循环 ──
        function indLoop() {
            if (!ind || ind.over) return;
            if (introFrozen()) { ind.raf = requestAnimationFrame(indLoop); return; }   // R1：提示卡片开着时静止
            let now = performance.now(), dt = Math.min(0.05, (now - ind.last) / 1000);
            ind.last = now;
            indTick(dt);
            if (ind && !ind.over) { indRender(); ind.raf = requestAnimationFrame(indLoop); }
        }
        function indGround(x, z) { return ind.where === 'trip' ? Math.max(-1.2, indHeight(ind.map, x, z)) : 0; }
        function indTick(dt) {
            ind.t += dt;
            indMove(dt);
            if (ind.where === 'base') {
                let g = IND_BASE_ST.gate;
                if (Math.abs(ind.p.x - g.x) < IND_T.gateR && ind.p.z < g.z + 0.3) indGoTrip();
            } else {
                let inExit = ind.exits.some(function (e) { return Math.hypot(ind.p.x - e.x, ind.p.z - e.z) <= IND_T.exitR; });
                ind.exitT = inExit ? ind.exitT + dt : 0;
                if (ind.exitT >= IND_T.extract) indGoBase(true);
            }
            indSyncItems(); indSyncNodes();
            camera.position.set(ind.p.x, ind.p.y + IND_EYE, ind.p.z);
            ind.hudT -= dt; if (ind.hudT <= 0) { ind.hudT = 0.2; indHudUpdate(); }
        }
        function indMove(dt) {
            let R = ind, k = R.k, blocked = !!R.panel;
            let cd = new THREE.Vector3(); camera.getWorldDirection(cd); cd.y = 0;
            if (cd.lengthSq() < 1e-6) cd.set(0, 0, -1); cd.normalize();
            let fwd = blocked ? 0 : (k.w ? 1 : 0) - (k.s ? 1 : 0), strafe = blocked ? 0 : (k.d ? 1 : 0) - (k.a ? 1 : 0);
            if (!blocked && !fwd && !strafe && gState.control === 'pad') { fwd = -tMove.y; strafe = tMove.x; }
            let mx = cd.x * fwd - cd.z * strafe, mz = cd.z * fwd + cd.x * strafe;
            let sp = IND_T.speed * (k.run ? IND_T.run : 1);
            if (mx || mz) {
                let n = Math.hypot(mx, mz), run = Math.min(1, n); mx /= n; mz /= n;
                R.p.x += mx * sp * run * dt; R.p.z += mz * sp * run * dt;
                R.me.rotation.y = Math.atan2(mx, mz);
            }
            let lim = R.where === 'base' ? { x: IND_BASE.x - 0.6, z: IND_BASE.z - 0.6 } : { x: IND_MAP - 1, z: IND_MAP - 1 };
            R.p.x = Math.max(-lim.x, Math.min(lim.x, R.p.x));
            let zMin = R.where === 'base' && Math.abs(R.p.x) < IND_T.gateR ? -IND_BASE.z - 1 : -lim.z;   // 门口能走出去
            R.p.z = Math.max(zMin, Math.min(lim.z, R.p.z));
            let gy = indGround(R.p.x, R.p.z);
            if (k.jump && R.p.y <= gy + 0.001 && !blocked) R.p.vy = 9;
            R.p.vy -= 25 * dt; R.p.y += R.p.vy * dt;
            if (R.p.y < gy) { R.p.y = gy; R.p.vy = 0; }
            R.me.position.set(R.p.x, R.p.y, R.p.z);
        }
        function indRender() {
            let eye = camera.position.clone(), rx = camera.rotation.x, ry = camera.rotation.y, rz = camera.rotation.z;
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            let d = IND_CAM.back, cx = eye.x - dir.x * d, cz = eye.z - dir.z * d;
            let cy = Math.max(indGround(cx, cz) + 0.6, eye.y - dir.y * d + IND_CAM.up);
            camera.position.set(cx, cy, cz);
            camera.lookAt(eye.x + dir.x * 60, eye.y + dir.y * 60, eye.z + dir.z * 60);
            renderer.render(scene, camera);
            camera.position.copy(eye); camera.rotation.set(rx, ry, rz); camera.updateMatrixWorld();
        }

        // ── 瞄准和动作 ──
        // 面前 2.6 米内、朝镜头方向的最近目标：资源点 / 地上的东西 / 仓库箱
        function indAim() {
            let R = ind, f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
            let best = null, bd = 1e9;
            let consider = function (o, x, z, kind) {
                let dx = x - R.p.x, dz = z - R.p.z, d = Math.hypot(dx, dz);
                if (d > IND_T.pickR) return;
                if (d > 0.6 && (dx * f.x + dz * f.z) / d < 0.3) return;
                if (d < bd) { bd = d; best = { kind: kind, o: o }; }
            };
            if (R.where === 'trip') R.nodes.forEach(function (o) { if (!o.dead) consider(o, o.x, o.z, 'node'); });
            else {
                R.base.ground.forEach(function (o) { consider(o, o.x, o.z, 'item'); });
                let b = IND_BASE_ST.box; consider(b, b.x, b.z + 0.8, 'box');
            }
            return best;
        }
        function indAction() {
            if (!ind || ind.over || ind.panel) return;
            let a = indAim(); if (!a) return;
            if (a.kind === 'node') indGather(a.o);
            else if (a.kind === 'item') indPickItem(a.o);
            else if (a.kind === 'box') indPanelBox();
        }
        function indGather(o) {
            let nd = IND_NODES[o.key], tool = indTool();
            if (tool < nd.tool) { indFlash(indName(o.key) + '要' + IND_TOOL_NAME[nd.tool] + '才挖得动'); return false; }
            let got = indBagAdd(o.key, o.n);
            if (got <= 0) { indFlash('身上放不下了'); return false; }
            o.n -= got; if (o.n <= 0) { o.dead = true; ind.nodeDirty = true; }
            indFlash('+' + got + ' ' + indName(o.key));
            return true;
        }
        function indPickItem(o) {
            if (indBagAdd(o.k, 1) <= 0) { indFlash('身上放不下了'); return; }
            let G = ind.base.ground, i = G.indexOf(o); if (i >= 0) G.splice(i, 1);
            ind.itemDirty = true; indSave();
        }
        // Q：在基地里把选中的东西放在脚边（永久保存）；远征里放下就是扔掉（地图下次就没了）
        function indDrop() {
            if (!ind || ind.over || ind.panel) return;
            let k = indSel(); if (!k) return;
            if (ind.where === 'trip') { indBagDel(k, 1); indFlash('扔掉了 1 个' + indName(k)); return; }
            if (ind.base.ground.length >= IND_ITEM_CAP) { indFlash('地上放太多了'); return; }
            indBagDel(k, 1);
            let a = ind.base.ground.length * 2.399, rr = 0.25 * Math.sqrt(ind.base.ground.length % 12);
            let f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
            let x = ind.p.x + f.x * 1.0 + Math.cos(a) * rr, z = ind.p.z + f.z * 1.0 + Math.sin(a) * rr;
            x = Math.max(-IND_BASE.x + 0.5, Math.min(IND_BASE.x - 0.5, x)); z = Math.max(-IND_BASE.z + 0.5, Math.min(IND_BASE.z - 0.5, z));
            ind.base.ground.push({ k: k, x: x, z: z });
            ind.itemDirty = true; indSave();
        }

        // ── 仓库箱 ──
        const IND_BTN = 'margin:3px;padding:7px 12px;border:none;border-radius:6px;background:#455a64;color:#fff;font-size:14px;cursor:pointer;';
        function indPanelClose() { let p = document.getElementById('ind-panel'); if (p && p.parentNode) p.parentNode.removeChild(p); if (ind) ind.panel = null; }
        function indPanelBox() {
            indPanelClose(); if (!ind) return;
            if (document.pointerLockElement) document.exitPointerLock();
            ind.panel = 'box';
            let box = ind.base.box, ks = Object.keys(box);
            let rows = ks.length ? ks.map(function (k) {
                return '<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee;"><span>' + indName(k) + ' × ' + box[k] + '</span><span>' +
                    '<button style="' + IND_BTN + '" onclick="indBoxTake(\'' + k + '\',1)">拿 1</button><button style="' + IND_BTN + '" onclick="indBoxTake(\'' + k + '\',' + IND_STACK + ')">全拿</button></span></div>';
            }).join('') : '<div style="color:#999;padding:8px 0;">空的</div>';
            let p = document.createElement('div'); p.id = 'ind-panel';
            p.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:#fff;border-radius:10px;padding:14px;width:min(92vw,420px);max-height:70vh;overflow:auto;font-family:"Microsoft YaHei",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);';
            p.innerHTML = '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">仓库箱</div>' + rows +
                '<div style="margin-top:8px;text-align:right;"><button id="ind-box-putall" style="' + IND_BTN + 'background:#2e7d32;" onclick="indBoxPutAll()">身上的全部存入</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
            document.body.appendChild(p);
        }
        function indBoxTake(k, n) {
            if (!ind || !ind.base.box[k]) return;
            let t = indBagAdd(k, Math.min(n, ind.base.box[k]));
            if (t <= 0) indFlash('身上放不下了');
            ind.base.box[k] -= t; if (ind.base.box[k] <= 0) delete ind.base.box[k];
            indSave(); indPanelBox();
        }
        function indBoxPutAll() {
            if (!ind || ind.where !== 'base') return;
            Object.keys(ind.bag).forEach(function (k) { indBoxAdd(k, ind.bag[k]); });
            ind.bag = {}; indSave(); indPanelBox();
        }

        // ── 键盘、界面 ──
        const IND_KEYMAP = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
        function indKeyDown(e) {
            if (!ind || ind.over) return;
            let t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
            let k = (e.key || '').toLowerCase();
            if (IND_KEYMAP[k]) { ind.k[IND_KEYMAP[k]] = true; e.preventDefault(); return; }
            if (k === ' ') { ind.k.jump = true; e.preventDefault(); return; }
            if (k === 'shift') { ind.k.run = true; return; }
            if (e.repeat) return;
            if (k === 'escape') { if (ind.panel) indPanelClose(); return; }
            if (ind.panel) return;
            if (k === 'q' || k === 'g') indDrop(); else if (k === 'e' || k === 'f') indAction();
            else if (/^[1-6]$/.test(k)) ind.selIdx = +k - 1;
        }
        function indKeyUp(e) {
            if (!ind) return;
            let k = (e.key || '').toLowerCase();
            if (IND_KEYMAP[k]) ind.k[IND_KEYMAP[k]] = false; else if (k === ' ') ind.k.jump = false; else if (k === 'shift') ind.k.run = false;
        }
        function indBindKeys() { window.addEventListener('keydown', indKeyDown); window.addEventListener('keyup', indKeyUp); }
        function indUnbindKeys() { window.removeEventListener('keydown', indKeyDown); window.removeEventListener('keyup', indKeyUp); }
        function indHold(dir, on) { if (ind) ind.k[dir] = !!on; }
        function indBuildHud() {
            let d = document.createElement('div'); d.id = 'ind-hud';
            d.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;color:#222;';
            d.innerHTML =
                '<div id="ind-status" style="position:absolute;left:8px;top:8px;background:rgba(255,255,255,.92);padding:7px 12px;border-radius:8px;font-size:15px;font-weight:bold;line-height:1.5;"></div>' +
                '<div style="position:absolute;right:8px;top:8px;pointer-events:auto;"><button id="ind-btn-exit" style="' + IND_BTN + 'background:#d84315;font-size:18px;padding:10px 16px;" onclick="indExit()">返回大厅</button></div>' +
                '<div id="ind-hint" style="position:absolute;left:50%;bottom:150px;transform:translateX(-50%);color:#fff;padding:4px 12px;font-size:20px;font-weight:bold;white-space:nowrap;text-align:center;text-shadow:0 0 4px #000,0 0 4px #000;"></div>' +
                '<div style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #000;"></div>' +
                '<div style="position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:min(96vw,640px);text-align:center;pointer-events:auto;">' +
                '<div id="ind-bag" style="background:rgba(255,255,255,.92);border-radius:8px;padding:4px;min-height:34px;font-size:15px;"></div>' +
                '<div style="margin-top:2px;"><button id="ind-btn-act" style="' + IND_BTN + '" onclick="indAction()">采集/拿</button><button id="ind-btn-put" style="' + IND_BTN + '" onclick="indDrop()">放下 (Q)</button>' +
                '<button style="' + IND_BTN + '" ontouchstart="event.preventDefault();indHold(\'jump\',true)" ontouchend="indHold(\'jump\',false)" onmousedown="indHold(\'jump\',true)" onmouseup="indHold(\'jump\',false)">跳</button>' +
                '<button style="' + IND_BTN + '" ontouchstart="event.preventDefault();indHold(\'run\',true)" ontouchend="indHold(\'run\',false)" onmousedown="indHold(\'run\',true)" onmouseup="indHold(\'run\',false)">跑</button></div></div>';
            document.body.appendChild(d);
        }
        function indHudUpdate() {
            let R = ind; if (!R || R.over) return;
            let st;
            if (R.where === 'base') st = '基地　远征过 ' + R.base.trips + ' 次';
            else {
                let bm = IND_BIOMES[indBiome(R.map, R.p.x, R.p.z)].name;
                let near = R.exits.reduce(function (a, e) { let dd = Math.hypot(R.p.x - e.x, R.p.z - e.z); return dd < a ? dd : a; }, 1e9);
                st = '远征　' + bm + '　离出生点 ' + Math.round(Math.hypot(R.p.x, R.p.z)) + ' 米<br>最近的撤离点 ' + Math.round(near) + ' 米' + (R.exitT > 0 ? '　<b style="color:#2e7d32">撤离中 ' + Math.ceil(IND_T.extract - R.exitT) + '</b>' : '');
            }
            let ks = Object.keys(R.bag), sel = indSel(), bag = '';
            for (let i = 0; i < IND_BAG_CAP; i++) {
                let k = ks[i];
                if (k === undefined) { bag += '<span style="display:inline-block;margin:2px;padding:3px 9px;border-radius:12px;border:2px dashed #e0e0e0;color:#ccc;">' + (i + 1) + '</span>'; continue; }
                bag += '<span onclick="ind.selIdx=' + i + '" style="display:inline-block;margin:2px;padding:3px 7px;border-radius:12px;cursor:pointer;border:2px solid ' + (k === sel ? '#5e35b1' : '#cfd8dc') + ';background:' + (k === sel ? '#ede7f6' : '#fff') + ';">' + (i + 1) + ' ' + indName(k) + '×' + R.bag[k] + '</span>';
            }
            let a = indAim(), hint = '';
            if (a && a.kind === 'node') { let nd = IND_NODES[a.o.key]; hint = indName(a.o.key) + ' ×' + a.o.n + '<br><small>' + (indTool() >= nd.tool ? '左键：采集' : '要' + IND_TOOL_NAME[nd.tool]) + '</small>'; }
            else if (a && a.kind === 'item') hint = indName(a.o.k) + '<br><small>左键：拿</small>';
            else if (a && a.kind === 'box') hint = '仓库箱<br><small>左键：打开</small>';
            else if (R.where === 'base' && Math.hypot(R.p.x - IND_BASE_ST.gate.x, R.p.z - IND_BASE_ST.gate.z) < 6) hint = '从门里走出去就是远征';
            let sig = st + '|' + bag + '|' + hint;
            if (sig === R.hudSig) return; R.hudSig = sig;
            let s = document.getElementById('ind-status'); if (s) s.innerHTML = st;
            let b = document.getElementById('ind-bag'); if (b) b.innerHTML = bag;
            let h = document.getElementById('ind-hint'); if (h) h.innerHTML = hint;
        }

        // ── 大厅入口（运行时插按钮、包一层选模式和开始游戏；原函数照样调用）──
        function indRefreshButton(m) {
            let b = document.getElementById('btn-mode-industry');
            if (b) { b.style.display = indVisible() ? '' : 'none'; b.style.borderColor = m === 'industry' ? '#ef6c00' : '#ccc'; b.style.color = m === 'industry' ? '#ef6c00' : '#333'; }
        }
        (function indHookLobby() {
            try {
                let grid = document.getElementById('game-mode-select');
                if (grid && !document.getElementById('btn-mode-industry')) {
                    let b = document.createElement('button'); b.id = 'btn-mode-industry'; b.textContent = '猫盾工业';
                    b.style.cssText = 'display:none; margin:0; font-size:11px; padding:7px 2px;';
                    b.onclick = function () { selectGameMode('industry'); };
                    let lb = document.getElementById('btn-mode-lab');
                    if (lb && lb.nextSibling) grid.insertBefore(b, lb.nextSibling); else grid.appendChild(b);
                }
            } catch (e) { }
        })();
        const IND_ORIG_SELECT = selectGameMode;
        selectGameMode = function (m) {
            if (m === 'industry' && !indVisible()) m = 'hunt';   // 藏起来的时候选不到
            IND_ORIG_SELECT(m);
            indRefreshButton(m);
            if (m === 'industry') {
                let t = document.getElementById('lobby-title'); if (t) t.innerText = '猫盾工业';
                let mb = document.getElementById('mode-bar-current'); if (mb) mb.innerText = '猫盾工业';
            }
        };
        const IND_ORIG_START = lobbyPrimaryStart;
        lobbyPrimaryStart = function () {
            if (gState.gameMode === 'industry') { indEnter(); return; }   // 单人的，不跟队伍走
            return IND_ORIG_START.apply(this, arguments);
        };

        // ── 调试（只在 ?hcdebug=1 时有用，冒烟测试用）──
        function indAdvance(secs, step) {
            if (!indDebugOn() || !ind || ind.loading) return;
            step = step || 0.05;
            for (let t = 0; t < secs - 1e-9 && ind && !ind.over; t += step) indTick(step);
        }
        function indTeleport(x, z) { if (!indDebugOn() || !ind || ind.loading) return; ind.p.x = x; ind.p.z = z; ind.p.y = indGround(x, z); }
