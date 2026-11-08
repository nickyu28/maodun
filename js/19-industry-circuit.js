// 猫盾工业：电路第 1 期（docs/circuit.md 第 1、2、4、5 节，docs/circuit-steps.md C1～C6）。放在 19-industry-farm.js 后面。
// 信号是 0～255 的整数，0 = 没有；信号线和铜线（电力线）是两套：拿信号线先点输出块、再点输入块。电路刻 0.1 秒，每个元件延迟 1 刻。
// 元件都是"设备"（放下、收起、存档、炸掉都走现有的设备规矩）：按钮、拉杆、灯不吃电；与、或、非、异或、锁存、延时、芯片是有源的，要拿铜线接电（minV 1.5 V、额定 24 V、每个 0.05 U/秒），没电输出 0。
// 芯片：左键开 10 × 10 画布，从背包点元件放进格子（最多 8 个）、点两个格子连线，4 进 4 出，关上就封装；芯片里不放芯片。触屏和鼠标都是点选。
        const RC = { tick: 0.1, perFrame: 2000, maxChip: 40, maxSig: 600, chipEl: 8, outMax: 8, realBudgetMs: 500, gridN: 10, pins: 4 };
        const RC_KINDS = {   // 元件：ins 几个输入口、outs 几个输出口、act 要不要电、名字
            cbtn: { name: '按钮', ins: 0, outs: 1, act: false, col: 0xbdbdbd, size: [0.5, 0.35, 0.5] },
            clev: { name: '拉杆', ins: 0, outs: 1, act: false, col: 0x8d6e63, size: [0.4, 0.8, 0.4] },
            clamp: { name: '信号灯', ins: 1, outs: 0, act: false, col: 0xfff59d, size: [0.5, 0.6, 0.5] },
            cand: { name: '与', ins: 2, outs: 1, act: true, col: 0x4db6ac, size: [0.7, 0.5, 0.7] },
            cor: { name: '或', ins: 2, outs: 1, act: true, col: 0x4fc3f7, size: [0.7, 0.5, 0.7] },
            cnot: { name: '非', ins: 1, outs: 1, act: true, col: 0xff8a65, size: [0.7, 0.5, 0.7] },
            cxor: { name: '异或', ins: 2, outs: 1, act: true, col: 0xba68c8, size: [0.7, 0.5, 0.7] },
            clatch: { name: '锁存', ins: 2, outs: 1, act: true, col: 0xffd54f, size: [0.7, 0.5, 0.7] },
            cdelay: { name: '延时', ins: 1, outs: 1, act: true, col: 0x90a4ae, size: [0.7, 0.5, 0.7] },
            cchip: { name: '基础芯片', ins: 4, outs: 4, act: true, col: 0x37474f, size: [1.0, 0.4, 1.0] }
        };
        const RC_INSIDE = { cand: 1, cor: 1, cnot: 1, cxor: 1, clatch: 1, cdelay: 1 };   // 能放进芯片的
        const RC_ITEM = { cbtn: 'dev_cbtn', clev: 'dev_clev', clamp: 'dev_clamp', cand: 'dev_cand', cor: 'dev_cor', cnot: 'dev_cnot', cxor: 'dev_cxor', clatch: 'dev_clatch', cdelay: 'dev_cdelay', cchip: 'dev_cchip' };
        const RC_ITEM_KIND = {}; Object.keys(RC_ITEM).forEach(function (k) { RC_ITEM_KIND[RC_ITEM[k]] = k; });
        Object.assign(IND_ITEMS_RAW, { sigwire: { name: '信号线', col: 0x29b6f6, use: '连电路元件：拿着先点输出的、再点输入的（一个输出口最多 8 根，一个输入口 1 根）；不是电力线，不通电' } });
        Object.keys(RC_KINDS).forEach(function (k) {
            let K = RC_KINDS[k];
            IND_ITEMS_RAW[RC_ITEM[k]] = { name: K.name, col: K.col, dev: k, use: k === 'cchip' ? '左键开画布，最多放 8 个元件、4 进 4 出，封装后当一个块用；做延时开关、小控制器' : '电路元件：用信号线连起来' + (K.act ? '（要接电）' : '（不吃电）') + '；也能放进基础芯片里' + (RC_INSIDE[k] ? '' : '（不能放进芯片）') };
            IND_DEVS[k] = { name: K.name, col: K.col, rated: 24, minV: 1.5, draw: K.act ? 0.05 : 0, size: K.size, circ: true, nowire: !K.act, always: !K.act };
        });
        IND_CRAFT.push(
            { out: 'sigwire', n: 4, in: { wire: 1, rope: 1 }, hard: true },
            { out: 'dev_cbtn', in: { stone: 1 }, hard: true }, { out: 'dev_clev', in: { wood: 1, stone: 1 }, hard: true }, { out: 'dev_clamp', in: { glass_plate: 1, wire: 1 }, hard: true },
            { out: 'dev_cand', in: { wire: 2, ingot_si: 1 }, hard: true }, { out: 'dev_cor', in: { wire: 2, ingot_si: 1 }, hard: true }, { out: 'dev_cnot', in: { wire: 1, ingot_si: 1 }, hard: true },
            { out: 'dev_cxor', in: { wire: 3, ingot_si: 1 }, hard: true }, { out: 'dev_clatch', in: { wire: 3, ingot_si: 1 }, hard: true }, { out: 'dev_cdelay', in: { wire: 2, ingot_si: 1, glass_plate: 1 }, hard: true },
            { out: 'dev_cchip', in: { ingot_si: 1, glass_plate: 1, wire: 4, b_hno3: 1 }, hard: true }
        );
        // 一个元件算一刻：a、b 是输入（0～255），st 是它自己的状态（锁存的值、延时的队列），t 是延时的刻数
        function rcEval(k, a, b, st, t) {
            if (k === 'cand') return a > 0 && b > 0 ? 1 : 0;
            if (k === 'cor') return a > 0 || b > 0 ? 1 : 0;
            if (k === 'cnot') return a > 0 ? 0 : 1;
            if (k === 'cxor') return (a > 0) !== (b > 0) ? 1 : 0;
            if (k === 'clatch') { if (b > 0) st.q = 0; else if (a > 0) st.q = 1; return st.q ? 1 : 0; }   // 复位优先；置过就一直 1，复位才回 0
            if (k === 'cdelay') { st.buf = st.buf || []; st.buf.push(a); if (st.buf.length >= t) return st.buf.shift(); return 0; }
            return 0;
        }
        function rcFixDev(d) {
            let K = RC_KINDS[d.ty]; if (!K) return;
            d.t = indNum(d.t, 10, 1, 100) | 0; d.q = d.q ? 1 : 0; d.out = indNum(d.out, 0, 0, 255) | 0; d.on1 = d.on1 ? 1 : 0; d.pt = indNum(d.pt, 0, 0, 1);
            if (!Array.isArray(d.buf)) d.buf = []; d.buf = d.buf.slice(0, 100).map(function (v) { return indNum(v, 0, 0, 255) | 0; });
            if (d.ty === 'cchip') {
                let c = d.chip && typeof d.chip === 'object' ? d.chip : {}, used = {};
                c.els = (Array.isArray(c.els) ? c.els : []).filter(function (e) { return e && RC_INSIDE[e.k] && isFinite(e.x) && isFinite(e.y) && e.x >= 1 && e.x <= RC.gridN - 2 && e.y >= 0 && e.y < RC.gridN && !used[e.x + ',' + e.y] && (used[e.x + ',' + e.y] = 1); }).slice(0, RC.chipEl)
                    .map(function (e) { return { k: e.k, x: e.x | 0, y: e.y | 0, t: indNum(e.t, 10, 1, 100) | 0, q: e.q ? 1 : 0, out: indNum(e.out, 0, 0, 255) | 0, buf: Array.isArray(e.buf) ? e.buf.slice(0, 100).map(function (v) { return indNum(v, 0, 0, 255) | 0; }) : [] }; });
                c.w = (Array.isArray(c.w) ? c.w : []).filter(function (w) { return Array.isArray(w) && w.length === 4 && w.every(isFinite); }).slice(0, 64).map(function (w) { return w.map(function (v) { return v | 0; }); });
                c.outs = [0, 0, 0, 0]; d.chip = c;
            }
        }
        Object.keys(RC_KINDS).forEach(function (k) { IND_DEV_FIX[k] = rcFixDev; });
        // 读档整理：信号线 [输出块 id, 输出口, 输入块 id, 输入口]
        const rcFixBase0 = typeof pwFixBase === 'function' ? pwFixBase : null;
        function rcFixBase(b) {
            let ids = {}; (b.devs || []).forEach(function (d) { if (RC_KINDS[d.ty]) ids[d.id] = d; });
            let seenIn = {}, outN = {};
            b.sig = (Array.isArray(b.sig) ? b.sig : []).filter(function (w) {
                if (!Array.isArray(w) || w.length !== 4 || !w.every(isFinite)) return false;
                let a = ids[w[0]], c = ids[w[2]]; if (!a || !c || w[0] === w[2]) return false;
                if (w[1] < 0 || w[1] >= RC_KINDS[a.ty].outs || w[3] < 0 || w[3] >= RC_KINDS[c.ty].ins) return false;
                let ki = w[2] + ':' + w[3], ko = w[0] + ':' + w[1]; if (seenIn[ki] || (outN[ko] || 0) >= RC.outMax) return false;
                seenIn[ki] = 1; outN[ko] = (outN[ko] || 0) + 1; return true;
            }).slice(0, RC.maxSig).map(function (w) { return [w[0] | 0, w[1] | 0, w[2] | 0, w[3] | 0]; });
        }
        // 上限：整个家 40 个芯片、400 个元件（设备总数现在最多 200，所以元件先碰到设备上限）
        function rcPlaceOk(ty) {
            if (!RC_KINDS[ty]) return true;
            let L = ind.base.devs.filter(function (d) { return RC_KINDS[d.ty]; });
            if (L.length >= 400 || (ty === 'cchip' && L.filter(function (d) { return d.ty === 'cchip'; }).length >= RC.maxChip)) { indFlash('电路太多了'); return false; }
            return true;
        }
        // 接线：拿信号线先点输出块、再点输入块。芯片有 4 个口，用面板里"选这个口"选好再点；别的块口只有一两个，按空着的口依次接
        function rcDevAct(d, k) {
            let K = RC_KINDS[d.ty]; if (!K) return undefined;
            if (k === 'sigwire') return rcSigClick(d);
            if (k === 'wire') return K.act ? undefined : (indFlash(K.name + '不用接铜线'), false);
            if (d.ty === 'cbtn') { d.pt = 1; return true; }
            if (d.ty === 'clev') { d.on1 = d.on1 ? 0 : 1; indSave(); return true; }
            if (d.ty === 'cdelay' || d.ty === 'cchip') { rcPanel(d.id); return true; }
            let st = d.ty === 'clamp' ? (d.out > 0 ? '亮着' : '灭着') : '输出 ' + d.out + (indDev(d.id).pw ? '' : '（没电）');
            return true;
        }
        function rcFreeIn(id, n) { let used = {}; (ind.base.sig || []).forEach(function (w) { if (w[2] === id) used[w[3]] = 1; }); for (let i = 0; i < n; i++) if (!used[i]) return i; return -1; }
        function rcSigClick(d) {
            let B = ind.base, K = RC_KINDS[d.ty]; if (!B.sig) B.sig = [];
            if (!ind.sigPend) {
                if (!K.outs) { indFlash(K.name + '没有输出口，先点输出的块'); return false; }
                ind.sigPend = { id: d.id, port: d.ty === 'cchip' && ind.sigPort && ind.sigPort.id === d.id && ind.sigPort.kind === 'out' ? ind.sigPort.port : 0 }; ind.devDirty = true; return true;
            }
            let P = ind.sigPend; ind.sigPend = null; ind.devDirty = true;
            let src = indDev(P.id); if (!src) return false;
            if (!K.ins) { indFlash(K.name + '没有输入口'); return false; }
            if (B.sig.length >= RC.maxSig) { indFlash('电路太多了'); return false; }
            let port = d.ty === 'cchip' && ind.sigPort && ind.sigPort.id === d.id && ind.sigPort.kind === 'in' ? ind.sigPort.port : rcFreeIn(d.id, K.ins);
            if (port < 0 || B.sig.some(function (w) { return w[2] === d.id && w[3] === port; })) { indFlash('这个输入口已经接了线'); return false; }
            if (B.sig.filter(function (w) { return w[0] === P.id && w[1] === P.port; }).length >= RC.outMax) { indFlash('一个输出口最多 ' + RC.outMax + ' 根线'); return false; }
            if (!indBagDel('sigwire', 1)) { indFlash('信号线不够'); return false; }
            B.sig.push([P.id, P.port, d.id, port]); ind.sigDirty = true; indSave();
            return true;
        }
        // 每个电路刻：所有元件按上一刻的输出算这一刻的输出（所以每个元件延迟 1 刻）
        function rcStep() {
            let B = ind.base, devs = B.devs.filter(function (d) { return RC_KINDS[d.ty]; }); if (!devs.length) return 0;
            let by = {}; devs.forEach(function (d) { by[d.id] = d; });
            let inVal = function (id, port) { let w = (B.sig || []).find(function (x) { return x[2] === id && x[3] === port; }); if (!w) return 0; let s = by[w[0]]; return s ? (s.ty === 'cchip' ? s.chip.outs[w[1]] || 0 : s.out | 0) : 0; };
            let n = 0, next = [];
            devs.forEach(function (d) {
                n++;
                let K = RC_KINDS[d.ty], o = 0;
                if (d.ty === 'cbtn') { o = d.pt > 0 ? 1 : 0; next.push([d, o]); return; }
                if (d.ty === 'clev') { next.push([d, d.on1 ? 1 : 0]); return; }
                if (d.ty === 'clamp') { next.push([d, inVal(d.id, 0) > 0 ? 1 : 0]); return; }
                if (!d.pw) { next.push([d, 0, true]); return; }   // 没电输出 0
                if (d.ty === 'cchip') { let ins = [0, 1, 2, 3].map(function (i) { return inVal(d.id, i); }); n += rcChipStep(d, ins); next.push([d, 0]); return; }
                o = rcEval(d.ty, inVal(d.id, 0), K.ins > 1 ? inVal(d.id, 1) : 0, d, d.t);
                next.push([d, o]);
            });
            next.forEach(function (x) { let d = x[0]; if (d.ty !== 'cchip') d.out = x[1]; if (x[2]) { d.q = 0; d.buf = []; if (d.ty === 'cchip') { d.chip.outs = [0, 0, 0, 0]; d.chip.els.forEach(function (e) { e.out = 0; e.q = 0; e.buf = []; }); } } });
            return n;
        }
        // 芯片里面：元件格子 + 线 [源, 源口, 目标, 目标口]，源／目标写成 'i0'..'i3'（输入针脚）、'o0'..'o3'（输出针脚）或元件下标
        function rcChipStep(d, ins) {
            let c = d.chip, els = c.els, W = c.w || [];
            let val = function (src) { return typeof src === 'number' && src >= 0 ? (els[src] ? els[src].out : 0) : 0; };
            let get = function (to, port) { let w = W.find(function (x) { return x[2] === to && x[3] === port; }); if (!w) return 0; return w[0] >= 100 ? ins[w[0] - 100] || 0 : val(w[0]); };
            let nxt = els.map(function (e, i) { return rcEval(e.k, get(i, 0), get(i, 1), e, e.t); });
            let outs = [0, 0, 0, 0];
            for (let j = 0; j < 4; j++) { let w = W.find(function (x) { return x[2] === 200 + j; }); if (w) outs[j] = w[0] >= 100 ? ins[w[0] - 100] || 0 : val(w[0]); }
            els.forEach(function (e, i) { e.out = nxt[i]; });
            c.outs = outs; return els.length;
        }
        // 每帧：按钮计时、按 0.1 秒一刻推电路，一帧最多 2000 次元件更新（超了下一帧接着算）
        let rcAcc = 0;
        function rcTick(dt) {
            if (ind.where !== 'base') return;
            let B = ind.base;
            B.devs.forEach(function (d) { if (d.ty === 'cbtn' && d.pt > 0) d.pt = Math.max(0, d.pt - dt); });
            rcAcc += dt; let budget = RC.perFrame, steps = 0;
            while (rcAcc >= RC.tick - 1e-9 && budget > 0) { rcAcc -= RC.tick; let n = rcStep(); budget -= Math.max(1, n); steps++; if (steps > 20) { rcAcc = 0; break; } }
            if (rcAcc > 1) rcAcc = 0;
            rcBadges();
        }
        // 回家补算、睡觉：按 1 秒一段推（每段 10 刻），电路部分最多 0.5 秒真实时间，超了提示（任务 61 以前的 indFastForward 里调用）
        function rcAdvance(h, state) {
            if (ind.where !== 'base' || !ind.base.devs.some(function (d) { return RC_KINDS[d.ty]; })) return;
            let t0 = performance.now(); state.ms = state.ms || 0; if (state.over) return;
            let B = ind.base;
            for (let i = 0; i < Math.round(h / RC.tick); i++) { rcStep(); B.devs.forEach(function (d) { if (d.ty === 'cbtn' && d.pt > 0) d.pt = Math.max(0, d.pt - RC.tick); }); }
            state.ms += performance.now() - t0; if (state.ms > RC.realBudgetMs) { state.over = true; indFlash('家里电路太复杂，只补了一部分'); }
        }
        // 灯亮着、拉杆拉上、输出 > 0 的元件头上写个字
        function rcBadges() {
            ind.base.devs.forEach(function (d) {
                if (!RC_KINDS[d.ty]) return;
                let txt = d.ty === 'clamp' ? (d.out > 0 ? '亮' : '') : d.ty === 'clev' ? (d.on1 ? '开' : '') : d.ty === 'cchip' ? '' : (d.out > 0 ? '1' : '');
                indBadge('rc' + d.id, d.x, 1.4, d.z, txt);
            });
        }
        // 小面板：延时改刻数；芯片画布
        function rcPanel(id) {
            let d = indDev(id); if (!d) return;
            if (d.ty === 'cdelay') {
                indPanelShow('rc', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">延时</div><div style="line-height:1.7;">' + d.t + ' 刻（' + (d.t / 10).toFixed(1) + ' 秒），1～100 刻</div>' +
                    '<div>' + [-10, -1, 1, 10].map(function (v) { return '<button style="' + IND_BTN + '" onclick="rcSetT(' + id + ',' + v + ')">' + (v > 0 ? '+' : '') + v + '</button>'; }).join('') + '</div>' +
                    '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
                ind.rcId = id; return;
            }
            rcChipPanel(d);
        }
        function rcSetT(id, v) { let d = indDev(id); if (!d) return; d.t = Math.max(1, Math.min(100, d.t + v)); d.buf = []; indSave(); rcPanel(id); }
        // 芯片画布：10 × 10 格子。左边一列 I0～I3 是输入针脚，右边一列 O0～O3 是输出针脚；中间放元件（最多 8 个）。点选：选工具（放哪种元件／连线／拆）再点格子
        function rcChipPanel(d) {
            let c = d.chip, S = ind.rcSel && ind.rcSel.id === d.id ? ind.rcSel : (ind.rcSel = { id: d.id, tool: '', pend: null }), N = RC.gridN;
            let at = function (x, y) { return c.els.findIndex(function (e) { return e.x === x && e.y === y; }); };
            let cell = function (x, y) {
                let i = at(x, y), lab = '', bg = '#f5f5f5', pin = (x === 0 && y < RC.pins) ? 'i' + y : (x === N - 1 && y < RC.pins) ? 'o' + y : '';
                if (pin) { lab = pin[0] === 'i' ? 'I' + y : 'O' + y; bg = pin[0] === 'i' ? '#c8e6c9' : '#ffe0b2'; }
                if (i >= 0) { lab = RC_KINDS[c.els[i].k].name.slice(0, 2); bg = '#bbdefb'; }
                if (S.pend && ((S.pend.src === i && i >= 0) || (S.pend.pin && S.pend.pin === pin && pin))) bg = '#e040fb';
                return '<td onclick="rcCell(' + d.id + ',' + x + ',' + y + ')" style="width:30px;height:30px;border:1px solid #ccc;text-align:center;font-size:11px;background:' + bg + ';cursor:pointer;">' + lab + '</td>';
            };
            let rows = ''; for (let y = 0; y < N; y++) { rows += '<tr>'; for (let x = 0; x < N; x++) rows += cell(x, y); rows += '</tr>'; }
            let tools = Object.keys(RC_INSIDE).map(function (k) { return '<button style="' + IND_BTN + (S.tool === k ? 'background:#ef6c00;' : '') + '" onclick="rcTool(' + d.id + ',\'' + k + '\')">' + RC_KINDS[k].name + '（' + (ind.bag[RC_ITEM[k]] || 0) + '）</button>'; }).join('') +
                '<button style="' + IND_BTN + (S.tool === 'wire' ? 'background:#ef6c00;' : '') + '" onclick="rcTool(' + d.id + ',\'wire\')">连线</button><button style="' + IND_BTN + (S.tool === 'erase' ? 'background:#ef6c00;' : '') + '" onclick="rcTool(' + d.id + ',\'erase\')">拆</button>';
            let ports = '<div style="margin-top:6px;font-size:13px;">外面接信号线用的口：' + [0, 1, 2, 3].map(function (i) { return '<button style="' + IND_BTN + (ind.sigPort && ind.sigPort.id === d.id && ind.sigPort.kind === 'in' && ind.sigPort.port === i ? 'background:#ef6c00;' : '') + '" onclick="rcPort(' + d.id + ',\'in\',' + i + ')">入 ' + i + '</button>'; }).join('') + [0, 1, 2, 3].map(function (i) { return '<button style="' + IND_BTN + (ind.sigPort && ind.sigPort.id === d.id && ind.sigPort.kind === 'out' && ind.sigPort.port === i ? 'background:#ef6c00;' : '') + '" onclick="rcPort(' + d.id + ',\'out\',' + i + ')">出 ' + i + '</button>'; }).join('') + '</div>';
            indPanelShow('rc', '<div style="font-size:18px;font-weight:bold;margin-bottom:4px;">基础芯片　' + c.els.length + ' / ' + RC.chipEl + ' 个元件</div>' +
                '<div>' + tools + '</div><table style="border-collapse:collapse;margin:6px 0;">' + rows + '</table>' + ports + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上（封装）</button></div>');
            ind.rcId = d.id;
        }
        function rcTool(id, t) { let S = ind.rcSel; if (!S || S.id !== id) S = ind.rcSel = { id: id, tool: '', pend: null }; S.tool = S.tool === t ? '' : t; S.pend = null; rcPanel(id); }
        function rcPort(id, kind, p) { ind.sigPort = { id: id, kind: kind, port: p }; rcPanel(id); }
        function rcCell(id, x, y) {
            let d = indDev(id); if (!d || d.ty !== 'cchip') return;
            let c = d.chip, S = ind.rcSel, N = RC.gridN, at = c.els.findIndex(function (e) { return e.x === x && e.y === y; });
            let pin = (x === 0 && y < RC.pins) ? 'i' + y : (x === N - 1 && y < RC.pins) ? 'o' + y : '';
            if (RC_INSIDE[S.tool]) {
                if (pin || at >= 0) { indFlash('这格放不了'); return; }
                if (c.els.length >= RC.chipEl) { indFlash('最多放 ' + RC.chipEl + ' 个元件'); return; }
                if (!indBagDel(RC_ITEM[S.tool], 1)) { indFlash('背包里没有这个元件'); return; }
                c.els.push({ k: S.tool, x: x, y: y, t: 10, q: 0, out: 0, buf: [] }); indSave(); rcPanel(id); return;
            }
            if (S.tool === 'erase') {
                if (at < 0) return;
                indBagAdd(RC_ITEM[c.els[at].k], 1); c.els.splice(at, 1);
                c.w = c.w.filter(function (w) { return w[0] !== at && w[2] !== at; }).map(function (w) { return [w[0] > at && w[0] < 100 ? w[0] - 1 : w[0], w[1], w[2] > at && w[2] < 100 ? w[2] - 1 : w[2], w[3]]; });
                indSave(); rcPanel(id); return;
            }
            if (S.tool === 'wire') {
                let ref = at >= 0 ? at : pin[0] === 'i' ? 100 + (+pin[1]) : pin[0] === 'o' ? 200 + (+pin[1]) : -1;
                if (ref < 0) return;
                if (!S.pend) { if (ref >= 200) { indFlash('输出针脚是终点，先点源'); return; } S.pend = { src: ref, pin: pin }; rcPanel(id); return; }
                let from = S.pend.src; S.pend = null;
                if (from === ref) { indFlash('不能自己连自己'); rcPanel(id); return; }
                if (ref >= 100 && ref < 200) { indFlash('输入针脚不能当终点'); rcPanel(id); return; }
                let port = 0;
                if (ref >= 200) { if (c.w.some(function (w) { return w[2] === ref; })) { indFlash('这个输出针脚已经接了线'); rcPanel(id); return; } }
                else { let K = RC_KINDS[c.els[ref].k], used = {}; c.w.forEach(function (w) { if (w[2] === ref) used[w[3]] = 1; }); port = -1; for (let i = 0; i < K.ins; i++) if (!used[i]) { port = i; break; } if (port < 0) { indFlash('这个元件的输入口都接满了'); rcPanel(id); return; } }
                if (c.w.length >= 64) { indFlash('里面线太多了'); rcPanel(id); return; }
                c.w.push([from, 0, ref, port]); indSave(); rcPanel(id); return;
            }
        }
        // 收起元件：它身上的信号线退回信号线，芯片里的元件退回背包
        function rcPickHook(d, put) {
            if (!RC_KINDS[d.ty]) return;
            let B = ind.base, n = (B.sig || []).filter(function (w) { return w[0] === d.id || w[2] === d.id; }).length;
            B.sig = (B.sig || []).filter(function (w) { return w[0] !== d.id && w[2] !== d.id; });
            if (n > 0) { put('sigwire', n); }
            if (d.ty === 'cchip' && d.chip) { d.chip.els.forEach(function (e) { put(RC_ITEM[e.k], 1); }); d.chip.els = []; d.chip.w = []; }
            if (ind.sigPend && ind.sigPend.id === d.id) ind.sigPend = null;
            ind.sigDirty = true;
        }
        // 信号线画成蓝线（输出块 → 输入块），线变了才重画
        function rcDrawSigs() {
            if (!ind.sigDirty && ind.sigMesh) return;
            ind.sigDirty = false;
            if (ind.sigMesh) { scene.remove(ind.sigMesh); let i = ind.objs.indexOf(ind.sigMesh); if (i >= 0) ind.objs.splice(i, 1); ind.sigMesh = null; }
            let B = ind.base, pts = [];
            (B.sig || []).forEach(function (w) { let a = indDev(w[0]), b = indDev(w[2]); if (a && b) pts.push(a.x, 0.9, a.z, b.x, 0.9, b.z); });
            if (!pts.length) return;
            let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            let m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x29b6f6 })); ind.sigMesh = m; ind.objs.push(m); scene.add(m);
        }
