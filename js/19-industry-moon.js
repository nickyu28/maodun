// 猫盾工业：月球 M1——固定地图（任务 82，路线图 docs/moon.md）。放在 19-industry-asu.js 后面（最后一个）。只有硬核，没有玩家入口，调试用：?hcdebug=1 下控制台 indMoonEnter() 进、indMoonLeave() 回基地。
// 600 × 600 米（x、z 各 −300～300），固定种子，生成完全确定（用自己带种子的随机数，不碰 indRand）：同一个种子生成两次，地形高度、资源点列表（顺序、位置、数量）一模一样。
// 沿用远征图的渲染（wdTerrain）和露头采集，换一套地貌：月海（低而平，深灰）、高地（隆起 10～40 米，浅灰）、撞击坑 25～35 个、月溪 3～5 条、极地（z ≥ 240）6～10 个永久阴影坑、熔岩管天窗 2～3 个、至少 12 块平地。
// 高度整体抬 20 米（海拔 20 米是月面基准），免得坑底低过水面线被当成水。资源点有限、挖完不刷新：ind.base.moon = { seed, dug: [[资源点编号, 剩余]…], cells: [[格子, 剩余]…] }，只存动过的。
        // 星球是一份参数表（任务 82 第 9 条，作者以后要自定义行星）：月球是第一份。地图生成读这份表，不把月球的数写死在生成代码里。
        // 重力 m/s²、大气（有没有氧、气压 kPa）、昼夜长度（秒，游戏里的一整个昼夜）、温度范围（°C，夜／昼）、地貌表（个数范围、尺寸）、资源表（每种矿的分布区域、份数）、生物表（月球没有）。
        // 重力、大气、昼夜、温度现在只是记着，后面的期（呼吸、温度、重力）接上；地貌和资源表现在就用。
        const IND_PLANETS = {
            moon: {
                name: '月球', seed: 20261107, size: 600, off: 20,
                gravity: 1.62, air: { o2: false, kPa: 0 }, day: 2552400, temp: [-170, 120],
                // 地貌表：区域占比（月海 40%、高地 40%，余下过渡）、撞击坑／月溪／天窗／永久阴影坑个数、平地要求
                terrain: { regionLo: 0.4, regionHi: 0.6, craters: [14, 18], bigCraters: 3, rills: [2, 4], sky: [2, 3], pits: [6, 10], pitsSouth: [8, 12], poleZ: 240, flats: { w: 70, d: 55, n: 14 } },
                // 资源表：区域（mare／high／crater／edge／scatter／pole）、露头个数、每个露头的份数 [最少, 最多]。份数按 docs/industry.md "月球地图"算出来的总量 ≥ 3 倍所需（改了配方表要重新算）
                res: { ilmenite: { at: 'mare', patches: [6, 10], amt: [80, 120] }, anorthosite: { at: 'high', patches: [6, 10], amt: [40, 70] }, olivine: { at: 'crater', amt: [70, 110] }, kreep: { at: 'edge', patches: [4, 6], amt: [60, 100] }, meteor_fe: { at: 'crater', amt: [3, 6] }, troilite: { at: 'scatter', patches: [15, 25], amt: [15, 30] }, ice: { at: 'pole', amt: [60, 120] } },
                cellN: 30, creatures: []
            }
        };
        const MN = { P: IND_PLANETS.moon, seed: IND_PLANETS.moon.seed, off: IND_PLANETS.moon.off, flatW: IND_PLANETS.moon.terrain.flats.w, flatD: IND_PLANETS.moon.terrain.flats.d, flatN: IND_PLANETS.moon.terrain.flats.n, cellN: IND_PLANETS.moon.cellN, region: [IND_PLANETS.moon.terrain.regionLo, IND_PLANETS.moon.terrain.regionHi] };
        MN.amt = {}; Object.keys(MN.P.res).forEach(function (k) { MN.amt[k] = MN.P.res[k].amt; });
        Object.assign(IND_ITEMS_RAW, {
            ilmenite: { name: '钛铁矿', col: 0x37474f, later: '月球的矿，用处在后面的期', use: '月海的黑色矿' },
            anorthosite: { name: '斜长岩', col: 0xeceff1, later: '月球的矿，用处在后面的期', use: '高地的白色岩石' },
            olivine: { name: '橄榄石', col: 0x9ccc65, later: '月球的矿，用处在后面的期', use: '撞击坑边的绿色矿' },
            kreep: { name: 'KREEP 岩', col: 0xa1887f, later: '月球的矿，用处在后面的期', use: '月海边缘稀有的岩石' },
            meteor_fe: { name: '陨石铁镍块', col: 0x8d6e63, later: '月球的矿，用处在后面的期', use: '坑底的天然铁镍' },
            troilite: { name: '陨硫铁', col: 0xffb74d, later: '月球的矿，用处在后面的期', use: '玄武岩里的金色颗粒' },
            regolith: { name: '月壤', col: 0xbdbdbd, later: '月球的土，用处在后面的期', use: '细碎的岩石粉' }
        });
        ['ilmenite', 'anorthosite', 'olivine', 'kreep', 'meteor_fe', 'troilite', 'ice'].forEach(function (k) { IND_NODES[k] = { give: [1, 1], tool: 1, name: (IND_ITEMS_RAW[k] || { name: '水冰' }).name }; });
        IND_BIOMES.moon_mare = { name: '月海', col: 0x3a3f44, res: {} }; IND_BIOMES.moon_high = { name: '高地', col: 0xb0b4b8, res: {} }; IND_BIOMES.moon_mid = { name: '丘陵', col: 0x7d8185, res: {} }; IND_BIOMES.moon_pole = { name: '极地', col: 0xcfd8dc, res: {} };
        WD_DIG.moon_mare = WD_DIG.moon_high = WD_DIG.moon_mid = WD_DIG.moon_pole = 'regolith';
        function mnSm(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
        function mnRng(salt) { return indRng((MN.seed * 2654435761 + salt * 40503) >>> 0); }
        // 月海／高地的分界按噪声的分位数定（40% 最低的是月海，40% 最高的是高地，中间 20% 过渡）
        function mnRegion(MG, x, z) { let v = indFbm(x / 160, z / 160, MG.seed); return v < MG.tLo ? 'mare' : v > MG.tHi ? 'high' : 'mid'; }
        function mnCraterH(d, r) { let depth = 0.1 * r, rim = 0.04 * r; if (d < 0.5) return -depth; if (d < 1) return -depth + (depth + rim) * mnSm((d - 0.5) / 0.5); if (d < 1.45) return rim * (1 - mnSm((d - 1) / 0.45)); return 0; }
        function mnPitH(d, depth) { return d < 0.5 ? -depth : d < 1 ? -depth * (1 - mnSm((d - 0.5) / 0.5)) : 0; }
        function mnRillDist(rl, x, z) {
            if (x < rl.x0 || x > rl.x1 || z < rl.z0 || z > rl.z1) return 1e9;
            let m = 1e9, P = rl.pts;
            for (let i = 1; i < P.length; i++) {
                let ax = P[i - 1][0], az = P[i - 1][1], bx = P[i][0], bz = P[i][1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
                m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t));
            }
            return m;
        }
        function mnRaw(MG, x, z) {
            let v = indFbm(x / 160, z / 160, MG.seed), s = mnSm((v - (MG.tLo - 0.25)) / (MG.tHi - MG.tLo + 0.5));   // 过渡放宽，坡缓一点（任务 127）
            let h = MN.off + s * (6 + 14 * (0.5 + 0.5 * indFbm(x / 60, z / 60, MG.seed + 3))) + (1 - s) * 0.2 * indFbm(x / 12, z / 12, MG.seed + 5) + s * 0.6 * indFbm(x / 9, z / 9, MG.seed + 6);
            MG.craters.forEach(function (c) { let d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1.45) h += mnCraterH(d, c.r); });
            MG.rills.forEach(function (rl) { let dd = mnRillDist(rl, x, z), half = rl.w / 2, bank = 2 * rl.d; if (dd < half + bank) h -= rl.d * (dd <= half ? 1 : 1 - mnSm((dd - half) / bank)); });
            MG.pits.forEach(function (p) { let d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < 1) h += mnPitH(d, p.depth); });
            MG.sky.forEach(function (p) { let d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < 1) h += mnPitH(d, p.depth); });
            return h;
        }
        function moonHeight(MG, x, z) {
            let h = mnRaw(MG, x, z);
            for (let i = 0; i < MG.flats.length; i++) {
                let f = MG.flats[i], dx = Math.max(Math.abs(x - f.x) - f.w / 2, 0), dz = Math.max(Math.abs(z - f.z) - f.d / 2, 0), dd = Math.hypot(dx, dz);
                if (dd < 15) { let w = dd <= 0 ? 1 : mnSm(1 - dd / 15); h = h * (1 - w) + f.h * w; }
            }
            if (MG.site) {   // 落点矩形（60 × 45）压平到落点高度，往外 6 米渐变（任务 83）
                let q = MG.site, dx = Math.max(Math.abs(x - q.x) - 30, 0), dz = Math.max(Math.abs(z - q.z) - 22.5, 0), dd = Math.hypot(dx, dz);
                if (dd < 6) { let w = dd <= 0 ? 1 : mnSm(1 - dd / 6); h = h * (1 - w) + q.h * w; }
            }
            return h;
        }
        function moonBiome(MG, x, z) {
            if (Math.abs(z) >= MN.P.terrain.poleZ) return 'moon_pole';   // 南北两个极区都有永久阴影坑（任务 127）
            let r = mnRegion(MG, x, z); return r === 'mare' ? 'moon_mare' : r === 'high' ? 'moon_high' : 'moon_mid';
        }
        let MN_MG = null;
        function moonGen() {
            if (MN_MG) return MN_MG;
            let TP = MN.P.terrain, MG = { seed: MN.seed, craters: [], rills: [], pits: [], sky: [], flats: [], res: [] }, vs = [];
            for (let gx = -290; gx <= 290; gx += 10) for (let gz = -290; gz <= 290; gz += 10) vs.push(indFbm(gx / 160, gz / 160, MG.seed));
            vs.sort(function (a, b) { return a - b; }); MG.tLo = vs[Math.floor(vs.length * MN.region[0])]; MG.tHi = vs[Math.floor(vs.length * MN.region[1])];
            let rf = mnRng(1), near = function (x, z, pad) { return MG.flats.some(function (f) { return Math.abs(x - f.x) <= f.w / 2 + pad && Math.abs(z - f.z) <= f.d / 2 + pad; }); };
            // 平地：2 块在极地边上（离水冰坑 150 米内），其余散在月海和高地脚下
            MG.flats.push({ x: -120, z: 190, w: MN.flatW, d: MN.flatD }, { x: 120, z: 190, w: MN.flatW, d: MN.flatD }, { x: -120, z: -190, w: MN.flatW, d: MN.flatD }, { x: 120, z: -190, w: MN.flatW, d: MN.flatD });   // 北极、南极边上各 2 块
            for (let t = 0; t < 8000 && MG.flats.length < MN.flatN; t++) {
                let x = Math.round((rf() * 2 - 1) * 245), z = Math.round((rf() * 2 - 1) * 150 - 40);
                if (MG.flats.some(function (f) { return Math.hypot(f.x - x, f.z - z) < 110; })) continue;
                MG.flats.push({ x: x, z: z, w: MN.flatW, d: MN.flatD });
            }
            // 撞击坑：先放 6 个大的（半径 30～60），再补到 25～35 个（小的多）
            let rc = mnRng(2), want = TP.craters[0] + Math.floor(rc() * (TP.craters[1] - TP.craters[0] + 1));
            for (let t = 0; t < 6000 && MG.craters.length < want; t++) {
                let big = MG.craters.length < TP.bigCraters, r = big ? 30 + rc() * 30 : 8 + 40 * Math.pow(rc(), 2.2), x = (rc() * 2 - 1) * (290 - r), z = (rc() * 2 - 1) * Math.min(290 - r, 232 - r);
                if (near(x, z, r * 1.5 + 8) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.9; })) continue;
                MG.craters.push({ x: x, z: z, r: r });
            }
            // 月溪：3～5 条，在月海里，宽 4～8、深 3～6、长 80～250，弯弯曲折
            let rr = mnRng(3), wantR = TP.rills[0] + Math.floor(rr() * (TP.rills[1] - TP.rills[0] + 1));
            for (let t = 0; t < 40000 && MG.rills.length < wantR; t++) {
                let L = 80 + rr() * 170, x = (rr() * 2 - 1) * 250, z = (rr() * 2 - 1) * 200, a = rr() * Math.PI * 2, pts = [[x, z]], ok = mnRegion(MG, x, z) === 'mare';
                for (let s = 8; s <= L && ok; s += 8) {
                    a += (rr() - 0.5) * 0.7; x += Math.cos(a) * 8; z += Math.sin(a) * 8;
                    if (Math.abs(x) > 280 || Math.abs(z) > 225 || mnRegion(MG, x, z) !== 'mare' || near(x, z, 14) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < c.r * 1.5 + 8; })) ok = false; else pts.push([x, z]);
                }
                if (pts.length < 11) continue;
                let xs = pts.map(function (p) { return p[0]; }), zs = pts.map(function (p) { return p[1]; }), w = 4 + rr() * 4, d = 3 + rr() * 3, pad = w / 2 + 2 * d + 2;
                MG.rills.push({ pts: pts, w: w, d: d, x0: Math.min.apply(null, xs) - pad, x1: Math.max.apply(null, xs) + pad, z0: Math.min.apply(null, zs) - pad, z1: Math.max.apply(null, zs) + pad });
            }
            let hitRill = function (x, z, pad) { return MG.rills.some(function (rl) { return mnRillDist(rl, x, z) < rl.w / 2 + 2 * rl.d + pad; }); };
            // 熔岩管天窗：月海里 2～3 个圆坑，半径约 10 米
            let rs = mnRng(4), wantS = TP.sky[0] + Math.floor(rs() * (TP.sky[1] - TP.sky[0] + 1));
            for (let t = 0; t < 4000 && MG.sky.length < wantS; t++) {
                let x = (rs() * 2 - 1) * 250, z = (rs() * 2 - 1) * 200, r = 9 + rs() * 2;
                if (mnRegion(MG, x, z) !== 'mare' || near(x, z, r + 20) || hitRill(x, z, r + 10) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < c.r * 1.5 + r + 8; }) || MG.sky.some(function (q) { return Math.hypot(q.x - x, q.z - z) < 60; })) continue;
                MG.sky.push({ x: x, z: z, r: r, depth: 6 });
            }
            // 极地（z ≥ 240）：6～10 个永久阴影坑，半径 6～15、深 8，坑底是水冰；头两个紧挨着两块近水平地
            let rp = mnRng(5), wantP = TP.pits[0] + Math.floor(rp() * (TP.pits[1] - TP.pits[0] + 1));
            for (let t = 0; t < 4000 && MG.pits.length < wantP; t++) {
                let r = 6 + rp() * 9, x = (rp() * 2 - 1) * (285 - r), z = 252 + rp() * (36 - r);
                if (MG.pits.length === 0) x = -120 + (rp() - 0.5) * 40; else if (MG.pits.length === 1) x = 120 + (rp() - 0.5) * 40;
                if (MG.pits.some(function (q) { return Math.hypot(q.x - x, q.z - z) < q.r + r + 10; })) continue;
                MG.pits.push({ x: x, z: z, r: r, depth: 8 });
            }
            // 南极（z ≤ −240）：8～12 个永久阴影坑（比北极多，现实里南极的冰更多；用自己的随机数，不动北极的），头两个紧挨着南边的两块平地
            { let rs2 = mnRng(7), wantS2 = Math.max(TP.pitsSouth[0] + Math.floor(rs2() * (TP.pitsSouth[1] - TP.pitsSouth[0] + 1)), MG.pits.length + 1), south = 0;   // 南极比北极至少多 1 个
              for (let t = 0; t < 4000 && south < wantS2; t++) {
                let r = 6 + rs2() * 9, x = (rs2() * 2 - 1) * (285 - r), z = -(252 + rs2() * (36 - r));
                if (south === 0) x = -120 + (rs2() - 0.5) * 40; else if (south === 1) x = 120 + (rs2() - 0.5) * 40;
                if (MG.pits.some(function (q) { return Math.hypot(q.x - x, q.z - z) < q.r + r + 10; })) continue;
                MG.pits.push({ x: x, z: z, r: r, depth: 8, south: true }); south++;
              } }
            // 平地的高度：取地形（不含平地）在中心的高度，平地范围内压成一样高
            MG.flats.forEach(function (f) { f.h = mnRaw(MG, f.x, f.z); });
            // 资源点：编号按生成顺序，露头一次挖 1 份，份数固定
            let rq = mnRng(6), id = 0, amt = function (k) { let a = MN.amt[k]; return a[0] + Math.floor(rq() * (a[1] - a[0] + 1)); };
            let put = function (k, x, z) { let n = amt(k); MG.res.push({ id: id++, key: k, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, n: n, n0: n }); };
            let free = function (x, z, pad) { return Math.abs(x) < 290 && Math.abs(z) < 290 && !near(x, z, pad || 4) && !hitRill(x, z, 4) && !MG.sky.some(function (q) { return Math.hypot(q.x - x, q.z - z) < q.r + 4; }) && !MG.pits.some(function (q) { return Math.hypot(q.x - x, q.z - z) < q.r + 4; }); };
            let patches = function (k, reg, n0, n1, per) {
                let cnt = n0 + Math.floor(rq() * (n1 - n0 + 1)), got = 0;
                for (let t = 0; t < 6000 && got < cnt; t++) {
                    let x = (rq() * 2 - 1) * 280, z = (rq() * 2 - 1) * 225;
                    if (mnRegion(MG, x, z) !== reg || !free(x, z, 6) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < c.r * 1.2 + 4; })) continue;
                    let m = 1 + Math.floor(rq() * per); for (let i = 0; i < m; i++) put(k, x + (rq() * 2 - 1) * 4, z + (rq() * 2 - 1) * 4); got++;
                }
            };
            patches('ilmenite', 'mare', MN.P.res.ilmenite.patches[0], MN.P.res.ilmenite.patches[1], 2); patches('anorthosite', 'high', MN.P.res.anorthosite.patches[0], MN.P.res.anorthosite.patches[1], 2);
            MG.craters.forEach(function (c) {
                if (c.r < 24) return;
                let n = 1 + Math.floor(rq() * 2); for (let i = 0; i < n; i++) { let a = rq() * Math.PI * 2; put('olivine', c.x + Math.cos(a) * c.r * 1.12, c.z + Math.sin(a) * c.r * 1.12); }
                let m = 1 + Math.floor(rq() * 3); for (let i = 0; i < m; i++) { let a = rq() * Math.PI * 2, d = rq() * c.r * 0.35; put('meteor_fe', c.x + Math.cos(a) * d, c.z + Math.sin(a) * d); }
            });
            for (let t = 0, got = 0, want2 = MN.P.res.kreep.patches[0] + Math.floor(rq() * (MN.P.res.kreep.patches[1] - MN.P.res.kreep.patches[0] + 1)); t < 6000 && got < want2; t++) {
                let x = -110 - rq() * 180, z = 55 + rq() * 170;
                if (mnRegion(MG, x, z) !== 'mare' || !free(x, z, 6) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < c.r * 1.2 + 4; })) continue;
                put('kreep', x, z); got++;
            }
            for (let t = 0, got = 0, want3 = MN.P.res.troilite.patches[0] + Math.floor(rq() * (MN.P.res.troilite.patches[1] - MN.P.res.troilite.patches[0] + 1)); t < 6000 && got < want3; t++) {
                let x = (rq() * 2 - 1) * 280, z = (rq() * 2 - 1) * 225;
                if (mnRegion(MG, x, z) !== 'mare' || !free(x, z, 6) || MG.craters.some(function (c) { return Math.hypot(c.x - x, c.z - z) < c.r * 1.2 + 4; })) continue;
                put('troilite', x, z); got++;
            }
            MG.pits.forEach(function (p) { let n = (p.south ? 3 : 2) + Math.floor(rq() * 3); for (let i = 0; i < n; i++) { let a = rq() * Math.PI * 2, d = rq() * p.r * 0.35; put('ice', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d); } });
            MN_MG = MG; return MG;
        }
        let MN_READS = 0;   // 读资源点的次数（选址图画一遍应该是 0：选址只看地貌，不看矿）
        function moonRes(MG) { MN_READS++; return MG.res; }
        function mnHash(MG) {   // 地形高度（每 25 米一个点）和资源点列表算一个数，测"同种子两次一样"
            let h = 5381, add = function (v) { h = (Math.imul(h, 33) + (Math.round(v * 1000) | 0)) | 0; };
            for (let x = -300; x <= 300; x += 25) for (let z = -300; z <= 300; z += 25) add(moonHeight(MG, x, z));
            moonRes(MG).forEach(function (o) { add(o.id); add(o.x); add(o.z); add(o.n); for (let i = 0; i < o.key.length; i++) add(o.key.charCodeAt(i)); });
            return h >>> 0;
        }
        // 重新生成一份（不用缓存）：测试里比两次
        function moonFresh() { let keep = MN_MG; MN_MG = null; let g = moonGen(); MN_MG = keep || g; return g; }
        // ── 存档 ──
        function mnState() { let B = ind.base; if (!B.moon || typeof B.moon !== 'object') B.moon = { seed: MN.seed, v: 2, dug: [], cells: [] }; return B.moon; }
        function mnFixBase(b) {
            if (!b.moon || typeof b.moon !== 'object') { delete b.moon; return; }
            let m = b.moon, seen = {};
            let dug = (Array.isArray(m.dug) ? m.dug : []).filter(function (e) { return Array.isArray(e) && e.length === 2 && isFinite(e[0]) && isFinite(e[1]) && e[0] >= 0 && !seen[e[0] | 0] && (seen[e[0] | 0] = 1); }).slice(0, 2000).map(function (e) { return [e[0] | 0, Math.max(0, Math.min(1e6, e[1] | 0))]; });
            let seenC = {}, cells = (Array.isArray(m.cells) ? m.cells : []).filter(function (e) { return Array.isArray(e) && e.length === 2 && isFinite(e[0]) && isFinite(e[1]) && e[0] >= 0 && e[0] < 360000 && !seenC[e[0] | 0] && (seenC[e[0] | 0] = 1); }).slice(0, 100000).map(function (e) { return [e[0] | 0, Math.max(0, Math.min(MN.cellN, e[1] | 0))]; });
            let old = m.v !== 2;   // 任务 127 改了坑和冰的分布：旧存档的资源点编号对不上，挖过的记录丢掉（没人在月球上存过进度）；落点保留，压平高度按新地形重算
            let out = { seed: MN.seed, v: 2, dug: old ? [] : dug, cells: cells };
            if (m.site && isFinite(m.site.x) && isFinite(m.site.z)) out.site = { x: +m.site.x, z: +m.site.z };
            if (out.site && m.flat && isFinite(m.flat.h)) out.flat = { h: +m.flat.h }; else delete out.site;
            if (old && out.site) { let MG0 = moonGen(), sv = MG0.site; delete MG0.site; out.flat = { h: Math.round(moonHeight(MG0, out.site.x, out.site.z) * 100) / 100 }; if (sv) MG0.site = sv; }
            b.moon = out;
        }
        // 落点压平（任务 83 选了落点才有）：把存档里的落点和高度告诉地图
        function mnSyncSite() { let MG = moonGen(), S = ind && ind.base && ind.base.moon; if (S && S.site && S.flat) MG.site = { x: S.site.x, z: S.site.z, h: S.flat.h }; else delete MG.site; }
        // ── 进出 ──
        function indMoonEnter() {
            if (!ind || !ind.base || ind.loading) return false;
            if (ind.base.rule !== 'hard') { indFlash('只有硬核有月球'); return false; }
            let MG = moonGen(), S = mnState(); mnSyncSite();
            if (ind.base.rule && typeof ind.base.away !== 'number') ind.base.away = ind.base.clock;
            indClearWorld();
            ind.where = 'trip'; ind.exitT = 0; ind.tripFires = []; ind.rafts = []; ind.onRaft = null; ind.tripGround = []; ind.tripBench = []; ind.tripBombs = []; ind.tripRad = []; ind.mush = null; ind.seen = null; ind.nodeView = null; ind.cave = null; ind.caves = []; mbReset();
            let M = ind.map = { seed: MG.seed, volc: [], rivers: [], moon: MG };
            ind.tdevs = []; ind.odLive = []; ind.odObjs = [];
            scene.background = new THREE.Color(0x03030a); scene.fog = new THREE.Fog(0x03030a, 80, 420);
            wdTerrain(M);
            let dug = {}; S.dug.forEach(function (e) { dug[e[0]] = e[1]; });
            ind.nodes = [];
            moonRes(MG).forEach(function (o) {
                let n = dug[o.id] !== undefined ? dug[o.id] : o.n; if (n <= 0) return;
                ind.nodes.push({ key: o.key, out: true, moonId: o.id, x: o.x, z: o.z, y: indHeight(M, o.x, o.z), n: n, n0: o.n0, seed: IND_SEED_KINDS[0], dead: false });
            });
            ind.nodeMesh = indInst(new THREE.DodecahedronGeometry(0.7, 0), ind.nodes.length || 1); ind.nodeDirty = true; wdMakeMeshes();
            ind.fireMesh = indInst(new THREE.ConeGeometry(0.45, 0.9, 7), 30); ind.fireDirty = true;
            ind.wild = []; ind.animalMesh = indInst(new THREE.BoxGeometry(1, 1, 1), 120); ind.exits = [];
            let f = S.site ? { x: S.site.x, z: S.site.z } : MG.flats[2] || MG.flats[0];
            ind.p.x = f.x; ind.p.z = f.z; ind.p.y = indHeight(M, f.x, f.z); ind.p.vy = 0;
            ind.mnSeen = new Uint8Array(MN_SEEN_N * MN_SEEN_N); ind.mnAt = null; ind.mnOnPad = false; mnLanding(MG);
            indSave(); return true;
        }
        // ── 月球地图（按 M，要带着地图物品）和着陆标记（任务 130）──
        // 走过的格子：6 米一格，100 × 100，半径 30 米；不存档，每次进月球重新走（地球的图也不存档）。
        const MN_SEEN_N = 100, MN_SEEN_CELL = 6;
        function mnMark(r) {
            let ci = Math.floor((ind.p.x + 300) / MN_SEEN_CELL), cj = Math.floor((ind.p.z + 300) / MN_SEEN_CELL), n = Math.ceil(r / MN_SEEN_CELL);
            for (let di = -n; di <= n; di++) for (let dj = -n; dj <= n; dj++) { let i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= MN_SEEN_N || j >= MN_SEEN_N || Math.hypot(di, dj) * MN_SEEN_CELL > r) continue; ind.mnSeen[j * MN_SEEN_N + i] = 1; }
        }
        function mnSeenAt(x, z) { let i = Math.floor((x + 300) / MN_SEEN_CELL), j = Math.floor((z + 300) / MN_SEEN_CELL); return i >= 0 && j >= 0 && i < MN_SEEN_N && j < MN_SEEN_N && !!ind.mnSeen[j * MN_SEEN_N + i]; }
        function mnTripTick() {
            if (!ind.mnSeen) ind.mnSeen = new Uint8Array(MN_SEEN_N * MN_SEEN_N);
            if (!ind.mnAt || Math.hypot(ind.p.x - ind.mnAt.x, ind.p.z - ind.mnAt.z) >= 3) { ind.mnAt = { x: ind.p.x, z: ind.p.z }; mnMark(30); }
            let S = ind.base && ind.base.moon;
            if (S && S.site) { let d = Math.max(Math.abs(ind.p.x - S.site.x), Math.abs(ind.p.z - S.site.z)); if (d < 6 && !ind.mnOnPad) { ind.mnOnPad = true; indFlash('这里是你的基地，月球基地以后做'); } else if (d > 12) ind.mnOnPad = false; }
        }
        function mnMapDraw() {
            let cv = document.getElementById('ind-map'); if (!cv || !ind.mnSeen) return;
            let g = cv.getContext('2d'), px = cv.width / 600, MG = ind.map.moon, col = { moon_mare: '#3a3f44', moon_mid: '#7d8185', moon_high: '#b0b4b8', moon_pole: '#cfd8dc' };
            g.fillStyle = '#9e9e9e'; g.fillRect(0, 0, cv.width, cv.height);
            for (let j = 0; j < MN_SEEN_N; j++) for (let i = 0; i < MN_SEEN_N; i++) {
                if (!ind.mnSeen[j * MN_SEEN_N + i]) continue;
                g.fillStyle = col[moonBiome(MG, -300 + (i + 0.5) * MN_SEEN_CELL, -300 + (j + 0.5) * MN_SEEN_CELL)]; g.fillRect(i * MN_SEEN_CELL * px, j * MN_SEEN_CELL * px, MN_SEEN_CELL * px + 0.6, MN_SEEN_CELL * px + 0.6);
            }
            let X = function (v) { return (v + 300) * px; };
            g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.6)'; MG.craters.forEach(function (c) { if (c.r >= 24 && mnSeenAt(c.x, c.z)) { g.beginPath(); g.arc(X(c.x), X(c.z), c.r * px, 0, 7); g.stroke(); } });   // 已经发现的大撞击坑
            g.strokeStyle = '#1e88e5'; g.fillStyle = '#e3f2fd'; MG.pits.forEach(function (p) { if (mnSeenAt(p.x, p.z)) { g.beginPath(); g.arc(X(p.x), X(p.z), Math.max(2, p.r * px), 0, 7); g.fill(); g.stroke(); } });   // 极区水冰坑
            let S = ind.base.moon || { dug: [] }, byId = {}; MG.res.forEach(function (o) { byId[o.id] = o; });
            (S.dug || []).forEach(function (e) { let o = byId[e[0]]; if (!o) return; g.fillStyle = o.key === 'ice' ? '#81d4fa' : '#' + ('000000' + ((IND_ITEMS_RAW[o.key] || { col: 0xffca28 }).col).toString(16)).slice(-6); g.beginPath(); g.arc(X(o.x), X(o.z), 2.5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 0.8; g.stroke(); });   // 挖过的资源点
            if (S.site) { let sx = X(S.site.x), sz = X(S.site.z); g.fillStyle = '#ff7043'; g.fillRect(sx - 30 * px, sz - 22.5 * px, 60 * px, 45 * px); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(sx - 30 * px, sz - 22.5 * px, 60 * px, 45 * px); g.fillStyle = '#fff'; g.fillRect(sx - 4, sz - 2, 8, 6); g.beginPath(); g.moveTo(sx - 6, sz - 2); g.lineTo(sx, sz - 8); g.lineTo(sx + 6, sz - 2); g.fill(); }   // 基地落点：小房子图标
            let f = indFace(); g.fillStyle = '#e53935'; g.beginPath(); g.arc(X(ind.p.x), X(ind.p.z), 4, 0, 7); g.fill(); g.strokeStyle = '#e53935'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(ind.p.x), X(ind.p.z)); g.lineTo(X(ind.p.x) + f.x * 10, X(ind.p.z) + f.z * 10); g.stroke();
        }
        // 着陆标记：落点中心一个平台 + 旗杆 + 小房子（方块拼），200 米内看得见；站上去写"这里是你的基地"（月球基地 M3 做出来以后换成真基地）
        function mnLanding(MG) {
            let S = ind.base && ind.base.moon; if (!S || !S.site) return;
            let x = S.site.x, z = S.site.z, y = indHeight(ind.map, x, z);
            indBox(14, 0.4, 14, 0x90a4ae, x, y + 0.2, z); indBox(2.4, 7, 0.4, 0xeceff1, x - 4, y + 3.9, z - 4); indBox(2.2, 1.4, 0.15, 0xe53935, x - 3, y + 6.9, z - 4);
            indBox(4.4, 2.6, 4.4, 0xcfd8dc, x + 3, y + 1.7, z + 2); indBox(4.8, 0.5, 4.8, 0x78909c, x + 3, y + 3.25, z + 2); indBox(1, 1.6, 0.2, 0x37474f, x + 3, y + 1.2, z + 4.25);
        }
        function indMoonLeave() { if (!ind || !ind.map || !ind.map.moon) return false; indGoBase(null); return true; }
        // 挖到露头：把剩余份数记进存档（只记动过的）
        (function () {
            let g0 = indGather;
            indGather = function (o) {
                let n0 = o && o.n, r = g0.apply(this, arguments);
                if (o && o.moonId !== undefined && (o.n !== n0 || o.dead) && ind.base) {
                    let S = mnState(), left = o.dead ? 0 : o.n, e = S.dug.filter(function (q) { return q[0] === o.moonId; })[0];
                    if (e) e[1] = left; else S.dug.push([o.moonId, left]);
                }
                return r;
            };
        })();
        // 挖地：月壤，每 1 米的格子 30 份，挖完那格就光了
        function mnCell(x, z) { return (Math.floor(x) + 300) * 600 + (Math.floor(z) + 300); }
        function mnCellLeft(S, c) { let e = S.cells.filter(function (q) { return q[0] === c; })[0]; return e ? e[1] : MN.cellN; }
        function moonDig() {
            let f = indFace(), x = ind.p.x + f.x * 1.8, z = ind.p.z + f.z * 1.8;
            if (Math.abs(x) >= 300 || Math.abs(z) >= 300) return false;
            let S = mnState(), c = mnCell(x, z);
            if (mnCellLeft(S, c) <= 0) { indFlash('这格挖光了'); return false; }
            let tk = tlDigTool(false);
            return wdChStart({ kind: 'dig', need: tk.need, label: '挖月壤', done: function () {
                tlUse(tk.k);
                if (mnCellLeft(S, c) <= 0) return;
                if (indBagAdd('regolith', 1) <= 0) { indFlash('背包满了'); return; }
                let e = S.cells.filter(function (q) { return q[0] === c; })[0]; if (e) e[1]--; else S.cells.push([c, MN.cellN - 1]);
                wdPit(x, z, indHeight(ind.map, x, z), false);
            } });
        }
        // ── 数量按 3 倍定：把整棵科技树做完所需的各种原料（IND_CRAFT 和 IND_RECIPES 里每件东西各做一次，加一艘返程火箭的燃料）──
        // 算法：每个东西取第一条能做它的配方（硬核的、没标 off／fix 的），一路拆到原料（没有配方的东西）；每条配方各做一次，把输入拆成原料加总；环（A 要 B、B 要 A）当原料。
        const MN_FUEL_WATER = 400;   // 返程火箭燃料折合水冰的份数。火箭还没做完，这是保守估计（比 docs/rocket.md 里估的燃料量大），火箭做出来后按真数重算
        function moonNeed() {
            let prod = {}, raw = {};
            let reg = function (out, n, r) { if (!prod[out]) prod[out] = { n: n, in: r.in }; };
            IND_CRAFT.forEach(function (r) { if (r.off || r.fix || r.poison || r.casual) return; if (typeof r.out === 'string') reg(r.out, r.n || 1, r); });
            IND_RECIPES.forEach(function (r) { if (r.casual) return; Object.keys(r.out).forEach(function (k) { reg(k, r.out[k], r); }); });
            let memo = {}, stack = {};
            let cost = function (k) {
                if (memo[k]) return memo[k];
                if (stack[k] || !prod[k]) { let o = {}; o[k] = 1; return o; }
                stack[k] = 1; let P = prod[k], c = {};
                Object.keys(P.in).forEach(function (i) { let s = cost(i); Object.keys(s).forEach(function (q) { c[q] = (c[q] || 0) + s[q] * P.in[i] / P.n; }); });
                stack[k] = 0; memo[k] = c; return c;
            };
            let each = function (r) { Object.keys(r.in).forEach(function (i) { let s = cost(i); Object.keys(s).forEach(function (q) { raw[q] = (raw[q] || 0) + s[q] * r.in[i]; }); }); };
            IND_CRAFT.forEach(function (r) { if (!r.off && !r.fix && !r.poison && !r.casual) each(r); });
            IND_RECIPES.forEach(function (r) { if (!r.casual) each(r); });
            // 月球的矿能顶替地球的哪种原料：钛铁矿、陨石铁镍块 → 铁（锭、钢、零件、铁矿都算铁，零件各按 2 份；再加 10% 余量，火箭的钢还没算）；斜长岩 → 铝；陨硫铁 → 硫；水冰 → 水（再加返程火箭的燃料）；橄榄石、KREEP 岩现在没有配方用（用处在后面的期），按 100 份的底线
            let parts = 0; Object.keys(raw).forEach(function (k) { if (/^part_.*_(ingot_fe|steel)$/.test(k)) parts += raw[k]; });
            let N = { iron: Math.ceil(((raw.ore_fe || 0) + (raw.ingot_fe || 0) + (raw.steel || 0) + parts * 2) * 1.1), aluminium: Math.ceil((raw.ingot_al || 0) + (raw.ore_al || 0)), sulfur: Math.max(100, Math.ceil(raw.sulfur || 0)), ice: Math.ceil((raw.water_raw || 0) + (raw.ice || 0) + (raw.water_sea || 0) + MN_FUEL_WATER), olivine: 100, kreep: 100 };
            return { raw: raw, need: N };
        }
        // 地图上每种矿的总量，和它顶替的原料所需：[供应, 所需]，供应要 ≥ 3 倍所需
        function moonCover() {
            let S = {}; moonRes(moonGen()).forEach(function (o) { S[o.key] = (S[o.key] || 0) + o.n0; });
            let N = moonNeed().need;
            return { iron: [(S.ilmenite || 0) + (S.meteor_fe || 0), N.iron], aluminium: [S.anorthosite || 0, N.aluminium], sulfur: [S.troilite || 0, N.sulfur], ice: [S.ice || 0, N.ice], olivine: [S.olivine || 0, N.olivine], kreep: [S.kreep || 0, N.kreep] };
        }
        function moonSupply() {
            let S = {}; moonRes(moonGen()).forEach(function (o) { S[o.key] = (S[o.key] || 0) + o.n0; });
            return S;
        }
