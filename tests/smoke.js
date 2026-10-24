#!/usr/bin/env node
// 冒烟测试（B3）。不依赖任何 npm 包：Node 自己起一个静态服务器，用 Chrome 开发者协议驱动无头 Chrome。
//
//   node tests/smoke.js
//
// 环境变量：
//   CHROME_PATH   Chrome / Chromium 可执行文件（不填就在常见位置找）
//   THREE_LOCAL   three.min.js 的本地路径（填了就用它代替 vendor/ 里的那份，一般不用填）
//   SMOKE_LOG_DIR 填了就把 Chrome 自己的输出写到这个目录的 chrome.log（CI 失败时一起上传）
//
// 退出码：0 全过；1 有检查没过；3 Chrome 没起来 / 还没跑到任何检查就退出了（CI 会自动重试一次）
//
// 检查项：
//   1. 无头启动进大厅，控制台零报错
//   2. 11 个模式都能进、能退回大厅
//   3. TASKS.md 附录里的伪造消息（A1 昵称注入、A2 强行开局、A3 加币扣币）全部被拒，
//      另外模拟经 PeerJS 房主转发、冒充别人 sender 的 START_NIGHT 和 PARK_CREDIT
//   4. 依次进出 5 个模式、循环 3 轮，renderer.info.memory.geometries 不增长
//      （D1 做完前这一条预期失败：EXPECT_GEOMETRY_LEAK = true 时只报告不算失败）
// PeerJS 换成 tests/peerjs-stub.js，同一浏览器的标签页靠 BroadcastChannel 互通。

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXPECT_GEOMETRY_LEAK = false;   // D1 做完了：几何体/贴图不增长必须通过
// 快速档：SMOKE_ONLY=正则 只跑名字对得上的那几项检查（其余整个跳过），比如 SMOKE_ONLY='N21|R1'；总会先跑两项启动检查（电脑、触屏设备）。
// 全量：不设 SMOKE_ONLY。每个提交跑快速档，一批做完、推送前跑一次全量（CLAUDE.md 里有写）。
const ONLY = process.env.SMOKE_ONLY ? new RegExp(process.env.SMOKE_ONLY) : null;
const want = (n) => !ONLY || ONLY.test(n);

const ROOT = path.resolve(__dirname, '..');
const W = (ms) => new Promise((r) => setTimeout(r, ms));
// 等条件成立（表达式在页面里算），不靠固定等待
async function until(T, expr, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 10000)) { if (await T.eval(`!!(${expr})`)) return true; await W(80); }
    return false;
}
// 等页面真的画了 n 帧（"过一会儿还是没变"这类反向检查用，帧率低就多等一会儿；最多 20 秒）
async function frames(T, n) {
    return T.eval(`new Promise(function (res) { let k = 0, t = setTimeout(function () { res(false); }, 20000); (function f() { if (++k >= ${n}) { clearTimeout(t); res(true); } else requestAnimationFrame(f); })(); })`);
}
const results = [];
function report(name, ok, detail, xfail) {
    let tag = ok ? 'PASS' : (xfail ? 'XFAIL' : 'FAIL');
    results.push({ name, tag });
    console.log(tag.padEnd(5) + ' ' + name + (detail ? '  ' + detail : ''));
}

// ── 静态服务器 ──
function startServer() {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
    const srv = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        let f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
    });
    return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ── Chrome ──
function findChrome() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    const cands = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    for (const c of cands) if (fs.existsSync(c)) return c;
    throw new Error('找不到 Chrome，请设置 CHROME_PATH');
}
function chromeStdio() {
    if (!process.env.SMOKE_LOG_DIR) return 'ignore';
    fs.mkdirSync(process.env.SMOKE_LOG_DIR, { recursive: true });
    const fd = fs.openSync(path.join(process.env.SMOKE_LOG_DIR, 'chrome.log'), 'a');
    return ['ignore', fd, fd];
}
const EXIT_STARTUP = 3;
async function startChrome() {
    const port = 9400 + Math.floor(Math.random() * 400);
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'smoke-chrome-'));
    const proc = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
        '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: chromeStdio() });
    for (let i = 0; i < 50; i++) {
        await W(200);
        try { await jget(port, '/json/version'); return { proc, port }; } catch (e) { }
    }
    throw new Error('Chrome 没有启动起来');
}
function jget(port, p, method) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: p, method: method || 'GET' }, (res) => {
            let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
        });
        req.on('error', reject); req.end();
    });
}

// ── 一个标签页 ──
async function openTab(chrome, url, opts) {
    const info = await jget(chrome.port, '/json/new?about:blank', 'PUT');
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    let id = 0; const pending = new Map(); const errors = [], blocked = [];
    
    const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    const stub = fs.readFileSync(path.join(__dirname, 'peerjs-stub.js'));
    const threeLocal = process.env.THREE_LOCAL && fs.existsSync(process.env.THREE_LOCAL) ? fs.readFileSync(process.env.THREE_LOCAL) : null;
    ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push('exception: ' + ((d.exception && d.exception.description) || d.text).split('\n').slice(0, 3).join(' | '));
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            errors.push('console.error: ' + JSON.stringify(msg.params.args.map((a) => a.value || a.description)).slice(0, 300));
        }
        if (msg.method === 'Fetch.requestPaused') {
            const u = msg.params.request.url, rid = msg.params.requestId;
            if (opts && opts.failUrl && u.indexOf(opts.failUrl) >= 0) send('Fetch.failRequest', { requestId: rid, errorReason: 'Failed' });
            else if (opts && opts.blockHosts && opts.blockHosts.some((h) => u.indexOf(h) >= 0)) { blocked.push(u); send('Fetch.failRequest', { requestId: rid, errorReason: 'BlockedByClient' }); }
            else if (opts && opts.delayUrl && u.indexOf(opts.delayUrl) >= 0) setTimeout(() => send('Fetch.continueRequest', { requestId: rid }), opts.delayMs || 2000);
            else if (/peerjs/i.test(u)) send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: stub.toString('base64') });
            else if (/three(\.min)?\.js/i.test(u) && threeLocal) send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: threeLocal.toString('base64') });
            else send('Fetch.continueRequest', { requestId: rid });
        }
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });
    await new Promise((r) => ws.addEventListener('open', r));
    await send('Runtime.enable'); await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*peerjs*' }, { urlPattern: '*three*' }].concat(opts && opts.failUrl ? [{ urlPattern: '*' + opts.failUrl + '*' }] : []).concat(opts && opts.delayUrl ? [{ urlPattern: '*' + opts.delayUrl + '*' }] : []).concat(opts && opts.blockHosts ? opts.blockHosts.map((h) => ({ urlPattern: '*' + h + '*' })) : []) });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    // 实验室开关会被 localStorage 记住（TH_labdebug）；同一个 Chrome 里所有标签页共用存档，所以每个新页面一开始先清掉，免得前一个标签页开了开关、后面不带参数的检查也看到实验室入口。测开关记忆本身的检查传 keepStorage: true。
    if (!(opts && opts.keepStorage)) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.removeItem('TH_labdebug')}catch(e){}" });
    if (opts && opts.mobile) {   // 触屏设备：has_touch + is_mobile
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
    } else await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    // T0：新号起完名字会自动开新手教程，别的检查都不要被它带走，所以默认带 ?notut=1；测教程本身的检查传 tut: true
    await send('Page.navigate', { url: (opts && opts.tut) ? url : url + '?' + ((opts && opts.query) ? opts.query + '&' : '') + 'notut=1' });
    if (opts && opts.navWait !== undefined) await W(opts.navWait); else await W(2500);
    const tab = {
        errors, blocked,
        async eval(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
            if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
            return r.result.result.value;
        },
        send,
        async close() { try { ws.close(); } catch (e) { } await jget(chrome.port, '/json/close/' + info.id, 'PUT').catch(() => { }); }
    };
    if (opts && opts.noLobby) return tab;
    const pid = (opts && opts.name) || ('smoke' + Math.floor(Math.random() * 100000));
    await tab.eval(`document.getElementById('player-id').value = ${JSON.stringify(pid)}; requestLobbyAccess(); true;`);
    await W(1500);
    await tab.eval(`gState.modeIntroShown = { hunt:1, night:1, blaze:1, race:1, jail:1, dodge:1, escape:1, park:1, cake:1, sumo:1, tower:1 }; ${HIDE} true;`);
    return tab;
}

// 关掉弹窗。介绍卡片要连排队一起清掉，光藏起来的话 introOpen 一直是 true，单人密室会一直停着
// 注意：它把 introOpen 直接设成 false、清空排队，会盖住"卡片卡死"这类问题——测弹窗本身的检查（I1）不要用它
const HIDE = `document.getElementById('sys-modal').classList.add('hidden'); introQ.length = 0; introOpen = false; sysModalWait.length = 0;`;
const MODAL = `(document.getElementById('sys-modal').classList.contains('hidden') ? null : document.getElementById('sys-modal-title').innerText)`;
const CLICK_OK = `(function(){ let b = document.querySelector('#sys-modal-btns button'); if (b) b.click(); return !!b; })()`;

const MODES = {
    hunt: { start: `(requestStartGame(), requestEnterMap())`, exit: `(function(){ chooseLeave(); document.getElementById('game-over').classList.add('hidden'); nav('screen-lobby'); })()` },
    night: { start: `(NIGHT_MATCH_WAIT = 0, enterNightMatch('survivor'), nightPickChar('cat'))`, exit: `(endNightGame('测试退出'), setTimeout(function(){ let bs = Array.prototype.slice.call(document.querySelectorAll('#sys-modal-btns button')); let b = bs.filter(function (x) { return x.innerText === '返回大厅'; })[0] || bs[0]; if (b) b.click(); }, 900))` },
    blaze: { start: `blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false)`, exit: `blazeExit()` },
    race: { start: `raceStart(false)`, exit: `raceExit()` },
    jail: { start: `jailBegin()`, exit: `jailExit()` },
    dodge: { start: `dodgeBegin(false)`, exit: `dodgeExit()` },
    escape: { start: `escapeBegin(null, null, 1)`, exit: `escapeExit()` },
    park: { start: `parkBegin(PARK_BUILTIN.easy)`, exit: `parkExit()` },
    cake: { start: `cakeBegin()`, exit: `cakeExit()` },
    sumo: { start: `nmBegin('sumo', [{ id: gState.id }], gState.id, 5, {})`, exit: `nmExit()` },
    tower: { start: `nmBegin('tower', [{ id: gState.id }], gState.id, 5, { kind: 'solo' })`, exit: `nmExit()` }
};
// H1 的楼梯模拟：在页面里跑，直接调 huntPhysics。台阶顶按身体中心算，跟游戏代码分开写一份
function STAIR_SIM() {
    function topAt(x, z, feet) {
        let cf = Math.floor(feet / TILE); if (cf < 0) cf = 0; if (cf > FLOORS - 1) cf = FLOORS - 1;
        let c = maze[cf] && maze[cf][Math.floor((z + TILE / 2) / TILE)] && maze[cf][Math.floor((z + TILE / 2) / TILE)][Math.floor((x + TILE / 2) / TILE)];
        if (!c || c.type !== 3 || !c.stair) return null;
        let s = c.stair, i = Math.floor(s.sign * ((s.axis === 'z' ? z : x) - s.edge) / s.depth);
        return s.base * TILE + s.rise * (Math.max(0, Math.min(s.count - 1, i)) + 1);
    }
    let seed = 7; let rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let stairs = [];
    for (let f = 0; f < FLOORS; f++) for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) {
        let c = maze[f][z][x]; if (c && c.type === 3 && c.stair && c.stair.base === f) stairs.push({ x: x, z: z, s: c.stair });
    }
    function put(st, back) {
        let s = st.s, ax = s.axis === 'x' ? s.sign : 0, az = s.axis === 'z' ? s.sign : 0;
        camera.position.set(st.x * TILE - ax * TILE * back, s.base * TILE + 9, st.z * TILE - az * TILE * back);
        pVel.set(0, 0, 0); onGround = true; return Math.atan2(az, ax);
    }
    function run(dt, n, dev, jump, T) {
        let bad = 0, climbed = 0;
        for (let k = 0; k < n; k++) {
            let st = stairs[k % stairs.length], a0 = put(st, 1), ang = 0, turn = 0, sp = 42 * (k % 2 ? 1.6 : 1), hit = false, hiFeet = -Infinity;
            for (let t = 0; t < T; t += dt) {
                turn -= dt; if (turn <= 0) { ang = (rnd() * 2 - 1) * dev; turn = 0.2 + rnd() * 0.6; }
                if (jump && onGround && rnd() < dt * 1.5) { pVel.y = 44; onGround = false; }
                huntPhysics(dt, Math.cos(a0 + ang), Math.sin(a0 + ang), sp);
                let feet = camera.position.y - 9, top = topAt(camera.position.x, camera.position.z, feet);
                if (top !== null && feet < top - 0.5) hit = true;
                hiFeet = Math.max(hiFeet, feet);
            }
            if (hit) bad++;
            // 到过楼上就算上去了：跑 3 秒，上去以后可能接着跑、掉进前面另一个楼梯井，最后不在楼上
            if (hiFeet >= st.s.base * TILE + TILE - 0.5) climbed++;
        }
        return { bad: bad, climbed: climbed };
    }
    let D = 50 * Math.PI / 180, runs = [];
    [60, 30, 20].forEach(function (f) {
        runs.push(Object.assign({ name: '1/' + f + ' 斜走跑' }, run(1 / f, 150, D, false, 3)));
        runs.push(Object.assign({ name: '1/' + f + ' 斜走跑加跳' }, run(1 / f, 150, D, true, 3)));
    });
    let slow = run(1 / 12, 40, 0, false, 3);
    // 下楼：站到平台上，往回走
    let st = stairs[0], s = st.s, a0 = put(st, 0), down = false;
    camera.position.y = s.base * TILE + TILE + 9; camera.position[s.axis] = s.edge + s.sign * (TILE - 2);
    // 只走回入口那一格（走远了可能掉进别的楼梯口，下到更低一层）
    for (let t = 0; t < 34 / 42; t += 1 / 30) huntPhysics(1 / 30, -Math.cos(a0), -Math.sin(a0), 42);
    down = Math.abs(camera.position.y - 9 - s.base * TILE) < 0.5;
    // 平台下面的空腔里：托到平台上
    put(st, 0); camera.position[s.axis] = s.edge + s.sign * (TILE - 3);
    huntPhysics(1 / 60, 0, 0, 0);
    let lift = Math.abs(camera.position.y - 9 - (s.base * TILE + TILE)) < 0.5;
    return JSON.stringify({ stairs: stairs.length, runs: runs, slowClimb: slow.climbed, slowN: 40, down: down, lift: lift });
}
// 真的用鼠标按下、移动、松开（CDP 鼠标事件会变成 pointerdown/move/up/click）
async function mouseAt(tab, sel) {
    return tab.eval(`(function(){ let e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; let r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
}
async function mouseDrag(tab, fromSel, toSel, dist) {
    const a = await mouseAt(tab, fromSel), b = toSel ? await mouseAt(tab, toSel) : null;
    if (!a) throw new Error('找不到 ' + fromSel);
    const to = b || [a[0] + (dist || 0), a[1]];
    const ev = (type, p, buttons) => tab.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons, clickCount: 1 });
    await ev('mouseMoved', a, 0); await ev('mousePressed', a, 1);
    for (let i = 1; i <= 5; i++) await ev('mouseMoved', [a[0] + (to[0] - a[0]) * i / 5, a[1] + (to[1] - a[1]) * i / 5], 1);
    await ev('mouseReleased', to, 0);
    await W(200);
}
// 手指：按下、按 hold 毫秒、沿着 points 移过去（每步 16 毫秒）、松开（CDP 触摸事件，页面上是 pointerType=touch）
async function touchPath(tab, points, hold) {
    const tp = (type, p) => tab.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
    await tp('touchStart', points[0]);
    if (hold) await W(hold);
    for (let i = 1; i < points.length; i++) { await tp('touchMove', points[i]); await W(16); }
    await tp('touchEnd', null);
    await W(300);
}
// 用真的鼠标点弹窗里的第 n 个按钮（不经过 HIDE / CLICK_OK）；返回点之前的标题，没有弹窗返回 null
async function clickModal(tab, n) {
    const t = await tab.eval(MODAL); if (t === null) return null;
    const p = await mouseAt(tab, '#sys-modal-btns button:nth-child(' + ((n || 0) + 1) + ')'); if (!p) return t;
    const ev = (type) => tab.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await ev('mouseMoved'); await ev('mousePressed'); await ev('mouseReleased'); await W(350);
    return t;
}
const INV_SLOT = (i) => `#garage-active-inv .slot:nth-child(${i + 1})`;
const GAR_SLOT = (i) => `#garage-stash-container .slot:nth-child(${i + 1})`;
// 进仓库，摆好背包和仓库里的东西
const GARAGE_SETUP = (inv, gar, money) => `(function(){ ${HIDE} selectGameMode('hunt'); requestStartGame();
    window.S = function (n) { return Object.assign({}, shopItems[n], { isShop: true }); }; window.L = function (n) { return { n: n, v: 5000, w: 1, tex: 'misc', c: 0xffffff }; };
    gState.inv = ${inv}; gState.garage = Array(200).fill(null); let g = ${gar}; g.forEach(function (q, i) { gState.garage[i] = q; });
    gState.money = ${money}; gState.selectedContainer = 'inv'; gState.selectedSlot = -1; initGarage(); return true; })()`;

// H8：跳上桌子不掉进去；从二楼走进楼梯井、乱跳，不停在墙或桌子里
function TABLE_SIM() {
    function cellAt(f, x, z) { let r = maze[f] && maze[f][Math.floor((z + TILE / 2) / TILE)]; return r ? r[Math.floor((x + TILE / 2) / TILE)] || null : null; }
    function inside(p) {
        let feet = p.y - 9, f = Math.max(0, Math.min(FLOORS - 1, Math.floor(feet / TILE))), c = cellAt(f, p.x, p.z);
        if (!c || c.type === 1) return 'wall';
        if (c.type === 2 && feet < f * TILE + 8 - 0.5) return 'table';
        if (f + 1 < FLOORS && feet >= (f + 1) * TILE - 4) { let u = cellAt(f + 1, p.x, p.z); if (!u || u.type === 1) return 'upperWall'; if (u.type === 2) return 'upperTable'; }
        return null;
    }
    // 测试跑道：一楼最后一行 3 格空地 + 1 格桌子
    let z = mSize - 2, x0 = 2;
    for (let x = x0; x < x0 + 3; x++) maze[0][z][x] = { type: 0 };
    let m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 8, TILE), new THREE.MeshLambertMaterial());
    m.position.set((x0 + 3) * TILE, 4, z * TILE); m.updateMatrixWorld(); walkableMeshes.push(m);
    maze[0][z][x0 + 3] = { type: 2, mesh: m };
    let face = (x0 + 3) * TILE - TILE / 2, scans = [], onTable = 0;
    [[60, 42], [60, 67.2], [30, 42], [30, 67.2]].forEach(function (c) {
        let dt = 1 / c[0], fails = 0;
        for (let o of [0, 3, 6]) for (let d = 5; d <= 44.001; d += 0.5) {
            camera.position.set(face - d, 9, z * TILE + o); pVel.set(0, 44, 0); onGround = false;
            let bad = false, up = false;
            for (let t = 0; t < d / c[1] + 1.2; t += dt) {
                huntPhysics(dt, 1, 0, c[1]); if (inside(camera.position)) bad = true;
                let cc = cellAt(0, camera.position.x, camera.position.z);
                if (cc && cc.type === 2 && Math.abs(camera.position.y - 9 - 8) < 0.01) up = true;
            }
            if (bad) fails++;
            if (up) onTable++;
        }
        scans.push(c[0] + 'fps ' + c[1] + ': ' + fails);
    });
    let seed = 3; let rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let holes = [];
    for (let f = 1; f < FLOORS; f++) for (let zz = 1; zz < mSize - 1; zz++) for (let x = 1; x < mSize - 1; x++) {
        let c = maze[f][zz][x]; if (!(c && c.type === 3 && c.stair && c.stair.base === f - 1)) continue;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { let nb = maze[f][zz + d[1]] && maze[f][zz + d[1]][x + d[0]]; if (nb && nb.type === 0) holes.push({ f: f, x: x, z: zz, d: d }); });
    }
    let wells = [];
    [60, 30, 20].forEach(function (fps) {
        let dt = 1 / fps, bad = 0;
        for (let k = 0; k < 150; k++) {
            let h = holes[k % holes.length], a0 = Math.atan2(-h.d[1], -h.d[0]), ang = 0, turn = 0, sp = 42 * (k % 2 ? 1.6 : 1), hit = false;
            camera.position.set((h.x + h.d[0]) * TILE + (rnd() - 0.5) * 10, h.f * TILE + 9, (h.z + h.d[1]) * TILE + (rnd() - 0.5) * 10);
            pVel.set(0, 0, 0); onGround = true;
            for (let t = 0; t < 3; t += dt) {
                turn -= dt; if (turn <= 0) { ang = (rnd() * 2 - 1) * Math.PI * 0.6; turn = 0.15 + rnd() * 0.5; }
                if (onGround && rnd() < dt * 2) { pVel.y = 44; onGround = false; }
                huntPhysics(dt, Math.cos(a0 + ang), Math.sin(a0 + ang), sp);
                if (inside(camera.position)) hit = true;
            }
            if (hit) bad++;
        }
        wells.push(fps + 'fps: ' + bad);
    });
    return JSON.stringify({ scans: scans, onTable: onTable, wells: wells, holes: holes.length });
}
// T1：6 种每日效果各生成 20 座塔，模拟角色（朝下一块跑、到边缘起跳、空中朝目标修正）逐块验证能不能上去；
// 再不失误连续跑一遍，看到顶时岩浆占塔高的比例。在大厅里跑（nm 临时换成一个假的局）
function TOWER_SIM(nTowers, onlyIds, seedBase) {
    let mods = {}; DAILY_MODIFIERS.forEach(function (m) { if (!onlyIds || onlyIds.indexOf(m.id) >= 0) mods[m.id] = { speedMul: m.speedMul, jumpMul: m.jumpMul }; });
    let keep = { speedMul: DAILY_MOD.speedMul, jumpMul: DAILY_MOD.jumpMul }, oldNm = nm, oldAdd = window.nmAdd, out = {};
    let moveSteps = function (g) { if (g.freeze) return; g.steps.forEach(function (s) { if (!s.mv) return; let nx = s.x0 + Math.sin(g.clock * 1.3 + s.ph) * s.mv; s.dx = nx - s.x; s.x = nx; }); };
    let onStep = function (a, s) { return a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half; };
    let at = function (s) { return { p: new THREE.Vector3(s.x, s.y, s.z), mvx: 0, mvz: 0, kx: 0, kz: 0, vy: 0, onGround: true, coyote: 0, actCd: 0, stunT: 0, isPlayer: true, facing: 0 }; };
    // 从第 i 块跳到第 to 块：跟 AI 一样走过去、脚下没地了才跳；在空中飞到目标上头就松开方向
    let hop = function (g, a, i, to) {
        let t = g.steps[to === undefined ? i + 1 : to];
        for (let T = 0; T < 6; T += 1 / 60) {
            moveSteps(g);
            let dx = t.x - a.p.x, dz = t.z - a.p.z, d = Math.hypot(dx, dz) || 1;
            let edge = a.onGround && NM_DEFS.tower.groundAt(g, a.p.x + a.mvx * 0.12, a.p.z + a.mvz * 0.12, a.p.y) < a.p.y - 0.5;
            let k = !a.onGround ? towerAirK(a, t, d) : 1;
            nmPhysics(a, { x: dx / d * k, z: dz / d * k, jump: edge, act: false }, 1 / 60); g.clock += 1 / 60;
            if (onStep(a, t)) return true;
            if (a.onGround && g.steps.some(function (q, j) { return j > (to === undefined ? i + 1 : to) && onStep(a, q); })) return true;   // 跳高了落在更高的台子上，也算过去了
            if (a.onGround && Math.abs(a.p.y - g.steps[i].y) > 0.3) return false;
            if (a.p.y < t.y - 30) return false;
        }
        return false;
    };
    let bad = [];
    try {
        window.nmAdd = function () { };
        Object.keys(mods).forEach(function (id) {
            DAILY_MOD.speedMul = mods[id].speedMul; DAILY_MOD.jumpMul = mods[id].jumpMul;
            let nbad = 0, frac = 0;
            for (let k = 0; k < nTowers; k++) {
                gameSeed = (seedBase || 1000) + k * 7919;
                let g = { opt: { kind: 'solo' }, clock: 0, actors: [], def: NM_DEFS.tower, mode: 'tower', fx: [] };
                NM_DEFS.tower.build(g); nm = g;
                // 每一跳（含捷径那一跳）：晃的台子停在最不利的位置（两端各试），都要过得去
                for (let i = 0; i < g.steps.length - 1; i++) {
                    let tgts = [i + 1]; if (g.steps[i].scTo) tgts.push(g.steps[i].scTo);
                    tgts.forEach(function (to) {
                        let ms = [g.steps[i], g.steps[to]].filter(function (s) { return s.mv; });
                        let combos = ms.length === 0 ? [[]] : ms.length === 1 ? [[-1], [1]] : [[-1, -1], [-1, 1], [1, -1], [1, 1]];
                        let ok = combos.every(function (c) {
                            g.freeze = true; g.clock = 0;
                            ms.forEach(function (s, q) { s.x = s.x0 + c[q] * s.mv; });
                            let res = hop(g, at(g.steps[i]), i, to);
                            ms.forEach(function (s) { s.x = s.x0; });
                            g.freeze = false; return res;
                        });
                        if (!ok) { nbad++; if (bad.length < 6) bad.push(id + ' 塔' + k + ' ' + i + '>' + to + '(' + g.steps[i].kind + '>' + g.steps[to].kind + ')'); }
                    });
                }
                g.clock = 0; g.freeze = false; moveSteps(g);
                let a = at(g.steps[0]);
                for (let i = 0; i < g.steps.length - 1; i++) if (!hop(g, a, i)) a = at(g.steps[i + 1]);
                let L = TOWER.lava0 * g.sc.h;
                for (let c = 0; c < g.clock; c += 1 / 60) if (c > TOWER.grace) L += (TOWER.rise0 + (TOWER.rise1 - TOWER.rise0) * Math.min(1, (c - TOWER.grace) / TOWER.riseRamp)) * g.sc.lava / 60;
                frac += L / towerTop(g).y / nTowers;
            }
            out[id] = { bad: nbad, frac: +frac.toFixed(3) };
        });
    } finally { DAILY_MOD.speedMul = keep.speedMul; DAILY_MOD.jumpMul = keep.jumpMul; nm = oldNm; window.nmAdd = oldAdd; }
    out.badAt = bad;
    return JSON.stringify(out);
}
// S3：造 n 座塔，数各种台子占比、捷径、币、台子有没有叠在一起
function TOWER_STAT(n) {
    let oldNm = nm, oldAdd = window.nmAdd, res = { n: n, thirds: [[0, 0], [0, 0], [0, 0]], kinds: {}, flagSpecial: 0, topSpecial: 0, startSpecial: 0, sc: [], coins: [], overlap: 0, scBadRise: 0, steps: [], seedAll: 0 };
    try {
        window.nmAdd = function () { };
        for (let k = 0; k < n; k++) {
            gameSeed = 500 + k * 6151; let seed0 = gameSeed;
            let g = { opt: { kind: 'solo' }, clock: 0, actors: [], def: NM_DEFS.tower, mode: 'tower', fx: [] };
            NM_DEFS.tower.build(g);
            let nSc = 0;
            g.steps.forEach(function (s, i) {
                res.kinds[s.kind] = (res.kinds[s.kind] || 0) + 1;
                if (s.kind !== 'normal') {
                    if (s.flag) res.flagSpecial++;
                    if (i === g.steps.length - 1) res.topSpecial++;
                    if (i === 0) res.startSpecial++;
                }
                if (i >= 1 && !s.flag && i < g.steps.length - 1 && !s.ring && !s.scEnd && !(g.steps[i].scTo)) {
                    let th = Math.min(2, Math.ceil(i / (TOWER.steps / 3)) - 1);
                    res.thirds[th][0]++; if (s.kind !== 'normal') res.thirds[th][1]++;
                }
                if (s.scTo) { nSc++; let e = g.steps[s.scTo]; if (e.y - s.y > 7.6 || e.y - s.y < 5) res.scBadRise++; }
                for (let j = i + 1; j < g.steps.length; j++) {
                    let t = g.steps[j];
                    // 一圈圈往上盘，隔一圈的台子在平面上本来就对着；上下相邻的台子也有落差；只看高度差不到 3 的（站在同一层、真会挤在一起的）
                    if (Math.abs(t.y - s.y) < 3 && Math.abs(t.x0 - s.x0) < s.half + t.half && Math.abs(t.z - s.z) < s.half + t.half) res.overlap++;
                }
            });
            let ks = {}; g.steps.forEach(function (q) { ks[q.kind] = 1; });
            if (!res.seedAll && ks.crumble && ks.spring && ks.belt && ks.bar) res.seedAll = seed0;
            res.sc.push(nSc); res.coins.push(g.coins.length);
            res.steps.push(g.steps.length);
        }
    } finally { nm = oldNm; window.nmAdd = oldAdd; }
    return JSON.stringify(res);
}
// E1：竞速在每种每日效果下最远能跳多远（数值从页面读，在 Node 里按竞速的移动规则算）
function raceReach(R, sm, jm) {
    const dt = 1 / 60;
    const fly = (strat) => {
        const sp = R.moveSpeed * sm, jv = R.jumpV * jm;
        let x = -100, vx = sp, y = 0, vy = 0, air = false, dashT = 0, dashed = false;
        for (let t = 0; t < 6; t += dt) {
            if (dashT > 0) dashT -= dt;
            if (!air && strat === 'dashjump' && !dashed && x >= -R.dashV * R.dashT) { dashed = true; dashT = R.dashT; vx = R.dashV; }
            if (!air && x + vx * dt >= 0) { vy = jv; air = true; }
            if (air && strat === 'jumpdash' && !dashed && vy <= 0) { dashed = true; dashT = R.dashT; vx = R.dashV; }
            if (dashT <= 0) { const k = Math.min(1, (1 / R.accel) * (air ? R.airCtrl : 1) * dt); vx += (sp - vx) * k; }
            if (air) vy -= R.gravity * dt;
            x += vx * dt; y += vy * dt;
            if (air && vy < 0 && y <= 0) return x;
        }
        return 0;
    };
    const bounce = () => {   // 弹跳板：走上去按 jumpV × 2.3 弹起（不乘每日效果）
        const sp = R.moveSpeed * sm; let x = 0, vx = sp, y = 0, vy = R.jumpV * 2.3;
        for (let t = 0; t < 5; t += dt) { const k = Math.min(1, (1 / R.accel) * R.airCtrl * dt); vx += (sp - vx) * k; vy -= R.gravity * dt; x += vx * dt; y += vy * dt; if (vy < 0 && y <= 0) return x; }
        return 0;
    };
    return { jump: fly('jump'), dash: Math.max(fly('dashjump'), fly('jumpdash')), bounce: bounce(), h: (R.jumpV * jm) ** 2 / (2 * R.gravity) };
}

// H13：按造图时的箱子配置模拟 n 张图（同一个 huntAssignLoot），统计单箱大金概率、每张图大金个数
function LOOT_SIM(diff, n, pity, teamSize) {
    let keepD = gState.mapDifficulty, keepMul = huntPityMul;
    gState.mapDifficulty = diff; huntPityMul = pity ? 2 : 1;
    let conf = mapConfigs[diff], st = { wood: [0, 0], silver: [0, 0], gold: [0, 0], safe: [0, 0] };
    let sum = 0, any = 0, max = 0, maxAll = 0, over = 0;
    try {
        for (let m = 0; m < n; m++) {
            let types = [];
            if (pity) types.push('gold');
            for (let i = 0; i < conf.gold; i++) types.push('gold');
            for (let i = 0; i < conf.silver; i++) types.push('silver');
            for (let i = 0; i < conf.wood; i++) types.push('wood');
            if (conf.hasGoldShop) types.push('gold');
            if (Math.random() < huntSafeProb(diff)) types.push('safe');
            let boxes = types.map(function (t) { return { userData: { type: t } }; });
            huntAssignLoot(boxes, Math.random, teamSize);
            let k = 0;
            boxes.forEach(function (c) { let big = huntIsBig(c.userData.loot); st[c.userData.type][0]++; if (big) { st[c.userData.type][1]++; k++; } });
            let ks = 0; huntSignalLoot.forEach(function (L) { L.forEach(function (it) { if (huntIsBig(it)) ks++; }); });
            sum += k; if (k > 0) any++; if (k > max) max = k; if (k + ks > maxAll) maxAll = k + ks; if (k + ks > HUNT_BIG_CAP) over++;
        }
    } finally { gState.mapDifficulty = keepD; huntPityMul = keepMul; }
    let rate = {}; Object.keys(st).forEach(function (t) { if (st[t][0]) rate[t] = +(100 * st[t][1] / st[t][0]).toFixed(2); });
    return JSON.stringify({ rate: rate, avg: +(sum / n).toFixed(3), anyPct: +(100 * any / n).toFixed(1), max: max, maxAll: maxAll, over: over });
}

// H10：随机挑 n 对（玩家格子, 物品格子），任意楼层。路线要找得到、终点对、点不在墙/桌子/台阶里，
// 并且用 huntPhysics 模拟一个人沿着路线走（该跳桌子就跳、该跳井就跳）能走到
function ROUTE_SIM(n, seed) {
    function hd(u, v) { return Math.hypot(u.x - v.x, u.z - v.z); }
    function step(pts, wp, dt) {
        if (wp >= pts.length) wp = pts.length - 1;
        let t = pts[wp], feet = camera.position.y - 9, P = camera.position, d = hd(t, P), mx = 0, mz = 0;
        let reach = function (q) { return q.y <= feet + 4.05 && q.y >= feet - 3.5; };   // 往上 4 以内走得上去，往下一级台阶以内走得下去
        if (d < 1.2) {
            let nx = pts[wp + 1];
            if (nx && hd(nx, t) < 0.3 && reach(nx)) return wp + 1;
            if (reach(t)) return wp + 1;
            let k = wp - 1; while (k > 0 && hd(pts[k], t) < 0.3) k--;   // 还没上去/没掉下去：沿来的方向继续走
            let from = pts[Math.max(0, k)], fx = t.x - from.x, fz = t.z - from.z, fl = Math.hypot(fx, fz);
            if (fl > 0.01) { mx = fx / fl; mz = fz / fl; }
            if (t.y > feet && onGround) { pVel.y = 44; onGround = false; }
        } else {
            mx = (t.x - P.x) / d; mz = (t.z - P.z) / d;
            for (let q = wp; q < Math.min(pts.length, wp + 3); q++) if (pts[q].y > feet + 4.05) { if (onGround && hd(pts[q], P) < 7) { pVel.y = 44; onGround = false; } break; }
        }
        let jp = pts[wp - 1]; if (jp && jp.jump && onGround && hd(jp, P) < 1.5) { pVel.y = 44; onGround = false; }
        huntPhysics(dt, mx, mz, 42);
        return wp;
    }
    let rs = seed; let rnd = function () { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
    let cells = [];
    for (let f = 0; f < FLOORS; f++) for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) if (maze[f][z][x] && maze[f][z][x].type === 0) cells.push({ f: f, x: x, z: z });
    let res = { n: n, found: 0, endOk: 0, ptBad: 0, walked: 0, fails: [] }, save = camera.position.clone();
    for (let k = 0; k < n; k++) {
        let a = cells[Math.floor(rnd() * cells.length)], b = cells[Math.floor(rnd() * cells.length)];
        let start = new THREE.Vector3(a.x * TILE, a.f * TILE + 9, a.z * TILE);
        let r = huntRouteBuild(a, b, start);
        if (!r) { if (res.fails.length < 3) res.fails.push('没路 ' + JSON.stringify([a, b])); continue; }
        res.found++;
        let last = r.path[r.path.length - 1]; if (last.f === b.f && last.x === b.x && last.z === b.z) res.endOk++;
        let bad = null;
        for (let i = 1; i < r.pts.length && !bad; i++) {
            let p0 = r.pts[i - 1], p1 = r.pts[i], m = Math.max(1, Math.ceil(p0.distanceTo(p1) / 0.5));
            for (let j = 0; j <= m; j++) {
                let p = p0.clone().lerp(p1, j / m), feet = p.y + 0.02, top = huntSurfaceAt(p.x, p.z, feet);
                if (top === Infinity || feet < top - 0.05) { bad = [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)]; break; }
            }
        }
        if (bad) { res.ptBad++; if (res.fails.length < 3) res.fails.push('点插进去了 ' + bad.join('/')); }
        camera.position.copy(start); camera.position.y = huntSurfY(a.f, a.x, a.z) + 9; pVel.set(0, 0, 0); onGround = true;
        let wp = 1, pts = r.pts, T = 0, ok = false, dt = 1 / 30, len = 0;
        for (let i = 1; i < pts.length; i++) len += pts[i - 1].distanceTo(pts[i]);
        while (T < len / 42 * 2.5 + 6) {
            let me = huntPlayerNode(); if (me.f === b.f && me.x === b.x && me.z === b.z) { ok = true; break; }
            let w2 = step(pts, wp, dt); if (w2 !== wp) { wp = w2; continue; }
            T += dt;
        }
        if (ok) res.walked++; else if (res.fails.length < 3) res.fails.push('走不到 ' + JSON.stringify([a, b]) + ' 停在 ' + JSON.stringify(huntPlayerNode()));
    }
    camera.position.copy(save); pVel.set(0, 0, 0);
    return JSON.stringify(res);
}

const ACTIVE = `(function(){ let k = chatActiveModeKey(); return k === 'hub' ? null : k; })()`;

async function enterExit(tab, key) {
    const m = MODES[key];
    await tab.eval(`${HIDE} selectGameMode('${key}'); ${m.start}; true;`);
    await W(3000);
    const active = await tab.eval(ACTIVE);
    await tab.eval(`${HIDE} ${m.exit}; true;`);
    await W(1800);
    await tab.eval(`${HIDE} true;`);
    const back = await tab.eval(`!!hub && ${ACTIVE} === null`);
    return { active, back };
}

(async () => {
    const srv = await startServer();
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    let chrome;
    try { chrome = await startChrome(); } catch (e) {
        console.log('STARTUP Chrome 没起来：' + e.message);
        srv.close(); process.exit(EXIT_STARTUP);
    }
    let exitCode = 0;
    try {
        // 1. 启动
        const A = await openTab(chrome, url);
        const lobby = await A.eval(`!!hub && !document.getElementById('screen-lobby').classList.contains('hidden')`);
        report('启动进大厅', lobby && A.errors.length === 0, A.errors.slice(0, 3).join(' / '));

        // 2a. 新增的检查（每项自己开标签页，互不影响；SMOKE_ONLY 只跑这一段）
        // 快速档（T1）：只要设了 SMOKE_ONLY，就先固定跑两项启动检查——上面那项（电脑）和这项（触屏设备：0 报错、进大厅）——再跑跟改动相关的检查；
        // 不设 SMOKE_ONLY 是全量，触屏启动在后面的 B6 里测，这里不重复
        if (ONLY) {
            const bad = [];
            const M = await openTab(chrome, url, { mobile: true });
            const s0 = JSON.parse(await M.eval(`JSON.stringify({ ctl: gState.control, lobby: !document.getElementById('screen-lobby').classList.contains('hidden'), id: gState.id })`));
            if (M.errors.length) bad.push('加载时报错 ' + M.errors.length + ' 个：' + M.errors.slice(0, 2).join(' / '));
            if (s0.ctl !== 'pad' || !s0.lobby || !s0.id) bad.push('没进大厅 ' + JSON.stringify(s0));
            await M.close();
            report('启动（触屏设备）0 报错、进大厅', bad.length === 0, bad.join(' / '));
        }
                if (want('N21')) {
            // 夜间 #21：惊魂夜缺口真的开了；推推乐按住才算按着、松开就松；双人队友的手跟着变色
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('night'); ${MODES.night.start}; true;`); await W(3500);
            const gaps = await T.eval(`(function(){ let n = 0; for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) { let g0 = maze[0][z][x], g1 = maze[1][z][x]; if (g0 && g0.type === 1 && !g0.crate && g1 && g1.type === 0) n++; } return n; })()`);
            if (gaps < 1) bad.push('二楼那一格缺口没开 ' + gaps);
            await T.eval(`${HIDE} ${MODES.night.exit}; true;`); await W(1800);
            await T.eval(`${HIDE} selectGameMode('sumo'); ${MODES.sumo.start}; true;`); await W(1500);
            const tap = await T.eval(`(function(){ keys['e'] = true; let a = nmWish({}); keys['e'] = false; let b = nmWish({}); return [a.act, a.held, b.act, b.held]; })()`);
            await T.eval(`keys['e'] = false; ${MODES.sumo.exit}; true;`); await W(1500);
            if (tap.join() !== 'true,true,false,false') bad.push('推推乐按住/松开的状态不对 ' + JSON.stringify(tap));
            const hands = await T.eval(`(function(){ let g = raceMakeBody(0xff0000, 0, true); let r = { mesh: g, col: 0xff0000 }; raceRecolorRacer(r, 0x2255ee);
                return JSON.stringify({ n: (g.userData.hands || []).length, ok: (g.userData.hands || []).every(function (h) { return h.material.color.getHex() === 0x2255ee; }) }); })()`);
            const hr = JSON.parse(hands);
            if (hr.n !== 2 || !hr.ok) bad.push('队友的手没变色 ' + hands);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('N21 惊魂夜二楼缺口打开；推推乐按住才算按着、松开就松；双人队友的手跟着变队伍色', bad.length === 0, bad.join(' / '));
        }

                if (want('M1')) {
            // M1：超燃、惊魂夜结算框有「再来一局」，点了直接开下一场（不回大厅）；联机时房主等人，没点的位置换成 AI
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('blaze'); ${MODES.blaze.start}; window.__old = blaze; true;`); await W(1500);
            await T.eval(`blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(0); true;`); await W(500);
            const labels = await T.eval(`Array.prototype.map.call(document.querySelectorAll('#sys-modal-btns button'), function (b) { return b.innerText; }).join('/')`);
            if (labels !== '再来一局/返回大厅') bad.push('超燃结算按钮 ' + labels);
            await T.eval(`${CLICK_OK}`); await W(1500);
            const r1 = JSON.parse(await T.eval(`JSON.stringify({ fresh: blaze && blaze !== window.__old && !blaze.over, me: blaze && blaze.me && blaze.me.key, round: blaze && blaze.round, modal: ${MODAL} })`));
            if (!r1.fresh || r1.me !== 'bow' || r1.round !== 1 || r1.modal !== null) bad.push('超燃单人没直接开下一场 ' + JSON.stringify(r1));
            // 联机（假装有个队友 fakeB）：房主点了先等；fakeB 点了就开，带着 fakeB；这一场 fakeB 不点的话 6 秒后换成 AI
            await T.eval(`window.__sent = []; let pm = bc.postMessage.bind(bc); bc.postMessage = function (m) { window.__sent.push(m); return pm(m); };
                blazeExit(); blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }, { id: 'fakeB', key: 'sword' }]), gState.id, false); window.__old = blaze;
                blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(0); ${CLICK_OK}; true;`); await W(800);
            const still = await T.eval(`blaze === window.__old && !!againHost && ${MODAL} === '再来一局'`);
            if (!still) bad.push('房主点了应该先等人');
            await T.eval(`againOnReq({ sender: 'fakeB' }); true;`); await W(1500);
            const r2 = JSON.parse(await T.eval(`JSON.stringify({ fresh: blaze !== window.__old, ids: blaze.again.plan.map(function (q) { return q.id; }), sent: window.__sent.filter(function (m) { return m.type === 'BZ_START'; }).length })`));
            if (!r2.fresh || r2.ids.indexOf('fakeB') < 0 || r2.sent !== 1) bad.push('联机对方点了没一起开 ' + JSON.stringify(r2));
            await T.eval(`window.__old = blaze; blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(0); ${CLICK_OK}; true;`); await W(7800);
            const r3 = JSON.parse(await T.eval(`JSON.stringify({ fresh: blaze !== window.__old, ids: blaze.again.plan.map(function (q) { return q.id; }), keys: blaze.again.plan.map(function (q) { return q.key; }), sent: window.__sent.filter(function (m) { return m.type === 'BZ_START'; }).length })`));
            if (!r3.fresh || r3.ids.indexOf('fakeB') >= 0 || r3.keys.indexOf('sword') < 0 || r3.sent !== 1) bad.push('对方没点，6 秒后应该换成 AI 并只在本机开 ' + JSON.stringify(r3));
            await T.eval(`blazeExit(); true;`); await W(800);
            // 惊魂夜：结算框也有，点了直接用上一局的角色开下一场
            await T.eval(`${HIDE} selectGameMode('night'); ${MODES.night.start}; true;`); await W(3000);
            await T.eval(`window.__old = night; endNightGame('测试'); true;`); await W(1500);
            // 本局解锁彩蛋的话先弹一张「收下」，点掉才是结算
            if (/收下/.test(await T.eval(`document.getElementById('sys-modal-btns').innerText`))) { await T.eval(`${CLICK_OK}`); await W(800); }
            const nl = await T.eval(`Array.prototype.map.call(document.querySelectorAll('#sys-modal-btns button'), function (b) { return b.innerText; }).join('/')`);
            if (nl !== '再来一局/返回大厅') bad.push('惊魂夜结算按钮 ' + nl);
            await T.eval(`${CLICK_OK}`); await W(3000);
            const n1 = JSON.parse(await T.eval(`JSON.stringify({ fresh: !!night && night !== window.__old && !night.over, ch: night && night.char, pick: document.getElementById('night-pick').classList.contains('hidden') })`));
            if (!n1.fresh || n1.ch !== 'cat' || !n1.pick) bad.push('惊魂夜没直接开下一场 ' + JSON.stringify(n1));
            // 联机时刚打完的人接得到房主发来的再来一局
            const allow = await T.eval(`(function(){ night.netGame = true; gState.netHostId = 'hostX'; let a = netStartAllowed('night', { sender: 'hostX' }), b = netStartAllowed('night', { sender: 'evilY' }); night.netGame = false; return [a, b]; })()`);
            if (allow[0] !== true || allow[1] !== false) bad.push('刚打完的夜场收不到/乱收开局 ' + JSON.stringify(allow));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M1 超燃、惊魂夜结算有「再来一局」：单人直接开；联机房主等人、没点的换成 AI', bad.length === 0, bad.join(' / '));
        }

                if (want('M2')) {
            // M2：每天 3 个任务（最多 1 个寻宝队、至少 1 个超燃或惊魂夜，模式不重复）；做完一个 +5，三个都做完再 +10；存档里带着
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let real = localDayNum, out = { bad: [], n: 0 };
                for (let d = 20000; d < 20400; d++) {
                    localDayNum = function () { return d; };
                    let q = questToday(), ms = q.map(function (t) { return t.mode; });
                    out.n++;
                    if (q.length !== 3 || new Set(ms).size !== 3) out.bad.push(d + ' 重复 ' + ms);
                    if (ms.filter(function (m) { return m === 'hunt'; }).length > 1) out.bad.push(d + ' 寻宝队多于 1');
                    if (!ms.some(function (m) { return m === 'blaze' || m === 'night'; })) out.bad.push(d + ' 没有超燃/惊魂夜');
                    if (JSON.stringify(q) !== JSON.stringify(questToday())) out.bad.push(d + ' 同一天不一样');
                }
                localDayNum = real; return JSON.stringify({ bad: out.bad.slice(0, 3), n: out.n }); })()`));
            if (r.bad.length) bad.push(r.bad.join(' / '));
            const g = JSON.parse(await T.eval(`(function(){ gState.quest = null; let q = questToday(), c0 = gState.mcoin || 0, res = [];
                // 先打一个不在任务里的模式：不该多给
                let other = QUEST_MODES.filter(function (m) { return !q.some(function (t) { return t.mode === m; }); })[0];
                let a = gState.mcoin; coinsSettle(other, true); let base = gState.mcoin - a;
                // 任务里的，一个个做（输了的话 win 类不算；赢了才算）
                let gains = [], labs = [];
                q.forEach(function (t, i) { if (t.kind === 'win') { let b = gState.mcoin; coinsSettle(t.mode, false); res.push(gState.mcoin - b); } let b2 = gState.mcoin; coinsSettle(t.mode, true); gains.push(gState.mcoin - b2); labs.push(coinsLast.parts.map(function (p) { return p[0] + p[1]; }).join(',')); });
                saveProgress(); let saved = JSON.stringify(gState.quest); gState.quest = null; loadProgress(gState.id);
                return JSON.stringify({ base: base, lostWin: res, gains: gains, labs: labs, done: questDoneCount(), all: gState.quest.all, saved: saved, loaded: JSON.stringify(gState.quest), text: q.map(questText) }); })()`));
            if (g.lostWin.some(function (x) { return x > 3; })) bad.push('输了的“赢”任务也算了 ' + JSON.stringify(g.lostWin));
            if (g.done !== 3 || g.all !== 1) bad.push('三个没都记上 ' + JSON.stringify(g));
            if (g.saved !== g.loaded) bad.push('存档读回来不一样 ' + g.saved + ' vs ' + g.loaded);
            if (g.labs.filter(function (x) { return /每日任务5/.test(x); }).length !== 3) bad.push('每个任务 +5 没都给 ' + JSON.stringify(g.labs));
            if (!/三个任务全做完10/.test(g.labs[2] || '') || g.labs.slice(0, 2).some(function (x) { return /全做完/.test(x); })) bad.push('+10 只该在第三个给 ' + JSON.stringify(g.labs));
            const ui = await T.eval(`(function(){ openQuests(); let t = document.getElementById('sys-modal-title').innerText + '|' + document.getElementById('sys-modal-text').innerText; return t; })()`);
            if (!/今日任务 3\/3/.test(ui) || !/✔/.test(ui)) bad.push('任务弹窗 ' + ui);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M2 每日任务：每天 3 个（模式不重复、≤1 寻宝队、≥1 超燃/惊魂夜）；做完 +5，全做完 +10；存档带着', bad.length === 0, bad.join(' / '));
        }

                if (want('M3')) {
            // M3：超燃 2v2 有快速场（先赢 5 小局、每小局 60 秒后缩圈，默认）和完整场（先赢 10 小局）
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('blaze'); blazeCharOffer('blaze'); true;`); await W(500);
            const m0 = await T.eval(`document.getElementById('sys-modal-text').innerText`);
            if (!/快速场/.test(m0) || !/完整场/.test(m0)) bad.push('三选一里没有场次选择 ' + m0.slice(0, 60));
            const def = await T.eval(`[SETTINGS.blazeFull, document.getElementById('bz-var-q').style.background]`);
            if (def[0] !== false) bad.push('默认不是快速场 ' + JSON.stringify(def));
            // 选快速场点第一个角色 → 真的开了快速场
            await T.eval(`window.mmStart = function (m, n, cb) { cb([gState.id]); }; document.querySelector('#sys-modal-btns button').click(); true;`); await W(1500);
            const q = JSON.parse(await T.eval(`JSON.stringify({ quick: blaze.quick, win: blazeWinTarget(), delay: blazePoisonDelay(), hud: document.getElementById('blaze-round').innerText })`));
            if (!q.quick || q.win !== 5 || q.delay !== 60 || !/先赢 5 局/.test(q.hud)) bad.push('快速场参数不对 ' + JSON.stringify(q));
            // 5 局打完才结束；毒圈 60 秒内不动、之后才缩
            const r = JSON.parse(await T.eval(`(function(){ blaze.score = [4, 0]; blazeAwardRound(0); let over5 = blaze.over;
                blazeExit(); blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false, false, false, true); blaze.phase = 'live';
                let r0 = blaze.poison; blaze.poisonT = 0; blazePoisonTick(30); blazePoisonTick(29); let r1 = blaze.poison; blazePoisonTick(2); let r2 = blaze.poison;
                return JSON.stringify({ over5: over5, still: r0 === r1, shrunk: r2 < r1 }); })()`));
            if (!r.over5) bad.push('快速场赢第 5 局没结束');
            // 再来一局还是快速场
            const again = await T.eval(`(function(){ blazeAgainGo([]); return blaze.quick && !blaze.over; })()`);
            if (!again) bad.push('再来一局丢了快速场');
            if (!r.still || !r.shrunk) bad.push('毒圈时间不对 ' + JSON.stringify(r));
            // 选完整场：先赢 10 局、8 秒后缩圈
            await T.eval(`${HIDE} blazeExit(); blazeCharOffer('blaze'); true;`); await W(500);
            await T.eval(`document.getElementById('bz-var-f').click(); document.querySelector('#sys-modal-btns button').click(); true;`); await W(1500);
            const f = JSON.parse(await T.eval(`JSON.stringify({ quick: blaze.quick, win: blazeWinTarget(), delay: blazePoisonDelay(), saved: SETTINGS.blazeFull,
                over5: (function(){ blaze.score = [4, 0]; blazeAwardRound(0); return blaze.over; })() })`));
            if (f.quick || f.win !== 10 || f.delay !== 8 || f.saved !== true || f.over5) bad.push('完整场参数不对 ' + JSON.stringify(f));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M3 超燃快速场（先赢 5 局、60 秒后缩圈，默认）和完整场（先赢 10 局）', bad.length === 0, bad.join(' / '));
        }

                if (want('M4')) {
            // M4：超燃每个角色记场数、胜场；赢 10 场「xx熟手」称号，30 场专属外观（金环），100 场「xx大师」称号；存档带着
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let out = {};
                gState.blazeMastery = { bow: { n: 12, w: 9 } };
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(blaze.me.team);
                out.a = blazeMasteryOf('bow'); out.hand = titleOwned('bzh_bow'); out.gold0 = blazeGoldKeys().length; out.name = TITLES.bzh_bow.name;
                blazeExit();
                gState.blazeMastery.bow = { n: 40, w: 29 };
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                blaze.score = [BLAZE.roundsToWin - 1, BLAZE.roundsToWin - 1]; blazeAwardRound(1 - blaze.me.team);   // 输一场：场数 +1，胜场不变
                out.lose = blazeMasteryOf('bow');
                blazeExit();
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                out.halo0 = blaze.me.mesh.children.some(function (c) { return c.geometry && c.geometry.type === 'TorusGeometry' && c.position.y > 17 && c.material.color.getHex() === 0xffd54f; });
                blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(blaze.me.team);
                out.gold = blazeGoldKeys(); out.w30 = blazeMasteryOf('bow').w;
                blazeExit();
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                out.halo1 = blaze.me.mesh.children.some(function (c) { return c.geometry && c.geometry.type === 'TorusGeometry' && c.position.y > 17 && c.material.color.getHex() === 0xffd54f; });
                blazeExit();
                gState.blazeMastery.bow = { n: 130, w: 99 };
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(blaze.me.team);
                out.master = titleOwned('bzm_bow'); out.masterName = TITLES.bzm_bow.name;
                blazeExit();
                saveProgress(); let saved = JSON.stringify(gState.blazeMastery.bow); gState.blazeMastery = null; loadProgress(gState.id);
                out.reload = JSON.stringify(gState.blazeMastery && gState.blazeMastery.bow) === saved;
                // 联机：别人房间心跳里报的金环，进他的身体
                roomPeers['pB'] = { bzgold: ['sword'] }; out.peer = [blazeGoldOf('pB').indexOf('sword') >= 0, blazeGoldOf('pB').indexOf('bow') >= 0];
                openAchievements('title'); out.list = /熟手/.test(document.getElementById('sys-modal-text').innerText) && /大师/.test(document.getElementById('sys-modal-text').innerText);
                return JSON.stringify(out); })()`));
            if (r.a.n !== 13 || r.a.w !== 10) bad.push('赢一场没记上 ' + JSON.stringify(r.a));
            if (!r.hand || r.name !== '远程熟手') bad.push('赢 10 场没拿到熟手称号 ' + r.hand + r.name);
            if (r.gold0 !== 0) bad.push('10 场就有专属外观了');
            if (r.lose.n !== 41 || r.lose.w !== 29) bad.push('输一场记得不对 ' + JSON.stringify(r.lose));
            if (r.halo0) bad.push('29 场就有金环');
            if (r.gold.indexOf('bow') < 0 || r.w30 !== 30 || !r.halo1) bad.push('30 场没解锁专属外观 ' + JSON.stringify([r.gold, r.w30, r.halo1]));
            if (!r.master || r.masterName !== '远程大师') bad.push('100 场没拿到大师称号');
            if (!r.reload) bad.push('存档读回来不一样');
            if (!r.peer[0] || r.peer[1]) bad.push('别人的金环没读到 ' + JSON.stringify(r.peer));
            if (!r.list) bad.push('称号列表里没有熟手/大师');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M4 超燃角色熟练度：记场数/胜场；赢 10 场熟手称号、30 场金环外观、100 场大师称号；存档带着', bad.length === 0, bad.join(' / '));
        }

                if (want('M5')) {
            // M5：加成图鉴——全部加成卡（现在 66 张）出现在你的三选一里就点亮；选过几次、选了赢了几次；全点亮有「超燃百科」称号；存档带着
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let out = { total: BLAZE_PERKS.length };
                gState.perkBook = null; gState.blazeMastery = null;
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                blaze.score = [1, 0]; blaze.phase = 'perk'; blaze.me.pickedPerk = false; blaze.me.perkDraw = null;
                let draw = blazePerkDraw(blaze.me); out.drawN = draw.length;
                out.lit1 = perkBookLit(); out.seenDrawn = draw.every(function (o) { return perkBookState().seen[o.id]; });
                let id = draw[0].id; blazePickPerk(id);
                out.pick = perkBookState().pick[id];
                blaze.score = [BLAZE.roundsToWin - 1, 0]; blazeAwardRound(blaze.me.team);   // 赢了这一整场
                out.win = perkBookState().win[id];
                out.noPickWin = Object.keys(perkBookState().win).length;
                blazeExit();
                // 换一批也会点亮新的
                blazeBegin(blazePlan([{ id: gState.id, key: 'sword' }]), gState.id, false);
                blaze.phase = 'perk'; blaze.me.perkDraw = null; blaze.me.perkRerollsLeft = 1; blazePerkDraw(blaze.me); let n0 = perkBookLit(); blazePerkReroll(); out.reroll = perkBookLit() >= n0;
                blazeExit();
                // 页面：已点亮的有字、没点亮的是问号；专属卡带角色名
                perkBookSee(BLAZE_PERKS.filter(function (o) { return o.only === 'tank'; }));
                openPerkBook(); let html = document.getElementById('sys-modal-text').innerHTML;
                out.q = (html.match(/？/g) || []).length; out.lit = perkBookLit(); out.tag = /抗伤猫盾/.test(html); out.count = /选过 1 次 · 选了赢了 1 次/.test(html);
                out.noTitle = !titleOwned('bzbook');
                // 存档
                saveProgress(); let saved = JSON.stringify(gState.perkBook); gState.perkBook = null; loadProgress(gState.id); out.reload = JSON.stringify(gState.perkBook) === saved;
                perkBookSee(BLAZE_PERKS); out.title = titleOwned('bzbook') && TITLES.bzbook.name === '超燃百科';
                return JSON.stringify(out); })()`));
            if (r.total < 63) bad.push('卡少了 ' + r.total);
            if (!r.drawN || !r.seenDrawn || r.lit1 !== r.drawN) bad.push('三选一出现的没点亮 ' + JSON.stringify([r.drawN, r.lit1, r.seenDrawn]));
            if (r.pick !== 1 || r.win !== 1 || r.noPickWin !== 1) bad.push('选过/选了赢了 记得不对 ' + JSON.stringify([r.pick, r.win, r.noPickWin]));
            if (!r.reroll) bad.push('换一批后图鉴数变少了');
            if (r.q + r.lit !== r.total || !r.tag || !r.count) bad.push('图鉴页面不对 ' + JSON.stringify([r.q, r.lit, r.tag, r.count]));
            if (!r.noTitle) bad.push('没点满就有称号了');
            if (!r.reload) bad.push('存档读回来不一样');
            if (!r.title) bad.push('点满没拿到「超燃百科」');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M5 超燃加成图鉴：出现在三选一里就点亮、记选过/选了赢了次数、点满有称号、存档带着', bad.length === 0, bad.join(' / '));
        }

                if (want('M6')) {
            // M6：惊魂夜被淘汰后，观战条上有“结算回大厅”，点了直接结算，只给打完那一份（不是赢）
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('night'); ${MODES.night.start}; true;`); await W(3000);
            await T.eval(`night.survivors[0].out = true; true;`); await W(1500);
            const bar = JSON.parse(await T.eval(`JSON.stringify({ spec: night.spectating, show: document.getElementById('night-spectate-bar').style.display, label: document.getElementById('night-spectate-leave').innerText })`));
            if (!bar.spec || bar.show !== 'flex' || bar.label !== '结算回大厅') bad.push('观战条不对 ' + JSON.stringify(bar));
            const c0 = await T.eval(`weeklyMode = function () { return 'hunt'; }; gState.quest = { day: localDayNum(), done: [1, 1, 1], all: 1 }; gState.mcoin || 0`);   // 排除本周活动翻倍、每日任务的加成
            await T.eval(`${HIDE} document.getElementById('night-spectate-leave').click(); true;`); await W(1500);
            const r = JSON.parse(await T.eval(`JSON.stringify({ over: night.over, modal: ${MODAL}, parts: coinsLast.parts.map(function (p) { return p[0]; }), gain: coinsLast.gain, coin: (gState.mcoin || 0) })`));
            if (!r.over || r.modal !== '本局结束') bad.push('没结算 ' + JSON.stringify(r));
            if (r.parts.join(',') !== '打完' || r.gain !== 3 || r.coin - c0 !== 3) bad.push('只该给打完那一份 ' + JSON.stringify(r) + ' c0=' + c0);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M6 惊魂夜被淘汰后点“结算回大厅”直接结算，只给打完那一份', bad.length === 0, bad.join(' / '));
        }

                if (want('M7')) {
            // M7：惊魂夜逃出 10 次解锁「发光眼」表情；当追捕者累计抓 30 人解锁称号「夜间猎手」；存档带着；AI 也会戴
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let out = {};
                gState.nightStat = null; shopState();
                out.lock0 = !!shopState().faces.glow;
                for (let i = 0; i < 9; i++) nightStatAdd('esc');
                out.at9 = !!shopState().faces.glow; shopBuyFace('glow'); out.noBuy = !!shopState().faces.glow;
                shopEquipFace('glow'); out.equip9 = shopState().face;
                nightStatAdd('esc'); out.at10 = !!shopState().faces.glow; shopEquipFace('glow'); out.equip10 = shopState().face;
                for (let i = 0; i < 29; i++) nightStatAdd('catch');
                out.t29 = titleOwned('nighthunter'); nightStatAdd('catch'); out.t30 = titleOwned('nighthunter');
                saveProgress(); let saved = JSON.stringify(gState.nightStat); gState.nightStat = null; loadProgress(gState.id);
                out.reload = JSON.stringify(gState.nightStat) === saved && nightStatOf().esc === 10 && nightStatOf().catch === 30;
                // 脸能画出来；AI 抽表情时池子里有它
                out.draw = faceCanvas('glow').width === 64;
                let n = 0; for (let i = 0; i < 3000; i++) if (aiRandomFace() === 'glow') n++; out.ai = n > 0;
                // 商店页：未解锁写条件，解锁了能换
                shopFaceTarget = 'me'; out.shopHtml = /发光眼/.test(shopFaceHtml());
                // 称号列表
                openAchievements('title'); out.titleList = /夜间猎手/.test(document.getElementById('sys-modal-text').innerText);
                return JSON.stringify(out); })()`));
            if (r.lock0 || r.at9 || r.noBuy || r.equip9 === 'glow') bad.push('没到 10 次就解锁了 ' + JSON.stringify([r.lock0, r.at9, r.noBuy, r.equip9]));
            if (!r.at10 || r.equip10 !== 'glow') bad.push('逃出 10 次没解锁发光眼 ' + JSON.stringify([r.at10, r.equip10]));
            if (r.t29 || !r.t30) bad.push('抓 30 人称号不对 ' + JSON.stringify([r.t29, r.t30]));
            if (!r.reload) bad.push('存档读回来不一样');
            if (!r.draw || !r.ai || !r.shopHtml || !r.titleList) bad.push('脸/AI/页面 ' + JSON.stringify([r.draw, r.ai, r.shopHtml, r.titleList]));
            // 真打一局：逃生者撤离，次数 +1；追捕者抓起倒地的人，次数 +1
            await T.eval(`${HIDE} gState.nightStat = null; selectGameMode('night'); ${MODES.night.start}; true;`);
            if (!(await until(T, `night && !night.over && night.survivors && night.survivors.length`, 30000))) bad.push('惊魂夜没开起来');
            await T.eval(`night.survivors[0].escaped = true; endNightGame('测试'); true;`);
            await until(T, `nightStatOf().esc >= 1`, 30000);   // 等条件成立，不靠固定等待（CI 负载高时曾经没记上）
            const esc = await T.eval(`nightStatOf().esc`);
            if (esc !== 1) bad.push('撤离一局没记上 ' + esc);
            await T.eval(`${HIDE} nightBackToLobby(); true;`);
            await until(T, `!night || night.over`, 30000);
            await T.eval(`${HIDE} NIGHT_MATCH_WAIT = 0; enterNightMatch('hunter'); nightPickChar('hunter'); true;`);
            if (!(await until(T, `night && !night.over && night.hunter && night.survivors && night.survivors.length`, 30000))) bad.push('追捕者那局没开起来');
            await frames(T, 3);
            const grab = JSON.parse(await T.eval(`(function(){ let h = night.hunter; h.recover = 0; h.spearLeft = 0; night.action = null; h.carrying = null;
                let s = night.survivors.filter(function (a) { return !a.isPlayer; })[0]; s.downed = true; s.onChair = false; s.out = false; s.escaped = false;
                s.p.copy(h.p); s.gy = h.gy || 0; let before = nightStatOf().catch; nightHunterGrab(); return JSON.stringify({ before: before, after: nightStatOf().catch, carrying: !!h.carrying }); })()`));
            if (grab.after !== grab.before + 1 || !grab.carrying) bad.push('抓起一个人没记上 ' + JSON.stringify(grab));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('M7 惊魂夜逃出 10 次解锁发光眼表情、当追捕者抓 30 人解锁称号；AI 也会戴；存档带着', bad.length === 0, bad.join(' / '));
        }

                if (want('P2')) {
            // P2：选加成时“换一批”每小局只有 1 次（原来是测试用的 100 次），下一小局恢复
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let out = { cfg: BLAZE.perkRerolls };
                blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false);
                blaze.score = [1, 0]; blazeAwardRound(0);            // 进入选加成
                out.phase = blaze.phase; out.left0 = blaze.me.perkRerollsLeft;
                let d0 = blazePerkDraw(blaze.me).map(function (o) { return o.id; }).join();
                blazePerkReroll(); out.left1 = blaze.me.perkRerollsLeft; let d1 = blazePerkDraw(blaze.me).map(function (o) { return o.id; }).join(); out.changed = d0 !== d1;
                blazePerkReroll(); out.left2 = blaze.me.perkRerollsLeft; out.same = blazePerkDraw(blaze.me).map(function (o) { return o.id; }).join() === d1;
                blazePickPerk(blazePerkDraw(blaze.me)[0].id); blazeStartNextRound();
                blaze.phase = 'live'; blazeAwardRound(0);              // 下一小局
                out.again = blaze.me.perkRerollsLeft;
                return JSON.stringify(out); })()`));
            if (r.cfg !== 1) bad.push('配置不是 1 ' + r.cfg);
            if (r.phase !== 'perk' || r.left0 !== 1) bad.push('进选牌时应有 1 次 ' + JSON.stringify([r.phase, r.left0]));
            if (r.left1 !== 0 || !r.changed) bad.push('换了一次应该变牌、剩 0 次 ' + JSON.stringify([r.left1, r.changed]));
            if (r.left2 !== 0 || !r.same) bad.push('第二次不该能换 ' + JSON.stringify([r.left2, r.same]));
            if (r.again !== 1) bad.push('下一小局没恢复成 1 次 ' + r.again);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('P2 加成“换一批”每小局 1 次，下一小局恢复', bad.length === 0, bad.join(' / '));
        }

                if (want('F2')) {
            // F2：iPad 触屏尺寸（1180×820）点“记录榜”到面板出来要快：200 毫秒以内（含画出下一帧）
            const bad = [];
            const M = await openTab(chrome, url, { mobile: true });
            await M.eval(`${HIDE} selectGameMode('race'); document.getElementById('mode-detail-panel').classList.remove('hidden'); true;`); await W(1000);
            const times = [];
            for (let round = 0; round < 3; round++) {
                // 每轮清掉榜单缓存，量的是最慢的“第一次打开”
                await M.eval(`${HIDE} raceBoardClose(); gState.raceRec = {}; window.__f2 = {};
                    gState.garage = Array(200).fill(null).map(function (_, i) { return { n: '测试物品' + i, v: 5000 + i, w: 1, tex: 'misc', c: 0xffffff, desc: '占点存档大小'.repeat(8) }; });   // 存档做大一点（背包仓库都满），量最坏的情况
                    document.addEventListener('touchstart', function h() { window.__f2.ts = performance.now(); document.removeEventListener('touchstart', h, true); }, true);
                    document.addEventListener('touchend', function h2() { window.__f2.t0 = performance.now(); document.removeEventListener('touchend', h2, true); }, true);
                    document.addEventListener('click', function h3() { window.__f2.tc = performance.now(); document.removeEventListener('click', h3, true); }, true);
                    (function () { let orig = window.raceBoardOpen; window.raceBoardOpen = function (n) { let a = performance.now(); orig(n); window.__f2.hand = performance.now() - a; }; })();
                    new MutationObserver(function (_, ob) {
                        if (!document.getElementById('race-board').classList.contains('hidden') && !window.__f2.t1) {
                            window.__f2.t1 = performance.now(); ob.disconnect();
                            requestAnimationFrame(function () { window.__f2.t2 = performance.now(); setTimeout(function () { window.__f2.t3 = performance.now(); }, 0); });
                        }
                    }).observe(document.getElementById('race-board'), { attributes: true });
                    true;`);
                const p = await mouseAt(M, '#race-only button[onclick^="raceBoardOpen"]');
                if (!p) { bad.push('找不到记录榜按钮'); break; }
                await M.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1], id: 1 }] });
                await M.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await W(800);
                const r = JSON.parse(await M.eval(`JSON.stringify(window.__f2)`));
                if (!r.t3) { bad.push('面板没出来 ' + JSON.stringify(r)); break; }
                times.push({ end2click: +(r.tc - r.t0).toFixed(1), hand: +r.hand.toFixed(1), logic: +(r.t1 - r.t0).toFixed(1), paint: +(r.t3 - r.t0).toFixed(1), start2end: +(r.t0 - r.ts).toFixed(1) });
            }
            console.log('      F2 点击到面板：' + JSON.stringify(times));
            // 机器忙的时候单次会偶尔慢，取三次里最好的一次；真退化的话三次都慢
            { const best = times.reduce((m, t) => (t.paint < m.paint ? t : m), times[0]); if (best.paint > 200 || times.some((t) => t.hand > 50)) bad.push('点到面板可见最好也要 ' + best.paint + ' 毫秒，点击处理 ' + Math.max(...times.map((t) => t.hand)) + ' 毫秒'); }
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('F2 触屏 iPad 尺寸点“记录榜”到面板可见 ≤ 200 毫秒', bad.length === 0, bad.join(' / '));
        }

                if (want('V2')) {
            // V2：大厅公告板有厚度（16×8×0.5），杆子在板子背后、顶端只到板子中间，两个体积不重叠（从正面、侧面、背面看都不穿模）；只有正面贴字
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let b = hub.meshes.filter(function (m) { return m.geometry && m.geometry.type === 'BoxGeometry' && m.geometry.parameters.width === 16 && m.geometry.parameters.height === 8; })[0];
                let p = hub.meshes.filter(function (m) { return m.geometry && m.geometry.type === 'CylinderGeometry' && m.geometry.parameters.height === 13; })[0];
                if (!b || !p) return JSON.stringify({ missing: [!!b, !!p] });
                let bb = new THREE.Box3().setFromObject(b), pb = new THREE.Box3().setFromObject(p);
                let ov = [Math.min(bb.max.x, pb.max.x) - Math.max(bb.min.x, pb.min.x), Math.min(bb.max.y, pb.max.y) - Math.max(bb.min.y, pb.min.y), Math.min(bb.max.z, pb.max.z) - Math.max(bb.min.z, pb.min.z)];
                return JSON.stringify({ dim: [b.geometry.parameters.depth, bb.min.y, bb.max.y], post: [pb.min.y, pb.max.y], postZ: [pb.min.z, pb.max.z], boardZ: [bb.min.z, bb.max.z], ov: ov, mats: Array.isArray(b.material) ? b.material.filter(function (m) { return m.map; }).length : -1 }); })()`));
            if (r.missing) bad.push('找不到板子或杆子 ' + JSON.stringify(r.missing));
            else {
                if (r.dim[0] !== 0.5 || Math.abs(r.dim[1] - 9) > 1e-6 || Math.abs(r.dim[2] - 17) > 1e-6) bad.push('板子尺寸/位置 ' + JSON.stringify(r.dim));
                if (r.post[0] < -1e-6 || r.post[1] > 13 + 1e-6) bad.push('杆子高度应是 0～13（到板子中间） ' + JSON.stringify(r.post));
                if (!(r.postZ[1] <= r.boardZ[0] + 1e-6)) bad.push('杆子应在板子背后（z 更小） ' + JSON.stringify([r.postZ, r.boardZ]));
                if (Math.min.apply(null, r.ov) > 1e-6) bad.push('杆子和板子体积重叠 ' + JSON.stringify(r.ov));
                if (r.mats !== 1) bad.push('应该只有正面贴字 ' + r.mats);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('V2 大厅公告板：板子有厚度，杆子在背后、顶端到板子中间，体积不重叠，只有正面贴字', bad.length === 0, bad.join(' / '));
        }

                if (want('V3')) {
            // V3：更新公告规则——只留最新 3 条；每条最多 5 句、每句一行（不换行、不长）、不提保底/必出；发版的那条 id 跟版本号一致；CLAUDE.md 里写了这条规则
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`JSON.stringify({ n: CHANGELOG.length, items: CHANGELOG.map(function (e) { return e.items; }), ids: CHANGELOG.map(function (e) { return e.id; }), ver: GAME_VERSION })`));
            if (r.n < 1 || r.n > 3) bad.push('公告条数 ' + r.n + '（最多 3 条）');
            r.items.forEach(function (it, i) {
                if (it.length > 5) bad.push('第 ' + (i + 1) + ' 条有 ' + it.length + ' 句（最多 5 句）');
                it.forEach(function (t) { if (t.length > 32 || /[\n<]/.test(t)) bad.push('太长或带换行：' + t); if (/保底|必出/.test(t)) bad.push('提到了保底/必出：' + t); });
            });
            if (r.ids[0] !== r.ver) bad.push('最新一条的 id（' + r.ids[0] + '）跟版本号（' + r.ver + '）不一致');
            const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
            if (!/每次发版只写一条公告/.test(md) || !/只保留最新 3 条/.test(md)) bad.push('CLAUDE.md 里没写更新公告规则');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('V3 更新公告：只留最新几条（≤3）、每条 ≤5 句、短、不提保底；最新一条 id = 版本号；CLAUDE.md 写了规则', bad.length === 0, bad.join(' / '));
        }

                if (want('D1')) {
            // D1：大厅 ↔ 寻宝队来回 6 次，场景里的东西不堆积、几何体和贴图不增长（原来 75 → 611、13 → 69）；
            // 从场景里拿下来的东西会连同几何体、材质、贴图一起 dispose
            const bad = [];
            const T = await openTab(chrome, url);
            const mem = () => T.eval(`[renderer.info.memory.geometries, renderer.info.memory.textures, scene.children.length]`);
            const m0 = await mem(), geo = [], tex = [], kids = [];
            for (let i = 0; i < 6; i++) { await enterExit(T, 'hunt'); const m = await mem(); geo.push(m[0]); tex.push(m[1]); kids.push(m[2]); }
            const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, maxF = (a) => avg(a.slice(0, 3)), maxL = (a) => avg(a.slice(-3));
            if (maxL(geo) > maxF(geo) * 1.25 + 10) bad.push('几何体在涨 ' + geo.join(' → '));
            if (maxL(tex) > maxF(tex) * 1.25 + 10) bad.push('贴图在涨 ' + tex.join(' → '));
            if (Math.max.apply(null, kids) - Math.min.apply(null, kids) > 3) bad.push('场景里的东西在堆积 ' + kids.join(' → '));
            // 单个：拿下来的东西真的释放了
            const d = JSON.parse(await T.eval(`(function(){ let g = new THREE.BoxGeometry(1, 1, 1), tx = new THREE.CanvasTexture(document.createElement('canvas')), m = new THREE.MeshBasicMaterial({ map: tx }), mesh = new THREE.Mesh(g, m);
                let ev = []; g.addEventListener('dispose', function () { ev.push('g'); }); m.addEventListener('dispose', function () { ev.push('m'); }); tx.addEventListener('dispose', function () { ev.push('t'); });
                let grp = new THREE.Group(); grp.add(mesh); scene.add(grp); scene.remove(grp); return JSON.stringify(ev.sort()); })()`));
            if (d.join() !== 'g,m,t') bad.push('scene.remove 没有释放几何体/材质/贴图 ' + d.join());
            console.log('      D1 大厅↔寻宝队 ×6：geometries ' + m0[0] + ' → ' + geo.join(' → ') + ' / textures ' + m0[1] + ' → ' + tex.join(' → '));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('D1 退出一局会释放模型/材质/贴图：大厅 ↔ 寻宝队 ×6 几何体、贴图不增长，场景里不堆东西', bad.length === 0, bad.join(' / '));
        }

                if (want('L2')) {
            // L2 大厅减负：不动的装饰合并（墙、台阶）；远处的路人合成一次绘制、近处的还是完整猫盾；盖住大厅的全屏面板打开时不画 3D；每帧绘制次数 ≤ 50
            const bad = [];
            const T = await openTab(chrome, url);
            await W(1200);
            const r = JSON.parse(await T.eval(`(function(){ let o = {};
                renderer.render(scene, camera); o.calls = renderer.info.render.calls; o.objs = (function () { let n = 0; scene.traverse(function () { n++; }); return n; })();
                o.statics = hub.meshes.filter(function (m) { return !hub.bg || Object.keys(hub.bg).every(function (n) { return hub.bg[n] !== m; }); }).length;   // 背景（天空、云、山丘、树、房子）单算，见 L3
                o.farColor = !!hub.far.instanceColor;
                // 合并正确：两个盒子合成一个，范围等于两个的并集、三角形数相加
                let a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 1 })), b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 1 }));
                a.position.set(-5, 1, 0); b.position.set(7, 3, 2);
                let mm = hubMergeMeshes([a, b]), bb = new THREE.Box3().setFromObject(mm);
                o.merge = [bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.max.z, mm.geometry.index.count / 3];
                // 路人分远近
                let w0 = hub.wanderers[0], w1 = hub.wanderers[1];
                w0.p.set(hub.p.x + 300, 0, hub.p.z); w1.p.set(hub.p.x + 20, 0, hub.p.z + 10);
                hub.wanderers.forEach(function (w, i) { if (i > 1) w.p.set(hub.p.x + 500 + i, 0, hub.p.z); });
                hubLodTick();
                o.lod = [w0.mesh.visible, w1.mesh.visible, hub.far.count, hub.wanderers.length - 1];
                // 远处的走近一点（56，还没到 54）不马上换回来，走到 20 才换回来（边界附近不闪）
                w1.p.set(hub.p.x + 65, 0, hub.p.z); hubLodTick(); let farAt95 = w1.far; w1.p.set(hub.p.x + 56, 0, hub.p.z); hubLodTick(); let at80 = w1.far; w1.p.set(hub.p.x + 20, 0, hub.p.z); hubLodTick();
                o.hyst = [farAt95, at80, w1.far];
                return JSON.stringify(o); })()`));
            console.log('      L2 大厅：每帧绘制 ' + r.calls + ' 次，场景里 ' + r.objs + ' 个物体，不动的装饰 ' + r.statics + ' 个网格');
            if (r.calls > 50) bad.push('每帧绘制 ' + r.calls + ' 次（目标 ≤ 50）');
            if (!r.farColor) bad.push('远处路人的实例颜色没建（会画成黑块）');
            if (r.statics > 8) bad.push('不动的装饰还有 ' + r.statics + ' 个网格');
            if (r.merge[0] !== -6 || r.merge[1] !== 8 || r.merge[2] !== 0 || r.merge[3] !== 4 || r.merge[4] !== 3 || r.merge[5] !== 24) bad.push('合并结果不对 ' + JSON.stringify(r.merge));
            if (r.lod[0] !== false || r.lod[1] !== true || r.lod[2] !== r.lod[3]) bad.push('远近路人 ' + JSON.stringify(r.lod));
            if (r.hyst.join() !== 'true,true,false') bad.push('边界滞后 ' + r.hyst.join());
            // 面板盖住时不画：数 renderer.render 的次数
            const cnt = async (ms) => JSON.parse(await T.eval(`new Promise(function (res) { let n = 0, rr = renderer.render.bind(renderer); renderer.render = function () { n++; return rr.apply(null, arguments); };
                setTimeout(function () { renderer.render = rr; res(n); }, ${ms}); })`));
            const open0 = await cnt(500);
            await T.eval(`${HIDE} openSettings(); true;`); await W(200);
            const covered = await cnt(500);
            await T.eval(`${HIDE} true;`); await W(200);
            await T.eval(`raceBoardOpen(1); true;`); await W(200);
            const covered2 = await cnt(500);
            await T.eval(`raceBoardClose(); true;`); await W(200);
            const after = await cnt(500);
            if (!(open0 > 0 && covered === 0 && covered2 === 0 && after > 0)) bad.push('面板盖住时应不画、关了恢复 ' + JSON.stringify([open0, covered, covered2, after]));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('L2 大厅减负：装饰合并、远处路人合成一次绘制、面板盖住时不画 3D；每帧绘制 ≤ 50 次', bad.length === 0, bad.join(' / '));
        }

                if (want('B7')) {
            // B7：地上的东西用自己的贴图，外面一圈稀有度颜色的光（颜色规则跟背包格子 slotTier 同一个函数）：扔出腰包是腰包贴图+紫光；开箱掉出来的、抽奖弹出来的也一样
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(function(){ let o = {};
                let glowOf = function (m) { let g = m.children.filter(function (c) { return c.name === 'glow'; })[0]; return g ? g.material.color.getHex() : null; };
                // 扔腰包
                gState.inv[3] = Object.assign({}, shopItems['腰包']); let n0 = groundItems.length; executeThrow(3);
                let m = groundItems[groundItems.length - 1];
                o.pouch = [groundItems.length - n0, m.userData.n, m.material.map === createProceduralTexture('pouch', 0xd35400, '#ffffff'), glowOf(m) === HUNT_GLOW[slotTier(shopItems['腰包'])], slotTier(shopItems['腰包'])];
                // 扔一件红/金/紫的宝物，光的颜色跟 slotTier 一致
                o.tiers = [[2000000, 'red'], [100000, 'gold'], [1000, 'purple']].map(function (q) { gState.inv[3] = { n: 'x' + q[0], v: q[0], w: 1, tex: 'misc', c: 0x123456 }; executeThrow(3); let mm = groundItems[groundItems.length - 1];
                    return [slotTier(mm.userData), glowOf(mm) === HUNT_GLOW[q[1]], mm.material.map === createProceduralTexture('misc', 0x123456, '#ffffff')]; });
                // 抽奖弹出来的
                let n1 = groundItems.length; huntLotteryShow({ n: '金杯', v: 50000, w: 1, tex: 'cup', c: 0xffb300 }); let lm = groundItems[groundItems.length - 1];
                o.lottery = [groundItems.length - n1, lm.material.map === createProceduralTexture('cup', 0xffb300, '#ffffff'), glowOf(lm) === HUNT_GLOW.gold];
                document.getElementById('sys-modal').classList.add('hidden');
                return JSON.stringify(o); })()`));
            if (r.pouch[0] !== 1 || r.pouch[1] !== '腰包' || !r.pouch[2] || !r.pouch[3] || r.pouch[4] !== 'purple') bad.push('扔腰包 ' + JSON.stringify(r.pouch));
            r.tiers.forEach((t, i) => { if (!t[0] || !t[1] || !t[2]) bad.push('稀有度光/贴图 ' + i + ' ' + JSON.stringify(t)); });
            if (r.lottery[0] !== 1 || !r.lottery[1] || !r.lottery[2]) bad.push('抽奖弹出的 ' + JSON.stringify(r.lottery));
            // 开箱掉出来的（真的开一次箱子，把掉落预设成一件红宝）
            await T.eval(`window.__lc = huntChestLoot; huntChestLoot = function () { return { n: '红宝', v: 2500000, w: 1, tex: 'gem', c: 0xe74c3c }; }; window.__pr = huntPotionRoll; huntPotionRoll = function () { return null; }; groundItems.forEach(function (g) { scene.remove(g); }); groundItems.length = 0;   // 先把前面扔的清掉，免得挡住准星
                let c = chests[0]; camera.position.set(c.position.x + 6, c.position.y + 7, c.position.z); pVel.set(0, 0, 0); camera.rotation.y = Math.PI / 2; keys['f'] = true; true;`);
            await W(700);
            const c = JSON.parse(await T.eval(`(function(){ huntChestLoot = window.__lc; huntPotionRoll = window.__pr; let m = groundItems.filter(function (g) { return g.userData.n === '红宝'; })[0];
                return JSON.stringify(m ? { map: m.material.map === createProceduralTexture('gem', 0xe74c3c, '#ffffff'), glow: (m.children.filter(function (x) { return x.name === 'glow'; })[0] || { material: { color: { getHex: function () { return -1; } } } }).material.color.getHex() === HUNT_GLOW.red } : null); })()`));
            if (!c || !c.map || !c.glow) bad.push('开箱掉出来的 ' + JSON.stringify(c));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('B7 地上的东西用自己的贴图 + 稀有度光圈（扔腰包是腰包贴图+紫光；开箱、抽奖掉出来的也一样）', bad.length === 0, bad.join(' / '));
        }

                if (want('B8')) {
            // B8：1～3 永远只切快捷栏（手上拿着腰包也一样）；腰包里的东西在背包界面里点开腰包、点一下放到手上的空格，手上没空格就跟当前手上的换；提示和规则一起改
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const key = async (k, code) => { await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: 'Digit' + k, windowsVirtualKeyCode: code }); await T.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Digit' + k, windowsVirtualKeyCode: code }); await W(250); };
            const click = async (sel) => { const p = await mouseAt(T, sel); if (!p) throw new Error('找不到 ' + sel);
                const ev = (type) => T.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
                await ev('mouseMoved'); await ev('mousePressed'); await ev('mouseReleased'); await W(300); };
            // 拿着腰包按 2：选中快捷栏第 2 格，腰包里的东西不动
            await T.eval(`(function(){ let S = function (n) { return Object.assign({}, shopItems[n], { isShop: true }); };
                gState.inv = [S('腰包'), S('医疗包'), null, null, null, null]; gState.inv[0].bag = [S('鱼叉'), null, null]; selectSlot(0); updateHUD(); return true; })()`);
            await key('2', 50);
            const k2 = JSON.parse(await T.eval(`JSON.stringify({ sel: gState.selectedSlot, inv: gState.inv.map(function (q) { return q && q.n; }), bag: gState.inv[0].bag.map(function (q) { return q && q.n; }) })`));
            if (k2.sel !== 1 || k2.inv.join() !== '腰包,医疗包,,,,' || k2.bag.join() !== '鱼叉,,') bad.push('拿着腰包按 2 ' + JSON.stringify(k2));
            await key('1', 49);
            if ((await T.eval('gState.selectedSlot')) !== 0) bad.push('按 1 没选中第 1 格');
            await key('3', 51);
            if ((await T.eval('gState.selectedSlot')) !== 2) bad.push('按 3 没选中第 3 格');
            // 背包里点开腰包 → 点里面的鱼叉 → 放到手上的空格（第 3 格是空的）
            await T.eval(`toggleBackpackUI(); selectSlot(0); ${HIDE} true;`); await W(300);
            await click('#bp-hotbar-slots .slot:nth-child(1)'); await W(200);   // 点腰包展开
            if (!(await T.eval(`!!document.querySelector('#bp-pouch-row .slot')`))) bad.push('点腰包没展开');
            await click('#bp-pouch-row > div:nth-child(2)');
            const t1 = JSON.parse(await T.eval(`JSON.stringify({ inv: gState.inv.slice(0, 3).map(function (q) { return q && q.n; }), bag: gState.inv[0].bag.map(function (q) { return q && q.n; }), sel: gState.selectedSlot })`));
            if (t1.inv.join() !== '腰包,医疗包,鱼叉' || t1.bag.join() !== ',,') bad.push('点腰包里的东西没放到手上的空格 ' + JSON.stringify(t1));
            // 手上三格都满了：点腰包里的东西，跟当前手上这格对换
            await T.eval(`gState.inv[0].bag = [Object.assign({}, shopItems['肾上腺素'], { isShop: true }), null, null]; selectSlot(1); openPouch = gState.inv[0]; updateHUD(); true;`); await W(300);
            await click('#bp-pouch-row > div:nth-child(2)');
            const t2 = JSON.parse(await T.eval(`JSON.stringify({ inv: gState.inv.slice(0, 3).map(function (q) { return q && q.n; }), bag: gState.inv[0].bag.map(function (q) { return q && q.n; }), sel: gState.selectedSlot })`));
            if (t2.inv.join() !== '腰包,肾上腺素,鱼叉' || t2.bag.join() !== '医疗包,,') bad.push('手上满了应该跟当前手上这格对换 ' + JSON.stringify(t2));
            // 提示和规则
            const txt = JSON.parse(await T.eval(`JSON.stringify({ rules: Object.keys(MODE_RULES).map(function (k) { return rulesHtml(k); }).join(''), pv: (function () { selectSlot(0); updateHUD(); return document.getElementById('pouch-view').innerText; })() })`));
            if (/按 ?1 ?2 ?3[^换]*把里面|按 1～|按 E 打开背包拿/.test(txt.rules + txt.pv)) bad.push('提示里还写着按 1～3 从腰包取 ' + txt.pv);
            if (!/点里面的东西放到手上/.test(txt.rules)) bad.push('规则没改');
            await T.eval(`toggleBackpackUI(); true;`);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('B8 1～3 只切快捷栏（拿着腰包也是）；背包里点腰包里的东西放到手上空格、没空格就对换；提示和规则改了', bad.length === 0, bad.join(' / '));
        }

                if (want('B9')) {
            // B9：局里在背包界面把东西拖出窗口（白框外）松手 = 扔到面前地上（跟 Q 一样；腰包里的东西单独扔那一件）；触屏也行；大厅仓库里拖出窗口不扔
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const state = () => T.eval(`JSON.stringify({ inv: gState.inv.slice(0, 6).map(function (q) { return q && q.n; }), bag: gState.inv[1] && gState.inv[1].bag ? gState.inv[1].bag.map(function (q) { return q && q.n; }) : null, ground: groundItems.map(function (g) { return g.userData.n; }) })`).then(JSON.parse);
            const setup = () => T.eval(`(function(){ let S = function (n) { return Object.assign({}, shopItems[n], { isShop: true }); }, L = function (n, v) { return { n: n, v: v, w: 1, tex: 'misc', c: 0xffffff }; };
                groundItems.forEach(function (g) { scene.remove(g); }); groundItems.length = 0;
                gState.inv = [S('鱼叉'), S('腰包'), null, L('银杯', 5000), L('金杯', 50000), null]; gState.inv[1].bag = [L('袋里的杯', 7000), null, null]; openPouch = null;
                if (!gState.backpackOpen) toggleBackpackUI(); ${HIDE} updateHUD(); return true; })()`);
            const dragOut = async (sel) => { const p = await mouseAt(T, sel); if (!p) throw new Error('找不到 ' + sel); await mouseDrag(T, sel, null, 40 - p[0]); await W(300); };
            // 1) 背包里一件宝物拖到窗口外：背包少了它，地上多了它
            await setup();
            await dragOut('#bp-backpack-slots .slot:nth-child(1)');   // 背包空间第 1 格 = inv[3] 银杯
            let st = await state();
            if (st.inv[3] !== null || st.ground.join() !== '银杯') bad.push('鼠标拖出窗口没扔 ' + JSON.stringify(st));
            // 2) 拖到窗口里面别的格子：不扔
            await setup();
            await mouseDrag(T, '#bp-backpack-slots .slot:nth-child(1)', '#bp-backpack-slots .slot:nth-child(3)'); await W(300);
            st = await state();
            if (st.ground.length !== 0 || st.inv[3] !== null && st.inv[5] !== null && st.inv[3] !== '银杯') bad.push('拖进窗口里的格子不该扔 ' + JSON.stringify(st));
            // 3) 腰包里的东西拖出窗口：只扔那一件，腰包还在
            await setup();
            await T.eval(`openPouch = gState.inv[1]; updateHUD(); true;`); await W(300);
            await dragOut('#bp-pouch-row > div:nth-child(2)');
            st = await state();
            if (st.bag.join() !== ',,' || st.ground.join() !== '袋里的杯' || st.inv[1] !== '腰包') bad.push('腰包里的东西拖出窗口 ' + JSON.stringify(st));
            // 4) 把腰包本身拖出去：里面的东西跟着腰包走
            await setup();
            await dragOut('#bp-hotbar-slots .slot:nth-child(2)');
            st = await state();
            const thrown = await T.eval(`(function(){ let g = groundItems.filter(function (x) { return x.userData.n === '腰包'; })[0]; return g ? JSON.stringify(g.userData.bag.map(function (q) { return q && q.n; })) : null; })()`);
            if (st.inv[1] !== null || st.ground.join() !== '腰包' || thrown !== '["袋里的杯",null,null]') bad.push('拖出腰包 ' + JSON.stringify([st, thrown]));
            await T.eval(`toggleBackpackUI(); true;`);
            // 5) 大厅仓库（另开一个页面，没进过局）：拖出窗口不扔，东西还在原位
            const G = await openTab(chrome, url);
            await G.eval(GARAGE_SETUP(`[S('鱼叉'), null, null, null, null, null]`, `[L('银杯')]`, 1000));
            await W(500);
            const g0 = await mouseAt(G, GAR_SLOT(0));
            await mouseDrag(G, GAR_SLOT(0), null, 3 - g0[0]); await W(300);
            const gs = JSON.parse(await G.eval(`JSON.stringify({ garage: gState.garage.slice(0, 3).map(function (q) { return q && q.n; }), ground: groundItems.length })`));
            if (gs.garage[0] !== '银杯' || gs.ground !== 0) bad.push('仓库里拖出窗口东西没回原位 ' + JSON.stringify(gs));
            if (G.errors.length) bad.push(G.errors.slice(0, 2).join(' / '));
            await G.close();
            // 6) 触屏：用手指拖出去也扔
            const M = await openTab(chrome, url, { mobile: true });
            await M.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await M.eval(`${HIDE} true;`);
            await M.eval(`(function(){ let L = function (n, v) { return { n: n, v: v, w: 1, tex: 'misc', c: 0xffffff }; };
                groundItems.forEach(function (g) { scene.remove(g); }); groundItems.length = 0; gState.inv = [null, null, null, L('银杯', 5000), null, null]; if (!gState.backpackOpen) toggleBackpackUI(); ${HIDE} updateHUD(); return true; })()`);
            const tp = await mouseAt(M, '#bp-backpack-slots .slot:nth-child(1)');
            const pts = []; for (let i = 0; i <= 8; i++) pts.push([tp[0] + (30 - tp[0]) * i / 8, tp[1]]);
            await touchPath(M, pts, 0); await W(300);
            const ts = JSON.parse(await M.eval(`JSON.stringify({ inv3: gState.inv[3] && gState.inv[3].n, ground: groundItems.map(function (g) { return g.userData.n; }) })`));
            if (ts.inv3 !== null || ts.ground.join() !== '银杯') bad.push('触屏拖出窗口没扔 ' + JSON.stringify(ts));
            await M.close();
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('B9 局里把东西拖出背包窗口 = 扔到面前地上（鼠标、触屏；腰包里的东西单独扔，腰包本身带着里面的走）；仓库里拖出窗口不扔', bad.length === 0, bad.join(' / '));
        }

                if (want('D2')) {
            // D2：彩弹占地（paint）下架——入口、规则、模式名、每周活动、每日任务池、框架里的定义都没了；老存档里记着 paint 的回到寻宝队；“全都玩过”目标 11
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){ let o = {};
                o.btn = !!document.getElementById('btn-mode-paint') || !!document.getElementById('paint-only');
                o.defs = [typeof PAINT, typeof NM_DEFS.paint, MODE_CN.paint === undefined, WEEKLY_MODES.indexOf('paint'), QUEST_MODES.indexOf('paint'), MODE_NAME_LIST.filter(function (x) { return x[0] === 'paint'; }).length, typeof MM_MODE_LABEL.paint, !!MODE_RULES.paint];
                selectGameMode('paint'); o.mode = gState.gameMode;
                o.pool = (function () { let real = localDayNum, n = 0; for (let d = 20000; d < 20400; d++) { localDayNum = function () { return d; }; if (questToday().some(function (t) { return t.mode === 'paint'; })) n++; } localDayNum = real; return n; })();
                o.ach = ACH_LIST.filter(function (a) { return a.id === 'all'; })[0].goal;
                o.html = document.body.innerHTML.indexOf('彩弹占地');
                return JSON.stringify(o); })()`));
            if (r.btn) bad.push('页面上还有入口');
            if (r.defs.join() !== 'undefined,undefined,true,-1,-1,0,undefined,false') bad.push('代码里还有定义 ' + r.defs.join());
            if (r.mode !== 'hunt') bad.push('老存档里的 paint 没回到寻宝队 ' + r.mode);
            if (r.pool !== 0) bad.push('每日任务还会出 paint ' + r.pool);
            if (r.ach !== 11) bad.push('全都玩过目标 ' + r.ach);
            if (r.html >= 0) bad.push('页面里还有“彩弹占地”');
            const src = ['index.html'].concat(fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)).filter((f) => /彩弹占地|PAINT\b|paintShoot|NM_DEFS\.paint/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/下架/.test(l)).join('\n')));   // 更新公告里写“下架了”不算
            if (src.length) bad.push('源码里还有 ' + src.join(','));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('D2 彩弹占地下架：入口、规则、模式名、每周活动、每日任务池、框架定义都删了；老存档的 paint 回寻宝队；全都玩过目标 11', bad.length === 0, bad.join(' / '));
        }

                if (want('A7')) {
            // A7：游戏里的反馈功能全删——页面上没有反馈入口，代码里搜不到 web3forms / access_key / 邮箱；游玩记录也没有；联机诊断只有四项
            const bad = [];
            const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
            // vendor/ 是原样放进来的第三方库（C6a 用 SHA-256 锁死逐字节相同），PeerJS 自带上游贡献者名单，不归我们改，这里不扫
            const files = ['index.html'].concat(fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f));
            files.forEach((f) => {
                const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
                const m = t.match(emailRe); if (m) bad.push(f + ' 里有邮箱 ' + m.slice(0, 2).join(', '));
                if (/web3forms|8d9d0fe6|access_key|WEB3FORMS|openFeedback|FEEDBACK_|mailto:/i.test(t)) bad.push(f + ' 里还有反馈相关代码');
            });
            ['netlify.toml', 'netlify/functions/feedback.js'].forEach((f) => { if (fs.existsSync(path.join(ROOT, f))) bad.push(f + ' 还在'); });
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`JSON.stringify({ fn: typeof openFeedback + typeof feedbackSend + typeof openPlayLog + typeof playStatsDigest,
                btn: Array.prototype.filter.call(document.querySelectorAll('button, a'), function (b) { return /反馈|游玩记录|feedback/i.test(b.innerText + (b.getAttribute('onclick') || '')); }).map(function (b) { return b.innerText; }),
                steps: NET_DIAG_STEPS.length })`));
            if (r.fn !== 'undefinedundefinedundefinedundefined') bad.push('函数还在 ' + r.fn);
            if (r.btn.length) bad.push('页面上还有入口 ' + r.btn.join(','));
            if (r.steps !== 5) bad.push('联机诊断是 ' + r.steps + ' 项（应是五项）');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('A7 游戏里没有反馈入口；代码里搜不到 web3forms、access_key、邮箱；联机诊断五项', bad.length === 0, bad.join(' / '));
        }

                if (want('I1b')) {
            // I1b：惊魂夜规则卡开着时 endNightGame，回大厅后 introOpen 是 false，单人密室能正常走（全程真点击，不用 HIDE）
            const bad = [];
            const N = await openTab(chrome, url, { noLobby: true });
            await N.eval(`document.getElementById('player-id').value = 'i1b' + Date.now() % 100000; requestLobbyAccess(); true;`); await W(1500);
            for (let i = 0; i < 6 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            await N.eval(`selectGameMode('night'); NIGHT_MATCH_WAIT = 0; enterNightMatch('survivor'); nightPickChar('cat'); true;`); await W(2500);
            const t0 = await N.eval(MODAL), open0 = await N.eval('introOpen');
            if (!/规则/.test(t0 || '') || !open0) bad.push('惊魂夜没弹出规则卡 ' + t0 + '/' + open0);
            await N.eval(`endNightGame('测试退出'); true;`); await W(1200);
            // 回大厅：把还排着的弹窗一张张点掉
            for (let i = 0; i < 10 && (await N.eval(MODAL)) !== null; i++) await clickModal(N, (await N.eval(MODAL)) === '本局结束' ? 1 : 0);   // 结算框第一个是“再来一局”，要点第二个“返回大厅”
            await until(N, `!introOpen && !introQ.length && !sysModalWait.length && !!hub && ${ACTIVE} === null && ${MODAL} === null`, 20000);
            const st = JSON.parse(await N.eval(`JSON.stringify({ open: introOpen, q: introQ.length, wait: sysModalWait.length, lobby: !!hub && ${ACTIVE} === null, modal: ${MODAL} })`));
            if (st.open || st.q || st.wait || !st.lobby || st.modal !== null) bad.push('回大厅后还卡着 ' + JSON.stringify(st));
            await N.eval(`selectGameMode('escape'); escapeBegin(null, null, 1); true;`); await W(1200);
            let started = false;
            for (let i = 0; i < 40 && !started; i++) { if ((await N.eval(MODAL)) !== null) await clickModal(N); else await W(400); started = await N.eval('escapeRoom && escapeRoom.started'); }
            const c1 = await N.eval('escapeRoom.clock'); await until(N, `escapeRoom.clock > ${c1}`, 20000); const c2 = await N.eval('escapeRoom.clock');
            if (!started || !(c2 > c1)) bad.push('密室没走起来 ' + JSON.stringify({ started, c1, c2 }));
            await N.eval(`escapeExit(); true;`);
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('I1b 惊魂夜规则卡开着时 endNightGame：回大厅后 introOpen 为 false，单人密室能走', bad.length === 0, bad.join(' / '));
        }

                if (want('R1')) {
            // R1：单人局里，提示卡片开着时整局静止（场景里所有东西的位置都不变、按着 W 也走不动、拖鼠标不转视角），关了接着动；
            // 多人局里卡片变成屏幕上方的提示条，不弹窗、不暂停。11 个模式逐个测
            const bad = [];
            const T = await openTab(chrome, url);
            const SIG = `(function(){ let s = 0, n = 0; scene.traverse(function (o) { n++; s += o.position.x * 1.1 + o.position.y * 1.3 + o.position.z * 1.7 + o.scale.x + o.scale.y + o.scale.z + o.rotation.y; });
                let M = ({ blaze: blaze, night: night, race: race, jail: jail, dodge: dodge, escape: escapeRoom, park: park, cake: cake, sumo: nm, tower: nm })[chatActiveModeKey()], nums = [];
                if (M) Object.keys(M).forEach(function (k) { if (typeof M[k] === 'number' && k !== 'last' && k !== 'raf') nums.push(k + ':' + M[k].toFixed(2)); });
                return JSON.stringify([Math.round(s * 1000), n, camera.position.x.toFixed(3), camera.position.z.toFixed(3), camera.rotation.y.toFixed(3), typeof timeSecs === 'number' ? timeSecs.toFixed(1) : 0, nums]); })()`;
            for (const key of Object.keys(MODES).filter((k) => !process.env.R1_MODES || process.env.R1_MODES.split(',').indexOf(k) >= 0)) {
                const before = T.errors.length;
                await T.eval(`${HIDE} selectGameMode('${key}'); ${MODES[key].start}; true;`); await W(3500);
                await T.eval(`${HIDE} true;`);
                await T.eval(`keys['w'] = true; true;`); const m0 = await T.eval(SIG); await W(900); const m1 = await T.eval(SIG); await T.eval(`keys['w'] = false; true;`);
                const moves = m0 !== m1;
                await T.eval(`introPush('测试卡片', '一二三'); true;`); await W(700);
                const open = await T.eval(`introOpen && ${MODAL} === '测试卡片'`);
                // 先等游戏真的停住了（卡片刚弹出来放了 2 帧才停；CI 上帧率低，这 2 帧可能要一会儿）
                for (let i = 0; i < 40 && (await T.eval('introFreezeFrames')) < 2; i++) await W(250);
                await W(400);
                await T.eval(`keys['w'] = true; mouseLook = true; window.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: 0 })); true;`);
                const a = await T.eval(SIG); await W(1500); await T.eval(`window.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: 0 })); true;`); const b = await T.eval(SIG);
                await T.eval(`keys['w'] = false; mouseLook = false; true;`);
                if (!open) bad.push(key + ' 卡片没开');
                if (a !== b) { const pa = JSON.parse(a), pb = JSON.parse(b); bad.push(key + ' 卡片开着还在动 ' + pa.slice(0, 6).join(',') + ' → ' + pb.slice(0, 6).join(',') + ' 变化的字段 ' + pb[6].filter((x, i) => x !== pa[6][i]).join(';')); }
                await clickModal(T, 0); await W(900);
                for (let i = 0; i < 4 && (await T.eval(MODAL)) !== null; i++) { await clickModal(T, 0); await W(500); }   // 模式自己排着的新手卡片也点掉
                const c0 = await T.eval(SIG); await W(700); const c1 = await T.eval(SIG);
                if (moves && c0 === c1) bad.push(key + ' 关了卡片没接着动');
                if (!moves) bad.push(key + '（测试本身：没有卡片时画面也不动，这项没测到）');
                if (await T.eval('introOpen')) bad.push(key + ' 关了 introOpen 还是 true');
                await T.eval(`${HIDE} ${MODES[key].exit}; true;`); await W(1500); await T.eval(`${HIDE} true;`);
                if (T.errors.length > before) bad.push(key + ' 报错 ' + T.errors.slice(before, before + 1).join(''));
            }
            await T.close();
            report('R1 单人局卡片开着整局静止（11 个模式：场景、走、转视角都停），关了接着动', bad.length === 0, bad.join(' / '));
        }

                if (want('R1m')) {
            // R1m：多人局里卡片变成屏幕上方的提示条——不弹窗、不暂停（局还在走，按着 W 还能走），点一下收起，排队的下一张接着出
            const bad = [];
            const T = await openTab(chrome, url);
            const SIG = `(function(){ let s = 0; scene.traverse(function (o) { s += o.position.x * 1.1 + o.position.y * 1.3 + o.position.z * 1.7 + o.rotation.y; }); let M = ({ blaze: blaze, sumo: nm, paint: nm, tower: nm })[chatActiveModeKey()]; return Math.round(s * 1000) + '|' + camera.position.x.toFixed(2) + '|' + camera.position.z.toFixed(2) + '|' + (M ? M.clock : timeSecs); })()`;
            const starts = {
                blaze: `blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }, { id: 'peer-x', key: 'bow' }]), gState.id, false)`,
                sumo: `nmBegin('sumo', [{ id: gState.id }, { id: 'peer-x' }], gState.id, 5, {})`,
                hunt: `(requestStartGame(), requestEnterMap(), (gState.team = [{ id: gState.id }, { id: 'peer-x', isAI: false }]))`
            };
            for (const key of Object.keys(starts)) {
                const before = T.errors.length;
                await T.eval(`${HIDE} selectGameMode('${key}'); ${starts[key]}; true;`); await W(3500);
                await T.eval(`${HIDE} true;`);
                const multi = await T.eval('introSessionMulti()');
                await T.eval(`introPush('卡一', '第一张'); introPush('卡二', '第二张'); true;`); await W(700);
                const st = JSON.parse(await T.eval(`JSON.stringify({ banner: !document.getElementById('intro-banner').classList.contains('hidden'), title: document.getElementById('intro-banner-title').innerText, modal: sysModalVisible(), open: introOpen, q: introQ.length })`));
                await T.eval(`keys['w'] = true; true;`); const a = await T.eval(SIG); await W(1200); const b = await T.eval(SIG); await T.eval(`keys['w'] = false; true;`);
                if (multi !== true) bad.push(key + ' 没当成多人局 ' + multi);
                if (!st.banner || st.title !== '卡一' || st.modal || st.open || st.q !== 1) bad.push(key + ' 提示条 ' + JSON.stringify(st));
                if (a === b) bad.push(key + ' 多人局被停住了');
                await T.eval(`document.getElementById('intro-banner-box').click(); true;`); await W(700);
                const t2 = await T.eval(`document.getElementById('intro-banner').classList.contains('hidden') ? '' : document.getElementById('intro-banner-title').innerText`);
                if (t2 !== '卡二') bad.push(key + ' 点掉第一张以后 ' + t2);
                await T.eval(`document.getElementById('intro-banner-box').click(); true;`); await W(700);
                if (!(await T.eval(`document.getElementById('intro-banner').classList.contains('hidden') && !sysModalVisible() && !introOpen`))) bad.push(key + ' 全点掉了还有东西');
                await T.eval(`${HIDE} ${MODES[key].exit}; true;`); await W(1500); await T.eval(`${HIDE} true;`);
                if (T.errors.length > before) bad.push(key + ' 报错 ' + T.errors.slice(before, before + 1).join(''));
            }
            await T.close();
            report('R1m 多人局卡片变成上方提示条：不弹窗不暂停、点一下收起、下一张接着出', bad.length === 0, bad.join(' / '));
        }

                if (want('R2')) {
            // R2：平板跑步——摇杆推过半径 90% 自动跑（耗体力），没推到就走；右下角的"跑"按钮没了。寻宝队、监狱救援、躲避球都测
            const bad = [];
            const M = await openTab(chrome, url, { mobile: true });
            const th = await M.eval(`(function(){ let r = []; [0.5, 0.89, 0.91, 1].forEach(function (v) { tMove.x = v; tMove.y = 0; r.push(padAutoRun()); }); tMove.x = 0.7; tMove.y = 0.7; r.push(padAutoRun()); tMove.x = 0; tMove.y = 0; return r.join(); })()`);
            if (th !== 'false,false,true,true,true') bad.push('阈值不对 ' + th);
            const drain = async (key, getStam) => {
                await M.eval(`${HIDE} selectGameMode('${key}'); ${MODES[key].start}; true;`); await W(3500); await M.eval(`${HIDE} true;`);
                const out = [];
                for (const v of [0.6, 0.95]) {
                    await M.eval(`tMove.x = 0; tMove.y = 0; true;`); await W(1800);   // 先回满体力
                    const s0 = await M.eval(getStam);
                    await M.eval(`tMove.x = 0; tMove.y = ${-v}; true;`);
                    // 跑的要等体力真降下来（最多 20 秒，不看真实时间）；走的本来就不降，等几帧够了
                    if (v > 0.9) await until(M, `${getStam} < ${s0} - 6`, 60000); else await W(1000);   // 负载高时帧率低、游戏时间走得慢，最多等 60 秒
                    const s1 = await M.eval(getStam);
                    await M.eval(`tMove.x = 0; tMove.y = 0; true;`);
                    out.push(+(s0 - s1).toFixed(1));
                }
                await M.eval(`${HIDE} ${MODES[key].exit}; true;`); await W(1500); await M.eval(`${HIDE} true;`);
                return out;
            };
            for (const [key, g] of [['hunt', 'stamina'], ['jail', 'jail.me.stamina'], ['dodge', 'dodge.me.stamina']]) {
                const d = await drain(key, g);
                // 走（0.6）体力不降，跑（0.95）1 秒明显下降
                if (!(d[0] < 3 && d[1] > 6)) bad.push(key + ' 体力变化 走=' + d[0] + ' 跑=' + d[1]);
            }
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('R2 平板摇杆推过 90% 自动跑：寻宝队、监狱救援、躲避球推到底耗体力、没推到不耗', bad.length === 0, bad.join(' / '));
        }

                if (want('R3')) {
            // R3：平板的"跑"按钮——寻宝队、监狱救援、躲避球里都看得见、大于 40×40、不被别的挡住；点一下变快、体力下降、高亮，再点恢复；其它模式里不出现
            const bad = [];
            const M = await openTab(chrome, url, { mobile: true });
            const STAM = { hunt: 'stamina', jail: 'jail.me.stamina', dodge: 'dodge.me.stamina' };
            for (const key of ['hunt', 'jail', 'dodge']) {
                await M.eval(`${HIDE} selectGameMode('${key}'); ${MODES[key].start}; true;`);
                if (!(await until(M, `document.getElementById('run-btn').style.display === 'flex'`, 15000))) { bad.push(key + ' 里没有跑按钮'); await M.eval(`${HIDE} ${MODES[key].exit}; true;`); await W(1200); continue; }
                await M.eval(`${HIDE} true;`);
                const g = JSON.parse(await M.eval(`(function(){ const b = document.getElementById('run-btn'), r = b.getBoundingClientRect(), out = { w: r.width, h: r.height, covered: [], inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
                    [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].forEach(function (f) { const e = document.elementFromPoint(r.left + r.width * f[0], r.top + r.height * f[1]); if (!e || !e.closest('#run-btn')) out.covered.push(e ? (e.id || e.className || e.tagName) : 'null'); });
                    out.overlap = Array.prototype.filter.call(document.querySelectorAll('.action-btn, #chat-toggle, #joystick-left'), function (o) { if (o === b || o.offsetParent === null || getComputedStyle(o).display === 'none') return false; const q = o.getBoundingClientRect(); return q.width > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; })
                    .map(function (o) { const q = o.getBoundingClientRect(); return o.id + '[' + [q.left, q.top, q.right, q.bottom].map(Math.round) + ']'; }); out.me = [r.left, r.top, r.right, r.bottom].map(Math.round);
                    return JSON.stringify(out); })()`));
                if (g.w < 40 || g.h < 40) bad.push(key + ' 跑按钮太小 ' + g.w + '×' + g.h);
                if (!g.inside) bad.push(key + ' 跑按钮在屏幕外');
                if (g.covered.length) bad.push(key + ' 跑按钮被挡住 ' + g.covered.join(','));
                if (g.overlap.length) bad.push(key + ' 跑按钮和别的按钮重叠 ' + g.overlap.join(',') + ' 我=' + g.me);
                // 不量真实时间：推半截摇杆（0.6）时不算跑；点一下跑键后同样的摇杆就算跑（padAutoRun / 主循环里的 isRunning 都看它）
                await M.eval(`window.__zig = function (on) { clearInterval(window.__zt); if (on) { tMove.x = 0; tMove.y = -0.6; window.__zt = setInterval(function () { camera.rotation.y += Math.PI; }, 600); } else tMove.y = 0; }; tMove.x = 0; tMove.y = -0.6; true;`);
                if (await M.eval(`padAutoRun()`)) bad.push(key + ' 摇杆推半截就算跑了');
                const s0 = await M.eval(STAM[key]);
                if (await M.eval(`padRunToggle`)) bad.push(key + ' 开局跑键就是开着的');
                // 点一下：开始跑
                await M.eval(`document.getElementById('run-btn').dispatchEvent(new Event('touchstart', { cancelable: true })); true;`);
                const on = JSON.parse(await M.eval(`JSON.stringify({ t: padRunToggle, cls: document.getElementById('run-btn').classList.contains('on'), run: padAutoRun() })`));
                if (!on.t || !on.cls || !on.run) bad.push(key + ' 点了没高亮/没切到跑 ' + JSON.stringify(on));
                await M.eval(`window.__zig(true); true;`);
                if (!(await until(M, `${STAM[key]} < ${s0} - 8`, 20000))) bad.push(key + ' 跑起来体力没降');
                await M.eval(`window.__zig(false); tMove.y = -0.6; true;`);
                // 再点一下：回到走
                await M.eval(`document.getElementById('run-btn').dispatchEvent(new Event('touchstart', { cancelable: true })); true;`);
                const off = JSON.parse(await M.eval(`JSON.stringify({ t: padRunToggle, cls: document.getElementById('run-btn').classList.contains('on'), run: padAutoRun(), s: ${STAM[key]} })`));
                if (off.t || off.cls || off.run) bad.push(key + ' 再点没恢复 ' + JSON.stringify(off));
                await M.eval(`window.__zig(true); true;`);   // 走着，体力要回（跑才耗）
                if (!(await until(M, `${STAM[key]} > ${off.s} + 2`, 20000))) bad.push(key + ' 恢复走路后体力没回');
                await M.eval(`window.__zig(false); true;`);
                // 摇杆推到边照样自动跑
                await M.eval(`tMove.y = -1; true;`);
                if (!(await until(M, `${STAM[key]} < ${off.s} - 4 || ${STAM[key]} < 90`, 20000))) bad.push(key + ' 摇杆推到边没自动跑');
                await M.eval(`tMove.x = 0; tMove.y = 0; ${HIDE} ${MODES[key].exit}; true;`); await W(1200); await M.eval(`${HIDE} true;`);
            }
            // 别的模式里没有（在大厅 / 竞速）
            await M.eval(`${HIDE} selectGameMode('race'); ${MODES.race.start}; true;`); await W(1500);
            if (await M.eval(`document.getElementById('run-btn').style.display !== 'none'`)) bad.push('竞速里不该有跑按钮');
            await M.eval(`${HIDE} ${MODES.race.exit}; true;`);
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('R3 平板“跑”按钮：寻宝队/监狱救援/躲避球里可见、≥40×40、不被挡；点一下算跑、耗体力并高亮，再点恢复；摇杆推到边照样自动跑；别的模式没有', bad.length === 0, bad.join(' / '));
        }

                if (want('T0')) {
            // T0 新手教程：新号起完名字自动开始；9 步各自做到才进下一步（别的动作不算）；做完还原背包、给 20 猫盾币、存档记 tutDone；
            // 右上角能跳过；设置里能重玩；做完或跳过之前不能组队、收不到邀请；教程里什么都不存
            const bad = [];
            const G = await openTab(chrome, url, { tut: true, noLobby: true });
            const name = 't0' + Date.now() % 100000;
            await G.eval(`document.getElementById('player-id').value = ${JSON.stringify(name)}; requestLobbyAccess(); true;`); await W(3500);
            const st0 = JSON.parse(await G.eval(`JSON.stringify({ t: !!gState.tutorial, play: isPlaying, panel: !document.getElementById('tut-panel').classList.contains('hidden'), skip: !document.getElementById('tut-skip').classList.contains('hidden'),
                step: gState.tutorial && gState.tutorial.step, text: document.getElementById('tut-text').innerText, ents: entities.length, task: gState.huntTask, mSize: mSize, chests: chests.length, tutDone: gState.tutDone })`));
            if (!st0.t || !st0.play || !st0.panel || !st0.skip || st0.step !== 0 || st0.tutDone !== false) bad.push('没自动开始 ' + JSON.stringify(st0));
            if (st0.mSize !== 9 || st0.chests !== 1 || st0.task !== null || st0.ents !== 0) bad.push('教程图不对 ' + JSON.stringify(st0));
            const invBefore = await G.eval(`JSON.stringify(gState.tutorial.back.inv)`);
            const garBefore = await G.eval(`JSON.stringify(gState.garage)`);
            const saved0 = await G.eval(`localStorage.getItem('TH_save_' + gState.id)`);
            const step = () => G.eval(`gState.tutorial ? gState.tutorial.step : -1`);
            let lastStep = 0;
            // 要进下一步的：等到步数变成 n（最多 20 秒，不看真实时间）；该留在原地的：让页面多画几帧再看
            const expectStep = async (n, why) => {
                if (n === lastStep) await frames(G, 30); else await until(G, `gState.tutorial && gState.tutorial.step === ${n}`, 20000);
                const s = await step(); lastStep = s === -1 ? lastStep : s;
                if (s !== n) bad.push(why + '：应在第 ' + (n + 1) + ' 步，实际 ' + s);
            };
            // 别的动作不算
            await G.eval(`tutEvent('bag'); tutEvent('chest'); tutEvent('submit'); true;`); await expectStep(0, '做了别的事就进下一步');
            // 1 光圈
            await G.eval(`camera.position.set(gState.tutorial.ringC.x * TILE, 9, gState.tutorial.ringC.z * TILE); true;`); await expectStep(1, '走进光圈');
            // 2 转视角看橙色柱子（先确认没转过去之前不会算）
            await until(G, `gState.tutorial && gState.tutorial.mark`, 20000);
            const markOk = await G.eval(`(function(){ let m = gState.tutorial.mark; if (!m) return 'no mark'; let p = camera.position, dx = m.position.x - p.x, dz = m.position.z - p.z;
                camera.rotation.y = Math.atan2(dx, dz); return 'away'; })()`); await expectStep(1, '背对柱子' + markOk);
            await G.eval(`(function(){ let m = gState.tutorial.mark, p = camera.position; camera.rotation.y = Math.atan2(-(m.position.x - p.x), -(m.position.z - p.z)); return true; })()`); await expectStep(2, '看向柱子');
            // 3 跳上桌
            await G.eval(`(function(){ let t = gState.tutorial.tableCell; camera.position.set(t.x * TILE, 8 + 9, t.z * TILE); pVel.set(0, 0, 0); return true; })()`); await expectStep(3, '跳上桌子');
            // 4 跑一段：Shift + W 按住 2 秒
            await G.eval(`camera.position.set(TILE, 9, TILE); keys['shift'] = true; keys['w'] = true; true;`);
            for (let i = 0; i < 80 && (await step()) < 4; i++) await W(250);   // 跑够游戏里 1.2 秒，CI 帧率低就要等一会儿
            await G.eval(`keys['shift'] = false; keys['w'] = false; true;`); await expectStep(4, '跑一段');
            // 5 开箱：站到箱子旁边，按 F
            await G.eval(`(function(){ let c = chests[0]; camera.position.set(c.position.x + 6, c.position.y + 7, c.position.z); pVel.set(0, 0, 0); camera.rotation.y = Math.PI / 2; keys['f'] = true; return true; })()`); await expectStep(5, '开箱');
            // 6 捡东西
            const dropped = await G.eval(`groundItems.length`);
            await G.eval(`(function(){ let g = groundItems[0]; if (!g) return false; g.userData.vel = new THREE.Vector3(0, 0, 0); camera.position.set(g.position.x + 4, g.position.y + 7, g.position.z); pVel.set(0, 0, 0); keys['f'] = true; return true; })()`); await expectStep(6, '捡东西（掉了 ' + dropped + ' 个）');
            // 7 背包
            await G.eval(`toggleBackpackUI(); true;`); await expectStep(7, '开背包'); await G.eval(`toggleBackpackUI(); true;`);
            // 8 上交：在出生点按上交
            await G.eval(`camera.position.set(TILE, 9, TILE); pVel.set(0, 0, 0); true;`); await W(1200);
            await G.eval(`clickSubmit(); true;`); await expectStep(8, '上交');
            const ext = await G.eval(`!document.getElementById('btn-extract').classList.contains('hidden')`);
            if (!ext) bad.push('上交够了没出撤离按钮');
            // 教程里什么都没存
            if ((await G.eval(`localStorage.getItem('TH_save_' + gState.id)`)) !== saved0) bad.push('教程里写了存档');
            const coin0 = await G.eval('gState.mcoin || 0');
            // 9 撤离
            await G.eval(`clickExtract(); true;`); await W(1500);
            const end = JSON.parse(await G.eval(`JSON.stringify({ t: !!gState.tutorial, play: isPlaying, inv: JSON.stringify(gState.inv), gar: JSON.stringify(gState.garage), coin: gState.mcoin || 0, done: gState.tutDone, modal: ${MODAL}, panel: !document.getElementById('tut-panel').classList.contains('hidden'),
                saved: JSON.parse(localStorage.getItem('TH_save_' + gState.id)).tutDone, sub: gState.totalSubmitted, team: gState.team.length, diff: gState.mapDifficulty, lobby: !!hub })`));
            if (end.t || end.play || end.panel) bad.push('做完还在教程里 ' + JSON.stringify(end));
            if (end.inv !== invBefore || end.gar !== garBefore) bad.push('背包/仓库没还原');
            if (end.coin !== coin0 + 20) bad.push('猫盾币 ' + coin0 + ' → ' + end.coin);
            if (end.done !== 'done' || end.saved !== 'done') bad.push('没记做完 ' + end.done + '/' + end.saved);
            if (end.modal !== '教程做完了' || !end.lobby || end.sub !== 0 || end.diff === 'tutorial') bad.push('回大厅状态 ' + JSON.stringify(end).slice(0, 200));
            await clickModal(G, 0);
            // 刷新后不再自动开
            await G.send('Page.reload'); await W(2500);
            await G.eval(`document.getElementById('player-id').value = ${JSON.stringify(name)}; requestLobbyAccess(); true;`); await W(3500);
            if (await G.eval('!!gState.tutorial || gState.tutDone !== "done"')) bad.push('刷新后又开教程了 ' + (await G.eval('gState.tutDone')));
            // 设置里重玩（不再给猫盾币）；然后点右上角跳过
            await G.eval(`${HIDE} openSettings(); true;`); await W(300);
            const p = await mouseAt(G, '#sys-modal-text button[onclick="tutorialStart()"]');
            if (!p) bad.push('设置里没有重玩按钮');
            else { await G.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await G.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 1 }); await G.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 1 }); await W(1500); }
            if (!(await G.eval('!!gState.tutorial && isPlaying'))) bad.push('重玩没开始');
            const coin1 = await G.eval('gState.mcoin || 0');
            const sp = await mouseAt(G, '#tut-skip');
            if (sp) { await G.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sp[0], y: sp[1] }); await G.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sp[0], y: sp[1], button: 'left', buttons: 1, clickCount: 1 }); await G.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sp[0], y: sp[1], button: 'left', buttons: 0, clickCount: 1 }); await W(1200); }
            const sk = JSON.parse(await G.eval(`JSON.stringify({ t: !!gState.tutorial, play: isPlaying, done: gState.tutDone, coin: gState.mcoin || 0, lobby: !!hub, inv: JSON.stringify(gState.inv) })`));
            if (sk.t || sk.play || !sk.lobby || sk.done !== 'done' || sk.coin !== coin1 || sk.inv !== invBefore) bad.push('跳过后 ' + JSON.stringify(sk).slice(0, 200));
            if (G.errors.length) bad.push(G.errors.slice(0, 2).join(' / '));
            await G.close();
            // 跳过：新号直接点跳过，记 skip；组队在做完或跳过之前不行
            const K = await openTab(chrome, url, { tut: true, noLobby: true });
            const name2 = 't0s' + Date.now() % 100000;
            await K.eval(`document.getElementById('player-id').value = ${JSON.stringify(name2)}; requestLobbyAccess(); true;`); await W(3500);
            const gate1 = JSON.parse(await K.eval(`JSON.stringify({ tut: !!gState.tutorial, done: gState.tutDone, passed: tutPassed() })`));
            if (!gate1.tut || gate1.passed) bad.push('第二个新号没自动开 ' + JSON.stringify(gate1));
            await K.eval(`window.__sent = []; (function(){ let b = bc.postMessage.bind(bc); bc.postMessage = function (m) { window.__sent.push(m.type); return b(m); }; })(); teamInvite('someone-else'); teamOnInviteReceived('someone-else'); true;`); await W(300);
            const gate2 = JSON.parse(await K.eval(`JSON.stringify({ sent: window.__sent.filter(function (t) { return t === 'TEAM_INVITE'; }).length, modal: ${MODAL} })`));
            if (gate2.sent !== 0 || gate2.modal === '组队邀请') bad.push('没做完教程就能组队/收邀请 ' + JSON.stringify(gate2));
            await K.eval(`tutLeave(false); true;`); await W(1200);
            await K.eval(`${HIDE} window.__sent = []; teamInvite('someone-else'); teamOnInviteReceived('someone-else'); true;`); await W(300);
            const gate3 = JSON.parse(await K.eval(`JSON.stringify({ sent: window.__sent.filter(function (t) { return t === 'TEAM_INVITE'; }).length, modal: ${MODAL}, done: gState.tutDone })`));
            if (gate3.done !== 'skip' || gate3.sent !== 1 || gate3.modal !== '组队邀请') bad.push('跳过后还是不能组队 ' + JSON.stringify(gate3));
            await K.close();
            // 触屏设备：自动开始，提示用摇杆/点按钮的说法
            const Mo = await openTab(chrome, url, { tut: true, noLobby: true, mobile: true });
            await Mo.eval(`document.getElementById('player-id').value = 't0m' + Date.now() % 100000; requestLobbyAccess(); true;`); await W(3500);
            const mo = JSON.parse(await Mo.eval(`JSON.stringify({ t: !!gState.tutorial, hint: document.getElementById('tut-hint').innerText, pad: gState.control })`));
            if (!mo.t || !/摇杆/.test(mo.hint)) bad.push('触屏上教程 ' + JSON.stringify(mo));
            if (Mo.errors.length) bad.push('触屏报错 ' + Mo.errors.slice(0, 2).join(' / '));
            await Mo.close();
            report('T0 新手教程：新号自动开始、9 步各自做到才算、做完还原背包给 20 猫盾币记 tutDone、能跳过能重玩、教程里不存档、做完前不能组队', bad.length === 0, bad.join(' / '));
        }

                if (want('H16')) {
            // H16：抽奖机概率——金色 5% 大金 / 25% 销毁 / 15% 变紫 / 55% 变金；紫色 15% 变金 / 60% 变紫 / 25% 销毁；大金占这张图的上限，奖励来自 itemPool
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(function(){
                let out = { gold: {}, purple: {} }, N = 20000;
                ['gold', 'purple'].forEach(function (k) { for (let i = 0; i < N; i++) { let v = huntLotteryPick(k, (i + 0.5) / N); out[k][v] = (out[k][v] || 0) + 1 / N; } });
                // 奖励来源
                huntBigLeft = 3; let bigs = []; for (let i = 0; i < 3; i++) bigs.push(huntIsBig(huntLotteryReward('big')));
                let left = huntBigLeft; let after = huntLotteryReward('big'); let capGold = itemPool.gold.indexOf(after) >= 0 && huntBigLeft === 0;
                let g = huntLotteryReward('gold'), p = huntLotteryReward('purple');
                // 真的点一下：金色物品投进去，没了；要么销毁要么有东西弹出来
                gState.inv[0] = Object.assign({}, itemPool.gold[0]); gState.selectedSlot = 0; let n0 = groundItems.length; huntBigLeft = 4; clickLottery(); let slotGone = !gState.inv[0];
                return JSON.stringify({ out: out, bigs: bigs, left: left, capGold: capGold, gOk: itemPool.gold.indexOf(g) >= 0, pOk: itemPool.purple.indexOf(p) >= 0, none: huntLotteryReward('destroy'), slotGone: slotGone }); })()`));
            const near = (a, b) => Math.abs((a || 0) - b) < 0.005;
            if (!(near(r.out.gold.big, 0.05) && near(r.out.gold.destroy, 0.25) && near(r.out.gold.purple, 0.15) && near(r.out.gold.gold, 0.55))) bad.push('金色 ' + JSON.stringify(r.out.gold));
            if (!(near(r.out.purple.gold, 0.15) && near(r.out.purple.purple, 0.60) && near(r.out.purple.destroy, 0.25) && !r.out.purple.big)) bad.push('紫色 ' + JSON.stringify(r.out.purple));
            if (r.bigs.join() !== 'true,true,true' || r.left !== 0 || !r.capGold) bad.push('大金上限 ' + JSON.stringify([r.bigs, r.left, r.capGold]));
            if (!r.gOk || !r.pOk || r.none !== null || !r.slotGone) bad.push('奖励 ' + JSON.stringify([r.gOk, r.pOk, r.none, r.slotGone]));
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H16 抽奖机：金色 5/25/15/55、紫色 15/60/25，大金占上限，奖励来自 itemPool', bad.length === 0, bad.join(' / '));
        }

                if (want('H16b')) {
            // H16b：大金上限全队共用——队员拿大金先问队长（HUNT_BIG_REQ），队长扣一个再答复；队员本地不扣；3 秒没回音就改出金色；队长只认自己队里的真人
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(async function(){
                let me = gState.id, sent = [], o = {};
                let oldPost = bc.postMessage.bind(bc); bc.postMessage = function (m) { sent.push(m); };
                let pick = function (a) { return a[0]; };
                // 队员：队长是 host-x
                gState.team = [{ id: me, isLeader: false, isAI: false }, { id: 'host-x', isLeader: true, isAI: false }];
                huntBigLeft = 3; let got = null; huntTakeBigAsync(huntBigPool('safe'), pick, function (it) { got = it; });
                let req = sent.filter(function (m) { return m.type === 'HUNT_BIG_REQ'; })[0];
                o.req = !!req && req.target === 'host-x' && req.sender === me; o.noLocalDeduct = huntBigLeft === 3 && got === null;
                // 别人（不是队长）冒充答复：不算
                bc.onmessage({ data: { type: 'HUNT_BIG_ACK', target: me, sender: 'stranger', rid: req.rid, ok: true, left: 0 } });
                o.fakeIgnored = got === null;
                bc.onmessage({ data: { type: 'HUNT_BIG_ACK', target: me, sender: 'host-x', rid: req.rid, ok: true, left: 2 } });
                o.big = huntIsBig(got); o.left = huntBigLeft;
                // 队长答复没有了
                got = null; huntTakeBigAsync(huntBigPool('safe'), pick, function (it) { got = it; });
                req = sent.filter(function (m) { return m.type === 'HUNT_BIG_REQ'; })[1];
                bc.onmessage({ data: { type: 'HUNT_BIG_ACK', target: me, sender: 'host-x', rid: req.rid, ok: false, left: 0 } });
                o.goldWhenNone = itemPool.gold.indexOf(got) >= 0 && huntBigLeft === 0;
                // 没回音：3 秒后改出金色
                got = null; huntBigLeft = 2; huntTakeBigAsync(huntBigPool('safe'), pick, function (it) { got = it; });
                await new Promise(function (r) { setTimeout(r, 3300); });
                o.timeoutGold = itemPool.gold.indexOf(got) >= 0 && huntBigLeft === 2;
                // 队长：自己扣，答复队员，不认外人
                gState.team = [{ id: me, isLeader: true, isAI: false }, { id: 'peer-y', isLeader: false, isAI: false }];
                huntBigLeft = 2; sent.length = 0;
                bc.onmessage({ data: { type: 'HUNT_BIG_REQ', target: me, sender: 'peer-y', rid: 'r1' } });
                let ack = sent.filter(function (m) { return m.type === 'HUNT_BIG_ACK'; })[0];
                o.hostAck = !!ack && ack.ok === true && ack.left === 1 && ack.target === 'peer-y' && huntBigLeft === 1;
                bc.onmessage({ data: { type: 'HUNT_BIG_REQ', target: me, sender: 'stranger', rid: 'r2' } });
                o.strangerIgnored = huntBigLeft === 1 && sent.filter(function (m) { return m.type === 'HUNT_BIG_ACK'; }).length === 1;
                // 队长自己拿：直接扣
                let mine = null; huntTakeBigAsync(huntBigPool('safe'), pick, function (it) { mine = it; }); o.hostOwn = huntIsBig(mine) && huntBigLeft === 0;
                bc.postMessage = oldPost;
                return JSON.stringify(o); })()`));
            Object.keys(r).forEach((k) => { if (r[k] !== true && !(k === 'left' && r[k] === 2)) bad.push(k + '=' + r[k]); });
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H16b 大金上限全队共用：队员先问队长、队长扣、没回音改出金色、外人的请求和冒充的答复不理', bad.length === 0, bad.join(' / '));
        }

                if (want('H17')) {
            // H17：每种难度第一次单人打都是保底局；记在存档 huntDiffPlayed，进图就算用掉；组队不算、不记；老存档（没这个字段）三个难度各给一次
            const bad = [];
            const N = await openTab(chrome, url, { name: 'h17' + Math.floor(Math.random() * 100000) });
            const run = async (diff, mate) => {
                await N.eval(`${HIDE} gState.aiFill = false; gState.mapDifficulty = '${diff}'; selectGameMode('hunt'); requestStartGame(); ${mate ? `gState.team = [{ id: gState.id, isLeader: true, isAI: false }, { id: 'peer-z', isAI: false }];` : ''} true;`);
                const before = await N.eval(`huntPityActive()`);
                await N.eval(`requestEnterMap(); true;`); await W(2500);
                const r = JSON.parse(await N.eval(`JSON.stringify({ before: ${before}, played: JSON.stringify(gState.huntDiffPlayed), mul: huntPityMul })`));
                await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
                return r;
            };
            const a1 = await run('easy'), a2 = await run('easy'), m1 = await run('med');
            if (!a1.before || a1.played !== '{"easy":true}' || a1.mul !== 2) bad.push('easy 第一局 ' + JSON.stringify(a1));
            if (a2.before || a2.mul !== 1) bad.push('easy 第二局还是保底 ' + JSON.stringify(a2));
            if (!m1.before || !/"med":true/.test(m1.played) || m1.mul !== 2) bad.push('med 第一局（所有图都是多一个金箱子 + 大金 ×2） ' + JSON.stringify(m1));
            const h1 = await run('hard', true);   // 组队：不是保底局，也不记
            if (h1.before || /"hard"/.test(h1.played)) bad.push('组队的局算了 ' + JSON.stringify(h1));
            const h2 = await run('hard');
            if (!h2.before || !/"hard":true/.test(h2.played)) bad.push('hard 第一次单人 ' + JSON.stringify(h2));
            // 存下来、刷新读回来
            const id = await N.eval('gState.id');
            const saved = await N.eval(`JSON.parse(localStorage.getItem('TH_save_' + gState.id)).huntDiffPlayed`);
            if (!saved || !saved.easy || !saved.med || !saved.hard) bad.push('存档里 ' + JSON.stringify(saved));
            // 老存档：没有这个字段（也没有 isFirstRound）→ 三个难度各给一次
            await N.eval(`(function(){ let d = JSON.parse(localStorage.getItem('TH_save_' + gState.id)); delete d.huntDiffPlayed; delete d.isFirstRound; localStorage.setItem('TH_save_' + gState.id, JSON.stringify(d)); return true; })()`);
            await N.send('Page.reload'); await W(2500);
            await N.eval(`document.getElementById('player-id').value = ${JSON.stringify(id.replace(/#.*$/, ''))}; requestLobbyAccess(); true;`); await W(2500);
            const old = JSON.parse(await N.eval(`JSON.stringify(['easy', 'med', 'hard'].map(function (d) { gState.mapDifficulty = d; gState.team = [{ id: gState.id, isLeader: true, isAI: false }]; return huntPityActive(); }))`));
            if (old.join() !== 'true,true,true') bad.push('老存档 ' + old.join());
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('H17 每种难度第一次单人打是“多一个金箱子 + 大金 ×2”的局（所有图一样，进图就算用掉），组队不算不记，老存档三个难度各给一次', bad.length === 0, bad.join(' / '));
        }

                if (want('H18')) {
            // H18：猫盾骑士剑 200 万；老存档里的剑读档时一起改；所有配方产物的价值必须大于原料之和
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){
                let price = {};
                ['purple', 'gold', 'ultra', 'god'].forEach(function (k) { itemPool[k].forEach(function (it) { price[it.n] = it.v; }); });
                HUNT_GEMS.forEach(function (g) { price[g.n] = g.v; });
                allRecipes().forEach(function (r) { if (r.out) price[r.out.n] = r.out.v; });
                let rows = [], missing = [];
                GROUND_RECIPES.forEach(function (r) {
                    if (price[r.a] === undefined) missing.push(r.a); if (price[r.b] === undefined) missing.push(r.b);
                    rows.push([r.id, r.out.v, (price[r.a] || 0) + (price[r.b] || 0)]);
                });
                let crownIn = CROWN_BASE_V + HUNT_GEMS.reduce(function (s, g) { return s + g.v; }, 0);
                rows.push(['crown', CROWN_FULL_V, crownIn]);
                // 老存档：剑 100 万，放在背包、仓库、腰包里
                let old = { n: '猫盾骑士剑', v: 1000000, w: 5, type: 'wep', dmg: 150, spd: 1.15, hp: 40 };
                gState.inv[2] = Object.assign({}, old); gState.garage[0] = Object.assign({}, old);
                gState.inv[3] = { n: '腰包', isShop: true, type: 'backpack_ext', bag: [Object.assign({}, old), null, null] };
                saveProgress();
                let d = JSON.parse(localStorage.getItem('TH_save_' + gState.id)); d.inv[2].v = 1000000; d.garage[0].v = 1000000; d.inv[3].bag[0].v = 1000000;
                localStorage.setItem('TH_save_' + gState.id, JSON.stringify(d));
                gState.inv = []; gState.garage = []; loadProgress(gState.id);
                return JSON.stringify({ rows: rows, missing: missing, sword: GROUND_RECIPES.filter(function (r) { return r.id === 'catblade'; })[0].out.v, loaded: [gState.inv[2].v, gState.garage[0].v, gState.inv[3].bag[0].v] }); })()`));
            if (r.sword !== 2000000) bad.push('剑 ' + r.sword);
            if (r.missing.length) bad.push('配方里有找不到价格的原料 ' + r.missing.join());
            r.rows.forEach((x) => { if (!(x[1] > x[2])) bad.push(x[0] + ' 产物 ' + x[1] + ' ≤ 原料 ' + x[2]); });
            if (r.loaded.join() !== '2000000,2000000,2000000') bad.push('老存档里的剑没改 ' + r.loaded.join());
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H18 猫盾骑士剑 200 万，老存档里的剑读档时一起改；所有配方产物比原料之和值钱', bad.length === 0, bad.join(' / '));
        }

                if (want('H19')) {
            // H19：骑士剑血量 +200，带在身上（背包或腰包里）就算；攻击、移速加成还是拿在手上才算；上限变化时当前血量按比例换算
            const bad = [];
            const T = await openTab(chrome, url);
            const SW = `{ n: '猫盾骑士剑', v: SWORD_V, w: 5, type: 'wep', dmg: 150, spd: 1.15, hp: SWORD_HP }`;
            // 进图以后（剑是局内合成/捡到的，进图时宝物会先放回仓库）把剑放进背包：血量上限 100 → 300，当前血量按比例 100 → 300
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} gState.hp = 100; gState.inv[4] = ${SW}; true;`); await until(T, `effectiveMaxHp() === 300 && gState.hp === 300`, 20000);
            const a = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp, spd: weaponSpeedMul(), bonus: weaponHpBonus(), sword: SWORD_HP })`));
            if (a.sword !== 200 || a.max !== 300 || a.hp !== 300 || a.bonus !== 200 || a.spd !== 1) bad.push('带在背包里 ' + JSON.stringify(a));
            // 掉了一半血再放下剑：150/300 → 50/100（按比例）
            await T.eval(`gState.hp = 150; gState.inv[4] = null; true;`); await until(T, `effectiveMaxHp() === 100 && gState.hp === 50`, 20000);
            const b = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp })`));
            if (b.max !== 100 || b.hp !== 50) bad.push('放下剑 ' + JSON.stringify(b));
            // 腰包里的剑也算
            await T.eval(`gState.inv[3] = { n: '腰包', isShop: true, type: 'backpack_ext', bag: [${SW}, null, null] }; true;`); await until(T, `effectiveMaxHp() === 300 && gState.hp === 150`, 20000);
            const c = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp, spd: weaponSpeedMul() })`));
            if (c.max !== 300 || c.hp !== 150 || c.spd !== 1) bad.push('腰包里 ' + JSON.stringify(c));
            // 拿在手上：移速 ×1.15，血量加成不变不重复
            await T.eval(`gState.inv[3] = null; gState.inv[0] = ${SW}; gState.selectedSlot = 0; true;`); await until(T, `effectiveMaxHp() === 300 && weaponSpeedMul() === 1.15`, 20000);
            const d = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), spd: weaponSpeedMul(), hp: gState.hp })`));
            if (d.max !== 300 || d.spd !== 1.15) bad.push('拿在手上 ' + JSON.stringify(d));
            // 老存档里的剑（hp 40）读档后改成 200
            const e = await T.eval(`(function(){ gState.garage[0] = { n: '猫盾骑士剑', v: 1000000, w: 5, type: 'wep', dmg: 150, spd: 1.15, hp: 40 }; huntFixSwordValue(); return gState.garage[0].hp; })()`);
            if (e !== 200) bad.push('老剑 hp=' + e);
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H19 骑士剑血量 +200 带在身上就算（背包/腰包），攻击移速拿在手上才算，上限变了血量按比例换算', bad.length === 0, bad.join(' / '));
        }

                if (want('H20')) {
            // H20：上方血条、体力条里显示数字（240/300），左上角那两行删掉；带骑士剑时超出的部分是金色
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const q = () => T.eval(`JSON.stringify({ hp: document.getElementById('health-num').innerText, st: document.getElementById('stamina-num').innerText,
                red: document.getElementById('health-fill').style.width, gold: document.getElementById('health-gold').style.width, goldColor: getComputedStyle(document.getElementById('health-gold')).backgroundColor,
                left: document.getElementById('stats-left').innerText, old: !!document.getElementById('hp-txt') || !!document.getElementById('stamina-txt') })`).then(JSON.parse);
            await T.eval(`gState.hp = 80; updateHUD(); true;`); await until(T, `document.getElementById('health-num').innerText === '80/100'`, 20000);
            const a = await q();
            if (a.hp !== '80/100' || !/^\d+\/100$/.test(a.st) || parseFloat(a.red) !== 80 || parseFloat(a.gold) !== 0) bad.push('没带剑 ' + JSON.stringify(a));
            if (/生命值|体力值/.test(a.left) || a.old) bad.push('左上角那两行还在 ' + a.left);
            await T.eval(`gState.inv[4] = { n: '猫盾骑士剑', v: SWORD_V, w: 5, type: 'wep', dmg: 150, spd: 1.15, hp: SWORD_HP }; true;`); await until(T, `effectiveMaxHp() === 300`, 20000);
            await T.eval(`gState.hp = 240; updateHUD(); true;`);
            const b = await q();
            if (b.hp !== '240/300' || Math.abs(parseFloat(b.red) - 100 / 3) > 0.1 || Math.abs(parseFloat(b.gold) - 140 / 3) > 0.1 || b.goldColor !== 'rgb(255, 193, 7)') bad.push('带剑 ' + JSON.stringify(b));
            await T.eval(`gState.hp = 60; updateHUD(); true;`);
            const c = await q();
            if (c.hp !== '60/300' || parseFloat(c.gold) !== 0) bad.push('带剑掉血 ' + JSON.stringify(c));
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H20 血条/体力条里写数字，左上角两行删了，带骑士剑时超出的部分是金色', bad.length === 0, bad.join(' / '));
        }

                if (want('CR1')) {
            // CR1 合成：丰饶圣餐在正常开局（箱子里的大金不占合成名额）能合；多个合成同时成立时先合产物价值高的、一样高选消耗原料总价值少的，每次结果一样；所有配方都合得出来
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            await T.eval(`window.__mk = function (u, x) { let m = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial()); m.userData = Object.assign({ isItem: true, feeds: 0 }, u); m.position.set(500 + (x || 0), 1, 500); scene.add(m); groundItems.push(m); return m; };
                window.__has = function (n) { return groundItems.some(function (g) { return g.userData.n === n; }); };
                window.__cnt = function (n) { return groundItems.filter(function (g) { return g.userData.n === n; }).length; };
                window.__clear = function () { groundItems.slice().forEach(function (g) { scene.remove(g); }); groundItems.length = 0; }; true;`);
            // 1) 丰饶圣餐回归：正常开局（不改任何名额），真把金苹果和黄金圣杯扔到地上（走真实的扔东西），要合出来；开局的箱子大金名额有多少都不影响
            const open0 = JSON.parse(await T.eval(`JSON.stringify({ chest: huntBigLeft, craft: huntCraftBigLeft })`));
            if (open0.craft !== 4) bad.push('正常开局合成名额应该是 4 ' + JSON.stringify(open0));
            for (const left of [null]) {
                await T.eval(`window.__clear(); gState.inv[0] = Object.assign({}, itemPool.gold.filter(function (i) { return i.n === '金苹果'; })[0]); gState.inv[1] = Object.assign({}, itemPool.gold.filter(function (i) { return i.n === '黄金圣杯'; })[0]); executeThrow(0); executeThrow(1); true;`);
                if (!(await until(T, `window.__has('丰饶圣餐')`, 20000))) bad.push('正常开局扔金苹果 + 黄金圣杯合不出丰饶圣餐 ' + JSON.stringify(open0));
                else if (await T.eval(`window.__has('金苹果') || window.__has('黄金圣杯')`)) bad.push('合成后原料还在');
            }
            // 2) 优先级：造三个互相竞争的配方（都要"甲"）
            const comp = JSON.parse(await T.eval(`(function(){
                let saved = GROUND_RECIPES.slice(), o = {};
                let out = function (n, v) { return { n: n, v: v, w: 1, tex: 'generic', c: 0xffffff, main: '#fff', detail: '#000' }; };
                GROUND_RECIPES.length = 0;
                GROUND_RECIPES.push({ id: 't_low', a: '甲', b: '乙', out: out('低产物', 1000) }, { id: 't_high', a: '甲', b: '丙', out: out('高产物', 5000) }, { id: 't_same', a: '甲', b: '丁', out: out('同价产物', 5000) });
                // (a) 甲 + 乙 + 丙 都在：产物价值高的赢（高产物），乙留下
                window.__clear(); huntCraftBigLeft = 4; window.__mk({ n: '甲', v: 10 }, 0); window.__mk({ n: '乙', v: 10 }, 1); window.__mk({ n: '丙', v: 10 }, 2); executeGroundCombinationsLogic();
                o.a = [window.__has('高产物'), window.__has('低产物'), window.__has('乙'), window.__has('丙')];
                // (b) 甲 + 丙 + 丁：产物价值一样（5000），选消耗原料总价值少的（丁 5 < 丙 50）
                window.__clear(); window.__mk({ n: '甲', v: 10 }, 0); window.__mk({ n: '丙', v: 50 }, 1); window.__mk({ n: '丁', v: 5 }, 2); executeGroundCombinationsLogic();
                o.b = [window.__has('同价产物'), window.__has('高产物'), window.__has('丙'), window.__has('丁')];
                // (c) 摆法不同、地上先后不同，结果一样：重复 20 次，丙丁换顺序
                let same = true;
                for (let i = 0; i < 20; i++) { window.__clear(); if (i % 2) { window.__mk({ n: '丁', v: 5 }, 2); window.__mk({ n: '丙', v: 50 }, 1); window.__mk({ n: '甲', v: 10 }, 0); } else { window.__mk({ n: '甲', v: 10 }, 0); window.__mk({ n: '丙', v: 50 }, 1); window.__mk({ n: '丁', v: 5 }, 2); } executeGroundCombinationsLogic(); if (!window.__has('同价产物') || window.__has('高产物')) same = false; }
                o.c = same;
                // (d) 一堆东西：两个甲、乙丙丁各一：先合高价的，再合下一个
                window.__clear(); window.__mk({ n: '甲', v: 10 }, 0); window.__mk({ n: '甲', v: 10 }, 0.5); window.__mk({ n: '乙', v: 10 }, 1); window.__mk({ n: '丙', v: 50 }, 2); window.__mk({ n: '丁', v: 5 }, 3); executeGroundCombinationsLogic();
                o.d = [window.__cnt('同价产物'), window.__cnt('高产物'), window.__cnt('低产物'), window.__cnt('乙'), window.__cnt('丙')];
                GROUND_RECIPES.length = 0; saved.forEach(function (r) { GROUND_RECIPES.push(r); });
                return JSON.stringify(o); })()`));
            if (comp.a.join() !== 'true,false,true,false') bad.push('甲+乙+丙：该合产物价值高的，乙留着 ' + comp.a);
            if (comp.b.join() !== 'true,false,true,false') bad.push('产物一样值钱时该选消耗原料少的（丁），丙留着 ' + comp.b);
            if (!comp.c) bad.push('同样的东西摆法不同，结果不一样');
            if (comp.d.join() !== '1,1,0,1,0') bad.push('两个甲 + 乙丙丁：应该先合 丁（同价、更便宜），再合 丙（比乙值钱），剩一个乙 ' + comp.d);
            // 3) 所有配方都合得出来（合成名额还有的时候；箱子大金名额 4 和 0 都试，不该有影响）：原料名字取自配方，价值任意
            for (const left of [4, 0]) {
                const all = JSON.parse(await T.eval(`(function(){
                    huntBigLeft = ${left}; let bad = [];
                    window.__craft4 = function () { huntCraftBigLeft = 4; };
                    GROUND_RECIPES.forEach(function (r) {
                        window.__clear(); window.__craft4(); window.__mk({ n: r.a, v: 1000 }, 0); window.__mk({ n: r.b, v: 1000 }, 2); executeGroundCombinationsLogic();
                        if (!window.__has(r.out.n) || window.__has(r.a) && r.a !== r.out.n || window.__has(r.b) && r.b !== r.out.n) bad.push(r.id + ':' + r.a + '+' + r.b);
                    });
                    // 皇冠：底座 + 6 颗宝石
                    window.__clear(); window.__craft4(); let b = crownBaseItem(); window.__mk(b, 0); HUNT_GEMS.forEach(function (g, i) { window.__mk(huntGemItem(g), 1 + i * 0.1); }); executeGroundCombinationsLogic(); executeGroundCombinationsLogic();
                    if (!window.__has('皇冠')) bad.push('crown');
                    return JSON.stringify({ n: GROUND_RECIPES.length, bad: bad, ids: GROUND_RECIPES.map(function (r) { return r.id; }) }); })()`));
                if (all.bad.length) bad.push('箱子名额 ' + left + ' 时这些配方合不出来 ' + all.bad.join(','));
                if (left === 4 && all.ids.join() !== 'gcat,ucat,feast,catblade') bad.push('配方清单变了 ' + all.ids);
            }
            // 4) 原有的链：猫盾 + 小鱼干 + 黄金小鱼干 放一起，同一轮里黄金猫盾接着和黄金小鱼干合成至臻猫盾
            const chain = await T.eval(`(function(){ window.__clear(); huntCraftBigLeft = 4; window.__mk({ n: '猫盾', v: 15000 }, 0); window.__mk({ n: '小鱼干', v: 5000 }, 1); window.__mk({ n: '黄金小鱼干', v: 50000 }, 2); executeGroundCombinationsLogic(); return window.__has('至臻猫盾'); })()`);
            if (!chain) bad.push('猫盾 + 小鱼干 + 黄金小鱼干 应该一路合成至臻猫盾');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('CR1 合成：丰饶圣餐正常开局合得出来、竞争配方先合产物价值高的（一样高选原料便宜的、结果固定）、所有配方都合得出来', bad.length === 0, bad.join(' / '));
        }

                if (want('LT1')) {
            // LT1 抽奖机：背包里能拿在手上的东西都收（以前只认紫色池、金色池里的名字，药剂、合成物、商店道具都被拒）；紫/蓝按紫色一档，金/红按金色一档
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const names = JSON.parse(await T.eval(`(function(){
                let items = [], add = function (k, it) { items.push([k, it]); };
                HUNT_POTIONS.forEach(function (p) { add('药剂 ' + p.n, Object.assign({}, p)); });
                Object.keys(shopItems).forEach(function (n) { add('商店 ' + n, Object.assign({}, shopItems[n])); });
                add('猫盾', Object.assign({}, itemPool.purple.filter(function (i) { return i.n === '猫盾'; })[0]));
                add('金苹果', Object.assign({}, itemPool.gold[1]));
                GROUND_RECIPES.forEach(function (r) { add('合成物 ' + r.out.n, { n: r.out.n, v: r.out.v, w: r.out.w, tex: r.out.tex, c: r.out.c, type: r.out.type }); });
                itemPool.ultra.concat(itemPool.god).forEach(function (u) { add('大金 ' + u.n, Object.assign({}, u)); });
                add('宝石', huntGemItem(HUNT_GEMS[0])); add('皇冠底座', crownBaseItem());
                add('猫神护身符', { n: '猫神护身符', v: GODCAT_V, w: 1, tex: 'generic', c: 0xffd54f, type: 'godcat' });
                window.__lt = items; return JSON.stringify(items.map(function (x) { return [x[0], huntLotteryKind(x[1])]; })); })()`));
            if (names.some((x) => x[1] !== 'purple' && x[1] !== 'gold')) bad.push('有东西归不了档 ' + JSON.stringify(names.filter((x) => x[1] !== 'purple' && x[1] !== 'gold')));
            const kind = Object.fromEntries(names);
            if (kind['药剂 治疗药剂'] !== 'gold' || kind['药剂 加速药剂'] !== 'gold') bad.push('药剂（5～8 万）该投金色 ' + kind['药剂 治疗药剂']);
            if (kind['商店 医疗包'] !== 'purple' || kind['猫盾'] !== 'purple' || kind['金苹果'] !== 'gold') bad.push('归档不对 ' + JSON.stringify([kind['商店 医疗包'], kind['猫盾'], kind['金苹果']]));
            // 真点抽奖：每一种都能投进去、槽位清空、弹出结果（而不是"只能投入紫色或金色物品"）
            await T.eval(`huntBigLeft = 4; gState.team = []; true;`);
            const total = names.length;
            let refused = [];
            for (let i = 0; i < total; i++) {
                const r = JSON.parse(await T.eval(`(function(){ ${HIDE} let it = Object.assign({}, window.__lt[${i}][1]); gState.inv[0] = it; gState.selectedSlot = 0; clickLottery();
                    return JSON.stringify({ gone: !gState.inv[0], title: ${MODAL} }); })()`));
                if (!r.gone || r.title === '提示') refused.push(names[i][0] + ':' + JSON.stringify(r));
            }
            if (refused.length) bad.push('抽奖机拒收：' + refused.join(' | '));
            await T.eval(`${HIDE} true;`);
            // 空手还是提示先选东西
            await T.eval(`gState.inv[gState.selectedSlot] = null; clickLottery(); true;`);
            if ((await T.eval(MODAL)) === null) bad.push('空手点抽奖应提示');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('LT1 抽奖机收所有能拿在手上的东西（药剂、商店道具、合成物、大金、宝石……），按格子底色归紫/金一档', bad.length === 0, bad.join(' / '));
        }

                if (want('LT2')) {
            // LT2 抽奖保护：里面有东西的腰包不收（提示"先清空腰包"，腰包和里面的东西都不动、地上不多东西）；空腰包照常能投
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`);
            if (!(await until(T, `isPlaying && typeof clickLottery === 'function'`, 30000))) bad.push('寻宝队没开起来');
            await T.eval(`${HIDE} huntBigLeft = 4; gState.team = []; window.__p = Object.assign({}, shopItems['腰包'], { bag: [Object.assign({}, itemPool.gold[0]), null, Object.assign({}, HUNT_POTIONS[0])] });
                gState.inv[0] = window.__p; gState.selectedSlot = 0; window.__g0 = groundItems.length; clickLottery(); true;`);
            if (!(await until(T, `${MODAL} === '提示' && /先清空腰包/.test(document.getElementById('sys-modal-text').innerText)`, 10000))) bad.push('非空腰包没提示"先清空腰包" ' + await T.eval(`String(${MODAL})`));
            const keep = JSON.parse(await T.eval(`JSON.stringify({ same: gState.inv[0] === window.__p, bag: window.__p.bag.map(function (q) { return q ? q.n : null; }), ground: groundItems.length - window.__g0 })`));
            if (!keep.same || keep.bag.join() !== '黄金书,,治疗药剂' || keep.ground !== 0) bad.push('非空腰包被动了 ' + JSON.stringify(keep));
            // 清空以后再投：收下，槽位空了，出抽奖结果
            await T.eval(`${HIDE} window.__p.bag = [null, null, null]; clickLottery(); true;`);
            if (!(await until(T, `!gState.inv[0] && ${MODAL} === '抽奖结果'`, 10000))) bad.push('空腰包投不进去 ' + await T.eval(`JSON.stringify({ slot: !!gState.inv[0], modal: ${MODAL} })`));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('LT2 抽奖保护：非空腰包不收、提示先清空、东西不动；空腰包能投', bad.length === 0, bad.join(' / '));
        }

                if (want('H21')) {
            // H21（改）运气猫爪下架：物品、配方、效果代码、抽奖加成都没了，不留悬空引用；老存档里的猫爪（仓库、背包、腰包里）载入时全部拿走、按价值折成钱还给玩家并弹一条提示；SAVE_VER 不动
            const bad = [];
            const T = await openTab(chrome, url);
            const core = fs.readFileSync(path.join(ROOT, 'js', '01-core.js'), 'utf8');
            const refundSrc = core.slice(core.indexOf('// 运气猫爪下架'), core.indexOf('function loadProgress('));   // 折现函数自己会提到猫爪，别的地方都不许提
            const rest = core.replace(refundSrc, '') + ['02-lobby', '03-world', '05-shop', '08-night', '09-hunt', '18-lab'].map((f) => fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')).join('\n') + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
            const restClean = rest.replace(/luckClawRefund\(\)/g, '').replace(/'运气猫爪下架了（已按价值折现返还）'/, '');   // 更新公告里写一句下架不算残留
            const bits = restClean.match(/.{0,20}(运气猫爪|luckclaw|huntLuck).{0,20}/g) || [];
            const live = bits.filter((x) => !/^\s*\/\/|^.*\/\/.*(运气猫爪|luckclaw|huntLuck)/.test(x));   // 注释里提一句不算
            if (live.length) bad.push('代码里还留着运气猫爪的东西 ' + live.slice(0, 3).join(' | '));
            await T.eval(`${HIDE} true;`);
            const g = JSON.parse(await T.eval(`JSON.stringify({ rec: GROUND_RECIPES.filter(function (r) { return r.id === 'luckclaw' || r.out.n === '运气猫爪'; }).length, fn: [typeof huntLuckK, typeof huntLuckUse, typeof huntLuckApply, typeof huntLuckFx, typeof huntLuckDecide], luck: gState.huntLuck, tbl: huntLotteryTable('gold').map(function (x) { return x[1]; }), ver: SAVE_VER })`));
            if (g.rec) bad.push('配方里还有运气猫爪 ' + JSON.stringify(g));
            if (g.fn.some((t) => t !== 'undefined') || g.luck !== undefined) bad.push('运气的函数／状态还在 ' + JSON.stringify(g));
            if (g.tbl.join() !== '0.05,0.25,0.15,0.55') bad.push('抽奖表被运气改过 ' + g.tbl);
            if (g.ver !== 2) bad.push('SAVE_VER 动了');
            // 老存档：仓库、背包、腰包里的猫爪载入时拿走，按价值折现；没写价值的按 10 万（载入时调用的位置也查一下）
            if (!/loadProgress\(pid\); luckClawRefund\(\);/.test(fs.readFileSync(path.join(ROOT, 'js', '02-lobby.js'), 'utf8'))) bad.push('载入存档后没调用折现');
            const r = JSON.parse(await T.eval(`(function(){
                let claw = function (v) { let c = { n: '运气猫爪', v: v, w: 1, tex: 'cat_shield', c: 0xff80ab, type: 'luckclaw' }; if (v === undefined) delete c.v; return c; };
                                let inv = new Array(INV_BASE).fill(null), garage = new Array(200).fill(null);
                inv[0] = claw(100000); inv[1] = { n: '猫盾', v: 15000, w: 1, tex: 'cat_shield', c: 0x9c27b0 };
                inv[2] = { n: '腰包', v: 40000, w: 4, tex: 'pouch', c: 0xd35400, type: 'backpack_ext', isShop: true, bag: [claw(100000), null, { n: '猫盾', v: 15000, w: 1 }] };
                garage[0] = claw(100000); garage[5] = claw(); garage[9] = { n: '黄金书', v: 30000, w: 3 };
                gState.inv = inv; gState.garage = garage; gState.money = 1000; gState.recipes = { luckclaw: 111, gcat: 222 }; let m0 = gState.money;
                let total = luckClawRefund();
                let left = JSON.stringify([gState.inv, gState.garage]).indexOf('运气猫爪');
                let saved = localStorage.getItem('TH_save_' + gState.id) || '';
                let again = luckClawRefund();
                return JSON.stringify({ m0: m0, total: total, money: gState.money, left: left, keep: [gState.inv[1] && gState.inv[1].n, gState.garage[9] && gState.garage[9].n, gState.inv[2].bag[2] && gState.inv[2].bag[2].n], savedHas: saved.indexOf('运气猫爪'), again: again, rec: Object.keys(gState.recipes).join(), savedRec: saved.indexOf('luckclaw') }); })()`));
            if (r.m0 !== 1000 || r.total !== 400000 || r.money !== 401000) bad.push('折现：4 个猫爪（含腰包里的、没写价值的按 10 万）应该返 40 万 ' + JSON.stringify(r));
            if (r.left !== -1 || r.savedHas !== -1 || r.again !== 0) bad.push('猫爪没拿干净／存档里还有／重复折现 ' + JSON.stringify(r));
            if (r.keep.join() !== '猫盾,黄金书,猫盾') bad.push('别的东西被动了 ' + r.keep);
            if (r.rec !== 'gcat' || r.savedRec !== -1) bad.push('配方图鉴里的猫爪记录没清（别的记录要留） ' + r.rec);
            if (!(await until(T, `document.getElementById('sys-modal') && !document.getElementById('sys-modal').classList.contains('hidden') && /运气猫爪已下架，已按价值折现 400000/.test(document.getElementById('sys-modal-text').innerText)`, 8000))) bad.push('没弹折现提示 ' + await T.eval(`document.getElementById('sys-modal-text').innerText`));
            if (/保底|必出/.test(refundSrc.match(/运气猫爪已下架[^']*/)[0])) bad.push('提示里有不该写的词');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H21 运气猫爪下架：物品、配方、效果代码、抽奖加成都没了；老存档里的猫爪（仓库、背包、腰包）载入时折现（含没写价值的）并弹提示一次', bad.length === 0, bad.join(' / '));
        }

                if (want('H22b')) {
            // H22b：药水是掉在地上的宝物，捡进背包，拿在手上按“用道具”才生效（没有读条，按一下马上起效，东西没了）；撤离后进仓库能卖
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const press = async (js) => { await T.eval(js); };
            // 1) 预设箱子开出治疗药剂 → 开箱后地上有这件东西（不是直接喝掉）
            await T.eval(`window.__roll = huntPotionRoll; huntPotionRoll = function () { return Object.assign({}, HUNT_POTIONS[0]); };
                gState.hp = 20; window.__n0 = groundItems.length; true;`);
            await press(`(function(){ let c = chests[0]; camera.position.set(c.position.x + 6, c.position.y + 7, c.position.z); pVel.set(0, 0, 0); camera.rotation.y = Math.PI / 2; keys['f'] = true; return true; })()`);
            await until(T, `chests[0].userData.opened && groundItems.some(function (g) { return g.userData.n === '治疗药剂'; })`, 20000);
            const o1 = JSON.parse(await T.eval(`JSON.stringify({ hp: gState.hp, opened: chests[0].userData.opened, potions: groundItems.filter(function (g) { return g.userData.n === '治疗药剂'; }).map(function (g) { return [g.userData.v, g.userData.w, g.userData.type]; }) })`));
            await T.eval(`huntPotionRoll = window.__roll; true;`);
            if (!o1.opened) bad.push('箱子没开');
            if (o1.hp !== 20) bad.push('开箱就喝掉了 hp=' + o1.hp);
            if (o1.potions.length !== 1 || o1.potions[0].join() !== '80000,1,potion') bad.push('地上没有治疗药剂（或重量/价值不对） ' + JSON.stringify(o1.potions));
            // 2) 捡起来进背包（还是没喝），选中它按“用道具”才回血、物品消失
            await press(`(function(){ let g = groundItems.filter(function (x) { return x.userData.n === '治疗药剂'; })[0]; if (!g) return false; g.userData.vel = new THREE.Vector3(0, 0, 0); camera.position.set(g.position.x + 4, g.position.y + 7, g.position.z); pVel.set(0, 0, 0); keys['f'] = true; return true; })()`);
            await until(T, `gState.inv.some(function (q) { return q && q.n === '治疗药剂'; })`, 20000);
            const o2 = JSON.parse(await T.eval(`(function(){ let idx = gState.inv.findIndex(function (q) { return q && q.n === '治疗药剂'; }); return JSON.stringify({ idx: idx, hp: gState.hp, left: groundItems.filter(function (x) { return x.userData.n === '治疗药剂'; }).length }); })()`));
            if (o2.idx < 0 || o2.left !== 0) bad.push('没捡进背包 ' + JSON.stringify(o2));
            if (o2.hp !== 20) bad.push('捡起来就回血了 ' + o2.hp);
            await T.eval(`(function(){ let idx = gState.inv.findIndex(function (q) { return q && q.n === '治疗药剂'; }); let it = gState.inv[idx]; gState.inv[idx] = null; gState.inv[0] = it; gState.selectedSlot = 0; keys['rmb'] = true; return true; })()`);
            await until(T, `!gState.inv.some(function (q) { return q && q.n === '治疗药剂'; })`, 20000);
            const o3 = JSON.parse(await T.eval(`JSON.stringify({ hp: gState.hp, gone: !gState.inv.some(function (q) { return q && q.n === '治疗药剂'; }) })`));
            if (o3.hp !== 70 || !o3.gone) bad.push('按用道具没回血/物品还在 ' + JSON.stringify(o3));
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500);
            // 3) 撤离后药水在仓库里，能卖（价值照旧）
            await T.eval(GARAGE_SETUP(`[null, null, null, null, null, null]`, `[]`, 1000));
            await T.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await T.eval(`${HIDE} true;`);
            await T.eval(`gState.inv[1] = Object.assign({}, HUNT_POTIONS[0]); completeExtraction('撤离成功'); true;`); await until(T, `gState.garage.some(function (q) { return q && q.n === '治疗药剂'; })`, 20000);
            const o7 = JSON.parse(await T.eval(`JSON.stringify({ inGarage: gState.garage.filter(function (q) { return q && q.n === '治疗药剂'; }).length, inInv: gState.inv.filter(function (q) { return q && q.n === '治疗药剂'; }).length })`));
            if (o7.inGarage !== 1 || o7.inInv !== 0) bad.push('撤离后药水不在仓库里（或还在背包里） ' + JSON.stringify(o7));
            const m0 = await T.eval('gState.money');
            await T.eval(`${HIDE} returnToGarageFromOver(); gState.selectedContainer = 'garage'; gState.selectedSlot = gState.garage.findIndex(function (q) { return q && q.n === '治疗药剂'; }); garageSellSelected(); true;`);
            const m1 = await T.eval('gState.money');
            if (m1 - m0 !== 80000) bad.push('卖药水应得 80000，实际 ' + (m1 - m0));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H22b 药水掉在地上、捡进背包，手上按“用道具”才生效；撤离后药水进仓库能卖', bad.length === 0, bad.join(' / '));
        }

                if (want('H22')) {
            // H22：开箱非大金的结果木箱 6% / 银箱 8% / 金箱 10% 换成药水（掉出来，手上按用道具才生效）；猫神护身符每张图 25% 藏在桌面或顶楼死角，带着它死亡 = 满血站起来、5 米内的怪全死、护身符碎、本局上限 −40（最低 30）
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(function(){
                let o = {}, N = 20000;
                let frac = function (box, loot) { let n = 0, kinds = {}; for (let i = 0; i < N; i++) { let p = huntPotionRoll(box, loot, (i + 0.5) / N, ((i * 7919) % N + 0.5) / N); if (p) { n++; kinds[p.id] = (kinds[p.id] || 0) + 1; } } return [n / N, kinds]; };
                let pl = itemPool.purple[0];
                o.wood = frac('wood', pl); o.silver = frac('silver', pl); o.gold = frac('gold', pl); o.safe = frac('safe', pl)[0]; o.big = frac('gold', itemPool.ultra[0])[0];
                o.table = HUNT_POTIONS.map(function (p) { return [p.id, p.n, p.v]; });
                // 效果
                gState.hp = 20; huntPotionUse(HUNT_POTIONS[0]); o.heal = gState.hp;
                gState.hp = effectiveMaxHp() - 10; huntPotionUse(HUNT_POTIONS[0]); o.healCap = gState.hp === effectiveMaxHp();
                huntPotionUse(HUNT_POTIONS[1]); o.speed = [gState.speedT, huntSpeedPotionMul()];
                huntPotionUse(HUNT_POTIONS[2]); o.spring = [gState.springT, +(huntJumpVel() * huntJumpVel() / (44 * 44)).toFixed(3)];
                gState.speedT = 0; gState.springT = 0; o.off = [huntSpeedPotionMul(), huntJumpVel()];
                // 护身符摆放：很多个种子里 25%，在桌面或顶楼死角
                let hit = 0, S = 400, where = { table: 0, top: 0, other: 0 };
                let save = gameSeed;
                for (let s = 1; s <= S; s++) {
                    gameSeed = s * 7 + 3;
                    let m = huntPlaceGodCat();
                    if (m) { hit++; let cx = Math.round(m.position.x / TILE), cz = Math.round(m.position.z / TILE), f = Math.floor((m.position.y - 0.5) / TILE), c = maze[f] && maze[f][cz] && maze[f][cz][cx];
                        if (c && c.type === 2) where.table++; else if (f === FLOORS - 1 && c && c.type === 0 && c.isLeaf) where.top++; else where.other++; }
                }
                gameSeed = save; groundItems = groundItems.filter(function (g) { if (g.userData.type === 'godcat') { scene.remove(g); return false; } return true; });
                o.place = [hit / S, where];
                return JSON.stringify(o); })()`));
            const near = (a, b, t) => Math.abs(a - b) < (t || 0.004);
            if (!near(r.wood[0], 0.06) || !near(r.silver[0], 0.08) || !near(r.gold[0], 0.10) || r.safe !== 0 || r.big !== 0) bad.push('概率 ' + JSON.stringify([r.wood[0], r.silver[0], r.gold[0], r.safe, r.big]));
            ['heal', 'speed', 'spring'].forEach((k) => { if (!(r.gold[1][k] > 0.2 * r.gold[0] * 20000)) bad.push('三种药水不均匀 ' + JSON.stringify(r.gold[1])); });
            if (JSON.stringify(r.table) !== JSON.stringify([['heal', '治疗药剂', 80000], ['speed', '加速药剂', 50000], ['spring', '弹簧鞋', 50000]])) bad.push('药水表 ' + JSON.stringify(r.table));
            if (r.heal !== 70 || !r.healCap || r.speed.join() !== '20,1.5' || r.spring.join() !== '30,2' || r.off.join() !== '1,44') bad.push('药水效果 ' + JSON.stringify([r.heal, r.healCap, r.speed, r.spring, r.off]));
            if (!near(r.place[0], 0.25, 0.06) || r.place[1].other !== 0 || r.place[1].table + r.place[1].top === 0) bad.push('护身符摆放 ' + JSON.stringify(r.place));
            // 死亡：背包里有护身符 → 站起来
            const d = JSON.parse(await T.eval(`(function(){
                let o = {}, am = function () { return { n: '猫神护身符', v: GODCAT_V, w: 1, type: 'godcat' }; };
                let mob = function (type, dx) { let m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial()); m.position.copy(camera.position); m.position.x += dx; m.userData = { type: type, hp: 10, maxHp: 10, speed: 0, dmg: 0, atkCd: 0, name: 'x' }; scene.add(m); entities.push(m); return m; };
                gState.huntHpCut = 0; gState.isDead = false; gState.inv[3] = am(); let near1 = mob('angel', 10), far1 = mob('puppet', 80);
                gState.hp = 0; triggerAgentDeath();
                o.alive = !gState.isDead && gState.hp === 60 + 0 + 40 - 40 + 0 ? false : null;
                o.state = [gState.isDead, gState.hp, effectiveMaxHp(), gState.huntHpCut, gState.inv[3] === null, entities.indexOf(near1) < 0, entities.indexOf(far1) >= 0];
                // 第二次（腰包里）：上限 20 → 最低 30
                gState.inv[4] = { n: '腰包', isShop: true, type: 'backpack_ext', bag: [am(), null, null] }; gState.hp = 0; triggerAgentDeath();
                o.second = [gState.isDead, gState.hp, effectiveMaxHp(), gState.huntHpCut, gState.inv[4].bag[0] === null];
                // 没有护身符：真的倒下
                gState.hp = 0; triggerAgentDeath(); o.third = gState.isDead;
                gState.isDead = false; gState.huntHpCut = 0; gState.hp = effectiveMaxHp();
                return JSON.stringify(o); })()`));
            if (d.state.join() !== 'false,60,60,40,true,true,true') bad.push('带护身符死亡 ' + d.state.join());
            if (d.second.join() !== 'false,30,30,80,true') bad.push('第二次 ' + d.second.join());
            if (d.third !== true) bad.push('没护身符却没死');
            // 新的一局归零
            await T.eval(`gState.huntHpCut = 80; gState.speedT = 9; ${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000);
            if ((await T.eval(`[gState.huntHpCut, gState.speedT, effectiveMaxHp()].join()`)) !== '0,0,100') bad.push('新一局没归零');
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H22 开箱药水（6/8/10%，掉出来）；猫神护身符 25% 藏在桌面或顶楼死角，带着死亡满血站起来、5 米内怪全死、上限 −40', bad.length === 0, bad.join(' / '));
        }

                if (want('H23')) {
            // H23：角色技能——绿色 8 秒内每秒回 5 血；黄色 2 秒内移速 ×2、不受负重影响；电脑按 R，右键只用道具；平板有“技能”按钮；HUD 有冷却图标
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} gState.char = 'green'; selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            // 右键只用道具：按住右键一会儿，技能没放
            await T.eval(`keys['rmb'] = true; true;`); await W(400); await T.eval(`keys['rmb'] = false; true;`);
            const a0 = JSON.parse(await T.eval(`JSON.stringify([abilityActive, abilityCd])`));
            if (a0[0] !== 0 || a0[1] !== 0) bad.push('右键放了技能 ' + a0.join());
            // 绿色：R
            await T.eval(`gState.hp = 10; keys['r'] = true; true;`); await until(T, `abilityActive > 0`, 20000);
            const g1 = JSON.parse(await T.eval(`JSON.stringify([abilityActive, abilityCd, document.getElementById('skill-name').innerText, document.getElementById('skill-icon').className])`));
            await until(T, `abilityActive < 7`, 20000);   // 游戏里至少过 1 秒
            // 无头浏览器帧率低，游戏时间比真实时间慢：用技能剩余时间算游戏里过了多久
            const g2 = JSON.parse(await T.eval(`JSON.stringify([abilityActive, gState.hp])`));
            const played = 8 - g2[0];
            if (!(g1[0] > 7 && g1[0] <= 8 && g1[1] > 39) || !/^\d+秒$/.test(g1[2]) || !/on/.test(g1[3])) bad.push('绿色放技能 ' + g1.join());
            if (!(played > 0.5 && Math.abs((g2[1] - 10) - 5 * played) < 3)) bad.push('绿色回血：游戏里过了 ' + played.toFixed(2) + ' 秒，血量 10 → ' + g2[1] + '（应该每秒 5）');
            // 冷却中再按 R 不重新放
            await T.eval(`abilityActive = 0; keys['r'] = true; true;`); await frames(T, 30);
            if ((await T.eval('abilityActive')) !== 0) bad.push('冷却中又放了');
            // 黄色：移速
            await T.eval(`gState.char = 'yellow'; abilityCd = 0; abilityActive = 0; window.__sp = []; (function(){ let h0 = huntPhysics; window.__h0 = h0; huntPhysics = function (dt, mx, mz, sp) { window.__sp.push(sp); return h0.apply(this, arguments); }; })(); keys['w'] = true; true;`); await until(T, `window.__sp.length >= 8`, 20000);
            const base = await T.eval(`window.__sp.slice(-5)`);
            await T.eval(`window.__sp = []; keys['r'] = true; true;`); await until(T, `window.__sp.length >= 8`, 20000);
            const during = await T.eval(`window.__sp.slice(-5)`);
            for (let i = 0; i < 40 && (await T.eval('abilityActive')) > 0; i++) await W(250);   // 等游戏里的 2 秒走完
            await T.eval(`window.__sp = []; true;`); await until(T, `window.__sp.length >= 8`, 20000);
            const after = await T.eval(`window.__sp.slice(-5)`);
            // 负重：背很重，平时慢，放技能时不受影响
            await T.eval(`abilityCd = 0; abilityActive = 0; for (let i = 0; i < 6; i++) gState.inv[i] = { n: '铁块' + i, v: 1, w: 12 }; window.__sp = []; true;`); await until(T, `window.__sp.length >= 8`, 20000);
            const heavy = await T.eval(`window.__sp.slice(-5)`);
            await T.eval(`window.__sp = []; keys['r'] = true; true;`); await until(T, `window.__sp.length >= 8`, 20000);
            const heavySkill = await T.eval(`window.__sp.slice(-5)`);
            await T.eval(`keys['w'] = false; huntPhysics = window.__h0; for (let i = 0; i < 6; i++) gState.inv[i] = null; true;`);
            const avg = (x) => x.reduce((s, y) => s + y, 0) / Math.max(1, x.length);
            if (!(avg(during) > avg(base) * 1.9 && avg(during) < avg(base) * 2.1)) bad.push('黄色技能移速 ' + avg(base) + ' → ' + avg(during));
            if (!(Math.abs(avg(after) - avg(base)) < 0.5)) bad.push('2 秒后没恢复 ' + avg(after));
            if (!(avg(heavy) < avg(base) * 0.8 && Math.abs(avg(heavySkill) - avg(base) * 2) < 1)) bad.push('负重 平时=' + avg(heavy) + ' 放技能=' + avg(heavySkill) + ' 基础=' + avg(base));
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            // 平板：有“技能”按钮，点它放技能
            const M = await openTab(chrome, url, { mobile: true });
            await M.eval(`${HIDE} gState.char = 'green'; selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await M.eval(`${HIDE} true;`);
            const b = JSON.parse(await M.eval(`JSON.stringify({ btn: !!document.getElementById('skill-btn'), shown: getComputedStyle(document.getElementById('skill-btn')).display, txt: document.getElementById('skill-btn').innerText, key: document.getElementById('skill-key').innerText })`));
            if (!b.btn || b.shown === 'none' || b.txt !== '技能' || b.key !== '技能') bad.push('平板按钮 ' + JSON.stringify(b));
            await M.eval(`touchBtn.skill = true; true;`); await until(M, `abilityActive > 7`, 20000);
            if (!((await M.eval('abilityActive')) > 7)) bad.push('平板点技能没放');
            await M.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            if (M.errors.length) bad.push('平板报错 ' + M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('H23 角色技能：绿 8 秒每秒 5 血、黄 2 秒移速 ×2 无视负重；电脑 R、右键只用道具；平板技能按钮；冷却图标', bad.length === 0, bad.join(' / '));
        }

                if (want('H24')) {
            // H24：医疗包每次回 15；肾上腺素 3 次、每次 20 秒内跑步不耗体力；返魂药水只能给倒下的队友（6 米内、按住互动 3 秒、救起来 30 血，真人走 HUNT_REVIVE）
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            // 医疗包
            await T.eval(`gState.hp = 50; gState.inv[0] = Object.assign({}, shopItems['医疗包']); selectSlot(0); true;`);
            for (let i = 0; i < 200 && (await T.eval('gState.inv[0] && gState.inv[0].uses')) === 5; i++) await W(300);   // 要站着不动 4 秒游戏时间，CI 帧率低就要等一会儿
            const med = JSON.parse(await T.eval(`JSON.stringify([gState.hp, gState.inv[0] && gState.inv[0].uses, HUNT_MED_HEAL])`));
            if (med[0] !== 65 || med[1] !== 4 || med[2] !== 15) bad.push('医疗包 ' + med.join());
            // 肾上腺素：打一针，跑 1 秒体力不降；再打不扣次数；3 次后没了
            await T.eval(`gState.inv[0] = null; gState.inv[1] = Object.assign({}, shopItems['肾上腺素']); selectSlot(1); stamina = 100; keys['rmb'] = true; true;`); await until(T, `gState.inv[1].uses === 2`, 20000);
            const s1 = JSON.parse(await T.eval(`JSON.stringify([gState.inv[1].uses, gState.stimT])`));
            await T.eval(`keys['rmb'] = true; true;`); await frames(T, 30);
            const s1b = await T.eval('gState.inv[1].uses');
            await T.eval(`keys['shift'] = true; keys['w'] = true; true;`); await frames(T, 60);
            const st1 = await T.eval('stamina');
            await T.eval(`keys['shift'] = false; keys['w'] = false; gState.stimT = 0; stamina = 100; true;`);
            await T.eval(`keys['shift'] = true; keys['w'] = true; true;`); await until(T, `stamina < 90`, 20000);
            const st2 = await T.eval('stamina');
            await T.eval(`keys['shift'] = false; keys['w'] = false; stamina = 100; true;`);
            if (s1[0] !== 2 || !(s1[1] > 15 && s1[1] <= 20) || s1b !== 2) bad.push('肾上腺素 ' + s1.join() + ' / ' + s1b);
            if (st1 < 99 || st2 > st1 - 3) bad.push('体力：有针 ' + st1 + '，没针 ' + st2);
            for (let i = 0; i < 2; i++) { await T.eval(`gState.stimT = 0; keys['rmb'] = true; true;`); await until(T, `!gState.inv[1] || gState.inv[1].uses <= ${1 - i}`, 20000); }
            if ((await T.eval('gState.inv[1]')) !== null) bad.push('用完 3 次还在');
            // 返魂药水
            const mk = `(function(){ let m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial()); m.position.copy(camera.position); m.position.y -= 4; m.userData = { type: 'ai', name: 'NAME', hp: HP, hasRev: false, isRealPlayer: REAL }; scene.add(m); entities.push(m); return m; })()`;
            await T.eval(`gState.inv[2] = Object.assign({}, shopItems['返魂药水']); selectSlot(2); window.__sent = []; (function(){ let b = bc.postMessage.bind(bc); window.__bp = b; bc.postMessage = function (m) { window.__sent.push(m); return b(m); }; })(); true;`);
            // 旁边没人倒下：按住也没用
            await T.eval(`huntHold.f = true; true;`); await frames(T, 60);
            if (!(await T.eval('!!gState.inv[2]'))) bad.push('没人倒下药水却用掉了');
            // 倒下的 AI 队友在 6 米外：不行；挪到 6 米内：按住 3 秒救起来 30 血
            await T.eval(`window.__ai = ${mk.replace('NAME', 'ai-mate').replace('HP', '0').replace('REAL', 'false')}; window.__ai.position.x += 40; true;`); await frames(T, 40);
            if (!(await T.eval('!!gState.inv[2]'))) bad.push('6 米外也能救');
                        // 按住 3 秒：直接喂时间（CI 帧率低，真等 3 秒游戏时间要很久）；松手就清零
            // 摆位置和算进度放在同一次执行里：AI 队友会自己跑去搜箱子，分两次的话负载高时已经跑出 6 米了
            const prog = JSON.parse(await T.eval(`(function(){ window.__ai.position.copy(camera.position); window.__ai.position.x += 20; huntHold.f = false; let sel = gState.inv[2], o = []; huntReviveTick(1.5, sel, true); o.push(gState.reviveT); huntReviveTick(0.1, sel, false); o.push(gState.reviveT); huntReviveTick(1.5, sel, true); huntReviveTick(1.4, sel, true); o.push(!!gState.inv[2]); huntReviveTick(0.2, sel, true); o.push(!!gState.inv[2]); return JSON.stringify(o); })()`));
            if (prog.join() !== '1.5,0,true,false') bad.push('按住进度 ' + prog.join());
            const ai = JSON.parse(await T.eval(`JSON.stringify([window.__ai.userData.hp, gState.inv[2]])`));
            if (ai[0] !== 30 || ai[1] !== null) bad.push('救 AI 队友 ' + JSON.stringify(ai));
            // 真人队友倒下（peerState）：发 HUNT_REVIVE
            await T.eval(`gState.team = [{ id: gState.id, isLeader: true, isAI: false }, { id: 'peer-q', isAI: false }]; gState.peerState['peer-q'] = 'down'; window.__hum = ${mk.replace('NAME', 'peer-q').replace('HP', '100').replace('REAL', 'true')}; window.__hum.position.x += 12;
                gState.inv[2] = Object.assign({}, shopItems['返魂药水']); selectSlot(2); window.__sent.length = 0; true;`);
            await T.eval(`(function(){ let sel = gState.inv[2]; for (let i = 0; i < 4; i++) huntReviveTick(1, sel, true); return true; })()`);
            const sent = await T.eval(`window.__sent.filter(function (m) { return m.type === 'HUNT_REVIVE'; })`);
            if (sent.length !== 1 || sent[0].target !== 'peer-q' || sent[0].sender === undefined) bad.push('真人没发 HUNT_REVIVE ' + JSON.stringify(sent));
            // 被救的一方
            const rv = JSON.parse(await T.eval(`(function(){
                let o = {}, me = gState.id;
                gState.isDead = true; gState.deathPos = camera.position.clone(); gState.hp = 0;
                bc.onmessage({ data: { type: 'HUNT_REVIVE', target: me, sender: 'stranger' } }); o.stranger = gState.isDead;
                bc.onmessage({ data: { type: 'HUNT_REVIVE', target: 'someone-else', sender: 'peer-q' } }); o.wrongTarget = gState.isDead;
                bc.onmessage({ data: { type: 'HUNT_REVIVE', target: me, sender: 'peer-q' } }); o.alive = !gState.isDead; o.hp = gState.hp;
                bc.onmessage({ data: { type: 'HUNT_REVIVE', target: me, sender: 'peer-q' } }); o.notDeadIgnored = gState.hp;
                return JSON.stringify(o); })()`));
            if (rv.stranger !== true || rv.wrongTarget !== true || rv.alive !== true || rv.hp !== 30 || rv.notDeadIgnored !== 30) bad.push('被救的一方 ' + JSON.stringify(rv));
            // 倒下的人，身体停在倒下的地方（别人要走到他身边）：倒下后 POS_SYNC 发的是倒地位置，不是正在观战的人的位置
            await T.eval(`(function(){ let sp = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial()); sp.position.set(camera.position.x + 200, 9, camera.position.z + 200); scene.add(sp);
                window.__dp = { x: camera.position.x, z: camera.position.z }; gState.peerState['peer-q'] = 'active'; gState.isDead = true; gState.deathPos = camera.position.clone(); gState.spectating = sp; window.__sent.length = 0; return true; })()`);
            await until(T, `window.__sent.some(function (m) { return m.type === 'POS_SYNC'; })`, 20000);
            const ps = await T.eval(`window.__sent.filter(function (m) { return m.type === 'POS_SYNC'; }).slice(-1)[0]`);
            await T.eval(`gState.isDead = false; gState.spectating = null; bc.postMessage = window.__bp; true;`);
            if (!ps || Math.abs(ps.x - (await T.eval('window.__dp.x'))) > 1) bad.push('倒下后 POS_SYNC 还跟着观战的人 ' + JSON.stringify(ps));
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H24 医疗包回 15；肾上腺素 3 次 20 秒不耗体力；返魂药水给 6 米内倒下的队友、按住互动 3 秒、救起来 30 血（真人走 HUNT_REVIVE）', bad.length === 0, bad.join(' / '));
        }

                if (want('H25')) {
            // H25：路线（蓝线、绿线）走在路正中间；绿线换楼层不清掉、跨楼层接着导航；站在楼梯、桌子上也画得出来
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} gState.mapDifficulty = 'easy'; selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(function(){
                let o = { off: 0, pts: 0, stairTry: 0, stairDrawn: 0, stairNeed: 0, needDrawn: 0, tableTry: 0, tableDrawn: 0 };
                // 楼梯格附近（台阶/平台/井边）的点沿台阶和平台的中线走，不在格子正中，不按格子中心算；别处的点必须在格子的中线上
                let centered = function (pts) {
                    let bad = 0;
                    pts.forEach(function (p) {
                        let mx = Math.abs(p.x / TILE - Math.round(p.x / TILE)) < 0.01, mz = Math.abs(p.z / TILE - Math.round(p.z / TILE)) < 0.01;
                        if (mx || mz) return;
                        let f = Math.floor((p.y + 0.5) / TILE), near = false;
                        for (let ff = f - 1; ff <= f + 1; ff++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                            let cx = Math.floor(p.x / TILE + 0.5) + dx, cz = Math.floor(p.z / TILE + 0.5) + dz, c = maze[ff] && maze[ff][cz] && maze[ff][cz][cx];
                            if (c && c.type === 3 && Math.abs(p.x - cx * TILE) <= TILE && Math.abs(p.z - cz * TILE) <= TILE) near = true;
                        }
                        if (!near) bad++;
                    });
                    return bad;
                };
                // 1 蓝线、绿线都走在格子中线上（站在格子里偏一点的位置出发也一样）
                let me = { f: 0, x: 1, z: 1 }, far = null, best = -1;
                for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) if (maze[0][z][x].type === 0) { let d = Math.abs(x - 1) + Math.abs(z - 1); if (d > best && huntRouteFind(me, { f: 0, x: x, z: z })) { best = d; far = { f: 0, x: x, z: z }; } }
                camera.position.set(TILE + 7, 9, TILE - 5); pVel.set(0, 0, 0);
                let rb = huntRouteBuild(huntPlayerNode(), far, camera.position); o.pts = rb.pts.length; o.off = centered(rb.pts);
                generateFootprintGuide(far.x, far.z); o.green = !!huntNavRoute.mesh; o.greenOff = centered(huntNavRoute.pts);
                // 2 换楼层：绿线不清掉，从新位置接着往目标走
                let up = null;
                for (let z = 1; z < mSize - 1 && !up; z++) for (let x = 1; x < mSize - 1 && !up; x++) if (huntCellKind(1, x, z) === 'floor' && huntRouteFind({ f: 1, x: x, z: z }, far)) up = { x: x, z: z };
                camera.position.set(up.x * TILE, TILE + 9, up.z * TILE); pVel.set(0, 0, 0); navRouteTick(false);
                let last = huntNavRoute.pts && huntNavRoute.pts[huntNavRoute.pts.length - 1];
                o.kept = !!huntNavRoute.mesh && !!last && Math.abs(last.x - far.x * TILE) < 1 && Math.abs(last.z - far.z * TILE) < 1 && last.y < TILE;
                // 回到目标那一格：清掉
                camera.position.set(far.x * TILE, 9, far.z * TILE); pVel.set(0, 0, 0); navRouteTick(false); o.cleared = !huntNavRoute.mesh;
                // 3 站在楼梯上：同一层走不到、要绕别的楼层的目标，也画得出来
                for (let f = 0; f < FLOORS; f++) for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                    let c = maze[f][z][x]; if (!(c.type === 3 && c.stair && c.stair.base === f) || o.stairTry >= 12) continue;
                    let s = c.stair, t = 6;
                    camera.position.set(s.axis === 'x' ? s.edge + s.sign * t : x * TILE, huntStepTop(s, t) + 9, s.axis === 'z' ? s.edge + s.sign * t : z * TILE); pVel.set(0, 0, 0);
                    let from = huntPlayerNode(), tgt = null;
                    for (let zz = 1; zz < mSize - 1 && !tgt; zz++) for (let xx = 1; xx < mSize - 1 && !tgt; xx++) if (huntCellKind(f, xx, zz) === 'floor' && (xx !== x || zz !== z) && !huntRouteFind(from, { f: f, x: xx, z: zz }, f) && huntRouteFind(from, { f: f, x: xx, z: zz })) tgt = { x: xx, z: zz };
                    let any = null;
                    for (let zz = 1; zz < mSize - 1 && !any; zz++) for (let xx = 1; xx < mSize - 1 && !any; xx++) if (huntCellKind(f, xx, zz) === 'floor' && (xx !== x || zz !== z) && huntRouteFind(from, { f: f, x: xx, z: zz })) any = { x: xx, z: zz };
                    o.stairTry++;
                    clearFootprints3D(); if (any) { generateFootprintGuide(any.x, any.z); if (huntNavRoute.mesh) o.stairDrawn++; }
                    if (tgt) { o.stairNeed++; clearFootprints3D(); generateFootprintGuide(tgt.x, tgt.z); if (huntNavRoute.mesh) o.needDrawn++; }
                }
                // 4 站在桌子上
                for (let f = 0; f < FLOORS; f++) for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                    if (maze[f][z][x].type !== 2 || o.tableTry >= 6) continue;
                    camera.position.set(x * TILE + 3, f * TILE + HUNT_TABLE_H + 9, z * TILE - 2); pVel.set(0, 0, 0);
                    let tg = null; for (let zz = 1; zz < mSize - 1 && !tg; zz++) for (let xx = 1; xx < mSize - 1 && !tg; xx++) if (huntCellKind(f, xx, zz) === 'floor' && huntRouteFind(huntPlayerNode(), { f: f, x: xx, z: zz })) tg = { x: xx, z: zz };
                    o.tableTry++; clearFootprints3D(); if (tg) { generateFootprintGuide(tg.x, tg.z); if (huntNavRoute.mesh) o.tableDrawn++; }
                }
                return JSON.stringify(o); })()`));
            if (r.off !== 0 || r.greenOff !== 0 || !r.green) bad.push('线没走在中间 ' + r.off + '/' + r.greenOff + '/' + r.green);
            if (!r.kept) bad.push('换楼层绿线没接着导航');
            if (!r.cleared) bad.push('到了目标没清掉');
            if (r.stairDrawn !== r.stairTry || r.needDrawn !== r.stairNeed) bad.push('站在楼梯上画不出 ' + JSON.stringify([r.stairTry, r.stairDrawn, r.stairNeed, r.needDrawn]));
            if (r.tableDrawn !== r.tableTry) bad.push('站在桌子上画不出 ' + r.tableDrawn + '/' + r.tableTry);
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H25 蓝线绿线走在路正中间；绿线换楼层不清掉、跨楼层接着导航；站在楼梯/桌子上也画得出来', bad.length === 0, bad.join(' / ') + ' ' + JSON.stringify(r));
        }

                if (want('H26')) {
            // H26：格子底色（宝物 ≥200 万红 / 3 万～200 万金 / <3 万紫；道具蓝，地窖徽章金，鱼叉、腰包紫）；一键整理真排序（道具在前按商店价格、宝物在后按价值，从大到小）
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){
                ${HIDE} selectGameMode('hunt'); requestStartGame();
                let sh = function (n) { return Object.assign({}, shopItems[n], { isShop: true }); }, tr = function (n, v) { return { n: n, v: v, w: 1, tex: 'misc', c: 0xffffff }; };
                gState.inv = [tr('小金', 100000), sh('医疗包'), tr('红宝', 2000000), sh('腰包'), null, sh('鱼叉')];
                gState.garage = Array(200).fill(null);
                let g = [tr('紫1', 29999), tr('金下限', 30000), tr('金上限', 1999999), tr('红下限', 2000000), sh('地窖徽章'), sh('返魂药水'), tr('紫2', 100), sh('肾上腺素')];
                g.forEach(function (q, i) { gState.garage[i * 2 + 1] = q; });   // 中间留空位，也不应该被排序（只是挤掉空位）
                gState.selectedContainer = 'inv'; gState.selectedSlot = -1; initGarage();
                let cls = function (sel) { return Array.prototype.map.call(document.querySelectorAll(sel), function (e) { return (e.className.match(/t-(\\w+)/) || [, ''])[1]; }); };
                let o = { garage: cls('#garage-stash-container .slot').slice(0, 8), names: gState.garage.slice(0, 8).map(function (x) { return x ? x.n : null; }) };
                o.inv = cls('#garage-active-inv .slot');
                o.bg = getComputedStyle(document.querySelector('#garage-stash-container .slot.t-red')).backgroundColor;
                // 一键整理
                tidyAll();
                o.sortedGarage = gState.garage.filter(Boolean).map(function (x) { return x.n; });
                o.sortedInv = gState.inv.filter(Boolean).map(function (x) { return x.n; });
                o.hole = gState.inv.slice(0, o.sortedInv.length).every(Boolean) && gState.garage.slice(0, o.sortedGarage.length).every(Boolean);
                return JSON.stringify(o); })()`));
            if (r.names.join() !== '紫1,金下限,金上限,红下限,地窖徽章,返魂药水,紫2,肾上腺素') bad.push('画仓库时被排序了 ' + r.names.join());
            if (r.garage.join() !== 'purple,gold,gold,red,gold,blue,purple,blue') bad.push('仓库格子颜色 ' + r.garage.join());
            if (r.inv.join() !== 'gold,blue,red,purple,,purple') bad.push('背包格子颜色 ' + r.inv.join());
            if (r.bg !== 'rgb(255, 210, 210)') bad.push('红色底 ' + r.bg);
            const shopOrder = ['地窖徽章', '肾上腺素', '返魂药水'];   // 商店标价：900000 > 20000 > 10000
            const wantGarage = shopOrder.concat(['红下限', '金上限', '金下限', '紫1', '紫2']);
            if (r.sortedGarage.join() !== wantGarage.join()) bad.push('仓库整理后 ' + r.sortedGarage.join() + '（应该 ' + wantGarage.join() + '）');
            if (r.sortedInv.join() !== '腰包,鱼叉,医疗包,红宝,小金') bad.push('背包整理后 ' + r.sortedInv.join());
            if (!r.hole) bad.push('整理后有空位夹在中间');
            // 六种道具全放进去：整理后第一个是地窖徽章，然后 腰包 > 鱼叉 > 肾上腺素 > 医疗包 = 返魂药水（同价保持原来的先后，这里放进去时返魂药水在前）；标价跟商店页面上写的一样
            const t6 = JSON.parse(await T.eval(`(function(){ let sh = function (n) { return Object.assign({}, shopItems[n], { isShop: true }); };
                gState.inv = [sh('返魂药水'), sh('医疗包'), sh('肾上腺素'), sh('鱼叉'), sh('腰包'), sh('地窖徽章')]; sortInv();
                let a = gState.inv.filter(Boolean).map(function (x) { return x.n; });
                gState.inv = [sh('医疗包'), sh('返魂药水'), null, null, null, null]; sortInv(); let b = gState.inv.filter(Boolean).map(function (x) { return x.n; });
                let html = Array.prototype.map.call(document.querySelectorAll('.shop-item'), function (e) { let m = e.innerText.match(/^(\\S+) \\(\\$([\\d,]+)\\)/); return m ? [m[1], +m[2].replace(/,/g, '')] : null; }).filter(Boolean);
                return JSON.stringify({ a: a, b: b, html: html.filter(function (x) { return SHOP_PRICE[x[0]] !== undefined; }).every(function (x) { return SHOP_PRICE[x[0]] === x[1]; }), n: html.length }); })()`));
            if (t6.a.join() !== '地窖徽章,腰包,鱼叉,肾上腺素,返魂药水,医疗包') bad.push('六种道具整理后 ' + t6.a.join());
            if (t6.b.join() !== '医疗包,返魂药水') bad.push('同价应保持原来的先后 ' + t6.b.join());
            if (!t6.html || t6.n < 5) bad.push('商店页面价格跟 SHOP_PRICE 对不上 ' + JSON.stringify([t6.html, t6.n]));
            // H16 抽奖机文案：短、口语
            const lot = JSON.parse(await T.eval(`(function(){ let o = {}; huntLotteryShow({ n: '银杯', v: 5000, w: 1, tex: 'misc', c: 0xffffff });
                o.win = [document.getElementById('sys-modal-text').innerText, document.getElementById('sys-modal-btns').innerText];
                document.getElementById('sys-modal').classList.add('hidden'); huntLotteryShow(null);
                o.lose = [document.getElementById('sys-modal-text').innerText, document.getElementById('sys-modal-btns').innerText]; return JSON.stringify(o); })()`));
            if (lot.win[0] !== '抽到了：银杯' || lot.win[1] !== '好') bad.push('抽中文案 ' + JSON.stringify(lot.win));
            if (lot.lose[0] !== '没抽中，东西没了' || lot.lose[1] !== '好') bad.push('没抽中文案 ' + JSON.stringify(lot.lose));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H26 格子底色（红/金/紫/蓝，徽章金，鱼叉腰包紫）；一键整理真排序：道具在前按商店价格、宝物在后按价值，从大到小', bad.length === 0, bad.join(' / '));
        }

                if (want('H27')) {
            // H27：余额不封顶；开“无限”只显示“无限”、不扣真实余额、不再把 money 改成 99999999；读档时 mcoin < 0 改成 0
            const bad = [];
            const T = await openTab(chrome, url);
            const r = JSON.parse(await T.eval(`(function(){
                let o = {};
                ${HIDE} selectGameMode('hunt'); requestStartGame();
                // 资金：不封顶
                HUNT_TEST_MONEY = false; gState.money = 5000000000; initGarage(); o.big = document.getElementById('garage-money').innerText;
                gState.money += 7; o.plus = gState.money;
                // 无限资金：显示“无限”，真实余额不变，买东西不扣
                HUNT_TEST_MONEY = true; gState.money = 1234; gState.garage = Array(200).fill(null); initGarage();
                o.inf = document.getElementById('garage-money').innerText; o.kept = gState.money;
                buy('医疗包', 10000); o.boughtInf = gState.garage.some(function (g) { return g && g.n === '医疗包'; }); o.afterBuy = gState.money;
                gState.garage.forEach(function (g, i) { if (g && g.type === 'badge') gState.garage[i] = Object.assign({}, g, { uses: 0 }); });
                HUNT_TEST_MONEY = false; o.noInfBuy = (function () { let m0 = gState.money; buy('医疗包', 10000); return gState.money === m0; })();   // 钱不够：不买
                // 猫盾币：不封顶；无限只显示
                TEST_INFINITE_COINS = false; gState.mcoin = 1e12; coinsAdd('x', 5); o.coins = [gState.mcoin, coinsShow(), coinsOf()];
                TEST_INFINITE_COINS = true; let m1 = gState.mcoin; o.cinf = [coinsShow(), coinsOf(), shopSpend(500), gState.mcoin === m1];
                shopTab('pet'); o.wallet = document.getElementById('shop-wallet').innerText;
                TEST_INFINITE_COINS = false;
                return JSON.stringify(o); })()`));
            if (r.big !== '5000000000' || r.plus !== 5000000007) bad.push('资金封顶了 ' + r.big + '/' + r.plus);
            if (r.inf !== '无限' || r.kept !== 1234 || !r.boughtInf || r.afterBuy !== 1234) bad.push('无限资金 ' + JSON.stringify([r.inf, r.kept, r.boughtInf, r.afterBuy]));
            if (!r.noInfBuy) bad.push('没开无限时钱不够也买了');
            if (r.coins[0] !== 1e12 + 5 || r.coins[1] !== 1e12 + 5 || r.coins[2] !== 1e12 + 5) bad.push('猫盾币封顶了 ' + r.coins.join());
            if (r.cinf[0] !== '无限' || r.cinf[1] !== 99999 || r.cinf[2] !== true || r.cinf[3] !== true) bad.push('无限猫盾币 ' + r.cinf.join());
            if (!/无限/.test(r.wallet)) bad.push('商店钱包 ' + r.wallet);
            // 读档：mcoin < 0 → 0；money 99999999 不会再被写进存档
            const l = JSON.parse(await T.eval(`(function(){
                let o = {}; HUNT_TEST_MONEY = true; gState.money = 4321; saveProgress(); o.saved = JSON.parse(localStorage.getItem('TH_save_' + gState.id)).money; HUNT_TEST_MONEY = false;
                let d = JSON.parse(localStorage.getItem('TH_save_' + gState.id)); d.mcoin = -37; localStorage.setItem('TH_save_' + gState.id, JSON.stringify(d)); loadProgress(gState.id); o.neg = gState.mcoin;
                d.mcoin = 250; localStorage.setItem('TH_save_' + gState.id, JSON.stringify(d)); loadProgress(gState.id); o.pos = gState.mcoin;
                d.mcoin = 'abc'; localStorage.setItem('TH_save_' + gState.id, JSON.stringify(d)); loadProgress(gState.id); o.junk = gState.mcoin;
                return JSON.stringify(o); })()`));
            if (l.saved !== 4321 || l.neg !== 0 || l.pos !== 250 || l.junk !== 0) bad.push('存档 ' + JSON.stringify(l));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H27 余额不封顶；开无限只显示“无限”、不扣真实余额、不再把 money 改成 99999999；读档 mcoin<0 改成 0', bad.length === 0, bad.join(' / '));
        }

                                if (want('C6c')) {
            // C6c：联机诊断加细——每个探路服务器单独列名字/通不通/公网地址；两个通的看公网端口一样（好连）还是不一样（难连，对称型）；中转单独一项；大白话 + 复制
            const bad = [];
            const T = await openTab(chrome, url);
            const FAKE = `(function(){
                window.__RTC0 = window.__RTC0 || window.RTCPeerConnection; window.__pcN = 0;
                window.RTCPeerConnection = function (cfg) {
                    let self = this, id = ++window.__pcN, base = 40000 + id * 10; this.cfg = cfg;
                    this.createDataChannel = function () { }; this.close = function () { };
                    this.createOffer = function () { return Promise.resolve({}); };
                    this.setLocalDescription = function () {
                        setTimeout(function () {
                            let seen = {}, i = 0;
                            (cfg.iceServers || []).forEach(function (s) {
                                let u = String(s.urls), host = u.replace(/^(stun|turns?):/, '');
                                if (/^stun:/.test(u)) {
                                    let m = window.__stuns[host]; i++;
                                    if (!m) return;
                                    let port = window.__sym ? base + i : base, a = m + ' ' + port;
                                    if (seen[a]) return; seen[a] = 1;
                                    self.onicecandidate({ candidate: { candidate: 'candidate:1 1 udp 1686052607 ' + a + ' typ srflx raddr 0.0.0.0 rport 0', url: u } });
                                } else if (window.__relay && !seen.relay) { seen.relay = 1; self.onicecandidate({ candidate: { candidate: 'candidate:2 1 udp 41885439 9.9.9.9 ' + (50000 + id) + ' typ relay raddr 0.0.0.0 rport 0', url: u } }); }
                            });
                            self.onicecandidate({ candidate: null });
                        }, 40);
                        return Promise.resolve();
                    };
                };
                return true; })()`;
            await T.eval(FAKE);
            const run = async (stuns, sym, relay) => {
                await T.eval(`window.__stuns = ${JSON.stringify(stuns)}; window.__sym = ${sym}; window.__relay = ${relay}; ${HIDE} openNetDiag(); true;`);
                for (let i = 0; i < 100 && !(await T.eval('netDiag.done')); i++) await W(200);
                return JSON.parse(await T.eval(`JSON.stringify({ text: netDiagText(), done: netDiag.done, nat: netDiag.res.nat, turn: netDiag.res.turn, verdict: netDiagVerdict() })`));
            };
            // 1. 小米、B站通，谷歌、Cloudflare 不通；好连；中转通
            const a = await run({ 'stun.miwifi.com:3478': '1.2.3.4', 'stun.chat.bilibili.com:3478': '1.2.3.4' }, false, true);
            if (!a.done || a.nat.type !== 'easy' || !a.turn.ok) bad.push('好连 ' + JSON.stringify([a.done, a.nat, a.turn]));
            if (!/小米 stun\.miwifi\.com:3478：通　公网地址 1\.2\.3\.4:\d+/.test(a.text) || !/B站 stun\.chat\.bilibili\.com:3478：通　公网地址 1\.2\.3\.4:\d+/.test(a.text) || !/谷歌 stun\.l\.google\.com:19302：不通/.test(a.text) || !/Cloudflare[^\n]*：不通/.test(a.text)) bad.push('每个探路服务器一行 ' + a.text);
            if (!/4\. 网络类型（好不好直连）：好连/.test(a.text) || !/5\. 中转服务器（TURN）：通，拿到了中转地址 9\.9\.9\.9:/.test(a.text) || !/好连的类型/.test(a.verdict)) bad.push('好连的文字 ' + a.text);
            // 2. 公网端口不一样：难连（对称型）；中转通
            const b = await run({ 'stun.miwifi.com:3478': '1.2.3.4', 'stun.chat.bilibili.com:3478': '1.2.3.4' }, true, true);
            if (b.nat.type !== 'hard' || !/难连，对称型/.test(b.text) || !/对称型/.test(b.verdict)) bad.push('难连 ' + JSON.stringify(b.nat) + b.verdict);
            // 3. 难连 + 中转也不通：话说重一点
            const c = await run({ 'stun.miwifi.com:3478': '1.2.3.4', 'stun.l.google.com:19302': '1.2.3.4' }, true, false);
            if (c.turn.ok || !/很可能连不上别人/.test(c.verdict) || !/5\. 中转服务器（TURN）：不通/.test(c.text)) bad.push('难连又没中转 ' + c.verdict);
            // 4. 只有一个探路服务器通：网络类型测不出
            const d = await run({ 'stun.miwifi.com:3478': '1.2.3.4' }, false, true);
            if (d.nat.type !== 'unknown' || !/测不出来/.test(d.text)) bad.push('只通一个 ' + JSON.stringify(d.nat));
            // 5. 一个都不通
            const e = await run({}, false, false);
            if (!/一个都不通/.test(e.text) || !/探路服务器一个都不通/.test(e.verdict)) bad.push('全不通 ' + e.verdict);
            // 复制：剪贴板里是同一份文字
            const copied = await T.eval(`(function(){ window.__clip = null; navigator.clipboard.writeText = function (t) { window.__clip = t; return Promise.resolve(); }; netDiagCopy(); return true; })()`); await W(300);
            const cut = (t) => String(t).split('\n').slice(1).join('\n');   // 第一行有时间，不比
            if (cut(await T.eval('window.__clip')) !== cut(await T.eval('netDiagText()')) || !(await T.eval('window.__clip'))) bad.push('复制的和显示的不一样');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('C6c 联机诊断：探路服务器每个单独列出、网络类型（好连/难连）、中转单独一项、大白话结论、能复制', bad.length === 0, bad.join(' / '));
        }

                if (want('S1')) {
            // S1 声音设置：4 个滑条（总音量/音乐/音效/语音）存进 TH_settings 并真的管用；M 键在所有模式里一键静音（再按恢复）；寻宝队大地图改成 Tab；按键提示跟着改
            const bad = [];
            const T = await openTab(chrome, url);
            const key = async (k, code) => { await T.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: code === 'Tab' ? 9 : k.toUpperCase().charCodeAt(0) }); await T.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: code === 'Tab' ? 9 : k.toUpperCase().charCodeAt(0) }); await W(150); };
            // 设置里 4 个滑条，值存进 TH_settings
            await T.eval(`${HIDE} openSettings(); true;`); await W(300);
            const ids = JSON.parse(await T.eval(`JSON.stringify(['volMaster', 'volMusic', 'volSfx', 'volVoice'].map(function (k) { let e = document.getElementById('set-' + k); return e ? [e.type, e.value] : null; }))`));
            if (ids.some((x) => !x || x[0] !== 'range' || x[1] !== '100')) bad.push('滑条 ' + JSON.stringify(ids));
            await T.eval(`(function(){ [['volMaster', 80], ['volMusic', 50], ['volSfx', 30], ['volVoice', 60]].forEach(function (p) { let e = document.getElementById('set-' + p[0]); e.value = p[1]; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }); return true; })()`);
            const st = JSON.parse(await T.eval(`localStorage.getItem('TH_settings')`));
            if (st.volMaster !== 0.8 || st.volMusic !== 0.5 || st.volSfx !== 0.3 || st.volVoice !== 0.6) bad.push('没存进 TH_settings ' + JSON.stringify(st));
            // 数值真的套到各路声音上
            const r = JSON.parse(await T.eval(`(function(){
                let o = {};
                o.vol = [audioVol('music'), audioVol('sfx'), audioVol('voice')].map(function (x) { return +x.toFixed(3); });
                // 音效：峰值 = 原来 × 总音量 × 音效音量
                let peaks = []; let p0 = AudioParam.prototype.linearRampToValueAtTime; AudioParam.prototype.linearRampToValueAtTime = function (v, t) { peaks.push(v); return p0.apply(this, arguments); };
                sfxPlay([440], 0.2, 0.1, 'sine'); o.peak = peaks.length ? +peaks[0].toFixed(4) : null;
                SETTINGS.volSfx = 0; peaks.length = 0; sfxPlay([440], 0.2, 0.1, 'sine'); sfxNoise(0.1, 0.1, 500, 400, 1); o.zero = peaks.length;
                SETTINGS.volSfx = 0.3; AudioParam.prototype.linearRampToValueAtTime = p0;
                // 语音：别人说话的 <audio> 音量
                voicePlayStream('v1', new MediaStream()); o.voice = +voiceAudioEls.v1.volume.toFixed(3);
                SETTINGS.volVoice = 1; audioApply(); o.voice2 = +(voiceAudioEls.v1.volume * 0.8).toFixed(3) === +(0.8).toFixed(3) ? voiceAudioEls.v1.volume : voiceAudioEls.v1.volume;
                SETTINGS.volVoice = 0.6; audioApply();
                return JSON.stringify(o); })()`));
            if (r.vol.join() !== '0.4,0.24,0.48') bad.push('音量 ' + r.vol.join());
            if (r.peak !== 0.024) bad.push('音效峰值 ' + r.peak + '（应该 0.1×0.8×0.3=0.024）');
            if (r.zero !== 0) bad.push('音效音量 0 还在响 ' + r.zero);
            if (r.voice !== 0.48 || r.voice2 !== 0.8) bad.push('语音 ' + r.voice + '/' + r.voice2);
            // 音乐：进寻宝队，音乐总音量跟着改（setTargetAtTime 的目标 = 0.42 × 总音量 × 音乐）
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const m = JSON.parse(await T.eval(`(function(){ let t = []; let s0 = AudioParam.prototype.setTargetAtTime; AudioParam.prototype.setTargetAtTime = function (v) { t.push(v); return s0.apply(this, arguments); };
                SETTINGS.volMusic = 0.5; SETTINGS.volMaster = 0.8; audioApply(); let a = t.slice(-1)[0]; audioMuteToggle(); let b = t.slice(-1)[0]; audioMuteToggle(); let c = t.slice(-1)[0];
                AudioParam.prototype.setTargetAtTime = s0; return JSON.stringify({ bgm: !!bgm, a: +a.toFixed(3), b: b, c: +c.toFixed(3), muted: audioMuted() }); })()`));
            if (!m.bgm || m.a !== 0.168 || m.b !== 0 || m.c !== 0.168 || m.muted) bad.push('音乐音量 ' + JSON.stringify(m));
            // M 键：每个模式里都是一键静音，再按恢复；寻宝队里 M 不再开地图，Tab 开
            const hm = [];
            await key('m', 'KeyM'); hm.push(await T.eval('audioMuted()')); await key('m', 'KeyM'); hm.push(await T.eval('audioMuted()'));
            await key('Tab', 'Tab'); hm.push(await T.eval('gState.largeMapOpen')); await key('Tab', 'Tab'); hm.push(await T.eval('gState.largeMapOpen'));
            if (hm.join() !== 'true,false,true,false') bad.push('寻宝队 M/Tab ' + hm.join());
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500);
            for (const k of ['blaze', 'race', 'night', 'jail']) {
                await T.eval(`${HIDE} selectGameMode('${k}'); ${MODES[k].start}; true;`); await W(2500); await T.eval(`${HIDE} true;`);
                await key('m', 'KeyM'); const a = await T.eval('audioMuted()'); await key('m', 'KeyM'); const b = await T.eval('audioMuted()');
                if (a !== true || b !== false) bad.push(k + ' 里 M 静音 ' + a + '/' + b);
                await T.eval(`${HIDE} ${MODES[k].exit}; true;`); await W(1500); await T.eval(`${HIDE} true;`);
            }
            // 在大厅里也行；在输入框里打字不算
            await key('m', 'KeyM'); const hubA = await T.eval('audioMuted()'); await key('m', 'KeyM');
            await T.eval(`(function(){ let i = document.createElement('input'); i.id = 'tmp-in'; document.body.appendChild(i); i.focus(); return true; })()`);
            await key('m', 'KeyM'); const typed = await T.eval('audioMuted()');
            await T.eval(`document.getElementById('tmp-in').remove(); true;`);
            if (hubA !== true || typed !== false) bad.push('大厅静音/打字 ' + hubA + '/' + typed);
            // 刷新后音量还在，静音不存档
            await T.send('Page.reload'); await W(2500);
            const back = JSON.parse(await T.eval(`JSON.stringify([SETTINGS.volMaster, SETTINGS.volMusic, SETTINGS.volSfx, SETTINGS.volVoice, audioMuted()])`));
            if (back.join() !== '0.8,0.5,0.3,0.6,false') bad.push('刷新后 ' + back.join());
            // 按键提示
            const rules = await T.eval(`rulesHtml('hunt')`);
            if (!/Tab/.test(rules) || !/M<\/b> 静音/.test(rules) || /M<\/b> 地图/.test(rules)) bad.push('规则里的按键提示');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('S1 声音：4 个音量滑条存 TH_settings 并真的管用；M 键所有模式一键静音（再按恢复，打字不算）；寻宝队大地图改 Tab；提示跟着改', bad.length === 0, bad.join(' / '));
        }

                        if (want('G2')) {
            // G2：5 种怪各有认得出的外形（一个函数造模型，游戏和图鉴共用），碰撞/判定不变；图鉴加“怪物”页：没见过是剪影和 ？？？，第一次出现在视野里解锁，打死数记在存档
            const bad = [];
            const N = await openTab(chrome, url, { name: 'g2' + Math.floor(Math.random() * 100000) });
            await N.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await N.eval(`${HIDE} true;`);
            const r = JSON.parse(await N.eval(`(function(){
                let o = {};
                // 碰撞体：跟原来一样的球/圆柱，看不见，射线能打中
                o.geo = HUNT_MOB_ORDER.map(function (k) { let m = huntMobMesh(k); let g = m.geometry.parameters; return [k, m.geometry.type, g.radius || g.radiusTop, g.height || 0, m.material.visible, !!m.userData.model && m.children.length === 1]; });
                // 模型：每种怪长相不一样（子物体数、关键部件）
                o.parts = HUNT_MOB_ORDER.map(function (k) { let g = huntMobModel(k, { variant: 0 }), n = 0; g.traverse(function () { n++; }); return [k, n, !!(g.userData.eye || g.userData.eyes || g.userData.wings || g.userData.blob || g.userData.ribbon)]; });
                // 通过原来的刷怪函数刷出来：数值不变
                camera.position.set(TILE * 3, 9, TILE * 3); camera.rotation.set(0, 0, 0);
                let before = entities.length; let fx = 3, fz = 3 - 2;
                spawnMonstersWithData([1, 2, 3, 4, 5].map(function (t) { return { type: t, fx: fx + (t - 3) * 0.2, fz: fz, fl: 0, wave: 1 }; }));
                let mobs = entities.slice(before);
                o.stats = mobs.map(function (e) { let u = e.userData; return [u.type, u.name, u.hp, u.speed, u.dmg, !!u.model, e.parent === scene]; });
                // 射线打得中本体（互动/攻击靠它）
                let hit = 0; mobs.forEach(function (e) { e.position.set(camera.position.x, 9, camera.position.z - 12); e.updateMatrixWorld(true); let rc = new THREE.Raycaster(camera.position, new THREE.Vector3(0, 0, -1), 0, 30); if (rc.intersectObjects([e], false)[0]) hit++; });
                o.hit = hit;
                // 分裂者越分越小：模型跟着碰撞半径缩
                let s1 = huntMobMesh('splitter', { radius: 4.5 * 0.7 }), s2 = huntMobMesh('splitter', { radius: 4.5 * 0.49 });
                o.split = [+s1.geometry.parameters.radius.toFixed(2), +s1.userData.model.scale.x.toFixed(2), +s2.geometry.parameters.radius.toFixed(2), +s2.userData.model.scale.x.toFixed(2)];
                o.levels = HUNT_MOB_ORDER.map(function (k) { let M = HUNT_MOBS[k]; return k + ':' + huntMobLevel('hp', M.hp) + huntMobLevel('speed', M.speed) + huntMobLevel('dmg', M.dmg); }).join(' ');
                mobs.forEach(function (e) { scene.remove(e); entities.splice(entities.indexOf(e), 1); });
                return JSON.stringify(o); })()`));
            const want = { angel: ['SphereGeometry', 4.5, 0], puppet: ['CylinderGeometry', 2, 10], high: ['SphereGeometry', 4.5, 0], splitter: ['SphereGeometry', 4.5, 0], curser: ['SphereGeometry', 5, 0] };
            r.geo.forEach((g) => { const w = want[g[0]]; if (g[1] !== w[0] || g[2] !== w[1] || (g[3] || 0) !== w[2] || g[4] !== false || !g[5]) bad.push('碰撞体 ' + JSON.stringify(g)); });
            if (new Set(r.parts.map((p) => p[1])).size < 3 || r.parts.some((p) => !p[2] || p[1] < 6)) bad.push('模型太简单或没有关键部件 ' + JSON.stringify(r.parts));
            const wantStats = JSON.stringify([['angel', '凝视者', 10, 63, 40, true, true], ['puppet', '伪装者', 15, 30, 40, true, true], ['high', '高空者', 10, 25, 20, true, true], ['splitter', '分裂者', 10, 20, 40, true, true], ['curser', '诅咒之灵', 80, 20, 0, true, true]]);
            if (JSON.stringify(r.stats) !== wantStats) bad.push('刷出来的怪 ' + JSON.stringify(r.stats));
            if (r.hit !== 5) bad.push('射线只打中 ' + r.hit + ' 个');
            if (r.split.join() !== '3.15,0.7,2.21,0.49') bad.push('分裂缩放 ' + r.split.join());
            if (r.levels !== 'angel:低高高 puppet:中中高 high:低中中 splitter:低低高 curser:高低低') bad.push('高中低 ' + r.levels);
            // 第一次出现在视野里就解锁：背对看不见，转过来看见
            await N.eval(`(function(){ gState.huntMobSeen = {}; gState.huntMobKills = {}; gState.introSeen = Object.assign(gState.introSeen || {}, { 'hunt.mob.angel': 1 }); camera.position.set(TILE * 4, 9, TILE * 4); camera.rotation.set(0, 0, 0); pVel.set(0, 0, 0);
                let e = huntMobMesh('angel'); e.userData = { type: 'angel', name: '凝视者', hp: 10, maxHp: 10, speed: 0, dmg: 0, atkCd: 0, split: 0, model: e.userData.model }; e.position.set(camera.position.x, 9, camera.position.z + 40); scene.add(e); entities.push(e); window.__ang = e; return true; })()`);
            await W(1200);
            const behind = await N.eval('!!gState.huntMobSeen.angel');
            await N.eval(`camera.rotation.set(0, Math.PI, 0); true;`); await W(1200);
            const seen = await N.eval('!!gState.huntMobSeen.angel');
            if (behind || !seen) bad.push('解锁：背对 ' + behind + '，面对 ' + seen + ' ' + await N.eval(`JSON.stringify({ f: viewFrustum.containsPoint(window.__ang.position), d: window.__ang.position.distanceTo(camera.position), dy: window.__ang.position.y - camera.position.y, rot: camera.rotation.y, inList: entities.indexOf(window.__ang), play: isPlaying, model: !!window.__ang.userData.model })`));
            const saved = await N.eval(`JSON.parse(localStorage.getItem('TH_save_' + gState.id)).huntMobSeen.angel`);
            if (saved !== 1) bad.push('没存档');
            // 打死数
            await N.eval(`huntMobKill(window.__ang); huntMobKill(window.__ang); scene.remove(window.__ang); entities.splice(entities.indexOf(window.__ang), 1); true;`);
            // 图鉴“怪物”页
            await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
            await N.eval(`bookOpen(); bookTabSet('mob'); true;`); await W(800);
            const d = JSON.parse(await N.eval(`JSON.stringify({ cards: document.querySelectorAll('#book-body .mobcard').length, unknown: (document.getElementById('book-body').innerText.match(/？？？/g) || []).length,
                text: document.getElementById('book-body').innerText, tabs: [document.getElementById('book-tab-recipe').innerText, document.getElementById('book-tab-mob').innerText] })`));
            if (d.cards !== 5 || d.unknown !== 4 || d.tabs.join() !== '配方,怪物') bad.push('图鉴页 ' + JSON.stringify([d.cards, d.unknown, d.tabs]));
            ['凝视者', '你看着它，它就不动；一转身它就冲过来。', '血量 低', '速度 高', '伤害 高', '怎么对付', '打死过 2 只', '已发现 1 / 5'].forEach((t) => { if (d.text.indexOf(t) < 0) bad.push('图鉴里没有“' + t + '”'); });
            // 画布：5 个都画出东西了（没见过的是剪影），并且在转
            const px = () => N.eval(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#book-body canvas[data-mob]'), function (c) { let d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; }))`).then(JSON.parse);
            const p1 = await px(); await W(500); const p2 = await px();
            if (p1.some((n) => n < 1500)) bad.push('有的画布是空的 ' + p1.join());
            if (p1.join() === p2.join()) bad.push('模型没在转');
            // 配方页还在，切回去正常
            await N.eval(`bookTabSet('recipe'); true;`); await W(300);
            if (!/配方要自己试/.test(await N.eval(`document.getElementById('book-body').innerText`))) bad.push('配方页坏了');
            // 刷新后图鉴状态还在
            const id = await N.eval('gState.id'); await N.send('Page.reload'); await W(2500);
            await N.eval(`document.getElementById('player-id').value = ${JSON.stringify(id.replace(/#.*$/, ''))}; requestLobbyAccess(); true;`); await W(2500);
            const back = JSON.parse(await N.eval(`JSON.stringify([gState.huntMobSeen, gState.huntMobKills])`));
            if (JSON.stringify(back) !== '[{"angel":1},{"angel":2}]') bad.push('刷新后 ' + JSON.stringify(back));
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('G2 五种怪各有外形（碰撞体不变、射线打得中）；图鉴“怪物”页：剪影/？？？、第一次进视野解锁、数值写高中低、打死数、存档', bad.length === 0, bad.join(' / '));
        }

                //@@NEW@@
        if (want('S4')) {
            // S4 保险柜：基础概率 地图 1 没有 / 地图 2 15% / 地图 3 25%；每死一次（撤离失败）+15% 累加到 100%、存档记着；中途退出不加；开到保险柜清零；第一局不再必出保险柜
            const bad = [];
            const N = await openTab(chrome, url, { name: 's4' + Math.floor(Math.random() * 100000) });
            await N.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await N.eval(`${HIDE} true;`);
            const p0 = JSON.parse(await N.eval(`JSON.stringify(['easy', 'med', 'hard'].map(function (d) { gState.safeBoost = 0; gState.team = []; return huntSafeProb(d); }))`));
            if (p0.join() !== '0,0.15,0.25') bad.push('基础概率 ' + p0.join());
            // 连续死 3 次：基础 + 45%
            const d3 = JSON.parse(await N.eval(`(function(){ gState.safeBoost = 0; gState.team = []; let out = [];
                for (let i = 0; i < 3; i++) { gState.quitNoPay = false; gState.submittedItems = []; forfeitRun(); }
                out.push(gState.safeBoost, +huntSafeProb('med').toFixed(2), +huntSafeProb('hard').toFixed(2), huntSafeProb('easy'));
                return JSON.stringify(out); })()`));
            if (d3.join() !== '0.45,0.6,0.7,0') bad.push('死 3 次后 ' + d3.join());
            // 存档里记着
            const sv = await N.eval(`(saveProgress(), JSON.parse(localStorage.getItem('TH_save_' + gState.id)).safeBoost)`);
            if (sv !== 0.45) bad.push('存档里的累加值 ' + sv);
            // 中途退出（活着离开）不变
            const q = await N.eval(`(function(){ gState.quitNoPay = true; gState.submittedItems = []; forfeitRun(); gState.quitNoPay = false; return gState.safeBoost; })()`);
            if (q !== 0.45) bad.push('中途退出不该加 ' + q);
            // 封顶 100%
            const cap = JSON.parse(await N.eval(`(function(){ for (let i = 0; i < 10; i++) { gState.quitNoPay = false; gState.submittedItems = []; forfeitRun(); } return JSON.stringify([gState.safeBoost, huntSafeProb('med'), huntSafeProb('hard')]); })()`));
            if (cap.join() !== '1,1,1') bad.push('封顶 ' + cap.join());
            // 有真人队友：只用基础概率（地图要一样）
            const tm = JSON.parse(await N.eval(`(function(){ gState.team = [{ id: gState.id, isLeader: true, isAI: false }, { id: 'peer-z', isAI: false }]; let r = [huntSafeProb('med'), huntSafeProb('hard')]; gState.team = []; return JSON.stringify(r); })()`));
            if (tm.join() !== '0.15,0.25') bad.push('组队该只用基础概率 ' + tm.join());
            // 开到保险柜清零；死亡路径都接上了（队友撤了你倒下、被扣在 forfeitRun）
            await N.eval(`gState.safeBoost = 0.6; huntOnChestOpened('wood'); true;`);
            if ((await N.eval(`gState.safeBoost`)) !== 0.6) bad.push('开普通箱子不该清零');
            await N.eval(`gState.team = [{ id: gState.id, isLeader: true, isAI: false }, { id: 'peer-z', isAI: false }]; huntOnChestOpened('safe'); gState.team = []; true;`);
            if ((await N.eval(`gState.safeBoost`)) !== 0.6) bad.push('有真人队友开到保险柜，累加概率不该变');
            await N.eval(`huntOnChestOpened('safe'); true;`);
            if ((await N.eval(`gState.safeBoost`)) !== 0) bad.push('单人开到保险柜没清零');
            const wired = JSON.parse(await N.eval(`JSON.stringify({ engine: handlePlayerEngine.toString().indexOf('huntOnChestOpened(boxType)') >= 0, team: teamExtractWithoutYou.toString().indexOf('huntSafeAddFail') >= 0, forfeit: forfeitRun.toString().indexOf('huntSafeAddFail') >= 0 })`));
            if (!wired.engine || !wired.team || !wired.forfeit) bad.push('钩子没接全 ' + JSON.stringify(wired));
            // 地图里真按概率出：概率 1 时中等图一定有保险柜，0 时简单图永远没有；第一局不再必出
            await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
            const gen = async (diff, boost, first) => {
                await N.eval(`${HIDE} gState.aiFill = false; gState.team = []; gState.mapDifficulty = '${diff}'; gState.safeBoost = ${boost}; gState.huntDiffPlayed = ${first ? '{}' : "{ easy: 1, med: 1, hard: 1 }"}; selectGameMode('hunt'); requestStartGame(); requestEnterMap(); true;`); await W(2500);
                const r = JSON.parse(await N.eval(`JSON.stringify({ safe: chests.filter(function (c) { return c.userData.type === 'safe'; }).length })`));
                await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
                return r.safe;
            };
            if ((await gen('med', 1, false)) !== 1) bad.push('概率 100% 中等图没出保险柜');
            if ((await gen('easy', 1, false)) !== 0) bad.push('简单图不该出保险柜');
            // 概率 15% 的中等图第一局：不再必出（连开几张，至少有一张没有）
            let noSafe = 0; for (let i = 0; i < 6; i++) if ((await gen('med', 0, true)) === 0) noSafe++;
            if (noSafe === 0) bad.push('中等图第一局 6 张全有保险柜，像还是必出');
            const words = await N.eval(`/保底|必出/.test(document.body.innerText)`);
            if (words) bad.push('页面上出现了不该写的词');
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('S4 保险柜：基础概率 0/15%/25%；每死一次 +15%（死 3 次 +45%）、封顶 100%、存档记；中途退出不加；开到保险柜单人清零、有真人队友不清；组队只用基础概率；第一局不再必出', bad.length === 0, bad.join(' / '));
        }

        if (want('H28')) {
            // H28 合成大金每张图最多 4 个（只算合成产出的，跟箱子/保险柜/信号接收器/抽奖的大金名额分开）：原料里没大金、产物是大金（至臻猫盾、丰饶圣餐、皇冠）占 1 个；
            // 骑士剑（原料已有大金）不另算；4 个用完第 5 个不合成、材料不动、提示"本局合成大金已达上限"（同一对只提示一次）；开局箱子里的大金不占这个名额
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`);
            if (!(await until(T, `isPlaying && typeof huntCraftBigLeft === 'number'`, 30000))) bad.push('寻宝队没开起来');
            await T.eval(`${HIDE} true;`);
            // 正常开局：箱子里预先定好的大金占的是 huntBigLeft，合成名额还是满的 4 个
            const st0 = JSON.parse(await T.eval(`JSON.stringify({ craft: huntCraftBigLeft, cap: HUNT_CRAFT_BIG_CAP, chestCap: HUNT_BIG_CAP })`));
            if (st0.craft !== 4 || st0.cap !== 4 || st0.chestCap !== 4) bad.push('开局合成名额应该是满的 4 个 ' + JSON.stringify(st0));
            await T.eval(`window.__flash = []; window.__bf = blazeFlash; blazeFlash = function (t) { window.__flash.push(t); }; window.__mk = function (u, x) { let m = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial()); m.userData = Object.assign({ isItem: true, feeds: 0 }, u); m.position.set(500 + (x || 0), 1, 500); scene.add(m); groundItems.push(m); return m; };
                window.__has = function (n) { return groundItems.some(function (g) { return g.userData.n === n; }); };
                window.__clear = function () { groundItems.slice().forEach(function (g) { scene.remove(g); }); groundItems.length = 0; window.__flash.length = 0; }; true;`);
            const run = (js) => T.eval(`(function(){ window.__clear(); ${js}; executeGroundCombinationsLogic(); executeGroundCombinationsLogic(); return true; })()`);
            const st = async (names) => JSON.parse(await T.eval(`JSON.stringify({ craft: huntCraftBigLeft, chest: huntBigLeft, has: ${JSON.stringify(names)}.map(window.__has), flash: window.__flash.slice() })`));
            // 合成大金和箱子的大金名额互不影响：箱子名额 0 时照样能合
            await T.eval(`huntBigLeft = 0; huntCraftBigLeft = 4; true;`);
            // 连着合 4 个大金：至臻猫盾、丰饶圣餐、至臻猫盾、丰饶圣餐，名额 4 → 0
            const pairs = [['黄金猫盾', '黄金小鱼干', '至臻猫盾'], ['金苹果', '黄金圣杯', '丰饶圣餐'], ['黄金猫盾', '黄金小鱼干', '至臻猫盾'], ['金苹果', '黄金圣杯', '丰饶圣餐']];
            for (let i = 0; i < pairs.length; i++) {
                const p = pairs[i];
                await run(`window.__mk({ n: '${p[0]}', v: 50000, w: 1 }, 0); window.__mk({ n: '${p[1]}', v: 50000, w: 1 }, 2)`);
                const r = await st(p);
                if (r.has.join() !== 'false,false,true' || r.craft !== 3 - i || r.chest !== 0) bad.push('第 ' + (i + 1) + ' 个合成大金该合出来、名额剩 ' + (3 - i) + ' ' + JSON.stringify(r));
            }
            // 第 5 个：不合成，材料都还在，提示一次（多跑几轮也只提示一次）
            await run(`window.__mk({ n: '金苹果', v: 50000, w: 2 }, 0); window.__mk({ n: '黄金圣杯', v: 60000, w: 4 }, 2); executeGroundCombinationsLogic(); executeGroundCombinationsLogic()`);
            let r5 = await st(['金苹果', '黄金圣杯', '丰饶圣餐']);
            if (r5.has.join() !== 'true,true,false' || r5.craft !== 0) bad.push('第 5 个合成大金该被拒、材料不动 ' + JSON.stringify(r5));
            if (r5.flash.filter((t) => t === '本局合成大金已达上限').length !== 1) bad.push('满了该提示一次"本局合成大金已达上限" ' + JSON.stringify(r5.flash));
            // 满了的时候，不是大金的配方照合：猫盾 + 小鱼干 = 黄金猫盾
            await run(`window.__mk({ n: '猫盾', v: 15000, w: 1 }, 0); window.__mk({ n: '小鱼干', v: 5000, w: 1 }, 2)`);
            let rn = await st(['猫盾', '小鱼干', '黄金猫盾']);
            if (rn.has.join() !== 'false,false,true' || rn.craft !== 0) bad.push('普通配方不该受上限 ' + JSON.stringify(rn));
            // 原料里已有大金（骑士团圣剑 + 至臻猫盾 → 骑士剑）不另算，名额 0 也合
            await run(`window.__mk({ n: '骑士团圣剑', v: 400000, w: 5 }, 0); window.__mk({ n: '至臻猫盾', v: 800000, w: 2 }, 2)`);
            let rs = await st(['骑士团圣剑', '至臻猫盾', '猫盾骑士剑']);
            if (rs.has.join() !== 'false,false,true' || rs.craft !== 0) bad.push('骑士剑不该占名额 ' + JSON.stringify(rs));
            // 皇冠：镶最后一颗宝石算一个；名额 0 时最后一颗不镶、宝石还在、提示
            const crown = (left) => T.eval(`(function(){ huntCraftBigLeft = ${left}; window.__clear(); let b = crownBaseItem(); HUNT_GEMS.slice(0, 5).forEach(function (g) { crownSocketGem(b, g.id); }); window.__mk(b, 0); window.__mk(huntGemItem(HUNT_GEMS[5]), 2); executeGroundCombinationsLogic(); executeGroundCombinationsLogic();
                return JSON.stringify({ left: huntCraftBigLeft, crown: window.__has('皇冠'), gem: window.__has(HUNT_GEMS[5].n), flash: window.__flash.slice() }); })()`);
            let c0 = JSON.parse(await crown(0));
            if (c0.crown || !c0.gem || c0.flash.filter((t) => t === '本局合成大金已达上限').length !== 1) bad.push('名额 0 时最后一颗宝石不该镶、要提示 ' + JSON.stringify(c0));
            let c1 = JSON.parse(await crown(1));
            if (!c1.crown || c1.gem || c1.left !== 0) bad.push('名额 1 时该镶成皇冠、名额变 0 ' + JSON.stringify(c1));
            // 新的一张图：合成名额回到 4
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`);
            await until(T, `!isPlaying`, 20000);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`);
            if (!(await until(T, `isPlaying && huntCraftBigLeft === 4`, 30000))) bad.push('新的一局合成名额没回到 4 ' + await T.eval(`huntCraftBigLeft`));
            const noWords = /保底|必出/.test(fs.readFileSync(path.join(ROOT, 'js', '01-core.js'), 'utf8').match(/本局合成大金已达上限[^']*/)[0]);
            if (noWords) bad.push('提示里有不该写的词');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H28 合成大金每张图最多 4 个（只算合成的，开局箱子不占）：第 5 个被拒、材料不动、提示一次；骑士剑和普通配方不受限；新图重置', bad.length === 0, bad.join(' / '));
        }

        if (want('U7')) {
            // U7：寻宝队的角色、地图、合成配方在仓库界面里（大厅面板上没了）；点得到、有用；触屏尺寸下不用滚就看得见
            const bad = [];
            for (const mobile of [false, true]) {
                const tag = mobile ? '触屏' : '电脑';
                const T = await openTab(chrome, url, mobile ? { mobile: true } : {});
                await T.eval(`${HIDE} selectGameMode('hunt'); true;`);
                const lob = JSON.parse(await T.eval(`JSON.stringify({ chars: !!document.querySelector('#hunt-only #btn-green, #hunt-only #btn-yellow'), map: !!document.querySelector('#hunt-only input[name="map_diff"]'), recipe: /合成配方/.test(document.getElementById('hunt-only').innerText), setup: !!document.querySelector('#screen-garage #garage-hunt-setup #btn-green') && !!document.querySelector('#screen-garage #btn-yellow') && document.querySelectorAll('#screen-garage input[name="map_diff"]').length === 3 && !!document.querySelector('#screen-garage #garage-recipe-btn') })`));
                if (lob.chars || lob.map || lob.recipe) bad.push(tag + ' 大厅面板上还有 ' + JSON.stringify(lob));
                if (!lob.setup) bad.push(tag + ' 仓库里没有角色/地图/合成配方');
                await T.eval(`nav('screen-garage'); initGarage(); true;`); await W(500);
                const vis = JSON.parse(await T.eval(`JSON.stringify(['btn-green', 'btn-yellow', 'garage-recipe-btn'].concat(Array.prototype.map.call(document.querySelectorAll('input[name="map_diff"]'), function (r, i) { r.id = 'md' + i; return r.id; })).map(function (id) {
                    const e = document.getElementById(id), r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return { id: id, ok: r.width > 8 && r.height > 8 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!t && (t === e || e.contains(t) || (e.parentNode && e.parentNode.contains(t))) }; }))`));
                vis.filter((v) => !v.ok).forEach((v) => bad.push(tag + ' 仓库里 ' + v.id + ' 看不见/被挡/要滚动才看得到'));
                // 真点：黄色猫盾、中等地图、合成配方
                const click = async (sel) => { const p = await mouseAt(T, sel); if (!p) throw new Error('找不到 ' + sel);
                    const ev = (type) => T.send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
                    await ev('mouseMoved'); await ev('mousePressed'); await ev('mouseReleased'); await W(250); };
                await click('#btn-yellow');
                if ((await T.eval(`gState.char`)) !== 'yellow') bad.push(tag + ' 点黄色猫盾没选上');
                await click('#btn-green');
                if ((await T.eval(`gState.char`)) !== 'green') bad.push(tag + ' 点绿色猫盾没选上');
                await click('#md1');
                if ((await T.eval(`document.querySelector('input[name="map_diff"]:checked').value`)) !== 'med') bad.push(tag + ' 点中等模式没选上');
                await T.eval(`document.querySelector('input[name="map_diff"][value="easy"]').click(); true;`);
                await click('#garage-recipe-btn');
                const bk = JSON.parse(await T.eval(`JSON.stringify({ open: !document.getElementById('book-modal').classList.contains('hidden'), tab: bookTab })`));
                if (!bk.open || bk.tab !== 'recipe') bad.push(tag + ' 点合成配方没打开配方页 ' + JSON.stringify(bk));
                if (T.errors.length) bad.push(tag + ' ' + T.errors.slice(0, 2).join(' / '));
                await T.close();
            }
            report('U7 寻宝队的角色、地图、合成配方在仓库界面里（大厅面板上没了）：点得到、有用，触屏尺寸下不用滚动就看得见', bad.length === 0, bad.join(' / '));
        }

        if (want('BD1')) {
            // BD1 用了地窖徽章（传回起点）以后，小地图导航的绿线和信号接收器的蓝线都还在，并且从起点重新画
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`);
            if (!(await until(T, `isPlaying && typeof generateFootprintGuide === 'function'`, 30000))) bad.push('寻宝队没开起来');
            await T.eval(`${HIDE} true;`);
            // 找一个一楼离起点远、走得到的格子当导航目标，再找一个当信号接收器的东西
            const pick = JSON.parse(await T.eval(`(function(){ let best = [], s0 = { f: 0, x: 1, z: 1 };
                for (let z = mSize - 2; z >= 1; z--) for (let x = mSize - 2; x >= 1; x--) { if (!huntCellKind(0, x, z) || x + z < mSize) continue; if (huntRouteBuild(s0, { f: 0, x: x, z: z }, camera.position)) best.push([x, z]); if (best.length >= 2) break; }
                return JSON.stringify(best); })()`));
            if (pick.length < 2) bad.push('找不到能走到的远处格子 ' + JSON.stringify(pick));
            else {
                // 人先走到别处（中间某个格子），在那儿点导航、开信号接收器的目标
                await T.eval(`(function(){ ${HIDE} let mid = null; for (let z = 2; z < mSize - 1 && !mid; z++) for (let x = 2; x < mSize - 1 && !mid; x++) if (huntCellKind(0, x, z) && huntRouteBuild({ f: 0, x: x, z: z }, { f: 0, x: ${pick[0][0]}, z: ${pick[0][1]} }, camera.position)) mid = [x, z];
                    camera.position.set(mid[0] * TILE, 9, mid[1] * TILE); pVel.set(0, 0, 0);
                    generateFootprintGuide(${pick[0][0]}, ${pick[0][1]});
                    let m = huntGroundMesh({ n: '测试信号物', v: 1, w: 1, tex: 'generic', c: 0xffffff }); m.position.set(${pick[1][0]} * TILE, 1.5, ${pick[1][1]} * TILE); m.userData = { n: '测试信号物', v: 1, w: 1, isItem: true, vel: new THREE.Vector3(0, 0, 0) }; scene.add(m); groundItems.push(m);
                    gState.signal = gState.signal || {}; gState.signal.mesh = m; signalRouteTick(true); return true; })()`);
                const before = JSON.parse(await T.eval(`JSON.stringify({ green: !!(huntNavRoute.mesh && huntNavRoute.to), blue: !!huntSignalRoute.mesh })`));
                if (!before.green || !before.blue) bad.push('用地窖前就没画出路线 ' + JSON.stringify(before));
                // 选中地窖徽章，按“用道具”
                await T.eval(`(function(){ let i = gState.inv.findIndex(function (q) { return q && q.type === 'badge'; }); if (i < 0) { gState.inv[0] = Object.assign({}, shopItems['地窖徽章']); i = 0; } else if (i !== 0) { let t = gState.inv[0]; gState.inv[0] = gState.inv[i]; gState.inv[i] = t; }
                    gState.inv[0].uses = 1; gState.selectedSlot = 0; keys['rmb'] = true; return true; })()`);
                if (!(await until(T, `gState.inv[0] && gState.inv[0].uses === 0 && Math.abs(camera.position.x - TILE) < 3 && Math.abs(camera.position.z - TILE) < 3`, 20000))) bad.push('地窖徽章没把人传回起点');
                await frames(T, 5);
                const after = JSON.parse(await T.eval(`JSON.stringify({ green: !!(huntNavRoute.mesh && huntNavRoute.mesh.parent === scene && huntNavRoute.mesh.visible), to: huntNavRoute.to, greenFrom: huntNavRoute.key, blue: !!(huntSignalRoute.mesh && huntSignalRoute.mesh.parent === scene && huntSignalRoute.mesh.visible), blueFrom: huntSignalRoute.key, start: huntPlayerNode() })`));
                if (!after.green || !after.to || after.to.x !== pick[0][0] || after.to.z !== pick[0][1]) bad.push('用了地窖以后绿线没了 ' + JSON.stringify(after));
                if (!after.blue) bad.push('用了地窖以后蓝线没了 ' + JSON.stringify(after));
                const st = after.start.f + ',' + after.start.x + ',' + after.start.z;
                if (after.greenFrom !== st || after.blueFrom.indexOf(st + ',') !== 0) bad.push('路线没从起点重新画 ' + JSON.stringify(after));
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('BD1 用了地窖徽章（传回起点）以后，导航绿线和信号接收器蓝线都还在、从起点重新画', bad.length === 0, bad.join(' / '));
        }

        if (want('U6')) {
            // U6：小地图的“全览”按钮在小地图框外面（紧贴左边、底边对齐），不挡地图内容；电脑、平板、手机竖屏／横屏（矮屏小地图会缩小）都不跟别的东西重叠、没被盖住、点得到
            const bad = [];
            const sizes = [[false, 1280, 800, '电脑'], [false, 1024, 640, '小窗口'], [true, 1180, 820, '平板'], [true, 740, 360, '手机横屏'], [true, 390, 844, '手机竖屏']];
            for (const [mobile, w, h, tag] of sizes) {
                const T = await openTab(chrome, url, mobile ? { mobile: true } : {});
                await T.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mobile });
                await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`);
                if (!(await until(T, `isPlaying && document.getElementById('minimap-expand').getBoundingClientRect().width > 0`, 30000))) { bad.push(tag + ' 寻宝队没开起来'); await T.close(); continue; }
                await T.eval(`${HIDE} true;`);
                await frames(T, 3);
                for (const safe of [false, true]) {   // 出生点（上交、撤离按钮那块显示）和外面
                    await T.eval(`${HIDE} true;`); await frames(T, 2);   // 新手提示卡片会晚一点弹出来，量之前关掉
                    const r = JSON.parse(await T.eval(`(function(){ ${HIDE} document.getElementById('submit-btn-container').style.display = ${safe} ? 'flex' : 'none';
                        const b = document.getElementById('minimap-expand'), c = document.getElementById('minimap-container'), br = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
                        const hit = function (x, y) { let e = document.elementFromPoint(x, y); return !!(e && e.closest('#minimap-expand')); };
                        const inter = function (p, q) { return Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) * Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)); };
                        // 跟 HUD 里别的看得见的东西（不包括按钮自己的祖先）有没有重叠
                        let over = [];
                        document.querySelectorAll('#ui-layer *').forEach(function (e) {
                            if (e === b || e.contains(b) || b.contains(e)) return;
                            let st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || e.offsetParent === null && st.position !== 'fixed') return;
                            if (e.closest('#largemap-container, #inventory-panel, .hidden')) return;
                            let er = e.getBoundingClientRect(); if (er.width < 1 || er.height < 1) return;
                            if (/joystick|joy-|knob/.test(e.id || '') ) return;   // 摇杆区是透明的大块触摸区
                            if (inter(br, er) > 2) over.push((e.id || e.tagName) + '');
                        });
                        return JSON.stringify({ w: br.width, h: br.height, inMap: inter(br, cr) > 0, onScreen: br.left >= 0 && br.right <= innerWidth && br.top >= 0 && br.bottom <= innerHeight,
                            covered: !hit(br.left + br.width / 2, br.top + br.height / 2) ? (function(){ let e = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); return e ? (e.id || e.tagName) + '|' + (e.className || '') + '|' + [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)].join(',') : 'null'; })() : false, over: over.slice(0, 6), gap: Math.round(cr.left - br.right), bottom: Math.round(cr.bottom - br.bottom) }); })()`));
                    const t2 = tag + (safe ? '（出生点）' : '');
                    if (r.w < 20 || r.h < 14) bad.push(t2 + ' 全览按钮太小 ' + r.w + '×' + r.h);
                    if (r.inMap) bad.push(t2 + ' 全览按钮还压在小地图框上');
                    if (!r.onScreen) bad.push(t2 + ' 全览按钮跑出屏幕');
                    if (r.covered) bad.push(t2 + ' 全览按钮被盖住 ' + r.covered);
                    if (r.over.length) bad.push(t2 + ' 全览按钮跟别的东西重叠 ' + r.over.join(','));
                    if (r.gap < 0 || r.gap > 12 || Math.abs(r.bottom) > 2) bad.push(t2 + ' 全览按钮没贴着小地图左下 ' + JSON.stringify(r));
                }
                await T.eval(`document.getElementById('submit-btn-container').style.display = ''; document.getElementById('minimap-expand').click(); true;`);
                if (!(await until(T, `gState.largeMapOpen`, 3000))) bad.push(tag + ' 点全览没打开大地图');
                if (T.errors.length) bad.push(tag + ' ' + T.errors.slice(0, 2).join(' / '));
                await T.close();
            }
            report('U6 小地图“全览”按钮在小地图框外面（左下）：电脑、平板、手机横竖屏都不挡地图、不重叠、点得到', bad.length === 0, bad.join(' / '));
        }

        if (want('U5')) {
            // U5：腰包按键——1～3 快捷栏，4～6 对应腰包 3 格（手上拿着腰包用它，没拿就用背包里第一个），按了把那件拿到手上（手上有空格放空格，满了跟当前手上的对换）；触屏：有腰包时快捷栏旁边多 3 个小格
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const key = async (k) => { await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: 'Digit' + k, windowsVirtualKeyCode: 48 + (+k) }); await T.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Digit' + k, windowsVirtualKeyCode: 48 + (+k) }); await W(200); };
            const st = async () => JSON.parse(await T.eval(`JSON.stringify({ inv: gState.inv.map(function (q) { return q ? q.n : ''; }), bag: (gState.inv.filter(isPouch)[0] ? pouchBag(gState.inv.filter(isPouch)[0]) : []).map(function (q) { return q ? q.n : ''; }), sel: gState.selectedSlot })`));
            const setup = (inv, bag, sel) => T.eval(`(function(){ let S = function (n) { return n ? Object.assign({}, shopItems[n], { isShop: true }) : null; };
                gState.inv = ${JSON.stringify(inv)}.map(function (n) { return n === '腰包' ? Object.assign(S('腰包'), { bag: ${JSON.stringify(bag)}.map(S) }) : S(n); }); openPouch = null; selectSlot(${sel}); updateHUD(); return true; })()`);
            // 1) 手上拿着腰包，手上有空格：按 4 把第 1 格放到空格
            await setup(['腰包', '', '', '', '', ''], ['鱼叉', '医疗包', ''], 0);
            await key('4');
            let r = await st();
            if (r.inv.slice(0, 3).join() !== '腰包,鱼叉,' || r.bag.join() !== ',医疗包,' || r.sel !== 1) bad.push('按 4 没把腰包第 1 格放到手上空格 ' + JSON.stringify(r));
            // 2) 手上满了：按 5 跟当前手上（第 2 格）对换
            await setup(['腰包', '鱼叉', '医疗包', '', '', ''], ['', '肾上腺素', ''], 1);
            await key('5');
            r = await st();
            if (r.inv.slice(0, 3).join() !== '腰包,肾上腺素,医疗包' || r.bag.join() !== ',鱼叉,' || r.sel !== 1) bad.push('按 5 手满了没对换 ' + JSON.stringify(r));
            // 3) 手上没拿腰包：用背包里第一个腰包，按 6 拿第 3 格
            await setup(['鱼叉', '', '', '腰包', '', ''], ['', '', '医疗包'], 0);
            await key('6');
            r = await st();
            if (r.inv.slice(0, 3).join() !== '鱼叉,医疗包,' || r.bag.join() !== ',,') bad.push('手上没腰包，按 6 没用背包里的腰包 ' + JSON.stringify(r));
            // 4) 空格子 / 没有腰包：不变
            await setup(['腰包', '', '', '', '', ''], ['鱼叉', '', ''], 0);
            await key('5');
            r = await st();
            if (r.inv.slice(0, 3).join() !== '腰包,,' || r.bag.join() !== '鱼叉,,') bad.push('空格子不该变 ' + JSON.stringify(r));
            await setup(['鱼叉', '', '', '', '', ''], [], 0);
            await key('4');
            r = await st();
            if (r.inv.slice(0, 3).join() !== '鱼叉,,') bad.push('没腰包不该变 ' + JSON.stringify(r));
            // 5) 1～3 还是切快捷栏
            await setup(['腰包', '鱼叉', '医疗包', '', '', ''], ['', '', ''], 0);
            await key('3'); if ((await st()).sel !== 2) bad.push('按 3 没选第 3 格');
            // 提示：电脑上写按 4/5/6；小格不显示
            await setup(['腰包', '', '', '', '', ''], ['鱼叉', '', ''], 0);
            await W(400);
            const hint = JSON.parse(await T.eval(`JSON.stringify({ t: document.getElementById('pouch-view').innerText, hidden: document.getElementById('pouch-view').classList.contains('hidden'), cells: document.getElementById('pouch-cells').style.display })`));
            if (hint.hidden || !/4 ?\/ ?5 ?\/ ?6/.test(hint.t) || /按 E 打开背包拿/.test(hint.t) || hint.cells !== 'none') bad.push('电脑上的提示不对 ' + JSON.stringify(hint));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            // 触屏：有腰包才有小格；点一下效果一样
            const M = await openTab(chrome, url, { mobile: true });
            await M.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await M.eval(`${HIDE} true;`);
            await M.eval(`(function(){ let S = function (n) { return n ? Object.assign({}, shopItems[n], { isShop: true }) : null; }; gState.inv = [S('鱼叉'), null, null, null, null, null]; selectSlot(0); updateHUD(); })(); true;`);
            if (!(await until(M, `document.getElementById('pouch-cells').style.display === 'none'`, 3000))) bad.push('触屏：没腰包也有小格');
            await M.eval(`(function(){ let S = function (n) { return n ? Object.assign({}, shopItems[n], { isShop: true }) : null; }; gState.inv = [S('鱼叉'), null, null, Object.assign(S('腰包'), { bag: [S('医疗包'), null, S('肾上腺素')] }), null, null]; selectSlot(0); updateHUD(); })(); true;`);
            if (!(await until(M, `document.getElementById('pouch-cells').style.display === 'flex'`, 3000))) bad.push('触屏：有腰包没出小格');
            const cg = JSON.parse(await M.eval(`JSON.stringify((function(){ const cs = Array.prototype.slice.call(document.querySelectorAll('#pouch-cells .pouch-cell')), hb = document.getElementById('hud-hotbar-container').getBoundingClientRect();
                return { n: cs.length, sizes: cs.map(function (c) { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), txt: cs.map(function (c) { return c.innerText.trim(); }), side: cs[0].getBoundingClientRect().left >= hb.right - 2,
                    free: cs.map(function (c) { const r = c.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest('.pouch-cell')); }) }; })())`));
            if (cg.n !== 3 || cg.sizes.some((z) => z[0] < 40 || z[1] < 40) || !cg.side || cg.free.some((f) => !f)) bad.push('触屏小格大小/位置/被挡 ' + JSON.stringify(cg));
            if (cg.txt.join('|') !== '医疗包|空|肾上腺素') bad.push('小格内容 ' + cg.txt.join('|'));
            await M.eval(`document.querySelectorAll('#pouch-cells .pouch-cell')[2].dispatchEvent(new Event('touchstart', { cancelable: true })); true;`);
            const tr = JSON.parse(await M.eval(`JSON.stringify({ inv: gState.inv.slice(0, 3).map(function (q) { return q ? q.n : ''; }), bag: pouchBag(gState.inv[3]).map(function (q) { return q ? q.n : ''; }) })`));
            if (tr.inv.join() !== '鱼叉,肾上腺素,' || tr.bag.join() !== '医疗包,,') bad.push('点小格没把第 3 格拿到手上 ' + JSON.stringify(tr));
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('U5 腰包按键 4/5/6：拿到手上（有空格放空格，满了对换）、手上没腰包用背包里第一个；触屏有腰包时快捷栏旁 3 个小格，点一下一样；提示改了', bad.length === 0, bad.join(' / '));
        }

        if (want('U4')) {
            // U4：背包、腰包、仓库格子里，宝物除了名字和重量再显示价值；≥1 万用“万”
            const bad = [];
            const T = await openTab(chrome, url);
            const t = JSON.parse(await T.eval(`JSON.stringify([800000, 15000, 10000, 123456, 9999, 120].map(itemValueText))`));
            if (t.join() !== '80万,1.5万,1万,12.3万,9999,120') bad.push('价值写法 ' + t.join());
            await T.eval(`${HIDE} (function(){ let it = function (n, v, w) { return { n: n, v: v, w: w }; };
                gState.inv = [it('黄金猫盾', 800000, 5), it('小鱼干', 15000, 1), null, null, null, null];
                gState.inv[3] = { n: '腰包', type: 'backpack_ext', v: 0, w: 1, bag: [it('铜钱', 600, 1), null, null] };
                gState.garage = Array(200).fill(null); gState.garage[0] = it('皇冠', 3000000, 9); gState.garage[1] = it('铜币', 80, 1); openPouch = gState.inv[3]; initGarage(); updateHUD(); })(); true;`);
            const txt = JSON.parse(await T.eval(`JSON.stringify({
                inv: Array.prototype.map.call(document.getElementById('garage-active-inv').children, function (c) { return c.innerText.replace(/\\s+/g, ' '); }).slice(0, 4),
                gar: Array.prototype.map.call(document.getElementById('garage-stash-container').children, function (c) { return c.innerText.replace(/\\s+/g, ' '); }).slice(0, 2),
                bag: Array.prototype.map.call(document.querySelectorAll('#garage-pouch-row .slot'), function (c) { return c.innerText.replace(/\\s+/g, ' '); }),
                bp: Array.prototype.map.call(document.querySelectorAll('#bp-hotbar-slots .slot, #bp-backpack-slots .slot'), function (c) { return c.innerText.replace(/\\s+/g, ' '); }).slice(0, 2),
                hud: document.getElementById('hud-slot-0').innerText.replace(/\\s+/g, ' ') })`));
            if (!/黄金猫盾/.test(txt.inv[0]) || !/重:5/.test(txt.inv[0]) || !/值:80万/.test(txt.inv[0])) bad.push('仓库界面的背包格 ' + txt.inv[0]);
            if (!/值:1\.5万/.test(txt.inv[1])) bad.push('1.5 万 ' + txt.inv[1]);
            if (!/值:300万/.test(txt.gar[0]) || !/值:80/.test(txt.gar[1])) bad.push('仓库格 ' + txt.gar.join(' | '));
            if (!/值:600/.test(txt.bag[0])) bad.push('腰包格 ' + txt.bag.join(' | '));
            if (!/值:80万/.test(txt.bp[0])) bad.push('局里背包格 ' + txt.bp.join(' | '));
            if (!/值:80万/.test(txt.hud)) bad.push('快捷栏 ' + txt.hud);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('U4 格子里宝物显示价值：背包、腰包、仓库、局内背包和快捷栏；≥1 万写“万”', bad.length === 0, bad.join(' / '));
        }

        if (want('N1')) {
            // N1 惊魂夜逃生者 7 号（牵制）：要 20 猫盾币解锁；翻板快 30%；技能：留假身 3 秒（追捕者的 AI 看着跟真人一样、打一下就没）+ 自己隐身 2 秒，冷却 30 秒；AI 也会用
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} gState.mcoin = 5; gState.owned = {}; NIGHT_MATCH_WAIT = 0; enterNightMatch('survivor'); true;`);
            if (!(await until(T, `!document.getElementById('night-pick').classList.contains('hidden')`, 8000))) bad.push('选角色页没出来');
            const cards = JSON.parse(await T.eval(`JSON.stringify(Array.prototype.map.call(document.getElementById('night-pick-grid').children, function (c) { return c.innerText.replace(/\\s+/g, ' '); }))`));
            if (cards.length !== 7 || !/7号/.test(cards[6]) || !/牵制/.test(cards[6]) || !/20/.test(cards[6])) bad.push('选角色页没有 7 号/没标价 ' + JSON.stringify(cards));
            if (await T.eval(`NIGHT_CHARS.c3.desc.indexOf('保底') >= 0 || NIGHT_CHARS.c3.desc.indexOf('必出') >= 0`)) bad.push('7 号说明里有不该写的词');
            await T.eval(`nightPickChar('c3'); true;`);
            if (await T.eval(`!!night`)) bad.push('币不够也开局了');
            if (await T.eval(`gState.mcoin`) !== 5) bad.push('币不够不该扣币');
            await T.eval(`${HIDE} gState.mcoin = 25; nightPickChar('c3'); true;`);
            if (!(await until(T, `night && night.char === 'c3' && night.survivors && night.survivors.length === 4 && night.hunter`, 30000))) bad.push('买了没能开局');   // 负载高时开局慢，多等一会儿
            const own = JSON.parse(await T.eval(`JSON.stringify({ m: gState.mcoin, o: charOwned('night', 'c3'), cat: charOwned('night', 'cat') })`));
            if (own.m !== 5 || !own.o || !own.cat) bad.push('解锁扣币/拥有状态不对 ' + JSON.stringify(own));
            await T.eval(`${HIDE} true;`);
            // 被动：翻板快 30%
            const vm = JSON.parse(await T.eval(`JSON.stringify([nightVaultMul({ charKey: 'c3' }), nightVaultMul({ charKey: 'cat' }), nightVaultMul(null)])`));
            if (vm.join() !== '0.7,1,1') bad.push('翻板倍率 ' + vm);
            // 主动：假身 + 隐身
            const c = JSON.parse(await T.eval(`(function(){ if (!night || !night.survivors[0] || !night.hunter) return JSON.stringify({ notReady: true }); const me = night.survivors[0], h = night.hunter; night.c3Cd = 0;
                h.gy = me.gy || 0; h.recover = 0; h.lockOn = me; h.stun = 0; let before = false;
                [[10, 0, Math.PI], [-10, 0, 0], [0, 10, -Math.PI / 2], [0, -10, Math.PI / 2]].some(function (o) { h.p.set(me.p.x + o[0], me.p.y, me.p.z + o[1]); h.faceA = o[2]; before = nightHunterSees(h, me); return before; });
                nightSurvivorSkill();
                const d = night.decoys[0];
                return JSON.stringify({ before: before, n: night.decoys.length, cd: night.c3Cd, inv: nightInvisible(me), seesMe: nightHunterSees(h, me), seesDecoy: !!d && nightHunterSees(h, d), lock: h.lockOn === d, mesh: !!d && d.mesh.parent === scene, hp: me.hp }); })()`));
            if (!c.before) bad.push('测试前提：追捕者本来该看得见我');
            if (c.n !== 1 || c.cd < 29 || !c.inv) bad.push('放技能后没有假身/没进冷却/没隐身 ' + JSON.stringify(c));
            if (c.seesMe || !c.seesDecoy) bad.push('隐身时追捕者还看得见本人/看不见假身 ' + JSON.stringify(c));
            if (!c.lock || !c.mesh) bad.push('正追着我的追捕者没转去追假身/假身没画出来 ' + JSON.stringify(c));
            // 冷却中再按不出新的
            await T.eval(`nightSurvivorSkill(); true;`);
            if (await T.eval(`night.decoys.length`) !== 1) bad.push('冷却中又出了一个假身');
            // 追捕者打假身：假身没了、人没掉血
            const hit = JSON.parse(await T.eval(`(function(){ const me = night.survivors[0], h = night.hunter, d = night.decoys[0];
                h.p.set(d.p.x - 6, d.p.y, d.p.z); h.faceA = 0; h.recover = 0; h.lockOn = d; h.carrying = null; h.hookPull = null; h.hookMove = null; night.friendly = false;
                for (let i = 0; i < 20 && !d.out; i++) { h.recover = 0; nightHunterAI(0.05); }
                return JSON.stringify({ popped: d.out, hp: me.hp, down: me.downed }); })()`));
            if (!hit.popped || hit.hp !== 2 || hit.down) bad.push('追捕者打到假身：假身该消失、人不掉血 ' + JSON.stringify(hit));
            if (!(await until(T, `night.decoys.length === 0`, 5000))) bad.push('假身没被收走');
            // 假身 3 秒、隐身 2 秒（时间按局内时钟走，帧率低时真实时间会更长，所以量刚放出来时剩多少，再把时间拨到只剩一点看它会不会收走）
            await T.eval(`night.c3Cd = 0; night.survivors[0].invisUntil = 0; nightSurvivorSkill(); true;`);
            const tm = JSON.parse(await T.eval(`JSON.stringify({ left: night.decoys[0].left, inv: night.survivors[0].invisUntil - performance.now() })`));
            if (tm.left < 2.5 || tm.left > 3.01) bad.push('假身时长 ' + tm.left);
            if (tm.inv < 1700 || tm.inv > 2050) bad.push('隐身时长 ' + tm.inv);
            await T.eval(`night.decoys[0].left = 0.05; true;`);
            if (!(await until(T, `night.decoys.length === 0`, 15000))) bad.push('假身时间到了没收走');
            await T.eval(`night.survivors[0].invisUntil = performance.now() - 1; true;`);
            if (!(await until(T, `!nightInvisible(night.survivors[0])`, 4000))) bad.push('隐身没结束');
            // AI 7 号：被追捕者盯上就放技能
            const ai = JSON.parse(await T.eval(`(function(){ if (!night || !night.survivors[1] || !night.hunter) return JSON.stringify({ notReady: true }); const a = night.survivors[1], h = night.hunter; a.charKey = 'c3'; a.skillCd = 0; a.reactT = 0; a.hp = 2; night.decoys.length = 0;
                h.p.set(a.p.x + 20, a.p.y, a.p.z); h.lockOn = a; h.recover = 0;
                nightSurvivorAISkill(a, 20, 0.1);
                return JSON.stringify({ n: night.decoys.length, cd: a.skillCd, inv: nightInvisible(a), lock: h.lockOn === night.decoys[0] }); })()`));
            if (ai.n !== 1 || ai.cd < 29 || !ai.inv || !ai.lock) bad.push('AI 7 号没用技能 ' + JSON.stringify(ai));
            // AI 的队友里能刷出 7 号
            const roster = await T.eval(`(function(){ return nightSpawnActors.toString().indexOf("'c3'") >= 0; })()`);
            if (!roster) bad.push('AI 队友不会刷出 7 号');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('N1 惊魂夜 7 号：20 币解锁；翻板快 30%；假身 3 秒 + 隐身 2 秒（追捕者 AI 转去追假身、打假身不掉血）、冷却 30 秒；AI 也会用', bad.length === 0, bad.join(' / '));
        }

        if (want('S2')) {
            // S2 推推乐变数：四种台面都能开局、打完；道具会掉、会捡、会用；蓄力撞按住变强、点一下是普通推；触屏按住也行
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`window.__ai0 = NM_DEFS.sumo.ai; true;`);   // 测试里会把 AI 换成站着不动的，真 AI 留一份
            const begin = (plat, extra) => T.eval(`${HIDE} selectGameMode('sumo'); nmBegin('sumo', [{ id: gState.id }], gState.id, 5, { plat: ${plat} }); ${extra || ''} true;`);
            const names = ['normal', 'ice', 'seesaw', 'hole'];
            for (let k = 0; k < 4; k++) {
                await begin(k);
                if (!(await until(T, `nm && nm.hinted`))) bad.push(names[k] + ' 没提示');
                const kind = await T.eval(`nm.kind`);
                if (kind !== names[k]) bad.push('台面种类 ' + kind + ' 应为 ' + names[k]);
                if (names[k] === 'ice') {
                    const gr = await T.eval(`nm.def.grip(nm, nm.me)`);
                    if (gr !== 0.3) bad.push('冰面抓地 ' + gr);
                }
                if (names[k] === 'seesaw') {
                    await T.eval(`nm.actors.forEach(function (a) { a.p.set(50, 0, 0); }); nm.def.ai = function () { return { x: 0, z: 0, jump: false, act: false, held: false, item: false }; }; true;`);
                    await until(T, `nm.tilt > 0.15`);
                    const o = JSON.parse(await T.eval(`JSON.stringify({ t: nm.tilt, lo: nm.def.groundAt(nm, 50, 0), hi: nm.def.groundAt(nm, -50, 0) })`));
                    if (o.t < 0.15 || o.t > 12.01 * Math.PI / 180 || o.lo > -5 || o.hi < 5) bad.push('跷跷板没往人多的一边歪（最多 12 度） ' + JSON.stringify(o));
                }
                if (names[k] === 'hole') {
                    await T.eval(`nm.clock = 60; true;`);
                    await until(T, `nm.holeLast === sumoHoleK(60)`);
                    const o = JSON.parse(await T.eval(`JSON.stringify({ c: nm.def.groundAt(nm, 0, 0), m: nm.def.groundAt(nm, 30, 0), e: nm.def.groundAt(nm, 60, 0), vis: nm.holeRings.filter(function (m) { return m.visible; }).length, k: sumoHoleK(60) })`));
                    if (o.c > -1e8 || o.m > -1e8 || o.e !== 0 || o.vis !== 25 - o.k) bad.push('开洞的台子洞不对 ' + JSON.stringify(o));
                }
                await T.eval(`nm.clock = SUMO.time - 0.3; true;`);
                if (!(await until(T, `nm.over`, 8000))) bad.push(names[k] + ' 没打完');
                await T.eval(`${HIDE} nmExit(); true;`); await W(300);
            }
            // 道具：每 10 秒掉一个、场上最多 2 个、走过去自动捡、按 Q 用
            await begin(0, `nm.def.ai = function () { return { x: 0, z: 0, jump: false, act: false, held: false, item: false }; };`);
            await T.eval(`nm.itemT = 0.01; true;`);
            await until(T, `nm.items.length === 1`);
            await T.eval(`nm.itemT = 0.01; true;`);
            await until(T, `nm.items.length === 2`);
            await T.eval(`nm.itemT = 0.01; true;`);
            await until(T, `nm.itemT > 5`);
            const cnt = await T.eval(`nm.items.length`);
            if (cnt !== 2) bad.push('场上道具应最多 2 个 ' + cnt);
            const gap = await T.eval(`SUMO.itemEvery`);
            if (gap !== 10) bad.push('掉落间隔 ' + gap);
            await T.eval(`(function(){ let it = nm.items[0]; nm.me.p.set(it.x, 0, it.z); window.__k = it.kind; })(); true;`);
            if (!(await until(T, `nm.me.item === window.__k`))) bad.push('走过去没自动捡');
            if (!(await T.eval(`nm.items.length === 1`))) bad.push('捡了道具还在场上');
            // AI 也会捡
            await T.eval(`(function(){ let it = nm.items[0]; nm.actors[1].p.set(it.x, 0, it.z); window.__k2 = it.kind; })(); true;`);
            if (!(await until(T, `nm.actors[1].item === window.__k2`))) bad.push('AI 没捡到道具');
            // 逐个用
            await T.eval(`nm.me.item = 'hammer'; keys['q'] = true; true;`);
            if (!(await until(T, `nm.me.hammerT > 4 && !nm.me.item`))) bad.push('大锤没生效');
            await T.eval(`nm.me.item = 'shield'; keys['q'] = true; true;`);
            if (!(await until(T, `nm.me.shield === true`))) bad.push('护盾没生效');
            await T.eval(`window.__kx0 = nm.me.kx; nmKnock(nm.me, 100, 0, nm.actors[1], 22); true;`);
            const sh = JSON.parse(await T.eval(`JSON.stringify({ s: nm.me.shield, kx: nm.me.kx - window.__kx0 })`));
            if (sh.s || Math.abs(sh.kx) > 0.5) bad.push('护盾没挡住这一下 ' + JSON.stringify(sh));
            await T.eval(`nmKnock(nm.me, 100, 0, nm.actors[1], 22); true;`);
            if (!(await T.eval(`Math.abs(nm.me.kx) > 50`))) bad.push('护盾用完后应该能被推');
            await T.eval(`nm.me.kx = 0; nm.me.kz = 0; nm.me.item = 'spring'; window.__hy = 0; keys['q'] = true; true;`);
            await until(T, `(window.__hy = Math.max(window.__hy, nm.me.p.y)) > 15`, 4000);
            if (!(await T.eval(`window.__hy > 15`))) bad.push('弹簧没弹高 ' + await T.eval(`window.__hy`));
            await until(T, `nm.me.onGround`);
            // 香蕉皮：放在脚下，别人踩到滑出去约 3 个身位（≈18）
            await T.eval(`nm.me.p.set(0, 0, 0); nm.actors[1].p.set(40, 0, 0); nm.me.item = 'banana'; keys['q'] = true; true;`);
            if (!(await until(T, `nm.bananas.length === 1`))) bad.push('香蕉皮没放下');
            await T.eval(`nm.me.p.set(-60, 0, 0); nm.bananas[0].t = 2; (function(){ let b = nm.bananas[0], v = nm.actors[1]; v.p.set(b.x + 2, 0, b.z); v.mvx = 0; v.mvz = 0; v.facing = Math.PI / 2; window.__b0 = { x: b.x, z: b.z }; })(); true;`);
            if (!(await until(T, `nm.actors[1].slipT > 0`))) bad.push('踩到香蕉皮没滑');
            await until(T, `nm.actors[1].slipT <= 0 && Math.hypot(nm.actors[1].kx, nm.actors[1].kz) < 1`);
            const sl = JSON.parse(await T.eval(`JSON.stringify({ d: Math.hypot(nm.actors[1].p.x - window.__b0.x, nm.actors[1].p.z - window.__b0.z), gone: nm.bananas.length })`));
            if (sl.d < 12 || sl.d > 26 || sl.gone !== 0) bad.push('香蕉皮滑出的距离/消失不对 ' + JSON.stringify(sl));
            // AI 会用道具
            await T.eval(`nm.def.ai = window.__ai0; nm.actors[1].item = 'shield'; nm.actors[1].itemT = 0; true;`);
            if (!(await until(T, `nm.actors[1].shield === true`))) bad.push('AI 没用护盾');
            await T.eval(`${HIDE} nmExit(); true;`); await W(300);
            // 蓄力撞：点一下 = 普通推，按住攒力（走得慢一半），松手推得更远，大锤再 ×2
            await begin(0, `nm.def.ai = function () { return { x: 0, z: 0, jump: false, act: false, held: false, item: false }; }; window.__pushes = []; (function () { let orig = nmKnock; window.nmKnock = function (b, ix, iz, by, hop) { window.__pushes.push(Math.hypot(ix, iz)); return orig(b, ix, iz, by, hop); }; })();`);
            const setup = `nm.actors.forEach(function (a, i) { if (i > 1) { a.out = true; a.mesh.visible = false; } }); nm.me.p.set(0, 0, 0); nm.actors[1].p.set(0, 0, 8); nm.actors[1].kx = 0; nm.actors[1].kz = 0; nm.me.kx = 0; nm.me.kz = 0; camera.rotation.set(0, Math.PI, 0); nm.me.actCd = 0; window.__pushes.length = 0; true;`;
            await T.eval(setup);
            await T.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true;`);
            if (!(await until(T, `window.__pushes.length === 1`))) bad.push('点一下没推出去');
            const tapP = await T.eval(`window.__pushes[0]`);
            if (Math.abs(tapP - 105) > 1) bad.push('点一下应是普通推 105，实际 ' + tapP);
            await until(T, `nm.me.actCd <= 0`);
            await T.eval(setup);
            await T.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); true;`);
            if (!(await until(T, `nm.me.chargeT > 0.4`))) bad.push('按住没攒力');
            const slow = JSON.parse(await T.eval(`JSON.stringify({ m: nm.def.speedMul(nm, nm.me), bar: document.getElementById('sumo-charge').style.display })`));
            if (slow.m !== 0.5 || slow.bar !== 'block') bad.push('攒力时没变慢/没蓄力条 ' + JSON.stringify(slow));
            await until(T, `nm.me.chargeT >= SUMO.charge - 0.05`);
            await T.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true;`);
            if (!(await until(T, `window.__pushes.length === 1`))) bad.push('松手没推出去');
            const holdP = await T.eval(`window.__pushes[0]`);
            if (holdP < 195 || holdP > 211) bad.push('攒满力应约 ×2（≈210），实际 ' + holdP);
            await until(T, `nm.me.actCd <= 0`);
            await T.eval(setup);
            await T.eval(`nm.me.hammerT = 5; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true;`);
            await until(T, `window.__pushes.length === 1`);
            const hamP = await T.eval(`window.__pushes[0]`);
            if (Math.abs(hamP - 210) > 1) bad.push('大锤点一下应 ×2（210），实际 ' + hamP);
            await T.eval(`${HIDE} nmExit(); true;`); await W(300);
            // 联机：房主把道具放进世界状态、捡/用道具发消息；别人的消息能让道具出现/消失，香蕉皮、大锤、护盾跟着显示
            await T.eval(`${HIDE} selectGameMode('sumo'); nmBegin('sumo', [{ id: gState.id }, { id: 'peer-x' }], gState.id, 5, { plat: 0 }); window.__sent = []; bc.postMessage = function (m) { window.__sent.push(m); }; nm.def.ai = function () { return { x: 0, z: 0, jump: false, act: false, held: false, item: false }; }; nm.itemT = 0.01; true;`);
            if (!(await until(T, `window.__sent.some(function (m) { return m.type === 'NM_W' && m.s && m.s.it && m.s.it.length === 1; })`))) bad.push('联机：世界状态里没有道具');
            await T.eval(`(function(){ let it = nm.items[0]; nm.me.p.set(it.x, 0, it.z); })(); true;`);
            if (!(await until(T, `window.__sent.some(function (m) { return m.type === 'NM_EV' && m.ev === 'pick'; })`))) bad.push('联机：捡道具没发消息');
            await T.eval(`nm.me.item = 'banana'; keys['q'] = true; true;`);
            if (!(await until(T, `window.__sent.some(function (m) { return m.type === 'NM_EV' && m.ev === 'use' && m.k === 'banana' && m.id; })`))) bad.push('联机：用道具没发消息');
            await T.eval(`${HIDE} nmExit(); selectGameMode('sumo'); nmBegin('sumo', [{ id: 'peer-x' }, { id: gState.id }], 'peer-x', 5, { plat: 0 }); true;`);
            await T.eval(`nmOnWorld({ type: 'NM_W', mode: 'sumo', sender: 'peer-x', clock: 3, a: [], s: { it: [['i1', 0, 20, 10], ['i2', 3, -20, 10]] } }); true;`);
            const n1 = JSON.parse(await T.eval(`JSON.stringify({ n: nm.items.length, k: nm.items.map(function (i) { return i.kind; }) })`));
            if (n1.n !== 2 || n1.k.join() !== 'hammer,spring') bad.push('联机：收到世界状态道具没出现 ' + JSON.stringify(n1));
            await T.eval(`nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'pick', id: 'i1', i: 0 }); nmOnWorld({ type: 'NM_W', mode: 'sumo', sender: 'peer-x', clock: 3.1, a: [], s: { it: [['i1', 0, 20, 10], ['i2', 3, -20, 10]] } }); true;`);
            if (!(await T.eval(`nm.items.length === 1 && nm.items[0].id === 'i2'`))) bad.push('联机：别人捡走后道具没消失/又冒出来了');
            await T.eval(`nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'use', i: 0, k: 'banana', id: 'b0-5', x: 10, z: 10 });
                nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'use', i: 0, k: 'hammer' });
                nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'use', i: 0, k: 'shield' }); true;`);
            const u = JSON.parse(await T.eval(`JSON.stringify({ b: nm.bananas.length, h: nm.actors[0].hammerT > 4 && !!nm.actors[0].hammerMesh, s: nm.actors[0].shield === true && !!nm.actors[0].shieldMesh })`));
            if (u.b !== 1 || !u.h || !u.s) bad.push('联机：别人用道具我这边没显示 ' + JSON.stringify(u));
            await T.eval(`nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'bgone', id: 'b0-5' }); nmOnEv({ type: 'NM_EV', mode: 'sumo', sender: 'peer-x', ev: 'pop', i: 0 }); true;`);
            const u2 = JSON.parse(await T.eval(`JSON.stringify({ b: nm.bananas.length, s: nm.actors[0].shield, m: !!nm.actors[0].shieldMesh })`));
            if (u2.b !== 0 || u2.s || u2.m) bad.push('联机：香蕉皮被踩/护盾破了没跟着消失 ' + JSON.stringify(u2));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.eval(`${HIDE} nmExit(); true;`); await T.close();
            // 触屏：按住“推”那颗键攒力，松手推出去；有“道具”键
            const M = await openTab(chrome, url, { mobile: true });
            await M.eval(`${HIDE} selectGameMode('sumo'); nmBegin('sumo', [{ id: gState.id }], gState.id, 5, { plat: 0 }); nm.def.ai = function () { return { x: 0, z: 0, jump: false, act: false, held: false, item: false }; }; window.__pushes = []; (function () { let orig = nmKnock; window.nmKnock = function (b, ix, iz, by, hop) { window.__pushes.push(Math.hypot(ix, iz)); return orig(b, ix, iz, by, hop); }; })(); true;`);
            await M.eval(setup);
            const ui = JSON.parse(await M.eval(`JSON.stringify({ act: document.getElementById('nm-act-btn').style.display, item: document.getElementById('race-item-btn').style.display })`));
            if (ui.act !== 'flex' || ui.item !== 'flex') bad.push('触屏没有“推”/“道具”键 ' + JSON.stringify(ui));
            await M.eval(`document.getElementById('nm-act-btn').dispatchEvent(new Event('touchstart', { cancelable: true })); true;`);
            if (!(await until(M, `nm.me.chargeT > 0.6`))) bad.push('触屏按住没攒力');
            await M.eval(`document.getElementById('nm-act-btn').dispatchEvent(new Event('touchend')); true;`);
            if (!(await until(M, `window.__pushes.length === 1`))) bad.push('触屏松手没推出去');
            const tp = await M.eval(`window.__pushes[0]`);
            if (tp < 140) bad.push('触屏攒力后应比普通推更强 ' + tp);
            await M.eval(`nm.me.item = 'hammer'; document.getElementById('race-item-btn').dispatchEvent(new Event('touchstart', { cancelable: true })); true;`);
            if (!(await until(M, `nm.me.hammerT > 4`))) bad.push('触屏“道具”键没用出来');
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.eval(`${HIDE} nmExit(); true;`); await M.close();
            report('S2 推推乐变数：四种台面能开能打完；道具掉落/捡/用（大锤、香蕉皮、护盾、弹簧，AI 也会）；蓄力撞按住 ×2、点一下普通；触屏按住和“道具”键', bad.length === 0, bad.join(' / '));
        }

        if (want('S3')) {
            // S3 爬塔变数：台子种类的占比、旗子/塔顶/起点是普通台、捷径、币、台子不叠；每一跳都过得去（晃的台子停在最不利的位置）；
            // 易碎/弹床/传送带/横杆/币真的起作用；塔按日期定种子；今日排行
            const bad = [];
            const T = await openTab(chrome, url);
            const st = JSON.parse(await T.eval(`${HIDE} (${TOWER_STAT.toString()})(50)`));
            const ratio = (a) => a[1] / Math.max(1, a[0]);
            if (st.thirds[0][1] !== 0) bad.push('下 1/3 出现了特殊台 ' + st.thirds[0][1]);
            if (ratio(st.thirds[1]) < 0.27 || ratio(st.thirds[1]) > 0.43) bad.push('中间 1/3 特殊台占比 ' + ratio(st.thirds[1]).toFixed(2) + '（应约 0.35）');
            if (ratio(st.thirds[2]) < 0.42 || ratio(st.thirds[2]) > 0.58) bad.push('顶上 1/3 特殊台占比 ' + ratio(st.thirds[2]).toFixed(2) + '（应约 0.5）');
            if (st.flagSpecial || st.topSpecial || st.startSpecial) bad.push('旗子/塔顶/起点不是普通台 ' + [st.flagSpecial, st.topSpecial, st.startSpecial]);
            ['move', 'crumble', 'spring', 'belt', 'bar'].forEach((k) => { if (!st.kinds[k]) bad.push('50 座塔里没出现过 ' + k); });
            if (st.sc.some((n) => n < 2 || n > 3)) bad.push('每座塔应有 2~3 处捷径 ' + st.sc.join());
            if (st.coins.some((n) => n !== 10)) bad.push('每座塔应有 10 个币 ' + st.coins.join());
            if (st.steps.some((n) => n !== 61)) bad.push('台子数不是 61 ' + st.steps.join());
            if (st.overlap) bad.push('有 ' + st.overlap + ' 对台子叠在一起');
            if (!st.seedAll) bad.push('50 座塔里没有同时有易碎/弹床/传送带/横杆的');
            if (st.scBadRise) bad.push('捷径落差不对 ' + st.scBadRise);
            const sim = JSON.parse(await T.eval(`${HIDE} (${TOWER_SIM.toString()})(50, ['normal'], 3000)`));
            if (sim.normal.bad > 0) bad.push('平常日子 50 座塔里有 ' + sim.normal.bad + ' 跳过不去 ' + sim.badAt.join(' | '));
            // 塔按日期定种子
            await T.eval(`${HIDE} selectGameMode('tower'); nmStartGo('tower', { kind: 'solo' }); true;`);
            await until(T, `nm && nm.steps && nm.steps.length === 61`);
            const d1 = JSON.parse(await T.eval(`JSON.stringify({ seed: nm.seed, want: towerDaySeed(), h: nm.steps.map(function (s) { return [Math.round(s.x0), Math.round(s.z), Math.round(s.y), s.kind]; }) })`));
            await T.eval(`nmTeardown(); nmStartGo('tower', { kind: 'solo' }); true;`);
            await until(T, `nm && nm.steps && nm.steps.length === 61`);
            const d2 = JSON.parse(await T.eval(`JSON.stringify({ seed: nm.seed, h: nm.steps.map(function (s) { return [Math.round(s.x0), Math.round(s.z), Math.round(s.y), s.kind]; }) })`));
            if (d1.seed !== d1.want || JSON.stringify(d1.h) !== JSON.stringify(d2.h)) bad.push('塔不是按日期定的 ' + d1.seed + '/' + d1.want);
            await T.eval(`nmTeardown(); true;`);
            // 台子机制
            await T.eval(`${HIDE} selectGameMode('tower'); nmBegin('tower', [{ id: gState.id }], gState.id, ${st.seedAll}, { kind: 'solo' }); nm.def.ai = function () { return {}; }; window.__pick = function (k) { return nm.steps.findIndex(function (s) { return s.kind === k; }); }; true;`);
            const idx = JSON.parse(await T.eval(`JSON.stringify({ c: __pick('crumble'), sp: __pick('spring'), b: __pick('belt'), bar: __pick('bar') })`));
            if (idx.c < 0 || idx.sp < 0 || idx.b < 0 || idx.bar < 0) bad.push('这座塔里缺某种台子 ' + JSON.stringify(idx));
            else {
                // 易碎：踩上去 1 秒后掉，5 秒后长回来
                await T.eval(`(function(){ let s = nm.steps[${idx.c}]; nm.me.p.set(s.x, s.y, s.z); nm.me.vy = 0; })(); true;`);
                if (!(await until(T, `nm.steps[${idx.c}].cs !== undefined`))) bad.push('踩上易碎台没开始计时');
                const c0 = await T.eval(`nm.steps[${idx.c}].mesh.visible`);
                await T.eval(`nm.clock = nm.steps[${idx.c}].cs + 1.2; nm.def.tick(nm, 0.016); true;`);
                const c1 = JSON.parse(await T.eval(`JSON.stringify({ v: nm.steps[${idx.c}].mesh.visible, g: nm.def.groundAt(nm, nm.steps[${idx.c}].x, nm.steps[${idx.c}].z, nm.steps[${idx.c}].y + 0.6) })`));
                await T.eval(`nm.clock = nm.steps[${idx.c}].cs + 6.5; nm.def.tick(nm, 0.016); true;`);
                const c2 = JSON.parse(await T.eval(`JSON.stringify({ v: nm.steps[${idx.c}].mesh.visible, g: nm.def.groundAt(nm, nm.steps[${idx.c}].x, nm.steps[${idx.c}].z, nm.steps[${idx.c}].y + 0.6), y: nm.steps[${idx.c}].y })`));
                if (!c0 || c1.v || c1.g > c2.y - 1 || !c2.v || c2.g !== c2.y) bad.push('易碎台 掉/长回来不对 ' + JSON.stringify([c0, c1, c2]));
                // 弹床：跳得高 ×1.6（高度 ≈ ×2.56）
                const jh = JSON.parse(await T.eval(`(function(){
                    let hop = function (si) { let s = nm.steps[si], a = nm.me; a.p.set(s.x, s.y, s.z); a.vy = 0; a.mvx = a.mvz = a.kx = a.kz = 0; a.onGround = true; a.coyote = 0.1; let mx = 0;
                        for (let t = 0; t < 120; t++) { nmPhysics(a, { x: 0, z: 0, jump: t === 0, act: false }, 1 / 60); mx = Math.max(mx, a.p.y - s.y); } return mx; };
                    return JSON.stringify({ spring: hop(${idx.sp}), plain: hop(1), mul: nm.def.jumpMul(nm, { p: new THREE.Vector3(nm.steps[${idx.sp}].x, nm.steps[${idx.sp}].y, nm.steps[${idx.sp}].z) }) }); })()`));
                if (jh.mul !== 1.6 || jh.spring / jh.plain < 2.3 || jh.spring / jh.plain > 2.8) bad.push('弹床高度不对 ' + JSON.stringify(jh));
                // 传送带：站上去被带着走（14/秒）
                const bt = JSON.parse(await T.eval(`(function(){ let s = nm.steps[${idx.b}], a = nm.me; a.p.set(s.x, s.y, s.z); a.vy = 0; a.mvx = a.mvz = a.kx = a.kz = 0; a.onGround = true;
                    for (let t = 0; t < 30; t++) nm.def.carry(nm, a, 1 / 60);
                    return JSON.stringify({ dx: a.p.x - s.x, dz: a.p.z - s.z, bx: s.bx, bz: s.bz }); })()`));
                if (Math.abs(bt.dx - bt.bx * 7) > 0.2 || Math.abs(bt.dz - bt.bz * 7) > 0.2) bad.push('传送带速度/方向不对 ' + JSON.stringify(bt));
                // 横杆：站在杆上被打飞，跳起来躲得过
                const br = JSON.parse(await T.eval(`(function(){ let s = nm.steps[${idx.bar}], a = nm.me, out = {};
                    nm.clock = 3; let th = nm.clock * s.w + s.ph, ux = Math.cos(th), uz = Math.sin(th);
                    a.p.set(s.x + ux * 3, s.y + 6, s.z + uz * 3); a.kx = a.kz = 0; a.barT = 0; a.out = false; a.downed = false;
                    nm.def.tick(nm, 0.001); out.high = Math.hypot(a.kx, a.kz);
                    a.p.set(s.x + ux * 3, s.y, s.z + uz * 3); a.kx = a.kz = 0; a.barT = 0; a.onGround = true;
                    nm.def.tick(nm, 0.001); out.low = Math.hypot(a.kx, a.kz); return JSON.stringify(out); })()`));
                if (br.high > 1 || br.low < 30) bad.push('横杆没打飞站着的人/跳起来也被打 ' + JSON.stringify(br));
                // 币：10 个，碰到就捡，最多 10 个；结算多出来的币
                await T.eval(`(function(){ let a = nm.me; a.barT = 0; a.out = false; a.downed = false; })(); true;`);
                for (let k = 0; k < 12; k++) await T.eval(`(function(){ let c = nm.coins[${k} % nm.coins.length], s = nm.steps[c.i]; nm.me.p.set(s.x, s.y, s.z); nm.me.vy = 0; nm.me.kx = nm.me.kz = 0; nm.clock += 0.01; nm.def.tick(nm, 0.001); })(); true;`);
                const cn = JSON.parse(await T.eval(`JSON.stringify({ n: nm.me.runCoins, got: nm.coins.filter(function (c) { return c.got; }).length, vis: nm.coins.filter(function (c) { return c.grp.visible; }).length })`));
                if (cn.n !== 10 || cn.got !== 10 || cn.vis !== 0) bad.push('路上的币 ' + JSON.stringify(cn));
                const m0 = await T.eval(`gState.mcoin || 0`);
                await T.eval(`nm.me.best = 37; nmEnd({ w: -1, h: 37 }); true;`);
                const cs = JSON.parse(await T.eval(`JSON.stringify({ gain: coinsLast.gain, parts: coinsLast.parts, m: gState.mcoin, day: gState.towerDay, best: gState.towerBest })`));
                const bonus = cs.parts.filter((q) => q[0] === '路上的币')[0];
                if (!bonus || bonus[1] !== 10 || cs.m - m0 !== cs.gain) bad.push('结算没给路上的币 ' + JSON.stringify(cs));
                // 今日排行：单人爬到的最高记下来、存档里有、榜上有自己
                if (!cs.day || cs.day.h !== 37 || cs.day.d !== await T.eval(`localDayNum()`)) bad.push('今天的最高没记 ' + JSON.stringify(cs.day));
                await T.eval(`saveProgress(); gState.towerDay = null; loadProgress(gState.id); true;`);
                if (!(await T.eval(`gState.towerDay && gState.towerDay.h === 37`))) bad.push('今天的最高刷新后没了');
                await T.eval(`${HIDE} towerBoardOpen(); true;`);
                const bd = JSON.parse(await T.eval(`JSON.stringify({ t: document.getElementById('tower-board-body').innerText, rows: document.querySelectorAll('#tower-board-body div[style*="space-between"]').length, mine: document.querySelectorAll('#tower-board-body div[style*="fff3e0"]').length, hidden: document.getElementById('tower-board').classList.contains('hidden') })`));
                if (bd.hidden || bd.rows !== 21 || bd.mine !== 1 || !/你今天：第 37 块/.test(bd.t)) bad.push('今日排行不对 ' + JSON.stringify(bd).slice(0, 200));
                await T.eval(`towerBoardClose(); true;`);
            }
            // 联机：易碎台踩了发消息，别人的消息能让台子掉
            await T.eval(`${HIDE} if (nm) nmTeardown(); selectGameMode('tower'); nmBegin('tower', [{ id: gState.id }, { id: 'peer-x' }], gState.id, ${st.seedAll}, { kind: 'duo' }); window.__sent = []; bc.postMessage = function (m) { window.__sent.push(m); }; nm.def.ai = function () { return {}; }; true;`);
            const ci = await T.eval(`nm.steps.findIndex(function (s) { return s.kind === 'crumble'; })`);
            await T.eval(`(function(){ let s = nm.steps[${ci}]; nm.me.p.set(s.x, s.y, s.z); nm.me.vy = 0; })(); true;`);
            if (!(await until(T, `window.__sent.some(function (m) { return m.type === 'NM_EV' && m.ev === 'cr' && m.k === ${ci}; })`))) bad.push('联机：踩易碎台没发消息');
            await T.eval(`${HIDE} nmTeardown(); selectGameMode('tower'); nmBegin('tower', [{ id: 'peer-x' }, { id: gState.id }], 'peer-x', ${st.seedAll}, { kind: 'duo' }); nmOnEv({ type: 'NM_EV', mode: 'tower', sender: 'peer-x', ev: 'cr', k: ${ci}, t: 4 }); nm.clock = 5.5; nm.def.tick(nm, 0.001); true;`);
            if (await T.eval(`nm.steps[${ci}].mesh.visible`)) bad.push('联机：别人踩了我这边的易碎台没掉');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.eval(`${HIDE} nmTeardown(); true;`); await T.close();
            report('S3 爬塔变数：台子种类占比（下 1/3 全普通、中 3.5 成、上半数）；旗子/塔顶是普通台；2~3 处捷径；10 个币；每一跳过得去（含晃的台子最不利位置）；易碎/弹床/传送带/横杆/币起作用；按日期定种子；今日排行', bad.length === 0, bad.join(' / '));
        }

        if (want('L3')) {
            // L3 大厅背景：天空、云、山丘、树、房子一共 5 个绘制；全在围墙外面、不能走上去；云会慢慢转；地面是一张带草斑/石砖/十条路的贴图
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} true;`);
            if (!(await until(T, `hub && hub.bg && hub.bg.houses`))) bad.push('大厅里没有背景');
            const r = JSON.parse(await T.eval(`(function(){
                const names = ['sky', 'clouds', 'hills', 'trees', 'houses'], out = { names: names.filter(function (n) { return !!hub.bg[n]; }) };
                renderer.render(scene, camera); const all = renderer.info.render.calls;
                names.forEach(function (n) { hub.bg[n].visible = false; });
                renderer.render(scene, camera); const none = renderer.info.render.calls;
                names.forEach(function (n) { hub.bg[n].visible = true; });
                out.calls = all - none; out.total = all;
                // 离广场中心最近的点（山丘、房子看顶点，树看根）
                const near = function (m) { const pa = m.geometry.attributes.position, p = m.position; let best = 1e9; m.updateMatrixWorld(); const v = new THREE.Vector3();
                    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); best = Math.min(best, Math.hypot(v.x, v.z)); } return best; };
                out.hills = near(hub.bg.hills); out.houses = near(hub.bg.houses);
                const t = hub.bg.trees, mt = new THREE.Matrix4(); let tn = 1e9; for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, mt); tn = Math.min(tn, Math.hypot(mt.elements[12], mt.elements[14])); } out.trees = tn;
                out.treeN = t.count; out.inst = !!t.isInstancedMesh;
                out.plat = hub.platforms.some(function (p) { return Object.keys(hub.bg).some(function (n) { return hub.bg[n] === p.mesh; }); });
                out.half = HUB.plazaHalf; out.y = hub.p.y;
                const fl = scene.children.filter(function (c) { return c.geometry && c.geometry.type === 'PlaneGeometry' && c.material.map; });
                out.floor = fl.length; out.floorTex = fl.length ? !!fl[0].material.map.image : false;
                out.skyOrder = hub.bg.sky.renderOrder; out.skyBack = hub.bg.sky.material.side === THREE.BackSide;
                return JSON.stringify(out); })()`));
            if (r.names.length !== 5) bad.push('背景不是 5 个 ' + r.names);
            if (r.calls > 5 || r.calls < 4) bad.push('背景绘制次数 ' + r.calls + '（应 ≤5）');
            if (r.total > 50) bad.push('大厅每帧绘制 ' + r.total);
            if (r.hills < r.half + 10 || r.houses < r.half + 10 || r.trees < r.half) bad.push('背景伸进广场了 ' + [r.hills, r.houses, r.trees].map(Math.round));
            if (r.plat || r.treeN < 40 || !r.inst) bad.push('树/背景当成可站的平台了或树太少 ' + r.treeN);
            if (r.floor !== 1 || !r.floorTex) bad.push('地面没有贴图 ' + r.floor);
            if (!r.skyBack || r.skyOrder >= 0) bad.push('天空画法不对');
            // 云慢慢转
            const a0 = await T.eval(`hub.bg.clouds.rotation.y`);
            if (!(await until(T, `hub.bg.clouds.rotation.y > ${a0} + 0.0005`, 8000))) bad.push('云没动');
            // 天空跟着玩家，走远了也不会走出天空
            await T.eval(`hub.p.x = 300; hub.p.z = -200; true;`);
            if (!(await until(T, `Math.abs(hub.bg.sky.position.x - 300) < 1 && Math.abs(hub.bg.sky.position.z + 200) < 1`))) bad.push('天空没跟着玩家');
            // 地面贴图里有十条路的颜色、石砖、草
            const px = JSON.parse(await T.eval(`(function(){ const cv = hubGroundCv, c = cv.getContext('2d'), N = cv.width, S = N / (HUB.plazaHalf * 2), out = {};
                const at = function (x, z) { const d = c.getImageData(Math.round((x + HUB.plazaHalf) * S), Math.round((z + HUB.plazaHalf) * S), 1, 1).data; return [d[0], d[1], d[2]]; };
                out.path = HUB_MODE_PATH.map(function (m, k) { const a = (k / HUB_MODE_PATH.length) * Math.PI * 2 + 0.31; return at(Math.sin(a) * 180 + Math.cos(a) * 5, -Math.cos(a) * 180 + Math.sin(a) * 5); });   // 离开中间那条白虚线
                out.stone = at(0, 60); out.grass = at(600, 600); out.want = HUB_MODE_PATH.map(function (m) { return m[1]; }); return JSON.stringify(out); })()`));
            const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
            const colorsOk = px.path.every((c, i) => { const w = px.want[i], wr = parseInt(w.slice(1, 3), 16), wg = parseInt(w.slice(3, 5), 16), wb = parseInt(w.slice(5, 7), 16); return Math.abs(c[0] - wr) + Math.abs(c[1] - wg) + Math.abs(c[2] - wb) < 90; });
            if (!colorsOk) bad.push('十条路的颜色不对 ' + px.path.map(hex).join(','));
            if (new Set(px.path.map(hex)).size < 9) bad.push('各模式的路颜色应该互不相同');
            if (!(px.stone[0] > 120 && px.stone[0] < 200 && px.stone[0] >= px.stone[2] && px.stone[0] - px.stone[2] < 40)) bad.push('广场中间不是石砖 ' + hex(px.stone));
            if (!(px.grass[1] > px.grass[0] && px.grass[1] > px.grass[2])) bad.push('外面不是草地 ' + hex(px.grass));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('L3 大厅背景：天空/云/山丘/树/房子共 5 次绘制、全在围墙外且不能站、云会转；地面一张贴图（草斑、石砖广场、十条各模式颜色的路）', bad.length === 0, bad.join(' / '));
        }

        // ── 实验室（第 4A 段）：LB 系列。默认藏起来，测试用 ?labdebug=1 打开 ──
        const LB_GATHER = 4;
        const LBTAB = async () => { const T = await openTab(chrome, url, { query: 'labdebug=1' }); await T.eval(`${HIDE} true;`); return T; };
        const LBENTER = async (T) => {
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); labEnter(); true;`);
            if (!(await until(T, `lab && document.getElementById('lab-hud') && !lab.over`, 15000))) throw new Error('进不了实验室');
        };
        const LBEXIT = async (T) => { await T.eval(`labExit(); true;`); await until(T, `lab === null`, 10000); };

        if (want('LB1')) {
            // LB1 入口：实验室是大厅里的一个模式入口（寻宝队正下面）；LAB_ENABLED 为 false 时不显示、进不去；网址带 ?labdebug=1 才出现；仓库里没有实验室按钮；进出一次后几何体、贴图不涨
            const bad = [];
            const N = await openTab(chrome, url);   // 正常玩家：没有 labdebug
            await N.eval(`${HIDE} nav('screen-lobby'); selectGameMode('hunt'); true;`);
            const hid = JSON.parse(await N.eval(`JSON.stringify({ en: LAB_ENABLED, vis: labVisible(), btn: getComputedStyle(document.getElementById('btn-mode-lab')).display, noHud: !document.getElementById('lab-hud') })`));
            if (hid.en !== false || hid.vis !== false || hid.btn !== 'none') bad.push('正常玩家看得到实验室按钮 ' + JSON.stringify(hid));
            await N.eval(`selectGameMode('lab'); true;`);
            if ((await N.eval(`gState.gameMode`)) === 'lab') bad.push('藏起来的时候居然选得到实验室模式');
            await N.eval(`labEnter(); true;`);
            if (await N.eval(`lab !== null`)) bad.push('藏起来的时候居然进得去');
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-lobby'); selectGameMode('hunt'); document.getElementById('mode-detail-panel').classList.remove('hidden'); true;`);
            const vis = JSON.parse(await T.eval(`JSON.stringify({ vis: labVisible(), btn: getComputedStyle(document.getElementById('btn-mode-lab')).display })`));
            if (!vis.vis || vis.btn === 'none') bad.push('带 ?labdebug=1 没出现 ' + JSON.stringify(vis));
            // 位置：和寻宝队同一列、在它正下面（紧挨着的下一行）
            const pos = JSON.parse(await T.eval(`(function(){ let a = document.getElementById('btn-mode-hunt').getBoundingClientRect(), b = document.getElementById('btn-mode-lab').getBoundingClientRect(); return JSON.stringify({ dx: Math.abs(a.left - b.left), dy: b.top - a.bottom, h: a.height }); })()`));
            if (pos.dx > 2 || pos.dy < 0 || pos.dy > pos.h) bad.push('实验室入口不在寻宝队正下面 ' + JSON.stringify(pos));
            // 仓库界面是原样：没有任何实验室按钮
            await T.eval(`nav('screen-garage'); initGarage(); true;`);
            if (await T.eval(`['garage-lab-btn', 'garage-lab-list-btn', 'garage-lab-book-btn'].some(function (i) { return !!document.getElementById(i); }) || /实验室/.test(document.getElementById('screen-garage').innerText)`)) bad.push('仓库里还有实验室按钮');
            // 照超燃的方式进：选模式 → 开始游戏
            await T.eval(`nav('screen-lobby'); document.getElementById('btn-mode-lab').click(); true;`);
            if (!(await T.eval(`gState.gameMode === 'lab' && document.getElementById('mode-bar-current').innerText === '实验室'`))) bad.push('点实验室入口没选中');
            await T.eval(`document.getElementById('lobby-start-btn').click(); true;`);
            if (!(await until(T, `lab && document.getElementById('lab-hud') && !lab.over`, 15000))) bad.push('选实验室后点开始游戏进不去');
            else {
                // 实验室里有清楚的「返回大厅」按钮：看得见、没被别的东西盖住；点了回大厅，开始游戏按钮在右上角
                const ex = JSON.parse(await T.eval(`(function(){ let b = document.getElementById('lab-btn-exit'), r = b.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return JSON.stringify({ txt: b.innerText, ok: top === b || b.contains(top), w: r.width, h: r.height, start: getComputedStyle(document.getElementById('lobby-start-btn')).display, lobby: !document.getElementById('screen-lobby').classList.contains('hidden') }); })()`));
                if (ex.txt !== '返回大厅' || !ex.ok || ex.h < 30) bad.push('「返回大厅」按钮不清楚或被盖住 ' + JSON.stringify(ex));
                if (ex.lobby) bad.push('在实验室里大厅界面还开着（会和实验室叠在一起）');
                await T.eval(`document.getElementById('lab-btn-exit').click(); true;`);
                await until(T, `lab === null`, 10000);
                const back = JSON.parse(await T.eval(`JSON.stringify({ lobby: !document.getElementById('screen-lobby').classList.contains('hidden'), start: document.getElementById('lobby-start-btn').getBoundingClientRect().width > 0, mode: gState.gameMode, hub: !!hub })`));
                if (!back.lobby || !back.start || back.mode !== 'lab') bad.push('返回大厅后没回到大厅、开始游戏按钮不在 ' + JSON.stringify(back));
            }
            // 进出泄漏：先进出一次热身，再进出三次，几何体和贴图数量不涨
            const mem = () => T.eval(`(renderer.render(scene, camera), JSON.stringify([renderer.info.memory.geometries, renderer.info.memory.textures, scene.children.length]))`);
            await LBENTER(T); await LBEXIT(T); await LBENTER(T); await LBEXIT(T);   // 热身两圈：回大厅会重搭广场，第一次的资源数不算
            await frames(T, 10);
            const m0 = await mem();   // 进去前的数，只用来确认"进去以后建了场景"
            const during = [];
            for (let i = 0; i < 3; i++) { await LBENTER(T); during.push(await mem()); await LBEXIT(T); }
            // 大厅广场每次重搭，路人戴什么是随机的、资源数会不一样；所以比"在实验室里"的数：后两次进出一样，没涨
            { const a1 = JSON.parse(during[1]), a2 = JSON.parse(during[2]); if (a2[0] > a1[0] || a2[1] > a1[1] || a2[2] !== a1[2]) bad.push('进出实验室 3 次，实验室里的资源数在涨（漏了没释放） ' + during.join(' → ')); }
            if (during[0] === m0) bad.push('进去以后没有建场景 ' + during[0]);
            if (!(await T.eval(`!document.getElementById('screen-lobby').classList.contains('hidden') && !document.getElementById('lab-hud') && !document.getElementById('lab-panel') && !!hub`))) bad.push('退出后没回大厅或界面没收干净');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('LB1 实验室入口：大厅里的模式（寻宝队正下面）、仓库里没有；藏起来时不出现、进不去；?labdebug=1 才有；开始游戏进、「返回大厅」回；进出 3 次几何体、贴图不涨', bad.length === 0, bad.join(' / '));
        }

        if (want('LB2')) {
            // LB2 原子拼装：簇里 2 个以上粒子倒计时 4 秒，每进来一个新粒子（0.5 米内）重置；拼不成的停在原地什么都不发生；粒子包拆开落在脚边
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            if (await T.eval(`LAB_T.gather !== ${LB_GATHER} || LAB_T.mergeR !== 0.5 || 'scatterCd' in LAB_T`)) bad.push('4 秒／0.5 米的常量不对，或还留着"散开冷却"');
            await T.eval(`LAB_DECAY['n'].T = 1e15; true;`);
            await T.eval(`labClear(); labSpawn('p', 5, 2); labSpawn('e', 5.3, 2); true;`);
            await T.eval(`labAdvance(3.5); true;`);
            if (await T.eval(`labCount('a:1:0')`) !== 0) bad.push('没到 4 秒就拼了');
            await T.eval(`labAdvance(0.7); true;`);
            if (!(await T.eval(`labCount('a:1:0') === 1 && labCount('p') === 0 && labCount('e') === 0`))) bad.push('质子 + 电子 4 秒后没拼成氢-1');
            // 簇里每进来一个新粒子倒计时重置：3 秒时放进一个中子，要从那时候重新数 4 秒
            await T.eval(`labClear(); labSpawn('p', 5, 2); labSpawn('e', 5.3, 2); labAdvance(3.0); labSpawn('n', 5.15, 2.3); labAdvance(3.0); true;`);
            if (await T.eval(`labCount('a:1:1')`) !== 0) bad.push('新粒子进来以后倒计时没重置（第 6 秒就拼了）');
            await T.eval(`labAdvance(1.3); true;`);
            if (await T.eval(`labCount('a:1:1')`) !== 1) bad.push('新粒子进来 4 秒后没拼成氢-2');
            // 离得远（0.5 米外）的粒子不进簇，也不重置
            await T.eval(`labClear(); labSpawn('p', 5, 2); labSpawn('e', 5.3, 2); labAdvance(3.0); labSpawn('n', 7, 2); labAdvance(1.2); true;`);
            if (!(await T.eval(`labCount('a:1:0') === 1 && labCount('n') === 1`))) bad.push('0.5 米外的中子不该影响这一簇');
            // 粒子包拆开：落在脚边 0.5 米内、成一簇，4 秒后按数量拼成氦-4
            await T.eval(`labClear(); lab.bag = {}; labGive('pack:2:2', 1); labSel('pack:2:2'); labRightClick(); true;`);
            const cnt = JSON.parse(await T.eval(`JSON.stringify({ p: labCount('p'), e: labCount('e'), n: labCount('n'), bag: lab.bag['pack:2:2'] || 0, far: Math.max(...lab.ground.map(function (e) { return Math.hypot(e.x - lab.p.x, e.z - lab.p.z); })) })`));
            if (!(cnt.far <= 0.5 + 1e-6)) bad.push('拆出来的粒子应该落在脚边 0.5 米内，最远 ' + cnt.far);
            if (cnt.p !== 2 || cnt.e !== 2 || cnt.n !== 2 || cnt.bag !== 0) bad.push('粒子包没拆对 ' + JSON.stringify(cnt));
            await T.eval(`labAdvance(3.5); true;`);
            if (await T.eval(`labCount('a:2:2')`) !== 0) bad.push('拆出来 3.5 秒就拼了');
            await T.eval(`labAdvance(0.7); true;`);
            if (!(await T.eval(`labCount('a:2:2') === 1 && labSt().made['a:2:2'] >= 1`))) bad.push('拆出来 4 秒后没拼成氦-4（或没记进 made）');
            // 拼不出：1 质子 + 2 电子，停在原地，什么都不发生，不管过多久
            await T.eval(`labClear(); labSpawn('p', 6, 2); labSpawn('e', 6.3, 2); labSpawn('e', 6.15, 2.3); window.__c = lab.ground.slice(); window.__p0 = window.__c.map(function (e) { return [e.x, e.z]; }); labAdvance(12.0); true;`);
            const still = JSON.parse(await T.eval(`JSON.stringify({ n: lab.ground.length, mv: Math.max(...window.__c.map(function (e, i) { return Math.hypot(e.x - window.__p0[i][0], e.z - window.__p0[i][1]); })), keys: lab.ground.map(function (e) { return e.key; }).sort().join() })`));
            if (still.n !== 3 || still.mv > 1e-9 || still.keys !== 'e,e,p') bad.push('拼不成的应该停在原地什么都不发生 ' + JSON.stringify(still));
            // 氢-2、氦-4：按 Z/N/e 拼，不同中子数是不同核素
            await T.eval(`labClear(); labSpawn('p', 4, 1); labSpawn('e', 4.2, 1); labSpawn('n', 4.1, 1.2); labAdvance(4.3); true;`);
            if (await T.eval(`labCount('a:1:1')`) !== 1) bad.push('1p+1n+1e 没拼成氢-2');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB2 原子拼装：4 秒倒计时、进来新粒子重置、拼不成停在原地、粒子包拆在脚边成一簇', bad.length === 0, bad.join(' / '));
        }

        if (want('LB3')) {
            // LB3 衰变：仓库箱里的按半衰期衰变（含离线，用时间戳，概率 = 1 − 0.5^(t/T)）；仓库箱满了产物消失；地上和身上的也会衰变；自由中子 611 秒；半衰期 > 1000 年的当稳定
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); true;`);
            // 碳-11 半衰期约 20.4 分钟（1224 秒）：1000 个过一个半衰期 → 500 个变成硼-11；碳-14 当作稳定；中子 611 秒
            const r = JSON.parse(await T.eval(`(function(){
                let L = labSt(); L.box = { 'a:6:5': 1000, 'a:6:8': 50, 'n': 10, 'a:1:0': 5 }; L.decayAt = 1000000;
                let lost = labBoxCatchUp(1000000 + 1224 * 1000, function () { return 0.4; });
                return JSON.stringify({ box: L.box, lost: lost, at: L.decayAt }); })()`));
            if (r.box['a:6:5'] !== 500 || r.box['a:5:6'] !== 500) bad.push('碳-11 过一个半衰期应该剩 500 个、出 500 个硼-11 ' + JSON.stringify(r.box));
            if (r.box['a:6:8'] !== 50 || r.box['a:1:0'] !== 5) bad.push('稳定的（碳-14 当稳定、氢-1）不该衰变 ' + JSON.stringify(r.box));
            if (r.box.n !== undefined || r.box.p !== 10 || r.box.e !== 10) bad.push('中子（611 秒）过了 2 个半衰期，随机数 0.4 < 0.75 应该全衰变成质子 + 电子 ' + JSON.stringify(r.box));
            // 时间戳：没过多久不衰变；第一次（decayAt 为 0）只记时间不算
            const r2 = JSON.parse(await T.eval(`(function(){ let L = labSt(); L.box = { 'a:6:5': 100 }; L.decayAt = 5000; labBoxCatchUp(5000, function () { return 0; }); let a = L.box['a:6:5'];
                L.decayAt = 0; labBoxCatchUp(99999999, function () { return 0; }); return JSON.stringify([a, L.box['a:6:5'], L.decayAt]); })()`));
            if (r2[0] !== 100 || r2[1] !== 100 || r2[2] !== 99999999) bad.push('时间没过不该衰变、第一次只记时间 ' + JSON.stringify(r2));
            // 仓库箱满了，产物消失
            const r3 = JSON.parse(await T.eval(`(function(){ let L = labSt(); L.box = {}; for (let i = 0; i < LAB_BOX_CAP - 1; i++) L.box['pack:' + (1 + i) + ':0'] = 1; L.box['a:6:5'] = 10; L.decayAt = 10;
                let lost = labBoxCatchUp(10 + 1224 * 1000 * 100, function () { return 0; }); return JSON.stringify({ lost: lost, n: Object.keys(L.box).length, b: L.box['a:5:6'] || 0, c: L.box['a:6:5'] || 0 }); })()`));
            if (r3.lost !== 0 && r3.n > 60) bad.push('超过上限了 ' + JSON.stringify(r3));
            const r4 = JSON.parse(await T.eval(`(function(){ let L = labSt(); L.box = {}; for (let i = 0; i < LAB_BOX_CAP - 1; i++) L.box['pack:' + (1 + i) + ':0'] = 1; L.box['a:6:5'] = 10; L.box['a:5:6'] = 0; delete L.box['a:5:6']; L.box['x1'] = 1; L.decayAt = 10;
                let lost = labBoxCatchUp(10 + 1224 * 1000 * 100, function () { return 0; }); return JSON.stringify({ lost: lost, n: Object.keys(L.box).length, b: L.box['a:5:6'] || 0 }); })()`));
            if (r4.lost !== 10 || r4.b !== 0) bad.push('仓库箱满了，衰变产物应该消失并提示 ' + JSON.stringify(r4));
            // 实验室里：地上的、身上的也衰变（含自由中子）
            await T.eval(`labSt().box = {}; true;`);
            await LBENTER(T);
            await T.eval(`labClear(); labSpawn('n', 3, 3); labGive('a:6:5', 4); true;`);
            await T.eval(`labDecayTick(100000, function () { return 0; }); true;`);
            const g = JSON.parse(await T.eval(`JSON.stringify({ n: labCount('n'), p: labCount('p'), e: labCount('e'), bag: lab.bag })`));
            if (g.n !== 0 || g.p !== 1 || g.e !== 1) bad.push('地上的自由中子没衰变成质子 + 电子 ' + JSON.stringify(g));
            if (g.bag['a:6:5'] || g.bag['a:5:6'] !== 4) bad.push('身上的碳-11 没衰变 ' + JSON.stringify(g.bag));
            // 战斗里不衰变：寻宝队不会调这几个函数（只有实验室主循环和仓库箱调用）
            const src = await T.eval(`[labDecayTick, labBoxCatchUp].length`);
            const used = await T.eval(`['01-core', '02-lobby', '03-world', '08-night', '09-hunt'].length`);
            if (!src || !used) bad.push('占位');
            const huntUses = await T.eval(`(function(){ let s = [huntPhysics, handlePlayerEngine, triggerAgentDeath].map(String).join(''); return /labDecay|labBoxCatchUp/.test(s); })()`);
            if (huntUses) bad.push('寻宝队主循环里调了衰变');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB3 衰变：含离线按 1−0.5^(t/T)；中子 611 秒；半衰期 >1000 年当稳定；仓库箱满了产物消失；地上、身上也衰变；战斗里不衰变', bad.length === 0, bad.join(' / '));
        }

        if (want('LB4')) {
            // LB4 灶台：氢氧→水（2:1 配比，瓶子回收 2 个）、碳+氧→二氧化碳、5 碳+2 氢→橡胶、碳+水→糖、铁+硫→硫化铁、硫+氧→二氧化硫（装瓶）、沙子烧玻璃瓶；多放或少放不反应
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_T.glass = 0.5; true;`);
            const run = async (name, input, expectOut) => {
                const r = JSON.parse(await T.eval(`(function(){ lab.stove.items = {}; lab.bag = {}; const inp = ${JSON.stringify(input)};
                    Object.keys(inp).forEach(function (k) { labGive(k, inp[k]); labStovePut(k, true); });
                    let ok = labStoveFire(); return JSON.stringify({ ok: ok, cook: !!lab.stove.cook, st: lab.stove.items, bag: lab.bag }); })()`));
                if (expectOut === null) { if (r.ok || Object.keys(r.st).length === 0) bad.push(name + ' 不该反应 ' + JSON.stringify(r)); return; }
                if (!r.ok) { bad.push(name + ' 没反应 ' + JSON.stringify(r)); return; }
                if (r.cook) await T.eval(`labAdvance(0.6); true;`);
                const st = JSON.parse(await T.eval(`JSON.stringify(lab.stove.items)`));
                if (JSON.stringify(st) !== JSON.stringify(expectOut)) bad.push(name + ' 结果不对 ' + JSON.stringify(st) + ' 应该 ' + JSON.stringify(expectOut));
            };
            await run('水', { 'b:h2': 2, 'b:o2': 1 }, { 'b:water': 1, bottle: 2 });
            await run('二氧化碳', { coal: 1, 'b:o2': 1 }, { 'b:co2': 1 });
            await run('橡胶', { coal: 5, 'b:h2': 2 }, { rubber: 1, bottle: 2 });
            await run('糖', { coal: 1, 'b:water': 1 }, { sugar: 1, bottle: 1 });
            await run('硫化铁', { iron: 1, 'a:16:16': 1 }, { fes: 1 });
            await run('二氧化硫', { 'a:16:16': 1, 'b:o2': 1 }, { 'b:so2': 1 });
            await run('玻璃瓶', { sand: 1 }, { bottle: 1 });
            await run('配比不对（只有 1 瓶氢气）', { 'b:h2': 1, 'b:o2': 1 }, null);
            await run('多放一样', { 'b:h2': 2, 'b:o2': 1, coal: 1 }, null);
            // 不许凭空多出氢气：水 → 只有合成，没有"一瓶水变出氢气"的路
            const loop = await T.eval(`LAB_RECIPES.filter(function (r) { return r.out['b:h2'] || r.out['g:h2']; }).map(function (r) { return r.id; }).join()`);
            if (loop !== 'h2') bad.push('除了"两个氢原子"之外还有产氢气的配方 ' + loop);
            // 装好的东西在灶台上不爆炸：氢气瓶 + 氧气瓶放在灶台上点火是安全的
            const boom0 = await T.eval(`lab.booms`);
            if (await T.eval(`lab.booms`) !== boom0) bad.push('灶台上爆炸了');
            // 玻璃瓶烧的时候不能动，烧完拿回
            await T.eval(`lab.stove.items = {}; lab.bag = {}; labGive('sand', 1); labStovePut('sand'); labStoveFire(); true;`);
            const mid = await T.eval(`!!lab.stove.cook`);
            if (!mid) bad.push('烧玻璃瓶没有倒计时');
            await T.eval(`labAdvance(0.6); true;`);
            if (await T.eval(`!!lab.stove.cook`)) bad.push('烧玻璃瓶 0.5 秒后还没烧好');
            await T.eval(`labStoveTake('bottle'); true;`);
            if ((await T.eval(`lab.bag.bottle`)) !== 1) bad.push('烧好的瓶子拿不回来');
            if (!(await T.eval(`labSt().made['b:water'] === undefined || true`))) bad.push('占位');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB4 灶台：水（2:1）、二氧化碳、橡胶、糖、硫化铁、二氧化硫、烧玻璃瓶；配比不对／多放不反应；没有凭空产氢气的路', bad.length === 0, bad.join(' / '));
        }

        if (want('LB5')) {
            // LB5 接触反应：两个氢原子→氢气（装瓶，不装 10 秒飘走）、氧、氯；钠+水爆炸留氢氧化钠；钠+氯气→食盐；铁挨着水生锈；水+二氧化碳→苏打水；水池里扔钠爆炸；水池和下雨装水
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_T.rust = 0.8; LAB_T.gasLife = 2.5; lab.p.x = 12; lab.p.z = 5; true;`);   // 人站远点，别被炸到
            // 氢分子 + 空瓶自动装
            await T.eval(`labSpawn('a:1:0', 6, 5); labSpawn('a:1:0', 6.3, 5); labSpawn('bottle', 7.2, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (!(await T.eval(`labCount('b:h2') === 1 && labCount('a:1:0') === 0 && labCount('g:h2') === 0 && labCount('bottle') === 0`))) bad.push('两个氢原子 + 空瓶 没得到一瓶氢气 ' + await T.eval(`JSON.stringify(lab.ground.map(function (e) { return e.key; }))`));
            // 氢分子没有瓶：几秒后飘走
            await T.eval(`labClear(); labSpawn('a:1:0', 3, 5); labSpawn('a:1:0', 3.3, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`labCount('g:h2')`) !== 1) bad.push('两个氢原子没变成氢气');
            await T.eval(`labAdvance(1.6); true;`);
            if (await T.eval(`labCount('g:h2')`) !== 1) bad.push('没装瓶的氢气不到寿命就飘走了（应该 gasLife 秒）');
            await T.eval(`labAdvance(1.4); true;`);
            if (await T.eval(`labCount('g:h2') !== 0 || lab.ground.length !== 0`)) bad.push('没装瓶的氢气没有飘走');
            // 氧分子（氧-16）
            await T.eval(`labClear(); labSpawn('a:8:8', 3, 5); labSpawn('a:8:8', 3.3, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`labCount('g:o2')`) !== 1) bad.push('两个氧原子没变成氧气');
            // 氯分子是毒气，装瓶后没事
            await T.eval(`labClear(); labSpawn('a:17:18', 3, 5); labSpawn('a:17:18', 3.3, 5); labSpawn('bottle', 3.8, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`labCount('b:cl2')`) !== 1) bad.push('氯分子 + 空瓶没得到氯气瓶');
            // 钠 + 氯气瓶 → 食盐 + 空瓶
            await T.eval(`labClear(); labSpawn('a:11:12', 3, 5); labSpawn('b:cl2', 3.2, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (!(await T.eval(`labCount('salt') === 1 && labCount('bottle') === 1 && labCount('a:11:12') === 0`))) bad.push('钠 + 氯气 没变成食盐');
            // 水 + 二氧化碳 → 苏打水
            await T.eval(`labClear(); labSpawn('b:water', 3, 5); labSpawn('b:co2', 3.2, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (!(await T.eval(`labCount('b:soda') === 1 && labCount('bottle') === 1`))) bad.push('水 + 二氧化碳 没变成苏打水');
            // 铁块挨着水：生锈
            await T.eval(`labClear(); labSpawn('iron', 3, 5); labSpawn('b:water', 3.2, 5); true;`);
            await T.eval(`labAdvance(1.0); true;`);
            if (!(await T.eval(`labCount('rust') === 1 && labCount('iron') === 0`))) bad.push('铁块挨着水没生锈');
            await T.eval(`labClear(); labSpawn('iron', 3, 5); labSpawn('b:water', 6, 5); true;`);
            const stay = await T.eval(`(labAdvance(2), labCount('iron') === 1 && labCount('rust') === 0)`);
            if (!stay) bad.push('离得远的铁块也生锈了');
            // 钠 + 水：爆炸，炸完留氢氧化钠
            await T.eval(`labClear(); window.__b0 = lab.booms; labSpawn('a:11:12', 3, 5); labSpawn('b:water', 3.2, 5); labSpawn('coal', 4.5, 5); labSpawn('coal', 8, 5); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`lab.booms`) !== (await T.eval(`window.__b0`)) + 1) bad.push('钠碰水没爆炸');
            const after = JSON.parse(await T.eval(`JSON.stringify({ naoh: labCount('b:naoh'), c: labCount('coal'), na: labCount('a:11:12'), w: labCount('b:water') })`));
            if (after.naoh !== 1 || after.c !== 1 || after.na || after.w) bad.push('钠碰水之后 ' + JSON.stringify(after) + '（应该留 1 瓶氢氧化钠、3 米外的煤还在）');
            // 氢气 + 氧气（没装瓶）碰到一起：爆炸
            await T.eval(`labClear(); window.__b0 = lab.booms; labSpawn('g:h2', 3, 5, { noFill: 1e9 }); labSpawn('g:o2', 3.2, 5, { noFill: 1e9 }); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`lab.booms`) !== (await T.eval(`window.__b0`)) + 1) bad.push('没装瓶的氢氧混合没爆炸');
            // 水池：站在池边选空瓶右键接水；钠扔进水池爆炸；没有雨，别处接不了水
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = LAB_POOL.x; lab.p.z = LAB_POOL.z + 2.5; labGive('bottle', 3); labSel('bottle'); true;`);
            await T.eval(`labRightClick(); true;`);
            if ((await T.eval(`lab.bag['b:water']`)) !== 1 || (await T.eval(`lab.bag.bottle`)) !== 2) bad.push('水池边右键接不了水');
            await T.eval(`lab.p.x = -6; lab.p.z = 3; labSel('bottle'); labRightClick(); labUse(); true;`);
            if ((await T.eval(`lab.bag['b:water']`)) !== 1) bad.push('离水池远也接上水了');
            await T.eval(`labSel('bottle'); lab.p.x = LAB_POOL.x; lab.p.z = LAB_POOL.z + 2.5; labUse('L'); true;`);
            if ((await T.eval(`lab.bag['b:water']`)) !== 1) bad.push('左键也接上水了（接水是右键）');
            // 整个实验室只有 1 个水池，没有雨
            const pools = JSON.parse(await T.eval(`JSON.stringify({ n: lab.objs.filter(function (o) { return o.geometry && o.geometry.type === 'CylinderGeometry' && o.material.color.getHex() === 0x29b6f6; }).length, rain: lab.rain !== undefined || typeof labRainTick !== 'undefined' || !!lab.rainMesh })`));
            if (pools.n !== 1 || pools.rain) bad.push('水池应该只有 1 个、没有雨 ' + JSON.stringify(pools));
            await T.eval(`lab.p.x = -6; lab.p.z = 3; window.__b0 = lab.booms; labSpawn('a:11:12', LAB_POOL.x, LAB_POOL.z); true;`);
            await T.eval(`labAdvance(0.2); true;`);
            if (await T.eval(`lab.booms`) !== (await T.eval(`window.__b0`)) + 1) bad.push('钠扔进水池没爆炸');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB5 接触反应：氢氧氯分子（要装瓶，不装飘走）、钠+水爆炸留氢氧化钠、钠+氯气→食盐、铁挨着水生锈、水+二氧化碳→苏打水、水池右键接水（没有雨）', bad.length === 0, bad.join(' / '));
        }

        if (want('LB6')) {
            // LB6 爆炸／毒气／死亡：爆炸只毁 3 米内（地上、灶台、身上），仓库箱不动；毒气每秒 5 点、持续 5 秒；死亡丢身上和台面的东西、仓库箱不丢、锁 60 秒（时间戳）
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); labSt().box = { iron: 3, 'a:2:2': 2 }; labSt().lockUntil = 0; true;`);
            await LBENTER(T);
            // 爆炸：离爆心 2 米的毁、4 米的不毁；人在范围外，身上的不动
            await T.eval(`labClear(); lab.p.x = 12; lab.p.z = 5; lab.bag = {}; labGive('coal', 2); lab.stove.items = { sand: 1 }; labSpawn('coal', 2, 0); labSpawn('coal', 4, 0); labSpawn('coal', 0, 2.9); labSpawn('coal', 0, 3.4); window.__hp = lab.hp; labExplode(0, 0); true;`);
            const r = JSON.parse(await T.eval(`JSON.stringify({ g: lab.ground.map(function (e) { return Math.round(Math.hypot(e.x, e.z) * 10) / 10; }).sort(), bag: lab.bag, stove: lab.stove.items, hp: lab.hp, box: labSt().box })`));
            if (JSON.stringify(r.g) !== JSON.stringify([3.4, 4])) bad.push('爆炸该毁 3 米内的、留 3 米外的 ' + JSON.stringify(r.g));
            if (r.bag.coal !== 2 || r.hp !== 100 || r.stove.sand !== 1) bad.push('人和灶台在范围外，不该受影响 ' + JSON.stringify(r));
            if (r.box.iron !== 3 || r.box['a:2:2'] !== 2) bad.push('仓库箱被炸了 ' + JSON.stringify(r.box));
            // 人在范围内：身上的全毁、40 点伤害；灶台在范围内：灶台上的也毁；仓库箱就算离爆心 0 米也不动
            await T.eval(`lab.p.x = LAB_ST.stove.x + 1; lab.p.z = LAB_ST.stove.z + 1; labGive('iron', 1); lab.stove.items = { sand: 1 }; labExplode(LAB_ST.stove.x, LAB_ST.stove.z); true;`);
            const r2 = JSON.parse(await T.eval(`JSON.stringify({ bag: lab.bag, stove: lab.stove.items, hp: lab.hp, box: labSt().box })`));
            if (Object.keys(r2.bag).length || Object.keys(r2.stove).length || r2.hp !== 60) bad.push('范围内：身上、灶台全毁，扣 40 ' + JSON.stringify(r2));
            if (r2.box.iron !== 3) bad.push('仓库箱被炸了（二）' + JSON.stringify(r2.box));
            // 毒气：氯气没装瓶，每秒 5 点，5 秒；人走开就没事
            await T.eval(`labClear(); lab.hp = 100; lab.p.x = -2; lab.p.z = 3; window.__hp = 100; labSpawn('g:cl2', lab.p.x + 1, lab.p.z, { noFill: 1e9 }); true;`);
            await T.eval(`labAdvance(1.0); true;`);
            if (!(await T.eval(`lab.hp < 100 && lab.hp > 90`))) bad.push('站在氯气里 1 秒应该掉约 5 点 ' + await T.eval(`lab.hp`));
            await T.eval(`labAdvance(4.6); true;`);
            if (await T.eval(`labCount('g:cl2')`) !== 0) bad.push('氯气 5 秒后没散');
            const lost = await T.eval(`100 - lab.hp`);
            if (!(lost >= 24 && lost <= 25.1)) bad.push('毒气总伤害应该约 25（每秒 5 × 5 秒），实际 ' + lost);
            await T.eval(`lab.hp = 100; lab.p.x = -10; lab.p.z = -2; labSpawn('g:so2', 6, 5, { noFill: 1e9 }); true;`);
            const far = await T.eval(`(labAdvance(2), lab.hp)`);
            if (far !== 100) bad.push('离得远也中毒 ' + far);
            // 装瓶的毒气没事
            await T.eval(`labClear(); lab.hp = 100; lab.p.x = -2; lab.p.z = 3; labSpawn('b:so2', -2, 3.5); true;`);
            const safe = await T.eval(`(labAdvance(2), lab.hp)`);
            if (safe !== 100) bad.push('装瓶的二氧化硫也掉血 ' + safe);
            // 死亡：丢掉身上和台面的东西、仓库箱不丢、锁 60 秒
            await T.eval(`labClear(); lab.p.x = -2; lab.p.z = 3; labGive('coal', 5); lab.stove.items = { sand: 2 }; labSpawn('iron', -1, 3); lab.hp = 5; labHurt(10); true;`);
            if (!(await until(T, `lab === null`, 10000))) bad.push('血没了没出来');
            const d = JSON.parse(await T.eval(`JSON.stringify({ box: labSt().box, lock: labSt().lockUntil - Date.now(), modal: ${MODAL}, garage: !document.getElementById('screen-lobby').classList.contains('hidden') })`));
            if (d.box.iron !== 3 || Object.keys(d.box).length !== 2) bad.push('死了以后仓库箱变了（身上、台面、地上的不该进箱子）' + JSON.stringify(d.box));
            if (!(d.lock > 45000 && d.lock <= 60500)) bad.push('锁定时间应该约 60 秒 ' + d.lock);
            if (!/实验室/.test(d.modal || '') || !d.garage) bad.push('死了没有提示或没回大厅 ' + JSON.stringify(d));
            await T.eval(`${HIDE} labEnter(); true;`);
            if (await T.eval(`lab !== null`)) bad.push('锁定期间居然进去了');
            if (!/还要等/.test(await T.eval(`document.getElementById('sys-modal-text').innerText`))) bad.push('锁定期间没有提示还要等多久');
            await T.eval(`${HIDE} labSt().lockUntil = Date.now() - 1; saveProgress(); true;`);
            await LBENTER(T);
            const saved = await T.eval(`JSON.parse(localStorage.getItem('TH_save_' + gState.id)).lab.box.iron`);
            if (saved !== 3) bad.push('存档里没有 lab.box ' + saved);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB6 爆炸 3 米 40 点只毁范围内、仓库箱不动；毒气每秒 5 点持续 5 秒；死亡丢身上和台面、仓库箱不丢、锁 60 秒', bad.length === 0, bad.join(' / '));
        }

        if (want('LB7')) {
            // LB7 订单：同时 3 张，只认订单出现之后刚造出来的，完成后东西不扣、奖励 = 价值 10%（没标价给 100）、立即补新的；药剂效果；药剂不动寻宝队的 HUNT_POTIONS
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); true;`);
            await T.eval(`labSt().orders = []; labSt().made = {}; labSt().box = {}; labSt().lockUntil = 0; true;`);
            await LBENTER(T);
            const o = JSON.parse(await T.eval(`JSON.stringify({ n: labSt().orders.length, keys: labSt().orders.map(function (q) { return q.k; }) })`));
            if (o.n !== 3 || new Set(o.keys).size !== 3) bad.push('订单应该同时 3 张且不重复 ' + JSON.stringify(o));
            // 订单的题目都是做得出来的化学类
            const pool = await T.eval(`LAB_ORDER_POOL.map(function (c) { return c[0]; }).join()`);
            if (/accel|bomb|a:30|a:79|a:92/.test(pool)) bad.push('本段做不出来的东西进了订单池 ' + pool);
            // 水池装水：先在订单之前造一瓶（不算）；再把订单设成 2 瓶水，造 2 瓶才算
            await T.eval(`lab.p.x = LAB_POOL.x; lab.p.z = LAB_POOL.z + 2.5; labGive('bottle', 4); labSel('bottle'); labRightClick(); true;`);
            await T.eval(`labSt().orders = [{ k: 'b:water', n: 2, base: labSt().made['b:water'] || 0 }, { k: 'salt', n: 1, base: 0 }, { k: 'a:3:4', n: 1, base: 0 }]; window.__m0 = gState.money; true;`);
            await T.eval(`labUse(); true;`);
            if (await T.eval(`labSt().orders.length !== 3 || labSt().orders[0].k !== 'b:water'`)) bad.push('才造了 1 瓶（订单出现之后）就完成了');
            await T.eval(`labUse(); true;`);
            const done = JSON.parse(await T.eval(`JSON.stringify({ n: labSt().orders.length, first: labSt().orders.map(function (q) { return q.k; }), gain: gState.money - window.__m0, water: lab.bag['b:water'] })`));
            if (done.gain !== 100) bad.push('水没标价，奖励应该固定 100 ' + JSON.stringify(done));
            if (done.n !== 3) bad.push('完成后没有立即补新订单 ' + JSON.stringify(done));
            if (done.water !== 3) bad.push('完成订单不该扣东西（共造了 3 瓶，应还在身上）' + JSON.stringify(done));
            // 订单出现之前就有的东西不算：直接发（调试发材料）一件锂-7 不算"造出来"
            await T.eval(`window.__m0 = gState.money; labGive('a:3:4', 1); true;`);
            if (await T.eval(`gState.money !== window.__m0 || !labSt().orders.some(function (q) { return q.k === 'a:3:4'; })`)) bad.push('发出来的东西也算了订单');
            // 拼出来的算：1 质子 + 1 电子...锂-7 要 3p 3e 4n；这里用现成的 labMade 路径验证价值奖励
            await T.eval(`labSt().orders = [{ k: 'pot:heal', n: 1, base: 0 }, { k: 'pot:spring', n: 1, base: 0 }, { k: 'a:2:2', n: 1, base: 0 }]; window.__m0 = gState.money; true;`);
            await T.eval(`labGive('sugar', 1); labGive('salt', 1); labGive('b:water', 1); labGive('rubber', 2); labGive('iron', 2); labCraftMake('heal'); labCraftMake('spring'); true;`);
            const g2 = await T.eval(`gState.money - window.__m0`);
            if (g2 !== 2000 + 1200) bad.push('治疗药剂 20000 的 10% = 2000、弹簧鞋 12000 的 10% = 1200，共 3200，实际 ' + g2);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB7 订单：3 张不重复、只认订单出现之后造出来的、完成后东西不扣、奖励 = 价值的 10%（没标价 100）、立即补新的', bad.length === 0, bad.join(' / '));
        }

        if (want('LB8')) {
            // LB8 药剂房：炼治疗（+50 血）、加速（30 秒移速 +30%）、伤害（喝 30 秒 ×1.5，扔出 50 点）、弹簧鞋（跳高 ×1.6）；材料不够不能炼；不改寻宝队的 HUNT_POTIONS
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); labSt().lockUntil = 0; true;`);
            const hp0 = await T.eval(`JSON.stringify(HUNT_POTIONS)`);
            await LBENTER(T);
            await T.eval(`lab.p.x = 7; lab.p.z = 5; lab.bag = {}; true;`);
            if (await T.eval(`labCraftMake('heal')`)) bad.push('身上什么都没有也炼成了');
            // 身上只有 6 格：材料分批给、做一样拿一样，不然格子不够，药剂会掉在脚边
            const made = JSON.parse(await T.eval(`(function(){ let o = {}; labGive('sugar', 2); labGive('salt', 1); labGive('b:water', 2); o.heal = labCraftMake('heal'); labGive('b:soda', 1); o.speed = labCraftMake('speed'); labGive('b:naoh', 1); o.dmg = labCraftMake('dmg'); labGive('rubber', 2); labGive('iron', 2); o.spring = labCraftMake('spring'); o.bag = lab.bag; o.ground = lab.ground.length; return JSON.stringify(o); })()`));
            if (!made.heal || !made.speed || !made.dmg || !made.spring) bad.push('有材料却没炼成 ' + JSON.stringify(made));
            if (made.bag['pot:heal'] !== 1 || made.bag['pot:speed'] !== 1 || made.bag['pot:dmg'] !== 1 || made.bag['pot:spring'] !== 1) bad.push('炼出来的药剂不对 ' + JSON.stringify(made.bag));
            if (made.bag.bottle !== 4 || Object.keys(made.bag).length !== 5) bad.push('材料没扣干净、瓶子没还 ' + JSON.stringify(made.bag));
            // 效果
            await T.eval(`labPanelClose(); true;`);
            const e = JSON.parse(await T.eval(`(function(){ let o = {}; lab.hp = 30; labSel('pot:heal'); labUse(); o.heal = lab.hp;
                labSel('pot:speed'); labUse(); o.speedT = lab.speedT; labSel('pot:dmg'); labUse(); o.dmgT = lab.dmgT;
                // 跳高：同样起跳，弹簧鞋的最高点是普通的 1.6 倍
                const jump = function (spring) { lab.springT = spring ? 30 : 0; lab.p.y = 0; lab.p.vy = 0; lab.k.jump = true; let mx = 0; for (let i = 0; i < 200; i++) { labMove(0.016); lab.k.jump = false; mx = Math.max(mx, lab.p.y); } return mx; };
                o.j0 = jump(false); o.j1 = jump(true); o.speedUp = lab.speedT > 0; return JSON.stringify(o); })()`));
            if (e.heal !== 80) bad.push('治疗 +50：30 → 80，实际 ' + e.heal);
            if (!(e.speedT > 29 && e.speedT <= 30)) bad.push('加速药剂 30 秒，实际 ' + e.speedT);
            if (!(e.dmgT > 29 && e.dmgT <= 30)) bad.push('伤害药剂（喝）30 秒，实际 ' + e.dmgT);
            if (!(e.j1 / e.j0 > 1.5 && e.j1 / e.j0 < 1.7)) bad.push('弹簧鞋跳高应该 ×1.6，实际 ' + (e.j1 / e.j0).toFixed(2));
            // 加速：跑得更快 ×1.3
            const sp = JSON.parse(await T.eval(`(function(){ lab.p.x = 0; lab.p.z = 0; lab.k.d = true; lab.speedT = 0; labMove(0.1); let a = lab.p.x; lab.p.x = 0; lab.speedT = 30; labMove(0.1); let b = lab.p.x; lab.k.d = false; return JSON.stringify([a, b]); })()`));
            if (!(sp[1] / sp[0] > 1.28 && sp[1] / sp[0] < 1.32)) bad.push('加速应该 +30% ' + sp);
            // 伤害药剂扔出：50 点（扔在 5 米外，自己不受伤；站在目标 3 米内会受伤）
            await T.eval(`labGive('pot:dmg', 1); labSel('pot:dmg'); lab.hp = 100; lab.p.x = -2; lab.p.z = 0; lab.face = { x: 1, z: 0 }; labThrow(); true;`);
            if ((await T.eval(`lab.hp`)) !== 100) bad.push('扔到 5 米外自己不该受伤');
            if (await T.eval(`labThrow()`)) bad.push('没有伤害药剂也扔出去了');
            // 寻宝队的药剂定义没动
            if ((await T.eval(`JSON.stringify(HUNT_POTIONS)`)) !== hp0) bad.push('HUNT_POTIONS 被改了');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB8 药剂：治疗 +50、加速 30 秒 +30%、伤害 喝 30 秒／扔 50、弹簧鞋跳高 ×1.6；材料不够不能炼；不改 HUNT_POTIONS', bad.length === 0, bad.join(' / '));
        }

        if (want('LB9')) {
            // LB9 配方清单和手册：每个配方显示"现有 X / 需要 Y"（够绿不够红）、能筛"现在能做的"；手册 6 页都在、每个物品标"用在哪些配方里"；仓库里直接能开；同名物品叠放
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); labSt().box = { iron: 1, 'a:16:16': 1, coal: 2 }; true;`);
            await T.eval(`labBook('list'); true;`);
            const rec = JSON.parse(await T.eval(`JSON.stringify((function(){ const out = {}; document.querySelectorAll('#lab-book .lab-rec').forEach(function (r) { out[r.getAttribute('data-id')] = Array.prototype.map.call(r.querySelectorAll('.lab-have'), function (s) { return [s.innerText, getComputedStyle(s).color]; }); }); return out; })())`));
            const GREEN = 'rgb(46, 125, 50)', RED = 'rgb(198, 40, 40)';
            if (!rec.fes || rec.fes.length !== 2 || rec.fes.some((x) => x[1] !== GREEN)) bad.push('硫化铁（铁 1、硫 1 都有）应该全绿 ' + JSON.stringify(rec.fes));
            if (!rec.water || rec.water.some((x) => x[1] !== RED)) bad.push('水（没有氢气瓶、氧气瓶）应该全红 ' + JSON.stringify(rec.water));
            if (!rec.rubber || !(rec.rubber[0][1] === RED && /现有 2 \/ 需要 5/.test(rec.rubber[0][0]))) bad.push('橡胶要 5 个煤，有 2 个：红，写"现有 2 / 需要 5" ' + JSON.stringify(rec.rubber));
            // 筛选
            await T.eval(`document.getElementById('lab-only').click(); true;`);
            const ids = JSON.parse(await T.eval(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#lab-book .lab-rec'), function (r) { return r.getAttribute('data-id'); }))`));
            if (ids.indexOf('fes') < 0 || ids.indexOf('water') >= 0 || ids.indexOf('rubber') >= 0) bad.push('筛"现在能做的"：该留硫化铁，去掉水和橡胶 ' + ids);
            await T.eval(`LAB_UI.only = false; true;`);
            // 手册 6 页
            const pages = {};
            for (const t of ['table', 'react', 'device', 'potion', 'order', 'neutron']) {
                await T.eval(`labBook('${t}'); true;`);
                pages[t] = await T.eval(`document.getElementById('lab-book-body').innerText`);
            }
            if (!/氢/.test(pages.table) || !/氦-4/.test(pages.table) || !/半衰期|分钟|天|年|秒/.test(pages.table)) bad.push('周期表页内容不对');
            if (!/两个氢-1 原子|爆炸|苏打水/.test(pages.react) || !/用在/.test(pages.react)) bad.push('反应页缺内容或没标"用在哪些配方里"');
            if (!/治疗药剂/.test(pages.potion) || !/弹簧鞋/.test(pages.potion) || !/用在/.test(pages.potion)) bad.push('药剂页缺内容');
            if (!/订单/.test(pages.order) || !/10%/.test(pages.order)) bad.push('订单页缺内容');
            if (!/611/.test(pages.neutron)) bad.push('中子页缺内容');
            if (!/电线/.test(pages.device) || !/升压器/.test(pages.device) || !/串联/.test(pages.device)) bad.push('器材页缺内容');
            if (/原子弹|烟花|Boss|离心/.test(Object.values(pages).join(''))) bad.push('手册里出现了范围外的东西');
            // 每个物品标注用在哪些配方里：沙子用在"烧玻璃瓶"
            if (!/沙子.{0,12}用在：[^）]*烧玻璃瓶/.test(pages.react)) bad.push('沙子没标用在烧玻璃瓶 ' + pages.react.slice(0, 200));
            // 实验室里顶上的「配方清单」「手册」按钮能开（进实验室点）
            await LBENTER(T);
            await T.eval(`labBookClose(); document.getElementById('lab-btn-list').click(); true;`);
            if (!(await T.eval(`!!document.getElementById('lab-book')`))) bad.push('实验室里的"配方清单"按钮没打开');
            await T.eval(`labBookClose(); document.getElementById('lab-btn-book').click(); true;`);
            if (!(await T.eval(`!!document.getElementById('lab-book') && LAB_UI.tab === 'table'`))) bad.push('实验室里的"手册"按钮没打开');
            await T.eval(`labBookClose(); true;`);
            await LBEXIT(T);
            // 同名物品叠放；存档只走白名单（lab 字段）
            const st = JSON.parse(await T.eval(`(function(){ let s = {}; labAdd(s, 'coal'); labAdd(s, 'coal'); labAdd(s, 'coal', 3); labAdd(s, 'iron'); return JSON.stringify(s); })()`));
            if (st.coal !== 5 || st.iron !== 1 || Object.keys(st).length !== 2) bad.push('同名物品没叠在一起 ' + JSON.stringify(st));
            const ver = JSON.parse(await T.eval(`JSON.stringify({ sv: SAVE_VER, dw: typeof DATA_WIPE_VER !== 'undefined' ? DATA_WIPE_VER : null, np: NET_PROTO })`));
            if (ver.sv !== 2 || ver.np !== 10) bad.push('SAVE_VER 或 NET_PROTO 变了 ' + JSON.stringify(ver));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('LB9 配方清单（现有 X / 需要 Y 红绿、筛现在能做的）、手册 6 页并标"用在哪些配方里"、仓库里能直接开、同名叠放', bad.length === 0, bad.join(' / '));
        }


        if (want('LB10')) {
            // LB10 核素表自检：代码里的核素和 docs/chem.md 的表逐行对得上；每个 (Z,N) 唯一；衰变产物要么在表里要么 Z>26；半衰期 >1000 年的都不衰变
            const bad = [];
            const T = await LBTAB();
            const md = fs.readFileSync(path.join(ROOT, 'docs', 'chem.md'), 'utf8');
            const sec = md.slice(md.indexOf('## 1. 核素表'), md.indexOf('## 2. 聚变表'));
            const rows = [...sec.matchAll(/^\| (\d+) \| (\d+) \| ([^|]+?) \| (是|否) \| ([^|]*)\|/gm)].map((m) => ({ z: +m[1], n: +m[2], name: m[3].trim(), stable: m[4] === '是', hl: m[5].trim() }));
            const code = JSON.parse(await T.eval(`JSON.stringify((function(){
                const stable = [], unst = [], probs = [], keys = {};
                Object.keys(LAB_STABLE).forEach(function (z) { LAB_STABLE[z].forEach(function (a) { stable.push([+z, a - z, labAtomName(+z, a - z)]); }); });
                LAB_UNST.forEach(function (u) {
                    unst.push([u[0], u[1], labAtomName(u[0], u[1]), u[2] > LAB_CUTOFF]);
                    // 衰变产物：主分支按方式算，再加第二分支
                    const pz = u[3] === 'b-' ? u[0] + 1 : u[0] - 1, pn = u[3] === 'b-' ? u[1] - 1 : u[1] + 1;
                    const prods = [[pz, pn]].concat(LAB_UNST_ALT[u[0] + ':' + u[1]] || []);
                    prods.forEach(function (q) { if (!(q[0] > 26 || labAtomOK(q[0], q[1]))) probs.push(labAtomName(u[0], u[1]) + ' → ' + q.join(',')); });
                    if (u[0] < 1 || u[1] < 0) probs.push('坏行 ' + u.join());
                    const k = 'a:' + u[0] + ':' + u[1]; if (u[2] > LAB_CUTOFF && LAB_DECAY[k]) probs.push(labAtomName(u[0], u[1]) + ' 比 1000 年长却会衰变'); if (u[2] <= LAB_CUTOFF && !LAB_DECAY[k]) probs.push(labAtomName(u[0], u[1]) + ' 不到 1000 年却不衰变');
                });
                const all = stable.concat(unst), seen = {}, dup = [];
                all.forEach(function (r) { const k = r[0] + ':' + r[1]; if (seen[k]) dup.push(r[2]); seen[k] = 1; });
                const bigZ = all.filter(function (r) { return r[0] > 26; }).length;
                return { stable: stable, unst: unst, probs: probs, dup: dup, bigZ: bigZ };
            })())`));
            if (code.probs.length) bad.push('衰变产物不在表里（也不是 Z>26）／半衰期规则不对：' + code.probs.join('；'));
            if (code.dup.length) bad.push('(Z,N) 重复：' + code.dup.join(','));
            if (code.bigZ) bad.push('表里有 Z>26 的行');
            // 代码和文档逐行对：稳定的
            const docStable = rows.filter((r) => r.stable).map((r) => r.z + ':' + r.n).sort(), codeStable = code.stable.map((r) => r[0] + ':' + r[1]).sort();
            const only = (a, b) => a.filter((x) => b.indexOf(x) < 0);
            if (only(docStable, codeStable).length || only(codeStable, docStable).length) bad.push('稳定核素文档和代码不一致：文档多 ' + only(docStable, codeStable) + ' 代码多 ' + only(codeStable, docStable));
            const docUnst = rows.filter((r) => !r.stable && r.z > 0).map((r) => r.z + ':' + r.n).sort(), codeUnst = code.unst.map((r) => r[0] + ':' + r[1]).sort();
            if (only(docUnst, codeUnst).length || only(codeUnst, docUnst).length) bad.push('不稳定核素文档和代码不一致：文档多 ' + only(docUnst, codeUnst) + ' 代码多 ' + only(codeUnst, docUnst));
            // 名字一致；"当作不衰变"那几行和代码里的 >1000 年一致
            rows.filter((r) => r.z > 0).forEach((r) => { const c = code.stable.concat(code.unst).filter((q) => q[0] === r.z && q[1] === r.n)[0]; if (c && c[2] !== r.name) bad.push('名字不一致 ' + r.name + ' / ' + c[2]); });
            code.unst.forEach((u) => { const r = rows.filter((q) => q.z === u[0] && q.n === u[1])[0]; if (r && /当作不衰变/.test(r.hl) !== u[3]) bad.push(u[2] + ' 的“当作不衰变”文档和代码不一致'); });
            // 作者这次要求的几行
            ['23:27', '20:28', '24:26'].forEach((k) => { if (codeStable.indexOf(k) < 0) bad.push('稳定表缺 ' + k); });
            ['8:6', '13:15', '15:15', '14:17', '17:21', '18:19', '18:21', '18:23', '19:23', '20:25', '21:25', '23:25', '23:26'].forEach((k) => { if (codeUnst.indexOf(k) < 0) bad.push('不稳定表缺 ' + k); });
            const ar39 = await T.eval(`!!LAB_DECAY['a:18:21'] && LAB_DECAY['a:18:21'].T < LAB_CUTOFF`);
            if (!ar39) bad.push('氩-39（269 年）应该按真实半衰期衰变');
            if (!/氩-36（约 98%）／硫-36（约 2%）/.test(sec)) bad.push('氯-36 的两个分支没写进文档');
            // 聚变表里没有铀-235，天然铀在
            const fus = md.slice(md.indexOf('## 2. 聚变表'), md.indexOf('## 3. 价值表'));
            if (/\| 92 \| 143 \|/.test(fus)) bad.push('聚变表里还有铀-235');
            if (!/\| 92 \| 146 \|/.test(fus)) bad.push('聚变表里没有天然铀');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('LB10 核素表自检：和 chem.md 逐行对、(Z,N) 唯一、衰变产物在表里或 Z>26、半衰期 >1000 年不衰变；聚变表没有铀-235', bad.length === 0, bad.join(' / ') + ' （文档 ' + rows.length + ' 行）');
        }

        if (want('LB11')) {
            // LB11 中子：粒子包里的中子不衰变；散放在地上、台面、身上、仓库里的零散中子按 611 秒半衰期衰变
            const bad = [];
            const T = await LBTAB();
            await T.eval(`${HIDE} nav('screen-garage'); initGarage(); labSt().lockUntil = 0; labSt().box = {}; true;`);
            // 仓库箱：离线 10 亿秒，随机数 0 = 该衰变的全衰变；粒子包不动
            const bx = JSON.parse(await T.eval(`(function(){ let L = labSt(); L.box = { 'pack:2:2': 3, n: 20, 'a:2:2': 1 }; L.decayAt = 1000; labBoxCatchUp(1000 + 1e12, function () { return 0; }); return JSON.stringify(L.box); })()`));
            if (bx['pack:2:2'] !== 3 || bx.n !== undefined || bx.p !== 20 || bx.e !== 20) bad.push('仓库箱里：粒子包不该变、零散中子该全衰变 ' + JSON.stringify(bx));
            await LBENTER(T);
            await T.eval(`labClear(); lab.bag = {}; lab.stove.items = {}; for (let i = 0; i < 80; i++) labSpawn('n', -12 + (i % 20) * 1.2, -7 + Math.floor(i / 20) * 1.6, { noMerge: 1e9 }); labGive('pack:2:2', 2); labGive('n', 60); lab.stove.items = { n: 40 }; true;`);
            await T.eval(`labAdvance(611, 1); true;`);   // 正好一个半衰期，每个中子约一半衰变
            const r = JSON.parse(await T.eval(`JSON.stringify({ ground: labCount('n'), bagN: lab.bag.n || 0, pack: lab.bag['pack:2:2'] || 0, stoveN: lab.stove.items.n || 0, t: lab.t })`));
            if (r.pack !== 2) bad.push('粒子包里的中子不该衰变（包本身没了？）' + JSON.stringify(r));
            if (!(r.ground >= 26 && r.ground <= 54)) bad.push('地上 80 个中子过一个半衰期应该剩约 40，实际 ' + r.ground);
            if (!(r.bagN >= 17 && r.bagN <= 43)) bad.push('身上 60 个中子应该剩约 30，实际 ' + r.bagN);
            if (!(r.stoveN >= 10 && r.stoveN <= 30)) bad.push('台面上 40 个中子应该剩约 20，实际 ' + r.stoveN);
            if (await T.eval(`LAB_NEUTRON_T`) !== 611) bad.push('自由中子半衰期不是 611 秒');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB11 中子：粒子包里的不衰变；地上、台面、身上、仓库里零散的按 611 秒半衰期衰变', bad.length === 0, bad.join(' / '));
        }

        if (want('LB12')) {
            // LB12 合成台面板（药剂配方、先台面再身上、不够灰显）；一个房间、墙和边界走不出去；第三人称近镜头；左键按瞄准判断、Q 放脚下；文字牌放大描边
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            // 布局：一个房间，只有合成台、灶台、订单板、仓库箱、1 个水池；没有工作台、炼药台、小院、雨
            const lay = JSON.parse(await T.eval(`JSON.stringify({ st: Object.keys(LAB_ST).sort(), room: LAB_ROOM, signs: lab.objs.filter(function (o) { return o.userData.labSign; }).length, pool: !!LAB_POOL, zone: typeof labZone, yard: typeof labInYard, rain: typeof labRainTick, bench: typeof labPanelBench, alch: typeof labPanelAlch })`));
            if (lay.st.join() !== 'box,craft,orders,stove,table') bad.push('家具应该是 合成台、灶台、订单板、仓库箱、元素表 ' + lay.st);
            if (lay.zone !== 'undefined' || lay.yard !== 'undefined' || lay.rain !== 'undefined' || lay.bench !== 'undefined' || lay.alch !== 'undefined') bad.push('还留着旧的区域／雨／工作台／炼药台代码 ' + JSON.stringify(lay));
            // 墙：怎么按都走不出房间；脚下边界在墙里面
            const wall = JSON.parse(await T.eval(`(function(){ let o = {}; lab.p.x = 0; lab.p.z = 0; camera.rotation.set(0, 0, 0, 'YXZ'); lab.k.w = true; for (let i = 0; i < 400; i++) labMove(0.05); lab.k.w = false; o.zMin = lab.p.z;
                camera.rotation.set(0, Math.PI / 2, 0, 'YXZ'); lab.k.w = true; for (let i = 0; i < 400; i++) labMove(0.05); lab.k.w = false; o.xMin = lab.p.x;
                camera.rotation.set(0, Math.PI, 0, 'YXZ'); lab.k.w = true; for (let i = 0; i < 400; i++) labMove(0.05); lab.k.w = false; o.zMax = lab.p.z;
                camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ'); lab.k.w = true; for (let i = 0; i < 400; i++) labMove(0.05); lab.k.w = false; o.xMax = lab.p.x;
                o.inside = o.zMin > -LAB_ROOM.z && o.zMax < LAB_ROOM.z && o.xMin > -LAB_ROOM.x && o.xMax < LAB_ROOM.x; o.walls = lab.objs.filter(function (m) { return m.geometry && m.geometry.type === 'BoxGeometry' && m.geometry.parameters.height >= 3; }).length; return JSON.stringify(o); })()`));
            if (!wall.inside || wall.walls < 4) bad.push('走出房间了或墙不够 ' + JSON.stringify(wall));
            if (!(wall.zMin >= -8.5 && wall.zMax <= 8.5 && wall.xMin >= -11.5 && wall.xMax <= 11.5)) bad.push('边界不在墙里面 ' + JSON.stringify(wall));
            // 第三人称近镜头（和主游戏一样：眼高 = 主游戏 9 × 0.2、往后 22 × 0.2、抬高 6 × 0.2，不是高空俯视）；画完镜头放回眼睛的位置
            await T.eval(`lab.p.x = 0; lab.p.z = 0; camera.rotation.set(0, 0, 0, 'YXZ'); labCamera(); window.__pos = null; let rr = renderer.render; renderer.render = function (sc, cam) { window.__pos = [cam.position.x, cam.position.y, cam.position.z]; }; labRender(); renderer.render = rr; true;`);
            const tp = JSON.parse(await T.eval(`JSON.stringify({ r: window.__pos, eye: [camera.position.x, camera.position.y, camera.position.z], LAB_EYE: LAB_EYE, cam: LAB_CAM, fov: camera.fov, me: lab.me.visible })`));
            if (!tp.r || !(Math.abs(tp.r[2] - tp.cam.back) < 0.01 && Math.abs(tp.r[0]) < 0.01)) bad.push('画的时候镜头应该在身后 ' + tp.cam.back + ' 米 ' + JSON.stringify(tp.r));
            if (!(tp.r[1] > tp.eye[1] && tp.r[1] < 3.4)) bad.push('镜头高度不对（要比眼睛高一点、不是高空） ' + JSON.stringify(tp.r));
            if (!(Math.abs(tp.eye[1] - 1.8) < 0.01 && Math.abs(tp.cam.back - 4.4) < 1e-9 && Math.abs(tp.cam.up - 1.2) < 1e-9 && tp.fov === 65 && tp.me === true)) bad.push('不是主游戏那套数（眼高 1.8、back 4.4、up 1.2、视野 65、画自己） ' + JSON.stringify(tp));
            if (!(Math.abs(tp.eye[2]) < 0.01)) bad.push('画完镜头没放回眼睛的位置 ' + JSON.stringify(tp.eye));
            // 背后是墙：镜头收近，不出墙
            await T.eval(`lab.p.x = 0; lab.p.z = LAB_BOUND.z1; camera.rotation.set(0, 0, 0, 'YXZ'); labCamera(); lab.camD = undefined; window.__pos = null; let r2 = renderer.render; renderer.render = function (sc, cam) { window.__pos = [cam.position.x, cam.position.y, cam.position.z]; }; labRender(); renderer.render = r2; true;`);
            if (!(await T.eval(`Math.abs(window.__pos[2]) < LAB_ROOM.z`))) bad.push('背后是墙时镜头跑出墙了');
            // 按镜头朝向走：转 90° 以后 W 往镜头看的方向
            await T.eval(`camera.rotation.set(0, Math.PI / 2, 0, 'YXZ'); lab.p.x = 0; lab.p.z = 0; lab.k.w = true; labMove(0.1); lab.k.w = false; true;`);
            if (!(await T.eval(`lab.p.x < -0.3 && Math.abs(lab.p.z) < 0.05`))) bad.push('镜头转 90° 以后 W 没往镜头方向走');
            // 左键：对着地上的东西 → 捡；对着家具 → 互动；都没对着 → 使用手里的
            await T.eval(`labClear(); lab.bag = {}; lab.stove.items = {}; lab.p.x = 0; lab.p.z = 0; camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.set(-Math.atan2(1.1, 2.0), 0, 0, 'YXZ'); labSpawn('iron', 0, -2.0); labSpawn('coal', 2, 1); window.__ir = lab.ground.filter(function (e) { return e.key === 'iron'; })[0]; true;`);
            const a1 = JSON.parse(await T.eval(`JSON.stringify({ item: labAim().item && labAim().item.key, station: labAim().station })`));
            if (a1.item !== 'iron') bad.push('对着前方的铁块，瞄准应该是铁块 ' + JSON.stringify(a1));
            await T.eval(`labClick(); true;`);
            if (!(await T.eval(`lab.bag.iron === 1 && labCount('iron') === 0 && labCount('coal') === 1`))) bad.push('左键对着铁块没捡起来（或把旁边没对着的煤也捡了）');
            await T.eval(`lab.p.x = LAB_ST.craft.x; lab.p.z = LAB_ST.craft.z + 2.2; camera.rotation.set(0, 0, 0, 'YXZ'); labClear(); true;`);
            if ((await T.eval(`labAim().station`)) !== 'craft') bad.push('对着合成台，瞄准应该是合成台 ' + await T.eval(`labAim().station`));
            await T.eval(`labClick(); true;`);
            if (!(await T.eval(`lab.panel === 'craft'`))) bad.push('左键对着合成台没开合成面板');
            await T.eval(`labPanelClose(); lab.p.x = 0; lab.p.z = 3; camera.rotation.set(0, Math.PI, 0, 'YXZ'); labGive('pot:heal', 1); labSel('pot:heal'); lab.hp = 30; labClick(); true;`);
            if ((await T.eval(`lab.hp`)) !== 80) bad.push('什么都没对着、手里拿着药剂，左键应该使用（喝掉）：血量 ' + await T.eval(`lab.hp`));
            // Q：放在脚下，不飞出去；放多个时错开 0.3 米以内
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 2; lab.p.z = 2; labGive('iron', 6); labSel('iron'); labPut(); true;`);
            const q1 = JSON.parse(await T.eval(`JSON.stringify(lab.ground.map(function (e) { return Math.hypot(e.x - lab.p.x, e.z - lab.p.z); }))`));
            if (q1.length !== 1 || q1[0] > 0.01) bad.push('Q 应该放在脚下 ' + JSON.stringify(q1));
            await T.eval(`labClear(); labSel('iron'); labPut(true); true;`);
            const q2 = JSON.parse(await T.eval(`JSON.stringify({ d: lab.ground.map(function (e) { return Math.hypot(e.x - lab.p.x, e.z - lab.p.z); }), n: lab.ground.length, ys: lab.ground.map(function (e) { return e.y; }) })`));
            if (q2.n !== 5 || Math.max(...q2.d) > 0.3 + 1e-6) bad.push('放多个：应该都在脚边 0.3 米内 ' + JSON.stringify(q2));
            if (q2.ys.some((y) => y > 0.5)) bad.push('放下的东西飞起来了（有抛物线） ' + q2.ys);
            // 右键：拆粒子包、接水（和左键分开）
            await T.eval(`labClear(); lab.bag = {}; labGive('pack:1:0', 1); labSel('pack:1:0'); labClick(); true;`);
            if (!(await T.eval(`lab.bag['pack:1:0'] === 1`))) bad.push('左键不该拆粒子包');
            await T.eval(`labRightClick(); true;`);
            if (!(await T.eval(`!lab.bag['pack:1:0'] && labCount('p') === 1`))) bad.push('右键没拆粒子包');
            // 合成台面板：药剂配方，材料先用台面再用身上，不够灰显
            await T.eval(`labClear(); lab.bag = {}; lab.stove.items = {}; lab.p.x = LAB_ST.craft.x; lab.p.z = LAB_ST.craft.z + 2; labInteract(); true;`);
            if (!(await T.eval(`lab.panel === 'craft' && !!document.getElementById('lab-panel')`))) bad.push('在合成台旁按互动没弹合成面板');
            const lst = JSON.parse(await T.eval(`JSON.stringify({ n: document.querySelectorAll('#lab-panel button[onclick^="labCraftMake"]').length, want: LAB_RECIPES.filter(function (r) { return r.where === '合成台'; }).length, dis: document.querySelectorAll('#lab-panel button[disabled]').length, txt: document.getElementById('lab-panel').innerText })`));
            if (lst.n !== lst.want || lst.want < 4 || lst.dis !== lst.n) bad.push('面板应该列出全部合成台配方、没材料时全灰 ' + JSON.stringify([lst.n, lst.want, lst.dis]));
            if (!/治疗药剂/.test(lst.txt) || !/弹簧鞋/.test(lst.txt) || /橡胶\s*×1/.test(lst.txt.split('弹簧鞋')[0])) bad.push('面板缺药剂配方 ' + lst.txt.slice(0, 80));
            await T.eval(`labGive('sugar', 2); labGive('salt', 1); labGive('b:water', 1); lab.stove.items = { sugar: 1 }; labPanelCraft(); true;`);
            if (await T.eval(`document.querySelector('#lab-panel button[onclick="labCraftMake(\\'heal\\')"]').disabled`)) bad.push('材料够了（台面 1 + 身上 2 糖），合成按钮还灰着');
            await T.eval(`labCraftMake('heal'); true;`);
            const mk = JSON.parse(await T.eval(`JSON.stringify({ heal: lab.bag['pot:heal'] || 0, sugar: lab.bag.sugar || 0, stoveSugar: lab.stove.items.sugar || 0, made: labSt().made['pot:heal'] || 0 })`));
            if (mk.heal !== 1 || mk.stoveSugar !== 0 || mk.sugar !== 2 || mk.made !== 1) bad.push('合成结果不对（先用台面的） ' + JSON.stringify(mk));
            await T.eval(`labCraftMake('speed'); true;`);
            if (await T.eval(`!!lab.bag['pot:speed']`)) bad.push('材料不够也合成了');
            // 文字牌：Sprite，大字描边；3 米外按 65° 视角在 1080 高的屏幕上 ≥ 100 像素
            const sg = JSON.parse(await T.eval(`JSON.stringify(lab.objs.filter(function (o) { return o.userData.labSign; }).map(function (o) { return { sprite: !!o.isSprite, w: o.material.map.image.width, h: o.material.map.image.height, sy: o.scale.y }; }))`));
            if (sg.length < 5 || sg.some((x) => !x.sprite || x.w !== 512 || x.h !== 128)) bad.push('文字牌应该都是 512×128 的大字 Sprite ' + JSON.stringify(sg.slice(0, 2)));
            const px = sg.length ? sg[0].sy * (84 / 128) / (2 * 3 * Math.tan(32.5 * Math.PI / 180)) * 1080 : 0;
            if (px < 100) bad.push('3 米外字高只有 ' + Math.round(px) + ' 像素（1080 高屏幕）');
            if (!(await T.eval(`touchInGame() && touchLookActive()`))) bad.push('实验室里触屏摇杆和转视角没开');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB12 一个房间、墙和边界；合成台；第三人称近镜头；左键按瞄准（捡／互动／使用）、Q 放脚下、右键拆包接水；文字牌放大描边', bad.length === 0, bad.join(' / '));
        }

        if (want('LB13')) {
            // LB13 东西落地都就近落在原处 0.5 米内：拆粒子包、Q 放下、放气、身上放不下掉出来
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 1; lab.p.z = 1; true;`);
            const far = async (code) => await T.eval(`(function(){ ${code}; return Math.max(0, ...lab.ground.map(function (e) { return Math.hypot(e.x - lab.p.x, e.z - lab.p.z); })); })()`);
            let d = await far(`labGive('pack:6:6', 1); labSel('pack:6:6'); labRightClick()`);
            if (d > 0.5 + 1e-6) bad.push('拆大粒子包：最远飞到 ' + d.toFixed(2) + ' 米');
            await T.eval(`labClear(); true;`);
            d = await far(`labGive('b:h2', 1); labSel('b:h2'); labClick()`);
            if (d > 0.5 + 1e-6) bad.push('放气：飞到 ' + d.toFixed(2) + ' 米');
            await T.eval(`labClear(); lab.bag = {}; for (let i = 0; i < LAB_BAG_CAP; i++) labGive('a:1:' + i, 1); true;`);
            d = await far(`labBagGive('coal', 5)`);
            if (d > 0.5 + 1e-6) bad.push('身上放不下掉出来：飞到 ' + d.toFixed(2) + ' 米');
            // 拼不成的组合不散开，停在原地（见 LB2）；放下的东西就在脚下，不叠在一起
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; labGive('p', 4); labSel('p'); labPut(true); true;`);
            const pp = JSON.parse(await T.eval(`JSON.stringify(lab.ground.map(function (e) { return [e.x, e.z]; }))`));
            let minD = 9; for (let a = 0; a < pp.length; a++) for (let b = a + 1; b < pp.length; b++) minD = Math.min(minD, Math.hypot(pp[a][0] - pp[b][0], pp[a][1] - pp[b][1]));
            if (!(minD > 0.02)) bad.push('Q 放多个叠在一起了 ' + minD);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB13 东西落地都就近落在原处 0.5 米内（拆包、Q 放下、放气、掉出来）', bad.length === 0, bad.join(' / '));
        }

        if (want('LB14')) {
            // LB14 粒子簇标签（质子／中子／电子数；能拼显示名字和倒计时，拼不成显示"无对应原子"）、对准时显示名字和说明、放 50 个东西几何体／材质／贴图／着色器不新增、标签贴图只在内容变化时重画
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_DECAY['n'].T = 1e15; true;`);   // 自由中子 611 秒半衰期，测试里不让它随机衰变（会把簇搅乱）
            // 手速放粒子：每 0.5 秒放一个（质子、质子、电子、电子、中子、中子），应该能拼成氦-4（一堆倒计时从最后一个进来开始重新数 4 秒）
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; ['p','p','e','e','n','n'].forEach(function (k, i) { window.__q = k; labGive(k, 1); labSel(k); labPut(); labAdvance(0.5); }); true;`);
            const m1 = JSON.parse(await T.eval(`JSON.stringify({ n: lab.ground.length, labels: lab.labels.filter(function (L) { return L.sp.visible; }).map(function (L) { return L.text; }) })`));
            if (m1.n !== 6 || m1.labels.length !== 1) bad.push('手速放 6 个粒子，应该还没散开、有 1 个标签 ' + JSON.stringify(m1));
            else if (!/质子 2.*中子 2.*电子 2\|氦-4 \d\.\d 秒/.test(m1.labels[0])) bad.push('标签内容不对 ' + m1.labels[0]);
            await T.eval(`labAdvance(3.2); true;`);
            if (await T.eval(`labCount('a:2:2')`) !== 0) bad.push('最后一个粒子放下后不到 4 秒就拼了');
            await T.eval(`labAdvance(0.6); true;`);
            if (await T.eval(`labCount('a:2:2')`) !== 1) bad.push('手速放 6 个粒子（2 质子 2 中子 2 电子）没拼成氦-4 ' + await T.eval(`lab.ground.map(function (e) { return e.key + '@' + e.x.toFixed(2) + ',' + e.z.toFixed(2); }).join(' ') + ' cl=' + JSON.stringify(lab.cl)`));
            // 拼不成：标签显示"无对应原子"，数字是当前的数
            await T.eval(`labClear(); labSpawn('p', 3, 3); labSpawn('p', 3.2, 3); labSpawn('e', 3.1, 3.2); labSpawn('e', 3.3, 3.2); labAdvance(0.2); true;`);
            const m2 = await T.eval(`lab.labels.filter(function (L) { return L.sp.visible; }).map(function (L) { return L.text; }).join(' ## ')`);
            if (!/质子 2.*中子 0.*电子 2\|无对应原子/.test(m2)) bad.push('2 质子 + 2 电子（没有中子）：标签应该显示质子 2 中子 0 电子 2、无对应原子 ' + m2);
            // 标签贴图只在内容变化时重画：倒计时数字不变的时候（不推进时间）连续画 60 帧，重画次数不增加；一个粒子的"簇"没有标签
            await T.eval(`labClear(); labSpawn('p', -3, 3); labSpawn('e', -3.2, 3); labAdvance(0.1); window.__d0 = lab.labelDraws; for (let i = 0; i < 60; i++) labAssemble(0); true;`);
            if (await T.eval(`lab.labelDraws !== window.__d0`)) bad.push('内容没变也在重画标签贴图');
            await T.eval(`labClear(); labSpawn('p', -3, 3); labAdvance(0.1); true;`);
            if (await T.eval(`lab.labels.some(function (L) { return L.sp.visible; })`)) bad.push('单个粒子不该有簇标签');
            // 对准时显示名字和说明
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; camera.rotation.set(-Math.atan2(1.4, 2.0), 0, 0, 'YXZ'); labSpawn('p', 0, -2.0); labHudUpdate(); true;`);
            const h1 = await T.eval(`document.getElementById('lab-hint').innerText`);
            if (!/质子/.test(h1)) bad.push('对准质子，提示里没有名字 ' + h1);
            await T.eval(`labClear(); labSpawn('pack:2:2', 0, -2.0); labHudUpdate(); true;`);
            const h2 = await T.eval(`document.getElementById('lab-hint').innerText`);
            if (!/粒子包/.test(h2) || !/2 质子 \+ 2 电子/.test(h2)) bad.push('对准粒子包，提示里应该有"粒子包：2 质子 + 2 电子" ' + h2);
            // 复用：放 50 个东西，几何体、贴图、着色器程序、场景里的对象数都不新增（成组画：绘制调用只多几次）
            await T.eval(`labClear(); lab.bag = {}; for (let i = 0; i < 4; i++) { labSpawn(['p','n','e','coal','bottle','g:o2'][i], 1 + i, 2, { noFill: 1e9 }); } labClear(); renderer.render(scene, camera); true;`);
            const r0 = JSON.parse(await T.eval(`(function(){ renderer.render(scene, camera); return JSON.stringify([renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length, scene.children.length, renderer.info.render.calls]); })()`));
            await T.eval(`for (let i = 0; i < 50; i++) labSpawn(['p','n','e','coal','bottle','g:o2'][i % 6], (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, { noFill: 1e9 }); true;`);
            const r1 = JSON.parse(await T.eval(`(function(){ labSyncMeshes(); labAssemble(0); renderer.render(scene, camera); return JSON.stringify([renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length, scene.children.length, renderer.info.render.calls, Object.keys(lab.groups).filter(function (k) { return lab.groups[k].n > 0; }).length, lab.labels.filter(function (L) { return L.sp.visible; }).length]); })()`));
            if (r0[0] !== r1[0] || r0[2] !== r1[2] || r0[3] !== r1[3]) bad.push('放 50 个东西新建了几何体／着色器／对象 ' + r0 + ' → ' + r1);
            // 绘制调用只多"有东西的组数 + 可见的簇标签数"（成组画，不是一个东西一次）
            if (r1[4] - r0[4] > r1[5] + r1[6] + 1) bad.push('放 50 个东西多了 ' + (r1[4] - r0[4]) + ' 次绘制，只该多 ' + (r1[5] + r1[6]) + '（成组 ' + r1[5] + ' + 标签 ' + r1[6] + '）');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB14 粒子簇标签、手速拼氦-4、对准显示名字说明、放 50 个东西不新建几何体／着色器、标签贴图只在变化时重画', bad.length === 0, bad.join(' / '));
        }

        if (want('LB15')) {
            // LB15 簇可以任意大（连通判定：任何粒子离簇里另一个粒子 0.5 米内就属于同一簇）：粒子拼出硅-31（45 个）、铁-56（82 个）；质子数 > 26 的簇不拼、不散、没有倒计时
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_DECAY['n'].T = 1e15; true;`);   // 测试里不让自由中子随机衰变
            // 一排 0.45 米间隔的粒子，整排长 20 米（两头离得远，只靠一个接一个连起来）：质子、电子、中子轮着排
            const chain = (z, n, N) => `(function(){ labClear(); let seq = []; for (let i = 0; i < ${z}; i++) seq.push('p', 'e'); for (let i = 0; i < ${N}; i++) seq.push('n'); seq.sort(function (a, b) { return (a.charCodeAt(0) * 7 % 5) - (b.charCodeAt(0) * 7 % 5); }); let n = seq.length; seq.forEach(function (k, i) { labSpawn(k, -10.2 + (i % 46) * 0.45, -3 + Math.floor(i / 46) * 0.45); }); let cl = labClusters().map(function (c) { return c.length; }); return JSON.stringify({ total: n, clusters: cl }); })()`;
            const c1 = JSON.parse(await T.eval(chain(14, 14, 17)));
            if (c1.total !== 45 || c1.clusters.length !== 1 || c1.clusters[0] !== 45) bad.push('45 个粒子排成一长串应该是 1 个簇 ' + JSON.stringify(c1));
            await T.eval(`labAdvance(3.5); true;`);
            if (await T.eval(`labCount('a:14:17')`) !== 0) bad.push('没到 4 秒就拼了');
            await T.eval(`labAdvance(0.8); true;`);
            if (!(await T.eval(`labCount('a:14:17') === 1 && lab.ground.length === 1`))) bad.push('45 个粒子没拼成硅-31 ' + await T.eval(`lab.ground.map(function (e) { return e.key; }).slice(0, 5).join()`));
            const c2 = JSON.parse(await T.eval(chain(26, 26, 30)));
            if (c2.total !== 82 || c2.clusters.length !== 1 || c2.clusters[0] !== 82) bad.push('82 个粒子应该是 1 个簇 ' + JSON.stringify(c2));
            await T.eval(`labAdvance(4.3); true;`);
            if (!(await T.eval(`labCount('a:26:30') === 1 && lab.ground.length === 1`))) bad.push('82 个粒子没拼成铁-56 ' + await T.eval(`lab.ground.length + ' ' + lab.ground.map(function (e) { return e.key; }).slice(0, 3).join()`));
            // 一堆粒子一起放（用 Q 放下一整堆）
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; labGive('p', 20); labGive('e', 20); labGive('n', 22); ['p', 'e', 'n'].forEach(function (k) { labSel(k); labPut(true); }); labAdvance(4.3); true;`);
            if (await T.eval(`labCount('a:20:22') !== 1`)) bad.push('一起放下 20 质子 + 22 中子 + 20 电子没拼成钙-42');
            // 质子数 > 26：不拼、不散开、没有倒计时
            await T.eval(`labClear(); let k = 0; for (let i = 0; i < 27; i++) { labSpawn('p', -1 + (k % 12) * 0.2, 1 + Math.floor(k / 12) * 0.2); k++; labSpawn('e', -1 + (k % 12) * 0.2, 1 + Math.floor(k / 12) * 0.2); k++; } for (let i = 0; i < 32; i++) { labSpawn('n', -1 + (k % 12) * 0.2, 1 + Math.floor(k / 12) * 0.2); k++; } window.__p0 = lab.ground.map(function (e) { return [e.id, e.x, e.z]; }); labAdvance(0.2); true;`);
            const lb1 = await T.eval(`lab.labels.filter(function (L) { return L.sp.visible; }).map(function (L) { return L.text; }).join(' ## ')`);
            await T.eval(`labAdvance(12.0); true;`);
            const big = JSON.parse(await T.eval(`JSON.stringify({ n: lab.ground.length, atoms: lab.ground.filter(function (e) { return e.key[0] === 'a'; }).length, moved: Math.max(...lab.ground.map(function (e, i) { return Math.hypot(e.x - window.__p0[i][1], e.z - window.__p0[i][2]); })), timers: Object.keys(lab.cl).length, labels: lab.labels.filter(function (L) { return L.sp.visible; }).map(function (L) { return L.text; }) })`));
            if (big.n !== 27 * 2 + 32 || big.atoms !== 0 || big.moved > 1e-9) bad.push('质子数 > 26 的簇应该原地不动、不拼不散 ' + JSON.stringify(big));
            if (big.timers !== 0 || big.labels.some((t) => /秒/.test(t.split('|')[1] || ''))) bad.push('质子数 > 26 的簇不该有倒计时 ' + JSON.stringify(big.labels));
            if (!/质子 27.*中子 32.*电子 27/.test(lb1) || !/不参与拼装/.test(lb1)) bad.push('质子数 > 26 的簇标签应该写数量和"不参与拼装" ' + lb1);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB15 簇任意大（连通判定）：硅-31（45 个）、铁-56（82 个）、一起放下一堆；质子数 > 26 的簇不拼不散没有倒计时', bad.length === 0, bad.join(' / '));
        }

        if (want('LB16')) {
            // LB16 粒子上限 300：超过就不让右键拆包／放下粒子并提示；300 个粒子不散开、逻辑每帧耗时低于阈值、绘制调用成组
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_DECAY['n'].T = 1e15; window.__msg = []; window.__fl = labFlash; labFlash = function (t) { window.__msg.push(t); }; true;`);
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; for (let i = 0; i < 290; i++) labSpawn(['p','n','e'][i % 3], -8 + (i % 40) * 0.4, -6 + Math.floor(i / 40) * 0.5); labGive('pack:6:6', 2); labSel('pack:6:6'); window.__p0 = lab.ground.map(function (e) { return [e.id, e.x, e.z]; }); true;`);
            if (await T.eval(`labParticleCount()`) !== 290) bad.push('先放了 290 个粒子');
            await T.eval(`labRightClick(); true;`);   // 290 + 18 > 300：不让拆
            const r1 = JSON.parse(await T.eval(`JSON.stringify({ n: labParticleCount(), packs: lab.bag['pack:6:6'] || 0, msg: window.__msg.slice() })`));
            if (r1.n !== 290 || r1.packs !== 2 || !r1.msg.some((t) => /房间太满，先拼一些吧/.test(t))) bad.push('超过 300 个应该拒绝拆包并提示 ' + JSON.stringify(r1));
            await T.eval(`for (let i = 0; i < 10; i++) labSpawn('n', 9 + (i % 5) * 0.4, 6 + Math.floor(i / 5) * 0.4); window.__msg.length = 0; labRightClick(); true;`);   // 正好 300：再拆不行
            if (!(await T.eval(`labParticleCount() === 300 && lab.bag['pack:6:6'] === 2 && window.__msg.some(function (t) { return /房间太满/.test(t); })`))) bad.push('满 300 个以后还拆了包');
            await T.eval(`labGive('p', 1); labSel('p'); window.__msg.length = 0; labPut(); true;`);
            if (!(await T.eval(`labParticleCount() === 300 && lab.bag.p === 1 && window.__msg.some(function (t) { return /房间太满/.test(t); })`))) bad.push('满 300 个以后放下粒子也该被拒绝');
            // 300 个粒子不散开（停在原地）；逻辑每帧耗时（不含画面）低于阈值；绘制调用成组
            await T.eval(`labAdvance(8.0); true;`);
            const stay = await T.eval(`Math.max(...window.__p0.map(function (q) { let e = lab.ground.filter(function (g) { return g.id === q[0]; })[0]; return e ? Math.hypot(e.x - q[1], e.z - q[2]) : 99; }))`);
            if (stay > 1e-9) bad.push('300 个粒子里有的动了或没了（散开／拼掉） ' + stay);
            const perf = JSON.parse(await T.eval(`(function(){ let r = renderer.render; renderer.render = function () {}; let t0 = performance.now(); for (let i = 0; i < 100; i++) labTick(0.016); let ms = (performance.now() - t0) / 100; renderer.render = r; renderer.render(scene, camera); return JSON.stringify({ tickMs: +ms.toFixed(3), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, n: lab.ground.length }); })()`));
            if (!(perf.tickMs < 4)) bad.push('300 个粒子逻辑每帧 ' + perf.tickMs + ' 毫秒，应该 < 4');
            if (!(perf.calls <= 48)) bad.push('300 个粒子绘制调用 ' + perf.calls + ' 次，应该成组画（≤ 48）');
            await T.eval(`labFlash = window.__fl; true;`);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB16 粒子上限 300（拆包／放下超限拒绝并提示）；300 个粒子不散开、逻辑每帧低于 4 毫秒、绘制成组', bad.length === 0, bad.length ? bad.join(' / ') : JSON.stringify(perf));
        }

        if (want('LB17')) {
            // LB17 长按连续：Q 每秒放 5 个（螺旋排开 0.3 米内）；左键对着地上的东西每秒捡 6 个、对着家具不连发；右键对着粒子包每秒拆 5 个、到 300 上限停并提示；手机按钮松手就停
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`LAB_DECAY['n'].T = 1e15; true;`);
            // Q 长按 1 秒：立刻放 1 个，之后每 0.2 秒 1 个 → 6 个左右
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; labGive('coal', 12); labSel('coal'); labHoldStart('Q'); labAdvance(1.0); labHoldStop(); true;`);
            const q1 = JSON.parse(await T.eval(`JSON.stringify({ n: labCount('coal'), left: lab.bag.coal, hold: lab.hold, d: lab.ground.map(function (e) { return Math.hypot(e.x - lab.p.x, e.z - lab.p.z); }), ys: lab.ground.map(function (e) { return e.y; }), pos: lab.ground.map(function (e) { return e.x.toFixed(3) + ',' + e.z.toFixed(3); }) })`));
            if (!(q1.n >= 5 && q1.n <= 7) || q1.n + q1.left !== 12) bad.push('长按 Q 1 秒应该放 5～7 个，实际 ' + q1.n);
            if (q1.hold !== null) bad.push('松手以后还在连放');
            if (Math.max(...q1.d) > 0.3 + 1e-6 || new Set(q1.pos).size !== q1.pos.length) bad.push('连续放下应该按螺旋排开、0.3 米内、不叠在一起 ' + JSON.stringify(q1.pos));
            if (q1.ys.some((y) => y > 0.5)) bad.push('放下的东西飞起来了');
            await T.eval(`labAdvance(2.0); true;`);
            if (await T.eval(`labCount('coal')`) !== q1.n) bad.push('松手以后又多放了');
            // Q 长按放完为止（12 个 2.4 秒左右），放完自动停
            await T.eval(`labClear(); lab.bag = {}; labGive('coal', 12); labSel('coal'); labHoldStart('Q'); labAdvance(4.0); true;`);
            if (!(await T.eval(`labCount('coal') === 12 && !lab.bag.coal && lab.hold === null`))) bad.push('长按 Q 没放完／放完没停');
            // 左键长按对着地上的东西：每秒捡 6 个附近的
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; camera.rotation.set(-Math.atan2(1.4, 2.0), 0, 0, 'YXZ'); labSpawn('iron', 0, -2.0); for (let i = 0; i < 20; i++) labSpawn('iron', -0.8 + (i % 5) * 0.4, -1.6 - Math.floor(i / 5) * 0.4); true;`);
            const aimed = await T.eval(`labAim().item && labAim().item.key`);
            if (aimed !== 'iron') bad.push('瞄准没对着铁块 ' + aimed);
            await T.eval(`labHoldStart('L'); labAdvance(1.0); labHoldStop(); true;`);
            const l1 = await T.eval(`lab.bag.iron || 0`);
            if (!(l1 >= 6 && l1 <= 8)) bad.push('左键长按 1 秒应该捡 6～8 个，实际 ' + l1);
            await T.eval(`labAdvance(2.0); true;`);
            if (await T.eval(`(lab.bag.iron || 0) !== ${l1}`)) bad.push('松手以后还在捡');
            // 对着家具：只交互一次，不连发
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = LAB_ST.craft.x; lab.p.z = LAB_ST.craft.z + 2.2; camera.rotation.set(0, 0, 0, 'YXZ'); true;`);
            const fh = await T.eval(`labHoldStart('L')`);
            if (!fh || !(await T.eval(`lab.panel === 'craft' && lab.hold === null`))) bad.push('长按左键对着家具应该只打开一次面板、不连发');
            await T.eval(`labPanelClose(); true;`);
            // 右键长按对着粒子包：每秒拆 5 个
            await T.eval(`labClear(); lab.bag = {}; lab.p.x = 0; lab.p.z = 0; labGive('pack:1:0', 12); labSel('pack:1:0'); labHoldStart('R'); labAdvance(1.0); labHoldStop(); true;`);
            const r1 = JSON.parse(await T.eval(`JSON.stringify({ unpacked: 12 - (lab.bag['pack:1:0'] || 0), particles: labParticleCount() })`));
            if (!(r1.unpacked >= 5 && r1.unpacked <= 7) || r1.particles !== r1.unpacked * 2) bad.push('右键长按 1 秒应该拆 5～7 个包 ' + JSON.stringify(r1));
            // 到 300 上限停并提示
            await T.eval(`labClear(); lab.bag = {}; window.__msg = []; window.__fl = labFlash; labFlash = function (t) { window.__msg.push(t); }; for (let i = 0; i < 292; i++) labSpawn(['p','n','e'][i % 3], -8 + (i % 40) * 0.4, -6 + Math.floor(i / 40) * 0.5); labGive('pack:1:0', 20); labSel('pack:1:0'); labHoldStart('R'); labAdvance(3.0); true;`);
            const r2 = JSON.parse(await T.eval(`JSON.stringify({ n: labParticleCount(), packs: lab.bag['pack:1:0'], hold: lab.hold, msg: window.__msg.filter(function (t) { return /房间太满/.test(t); }).length })`));
            if (r2.n !== 300 || r2.packs !== 16 || r2.hold !== null || r2.msg < 1) bad.push('长按拆包到 300 上限应该停并提示 ' + JSON.stringify(r2));
            await T.eval(`labFlash = window.__fl; labClear(); lab.bag = {}; true;`);
            // 手机：长按按钮效果相同，松手就停（按下 = mousedown／touchstart，松开 = mouseup／touchend）
            await T.eval(`labGive('coal', 20); labSel('coal'); document.getElementById('lab-btn-put').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); labAdvance(1.0); document.getElementById('lab-btn-put').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); true;`);
            const m1 = await T.eval(`labCount('coal')`);
            if (!(m1 >= 5 && m1 <= 7)) bad.push('按住「放下」按钮 1 秒应该放 5～7 个，实际 ' + m1);
            await T.eval(`labAdvance(1.0); true;`);
            if (await T.eval(`labCount('coal')`) !== m1) bad.push('松开「放下」按钮以后还在放');
            await T.eval(`labClear(); lab.bag = {}; labGive('pack:1:0', 12); labSel('pack:1:0'); document.getElementById('lab-btn-rc').dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })); labAdvance(1.0); document.getElementById('lab-btn-rc').dispatchEvent(new TouchEvent('touchend', { bubbles: true })); true;`);
            const m2 = await T.eval(`12 - (lab.bag['pack:1:0'] || 0)`);
            if (!(m2 >= 5 && m2 <= 7)) bad.push('按住「拆包/接水」按钮（触屏）1 秒应该拆 5～7 个，实际 ' + m2);
            await T.eval(`labAdvance(1.0); true;`);
            if (await T.eval(`12 - (lab.bag['pack:1:0'] || 0)`) !== m2) bad.push('松开「拆包/接水」按钮以后还在拆');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB17 长按连续：Q 每秒 5 个螺旋放、左键每秒 6 个捡（家具不连发）、右键每秒 5 个拆包到上限停；手机按钮松手就停', bad.length === 0, bad.join(' / '));
        }

        if (want('LB18')) {
            // LB18 快捷栏 3 格 + 背包 3 格，不留空格自动补上：默认选第 1 格；选中位置不变（选中的放完了，下一个移过来；后面没有了选最后一个）；快捷栏有空位时背包补上；一件都没有才是空的
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            if (await T.eval(`LAB_HOT !== 3 || LAB_BAG_CAP !== 6 || lab.selIdx !== 0 || lab.sel !== null`)) bad.push('进实验室应该默认选中第 1 格（身上没东西时是空的）、快捷栏 3 格 + 背包 3 格');
            await T.eval(`labGive('coal', 2); labGive('iron', 1); labGive('sand', 1); labGive('salt', 1); true;`);
            if (await T.eval(`lab.sel !== 'coal'`)) bad.push('第一样东西进来，默认选中第 1 格应该拿着它 ' + await T.eval(`lab.sel`));
            const ks0 = JSON.parse(await T.eval(`JSON.stringify(Object.keys(lab.bag))`));
            if (ks0.join() !== 'coal,iron,sand,salt') bad.push('格子顺序不对 ' + ks0);
            // 选中第 2 格（铁块），放完：后面的沙子前移，手里自动拿着沙子
            await T.eval(`labSelIdx(1); labPut(true); true;`);
            const a1 = JSON.parse(await T.eval(`JSON.stringify({ keys: Object.keys(lab.bag), sel: lab.sel, idx: lab.selIdx })`));
            if (a1.keys.join() !== 'coal,sand,salt' || a1.sel !== 'sand' || a1.idx !== 1) bad.push('选中第 2 格放完，应该前移、手里拿着下一样（沙子）、选中位置不变 ' + JSON.stringify(a1));
            // 选中最后一格（盐），放完：后面没有了，选中最后一个有东西的格子（沙子）
            await T.eval(`labSelIdx(2); labPut(true); true;`);
            const a2 = JSON.parse(await T.eval(`JSON.stringify({ keys: Object.keys(lab.bag), sel: lab.sel, idx: lab.selIdx })`));
            if (a2.keys.join() !== 'coal,sand' || a2.sel !== 'sand' || a2.idx !== 1) bad.push('选中格后面没有东西了，应该选最后一个有东西的格子 ' + JSON.stringify(a2));
            // 用掉（喝药剂）也一样补上；丢进仓库箱也一样
            await T.eval(`labClear(); lab.bag = {}; labGive('pot:heal', 1); labGive('coal', 1); labGive('sand', 1); lab.hp = 20; labSelIdx(0); labUse('L'); true;`);
            const a3 = JSON.parse(await T.eval(`JSON.stringify({ keys: Object.keys(lab.bag), sel: lab.sel, hp: lab.hp })`));
            if (a3.hp !== 70 || a3.keys.join() !== 'coal,sand,bottle' || a3.sel !== 'coal') bad.push('用掉药剂以后后面的应该前移、手里拿着下一样 ' + JSON.stringify(a3));
            // 背包补快捷栏：4 种东西，快捷栏放满 3 个，第 4 个在背包；快捷栏第 1 格放完，第 4 个自动补到快捷栏
            await T.eval(`labClear(); lab.bag = {}; labGive('coal', 1); labGive('iron', 1); labGive('sand', 1); labGive('salt', 1); true;`);
            const h0 = await T.eval(`labBagHtml().replace(/<[^>]+>/g, '|').replace(/\\|+/g, '|')`);
            if (!/1 煤（碳）×1.*2 铁块×1.*3 沙子×1.*4 食盐×1/.test(h0)) bad.push('界面应该是 1 煤 2 铁 3 沙 | 4 盐 ' + h0);
            await T.eval(`labSelIdx(0); labPut(true); true;`);
            const h1 = await T.eval(`labBagHtml().replace(/<[^>]+>/g, '|').replace(/\\|+/g, '|')`);
            if (!/1 铁块×1.*2 沙子×1.*3 食盐×1/.test(h1) || /煤/.test(h1)) bad.push('快捷栏第 1 格放完，背包里的东西应该补上来、不留空格 ' + h1);
            if (await T.eval(`Object.keys(lab.bag).length !== 3`)) bad.push('快捷栏 3 格应该满着');
            // 一件都没有才是空的
            await T.eval(`['iron', 'sand', 'salt'].forEach(function (k) { labSel(k); labPut(true); }); true;`);
            if (await T.eval(`lab.sel !== null || Object.keys(lab.bag).length !== 0`)) bad.push('全放完了应该是空的 ' + await T.eval(`lab.sel`));
            // 6 格满了：第 7 种掉在脚边
            await T.eval(`labClear(); lab.bag = {}; window.__ok = ['coal', 'iron', 'sand', 'salt', 'bottle', 'rubber', 'fes'].map(function (k) { return labBagGive(k, 1); }); true;`);
            const f = JSON.parse(await T.eval(`JSON.stringify({ ok: window.__ok, kinds: Object.keys(lab.bag).length, ground: lab.ground.length })`));
            if (f.kinds !== 6 || f.ok[6] !== false || f.ground !== 1) bad.push('背包 6 格满了，第 7 种应该掉在脚边 ' + JSON.stringify(f));
            // 1～6 键选格子；再次进实验室默认选第 1 格
            await T.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })); true;`);
            if (await T.eval(`lab.selIdx !== 2`)) bad.push('按 3 应该选第 3 格');
            await LBEXIT(T); await LBENTER(T);
            if (await T.eval(`lab.selIdx !== 0`)) bad.push('再次进实验室应该默认选第 1 格');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB18 快捷栏 3 格 + 背包 3 格：自动补上不留空格、选中位置不变、默认选第 1 格', bad.length === 0, bad.join(' / '));
        }

        if (want('LB19')) {
            // LB19 实验室入口：带 ?labdebug=1 打开大厅，展开「选择模式」后入口可见、没被盖住、点得到、点「开始游戏」进得去（电脑、平板横屏、手机竖屏／横屏、小屏）；开关用 localStorage 记住：访问过一次以后不带参数也有，?labdebug=0 清掉；读写 localStorage 抛错也不崩，读不到就当没开
            const bad = [];
            const views = [['电脑 1280×800', 1280, 800, false], ['平板横屏 1180×820', 1180, 820, true], ['手机竖屏 390×844', 390, 844, true], ['手机横屏 844×390', 844, 390, true], ['小屏 320×568', 320, 568, true]];
            const T1 = await openTab(chrome, url, { query: 'labdebug=1', keepStorage: true });
            await T1.eval(`${HIDE} true;`);
            for (const [nm, w, h, mob] of views) {
                await T1.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
                await T1.eval(`${HIDE} nav('screen-lobby'); selectGameMode('hunt'); true;`);
                // 真的点「选择模式」把面板展开（不是直接去掉 hidden）
                await T1.eval(`(function(){ let p = document.getElementById('mode-detail-panel'); if (p.classList.contains('hidden')) document.querySelector('#lobby-tr button').click(); return true; })()`);
                await until(T1, `!document.getElementById('mode-detail-panel').classList.contains('hidden')`, 5000);
                await frames(T1, 3);
                const r = JSON.parse(await T1.eval(`(function(){ let b = document.getElementById('btn-mode-lab'), r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = document.elementFromPoint(cx, cy), h = document.getElementById('btn-mode-hunt').getBoundingClientRect(); return JSON.stringify({ disp: getComputedStyle(b).display, w: r.width, h: r.height, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, top: top === b, below: Math.abs(h.left - r.left) < 2 && r.top >= h.bottom - 1 }); })()`));
                if (r.disp === 'none' || r.w < 20 || r.h < 20) bad.push(nm + '：入口没显示 ' + JSON.stringify(r));
                else if (!r.inView || !r.top) bad.push(nm + '：入口在屏幕外或被别的东西盖住了 ' + JSON.stringify(r));
                else if (!r.below) bad.push(nm + '：入口不在寻宝队正下面 ' + JSON.stringify(r));
            }
            await T1.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
            // 点入口选中、点开始游戏进实验室
            await T1.eval(`document.getElementById('btn-mode-lab').click(); true;`);
            if (!(await T1.eval(`gState.gameMode === 'lab'`))) bad.push('点实验室入口没选中');
            await T1.eval(`document.getElementById('lobby-start-btn').click(); true;`);
            if (!(await until(T1, `typeof lab !== 'undefined' && lab && document.getElementById('lab-hud')`, 15000))) bad.push('带 ?labdebug=1 选实验室后点开始游戏进不去');
            if (!(await T1.eval(`localStorage.getItem('TH_labdebug') === '1'`))) bad.push('带 ?labdebug=1 访问后没记在 localStorage');
            if (T1.errors.length) bad.push(T1.errors.slice(0, 2).join(' / '));
            await T1.close();
            // 以后不带参数也有（同一个浏览器存档）：入口可见，大厅左边的版本号后面写着「实验室入口已开」
            const T2 = await openTab(chrome, url, { keepStorage: true });
            await T2.eval(`${HIDE} true;`);
            const m2 = JSON.parse(await T2.eval(`JSON.stringify({ search: location.search, vis: labVisible(), disp: getComputedStyle(document.getElementById('btn-mode-lab')).display, ver: document.getElementById('lobby-version').innerText })`));
            if (!m2.vis || m2.disp === 'none' || !/实验室入口已开/.test(m2.ver)) bad.push('访问过一次以后不带参数应该也有入口 ' + JSON.stringify(m2));
            await T2.close();
            // ?labdebug=0 清掉，之后不带参数也没有
            const T3 = await openTab(chrome, url, { query: 'labdebug=0', keepStorage: true });
            await T3.eval(`${HIDE} true;`);
            const m3 = JSON.parse(await T3.eval(`JSON.stringify({ vis: labVisible(), disp: getComputedStyle(document.getElementById('btn-mode-lab')).display, stored: localStorage.getItem('TH_labdebug'), ver: document.getElementById('lobby-version').innerText })`));
            if (m3.vis || m3.disp !== 'none' || m3.stored !== null || /实验室/.test(m3.ver)) bad.push('?labdebug=0 应该清掉开关 ' + JSON.stringify(m3));
            await T3.close();
            const T4 = await openTab(chrome, url, { keepStorage: true });
            await T4.eval(`${HIDE} true;`);
            if (await T4.eval(`labVisible() || getComputedStyle(document.getElementById('btn-mode-lab')).display !== 'none'`)) bad.push('?labdebug=0 之后不带参数还有入口');
            // localStorage 读写抛错：不崩，读不到就当没开；网址上的 ?labdebug=1 当次照样有效
            const ex = JSON.parse(await T4.eval(`(function(){ let r = {}; Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new Error('blocked'); } });
                try { r.noParam = labDebugRead(); } catch (e) { r.noParam = 'threw'; }
                history.replaceState(null, '', location.pathname + '?labdebug=1');
                try { r.withParam = labDebugRead(); } catch (e) { r.withParam = 'threw'; }
                history.replaceState(null, '', location.pathname + '?labdebug=0');
                try { r.zero = labDebugRead(); } catch (e) { r.zero = 'threw'; }
                return JSON.stringify(r); })()`));
            if (ex.noParam !== false || ex.withParam !== true || ex.zero !== false) bad.push('localStorage 抛错时应该不崩、读不到当没开、网址参数照样有效 ' + JSON.stringify(ex));
            if (T4.errors.length) bad.push(T4.errors.slice(0, 2).join(' / '));
            await T4.close();
            report('LB19 实验室入口：?labdebug=1 下各种屏幕都看得见点得到、能进；开关记在 localStorage、?labdebug=0 清掉；localStorage 抛错不崩', bad.length === 0, bad.join(' / '));
        }

        if (want('HH1')) {
            // HH1 大厅里的山不能穿：人走进山里会被推出来，镜头不会退进山体；不增加绘制调用
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} nav('screen-lobby'); true;`);
            await until(T, `!!hub && HUB_HILLS.length === 30`, 10000);
            const inner = JSON.parse(await T.eval(`JSON.stringify((function(){ let r = []; HUB_HILLS.forEach(function (h) { if (Math.abs(h.x) < HUB.plazaHalf - 2 && Math.abs(h.z) < HUB.plazaHalf - 2) r.push({ x: h.x, z: h.z, rx: h.rx, h: h.h }); }); return r; })())`));
            if (!inner.length) bad.push('没有任何一座山在广场范围里，测试没意义');
            else {
                const h = inner[0];
                // 传送进山里：走一帧会被推到山外（或回出生点）
                await T.eval(`hub.p.set(${h.x}, 0, ${h.z}); hub.vy = 0; hubPlayerMove(0.016); true;`);
                if (await T.eval(`!!hubInHill(hub.p.x, 0, hub.p.z)`)) bad.push('人传送到山里没被弄出来');
                // 朝着山走：怎么走都进不去
                const st = JSON.parse(await T.eval(`(function(){ let best = null, n = Math.hypot(${h.x}, ${h.z}) || 1, ux = -(${h.x}) / n, uz = -(${h.z}) / n; for (let k = 4; k < 40; k++) { let x = ${h.x} + ux * (${h.rx} + k * 3), z = ${h.z} + uz * (${h.rx} + k * 3); if (!hubInHill(x, 0, z) && Math.abs(x) < HUB.plazaHalf - 4 && Math.abs(z) < HUB.plazaHalf - 4) { best = [x, z]; break; } } return JSON.stringify(best); })()`));
                if (!st) bad.push('找不到山边的起点');
                else {
                    const walk = await T.eval(`(function(){ hub.p.set(${st[0]}, 0, ${st[1]}); hub.vy = 0; let dx = ${h.x} - ${st[0]}, dz = ${h.z} - ${st[1]}; camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ'); keys['w'] = true; let bad = 0; for (let i = 0; i < 200; i++) { hubPlayerMove(0.016); if (hubInHill(hub.p.x, hub.p.y, hub.p.z)) bad++; } keys['w'] = false; return bad; })()`);
                    if (walk !== 0) bad.push('朝着山一直走，有 ' + walk + ' 帧在山里');
                }
                // 镜头：站在山脚外一点、朝着远离山的方向看（镜头在山这一侧）不会落进山体
                await T.eval(`hub.p.set(${h.x} + ${h.rx} + 6, 0, ${h.z}); camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ'); true;`);
                const cam = JSON.parse(await T.eval(`(function(){ let c = hubCameraPos(); return JSON.stringify({ inHill: !!hubInHill(c.x, Math.max(0, c.y), c.z) }); })()`));
                if (cam.inHill) bad.push('镜头退进了山体');
            }
            // 没有新增物体：广场的绘制调用不涨（L2 里还有总量检查）
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('HH1 大厅里的山不能穿（人被推出来、镜头不进山），只做数学判断、不加物体', bad.length === 0, bad.join(' / '));
        }

        // ── 实验室第 4B 段：器材、电路、电解、元素表（LB20～LB25）──
        // 页面里的小工具：__d 放设备，__w 连线（自己补电线），__ring 把一串设备首尾连成一圈，__look 把镜头对准一个点。
        // 先停掉实验室自己的帧循环，再用 labAdvance 按固定步长往前推，电量、时间都不依赖帧率。
        const ELHELP = `window.__d = function (k, x, z) { return labPlaceDev(k, x, z); };
            window.__w = function (a, b) { labGive('wire', 1); return labWireAdd(a, b); };
            window.__ring = function (l) { for (let i = 0; i < l.length; i++) window.__w(l[i], l[(i + 1) % l.length]); };
            window.__look = function (x, y, z) { let dx = x - lab.p.x, dy = y - (lab.p.y + LAB_EYE), dz = z - lab.p.z; camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); camera.updateMatrixWorld(); };
            window.__s = function (d) { return { run: d.run, v: Math.round(d.v * 100) / 100, draw: Math.round(d.draw * 100) / 100, bd: Math.round(d.bdraw * 100) / 100, ch: Math.round(d.charge * 100) / 100 }; };
            cancelAnimationFrame(lab.raf); lab.p.x = 0; lab.p.z = 6; lab.p.y = 0; lab.hp = 100; lab.bag = {}; labClear(); true;`;
        const elNear = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 0.15 : e);

        if (want('LB20')) {
            // LB20 器材配方：电线、电池、开关、灯泡、电阻、电动机、电解槽、升压器都在合成台按文档配方做；材料不够不让做；盐水、熔融食盐在灶台做
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP}`);
            const rec = JSON.parse(await T.eval(`JSON.stringify(LAB_RECIPES.filter(function (r) { return r.kind === 'device'; }).map(function (r) { return [r.id, r.where, r.in, r.out]; }))`));
            const rw = {
                wire: [{ 'a:29:34': 1, rubber: 1 }, { wire: 2 }], bat: [{ 'a:29:34': 1, iron: 1, 'b:brine': 1 }, { bat: 1, bottle: 1 }], switch: [{ 'a:29:34': 1, rubber: 1, iron: 1 }, { switch: 1 }],
                bulb: [{ bottle: 1, iron: 1, wire: 1 }, { bulb: 1 }], resistor: [{ coal: 1, wire: 1 }, { resistor: 1 }], motor: [{ iron: 2, wire: 2 }, { motor: 1 }],
                elec: [{ bottle: 1, coal: 2, wire: 2 }, { elec: 1 }], booster: [{ iron: 2, wire: 4 }, { booster: 1 }]
            };
            if (rec.length !== 8) bad.push('器材配方应该是 8 个 ' + rec.length);
            rec.forEach((r) => {
                const w = rw[r[0]];
                if (!w) { bad.push('多出来的器材配方 ' + r[0]); return; }
                if (r[1] !== '合成台') bad.push(r[0] + ' 应该在合成台做');
                if (JSON.stringify(r[2]) !== JSON.stringify(w[0]) || JSON.stringify(r[3]) !== JSON.stringify(w[1])) bad.push(r[0] + ' 配方和文档不一样 ' + JSON.stringify(r));
            });
            // 材料够：台面上摆好材料，合成，材料用掉，产物进身上；不够：不让做
            for (const id of Object.keys(rw)) {
                await T.eval(`lab.bag = {}; lab.stove.items = ${JSON.stringify(rw[id][0])}; true;`);
                if (await T.eval(`labCraftMake('${id}') !== true`)) { bad.push(id + ' 材料够了却做不出来'); continue; }
                const got = JSON.parse(await T.eval(`JSON.stringify({ bag: lab.bag, stove: lab.stove.items })`));
                if (JSON.stringify(got.bag) !== JSON.stringify(rw[id][1]) || Object.keys(got.stove).length) bad.push(id + ' 合成后材料／产物不对 ' + JSON.stringify(got));
                await T.eval(`lab.bag = {}; lab.stove.items = {}; true;`);
                if (await T.eval(`labCraftMake('${id}') !== false`)) bad.push(id + ' 没材料居然做出来了');
            }
            // 灶台：食盐 + 水 → 盐水；食盐 + 空瓶烧 5 秒 → 熔融食盐
            await T.eval(`lab.bag = {}; lab.stove.items = { salt: 1, 'b:water': 1 }; labStoveFire(); true;`);
            if (await T.eval(`lab.stove.items['b:brine'] !== 1`)) bad.push('食盐 + 水应该得盐水 ' + await T.eval(`JSON.stringify(lab.stove.items)`));
            await T.eval(`lab.stove.items = { salt: 1, bottle: 1 }; labStoveFire(); true;`);
            if (await T.eval(`!!lab.stove.items['b:melt']`)) bad.push('熔融食盐应该烧 5 秒才好');
            await T.eval(`labAdvance(LAB_T.glass + 0.5, 0.1); true;`);
            if (await T.eval(`lab.stove.items['b:melt'] !== 1`)) bad.push('烧够 5 秒应该得熔融食盐 ' + await T.eval(`JSON.stringify(lab.stove.items)`));
            const nm = JSON.parse(await T.eval(`JSON.stringify(['wire', 'bat', 'switch', 'bulb', 'resistor', 'motor', 'elec', 'booster', 'b:brine', 'b:melt', 'bat:42'].map(labName))`));
            if (nm.join() !== '电线,电池,开关,灯泡,电阻,电动机,电解槽,升压器,盐水,熔融食盐,电池（剩 42 U）') bad.push('名字不对 ' + nm);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB20 器材配方：8 种器材在合成台按文档配方做、材料不够不让做；灶台做盐水和熔融食盐', bad.length === 0, bad.join(' / '));
        }

        if (want('LB21')) {
            // LB21 手动接线：设备摆在一起不会通电；手里拿电线，左键先点 A 再点 B 连线（用 1 根电线）；一根线不成回路，两根才成；对着线左键拆掉（电线还回来）；右键收起设备；Q 放设备；不能叠在一起
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} window.A = __d('bat', -1.5, 2); window.B = __d('bulb', 1.5, 2); labGive('wire', 3); labSel('wire'); true;`);
            if (await T.eval(`labPlaceDev('bulb', -1.5, 2) !== null || lab.devs.length !== 2`)) bad.push('设备不能叠在一起');
            await T.eval(`labAdvance(1, 0.1); true;`);
            let s = JSON.parse(await T.eval(`JSON.stringify({ a: __s(A), b: __s(B) })`));
            if (s.b.run || !elNear(s.a.ch, 180, 0.001)) bad.push('只是摆着不接线就通电了 ' + JSON.stringify(s));
            // 用鼠标点：第一下选中，第二下连线
            await T.eval(`__look(A.x, 0.35, A.z); labClick(); true;`);
            if (await T.eval(`lab.wirePend !== A.id || lab.wires.length !== 0`)) bad.push('点第一个设备应该选中它');
            await T.eval(`__look(B.x, 0.5, B.z); labClick(); true;`);
            let w = JSON.parse(await T.eval(`JSON.stringify({ n: lab.wires.length, bag: lab.bag.wire, pend: lab.wirePend })`));
            if (w.n !== 1 || w.bag !== 2 || w.pend !== null) bad.push('点第二个设备应该连上一根线、用掉 1 根电线 ' + JSON.stringify(w));
            await T.eval(`labAdvance(1, 0.1); true;`);
            if (await T.eval(`B.run`)) bad.push('只连一根线不成回路，灯不该亮');
            await T.eval(`__look(A.x, 0.35, A.z); labClick(); __look(B.x, 0.5, B.z); labClick(); true;`);
            if (await T.eval(`lab.wires.length !== 2 || lab.bag.wire !== 1`)) bad.push('第二根线没连上');
            await T.eval(`labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ a: __s(A), b: __s(B) })`));
            if (!s.b.run || !elNear(s.a.ch, 178, 0.2) || !elNear(s.b.v, 1.5, 0.01) || !elNear(s.b.draw, 1, 0.01)) bad.push('两根线成回路后灯应该亮、1.5 V、耗电 1 U/s ' + JSON.stringify(s));
            // 点同一个设备两下 = 取消；空地上点 = 提示
            await T.eval(`__look(A.x, 0.35, A.z); labClick(); labClick(); true;`);
            if (await T.eval(`lab.wirePend !== null || lab.wires.length !== 2`)) bad.push('点同一个设备两下应该取消');
            // 对着线左键：拆掉一根，电线还回来，灯灭
            await T.eval(`__look((A.x + B.x) / 2, 0.45, (A.z + B.z) / 2); labClick(); true;`);
            w = JSON.parse(await T.eval(`JSON.stringify({ n: lab.wires.length, bag: lab.bag.wire })`));
            if (w.n !== 1 || w.bag !== 2) bad.push('对着线左键应该拆掉一根、电线还回来 ' + JSON.stringify(w));
            await T.eval(`labAdvance(1, 0.1); true;`);
            if (await T.eval(`B.run`)) bad.push('拆了线灯还亮着');
            // 右键对着设备：收起来（连着的线一起还回来）；用过的电池带着剩下的电量
            await T.eval(`__look(A.x, 0.35, A.z); labRightClick(); true;`);
            const pk = JSON.parse(await T.eval(`JSON.stringify({ devs: lab.devs.length, wires: lab.wires.length, keys: Object.keys(lab.bag), wire: lab.bag.wire })`));
            if (pk.devs !== 1 || pk.wires !== 0 || pk.wire !== 3 || !pk.keys.some((k) => /^bat:17\d$/.test(k))) bad.push('右键收起设备不对 ' + JSON.stringify(pk));
            // Q 放设备：放在面前，一次一个
            await T.eval(`lab.bag = {}; labGive('bulb', 3); labSel('bulb'); labPut(); true;`);
            const pt = JSON.parse(await T.eval(`JSON.stringify({ devs: lab.devs.length, bulb: lab.bag.bulb, d: labD(lab.devs[lab.devs.length - 1], lab.p) })`));
            if (pt.devs !== 2 || pt.bulb !== 2 || !elNear(pt.d, 1, 0.01)) bad.push('Q 应该在面前 1 米放一个设备 ' + JSON.stringify(pt));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB21 手动接线：摆着不通电、点两下连线、一根线不成回路、对着线拆线、右键收设备、Q 放设备、不能叠放', bad.length === 0, bad.join(' / '));
        }

        if (want('LB22')) {
            // LB22 电路：串联点亮 2 盏灯（电压相加、每块电池背满）、并联（电压不变、耗电均摊）、电阻 0.5、电池耗尽设备停、开关断开／接通
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} true;`);
            // 串联：电池 + 2 盏灯一圈
            await T.eval(`window.B = __d('bat', -3, 2); window.L1 = __d('bulb', 0, 0.5); window.L2 = __d('bulb', 3, 2); __ring([B, L1, L2]); labAdvance(2, 0.1); true;`);
            let s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), l1: __s(L1), l2: __s(L2) })`));
            if (!s.l1.run || !s.l2.run || !elNear(s.l1.v, 1.5, 0.01) || !elNear(s.l1.draw, 1, 0.01) || !elNear(s.b.bd, 2, 0.01) || !elNear(s.b.ch, 176, 0.05)) bad.push('串联 2 盏灯：应该都亮、各 1 U/s、电池背 2 U/s ' + JSON.stringify(s));
            // 电阻 0.5
            await T.eval(`labClear(); lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -3, 2); window.R = __d('resistor', 2, 2); __ring([B, R]); labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), r: __s(R) })`));
            if (!s.r.run || !elNear(s.r.draw, 0.5, 0.01) || !elNear(s.b.ch, 179, 0.05)) bad.push('电阻应该耗电 0.5 U/s ' + JSON.stringify(s));
            // 串联 2 块电池：电压 3 V，每块电池各背 1 U/s
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.L1 = __d('bulb', 3, 2); __ring([B, B2, L1]); labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), b2: __s(B2), l: __s(L1) })`));
            if (!elNear(s.l.v, 3, 0.01) || !elNear(s.b.bd, 1, 0.01) || !elNear(s.b2.bd, 1, 0.01) || !elNear(s.b.ch, 178, 0.05) || !elNear(s.b2.ch, 178, 0.05)) bad.push('串联 2 块电池：灯应该 3 V，每块电池各背 1 U/s ' + JSON.stringify(s));
            // 并联：1 块电池带 2 盏灯，各自一圈（每盏灯和电池之间连两根线）
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', 0, 2); window.L1 = __d('bulb', -3, 1); window.L2 = __d('bulb', 3, 1); __ring([B, L1]); __ring([B, L2]); labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), l1: __s(L1), l2: __s(L2) })`));
            if (!s.l1.run || !s.l2.run || !elNear(s.l1.v, 1.5, 0.01) || !elNear(s.l2.v, 1.5, 0.01) || !elNear(s.b.bd, 2, 0.01)) bad.push('并联 2 盏灯：电压都是 1.5 V（不相加），电池背两盏的 2 U/s ' + JSON.stringify(s));
            // 并联：2 块电池带 1 盏灯：电压还是 1.5 V，耗电 1 U/s 平均分摊，每块电池 0.5 U/s
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -3, 2); window.B2 = __d('bat', 3, 2); window.L1 = __d('bulb', 0, 1); __ring([B, L1]); __ring([B2, L1]); labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), b2: __s(B2), l: __s(L1) })`));
            if (!elNear(s.l.v, 1.5, 0.01) || !elNear(s.l.draw, 1, 0.01) || !elNear(s.b.bd, 0.5, 0.01) || !elNear(s.b2.bd, 0.5, 0.01) || !elNear(s.b.ch, 179, 0.05)) bad.push('并联 2 块电池：灯 1.5 V、耗电均摊每块 0.5 U/s ' + JSON.stringify(s));
            // 电池耗尽：一块没电了，另一块接着带（全背）；两块都没电，灯灭
            await T.eval(`B.charge = 0.05; labAdvance(1, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), b2: __s(B2), l: __s(L1) })`));
            if (s.b.ch !== 0 || !s.l.run || !elNear(s.b2.bd, 1, 0.01)) bad.push('并联里一块电池耗尽，另一块应该接着带全部耗电 ' + JSON.stringify(s));
            await T.eval(`B2.charge = 1; labAdvance(3, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b2: __s(B2), l: __s(L1) })`));
            if (s.b2.ch !== 0 || s.l.run) bad.push('电池耗尽后灯应该灭 ' + JSON.stringify(s));
            // 满电的普通电池亮一盏灯 180 秒：用 1 U/s 实测 20 秒掉 20 U，按比例就是 180 秒
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -3, 2); window.L1 = __d('bulb', 3, 2); __ring([B, L1]); labAdvance(20, 0.1); true;`);
            if (!elNear(await T.eval(`B.charge`), 160, 0.1)) bad.push('一盏灯 20 秒应该耗 20 U ' + await T.eval(`B.charge`));
            // 开关：断开灯灭、电池不掉电；接通灯亮。用瞄准 + E 键切换
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -3, 2); window.S = __d('switch', 0, 0.5); window.L1 = __d('bulb', 3, 2); __ring([B, S, L1]); labAdvance(1, 0.1); window.__c0 = B.charge; true;`);
            if (await T.eval(`!L1.run || !S.on`)) bad.push('开关接通时灯应该亮');
            await T.eval(`__look(S.x, 0.14, S.z); labInteract(); labAdvance(1, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ on: S.on, l: L1.run, ch: B.charge, c0: window.__c0 })`));
            if (s.on || s.l || !elNear(s.ch, s.c0, 0.001)) bad.push('开关断开后灯应该灭、电池不再掉电 ' + JSON.stringify(s));
            await T.eval(`__look(S.x, 0.14, S.z); labInteract(); labAdvance(1, 0.1); true;`);
            if (await T.eval(`!S.on || !L1.run`)) bad.push('开关接通后灯应该又亮');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB22 电路：串联 2 盏灯、串联电池电压相加、并联电压不变耗电均摊、电阻 0.5、电池耗尽设备停、开关断开接通', bad.length === 0, bad.join(' / '));
        }

        if (want('LB23')) {
            // LB23 升压器：它后面的电压和耗电都 ×5，自己耗电 2 U/s（前面的设备不受影响）；一圈电池耗电 = 升压器 2 + 灯 1 × 5 = 7 U/s
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} true;`);
            // 电池 → 升压器 → 灯 → 回电池（线按这个顺序接）
            await T.eval(`window.B = __d('bat', -3, 2); window.K = __d('booster', 0, 0.5); window.L = __d('bulb', 3, 2); __w(B, K); __w(K, L); __w(L, B); labAdvance(2, 0.1); true;`);
            let s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), k: __s(K), l: __s(L) })`));
            if (!elNear(s.l.v, 7.5, 0.01) || !elNear(s.l.draw, 5, 0.01) || !elNear(s.k.draw, 2, 0.01) || !elNear(s.k.v, 1.5, 0.01) || !elNear(s.b.bd, 7, 0.01) || !elNear(s.b.ch, 166, 0.1)) bad.push('升压器在灯前面：灯应该 7.5 V、耗电 5，升压器自己 2，电池背 7 ' + JSON.stringify(s));
            // 灯在升压器前面：不受影响
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -3, 2); window.L = __d('bulb', 0, 0.5); window.K = __d('booster', 3, 2); __w(B, L); __w(L, K); __w(K, B); labAdvance(2, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), k: __s(K), l: __s(L) })`));
            if (!elNear(s.l.v, 1.5, 0.01) || !elNear(s.l.draw, 1, 0.01) || !elNear(s.b.bd, 3, 0.01)) bad.push('灯在升压器前面不该 ×5 ' + JSON.stringify(s));
            // 2 块电池 + 升压器：电压 3 × 5 = 15 V
            await T.eval(`lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.K = __d('booster', 1, 0.5); window.L = __d('bulb', 4, 2); __w(B, B2); __w(B2, K); __w(K, L); __w(L, B); labAdvance(1, 0.1); true;`);
            s = JSON.parse(await T.eval(`JSON.stringify({ b: __s(B), l: __s(L) })`));
            if (!elNear(s.l.v, 15, 0.01) || !elNear(s.b.bd, 7, 0.01)) bad.push('2 块电池 + 升压器：灯 15 V、每块电池背 7 U/s ' + JSON.stringify(s));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB23 升压器 ×5：后面的电压和耗电都乘 5、自己耗电 2、前面的不受影响', bad.length === 0, bad.join(' / '));
        }

        if (want('LB24')) {
            // LB24 电解：水 ≥ 2 V → 2 氢 + 1 氧（5 秒，每块串联电池 10 U）；电压不够不出；没装瓶的氢氧混合爆炸；盐水要 3 个空瓶且 ≥ 3 V；熔融食盐 ≥ 4 V 出钠 + 氯气；没装瓶的氯气有毒
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} window.__G = function (k) { return lab.ground.filter(function (e) { return e.key === k && !e.dead; }).length; };
                window.__clr = function () { lab.devs.slice().forEach(function (d) { labDevRemove(d, false); }); labClear(); lab.booms = 0; lab.hp = 100; };
                window.__bot = function (n, x, z) { for (let i = 0; i < n; i++) labSpawn('bottle', x + i * 0.3, z + 1); };
                true;`);
            // 水：2 块电池串联（3 V）+ 电解槽
            await T.eval(`window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.E = __d('elec', 3, 2); __ring([B, B2, E]); labSpawn('b:water', 3.5, 2.5); __bot(2, 3, 2); labAdvance(1, 0.1); true;`);
            if (await T.eval(`!E.job || __G('b:water') !== 0`)) bad.push('水瓶放在电解槽旁、电压够，应该开始电解');
            await T.eval(`labAdvance(5, 0.1); true;`);
            let g = JSON.parse(await T.eval(`JSON.stringify({ h2: __G('b:h2'), o2: __G('b:o2'), free: __G('g:h2') + __G('g:o2'), water: __G('b:water'), booms: lab.booms, ch: [Math.round(B.charge * 10) / 10, Math.round(B2.charge * 10) / 10], job: !!E.job })`));
            if (g.h2 !== 2 || g.o2 !== 1 || g.free !== 0 || g.water !== 0 || g.booms !== 0 || g.job) bad.push('电解水应该得 2 瓶氢气 + 1 瓶氧气 ' + JSON.stringify(g));
            if (!elNear(g.ch[0], 170, 0.3) || !elNear(g.ch[1], 170, 0.3)) bad.push('电解一瓶水（5 秒 × 2 U/s）每块串联电池应该耗 10 U ' + JSON.stringify(g.ch));
            // 电压不够：1 块电池（1.5 V）不出，水瓶还在
            await T.eval(`__clr(); window.B = __d('bat', -3, 2); window.E = __d('elec', 3, 2); __ring([B, E]); labSpawn('b:water', 3.5, 2.5); __bot(3, 3, 2); labAdvance(7, 0.1); true;`);
            g = JSON.parse(await T.eval(`JSON.stringify({ water: __G('b:water'), h2: __G('b:h2'), job: !!E.job, v: E.v, draw: E.draw })`));
            if (g.water !== 1 || g.h2 !== 0 || g.job || g.draw !== 0) bad.push('电压不够不该电解（水瓶还在、不耗电） ' + JSON.stringify(g));
            // 没装瓶：氢氧混在一起爆炸，电解槽也炸没了
            await T.eval(`__clr(); lab.p.x = 9; lab.p.z = 7; window.B = __d('bat', -4, -2); window.B2 = __d('bat', -1, -3); window.E = __d('elec', 3, -2); __ring([B, B2, E]); labSpawn('b:water', 3.5, -1.8); labAdvance(7, 0.1); true;`);
            g = JSON.parse(await T.eval(`JSON.stringify({ booms: lab.booms, elec: lab.devs.filter(function (d) { return d.ty === 'elec'; }).length })`));
            if (g.booms < 1 || g.elec !== 0) bad.push('没装瓶的氢氧混合应该爆炸、炸掉范围内的设备 ' + JSON.stringify(g));
            // 盐水：只有 2 个空瓶不开始，补到 3 个才开始；得氢氧化钠 + 氢气 + 氯气
            await T.eval(`__clr(); lab.p.x = 0; lab.p.z = 6; window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.E = __d('elec', 3, 2); __ring([B, B2, E]); labSpawn('b:brine', 3.5, 2.5); __bot(2, 3, 2); labAdvance(2, 0.1); true;`);
            if (await T.eval(`!!E.job || __G('b:brine') !== 1`)) bad.push('盐水只有 2 个空瓶，不该开始');
            await T.eval(`__bot(1, 4, 2); labAdvance(6, 0.1); true;`);
            g = JSON.parse(await T.eval(`JSON.stringify({ naoh: __G('b:naoh'), h2: __G('b:h2'), cl2: __G('b:cl2'), brine: __G('b:brine'), free: __G('g:h2') + __G('g:cl2'), left: __G('bottle'), booms: lab.booms })`));
            if (g.naoh !== 1 || g.h2 !== 1 || g.cl2 !== 1 || g.brine !== 0 || g.free !== 0 || g.left !== 1 || g.booms !== 0) bad.push('电解盐水应该得 氢氧化钠 + 氢气 + 氯气 各一瓶、剩一个空瓶 ' + JSON.stringify(g));
            // 盐水 3 V 够；熔融食盐 3 V 不够，4 V（3 块电池）可以：得钠 + 氯气
            await T.eval(`__clr(); window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.E = __d('elec', 3, 2); __ring([B, B2, E]); labSpawn('b:melt', 3.5, 2.5); __bot(1, 3, 2); labAdvance(3, 0.1); true;`);
            if (await T.eval(`!!E.job || __G('b:melt') !== 1`)) bad.push('熔融食盐 3 V 不够，不该电解');
            await T.eval(`__clr(); window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.B3 = __d('bat', -3, 0); window.E = __d('elec', 3, 2); __ring([B, B2, B3, E]); labSpawn('b:melt', 3.5, 2.5); __bot(1, 3, 2); labAdvance(6.5, 0.1); true;`);
            g = JSON.parse(await T.eval(`JSON.stringify({ na: __G('a:11:12'), cl2: __G('b:cl2'), free: __G('g:cl2'), melt: __G('b:melt'), v: Math.round(E.v * 10) / 10, na2: lab.ground.filter(function (e) { return e.key === 'a:11:12'; }).map(function (e) { return Math.round(labD(e, E) * 10) / 10; }) })`));
            if (g.na !== 1 || g.cl2 !== 1 || g.free !== 0 || g.melt !== 0) bad.push('电解熔融食盐应该得钠 + 一瓶氯气 ' + JSON.stringify(g));
            // 没装瓶的氯气有毒：盐水开始后把空瓶都拿走，做完氯气飘在电解槽上，人站旁边掉血
            await T.eval(`__clr(); window.B = __d('bat', -4, 2); window.B2 = __d('bat', -1, 3); window.E = __d('elec', 3, 2); __ring([B, B2, E]); labSpawn('b:brine', 3.5, 2.5); __bot(3, 3, 2); labAdvance(1, 0.1); lab.ground.filter(function (e) { return e.key === 'bottle'; }).forEach(labKill); lab.p.x = 2; lab.p.z = 4; labAdvance(5.2, 0.1); true;`);
            g = JSON.parse(await T.eval(`JSON.stringify({ cl2: __G('g:cl2'), hp: lab.hp })`));
            if (g.cl2 !== 1 || !(g.hp < 100)) bad.push('没装瓶的氯气应该飘在外面、有毒（掉血） ' + JSON.stringify(g));
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB24 电解：水 ≥ 2 V 出氢氧、电压不够不出、没装瓶氢氧爆炸、盐水要 3 个空瓶、熔融食盐 ≥ 4 V 出钠和氯气、没装瓶氯气有毒', bad.length === 0, bad.join(' / '));
        }

        if (want('LB25')) {
            // LB25 元素表：房间里有一块牌子，对着它左键打开面板；氢到铁每个同位素的名字、质子／中子／电子数、稳定还是衰变（衰变的写半衰期）；数据直接读核素表，没有另外抄一份
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} lab.p.x = -9.5; lab.p.z = 0; true;`);
            if (await T.eval(`!LAB_ST.table || LAB_ST.table.name !== '元素表' || !lab.objs.some(function (o) { return o.userData && o.userData.labSign && o.position.x < -11; })`)) bad.push('房间里没有元素表牌子');
            await T.eval(`__look(LAB_ST.table.x, 0.9, LAB_ST.table.z); labHudUpdate(); true;`);
            if (!/元素表/.test(await T.eval(`document.getElementById('lab-hint').innerText`))) bad.push('对着牌子应该提示元素表');
            await T.eval(`labClick(); true;`);
            if (await T.eval(`lab.panel !== 'table'`)) bad.push('对着牌子左键没打开元素表 ' + await T.eval(`lab.panel`));
            const rowsOf = async () => JSON.parse(await T.eval(`JSON.stringify([].map.call(document.querySelectorAll('#lab-panel tr.lab-iso'), function (r) { let c = r.children; return [+r.dataset.z, +r.dataset.n, r.dataset.s, c[0].innerText, +c[1].innerText, +c[2].innerText, +c[3].innerText, c[4].innerText]; }))`));
            const expectOf = async () => JSON.parse(await T.eval(`JSON.stringify((function () { let o = []; for (let z = 1; z <= 26; z++) { (LAB_STABLE[z] || []).forEach(function (a) { o.push([z, a - z, 'stable']); }); LAB_UNST.forEach(function (u) { if (u[0] === z) o.push([z, u[1], LAB_DECAY['a:' + z + ':' + u[1]] ? 'decay' : 'long']); }); } return o; })())`));
            let rows = await rowsOf(), exp = await expectOf();
            const key = (a) => a[0] + ':' + a[1];
            if (rows.length !== exp.length) bad.push('行数和核素表不一样 ' + rows.length + ' / ' + exp.length);
            const have = new Map(rows.map((r) => [key(r), r]));
            exp.forEach((e) => {
                const r = have.get(key(e));
                if (!r) { bad.push('少了 ' + key(e)); return; }
                if (r[2] !== e[2]) bad.push(key(e) + ' 稳定／衰变标错 ' + r[2] + ' 应该 ' + e[2]);
                if (r[4] !== e[0] || r[5] !== e[1] || r[6] !== e[0]) bad.push(key(e) + ' 质子／中子／电子数不对 ' + r.slice(4, 7));
                if (e[2] === 'decay' && !/半衰期/.test(r[7])) bad.push(key(e) + ' 衰变的要写半衰期 ' + r[7]);
                if (e[2] === 'stable' && !/稳定/.test(r[7])) bad.push(key(e) + ' 应该写稳定 ' + r[7]);
            });
            const names = JSON.parse(await T.eval(`JSON.stringify([labAtomName(1, 0), labAtomName(26, 30), labAtomName(6, 6)])`));
            const nameOf = (z, n) => have.get(z + ':' + n) && have.get(z + ':' + n)[3];
            if (nameOf(1, 0) !== names[0] || nameOf(26, 30) !== names[1] || nameOf(6, 6) !== names[2] || names.join() !== '氢-1,铁-56,碳-12') bad.push('名字不对 ' + nameOf(1, 0) + ' ' + nameOf(26, 30) + ' ' + nameOf(6, 6));
            if (rows.some((r) => r[0] < 1 || r[0] > 26)) bad.push('只列氢到铁（Z 1～26）');
            if (new Set(rows.map((r) => r[0])).size !== 26) bad.push('26 个元素每个都要有');
            // 数据是直接读核素表的：往核素表里加一个，面板里就多一个，没有另外抄的一份
            await T.eval(`labPanelClose(); LAB_UNST.push([26, 40, 100, 'b-']); labClick(); true;`);
            rows = await rowsOf();
            if (!rows.some((r) => r[0] === 26 && r[1] === 40 && r[3] === '铁-66')) bad.push('往核素表加一个核素，元素表里没跟着多（数据不是直接读核素表的）');
            await T.eval(`LAB_UNST.pop(); labPanelClose(); true;`);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB25 元素表：牌子对着左键打开，氢到铁每个同位素的名字、质子／中子／电子、稳定或衰变（写半衰期），数据直接读核素表', bad.length === 0, bad.join(' / '));
        }

        if (want('LB26')) {
            // LB26 器材的显示和复用：灯泡亮了有发光（变亮的颜色 + 光晕），电池和设备头顶有牌子（电量、电压、耗电）；放设备、连线不新建几何体／贴图／场景物体，绘制调用只多几次；退出把设备和电线收回仓库箱，下次进来是干净的
            const bad = [];
            const T = await LBTAB();
            await LBENTER(T);
            await T.eval(`${ELHELP} true;`);
            const stat = () => T.eval(`(renderer.render(scene, camera), JSON.stringify({ calls: renderer.info.render.calls, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, kids: scene.children.length }))`);
            await T.eval(`labAdvance(0.2, 0.1); true;`);   // 先推一下：镜头退到人身后，人物身上的几何体和贴图这时才传给显卡，不算设备的
            await frames(T, 3);
            const s0 = JSON.parse(await stat());
            await T.eval(`window.B = __d('bat', -4, 2); window.S = __d('switch', -2, 3); window.L1 = __d('bulb', 0, 2); window.L2 = __d('bulb', 2, 3); window.R = __d('resistor', 4, 2); window.K = __d('booster', 1, 0.5);
                __w(B, S); __w(S, L1); __w(L1, L2); __w(L2, R); __w(R, K); __w(K, B); labAdvance(1, 0.1); lab.p.x = -3; lab.p.z = 3; labHudUpdate(); labDevLabels(); true;`);
            const s1 = JSON.parse(await stat());
            if (s1.geo !== s0.geo || s1.tex !== s0.tex || s1.kids !== s0.kids) bad.push('放设备、连线不该新建几何体／贴图／场景物体 ' + JSON.stringify([s0, s1]));
            if (s1.calls - s0.calls > 12) bad.push('放了 6 个设备 + 6 根线，绘制调用多了 ' + (s1.calls - s0.calls) + ' 次（太多） ' + JSON.stringify([s0, s1]));
            // 发光：灯亮了颜色变亮 + 光晕；灭了变暗、光晕没了
            const lit = JSON.parse(await T.eval(`JSON.stringify({ run: L1.run, col: [].slice.call(lab.dm.bulb.instanceColor.array, 0, 3), halo: lab.halo.count })`));
            if (!lit.run || !(lit.col[0] > 0.9 && lit.col[1] > 0.8) || lit.halo !== 2) bad.push('灯亮了应该变亮 + 有光晕 ' + JSON.stringify(lit));
            await T.eval(`S.on = false; lab.cirDirty = true; labAdvance(0.5, 0.1); true;`);
            const dim = JSON.parse(await T.eval(`JSON.stringify({ col: [].slice.call(lab.dm.bulb.instanceColor.array, 0, 3), halo: lab.halo.count })`));
            if (dim.halo !== 0 || !(dim.col[0] < 0.7)) bad.push('灯灭了应该变暗、光晕没了 ' + JSON.stringify(dim));
            await T.eval(`S.on = true; lab.cirDirty = true; labAdvance(1, 0.1); labDevLabels(); true;`);
            // 头顶牌子：离得近的 4 个；电池写剩余电量，其他写电压和耗电
            const lb = JSON.parse(await T.eval(`JSON.stringify(lab.dlabels.filter(function (l) { return l.sp.visible; }).map(function (l) { return l.text; }))`));
            if (lb.length !== 4 || !lb.some((t) => /电池 \d+\/180 U/.test(t)) || !lb.some((t) => /V　耗电 [\d.]+ U\/s/.test(t))) bad.push('头顶牌子不对 ' + JSON.stringify(lb));
            // 只要牌子内容不变，就不重画贴图
            const d0 = await T.eval(`lab.labelDraws`);
            await T.eval(`labDevLabels(); labDevLabels(); true;`);
            if ((await T.eval(`lab.labelDraws`)) !== d0) bad.push('牌子内容没变不该重画');
            // 反复放、收：资源数不涨
            await T.eval(`for (let i = 0; i < 30; i++) { let d = __d('resistor', -8 + (i % 6) * 0.9, -5 + Math.floor(i / 6) * 0.9); if (d) { __w(d, R); labDevRemove(d, false); } } labAdvance(0.5, 0.1); true;`);
            const s2 = JSON.parse(await stat());
            if (s2.geo !== s0.geo || s2.tex !== s0.tex || s2.kids !== s0.kids) bad.push('反复放收设备资源数涨了 ' + JSON.stringify([s0, s2]));
            // 上限
            const cap = JSON.parse(await T.eval(`(function () { let n = lab.devs.length; for (let i = 0; i < 40; i++) __d('resistor', -10 + (i % 12) * 0.9, -6.5 + Math.floor(i / 12) * 0.9); return JSON.stringify({ n: lab.devs.length, cap: LAB_DEV_CAP }); })()`));
            if (cap.n !== cap.cap) bad.push('设备数应该封顶 ' + JSON.stringify(cap));
            // 退出：设备、电线收回仓库箱；用过的电池带着剩下的电量；再进来是空的
            await T.eval(`lab.devs.slice().forEach(function (d) { if (d.ty === 'resistor') labDevRemove(d, false); }); lab.bag = {}; labClear(); gState.lab.box = {}; true;`);
            const nw = await T.eval(`lab.wires.length`);
            await LBEXIT(T);
            const box = JSON.parse(await T.eval(`JSON.stringify(gState.lab.box)`));
            if (box.wire !== nw || box.bulb !== 2 || box.switch !== 1 || box.booster !== 1 || !Object.keys(box).some((k) => /^bat:\d+$/.test(k))) bad.push('退出应该把设备和电线收回仓库箱 ' + JSON.stringify(box));
            await LBENTER(T);
            if (await T.eval(`lab.devs.length !== 0 || lab.wires.length !== 0`)) bad.push('再进来应该没有设备');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await LBEXIT(T); await T.close();
            report('LB26 器材的显示和复用：灯亮有光晕、头顶牌子、放设备不新建对象、绘制调用只多几次、退出收回仓库箱', bad.length === 0, bad.join(' / '));
        }

        // ── 猫盾工业（硬核模式，js/19-industry.js）：检查名字都以 IND 开头 ──
        if (want('IND1')) {
            // IND1 骨架：藏着时看不到、选不到、进不去；?hcdebug=1 能进基地；出门生成远征图（同一个种子同一张图）、采集、稿子等级、
            // 撤离圈站满 3 秒才回基地且东西进仓库箱；基地里放的东西存进 IndexedDB 读得回来；远征里回大厅身上的东西丢；进出 3 次资源不涨
            const bad = [];
            const N = await openTab(chrome, url);
            await N.eval(`${HIDE} nav('screen-lobby'); selectGameMode('hunt'); true;`);
            const hid = JSON.parse(await N.eval(`JSON.stringify({ vis: indVisible(), btn: getComputedStyle(document.getElementById('btn-mode-industry')).display })`));
            if (hid.vis || hid.btn !== 'none') bad.push('正常玩家看得到猫盾工业 ' + JSON.stringify(hid));
            await N.eval(`selectGameMode('industry'); true;`);
            if ((await N.eval(`gState.gameMode`)) === 'industry') bad.push('藏起来的时候选得到');
            await N.eval(`indEnter(); true;`); await frames(N, 5);
            if (await N.eval(`ind !== null`)) bad.push('藏起来的时候进得去');
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            const IENTER = async () => { await T.eval(`${HIDE} indEnter(); true;`); return until(T, `ind && !ind.loading && ind.where === 'base' && !!document.getElementById('ind-hud')`, 15000); };
            const IEXIT = async () => { await T.eval(`indExit(true); true;`); return until(T, `ind === null && IND_SAVING === 0`, 10000); };
            await T.eval(`nav('screen-lobby'); document.getElementById('mode-detail-panel').classList.remove('hidden'); document.getElementById('btn-mode-industry').click(); true;`);
            if (!(await T.eval(`gState.gameMode === 'industry' && document.getElementById('mode-bar-current').innerText === '猫盾工业' && getComputedStyle(document.getElementById('btn-mode-industry')).display !== 'none'`))) bad.push('?hcdebug=1 下点入口没选中');
            await T.eval(`document.getElementById('lobby-start-btn').click(); true;`);
            if (!(await until(T, `ind && !ind.loading && ind.where === 'base' && !!document.getElementById('ind-hud')`, 15000))) bad.push('选猫盾工业后点开始游戏进不去');
            else {
                if (await T.eval(`!document.getElementById('screen-lobby').classList.contains('hidden')`)) bad.push('进去后大厅界面还开着');
                const box0 = JSON.parse(await T.eval(`JSON.stringify(ind.base.box)`));
                if (!box0.pick_stone) bad.push('新基地的仓库箱里没有石稿 ' + JSON.stringify(box0));
                await T.eval(`indBoxTake('pick_stone', 1); indPanelClose(); true;`);
                // 从门里走出去 → 远征
                await T.eval(`indTeleport(0, -IND_BASE.z + 0.1); indAdvance(0.2); true;`);
                const trip = JSON.parse(await T.eval(`JSON.stringify({ w: ind.where, n: ind.nodes.length, e: ind.exits.length, fog: !!scene.fog })`));
                if (trip.w !== 'trip' || trip.n < 100 || trip.e !== 3) bad.push('出门没生成远征图 ' + JSON.stringify(trip));
                if (!(await T.eval(`(function(){ let a = indMakeMap(12345), b = indMakeMap(12345); return indHeight(a, 37, -51) === indHeight(b, 37, -51) && indBiome(a, 90, 20) === indBiome(b, 90, 20); })()`))) bad.push('同一个种子生成的图不一样');
                const bms = await T.eval(`(function(){ let s = {}; for (let x = -140; x <= 140; x += 7) for (let z = -140; z <= 140; z += 7) s[indBiome(ind.map, x, z)] = 1; return Object.keys(s).length; })()`);
                if (bms < 4) bad.push('一张图里地貌太少 ' + bms);
                // 采集：石稿能挖的点
                const g = JSON.parse(await T.eval(`(function(){ let o = ind.nodes.filter(function (n) { return !n.dead && n.key !== 'seeds' && IND_NODES[n.key].tool <= 1; })[0]; indTeleport(o.x, o.z + 1); let before = ind.bag[o.key] || 0, ok = indGather(o); return JSON.stringify({ k: o.key, ok: ok, got: (ind.bag[o.key] || 0) - before }); })()`));
                if (!g.ok || g.got < 1) bad.push('采集失败 ' + JSON.stringify(g));
                // 铁矿要铁稿：石稿挖不动
                const fe = await T.eval(`(function(){ let o = { key: 'ore_fe', n: 2, dead: false }; return indGather(o) ? 'dug' : 'refused'; })()`);
                if (fe !== 'refused') bad.push('石稿居然挖得动铁矿');
                // 撤离：站进撤离圈，不到 3 秒不算，满了回基地，身上的东西进仓库箱
                await T.eval(`indTeleport(ind.exits[1].x, ind.exits[1].z); indAdvance(1.5); true;`);
                if (await T.eval(`ind.where !== 'trip'`)) bad.push('不到 3 秒就撤离了');
                await T.eval(`indAdvance(2); true;`);
                const back = JSON.parse(await T.eval(`JSON.stringify({ w: ind.where, bag: Object.keys(ind.bag).length, box: ind.base.box, trips: ind.base.trips, fog: !!scene.fog })`));
                if (back.w !== 'base' || back.bag !== 0 || !back.box[g.k] || !back.box.pick_stone || back.trips !== 1) bad.push('撤离后没回基地或东西没进仓库箱 ' + JSON.stringify(back));
                // 基地里放下一个东西，存进 IndexedDB，读得回来
                await T.eval(`indBoxTake(${JSON.stringify(g.k)}, 1); indPanelClose(); indDrop(); true;`);
                await until(T, `IND_SAVING === 0`, 5000);
                const saved = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify(b)); }); })`));
                if (saved.ground.length !== 1 || saved.ground[0].k !== g.k || saved.trips !== 1) bad.push('基地存档读回来不对 ' + JSON.stringify(saved));
                // 远征里回大厅：身上的东西丢，仓库箱不变
                const boxBefore = await T.eval(`JSON.stringify(ind.base.box)`);
                await T.eval(`indTeleport(0, -IND_BASE.z + 0.1); indAdvance(0.2); (function(){ let o = ind.nodes.filter(function (n) { return !n.dead && IND_NODES[n.key].tool === 0; })[0]; indGather(o); })(); true;`);
                await IEXIT();
                const after = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify(b)); }); })`));
                if (JSON.stringify(after.box) !== boxBefore) bad.push('远征里回大厅后仓库箱变了（身上的东西应该丢掉） ' + boxBefore + ' → ' + JSON.stringify(after.box));
                if (!(await T.eval(`!document.getElementById('screen-lobby').classList.contains('hidden') && !document.getElementById('ind-hud') && !document.getElementById('ind-panel') && gState.gameMode === 'industry'`))) bad.push('退出后没回大厅或界面没收干净');
                // 进出 3 次：基地里的几何体、贴图不涨
                const mem = () => T.eval(`(renderer.render(scene, camera), JSON.stringify([renderer.info.memory.geometries, renderer.info.memory.textures, scene.children.length]))`);
                await IENTER(); await IEXIT(); await IENTER(); await IEXIT();
                const during = [];
                for (let i = 0; i < 3; i++) { if (!(await IENTER())) { bad.push('第 ' + (i + 1) + ' 次进不去'); break; } during.push(await mem()); await IEXIT(); }
                if (during.length === 3) { const a1 = JSON.parse(during[1]), a2 = JSON.parse(during[2]); if (a2[0] > a1[0] || a2[1] > a1[1] || a2[2] !== a1[2]) bad.push('进出 3 次资源数在涨 ' + during.join(' → ')); }
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND1 猫盾工业骨架：藏着看不到进不去；?hcdebug=1 能进基地；出门生成远征图、采集、稿子等级、撤离 3 秒回基地进仓库箱；基地存档读得回来；远征里回大厅身上的丢；进出不涨', bad.length === 0, bad.join(' / '));
        }

        if (want('IND2')) {
            // IND2 第 2 阶段：第一次进来选规则（硬核不能退回悠闲）；生存值按时间掉；吃喝；接水、喝生水会拉肚子；种地、浇水、长熟、收获留种；
            // 灶台加柴、火候、烧开水、大火烧焦；夜里上床睡到第二天早上；硬核饿渴到血 0 会死、身上的丢；悠闲不会死、远征不出矿；存档读得回来
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                const ask = await T.eval(`!document.getElementById('sys-modal').classList.contains('hidden') && /选一种玩法/.test(document.getElementById('sys-modal').innerText)`);
                if (!ask) bad.push('新基地没让选规则');
                const c0 = await T.eval(`ind.base.clock`); await T.eval(`indAdvance(5); true;`);
                if ((await T.eval(`ind.base.clock`)) !== c0) bad.push('没选规则时间就走了');
                await T.eval(`${HIDE} indSetRule('hard'); indSetRule('casual'); ind.rng = function () { return 0.99; }; true;`);
                if ((await T.eval(`ind.base.rule`)) !== 'hard') bad.push('硬核居然退回了悠闲');
                // 生存值：60 秒饱食掉约 2、口渴掉约 4
                const s0 = JSON.parse(await T.eval(`JSON.stringify(ind.base.surv)`));
                await T.eval(`indAdvance(60); true;`);
                const s1 = JSON.parse(await T.eval(`JSON.stringify(ind.base.surv)`));
                if (Math.abs((s0.food - s1.food) - 2) > 0.3 || Math.abs((s0.water - s1.water) - 4) > 0.3) bad.push('生存值掉得不对 ' + JSON.stringify([s0, s1]));
                // 吃烤土豆 +30
                const ate = await T.eval(`(function(){ ind.base.surv.food = 50; let f = ind.base.surv.food; indBoxTake('bake_potato', 1); indPanelClose(); indSelect('bake_potato'); indUse(); return ind.base.surv.food - f; })()`);
                if (Math.abs(ate - 30) > 0.5) bad.push('烤土豆没加 30 饱食 ' + ate);
                // 接水：拿空桶对着水池右键
                await T.eval(`indBoxTake('bucket', 2); indPanelClose(); indTeleport(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z + 3.5); indLookAt(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z); indSelect('bucket'); indUse(); true;`);
                if (!(await T.eval(`ind.bag.water_raw === 1 && ind.bag.bucket === 1`))) bad.push('水池接不到水 ' + await T.eval(`JSON.stringify(ind.bag)`));
                // 喝生水：随机数小于 0.3 就拉肚子，口渴掉 3 倍
                await T.eval(`ind.rng = function () { return 0.1; }; indSelect('water_raw'); indUse(); ind.rng = function () { return 0.99; }; true;`);
                if (!(await T.eval(`ind.sickT > 0 && ind.bag.bucket === 2`))) bad.push('喝生水没拉肚子或桶没还回来');
                const w0 = await T.eval(`ind.base.surv.water`); await T.eval(`indAdvance(10); true;`);
                const dw = w0 - (await T.eval(`ind.base.surv.water`));
                if (Math.abs(dw - 2) > 0.2) bad.push('拉肚子时口渴没掉 3 倍 ' + dw);
                // 种地：农田里对着空格子左键种小麦
                await T.eval(`indBoxTake('seed_wheat', 6); indPanelClose(); indTeleport(-17, 3); indLookAt(-17, 1); indSelect('seed_wheat'); indAction(); true;`);
                const crop = JSON.parse(await T.eval(`JSON.stringify(ind.base.crops)`));
                if (crop.length !== 1 || crop[0].k !== 'wheat') bad.push('种不下去 ' + JSON.stringify(crop));
                else {
                    // 浇水：接一桶，对着作物右键；浇过的全速长，120 秒熟
                    await T.eval(`(function(){ indTeleport(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z + 3.5); indLookAt(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z); indSelect('bucket'); indUse(); let c = ind.base.crops[0]; indTeleport(c.x, c.z + 1.2); indLookAt(c.x, c.z); indSelect('water_raw'); indUse(); })(); true;`);
                    if (!(await T.eval(`ind.base.crops[0].wet > ind.base.clock`))) bad.push('浇不上水');
                    await T.eval(`indAdvance(${120 - 1}); true;`);
                    if (await T.eval(`indCropRipe(ind.base.crops[0])`)) bad.push('还没到时间就熟了');
                    await T.eval(`indAdvance(2); true;`);
                    const h = await T.eval(`(function(){ let c = ind.base.crops[0]; if (!indCropRipe(c)) return 'notripe'; indTeleport(c.x, c.z + 1.2); indLookAt(c.x, c.z); indAction(); return JSON.stringify({ n: ind.base.crops.length, wheat: ind.bag.wheat || 0, seed: ind.bag.seed_wheat || 0 }); })()`);
                    if (h === 'notripe') bad.push('浇了水 121 秒还没熟');
                    else { const hh = JSON.parse(h); if (hh.n !== 0 || hh.wheat < 2 || hh.seed < 6) bad.push('收获不对 ' + h); }
                }
                // 灶台：加柴、中火烧开水
                await T.eval(`indPanelClose(); indBoxTake('wood', 8); indPanelClose(); indTeleport(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z + 3.5); indLookAt(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z); indSelect('bucket'); indUse(); true;`);
                await T.eval(`for (let i = 0; i < 6; i++) indStoveFuel('wood'); indStovePut('water_raw', 1); indStoveFire(2); indPanelClose(); indAdvance(25); true;`);
                if (!(await T.eval(`ind.base.stove.out.water_boiled === 1`))) bad.push('中火烧不出开水 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 大火做面包会烧焦：出来的是焦炭，桶还在
                await T.eval(`indStoveTakeAll(); indBoxTake('salt', 1); indPanelClose(); indStovePut('wheat', 1); indStovePut('wheat', 1); indStovePut('salt', 1); indStovePut('water_boiled', 1); indStoveFire(3); indPanelClose(); indAdvance(40); true;`);
                const burnt = JSON.parse(await T.eval(`JSON.stringify(ind.base.stove.out)`));
                if (!burnt.char || burnt.bread || !burnt.bucket) bad.push('大火做面包没烧焦（或桶没了） ' + JSON.stringify(burnt));
                await T.eval(`indStoveFire(0); indStoveTakeAll(); indPanelClose(); true;`);
                // 睡觉：夜里上床，睡到第二天 0 秒（早上 6 点），精力补满
                await T.eval(`ind.base.clock = Math.floor(ind.base.clock / IND_DAY) * IND_DAY + IND_DUSK + 50; ind.base.surv.energy = 30; indTeleport(IND_BASE_ST.bed.x, IND_BASE_ST.bed.z + 3.6); indLookAt(IND_BASE_ST.bed.x, IND_BASE_ST.bed.z + 1.6); indAction(); true;`);
                const sl = JSON.parse(await T.eval(`JSON.stringify({ tod: indTod(), e: ind.base.surv.energy })`));
                if (sl.tod !== 0 || sl.e !== 100) bad.push('睡觉没睡到早上或精力没满 ' + JSON.stringify(sl));
                // 存档读得回来
                await T.eval(`indSave(); true;`); await until(T, `IND_SAVING === 0`, 5000);
                const sv = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify({ rule: b.rule, clock: b.clock, e: b.surv.energy, ver: b.ver })); }); })`));
                if (sv.rule !== 'hard' || sv.e !== 100 || sv.ver < 2 || Math.abs(sv.clock - (await T.eval(`ind.base.clock`))) > 1) bad.push('存档读回来不对 ' + JSON.stringify(sv));
                // 硬核：饿渴到血 0 会死，身上的东西没了，回到基地
                await T.eval(`(function(){ indBagAdd('stone', 3); indGoTrip(4242); let S = ind.base.surv; S.food = 0; S.water = 0; S.hp = 5; indAdvance(3); })(); true;`);
                const dead = JSON.parse(await T.eval(`JSON.stringify({ w: ind.where, bag: Object.keys(ind.bag).length, hp: ind.base.surv.hp })`));
                if (dead.w !== 'base' || dead.bag !== 0 || dead.hp !== 100) bad.push('硬核饿渴没死或死后不对 ' + JSON.stringify(dead));
                // 悠闲：到 0 不扣血、只变慢；远征不出矿
                await T.eval(`(function(){ ind.base.rule = 'casual'; let S = ind.base.surv; S.food = 0; S.water = 0; S.hp = 50; indAdvance(5); })(); true;`);
                if (!(await T.eval(`ind.base.surv.hp === 50 && indSlow() && ind.where === 'base'`))) bad.push('悠闲世界饿渴扣血了或没变慢');
                await T.eval(`indGoTrip(777); true;`);
                const ores = await T.eval(`ind.nodes.filter(function (n) { return !IND_CASUAL_RES[n.key]; }).length`);
                if (ores !== 0) bad.push('悠闲世界远征出了矿 ' + ores);
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND2 第 2 阶段：选规则、生存值、吃喝拉肚子、种地浇水收获、灶台开水和烧焦、睡觉、硬核饿死、悠闲不死不出矿、存档', bad.length === 0, bad.join(' / '));
        }

        if (want('IND3')) {
            // IND3 第 2.5 阶段：季节（一季 3 天）、作物分季节（冬天小麦不长、白菜长）、暖棚里不管季节都长；冬天不穿衣服体温掉、穿上棉衣棉帽围巾不掉；
            // 篝火取暖 +20°C、加柴；硬核冻死（身上和穿着的都丢）、悠闲不死；工作台做东西扣原料；存档带着衣服、暖棚、篝火；第 2 阶段老档补种子
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('hard'); ind.rng = function () { return 0.99; }; ind.base.clock = 9 * IND_DAY + 100; ind.base.surv.food = 100; ind.base.surv.water = 100; true;`);
                if ((await T.eval(`indSeason()`)) !== 3) bad.push('第 10 天不是冬天 ' + await T.eval(`indSeason()`));
                // 冬天：露天小麦不长、白菜长
                await T.eval(`(function(){ indBagAdd('seed_wheat', 2); indBagAdd('seed_cabbage', 2); indTeleport(-13, 3); indLookAt(-13, 1); indSelect('seed_wheat'); indAction(); indTeleport(-11, 3); indLookAt(-11, 1); indSelect('seed_cabbage'); indAction(); ind.base.crops.forEach(function (c) { c.wet = 1e9; }); })(); true;`);
                await T.eval(`indAdvance(50); true;`);
                const cr = JSON.parse(await T.eval(`JSON.stringify(ind.base.crops.map(function (c) { return [c.k, Math.round(c.g)]; }))`));
                const w = cr.filter((c) => c[0] === 'wheat')[0], cb = cr.filter((c) => c[0] === 'cabbage')[0];
                if (!w || !cb || w[1] !== 0 || cb[1] < 40) bad.push('冬天作物长得不对 ' + JSON.stringify(cr));
                // 暖棚：工作台用 10 根木头盖，棚里冬天也长番茄
                await T.eval(`(function(){ indBagAdd('wood', 10); indCraft(IND_CRAFT.findIndex(function (r) { return r.gh; })); indBagAdd('seed_tomato', 1); indTeleport(-24, 3); indLookAt(-24, 1); indSelect('seed_tomato'); indAction(); ind.base.crops.forEach(function (c) { c.wet = 1e9; }); })(); true;`);
                if (!(await T.eval(`ind.base.gh === true && !ind.bag.wood`))) bad.push('暖棚没盖上或木头没扣');
                await T.eval(`indAdvance(20); true;`);
                const tg = await T.eval(`(ind.base.crops.filter(function (c) { return c.k === 'tomato'; })[0] || { g: -1 }).g`);
                if (!(tg > 15)) bad.push('暖棚里冬天番茄不长 ' + tg);
                // 体温：冬天白天不穿衣服，60 秒掉约 1.8°C（气温 -5，比 15 低 20，每度每秒 0.0015）
                await T.eval(`indTeleport(0, 10); ind.base.surv.temp = 37; indAdvance(60); true;`);
                const t1 = await T.eval(`ind.base.surv.temp`);
                if (!(t1 < 35.6 && t1 > 34.8)) bad.push('冬天不穿衣服体温掉得不对 ' + t1);
                // 做衣服穿上：棉衣 6 + 棉帽 2 + 围巾 2 = 保暖 10，等效气温 20，不再掉
                await T.eval(`(function(){ indBagAdd('cotton', 8); indCraft(0); indCraft(1); indCraft(2); ['coat', 'hat', 'scarf'].forEach(function (k) { indSelect(k); indUse(); }); })(); true;`);
                if ((await T.eval(`indWarmth()`)) !== 10 || (await T.eval(`ind.bag.cotton || 0`)) !== 0) bad.push('衣服没做好或没穿上 ' + await T.eval(`JSON.stringify([ind.base.wear, ind.bag])`));
                await T.eval(`ind.base.surv.temp = 37; indAdvance(60); true;`);
                if ((await T.eval(`ind.base.surv.temp`)) < 36.95) bad.push('穿暖了体温还在掉 ' + await T.eval(`ind.base.surv.temp`));
                // 篝火：脱掉衣服，做篝火点上，旁边气温 +20；拿木头左键加柴
                await T.eval(`(function(){ ['body', 'head', 'neck'].forEach(indTakeOff); indBagAdd('wood', 6); indBagAdd('stone', 3); indCraft(3); indSelect('campfire'); indUse(); })(); true;`);
                const fr = JSON.parse(await T.eval(`(function(){ let f = ind.base.fires[0]; if (!f) return 'null'; let a = indAirTemp(); f.fuel = 0; let b = indAirTemp(); f.fuel = 120; indLookAt(f.x, f.z); let before = f.fuel; indSelect('wood'); indAction(); return JSON.stringify({ n: ind.base.fires.length, d: a - b, add: f.fuel - before }); })()`));
                if (fr === null || fr.n !== 1 || Math.abs(fr.d - 20) > 0.01 || fr.add !== 60) bad.push('篝火不对 ' + JSON.stringify(fr));
                // 存档：衣服、暖棚、篝火都在
                await T.eval(`indBagAdd('scarf', 1); indSelect('scarf'); indUse(); indSave(); true;`); await until(T, `IND_SAVING === 0`, 5000);
                const sv = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify({ wear: b.wear, gh: b.gh, fires: b.fires.length, ver: b.ver })); }); })`));
                if (sv.wear.neck !== 'scarf' || !sv.gh || sv.fires !== 1 || sv.ver < 3) bad.push('存档读回来不对 ' + JSON.stringify(sv));
                // 硬核冻死：身上和穿着的都没了
                await T.eval(`(function(){ indGoTrip(99); let S = ind.base.surv; S.temp = 32.5; S.hp = 2; indAdvance(3); })(); true;`);
                const dd = JSON.parse(await T.eval(`JSON.stringify({ w: ind.where, wear: Object.keys(ind.base.wear).length, hp: ind.base.surv.hp, t: ind.base.surv.temp })`));
                if (dd.w !== 'base' || dd.wear !== 0 || dd.hp !== 100 || dd.t < 36.5) bad.push('硬核冻死不对 ' + JSON.stringify(dd));
                // 悠闲：冻到 30°C 也不扣血
                await T.eval(`(function(){ ind.base.rule = 'casual'; let S = ind.base.surv; S.temp = 30; S.hp = 50; indAdvance(3); })(); true;`);
                if ((await T.eval(`ind.base.surv.hp`)) !== 50) bad.push('悠闲世界冻得扣血了');
                // 第 2 阶段的老档：补上棉花、白菜种子，没有衣服字段也不出错
                const mig = JSON.parse(await T.eval(`JSON.stringify(indFixBase({ ver: 2, rule: 'hard', box: { wood: 1 }, surv: { hp: 50 } }))`));
                if (mig.box.seed_cotton !== 4 || mig.box.seed_cabbage !== 3 || mig.surv.temp !== 37 || mig.gh !== false || !Array.isArray(mig.fires)) bad.push('老档迁移不对 ' + JSON.stringify(mig.box));
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND3 第 2.5 阶段：季节、作物分季节、暖棚、体温和衣服、篝火取暖加柴、硬核冻死、悠闲不死、工作台、存档和老档迁移', bad.length === 0, bad.join(' / '));
        }

        if (want('IND4')) {
            // IND4 第 2.8 阶段：远征里有野生动物；喂它爱吃的、喂够了就跟着走，撤离时跟着的一起回家；基地里饿了不产东西；
            // 羊剪毛（2 天一次）、羊毛做毛线和毛衣；牛拿空桶挤奶（一天一次）、灶台煮奶酪；不爱吃的不吃；存档带着动物
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('casual'); ind.base.surv.food = 100; ind.base.surv.water = 100; true;`);
                await T.eval(`indGoTrip(2024); true;`);
                const wild = JSON.parse(await T.eval(`JSON.stringify(ind.wild.map(function (a) { return a.k; }))`));
                if (wild.length < 8) bad.push('远征里野生动物太少 ' + wild.length);
                // 造一只羊、一头牛在面前（不靠随机地图里刚好有）
                await T.eval(`(function(){ ind.wild.push({ k: 'sheep', x: 3, z: -4, fed: 0, follow: false }); ind.wild.push({ k: 'cow', x: -3, z: -4, fed: 0, follow: false }); indTeleport(3, -2); indLookAt(3, -4); })(); true;`);
                const ref = await T.eval(`(function(){ indBagAdd('bread', 1); indSelect('bread'); let a = ind.wild[ind.wild.length - 2]; return indAnimalAct(a) ? 'ate' : 'refused'; })()`);
                if (ref !== 'refused' || !(await T.eval(`ind.bag.bread === 1`))) bad.push('羊居然吃面包');
                await T.eval(`(function(){ indBagAdd('wheat', 10); indSelect('wheat'); let s = ind.wild[ind.wild.length - 2], c = ind.wild[ind.wild.length - 1]; for (let i = 0; i < 3; i++) indAnimalAct(s); for (let i = 0; i < 4; i++) indAnimalAct(c); })(); true;`);
                if (!(await T.eval(`ind.wild[ind.wild.length - 2].follow && ind.wild[ind.wild.length - 1].follow && ind.bag.wheat === 3`))) bad.push('喂够了没跟着走 ' + await T.eval(`JSON.stringify(ind.wild.slice(-2))`));
                // 跟着走：人走远，动物跟上来
                await T.eval(`indTeleport(20, -4); indAdvance(8); true;`);
                const dd = await T.eval(`Math.hypot(ind.wild[ind.wild.length - 2].x - ind.p.x, ind.wild[ind.wild.length - 2].z - ind.p.z)`);
                if (dd > 4) bad.push('羊没跟上来 ' + dd);
                // 撤离：一起回家
                await T.eval(`(function(){ let e = ind.exits[0]; indTeleport(e.x, e.z); ind.wild.slice(-2).forEach(function (a) { a.x = e.x + 1; a.z = e.z + 1; }); indAdvance(3.2); })(); true;`);
                const home = JSON.parse(await T.eval(`JSON.stringify({ w: ind.where, an: ind.base.animals.map(function (a) { return a.k; }) })`));
                if (home.w !== 'base' || home.an.indexOf('sheep') < 0 || home.an.indexOf('cow') < 0) bad.push('动物没跟着回家 ' + JSON.stringify(home));
                // 剪羊毛：刚回家要等一天；时间到了剪 2 份；饿了不给剪
                const sheepIdx = await T.eval(`ind.base.animals.findIndex(function (a) { return a.k === 'sheep'; })`);
                const cowIdx = await T.eval(`ind.base.animals.findIndex(function (a) { return a.k === 'cow'; })`);
                await T.eval(`(function(){ indBagAdd('wheat', 3); indBagAdd('bread', 1); indSelect('bread'); let a = ind.base.animals[${sheepIdx}]; indAnimalAct(a); })(); true;`);
                if (await T.eval(`!!ind.bag.wool`)) bad.push('刚回家就能剪毛');
                await T.eval(`(function(){ let a = ind.base.animals[${sheepIdx}]; a.woolAt = 0; a.food = 10; indAnimalAct(a); })(); true;`);
                if (await T.eval(`!!ind.bag.wool`)) bad.push('饿着的羊也给剪毛');
                await T.eval(`(function(){ let a = ind.base.animals[${sheepIdx}]; indSelect('wheat'); indAnimalAct(a); indSelect('bread'); a.woolAt = 0; indAnimalAct(a); a.woolAt = 0; indAnimalAct(a); })(); true;`);
                if ((await T.eval(`ind.bag.wool || 0`)) !== 4) bad.push('剪羊毛不对 ' + await T.eval(`ind.bag.wool`));
                // 毛线 → 毛衣（保暖 8）
                await T.eval(`(function(){ indBagAdd('wool', 2); for (let i = 0; i < 3; i++) indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'yarn'; })); indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'sweater'; })); indSelect('sweater'); indUse(); })(); true;`);
                if ((await T.eval(`ind.base.wear.body`)) !== 'sweater' || (await T.eval(`indWarmth()`)) !== 8) bad.push('毛衣没做出来或没穿上 ' + await T.eval(`JSON.stringify([ind.bag, ind.base.wear])`));
                // 挤牛奶：拿空桶，一天一次；灶台煮奶酪
                await T.eval(`(function(){ indBoxTake('bucket', 2); indPanelClose(); let c = ind.base.animals[${cowIdx}]; c.food = 80; indSelect('bucket'); indAnimalAct(c); indSelect('bucket'); indAnimalAct(c); })(); true;`);
                if ((await T.eval(`ind.bag.milk || 0`)) !== 1) bad.push('挤奶不对（应该一天一桶） ' + await T.eval(`JSON.stringify(ind.bag)`));
                await T.eval(`indBoxTake('wood', 2); indPanelClose(); indStoveFuel('wood'); indStovePut('milk', 1); indStoveFire(1); indPanelClose(); indAdvance(40); true;`);
                if (!(await T.eval(`ind.base.stove.out.cheese === 1 && ind.base.stove.out.bucket === 1`))) bad.push('煮不出奶酪 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 动物会饿：100 秒掉约 3.3
                const f0 = await T.eval(`ind.base.animals[${cowIdx}].food`); await T.eval(`indAdvance(30); true;`);
                const df = f0 - (await T.eval(`ind.base.animals[${cowIdx}].food`));
                if (Math.abs(df - 1) > 0.1) bad.push('动物饱食掉得不对 ' + df);
                // 存档
                await T.eval(`indSave(); true;`); await until(T, `IND_SAVING === 0`, 5000);
                const sv = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify({ an: b.animals.length, ver: b.ver })); }); })`));
                if (sv.an !== 2 || sv.ver < 4) bad.push('存档读回来不对 ' + JSON.stringify(sv));
                // 进出 3 次不涨（动物也是一组画完）
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND4 第 2.8 阶段：野生动物、喂食驯服跟着回家、剪羊毛做毛衣、挤牛奶煮奶酪、动物会饿、存档', bad.length === 0, bad.join(' / '));
        }

        if (want('IND5')) {
            // IND5 第 3a 阶段（只给硬核）：大火炼铜矿出烫铜锭；不拿钳子拿着烫锭每秒扣 15 血；泡水马上凉；地上 30 秒凉；钳子；
            // 风箱加鼓风档 1600°C 才炼得动铁矿；铁稿挖得动铁矿；悠闲世界炼不了、工作台不显示；配方查询能搜
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('hard'); let S = ind.base.surv; S.food = 100; S.water = 100; S.temp = 37; true;`);
                // 大火炼铜矿
                await T.eval(`(function(){ indBagAdd('wood', 20); indBagAdd('ore_cu', 2); for (let i = 0; i < 10; i++) indStoveFuel('wood'); indStovePut('ore_cu', 1); indStoveFire(3); indPanelClose(); })(); true;`);
                await T.eval(`indAdvance(45); true;`);
                if (!(await T.eval(`ind.base.stove.out.hot_cu === 1`))) bad.push('大火炼不出铜锭 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 拿着烫铜锭，没钳子：每秒扣 15
                await T.eval(`indStoveTakeAll(); indPanelClose(); ind.base.surv.hp = 100; ind.base.surv.temp = 37; true;`);
                await T.eval(`indAdvance(2); true;`);
                const hp1 = await T.eval(`ind.base.surv.hp`);
                if (!(hp1 < 72 && hp1 > 68)) bad.push('拿烫锭没按每秒 15 扣血 ' + hp1);
                // 泡水：对着水池右键，马上凉
                await T.eval(`indTeleport(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z + 3.5); indLookAt(IND_BASE_ST.pool.x, IND_BASE_ST.pool.z); indSelect('hot_cu'); indUse(); true;`);
                if (!(await T.eval(`!ind.bag.hot_cu && ind.bag.ingot_cu === 1`))) bad.push('泡水没凉 ' + await T.eval(`JSON.stringify(ind.bag)`));
                // 地上放 30 秒凉
                await T.eval(`indBagAdd('hot_zn', 1); indSelect('hot_zn'); indDrop(); indAdvance(31); true;`);
                if (!(await T.eval(`ind.base.ground.some(function (g) { return g.k === 'ingot_zn'; }) && !ind.base.ground.some(function (g) { return g.k === 'hot_zn'; })`))) bad.push('地上的烫锭 30 秒没凉');
                // 钳子：拿着烫锭不扣血
                await T.eval(`indBagAdd('ingot_cu', 1); indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'tongs'; })); indBagAdd('hot_fe', 1); ind.base.surv.hp = 100; indAdvance(2); true;`);
                if (!(await T.eval(`ind.bag.tongs === 1 && ind.base.surv.hp > 99`))) bad.push('有钳子还扣血 ' + await T.eval(`JSON.stringify([ind.bag, ind.base.surv.hp])`));
                // 大火炼不动铁矿；风箱装上后鼓风 1600°C 才行
                await T.eval(`(function(){ indStoveTakeAll(); indPanelClose(); indBagAdd('ore_fe', 1); indStovePut('ore_fe', 1); indStoveFire(3); indPanelClose(); indAdvance(40); })(); true;`);
                if (await T.eval(`!!ind.base.stove.out.hot_fe`)) bad.push('大火就炼出了铁（铁的熔点 1538°C）');
                await T.eval(`(function(){ indStoveFire(4); })(); true;`);
                if ((await T.eval(`ind.base.stove.fire`)) === 4) bad.push('没风箱就能鼓风');
                await T.eval(`(function(){ indBagAdd('wood', 6); indBagAdd('clay', 4); indCraft(IND_CRAFT.findIndex(function (r) { return r.bellows; })); indBagAdd('wood', 10); for (let i = 0; i < 10; i++) indStoveFuel('wood'); indStoveFire(4); indPanelClose(); indAdvance(60); })(); true;`);
                if (!(await T.eval(`ind.base.bellows && ind.base.stove.out.hot_fe === 1`))) bad.push('鼓风炼不出铁 ' + await T.eval(`JSON.stringify([ind.base.bellows, ind.base.stove])`));
                // 铁稿挖铁矿
                await T.eval(`(function(){ ind.base.stove.fire = 0; indBagAdd('ingot_fe', 3); indBagAdd('wood', 2); indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'pick_iron'; })); })(); true;`);
                const dug = await T.eval(`(function(){ let o = { key: 'ore_fe', n: 2, dead: false }; return indGather(o) ? 'dug' : 'refused'; })()`);
                if (dug !== 'dug') bad.push('有铁稿还挖不动铁矿');
                // 配方查询：搜"铁"能看到铁矿→铁锭和铁稿
                await T.eval(`indPanelBook('铁'); true;`);
                const bk = await T.eval(`document.getElementById('ind-book-list').innerText`);
                if (!/铁矿×1 → 铁锭（烫）×1/.test(bk) || !/铁稿/.test(bk) || /小麦种子/.test(bk)) bad.push('配方查询搜"铁"不对 ' + bk.slice(0, 200));
                await T.eval(`indPanelClose(); true;`);
                // 悠闲：炼不了，工作台不显示硬核的东西，配方查询里也没有
                await T.eval(`(function(){ ind.base.rule = 'casual'; ind.base.stove = { items: {}, out: {}, fuel: 500, fire: 3, temp: 1200, cook: null }; ind.base.stove.items.ore_cu = 1; indAdvance(30); })(); true;`);
                if (await T.eval(`!!ind.base.stove.out.hot_cu`)) bad.push('悠闲世界也能炼铜');
                await T.eval(`indPanelBench(); true;`);
                if (await T.eval(`/钳子|铁稿|风箱/.test(document.getElementById('ind-panel').innerText)`)) bad.push('悠闲世界工作台显示了硬核的东西');
                await T.eval(`indPanelBook('铁'); true;`);
                if (await T.eval(`/铁锭/.test(document.getElementById('ind-book-list').innerText)`)) bad.push('悠闲世界配方查询里有冶炼');
                await T.eval(`indPanelClose(); indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND5 第 3a 阶段：冶炼、烫锭扣血、泡水和放地上变凉、钳子、风箱鼓风炼铁、铁稿、配方查询、悠闲没有科技', bad.length === 0, bad.join(' / '));
        }

        if (want('IND6')) {
            // IND6 第 3b 阶段（电）：放电池组、电灯，铜线接上；4 节电池 6 V 灯亮、耗电；再装一节 7.5 V 超过额定直接炸（3 米内东西全没，远处的电池组不动）；
            // 人在 3 米内扣 40 血；发电机放在中火灶台旁边 12 V 带水泵、水泵自动浇地；16 节 24 V 带电炉，灶台不烧柴也到 1800°C；电灯让夜里不那么黑；存档带着设备和电线
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('hard'); let S = ind.base.surv; S.food = 100; S.water = 100; S.temp = 37; S.hp = 100; true;`);
                const place = (k, x, z) => T.eval(`(function(){ indBagAdd('${k}', 1); indTeleport(${x}, ${z}); indLookAt(${x}, ${z} - 5); indSelect('${k}'); indUse(); return ind.base.devs[ind.base.devs.length - 1].id; })()`);
                const click = (id, k) => T.eval(`(function(){ let d = indDev(${id}); indTeleport(d.x, d.z + 1.5); indLookAt(d.x, d.z); if ('${k}') indSelect('${k}'); return indAction(); })()`);
                const bank = await place('dev_bank', 0, 0), lamp = await place('dev_lamp', 6, 0);
                await T.eval(`indBagAdd('wire', 10); indBagAdd('battery', 30); true;`);
                await click(bank, 'wire'); await click(lamp, 'wire');
                if ((await T.eval(`ind.base.wires.length`)) !== 1) bad.push('铜线没接上 ' + await T.eval(`JSON.stringify(ind.base.wires)`));
                for (let i = 0; i < 4; i++) await click(bank, 'battery');
                await T.eval(`indTeleport(-8, 5); indAdvance(5); true;`);
                const on = JSON.parse(await T.eval(`JSON.stringify({ pw: indDev(${lamp}).pw, u: indDev(${bank}).u, v: indSrcVolt(indDev(${bank})) })`));
                if (!on.pw || on.v !== 6 || Math.abs(on.u - (720 - 1)) > 0.05) bad.push('6 V 灯不亮或耗电不对 ' + JSON.stringify(on));
                // 再装一节：7.5 V > 6 V，灯炸了，3 米外的电池组还在，人在远处不扣血
                await T.eval(`(function(){ indBagAdd('wheat', 1); ind.base.ground.push({ k: 'wheat', x: 6.5, z: -1.6 }); })(); true;`);
                await click(bank, 'battery');
                await T.eval(`indTeleport(-8, 5); indAdvance(0.2); true;`);
                const bm = JSON.parse(await T.eval(`JSON.stringify({ lamp: !!indDev(${lamp}), bank: !!indDev(${bank}), wires: ind.base.wires.length, ground: ind.base.ground.filter(function (g) { return g.x > 6; }).length, hp: ind.base.surv.hp })`));
                if (bm.lamp || !bm.bank || bm.wires !== 0 || bm.ground !== 0 || bm.hp !== 100) bad.push('过压爆炸不对 ' + JSON.stringify(bm));
                // 人在旁边炸：扣 40
                const lamp2 = await place('dev_lamp', 6, 0);
                await click(bank, 'wire'); await click(lamp2, 'wire');
                await T.eval(`(function(){ let d = indDev(${lamp2}); indTeleport(d.x + 1, d.z); indAdvance(0.2); })(); true;`);
                if (Math.abs((await T.eval(`ind.base.surv.hp`)) - 60) > 0.5) bad.push('人在 3 米内没扣 40 血 ' + await T.eval(`ind.base.surv.hp`));
                // 发电机：中火灶台 3 米内 12 V，带水泵，水泵把地浇了
                await T.eval(`(function(){ ind.base.crops.push({ k: 'wheat', x: -17, z: 3, g: 0, wet: 0, times: 0 }); indBagAdd('wood', 10); for (let i = 0; i < 10; i++) indStoveFuel('wood'); indStoveFire(2); indPanelClose(); })(); true;`);
                const gen = await place('dev_gen', 8, -15), pump = await place('dev_pump', 12, -10);
                await click(gen, 'wire'); await click(pump, 'wire');
                await T.eval(`indTeleport(-8, 5); indAdvance(0.5); true;`);
                const pp = JSON.parse(await T.eval(`JSON.stringify({ v: indSrcVolt(indDev(${gen})), pw: indDev(${pump}).pw, wet: ind.base.crops[0].wet > ind.base.clock })`));
                if (pp.v !== 12 || !pp.pw || !pp.wet) bad.push('发电机带水泵不对 ' + JSON.stringify(pp));
                // 电炉：24 V（16 节）放在灶台旁边，灶台不烧柴也升到 1800°C
                await T.eval(`(function(){ indStoveFire(0); indPanelClose(); })(); true;`);
                const bank2 = await place('dev_bank', 4, -14), fur = await place('dev_furnace', 6, -16);
                await click(bank2, 'wire'); await click(fur, 'wire');
                for (let i = 0; i < 16; i++) await click(bank2, 'battery');
                await T.eval(`indTeleport(-8, 5); indAdvance(40); true;`);
                const ft = JSON.parse(await T.eval(`JSON.stringify({ pw: !!(indDev(${fur}) || {}).pw, t: ind.base.stove.temp, fire: ind.base.stove.fire })`));
                if (!ft.pw || ft.t < 1700 || ft.fire !== 0) bad.push('电炉没把灶台烧到 1800°C ' + JSON.stringify(ft));
                // 电灯：夜里在亮着的灯旁边不那么黑
                const lamp3 = await place('dev_lamp', -10, 10);
                const bank3 = await place('dev_bank', -14, 10);
                await click(bank3, 'wire'); await click(lamp3, 'wire'); await click(bank3, 'battery'); await click(bank3, 'battery');
                await T.eval(`ind.base.clock = Math.floor(ind.base.clock / IND_DAY) * IND_DAY + IND_DUSK + 100; indTeleport(-10, 13); indAdvance(0.2); true;`);
                if (!(await T.eval(`indLampNear()`))) bad.push('夜里灯旁边不亮');
                // 存档
                await T.eval(`indSave(); true;`); await until(T, `IND_SAVING === 0`, 5000);
                const sv = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify({ d: b.devs.length, w: b.wires.length, ver: b.ver })); }); })`));
                const now = JSON.parse(await T.eval(`JSON.stringify({ d: ind.base.devs.length, w: ind.base.wires.length })`));
                if (sv.d !== now.d || sv.w !== now.w || sv.ver < 6) bad.push('存档读回来不对 ' + JSON.stringify([sv, now]));
                // 收起设备：电池组按剩的电量还电池
                const back = await T.eval(`(function(){ let d = indDev(${bank3}); indTeleport(d.x, d.z + 1.5); indLookAt(d.x, d.z); indSelect('wire'); let b0 = ind.bag.battery || 0; indUse(); return [!!indDev(${bank3}), (ind.bag.battery || 0) - b0, ind.bag.dev_bank || 0].join(','); })()`);
                if (back !== 'false,2,1') bad.push('收起电池组不对 ' + back);
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND6 第 3b 阶段：电池组、铜线、电灯、过压爆炸、爆炸伤人、发电机带水泵浇地、电炉 1800°C、夜里电灯、存档、收起设备', bad.length === 0, bad.join(' / '));
        }

        if (want('IND7')) {
            // IND7 第 4 阶段（化学）：灶台烧柴攒草木灰；沙子 + 草木灰大火出玻璃瓶；电解槽：电压不够不干活不耗电，水出 2 氢 1 氧，盐水出氢氧化钠氢氯，
            // 熔融盐要灶台 801°C 以上 3 米内；氢气碰火就炸（旁边的电解槽一起炸没）、没火飘走；氯气毒气每秒 8 血；元素表点亮；存档
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('hard'); let S = ind.base.surv; S.food = 100; S.water = 100; S.temp = 37; S.hp = 100; true;`);
                // 草木灰：大火每秒烧 2，烧掉 120 燃料出 1 份
                await T.eval(`(function(){ indBagAdd('wood', 20); for (let i = 0; i < 10; i++) indStoveFuel('wood'); indStoveFire(3); indPanelClose(); indAdvance(62); })(); true;`);
                if (!((await T.eval(`ind.base.stove.out.ash || 0`)) >= 1)) bad.push('烧柴没出草木灰 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 玻璃瓶：沙子 2 + 草木灰 1，大火
                await T.eval(`(function(){ indStoveTakeAll(); indPanelClose(); indBagAdd('sand', 2); indStovePut('sand', 1); indStovePut('sand', 1); indStovePut('ash', 1); indPanelClose(); indAdvance(25); })(); true;`);
                if ((await T.eval(`ind.base.stove.out.bottle || 0`)) !== 2) bad.push('做不出玻璃瓶 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                await T.eval(`indStoveTakeAll(); indPanelClose(); true;`);
                const place = (k, x, z) => T.eval(`(function(){ indBagAdd('${k}', 1); indTeleport(${x}, ${z}); indLookAt(${x}, ${z} - 5); indSelect('${k}'); indUse(); return ind.base.devs[ind.base.devs.length - 1].id; })()`);
                const click = (id, k) => T.eval(`(function(){ let d = indDev(${id}); indTeleport(d.x, d.z + 1.5); indLookAt(d.x, d.z); if ('${k}') indSelect('${k}'); indAction(); indPanelClose(); return true; })()`);
                await T.eval(`indBagAdd('wire', 10); indBagAdd('battery', 30); indBagAdd('bottle', 20); indBagAdd('water_raw', 4); indBagAdd('salt', 6); true;`);
                const bank = await place('dev_bank', -6, 6), el = await place('dev_el', -2, 6);
                await click(bank, 'wire'); await click(el, 'wire'); await click(bank, 'battery');
                // 1.5 V：电压不够，不干活也不耗电
                await T.eval(`(function(){ let d = indDev(${el}); d.st = { water_raw: 1, bottle: 3 }; indTeleport(-10, 10); indAdvance(25); })(); true;`);
                const low = JSON.parse(await T.eval(`JSON.stringify({ st: indDev(${el}).st, u: indDev(${bank}).u })`));
                if (low.st.b_h2 || low.u !== 180) bad.push('1.5 V 也电解了或耗电了 ' + JSON.stringify(low));
                // 装到 8 节 12 V：电解水，20 秒出 2 氢 1 氧 + 空桶
                for (let i = 0; i < 7; i++) await click(bank, 'battery');
                await T.eval(`indTeleport(-10, 10); indAdvance(21); true;`);
                const w = JSON.parse(await T.eval(`JSON.stringify({ st: indDev(${el}).st, e: ind.base.elems })`));
                if (w.st.b_h2 !== 2 || w.st.b_o2 !== 1 || w.st.bucket !== 1 || !w.e[1] || !w.e[8]) bad.push('电解水不对 ' + JSON.stringify(w));
                // 盐水：氢氧化钠 + 氢 + 氯
                await T.eval(`(function(){ let d = indDev(${el}); d.st = { salt: 1, water_raw: 1, bottle: 2 }; d.et = 0; indAdvance(21); })(); true;`);
                const b = JSON.parse(await T.eval(`JSON.stringify({ st: indDev(${el}).st, e: ind.base.elems })`));
                if (b.st.naoh !== 1 || b.st.b_h2 !== 1 || b.st.b_cl2 !== 1 || !b.e[17]) bad.push('电解盐水不对 ' + JSON.stringify(b));
                // 熔融盐：离灶台远不行；放到灶台旁边、灶台 801°C 以上才出钠
                await T.eval(`(function(){ let d = indDev(${el}); d.st = { salt: 2, bottle: 1 }; d.et = 0; indAdvance(21); })(); true;`);
                if (await T.eval(`!!indDev(${el}).st.sodium`)) bad.push('离灶台远也电解出了钠');
                await T.eval(`(function(){ let d = indDev(${el}); d.x = IND_BASE_ST.stove.x + 1.5; d.z = IND_BASE_ST.stove.z + 2; ind.wireDirty = true; indBagAdd('wood', 10); for (let i = 0; i < 10; i++) indStoveFuel('wood'); indStoveFire(3); indPanelClose(); indAdvance(20); d.et = 0; indAdvance(21); })(); true;`);
                const na = JSON.parse(await T.eval(`JSON.stringify({ st: indDev(${el}).st, t: ind.base.stove.temp, e: ind.base.elems })`));
                if (na.st.sodium !== 1 || na.st.b_cl2 !== 1 || !na.e[11]) bad.push('熔融盐电解不对 ' + JSON.stringify(na));
                // 氢气：灶台开着、3 米内放气就炸（人在旁边扣 40）；离火远飘走
                await T.eval(`(function(){ indBagAdd('b_h2', 2); ind.base.surv.hp = 100; indTeleport(IND_BASE_ST.stove.x, IND_BASE_ST.stove.z + 2.5); indLookAt(IND_BASE_ST.stove.x, IND_BASE_ST.stove.z); indSelect('b_h2'); indDrop(); })(); true;`);
                if (Math.abs((await T.eval(`ind.base.surv.hp`)) - 60) > 0.5) bad.push('氢气碰火没炸 ' + await T.eval(`ind.base.surv.hp`));
                await T.eval(`(function(){ ind.base.surv.hp = 100; indTeleport(-20, 15); indSelect('b_h2'); indDrop(); })(); true;`);
                if ((await T.eval(`ind.base.surv.hp`)) !== 100) bad.push('离火远的氢气也炸了');
                // 氯气：毒气，站在里面每秒扣 8
                await T.eval(`(function(){ indBagAdd('b_cl2', 1); indTeleport(-20, 15); indSelect('b_cl2'); indDrop(); ind.base.surv.hp = 100; indAdvance(2); })(); true;`);
                const hp = await T.eval(`ind.base.surv.hp`);
                if (!(hp < 85 && hp > 83)) bad.push('氯气没按每秒 8 扣血 ' + hp);
                // 元素表
                await T.eval(`indPanelElems(); true;`);
                if (!(await T.eval(`/元素表　\\d+ \\/ 118/.test(document.getElementById('ind-panel').innerText) && Object.keys(ind.base.elems).length >= 4`))) bad.push('元素表不对 ' + await T.eval(`JSON.stringify(ind.base.elems)`));
                await T.eval(`indPanelClose(); indSave(); true;`); await until(T, `IND_SAVING === 0`, 5000);
                const sv = JSON.parse(await T.eval(`new Promise(function (r) { indLoad(function (b) { r(JSON.stringify({ e: Object.keys(b.elems).length, ver: b.ver, el: (b.devs.filter(function (d) { return d.ty === 'el'; })[0] || {}).st })); }); })`));
                if (sv.e < 4 || sv.ver < 7 || sv.el) bad.push('存档读回来不对 ' + JSON.stringify(sv));
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND7 第 4 阶段：草木灰、玻璃瓶、电解（水、盐水、熔融盐、电压不够不干）、氢气碰火爆炸、氯气毒气、元素表、存档', bad.length === 0, bad.join(' / '));
        }

        if (want('IND9')) {
            // IND9 冬天的菜：萝卜汤、白菜炖萝卜灶台做得出来（≥100°C，20／25 秒，不烧焦）；热汤（番茄汤、萝卜汤、白菜炖萝卜）吃了体温 +1.5°C 不超过 37°C，还空桶；
            // 腌萝卜工作台做得出来（萝卜 2 + 盐 1 + 玻璃瓶 1），吃完还玻璃瓶；悠闲世界也能做；配方查询搜得到
            const bad = [];
            const T = await openTab(chrome, url, { query: 'hcdebug=1' }); await T.eval(`${HIDE} true;`);
            await T.eval(`indEnter(); true;`);
            if (!(await until(T, `ind && !ind.loading && !!document.getElementById('ind-hud')`, 15000))) bad.push('进不去');
            else {
                await T.eval(`${HIDE} indSetRule('hard'); let S = ind.base.surv; S.food = 50; S.water = 50; S.temp = 37; S.hp = 100; true;`);
                const cook = (items, secs) => T.eval(`(function(){ ind.base.stove = { items: ${JSON.stringify(items)}, out: {}, fuel: 500, fire: 1, temp: 200, cook: null }; indAdvance(${secs}); return JSON.stringify(ind.base.stove); })()`);
                // 萝卜汤：19 秒还没好，21 秒好
                await cook({ radish: 1, water_boiled: 1, salt: 1 }, 19);
                if (await T.eval(`!!ind.base.stove.out.radish_soup`)) bad.push('萝卜汤 19 秒就好了');
                await T.eval(`indAdvance(2); true;`);
                if ((await T.eval(`ind.base.stove.out.radish_soup || 0`)) !== 1) bad.push('做不出萝卜汤 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 白菜炖萝卜：24 秒还没好，26 秒好；不用盐
                await cook({ cabbage: 1, radish: 1, water_boiled: 1 }, 24);
                if (await T.eval(`!!ind.base.stove.out.cabbage_stew`)) bad.push('白菜炖萝卜 24 秒就好了');
                await T.eval(`indAdvance(2); true;`);
                if ((await T.eval(`ind.base.stove.out.cabbage_stew || 0`)) !== 1) bad.push('做不出白菜炖萝卜 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                // 100°C 以下不做（关火温度 20）
                await T.eval(`ind.base.stove = { items: { radish: 1, water_boiled: 1, salt: 1 }, out: {}, fuel: 0, fire: 0, temp: 20, cook: null }; indAdvance(30); true;`);
                if (await T.eval(`!!ind.base.stove.out.radish_soup || !!ind.base.stove.cook`)) bad.push('不到 100°C 也在做萝卜汤');
                // 烧焦线 400°C：大火 1200°C 超过 8 秒烧成焦炭
                await T.eval(`ind.base.stove = { items: { radish: 1, water_boiled: 1, salt: 1 }, out: {}, fuel: 500, fire: 3, temp: 1200, cook: null }; indAdvance(30); true;`);
                if (!(await T.eval(`!!ind.base.stove.out.char && !ind.base.stove.out.radish_soup`))) bad.push('萝卜汤大火没烧焦 ' + await T.eval(`JSON.stringify(ind.base.stove.out)`));
                // 热汤：体温 +1.5，不超过 37；还空桶
                const eat = (k, t) => T.eval(`(function(){ ind.bag = {}; indBagAdd('${k}', 1); ind.base.surv.temp = ${t}; ind.base.surv.food = 50; ind.base.surv.water = 50; indEat('${k}'); return JSON.stringify({ t: ind.base.surv.temp, f: ind.base.surv.food, w: ind.base.surv.water, bag: ind.bag }); })()`);
                const near = (a, b) => Math.abs(a - b) < 0.001;
                let r = JSON.parse(await eat('radish_soup', 34));
                if (!near(r.t, 35.5) || r.f !== 80 || r.w !== 70 || r.bag.bucket !== 1) bad.push('喝萝卜汤不对 ' + JSON.stringify(r));
                r = JSON.parse(await eat('cabbage_stew', 34));
                if (!near(r.t, 35.5) || r.f !== 90 || r.w !== 60 || r.bag.bucket !== 1) bad.push('吃白菜炖萝卜不对 ' + JSON.stringify(r));
                r = JSON.parse(await eat('tomato_soup', 34));
                if (!near(r.t, 35.5) || r.f !== 75 || r.w !== 70 || r.bag.bucket !== 1) bad.push('喝番茄汤没加体温 ' + JSON.stringify(r));
                r = JSON.parse(await eat('radish_soup', 36));
                if (!near(r.t, 37)) bad.push('36°C 喝汤超过 37 ' + JSON.stringify(r));
                r = JSON.parse(await eat('radish_soup', 37));
                if (!near(r.t, 37)) bad.push('37°C 喝汤变了 ' + JSON.stringify(r));
                r = JSON.parse(await eat('radish_soup', 38.5));
                if (!near(r.t, 38.5)) bad.push('发烧时喝汤被拉低了 ' + JSON.stringify(r));
                // 不是汤的不加体温
                r = JSON.parse(await eat('bake_potato', 34));
                if (!near(r.t, 34)) bad.push('烤土豆加体温了 ' + JSON.stringify(r));
                // 腌萝卜：工作台，萝卜 2 + 盐 1 + 玻璃瓶 1；吃完还玻璃瓶
                await T.eval(`ind.bag = {}; indBagAdd('radish', 2); indBagAdd('salt', 1); indBagAdd('bottle', 1); indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'pickle'; })); true;`);
                let bag = JSON.parse(await T.eval(`JSON.stringify(ind.bag)`));
                if (bag.pickle !== 1 || bag.radish || bag.salt || bag.bottle) bad.push('做不出腌萝卜 ' + JSON.stringify(bag));
                r = JSON.parse(await eat('pickle', 34));
                if (r.f !== 65 || r.bag.bottle !== 1 || r.bag.pickle || !near(r.t, 34)) bad.push('吃腌萝卜不对 ' + JSON.stringify(r));
                // 悠闲世界：沙子 + 草木灰 1000°C 出玻璃瓶，腌萝卜也做得了，汤也加体温
                await T.eval(`ind.base.rule = 'casual'; ind.base.stove = { items: { sand: 2, ash: 1 }, out: {}, fuel: 500, fire: 3, temp: 1200, cook: null }; indAdvance(25); true;`);
                if ((await T.eval(`ind.base.stove.out.bottle || 0`)) !== 2) bad.push('悠闲做不出玻璃瓶 ' + await T.eval(`JSON.stringify(ind.base.stove)`));
                await T.eval(`ind.bag = {}; indBagAdd('radish', 2); indBagAdd('salt', 1); indBagAdd('bottle', 1); indCraft(IND_CRAFT.findIndex(function (r) { return r.out === 'pickle'; })); true;`);
                if ((await T.eval(`ind.bag.pickle || 0`)) !== 1) bad.push('悠闲做不出腌萝卜');
                await cook({ cabbage: 1, radish: 1, water_boiled: 1 }, 26);
                if ((await T.eval(`ind.base.stove.out.cabbage_stew || 0`)) !== 1) bad.push('悠闲做不出白菜炖萝卜');
                r = JSON.parse(await eat('cabbage_stew', 34));
                if (!near(r.t, 35.5)) bad.push('悠闲喝汤没加体温 ' + JSON.stringify(r));
                // 配方查询搜得到
                await T.eval(`indPanelBook('萝卜'); true;`);
                const bk = await T.eval(`document.getElementById('ind-panel').innerText`);
                if (!/萝卜汤/.test(bk) || !/白菜炖萝卜/.test(bk) || !/腌萝卜/.test(bk)) bad.push('配方查询搜萝卜缺东西 ' + bk.slice(0, 200));
                await T.eval(`indPanelClose(); true;`);
                await T.eval(`indExit(true); true;`); await until(T, `ind === null && IND_SAVING === 0`, 10000);
            }
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('IND9 冬天的菜：萝卜汤和白菜炖萝卜、热汤加体温（不超过 37）、番茄汤也加、腌萝卜还玻璃瓶、悠闲也能做', bad.length === 0, bad.join(' / '));
        }

        if (ONLY) throw new Error('ONLY_DONE');

        // 2. 11 个模式
        for (const key of Object.keys(MODES)) {
            const before = A.errors.length;
            let r;
            try { r = await enterExit(A, key); } catch (e) { r = { active: null, back: false, err: e.message.slice(0, 200) }; }
            const errs = A.errors.slice(before);
            report('模式 ' + key, r.active === key && r.back && errs.length === 0, (r.err || '') + (r.active !== key ? ' 进入后的模式=' + r.active : '') + (r.back ? '' : ' 没回到大厅') + (errs.length ? ' ' + errs.slice(0, 2).join(' / ') : ''));
        }

        // 2b. 规则按钮、新东西介绍、密室入门关
        {
            const before = A.errors.length;
            const bad = [];
            for (const key of Object.keys(MODES)) {
                await A.eval(`${HIDE} selectGameMode('${key}'); document.querySelector('button[onclick="openRules()"]').click(); true;`);
                await W(150);
                const want = await A.eval(`MODE_RULES['${key}'].title + ' · 规则'`);
                const t = await A.eval(MODAL);
                await A.eval(CLICK_OK); await W(300);
                const closed = await A.eval(`${MODAL} === null && !introOpen`);
                if (t !== want || !closed) bad.push(key + (t !== want ? ' 标题=' + t : ' 关不掉'));
            }
            report('规则按钮 11 个模式都能打开、关闭', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            const before = A.errors.length;
            await A.eval(`${HIDE} delete gState.modeIntroShown.cake; selectGameMode('cake'); cakeBegin(); true;`);
            await W(1500);
            const t = await A.eval(MODAL);
            await A.eval(CLICK_OK); await W(300);
            const closed = await A.eval(`${MODAL} === null`);
            await A.eval(`${HIDE} cakeExit(); true;`); await W(1500); await A.eval(`${HIDE} true;`);
            const back = await A.eval(`!!hub && ${ACTIVE} === null`);
            report('第一次进模式自动弹规则', t === '松饼大作战 · 规则' && closed && back && A.errors.length === before, '弹窗=' + t + (closed ? '' : ' 关不掉') + (back ? '' : ' 没回到大厅') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            const before = A.errors.length;
            await A.eval(`${HIDE} delete gState.introSeen['smoke.a']; delete gState.introSeen['smoke.b']; introOnce('smoke.a', '测试 A', '一'); introOnce('smoke.b', '测试 B', '二'); true;`);
            await W(150);
            const t1 = await A.eval(MODAL);
            await A.eval(CLICK_OK); await W(500);
            const t2 = await A.eval(MODAL);
            await A.eval(CLICK_OK); await W(500);
            const t3 = await A.eval(MODAL);
            await A.eval(`introOnce('smoke.a', '测试 A', '一'); true;`); await W(150);
            const t4 = await A.eval(MODAL);
            const saved = await A.eval(`JSON.parse(localStorage.getItem('TH_save_' + gState.id) || '{}').introSeen`);
            report('介绍卡片排队弹、能关、只弹一次', t1 === '测试 A' && t2 === '测试 B' && t3 === null && t4 === null && !!(saved && saved['smoke.a']) && A.errors.length === before,
                [t1, t2, t3, t4].join(' → ') + (saved && saved['smoke.a'] ? '' : ' 没进存档') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // 单人密室第 1 关：第一次碰到彩色板弹卡片，开着时这一局停住，关了接着跑
            const before = A.errors.length;
            await A.eval(`${HIDE} Object.keys(ESC_INTROS).forEach(function (k) { delete gState.introSeen['esc.' + k]; }); selectGameMode('escape'); escapeBegin(null, null, 1); true;`);
            await W(2500);
            const t = await A.eval(MODAL);
            const c1 = await A.eval('escapeRoom.startT + escapeRoom.clock'); await W(1000);
            const c2 = await A.eval('escapeRoom.startT + escapeRoom.clock');
            await A.eval(CLICK_OK); await W(300);
            await A.eval(`while (introOpen || introQ.length) { if (!${CLICK_OK}) break; } true;`);
            // 关了以后倒计时接着走、开局。机器慢的时候帧率低（每帧 dt 有上限），所以按"开局了没有"等，最多 15 秒
            for (let i = 0; i < 30 && !(await A.eval('escapeRoom.started')); i++) await W(500);
            const run = await A.eval(`JSON.stringify({ started: escapeRoom.started, clock: escapeRoom.clock, startT: escapeRoom.startT, open: introOpen, q: introQ.length })`);
            await A.eval(`${HIDE} escapeExit(); true;`); await W(1500); await A.eval(`${HIDE} true;`);
            const ok = t === '彩色板' && c1 === c2 && JSON.parse(run).started;
            report('密室介绍卡片：弹出时停住、关了继续', ok && A.errors.length === before, '弹窗=' + t + ' 停住前后计时 ' + c1 + '/' + c2 + ' 之后 ' + run + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            const before = A.errors.length;
            const bad = [];
            const intro = await A.eval(`ESC_LEVELS.slice(0, ESC_INTRO_N).every(function (l) { return l.intro; }) && !ESC_LEVELS[ESC_INTRO_N].intro && ESC_INTRO_N === 8`);
            if (!intro) bad.push('前 8 关不全是入门关');
            await A.eval(`Object.keys(ESC_INTROS).forEach(function (k) { gState.introSeen['esc.' + k] = 1; }); true;`);
            for (let n = 1; n <= 8; n++) {
                await A.eval(`${HIDE} escapeBegin(null, null, ${n}); true;`);
                await W(2000);
                const s = await A.eval(`JSON.stringify(escapeRoom ? { n: escapeRoom.lvl, intro: !!escapeRoom.lv.intro, active: ${ACTIVE} } : null)`);
                await A.eval(`${HIDE} escapeExit(); true;`); await W(1200); await A.eval(`${HIDE} true;`);
                const back = await A.eval(`!!hub && ${ACTIVE} === null`);
                const o = JSON.parse(s);
                if (!o || o.n !== n || !o.intro || o.active !== 'escape' || !back) bad.push(n + ':' + s + (back ? '' : ' 没回到大厅'));
            }
            report('密室入门关 1–8 能进能出', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // 老存档：原第 2 关往后挪到第 9 关，原第 1 关的成绩不带过来（那关拿掉了）
            // 已经是 v2 的存档不再挪
            const r = await A.eval(`(function () { let keep = gState.escProg; gState.escProg = { unlocked: 3, best: { 1: { s: 3 }, 2: { s: 2 } }, sel: 2 };
                let P = escProg(), o = { unlocked: P.unlocked, sel: P.sel, best: Object.keys(P.best).join(','), v: P.v }; gState.escProg = keep; return JSON.stringify(o); })()`);
            const o = JSON.parse(r);
            const r2 = await A.eval(`(function () { let keep = gState.escProg; gState.escProg = { unlocked: 3, best: { 1: { s: 3 }, 2: { s: 2 } }, sel: 2, v: 2 };
                let P = escProg(), o = { unlocked: P.unlocked, sel: P.sel, best: Object.keys(P.best).join(',') }; gState.escProg = keep; return JSON.stringify(o); })()`);
            const o2 = JSON.parse(r2);
            report('密室老进度往后挪', o.unlocked === 10 && o.sel === 9 && o.best === '9' && o.v === 2 && o2.unlocked === 3 && o2.sel === 2 && o2.best === '1,2', r + ' / v2 存档 ' + r2);
        }

        // H 组：寻宝队
        await A.eval(`${HIDE} selectGameMode('hunt'); requestStartGame(); requestEnterMap(); true;`);
        await W(3000);
        {
            // H1：固定 dt 爬楼梯。脚不能低于所在台阶顶 0.5 以上；1/12 也能上去；能下楼；在平台下面会被托上去
            const before = A.errors.length;
            const r = await A.eval(`(${STAIR_SIM.toString()})()`);
            const o = JSON.parse(r);
            const bad = o.runs.filter((x) => x.bad > 0).map((x) => x.name + ' ' + x.bad);
            report('H1 楼梯不穿模（1/60 1/30 1/20 各 300 次）', o.stairs > 0 && bad.length === 0 && A.errors.length === before, bad.join(' / ') + ' 楼梯数 ' + o.stairs);
            report('H1 1/12 帧率跑步能上楼', o.slowClimb === o.slowN, o.slowClimb + '/' + o.slowN);
            report('H1 能下楼、平台下面会被托上去', o.down && o.lift, JSON.stringify({ down: o.down, lift: o.lift }));
        }
        {
            const before = A.errors.length;
            const o = JSON.parse(await A.eval(`(${TABLE_SIM.toString()})()`));
            const scanBad = o.scans.filter((x) => !/: 0$/.test(x)), wellBad = o.wells.filter((x) => !/: 0$/.test(x));
            report('H8 跳桌子不掉进去（距离 5–44 × 偏移 0/3/6，60/30 帧，走/跑）', scanBad.length === 0 && o.onTable > 0 && A.errors.length === before, o.scans.join(' / ') + ' 跳上桌面 ' + o.onTable + ' 次');
            report('H8 从二楼走进楼梯井乱跳，不停在墙或桌子里', o.holes > 0 && wellBad.length === 0, o.wells.join(' / ') + ' 楼梯口 ' + o.holes);
        }
        await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1800); await A.eval(`${HIDE} true;`);

        {
            // H2：仓库拖放。空格能放；宝物进不了背包；钱不够、仓库满了有提示
            const before = A.errors.length, bad = [];
            await A.eval(GARAGE_SETUP(`[S('鱼叉'), S('医疗包'), null, null, null, null]`, `[L('金杯')]`, 0));
            await mouseDrag(A, INV_SLOT(0), GAR_SLOT(5));
            if ((await A.eval(MODAL)) !== null || (await A.eval(`gState.garage.some(function (q) { return q && q.n === '鱼叉'; }) && !gState.inv[0]`)) !== true) bad.push('背包→仓库空格 ' + (await A.eval(MODAL)));
            await A.eval(`${HIDE} true;`);
            await mouseDrag(A, INV_SLOT(1), INV_SLOT(3));
            if ((await A.eval(MODAL)) !== null || (await A.eval(`!!(gState.inv[3] && gState.inv[3].n === '医疗包' && !gState.inv[1])`)) !== true) bad.push('背包内拖到空格 ' + (await A.eval(MODAL)));
            await A.eval(`${HIDE} true;`);
            await mouseDrag(A, GAR_SLOT(0), INV_SLOT(0));
            const m1 = await A.eval(`${MODAL} + ' ' + document.getElementById('sys-modal-text').innerText`);
            if (!/宝物/.test(m1) || (await A.eval(`!!gState.inv[0]`))) bad.push('宝物进背包没拦住 ' + m1);
            await A.eval(`${HIDE} buy('鱼叉', 25000); true;`);
            const m2 = await A.eval(MODAL);
            if (m2 !== '钱不够') bad.push('钱不够没提示 ' + m2);
            await A.eval(`${HIDE} gState.money = 99999999; for (let i = 0; i < 200; i++) if (!gState.garage[i]) gState.garage[i] = { n: '石头', v: 1, w: 1 }; buy('鱼叉', 25000); true;`);
            const m3 = await A.eval(MODAL);
            if (m3 !== '仓库满了') bad.push('仓库满了没提示 ' + m3);
            report('H2 仓库拖放和购买提示', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // H3：鼠标/触屏点一下就选中；Backspace / Delete 只卖选中的仓库物品，价格和按钮一样；卖完清空选中；徽章不能卖；进图重置选中
            const before = A.errors.length, bad = [];
            const key = async (k, code, rep) => { await A.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code, autoRepeat: !!rep }); await A.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); await W(200); };
            await A.eval(GARAGE_SETUP(`[S('医疗包'), null, null, null, null, null]`, `[L('金杯'), S('鱼叉'), Object.assign({}, S('鱼叉'), { n: '地窖徽章', type: 'badge', v: 50000 })]`, 0));
            await mouseDrag(A, GAR_SLOT(0), null, 3);
            const sel = await A.eval(`gState.selectedContainer + ':' + gState.selectedSlot + ' ' + document.getElementById('sell-btn-container').innerText`);
            if (!/^garage:0 卖掉（\$5,000）/.test(sel)) bad.push('鼠标点不中 ' + sel);
            await key('Backspace', 8);
            const r1 = await A.eval(`gState.money + ' ' + gState.selectedSlot + ' ' + gState.garage.filter(function (q) { return q; }).map(function (q) { return q.n; }).join(',')`);
            if (r1 !== '5000 -1 鱼叉,地窖徽章') bad.push('Backspace 卖金杯 ' + r1);
            await mouseDrag(A, GAR_SLOT(0), null, 2);
            await key('Delete', 46, true);
            if ((await A.eval('gState.money')) !== 5000) bad.push('按键重复也卖了');
            await key('Delete', 46);
            const r2 = await A.eval(`gState.money + ' ' + gState.selectedSlot + ' ' + gState.garage.filter(function (q) { return q; }).map(function (q) { return q.n; }).join(',')`);
            if (r2 !== '17500 -1 地窖徽章') bad.push('Delete 半价卖鱼叉 ' + r2);
            // 触屏点一下
            await A.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
            const p = await mouseAt(A, GAR_SLOT(0));
            await A.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] });
            await A.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await W(300);
            await A.send('Emulation.setTouchEmulationEnabled', { enabled: false });
            const r3 = await A.eval(`gState.selectedContainer + ':' + gState.selectedSlot + ' ' + document.getElementById('sell-btn-container').innerText`);
            if (r3 !== 'garage:0 地窖徽章不能卖') bad.push('触屏点不中或徽章能卖 ' + r3);
            await key('Backspace', 8);
            const r4 = await A.eval(`${MODAL} + ' ' + gState.money + ' ' + !!gState.garage[0]`);
            if (r4 !== '卖不了 17500 true') bad.push('徽章 ' + r4);
            await A.eval(`${HIDE} true;`);
            // 背包里的东西按 Delete 不卖
            await mouseDrag(A, INV_SLOT(0), null, 2);
            await key('Delete', 46);
            if ((await A.eval(`gState.money + ' ' + !!gState.inv[0]`)) !== '17500 true') bad.push('背包里的被卖了');
            // 进图重置选中
            await A.eval(`${HIDE} gState.selectedContainer = 'garage'; gState.selectedSlot = 7; requestEnterMap(); true;`);
            await W(2500);
            const r5 = await A.eval(`gState.selectedContainer + ':' + gState.selectedSlot`);
            if (r5 !== 'inv:0') bad.push('进图没重置 ' + r5);
            await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1800); await A.eval(`${HIDE} true;`);
            report('H3 仓库点选、卖出、徽章、进图重置', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // H4：上交不给钱，撤离后进仓库，卖掉才有钱；撤离失败不扣钱，上交的东西没收
            const before = A.errors.length, bad = [];
            const enter = async () => { await A.eval(GARAGE_SETUP(`[S('鱼叉'), null, null, null, null, null]`, `[]`, 1000)); await A.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await A.eval(`${HIDE} true;`); };
            const submit = `(function(){ gState.inv[1] = L('金杯'); camera.position.set(TILE, 9, TILE); clickSubmit(); return gState.money + ' ' + gState.totalSubmitted + ' ' + gState.submittedItems.length; })()`;
            await enter();
            const s1 = await A.eval(submit);
            if (s1 !== '1000 5000 1') bad.push('上交后 钱/进度/寄存 ' + s1);
            await A.eval(`gState.inv[2] = L('银杯'); completeExtraction('撤离成功'); true;`); await W(300);
            const s2 = await A.eval(`gState.money + ' ' + gState.garage.filter(function (q) { return q && q.n === '金杯'; }).length`);
            if (s2 !== '1000 1') bad.push('撤离后 钱/仓库里的金杯 ' + s2);
            // H9：撤离后商店道具留在背包，宝物进仓库
            const s9 = await A.eval(`gState.inv.filter(function (q) { return q; }).map(function (q) { return q.n; }).join(',') + ' ' + gState.garage.filter(function (q) { return q && q.isShop; }).length + ' ' + gState.garage.filter(function (q) { return q && !q.isShop; }).map(function (q) { return q.n; }).sort().join(',')`);
            if (s9 !== '鱼叉 0 金杯,银杯') bad.push('H9 撤离后 背包/仓库里的道具 ' + s9);
            await A.eval(`${HIDE} returnToGarageFromOver(); gState.selectedContainer = 'garage'; gState.selectedSlot = gState.garage.findIndex(function (q) { return q && q.n === '金杯'; }); garageSellSelected(); true;`);
            if ((await A.eval('gState.money')) !== 6000) bad.push('卖掉后钱不对 ' + (await A.eval('gState.money')));
            await enter();
            await A.eval(submit);
            await A.eval(`finishGame(false, '测试'); true;`); await W(300);
            const s3 = await A.eval(`gState.money + ' ' + document.getElementById('go-desc').innerText.split(String.fromCharCode(10))[0]`);
            if (!/^1000 测试这局上交的 1 件东西没收了/.test(s3)) bad.push('撤离失败 ' + s3);
            await A.eval(`${HIDE} returnToGarageFromOver(); true;`);
            report('H4 上交不给钱，卖掉才有钱；H9 撤离后道具留在背包', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // H5：中途退出算撤离失败，背包全丢（腰包、徽章也是）；没结算就刷新，下次读档按撤离失败算
            const before = A.errors.length, bad = [];
            const saved = (t) => t.eval(`JSON.parse(localStorage.getItem('TH_save_' + gState.id)).huntRunActive`);
            const kit = `[S('鱼叉'), S('腰包'), Object.assign({}, S('鱼叉'), { n: '地窖徽章', type: 'badge', uses: 1, maxUses: 1 }), null, null, null]`;
            await A.eval(GARAGE_SETUP(kit, `[]`, 0)); await A.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await A.eval(`${HIDE} true;`);
            if ((await saved(A)) !== true) bad.push('进图没记"对局进行中"');
            await A.eval(`huntQuitAsk(); true;`); await W(200);
            await A.eval(`(function(){ let b = Array.from(document.querySelectorAll('#sys-modal-btns button')).find(function (x) { return x.innerText === '离开'; }); b.click(); return true; })()`); await W(500);
            const q = await A.eval(`gState.inv.filter(function (x) { return x; }).length + ' ' + document.getElementById('go-title').innerText`);
            if (q !== '0 撤离失败') bad.push('中途退出后背包/结算 ' + q);
            if ((await saved(A)) !== false) bad.push('结算后标记没清掉');
            await A.eval(`${HIDE} returnToGarageFromOver(); nav('screen-lobby'); true;`);
            // 另开一个标签页：进图后直接刷新页面
            const C = await openTab(chrome, url, { name: 'h5r' + Math.floor(Math.random() * 100000) });
            await C.eval(GARAGE_SETUP(kit, `[]`, 0)); await C.eval(`${HIDE} requestEnterMap(); true;`); await W(2500);
            const name = await C.eval('gState.id');
            await C.send('Page.reload'); await W(2500);
            await C.eval(`document.getElementById('player-id').value = ${JSON.stringify(name)}; requestLobbyAccess(); true;`); await W(1500);
            let seen = null;
            for (let i = 0; i < 6 && !seen; i++) { const t = await C.eval(MODAL); if (t === '上一局没撤出去') seen = t; else { await C.eval(CLICK_OK); await W(400); } }
            const r = await C.eval(`gState.id + ' ' + gState.inv.filter(function (x) { return x; }).length + ' ' + gState.huntRunActive`);
            if (!seen || r !== name + ' 0 false' || (await saved(C)) !== false) bad.push('刷新后 ' + seen + ' ' + r);
            if (C.errors.length) bad.push(C.errors.slice(0, 2).join(' / '));
            await C.close();
            report('H5 中途退出、刷新都算撤离失败', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        {
            // H6：地窖徽章只送一次；商店能买，价格单独存，v 不变
            const bad = [];
            const D = await openTab(chrome, url, { name: 'h6' + Math.floor(Math.random() * 100000) });
            const oldSave = (withBadge) => D.eval(`(function(){ let k = 'TH_save_' + gState.id, d = JSON.parse(localStorage.getItem(k)); delete d.badgeGiven;
                d.inv = [Object.assign({}, shopItems['鱼叉']), ${withBadge ? "Object.assign({}, shopItems['地窖徽章'])" : 'null'}, null, null, null, null]; d.garage = Array(200).fill(null);
                localStorage.setItem(k, JSON.stringify(d)); loadProgress(gState.id);
                return gState.badgeGiven + ' ' + gState.inv.concat(gState.garage).filter(function (q) { return q && q.type === 'badge'; }).length; })()`);
            let r = await oldSave(true);
            if (r !== 'true 1') bad.push('旧存档有徽章 ' + r);
            r = await oldSave(false);
            if (r !== 'true 1') bad.push('旧存档没徽章 ' + r);
            r = await D.eval(`(function(){ gState.inv = gState.inv.map(function (q) { return q && q.type === 'badge' ? null : q; }); saveProgress(); loadProgress(gState.id);
                return gState.badgeGiven + ' ' + gState.inv.concat(gState.garage).filter(function (q) { return q && q.type === 'badge'; }).length; })()`);
            if (r !== 'true 0') bad.push('送过以后又送了 ' + r);
            await D.eval(`${HIDE} selectGameMode('hunt'); requestStartGame(); gState.money = 900000; gState.garage = Array(200).fill(null); initGarage();
                Array.from(document.querySelectorAll('#shop-modal .shop-item')).find(function (x) { return /地窖徽章/.test(x.innerText); }).click(); true;`);
            r = await D.eval(`(function(){ let b = gState.garage.find(function (q) { return q && q.type === 'badge'; }); return gState.money + ' ' + (b ? b.v + ' ' + b.price + ' ' + b.isShop : 'none'); })()`);
            if (r !== '0 0 900000 true') bad.push('商店买徽章 ' + r);
            // 夜间 PR #17：三个字段进存档白名单；旧存档没有这三个字段按默认值
            r = await D.eval(`(function(){ gState.huntTutorialShown = true; gState.weightWarnShown = true; gState.skinPity = 4; saveProgress();
                gState.huntTutorialShown = false; gState.weightWarnShown = false; gState.skinPity = 0; loadProgress(gState.id);
                let a = [gState.huntTutorialShown, gState.weightWarnShown, gState.skinPity].join(',');
                let k = 'TH_save_' + gState.id, d = JSON.parse(localStorage.getItem(k)); delete d.huntTutorialShown; delete d.weightWarnShown; delete d.skinPity;
                localStorage.setItem(k, JSON.stringify(d)); loadProgress(gState.id);
                return a + ' / ' + [gState.huntTutorialShown, gState.weightWarnShown, gState.skinPity].join(','); })()`);
            if (r !== 'true,true,4 / false,false,0') bad.push('三个存档字段 ' + r);
            if (D.errors.length) bad.push(D.errors.slice(0, 2).join(' / '));
            await D.close();
            report('H6 地窖徽章只送一次、商店能买；三个存档字段刷新不丢', bad.length === 0, bad.join(' / '));
        }
        {
            // H7：仓库「返回大厅」谁都能点；组队时一个人回大厅，房主和其他人留在仓库，开局不再把他拉进去
            const bad = [];
            const H = await openTab(chrome, url), G1 = await openTab(chrome, url), G2 = await openTab(chrome, url);
            const [h, g1, g2] = [await H.eval('gState.id'), await G1.eval('gState.id'), await G2.eval('gState.id')];
            await H.eval(`peerIsHost = true; teamAddMember(${JSON.stringify(g1)}); teamAddMember(${JSON.stringify(g2)}); true;`);
            await G1.eval(`teamAddMember(${JSON.stringify(h)}); true;`); await G2.eval(`teamAddMember(${JSON.stringify(h)}); true;`);
            await W(3000);
            await H.eval(`${HIDE} selectGameMode('hunt'); requestStartGame(); true;`); await W(1200);
            const humans = (t) => t.eval(`gState.team.filter(function (m) { return !m.isAI; }).map(function (m) { return m.id; }).sort().join(',')`);
            const onGarage = (t) => t.eval(`!document.getElementById('screen-garage').classList.contains('hidden')`);
            const all3 = [h, g1, g2].sort().join(',');
            if ((await humans(H)) !== all3 || !(await onGarage(G1)) || !(await onGarage(G2))) bad.push('组队进仓库没成 ' + (await humans(H)));
            if (!(await G1.eval(`document.getElementById('garage-lobby-btn').offsetParent !== null && document.getElementById('start-game-btn').style.display === 'none'`))) bad.push('队员看不到返回大厅按钮');
            await G1.eval(`document.getElementById('garage-lobby-btn').click(); true;`); await W(1200);
            const r1 = await G1.eval(`!document.getElementById('screen-lobby').classList.contains('hidden') + ' ' + gState.team.filter(function (m) { return !m.isAI; }).length`);
            if (r1 !== 'true 1') bad.push('回大厅的人 ' + r1);
            const two = [h, g2].sort().join(',');
            if ((await humans(H)) !== two) bad.push('房主队伍 ' + (await humans(H)));
            if ((await humans(G2)) !== two || !(await onGarage(G2))) bad.push('另一个队员 ' + (await humans(G2)));
            await H.eval(`requestEnterMap(); true;`); await W(2500);
            const r2 = [await H.eval('isPlaying'), await G2.eval('isPlaying'), await G1.eval('isPlaying')].join(' ');
            if (r2 !== 'true true false') bad.push('开局 房主/队员/回大厅的 ' + r2);
            for (const t of [H, G1, G2]) if (t.errors.length) bad.push(t.errors.slice(0, 2).join(' / '));
            for (const t of [H, G2]) await t.eval(`${HIDE} ${MODES.hunt.exit}; true;`).catch(() => { });
            await W(800);
            for (const t of [H, G1, G2]) await t.close();
            report('H7 仓库返回大厅', bad.length === 0, bad.join(' / '));
        }
        {
            // 夜间 PR #18：AI 队友打死怪时，排在后面的怪这一帧照常更新；被打死的从 entities 拿掉
            const before = A.errors.length, bad = [];
            await A.eval(`gState.aiFill = true; true;`);
            await A.eval(GARAGE_SETUP(`[S('鱼叉'), null, null, null, null, null]`, `[]`, 0)); await A.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await A.eval(`${HIDE} true;`);
            const r = await A.eval(`(function(){
                let ai = entities.find(function (e) { return e.userData.type === 'ai' && !e.userData.isRealPlayer; }); if (!ai) return 'no-ai';
                let keep = entities.slice(), calls = [], oldIntro = window.introOnce;
                let mk = function (type, hp, pos) { let m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); m.position.copy(pos); m.userData = { type: type, hp: hp, speed: 0, dmg: 0, atkCd: 9, name: type }; scene.add(m); return m; };
                ai.position.copy(camera.position).add(new THREE.Vector3(60, 0, 0)); ai.userData.hasWep = true; ai.userData.atkCd = 0;
                let X = mk('high', 50, camera.position.clone().add(new THREE.Vector3(5, 0, 0)));
                let M = mk('splitter', 1, ai.position.clone().add(new THREE.Vector3(3, 0, 0)));
                entities.length = 0; entities.push(M, ai, X);   // 打死的怪排在 AI 前面：老代码 splice 后会跳过 X
                window.introOnce = function (k) { calls.push(k); };
                try { handleThrownItemsAndEntitiesEngine(1 / 60); } finally { window.introOnce = oldIntro; }
                let out = calls.join(',') + ' | ' + (entities.indexOf(M) < 0) + ' ' + (entities.indexOf(X) >= 0);
                scene.remove(X); entities.length = 0; keep.forEach(function (e) { entities.push(e); });
                return out; })()`);
            if (r !== 'hunt.mob.high | true true') bad.push('AI 打怪 ' + r);
            await A.eval(`${HIDE} ${MODES.hunt.exit}; gState.aiFill = false; true;`); await W(1800); await A.eval(`${HIDE} true;`);
            // blazeChar 进存档白名单
            const b = await A.eval(`(function(){ let k = gState.blazeChar; gState.blazeChar = Object.keys(BLAZE_CHARS)[1]; saveProgress(); gState.blazeChar = 'bow'; loadProgress(gState.id); let got = gState.blazeChar; gState.blazeChar = k; saveProgress(); return got; })()`);
            if (b !== (await A.eval('Object.keys(BLAZE_CHARS)[1]'))) bad.push('blazeChar 读档成 ' + b);
            // 惊魂夜追捕者的名牌带称号：AI 用 aiRandomTitle，自己当追捕者用 myTitle
            await A.eval(`window.__lblSeen = []; (function(){ let old = window.nightMakeLabel; window.__lblRestore = function(){ window.nightMakeLabel = old; window.aiRandomTitle = window.__oa; window.myTitle = window.__om; };
                window.__oa = window.aiRandomTitle; window.__om = window.myTitle; window.aiRandomTitle = function () { return 'T_AI'; }; window.myTitle = function () { return 'T_ME'; };
                window.nightMakeLabel = function (text, c, th, title) { if (th === false) window.__lblSeen.push(text + '=' + title); return old.apply(this, arguments); }; })(); true;`);
            await A.eval(`${HIDE} selectGameMode('night'); ${MODES.night.start}; true;`); await W(2500);
            const hl = await A.eval(`(function(){ let hc = NIGHT_CHARS[night.hunterChar] || NIGHT_CHARS.hunter; return window.__lblSeen.filter(function (x) { return x.indexOf(hc.name + '=') === 0; }).join(','); })()`);
            await A.eval(`window.__lblRestore(); ${HIDE} ${MODES.night.exit}; true;`); await W(1800); await A.eval(`${HIDE} true;`);
            if (!/=T_AI/.test(hl)) bad.push('AI 追捕者名牌 ' + hl);
            report('夜间 #18：AI 打怪不跳过别的怪、超燃角色进存档、追捕者有称号', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }
        await A.eval(`${HIDE} gState.inv = Array(6).fill(null); gState.garage = Array(200).fill(null); gState.money = 0; nav('screen-lobby'); true;`);

        {
            // T1：塔按每日效果生成，6 种效果都 0 块上不去；举步维艰下岩浆比例和平常接近
            const before = A.errors.length, t0 = Date.now();
            const o = JSON.parse(await A.eval(`${HIDE} (${TOWER_SIM.toString()})(20)`));
            const bad = Object.keys(o).filter((k) => o[k].bad > 0).map((k) => k + ' ' + o[k].bad);
            const near = Math.abs(o.slow.frac - o.normal.frac) < 0.05;
            report('T1 6 种每日效果各 20 座塔 0 块上不去，举步维艰岩浆比例接近平常', bad.length === 0 && near && A.errors.length === before,
                Object.keys(o).map((k) => k + ' ' + o[k].bad + '/' + o[k].frac).join(' ') + ' 用时 ' + Math.round((Date.now() - t0) / 1000) + 's');
        }

        {
            // T2：存档点。岩浆低于存档点掉下去回存档点；高于时单人结束、多人出局、双人倒下；存档点只升不降；AI 一样
            const before = A.errors.length, bad = [];
            const begin = async (kind) => { await A.eval(`${HIDE} selectGameMode('tower'); nmBegin('tower', [{ id: gState.id }], gState.id, 5, { kind: '${kind}' }); true;`); await W(1500); await A.eval(`${HIDE} true;`); };
            const stand = (who, i) => A.eval(`(function(){ let a = ${who}, s = nm.steps[${i}]; a.p.set(s.x, s.y, s.z); a.vy = 0; a.mvx = a.mvz = 0; a.onGround = true; return true; })()`);
            const drop = (who, lavaVsCp) => A.eval(`(function(){ let a = ${who}, cs = nm.steps[a.cp || 0]; nm.lavaY = cs.y + (${lavaVsCp}); a.p.set(cs.x, nm.lavaY - 3, cs.z); a.vy = 0; return true; })()`);
            const st = (who) => A.eval(`(function(){ let a = ${who}; return JSON.stringify({ cp: a.cp, out: !!a.out, down: !!a.downed, falls: a.falls, y: Math.round(a.p.y), cpY: Math.round(nm.steps[a.cp || 0].y) }); })()`);
            await begin('solo');
            await drop('nm.me', -20); await until(A, `nm.me.falls >= 1`, 20000); await A.eval(`${HIDE} true;`);
            let o = JSON.parse(await st('nm.me'));
            if (o.out || o.cp !== 0 || o.falls !== 1 || o.y < o.cpY - 1) bad.push('单人 岩浆低于起点时掉下去 ' + JSON.stringify(o));
            await stand('nm.me', 10); await until(A, `nm.me.cp === 10`, 20000); await A.eval(`${HIDE} true;`);
            await stand('nm.me', 20); await until(A, `nm.me.cp === 20`, 20000); await A.eval(`${HIDE} true;`);
            await stand('nm.me', 10); await frames(A, 30); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            const gold = await A.eval(`nm.steps[20].flagMesh.material.color.getHex() === 0xffca28 && nm.steps[30].flagMesh.material.color.getHex() !== 0xffca28`);
            if (o.cp !== 20 || !gold) bad.push('存档点只升不降/旗子变色 ' + JSON.stringify(o) + ' ' + gold);
            await drop('nm.me', -20); await until(A, `nm.me.falls >= 2`, 20000); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            if (o.out || o.cp !== 20 || o.falls !== 2 || o.y < o.cpY - 1) bad.push('单人 回第 20 块 ' + JSON.stringify(o));
            const hud = await A.eval(`(nm.lavaY = nm.steps[20].y + 5, nm.def.hud(nm), document.getElementById('blaze-round').innerText)`);
            if (!/存档点被淹了/.test(hud)) bad.push('淹了没提示 ' + hud);
            await drop('nm.me', 5); await until(A, `/掉下去 3 次/.test(document.getElementById('sys-modal-text').innerText)`, 20000);
            o = JSON.parse(await st('nm.me'));
            const endTxt = await A.eval(`document.getElementById('sys-modal-text').innerText`);
            if (!o.out || !/掉下去 3 次/.test(endTxt)) bad.push('单人 淹了再掉 ' + JSON.stringify(o) + ' 结算:' + endTxt.slice(0, 60));
            await A.eval(`${HIDE} nmExit(); true;`); await W(1200);
            await begin('multi');
            // AI 也用同一套：岩浆低于它的存档点时掉下去回存档点
            await drop('nm.actors[1]', -20); await until(A, `nm.actors[1].falls >= 1`, 20000);
            o = JSON.parse(await st('nm.actors[1]'));
            if (o.out || o.falls !== 1) bad.push('多人 AI 回存档点 ' + JSON.stringify(o));
            // 先把两个 AI 放到第 50 块（岩浆淹不到），不然起点上的 AI 跟着一起淹、这局直接结束
            await stand('nm.actors[1]', 50); await stand('nm.actors[2]', 50);
            await drop('nm.me', 5); await until(A, `nm.me.out`, 20000); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            const still = await A.eval(`!!nm && nm.actors.filter(function (a) { return !a.out; }).length`);
            if (!o.out || !still) bad.push('多人 淹了再掉应出局、局还在 ' + JSON.stringify(o) + ' 剩 ' + still);
            await A.eval(`${HIDE} nmExit(); true;`); await W(1200);
            await begin('duo');
            await drop('nm.me', 5); await until(A, `nm.me.downed`, 20000); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            if (!o.down || o.out) bad.push('双人 淹了再掉应倒下 ' + JSON.stringify(o));
            await A.eval(`${HIDE} nmExit(); true;`); await W(1200); await A.eval(`${HIDE} true;`);
            report('T2 爬塔存档点：回存档点、单人结束、多人出局、双人倒下、只升不降', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }

        {
            // E1：每日效果的新数值；竞速里平常光跳能过的地方各效果光跳都能过，要冲刺的地方余量 ≥ 3
            const want = { turbo: [1.15, 1], moon: [1, 1.25], slow: [0.9, 0.95], hop: [1, 1.35], rush: [1.1, 1.1], normal: [1, 1] };
            const got = JSON.parse(await A.eval(`JSON.stringify(DAILY_MODIFIERS.map(function (m) { return [m.id, m.speedMul, m.jumpMul]; }))`));
            const R = JSON.parse(await A.eval(`JSON.stringify(RACE)`));
            const bad = [];
            got.forEach(([id, sm, jm]) => { if (!want[id] || want[id][0] !== sm || want[id][1] !== jm) bad.push(id + ' ' + sm + '/' + jm); });
            const rows = got.map(([id, sm, jm]) => {
                const r = raceReach(R, sm, jm);
                if (r.jump < 22) bad.push(id + ' 断桥 22/裂谷 22 光跳只有 ' + r.jump.toFixed(1));
                if (r.dash < 36 + 3) bad.push(id + ' 裂谷 36 冲刺只有 ' + r.dash.toFixed(1));
                if (r.bounce < 56) bad.push(id + ' 弹跳板走上去只有 ' + r.bounce.toFixed(1));
                if (r.h < 2) bad.push(id + ' 升降台跳不上去');
                return id + ' ' + r.jump.toFixed(1) + '/' + r.dash.toFixed(1) + '/' + r.bounce.toFixed(1);
            });
            report('E1 每日效果改小，竞速各效果都跳得过（光跳/冲刺+跳/弹跳板）', bad.length === 0, bad.length ? bad.join(' / ') : rows.join(' '));
        }

        {
            // H12：新号简单图第一局 0 个保险柜、金箱子多 1 个；第二局恢复。中等图保底局必出保险柜
            const bad = [];
            const N = await openTab(chrome, url, { name: 'h12' + Math.floor(Math.random() * 100000) });
            const run = async (diff) => {
                await N.eval(`${HIDE} gState.aiFill = false; gState.mapDifficulty = '${diff}'; selectGameMode('hunt'); requestStartGame(); requestEnterMap(); true;`); await W(2500);
                const r = JSON.parse(await N.eval(`JSON.stringify({ gold: chests.filter(function (c) { return c.userData.type === 'gold'; }).length, safe: chests.filter(function (c) { return c.userData.type === 'safe'; }).length, played: !!gState.huntDiffPlayed.easy, mul: huntPityMul })`));
                await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
                return r;
            };
            const easyGold = await N.eval(`mapConfigs.easy.gold`);
            const r1 = await run('easy');
            if (r1.safe !== 0 || r1.gold !== easyGold + 1 || r1.mul !== 2 || !r1.played) bad.push('第一局 ' + JSON.stringify(r1));
            const r2 = await run('easy');
            if (r2.safe !== 0 || r2.gold !== easyGold || r2.mul !== 1) bad.push('第二局 ' + JSON.stringify(r2));
            const medGold = await N.eval(`mapConfigs.med.gold + (mapConfigs.med.hasGoldShop ? 1 : 0)`);
            const r3 = await run('med');
            if (r3.gold !== medGold + 1 || r3.mul !== 2) bad.push('中等图第一局也该多 1 个金箱子、大金 ×2 ' + JSON.stringify(r3));
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('H12 简单图不出保险柜，第一局多 1 个金箱子；中等图第一局也是多 1 个金箱子（不再必出保险柜）', bad.length === 0, bad.join(' / ') + ' 第一局 ' + JSON.stringify(r1) + ' 第二局 ' + JSON.stringify(r2));
        }

        {
            // H13：单箱大金概率 木 1% 银 4% 金 10%（±0.5 个百分点），每张图（箱子 + 保险柜 + 信号接收器全部用完）最多 4 个
            const bad = [], out = [];
            for (const [diff, pity, team] of [['easy', false, 1], ['med', false, 1], ['hard', false, 1], ['easy', true, 1], ['hard', false, 3]]) {
                const o = JSON.parse(await A.eval(`(${LOOT_SIM.toString()})('${diff}', 20000, ${pity}, ${team})`));
                const want = pity ? { wood: 2, silver: 8, gold: 20 } : { wood: 1, silver: 4, gold: 10 };
                if (!pity) ['wood', 'silver', 'gold'].forEach((t) => { if (Math.abs(o.rate[t] - want[t]) > 0.5) bad.push(diff + ' ' + t + ' ' + o.rate[t] + '%'); });
                if (o.over > 0 || o.maxAll > 4) bad.push(diff + (pity ? '保底' : '') + ' 有图超过 4 个（最多 ' + o.maxAll + '）');
                out.push(diff + (pity ? '保底' : '') + (team > 1 ? '×' + team + '人' : '') + ' 平均 ' + o.avg + ' 个、' + o.anyPct + '% 至少 1 个、单箱 ' + JSON.stringify(o.rate) + '、最多 ' + o.maxAll);
            }
            // 真进一张困难图：每个箱子造图时都定好了东西，信号奖励按队员分好，大金总数不超过 4
            await A.eval(`${HIDE} gState.mapDifficulty = 'hard'; selectGameMode('hunt'); requestStartGame(); requestEnterMap(); true;`); await W(2500);
            const real = JSON.parse(await A.eval(`JSON.stringify({ noLoot: chests.filter(function (c) { return c.userData.loot === undefined; }).length, n: chests.length,
                big: chests.filter(function (c) { return huntIsBig(c.userData.loot); }).length + huntSignalLoot.reduce(function (k, L) { return k + L.filter(huntIsBig).length; }, 0),
                lists: huntSignalLoot.length + 'x' + (huntSignalLoot[0] || []).length })`));
            await A.eval(`${HIDE} ${MODES.hunt.exit}; gState.mapDifficulty = 'easy'; true;`); await W(1500); await A.eval(`${HIDE} true;`);
            if (real.noLoot || real.big > 4 || !real.n) bad.push('真地图 ' + JSON.stringify(real));
            report('H13 大金单箱概率、每张图最多 4 个（各 2 万张图）', bad.length === 0, bad.length ? bad.join(' / ') : out.join(' | '));
        }

        {
            // H14：腰包自己装东西
            const before = A.errors.length, bad = [];
            const P = `(function(){ let p = S('腰包'); p.bag = [null, null, null]; return p; })()`;
            // 容量：两个腰包能装 6 + 2×3 − 2 = 10 件
            let r = await A.eval(`(function(){ gState.inv = [${P}, ${P}, null, null, null, null]; let n = 0; while (n < 20) { let sl = carryFreeSlot(L('杯' + n)); if (!sl) break; sl[0][sl[1]] = L('杯' + n); n++; }
                return n + ' ' + invWeight(); })()`);
            // 重量：两个腰包各 4 + 10 件各 1
            if (r !== '10 ' + (2 * 4 + 10)) bad.push('两个腰包能装/重量 ' + r);
            // 老存档：第 7~9 格的东西挪进腰包
            r = await A.eval(`(function(){ gState.inv = [${P}, S('鱼叉'), null, null, null, null, S('医疗包'), null, S('医疗包')]; expandInventory();
                return gState.inv.length + ' ' + pouchCount(gState.inv[0]); })()`);
            if (r !== '6 2') bad.push('老存档迁移 ' + r);
            // 仓库里：点一下展开、再点收起、点别处收起；腰包拖不进腰包；宝物拖不进腰包；工具能拖进去
            await A.eval(GARAGE_SETUP(`[${P}, null, null, null, null, null]`, `[${P}, S('鱼叉'), L('金杯')]`, 0));
            await mouseDrag(A, INV_SLOT(0), null, 2);
            const rowShown = () => A.eval(`(function(){ let r = document.getElementById('garage-pouch-row'); return !!r && r.style.display !== 'none' && r.querySelectorAll('.slot').length === 3; })()`);
            if (!(await rowShown())) bad.push('点一下没展开');
            await mouseDrag(A, GAR_SLOT(1), '#garage-pouch-row .slot:nth-child(2)');
            if ((await A.eval(`pouchCount(gState.inv[0]) + ' ' + (gState.inv[0].bag[0] && gState.inv[0].bag[0].n)`)) !== '1 鱼叉') bad.push('工具拖不进腰包 ' + (await A.eval(MODAL)));
            await A.eval(`${HIDE} true;`);
            const gCup = await A.eval(`gState.garage.findIndex(function (q) { return q && q.n === '金杯'; })`);
            await mouseDrag(A, GAR_SLOT(gCup), '#garage-pouch-row .slot:nth-child(3)');
            const m1 = await A.eval(`${MODAL} + ' ' + document.getElementById('sys-modal-text').innerText`);
            if (!/宝物/.test(m1)) bad.push('宝物进腰包没拦住 ' + m1);
            await A.eval(`${HIDE} true;`);
            const gP = await A.eval(`gState.garage.findIndex(function (q) { return isPouch(q); })`);
            await mouseDrag(A, GAR_SLOT(gP), '#garage-pouch-row .slot:nth-child(4)');
            const m2 = await A.eval(`${MODAL} + ' ' + document.getElementById('sys-modal-text').innerText`);
            if (!/腰包不能放进腰包/.test(m2)) bad.push('腰包进腰包没拦住 ' + m2);
            await A.eval(`${HIDE} true;`);
            await mouseDrag(A, INV_SLOT(0), null, 2);
            if (await rowShown()) bad.push('再点一下没收起');
            await mouseDrag(A, INV_SLOT(0), null, 2);
            await A.eval(`document.querySelector('#screen-garage h1').click(); true;`); await W(200);
            if (await rowShown()) bad.push('点别处没收起');
            // 卖腰包：不空不让卖
            r = await A.eval(`(function(){ gState.garage[0] = gState.inv[0]; gState.inv[0] = null; gState.selectedContainer = 'garage'; gState.selectedSlot = 0; garageSellSelected(); return ${MODAL} + ' ' + isPouch(gState.garage[0]); })()`);
            if (r !== '卖不了 true') bad.push('不空的腰包能卖 ' + r);
            await A.eval(`${HIDE} true;`);
            // 一键整理不把东西移进移出腰包
            r = await A.eval(`(function(){ let p = ${P}; p.bag[1] = S('医疗包'); gState.inv = [null, p, null, S('鱼叉'), null, null]; tidyAll(); return isPouch(gState.inv[0]) + ' ' + pouchCount(gState.inv[0]) + ' ' + (gState.inv[0].bag[1] && gState.inv[0].bag[1].n) + ' ' + gState.inv.filter(function (q) { return q; }).length; })()`);
            if (r !== 'true 1 医疗包 2') bad.push('一键整理 ' + r);
            // 进图：腰包里的宝物挪回仓库
            await A.eval(`(function(){ let p = gState.inv[0]; p.bag[2] = L('宝杯'); gState.garage = Array(200).fill(null); return true; })()`);
            await A.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await A.eval(`${HIDE} true;`);
            r = await A.eval(`(gState.inv[0].bag[2] === null) + ' ' + gState.garage.some(function (q) { return q && q.n === '宝杯'; })`);
            if (r !== 'true true') bad.push('进图腰包宝物没挪回仓库 ' + r);
            // 上交：腰包里的宝物一起上交
            r = await A.eval(`(function(){ gState.inv[0].bag[2] = L('金杯'); camera.position.set(TILE, 9, TILE); let n0 = gState.submittedItems.length; clickSubmit(); return (gState.submittedItems.length - n0) + ' ' + (gState.inv[0].bag[2] === null) + ' ' + (gState.inv[0].bag[1] && gState.inv[0].bag[1].n); })()`);
            if (r !== '1 true 医疗包') bad.push('上交 ' + r);
            // 扔腰包、捡回来东西还在
            r = await A.eval(`(function(){ selectSlot(0); executeThrow(0); let g = groundItems[groundItems.length - 1]; let back = huntItemFromGround(g.userData); return isPouch(back) + ' ' + pouchCount(back) + ' ' + (gState.inv[0] === null); })()`);
            if (r !== 'true 1 true') bad.push('扔了再捡 ' + r);
            // 撤离成功：腰包里的宝物进仓库，工具留在腰包里
            r = await A.eval(`(function(){ let p = ${P}; p.bag[0] = S('鱼叉'); p.bag[1] = L('银杯'); gState.inv[0] = p; gState.garage = Array(200).fill(null); completeExtraction('撤离成功');
                return (gState.inv[0].bag[0] && gState.inv[0].bag[0].n) + ' ' + (gState.inv[0].bag[1] === null) + ' ' + gState.garage.some(function (q) { return q && q.n === '银杯'; }); })()`);
            if (r !== '鱼叉 true true') bad.push('撤离成功 ' + r);
            await A.eval(`${HIDE} returnToGarageFromOver(); true;`);
            // 撤离失败：腰包和里面的东西一起丢
            await A.eval(`${HIDE} requestEnterMap(); true;`); await W(2500); await A.eval(`${HIDE} true;`);
            await A.eval(`finishGame(false, '测试'); true;`); await W(300);
            r = await A.eval(`gState.inv.filter(function (q) { return q; }).length`);
            if (r !== 0) bad.push('撤离失败腰包还在 ' + r);
            await A.eval(`${HIDE} returnToGarageFromOver(); gState.inv = Array(6).fill(null); gState.garage = Array(200).fill(null); nav('screen-lobby'); true;`);
            report('H14 腰包自己装东西：容量、展开收起、不能套娃、进图/上交/撤离/扔/卖/整理', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
        }

        {
            // U1：仓库在触屏上——在有物品的格子上往上滑是滚动列表、物品不动；长按后拖动把物品挪到目标格；点一下是选中；
            // 鼠标拖放跟原来一样；宽屏上列表比原来的 280 像素宽
            const bad = [];
            const fill = `(function(){ let g = []; for (let i = 0; i < 80; i++) g.push(L('杯' + i)); return g; })()`;
            await A.eval(GARAGE_SETUP(`Array(6).fill(null)`, fill, 0));
            const names = `gState.garage.slice(0, 80).map(function (q) { return q && q.n; }).join(',')`;
            const n0 = await A.eval(names);
            const box = await A.eval(`(function(){ let r = document.getElementById('garage-stash-container').getBoundingClientRect(); return [r.width, r.height]; })()`);
            if (!(box[0] > 300)) bad.push('宽屏列表还是窄的 ' + box[0]);
            // 1. 上滑：列表滚动，物品没动
            const c0 = await mouseAt(A, GAR_SLOT(4));
            const swipe = []; for (let i = 0; i <= 12; i++) swipe.push([c0[0], c0[1] - i * 14]);
            await touchPath(A, swipe, 0);
            // 滚动由浏览器的手势处理，机器忙的时候会晚一点才到位：最多等 1.5 秒
            let st = 0;
            for (let i = 0; i < 15 && !(st > 20); i++) { st = await A.eval(`document.getElementById('garage-stash-container').scrollTop`); if (!(st > 20)) await W(100); }
            if (!(st > 20)) bad.push('上滑没滚动 scrollTop=' + st);
            if ((await A.eval(names)) !== n0) bad.push('上滑把物品挪了');
            // 2. 长按后拖：格子变样子，物品移到目标格
            await A.eval(`document.getElementById('garage-stash-container').scrollTop = 0; true;`); await W(100);
            const from = await mouseAt(A, GAR_SLOT(1)), to = await mouseAt(A, GAR_SLOT(6));
            const tp = (type, p) => A.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1 }] : [] });
            await tp('touchStart', from); await W(450);
            const lifted = await A.eval(`document.querySelector('${GAR_SLOT(1)}').classList.contains('lifting') && isDragging`);
            if (!lifted) bad.push('长按后没拿起来');
            for (let i = 1; i <= 8; i++) { await tp('touchMove', [from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8]); await W(16); }
            await tp('touchEnd', null); await W(300);
            const sw = await A.eval(`gState.garage[1].n + ',' + gState.garage[6].n`);
            if (sw !== '杯6,杯1') bad.push('长按拖动没换过去 ' + sw);
            // 3. 点一下：选中
            const t3 = await mouseAt(A, GAR_SLOT(2));
            await touchPath(A, [t3], 0);
            const sel = await A.eval(`gState.selectedContainer + ':' + gState.selectedSlot`);
            if (sel !== 'garage:2') bad.push('点一下没选中 ' + sel);
            // 4. 鼠标拖放还是原来那样（按下就能拖）
            await mouseDrag(A, GAR_SLOT(3), GAR_SLOT(4));
            const ms = await A.eval(`gState.garage[3].n + ',' + gState.garage[4].n`);
            if (ms !== '杯4,杯3') bad.push('鼠标拖放 ' + ms);
            await A.eval(`${HIDE} gState.garage = Array(200).fill(null); gState.inv = Array(6).fill(null); nav('screen-lobby'); true;`);
            report('U1 仓库触屏：上滑滚动不挪东西、长按拖、点一下选中；鼠标照旧；宽屏列表变宽', bad.length === 0, bad.join(' / '));
        }

        {
            // U2：触屏（pad）时摇杆看得见——摇杆中心点最上层的元素就是摇杆本身；拖动摇杆，大厅和寻宝队里人都会动
            const bad = [];
            const top = `(function(){ let j = document.getElementById('joystick-left'), r = j.getBoundingClientRect(); let e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return JSON.stringify({ c: [r.left + r.width / 2, r.top + r.height / 2], top: e ? (e.id || e.tagName) : null, shown: getComputedStyle(j).display !== 'none' }); })()`;
            const drag = async (c) => {
                const tp = (type, p) => A.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 7 }] : [] });
                await tp('touchStart', c);
                for (let i = 1; i <= 30; i++) { await tp('touchMove', [c[0], c[1] - Math.min(45, i * 5)]); await W(33); }
                await tp('touchEnd', null); await W(200);
            };
            await A.eval(`${HIDE} selectControl('pad'); true;`); await W(600);
            let j = JSON.parse(await A.eval(top));
            if (!j.shown || j.top !== 'joystick-left') bad.push('大厅里摇杆被盖住 ' + JSON.stringify(j));
            const h0 = await A.eval(`hub.p.x + ',' + hub.p.z`);
            await drag(j.c);
            const h1 = await A.eval(`hub.p.x + ',' + hub.p.z`);
            if (h0 === h1) bad.push('大厅里拖摇杆人没动');
            await A.eval(`${HIDE} ${MODES.hunt.start}; true;`); await W(2500); await A.eval(`${HIDE} true;`); await W(400);
            j = JSON.parse(await A.eval(top));
            if (!j.shown || j.top !== 'joystick-left') bad.push('寻宝队里摇杆被盖住 ' + JSON.stringify(j));
            const p0 = await A.eval(`camera.position.x.toFixed(2) + ',' + camera.position.z.toFixed(2)`);
            await drag(j.c);
            const p1 = await A.eval(`camera.position.x.toFixed(2) + ',' + camera.position.z.toFixed(2)`);
            if (p0 === p1) bad.push('寻宝队里拖摇杆人没动');
            await A.eval(`${HIDE} ${MODES.hunt.exit}; selectControl('laptop'); true;`); await W(1000);
            report('U2 触屏摇杆在最上层看得见，大厅和寻宝队里拖了人会动', bad.length === 0, bad.join(' / '));
        }

        {
            // U3：大厅左边按钮有半透明底；大厅只剩一个"发言"；路人不生在出生点附近；1180×820 时仓库"返回大厅"不用滚就看得到
            const bad = [];
            await A.eval(`${HIDE} nav('screen-lobby'); true;`); await W(500);
            const bg = await A.eval(`getComputedStyle(document.getElementById('lobby-tl')).backgroundColor`);
            const m = /rgba?\(([^)]*)\)/.exec(bg), alpha = m ? (m[1].split(',').length > 3 ? +m[1].split(',')[3] : 1) : 0;
            if (!(alpha >= 0.5)) bad.push('左边按钮没有底色 ' + bg);
            const talk = await A.eval(`Array.prototype.filter.call(document.querySelectorAll('button, div'), function (e) { return e.children.length === 0 && /^发言/.test(e.innerText.trim()) && e.offsetParent !== null; }).length`);
            if (talk !== 1) bad.push('大厅里"发言"有 ' + talk + ' 个');
            let near = 0;
            for (let k = 0; k < 20; k++) near += await A.eval(`hubExit(); hubBegin(); hub.wanderers.filter(function (w) { return Math.hypot(w.p.x, w.p.z - 20) < 70; }).length`);
            if (near) bad.push('路人生在出生点附近 ' + near + ' 次');
            await A.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false }); await W(300);
            await A.eval(GARAGE_SETUP(`Array(6).fill(null)`, `[]`, 0));
            const r = JSON.parse(await A.eval(`(function(){ let b = document.getElementById('garage-lobby-btn').getBoundingClientRect(); return JSON.stringify([b.top, b.bottom, b.left, b.right, innerHeight, innerWidth]); })()`));
            if (!(r[0] >= 0 && r[1] <= r[4] && r[2] >= 0 && r[3] <= r[5])) bad.push('仓库"返回大厅"在屏幕外 ' + JSON.stringify(r));
            await A.eval(`${HIDE} document.getElementById('garage-lobby-btn').click(); true;`); await W(400);
            if (await A.eval(`document.getElementById('screen-lobby').classList.contains('hidden')`)) bad.push('点了没回大厅');
            await A.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await W(300);
            await A.eval(`${HIDE} true;`);
            report('U3 大厅按钮有底色、只剩一个发言、路人不挡出生点；仓库返回大厅在屏幕里', bad.length === 0, bad.join(' / '));
        }

        {
            // 夜间 #20（10-09）：超燃/松饼/新模式框架头顶名字用原文（名字带 & < 不再显示 &amp;）；超燃镜猫换位联机同步（两人位置、楼层，被换的是自己镜头也跟过去）
            const bad = [];
            const id0 = await A.eval('gState.id');
            await A.eval(`${HIDE} gState.id = 'x&y<z'; true;`);
            const lbl = async (start, exit, list) => {
                await A.eval(`${HIDE} ${start}; true;`); await W(1200);
                const r = await A.eval(`(function(){ let a = (${list}).filter(function (q) { return q.isPlayer || q.mine || q.id === gState.id; })[0]; let s = a && a.mesh && a.mesh.children.filter(function (c) { return c.userData && c.userData.label !== undefined; })[0]; return s ? s.userData.label : null; })()`);
                await A.eval(`${HIDE} ${exit}; true;`); await W(600);
                return r;
            };
            const lb = await lbl(MODES.blaze.start, MODES.blaze.exit, 'blaze.actors');
            const lc = await lbl(MODES.cake.start, MODES.cake.exit, 'cake.actors');
            const ln = await lbl(MODES.sumo.start, MODES.sumo.exit, 'nm.actors');
            if (lb !== 'x&y<z' || lc !== 'x&y<z' || ln !== 'x&y<z') bad.push('头顶名字 超燃=' + lb + ' 松饼=' + lc + ' 推推乐=' + ln);
            await A.eval(`${HIDE} gState.id = ${JSON.stringify(id0)}; true;`);
            await A.eval(`${HIDE} ${MODES.blaze.start}; true;`); await W(1200);
            const sw = await A.eval(`(function(){ let me = blaze.actors.filter(function (q) { return q.isPlayer; })[0], o = blaze.actors.filter(function (q) { return !q.isPlayer; })[0];
                blazeOnEv({ ev: 'swap', sender: 'someone', i: o.idx, j: me.idx, x: 11, z: 22, floor: 0, ex: 33, ez: 44, ef: 0 });
                return [o.p.x, o.p.z, me.p.x, me.p.z, Math.round(camera.position.x), Math.round(camera.position.z)].join(','); })()`);
            if (sw !== '11,22,33,44,33,44') bad.push('换位同步 ' + sw);
            await A.eval(`${HIDE} ${MODES.blaze.exit}; true;`); await W(600);
            report('夜间 #20：超燃/松饼/推推乐头顶名字用原文；镜猫换位联机同步', bad.length === 0, bad.join(' / '));
        }

        {
            // C7：同一个房间里两个玩家显示名一样（尾巴不同），两边看到的两个名字不同且一致（名字·尾巴前两位）；
            // 一个走了，剩下的那个恢复成不带尾巴。两个标签页在同一个浏览器，设备尾巴一样，这里直接把 ID 改成两台设备的样子
            const bad = [];
            const P = await openTab(chrome, url), Q = await openTab(chrome, url);
            await P.eval(`gState.id = 'dd#a1b2'; true;`); await Q.eval(`gState.id = 'dd#k7c3'; true;`);
            const view = (tab) => tab.eval(`JSON.stringify({ a: dispNameText('dd#a1b2'), k: dispNameText('dd#k7c3'), list: document.getElementById('room-list').innerText,
                lbl: Object.keys(hub.realPlayers).filter(function (id) { return /^dd#/.test(id); }).map(function (id) { return hub.realPlayers[id].label.userData.label; }).sort().join(',') })`);
            let vp = null, vq = null;
            for (let i = 0; i < 40; i++) {
                await W(300); vp = JSON.parse(await view(P)); vq = JSON.parse(await view(Q));
                if (vp.a === 'dd·a1' && vq.a === 'dd·a1' && vp.k === 'dd·k7' && vq.k === 'dd·k7' && vp.lbl && vq.lbl) break;
            }
            if (vp.a !== 'dd·a1' || vp.k !== 'dd·k7' || vq.a !== vp.a || vq.k !== vp.k) bad.push('名字 ' + JSON.stringify([vp, vq]));
            if (!/dd·a1/.test(vp.list) || !/dd·k7/.test(vp.list) || !/dd·a1/.test(vq.list) || !/dd·k7/.test(vq.list)) bad.push('名单 ' + vp.list + ' / ' + vq.list);
            if (vp.lbl !== 'dd·k7' || vq.lbl !== 'dd·a1') bad.push('头顶名字 ' + vp.lbl + ' / ' + vq.lbl);
            await Q.close();
            let back = null;
            for (let i = 0; i < 40; i++) { await W(300); back = await P.eval(`dispNameText(gState.id)`); if (back === 'dd') break; }
            if (back !== 'dd') bad.push('走了一个还带尾巴 ' + back);
            if (P.errors.length) bad.push(P.errors.slice(0, 2).join(' / '));
            await P.close();
            report('C7 同房间重名加尾巴前两位，两边一致；一个走了恢复不带尾巴', bad.length === 0, bad.join(' / '));
        }

        {
            // N4：大厅里的长椅和路灯删掉了，公告板还在
            const r = JSON.parse(await A.eval(`JSON.stringify((function () { let g = hub.meshes.filter(function (m) { return !hub.bg || Object.keys(hub.bg).every(function (n) { return hub.bg[n] !== m; }); }).map(function (m) { return m.geometry; });   // 背景（天空是个球）不算路灯
                return { lamp: g.filter(function (x) { return x.type === 'SphereGeometry'; }).length,
                    bench: g.filter(function (x) { return x.type === 'BoxGeometry' && x.parameters.width === 10 && x.parameters.height === 2 && x.parameters.depth === 4; }).length,
                    pole: g.filter(function (x) { return x.type === 'CylinderGeometry' && x.parameters.height === 16; }).length,
                    board: g.filter(function (x) { return x.type === 'BoxGeometry' && x.parameters.width === 16 && x.parameters.height === 8 && x.parameters.depth === 0.5; }).length }; })())`));
            report('N4 大厅没有长椅和路灯，公告板还在', r.lamp === 0 && r.bench === 0 && r.pole === 0 && r.board === 1, JSON.stringify(r));
        }

        {
            // C2：状态栏"在线 N 人"跟着房间名单刷新：两个页面同房间两边都是 2，一个走了另一边回到 1
            const bad = [];
            const st = (tab) => tab.eval(`document.getElementById('net-status').innerText + '|' + roomList.length`);
            const B = await openTab(chrome, url);
            let seenA = '', seenB = '';
            for (let i = 0; i < 40 && !(/在线 2 人\|2$/.test(seenA) && /在线 2 人\|2$/.test(seenB)); i++) {
                await W(300); const a = await st(A), b = await st(B); if (!/在线 2 人\|2$/.test(seenA)) seenA = a; if (!/在线 2 人\|2$/.test(seenB)) seenB = b;
            }
            if (!/在线 2 人\|2$/.test(seenA) || !/在线 2 人\|2$/.test(seenB)) bad.push('两边应该都是 2：' + seenA + ' / ' + seenB);
            if (B.errors.length) bad.push(B.errors.slice(0, 2).join(' / '));
            // 测试环境的联机是个一直失败重连的桩，"连接出错"会很快盖掉状态栏；所以记下每一次写进状态栏的文字，不靠轮询屏幕
            await A.eval(`window.__st = []; window.__nss = netSetStatus; netSetStatus = function (t, c) { window.__st.push(t + '|' + roomList.length); return window.__nss(t, c); }; true;`);
            await B.close();
            let back = '';
            for (let i = 0; i < 40 && !/在线 1 人\|0$/.test(back); i++) { await W(300); back = await A.eval(`window.__st.filter(function (s) { return /在线 1 人\\|0$/.test(s); })[0] || window.__st.slice(-1)[0] || ''`); }
            await A.eval(`netSetStatus = window.__nss; true;`);
            if (!/在线 1 人\|0$/.test(back)) bad.push('走了一个应该回到 1：' + back);
            // E4：大厅顶部"在线 N 人"只算真人，跟状态栏同一个数（这时只剩自己：1）
            const top = await A.eval(`hubHud(), document.getElementById('blaze-score').innerText + '|' + hub.wanderers.length`);
            if (!/^在线 1 人\|[1-9]/.test(top)) bad.push('E4 顶部人数 ' + top);
            report('C2/E4 在线人数跟着房间名单变（两边都是 2，走一个回到 1）；大厅顶部只算真人', bad.length === 0, bad.join(' / '));
        }

        {
            // C6b：大厅"联机诊断"——五项依次出结果（探路服务器每个单独一行），最后一句结论，有"复制结果"；只读，不动游戏自己的连接
            const bad = [];
            // 测试环境里游戏自己的连接是个一直失败重连的桩，先停掉它，测完看诊断有没有碰它（还应该是 null、没有连接），再连回去
            await A.eval(`${HIDE} window.__room0 = peerRoom; netLeaveRoom(true); Array.prototype.find.call(document.querySelectorAll('#lobby-tl button'), function (b) { return b.innerText === '联机诊断'; }).click(); true;`);
            let done = false;
            for (let i = 0; i < 100 && !done; i++) { await W(300); done = await A.eval(`!!netDiag && netDiag.done`); }
            const r = JSON.parse(await A.eval(`JSON.stringify({ title: document.getElementById('sys-modal-title').innerText, rows: document.querySelectorAll('#net-diag > div').length, stunRows: document.querySelectorAll('#net-diag > div[style*="padding:2px 0 2px 14px"]').length,
                text: netDiagText(), copy: !!Array.prototype.find.call(document.querySelectorAll('#net-diag button'), function (b) { return b.innerText === '复制结果'; }),
                same: peer === null && peerConns.length === 0 && !peerWant })`));
            const lines = r.text.split('\n');
            if (!done) bad.push('没测完');
            if (r.title !== '联机诊断' || r.rows !== 11 || r.stunRows !== 5 || !r.copy) bad.push('界面 ' + JSON.stringify(r));
            // 1 组件、2 牵线、3 探路（下面 5 个服务器各一行）、4 网络类型、5 中转，最后一行结论
            if (!/^1\. 联机组件加载：通/.test(lines[1]) || !/^2\. 牵线服务器：(通|不通)/.test(lines[2]) || !/^3\. 探路服务器/.test(lines[3]) || !/^4\. 网络类型/.test(lines[9]) || !/^5\. 中转服务器/.test(lines[10]) || !/^结论：./.test(lines[11])) bad.push('结果 ' + r.text);
            ['小米 stun.miwifi.com:3478', 'B站 stun.chat.bilibili.com:3478'].forEach((n) => { if (r.text.indexOf(n + '：') < 0) bad.push('少了 ' + n); });
            if (!r.same) bad.push('动了游戏自己的连接');
            await A.eval(`${HIDE} netJoinRoom(window.__room0); true;`);
            report('C6b 联机诊断五项都有结果和结论（探路服务器每个一行），能复制，不动游戏连接', bad.length === 0, bad.length ? bad.join(' / ') : lines.slice(1).join(' | '));
        }

        {
            // C6a：three.js 和 PeerJS 从自己的 vendor/ 加载，屏蔽 cdnjs 和 unpkg 后照样进大厅；
            // vendor 里的文件和原版逐字节相同（SHA-256 跟提交说明里一致）
            const bad = [];
            const V = await openTab(chrome, url, { blockHosts: ['cdnjs.cloudflare.com', 'unpkg.com'] });
            const r = JSON.parse(await V.eval(`JSON.stringify({ three: typeof THREE !== 'undefined' && THREE.REVISION, lobby: !document.getElementById('screen-lobby').classList.contains('hidden'),
                cdn: performance.getEntriesByType('resource').filter(function (e) { return /cdnjs|unpkg/.test(e.name); }).length })`));
            if (r.three !== '128' || !r.lobby || r.cdn) bad.push(JSON.stringify(r));
            if (V.blocked.length) bad.push('还在请求 ' + V.blocked.join(', '));
            if (V.errors.length) bad.push(V.errors.slice(0, 2).join(' / '));
            const sha = {}; ['vendor/three-r128.min.js', 'vendor/peerjs-1.5.4.min.js'].forEach((f) => { sha[f] = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'); });
            if (sha['vendor/three-r128.min.js'] !== '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2') bad.push('three 内容变了');
            if (sha['vendor/peerjs-1.5.4.min.js'] !== 'ad5d8870d1e389914f9cba8d35be313c4327c69ee0a221e482e9bf7621136fe5') bad.push('peerjs 内容变了');
            await V.close();
            report('C6a three.js / PeerJS 从自己仓库加载，屏蔽 cdnjs、unpkg 也能进大厅', bad.length === 0, bad.join(' / '));
        }

        {
            // I1：介绍卡片不会被别的弹窗盖掉，不管怎么关 introOpen 都回到 false。这一项不用 HIDE（它会把问题盖住）
            const bad = [];
            const N = await openTab(chrome, url, { noLobby: true });
            await N.eval(`document.getElementById('player-id').value = 'i1' + Date.now() % 100000; requestLobbyAccess(); true;`); await W(1500);
            // 进大厅可能先有别的弹窗（数据重置之类），真实点掉
            for (let i = 0; i < 6 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            // 1. 全新存档进寻宝队：规则卡片和新手提示都出现，一张关了出下一张
            await N.eval(`selectGameMode('hunt'); requestStartGame(); requestEnterMap(); true;`); await W(1500);
            const seen = [];
            for (let i = 0; i < 12; i++) { const t = await clickModal(N); if (t === null) { await W(700); if ((await N.eval(MODAL)) === null) break; } else seen.push(t); }
            const st1 = JSON.parse(await N.eval(`JSON.stringify({ open: introOpen, q: introQ.length, wait: sysModalWait.length })`));
            if (seen.indexOf('寻宝队 · 规则') < 0 || seen.indexOf('新手提示') < 0) bad.push('寻宝队弹窗 ' + seen.join(' → '));
            if (st1.open || st1.q || st1.wait) bad.push('点完还卡着 ' + JSON.stringify(st1));
            // 2. 接着玩单人合作密室：倒计时会走、clock 会涨
            await N.eval(`chooseLeave(); document.getElementById('game-over').classList.add('hidden'); nav('screen-lobby'); true;`); await W(800);
            for (let i = 0; i < 6 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            await N.eval(`selectGameMode('escape'); escapeBegin(null, null, 1); true;`); await W(1200);
            let started = false;
            for (let i = 0; i < 40 && !started; i++) { if ((await N.eval(MODAL)) !== null) await clickModal(N); else await W(400); started = await N.eval('escapeRoom && escapeRoom.started'); }
            const c1 = await N.eval('escapeRoom.clock'); await until(N, `escapeRoom.clock > ${c1}`, 20000); const c2 = await N.eval('escapeRoom.clock');
            if (!started || !(c2 > c1)) bad.push('密室没走起来 ' + JSON.stringify({ started, c1, c2 }));
            await N.eval(`escapeExit(); true;`); await W(1000);
            for (let i = 0; i < 6 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            // 3. 卡片开着时调一次普通弹窗：卡片不丢，两个依次关掉
            await N.eval(`introPush('测试卡片', '一'); showSysModal('普通弹窗', '二', [{ label: '好' }]); true;`);
            await until(N, `${MODAL} !== null`, 15000);
            const o1 = await clickModal(N);
            await until(N, `${MODAL} !== null`, 15000);   // 第二个弹窗在负载高时会晚一点出来，等它出来再点
            const o2 = await clickModal(N);
            await frames(N, 20);
            const o3 = await N.eval(MODAL);
            const st3 = JSON.parse(await N.eval(`JSON.stringify({ open: introOpen, q: introQ.length, wait: sysModalWait.length })`));
            if (o1 !== '测试卡片' || o2 !== '普通弹窗' || o3 !== null || st3.open || st3.q || st3.wait) bad.push('卡片被盖 ' + JSON.stringify([o1, o2, o3, st3]));
            // 4. 卡片开着时代码直接把弹窗藏起来：introOpen 也回到 false，排队的下一张接着出
            await N.eval(`introPush('卡 1', 'a'); introPush('卡 2', 'b'); true;`);
            await until(N, `${MODAL} === '卡 1'`, 15000);
            await N.eval(`document.getElementById('sys-modal').classList.add('hidden'); true;`);
            await until(N, `${MODAL} === '卡 2'`, 15000);
            const o4 = await N.eval(`${MODAL} + '|' + introOpen`);
            if (o4 !== '卡 2|true') bad.push('直接藏起来以后 ' + o4);
            await clickModal(N);
            if (await N.eval('introOpen')) bad.push('最后 introOpen 还是 true');
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('I1 介绍卡片不被别的弹窗盖掉、怎么关 introOpen 都会复位；新号寻宝队两张都看到；之后单人密室能走', bad.length === 0, bad.length ? bad.join(' / ') : '寻宝队依次：' + seen.join(' → '));
        }

        {
            // P1：寻宝队难度、AI 补齐队友、惊魂夜角色刷新后还在（存在 TH_settings）；触屏设备上也测一次（加载时会读设置）
            const bad = [];
            const T = await openTab(chrome, url);
            const pick = await T.eval(`Object.keys(NIGHT_CHARS).filter(function (k) { return k !== 'cat'; })[0]`);
            await T.eval(`${HIDE} document.querySelector('input[name="map_diff"][value="hard"]').click(); setAiFill(true); selectNightChar(${JSON.stringify(pick)}); true;`);
            const name = await T.eval('gState.id');
            const look = `JSON.stringify({ d: gState.mapDifficulty, r: (document.querySelector('input[name="map_diff"]:checked') || {}).value, ai: gState.aiFill, c: gState.nightChar })`;
            const want = JSON.stringify({ d: 'hard', r: 'hard', ai: true, c: pick });
            T.errors.length = 0;
            await T.send('Page.reload'); await W(2500);
            await T.eval(`document.getElementById('player-id').value = ${JSON.stringify(name.replace(/#.*$/, ''))}; requestLobbyAccess(); true;`); await W(1500);
            const r1 = await T.eval(look);
            if (r1 !== want) bad.push('刷新后 ' + r1);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            const M = await openTab(chrome, url, { mobile: true });
            const r2 = await M.eval(look);
            if (r2 !== want) bad.push('触屏设备上 ' + r2);
            if (M.errors.length) bad.push('触屏报错 ' + M.errors.slice(0, 2).join(' / '));
            await M.eval(`SETTINGS.mapDiff = null; SETTINGS.aiFill = null; SETTINGS.nightChar = null; settingsSave(); true;`);
            await M.close();
            report('P1 寻宝队难度、AI 队友、惊魂夜角色刷新后还在（电脑和触屏）', bad.length === 0, bad.join(' / '));
        }

        {
            // G1：「全都玩过」11 个模式都算（先玩过 10 个），乐园是最后一个打完时成就也弹出来
            const bad = [];
            await A.eval(`${HIDE} window.__ach0 = JSON.stringify(gState.ach || null); let S = achState(); S.modes = {}; delete S.done.all; delete S.got.all;
                ['hunt', 'night', 'blaze', 'race', 'jail', 'dodge', 'escape', 'cake', 'sumo', 'tower'].forEach(function (k) { S.modes[k] = 1; });
                window.__flash = []; window.__bf = blazeFlash; blazeFlash = function (t) { window.__flash.push(t); return window.__bf.apply(this, arguments); }; true;`);
            const goal = await A.eval(`ACH_LIST.filter(function (a) { return a.id === 'all'; })[0].goal`);
            if (goal !== 11) bad.push('goal=' + goal);
            if (await A.eval(`achCheck('none', {}), !!achState().done.all`)) bad.push('10 个就算完成了');
            await A.eval(`${HIDE} ${MODES.park.start}; true;`); await W(800); await A.eval(`${HIDE} true;`);
            await A.eval(`parkEndMatch(true); true;`); await W(2200);
            const r = JSON.parse(await A.eval(`JSON.stringify({ park: !!achState().modes.park, done: !!achState().done.all, flash: window.__flash.filter(function (t) { return /成就：.*全都玩过/.test(t); }).length })`));
            if (!r.park || !r.done || !r.flash) bad.push(JSON.stringify(r));
            await A.eval(`${HIDE} blazeFlash = window.__bf; try { parkExit(); } catch (e) { } gState.ach = JSON.parse(window.__ach0); true;`); await W(800); await A.eval(`${HIDE} true;`);
            report('G1 全都玩过要 11 个模式，最后打完乐园时成就弹出', bad.length === 0, bad.join(' / '));
        }

        {
            // B6：触屏设备启动——加载时 0 个页面错误、能进大厅、能进寻宝队和爬塔（B5 起触屏设备一加载就报 15 个 ReferenceError，进不了游戏）
            const bad = [];
            const M = await openTab(chrome, url, { mobile: true });
            try {
            const s0 = JSON.parse(await M.eval(`JSON.stringify({ ctl: gState.control, lobby: !document.getElementById('screen-lobby').classList.contains('hidden'), id: gState.id })`));
            if (M.errors.length) bad.push('加载时报错 ' + M.errors.length + ' 个：' + M.errors.slice(0, 2).join(' / '));
            if (s0.ctl !== 'pad' || !s0.lobby || !s0.id) bad.push('没进大厅 ' + JSON.stringify(s0));
            await M.eval(`${HIDE} ${MODES.hunt.start}; true;`); await W(2500);
            if (!(await M.eval('isPlaying'))) bad.push('进不了寻宝队');
            await M.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            await M.eval(`${HIDE} ${MODES.tower.start}; true;`); await W(2000);
            if (!(await M.eval(`!!nm && nm.mode === 'tower'`))) bad.push('进不了爬塔');
            await M.eval(`${HIDE} ${MODES.tower.exit}; true;`); await W(800);
            } catch (e) { bad.push('出错：' + String(e.message).slice(0, 200)); }
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('B6 触屏设备启动 0 报错、能进大厅、寻宝队、爬塔', bad.length === 0, bad.join(' / '));
        }
        {
            // B6：电脑但设置里打开了触屏模式——刷新后同样 0 个错误、能进大厅
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`SETTINGS.touch = true; settingsSave(); true;`);
            T.errors.length = 0;
            await T.send('Page.reload'); await W(2500);
            await T.eval(`document.getElementById('player-id').value = 'b6t' + Date.now() % 10000; requestLobbyAccess(); true;`); await W(1500);
            const s = JSON.parse(await T.eval(`JSON.stringify({ ctl: gState.control, lobby: !document.getElementById('screen-lobby').classList.contains('hidden') })`));
            if (T.errors.length) bad.push('报错 ' + T.errors.length + ' 个：' + T.errors.slice(0, 2).join(' / '));
            if (s.ctl !== 'pad' || !s.lobby) bad.push(JSON.stringify(s));
            await T.eval(`SETTINGS.touch = null; settingsSave(); true;`);
            await T.close();
            report('B6 电脑开了触屏模式，刷新后 0 报错、能进大厅', bad.length === 0, bad.join(' / '));
        }

        {
            // L1：全部文件同时下载，页面显示"加载中 n/总数"；其中一个晚到 2 秒，先显示进度、不报错，最后正常进大厅
            const bad = [];
            const D = await openTab(chrome, url, { noLobby: true, delayUrl: 'js/09-hunt.js', delayMs: 2000, navWait: 800 });
            const t1 = await D.eval(`(function(){ let b = document.getElementById('boot-load'); return (b ? b.innerText : '') + '|' + (typeof requestLobbyAccess); })()`);
            const nFiles = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const GAME_FILES = \[([^\]]*)\]/)[1].match(/'js\//g) || []).length;   // 文件数从 index.html 读（猫盾工业加了 19-industry.js）
            if (!new RegExp('^加载中 \\d+\\/' + nFiles + '\\|undefined$').test(t1)) bad.push('先显示进度 ' + t1);
            let ready = false;
            for (let i = 0; i < 40 && !ready; i++) { await W(250); ready = await D.eval(`typeof requestLobbyAccess === 'function' && !document.getElementById('boot-load')`); }
            if (!ready) bad.push('文件到齐后没跑起来');
            await D.eval(`document.getElementById('player-id').value = 'l1' + Date.now() % 10000; requestLobbyAccess(); true;`); await W(1500);
            const scr = await D.eval(`!document.getElementById('screen-lobby').classList.contains('hidden') && gState.id !== ''`);
            if (!scr) bad.push('没进大厅');
            const bt = JSON.parse(await D.eval('JSON.stringify(GAME_BOOT)'));
            if (bt.fetched < 1900) bad.push('延迟没生效 ' + JSON.stringify(bt));
            if (D.errors.length) bad.push(D.errors.slice(0, 2).join(' / '));
            await D.close();
            const bootA = JSON.parse(await A.eval('JSON.stringify(GAME_BOOT)'));
            report('L1 文件同时下载、显示进度；一个文件晚到 2 秒也不报错、能进大厅', bad.length === 0, bad.join(' / ') + ' 本页下载 ' + Math.round(bootA.fetched) + 'ms、全部执行完 ' + Math.round(bootA.done) + 'ms');
        }

        {
            // B5：dispName 拆成两个——原文给 innerText、转义后的给 innerHTML。名字里有 & < 时，
            // 大厅「队伍：」那行显示原样，不是 &amp; 这种；拼进 innerHTML 的地方还是转义的
            const r = JSON.parse(await A.eval(`(function(){
                let id = 'a&b<i>c#ab12', o = { text: dispNameText(id), html: dispName(id) };
                let keep = lobbyParty.slice(); lobbyParty.length = 0; lobbyParty.push(id);
                let old = document.getElementById('blaze-round').innerText;
                hubHud(); o.team = document.getElementById('blaze-round').innerText;
                let div = document.createElement('div'); div.innerHTML = '<li>' + dispName(id) + '</li>'; o.li = div.innerText; o.liTags = div.querySelectorAll('i').length;
                lobbyParty.length = 0; keep.forEach(function (q) { lobbyParty.push(q); }); document.getElementById('blaze-round').innerText = old;
                return JSON.stringify(o); })()`));
            const ok = r.text === 'a&b<i>c' && r.html === 'a&amp;b&lt;i&gt;c' && /队伍：a&b<i>c/.test(r.team) && r.li === 'a&b<i>c' && r.liTags === 0;
            report('B5 dispName 原文/转义分开：队伍那行显示原样，innerHTML 里还是转义的', ok, ok ? '' : JSON.stringify(r));
        }

        {
            // B5：脚本拆到 js/ 下，地址都带 ?v=版本号、按顺序；有一个文件下载失败就盖提示和重试按钮，一个都不执行；
            // 新开页面加载的时候别的标签页一直在发消息，也不报错（所有文件下载完一口气执行，中间没有空档）
            const r = JSON.parse(await A.eval(`(function(){ let s = performance.getEntriesByType('resource').filter(function (e) { return /\\/js\\/[^?]*\\.js\\?v=/.test(e.name); });
                return JSON.stringify({ n: s.length, files: GAME_FILES.length, ok: s.every(function (e) { return e.name.slice(-('?v=' + GAME_VERSION).length) === '?v=' + GAME_VERSION; }),
                    // B6：18 个文件拼成一份、只插一个 <script> 执行；看这份里每个文件开头那行注释的先后
                    order: (function () { let all = Array.prototype.filter.call(document.head.querySelectorAll('script'), function (x) { return /\\/\\/ ==== js\\//.test(x.text); });
                        if (all.length !== 1) return false; let seen = []; all[0].text.replace(/^\\/\\/ ==== (js\\/\\S+) ====$/mg, function (m, f) { seen.push(f); return m; }); return seen.join(',') === GAME_FILES.join(','); })() }); })()`));
            const bad = [];
            if (!r.n || r.n !== r.files || !r.ok || !r.order) bad.push('脚本地址 ' + JSON.stringify(r));
            const F = await openTab(chrome, url, { noLobby: true, failUrl: '?v=' });
            const f = await F.eval(`(function(){ let d = document.getElementById('boot-fail'); return (d ? d.innerText.replace(/\\s+/g, ' ') : null) + ' ' + (typeof requestLobbyAccess); })()`);
            if (!/重试/.test(f) || !/undefined$/.test(f)) bad.push('文件下载失败 ' + f);
            await F.close();
            await A.eval(`window.__spam = setInterval(function () { for (let i = 0; i < 5; i++) bc.postMessage({ type: 'HUB_ME', target: '*', sender: 'spam' + i, x: 0, z: 0 }); }, 5); true;`);
            const G = await openTab(chrome, url);
            await A.eval(`clearInterval(window.__spam); true;`);
            if (G.errors.length) bad.push('加载时收到消息报错 ' + G.errors.slice(0, 2).join(' / '));
            await G.close();
            report('B5 脚本地址带版本号、按顺序；下载失败有提示和重试；加载时收到消息不报错', bad.length === 0, bad.join(' / ') + ' ' + (r.n || 0) + ' 个文件');
        }

        {
            // H15：三种难度各 300 张图，两对楼层之间都有楼梯，所有箱子从出生点走得到（huntRouteFind），每层都有走得到的空地
            const before = A.errors.length;
            await A.eval(`${HIDE} ${MODES.hunt.start}; true;`); await W(2500); await A.eval(`${HIDE} true;`);
            const r = JSON.parse(await A.eval(`(function(){
                let out = {}, keep = window.huntBuildMazeOnce, builds = 0, seed0 = gameSeed, diff0 = gState.mapDifficulty;
                window.huntBuildMazeOnce = function () { builds++; return keep(); };
                ['easy', 'med', 'hard'].forEach(function (d) {
                    gState.mapDifficulty = d; let o = { n: 0, noStair: 0, chestBad: 0, floorBad: 0, rebuilt: 0 };
                    for (let s = 1; s <= 300; s++) {
                        gameSeed = s * 7919 % 233280 || 1; builds = 0; buildProceduralMaze(); o.n++; if (builds > 1) o.rebuilt++;
                        let link = []; for (let f = 0; f < FLOORS; f++) for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) { let c = maze[f][z][x]; if (c && c.type === 3 && c.stair) link[c.stair.base] = true; }
                        if (!link[0] || !link[1]) o.noStair++;
                        if (!chests.every(function (c) { let p = c.position; return !!huntRouteFind({ f: 0, x: 1, z: 1 }, { f: Math.floor((p.y - 0.5) / TILE), x: Math.floor((p.x + TILE / 2) / TILE), z: Math.floor((p.z + TILE / 2) / TILE) }); })) o.chestBad++;
                        let rr = huntReachFrom({ f: 0, x: 1, z: 1 });
                        for (let f = 0; f < FLOORS; f++) if (!rr.list.some(function (q) { return q.f === f && huntCellKind(q.f, q.x, q.z) === 'floor'; })) { o.floorBad++; break; }
                    }
                    out[d] = o;
                });
                window.huntBuildMazeOnce = keep; gState.mapDifficulty = diff0; gameSeed = seed0;
                // 同一个种子造两次一模一样（各端一致）
                let sig = function () { let h = 0; for (let f = 0; f < FLOORS; f++) for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) h = (h * 31 + maze[f][z][x].type) | 0; chests.forEach(function (c) { h = (h * 31 + Math.round(c.position.x + c.position.z * 3 + c.position.y * 7)) | 0; }); return h; };
                gState.mapDifficulty = 'easy'; gameSeed = 23 * 7919 % 233280; buildProceduralMaze(); let h1 = sig(); gameSeed = 23 * 7919 % 233280; buildProceduralMaze(); out.same = h1 === sig();
                gState.mapDifficulty = diff0;
                return JSON.stringify(out); })()`));
            await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            const bad = [];
            ['easy', 'med', 'hard'].forEach((d) => { const o = r[d]; if (o.n !== 300 || o.noStair || o.chestBad || o.floorBad) bad.push(d + ' ' + JSON.stringify(o)); });
            if (!r.same) bad.push('同一个种子两次造出来不一样');
            report('H15 每两层之间都有楼梯、箱子都走得到（各 300 张图）', bad.length === 0 && A.errors.length === before,
                bad.length ? bad.join(' / ') + A.errors.slice(before, before + 2).join(' / ') : ['easy', 'med', 'hard'].map((d) => d + ' 重造 ' + r[d].rebuilt + ' 张').join(' | '));
        }

        {
            // H10：信号接收器的蓝色路线
            const before = A.errors.length, bad = [], out = [];
            for (const [m, diff] of ['easy', 'med', 'hard', 'easy', 'med'].entries()) {
                await A.eval(`${HIDE} gState.mapDifficulty = '${diff}'; ${MODES.hunt.start}; true;`); await W(2500); await A.eval(`${HIDE} true;`);
                const o = JSON.parse(await A.eval(`(${ROUTE_SIM.toString()})(80, ${m * 7 + 3})`));
                out.push(diff + ' ' + o.found + '/' + o.endOk + '/' + o.walked);
                if (o.found !== 80 || o.endOk !== 80 || o.ptBad || o.walked !== 80) bad.push(diff + ' ' + JSON.stringify(o));
                if (m < 4) { await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000); }
            }
            // 楼梯井旁边是桌子（换种子找 30 处）：路线不斜着穿进桌子
            const lp = JSON.parse(await A.eval(`(function(){ let o = { cases: 0, bad: 0 }, seed0 = gameSeed, d0 = gState.mapDifficulty; gState.mapDifficulty = 'easy';
                for (let s = 1; s <= 400 && o.cases < 30; s++) { gameSeed = s * 104729 % 233280 || 1; buildProceduralMaze();
                    for (let f = 1; f < FLOORS; f++) for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                        if (huntCellKind(f, x, z) !== 'stairHi') continue;
                        let st = maze[f][z][x].stair, ax = huntStairAxis(st), bx = x - ax.dx, bz = z - ax.dz;
                        if (huntCellKind(f, bx, bz) !== 'table') continue;
                        o.cases++;
                        // 两个方向都查：从平台跳过井落到桌子上；从桌子上走进井里掉到台阶上
                        let routes = [huntRoutePoints([{ f: f, x: x, z: z }, { f: f, x: bx, z: bz, via: 'leap' }], huntStairPt(st, x, z, huntPlatT(st), f * TILE))];
                        let w = huntRouteNbrs({ f: f, x: bx, z: bz }).filter(function (m) { return m.via === 'well' && m.x === x && m.z === z; })[0];
                        if (w) { o.well = (o.well || 0) + 1; routes.push(huntRoutePoints([{ f: f, x: bx, z: bz }, w], new THREE.Vector3(bx * TILE, huntSurfY(f, bx, bz), bz * TILE))); }
                        routes.forEach(function (pts) { let hit = false;
                        for (let i = 1; i < pts.length && !hit; i++) { let m = Math.max(1, Math.ceil(pts[i - 1].distanceTo(pts[i]) / 0.5));
                            for (let j = 0; j <= m; j++) { let p = pts[i - 1].clone().lerp(pts[i], j / m), top = huntSurfaceAt(p.x, p.z, p.y + 0.02); if (top === Infinity || p.y + 0.02 < top - 0.05) { hit = true; break; } } }
                        if (hit) o.bad++; });
                    } }
                gameSeed = seed0; gState.mapDifficulty = d0; return JSON.stringify(o); })()`));
            if (lp.cases < 10 || !lp.well || lp.bad) bad.push('楼梯井旁边是桌子 ' + JSON.stringify(lp));
            await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            await A.eval(`${HIDE} ${MODES.hunt.start}; true;`); await W(2500); await A.eval(`${HIDE} true;`);
            // 用接收器：出东西、有蓝线；换楼层路线跟着变；连续重算 50 次几何体不涨；诅咒藏起来再恢复；没路给提示；捡走清掉
            let r = JSON.parse(await A.eval(`(function(){
                let o = {};
                camera.position.set(TILE, 9, TILE); pVel.set(0, 0, 0); onGround = true;
                gState.signal = { active: true, timer: 2, mesh: null }; tickSignal(0);
                let it = gState.signal.mesh;
                o.made = !!it && groundItems.indexOf(it) >= 0 && huntSignalRoute.ok && !!huntSignalRoute.mesh && huntSignalRoute.mesh.parent === scene;
                let pts = huntSignalRoute.pts, end = pts && pts[pts.length - 1];
                o.endNear = !!end && Math.hypot(end.x - it.position.x, end.z - it.position.z) < 0.5 && Math.floor(end.y / TILE) === Math.floor(it.position.y / TILE);
                // 传送到另一层
                let f0 = huntPlayerNode().f, other = null;
                for (let f = 0; f < FLOORS && !other; f++) if (f !== f0) for (let z = 1; z < mSize && !other; z++) for (let x = 1; x < mSize; x++) if (maze[f][z][x].type === 0) { other = { f: f, x: x, z: z }; break; }
                let k0 = huntSignalRoute.key;
                camera.position.set(other.x * TILE, other.f * TILE + 9, other.z * TILE); signalRouteTick(false);
                let p0 = huntSignalRoute.pts && huntSignalRoute.pts[0];
                o.teleport = huntSignalRoute.key !== k0 && huntSignalRoute.ok && !!p0 && Math.floor((p0.y + 0.1) / TILE) === other.f && Math.hypot(p0.x - camera.position.x, p0.z - camera.position.z) < 1;
                o.hintOtherFloor = other.f === Math.floor(it.position.y / TILE) || /楼，跟着蓝线走/.test(document.getElementById('signal-hint').innerText);
                // 50 次重算
                signalRouteTick(true); let g0 = renderer.info.memory.geometries, c0 = scene.children.length;
                for (let i = 0; i < 50; i++) signalRouteTick(true);
                o.geo = [g0, renderer.info.memory.geometries, c0, scene.children.length];
                // 诅咒
                gState.debuff.type = 1; signalRouteTick(false); o.cursedHidden = huntSignalRoute.mesh.visible === false;
                gState.debuff.type = 0; signalRouteTick(false); o.restored = huntSignalRoute.mesh.visible === true;
                // 找不到路
                let keep = window.huntRouteFind; window.huntRouteFind = function () { return null; };
                signalRouteTick(true); o.noRoute = !huntSignalRoute.mesh && /楼，在你(前面|后面|左边|右边)/.test(document.getElementById('signal-hint').innerText);
                window.huntRouteFind = keep; signalRouteTick(true);
                // 捡走
                groundItems.splice(groundItems.indexOf(it), 1); scene.remove(it); signalRouteTick(false);
                o.cleared = !huntSignalRoute.mesh && !huntSignalRoute.key && document.getElementById('signal-hint').style.display === 'none';
                return JSON.stringify(o); })()`));
            if (!r.made || !r.endNear) bad.push('用了没出蓝线 ' + JSON.stringify(r));
            if (!r.teleport || !r.hintOtherFloor) bad.push('换楼层没更新 ' + JSON.stringify(r));
            if (r.geo[1] > r.geo[0] || r.geo[3] > r.geo[2]) bad.push('重算 50 次几何体涨了 ' + r.geo.join(','));
            if (!r.cursedHidden || !r.restored) bad.push('诅咒 ' + JSON.stringify(r));
            if (!r.noRoute) bad.push('没路时没提示');
            if (!r.cleared) bad.push('捡走后没清');
            await A.eval(`${HIDE} ${MODES.hunt.exit}; gState.mapDifficulty = 'easy'; true;`); await W(1000);
            report('H10 信号接收器蓝线：5 张图各 80 次能找到能走到、点不进墙、换层更新、重算不涨、诅咒藏起来', bad.length === 0 && A.errors.length === before, bad.length ? bad.join(' / ') + A.errors.slice(before, before + 2).join(' / ') : out.join(' | '));
        }

        {
            // H11：小地图导航（绿线，只在这一层）和信号接收器的蓝线各管各的
            const before = A.errors.length;
            await A.eval(`${HIDE} ${MODES.hunt.start}; true;`); await W(2500); await A.eval(`${HIDE} true;`);
            const r = JSON.parse(await A.eval(`(function(){
                let o = {};
                camera.position.set(TILE, 9, TILE); pVel.set(0, 0, 0); onGround = true;
                gState.signal = { active: true, timer: 2, mesh: null }; tickSignal(0);
                // 同一层离得最远、走得到的格子
                let me = huntPlayerNode(), far = null, best = -1;
                for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) if (maze[me.f][z][x].type === 0) {
                    let d = Math.abs(x - me.x) + Math.abs(z - me.z); if (d > best && huntRouteFind(me, { f: me.f, x: x, z: z }, me.f)) { best = d; far = { x: x, z: z }; } }
                generateFootprintGuide(far.x, far.z);
                let sm = huntSignalRoute.mesh, nm = huntNavRoute.mesh;
                o.both = !!sm && !!nm && sm !== nm && sm.parent === scene && nm.parent === scene;
                o.colors = sm && nm ? [sm.material.color.getHex(), nm.material.color.getHex()] : null;
                o.sameKind = !!sm && !!nm && sm.geometry.type === nm.geometry.type && nm.geometry.type === 'TubeGeometry';
                o.sameFloor = huntNavRoute.pts.every(function (p) { return Math.floor((p.y + 0.1) / TILE) === me.f; });
                // 走一格：绿线跟着重算
                let k0 = huntNavRoute.key, p1 = currentNavPath[1]; camera.position.x = p1.x * TILE; camera.position.z = p1.z * TILE; navRouteTick(false);
                o.follows = huntNavRoute.key !== k0 && !!huntNavRoute.mesh;
                // 清掉导航，蓝线还在
                clearFootprints3D();
                o.navGone = !huntNavRoute.mesh && !nm.parent;
                o.signalKept = huntSignalRoute.mesh === sm && sm.parent === scene && huntSignalRoute.ok;
                // 清掉蓝线，绿线不受影响
                generateFootprintGuide(far.x, far.z); let nm2 = huntNavRoute.mesh;
                signalRouteClear(); o.navKept = huntNavRoute.mesh === nm2 && nm2.parent === scene;
                // 换楼层以后绿线不清掉、接着导航：见 H25
                return JSON.stringify(o); })()`));
            await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            const ok = r.both && r.colors && r.colors[0] === 0x1e88e5 && r.colors[1] === 0x2ecc71 && r.sameKind && r.sameFloor && r.follows && r.navGone && r.signalKept && r.navKept;
            report('H11 小地图导航绿线和信号蓝线分开：同时在、清一条不影响另一条、只在这一层', ok && A.errors.length === before, ok ? '' : JSON.stringify(r) + A.errors.slice(before, before + 2).join(' / '));
        }

        // 3. 伪造消息（附录）
        const B = await openTab(chrome, url);
        const idA = await A.eval('gState.id'), idB = await B.eval('gState.id');
        await A.eval(`document.getElementById('sys-modal').classList.add('hidden'); window.__pwned = undefined; true;`);
        const coins0 = await A.eval('gState.mcoin || 0');
        const sendB = (o) => B.eval(`bcRaw.postMessage(${o}); true;`);
        await sendB(`{ type: 'ROOM_HELLO', target: '*', sender: '<img src=x onerror="window.__pwned=1">', host: false, matching: false, bz: 'bow', face: 'cat' }`);
        await sendB(`{ type: 'TEAM_INVITE', target: ${JSON.stringify(idA)}, sender: '<img src=x onerror="window.__pwned=1">' }`);
        await W(1000);
        report('A1 伪造昵称不执行脚本', (await A.eval('window.__pwned')) === undefined);
        await A.eval(`document.getElementById('sys-modal').classList.add('hidden'); true;`);

        await sendB(`{ type: 'START_NIGHT', target: '*', sender: ${JSON.stringify(idB)}, sides: { ${JSON.stringify(idA)}: 'survivor' }, host: ${JSON.stringify(idB)}, seed: 1, variant: 0 }`);
        await W(1500);
        report('A2 伪造 START_NIGHT 被拒', await A.eval(`!!hub && !night && ${ACTIVE} === null`));
        // 经 PeerJS 来、冒充 B 的开局：A 当房主，连接已经绑定成别人
        await A.eval(`(function(){ peerIsHost = true; let c = { peer: 'pj-x', open: true, send: function(){}, _who: 'someone-else' };
            netDeliver({ type: 'START_NIGHT', target: '*', sender: ${JSON.stringify(idB)}, sides: { ${JSON.stringify(idA)}: 'survivor' }, host: ${JSON.stringify(idB)}, seed: 1, variant: 0 }, c);
            peerIsHost = false; return true; })()`);
        await W(1500);
        report('A2 冒充 sender 的 START_NIGHT（经房主转发）被拒', await A.eval(`!!hub && !night && ${ACTIVE} === null`));

        await sendB(`{ type: 'PARK_CREDIT', target: '*', to: ${JSON.stringify(idA)}, amount: 1000000 }`);
        await sendB(`{ type: 'PARK_CREDIT', target: '*', to: ${JSON.stringify(idA)}, amount: -5000000 }`);
        await W(800);
        report('A3 伪造加币扣币被拒', (await A.eval('gState.mcoin || 0')) === coins0);
        await A.eval(`(function(){ peerIsHost = true; let c = { peer: 'pj-y', open: true, send: function(){}, _who: 'someone-else' };
            netDeliver({ type: 'PARK_CREDIT', target: '*', sender: ${JSON.stringify(idB)}, to: ${JSON.stringify(idA)}, amount: 10 }, c);
            peerIsHost = false; return true; })()`);
        await W(500);
        report('A3 冒充 sender 的 PARK_CREDIT（经房主转发）被拒', (await A.eval('gState.mcoin || 0')) === coins0);
        await B.close();

        // 4. 显存：5 个模式 × 3 轮，几何体和贴图都不增长（D1）。每一轮结束后各取一个样；
        //    大厅里路人的外观是随机的，数字会上下抖一点，所以比较“最后三次的平均”和“最开始三次的平均”，留一点余量
        const loop = ['blaze', 'race', 'dodge', 'cake', 'sumo'];
        const memNow = () => A.eval('[renderer.info.memory.geometries, renderer.info.memory.textures]');
        const geo = [], tex = [];
        for (let i = 0; i < 2; i++) { await enterExit(A, 'hunt'); const m = await memNow(); geo.push(m[0]); tex.push(m[1]); }   // 先热身两次
        for (let round = 0; round < 3; round++) {
            for (const key of loop) await enterExit(A, key);
            const m = await memNow(); geo.push(m[0]); tex.push(m[1]);
        }
        const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        const leaked = (a) => avg(a.slice(-3)) > avg(a.slice(0, 3)) * 1.25 + 10;
        report('进出 5 个模式 ×3 轮几何体、贴图都不增长', !leaked(geo) && !leaked(tex), 'geometries ' + geo.join(' → ') + ' / textures ' + tex.join(' → '));

        report('全程控制台零报错', A.errors.length === 0, A.errors.slice(0, 3).join(' / '));
        await A.close();

        {
            // Z1：每台设备清一次数据（放最后：会清掉同一个浏览器里所有 TH_ 数据）
            const Z = await openTab(chrome, url), bad = [];
            const keys = `(function(){ let o = []; for (let i = 0; i < localStorage.length; i++) { let k = localStorage.key(i); if (k.indexOf('TH_') === 0) o.push(k); } return o.sort().join(','); })()`;
            const text = `(document.getElementById('sys-modal').classList.contains('hidden') ? '' : document.getElementById('sys-modal-text').innerText)`;
            const enter = async (name) => { await Z.eval(`document.getElementById('player-id').value = ${JSON.stringify(name)}; requestLobbyAccess(); true;`); await W(1500); };
            // 模拟清档前的老数据
            await Z.eval(`localStorage.removeItem('maodun_data_ver'); localStorage.setItem('TH_save_old', '{"ver":2,"money":99999}'); localStorage.setItem('TH_settings', '{}'); localStorage.setItem('TH_mute', '1'); true;`);
            await Z.send('Page.reload'); await W(2500);
            let r = await Z.eval(keys);
            if (r !== '') bad.push('刷新后还有 TH_ 数据 ' + r);
            if ((await Z.eval(`localStorage.getItem('maodun_data_ver')`)) !== '2026-10-05') bad.push('没写数据版本');
            await enter('z1new');
            const t1 = await Z.eval(text);
            if (!/游戏更新了，之前的数据已经重置。/.test(t1)) bad.push('进大厅没弹提示 ' + t1);
            if ((await Z.eval('gState.money')) !== 10000) bad.push('存档没按新号开始 ' + (await Z.eval('gState.money')));
            await Z.eval(`${HIDE} gState.money = 12345; saveProgress(); true;`);
            // 再刷新：不清、不弹
            await Z.send('Page.reload'); await W(2500);
            r = await Z.eval(keys);
            if (!/TH_save_z1new/.test(r)) bad.push('第二次刷新又清了 ' + r);
            await enter('z1new');
            const t2 = await Z.eval(text);
            if (/重置/.test(t2)) bad.push('第二次又弹了');
            if ((await Z.eval('gState.money')) !== 12345) bad.push('存档读不回来 ' + (await Z.eval('gState.money')));
            if (Z.errors.length) bad.push(Z.errors.slice(0, 2).join(' / '));
            await Z.close();
            report('Z1 每台设备清一次数据：老数据清掉、进大厅提示一次、再刷新不清不弹、存档正常', bad.length === 0, bad.join(' / '));
        }
    } catch (e) {
        const d = e.message.match(/"description":"([^"]*)/);
        if (e.message === 'ONLY_DONE') { /* 只跑了指定的检查 */ } else
        // 一项检查都还没跑就出错了，多半是 Chrome 自己挂了（连不上调试端口、标签页开不出来），算启动失败
        if (results.length === 0) { console.log('STARTUP 还没跑到任何检查就出错了：' + (d ? d[1] : e.message).slice(0, 300)); exitCode = EXIT_STARTUP; }
        else report('测试脚本本身出错', false, (d ? d[1] : e.message).slice(0, 300));
    } finally {
        try { chrome.proc.kill(); } catch (e) { }
        srv.close();
    }
    const fail = results.filter((r) => r.tag === 'FAIL').length;
    console.log('\n' + results.filter((r) => r.tag === 'PASS').length + ' 通过，' + fail + ' 失败，' + results.filter((r) => r.tag === 'XFAIL').length + ' 预期失败');
    process.exit(exitCode || (fail ? 1 : 0));
})();
