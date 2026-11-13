// 猫盾工业：原水池有限、水井、养鱼（docs/water-fish.md 分步第 2～5 步剩下的）。放在 19-industry-lava.js 后面。
// 原水池（出生点那个）：2×2 方形、存量开局 40 桶（悠闲 80），不漏、不蒸发，是一口井：每游戏小时 +1 桶补到满（任务 90）；接水 1 桶、喝一口 0.1 桶、基地里每只动物每 10 分钟喝 0.2 桶；旁边（水池边 2 米内）有井就由井补水。老存档给满。
// 水井：拿铲子对着自己挖的空池格左键，同一格连挖 5 次（每次 6 秒 × 铲子档）出水，这格变成井：每分钟出 1 桶（旁边有通电的水泵 2 米内 ×3），先流进四邻的池子格，没有就存在井里（最多 10 桶），空桶右键接。最多 2 口。
// 鱼：钓竿（木 2 + 草绳 2）站在河边海边右键，站着 10～30 秒咬钩；渔网（草绳 6）右键放水里，60 秒后再右键收，0～2 条。活鱼在背包里 10 分钟死成生鱼。
//  拿活鱼右键自己挖的池子放进去（每条要 2 桶水）；小麦、白菜、萝卜右键池子投食槽（最多 20 份）；每条鱼每 5 分钟吃 1 份；吃着的小鱼 600 秒长大，2 条大鱼 + 有吃的每 900 秒多 1 条；
//  鱼数超过水量 ÷ 2 就缺氧，每分钟 20% 死一条（补算按期望，悠闲不死）；水漏干鱼全死。空手左键池子捞一条（先大的）得生鱼，灶台烤成烤鱼（饱食 +40）。
        const FH = { poolHard: 40, poolCasual: 80, poolCells: 4, animalDrink: 0.2 / 600, wellDig: 6, wellN: 5, wellMax: 60, wellHour: IND_DAY / 24, poolRegen: 1, wellRegen: 0.5, wellPump: 3, wellStore: 10, perFish: 2, food: 20, eat: 300, grow: 600, breed: 900, hypo: 0.2 / 60, rodMin: 10, rodMax: 30, net: 60, liveT: 600 };
        Object.assign(IND_ITEMS_RAW, {
            fishing_rod: { name: '钓竿', col: 0x8d6e63, use: '站在河边海边右键，站着等鱼咬钩' },
            fish_net: { name: '渔网', col: 0xcfd8dc, use: '右键放进水里，60 秒后再右键收网' },
            fish_live: { name: '活鱼', col: 0x4dd0e1, later: '钓竿、渔网才有，体检看不到', use: '拿着右键自己挖的池子放进去养；放在背包里 10 分钟就死了' },
            fish_raw: { name: '生鱼', col: 0x90a4ae, later: '钓鱼、捞鱼才有，体检看不到', eat: { f: 5, ache: 0.5 }, use: '灶台烤成烤鱼' },
            fish_cooked: { name: '烤鱼', col: 0xff8a65, later: '生鱼烤的，体检看不到', eat: { f: 40 }, use: '饱食 +40' }
        });
        IND_CRAFT.push({ out: 'fishing_rod', in: { wood: 2, rope: 2 }, hard: true }, { out: 'fish_net', in: { rope: 6 }, hard: true }, { out: 'fishing_rod', in: { wood: 2, yarn: 2 }, casual: true }, { out: 'fish_net', in: { yarn: 6 }, casual: true });   // 悠闲没有草绳，用毛线
        IND_RECIPES.push({ in: { fish_raw: 1 }, out: { fish_cooked: 1 }, minT: 180, time: 10, burnT: 400 });
        // ── 原水池 ──
        function plCap() { return indHard() ? FH.poolHard : FH.poolCasual; }
        function plW() { let B = ind.base; if (!(B.poolW >= 0)) B.poolW = plCap(); return B.poolW; }
        function plRegen(dt) { let B = ind.base; plW(); B.poolW = Math.min(plCap(), B.poolW + FH.poolRegen / FH.wellHour * dt); }   // 初始井每游戏小时 +1 桶
        function plTake(n) {
            if (plW() < n - 1e-9) { indFlash('池子里没水了'); return false; }
            ind.base.poolW = Math.max(0, ind.base.poolW - n); return true;
        }
        // 原水池只能靠旁边的井补水（拿水桶对着它右键是喝，不是倒）
        // ── 井 ──
        function wlList() { return ind.base.wells = ind.base.wells || []; }
        function wlAt(i, j) { return wlList().filter(function (w) { return w.i === i && w.j === j; })[0] || null; }
        // 铲子对着已经挖好的池子格再往下挖：连挖 5 次出水
        function wlDeepen(c) {
            let sh = indSel(); if (tlKind(sh) !== 'shovel') return false;
            return wdChStart({ kind: 'well', need: FH.wellDig * FH.wellN * tlMul(sh), label: '凿井', done: function () {   // 站着一口气凿 30 秒（× 铲子档），中途动了就重来
                if (!pdCellAt(c.i, c.j)) return;
                tlUse(sh); let S = ind.base.surv; S.energy = Math.max(0, S.energy - PD.energy * FH.wellN);
                delete ind.base.wellDig; let w = c.w || 0, G = pdGroup(c), rest = G.filter(function (x) { return x !== c; });
                if (c.f && rest.length) { rest[0].f = fhMerge(rest[0].f, c.f); }
                ind.base.pond = pdCells().filter(function (x) { return x !== c; });
                if (rest.length) { rest[0].w = (rest[0].w || 0) + w; pdLevel(pdGroup(rest[0])); }
                wlList().push({ i: c.i, j: c.j, w: 0 }); indFlash('凿出水了，是一口井'); ind.pdDirty = true; indSave();
            } });
        }
        function wlUse(k) {
            let p = pdFront(), w = ind.where === 'base' ? wlAt(p.i, p.j) : null; if (!w) return false;
            if (indIsEmptyCont(k)) { if (w.w < 1 - 1e-9) { indFlash('井里没水'); return true; } w.w -= 1; indBagDel(k, 1); indGive(indFilledKey('water_raw', indContOf(k).mat), 1); return true; }
            return false;
        }
        function wlTick(dt) {
            wlList().forEach(function (w) {
                let pump = ind.base.devs.some(function (d) { return d.ty === 'pump' && d.pw && Math.hypot(d.x - w.i, d.z - w.j) <= 2; });
                let add = FH.wellRegen / FH.wellHour * (pump ? FH.wellPump : 1) * dt, to = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(function (d) { return pdCellAt(w.i + d[0], w.j + d[1]); }).filter(function (c) { return c && !(c.lid); })[0];
                if (!to) { let P = IND_BASE_ST.pool; if (!ind.base.off.pool && Math.hypot(w.i - P.x, w.j - P.z) <= P.r + 2) { let room = plCap() - plW(); let g = Math.min(add, Math.max(0, room)); ind.base.poolW += g; add -= g; } }
                if (to) { let G = pdGroup(to), room = G.length * PD.cap - pdWater(G); if (room > 0) { let g = Math.min(add, room); to.w = (to.w || 0) + g; add -= g; } }
                w.w = Math.min(FH.wellStore, w.w + add);
            });
        }
        // ── 鱼 ──
        function fhMerge(a, b) {
            if (!a) return b; if (!b) return a;
            let n = a.s + a.b + b.s + b.b || 1;
            return { s: a.s + b.s, b: a.b + b.b, g: (a.g * (a.s + a.b) + b.g * (b.s + b.b)) / n, m: Math.max(a.m, b.m), h: a.h + b.h, fd: Math.min(FH.food, a.fd + b.fd), dead: (a.dead || 0) + (b.dead || 0) };
        }
        function fhNew() { return { s: 0, b: 0, g: 0, m: 0, h: 0, fd: 0, dead: 0 }; }
        // 一个池子的鱼记在这个池子最靠前的格上；别的格上的并过来
        function fhOf(G, make) {
            let rec = null; G.forEach(function (c) { if (c.f) { rec = fhMerge(rec, c.f); c.f = null; } });
            if (!rec && make) rec = fhNew();
            if (rec) G[0].f = rec; return rec;
        }
        function fhN(f) { return f ? f.s + f.b : 0; }
        function fhWater(G) { return pdWater(G); }
        function fhTick(dt) {
            let seen = {}, mul = indHard() ? 1 : 0;
            pdCells().forEach(function (c0) {
                if (seen[c0.i + ',' + c0.j]) return; let G = pdGroup(c0); G.forEach(function (x) { seen[x.i + ',' + x.j] = 1; });
                let f = fhOf(G, false); if (!f || (fhN(f) <= 0)) return;
                let w = fhWater(G);
                if (w < 0.05) { f.dead += fhN(f); f.s = 0; f.b = 0; return; }   // 水漏干了：鱼全死，留在池子里
                let n = fhN(f), eat = n * dt / FH.eat, fed = f.fd > 0;
                if (fed) f.fd = Math.max(0, f.fd - eat);
                if (fed && f.s > 0) { f.g += dt / FH.grow; if (f.g >= 1) { f.g = 0; f.s--; f.b++; } }
                if (fed && f.b >= 2) { f.m += dt / FH.breed; if (f.m >= 1) { f.m = 0; if (fhN(f) < Math.floor(w / FH.perFish)) f.s++; } }
                if (n > Math.floor(w / FH.perFish) && mul) { f.h += FH.hypo * dt; if (f.h >= 1) { f.h -= 1; if (f.s > 0) f.s--; else f.b--; f.dead++; } } else f.h = 0;
            });
        }
        // 右键自己挖的池子：放活鱼、投食
        function fhUse(k, c, G) {
            if (k === 'fish_live') {
                let f = fhOf(G, true), w = pdWater(G);
                if (w < (fhN(f) + 1) * FH.perFish - 1e-9) { indFlash('水太少了'); return true; }
                indBagDel(k, 1); f.s++; ind.pdDirty = true; indSave(); return true;
            }
            if (k === 'wheat' || k === 'cabbage' || k === 'radish') {
                let f = fhOf(G, true); if (f.fd >= FH.food) { indFlash('食槽满了'); return true; }
                indBagDel(k, 1); f.fd++; indSave(); return true;
            }
            return false;
        }
        // 空手左键池子：捞一条（先大的，再小的，最后死的）
        function fhCatch() {
            if (ind.where !== 'base') return false;
            let c = pdAimCell(); if (!c) return false;
            let f = fhOf(pdGroup(c), false); if (!f || (fhN(f) + f.dead) <= 0) return false;
            if (f.b > 0) f.b--; else if (f.s > 0) f.s--; else f.dead--;
            indBoxAdd('fish_raw', 1); ind.pdDirty = true; indSave(); return true;
        }
        function fhHint(G) {
            let f = fhOf(G, false); if (!f) return '';
            return (fhN(f) > 0 ? '　鱼 ' + f.b + ' 大 ' + f.s + ' 小' : '') + (f.dead > 0 ? '　死鱼 ' + f.dead : '') + (f.fd > 0 ? '　食槽 ' + Math.ceil(f.fd) : '');
        }
        // ── 钓鱼、渔网（远征里）──
        function fhNearWater() { return ind.where === 'trip' && (indAtWater() || wdRiverNear(ind.map, ind.p.x, ind.p.z, 2)); }
        function fhRod(k) {
            if (k !== 'fishing_rod' || ind.where !== 'trip' || !fhNearWater()) return false;
            if (ind.fishing) { ind.fishing = null; return true; }
            ind.fishing = { t: 0, need: FH.rodMin + indRand() * (FH.rodMax - FH.rodMin), x: ind.p.x, z: ind.p.z }; return true;
        }
        function fhNet(k) {
            if (k !== 'fish_net' || ind.where !== 'trip' || !fhNearWater()) return false;
            let N = ind.fnet;
            if (!N) { ind.fnet = { t: ind.t, x: ind.p.x, z: ind.p.z }; return true; }
            if (ind.t - N.t < FH.net) { indFlash('网还没到时候'); return true; }
            let n = Math.floor(indRand() * 3); ind.fnet = null;
            if (n > 0) indBoxAdd('fish_live', n); else indFlash('网里是空的');
            return true;
        }
        function fhTripTick(dt) {
            let F = ind.fishing; if (!F) return;
            if (ind.where !== 'trip' || indSel() !== 'fishing_rod') { ind.fishing = null; return; }
            if (Math.hypot(ind.p.x - F.x, ind.p.z - F.z) > 0.4) { ind.fishing = null; indFlash('动了，鱼跑了'); return; }
            F.t += dt; if (F.t >= F.need) { ind.fishing = null; indBoxAdd('fish_live', 1); }
        }
        function fhTickAll(dt) { wlTick(dt); fhTick(dt); if (ind.where === 'base') { let B = ind.base; plW(); let m = indHard() ? 1 : 0.5; B.poolW = Math.max(0, B.poolW - B.animals.length * FH.animalDrink * m * dt); if (!B.off.pool) plRegen(dt); } }
        function fhFixBase(b) {
            b.poolW = b.poolW >= 0 ? indNum(b.poolW, FH.poolHard, 0, FH.poolCasual) : undefined; if (b.poolW === undefined) delete b.poolW;
            b.wells = (Array.isArray(b.wells) ? b.wells : []).filter(function (w) { return w && isFinite(w.i) && isFinite(w.j); }).slice(0, FH.wellMax).map(function (w) { return { i: w.i | 0, j: w.j | 0, w: indNum(w.w, 0, 0, FH.wellStore) }; });
            (b.pond || []).forEach(function (c) {
                if (!c.f || typeof c.f !== 'object') { delete c.f; return; }
                let f = c.f; c.f = { s: indNum(f.s, 0, 0, 999) | 0, b: indNum(f.b, 0, 0, 999) | 0, g: indNum(f.g, 0, 0, 1), m: indNum(f.m, 0, 0, 1), h: indNum(f.h, 0, 0, 1), fd: indNum(f.fd, 0, 0, FH.food), dead: indNum(f.dead, 0, 0, 999) | 0 };
            });
        }
