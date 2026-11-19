// 画质、视野、流畅度（任务 P6，作者 11-15）。放在 js/02b-settings.js 后面。三项都是设置页里的"选项列表"，一行一个、选中的打对勾，存在 SETTINGS.reg（TH_settings），跟着设备走。
//   画质 低、中、高、超高：像素比、几何体分段和影子（球、圆柱、圆锥、圆环、圆的分段数）；现在游戏里没有阴影，所以档位里没有阴影这一项。抗锯齿只在建渲染器时定，改了要重开页面才生效。
//   视野 正常、稍远、远、超远：相机 far 和雾的距离乘 1、1.4、2、3。
//   流畅度 正常、流畅、高：帧率目标 30、60、120，限制渲染，逻辑照常跑；设备刷新率不到的，自然就到不了。
//   左上角帧率小字（设置里有开关，默认开）。
// 给别的文件读的接口：graphicsQuality() graphicsView() graphicsFps() 返回档位（0 到 3、0 到 3、0 到 2），graphicsViewMul() 视野倍数，graphicsFpsTarget() 目标帧率。说明在 docs/settings.md。
const GFX_QUALITY_NAMES = ['低', '中', '高', '超高'], GFX_VIEW_NAMES = ['正常', '稍远', '远', '超远'], GFX_FPS_NAMES = ['正常，30', '流畅，60', '高，120'];
// 设置页里每一档的说明，档位名还是上面那几个
const GFX_QUALITY_DESC = ['低，最省', '中，默认', '高，有影子，吃性能', '超高，最清楚，最吃性能，卡就调低'];
const GFX_VIEW_MUL = [1, 1.4, 2, 3], GFX_FPS_TARGET = [30, 60, 120], GFX_SEG = [0.6, 1, 1.25, 1.5];   // 作者 11-16：中 = 游戏默认的样子，低在它下面，高在它上面，超高 = 能做到的最好，超过现实
// 设备差：核数不超过 4，或者内存不超过 4 GB（有的浏览器不报内存，那就只看核数）
function gfxDeviceLow() {
    let c = navigator.hardwareConcurrency, m = navigator.deviceMemory;
    return (c > 0 && c <= 4) || (m > 0 && m <= 4);
}
function gfxIdx(id, max, def) { let v = +settingsGet(id); return isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : def; }
// 自动降画质只在这次游戏里临时降，不改存的设置（测试员 11-18：超高被悄悄改成高，玩家以为设置没存上）。自己在设置里选了就清掉临时的
let gfxTempQ = null;
function graphicsQuality() { let q = gfxIdx('gfx_quality', 3, 1); return gfxTempQ === null ? q : Math.min(q, gfxTempQ); }
function graphicsView() { return gfxIdx('gfx_view', 3, 0); }
function graphicsFps() { return gfxIdx('gfx_fps', 2, 1); }
function graphicsViewMul() { return GFX_VIEW_MUL[graphicsView()]; }
function graphicsFpsTarget() { return GFX_FPS_TARGET[graphicsFps()]; }
function graphicsPixelRatio() {
    // 低 1，中 min(1.5, 设备)，高 设备原生，超高 原生的 1.5 倍超采样（最多 3，免得画布太大）
    let d = window.devicePixelRatio || 1, q = graphicsQuality();
    return q === 0 ? 1 : q === 1 ? Math.min(1.5, d) : q === 2 ? d : Math.min(3, Math.max(d, 1) * 1.5);
}

