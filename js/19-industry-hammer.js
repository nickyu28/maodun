// 猫盾工业：锤子分材质、有耐久（作者 11-19）。放在 19-industry-shade.js 后面。
// 石锤、青铜锤、铁锤（key 还叫 hammer）、钢锤四档，材质越好耐久越高、补工具时一个锭补得越多（石 0.6、青铜 0.8、铁 1、钢 1.25 倍）；
// 放在背包里工作台就认（四种都行，用最好的那把），每锻一次工具、每补一次耐久，磨损用的那把 1 点，用坏了变成坏了的锤子，回收一半主料。
// 成就「套娃？」：背包里已经有一把青铜锤的时候，再做出一把青铜锤。
        const HMR = { order: ['hammer_steel', 'hammer', 'hammer_bronze', 'hammer_stone'], dura: { hammer_stone: 60, hammer_bronze: 150, hammer: 300, hammer_steel: 700 }, boost: { hammer_stone: 0.6, hammer_bronze: 0.8, hammer: 1, hammer_steel: 1.25 }, tier: { hammer_stone: 'stone', hammer_bronze: 'bronze', hammer: 'iron', hammer_steel: 'steel' }, back: { hammer_stone: 'stone', hammer_bronze: 'bronze', hammer: 'ingot_fe', hammer_steel: 'steel' }, name: { hammer_stone: '石锤', hammer_bronze: '青铜锤', hammer: '铁锤', hammer_steel: '钢锤' } };
        function hmBest() { for (let i = 0; i < HMR.order.length; i++) if ((ind.bag[HMR.order[i]] || 0) > 0) return HMR.order[i]; return null; }
        function hmHave() { return !!hmBest(); }
        function hmBoost() { let k = hmBest(); return k ? HMR.boost[k] : 1; }
        function hmWear() { let k = hmBest(); if (k && TL_TOOL[k]) tlUse(k); }
        (function () {
            let add = {};
            add.hammer_bronze = { name: '青铜锤', col: 0xb87333, use: '放在背包里，工作台锻工具、补耐久用，会磨损' };
            add.hammer_steel = { name: '钢锤', col: 0x90a4ae, use: '放在背包里，工作台锻工具、补耐久用，会磨损' };
            Object.assign(IND_ITEMS_RAW, add);
            IND_ITEMS_RAW.hammer_stone.use = '放在背包里，工作台锻工具、补耐久用，会磨损';
            IND_ITEMS_RAW.hammer.use = '放在背包里，工作台锻工具、补耐久用，会磨损';
            IND_ITEMS_RAW.hammer.name = '铁锤';
            HMR.order.forEach(function (k) {
                TL_TOOL[k] = { kind: 'hammer', tier: HMR.tier[k], dura: HMR.dura[k], back: HMR.back[k] };
                IND_ITEMS_RAW['broken_' + k] = { name: '坏了的' + HMR.name[k], col: 0x616161, use: '工作台：回收一半主料' };
                IND_CRAFT.push({ out: HMR.back[k], n: 1, in: { ['broken_' + k]: 1 }, hard: true, off: HMR.tier[k] !== 'stone' });   // 金属的坏锤子不在工作台回收（跟别的金属工具一样放进炉子熔）
            });
            if (typeof TL_KIND_NAME !== 'undefined') TL_KIND_NAME.hammer = '锤子';
            IND_CRAFT.push({ out: 'hammer_bronze', in: { bronze: 2, handle: 1 }, need: 'hammer', hard: true }, { out: 'hammer_steel', in: { steel: 2, handle: 1 }, need: 'hammer', hard: true });
            // 成就：套娃？
            ACH.push({ id: 'nest', pic: 1, ico: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8d6e63" stroke-width="1.4" stroke-linecap="round"><path d="M5 19L15 9"/><rect x="12" y="4" width="8" height="5" rx="1" transform="rotate(45 16 6.5)" fill="#b87333"/><path d="M4 12L9 7"/><rect x="2" y="3" width="5" height="3" rx="0.8" transform="rotate(45 4.5 4.5)" fill="#b87333"/></svg>', name: '套娃？', desc: '用青铜锤做一把青铜锤' });
            ACH_BY.nest = ACH[ACH.length - 1];
        })();
