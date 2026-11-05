// 猫盾工业：电磁线圈、手摇发电机（任务 32）。放在 19-industry-nuke.js 后面。
// 电磁线圈（工作台）：磁石 2 + 铜线 10 + 铅 1。用途：手摇发电机、变压器（任务 30）、以后的时间加速器。
// 手摇发电机：不用燃料，站在旁边按住右键摇，摇的时候是 6 V 电源（能让电解槽、水泵、压缩机、粉碎机跑；离心机、压力机、电炉不行），松手 0.3 秒后没电。
// 摇的时候每秒吃 1.5 体力（没体力就摇不动），要站在 3 米内、准星对着它。短按右键还是收起。
        Object.assign(IND_ITEMS_RAW, {
            coil: { name: '电磁线圈', col: 0xb87333, use: '做手摇发电机、变压器（以后还有时间加速器）' },
            dev_crank: { name: '手摇发电机', col: 0x7cb342, dev: 'crank', use: '放下，按住右键摇，摇的时候是 6 V 电源；也能给铜线接的用电器（电解槽、水泵）应急' }
        });
        IND_CRAFT.push(
            { out: 'coil', in: { magnet: 2, wire: 10, ingot_pb: 1 }, hard: true },
            { out: 'dev_crank', in: { coil: 2, steel: 2, wood: 4 }, hard: true }
        );
        const PW = { volt: 6, hold: 0.3, near: 3, stam: 1.5 };   // 摇的时候每秒吃 1.5 体力（扇炉子 4、扇自己 2，比它们少；任务 61）
        Object.assign(IND_DEVS, { crank: { name: '手摇发电机', col: 0x7cb342, src: true, volt: PW.volt, size: [1, 0.9, 0.9] } });
        IND_DEV_VOLT.crank = function (d) { return d.cr > 0 ? PW.volt : 0; };
        IND_DEV_INFO.crank = function (d) { return '手摇发电机 ' + (d.cr > 0 ? '摇着 ' + PW.volt + ' V' : '没在摇（按住右键摇）'); };
        IND_DEV_FIX.crank = function (d) { d.cr = 0; };
        // 右键按下对着手摇发电机：开始摇（indRightDown 里调用）；短按（< 0.25 秒）还是收起
        function pwCrankDown(a) {
            if (!a || a.kind !== 'dev' || a.o.ty !== 'crank') return false;
            let k = indSel(); if (k && IND_ITEMS[k].dev) return false;   // 手里拿着设备是要放设备
            ind.crank = { d: a.o, t: 0 }; return true;
        }
        function pwCrankUp() {
            let c = ind && ind.crank; if (!c) return false;
            ind.crank = null;
            if (c.t < 0.25) indPickDev(c.d);
            return true;
        }
        // 每帧：摇着的刷新电压，没摇的衰减；摇要站在 3 米内、准星还对着它、有体力
        function pwCrankTick(dt) {
            ind.crankEffort = 0;
            if (ind.where !== 'base') { ind.crank = null; return; }
            ind.base.devs.forEach(function (d) { if (d.ty === 'crank' && d.cr > 0) d.cr = Math.max(0, d.cr - dt); });
            let c = ind.crank; if (!c) return;
            let a = indAim();
            if (!(a && a.kind === 'dev' && a.o === c.d) || Math.hypot(ind.p.x - c.d.x, ind.p.z - c.d.z) > PW.near + 0.5 || !indDev(c.d.id)) { ind.crank = null; return; }
            c.t += dt;
            if (c.t < 0.25) return;   // 先看是不是短按
            if (ind.stam <= 0) { ind.crank = null; indFlash('没力气了'); return; }
            ind.crankEffort = PW.stam; c.d.cr = PW.hold;
        }

