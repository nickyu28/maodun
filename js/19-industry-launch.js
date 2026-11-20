// 猫盾工业：发射台、装配、加注、点火、结算、Tab 进度表（任务 R5，火箭第 5 期）。放在 19-industry-rocket.js 后面。只有硬核。
// 发射台：钢 10 + 砖 20 + 铜线 10，放在基地一块平地上，周围 8 米内不能有别的东西，只能一个。
// 装配：往台子里放发动机、燃料罐、舱体、整流罩和燃料。一级 = 煤油发动机 + 分给一级的燃料罐，二级 = 真空煤油或氢氧发动机 + 剩下的罐。
// 每个罐装 4 份燃料（每份 5 吨）：煤油加液氧，氢氧发动机的二级是液氢加液氧。界面实时算每级干重、燃料重、比冲、推重比、总 Δv 和最大载荷。
// 点火 10 秒倒计时。Δv ≥ 9.4 千米/秒才入轨，推重比小于 1 起不来，Δv 不够升到半空烧完炸，发射台要重修。入轨就通关：结算页，接着玩。
        const RK5 = { dv: 9.4, g: 9.8, count: 10, portion: 5, per: 4, clear: 8, padIn: { steel: 10, brick: 20, wire: 10 }, fixIn: { steel: 5, brick: 10 },
            parts: ['eng_kero', 'eng_kero_s', 'eng_vac', 'eng_h2', 'tank_fuel', 'capsule', 'fairing'], fuels: ['kerosene', 'tank_lox', 'tank_lh2'] };
        Object.assign(IND_ITEMS_RAW, { dev_pad: { name: '发射台', col: 0x607d8b, dev: 'pad', use: '放火箭的地方，装配、加注、点火，周围 8 米不能有别的东西' } });
        IND_DEVS.pad = { name: '发射台', col: 0x607d8b, rated: 24, minV: 0, draw: 0, size: [6, 0.5, 6], nowire: true };
        IND_CRAFT.push({ out: 'dev_pad', in: RK5.padIn, need: 'hammer', hard: true });
        ACH.push({ id: 'rocket', main: 5, pic: 1, ico: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5e35b1" stroke-width="1.5" stroke-linejoin="round"><path d="M12 2c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z" fill="#ede7f6"/><circle cx="12" cy="9" r="1.6"/><path d="M8 14l-3 4 4-1M16 14l3 4-4-1M12 17v4"/></svg>', name: '去外太空', desc: '火箭点火入轨' });
        ACH_BY.rocket = ACH[ACH.length - 1];
        function rkPadOk(x, z) {
            let B = ind.base;
            if (B.devs.some(function (d) { return d.ty === 'pad'; })) { indFlash('已经有一个发射台了'); return false; }
            if (B.devs.some(function (d) { return Math.hypot(d.x - x, d.z - z) < RK5.clear; }) || indCooks().some(function (c) { return Math.hypot(c.x - x, c.z - z) < RK5.clear; }) || !indSpotFree(x, z, RK5.clear)) { indFlash('发射台周围 8 米内不能有别的东西，换个空地'); return false; }
            return true;
        }
        // 算：st 是台子里的东西，cfg 是 { t1: 一级罐数, f1: 一级装满几成, f2: 二级装满几成 }，extra 是舱体之外多带的吨数
        function rkCalc(st, cfg, extra) {
            let R = IND_ITEMS_RAW, n = function (k) { return st[k] || 0; }, o = { err: [] };
            let e1 = ['eng_kero', 'eng_kero_s'], e2 = ['eng_vac', 'eng_h2'];
            let sum = function (ks, f) { let t = 0; ks.forEach(function (k) { t += n(k) * R[k].rkt[f]; }); return t; };
            o.ne1 = n('eng_kero') + n('eng_kero_s'); o.ne2 = n('eng_vac') + n('eng_h2');
            o.th1 = sum(e1, 'thrust'); o.th2 = sum(e2, 'thrust'); o.isp1 = 300;
            o.isp2 = o.th2 ? (n('eng_vac') * R.eng_vac.rkt.thrust * R.eng_vac.rkt.isp + n('eng_h2') * R.eng_h2.rkt.thrust * R.eng_h2.rkt.isp) / o.th2 : 0;
            o.hydro = n('eng_h2') > 0;
            if (n('eng_vac') > 0 && n('eng_h2') > 0) o.err.push('二级只用一种发动机');
            let T = n('tank_fuel'), tm = R.tank_fuel.rkt.mass; o.t1 = Math.max(0, Math.min(cfg.t1 || 0, T)); o.t2 = T - o.t1;
            let cl = function (v) { return Math.max(0, Math.min(1, v === undefined ? 1 : v)); };
            o.p1 = Math.round(cl(cfg.f1) * o.t1 * RK5.per); o.p2 = Math.round(cl(cfg.f2) * o.t2 * RK5.per);
            o.need = { kerosene: o.p1 + (o.hydro ? 0 : o.p2), tank_lox: o.p1 + o.p2, tank_lh2: o.hydro ? o.p2 : 0 };
            o.m1 = o.p1 * RK5.portion; o.m2 = o.p2 * RK5.portion;
            o.dry1 = sum(e1, 'mass') + o.t1 * tm; o.dry2 = sum(e2, 'mass') + o.t2 * tm;
            o.top = n('capsule') * R.capsule.rkt.mass + n('fairing') * R.fairing.rkt.mass + (extra || 0);
            o.m02 = o.dry2 + o.m2 + o.top; o.mf2 = o.dry2 + o.top; o.m01 = o.dry1 + o.m1 + o.m02; o.mf1 = o.dry1 + o.m02;
            o.dv2 = o.isp2 && o.m2 > 0 ? o.isp2 * RK5.g * Math.log(o.m02 / o.mf2) / 1000 : 0;
            o.dv1 = o.m1 > 0 ? o.isp1 * RK5.g * Math.log(o.m01 / o.mf1) / 1000 : 0;
            o.dv = o.dv1 + o.dv2; o.twr = o.m01 > 0 ? o.th1 / (o.m01 * RK5.g) : 0; o.twr2 = o.m02 > 0 ? o.th2 / (o.m02 * RK5.g) : 0;
            if (!n('capsule')) o.err.push('缺舱体'); if (!n('fairing')) o.err.push('缺整流罩'); if (!o.ne1) o.err.push('一级缺发动机'); if (!o.ne2) o.err.push('二级缺发动机');
            if (o.t1 < 1) o.err.push('一级缺燃料罐'); if (o.t2 < 1) o.err.push('二级缺燃料罐');
            Object.keys(o.need).forEach(function (k) { if (n(k) < o.need[k]) o.err.push('少 ' + (o.need[k] - n(k)) + ' 个' + indName(k)); });
            o.built = !o.err.length; o.ok = o.built && o.dv >= RK5.dv && o.twr >= 1;
            return o;
        }
        // 在目标 Δv 和推重比 ≥ 1 的前提下，最多还能多带几吨（货运火箭以后用）
        function rocketPayload(st, cfg) {
            let ok = function (x) { let c = rkCalc(st, cfg, x); return c.dv >= RK5.dv && c.twr >= 1 && !c.err.filter(function (e) { return !/^少/.test(e); }).length; };
            if (!ok(0)) return 0;
            let lo = 0, hi = 400; for (let i = 0; i < 40; i++) { let m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
            return Math.floor(lo * 10) / 10;
        }
        function rkPad() { return ind && ind.base ? ind.base.devs.filter(function (d) { return d.ty === 'pad'; })[0] : null; }
        function rkCfgOf(d) { return d.cfg = d.cfg || { t1: 3, f1: 1, f2: 1 }; }
        function rkCfg(id, f, dlt) {
            let d = indDev(id); if (!d) return; let c = rkCfgOf(d);
            if (f === 't1') c.t1 = Math.max(0, (c.t1 || 0) + dlt); else c[f] = Math.max(0, Math.min(1, Math.round(((c[f] === undefined ? 1 : c[f]) + dlt) * 10) / 10));
            indSave(); ind.panelDirty = true;
        }
        function rkPadFix(id) {
            let d = indDev(id); if (!d || !d.broken) return;
            if (Object.keys(RK5.fixIn).some(function (k) { return (ind.bag[k] || 0) < RK5.fixIn[k]; })) { indFlash('重修要 ' + Object.keys(RK5.fixIn).map(function (k) { return RK5.fixIn[k] + ' ' + indName(k, true); }).join('、')); return; }
            Object.keys(RK5.fixIn).forEach(function (k) { indBagDel(k, RK5.fixIn[k]); });
            d.broken = false; indSave(); indFlash('发射台修好了'); ind.panelDirty = true;
        }
        IND_DEV_HTML.pad = function (d) {
            let c = rkCfgOf(d), o = rkCalc(d.st, c, 0), pay = rocketPayload(d.st, c), f1 = Math.round((c.f1 === undefined ? 1 : c.f1) * 100), f2 = Math.round((c.f2 === undefined ? 1 : c.f2) * 100);
            let B = function (t, js) { return '<button style="' + IND_BTN + 'padding:4px 10px;margin:0 2px;" onclick="' + js + '">' + t + '</button>'; };
            let row = function (a, b) { return '<div style="display:flex;justify-content:space-between;gap:10px;"><span>' + a + '</span><b>' + b + '</b></div>'; };
            let f = function (v, dg) { return v.toFixed(dg === undefined ? 1 : dg); };
            if (d.broken) return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">发射台，炸坏了</div><div style="line-height:1.7;">上一次没入轨，发射台炸坏了，里面的东西都没了。重修要 ' + Object.keys(RK5.fixIn).map(function (k) { return RK5.fixIn[k] + ' ' + indName(k, true); }).join('、') + '。</div><div style="margin-top:8px;">' + B('重修', 'rkPadFix(' + d.id + ')') + B('关上', 'indPanelClose()') + '</div>';
            let st1 = '<b>一级</b>　发动机 ' + o.ne1 + '　罐 ' + o.t1 + ' ' + B('−', 'rkCfg(' + d.id + ",'t1',-1)") + B('+', 'rkCfg(' + d.id + ",'t1',1)") + '　装 ' + f1 + '% ' + B('−', 'rkCfg(' + d.id + ",'f1',-0.1)") + B('+', 'rkCfg(' + d.id + ",'f1',0.1)");
            let st2 = '<b>二级</b>　发动机 ' + o.ne2 + '　罐 ' + o.t2 + '，剩下的　装 ' + f2 + '% ' + B('−', 'rkCfg(' + d.id + ",'f2',-0.1)") + B('+', 'rkCfg(' + d.id + ",'f2',0.1)");
            let need = '要煤油 ' + o.need.kerosene + '、液氧罐 ' + o.need.tank_lox + (o.hydro ? '、液氢罐 ' + o.need.tank_lh2 : '');
            let go = o.built ? (ind.rkL ? '<span style="color:#888;">倒计时中</span>' : '<button style="' + IND_BTN + 'background:#c62828;" onclick="rkLaunch(' + d.id + ')">点火，倒计时 ' + RK5.count + ' 秒</button>') : '<span style="color:#c62828;">' + o.err.join('、') + '</span>';
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">发射台</div>' +
                '<div style="line-height:1.7;">台子里：' + nkDevItems(d) + '</div>' +
                '<div style="margin-top:6px;line-height:1.9;">' + st1 + '<br>' + st2 + '<br><small style="color:#666;">' + need + '。每个罐 ' + RK5.per + ' 份，每份 ' + RK5.portion + ' 吨。</small></div>' +
                '<div style="margin-top:8px;padding:8px;background:#f5f5f5;border-radius:8px;line-height:1.6;">' +
                row('一级　干重／燃料重', f(o.dry1) + ' ／ ' + f(o.m1) + ' 吨') + row('一级　比冲／推重比／Δv', f(o.isp1, 0) + ' 秒 ／ ' + f(o.twr, 2) + ' ／ ' + f(o.dv1, 2) + ' 千米/秒') +
                row('二级　干重／燃料重', f(o.dry2) + ' ／ ' + f(o.m2) + ' 吨') + row('二级　比冲／推重比／Δv', f(o.isp2, 0) + ' 秒 ／ ' + f(o.twr2, 2) + ' ／ ' + f(o.dv2, 2) + ' 千米/秒') +
                row('总 Δv，要 ≥ ' + RK5.dv, '<span style="color:' + (o.dv >= RK5.dv ? '#2e7d32' : '#c62828') + ';">' + f(o.dv, 2) + ' 千米/秒</span>') + row('起飞推重比，要 ≥ 1', '<span style="color:' + (o.twr >= 1 ? '#2e7d32' : '#c62828') + ';">' + f(o.twr, 2) + '</span>') + row('最大载荷', f(pay) + ' 吨') + '</div>' +
                '<div style="margin-top:8px;">' + go + '</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + (nkPutRows(d, function (k) { return RK5.parts.indexOf(k) >= 0 || RK5.fuels.indexOf(k) >= 0; }) || '<div style="color:#999;padding:6px 0;">身上没有火箭部件和燃料</div>') + NK_FOOT(d);
        };
        // 倒计时和点火
        function rkLaunch(id) {
            let d = indDev(id); if (!d || d.broken || ind.rkL) return;
            let o = rkCalc(d.st, rkCfgOf(d), 0); if (!o.built) { indFlash(o.err.join('，')); return; }
            ind.rkL = { id: id, t: RK5.count }; indPanelClose(); rkCountShow();
        }
        function rkAbort() { if (!ind || !ind.rkL) return; ind.rkL = null; rkCountHide(); indFlash('取消了点火'); }
        function rkCountShow() {
            let e = document.getElementById('ind-count');
            if (!e) { e = document.createElement('div'); e.id = 'ind-count'; e.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:60;text-align:center;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;'; document.body.appendChild(e); }
            if (ind && ind.rkL) e.innerHTML = '<div style="font-size:20px;">点火倒计时</div><div style="font-size:84px;font-weight:bold;line-height:1;">' + Math.max(0, Math.ceil(ind.rkL.t)) + '</div><button style="' + IND_BTN + 'pointer-events:auto;margin-top:8px;" onclick="rkAbort()">取消</button>';
        }
        function rkCountHide() { let e = document.getElementById('ind-count'); if (e && e.parentNode) e.parentNode.removeChild(e); }
        function rkIgnite() {
            let L = ind.rkL; ind.rkL = null; rkCountHide(); if (!L) return;
            let d = indDev(L.id); if (!d) return; let c = rkCfgOf(d), o = rkCalc(d.st, c, 0);
            if (!o.built) { indFlash('东西不齐，没点着'); return; }
            if (o.twr < 1) { indFlash('推力不够，火箭起不来，多装发动机或少装燃料'); return; }
            let eat = function () { RK5.parts.concat(RK5.fuels).forEach(function (k) { delete d.st[k]; }); };
            if (o.dv < RK5.dv) { eat(); d.broken = true; indSave(); indFlash('升到半空烧完了，火箭掉下来炸了，发射台要重修'); return; }
            eat(); let B = ind.base; B.rocket = { clock: B.clock, t: Date.now() }; indAch('rocket'); indSave(); rkEnding(o);
        }
        function rkEnding(o) {
            let B = ind.base, ach = Object.keys(B.ach || {}).length, tot = ACH.filter(function (a) { return !a.hide; }).length, m = Math.floor((B.clock || 0) / 60), tt = Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
            let e = document.createElement('div'); e.id = 'ind-end'; e.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:70;background:rgba(10,10,30,.88);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;';
            e.innerHTML = '<div style="max-width:420px;padding:20px;line-height:1.9;"><div style="font-size:34px;font-weight:bold;">入轨成功</div><div style="margin-top:10px;">总 Δv ' + o.dv.toFixed(2) + ' 千米/秒，乘客：你</div><div>用时 ' + tt + '，成就 ' + ach + ' / ' + tot + '</div><div style="margin-top:14px;font-size:22px;">第 1 章　完</div><div style="margin-top:18px;"><button style="' + IND_BTN + '" onclick="rkEndClose()">接着玩</button></div></div>';
            document.body.appendChild(e); if (document.pointerLockElement) document.exitPointerLock();
        }
        function rkEndClose() { let e = document.getElementById('ind-end'); if (e && e.parentNode) e.parentNode.removeChild(e); }
        (function () {
            let t0 = indTick;
            indTick = function (dt) {
                let r = t0.apply(this, arguments);
                if (ind && !ind.over && ind.rkL) { ind.rkL.t -= dt; if (ind.rkL.t <= 0) rkIgnite(); else rkCountShow(); }
                return r;
            };
        })();
        // ── Tab 进度表：列火箭每个部件，没见过的写 ？，点开只看这一层怎么做（作者 11-01） ──
        const RK_TREE = [['dev_pad', '发射台'], ['eng_kero', '一级发动机'], ['eng_kero_s', '一级发动机，钢铝版'], ['eng_vac', '二级发动机，煤油'], ['eng_h2', '二级发动机，氢氧'], ['tank_fuel', '燃料罐'], ['capsule', '舱体'], ['fairing', '整流罩'], ['kerosene', '煤油'], ['tank_lox', '液氧罐'], ['tank_lh2', '液氢罐']];
        function rkFirstRecipe(k) { return IND_CRAFT.filter(function (r) { return r.out === k && !r.fix && !r.off && r.hard; })[0] || IND_RECIPES.filter(function (r) { return r.out && r.out[k]; })[0] || null; }
        function rkProgress() {
            let seen = RK_TREE.filter(function (e) { return indSeen(e[0]); }).length, B = ind.base, open = ind.rkOpen = ind.rkOpen || {};
            let rows = RK_TREE.map(function (e) {
                let k = e[0], got = indSeen(k), r = rkFirstRecipe(k), step = '';
                if (open[k] && r) step = '<div style="margin:4px 0 4px 14px;font-size:13px;color:#555;">' + Object.keys(r.in).map(function (i) { return (indSeen(i) ? indName(i, true) : '？') + ' ×' + r.in[i]; }).join('、') + (r.need ? '，要' + indName(r.need, true) : '') + '</div>';
                return '<div style="padding:5px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="rkProgOpen(\'' + k + '\')"><b>' + (got ? e[1] : '？？？') + '</b>' + (got ? '<span style="color:#2e7d32;"> 做过了</span>' : '') + step + '</div>';
            }).join('');
            indPanelShow('prog', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">进度　去外太空　发现 ' + seen + ' / ' + RK_TREE.length + (B.rocket ? '　已入轨' : '') + '</div><div style="font-size:12px;color:#888;margin-bottom:4px;">点一行看这一步怎么做</div>' + rows + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
        function rkProgOpen(k) { ind.rkOpen = ind.rkOpen || {}; ind.rkOpen[k] = !ind.rkOpen[k]; rkProgress(); }
        function rkProgToggle() { if (!ind || ind.paused || ind.over) return; if (ind.panel === 'prog') indPanelClose(); else if (indHard()) rkProgress(); }
