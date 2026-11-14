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
        function bkLink(k) { let n = indName(k, true); return '<span style="color:#1565c0;cursor:pointer;text-decoration:underline;" onclick="indBookSearch(\'' + n.replace(/'/g, '') + '\')">' + n + '</span>'; }
        function bkSources(k) {
            let out = [];
            if (BK_HOW[k]) out.push({ ins: BK_HOW[k][1] || [], txt: BK_HOW[k][0] });
            IND_CRAFT.forEach(function (r) {
                if (r.out !== k || !indCraftShow(r) || r.fix || r.poison) return;
                let ins = Object.keys(r.in);
                out.push({ ins: ins.concat(r.need ? [r.need] : []), txt: ins.map(function (q) { return bkLink(q) + (r.in[q] > 1 ? '×' + r.in[q] : ''); }).join(' + ') + (r.need ? ' + 身上要有' + bkLink(r.need) : '') + '，工作台' });
            });
            if (indHard()) IND_RECIPES.forEach(function (r) {
                if (r.hard && !indHard()) return;
                let hit = Object.keys(r.out).some(function (o) { return o === k || (IND_ITEMS_RAW[o] && IND_ITEMS_RAW[o].hot === k); });
                if (!hit) return;
                let ins = Object.keys(r.in).filter(function (q) { return q !== 'bucket'; });
                out.push({ ins: ins, txt: ins.map(function (q) { return bkLink(q) + (r.in[q] > 1 ? '×' + r.in[q] : ''); }).join(' + ') + '，炉子里' + r.minT + '°C 烧 ' + r.time + ' 秒' });
            });
            return out;
        }
        // 往下展开：每样东西列出它的做法，原料再往下展开，最多 5 层，同一样只展开一次
        function bkChain(k, depth, seen, lines) {
            if (depth > 5 || seen[k]) return; seen[k] = 1;
            let src = bkSources(k); if (!src.length) return;
            src.slice(0, 3).forEach(function (s) {
                lines.push({ d: depth, html: bkLink(k) + ' ← ' + s.txt });
                s.ins.forEach(function (q) { bkChain(q, depth + 1, seen, lines); });
            });
        }
        function bkChainHtml(q) {
            if (!q) return ''; q = q.replace(/镐/g, '稿');   // 游戏里写的是稿
            let keys = Object.keys(IND_ITEMS_RAW).filter(function (k) { let n = IND_ITEMS_RAW[k].name || ''; return n && n.indexOf(q) >= 0 && bkSources(k).length; });
            keys.sort(function (a, b) { return (IND_ITEMS_RAW[a].name === q ? 0 : 1) - (IND_ITEMS_RAW[b].name === q ? 0 : 1) || IND_ITEMS_RAW[a].name.length - IND_ITEMS_RAW[b].name.length; });
            let html = '';
            keys.slice(0, 2).forEach(function (k) {
                let lines = []; bkChain(k, 0, {}, lines);
                if (lines.length >= 1) html += '<div style="margin:4px 0 8px;padding:6px;background:#f3e5f5;border-radius:6px;font-size:13px;line-height:1.6;"><b>怎么得到 ' + indName(k, true) + '</b>' + lines.map(function (l) { return '<div style="padding-left:' + (l.d * 14) + 'px;">' + l.html + '</div>'; }).join('') + '</div>';
            });
            return html;
        }
        // 准星对着地上的东西：只写它的上一步
        function bkHowShort(k) { let s = bkSources(k)[0]; return s ? '怎么得到：' + s.txt.replace(/<[^>]+>/g, '') : ''; }
