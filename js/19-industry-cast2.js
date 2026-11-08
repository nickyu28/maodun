// 猫盾工业：铸造的后半（docs/tools-trees.md 第 3 节）。放在 19-industry-ore.js 后面（配方表只能往后加）。
// 耐火砖模具：拿小刀右键，背包里有 2 耐火砖就能雕耐火砖的（雕法跟黏土一样）；生模具在炉子里 ≥1500°C 烧 60 秒（要鼓风或电炉）变熟模具；
//  熟模具放进耐火砖槽（铁、钢的熔点超过砖槽铁槽的耐温），什么金属都能铸，包括铁和钢。黏土模具浇铁钢照旧会裂。
// 铁、钢的零件（小刀刃、斧头、镐头、铲头、剪刀片）：熔池里化铁锭、钢锭，流进耐火砖模具；工作台 零件 + 木柄 → 铁／钢的工具（剪刀片 + 草绳）。
// 原来工作台直接用锭做铁、钢工具的配方留着下标，标 off 不显示（跟青铜的一样）。旧存档里已经有的铁钢工具照旧能用。
        CT_PART_METAL.ingot_fe = 1; CT_PART_METAL.steel = 1;
        (function () {
            let TIER = { ingot_fe: 'iron', steel: 'steel' }, add = {};
            IND_CRAFT.forEach(function (r) { if (r.hard && !r.fix && !r.poison && /^(knife|axe|pick|shovel|shears)_(iron|steel)$/.test(r.out) && (r.in.ingot_fe || r.in.steel)) r.off = true; });
            Object.keys(CT_SHAPE).forEach(function (s) {
                let S = CT_SHAPE[s];
                IND_RECIPES.push({ in: { ['mold_' + s + '_f_raw']: 1 }, out: { ['mold_' + s + '_f']: 1 }, cls: 'smelt', minT: 1500, time: 60, hard: true });
                Object.keys(TIER).forEach(function (m) {
                    let k = 'part_' + s + '_' + m;
                    add[k] = { name: CT_METAL[m].n + S.n, col: m === 'steel' ? 0x90a4ae : 0x757575, use: '工作台装成' + CT_METAL[m].n + '的工具' };
                    IND_CRAFT.push({ out: S.tool + TIER[m], in: s === 'shears' ? { [k]: 1, rope: 1 } : { [k]: 1, handle: 1 }, hard: true });
                });
            });
            Object.assign(IND_ITEMS_RAW, add);
        })();
        // 任务 80：冰淇淋（牛奶桶 + 糖 + 冰 2 + 盐，站着搅 20 秒）、冰棍（糖 + 开水桶 + 木头 + 冰 + 盐，10 秒），只有硬核（冰只有硬核有）；做完还空桶。配方表只能往后加，所以放在最后加载的文件里
        IND_CRAFT.push(
            { out: 'ice_cream', n: 2, in: { milk: 1, sugar: 1, ice: 2, salt: 1 }, back: { bucket: 1 }, time: 20, label: '搅冰淇淋', hard: true },
            { out: 'popsicle', n: 3, in: { sugar: 1, water_boiled: 1, wood: 1, ice: 1, salt: 1 }, back: { bucket: 1 }, time: 10, label: '做冰棍', hard: true }
        );
