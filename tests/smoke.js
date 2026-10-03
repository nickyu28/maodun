#!/usr/bin/env node
// 冒烟测试（B3）。不依赖任何 npm 包：Node 自己起一个静态服务器，用 Chrome 开发者协议驱动无头 Chrome。
//
//   node tests/smoke.js
//
// 环境变量：
//   CHROME_PATH   Chrome / Chromium 可执行文件（不填就在常见位置找）
//   THREE_LOCAL   three.min.js 的本地路径（填了就不从 CDN 下载，离线时用）
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
async function startChrome() {
    const port = 9400 + Math.floor(Math.random() * 400);
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'smoke-chrome-'));
    const proc = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
        '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
        async close() { try { ws.close(); } catch (e) { } await jget(chrome.port, '/json/close/' + info.id, 'PUT').catch(() => { }); }
    };
    const pid = (opts && opts.name) || ('smoke' + Math.floor(Math.random() * 100000));
    await tab.eval(`document.getElementById('player-id').value = ${JSON.stringify(pid)}; requestLobbyAccess(); true;`);
    await W(1500);
    await tab.eval(`gState.modeIntroShown = { hunt:1, night:1, blaze:1, race:1, jail:1, dodge:1, escape:1, park:1, cake:1, sumo:1, paint:1, tower:1 }; document.getElementById('sys-modal').classList.add('hidden'); true;`);
    return tab;
}

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
const ACTIVE = `(function(){ let k = chatActiveModeKey(); return k === 'hub' ? null : k; })()`;

async function enterExit(tab, key) {
    const m = MODES[key];
    await tab.eval(`document.getElementById('sys-modal').classList.add('hidden'); selectGameMode('${key}'); ${m.start}; true;`);
    await W(3000);
    const active = await tab.eval(ACTIVE);
    await tab.eval(`document.getElementById('sys-modal').classList.add('hidden'); ${m.exit}; true;`);
    await W(1800);
    await tab.eval(`document.getElementById('sys-modal').classList.add('hidden'); true;`);
    const back = await tab.eval(`!!hub && ${ACTIVE} === null`);
    return { active, back };
}

(async () => {
    const srv = await startServer();
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const chrome = await startChrome();
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
        report('测试脚本本身出错', false, e.message.slice(0, 300));
    } finally {
        try { chrome.proc.kill(); } catch (e) { }
        srv.close();
    }
    const fail = results.filter((r) => r.tag === 'FAIL').length;
    console.log('\n' + results.filter((r) => r.tag === 'PASS').length + ' 通过，' + fail + ' 失败，' + results.filter((r) => r.tag === 'XFAIL').length + ' 预期失败');
    process.exit(fail ? 1 : 0);
})();
