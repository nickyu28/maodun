// 电源串联（任务 152）：用电器连了 ≥ 2 个电源时可以选"并联"（默认，电压取最高的）或"串联"（电压相加）。
// 串联：所有电源都有电才通，电压 = 各电源电压之和，耗电按电压占比分给各电源；有一个没电整条断。
// 存档：用电器的 d.ser（true 就是串联，缺了当并联）。切换：准星对着用电器按 J 或点"接法"按钮。
        const SR = { over: true };
        function srOn(d) { return !!d && d.ser === true && indDevSrcs(d).length >= 2; }
        // 串联电压：每个电源都有电才算，加起来；有一个没电就是 0
        function srVolt(ss) {
            let t = 0;
            for (let i = 0; i < ss.length; i++) { let v = indSrcVolt(ss[i]); if (!(v > 0)) return 0; t += v; }
            return t;
        }
        // 现在有电的电源电压加起来（切换前预估用）
        function srPreview(d) { return indDevSrcs(d).reduce(function (t, s) { return t + indSrcVolt(s); }, 0); }
        function srInfo(d) {
            let ss = indDevSrcs(d); if (ss.length < 2) return '';
            let t = '　接法：' + (srOn(d) ? '串联' : '并联');
            if (srOn(d)) {
                if (ss.some(function (s) { return !(indSrcVolt(s) > 0); })) t += '，串联的电源里有一个没电了';
                else if (srVolt(ss) < IND_DEVS[d.ty].minV) t += '，电压不够';
            } else if (indDevVolt(d) < IND_DEVS[d.ty].minV && indDevVolt(d) > 0) t += '，电压不够';
            return t;
        }
        // 切换接法。切到串联会超过额定时先问一声（ok = true 是确认过了）
        function srSwitch(d, on, ok) {
            if (!d || indDevSrcs(d).length < 2) { indFlash('要接两个以上的电源'); return false; }
            if (!on) { d.ser = false; ind.devDirty = true; indSave(); indFlash(IND_DEVS[d.ty].name + '：并联'); return true; }
            let V = srPreview(d), R = IND_DEVS[d.ty].rated;
            if (V > R + 1e-6 && !ok) {
                ind.srAsk = d.id;
                showSysModal('串联', '串联后 ' + (Math.round(V * 10) / 10) + ' V，超过额定 ' + R + ' V，会炸，确定吗', [
                    { label: '串联', color: '#c62828', onClick: function () { if (ind) { ind.srAsk = null; let x = indDev(d.id); if (x) srSwitch(x, true, true); } } },
                    { label: '不了', color: '#757575', onClick: function () { if (ind) ind.srAsk = null; } }]);
                return false;
            }
            d.ser = true; ind.devDirty = true; indSave(); indFlash(IND_DEVS[d.ty].name + '：串联');
            return true;
        }
        function srToggleAim() {
            if (!ind || ind.over || ind.where !== 'base' || ind.panel || ind.paused) return;
            let a = indAim(); if (!a || a.kind !== 'dev') { indFlash('对着用电器按 J 切换并联串联'); return; }
            let d = a.o; if (IND_DEVS[d.ty].src) { indFlash('对着用电器'); return; }
            srSwitch(d, !srOn(d));
        }
        function srBtn() {
            let b = document.getElementById('ind-btn-ser'); if (!b) return;
            let a = ind && ind.where === 'base' && !ind.panel ? indAim() : null, d = a && a.kind === 'dev' && !IND_DEVS[a.o.ty].src && indDevSrcs(a.o).length >= 2 ? a.o : null;
            b.style.display = d ? '' : 'none';
            if (d) b.textContent = '接法：' + (srOn(d) ? '串联' : '并联') + '　J';
        }
        IND_ITEMS_RAW.dev_furnace.use = '放在炉子 3 米内，炉温顶到 1800°C。要 24 V，两个 12 V 串联就行';   // 任务 152
        // 任务 149：风箱不靠皮也能做。木箱活塞风箱（战国就有），羊毛当封条。配方加在表的最后，皮囊风箱的老配方不动
        IND_CRAFT.push({ out: 'bellows', in: { wood: 10, rope: 12, wool: 4, ingot_cu: 2, clay: 4 }, hard: true });
        // 任务 153：炉子里的配方时间统一减半，最低 5 秒；升温速度也提高了（灶台、小熔炉、石炉每秒 100°C，大窑 30°C）。进行中的进度在 ckFix 里按比例换算
        const CK_TIME_OLD = IND_RECIPES.map(function (r) { return r.time; });
        IND_RECIPES.forEach(function (r) { r.time = Math.max(5, Math.round(r.time * 0.5 * 10) / 10); });
        IND_RECIPES.forEach(function (r) { if (r.out.hot_steel && r.in.ingot_fe && !r.in.b_n2 && !r.in.b_ar) r.time = 20; });   // 任务 154 + 153：渗碳钢 60 秒减半还是 30，压到 20，主线上单次烧制 ≤ 20 秒
        // 任务 158：石锤，一开始就能做。青铜工具冷锻要锤子，铁钢工具要锤子，石锤铁锤都行
        IND_ITEMS_RAW.hammer_stone = { name: '石锤', col: 0x9e9e9e, use: '放在背包里，工作台才打得了青铜、铁、钢的工具，不会用掉' };
        IND_CRAFT.push({ out: 'hammer_stone', in: { stone: 2, wood: 1 }, hard: true });
        // 任务 158 补充：石锤冷锻的青铜工具单独一个 key（xx_cold），耐久是铸造的 40%，其余跟青铜的一样（挖矿档位、加成、干活时间）。铸造的不变
        (function () {
            let N = { pick: '镐', axe: '斧', shovel: '铲', shears: '剪刀', knife: '刀' }, add = {};
            Object.keys(N).forEach(function (kind) {
                let base = kind + '_bronze', cold = kind + '_cold', B = IND_ITEMS_RAW[base]; if (!B) return;
                add[cold] = Object.assign({}, B, { name: '冷锻青铜' + N[kind], use: '敲出来的，不耐用，耐久只有铸造的 40%。' + (B.use || '') });
                if (kind === 'knife') MB_KNIFE[cold] = Object.assign({}, MB_KNIFE[base], { dura: Math.round(MB_KNIFE[base].dura * 0.4), name: add[cold].name });
                else TL_TOOL[cold] = Object.assign({}, TL_TOOL[base], { dura: Math.round(TL_TOOL[base].dura * 0.4) });
                add['broken_' + cold] = { name: '坏了的' + add[cold].name, col: 0x616161, use: '工作台：回收一半主料，或者加 1 胶水修好' };
                IND_CRAFT.push({ out: 'bronze', n: 1, in: { ['broken_' + cold]: 1 }, hard: true, off: true }, { out: cold, fix: true, in: { ['broken_' + cold]: 1, glue: 1 }, hard: true });
                IND_CRAFT.forEach(function (r) { if (r.out === base && r.need === 'hammer' && !r.fix) r.out = cold; });   // 冷锻配方出冷锻的
            });
            Object.assign(IND_ITEMS_RAW, add);
        })();
        // 任务 133：草和木制品能当燃料。干木头 60，湿木头 40。纯木头做的东西按木头那部分算一半（木头 30），带金属头石头头的工具、穿的东西不能烧
        (function () {
            let set = function (k, f, note) { let d = IND_ITEMS_RAW[k]; if (!d) return; d.fuel = f; if (note && !/能烧/.test(d.use || '')) d.use = (d.use ? d.use + '。' : '') + note; };
            set('grass', 8, '能烧，烧得很快'); set('twig', 15, '能烧'); set('rope', 15, '能烧'); set('handle', 30, '能烧');
            IND_ITEMS_RAW.wood.fuel = 40;
            let W = { wood: 30, handle: 15, rope: 7, grass: 4, twig: 7 }, seen = {};
            IND_CRAFT.forEach(function (r) {
                let o = r.out; if (!o || r.fix || r.poison || r.off || seen[o] || !IND_ITEMS_RAW[o] || IND_ITEMS_RAW[o].fuel || IND_ITEMS_RAW[o].wear || /^(rope|handle)$/.test(o)) return;
                let ks = Object.keys(r.in); if (!ks.length || !ks.every(function (q) { return W[q]; })) return;
                if (!r.in.wood && !r.in.handle) return;
                let f = 0; ks.forEach(function (q) { f += W[q] * r.in[q]; }); f = Math.round(f / (r.n || 1));
                if (f > 0) { seen[o] = 1; IND_ITEMS_RAW[o].fuel = f; IND_ITEMS_RAW[o].fuelMade = true; }
            });
        })();
        const IND_STOVE_FUEL0 = indStoveFuel;
        indStoveFuel = function (k, ok) {
            if (ind && ind.bag[k] && IND_ITEMS[k] && IND_ITEMS[k].fuelMade && !ok) {
                showSysModal('烧掉', indName(k) + '是做好的东西，真的烧掉吗', [{ label: '烧掉', color: '#d84315', onClick: function () { if (ind) indStoveFuel(k, true); } }, { label: '不烧', color: '#757575', onClick: function () { } }]);
                return;
            }
            return IND_STOVE_FUEL0(k);
        };

        // 任务 135：炉子的燃料和炉料分开，一次加柴 ≥ 5 个先确认，能取出没烧完的燃料，煤放进炉料没配方用就不收，做东西现有 ≥ 50 个先问
        const IND_STOVE_FUEL1 = indStoveFuel;
        indStoveFuel = function (k, ok) {
            if (!ind || !ind.bag[k]) return;
            let S = indCookCur().C; if (S.fuel <= 0) { S.fuelItems = {}; S.fuelAdd = 0; }
            let r = IND_STOVE_FUEL1(k, ok);
            return r;
        };
        function indFuelNote(k, n) { let S = indCookCur().C; S.fuelItems = S.fuelItems || {}; S.fuelItems[k] = (S.fuelItems[k] || 0) + n; S.fuelAdd = (S.fuelAdd || 0) + (IND_ITEMS[k].fuel || 0) * n; }
        const IND_PUTN0 = indPutN;
        indPutN = function (kind, id, k, n) {
            if (ind && kind === 'fuel' && IND_ITEMS[k] && IND_ITEMS[k].fuel && !indContOf(k)) {
                let have = ind.bag[k] || 0, m = n === 'all' ? have : Math.min(n, have);
                if (m >= 5 && !(ind.fuelOk && ind.fuelOk.k === k && ind.fuelOk.n === m)) {
                    showSysModal('加柴', '一次放进去 ' + m + ' 个' + indName(k, true) + '，确定吗', [{ label: '放进去', color: '#d84315', onClick: function () { if (ind) { ind.fuelOk = { k: k, n: m }; indPutN('fuel', id, k, m); ind.fuelOk = null; } } }, { label: '不放', color: '#757575', onClick: function () { } }]);
                    return false;
                }
                let b0 = ind.bag[k] || 0, r = IND_PUTN0(kind, id, k, n), added = b0 - (ind.bag[k] || 0); if (added > 0) indFuelNote(k, added);
                return r;
            }
            return IND_PUTN0(kind, id, k, n);
        };
        // 取出燃料：没烧完的按比例还回背包，炉子立刻没燃料，火灭
        function indStoveFuelOut() {
            let c = indCookCur(), S = c.C, items = S.fuelItems || {}, add = S.fuelAdd || 0;
            if (!(S.fuel > 0) || add <= 0) { indFlash('炉子里没有能取的燃料'); return; }
            let ratio = Math.min(1, S.fuel / add), got = [];
            Object.keys(items).forEach(function (k) { let n = Math.floor(items[k] * ratio + 1e-9); if (n > 0) { let r = indBoxAdd(k, n); got.push(indName(k, true) + ' ' + n); } });
            S.fuel = 0; S.fuelItems = {}; S.fuelAdd = 0; S.fire = 0;
            indSave(); indFlash(got.length ? '取出了燃料：' + got.join('、') : '没烧完的不够一个'); indPanelStove();
        }
        const IND_STOVEPUT0 = indStovePut;
        indStovePut = function (k, n) {
            if (ind && ind.bag[k] && IND_ITEMS[k]) {
                let S = indCookCur().C, red = k === 'coal' || k === 'charcoal' || k === 'char', usedByAny = IND_RECIPES.some(function (r) { return r.in[k]; });
                if (red) {
                    let pool = {}; Object.keys(S.items).forEach(function (q) { pool[q] = (pool[q] || 0) + S.items[q]; }); pool[k] = 1;
                    if (!IND_RECIPES.some(function (r) { return r.in[k] && Object.keys(r.in).every(function (q) { return q === k || (pool[q] || 0) > 0 || (ind.bag[q] || 0) > 0; }); })) { indFlash('这个配方用不上' + indName(k, true)); return; }
                } else if (IND_ITEMS[k].fuel && !usedByAny && !indContOf(k)) { indFlash('这个不能放进炉料，要烧用加柴'); return; }
            }
            return IND_STOVEPUT0(k, n);
        };
        const IND_CRAFT0 = indCraft;
        indCraft = function (i) {
            let r = IND_CRAFT[i];
            if (ind && r && r.out && (ind.bag[r.out] || 0) >= 50 && indCraftCan(r)) {
                ind.craftOk = ind.craftOk || {};
                if (!ind.craftOk[r.out]) { showSysModal('再做吗', '已经有 ' + ind.bag[r.out] + ' 个' + indName(r.out, true) + '了，再做吗', [{ label: '再做', color: '#43a047', onClick: function () { if (ind) { ind.craftOk[r.out] = true; indCraft(i); } } }, { label: '不做', color: '#757575', onClick: function () { } }]); return false; }
            }
            return IND_CRAFT0(i);
        };
        function indPourOilPanel(k) { let c = indCookCur(); if (!c || !ind.bag[k]) return; ckPourOil(k, { kind: 'funnel', o: c }); indSave(); indPanelStove(); }

        // 任务 140：关掉面板以后自动把鼠标锁回来。Esc 不算用户操作，Chrome 会拒绝，那就等下一次按键补锁；点击那一下本来就只负责锁（没锁的时候 onMouse 不动作）
        function indRelock() {
            if (!ind || ind.over || ind.paused || ind.dead || ind.panel || ind.tutOpen || ind.loading || (typeof gState !== 'undefined' && gState.control === 'pad')) return false;
            if (document.pointerLockElement || document.getElementById('ind-moonpick') || document.getElementById('ind-pause') || document.getElementById('tut-cards')) { ind.relockWait = false; return false; }
            let m = document.getElementById('sys-modal'); if (m && !m.classList.contains('hidden')) return false;
            safeLockPointer(); ind.relockWait = true; ind.relockN = (ind.relockN || 0) + 1; return true;
        }
        function indRelockSoon() { setTimeout(function () { indRelock(); }, 0); }
        document.addEventListener('pointerlockchange', function () { if (document.pointerLockElement && typeof ind !== 'undefined' && ind) ind.relockWait = false; });
