// 猫盾工业：矿石分布、裂纹岩、TNT（任务 75）。放在 19-industry-outdoor.js 后面。只有硬核有。
// 矿石（铜锌锡铁铀萤石铅铝镍）约 30% 在地面露头，其余在矿洞里和裂纹岩里：地面的露头只留 30%（按位置算，不吃随机数）；
//  矿洞每次进去撒 3～8 个矿点（按洞的地貌配）；山地、古老岩层 2～4 个洞口，平原森林沙漠偶尔多 1 个；
//  裂纹岩每张图 3～6 块（地面上带裂纹的大石头，挖不动，只有 TNT 炸得开，掉 3～6 个矿，所有种类，包括锂锗镓），火药炸不动。
// TNT：石油 1 + 硝酸瓶 2 + 硫酸瓶 1 → 3 个，大窑 80°C（石油用桶装的那个，桶还你）。右键放下，4 秒引线，半径 4 米，能炸任何东西：硬岩（掉锂锗镓）、裂纹岩（掉矿）、
//  树（木头 ×2）、设备（基地里用爆炸那套：设备毁掉里面的东西掉地上）、怪（5 点）、玩家（5 米内 −50，放下时说"退远点"）；基地里空地上炸出一格水池。
        const OR = { surf: 0.5, caveN: [2, 4], crackN: [3, 6], crackOre: [3, 6], fuse: 4, R: 4, hurtR: 5, dmg: 50, plainCave: 0.4 };
        const OR_ORE = { ore_cu: 1, ore_zn: 1, ore_sn: 1, ore_fe: 1, ore_u: 1, fluorite: 1, ore_pb: 1, ore_al: 1, ore_ni: 1 };
        const OR_ALL = Object.keys(OR_ORE).concat(['ore_li', 'ore_ge', 'ore_ga']);
        const OR_CAVE = { mountain: { ore_cu: 3, ore_zn: 2, ore_sn: 3, ore_fe: 2, ore_pb: 1, fluorite: 1, ore_al: 1, ore_ni: 1 }, ancient: { ore_u: 2, ore_fe: 2, fluorite: 2, ore_pb: 1, ore_ni: 1, ore_al: 1, ore_cu: 1 }, other: { ore_cu: 1, ore_fe: 1, ore_sn: 1 } };
        IND_NODES.rock_crack = { give: [0, 0], tool: 99, name: '裂纹岩' };
        Object.assign(IND_ITEMS_RAW, { rock_crack: { name: '裂纹岩', col: 0x8d6e63, later: '地图上的大石头，不是物品', use: '地图上带裂纹的大石头，镐挖不动，用 TNT 炸开掉 3～6 个矿' }, tnt: { name: 'TNT', col: 0xd32f2f, use: '右键放下，4 秒后炸，半径 4 米：炸硬岩、裂纹岩出矿，炸树出木头，炸设备，基地空地上炸出一格水池。退远点' } });
        IND_RECIPES.push({ in: { oil: 1, b_hno3: 2, b_h2so4: 1 }, out: { tnt: 3, bucket: 1, bottle: 3 }, cls: 'chem', pri: true, minT: 80, time: 30, hard: true });
        // 地面的矿露头只留 30%
        function orKeep(key, x, z, casual) { return casual || !OR_ORE[key] || indHash(Math.floor(x), Math.floor(z), 7777) < OR.surf; }
        // 裂纹岩：每张图 3～6 块，位置按地图种子
        function orCrackGen(M) {
            let r = indRng((M.seed ^ 0x3b9aca07) >>> 0), want = IND_K * (OR.crackN[0] + Math.floor(r() * (OR.crackN[1] - OR.crackN[0] + 1))), got = 0;
            for (let t = 0; t < 300 * IND_K && got < want; t++) {
                let x = (r() * 2 - 1) * (IND_MAP - 8), z = (r() * 2 - 1) * (IND_MAP - 8), h = indHeight(M, x, z);
                if (h < 0.3 || Math.hypot(x, z) < 25) continue;
                ind.nodes.push({ key: 'rock_crack', rock: true, crack: true, x: x, z: z, y: h, n: 1, seed: IND_SEED_KINDS[0], dead: false }); got++;
            }
        }
        // 洞里每次进去撒矿点
        function orCaveOre(c) {
            let W = OR_CAVE[c.bm] || OR_CAVE.other, ks = Object.keys(W), tot = ks.reduce(function (t, k) { return t + W[k]; }, 0), n = OR.caveN[0] + Math.floor(indRand() * (OR.caveN[1] - OR.caveN[0] + 1));
            for (let i = 0; i < n; i++) {
                let p = indRand() * tot, key = ks[0]; for (let j = 0; j < ks.length; j++) { p -= W[ks[j]]; if (p <= 0) { key = ks[j]; break; } }
                let m = 10 + Math.floor(indRand() * 21), d = 12 + indRand() * (CV.len - 20);
                ind.nodes.push({ key: key, cave: c.i, out: true, x: c.cx + d, z: c.cz + (indRand() * 2 - 1) * (CV.w - 3), y: CV.floor, n: m, n0: m, seed: IND_SEED_KINDS[0], dead: false });
            }
        }
        // 平原、森林、沙漠偶尔多一个洞口（cvGen 里调，用同一个随机数）
        function orExtraCave(M, r) {
            if (r() >= OR.plainCave) return;
            for (let t = 0; t < 800; t++) {
                let x = (r() * 2 - 1) * (IND_MAP - 20), z = (r() * 2 - 1) * (IND_MAP - 20), bm = indBiome(M, x, z);
                if (bm !== 'plain' && bm !== 'forest' && bm !== 'desert') continue;
                if (indHeight(M, x, z) < 0.3 || Math.hypot(x, z) < 30 || ind.caves.some(function (c) { return Math.hypot(c.x - x, c.z - z) < 60; })) continue;
                let i = ind.caves.length;
                ind.caves.push({ i: i, x: x, z: z, y: indHeight(M, x, z), bm: bm, cx: CV.x0, cz: (i - 2) * CV.gapZ, built: false, gas: false }); return;
            }
        }
        // ── TNT ──
        function orTntPlace() {
            if (!indHard()) return false;
            let f = indFace(); (ind.tnts = ind.tnts || []).push({ x: ind.p.x + f.x * 1.5, z: ind.p.z + f.z * 1.5, t: OR.fuse, w: ind.where });
            indBagDel('tnt', 1); indFlash('退远点'); return true;
        }
        function orTntTick(dt) {
            if (!ind.tnts || !ind.tnts.length) return;
            let go = [];
            ind.tnts = ind.tnts.filter(function (f) { if (f.w !== ind.where) return false; f.t -= dt; if (f.t <= 0) { go.push(f); return false; } return true; });
            go.forEach(orBlast);
        }
        function orKillAnimals(x, z, R) { indAnimals().filter(function (a) { return Math.hypot(a.x - x, a.z - z) <= R; }).forEach(function (a) { fmKill(a); }); }
        function orBlast(f) {
            let R = OR.R, x = f.x, z = f.z, trip = ind.where === 'trip', G = ind.tripGround = ind.tripGround || [];
            if (Math.hypot(ind.p.x - x, ind.p.z - z) <= OR.hurtR && !ind.dead) indHurt(OR.dmg, 'boom', 'TNT 炸到了', true);
            if (trip) {
                ind.tntBlast = true;
                ind.nodes.slice().forEach(function (o) {
                    if (o.dead || Math.hypot(o.x - x, o.z - z) > R) return;
                    if (o.hard) { rkBlast({ o: o }); return; }
                    if (o.crack) {
                        o.dead = true; ind.nodeDirty = true; let n = OR.crackOre[0] + Math.floor(indRand() * (OR.crackOre[1] - OR.crackOre[0] + 1));
                        for (let i = 0; i < n; i++) { let a = i * 2.399, d = 1 + 0.4 * i; G.push({ k: OR_ALL[Math.floor(indRand() * OR_ALL.length)], x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d }); }
                    } else if (o.tree) {
                        o.dead = true; ind.nodeDirty = true; if (typeof wdNodeGone === 'function') wdNodeGone(o);
                        for (let i = 0; i < Math.min(12, o.n * 2); i++) G.push({ k: 'wood', x: o.x + (indRand() - 0.5) * 1.5, z: o.z + (indRand() - 0.5) * 1.5 });
                    }
                });
                ind.tntBlast = false;
                (ind.mobs || []).forEach(function (m) { if (!m.dead && Math.hypot(m.x - x, m.z - z) <= R) mbDamage(m, 5); });
                orKillAnimals(x, z, R);   // 野生动物炸死，掉的跟打死的一样
                (ind.tdevs || []).slice().forEach(function (t) { if (Math.hypot(t.x - x, t.z - z) <= R) { odPickUp(t, true); } });   // 炸毁：设备没了，里面的东西掉地上，设备块解除（任务 75）
                if (typeof nkTripItemsSync === 'function') nkTripItemsSync();
                indBoomFx(x, z);
            } else {
                indBoom(x, z, R, 'TNT 炸了');   // 基地里：设备、炉子、作物都炸掉，里面的东西掉地上
                orKillAnimals(x, z, R);   // 基地里的动物也炸死（在爆炸清地面之后，掉的东西才留得住）
                let i = Math.round(x), j = Math.round(z);
                if (ind.where === 'base' && !pdCellAt(i, j) && pdCells().length < PD.max && i > IND_BASE.x0 + 1 && i < IND_BASE.x1 - 1 && j > IND_BASE.z0 + 1 && j < IND_BASE.z1 - 1 && indSpotFree(i, j, 0.5)) { pdCells().push({ i: i, j: j, w: 0 }); pdLevel(pdGroup(pdCellAt(i, j))); ind.pdDirty = true; }
            }
            ind.itemDirty = true;
        }
        // 任务 77：硬核石稿从零做（跟石斧一个价）：尖石片 2 + 木头 1 + 草绳 2；配方表只能往后加，所以放在这个最后加载的文件里
        IND_CRAFT.push({ out: 'pick_stone', in: { sharp_flint: 2, wood: 1, rope: 2 }, hard: true });
