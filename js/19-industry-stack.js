// 猫盾工业：生产设备叠起来（任务 68）。放在 19-industry-cave.js 后面。
// 拿着同种设备对着已经放下的那台右键：叠上去（最多 ×8）。叠了 n 台：一炉的份数 ×n、燃料 ×n、耗电 ×n，配方时间和升降温不变，所以吞吐 ×n。
// 能叠的：灶台（拿石炉叠，规格一样）、石炉、小熔炉、大窑、电解槽、粉碎机、离心机。反应堆、原子弹、发电设备不叠。
// 左键点一堆（n ≥ 2）先弹堆叠清单：一行一台，写它在干什么，点"收起这台"收一台。收起要炉子凉了、这一炉没在做。
// 电池组叠成"一组"（自动并联）：每个电池组各自留着自己的电池和电量，组里电压差 1 V 以内的才连着，放电按电量比例分担。
// 新叠上去的电池组是空的，在清单里给它装电池（装到跟第 1 个一样多）；收起哪个带走它自己的电池。
        const STK = { max: 8, cook: { stove: 1, stone: 1, furnace: 1, kiln: 1 }, dev: { el: 1, crusher: 1, centrifuge: 1 } };
        function stkN(o) { let n = o && o.n; return n >= 1 ? Math.min(STK.max, n | 0) : 1; }
        // ── 电池组一组 ──
        function stkMemV(m) { return (m.bats || 0) * (m.li ? 3 : IND_BAT_V); }
        function stkLive(d) { return (d.grp || []).filter(function (m) { return m.bats > 0 && Math.abs(stkMemV(m) - indBankV(d)) <= IND_PAR_DV + 1e-6; }); }
        function stkBankU(d) { return (d.u || 0) + stkLive(d).reduce(function (t, m) { return t + (m.u || 0); }, 0); }
        function stkBankMax(d) { return indBankMax(d) + stkLive(d).reduce(function (t, m) { return t + indBankMax(m); }, 0); }
        // 耗电：不是一组就照原来扣；一组按各自剩的电量比例分担
        function stkDrain(s, amt) {
            if (!(amt > 0)) return;
            if (s.ty !== 'bank' || !s.grp || !s.grp.length) { s.u = Math.max(0, s.u - amt); return; }
            let L = [s].concat(stkLive(s)), tot = L.reduce(function (t, m) { return t + (m.u || 0); }, 0);
            if (tot <= 0) return;
            L.forEach(function (m) { m.u = Math.max(0, (m.u || 0) - amt * (m.u || 0) / tot); });
        }
        // 叠一个电池组进来能不能连上：空的先叠上（等装电池），有电池的要电压差 1 V 以内
        function stkBankJoin(d, m) { if (!(m.bats > 0)) return true; if (!!m.li !== !!d.li || Math.abs(stkMemV(m) - indBankV(d)) > IND_PAR_DV + 1e-6) { indFlash('电压不一样，叠不上'); return false; } return true; }
        // ── 叠上去 ──
        function stkTarget(a) {
            if (!a) return null;
            if (a.kind === 'stove') return { kind: 'cook', ty: 'stove', o: ind.base.stove, id: 'stove' };
            if (a.kind === 'cook') return { kind: 'cook', ty: a.o.ty, o: a.o, id: a.o.id };
            if (a.kind === 'dev') return { kind: 'dev', ty: a.o.ty, o: a.o, id: a.o.id };
            return null;
        }
        function stkTryStack(k, a) {
            if (ind.where !== 'base') return false;
            let t = stkTarget(a), d = IND_ITEMS[k]; if (!t || !d) return false;
            let same = t.kind === 'cook' ? d.cook && (d.cook === t.ty || (t.ty === 'stove' && d.cook === 'stone')) : d.dev === t.ty;
            if (!same) return false;
            if (t.kind === 'dev' && t.ty === 'bank') {
                let m = { bats: 0, u: 0 }; if (!stkBankJoin(t.o, m)) return true;
                if ((t.o.grp || []).length + 1 >= STK.max) { indFlash('最多叠 ' + STK.max + ' 个'); return true; }
                indBagDel(k, 1); (t.o.grp = t.o.grp || []).push(m); ind.devDirty = true; indSave();
                indFlash('叠上去了，现在一组 ' + (t.o.grp.length + 1) + ' 个电池组（并联）。左键点它给新的装电池');
                return true;
            }
            if (!(t.kind === 'cook' ? STK.cook[t.ty] : STK.dev[t.ty])) return false;   // 反应堆这些不叠，照原来的放
            let n = stkN(t.o); if (n >= STK.max) { indFlash('最多叠 ' + STK.max + ' 台'); return true; }
            indBagDel(k, 1); t.o.n = n + 1; ind.devDirty = true; ind.furnDirty = true; indSave();
            indFlash('叠上去了，现在 ×' + t.o.n); if (ind.panel) indPanelRefresh();
            return true;
        }
        // ── 左键：堆叠清单 ──
        function stkLeft(a) {
            let t = stkTarget(a); if (!t) return false;
            if (t.kind === 'dev' && t.ty === 'bank') { if (!(t.o.grp && t.o.grp.length)) return false; }
            else if (stkN(t.o) < 2) return false;
            stkPanel(t.kind, t.id); return true;
        }
        function stkFind(kind, id) {
            if (kind === 'cook') { let c = indCookById(id); return c ? { kind: 'cook', ty: c.ty, o: c.C, id: id, c: c } : null; }
            let d = indDev(id); return d ? { kind: 'dev', ty: d.ty, o: d, id: id } : null;
        }
        function stkCookState(t, i) {
            let S = t.o;
            if (S.cook) { let r = IND_RECIPES[S.cook.i]; return i < (S.cook.n || 1) ? '在做' + indOutTxt(r, 1) : '空闲（这一炉份数不够）'; }
            if (!(S.fuel > 0)) return Object.keys(S.items).length ? '缺燃料' : '空闲';
            if (!Object.keys(S.items).length) return '空闲（没放料）';
            let ri = indCookFind(ckPool(S), indCookK(t.ty, S), undefined, S.items);
            if (ri < 0) return '缺料';
            if (S.temp < IND_RECIPES[ri].minT) return '温度不够（要 ' + IND_RECIPES[ri].minT + '°C）';
            return '等着开始';
        }
        function stkDevState(t) { let d = t.o; return d.pw ? '在干活' : (d.v || 0) > 0 ? '空闲' : '没电'; }
        function stkRows(t) {
            if (t.kind === 'dev' && t.ty === 'bank') {
                let d = t.o, L = [d].concat(d.grp || []);
                return L.map(function (m, i) {
                    let on = i === 0 || stkLive(d).indexOf(m) >= 0;
                    return { txt: '第 ' + (i + 1) + ' 个：' + (m.bats || 0) + ' 节 ' + stkMemV(m).toFixed(1) + ' V　电量 ' + Math.ceil(m.u || 0) + ' / ' + indBankMax(m) + (on ? '' : m.bats > 0 ? '　<b style="color:#c62828">电压不一样，没连上</b>' : '　<span style="color:#888">空的</span>'), fill: i > 0 && (m.bats || 0) < d.bats };
                });
            }
            let n = stkN(t.o), L = [];
            for (let i = 0; i < n; i++) L.push({ txt: '第 ' + (i + 1) + ' 台：' + (t.kind === 'cook' ? stkCookState(t, i) : stkDevState(t)) });
            return L;
        }
        function stkPanel(kind, id) {
            let t = stkFind(kind, id); if (!t) { indPanelClose(); return; }
            let nm = t.kind === 'cook' ? IND_COOK[t.ty].name : IND_DEVS[t.ty].name, rows = stkRows(t), bank = t.ty === 'bank';
            let open = t.kind === 'cook' ? 'indPanelStove(' + (id === 'stove' ? "'stove'" : id) + ')' : bank ? 'indPanelBank(' + id + ')' : 'indDevAct(indDev(' + id + '))';
            let html = '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">' + nm + (bank ? '　一组 ' + rows.length + ' 个（并联）　' + indBankV(t.o).toFixed(1) + ' V　电量 ' + Math.ceil(stkBankU(t.o)) + ' / ' + stkBankMax(t.o) : '　×' + rows.length + '（' + rows.length + ' 台叠在一起）') + '</div>' +
                rows.map(function (r, i) {
                    return indRow(r.txt, (r.fill ? '<button style="' + IND_BTN + 'background:#2e7d32;" onclick="stkFill(' + id + ',' + i + ')">装电池</button>' : '') + '<button style="' + IND_BTN + 'background:#d84315;" onclick="stkTake(\'' + kind + '\',' + (id === 'stove' ? "'stove'" : id) + ',' + i + ')">收起这' + (bank ? '个' : '台') + '</button>');
                }).join('') +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#00838f;" onclick="' + open + '">打开面板</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
            indPanelShow('stack', html); ind.stkAt = { kind: kind, id: id };
        }
        // 给组里第 i 个电池组装电池：装到跟第 1 个一样多（同一种）
        function stkFill(id, i) {
            let d = indDev(id); if (!d || !d.grp || !d.grp[i - 1]) return false;
            let m = d.grp[i - 1], key = d.li ? 'battery_li' : ind.bag.battery ? 'battery' : 'battery_ni', cellU = IND_ITEMS[key].cellU || IND_BAT_U, put = 0;
            if (d.li && !m.li && m.bats > 0) { indFlash('一个电池组只能装一种电池'); return false; }
            m.li = !!d.li; m.um = indBankMax(m);
            while ((m.bats || 0) < d.bats && (ind.bag[key] || 0) > 0) { indBagDel(key, 1); m.bats = (m.bats || 0) + 1; m.um += cellU; m.u = (m.u || 0) + cellU; if (key === 'battery_ni') m.ni = (m.ni || 0) + 1; put++; }
            if (!put) indFlash('背包里没有' + indName(key)); else indFlash('装了 ' + put + ' 节');
            indSave(); stkPanel('dev', id); return put > 0;
        }
        // 收起一台：炉子要凉了、没在做；电池组带走它自己的电池和电量
        function stkTake(kind, id, i) {
            let t = stkFind(kind, id); if (!t) return false;
            let tot = { box: 0, bag: 0, ground: 0 }, put = function (key, n) { let r = indBoxAdd(key, n); tot.box += r.box; tot.bag += r.bag; tot.ground += r.ground; };
            if (t.kind === 'dev' && t.ty === 'bank') {
                let d = t.o, L = [d].concat(d.grp || []); if (!L[i]) return false;
                let m = L[i];
                if (i === 0) {   // 收第 1 个：后面那个顶上来
                    let nx = d.grp.shift(); put('dev_bank', 1); indBankCells(d).forEach(function (c) { put(c[0], c[1]); });
                    d.bats = nx.bats || 0; d.u = nx.u || 0; d.li = !!nx.li; d.ni = nx.ni || 0; if (nx.um !== undefined) d.um = nx.um; else delete d.um;
                } else { d.grp.splice(i - 1, 1); put('dev_bank', 1); indBankCells(m).forEach(function (c) { put(c[0], c[1]); }); }
                if (!d.grp.length) delete d.grp;
                ind.devDirty = true; indSave(); indFlash('收起了一个电池组，带着它自己的电池');
                if (d.grp) stkPanel('dev', id); else indPanelClose();
                return true;
            }
            let n = stkN(t.o); if (n < 2 || i < 0 || i >= n) return false;
            if (t.kind === 'cook') {
                if (t.o.cook) { indFlash('正在做，等这一炉做完再收'); return false; }
                let why = indFurnHotWhy(t.ty, t.ty === 'stove' ? null : t.o); if (why) { indFlash('还烫着：' + why); return false; }
                put(t.ty === 'stove' ? 'cook_stone' : 'cook_' + t.ty, 1);
            } else put('dev_' + t.ty, 1);
            t.o.n = n - 1; if (t.o.n <= 1) delete t.o.n;
            ind.devDirty = true; ind.furnDirty = true; indSave();
            indFlash('收起了第 ' + (i + 1) + ' 台，现在 ×' + stkN(t.o) + (tot.bag ? '' : tot.box ? '（放进了仓库箱）' : '（掉在地上）'));
            if (stkN(t.o) >= 2) stkPanel(kind, id); else indPanelClose();
            return true;
        }
        // ── 电解槽、粉碎机、离心机：一轮做 n 份（包住原来的 tick，原来的代码不动）──
        (function () {
            let el0 = indElTick;
            indElTick = function (d, dt) {
                let n = stkN(d), done = n > 1 && d.pw && indElRecipe(d, d.v || 0) >= 0 && (d.et || 0) + dt >= IND_EL_TIME;
                el0(d, dt);
                if (done) for (let i = 1; i < n; i++) { if (indElRecipe(d, d.v || 0) < 0) break; d.et = IND_EL_TIME; el0(d, 0); }
            };
            ['crusher', 'centrifuge'].forEach(function (ty) {
                let f0 = IND_DEV_TICK[ty], T = ty === 'crusher' ? NK.crushT : NK.centriT;
                IND_DEV_TICK[ty] = function (d, dt) {
                    let n = stkN(d), done = n > 1 && d.pw && IND_DEV_BUSY[ty](d) && (d.ct || 0) + dt >= T;
                    f0(d, dt);
                    if (done) for (let i = 1; i < n; i++) { if (!IND_DEV_BUSY[ty](d)) break; d.ct = T; f0(d, 0); }
                };
            });
        })();
        function stkFixBase(b) {
            let fx = function (o) { if (!o) return; if (o.n !== undefined) { let n = indNum(o.n, 1, 1, STK.max) | 0; if (n > 1) o.n = n; else delete o.n; } };
            fx(b.stove); (b.cookers || []).forEach(fx);
            (b.devs || []).forEach(function (d) {
                fx(d);
                if (d.grp !== undefined) {
                    if (d.ty !== 'bank' || !Array.isArray(d.grp)) { delete d.grp; return; }
                    d.grp = d.grp.filter(function (m) { return m && typeof m === 'object'; }).slice(0, STK.max - 1).map(function (m) { let o = { bats: indNum(m.bats, 0, 0, 128) | 0, u: indNum(m.u, 0, 0, 128 * 720), li: !!m.li, ni: indNum(m.ni, 0, 0, 128) | 0 }; if (m.um !== undefined) o.um = indNum(m.um, 0, 0, 128 * 720); return o; });
                    if (!d.grp.length) delete d.grp;
                }
            });
        }
