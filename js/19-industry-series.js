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
        IND_ITEMS_RAW.dev_furnace.use = '放炉子 3 米内到 1800°C，要 24 V 串联';   // 任务 152
        // 任务 149：风箱不靠皮也能做。木箱活塞风箱（战国就有），羊毛当封条。配方加在表的最后，皮囊风箱的老配方不动
        IND_CRAFT.push({ out: 'bellows', in: { wood: 10, rope: 12, wool: 4, ingot_cu: 2, clay: 4 }, hard: true, tag: '活塞做法，羊毛封条，不用皮' });   // 作者 11-13 要的（任务 149：皮革掉得太少）
        // 任务 153：炉子里的配方时间统一减半，最低 5 秒；升温速度也提高了（灶台、小熔炉、石炉每秒 100°C，大窑 30°C）。进行中的进度在 ckFix 里按比例换算
        const CK_TIME_OLD = IND_RECIPES.map(function (r) { return r.time; });
        IND_RECIPES.forEach(function (r) { r.time = Math.max(5, Math.round(r.time * 0.5 * 10) / 10); });
        IND_RECIPES.forEach(function (r) { if (r.out.hot_steel && r.in.ingot_fe && !r.in.b_n2 && !r.in.b_ar && !r.in.tank_lox) r.time = 20; });   // 任务 154 + 153：渗碳钢 60 秒减半还是 30，压到 20，主线上单次烧制 ≤ 20 秒
        // 任务 158：石锤，一开始就能做。青铜工具冷锻要锤子，铁钢工具要锤子，石锤铁锤都行
        IND_ITEMS_RAW.hammer_stone = { name: '石锤', col: 0x9e9e9e, use: '放在背包里，工作台才打得了青铜、铁、钢的工具，不会用掉' };
        IND_CRAFT.push({ out: 'hammer_stone', in: { stone: 2, wood: 1 }, hard: true });
        // 任务 158 补充：石锤冷锻的青铜工具单独一个 key（xx_cold），耐久是铸造的 40%，其余跟青铜的一样（挖矿档位、加成、干活时间）。铸造的不变
        (function () {
            let N = { pick: '镐', axe: '斧', shovel: '铲', shears: '剪刀', knife: '刀' }, add = {};
            Object.keys(N).forEach(function (kind) {
                let base = kind + '_bronze', cold = kind + '_cold', B = IND_ITEMS_RAW[base]; if (!B) return;
                add[cold] = Object.assign({}, B, { name: '冷锻青铜' + N[kind], use: '冷锻的，耐久只有 40%' });
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
        // 任务 137：皮革。皮 + 草木灰 + 一桶水在灶台低温熏 30 秒（悠闲工作台直接做）。风箱、皮鞋、自行车座和轮子原地改成要皮革，人造革的备选还是原来的数量；新增皮背包 +9 格
        (function () {
            IND_ITEMS_RAW.leather = { name: '皮革', col: 0x8d5a3b, use: '皮鞣过的，做风箱、皮背包、皮鞋、自行车座和轮子' };
            IND_ITEMS_RAW.hide.use = '鞣成皮革才好用：皮 + 草木灰 + 一桶水，灶台低温熏';
            IND_RECIPES.push({ in: { hide: 1, ash: 1, water_raw: 1 }, out: { leather: 1, bucket: 1 }, minT: 60, time: 30, burnT: 250, cls: 'bulk', hard: true, pri: true });   // 小火 200°C 熏不会焦
            IND_CRAFT.push({ out: 'leather', in: { hide: 1, ash: 1 }, casual: true });
            IND_CRAFT.forEach(function (r) { if (r.in && r.in.hide && !r.leather && !r.fix && !r.poison && /^(bellows|shoe_leather|wheel|seat)$/.test(r.out)) { r.in = Object.keys(r.in).reduce(function (o, k) { o[k === 'hide' ? 'leather' : k] = r.in[k]; return o; }, {}); } });
            IND_ITEMS_RAW.pack_leather = { name: '皮背包', col: 0x8d5a3b, wear: 'back', slots: 9, warm: 0, use: '戴背上，背包 +9 格，脱下前先清空' };
            IND_CRAFT.push({ out: 'pack_leather', in: { leather: 4, rope: 3 }, hard: true }, { out: 'pack_leather', in: { pleather: 4, rope: 3 }, hard: true, leather: true });
        })();
        // 任务 142 第一批：绷带顶回血药；电炉电解槽要钢；粉碎机把矿磨成粉，粉炼出的锭多一半
        (function () {
            IND_ITEMS_RAW.bandage = { name: '绷带', col: 0xeceff1, potion: 'heal', use: '右键用：20 秒内回 60 点血，也能治拉肚子，用掉就没了' };
            IND_CRAFT.push({ out: 'bandage', in: { cotton: 2, ash: 1 }, hard: true });
            IND_RECIPES.forEach(function (r) { if (r.out && r.out.potion_speed) r.off = true; });   // 速度药不再出现在新配方，已有的仍能喝
            IND_RECIPES.forEach(function (r) { if (r.out && r.out.potion_heal) r.off = true; });
            IND_CRAFT.forEach(function (r) { if (r.out === 'dev_furnace' && !r.in.steel) r.in = Object.assign({}, r.in, { steel: 2 }); if (r.out === 'dev_el' && !r.in.steel) r.in = Object.assign({}, r.in, { steel: 2 }); });
            let M = { cu: '铜', zn: '锌', sn: '锡', fe: '铁', ni: '镍', pb: '铅', al: '铝' }, add = {};
            Object.keys(M).forEach(function (m) { if (!IND_ITEMS_RAW['ore_' + m]) return; add['dust_' + m] = { name: M[m] + '矿粉', col: IND_ITEMS_RAW['ore_' + m].col, use: '粉碎机磨的，加木炭炼，比直接炼矿多一半' }; });
            Object.keys(add).forEach(function (k) { add[k].later = '粉碎机磨出来的，体检看不到'; });
            Object.assign(IND_ITEMS_RAW, add);
            let base = IND_RECIPES.filter(function (r) { return r.cls === 'smelt' && r.in.charcoal === 1 && Object.keys(r.in).length === 2 && Object.keys(r.in).some(function (k) { return /^ore_(cu|zn|sn|fe|ni|pb|al)$/.test(k); }); });
            base.forEach(function (r) {
                let ok = Object.keys(r.in).filter(function (k) { return /^ore_/.test(k); })[0], m = ok.slice(4), h = Object.keys(r.out)[0]; if (!add['dust_' + m]) return;
                ['charcoal', 'coal', 'char'].forEach(function (c) { IND_RECIPES.push({ in: { ['dust_' + m]: 2, [c]: 2 }, out: { [h]: 3 }, cls: 'smelt', minT: r.minT, time: r.time, hard: true }); });
            });
            let busy0 = IND_DEV_BUSY.crusher; IND_DEV_BUSY.crusher = function (d) { return busy0(d) || Object.keys(add).some(function (k) { return (d.st['ore_' + k.slice(5)] || 0) > 0; }); };
            let tick0 = IND_DEV_TICK.crusher; IND_DEV_TICK.crusher = function (d, dt) {
                if (d.pw && !((d.st.ore_u || 0) > 0 || (d.st.bone || 0) > 0 || (d.st.wheat || 0) >= 2)) {
                    let k = Object.keys(add).filter(function (q) { return (d.st['ore_' + q.slice(5)] || 0) > 0; })[0];
                    if (k) { d.ct = (d.ct || 0) + dt; if (d.ct >= NK.crushT) { d.ct = 0; let o = 'ore_' + k.slice(5); d.st[o]--; if (d.st[o] <= 0) delete d.st[o]; d.st[k] = (d.st[k] || 0) + 1; if (ind.panel === 'crusher') ind.panelDirty = true; indSave(); } return; }
                }
                return tick0(d, dt);
            };
        })();
        const IND_PWDRINK0 = pwDrink;
        pwDrink = function (k) { let had = ind.bag.bottle || 0, r = IND_PWDRINK0(k); if (k === 'bandage' && (ind.bag.bottle || 0) > had) indBagDel('bottle', 1); return r; };   // 绷带不还瓶子
        // 任务 142 第二批：钠扔水出氢气，核废料封进玻璃，氖灯氪灯泡，泥土加草做墙，羊毛做毛毡垫，草喂羊牛
        (function () {
            IND_ITEMS_RAW.glass_block = { name: '玻璃固化块', col: 0x80cbc4, use: '核废料封在玻璃里，凉了不再扩散，当建材放着' };
            IND_CRAFT.push({ out: 'glass_block', in: { nuclear_waste: 1, glass_plate: 2 }, hard: true });
            IND_ITEMS_RAW.bulb_ne = { later: '用氖气做的，体检看不到', name: '氖灯', col: 0xff7043, wear: 'head', warm: 0, use: '戴在头上，矿洞里照亮，橙红色，耗电比灯泡少三成' };
            IND_ITEMS_RAW.bulb_kr = { later: '用氪气做的，体检看不到', name: '氪灯泡', col: 0xb3e5fc, wear: 'head', warm: 0, use: '戴在头上，矿洞里照亮，白光，耗电只有灯泡的四成' };
            IND_CRAFT.push({ out: 'bulb_ne', in: { bulb_dead: 1, battery_li: 1, b_ne: 1 }, back: { bottle: 1 }, hard: true }, { out: 'bulb_kr', in: { bulb_dead: 1, battery_li: 1, b_kr: 1 }, back: { bottle: 1 }, hard: true });
            IND_CRAFT.push({ out: 'stone_wall', in: { dirt: 4, grass: 2 }, hard: true });   // 土坯墙：做出来也是那件石墙，便宜
            IND_ITEMS_RAW.felt_pad = { name: '毛毡垫', col: 0xd7ccc8, wear: 'foot', warm: 0, chillCut: 2, use: '垫在脚下，保暖，冷的门槛降 2 度，跟鞋二选一' };
            IND_CRAFT.push({ out: 'felt_pad', in: { wool: 3, rope: 1 }, hard: true });
            IND_ANIMALS.sheep.food.push('grass'); IND_ANIMALS.cow.food.push('grass');
            IND_ITEMS_RAW.grass.later = '地上撒着捡的，体检看不到';
        })();
        function cvBulbIs() { let h = ind.base.wear.head; return h === 'bulb' || h === 'bulb_ar' || h === 'bulb_ne' || h === 'bulb_kr'; }
        function cvBulbDraw() { return CV.bulbDraw * ({ bulb_ar: 0.5, bulb_ne: 0.7, bulb_kr: 0.4 }[ind.base.wear.head] || 1); }
        // 钠对着水池或装水的桶右键：先问，确定了放出氢气（要有空瓶接，没有就不让）
        const IND_USE0 = indUse;
        indUse = function () {
            if (ind && !ind.paused && !ind.panel && !ind.over && !ind.dead && indSel() === 'sodium') {
                let a = indAim(), kc = null; Object.keys(ind.bag).forEach(function (q) { let c = indContOf(q); if (c && c.base && /^water/.test(c.base)) kc = q; });
                if ((a && a.kind === 'pool') || kc) {
                    if (!(ind.bag.bottle > 0)) { indFlash('钠遇水放氢气，要有空瓶接'); return false; }
                    showSysModal('钠扔进水里', '钠遇水会放出氢气，旁边有火就炸，要远离火。确定吗', [{ label: '扔', color: '#d84315', onClick: function () { if (ind && ind.bag.sodium > 0 && ind.bag.bottle > 0) { indBagDel('sodium', 1); indBagDel('bottle', 1); indGive('b_h2', 1); indFlash('钠遇水冒出氢气，装了一瓶'); } } }, { label: '不扔', color: '#757575', onClick: function () { } }]);
                    return true;
                }
            }
            return IND_USE0.apply(this, arguments);
        };
        // 任务 120：胶水改成现实做法（皮加水煮、松脂加木炭），黏液老配方关掉；锤子加对应的锭给金属工具补耐久，铁钢要在点着的炉子旁；断了的也能补
        (function () {
            IND_RECIPES.forEach(function (r) { if (r.in && r.in.goo === 2 && r.out && r.out.glue) r.off = true; });
            IND_RECIPES.push({ in: { hide: 1, water_raw: 1 }, out: { glue: 2, bucket: 1 }, minT: 100, time: 10, cls: 'smelt', hard: true }, { in: { resin: 2, charcoal: 1 }, out: { glue: 2 }, minT: 150, time: 15, cls: 'smelt', hard: true });
            IND_CRAFT.push({ out: 'glue', n: 1, in: { hide: 1, ash: 1 }, casual: true });
        })();
        function rpHammerHave() { return (ind.bag.hammer || 0) > 0 || (ind.bag.hammer_stone || 0) > 0; }
        function rpHotNear() { return indCooks().some(function (c) { return c.C.temp >= 800 && Math.hypot(c.x - ind.p.x, c.z - ind.p.z) <= 3 + (IND_COOK[c.ty] ? IND_COOK[c.ty].r : 0); }); }
        function rpMendInfo(k) {   // 这把工具能不能用锤子补：返回 { ing: 用哪种锭, n: 主料份数, hot: 要不要热炉 } 或 null
            let kk = k.replace(/^broken_/, ''), T = typeof TL_TOOL !== 'undefined' && TL_TOOL[kk], K = MB_KNIFE[kk];
            let tier = T ? T.tier : K ? (kk.indexOf('_cold') > 0 ? 'bronze' : kk === 'knife' ? 'stone' : kk.slice(6)) : null; if (!tier || tier === 'stone' || tier === 'wood' || tier === 'diamond') return null;
            let back = (T && T.back) || (K && K.back && K.back[0]) || TL_TIER[tier].back, n = 2;
            IND_CRAFT.forEach(function (r) { if (r.out === kk && !r.fix && r.in && r.in[back] > 0) n = r.in[back]; });
            return { ing: back, n: n, hot: tier === 'iron' || tier === 'steel', key: kk };
        }
        function rpMend(k) {
            let m = rpMendInfo(k), broken = /^broken_/.test(k);
            if (!m || !(ind.bag[k] > 0)) return false;
            if (!rpHammerHave()) { indFlash('要有锤子'); return false; }
            if (m.hot && !rpHotNear()) { indFlash('铁要烧红了才能补，找个点着的炉子'); return false; }
            if (!(ind.bag[m.ing] > 0)) { indFlash('要 1 个' + indName(m.ing, true)); return false; }
            let max = mbMax(m.key), add = Math.max(1, Math.round(max * 0.5 / m.n));
            if (!broken) { let left = mbDura(m.key); if (left >= max) { indFlash('已经满了'); return false; } indBagDel(m.ing, 1); ind.base.dura[m.key] = Math.min(max, left + add); indFlash('补了 ' + add + '，现在 ' + ind.base.dura[m.key] + ' / ' + max); }
            else { if (indFits(ind.bag, indBagSlots(), m.key, 1) < 1 && ind.bag[k] < 1) return false; indBagDel(m.ing, 1); indBagDel(k, 1); indBagAdd(m.key, 1); ind.base.dura = ind.base.dura || {}; ind.base.dura[m.key] = Math.min(max, add); indFlash('修好了，耐久 ' + ind.base.dura[m.key] + ' / ' + max); }
            indSave(); ind.hudSig = ''; if (ind.panel === 'mend') indPanelMend(); return true;
        }
        function indPanelMend() {
            if (!ind) return;
            let rows = Object.keys(ind.bag).filter(function (k) { return rpMendInfo(k) && ind.bag[k] > 0; }).map(function (k) {
                let m = rpMendInfo(k), broken = /^broken_/.test(k), d = broken ? '断了' : mbDura(m.key) + ' / ' + mbMax(m.key);
                return indRow(indName(k) + '　' + d + '<br><small style="color:#888">要 1 个' + indName(m.ing, true) + (m.hot ? '，旁边要有点着的炉子' : '') + '</small>', '<button style="' + IND_BTN + '" onclick="rpMend(\'' + k + '\')">用锤子补</button>');
            }).join('') || '<div style="color:#999;padding:6px 0;">身上没有能补的金属工具</div>';
            indPanelShow('mend', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">锤子修工具</div><div style="color:#666;margin-bottom:4px;">身上有锤子，拿对应的锭补，一个锭补回一部分，铁和钢要在点着的炉子旁</div>' + rows + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
        const IND_BENCH0 = indPanelBench;
        indPanelBench = function () { IND_BENCH0(); let p = document.getElementById('ind-panel'); if (p && ind.panel === 'bench' && rpHammerHave() && !document.getElementById('ind-mend-btn')) { let b = document.createElement('div'); b.style.cssText = 'text-align:right;margin-bottom:4px;'; b.innerHTML = '<button id="ind-mend-btn" style="' + IND_BTN + 'background:#546e7a;" onclick="indPanelMend()">锤子修工具</button>'; p.insertBefore(b, p.firstChild); } };
