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
    await send('Page.navigate', { url });
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
const HIDE = `document.getElementById('sys-modal').classList.add('hidden'); introQ.length = 0; introOpen = false;`;
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
                const r = JSON.parse(await N.eval(`JSON.stringify({ gold: chests.filter(function (c) { return c.userData.type === 'gold'; }).length, safe: chests.filter(function (c) { return c.userData.type === 'safe'; }).length, first: gState.isFirstRound, pity: gState.pityGuaranteed, mul: huntPityMul })`));
                await N.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1500); await N.eval(`${HIDE} true;`);
                return r;
            };
            const easyGold = await N.eval(`mapConfigs.easy.gold`);
            const r1 = await run('easy');
            if (r1.safe !== 0 || r1.gold !== easyGold + 1 || r1.mul !== 2 || r1.first) bad.push('第一局 ' + JSON.stringify(r1));
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
            const st = await A.eval(`document.getElementById('garage-stash-container').scrollTop`);
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
            await B.close();
            let back = '';
            for (let i = 0; i < 40 && !/在线 1 人\|0$/.test(back); i++) { await W(300); back = await st(A); }
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
                // 换到别的楼层：小地图导航只管这一层，清掉
                camera.position.y += TILE; navRouteTick(false); o.otherFloorCleared = !huntNavRoute.mesh;
                return JSON.stringify(o); })()`));
            await A.eval(`${HIDE} ${MODES.hunt.exit}; true;`); await W(1000);
            const ok = r.both && r.colors && r.colors[0] === 0x1e88e5 && r.colors[1] === 0x2ecc71 && r.sameKind && r.sameFloor && r.follows && r.navGone && r.signalKept && r.navKept && r.otherFloorCleared;
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
