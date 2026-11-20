// 猫盾工业：石油分馏塔、煤油汽油沥青（任务 R2，火箭第 2 期）。放在 19-industry-asu.js 后面。只有硬核。
// 分馏塔不用电，旁边 5 米内要有烧着的炉子（炉温 ≥ 400°C）。放装石油的桶进去，每桶 20 秒出 1 煤油 + 1 汽油 + 1 沥青，空桶还你。
// 煤油：炉子燃料 300，也是火箭燃料（R5）。汽油：炉子燃料 400，右键给打火机加满。沥青：慢燃料 120，也能熬成胶水（古人拿它粘东西、防水）。
        const FR = { time: 20, near: 5, minT: 400, fuel: { kerosene: 300, gasoline: 400, asphalt: 120 } };
        Object.assign(IND_ITEMS_RAW, {
            dev_frac: { name: '分馏塔', col: 0xb0bec5, dev: 'frac', use: '石油出煤油汽油沥青，旁边要烧着炉子' },
            kerosene: { later: '分馏塔里出的，体检看不到', name: '煤油', col: 0xfff59d, fuel: FR.fuel.kerosene, use: '炉子燃料，也是火箭燃料' },
            gasoline: { later: '分馏塔里出的，体检看不到', name: '汽油', col: 0xffcc80, fuel: FR.fuel.gasoline, use: '炉子燃料，右键给打火机加满' },
            asphalt: { later: '分馏塔里出的，体检看不到', name: '沥青', col: 0x37474f, fuel: FR.fuel.asphalt, use: '慢燃料，也能熬成胶水' }
        });
        IND_DEVS.frac = { name: '分馏塔', col: 0xb0bec5, rated: 24, minV: 1.5, draw: 0, size: [1.4, 3, 1.4], nowire: true };
        // 旁边有没有够热的炉子
        function frHeat(d) {
            return indCooks().some(function (c) { let S = c.C && c.C.C ? c.C.C : c.C; return S && S.fire > 0 && S.temp >= FR.minT && Math.hypot(c.x - d.x, c.z - d.z) <= FR.near; });   // 出生的灶台也算（原来只看摆出来的炉子，测试员 11-20）
        }
        function frOilKey(d) { return Object.keys(d.st).filter(function (k) { let c = indContOf(k); return c && c.base === 'oil' && d.st[k] > 0; })[0] || null; }
        IND_DEV_BUSY.frac = function () { return false; };
        IND_DEV_TICK.frac = function (d, dt) {
            let k = frOilKey(d);
            if (!k || !frHeat(d)) { if (!k) d.fz = 0; return; }
            d.fz = (d.fz || 0) + dt;
            while (d.fz >= FR.time && frOilKey(d)) {
                d.fz -= FR.time; let o = frOilKey(d), c = indContOf(o);
                d.st[o]--; if (d.st[o] <= 0) delete d.st[o];
                ['kerosene', 'gasoline', 'asphalt'].forEach(function (g) { d.st[g] = (d.st[g] || 0) + 1; });
                let e = indEmptyKey(c.mat); d.st[e] = (d.st[e] || 0) + 1;
                if (ind.panel === 'frac') ind.panelDirty = true;
            }
        };
        IND_DEV_HTML.frac = function (d) {
            let hot = frHeat(d), run = frOilKey(d);
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">分馏塔</div><div style="line-height:1.7;">' + (hot ? '旁边的炉子够热' : '<b style="color:#c62828">旁边 ' + FR.near + ' 米内要有烧着的炉子，炉温 ' + FR.minT + '°C 以上</b>') + (hot && run ? '　正在分 ' + Math.floor((d.fz || 0) / FR.time * 100) + '%' : '') + '</div>' +
                '<div style="margin-top:4px;">里面：' + nkDevItems(d) + '</div><div style="margin-top:6px;color:#888;font-size:13px;">每桶石油 ' + FR.time + ' 秒出 1 煤油、1 汽油、1 沥青，空桶还你。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { let c = indContOf(k); return c && c.base === 'oil'; }) || '<div style="color:#999;padding:6px 0;">身上没有装石油的桶</div>') + NK_FOOT(d);
        };
        IND_CRAFT.push({ out: 'dev_frac', in: { steel: 8, brick: 20, ingot_cu: 6 }, hard: true });
        // 配方下标存在炉子里，新的只能加在表最后：沥青熬胶水
        IND_RECIPES.push({ in: { asphalt: 1 }, out: { glue: 2 }, minT: 100, time: 10, cls: 'smelt', hard: true });
