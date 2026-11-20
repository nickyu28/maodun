// 猫盾工业：火箭部件（任务 R4，火箭第 4 期）。放在 19-industry-armor.js 后面。只有硬核。
// 金红石（山地露头、山地河边的金红石砂）→ 大窑里加氯气和木炭烧成四氯化钛 → 加钠还原成钛锭（副产盐）。钛是可选的：用钛的发动机轻，不用钛的钢铝发动机重一点。
// 部件：电机（已有）、煤油发动机（钛版和钢铝版）、真空煤油发动机、氢氧发动机、燃料罐、舱体、整流罩。部件是发射台装配的原料（R5），每样还有别的用处：
// 燃料罐拆给冷罐、舱体当小屋、整流罩当池塘盖、钢铝发动机装在车上、钛做钛甲。
        const RK4 = { motorMass: 1 };
        Object.assign(IND_ITEMS_RAW, {
            rutile: { name: '金红石', col: 0xa1523f, use: '钛的矿，放进大窑加氯气和木炭烧成四氯化钛' },
            b_ticl4: { name: '四氯化钛瓶', col: 0xeceff1, use: '加钠一起烧，还原出钛锭' },
            ingot_ti: { name: '钛锭', col: 0xa7b4c2, use: '做钛的发动机，也做钛甲，比铁轻比钢硬' },
            eng_kero: { name: '煤油发动机', col: 0x90a4ae, use: '火箭一级用，推力大，钛的轻', rkt: { isp: 300, thrust: 800, mass: 2.5 } },
            eng_kero_s: { name: '钢铝煤油发动机', col: 0x78909c, use: '不用钛的煤油发动机，重 30%；也能装在车上', rkt: { isp: 300, thrust: 800, mass: 3.25 } },
            eng_vac: { name: '真空煤油发动机', col: 0x8d6e63, use: '火箭二级用，没有液氢时烧煤油，比冲高一点', rkt: { isp: 340, thrust: 300, mass: 3.0 } },
            eng_h2: { name: '氢氧发动机', col: 0xf8bbd0, use: '火箭二级用，烧液氢，比冲最高，推力小', rkt: { isp: 450, thrust: 250, mass: 2.2 } },
            tank_fuel: { name: '燃料罐', col: 0xb0bec5, use: '火箭的燃料罐，也能拆给冷罐用', rkt: { cap: 20, mass: 1.2 } },
            capsule: { name: '舱体', col: 0xe0e0e0, use: '火箭的舱体，载一个人，也能当小屋放下来', rkt: { seats: 1, mass: 1.8 } },
            fairing: { name: '整流罩', col: 0xcfd8dc, use: '火箭顶上的罩，也能拆成 2 个池塘盖', rkt: { mass: 0.8 } }
        });
        IND_ELEM_OF.ingot_ti = 22;
        // 矿：山地露头、山地河边的金红石砂（空手捡）
        Object.assign(IND_NODES, { rutile: { give: [1, 2], tool: 2 }, sand_ti: { give: [1, 1], tool: 0, out: 'rutile', name: '金红石砂' } });
        IND_NODE_COL.sand_ti = 0xa1523f; IND_OUTCROP.rutile = 1; IND_BIOMES.mountain.res.rutile = 2;
        // 大窑里：金红石 + 氯气 + 木炭 → 四氯化钛；四氯化钛 + 钠 → 钛锭 + 盐
        IND_RECIPES.push(
            { in: { rutile: 2, b_cl2: 2, charcoal: 1 }, out: { b_ticl4: 1, bottle: 1 }, cls: 'chem', pri: true, minT: 800, time: 30, hard: true },
            { in: { b_ticl4: 1, sodium: 4 }, out: { ingot_ti: 1, salt: 4, bottle: 1 }, cls: 'chem', pri: true, minT: 800, time: 40, hard: true }
        );
        // 部件（工作台）
        IND_CRAFT.push(
            { out: 'eng_kero', in: { steel: 5, ingot_ti: 3, ingot_cu: 8, motor: 2, brass: 2 }, need: 'hammer', hard: true },
            { out: 'eng_kero_s', in: { steel: 8, ingot_al: 6, ingot_cu: 8, motor: 2, brass: 2 }, need: 'hammer', hard: true },
            { out: 'eng_vac', in: { steel: 8, ingot_al: 6, ingot_cu: 10, motor: 2, brass: 3 }, need: 'hammer', hard: true },
            { out: 'eng_h2', in: { steel: 5, ingot_ti: 3, ingot_cu: 8, motor: 2, brass: 2, coil: 2 }, need: 'hammer', hard: true },
            { out: 'tank_fuel', in: { ingot_al: 5, plastic: 2 }, hard: true },
            { out: 'capsule', in: { ingot_al: 6, glass_plate: 4, plastic: 3 }, hard: true },
            { out: 'fairing', in: { ingot_al: 4, plastic: 3 }, hard: true },
            // 第二个用处：燃料罐拆成冷罐，舱体当小屋，整流罩拆成池塘盖，钢铝发动机装在车上
            { out: 'cold_tank', n: 2, in: { tank_fuel: 1, glass_plate: 1 }, hard: true },
            { out: 'house_hut', in: { capsule: 1, wood: 10 }, hard: true },
            { out: 'pond_lid', n: 2, in: { fairing: 1 }, hard: true },
            { out: 'veh_car', in: { steel: 8, wheel: 4, eng_kero_s: 1, seat: 1, chain: 2 }, hard: true }
        );
