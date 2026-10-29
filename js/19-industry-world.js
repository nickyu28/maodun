// 猫盾工业 · 世界（L）：600 米地图的指南针、地图、挖地、树、露头、河、仙人掌
// 接在 19-industry.js 后面，用它里面的函数和表；钩子在 19-industry.js 的 indGoTrip、indTick、indKeyDown、indHudUpdate 等处。
        // ── 走过的地方（地图用）：6 米一格，100 × 100 ──
        const WD_CELL = 6, WD_N = 100;
        function wdTripInit() {
            ind.seen = new Uint8Array(WD_N * WD_N); ind.seenBiome = new Uint8Array(WD_N * WD_N); ind.seenAt = null;
            ind.mapKeys = Object.keys(IND_BIOMES);
        }
        function wdCellOf(x, z) { return { i: Math.floor((x + IND_MAP) / WD_CELL), j: Math.floor((z + IND_MAP) / WD_CELL) }; }
        function wdMark(r) {
            let c = wdCellOf(ind.p.x, ind.p.z), n = Math.ceil(r / WD_CELL);
            for (let di = -n; di <= n; di++) for (let dj = -n; dj <= n; dj++) {
                let i = c.i + di, j = c.j + dj; if (i < 0 || j < 0 || i >= WD_N || j >= WD_N) continue;
                if (Math.hypot(di, dj) * WD_CELL > r) continue;
                let k = j * WD_N + i; if (ind.seen[k]) continue;
                ind.seen[k] = 1; ind.seenBiome[k] = Math.max(0, ind.mapKeys.indexOf(indBiome(ind.map, -IND_MAP + (i + 0.5) * WD_CELL, -IND_MAP + (j + 0.5) * WD_CELL)));
            }
        }
        // 每帧（远征里）：脚下的撤离点走开才生效；80 米内看见过的撤离点；走过的地方；指南针
        function wdTripTick(dt) {
            ind.exits.forEach(function (e) {
                let d = Math.hypot(ind.p.x - e.x, ind.p.z - e.z);
                if (e.armed === false && d > IND_T.exitR + 1) e.armed = true;
                if (d <= IND_VIEW.day) e.seen = true;
            });
            if (!ind.seen) wdTripInit();
            if (!ind.seenAt || Math.hypot(ind.p.x - ind.seenAt.x, ind.p.z - ind.seenAt.z) >= 3) { ind.seenAt = { x: ind.p.x, z: ind.p.z }; wdMark(30); }
        }
        // 指南针：背包里有就在屏幕上方显示指向最近撤离点的箭头和距离
        function wdNearestExit() {
            let best = null, bd = 1e9;
            (ind.exits || []).forEach(function (e) { let d = Math.hypot(ind.p.x - e.x, ind.p.z - e.z); if (d < bd) { bd = d; best = e; } });
            return best ? { e: best, d: bd } : null;
        }
        function wdCompassTick() {
            let el = document.getElementById('ind-compass'), on = ind.where === 'trip' && ind.bag.compass > 0 && !ind.dead;
            if (!on) { if (el && el.parentNode) el.parentNode.removeChild(el); ind.compass = null; return; }
            if (!el) { el = document.createElement('div'); el.id = 'ind-compass'; el.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:42;pointer-events:none;background:rgba(0,0,0,.55);color:#fff;font-family:"Microsoft YaHei",sans-serif;font-size:16px;font-weight:bold;padding:4px 14px;border-radius:18px;text-align:center;min-width:90px;'; el.innerHTML = '<span id="ind-compass-a" style="display:inline-block;color:#76ff03;">▲</span> <span id="ind-compass-t"></span>'; document.body.appendChild(el); }
            let n = wdNearestExit(); if (!n) return;
            let f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
            let tx = n.e.x - ind.p.x, tz = n.e.z - ind.p.z, rx = -f.z, rz = f.x;
            let ang = Math.atan2(tx * rx + tz * rz, tx * f.x + tz * f.z) * 180 / Math.PI;
            ind.compass = { deg: ang, d: n.d };
            document.getElementById('ind-compass-a').style.transform = 'rotate(' + ang.toFixed(0) + 'deg)';
            document.getElementById('ind-compass-t').textContent = Math.round(n.d) + ' 米';
        }
        // ── 地图（按 M）：走过的地方的地貌颜色，没走过的灰；看见过的撤离点；自己的位置 ──
        function wdMapToggle() {
            if (ind.panel === 'map') { indPanelClose(); return; }
            if (ind.where !== 'trip') { indFlash('远征里按 M 看地图'); return; }
            indPanelShow('map', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">地图　<small style="color:#888;font-weight:normal;">走过的地方有颜色，绿圈是看见过的撤离点，红点是你</small></div><canvas id="ind-map" width="300" height="300" style="width:min(80vw,300px);height:min(80vw,300px);display:block;margin:0 auto;border:1px solid #999;"></canvas><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            wdMapDraw();
        }
        function wdMapDraw() {
            let cv = document.getElementById('ind-map'); if (!cv || !ind.seen) return;
            let g = cv.getContext('2d'), px = cv.width / (IND_MAP * 2);
            g.fillStyle = '#9e9e9e'; g.fillRect(0, 0, cv.width, cv.height);
            for (let j = 0; j < WD_N; j++) for (let i = 0; i < WD_N; i++) {
                let k = j * WD_N + i; if (!ind.seen[k]) continue;
                g.fillStyle = '#' + ('000000' + IND_BIOMES[ind.mapKeys[ind.seenBiome[k]]].col.toString(16)).slice(-6);
                g.fillRect(i * WD_CELL * px, j * WD_CELL * px, WD_CELL * px + 0.6, WD_CELL * px + 0.6);
            }
            g.lineWidth = 2; g.strokeStyle = '#00c853';
            ind.exits.forEach(function (e) { if (!e.seen) return; g.beginPath(); g.arc((e.x + IND_MAP) * px, (e.z + IND_MAP) * px, 6, 0, 7); g.stroke(); });
            g.fillStyle = '#e53935'; g.beginPath(); g.arc((ind.p.x + IND_MAP) * px, (ind.p.z + IND_MAP) * px, 4, 0, 7); g.fill();
        }

        // ── 物品：仙人掌、小刀 ──
        Object.assign(IND_ITEMS_RAW, {
            cactus: { name: '仙人掌', col: 0x2e7d32, eat: { w: 5 }, use: '有刺：选中按住右键拔刺，点一下右键是吃' },
            cactus_peeled: { name: '去刺仙人掌', col: 0x66bb6a, eat: { w: 8, f: 3 } },
            cactus_roast: { name: '烤仙人掌', col: 0x8bc34a, eat: { w: 8, f: 5 } },
            knife: { name: '小刀', col: 0x90a4ae, useLater: '现在只用来拔刺', use: '拔仙人掌的刺（15 秒）' }
        });
        IND_CRAFT.push({ out: 'knife', in: { stone: 2, wood: 1 } });
        IND_RECIPES.push({ in: { cactus_peeled: 1 }, out: { cactus_roast: 1 }, minT: 180, time: 5, burnT: 400 });

        // ── 通道：站着不动做一会儿的动作（砍树、挖地、拔刺）；动了、瞄走了、再点一下就中断 ──
        function wdChStart(ch) { ind.ch = Object.assign({ t: 0, px: ind.p.x, pz: ind.p.z }, ch); return true; }
        function wdChTick(dt) {
            let c = ind.ch; if (!c) return;
            if (Math.hypot(ind.p.x - c.px, ind.p.z - c.pz) > 0.35) { ind.ch = null; indFlash('动了，中断了'); return; }
            if (c.kind === 'peel' && indSel() !== 'cactus') { ind.ch = null; return; }
            if (c.o && c.kind === 'chop') { let a = indAim(); if (!a || a.o !== c.o) { ind.ch = null; return; } }
            c.t += dt;
            if (c.t >= c.need) { ind.ch = null; c.done(); }
        }
        // 砍树：空手 8 秒、拿着稿子 3 秒，出 3～6 木头，倒下留树桩
        function wdChop(o) { return wdChStart({ kind: 'chop', o: o, need: indTool() >= 1 ? 3 : 8, label: '砍树', done: function () { indGather(o); } }); }
        // 对着地面挖：空手 3 秒、稿子 1 秒，每次 1 份；平原森林泥土、海边沙漠沙子、山地古老岩层火山石头（要石稿，火山偶尔 1 份硫），地上留一个小坑
        const WD_DIG = { plain: 'dirt', forest: 'dirt', beach: 'sand', desert: 'sand', mountain: 'stone', ancient: 'stone', volcano: 'stone' };
        function wdDig() {
            let f = indFace(), x = ind.p.x + f.x * 1.8, z = ind.p.z + f.z * 1.8, h = indHeight(ind.map, x, z);
            if (h < IND_WATER_Y + 0.25) { indFlash('水里挖不了'); return false; }
            let bm = indBiome(ind.map, x, z), k = WD_DIG[bm];
            if (k === 'stone' && indTool() < 1) { indFlash('挖石头要石稿'); return false; }
            return wdChStart({ kind: 'dig', need: indTool() >= 1 ? 1 : 3, label: '挖地', done: function () {
                let item = k;
                if (bm === 'volcano' && indHard() && indRand() < 0.1) item = 'sulfur';
                if (indBagAdd(item, 1) <= 0) { indFlash('背包满了'); return; }
                wdPit(x, z, h, false); indFlash('+1 ' + indName(item));
            } });
        }
        function wdPit(x, z, y, big) {
            let P = ind.pits, q = P.filter(function (p) { return Math.hypot(p.x - x, p.z - z) < 0.9; })[0];
            if (q) q.d = Math.min(6, q.d + 1); else { P.push({ x: x, z: z, y: y, d: big ? 6 : 1 }); if (P.length > 800) P.shift(); }
            ind.nodeDirty = true;
        }
        function wdNodeGone(o) {
            if (o.tree) ind.stumps.push({ x: o.x, z: o.z, y: o.y });
            else if (o.out) wdPit(o.x, o.z, o.y, true);
            ind.nodeDirty = true;
        }
        // 仙人掌：空手采（选中的不是剪刀或稿子）硬核固定扣 60 血，悠闲只提示；返回 true 表示人死了
        function wdThorn() {
            let sel = indSel(), safe = sel === 'shears' || (sel && IND_ITEMS[sel] && IND_ITEMS[sel].tool > 0);
            if (safe) return false;
            if (!indHard()) { indFlash('扎手了'); return false; }
            return indHurt(60, 'thorn', '空手摘了仙人掌');
        }
        // 拔刺：选中仙人掌按住右键站着不动，背包里最快的工具：小刀 15 秒、剪刀 30 秒、钳子 40 秒、空手 60 秒
        function wdPeelTime() { return ind.bag.knife ? 15 : ind.bag.shears ? 30 : ind.bag.tongs ? 40 : 60; }
        function wdPeelStart() {
            return wdChStart({ kind: 'peel', right: true, need: wdPeelTime(), label: '拔刺', done: function () {
                if (!(ind.bag.cactus > 0)) return;
                indBagDel('cactus', 1); indBagAdd('cactus_peeled', 1); indFlash('拔好了刺：去刺仙人掌');
            } });
        }
        const WD_TREE_NAME = { oak: '阔叶树', pine: '松树', palm: '椰子树' };
        function wdNodeHint(o) {
            let nd = IND_NODES[o.key];
            if (o.tree) return WD_TREE_NAME[o.tree] + '（' + o.n + ' 木头）<br><small>左键：砍（' + (indTool() >= 1 ? 3 : 8) + ' 秒，站着别动）</small>';
            if (o.key === 'cactus') return '仙人掌：有刺<br><small>左键：采集（拿剪刀或稿子不扎手）</small>';
            if (o.rock) return (o.black ? '黑石头' : '大石头') + ' ×' + o.n + '<br><small>' + (indTool() >= nd.tool ? '左键：敲' : '要' + IND_TOOL_NAME[nd.tool]) + '</small>';
            if (o.out) return indName(o.key) + '矿脉　剩 ' + o.n + ' 份<br><small>' + (indTool() >= nd.tool ? '左键：挖（一次 1 份）' : '要' + IND_TOOL_NAME[nd.tool]) + '</small>';
            let nm = o.key === 'seeds' ? '野生' + indName(o.seed) : (nd.name || indName(o.key));
            return nm + ' ×' + o.n + '<br><small>' + (indTool() >= nd.tool ? '左键：采集' : '要' + IND_TOOL_NAME[nd.tool]) + '</small>';
        }
        function wdBookLines() {
            return [
                { ins: [], outs: ['dirt', 'sand', 'stone', 'sulfur'], name: '挖地', txt: '对着地面左键，站着别动：空手 3 秒、稿子 1 秒，每次 1 份。平原森林出泥土，海边沙漠出沙子，山地古老岩层出石头（要石稿），火山出石头（偶尔 1 份硫）', where: '远征' },
                { ins: [], outs: ['wood'], name: '砍树', txt: '树：左键砍，空手 8 秒、稿子 3 秒，出 3～6 木头，倒下留树桩', where: '远征' },
                { ins: ['cactus'], outs: ['cactus'], name: '仙人掌', txt: '仙人掌：空手采会扎手（硬核扣 60 血），拿剪刀或稿子采不扎；生吃口渴 +5（硬核扣 60 血）', where: '盐湖沙漠' },
                { ins: ['cactus', 'knife', 'shears', 'tongs'], outs: ['cactus_peeled'], name: '拔刺', txt: '仙人掌 → 去刺仙人掌（口渴 +8、饱食 +3）：选中仙人掌按住右键站着不动，小刀 15 秒、剪刀 30 秒、钳子 40 秒、空手 60 秒', where: '手上' }
            ];
        }

        // ── 画：视野内的树、石头、露头、仙人掌、树桩、坑（InstancedMesh，一类一个）──
        const WD_TREE = { oak: { th: 2.2, tw: 0.55, cy: 3.2, cs: [1.7, 1.5, 1.7], col: 0x43a047 }, pine: { th: 1.8, tw: 0.45, cy: 3.4, cs: [1.1, 2.3, 1.1], col: 0x1b5e20 }, palm: { th: 3.8, tw: 0.4, cy: 4.1, cs: [1.9, 0.55, 1.9], col: 0x9ccc65 } };
        function wdMakeMeshes() {
            let n = Math.max(1, ind.nodes.length);
            ind.wd = {
                trunk: indInst(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), n), crown: indInst(new THREE.DodecahedronGeometry(1, 0), n),
                rock: indInst(new THREE.DodecahedronGeometry(1, 0), n), ore: indInst(new THREE.DodecahedronGeometry(0.6, 0), n),
                stump: indInst(new THREE.CylinderGeometry(0.3, 0.38, 0.35, 7), 600), pit: indInst(new THREE.CylinderGeometry(1, 0.7, 0.08, 10), 800)
            };
            ind.stumps = []; ind.pits = [];
        }
        function wdSyncNodes() {
            if (!ind.nodeMesh || !ind.wd) return;
            let trip = ind.where === 'trip', vr = trip ? indViewR() + IND_VIEW.margin : 1e9, nv = ind.nodeView;
            if (!ind.nodeDirty && nv && Math.hypot(ind.p.x - nv.x, ind.p.z - nv.z) < 6 && Math.abs(nv.r - vr) < 4) return;
            ind.nodeView = { x: ind.p.x, z: ind.p.z, r: vr };
            if (trip) wdChunkSync(vr);
            indDummy();
            let W = ind.wd, c = { p: 0, t: 0, r: 0, o: 0, s: 0, q: 0 };
            let set = function (mesh, idx, x, y, z, sx, sy, sz, ry, col) {
                IND_DUMMY.position.set(x, y, z); IND_DUMMY.rotation.set(0, ry, 0); IND_DUMMY.scale.set(sx, sy, sz); IND_DUMMY.updateMatrix();
                mesh.setMatrixAt(idx, IND_DUMMY.matrix); mesh.setColorAt(idx, IND_COL.setHex(col));
            };
            let see = function (o) { return !trip || Math.hypot(o.x - ind.p.x, o.z - ind.p.z) <= vr; };
            ind.nodes.forEach(function (o, i) {
                if (o.dead || !see(o)) return;
                if (o.tree) { let T = WD_TREE[o.tree]; set(W.trunk, c.t, o.x, o.y + T.th / 2, o.z, T.tw, T.th, T.tw, 0, 0x6d4c41); set(W.crown, c.t, o.x, o.y + T.cy, o.z, T.cs[0], T.cs[1], T.cs[2], i, T.col); c.t++; }
                else if (o.key === 'cactus') { set(W.trunk, c.t, o.x, o.y + 0.85, o.z, 0.5, 1.7, 0.5, 0, 0x2e7d32); set(W.crown, c.t, o.x, o.y + 1.8, o.z, 0.45, 0.35, 0.45, i, 0x43a047); c.t++; }
                else if (o.rock) { set(W.rock, c.r, o.x, o.y + 0.5, o.z, 1.3, 1.0, 1.3, i, o.black ? 0x2b2522 : 0x7a7a7a); c.r++; }
                else if (o.out) {
                    let f = Math.max(0.05, o.n / (o.n0 || 20)), sink = (1 - f) * 0.3;   // 挖得越多越矮
                    set(W.rock, c.r, o.x, o.y + 0.35 - sink, o.z, 1.5, 0.85, 1.5, i, 0x6d6d6d); c.r++;
                    set(W.ore, c.o, o.x, o.y + 0.75 - sink, o.z, 0.5 + 0.7 * f, 0.5 + 0.5 * f, 0.5 + 0.7 * f, i * 2, IND_NODE_COL[o.key] || IND_ITEMS[o.key].col); c.o++;
                } else { set(ind.nodeMesh, c.p, o.x, o.y + 0.45, o.z, 1, 1, 1, i, IND_NODE_COL[o.key] || IND_ITEMS[o.key].col); c.p++; }
            });
            ind.stumps.forEach(function (o) { if (see(o) && c.s < 600) { set(W.stump, c.s, o.x, o.y + 0.17, o.z, 1, 1, 1, 0, 0x5d4037); c.s++; } });
            ind.pits.forEach(function (o) { if (see(o) && c.q < 800) { set(W.pit, c.q, o.x, o.y + 0.03 - o.d * 0.02, o.z, 0.5 + o.d * 0.12, 1, 0.5 + o.d * 0.12, 0, 0x3e2723); c.q++; } });
            [[ind.nodeMesh, c.p], [W.trunk, c.t], [W.crown, c.t], [W.rock, c.r], [W.ore, c.o], [W.stump, c.s], [W.pit, c.q]].forEach(function (m) {
                m[0].count = m[1]; m[0].instanceMatrix.needsUpdate = true; if (m[0].instanceColor) m[0].instanceColor.needsUpdate = true;
            });
            ind.nodeDirty = false;
        }
        // 大石头和山地要石稿才挖得动：死了把稿子丢光、箱子里也没有，就在仓库箱里补一把备用石稿，不然捡不到石头再也做不出稿子
        function wdEnsurePick() {
            let has = Object.keys(ind.bag).some(function (k) { return IND_ITEMS[k].tool > 0; }) || ind.base.chests.some(function (c) { return Object.keys(c.items).some(function (k) { return IND_ITEMS[k] && IND_ITEMS[k].tool > 0; }); });
            if (has) return;
            indBoxAdd('pick_stone', 1); indFlash('仓库箱里放了一把备用石稿');
        }

        // ── 河：每张图 1～3 条，从山地顺着地势往低处走，一直流进海里；宽 4～8 米，浅水为主（中间一溜深一点） ──
        // 河床低于水面（水面是整张图同一个高度），两岸按坡度缓缓抬起来；用 10 米一格的表查附近的河段，不拖慢 indHeight
        const WD_RIV = { cell: 10, bank: 10, step: 5, maxStep: 200, spawnR: 40 };
        function wdMakeRivers(M) {
            let r = indRng((M.seed ^ 0x51f15e) >>> 0), want = 1 + Math.floor(r() * 3);
            M.riv = null; let rivers = [];
            for (let tries = 0; tries < 400 && rivers.length < want; tries++) {
                let x = (r() * 2 - 1) * (IND_MAP - 30), z = (r() * 2 - 1) * (IND_MAP - 30);
                if (indElev(M, x, z) < (tries < 150 ? 0.36 : 0.2) || Math.hypot(x, z) < 80) continue;   // 从山上起头；山太少就从高一点的地方起
                let w = 4 + r() * 4, pts = [[x, z]], dx = 0, dz = 0, ok = false;
                for (let s = 0; s < WD_RIV.maxStep; s++) {
                    let e = indElev(M, x, z), gx = indElev(M, x + 3, z) - indElev(M, x - 3, z), gz = indElev(M, x, z + 3) - indElev(M, x, z - 3), gl = Math.hypot(gx, gz) || 1;
                    let nx = dx * 0.65 - gx / gl * 0.35 + (r() - 0.5) * 0.12, nz = dz * 0.65 - gz / gl * 0.35 + (r() - 0.5) * 0.12, nl = Math.hypot(nx, nz) || 1;
                    dx = nx / nl; dz = nz / nl; x += dx * WD_RIV.step; z += dz * WD_RIV.step;
                    if (Math.abs(x) > IND_MAP - 4 || Math.abs(z) > IND_MAP - 4 || Math.hypot(x, z) < WD_RIV.spawnR) break;
                    if (M.volc.some(function (v) { return Math.hypot(x - v.x, z - v.z) < v.r * 1.8; })) break;
                    pts.push([x, z]);
                    if (e < -0.2) { ok = true; break; }   // 流进海里了
                }
                if (!ok || pts.length < 12) continue;
                rivers.push({ w: w, pts: pts });
            }
            let segs = [], G = {}, c = WD_RIV.cell;
            rivers.forEach(function (rv, ri) {
                for (let i = 0; i + 1 < rv.pts.length; i++) {
                    let a = rv.pts[i], b = rv.pts[i + 1], idx = segs.length, reach = rv.w / 2 + WD_RIV.bank;
                    segs.push({ x1: a[0], z1: a[1], x2: b[0], z2: b[1], hw: rv.w / 2, ri: ri });
                    let i0 = Math.floor((Math.min(a[0], b[0]) - reach + IND_MAP) / c), i1 = Math.floor((Math.max(a[0], b[0]) + reach + IND_MAP) / c);
                    let j0 = Math.floor((Math.min(a[1], b[1]) - reach + IND_MAP) / c), j1 = Math.floor((Math.max(a[1], b[1]) + reach + IND_MAP) / c);
                    for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) { let k = gi * 1000 + gj; (G[k] = G[k] || []).push(idx); }
                }
            });
            M.rivers = rivers; M.riv = { segs: segs, grid: G };
        }
        // 离最近的河中线多远、那条河半宽多少；附近没河返回 null
        function wdRiverDist(M, x, z) {
            if (!M.riv) return null;
            let L = M.riv.grid[Math.floor((x + IND_MAP) / WD_RIV.cell) * 1000 + Math.floor((z + IND_MAP) / WD_RIV.cell)];
            if (!L) return null;
            let best = null;
            for (let i = 0; i < L.length; i++) {
                let s = M.riv.segs[L[i]], vx = s.x2 - s.x1, vz = s.z2 - s.z1, t = ((x - s.x1) * vx + (z - s.z1) * vz) / (vx * vx + vz * vz);
                t = Math.max(0, Math.min(1, t));
                let d = Math.hypot(x - s.x1 - vx * t, z - s.z1 - vz * t), m = d - s.hw;
                if (!best || m < best.m) best = { d: d, hw: s.hw, m: m };
            }
            return best;
        }
        function wdRiverNear(M, x, z, pad) { let q = M && wdRiverDist(M, x, z); return !!q && q.m <= (pad || 0); }
        function wdRiverCarve(M, x, z, h) {
            let q = wdRiverDist(M, x, z); if (!q) return h;
            let edge = IND_WATER_Y - 0.25;   // 河边水深 0.25 米，往中间越来越深，中间 0.75 米
            if (q.d <= q.hw) return Math.min(h, IND_WATER_Y - 0.25 - 0.5 * (1 - q.d / q.hw));
            let bank = Math.min(WD_RIV.bank, 3 + Math.max(0, h - edge) * 0.8), t = (q.d - q.hw) / bank;
            if (t >= 1) return h;
            t = t * t * (3 - 2 * t);
            return Math.min(h, edge + (h - edge) * t);
        }

        // ── 地形：600 米分成 10 × 10 块（每块 60 米、24 × 24 格），视野外的块藏起来 ──
        const WD_CH = 10;
        function wdTerrain(M) {
            let N = IND_SEG + 1, st = IND_MAP * 2 / IND_SEG, H = new Float32Array(N * N), C = new Float32Array(N * N * 3), c = new THREE.Color();
            for (let gj = 0; gj < N; gj++) for (let gi = 0; gi < N; gi++) {
                let k = gj * N + gi, x = -IND_MAP + gi * st, z = -IND_MAP + gj * st, h = indHeight(M, x, z), bm = indBiome(M, x, z);
                H[k] = h;
                let col = IND_BIOMES[bm].col;
                if (bm === 'volcano' || (h > 1 && M.volc.some(function (v) { return Math.hypot(x - v.x, z - v.z) < v.r * 1.6; }))) col = 0x3e2f2a;   // 火山周围黑色的岩石
                else if (h < IND_WATER_Y + 0.05 && wdRiverNear(M, x, z, 0.5)) col = 0x8d7b5f;   // 河床
                c.setHex(col); let sh = 0.92 + indHash(k, 3, M.seed) * 0.12; C[k * 3] = c.r * sh; C[k * 3 + 1] = c.g * sh; C[k * 3 + 2] = c.b * sh;
            }
            let per = IND_SEG / WD_CH, mat = indMat(new THREE.MeshLambertMaterial({ vertexColors: true }));
            ind.chunks = [];
            for (let cj = 0; cj < WD_CH; cj++) for (let ci = 0; ci < WD_CH; ci++) {
                let n = per + 1, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
                for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
                    let gi = ci * per + a, gj = cj * per + b, k = gj * N + gi, v = b * n + a;
                    pos[v * 3] = -IND_MAP + gi * st; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = -IND_MAP + gj * st;
                    let hx = (H[gj * N + Math.min(N - 1, gi + 1)] - H[gj * N + Math.max(0, gi - 1)]) / (2 * st), hz = (H[Math.min(N - 1, gj + 1) * N + gi] - H[Math.max(0, gj - 1) * N + gi]) / (2 * st), l = Math.hypot(hx, 1, hz);
                    nor[v * 3] = -hx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -hz / l;
                    col[v * 3] = C[k * 3]; col[v * 3 + 1] = C[k * 3 + 1]; col[v * 3 + 2] = C[k * 3 + 2];
                }
                for (let b = 0; b < per; b++) for (let a = 0; a < per; a++) { let v00 = b * n + a, v10 = v00 + 1, v01 = v00 + n, v11 = v01 + 1; idx.push(v00, v01, v10, v10, v01, v11); }
                let g = indGeo(new THREE.BufferGeometry());
                g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
                g.setIndex(idx); g.computeBoundingSphere();
                let m = indAdd(new THREE.Mesh(g, mat));
                m.userData.box = { x0: -IND_MAP + ci * per * st, x1: -IND_MAP + (ci + 1) * per * st, z0: -IND_MAP + cj * per * st, z1: -IND_MAP + (cj + 1) * per * st };
                ind.chunks.push(m);
            }
            ind.chunkView = null;
        }
        // 离玩家（到块的边）超过视野 + 10 米的块不画
        function wdChunkSync(vr) {
            if (!ind.chunks) return;
            ind.chunks.forEach(function (m) {
                let B = m.userData.box, dx = Math.max(B.x0 - ind.p.x, 0, ind.p.x - B.x1), dz = Math.max(B.z0 - ind.p.z, 0, ind.p.z - B.z1);
                m.visible = Math.hypot(dx, dz) <= vr + 10;
            });
        }

        // ── 河边刷黏土、锡砂；火山周围刷黑石头（大石头） ──
        function wdExtraNodes(M, casual) {
            let r = indRng((M.seed ^ 0x7a11) >>> 0);
            (M.rivers || []).forEach(function (rv) {
                for (let i = 2; i < rv.pts.length; i += 2) {
                    if (r() > 0.55) continue;
                    let a = rv.pts[i - 1], b = rv.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, side = r() < 0.5 ? -1 : 1, off = rv.w / 2 + 1.2 + r() * 2.5;
                    let x = b[0] - dz / l * off * side, z = b[1] + dx / l * off * side, h = indHeight(M, x, z);
                    if (h < IND_WATER_Y + 0.1 || Math.hypot(x, z) < 8) continue;
                    let key = (!casual && r() < 0.4) ? 'sand_sn' : 'clay', nd = IND_NODES[key];
                    ind.nodes.push({ key: key, x: x, z: z, y: h, n: nd.give[0] + Math.floor(r() * (nd.give[1] - nd.give[0] + 1)), seed: IND_SEED_KINDS[0], dead: false, river: true });
                }
            });
            M.volc.forEach(function (v) {
                for (let i = 0; i < 10; i++) {
                    let a = r() * Math.PI * 2, d = v.r * (0.9 + r() * 0.8), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, h = indHeight(M, x, z);
                    if (h < IND_WATER_Y + 0.2 || Math.abs(x) > IND_MAP - 2 || Math.abs(z) > IND_MAP - 2) continue;
                    ind.nodes.push({ key: 'stone', rock: true, black: true, x: x, z: z, y: h, n: 3 + Math.floor(r() * 3), seed: IND_SEED_KINDS[0], dead: false });
                }
            });
        }
