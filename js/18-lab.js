        // ══════════════════════════════════════════════════════════
        //  实验室（化学）· 第 4A 段
        //  规则以 docs/lab-spec.md 和 docs/chem.md 为准。整个功能默认藏起来：
        //  LAB_ENABLED 为 false 时，只有网址带 ?labdebug=1 才有大厅里的"实验室"模式入口（寻宝队正下面）。
        //  本段只有：一个房间（合成台、灶台、订单板、仓库箱、水池）、原子拼合、衰变、灶台和接触反应、药剂、订单、配方清单、手册。
        //  没有：电路和器材、原子弹、烟花、化学寻宝队、Boss、联机同步（NET_PROTO 不动）。
        // ══════════════════════════════════════════════════════════
        const LAB_ENABLED = false;
        function labDebugOn() { try { return /[?&]labdebug=1(&|$)/.test(location.search); } catch (e) { return false; } }
        function labVisible() { return LAB_ENABLED || labDebugOn(); }

        // 时间和距离（"米" = 场景里的 1 个单位）。冒烟测试会改这几个数把等待缩短。
        const LAB_T = { gather: 1.5, scatterCd: 5, gasLife: 10, poisonLife: 5, rust: 120, glass: 5, mergeR: 1.2, reactR: 0.5, fillR: 2, boomR: 3, boomDmg: 40, poisonDps: 5, poisonR: 4, lock: 60, pickR: 2.4, stationR: 3.4 };
        const LAB_BOX_CAP = 60, LAB_BAG_CAP = 12;

        // ── 元素和核素（数据来自 docs/chem.md，全部"待核对"）──
        const LAB_EL = [null, ['氢', 'H'], ['氦', 'He'], ['锂', 'Li'], ['铍', 'Be'], ['硼', 'B'], ['碳', 'C'], ['氮', 'N'], ['氧', 'O'], ['氟', 'F'], ['氖', 'Ne'], ['钠', 'Na'], ['镁', 'Mg'], ['铝', 'Al'], ['硅', 'Si'], ['磷', 'P'], ['硫', 'S'], ['氯', 'Cl'], ['氩', 'Ar'], ['钾', 'K'], ['钙', 'Ca'], ['钪', 'Sc'], ['钛', 'Ti'], ['钒', 'V'], ['铬', 'Cr'], ['锰', 'Mn'], ['铁', 'Fe'], ['钴', 'Co'], ['镍', 'Ni'], ['铜', 'Cu'], ['锌', 'Zn']];
        const LAB_STABLE = { 1: [1, 2], 2: [3, 4], 3: [6, 7], 4: [9], 5: [10, 11], 6: [12, 13], 7: [14, 15], 8: [16, 17, 18], 9: [19], 10: [20, 21, 22], 11: [23], 12: [24, 25, 26], 13: [27], 14: [28, 29, 30], 15: [31], 16: [32, 33, 34, 36], 17: [35, 37], 18: [36, 38, 40], 19: [39, 41], 20: [40, 42, 43, 44, 46, 48], 21: [45], 22: [46, 47, 48, 49, 50], 23: [50, 51], 24: [50, 52, 53, 54], 25: [55], 26: [54, 56, 57, 58] };
        // [质子数, 中子数, 真实半衰期（秒）, 方式（b- / b+ / ec）]。半衰期比 1000 年长的当作不衰变（LAB_CUTOFF），不进 LAB_DECAY。
        const LAB_CUTOFF = 1000 * 3.156e7;
        const LAB_UNST = [
            [1, 2, 3.88e8, 'b-'], [4, 3, 4.58e6, 'ec'], [4, 6, 4.39e13, 'b-'], [6, 5, 1224, 'b+'], [6, 8, 1.808e11, 'b-'], [7, 6, 600, 'b+'], [8, 6, 70.6, 'b+'], [8, 7, 122, 'b+'], [9, 9, 6600, 'b+'],
            [11, 11, 8.2e7, 'b+'], [11, 13, 54000, 'b-'], [13, 13, 2.26e13, 'b+'], [13, 15, 134.4, 'b-'], [14, 17, 9420, 'b-'], [15, 15, 150, 'b+'], [15, 17, 1.236e6, 'b-'], [15, 18, 2.16e6, 'b-'], [16, 19, 7.5e6, 'b-'],
            [17, 19, 9.5e12, 'b-'], [17, 21, 2220, 'b-'], [18, 19, 3.024e6, 'ec'], [18, 21, 8.49e9, 'b-'], [18, 23, 6540, 'b-'], [19, 21, 3.94e16, 'b-'], [19, 23, 44640, 'b-'],
            [20, 21, 3.16e12, 'ec'], [20, 25, 1.408e7, 'b-'], [21, 25, 7.26e6, 'b-'], [23, 25, 1.382e6, 'b+'], [23, 26, 2.85e7, 'ec'], [24, 27, 2.39e6, 'ec'], [25, 28, 1.17e14, 'ec'], [25, 29, 2.7e7, 'ec'], [26, 29, 8.5e7, 'ec'], [26, 33, 3.84e6, 'b-']
        ];
        // 有第二个分支的：氯-36（约 2% → 硫-36）、钾-40（约 11% → 氩-40）；产物写成 [质子数, 中子数]
        const LAB_UNST_ALT = { '17:19': [[16, 20]], '19:21': [[18, 22]] };
        const LAB_MODE_TXT = { 'b-': 'β⁻', 'b+': 'β⁺', 'ec': '电子俘获' };
        const LAB_NEUTRON_T = 611;
        const LAB_EXTRA_ATOMS = { '27:32': 1, '29:34': 1, '30:34': 1 };   // 钴-59（铁-59 的衰变产物）、铜-63（宝箱原料）、锌-64：能当物品，地上拼不出

        function labAtomName(z, n) { let e = LAB_EL[z]; return e ? e[0] + '-' + (z + n) : '?-' + (z + n); }
        function labAtomOK(z, n) {
            if (z < 1 || z > 26) return false;
            if (LAB_STABLE[z] && LAB_STABLE[z].indexOf(z + n) >= 0) return true;
            return LAB_UNST.some(function (u) { return u[0] === z && u[1] === n; });
        }
        // 衰变信息：{ T: 半衰期秒, prod: [物品 key] }；稳定的返回 null
        const LAB_DECAY = {};
        LAB_UNST.forEach(function (u) {
            if (u[2] > LAB_CUTOFF) return;   // 比 1000 年长的当作不衰变
            let pz = u[3] === 'b-' ? u[0] + 1 : u[0] - 1, pn = u[3] === 'b-' ? u[1] - 1 : u[1] + 1;
            LAB_DECAY['a:' + u[0] + ':' + u[1]] = { T: u[2], prod: ['a:' + pz + ':' + pn], mode: u[3] };
        });
        LAB_DECAY['n'] = { T: LAB_NEUTRON_T, prod: ['p', 'e'], mode: 'b-' };

        // ── 物品定义 ──
        const LAB_FIXED = {
            p: { name: '质子', col: 0xef5350, shape: 's' }, n: { name: '中子', col: 0xbdbdbd, shape: 's' }, e: { name: '电子', col: 0x42a5f5, shape: 's' },
            coal: { name: '煤（碳）', col: 0x333333, shape: 'b' }, iron: { name: '铁块', v: 1000, col: 0x90a4ae, shape: 'b' }, sand: { name: '沙子', col: 0xe6d28a, shape: 'b' },
            salt: { name: '食盐', col: 0xf5f5f5, shape: 'b' }, bottle: { name: '玻璃瓶', col: 0xb3e5fc, shape: 'c', op: 0.55 },
            sugar: { name: '糖', col: 0xfff8e1, shape: 'b' }, rubber: { name: '橡胶', col: 0x424242, shape: 'b' }, fes: { name: '硫化铁', v: 1500, col: 0x5d4037, shape: 'b' }, rust: { name: '铁锈', col: 0x8d4a2b, shape: 'b' },
            'b:water': { name: '水', col: 0x4fc3f7, shape: 'c', op: 0.8 }, 'b:h2': { name: '氢气瓶', col: 0xffcdd2, shape: 'c', op: 0.8 }, 'b:o2': { name: '氧气瓶', col: 0x80deea, shape: 'c', op: 0.8 },
            'b:co2': { name: '二氧化碳瓶', col: 0xb0bec5, shape: 'c', op: 0.8 }, 'b:so2': { name: '二氧化硫瓶', col: 0xfff176, shape: 'c', op: 0.8 }, 'b:cl2': { name: '氯气瓶', col: 0xc5e1a5, shape: 'c', op: 0.8 },
            'b:soda': { name: '苏打水', col: 0x81d4fa, shape: 'c', op: 0.8 }, 'b:naoh': { name: '氢氧化钠溶液', col: 0xe1bee7, shape: 'c', op: 0.8 },
            'g:h2': { name: '氢气', col: 0xffcdd2, shape: 'g', op: 0.35, gas: 1 }, 'g:o2': { name: '氧气', col: 0x80deea, shape: 'g', op: 0.35, gas: 1 },
            'g:co2': { name: '二氧化碳', col: 0xb0bec5, shape: 'g', op: 0.35, gas: 1 }, 'g:so2': { name: '二氧化硫', col: 0xfff176, shape: 'g', op: 0.45, gas: 1, toxic: 1 }, 'g:cl2': { name: '氯气', col: 0xaed581, shape: 'g', op: 0.45, gas: 1, toxic: 1 },
            'pot:heal': { name: '治疗药剂', v: 20000, col: 0xe53935, shape: 'c', op: 0.9 }, 'pot:speed': { name: '加速药剂', v: 25000, col: 0x29b6f6, shape: 'c', op: 0.9 },
            'pot:dmg': { name: '伤害药剂', v: 30000, col: 0x8e24aa, shape: 'c', op: 0.9 }, 'pot:spring': { name: '弹簧鞋', v: 12000, col: 0x66bb6a, shape: 'b' }
        };
        const LAB_BOTTLE_OF = { h2: 'b:h2', o2: 'b:o2', co2: 'b:co2', so2: 'b:so2', cl2: 'b:cl2' };
        const LAB_DEF_CACHE = {};
        function labDef(key) {
            if (LAB_DEF_CACHE[key]) return LAB_DEF_CACHE[key];
            let d = LAB_FIXED[key], m;
            if (d) d = Object.assign({ key: key, v: 0, shape: 'b', op: 1 }, d);
            else if ((m = /^a:(\d+):(\d+)$/.exec(key))) {
                let z = +m[1], n = +m[2];
                d = { key: key, name: labAtomName(z, n), v: 0, shape: 's', op: 1, atom: [z, n], col: new THREE.Color().setHSL(((z * 37) % 360) / 360, 0.65, 0.55).getHex() };
            } else if ((m = /^pack:(\d+):(\d+)$/.exec(key))) {
                d = { key: key, name: '粒子包（' + labAtomName(+m[1], +m[2]) + '）', v: 0, shape: 'b', op: 1, pack: [+m[1], +m[2]], col: 0xffca28 };
            } else d = { key: key, name: key, v: 0, shape: 'b', op: 1, col: 0xcccccc };
            LAB_DEF_CACHE[key] = d;
            return d;
        }
        function labName(key) { return labDef(key).name; }
        function labValue(key) { return labDef(key).v || 0; }

        // ── 按 key 存数量的小仓库（仓库箱、身上、灶台都是这个形状）──
        function labN(st, k) { return st[k] || 0; }
        function labAdd(st, k, n) { st[k] = (st[k] || 0) + (n === undefined ? 1 : n); }
        function labDel(st, k, n) {
            n = n === undefined ? 1 : n;
            if ((st[k] || 0) < n) return false;
            st[k] -= n; if (st[k] <= 0) delete st[k];
            return true;
        }
        function labTotal(st) { return Object.keys(st).reduce(function (a, k) { return a + st[k]; }, 0); }

        // ── 存档（只走白名单：saveProgress / loadProgress / 新号初始化 里都有 lab）──
        function labSt() {
            if (!gState.lab || typeof gState.lab !== 'object') gState.lab = {};
            let L = gState.lab;
            if (!L.box || typeof L.box !== 'object') L.box = {};
            if (!L.made || typeof L.made !== 'object') L.made = {};
            if (!Array.isArray(L.orders)) L.orders = [];
            if (typeof L.lockUntil !== 'number') L.lockUntil = 0;
            if (typeof L.decayAt !== 'number') L.decayAt = 0;
            return L;
        }
        // 往仓库箱里放：满了（种类数到上限且是新种类）就放不进去，返回 false
        function labBoxAdd(k, n) {
            let L = labSt(); n = n === undefined ? 1 : n;
            if (!L.box[k] && Object.keys(L.box).length >= LAB_BOX_CAP) return false;
            labAdd(L.box, k, n);
            return true;
        }

        // ── 衰变（含离线）──
        // 概率 = 1 − 0.5^(t/T)。只在实验室里（地上、身上）和仓库箱里算；战斗里不算。
        function labDecayCount(c, p, rnd) {
            if (c <= 200) { let k = 0; for (let i = 0; i < c; i++) if (rnd() < p) k++; return k; }
            return Math.round(c * p);
        }
        // st：key→数量；secs：过了多少秒；返回 { lost: 放不下消失的件数 }
        function labDecayStore(st, secs, rnd, cap) {
            let lost = 0, born = [];
            Object.keys(st).forEach(function (k) {
                let di = LAB_DECAY[k]; if (!di) return;
                let p = 1 - Math.pow(0.5, secs / di.T), c = st[k], dead = labDecayCount(c, p, rnd);
                if (dead <= 0) return;
                labDel(st, k, dead);
                di.prod.forEach(function (pk) { born.push([pk, dead]); });
            });
            born.forEach(function (b) {
                if (!st[b[0]] && cap && Object.keys(st).length >= cap) lost += b[1];
                else labAdd(st, b[0], b[1]);
            });
            return { lost: lost };
        }
        function labBoxCatchUp(nowMs, rnd) {
            let L = labSt();
            if (!L.decayAt) { L.decayAt = nowMs; return 0; }
            let secs = Math.max(0, (nowMs - L.decayAt) / 1000);
            L.decayAt = nowMs;
            if (secs <= 0) return 0;
            let r = labDecayStore(L.box, secs, rnd || Math.random, LAB_BOX_CAP);
            if (r.lost > 0) { try { blazeFlash('实验室仓库满了，衰变出来的 ' + r.lost + ' 件东西没了'); } catch (e) { } }
            return r.lost;
        }

        // ── 配方 ──
        // where：灶台（点火，摆的东西要正好是这些）／合成台（材料够就能合成；现在放药剂，以后器材配方也放这里）／接触（碰在一起自动发生，这里只是写给玩家看）
        const LAB_RECIPES = [
            { id: 'water', where: '灶台', name: '合成水', in: { 'b:h2': 2, 'b:o2': 1 }, out: { 'b:water': 1, bottle: 2 } },
            { id: 'co2', where: '灶台', name: '二氧化碳', in: { coal: 1, 'b:o2': 1 }, out: { 'b:co2': 1 } },
            { id: 'rubber', where: '灶台', name: '橡胶', in: { coal: 5, 'b:h2': 2 }, out: { rubber: 1, bottle: 2 } },
            { id: 'sugar', where: '灶台', name: '糖', in: { coal: 1, 'b:water': 1 }, out: { sugar: 1, bottle: 1 } },
            { id: 'fes', where: '灶台', name: '硫化铁', in: { iron: 1, 'a:16:16': 1 }, out: { fes: 1 } },
            { id: 'so2', where: '灶台', name: '二氧化硫', in: { 'a:16:16': 1, 'b:o2': 1 }, out: { 'b:so2': 1 } },
            { id: 'glass', where: '灶台', name: '烧玻璃瓶', time: 5, in: { sand: 1 }, out: { bottle: 1 } },
            { id: 'heal', where: '合成台', name: '治疗药剂', in: { sugar: 1, salt: 1, 'b:water': 1 }, out: { 'pot:heal': 1, bottle: 1 } },
            { id: 'speed', where: '合成台', name: '加速药剂', in: { 'b:soda': 1, sugar: 1 }, out: { 'pot:speed': 1, bottle: 1 } },
            { id: 'dmg', where: '合成台', name: '伤害药剂', in: { 'b:naoh': 1, 'b:water': 1 }, out: { 'pot:dmg': 1, bottle: 2 } },
            { id: 'spring', where: '合成台', name: '弹簧鞋', in: { rubber: 2, iron: 2 }, out: { 'pot:spring': 1 } },
            { id: 'h2', where: '接触', name: '氢分子', note: '两个氢-1 原子碰到一起，变成氢气（要装瓶，不然 10 秒后飘走）', in: { 'a:1:0': 2 }, out: { 'g:h2': 1 } },
            { id: 'o2', where: '接触', name: '氧分子', note: '两个氧-16 原子碰到一起，变成氧气（要装瓶）', in: { 'a:8:8': 2 }, out: { 'g:o2': 1 } },
            { id: 'cl2', where: '接触', name: '氯分子', note: '两个氯-35 原子碰到一起，变成氯气（有毒，一定要装瓶）', in: { 'a:17:18': 2 }, out: { 'g:cl2': 1 } },
            { id: 'boom1', where: '接触', name: '爆炸（氢氧混合）', note: '没装瓶的氢气和氧气碰到一起会爆炸', in: { 'g:h2': 1, 'g:o2': 1 }, out: {} },
            { id: 'naoh', where: '接触', name: '钠碰水', note: '钠-23 碰到水（瓶装的、水池里的）：爆炸，炸完留下氢氧化钠溶液', in: { 'a:11:12': 1, 'b:water': 1 }, out: { 'b:naoh': 1 } },
            { id: 'salt', where: '接触', name: '钠碰氯气', note: '钠-23 碰到氯气（瓶装或没装瓶），变成食盐', in: { 'a:11:12': 1, 'b:cl2': 1 }, out: { salt: 1, bottle: 1 } },
            { id: 'rust', where: '接触', name: '铁生锈', note: '铁块挨着水（瓶装或水池）2 分钟，变成铁锈', in: { iron: 1, 'b:water': 1 }, out: { rust: 1 } },
            { id: 'soda', where: '接触', name: '苏打水', note: '一瓶水碰一瓶二氧化碳，变成苏打水', in: { 'b:water': 1, 'b:co2': 1 }, out: { 'b:soda': 1, bottle: 1 } }
        ];
        function labUsedIn(key) {
            return LAB_RECIPES.filter(function (r) { return r.in[key] !== undefined; }).map(function (r) { return r.name; });
        }

        // ── 订单（只出化学类，本段做得出来的）──
        const LAB_ORDER_POOL = [['b:water', 2], ['salt', 1], ['a:3:4', 1], ['b:naoh', 1], ['pot:heal', 1], ['pot:spring', 1], ['a:2:2', 1]];
        function labOrderReward(key) { let v = labValue(key); return v ? Math.round(v * 0.1) : 100; }
        function labOrdersFill(rnd) {
            let L = labSt(); rnd = rnd || Math.random;
            let guard = 0;
            while (L.orders.length < 3 && guard++ < 50) {
                let c = LAB_ORDER_POOL[Math.floor(rnd() * LAB_ORDER_POOL.length)];
                if (L.orders.some(function (o) { return o.k === c[0]; })) continue;
                L.orders.push({ k: c[0], n: c[1], base: L.made[c[0]] || 0 });
            }
        }
        // 造出来一件：只算订单出现之后的
        function labMade(key, n) {
            let L = labSt(); n = n === undefined ? 1 : n;
            L.made[key] = (L.made[key] || 0) + n;
            let done = 0;
            for (let i = L.orders.length - 1; i >= 0; i--) {
                let o = L.orders[i];
                if (o.k === key && (L.made[key] - o.base) >= o.n) {
                    let reward = labOrderReward(o.k);
                    gState.money += reward; done++;
                    L.orders.splice(i, 1);
                    try { blazeFlash('订单完成：' + labName(o.k) + (o.n > 1 ? ' ×' + o.n : '') + '，得到 ' + reward); } catch (e) { }
                }
            }
            if (done) labOrdersFill();
            saveProgress();
        }

        // ══════════════ 运行时：一个能走动的小场景 ══════════════
        let lab = null;
        // 一个大房间（24 × 18 米）：靠北墙一排家具，水池在东南角。四面墙是实的，走不出去
        const LAB_ST = { stove: { x: -8, z: -7.3, name: '灶台' }, craft: { x: -3, z: -7.3, name: '合成台' }, orders: { x: 3, z: -8.5, name: '订单板' }, box: { x: 8, z: -7.3, name: '仓库箱' } };
        const LAB_POOL = { x: 8, z: 4.5, r: 1.7 };
        const LAB_ROOM = { x: 12, z: 9 };   // 墙内侧到中心的距离
        const LAB_BOUND = { x0: -11.4, x1: 11.4, z0: -8.4, z1: 8.4 };   // 人的中心能到的范围（离墙 0.6 米）
        const LAB_EYE = 1.5;   // 眼高（米）
        function labD(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
        function labClampP(o) { o.x = Math.max(LAB_BOUND.x0, Math.min(LAB_BOUND.x1, o.x)); o.z = Math.max(LAB_BOUND.z0, Math.min(LAB_BOUND.z1, o.z)); }
        function labFlash(t) { try { blazeFlash(t); } catch (e) { } }

        // ── 进出 ──
        function labEnter() {
            if (!labVisible() || lab) return;
            let L = labSt(); labBoxCatchUp(Date.now()); labOrdersFill();
            let left = Math.ceil((L.lockUntil - Date.now()) / 1000);
            if (left > 0) { showSysModal('实验室', '刚出过事，还要等 ' + left + ' 秒才能再进去。', [{ label: '好' }]); return; }
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            ensureScene();
            lab = {
                over: false, t: 0, seq: 0, last: performance.now(), raf: null, ground: [], bag: {}, sel: null, stove: { items: {}, cook: null },
                hp: 100, p: { x: 0, y: 0, z: 2, vy: 0 }, face: { x: 0, z: -1 }, k: {}, speedT: 0, dmgT: 0, springT: 0, poisonT: 0,
                geo: {}, mat: {}, objs: [], fx: [], hudT: 0, boxT: 5, hudSig: '', booms: 0, panel: null, oldBg: scene.background, oldFog: scene.fog
            };
            scene.background = new THREE.Color(0xcfe8ff); scene.fog = null;
            labBuildWorld(); labBuildPlayer(); labBuildHud(); labBindKeys();
            camera.rotation.set(0, 0, 0, 'YXZ');   // 第一人称，和主游戏一样：鼠标／手指拖动转视角，眼高 1.5 米，视野不变
            lab.oldNear = camera.near; camera.near = 0.1; camera.updateProjectionMatrix();
            lab.me.visible = false;
            // 点一下空白处锁住鼠标转视角（和大厅一样），Esc 松开去点按钮
            document.body.onmousedown = function (e) {
                if (!lab || lab.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal') || e.target.closest('#lab-panel') || e.target.closest('#lab-book') || e.target.closest('#lab-bag'))) return;
                if (lab.panel || document.getElementById('lab-book')) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            // 鼠标锁住以后：左键 = 捡／交互／使用，右键 = 拆包／接水（第一下点击只负责锁住鼠标）
            lab.onMouse = function (e) {
                if (!lab || lab.over || !document.pointerLockElement) return;
                if (e.target && e.target.closest && e.target.closest('button, #lab-panel, #lab-book, #lab-bag, #sys-modal')) return;
                if (e.button === 0) labClick(); else if (e.button === 2) labRightClick();
            };
            lab.onCtx = function (e) { if (lab) e.preventDefault(); };
            document.addEventListener('mousedown', lab.onMouse); document.addEventListener('contextmenu', lab.onCtx);
            if (gState.control !== 'pad') labFlash('点一下画面锁住鼠标：左键捡／用，右键拆包／接水，Q 放下，Esc 松开');
            lab.last = performance.now();
            lab.raf = requestAnimationFrame(labLoop);
        }
        function labExit(died) {
            if (!lab) return;
            let R = lab; R.over = true;
            if (R.raf) cancelAnimationFrame(R.raf);
            labUnbindKeys(); labPanelClose(); labBookClose();
            document.body.onmousedown = null;
            if (document.pointerLockElement) document.exitPointerLock();
            let hud = document.getElementById('lab-hud'); if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
            let lost = 0;
            if (!died) {
                // 身上、灶台上、地上的东西都收回仓库箱；放不下的没了
                let dump = function (st) { Object.keys(st).forEach(function (k) { if (!labBoxAdd(k, st[k])) lost += st[k]; }); };
                dump(R.bag); dump(R.stove.items);
                R.ground.forEach(function (e) { if (!labDef(e.key).gas) { if (!labBoxAdd(e.key, 1)) lost++; } });
            }
            R.ground.forEach(function (e) { THREE.Scene.prototype.remove.call(scene, e.mesh); });
            R.fx.forEach(function (f) { scene.remove(f.mesh); });
            R.objs.forEach(function (o) { scene.remove(o); });
            Object.keys(R.geo).forEach(function (k) { R.geo[k].dispose(); });
            Object.keys(R.mat).forEach(function (k) { R.mat[k].dispose(); });
            scene.background = R.oldBg; scene.fog = R.oldFog;
            if (R.oldNear) { camera.near = R.oldNear; camera.updateProjectionMatrix(); }
            if (R.onMouse) { document.removeEventListener('mousedown', R.onMouse); document.removeEventListener('contextmenu', R.onCtx); }
            lab = null;
            labSt().decayAt = Date.now();
            saveProgress();
            nav('screen-lobby'); selectGameMode('lab');   // 回大厅，右上角的「开始游戏！」就在老地方
            if (lost > 0) labFlash('仓库箱放不下，' + lost + ' 件东西没了');
        }
        function labDie() {
            if (!lab || lab.over) return;
            let L = labSt(); L.lockUntil = Date.now() + LAB_T.lock * 1000;
            labExit(true);   // 身上、灶台、地上的东西都丢了；仓库箱里的不动
            showSysModal('实验室', '你倒下了，身上和台面的东西都丢了。仓库箱里的没事。过 ' + LAB_T.lock + ' 秒才能再进来。', [{ label: '好' }]);
        }
        function labHurt(n) { if (!lab) return; lab.hp -= n; lab.hurtT = 0.3; }

        // ── 场景 ──
        function labAddObj(o) { scene.add(o); lab.objs.push(o); return o; }
        function labBox(w, h, d, col, x, y, z) {
            let m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col }));
            m.position.set(x, y, z); return labAddObj(m);
        }
        function labFloor(x0, x1, z0, z1, col) {
            let m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color: col }));
            m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); return labAddObj(m);
        }
        // 世界里的文字牌：粗描边的大字，永远朝着镜头（Sprite），3 米外、手机上都能读清
        function labSign(text, x, y, z, w, h) {
            let cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
            let g = cv.getContext('2d'); g.font = 'bold 88px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = '#111'; g.strokeText(text, 256, 68);
            g.fillStyle = '#fff'; g.fillText(text, 256, 68);
            let m = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
            m.scale.set(w * 1.3, h * 1.3, 1); m.position.set(x, y, z); m.userData.labSign = true;
            return labAddObj(m);
        }
        function labBuildWorld() {
            let X = LAB_ROOM.x, Z = LAB_ROOM.z;
            labFloor(-X, X, -Z, Z, 0xb8a99a);
            // 四面墙：实心的（人被限制在 LAB_BOUND 里，碰不到也穿不过）；比人高，看不到墙外
            labBox(2 * X + 0.8, 3.6, 0.4, 0x8d6e63, 0, 1.8, -Z - 0.2); labBox(2 * X + 0.8, 3.6, 0.4, 0x8d6e63, 0, 1.8, Z + 0.2);
            labBox(0.4, 3.6, 2 * Z, 0x8d6e63, -X - 0.2, 1.8, 0); labBox(0.4, 3.6, 2 * Z, 0x8d6e63, X + 0.2, 1.8, 0);
            // 家具
            let st = LAB_ST;
            labBox(3, 1.2, 1.6, 0xb71c1c, st.stove.x, 0.6, st.stove.z); labSign(st.stove.name, st.stove.x, 2.2, st.stove.z, 2.4, 0.6);
            labBox(3, 1.1, 1.6, 0x4a148c, st.craft.x, 0.55, st.craft.z); labSign(st.craft.name, st.craft.x, 2.2, st.craft.z, 2.4, 0.6);
            labBox(2.2, 1.2, 1.6, 0x455a64, st.box.x, 0.6, st.box.z); labSign(st.box.name, st.box.x, 2.2, st.box.z, 2.4, 0.6);
            labBox(3.4, 2.4, 0.3, 0xfff59d, st.orders.x, 1.5, st.orders.z); labSign(st.orders.name, st.orders.x, 3.0, st.orders.z + 0.3, 2.4, 0.6);
            let pool = new THREE.Mesh(new THREE.CylinderGeometry(LAB_POOL.r, LAB_POOL.r, 0.15, 24), new THREE.MeshLambertMaterial({ color: 0x29b6f6 }));
            pool.position.set(LAB_POOL.x, 0.08, LAB_POOL.z); labAddObj(pool); labSign('水池', LAB_POOL.x, 1.5, LAB_POOL.z, 1.8, 0.45);
        }
        function labBuildPlayer() {
            let me = raceMakeBody(mySkinColor(0x42a5f5), 0, true, gState.acc, myFace());
            me.scale.setScalar(0.2); labAddObj(me); lab.me = me;
            me.position.set(lab.p.x, 0, lab.p.z);
        }
        // 第一人称：镜头在眼睛的位置，朝向由鼠标／手指决定（camera.rotation）；自己的身体不画
        function labCamera() {
            camera.position.set(lab.p.x, lab.p.y + LAB_EYE, lab.p.z);
        }

        // ── 地上的东西 ──
        function labGeo(shape) {
            let g = lab.geo[shape];
            if (!g) {
                g = shape === 's' ? new THREE.SphereGeometry(0.28, 10, 8) : shape === 'c' ? new THREE.CylinderGeometry(0.22, 0.28, 0.8, 10) : shape === 'g' ? new THREE.SphereGeometry(0.7, 10, 8) : new THREE.BoxGeometry(0.55, 0.55, 0.55);
                lab.geo[shape] = g;
            }
            return g;
        }
        function labMat(col, op) {
            let k = col + ':' + op, m = lab.mat[k];
            if (!m) { m = new THREE.MeshLambertMaterial({ color: col, transparent: op < 1, opacity: op }); lab.mat[k] = m; }
            return m;
        }
        function labSpawn(key, x, z, o) {
            o = o || {};
            let d = labDef(key), life = d.gas ? (d.toxic ? LAB_T.poisonLife : LAB_T.gasLife) : null;
            let e = { id: ++lab.seq, key: key, x: x, z: z, y: d.gas ? 1.2 : 0.4, age: 0, t: 0, noMerge: o.noMerge || 0, noFill: o.noFill || 0, ttl: life, rust: 0, dead: false };
            labClampP(e);
            e.mesh = new THREE.Mesh(labGeo(d.shape), labMat(d.col, d.op));
            e.mesh.position.set(e.x, e.y, e.z); scene.add(e.mesh);
            lab.ground.push(e);
            return e;
        }
        function labKill(e) {
            if (e.dead) return; e.dead = true;
            THREE.Scene.prototype.remove.call(scene, e.mesh);
            let i = lab.ground.indexOf(e); if (i >= 0) lab.ground.splice(i, 1);
        }
        function labCount(key) { return lab.ground.filter(function (e) { return e.key === key && !e.dead; }).length; }

        // ── 键盘和按钮 ──
        const LAB_KEYMAP = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
        function labKeyDown(e) {
            if (!lab || lab.over) return;
            let t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
            let k = (e.key || '').toLowerCase();
            if (LAB_KEYMAP[k]) { lab.k[LAB_KEYMAP[k]] = true; e.preventDefault(); return; }
            if (k === ' ') { lab.k.jump = true; e.preventDefault(); return; }
            if (e.repeat) return;
            if (k === 'escape') { if (lab.panel) labPanelClose(); else if (document.getElementById('lab-book')) labBookClose(); return; }
            if (lab.panel || document.getElementById('lab-book')) return;
            if (k === 'q' || k === 'g') labPut(e.shiftKey); else if (k === 'f') labPick(); else if (k === 'r') labUse('L'); else if (k === 'e') labInteract(); else if (k === 't') labThrow();
            else if (/^[1-9]$/.test(k)) labSelIdx(+k - 1);
        }
        function labKeyUp(e) {
            if (!lab) return;
            let k = (e.key || '').toLowerCase();
            if (LAB_KEYMAP[k]) lab.k[LAB_KEYMAP[k]] = false; else if (k === ' ') lab.k.jump = false;
        }
        function labBindKeys() { window.addEventListener('keydown', labKeyDown); window.addEventListener('keyup', labKeyUp); }
        function labUnbindKeys() { window.removeEventListener('keydown', labKeyDown); window.removeEventListener('keyup', labKeyUp); }
        function labHold(dir, on) { if (lab) lab.k[dir] = !!on; }
        function labSelIdx(i) { let ks = Object.keys(lab.bag); if (ks[i]) lab.sel = ks[i]; }
        function labSel(k) { if (lab && lab.bag[k]) lab.sel = k; lab.hudSig = ''; }

        // ── 主循环 ──
        function labLoop() {
            if (!lab || lab.over) return;
            let now = performance.now(), dt = Math.min(0.05, (now - lab.last) / 1000);
            lab.last = now;
            labTick(dt);
            if (lab && !lab.over) lab.raf = requestAnimationFrame(labLoop);
        }
        function labTick(dt) {
            lab.t += dt;
            labMove(dt);
            lab.ground.forEach(function (e) { e.age += dt; });
            labGasTick(dt);
            labDecayTick(dt, Math.random);
            labAssemble();
            labReact(dt);
            labFill();
            labToxic(dt);
            labStoveTick(dt);
            labFxTick(dt);
            labSyncMeshes();
            labCamera();
            lab.hudT -= dt; if (lab.hudT <= 0) { lab.hudT = 0.2; labHudUpdate(); }
            lab.boxT -= dt; if (lab.boxT <= 0) { lab.boxT = 5; labBoxCatchUp(Date.now()); }
            if (lab.hp <= 0) { labDie(); return; }
            renderer.render(scene, camera);
        }
        function labMove(dt) {
            let R = lab, k = R.k;
            if (R.speedT > 0) R.speedT -= dt; if (R.dmgT > 0) R.dmgT -= dt; if (R.springT > 0) R.springT -= dt; if (R.hurtT > 0) R.hurtT -= dt;
            let blocked = !!R.panel || !!document.getElementById('lab-book');
            // 前后左右都按镜头朝向算（和主游戏一样）：W 往镜头看的方向走
            let cd = new THREE.Vector3(); camera.getWorldDirection(cd); cd.y = 0;
            if (cd.lengthSq() < 1e-6) cd.set(0, 0, -1); cd.normalize();
            let fwd = blocked ? 0 : (k.w ? 1 : 0) - (k.s ? 1 : 0), strafe = blocked ? 0 : (k.d ? 1 : 0) - (k.a ? 1 : 0);
            if (!blocked && !fwd && !strafe && gState.control === 'pad') { fwd = -tMove.y; strafe = tMove.x; }
            let mx = cd.x * fwd - cd.z * strafe, mz = cd.z * fwd + cd.x * strafe;
            let sp = 7 * (R.speedT > 0 ? 1.3 : 1);
            if (mx || mz) {
                let n = Math.hypot(mx, mz), run = Math.min(1, n); mx /= n; mz /= n;
                R.p.x += mx * sp * run * dt; R.p.z += mz * sp * run * dt; R.face.x = mx; R.face.z = mz;
                R.me.rotation.y = Math.atan2(mx, mz);
            }
            labClampP(R.p);
            if (k.jump && R.p.y <= 0.001 && !blocked) { R.p.vy = 9 * (R.springT > 0 ? Math.sqrt(1.6) : 1); }
            R.p.vy -= 25 * dt; R.p.y += R.p.vy * dt;
            if (R.p.y < 0) { R.p.y = 0; R.p.vy = 0; }
            R.me.position.set(R.p.x, R.p.y, R.p.z);
        }
        function labSyncMeshes() {
            lab.ground.forEach(function (e) {
                let d = labDef(e.key);
                if (d.gas) { e.y = 1.2 + Math.sin(lab.t * 2 + e.id) * 0.3; e.mesh.scale.setScalar(0.8 + 0.2 * Math.sin(lab.t * 5 + e.id)); }
                e.mesh.position.set(e.x, e.y, e.z);
            });
        }
        function labFxTick(dt) {
            lab.fx = lab.fx.filter(function (f) {
                f.t += dt;
                f.mesh.scale.setScalar(1 + f.t * f.grow); f.mesh.material.opacity = Math.max(0, 0.7 - f.t * 1.4);
                if (f.t >= 0.5) { scene.remove(f.mesh); return false; }
                return true;
            });
        }
        function labFxBall(x, z, r, col) {
            let m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 }));
            m.position.set(x, 1, z); scene.add(m); lab.fx.push({ mesh: m, t: 0, grow: 0.8 });
        }

        // ══════════════ 规则：气体、衰变、拼合、反应 ══════════════
        function labGasTick(dt) {
            lab.ground.slice().forEach(function (e) {
                if (!e.ttl) return;
                e.t += dt;
                if (e.t >= e.ttl) labKill(e);   // 没装瓶的气体飘走了
            });
        }
        // 衰变：地上的和身上的。概率 = 1 − 0.5^(dt/T)
        function labDecayTick(dt, rnd) {
            lab.ground.slice().forEach(function (e) {
                let di = LAB_DECAY[e.key]; if (!di) return;
                if (rnd() < 1 - Math.pow(0.5, dt / di.T)) {
                    labKill(e);
                    di.prod.forEach(function (pk, i) { labSpawn(pk, e.x + (i ? 0.4 : 0), e.z); });
                }
            });
            let r = labDecayStore(lab.bag, dt, rnd, LAB_BAG_CAP);
            if (r.lost > 0) labFlash('身上放不下，衰变出来的东西没了');
            labDecayStore(lab.stove.items, dt, rnd, 0);   // 台面上的零散中子也衰变（粒子包、器材里的中子不衰变：它们不是 'n' 这种物品）
            if (lab.sel && !lab.bag[lab.sel]) lab.sel = null;
        }
        // 粒子拼原子：地上的粒子落地 1.5 秒后，挨在一起的按总质子数 Z、中子数 N、电子数 e 拼（Z ≤ 26，表里没有的组合散开）
        function labAssemble() {
            let P = lab.ground.filter(function (e) { return (e.key === 'p' || e.key === 'n' || e.key === 'e') && e.age >= LAB_T.gather && lab.t >= e.noMerge && !e.held; });   // held：放进器材里的东西不参与拼合（本段还没有器材，先留着）
            if (P.length < 2) return;
            let seen = new Set();
            P.forEach(function (a) {
                if (seen.has(a) || a.dead) return;
                let comp = [a]; seen.add(a);
                for (let i = 0; i < comp.length; i++) {
                    P.forEach(function (b) { if (!seen.has(b) && labD(comp[i], b) <= LAB_T.mergeR) { seen.add(b); comp.push(b); } });
                }
                if (comp.length >= 2) labTryAtom(comp);
            });
        }
        function labTryAtom(comp) {
            let np = 0, nn = 0, ne = 0, cx = 0, cz = 0;
            comp.forEach(function (e) { if (e.key === 'p') np++; else if (e.key === 'n') nn++; else ne++; cx += e.x; cz += e.z; });
            cx /= comp.length; cz /= comp.length;
            if (np >= 1 && ne === np && labAtomOK(np, nn)) {
                comp.forEach(labKill);
                let a = labSpawn('a:' + np + ':' + nn, cx, cz);
                labMade(a.key, 1);
                return;
            }
            // 拼不出：散开，5 秒内不再拼
            let a0 = Math.random() * Math.PI * 2;
            comp.forEach(function (e, i) {
                let ang = a0 + i * Math.PI * 2 / comp.length;
                e.x += Math.cos(ang) * 0.3; e.z += Math.sin(ang) * 0.3; labClampP(e);   // 就近挪开一点（0.5 米内），不飞出去
                e.noMerge = lab.t + LAB_T.scatterCd;
            });
        }
        // 接触反应：挨在一起（0.5 米）就发生
        function labWaterNear(e, dead) {
            if (Math.hypot(e.x - LAB_POOL.x, e.z - LAB_POOL.z) <= LAB_POOL.r) return true;
            return lab.ground.some(function (w) { return w.key === 'b:water' && !dead.has(w) && !w.dead && labD(e, w) <= LAB_T.reactR; });
        }
        function labReact(dt) {
            let G = lab.ground, dead = new Set(), add = [], booms = [];
            for (let i = 0; i < G.length; i++) {
                for (let j = i + 1; j < G.length; j++) {
                    let a = G[i], b = G[j];
                    if (dead.has(a) || dead.has(b) || labD(a, b) > LAB_T.reactR) continue;
                    let ka = a.key, kb = b.key, mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
                    let has = function (x, y) { return (ka === x && kb === y) || (ka === y && kb === x); };
                    let cl = function (k) { return /^a:17:(18|20)$/.test(k); };
                    if (ka === 'a:1:0' && kb === 'a:1:0') { dead.add(a); dead.add(b); add.push({ k: 'g:h2', pos: mid }); }
                    else if (ka === 'a:8:8' && kb === 'a:8:8') { dead.add(a); dead.add(b); add.push({ k: 'g:o2', pos: mid }); }
                    else if (cl(ka) && cl(kb)) { dead.add(a); dead.add(b); add.push({ k: 'g:cl2', pos: mid }); }
                    else if (has('g:h2', 'g:o2')) { dead.add(a); dead.add(b); booms.push({ pos: mid }); }
                    else if (has('a:11:12', 'b:water')) { dead.add(a); dead.add(b); booms.push({ pos: mid, after: [{ k: 'b:naoh', pos: mid, made: 1 }] }); }
                    else if (has('a:11:12', 'b:cl2')) { dead.add(a); dead.add(b); add.push({ k: 'salt', pos: mid, made: 1 }, { k: 'bottle', pos: mid }); }
                    else if (has('a:11:12', 'g:cl2')) { dead.add(a); dead.add(b); add.push({ k: 'salt', pos: mid, made: 1 }); }
                    else if (has('b:water', 'b:co2')) { dead.add(a); dead.add(b); add.push({ k: 'b:soda', pos: mid, made: 1 }, { k: 'bottle', pos: mid }); }
                }
            }
            G.forEach(function (e) {
                if (dead.has(e)) return;
                if (e.key === 'a:11:12' && Math.hypot(e.x - LAB_POOL.x, e.z - LAB_POOL.z) <= LAB_POOL.r) { dead.add(e); booms.push({ pos: { x: e.x, z: e.z } }); return; }
                if (e.key === 'iron') {
                    if (labWaterNear(e, dead)) e.rust += dt; else e.rust = 0;
                    if (e.rust >= LAB_T.rust) { dead.add(e); add.push({ k: 'rust', pos: { x: e.x, z: e.z } }); labFlash('铁块生锈了'); }
                }
            });
            dead.forEach(labKill);
            booms.forEach(function (b) { labExplode(b.pos.x, b.pos.z); });
            booms.forEach(function (b) { (b.after || []).forEach(function (q) { labSpawn(q.k, q.pos.x, q.pos.z); if (q.made) labMade(q.k, 1); }); });
            add.forEach(function (q) { labSpawn(q.k, q.pos.x, q.pos.z); if (q.made) labMade(q.k, 1); });
        }
        // 爆炸：3 米、40 伤害，毁掉范围内地上的、灶台上的、身上的东西；仓库箱不受影响
        function labExplode(x, z) {
            let R = lab;
            R.booms++;
            R.ground.slice().forEach(function (e) { if (Math.hypot(e.x - x, e.z - z) <= LAB_T.boomR) labKill(e); });
            if (Math.hypot(LAB_ST.stove.x - x, LAB_ST.stove.z - z) <= LAB_T.boomR) { R.stove.items = {}; R.stove.cook = null; }
            if (Math.hypot(R.p.x - x, R.p.z - z) <= LAB_T.boomR) { R.bag = {}; R.sel = null; labHurt(LAB_T.boomDmg); }
            labFxBall(x, z, LAB_T.boomR * 0.6, 0xff9800);
            labFlash('砰！');
        }
        // 空玻璃瓶在 2 米内会自动把气体装进去
        function labFill() {
            lab.ground.filter(function (g) { return labDef(g.key).gas; }).forEach(function (g) {
                if (g.dead || lab.t < g.noFill) return;
                let bk = LAB_BOTTLE_OF[g.key.slice(2)]; if (!bk) return;
                let b = lab.ground.filter(function (e) { return e.key === 'bottle' && !e.dead && labD(e, g) <= LAB_T.fillR; })[0];
                if (b) { labKill(b); labKill(g); labSpawn(bk, b.x, b.z); return; }
                if (labN(lab.bag, 'bottle') > 0 && Math.hypot(g.x - lab.p.x, g.z - lab.p.z) <= LAB_T.fillR) {
                    labDel(lab.bag, 'bottle'); labKill(g); labBagGive(bk, 1);
                    if (!lab.bag[lab.sel]) lab.sel = null;
                }
            });
        }
        // 没装瓶的氯气、二氧化硫：每秒 5 点伤害（气体存在 5 秒）
        function labToxic(dt) {
            let hit = false;
            lab.ground.forEach(function (g) {
                if (labDef(g.key).toxic && Math.hypot(g.x - lab.p.x, g.z - lab.p.z) <= LAB_T.poisonR) hit = true;
            });
            if (hit) { labHurt(LAB_T.poisonDps * dt); lab.poisonT = 0.4; } else if (lab.poisonT > 0) lab.poisonT -= dt;
        }

        // ══════════════ 灶台 ══════════════
        function labStoveRecipe() {
            let items = lab.stove.items, ks = Object.keys(items);
            return LAB_RECIPES.filter(function (r) { return r.where === '灶台'; }).filter(function (r) {
                let rk = Object.keys(r.in);
                return ks.length === rk.length && ks.every(function (k) { return r.in[k] === items[k]; });
            })[0] || null;
        }
        function labStoveFire() {
            let R = lab; if (R.stove.cook) return false;
            let rec = labStoveRecipe();
            if (!rec) { labFlash('这些东西放在一起没反应'); return false; }
            R.stove.items = {};
            if (rec.time) { R.stove.cook = { rec: rec, t: LAB_T.glass }; labFlash('烧上了'); return true; }
            labStoveDone(rec);
            return true;
        }
        function labStoveDone(rec) {
            Object.keys(rec.out).forEach(function (k) {
                labAdd(lab.stove.items, k, rec.out[k]);
                if (k !== 'bottle') labMade(k, rec.out[k]);
            });
            labFlash('做好了：' + rec.name);
        }
        function labStoveTick(dt) {
            let c = lab.stove.cook; if (!c) return;
            c.t -= dt;
            if (c.t <= 0) { lab.stove.cook = null; labStoveDone(c.rec); if (lab.panel === 'stove') labPanelStove(); }
        }
        function labStovePut(k, all) {
            let n = all ? labN(lab.bag, k) : 1;
            if (lab.stove.cook || n <= 0 || !labDel(lab.bag, k, n)) return;
            labAdd(lab.stove.items, k, n);
            if (!lab.bag[lab.sel]) lab.sel = null;
            labPanelStove();
        }
        function labStoveTake(k) {
            let n = labN(lab.stove.items, k); if (lab.stove.cook || n <= 0) return;
            delete lab.stove.items[k]; labBagGive(k, n);
            labPanelStove();
        }

        function labCanMake(rec, st) { return Object.keys(rec.in).every(function (k) { return labN(st, k) >= rec.in[k]; }); }

        // ══════════════ 合成台：材料够就能合成 ══════════════
        // 现在放药剂配方，以后器材配方（电线、电池……）也放进这一张台。材料取自台面（灶台上摆着的）和身上，先用台面的。
        function labCraftHave(k) { return labN(lab.stove.items, k) + labN(lab.bag, k); }
        function labCraftCan(rec) { return Object.keys(rec.in).every(function (k) { return labCraftHave(k) >= rec.in[k]; }); }
        function labCraftRecipes() { return LAB_RECIPES.filter(function (r) { return r.where === '合成台'; }); }
        function labCraftMake(id) {
            let rec = labCraftRecipes().filter(function (r) { return r.id === id; })[0];
            if (!rec || !labCraftCan(rec)) { labFlash('材料不够'); return false; }
            Object.keys(rec.in).forEach(function (k) {
                let need = rec.in[k], fromStove = Math.min(need, labN(lab.stove.items, k));
                if (fromStove) labDel(lab.stove.items, k, fromStove);
                if (need - fromStove) labDel(lab.bag, k, need - fromStove);
            });
            Object.keys(rec.out).forEach(function (k) { labBagGive(k, rec.out[k]); if (k !== 'bottle') labMade(k, rec.out[k]); });
            if (lab.sel && !lab.bag[lab.sel]) lab.sel = null;
            labFlash('合成了：' + rec.name);
            if (lab.panel === 'craft') labPanelCraft();
            return true;
        }
        function labPanelCraft() {
            let line = function (o) { return Object.keys(o).map(function (k) { return labName(k) + '×' + o[k]; }).join(' + '); };
            let rows = labCraftRecipes().map(function (r) {
                let ok = labCraftCan(r);
                return '<div style="border-bottom:1px solid #eee;padding:6px 0;' + (ok ? '' : 'opacity:.55;') + '"><div style="display:flex;justify-content:space-between;align-items:center;"><b>' + r.name + '</b>' +
                    '<button ' + (ok ? '' : 'disabled ') + 'style="' + LAB_BTN + (ok ? '' : 'background:#b0bec5;cursor:not-allowed;') + '" onclick="labCraftMake(\'' + r.id + '\')">合成</button></div>' +
                    '<div style="font-size:14px;">' + Object.keys(r.in).map(function (k) { let have = labCraftHave(k); return '<span style="color:' + (have >= r.in[k] ? '#2e7d32' : '#c62828') + ';">' + labName(k) + ' ' + have + '/' + r.in[k] + '</span>'; }).join('　') +
                    ' → ' + line(r.out) + '</div></div>';
            }).join('');
            labPanelOpen('craft', '合成台', '<div style="margin:4px 0;color:#666;">材料取自灶台台面和身上（先用台面的）。不够的灰着。合成好的药剂在实验室里用左键喝（伤害药剂按 T 能扔出去）。</div>' + rows);
        }

        // ══════════════ 身上的东西 ══════════════
        // 放进身上；种类满了就掉在脚边
        function labBagGive(k, n) {
            n = n === undefined ? 1 : n;
            if (lab.bag[k] || Object.keys(lab.bag).length < LAB_BAG_CAP) { labAdd(lab.bag, k, n); if (!lab.sel) lab.sel = k; return true; }
            for (let i = 0; i < n; i++) { let q = labNear(lab.p.x, lab.p.z, 0.5); labSpawn(k, q.x, q.z, { noMerge: lab.t + 1.5 }); }
            labFlash('身上放不下，掉在脚边了');
            return false;
        }
        function labNearestItem(maxD) {
            let best = null, bd = maxD;
            lab.ground.forEach(function (e) { if (labDef(e.key).gas) return; let d = Math.hypot(e.x - lab.p.x, e.z - lab.p.z); if (d <= bd) { bd = d; best = e; } });
            return best;
        }
        function labPickEntity(e) {
            if (!e || e.dead) { labFlash('附近没有能拿的东西'); return false; }
            if (!lab.bag[e.key] && Object.keys(lab.bag).length >= LAB_BAG_CAP) { labFlash('身上放不下了'); return false; }
            labKill(e); labAdd(lab.bag, e.key, 1); if (!lab.sel) lab.sel = e.key;
            return true;
        }
        function labPick() { return labPickEntity(labNearestItem(LAB_T.pickR)); }
        // 在 (x, z) 附近 maxR 米内随机找一个落点（东西落地都就近落在原处，不飞出去）
        function labNear(x, z, maxR) {
            let a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * maxR;
            return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
        }
        // Q：把手上选中的东西放在脚下（不飞出去、没有抛物线）；放多个时错开 0.3 米以内的小偏移，不叠在一起
        function labPut(all) {
            let k = lab.sel; if (!k || !labN(lab.bag, k)) { labFlash('先选一样东西'); return false; }
            let n = all ? Math.min(labN(lab.bag, k), 30) : 1;
            labDel(lab.bag, k, n);
            for (let i = 0; i < n; i++) {
                let ang = i * 2.399, r = n > 1 ? 0.3 * Math.sqrt((i + 1) / n) : 0;
                labSpawn(k, lab.p.x + Math.cos(ang) * r, lab.p.z + Math.sin(ang) * r);
            }
            if (!lab.bag[k]) lab.sel = null;
            return true;
        }
        let labDrop = labPut;   // 老名字，测试和旧代码还在用
        // 右键：粒子包拆开；空瓶在水池边接水。左键／R：气体瓶放气；药剂喝掉
        // mode：'L' 左键／R 键（药剂、放气）；'R' 右键（拆粒子包、接水）；不传 = 都行
        function labUse(mode) {
            let k = lab.sel; if (!k || !labN(lab.bag, k)) { labFlash('先选一样东西'); return false; }
            let d = labDef(k);
            if ((d.pack || k === 'bottle') && mode === 'L') { labFlash(d.pack ? '右键拆开' : '右键接水（站在水池边）'); return false; }
            if (!d.pack && k !== 'bottle' && mode === 'R') { labFlash('这个用左键'); return false; }
            if (d.pack) {
                labDel(lab.bag, k, 1);
                let z = d.pack[0], n = d.pack[1], list = [];
                for (let i = 0; i < z; i++) list.push('p', 'e'); for (let i = 0; i < n; i++) list.push('n');
                list.forEach(function (pk) {
                    let q = labNear(lab.p.x, lab.p.z, 0.5);   // 就落在脚边 0.5 米内
                    labSpawn(pk, q.x, q.z, { noMerge: lab.t + LAB_T.scatterCd });
                });
                labFlash('粒子包拆开了');
            } else if (/^b:(h2|o2|co2|so2|cl2)$/.test(k)) {
                labDel(lab.bag, k, 1); labBagGive('bottle', 1);
                labSpawn('g:' + k.slice(2), lab.p.x + lab.face.x * 0.5, lab.p.z + lab.face.z * 0.5, { noFill: lab.t + 2 });
                labFlash('放气了');
            } else if (k === 'bottle') {
                let atPool = Math.hypot(lab.p.x - LAB_POOL.x, lab.p.z - LAB_POOL.z) <= LAB_POOL.r + 1.6;
                if (!atPool) { labFlash('要站在水池边'); return false; }
                labDel(lab.bag, 'bottle', 1); labBagGive('b:water', 1); labMade('b:water', 1);
                labFlash('装了一瓶水');
            } else if (k === 'pot:heal') {
                labDel(lab.bag, k, 1); lab.hp = Math.min(100, lab.hp + 50); labBagGive('bottle', 1); labFlash('喝了治疗药剂，回了 50 点血');
            } else if (k === 'pot:speed') {
                labDel(lab.bag, k, 1); lab.speedT = 30; labBagGive('bottle', 1); labFlash('喝了加速药剂，30 秒内跑得更快');
            } else if (k === 'pot:dmg') {
                labDel(lab.bag, k, 1); lab.dmgT = 30; labBagGive('bottle', 1); labFlash('喝了伤害药剂，30 秒内伤害 ×1.5');
            } else if (k === 'pot:spring') {
                labDel(lab.bag, k, 1); lab.springT = 30; labFlash('穿上了弹簧鞋，30 秒内跳得更高');
            } else { labFlash('这个不能直接用'); return false; }
            if (lab.sel && !lab.bag[lab.sel]) lab.sel = null;
            return true;
        }
        // T：把伤害药剂扔到面前 5 米，50 伤害（3 米内都算；站太近会伤到自己）
        function labThrow() {
            if (lab.sel !== 'pot:dmg' || !labN(lab.bag, 'pot:dmg')) { labFlash('选中伤害药剂再扔'); return false; }
            labDel(lab.bag, 'pot:dmg', 1); labBagGive('bottle', 1);
            let tx = lab.p.x + lab.face.x * 5, tz = lab.p.z + lab.face.z * 5;
            labFxBall(tx, tz, 1.6, 0x8e24aa);
            if (Math.hypot(lab.p.x - tx, lab.p.z - tz) <= 3) labHurt(50);
            labFlash('扔出去了');
            if (lab.sel && !lab.bag[lab.sel]) lab.sel = null;
            return true;
        }
        function labNearStation() {
            let best = null, bd = LAB_T.stationR;
            Object.keys(LAB_ST).forEach(function (k) { let d = Math.hypot(LAB_ST[k].x - lab.p.x, LAB_ST[k].z - lab.p.z); if (d <= bd) { bd = d; best = k; } });
            return best;
        }
        function labInteractWith(st) {
            if (!st) { labFlash('附近没有能用的台子'); return false; }
            if (st === 'stove') labPanelStove(); else if (st === 'craft') labPanelCraft(); else if (st === 'orders') labPanelOrders(); else labPanelBox();
            return true;
        }
        function labInteract() { return labInteractWith(labNearStation()); }

        // ── 瞄准：左键按"准星对着什么"来判断 ──
        // 地上或台上的东西 → 捡；家具（合成台、灶台、订单板、仓库箱）→ 互动；都没对准 → 使用手里的东西
        function labAim() {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            let ex = lab.p.x, ey = lab.p.y + LAB_EYE, ez = lab.p.z, res = { item: null, station: null }, bi = 0, bs = 0;
            let cosOf = function (x, y, z) { let dx = x - ex, dy = y - ey, dz = z - ez, d = Math.hypot(dx, dy, dz) || 1; return (dx * dir.x + dy * dir.y + dz * dir.z) / d; };
            lab.ground.forEach(function (e) {
                if (e.dead || labDef(e.key).gas) return;
                let h = Math.hypot(e.x - lab.p.x, e.z - lab.p.z); if (h > LAB_T.pickR) return;
                let c = cosOf(e.x, e.y, e.z), need = h < 1.3 ? Math.cos(40 * Math.PI / 180) : Math.cos(12 * Math.PI / 180);   // 离得很近的（脚边的）要低头也算
                if (c >= need && c > bi) { bi = c; res.item = e; }
            });
            Object.keys(LAB_ST).forEach(function (k) {
                let q = LAB_ST[k], h = Math.hypot(q.x - lab.p.x, q.z - lab.p.z); if (h > LAB_T.stationR) return;
                let c = cosOf(q.x, 0.9, q.z);
                if (c >= Math.cos(35 * Math.PI / 180) && c > bs) { bs = c; res.station = k; }
            });
            return res;
        }
        function labClick() {
            if (!lab || lab.over || lab.panel || document.getElementById('lab-book')) return false;
            let a = labAim();
            if (a.item) return labPickEntity(a.item);
            if (a.station) return labInteractWith(a.station);
            return labUse('L');
        }
        function labRightClick() {
            if (!lab || lab.over || lab.panel || document.getElementById('lab-book')) return false;
            return labUse('R');
        }

        // ══════════════ 界面 ══════════════
        const LAB_BTN = 'background:#5e35b1;color:#fff;border:none;border-radius:8px;padding:9px 13px;margin:3px;font-size:16px;font-weight:bold;cursor:pointer;';
        const LAB_BTN2 = 'background:#eceff1;color:#263238;border:1px solid #b0bec5;border-radius:6px;padding:7px 11px;margin:2px;font-size:14px;cursor:pointer;';
        // 压在 3D 画面上的字：粗描边，亮暗背景都读得清
        const LAB_OUTLINE = 'text-shadow:-1.5px -1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px 1.5px 0 #000,0 0 6px #000;';
        function labBuildHud() {
            let d = document.createElement('div'); d.id = 'lab-hud';
            d.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;color:#222;';
            d.innerHTML =
                '<div id="lab-status" style="position:absolute;left:8px;top:8px;background:rgba(255,255,255,.92);padding:7px 12px;border-radius:8px;font-size:16px;font-weight:bold;line-height:1.5;"></div>' +
                '<div style="position:absolute;right:8px;top:8px;display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:60vw;pointer-events:auto;">' +
                '<button id="lab-btn-list" style="' + LAB_BTN + '" onclick="labBook(\'list\')">配方清单</button><button id="lab-btn-book" style="' + LAB_BTN + '" onclick="labBook(\'table\')">手册</button>' +
                (labDebugOn() ? '<button id="lab-btn-dbg" style="' + LAB_BTN + 'background:#e65100;" onclick="labDbgPanel()">发材料</button>' : '') +
                '<button id="lab-btn-exit" style="' + LAB_BTN + 'background:#d84315;font-size:18px;padding:10px 16px;" onclick="labExit()">返回大厅</button></div>' +
                '<div id="lab-hint" style="position:absolute;left:50%;bottom:150px;transform:translateX(-50%);color:#fff;padding:4px 12px;font-size:20px;font-weight:bold;white-space:nowrap;' + LAB_OUTLINE + '"></div>' +
                '<div id="lab-cross" style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #000;"></div>' +
                '<div style="position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:min(96vw,640px);text-align:center;pointer-events:auto;">' +
                '<div id="lab-bag" style="background:rgba(255,255,255,.92);border-radius:8px;padding:4px;min-height:34px;font-size:15px;"></div>' +
                '<div style="margin-top:2px;"><button id="lab-btn-act" style="' + LAB_BTN + '" onclick="labClick()">动作</button><button id="lab-btn-put" style="' + LAB_BTN + '" onclick="labPut()">放下 (Q)</button>' +
                '<button id="lab-btn-rc" style="' + LAB_BTN + '" onclick="labRightClick()">拆包/接水</button><button style="' + LAB_BTN + '" onclick="labThrow()">扔药 (T)</button><button style="' + LAB_BTN + '" ontouchstart="event.preventDefault();labHold(\'jump\',true)" ontouchend="labHold(\'jump\',false)" onmousedown="labHold(\'jump\',true)" onmouseup="labHold(\'jump\',false)">跳</button></div></div>' +
                '';   // 走路用屏幕上通用的摇杆（左半屏拖动），转视角拖右半屏——和主游戏一样
            document.body.appendChild(d);
        }
        function labBagHtml() {
            let ks = Object.keys(lab.bag);
            if (!ks.length) return '<span style="color:#888;">身上什么都没有（身上最多 ' + LAB_BAG_CAP + ' 种）</span>';
            return ks.map(function (k, i) {
                return '<span onclick="labSel(\'' + k + '\')" style="display:inline-block;margin:2px;padding:3px 7px;border-radius:12px;cursor:pointer;border:2px solid ' + (lab.sel === k ? '#5e35b1' : '#cfd8dc') + ';background:' + (lab.sel === k ? '#ede7f6' : '#fff') + ';">' + (i + 1) + ' ' + labName(k) + '×' + lab.bag[k] + '</span>';
            }).join('');
        }
        function labHudUpdate() {
            let R = lab; if (!R) return;
            let eff = [];
            if (R.speedT > 0) eff.push('加速 ' + Math.ceil(R.speedT) + ' 秒'); if (R.dmgT > 0) eff.push('伤害 ×1.5 ' + Math.ceil(R.dmgT) + ' 秒'); if (R.springT > 0) eff.push('弹簧鞋 ' + Math.ceil(R.springT) + ' 秒');
            let st = '血量 ' + Math.max(0, Math.ceil(R.hp)) + '/100' + (R.poisonT > 0 ? '　<b style="color:#c62828">毒气！</b>' : '') + (eff.length ? '<br>' + eff.join('　') : '');
            let stEl = document.getElementById('lab-status'); if (stEl && stEl.getAttribute('data-s') !== st) { stEl.innerHTML = st; stEl.setAttribute('data-s', st); }
            let bag = labBagHtml(), bEl = document.getElementById('lab-bag'); if (bEl && bEl.getAttribute('data-s') !== bag) { bEl.innerHTML = bag; bEl.setAttribute('data-s', bag); }
            let hint = '', aim = labAim();
            if (aim.item) hint = '左键：拿 ' + labName(aim.item.key); else if (aim.station) hint = '左键：' + LAB_ST[aim.station].name;
            else if (Math.hypot(R.p.x - LAB_POOL.x, R.p.z - LAB_POOL.z) <= LAB_POOL.r + 1.6) hint = '选中空玻璃瓶，右键：接水';
            let hEl = document.getElementById('lab-hint'); if (hEl) { hEl.innerText = hint; hEl.style.display = hint ? '' : 'none'; }
        }

        // ── 面板（台子的操作界面）──
        function labPanelOpen(name, title, body) {
            let p = document.getElementById('lab-panel');
            if (!p) {
                p = document.createElement('div'); p.id = 'lab-panel';
                p.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:#fff;border-radius:12px;padding:14px 16px;width:min(94vw,520px);max-height:80vh;overflow:auto;box-shadow:0 6px 30px rgba(0,0,0,.4);font-family:"Microsoft YaHei",sans-serif;font-size:13px;color:#222;';
                document.body.appendChild(p);
            }
            lab.panel = name;
            if (document.pointerLockElement) document.exitPointerLock();   // 开面板要用鼠标点
            p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b style="font-size:16px;">' + title + '</b><button style="' + LAB_BTN2 + '" onclick="labPanelClose()">关闭</button></div>' + body;
        }
        function labPanelClose() {
            let p = document.getElementById('lab-panel'); if (p && p.parentNode) p.parentNode.removeChild(p);
            if (lab) lab.panel = null;
        }
        function labItemRow(k, n, btns) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding:3px 0;"><span>' + labName(k) + '×' + n + '</span><span>' + btns + '</span></div>';
        }
        function labPanelStove() {
            let S = lab.stove, rec = labStoveRecipe();
            let on = Object.keys(S.items).map(function (k) { return labItemRow(k, S.items[k], '<button style="' + LAB_BTN2 + '" onclick="labStoveTake(\'' + k + '\')">拿回</button>'); }).join('') || '<div style="color:#888;">台面上没有东西</div>';
            let bag = Object.keys(lab.bag).map(function (k) { return labItemRow(k, lab.bag[k], '<button style="' + LAB_BTN2 + '" onclick="labStovePut(\'' + k + '\')">放 1 个</button><button style="' + LAB_BTN2 + '" onclick="labStovePut(\'' + k + '\',true)">全放</button>'); }).join('') || '<div style="color:#888;">身上没有东西</div>';
            let recs = LAB_RECIPES.filter(function (r) { return r.where === '灶台'; }).map(function (r) {
                return '<div style="color:#555;">' + r.name + '：' + Object.keys(r.in).map(function (k) { return labName(k) + '×' + r.in[k]; }).join(' + ') + ' → ' + Object.keys(r.out).map(function (k) { return labName(k) + '×' + r.out[k]; }).join(' + ') + (r.time ? '（烧 ' + r.time + ' 秒）' : '') + '</div>';
            }).join('');
            labPanelOpen('stove', '灶台', '<div style="margin:4px 0;color:#666;">摆上去的东西要正好是某个配方里的这些，再点火。</div>' +
                '<div><b>台面</b></div>' + on + '<div style="margin-top:6px;"><b>身上</b></div>' + bag +
                '<div style="margin:8px 0;"><button id="lab-fire" style="' + LAB_BTN + '" onclick="labStoveFire();labPanelStove()">点火</button> ' +
                (S.cook ? '<span>烧着呢：' + S.cook.rec.name + '，还要 ' + Math.ceil(S.cook.t) + ' 秒</span>' : (rec ? '<span style="color:#2e7d32;">可以做：' + rec.name + '</span>' : '<span style="color:#888;">现在摆的东西没有对应的配方</span>')) + '</div>' +
                '<div style="margin-top:6px;border-top:1px solid #eee;padding-top:6px;font-size:12px;"><b>灶台配方</b>' + recs + '</div>');
        }
        function labPanelOrders() {
            let L = labSt(); labOrdersFill();
            let rows = L.orders.map(function (o) {
                let got = Math.min(o.n, (L.made[o.k] || 0) - o.base);
                return '<div style="border-bottom:1px solid #eee;padding:6px 0;"><b>' + labName(o.k) + (o.n > 1 ? ' ×' + o.n : '') + '</b>　进度 ' + got + '/' + o.n + '　奖励 ' + labOrderReward(o.k) + '</div>';
            }).join('');
            labPanelOpen('orders', '订单板', '<div style="margin:4px 0;color:#666;">没有时限。订单出现之后，你做出来的才算数；做出来就算完成，东西不扣。</div>' + rows);
        }
        function labBoxTake(k, all) {
            let L = labSt(), n = all ? labN(L.box, k) : 1;
            if (n <= 0) return;
            if (!lab.bag[k] && Object.keys(lab.bag).length >= LAB_BAG_CAP) { labFlash('身上放不下了'); return; }
            labDel(L.box, k, n); labAdd(lab.bag, k, n); if (!lab.sel) lab.sel = k;
            saveProgress(); labPanelBox();
        }
        function labBoxPut(k, all) {
            let L = labSt(), n = all ? labN(lab.bag, k) : 1;
            if (n <= 0) return;
            if (!L.box[k] && Object.keys(L.box).length >= LAB_BOX_CAP) { labFlash('仓库箱满了'); return; }
            labDel(lab.bag, k, n); labAdd(L.box, k, n);
            if (!lab.bag[lab.sel]) lab.sel = null;
            saveProgress(); labPanelBox();
        }
        function labBoxSell(k, all) {
            let L = labSt(), v = labValue(k), n = all ? labN(L.box, k) : 1;
            if (!v || n <= 0 || !labDel(L.box, k, n)) return;
            gState.money += v * n; saveProgress(); labFlash('卖了 ' + labName(k) + ' ×' + n + '，得到 ' + (v * n)); labPanelBox();
        }
        function labPanelBox() {
            let L = labSt();
            let box = Object.keys(L.box).map(function (k) {
                let v = labValue(k);
                return labItemRow(k, L.box[k], '<button style="' + LAB_BTN2 + '" onclick="labBoxTake(\'' + k + '\')">取 1</button><button style="' + LAB_BTN2 + '" onclick="labBoxTake(\'' + k + '\',true)">全取</button>' +
                    (v ? '<button style="' + LAB_BTN2 + '" onclick="labBoxSell(\'' + k + '\')">卖 1（' + v + '）</button>' : ''));
            }).join('') || '<div style="color:#888;">仓库箱是空的</div>';
            let bag = Object.keys(lab.bag).map(function (k) { return labItemRow(k, lab.bag[k], '<button style="' + LAB_BTN2 + '" onclick="labBoxPut(\'' + k + '\')">存 1</button><button style="' + LAB_BTN2 + '" onclick="labBoxPut(\'' + k + '\',true)">全存</button>'); }).join('') || '<div style="color:#888;">身上没有东西</div>';
            labPanelOpen('box', '仓库箱', '<div style="margin:4px 0;color:#666;">箱子里的东西不会被爆炸炸掉，也不会因为你倒下而丢。放射性的东西在这里也会慢慢衰变。（' + Object.keys(L.box).length + '/' + LAB_BOX_CAP + ' 种）</div>' +
                '<div><b>仓库箱</b></div>' + box + '<div style="margin-top:6px;"><b>身上</b></div>' + bag);
        }

        // ── 配方清单和手册（可以在仓库里直接开）──
        const LAB_UI = { only: false, tab: 'list' };
        function labHave(k) { return labN(labSt().box, k) + (lab ? labN(lab.bag, k) : 0); }
        function labBookClose() { let b = document.getElementById('lab-book'); if (b && b.parentNode) b.parentNode.removeChild(b); }
        function labItemTag(k) {
            let u = labUsedIn(k);
            return '<span>' + labName(k) + '</span>' + (u.length ? '<span style="color:#888;font-size:11px;">（用在：' + u.join('、') + '）</span>' : '');
        }
        function labRecipeLine(r) {
            return Object.keys(r.in).map(function (k) { return labItemTag(k) + '×' + r.in[k]; }).join(' + ') + ' → ' + (Object.keys(r.out).map(function (k) { return labName(k) + '×' + r.out[k]; }).join(' + ') || '爆炸');
        }
        function labTimeTxt(T) {
            if (!T || T > LAB_CUTOFF) return '比 1000 年长，当作不衰变';
            if (T < 120) return Math.round(T) + ' 秒'; if (T < 7200) return (T / 60).toFixed(1) + ' 分钟'; if (T < 172800) return (T / 3600).toFixed(1) + ' 小时';
            if (T < 3.15e7 * 2) return (T / 86400).toFixed(0) + ' 天'; return (T / 3.15e7).toFixed(1) + ' 年';
        }
        function labBookPage(tab) {
            if (tab === 'list') {
                let rows = LAB_RECIPES.filter(function (r) { return r.id !== 'boom1'; }).filter(function (r) {
                    return !LAB_UI.only || Object.keys(r.in).every(function (k) { return labHave(k) >= r.in[k]; });
                }).map(function (r) {
                    let ins = Object.keys(r.in).map(function (k) { let h = labHave(k), ok = h >= r.in[k]; return '<span class="lab-have" style="color:' + (ok ? '#2e7d32' : '#c62828') + ';">' + labName(k) + ' 现有 ' + h + ' / 需要 ' + r.in[k] + '</span>'; }).join('　');
                    return '<div class="lab-rec" data-id="' + r.id + '" style="border-bottom:1px solid #eee;padding:5px 0;"><b>' + r.name + '</b> <span style="color:#888;font-size:11px;">' + r.where + '</span><br>' + ins + '</div>';
                }).join('') || '<div style="color:#888;">现在没有能做的</div>';
                return '<label style="display:block;margin:4px 0;"><input type="checkbox" id="lab-only" ' + (LAB_UI.only ? 'checked' : '') + ' onchange="LAB_UI.only=this.checked;labBook(\'list\')"> 只看现在能做的</label>' + rows;
            }
            if (tab === 'table') {
                let rows = '';
                for (let z = 1; z <= 26; z++) {
                    let el = LAB_EL[z], iso = [];
                    (LAB_STABLE[z] || []).forEach(function (a) { iso.push(labItemTag('a:' + z + ':' + (a - z))); });
                    LAB_UNST.filter(function (u) { return u[0] === z; }).forEach(function (u) { iso.push(labItemTag('a:' + z + ':' + u[1]) + '<span style="color:#c62828;font-size:11px;">［' + LAB_MODE_TXT[u[3]] + '，' + labTimeTxt(u[2]) + '］</span>'); });
                    rows += '<div style="border-bottom:1px solid #eee;padding:3px 0;"><b>' + z + ' ' + el[1] + ' ' + el[0] + '</b>　' + iso.join('　') + '</div>';
                }
                return '<div style="color:#888;margin-bottom:4px;">质子数 1～26 的核素，地上的粒子会按质子数、中子数、电子数自动拼成它们。红字的会衰变。数据待核对。</div>' + rows;
            }
            if (tab === 'react') {
                return LAB_RECIPES.filter(function (r) { return r.where !== '合成台'; }).map(function (r) {
                    return '<div style="border-bottom:1px solid #eee;padding:5px 0;"><b>' + r.name + '</b> <span style="color:#888;font-size:11px;">' + r.where + '</span><br>' + labRecipeLine(r) + (r.note ? '<br><span style="color:#666;">' + r.note + '</span>' : '') + '</div>';
                }).join('') + '<div style="margin-top:6px;color:#666;">气体必须装瓶：空玻璃瓶在 2 米内会自动装；没装进瓶的气体 10 秒后飘走。氯气、二氧化硫没装瓶有毒（每秒 5 点伤害，5 秒）。爆炸 3 米、40 点伤害，会毁掉范围内所有东西，仓库箱除外。</div>';
            }
            if (tab === 'potion') {
                let eff = { heal: '+50 血', speed: '30 秒移速 +30%', dmg: '喝：30 秒伤害 ×1.5；T 扔出去：50 点伤害', spring: '30 秒跳高 ×1.6' };
                return LAB_RECIPES.filter(function (r) { return r.where === '合成台'; }).map(function (r) {
                    return '<div style="border-bottom:1px solid #eee;padding:5px 0;"><b>' + r.name + '</b>　' + eff[r.id] + '<br>' + labRecipeLine(r) + '</div>';
                }).join('') + '<div style="margin-top:6px;color:#666;">药剂本段只在实验室里用。</div>';
            }
            if (tab === 'order') {
                let L = labSt();
                return '<div style="color:#666;margin-bottom:6px;">订单板同时 3 张，没有时限，完成立刻补新的。订单出现之后你做出来的才算，做出来就算完成，东西不扣。奖励是东西价值的 10%（没标价的给 100）。</div>' +
                    '<div><b>现在的订单</b></div>' + (L.orders.map(function (o) { return '<div>' + labName(o.k) + (o.n > 1 ? ' ×' + o.n : '') + '　奖励 ' + labOrderReward(o.k) + '</div>'; }).join('') || '<div style="color:#888;">还没有（进一次实验室就有了）</div>') +
                    '<div style="margin-top:6px;"><b>可能出现的题目</b></div>' + LAB_ORDER_POOL.map(function (c) { return '<div>' + labItemTag(c[0]) + (c[1] > 1 ? ' ×' + c[1] : '') + '</div>'; }).join('');
            }
            if (tab === 'neutron') {
                return '<div style="line-height:1.7;"><b>中子</b><br>不带电的粒子。原子核里的中子数不同，就是同一种元素的不同核素。<br>单独在地上的中子不稳定，半衰期 ' + LAB_NEUTRON_T + ' 秒，衰变成 1 个质子和 1 个电子。<br>质子 + 电子变回中子，要用加速器的转换模式（后面才有）。<br>粒子包右键能拆成单个粒子；拼不出来的组合会散开，5 秒内不再拼。</div>';
            }
            return '';
        }
        function labBook(tab) {
            if (document.pointerLockElement) document.exitPointerLock();
            LAB_UI.tab = tab || LAB_UI.tab;
            let b = document.getElementById('lab-book');
            if (!b) {
                b = document.createElement('div'); b.id = 'lab-book';
                b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;background:#fff;border-radius:12px;padding:12px 14px;width:min(95vw,600px);max-height:84vh;overflow:auto;box-shadow:0 6px 30px rgba(0,0,0,.45);font-family:"Microsoft YaHei",sans-serif;font-size:13px;color:#222;';
                document.body.appendChild(b);
            }
            let tabs = [['list', '配方清单'], ['table', '周期表'], ['react', '反应'], ['potion', '药剂'], ['order', '订单'], ['neutron', '中子']];
            b.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><b style="font-size:16px;">实验室手册</b><button style="' + LAB_BTN2 + '" onclick="labBookClose()">关闭</button></div>' +
                '<div style="margin:6px 0;">' + tabs.map(function (t) { return '<button class="lab-tab" style="' + (t[0] === LAB_UI.tab ? LAB_BTN : LAB_BTN2) + '" onclick="labBook(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>' +
                '<div id="lab-book-body">' + labBookPage(LAB_UI.tab) + '</div>';
        }

        // ── 调试：只有网址带 ?labdebug=1 才有"发材料" ──
        const LAB_DBG_ITEMS = ['coal', 'iron', 'a:29:34', 'sand', 'salt', 'bottle', 'p', 'e', 'n', 'a:1:0', 'a:8:8', 'a:11:12', 'a:16:16', 'a:17:18', 'a:3:4', 'a:2:2', 'pack:1:0', 'pack:2:2', 'pack:3:4', 'pack:6:6', 'b:h2', 'b:o2', 'b:water', 'b:co2', 'b:cl2', 'b:soda', 'b:naoh', 'sugar', 'rubber'];
        function labGive(k, n) {
            if (!labDebugOn() || !lab) return false;
            n = n === undefined ? 1 : n;
            labAdd(lab.bag, k, n); if (!lab.sel) lab.sel = k; lab.hudSig = '';
            return true;
        }
        function labDbgPanel() {
            if (!labDebugOn() || !lab) return;
            labPanelOpen('dbg', '发材料（调试）', LAB_DBG_ITEMS.map(function (k) {
                return '<button style="' + LAB_BTN2 + '" onclick="labGive(\'' + k + '\',1)">' + labName(k) + '</button>';
            }).join('') + '<div style="margin-top:6px;"><button style="' + LAB_BTN2 + '" onclick="labGive(\'coal\',5);labGive(\'b:h2\',2)">橡胶一套</button></div>');
        }

        // ── 大厅里的入口（藏起来的时候不显示；按钮在 index.html 的模式列表里，寻宝队正下面）──
        function labRefreshButtons() {
            let b = document.getElementById('btn-mode-lab'); if (b) b.style.display = labVisible() ? '' : 'none';
        }

        // 调试用：清空地上的东西（只在 ?labdebug=1 时有用，冒烟测试用）
        function labClear() { if (!labDebugOn() || !lab) return; lab.ground.slice().forEach(labKill); }
        // 调试用：不等真实时间，直接把实验室往前推 secs 秒（每步 0.05 秒；冒烟测试用，不依赖帧率）
        function labAdvance(secs, step) {
            if (!labDebugOn() || !lab) return;
            step = step || 0.05;
            let R = renderer.render; if (secs / step > 400) renderer.render = function () { };   // 推很久的时候中间不画
            try { for (let t = 0; t < secs - 1e-9 && lab && !lab.over; t += step) labTick(step); } finally { renderer.render = R; }
        }
