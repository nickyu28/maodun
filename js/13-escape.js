        // ══════════════════════════════════════════════════════════
        //  合作密室：8 个入门关 + 14 关，关卡全是数据（ESC_LEVELS），机关/陷阱/AI 都是通用的。
        //  没有战斗、没有淘汰，全队一起走到出口。
        //  机关：彩色板/重量板(plates)、拉杆(lever，站住才开)、限时按钮(timed)、
        //        顺序板(seq)、钥匙(key)、密码锁(code)
        //  陷阱：激光(高的要躲、矮的可以跳)、矮栏(要跳)、滚石(追着跑)
        //  AI 只干"站岗"的活（踩板、撑拉杆、按按钮）；顺序/钥匙/密码这种动脑子的只认
        //  真人——之前三个 AI 自己就能把整关打穿，玩家按住 W 五秒就通关。
        // ══════════════════════════════════════════════════════════
        const ESCAPE = {
            teamSize: 4, halfW: 28.5, wallH: 20, moveSpeed: 34, r: 2.6,
            jumpV: 36, gravity: 110, carrySlow: 0.7,
            plateR: 5.5, leverR: 4.5, btnR: 4, keyR: 4, lockR: 6, padR: 6.5,
            gateGrace: 2.5, cell: 2, spawnZ: 15, zMin: -12, countdown: 3
        };
        const ESC_ROLES = [
            { name: '红', hex: 0xef5350, css: '#ef5350' },
            { name: '蓝', hex: 0x42a5f5, css: '#42a5f5' },
            { name: '绿', hex: 0x66bb6a, css: '#66bb6a' },
            { name: '黄', hex: 0xffca28, css: '#ffca28' }
        ];
        const ESC_MECH_HUES = [0x26c6da, 0xab47bc, 0xff7043, 0x9ccc65, 0x5c6bc0];
        const ESC_LINES = {
            plate: ['我去踩这块板', '这块我来站着'],
            lever: ['我撑着拉杆，你们先过', '快过去，我最后一个走'],
            timed: ['大家都到门口了，我去按按钮', '我按了！快冲'],
            key: ['钥匙只有你能拿，去找找', '钥匙在这层里，你去捡一下'],
            seq: ['墙上有顺序提示，得你来踩', '按门上的颜色顺序踩板'],
            code: ['墙上有密码线索，你去输', '线索凑齐了去门边输密码'],
            waitYou: ['你那块板还空着', '就差你了，站到你颜色的板上'],
            win: ['都到了！通关了！', '出来了！']
        };

        function escColorPlates(z, roles) { return [-21, -7, 7, 21].map(function (x, i) { return { x: x, z: z, role: roles[i] }; }); }
        // 顺序板摆成 2×2：排成一排的话从一块走到另一块会踩过中间那块，算"踩错"直接清零
        function escSeqPlates(z) { return [[-15, z], [15, z], [-15, z + 20], [15, z + 20]].map(function (q, i) { return { x: q[0], z: q[1], role: i }; }); }
        const ESC_SPLIT_WALL = { x: 0, z: 95, w: 3, d: 130 };

        // 每关：name 名字、time 限时(秒)、stars [三星秒数, 两星秒数]、finish 终点线 z、
        // gates 门、mechs 机关（按过关顺序排，HUD 按这个顺序找"当前目标"）、
        // walls 额外的墙、boards 墙上的字、lasers/hurdles/boulder 陷阱、dark 暗室、tip 开局提示。
        // 前 ESC_INTRO_N 关是入门关：一关只教一样东西，第一次碰到会弹介绍卡片（escIntroCheck）
        const ESC_INTRO_N = 8;
        const ESC_LEVELS = [
            { name: '认颜色', intro: true, time: 120, stars: [12, 25], finish: 85,
                gates: [{ id: 'g1', z: 60 }],
                mechs: [{ type: 'plates', gate: 'g1', plates: escColorPlates(38, [0, 1, 2, 3]) }] },
            { name: '一起站', intro: true, time: 120, stars: [12, 25], finish: 85,
                gates: [{ id: 'g1', z: 60 }],
                mechs: [{ type: 'plates', gate: 'g1', plates: [{ x: -15, z: 38 }, { x: 15, z: 38, need: 2 }] }] },
            { name: '拉杆', intro: true, time: 120, stars: [14, 28], finish: 85,
                gates: [{ id: 'g1', z: 60 }],
                mechs: [{ type: 'lever', gate: 'g1', x: 18, z: 45 }] },
            { name: '钥匙', intro: true, time: 120, stars: [16, 30], finish: 95,
                gates: [{ id: 'g1', z: 70 }],
                mechs: [{ type: 'key', gate: 'g1', key: { x: -20, z: 32 }, lock: { x: 18, z: 62 } }] },
            { name: '按钮', intro: true, time: 120, stars: [16, 30], finish: 95,
                gates: [{ id: 'g1', z: 70 }],
                mechs: [{ type: 'timed', gate: 'g1', x: 18, z: 28, open: 4 }] },
            { name: '顺序', intro: true, time: 150, stars: [18, 34], finish: 100,
                gates: [{ id: 'g1', z: 75 }],
                mechs: [{ type: 'seq', gate: 'g1', plates: escSeqPlates(35), order: [2, 0, 3, 1] }] },
            { name: '密码', intro: true, time: 150, stars: [20, 40], finish: 100,
                gates: [{ id: 'g1', z: 75 }],
                boards: [{ z: 25, face: 'L', text: '密码第 1 位\n5' }, { z: 40, face: 'R', text: '密码第 2 位\n2' }, { z: 52, face: 'L', text: '密码第 3 位\n7' }],
                mechs: [{ type: 'code', gate: 'g1', pad: { x: 18, z: 66 }, code: '527', prompt: '输入三位密码' }] },
            { name: '激光和矮栏', intro: true, time: 120, stars: [10, 20], finish: 115,
                gates: [], mechs: [],
                lasers: [{ z: 40, w: 22, speed: 20 }, { z: 66, w: 30, speed: 22, low: true }],
                hurdles: [{ x: 0, z: 92, w: 57, d: 2, h: 4 }] },
            {
                name: '拉杆门', time: 150, stars: [20, 38], finish: 160,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 120 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: [{ x: -15, z: 38 }, { x: 15, z: 38 }] },
                    { type: 'lever', gate: 'g2', x: 18, z: 100 }
                ]
            },
            {
                name: '钥匙', time: 180, stars: [28, 50], finish: 170,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 130 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: [{ x: 0, z: 38, need: 2 }, { x: -18, z: 38 }, { x: 18, z: 38 }] },
                    { type: 'key', gate: 'g2', key: { x: -22, z: 100 }, lock: { x: 0, z: 124 } }
                ]
            },
            {
                name: '按顺序', time: 180, stars: [28, 50], finish: 175,
                gates: [{ id: 'g1', z: 75 }, { id: 'g2', z: 135 }],
                mechs: [
                    { type: 'seq', gate: 'g1', plates: escSeqPlates(38), order: [2, 0, 3, 1] },
                    { type: 'lever', gate: 'g2', x: -18, z: 115 }
                ]
            },
            {
                name: '限时大门', time: 180, stars: [26, 48], finish: 185,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 145 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: escColorPlates(38, [1, 3, 0, 2]) },
                    { type: 'timed', gate: 'g2', x: 0, z: 88, open: 4 }
                ]
            },
            {
                name: '四人重压', time: 210, stars: [38, 68], finish: 220,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 130 }, { id: 'g3', z: 180 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: [{ x: -14, z: 38, need: 2 }, { x: 14, z: 38, need: 2 }] },
                    { type: 'key', gate: 'g2', key: { x: 23, z: 78 }, lock: { x: -18, z: 124 } },
                    { type: 'lever', gate: 'g3', x: 20, z: 162 }
                ]
            },
            {
                name: '激光走廊', time: 210, stars: [32, 60], finish: 200,
                gates: [{ id: 'g1', z: 55 }, { id: 'g2', z: 160 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: escColorPlates(35, [3, 1, 2, 0]) },
                    { type: 'lever', gate: 'g2', x: -20, z: 142 }
                ],
                lasers: [{ z: 78, w: 22, speed: 24 }, { z: 98, w: 26, speed: 30, phase: 0.4 }, { z: 118, w: 20, speed: 36, phase: 0.75 }]
            },
            {
                name: '密码锁', time: 240, stars: [42, 80], finish: 220,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 130 }, { id: 'g3', z: 180 }],
                boards: [
                    { z: 25, face: 'L', text: '密码第 1 位\n3' },
                    { z: 85, face: 'R', text: '密码第 2 位\n8' },
                    { z: 108, face: 'L', text: '密码第 3 位\n5' }
                ],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: [{ x: -18, z: 38 }, { x: 18, z: 38 }] },
                    { type: 'code', gate: 'g2', pad: { x: 18, z: 120 }, code: '385', prompt: '输入三位密码' },
                    { type: 'lever', gate: 'g3', x: -18, z: 162 }
                ]
            },
            {
                name: '分头行动', time: 240, stars: [40, 75], finish: 200,
                walls: [ESC_SPLIT_WALL],
                gates: [{ id: 'gL', z: 85, x0: -28.5, x1: -1.5 }, { id: 'gR', z: 85, x0: 1.5, x1: 28.5 }],
                mechs: [
                    { type: 'lever', gate: 'gR', x: -15, z: 60 },
                    { type: 'lever', gate: 'gL', x: 15, z: 110 }
                ]
            },
            {
                name: '跨栏', time: 210, stars: [32, 60], finish: 235,
                gates: [{ id: 'g1', z: 72 }, { id: 'g2', z: 205 }],
                mechs: [
                    { type: 'seq', gate: 'g1', plates: escSeqPlates(35), order: [3, 1, 0, 2] },
                    { type: 'lever', gate: 'g2', x: 20, z: 192 }
                ],
                // 一跳大概能飞 22 个单位远：障碍之间至少隔开 25 以上，不然跳过一个正好落进下一个
                hurdles: [{ x: 0, z: 92, w: 57, d: 2, h: 4 }, { x: 0, z: 122, w: 57, d: 2, h: 4 }],
                lasers: [{ z: 158, w: 30, speed: 22, low: true }, { z: 182, w: 30, speed: 28, low: true, phase: 0.5 }]
            },
            {
                name: '暗室', time: 240, stars: [40, 75], finish: 190, dark: true,
                gates: [{ id: 'g1', z: 60 }, { id: 'g2', z: 150 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: escColorPlates(38, [0, 2, 1, 3]) },
                    { type: 'key', gate: 'g2', key: { x: -23, z: 70 }, lock: { x: 18, z: 144 } }
                ],
                lasers: [{ z: 95, w: 20, speed: 18 }, { z: 118, w: 24, speed: 22, phase: 0.5 }]
            },
            {
                name: '连锁机关', time: 270, stars: [48, 90], finish: 230,
                gates: [{ id: 'g1', z: 55 }, { id: 'g2', z: 120 }, { id: 'g3', z: 190 }],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: [{ x: -18, z: 35, need: 2 }, { x: 18, z: 35, role: 0 }] },
                    { type: 'timed', gate: 'g2', x: -20, z: 75, open: 4 },
                    { type: 'lever', gate: 'g3', x: 20, z: 172 }
                ],
                lasers: [{ z: 145, w: 22, speed: 28 }]
            },
            {
                name: '符号密码', time: 300, stars: [60, 110], finish: 230,
                walls: [ESC_SPLIT_WALL],
                gates: [{ id: 'gL', z: 85, x0: -28.5, x1: -1.5 }, { id: 'gR', z: 85, x0: 1.5, x1: 28.5 }, { id: 'g3', z: 185 }],
                boards: [
                    { z: 45, face: 'L', text: '▲ = 7' },
                    { z: 45, face: 'R', text: '● = 2' },
                    { z: 130, face: 'L', text: '■ = 9' }
                ],
                mechs: [
                    { type: 'lever', gate: 'gR', x: -15, z: 60 },
                    { type: 'lever', gate: 'gL', x: 15, z: 110 },
                    { type: 'code', gate: 'g3', pad: { x: 0, z: 175 }, code: '792', prompt: '按 ▲ ■ ● 的顺序输入' }
                ]
            },
            {
                name: '激光迷阵', time: 300, stars: [55, 100], finish: 270,
                gates: [{ id: 'g1', z: 70 }, { id: 'g2', z: 174 }, { id: 'g3', z: 230 }],
                mechs: [
                    { type: 'seq', gate: 'g1', plates: escSeqPlates(33), order: [1, 3, 0, 2] },
                    { type: 'key', gate: 'g2', key: { x: 23, z: 160 }, lock: { x: -18, z: 166 } },
                    { type: 'timed', gate: 'g3', x: 18, z: 190, open: 4 }
                ],
                lasers: [{ z: 86, w: 20, speed: 30 }, { z: 104, w: 36, speed: 26, low: true }, { z: 124, w: 24, speed: 36, phase: 0.3 }, { z: 144, w: 36, speed: 32, low: true, phase: 0.6 }]
            },
            {
                name: '滚石大逃亡', time: 330, stars: [65, 120], finish: 300,
                gates: [{ id: 'g1', z: 55 }, { id: 'g2', z: 110 }, { id: 'g3', z: 165 }],
                walls: [{ x: -21.5, z: 222, w: 14, d: 108 }, { x: 21.5, z: 222, w: 14, d: 108 }],
                boards: [
                    { z: 30, face: 'L', text: '密码第 1 位\n6' },
                    { z: 95, face: 'R', text: '密码第 2 位\n1' },
                    { z: 140, face: 'R', text: '密码第 3 位\n4' }
                ],
                mechs: [
                    { type: 'plates', gate: 'g1', plates: escColorPlates(35, [2, 3, 1, 0]) },
                    { type: 'plates', gate: 'g2', plates: [{ x: -14, z: 85, need: 2 }, { x: 14, z: 85, need: 2 }] },
                    { type: 'code', gate: 'g3', pad: { x: -18, z: 150 }, code: '614', prompt: '输入三位密码' }
                ],
                hurdles: [{ x: 0, z: 196, w: 29, d: 2, h: 4 }, { x: 0, z: 256, w: 29, d: 2, h: 4 }],
                lasers: [{ z: 226, w: 14, speed: 18, low: true, x0: -14.5, x1: 14.5 }],
                boulder: { gate: 'g3', z0: 150, r: 11, speed: 27, endZ: 268, delay: 2.5 }
            }
        ];
        function escLevelDef(n) {
            if (typeof n === 'string') return escSpecialDef(n);
            return ESC_LEVELS[Math.max(0, Math.min(ESC_LEVELS.length - 1, (n || 1) - 1))];
        }
        // ── 拼关卡：一关 = 一串"房间"（每个房间一个机关或一段陷阱）。每日密室、玩家自己拼的密室都走这个 ──
        // 关卡号 lvl：数字 = 正式关卡；'daily' = 今日密室；'c:分享码' = 自制关卡（联机时对方拿同一个码生成一模一样的关）
        const ESC_ROOM_META = {
            color: { label: '彩色板', bg: '#43a047' },
            duo: { label: '灰板 ×2', bg: '#78909c' },
            heavy: { label: '重压板', bg: '#546e7a' },
            lever: { label: '拉杆门', bg: '#8d6e63', side: true },
            key: { label: '钥匙', bg: '#f9a825', side: true },
            seq: { label: '顺序板', bg: '#7e57c2' },
            timed: { label: '限时按钮', bg: '#e53935', side: true },
            code: { label: '密码', bg: '#3949ab', side: true },
            laser: { label: '激光走廊', bg: '#d81b60', speed: true },
            hurdle: { label: '矮栏', bg: '#fb8c00' }
        };
        const ESC_ROOM_MAX = 8;
        const ESC_LASER_SPD = { slow: 20, mid: 28, fast: 36 };
        function escStrHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
        function escRng(seed) { let a = seed >>> 0 || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        function escCompose(rooms, name, seed) {
            let rnd = escRng(seed);
            let perm = function () { let a = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { let j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
            let lv = { name: name || '自制密室', gates: [], mechs: [], boards: [], lasers: [], hurdles: [] };
            let z = 18, gi = 0, est = 4;
            let gate = function (gz) { let id = 'g' + (++gi); lv.gates.push({ id: id, z: gz }); return id; };
            (rooms || []).slice(0, ESC_ROOM_MAX).forEach(function (r) {
                let sd = r.side === 'L' ? -1 : 1;
                if (r.t === 'color') { lv.mechs.push({ type: 'plates', gate: gate(z + 45), plates: escColorPlates(z + 23, perm()) }); z += 45; est += 10; }
                else if (r.t === 'duo') { lv.mechs.push({ type: 'plates', gate: gate(z + 45), plates: [{ x: -15, z: z + 23 }, { x: 15, z: z + 23 }] }); z += 45; est += 8; }
                else if (r.t === 'heavy') { lv.mechs.push({ type: 'plates', gate: gate(z + 45), plates: [{ x: -14, z: z + 23, need: 2 }, { x: 14, z: z + 23, need: 2 }] }); z += 45; est += 10; }
                else if (r.t === 'lever') { lv.mechs.push({ type: 'lever', gate: gate(z + 45), x: 18 * sd, z: z + 33 }); z += 45; est += 12; }
                else if (r.t === 'key') { lv.mechs.push({ type: 'key', gate: gate(z + 45), key: { x: -22 * sd, z: z + 10 }, lock: { x: 18 * sd, z: z + 38 } }); z += 45; est += 12; }
                else if (r.t === 'seq') { lv.mechs.push({ type: 'seq', gate: gate(z + 47), plates: escSeqPlates(z + 10), order: perm() }); z += 47; est += 14; }
                else if (r.t === 'timed') { lv.mechs.push({ type: 'timed', gate: gate(z + 50), x: 18 * sd, z: z + 12, open: 4 }); z += 50; est += 12; }
                else if (r.t === 'code') {
                    let code = '' + (1 + Math.floor(rnd() * 9)) + Math.floor(rnd() * 10) + Math.floor(rnd() * 10);
                    [8, 20, 32].forEach(function (dz, k) { lv.boards.push({ z: z + dz, face: (k % 2 ? (sd > 0 ? 'L' : 'R') : (sd > 0 ? 'R' : 'L')), text: '密码第 ' + (k + 1) + ' 位\n' + code[k] }); });
                    lv.mechs.push({ type: 'code', gate: gate(z + 45), pad: { x: 18 * sd, z: z + 38 }, code: code, prompt: '输入三位密码' }); z += 45; est += 16;
                }
                else if (r.t === 'laser') {
                    let sp = ESC_LASER_SPD[r.speed] || ESC_LASER_SPD.mid;
                    lv.lasers.push({ z: z + 12, w: 22, speed: sp }, { z: z + 28, w: 24, speed: sp + 4, phase: 0.5 }); z += 40; est += 8;
                }
                else if (r.t === 'hurdle') { lv.hurdles.push({ x: 0, z: z + 12, w: 57, d: 2, h: 4 }, { x: 0, z: z + 38, w: 57, d: 2, h: 4 }); z += 50; est += 6; }
            });
            lv.finish = z + 22;
            lv.stars = [Math.round(est), Math.round(est * 1.8)];
            lv.time = Math.max(120, Math.ceil(est * 4 / 30) * 30);
            return lv;
        }
        // 今日密室：按日期挑 4 个房间，所有人同一天拿到的是同一关
        function escDailyRooms(day) {
            let rnd = escRng(day * 7919 + 17), pool = Object.keys(ESC_ROOM_META), out = [], last = '';
            while (out.length < 4) {
                let t = pool[Math.floor(rnd() * pool.length)];
                if (t === last || out.filter(function (r) { return r.t === t; }).length) continue;
                out.push({ t: t, side: rnd() < 0.5 ? 'L' : 'R', speed: ['slow', 'mid', 'fast'][Math.floor(rnd() * 3)] });
                last = t;
            }
            return out;
        }
        function escDailyName(day) { let d = new Date(day * 86400000); return '今日密室 · ' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日'; }
        let escLvlCache = {};
        function escSpecialDef(key) {
            if (escLvlCache[key]) return escLvlCache[key];
            let lv = null;
            if (key === 'daily') { let day = localDayNum(); key = 'daily' + day; if (escLvlCache[key]) return escLvlCache[key]; lv = escCompose(escDailyRooms(day), escDailyName(day), day); }
            else if (key.indexOf('c:') === 0) {
                let d = parkDecode(key.slice(2));
                let rooms = d && d.p && Array.isArray(d.p.r) ? d.p.r.filter(function (r) { return r && ESC_ROOM_META[r.t]; }) : [];
                if (!rooms.length) rooms = [{ t: 'color' }];
                lv = escCompose(rooms, (d && d.p && d.p.n ? String(d.p.n).slice(0, 12) : '') || '自制密室', escStrHash(key));
                lv.roomCount = rooms.length;
            }
            escLvlCache[key] = lv;
            return lv;
        }
        function escIsSpecial(n) { return typeof n === 'string'; }
        function escLvlTitle(n, lv) { let nm = chatEscape(lv.name); return escIsSpecial(n) ? '「' + nm + '」' : '第 ' + n + ' 关「' + nm + '」'; }

        // ── 自制密室编辑器（跟猫盾乐园一样，一块积木一个房间）──
        function escDraft() {
            if (!gState.escDraft || !Array.isArray(gState.escDraft.r)) gState.escDraft = { n: '', r: [{ t: 'color' }, { t: 'lever', side: 'R' }] };
            return gState.escDraft;
        }
        function escImportPlay() {
            let raw = (document.getElementById('esc-import-code').value || '').trim();
            let d = parkDecode(raw);
            if (!d || !d.p || !Array.isArray(d.p.r) || !d.p.r.length) { showSysModal('提示', '这个码看不懂，检查一下复制全了没有', [{ label: '好' }]); return; }
            escapeStartGo('c:' + raw);
        }
        function escDailyInfoRender() {
            let el = document.getElementById('esc-daily-info'); if (!el) return;
            let lv = escSpecialDef('daily'), D = gState.escDaily;
            let done = D && D.day === localDayNum();
            el.innerHTML = lv.name.replace('今日密室 · ', '') + '　' + escDailyRooms(localDayNum()).map(function (r) { return ESC_ROOM_META[r.t].label; }).join(' → ') +
                (done ? '　今天最好 ' + escFmtTime(D.t) : '　今天第一次过 +10 猫盾币');
        }


        // ── 进度：解锁到第几关、每关最好成绩、上次选的关 ──
        function escProg() {
            if (!gState.escProg || typeof gState.escProg !== 'object') gState.escProg = { unlocked: 1, best: {}, sel: 1, v: 2 };
            if (!gState.escProg.best) gState.escProg.best = {};
            // 第 2 版：前面插了 8 个入门关、拿掉了原来的第 1 关。老进度往后挪 7 格，原第 1 关的成绩丢掉
            if (!gState.escProg.v) {
                let P = gState.escProg, nb = {}, sh = function (n) { n = +n; return n >= 2 ? n + ESC_INTRO_N - 1 : 1; };
                Object.keys(P.best).forEach(function (k) { if (+k >= 2) nb[sh(k)] = P.best[k]; });
                P.best = nb; P.unlocked = sh(P.unlocked || 1); P.sel = sh(P.sel || 1); P.v = 2;
            }
            return gState.escProg;
        }
        function escUnlocked(n) { return TEST_INFINITE_COINS || n <= escProg().unlocked; }
        function escStarsFor(lv, t) { return t <= lv.stars[0] ? 3 : t <= lv.stars[1] ? 2 : 1; }
        function escFmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
        function escSelectLevel(n) {
            if (!escUnlocked(n)) return;
            escProg().sel = n; saveProgress();
            escRenderLevels();
            let mbc = document.getElementById('mode-bar-current'); if (mbc) mbc.innerText = '合作密室 · 第 ' + n + ' 关';
        }
        function escRenderLevels() {
            let grid = document.getElementById('esc-level-grid'); if (!grid) return;
            let P = escProg();
            if (!escUnlocked(P.sel)) P.sel = 1;
            grid.innerHTML = ESC_LEVELS.map(function (L, i) {
                let n = i + 1, un = escUnlocked(n), best = P.best[n], sel = n === P.sel;
                let stars = best ? '<span style="color:#f9a825;">' + '★'.repeat(best.s) + '</span><span style="color:#ccc;">' + '★'.repeat(3 - best.s) + '</span>' : (L.intro && un ? '入门' : '&nbsp;');
                return '<button onclick="escSelectLevel(' + n + ')"' + (un ? '' : ' disabled') + ' title="' + L.name + '" style="margin:0; padding:5px 0; font-size:13px; line-height:1.25; border-radius:6px; cursor:' + (un ? 'pointer' : 'default') + '; ' +
                    'border:2px solid ' + (sel ? '#2e7d32' : '#c8e6c9') + '; background:' + (un ? (sel ? '#c8e6c9' : '#fff') : '#eceff1') + '; color:' + (un ? '#2e7d32' : '#b0bec5') + ';">' +
                    (un ? '<b>' + n + '</b>' : '<span style="font-size:11px;">未解锁</span>') + '<br><span style="font-size:10px;">' + stars + '</span></button>';
            }).join('');
            let sb = document.getElementById('esc-start-btn'); if (sb) sb.innerText = '开始第 ' + P.sel + ' 关';
            let tt = document.getElementById('esc-title'); if (tt) tt.innerText = '合作密室 · ' + ESC_LEVELS.length + ' 关（前 ' + ESC_INTRO_N + ' 关是入门）';
            let info = document.getElementById('esc-level-info');
            if (info) {
                let L = escLevelDef(P.sel), best = P.best[P.sel];
                info.innerHTML = '第 ' + P.sel + ' 关「' + L.name + '」　限时 ' + escFmtTime(L.time) +
                    '　三星 ≤ ' + escFmtTime(L.stars[0]) + '　两星 ≤ ' + escFmtTime(L.stars[1]) +
                    (best ? '　最好成绩 ' + escFmtTime(best.t) : '　首次通关奖励 ' + (5 + P.sel) + ' 猫盾币');
            }
        }

        // ── 碰撞：人是圆（半径 r），墙/门/栏是轴对齐的方块 ──
        function escCircleHits(px, pz, r, s) {
            let cx = Math.max(s.x - s.w / 2, Math.min(px, s.x + s.w / 2));
            let cz = Math.max(s.z - s.d / 2, Math.min(pz, s.z + s.d / 2));
            let dx = px - cx, dz = pz - cz;
            return dx * dx + dz * dz < r * r;
        }
        // py 传 undefined 表示不管矮栏（寻路/镜头用）
        function escBlocked(px, pz, py, r) {
            let R = escapeRoom;
            for (let i = 0; i < R.solids.length; i++) if (escCircleHits(px, pz, r, R.solids[i])) return true;
            for (let i = 0; i < R.gates.length; i++) { let g = R.gates[i]; if (!g.open && escCircleHits(px, pz, r, g.box)) return true; }
            if (py !== undefined) for (let i = 0; i < R.hurdles.length; i++) { let h = R.hurdles[i]; if (py < h.h && escCircleHits(px, pz, r, h)) return true; }
            if (R.boulder && !R.boulder.gone && escCircleHits(px, pz, r, escBoulderBox())) return true;
            return false;
        }
        function escBoulderBox() { let B = escapeRoom.boulder; return { x: 0, z: B.z, w: B.def.r * 2, d: B.def.r * 2 }; }
        // 分轴移动，撞墙那一轴就不动；返回这一步是不是被挡住了。
        // 之前的密室只按"门开没开"去夹 z 坐标，门一关，已经穿过去的人会被瞬间拉回门后，
        // AI 在终点和门后之间来回被弹——现在门是真的实体，站哪边就是哪边。
        function escMove(a, dx, dz) {
            let r = ESCAPE.r, py = a.p.y;
            if (escBlocked(a.p.x, a.p.z, py, r)) py = undefined;   // 落地时正好卡在矮栏里：先放你出来
            let hit = false;
            if (dx) { if (!escBlocked(a.p.x + dx, a.p.z, py, r)) a.p.x += dx; else hit = true; }
            if (dz) { if (!escBlocked(a.p.x, a.p.z + dz, py, r)) a.p.z += dz; else hit = true; }
            return hit;
        }
        function escHurdleOnly(a, dx, dz) {
            return escBlocked(a.p.x + dx, a.p.z + dz, a.p.y, ESCAPE.r) && !escBlocked(a.p.x + dx, a.p.z + dz, undefined, ESCAPE.r);
        }
        function escGravity(a, dt) {
            a.vy = (a.vy || 0) - ESCAPE.gravity * dt; a.p.y += a.vy * dt;
            if (a.p.y < 0) { a.p.y = 0; a.vy = 0; }
        }
        function escAligned(a, g) { return a.p.x >= g.box.x - g.box.w / 2 - 1 && a.p.x <= g.box.x + g.box.w / 2 + 1; }
        function escBehind(a, g) { return escAligned(a, g) && a.p.z < g.box.z; }
        function escSomeoneBehind(g, exceptIdx) {
            return escapeRoom.actors.some(function (o) { return o.idx !== exceptIdx && escBehind(o, g); });
        }
        function escInZone(a, x, z, rad) { return a.p.y < 2 && Math.hypot(a.p.x - x, a.p.z - z) < rad; }

        function escGateSet(g, open) {
            if (g.open === open) return;
            g.open = open;
            escapeRoom.gridDirty = true;
            if (!open) {
                // 门落下来的时候有人正好卡在门里：往离得近的那一边推出去，不会被"关"在墙里
                escapeRoom.actors.forEach(function (a) {
                    if (escCircleHits(a.p.x, a.p.z, ESCAPE.r, g.box)) {
                        a.p.z = (a.p.z < g.box.z) ? g.box.z - g.box.d / 2 - ESCAPE.r - 0.2 : g.box.z + g.box.d / 2 + ESCAPE.r + 0.2;
                    }
                });
            } else sfxMechanism();
        }

        // ── 激光：在 [x0, x1] 之间来回扫（三角波），位置只看时钟，联机两边算出来一样 ──
        function escLaserRange(L) {
            let x0 = L.x0 === undefined ? -ESCAPE.halfW : L.x0, x1 = L.x1 === undefined ? ESCAPE.halfW : L.x1;
            return { a: x0 + L.w / 2, b: x1 - L.w / 2 };
        }
        function escLaserX(L, t) {
            let rg = escLaserRange(L), span = rg.b - rg.a;
            if (!L.speed || span <= 0) return (rg.a + rg.b) / 2;
            let s = (t * L.speed / span + (L.phase || 0) * 2) % 2;
            return rg.a + (s < 1 ? s : 2 - s) * span;
        }
        function escLaserHits(a, L, t) {
            if (L.low && a.p.y >= 3) return false;
            return Math.abs(a.p.z - L.z) < 0.75 + ESCAPE.r && Math.abs(a.p.x - escLaserX(L, t)) < L.w / 2 + ESCAPE.r;
        }

        // ── 寻路网格：2×2 一格，墙/关着的门算堵死；矮栏不算（AI 会跳），激光不算（AI 会等）──
        const ESC_DI = [1, -1, 0, 0, 1, 1, -1, -1], ESC_DJ = [0, 0, 1, -1, 1, -1, 1, -1];
        function escGridBuild() {
            let R = escapeRoom, C = ESCAPE.cell;
            R.gCols = Math.ceil(ESCAPE.halfW * 2 / C); R.gRows = Math.ceil((R.lv.finish + 22 - ESCAPE.zMin) / C);
            R.gStatic = new Uint8Array(R.gCols * R.gRows);
            let pos = function (i, j) { return { x: -ESCAPE.halfW + (i + 0.5) * C, z: ESCAPE.zMin + (j + 0.5) * C }; };
            for (let j = 0; j < R.gRows; j++) for (let i = 0; i < R.gCols; i++) {
                let p = pos(i, j), b = 0;
                for (let k = 0; k < R.solids.length; k++) if (escCircleHits(p.x, p.z, ESCAPE.r, R.solids[k])) { b = 1; break; }
                R.gStatic[j * R.gCols + i] = b;
            }
            R.gates.forEach(function (g) {
                g.cells = [];
                for (let j = 0; j < R.gRows; j++) for (let i = 0; i < R.gCols; i++) {
                    let p = pos(i, j);
                    if (escCircleHits(p.x, p.z, ESCAPE.r, g.box)) g.cells.push(j * R.gCols + i);
                }
            });
            R.boulderCells = [];
            if (R.boulder) {
                let bb = escBoulderBox();
                for (let j = 0; j < R.gRows; j++) for (let i = 0; i < R.gCols; i++) {
                    let p = pos(i, j);
                    if (escCircleHits(p.x, p.z, ESCAPE.r, bb)) R.boulderCells.push(j * R.gCols + i);
                }
            }
            R.gridDirty = true;
        }
        function escGridRefresh() {
            let R = escapeRoom; if (!R.gridDirty) return;
            R.gridDirty = false; R.gridGen = (R.gridGen || 0) + 1;
            R.grid = R.gStatic.slice();
            R.gates.forEach(function (g) { if (!g.open) g.cells.forEach(function (c) { R.grid[c] = 1; }); });
            // 还没滚起来的滚石是块挡路的大石头；滚起来以后就不算了（它在往前跑）
            if (R.boulder && !R.boulder.on) R.boulderCells.forEach(function (c) { R.grid[c] = 1; });
        }
        function escCellOf(x, z) {
            let R = escapeRoom, C = ESCAPE.cell;
            let i = Math.floor((x + ESCAPE.halfW) / C), j = Math.floor((z - ESCAPE.zMin) / C);
            i = Math.max(0, Math.min(R.gCols - 1, i)); j = Math.max(0, Math.min(R.gRows - 1, j));
            return j * R.gCols + i;
        }
        function escCellPos(c) {
            let R = escapeRoom, C = ESCAPE.cell;
            return { x: -ESCAPE.halfW + (c % R.gCols + 0.5) * C, z: ESCAPE.zMin + (Math.floor(c / R.gCols) + 0.5) * C };
        }
        function escNearestFree(c) {
            let R = escapeRoom; if (!R.grid[c]) return c;
            let ci = c % R.gCols, cj = Math.floor(c / R.gCols);
            for (let rad = 1; rad < 14; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
                let i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= R.gCols || j >= R.gRows) continue;
                let k = j * R.gCols + i; if (!R.grid[k]) return k;
            }
            return c;
        }
        function escBfs(fromCell) {
            let R = escapeRoom, n = R.gCols * R.gRows;
            let dist = new Int32Array(n).fill(-1), prev = new Int32Array(n).fill(-1), q = new Int32Array(n);
            let qh = 0, qt = 0, s = escNearestFree(fromCell);
            dist[s] = 0; q[qt++] = s;
            while (qh < qt) {
                let c = q[qh++], ci = c % R.gCols, cj = (c - ci) / R.gCols;
                for (let d = 0; d < 8; d++) {
                    let di = ESC_DI[d], dj = ESC_DJ[d], i = ci + di, j = cj + dj;
                    if (i < 0 || j < 0 || i >= R.gCols || j >= R.gRows) continue;
                    let k = j * R.gCols + i;
                    if (dist[k] >= 0 || R.grid[k]) continue;
                    if (di && dj && (R.grid[cj * R.gCols + i] || R.grid[j * R.gCols + ci])) continue;   // 不切墙角
                    dist[k] = dist[c] + 1; prev[k] = c; q[qt++] = k;
                }
            }
            return { dist: dist, prev: prev, start: s };
        }
        function escPathTo(bfs, goal) {
            if (bfs.dist[goal] < 0) return null;
            let path = [], c = goal;
            while (c >= 0 && c !== bfs.start) { path.push(c); c = bfs.prev[c]; }
            return path.reverse();
        }
        function escLineClear(x0, z0, x1, z1) {
            let d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 1.2));
            for (let s = 1; s <= n; s++) { let t = s / n; if (escapeRoom.grid[escCellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)]) return false; }
            return true;
        }

        // ── 贴图小工具 ──
        function escTextTex(lines, opts) {
            opts = opts || {};
            let cv = document.createElement('canvas'); cv.width = opts.w || 256; cv.height = opts.h || 128;
            let g = cv.getContext('2d');
            g.fillStyle = opts.bg || '#3e2723'; g.fillRect(0, 0, cv.width, cv.height);
            g.strokeStyle = opts.border || '#ffd54f'; g.lineWidth = 6; g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
            g.fillStyle = opts.fg || '#fff8e1'; g.textAlign = 'center'; g.textBaseline = 'middle';
            let n = lines.length, lh = cv.height / (n + 0.6);
            lines.forEach(function (ln, i) {
                g.font = 'bold ' + Math.round(lh * (i === n - 1 && n > 1 ? 0.95 : 0.62)) + 'px "Microsoft YaHei", sans-serif';
                g.fillText(ln, cv.width / 2, lh * (i + 0.8));
            });
            return new THREE.CanvasTexture(cv);
        }
        let escFloorTexCache = null;
        function escFloorTex() {
            if (escFloorTexCache) return escFloorTexCache;
            let cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
            let g = cv.getContext('2d');
            g.fillStyle = '#8d7b68'; g.fillRect(0, 0, 64, 64);
            g.fillStyle = '#7d6b59'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
            g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
            let t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
            escFloorTexCache = t;
            return t;
        }
        function escSeqBoardTex(M) {
            let cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
            let g = cv.getContext('2d');
            g.fillStyle = '#263238'; g.fillRect(0, 0, 512, 128);
            g.fillStyle = '#fff'; g.font = 'bold 30px "Microsoft YaHei", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText('顺序', 16, 64);
            let order = M.def.order, x = 100;
            order.forEach(function (pi, k) {
                let role = M.def.plates[pi].role;
                g.fillStyle = ESC_ROLES[role].css; g.fillRect(x, 34, 60, 60);
                g.fillStyle = '#263238'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
                g.fillText(String(k + 1), x + 30, 66);
                if (k < order.length - 1) { g.fillStyle = '#fff'; g.fillText('→', x + 84, 64); }
                x += 104;
            });
            return new THREE.CanvasTexture(cv);
        }

        function escAddMesh(m) { scene.add(m); escapeRoom.meshes.push(m); return m; }
        function escBox(w, h, d, color, x, y, z, basic) {
            let mat = basic ? new THREE.MeshBasicMaterial({ color: color }) : new THREE.MeshLambertMaterial({ color: color });
            let m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            return escAddMesh(m);
        }
        function escRing(x, z, rad, color) {
            let m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.35, 6, 32), new THREE.MeshBasicMaterial({ color: color }));
            m.rotation.x = -Math.PI / 2; m.position.set(x, 0.55, z);
            return escAddMesh(m);
        }
        function escPlaneAt(tex, w, h, x, y, z, ry) {
            let m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
            m.position.set(x, y, z); m.rotation.y = ry || 0;
            return escAddMesh(m);
        }

        function escBuildLevel() {
            let R = escapeRoom, lv = R.lv, H = ESCAPE.halfW, WH = ESCAPE.wallH;
            let zEnd = lv.finish + 20, len = zEnd - ESCAPE.zMin;
            // 地板 + 外墙
            let ftex = escFloorTex().clone(); ftex.needsUpdate = true; ftex.repeat.set(H * 2 / 8, len / 8);
            let floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 6, len + 6), new THREE.MeshLambertMaterial({ map: ftex }));
            floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, ESCAPE.zMin + len / 2); escAddMesh(floor);
            R.solids = [
                { x: -H - 1.5, z: ESCAPE.zMin + len / 2, w: 3, d: len + 6 },
                { x: H + 1.5, z: ESCAPE.zMin + len / 2, w: 3, d: len + 6 },
                { x: 0, z: ESCAPE.zMin - 1.5, w: H * 2 + 6, d: 3 },
                { x: 0, z: zEnd + 1.5, w: H * 2 + 6, d: 3 }
            ].concat((lv.walls || []).map(function (w) { return { x: w.x, z: w.z, w: w.w, d: w.d }; }));
            R.solids.forEach(function (s) {
                escBox(s.w, WH, s.d, 0x5d4e46, s.x, WH / 2, s.z);
                escBox(s.w + 0.4, 1, s.d + 0.4, 0x3e3029, s.x, WH + 0.5, s.z);
            });
            // 墙上的火把：纯装饰，靠自发光的小方块撑一点"密室"的氛围
            for (let z = 10; z < zEnd - 5; z += 34) {
                [-1, 1].forEach(function (sd) {
                    escBox(0.8, 2.2, 0.8, 0x4e342e, sd * (H - 0.4), 9, z);
                    escBox(1.2, 1.2, 1.2, 0xffb74d, sd * (H - 0.4), 10.8, z, true);
                });
            }
            // 终点
            let fin = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 - 2, zEnd - lv.finish - 1),
                new THREE.MeshBasicMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.45 }));
            fin.rotation.x = -Math.PI / 2; fin.position.set(0, 0.12, (lv.finish + zEnd) / 2); escAddMesh(fin);
            escPlaneAt(escTextTex(['出口'], { bg: '#1b5e20', border: '#a5d6a7' }), 16, 8, 0, 12, zEnd - 0.1, Math.PI);

            // 门：一扇木门 + 顶上的灯（机关颜色，开了变绿）+ 门框边上一条同色的灯带
            R.gates = lv.gates.map(function (gd) {
                let x0 = gd.x0 === undefined ? -H : gd.x0, x1 = gd.x1 === undefined ? H : gd.x1;
                let box = { x: (x0 + x1) / 2, z: gd.z, w: x1 - x0, d: 3 };
                let mesh = escBox(box.w - 0.2, WH, box.d, 0x6d4c41, box.x, WH / 2, box.z);
                // 灯带、顺序牌都挂在门上当子物体，门沉下去的时候跟着一起沉
                let stripe = new THREE.Mesh(new THREE.BoxGeometry(box.w - 0.2, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x999999 }));
                stripe.position.set(0, 3 - WH / 2, -1.7); mesh.add(stripe);
                // 门楣：门沉下去以后灯还有个地方"挂"着，不会像个球飘在半空
                escBox(box.w, 1.6, 3.4, 0x3e3029, box.x, WH + 0.8, box.z);
                let lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xef5350 }));
                lamp.position.set(box.x, WH + 2.6, box.z); escAddMesh(lamp);
                return { def: gd, id: gd.id, box: box, open: false, mesh: mesh, stripe: stripe, lamp: lamp, y: WH / 2 };
            });
            R.gateById = {}; R.gates.forEach(function (g) { R.gateById[g.id] = g; });

            // 机关
            R.mechs = lv.mechs.map(function (d, idx) {
                let M = { def: d, idx: idx, done: false, gate: R.gateById[d.gate], hue: ESC_MECH_HUES[idx % ESC_MECH_HUES.length],
                    sustain: 0, grace: 0, openT: 0, pressedIn: {}, seqPos: 0, seqIn: {}, keyCarrier: -1, plateMeshes: [] };
                M.gate.mech = M;
                M.gate.stripe.material.color.setHex(M.hue);
                if (d.type === 'plates' || d.type === 'seq') {
                    d.plates.forEach(function (p) {
                        let col = (p.role !== undefined && p.role >= 0) ? ESC_ROLES[p.role].hex : 0x90a4ae;
                        let m = new THREE.Mesh(new THREE.CylinderGeometry(ESCAPE.plateR, ESCAPE.plateR, 0.5, 24),
                            new THREE.MeshLambertMaterial({ color: col, emissive: 0x000000 }));
                        m.position.set(p.x, 0.25, p.z); escAddMesh(m);
                        escRing(p.x, p.z, ESCAPE.plateR + 0.2, M.hue);
                        if ((p.need || 1) > 1) {
                            let sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: escTextTex(['×' + p.need], { w: 128, h: 96, bg: '#263238', border: '#ffffff' }) }));
                            sp.scale.set(4, 3, 1); sp.position.set(p.x, 4.5, p.z); escAddMesh(sp);
                        }
                        M.plateMeshes.push(m);
                    });
                    if (d.type === 'seq') {
                        let bd = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: escSeqBoardTex(M) }));
                        bd.position.set(0, 11 - ESCAPE.wallH / 2, -1.6); bd.rotation.y = Math.PI; M.gate.mesh.add(bd);
                    }
                } else if (d.type === 'lever') {
                    escRing(d.x, d.z, ESCAPE.leverR, M.hue);
                    let base = new THREE.Mesh(new THREE.CylinderGeometry(ESCAPE.leverR, ESCAPE.leverR, 0.4, 24), new THREE.MeshLambertMaterial({ color: 0x546e7a }));
                    base.position.set(d.x, 0.2, d.z); escAddMesh(base);
                    escBox(1, 5, 1, 0x37474f, d.x, 2.5, d.z + ESCAPE.leverR - 0.6);
                    R.solids.push({ x: d.x, z: d.z + ESCAPE.leverR - 0.6, w: 1, d: 1 });
                    let pivot = new THREE.Group(); pivot.position.set(d.x, 5, d.z + ESCAPE.leverR - 0.6);
                    let handle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.5, 0.6), new THREE.MeshLambertMaterial({ color: M.hue }));
                    handle.position.y = 2.2; pivot.add(handle);
                    let knob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
                    knob.position.y = 4.5; pivot.add(knob);
                    pivot.rotation.x = -0.6; escAddMesh(pivot);
                    M.pivot = pivot;
                } else if (d.type === 'timed') {
                    escRing(d.x, d.z, ESCAPE.btnR, M.hue);
                    escBox(3.6, 1, 3.6, 0x455a64, d.x, 0.5, d.z);
                    M.btn = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.8, 16), new THREE.MeshLambertMaterial({ color: 0xe53935 }));
                    M.btn.position.set(d.x, 1.3, d.z); escAddMesh(M.btn);
                } else if (d.type === 'key') {
                    let k = new THREE.Group();
                    let bow = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 8, 16), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
                    let shaft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
                    shaft.position.y = -2.1;
                    let tooth = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
                    tooth.position.set(0.6, -3.1, 0);
                    k.add(bow); k.add(shaft); k.add(tooth);
                    escAddMesh(k); M.keyMesh = k;
                    let glow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.25 }));
                    k.add(glow);
                    escRing(d.lock.x, d.lock.z, ESCAPE.lockR, M.hue);
                    escBox(2.6, 4, 2.6, 0x455a64, d.lock.x, 2, d.lock.z);
                    R.solids.push({ x: d.lock.x, z: d.lock.z, w: 2.6, d: 2.6 });
                    escBox(0.8, 1.4, 0.2, 0x111111, d.lock.x, 3, d.lock.z - 1.35, true);
                    M.lockLamp = escBox(2.8, 0.5, 2.8, 0xffd54f, d.lock.x, 4.25, d.lock.z, true);
                } else if (d.type === 'code') {
                    escRing(d.pad.x, d.pad.z, ESCAPE.padR, M.hue);
                    escBox(3, 6, 2, 0x37474f, d.pad.x, 3, d.pad.z);
                    R.solids.push({ x: d.pad.x, z: d.pad.z, w: 3, d: 2 });
                    M.padScreen = escPlaneAt(escTextTex(['密码锁', d.prompt || ''], { w: 256, h: 160, bg: '#004d40', border: '#80cbc4' }), 4.4, 2.8, d.pad.x, 5.2, d.pad.z - 1.05, Math.PI);
                }
                return M;
            });

            // 墙上的字（密码线索之类）
            (lv.boards || []).forEach(function (b) {
                let x = b.face === 'L' ? -H + 0.15 : H - 0.15, ry = b.face === 'L' ? Math.PI / 2 : -Math.PI / 2;
                escPlaneAt(escTextTex(b.text.split('\n'), { w: 256, h: 160 }), 10, 6.2, x, 9, b.z, ry);
            });
            // 矮栏：黄黑条纹，要跳
            R.hurdles = (lv.hurdles || []).map(function (h) {
                escBox(h.w, h.h, h.d, 0xfbc02d, h.x, h.h / 2, h.z);
                escBox(h.w + 0.1, 0.6, h.d + 0.1, 0x212121, h.x, h.h * 0.55, h.z);
                return h;
            });
            // 激光：两头墙上各一个发射器，中间一条会扫来扫去的光
            R.lasers = (lv.lasers || []).map(function (L) {
                let rg = escLaserRange(L), hgt = L.low ? 3 : 18, col = L.low ? 0xff9800 : 0xff1744;
                escBox(1.2, hgt, 2, 0x263238, rg.a - L.w / 2 - 0.6, hgt / 2, L.z);
                escBox(1.2, hgt, 2, 0x263238, rg.b + L.w / 2 + 0.6, hgt / 2, L.z);
                let beam = new THREE.Mesh(new THREE.BoxGeometry(L.w, hgt, 1.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
                beam.position.set(0, hgt / 2, L.z); escAddMesh(beam);
                return { def: L, beam: beam, hgt: hgt };
            });
            // 滚石
            if (lv.boulder) {
                let B = lv.boulder;
                let m = new THREE.Mesh(new THREE.SphereGeometry(B.r, 18, 14), new THREE.MeshLambertMaterial({ color: 0x757575 }));
                m.position.set(0, B.r, B.z0); escAddMesh(m);
                R.boulder = { def: B, mesh: m, z: B.z0, on: false, wait: B.delay, gone: false };
            }
            escGridBuild();
            escGridRefresh();
        }

        function escCarrying(a) { return escapeRoom.mechs.some(function (M) { return M.keyCarrier === a.idx; }); }

        // ── 检查点：穿过一道门就记下门后那个位置，被激光打到就回这里 ──
        function escUpdateCheckpoint(a) {
            escapeRoom.gates.forEach(function (g) {
                if (escAligned(a, g) && a.p.z > g.box.z + 3 && g.box.z + 6 > a.cp.z) a.cp = { x: a.p.x, z: g.box.z + 6 };
            });
        }
        function escRespawn(a, why, x, z) {
            a.p.set(x === undefined ? a.cp.x : x, 0, z === undefined ? a.cp.z : z); a.vy = 0;
            escapeRoom.mechs.forEach(function (M) {
                if (M.keyCarrier === a.idx) {
                    M.keyCarrier = -1;
                    if (!escIsHost()) bc.postMessage({ type: 'ESC_EV', target: '*', sender: gState.id, ev: 'drop', m: M.idx });
                }
            });
            if (a.isPlayer) { blazeFlash(why); sfxBuzz(); }
        }
        // 激光/滚石：自己的真人自己判，AI 由房主判
        function escHazards(a) {
            let R = escapeRoom;
            for (let i = 0; i < R.lasers.length; i++) {
                if (escLaserHits(a, R.lasers[i].def, R.clock)) {
                    escRespawn(a, escCarrying(a) ? '碰到激光了，钥匙掉回原处' : '碰到激光了，回到检查点');
                    return;
                }
            }
            let B = R.boulder;
            // 被滚石追上：撞到它后面去，只能跟在它屁股后面等它滚到头碎掉
            if (B && !B.gone && B.on && B.wait <= 0 && a.p.z > B.z - B.def.r * 0.5 && escCircleHits(a.p.x, a.p.z, ESCAPE.r, escBoulderBox())) {
                escRespawn(a, '被滚石追上了！', Math.max(-11.5, Math.min(11.5, a.p.x)), B.z - B.def.r - ESCAPE.r - 3);
            }
        }

        function escIsHost() { return !escapeRoom.hostId || escapeRoom.hostId === gState.id; }

        // ── 机关判定（房主一个人算，别人照着广播套）──
        function escMechTick(dt) {
            let R = escapeRoom, A = R.actors;
            R.mechs.forEach(function (M) {
                let d = M.def;
                if (d.type === 'plates') {
                    if (M.done) return;
                    let ok = d.plates.every(function (p) {
                        let n = A.filter(function (a) { return (p.role === undefined || p.role < 0 || a.role === p.role) && escInZone(a, p.x, p.z, ESCAPE.plateR); }).length;
                        return n >= (p.need || 1);
                    });
                    M.sustain = ok ? M.sustain + dt : 0;
                    if (M.sustain >= 0.6) { M.done = true; escGateSet(M.gate, true); blazeFlash('机关打开了！'); }
                } else if (d.type === 'lever') {
                    let held = A.some(function (a) { return escInZone(a, d.x, d.z, ESCAPE.leverR); });
                    if (held) { M.grace = ESCAPE.gateGrace; escGateSet(M.gate, true); }
                    else if (M.gate.open) { M.grace -= dt; if (M.grace <= 0) escGateSet(M.gate, false); }
                    // 拉杆/限时门的"搞定"不锁死：只看此刻还有没有人在门后（分头行动那种关，
                    // 开局大家还没选通道，锁死了会导致没人去撑拉杆）
                    M.done = !A.some(function (a) { return escBehind(a, M.gate); });
                } else if (d.type === 'timed') {
                    A.forEach(function (a) {
                        let inz = escInZone(a, d.x, d.z, ESCAPE.btnR);
                        if (inz && !M.pressedIn[a.idx] && M.openT <= 0) {
                            M.openT = d.open; escGateSet(M.gate, true);
                            if (!a.isPlayer && !a.netId) aiSay(a, a.name, 'timed', [ESC_LINES.timed[1]]);
                        }
                        M.pressedIn[a.idx] = inz;
                    });
                    if (M.openT > 0) { M.openT -= dt; if (M.openT <= 0) { M.openT = 0; escGateSet(M.gate, false); } }
                    M.done = !A.some(function (a) { return escBehind(a, M.gate); });
                } else if (d.type === 'seq') {
                    if (M.done) return;
                    A.forEach(function (a) {
                        if (!a.human) return;   // 顺序板只认真人，AI 路过不算
                        d.plates.forEach(function (p, i) {
                            let key = a.idx + '_' + i, inz = escInZone(a, p.x, p.z, ESCAPE.plateR);
                            if (inz && !M.seqIn[key]) escSeqStep(M, i);
                            M.seqIn[key] = inz;
                        });
                    });
                } else if (d.type === 'key') {
                    if (M.done) return;
                    if (M.keyCarrier < 0) {
                        let who = A.filter(function (a) { return a.human && Math.hypot(a.p.x - d.key.x, a.p.z - d.key.z) < ESCAPE.keyR; })[0];
                        if (who) { M.keyCarrier = who.idx; if (who.isPlayer) { blazeFlash('捡到钥匙了！送到锁上'); sfxChime(1); } }
                    } else {
                        let c = A[M.keyCarrier];
                        if (c && Math.hypot(c.p.x - d.lock.x, c.p.z - d.lock.z) < ESCAPE.lockR) {
                            M.done = true; M.keyCarrier = -1; escGateSet(M.gate, true); blazeFlash('钥匙插进去了，门开了！');
                        }
                    }
                }
                // code 的判定在 escCodeSubmit 里（要真人在密码面板上输对才算）
            });
            // 滚石：门一开就开始滚
            let B = R.boulder;
            if (B && !B.gone) {
                let g = R.gateById[B.def.gate];
                if (!B.on && g && g.open) { B.on = true; B.wait = B.def.delay; R.gridDirty = true; blazeFlash('轰隆隆……滚石来了，快跑！'); sfxThud(true); }
                if (B.on) {
                    if (B.wait > 0) B.wait -= dt;
                    else { B.z += B.def.speed * dt; if (B.z >= B.def.endZ) { B.gone = true; sfxThud(true); } }
                }
            }
        }
        function escSeqStep(M, i) {
            let order = M.def.order;
            if (order[M.seqPos] === i) {
                M.seqPos++; sfxChime(1);
                if (M.seqPos >= order.length) { M.done = true; escGateSet(M.gate, true); blazeFlash('顺序对了，门开了！'); }
            } else if (order.slice(0, M.seqPos).indexOf(i) < 0) {
                M.seqPos = 0; sfxBuzz(); blazeFlash('顺序错了，从头再来');
            }
        }

        // ── 密码面板（本地 DOM，不暂停游戏——联机时别人还在跑）──
        function escCodeOpen(M) {
            let R = escapeRoom; if (!R || M.done) return;
            R.codeOpen = M; R.codeBuf = '';
            if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
            let pn = document.getElementById('esc-code-panel');
            document.getElementById('esc-code-prompt').innerText = M.def.prompt || '输入密码';
            let keys = document.getElementById('esc-code-keys');
            keys.innerHTML = '';
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清除', '0', '确定'].forEach(function (k) {
                let b = document.createElement('button');
                b.innerText = k;
                b.style.cssText = 'margin:0; padding:10px 0; font-size:18px; border:none; border-radius:6px; background:' + (k === '确定' ? '#43a047' : k === '清除' ? '#78909c' : '#455a64') + '; color:#fff;';
                b.onclick = function () {
                    if (k === '清除') R.codeBuf = '';
                    else if (k === '确定') { escCodeSubmit(); return; }
                    else if (R.codeBuf.length < 6) R.codeBuf += k;
                    escCodeRender();
                };
                keys.appendChild(b);
            });
            let close = document.createElement('button');
            close.innerText = '离开'; close.style.cssText = 'margin:8px 0 0; width:100%; padding:8px 0; font-size:14px; border:none; border-radius:6px; background:#546e7a; color:#fff;';
            close.onclick = escCodeClose;
            keys.appendChild(close);
            escCodeRender();
            pn.classList.remove('hidden');
        }
        function escCodeRender() {
            let v = document.getElementById('esc-code-view');
            if (v) v.innerText = escapeRoom && escapeRoom.codeBuf ? escapeRoom.codeBuf : '_';
        }
        function escCodeClose() {
            if (escapeRoom) escapeRoom.codeOpen = null;
            let pn = document.getElementById('esc-code-panel'); if (pn) pn.classList.add('hidden');
        }
        function escCodeSubmit() {
            let R = escapeRoom; if (!R || !R.codeOpen) return;
            let M = R.codeOpen;
            if (R.codeBuf === M.def.code) {
                escCodeClose();
                if (escIsHost()) { M.done = true; escGateSet(M.gate, true); }
                else bc.postMessage({ type: 'ESC_EV', target: '*', sender: gState.id, ev: 'code', m: M.idx });
                blazeFlash('密码正确，门开了！'); sfxChime(2);
            } else {
                R.codeBuf = ''; escCodeRender(); sfxBuzz();
                let v = document.getElementById('esc-code-view'); if (v) v.innerText = '密码错误';
            }
        }

        // ── 真人移动 ──
        function escPlayerMove(a, dt) {
            let R = escapeRoom;
            if (R.codeOpen) {
                a.mvx = 0; a.mvz = 0; escGravity(a, dt);
                // 走开了（被推走/回检查点）就把面板收起来
                if (Math.hypot(a.p.x - R.codeOpen.def.pad.x, a.p.z - R.codeOpen.def.pad.z) > ESCAPE.padR + 2) escCodeClose();
                return;
            }
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let sp = ESCAPE.moveSpeed * (escCarrying(a) ? ESCAPE.carrySlow : 1);
            if (fwd || strafe) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;
                let n = Math.hypot(mx, mz) || 1;
                escMove(a, mx / n * sp * dt, mz / n * sp * dt);
                a.faceDir = { x: mx / n, z: mz / n };
                a.mvx = mx / n * sp; a.mvz = mz / n * sp;
            } else { a.mvx = 0; a.mvz = 0; }
            if ((keys[' '] || touchBtn.jump) && a.p.y <= 0.01) a.vy = ESCAPE.jumpV;
            keys[' '] = false; touchBtn.jump = false;
            escGravity(a, dt);
            // 走上密码台就自动弹出键盘（以前要再按 E / 「互动」，好多人不知道）；关掉以后走开再回来才会再弹
            let padM = R.mechs.filter(function (m) { return m.def.type === 'code' && !m.done && Math.hypot(a.p.x - m.def.pad.x, a.p.z - m.def.pad.z) < ESCAPE.padR; })[0];
            let tap = keys['e'] || touchBtn.interact;
            keys['e'] = false; touchBtn.interact = false;
            if (padM && (tap || R.padIn !== padM.idx)) escCodeOpen(padM);
            R.padIn = padM ? padM.idx : -1;
        }

        // ── AI ──
        // 当前有哪些"要人站着"的位置：板位（×2 的板算两个位）、拉杆、限时按钮
        function escJobs() {
            let R = escapeRoom, out = [];
            R.mechs.forEach(function (M) {
                let d = M.def;
                if (M.done) return;
                if (d.type === 'plates') {
                    d.plates.forEach(function (p, i) {
                        let need = p.need || 1;
                        for (let k = 0; k < need; k++) out.push({ key: M.idx + ':' + i + ':' + k, x: p.x + (need > 1 ? (k ? 2.2 : -2.2) : 0), z: p.z, role: p.role === undefined ? -1 : p.role, M: M, plate: p });
                    });
                } else if (d.type === 'lever') out.push({ key: M.idx + ':L', x: d.x, z: d.z, role: -1, M: M, lever: true });
                else if (d.type === 'timed' && M.openT <= 0) out.push({ key: M.idx + ':T', x: d.x, z: d.z, role: -1, M: M, timed: true });
            });
            return out;
        }
        function escAiThink(a) {
            let R = escapeRoom, A = R.actors;
            escGridRefresh();
            let bfs = escBfs(escCellOf(a.p.x, a.p.z));
            let reachCell = function (x, z) { let c = escNearestFree(escCellOf(x, z)); return bfs.dist[c] >= 0 ? c : -1; };
            // 真人已经站住的板位先划掉，别的 AI 认领了的也划掉
            let taken = {};
            R.mechs.forEach(function (M) {
                if (M.done) return;
                if (M.def.type === 'plates') {
                    M.def.plates.forEach(function (p, i) {
                        let hs = A.filter(function (o) { return o.human && (p.role === undefined || p.role < 0 || o.role === p.role) && escInZone(o, p.x, p.z, ESCAPE.plateR); }).length;
                        for (let k = 0; k < hs; k++) taken[M.idx + ':' + i + ':' + k] = true;
                    });
                } else if (M.def.type === 'lever' || M.def.type === 'timed') {
                    let r = M.def.type === 'lever' ? ESCAPE.leverR : ESCAPE.btnR;
                    if (A.some(function (o) { return o.human && escInZone(o, M.def.x, M.def.z, r); })) taken[M.idx + (M.def.type === 'lever' ? ':L' : ':T')] = true;
                }
            });
            A.forEach(function (o) { if (o !== a && o.ai && o.job) taken[o.job] = true; });
            let job = null, bestD = 1e9;
            escJobs().forEach(function (j) {
                if (taken[j.key]) return;
                if (j.role >= 0 && j.role !== a.role) return;
                if (j.lever) {
                    // 拉杆：后面还有别人要过才撑着；只剩自己的话，门没开就去踩一下，开了就走
                    if (!escSomeoneBehind(j.M.gate, a.idx) && !(escBehind(a, j.M.gate) && !j.M.gate.open)) return;
                }
                if (j.timed && !escSomeoneBehind(j.M.gate, -1)) return;
                let c = reachCell(j.x, j.z); if (c < 0) return;
                let dd = bfs.dist[c] - (j.key === a.job ? 30 : 0);
                if (dd < bestD) { bestD = dd; job = j; }
            });
            let tx, tz;
            a.job = job ? job.key : null;
            if (job) {
                tx = job.x; tz = job.z;
                if (job.timed) {
                    // 限时按钮：等门口人齐了才踩，不然门白开
                    let g = job.M.gate;
                    let ready = A.every(function (o) { return o === a || !escBehind(o, g) || (o.p.z > g.box.z - 16 && Math.abs(o.p.x - g.box.x) < g.box.w / 2 + 2); });
                    if (!ready) { tz = job.z - 7; }
                }
                if (job.lever) aiSay(a, a.name, 'lever', ESC_LINES.lever);
                else if (job.plate) aiSay(a, a.name, 'plate', ESC_LINES.plate);
            } else {
                let fc = reachCell(a.finX, R.lv.finish + 8);
                if (fc >= 0) { tx = a.finX; tz = R.lv.finish + 8; }
                else {
                    // 没活干：去某扇还关着、够得着的门前面等着；同一扇门前人太多就换一扇（分头行动那种关）
                    let best = null, bestS = 1e9;
                    R.gates.forEach(function (g) {
                        if (g.open) return;
                        let c = reachCell(g.box.x + a.waitOff, g.box.z - 6); if (c < 0) return;
                        let crowd = A.filter(function (o) { return o !== a && (o.waitGate === g.id || (o.human && escBehind(o, g))); }).length;
                        let s = crowd * 60 + bfs.dist[c] - (a.waitGate === g.id ? 40 : 0);
                        if (s < bestS) { bestS = s; best = g; }
                    });
                    if (best) { a.waitGate = best.id; tx = best.box.x + a.waitOff; tz = best.box.z - 6; escAiNag(a, best); }
                    else { a.waitGate = null; let h = A.filter(function (o) { return o.human; })[0] || a; tx = h.p.x + a.waitOff; tz = h.p.z - 6; }
                }
            }
            if (job) a.waitGate = null;
            let goal = escNearestFree(escCellOf(tx, tz));
            a.path = bfs.dist[goal] >= 0 ? escPathTo(bfs, goal) : null;
            a.pathI = 0; a.goal = { x: tx, z: tz };
            a.gridGen = R.gridGen;
        }
        // 卡在"只有真人能做"的机关前面：隔一阵喊一句提醒
        function escAiNag(a, g) {
            let M = g.mech; if (!M || M.done) return;
            // 整队一起只提醒一句：以前三个 AI 同一秒各喊一遍一模一样的话
            let now = performance.now(), R = escapeRoom;
            if (R.nagAt && now - R.nagAt < 12000) return;
            R.nagAt = now;
            let t = M.def.type;
            if (t === 'key' || t === 'seq' || t === 'code') aiSay(a, a.name, 'nag_' + t, ESC_LINES[t]);
            else if (t === 'plates' && M.def.plates.some(function (p) { return p.role !== undefined && p.role >= 0 && escapeRoom.actors.some(function (o) { return o.human && o.role === p.role; }); })) aiSay(a, a.name, 'nag_plate', ESC_LINES.waitYou);
        }
        function escAiMove(a, dt) {
            let R = escapeRoom;
            escGravity(a, dt);
            a.thinkT = (a.thinkT || 0) - dt;
            if (a.thinkT <= 0 || a.gridGen !== R.gridGen) { a.thinkT = 0.3 + Math.random() * 0.15; escAiThink(a); }
            let tx = a.goal.x, tz = a.goal.z;
            if (a.path && a.path.length) {
                // 往路径上"直线能看到的最远那个点"走，路线顺一点
                let far = a.pathI;
                for (let k = a.pathI; k < Math.min(a.path.length, a.pathI + 12); k++) {
                    let p = escCellPos(a.path[k]);
                    if (escLineClear(a.p.x, a.p.z, p.x, p.z)) far = k; else break;
                }
                a.pathI = far;
                let p = escCellPos(a.path[far]);
                if (far < a.path.length - 1 || Math.hypot(p.x - a.goal.x, p.z - a.goal.z) > 3) { tx = p.x; tz = p.z; }
            }
            let dx = tx - a.p.x, dz = tz - a.p.z, d = Math.hypot(dx, dz);
            a.mvx = 0; a.mvz = 0;
            if (d < 0.7) return;
            let ux = dx / d, uz = dz / d;
            // 激光：按"我穿过这条光带要花的那段时间里，光会不会扫到我"来判断——
            // 高的等空档（等的时候往墙边挪，墙边的空档多），矮的算好距离起跳
            for (let i = 0; i < R.lasers.length; i++) {
                let L = R.lasers[i].def, ahead = (L.z - a.p.z) * Math.sign(uz || 1);
                if (Math.abs(uz) < 0.2 || ahead <= 3.4 || ahead > 12) continue;
                let v = ESCAPE.moveSpeed * Math.abs(uz), band = 0.75 + ESCAPE.r + 0.3;
                let t0 = Math.max(0, ahead - band) / v, t1 = (ahead + band) / v + 0.05, danger = false;
                for (let tt = t0; tt <= t1 && !danger; tt += 0.04) danger = Math.abs(escLaserX(L, R.clock + tt) - a.p.x) < L.w / 2 + ESCAPE.r + 0.8;
                if (L.low && ahead > 7.2 && ahead < 9.5 && a.p.y <= 0.01) { a.vy = ESCAPE.jumpV; continue; }
                if (!danger) continue;
                if (L.low) {
                    if (ahead > 7.2 && ahead < 10) { if (a.p.y <= 0.01) a.vy = ESCAPE.jumpV; }
                    else if (ahead <= 7.2 && a.p.y <= 0.01) {
                        // 离得太近，起跳也跳不过去：往后退一点，重新找起跳距离
                        let ox = a.p.x, oz = a.p.z;
                        escMove(a, -ux * ESCAPE.moveSpeed * dt, -uz * ESCAPE.moveSpeed * dt);
                        a.mvx = (a.p.x - ox) / dt; a.mvz = (a.p.z - oz) / dt; a.faceDir = { x: ux, z: uz };
                        return;
                    }
                }
                else if (ahead < 9) {
                    let side = (a.p.x >= 0 ? 1 : -1) * (ESCAPE.halfW - ESCAPE.r - 1);
                    let sx = Math.max(-ESCAPE.moveSpeed * dt, Math.min(ESCAPE.moveSpeed * dt, side - a.p.x));
                    let ox = a.p.x; escMove(a, sx, 0);
                    a.mvx = (a.p.x - ox) / dt; a.mvz = 0;
                    a.faceDir = { x: ux, z: uz };
                    return;
                }
            }
            let step = Math.min(d, ESCAPE.moveSpeed * dt);
            let mx = ux * step, mz = uz * step;
            if (escHurdleOnly(a, mx, mz) && a.p.y <= 0.01) a.vy = ESCAPE.jumpV;
            let ox = a.p.x, oz = a.p.z;
            escMove(a, mx, mz);
            a.faceDir = { x: ux, z: uz };
            a.mvx = (a.p.x - ox) / dt; a.mvz = (a.p.z - oz) / dt;
            // 卡住了：换条路想一想，再往旁边挪一下
            if (Math.hypot(a.p.x - ox, a.p.z - oz) < step * 0.2) {
                a.stuckT = (a.stuckT || 0) + dt;
                if (a.stuckT > 0.6) { a.stuckT = 0; a.thinkT = 0; escMove(a, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3); }
            } else a.stuckT = 0;
        }

        // ── HUD ──
        function escHud() {
            let R = escapeRoom, me = R.me, lv = R.lv;
            let remain = Math.max(0, lv.time - R.clock);
            let sc = document.getElementById('blaze-score');
            sc.innerText = escFmtTime(remain);
            sc.style.color = remain < 30 && R.started ? '#ff8a80' : '#fff';
            // 局里只报状态（门还开几秒、顺序踩到第几块、钥匙在不在手上），怎么玩看规则和介绍卡片
            let M = R.mechs.filter(function (m) { return !m.done; })[0];
            let goal = '';
            if (M) {
                if (M.def.type === 'timed' && M.openT > 0) goal = '门还开 ' + M.openT.toFixed(1) + ' 秒';
                if (M.def.type === 'seq') goal = '顺序 ' + M.seqPos + ' / ' + M.def.order.length;
                if (M.def.type === 'key' && M.keyCarrier === me.idx) goal = '钥匙在你手上';
            }
            let pad = R.mechs.filter(function (m) { return m.def.type === 'code' && !m.done && Math.hypot(me.p.x - m.def.pad.x, me.p.z - m.def.pad.z) < ESCAPE.padR; })[0];
            // 「互动」只在密码台边上才用得到，平时藏起来，少一个看不懂的按钮
            let ab = document.getElementById('esc-act-btn'); if (ab && gState.control === 'pad') ab.style.display = pad && !R.codeOpen ? 'flex' : 'none';
            let role = ESC_ROLES[me.role];
            let el = document.getElementById('blaze-round');
            el.innerHTML = '<span style="color:' + role.css + ';">●</span> 你是<b style="color:' + role.css + ';">' + role.name + '色</b>　' + escLvlTitle(R.lvl, lv) + (goal ? '<br>' + goal : '');
        }
        // 第一次碰到某种机关/陷阱：弹一张介绍。机关看"现在该开的那扇门"，陷阱看离你近不近
        const ESC_INTROS = {
            color: ['彩色板', '脚下圆圈的颜色就是你的颜色。<br>彩色板只认同色的人，每块都有人站住，门就开。'],
            gray: ['灰板', '灰色的板谁都能站。几块板同时有人站住，门就开。'],
            need2: ['×2 的板', '写着 ×2 的板，要两个人一起站上去才算。'],
            lever: ['拉杆', '有人站在拉杆上，门就一直开着。<br>大家先过去，最后一个离开拉杆后门还会开一小会儿，赶紧冲。'],
            key: ['钥匙', '钥匙只有你能捡，AI 捡不了。<br>捡起来拿到锁旁边，门就开。拿着钥匙走得慢一点。'],
            timed: ['按钮', '踩一下按钮，门只开 4 秒。<br>先让大家走到门口，再去踩。'],
            seq: ['顺序板', '门上画着颜色顺序，按这个顺序一块一块踩。<br>踩错了从头来。AI 不会踩，要你来。'],
            code: ['密码', '墙上写着密码的每一位，边走边记。<br>走到密码台上会弹出键盘，输对门就开。'],
            symbol: ['符号密码', '墙上写的是“符号 = 数字”，按密码台上符号的顺序把数字输进去。'],
            laser: ['红激光', '红激光会来回扫，碰到就退回上一个检查点。看准空档再过。'],
            low: ['橙激光', '橙色的激光很低，' + '跳过去就行。'],
            hurdle: ['矮栏', '矮栏挡在路上，跳过去。'],
            boulder: ['滚石', '门一开，后面的滚石就追过来了，一路往前跑别停！'],
            dark: ['暗室', '这一关很暗。钥匙会发光，找找看。'],
            split: ['两条通道', '中间有墙隔开，大家要分成两组。<br>一边的拉杆开的是另一边的门。']
        };
        function escIntro(k) { let t = ESC_INTROS[k]; if (t) introOnce('esc.' + k, t[0], t[1] + (k === 'low' || k === 'hurdle' ? '<br>' + kTxt('按 <b>空格</b> 跳。', '点 <b>跳</b>。') : '')); }
        function escIntroCheck(R) {
            let lv = R.lv, me = R.me;
            if (lv.dark) escIntro('dark');
            if ((lv.walls || []).indexOf(ESC_SPLIT_WALL) >= 0) escIntro('split');
            let M = R.mechs.filter(function (m) { return !m.done; })[0];
            if (M) {
                let d = M.def;
                if (d.type === 'plates') {
                    if (d.plates.some(function (p) { return p.role !== undefined && p.role >= 0; })) escIntro('color');
                    if (d.plates.some(function (p) { return p.role === undefined || p.role < 0; })) escIntro('gray');
                    if (d.plates.some(function (p) { return (p.need || 1) > 1; })) escIntro('need2');
                } else if (d.type === 'code') escIntro(/[▲●■]/.test(d.prompt || '') ? 'symbol' : 'code');
                else escIntro(d.type);
            }
            R.lasers.forEach(function (L) { if (Math.abs(L.def.z - me.p.z) < 30) escIntro(L.def.low ? 'low' : 'laser'); });
            R.hurdles.forEach(function (h) { if (Math.abs(h.z - me.p.z) < 30) escIntro('hurdle'); });
            if (R.boulder && R.boulder.on) escIntro('boulder');
        }
        // 每帧的视觉：门滑下去/升起来、板子亮不亮、拉杆扳下、钥匙跟着人、激光挪动、滚石转
        function escVisualTick(dt) {
            let R = escapeRoom, A = R.actors;
            R.gates.forEach(function (g) {
                let ty = g.open ? -ESCAPE.wallH / 2 - 1 : ESCAPE.wallH / 2;
                g.y += (ty - g.y) * Math.min(1, dt * 7);
                g.mesh.position.y = g.y;
                g.lamp.material.color.setHex(g.open ? 0x66bb6a : (g.mech ? g.mech.hue : 0xef5350));
            });
            R.mechs.forEach(function (M) {
                let d = M.def;
                if (d.type === 'plates' || d.type === 'seq') {
                    d.plates.forEach(function (p, i) {
                        let n = A.filter(function (a) { return (d.type === 'seq' || p.role === undefined || p.role < 0 || a.role === p.role) && escInZone(a, p.x, p.z, ESCAPE.plateR); }).length;
                        let lit = M.done || (d.type === 'seq' ? d.order.slice(0, M.seqPos).indexOf(i) >= 0 : n >= (p.need || 1));
                        M.plateMeshes[i].material.emissive.setHex(lit ? 0x2e7d32 : (n > 0 ? 0x333300 : 0x000000));
                        M.plateMeshes[i].position.y = lit || n > 0 ? 0.1 : 0.25;
                    });
                } else if (d.type === 'lever') {
                    let held = A.some(function (a) { return escInZone(a, d.x, d.z, ESCAPE.leverR); });
                    let tr = held ? 0.7 : -0.6;
                    M.pivot.rotation.x += (tr - M.pivot.rotation.x) * Math.min(1, dt * 10);
                } else if (d.type === 'timed') {
                    M.btn.position.y = M.openT > 0 ? 1.0 : 1.3;
                    M.btn.material.color.setHex(M.openT > 0 ? 0x66bb6a : 0xe53935);
                } else if (d.type === 'key') {
                    let k = M.keyMesh;
                    k.visible = !M.done;
                    if (M.keyCarrier >= 0 && A[M.keyCarrier]) { let c = A[M.keyCarrier]; k.position.set(c.p.x, c.p.y + 17, c.p.z); }
                    else k.position.set(d.key.x, 4 + Math.sin(R.clock * 3) * 0.6, d.key.z);
                    k.rotation.y += dt * 2;
                    M.lockLamp.material.color.setHex(M.done ? 0x66bb6a : 0xffd54f);
                }
            });
            R.lasers.forEach(function (L) { L.beam.position.x = escLaserX(L.def, R.clock); });
            let B = R.boulder;
            if (B) {
                B.mesh.visible = !B.gone;
                if (Math.abs(B.mesh.position.z - B.z) > 0.001) B.mesh.rotation.x += (B.z - B.mesh.position.z) / B.def.r;
                B.mesh.position.z = B.z;
            }
        }

        // 镜头：人在正中；镜头跟人之间隔着墙/关着的门就往前收，不会像以前那样开局镜头在房间外面，
        // 整个屏幕只有一面墙的背面。
        function escCameraPos(me) {
            let dir = chaseCamDir();
            let ax = me.p.x, ay = me.p.y + 15, az = me.p.z, dist = 24;
            for (let s = 2; s <= 24; s += 0.5) {
                let x = ax - dir.x * s, y = ay - dir.y * s, z = az - dir.z * s;
                if (y < 1.5 || (y < ESCAPE.wallH + 1 && escBlocked(x, z, undefined, 0.8))) { dist = Math.max(1.5, s - 1); break; }
            }
            return { x: ax - dir.x * dist, y: ay - dir.y * dist, z: az - dir.z * dist };
        }

        function escapeTick(dt) {
            let R = escapeRoom, host = escIsHost();
            escIntroCheck(R);
            // 单人时弹介绍卡片，这一局先停住（联机停不了，别人还在跑）
            if (introPaused() && !R.netOn) { escHud(); renderer.render(scene, camera); return; }
            // 开局：规则弹窗（第一次玩才有）关掉之前不开跑，关掉后再 3、2、1——
            // 以前倒计时在弹窗后面就开始走了，AI 也在后台把第一道门开了
            if (!R.started) {
                let modalUp = !document.getElementById('sys-modal').classList.contains('hidden');
                if (!modalUp) {
                    let c = Math.ceil(R.startT);
                    if (c !== R.cdShown) { R.cdShown = c; blazeFlash(c > 0 ? String(c) : '开始！'); }
                    R.startT -= dt;
                    if (R.startT <= 0) { R.started = true; blazeFlash('开始！'); }
                }
            } else R.clock += dt;
            R.actors.forEach(function (a) {
                if (!R.started) { a.mvx = 0; a.mvz = 0; return; }
                if (a.isPlayer) escPlayerMove(a, dt);
                else if (a.ai && host) escAiMove(a, dt);
                if (a.isPlayer || (a.ai && host)) { escHazards(a); escUpdateCheckpoint(a); }
            });
            if (host && R.started) escMechTick(dt);
            if (R.netOn) escapeNetTick(dt);
            if (host && R.started && !R.over) {
                if (R.actors.every(function (a) { return a.p.z >= R.lv.finish; })) escFinish(true);
                else if (R.clock >= R.lv.time) escFinish(false);
            }
            escVisualTick(dt);
            R.actors.forEach(function (a) {
                a.mesh.position.set(a.p.x, a.p.y, a.p.z);
                if (a.faceDir) a.mesh.rotation.y = Math.atan2(a.faceDir.x, a.faceDir.z);
                let sp = Math.hypot(a.mvx || 0, a.mvz || 0), run = Math.min(1, sp / ESCAPE.moveSpeed);
                a.animT = (a.animT || 0) + dt * (2 + run * 16);
                let u = a.mesh.userData;
                if (u.legs) { u.legs[0].rotation.x = Math.sin(a.animT) * 0.7 * run; u.legs[1].rotation.x = -Math.sin(a.animT) * 0.7 * run; }
                tickAccStarOrbit(u, dt);
            });
            let camPos = escCameraPos(R.me);
            camera.position.set(camPos.x, camPos.y, camPos.z);
            escHud();
            renderer.render(scene, camera);
        }

        function escapeLoop() {
            if (!escapeRoom) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - escapeRoom.last) / 1000);
            escapeRoom.last = now;
            if (!escapeRoom.over) escapeTick(dt);
            escapeRoom.raf = requestAnimationFrame(escapeLoop);
        }

        function escapeTouchUI(on) {
            ['blaze-jump-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn', 'blaze-atk-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn', 'race-jump-btn', 'run-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = on && gState.control === 'pad';
            let jb = document.getElementById('race-jump-btn'); if (jb) jb.style.display = pad ? 'flex' : 'none';
            let ab = document.getElementById('esc-act-btn'); if (ab) ab.style.display = pad ? 'flex' : 'none';
            let stats = document.getElementById('blaze-stats-btn'); if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? escapeExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id); if (e && on) e.classList.add('hidden');
            });
            // 目标那行：密室的背景是深色石墙，原来的浅黄小字几乎看不清——加个深色底
            // 分数/目标那块默认是 left:50% + translateX(-50%) 居中：绝对定位的元素这样放，
            // 可用宽度只有半个屏幕，手机上目标那行会被挤成三四行、词都拆开。密室里改成通栏居中。
            let sw = document.getElementById('blaze-score-wrap');
            if (sw) {
                sw.style.left = on ? '0' : '50%'; sw.style.right = on ? '0' : '';
                sw.style.transform = on ? 'none' : 'translateX(-50%)'; sw.style.pointerEvents = on ? 'none' : '';
                // 通用样式给了 width:max-content（让说明行能用满屏宽），这里铺满左右时要改回 auto，不然整块贴到左边
                sw.style.width = on ? 'auto' : ''; sw.style.maxWidth = on ? 'none' : '';
            }
            let br = document.getElementById('blaze-round');
            if (br) {
                br.style.display = on ? 'inline-block' : '';
                br.style.maxWidth = on ? 'min(640px, 88vw)' : '';
                br.style.background = on ? 'rgba(0,0,0,0.6)' : '';
                br.style.padding = on ? '5px 12px' : '';
                br.style.borderRadius = on ? '8px' : '';
                br.style.color = on ? '#fff' : '';
                br.style.fontSize = on ? '14px' : '';
                br.style.lineHeight = on ? '1.6' : '';
                br.style.marginTop = on ? '4px' : '';
                if (!on) br.innerText = '';
            }
            let sc = document.getElementById('blaze-score'); if (sc && !on) sc.style.color = '';
            if (!on) escCodeClose();
        }

        // 4 个位置：真人先坐，剩下发 AI
        function escapePlan(humans) {
            let plan = [];
            for (let i = 0; i < ESCAPE.teamSize; i++) plan.push({ idx: i, id: null });
            humans.slice(0, ESCAPE.teamSize).forEach(function (h, i) { plan[i].id = h.id; });
            return plan;
        }
        function escapeBegin(plan, hostId, lvl) {
            plan = plan || escapePlan([{ id: gState.id }]);
            hostId = hostId || gState.id;
            if (typeof lvl !== 'string') lvl = Math.max(1, Math.min(ESC_LEVELS.length, lvl || escProg().sel || 1));
            showModeIntroIfFirstTime('escape');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            if (blaze) { try { blazeExit(); } catch (e) { } }
            if (race) { try { raceExit(); } catch (e) { } }
            if (jail) { try { jailExit(); } catch (e) { } }
            if (dodge) { try { dodgeExit(); } catch (e) { } }
            if (park) { try { parkExit(); } catch (e) { } }
            if (escapeRoom) { try { escapeCleanup(); } catch (e) { } }
            ensureScene();
            let lv = escLevelDef(lvl);
            scene.background = new THREE.Color(lv.dark ? 0x050505 : 0x2b2320);
            scene.fog = new THREE.FogExp2(lv.dark ? 0x050505 : 0x2b2320, lv.dark ? 0.02 : 0.004);

            let netOn = plan.filter(function (q) { return q.id; }).length > 1;
            escapeRoom = {
                over: false, clock: 0, started: false, startT: ESCAPE.countdown, actors: [], meshes: [],
                last: performance.now(), raf: null, hostId: hostId, netOn: netOn, lvl: lvl, lv: lv, plan: plan,
                solids: [], gates: [], mechs: [], lasers: [], hurdles: [], boulder: null, codeOpen: null, codeBuf: ''
            };
            escBuildLevel();

            let n = ESCAPE.teamSize;
            for (let i = 0; i < n; i++) {
                let slot = plan[i];
                let isP = slot.id === gState.id;
                let role = ESC_ROLES[i];
                let mesh = raceMakeBody(isP ? mySkinColor(role.hex) : role.hex, 0, false, isP ? gState.acc : (slot.id ? peerAccOf(slot.id) : aiRandomAcc()), isP ? myFace() : (slot.id ? peerFaceOf(slot.id) : aiRandomFace()));
                // 脚下圆圈 = 这个人的颜色（彩色板认的就是它），身体可以是自己的皮肤色
                if (mesh.userData.ring) mesh.userData.ring.material.color.setHex(role.hex);
                if (!isP) {
                    let label = nightMakeLabel(slot.id ? (dispName(slot.id) || slot.id) : ('队员·' + role.name), role.hex, false, slot.id ? peerTitleOf(slot.id) : aiRandomTitle());
                    // 密室里队友经常就贴在身边，原来那个大小（22 宽）一挨近就糊住半个屏幕——收小一半多
                    let lw = new THREE.Vector3();
                    label.onBeforeRender = function (rr, sc, cam) {
                        label.getWorldPosition(lw);
                        let k = Math.min(1, Math.max(0.45, cam.position.distanceTo(lw) / 45));
                        label.scale.set(9 * k, 9 * k * (label.userData.aspect || 0.25), 1);
                    };
                    label.position.y = 15; mesh.add(label);
                }
                scene.add(mesh);
                let x = (i - (n - 1) / 2) * 10;
                let a = {
                    idx: i, role: i, isPlayer: isP, netId: slot.id || null, human: !!slot.id, ai: !slot.id,
                    name: slot.id ? (dispName(slot.id) || '你') : ('队员·' + role.name),
                    p: new THREE.Vector3(x, 0, ESCAPE.spawnZ), vy: 0, faceDir: { x: 0, z: 1 }, animT: 0,
                    cp: { x: x, z: ESCAPE.spawnZ }, mesh: mesh, job: null, waitGate: null,
                    waitOff: (i - 1.5) * 4, finX: (i - 1.5) * 9, goal: { x: x, z: ESCAPE.spawnZ }, path: null, pathI: 0
                };
                escapeRoom.actors.push(a);
            }
            escapeRoom.me = escapeRoom.actors.filter(function (a) { return a.isPlayer; })[0] || escapeRoom.actors[0];
            camera.rotation.set(0, Math.PI, 0);   // 默认朝向是 -Z，得转 180° 才是面朝 +Z，正对着密室往里走

            document.body.onmousedown = function (e) {
                if (!escapeRoom || escapeRoom.over || escapeRoom.codeOpen) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal') || e.target.closest('#esc-code-panel'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            document.body.onmouseup = null;
            escapeTouchUI(true);
            bgmStart();
            escapeLoop();
        }

        function escFinish(won) {
            let R = escapeRoom;
            if (!R || R.over) return;
            R.over = true;
            escCodeClose();
            if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
            if (escIsHost() && R.netOn) escapeNetSend(true);
            let lv = R.lv, n = R.lvl, host = escIsHost(), t = R.clock;
            let btns = [];
            let body = '';
            let special = escIsSpecial(n);
            if (won) {
                let P = escProg(), stars = escStarsFor(lv, t), tr = Math.round(t * 10) / 10;
                let prev = special ? null : P.best[n], prevS = prev ? prev.s : 0;
                let reward = special ? 0 : (prev ? 0 : 5 + n) + Math.max(0, stars - prevS) * 2;
                let rec = !prev || t < prev.t;
                if (n === 'daily') {
                    let day = localDayNum(), D = gState.escDaily;
                    if (!D || D.day !== day) { reward = 10; gState.escDaily = { day: day, t: tr }; achCheck('escDaily'); }
                    else { rec = tr < D.t; prev = { t: D.t }; if (rec) D.t = tr; }
                }
                if (!special) {
                    P.best[n] = { t: prev ? Math.min(prev.t, tr) : tr, s: Math.max(prevS, stars) };
                    if (n < ESC_LEVELS.length && P.unlocked < n + 1) P.unlocked = n + 1;
                }
                if (reward) coinsAdd('escape', reward); else saveProgress();
                blazeFlash('通关了！'); sfxChime(3);
                let a = R.actors.filter(function (o) { return o.ai; })[0];
                if (a) aiSay(a, a.name, 'win', ESC_LINES.win);
                body = '<div style="font-size:30px; letter-spacing:4px; margin:4px 0;"><span style="color:#f9a825;">' + '★'.repeat(stars) + '</span><span style="color:#ccc;">' + '★'.repeat(3 - stars) + '</span></div>' +
                    '<div>' + escLvlTitle(n, lv) + ' 用时 <b>' + escFmtTime(t) + '</b>' + (rec && prev ? '（新纪录！）' : '') + '</div>' +
                    '<div style="color:#888; font-size:12px; margin-top:4px;">三星 ≤ ' + escFmtTime(lv.stars[0]) + '　两星 ≤ ' + escFmtTime(lv.stars[1]) + '</div>' +
                    (reward ? '<div style="margin-top:8px;">获得 ' + coinBadgeHtml(reward, 18) + '</div>' : '');
                if (host && !special && n < ESC_LEVELS.length) btns.push({ label: '下一关', color: '#43a047', onClick: function () { escapeRestart(n + 1); } });
                if (host) btns.push({ label: '再玩一次', color: '#1e88e5', onClick: function () { escapeRestart(n); } });
            } else {
                body = escLvlTitle(n, lv) + ' 时间到了，没能逃出去。';
                if (host) btns.push({ label: '再试一次', color: '#1e88e5', onClick: function () { escapeRestart(n); } });
            }
            // 自制密室少于 3 个房间不给局末猫盾币（不然拼一个房间的关反复刷）
            if (!(n + '').startsWith('c:') || (lv.roomCount || 0) >= 3) { coinsSettle('escape', won); body += coinsLine(); }
            if (!host) body += '<div style="color:#888; font-size:12px; margin-top:6px;">下一步由房主来选</div>';
            btns.push({ label: '返回大厅', color: '#78909c', onClick: function () { escapeExit(); } });
            showSysModal(won ? '通关成功' : '时间到', body, btns);
        }
        function escapeRestart(lvl) {
            let R = escapeRoom; if (!R) return;
            let plan = R.plan, host = R.hostId;
            if (R.netOn) bc.postMessage({ type: 'ESC_START', target: '*', sender: gState.id, plan: plan, host: host, lvl: lvl });
            escapeBegin(plan, host, lvl);
        }
        function escapeCleanup() {
            let R = escapeRoom; if (!R) return;
            R.over = true;
            if (R.raf) cancelAnimationFrame(R.raf);
            (R.meshes || []).forEach(function (m) { scene.remove(m); });
            R.actors.forEach(function (a) { scene.remove(a.mesh); });
            escCodeClose();
            escapeRoom = null;
        }
        function escapeExit() {
            if (!escapeRoom) return;
            if (document.pointerLockElement) document.exitPointerLock();
            escapeCleanup();
            escapeTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            nav('screen-lobby'); selectGameMode('escape');
            makerAfterGame();
        }

        // 组了队直接带队友进；没组队先等最多 15 秒看房间里有没有人也想玩，凑不到就配 AI
        function escapeStartGo(lvlOverride) {
            let lvl = lvlOverride || escProg().sel || 1;
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, ESCAPE.teamSize - 1));
                let plan = escapePlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'ESC_START', target: '*', sender: gState.id, plan: plan, host: gState.id, lvl: lvl });
                escapeBegin(plan, gState.id, lvl);
                return;
            }
            mmStart('escape', ESCAPE.teamSize, function (ids) {
                let plan = escapePlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'ESC_START', target: '*', sender: gState.id, plan: plan, host: gState.id, lvl: lvl });
                escapeBegin(plan, gState.id, lvl);
            });
        }
        function escapeOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!netStartAllowed('escape', m)) return;
            mmCancel();
            document.getElementById('sys-modal').classList.add('hidden');   // 上一关的结算框
            escapeBegin(m.plan, m.host, m.lvl || 1);
        }

        // ── 联机：每人广播自己的位置；房主额外广播 AI 位置 + 门/机关/滚石/时钟/输赢 ──
        const ESC_ME_HZ = 15, ESC_AI_HZ = 10;
        function escapeNetSend(force) {
            let R = escapeRoom;
            let ai = R.actors.filter(function (a) { return a.ai; }).map(function (a) {
                return { idx: a.idx, x: +a.p.x.toFixed(2), y: +a.p.y.toFixed(2), z: +a.p.z.toFixed(2), fx: +a.faceDir.x.toFixed(2), fz: +a.faceDir.z.toFixed(2) };
            });
            bc.postMessage({
                type: 'ESC_AI', target: '*', sender: gState.id, ai: ai,
                g: R.gates.map(function (g) { return g.open ? 1 : 0; }),
                ms: R.mechs.map(function (M) { return [M.done ? 1 : 0, M.seqPos, +M.openT.toFixed(2), M.keyCarrier]; }),
                b: R.boulder ? [+R.boulder.z.toFixed(2), R.boulder.on ? 1 : 0, R.boulder.gone ? 1 : 0, +R.boulder.wait.toFixed(2)] : null,
                clk: +R.clock.toFixed(2), st: R.started ? 1 : 0, over: R.over ? 1 : 0, won: R.over && R.actors.every(function (a) { return a.p.z >= R.lv.finish; }) ? 1 : 0
            });
        }
        function escapeNetTick(dt) {
            let R = escapeRoom;
            R._meT = (R._meT || 0) + dt;
            if (R._meT >= 1 / ESC_ME_HZ) {
                R._meT = 0;
                let me = R.me;
                bc.postMessage({ type: 'ESC_ME', target: '*', sender: gState.id, x: me.p.x, y: me.p.y, z: me.p.z, fx: me.faceDir.x, fz: me.faceDir.z });
            }
            if (escIsHost()) {
                R._aiT = (R._aiT || 0) + dt;
                if (R._aiT >= 1 / ESC_AI_HZ) { R._aiT = 0; escapeNetSend(false); }
            }
        }
        function escapeOnMe(m) {
            let R = escapeRoom;
            if (!R || m.sender === gState.id) return;
            let a = R.actors.filter(function (o) { return o.netId === m.sender; })[0];
            if (!a) return;
            // 走路动画看 mvx/mvz：按收包间隔把这次位移换算成速度
            a.mvx = (m.x - a.p.x) * ESC_ME_HZ; a.mvz = (m.z - a.p.z) * ESC_ME_HZ;
            a.p.x = m.x; a.p.y = m.y || 0; a.p.z = m.z; a.faceDir = { x: m.fx, z: m.fz };
        }
        function escapeOnAi(m) {
            let R = escapeRoom;
            if (!R || m.sender === gState.id || R.hostId !== m.sender) return;
            (m.ai || []).forEach(function (q) {
                let a = R.actors[q.idx];
                if (!a || !a.ai) return;
                a.mvx = (q.x - a.p.x) * ESC_AI_HZ; a.mvz = (q.z - a.p.z) * ESC_AI_HZ;
                a.p.set(q.x, q.y || 0, q.z); a.faceDir = { x: q.fx, z: q.fz };
            });
            (m.g || []).forEach(function (o, i) { if (R.gates[i]) escGateSet(R.gates[i], !!o); });
            (m.ms || []).forEach(function (s, i) {
                let M = R.mechs[i]; if (!M) return;
                M.done = !!s[0]; M.seqPos = s[1]; M.openT = s[2]; M.keyCarrier = s[3];
            });
            if (R.boulder && m.b) {
                if (!R.boulder.on && m.b[1]) { R.gridDirty = true; blazeFlash('轰隆隆……滚石来了，快跑！'); sfxThud(true); }
                R.boulder.z = m.b[0]; R.boulder.on = !!m.b[1]; R.boulder.gone = !!m.b[2]; R.boulder.wait = m.b[3];
            }
            R.clock = m.clk || R.clock;
            if (m.st) R.started = true;
            if (m.over && !R.over) escFinish(!!m.won);
        }
        // 非房主的真人做了只有自己知道的事（输对密码、被激光打回去把钥匙弄掉了），告诉房主
        function escapeOnEv(m) {
            let R = escapeRoom;
            if (!R || m.sender === gState.id || !escIsHost()) return;
            let M = R.mechs[m.m]; if (!M) return;
            if (m.ev === 'code' && M.def.type === 'code' && !M.done) { M.done = true; escGateSet(M.gate, true); blazeFlash('队友输对了密码，门开了！'); }
            else if (m.ev === 'drop') M.keyCarrier = -1;
        }

