        // ══════════════════════════════════════════════════════════
        //  猫盾工业：跟现实对得上的几处（docs/realism.md、任务 53 起）
        //  这个文件排在 GAME_FILES 的最后：往 IND_RECIPES 追加的配方都放这里，前面的配方序号不动（正在烧的炉子存的是序号）。
        // ══════════════════════════════════════════════════════════

        // 任务 53：矿要还原剂。木炭那条在原位置，煤、焦炭的追加在这里（跟炼钢的三条一个做法）
        const RL_ORE_RECIPES = IND_RECIPES.filter(function (r) { return r.cls === 'smelt' && r.in.charcoal === 1 && Object.keys(r.in).length === 2 && Object.keys(r.in).some(function (k) { return /^ore_/.test(k); }); });
        ['coal', 'char'].forEach(function (c) {
            RL_ORE_RECIPES.forEach(function (r) {
                let inp = {}; Object.keys(r.in).forEach(function (k) { if (k === 'charcoal') inp[c] = 1; else inp[k] = r.in[k]; });
                IND_RECIPES.push({ in: inp, out: Object.assign({}, r.out), cls: 'smelt', minT: r.minT, time: r.time, hard: true });
            });
        });
        const RL_REDUCERS = ['charcoal', 'coal', 'char'];
        // 炉子里有矿、没有还原剂：提示一句（老档里正在烧的矿也走这里，东西不丢）
        function rlNeedReducer(S) {
            let p = ckPool(S);
            return Object.keys(p).some(function (k) { return /^ore_(fe|cu|zn|sn|pb|ni)$/.test(k) && p[k] > 0; }) && !RL_REDUCERS.some(function (k) { return p[k] > 0; });
        }

        // 任务 59：硅。电炉（3 米内的炉子顶到 1800°C）里沙子 2 + 木炭／煤／焦炭 1 → 烫硅，凉了是硅锭。现实：二氧化硅被碳还原
        // pri：沙子多的时候不被"3 沙 → 玻璃板（1700°C）"抢走
        Object.assign(IND_ITEMS_RAW, {
            hot_si: { name: '硅（烫）', col: 0xff7043, hot: 'ingot_si', needTool: 'tongs' },
            ingot_si: { name: '硅', col: 0x607d8b, useLater: '太阳能板、芯片', use: '以后做太阳能板的电池片、芯片的基片要用' }
        });
        IND_ELEM_OF.ingot_si = 14;
        CK_MELT.hot_si = 1414;
        RL_REDUCERS.forEach(function (c) {
            let inp = { sand: 2 }; inp[c] = 1;
            IND_RECIPES.push({ in: inp, out: { hot_si: 1 }, cls: 'smelt', minT: 1700, time: 40, hard: true, pri: true });
        });

        // 任务 54：硝酸。大窑化学批次：硝石 2 + 硫酸 1 + 空瓶 1 → 硝酸 2 + 硫酸钾 1（120°C、20 秒）。钚改用硝酸提取（PUREX，在 19-industry-nuke.js 原位置改的）
        Object.assign(IND_ITEMS_RAW, {
            b_hno3: { name: '硝酸瓶', col: 0xffcc80, corrosive: true, use: '后处理乏燃料出钚（乏燃料棒 + 2 瓶）；以后做芯片蚀刻也要用' },
            k2so4: { name: '硫酸钾', col: 0xf5f5f5, use: '右键撒在有作物的农田上，这一季长得快 75%（比硝石弱）' }
        });
        IND_ELEM_OF.b_hno3 = 7;
        IND_RECIPES.push({ in: { saltpeter: 2, b_h2so4: 1, bottle: 1 }, out: { b_hno3: 2, k2so4: 1 }, cls: 'chem', pri: true, minT: 120, time: 20, hard: true });

        // 任务 55：蒸汽发电机（原来的 dev_gen）。水箱装一桶生水（空桶还你）；3 米内有点着的炉子（中火以上）而且水箱有水才发 12 V，一桶撑 120 秒。
        // 用的是炉子多出来的热，炉子不降温。没水或没炉子就停。拿起时没用完的水还回成一桶（indPickDev）。老档的发电机水箱是空的
        const RL_GEN = { tank: 120 };
        IND_DEV_FIX.gen = function (d) { d.wt = indNum(d.wt, 0, 0, RL_GEN.tank); d.wm = IND_MATS[d.wm] ? d.wm : 'wood'; };
        function rlGenHot(d) { return indHeatNear(d.x, d.z, IND_GEN_R).fire >= 2; }
        function rlGenOn(d) { return d.wt > 0 && rlGenHot(d); }
        IND_DEV_TICK.gen = function (d, dt) {
            if (!rlGenOn(d)) return;
            d.wt = Math.max(0, d.wt - dt / pwAccelMultDev(d));   // 时间加速器不加速发电机（不多发电，也不多费水）
            if (d.wt <= 0 && !ind.sleeping) indFlash('蒸汽发电机没水了');
        };
        function rlGenInfo(d) {
            let D = IND_DEVS.gen, w = d.wt > 0 ? '水箱剩 ' + Math.ceil(d.wt) + ' 秒' : '水箱空了，拿一桶生水左键装点水';
            if (rlGenOn(d)) return D.name + ' 发电中 12 V　' + w;
            return D.name + ' 没在发电　' + w + (rlGenHot(d) ? '' : '　3 米内要有点着的炉子（中火以上）');
        }
        function rlGenAct(d, k) {
            let c = indContOf(k);
            if (c && !c.empty && c.base === 'water_raw') {
                if (d.wt > 0) { indFlash('水箱还有水（剩 ' + Math.ceil(d.wt) + ' 秒），用完再装'); return false; }
                indBagDel(k, 1); indBagAdd(indEmptyKey(c.mat), 1); d.wt = RL_GEN.tank; d.wm = c.mat; indSave();
                indFlash('水箱装满了（能发 ' + RL_GEN.tank + ' 秒电）'); return true;
            }
            if (c && !c.empty) { indFlash('水箱只装生水'); return false; }
            indFlash(rlGenInfo(d)); return false;
        }
