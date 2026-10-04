#!/usr/bin/env node
// 冒烟测试（B3）。不依赖任何 npm 包：Node 自己起一个静态服务器，用 Chrome 开发者协议驱动无头 Chrome。
//
//   node tests/smoke.js
//
// 环境变量：
//   CHROME_PATH   Chrome / Chromium 可执行文件（不填就在常见位置找）
//   THREE_LOCAL   three.min.js 的本地路径（填了就不从 CDN 下载，离线时用）
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
    let id = 0; const pending = new Map(); const errors = [];
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
            if (/peerjs/i.test(u)) send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: stub.toString('base64') });
            else if (/three(\.min)?\.js/i.test(u) && threeLocal) send('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: threeLocal.toString('base64') });
            else send('Fetch.continueRequest', { requestId: rid });
        }
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });
    await new Promise((r) => ws.addEventListener('open', r));
    await send('Runtime.enable'); await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*peerjs*' }, { urlPattern: '*three*' }] });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await W(2500);
    const tab = {
        errors,
        async eval(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
            if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
            return r.result.result.value;
        },
        send,
        async close() { try { ws.close(); } catch (e) { } await jget(chrome.port, '/json/close/' + info.id, 'PUT').catch(() => { }); }
    };
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
            let st = stairs[k % stairs.length], a0 = put(st, 1), ang = 0, turn = 0, sp = 42 * (k % 2 ? 1.6 : 1), hit = false;
            for (let t = 0; t < T; t += dt) {
                turn -= dt; if (turn <= 0) { ang = (rnd() * 2 - 1) * dev; turn = 0.2 + rnd() * 0.6; }
                if (jump && onGround && rnd() < dt * 1.5) { pVel.y = 44; onGround = false; }
                huntPhysics(dt, Math.cos(a0 + ang), Math.sin(a0 + ang), sp);
                let feet = camera.position.y - 9, top = topAt(camera.position.x, camera.position.z, feet);
                if (top !== null && feet < top - 0.5) hit = true;
            }
            if (hit) bad++;
            if (camera.position.y - 9 >= st.s.base * TILE + TILE - 0.5) climbed++;
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
            await W(4500);
            const run = await A.eval('JSON.stringify({ started: escapeRoom.started, clock: escapeRoom.clock })');
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
            // 腰包拿下来、扩展格的东西放不下
            await A.eval(`${HIDE} gState.inv = [S('腰包'), S('鱼叉'), S('鱼叉'), S('鱼叉'), S('鱼叉'), S('鱼叉'), S('医疗包'), S('医疗包'), null]; gState.garage[199] = null; true;`);
            const m4 = await A.eval(`garageDropProblem('inv', 0, 'garage', 199)`);
            if (!/腰包/.test(m4)) bad.push('腰包拿下来没拦住 ' + m4);
            await A.eval(`${HIDE} true;`);
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
        await A.eval(`${HIDE} gState.inv = Array(6).fill(null); gState.garage = Array(200).fill(null); gState.money = 0; nav('screen-lobby'); true;`);

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
