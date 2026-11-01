// 猫盾工业：硬岩、火药爆破、天然气、锂锗镓（任务 37）。放在 19-industry-power.js 后面。
// 每张远征图随机撒 2～4 块硬岩（比铀矿少，位置跟地图种子走）。镐挖不动，得拿 2 份火药右键放下，3 秒引线炸开（半径 3 米，只炸这块岩），
// 炸出 3～6 个矿：锂辉石最多、锗矿其次、镓矿最少；15% 顺带炸出天然气喷口（约 2 分钟），拿空钢瓶右键装天然气。
// 天然气用途：①炉子燃料（一瓶 1500，在炉子面板里"当柴烧"，钢瓶还你；石油一桶 600）②做氢（天然气 + 水 + 3 瓶 → 3 瓶氢气）。喷口旁点着篝火会甲烷爆炸。
        Object.assign(IND_ITEMS_RAW, {
            rock_hard: { name: '硬岩', col: 0x37474f },
            vent_ng: { name: '天然气喷口', col: 0xeceff1 },
            gas_ng: { name: '天然气', col: 0xffe082, fuel: 1500, back: 'cyl', use: '灌满的钢瓶。①炉子燃料，一瓶烧 1500（在炉子面板"当柴烧"，钢瓶还你）②做氢：天然气 + 水 + 3 个玻璃瓶 → 3 瓶氢气' },
            ore_li: { name: '锂辉石', col: 0xd1c4e9, use: '放进炉子炼锂；锂做锂电池、锂玻璃（沙子烧玻璃板助熔）' },
            ore_ge: { name: '锗矿', col: 0x90a4ae, use: '放进炉子炼锗；锗是半导体，做时间加速器、以后的芯片' },
            ore_ga: { name: '镓矿', col: 0xb0bec5, use: '放进炉子炼镓；镓是半导体，以后做芯片' },
            hot_li: { name: '锂锭（烫）', col: 0xff8a65, hot: 'ingot_li', needTool: 'tongs' },
            hot_ge: { name: '锗锭（烫）', col: 0xff7043, hot: 'ingot_ge', needTool: 'tongs' },
            hot_ga: { name: '镓锭（烫）', col: 0xff8a65, hot: 'ingot_ga', needTool: 'tongs' },
            ingot_li: { name: '锂锭', col: 0xe1bee7, use: '做锂电池（3 V、720 U）、锂玻璃（2 沙 + 1 锂 → 2 玻璃板）' },
            ingot_ge: { name: '锗锭', col: 0x78909c, use: '半导体：做时间加速器，以后做芯片' },
            ingot_ga: { name: '镓锭', col: 0x90a4ae, use: '半导体：以后做芯片（电路第 1 期）' }
        });
        IND_ELEM_OF.ore_li = 3; IND_ELEM_OF.ore_ge = 32; IND_ELEM_OF.ore_ga = 31; IND_ELEM_OF.gas_ng = 6;
        Object.assign(IND_NODES, { rock_hard: { give: [0, 0], tool: 99, name: '硬岩' }, vent_ng: { give: [1, 1], tool: 0, name: '天然气喷口' } });
        CK_MELT.hot_li = 180; CK_MELT.hot_ge = 940; CK_MELT.hot_ga = 30;
        IND_RECIPES.push(
            { in: { ore_li: 1 }, out: { hot_li: 1 }, cls: 'smelt', minT: 180, time: 15, hard: true },
            { in: { ore_ge: 1 }, out: { hot_ge: 1 }, cls: 'smelt', minT: 940, time: 20, hard: true },
            { in: { ore_ga: 1 }, out: { hot_ga: 1 }, cls: 'smelt', minT: 100, time: 15, hard: true },
            { in: { gas_ng: 1, water_raw: 1, bottle: 3 }, out: { b_h2: 3, cyl: 1, bucket: 1 }, cls: 'chem', pri: true, minT: 700, time: 20, hard: true },
            { in: { sand: 2, ingot_li: 1 }, out: { glass_plate: 2 }, cls: 'bulk', minT: 900, time: 20, hard: true }
        );
        const RK = { blast: 3, fuse: 3, near: 4, powder: 2, ventChance: 0.15, ventT: 120, ventFireR: 4, ventBoomR: 8 };
        // 生成：每张远征图 2～4 块硬岩，位置按地图种子（indGoTrip 里 wdExtraNodes 后面调用）
        function rkGen(M) {
            let r = indRng((M.seed ^ 0x5bd1e995) >>> 0), want = 2 + Math.floor(r() * 3), got = 0;
            for (let t = 0; t < 200 && got < want; t++) {
                let x = (r() * 2 - 1) * (IND_MAP - 8), z = (r() * 2 - 1) * (IND_MAP - 8), h = indHeight(M, x, z);
                if (h < 0.3 || Math.hypot(x, z) < 25) continue;
                ind.nodes.push({ key: 'rock_hard', rock: true, hard: true, x: x, z: z, y: h, n: 1, seed: IND_SEED_KINDS[0], dead: false }); got++;
            }
        }
        // 右键拿火药对着硬岩：放 2 份，3 秒引线
        function rkFuse(o) {
            if ((ind.bag.gunpowder || 0) < RK.powder) { indFlash('硬岩要 ' + RK.powder + ' 份火药才炸得开'); return false; }
            if ((ind.fuses || []).some(function (f) { return f.o === o; })) { indFlash('引线已经点着了，退远点'); return false; }
            indBagDel('gunpowder', RK.powder); (ind.fuses = ind.fuses || []).push({ o: o, t: RK.fuse });
            indFlash('点着了，退远点！' + RK.fuse + ' 秒后炸'); return true;
        }
        function rkBlast(f) {
            let o = f.o; if (o.dead) return;
            o.dead = true; ind.nodeDirty = true;
            if (Math.hypot(ind.p.x - o.x, ind.p.z - o.z) <= RK.near && ind.where === 'trip') indHurt(35, 'boom', '硬岩爆破，离太近了', true);
            let n = 3 + Math.floor(indRand() * 4), W = [['ore_li', 5], ['ore_ge', 3], ['ore_ga', 1]], tot = 9, G = ind.tripGround = ind.tripGround || [];
            for (let i = 0; i < n; i++) {
                let p = indRand() * tot, k = 'ore_li'; for (let j = 0; j < W.length; j++) { p -= W[j][1]; if (p <= 0) { k = W[j][0]; break; } }
                let a = i * 2.399, d = 1 + 0.5 * i * 0.4;
                G.push({ k: k, x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d });
            }
            nkTripItemsSync();
            let vent = indRand() < RK.ventChance;
            if (vent) ind.nodes.push({ key: 'vent_ng', x: o.x, z: o.z, y: o.y, n: 1, seed: IND_SEED_KINDS[0], dead: false, until: ind.t + RK.ventT });
            indFlash('炸开了，掉出 ' + n + ' 个矿' + (vent ? '。冒出天然气了：拿空钢瓶右键装，别点火' : ''));
            if (typeof wdNodeGone === 'function') wdNodeGone(o);
        }
        // 拿空钢瓶右键天然气喷口：装一瓶
        function rkFillVent(o) {
            if (!(ind.bag.cyl > 0)) return false;
            indBagDel('cyl', 1); indBagAdd('gas_ng', 1); indFlash('装了一瓶天然气（喷口还在冒，别点火）'); return true;
        }
        // 每帧（远征里）：引线倒数、喷口枯竭、喷口旁有火就爆炸
        function rkTick(dt) {
            if (ind.where !== 'trip') { ind.fuses = null; return; }
            if (ind.fuses) { ind.fuses.forEach(function (f) { f.t -= dt; }); let ready = ind.fuses.filter(function (f) { return f.t <= 0; }); ind.fuses = ind.fuses.filter(function (f) { return f.t > 0; }); ready.forEach(rkBlast); }
            ind.nodes.forEach(function (o) {
                if (o.key !== 'vent_ng' || o.dead) return;
                if (ind.t > o.until) { o.dead = true; ind.nodeDirty = true; return; }
                let fire = (ind.tripFires || []).some(function (f) { return Math.hypot(f.x - o.x, f.z - o.z) <= RK.ventFireR; });
                if (fire) {
                    o.dead = true; ind.nodeDirty = true; ind.tripFires = (ind.tripFires || []).filter(function (f) { return Math.hypot(f.x - o.x, f.z - o.z) > RK.ventFireR; }); ind.fireDirty = true;
                    if (Math.hypot(ind.p.x - o.x, ind.p.z - o.z) <= RK.ventBoomR) indHurt(60, 'boom', '天然气喷口旁点火，甲烷爆炸了', true);
                    indFlash('甲烷爆炸了！');
                }
            });
        }