// ── 变压器（任务 30）──
// 核电的汽轮发电机 48 V，别的用电器额定 6～24 V。变压器：输入端当用电器（额定 48 V，超了才炸），输出端当电源，点一下切换输出 6 / 12 / 24 V；
// 输出不会高于输入（输入低于选的就按输入输出，不升压）；输出的耗电折算回输入端的电池组。一个变压器输出可以接多个用电器。
        Object.assign(IND_ITEMS_RAW, { dev_xfmr: { name: '变压器', col: 0x5d4037, dev: 'xfmr', use: '接在汽轮发电机（48 V）和用电器之间降压；也能把电池组的电降到 6 V 给电灯用' } });
        IND_CRAFT.push({ out: 'dev_xfmr', in: { steel: 4, coil: 4, brass: 2 }, hard: true });
        Object.assign(IND_DEVS, { xfmr: { name: '变压器', col: 0x5d4037, src: true, rated: 48, minV: 1.5, draw: 0, size: [1.2, 1.1, 1] } });
        const PW_OUT = [6, 12, 24];
        function pwIsXfmr(d) { return !!d && d.ty === 'xfmr'; }
        // 输入电压：接进变压器的电源里最高的（变压器接变压器时往上一层找，最多 4 层，防循环）
        function pwInV(d, depth) {
            if (depth > 4) return 0;
            return indDevSrcs(d).reduce(function (m, s) { return Math.max(m, s === d ? 0 : (s.ty === 'xfmr' ? pwOutV(s, depth + 1) : indSrcVolt(s))); }, 0);
        }
        function pwOutV(d, depth) { let v = pwInV(d, depth || 0); return v > 0 ? Math.min(d.out || 12, v) : 0; }
        IND_DEV_VOLT.xfmr = function (d) { return pwOutV(d, 0); };
        IND_DEV_INFO.xfmr = function (d) { let vi = pwInV(d, 0); return '变压器　输入 ' + vi.toFixed(1) + ' V → 输出 ' + pwOutV(d, 0).toFixed(1) + ' V（选了 ' + (d.out || 12) + ' V，点一下切换）'; };
        IND_DEV_FIX.xfmr = function (d) { d.out = PW_OUT.indexOf(d.out) >= 0 ? d.out : 12; };
        function pwXfmrCycle(d) { d.out = PW_OUT[(PW_OUT.indexOf(d.out || 12) + 1) % PW_OUT.length]; indSave(); indFlash('变压器输出 ' + d.out + ' V（输出不会高于输入）'); return true; }
        // 接线谁是电源谁是用电器：一头是变压器时——另一头是电源 → 变压器是用电器；另一头是用电器 → 变压器是电源；两头都是变压器 → 先选的当电源
        function pwWireRoles(a, d) {
            if (!pwIsXfmr(a) && !pwIsXfmr(d)) return null;
            let x = pwIsXfmr(d) ? d : a, o = x === d ? a : d;
            if (pwIsXfmr(o)) return { src: a, dev: d };
            if (IND_DEVS[o.ty].src) return { src: o, dev: x };
            return { src: x, dev: o };
        }
        // 把一串电源展开到最上游：变压器换成它输入端的电源
        function pwUpstream(live, depth) {
            depth = depth || 0; let out = [];
            live.forEach(function (s) {
                if (s.ty === 'xfmr' && depth < 4) out = out.concat(pwUpstream(indDevSrcs(s).filter(function (u) { return u !== s && indSrcVolt(u) > 0; }), depth + 1));
                else out.push(s);
            });
            return out;
        }

// ── 背包（背部装备栏，任务 31）：一次戴一个，加格数。脱下或换小的之前，多出来的格子里必须是空的 ──
        Object.assign(IND_ITEMS_RAW, {
            pack_grass: { name: '草背包', col: 0x9ccc65, wear: 'back', slots: 6, warm: 0, use: '戴在背上，背包 +6 格（共 30 格）；脱下前多出来的格子要先清空' },
            pack_cloth: { name: '布背包', col: 0x8e6bbf, wear: 'back', slots: 12, warm: 0, use: '戴在背上，背包 +12 格（共 36 格）；脱下前多出来的格子要先清空' },
            pack_steel: { name: '钢架背包', col: 0x607d8b, wear: 'back', slots: 18, warm: 0, use: '戴在背上，背包 +18 格（共 42 格）；脱下前多出来的格子要先清空' }
        });
        IND_CRAFT.push(
            { out: 'pack_grass', in: { rope: 6, wood: 2 }, hard: true },
            { out: 'pack_grass', in: { yarn: 3, wood: 2 }, casual: true },
            { out: 'pack_cloth', in: { yarn: 6, rope: 2, wire: 2 }, hard: true },
            { out: 'pack_steel', in: { steel: 4, yarn: 4, wire: 4 }, hard: true }
        );

