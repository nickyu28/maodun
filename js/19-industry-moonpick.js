// 猫盾工业：月球 M2——选落点（任务 83）。放在 19-industry-moon.js 后面（最后一个）。调试入口：?hcdebug=1 下控制台 indMoonPick()；真入口以后接。只做单人。
// 全屏俯视图画整张 600 × 600 米的图：月海深灰、高地浅灰、撞击坑环形阴影、月溪画线、极地水冰坑蓝白、熔岩管天窗黑点，带图例，淡淡的 40 米格线（以后插旗用）。**不画矿**：画图只读地形和地貌特征列表，
// 不读资源点（moonRes 数着，画一遍应该是 0 次）。点一下选中心，画 60 × 45 米的矩形：绿 = 能选，红 = 不行（矩形里有撞击坑、月溪、极地坑、天窗，平均坡度 > 5°，离边不到 30 米）。
// 确认（定下来就不能挪）后存 ind.base.moon.site = { x, z }，以后再选一律拒绝；矩形里的地面压平到落点高度，压平的高度跟 site 一起存档。
        const MP = { w: 60, d: 45, edge: 30, slope: 5, near: 150, grid: 40, px: 2 };
        function mpFlatH(MG, x, z) { return moonHeight(MG, x, z); }
        // 矩形里有没有撞击坑、月溪、极地坑、天窗；坡度；离边
        function mpCheck(MG, x, z) {
            let hw = MP.w / 2, hd = MP.d / 2, why = [];
            if (Math.abs(x) + hw > 300 - MP.edge || Math.abs(z) + hd > 300 - MP.edge) why.push('离地图边不到 ' + MP.edge + ' 米');
            let dr = function (c, r) { let dx = Math.max(Math.abs(x - c.x) - hw, 0), dz = Math.max(Math.abs(z - c.z) - hd, 0); return Math.hypot(dx, dz) < r; };
            if (MG.craters.some(function (c) { return dr(c, c.r * 1.1); })) why.push('有撞击坑');
            if (MG.pits.some(function (c) { return dr(c, c.r); })) why.push('有极地坑');
            if (MG.sky.some(function (c) { return dr(c, c.r); })) why.push('有熔岩管天窗');
            let rill = false; for (let i = -hw; i <= hw && !rill; i += 5) for (let j = -hd; j <= hd; j += 5) { if (MG.rills.some(function (rl) { return mnRillDist(rl, x + i, z + j) < rl.w / 2 + 2 * rl.d; })) { rill = true; break; } }
            if (rill) why.push('有月溪');
            let tot = 0, n = 0; for (let i = -hw; i < hw; i += 5) for (let j = -hd; j < hd; j += 5) { let h0 = moonHeight(MG, x + i, z + j), gx = (moonHeight(MG, x + i + 5, z + j) - h0) / 5, gz = (moonHeight(MG, x + i, z + j + 5) - h0) / 5; tot += Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI; n++; }
            let slope = tot / n; if (slope > MP.slope) why.push('坡度 ' + slope.toFixed(1) + '°');
            let bm = moonBiome(MG, x, z), ice = MG.pits.some(function (p) { return Math.hypot(p.x - x, p.z - z) <= MP.near; });
            return { ok: why.length === 0, why: why, slope: slope, alt: Math.round(moonHeight(MG, x, z) - MN.off), name: IND_BIOMES[bm].name, ice: ice };
        }
        function mpDrawBase(g, MG) {
            let N = 600 / MP.px, img = g.createImageData(N, N), col = { moon_mare: [58, 63, 68], moon_mid: [125, 129, 133], moon_high: [176, 180, 184], moon_pole: [207, 216, 220] };
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                let x = -300 + i * MP.px + MP.px / 2, z = -300 + j * MP.px + MP.px / 2, c = col[moonBiome(MG, x, z)], k = (j * N + i) * 4;
                img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
            }
            g.putImageData(img, 0, 0);
            let s = 1 / MP.px, X = function (v) { return (v + 300) * s; };
            g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.12)';
            for (let v = -300; v <= 300; v += MP.grid) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), N); g.moveTo(0, X(v)); g.lineTo(N, X(v)); g.stroke(); }
            MG.craters.forEach(function (c) { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2 * s * Math.max(1, c.r / 14); g.beginPath(); g.arc(X(c.x), X(c.z), c.r * s, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.arc(X(c.x), X(c.z), c.r * 1.12 * s, 0, 7); g.stroke(); });
            g.strokeStyle = '#6d4c41'; MG.rills.forEach(function (rl) { g.lineWidth = Math.max(2, rl.w * s); g.beginPath(); rl.pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), X(p[1])); else g.moveTo(X(p[0]), X(p[1])); }); g.stroke(); });
            g.fillStyle = '#e3f2fd'; MG.pits.forEach(function (p) { g.beginPath(); g.arc(X(p.x), X(p.z), Math.max(3, p.r * s), 0, 7); g.fill(); g.strokeStyle = '#1e88e5'; g.lineWidth = 1.5; g.stroke(); });
            g.fillStyle = '#000'; MG.sky.forEach(function (p) { g.beginPath(); g.arc(X(p.x), X(p.z), Math.max(3, p.r * s), 0, 7); g.fill(); });
        }
        let MP_STATE = null;
        function indMoonPick() {
            if (!ind || !ind.base || ind.loading) return false;
            if (ind.base.rule !== 'hard') { indFlash('只有硬核有月球'); return false; }
            let S = mnState(); if (S.site) { indFlash('基地位置已经定了'); return false; }
            indMoonPickClose();
            let MG = moonGen(), N = 600 / MP.px, d = document.createElement('div'); d.id = 'ind-moonpick';
            d.style.cssText = 'position:fixed;inset:0;z-index:140;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Microsoft YaHei",sans-serif;color:#fff;';
            d.innerHTML = '<canvas id="mp-canvas" width="' + N + '" height="' + N + '" style="width:min(80vh,92vw);height:min(80vh,92vw);border:1px solid #888;cursor:crosshair;"></canvas>' +
                '<div style="margin-top:8px;font-size:13px;color:#ccc;"><span style="color:#3a3f44;text-shadow:0 0 2px #fff;">■</span> 月海　<span style="color:#7d8185;">■</span> 丘陵　<span style="color:#b0b4b8;">■</span> 高地　<span style="color:#cfd8dc;">■</span> 极地　<span style="color:#1e88e5;">○</span> 水冰坑　<span style="color:#6d4c41;">━</span> 月溪　<span>●</span> 天窗　◯ 撞击坑</div>' +
                '<div id="mp-info" style="margin-top:6px;font-size:16px;min-height:22px;"></div>' +
                '<div style="margin-top:8px;"><button id="mp-ok" disabled style="' + IND_BTN + 'background:#2e7d32;font-size:18px;padding:10px 24px;opacity:.5;" onclick="mpConfirm()">定在这里</button><button id="mp-close" style="' + IND_BTN + 'font-size:18px;padding:10px 24px;" onclick="indMoonPickClose()">关上</button></div>';
            document.body.appendChild(d);
            let cv = document.getElementById('mp-canvas'), g = cv.getContext('2d'); mpDrawBase(g, MG);
            MP_STATE = { base: g.getImageData(0, 0, N, N), sel: null };
            cv.addEventListener('click', function (e) { let r = cv.getBoundingClientRect(); mpSelect(Math.round((e.clientX - r.left) / r.width * 600 - 300), Math.round((e.clientY - r.top) / r.height * 600 - 300)); });
            return true;
        }
        function indMoonPickClose() { let e = document.getElementById('ind-moonpick'); if (e && e.parentNode) e.parentNode.removeChild(e); MP_STATE = null; }
        function mpSelect(x, z) {
            if (!MP_STATE) return null;
            let MG = moonGen(), c = mpCheck(MG, x, z), cv = document.getElementById('mp-canvas'), g = cv.getContext('2d'), s = 1 / MP.px;
            g.putImageData(MP_STATE.base, 0, 0);
            g.fillStyle = c.ok ? 'rgba(76,175,80,.45)' : 'rgba(244,67,54,.5)'; g.strokeStyle = c.ok ? '#76ff03' : '#ff5252'; g.lineWidth = 2;
            g.fillRect((x - MP.w / 2 + 300) * s, (z - MP.d / 2 + 300) * s, MP.w * s, MP.d * s); g.strokeRect((x - MP.w / 2 + 300) * s, (z - MP.d / 2 + 300) * s, MP.w * s, MP.d * s);
            MP_STATE.sel = { x: x, z: z, ok: c.ok, c: c };
            document.getElementById('mp-info').innerHTML = c.name + '　海拔 ' + c.alt + ' 米　坡度 ' + c.slope.toFixed(1) + '°' + (c.ice ? '　附近 150 米有水冰' : '') + (c.ok ? '' : '　<span style="color:#ff8a80;">不行：' + c.why.join('、') + '</span>');
            let b = document.getElementById('mp-ok'); b.disabled = !c.ok; b.style.opacity = c.ok ? '1' : '.5';
            return c;
        }
        function mpConfirm() {
            let P = MP_STATE; if (!P || !P.sel || !P.sel.ok) return false;
            showSysModal('基地定下来就不能挪了，确定吗？', '', [{ label: '定下来', color: '#2e7d32', onClick: function () { mpFinal(P.sel.x, P.sel.z); } }, { label: '再看看' }]);
            return true;
        }
        function mpFinal(x, z) {
            let S = mnState(); if (S.site) return false;
            let MG = moonGen(); mnSyncSite(); let c = mpCheck(MG, x, z); if (!c.ok) return false;
            S.site = { x: x, z: z }; S.flat = { h: Math.round(moonHeight(MG, x, z) * 100) / 100 }; mnSyncSite();
            indMoonPickClose(); indSave(); return true;
        }
