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
//   2. 12 个模式都能进、能退回大厅
//   3. TASKS.md 附录里的伪造消息（A1 昵称注入、A2 强行开局、A3 加币扣币）全部被拒，
//      另外模拟经 PeerJS 房主转发、冒充别人 sender 的 START_NIGHT 和 PARK_CREDIT
//   4. 依次进出 5 个模式、循环 3 轮，renderer.info.memory.geometries 不增长
//      （D1 做完前这一条预期失败：EXPECT_GEOMETRY_LEAK = true 时只报告不算失败）
// PeerJS 换成 tests/peerjs-stub.js，同一浏览器的标签页靠 BroadcastChannel 互通。

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXPECT_GEOMETRY_LEAK = true;   // D1 做完后改成 false
// 调试用：SMOKE_ONLY=正则 只跑名字对得上的"本批新增"那一段检查（其余检查整个跳过），比如 SMOKE_ONLY='N21|R1'
const ONLY = process.env.SMOKE_ONLY ? new RegExp(process.env.SMOKE_ONLY) : null;
const want = (n) => !ONLY || ONLY.test(n);

const ROOT = path.resolve(__dirname, '..');
const W = (ms) => new Promise((r) => setTimeout(r, ms));
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
    if (opts && opts.mobile) {   // 触屏设备：has_touch + is_mobile
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
    } else await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    // T0：新号起完名字会自动开新手教程，别的检查都不要被它带走，所以默认带 ?notut=1；测教程本身的检查传 tut: true
    await send('Page.navigate', { url: (opts && opts.tut) ? url : url + '?notut=1' });
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
    await tab.eval(`gState.modeIntroShown = { hunt:1, night:1, blaze:1, race:1, jail:1, dodge:1, escape:1, park:1, cake:1, sumo:1, paint:1, tower:1 }; ${HIDE} true;`);
    return tab;
}

// 关掉弹窗。介绍卡片要连排队一起清掉，光藏起来的话 introOpen 一直是 true，单人密室会一直停着
// 注意：它把 introOpen 直接设成 false、清空排队，会盖住"卡片卡死"这类问题——测弹窗本身的检查（I1）不要用它
const HIDE = `document.getElementById('sys-modal').classList.add('hidden'); introQ.length = 0; introOpen = false; sysModalWait.length = 0;`;
const MODAL = `(document.getElementById('sys-modal').classList.contains('hidden') ? null : document.getElementById('sys-modal-title').innerText)`;
const CLICK_OK = `(function(){ let b = document.querySelector('#sys-modal-btns button'); if (b) b.click(); return !!b; })()`;

