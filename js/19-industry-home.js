// 猫盾工业：石屋（docs/home-expand.md 分步第 1 步）。放在 19-industry-pond.js 后面。
// 工作台 石头 50 + 木头 10（悠闲 石头 25 + 木头 5）→ 石屋，6 × 6 米，保暖 9（木屋 6、砖房 12）。跟别的房子一起算上限。
// 扩展家园、石墙、石地板在下面。
        IND_HOUSE.stone = { name: '石屋', w: 6, d: 6, warm: 9, wall: 0x9e9e9e, roof: 0x616161 };
        IND_ITEMS_RAW.house_stone = { name: '石屋', col: 0x9e9e9e, house: 'stone', use: '放下就是一间房，保暖 9' };
        IND_CRAFT.push({ out: 'house_stone', in: { stone: 50, wood: 10 }, hard: true }, { out: 'house_stone', in: { stone: 25, wood: 5 }, casual: true });
// ── 扩展家园、石墙、石地板（分步第 2、3 步）──
// 基地边界 IND_BASE = { x0, x1, z0, z1 }（原来 ±30 × ±22.5）；ext = { e, w, s } 往东西南各扩了几次，每次 10 米，北边（出发门）不扩，所以门不动。
// 拿着石头右键东、南、西三面的栅栏（2.5 米内）弹窗确认；成本第 1 次 120 石头，以后每次 +60（四个方向一起数，悠闲减半向上取整）；东西加起来最多 4 次，南最多 4 次。
// 炉子、房子上限：每 1000 平方米 2 个，最少 6、最多 16。石墙（石头 4，2 米一段，挡人不挡动物）、石地板（石头 2，2 × 2 米，现在只是铺着好看，防火等"会烧着"那一步）右键放下，空手右键收起。
        const HM = { step: 10, maxX: 4, maxS: 4, cost0: 120, costStep: 60, fence: 2.5, wall: 2, wallT: 0.3, floor: 2, maxItems: 60 };
        Object.assign(IND_ITEMS_RAW, {
            stone_wall: { name: '石墙', col: 0x9e9e9e, use: '右键放下，2 米一段，挡路；空手右键收起' },
            stone_floor: { name: '石地板', col: 0xbdbdbd, use: '右键放下，2 × 2 米，铺在地上；空手右键收起' }
        });
        IND_CRAFT.push({ out: 'stone_wall', in: { stone: 4 } }, { out: 'stone_floor', in: { stone: 2 } });
        function hmExt(b) { let e = b && b.ext || {}; return { e: indNum(e.e, 0, 0, HM.maxX) | 0, w: indNum(e.w, 0, 0, HM.maxX) | 0, s: indNum(e.s, 0, 0, HM.maxS) | 0 }; }
        function hmApply(b) {
            let x = hmExt(b); if (x.e + x.w > HM.maxX) x.w = HM.maxX - x.e;
            IND_BASE.x0 = -30 - HM.step * x.w; IND_BASE.x1 = 30 + HM.step * x.e; IND_BASE.z0 = -22.5; IND_BASE.z1 = 22.5 + HM.step * x.s;
            IND_BASE.x = Math.max(-IND_BASE.x0, IND_BASE.x1); IND_BASE.z = Math.max(-IND_BASE.z0, IND_BASE.z1);
            if (b) b.ext = x; return x;
        }
        function hmAreaCap() { return Math.max(6, Math.min(16, Math.floor((IND_BASE.x1 - IND_BASE.x0) * (IND_BASE.z1 - IND_BASE.z0) / 1000) * 2)); }
        function indHouseCap() { return hmAreaCap(); }
        function indCookCap() { return 100000; }   // 任务 167：炉子不限个数
        function hmCost(x) { let c = HM.cost0 + HM.costStep * (x.e + x.w + x.s); return indHard() ? c : Math.ceil(c / 2); }
        function hmLeft(x, dir) { return dir === 's' ? HM.maxS - x.s : HM.maxX - x.e - x.w; }
        const HM_DIR = { e: '东', w: '西', s: '南' };
        function hmFenceDir() {
            let p = ind.p; if (p.x > IND_BASE.x1 - HM.fence) return 'e'; if (p.x < IND_BASE.x0 + HM.fence) return 'w'; if (p.z > IND_BASE.z1 - HM.fence) return 's'; return null;
        }
        function hmExpand(dir) {
            let B = ind.base, x = hmExt(B); if (hmLeft(x, dir) <= 0) { indFlash('到头了'); return false; }
            let cost = hmCost(x); if ((ind.bag.stone || 0) < cost) { indFlash('要 ' + cost + ' 块石头'); return false; }
            indBagDel('stone', cost); x[dir]++; B.ext = x; hmApply(B);
            let px = ind.p.x, pz = ind.p.z; indPanelClose(); indGoBase(null); ind.p.x = px; ind.p.z = pz; ind.hmDirty = true; indSave(); return true;
        }
        function hmAsk(dir) {
            let x = hmExt(ind.base), left = hmLeft(x, dir);
            if (left <= 0) { indFlash('到头了'); return true; }
            let cost = hmCost(x);
            indPanelShow('expand', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">往' + HM_DIR[dir] + '扩 ' + HM.step + ' 米，要 ' + cost + ' 块石头，扩吗？</div><div style="color:#666;">身上有 ' + (ind.bag.stone || 0) + ' 块；往' + HM_DIR[dir] + '还能扩 ' + left + ' 次</div>' +
                '<div style="margin-top:8px;text-align:right;"><button id="ind-expand-ok" style="' + IND_BTN + 'background:#2e7d32;" onclick="hmExpand(\'' + dir + '\')">扩</button><button style="' + IND_BTN + '" onclick="indPanelClose()">算了</button></div>');
            return true;
        }
        // 石墙、石地板：B.walls = [{ x, z, r }]（r = 1 沿 z 方向）、B.floors = [{ x, z }]
        function hmWalls(b) { return (b || ind.base).walls || []; }
        function hmBox(w) { return w.r ? { x0: w.x - HM.wallT / 2, x1: w.x + HM.wallT / 2, z0: w.z - HM.wall / 2, z1: w.z + HM.wall / 2 } : { x0: w.x - HM.wall / 2, x1: w.x + HM.wall / 2, z0: w.z - HM.wallT / 2, z1: w.z + HM.wallT / 2 }; }
        function hmCollide(p) {
            hmWalls().forEach(function (w) {
                let b = hmBox(w), R = 0.35, x0 = b.x0 - R, x1 = b.x1 + R, z0 = b.z0 - R, z1 = b.z1 + R;
                if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
                    let dl = p.x - x0, dr = x1 - p.x, dt = p.z - z0, db = z1 - p.z, m = Math.min(dl, dr, dt, db);
                    if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === dt) p.z = z0; else p.z = z1;
                }
            });
        }
        function hmNearest(list, x, z, r) { let best = null, bd = r; (list || []).forEach(function (o) { let d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }); return best; }
        function hmUse(k, a) {
            let B = ind.base, f = indFace(), x = ind.p.x + f.x * 2, z = ind.p.z + f.z * 2;
            if (k === 'stone' && !a) { let d = hmFenceDir(); if (d) return hmAsk(d); }
            if (k === 'stone_wall' || k === 'stone_floor') {
                B.walls = B.walls || []; B.floors = B.floors || [];
                if (B.walls.length + B.floors.length >= HM.maxItems) { indFlash('石头铺得够多了'); return true; }
                x = Math.max(IND_BASE.x0 + 1, Math.min(IND_BASE.x1 - 1, x)); z = Math.max(IND_BASE.z0 + 1, Math.min(IND_BASE.z1 - 1, z));
                if (k === 'stone_wall') { let r = Math.abs(f.z) > Math.abs(f.x) ? 0 : 1; B.walls.push({ x: Math.round(x), z: Math.round(z), r: r }); }
                else B.floors.push({ x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2 });
                indBagDel(k, 1); ind.hmDirty = true; indSave(); return true;
            }
            if (!k && !a) {   // 空手右键面前的石墙、石地板：收起
                let w = hmNearest(B.walls, x, z, 1.6), fl = hmNearest(B.floors, x, z, 1.6);
                if (w) { B.walls = B.walls.filter(function (o) { return o !== w; }); indBoxAdd('stone_wall', 1); ind.hmDirty = true; indSave(); return true; }
                if (fl) { B.floors = B.floors.filter(function (o) { return o !== fl; }); indBoxAdd('stone_floor', 1); ind.hmDirty = true; indSave(); return true; }
            }
            return false;
        }
        // 画：每次放下、收起、进基地时重画（最多 60 个，直接用方块）
        function hmSync() {
            if (ind.where !== 'base') return;
            if (ind.hmWorld !== ind.grass) { ind.hmWorld = ind.grass; ind.hmObjs = []; ind.hmDirty = true; }   // 进基地重建了世界
            if (!ind.hmDirty) return; ind.hmDirty = false;
            (ind.hmObjs || []).forEach(function (o) { scene.remove(o); }); ind.hmObjs = [];
            let B = ind.base, before = ind.objs.length;
            (B.floors || []).forEach(function (o) { indBox(HM.floor, 0.06, HM.floor, 0xbdbdbd, o.x, 0.04, o.z); });
            (B.walls || []).forEach(function (w) { let b = hmBox(w); indBox(b.x1 - b.x0, 1.2, b.z1 - b.z0, 0x9e9e9e, w.x, 0.6, w.z); });
            ind.hmObjs = ind.objs.slice(before);
        }
        function hmHint() {
            let d = hmFenceDir(), x = hmExt(ind.base);
            return d && indSel() === 'stone' ? '往' + HM_DIR[d] + (hmLeft(x, d) > 0 ? '还能扩 ' + hmLeft(x, d) + ' 次（下次 ' + hmCost(x) + ' 石头）' : '到头了') : '';
        }
        function hmFixBase(b) {
            hmApply(b);
            b.walls = (Array.isArray(b.walls) ? b.walls : []).filter(function (w) { return w && isFinite(w.x) && isFinite(w.z); }).slice(0, HM.maxItems).map(function (w) { return { x: indNum(w.x, 0, IND_BASE.x0, IND_BASE.x1), z: indNum(w.z, 0, IND_BASE.z0, IND_BASE.z1), r: w.r ? 1 : 0 }; });
            b.floors = (Array.isArray(b.floors) ? b.floors : []).filter(function (w) { return w && isFinite(w.x) && isFinite(w.z); }).slice(0, Math.max(0, HM.maxItems - b.walls.length)).map(function (w) { return { x: indNum(w.x, 0, IND_BASE.x0, IND_BASE.x1), z: indNum(w.z, 0, IND_BASE.z0, IND_BASE.z1) }; });
        }
