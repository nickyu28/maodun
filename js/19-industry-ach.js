// 猫盾工业：成就（任务 64）。放在 19-industry-cold.js 后面。
// 数据：ind.base.ach = { id: 获得时的游戏时间 }（跟着基地存档）；ind.base.achT = { 动物: 1 } 驯服过哪几种。
// 标 hide 的没拿到之前列表里完全不出现，拿到才出现；没标的一开始就写名字和条件。"已获得 N / 总数"的总数只算没标隐藏的 + 已经拿到的隐藏的。
// 还没接的：上天（等火箭）、pic1（游戏里没有短路这件事：电源和电源不能直接接）。我的刀盾、我的猫盾和两条狗叫的在 19-industry-mob.js 里加（任务 70）。
        const ACH = [
            { id: 'ice3', hide: 1, ico: '❄️', name: '冰冰冰', desc: '获得 3 块冰' },
            { id: 'p6767', hide: 1, ico: '🔢', name: '6767', desc: '往地上扔 67 个东西摆在一起' },
            { id: 'roast', ico: '🔥', name: '烤熟了！', desc: '中暑一次' },
            { id: 'poison', ico: '☠️', name: '有毒！', desc: '中毒一次' },
            { id: 'rad', ico: '☢️', name: '感觉有害', desc: '摸一次微弱辐射的东西' },
            { id: 'zoo', ico: '🐾', name: '动物图鉴', desc: '把所有能驯服的动物都驯服一次' },
            { id: 'bronze', ico: '⛏️', name: '脱离原始人', desc: '获得青铜镐' },
            { id: 'iron', ico: '🔩', name: '铁器时代', desc: '获得铁' },
            { id: 'full', hide: 1, ico: '🎒', name: '塞不下了', desc: '把最大的背包塞满' },
            { id: 'mom', ico: '🍲', name: '妈妈的味道', desc: '做一道菜并吃一次' },
            { id: 'years', hide: 1, ico: '⏳', name: '我是来这里干嘛的？', desc: '呆满 3 年' },
            { id: 'bulb', ico: '💡', name: '会发光！', desc: '获得灯泡' }
        ];
        const ACH_BY = {}; ACH.forEach(function (a) { ACH_BY[a.id] = a; });
        const ACH_DISH = { meat_roast: 1, meat_soup: 1, bake_potato: 1, bake_corn: 1, bread: 1, tomato_soup: 1, radish_soup: 1, cabbage_stew: 1, pickle: 1, pumpkin_pie: 1, cheese: 1, cactus_roast: 1, cactus_peeled: 1 };
        function achGot(id) { return !!(ind && ind.base && ind.base.ach && ind.base.ach[id] !== undefined); }
        // 拿到：没拿过就记上、弹一条提示；拿过的什么都不做
        function indAch(id) {
            if (!ind || !ind.base || !ACH_BY[id]) return false;
            let A = ind.base.ach = ind.base.ach || {}; if (A[id] !== undefined) return false;
            A[id] = ind.base.clock || 0;
            indFlash('成就：' + ACH_BY[id].name); ind.hudSig = ''; if (ind.panel === 'ach') ind.panelDirty = true;
            return true;
        }
        function achHurt(key) { if (key === 'heat') indAch('roast'); else if (key === 'gas') indAch('poison'); }
        function achTame(k) {
            let B = ind.base; B.achT = B.achT || {}; B.achT[k] = 1;
            if (Object.keys(IND_ANIMALS).every(function (a) { return !(IND_ANIMALS[a].tame > 0) || B.achT[a]; })) indAch('zoo');
        }
        function achEat(k) { if (ACH_DISH[k]) indAch('mom'); }
        function achHas(k) { return !!(ind.bag[k] > 0); }
        let ACH_MAXBAG = 0;
        function achMaxBag() { if (!ACH_MAXBAG) ACH_MAXBAG = IND_BAG_SLOTS + Object.keys(IND_ITEMS).reduce(function (m, k) { return Math.max(m, IND_ITEMS[k].wear === 'back' && IND_ITEMS[k].slots || 0); }, 0); return ACH_MAXBAG; }
        // 每半秒看一次：身上有什么、背包满没满、住了多久、地上摆了多少
        function achTick() {
            if (!ind || !ind.base || ind.dead || !ind.base.rule) return;
            if (ind.achT > ind.t) return; ind.achT = ind.t + 0.5;
            if (!achGot('ice3') && (ind.bag.ice || 0) >= 3) indAch('ice3');
            if (!achGot('iron') && achHas('ingot_fe')) indAch('iron');
            if (!achGot('bronze') && (achHas('pick_bronze') || achHas('pick_brass'))) indAch('bronze');
            if (!achGot('bulb') && achHas('bulb')) indAch('bulb');
            if (!achGot('rad') && Object.keys(ind.bag).some(function (k) { return IND_ITEMS[k] && IND_ITEMS[k].rad === 'vweak'; }) && !ind.radHurt) indAch('rad');
            if (!achGot('full') && indBagSlots() >= achMaxBag() && indSlotsOf(ind.bag) >= indBagSlots()) indAch('full');
            if (!achGot('years') && indDayNo() >= 37) indAch('years');
            if (!achGot('p6767') && ind.where === 'base') {
                let G = ind.base.ground; if (G.length >= 67 && G.some(function (a) { let n = 0; for (let i = 0; i < G.length; i++) if (Math.hypot(G[i].x - a.x, G[i].z - a.z) <= 6) n++; return n >= 67; })) indAch('p6767');
            }
        }
        function achFixBase(b) {
            let A = {}; if (b.ach && typeof b.ach === 'object') Object.keys(b.ach).forEach(function (k) { if (ACH_BY[k]) A[k] = indNum(b.ach[k], 0, 0, 1e9); });
            b.ach = A;
            let T = {}; if (b.achT && typeof b.achT === 'object') Object.keys(b.achT).forEach(function (k) { if (IND_ANIMALS[k]) T[k] = 1; });
            b.achT = T;
        }
        function achPanel() {
            if (!ind) return;
            let A = ind.base.ach || {}, vis = ACH.filter(function (a) { return !a.hide || A[a.id] !== undefined; }), n = vis.filter(function (a) { return A[a.id] !== undefined; }).length;
            let rows = vis.map(function (a) {
                let got = A[a.id] !== undefined;
                return '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #eee;' + (got ? '' : 'opacity:.55;') + '"><span style="font-size:24px;width:32px;text-align:center;' + (got ? '' : 'filter:grayscale(1);') + '">' + a.ico + '</span><span><b>' + a.name + '</b><br><small style="color:#666;">' + a.desc + '</small></span></div>';
            }).join('');
            indPanelShow('ach', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">成就　已获得 ' + n + ' / ' + vis.length + '</div><div style="max-height:60vh;overflow:auto;">' + rows + '</div><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
