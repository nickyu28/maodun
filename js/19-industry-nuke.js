// 猫盾工业 · 第 6 阶段：核和原子弹（只给硬核）
// 接在 19-industry.js 后面，用它里面的函数和表：往物品、配方、设备、资源点的表里加东西，再挂几个钩子（动态物品、设备面板、辐射、爆炸）。
// 数字都按 docs/queue-code2.md 的 Q 条写；没写到的按最贴近现实、最保守的做。
        // ── 丰度台阶：0.7 → 1.05 → 1.6 → 2.4 → 3.5 → 5（离心机每转一轮上一台阶，5% 封顶；要 3% 以上才能做芯块） ──
        const NK_LV = [0.7, 1.05, 1.6, 2.4, 3.5, 5], NK_LV_MIN = 4, NK_LV_MAX = NK_LV.length - 1;
        // 辐射：strong 强（每秒 2 血）、weak 弱（每秒 0.2 血）、vweak 很弱（不扣血，盖格计数器能读到）
        const NK_RAD = { strong: 2, weak: 0.2, vweak: 0 }, NK_RAD_READ = { strong: 2, weak: 0.2, vweak: 0.02 };
        const NK = { crushT: 10, centriT: 60, rodDays: 2, rodHeat: 100, coolWater: 250, coolAir: 20, rate: 0.1, maxRate: 10, amb: 20, turbineT: 250, turbineR: 3, waterR: 6, meltT: 400, meltS: 20, zoneDays: 3, apron: 0.5, bombT: 30, bombR: 40, bombNear: 1000, bombClose: 10, powderR: 2 };

        // ── 动态物品：六氟化铀罐 uf6:台阶、二氧化铀芯块 pellet:台阶、燃料棒 rod:台阶 或 rod:台阶:已烧百分比 ──
        function nkLvTxt(i) { return NK_LV[i] + '%'; }
        function nkLvOf(s) { return /^\d+$/.test(s) && +s <= NK_LV_MAX ? +s : -1; }
        IND_DYN.push({ prefix: 'uf6:', get: function (k) { let i = nkLvOf(k.slice(4)); return i < 0 ? undefined : { name: '六氟化铀罐（丰度 ' + nkLvTxt(i) + '）', col: 0xcddc39, rad: 'vweak', use: i < NK_LV_MAX ? '放进离心机' : '到头了' }; } });
        IND_DYN.push({ prefix: 'pellet:', get: function (k) { let i = nkLvOf(k.slice(7)); return i < 0 ? undefined : { name: '二氧化铀芯块（丰度 ' + nkLvTxt(i) + '）', col: 0x9e9d24, rad: 'weak', use: '做燃料棒' }; } });
        IND_DYN.push({ prefix: 'rod:', get: function (k) {
            let m = /^rod:(\d+)(?::(\d+))?$/.exec(k); if (!m) return undefined;
            let i = nkLvOf(m[1]), b = m[2] === undefined ? 0 : +m[2]; if (i < 0 || b > 99) return undefined;
            return { name: '燃料棒（丰度 ' + nkLvTxt(i) + (b ? '，已烧 ' + b + '%' : '') + '）', col: 0xafb42b, rad: 'weak', use: '放进反应堆' };
        } });
        function nkRod(k) { let m = /^rod:(\d+)(?::(\d+))?$/.exec(k); return m ? { i: +m[1], b: m[2] === undefined ? 0 : +m[2] / 100 } : null; }
        function nkRodKey(r) { let b = Math.min(99, Math.floor(r.b * 100)); return 'rod:' + r.i + (b > 0 ? ':' + b : ''); }

        // ── 物品 ──
        Object.assign(IND_ITEMS_RAW, {
            fluorite: { name: '萤石', col: 0x80cbc4 }, ore_pb: { name: '方铅矿', col: 0x546e7a },
            ingot_pb: { name: '铅锭', col: 0x78909c }, hot_pb: { name: '铅锭（烫）', col: 0xff8a65, hot: 'ingot_pb', needTool: 'tongs' },
            b_so2: { name: '二氧化硫瓶', col: 0xfff59d, poison: '二氧化硫', use: '做硫酸（放掉是毒气）' },
            b_h2so4: { name: '硫酸瓶', col: 0xffee58, corrosive: true },
            b_hf: { name: '氟化氢瓶', col: 0xb2dfdb },
            ore_u_dust: { name: '铀矿粉', col: 0xaed581, rad: 'vweak' }, yellowcake: { name: '黄饼', col: 0xfdd835, rad: 'vweak' },
            uf6_dep: { name: '贫铀罐（丰度 0.3%）', col: 0x9e9e9e, rad: 'vweak', useLater: '后面的阶段' },
            rod_spent: { name: '乏燃料棒', col: 0x33691e, rad: 'strong', use: '后处理出钚（放在铅箱里）' },
            plutonium: { name: '钚', col: 0x7b1fa2, rad: 'strong', use: '做原子弹（放在铅箱里）' },
            nuclear_waste: { name: '核废料', col: 0x2e7d32, rad: 'strong', useLater: '后面的阶段' },
            saltpeter: { name: '硝石', col: 0xeceff1 }, gunpowder: { name: '火药', col: 0x424242, explosive: true, use: '碰到爆炸或放进炉子就炸' },
            nuke: { name: '原子弹', col: 0x455a64, nuke: true, use: '右键放下，左键启动，30 秒后爆炸' },
            geiger: { name: '盖格计数器', col: 0xfdd835, use: '拿在手上显示辐射强度' },
            lead_apron: { name: '铅围裙', col: 0x607d8b, wear: 'body', warm: 0, radcut: NK.apron, heavy: 0.8, use: '辐射伤害少一半，走路 ×0.8' },
            chest_lead: { name: '铅箱', col: 0x546e7a, furn: 'chest', lead: true },
            dev_crusher: { name: '粉碎机', col: 0x8d6e63, dev: 'crusher' }, dev_centrifuge: { name: '离心机', col: 0x90a4ae, dev: 'centrifuge' },
            dev_reactor: { name: '反应堆', col: 0xb71c1c, dev: 'reactor' }, dev_turbine: { name: '汽轮发电机', col: 0x1976d2, dev: 'turbine' }
        });
        IND_ITEMS_RAW.ore_u.use = '放进粉碎机'; delete IND_ITEMS_RAW.ore_u.useLater; IND_ITEMS_RAW.ore_u.rad = 'vweak';
        Object.assign(IND_ELEM_OF, { ingot_pb: 82, b_hf: 9, plutonium: 94 });

        // ── 资源点：萤石、方铅矿成片（山地、古老岩层），硝石只在盐湖沙漠（空手能挖） ──
        Object.assign(IND_NODES, { fluorite: { give: [1, 2], tool: 1 }, ore_pb: { give: [1, 2], tool: 1 }, saltpeter: { give: [1, 3], tool: 0 } });
        Object.assign(IND_ORE_NODES, { fluorite: 1, ore_pb: 1, saltpeter: 1 });
        IND_BIOMES.mountain.res.fluorite = 1; IND_BIOMES.mountain.res.ore_pb = 2;
        IND_BIOMES.ancient.res.fluorite = 2; IND_BIOMES.desert.res.saltpeter = 2;

        // ── 配方（炉子上；硬核） ──
        IND_RECIPES.push(
            { in: { ore_pb: 2 }, out: { hot_pb: 2, sulfur: 1 }, cls: 'smelt', minT: 327, time: 15, hard: true },   // 2 份方铅矿 → 2 铅锭 + 1 硫
            { in: { sulfur: 1, b_o2: 1 }, out: { b_so2: 1 }, cls: 'chem', minT: 400, time: 10, hard: true },
            { in: { b_so2: 1, b_o2: 1, water_raw: 1 }, out: { b_h2so4: 1, bottle: 1, bucket: 1 }, cls: 'chem', minT: 450, time: 15, hard: true },
            { in: { ore_u_dust: 2, b_h2so4: 1, naoh: 1 }, out: { yellowcake: 1, bottle: 1 }, cls: 'chem', minT: 80, time: 30, hard: true },
            { in: { fluorite: 1, b_h2so4: 1 }, out: { b_hf: 1 }, cls: 'chem', minT: 250, time: 15, hard: true },
            { in: { yellowcake: 1, b_hf: 3 }, out: { 'uf6:0': 1, bottle: 3 }, cls: 'chem', minT: 400, time: 30, hard: true },
            { in: { 'uf6:4': 1, b_h2: 2 }, out: { 'pellet:4': 1, bottle: 2 }, cls: 'chem', minT: 600, time: 20, hard: true },
            { in: { 'uf6:5': 1, b_h2: 2 }, out: { 'pellet:5': 1, bottle: 2 }, cls: 'chem', minT: 600, time: 20, hard: true },
            { in: { rod_spent: 1, b_h2so4: 2 }, out: { plutonium: 1, nuclear_waste: 1, bottle: 2 }, cls: 'chem', minT: 300, time: 40, hard: true }
        );
        // ── 配方（工作台；硬核） ──
        IND_CRAFT.push(
            { out: 'dev_crusher', in: { steel: 4, wire: 2 }, hard: true }, { out: 'dev_centrifuge', in: { steel: 6, wire: 4, brass: 2 }, hard: true },
            { out: 'rod:4', in: { 'pellet:4': 2, steel: 2 }, hard: true }, { out: 'rod:5', in: { 'pellet:5': 2, steel: 2 }, hard: true },
            { out: 'dev_reactor', in: { steel: 20, brick: 30, ingot_pb: 10, wire: 10, glass_plate: 2 }, hard: true },
            { out: 'dev_turbine', in: { steel: 10, wire: 6, brass: 4 }, hard: true },
            { out: 'chest_lead', in: { ingot_pb: 8 }, hard: true }, { out: 'geiger', in: { wire: 2, bottle: 1, battery: 1 }, hard: true },
            { out: 'lead_apron', in: { ingot_pb: 6, yarn: 2 }, hard: true },
            { out: 'gunpowder', n: 4, in: { sulfur: 1, charcoal: 1, saltpeter: 3 }, hard: true },
            { out: 'nuke', in: { plutonium: 4, gunpowder: 20, steel: 10, wire: 4, dev_bank: 1 }, hard: true }
        );

        // ── 设备 ──
        Object.assign(IND_DEVS, {
            crusher: { name: '粉碎机', col: 0x8d6e63, rated: 12, minV: 6, draw: 2, size: [1.2, 1, 1.2] },
            centrifuge: { name: '离心机', col: 0x90a4ae, rated: 24, minV: 18, draw: 8, size: [1.4, 1.6, 1.4] },
            turbine: { name: '汽轮发电机', col: 0x1976d2, src: true, volt: 48, size: [1.6, 1.4, 1.6] },
            reactor: { name: '反应堆', col: 0xb71c1c, always: true, nowire: true, rated: 1e9, minV: 1e9, draw: 0, size: [3, 2, 3] }
        });
        // 粉碎机：左键打开放铀矿，通电（≥ 6 V，额定 12 V）有活干时每秒 2 U，每 10 秒 1 铀矿 → 2 铀矿粉
        IND_DEV_BUSY.crusher = function (d) { return (d.st.ore_u || 0) > 0; };
        IND_DEV_TICK.crusher = function (d, dt) {
            if (!d.pw) { d.ct = 0; return; }
            d.ct = (d.ct || 0) + dt;
            if (d.ct < NK.crushT) return;
            d.ct = 0;
            if (!(d.st.ore_u > 0)) return;
            d.st.ore_u--; if (d.st.ore_u <= 0) delete d.st.ore_u;
            d.st.ore_u_dust = (d.st.ore_u_dust || 0) + 2;
            if (ind.panel === 'crusher') ind.panelDirty = true;
            indSave();
        };
        // 离心机：放 2 个丰度一样的六氟化铀罐，通电（≥ 18 V，额定 24 V）有活干时每秒 8 U，60 秒出 1 个丰度上一台阶的罐 + 1 个贫铀罐；5% 封顶
        function nkCentriLv(d) { for (let i = 0; i < NK_LV_MAX; i++) if ((d.st['uf6:' + i] || 0) >= 2) return i; return -1; }
        IND_DEV_BUSY.centrifuge = function (d) { return nkCentriLv(d) >= 0; };
        IND_DEV_TICK.centrifuge = function (d, dt) {
            let lv = nkCentriLv(d);
            if (!d.pw || lv < 0 || (d.cl !== undefined && d.cl !== lv)) { d.ct = 0; d.cl = lv >= 0 ? lv : undefined; if (!d.pw || lv < 0) return; }
            d.cl = lv; d.ct = (d.ct || 0) + dt;
            if (d.ct < NK.centriT) return;
            d.ct = 0;
            let k = 'uf6:' + lv; d.st[k] -= 2; if (d.st[k] <= 0) delete d.st[k];
            d.st['uf6:' + (lv + 1)] = (d.st['uf6:' + (lv + 1)] || 0) + 1; d.st.uf6_dep = (d.st.uf6_dep || 0) + 1;
            if (ind.panel === 'centrifuge') ind.panelDirty = true;
            indSave();
        };
        // 汽轮发电机：放在反应堆 3 米内，反应堆 ≥ 250°C 时输出 48 V，不限电量
        IND_DEV_VOLT.turbine = function (d) { return ind.base.devs.some(function (r) { return r.ty === 'reactor' && r.T >= NK.turbineT && Math.hypot(r.x - d.x, r.z - d.z) <= NK.turbineR + 1.5; }) ? IND_DEVS.turbine.volt : 0; };
        // 反应堆：4 个燃料棒位、控制棒插入比例（默认 100% = 停堆）；发热 = 棒数 × (1 − 插入) × 100；水池或开着的水泵 6 米内每秒带走 250，没水 20；温度每秒最多变 10°C
        IND_DEV_FIX.reactor = function (d) {
            if (!Array.isArray(d.rods)) d.rods = [];
            d.rods = d.rods.filter(function (r) { return r && (r.spent || (r.i >= 0 && r.i <= NK_LV_MAX)); }).slice(0, 4).map(function (r) { return r.spent ? { spent: true } : { i: r.i | 0, b: indNum(r.b, 0, 0, 1) }; });
            d.ctl = indNum(d.ctl, 1, 0, 1); d.T = indNum(d.T, NK.amb, NK.amb, 2000); d.melt = indNum(d.melt, 0, 0, 100);
        };
        function nkReactorHeat(d) { let n = 0; d.rods.forEach(function (r) { if (!r.spent) n++; }); return n * (1 - d.ctl) * NK.rodHeat; }
        function nkReactorCool(d) {
            let P = IND_BASE_ST.pool, water = (!ind.base.off.pool && Math.hypot(P.x - d.x, P.z - d.z) <= NK.waterR + P.r) || ind.base.devs.some(function (p) { return p.ty === 'pump' && p.pw && Math.hypot(p.x - d.x, p.z - d.z) <= NK.waterR; });
            return water ? NK.coolWater : NK.coolAir;
        }
        IND_DEV_TICK.reactor = function (d, dt) {
            if (d.T === undefined) IND_DEV_FIX.reactor(d);
            let heat = nkReactorHeat(d), cool = nkReactorCool(d), net = Math.max(-NK.maxRate, Math.min(NK.maxRate, (heat - cool) * NK.rate));
            d.T = Math.max(NK.amb, d.T + net * dt);
            d.rods.forEach(function (r) { if (!r.spent) { r.b += (1 - d.ctl) * dt / (NK.rodDays * IND_DAY); if (r.b >= 1) { r.spent = true; delete r.i; delete r.b; if (ind.panel === 'reactor') ind.panelDirty = true; } } });
            d.melt = d.T > NK.meltT ? d.melt + dt : 0;
            if (d.melt >= NK.meltS) { nkMeltdown(d); return; }
            if (ind.where === 'base') indBadge('rx' + d.id, d.x, 3.6, d.z, '反应堆 ' + Math.round(d.T) + '°C');
        };
        function nkMeltdown(d) {
            let B = ind.base, x = d.x, z = d.z;
            B.rad.push({ x: x, z: z, r: 10, until: B.clock + NK.zoneDays * IND_DAY });
            indBadge('rx' + d.id, 0, 0, 0, '');
            indBoom(x, z, 10, '反应堆熔毁'); indFlash('反应堆熔毁了');
            if (ind) ind.radDirty = true;
        }
        function nkTempCol(T) { return T < 300 ? '#2e7d32' : T <= 350 ? '#f9a825' : '#c62828'; }
        function nkDevItems(d) { return Object.keys(d.st).map(function (k) { return indName(k) + '×' + d.st[k]; }).join('、') || '空'; }
        function nkPutRows(d, filter) {
            return Object.keys(ind.bag).filter(filter).map(function (k) {
                return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + '" onclick="indDevPut(' + d.id + ',\'' + k + '\',1)">放 1</button><button style="' + IND_BTN + '" onclick="indDevPut(' + d.id + ',\'' + k + '\',2)">放 2</button>');
            }).join('');
        }
        const NK_FOOT = function (d) { return '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#2e7d32;" onclick="indDevTake(' + d.id + ')">全部拿出来</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>'; };
        IND_DEV_HTML.crusher = function (d) {
            let V = indDevVolt(d);
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">粉碎机</div><div style="line-height:1.7;">电压 <b>' + V.toFixed(1) + ' V</b>（额定 12 V）' + (d.pw ? '　正在碎 ' + Math.floor((d.ct || 0) / NK.crushT * 100) + '%' : '') + '</div>' +
                '<div style="margin-top:4px;">里面：' + nkDevItems(d) + '</div><div style="margin-top:6px;color:#888;font-size:13px;">每 ' + NK.crushT + ' 秒 1 铀矿 → 2 铀矿粉。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { return k === 'ore_u'; }) || '<div style="color:#999;padding:6px 0;">身上没有铀矿</div>') + NK_FOOT(d);
        };
        IND_DEV_HTML.centrifuge = function (d) {
            let V = indDevVolt(d), lv = nkCentriLv(d);
            let top = Object.keys(d.st).some(function (k) { return k.indexOf('uf6:') === 0 && +k.slice(4) === NK_LV_MAX && d.st[k] >= 2; });
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">离心机</div><div style="line-height:1.7;">电压 <b>' + V.toFixed(1) + ' V</b>（额定 24 V）' + (d.pw ? '　正在转 ' + Math.floor((d.ct || 0) / NK.centriT * 100) + '%' : '') + (top && lv < 0 ? '　<b>到头了</b>（丰度最高 5%）' : '') + '</div>' +
                '<div style="margin-top:4px;">里面：' + nkDevItems(d) + '</div><div style="margin-top:6px;color:#888;font-size:13px;">放 2 个丰度一样的罐，' + NK.centriT + ' 秒出 1 个丰度高一档的罐和 1 个贫铀罐。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { return k.indexOf('uf6:') === 0; }) || '<div style="color:#999;padding:6px 0;">身上没有六氟化铀罐</div>') + NK_FOOT(d);
        };
        IND_DEV_HTML.reactor = function (d) {
            let heat = nkReactorHeat(d), cool = nkReactorCool(d);
            let rods = d.rods.map(function (r, i) { return indRow(r.spent ? '乏燃料棒' : indName(nkRodKey(r)), '<button style="' + IND_BTN + '" onclick="nkRodOut(' + d.id + ',' + i + ')">取出</button>'); }).join('') || '<div style="color:#999;padding:6px 0;">一根燃料棒都没放</div>';
            let put = Object.keys(ind.bag).filter(function (k) { return nkRod(k); }).map(function (k) { return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + '" onclick="nkRodIn(' + d.id + ',\'' + k + '\')">放 1 根</button>'); }).join('');
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">反应堆</div>' +
                '<div style="line-height:1.7;">温度 <b style="color:' + nkTempCol(d.T) + '">' + Math.round(d.T) + '°C</b>　<span style="display:inline-block;width:120px;height:10px;background:#ddd;vertical-align:middle;border-radius:5px;overflow:hidden;"><span style="display:block;height:100%;width:' + Math.min(100, d.T / 5) + '%;background:' + nkTempCol(d.T) + ';"></span></span><br>' +
                '功率 <b>' + Math.round(heat) + '</b>　冷却 <b>' + cool + '</b>（' + (cool > NK.coolAir ? '6 米内有水' : '没有水，只靠空气') + '）' + (d.T >= NK.turbineT ? '　≥ ' + NK.turbineT + '°C，汽轮发电机有电' : '') + (d.melt > 0 ? '<br><b style="color:#c62828">温度超过 ' + NK.meltT + '°C 已经 ' + Math.floor(d.melt) + ' 秒</b>' : '') + '</div>' +
                '<div style="margin-top:6px;">控制棒插入 <b>' + Math.round(d.ctl * 100) + '%</b>（100% 停堆）　<button style="' + IND_BTN + '" onclick="nkCtl(' + d.id + ',-0.1)">拔 10%</button><button style="' + IND_BTN + '" onclick="nkCtl(' + d.id + ',-0.01)">拔 1%</button><button style="' + IND_BTN + '" onclick="nkCtl(' + d.id + ',0.01)">插 1%</button><button style="' + IND_BTN + '" onclick="nkCtl(' + d.id + ',0.1)">插 10%</button><button style="' + IND_BTN + '" onclick="nkCtl(' + d.id + ',1)">全插</button></div>' +
                '<div style="margin-top:6px;font-weight:bold;">燃料棒（最多 4 根）</div>' + rods +
                '<div style="margin-top:6px;font-weight:bold;">身上的燃料棒</div>' + (put || '<div style="color:#999;padding:6px 0;">身上没有燃料棒</div>') +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        };
        function nkRodIn(id, k) {
            let d = indDev(id), r = nkRod(k); if (!d || !r || !ind.bag[k]) return;
            if (d.rods.length >= 4) { indFlash('只有 4 个位置'); return; }
            indBagDel(k, 1); d.rods.push({ i: r.i, b: r.b }); indSave(); indPanelNk(id);
        }
        function nkRodOut(id, i) {
            let d = indDev(id); if (!d || !d.rods[i]) return;
            let r = d.rods[i], k = r.spent ? 'rod_spent' : nkRodKey(r);
            if (indBagAdd(k, 1) <= 0) { indFlash('背包满了'); return; }
            d.rods.splice(i, 1); indSave(); indPanelNk(id);
        }
        function nkCtl(id, v) {
            let d = indDev(id); if (!d) return;
            d.ctl = v === 1 ? 1 : Math.max(0, Math.min(1, Math.round((d.ctl + v) * 100) / 100)); indSave(); indPanelNk(id);
        }
        function indPanelNk(id) { let d = indDev(id); if (!d || !IND_DEV_HTML[d.ty]) return; indPanelShow(d.ty, IND_DEV_HTML[d.ty](d)); ind.panelEl = id; }

        // ── 辐射 ──
        function nkRadOf(k) { let it = IND_ITEMS[k]; return it && it.rad ? it.rad : null; }
        function nkRadCut() { let c = 0; Object.keys(ind.base.wear).forEach(function (sl) { c += IND_ITEMS[ind.base.wear[sl]].radcut || 0; }); return Math.min(0.9, c); }
        // 现在身上受到的辐射：{ lv: 最强的一档, why: 原因 }。背包里的东西、辐射区、3 米内地上或普通箱子里的强辐射东西（铅箱不算）
        function nkRadNow() {
            let best = null, why = '', rank = { vweak: 1, weak: 2, strong: 3 };
            let see = function (lv, w) { if (lv && (!best || rank[lv] > rank[best])) { best = lv; why = w; } };
            Object.keys(ind.bag).forEach(function (k) { see(nkRadOf(k), '背包里有' + indName(k)); });
            let zones = ind.where === 'base' ? ind.base.rad : (ind.tripRad || []);
            zones.forEach(function (z) { if (Math.hypot(ind.p.x - z.x, ind.p.z - z.z) <= z.r) see('strong', '站在辐射区里'); });
            let near = function (o, k) { if (Math.hypot(ind.p.x - o.x, ind.p.z - o.z) <= 3) see(nkRadOf(k), '离地上的' + indName(k) + '3 米内'); };
            (ind.where === 'base' ? ind.base.ground : (ind.tripGround || [])).forEach(function (g) { near(g, g.k); });
            if (ind.where === 'base') ind.base.chests.forEach(function (c) { if (c.lead) return; Object.keys(c.items).forEach(function (k) { if (Math.hypot(ind.p.x - c.x, ind.p.z - c.z) <= 3) see(nkRadOf(k), '离装着' + indName(k) + '的箱子 3 米内'); }); });
            return { lv: best, why: why };
        }
        let nkAudio = null, nkClickT = 0;
        function nkClick() {
            try {
                nkAudio = nkAudio || new (window.AudioContext || window.webkitAudioContext)();
                let o = nkAudio.createOscillator(), g = nkAudio.createGain(); o.frequency.value = 1800; g.gain.value = 0.04;
                o.connect(g); g.connect(nkAudio.destination); o.start(); o.stop(nkAudio.currentTime + 0.02);
            } catch (e) { }
        }
        function nkRadTick(dt) {
            if (!ind || ind.dead) return;
            let r = nkRadNow(), rate = r.lv ? NK_RAD[r.lv] : 0, cut = nkRadCut();
            ind.radNow = r.lv ? NK_RAD_READ[r.lv] * (r.lv === 'vweak' ? 1 : 1 - cut) : 0;
            if (rate > 0 && indHard()) indHurt(rate * (1 - cut) * dt, 'rad', r.why);
            let g = document.getElementById('ind-rad');
            if (!g) { g = document.createElement('div'); g.id = 'ind-rad'; g.style.cssText = 'position:fixed;inset:0;z-index:38;pointer-events:none;background:#43a047;opacity:0;'; document.body.appendChild(g); }
            g.style.opacity = rate > 0 && indHard() ? (r.lv === 'strong' ? 0.3 : 0.12) : 0;
            // 盖格计数器：拿在手上，屏幕角上显示辐射强度和咔咔声
            let gc = document.getElementById('ind-geiger');
            if (indSel() === 'geiger') {
                if (!gc) { gc = document.createElement('div'); gc.id = 'ind-geiger'; gc.style.cssText = 'position:fixed;right:10px;bottom:150px;z-index:45;pointer-events:none;background:rgba(0,0,0,.7);color:#76ff03;font-family:monospace;font-size:20px;font-weight:bold;padding:6px 12px;border-radius:8px;'; document.body.appendChild(gc); }
                gc.textContent = '辐射 ' + ind.radNow.toFixed(2) + ' /秒';
                nkClickT -= dt; if (ind.radNow > 0 && nkClickT <= 0) { nkClickT = Math.max(0.05, 0.6 / (1 + ind.radNow * 8)) * (0.5 + indRand()); nkClick(); }
            } else if (gc) gc.parentNode.removeChild(gc);
            nkZoneTick(dt);
        }
        function nkZoneTick(dt) {
            if (ind.where === 'base') ind.base.rad = ind.base.rad.filter(function (z) { return z.until > ind.base.clock; });
            let zones = ind.where === 'base' ? ind.base.rad : (ind.tripRad || []);
            zones.forEach(function (z) {
                if (z.m && ind.objs.indexOf(z.m) >= 0) return;
                z.m = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(z.r, z.r, 0.12, 40)), indMat(new THREE.MeshBasicMaterial({ color: 0x76ff03, transparent: true, opacity: 0.22, depthWrite: false })));
                z.m.position.set(z.x, (ind.where === 'trip' ? indGround(z.x, z.z) : 0) + 0.1, z.z); indAdd(z.m);
            });
        }

        // ── 火药、原子弹 ──
        // 火药：放进炉子就炸（小爆炸）；碰到爆炸也炸（地上的火药，连锁）
        function nkPowderInCooker(c) {
            let S = c.C; if (!(ind.bag.gunpowder > 0)) return;
            indBagDel('gunpowder', 1); indFlash('火药在炉子里炸了');
            indBoom(c.x, c.z, NK.powderR, '火药在炉子里炸了');
        }
        function nkPowderNear(x, z, R) {
            let hit = [], keep = [];
            ind.base.ground.forEach(function (g) { if (g.k === 'gunpowder' && Math.hypot(g.x - x, g.z - z) <= R) hit.push(g); });
            return hit;
        }
        function nkChain(list) {
            ind.boomDepth = (ind.boomDepth || 0) + 1;
            if (ind.boomDepth <= 4) list.forEach(function (g) { if (ind && !ind.dead) indBoom(g.x, g.z, NK.powderR, '火药炸了'); });
            ind.boomDepth--;
        }
        function nkBombs() { return ind.where === 'base' ? ind.base.bombs : (ind.tripBombs = ind.tripBombs || []); }
        function nkPlaceBomb(k) {
            let f = indFace(), x = ind.p.x + f.x * 2, z = ind.p.z + f.z * 2;
            if (ind.where === 'base') {
                x = Math.max(-IND_BASE.x + 1, Math.min(IND_BASE.x - 1, x)); z = Math.max(-IND_BASE.z + 1, Math.min(IND_BASE.z - 1, z));
                if (!indSpotFree(x, z, 0.8)) { indFlash('这里放不下，换个空地'); return false; }
            }
            if (nkBombs().length >= 4) { indFlash('场上已经有 4 颗了'); return false; }
            indBagDel(k, 1);
            let b = { id: 100 + (ind.bombSeq = (ind.bombSeq || 0) + 1), x: x, z: z, t: -1 };
            b.m = nkBombMesh(b); nkBombs().push(b);
            if (ind.where === 'base') indSave();
            indFlash('放好了原子弹：左键启动（' + NK.bombT + ' 秒后爆炸，半径 ' + NK.bombR + ' 米）');
            return true;
        }
        function nkBombMesh(b) {
            let y = ind.where === 'trip' ? indGround(b.x, b.z) : 0;
            let m = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 14)), indMat(new THREE.MeshLambertMaterial({ color: 0x455a64 })));
            m.position.set(b.x, y + 0.65, b.z); indAdd(m); return m;
        }
        function nkBombAct(b) {
            if (b.t < 0) { b.t = NK.bombT; indFlash('原子弹启动了：' + NK.bombT + ' 秒后爆炸，左键能拆'); if (ind.where === 'base') indSave(); return true; }
            // 倒计时里左键拆掉：变回原子弹
            if (indBagAdd('nuke', 1) <= 0) { indFlash('背包满了'); return false; }
            nkRemoveBomb(b); indFlash('拆掉了，变回原子弹');
            if (ind.where === 'base') indSave();
            return true;
        }
        function nkRemoveBomb(b) {
            let L = nkBombs(), i = L.indexOf(b); if (i >= 0) L.splice(i, 1);
            if (b.m) { scene.remove(b.m); let j = ind.objs.indexOf(b.m); if (j >= 0) ind.objs.splice(j, 1); }
            indBadge('bomb' + b.id, 0, 0, 0, '');
        }
        function nkPickBomb(b) {
            if (b.t >= 0) return nkBombAct(b);
            if (indBagAdd('nuke', 1) <= 0) { indFlash('背包满了'); return false; }
            nkRemoveBomb(b); if (ind.where === 'base') indSave(); indFlash('收起了原子弹');
            return true;
        }
        function nkAim(consider) { nkBombs().forEach(function (b) { consider(b, b.x, b.z, 'bomb', 1.2, 0.5); }); }
        function nkBombTick(dt) {
            if (!ind || ind.dead) return;
            nkBombs().slice().forEach(function (b) {
                if (!b.m || ind.objs.indexOf(b.m) < 0) b.m = nkBombMesh(b);
                if (b.t < 0) return;
                b.t -= dt;
                indBadge('bomb' + b.id, b.x, 2.6, b.z, '原子弹 ' + Math.max(0, Math.ceil(b.t)));
                if (b.t <= 0) nkDetonate(b);
            });
        }
        function nkFlash() {
            let e = document.getElementById('ind-flash');
            if (!e) { e = document.createElement('div'); e.id = 'ind-flash'; e.style.cssText = 'position:fixed;inset:0;z-index:119;pointer-events:none;background:#fff;opacity:0;'; document.body.appendChild(e); }
            e.style.transition = 'none'; e.style.opacity = 1;
            setTimeout(function () { e.style.transition = 'opacity 2.5s'; e.style.opacity = 0; }, 60);
        }
        function nkMushroom(x, z) {
            let y = ind.where === 'trip' ? indGround(x, z) : 0, mats = [];
            let stem = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(3, 5, 30, 14)), indMat(new THREE.MeshBasicMaterial({ color: 0xff8f00, transparent: true, opacity: 0.8 })));
            let cap = new THREE.Mesh(indGeo(new THREE.SphereGeometry(14, 16, 10)), indMat(new THREE.MeshBasicMaterial({ color: 0xff6d00, transparent: true, opacity: 0.8 })));
            stem.position.set(x, y + 15, z); cap.position.set(x, y + 38, z); cap.scale.y = 0.7; indAdd(stem); indAdd(cap);
            ind.mush = { t: 0, parts: [stem, cap] };
        }
        function nkMushTick(dt) {
            let M = ind.mush; if (!M) return;
            M.t += dt;
            M.parts.forEach(function (p) { p.material.opacity = Math.max(0, 0.8 * (1 - M.t / 10)); p.position.y += dt * 1.2; });
            if (M.t >= 10) { M.parts.forEach(function (p) { p.visible = false; }); ind.mush = null; }
        }
        // 爆炸：半径 40 米；离中心 ≤ 10 米扣 1000，边上 60，中间线性（防爆服、头盔照样减）
        function nkDetonate(b) {
            let x = b.x, z = b.z, R = NK.bombR, B = ind.base;
            nkRemoveBomb(b);
            nkFlash(); nkMushroom(x, z); indBoomFx(x, z);
            let inR = function (o) { return Math.hypot(o.x - x, o.z - z) <= R; };
            if (ind.where === 'base') {
                // 40 米内除了仓库箱和基地里本来就有的灶台、床、工作台、水池全炸没
                B.devs = B.devs.filter(function (d) { return !inR(d); }); B.wires = B.wires.filter(function (w) { return indDev(w[0]) && indDev(w[1]); });
                B.cookers = B.cookers.filter(function (c) { return !inR(c); }); B.ground = B.ground.filter(function (g) { return !inR(g); });
                B.fires = B.fires.filter(function (f) { return !inR(f); }); B.crops = B.crops.filter(function (c) { return !inR(c); });
                B.tiles = B.tiles.filter(function (t) { return !inR(t); }); B.houses = B.houses.filter(function (h) { return !inR(h); });
                B.animals = B.animals.filter(function (a) { return !inR(a); });
                B.bombs.slice().forEach(function (o) { if (inR(o)) nkRemoveBomb(o); });
                B.rad.push({ x: x, z: z, r: R, until: B.clock + NK.zoneDays * IND_DAY });
                ind.furnDirty = ind.itemDirty = ind.cropDirty = ind.fireDirty = ind.devDirty = ind.wireDirty = ind.tileDirty = true;
                indSave();
            } else {
                // 远征：40 米内的资源点全部炸开，东西 ×2 掉在地上；树全倒成木头；地上留一个大坑；之后这一趟 40 米内是强辐射区
                ind.tripGround = ind.tripGround || [];
                ind.nodes.forEach(function (o) {
                    if (o.dead || !inR(o)) return;
                    let nd = IND_NODES[o.key], k = o.key === 'seeds' ? o.seed : (nd.out || o.key);
                    for (let i = 0; i < o.n * 2 && ind.tripGround.length < 400; i++) { let a = i * 2.399; ind.tripGround.push({ k: k, x: o.x + Math.cos(a) * 0.6, z: o.z + Math.sin(a) * 0.6 }); }
                    o.dead = true;
                });
                ind.nodeDirty = true; nkTripItemsSync();
                ind.tripFires = (ind.tripFires || []).filter(function (f) { return !inR(f); }); ind.wild = (ind.wild || []).filter(function (a) { return !inR(a); });
                (ind.tripBombs || []).slice().forEach(function (o) { if (inR(o)) nkRemoveBomb(o); });
                ind.tripRad = ind.tripRad || []; ind.tripRad.push({ x: x, z: z, r: R });
                let crater = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(8, 3, 0.4, 24)), indMat(new THREE.MeshLambertMaterial({ color: 0x3e2723 })));
                crater.position.set(x, indGround(x, z) + 0.05, z); indAdd(crater);
            }
            nkBlastHurt(x, z);
        }
        function nkBlastHurt(x, z) {
            if (!indHard()) return;
            let d = Math.hypot(ind.p.x - x, ind.p.z - z), dmg = indBoomDmg(d, NK.bombR, NK.bombNear, NK.bombClose) * (1 - indBlastCut());
            if (dmg > 0) indHurt(dmg, 'boom', '原子弹，离爆炸点 ' + d.toFixed(0) + ' 米' + (indBlastCut() > 0 ? '（穿了防爆装备）' : ''), true);
        }
        // 远征图上的地上东西（炸开的矿）：和基地的 base.ground 一个样
        function nkTripItemsSync() {
            if (!ind.itemMesh) { ind.itemMesh = indInst(new THREE.BoxGeometry(0.5, 0.5, 0.5), IND_ITEM_CAP); }
            ind.itemDirty = true;
        }
        // 每帧（indTick 末尾调用）
        function nkTick(dt) {
            nkBombTick(dt); nkMushTick(dt); nkRadTick(dt);
        }
        // 读档整理
        function nkFixBase(b) {
            b.rad = Array.isArray(b.rad) ? b.rad.filter(function (z) { return z && isFinite(z.x) && isFinite(z.z) && z.r > 0 && z.until > 0; }).slice(0, 8).map(function (z) { return { x: indNum(z.x, 0, -1000, 1000), z: indNum(z.z, 0, -1000, 1000), r: indNum(z.r, 10, 1, 100), until: indNum(z.until, 0, 0, 1e9) }; }) : [];
            b.bombs = Array.isArray(b.bombs) ? b.bombs.filter(function (o) { return o && isFinite(o.x) && isFinite(o.z); }).slice(0, 4).map(function (o, i) { return { id: i + 1, x: indNum(o.x, 0, -IND_BASE.x, IND_BASE.x), z: indNum(o.z, 0, -IND_BASE.z, IND_BASE.z), t: o.t >= 0 ? indNum(o.t, NK.bombT, 0, NK.bombT) : -1 }; }) : [];
        }

        // 二氧化硫瓶放掉：一团毒气云（规则同氯气）；瓶子还给你
        function nkReleasePoison(k, x, z) {
            indBagDel(k, 1); indBagAdd('bottle', 1);
            ind.clouds = ind.clouds || [];
            let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(IND_GAS.r, 12, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.4, depthWrite: false })));
            m.position.set(x, 1, z); indAdd(m);
            ind.clouds.push({ x: x, z: z, t: IND_GAS.cloud, m: m, n: IND_ITEMS[k].poison });
            indFlash('一团黄色的气飘出来了');
        }
        IND_DEV_INFO.reactor = function (d) { return '反应堆 ' + Math.round(d.T === undefined ? NK.amb : d.T) + '°C　' + (d.rods ? d.rods.length : 0) + ' 根燃料棒　控制棒插入 ' + Math.round((d.ctl === undefined ? 1 : d.ctl) * 100) + '%'; };
        IND_DEV_INFO.turbine = function (d) { return '汽轮发电机 ' + (indSrcVolt(d) > 0 ? '发电中 48 V' : '没在发电（放在 250°C 以上的反应堆 3 米内）'); };