// ── 新矿石：铝和镍（任务 33）──
// 铝土矿（山地露头，要铁稿）→ 电解槽出铝锭（铝要电解才出得来）。铝锭用途：铝架背包 +24 格、铝线（1 锭出 3 根铜线，比铜便宜）。
// 镍矿（山地露头，跟锡一个密度）→ 大窑炼成镍锭（1455°C）。镍锭用途：镍电池（360 U，两倍电量）、镍稿（采矿多拿 1 个，跟铁稿一样）。
        Object.assign(IND_ITEMS_RAW, {
            ore_al: { name: '铝土矿', col: 0xd7a38b, use: '放进电解槽（加盐当助熔剂）出铝锭' },
            ore_ni: { name: '镍矿', col: 0x78909c, use: '加 1 份木炭／煤／焦炭，放进大窑炼镍锭（1455°C）' },
            ingot_al: { name: '铝锭', col: 0xcfd8dc, use: '做铝架背包（+24 格）、铝线（1 锭出 3 根铜线）' },
            hot_ni: { name: '镍锭（烫）', col: 0xff7043, hot: 'ingot_ni', needTool: 'tongs' },
            ingot_ni: { name: '镍锭', col: 0xb0bec5, use: '做镍电池（电量两倍）、镍稿（采矿多拿 1 个）' },
            battery_ni: { name: '镍电池', col: 0x26a69a, cellU: 360, use: '装进电池组，一节 360 U（普通电池的两倍），电压还是 1.5 V' },
            pick_ni: { name: '镍稿', col: 0x78909c, tool: 2, bonus: 1, use: '跟铁稿一样：采矿一次多拿 1 个' },
            pack_al: { name: '铝架背包', col: 0xb0bec5, wear: 'back', slots: 24, warm: 0, use: '戴在背上，背包 +24 格（共 48 格）；脱下前多出来的格子要先清空' }
        });
        IND_ELEM_OF.ingot_al = 13; IND_ELEM_OF.ingot_ni = 28;
        Object.assign(IND_NODES, { ore_al: { give: [1, 2], tool: 2 }, ore_ni: { give: [1, 2], tool: 1 } });
        IND_OUTCROP.ore_al = 1; IND_OUTCROP.ore_ni = 1;
        IND_BIOMES.mountain.res.ore_al = 2; IND_BIOMES.mountain.res.ore_ni = 3;
        CK_MELT.hot_ni = 1455;
        IND_RECIPES.push({ in: { ore_ni: 1, charcoal: 1 }, out: { hot_ni: 1 }, cls: 'smelt', minT: 1455, time: 30, hard: true });   // 任务 53：要还原剂
        IND_EL_RECIPES.push({ name: '电解铝土矿', in: { ore_al: 2, salt: 1 }, out: { ingot_al: 1 }, minV: 6, hard: true });
        IND_CRAFT.push(
            { out: 'battery_ni', in: { wire: 2, ingot_ni: 2, ingot_zn: 1 }, hard: true },
            { out: 'pick_ni', in: { ingot_ni: 3, wood: 2 }, hard: true },
            { out: 'pack_al', in: { ingot_al: 6, yarn: 4, wire: 4 }, hard: true },
            { out: 'wire', n: 3, in: { ingot_al: 1 }, hard: true }
        );

// ── 锂电池（任务 38）：每节 3 V、720 U（普通 1.5 V／180 U，镍 360 U）。一个电池组只能装一种；锂电池组上限 128 节，电压按节数 × 3 V ──
        Object.assign(IND_ITEMS_RAW, {
            battery_li: { name: '锂电池', col: 0xab47bc, cellU: 720, use: '装进电池组，一节 3 V、720 U；一个电池组只能装一种电池，锂电池组最多 128 节（8 节就是 24 V，小心超过用电器额定）' }
        });
        IND_CRAFT.push({ out: 'battery_li', in: { ingot_li: 2, wire: 2, ingot_al: 1 }, hard: true });

