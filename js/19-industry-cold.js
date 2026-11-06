// 猫盾工业：冰块、冷藏箱、冰箱、氟利昂、食物变质（任务 63）。放在 19-industry-circuit.js 后面。
// 变质：容易坏的东西按"一堆"算年龄（背包一堆、每个箱子里每种一堆）。年龄走满保质期，整堆变成「腐烂的食物」；两堆并在一起取更老的那个年龄。
// 冷藏箱：箱子里放冰块，每块冰撑一个游戏日，箱里有冰的时候里面的东西不变质。冰箱是设备（拿铜线接 24 V），通电就不变质，里面放一桶生水 60 秒出 4 块冰。
// 地上和设备里（炉子、电解槽）的东西不变质（保守：这些地方本来就不是放食物的地方）。
        const CL = { day: IND_DAY, ice: 600, iceMake: 60, iceN: 4, rotF: 10 };
        // 保质期（游戏秒，一个游戏日 = 1200）：熟的 2 天、生肉 1 天、蔬菜水果 4 天、面包 3 天、牛奶 2 天；冰块放在背包／普通箱里 10 分钟化掉
        const CL_LIFE = { meat_raw: 1, meat_roast: 2, meat_soup: 2, bake_potato: 2, bake_corn: 2, tomato_soup: 2, radish_soup: 2, cabbage_stew: 2, pumpkin_pie: 2, cactus_roast: 2, bread: 3, milk: 2,
            tomato: 4, cabbage: 4, radish: 4, potato: 4, corn: 4, pumpkin: 4, cactus: 4, cactus_peeled: 4 };
        Object.keys(CL_LIFE).forEach(function (k) { CL_LIFE[k] *= CL.day; });
        CL_LIFE.ice = CL.ice; CL_LIFE.fish_live = 600; CL_LIFE.fish_raw = CL.day;   // 活鱼在背包里 10 分钟死成生鱼；生鱼 1 天坏
        const CL_TO = { fish_live: 'fish_raw' };
        Object.assign(IND_ITEMS_RAW, {
            ice: { name: '冰块', col: 0xb3e5fc, eat: { w: 5, cool: 1 }, use: '拿着右键吃一块：体温 −1°C、口渴 +5。放进冷藏箱保鲜。放在身上和普通箱子里 10 分钟就化了' },
            rotfood: { name: '腐烂的食物', col: 0x6d4c41, eat: { f: 5, sick: 1 }, use: '吃了拉肚子。撒在农田里当肥料' },
            b_freon: { name: '氟利昂瓶', col: 0xb3e5fc, use: '冰箱要用（制冷剂）' },
            chest_cold: { name: '冷藏箱', col: 0x90caf9, furn: 'chest', cold: true, use: '箱子里放冰块，每块撑一个游戏日，有冰的时候里面的食物不变质' },
            dev_fridge: { name: '冰箱', col: 0xeceff1, dev: 'fridge', use: '30 格，接上 24 V 通电就不变质；里面放一桶生水，60 秒出 4 块冰' }
        });
        IND_DEVS.fridge = { name: '冰箱', col: 0xeceff1, rated: 24, minV: 18, draw: 0.5, size: [1, 1.8, 0.9] };
        IND_DEV_BUSY.fridge = function () { return true; };
        IND_FERTS.rotfood = true;
        IND_CRAFT.push(
            { out: 'chest_cold', in: { wood: 6, ingot_fe: 2 }, hard: true },
            { out: 'dev_fridge', in: { ingot_fe: 6, steel: 2, wire: 10, coil: 1, b_freon: 1 }, hard: true },
            { out: 'water_raw', in: { ice: 2, bucket: 1 }, hard: true }
        );
        IND_RECIPES.push({ in: { b_hf: 2, b_cl2: 2, coal: 1 }, out: { b_freon: 1, bottle: 3 }, cls: 'chem', pri: true, minT: 120, time: 20, hard: true });
        // 任务 67（贫铀增殖）：配方下标存在炉子里，所以新配方只能加在整张表的末尾（这个文件是目前最后一个有配方的）
        IND_RECIPES.push(
            { in: { uf6_dep: 1, b_h2: 2 }, out: { pellet_dep: 1, bottle: 2 }, cls: 'chem', pri: true, minT: 600, time: 20, hard: true },
            { in: { rod_irr: 1, b_hno3: 2 }, out: { plutonium: 1, bottle: 2 }, cls: 'chem', pri: true, minT: 300, time: 40, hard: true }
        );
        // 一堆东西过 dt 秒：keep 为真时不老；noIce 为真时冰块不按保质期化（冷藏箱自己一天烧一块）。返回变质的数量
        function clPile(items, age, dt, keep, noIce) {
            let rot = 0;
            Object.keys(age).forEach(function (k) { if (!(items[k] > 0)) delete age[k]; });
            Object.keys(items).forEach(function (k) {
                let L = CL_LIFE[k]; if (!L || !(items[k] > 0) || keep || (noIce && k === 'ice')) return;
                age[k] = (age[k] || 0) + dt; if (age[k] < L) return;
                let n = items[k]; delete items[k]; delete age[k];
                if (CL_TO[k]) items[CL_TO[k]] = (items[CL_TO[k]] || 0) + n;
                else if (k !== 'ice') { items.rotfood = (items.rotfood || 0) + n; rot += n; }
            });
            return rot;
        }
        function clHint() { let b = ind.base; if (!b.clHint && !ind.sleeping) { b.clHint = true; indFlash('东西放坏了，放冷藏箱或冰箱能放久点'); } }
        // 冷藏箱：有冰就保鲜，一块冰一个游戏日
        function clBoxCold(c, dt) {
            if (!(c.iceT > 0) && c.items.ice > 0) { c.items.ice--; if (c.items.ice <= 0) delete c.items.ice; c.iceT = CL.day; }
            if (c.iceT > 0) { c.iceT = Math.max(0, c.iceT - dt); return true; }
            return false;
        }
        // 每步：bag 为真时背包也老；chests 为真时箱子和冰箱也老（出门的时候家里不走，回来补算）
        function clStep(dt, bag, chests) {
            if (!ind || !ind.base || !(dt > 0)) return;
            let B = ind.base, rot = 0;
            if (bag) { B.clAge = B.clAge || {}; rot += clPile(ind.bag, B.clAge, dt, false, false); }
            if (chests) {
                B.chests.forEach(function (c) { c.age = c.age || {}; let keep = c.cold ? clBoxCold(c, dt) : false; rot += clPile(c.items, c.age, dt, keep, !!c.cold); });
                B.devs.forEach(function (d) {
                    if (d.ty !== 'fridge') return;
                    d.items = d.items || {}; d.age = d.age || {};
                    let on = !!d.pw; rot += clPile(d.items, d.age, dt, on, false);
                    if (on && d.items.water_raw > 0) {   // 制冰：一桶生水 60 秒出 4 块冰，还回空桶
                        d.mk = (d.mk || 0) + dt;
                        if (d.mk >= CL.iceMake) { d.mk = 0; d.items.water_raw--; if (d.items.water_raw <= 0) delete d.items.water_raw; d.items.ice = (d.items.ice || 0) + CL.iceN; d.items.bucket = (d.items.bucket || 0) + 1; }
                    } else if (!(d.items.water_raw > 0)) d.mk = 0;
                });
            }
            if (rot > 0) { clHint(); ind.hudSig = ''; if (ind.panel === 'box') ind.panelDirty = true; }
        }
        // 冰箱当成箱子用：箱子面板认 'd' + 设备编号
        function clFridgeOf(id) { return typeof id === 'string' && id.charAt(0) === 'd' ? ind.base.devs.filter(function (d) { return d.ty === 'fridge' && 'd' + d.id === id; })[0] || null : null; }
        function clDevAct(d) {
            if (d.ty !== 'fridge') return undefined;
            let k = indSel(); if (k === 'wire') return undefined;
            d.items = d.items || {}; indPanelBox('d' + d.id); return true;
        }
        // 两堆并在一起取更老的年龄：从箱子拿到背包、从背包放进箱子都走这里（indBoxTake／indBoxPut 调）
        function clMoveAge(srcAge, dstAge, k) { if (srcAge && srcAge[k] > 0) dstAge[k] = Math.max(dstAge[k] || 0, srcAge[k]); }
        function clAgeOfBag() { let B = ind.base; return B.clAge = B.clAge || {}; }
        // 冬天拿镐站在水边凿冰：每次 1～2 块（只在远征里；别的季节没有）
        function clIceAct() {
            if (!ind || ind.where !== 'trip' || !indHard() || indSeason() !== 3 || !indAtWater()) return false;
            let k = indSel(), d = k && IND_ITEMS[k]; if (!(d && d.tool >= 1)) return false;
            if (ind.iceCd > ind.t) return true;
            ind.iceCd = ind.t + 1;
            let n = 1 + Math.floor(indRand() * 2), r = indBoxAdd('ice', n);
            ind.hudSig = ''; return true;
        }
        function clFixBase(b) {
            b.clHint = !!b.clHint; if (!b.clAge || typeof b.clAge !== 'object') b.clAge = {};
            let fixAge = function (a, items) { Object.keys(a).forEach(function (k) { if (!CL_LIFE[k] || !(a[k] > 0) || !(items[k] > 0)) delete a[k]; else a[k] = indNum(a[k], 0, 0, 1e9); }); };
            Object.keys(b.clAge).forEach(function (k) { if (!CL_LIFE[k] || !(b.clAge[k] > 0)) delete b.clAge[k]; else b.clAge[k] = indNum(b.clAge[k], 0, 0, 1e9); });
            (b.chests || []).forEach(function (c) { c.cold = !!c.cold; c.iceT = indNum(c.iceT, 0, 0, CL.day); if (!c.age || typeof c.age !== 'object') c.age = {}; fixAge(c.age, c.items); });
            Object.keys(b.carried || {}).forEach(function (id) { let c = b.carried[id]; if (c && c.ty === 'chest') { c.cold = !!c.cold; c.iceT = indNum(c.iceT, 0, 0, CL.day); } });
            (b.devs || []).forEach(function (d) {
                if (d.ty !== 'fridge') return;
                if (!d.items || typeof d.items !== 'object') d.items = {};
                Object.keys(d.items).forEach(function (k) { if (!IND_ITEMS[k] || !(d.items[k] > 0)) delete d.items[k]; else d.items[k] = Math.floor(d.items[k]); });
                if (!d.age || typeof d.age !== 'object') d.age = {}; fixAge(d.age, d.items); d.mk = indNum(d.mk, 0, 0, CL.iceMake);
            });
        }
        function clMv(c, k, toBox) { c.age = c.age || {}; if (toBox) clMoveAge(clAgeOfBag(), c.age, k); else clMoveAge(c.age, clAgeOfBag(), k); }
