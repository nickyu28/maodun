// 猫盾工业 · 炉子的进出口：进料漏斗、出料槽（砖槽、铁槽）、桶装石油、踹炉子
// 接在 19-industry.js 后面，用它里面的函数和表。硬核：漏斗和出料槽要合成、桶不能直接放进炉子、可以踹炉子；悠闲保持简单（出料槽自动带、拿油桶对着炉子右键就倒进去、没有踹）。
        // 炉子状态里多两个字段：spoutTy 出料槽（'auto' 悠闲自动带的、'brick' 砖槽、'iron' 铁槽、null 没装；没这个字段的老对象当 'auto'）、funnel 进料漏斗（null 或 { ty, oil }）
        const CK_SPOUT = {
            auto: { name: '出料槽', cool: 30, maxT: 1e9 },
            brick: { name: '砖槽', cool: 60, maxT: 1200 },
            iron: { name: '铁槽', cool: 20, maxT: 1400 }
        };
        const CK_FUNNEL = { brick: { name: '砖漏斗' }, iron: { name: '铁漏斗' } };
        const CK_MELT = { hot_cu: 1085, hot_zn: 420, hot_sn: 232, hot_bronze: 950, hot_brass: 950, hot_pb: 327, hot_fe: 1538, hot_steel: 1550 };   // 烫锭的熔点：超过槽耐温的进不了槽，留在炉膛里
        const CK = { oilFuel: 600, funnelCap: 1200, funnelRate: 10, funnelKeep: 300, hearthCool: 150, kickR: 1.8, scatter: 1.5, kickCool: 60, oilMax: 4, oilRegen: 120 };

        Object.assign(IND_ITEMS_RAW, {
            spout_brick: { name: '砖槽', col: 0xbf5b3a, attach: 'spout', spoutTy: 'brick', use: '装在炉子旁，接铜、青铜、黄铜、锌、锡、铅，耐 1200°C，锭 60 秒凉' },
            spout_iron: { name: '铁槽', col: 0x78909c, attach: 'spout', spoutTy: 'iron', use: '装在炉子旁，接铜、青铜、黄铜、锌、锡、铅，耐 1400°C，锭 20 秒凉，接不住铁和钢' },
            funnel_brick: { name: '砖漏斗', col: 0xa1887f, attach: 'funnel', funnelTy: 'brick', use: '装在炉子旁，倒进去的油慢慢流进炉子' },
            funnel_iron: { name: '铁漏斗', col: 0x90a4ae, attach: 'funnel', funnelTy: 'iron', use: '装在炉子旁，倒进去的油慢慢流进炉子' }
        });
        IND_CRAFT.push(
            { out: 'spout_brick', in: { brick: 4 }, hard: true }, { out: 'spout_iron', in: { ingot_fe: 3 }, hard: true },
            { out: 'funnel_brick', in: { brick: 3 }, hard: true }, { out: 'funnel_iron', in: { ingot_fe: 2 }, hard: true }
        );

        // ── 出料槽 ──
        function ckSpoutOn(S) { return S.spoutTy !== null; }
        function ckSpoutDef(S) { return CK_SPOUT[S.spoutTy || 'auto'] || CK_SPOUT.auto; }
        // 这块烫锭这个炉子的槽接不接得住（没装槽、槽耐温不够都留在炉膛里）
        function ckSpoutTakes(S, k) { return ckSpoutOn(S) && (CK_MELT[k] === undefined || CK_MELT[k] <= ckSpoutDef(S).maxT); }
        function ckSig(C) { return (C.spoutTy === undefined ? 'a' : String(C.spoutTy)) + '|' + (C.funnel ? C.funnel.ty : ''); }
        function ckHotOf(k) { return IND_ITEMS_RAW[k] && IND_ITEMS_RAW[k].hot; }

        // ── 每个炉子每帧（indCookTick 开头调）：漏斗往炉子里流油；炉膛里的烫锭炉温降下来就凉 ──
        function ckTick(c, dt) {
            let S = c.C;
            if (S.funnel && S.funnel.oil > 0 && S.fuel < CK.funnelKeep) {   // 漏斗里的油限速往炉子里流，炉子里存的燃料够了就先不流
                let f = Math.min(CK.funnelRate * dt, S.funnel.oil, CK.funnelKeep - S.fuel);
                S.funnel.oil -= f; S.fuel += f;
                if (S.funnel.oil < 1e-6) S.funnel.oil = 0;
                if (ind.panel === 'stove') ind.panelDirty = true;
            }
            if (S.temp <= CK.hearthCool) Object.keys(S.out).forEach(function (k) {   // 炉火灭了、炉温降下来，炉膛里的烫锭就凉了
                let cool = ckHotOf(k); if (!cool) return;
                S.out[cool] = (S.out[cool] || 0) + S.out[k]; delete S.out[k];
                if (ind.panel === 'stove') ind.panelDirty = true;
            });
        }

        // ── 读档整理（indFixCook 调）──
        function ckFix(S, b) {
            if (!(S.spoutTy === null || CK_SPOUT[S.spoutTy])) S.spoutTy = undefined;
            if (S.spoutTy === undefined && b && b.rule) S.spoutTy = b.rule === 'hard' ? 'brick' : 'auto';   // 老档：硬核的炉子补一个砖槽（里面的锭不丢），悠闲照旧自带
            if (S.funnel && (typeof S.funnel !== 'object' || !CK_FUNNEL[S.funnel.ty])) S.funnel = null;
            if (S.funnel) S.funnel = { ty: S.funnel.ty, oil: indNum(S.funnel.oil, 0, 0, CK.funnelCap) };
            else S.funnel = null;
            if (S.spoutTy === null) {   // 没装槽：槽里不该有东西，有就挪回炉膛
                S.spout.forEach(function (e) { S.out[e.k] = (S.out[e.k] || 0) + 1; }); S.spout = [];
            }
        }
        // 新炉子的状态：悠闲自带出料槽，硬核没有（要合成），还没选规则的先不写
        function ckNewState() {
            let r = ind && ind.base && ind.base.rule;
            return { items: {}, out: {}, fuel: 0, fire: 0, temp: 20, cook: null, ashT: 0, spoutTy: r === 'hard' ? null : r === 'casual' ? 'auto' : undefined, funnel: null };
        }
        // 选规则时：悠闲的炉子自带槽；硬核的炉子没有槽；悠闲升级成硬核，已有的自带槽变成砖槽（里面的锭不丢）
        function ckRuleChanged(from, to) {
            let L = indCooks();
            L.forEach(function (c) {
                if (to === 'casual') { c.C.spoutTy = 'auto'; return; }
                if (from === 'casual' || c.C.spoutTy === 'auto') c.C.spoutTy = 'brick';
                else if (c.C.spoutTy === undefined) c.C.spoutTy = null;
            });
            ind.furnDirty = true;
        }

        // ── 装槽、装漏斗：拿着对炉子右键；长按右键收起（里面空的才行）──
        function ckCookOfAim(a) {
            if (!a) return null;
            if (a.kind === 'stove') return indCookById('stove');
            if (a.kind === 'cook') return indCookById(a.o.id);
            if (a.kind === 'spout' || a.kind === 'funnel') return a.o;
            return null;
        }
        function ckAttach(k, a) {
            let d = IND_ITEMS[k], c = ckCookOfAim(a);
            if (!indHard()) { indFlash('悠闲不用这个'); return false; }
            if (!c) { indFlash(d.name + '要装在炉子旁：对着灶台、小熔炉或大窑右键'); return false; }
            let S = c.C;
            if (d.attach === 'spout') {
                if (S.spoutTy !== null && S.spoutTy !== undefined) { indFlash(IND_COOK[c.ty].name + '已经有出料槽了'); return false; }
                indBagDel(k, 1); S.spoutTy = d.spoutTy; indSave(); ind.furnDirty = true;
                indFlash('装好了' + d.name + '：耐 ' + CK_SPOUT[d.spoutTy].maxT + '°C，锭 ' + CK_SPOUT[d.spoutTy].cool + ' 秒凉');
            } else {
                if (S.funnel) { indFlash(IND_COOK[c.ty].name + '已经有进料漏斗了'); return false; }
                indBagDel(k, 1); S.funnel = { ty: d.funnelTy, oil: 0 }; indSave(); ind.furnDirty = true;
                indFlash('装好了' + d.name + '：拿装了油的桶对着它右键');
            }
            return true;
        }
        function ckFunnelPos(c) { return { x: c.x - IND_COOK[c.ty].r - 0.9, z: c.z }; }
        // 收起：槽里没东西、漏斗里没油才行
        function ckPickPart(f) {
            let S = f.o, c = indCookById(f.cid);
            if (f.ty === 'spoutblk') {
                if (S.spoutTy === 'auto' || S.spoutTy === undefined || S.spoutTy === null) { indFlash('这个出料槽收不起来'); return false; }
                if (S.spout.length) { indFlash('先把槽里的锭取出来'); return false; }
                let k = 'spout_' + S.spoutTy;
                if (indBagAdd(k, 1) <= 0) { indFlash('背包满了'); return false; }
                S.spoutTy = null; ind.furnDirty = true; indSave(); indFlash('收起了' + indName(k)); return true;
            }
            if (!S.funnel) return false;
            if (S.funnel.oil > 0.5) { indFlash('漏斗里还有油，等它流完'); return false; }
            let k = 'funnel_' + S.funnel.ty;
            if (indBagAdd(k, 1) <= 0) { indFlash('背包满了'); return false; }
            S.funnel = null; ind.furnDirty = true; indSave(); indFlash('收起了' + indName(k)); return true;
        }

        // ── 桶装石油 ──
        // 拿装了油的桶右键：硬核对着漏斗倒；对着炉子给提示；悠闲对着炉子直接倒进去。空桶还给玩家（同一种材质）
        function ckPourOil(k, a) {
            let cc = indContOf(k), c = ckCookOfAim(a);
            if (!c) { indFlash(indHard() ? '对着炉子旁边的进料漏斗倒' : '对着灶台、小熔炉或大窑右键，把油倒进去'); return false; }
            let S = c.C;
            if (indHard()) {
                if (a.kind !== 'funnel') { indFlash(S.funnel ? '得用进料漏斗：对着漏斗倒' : '得用进料漏斗：先做一个装在炉子旁'); return false; }
                if (!S.funnel) return false;
                if (S.funnel.oil + CK.oilFuel > CK.funnelCap + 1e-6) { indFlash('漏斗装不下了，等它流一会儿'); return false; }
                indBagDel(k, 1); indBagAdd(indEmptyKey(cc.mat), 1); S.funnel.oil += CK.oilFuel;
                indSave(); indFlash('倒进漏斗了：油会慢慢流进炉子，空桶还你');
                return true;
            }
            indBagDel(k, 1); indBagAdd(indEmptyKey(cc.mat), 1); S.fuel += CK.oilFuel;
            indSave(); if (ind.panel === 'stove') ind.panelDirty = true;
            indFlash('倒进炉子了，燃料 +' + CK.oilFuel + '，空桶还你');
            return true;
        }
        // 油点（沙漠）：拿空桶右键装一桶，一次一桶；油点有存量（最多 4 桶），装走一桶过 2 分钟补回一桶
        function ckOilStock(o) {
            if (o.max === undefined) { o.max = CK.oilMax; o.n = Math.min(o.n === undefined ? CK.oilMax : o.n, CK.oilMax); o.t0 = ind.t; }
            if (o.n < o.max) { let g = Math.floor((ind.t - o.t0) / CK.oilRegen); if (g > 0) { o.n = Math.min(o.max, o.n + g); o.t0 += g * CK.oilRegen; } }
            return o.n;
        }
        function ckFillOil(k, o) {
            if (ckOilStock(o) < 1) { indFlash('油点空了，过一会儿会冒出来'); return false; }
            let m = indContOf(k).mat;
            if (o.n >= o.max) o.t0 = ind.t;
            o.n--; indBagDel(k, 1); indBagAdd(indFilledKey('oil', m), 1);
            ind.nodeDirty = true; indFlash('装了一桶石油（油点还剩 ' + o.n + ' 桶）');
            return true;
        }
        function ckOilHint(o) {
            let n = ckOilStock(o), left = n < o.max ? '　下一桶还要 ' + Math.max(1, Math.ceil(CK.oilRegen - (ind.t - o.t0))) + ' 秒' : '';
            return '油点　剩 ' + n + ' 桶' + left + '<br><small>' + (n > 0 ? '拿空桶右键：装一桶' : '空了，过一会儿会冒出来') + '（空手装不了）</small>';
        }

        // ── 踹炉子（硬核，按 V）──
        // 走到炉子旁边，不管多烫都能踹：炉膛里的东西（烫锭、没烧完的柴、灰、放着的料）全飞出来散在炉子周围 1.5 米内；炉火随之灭掉。踹的人按炉温扣血：< 300°C 不扣，300～800 扣 1～2，> 800 扣 2～4
        function ckKickDmg(T) { return T < 300 ? 0 : T < 800 ? 1 + Math.floor(indRand() * 2) : 2 + Math.floor(indRand() * 3); }
        function ckKick() {
            if (!ind || ind.over || ind.dead || ind.panel || ind.where !== 'base') return false;
            if (!indHard()) { indFlash('悠闲没有踹炉子'); return false; }
            let best = null, bd = 1e9, a = indAim();
            indCooks().forEach(function (c) { let d = Math.hypot(ind.p.x - c.x, ind.p.z - c.z) - IND_COOK[c.ty].r; if (d < CK.kickR && d < bd) { bd = d; best = c; } });
            if (a && (a.kind === 'cook' || a.kind === 'stove')) best = ckCookOfAim(a) || best;
            if (!best) { indFlash('旁边没有炉子（走到炉子旁边再踹）'); return false; }
            let S = best.C, T = S.temp, r0 = IND_COOK[best.ty].r, thrown = [];
            Object.keys(S.items).forEach(function (k) { for (let i = 0; i < S.items[k]; i++) thrown.push({ k: k }); });
            Object.keys(S.out).forEach(function (k) { for (let i = 0; i < S.out[k]; i++) thrown.push({ k: k, hot: !!ckHotOf(k) }); });
            for (let i = 0, w = Math.min(12, Math.floor(S.fuel / 60)); i < w; i++) thrown.push({ k: 'wood' });   // 没烧完的柴
            S.items = {}; S.out = {}; S.fuel = 0; S.fire = 0; S.cook = null; S.ashT = 0;
            let G = ind.base.ground, n = 0;
            thrown.slice(0, 60).forEach(function (t) {
                if (G.length >= IND_ITEM_CAP) return;
                let a2 = indRand() * Math.PI * 2, d = r0 + 0.2 + indRand() * CK.scatter;
                let g = { k: t.k, x: Math.max(-IND_BASE.x + 0.5, Math.min(IND_BASE.x - 0.5, best.x + Math.cos(a2) * d)), z: Math.max(-IND_BASE.z + 0.5, Math.min(IND_BASE.z - 0.5, best.z + Math.sin(a2) * d)) };
                if (t.hot) g.ht = CK.kickCool;   // 飞出来的烫锭在空气里自己凉，大约 60 秒
                G.push(g); n++;
            });
            ind.itemDirty = true; ind.furnDirty = true; ind.panelDirty = true; if (ind.panel === 'stove') indPanelStove();
            let dmg = ckKickDmg(T);
            indFlash('踹！' + (n ? n + ' 样东西飞出来了' : '炉子里本来就没东西'));
            indSave();
            if (dmg > 0) indHurt(dmg, 'kick', '踹了烫炉子（炉温 ' + Math.round(T) + '°C）', true);
            return true;
        }
