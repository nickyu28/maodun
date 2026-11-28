        // ══ 荒野（第三种玩法）W1：无限地形，走到哪生成到哪（设计页 docs/wilderness.md）══
        // 地形是 种子 + 坐标 的函数：同一个种子同一个位置永远一样。世界切成 64 米的块，只留视野内的块；存档只存种子和玩家位置（以后加改动表）
        const WL = { C: 64, SEG: 16, keep: 150, saveT: 8, ver: 1, gen: 1 };   // ver：存档格式版本；gen：地形生成规则版本（以后改规则，老世界按存的 gen 走老规则，已有的世界不变）
        // 存档升级：每改一次格式就在这里加一步，老存档只升不丢。字段不认识的原样留着（作者 11-28：不许清存档）
        function wlMigrate(sv) {
            if (!sv || typeof sv !== 'object') return null;
            let v = sv.v || 0, d = Object.assign({}, sv);
            if (v < 1) { d.bag = d.bag || d.items || {}; d.houses = d.houses || []; d.mods = d.mods || {}; d.gen = d.gen || 1; d.x = +d.x || 0; d.z = +d.z || 0; d.v = 1; v = 1; }
            return d;
        }
        function wlKey() { return 'w_' + indKey().slice(2); }
        function wlDb(fn) { indDb(function (db) { fn(db); }); }
        function wlLoad(cb) {
            wlDb(function (db) {
                if (!db) { cb(null); return; }
                try { let q = db.transaction(IND_STORE, 'readonly').objectStore(IND_STORE).get(wlKey()); q.onsuccess = function () { cb(wlMigrate(q.result)); db.close(); }; q.onerror = function () { cb(null); db.close(); }; } catch (e) { cb(null); }
            });
        }
        function wlSave(cb) {
            if (!ind || !ind.wl || window.__saveportReload) { if (cb) cb(false); return; }
            let d = Object.assign({}, ind.wl.sv || {}, { v: WL.ver, gen: ind.wl.gen, seed: ind.wl.seed, x: Math.round(ind.p.x * 100) / 100, z: Math.round(ind.p.z * 100) / 100, mods: ind.wl.mods, houses: ind.wl.houses, bag: JSON.parse(JSON.stringify(ind.bag || {})) });
            wlDb(function (db) {
                if (!db) { if (cb) cb(false); return; }
                try { let tx = db.transaction(IND_STORE, 'readwrite'); tx.objectStore(IND_STORE).put(d, wlKey()); tx.oncomplete = function () { db.close(); if (cb) cb(true); }; tx.onerror = function () { db.close(); if (cb) cb(false); }; } catch (e) { if (cb) cb(false); }
            });
        }
        // 进荒野：有存档用存档的种子和位置，没有就新抽一个种子。W2 接进选玩法的卡片
        function indWildGo(seed) {
            if (!ind || ind.over || ind.loading) return;
            wlLoad(function (sv) {
                if (!ind || ind.over) return;
                let s = typeof seed === 'number' ? seed : (sv && sv.seed !== undefined ? sv.seed : ((Date.now() ^ (Math.random() * 1e9)) >>> 0));
                wlStart(s, sv && sv.seed === s ? sv : null);
            });
        }
        function wlStart(seed, sv) {
            if (ind.carve) ctCarveExit(true);
            indClearWorld(); mbReset();
            ind.where = 'trip'; ind.wildMode = true; ind.speed = 1; ind.exitT = 0; ind.tripFires = []; ind.rafts = []; ind.onRaft = null; ind.tripGround = []; ind.tripBench = []; ind.tripBombs = []; ind.tripRad = []; ind.mush = null; ind.seen = null; ind.nodeView = null;
            let M = ind.map = { seed: seed, volc: [], riv: null, rivers: [], wild: true, test: seed === WL_TEST };
            ind.wl = { seed: seed, gen: (sv && sv.gen) || WL.gen, mods: (sv && sv.mods) || {}, houses: (sv && sv.houses) || [], sv: sv, cells: {}, saveT: 0 };
            if (sv && sv.bag) ind.bag = JSON.parse(JSON.stringify(sv.bag));
            scene.background = new THREE.Color(0xbfe3ff); scene.fog = new THREE.Fog(0xbfe3ff, 30, IND_VIEW.day);
            ind.chunks = []; ind.nodes = []; ind.wild = []; ind.exits = []; ind.caves = []; ind.cave = null;
            let wat = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(1000, 1000)), indMat(new THREE.MeshLambertMaterial({ color: 0x1565c0, transparent: true, opacity: 0.8 })));
            wat.rotation.x = -Math.PI / 2; wat.position.y = IND_WATER_Y; indAdd(wat); ind.wl.water = wat;
            ind.nodeMesh = indInst(new THREE.DodecahedronGeometry(0.7, 0), 1); ind.nodeDirty = true; wdMakeMeshes();
            ind.fireMesh = indInst(new THREE.ConeGeometry(0.45, 0.9, 7), 30); ind.fireDirty = true;
            ind.animalMesh = indInst(new THREE.BoxGeometry(1, 1, 1), 120);
            let x = sv ? sv.x : 0, z = sv ? sv.z : 0;
            ind.p.x = x; ind.p.z = z; ind.p.y = indHeight(M, x, z); ind.p.vy = 0;
            wlSync(true);
            wlTestPanel(M.test && wlDevOn());
            indFlash(M.test ? '荒野测试图' : '荒野');
        }
        // 地形块：64 米一块，16 段（4 米一格），边上多算一圈高度做法线
        function wlBuild(ci, cj) {
            let M = ind.map, C = WL.C, S = WL.SEG, st = C / S, n = S + 1, x0 = ci * C, z0 = cj * C;
            let H = new Float32Array((n + 2) * (n + 2));
            for (let b = 0; b < n + 2; b++) for (let a = 0; a < n + 2; a++) H[b * (n + 2) + a] = indHeight(M, x0 + (a - 1) * st, z0 + (b - 1) * st);
            let pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [], c = new THREE.Color();
            for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
                let v = b * n + a, k = (b + 1) * (n + 2) + a + 1, x = x0 + a * st, z = z0 + b * st, h = H[k];
                let hx = (H[k + 1] - H[k - 1]) / (2 * st), hz = (H[k + n + 2] - H[k - n - 2]) / (2 * st), l = Math.hypot(hx, 1, hz);
                pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z; nor[v * 3] = -hx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -hz / l;
                c.setHex(IND_BIOMES[indBiome(M, x, z)].col); let sh = 0.92 + indHash(Math.round(x), Math.round(z), M.seed) * 0.12;
                col[v * 3] = c.r * sh; col[v * 3 + 1] = c.g * sh; col[v * 3 + 2] = c.b * sh;
            }
            for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) { let v00 = b * n + a, v10 = v00 + 1, v01 = v00 + n, v11 = v01 + 1; idx.push(v00, v01, v10, v10, v01, v11); }
            let g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            g.setIndex(idx); g.computeBoundingSphere();
            let m = new THREE.Mesh(g, ind.wl.mat || (ind.wl.mat = indMat(new THREE.MeshLambertMaterial({ vertexColors: true }))));
            scene.add(m); m.userData.box = { x0: x0, x1: x0 + C, z0: z0, z1: z0 + C };
            return m;
        }
        // 每帧：补上视野内缺的块（一帧最多建 1 块），扔掉走远的块，水面跟着人
        function wlSync(all) {
            if (!ind || !ind.wl || !ind.p) return;
            let W = ind.wl, C = WL.C, vr = indViewR() + IND_VIEW.margin + 10, ci = Math.floor(ind.p.x / C), cj = Math.floor(ind.p.z / C), R = Math.ceil(vr / C) + 1, made = 0;
            let dist = function (i, j) { let dx = Math.max(i * C - ind.p.x, 0, ind.p.x - (i + 1) * C), dz = Math.max(j * C - ind.p.z, 0, ind.p.z - (j + 1) * C); return Math.hypot(dx, dz); };
            let want = [];
            for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) { let d = dist(i, j); if (d <= vr) want.push([d, i, j]); }
            want.sort(function (a, b) { return a[0] - b[0]; });
            for (let q = 0; q < want.length; q++) {
                let key = want[q][1] + ',' + want[q][2], m = W.cells[key];
                if (!m) { if (!all && made >= 1) continue; m = W.cells[key] = wlBuild(want[q][1], want[q][2]); made++; }
                m.visible = true;
            }
            Object.keys(W.cells).forEach(function (key) {
                let ij = key.split(','), d = dist(+ij[0], +ij[1]), m = W.cells[key];
                if (d > vr) m.visible = false;
                if (d > WL.keep + vr) { scene.remove(m); m.geometry.dispose(); delete W.cells[key]; }
            });
            W.water.position.x = ind.p.x; W.water.position.z = ind.p.z;
        }
        function wlCellCount() { return ind && ind.wl ? Object.keys(ind.wl.cells).filter(function (k) { return ind.wl.cells[k].visible; }).length : 0; }
        (function () {
            let t0 = indTick;
            indTick = function (dt) {
                let r = t0.apply(this, arguments);
                if (ind && ind.wildMode && ind.wl && !ind.over && !ind.paused) {
                    wlSync(false);
                    ind.wl.saveT += dt; if (ind.wl.saveT >= WL.saveT) { ind.wl.saveT = 0; wlSave(); }
                }
                return r;
            };
        })();

        // ══ 测试种子 67：不按生成规则，把要测的东西摆在出生点旁边（作者 11-28）══
        // 只有网址带 ?dev=1 或开了 ?hcdebug=1 才有测试按钮，玩家看不到。每个新世界还是随机种子
        const WL_TEST = 67, WL_TEST_R = 90;
        const WL_TEST_SECT = ['forest', 'beach', 'mountain', 'desert', 'volcano', 'ancient', 'plain'];
        function wlDevOn() { try { return /[?&]dev=1(&|$)/.test(location.search) || indDebugOn(); } catch (e) { return false; } }
        function wlNormalH(M, e0) { return e0 * 9 + Math.max(0, e0 - 0.32) * 26; }
        function wlSmooth(a, b, x) { let t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
        function wlTestW(x, z) { return 1 - wlSmooth(WL_TEST_R - 12, WL_TEST_R + 8, Math.hypot(x, z)); }
        function wlTestSect(x, z) { let a = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2); return WL_TEST_SECT[Math.min(WL_TEST_SECT.length - 1, Math.floor(a * WL_TEST_SECT.length))]; }
        function wlTestBiome(x, z) { let r = Math.hypot(x, z); if (r > WL_TEST_R) return null; if (r < 14) return 'plain'; return wlTestSect(x, z); }
        // 出生点 14 米内是平地；外面一圈按方向分扇区，每个扇区一种群系：森林、海边（带一个湖）、山地（坡）、沙漠、火山、古老岩层、平原
        function wlTestH(x, z) {
            let r = Math.hypot(x, z), k = wlSmooth(14, 26, r), sc = r < 14 ? 'plain' : wlTestSect(x, z), t = 1;
            if (sc === 'beach') t = r > 30 && r < 70 ? -2.4 : 1;
            else if (sc === 'mountain') t = 1 + Math.max(0, r - 20) * 0.22;
            return 1 + (t - 1) * k;
        }
        const WL_TEST_BAG = { wood: 40, stone: 40, clay: 20, rope: 10, coal: 20, ore_cu: 10, ore_sn: 10, ore_fe: 10, salt: 10, wool: 5, leather: 5, pick_stone: 1, shears: 1, bucket: 2, seeds: 5 };
        function wlTestGive() { Object.keys(WL_TEST_BAG).forEach(function (k) { if (IND_ITEMS[k]) indGive(k, WL_TEST_BAG[k]); }); indFlash('给了一套材料和工具'); }
        function wlTestHome() { ind.p.x = 0; ind.p.z = 0; ind.p.y = indHeight(ind.map, 0, 0); ind.p.vy = 0; wlSync(true); }
        function wlTestTime(t) { let c = ind.base.clock; ind.base.clock = c - (c % IND_DAY) + t; indFlash(indClockTxt()); }
        function wlTestSeason() { ind.base.clock += IND_SEASON_DAYS * IND_DAY; indFlash(indSeasonTxt()); }
        function wlTestSurv(f, w, t) { let S = ind.base.surv; if (f !== null) S.food = f; if (w !== null) S.water = w; if (t !== null) S.temp = t; }
        function wlTestWeather(k) { ind.wl.weather = k; indFlash('天气：' + k); }
        function wlTestPanel(on) {
            let id = 'wl-test', e = document.getElementById(id);
            if (!on) { if (e && e.parentNode) e.parentNode.removeChild(e); return; }
            if (e) return;
            let B = [['给物品', wlTestGive], ['出生点', wlTestHome], ['白天', function () { wlTestTime(60); }], ['傍晚', function () { wlTestTime(870); }], ['夜里', function () { wlTestTime(1000); }], ['下一季', wlTestSeason],
                ['晴', function () { wlTestWeather('晴'); }], ['雨', function () { wlTestWeather('雨'); }], ['雪', function () { wlTestWeather('雪'); }], ['冻', function () { wlTestSurv(null, null, 30); }], ['热', function () { wlTestSurv(null, null, 40); }], ['体温正常', function () { wlTestSurv(null, null, 37); }],
                ['饿渴', function () { wlTestSurv(5, 5, null); }], ['吃饱喝足', function () { wlTestSurv(100, 100, null); }]];
            e = document.createElement('div'); e.id = id;
            e.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:90;display:flex;flex-wrap:wrap;gap:4px;max-width:340px;background:rgba(0,0,0,.55);padding:6px;border-radius:8px;';
            let t = document.createElement('div'); t.style.cssText = 'width:100%;color:#fff;font-size:12px;'; t.textContent = '荒野测试'; e.appendChild(t);
            B.forEach(function (b) { let u = document.createElement('button'); u.style.cssText = IND_BTN + 'font-size:12px;padding:4px 8px;min-height:30px;background:#455a64;'; u.textContent = b[0]; u.addEventListener('click', b[1]); e.appendChild(u); });
            document.body.appendChild(e);
        }
        (function () {
            let c0 = indClearWorld, x0 = indExit;
            indClearWorld = function () { wlTestPanel(false); return c0.apply(this, arguments); };
            indExit = function () { wlTestPanel(false); return x0.apply(this, arguments); };
        })();