// ── 画质：像素比马上生效，分段数下次建东西时生效 ──
function gfxApplyQuality() {
    if (typeof renderer !== 'undefined' && renderer) { renderer.setPixelRatio(graphicsPixelRatio()); renderer.setSize(window.innerWidth, window.innerHeight); }
}
(function () {
    if (typeof THREE === 'undefined') return;
    // 球、圆柱、圆锥、圆环、圆建出来的时候按画质缩分段数；中档（默认）原样放过
    [['SphereGeometry', [1, 2], [6, 4]], ['CylinderGeometry', [3, 4], [6, 1]], ['ConeGeometry', [2, 3], [6, 1]], ['TorusGeometry', [2, 3], [6, 8]], ['CircleGeometry', [1], [8]]].forEach(function (d) {
        let C0 = THREE[d[0]]; if (typeof C0 !== 'function') return;
        let W = function () {
            let a = Array.prototype.slice.call(arguments), m = GFX_SEG[typeof graphicsQuality === 'function' ? graphicsQuality() : 1];
            if (m !== 1) d[1].forEach(function (i, k) { if (typeof a[i] === 'number') a[i] = Math.max(d[2][k], Math.round(a[i] * m)); });
            return new (Function.prototype.bind.apply(C0, [null].concat(a)))();
        };
        W.prototype = C0.prototype;
        try { THREE[d[0]] = W; } catch (e) { }
    });
    // 雾：建的时候按视野倍数放大，记下原来的距离，改档位时用记下的重算。纯黑的雾是暗室一类要"看不远"的，不放大
    let F0 = THREE.Fog, E0 = THREE.FogExp2;
    if (typeof F0 === 'function') {
        let F = function (color, near, far) {
            let m = graphicsViewMul(), dark = color === 0x000000;
            let f = new F0(color, dark ? near : near * m, dark ? far : far * m);
            f.__near0 = near; f.__far0 = far; f.__dark = dark; return f;
        };
        F.prototype = F0.prototype; try { THREE.Fog = F; } catch (e) { }
    }
    if (typeof E0 === 'function') {
        let E = function (color, density) {
            let m = graphicsViewMul(), dark = color === 0x000000;
            let f = new E0(color, dark ? density : density / m);
            f.__den0 = density; f.__dark = dark; return f;
        };
        E.prototype = E0.prototype; try { THREE.FogExp2 = E; } catch (e) { }
    }
})();
function gfxApplyView() {
    let m = graphicsViewMul();
    if (typeof camera !== 'undefined' && camera) {
        if (!camera.userData.far0) camera.userData.far0 = camera.far;
        camera.far = camera.userData.far0 * m; camera.updateProjectionMatrix();
    }
    if (typeof scene !== 'undefined' && scene && scene.fog && !scene.fog.__dark) {
        let f = scene.fog;
        if (f.__near0 !== undefined) { f.near = f.__near0 * m; f.far = f.__far0 * m; }
        else if (f.__den0 !== undefined) f.density = f.__den0 / m;
    }
}
// 套全部三项（相机刚建好、页面加载完、改选项时调）
function gfxApplyAll() { gfxApplyQuality(); gfxApplyView(); }

// ── 流畅度：限制主画面渲染；同时数画了多少帧，给左上角的帧率用 ──
let gfxLastRender = 0, gfxFrameTimes = [], gfxFpsNow = 0;
// three r128 的 render 是建渲染器时挂在实例上的，不是原型上的，所以要在主渲染器建好以后包一层（03-world.js 里建完调 gfxHookRenderer）
function gfxHookRenderer(r) {
    if (!r || r.__gfx) return; r.__gfx = true;
    let r0 = r.render;
    r.render = function () {
        let now = performance.now(), t = graphicsFpsTarget();
        if (!window.__gfxNoLimit && now - gfxLastRender < 1000 / t - 2) return;   // 冒烟里连着直接调 render 数绘制次数，要关掉限帧；测限帧本身的检查不关
        gfxLastRender = now; gfxFrameTimes.push(now);
        try { gfxShadowTick(r); } catch (e) { }
        while (gfxFrameTimes.length && now - gfxFrameTimes[0] > 1000) gfxFrameTimes.shift();
        return r0.apply(this, arguments);
    };
}
// ── 影子：按光照源。游戏里只有一个太阳（平行光）带影子，灯泡一类没有真的灯，所以只有太阳。
// 低、中档关（中是默认的样子，本来就没有影子）；高档开，贴图 2048、柔边关；超高档贴图取显卡最大到 4096、柔边开、范围更大。
// 影子相机跟着画面中心走，只管周围一圈；场景里的模型每 0.5 秒扫一遍：会受光的材质都接收影子，不透明又不大的模型投影，大块地面只接收。
let gfxSun = null, gfxShadowOn = null, gfxShadowAt = 0, gfxShadowQ = -1;
function gfxFindSun() {
    if (gfxSun && gfxSun.parent) return gfxSun;
    gfxSun = null;
    if (typeof scene !== 'undefined' && scene) scene.traverse(function (o) { if (!gfxSun && o.isDirectionalLight) gfxSun = o; });
    return gfxSun;
}
function gfxLit(m) { return m && (m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshPhysicalMaterial); }
function gfxShadowTick(r) {
    if (typeof scene === 'undefined' || !scene || !r.shadowMap) return;
    let q = graphicsQuality(), on = q >= 2, now = performance.now();
    if (gfxShadowOn !== on) {
        gfxShadowOn = on; r.shadowMap.enabled = on; gfxShadowAt = 0;
        scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { m.needsUpdate = true; }); });
    }
    let sun = gfxFindSun(); if (!sun) return;
    if (!on) { sun.castShadow = false; return; }
    if (gfxShadowQ !== q) {
        gfxShadowQ = q; r.shadowMap.type = q === 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        let sz = q === 3 ? Math.min(4096, r.capabilities.maxTextureSize || 2048) : 2048;
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        sun.shadow.mapSize.set(sz, sz);
        let R = q === 3 ? 70 : 45, c = sun.shadow.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 260; c.updateProjectionMatrix();
        sun.shadow.bias = -0.0006; scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { m.needsUpdate = true; }); });
    }
    sun.castShadow = true;
    if (!sun.target.parent) scene.add(sun.target);
    // 影子相机跟着画面中心，位置取整数格，免得影子边缘跟着晃
    let cp = camera.position, tx = Math.round(cp.x / 2) * 2, tz = Math.round(cp.z / 2) * 2;
    sun.target.position.set(tx, 0, tz); sun.position.set(tx + 12, 90, tz + 12); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    if (now - gfxShadowAt > 500) {
        gfxShadowAt = now;
        scene.traverse(function (o) {
            if (!o.isMesh || o.userData.__gfxS) return;
            let ms = [].concat(o.material), lit = ms.length && ms.every(gfxLit); o.userData.__gfxS = 1;
            if (!lit) return;
            o.receiveShadow = true;
            let g = o.geometry, big = true;
            if (g) { if (!g.boundingSphere) g.computeBoundingSphere(); big = g.boundingSphere && g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 20; }
            o.castShadow = !big && !ms.some(function (m) { return m.transparent; });
        });
    }
}
// 现在每秒画多少帧；最近 1 秒没画过就是 0
function gfxFps() {
    let now = performance.now();
    while (gfxFrameTimes.length && now - gfxFrameTimes[0] > 1000) gfxFrameTimes.shift();
    return gfxFrameTimes.length;
}

