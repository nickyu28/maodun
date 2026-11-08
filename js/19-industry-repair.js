// 猫盾工业：修、拆、熔（任务 78、79）。放在 19-industry-cast2.js 后面（配方表只能往后加；这里只改已有配方的原料和 off）。
// 修：坏了的 X + 1 胶水 + 1 份同种材料（木头的用木头、石器用石头、铁的用铁锭……）。每修一次，这一把的耐久上限少 10%（按原上限算），
//  修好后耐久回到新上限；修过 9 次的再修上限就是 0，修不了，只能拆或熔。修过几次跟着这一把存：
//  base.repCur[k] 正在用的那一把修过几次；base.repQ[k] 背包里修过、还没用的那几把（先用它们）；base.repQ['broken_' + k] 坏了的那几把各修过几次（先进先出，老存档没记的算 0 次）。
// 拆（任务 79，工作台）：每种材料按 rpBack(N, 耐久千分比) 还，N 是这件东西现在的做法里这种材料的个数（铸造的零件按模具要的份数算锭，木柄按半个木头算）。
//  耐久比按原始满耐久算（修过的不按降过的上限），每件单独算再加总。坏了的拆不出东西。硬核里青铜、铁、钢的东西不在工作台拆，坏了放进炉子熔。
// 熔（任务 78，硬核）：坏了的青铜、铁、钢工具放进炉膛，炉温到熔点以上化进熔池（木柄烧掉不还），份数 = rpBack(做它要的锭数, 满)：
//  镐、斧、铲、剪刀头都是 2 份 → 1 份；盾 4 锭 → 3 份；小刀刃 1 份 → 0，太小化不出来，放进去不会化。
        const RP = { fixMax: 9 };
        // 拆了还几个（任务 79 的公式）：N 个这种材料，耐久比 p（千分之几，0～1000）。整数算，没有浮点边界问题。
        //  lo = 0.7·r·N，hi = 0.8·r·N；[lo − 0.1, hi + 0.1] 里有整数就还最大的那个，没有就还 floor(hi)；耐久 0 还 0。永远 ≤ r·N、< N。
        function rpBack(N, p) {
            N = Math.floor(N); p = Math.floor(p);
            if (!(N >= 1) || !(p > 0)) return 0;
            if (p > 1000) p = 1000;
            let lo = 7 * p * N - 1000, hi = 8 * p * N + 1000, k = Math.floor(hi / 10000);   // 单位 1/10000
            if (k * 10000 >= lo) return k;
            return Math.floor(8 * p * N / 10000);
        }
        function rpBackR(N, r) { return rpBack(N, Math.floor(r * 1000 + 1e-6)); }
        // 一堆东西一起拆：每件单独算再加总。mats 是 { 材料: N }，ps 是每件的耐久千分比
        function rpBackMany(mats, ps) {
            let out = {}; Object.keys(mats).forEach(function (m) { out[m] = 0; ps.forEach(function (p) { out[m] += rpBack(mats[m], p); }); }); return out;
        }
        // 上限：原上限 × (10 − 修过几次) / 10
        function rpCap(max, n) { n = n | 0; if (!(n > 0)) return max; return n >= 10 ? 0 : Math.max(1, Math.round(max * (10 - n) / 10)); }
        function rpB() { let B = ind.base; B.repQ = B.repQ || {}; B.repCur = B.repCur || {}; return B; }
        function rpCurN(k) { return (ind && ind.base && ind.base.repCur && ind.base.repCur[k]) | 0; }
        function rpNext(k) {   // 换下一把（mbDura 里 D[k] 没有的时候）：背包里有修过的先用
            let B = rpB(), Q = B.repQ[k], n = Q && Q.length ? Q.shift() : 0;
            if (Q && !Q.length) delete B.repQ[k];
            if (n > 0) B.repCur[k] = n; else delete B.repCur[k];
        }
        function rpBroke(k) {   // 正在用的那一把坏了：修过几次跟着坏的走
            let B = rpB(), n = B.repCur[k] | 0; delete B.repCur[k];
            (B.repQ['broken_' + k] = B.repQ['broken_' + k] || []).push(n);
        }
        function rpPeekBroken(k) { let Q = rpB().repQ['broken_' + k]; return Q && Q.length ? Q[0] | 0 : 0; }
        function rpFixOk(k) {
            let n = rpPeekBroken(k);
            if (n + 1 > RP.fixMax) { indFlash('这把修过 ' + n + ' 次了，再修上限就没了，只能拆' + (rpMeltOf('broken_' + k) ? '或者熔' : '')); return false; }
            return true;
        }
        function rpFixed(k) {
            let B = rpB(), Q = B.repQ['broken_' + k], n = Q && Q.length ? Q.shift() : 0;
            if (Q && !Q.length) delete B.repQ['broken_' + k];
            (B.repQ[k] = B.repQ[k] || []).push(n + 1);
            indFlash('修好了：' + indName(k) + '（修过 ' + (n + 1) + ' 次，耐久上限 ' + rpCap(mbMax0(k), n + 1) + '）');
        }
        // 修要的那份材料
        function rpFixMat(k) {
            if (MB_KNIFE[k]) return MB_KNIFE[k].back[0];
            if (MB_SHIELD[k]) return MB_SHIELD[k].back[0];
            let T = TL_TOOL[k]; return T ? T.back : null;
        }
        // 青铜、铁、钢的刀、盾、工具：哪种金属（镍稿、钻石的没有）
        const RP_TIER_METAL = { bronze: 'bronze', iron: 'ingot_fe', steel: 'steel' };
        function rpMetal(k) {
            let m = /^(knife|shield)_(bronze|iron|steel)$/.exec(k); if (m) return RP_TIER_METAL[m[2]];
            let T = TL_TOOL[k]; if (!T || T.knife || k === 'pick_ni') return null;
            return RP_TIER_METAL[T.tier] || null;
        }
        // 坏了的金属工具熔成几份（硬核）：{ m, n }；化不出 1 份的返回 null
        function rpMeltOf(bk) {
            if (typeof bk !== 'string' || bk.indexOf('broken_') !== 0) return null;
            let k = bk.slice(7), m = rpMetal(k); if (!m) return null;
            let N = MB_SHIELD[k] ? MB_SHIELD[k].in[m] || 0 : MB_KNIFE[k] ? CT_SHAPE.knife.need : CT_SHAPE[TL_TOOL[k].kind] ? CT_SHAPE[TL_TOOL[k].kind].need : 0;
            let n = rpBack(N, 1000); return n >= 1 ? { m: m, n: n } : null;
        }
        // 这件东西现在的做法（按当前规则能做的那条）拆成原料：铸造零件 → 锭，木柄 → 半个木头
        function rpRecipe(k) {
            let r = null; IND_CRAFT.forEach(function (q) { if (!r && q.out === k && !q.fix && !q.poison && !(q.n > 1) && indCraftShow(q)) r = q; });
            if (!r) return null;
            let mats = {}, add = function (m, n) { mats[m] = (mats[m] || 0) + n; };
            Object.keys(r.in).forEach(function (x) {
                let pm = /^part_([a-z]+)_(.+)$/.exec(x);
                if (pm && CT_SHAPE[pm[1]]) add(pm[2], CT_SHAPE[pm[1]].need * r.in[x]);
                else if (x === 'handle') add('wood', 0.5 * r.in[x]);
                else add(x, r.in[x]);
            });
            return mats;
        }
        // 工作台能拆吗（硬核里金属的去熔）
        function rpCanDis(k) { return !!mbDurTab(k) && !(indHard() && rpMetal(k)) && !!rpRecipe(k); }
        // 背包里这一种每一把的耐久（按下一个拆的顺序：正在用的、修过的、新的）
        function rpPieces(k) {
            let n = ind.bag[k] || 0, B = rpB(), max0 = mbMax0(k), L = [], D = (B.dura || {})[k], Q = B.repQ[k] || [];
            if (n > 0 && D > 0) L.push(D);
            for (let i = 0; L.length < n && i < Q.length; i++) L.push(rpCap(max0, Q[i]));
            while (L.length < n) L.push(max0);
            return L;
        }
        function rpPermille(k, d) { let max0 = mbMax0(k); return max0 > 0 ? Math.floor(Math.min(d, max0) * 1000 / max0) : 0; }
        function rpPlan(k, cnt) {
            let mats = rpRecipe(k) || {}, ps = rpPieces(k).slice(0, cnt).map(function (d) { return rpPermille(k, d); });
            return { mats: mats, ps: ps, out: rpBackMany(mats, ps) };
        }
        function rpOutTxt(out) { return Object.keys(out).map(function (m) { return indName(m) + ' ×' + out[m]; }).join('、'); }
        function rpTakeOne(k) {
            let B = rpB(), D = B.dura = B.dura || {};
            if (D[k] > 0) { delete D[k]; delete B.repCur[k]; }
            else if (B.repQ[k] && B.repQ[k].length) { B.repQ[k].shift(); if (!B.repQ[k].length) delete B.repQ[k]; }
            indBagDel(k, 1);
        }
        // 确认窗：写清楚每种材料还几个
        function rpAsk(k, all) {
            if (!ind || !(ind.bag[k] > 0) || !rpCanDis(k)) return;
            let cnt = all ? ind.bag[k] : 1, P = rpPlan(k, cnt), dur = all ? '' : '（耐久 ' + rpPieces(k)[0] + ' / ' + mbMax0(k) + '）';
            indPanelShow('rpask', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">拆' + (all ? ' ' + cnt + ' 个' : '') + indName(k) + dur + '？</div>' +
                '<div style="margin-bottom:8px;">会还：' + rpOutTxt(P.out) + '</div>' +
                '<div style="text-align:right;"><button style="' + IND_BTN + 'background:#e65100;" onclick="rpDo(\'' + k + '\',' + (all ? 1 : 0) + ')">拆</button><button style="' + IND_BTN + '" onclick="indPanelBench()">不拆了</button></div>');
        }
        function rpDo(k, all) {
            if (!ind || !(ind.bag[k] > 0) || !rpCanDis(k)) { indPanelBench(); return; }
            let cnt = all ? ind.bag[k] : 1, P = rpPlan(k, cnt);
            for (let i = 0; i < cnt; i++) rpTakeOne(k);
            Object.keys(P.out).forEach(function (m) { if (P.out[m] > 0) indBoxAdd(m, P.out[m]); });
            let got = Object.keys(P.out).filter(function (m) { return P.out[m] > 0; });
            indFlash('拆了' + (cnt > 1 ? ' ' + cnt + ' 个' : '') + indName(k) + (got.length ? '，还了 ' + rpOutTxt(P.out) : '，什么都没拆出来'));
            ind.hudSig = ''; indSave(); indPanelBench();
        }
        // 工作台面板最下面：能拆的东西
        function rpBenchHtml() {
            let ks = Object.keys(ind.bag).filter(function (k) { return ind.bag[k] > 0 && rpCanDis(k); });
            if (!ks.length) return '';
            return '<div style="margin-top:8px;font-weight:bold;">拆（按剩下的耐久还材料）</div>' + ks.map(function (k) {
                return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + 'background:#e65100;" onclick="rpAsk(\'' + k + '\',0)">拆 1 个</button>' + (ind.bag[k] > 1 ? '<button style="' + IND_BTN + 'background:#bf360c;" onclick="rpAsk(\'' + k + '\',1)">全拆</button>' : ''));
            }).join('');
        }
        (function () {
            let s0 = indPanelShow, END = '<div style="margin-top:8px;text-align:right;">';
            indPanelShow = function (kind, html) {
                if (kind === 'bench' && ind && typeof html === 'string') { let i = html.lastIndexOf(END), x = rpBenchHtml(); if (i >= 0 && x) html = html.slice(0, i) + x + html.slice(i); }
                return s0.call(this, kind, html);
            };
            // HUD：修过几次
            let h0 = mbHud;
            mbHud = function () { let s = h0.apply(this, arguments), k = indSel(), n = s ? rpCurN(k) : 0; return n > 0 ? s + '　修过 ' + n + ' 次' : s; };
            // 修要同种材料；"回收一半主料"那几条换成拆（留着下标、标 off）
            let all = Object.keys(MB_KNIFE).concat(Object.keys(MB_SHIELD), Object.keys(TL_TOOL).filter(function (k) { return !TL_TOOL[k].knife; }));
            all.forEach(function (k) {
                let mat = rpFixMat(k), bk = 'broken_' + k; if (!mat || !IND_ITEMS_RAW[bk]) return;
                IND_CRAFT.forEach(function (r) {
                    if (r.fix && r.out === k && r.in[bk]) r.in[mat] = 1;
                    else if (!r.fix && !r.poison && r.in[bk] && Object.keys(r.in).length === 1) r.off = true;
                });
                IND_ITEMS_RAW[bk].use = '工作台加 1 胶水和 1 ' + indName(mat) + ' 修好，每修一次耐久上限少 10%' + (rpMetal(k) ? '；硬核里也能放进炉子熔了' : '');
            });
        })();
        // 配方查询：熔坏工具
        (function () {
            let b0 = indBookLines;
            indBookLines = function () {
                let L = b0.apply(this, arguments);
                if (indHard()) Object.keys(IND_ITEMS_RAW).forEach(function (bk) {
                    let q = rpMeltOf(bk); if (!q) return;
                    L.push({ ins: [bk], outs: [q.m], name: indName(bk), txt: indName(bk) + ' → 熔池里的' + CT_METAL[q.m].n + ' ' + q.n + ' 份（木柄烧掉）', where: '炉子，' + CT_METAL[q.m].melt + '°C 以上' });
                });
                return L;
            };
        })();
        function rpFixBase(b) {
            let okK = function (k) { return typeof k === 'string' && (!!mbDurTab(k) || (k.indexOf('broken_') === 0 && !!mbDurTab(k.slice(7)))); };
            let Q = {}, C = {};
            if (b.repQ && typeof b.repQ === 'object' && !Array.isArray(b.repQ)) Object.keys(b.repQ).forEach(function (k) { if (okK(k) && Array.isArray(b.repQ[k])) { let a = b.repQ[k].slice(0, 999).map(function (v) { return indNum(v, 0, 0, RP.fixMax) | 0; }); if (a.length) Q[k] = a; } });
            if (b.repCur && typeof b.repCur === 'object' && !Array.isArray(b.repCur)) Object.keys(b.repCur).forEach(function (k) { if (okK(k) && k.indexOf('broken_') !== 0) { let v = indNum(b.repCur[k], 0, 0, RP.fixMax) | 0; if (v > 0) C[k] = v; } });
            // 老存档：胶水修过、还没用的（原来是"耐久一半"）算修过 1 次
            if (b.duraHalf && typeof b.duraHalf === 'object') Object.keys(b.duraHalf).forEach(function (k) { if (!okK(k)) return; let n = Math.min(99, b.duraHalf[k] | 0); for (let i = 0; i < n; i++) (Q[k] = Q[k] || []).push(1); });
            delete b.duraHalf;
            b.repQ = Q; b.repCur = C;
            // 任务 87：青铜／铁／钢／钻石工具耐久调高了。老存档里正在用的那一把、宠物手上的刀，剩的耐久按新旧满耐久的比例换算（只换一次，duraV）
            if (!(b.duraV >= 1)) {
                let OLD = { bronze: 120, iron: 200, steel: 400, diamond: 1500 }, OLDK = { knife_bronze: 120, knife_iron: 200, knife_steel: 500, knife_diamond: 1500 };
                let oldOf = function (k) { if (OLDK[k]) return OLDK[k]; let T = typeof TL_TOOL !== 'undefined' && TL_TOOL[k]; return T && !T.knife && OLD[T.tier] || 0; };
                let ratio = function (k) { let T = mbDurTab(k), o = oldOf(k); return T && o ? T.dura / o : 1; };
                if (b.dura && typeof b.dura === 'object') Object.keys(b.dura).forEach(function (k) { b.dura[k] = Math.max(1, Math.round(b.dura[k] * ratio(k))); });
                (b.animals || []).forEach(function (a) { if (a && a.weapon && MB_KNIFE[a.weapon] && a.wd > 0) a.wd = Math.max(1, Math.round(a.wd * ratio(a.weapon))); });
                b.duraV = 2;   // 上面按现在的满耐久换算，已经包含任务 98 的镐减半
            } else if (b.duraV < 2) {   // 任务 98：青铜／铁／钢／钻石镐满耐久减半，剩的耐久跟着减半（只换一次）
                let half = function (k) { let T = typeof TL_TOOL !== 'undefined' && TL_TOOL[k]; return !!(T && T.kind === 'pick' && TL_PICK_HALF[T.tier]); };
                if (b.dura && typeof b.dura === 'object') Object.keys(b.dura).forEach(function (k) { if (half(k)) b.dura[k] = Math.max(1, Math.round(b.dura[k] / 2)); });
                b.duraV = 2;
            }
        }