const MODES = {
    hunt: { start: `(requestStartGame(), requestEnterMap())`, exit: `(function(){ chooseLeave(); document.getElementById('game-over').classList.add('hidden'); nav('screen-lobby'); })()` },
    night: { start: `(NIGHT_MATCH_WAIT = 0, enterNightMatch('survivor'), nightPickChar('cat'))`, exit: `(endNightGame('测试退出'), setTimeout(function(){ let b = document.querySelector('#sys-modal-btns button'); if (b) b.click(); }, 900))` },
    blaze: { start: `blazeBegin(blazePlan([{ id: gState.id, key: 'bow' }]), gState.id, false)`, exit: `blazeExit()` },
    race: { start: `raceStart(false)`, exit: `raceExit()` },
    jail: { start: `jailBegin()`, exit: `jailExit()` },
    dodge: { start: `dodgeBegin(false)`, exit: `dodgeExit()` },
    escape: { start: `escapeBegin(null, null, 1)`, exit: `escapeExit()` },
    park: { start: `parkBegin(PARK_BUILTIN.easy)`, exit: `parkExit()` },
    cake: { start: `cakeBegin()`, exit: `cakeExit()` },
    sumo: { start: `nmBegin('sumo', [{ id: gState.id }], gState.id, 5, {})`, exit: `nmExit()` },
    paint: { start: `nmBegin('paint', [{ id: gState.id }], gState.id, 5, {})`, exit: `nmExit()` },
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
function TOWER_SIM(nTowers) {
    let mods = {}; DAILY_MODIFIERS.forEach(function (m) { mods[m.id] = { speedMul: m.speedMul, jumpMul: m.jumpMul }; });
    let keep = { speedMul: DAILY_MOD.speedMul, jumpMul: DAILY_MOD.jumpMul }, oldNm = nm, oldAdd = window.nmAdd, out = {};
    let moveSteps = function (g) { g.steps.forEach(function (s) { if (!s.mv) return; let nx = s.x0 + Math.sin(g.clock * 1.3 + s.ph) * s.mv; s.dx = nx - s.x; s.x = nx; }); };
    let onStep = function (a, s) { return a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half; };
    let at = function (s) { return { p: new THREE.Vector3(s.x, s.y, s.z), mvx: 0, mvz: 0, kx: 0, kz: 0, vy: 0, onGround: true, coyote: 0, actCd: 0, stunT: 0, isPlayer: true, facing: 0 }; };
    let hop = function (g, a, i) {
        let t = g.steps[i + 1];
        for (let T = 0; T < 6; T += 1 / 60) {
            moveSteps(g);
            let dx = t.x - a.p.x, dz = t.z - a.p.z, d = Math.hypot(dx, dz) || 1;
            let edge = a.onGround && NM_DEFS.tower.groundAt(g, a.p.x + a.mvx * 0.12, a.p.z + a.mvz * 0.12, a.p.y) < a.p.y - 0.5;
            nmPhysics(a, { x: dx / d, z: dz / d, jump: edge, act: false }, 1 / 60); g.clock += 1 / 60;
            if (onStep(a, t)) return true;
            if (a.onGround && Math.abs(a.p.y - g.steps[i].y) > 0.3) return false;
            if (a.p.y < t.y - 30) return false;
        }
        return false;
    };
    try {
        window.nmAdd = function () { };
        Object.keys(mods).forEach(function (id) {
            DAILY_MOD.speedMul = mods[id].speedMul; DAILY_MOD.jumpMul = mods[id].jumpMul;
            let bad = 0, frac = 0;
            for (let k = 0; k < nTowers; k++) {
                gameSeed = 1000 + k * 7919;
                let g = { opt: { kind: 'solo' }, clock: 0, actors: [], def: NM_DEFS.tower, mode: 'tower', fx: [] };
                NM_DEFS.tower.build(g); nm = g;
                for (let i = 0; i < g.steps.length - 1; i++) {
                    let ok = false;
                    for (let tr = 0; tr < 3 && !ok; tr++) { g.clock = tr * 1.7; moveSteps(g); ok = hop(g, at(g.steps[i]), i); }
                    if (!ok) bad++;
                }
                g.clock = 0; moveSteps(g);
                let a = at(g.steps[0]);
                for (let i = 0; i < g.steps.length - 1; i++) if (!hop(g, a, i)) a = at(g.steps[i + 1]);
                let L = TOWER.lava0 * g.sc.h;
                for (let c = 0; c < g.clock; c += 1 / 60) if (c > TOWER.grace) L += (TOWER.rise0 + (TOWER.rise1 - TOWER.rise0) * Math.min(1, (c - TOWER.grace) / TOWER.riseRamp)) * g.sc.lava / 60;
                frac += L / towerTop(g).y / nTowers;
            }
            out[id] = { bad: bad, frac: +frac.toFixed(3) };
        });
    } finally { DAILY_MOD.speedMul = keep.speedMul; DAILY_MOD.jumpMul = keep.jumpMul; nm = oldNm; window.nmAdd = oldAdd; }
    return JSON.stringify(out);
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
    gState.mapDifficulty = diff; huntPityMul = (pity && diff === 'easy') ? 2 : 1;
    let conf = mapConfigs[diff], st = { wood: [0, 0], silver: [0, 0], gold: [0, 0], safe: [0, 0] };
    let sum = 0, any = 0, max = 0, maxAll = 0, over = 0;
    try {
        for (let m = 0; m < n; m++) {
            let types = [];
            if (pity && diff === 'easy') types.push('gold');
            for (let i = 0; i < conf.gold; i++) types.push('gold');
            for (let i = 0; i < conf.silver; i++) types.push('silver');
            for (let i = 0; i < conf.wood; i++) types.push('wood');
            if (conf.hasGoldShop) types.push('gold');
            if (diff !== 'easy' && (pity || (conf.hasSafe && Math.random() < 0.1))) types.push('safe');
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
                if (want('N21')) {
            // 夜间 #21：惊魂夜缺口真的开了；按住 E 彩弹占地一直喷（推推乐那种一次一下的不变）；双人队友的手跟着变色
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('night'); ${MODES.night.start}; true;`); await W(3500);
            const gaps = await T.eval(`(function(){ let n = 0; for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) { let g0 = maze[0][z][x], g1 = maze[1][z][x]; if (g0 && g0.type === 1 && !g0.crate && g1 && g1.type === 0) n++; } return n; })()`);
            if (gaps < 1) bad.push('二楼那一格缺口没开 ' + gaps);
            await T.eval(`${HIDE} ${MODES.night.exit}; true;`); await W(1800);
            await T.eval(`${HIDE} selectGameMode('paint'); ${MODES.paint.start}; true;`); await W(1500);
            const hold = await T.eval(`(function(){ keys['e'] = true; let a = nmWish({}), b = nmWish({}); return [a.act, b.act, !!keys['e']]; })()`);
            await T.eval(`keys['e'] = false; ${MODES.paint.exit}; true;`); await W(1500);
            if (hold[0] !== true || hold[1] !== true || hold[2] !== true) bad.push('按住 E 只喷一下 ' + JSON.stringify(hold));
            await T.eval(`${HIDE} selectGameMode('sumo'); ${MODES.sumo.start}; true;`); await W(1500);
            const tap = await T.eval(`(function(){ keys['e'] = true; let a = nmWish({}), b = nmWish({}); return [a.act, b.act]; })()`);
            await T.eval(`keys['e'] = false; ${MODES.sumo.exit}; true;`); await W(1500);
            if (tap[0] !== true || tap[1] !== false) bad.push('推推乐一次按键变了 ' + JSON.stringify(tap));
            const hands = await T.eval(`(function(){ let g = raceMakeBody(0xff0000, 0, true); let r = { mesh: g, col: 0xff0000 }; raceRecolorRacer(r, 0x2255ee);
                return JSON.stringify({ n: (g.userData.hands || []).length, ok: (g.userData.hands || []).every(function (h) { return h.material.color.getHex() === 0x2255ee; }) }); })()`);
            const hr = JSON.parse(hands);
            if (hr.n !== 2 || !hr.ok) bad.push('队友的手没变色 ' + hands);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('N21 惊魂夜二楼缺口打开；按住 E 彩弹一直喷；双人队友的手跟着变队伍色', bad.length === 0, bad.join(' / '));
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
            if (r.steps !== 4) bad.push('联机诊断是 ' + r.steps + ' 项');
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('A7 游戏里没有反馈入口；代码里搜不到 web3forms、access_key、邮箱；联机诊断四项', bad.length === 0, bad.join(' / '));
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
            for (let i = 0; i < 10 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            await W(800);
            const st = JSON.parse(await N.eval(`JSON.stringify({ open: introOpen, q: introQ.length, wait: sysModalWait.length, lobby: !!hub && ${ACTIVE} === null, modal: ${MODAL} })`));
            if (st.open || st.q || st.wait || !st.lobby || st.modal !== null) bad.push('回大厅后还卡着 ' + JSON.stringify(st));
            await N.eval(`selectGameMode('escape'); escapeBegin(null, null, 1); true;`); await W(1200);
            let started = false;
            for (let i = 0; i < 40 && !started; i++) { if ((await N.eval(MODAL)) !== null) await clickModal(N); else await W(400); started = await N.eval('escapeRoom && escapeRoom.started'); }
            const c1 = await N.eval('escapeRoom.clock'); await W(1500); const c2 = await N.eval('escapeRoom.clock');
            if (!started || !(c2 > c1)) bad.push('密室没走起来 ' + JSON.stringify({ started, c1, c2 }));
            await N.eval(`escapeExit(); true;`);
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('I1b 惊魂夜规则卡开着时 endNightGame：回大厅后 introOpen 为 false，单人密室能走', bad.length === 0, bad.join(' / '));
        }

                if (want('R1')) {
            // R1：单人局里，提示卡片开着时整局静止（场景里所有东西的位置都不变、按着 W 也走不动、拖鼠标不转视角），关了接着动；
            // 多人局里卡片变成屏幕上方的提示条，不弹窗、不暂停。12 个模式逐个测
            const bad = [];
            const T = await openTab(chrome, url);
            const SIG = `(function(){ let s = 0, n = 0; scene.traverse(function (o) { n++; s += o.position.x * 1.1 + o.position.y * 1.3 + o.position.z * 1.7 + o.scale.x + o.scale.y + o.scale.z + o.rotation.y; });
                let M = ({ blaze: blaze, night: night, race: race, jail: jail, dodge: dodge, escape: escapeRoom, park: park, cake: cake, sumo: nm, paint: nm, tower: nm })[chatActiveModeKey()], nums = [];
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
            report('R1 单人局卡片开着整局静止（12 个模式：场景、走、转视角都停），关了接着动', bad.length === 0, bad.join(' / '));
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
            if (await M.eval(`!!document.getElementById('run-btn') || typeof padToggleRun !== 'undefined'`)) bad.push('跑按钮还在');
            const th = await M.eval(`(function(){ let r = []; [0.5, 0.89, 0.91, 1].forEach(function (v) { tMove.x = v; tMove.y = 0; r.push(padAutoRun()); }); tMove.x = 0.7; tMove.y = 0.7; r.push(padAutoRun()); tMove.x = 0; tMove.y = 0; return r.join(); })()`);
            if (th !== 'false,false,true,true,true') bad.push('阈值不对 ' + th);
            const drain = async (key, getStam) => {
                await M.eval(`${HIDE} selectGameMode('${key}'); ${MODES[key].start}; true;`); await W(3500); await M.eval(`${HIDE} true;`);
                const out = [];
                for (const v of [0.6, 0.95]) {
                    await M.eval(`tMove.x = 0; tMove.y = 0; true;`); await W(1800);   // 先回满体力
                    const s0 = await M.eval(getStam);
                    await M.eval(`tMove.x = 0; tMove.y = ${-v}; true;`); await W(1000);
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
                if (!(d[0] < 3 && d[1] > 6)) bad.push(key + ' 体力变化 走=' + d[0] + ' 跑=' + d[1]);   // CI 帧率低，游戏里 1 秒走不满，阈值放宽
            }
            if (M.errors.length) bad.push(M.errors.slice(0, 2).join(' / '));
            await M.close();
            report('R2 平板摇杆推过 90% 自动跑：寻宝队、监狱救援、躲避球推到底耗体力、没推到不耗；没有"跑"按钮', bad.length === 0, bad.join(' / '));
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
            const expectStep = async (n, why) => { await W(500); const s = await step(); if (s !== n) bad.push(why + '：应在第 ' + (n + 1) + ' 步，实际 ' + s); };
            // 别的动作不算
            await G.eval(`tutEvent('bag'); tutEvent('chest'); tutEvent('submit'); true;`); await expectStep(0, '做了别的事就进下一步');
            // 1 光圈
            await G.eval(`camera.position.set(gState.tutorial.ringC.x * TILE, 9, gState.tutorial.ringC.z * TILE); true;`); await expectStep(1, '走进光圈');
            // 2 转视角看橙色柱子（先确认没转过去之前不会算）
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
            if (!m1.before || !/"med":true/.test(m1.played)) bad.push('med 第一局 ' + JSON.stringify(m1));
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
            report('H17 每种难度第一次单人打是保底局（进图就算用掉），组队不算不记，老存档三个难度各给一次', bad.length === 0, bad.join(' / '));
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
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} gState.hp = 100; gState.inv[4] = ${SW}; true;`); await W(500);
            const a = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp, spd: weaponSpeedMul(), bonus: weaponHpBonus(), sword: SWORD_HP })`));
            if (a.sword !== 200 || a.max !== 300 || a.hp !== 300 || a.bonus !== 200 || a.spd !== 1) bad.push('带在背包里 ' + JSON.stringify(a));
            // 掉了一半血再放下剑：150/300 → 50/100（按比例）
            await T.eval(`gState.hp = 150; gState.inv[4] = null; true;`); await W(400);
            const b = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp })`));
            if (b.max !== 100 || b.hp !== 50) bad.push('放下剑 ' + JSON.stringify(b));
            // 腰包里的剑也算
            await T.eval(`gState.inv[3] = { n: '腰包', isShop: true, type: 'backpack_ext', bag: [${SW}, null, null] }; true;`); await W(400);
            const c = JSON.parse(await T.eval(`JSON.stringify({ max: effectiveMaxHp(), hp: gState.hp, spd: weaponSpeedMul() })`));
            if (c.max !== 300 || c.hp !== 150 || c.spd !== 1) bad.push('腰包里 ' + JSON.stringify(c));
            // 拿在手上：移速 ×1.15，血量加成不变不重复
            await T.eval(`gState.inv[3] = null; gState.inv[0] = ${SW}; gState.selectedSlot = 0; true;`); await W(400);
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
            await T.eval(`gState.hp = 80; updateHUD(); true;`); await W(300);
            const a = await q();
            if (a.hp !== '80/100' || !/^\d+\/100$/.test(a.st) || parseFloat(a.red) !== 80 || parseFloat(a.gold) !== 0) bad.push('没带剑 ' + JSON.stringify(a));
            if (/生命值|体力值/.test(a.left) || a.old) bad.push('左上角那两行还在 ' + a.left);
            await T.eval(`gState.inv[4] = { n: '猫盾骑士剑', v: SWORD_V, w: 5, type: 'wep', dmg: 150, spd: 1.15, hp: SWORD_HP }; true;`); await W(500);
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

                if (want('H21')) {
            // H21 运气猫爪：猫盾 + 黄金小鱼干 合成，彩虹光 + "发生了神奇的反应！"，立即用掉（不留东西）、运气层数 +1（不封顶）；
            // k = 1 − 0.8^L：紫色 k×50% 换金、金色 k×10% 换大金、保险柜 k 概率多抽留贵的、抽奖机大金 +k×5% 销毁 −k×15%；
            // 除合成时那一句，哪里都不说它的作用；AI 开箱不吃运气；每局从 0 开始
            const bad = [];
            const T = await openTab(chrome, url);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000); await T.eval(`${HIDE} true;`);
            const r = JSON.parse(await T.eval(`(function(){
                let o = {}, flashes = [], bf = blazeFlash; blazeFlash = function (t) { flashes.push(t); return bf.apply(this, arguments); };
                let mk = function (name) { let m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial()); m.position.set(camera.position.x, 2, camera.position.z); m.userData = Object.assign({}, (itemPool.purple.concat(itemPool.gold).filter(function (x) { return x.n === name; })[0]) || { n: name, v: 1, w: 1 }, { isItem: true }); scene.add(m); groundItems.push(m); return m; };
                let rec = GROUND_RECIPES.filter(function (x) { return x.id === 'luckclaw'; })[0];
                o.rec = !!rec && rec.a === '猫盾' && rec.b === '黄金小鱼干' && rec.out.v === 100000 && rec.out.w === 1;
                // 合成 5 次：原料不限，层数一直涨
                gState.huntLuck = 0; let before = groundItems.length;
                for (let i = 0; i < 5; i++) { mk('猫盾'); mk('黄金小鱼干'); executeGroundCombinationsLogic(); }
                o.L = gState.huntLuck; o.noItem = groundItems.length === before && !groundItems.some(function (g) { return g.userData.n === '运气猫爪'; });
                o.flash = flashes.filter(function (t) { return t === '发生了神奇的反应！'; }).length;
                o.found = huntFoundRecipe('luckclaw');
                o.beams = huntLureFx.length >= 3;
                // k 和换位概率（网格取样，精确）
                let kk = function (L) { gState.huntLuck = L; return huntLuckK(); };
                o.k = [kk(0), kk(1), kk(3)].map(function (x) { return +x.toFixed(4); });
                let frac = function (it, box, k) { let n = 0, N = 10000, kinds = {}; for (let i = 0; i < N; i++) { let d = huntLuckDecide(it, box, k, (i + 0.5) / N); if (d) { n++; kinds[d] = 1; } } return [n / N, Object.keys(kinds).join()]; };
                let k3 = 1 - Math.pow(0.8, 3);
                o.purple = frac(itemPool.purple[0], 'wood', k3); o.gold = frac(itemPool.gold[0], 'wood', k3); o.safe = frac(itemPool.god[0], 'safe', k3); o.big = frac(itemPool.ultra[0], 'gold', k3);
                o.k3 = k3;
                // 抽奖机
                let lot = function (kind, k) { let N = 20000, c = {}; for (let i = 0; i < N; i++) { let v = huntLotteryPick(kind, (i + 0.5) / N, k); c[v] = (c[v] || 0) + 1 / N; } return c; };
                o.lotG0 = lot('gold', 0); o.lotG = lot('gold', k3); o.lotP = lot('purple', k3);
                // 层数 0 时什么都不变；每局开始归零
                gState.huntLuck = 0; let m = mk(itemPool.purple[0].n); huntLuckApply(m, 'wood'); o.noLuckSame = m.userData.n === itemPool.purple[0].n;
                gState.huntLuck = 40; let up = 0, tries = 60; for (let i = 0; i < tries; i++) { let mm = mk(itemPool.purple[0].n); huntLuckApply(mm, 'wood'); if (mm.userData.n !== itemPool.purple[0].n) up++; }
                o.upgrades = up;
                // 保险柜：留贵的，不会变便宜
                gState.huntLuck = 40; let cheap = true; for (let i = 0; i < 30; i++) { let mm = mk('x'); mm.userData = Object.assign({}, itemPool.god[3] || itemPool.god[0], { isItem: true }); let v0 = mm.userData.v; huntLuckApply(mm, 'safe'); if (mm.userData.v < v0) cheap = false; }
                o.safeKeepsBest = cheap;
                blazeFlash = bf;
                return JSON.stringify(o); })()`));
            if (!r.rec) bad.push('配方不对');
            if (r.L !== 5 || !r.noItem || r.flash !== 5 || !r.found || !r.beams) bad.push('合成 ' + JSON.stringify([r.L, r.noItem, r.flash, r.found, r.beams]));
            if (r.k.join() !== '0,0.2,0.488') bad.push('k=' + r.k.join());
            const near = (a, b) => Math.abs(a - b) < 0.002;
            if (!near(r.purple[0], r.k3 * 0.5) || r.purple[1] !== 'gold') bad.push('紫→金 ' + JSON.stringify(r.purple));
            if (!near(r.gold[0], r.k3 * 0.1) || r.gold[1] !== 'big') bad.push('金→大金 ' + JSON.stringify(r.gold));
            if (!near(r.safe[0], r.k3) || r.safe[1] !== 'extra') bad.push('保险柜 ' + JSON.stringify(r.safe));
            if (r.big[0] !== 0) bad.push('大金还会被换 ' + JSON.stringify(r.big));
            if (!(near(r.lotG0.big, 0.05) && near(r.lotG0.destroy, 0.25))) bad.push('没运气的抽奖变了 ' + JSON.stringify(r.lotG0));
            if (!(near(r.lotG.big, 0.05 + 0.05 * r.k3) && near(r.lotG.destroy, 0.25 - 0.15 * r.k3) && near(r.lotG.purple, 0.15) && near((r.lotG.big + r.lotG.destroy + r.lotG.purple + r.lotG.gold), 1))) bad.push('抽奖(金) ' + JSON.stringify(r.lotG));
            if (!(near(r.lotP.destroy, 0.25 - 0.15 * r.k3) && near(r.lotP.purple, 0.6) && !r.lotP.big)) bad.push('抽奖(紫) ' + JSON.stringify(r.lotP));
            if (!r.noLuckSame || r.upgrades < 15 || r.upgrades > 55 || !r.safeKeepsBest) bad.push('实际换位 ' + JSON.stringify([r.noLuckSame, r.upgrades, r.safeKeepsBest]));
            // 哪里都不说它的作用：公告只写"神秘配方"，规则、介绍、页面上都没有"运气猫爪"和运气层数
            const txt = JSON.parse(await T.eval(`JSON.stringify({ log: JSON.stringify(CHANGELOG), rules: Object.keys(MODE_RULES).map(function (k) { return rulesHtml(k); }).join(''), page: document.body.innerHTML, intro: typeof HUNT_ITEM_INTRO !== 'undefined' ? JSON.stringify(HUNT_ITEM_INTRO) : '' })`));
            if (/运气|猫爪/.test(txt.log.replace(/运气好/g, '')) && !/神秘配方/.test(txt.log)) bad.push('公告提到了');
            if (!/多了一个神秘配方/.test(txt.log)) bad.push('公告没写“多了一个神秘配方”');
            ['rules', 'page', 'intro'].forEach((k) => { if (/运气猫爪|运气层|运气值/.test(txt[k])) bad.push(k + ' 里提到了运气'); });
            // 每局归零；运气只在玩家自己开箱/信号接收器两处用（AI 开箱的代码不碰）
            await T.eval(`gState.huntLuck = 7; ${HIDE} ${MODES.hunt.exit}; true;`); await W(1200);
            await T.eval(`${HIDE} selectGameMode('hunt'); ${MODES.hunt.start}; true;`); await W(3000);
            if ((await T.eval('gState.huntLuck')) !== 0) bad.push('新的一局没归零');
            const callers = ['08-night.js', '09-hunt.js'].map((f) => (fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').match(/huntLuckApply\(/g) || []).length).reduce((a, b) => a + b, 0);
            if (callers !== 3) bad.push('huntLuckApply 的调用点数量 ' + callers);   // 定义 1 + 玩家开箱 1 + 信号接收器 1
            await T.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            if (T.errors.length) bad.push(T.errors.slice(0, 2).join(' / '));
            await T.close();
            report('H21 运气猫爪：合成立即用掉、层数 +1 不封顶；紫→金 k×50%、金→大金 k×10%、保险柜多抽留贵、抽奖机 +5%/−15%；哪里都不说明；每局归零', bad.length === 0, bad.join(' / '));
        }

                if (want('H22')) {
            // H22：开箱非大金的结果木箱 6% / 银箱 8% / 金箱 10% 换成药水（立即用）；猫神护身符每张图 25% 藏在桌面或顶楼死角，带着它死亡 = 满血站起来、5 米内的怪全死、护身符碎、本局上限 −40（最低 30）
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
            report('H22 开箱药水（6/8/10%，立即用）；猫神护身符 25% 藏在桌面或顶楼死角，带着死亡满血站起来、5 米内怪全死、上限 −40', bad.length === 0, bad.join(' / '));
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
            await T.eval(`gState.hp = 10; keys['r'] = true; true;`); await W(300);
            const g1 = JSON.parse(await T.eval(`JSON.stringify([abilityActive, abilityCd, document.getElementById('skill-name').innerText, document.getElementById('skill-icon').className])`));
            await W(2000);
            // 无头浏览器帧率低，游戏时间比真实时间慢：用技能剩余时间算游戏里过了多久
            const g2 = JSON.parse(await T.eval(`JSON.stringify([abilityActive, gState.hp])`));
            const played = 8 - g2[0];
            if (!(g1[0] > 7 && g1[0] <= 8 && g1[1] > 39) || !/^\d+秒$/.test(g1[2]) || !/on/.test(g1[3])) bad.push('绿色放技能 ' + g1.join());
            if (!(played > 0.5 && Math.abs((g2[1] - 10) - 5 * played) < 3)) bad.push('绿色回血：游戏里过了 ' + played.toFixed(2) + ' 秒，血量 10 → ' + g2[1] + '（应该每秒 5）');
            // 冷却中再按 R 不重新放
            await T.eval(`abilityActive = 0; keys['r'] = true; true;`); await W(300);
            if ((await T.eval('abilityActive')) !== 0) bad.push('冷却中又放了');
            // 黄色：移速
            await T.eval(`gState.char = 'yellow'; abilityCd = 0; abilityActive = 0; window.__sp = []; (function(){ let h0 = huntPhysics; window.__h0 = h0; huntPhysics = function (dt, mx, mz, sp) { window.__sp.push(sp); return h0.apply(this, arguments); }; })(); keys['w'] = true; true;`); await W(600);
            const base = await T.eval(`window.__sp.slice(-5)`);
            await T.eval(`window.__sp = []; keys['r'] = true; true;`); await W(700);
            const during = await T.eval(`window.__sp.slice(-5)`);
            for (let i = 0; i < 40 && (await T.eval('abilityActive')) > 0; i++) await W(250);   // 等游戏里的 2 秒走完
            await T.eval(`window.__sp = []; true;`); await W(500);
            const after = await T.eval(`window.__sp.slice(-5)`);
            // 负重：背很重，平时慢，放技能时不受影响
            await T.eval(`abilityCd = 0; abilityActive = 0; for (let i = 0; i < 6; i++) gState.inv[i] = { n: '铁块' + i, v: 1, w: 12 }; window.__sp = []; true;`); await W(600);
            const heavy = await T.eval(`window.__sp.slice(-5)`);
            await T.eval(`window.__sp = []; keys['r'] = true; true;`); await W(600);
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
            await M.eval(`touchBtn.skill = true; true;`); await W(400);
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
            await T.eval(`gState.inv[0] = null; gState.inv[1] = Object.assign({}, shopItems['肾上腺素']); selectSlot(1); stamina = 100; keys['rmb'] = true; true;`); await W(400);
            const s1 = JSON.parse(await T.eval(`JSON.stringify([gState.inv[1].uses, gState.stimT])`));
            await T.eval(`keys['rmb'] = true; true;`); await W(400);
            const s1b = await T.eval('gState.inv[1].uses');
            await T.eval(`keys['shift'] = true; keys['w'] = true; true;`); await W(1200);
            const st1 = await T.eval('stamina');
            await T.eval(`keys['shift'] = false; keys['w'] = false; gState.stimT = 0; stamina = 100; true;`);
            await T.eval(`keys['shift'] = true; keys['w'] = true; true;`); await W(1200);
            const st2 = await T.eval('stamina');
            await T.eval(`keys['shift'] = false; keys['w'] = false; stamina = 100; true;`);
            if (s1[0] !== 2 || !(s1[1] > 15 && s1[1] <= 20) || s1b !== 2) bad.push('肾上腺素 ' + s1.join() + ' / ' + s1b);
            if (st1 < 99 || st2 > st1 - 3) bad.push('体力：有针 ' + st1 + '，没针 ' + st2);
            for (let i = 0; i < 2; i++) { await T.eval(`gState.stimT = 0; keys['rmb'] = true; true;`); await W(400); }
            if ((await T.eval('gState.inv[1]')) !== null) bad.push('用完 3 次还在');
            // 返魂药水
            const mk = `(function(){ let m = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial()); m.position.copy(camera.position); m.position.y -= 4; m.userData = { type: 'ai', name: 'NAME', hp: HP, hasRev: false, isRealPlayer: REAL }; scene.add(m); entities.push(m); return m; })()`;
            await T.eval(`gState.inv[2] = Object.assign({}, shopItems['返魂药水']); selectSlot(2); window.__sent = []; (function(){ let b = bc.postMessage.bind(bc); window.__bp = b; bc.postMessage = function (m) { window.__sent.push(m); return b(m); }; })(); true;`);
            // 旁边没人倒下：按住也没用
            await T.eval(`huntHold.f = true; true;`); await W(1500);
            if (!(await T.eval('!!gState.inv[2]'))) bad.push('没人倒下药水却用掉了');
            // 倒下的 AI 队友在 6 米外：不行；挪到 6 米内：按住 3 秒救起来 30 血
            await T.eval(`window.__ai = ${mk.replace('NAME', 'ai-mate').replace('HP', '0').replace('REAL', 'false')}; window.__ai.position.x += 40; true;`); await W(1200);
            if (!(await T.eval('!!gState.inv[2]'))) bad.push('6 米外也能救');
            await T.eval(`window.__ai.position.x = camera.position.x + 20; huntHold.f = false; true;`);
            // 按住 3 秒：直接喂时间（CI 帧率低，真等 3 秒游戏时间要很久）；松手就清零
            const prog = JSON.parse(await T.eval(`(function(){ let sel = gState.inv[2], o = []; huntReviveTick(1.5, sel, true); o.push(gState.reviveT); huntReviveTick(0.1, sel, false); o.push(gState.reviveT); huntReviveTick(1.5, sel, true); huntReviveTick(1.4, sel, true); o.push(!!gState.inv[2]); huntReviveTick(0.2, sel, true); o.push(!!gState.inv[2]); return JSON.stringify(o); })()`));
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
                window.__dp = { x: camera.position.x, z: camera.position.z }; gState.peerState['peer-q'] = 'active'; gState.isDead = true; gState.deathPos = camera.position.clone(); gState.spectating = sp; window.__sent.length = 0; return true; })()`); await W(400);
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
            const shopOrder = JSON.parse(await T.eval(`JSON.stringify(['地窖徽章', '肾上腺素', '返魂药水'].map(function (n) { return [n, shopItems[n].v]; }).sort(function (a, b) { return b[1] - a[1]; }).map(function (x) { return x[0]; }))`));
            const wantGarage = shopOrder.concat(['红下限', '金上限', '金下限', '紫1', '紫2']);
            if (r.sortedGarage.join() !== wantGarage.join()) bad.push('仓库整理后 ' + r.sortedGarage.join() + '（应该 ' + wantGarage.join() + '）');
            if (r.sortedInv.join() !== '腰包,鱼叉,医疗包,红宝,小金') bad.push('背包整理后 ' + r.sortedInv.join());
            if (!r.hole) bad.push('整理后有空位夹在中间');
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

                        //@@NEW@@
        if (ONLY) throw new Error('ONLY_DONE');

        // 2. 12 个模式
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
            report('规则按钮 12 个模式都能打开、关闭', bad.length === 0 && A.errors.length === before, bad.join(' / ') + A.errors.slice(before, before + 2).join(' / '));
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
            await drop('nm.me', -20); await W(400); await A.eval(`${HIDE} true;`);
            let o = JSON.parse(await st('nm.me'));
            if (o.out || o.cp !== 0 || o.falls !== 1 || o.y < o.cpY - 1) bad.push('单人 岩浆低于起点时掉下去 ' + JSON.stringify(o));
            await stand('nm.me', 10); await W(400); await A.eval(`${HIDE} true;`);
            await stand('nm.me', 20); await W(400); await A.eval(`${HIDE} true;`);
            await stand('nm.me', 10); await W(400); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            const gold = await A.eval(`nm.steps[20].flagMesh.material.color.getHex() === 0xffca28 && nm.steps[30].flagMesh.material.color.getHex() !== 0xffca28`);
            if (o.cp !== 20 || !gold) bad.push('存档点只升不降/旗子变色 ' + JSON.stringify(o) + ' ' + gold);
            await drop('nm.me', -20); await W(400); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            if (o.out || o.cp !== 20 || o.falls !== 2 || o.y < o.cpY - 1) bad.push('单人 回第 20 块 ' + JSON.stringify(o));
            const hud = await A.eval(`(nm.lavaY = nm.steps[20].y + 5, nm.def.hud(nm), document.getElementById('blaze-round').innerText)`);
            if (!/存档点被淹了/.test(hud)) bad.push('淹了没提示 ' + hud);
            await drop('nm.me', 5); await W(1200);
            o = JSON.parse(await st('nm.me'));
            const endTxt = await A.eval(`document.getElementById('sys-modal-text').innerText`);
            if (!o.out || !/掉下去 3 次/.test(endTxt)) bad.push('单人 淹了再掉 ' + JSON.stringify(o) + ' 结算:' + endTxt.slice(0, 60));
            await A.eval(`${HIDE} nmExit(); true;`); await W(1200);
            await begin('multi');
            // AI 也用同一套：岩浆低于它的存档点时掉下去回存档点
            await drop('nm.actors[1]', -20); await W(400);
            o = JSON.parse(await st('nm.actors[1]'));
            if (o.out || o.falls !== 1) bad.push('多人 AI 回存档点 ' + JSON.stringify(o));
            // 先把两个 AI 放到第 50 块（岩浆淹不到），不然起点上的 AI 跟着一起淹、这局直接结束
            await stand('nm.actors[1]', 50); await stand('nm.actors[2]', 50);
            await drop('nm.me', 5); await W(600); await A.eval(`${HIDE} true;`);
            o = JSON.parse(await st('nm.me'));
            const still = await A.eval(`!!nm && nm.actors.filter(function (a) { return !a.out; }).length`);
            if (!o.out || !still) bad.push('多人 淹了再掉应出局、局还在 ' + JSON.stringify(o) + ' 剩 ' + still);
            await A.eval(`${HIDE} nmExit(); true;`); await W(1200);
            await begin('duo');
            await drop('nm.me', 5); await W(600); await A.eval(`${HIDE} true;`);
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
                const r = JSON.parse(await N.eval(`JSON.stringify({ gold: chests.filter(function (c) { return c.userData.type === 'gold'; }).length, safe: chests.filter(function (c) { return c.userData.type === 'safe'; }).length, played: !!gState.huntDiffPlayed.easy, pity: gState.pityGuaranteed, mul: huntPityMul })`));
                await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
                return r;
            };
            const easyGold = await N.eval(`mapConfigs.easy.gold`);
            const r1 = await run('easy');
            if (r1.safe !== 0 || r1.gold !== easyGold + 1 || r1.mul !== 2 || !r1.played) bad.push('第一局 ' + JSON.stringify(r1));
            const r2 = await run('easy');
            if (r2.safe !== 0 || r2.gold !== easyGold || r2.mul !== 1) bad.push('第二局 ' + JSON.stringify(r2));
            await N.eval(`gState.pityGuaranteed = true; true;`);
            const r3 = await run('med');
            if (r3.safe !== 1 || r3.pity) bad.push('中等图保底 ' + JSON.stringify(r3));
            if (N.errors.length) bad.push(N.errors.slice(0, 2).join(' / '));
            await N.close();
            report('H12 简单图不出保险柜，保底局多 1 个金箱子；中等图保底还是保险柜', bad.length === 0, bad.join(' / ') + ' 第一局 ' + JSON.stringify(r1) + ' 第二局 ' + JSON.stringify(r2));
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
            const r = JSON.parse(await A.eval(`JSON.stringify((function () { let g = hub.meshes.map(function (m) { return m.geometry; });
                return { lamp: g.filter(function (x) { return x.type === 'SphereGeometry'; }).length,
                    bench: g.filter(function (x) { return x.type === 'BoxGeometry' && x.parameters.width === 10 && x.parameters.height === 2 && x.parameters.depth === 4; }).length,
                    pole: g.filter(function (x) { return x.type === 'CylinderGeometry' && x.parameters.height === 16; }).length,
                    board: g.filter(function (x) { return x.type === 'PlaneGeometry' && x.parameters.width === 16 && x.parameters.height === 8; }).length }; })())`));
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
            // C6b：大厅"联机诊断"——四项依次出"通/不通/用时"，最后一句结论，有"复制结果"；只读，不动游戏自己的连接
            const bad = [];
            // 测试环境里游戏自己的连接是个一直失败重连的桩，先停掉它，测完看诊断有没有碰它（还应该是 null、没有连接），再连回去
            await A.eval(`${HIDE} window.__room0 = peerRoom; netLeaveRoom(true); Array.prototype.find.call(document.querySelectorAll('#lobby-tl button'), function (b) { return b.innerText === '联机诊断'; }).click(); true;`);
            let done = false;
            for (let i = 0; i < 100 && !done; i++) { await W(300); done = await A.eval(`!!netDiag && netDiag.done`); }
            const r = JSON.parse(await A.eval(`JSON.stringify({ title: document.getElementById('sys-modal-title').innerText, rows: document.querySelectorAll('#net-diag > div').length,
                text: netDiagText(), copy: !!Array.prototype.find.call(document.querySelectorAll('#net-diag button'), function (b) { return b.innerText === '复制结果'; }),
                same: peer === null && peerConns.length === 0 && !peerWant })`));
            const lines = r.text.split('\n');
            if (!done) bad.push('没测完');
            if (r.title !== '联机诊断' || r.rows !== 5 || !r.copy) bad.push('界面 ' + JSON.stringify(r));
            if (!/^1\. 联机组件加载：通/.test(lines[1]) || !lines.slice(1, 5).every((l) => /：(通|不通)/.test(l)) || !/^结论：./.test(lines[5])) bad.push('结果 ' + r.text);
            if (!r.same) bad.push('动了游戏自己的连接');
            await A.eval(`${HIDE} netJoinRoom(window.__room0); true;`);
            report('C6b 联机诊断四项都有结果和结论，能复制，不动游戏连接', bad.length === 0, bad.length ? bad.join(' / ') : lines.slice(1).join(' | '));
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
            const c1 = await N.eval('escapeRoom.clock'); await W(1500); const c2 = await N.eval('escapeRoom.clock');
            if (!started || !(c2 > c1)) bad.push('密室没走起来 ' + JSON.stringify({ started, c1, c2 }));
            await N.eval(`escapeExit(); true;`); await W(1000);
            for (let i = 0; i < 6 && (await N.eval(MODAL)) !== null; i++) await clickModal(N);
            // 3. 卡片开着时调一次普通弹窗：卡片不丢，两个依次关掉
            await N.eval(`introPush('测试卡片', '一'); showSysModal('普通弹窗', '二', [{ label: '好' }]); true;`); await W(300);
            const o1 = await clickModal(N), o2 = await clickModal(N), o3 = await N.eval(MODAL);
            const st3 = JSON.parse(await N.eval(`JSON.stringify({ open: introOpen, q: introQ.length, wait: sysModalWait.length })`));
            if (o1 !== '测试卡片' || o2 !== '普通弹窗' || o3 !== null || st3.open || st3.q || st3.wait) bad.push('卡片被盖 ' + JSON.stringify([o1, o2, o3, st3]));
            // 4. 卡片开着时代码直接把弹窗藏起来：introOpen 也回到 false，排队的下一张接着出
            await N.eval(`introPush('卡 1', 'a'); introPush('卡 2', 'b'); true;`); await W(300);
            await N.eval(`document.getElementById('sys-modal').classList.add('hidden'); true;`); await W(500);
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
            // G1：「全都玩过」12 个模式都算，乐园是最后一个打完时成就也弹出来
            const bad = [];
            await A.eval(`${HIDE} window.__ach0 = JSON.stringify(gState.ach || null); let S = achState(); S.modes = {}; delete S.done.all; delete S.got.all;
                ['hunt', 'night', 'blaze', 'race', 'jail', 'dodge', 'escape', 'cake', 'sumo', 'paint', 'tower'].forEach(function (k) { S.modes[k] = 1; });
                window.__flash = []; window.__bf = blazeFlash; blazeFlash = function (t) { window.__flash.push(t); return window.__bf.apply(this, arguments); }; true;`);
            const goal = await A.eval(`ACH_LIST.filter(function (a) { return a.id === 'all'; })[0].goal`);
            if (goal !== 12) bad.push('goal=' + goal);
            if (await A.eval(`achCheck('none', {}), !!achState().done.all`)) bad.push('11 个就算完成了');
            await A.eval(`${HIDE} ${MODES.park.start}; true;`); await W(800); await A.eval(`${HIDE} true;`);
            await A.eval(`parkEndMatch(true); true;`); await W(2200);
            const r = JSON.parse(await A.eval(`JSON.stringify({ park: !!achState().modes.park, done: !!achState().done.all, flash: window.__flash.filter(function (t) { return /成就：.*全都玩过/.test(t); }).length })`));
            if (!r.park || !r.done || !r.flash) bad.push(JSON.stringify(r));
            await A.eval(`${HIDE} blazeFlash = window.__bf; try { parkExit(); } catch (e) { } gState.ach = JSON.parse(window.__ach0); true;`); await W(800); await A.eval(`${HIDE} true;`);
            report('G1 全都玩过要 12 个模式，最后打完乐园时成就弹出', bad.length === 0, bad.join(' / '));
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
            // L1：17 个文件同时下载，页面显示"加载中 n/17"；其中一个晚到 2 秒，先显示进度、不报错，最后正常进大厅
            const bad = [];
            const D = await openTab(chrome, url, { noLobby: true, delayUrl: 'js/09-hunt.js', delayMs: 2000, navWait: 800 });
            const t1 = await D.eval(`(function(){ let b = document.getElementById('boot-load'); return (b ? b.innerText : '') + '|' + (typeof requestLobbyAccess); })()`);
            if (!/^加载中 \d+\/17\|undefined$/.test(t1)) bad.push('先显示进度 ' + t1);
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
                    // B6：17 个文件拼成一份、只插一个 <script> 执行；看这份里每个文件开头那行注释的先后
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

        // 4. 显存：5 个模式 × 3 轮
        const loop = ['blaze', 'race', 'dodge', 'cake', 'sumo'];
        const geo = [await A.eval('renderer.info.memory.geometries')];
        for (let round = 0; round < 3; round++) {
            for (const key of loop) await enterExit(A, key);
            geo.push(await A.eval('renderer.info.memory.geometries'));
        }
        const grew = geo[3] > geo[1] * 1.05 + 5;
        report('进出 5 个模式 ×3 轮几何体不增长', !grew, 'geometries ' + geo.join(' → ') + (EXPECT_GEOMETRY_LEAK && grew ? '（D1 前预期失败）' : ''), EXPECT_GEOMETRY_LEAK);

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
