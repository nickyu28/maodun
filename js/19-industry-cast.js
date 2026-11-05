// 猫盾工业：铸造（docs/tools-trees.md 第 3 节、分步第 4 步；硬核）。放在 19-industry-tool.js 后面。
// 锭照旧。炉子多一个"熔池"：锭放进炉膛、温度到熔点以上、炉子没在做配方，每 10 秒化 1 块（1 锭 = 1 份，只装一种金属，最多 8 份、大窑 16）。
// 炉温掉到熔点以下，熔池凝成烫锭留在炉膛。
// 模具：拿小刀右键（背包里有 2 黏土）选形状，屏幕右下角一根条，光标 1.2 秒走一趟，在亮区（22%）里按 X（触屏点"刻"）算一刀，雕够 N 刀得生模具；
// 耐久 = 15 + 15 × 命中率。生模具放进炉子 600°C 30 秒烧硬。熟模具在炉子面板里放进出料槽（槽里放模具就不接锭）。
// 熔池够模具要的份数、炉温在熔点以上、槽耐温够：每秒流 1 份，流满出烫零件，在槽里凉（砖槽 60 秒），左键出料槽取，模具耐久 −1，到 0 碎。
// 黏土模具只浇得了熔点低的（≤ 1100°C）：浇铁、钢会裂（耐火砖模具等"耐火砖"那条做了再加）。
// 零件现在只有青铜的（作者：铜不单独做工具；铁和钢要耐火砖模具）：小刀刃、斧头、镐头、铲头、剪刀片。工作台 头 + 木柄 → 青铜的工具（剪刀片 + 草绳）；木头 1 → 木柄 2。
// 青铜的工具不再能在工作台直接用锭做（原来那几条配方留着、标 off 不显示，下标不变）。铁、钢的工具还在工作台做，等耐火砖。
        const CT = { meltT: 10, cap: 8, capKiln: 16, flow: 1, clayMax: 1100, bar: 1.2, zone: 0.22, q0: 15, q1: 15 };
        const CT_METAL = { ingot_cu: { n: '铜', melt: 1085, hot: 'hot_cu' }, ingot_sn: { n: '锡', melt: 232, hot: 'hot_sn' }, ingot_zn: { n: '锌', melt: 420, hot: 'hot_zn' }, ingot_pb: { n: '铅', melt: 327, hot: 'hot_pb' },
            bronze: { n: '青铜', melt: 950, hot: 'hot_bronze' }, brass: { n: '黄铜', melt: 930, hot: 'hot_brass' }, ingot_fe: { n: '铁', melt: 1538, hot: 'hot_fe' }, steel: { n: '钢', melt: 1550, hot: 'hot_steel' } };
        const CT_SHAPE = { knife: { n: '小刀刃', need: 1, cuts: 8, tool: 'knife_' }, axe: { n: '斧头', need: 2, cuts: 12, tool: 'axe_' }, pick: { n: '镐头', need: 2, cuts: 12, tool: 'pick_' }, shovel: { n: '铲头', need: 2, cuts: 10, tool: 'shovel_' }, shears: { n: '剪刀片', need: 2, cuts: 14, tool: 'shears_' } };
        const CT_PART_METAL = { bronze: 1 };   // 有零件的金属
        (function () {
            let add = { handle: { name: '木柄', col: 0x8d6e63, use: '工作台装工具：头 + 木柄' } };
            Object.keys(CT_SHAPE).forEach(function (s) {
                let S = CT_SHAPE[s];
                add['mold_' + s + '_raw'] = { name: S.n + '生模具', col: 0xbcaaa4, use: '放进炉子 600°C 30 秒烧硬' };
                add['mold_' + s] = { name: S.n + '模具', col: 0x8d6e63, use: '炉子面板里放进出料槽，熔池里的金属流进来铸' + S.n + '（要 ' + S.need + ' 份）；黏土的，浇不了铁和钢' };
                IND_RECIPES.push({ in: { ['mold_' + s + '_raw']: 1 }, out: { ['mold_' + s]: 1 }, cls: 'smelt', minT: 600, time: 30, hard: true });
                Object.keys(CT_PART_METAL).forEach(function (m) {
                    let k = 'part_' + s + '_' + m, tool = S.tool + m;
                    add[k] = { name: CT_METAL[m].n + S.n, col: 0xb87333, use: '工作台装成' + CT_METAL[m].n + '的工具' };
                    IND_CRAFT.push({ out: tool, in: s === 'shears' ? { [k]: 1, rope: 1 } : { [k]: 1, handle: 1 }, hard: true });
                });
            });
            IND_CRAFT.push({ out: 'handle', n: 2, in: { wood: 1 }, hard: true });
            Object.assign(IND_ITEMS_RAW, add);
            // 青铜工具原来的"锭直接做"配方：留着下标，标 off 不显示
            IND_CRAFT.forEach(function (r) { if (r.hard && !r.fix && !r.poison && /^(knife|axe|pick|shovel|shears)_bronze$/.test(r.out) && r.in.bronze) r.off = true; });
        })();
        function ctMetalOf(S) { let m = null; Object.keys(S.items).forEach(function (k) { if (!m && CT_METAL[k] && S.items[k] > 0) m = k; }); return m; }
        function ctCap(c) { return c.ty === 'kiln' ? CT.capKiln : CT.cap; }
        // 每个炉子每帧（ckTick 里调）：化锭、凝固、往模具里流、零件凉
        function ctTick(c, dt) {
            if (!indHard()) return;
            let S = c.C, P = S.pool;
            if (P && P.n > 0 && S.temp < CT_METAL[P.m].melt) {   // 凉到熔点以下：凝成烫锭留在炉膛
                let h = CT_METAL[P.m].hot; S.out[h] = (S.out[h] || 0) + P.n; S.pool = null; P = null; S.flowT = 0;
                if (ind.panel === 'stove') ind.panelDirty = true;
            }
            let m = !S.cook ? ctMetalOf(S) : null;
            if (m && S.temp >= CT_METAL[m].melt && indCookFind(ckPool(S), indCookK(c.ty, S), undefined, S.items) < 0) {
                if (P && P.m !== m) { if (!S.ctWarn) { S.ctWarn = 1; indFlash('熔池里是' + CT_METAL[P.m].n + '，先倒完'); } }
                else if (!P || P.n < ctCap(c)) {
                    S.meltT = (S.meltT || 0) + dt;
                    if (S.meltT >= CT.meltT) { S.meltT = 0; S.items[m]--; if (S.items[m] <= 0) delete S.items[m]; S.pool = P = { m: m, n: (P ? P.n : 0) + 1 }; S.ctWarn = 0; if (ind.panel === 'stove') ind.panelDirty = true; }
                }
            } else S.meltT = 0;
            let M = S.mold; if (!M) return;
            if (M.part) { if (M.t > 0) M.t = Math.max(0, M.t - dt); return; }
            if (!P || !ckSpoutOn(S) || S.temp < CT_METAL[P.m].melt || CT_METAL[P.m].melt > ckSpoutDef(S).maxT) { M.fill = 0; return; }
            if (CT_METAL[P.m].melt > CT.clayMax) {   // 黏土模具浇不了铁、钢：裂掉，流进来的那份在槽里凝成烫锭
                S.mold = null; P.n--; if (P.n <= 0) S.pool = null; S.spout.push({ k: CT_METAL[P.m].hot, t: ckSpoutDef(S).cool });
                indFlash('黏土模具浇不了' + CT_METAL[P.m].n + '，裂了'); return;
            }
            let need = CT_SHAPE[M.s].need; if (!CT_PART_METAL[P.m] || P.n < need - (M.fill || 0)) return;
            M.fill = (M.fill || 0) + CT.flow * dt;
            if (M.fill < need) return;
            P.n -= need; if (P.n <= 0) S.pool = null;
            M.fill = 0; M.part = 'part_' + M.s + '_' + P.m; M.t = ckSpoutDef(S).cool;
            if (ind.panel === 'stove') ind.panelDirty = true;
        }
        // 槽里放模具就不接锭
        function ctSpoutBusy(S) { return !!S.mold; }
        // 左键出料槽：零件凉了就取出来，模具耐久 −1
        function ctTake(c) {
            let S = c.C, M = S.mold; if (!M || !M.part) return false;
            if (M.t > 0) { indFlash(indName(M.part) + '还烫，等 ' + Math.ceil(M.t) + ' 秒'); return true; }
            if (indBagAdd(M.part, 1) <= 0) { indFlash('背包满了'); return true; }
            indFlash('取出了' + indName(M.part)); M.part = null; M.dura--;
            if (M.dura <= 0) { S.mold = null; indFlash('模具用到头，碎了'); }
            indSave(); if (ind.panel === 'stove') ind.panelDirty = true;
            return true;
        }
        function ctMoldPut(k) {
            let c = indCookCur(), S = c.C, s = k.replace(/^mold_/, '');
            if (!CT_SHAPE[s] || !(ind.bag[k] > 0)) return;
            if (!ckSpoutOn(S)) { indFlash('先装出料槽'); return; }
            if (S.mold) { indFlash('槽里已经有模具了'); return; }
            if (S.spout.length) { indFlash('先把槽里的锭取走'); return; }
            let Q = ind.base.moldQ = ind.base.moldQ || {}, q = (Q[s] || []).shift(); if (Q[s] && !Q[s].length) delete Q[s];
            indBagDel(k, 1); S.mold = { s: s, dura: q || CT.q0 }; indSave(); indPanelStove();
        }
        function ctMoldOut() {
            let c = indCookCur(), S = c.C, M = S.mold; if (!M) return;
            if (M.part || M.fill > 0) { indFlash('里面有东西，先取零件'); return; }
            if (indBagAdd('mold_' + M.s, 1) <= 0) { indFlash('背包满了'); return; }
            let Q = ind.base.moldQ = ind.base.moldQ || {}; (Q[M.s] = Q[M.s] || []).unshift(M.dura); S.mold = null; indSave(); indPanelStove();
        }
        function ctHtml(c) {
            if (!indHard()) return '';
            let S = c.C, P = S.pool, M = S.mold, h = '<br>熔池：' + (P ? CT_METAL[P.m].n + ' ' + P.n + ' / ' + ctCap(c) + ' 份' : '空') + (S.meltT > 0 ? '　化锭 ' + Math.floor(S.meltT / CT.meltT * 100) + '%' : '');
            if (M) h += '<br>模具：' + CT_SHAPE[M.s].n + '（还能用 ' + M.dura + ' 次）' + (M.part ? '　' + indName(M.part) + (M.t > 0 ? ' 烫，还要 ' + Math.ceil(M.t) + ' 秒' : ' 凉了，左键出料槽取') : M.fill > 0 ? '　在流 ' + Math.floor(M.fill / CT_SHAPE[M.s].need * 100) + '%' : P && !CT_PART_METAL[P.m] ? '　<span style="color:#c62828">' + CT_METAL[P.m].n + '铸不了零件</span>' : '') + (!M.part && !(M.fill > 0) ? '　<button style="' + IND_BTN + '" onclick="ctMoldOut()">取下模具</button>' : '');
            let ms = Object.keys(ind.bag).filter(function (k) { return /^mold_[a-z]+$/.test(k) && CT_SHAPE[k.slice(5)]; });
            if (!M && ms.length) h += '<br>' + ms.map(function (k) { return '<button style="' + IND_BTN + 'background:#6d4c41;" onclick="ctMoldPut(\'' + k + '\')">' + indName(k) + ' 放进出料槽</button>'; }).join('');
            return h;
        }
        // ── 雕模具 ──
        function ctCarveMenu() {
            if (!indHard()) return false;
            if (ind.carve) { indFlash('正在雕' + CT_SHAPE[ind.carve.s].n + '模具：光标在亮区里按 X'); return true; }
            if ((ind.bag.clay || 0) < 2) return false;
            indPanelShow('carve', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">雕模具（用 2 黏土）</div>' + Object.keys(CT_SHAPE).map(function (s) {
                return indRow(CT_SHAPE[s].n + '模具（' + CT_SHAPE[s].cuts + ' 刀）', '<button style="' + IND_BTN + 'background:#6d4c41;" onclick="ctCarveStart(\'' + s + '\')">雕</button>');
            }).join('') + '<div style="margin-top:6px;color:#888;font-size:13px;">右下角的条：光标走到亮区里按 X（触屏点"刻"），能边走边雕</div><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            return true;
        }
        function ctCarveStart(s) {
            if (!CT_SHAPE[s]) return;
            ind.carve = { s: s, hit: 0, tries: 0, t0: ind.t }; indPanelClose(); ctBar();
        }
        function ctCursor() { let ph = ((ind.t - ind.carve.t0) / CT.bar) % 2; return ph < 1 ? ph : 2 - ph; }
        function ctHit() {
            let C = ind.carve; if (!C) return false;
            if (tlKind(indSel()) !== 'knife') { indFlash('拿上小刀接着雕'); return true; }
            if ((ind.bag.clay || 0) < 2) { ind.carve = null; ctBar(); indFlash('黏土不够了，不雕了'); return true; }
            C.tries++;
            if (Math.abs(ctCursor() - 0.5) > CT.zone / 2) return true;
            C.hit++;
            if (C.hit < CT_SHAPE[C.s].cuts) return true;
            let q = Math.min(CT.q0 + CT.q1, Math.max(CT.q0, Math.round(CT.q0 + CT.q1 * C.hit / C.tries)));
            indBagDel('clay', 2); indBagAdd('mold_' + C.s + '_raw', 1);
            let Q = ind.base.moldQ = ind.base.moldQ || {}; (Q[C.s] = Q[C.s] || []).push(q);
            indFlash('雕好了' + indName('mold_' + C.s + '_raw') + '（烧硬以后能用 ' + q + ' 次）'); ind.carve = null; ctBar(); indSave();
            return true;
        }
        function ctBar() {
            let e = document.getElementById('ind-carve');
            if (!ind || !ind.carve) { if (e && e.parentNode) e.parentNode.removeChild(e); return; }
            if (!e) {
                e = document.createElement('div'); e.id = 'ind-carve';
                e.style.cssText = 'position:fixed;right:16px;bottom:90px;z-index:45;width:220px;background:rgba(0,0,0,.55);border-radius:8px;padding:6px 8px;color:#fff;font:13px "Microsoft YaHei",sans-serif;';
                e.innerHTML = '<div id="ind-carve-t"></div><div style="position:relative;height:14px;background:#555;border-radius:7px;margin-top:4px;"><div style="position:absolute;left:' + (50 - CT.zone * 50) + '%;width:' + (CT.zone * 100) + '%;top:0;bottom:0;background:#ffd54f;border-radius:7px;"></div><div id="ind-carve-c" style="position:absolute;top:-3px;width:4px;height:20px;background:#fff;"></div></div>' +
                    '<button style="margin-top:6px;padding:4px 14px;border:none;border-radius:6px;background:#6d4c41;color:#fff;" onpointerdown="event.preventDefault();ctHit();">刻</button>';
                document.body.appendChild(e);
            }
            let C = ind.carve, cc = document.getElementById('ind-carve-c'), tt = document.getElementById('ind-carve-t');
            if (cc) cc.style.left = 'calc(' + (ctCursor() * 100) + '% - 2px)';
            if (tt) tt.textContent = '雕' + CT_SHAPE[C.s].n + '模具 ' + C.hit + ' / ' + CT_SHAPE[C.s].cuts + (tlKind(indSel()) === 'knife' ? '　按 X' : '　拿上小刀');
        }
        function ctFix(S) {
            if (S.pool && !(S.pool && CT_METAL[S.pool.m] && S.pool.n > 0)) S.pool = null; else if (S.pool) S.pool = { m: S.pool.m, n: indNum(S.pool.n, 1, 1, CT.capKiln) | 0 };
            if (S.mold && !(S.mold && CT_SHAPE[S.mold.s])) S.mold = null;
            else if (S.mold) { let M = S.mold; S.mold = { s: M.s, dura: indNum(M.dura, CT.q0, 1, 30) | 0 }; if (M.part && IND_ITEMS_RAW[M.part]) { S.mold.part = M.part; S.mold.t = indNum(M.t, 0, 0, 600); } }
        }
        function ctFixBase(b) {
            let Q = {}; if (b.moldQ && typeof b.moldQ === 'object') Object.keys(b.moldQ).forEach(function (s) { if (CT_SHAPE[s] && Array.isArray(b.moldQ[s])) Q[s] = b.moldQ[s].slice(0, 99).map(function (v) { return indNum(v, CT.q0, CT.q0, 30) | 0; }); });
            b.moldQ = Q;
        }
