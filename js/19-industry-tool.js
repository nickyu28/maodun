// 猫盾工业：工具分材质 + 磨损（docs/tools-trees.md 第 4 节、分步第 5 步；作者 11-05：没有铜档，铜锭只做线和零件）。放在 19-industry-mob.js 后面。
// 档：石 ×1、青铜 ×0.7、铁 ×0.6、钢 ×0.5（钻石 ×0.4，只有镐和刀有）。乘的是干活的时间：斧子砍树 1.5 秒 × 倍数、小刀砍树 5 秒 × 倍数、拔刺（斧 5／刀 10／剪 30 秒）× 倍数、剪羊毛 4 秒 × 倍数、铲子挖地 1 秒 × 倍数。
// 镐只加耐久，硬度（能挖哪级矿）和速度不改。
// 耐久（任务 87，11-08 调高）：石 40、青铜 300、铁 600、钢 1500、钻石 5000；刀照任务 70 的表。每用一次 −1（砍倒一棵树、挖一次地、采一次矿、拔一个刺、剪一次毛），用完变"断了的 X"：
// 修（胶水 + 同种材料，每修一次上限少 10%）、拆（按耐久还材料）、熔（硬核金属的）见 19-industry-repair.js。悠闲耐久 ×2。耐久记"正在用的那一把"（跟刀盾一样，同一种叠在一格）。旧存档的工具算满耐久。
// 新的：铲子（石／青铜／铁／钢）、青铜铁钢的斧子和剪刀。配方先用工作台"锭 2 + 木 1"（铸造那条还没做，做了再改成头 + 木柄）。
        const TL_TIER = { wood: { mul: 1.2, dura: 40, back: 'wood' }, stone: { mul: 1, dura: 120, back: 'stone' }, bronze: { mul: 0.7, dura: 450, back: 'bronze' }, iron: { mul: 0.6, dura: 900, back: 'ingot_fe' }, steel: { mul: 0.5, dura: 2250, back: 'steel' }, diamond: { mul: 0.4, dura: 7500, back: 'diamond' } };   // 任务 129（11-13）：石 120、青铜 450、铁 900、钢 2250、钻石 7500；刀盾不动
        // 任务 98：挖矿一次出 4 个，镐的一次耐久顶原来 4 次；为了不变成几乎不坏，青铜、铁、钢、钻石镐的耐久减半（150／300／750／2500，每把能挖的矿还是任务 87 时的 2 倍）。别的工具不变
        const TL_PICK_HALF = { bronze: 1, iron: 1, steel: 1, diamond: 1 };
        const TL_TOOL = {};   // key → { kind, tier, dura }（刀的耐久照 MB_KNIFE）
        const TL_KIND_NAME = { axe: '斧子', pick: '镐', shovel: '铲子', shears: '剪刀', knife: '小刀' };
        (function () {
            let reg = function (k, kind, tier) { TL_TOOL[k] = { kind: kind, tier: tier, dura: TL_TIER[tier].dura }; };
            reg('axe', 'axe', 'stone'); reg('shears', 'shears', 'stone'); reg('shovel_stone', 'shovel', 'stone');
            reg('pick_stone', 'pick', 'stone'); reg('pick_bronze', 'pick', 'bronze'); reg('pick_iron', 'pick', 'iron'); reg('pick_ni', 'pick', 'iron'); reg('pick_steel', 'pick', 'steel'); reg('pick_diamond', 'pick', 'diamond');
            let TN = { bronze: '青铜', iron: '铁', steel: '钢' }, MAT = { bronze: 'bronze', iron: 'ingot_fe', steel: 'steel' }, add = {};
            ['bronze', 'iron', 'steel'].forEach(function (t) {
                ['axe', 'shovel', 'shears'].forEach(function (kind) {
                    let k = kind + '_' + t; reg(k, kind, t);
                    add[k] = { name: TN[t] + (kind === 'axe' ? '斧' : kind === 'shovel' ? '铲' : '剪刀'), col: t === 'bronze' ? 0xb87333 : t === 'iron' ? 0x757575 : 0x90a4ae };
                    IND_CRAFT.push({ out: k, in: { [MAT[t]]: 2, wood: 1 }, hard: true });
                });
            });
            add.shovel_stone = { name: '石铲', col: 0x9e9e9e };
            IND_CRAFT.push({ out: 'shovel_stone', in: { stone: 2, wood: 1 }, casual: true }, { out: 'shovel_stone', in: { sharp_flint: 1, wood: 1, rope: 1 }, hard: true });
            Object.keys(MB_KNIFE).forEach(function (k) { TL_TOOL[k] = { kind: 'knife', tier: k === 'knife' ? 'stone' : k.slice(6), dura: MB_KNIFE[k].dura, knife: true }; });
            Object.keys(TL_TOOL).forEach(function (k) {
                let T = TL_TOOL[k]; if (T.knife) return;
                T.dura = TL_TIER[T.tier].dura; T.back = k === 'pick_ni' ? 'ingot_ni' : TL_TIER[T.tier].back;
                let hard = T.tier !== 'stone';
                add['broken_' + k] = { name: '坏了的' + ((add[k] || IND_ITEMS_RAW[k] || {}).name || k), col: 0x616161, use: '工作台：回收一半主料，或者加 1 胶水修好（耐久一半）' };
                IND_CRAFT.push(Object.assign({ out: T.back, n: 1, in: { ['broken_' + k]: 1 } }, hard ? { hard: true } : {}), Object.assign({ out: k, fix: true, in: { ['broken_' + k]: 1, glue: 1 } }, hard ? { hard: true } : {}));
            });
            Object.keys(add).forEach(function (k) { if (!/^broken_/.test(k)) { let T = TL_TOOL[k]; add[k].use = TL_KIND_NAME[T.kind] + '：干活时间 ×' + TL_TIER[T.tier].mul + '，耐久 ' + T.dura + (T.kind === 'shovel' ? '。挖泥土、沙子（对着地面左键）' : ''); } });
            Object.assign(IND_ITEMS_RAW, add);
        })();
        function tlKind(k) { return k && TL_TOOL[k] ? TL_TOOL[k].kind : null; }
        function tlMul(k) { return k && TL_TOOL[k] ? TL_TIER[TL_TOOL[k].tier].mul : 1; }
        function tlHas(kind) { return Object.keys(ind.bag).some(function (k) { return ind.bag[k] > 0 && tlKind(k) === kind; }); }
        // 背包里这一类最快的一把（同样快的挑耐久少的先用）
        function tlBest(kind) {
            let best = null; Object.keys(ind.bag).forEach(function (k) { if (!(ind.bag[k] > 0) || tlKind(k) !== kind) return; if (!best || tlMul(k) < tlMul(best)) best = k; });
            return best;
        }
        function tlBestPick() { let best = null; Object.keys(ind.bag).forEach(function (k) { if (!(ind.bag[k] > 0) || tlKind(k) !== 'pick') return; if (!best || IND_ITEMS[k].tool > IND_ITEMS[best].tool) best = k; }); return best; }
        function tlUse(k) { if (k && TL_TOOL[k] && ind.bag[k] > 0) mbWear(k); }
        // 砍树：背包里几样就用最快的（斧子 1.5 秒 × 倍数、木头 ×1.5；镐 3 秒；小刀 5 秒 × 倍数、木头 ×1.25；空手 8 秒）
        function tlChopTool() {
            let best = { need: 8, mult: 1, k: null }, ax = tlBest('axe'), kn = tlBest('knife'), pk = tlBestPick();
            let c = function (need, mult, k) { if (need < best.need) best = { need: need, mult: mult, k: k }; };
            if (ax) c(1.5 * tlMul(ax), 1.5, ax);
            if (pk && indTool() >= 1) c(3, 1, pk);
            if (kn) c(5 * tlMul(kn), 1.25, kn);
            return best;
        }
        function tlCanChop() { return tlHas('axe') || tlHas('knife') || indTool() >= 1; }
        // 拔刺：拿着的东西决定多久
        function tlPeelTime(k) { let kind = tlKind(k); if (kind === 'axe') return 5 * tlMul(k); if (kind === 'knife') return 10 * tlMul(k); if (kind === 'shears') return 30 * tlMul(k); return { tongs: 40, cactus: 60 }[k] || 0; }
        // 挖地：铲子 1 秒 × 倍数（泥土沙子），挖石头要镐（1 秒），空手 3 秒
        function tlDigTool(stone) {
            let sh = tlBest('shovel'), pk = tlBestPick();
            if (stone) return pk && indTool() >= 1 ? { need: 1, k: pk } : null;
            if (sh) return { need: tlMul(sh), k: sh };
            if (pk && indTool() >= 1) return { need: 1, k: pk };
            return { need: 3, k: null };
        }
        // 采矿（要镐的点）：采成一次镐耐久 −1
        (function () {
            let g0 = indGather;
            indGather = function (o) {
                let n0 = o && o.n, d0 = o && o.dead, nd = o && IND_NODES[o.key], pk = nd && nd.tool >= 1 && !o.tree ? tlBestPick() : null;
                let r = g0.apply(this, arguments);
                if (pk && (o.n !== n0 || o.dead !== d0)) tlUse(pk);
                return r;
            };
        })();
