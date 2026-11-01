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
