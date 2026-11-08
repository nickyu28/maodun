// 猫盾工业：铸造（docs/tools-trees.md 第 3 节、分步第 4 步；硬核）。放在 19-industry-tool.js 后面。
// 锭照旧。炉子多一个"熔池"：锭放进炉膛、温度到熔点以上、炉子没在做配方，每 10 秒化 1 块（1 锭 = 1 份，只装一种金属，最多 8 份、大窑 16）。
// 炉温掉到熔点以下，熔池凝成烫锭留在炉膛。
// 模具：拿小刀右键（背包里有 2 黏土）选形状，屏幕右下角一个圈（校准小游戏，任务 95），指针转到红区按空格（触屏点圈或"刻"）算一刀，雕够 N 刀得生模具；
// 耐久 = 15 + 15 × 命中率。生模具放进炉子 600°C 30 秒烧硬。熟模具在炉子面板里放进出料槽（槽里放模具就不接锭）。
// 熔池够模具要的份数、炉温在熔点以上、槽耐温够：每秒流 1 份，流满出烫零件，在槽里凉（砖槽 60 秒），左键出料槽取，模具耐久 −1，到 0 碎。
// 黏土模具只浇得了熔点低的（≤ 1100°C）：浇铁、钢会裂（耐火砖模具等"耐火砖"那条做了再加）。
// 零件现在只有青铜的（作者：铜不单独做工具；铁和钢要耐火砖模具）：小刀刃、斧头、镐头、铲头、剪刀片。工作台 头 + 木柄 → 青铜的工具（剪刀片 + 草绳）；木头 1 → 木柄 2。
// 青铜的工具不再能在工作台直接用锭做（原来那几条配方留着、标 off 不显示，下标不变）。铁、钢的工具还在工作台做，等耐火砖。
        const CT = { meltT: 10, cap: 8, capKiln: 16, flow: 1, clayMax: 1100, fireMax: 1700, failMax: 3, q0: 15, q1: 15 };
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
                add['mold_' + s + '_f_raw'] = { name: '耐火砖' + S.n + '生模具', col: 0xd7ccc8, use: '放进炉子 1500°C 以上烧 60 秒烧硬（要鼓风或电炉）' };   // 耐火砖模具（任务 4 铸造后半）；烧硬的配方在 19-industry-cast2.js（配方表只能往后加）
                add['mold_' + s + '_f'] = { name: '耐火砖' + S.n + '模具', col: 0xa1887f, use: '炉子面板里放进出料槽，什么金属都能铸，包括铁和钢（要 ' + S.need + ' 份）' };
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
        function ctMeltUnit(S) {   // 炉膛里下一样能化的：{ k 物品, m 金属, n 份 }
            let u = null; Object.keys(S.items).forEach(function (k) { if (u || !(S.items[k] > 0)) return; if (CT_METAL[k]) u = { k: k, m: k, n: 1 }; else { let q = typeof rpMeltOf === 'function' ? rpMeltOf(k) : null; if (q) u = { k: k, m: q.m, n: q.n }; } });
            return u;
        }
        function ctMetalOf(S) { let m = null; Object.keys(S.items).forEach(function (k) { if (!m && CT_METAL[k] && S.items[k] > 0) m = k; }); return m; }
        function ctCap(c) { return c.ty === 'kiln' ? CT.capKiln : CT.cap; }
        // 每个炉子每帧（ckTick 里调）：化锭、凝固、往模具里流、零件凉
        function ctTick(c, dt) {
            if (!indHard()) return;
            let S = c.C, P = S.pool;
            if (P && P.n > 0 && S.temp < CT_METAL[P.m].melt) {   // 凉到熔点以下：凝成烫锭（槽接得住进槽，不然留在炉膛）
                ctSolid(S, CT_METAL[P.m].hot, P.n); S.pool = null; P = null; S.flowT = 0;
                if (ind.panel === 'stove') ind.panelDirty = true;
            }
            let U = !S.cook ? ctMeltUnit(S) : null, m = U && U.m;   // 锭化 1 份；坏了的金属工具化几份（任务 78，19-industry-repair.js）
            if (m && S.temp >= CT_METAL[m].melt && indCookFind(ckPool(S), indCookK(c.ty, S), undefined, S.items) < 0) {
                if (P && P.m !== m) { if (!S.ctWarn) { S.ctWarn = 1; indFlash('熔池里是' + CT_METAL[P.m].n + '，先倒完'); } }
                else if (!P || P.n + U.n <= ctCap(c)) {
                    S.meltT = (S.meltT || 0) + dt;
                    if (S.meltT >= CT.meltT) { S.meltT = 0; S.items[U.k]--; if (S.items[U.k] <= 0) delete S.items[U.k]; S.pool = P = { m: m, n: (P ? P.n : 0) + U.n }; S.ctWarn = 0; if (ind.panel === 'stove') ind.panelDirty = true; }
                }
            } else S.meltT = 0;
            let M = S.mold; if (!M) return;
            if (M.part) { if (M.t > 0) M.t = Math.max(0, M.t - dt); return; }
            if (!P || !ckSpoutOn(S) || S.temp < CT_METAL[P.m].melt || CT_METAL[P.m].melt > ckSpoutDef(S).maxT) { M.fill = 0; return; }
            if (CT_METAL[P.m].melt > (M.f ? CT.fireMax : CT.clayMax)) {   // 黏土模具浇不了铁、钢：裂掉，流进来的那份在槽里凝成烫锭
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
        // n 块烫锭落下来：槽接得住且还有地方就进槽，不然留在炉膛（规则同冶炼出来的烫锭，任务 94）
        function ctSolid(S, h, n) { for (let i = 0; i < n; i++) { if (ckSpoutTakes(S, h) && S.spout.length < IND_SPOUT_CAP) S.spout.push({ k: h, t: ckSpoutDef(S).cool }); else S.out[h] = (S.out[h] || 0) + 1; } }
        // 槽里放模具就不接锭
        function ctSpoutBusy(S) { return !!S.mold; }
        // 左键出料槽：零件凉了就取出来，模具耐久 −1
        function ctTake(c) {
            let S = c.C, M = S.mold; if (!M || !M.part) return false;
            if (M.t > 0) { indFlash(indName(M.part) + '还烫，等 ' + Math.ceil(M.t) + ' 秒'); return true; }
            if (indBagAdd(M.part, 1) <= 0) { indFlash('背包满了'); return true; }
            M.part = null; M.dura--;
            if (M.dura <= 0) { S.mold = null; indFlash('模具用到头，碎了'); }
            indSave(); if (ind.panel === 'stove') ind.panelDirty = true;
            return true;
        }
        function ctMoldPut(k) {
            let c = indCookCur(), S = c.C, f = /_f$/.test(k), s = k.replace(/^mold_/, '').replace(/_f$/, '');
            if (!CT_SHAPE[s] || !(ind.bag[k] > 0)) return;
            if (!ckSpoutOn(S)) { indFlash('先装出料槽'); return; }
            if (S.mold) { indFlash('槽里已经有模具了'); return; }
            if (S.spout.length) { indFlash('先把槽里的锭取走'); return; }
            let qk = s + (f ? '_f' : ''), Q = ind.base.moldQ = ind.base.moldQ || {}, q = (Q[qk] || []).shift(); if (Q[qk] && !Q[qk].length) delete Q[qk];
            indBagDel(k, 1); S.mold = { s: s, dura: q || CT.q0 }; if (f) S.mold.f = true; indSave(); indPanelStove();
        }
        function ctMoldOut() {
            let c = indCookCur(), S = c.C, M = S.mold; if (!M) return;
            // 任何时候都能取出来（任务 94）：烫零件跟着模具一起出来（烫手要钳子）；浇到一半，已经流进去的份数凝成烫锭，没流的留在熔池，模具耐久不扣
            if (M.part && M.t > 0 && !ind.bag.tongs) { indFlash('里面的零件还烫，得有钳子'); return; }
            let mk = 'mold_' + M.s + (M.f ? '_f' : '');
            if (indBagAdd(mk, 1) <= 0) { indFlash('背包满了'); return; }
            let Q = ind.base.moldQ = ind.base.moldQ || {}, qk = M.s + (M.f ? '_f' : '');
            if (M.part) { if (indBagAdd(M.part, 1) <= 0) { indBagDel(mk, 1); indFlash('背包满了'); return; } M.dura--; if (M.dura > 0) (Q[qk] = Q[qk] || []).unshift(M.dura); else indFlash('模具用到头，碎了'); if (M.dura <= 0) indBagDel(mk, 1); }
            else {
                let P = S.pool, got = Math.floor(M.fill || 0); S.mold = null;   // 模具先拿掉，凝成的锭才进得了槽
                if (got > 0 && P && CT_METAL[P.m]) { got = Math.min(got, P.n); P.n -= got; if (P.n <= 0) S.pool = null; ctSolid(S, CT_METAL[P.m].hot, got); }
                (Q[qk] = Q[qk] || []).unshift(M.dura);
            }
            S.mold = null; indSave(); indPanelStove();
        }
        function ctHtml(c) {
            if (!indHard()) return '';
            let S = c.C, P = S.pool, M = S.mold, h = '<br>熔池：' + (P ? CT_METAL[P.m].n + ' ' + P.n + ' / ' + ctCap(c) + ' 份' : '空') + (S.meltT > 0 ? '　化锭 ' + Math.floor(S.meltT / CT.meltT * 100) + '%' : '');
            if (M) h += '<br>模具：' + (M.f ? '耐火砖' : '') + CT_SHAPE[M.s].n + '（还能用 ' + M.dura + ' 次）' + (M.part ? '　' + indName(M.part) + (M.t > 0 ? ' 烫，还要 ' + Math.ceil(M.t) + ' 秒' : ' 凉了，左键出料槽取') : M.fill > 0 ? '　在流 ' + Math.floor(M.fill / CT_SHAPE[M.s].need * 100) + '%' : P && !CT_PART_METAL[P.m] ? '　<span style="color:#c62828">' + CT_METAL[P.m].n + '铸不了零件</span>' : '') + '　<button style="' + IND_BTN + '" onclick="ctMoldOut()">取下模具</button>';
            let ms = Object.keys(ind.bag).filter(function (k) { return /^mold_[a-z]+(_f)?$/.test(k) && CT_SHAPE[k.slice(5).replace(/_f$/, '')]; });
            if (!M && ms.length) h += '<br>' + ms.map(function (k) { return '<button style="' + IND_BTN + 'background:#6d4c41;" onclick="ctMoldPut(\'' + k + '\')">' + indName(k) + ' 放进出料槽</button>'; }).join('');
            return h;
        }
        // ── 雕模具 ──
        function ctCarveMenu() {
            if (!indHard()) return false;
            if (ind.carve) { return true; }
            let cl = (ind.bag.clay || 0) >= 2, br = (ind.bag.brick_fire || 0) >= 2;
            if (!cl && !br) return false;
            indPanelShow('carve', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">雕模具（用 2 ' + (cl && br ? '黏土或耐火砖' : cl ? '黏土' : '耐火砖') + '）</div>' + Object.keys(CT_SHAPE).map(function (s) {
                return indRow(CT_SHAPE[s].n + '模具（' + CT_SHAPE[s].cuts + ' 刀）', (cl ? '<button style="' + IND_BTN + 'background:#6d4c41;" onclick="ctCarveStart(\'' + s + '\')">雕</button>' : '') + (br ? '<button style="' + IND_BTN + 'background:#a1887f;" onclick="ctCarveStart(\'' + s + '\',1)">雕耐火砖的</button>' : ''));
            }).join('') + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            return true;
        }
        // 雕模具 = 校准小游戏（任务 95）：用惊魂夜／大厅练习共用的 calibZoneAt、CALIB（js/02-lobby.js），不复制：圈上一根指针转（CALIB.sweep 秒一圈），
        // 红区按空格（触屏点圈或"刻"）算命中，白区算擦边（也算一刀，质量折半以上），灰区偏了：眩晕 CALIB.stun 秒，连续失败 3 次生模具碎、黏土或耐火砖不退。
        // 命中率 = 质量总和 / 按的次数，照旧决定耐久（15 + 15 × 命中率）。
        const CT_Q = { red: 1, white: 0.6 };
        function ctCarveStart(s, f) {
            if (!CT_SHAPE[s]) return;
            ind.carve = { s: s, hit: 0, score: 0, tries: 0, fails: 0, t0: ind.t, f: !!f }; indPanelClose(); ctBar();
        }
        function ctPos() { return (((ind.t - ind.carve.t0) / CALIB.sweep) % 1 + 1) % 1; }
        function ctStunned() { return !!ind && ind.t < (ind.stunUntil || 0); }
        function ctHit() {
            let C = ind.carve; if (!C) return false;
            if (ctStunned()) return true;
            if (tlKind(indSel()) !== 'knife') { indFlash('拿上小刀接着雕'); return true; }
            let mat = C.f ? 'brick_fire' : 'clay';
            if ((ind.bag[mat] || 0) < 2) { ind.carve = null; ctBar(); indFlash((C.f ? '耐火砖' : '黏土') + '不够了，不雕了'); return true; }
            C.tries++;
            let zone = calibZoneAt(ctPos());
            if (!CT_Q[zone]) {   // 偏了：眩晕；连续失败 3 次模具碎
                C.fails++; ind.stunUntil = ind.t + CALIB.stun;
                if (C.fails >= CT.failMax) { indBagDel(mat, 2); ind.carve = null; ctBar(); indFlash('模具碎了，' + (C.f ? '耐火砖' : '黏土') + '没了'); indSave(); return true; }
                indFlash('偏了，眩晕 ' + CALIB.stun + ' 秒'); ctBar(); return true;
            }
            C.fails = 0; C.hit++; C.score += CT_Q[zone];
            if (C.hit < CT_SHAPE[C.s].cuts) { ctBar(); return true; }
            let q = Math.min(CT.q0 + CT.q1, Math.max(CT.q0, Math.round(CT.q0 + CT.q1 * C.score / C.tries)));
            let rk = 'mold_' + C.s + (C.f ? '_f' : '') + '_raw'; indBagDel(mat, 2); indBagAdd(rk, 1);
            let qk = C.s + (C.f ? '_f' : ''), Q = ind.base.moldQ = ind.base.moldQ || {}; (Q[qk] = Q[qk] || []).push(q);
            indFlash('雕好了' + indName(rk) + '（烧硬以后能用 ' + q + ' 次）'); ind.carve = null; ctBar(); indSave();
            return true;
        }
        // 圈：灰白红三段（取自 CALIB.zones），一根指针转；眩晕时圈变灰
        function ctBar() {
            let e = document.getElementById('ind-carve');
            if (!ind || !ind.carve) { if (e && e.parentNode) e.parentNode.removeChild(e); return; }
            let C = ind.carve;
            if (!e) {
                let col = { gray: '#777', white: '#eceff1', red: '#e91e63' }, st = [];
                CALIB.zones.forEach(function (z) { st.push(col[z[2]] + ' ' + z[0] * 360 + 'deg ' + z[1] * 360 + 'deg'); });
                e = document.createElement('div'); e.id = 'ind-carve';
                e.style.cssText = 'position:fixed;right:16px;bottom:90px;z-index:45;width:150px;background:rgba(0,0,0,.55);border-radius:10px;padding:8px;color:#fff;font:13px "Microsoft YaHei",sans-serif;text-align:center;';
                e.innerHTML = '<div id="ind-carve-t"></div><div id="ind-carve-d" onpointerdown="event.preventDefault();ctHit();" style="position:relative;margin:6px auto;width:110px;height:110px;border-radius:50%;background:conic-gradient(' + st.join(',') + ');touch-action:manipulation;"><div style="position:absolute;left:14px;top:14px;right:14px;bottom:14px;border-radius:50%;background:#222;"></div><div id="ind-carve-c" style="position:absolute;left:53px;top:4px;width:4px;height:51px;background:#ffeb3b;transform-origin:50% 100%;border-radius:2px;"></div></div>' +
                    '<button style="padding:5px 18px;border:none;border-radius:6px;background:#6d4c41;color:#fff;font-size:15px;" onpointerdown="event.preventDefault();ctHit();">刻</button>';
                document.body.appendChild(e);
            }
            let cc = document.getElementById('ind-carve-c'), tt = document.getElementById('ind-carve-t'), dd = document.getElementById('ind-carve-d');
            if (cc) cc.style.transform = 'rotate(' + ctPos() * 360 + 'deg)';
            if (dd) dd.style.opacity = ctStunned() ? 0.4 : 1;
            if (tt) tt.textContent = '雕' + (C.f ? '耐火砖' : '') + CT_SHAPE[C.s].n + '模具 ' + C.hit + ' / ' + CT_SHAPE[C.s].cuts + (tlKind(indSel()) !== 'knife' ? '　拿上小刀' : ctStunned() ? '　眩晕' : '　红区按空格') + (C.fails ? '　失败 ' + C.fails + ' / ' + CT.failMax : '');
        }
        function ctFix(S) {
            if (S.pool && !(S.pool && CT_METAL[S.pool.m] && S.pool.n > 0)) S.pool = null; else if (S.pool) S.pool = { m: S.pool.m, n: indNum(S.pool.n, 1, 1, CT.capKiln) | 0 };
            if (S.mold && !(S.mold && CT_SHAPE[S.mold.s])) S.mold = null;
            else if (S.mold) { let M = S.mold; S.mold = { s: M.s, dura: indNum(M.dura, CT.q0, 1, 30) | 0 }; if (M.f) S.mold.f = true; if (M.part && IND_ITEMS_RAW[M.part]) { S.mold.part = M.part; S.mold.t = indNum(M.t, 0, 0, 600); } }
        }
        function ctFixBase(b) {
            let Q = {}; if (b.moldQ && typeof b.moldQ === 'object') Object.keys(b.moldQ).forEach(function (s) { if (CT_SHAPE[s.replace(/_f$/, '')] && Array.isArray(b.moldQ[s])) Q[s] = b.moldQ[s].slice(0, 99).map(function (v) { return indNum(v, CT.q0, CT.q0, 30) | 0; }); });
            b.moldQ = Q;
        }
