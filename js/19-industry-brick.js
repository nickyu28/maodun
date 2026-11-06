// 猫盾工业：耐火黏土、耐火砖、耐火砖槽（docs/tools-trees.md 第 2 节）。放在 19-industry-fish.js 后面。只有硬核有。
// 耐火黏土：古老岩层（权重 1）和山地河边有，一次给 2～4，空手能挖；比普通黏土少得多。
// 耐火砖：灶台／小熔炉／大窑里 2 耐火黏土 → 1 耐火砖，要 1500°C 以上 40 秒（1500°C 只有鼓风 1600 或电炉到得了；小熔炉最高 1300 烧不了）。
// 耐火砖槽（耐火砖 4）：耐 1700°C，锭 90 秒凉，铁、钢的烫锭也接得住（砖槽 1200、铁槽 1400 接不住），装了的炉子炼出来的烫铁锭、烫钢锭进槽。
// 没做：耐火砖模具、铁钢工具改成铸造（铸造那条的后半）。
        Object.assign(IND_ITEMS_RAW, {
            clay_fire: { name: '耐火黏土', col: 0xd7ccc8, use: '2 份放进炉子 1500°C 以上烧 40 秒成耐火砖（要鼓风或电炉）' },
            brick_fire: { name: '耐火砖', col: 0xffccbc, use: '4 块做耐火砖槽，耐 1700°C，接得住烫铁烫钢' },
            spout_fire: { name: '耐火砖槽', col: 0xff8a65, attach: 'spout', spoutTy: 'fire', use: '装在炉子旁，什么锭都接（包括铁和钢），耐 1700°C，锭 90 秒凉' }
        });
        IND_NODES.clay_fire = { give: [2, 4], tool: 0, name: '耐火黏土' };
        IND_BIOMES.ancient.res.clay_fire = 1;
        CK_SPOUT.fire = { name: '耐火砖槽', cool: 90, maxT: 1700 };
        IND_CRAFT.push({ out: 'spout_fire', in: { brick_fire: 4 }, hard: true });
        // 配方下标存在炉子里，新的只能加在整张表最后（这个文件是目前最后一个有配方的）
        IND_RECIPES.push({ in: { clay_fire: 2 }, out: { brick_fire: 1 }, cls: 'bulk', minT: 1500, time: 40, hard: true });