// ── 时间加速器（任务 39）：6 米内的炉子和设备的计时 ×3（做东西、进出料、烧燃料、耗电都 ×3），两台重叠只算一次；反应堆、汽轮发电机、作物、动物不加速 ──
        Object.assign(IND_ITEMS_RAW, {
            dev_accel: { name: '时间加速器', col: 0x00acc1, dev: 'accel', use: '放下接 24 V：6 米内的炉子、粉碎机、压力机、离心机、电解槽、水泵、压缩机的时间 ×3（燃料和电也多耗 3 倍）；睡觉、出门回家也算；以后做载具还要用' }
        });
        Object.assign(IND_DEVS, { accel: { name: '时间加速器', col: 0x00acc1, rated: 24, minV: 18, draw: 16, size: [1.4, 1.5, 1.4] } });
        IND_CRAFT.push({ out: 'dev_accel', in: { steel: 16, brass: 8, wire: 80, glass_plate: 8, coil: 4, diamond: 2, 'uf6:0': 2, ingot_ge: 4, battery_li: 16 }, hard: true });
        const PW_ACCEL = { r: 6, mul: 3, types: { crusher: 1, press: 1, centrifuge: 1, el: 1, pump: 1, comp: 1 } };
        // 某个位置的加速倍数（用上一帧的通电状态，差一帧没关系）
        function pwAccelMult(x, z) {
            if (!ind || ind.where !== 'base') return 1;
            return ind.base.devs.some(function (a) { return a.ty === 'accel' && a.pwPrev && Math.hypot(a.x - x, a.z - z) <= PW_ACCEL.r; }) ? PW_ACCEL.mul : 1;
        }
        function pwAccelMultDev(d) { return PW_ACCEL.types[d.ty] ? pwAccelMult(d.x, d.z) : 1; }

// ── 炼药：速度药、回血药（任务 40）──
// 用大窑（或灶台，一次 1 份）的化学批次做，右键服用，空瓶还回背包。
//  速度药：糖 2 + 番茄 1 + 开水 1 + 玻璃瓶 1，150°C 30 秒（桶还）。跑速 ×1.5 持续 3 分钟，喝完虚弱 30 秒（跑速 ×0.8）；
//    加速期间采集、砍树、挖地这类要站着做一会儿的动作时间 ×0.8。
//  回血药：卷心菜 2 + 萝卜 1 + 开水 1 + 玻璃瓶 1，150°C 30 秒（桶还）。服用后 20 秒内回 60 点血（一次性，同时喝只刷新）；也能治拉肚子。
// 总跑速加成（药 + 以后的鞋）不超过 ×2.0。联机：猫盾工业是单人，不用同步，NET_PROTO 不动。药的状态存在存档里（base.fx）。
        Object.assign(IND_ITEMS_RAW, {
            potion_speed: { name: '速度药', col: 0xffca28, potion: 'speed', use: '右键喝：跑速 ×1.5 持续 3 分钟，采集砍树挖地动作快 20%；喝完虚弱 30 秒（跑速 ×0.8）；空瓶还你' },
            potion_heal: { name: '回血药', col: 0xef5350, potion: 'heal', use: '右键喝：20 秒内回 60 点血（一次性，同时喝只刷新），也能治拉肚子；空瓶还你' }
        });
        IND_RECIPES.push(
            { in: { sugar: 2, tomato: 1, water_boiled: 1, bottle: 1 }, out: { potion_speed: 1, bucket: 1 }, cls: 'chem', pri: true, minT: 150, time: 30, hard: true },
            { in: { cabbage: 2, radish: 1, water_boiled: 1, bottle: 1 }, out: { potion_heal: 1, bucket: 1 }, cls: 'chem', pri: true, minT: 150, time: 30, hard: true }
        );
        const PX = { speedT: 180, speedMul: 1.5, weakT: 30, weakMul: 0.8, healT: 20, healAmt: 60, work: 0.8, cap: 2.0 };
        function pwFx() { let B = ind.base; if (!B.fx) B.fx = {}; return B.fx; }
        function pwDrink(k) {
            let fx = pwFx(), kind = IND_ITEMS[k].potion;
            indBagDel(k, 1); indBagAdd('bottle', 1);
            if (kind === 'speed') { fx.speed = PX.speedT; fx.weak = 0; indFlash('喝了速度药：跑得快一半，采集也快，3 分钟'); }
            else {
                fx.heal = PX.healT; fx.healLeft = PX.healAmt; ind.sickT = 0;
                indFlash('喝了回血药：20 秒回 60 点血');
            }
            indSave(); return true;
        }
        // 每帧：药效倒数、回血；速度药过了转虚弱
        function pwFxTick(dt) {
            let B = ind.base, fx = B.fx; if (!fx) return;
            if (fx.speed > 0) { fx.speed -= dt; if (fx.speed <= 0) { fx.speed = 0; fx.weak = PX.weakT; indFlash('药效过了，虚弱 30 秒'); } }
            else if (fx.weak > 0) fx.weak = Math.max(0, fx.weak - dt);
            if (fx.heal > 0) {
                let h = Math.min(fx.healLeft, PX.healAmt / PX.healT * dt);
                B.surv.hp = Math.min(100, B.surv.hp + h); fx.healLeft -= h; fx.heal -= dt;
                if (fx.heal <= 0 || fx.healLeft <= 0) { fx.heal = 0; fx.healLeft = 0; }
            }
        }
        // 跑速乘数：速度药 ×1.5、虚弱 ×0.8；药加鞋等加成的总上限 ×2.0
        function pwSpeedMul() { let fx = ind.base.fx; if (!fx) return 1; let m = fx.speed > 0 ? PX.speedMul : fx.weak > 0 ? PX.weakMul : 1; return Math.min(PX.cap, m); }
        function pwWorkMul() { let fx = ind.base && ind.base.fx; return fx && fx.speed > 0 ? PX.work : 1; }
        function pwFixBase(b) {
            if (typeof rdFixBase === 'function') rdFixBase(b);
            if (typeof rcFixBase === 'function') rcFixBase(b);
            let f = b.fx; if (!f || typeof f !== 'object') { delete b.fx; return; }
            b.fx = { speed: indNum(f.speed, 0, 0, PX.speedT), weak: indNum(f.weak, 0, 0, PX.weakT), heal: indNum(f.heal, 0, 0, PX.healT), healLeft: indNum(f.healLeft, 0, 0, PX.healAmt) };
        }

