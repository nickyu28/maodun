        // ══ 荒野（第三种玩法）W1：无限地形，走到哪生成到哪（设计页 docs/wilderness.md）══
        // 地形是 种子 + 坐标 的函数：同一个种子同一个位置永远一样。世界切成 64 米的块，只留视野内的块；存档只存种子和玩家位置（以后加改动表）
        const WL = { C: 64, SEG: 16, keep: 150, saveT: 8 };
        function wlKey() { return 'w_' + indKey().slice(2); }
        function wlDb(fn) { indDb(function (db) { fn(db); }); }
        function wlLoad(cb) {
            wlDb(function (db) {
                if (!db) { cb(null); return; }
                try { let q = db.transaction(IND_STORE, 'readonly').objectStore(IND_STORE).get(wlKey()); q.onsuccess = function () { cb(q.result || null); db.close(); }; q.onerror = function () { cb(null); db.close(); }; } catch (e) { cb(null); }
            });
        }
        function wlSave(cb) {
            if (!ind || !ind.wl || window.__saveportReload) { if (cb) cb(false); return; }
            let d = { v: 1, seed: ind.wl.seed, x: Math.round(ind.p.x * 100) / 100, z: Math.round(ind.p.z * 100) / 100, mods: ind.wl.mods };
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
            let M = ind.map = { seed: seed, volc: [], riv: null, rivers: [], wild: true };
            ind.wl = { seed: seed, mods: (sv && sv.mods) || {}, cells: {}, saveT: 0 };
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
            indFlash('荒野');
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
