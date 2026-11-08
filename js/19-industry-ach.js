// 猫盾工业：成就（任务 64）。放在 19-industry-cold.js 后面。
// 数据：ind.base.ach = { id: 获得时的游戏时间 }（跟着基地存档）；ind.base.achT = { 动物: 1 } 驯服过哪几种。
// 标 hide 的没拿到之前列表里完全不出现，拿到才出现；没标的一开始就写名字和条件。"已获得 N / 总数"的总数只算没标隐藏的 + 已经拿到的隐藏的。
// 还没接的：上天（等火箭）。pic1 = 电池组短路爆炸一次（拿铜线点电池组再点同一个）。我的刀盾、我的猫盾和两条狗叫的在 19-industry-mob.js 里加（任务 70）。
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
            { id: 'pic1', hide: 1, pic: 1, ico: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="1.2" stroke-linecap="round"><path d="M10 19H4V5H20V19H14"/><line x1="10" y1="15.5" x2="10" y2="22.5"/><line x1="14" y1="17" x2="14" y2="21" stroke-width="2.8"/></svg>', name: '"燃"起来了', desc: '电池组短路爆炸一次' },
            { id: 'bulb', ico: '💡', name: '会发光！', desc: '获得灯泡' },
            // 任务 102：作者 11-08 新定的
            { id: 'fridge', ico: '🧊', name: '这里是冬天', desc: '获得冰箱' },
            { id: 'icecream', ico: '🍦', name: '夏天最爱', desc: '获得冰淇淋或冰棍' },
            { id: 'crusher', ico: '⚙️', name: '粉碎机粉碎粉碎机', desc: '获得粉碎机' },
            { id: 'gyro', ico: '🌀', name: '陀螺旋转', desc: '获得离心机' },
            { id: 'cake', ico: '🟡', name: '能吃吗', desc: '获得黄饼' },
            { id: 'cake3', hide: 1, ico: '🥮', name: '饼饼饼', desc: '获得 3 个黄饼' },
            // 主线（到火箭的路，有先后，画成一条链）：名字作者还没定，先用物品名（docs/achievements.md）
            { id: 'm_steel', main: 1, ico: '🔧', name: '钢锭', desc: '获得钢锭' },
            { id: 'm_al', main: 2, ico: '🥫', name: '铝锭', desc: '获得铝锭' },
            { id: 'm_el', main: 3, ico: '⚡', name: '电解槽', desc: '获得电解槽' },
            { id: 'm_asu', main: 4, ico: '🌬️', name: '空气分离塔', desc: '获得空气分离塔' }
        ];
        // 关系图的线（任务 102，docs/achievements.md "相关"那一列）：只表示有关联，不分先后；主线按 main 的顺序连成一条链
        const ACH_REL = [['iron', 'bronze'], ['bulb', 'iron'], ['ice3', 'fridge'], ['icecream', 'fridge'], ['gyro', 'crusher'], ['cake', 'crusher'], ['cake3', 'cake'], ['bark3arm', 'dogsword']];
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
        function achOwn(k, devTy) {
            let B = ind.base; if (ind.bag[k] > 0) return true;
            if (devTy && (B.devs || []).some(function (d) { return d.ty === devTy; })) return true;
            return (B.chests || []).some(function (c) { return c.items && c.items[k] > 0; });
        }
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
            // 任务 102 新的：背包里有、放好的设备、箱子里有都算（老存档已经有冰箱的，读档后下一次检查补发）
            [['fridge', 'dev_fridge', 'fridge'], ['crusher', 'dev_crusher', 'crusher'], ['gyro', 'dev_centrifuge', 'centrifuge'], ['cake', 'yellowcake'], ['m_steel', 'steel'], ['m_al', 'ingot_al'], ['m_el', 'dev_el', 'el'], ['m_asu', 'dev_asu', 'asu']].forEach(function (x) { if (!achGot(x[0]) && achOwn(x[1], x[2])) indAch(x[0]); });
            if (!achGot('icecream') && (achOwn('ice_cream') || achOwn('popsicle'))) indAch('icecream');
            if (!achGot('cake3') && (ind.bag.yellowcake || 0) >= 3) indAch('cake3');
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
        // 成就界面（任务 102）：一张关系图，一个成就一个点，有关联就画一条线（线不分先后，主线除外：主线在最上面一条链）。
        // 隐藏的：连着的成就拿到之前完全不出现；连着的拿到了就以"？？"出现、连着线；拿到才写名字和条件；没有连线的隐藏成就拿到才出现。
        // "已获得 N / 总数"：总数只算没标隐藏的 + 已经拿到的隐藏的（跟以前一样）
        function indAchRel(id) { let o = []; ACH_REL.forEach(function (e) { if (e[0] === id) o.push(e[1]); else if (e[1] === id) o.push(e[0]); }); return o; }
        function indAchState(a, A) {
            if (A[a.id] !== undefined) return 'got';
            if (!a.hide) return 'todo';
            return indAchRel(a.id).some(function (r) { return A[r] !== undefined; }) ? 'q' : 'none';
        }
        function achPanel() {
            if (!ind) return;
            let A = ind.base.ach || {}, st = {}; ACH.forEach(function (a) { st[a.id] = indAchState(a, A); });
            let vis = ACH.filter(function (a) { return st[a.id] !== 'none'; });
            let n = ACH.filter(function (a) { return A[a.id] !== undefined; }).length, tot = ACH.filter(function (a) { return !a.hide || A[a.id] !== undefined; }).length;
            // 排位置：主线一行；别的按连在一起的分组，一组一行（组里按图的顺序走），单个的五个一行
            let W = 86, H = 104, pos = {}, row = 0, seen = {};
            let main = vis.filter(function (a) { return a.main; }).sort(function (x, y) { return x.main - y.main; });
            main.forEach(function (a, i) { pos[a.id] = { x: i, y: row }; seen[a.id] = 1; }); if (main.length) row++;
            let visId = {}; vis.forEach(function (a) { visId[a.id] = 1; });
            let singles = [];
            vis.forEach(function (a) {
                if (seen[a.id]) return;
                let comp = [], q = [a.id]; seen[a.id] = 1;
                while (q.length) { let id = q.shift(); comp.push(id); indAchRel(id).forEach(function (r) { if (visId[r] && !seen[r]) { seen[r] = 1; q.push(r); } }); }
                if (comp.length === 1) { singles.push(comp[0]); return; }
                comp.forEach(function (id, i) { pos[id] = { x: i % 5, y: row + Math.floor(i / 5) }; }); row += Math.ceil(comp.length / 5);
            });
            singles.forEach(function (id, i) { pos[id] = { x: i % 5, y: row + Math.floor(i / 5) }; }); row += Math.ceil(singles.length / 5);
            let cx = function (id) { return pos[id].x * W + W / 2; }, cy = function (id) { return pos[id].y * H + 26; };
            let lines = [];
            ACH_REL.forEach(function (e) { if (pos[e[0]] && pos[e[1]]) lines.push([e[0], e[1], false]); });
            for (let i = 1; i < main.length; i++) lines.push([main[i - 1].id, main[i].id, true]);
            let svg = '<svg class="ach-lines" width="' + 5 * W + '" height="' + Math.max(1, row) * H + '" style="position:absolute;left:0;top:0;pointer-events:none;">' + lines.map(function (l) { return '<line data-a="' + l[0] + '" data-b="' + l[1] + '" x1="' + cx(l[0]) + '" y1="' + cy(l[0]) + '" x2="' + cx(l[1]) + '" y2="' + cy(l[1]) + '" stroke="' + (l[2] ? '#5e35b1' : '#b0bec5') + '" stroke-width="' + (l[2] ? 3 : 2) + '"' + (l[2] ? '' : ' stroke-dasharray="4 3"') + '/>'; }).join('') + '</svg>';
            let nodes = vis.map(function (a) {
                let s2 = st[a.id], got = s2 === 'got', p = pos[a.id];
                let ico = s2 === 'q' ? '<b style="font-size:20px;color:#999;">？</b>' : a.ico;
                let body = s2 === 'q' ? '<b>？？</b>' : '<b>' + a.name + '</b><br><small style="color:#666;">' + a.desc + '</small>';
                return '<div class="ach-node" data-ach="' + a.id + '" style="position:absolute;left:' + p.x * W + 'px;top:' + p.y * H + 'px;width:' + W + 'px;text-align:center;font-size:12px;line-height:1.25;' + (got ? '' : 'opacity:.55;') + '">' +
                    '<div style="margin:0 auto;width:44px;height:44px;border-radius:50%;background:' + (got ? (a.main ? '#ede7f6' : '#fff8e1') : '#f5f5f5') + ';border:2px solid ' + (a.main ? '#5e35b1' : got ? '#ffb300' : '#cfd8dc') + ';display:flex;align-items:center;justify-content:center;font-size:22px;' + (got ? '' : 'filter:grayscale(1);') + '">' + ico + '</div>' + body + '</div>';
            }).join('');
            indPanelShow('ach', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">成就　已获得 ' + n + ' / ' + tot + '</div><div style="font-size:12px;color:#888;margin-bottom:4px;">线只是说它们有关系，先拿哪个都行；紫色那条是主线</div>' +
                '<div style="max-height:60vh;overflow:auto;"><div style="position:relative;width:' + 5 * W + 'px;height:' + Math.max(1, row) * H + 'px;">' + svg + nodes + '</div></div><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
        // 短路（成就 pic1）：拿着铜线对着有电的电池组点一下，再点同一个电池组 = 电池两端用线连起来，没有负载；3 秒后爆炸（半径 3 米）
        function scShortTry(d) {
            if (d.ty !== 'bank' || !(d.u > 0) || !(d.bats > 0) || !(ind.bag.wire > 0) || d.short > 0) return false;
            ind.wirePend = null; indBagDel('wire', 1); d.short = 3; ind.devDirty = true;
            indFlash('电池组两端接到一起了，在发烫'); return true;
        }
        function scTick(dt) {
            if (!ind || ind.where !== 'base' || !ind.base.devs) return;
            ind.base.devs.forEach(function (d) {
                if (!(d.short > 0)) return;
                d.short -= dt; if (d.short > 0) return;
                let x = d.x, z = d.z; indAch('pic1'); indBoom(x, z, 0, '电池组短路爆炸');
            });
        }