// ── 鞋（装备栏"脚"，任务 43）：只加速、都不带 heavy。走路总倍数（鞋 × 药）不超过 ×2.0，载具不受影响 ──
//  草鞋 ×1.15（草绳 4 + 草 2；透气，"热"阈值 +2）  皮鞋 ×1.3（皮 3 + 草绳 2；保暖，"冷"阈值 −2）  钢靴 ×1.5（钢 4 + 皮 2 + 铜线 4；受爆炸伤害 −20%）。皮的配方自动有人造革的备选
        Object.assign(IND_ITEMS_RAW, {
            shoe_straw: { name: '草鞋', col: 0xc0ca33, wear: 'foot', speed: 1.15, sweatAdd: 2, warm: 0, use: '穿在脚上，走路 ×1.15；透气，热的临界体温 +2°C' },
            shoe_leather: { name: '皮鞋', col: 0x6d4c41, wear: 'foot', speed: 1.3, chillCut: 2, warm: 0, use: '穿在脚上，走路 ×1.3；保暖，冷的临界体温 −2°C' },
            shoe_steel: { name: '钢靴', col: 0x78909c, wear: 'foot', speed: 1.5, blast: 0.2, warm: 0, use: '穿在脚上，走路 ×1.5；受爆炸伤害 −20%' }
        });
        IND_CRAFT.push(
            { out: 'shoe_straw', in: { rope: 4, grass: 2 }, hard: true },
            { out: 'shoe_leather', in: { hide: 3, rope: 2 }, hard: true },
            { out: 'shoe_steel', in: { steel: 4, hide: 2, wire: 4 }, hard: true }
        );
        function pwShoeMul() { let w = ind.base.wear && ind.base.wear.foot; return w && IND_ITEMS[w] && IND_ITEMS[w].speed || 1; }
        // 鞋 × 药，合起来最多 ×2.0（PX.cap 是同一个常数）
        function pwMoveMul() { return Math.min(PX.cap, pwShoeMul() * pwSpeedMul()); }
