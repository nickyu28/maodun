// 猫盾工业：户外设备块、可充电电池、风力发电机、风转盘、树苗、定位基站（任务 74 + 补充）。放在 19-industry-brick.js 后面。
// 设备块：户外设备（地热发电机 5×5、风力发电机 3×3、风转盘 3×3，设备在块正中）放在出门的地图上，就把周围这一块"钉住"：放下时记下地形（高度、有没有岩浆、地貌）、块里的树石矿，
//  以后每次出门生成地图，这块都盖在原来的坐标上（边上 2 米平滑过渡，块里原来的东西清掉换成记下的），不会刷新；这一趟不改地图。收起设备块就解除。每个存档最多 6 块。
//  已经有块的地方（设备中心在块里）再放设备，算进同一块。
// 定位基站：4 台摆在地块（1 米方格）的四个角，正好成正方形（边长隔 2～8 格，围出 n×n，n = 3～9）就钉住这一块；每台有充电槽，放一节可充电电池，每秒耗 0.05 U（按游戏时间算），
//  任一台没电这一块这趟就不盖（块里的树苗树这次没了）。摆成别的形状不钉；没钉住的基站离开地图时自动回背包。
// 可充电电池：锂电池 1 + 镍锭 1 + 铜线 2。空的 battery_rc、满的 battery_rc_full（720 U，装进电池组当锂电池，用完变回普通锂电池）。发电设备（地热、风力、手摇、太阳能板、汽轮发电机）各有 1 个充电槽，
//  发着电就每秒充 20 U（风力按风速），充满 720 停。拿着可充电电池左键设备：放进去（槽里原来的换出来）；收起设备时槽里的电池还给你。
// 风力发电机：12 V，风速 山地海边 ×1、沙漠 ×0.7、平原 ×0.5、森林 ×0.15，基地 ×0.5。风转盘不用电，带动旁边 2 米内的粉碎机、水泵，速度跟着风速（基地 ×0.5）。
// 树苗：砍普通树、松树、橡胶树 15% 额外掉 1 棵；椰子右键地面种（不渴的时候，渴了右键是喝）；哪里都能种，不弹提示；3 个游戏日长成。种在块里的存档，种在块外的下次出门没了。
        const OD = { chg: 720, rate: 20, drawA: 0.05, maxBlocks: 6, sapP: 0.15, sapT: 3 * IND_DAY, margin: 2, near: 2.5, dev: { geo: 5, wind: 3, windmill: 3 }, wind: { mountain: 1, beach: 1, desert: 0.7, plain: 0.5, forest: 0.15 } };
        const OD_CHG = { geo: 1, wind: 1, crank: 1, solar: 1, turbine: 1, anchor: 1 };   // 有充电槽的设备
        const OD_TREES = { oak: 'sapling_oak', pine: 'sapling_pine', rubber: 'sapling_rubber' };
        Object.assign(IND_ITEMS_RAW, {
            battery_rc: { name: '可充电电池（空）', col: 0x80cbc4, use: '放进发电设备的充电槽充电' },
            battery_rc_full: { name: '可充电电池（满）', col: 0x00bfa5, later: '发电设备的充电槽里充满才有，体检看不到', cellU: 720, use: '装进电池组（3 V，720 U）；放进定位基站、发电设备的充电槽' },
            blade: { name: '叶片', col: 0xcfd8dc, use: '做风力发电机' },
            dev_wind: { name: '风力发电机', col: 0xeceff1, dev: 'wind', use: '12 V，按风速发电（山地海边最好，森林最差），有充电槽。户外放下钉住 3×3' },
            dev_windmill: { name: '风转盘', col: 0xa1887f, dev: 'windmill', use: '不用电，带动旁边 2 米内的粉碎机、水泵，跟着风速。户外放下钉住 3×3' },
            dev_anchor: { name: '定位基站', col: 0x607d8b, dev: 'anchor', use: '4 台摆成正方形的四个角，围出的 3×3 到 9×9 就钉住；每台放一节可充电电池' },
            sapling: { name: '小树苗', col: 0x66bb6a, later: '种着的树苗，不是物品', use: '种着的树苗' },
            sapling_oak: { name: '树苗', col: 0x81c784, later: '砍树掉的，体检看不到', use: '右键地面种下，3 个游戏日长成阔叶树' },
            sapling_pine: { name: '松树苗', col: 0x388e3c, later: '砍树掉的，体检看不到', use: '右键地面种下，3 个游戏日长成松树' },
            sapling_rubber: { name: '橡胶树苗', col: 0x9ccc65, later: '砍树掉的，体检看不到', use: '右键地面种下，3 个游戏日长成橡胶树' }
        });
        IND_NODES.sapling = { give: [0, 0], tool: 0, name: '树苗' };
        IND_DEVS.wind = { name: '风力发电机', col: 0xeceff1, src: true, volt: 12, size: [0.5, 3, 0.5] };
        IND_DEVS.windmill = { name: '风转盘', col: 0xa1887f, rated: 24, minV: 1.5, draw: 0, size: [1.4, 2.4, 1.4], nowire: true };
        IND_DEVS.anchor = { name: '定位基站', col: 0x607d8b, rated: 24, minV: 1.5, draw: 0, size: [0.5, 1.4, 0.5], nowire: true };
        IND_DEV_VOLT.wind = function () { return 12; };
        IND_CRAFT.push(
            { out: 'battery_rc', in: { battery_li: 1, ingot_ni: 1, wire: 2 }, hard: true },
            { out: 'blade', in: { wood: 4, wool: 2 } },
            { out: 'dev_wind', in: { steel: 6, wire: 12, coil: 2, blade: 1 }, hard: true },
            { out: 'dev_windmill', in: { wood: 12, rope: 6, stone: 4 }, hard: true }, { out: 'dev_windmill', in: { wood: 12, yarn: 6, stone: 4 }, casual: true },
            { out: 'dev_anchor', in: { steel: 4, dev_cchip: 1, coil: 1, wire: 6, glass_plate: 1 }, hard: true }
        );
        // ── 风 ──
        function odWindF(bm) { return ind.where === 'base' ? 0.5 : (OD.wind[bm] !== undefined ? OD.wind[bm] : 0.5); }
        function odWindHere(x, z) { return ind.where === 'base' ? 0.5 : odWindF(indBiome(ind.map, x, z)); }
        // ── 充电槽 ──
        function odCellKey(u) { return u >= OD.chg - 1e-6 ? 'battery_rc_full' : 'battery_rc'; }
        // 基站的电按游戏时间每秒耗 0.05 U（rec.t 是上次结算的时刻）；别的设备 rec.t 没有
        function odEff(rec) { if (!rec.chg) return 0; return rec.t === undefined ? rec.chg.u : Math.max(0, rec.chg.u - OD.drawA * Math.max(0, (ind.base.clock || 0) - rec.t)); }
        function odSlot(rec, k) {   // 拿着可充电电池放进槽里（原来的换出来）；返回 true 用掉
            if (k !== 'battery_rc' && k !== 'battery_rc_full') return false;
            let old = rec.chg ? odCellKey(odEff(rec)) : null;
            indBagDel(k, 1); rec.chg = { u: k === 'battery_rc_full' ? OD.chg : 0 }; if (rec.t !== undefined) rec.t = ind.base.clock || 0;
            if (old) indBoxAdd(old, 1);
            ind.hudSig = ''; return true;
        }
        function odChgAdd(rec, amt) { if (rec.chg && rec.chg.u < OD.chg) rec.chg.u = Math.min(OD.chg, rec.chg.u + amt); }
        // 基地里：设备发着电就给槽里的电池充（补算也走）
        function odStep(dt) {
            if (!ind || !ind.base || !ind.base.devs) return;
            ind.base.devs.forEach(function (d) {
                if (!d.chg || !OD_CHG[d.ty]) return;
                if (d.chg.u >= OD.chg || !(indSrcVolt(d) > 0)) return;
                odChgAdd(d, OD.rate * dt * (d.ty === 'wind' ? 0.5 : 1));
            });
        }
        function odPick(d, put) { if (d.chg && OD_CHG[d.ty]) { put(odCellKey(d.chg.u), 1); d.chg = null; } }
        // 风转盘：旁边 2 米内的粉碎机、水泵当通了电，速度跟着风速（在 indElecTick 里，接在连线算完以后、各设备 tick 之前）
        function odWindmill() {
            let B = ind.base; B.devs.forEach(function (d) { delete d.wf; });
            B.devs.forEach(function (m) {
                if (m.ty !== 'windmill') return;
                B.devs.forEach(function (d) {
                    if ((d.ty === 'crusher' || d.ty === 'pump') && Math.hypot(d.x - m.x, d.z - m.z) <= 2) { d.pw = true; d.wf = Math.max(d.wf || 0, 0.5); }
                });
            });
        }
        // 右键基地的设备：拿着可充电电池放进充电槽
        function odDevAct(d, k) { if (!OD_CHG[d.ty] || d.ty === 'anchor') return undefined; return odSlot(d, k) ? true : undefined; }
        // ── 块 ──
        function odBlocks() { return ind.base.blocks = ind.base.blocks || []; }
        function odRect(b) { return { x0: b.x - b.n / 2, x1: b.x + b.n / 2, z0: b.z - b.n / 2, z1: b.z + b.n / 2 }; }
        function odIn(b, x, z, pad) { let r = odRect(b); pad = pad || 0; return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad; }
        function odBlockAt(x, z) { return odBlocks().filter(function (b) { return odIn(b, x, z); })[0] || null; }
        function odOverlap(a, n, x, z) { let r = odRect(a), h = n / 2; return x - h < r.x1 && x + h > r.x0 && z - h < r.z1 && z + h > r.z0; }
        // 记下一块的地形
        function odSnap(M, cx, cz, n) {
            let h = [], o = (n - 1) / 2;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) h.push(Math.round(indHeight(M, cx - o + i, cz - o + j) * 100) / 100);
            return h;
        }
        function odPinMix(M, x, z, nat) {
            let out = nat;
            for (let q = 0; q < M.pins.length; q++) {
                let b = M.pins[q], r = odRect(b), m = OD.margin;
                if (x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m) continue;
                let o = (b.n - 1) / 2, fi = Math.max(0, Math.min(b.n - 1, x - (b.x - o))), fj = Math.max(0, Math.min(b.n - 1, z - (b.z - o)));
                let i0 = Math.floor(fi), j0 = Math.floor(fj), i1 = Math.min(b.n - 1, i0 + 1), j1 = Math.min(b.n - 1, j0 + 1), ti = fi - i0, tj = fj - j0;
                let g = function (i, j) { return b.h[i * b.n + j]; };
                let s = (g(i0, j0) * (1 - tj) + g(i0, j1) * tj) * (1 - ti) + (g(i1, j0) * (1 - tj) + g(i1, j1) * tj) * ti;
                let dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1), d = Math.max(dx, dz), w = d <= 0 ? 1 : Math.max(0, 1 - d / m);
                out = out * (1 - w) + s * w;
            }
            return out;
        }
        function odPinBiome(M, x, z) { for (let q = 0; q < M.pins.length; q++) if (odIn(M.pins[q], x, z)) return M.pins[q].bm; return null; }
        const OD_NODE_F = ['key', 'x', 'z', 'y', 'n', 'n0', 'seed', 'tree', 'rock', 'black', 'hard', 'out', 'river', 'rs', 'lx', 'sap', 'born'];
        function odNodeRec(o) { let r = {}; OD_NODE_F.forEach(function (f) { if (o[f] !== undefined) r[f] = o[f]; }); return r; }
        // 进出远征：生成地图时把块盖上去，回基地时把块里的树石矿记下来
        function odApplyMap(M) {
            ind.tdevs = []; ind.odObjs = []; ind.odDirty = true; ind.odLive = []; M.pins = []; M.pinLava = [];
            let B = ind.base, clock = B.clock || 0;
            odBlocks().forEach(function (b) {
                if (b.anch && !b.anch.every(function (a) { return odEff(a) > 0; })) { b.nodes = []; return; }   // 基站没电：这趟不盖
                M.pins.push(b); ind.odLive.push(b); (b.lava || []).forEach(function (l) { M.pinLava.push(l); });
            });
            if (!M.pins.length) delete M.pins;
        }
        function odApplyNodes(M) {
            if (!M.pins) return;
            let B = ind.base;
            M.pins.forEach(function (b) {
                ind.nodes = ind.nodes.filter(function (o) { return !odIn(b, o.x, o.z, 0.5); });
                (b.nodes || []).forEach(function (r) { let o = Object.assign({ dead: false, pin: true }, r); if (o.seed === undefined) o.seed = IND_SEED_KINDS[0]; o.y = indHeight(M, o.x, o.z); delete o.sh; ind.nodes.push(o); });
                (b.devs || []).forEach(function (d) { ind.tdevs.push({ ty: d.ty, x: b.x + d.dx, z: b.z + d.dz, y: indHeight(M, b.x + d.dx, b.z + d.dz), ref: d, b: b }); });
                (b.anch || []).forEach(function (a) { ind.tdevs.push({ ty: 'anchor', x: a.x, z: a.z, y: indHeight(M, a.x, a.z), ref: a, b: b }); });
            });
            odSapGrow();
        }
        function odLeave() {
            if (ind.where !== 'trip' || !ind.map) return;
            let B = ind.base;
            (ind.odLive || []).forEach(function (b) { if (odBlocks().indexOf(b) < 0) return; b.nodes = ind.nodes.filter(function (o) { return !o.dead && (o.n > 0 || o.sap) && odIn(b, o.x, o.z); }).map(odNodeRec).slice(0, 300); });
            (ind.tdevs || []).forEach(function (t) { if (!t.b && t.ref) { indBoxAdd('dev_' + t.ty, 1); if (t.ref.chg) indBoxAdd(odCellKey(odEff(t.ref)), 1); } });   // 没钉住的（还没围成块的基站）回背包
            ind.tdevs = [];
        }
        // 户外放设备：钉一块
        function odPlace(k) {
            let ty = IND_ITEMS[k].dev, B = ind.base;
            if (!(ty === 'anchor' || OD.dev[ty])) { indFlash('设备只能放在基地里'); return false; }
            let f = indFace(), x = Math.round(ind.p.x + f.x * 2), z = Math.round(ind.p.z + f.z * 2);
            if (Math.abs(x) > IND_MAP - 4 || Math.abs(z) > IND_MAP - 4) { indFlash('这里放不了'); return false; }
            if (indWaterDepth(x, z) > 0.05) { indFlash('水里放不了'); return false; }
            if ((ind.tdevs || []).some(function (t) { return Math.round(t.x) === x && Math.round(t.z) === z; })) { indFlash('这格有东西了'); return false; }
            let y = indHeight(ind.map, x, z);
            if (ty === 'anchor') {
                let a = { x: x, z: z, chg: null, t: B.clock || 0 }, t = { ty: 'anchor', x: x, z: z, y: y, ref: a, b: null };
                let sq = odSquareWith(x, z);
                if (sq) {
                    if (odBlocks().length >= OD.maxBlocks) { indFlash('最多 ' + OD.maxBlocks + ' 块'); return false; }
                    if (odBlocks().some(function (b) { return odOverlap(b, sq.n, sq.cx, sq.cz); })) { indFlash('这里已经钉着一块了'); return false; }
                    indBagDel(k, 1); ind.tdevs.push(t);
                    let corners = sq.list.concat([t]);
                    let blk = { x: sq.cx, z: sq.cz, n: sq.n, bm: indBiome(ind.map, sq.cx, sq.cz), h: odSnap(ind.map, sq.cx, sq.cz, sq.n), lava: odLavaIn(sq.cx, sq.cz, sq.n), nodes: [], devs: [], anch: corners.map(function (c) { return c.ref; }) };
                    odBlocks().push(blk); corners.forEach(function (c) { c.b = blk; });
                    odAdopt(blk); ind.odLive.push(blk);   // 这趟地图不变，所以只记下，不改高度
                    ind.odDirty = true; indSave(); indFlash('圈好了 ' + sq.n + '×' + sq.n); return true;
                }
                indBagDel(k, 1); ind.tdevs.push(t); ind.odDirty = true; return true;
            }
            let n = OD.dev[ty], blk = odBlockAt(x, z);
            if (!blk) {
                if (odBlocks().length >= OD.maxBlocks) { indFlash('最多 ' + OD.maxBlocks + ' 块'); return false; }
                if (odBlocks().some(function (b) { return odOverlap(b, n, x, z); })) { indFlash('这里已经钉着一块了'); return false; }
                blk = { x: x, z: z, n: n, bm: indBiome(ind.map, x, z), h: odSnap(ind.map, x, z, n), lava: odLavaIn(x, z, n), nodes: [], devs: [], anch: null };
                odBlocks().push(blk); odAdopt(blk); ind.odLive.push(blk);
            }
            indBagDel(k, 1);
            let rec = { ty: ty, dx: x - blk.x, dz: z - blk.z }; blk.devs.push(rec);
            ind.tdevs.push({ ty: ty, x: x, z: z, y: y, ref: rec, b: blk }); ind.odDirty = true; indSave(); return true;
        }
        // 新钉的块：把现在块里的树石矿记下来（以后每次都是这些）
        function odAdopt(b) { b.nodes = ind.nodes.filter(function (o) { return !o.dead && (o.n > 0 || o.sap) && odIn(b, o.x, o.z); }).map(odNodeRec).slice(0, 300); ind.nodes.forEach(function (o) { if (odIn(b, o.x, o.z)) o.pin = true; }); }
        function odLavaIn(cx, cz, n) {
            let h = n / 2, out = [];
            (ind.map.volc || []).forEach(function (v) { let r = v.r * 0.3; if (Math.abs(v.x - cx) < h + r && Math.abs(v.z - cz) < h + r) out.push({ x: v.x, z: v.z, r: r }); });
            return out;
        }
        // 4 台基站是不是正好成正方形（边长隔 2～8 格）：新放的这台加上已经摆着的没钉住的三台
        function odSquareWith(x, z) {
            let free = (ind.tdevs || []).filter(function (t) { return t.ty === 'anchor' && !t.b; }), P = {};
            free.forEach(function (t) { P[Math.round(t.x) + ',' + Math.round(t.z)] = t; });
            for (let s = 2; s <= 8; s++) {
                for (let ox = 0; ox <= 1; ox++) for (let oz = 0; oz <= 1; oz++) {
                    let ax = x - ox * s, az = z - oz * s, cs = [[ax, az], [ax + s, az], [ax, az + s], [ax + s, az + s]], ok = true, list = [];
                    cs.forEach(function (c) { if (c[0] === x && c[1] === z) return; let t = P[c[0] + ',' + c[1]]; if (!t) ok = false; else list.push(t); });
                    if (ok && list.length === 3) return { n: s + 1, cx: ax + s / 2, cz: az + s / 2, list: list };
                }
            }
            return null;
        }
        function odNear(x, z) { let best = null, bd = OD.near; (ind.tdevs || []).forEach(function (t) { let d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }); return best; }
        // 收起：块解除（基站：整块取消，别的三台变成没钉住的）
        function odPickUp(t) {
            let B = ind.base, b = t.b;
            if (b) {
                if (t.ty === 'anchor') { b.anch.forEach(function (a) { ind.tdevs.forEach(function (o) { if (o.ref === a) o.b = null; }); }); B.blocks = odBlocks().filter(function (x) { return x !== b; }); }
                else { b.devs = b.devs.filter(function (d) { return d !== t.ref; }); if (!b.devs.length && !b.anch) B.blocks = odBlocks().filter(function (x) { return x !== b; }); }
            }
            ind.tdevs = ind.tdevs.filter(function (o) { return o !== t; });
            indBoxAdd('dev_' + t.ty, 1); if (t.ref.chg) indBoxAdd(odCellKey(odEff(t.ref)), 1);
            ind.odDirty = true; indSave(); return true;
        }
        // 右键（远征里）：放设备、种树苗、空手收起；左键：拿着可充电电池放进槽
        function odUse(k, a) {
            if (ind.where !== 'trip' || ind.cave) return false;
            if (k && IND_ITEMS[k] && IND_ITEMS[k].dev && (OD.dev[IND_ITEMS[k].dev] || IND_ITEMS[k].dev === 'anchor')) return odPlace(k);
            let sap = k && (k.indexOf('sapling_') === 0 ? k.slice(8) : (k === 'coconut' && ind.base.surv.water >= 90 ? 'palm' : null));
            if (sap && !a) {
                let f = indFace(), x = ind.p.x + f.x * 1.5, z = ind.p.z + f.z * 1.5;
                if (indWaterDepth(x, z) > 0.05) return false;
                indBagDel(k, 1); let o = { key: 'sapling', sap: sap, x: x, z: z, y: indHeight(ind.map, x, z), n: 1, seed: IND_SEED_KINDS[0], dead: false, born: ind.base.clock || 0 };
                let b = odBlockAt(x, z); if (b) o.pin = true;
                ind.nodes.push(o); ind.nodeDirty = true; return true;
            }
            if (!k && !a) { let t = odNear(ind.p.x, ind.p.z); if (t) return odPickUp(t); }
            return false;
        }
        function odAct() {
            if (ind.where !== 'trip' || ind.cave) return false;
            let k = indSel(); if (k !== 'battery_rc' && k !== 'battery_rc_full') return false;
            let t = odNear(ind.p.x, ind.p.z); if (!t || !t.ref || !OD_CHG[t.ty]) return false;
            return odSlot(t.ref, k);
        }
        // 树苗：3 个游戏日长成树；砍树 15% 掉树苗
        function odSapGrow() {
            let clock = ind.base.clock || 0, any = false;
            ind.nodes.forEach(function (o) {
                if (!o.sap || o.dead || clock - o.born < OD.sapT) return;
                o.tree = o.sap; o.key = 'wood'; o.n = 3 + Math.floor(indRand() * 4); delete o.sap; delete o.born; any = true;
            });
            if (any) ind.nodeDirty = true;
        }
        function odSapDrop(o) {
            let s = o && OD_TREES[o.tree]; if (!s || !(indRand() < OD.sapP)) return;
            indBoxAdd(s, 1);
        }
        // 左键树苗：拔起来还你
        function odSapTake(o) { if (!o || !o.sap) return false; o.dead = true; ind.nodeDirty = true; indBoxAdd(o.sap === 'palm' ? 'coconut' : OD_TREES[o.sap], 1); return true; }
        // 每帧（远征里）：充电、树苗长大、画设备
        let ODT = 0;
        function odTick(dt) {
            if (ind.where !== 'trip' || ind.cave || !ind.map) return;
            ODT += dt; if (ODT < 1) { return; } let h = ODT; ODT = 0;
            (ind.tdevs || []).forEach(function (t) {
                if (!t.ref.chg || t.ref.chg.u >= OD.chg) return;
                let on = t.ty === 'wind' ? odWindHere(t.x, t.z) : t.ty === 'geo' ? (odGeoOn(t) ? 1 : 0) : 0;
                if (on > 0) odChgAdd(t.ref, OD.rate * on * h);
            });
            odSapGrow(); odSync();
        }
        function odGeoOn(t) {
            let lava = lvPools().some(function (p) { return Math.hypot(t.x - p.x, t.z - p.z) - p.r <= 3; }); if (!lava) return false;
            for (let a = 0; a < 8; a++) if (indWaterDepth(t.x + Math.cos(a * 0.785) * 3, t.z + Math.sin(a * 0.785) * 3) > 0.05) return true;
            return indWaterDepth(t.x, t.z) > 0.05;
        }
        function odSync() {
            if (!ind.odDirty) return; ind.odDirty = false;
            (ind.odObjs || []).forEach(function (o) { scene.remove(o); }); ind.odObjs = [];
            let before = ind.objs.length;
            (ind.tdevs || []).forEach(function (t) { let D = IND_DEVS[t.ty]; indBox(D.size[0], D.size[1], D.size[2], D.col, t.x, t.y + D.size[1] / 2, t.z); });
            ind.odObjs = ind.objs.slice(before);
        }
        function odFixBase(b) {
            b.blocks = (Array.isArray(b.blocks) ? b.blocks : []).filter(function (k) { return k && isFinite(k.x) && isFinite(k.z) && k.n >= 3 && k.n <= 9 && (k.n | 0) === k.n && Array.isArray(k.h) && k.h.length === k.n * k.n && k.h.every(isFinite); }).slice(0, OD.maxBlocks).map(function (k) {
                return { x: k.x, z: k.z, n: k.n, bm: typeof k.bm === 'string' ? k.bm : 'plain', h: k.h.map(Number),
                    lava: (Array.isArray(k.lava) ? k.lava : []).filter(function (l) { return l && isFinite(l.x) && isFinite(l.z) && l.r > 0; }).slice(0, 4).map(function (l) { return { x: +l.x, z: +l.z, r: +l.r }; }),
                    nodes: (Array.isArray(k.nodes) ? k.nodes : []).filter(function (o) { return o && typeof o.key === 'string' && isFinite(o.x) && isFinite(o.z) && (IND_NODES[o.key] || o.key === 'sapling'); }).slice(0, 300).map(function (o) { let r = {}; OD_NODE_F.forEach(function (f) { if (o[f] !== undefined) r[f] = o[f]; }); return r; }),
                    devs: (Array.isArray(k.devs) ? k.devs : []).filter(function (d) { return d && OD.dev[d.ty] && isFinite(d.dx) && isFinite(d.dz); }).slice(0, 8).map(function (d) { let r = { ty: d.ty, dx: +d.dx, dz: +d.dz }; if (d.chg) r.chg = { u: indNum(d.chg.u, 0, 0, OD.chg) }; return r; }),
                    anch: Array.isArray(k.anch) && k.anch.length === 4 ? k.anch.map(function (a) { let r = { x: indNum(a && a.x, 0, -9999, 9999), z: indNum(a && a.z, 0, -9999, 9999), chg: a && a.chg ? { u: indNum(a.chg.u, 0, 0, OD.chg) } : null, t: indNum(a && a.t, 0, 0, 1e9) }; return r; }) : null };
            });
            (b.devs || []).forEach(function (d) { if (d.chg && OD_CHG[d.ty]) d.chg = { u: indNum(d.chg.u, 0, 0, OD.chg) }; else delete d.chg; });
        }
        // ── 地图和指南针上的钉住的块（这趟盖着的才显示；基站没电的块这趟没盖，不显示）──
        function odActive() { return (ind.odLive || []).filter(function (b) { return odBlocks().indexOf(b) >= 0; }); }
        function odMapDraw(g, px) {
            g.strokeStyle = '#00e5ff'; g.lineWidth = 2;
            odActive().forEach(function (b) { let w = Math.max(5, b.n * px); g.strokeRect((b.x + IND_MAP) * px - w / 2, (b.z + IND_MAP) * px - w / 2, w, w); });
        }
        function odCompass(f, rx, rz) {
            let w = document.getElementById('ind-compass-bw'); if (!w) return;
            let best = null, bd = 1e9; odActive().forEach(function (b) { let d = Math.hypot(b.x - ind.p.x, b.z - ind.p.z); if (d < bd) { bd = d; best = b; } });
            if (!best) { w.style.display = 'none'; return; }
            w.style.display = 'inline';
            let tx = best.x - ind.p.x, tz = best.z - ind.p.z, ang = Math.atan2(tx * rx + tz * rz, tx * f.x + tz * f.z) * 180 / Math.PI;
            document.getElementById('ind-compass-ba').style.transform = 'rotate(' + ang.toFixed(0) + 'deg)';
            document.getElementById('ind-compass-bt').textContent = Math.round(bd) + ' 米';
            ind.compassB = { deg: ang, d: bd };
        }
