// 猫盾工业：成就（任务 64）。放在 19-industry-cold.js 后面。
// 数据：ind.base.ach = { id: 获得时的游戏时间 }（跟着基地存档）；ind.base.achT = { 动物: 1 } 驯服过哪几种。
// 标 hide 的没拿到之前列表里完全不出现，拿到才出现；没标的一开始就写名字和条件。"已获得 N / 总数"的总数只算没标隐藏的 + 已经拿到的隐藏的。
// 还没接的：上天（等火箭）。pic1 = 电池组短路爆炸一次（拿铜线点电池组再点同一个）。我的刀盾、我的猫盾和两条狗叫的在 19-industry-mob.js 里加（任务 70）。
        const ACH = [
            { id: 'ice3', hide: 1, name: '冰冰冰', desc: '获得 3 块冰' },
            { id: 'p6767', hide: 1, name: '6767', desc: '往地上扔 67 个东西摆在一起' },
            { id: 'roast', name: '烤熟了！', desc: '中暑一次' },
            { id: 'poison', name: '有毒！', desc: '中毒一次' },
            { id: 'rad', name: '感觉有害', desc: '摸一次微弱辐射的东西' },
            { id: 'zoo', name: '动物图鉴', desc: '把所有能驯服的动物都驯服一次' },
            { id: 'bronze', name: '脱离原始人', desc: '获得青铜镐' },
            { id: 'iron', name: '铁器时代', desc: '获得铁' },
            { id: 'full', hide: 1, name: '塞不下了', desc: '把最大的背包塞满' },
            { id: 'mom', name: '妈妈的味道', desc: '做一道菜并吃一次' },
            { id: 'years', hide: 1, name: '我是来这里干嘛的？', desc: '呆满 3 年' },
            { id: 'pic1', hide: 1, pic: 1, ico: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#757575" stroke-width="1.2" stroke-linecap="round"><path d="M10 19H4V5H20V19H14"/><line x1="10" y1="15.5" x2="10" y2="22.5"/><line x1="14" y1="17" x2="14" y2="21" stroke-width="2.8"/></svg>', name: '"燃"起来了', desc: '电池组短路爆炸一次' },
            { id: 'bulb', name: '会发光！', desc: '获得灯泡' },
            // 任务 102：作者 11-08 新定的
            { id: 'fridge', name: '这里是冬天', desc: '获得冰箱' },
            { id: 'icecream', name: '夏天最爱', desc: '获得冰淇淋或冰棍' },
            { id: 'crusher', name: '粉碎机粉碎粉碎机', desc: '获得粉碎机' },
            { id: 'gyro', name: '陀螺旋转', desc: '获得离心机' },
            { id: 'cake', name: '能吃吗', desc: '获得黄饼' },
            { id: 'cake3', hide: 1, name: '饼饼饼', desc: '获得 3 个黄饼' },
            // 主线（到火箭的路，有先后，画成一条链）：名字作者还没定，先用物品名（docs/achievements.md）
            { id: 'm_steel', main: 1, name: '钢锭', desc: '获得钢锭' },
            { id: 'm_al', main: 2, name: '铝锭', desc: '获得铝锭' },
            { id: 'm_el', main: 3, name: '电解槽', desc: '获得电解槽' },
            { id: 'm_asu', main: 4, name: '空气分离塔', desc: '获得空气分离塔' }
        ];

        // 成就图标：全是画的，不用 emoji（作者 11-19）。每个一个 24 × 24 的 svg，颜色区分
        const ACH_SVG = (function () {
            let W = function (inner) { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#455a64" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'; };
            return {
                ice3: W('<rect x="3" y="11" width="8" height="8" rx="1.5" fill="#b3e5fc"/><rect x="13" y="11" width="8" height="8" rx="1.5" fill="#b3e5fc"/><rect x="8" y="3" width="8" height="8" rx="1.5" fill="#e1f5fe"/>'),
                p6767: W('<text x="12" y="17" text-anchor="middle" font-size="13" font-weight="bold" fill="#5e35b1" stroke="none">67</text>'),
                roast: W('<path d="M12 3C14 7 18 9 18 14a6 6 0 0 1-12 0c0-3 2-4 3-6 1 1 1 2 2 2 0-3-1-5 1-7z" fill="#ff7043"/>'),
                poison: W('<circle cx="12" cy="11" r="7" fill="#eceff1"/><circle cx="9" cy="10" r="1.6" fill="#37474f"/><circle cx="15" cy="10" r="1.6" fill="#37474f"/><path d="M9 20v-3M12 20v-3M15 20v-3"/>'),
                rad: W('<circle cx="12" cy="12" r="9" fill="#fff59d"/><circle cx="12" cy="12" r="1.8" fill="#37474f"/><path d="M12 12L12 4M12 12L19 16M12 12L5 16" stroke-width="2"/>'),
                zoo: W('<ellipse cx="12" cy="16" rx="5" ry="4" fill="#a1887f"/><circle cx="6" cy="10" r="2" fill="#a1887f"/><circle cx="10" cy="6" r="2" fill="#a1887f"/><circle cx="14" cy="6" r="2" fill="#a1887f"/><circle cx="18" cy="10" r="2" fill="#a1887f"/>'),
                bronze: W('<path d="M5 20L16 9" stroke="#6d4c41" stroke-width="2"/><path d="M6 8Q12 2 20 8L18 10Q13 6 8 10Z" fill="#b87333"/>'),
                iron: W('<path d="M12 3l7 4v10l-7 4-7-4V7z" fill="#90a4ae"/><path d="M12 3v18M5 7l14 10M19 7L5 17" stroke-width="0.8"/>'),
                full: W('<rect x="6" y="8" width="12" height="13" rx="3" fill="#8d6e63"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><rect x="9" y="14" width="6" height="4" rx="1" fill="#a1887f"/>'),
                mom: W('<path d="M4 12h16a8 8 0 0 1-16 0z" fill="#ffcc80"/><path d="M8 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4"/>'),
                years: W('<circle cx="12" cy="12" r="9" fill="#fff8e1"/><path d="M12 6v6l4 2"/>'),
                bulb: W('<circle cx="12" cy="10" r="6" fill="#fff176"/><path d="M9 17h6M10 20h4"/>'),
                fridge: W('<rect x="6" y="3" width="12" height="18" rx="2" fill="#e3f2fd"/><path d="M6 10h12M9 6v2M9 13v3"/>'),
                icecream: W('<path d="M8 12l4 9 4-9z" fill="#ffcc80"/><circle cx="12" cy="9" r="5" fill="#f8bbd0"/>'),
                crusher: W('<circle cx="12" cy="12" r="5" fill="#b0bec5"/><circle cx="12" cy="12" r="1.8" fill="#fff"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke-width="2"/>'),
                gyro: W('<circle cx="12" cy="12" r="9" fill="#e1bee7"/><path d="M12 12m-1 0a1 1 0 1 1 2 0a3 3 0 1 1-4 0a5 5 0 1 1 8 0"/>'),
                cake: W('<circle cx="12" cy="12" r="8" fill="#fdd835"/><circle cx="9" cy="10" r="1.2" fill="#f9a825"/><circle cx="14" cy="14" r="1.2" fill="#f9a825"/>'),
                cake3: W('<circle cx="7" cy="14" r="5" fill="#fdd835"/><circle cx="17" cy="14" r="5" fill="#fdd835"/><circle cx="12" cy="8" r="5" fill="#fdd835"/>'),
                m_steel: W('<path d="M3 17l3-9h12l3 9z" fill="#90a4ae"/><path d="M6 8l-1 5M18 8l1 5" stroke-width="0.8"/>'),
                m_al: W('<path d="M7 5h10v14a5 2 0 0 1-10 0z" fill="#cfd8dc"/><ellipse cx="12" cy="5" rx="5" ry="2" fill="#eceff1"/>'),
                m_el: W('<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="#ffd54f"/>'),
                m_asu: W('<path d="M3 8c3-3 5 3 8 0s5 3 8 0M3 13c3-3 5 3 8 0s5 3 8 0M3 18c3-3 5 3 8 0s5 3 8 0" stroke="#4fc3f7" stroke-width="1.8"/>'),
                dogsword: W('<circle cx="12" cy="13" r="6" fill="#bcaaa4"/><path d="M6 9L4 4l5 2M18 9l2-5-5 2"/><circle cx="10" cy="12" r="1" fill="#37474f"/><circle cx="14" cy="12" r="1" fill="#37474f"/>'),
                catshield: W('<circle cx="12" cy="13" r="6" fill="#ffcc80"/><path d="M6 11l1-7 4 3M18 11l-1-7-4 3"/><circle cx="10" cy="12" r="1" fill="#37474f"/><circle cx="14" cy="12" r="1" fill="#37474f"/>'),
                bark3: W('<path d="M4 10h5l7-5v14l-7-5H4z" fill="#ff8a65"/><path d="M19 9c1 2 1 4 0 6"/>'),
                bark3arm: W('<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" fill="#90a4ae"/><path d="M12 8v9M8 12h8"/>')
            };
        })();
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
            // 位置：像随手撒在一张大画布上（作者 11-19）。位置、大小、角度按成就 id 算出来，固定种子，每次打开一样，新出现一个别的也不跟着挪
            let NW = 118, CW = 150, CH = 132, COLS = 6, rowsN = Math.ceil(ACH.length / COLS), pos = {};
            let achH = function (str, salt) { let h = 2166136261 ^ salt; for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
            let order = ACH.map(function (a) { return a.id; }).sort(function (x, y) { return achH(x, 7) - achH(y, 7) || (x < y ? -1 : 1); });
            order.forEach(function (id, k) {
                let c = k % COLS, r = Math.floor(k / COLS), sc = 0.92 + achH(id, 3) * 0.28, rot = (achH(id, 5) - 0.5) * 9;
                pos[id] = { x: 30 + c * CW + (achH(id, 11) - 0.5) * 56 + (r % 2 ? 30 : 0), y: 30 + r * CH + (achH(id, 13) - 0.5) * 44, sc: sc, rot: rot };
            });
            let canvasW = 60 + COLS * CW + 60, canvasH = 60 + rowsN * CH + 40;
            let main = vis.filter(function (a) { return a.main; }).sort(function (x, y) { return x.main - y.main; });
            let cx = function (id) { return pos[id].x + NW / 2; }, cy = function (id) { return pos[id].y + 26 * pos[id].sc; };
            let lines = [];
            ACH_REL.forEach(function (e) { if (st[e[0]] !== 'none' && st[e[1]] !== 'none' && pos[e[0]] && pos[e[1]]) lines.push([e[0], e[1], false]); });
            for (let i = 1; i < main.length; i++) lines.push([main[i - 1].id, main[i].id, true]);
            let svg = '<svg class="ach-lines" width="' + canvasW + '" height="' + canvasH + '" style="position:absolute;left:0;top:0;pointer-events:none;">' + lines.map(function (l) { return '<line data-a="' + l[0] + '" data-b="' + l[1] + '" x1="' + cx(l[0]).toFixed(1) + '" y1="' + cy(l[0]).toFixed(1) + '" x2="' + cx(l[1]).toFixed(1) + '" y2="' + cy(l[1]).toFixed(1) + '" stroke="' + (l[2] ? '#5e35b1' : '#b0bec5') + '" stroke-width="' + (l[2] ? 3 : 2) + '"' + (l[2] ? '' : ' stroke-dasharray="4 3"') + '/>'; }).join('') + '</svg>';
            let nodes = vis.map(function (a) {
                let s2 = st[a.id], got = s2 === 'got', p = pos[a.id];
                let ico = s2 === 'q' ? '<b style="font-size:20px;color:#999;">？</b>' : (a.pic ? a.ico : (ACH_SVG[a.id] || a.ico || ''));
                let body = s2 === 'q' ? '<b>？？</b>' : '<b>' + a.name + '</b><br><small style="color:#666;">' + a.desc + '</small>';
                return '<div class="ach-node" data-ach="' + a.id + '" style="position:absolute;left:' + p.x.toFixed(1) + 'px;top:' + p.y.toFixed(1) + 'px;width:' + NW + 'px;text-align:center;font-size:12px;line-height:1.25;user-select:none;transform-origin:50% 26px;transform:rotate(' + p.rot.toFixed(1) + 'deg) scale(' + p.sc.toFixed(2) + ');' + (got ? '' : 'opacity:.55;') + '">' +
                    '<div style="margin:0 auto;width:44px;height:44px;border-radius:50%;background:' + (got ? (a.main ? '#ede7f6' : '#fff8e1') : '#f5f5f5') + ';border:2px solid ' + (a.main ? '#5e35b1' : got ? '#ffb300' : '#cfd8dc') + ';display:flex;align-items:center;justify-content:center;font-size:22px;' + (got ? '' : 'filter:grayscale(1);') + '">' + ico + '</div>' + body + '</div>';
            }).join('');
            let P0 = ind.achPan = ind.achPan || { x: 0, y: 0 };
            indPanelShow('ach', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">成就　已获得 ' + n + ' / ' + tot + '</div><div style="font-size:12px;color:#888;margin-bottom:4px;">按住拖着画面走，滚轮也行；线只是说它们有关系，先拿哪个都行；紫色那条是主线</div>' +
                '<div id="ach-view" style="position:relative;height:min(60vh,460px);overflow:hidden;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa;cursor:grab;touch-action:none;" onpointerdown="achDragDown(event)" onpointermove="achDragMove(event)" onpointerup="achDragUp(event)" onpointercancel="achDragUp(event)" onwheel="achWheel(event)">' +
                '<div id="ach-canvas" style="position:absolute;left:0;top:0;width:' + canvasW + 'px;height:' + canvasH + 'px;transform:translate(' + P0.x + 'px,' + P0.y + 'px);">' + svg + nodes + '</div></div><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            { let v = document.getElementById('ach-view'); if (v) achPanClamp(v); }
        }
        // 成就画布：整张画布拖着走（鼠标按住拖、触屏手指拖、滚轮），拖的是画布不是成就，成就自己不能被拖走
        function achPanClamp(v) {
            let c = document.getElementById('ach-canvas'); if (!v || !c || !ind) return;
            let P = ind.achPan = ind.achPan || { x: 0, y: 0 }, vw = v.clientWidth, vh = v.clientHeight, cw = c.offsetWidth, ch = c.offsetHeight;
            P.x = Math.min(0, Math.max(Math.min(0, vw - cw), P.x)); P.y = Math.min(0, Math.max(Math.min(0, vh - ch), P.y));
            c.style.transform = 'translate(' + P.x + 'px,' + P.y + 'px)';
        }
        function achDragDown(e) { if (!ind) return; let P = ind.achPan = ind.achPan || { x: 0, y: 0 }; ind.achDrag = { x: e.clientX, y: e.clientY, px: P.x, py: P.y }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { } e.currentTarget.style.cursor = 'grabbing'; }
        function achDragMove(e) { let D = ind && ind.achDrag; if (!D) return; ind.achPan.x = D.px + (e.clientX - D.x); ind.achPan.y = D.py + (e.clientY - D.y); achPanClamp(e.currentTarget); }
        function achDragUp(e) { if (ind) ind.achDrag = null; try { e.currentTarget.style.cursor = 'grab'; } catch (x) { } }
        function achWheel(e) { if (!ind) return; e.preventDefault(); let P = ind.achPan = ind.achPan || { x: 0, y: 0 }; P.x -= e.deltaX; P.y -= e.deltaY; achPanClamp(e.currentTarget); }
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
