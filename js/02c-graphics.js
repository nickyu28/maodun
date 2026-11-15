// 画质、视野、流畅度（任务 P6，作者 11-15）。放在 js/02b-settings.js 后面。三项都是设置页里的"选项列表"，一行一个、选中的打对勾，存在 SETTINGS.reg（TH_settings），跟着设备走。
//   画质 低、中、高、超高：像素比和几何体分段（球、圆柱、圆锥、圆环、圆的分段数）；现在游戏里没有阴影，所以档位里没有阴影这一项。抗锯齿只在建渲染器时定，改了要重开页面才生效。
//   视野 正常、稍远、远、超远：相机 far 和雾的距离乘 1、1.4、2、3。
//   流畅度 正常、流畅、高：帧率目标 30、60、120，限制渲染，逻辑照常跑；设备刷新率不到的，自然就到不了。
//   左上角帧率小字（设置里有开关，默认开）。
// 给别的文件读的接口：graphicsQuality() graphicsView() graphicsFps() 返回档位（0 到 3、0 到 3、0 到 2），graphicsViewMul() 视野倍数，graphicsFpsTarget() 目标帧率。说明在 docs/settings.md。
const GFX_QUALITY_NAMES = ['低', '中', '高', '超高'], GFX_VIEW_NAMES = ['正常', '稍远', '远', '超远'], GFX_FPS_NAMES = ['正常，30', '流畅，60', '高，120'];
const GFX_VIEW_MUL = [1, 1.4, 2, 3], GFX_FPS_TARGET = [30, 60, 120], GFX_SEG = [0.6, 1, 1.25, 1.5];
// 设备差：核数不超过 4，或者内存不超过 4 GB（有的浏览器不报内存，那就只看核数）
function gfxDeviceLow() {
    let c = navigator.hardwareConcurrency, m = navigator.deviceMemory;
    return (c > 0 && c <= 4) || (m > 0 && m <= 4);
}
function gfxIdx(id, max, def) { let v = +settingsGet(id); return isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : def; }
function graphicsQuality() { return gfxIdx('gfx_quality', 3, 1); }
function graphicsView() { return gfxIdx('gfx_view', 3, 0); }
function graphicsFps() { return gfxIdx('gfx_fps', 2, 1); }
function graphicsViewMul() { return GFX_VIEW_MUL[graphicsView()]; }
function graphicsFpsTarget() { return GFX_FPS_TARGET[graphicsFps()]; }
function graphicsPixelRatio() {
    let d = window.devicePixelRatio || 1, q = graphicsQuality();
    return q === 0 ? 1 : q === 1 ? Math.min(1.5, d) : q === 2 ? Math.min(2, d) : d;
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
        if (now - gfxLastRender < 1000 / t - 2) return;
        gfxLastRender = now; gfxFrameTimes.push(now);
        while (gfxFrameTimes.length && now - gfxFrameTimes[0] > 1000) gfxFrameTimes.shift();
        return r0.apply(this, arguments);
    };
}
// 现在每秒画多少帧；最近 1 秒没画过就是 0
function gfxFps() {
    let now = performance.now();
    while (gfxFrameTimes.length && now - gfxFrameTimes[0] > 1000) gfxFrameTimes.shift();
    return gfxFrameTimes.length;
}

// ── 左上角帧率 ──
(function () {
    let el = null;
    function ensure() {
        if (el || !document.body) return el;
        el = document.createElement('div'); el.id = 'gfx-fps';
        el.style.cssText = 'position:fixed; left:6px; top:6px; z-index:90; font-size:11px; line-height:1; color:#fff; background:rgba(0,0,0,.35); padding:3px 6px; border-radius:4px; pointer-events:none; display:none; font-family:monospace;';
        document.body.appendChild(el); return el;
    }
    setInterval(function () {
        let e = ensure(); if (!e) return;
        let on = settingsGet('show_fps') !== false, n = gfxFps();
        gfxFpsNow = n;
        if (!on || n === 0) { e.style.display = 'none'; return; }
        e.style.display = 'block'; e.innerText = 'FPS ' + n;
    }, 500);
})();

// ── 登记三项和帧率开关，放在"显示"组最前面 ──
settingsRegister({ group: '显示', id: 'show_fps', label: '左上角显示帧率', type: 'toggle', def: true, first: true });
settingsRegister({ group: '显示', id: 'gfx_fps', label: '流畅度，帧率目标', type: 'choice', def: 1, choices: [[0, GFX_FPS_NAMES[0]], [1, GFX_FPS_NAMES[1]], [2, GFX_FPS_NAMES[2]]], first: true });
settingsRegister({ group: '显示', id: 'gfx_view', label: '视野，能看多远', type: 'choice', def: 0, choices: GFX_VIEW_NAMES.map(function (n, i) { return [i, n]; }), first: true, onChange: function () { gfxApplyView(); } });
settingsRegister({ group: '显示', id: 'gfx_quality', label: '画质，抗锯齿重开页面才生效', type: 'choice', def: gfxDeviceLow() ? 0 : 1, choices: GFX_QUALITY_NAMES.map(function (n, i) { return [i, n]; }), first: true, onChange: function () { gfxApplyQuality(); } });
window.addEventListener('load', gfxApplyAll);
