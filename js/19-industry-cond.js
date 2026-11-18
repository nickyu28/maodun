// 猫盾工业：冷凝机、液氧液氮液氢、冷罐（任务 R3，火箭第 3 期）。放在 19-industry-frac.js 后面。只有硬核。
// 冷凝机通电（24 V，≥18 V），放进气瓶和空冷罐：2 氧气瓶 → 1 罐液氧；2 氮气瓶 → 1 罐液氮；4 氢气瓶 + 1 罐液氮 → 1 罐液氢，空瓶还你。
// 液氮：做冰块（配一桶生水），也是做液氢的原料。液氧：炼钢助燃更快，也是火箭氧化剂（R5）。液氢：火箭燃料（可选，作者没定），也能当炉子燃料 500。
        const CN = { time: 15, draw: 10, tankIn: { steel: 2, glass_plate: 1 }, fastSteel: 15, iceN: 4 };
        const CN_REC = [
            { id: 'lox', in: { b_o2: 2, cold_tank: 1 }, out: { tank_lox: 1, bottle: 2 } },
            { id: 'ln2', in: { b_n2: 2, cold_tank: 1 }, out: { tank_ln2: 1, bottle: 2 } },
            { id: 'lh2', in: { b_h2: 4, tank_ln2: 1 }, out: { tank_lh2: 1, cold_tank: 1, bottle: 4 } }
        ];
        Object.assign(IND_ITEMS_RAW, {
            dev_cond: { name: '冷凝机', col: 0x4fc3f7, dev: 'cond', use: '把气体压冷成液体，24 V' },
            cold_tank: { later: '冷凝机用的，体检看不到', name: '冷罐', col: 0x90a4ae, use: '装液态气体，用冷凝机灌' },
            tank_lox: { later: '冷凝机里出的，体检看不到', name: '液氧罐', col: 0x81d4fa, use: '炼钢助燃更快，也是火箭氧化剂' },
            tank_ln2: { later: '冷凝机里出的，体检看不到', name: '液氮罐', col: 0xb2ebf2, use: '配生水做冰，也是做液氢的原料' },
            tank_lh2: { later: '冷凝机里出的，体检看不到', name: '液氢罐', col: 0xf8bbd0, fuel: 500, use: '火箭燃料，也能当炉子燃料' }
        });
        IND_DEVS.cond = { name: '冷凝机', col: 0x4fc3f7, rated: 24, minV: 18, draw: CN.draw, size: [1.4, 1.8, 1.4] };
        // 现在能做哪一条：材料够就返回那一条
        function cnPick(d) { return CN_REC.filter(function (r) { return Object.keys(r.in).every(function (k) { return (d.st[k] || 0) >= r.in[k]; }); })[0] || null; }
        IND_DEV_BUSY.cond = function (d) { return !!cnPick(d); };
        IND_DEV_TICK.cond = function (d, dt) {
            let r = cnPick(d);
            if (!d.pw || !r) { if (!r) d.cn = 0; return; }
            d.cn = (d.cn || 0) + dt;
            while (d.cn >= CN.time && (r = cnPick(d))) {
                d.cn -= CN.time;
                Object.keys(r.in).forEach(function (k) { d.st[k] -= r.in[k]; if (d.st[k] <= 0) delete d.st[k]; });
                Object.keys(r.out).forEach(function (k) { d.st[k] = (d.st[k] || 0) + r.out[k]; });
                if (ind.panel === 'cond') ind.panelDirty = true;
            }
        };
        IND_DEV_HTML.cond = function (d) {
            let V = indDevVolt(d);
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">冷凝机</div><div style="line-height:1.7;">电压 <b>' + V.toFixed(1) + ' V</b>，额定 24 V' + (d.pw && cnPick(d) ? '　正在冷凝 ' + Math.floor((d.cn || 0) / CN.time * 100) + '%' : '') + '</div>' +
                '<div style="margin-top:4px;">里面：' + nkDevItems(d) + '</div><div style="margin-top:6px;color:#888;font-size:13px;">每 ' + CN.time + ' 秒：2 氧气瓶加 1 空冷罐出液氧罐；2 氮气瓶加 1 空冷罐出液氮罐；4 氢气瓶加 1 液氮罐出液氢罐。空瓶还你。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { return k === 'b_o2' || k === 'b_n2' || k === 'b_h2' || k === 'cold_tank' || k === 'tank_ln2'; }) || '<div style="color:#999;padding:6px 0;">身上没有气瓶和冷罐</div>') + NK_FOOT(d);
        };
        IND_CRAFT.push({ out: 'dev_cond', in: { steel: 5, dev_comp: 2, coil: 2, wire: 10 }, hard: true });
        IND_CRAFT.push({ out: 'cold_tank', in: CN.tankIn, hard: true });
        // 液氮做冰：配一桶生水（各种材质的桶都行，桶还你）
        IND_CRAFT.push({ out: 'ice', n: CN.iceN, in: { tank_ln2: 1, water_raw: 1 }, back: { cold_tank: 1, bucket: 1 }, hard: true });
        // 配方下标存在炉子里，新的只能加在表最后：液氧助燃炼钢，还空冷罐
        ['charcoal', 'coal'].forEach(function (c) {
            IND_RECIPES.push({ in: { ingot_fe: 1, [c]: 1, tank_lox: 1 }, out: { hot_steel: 1, cold_tank: 1 }, cls: 'smelt', minT: 1100, time: CN.fastSteel, pri: true, hard: true });
        });
