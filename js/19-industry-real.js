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

        // ══ 任务 57：流体管道第 1 期——管道、水塔、水泵出口、蒸汽发电机取水（docs/pipes.md）══
        // 管道 base.pipes = [[从哪个设备 id, 到哪个设备 id, 段数]]，接法跟电线一样（先点水源、再点目的地）；段数 = 距离 ÷ 2 向上取整，一条最多 20 段。
        // 高度：水塔是高处（1），别的都是地面（0）。高 → 低（水塔 → 发电机／水泵）不要电；平着走或往高（水泵 → 水塔、水泵 → 发电机）要通电的水泵。
        // 水泵：入口是 2.5 米内的水池（不用管道），或者从水塔接过来的管道；通电时每秒搬 5 单位（1 单位 = 1 桶生水）。原来的浇地、反应堆水冷照旧。
        const RL_PIPE = { segLen: 2, maxSeg: 20, rate: 5, tower: 20, poolR: 2.5 };
        Object.assign(IND_ITEMS_RAW, {
            pipe: { name: '钢管', col: 0x90a4ae, use: '接水：拿着先点水源（水塔、水泵）再点目的地（水塔、蒸汽发电机、水泵），每 2 米 1 段；高处往低处流不要电，平着或往高要水泵' },
            dev_tower: { name: '水塔', col: 0x4fc3f7, dev: 'tower', use: '高处的水箱，装 20 桶水：水泵往上抽，水靠重力流给地面的设备（不要电）；拿一桶生水左键也能倒进去' }
        });
        Object.assign(IND_DEVS, {
            tower: { name: '水塔', col: 0x4fc3f7, always: true, nowire: true, rated: 1e9, minV: 1e9, draw: 0, size: [1.2, 6, 1.2], high: 1 }
        });
        IND_CRAFT.push({ out: 'pipe', n: 4, in: { steel: 1 }, hard: true }, { out: 'dev_tower', in: { steel: 8, brick: 10, wood: 4 }, hard: true });
        IND_DEV_FIX.tower = function (d) { d.wu = indNum(d.wu, 0, 0, RL_PIPE.tower); };
        IND_DEV_INFO.tower = function (d) { return '水塔　水 ' + (Math.floor((d.wu || 0) * 10) / 10) + ' / ' + RL_PIPE.tower + ' 桶　接着 ' + rlPipesOf(d.id).length + ' 根管道'; };
        function rlHigh(d) { return (IND_DEVS[d.ty] && IND_DEVS[d.ty].high) || 0; }
        function rlPipesOf(id) { return (ind.base.pipes || []).filter(function (p) { return p[0] === id || p[1] === id; }); }
        function rlPipeSegs(a, b) { return Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / RL_PIPE.segLen)); }
        // 能当水源的（管道起点）：水塔、水泵；能收水的（管道终点）：水塔、蒸汽发电机、水泵（水泵只收水塔来的）
        function rlCanLink(a, b) {
            if (a.ty !== 'tower' && a.ty !== 'pump') return '先点水源（水塔或水泵），再点目的地';
            if (b.ty !== 'tower' && b.ty !== 'gen' && b.ty !== 'pump') return IND_DEVS[b.ty].name + '不收水';
            if (a.ty === 'tower' && b.ty === 'tower') return '两个水塔一样高，水不会自己流，中间接个水泵';
            if (a.ty === 'pump' && b.ty === 'pump') return '水泵接水泵没用，接到水塔或发电机';
            if (b.ty === 'pump' && a.ty !== 'tower') return '水泵的入口接水塔（或者放在水池 2.5 米内）';
            return '';
        }
        function rlDevAct(d, k) {
            if (k === 'pipe') {
                let B = ind.base;
                if (!ind.pipePend) { if (d.ty !== 'tower' && d.ty !== 'pump') { indFlash('先点水源（水塔或水泵），再点目的地'); return false; } ind.pipePend = d.id; ind.devDirty = true; indFlash('选了' + IND_DEVS[d.ty].name + '，再点要送水去的设备'); return true; }
                if (ind.pipePend === d.id) { ind.pipePend = null; indFlash('取消了'); return true; }
                let a = indDev(ind.pipePend); ind.pipePend = null; ind.devDirty = true;
                if (!a) return false;
                let why = rlCanLink(a, d); if (why) { indFlash(why); return false; }
                if (B.pipes.some(function (p) { return p[0] === a.id && p[1] === d.id; })) { indFlash('已经接了'); return false; }
                let n = rlPipeSegs(a, d);
                if (n > RL_PIPE.maxSeg) { indFlash('太远了：一条管道最多 ' + RL_PIPE.maxSeg + ' 段（' + RL_PIPE.maxSeg * RL_PIPE.segLen + ' 米）'); return false; }
                if ((ind.bag.pipe || 0) < n) { indFlash('要 ' + n + ' 段管道，背包里只有 ' + (ind.bag.pipe || 0) + ' 段'); return false; }
                indBagDel('pipe', n); B.pipes.push([a.id, d.id, n]); ind.wireDirty = true; indSave();
                indFlash('接上了管道：' + IND_DEVS[a.ty].name + ' → ' + IND_DEVS[d.ty].name + '（' + n + ' 段）' + (rlHigh(a) > rlHigh(d) ? '，高处往低处流不要电' : '，要水泵通电才流'));
                return true;
            }
            if (d.ty === 'tower') {
                let c = indContOf(k);
                if (c && !c.empty && c.base === 'water_raw') {
                    if (d.wu > RL_PIPE.tower - 1) { indFlash('水塔满了'); return false; }
                    indBagDel(k, 1); indBagAdd(indEmptyKey(c.mat), 1); d.wu = (d.wu || 0) + 1; indSave(); indFlash('倒进水塔一桶（' + Math.floor(d.wu) + ' / ' + RL_PIPE.tower + '）'); return true;
                }
                indFlash(IND_DEVS.tower.name + '：水 ' + Math.floor(d.wu || 0) + ' / ' + RL_PIPE.tower + ' 桶（拿钢管接水泵和设备，拿一桶生水能倒进去）'); return false;
            }
            return undefined;
        }
        // 往目的地送水，返回送进去几单位
        function rlPut(b, u) {
            if (u <= 0) return 0;
            if (b.ty === 'tower') { let t = Math.min(u, RL_PIPE.tower - (b.wu || 0)); b.wu = (b.wu || 0) + t; return Math.max(0, t); }
            if (b.ty === 'gen') { let t = Math.min(u, (RL_GEN.tank - (b.wt || 0)) / RL_GEN.tank); if (t <= 0) return 0; b.wt = (b.wt || 0) + t * RL_GEN.tank; b.wm = b.wm || 'wood'; return t; }
            return 0;
        }
        function rlPumpHasPool(d) { let P = IND_BASE_ST.pool; return !ind.base.off.pool && Math.hypot(P.x - d.x, P.z - d.z) <= RL_PIPE.poolR + P.r; }
        // 水塔：重力流给地面的设备（不要电）
        IND_DEV_TICK.tower = function (d, dt) {
            let budget = RL_PIPE.rate * dt;
            ind.base.pipes.forEach(function (p) {
                if (p[0] !== d.id || budget <= 0 || !(d.wu > 0)) return;
                let b = indDev(p[1]); if (!b || rlHigh(b) >= rlHigh(d) || b.ty === 'pump') return;   // 给水泵的水由水泵自己抽
                let t = rlPut(b, Math.min(budget, d.wu)); d.wu -= t; budget -= t;
            });
        };
        // 水泵：通电时从水池（或接过来的水塔）抽，送到出口接的设备
        IND_DEV_TICK.pump = function (d, dt) {
            if (!d.pw) return;
            let outs = ind.base.pipes.filter(function (p) { return p[0] === d.id; }).map(function (p) { return indDev(p[1]); }).filter(Boolean);
            if (!outs.length) return;
            let budget = RL_PIPE.rate * dt, pool = rlPumpHasPool(d);
            let ins = ind.base.pipes.filter(function (p) { return p[1] === d.id; }).map(function (p) { return indDev(p[0]); }).filter(function (a) { return a && a.ty === 'tower'; });
            outs.forEach(function (b) {
                if (budget <= 0) return;
                let avail = pool ? budget : Math.min(budget, ins.reduce(function (m, a) { return m + (a.wu || 0); }, 0));
                let t = rlPut(b, avail); budget -= t;
                if (!pool) ins.forEach(function (a) { let x = Math.min(a.wu || 0, t); a.wu -= x; t -= x; });
            });
        };
        function rlPickPipes(d) {
            let B = ind.base, n = 0;
            B.pipes = B.pipes.filter(function (p) { if (p[0] === d.id || p[1] === d.id) { n += p[2]; return false; } return true; });
            if (ind.pipePend === d.id) ind.pipePend = null;
            if (n > 0) { indBoxAdd('pipe', n); ind.wireDirty = true; }
            return n;
        }
        function rlSegDist(px, pz, a, b) {
            let dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L)) : 0;
            return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
        }
        function rlBoomPipes(x, z, R, gone) {
            let B = ind.base; if (!B.pipes) return;
            B.pipes = B.pipes.filter(function (p) {
                if (gone[p[0]] || gone[p[1]]) return false;
                let a = indDev(p[0]), b = indDev(p[1]); return a && b && rlSegDist(x, z, a, b) > R;
            });
            if (ind.pipePend && gone[ind.pipePend]) ind.pipePend = null;
        }
        function rlFixBase(b) {
            let ids = {}; (b.devs || []).forEach(function (d) { ids[d.id] = d; });
            if (!Array.isArray(b.pipes)) b.pipes = [];
            let seen = {};
            b.pipes = b.pipes.filter(function (p) {
                if (!Array.isArray(p) || !ids[p[0]] || !ids[p[1]] || p[0] === p[1]) return false;
                let a = ids[p[0]], c = ids[p[1]], key = p[0] + '>' + p[1];
                if (seen[key] || (a.ty !== 'tower' && a.ty !== 'pump') || (c.ty !== 'tower' && c.ty !== 'gen' && c.ty !== 'pump')) return false;
                seen[key] = 1; p[2] = indNum(p[2], 1, 1, RL_PIPE.maxSeg) | 0; p.length = 3; return true;
            }).slice(0, 400);
        }
        function rlSyncPipes() {
            if (!ind.pipeLine) return;
            let P = ind.where === 'base' ? (ind.base.pipes || []) : [], arr = new Float32Array(Math.max(1, P.length) * 6), k = 0;
            P.forEach(function (p) { let a = indDev(p[0]), b = indDev(p[1]); if (!a || !b) return; arr.set([a.x, rlHigh(a) ? IND_DEVS.tower.size[1] : 0.4, a.z, b.x, rlHigh(b) ? IND_DEVS.tower.size[1] : 0.4, b.z], k); k += 6; });
            ind.pipeLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            ind.pipeLine.geometry.setDrawRange(0, k / 3);
        }