// ── 左上角帧率、卡顿红色图标、自动降画质、自动退出、三项太高提示（第二批）──
// 每 0.5 秒量一次最近 1 秒画了多少帧：gfxSample(帧率)。画了 0 帧说明没在画（面板盖住、页面在后台），不算卡。数字都能调：
const GFX = {
    lowRatio: 0.6, lowMin: 20, okRatio: 0.8, warnSecs: 3,         // 连续 3 秒低于目标的 60% 或低于 20 帧，冒红色图标；回到 80% 以上 3 秒消失
    dropFps: 8, dropSecs: 10,                                     // 连续 10 秒低于 8 帧，画质降一档
    exitFps: 5, exitSecs: 20,                                     // 降完再连续 20 秒低于 5 帧，存档退出
    probeSecs: 3, probeRatio: 0.7                                 // 三项调太高以后量 3 秒，平均低于目标的 70% 就提示
};
let gfxLowS = 0, gfxOkS = 0, gfxVlowS = 0, gfxCritS = 0, gfxWarnOn = false, gfxPeaks = [], gfxProbe = null, gfxNotice = '', gfxReady = false;
// 目标帧率：设备刷新率到不了的按刷新率算（量到过超过 65 帧才认 120 的目标）
function gfxEff() {
    let t = graphicsFpsTarget(), peak = 0; gfxPeaks.forEach(function (v) { if (v > peak) peak = v; });
    return Math.min(t, peak > 65 ? peak : 60);
}
function gfxIsMulti() { try { return (typeof introSessionMulti === 'function' && introSessionMulti() === true) || (typeof lobbyParty !== 'undefined' && lobbyParty.length > 0); } catch (e) { return false; } }
// 太卡到不行时怎么办，看现在在哪：猫盾工业和实验室没有联机没有危险，直接暂时退出（工业走 indExit 存档）；单人局直接暂停（弹卡片，整局静止，点知道了或按 Esc 继续）；
// 联机局现在只提示（托管和重连是第三批，还没做）。返回 'industry' | 'lab' | 'multi' | 'single' | null（不在局里）
function gfxKind() {
    try { if (typeof ind !== 'undefined' && ind && !ind.over && !ind.loading) return 'industry'; } catch (e) { }
    try { if (typeof lab !== 'undefined' && lab && !lab.over) return 'lab'; } catch (e) { }
    let m = null; try { m = chatActiveModeKey(); } catch (e) { }
    if (!m || m === 'hub') return null;
    return gfxIsMulti() ? 'multi' : 'single';
}
function gfxExitNow(kind) {
    try { if (kind === 'industry') { indExit(true); return true; } if (kind === 'lab') { labExit(false); return true; } } catch (e) { }
    return false;
}
function gfxAutoExit() {
    let k = gfxKind();
    if (k === 'industry' || k === 'lab') { gfxExitNow(k); blazeFlash('画面太卡了，已经存档退出，可以到设置里调低画质或视野'); return k; }
    if (k === 'multi') {
        if (chatActiveModeKey() === 'hunt' && typeof huntLagLeave === 'function' && huntLagLeave()) return k;   // 寻宝队：安静退出，AI 顶上，3 分钟内能回来
        blazeFlash('画面太卡了，联机局不会自动退出，可以自己退出或调低画质'); return k;
    }
    if (k === 'single') { gfxPause(); return k; }
    return null;
}
function gfxPause() {
    introPush('太卡了，已暂停', '<div style="text-align:left; font-size:14px; line-height:1.75;">画面太卡，游戏先停住了。可以去设置里调低画质或视野，再点知道了继续。</div>');
}
function gfxRecommend() { return gfxDeviceLow() ? { q: 0, v: 0, f: 1 } : { q: 2, v: 1, f: 1 }; }
function gfxApplyRecommend() {
    let r = gfxRecommend(); gfxTempQ = null; settingsSet('gfx_quality', r.q); settingsSet('gfx_view', r.v); settingsSet('gfx_fps', r.f);
    gfxNotice = ''; gfxProbe = null; if (typeof setRender === 'function' && document.getElementById('set-content')) setRender();
}
function gfxNoticeHtml() {
    return gfxNotice ? '<div id="gfx-notice" style="background:#ffebee; color:#c62828; border-radius:6px; padding:8px 10px; margin:6px 0; font-size:13px;">' + gfxNotice + '<div style="margin-top:6px;"><button onclick="gfxApplyRecommend()" style="margin:0; padding:8px 12px; min-height:40px; font-size:13px; border:none; border-radius:6px; background:#c62828; color:#fff;">调回推荐</button></div></div>' : '';
}
// 三项里两项或以上在最高两档：设备本来就差的马上提示；不然量一小段帧率，不行再提示。只提示，不拦着
function gfxTooHigh() { return (graphicsQuality() >= 2 ? 1 : 0) + (graphicsView() >= 2 ? 1 : 0) + (graphicsFps() >= 1 ? 1 : 0) >= 2; }
function gfxCheckHigh() {
    if (!gfxReady) return;
    if (!gfxTooHigh()) { gfxNotice = ''; gfxProbe = null; return; }
    if (gfxDeviceLow()) { gfxNotice = '你的设备可能跑不动这个组合，画面会卡。'; gfxProbe = null; if (typeof setRender === 'function' && document.getElementById('set-content')) setRender(); return; }
    gfxProbe = { n: 0, sum: 0 };
}
function gfxProbeDone(avg) {
    gfxProbe = null;
    if (avg >= GFX.probeRatio * gfxEff()) return;
    gfxNotice = '你的设备可能跑不动这个组合，画面会卡。';
    showSysModal('画面可能会卡', '你的设备可能跑不动这个组合，画面会卡。', [{ label: '调回推荐', color: '#c62828', onClick: gfxApplyRecommend }, { label: '知道了' }]);
}
function gfxSample(n) {
    let dt = 0.5;
    if (!(n > 0)) { gfxLowS = gfxOkS = gfxVlowS = gfxCritS = 0; return; }   // 没在画，不算卡
    gfxPeaks.push(n); if (gfxPeaks.length > 40) gfxPeaks.shift();
    let eff = gfxEff();
    let low = n < GFX.lowRatio * eff || n < GFX.lowMin, ok = n >= GFX.okRatio * eff && n >= GFX.lowMin;
    gfxLowS = low ? gfxLowS + dt : 0; gfxOkS = ok ? gfxOkS + dt : 0;
    if (!gfxWarnOn && gfxLowS >= GFX.warnSecs) gfxWarnOn = true;
    else if (gfxWarnOn && gfxOkS >= GFX.warnSecs) gfxWarnOn = false;
    gfxVlowS = n < GFX.dropFps ? gfxVlowS + dt : 0;
    gfxCritS = n < GFX.exitFps ? gfxCritS + dt : 0;
    if (gfxVlowS >= GFX.dropSecs) {
        gfxVlowS = 0;
        let q = graphicsQuality();
        if (q > 0) { gfxCritS = 0; gfxTempQ = q - 1; gfxApplyQuality(); blazeFlash('太卡了，这次先把画质降到' + GFX_QUALITY_NAMES[q - 1] + '，设置里没改'); }   // 降完重新数 20 秒
    }
    if (gfxCritS >= GFX.exitSecs) { gfxCritS = 0; gfxAutoExit(); }
    if (gfxProbe) { gfxProbe.n++; gfxProbe.sum += n; if (gfxProbe.n >= GFX.probeSecs / dt) gfxProbeDone(gfxProbe.sum / gfxProbe.n); }
}
(function () {
    let el = null, wn = null;
    function ensure() {
        if (el || !document.body) return el;
        el = document.createElement('div'); el.id = 'gfx-fps';
        el.style.cssText = 'position:fixed; left:6px; top:6px; z-index:90; font-size:11px; line-height:1; color:#fff; background:rgba(0,0,0,.35); padding:3px 6px; border-radius:4px; pointer-events:none; display:none; font-family:monospace;';
        document.body.appendChild(el);
        wn = document.createElement('div'); wn.id = 'gfx-warn'; wn.title = '画面卡了，可以到设置里调低画质或视野';
        wn.style.cssText = 'position:fixed; left:6px; top:6px; z-index:91; display:none; width:26px; height:22px; cursor:pointer; background:rgba(0,0,0,.35); border-radius:4px;';
        wn.innerHTML = '<svg width="26" height="22" viewBox="0 0 26 22"><rect x="3" y="14" width="3" height="5" fill="#ff5252"/><rect x="8" y="10" width="3" height="9" fill="#ff5252" opacity=".45"/><rect x="13" y="6" width="3" height="13" fill="#ff5252" opacity=".25"/><circle cx="21" cy="8" r="5" fill="#ff1744"/><rect x="20.3" y="4.6" width="1.4" height="4.2" fill="#fff"/><rect x="20.3" y="9.6" width="1.4" height="1.4" fill="#fff"/></svg>';
        wn.onclick = function () { showSysModal('画面卡了', '这个红色小图标是说画面帧数太低了。可以去设置里把画质、视野或流畅度调低。', [{ label: '去设置', color: '#5cb85c', onClick: function () { openSettings('显示'); } }, { label: '知道了' }]); };
        document.body.appendChild(wn); return el;
    }
    window.gfxHudRefresh = function () {
        let e = ensure(); if (!e) return;
        let on = settingsGet('show_fps') !== false, n = gfxFps();
        if (gfxWarnOn) { wn.style.display = 'block'; } else wn.style.display = 'none';
        if (!on || n === 0) { e.style.display = 'none'; return; }
        e.style.display = 'block'; e.innerText = 'FPS ' + n; e.style.left = gfxWarnOn ? '36px' : '6px';
    };
    setInterval(function () { if (window.__gfxManual) { window.gfxHudRefresh(); return; } let n = gfxFps(); gfxFpsNow = n; gfxSample(n); window.gfxHudRefresh(); }, 500);
})();

