// 猫盾工业：空气分离塔、氮氩氖氪（任务 81，火箭第一期）。放在 19-industry-repair.js 后面（最后一个）。只有硬核。
// 低温精馏：空气压缩、冷却液化、按沸点分开。放空瓶进去，通电（24 V，≥18 V），每瓶 20 秒出一瓶气，按空气成分随机：氮 72%、氧 20%、氩 7%、氖 0.7%、氪 0.3%（现实里氩只有 0.9%，这里调得玩得到）。
// 氮气：①炼钢保护气（配方带氮气 20 秒，原来 40 秒；还空瓶）②对着篝火右键灭火（还空瓶）。氩气：①灯泡填氩（灯泡耗电减半）②炼钢保护气（跟氮气一样 20 秒）。
// 氖、氪：先只点亮元素表，物品说明写"微量气体"，用处等作者定。
        const AS = { time: 20, draw: 10, mix: [['b_n2', 0.72], ['b_o2', 0.2], ['b_ar', 0.07], ['b_ne', 0.007], ['b_kr', 0.003]], fast: 20 };
        Object.assign(IND_ITEMS_RAW, {
            dev_asu: { name: '空气分离塔', col: 0x90a4ae, dev: 'asu', use: '低温精馏。24 V' },
            b_n2: { later: '空气分离塔里分出来的，体检看不到', name: '氮气瓶', col: 0xb3e5fc, use: '炼钢的保护气；对着篝火右键灭火' },
            b_ar: { later: '空气分离塔里分出来的，体检看不到', name: '氩气瓶', col: 0xce93d8, use: '灯泡的填充气；炼钢的保护气' },
            b_ne: { later: '空气分离塔里分出来的，体检看不到', name: '氖气瓶', col: 0xff8a65, use: '微量气体' },
            b_kr: { later: '空气分离塔里分出来的，体检看不到', name: '氪气瓶', col: 0xaed581, use: '微量气体' },
            bulb_ar: { later: '用氩气做的，体检看不到', name: '氩气灯泡', col: 0xe1bee7, wear: 'head', warm: 0, use: '戴在头上，矿洞里照亮身边 12 米；填了氩气，耗电减半' }
        });
        Object.assign(IND_ELEM_OF, { b_n2: 7, b_ne: 10, b_ar: 18, b_kr: 36 });
        IND_DEVS.asu = { name: '空气分离塔', col: 0x90a4ae, rated: 24, minV: 18, draw: AS.draw, size: [1.4, 2.6, 1.4] };
        IND_DEV_BUSY.asu = function (d) { return (d.st.bottle || 0) > 0; };
        // 一瓶出什么气（rnd 是 0～1 的随机数函数，测试里传固定的）
        function asuGas(rnd) { let p = (rnd || indRand)(), s = 0; for (let i = 0; i < AS.mix.length; i++) { s += AS.mix[i][1]; if (p < s) return AS.mix[i][0]; } return AS.mix[0][0]; }
        IND_DEV_TICK.asu = function (d, dt) {
            if (!d.pw || !((d.st.bottle || 0) > 0)) { if (!((d.st.bottle || 0) > 0)) d.at = 0; return; }
            d.at = (d.at || 0) + dt;
            while (d.at >= AS.time && (d.st.bottle || 0) > 0) {
                d.at -= AS.time; d.st.bottle--; if (d.st.bottle <= 0) delete d.st.bottle;
                let g = asuGas(); d.st[g] = (d.st[g] || 0) + 1; if (ind.panel === 'asu') ind.panelDirty = true;
            }
        };
        IND_DEV_HTML.asu = function (d) {
            let V = indDevVolt(d);
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">空气分离塔</div><div style="line-height:1.7;">电压 <b>' + V.toFixed(1) + ' V</b>（额定 24 V）' + (d.pw && (d.st.bottle || 0) > 0 ? '　正在分 ' + Math.floor((d.at || 0) / AS.time * 100) + '%' : '') + '</div>' +
                '<div style="margin-top:4px;">里面：' + nkDevItems(d) + '</div><div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { return k === 'bottle'; }) || '<div style="color:#999;padding:6px 0;">身上没有空玻璃瓶</div>') + NK_FOOT(d);
        };
        IND_CRAFT.push({ out: 'dev_asu', in: { steel: 10, dev_comp: 1, motor: 1, wire: 10, glass_plate: 2 }, hard: true });
        IND_CRAFT.push({ out: 'bulb_ar', in: { bulb_dead: 1, battery_li: 1, b_ar: 1 }, back: { bottle: 1 }, hard: true });
        // 配方下标存在炉子里，新的只能加在表最后：带保护气炼钢（20 秒，原来 40 秒），还空瓶
        ['charcoal', 'coal'].forEach(function (c) {
            ['b_n2', 'b_ar'].forEach(function (g) { IND_RECIPES.push({ in: { ingot_fe: 1, [c]: 1, [g]: 1 }, out: { hot_steel: 1, bottle: 1 }, cls: 'smelt', minT: 1100, time: AS.fast, pri: true, hard: true }); });
        });
        // 氮气瓶对着篝火右键：灭火，还空瓶
        function asuFire(k, a) {
            if (k !== 'b_n2' || !a || a.kind !== 'fire') return false;
            a.o.fuel = 0; indBagDel('b_n2', 1); indBoxAdd('bottle', 1); return true;
        }
