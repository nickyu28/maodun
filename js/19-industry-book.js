// 配方查询的完整链（任务 158）：查一样东西，往下展开到玩家手上能直接拿到的东西，包括不在工作台上的做法（雕模具、烧硬、浇铸、炉子冶炼）。
// 链上的名字可以点，跳到那个东西。每一行短句，不用括号。
        const BK_HOW = {};
        (function () {
            if (typeof CT_SHAPE === 'undefined') return;
            Object.keys(CT_SHAPE).forEach(function (s) {
                let S = CT_SHAPE[s];
                BK_HOW['mold_' + s + '_raw'] = ['拿小刀右键，黏土 2，选' + S.n + '，玩校准小游戏雕出来'];
                BK_HOW['mold_' + s + '_f_raw'] = ['拿小刀右键，耐火砖 2，选' + S.n + '，玩校准小游戏雕出来'];
                Object.keys(CT_PART_METAL).forEach(function (m) {
                    BK_HOW['part_' + s + '_' + m] = ['熔池里的' + (CT_METAL[m] ? CT_METAL[m].n : '金属') + '浇进' + S.n + '模具，炉子要装出料槽，浇铸要 ' + S.need + ' 份', ['mold_' + s, m]];
                });
            });
        })();
        function bkSeen(k) {
            let B = ind.base; if (!B) return false; let kk = k.split('@')[0];
            return !!((B.seenK && (B.seenK[k] || B.seenK[kk])) || ind.bag[k] || ind.bag[kk] || (B.box && B.box[k]) || (B.chests || []).some(function (c) { return c.items && c.items[k] > 0; }));
        }
        function bkLink(k) { if (!bkSeen(k)) return '<span style="color:#999;">？</span>'; let n = indName(k, true); return '<span style="color:#1565c0;cursor:pointer;text-decoration:underline;" onclick="indItemInfo(\'' + k.replace(/'/g, '') + '\')">' + n + '</span>'; }
        // 把只差一种原料、数量一样的几个做法合成一条：[{ k: ['hide', 'pleather'], n: 2 }, ...]
        function bkMerge(list) {
            let L = list.map(function (e) { return { out: e.out, tail: e.tail, parts: e.parts.map(function (p) { return { k: p.k.slice(), n: p.n }; }) }; });
            for (let again = true; again;) {
                again = false;
                for (let i = 0; i < L.length && !again; i++) for (let j = i + 1; j < L.length && !again; j++) {
                    let A = L[i], B = L[j]; if (A.tail !== B.tail || A.parts.length !== B.parts.length) continue;
                    let diff = -1, ok = true;
                    for (let q = 0; q < A.parts.length && ok; q++) { if (A.parts[q].n !== B.parts[q].n) { ok = false; break; } if (A.parts[q].k.join('/') !== B.parts[q].k.join('/')) { if (diff >= 0) ok = false; else diff = q; } }
                    if (ok && diff >= 0) { B.parts[diff].k.forEach(function (x) { if (A.parts[diff].k.indexOf(x) < 0) A.parts[diff].k.push(x); }); L.splice(j, 1); again = true; }
                }
            }
            return L;
        }
        function bkParts(inObj, need) { let a = Object.keys(inObj).filter(function (q) { return q !== 'bucket'; }).map(function (q) { return { k: [q], n: inObj[q] }; }); if (need) a.push({ k: [need], n: 0, need: true }); return a; }
        function bkPartHtml(p) { return (p.need ? '身上要有' : '') + p.k.map(bkLink).join('/') + (p.n > 1 ? '×' + p.n : ''); }
        // 一样东西的直接做法，一层
        function bkSources(k) {
            let raw = [];
            if (BK_HOW[k]) raw.push({ out: k, parts: (BK_HOW[k][1] || []).map(function (q) { return { k: [q], n: 1 }; }), tail: BK_HOW[k][0] });
            IND_CRAFT.forEach(function (r) { if (r.out === k && indCraftShow(r) && !r.fix && !r.poison) raw.push({ out: k, parts: bkParts(r.in, r.need), tail: '工作台' }); });
            if (indHard()) IND_RECIPES.forEach(function (r) {
                if (r.hard && !indHard()) return;
                if (!Object.keys(r.out).some(function (o) { return o === k || (IND_ITEMS_RAW[o] && IND_ITEMS_RAW[o].hot === k); })) return;
                raw.push({ out: k, parts: bkParts(r.in), tail: '炉子，' + r.minT + '°C，' + r.time + ' 秒' });
            });
            return bkMerge(raw).map(function (e) { return { ins: [].concat.apply([], e.parts.map(function (p) { return p.k; })), txt: e.parts.map(bkPartHtml).join(' + ') + '，' + e.tail, bare: e.tail.indexOf('工作台') === 0 || true, parts: e.parts, tail: e.tail }; });
        }
        function bkWhere(k) {
            let out = [], nd = IND_NODES[k];
            if (nd) {
                let bs = Object.keys(IND_BIOMES).filter(function (b) { return IND_BIOMES[b].res && IND_BIOMES[b].res[k]; }).map(function (b) { return IND_BIOMES[b].name; });
                out.push((k === 'wood' ? '砍树' : '挖或捡') + (bs.length ? '：' + bs.join('、') : '') + (nd.tool >= 1 ? '，要' + IND_TOOL_NAME[nd.tool] + '以上' : ''));
            }
            Object.keys(IND_NODES).forEach(function (nk) { if (IND_NODES[nk].out === k) out.push('捡：' + (IND_NODES[nk].name || nk)); });
            if (typeof WD_SC !== 'undefined' && WD_SC[k]) { let w = WD_SC[k].w, bs = Object.keys(w).filter(function (b) { return w[b] >= 1.5; }).map(function (b) { return IND_BIOMES[b] ? IND_BIOMES[b].name : b; }); out.push('地上捡：' + bs.join('、') + '多'); }
            if (typeof FM_DROP !== 'undefined') { let an = Object.keys(FM_DROP).filter(function (a) { return FM_DROP[a][k]; }).map(function (a) { return ({ sheep: '羊', cow: '牛', rabbit: '野兔', deer: '野鹿' })[a] || a; }); if (k === 'hide' || k === 'meat_raw') an.push('野猪'); if (an.length) out.push('动物掉落：' + an.join('、')); }
            if (IND_CROPS[k]) out.push('种出来：农田，种子 ' + indName('seed_' + k, true));
            return out;
        }
        function bkUses(k) {
            let seen = [], add = function (o) { if (o !== k && bkSeen(o) && seen.indexOf(o) < 0) seen.push(o); };
            IND_CRAFT.forEach(function (r) { if (r.out && indCraftShow(r) && !r.fix && (r.in[k] || r.need === k)) add(r.out); });
            if (indHard()) IND_RECIPES.forEach(function (r) { if ((r.hard && !indHard()) || !r.in[k]) return; Object.keys(r.out).forEach(function (o) { add(IND_ITEMS_RAW[o] && IND_ITEMS_RAW[o].hot ? IND_ITEMS_RAW[o].hot : o); }); });
            return seen;
        }
        function bkInfoHtml(k) {
            let d = IND_ITEMS_RAW[k] || IND_ITEMS[k] || {}, nm = indName(k, true);
            let h = '<div style="display:flex;align-items:center;margin-bottom:6px;">' + indIconImg(k, 48) + '<div><div style="font-size:18px;font-weight:bold;">' + nm + '</div><div style="font-size:13px;color:#666;">' + (d.use || '') + '</div></div></div>';
            if (!bkSeen(k)) return h.replace(nm, '？').replace(d.use || '', '') + '<div style="color:#999;">还没见过这个东西</div>';
            let src = bkSources(k), wh = bkWhere(k), us = bkUses(k);
            h += '<div style="margin-top:6px;"><b>怎么做</b></div>' + (src.length ? src.map(function (e) { return '<div style="padding:2px 0;">' + bkLink(k) + ' = ' + e.txt + '</div>'; }).join('') : '<div style="color:#999;">？</div>');
            h += '<div style="margin-top:6px;"><b>从哪来</b></div>' + (wh.length ? wh.map(function (t) { return '<div style="padding:2px 0;">' + t + '</div>'; }).join('') : '<div style="color:#999;">？</div>');
            h += '<div style="margin-top:6px;"><b>能用来做什么</b></div><div style="padding:2px 0;">' + (us.length ? us.map(bkLink).join('、') : '<span style="color:#999;">？</span>') + '</div>';
            return h;
        }
        function indItemInfo(k) {
            if (!ind || !k) return;
            let hist = ind.infoHist = ind.panel === 'info' ? (ind.infoHist || []) : [];
            if (ind.infoCur && ind.panel === 'info' && ind.infoCur !== k) hist.push(ind.infoCur);
            ind.infoCur = k;
            indPanelShow('info', bkInfoHtml(k) + '<div style="margin-top:10px;text-align:right;">' + (hist.length ? '<button style="' + IND_BTN + '" onclick="indItemInfoBack()">返回</button>' : '') + '<button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
        function indItemInfoBack() { let h = ind && ind.infoHist; if (!h || !h.length) return; let k = h.pop(); ind.infoCur = null; ind.panel = null; ind.infoHist = h; indItemInfo(k); }
        // 配方查询搜出的最匹配的一样东西，写它的直接做法一层
        function bkChainHtml(q) {
            if (!q) return '';
            q = q.replace(/镐/g, '稿');
            let keys = Object.keys(IND_ITEMS_RAW).filter(function (k) { let n = IND_ITEMS_RAW[k].name || ''; return n && n.indexOf(q) >= 0 && bkSeen(k) && bkSources(k).length; });
            keys.sort(function (a, b) { return (IND_ITEMS_RAW[a].name === q ? 0 : 1) - (IND_ITEMS_RAW[b].name === q ? 0 : 1) || IND_ITEMS_RAW[a].name.length - IND_ITEMS_RAW[b].name.length; });
            let html = '';
            keys.slice(0, 2).forEach(function (k) { html += '<div style="margin:4px 0 8px;padding:6px;background:#f3e5f5;border-radius:6px;font-size:13px;line-height:1.6;">' + bkSources(k).map(function (e) { return '<div>' + bkLink(k) + ' = ' + e.txt + '</div>'; }).join('') + '</div>'; });
            return html;
        }
        // 准星对着地上的东西：见过的才写它的上一步
        function bkHowShort(k) { if (!bkSeen(k)) return ''; let s = bkSources(k)[0]; return s ? '怎么得到：' + s.txt.replace(/<[^>]+>/g, '') : ''; }
