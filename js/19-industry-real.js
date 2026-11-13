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
        const RL_GEN = { tank: 120, r: 5, gap: 0.9 };   // r：放在地上的老发电机找炉子的范围（任务 106 从 3 米放大到 5 米）
        IND_DEV_FIX.gen = function (d) {
            d.wt = indNum(d.wt, 0, 0, RL_GEN.tank); d.wm = IND_MATS[d.wm] ? d.wm : 'wood'; if (!(d.cook === 'stove' || typeof d.cook === 'number')) delete d.cook;
            d.self = d.self === true && d.cook === undefined;   // 任务 151：自带炉膛的是新放的，老的（贴炉子、靠炉子）规则不变
            if (d.self) {
                let fi = {}; if (d.fi && typeof d.fi === 'object') Object.keys(d.fi).forEach(function (k) { if (IND_ITEMS[k] && IND_ITEMS[k].fuel > 0 && d.fi[k] > 0) fi[k] = Math.min(99, d.fi[k] | 0); });
                d.fi = fi; d.fu = indNum(d.fu, 0, 0, 1e5); d.lit = !!d.lit;
            } else { delete d.fi; delete d.fu; delete d.lit; }
        };
        // 任务 106：拿着蒸汽发电机对炉子右键，贴在炉子背面（出料槽在右、漏斗在左，发电机在后面，不抢位置）；一个炉子贴一台。贴着的看这个炉子的火，放在地上的看 5 米内
        function rlGenCook(d) { return d.cook !== undefined && d.cook !== null ? indCookById(d.cook) : null; }
        function rlGenHot(d) { let c = rlGenCook(d); if (c) return c.C.fire >= 2; return indHeatNear(d.x, d.z, RL_GEN.r).fire >= 2; }
        function rlGenPos(c) { return { x: c.x, z: c.z - IND_COOK[c.ty].r - RL_GEN.gap }; }
        function rlGenAttach(a) {
            let c = ckCookOfAim(a); if (!c) return false;
            if (ind.where !== 'base') return false;
            indFlash('它自己就是炉子，放在地上就行'); return true;   // 任务 151：不再贴在炉子上
            if (ind.base.devs.some(function (d) { return d.ty === 'gen' && d.cook === c.id; })) { indFlash(IND_COOK[c.ty].name + '已经贴了一台蒸汽发电机'); return true; }
            if (ind.base.devs.length >= IND_DEV_CAP) { indFlash('设备太多了'); return true; }
            let p = rlGenPos(c);
            indBagDel('dev_gen', 1);
            ind.base.devs.push({ id: ++ind.base.dseq, ty: 'gen', x: p.x, z: p.z, bats: 0, u: 0, on: true, ft: 20, st: {}, cook: c.id, wt: 0, wm: 'wood' });
            ind.devDirty = true; indSave();
            indFlash('蒸汽发电机贴在' + IND_COOK[c.ty].name + '上了：拿一桶生水左键装水，炉子中火以上就发电');
            return true;
        }
        function rlGenOn(d) { return d.wt > 0 && (d.self ? d.lit && d.fu > 0 : rlGenHot(d)); }
        // 任务 151：自带炉膛。点着以后烧柴，一份柴撑多久按它的 fuel 值（秒）；悠闲有柴就自己烧。烧着就算火，水箱有水才发电
        function rlGenFuelN(d) { let n = 0; Object.keys(d.fi || {}).forEach(function (k) { n += d.fi[k]; }); return n; }
        function rlGenBurn(d, dt) {
            if (!d.lit && !indHard() && (d.fu > 0 || rlGenFuelN(d) > 0)) d.lit = true;
            if (!d.lit) return;
            if (!(d.fu > 0)) {
                let k = Object.keys(d.fi).filter(function (q) { return d.fi[q] > 0; })[0];
                if (!k) { d.lit = false; if (!ind.sleeping) indFlash('蒸汽发电机没柴了'); return; }
                d.fi[k]--; if (d.fi[k] <= 0) delete d.fi[k]; d.fu += IND_ITEMS[k].fuel;
            }
            d.fu = Math.max(0, d.fu - dt);
        }
        function rlGenHeat(x, z) { return ind.where === 'base' && ind.base.devs.some(function (d) { return d.ty === 'gen' && d.self && d.lit && d.fu > 0 && Math.hypot(d.x - x, d.z - z) < IND_BODY.fireR; }); }
        IND_DEV_TICK.gen = function (d, dt) {
            if (d.self) rlGenBurn(d, dt / pwAccelMultDev(d));
            if (!rlGenOn(d)) return;
            d.wt = Math.max(0, d.wt - dt / pwAccelMultDev(d));   // 时间加速器不加速发电机（不多发电，也不多费水）
            if (d.wt <= 0 && !ind.sleeping) indFlash('蒸汽发电机没水了');
        };
        function rlGenInfo(d) {
            let D = IND_DEVS.gen, w = d.wt > 0 ? '水箱剩 ' + Math.ceil(d.wt) + ' 秒' : rlPipesOf(d.id).some(function (p) { return p[1] === d.id; }) ? '水塔没水了' : '水箱空了，拿一桶生水左键装点水';
            if (d.self) return D.name + (rlGenOn(d) ? ' 发电中 12 V' : ' 没在发电') + '　柴 ' + (rlGenFuelN(d) + (d.fu > 0 ? 1 : 0)) + ' 份' + (d.lit ? '　烧着' : indHard() ? '　没点火，拿火柴左键点' : '') + '　' + w;
            if (rlGenOn(d)) return D.name + ' 发电中 12 V　' + w;
            let c = rlGenCook(d);
            return D.name + (c ? '（贴在' + IND_COOK[c.ty].name + '上）' : '') + ' 没在发电　' + w + (rlGenHot(d) ? '' : c ? '　' + IND_COOK[c.ty].name + '要中火以上' : '　对着炉子右键贴上去，或者放在点着的炉子（中火以上）5 米内');
        }
        function rlGenAct(d, k) {
            if (d.self && k) {
                let it = IND_ITEMS[k];
                if (it && it.fuel > 0 && !indContOf(k)) {
                    if (rlGenFuelN(d) >= 20) { indFlash('柴放满了'); return false; }
                    indBagDel(k, 1); d.fi[k] = (d.fi[k] || 0) + 1; indSave(); indFlash('加了 1 份' + indName(k) + '，共 ' + rlGenFuelN(d) + ' 份'); return true;
                }
                if (['ember', 'match', 'lighter', 'torch', 'flint'].indexOf(k) >= 0 && indHard()) {
                    if (d.lit) { indFlash('已经烧着了'); return false; }
                    if (!(d.fu > 0 || rlGenFuelN(d) > 0)) { indFlash('先加柴'); return false; }
                    let r = fiUseSource(k); if (r !== true) return r === false ? false : true;
                    d.lit = true; rlGenBurn(d, 0); indSave(); indFlash('点着了'); return true;
                }
            }
            let c = indContOf(k);
            if (c && !c.empty && c.base === 'water_raw') {
                if (d.wt > 0) { indFlash('水箱还有水（剩 ' + Math.ceil(d.wt) + ' 秒），用完再装'); return false; }
                indBagDel(k, 1); indGive(indEmptyKey(c.mat), 1); d.wt = RL_GEN.tank; d.wm = c.mat; indSave();
                indFlash('水箱装满了（能发 ' + RL_GEN.tank + ' 秒电）'); return true;
            }
            if (c && !c.empty) { indFlash('水箱只装生水'); return false; }
            indFlash(rlGenInfo(d)); return false;
        }

        // ══ 任务 57、58：流体管道（docs/pipes.md）══
        // 管道 base.pipes = [[起点, 终点, 段数, 流体]]，流体 'w' 水、'o' 油、'g' 天然气，一条只走一种。起点终点是设备 id（数字）或炉子 'k' + 炉子 id（灶台是 'kstove'）。
        // 接法跟电线一样（先点水源、再点目的地）；段数 = 距离 ÷ 2 向上取整，一条最多 20 段。
        // 高度：水塔是高处（1），别的都是地面（0）。高 → 低（水塔 → 地面）不要电；平着走或往高要通电的水泵（水泵的入口：2.5 米内的水池，或者接过来的水塔、储油罐、储气罐）。
        // 第 2 期（任务 58）：电解槽、炉子（往里放的空桶自动装生水）、反应堆（算水冷）接水管；储油罐 → 水泵 → 炉子的进料漏斗；储气罐 → 水泵 → 炉子当燃料
        const RL_PIPE = { segLen: 2, maxSeg: 20, rate: 5, tower: 20, poolR: 2.5, tank: 20, elBuf: 2, cookBuf: 8, rxBuf: 0.5, rxUse: 1 / 30, gasLow: 300 };
        const RL_FLUID = { w: '水', o: '油', g: '天然气' };
        Object.assign(IND_ITEMS_RAW, {
            pipe: { name: '钢管', col: 0x90a4ae, use: '接水、油、天然气：拿着先点源头（水塔、水泵、储油罐、储气罐）再点目的地，每 2 米 1 段；高处往低处流不要电，平着或往高要水泵' },
            dev_tower: { name: '水塔', col: 0x4fc3f7, dev: 'tower', use: '高处的水箱，装 20 桶水：水泵往上抽，水靠重力流给地面的设备（不要电）；拿一桶生水左键也能倒进去' },
            dev_oiltank: { name: '储油罐', col: 0x3e2723, dev: 'oiltank', use: '装 20 桶石油：拿油桶左键倒进去、拿空桶左键装出来（当仓库用，桶不碎、不占背包）；接管道和水泵送到炉子的进料漏斗' },
            dev_gastank: { name: '储气罐', col: 0xffe082, dev: 'gastank', use: '装 20 瓶天然气：拿天然气钢瓶左键灌进去、拿空钢瓶左键装出来（当仓库用）；接管道和水泵送到炉子当燃料' }
        });
        Object.assign(IND_DEVS, {
            tower: { name: '水塔', col: 0x4fc3f7, always: true, nowire: true, rated: 1e9, minV: 1e9, draw: 0, size: [1.2, 6, 1.2], high: 1 },
            oiltank: { name: '储油罐', col: 0x3e2723, always: true, nowire: true, rated: 1e9, minV: 1e9, draw: 0, size: [1.6, 1.6, 1.6] },
            gastank: { name: '储气罐', col: 0xffe082, always: true, nowire: true, rated: 1e9, minV: 1e9, draw: 0, size: [1.4, 1.8, 1.4] }
        });
        IND_CRAFT.push({ out: 'pipe', n: 4, in: { steel: 1 }, hard: true }, { out: 'dev_tower', in: { steel: 8, brick: 10, wood: 4 }, hard: true },
            { out: 'dev_oiltank', in: { steel: 6, brick: 4 }, hard: true }, { out: 'dev_gastank', in: { steel: 6, ingot_cu: 2 }, hard: true });
        IND_DEV_FIX.tower = function (d) { d.wu = indNum(d.wu, 0, 0, RL_PIPE.tower); };
        IND_DEV_FIX.oiltank = function (d) { d.oil = indNum(d.oil, 0, 0, RL_PIPE.tank); };
        IND_DEV_FIX.gastank = function (d) { d.gas = indNum(d.gas, 0, 0, RL_PIPE.tank); };
        IND_DEV_INFO.tower = function (d) { return '水塔　水 ' + (Math.floor((d.wu || 0) * 10) / 10) + ' / ' + RL_PIPE.tower + ' 桶　接着 ' + rlPipesOf(d.id).length + ' 根管道'; };
        IND_DEV_INFO.oiltank = function (d) { return '储油罐　油 ' + (Math.floor((d.oil || 0) * 10) / 10) + ' / ' + RL_PIPE.tank + ' 桶　接着 ' + rlPipesOf(d.id).length + ' 根管道'; };
        IND_DEV_INFO.gastank = function (d) { return '储气罐　天然气 ' + (Math.floor((d.gas || 0) * 10) / 10) + ' / ' + RL_PIPE.tank + ' 瓶　接着 ' + rlPipesOf(d.id).length + ' 根管道'; };
        // 管道一头：设备或炉子
        function rlNode(id) {
            if (typeof id === 'number') { let d = indDev(id); return d ? { id: id, ty: d.ty, x: d.x, z: d.z, d: d, name: IND_DEVS[d.ty].name } : null; }
            if (typeof id === 'string' && id[0] === 'k') { let c = indCookById(id === 'kstove' ? 'stove' : +id.slice(1)); return c ? { id: id, ty: 'cook', x: c.x, z: c.z, C: c.C, name: IND_COOK[c.ty].name } : null; }
            return null;
        }
        function rlHigh(n) { return n && n.d && IND_DEVS[n.d.ty].high ? 1 : 0; }
        function rlPipesOf(id) { return (ind.base.pipes || []).filter(function (p) { return p[0] === id || p[1] === id; }); }
        function rlPipeSegs(a, b) { return Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / RL_PIPE.segLen)); }
        const RL_SRC = { tower: 'w', oiltank: 'o', gastank: 'g', pump: '*' };
        const RL_DST = { tower: 'w', gen: 'w', el: 'w', reactor: 'w', pump: 'wog', cook: 'wog', oiltank: 'o', gastank: 'g' };
        // 水泵送的是什么：看接进来的管道，没有就是水池的水
        function rlPumpFluid(id) { let p = (ind.base.pipes || []).filter(function (q) { return q[1] === id; })[0]; return p ? p[3] : 'w'; }
        function rlFluidOf(a) { let s = RL_SRC[a.ty]; return s === '*' ? rlPumpFluid(a.id) : s; }
        function rlCanLink(a, b) {
            if (!RL_SRC[a.ty]) return '先点源头（水塔、水泵、储油罐、储气罐），再点目的地';
            if (!RL_DST[b.ty]) return b.name + '不接管道';
            let f = rlFluidOf(a);
            if (RL_DST[b.ty].indexOf(f) < 0) return b.name + '不收' + RL_FLUID[f];
            if (a.ty === 'pump' && b.ty === 'pump') return '水泵接水泵没用';
            if (b.ty === 'pump') {
                if (a.ty === 'pump') return '水泵接水泵没用';
                let o = (ind.base.pipes || []).filter(function (q) { return q[0] === b.id || q[1] === b.id; })[0];
                if (o && o[3] !== f) return '这个水泵已经在送' + RL_FLUID[o[3]] + '了，一个水泵只送一种';
                return '';
            }
            if (a.ty !== 'pump' && rlHigh(a) <= rlHigh(b)) return a.ty === 'tower' ? '两个水塔一样高，水不会自己流，中间接个水泵' : a.name + '在地面上，中间要接水泵';
            return '';
        }
        // 拿着钢管点设备或炉子：先源头再目的地
        function rlPipeClick(id) {
            let B = ind.base, n = rlNode(id); if (!n) return false;
            if (!ind.pipePend) { if (!RL_SRC[n.ty]) { indFlash('先点源头（水塔、水泵、储油罐、储气罐），再点目的地'); return false; } ind.pipePend = id; ind.devDirty = true; indFlash('选了' + n.name + '，再点要送去的地方'); return true; }
            if (ind.pipePend === id) { ind.pipePend = null; ind.devDirty = true; indFlash('取消了'); return true; }
            let a = rlNode(ind.pipePend); ind.pipePend = null; ind.devDirty = true;
            if (!a) return false;
            let why = rlCanLink(a, n); if (why) { indFlash(why); return false; }
            if (B.pipes.some(function (p) { return p[0] === a.id && p[1] === n.id; })) { indFlash('已经接了'); return false; }
            let k = rlPipeSegs(a, n);
            if (k > RL_PIPE.maxSeg) { indFlash('太远了：一条管道最多 ' + RL_PIPE.maxSeg + ' 段（' + RL_PIPE.maxSeg * RL_PIPE.segLen + ' 米）'); return false; }
            if ((ind.bag.pipe || 0) < k) { indFlash('要 ' + k + ' 段管道，背包里只有 ' + (ind.bag.pipe || 0) + ' 段'); return false; }
            let f = rlFluidOf(a);
            indBagDel('pipe', k); B.pipes.push([a.id, n.id, k, f]); ind.wireDirty = true; indSave();
            indFlash('接上了' + RL_FLUID[f] + '管：' + a.name + ' → ' + n.name + '（' + k + ' 段）' + (a.ty === 'pump' ? '，要水泵通电才流' : '，高处往低处流不要电'));
            return true;
        }
        function rlDevAct(d, k) {
            if (k === 'pipe') return rlPipeClick(d.id);
            let c = indContOf(k);
            if (d.ty === 'tower') {
                if (c && !c.empty && c.base === 'water_raw') {
                    if (d.wu > RL_PIPE.tower - 1) { indFlash('水塔满了'); return false; }
                    indBagDel(k, 1); indGive(indEmptyKey(c.mat), 1); d.wu = (d.wu || 0) + 1; indSave(); indFlash('倒进水塔一桶（' + Math.floor(d.wu) + ' / ' + RL_PIPE.tower + '）'); return true;
                }
                indFlash(IND_DEVS.tower.name + '：水 ' + Math.floor(d.wu || 0) + ' / ' + RL_PIPE.tower + ' 桶（拿钢管接水泵和设备，拿一桶生水能倒进去）'); return false;
            }
            if (d.ty === 'oiltank') {
                if (c && !c.empty && c.base === 'oil') {
                    if (d.oil > RL_PIPE.tank - 1) { indFlash('储油罐满了'); return false; }
                    indBagDel(k, 1); indGive(indEmptyKey(c.mat), 1); d.oil = (d.oil || 0) + 1; indSave(); indFlash('倒进储油罐一桶（' + Math.floor(d.oil) + ' / ' + RL_PIPE.tank + '）'); return true;
                }
                if (c && c.empty) {
                    if (!(d.oil >= 1)) { indFlash('储油罐里不够一桶'); return false; }
                    if (indFits(ind.bag, indBagSlots(), indFilledKey('oil', c.mat), 1) < 1 && ind.bag[k] > 1) { indFlash('背包满了'); return false; }
                    indBagDel(k, 1); indGive(indFilledKey('oil', c.mat), 1); d.oil -= 1; indSave(); indFlash('装出来一桶石油'); return true;
                }
                indFlash(IND_DEV_INFO.oiltank(d) + '（拿油桶左键倒进去，拿空桶装出来）'); return false;
            }
            if (d.ty === 'gastank') {
                if (k === 'gas_ng') {
                    if (d.gas > RL_PIPE.tank - 1) { indFlash('储气罐满了'); return false; }
                    indBagDel(k, 1); indGive('cyl', 1); d.gas = (d.gas || 0) + 1; indSave(); indFlash('灌进储气罐一瓶（' + Math.floor(d.gas) + ' / ' + RL_PIPE.tank + '），空钢瓶还你'); return true;
                }
                if (k === 'cyl') {
                    if (!(d.gas >= 1)) { indFlash('储气罐里不够一瓶'); return false; }
                    indBagDel('cyl', 1); indGive('gas_ng', 1); d.gas -= 1; indSave(); indFlash('装出来一瓶天然气'); return true;
                }
                indFlash(IND_DEV_INFO.gastank(d) + '（拿天然气钢瓶左键灌进去，拿空钢瓶装出来）'); return false;
            }
            if (d.ty === 'snuke' && k !== 'wire') return fmSnukeAct(d, k);   // 小型核电（19-industry-farm.js，任务 49）
            return undefined;
        }
        // 往目的地送，返回送进去多少（水 1 单位 = 1 桶；油 1 桶；气 1 瓶）
        function rlRoom(n, f) {
            let d = n.d, C = n.C;
            if (n.ty === 'tower') return RL_PIPE.tower - (d.wu || 0);
            if (n.ty === 'gen') return (RL_GEN.tank - (d.wt || 0)) / RL_GEN.tank;
            if (n.ty === 'el') return RL_PIPE.elBuf - (d.wb || 0);
            if (n.ty === 'reactor') return RL_PIPE.rxBuf - (d.wb || 0);
            if (n.ty === 'oiltank') return RL_PIPE.tank - (d.oil || 0);
            if (n.ty === 'gastank') return RL_PIPE.tank - (d.gas || 0);
            if (n.ty === 'cook') {
                if (f === 'w') return RL_PIPE.cookBuf - (C.wb || 0);
                if (f === 'o') return C.funnel ? (CK.funnelCap - C.funnel.oil) / CK.oilFuel : 0;
                if (f === 'g') return (RL_PIPE.gasLow + IND_ITEMS_RAW.gas_ng.fuel - C.fuel) / IND_ITEMS_RAW.gas_ng.fuel;   // 炉子燃料补到 300 + 一瓶（现在 800）为止，不一下全灌进去
            }
            return 0;
        }
        function rlPut(n, f, u) {
            let t = Math.max(0, Math.min(u, rlRoom(n, f))); if (t <= 0) return 0;
            let d = n.d, C = n.C;
            if (n.ty === 'tower') d.wu = (d.wu || 0) + t;
            else if (n.ty === 'gen') { d.wt = (d.wt || 0) + t * RL_GEN.tank; d.wm = d.wm || 'wood'; }
            else if (n.ty === 'el' || n.ty === 'reactor') d.wb = (d.wb || 0) + t;
            else if (n.ty === 'oiltank') d.oil = (d.oil || 0) + t;
            else if (n.ty === 'gastank') d.gas = (d.gas || 0) + t;
            else if (n.ty === 'cook') {
                if (f === 'w') C.wb = (C.wb || 0) + t;
                else if (f === 'o') C.funnel.oil += t * CK.oilFuel;
                else if (f === 'g') C.fuel += t * IND_ITEMS_RAW.gas_ng.fuel;
            }
            return t;
        }
        function rlStock(d, f) { return f === 'w' ? (d.wu || 0) : f === 'o' ? (d.oil || 0) : (d.gas || 0); }
        function rlTake(d, f, t) { if (f === 'w') d.wu -= t; else if (f === 'o') d.oil -= t; else d.gas -= t; }
        function rlPumpHasPool(d) { let P = IND_BASE_ST.pool; return !ind.base.off.pool && Math.hypot(P.x - d.x, P.z - d.z) <= RL_PIPE.poolR + P.r; }
        // 水塔：重力流给地面的设备、炉子（不要电）；储油罐、储气罐在地面，只能靠水泵抽
        IND_DEV_TICK.tower = function (d, dt) {
            let budget = RL_PIPE.rate * dt;
            ind.base.pipes.forEach(function (p) {
                if (p[0] !== d.id || budget <= 0 || !(d.wu > 0)) return;
                let b = rlNode(p[1]); if (!b || b.ty === 'pump' || rlHigh(b)) return;   // 给水泵的水由水泵自己抽
                let t = rlPut(b, 'w', Math.min(budget, d.wu)); d.wu -= t; budget -= t;
            });
        };
        // 水泵：通电时从水池（或接过来的水塔、储油罐、储气罐）抽，送到出口接的地方
        IND_DEV_TICK.pump = function (d, dt) {
            if (!d.pw) return;
            let P = ind.base.pipes, outs = P.filter(function (p) { return p[0] === d.id; }).map(function (p) { return { n: rlNode(p[1]), f: p[3] }; }).filter(function (o) { return o.n; });
            if (!outs.length) return;
            let ins = P.filter(function (p) { return p[1] === d.id; }).map(function (p) { return { d: indDev(p[0]), f: p[3] }; }).filter(function (o) { return o.d; });
            let budget = RL_PIPE.rate * dt, pool = !ins.length && rlPumpHasPool(d);
            outs.forEach(function (o) {
                if (budget <= 0) return;
                let src = ins.filter(function (i) { return i.f === o.f; });
                let avail = pool && o.f === 'w' ? budget : Math.min(budget, src.reduce(function (m, i) { return m + rlStock(i.d, i.f); }, 0));
                let t = rlPut(o.n, o.f, avail); budget -= t;
                if (!(pool && o.f === 'w')) src.forEach(function (i) { let x = Math.min(rlStock(i.d, i.f), t); rlTake(i.d, i.f, x); t -= x; });
            });
        };
        // 炉子接了水管：往里放的空桶（能上火的：陶罐、铁桶、黄铜桶）自动装上生水，再照常烧开（开水还是装桶）
        function rlCookWaterTick(c) {
            let S = c.C; if (!(S.wb >= 1)) return;
            Object.keys(S.items).forEach(function (k) {
                let cc = indContOf(k); if (!cc || !cc.empty || !IND_MATS[cc.mat].fire) return;
                let n = Math.min(S.items[k], Math.floor(S.wb)); if (n <= 0) return;
                S.items[k] -= n; if (S.items[k] <= 0) delete S.items[k];
                let w = indFilledKey('water_raw', cc.mat); S.items[w] = (S.items[w] || 0) + n; S.wb -= n;
                if (ind.panel === 'stove') ind.panelDirty = true;
            });
        }
        // 电解槽接了水管：要水的配方先用管道里的水（不用放水桶，瓶子还是要放）
        function rlElPipeWater(d) { return Math.floor(d.wb || 0); }
        // 反应堆连着有水的管道（水塔或水泵送来的）也算水冷；管道断水就是空气冷却。冷却水一直在流，每 30 秒用掉 1 桶
        function rlReactorWet(d) { return (d.wb || 0) > 0 && rlPipesOf(d.id).some(function (p) { return p[1] === d.id; }); }
        function rlReactorUse(d, dt) { if (d.wb > 0) d.wb = Math.max(0, d.wb - RL_PIPE.rxUse * dt); }
        function rlPickPipes(id) {
            let B = ind.base, n = 0;
            B.pipes = (B.pipes || []).filter(function (p) { if (p[0] === id || p[1] === id) { n += p[2]; return false; } return true; });
            if (ind.pipePend === id) ind.pipePend = null;
            if (n > 0) { indBoxAdd('pipe', n); ind.wireDirty = true; }
            return n;
        }
        function rlSegDist(px, pz, a, b) {
            let dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / L)) : 0;
            return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
        }
        // 爆炸：两头或中间被炸到的管道没了，不退（炉子被炸也一样）。在设备、炉子删掉之前调用
        function rlBoomPipes(x, z, R) {
            let B = ind.base; if (!B.pipes) return;
            B.pipes = B.pipes.filter(function (p) {
                let a = rlNode(p[0]), b = rlNode(p[1]); if (!a || !b) return false;
                return Math.hypot(a.x - x, a.z - z) > R && Math.hypot(b.x - x, b.z - z) > R && rlSegDist(x, z, a, b) > R;
            });
            ind.pipePend = null;
        }
        function rlFixBase(b) {
            let ids = {}; (b.devs || []).forEach(function (d) { ids[d.id] = d.ty; });
            (b.cookers || []).forEach(function (c) { ids['k' + c.id] = 'cook'; }); if (!(b.off && b.off.stove)) ids.kstove = 'cook';
            if (!Array.isArray(b.pipes)) b.pipes = [];
            let seen = {};
            b.pipes = b.pipes.filter(function (p) {
                if (!Array.isArray(p) || !ids[p[0]] || !ids[p[1]] || p[0] === p[1]) return false;
                let a = ids[p[0]], c = ids[p[1]], key = p[0] + '>' + p[1];
                if (!RL_FLUID[p[3]]) p[3] = 'w';   // 第 1 期的老管道都是水
                if (seen[key] || !RL_SRC[a] || !RL_DST[c] || RL_DST[c].indexOf(p[3]) < 0) return false;
                seen[key] = 1; p[2] = indNum(p[2], 1, 1, RL_PIPE.maxSeg) | 0; p.length = 4; return true;
            }).slice(0, 400);
            b.marks = Array.isArray(b.marks) ? b.marks.filter(function (m) { return m && isFinite(m.x) && isFinite(m.z); }).slice(0, 8).map(function (m) { return { x: indNum(m.x, 0, -IND_MAP, IND_MAP), z: indNum(m.z, 0, -IND_MAP, IND_MAP) }; }) : [];   // 地图记号（任务 45）
            (b.cookers || []).concat(b.stove ? [b.stove] : []).forEach(function (S) { S.wb = indNum(S.wb, 0, 0, RL_PIPE.cookBuf); });
            (b.devs || []).forEach(function (d) { if (d.ty === 'el' || d.ty === 'reactor') d.wb = indNum(d.wb, 0, 0, d.ty === 'el' ? RL_PIPE.elBuf : RL_PIPE.rxBuf); });
        }
        function rlSyncPipes() {
            if (!ind.pipeLine) return;
            let P = ind.where === 'base' ? (ind.base.pipes || []) : [], arr = new Float32Array(Math.max(1, P.length) * 6), k = 0;
            P.forEach(function (p) { let a = rlNode(p[0]), b = rlNode(p[1]); if (!a || !b) return; arr.set([a.x, rlHigh(a) ? IND_DEVS.tower.size[1] : 0.4, a.z, b.x, rlHigh(b) ? IND_DEVS.tower.size[1] : 0.4, b.z], k); k += 6; });
            ind.pipeLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            ind.pipeLine.geometry.setDrawRange(0, k / 3);
        }