// ── 登记三项和帧率开关，放在"显示"组最前面 ──
settingsRegister({ group: '显示', id: 'show_fps', label: '左上角显示帧率', type: 'toggle', def: true, first: true });
settingsRegister({ group: '显示', id: 'gfx_fps', label: '流畅度，帧率目标', type: 'choice', def: 1, choices: [[0, GFX_FPS_NAMES[0]], [1, GFX_FPS_NAMES[1]], [2, GFX_FPS_NAMES[2]]], first: true, onChange: function () { gfxCheckHigh(); } });
settingsRegister({ group: '显示', id: 'gfx_view', label: '视野，能看多远', type: 'choice', def: 0, choices: GFX_VIEW_NAMES.map(function (n, i) { return [i, n]; }), first: true, onChange: function () { gfxApplyView(); gfxCheckHigh(); } });
settingsRegister({ group: '显示', id: 'gfx_quality', label: '画质，抗锯齿重开页面才生效', type: 'choice', def: gfxDeviceLow() ? 0 : 1, choices: GFX_QUALITY_DESC.map(function (n, i) { return [i, n]; }), first: true, onChange: function () { gfxTempQ = null; gfxApplyQuality(); gfxCheckHigh(); } });
window.addEventListener('load', function () { gfxApplyAll(); gfxReady = true; });
