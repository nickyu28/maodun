        // ══════════════════════════════════════════════════════════
        //  猫盾工业（硬核模式 + 农场）· 第 1～2 阶段
        //  基地永久保留，每次出门远征一张新的开放地图，带东西回基地。设计稿在 docs/industry.md。
        //  这个文件只新增，不改别的模式：大厅按钮是运行时插进去的，selectGameMode / lobbyPrimaryStart 是包了一层，
        //  原来的函数照样调用。整个功能默认藏起来：IND_ENABLED 为 false 时，只有网址带 ?hcdebug=1（记在本机，?hcdebug=0 清掉）才看得到。
        //  存档单独放在浏览器的 IndexedDB（库 maodun_industry），不进主存档白名单，SAVE_VER 不动。
        //  第 1 阶段：隐藏入口、基地、远征地图（七种地貌、资源点、撤离点）、采集、撤离。
        //  第 2 阶段：世界规则（悠闲 / 硬核）、生存值（饱食、口渴、精力、体力、血量）、昼夜、床、种地、浇水、灶台（火候、燃料、做饭、烧开水、烧焦）。
        //  第 2.5 阶段：季节（一季 3 天，作物分季节，暖棚）、体温（气温、衣服、灶台和篝火取暖、下水冷）、工作台（衣服、篝火、暖棚）。
        //  第 2.8 阶段：动物（羊、牛、狗、猫）：远征里喂吃的就跟着你，撤离时一起回家；羊剪毛、牛挤奶，羊毛做毛衣帽围巾，牛奶喝或煮奶酪。
        //  第 3a 阶段（只给硬核）：冶炼（铜锌铁矿、黄铜、钢）、风箱（鼓风 1600°C）、刚出炉的锭是烫的（不拿钳子每秒扣血，泡水马上凉、放地上 30 秒凉）、钳子、铁稿、钢稿、配方查询。
        //  第 3b 阶段（只给硬核）：电。电池组（每节 1.5 V、180 U）、蒸汽发电机（灶台中火以上旁边 3 米，12 V 不限电量）、
        //  用电器（灯 6 V、水泵 12 V、电炉 24 V）、铜线一头接电源一头接用电器；电压超过额定直接炸（3 米内基地的东西都没了）。
        //  第 5 阶段（只给硬核）：压力。钢瓶（60 份，压力 = 份数 × (温度 + 273) ÷ 293，超 100 个大气压炸）、压缩机、二氧化碳、干冰、压力机出钻石、钻石稿。
        //  冬天的菜（悠闲硬核都有）：热汤（番茄汤、萝卜汤、白菜炖萝卜）吃了体温 +1.5°C 最多到 37；腌萝卜（萝卜 2 + 盐 1 + 玻璃瓶 1，吃完还瓶子）；悠闲也能烧玻璃瓶。
        //  第 4 阶段（只给硬核）：化学。灶台烧柴攒草木灰；沙子 + 草木灰 1000°C 出玻璃瓶（沙子单独要 1700°C）；电解槽（12 V）：
        //  水 ≥ 2 V 出 2 氢 1 氧，盐水 ≥ 3 V 出氢氧化钠、氢、氯，熔融盐（灶台 801°C 以上 3 米内）≥ 4 V 出钠和氯；
        //  气瓶放下就是放气：氢气碰到火（灶台开着、篝火 3 米内）就炸，氯气是毒气（45 秒，3 米内每秒扣 8 血）；元素表（拿到一种元素就点亮一格）。
        //  还没有：猫狗带到大厅当装饰（要改主游戏的宠物，以后和 Code 一起做）。
        // ══════════════════════════════════════════════════════════
        const IND_ENABLED = false;
        const IND_DBG_KEY = 'TH_hcdebug';
        function indDebugRead() {
            let q = null;
            try { let m = /[?&]hcdebug=([01])(&|$)/.exec(location.search); if (m) q = m[1]; } catch (e) { }
            if (q === '1') { try { localStorage.setItem(IND_DBG_KEY, '1'); } catch (e) { } return true; }
            if (q === '0') { try { localStorage.removeItem(IND_DBG_KEY); } catch (e) { } return false; }
            try { return localStorage.getItem(IND_DBG_KEY) === '1'; } catch (e) { return false; }
        }
        let IND_DBG_CACHE = null;
        function indDebugOn() { if (IND_DBG_CACHE === null) IND_DBG_CACHE = indDebugRead(); return IND_DBG_CACHE; }
        function indVisible() { return IND_ENABLED || indDebugOn(); }

        // ── 数值（冒烟测试可以改小）──
        const IND_BELL_R = 30;
        const IND_PICK_HOLD = 1;
        const IND_AIM_COS = Math.cos(30 * Math.PI / 180);
        const IND_T = { extract: 3, pickR: 2.6, gateR: 2.2, exitR: 3, speed: 7, run: 1.6 };
        const IND_BASE = { x: 30, z: 22.5 };          // 基地半宽、半深（60 × 45 米）
        const IND_FIELD = { x0: -28, x1: -6, z0: -18, z1: 18, tile: 2 };   // 农田（基地左边），2 米一格
        const IND_MAP = 150;                          // 远征地图半宽（300 × 300 米）
        const IND_BAG_SLOTS = 24, IND_STACK = 99, IND_CHEST_SLOTS = 30;        // 背包 24 格，每格最多 99 个，同一种能占多格；新做的箱子 30 格，原来那个仓库箱不限
        const IND_EYE = 1.8;
        const IND_CAM = { back: 4.4, up: 1.2 };
        // 时间：一天 1200 秒（白天 900、夜里 300）；生存值按"每秒"算
        const IND_DAY = 1200, IND_DUSK = 900;
        const IND_SEASON_DAYS = 3;
        const IND_SEASONS = [{ name: '春', t: 18 }, { name: '夏', t: 28 }, { name: '秋', t: 15 }, { name: '冬', t: -5 }];
        // 体温：等效气温 = 气温 + 衣服保暖 × 2.5；低于 15°C 慢慢变冷、高于 30°C 慢慢变热，每差 1 度每秒变 0.0015°C；不冷不热时每秒回 37°C 0.02
        const IND_BODY = { warmMul: 2.5, cold: 15, hot: 30, rate: 0.0015, back: 0.02, chill: 35, freeze: 33, sweat: 39, boil: 41, fireR: 4, fireHeat: 20, waterCold: 10 };
        const IND_SURV = { food: 2 / 60, water: 4 / 60, energy: 4 / 60, runEnergy: 2, nightOut: 3, sick: 60, sickWater: 3, stamDrain: 28, stamRegen: 16, regen: 0.3, starveHp: 1, thirstHp: 2 };

        // ── 物品 ──
        // tool：稿子等级；eat：吃喝的效果 { f 饱食, w 口渴, sick 拉肚子概率, back 吃完还回来什么 }
        // 钢瓶：里面的气体写在物品名里（cyl:h2=20,o2=5 = 氢气 20 份、氧气 5 份），所以不同装法是不同的物品，能叠、能存档；
        // 压力 = 份数 × (温度 + 273) ÷ 293，温度就是它所在位置的温度（灶台上是灶台温度，别处 20°C）
        const IND_CYL_CAP = 60, IND_CYL_MAX_P = 100, IND_CYL_LIQ = 57, IND_CYL_GAS = { h2: '氢气', o2: '氧气', cl2: '氯气', co2: '二氧化碳' };
        function indCylParse(k) {
            if (k === 'cyl') return {};
            if (typeof k !== 'string' || k.indexOf('cyl:') !== 0) return null;
            let g = {}, tot = 0, ok = true;
            k.slice(4).split(',').forEach(function (p) {
                let m = /^(h2|o2|cl2|co2)=(\d{1,3})$/.exec(p);
                if (!m || g[m[1]] || +m[2] < 1) { ok = false; return; }
                g[m[1]] = +m[2]; tot += +m[2];
            });
            return ok && tot > 0 && tot <= IND_CYL_CAP ? g : null;
        }
        function indCylKey(g) {
            let parts = Object.keys(IND_CYL_GAS).filter(function (x) { return g[x] > 0; }).map(function (x) { return x + '=' + g[x]; });
            return parts.length ? 'cyl:' + parts.join(',') : 'cyl';
        }
        function indCylN(g) { let n = 0; Object.keys(g).forEach(function (x) { n += g[x]; }); return n; }
        function indCylP(g, T) { return indCylN(g) * ((T === undefined ? 20 : T) + 273) / 293; }
        function indCylLiquid(g) { return !!g.co2 && g.co2 === indCylN(g) && g.co2 > IND_CYL_LIQ; }   // 纯二氧化碳，20°C 下超过 57 个大气压就是液态
        function indCylName(g, T) {
            let n = indCylN(g); if (!n) return '钢瓶（空）';
            let what = indCylLiquid(g) ? '液态二氧化碳 ' + g.co2 + ' 份' : Object.keys(IND_CYL_GAS).filter(function (x) { return g[x] > 0; }).map(function (x) { return IND_CYL_GAS[x] + ' ' + g[x]; }).join('、') + ' 份';
            return '钢瓶（' + what + '，' + Math.round(indCylP(g, T)) + ' 个大气压）';
        }
        // 桶分材质：木桶（接水、挤奶、装汤，不能上火）、陶罐（能上火，每次用 1/10 碎掉）、铁桶、黄铜桶（能上火，不碎）。
        // 装了东西的桶记住材质：生水＝木桶（老档的桶都算木桶），生水@jar／@fe／@cu 是另外三种；用完还回同一种空桶
        const IND_MATS = { wood: { name: '木桶', empty: 'bucket', suf: '' }, jar: { name: '陶罐', empty: 'jar', suf: '@jar', fire: true, breaks: 0.1 }, fe: { name: '铁桶', empty: 'bucket_fe', suf: '@fe', fire: true }, cu: { name: '黄铜桶', empty: 'bucket_cu', suf: '@cu', fire: true } };
        const IND_CONT_BASES = ['water_raw', 'water_sea', 'water_boiled', 'milk', 'tomato_soup', 'radish_soup', 'cabbage_stew'];
        const IND_TAKE_ORDER = ['fe', 'cu', 'wood', 'jar'];   // 配方先用不会碎的
        function indFilledKey(base, mat) { return base + IND_MATS[mat].suf; }
        function indEmptyKey(mat) { return IND_MATS[mat].empty; }
        // k 是装了东西的桶（{ base, mat, empty: false }）、空桶（{ base: null, mat, empty: true }）还是别的东西（null）
        function indContOf(k) {
            if (typeof k !== 'string') return null;
            let r = IND_ITEMS_RAW[k]; if (r && r.cont) return { base: null, mat: r.cont, empty: true };
            let i = k.indexOf('@'), base = i < 0 ? k : k.slice(0, i), m = i < 0 ? 'wood' : k.slice(i + 1);
            if (IND_CONT_BASES.indexOf(base) < 0 || !IND_MATS[m] || (i >= 0 && m === 'wood')) return null;
            return { base: base, mat: m, empty: false };
        }
        function indIsEmptyCont(k) { let c = indContOf(k); return !!c && c.empty; }
        // 这堆东西里 k 有多少个（k 是装了东西的桶时，各种材质的都算）
        function indHave(items, k) {
            if (IND_CONT_BASES.indexOf(k) < 0) return items[k] || 0;
            let n = 0; Object.keys(IND_MATS).forEach(function (m) { n += items[indFilledKey(k, m)] || 0; }); return n;
        }
        // 配方扣原料；返回装原料的桶各是什么材质（一份一个）
        function indConsume(items, r, n) {
            let mats = [];
            Object.keys(r.in).forEach(function (k) {
                let need = r.in[k] * n;
                if (IND_CONT_BASES.indexOf(k) < 0) { items[k] -= need; if (items[k] <= 0) delete items[k]; return; }
                IND_TAKE_ORDER.forEach(function (m) {
                    let key = indFilledKey(k, m), t = Math.min(need, items[key] || 0);
                    for (let i = 0; i < t; i++) mats.push(m);
                    if (t > 0) { items[key] -= t; if (items[key] <= 0) delete items[key]; need -= t; }
                });
            });
            return mats;
        }
        // 做完出什么：桶按用的材质还回去（陶罐 1/10 碎掉，碎了桶和装在桶里的成品都没了）
        function indCookResult(r, n, mats, burnt) {
            let out = {}, broke = 0;
            for (let i = 0; i < n; i++) {
                let mat = mats[i] || null, lost = false;
                if (mat && IND_MATS[mat].breaks && indRand() < IND_MATS[mat].breaks) { lost = true; broke++; }
                let src = burnt ? (r.out.bucket ? { char: 1, bucket: r.out.bucket } : { char: 1 }) : r.out;
                Object.keys(src).forEach(function (k) {
                    let key = k;
                    if (mat) {
                        if (k === 'bucket') { if (lost) return; key = indEmptyKey(mat); }
                        else if (IND_CONT_BASES.indexOf(k) >= 0) { if (lost) return; key = indFilledKey(k, mat); }
                    }
                    out[key] = (out[key] || 0) + src[k];
                });
            }
            return { out: out, broke: broke };
        }
        const IND_ITEMS_RAW = {
            wood: { name: '木头', col: 0x8d6e63, fuel: 60 },
            stone: { name: '石头', col: 0x9e9e9e },
            sand: { name: '沙子', col: 0xffe082 },
            clay: { name: '黏土', col: 0xbcaaa4 }, dirt: { name: '泥土', col: 0x6d4c41, use: '开农田' },
            salt: { name: '盐', col: 0xf5f5f5 },
            coal: { name: '煤', col: 0x263238, fuel: 150 },
            oil: { name: '石油', col: 0x212121, useLater: '后面的阶段' },
            ore_cu: { name: '铜矿', col: 0xd84315 },
            ore_zn: { name: '锌矿', col: 0x90a4ae },
            ore_fe: { name: '铁矿', col: 0x795548 },
            sulfur: { name: '硫', col: 0xfdd835, useLater: '后面的阶段' },
            ore_sn: { name: '锡矿', col: 0xb0bec5 },
            ore_u: { name: '铀矿', col: 0x7cb342, useLater: '核和火箭' },
            pick_stone: { name: '石稿', col: 0x757575, tool: 1 },
            charcoal: { name: '木炭', col: 0x37474f, fuel: 120 },
            char: { name: '焦炭', col: 0x111111, fuel: 40 },
            bucket: { name: '木桶', col: 0x8d6e63, cont: 'wood', use: '接水、挤奶、装汤' }, jar: { name: '陶罐', col: 0xbf7b4a, cont: 'jar', use: '装水（能上火，用着用着会碎）' }, bucket_fe: { name: '铁桶', col: 0x78909c, cont: 'fe', use: '装水（能上火）' }, bucket_cu: { name: '黄铜桶', col: 0xfbc02d, cont: 'cu', use: '装水（能上火）' }, shears: { name: '剪刀', col: 0xb0bec5, shears: true, use: '剪羊毛' },
            water_raw: { name: '生水', col: 0x4fc3f7, eat: { w: 15, sick: 0.3, back: 'bucket' } },
            water_sea: { name: '海水', col: 0x0288d1, eat: { w: -10, back: 'bucket' } },
            water_boiled: { name: '开水', col: 0xb3e5fc, eat: { w: 40, back: 'bucket' } },
            seed_wheat: { name: '小麦种子', col: 0xd7ccc8, seed: 'wheat' }, wheat: { name: '小麦', col: 0xffca28 },
            seed_potato: { name: '土豆种子', col: 0xd7ccc8, seed: 'potato' }, potato: { name: '土豆', col: 0xa1887f },
            seed_tomato: { name: '番茄种子', col: 0xd7ccc8, seed: 'tomato' }, tomato: { name: '番茄', col: 0xe53935, eat: { f: 8, w: 6 } },
            seed_corn: { name: '玉米种子', col: 0xd7ccc8, seed: 'corn' }, corn: { name: '玉米', col: 0xfdd835 },
            seed_cane: { name: '甘蔗种子', col: 0xd7ccc8, seed: 'cane' }, cane: { name: '甘蔗', col: 0x9ccc65 },
            seed_pumpkin: { name: '南瓜种子', col: 0xd7ccc8, seed: 'pumpkin' }, pumpkin: { name: '南瓜', col: 0xfb8c00 },
            bake_potato: { name: '烤土豆', col: 0x8d6e63, eat: { f: 30 } },
            bake_corn: { name: '烤玉米', col: 0xf9a825, eat: { f: 25 } },
            bread: { name: '面包', col: 0xd7a86e, eat: { f: 40 } },
            tomato_soup: { name: '番茄汤', col: 0xd84315, eat: { f: 25, w: 20, back: 'bucket', hot: 1 } },
            radish_soup: { name: '萝卜汤', col: 0xf5f5dc, eat: { f: 30, w: 20, back: 'bucket', hot: 1 } },
            cabbage_stew: { name: '白菜炖萝卜', col: 0xdce775, eat: { f: 40, w: 10, back: 'bucket', hot: 1 } },
            pickle: { name: '腌萝卜', col: 0xf8bbd0, eat: { f: 15, back: 'bottle' } },
            sugar: { name: '糖', col: 0xffffff, eat: { f: 10 } },
            pumpkin_pie: { name: '南瓜派', col: 0xef6c00, eat: { f: 60 } },
            seed_cotton: { name: '棉花种子', col: 0xd7ccc8, seed: 'cotton' }, cotton: { name: '棉花', col: 0xfafafa },
            seed_cabbage: { name: '白菜种子', col: 0xd7ccc8, seed: 'cabbage' }, cabbage: { name: '白菜', col: 0xc5e1a5, eat: { f: 10, w: 4 } },
            seed_radish: { name: '萝卜种子', col: 0xd7ccc8, seed: 'radish' }, radish: { name: '萝卜', col: 0xffffff, eat: { f: 8, w: 3 } },
            coat: { name: '棉衣', col: 0x5c6bc0, wear: 'body', warm: 6 },
            hat: { name: '棉帽', col: 0x8e24aa, wear: 'head', warm: 2 },
            scarf: { name: '围巾', col: 0xe53935, wear: 'neck', warm: 2 },
            campfire: { name: '篝火', col: 0xff7043, place: true },
            wool: { name: '羊毛', col: 0xf5f5f5 }, yarn: { name: '毛线', col: 0xeeeeee },
            sweater: { name: '毛衣', col: 0xc62828, wear: 'body', warm: 8 },
            wool_hat: { name: '毛帽', col: 0x1565c0, wear: 'head', warm: 3 },
            blast_suit: { name: '防爆服', col: 0x455a64, wear: 'body', warm: 10, blast: 0.5, heavy: 0.6, use: '爆炸伤害少一半，很重（走路 ×0.6）' },
            blast_helmet: { name: '防爆头盔', col: 0x607d8b, wear: 'head', warm: 0, blast: 0.2, use: '爆炸伤害少两成' },
            wool_scarf: { name: '毛围巾', col: 0xf9a825, wear: 'neck', warm: 3 },
            milk: { name: '牛奶', col: 0xfffde7, eat: { f: 5, w: 25, back: 'bucket' } },
            cheese: { name: '奶酪', col: 0xffe082, eat: { f: 35 } },
            ingot_cu: { name: '铜锭', col: 0xd84315 }, ingot_zn: { name: '锌锭', col: 0xb0bec5 }, ingot_fe: { name: '铁锭', col: 0x616161 }, ingot_sn: { name: '锡锭', col: 0xcfd8dc }, bronze: { name: '青铜锭', col: 0xb87333 },
            brass: { name: '黄铜锭', col: 0xfbc02d }, brick: { name: '砖', col: 0xbf5b3a }, glass_plate: { name: '玻璃板', col: 0xc5e8f2 }, bellows: { name: '风箱', col: 0x8d6e63, use: '装在炉子上' },
            cook_furnace: { name: '小熔炉', col: 0x6d4c41, cook: 'furnace' }, cook_kiln: { name: '大窑', col: 0x8d4b3a, cook: 'kiln' }, bell: { name: '铃铛', col: 0xffd54f, use: '摇铃叫动物' }, steel: { name: '钢锭', col: 0x90a4ae },
            hot_cu: { name: '铜锭（烫）', col: 0xff3d00, hot: 'ingot_cu', needTool: 'tongs' }, hot_zn: { name: '锌锭（烫）', col: 0xff6e40, hot: 'ingot_zn', needTool: 'tongs' }, hot_fe: { name: '铁锭（烫）', col: 0xff5722, hot: 'ingot_fe', needTool: 'tongs' },
            hot_sn: { name: '锡锭（烫）', col: 0xff8a65, hot: 'ingot_sn', needTool: 'tongs' }, hot_bronze: { name: '青铜锭（烫）', col: 0xff7043, hot: 'bronze', needTool: 'tongs' },
            hot_brass: { name: '黄铜锭（烫）', col: 0xffab00, hot: 'brass', needTool: 'tongs' }, hot_steel: { name: '钢锭（烫）', col: 0xff6d00, hot: 'steel', needTool: 'tongs' },
            tongs: { name: '钳子', col: 0x795548, use: '拿烫锭' },
            pick_bronze: { name: '青铜稿', col: 0xb87333, tool: 2 }, pick_iron: { name: '铁稿', col: 0x616161, tool: 2, bonus: 1 }, pick_steel: { name: '钢稿', col: 0x90a4ae, tool: 3 },
            battery: { name: '电池', col: 0x43a047, use: '装进电池组' }, wire: { name: '铜线', col: 0xff7043, use: '接线' },
            dev_bank: { name: '电池组', col: 0x2e7d32, dev: 'bank' }, dev_gen: { name: '发电机', col: 0x546e7a, dev: 'gen' },
            dev_el: { name: '电解槽', col: 0x00838f, dev: 'el' },
            ash: { name: '草木灰', col: 0x9e9e9e, use: '当肥料' }, bottle: { name: '玻璃瓶', col: 0xb3e5fc },
            b_h2: { name: '氢气瓶', col: 0xf8bbd0, gas: 'h2', use: '压进钢瓶' }, b_o2: { name: '氧气瓶', col: 0x90caf9, gas: 'o2' }, b_cl2: { name: '氯气瓶', col: 0xc6ff00, gas: 'cl2', use: '压进钢瓶' },
            naoh: { name: '氢氧化钠', col: 0xeceff1, useLater: '后面的阶段' }, sodium: { name: '钠', col: 0xcfd8dc, useLater: '后面的阶段' },
            dev_lamp: { name: '电灯', col: 0xfff176, dev: 'lamp' }, dev_pump: { name: '水泵', col: 0x0288d1, dev: 'pump' }, dev_furnace: { name: '电炉', col: 0xbf360c, dev: 'furnace' }
        };
        IND_ITEMS_RAW.chest = { name: '仓库箱', col: 0x6d4c41, furn: 'chest' };
        IND_ITEMS_RAW.furn_bed = { name: '床', col: 0x5c6bc0, furn: 'bed' };
        IND_ITEMS_RAW.furn_bench = { name: '工作台', col: 0xa1887f, furn: 'bench' };
                IND_ITEMS_RAW.raft = { name: '木筏', col: 0x8d6e63, raft: true, use: '水边放下，上去划着走' };
        IND_ITEMS_RAW.house_hut = { name: '木屋', col: 0x8d6e63, house: 'hut', use: '放下就是一间房' };
        IND_ITEMS_RAW.house_brick = { name: '砖房', col: 0xb55a4a, house: 'brick', use: '放下就是一间房' };
        IND_ITEMS_RAW.house_big = { name: '大砖房', col: 0xa0453a, house: 'big', use: '放下就是一间房' };
        IND_ITEMS_RAW.cyl = { name: '钢瓶（空）', col: 0x78909c, cyl: {}, use: '装气' };
        IND_ITEMS_RAW.b_co2 = { name: '二氧化碳瓶', col: 0xcfd8dc, gas: 'co2', use: '压进钢瓶' };
        IND_ITEMS_RAW.dry_ice = { name: '干冰', col: 0xe1f5fe, use: '放进水桶冒白雾' };
        IND_ITEMS_RAW.dev_comp = { name: '压缩机', col: 0x6d4c41, dev: 'comp' };
        IND_ITEMS_RAW.dev_press = { name: '压力机', col: 0x37474f, dev: 'press' };
        IND_ITEMS_RAW.diamond = { name: '钻石', col: 0xb9f6ca };
        IND_ITEMS_RAW.pick_diamond = { name: '钻石稿', col: 0x80deea, tool: 4, bonus: 2 };   // 钻石稿：采一次多拿 2 个
        // 搬起来带着东西的家具（装着东西的箱子、灶台、小熔炉、大窑）是一个个独一无二的物品：inst:编号，内容记在存档的 carried 里
        let IND_CTX_BASE = null;   // 读档整理时临时用来认 inst 物品
        function indCarried(k) {
            if (typeof k !== 'string' || k.indexOf('inst:') !== 0) return null;
            let B = IND_CTX_BASE || (typeof ind !== 'undefined' && ind && ind.base);
            return (B && B.carried && B.carried[k.slice(5)]) || null;
        }
        // 动态物品（名字里带参数的）：第 6 阶段的六氟化铀罐、芯块、燃料棒等在 19-industry-nuke.js 里登记 {prefix, get(k)}
        const IND_DYN = [];
        function indDynItem(k) { if (typeof k !== 'string') return undefined; for (let i = 0; i < IND_DYN.length; i++) if (k.indexOf(IND_DYN[i].prefix) === 0) return IND_DYN[i].get(k); return undefined; }
        const IND_ITEMS = new Proxy(IND_ITEMS_RAW, {
            get: function (t, k) {
                if (typeof k === 'string' && IND_DYN.length && t[k] === undefined) { let dy = indDynItem(k); if (dy) return dy; }
                if (typeof k === 'string' && k.indexOf('inst:') === 0) {
                    let c = indCarried(k); if (!c) return undefined;
                    let nm = c.ty === 'chest' ? (c.lead ? '铅箱（' : '仓库箱（') + (Object.keys(c.items).length ? '装着 ' + Object.keys(c.items).length + ' 样' : '空') + '）' : IND_COOK[c.ty].name;
                    return { name: nm, col: c.ty === 'chest' ? 0x6d4c41 : IND_COOK[c.ty].col || 0xb71c1c, furn: c.ty, inst: true };
                }
                if (typeof k === 'string' && k.indexOf('cyl:') === 0) { let g = indCylParse(k); return g ? { name: indCylName(g), col: indCylLiquid(g) ? 0x4fc3f7 : 0x78909c, cyl: g } : undefined; }
                if (typeof k === 'string' && k.indexOf('@') > 0) {   // 陶罐／铁桶／黄铜桶装的东西
                    let c = indContOf(k); if (!c) return undefined;
                    let b = t[c.base], e = b.eat ? Object.assign({}, b.eat, { back: indEmptyKey(c.mat) }) : undefined;
                    return Object.assign({}, b, { eat: e, mat: c.mat });
                }
                return t[k];
            },
            has: function (t, k) { return k in t || !!indDynItem(k) || !!indCarried(k) || !!(typeof k === 'string' && k.indexOf('@') > 0 && indContOf(k)) || (typeof k === 'string' && k.indexOf('cyl:') === 0 && !!indCylParse(k)); }
        });
        // 电：rated 额定电压（超过就炸），minV 低于它不工作，draw 每秒耗电；电源：bank 电池组（节数 × 1.5 V），gen 发电机（灶台中火以上 3 米内 12 V）
        const IND_DEVS = {
            bank: { name: '电池组', col: 0x2e7d32, src: true, size: [1, 0.8, 0.8] },
            gen: { name: '发电机', col: 0x546e7a, src: true, volt: 12, size: [1.2, 1, 1] },
            el: { name: '电解槽', col: 0x00838f, rated: 12, minV: 2, draw: 2, size: [1.2, 0.8, 0.9] },
            lamp: { name: '电灯', col: 0xfff176, rated: 6, minV: 1.5, draw: 0.2, size: [0.5, 1.6, 0.5] },
            pump: { name: '水泵', col: 0x0288d1, rated: 12, minV: 6, draw: 1, size: [0.9, 0.9, 0.9] },
            furnace: { name: '电炉', col: 0xbf360c, rated: 24, minV: 18, draw: 4, size: [1.4, 1.2, 1.2] },
            comp: { name: '压缩机', col: 0x6d4c41, rated: 12, minV: 6, draw: 3, size: [1.2, 1, 1] },
            press: { name: '压力机', col: 0x37474f, rated: 24, minV: 18, draw: 6, size: [1.4, 1.4, 1.4] }
        };
        // 新设备（第 6 阶段）在 19-industry-nuke.js 里登记：busy（有活干才耗电）、tick、html（面板）、fix（读档整理）、volt（电源的电压）
        const IND_DEV_BUSY = {}, IND_DEV_TICK = {}, IND_DEV_HTML = {}, IND_DEV_FIX = {}, IND_DEV_VOLT = {}, IND_DEV_INFO = {};
        const IND_BAT_V = 1.5, IND_BAT_U = 180, IND_BOOM_R = 3, IND_DEV_CAP = 40, IND_GEN_R = 3, IND_FURNACE_T = 1800;
        // 名字；装了东西的桶写上材质："生水（木桶）"。plain = true 不写材质（配方里用）
        function indName(k, plain) {
            let d = IND_ITEMS[k]; if (!d) return k;
            let c = indContOf(k);
            return d.name + (c && c.base && !plain ? '（' + IND_MATS[c.mat].name + '）' : '');
        }
        // 资源点：每种给几个、要什么稿子；seeds 是野生种子堆（随机一种作物）
        const IND_NODES = {
            wood: { give: [2, 4], tool: 0 }, dirt: { give: [2, 3], tool: 0 }, stone: { give: [2, 3], tool: 0 }, sand: { give: [2, 4], tool: 0 }, clay: { give: [1, 3], tool: 0 },
            salt: { give: [1, 3], tool: 0 }, coal: { give: [1, 3], tool: 1 }, ore_sn: { give: [1, 2], tool: 1 }, oil: { give: [1, 1], tool: 0 },
            sand_sn: { give: [1, 1], tool: 0, out: 'ore_sn', name: '锡砂' },   // 海边的锡砂：空手捡，每次 1 个锡矿
            ore_cu: { give: [1, 2], tool: 1 }, ore_zn: { give: [1, 2], tool: 1 }, ore_fe: { give: [1, 2], tool: 2 },
            sulfur: { give: [1, 3], tool: 1 }, ore_u: { give: [1, 1], tool: 3 }, seeds: { give: [2, 3], tool: 0 }
        };
        const IND_NODE_COL = { seeds: 0x7cb342, sand_sn: 0xb0bec5 };
        const IND_ORE_NODES = { ore_cu: 1, ore_zn: 1, ore_sn: 1, ore_fe: 1, coal: 1, sulfur: 1, ore_u: 1 };   // 这几种矿成片刷：一处 3～6 个点挤在 6 米内
        // 悠闲世界的远征只刷这些（没有矿，没有科技原料）
        const IND_CASUAL_RES = { dirt: 1, wood: 1, stone: 1, sand: 1, clay: 1, salt: 1, seeds: 1 };
        const IND_TOOL_NAME = ['空手', '石稿', '青铜稿', '钢稿', '钻石稿'];
        // 地貌：名字、地面颜色、会刷什么资源（权重）
        const IND_BIOMES = {
            plain: { name: '平原', col: 0x9ccc65, res: { sand: 2, clay: 2, stone: 2, wood: 1, seeds: 2, dirt: 3 } },
            forest: { name: '森林', col: 0x558b2f, res: { wood: 6, clay: 1, seeds: 2, dirt: 3 } },
            beach: { name: '海边', col: 0xfff59d, res: { sand: 4, salt: 3, sand_sn: 1 } },
            mountain: { name: '山地', col: 0x8d8d8d, res: { stone: 3, ore_cu: 2, ore_zn: 2, ore_sn: 3, ore_fe: 2, coal: 2 } },
            desert: { name: '盐湖沙漠', col: 0xe6c27a, res: { sand: 3, salt: 3, oil: 1 } },
            volcano: { name: '火山', col: 0x5d4037, res: { sulfur: 5, stone: 1 } },
            ancient: { name: '古老岩层', col: 0x546e7a, res: { ore_u: 2, stone: 2, ore_fe: 1 } }
        };
        // 作物：生长秒数（游戏时间，浇了水按全速，没浇水半速）、收获几个、留几个种子；番茄熟了以后还能再结
        const IND_CROPS = {
            wheat: { name: '小麦', grow: 120, yield: [2, 3], seeds: [1, 2], col: 0xffca28, s: [0, 1, 2] },
            potato: { name: '土豆', grow: 240, yield: [2, 4], seeds: [1, 1], col: 0x8d6e63, s: [0, 2] },
            tomato: { name: '番茄', grow: 360, yield: [2, 3], seeds: [0, 1], col: 0xe53935, regrow: 180, times: 3, s: [1] },
            corn: { name: '玉米', grow: 480, yield: [2, 2], seeds: [1, 1], col: 0xfdd835, s: [1, 2] },
            cane: { name: '甘蔗', grow: 600, yield: [2, 4], seeds: [1, 1], col: 0x9ccc65, s: [1] },
            pumpkin: { name: '南瓜', grow: 900, yield: [1, 1], seeds: [1, 2], col: 0xfb8c00, s: [1, 2] },
            cotton: { name: '棉花', grow: 600, yield: [2, 3], seeds: [1, 1], col: 0xfafafa, s: [1, 2] },
            cabbage: { name: '白菜', grow: 300, yield: [1, 2], seeds: [1, 1], col: 0xc5e1a5, s: [0, 2, 3] },
            radish: { name: '萝卜', grow: 240, yield: [1, 2], seeds: [1, 1], col: 0xffffff, s: [0, 2, 3] }
        };
        // 暖棚：盖在农田最左边一条（x -28～-20），棚里的作物不管季节都长
        const IND_GH = { x0: -28, x1: -20, z0: -18, z1: 18 };
        // 玻璃暖棚：木暖棚升级，扩大到农田左半边（x -28～-17）
        const IND_GH_GLASS = { x0: -28, x1: -17, z0: -18, z1: 18 };
        function indGhBox() { return ind.base.glass ? IND_GH_GLASS : IND_GH; }
        // 工作台配方（身上的原料够就能做）；gh 是盖暖棚（不出物品）
        const IND_CRAFT = [
            { out: 'coat', in: { cotton: 4 } }, { out: 'hat', in: { cotton: 2 } }, { out: 'scarf', in: { cotton: 2 } },
            { out: 'campfire', in: { wood: 5, stone: 3 } }, { gh: true, name: '暖棚', in: { wood: 10 } }, { glass: true, name: '玻璃暖棚（先要有木暖棚）', in: { glass_plate: 6, wood: 6 } },
            { out: 'pickle', in: { radish: 2, salt: 1, bottle: 1 } },
            { out: 'yarn', in: { wool: 2 } }, { out: 'sweater', in: { yarn: 3 } }, { out: 'wool_hat', in: { yarn: 1 } }, { out: 'wool_scarf', in: { yarn: 1 } },
            { out: 'bellows', in: { wood: 6, clay: 4 }, hard: true },
            { pot: true, name: '黄铜大锅（装在灶台上）', in: { brass: 3 }, hard: true },
            { out: 'tongs', in: { ingot_cu: 2 }, hard: true },
            { out: 'battery', in: { ingot_cu: 1, ingot_zn: 1, salt: 1 }, hard: true }, { out: 'wire', n: 4, in: { ingot_cu: 1 }, hard: true },
            { out: 'dev_bank', in: { ingot_fe: 2, ingot_cu: 1 }, hard: true }, { out: 'dev_gen', in: { ingot_cu: 3, ingot_fe: 2, steel: 1 }, hard: true },
            { out: 'dev_el', in: { ingot_fe: 2, ingot_cu: 2, bottle: 1 }, hard: true },
            { out: 'dev_lamp', in: { ingot_cu: 1, sand: 2 }, hard: true }, { out: 'dev_pump', in: { ingot_fe: 2, ingot_cu: 1 }, hard: true }, { out: 'dev_furnace', in: { steel: 2, clay: 4, ingot_cu: 2 }, hard: true }, { out: 'pick_iron', in: { ingot_fe: 3, wood: 2 }, hard: true }, { out: 'pick_steel', in: { steel: 3, wood: 2 }, hard: true },
            { out: 'bucket', in: { wood: 3 } }, { out: 'shears', in: { stone: 2, wood: 1 } },
            { out: 'pick_bronze', in: { bronze: 3, wood: 2 }, hard: true },
            { out: 'bell', in: { brass: 1 }, hard: true },
            { out: 'cook_furnace', in: { brick: 8, stone: 2 }, hard: true }, { out: 'cook_kiln', in: { brick: 30, stone: 6 } },
            { out: 'chest', in: { wood: 8 } },
            { out: 'bucket_fe', in: { ingot_fe: 2 }, hard: true }, { out: 'bucket_cu', in: { brass: 2 }, hard: true },
            { out: 'cyl', in: { steel: 2, brass: 1 }, hard: true }, { out: 'dev_comp', in: { steel: 3, ingot_cu: 2, wire: 2, brass: 1 }, hard: true },
            { out: 'dev_press', in: { steel: 4, wire: 2 }, hard: true }, { out: 'pick_diamond', in: { diamond: 2, steel: 2, wood: 1 }, hard: true },
            { out: 'house_hut', in: { wood: 60 } }, { out: 'house_brick', in: { brick: 40, wood: 10 } }, { out: 'house_big', in: { brick: 90, wood: 20 } },
            { out: 'bottle', n: 2, in: { glass_plate: 1 } },
            { out: 'raft', in: { wood: 20 } },
            { out: 'blast_suit', in: { steel: 6, yarn: 4 }, hard: true }, { out: 'blast_helmet', in: { steel: 2, glass_plate: 1 }, hard: true }
        ];
        // 房子：放在基地里，四面墙 + 屋顶 + 一扇门；w×d 是门朝南（+z）时的宽和深，warm 是屋里比外面高几度
        const IND_HOUSE = {
            hut: { name: '木屋', w: 6, d: 6, warm: 6, wall: 0x8d6e63, roof: 0x5d4037 },
            brick: { name: '砖房', w: 6, d: 6, warm: 12, wall: 0xb55a4a, roof: 0x6d4c41 },
            big: { name: '大砖房', w: 10, d: 8, warm: 12, wall: 0xa0453a, roof: 0x4e342e }
        };
        const IND_HOUSE_H = 3, IND_HOUSE_T = 0.3, IND_HOUSE_DOOR = 1.8, IND_HOUSE_CAP = 6, IND_HOUSE_MIN = 18, IND_HOUSE_FIRE = 4, IND_HOUSE_R = 0.45;
        const IND_HOT_SOUP = 1.5, IND_DRY_COLD = 0.05;
        const IND_HOT_COOL = 30, IND_HOT_DPS = 15;   // 烫的锭放 30 秒凉；不拿钳子每秒扣 15 血
        // 动物：饱食每秒掉 1/30（满 100），饿了（< 30）不产东西；羊每 600 秒能剪一次毛，牛每 300 秒能挤一次奶（要空桶）；
        // 驯服：远征里拿着它爱吃的东西对着它左键，喂够就跟着你走，撤离时 10 米内跟着的一起回家
        const IND_ANIMALS = {
            sheep: { name: '羊', col: 0xfafafa, size: [1.2, 0.9, 0.8], food: ['wheat', 'cabbage', 'radish'], tame: 3, biome: ['plain'] },
            cow: { name: '牛', col: 0x6d4c41, size: [1.8, 1.3, 0.9], food: ['wheat', 'cabbage', 'radish'], tame: 4, biome: ['plain'] },
            dog: { name: '狗', col: 0xffb74d, size: [0.9, 0.7, 0.45], food: ['bread', 'bake_potato', 'cheese'], tame: 1, biome: ['forest', 'plain'] },
            cat: { name: '猫', col: 0xff8a65, size: [0.6, 0.45, 0.32], food: ['bread', 'bake_potato', 'cheese', 'milk'], tame: 1, biome: ['forest'] }
        };
        const IND_ANIMAL_CAP = 20, IND_WOOL_EVERY = 600, IND_MILK_EVERY = 300, IND_ANIMAL_HUNGER = 1 / 30;
        // 灶台：火候三档；燃料每秒烧掉的量；配方按顺序找第一个原料够的
        const IND_FIRE = [{ name: '关', t: 20, burn: 0 }, { name: '小火', t: 200, burn: 0.5 }, { name: '中火', t: 600, burn: 1 }, { name: '大火', t: 1200, burn: 2 }, { name: '鼓风', t: 1600, burn: 3, bellows: true }];
        const IND_FERT = 1.5;   // 草木灰肥料：长得快 50%
        const IND_BATCH = 4, IND_BATCH_POT = 8;   // 灶台做吃的：一炉最多几份（装了黄铜大锅 8 份）
        const IND_STOVE_CAP = 8;
        // 灶台、小熔炉、大窑都是"炉子"：rate 温度每秒变几度，burn 燃料烧得多快（1 = 灶台），batch 一炉每类配方最多几份，only 只做哪类配方，top 大火的温度
        // 小熔炉：只做冶炼，大火最高 1300°C，燃料烧 2 倍久，一次炼 2 份；大窑（占 3×3 米）：灶台所有配方，吃的 16 份、砖玻璃木炭 10 份、冶炼 6 份（只给硬核），温度每秒只变 10°C，燃料烧 3 倍久
        const IND_COOK = {
            stove: { name: '灶台', rate: 50, burn: 1, r: 1.5, col: 0xb71c1c },
            furnace: { name: '小熔炉', rate: 50, burn: 0.5, only: 'smelt', top: 1300, batch: { smelt: 2 }, r: 1.2, size: [1.6, 1.4, 1.6], col: 0x6d4c41 },
            kiln: { name: '大窑', rate: 10, burn: 1 / 3, batch: { food: 16, bulk: 10, smelt: 6, chem: 1 }, r: 2.1, size: [3, 2, 3], col: 0x8d4b3a }
        };
        const IND_COOK_CAP = 6, IND_TILE_CAP = 100, IND_SPOUT_CAP = 10;   // 出料槽最多 10 块   // 灶台上最多放几种
        const IND_RECIPES = [
            // 面包排在烧水前面：有小麦和盐的时候，生水也是和面用的
            { in: { wheat: 4, salt: 1, water_boiled: 1 }, out: { bread: 3, bucket: 1 }, minT: 180, time: 40, burnT: 300 },
            { in: { wheat: 4, salt: 1, water_raw: 1 }, out: { bread: 3, bucket: 1 }, minT: 180, time: 40, burnT: 300 },   // 生水和面不拉肚子
            { in: { water_raw: 1 }, out: { water_boiled: 1 }, minT: 100, time: 10 },
            { in: { water_sea: 1 }, out: { salt: 1, bucket: 1 }, minT: 100, time: 20 },
            { in: { pumpkin: 1, wheat: 2, sugar: 1 }, out: { pumpkin_pie: 1 }, minT: 180, time: 40, burnT: 300 },
            { in: { tomato: 1, water_boiled: 1, salt: 1 }, out: { tomato_soup: 1 }, minT: 100, time: 20, burnT: 400 },
            { in: { radish: 1, water_boiled: 1, salt: 1 }, out: { radish_soup: 1 }, minT: 100, time: 20, burnT: 400 },
            { in: { cabbage: 1, radish: 1, water_boiled: 1 }, out: { cabbage_stew: 1 }, minT: 100, time: 25, burnT: 400 },
            { in: { cane: 3 }, out: { sugar: 1 }, minT: 100, time: 20, burnT: 250 },
            { in: { potato: 1 }, out: { bake_potato: 1 }, minT: 180, time: 15, burnT: 400 },
            { in: { corn: 1 }, out: { bake_corn: 1 }, minT: 180, time: 15, burnT: 400 },
            { in: { wood: 2 }, out: { charcoal: 1 }, minT: 400, time: 30, cls: 'bulk' },
            { in: { clay: 2 }, out: { brick: 1 }, minT: 900, time: 20, cls: 'bulk' },
            { in: { clay: 2 }, out: { jar: 1 }, minT: 600, time: 20, cls: 'bulk' },
            { in: { milk: 1 }, out: { cheese: 1, bucket: 1 }, minT: 100, time: 30, burnT: 300 },
            // 冶炼（只给硬核）：温度用真实熔点；出来的锭是烫的
            { in: { ingot_fe: 1, charcoal: 1 }, out: { hot_steel: 1 }, cls: 'smelt', minT: 1550, time: 40, hard: true },
            { in: { ingot_cu: 1, ingot_zn: 1 }, out: { hot_brass: 2 }, cls: 'smelt', minT: 950, time: 20, hard: true },
            { in: { ore_fe: 1 }, out: { hot_fe: 1 }, cls: 'smelt', minT: 1538, time: 30, hard: true },
            { in: { ore_cu: 1 }, out: { hot_cu: 1 }, cls: 'smelt', minT: 1085, time: 20, hard: true },
            { in: { ore_zn: 1 }, out: { hot_zn: 1 }, cls: 'smelt', minT: 420, time: 15, hard: true },
            { in: { ore_sn: 1 }, out: { hot_sn: 1 }, cls: 'smelt', minT: 232, time: 15, hard: true },
            { in: { ingot_cu: 3, ingot_sn: 1 }, out: { hot_bronze: 4 }, cls: 'smelt', minT: 950, time: 30, hard: true },
            // 玻璃：草木灰当助熔剂（钾碱），1000°C（悠闲也能做，腌萝卜要用瓶子）；只有沙子要 1700°C（电炉）
            { in: { sand: 2, ash: 1 }, out: { glass_plate: 1 }, minT: 1000, time: 20, cls: 'bulk' },
            { in: { sand: 3 }, out: { glass_plate: 1 }, minT: 1700, time: 30, hard: true, cls: 'bulk' },
            // 压力：木炭在氧气里烧成二氧化碳
            { in: { charcoal: 1, b_o2: 1 }, out: { b_co2: 1 }, minT: 400, time: 10, hard: true, cls: 'bulk' }
        ];
        // 电解槽的三种用法（按顺序找第一种原料够、电压够的）
        const IND_EL_RECIPES = [
            { name: '电解盐水', in: { salt: 1, water_raw: 1, bottle: 2 }, out: { naoh: 1, b_h2: 1, b_cl2: 1, bucket: 1 }, minV: 3 },
            { name: '电解水', in: { water_raw: 1, bottle: 3 }, out: { b_h2: 2, b_o2: 1, bucket: 1 }, minV: 2 },
            { name: '电解熔融盐', in: { salt: 2, bottle: 1 }, out: { sodium: 1, b_cl2: 1 }, minV: 4, molten: 801 }
        ];
        const IND_COMP_TIME = 2, IND_PRESS_TIME = 20, IND_PRESS_T = 1200, IND_PRESS_MAXP = 50000, IND_CARBON = ['charcoal', 'coal', 'char'];
        const IND_EL_TIME = 20, IND_ASH_PER = 2, IND_GAS = { cloud: 45, dps: 8, r: 3, fireR: 3 };
        // 元素表：拿到这些东西就点亮对应的元素（原子序数）
        const IND_ELEM_OF = { b_h2: 1, charcoal: 6, coal: 6, char: 6, b_o2: 8, sodium: 11, sulfur: 16, b_cl2: 17, diamond: 6, ingot_fe: 26, ingot_cu: 29, ingot_zn: 30, ingot_sn: 50 };
        const IND_ELEM_NAME = ['', '氢', '氦', '锂', '铍', '硼', '碳', '氮', '氧', '氟', '氖', '钠', '镁', '铝', '硅', '磷', '硫', '氯', '氩', '钾', '钙', '钪', '钛', '钒', '铬', '锰', '铁', '钴', '镍', '铜', '锌', '镓', '锗', '砷', '硒', '溴', '氪'];
        const IND_BURN_S = 8;   // 超过烧焦温度累计 8 秒就烧成焦炭

        // ── 随机数和噪声（同一个种子生成同一张图）──
        function indRng(seed) {
            let s = (seed >>> 0) || 1;
            return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        }
        function indHash(ix, iz, seed) {
            let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        }
        function indNoise(x, z, seed) {
            let ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
            let u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
            let a = indHash(ix, iz, seed), b = indHash(ix + 1, iz, seed), c = indHash(ix, iz + 1, seed), d = indHash(ix + 1, iz + 1, seed);
            return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
        }
        function indFbm(x, z, seed) { return indNoise(x, z, seed) * 0.6 + indNoise(x * 2.1, z * 2.1, seed + 7) * 0.28 + indNoise(x * 4.3, z * 4.3, seed + 13) * 0.12; }

        // 一张远征地图：种子 → 地形高度、地貌、火山位置
        function indMakeMap(seed) {
            let r = indRng(seed), M = { seed: seed, volc: [] };
            let nv = 1 + (r() < 0.5 ? 1 : 0);
            for (let i = 0; i < nv; i++) { let a = r() * Math.PI * 2, d = IND_MAP * (0.62 + r() * 0.25); M.volc.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 16 + r() * 6 }); }
            return M;
        }
        function indElev(M, x, z) { return indFbm(x / 70, z / 70, M.seed); }
        function indMoist(M, x, z) { return indFbm(x / 90, z / 90, M.seed + 101); }
        function indBiome(M, x, z) {
            for (let i = 0; i < M.volc.length; i++) { let v = M.volc[i]; if (Math.hypot(x - v.x, z - v.z) < v.r) return 'volcano'; }
            let e = indElev(M, x, z), m = indMoist(M, x, z), rr = Math.hypot(x, z) / IND_MAP;
            if (Math.hypot(x, z) < 14) return 'plain';
            if (e < -0.28) return 'beach';
            if (e > 0.32) return rr > 0.78 ? 'ancient' : 'mountain';
            if (m < -0.25) return 'desert';
            if (m > 0.2) return 'forest';
            return 'plain';
        }
        function indHeight(M, x, z) {
            let h = indElev(M, x, z) * 9;
            let spawn = Math.max(0, 1 - Math.hypot(x, z) / 14); h *= (1 - spawn);
            for (let i = 0; i < M.volc.length; i++) {
                let v = M.volc[i], d = Math.hypot(x - v.x, z - v.z);
                if (d < v.r * 1.6) { let t = 1 - d / (v.r * 1.6); h += t * t * 22 - (d < v.r * 0.3 ? (1 - d / (v.r * 0.3)) * 8 : 0); }
            }
            return Math.max(-3, h);
        }
        const IND_WATER_Y = -1.2;

        // ── 存档（IndexedDB，单独存）──
        const IND_DB = 'maodun_industry', IND_STORE = 'base', IND_SAVE_VER = 11;
        function indDb(cb) {
            try {
                let rq = indexedDB.open(IND_DB, 1);
                rq.onupgradeneeded = function () { try { rq.result.createObjectStore(IND_STORE); } catch (e) { } };
                rq.onsuccess = function () { cb(rq.result); };
                rq.onerror = function () { cb(null); };
            } catch (e) { cb(null); }
        }
        function indKey() { return 'p_' + (gState.id || 'guest'); }
        const IND_START_BOX = { pick_stone: 1, shears: 1, bucket: 2, seed_wheat: 6, seed_potato: 4, seed_cotton: 4, seed_cabbage: 3, wood: 8, salt: 2, bake_potato: 3 };
        const IND_V3_GIFT = { seed_cotton: 4, seed_cabbage: 3 };
        const IND_V9_GIFT = { shears: 1 };   // 存档版本 9：新号送一把剪刀，老档读档时补一把
        function indNewBase() {
            return { ver: IND_SAVE_VER, rule: null, box: JSON.parse(JSON.stringify(IND_START_BOX)), ground: [], crops: [], trips: 0, clock: 60,
                surv: { hp: 100, food: 80, water: 80, energy: 100, temp: 37 }, wear: {}, gh: false, glass: false, pot: false, cookers: [], cseq: 0, cid: 1, pos: {}, off: {}, carried: {}, chests: null, tiles: [], houses: [], rad: [], bombs: [], fires: [], animals: [], devs: [], wires: [], dseq: 0, elems: {}, stove: { items: {}, out: {}, fuel: 0, fire: 0, temp: 20, cook: null } };
        }
        function indNum(v, d, lo, hi) { v = +v; if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
        // 炉子的状态（灶台和小熔炉、大窑通用）整理一遍
        // 出料槽：冶炼出来的烫锭进这里，每块自己 30 秒凉。[{ k: 烫锭, t: 还要几秒 }]，最多 10 块
        function indFixSpout(S) {
            S.spout = Array.isArray(S.spout) ? S.spout.filter(function (e) { return e && IND_ITEMS_RAW[e.k] && IND_ITEMS_RAW[e.k].hot; }).slice(0, IND_SPOUT_CAP).map(function (e) { return { k: e.k, t: indNum(e.t, 0, 0, IND_HOT_COOL) }; }) : [];
            Object.keys(S.out || {}).forEach(function (k) {   // 老档：炉子里留着的烫锭挪进出料槽（放不下的当它凉了）
                if (!IND_ITEMS_RAW[k] || !IND_ITEMS_RAW[k].hot) return;
                for (let i = 0; i < S.out[k]; i++) { if (S.spout.length < IND_SPOUT_CAP) S.spout.push({ k: k, t: IND_HOT_COOL }); else S.out[IND_ITEMS_RAW[k].hot] = (S.out[IND_ITEMS_RAW[k].hot] || 0) + 1; }
                delete S.out[k];
            });
        }
        function indFixCook(S, b) {
            b = b || ind.base;
            ['items', 'out'].forEach(function (f) { if (!S[f] || typeof S[f] !== 'object') S[f] = {}; Object.keys(S[f]).forEach(function (k) { if (!IND_ITEMS[k] || !(S[f][k] > 0)) delete S[f][k]; }); });
            S.fuel = indNum(S.fuel, 0, 0, 1e6); S.ashT = indNum(S.ashT, 0, 0, 1e6); S.fire = indNum(S.fire, 0, 0, 4) | 0; S.bellows = !!S.bellows; if (S.fire === 4 && !S.bellows) S.fire = 3; indFixSpout(S); S.temp = indNum(S.temp, 20, 20, 2000);
            if (!S.cook || typeof S.cook !== 'object' || !IND_RECIPES[S.cook.i]) S.cook = null; else S.cook.n = indNum(S.cook.n, 1, 1, 16) | 0;
        }
        // 读档整理：先认搬着的家具（carried），再按它整理别的
        function indFixBase(b) {
            if (!b || typeof b !== 'object') b = indNewBase();
            if (!b.carried || typeof b.carried !== 'object' || Array.isArray(b.carried)) b.carried = {};
            Object.keys(b.carried).forEach(function (id) {
                let c = b.carried[id];
                if (!c || !(c.ty === 'chest' || (IND_COOK[c.ty] && c.ty !== undefined)) || (c.ty === 'chest' ? (!c.items || typeof c.items !== 'object') : (!c.st || typeof c.st !== 'object'))) delete b.carried[id];
            });
            IND_CTX_BASE = b;
            try { b = indFixBase0(b); } finally { IND_CTX_BASE = null; }
            return b;
        }
        function indFixBase0(b) {
            if (!b || typeof b !== 'object') b = indNewBase();
            let n = indNewBase();
            if (b.rule !== 'casual' && b.rule !== 'hard') b.rule = null;
            if (!b.box || typeof b.box !== 'object') b.box = {};
            Object.keys(b.box).forEach(function (k) { if (!IND_ITEMS[k] || !(b.box[k] > 0)) delete b.box[k]; });
            if ((b.ver || 1) < 2) Object.keys(IND_START_BOX).forEach(function (k) { if (k !== 'pick_stone' && !IND_V3_GIFT[k] && !IND_V9_GIFT[k]) b.box[k] = (b.box[k] || 0) + IND_START_BOX[k]; });   // 第 1 阶段的老档补上第 2 阶段的起步物资
            if ((b.ver || 1) < 3) Object.keys(IND_V3_GIFT).forEach(function (k) { b.box[k] = (b.box[k] || 0) + IND_V3_GIFT[k]; });   // 第 2 阶段的老档补上棉花、白菜种子
            if ((b.ver || 1) < 9) Object.keys(IND_V9_GIFT).forEach(function (k) { b.box[k] = (b.box[k] || 0) + IND_V9_GIFT[k]; });   // 第 5 阶段之前的老档补上剪刀
            // 家具：位置（可搬）、被收起来的、箱子（原来的仓库箱不限，新做的 30 格）、搬着的
            b.cid = indNum(b.cid, 1, 1, 1e9) | 0;
            if (!b.pos || typeof b.pos !== 'object') b.pos = {};
            ['stove', 'bed', 'bench'].forEach(function (k) { let p = b.pos[k]; if (!p || !isFinite(p.x) || !isFinite(p.z)) delete b.pos[k]; else b.pos[k] = { x: indNum(p.x, 0, -IND_BASE.x + 1, IND_BASE.x - 1), z: indNum(p.z, 0, -IND_BASE.z + 1, IND_BASE.z - 1) }; });
            delete b.pos.pool;   // 水池是挖在地上的，不能搬：以前收起来的读档时放回原位（背包里的 furn_pool 下面按未知物品清掉）
            let off = {}; ['stove', 'bed', 'bench'].forEach(function (k) { if (b.off && b.off[k]) off[k] = true; }); b.off = off;
            if (!Array.isArray(b.chests)) { let bp = b.pos.box; b.chests = [{ id: 1, x: bp ? bp.x : IND_ST_DEF.box.x, z: bp ? bp.z : IND_ST_DEF.box.z, big: true, items: b.box }]; }   // 老档：原来的仓库箱变成不限格数的那个箱子
            b.chests = b.chests.filter(function (c) { return c && isFinite(c.x) && isFinite(c.z) && c.items && typeof c.items === 'object'; }).slice(0, 20);
            let seen = {};
            b.chests.forEach(function (c) {
                c.big = !!c.big; c.lead = !!c.lead; c.x = indNum(c.x, 0, -IND_BASE.x + 1, IND_BASE.x - 1); c.z = indNum(c.z, 0, -IND_BASE.z + 1, IND_BASE.z - 1);
                Object.keys(c.items).forEach(function (k) { if (!IND_ITEMS[k] || !(c.items[k] > 0)) delete c.items[k]; else c.items[k] = Math.floor(c.items[k]); });
                c.id = indNum(c.id, 0, 0, 1e9) | 0; while (!c.id || seen[c.id]) c.id = ++b.cid; seen[c.id] = 1; b.cid = Math.max(b.cid, c.id);
            });
            Object.keys(b.carried).forEach(function (id) {
                let c = b.carried[id]; b.cid = Math.max(b.cid, +id || 0);
                if (c.ty === 'chest') { c.big = !!c.big; c.lead = !!c.lead; Object.keys(c.items).forEach(function (k) { if (!IND_ITEMS[k] || !(c.items[k] > 0) || k === 'inst:' + id) delete c.items[k]; }); }
                else indFixCook(c.st, b);
            });
            let bigC = b.chests.filter(function (c) { return c.big; })[0]; b.box = bigC ? bigC.items : {};
            b.tiles = Array.isArray(b.tiles) ? b.tiles.filter(function (t) { return t && isFinite(t.x) && isFinite(t.z); }).slice(0, IND_TILE_CAP) : [];
            b.houses = Array.isArray(b.houses) ? b.houses.filter(function (h) { return h && IND_HOUSE[h.ty] && isFinite(h.x) && isFinite(h.z); }).slice(0, IND_HOUSE_CAP) : [];
            b.houses.forEach(function (h) {
                h.x = indNum(h.x, 0, -IND_BASE.x + 1, IND_BASE.x - 1); h.z = indNum(h.z, 0, -IND_BASE.z + 1, IND_BASE.z - 1);
                h.side = indNum(h.side, 0, 0, 3) | 0; h.open = !!h.open;
                h.id = indNum(h.id, 0, 0, 1e9) | 0; while (!h.id || seen[h.id]) h.id = ++b.cid; seen[h.id] = 1; b.cid = Math.max(b.cid, h.id);
            });
            nkFixBase(b);   // 辐射区、原子弹（19-industry-nuke.js）
            if (!b.bag || typeof b.bag !== 'object') b.bag = {};
            Object.keys(b.bag).forEach(function (k) { if (!IND_ITEMS[k] || !(b.bag[k] > 0)) delete b.bag[k]; else b.bag[k] = Math.floor(b.bag[k]); });
            if (indSlotsOf(b.bag) > IND_BAG_SLOTS) b.bag = {};   // 超过 24 格的（乱写的）不要
            if (!Array.isArray(b.ground)) b.ground = [];
            b.ground = b.ground.filter(function (g) { return g && IND_ITEMS[g.k] && isFinite(g.x) && isFinite(g.z); });
            b.ground.forEach(function (g) { g.x = indNum(g.x, 0, -IND_BASE.x + 0.5, IND_BASE.x - 0.5); g.z = indNum(g.z, 0, -IND_BASE.z + 0.5, IND_BASE.z - 0.5); });
            if (!Array.isArray(b.crops)) b.crops = [];
            b.crops = b.crops.filter(function (c) { return c && IND_CROPS[c.k] && isFinite(c.x) && isFinite(c.z); });
            b.crops.forEach(function (c) { c.g = indNum(c.g, 0, 0, 1e7); c.wet = indNum(c.wet, 0, 0, 1e9); c.times = indNum(c.times, 0, 0, 10); c.fert = !!c.fert; });
            if (typeof b.trips !== 'number') b.trips = 0;
            b.clock = indNum(b.clock, 60, 0, 1e9);
            if (!b.surv || typeof b.surv !== 'object') b.surv = n.surv;
            ['hp', 'food', 'water', 'energy'].forEach(function (k) { b.surv[k] = indNum(b.surv[k], n.surv[k], 0, 100); });
            b.surv.temp = indNum(b.surv.temp, 37, 25, 45);
            if (!b.wear || typeof b.wear !== 'object') b.wear = {};
            Object.keys(b.wear).forEach(function (sl) { let k = b.wear[sl]; if (!IND_ITEMS[k] || IND_ITEMS[k].wear !== sl) delete b.wear[sl]; });
            b.gh = !!b.gh; b.glass = b.gh && !!b.glass; b.pot = !!b.pot;   // 旧档没有 glass，默认木暖棚
            if (!Array.isArray(b.devs)) b.devs = [];
            b.devs = b.devs.filter(function (d) { return d && IND_DEVS[d.ty] && isFinite(d.x) && isFinite(d.z) && d.id; }).slice(0, IND_DEV_CAP);
            b.devs.forEach(function (d) { if (!d.st || typeof d.st !== 'object') d.st = {}; Object.keys(d.st).forEach(function (k) { if (!IND_ITEMS[k] || !(d.st[k] > 0)) delete d.st[k]; }); d.et = indNum(d.et, 0, 0, 1e3); d.bats = indNum(d.bats, 0, 0, 64) | 0; d.u = indNum(d.u, 0, 0, 64 * IND_BAT_U); d.on = d.on !== false; d.ft = indNum(d.ft, 20, 20, 2000); });
            if (!Array.isArray(b.cookers)) b.cookers = [];
            b.cookers = b.cookers.filter(function (c) { return c && IND_COOK[c.ty] && c.ty !== 'stove' && isFinite(c.x) && isFinite(c.z) && c.id; }).slice(0, IND_COOK_CAP);
            b.cookers.forEach(function (c) { indFixCook(c, b); });
            b.cseq = indNum(b.cseq, 0, 0, 1e9) | 0; b.cookers.forEach(function (c) { b.cseq = Math.max(b.cseq, c.id); });
            b.devs.forEach(function (d) { d.cy = typeof d.cy === 'string' && indCylParse(d.cy) ? d.cy : null; d.ct = indNum(d.ct, 0, 0, 100); d.pt = indNum(d.pt, 0, 0, 100); if (IND_DEV_FIX[d.ty]) IND_DEV_FIX[d.ty](d); });
            let ids = {}; b.devs.forEach(function (d) { ids[d.id] = d; });
            if (!Array.isArray(b.wires)) b.wires = [];
            b.wires = b.wires.filter(function (w) { return Array.isArray(w) && ids[w[0]] && ids[w[1]] && IND_DEVS[ids[w[0]].ty].src && !IND_DEVS[ids[w[1]].ty].src; });
            if (!b.elems || typeof b.elems !== 'object') b.elems = {};
            Object.keys(b.elems).forEach(function (z) { if (!(+z >= 1 && +z <= 118)) delete b.elems[z]; });
            b.dseq = indNum(b.dseq, 0, 0, 1e9) | 0; b.devs.forEach(function (d) { b.dseq = Math.max(b.dseq, d.id); });
            if (!Array.isArray(b.fires)) b.fires = [];
            b.fires = b.fires.filter(function (f) { return f && isFinite(f.x) && isFinite(f.z); }).slice(0, 30);
            b.fires.forEach(function (f) { f.fuel = indNum(f.fuel, 0, 0, 1e5); f.ashT = indNum(f.ashT, 0, 0, 1e6); });
            if (!Array.isArray(b.animals)) b.animals = [];
            b.animals = b.animals.filter(function (a) { return a && IND_ANIMALS[a.k] && isFinite(a.x) && isFinite(a.z); }).slice(0, IND_ANIMAL_CAP);
            b.animals.forEach(function (a) { a.food = indNum(a.food, 60, 0, 100); a.woolAt = Math.min(indNum(a.woolAt, 0, 0, 1e9), b.clock + IND_WOOL_EVERY); a.milkAt = Math.min(indNum(a.milkAt, 0, 0, 1e9), b.clock + IND_MILK_EVERY);   // 旧档里记的下次时间比新间隔晚，改成现在 + 新间隔
             a.x = indNum(a.x, 0, -IND_BASE.x + 1, IND_BASE.x - 1); a.z = indNum(a.z, 0, -IND_BASE.z + 1, IND_BASE.z - 1); });
            if (b.surv.hp <= 0) b.surv.hp = 100;
            if (!b.stove || typeof b.stove !== 'object') b.stove = n.stove;
            if (b.bellows) b.stove.bellows = true;   // 老档：基地装过风箱，算装在原来的灶台上
            b.bellows = false;
            indFixCook(b.stove, b);
            b.ver = IND_SAVE_VER;
            return b;
        }
        function indLoad(cb) {
            indDb(function (db) {
                if (!db) { cb(indNewBase()); return; }
                try {
                    let q = db.transaction(IND_STORE, 'readonly').objectStore(IND_STORE).get(indKey());
                    q.onsuccess = function () { cb(indFixBase(q.result)); db.close(); };
                    q.onerror = function () { cb(indNewBase()); db.close(); };
                } catch (e) { cb(indNewBase()); }
            });
        }
        let IND_SAVING = 0;
        function indSave(cb) {
            if (!ind || !ind.base) { if (cb) cb(false); return; }
            let data = JSON.parse(JSON.stringify(ind.base));
            data.bag = ind.where === 'base' ? JSON.parse(JSON.stringify(ind.bag)) : {};   // 基地里背包跟着存；在远征里的不存（回不来就丢了）
            IND_SAVING++;
            indDb(function (db) {
                let done = function (ok) { IND_SAVING--; if (db) try { db.close(); } catch (e) { } if (cb) cb(ok); };
                if (!db) { done(false); return; }
                try {
                    let tx = db.transaction(IND_STORE, 'readwrite');
                    tx.objectStore(IND_STORE).put(data, indKey());
                    tx.oncomplete = function () { done(true); };
                    tx.onerror = function () { done(false); };
                } catch (e) { done(false); }
            });
        }

        // ── 背包（24 格，每格最多 99，同一种能占多格）──
        // ind.bag 是 { 物品: 总数 }，格子是算出来的：每种按 99 一格切开，按放进来的先后排
        function indSlotsOf(B) { let n = 0; Object.keys(B).forEach(function (k) { n += Math.ceil(B[k] / IND_STACK); }); return n; }
        // 往 B（cap 格，0 = 不限）里最多还能放几个 k
        function indFits(B, cap, k, n) {
            if (!cap) return n;
            let c = B[k] || 0, free = cap - indSlotsOf(B);
            return Math.max(0, Math.min(n, (Math.ceil(c / IND_STACK) + free) * IND_STACK - c));
        }
        function indSlots() { let L = []; Object.keys(ind.bag).forEach(function (k) { let c = ind.bag[k]; while (c > 0) { L.push({ k: k, n: Math.min(IND_STACK, c) }); c -= IND_STACK; } }); return L; }
        function indBagAdd(k, n) {
            if (IND_ELEM_OF[k] && ind.base && !ind.base.elems[IND_ELEM_OF[k]]) { ind.base.elems[IND_ELEM_OF[k]] = 1; indFlash('元素表点亮了：' + IND_ELEM_NAME[IND_ELEM_OF[k]]); }
            let B = ind.bag, take = indFits(B, IND_BAG_SLOTS, k, n);
            if (take > 0) B[k] = (B[k] || 0) + take;
            return take;
        }
        function indBagDel(k, n) { let B = ind.bag; if (!B[k]) return 0; let t = Math.min(n, B[k]); B[k] -= t; if (B[k] <= 0) delete B[k]; return t; }
        function indSel() { let L = indSlots(); if (!L.length) return null; ind.selIdx = Math.max(0, Math.min(ind.selIdx, L.length - 1)); return L[ind.selIdx].k; }
        function indSelect(k) { let L = indSlots(), i = L.findIndex(function (x) { return x.k === k; }); if (i >= 0) ind.selIdx = i; }
        function indToolBonus(need) { let b = 0; Object.keys(ind.bag).forEach(function (k) { let d = IND_ITEMS[k]; if (d.tool && d.tool >= need && d.bonus) b = Math.max(b, d.bonus); }); return b; }
        function indTool() { let t = 0; Object.keys(ind.bag).forEach(function (k) { if (IND_ITEMS[k].tool) t = Math.max(t, IND_ITEMS[k].tool); }); return t; }
        function indCool(k) { return (IND_ITEMS[k] && IND_ITEMS[k].hot) || k; }
        // 把东西放回仓库箱（设备里的东西这类）：优先不限格数的那个，没有就任意一个箱子，都没有放进背包
        function indBoxTarget() { let C = ind.base.chests; return C.filter(function (c) { return c.big; })[0] || C[0] || null; }
        function indBoxAdd(k, n) { k = indCool(k); let c = indBoxTarget(); if (c) c.items[k] = (c.items[k] || 0) + n; else indBagAdd(k, n); }   // 仓库箱里的烫锭当它凉了
        function indRand() { return ind && ind.rng ? ind.rng() : Math.random(); }
        function indRoll(a) { return a[0] + Math.floor(indRand() * (a[1] - a[0] + 1)); }

        // ── 时间 ──
        function indDayNo() { return Math.floor(ind.base.clock / IND_DAY) + 1; }
        function indTod() { return ind.base.clock % IND_DAY; }
        function indIsNight() { return indTod() >= IND_DUSK; }
        // 白天 0～900 秒 = 06:00～21:00，夜里 900～1200 = 21:00～06:00
        function indClockTxt() {
            let t = indTod(), h = t < IND_DUSK ? 6 + t / 60 : 21 + (t - IND_DUSK) / (300 / 9);
            h = h % 24; let hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
            return '第 ' + indDayNo() + ' 天 ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        }
        function indDark() {
            let t = indTod();
            if (t < IND_DUSK - 60) return t < 30 ? 1 - t / 30 : 0;
            if (t < IND_DUSK) return (t - (IND_DUSK - 60)) / 60;
            return 1;
        }

        // 季节：一季 3 天，春夏秋冬轮
        function indSeason() { return Math.floor((indDayNo() - 1) / IND_SEASON_DAYS) % 4; }
        function indSeasonTxt() { return IND_SEASONS[indSeason()].name + '天（第 ' + ((indDayNo() - 1) % IND_SEASON_DAYS + 1) + '/' + IND_SEASON_DAYS + ' 天）'; }
        function indInGh(x, z) { let G = indGhBox(); return ind.base.gh && x >= G.x0 && x <= G.x1 && z >= G.z0 && z <= G.z1; }
        function indCropSeasonOK(c) { return indInGh(c.x, c.z) || IND_CROPS[c.k].s.indexOf(indSeason()) >= 0; }
        // 火：基地的篝火存档，远征的篝火只在这一趟
        function indFires() { return ind.where === 'base' ? ind.base.fires : (ind.tripFires || []); }
        // 气温：季节 + 昼夜 + 地貌 + 火 + 下水
        function indAirTemp() {
            let t = IND_SEASONS[indSeason()].t, tod = indTod();
            if (indIsNight()) t -= 8; else if (tod > 300 && tod < 700) t += 3;
            if (ind.where === 'trip') {
                let bm = indBiome(ind.map, ind.p.x, ind.p.z);
                if (bm === 'desert') t += indIsNight() ? -4 : 10;
                else if (bm === 'mountain' || bm === 'ancient') t -= 5;
                ind.map.volc.forEach(function (v) { let d = Math.hypot(ind.p.x - v.x, ind.p.z - v.z); if (d < v.r * 1.6) t += 25 * (1 - d / (v.r * 1.6)); });
                if (indInWater() && !ind.onRaft) t -= IND_BODY.waterCold;
            } else {
                let hot = 0;   // 灶台、小熔炉、大窑 4 米内取暖，取最热的一个
                indCooks().forEach(function (c) { if (c.C.temp > 100 && Math.hypot(ind.p.x - c.x, ind.p.z - c.z) < IND_BODY.fireR + (c.ty === 'kiln' ? 1 : 0)) hot = Math.max(hot, Math.min(25, c.C.temp / 40)); });
                t += hot;
            }
            if (indFires().some(function (f) { return f.fuel > 0 && Math.hypot(ind.p.x - f.x, ind.p.z - f.z) < IND_BODY.fireR; })) t += IND_BODY.fireHeat;
            if (ind.where === 'base') {   // 屋里比外面暖；屋里 4 米内有火在烧，至少 18°C
                let h = indHouseAt(ind.p.x, ind.p.z);
                if (h) { t += IND_HOUSE[h.ty].warm; if (indHouseFireIn(h)) t = Math.max(t, IND_HOUSE_MIN); }
            }
            return t;
        }
        function indHeavy() { let f = 1; Object.keys(ind.base.wear).forEach(function (sl) { f *= IND_ITEMS[ind.base.wear[sl]].heavy || 1; }); return f; }   // 防爆服 ×0.6
        function indWarmth() { let w = 0; Object.keys(ind.base.wear).forEach(function (sl) { w += IND_ITEMS[ind.base.wear[sl]].warm || 0; }); return w; }
        function indBodyTick(dt) {
            let S = ind.base.surv, B = IND_BODY, eff = indAirTemp() + indWarmth() * B.warmMul;
            if (eff < B.cold) S.temp -= (B.cold - eff) * B.rate * dt;
            else if (eff > B.hot) S.temp += (eff - B.hot) * B.rate * dt;
            else S.temp += Math.max(-B.back * dt, Math.min(B.back * dt, 37 - S.temp));
            S.temp = Math.max(25, Math.min(45, S.temp));
        }
        // 基地外面的草地按季节换颜色（冬天是雪）
        const IND_GRASS = [0xa5d6a7, 0x81c784, 0xd7c27a, 0xeceff1];
        function indSeasonLook() {
            if (!ind.grass || ind.where !== 'base') return;
            let se = indSeason(); if (se === ind.grassSeason) return;
            ind.grassSeason = se; ind.grass.material.color.setHex(IND_GRASS[se]);
        }
        // 篝火烧掉燃料：和灶台一样，每烧掉 2 根木头的燃料（120）攒 1 份草木灰，灭了灰掉在原地，左键捡（基地里的才有，远征的篝火灰不留）
        function indFireBurn(f, secs) {
            let b = Math.min(secs, f.fuel); if (b <= 0) return;
            f.fuel -= b; f.ashT = (f.ashT || 0) + b;
            if (f.fuel <= 0) {
                f.fuel = 0; ind.fireDirty = true;
                let n = Math.floor(f.ashT / (IND_ASH_PER * 60)); f.ashT -= n * IND_ASH_PER * 60;
                if (ind.where === 'base' && n > 0) {
                    for (let i = 0; i < n && ind.base.ground.length < IND_ITEM_CAP; i++) { let a = i * 2.4; ind.base.ground.push({ k: 'ash', x: f.x + Math.cos(a) * 0.35 * (i % 3), z: f.z + Math.sin(a) * 0.35 * (i % 3) }); }
                    ind.itemDirty = true; if (!ind.sleeping) indFlash('篝火灭了，留下 ' + n + ' 份草木灰');
                }
            }
        }
        function indFireTick(dt) { indFires().forEach(function (f) { if (f.fuel > 0) indFireBurn(f, dt); }); }

        // ── 动物 ──
        function indAnimals() { return ind.where === 'base' ? ind.base.animals : (ind.wild || []); }
        function indFoodTxt(k) { return IND_ANIMALS[k].food.map(indName).join('、'); }
        function indAnimalTick(dt, live) {
            let A = indAnimals(), base = ind.where === 'base';
            A.forEach(function (a, i) {
                if (base && live) a.food = Math.max(0, a.food - IND_ANIMAL_HUNGER * dt);
                let sp = 1.2, tx, tz;
                if (a.call > 0) {   // 听到铃铛：走到玩家身边
                    a.call -= dt;
                    let d = Math.hypot(ind.p.x - a.x, ind.p.z - a.z);
                    if (d > 2) { tx = ind.p.x; tz = ind.p.z; sp = Math.min(9, 2 + d); } else { tx = a.x; tz = a.z; a.call = 0; }
                } else if (!base && a.follow) {
                    let d = Math.hypot(ind.p.x - a.x, ind.p.z - a.z);
                    if (d > 2.5) { tx = ind.p.x; tz = ind.p.z; sp = Math.min(9, 2 + d); } else { tx = a.x; tz = a.z; }
                } else {
                    a.wt = (a.wt || 0) - dt;
                    if (a.wt <= 0 || a.tx === undefined) {
                        a.wt = 3 + indHash(i, Math.floor(ind.t), 7) * 5;
                        let ang = indHash(i, Math.floor(ind.t * 3), 11) * Math.PI * 2, r = indHash(i, Math.floor(ind.t * 5), 13) * 5;
                        a.tx = a.x + Math.cos(ang) * r; a.tz = a.z + Math.sin(ang) * r;
                    }
                    tx = a.tx; tz = a.tz;
                }
                let dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
                if (d > 0.1) { let st = Math.min(d, sp * dt); a.x += dx / d * st; a.z += dz / d * st; a.ry = Math.atan2(dx, dz); }
                if (base) { a.x = Math.max(-IND_BASE.x + 1, Math.min(IND_BASE.x - 1, a.x)); a.z = Math.max(-IND_BASE.z + 1, Math.min(IND_BASE.z - 1, a.z)); }
                else { a.x = Math.max(-IND_MAP + 2, Math.min(IND_MAP - 2, a.x)); a.z = Math.max(-IND_MAP + 2, Math.min(IND_MAP - 2, a.z)); }
            });
        }
        function indSyncAnimals() {
            if (!ind.animalMesh) return;
            indDummy();
            let A = indAnimals(), n = Math.min(A.length, 40);
            for (let i = 0; i < n; i++) {
                let a = A[i], D = IND_ANIMALS[a.k], y = indGround(a.x, a.z);
                IND_DUMMY.position.set(a.x, y + D.size[1] / 2, a.z); IND_DUMMY.rotation.set(0, a.ry || 0, 0); IND_DUMMY.scale.set(D.size[2], D.size[1], D.size[0]); IND_DUMMY.updateMatrix();
                ind.animalMesh.setMatrixAt(i, IND_DUMMY.matrix); ind.animalMesh.setColorAt(i, IND_COL.setHex(D.col));
            }
            ind.animalMesh.count = n; ind.animalMesh.instanceMatrix.needsUpdate = true;
            if (ind.animalMesh.instanceColor) ind.animalMesh.instanceColor.needsUpdate = true;
        }
        // 左键对着动物：野生的喂它爱吃的（喂够就跟着你）；基地里的喂食、剪羊毛、拿空桶挤牛奶
        function indAnimalAct(a) {
            let D = IND_ANIMALS[a.k], k = indSel(), clock = ind.base.clock;
            if (ind.where === 'trip') {
                if (a.follow) { indFlash(D.name + '跟着你呢，走回撤离点就一起回家'); return false; }
                if (!k || D.food.indexOf(k) < 0) { indFlash('野生的' + D.name + '，爱吃：' + indFoodTxt(a.k)); return false; }
                indBagDel(k, 1); a.fed = (a.fed || 0) + 1;
                if (a.fed >= D.tame) { a.follow = true; indFlash(D.name + '跟着你了！'); }
                else indFlash(D.name + '吃了，还要喂 ' + (D.tame - a.fed) + ' 次');
                return true;
            }
            if (k && D.food.indexOf(k) >= 0) {
                if (a.food >= 95) { indFlash(D.name + '吃饱了'); return false; }
                indBagDel(k, 1); a.food = Math.min(100, a.food + 30); indSave(); indFlash('喂了' + D.name + '（饱食 ' + Math.round(a.food) + '）'); return true;
            }
            if (a.k === 'cow' && indIsEmptyCont(k)) {
                if (a.food < 30) { indFlash(D.name + '饿了，爱吃：' + indFoodTxt(a.k)); return false; }
                if (clock < a.milkAt) { indFlash('牛奶还要等 ' + Math.ceil(a.milkAt - clock) + ' 秒'); return false; }
                let mm = indContOf(k).mat; indBagDel(k, 1); indBagAdd(indFilledKey('milk', mm), 1); a.milkAt = clock + IND_MILK_EVERY; indSave(); indFlash('挤了一桶牛奶'); return true;
            }
            if (a.k === 'sheep' && k === 'shears') {
                if (a.food < 30) { indFlash(D.name + '饿了，爱吃：' + indFoodTxt(a.k)); return false; }
                if (clock < a.woolAt) { indFlash('羊毛还要等 ' + Math.ceil(a.woolAt - clock) + ' 秒'); return false; }
                if (indBagAdd('wool', 2) <= 0) { indFlash('背包满了'); return false; }
                a.woolAt = clock + IND_WOOL_EVERY; indSave(); indFlash('剪了 2 份羊毛'); return true;
            }
            // 手里的东西对它没用：只显示状态，不吃东西、不剪毛
            indFlash(D.name + '　饱食 ' + Math.round(a.food) + (a.food < 30 ? '，饿了' : '') + (a.k === 'sheep' ? '，' + (clock >= a.woolAt ? '能剪毛了（拿剪刀）' : '毛还要 ' + Math.ceil(a.woolAt - clock) + ' 秒') : a.k === 'cow' ? '，' + (clock >= a.milkAt ? '能挤奶了（拿空桶）' : '奶还要 ' + Math.ceil(a.milkAt - clock) + ' 秒') : '') + '，爱吃：' + indFoodTxt(a.k));
            return false;
        }

        // ── 进出 ──
        let ind = null;
        function indFlash(t) { try { blazeFlash(t); } catch (e) { } }
        function indEnter() {
            if (!indVisible() || ind) return;
            ind = { loading: true };
            indLoad(function (base) {
                if (!ind || !ind.loading) return;
                indStart(base);
            });
        }
        function indStart(base) {
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            ensureScene();
            ind = {
                loading: false, over: false, t: 0, last: performance.now(), raf: null, base: base, bag: JSON.parse(JSON.stringify(base.bag || {})), selIdx: 0,
                where: 'base', map: null, nodes: [], exits: [], exitT: 0, k: {}, p: { x: 0, y: 0, z: 0, vy: 0 }, stam: 100, sickT: 0, saveT: 10,
                objs: [], geos: [], mats: [], hudT: 0, hudSig: '', panel: null, oldBg: scene.background, oldFog: scene.fog, itemMesh: null, nodeMesh: null, cropMesh: null
            };
            indApplyPos(base);
            indBuildPlayer();
            indGoBase(null);
            indBuildHud(); indBindKeys();
            camera.rotation.set(-0.3, 0, 0, 'YXZ');
            document.body.onmousedown = function (e) {
                if (!ind || ind.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal') || e.target.closest('#ind-panel'))) return;
                if (ind.panel) return;
                if (!document.pointerLockElement) safeLockPointer();
            };
            ind.onMouse = function (e) {
                if (!ind || ind.over || !document.pointerLockElement) return;
                if (e.target && e.target.closest && e.target.closest('button, #ind-panel, #sys-modal')) return;
                if (e.button === 0) indAction(); else if (e.button === 2) indRightDown();
            };
            ind.onMouseUp = function (e) { if (ind && !ind.over && e.button === 2) indRightUp(); };
            ind.onCtx = function (e) { if (ind) e.preventDefault(); };
            document.addEventListener('mousedown', ind.onMouse); document.addEventListener('mouseup', ind.onMouseUp); document.addEventListener('contextmenu', ind.onCtx);
            if (!base.rule) indAskRule();
            else if (gState.control !== 'pad') indFlash('左键 采集／拿／种／打开，右键 吃喝／浇水／接水，Q 放下，Shift 跑');
            ind.last = performance.now();
            ind.raf = requestAnimationFrame(indLoop);
        }
        // 第一次进来选世界规则（只能从悠闲升级到硬核）
        function indAskRule() {
            showSysModal('猫盾工业：选一种玩法', '悠闲：种地、做饭、养动物。饿了渴了只会变慢，不会死，远征不出矿。　　硬核：全部内容，饿死渴死都会死，以后还有冶炼、电、核和火箭。　　悠闲以后能升级成硬核，硬核不能退回悠闲。', [
                { label: '悠闲', color: '#43a047', onClick: function () { indSetRule('casual'); } },
                { label: '硬核', color: '#d84315', onClick: function () { indSetRule('hard'); } }
            ]);
        }
        function indSetRule(r) {
            if (!ind || !ind.base) return;
            if (ind.base.rule === 'hard') return;            // 硬核不能退回
            if (ind.base.rule === 'casual' && r !== 'hard') return;
            ind.base.rule = r; indSave();
            indFlash(r === 'hard' ? '硬核世界：小心别饿死' : '悠闲世界：慢慢种地吧');
        }
        function indHard() { return ind.base.rule === 'hard'; }
        // 悠闲升级成硬核：弹确认窗，确认才升，升了不能退回
        function indAskHard() {
            if (!ind || !ind.base || ind.base.rule !== 'casual') return;
            showSysModal('升级成硬核', '升级后饿死渴死会死，能做冶炼和电，升了不能退回悠闲。', [{ label: '升级', color: '#e65100', onClick: indUpgradeHard }, { label: '再想想' }]);
        }
        function indUpgradeHard() {
            if (!ind || !ind.base || ind.base.rule !== 'casual') return;
            indSetRule('hard'); ind.hudSig = ''; if (ind.panel === 'bench') indPanelBench();
        }
        // 半路回大厅：在基地里身上的东西收回仓库箱；在远征里身上的东西丢掉（和寻宝队一样，没撤离就不算）
        function indExit(confirmed) {
            if (!ind) return;
            if (ind.loading) { ind = null; return; }
            if (ind.where === 'trip' && !confirmed && Object.keys(ind.bag).length) {
                showSysModal('猫盾工业', '还没撤离，现在回大厅身上的东西会丢。', [{ label: '丢了也回', color: '#d84315', onClick: function () { indExit(true); } }, { label: '再想想' }]);
                return;
            }
            let R = ind; R.over = true;
            if (R.raf) cancelAnimationFrame(R.raf);
            indSave();   // 基地里退出：背包带着存下来；远征里没撤离的丢掉（存的是空背包）
            R.bag = {};
            indUnbindKeys(); indPanelClose();
            document.body.onmousedown = null;
            if (R.onMouse) { document.removeEventListener('mouseup', R.onMouseUp); document.removeEventListener('mousedown', R.onMouse); document.removeEventListener('contextmenu', R.onCtx); }
            if (document.pointerLockElement) document.exitPointerLock();
            ['ind-hud', 'ind-night', 'ind-red', 'ind-dead'].forEach(function (id) { let e = document.getElementById(id); if (e && e.parentNode) e.parentNode.removeChild(e); });
            indClearWorld();
            if (R.me) scene.remove(R.me);
            scene.background = R.oldBg; scene.fog = R.oldFog;
            indSave(function () { });
            ind = null;
            nav('screen-lobby'); selectGameMode('industry');
        }

        // ── 场景 ──
        function indAdd(o) { scene.add(o); ind.objs.push(o); return o; }
        function indGeo(g) { ind.geos.push(g); return g; }
        function indMat(m) { ind.mats.push(m); return m; }
        function indClearWorld() {
            ind.objs.forEach(function (o) { scene.remove(o); });
            ind.geos.forEach(function (g) { g.dispose(); });
            ind.mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
            ind.badges = {}; ind.furnMesh = {}; ind.furnDirty = true; ind.objs = []; ind.geos = []; ind.mats = []; ind.fertMesh = null; ind.tileMesh = null; ind.itemMesh = null; ind.nodeMesh = null; ind.cropMesh = null; ind.fireMesh = null; ind.ghMesh = null; ind.grass = null; ind.animalMesh = null; ind.devMesh = null; ind.wireLine = null; ind.booms = []; ind.clouds = []; ind.nodes = []; ind.exits = [];
        }
        function indBox(w, h, d, col, x, y, z) {
            let m = new THREE.Mesh(indGeo(new THREE.BoxGeometry(w, h, d)), indMat(new THREE.MeshLambertMaterial({ color: col })));
            m.position.set(x, y, z); return indAdd(m);
        }
        function indPlane(w, d, col, x, y, z) {
            let m = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(w, d)), indMat(new THREE.MeshLambertMaterial({ color: col })));
            m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return indAdd(m);
        }
        function indSign(text, x, y, z, w, h) {
            let cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
            let g = cv.getContext('2d'); g.font = 'bold 80px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(text, 256, 68);
            g.fillStyle = '#fff'; g.fillText(text, 256, 68);
            let m = new THREE.Sprite(indMat(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })));
            m.scale.set(w * 1.3, h * 1.3, 1); m.position.set(x, y, z);
            return indAdd(m);
        }
        function indBuildPlayer() {
            let me = raceMakeBody(mySkinColor(0x42a5f5), 0, true, gState.acc, myFace());
            me.scale.setScalar(0.2); scene.add(me); ind.me = me;
        }
        // 成组画：基地地上的东西、农田里的作物、远征的资源点，各一个 InstancedMesh
        const IND_ITEM_CAP = 600, IND_CROP_CAP = 200;
        function indInst(geo, cap) {
            let m = new THREE.InstancedMesh(indGeo(geo), indMat(new THREE.MeshLambertMaterial({ color: 0xffffff })), cap);
            m.setColorAt(0, new THREE.Color(0xffffff));   // 先建好每个实例的颜色，第一次画之前着色器就带上实例颜色（不然后面设颜色也是白的）
            m.count = 0; m.frustumCulled = false; indAdd(m); return m;
        }
        let IND_DUMMY = null, IND_COL = null;
        function indDummy() { if (!IND_DUMMY) { IND_DUMMY = new THREE.Object3D(); IND_COL = new THREE.Color(); } }
        function indSyncItems() {
            if (!ind.itemMesh || !ind.itemDirty) return;
            indDummy();
            let G = ind.where === 'trip' ? (ind.tripGround || []) : ind.base.ground, n = Math.min(G.length, IND_ITEM_CAP);
            for (let i = 0; i < n; i++) {
                IND_DUMMY.position.set(G[i].x, (ind.where === 'trip' ? indGround(G[i].x, G[i].z) : 0) + 0.25, G[i].z); IND_DUMMY.rotation.set(0, (i * 0.7) % 6.28, 0); IND_DUMMY.scale.setScalar(1); IND_DUMMY.updateMatrix();
                ind.itemMesh.setMatrixAt(i, IND_DUMMY.matrix); ind.itemMesh.setColorAt(i, IND_COL.setHex(IND_ITEMS[G[i].k].col));
            }
            ind.itemMesh.count = n; ind.itemMesh.instanceMatrix.needsUpdate = true;
            if (ind.itemMesh.instanceColor) ind.itemMesh.instanceColor.needsUpdate = true;
            ind.itemDirty = false;
        }
        function indCropRipe(c) { return c.g >= IND_CROPS[c.k].grow; }
        function indSyncCrops() {
            if (!ind.cropMesh) return;
            ind.cropT = (ind.cropT || 0) - 1; if (ind.cropT > 0 && !ind.cropDirty) return;
            ind.cropT = 20; ind.cropDirty = false;   // 长势变化慢，20 帧更新一次
            indDummy();
            let C = ind.base.crops, n = Math.min(C.length, IND_CROP_CAP);
            for (let i = 0; i < n; i++) {
                let c = C[i], f = Math.min(1, c.g / IND_CROPS[c.k].grow), s = 0.25 + 0.75 * f;
                IND_DUMMY.position.set(c.x, 0.5 * s, c.z); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.set(s, s, s); IND_DUMMY.updateMatrix();
                ind.cropMesh.setMatrixAt(i, IND_DUMMY.matrix);
                ind.cropMesh.setColorAt(i, IND_COL.setHex(f >= 1 ? IND_CROPS[c.k].col : (c.wet > ind.base.clock ? 0x388e3c : 0x7cb342)));
            }
            ind.cropMesh.count = n; ind.cropMesh.instanceMatrix.needsUpdate = true;
            if (ind.cropMesh.instanceColor) ind.cropMesh.instanceColor.needsUpdate = true;
            if (ind.fertMesh) {   // 施过肥的地上有一个小白标记
                let m = 0;
                for (let i = 0; i < n; i++) { if (!C[i].fert) continue; IND_DUMMY.position.set(C[i].x + 0.55, 0.12, C[i].z + 0.55); IND_DUMMY.rotation.set(0, 0.6, 0); IND_DUMMY.scale.set(1, 1, 1); IND_DUMMY.updateMatrix(); ind.fertMesh.setMatrixAt(m, IND_DUMMY.matrix); ind.fertMesh.setColorAt(m, IND_COL.setHex(0xeeeeee)); m++; }
                ind.fertMesh.count = m; ind.fertMesh.instanceMatrix.needsUpdate = true;
                if (ind.fertMesh.instanceColor) ind.fertMesh.instanceColor.needsUpdate = true;
            }
        }

        // 暖棚：半透明的顶和四根柱子
        function indBuildGh() {
            if (ind.ghObjs) ind.ghObjs.forEach(function (o) { scene.remove(o); let i = ind.objs.indexOf(o); if (i >= 0) ind.objs.splice(i, 1); });   // 升级玻璃棚时重盖
            let before = ind.objs.length;
            let G = indGhBox(), w = G.x1 - G.x0, d = G.z1 - G.z0, cx = (G.x0 + G.x1) / 2, cz = (G.z0 + G.z1) / 2;
            let roof = new THREE.Mesh(indGeo(new THREE.BoxGeometry(w, 0.1, d)), indMat(new THREE.MeshLambertMaterial({ color: ind.base.glass ? 0xb3e5fc : 0xe0f7fa, transparent: true, opacity: ind.base.glass ? 0.3 : 0.35 })));
            roof.position.set(cx, 3, cz); indAdd(roof); ind.ghMesh = roof;
            [[G.x0, G.z0], [G.x1, G.z0], [G.x0, G.z1], [G.x1, G.z1]].forEach(function (p) { indBox(0.2, 3, 0.2, ind.base.glass ? 0x90a4ae : 0x8d6e63, p[0], 1.5, p[1]); });
            indSign(ind.base.glass ? '玻璃暖棚' : '暖棚', cx, 3.8, G.z0, 2.6, 0.5);
            ind.ghObjs = ind.objs.slice(before);
        }
        function indSyncFires() {
            if (!ind.fireMesh || !ind.fireDirty) return;
            indDummy();
            let F = indFires(), n = Math.min(F.length, 30);
            for (let i = 0; i < n; i++) {
                let f = F[i], y = ind.where === 'trip' ? indGround(f.x, f.z) : 0;
                IND_DUMMY.position.set(f.x, y + 0.45, f.z); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.setScalar(f.fuel > 0 ? 1 : 0.6); IND_DUMMY.updateMatrix();
                ind.fireMesh.setMatrixAt(i, IND_DUMMY.matrix); ind.fireMesh.setColorAt(i, IND_COL.setHex(f.fuel > 0 ? 0xff7043 : 0x5d4037));
            }
            ind.fireMesh.count = n; ind.fireMesh.instanceMatrix.needsUpdate = true;
            if (ind.fireMesh.instanceColor) ind.fireMesh.instanceColor.needsUpdate = true;
            ind.fireDirty = false;
        }

        // 基地：一块地、一圈矮篱笆、农田、仓库箱、灶台、床、水池、出发门
        const IND_BASE_ST = {
            box: { x: -2, z: -19, name: '仓库箱' }, stove: { x: 8, z: -19, name: '灶台' }, bed: { x: 22, z: -18, name: '床' }, bench: { x: 15, z: -19, name: '工作台' },
            pool: { x: 20, z: 10, r: 2.2, name: '水池' }, gate: { x: 0, z: -IND_BASE.z, name: '出发' }
        };
        // 家具能搬：IND_BASE_ST 里的坐标跟着存档走（base.pos），默认位置在这里
        const IND_ST_DEF = JSON.parse(JSON.stringify(IND_BASE_ST));
        const IND_FURN_R = { stove: 1.5, bed: 2.0, bench: 1.4, pool: 2.4, chest: 1.2, furnace: 1.2, kiln: 2.1 };
        function indApplyPos(b) { ['stove', 'bed', 'bench', 'pool'].forEach(function (k) { let p = b.pos && b.pos[k]; IND_BASE_ST[k].x = p ? p.x : IND_ST_DEF[k].x; IND_BASE_ST[k].z = p ? p.z : IND_ST_DEF[k].z; }); }
        function indGoBase(fromTrip) {
            let fol = fromTrip && ind.wild ? ind.wild.filter(function (a) { return a.follow && Math.hypot(a.x - ind.p.x, a.z - ind.p.z) <= 10; }) : [];
            ind.wild = []; ind.rafts = []; ind.onRaft = null; ind.tripGround = []; ind.tripBombs = []; ind.tripRad = []; ind.mush = null;
            indClearWorld();
            ind.where = 'base'; ind.map = null; ind.exitT = 0;
            scene.background = new THREE.Color(0xcfe8ff); scene.fog = null;
            let X = IND_BASE.x, Z = IND_BASE.z, F = IND_FIELD;
            ind.grass = indPlane(2 * X + 30, 2 * Z + 30, 0xa5d6a7, 0, 0, 0); ind.grassSeason = -1;
            indPlane(2 * X, 2 * Z, 0xbcaaa4, 0, 0.01, 0);
            indPlane(F.x1 - F.x0, F.z1 - F.z0, 0x6d4c41, (F.x0 + F.x1) / 2, 0.02, (F.z0 + F.z1) / 2);
            indSign('农田', (F.x0 + F.x1) / 2, 2.5, F.z0 - 1, 2.4, 0.6);
            indBox(2 * X, 0.6, 0.2, 0x6d4c41, 0, 0.3, Z); indBox(0.2, 0.6, 2 * Z, 0x6d4c41, -X, 0.3, 0); indBox(0.2, 0.6, 2 * Z, 0x6d4c41, X, 0.3, 0);
            indBox(X - 2.5, 0.6, 0.2, 0x6d4c41, -(X + 2.5) / 2, 0.3, -Z); indBox(X - 2.5, 0.6, 0.2, 0x6d4c41, (X + 2.5) / 2, 0.3, -Z);
            let S = IND_BASE_ST;   // 仓库箱、灶台、床、工作台、水池、小熔炉、大窑能搬，画在 indSyncFurn 里
            if (ind.base.gh) indBuildGh();
            let g = S.gate; indBox(0.4, 3.2, 0.4, 0x5d4037, g.x - 2.4, 1.6, g.z); indBox(0.4, 3.2, 0.4, 0x5d4037, g.x + 2.4, 1.6, g.z); indBox(5.2, 0.5, 0.5, 0x5d4037, g.x, 3.3, g.z);
            indSign('出发（远征）', g.x, 4.3, g.z, 3.2, 0.8);
            ind.itemMesh = indInst(new THREE.BoxGeometry(0.5, 0.5, 0.5), IND_ITEM_CAP); ind.itemDirty = true;
            ind.cropMesh = indInst(new THREE.ConeGeometry(0.5, 1, 6), IND_CROP_CAP); ind.cropDirty = true;
            ind.fertMesh = indInst(new THREE.BoxGeometry(0.3, 0.2, 0.3), IND_CROP_CAP);
            ind.tileMesh = indInst(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), IND_TILE_CAP); ind.tileDirty = true;
            indSyncFurn();   // 家具马上画出来（不等第一帧），进出时物体数每次一样
            ind.animalMesh = indInst(new THREE.BoxGeometry(1, 1, 1), 40);
            ind.fireMesh = indInst(new THREE.ConeGeometry(0.45, 0.9, 7), 30); ind.fireDirty = true;
            ind.devMesh = indInst(new THREE.BoxGeometry(1, 1, 1), IND_DEV_CAP); ind.devDirty = true;
            ind.wireLine = new THREE.LineSegments(indGeo(new THREE.BufferGeometry()), indMat(new THREE.LineBasicMaterial({ color: 0xff7043 }))); ind.wireLine.frustumCulled = false; indAdd(ind.wireLine); ind.wireDirty = true;
            ind.p.x = 0; ind.p.z = fromTrip ? -IND_BASE.z + 4 : 4; ind.p.y = 0; ind.p.vy = 0;
            if (fromTrip) {
                let got = Object.keys(ind.bag).map(function (k) { return indName(k) + '×' + ind.bag[k]; });
                fol.forEach(function (a, i) {
                    if (ind.base.animals.length >= IND_ANIMAL_CAP) return;
                    ind.base.animals.push({ k: a.k, x: 6 + i * 1.5, z: -IND_BASE.z + 6, food: 60, woolAt: ind.base.clock + IND_WOOL_EVERY, milkAt: ind.base.clock });
                    got.push(IND_ANIMALS[a.k].name);
                });
                ind.base.trips++;
                indSave();
                indFlash(got.length ? '撤离成功，带回：' + got.join('、') + '（都在背包里）' : '撤离成功，这次空手回来');
            }
        }

        // 远征：地形（一个网格，颜色按地貌）、水面、资源点（一个 InstancedMesh）、两个撤离点
        const IND_SEG = 120, IND_NODE_N = 420;
        const IND_SEED_KINDS = ['seed_wheat', 'seed_potato', 'seed_tomato', 'seed_corn', 'seed_cane', 'seed_pumpkin', 'seed_cotton', 'seed_cabbage', 'seed_radish'];
        function indGoTrip(seed) {
            indClearWorld();
            ind.where = 'trip'; ind.exitT = 0; ind.tripFires = []; ind.rafts = []; ind.onRaft = null; ind.tripGround = []; ind.tripBombs = []; ind.tripRad = []; ind.mush = null;
            let M = ind.map = indMakeMap(seed === undefined ? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) : seed);
            scene.background = new THREE.Color(0xbfe3ff); scene.fog = new THREE.Fog(0xbfe3ff, 60, 160);
            let geo = indGeo(new THREE.PlaneGeometry(IND_MAP * 2, IND_MAP * 2, IND_SEG, IND_SEG));
            geo.rotateX(-Math.PI / 2);
            let pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
            for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i), z = pos.getZ(i), h = indHeight(M, x, z), bm = indBiome(M, x, z);
                pos.setY(i, h);
                c.setHex(IND_BIOMES[bm].col); let sh = 0.92 + indHash(i, 3, M.seed) * 0.12; cols[i * 3] = c.r * sh; cols[i * 3 + 1] = c.g * sh; cols[i * 3 + 2] = c.b * sh;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            geo.computeVertexNormals();
            indAdd(new THREE.Mesh(geo, indMat(new THREE.MeshLambertMaterial({ vertexColors: true }))));
            let wat = new THREE.Mesh(indGeo(new THREE.PlaneGeometry(IND_MAP * 2, IND_MAP * 2)), indMat(new THREE.MeshLambertMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.75 })));
            wat.rotation.x = -Math.PI / 2; wat.position.y = IND_WATER_Y; indAdd(wat);
            // 资源点：按地貌的权重挑；悠闲世界只刷 IND_CASUAL_RES 里的
            let r = indRng(M.seed ^ 0x9e3779b9), casual = ind.base.rule === 'casual';
            for (let i = 0; i < IND_NODE_N; i++) {
                let x = (r() * 2 - 1) * (IND_MAP - 4), z = (r() * 2 - 1) * (IND_MAP - 4);
                if (Math.hypot(x, z) < 8) continue;
                let h = indHeight(M, x, z); if (h < -1.0) continue;
                let res = IND_BIOMES[indBiome(M, x, z)].res, tot = 0, ks = Object.keys(res).filter(function (k) { return !casual || IND_CASUAL_RES[k]; });
                ks.forEach(function (k) { tot += res[k]; });
                let pick = r() * tot, key = null;
                ks.some(function (k) { pick -= res[k]; if (pick <= 0) { key = k; return true; } return false; });
                let roll = r();
                if (!key) continue;
                let nd = IND_NODES[key];
                if (IND_ORE_NODES[key]) {   // 矿成片：抽到矿 1/4 的机会在这里刷一片（3～6 个点，中心 3 米内），其余作废；矿的总数比原来略多
                    if (r() > 0.25) continue;
                    let want = 3 + Math.floor(r() * 4), got = 0;
                    for (let t = 0; t < 40 && got < want; t++) {
                        let a = r() * Math.PI * 2, d = Math.sqrt(r()) * 3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, ph = indHeight(M, px, pz);
                        if (ph < -1.0 || Math.abs(px) > IND_MAP - 2 || Math.abs(pz) > IND_MAP - 2 || Math.hypot(px, pz) < 8) continue;
                        ind.nodes.push({ key: key, x: px, z: pz, y: ph, n: nd.give[0] + Math.floor(r() * (nd.give[1] - nd.give[0] + 1)), seed: IND_SEED_KINDS[0], dead: false }); got++;
                    }
                    continue;
                }
                ind.nodes.push({ key: key, x: x, z: z, y: h, n: nd.give[0] + Math.floor(roll * (nd.give[1] - nd.give[0] + 1)), seed: IND_SEED_KINDS[Math.floor(r() * IND_SEED_KINDS.length)], dead: false });
            }
            ind.nodeMesh = indInst(new THREE.DodecahedronGeometry(0.7, 0), ind.nodes.length || 1); ind.nodeDirty = true;
            ind.fireMesh = indInst(new THREE.ConeGeometry(0.45, 0.9, 7), 30); ind.fireDirty = true;
            // 野生动物：平原有羊和牛，森林有狗和猫
            ind.wild = [];
            for (let i = 0, tries = 0; ind.wild.length < 14 && tries < 400; tries++) {
                let x = (r() * 2 - 1) * (IND_MAP - 10), z = (r() * 2 - 1) * (IND_MAP - 10), bm = indBiome(M, x, z);
                if (Math.hypot(x, z) < 12 || indHeight(M, x, z) < -0.8) continue;
                let ks = Object.keys(IND_ANIMALS).filter(function (k) { return IND_ANIMALS[k].biome.indexOf(bm) >= 0; });
                if (!ks.length) continue;
                ind.wild.push({ k: ks[Math.floor(r() * ks.length)], x: x, z: z, fed: 0, follow: false }); i++;
            }
            ind.animalMesh = indInst(new THREE.BoxGeometry(1, 1, 1), 40);
            ind.exits.push({ x: 0, z: 6, name: '回家的门' });
            for (let i = 0; i < 2; i++) { let a = r() * Math.PI * 2, d = IND_MAP * (0.45 + r() * 0.35); ind.exits.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, name: '撤离点' }); }
            ind.exits.forEach(function (e) {
                let y = indHeight(M, e.x, e.z);
                let ring = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(IND_T.exitR, IND_T.exitR, 0.2, 24)), indMat(new THREE.MeshLambertMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.55 })));
                ring.position.set(e.x, y + 0.1, e.z); indAdd(ring);
                let beam = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(0.3, 0.3, 30, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.35 })));
                beam.position.set(e.x, y + 15, e.z); indAdd(beam);
                indSign(e.name, e.x, y + 3.2, e.z, 2.6, 0.65);
            });
            ind.p.x = 0; ind.p.z = -4; ind.p.y = indHeight(M, 0, -4); ind.p.vy = 0;
            indSave();
            indFlash('出发了！走回绿色撤离圈里站 ' + IND_T.extract + ' 秒才算带回来');
        }
        function indSyncNodes() {
            if (!ind.nodeMesh || !ind.nodeDirty) return;
            indDummy();
            let n = 0;
            ind.nodes.forEach(function (o, i) {
                if (o.dead) return;
                IND_DUMMY.position.set(o.x, o.y + 0.45, o.z); IND_DUMMY.rotation.set(0, i, 0);
                IND_DUMMY.scale.setScalar(o.key === 'wood' ? 1.3 : 1); IND_DUMMY.updateMatrix();
                ind.nodeMesh.setMatrixAt(n, IND_DUMMY.matrix); ind.nodeMesh.setColorAt(n, IND_COL.setHex(IND_NODE_COL[o.key] || IND_ITEMS[o.key].col)); n++;
            });
            ind.nodeMesh.count = n; ind.nodeMesh.instanceMatrix.needsUpdate = true;
            if (ind.nodeMesh.instanceColor) ind.nodeMesh.instanceColor.needsUpdate = true;
            ind.nodeDirty = false;
        }

        // ── 主循环 ──
        function indLoop() {
            if (!ind || ind.over) return;
            if (introFrozen()) { ind.raf = requestAnimationFrame(indLoop); return; }   // R1：提示卡片开着时静止
            let now = performance.now(), dt = Math.min(0.05, (now - ind.last) / 1000);
            ind.last = now;
            indTick(dt);
            if (ind && !ind.over) { indRender(); ind.raf = requestAnimationFrame(indLoop); }
        }
        function indGround(x, z) { return ind.where === 'trip' ? Math.max(IND_WATER_Y, indHeight(ind.map, x, z)) : 0; }
        function indInWater() { return ind.where === 'trip' && indHeight(ind.map, ind.p.x, ind.p.z) < IND_WATER_Y + 0.2; }
        // 水深：水面比脚下地面高多少（陆地 0）。浅水 < 0.6 米能跑、0.8 倍速；深水游泳 0.6 倍速不能跑，体力每秒掉 5，没体力 0.3 倍速；木筏上 2 倍速
        const IND_WATER = { shallow: 0.6, shallowSp: 0.8, deepSp: 0.6, tiredSp: 0.3, stamDrain: 5, raftSp: 2 };
        function indWaterDepth(x, z) { return ind.where === 'trip' ? Math.max(0, IND_WATER_Y - indHeight(ind.map, x, z)) : 0; }
        function indDeep() { return !ind.onRaft && ind.where === 'trip' && indWaterDepth(ind.p.x, ind.p.z) >= IND_WATER.shallow; }
        function indWaterSpeed() {
            if (ind.onRaft) return IND_WATER.raftSp;
            if (!indInWater()) return 1;
            if (!indDeep()) return IND_WATER.shallowSp;
            return ind.stam > 0 ? IND_WATER.deepSp : IND_WATER.tiredSp;
        }
        // 木筏：水边右键放下（远征的只在这一趟），左键上去／下来；水上不能上岸
        function indPlaceRaft(k) {
            if (ind.where !== 'trip') { indFlash('木筏只能在远征的水边放'); return false; }
            if (ind.onRaft) { indFlash('先下筏'); return false; }
            let f = indFace(), x = ind.p.x + f.x * 2.6, z = ind.p.z + f.z * 2.6;
            if (indWaterDepth(x, z) <= 0.05) { indFlash('对着水面放'); return false; }
            ind.rafts = ind.rafts || [];
            if (ind.rafts.some(function (r) { return Math.hypot(r.x - x, r.z - z) < 2.4; })) { indFlash('这里已经有筏了'); return false; }
            let r = { x: x, z: z }; r.m = [indBox(2.4, 0.25, 2.4, 0x8d6e63, x, IND_WATER_Y + 0.1, z), indBox(2.4, 0.08, 0.3, 0x5d4037, x, IND_WATER_Y + 0.26, z - 0.7), indBox(2.4, 0.08, 0.3, 0x5d4037, x, IND_WATER_Y + 0.26, z + 0.7)];
            ind.rafts.push(r); indBagDel(k, 1); indFlash('放好了木筏：左键上去');
            return true;
        }
        function indRaftMove(r, x, z) { r.x = x; r.z = z; r.m.forEach(function (m, i) { m.position.x = x; m.position.z = z + (i === 1 ? -0.7 : i === 2 ? 0.7 : 0); }); }
        function indRaftToggle(r) {
            if (ind.onRaft) {   // 下筏：4 米内有岸就上岸，没有就留在水里
                let best = null, bd = 1e9;
                for (let a = 0; a < 16; a++) for (let d = 2; d <= 4.01; d += 1) {
                    let x = ind.p.x + Math.cos(a * Math.PI / 8) * d, z = ind.p.z + Math.sin(a * Math.PI / 8) * d;
                    if (indHeight(ind.map, x, z) >= IND_WATER_Y + 0.2 && d < bd) { bd = d; best = { x: x, z: z }; }
                }
                ind.onRaft = null;
                if (best) { ind.p.x = best.x; ind.p.z = best.z; ind.p.y = indGround(best.x, best.z); indFlash('上岸了'); }
                else indFlash('下了筏，在水里');
                return true;
            }
            ind.onRaft = r; ind.p.x = r.x; ind.p.z = r.z; ind.p.vy = 0; indFlash('上筏了：左键下筏');
            return true;
        }
        function indTick(dt) {
            if (ind.dead) return;   // 死亡画面：游戏暂停，点"回基地"才继续
            ind.t += dt;
            let live = !!ind.base.rule;   // 还没选规则时时间不走
            if (live) { ind.base.clock += dt; indBodyTick(dt); indSurvTick(dt); indCropTick(dt); }
            indFireTick(dt); indAnimalTick(dt, live);
            indHotTick(dt);
            if (!ind || ind.over || ind.dead) return;
            if (live) indElecTick(dt);
            if (!ind || ind.over || ind.dead) return;
            indBoomTick(dt); indCloudTick(dt); indFogTick(dt);
            if (!ind || ind.over || ind.dead) return;
            indHurtTick(dt);
            nkTick(dt);   // 第 6 阶段（19-industry-nuke.js）：原子弹倒计时、辐射
            if (!ind || ind.over || ind.dead) return;
            indStoveTick(dt);
            if (!ind || ind.over) return;
            indRightHoldTick(dt);
            if (!ind || ind.over) return;
            indMove(dt);
            if (ind.where === 'base') {
                let g = IND_BASE_ST.gate;
                if (Math.abs(ind.p.x - g.x) < IND_T.gateR && ind.p.z < g.z + 0.3) indGoTrip();
            } else {
                let inExit = ind.exits.some(function (e) { return Math.hypot(ind.p.x - e.x, ind.p.z - e.z) <= IND_T.exitR; });
                ind.exitT = inExit ? ind.exitT + dt : 0;
                if (ind.exitT >= IND_T.extract) indGoBase(true);
            }
            indSyncItems(); indSyncNodes(); indSyncCrops(); indSyncFires(); indSyncAnimals(); indSyncDevs(); indSyncFurn(); indHouseFadeTick(dt); indSyncTiles();
            camera.position.set(ind.p.x, ind.p.y + IND_EYE, ind.p.z);
            ind.saveT -= dt; if (ind.saveT <= 0) { ind.saveT = 10; indSave(); }   // 每 10 秒存一次（生存值、时间、作物）
            ind.hudT -= dt; if (ind.hudT <= 0) { ind.hudT = 0.2; indHudUpdate(); indSeasonLook(); }
        }
        // 生存值：饱食、口渴、精力按时间掉；拉肚子口渴掉 3 倍；夜里在外面精力掉 3 倍；
        // 到 0：悠闲只是变慢；硬核饿了每秒扣 1 血、渴了每秒扣 2 血，血到 0 就死
        function indSurvTick(dt) {
            let S = ind.base.surv, Q = IND_SURV;
            if (ind.sickT > 0) ind.sickT -= dt;
            S.food = Math.max(0, S.food - Q.food * dt);
            S.water = Math.max(0, S.water - Q.water * (ind.sickT > 0 ? Q.sickWater : 1) * (S.temp > IND_BODY.sweat ? 2 : 1) * dt);
            let em = (ind.running ? Q.runEnergy : 1) * (ind.where === 'trip' && indIsNight() ? Q.nightOut : 1);
            S.energy = Math.max(0, S.energy - Q.energy * em * dt);
            if (indSel() === 'dry_ice') S.temp = Math.max(25, S.temp - IND_DRY_COLD * dt);   // 干冰拿在手上，体温每秒 −0.05°C
            if (indHard()) {
                let cold = S.temp < IND_BODY.freeze ? 1 : 0, hot = S.temp > IND_BODY.boil ? 1 : 0;
                let dmg = (S.food <= 0 ? Q.starveHp : 0) + (S.water <= 0 ? Q.thirstHp : 0) + cold + hot;
                if (dmg > 0) {
                    if (S.food <= 0 && indHurt(Q.starveHp * dt, 'starve', '饱食到 0')) return;
                    if (S.water <= 0 && indHurt(Q.thirstHp * dt, 'thirst', '口渴到 0')) return;
                    if (cold && indHurt(dt, 'cold', '体温 ' + S.temp.toFixed(1) + '°C')) return;
                    if (hot && indHurt(dt, 'heat', '体温 ' + S.temp.toFixed(1) + '°C')) return;
                }
                else if (S.food > 30 && S.water > 30 && !ind.radHurt) S.hp = Math.min(100, S.hp + Q.regen * dt);   // 受辐射的时候不自己恢复
            }
        }
        function indSlow() { let S = ind.base.surv; return S.food <= 0 || S.water <= 0 || S.energy <= 0; }
        function indShiver() { return ind.base.surv.temp < IND_BODY.chill; }
        // ── 受伤和死亡：所有掉血都走 indHurt，记下来源（死因、飘字、血条旁的字都用它） ──
        const IND_HURT = { starve: { die: '饿死', tag: '饥饿' }, thirst: { die: '渴死', tag: '口渴' }, cold: { die: '冻死', tag: '冻伤' }, heat: { die: '热死', tag: '中暑' }, burn: { die: '烫伤', tag: '烫伤' }, gas: { die: '中毒', tag: '中毒' }, boom: { die: '爆炸', tag: '爆炸' }, rad: { die: '辐射', tag: '辐射' } };
        function indHurt(n, key, detail, instant) {
            if (!ind || ind.over || ind.dead || !(n > 0)) return false;
            let S = ind.base.surv, R = ind.hurt = ind.hurt || { rec: [], acc: {}, ft: {} };
            S.hp -= n; ind.redT = 1; ind.lastHurt = IND_HURT[key].die;
            R.rec.push({ t: ind.t, key: key, n: n, detail: detail || '' });
            R.rec = R.rec.filter(function (r) { return ind.t - r.t <= 2; });
            R.acc[key] = (R.acc[key] || 0) + n;
            if (instant) indHurtFloat(key);
            if (S.hp > 0) return false;
            let sum = {}, best = key; R.rec.forEach(function (r) { sum[r.key] = (sum[r.key] || 0) + r.n; if (sum[r.key] > (sum[best] || 0)) best = r.key; });
            let last = R.rec.filter(function (r) { return r.key === best; }).pop();
            indDie(IND_HURT[best].die, last ? last.detail : '');
            return true;
        }
        function indHurtFloat(key) {
            let R = ind.hurt, a = R.acc[key] || 0; R.acc[key] = 0; R.ft[key] = 0;
            if (a >= 0.5) indFloat('−' + Math.round(a) + ' ' + IND_HURT[key].tag);
        }
        function indHurtTick(dt) {
            let R = ind.hurt; if (!R) return;
            Object.keys(R.acc).forEach(function (k) { R.ft[k] = (R.ft[k] || 0) + dt; if (R.ft[k] >= 1) indHurtFloat(k); });
            R.rec = R.rec.filter(function (r) { return ind.t - r.t <= 2; });
            ind.redT = Math.max(0, (ind.redT || 0) - dt * 1.5);
            let e = document.getElementById('ind-red'); if (e) e.style.opacity = Math.min(1, ind.redT).toFixed(2);
        }
        // 头顶飘字
        function indFloat(text) {
            ind.floatLog = ind.floatLog || []; ind.floatLog.push(text); if (ind.floatLog.length > 50) ind.floatLog.shift();
            let h = document.getElementById('ind-hud'); if (!h) return;
            let e = document.createElement('div');
            e.style.cssText = 'position:absolute;left:50%;top:36%;transform:translateX(-50%);color:#ff5252;font-size:26px;font-weight:bold;text-shadow:0 0 4px #000,0 0 4px #000;white-space:nowrap;';
            e.textContent = text; h.appendChild(e);
            let done = function () { if (e.parentNode) e.parentNode.removeChild(e); };
            if (e.animate) e.animate([{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-70px)', opacity: 0 }], { duration: 1300 }).onfinish = done; else setTimeout(done, 1300);
        }
        function indHotDetail() {
            let L = Object.keys(ind.bag).filter(function (k) { return IND_ITEMS[k].hot; }).map(function (k) { return indName(k).replace('（烫）', ''); });
            return L.length ? '背包里有烫的' + L.join('、') + '，没有钳子' : '背包里有烫的东西';
        }
        // 死：身上的东西没了、状态恢复先存好，停在死亡画面（游戏暂停），点"回基地"才继续
        function indDie(cause, detail) {
            if (!ind || ind.over || ind.dead) return;
            let lost = Object.keys(ind.bag).length + Object.keys(ind.base.wear).length;
            ind.bag = {}; ind.base.wear = {}; ind.hotT = {};
            let S = ind.base.surv; S.hp = 100; S.temp = 37; S.food = Math.max(S.food, 40); S.water = Math.max(S.water, 40); S.energy = Math.max(S.energy, 50);
            ind.dead = { cause: cause, detail: detail || '', lost: lost };
            ind.rh = null; ind.hurt = null; ind.redT = 0; if (ind.panel) indPanelClose();
            if (document.pointerLockElement) document.exitPointerLock();
            let d = document.createElement('div'); d.id = 'ind-dead';
            d.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.85);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Microsoft YaHei",sans-serif;text-align:center;padding:20px;';
            d.innerHTML = '<div style="font-size:44px;font-weight:bold;color:#ff5252;">' + cause + '</div>' + (detail ? '<div style="font-size:22px;margin-top:12px;">' + detail + '</div>' : '') +
                '<div style="font-size:18px;margin-top:14px;color:#ccc;">' + (lost ? '身上的东西都没了' : '身上没带东西') + '</div>' +
                '<button onclick="indRespawn()" style="margin-top:26px;padding:12px 34px;font-size:20px;border:none;border-radius:8px;background:#fff;color:#222;cursor:pointer;">回基地</button>';
            document.body.appendChild(d);
            indSave();
        }
        function indRespawn() {
            if (!ind || !ind.dead) return;
            let e = document.getElementById('ind-dead'); if (e && e.parentNode) e.parentNode.removeChild(e);
            ind.dead = null;
            indGoBase(null); indSave();
        }
        // 作物：浇过水（当天）全速长，没浇水半速
        function indCropTick(dt) {
            let clock = ind.base.clock, ch = false;
            ind.base.crops.forEach(function (c) {
                let C = IND_CROPS[c.k]; if (c.g >= C.grow || !indCropSeasonOK(c)) return;
                let was = c.g; c.g = Math.min(C.grow, c.g + dt * (c.wet > clock ? 1 : 0.5) * (c.fert ? IND_FERT : 1));   // 草木灰肥料：这一季长得快 50%，和浇水叠加
                if (Math.floor(was / C.grow * 4) !== Math.floor(c.g / C.grow * 4)) ch = true;
            });
            if (ch) ind.cropDirty = true;
        }
        function indMove(dt) {
            let R = ind, k = R.k, blocked = !!R.panel;
            let cd = new THREE.Vector3(); camera.getWorldDirection(cd); cd.y = 0;
            if (cd.lengthSq() < 1e-6) cd.set(0, 0, -1); cd.normalize();
            let fwd = blocked ? 0 : (k.w ? 1 : 0) - (k.s ? 1 : 0), strafe = blocked ? 0 : (k.d ? 1 : 0) - (k.a ? 1 : 0);
            if (!blocked && !fwd && !strafe && gState.control === 'pad') { fwd = -tMove.y; strafe = tMove.x; }
            let mx = cd.x * fwd - cd.z * strafe, mz = cd.z * fwd + cd.x * strafe, moving = !!(mx || mz);
            let S = R.base.surv, deep = R.where === 'trip' && indDeep(), canRun = k.run && moving && R.stam > 0 && S.energy > 0 && !deep && !R.onRaft;
            R.running = canRun;
            R.stam = deep ? Math.max(0, R.stam - IND_WATER.stamDrain * dt) : canRun ? Math.max(0, R.stam - IND_SURV.stamDrain * dt) : Math.min(100, R.stam + IND_SURV.stamRegen * dt);
            let sp = IND_T.speed * (canRun ? IND_T.run : 1) * (indSlow() ? 0.5 : 1) * (indShiver() ? 0.7 : 1) * indHeavy() * (R.where === 'trip' ? indWaterSpeed() : 1);
            if (moving) {
                let n = Math.hypot(mx, mz), run = Math.min(1, n); mx /= n; mz /= n;
                let len = sp * run * dt, hs = R.where === 'base' && R.base.houses.length, steps = hs ? Math.max(1, Math.ceil(len / 0.2)) : 1;   // 有房子时一小步一小步走，不穿墙
                let ox = R.p.x, oz = R.p.z;
                for (let i = 0; i < steps; i++) { R.p.x += mx * len / steps; R.p.z += mz * len / steps; if (hs) indHouseCollide(R.p); }
                if (R.onRaft) {   // 筏在水上走，不能上岸：碰到岸就沿着岸滑，实在不行停住
                    let wet = function (x, z) { return indHeight(R.map, x, z) < IND_WATER_Y - 0.05; };
                    let nx = R.p.x, nz = R.p.z;
                    if (!wet(nx, nz)) { if (wet(nx, oz)) nz = oz; else if (wet(ox, nz)) nx = ox; else { nx = ox; nz = oz; } }
                    R.p.x = nx; R.p.z = nz; indRaftMove(R.onRaft, nx, nz);
                }
                R.me.rotation.y = Math.atan2(mx, mz);
            }
            let lim = R.where === 'base' ? { x: IND_BASE.x - 0.6, z: IND_BASE.z - 0.6 } : { x: IND_MAP - 1, z: IND_MAP - 1 };
            R.p.x = Math.max(-lim.x, Math.min(lim.x, R.p.x));
            let zMin = R.where === 'base' && Math.abs(R.p.x) < IND_T.gateR ? -IND_BASE.z - 1 : -lim.z;
            R.p.z = Math.max(zMin, Math.min(lim.z, R.p.z));
            if (R.where === 'base' && R.base.houses.length) indHouseCollide(R.p);
            let gy = indGround(R.p.x, R.p.z);
            if (k.jump && R.p.y <= gy + 0.001 && !blocked && !R.onRaft) R.p.vy = 9;
            R.p.vy -= 25 * dt; R.p.y += R.p.vy * dt;
            if (R.p.y < gy) { R.p.y = gy; R.p.vy = 0; }
            R.me.position.set(R.p.x, R.p.y, R.p.z);
        }
        function indRender() {
            // 夜里：天空和雾变暗，屏幕盖一层半透明黑（不改场景里原有的灯）
            let d = indDark(), nightEl = document.getElementById('ind-night');
            if (nightEl) nightEl.style.opacity = (d * 0.55 * (indLampNear() ? 0.35 : 1)).toFixed(3);
            if (ind.where === 'trip' && scene.fog) { scene.fog.far = 160 - d * 110; scene.fog.near = 60 - d * 50; }
            let eye = camera.position.clone(), rx = camera.rotation.x, ry = camera.rotation.y, rz = camera.rotation.z;
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            let dd = IND_CAM.back, cx = eye.x - dir.x * dd, cz = eye.z - dir.z * dd;
            let cy = Math.max(indGround(cx, cz) + 0.6, eye.y - dir.y * dd + IND_CAM.up);
            camera.position.set(cx, cy, cz);
            camera.lookAt(eye.x + dir.x * 60, eye.y + dir.y * 60, eye.z + dir.z * 60);
            renderer.render(scene, camera);
            camera.position.copy(eye); camera.rotation.set(rx, ry, rz); camera.updateMatrixWorld();
        }

        // ── 瞄准和动作 ──
        function indFace() { let f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); return f.normalize(); }
        // 农田：基地左边那一片，加上用泥土开出来的单格（base.tiles，2 米一格，基地哪都能开）
        function indInField(x, z) {
            let F = IND_FIELD;
            if (x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1) return true;
            if (!ind || !ind.base) return false;
            let t = indTileAt(x, z);
            return ind.base.tiles.some(function (q) { return Math.abs(q.x - t.x) < 0.01 && Math.abs(q.z - t.z) < 0.01; });
        }
        function indPlaceTile() {
            if (ind.where !== 'base') { indFlash('泥土只能在基地里开农田'); return false; }
            if (ind.base.tiles.length >= IND_TILE_CAP) { indFlash('农田开满了'); return false; }
            let f = indFace(), t = indTileAt(ind.p.x + f.x * 2.2, ind.p.z + f.z * 2.2);
            if (Math.abs(t.x) > IND_BASE.x - 1 || Math.abs(t.z) > IND_BASE.z - 1) { indFlash('这里开不了'); return false; }
            if (indInField(t.x, t.z)) { indFlash('这里已经是农田了'); return false; }
            if (!indSpotFree(t.x, t.z, 1.0)) { indFlash('这里放不下，换个空地'); return false; }
            indBagDel('dirt', 1); ind.base.tiles.push({ x: t.x, z: t.z }); ind.tileDirty = true; indSave(); indFlash('开了一格农田');
            return true;
        }
        function indSyncTiles() {
            if (!ind.tileMesh || !ind.tileDirty) return;
            indDummy();
            let T = ind.base.tiles, n = Math.min(T.length, IND_TILE_CAP);
            for (let i = 0; i < n; i++) { IND_DUMMY.position.set(T[i].x, 0.04, T[i].z); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.set(1, 1, 1); IND_DUMMY.updateMatrix(); ind.tileMesh.setMatrixAt(i, IND_DUMMY.matrix); ind.tileMesh.setColorAt(i, IND_COL.setHex(0x6d4c41)); }
            ind.tileMesh.count = n; ind.tileMesh.instanceMatrix.needsUpdate = true;
            if (ind.tileMesh.instanceColor) ind.tileMesh.instanceColor.needsUpdate = true;
            ind.tileDirty = false;
        }
        function indTileAt(x, z) { let F = IND_FIELD, t = F.tile; return { x: F.x0 + (Math.floor((x - F.x0) / t) + 0.5) * t, z: F.z0 + (Math.floor((z - F.z0) / t) + 0.5) * t }; }
        function indCropAt(x, z) { return ind.base.crops.filter(function (c) { return Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01; })[0] || null; }
        // 准星对着的东西：从玩家沿镜头方向（水平）射一条线，每样东西有一个比外观大一圈的点击范围（hit），
        // 线碰到的最近一个就是目标；什么都没碰到才退回"面前最近"（30° 以内，贴身 0.6 米内不看角度），动物没有距离优待。
        // noAnimal：不算动物（拿着工具对着动物时，找别的目标用）
        function indAim(noAnimal) {
            let R = ind, f = indFace(), cand = [];
            let consider = function (o, x, z, kind, hit, edge) {
                if (noAnimal && kind === 'animal') return;
                if (kind !== 'door' && R.where === 'base' && R.base.houses.length && indWallBlocked(R.p.x, R.p.z, x, z)) return;   // 隔着墙的不算
                let dx = x - R.p.x, dz = z - R.p.z, dist = Math.hypot(dx, dz), fd = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x);
                edge = edge || 0;   // 大东西（水池）从边上算距离
                cand.push({ kind: kind, o: o, dist: dist - edge, fd: fd - edge, lat: lat, hit: hit || 0.6 });
            };
            indFires().forEach(function (f) { consider(f, f.x, f.z, 'fire', 0.7); });
            indAnimals().forEach(function (a) { consider(a, a.x, a.z, 'animal', 0.7); });
            if (R.where === 'base') R.base.devs.forEach(function (d) { consider(d, d.x, d.z, 'dev', Math.max(0.7, IND_DEVS[d.ty].size[0] / 2 + 0.2), IND_DEVS[d.ty].size[0] > 2 ? IND_DEVS[d.ty].size[0] / 2 : 0); });
            if (R.where === 'base') R.base.cookers.forEach(function (c) { consider(c, c.x, c.z, 'cook', IND_COOK[c.ty].r + 0.4, IND_COOK[c.ty].r * 0.7); });
            if (R.where === 'base') indCooks().forEach(function (c) { let sp = indSpoutPos(c); consider(c, sp.x, sp.z, 'spout', 0.8); });
            nkAim(consider);
            if (R.where === 'trip') {
                R.nodes.forEach(function (o) { if (!o.dead) consider(o, o.x, o.z, 'node', 0.8); });
                if (!R.onRaft) (R.rafts || []).forEach(function (o) { consider(o, o.x, o.z, 'raft', 1.3, 0.8); });
                (R.tripGround || []).forEach(function (o) { consider(o, o.x, o.z, 'item', 0.5); });
            } else {
                R.base.ground.forEach(function (o) { consider(o, o.x, o.z, 'item', 0.5); });
                R.base.crops.forEach(function (c) { consider(c, c.x, c.z, 'crop', 0.6); });
                R.base.tiles.forEach(function (t) { consider(t, t.x, t.z, 'tile', 0.9); });
                let S = IND_BASE_ST, off = R.base.off;
                R.base.chests.forEach(function (c) { consider(c, c.x, c.z + 0.8, 'chest', 1.2); });
                if (!off.stove) consider(S.stove, S.stove.x, S.stove.z + 0.8, 'stove', 1.2);
                if (!off.bed) consider(S.bed, S.bed.x, S.bed.z + 1.6, 'bed', 1.6);
                if (!off.pool) consider(S.pool, S.pool.x, S.pool.z, 'pool', S.pool.r + 0.3, S.pool.r);
                if (!off.bench) consider(S.bench, S.bench.x, S.bench.z + 0.8, 'bench', 1.2);
            }
            if (R.where === 'base') R.base.houses.forEach(function (h) {
                let dr = indHouseDoor(h), L = IND_T.pickR + 0.5, hitT = -1;
                consider(h, dr.x, dr.z, 'door', 0.95);
                indHouseRects(h).forEach(function (rc) { if (rc.door) return; let t = indSegRect(R.p.x, R.p.z, R.p.x + f.x * L, R.p.z + f.z * L, rc); if (t >= 0 && (hitT < 0 || t < hitT)) hitT = t; });
                if (hitT >= 0) cand.push({ kind: 'house', o: h, dist: hitT * L, fd: hitT * L, lat: 0, hit: 1 });
            });
            let best = null, bd = 1e9;
            cand.forEach(function (c) { if (c.fd > -0.5 && c.fd <= IND_T.pickR + 0.5 && c.lat <= c.hit && c.fd < bd) { bd = c.fd; best = c; } });   // 射线碰到的，取最近
            if (best) return { kind: best.kind, o: best.o, ray: true };
            cand.forEach(function (c) {
                if (c.dist > IND_T.pickR) return;
                if (c.dist > 0.6 && c.fd / Math.max(0.01, c.dist) < IND_AIM_COS) return;
                if (c.dist < bd) { bd = c.dist; best = c; }
            });
            return best ? { kind: best.kind, o: best.o, ray: false } : null;
        }
        // 出料槽：凉了的左键取进背包；拿着钳子（背包里有钳子）烫的也能取
        function indSpoutTake(c) {
            let sp = c.C.spout, tongs = !!ind.bag.tongs, took = [], hotLeft = 0, full = false;
            c.C.spout = sp.filter(function (e) {
                let hot = e.t > 0;
                if (hot && !tongs) { hotLeft++; return true; }
                let k = hot ? e.k : IND_ITEMS_RAW[e.k].hot;
                if (indBagAdd(k, 1) > 0) { took.push(indName(k)); return false; }
                full = true; return true;
            });
            if (took.length) { indSave(); indFlash('取出了：' + took.join('、')); }
            else if (full) indFlash('背包满了');
            else if (hotLeft) indFlash('都还烫着，等凉了再取（拿钳子随时能取，一桶水能马上浇凉）');
            else indFlash('出料槽是空的');
            if (ind.panel === 'stove') ind.panelDirty = true;
            return took.length > 0;
        }
        // 拿一桶水对着出料槽右键：槽里的锭马上全凉，桶变空，炉温不变
        function indQuenchSpout(c, k) {
            if (!c.C.spout.some(function (e) { return e.t > 0; })) { indFlash('出料槽里没有烫的'); return false; }
            c.C.spout.forEach(function (e) { e.t = 0; });
            indBagDel(k, 1); indBagAdd(indEmptyKey(indContOf(k).mat), 1); indSave();
            indFlash('滋——出料槽里的锭都凉了');
            return true;
        }
        // 风箱：每个炉子单独装（现实里风箱对着一个炉子吹），拿着风箱左键点灶台／小熔炉／大窑，装上多一档「鼓风」1600°C
        function indInstallBellows(a) {
            let c = a && a.kind === 'stove' ? indCookById('stove') : a && a.kind === 'cook' ? indCookById(a.o.id) : (a && a.id !== undefined ? a : null);
            if (!c) { indFlash('风箱要装在炉子上：对着灶台、小熔炉或大窑左键'); return false; }
            if (c.C.bellows) { indFlash(IND_COOK[c.ty].name + '已经装了风箱'); return false; }
            indBagDel('bellows', 1); c.C.bellows = true; indSave();
            indFlash('风箱装好了，' + IND_COOK[c.ty].name + '多了一档「鼓风」');
            return true;
        }
        // 铃铛：拿着左键摇，30 米内跟着你的动物、基地里的动物都走到你身边
        function indRing() {
            let n = 0;
            indAnimals().forEach(function (a) {
                if (ind.where === 'trip' && !a.follow) return;
                if (Math.hypot(a.x - ind.p.x, a.z - ind.p.z) > IND_BELL_R) return;
                a.call = 12; n++;
            });
            indFlash(n ? '叮铃——' + n + ' 只动物走过来了' : '叮铃——附近没有动物');
            return true;
        }
        // 手里的东西是不是工具（稿子、铜线、钳子、剪刀）：工具永远当工具用，不拿去喂动物
        function indToolish(k) { return !!k && (!!IND_ITEMS[k].tool || k === 'wire' || k === 'tongs' || k === 'shears'); }
        // 左键：采集、拿、收菜、打开；对着空的农田格子、手里拿着种子：种下
        function indAction() {
            if (!ind || ind.over || ind.dead || ind.panel) return;
            if (ind.onRaft) return indRaftToggle(ind.onRaft);
            if (indSel() === 'bell') return indRing();
            if (indSel() === 'bellows') return indInstallBellows(indAim());
            let a = indAim();
            if (a && a.kind === 'animal' && indToolish(indSel()) && indSel() !== 'shears') {   // 稿子、铜线、钳子对着动物：找别的目标，没有就只看状态
                let b = indAim(true);
                if (b) a = b;
            }
            if (a && a.kind === 'raft') return indRaftToggle(a.o);
            if (a && a.kind === 'bomb') return nkBombAct(a.o);
            if (a && a.kind === 'node') return indGather(a.o);
            if (a && a.kind === 'item') return indPickItem(a.o);
            if (a && a.kind === 'crop' && indCropRipe(a.o)) return indHarvest(a.o);
            if (a && a.kind === 'spout') return indSpoutTake(a.o);
            if (a && a.kind === 'door') return indDoorToggle(a.o);
            if (a && a.kind === 'chest') return indPanelBox(a.o.id);
            if (a && a.kind === 'stove') return indPanelStove('stove');
            if (a && a.kind === 'cook') return indPanelStove(a.o.id);
            if (a && a.kind === 'bed') return indSleep();
            if (a && a.kind === 'bench') return indPanelBench();
            if (a && a.kind === 'fire') return indFeedFire(a.o);
            if (a && a.kind === 'animal') return indAnimalAct(a.o);
            if (a && a.kind === 'dev') return indDevAct(a.o);
            let k = indSel();
            if (ind.where === 'base' && k && IND_ITEMS[k].seed) return indPlant(k);
        }
        // 右键：对着能搬的东西，按住 1 秒收起来，没按够就松开是原来的右键（吃喝、浇水、接水）；别的东西按下就是右键
        function indRightDown() {
            if (!ind || ind.over || ind.dead || ind.panel) return;
            let f = indFurnOf(indAim());
            if (f) { ind.rh = { f: f, t: 0, done: false }; return; }
            indUse();
        }
        function indRightUp() {
            if (!ind || !ind.rh) return;
            let rh = ind.rh; ind.rh = null;
            if (!rh.done) indUse();
        }
        function indRightHoldTick(dt) {
            let rh = ind.rh; if (!rh || rh.done) return;
            let f = indFurnOf(indAim());
            if (!f || f.o !== rh.f.o || f.ty !== rh.f.ty) { ind.rh = null; return; }   // 准星移开了
            rh.t += dt;
            if (rh.t >= IND_PICK_HOLD) { rh.done = true; indPickFurn(rh.f); }
        }
        // 右键：吃喝、浇水、接水
        function indUse() {
            if (!ind || ind.over || ind.dead || ind.panel) return;
            let k = indSel(), a = indAim();
            if (a && a.kind === 'dev' && !(k && IND_ITEMS[k].dev)) return indPickDev(a.o);
            if (!k) return indSip(a);
            if (IND_ITEMS[k].dev) return indPlaceDev(k);
            if (k === 'dirt') return indPlaceTile();
            if (IND_ITEMS[k].furn) return indPlaceFurn(k);
            if (IND_ITEMS[k].house) return indPlaceHouse(k);
            if (IND_ITEMS[k].raft) return indPlaceRaft(k);
            if (IND_ITEMS[k].nuke) return nkPlaceBomb(k);
            if (IND_ITEMS[k].cook) return indPlaceCook(k);
            if (indIsEmptyCont(k)) {   // 空桶：水池接生水，海里接海水（桶是什么材质，水就装在什么材质里）
                let m = indContOf(k).mat;
                if (a && a.kind === 'pool') { let w = indFilledKey('water_raw', m); indBagDel(k, 1); indBagAdd(w, 1); indSelect(w); indFlash('接了一桶生水'); return true; }
                if (indInWater()) { let w = indFilledKey('water_sea', m); indBagDel(k, 1); indBagAdd(w, 1); indSelect(w); indFlash('接了一桶海水'); return true; }
                indFlash('到水池或海边才能接水'); return false;
            }
            if (k === 'ash' && a && a.kind === 'crop') return indFertilize(a.o);
            let kc = indContOf(k), kb = kc && kc.base;
            if ((kb === 'water_raw' || kb === 'water_boiled' || kb === 'water_sea') && a && a.kind === 'spout') return indQuenchSpout(a.o, k);
            if ((kb === 'water_raw' || kb === 'water_boiled') && a && a.kind === 'crop') return indWater(a.o, k);
            if (k === 'dry_ice') return indDryIceBucket();
            if (IND_ITEMS[k].hot) return indQuench(k);
            if (IND_ITEMS[k].eat) return indEat(k);
            if (IND_ITEMS[k].wear) return indWear(k);
            if (k === 'campfire') return indPlaceFire();
            return indSip(a);
        }
        // 手里没有能用的东西，对着水池右键喝一口生水（口渴 +10，30% 拉肚子，和桶装生水一样）；在海里喝一口海水（越喝越渴，同桶装海水）
        function indSip(a) {
            let S = ind.base.surv;
            if (ind.where === 'base' && a && a.kind === 'pool') {
                S.water = Math.min(100, S.water + 10);
                let sick = indRand() < 0.3; if (sick) ind.sickT = IND_SURV.sick;
                indFlash('喝了一口生水' + (sick ? '，肚子不舒服' : '')); return true;
            }
            if (indInWater()) { S.water = Math.max(0, S.water - 10); indFlash('喝了一口海水，越喝越渴'); return true; }
            return false;
        }
        function indEat(k) {
            let e = IND_ITEMS[k].eat, S = ind.base.surv;
            indBagDel(k, 1);
            if (e.f) S.food = Math.max(0, Math.min(100, S.food + e.f));
            if (e.w) S.water = Math.max(0, Math.min(100, S.water + e.w));
            if (e.back) indBagAdd(e.back, 1);
            let warm = false;
            if (e.hot && S.temp < 37) { S.temp = Math.min(37, S.temp + IND_HOT_SOUP); warm = true; }   // 热汤：体温立刻 +1.5°C，最多到 37
            let sick = e.sick && indRand() < e.sick;
            if (sick) ind.sickT = IND_SURV.sick;
            indFlash((e.w && !e.f ? '喝了' : '吃了') + indName(k) + (e.w < 0 ? '，越喝越渴' : '') + (warm ? '，身上暖和了' : '') + (sick ? '，肚子不舒服' : ''));
            return true;
        }
        function indGather(o) {
            let nd = IND_NODES[o.key], tool = indTool();
            if (tool < nd.tool) { indFlash(indName(o.key) + '要' + IND_TOOL_NAME[nd.tool] + '才挖得动'); return false; }
            let key = o.key === 'seeds' ? o.seed : (nd.out || o.key);
            let got = indBagAdd(key, o.n + indToolBonus(nd.tool));   // 铁稿 +1、钻石稿 +2：采一次多拿几个
            if (got <= 0) { indFlash('背包满了'); return false; }
            o.n -= got; if (o.n <= 0) { o.dead = true; ind.nodeDirty = true; }
            indFlash('+' + got + ' ' + indName(key));
            return true;
        }
        function indPickItem(o) {
            if (indBagAdd(o.k, 1) <= 0) { indFlash('背包满了'); return; }
            let G = ind.where === 'trip' ? (ind.tripGround || []) : ind.base.ground, i = G.indexOf(o); if (i >= 0) G.splice(i, 1);
            ind.itemDirty = true; indSave();
        }
        function indPlant(k) {
            let f = indFace(), x = ind.p.x + f.x * 1.4, z = ind.p.z + f.z * 1.4;
            if (!indInField(x, z)) { indFlash('种子要种在农田里'); return false; }
            let t = indTileAt(x, z);
            if (indCropAt(t.x, t.z)) { indFlash('这一格已经种了'); return false; }
            if (ind.base.crops.length >= IND_CROP_CAP) { indFlash('种满了'); return false; }
            indBagDel(k, 1);
            ind.base.crops.push({ k: IND_ITEMS[k].seed, x: t.x, z: t.z, g: 0, wet: 0, times: 0 });
            ind.cropDirty = true; indSave();
            return true;
        }
        // 一桶水浇 2.5 米内的作物，管到当天结束
        // 草木灰当肥料（右键对着有作物的农田用 1 份）：这一格这一季长得快 50%，收获后失效，不能重复施
        function indFertilize(c) {
            if (c.fert) { indFlash('已经施过肥了'); return false; }
            if (indCropRipe(c)) { indFlash('已经熟了，不用施肥'); return false; }
            indBagDel('ash', 1); c.fert = true; ind.cropDirty = true; indSave(); indFlash('施了肥，这一季长得快 50%');
            return true;
        }
        function indWater(c, k) {
            indBagDel(k, 1); indBagAdd(indEmptyKey(indContOf(k).mat), 1);
            let end = (Math.floor(ind.base.clock / IND_DAY) + 1) * IND_DAY, n = 0;
            ind.base.crops.forEach(function (o) { if (Math.hypot(o.x - c.x, o.z - c.z) <= 2.5) { o.wet = end; n++; } });
            ind.cropDirty = true; indSave();
            indFlash('浇了 ' + n + ' 棵');
            return true;
        }
        function indHarvest(c) {
            let C = IND_CROPS[c.k], y = indRoll(C.yield), s = indRoll(C.seeds);
            if (indBagAdd(c.k, y) <= 0) { indFlash('背包满了'); return false; }
            if (s > 0) indBagAdd('seed_' + c.k, s);
            c.times++; c.fert = false;   // 肥料收获后失效（番茄每结一次算一季）
            if (C.regrow && c.times < C.times) c.g = C.grow - C.regrow;   // 番茄：再长一阵还能结
            else { let i = ind.base.crops.indexOf(c); if (i >= 0) ind.base.crops.splice(i, 1); }
            ind.cropDirty = true; indSave();
            indFlash('收了 ' + y + ' 个' + C.name + (s > 0 ? '，留了 ' + s + ' 颗种子' : ''));
            return true;
        }
        // 睡觉：只在基地的床上；睡到下一个早上，精力补满；睡着的时间饱食口渴按三成掉；作物和灶台照样过时间
        function indSleep() {
            let S = ind.base.surv;
            if (!indIsNight() && S.energy > 70) { indFlash('还不困（夜里或者累了才能睡）'); return false; }
            let skip = (Math.floor(ind.base.clock / IND_DAY) + 1) * IND_DAY - ind.base.clock;
            ind.base.clock += skip;
            S.food = Math.max(0, S.food - IND_SURV.food * 0.3 * skip); S.water = Math.max(0, S.water - IND_SURV.water * 0.3 * skip);
            S.energy = 100;
            ind.base.crops.forEach(function (c) { let C = IND_CROPS[c.k]; if (indCropSeasonOK(c)) c.g = Math.min(C.grow, c.g + skip * (c.wet > ind.base.clock - skip ? 0.75 : 0.5) * (c.fert ? IND_FERT : 1)); });
            S.temp = 37; ind.sleeping = true; ind.base.fires.forEach(function (f) { indFireBurn(f, skip); }); ind.sleeping = false; ind.fireDirty = true;
            ind.base.animals.forEach(function (a) { a.food = Math.max(0, a.food - IND_ANIMAL_HUNGER * skip * 0.5); });
            ind.sleeping = true; for (let t = 0; t < skip; t += 1) indStoveTick(1); ind.sleeping = false;
            ind.cropDirty = true; indSave();
            indFlash('一觉睡到' + indClockTxt());
            return true;
        }
        // Q：在基地里把选中的东西放在脚边（永久保存）；远征里放下就是扔掉
        function indDrop() {
            if (!ind || ind.over || ind.panel) return;
            let k = indSel(); if (!k) return;
            if (IND_ITEMS[k].gas) { let f = indFace(); indReleaseGas(k, ind.p.x + f.x, ind.p.z + f.z); return; }
            if (IND_ITEMS[k].poison) { let f = indFace(); nkReleasePoison(k, ind.p.x + f.x, ind.p.z + f.z); return; }
            if (IND_ITEMS[k].cyl && indCylN(IND_ITEMS[k].cyl) > 0) { let f = indFace(); indReleaseCyl(k, ind.p.x + f.x, ind.p.z + f.z); return; }
            if (ind.where === 'trip') { indBagDel(k, 1); indFlash('扔掉了 1 个' + indName(k)); return; }
            if (ind.base.ground.length >= IND_ITEM_CAP) { indFlash('地上放太多了'); return; }
            indBagDel(k, 1);
            let a = ind.base.ground.length * 2.399, rr = 0.25 * Math.sqrt(ind.base.ground.length % 12), f = indFace();
            let x = ind.p.x + f.x * 1.0 + Math.cos(a) * rr, z = ind.p.z + f.z * 1.0 + Math.sin(a) * rr;
            x = Math.max(-IND_BASE.x + 0.5, Math.min(IND_BASE.x - 0.5, x)); z = Math.max(-IND_BASE.z + 0.5, Math.min(IND_BASE.z - 0.5, z));
            ind.base.ground.push({ k: k, x: x, z: z });
            ind.itemDirty = true; indSave();
        }

        // ── 电 ──
        function indDev(id) { return ind.base.devs.filter(function (d) { return d.id === id; })[0] || null; }
        // 灶台、小熔炉、大窑都算"灶台"：发电机、电炉、压力机、电解熔融盐、氢气碰火的判定都看它们
        function indNearStove(x, z, r) { return indCooks().some(function (c) { return Math.hypot(x - c.x, z - c.z) <= r + (c.ty === 'kiln' ? 1 : 0); }); }
        function indHeatNear(x, z, r) { let t = 0, f = 0; indCooks().forEach(function (c) { if (Math.hypot(x - c.x, z - c.z) <= r + (c.ty === 'kiln' ? 1 : 0)) { t = Math.max(t, c.C.temp); f = Math.max(f, c.C.fire); } }); return { temp: t, fire: f }; }
        function indSrcVolt(d) {
            if (d.ty === 'bank') return d.u > 0 ? d.bats * IND_BAT_V : 0;
            if (d.ty === 'gen') return indHeatNear(d.x, d.z, IND_GEN_R).fire >= 2 ? IND_DEVS.gen.volt : 0;
            if (IND_DEV_VOLT[d.ty]) return IND_DEV_VOLT[d.ty](d);
            return 0;
        }
        // 每帧：按电线算电压；超过额定就炸；够电压、开着、电池有电就工作并耗电
        function indElecTick(dt) {
            if (ind.where !== 'base') return;
            let B = ind.base, booms = [];
            B.devs.forEach(function (d) { d.pw = false; });
            B.wires.forEach(function (w) {
                let s = indDev(w[0]), d = indDev(w[1]); if (!s || !d) return;
                let D = IND_DEVS[d.ty], V = indSrcVolt(s);
                if (V > D.rated + 1e-6) { booms.push(d); return; }
                d.v = V;
                if (!d.on || V < D.minV) return;
                if (d.ty === 'el' && indElRecipe(d, V) < 0) return;   // 电解槽没活干不耗电
                if (d.ty === 'comp' && !indCompBusy(d)) return;   // 压缩机、压力机也是有活干才耗电
                if (d.ty === 'press' && !indPressBusy(d)) return;
                if (IND_DEV_BUSY[d.ty] && !IND_DEV_BUSY[d.ty](d)) return;
                if (s.ty === 'bank') { if (s.u <= 0) return; s.u = Math.max(0, s.u - D.draw * dt); }
                d.pw = true;
            });
            booms.forEach(function (d) { if (ind && !ind.over && ind.where === 'base' && indDev(d.id)) indBoom(d.x, d.z, 0, '电压太高，设备炸了'); });
            if (!ind || ind.over || ind.where !== 'base') return;
            B.devs.forEach(function (d) { if (d.ty === 'el') indElTick(d, dt); else if (d.ty === 'comp') indCompTick(d, dt); else if (d.ty === 'press') indPressTick(d, dt); else if (IND_DEV_TICK[d.ty]) IND_DEV_TICK[d.ty](d, dt); });
            if (!ind || ind.over || ind.where !== 'base') return;
            if (B.devs.some(function (d) { return d.ty === 'pump' && d.pw; })) {
                let end = (Math.floor(B.clock / IND_DAY) + 1) * IND_DAY;
                B.crops.forEach(function (c) { if (c.wet < end) { c.wet = end; ind.cropDirty = true; } });
            }
            ind.devDirty = true;
        }
        // 爆炸：3 米内基地里的东西（设备、电线、地上的东西、篝火、作物）全没了，仓库箱不动；人在范围里扣 40 血
        // 爆炸伤害按离中心的距离：≤ 1 米 150，范围边上 60，中间线性递减；防爆服 −50%、防爆头盔 −20%（只给硬核）
        const IND_BOOM_NEAR = 150, IND_BOOM_EDGE = 60, IND_BOOM_CLOSE = 1;
        function indBoomDmg(d, R, near, close) { near = near || IND_BOOM_NEAR; close = close || IND_BOOM_CLOSE; if (d > R) return 0; if (d <= close || R <= close) return near; return near - (near - IND_BOOM_EDGE) * (d - close) / (R - close); }
        function indBlastCut() { let c = 0; Object.keys(ind.base.wear).forEach(function (sl) { c += IND_ITEMS[ind.base.wear[sl]].blast || 0; }); return Math.min(0.9, c); }
        function indBoomHurt(x, z, R, why) {
            let d = Math.hypot(ind.p.x - x, ind.p.z - z), dmg = indBoomDmg(d, R) * (1 - indBlastCut());
            if (dmg <= 0 || !indHard()) return false;
            return indHurt(dmg, 'boom', (why || '爆炸') + '，离爆炸点 ' + d.toFixed(1) + ' 米' + (indBlastCut() > 0 ? '（穿了防爆装备）' : ''), true);
        }
        function indBoom(x, z, rad, why) {
            let B = ind.base, R = rad || IND_BOOM_R, gone = {};
            ind.lastBoom = { x: x, z: z, R: R };
            B.devs = B.devs.filter(function (d) { if (Math.hypot(d.x - x, d.z - z) <= R) { gone[d.id] = 1; return false; } return true; });
            B.wires = B.wires.filter(function (w) { return !gone[w[0]] && !gone[w[1]]; });
            let powder = nkPowderNear(x, z, R);   // 地上的火药碰到爆炸也炸
            B.ground = B.ground.filter(function (g) { return Math.hypot(g.x - x, g.z - z) > R; });
            B.fires = B.fires.filter(function (f) { return Math.hypot(f.x - x, f.z - z) > R; });
            B.crops = B.crops.filter(function (c) { return Math.hypot(c.x - x, c.z - z) > R; });
            B.cookers = B.cookers.filter(function (c) { return Math.hypot(c.x - x, c.z - z) > R; }); ind.furnDirty = true;   // 小熔炉、大窑也会被炸掉（连里面的东西）
            B.houses = B.houses.filter(function (h) { let b = indHouseBox(h); return !(x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1); }); ind.furnDirty = true;   // 炸在房子里或贴着墙，房子也塌了
            if (ind.wirePend && gone[ind.wirePend]) ind.wirePend = null;
            ind.itemDirty = ind.cropDirty = ind.fireDirty = ind.devDirty = ind.wireDirty = true;
            indBoomFx(x, z);
            indSave();
            if (Math.hypot(ind.p.x - x, ind.p.z - z) <= R && indHard()) {
                if (indBoomHurt(x, z, R, why)) return;
            }
            if (powder.length) nkChain(powder);
            indFlash('轰！');
        }
        function indBoomFx(x, z) {
            let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(1, 12, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0xff6d00, transparent: true, opacity: 0.7 })));
            m.position.set(x, 1, z); indAdd(m); ind.booms = ind.booms || []; ind.booms.push({ m: m, t: 0 });
        }
        function indBoomTick(dt) {
            (ind.booms || []).forEach(function (b) { b.t += dt; b.m.scale.setScalar(1 + b.t * 6); b.m.material.opacity = Math.max(0, 0.7 - b.t * 1.4); b.m.visible = b.t < 0.5; });
            if (ind.booms) ind.booms = ind.booms.filter(function (b) { return b.t < 0.5; });
        }
        function indPlaceDev(k) {
            if (ind.where !== 'base') { indFlash('设备只能放在基地里'); return false; }
            if (ind.base.devs.length >= IND_DEV_CAP) { indFlash('设备太多了'); return false; }
            let f = indFace(), x = ind.p.x + f.x * 1.6, z = ind.p.z + f.z * 1.6;
            x = Math.max(-IND_BASE.x + 0.8, Math.min(IND_BASE.x - 0.8, x)); z = Math.max(-IND_BASE.z + 0.8, Math.min(IND_BASE.z - 0.8, z));
            if (indCooks().some(function (c) { let sp = indSpoutPos(c); return Math.hypot(x - sp.x, z - sp.z) < 1.2; })) { indFlash('这里是出料槽的位置，换个地方'); return false; }
            if (IND_ITEMS[k].dev === 'reactor' && !indSpotFree(x, z, 2.2)) { indFlash('反应堆占 3×3 米，这里放不下，换个空地'); return false; }
            indBagDel(k, 1);
            ind.base.devs.push({ id: ++ind.base.dseq, ty: IND_ITEMS[k].dev, x: x, z: z, bats: 0, u: 0, on: true, ft: 20, st: {} });
            ind.devDirty = true; indSave(); indFlash('放好了' + indName(k) + '（拿铜线点电源再点它，接上电）');
            return true;
        }
        // ── 房子：墙是几块薄长方形（门口留一个缺口，门关着时缺口里再放一块），人、瞄准、放东西都按这几块算 ──
        function indHouseDim(h) { let D = IND_HOUSE[h.ty], sw = h.side >= 2; return { w: sw ? D.d : D.w, d: sw ? D.w : D.d }; }
        function indHouseBox(h) { let m = indHouseDim(h); return { x0: h.x - m.w / 2, x1: h.x + m.w / 2, z0: h.z - m.d / 2, z1: h.z + m.d / 2 }; }
        function indHouseDoor(h) { let b = indHouseBox(h); return h.side === 0 ? { x: h.x, z: b.z1 } : h.side === 1 ? { x: h.x, z: b.z0 } : h.side === 2 ? { x: b.x1, z: h.z } : { x: b.x0, z: h.z }; }
        function indHouseRects(h) {
            let b = indHouseBox(h), T = IND_HOUSE_T / 2, G = IND_HOUSE_DOOR / 2, L = 0.08, R = [];
            [[0, b.z1, 'x'], [1, b.z0, 'x'], [2, b.x1, 'z'], [3, b.x0, 'z']].forEach(function (w) {
                let horiz = w[2] === 'x', c = w[1], a0 = horiz ? b.x0 - T : b.z0 - T, a1 = horiz ? b.x1 + T : b.z1 + T, mid = horiz ? h.x : h.z;
                let mk = function (u0, u1, e, door) { R.push(horiz ? { x0: u0, x1: u1, z0: c - e, z1: c + e, door: !!door } : { x0: c - e, x1: c + e, z0: u0, z1: u1, door: !!door }); };
                if (h.side !== w[0]) { mk(a0, a1, T); return; }
                mk(a0, mid - G, T); mk(mid + G, a1, T);
                if (!h.open) mk(mid - G, mid + G, L, true);
            });
            return R;
        }
        function indHouseAt(x, z) { return ind.base.houses.filter(function (h) { let b = indHouseBox(h); return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; })[0] || null; }
        function indRectDist(x, z, rc) { let dx = x - Math.max(rc.x0, Math.min(rc.x1, x)), dz = z - Math.max(rc.z0, Math.min(rc.z1, z)); return Math.hypot(dx, dz); }
        // 线段 (ax,az)→(bx,bz) 碰到长方形的位置（0～1），没碰到 -1
        function indSegRect(ax, az, bx, bz, rc) {
            let t0 = 0, t1 = 1, d = [bx - ax, bz - az], lo = [rc.x0, rc.z0], hi = [rc.x1, rc.z1], a = [ax, az];
            for (let i = 0; i < 2; i++) {
                if (Math.abs(d[i]) < 1e-9) { if (a[i] < lo[i] || a[i] > hi[i]) return -1; continue; }
                let u0 = (lo[i] - a[i]) / d[i], u1 = (hi[i] - a[i]) / d[i];
                if (u0 > u1) { let q = u0; u0 = u1; u1 = q; }
                t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
                if (t0 > t1) return -1;
            }
            return t0;
        }
        function indWallBlocked(ax, az, bx, bz) {
            return ind.base.houses.some(function (h) { return indHouseRects(h).some(function (rc) { return indSegRect(ax, az, bx, bz, rc) >= 0; }); });
        }
        function indHouseCollide(p) {
            let rs = []; ind.base.houses.forEach(function (h) { rs = rs.concat(indHouseRects(h)); });
            for (let pass = 0; pass < 3; pass++) rs.forEach(function (rc) {
                let cx = Math.max(rc.x0, Math.min(rc.x1, p.x)), cz = Math.max(rc.z0, Math.min(rc.z1, p.z)), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
                if (d >= IND_HOUSE_R) return;
                if (d > 1e-6) { p.x = cx + dx / d * IND_HOUSE_R; p.z = cz + dz / d * IND_HOUSE_R; return; }
                let o = [p.x - rc.x0, rc.x1 - p.x, p.z - rc.z0, rc.z1 - p.z], m = Math.min.apply(null, o), i = o.indexOf(m);
                if (i === 0) p.x = rc.x0 - IND_HOUSE_R; else if (i === 1) p.x = rc.x1 + IND_HOUSE_R; else if (i === 2) p.z = rc.z0 - IND_HOUSE_R; else p.z = rc.z1 + IND_HOUSE_R;
            });
        }
        // 屋里的东西：中心点落在房子里的家具、设备、农田、作物、篝火、地上的东西
        function indHouseHas(h) {
            let b = indHouseBox(h), B = ind.base, S = IND_BASE_ST, n = 0;
            let ins = function (o) { if (o.x > b.x0 && o.x < b.x1 && o.z > b.z0 && o.z < b.z1) n++; };
            ['stove', 'bed', 'bench', 'pool'].forEach(function (k) { if (!B.off[k]) ins(S[k]); });
            [B.chests, B.cookers, B.devs, B.tiles, B.crops, B.fires, B.ground].forEach(function (L) { L.forEach(ins); });
            return n;
        }
        function indHouseFireIn(h) {
            let b = indHouseBox(h), ins = function (o) { return o.x > b.x0 && o.x < b.x1 && o.z > b.z0 && o.z < b.z1 && Math.hypot(o.x - ind.p.x, o.z - ind.p.z) < IND_HOUSE_FIRE; };
            return indFires().some(function (f) { return f.fuel > 0 && ins(f); }) || indCooks().some(function (c) { return c.C.fire > 0 && ins(c); });
        }
        function indDoorToggle(h) {
            h.open = !h.open; ind.furnDirty = true; indSave(); indFlash(h.open ? '门开了' : '门关了');
            return true;
        }
        // 放房子：门朝着你，房子放在面前；整块地方要是空的（不压家具、农田、出发门，不贴着人）
        function indHouseFree(h) {
            let b = indHouseBox(h), B = ind.base, S = IND_BASE_ST, ok = true, m = 0.5;
            if (b.x0 < -IND_BASE.x + 0.5 || b.x1 > IND_BASE.x - 0.5 || b.z0 < -IND_BASE.z + 0.5 || b.z1 > IND_BASE.z - 0.5) return false;
            let box = { x0: b.x0 - m, x1: b.x1 + m, z0: b.z0 - m, z1: b.z1 + m };
            let hit = function (o, r) { if (indRectDist(o.x, o.z, box) < r) ok = false; };
            [['stove', 1.5], ['bed', 2.0], ['bench', 1.4], ['pool', S.pool.r + 0.3]].forEach(function (q) { if (!B.off[q[0]]) hit(S[q[0]], q[1]); });
            B.chests.forEach(function (c) { hit(c, 1.2); });
            B.cookers.forEach(function (c) { hit(c, IND_COOK[c.ty].r + 0.2); let sp = indSpoutPos({ ty: c.ty, x: c.x, z: c.z }); hit(sp, 0.8); });
            B.devs.forEach(function (d) { hit(d, 0.8); });
            B.tiles.forEach(function (t) { hit(t, 1.0); });
            B.fires.forEach(function (f) { hit(f, 0.8); });
            B.crops.forEach(function (c) { hit(c, 0.5); });
            B.ground.forEach(function (g) { hit(g, 0.5); });
            B.houses.forEach(function (o) { if (o !== h) { let q = indHouseBox(o); if (b.x0 < q.x1 + 1 && b.x1 > q.x0 - 1 && b.z0 < q.z1 + 1 && b.z1 > q.z0 - 1) ok = false; } });
            let F = IND_FIELD; if (b.x0 < F.x1 + 0.5 && b.x1 > F.x0 - 0.5 && b.z0 < F.z1 + 0.5 && b.z1 > F.z0 - 0.5) ok = false;
            if (b.x1 > S.gate.x - 4 && b.x0 < S.gate.x + 4 && b.z0 < -IND_BASE.z + 5) ok = false;
            [{ x: 0, z: 4 }, { x: 0, z: -IND_BASE.z + 4 }].forEach(function (q) { hit(q, 1.5); });
            if (indRectDist(ind.p.x, ind.p.z, box) < 0.3) ok = false;
            return ok;
        }
        function indPlaceHouse(k) {
            if (ind.where !== 'base') { indFlash('只能放在基地里'); return false; }
            let B = ind.base, ty = IND_ITEMS[k].house;
            if (B.houses.length >= IND_HOUSE_CAP) { indFlash('房子太多了'); return false; }
            let f = indFace(), alongZ = Math.abs(f.z) >= Math.abs(f.x), sx = alongZ ? 0 : (f.x > 0 ? 1 : -1), sz = alongZ ? (f.z > 0 ? 1 : -1) : 0;
            let h = { id: 0, ty: ty, x: 0, z: 0, side: alongZ ? (sz > 0 ? 1 : 0) : (sx > 0 ? 3 : 2), open: false };
            let m = indHouseDim(h), ext = (alongZ ? m.d : m.w) / 2 + 1.2;
            h.x = ind.p.x + sx * ext; h.z = ind.p.z + sz * ext;
            h.x = Math.round(h.x * 2) / 2; h.z = Math.round(h.z * 2) / 2;
            if (!indHouseFree(h)) { indFlash('这里放不下，换个空地'); return false; }
            h.id = ++B.cid; indBagDel(k, 1); B.houses.push(h);
            ind.furnDirty = true; indSave(); indFlash('放好了' + IND_HOUSE[ty].name + '：左键开关门');
            return true;
        }
        function indPickHouse(h) {
            let k = 'house_' + h.ty;
            if (indHouseHas(h) > 0) { indFlash('先把里面的东西搬出来'); return false; }
            if (indFits(ind.bag, IND_BAG_SLOTS, k, 1) < 1) { indFlash('背包满了'); return false; }
            ind.base.houses = ind.base.houses.filter(function (x) { return x !== h; });
            indBagAdd(k, 1); ind.furnDirty = true; indSave(); indFlash('收起了' + IND_HOUSE[h.ty].name);
            return true;
        }
        // 小熔炉、大窑：放在面前，不能压在别的东西上；左键打开
        function indSpotFree(x, z, r, skip) {
            let S = IND_BASE_ST, B = ind.base, ok = true;
            B.houses.forEach(function (h) { indHouseRects(h).forEach(function (rc) { if (indRectDist(x, z, rc) < r + 0.1) ok = false; }); });
            [['stove', 1.5], ['bed', 2.0], ['bench', 1.4], ['pool', S.pool.r + 0.3]].forEach(function (p) { if (!B.off[p[0]] && Math.hypot(x - S[p[0]].x, z - S[p[0]].z) < r + p[1]) ok = false; });
            B.chests.forEach(function (c) { if (c !== skip && Math.hypot(x - c.x, z - c.z) < r + 1.2) ok = false; });
            if (Math.abs(x - S.gate.x) < 4 + r && z < -IND_BASE.z + 4 + r) ok = false;
            if (indInField(x, z)) ok = false;
            B.cookers.forEach(function (c) { if (c !== skip && Math.hypot(x - c.x, z - c.z) < r + IND_COOK[c.ty].r + 0.2) ok = false; });
            B.devs.forEach(function (d) { if (Math.hypot(x - d.x, z - d.z) < r + 0.8) ok = false; });
            return ok;
        }
        // ── 搬东西：长按右键 1 秒把仓库箱、灶台、床、工作台、水池、小熔炉、大窑收进背包，右键放在面前（不能压在别的东西上）；出发门不能搬 ──
        function indFurnOf(a) {
            if (!a) return null;
            if (a.kind === 'chest') return { ty: 'chest', o: a.o };
            if (a.kind === 'cook') return { ty: a.o.ty, o: a.o };
            if (a.kind === 'tile') return { ty: 'tile', o: a.o };
            if (a.kind === 'door' || a.kind === 'house') return { ty: 'house', o: a.o };
            if (a.kind === 'bomb') return { ty: 'bomb', o: a.o };
            if (a.kind === 'stove' || a.kind === 'bed' || a.kind === 'bench') return { ty: a.kind, o: null };   // 水池不能搬
            return null;
        }
        function indFurnName(ty, o) { return ty === 'bomb' ? '原子弹' : ty === 'house' ? (o ? IND_HOUSE[o.ty].name : '房子') : ty === 'tile' ? '农田' : ty === 'chest' ? '仓库箱' : ty === 'bed' ? '床' : ty === 'bench' ? '工作台' : ty === 'pool' ? '水池' : IND_COOK[ty].name; }
        function indFurnHot(ty, o) { let S = ty === 'stove' ? ind.base.stove : o; if (S && !Array.isArray(S.spout)) S.spout = []; return !!S && (S.fire > 0 || !!S.cook || S.temp > 60 || S.spout.some(function (e) { return e.t > 0; })); }   // 出料槽里还有烫的也算
        function indPickFurn(f) {
            let B = ind.base, ty = f.ty, key, id;
            if (ty === 'house') return indPickHouse(f.o);
            if (ty === 'bomb') return nkPickBomb(f.o);
            if (ty === 'tile') {   // 空农田收回：还 1 份泥土
                if (indCropAt(f.o.x, f.o.z)) { indFlash('上面种着东西'); return false; }
                if (indFits(ind.bag, IND_BAG_SLOTS, 'dirt', 1) < 1) { indFlash('背包满了'); return false; }
                B.tiles = B.tiles.filter(function (t) { return t !== f.o; }); indBagAdd('dirt', 1); ind.tileDirty = true; indSave(); indFlash('收回了一格农田');
                return true;
            }
            if (indFurnHot(ty, f.o) && (ty === 'stove' || IND_COOK[ty])) { indFlash('还烫着'); return false; }
            if (ty === 'chest' || ty === 'stove' || IND_COOK[ty]) {
                id = ++B.cid; key = 'inst:' + id;
                if (indFits(ind.bag, IND_BAG_SLOTS, key, 1) < 1) { indFlash('背包满了'); return false; }
                if (ty === 'chest') { B.carried[id] = { ty: 'chest', big: f.o.big, lead: !!f.o.lead, items: f.o.items }; B.chests = B.chests.filter(function (c) { return c !== f.o; }); }
                else if (ty === 'stove') { B.carried[id] = { ty: 'stove', st: B.stove }; B.stove = { items: {}, out: {}, fuel: 0, fire: 0, temp: 20, cook: null, ashT: 0 }; B.off.stove = true; }
                else { let c = f.o, st = {}; ['items', 'out', 'fuel', 'fire', 'temp', 'cook', 'ashT', 'bellows', 'spout'].forEach(function (k) { st[k] = c[k]; }); B.carried[id] = { ty: ty, st: st }; B.cookers = B.cookers.filter(function (x) { return x !== c; }); }
            } else {
                key = 'furn_' + ty;
                if (indFits(ind.bag, IND_BAG_SLOTS, key, 1) < 1) { indFlash('背包满了'); return false; }
                B.off[ty] = true;
            }
            let big = ty === 'chest' && f.o.big; B.box = (B.chests.filter(function (c) { return c.big; })[0] || { items: {} }).items;
            indBagAdd(key, 1); ind.furnDirty = true; if (ind.panel) indPanelClose();
            indSave(); indFlash('收起了' + indFurnName(ty) + (big ? '（里面的东西一起）' : ''));
            return true;
        }
        function indPlaceFurn(k) {
            if (ind.where !== 'base') { indFlash('只能放在基地里'); return false; }
            let B = ind.base, d = IND_ITEMS[k], ty = d.furn, pay = d.inst ? B.carried[k.slice(5)] : null, r = IND_FURN_R[ty];
            if (ty === 'chest' && B.chests.length >= 20) { indFlash('箱子太多了'); return false; }
            if (IND_COOK[ty] && ty !== 'stove' && B.cookers.length >= IND_COOK_CAP) { indFlash('炉子太多了'); return false; }
            let f = indFace(), x = ind.p.x + f.x * (r + 1.2), z = ind.p.z + f.z * (r + 1.2);
            x = Math.max(-IND_BASE.x + r, Math.min(IND_BASE.x - r, x)); z = Math.max(-IND_BASE.z + r, Math.min(IND_BASE.z - r, z));
            if (!indSpotFree(x, z, r)) { indFlash('这里放不下，换个空地'); return false; }
            indBagDel(k, 1);
            if (ty === 'chest') B.chests.push({ id: pay ? +k.slice(5) : ++B.cid, x: x, z: z, big: pay ? pay.big : false, lead: pay ? !!pay.lead : !!d.lead, items: pay ? pay.items : {} });
            else if (ty === 'stove') { B.off.stove = false; B.pos.stove = { x: x, z: z }; if (pay) B.stove = pay.st; indApplyPos(B); }
            else if (ty === 'bed' || ty === 'bench' || ty === 'pool') { B.off[ty] = false; B.pos[ty] = { x: x, z: z }; indApplyPos(B); }
            else B.cookers.push(Object.assign({ id: ++B.cseq, ty: ty, x: x, z: z }, pay ? pay.st : { items: {}, out: {}, fuel: 0, fire: 0, temp: 20, cook: null, ashT: 0 }));
            if (pay) delete B.carried[k.slice(5)];
            B.box = (B.chests.filter(function (c) { return c.big; })[0] || { items: {} }).items;
            ind.furnDirty = true; indSave(); indFlash('放好了' + indFurnName(ty));
            return true;
        }
        function indPlaceCook(k) {
            if (ind.where !== 'base') { indFlash('只能放在基地里'); return false; }
            let ty = IND_ITEMS[k].cook, D = IND_COOK[ty];
            if (ind.base.cookers.length >= IND_COOK_CAP) { indFlash('炉子太多了'); return false; }
            let f = indFace(), x = ind.p.x + f.x * (D.r + 1.2), z = ind.p.z + f.z * (D.r + 1.2);
            x = Math.max(-IND_BASE.x + D.r, Math.min(IND_BASE.x - D.r, x)); z = Math.max(-IND_BASE.z + D.r, Math.min(IND_BASE.z - D.r, z));
            if (!indSpotFree(x, z, D.r)) { indFlash('这里放不下，换个空地'); return false; }
            indBagDel(k, 1);
            ind.base.cookers.push({ id: ++ind.base.cseq, ty: ty, x: x, z: z, items: {}, out: {}, fuel: 0, fire: 0, temp: 20, cook: null, ashT: 0 });
            ind.furnDirty = true; indSave(); indFlash('放好了' + D.name + '：左键打开，加燃料调火候');
            return true;
        }
        // 家具（可搬的）一起画：位置变了、被收起来、新放下，都在这里重画
        function indFurnList() {
            let L = [], S = IND_BASE_ST, B = ind.base;
            ['stove', 'bed', 'bench', 'pool'].forEach(function (k) { if (!B.off[k]) L.push({ key: k, ty: k, x: S[k].x, z: S[k].z }); });
            B.chests.forEach(function (c) { L.push({ key: 'chest' + c.id, ty: 'chest', big: c.big, lead: c.lead, x: c.x, z: c.z }); });
            B.cookers.forEach(function (c) { L.push({ key: 'cook' + c.id, ty: c.ty, x: c.x, z: c.z }); });
            B.houses.forEach(function (h) { L.push({ key: 'house' + h.id, ty: 'house', h: h, x: h.x, z: h.z, sig: h.ty + h.side + (h.open ? 'o' : 'c') }); });
            return L;
        }
        function indFurnBuild(f) {
            let m = [], x = f.x, z = f.z;
            if (f.ty === 'house') return indHouseBuild(f);
            if (f.ty === 'chest') {
                if (f.big) { m.push(indBox(2.2, 1.2, 1.6, 0x455a64, x, 0.6, z)); m.push(indSign('仓库箱', x, 2.2, z, 2.4, 0.6)); }
                else if (f.lead) { m.push(indBox(1.6, 1.0, 1.2, 0x546e7a, x, 0.5, z)); m.push(indSign('铅箱', x, 1.9, z, 2.0, 0.5)); }
                else { m.push(indBox(1.6, 1.0, 1.2, 0x6d4c41, x, 0.5, z)); m.push(indSign('仓库箱', x, 1.9, z, 2.0, 0.5)); }
            } else if (f.ty === 'stove') { m.push(indBox(2.4, 1.0, 1.6, 0xb71c1c, x, 0.5, z)); m.push(indSign('灶台', x, 2.2, z, 2.4, 0.6)); }
            else if (f.ty === 'bed') { m.push(indBox(2.2, 0.5, 3.2, 0x5c6bc0, x, 0.25, z)); m.push(indSign('床', x, 1.8, z, 2, 0.5)); }
            else if (f.ty === 'bench') { m.push(indBox(2.4, 1.0, 1.4, 0xa1887f, x, 0.5, z)); m.push(indSign('工作台', x, 2.2, z, 2.4, 0.6)); }
            else if (f.ty === 'pool') {
                let r = IND_BASE_ST.pool.r, pool = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(r, r, 0.15, 24)), indMat(new THREE.MeshLambertMaterial({ color: 0x29b6f6 })));
                pool.position.set(x, 0.08, z); m.push(indAdd(pool)); m.push(indSign('水池', x, 1.6, z, 1.8, 0.45));
            } else { let D = IND_COOK[f.ty]; m.push(indBox(D.size[0], D.size[1], D.size[2], D.col, x, D.size[1] / 2, z)); m.push(indSign(D.name, x, D.size[1] + 0.8, z, 2.4, 0.6)); }
            if (IND_COOK[f.ty]) {   // 炉子外面带一个出料槽（石槽，不受炉温影响）：冶炼出来的烫锭进这里
                let sp = indSpoutPos({ ty: f.ty, x: x, z: z });
                m.push(indBox(1.1, 0.35, 0.8, 0x607d8b, sp.x, 0.18, sp.z)); m.push(indBox(1.1, 0.18, 0.1, 0x37474f, sp.x, 0.42, sp.z - 0.4)); m.push(indBox(1.1, 0.18, 0.1, 0x37474f, sp.x, 0.42, sp.z + 0.4));
                m.push(indSign('出料槽', sp.x, 1.0, sp.z, 1.3, 0.38));
            }
            return m;
        }
        function indHouseBuild(f) {
            let h = f.h, D = IND_HOUSE[h.ty], b = indHouseBox(h), m = [], fx = { roof: null, walls: [] };
            let box = function (rc, y0, y1, col, wall) {
                let o = indBox(rc.x1 - rc.x0, y1 - y0, rc.z1 - rc.z0, col, (rc.x0 + rc.x1) / 2, (y0 + y1) / 2, (rc.z0 + rc.z1) / 2);
                o.material.transparent = true; if (wall) fx.walls.push(o); m.push(o); return o;
            };
            m.push(indBox(b.x1 - b.x0, 0.05, b.z1 - b.z0, 0xd7ccc8, h.x, 0.03, h.z));
            indHouseRects(h).forEach(function (rc) { box(rc, 0, rc.door ? 2.2 : IND_HOUSE_H, rc.door ? 0x4e342e : D.wall, true); });
            let dr = indHouseDoor(h), G = IND_HOUSE_DOOR / 2, T = IND_HOUSE_T / 2, hz = h.side < 2;
            box(hz ? { x0: dr.x - G, x1: dr.x + G, z0: dr.z - T, z1: dr.z + T } : { x0: dr.x - T, x1: dr.x + T, z0: dr.z - G, z1: dr.z + G }, 2.2, IND_HOUSE_H, D.wall, true);   // 门楣
            if (h.open) box(hz ? { x0: dr.x - G, x1: dr.x - G + 0.12, z0: dr.z, z1: dr.z + 1.7 } : { x0: dr.x, x1: dr.x + 1.7, z0: dr.z - G, z1: dr.z - G + 0.12 }, 0, 2.2, 0x4e342e, true);   // 开着的门板
            fx.roof = box({ x0: b.x0 - 0.4, x1: b.x1 + 0.4, z0: b.z0 - 0.4, z1: b.z1 + 0.4 }, IND_HOUSE_H, IND_HOUSE_H + 0.25, D.roof, false);
            m.push(indSign(D.name, h.x, IND_HOUSE_H + 1.4, h.z, 2.4, 0.6));
            ind.houseFx = ind.houseFx || {}; ind.houseFx[f.key] = fx;
            return m;
        }
        // 人在屋里：屋顶和墙变半透明，镜头看得到里面
        function indHouseFadeTick(dt) {
            if (!ind.houseFx || ind.where !== 'base') return;
            let k = Math.min(1, dt * 8);
            ind.base.houses.forEach(function (h) {
                let fx = ind.houseFx['house' + h.id]; if (!fx || !ind.furnMesh['house' + h.id]) return;
                let inside = indHouseAt(ind.p.x, ind.p.z) === h, tr = inside ? 0.1 : 1, tw = inside ? 0.45 : 1;
                fx.roof.material.opacity += (tr - fx.roof.material.opacity) * k;
                fx.walls.forEach(function (o) { o.material.opacity += (tw - o.material.opacity) * k; });
            });
        }
        function indSyncFurn() {
            if (!ind.furnDirty || ind.where !== 'base') return;
            ind.furnDirty = false; ind.furnMesh = ind.furnMesh || {};
            let want = {};
            indFurnList().forEach(function (f) { want[f.key] = f; });
            Object.keys(ind.furnMesh).forEach(function (key) {
                let w = want[key], e = ind.furnMesh[key];
                if (w && e.x === w.x && e.z === w.z && e.sig === w.sig) return;
                e.m.forEach(function (o) { scene.remove(o); let i = ind.objs.indexOf(o); if (i >= 0) ind.objs.splice(i, 1); });
                delete ind.furnMesh[key];
                if (ind.badges) { if (ind.badges[key]) ind.badges[key].mesh.visible = false; if (ind.badges['cook' + key]) ind.badges['cook' + key].mesh.visible = false; let sid = key.indexOf('cook') === 0 ? key.slice(4) : key; if (ind.badges['spout' + sid]) ind.badges['spout' + sid].mesh.visible = false; }
            });
            Object.keys(want).forEach(function (key) { if (!ind.furnMesh[key]) ind.furnMesh[key] = { x: want[key].x, z: want[key].z, sig: want[key].sig, m: indFurnBuild(want[key]) }; });
        }
        function indPickDev(d) {
            let k = 'dev_' + d.ty; if (indBagAdd(k, 1) <= 0) { indFlash('背包满了'); return false; }
            if (d.ty === 'bank') { let b = Math.ceil(d.u / IND_BAT_U - 1e-9); if (b > 0) indBagAdd('battery', b); }
            if (d.st) Object.keys(d.st).forEach(function (k) { indBoxAdd(k, d.st[k]); });   // 电解槽里的东西放回仓库箱
            if (d.rods) d.rods.forEach(function (r) { indBoxAdd(r.spent ? 'rod_spent' : nkRodKey(r), 1); });   // 反应堆里的燃料棒
            if (d.cy) indBoxAdd(d.cy, 1);
            ind.base.devs = ind.base.devs.filter(function (x) { return x !== d; });
            ind.base.wires = ind.base.wires.filter(function (w) { return w[0] !== d.id && w[1] !== d.id; });
            if (ind.wirePend === d.id) ind.wirePend = null;
            ind.devDirty = ind.wireDirty = true; indSave(); indFlash('收起了' + IND_DEVS[d.ty].name);
            return true;
        }
        // 左键对着设备：拿铜线就接线；电池组拿电池就装；用电器就开关
        function indDevAct(d) {
            let k = indSel(), D = IND_DEVS[d.ty];
            if (k === 'wire') {
                if (D.nowire) { indFlash(D.name + '不用接线'); return false; }
                if (!ind.wirePend) { ind.wirePend = d.id; ind.devDirty = true; indFlash('选了' + D.name + '，再点另一个'); return true; }
                if (ind.wirePend === d.id) { ind.wirePend = null; ind.devDirty = true; indFlash('取消了'); return true; }
                let a = indDev(ind.wirePend); ind.wirePend = null; ind.devDirty = true;
                if (!a) return false;
                let src = D.src ? d : a, dev = D.src ? a : d;
                if (!IND_DEVS[src.ty].src || IND_DEVS[dev.ty].src) { indFlash('一头接电源（电池组、发电机），一头接用电器'); return false; }
                ind.base.wires = ind.base.wires.filter(function (w) { return w[1] !== dev.id; });   // 一个用电器只接一根
                ind.base.wires.push([src.id, dev.id]); indBagDel('wire', 1);
                ind.wireDirty = true; indSave(); indFlash('接上了：' + IND_DEVS[src.ty].name + ' → ' + IND_DEVS[dev.ty].name);
                return true;
            }
            if (d.ty === 'bank' && k === 'battery') {
                if (d.bats >= 64) { indFlash('装满了'); return false; }
                indBagDel('battery', 1); d.bats++; d.u += IND_BAT_U; indSave();
                indFlash('装了一节电池（' + d.bats + ' 节，' + (d.bats * IND_BAT_V).toFixed(1) + ' V）'); return true;
            }
            if (d.ty === 'el') { indPanelEl(d.id); return true; }
            if (d.ty === 'comp') { indPanelComp(d.id); return true; }
            if (d.ty === 'press') { indPanelPress(d.id); return true; }
            if (IND_DEV_HTML[d.ty]) { indPanelNk(d.id); return true; }
            if (!D.src) { d.on = !d.on; indSave(); indFlash(D.name + (d.on ? '开了' : '关了')); return true; }
            indFlash(D.name + (d.ty === 'bank' ? '：拿电池左键装电池' : '：放在点着的灶台 3 米内（中火以上）就发电'));
            return false;
        }
        function indDevInfo(d) {
            let D = IND_DEVS[d.ty];
            if (IND_DEV_INFO[d.ty]) return IND_DEV_INFO[d.ty](d);
            if (d.ty === 'bank') return D.name + ' ' + d.bats + ' 节 ' + (d.bats * IND_BAT_V).toFixed(1) + ' V　电量 ' + Math.ceil(d.u) + ' U';
            if (d.ty === 'gen') return D.name + ' ' + (indSrcVolt(d) > 0 ? '发电中 12 V' : '没在发电');
            let w = ind.base.wires.filter(function (x) { return x[1] === d.id; })[0], s = w ? indDev(w[0]) : null;
            return D.name + '（额定 ' + D.rated + ' V）' + (s ? '　接着' + IND_DEVS[s.ty].name + ' ' + indSrcVolt(s).toFixed(1) + ' V' : '　没接电') + (d.on ? (d.pw ? '　工作中' : '　没在工作') : '　关着');
        }
        // 画设备（一组画完，有电的亮）和电线（一组线段）
        function indSyncDevs() {
            if (!ind.devMesh || !ind.devDirty) return;
            indDummy();
            let A = ind.where === 'base' ? ind.base.devs : [], n = Math.min(A.length, IND_DEV_CAP);
            for (let i = 0; i < n; i++) {
                let d = A[i], D = IND_DEVS[d.ty];
                IND_DUMMY.position.set(d.x, D.size[1] / 2, d.z); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.set(D.size[0], D.size[1], D.size[2]); IND_DUMMY.updateMatrix();
                ind.devMesh.setMatrixAt(i, IND_DUMMY.matrix);
                let c = D.col; if (!D.src && !d.pw && !D.always) c = 0x757575; if (ind.wirePend === d.id) c = 0xe040fb;
                ind.devMesh.setColorAt(i, IND_COL.setHex(c));
            }
            ind.devMesh.count = n; ind.devMesh.instanceMatrix.needsUpdate = true;
            if (ind.devMesh.instanceColor) ind.devMesh.instanceColor.needsUpdate = true;
            ind.devDirty = false;
            if (ind.wireDirty && ind.wireLine) {
                let W = ind.where === 'base' ? ind.base.wires : [], arr = new Float32Array(Math.max(1, W.length) * 6), k = 0;
                W.forEach(function (w) { let a = indDev(w[0]), b = indDev(w[1]); if (!a || !b) return; arr.set([a.x, 0.15, a.z, b.x, 0.15, b.z], k); k += 6; });
                ind.wireLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
                ind.wireLine.geometry.setDrawRange(0, k / 3);
                ind.wireDirty = false;
            }
        }
        function indLampNear() { return ind.where === 'base' && ind.base.devs.some(function (d) { return d.ty === 'lamp' && d.pw && Math.hypot(d.x - ind.p.x, d.z - ind.p.z) < 12; }); }

        // ── 电解槽、气体、元素表 ──
        function indElRecipe(d, V) {
            for (let i = 0; i < IND_EL_RECIPES.length; i++) {
                let r = IND_EL_RECIPES[i];
                if (V < r.minV) continue;
                if (!Object.keys(r.in).every(function (k) { return indHave(d.st, k) >= r.in[k]; })) continue;
                if (r.in.salt && !r.in.water_raw && indHave(d.st, 'water_raw') > 0) continue;   // 有水的时候不算熔融盐
                if (r.molten && !(indHeatNear(d.x, d.z, IND_GEN_R).temp >= r.molten)) continue;
                return i;
            }
            return -1;
        }
        function indElTick(d, dt) {
            if (!d.pw) return;
            let i = indElRecipe(d, d.v || 0); if (i < 0) { d.et = 0; return; }
            d.et = (d.et || 0) + dt;
            if (d.et < IND_EL_TIME) return;
            d.et = 0;
            let r = IND_EL_RECIPES[i];
            let mats = indConsume(d.st, r, 1);
            Object.keys(r.out).forEach(function (k) { let key = k; if (k === 'bucket' && mats[0]) key = indEmptyKey(mats[0]); d.st[key] = (d.st[key] || 0) + r.out[k]; });   // 电解槽里不上火：桶原样还回来
            Object.keys(r.out).forEach(function (k) { if (IND_ELEM_OF[k] && !ind.base.elems[IND_ELEM_OF[k]]) { ind.base.elems[IND_ELEM_OF[k]] = 1; indFlash('元素表点亮了：' + IND_ELEM_NAME[IND_ELEM_OF[k]]); } });
            if (ind.panel === 'el') ind.panelDirty = true;
            indSave();
        }
        function indElPut(id, k) {
            let d = indDev(id); if (!d || !ind.bag[k]) return;
            if (!d.st[k] && Object.keys(d.st).length >= 8) { indFlash('电解槽里放不下了'); return; }
            indBagDel(k, 1); d.st[k] = (d.st[k] || 0) + 1; indSave(); indPanelEl(id);
        }
        function indElTake(id) {
            let d = indDev(id); if (!d) return; let left = 0;
            Object.keys(d.st).forEach(function (k) { let t = indBagAdd(k, d.st[k]); d.st[k] -= t; if (d.st[k] <= 0) delete d.st[k]; else left += d.st[k]; });
            d.et = 0;
            if (left) indFlash('背包满了，还剩 ' + left + ' 个');
            indSave(); indPanelEl(id);
        }
        function indElHtml(d) {
            let w = ind.base.wires.filter(function (x) { return x[1] === d.id; })[0], s = w ? indDev(w[0]) : null, V = s ? indSrcVolt(s) : 0;
            let i = indElRecipe(d, V);
            let st = '电压 <b>' + V.toFixed(1) + ' V</b>（额定 12 V）' + (i >= 0 && d.pw ? '　正在' + IND_EL_RECIPES[i].name + ' ' + Math.floor((d.et || 0) / IND_EL_TIME * 100) + '%' : '');
            let has = Object.keys(d.st).map(function (k) { return indName(k) + '×' + d.st[k]; }).join('、') || '空';
            let put = Object.keys(ind.bag).map(function (k) { return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + '" onclick="indElPut(' + d.id + ',\'' + k + '\')">放 1</button>'); }).join('') || '<div style="color:#999;padding:6px 0;">身上没东西</div>';
            let how = IND_EL_RECIPES.map(function (r) { return r.name + '：' + Object.keys(r.in).map(function (k) { return indName(k) + '×' + r.in[k]; }).join(' + ') + '，' + r.minV + ' V 以上' + (r.molten ? '，灶台 ' + r.molten + '°C 以上 3 米内' : ''); }).join('<br>');
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">电解槽</div><div style="line-height:1.7;">' + st + '</div><div style="margin-top:4px;">里面：' + has + '</div>' +
                '<div style="margin-top:6px;color:#888;font-size:13px;line-height:1.6;">' + how + '</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + put +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#2e7d32;" onclick="indElTake(' + d.id + ')">全部拿出来</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        }
        function indPanelEl(id) { let d = indDev(id); if (!d) return; indPanelShow('el', indElHtml(d)); ind.panelEl = id; }
        // ── 压缩机、压力机 ──
        // 压缩机：左键打开，放一个钢瓶和若干气瓶；通电（≥ 6 V，额定 12 V）有活干时每秒 3 U，每 2 秒把 1 瓶气压进钢瓶（1 瓶 = 1 份），空玻璃瓶留在机器里
        function indCompBusy(d) { let g = d.cy ? indCylParse(d.cy) : null; return !!g && indCylN(g) < IND_CYL_CAP && Object.keys(d.st).some(function (k) { return IND_ITEMS[k] && IND_ITEMS[k].gas && d.st[k] > 0; }); }
        function indCompTick(d, dt) {
            if (!d.pw) { d.ct = 0; return; }
            d.ct = (d.ct || 0) + dt;
            if (d.ct < IND_COMP_TIME) return;
            d.ct = 0;
            let k = Object.keys(d.st).filter(function (x) { return IND_ITEMS[x] && IND_ITEMS[x].gas && d.st[x] > 0; })[0];
            if (!k || !d.cy) return;
            let g = indCylParse(d.cy), gas = IND_ITEMS[k].gas;
            if (!g || indCylN(g) >= IND_CYL_CAP) return;
            g[gas] = (g[gas] || 0) + 1; d.cy = indCylKey(g);
            d.st[k]--; if (d.st[k] <= 0) delete d.st[k];
            d.st.bottle = (d.st.bottle || 0) + 1;
            if (ind.panel === 'comp') ind.panelDirty = true;
            indSave();
        }
        // 压力机：左键打开放碳（木炭、煤、焦炭），旁边 3 米内要有 1200°C 以上的灶台；通电（≥ 18 V，额定 24 V）20 秒出 1 颗钻石，吃掉 5 个碳，有活干时每秒 6 U
        function indCarbonN(d) { let n = 0; IND_CARBON.forEach(function (k) { n += d.st[k] || 0; }); return n; }
        function indPressBusy(d) { return indCarbonN(d) >= 5 && indHeatNear(d.x, d.z, IND_GEN_R).temp >= IND_PRESS_T; }   // 旁边 3 米内有 1200°C 以上的灶台（小熔炉、大窑也算）
        function indPressTick(d, dt) {
            if (!d.pw) { d.pt = 0; return; }
            d.pt = (d.pt || 0) + dt;
            if (d.pt < IND_PRESS_TIME) return;
            d.pt = 0;
            let need = 5;
            IND_CARBON.forEach(function (k) { let t = Math.min(need, d.st[k] || 0); if (t > 0) { d.st[k] -= t; need -= t; if (d.st[k] <= 0) delete d.st[k]; } });
            d.st.diamond = (d.st.diamond || 0) + 1;
            if (!ind.base.elems[IND_ELEM_OF.diamond]) { ind.base.elems[IND_ELEM_OF.diamond] = 1; indFlash('元素表点亮了：' + IND_ELEM_NAME[IND_ELEM_OF.diamond]); }
            indFlash('出了一颗钻石'); if (ind.panel === 'press') ind.panelDirty = true;
            indSave();
        }
        function indDevVolt(d) { let w = ind.base.wires.filter(function (x) { return x[1] === d.id; })[0], s = w ? indDev(w[0]) : null; return s ? indSrcVolt(s) : 0; }
        function indDevPut(id, k, n) {
            let d = indDev(id); if (!d || !ind.bag[k]) return;
            if (k && IND_ITEMS[k].cyl && d.ty === 'comp') {
                if (d.cy) { indFlash('里面已经有一个钢瓶了'); return; }
                indBagDel(k, 1); d.cy = k; indSave(); indPanelDev(id); return;
            }
            if (!d.st[k] && Object.keys(d.st).length >= 8) { indFlash('里面放不下了'); return; }
            let t = indBagDel(k, n || 1); d.st[k] = (d.st[k] || 0) + t; indSave(); indPanelDev(id);
        }
        function indDevTake(id) {
            let d = indDev(id); if (!d) return; let left = 0;
            if (d.cy) { if (indBagAdd(d.cy, 1) > 0) d.cy = null; else left++; }
            Object.keys(d.st).forEach(function (k) { let t = indBagAdd(k, d.st[k]); d.st[k] -= t; if (d.st[k] <= 0) delete d.st[k]; else left += d.st[k]; });
            d.ct = 0; d.pt = 0;
            if (left) indFlash('身上放不下了，还剩 ' + left + ' 个');
            indSave(); indPanelDev(id);
        }
        function indPanelDev(id) { let d = indDev(id); if (!d) return; if (d.ty === 'comp') indPanelComp(id); else if (d.ty === 'press') indPanelPress(id); else if (IND_DEV_HTML[d.ty]) indPanelNk(id); }
        function indCompHtml(d) {
            let V = indDevVolt(d), g = d.cy ? indCylParse(d.cy) : null;
            let st = '电压 <b>' + V.toFixed(1) + ' V</b>（额定 12 V）' + (d.pw ? '　正在压 ' + Math.floor((d.ct || 0) / IND_COMP_TIME * 100) + '%' : '');
            let has = Object.keys(d.st).map(function (k) { return indName(k) + '×' + d.st[k]; }).join('、') || '空';
            let put = Object.keys(ind.bag).filter(function (k) { return IND_ITEMS[k].gas || IND_ITEMS[k].cyl; }).map(function (k) {
                return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + '" onclick="indDevPut(' + d.id + ',\'' + k + '\',1)">放 1</button>');
            }).join('') || '<div style="color:#999;padding:6px 0;">身上没有气瓶和钢瓶</div>';
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">压缩机</div><div style="line-height:1.7;">' + st + '</div>' +
                '<div style="margin-top:4px;">钢瓶：' + (g ? indCylName(g) : '没放') + '<br>气瓶：' + has + '</div>' +
                '<div style="margin-top:6px;color:#888;font-size:13px;">每 ' + IND_COMP_TIME + ' 秒把 1 瓶气压进钢瓶，空玻璃瓶留在这里。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + put +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#2e7d32;" onclick="indDevTake(' + d.id + ')">全部拿出来</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        }
        function indPressHtml(d) {
            let V = indDevVolt(d), H = indHeatNear(d.x, d.z, IND_GEN_R), near = H.temp > 0;
            let P = Math.round((d.pt || 0) / IND_PRESS_TIME * IND_PRESS_MAXP);
            let st = '电压 <b>' + V.toFixed(1) + ' V</b>（额定 24 V）　旁边灶台 ' + (near ? Math.round(H.temp) + '°C' : '没有（3 米内）') + '<br>压力 <b>' + P + '</b> / ' + IND_PRESS_MAXP + ' 个大气压' + (d.pw ? '　' + Math.floor((d.pt || 0) / IND_PRESS_TIME * 100) + '%' : '');
            let has = Object.keys(d.st).map(function (k) { return indName(k) + '×' + d.st[k]; }).join('、') || '空';
            let put = Object.keys(ind.bag).filter(function (k) { return IND_CARBON.indexOf(k) >= 0; }).map(function (k) {
                return indRow(indName(k) + ' × ' + ind.bag[k], '<button style="' + IND_BTN + '" onclick="indDevPut(' + d.id + ',\'' + k + '\',1)">放 1</button><button style="' + IND_BTN + '" onclick="indDevPut(' + d.id + ',\'' + k + '\',5)">放 5</button>');
            }).join('') || '<div style="color:#999;padding:6px 0;">身上没有碳（木炭、煤、焦炭）</div>';
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">压力机</div><div style="line-height:1.7;">' + st + '</div>' +
                '<div style="margin-top:4px;">里面：' + has + '</div>' +
                '<div style="margin-top:6px;color:#888;font-size:13px;">5 个碳，旁边 3 米内 ' + IND_PRESS_T + '°C 以上的灶台，通电 ' + IND_PRESS_TIME + ' 秒出 1 颗钻石。</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西</div>' + put +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#2e7d32;" onclick="indDevTake(' + d.id + ')">全部拿出来</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        }
        function indPanelComp(id) { let d = indDev(id); if (!d) return; indPanelShow('comp', indCompHtml(d)); ind.panelEl = id; }
        function indPanelPress(id) { let d = indDev(id); if (!d) return; indPanelShow('press', indPressHtml(d)); ind.panelEl = id; }
        // 气瓶放下就是放气；瓶子还给你
        function indFireNear(x, z) {
            if (ind.where === 'base' && indCooks().some(function (c) { return c.C.fire > 0 && Math.hypot(x - c.x, z - c.z) <= IND_GAS.fireR + (c.ty === 'kiln' ? 1 : 0); })) return true;
            return indFires().some(function (f) { return f.fuel > 0 && Math.hypot(f.x - x, f.z - z) <= IND_GAS.fireR; });
        }
        function indReleaseGas(k, x, z) {
            let g = IND_ITEMS[k].gas;
            indBagDel(k, 1); indBagAdd('bottle', 1);
            if (g === 'h2') {
                if (indFireNear(x, z)) { if (ind.where === 'base') indBoom(x, z, 0, '氢气遇到火'); else indTripBoom(x, z, '氢气遇到火'); }
                else indFlash('氢气飘走了');
            } else if (g === 'cl2') {
                ind.clouds = ind.clouds || [];
                let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(IND_GAS.r, 12, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0xc6ff00, transparent: true, opacity: 0.4, depthWrite: false })));
                m.position.set(x, 1, z); indAdd(m);
                ind.clouds.push({ x: x, z: z, t: IND_GAS.cloud, m: m, n: '氯气' });
                indFlash('一团黄绿色的气飘出来了');
            } else if (g === 'co2') indFlash('二氧化碳散了');
            else indFlash(indFireNear(x, z) ? '火一下子旺了' : '氧气散了');
            return true;
        }
        // 钢瓶放气（Q）：液态二氧化碳放出来是干冰（每 10 份一块）；氢气碰火炸、氯气是毒气；钢瓶清空还给你
        function indReleaseCyl(k, x, z) {
            let g = IND_ITEMS[k].cyl; indBagDel(k, 1); indBagAdd('cyl', 1);
            if (indCylLiquid(g)) {
                let m = Math.floor(g.co2 / 10); indBagAdd('dry_ice', m);
                indFlash('放气放出了干冰 ×' + m); return true;
            }
            if (g.h2 && indFireNear(x, z)) { if (ind.where === 'base') indBoom(x, z, 0, '氢气遇到火'); else indTripBoom(x, z, '氢气遇到火'); return true; }
            if (g.cl2) {
                ind.clouds = ind.clouds || [];
                let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(IND_GAS.r, 12, 8)), indMat(new THREE.MeshBasicMaterial({ color: 0xc6ff00, transparent: true, opacity: 0.4, depthWrite: false })));
                m.position.set(x, 1, z); indAdd(m); ind.clouds.push({ x: x, z: z, t: IND_GAS.cloud, m: m, n: '氯气' });
                indFlash('一团黄绿色的气飘出来了'); return true;
            }
            indFlash('钢瓶里的气放光了'); return true;
        }
        // 干冰放进装水的桶（右键）：冒白雾 30 秒，纯好看
        function indDryIceBucket() {
            let w = Object.keys(ind.bag).filter(function (k) { let c = indContOf(k); return c && (c.base === 'water_raw' || c.base === 'water_boiled' || c.base === 'water_sea'); })[0];
            if (!w) { indFlash('干冰：身上要有一桶水'); return false; }
            indBagDel('dry_ice', 1);
            ind.fogs = ind.fogs || [];
            let f = indFace(), x = ind.p.x + f.x * 1.2, z = ind.p.z + f.z * 1.2, ms = [];
            for (let i = 0; i < 6; i++) {
                let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(0.28, 8, 6)), indMat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })));
                m.position.set(x, 0.3, z); indAdd(m); ms.push(m);
            }
            ind.fogs.push({ x: x, z: z, t: 30, ms: ms, y: ind.where === 'trip' ? indGround(x, z) : 0 });
            indFlash('冒白雾了'); return true;
        }
        function indFogTick(dt) {
            if (!ind.fogs || !ind.fogs.length) return;
            ind.fogs.forEach(function (fg) {
                fg.t -= dt;
                fg.ms.forEach(function (m, i) {
                    let ph = (ind.t * 0.5 + i / 6) % 1;
                    m.position.set(fg.x + Math.sin(ind.t + i * 2) * 0.35, fg.y + 0.3 + ph * 1.4, fg.z + Math.cos(ind.t * 0.8 + i) * 0.35);
                    m.scale.setScalar(0.6 + ph); m.material.opacity = fg.t <= 0 ? 0 : 0.5 * (1 - ph); m.visible = fg.t > 0;
                });
            });
            ind.fogs = ind.fogs.filter(function (fg) { return fg.t > 0; });
        }
        function indTripBoom(x, z, why) {
            indBoomFx(x, z);
            ind.lastBoom = { x: x, z: z, R: IND_BOOM_R };
            if (Math.hypot(ind.p.x - x, ind.p.z - z) <= IND_BOOM_R && indHard()) { if (indBoomHurt(x, z, IND_BOOM_R, why)) return; }
            indFlash('轰！');
        }
        function indCloudTick(dt) {
            ind.inGas = null;
            if (!ind.clouds || !ind.clouds.length) return;
            let hit = null;
            ind.clouds.forEach(function (c) { c.t -= dt; if (c.t <= 0) { c.m.visible = false; return; } if (Math.hypot(ind.p.x - c.x, ind.p.z - c.z) <= IND_GAS.r) hit = c; });
            ind.clouds = ind.clouds.filter(function (c) { return c.t > 0; });
            if (hit) { ind.inGas = hit.n || '毒气'; if (indHard()) indHurt(IND_GAS.dps * dt, 'gas', '站在' + ind.inGas + '里'); }
        }
        function indPanelElems() {
            if (!ind) return;
            let E = ind.base.elems, n = Object.keys(E).length, cells = '';
            for (let z = 1; z < IND_ELEM_NAME.length; z++) cells += '<span style="display:inline-block;width:36px;margin:2px;padding:3px 0;text-align:center;border-radius:5px;font-size:12px;' + (E[z] ? 'background:#ffca28;color:#222;font-weight:bold;' : 'background:#eee;color:#bbb;') + '">' + z + '<br>' + IND_ELEM_NAME[z] + '</span>';
            indPanelShow('elems', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">元素表　' + n + ' / 118</div><div>' + cells + '</div><div style="margin-top:6px;color:#888;font-size:13px;">拿到一种元素的纯东西就点亮一格（比如铁锭、氢气瓶）</div>' +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }

        // ── 烫的锭 ──
        // 身上的烫锭 30 秒后凉；硬核没拿钳子每秒扣 15 血；基地地上的烫锭 30 秒后凉；泡水马上凉
        function indHotTick(dt) {
            ind.hotT = ind.hotT || {};
            let hot = false;
            Object.keys(ind.bag).forEach(function (k) {
                let c = IND_ITEMS[k].hot; if (!c) return;
                hot = true;
                if (ind.hotT[k] === undefined) ind.hotT[k] = IND_HOT_COOL;
                ind.hotT[k] -= dt;
                if (ind.hotT[k] <= 0) { let n = ind.bag[k]; delete ind.bag[k]; delete ind.hotT[k]; indBagAdd(c, n); }
            });
            Object.keys(ind.hotT).forEach(function (k) { if (!ind.bag[k]) delete ind.hotT[k]; });
            if (hot && indHard() && !ind.bag.tongs) indHurt(IND_HOT_DPS * dt, 'burn', indHotDetail());
            if (ind && ind.where === 'base') ind.base.ground.forEach(function (g) {
                let c = IND_ITEMS[g.k].hot; if (!c) return;
                g.ht = (g.ht === undefined ? IND_HOT_COOL : g.ht) - dt;
                if (g.ht <= 0) { g.k = c; delete g.ht; ind.itemDirty = true; }
            });
        }
        function indQuench(k) {
            let a = indAim();
            if (!((a && a.kind === 'pool') || indInWater())) { indFlash(indName(k) + '：放凉要泡水，或者放地上等一会儿'); return false; }
            let c = IND_ITEMS[k].hot, n = ind.bag[k]; delete ind.bag[k]; if (ind.hotT) delete ind.hotT[k]; indBagAdd(c, n);
            indFlash('滋——' + indName(c) + '凉了'); return true;
        }

        // ── 衣服、篝火、工作台 ──
        function indWear(k) {
            let sl = IND_ITEMS[k].wear, old = ind.base.wear[sl];
            indBagDel(k, 1); ind.base.wear[sl] = k;
            if (old) indBagAdd(old, 1);
            indSave(); indFlash('穿上了' + indName(k) + (IND_ITEMS[k].blast ? '：' + IND_ITEMS[k].use : ''));
            return true;
        }
        function indTakeOff(sl) {
            if (!ind) return;
            let k = ind.base.wear[sl]; if (!k) return;
            if (indBagAdd(k, 1) <= 0) { indFlash('背包满了'); return; }
            delete ind.base.wear[sl]; indSave(); indFlash('脱下了' + indName(k));
        }
        function indPlaceFire() {
            let F = indFires(); if (F.length >= 30) { indFlash('火太多了'); return false; }
            let f = indFace(), x = ind.p.x + f.x * 1.6, z = ind.p.z + f.z * 1.6;
            if (ind.where === 'base') { x = Math.max(-IND_BASE.x + 0.5, Math.min(IND_BASE.x - 0.5, x)); z = Math.max(-IND_BASE.z + 0.5, Math.min(IND_BASE.z - 0.5, z)); }
            indBagDel('campfire', 1); F.push({ x: x, z: z, fuel: 120 });
            ind.fireDirty = true; indSave(); indFlash('篝火点上了（拿着木头对着它左键加柴）');
            return true;
        }
        function indFeedFire(f) {
            let k = ['wood', 'charcoal', 'coal'].filter(function (x) { return ind.bag[x]; })[0];
            if (!k) { indFlash('篝火还能烧 ' + Math.ceil(f.fuel) + ' 秒（拿木头来加柴）'); return false; }
            indBagDel(k, 1); f.fuel += IND_ITEMS[k].fuel; ind.fireDirty = true; indSave();
            indFlash('加了 1 个' + indName(k) + '，还能烧 ' + Math.ceil(f.fuel) + ' 秒');
            return true;
        }
        function indCraftShow(r) { return !r.hard || indHard(); }
        function indCraftCan(r) { return indCraftShow(r) && Object.keys(r.in).every(function (k) { return (ind.bag[k] || 0) >= r.in[k]; }) && !(r.gh && ind.base.gh) && !(r.glass && (!ind.base.gh || ind.base.glass)) && !(r.pot && ind.base.pot); }
        function indCraft(i) {
            if (!ind) return false;
            let r = IND_CRAFT[i]; if (!r || !indCraftCan(r)) { indFlash('原料不够'); return false; }
            if (!r.gh && !r.glass && !r.pot) {   // 先把材料扣掉再看放不放得下成品
                let B = Object.assign({}, ind.bag);
                Object.keys(r.in).forEach(function (k) { B[k] -= r.in[k]; if (B[k] <= 0) delete B[k]; });
                if (indFits(B, IND_BAG_SLOTS, r.out, r.n || 1) < (r.n || 1)) { indFlash('背包满了'); return false; }
            }
            Object.keys(r.in).forEach(function (k) { indBagDel(k, r.in[k]); });
            if (r.gh) { ind.base.gh = true; if (ind.where === 'base') indBuildGh(); indFlash('暖棚盖好了，棚里的作物不管季节都长'); }
            else if (r.glass) { ind.base.glass = true; if (ind.where === 'base') indBuildGh(); indFlash('玻璃暖棚盖好了，棚子变大了'); }
            else if (r.pot) { ind.base.pot = true; indFlash('黄铜大锅装好了，灶台做吃的一炉最多 ' + IND_BATCH_POT + ' 份'); }
            else { indBagAdd(r.out, r.n || 1); indFlash('做好了：' + indName(r.out) + (r.n ? '×' + r.n : '')); }
            indSave(); if (ind.panel === 'bench') indPanelBench();
            return true;
        }
        // 做最多：身上的原料够几次就做几次（背包放不下就停）
        function indCraftMax(i) {
            if (!ind) return;
            let r = IND_CRAFT[i], n = 0;
            if (!r || r.gh || r.glass || r.pot) return;
            while (n < 500 && indCraftCan(r)) {
                let before = JSON.stringify(ind.bag);
                if (!indCraft(i)) break;
                n++; if (JSON.stringify(ind.bag) === before) break;
            }
            if (n) indFlash('一共做了 ' + n + ' 次'); else indFlash('原料不够');
            if (ind.panel === 'bench') indPanelBench();
        }
        function indPanelBench() {
            if (!ind) return;
            let rows = IND_CRAFT.map(function (r, i) {
                if (!indCraftShow(r)) return '';
                let nm = r.gh ? r.name + (ind.base.gh ? '（已经盖了）' : '') : r.glass ? r.name + (ind.base.glass ? '（已经盖了）' : '') : r.pot ? r.name + (ind.base.pot ? '（已经装了）' : '') : indName(r.out) + (IND_ITEMS[r.out].warm ? '（保暖 ' + IND_ITEMS[r.out].warm + '）' : '');
                let need = Object.keys(r.in).map(function (k) { return indName(k) + '×' + r.in[k]; }).join(' + ');
                let can = indCraftCan(r), once = r.gh || r.glass || r.pot;   // 盖暖棚、装大锅只能一次
                return indRow(nm + '<br><small style="color:#888">' + need + '</small>', '<span style="white-space:nowrap;"><button style="' + IND_BTN + (can ? 'background:#2e7d32;' : 'background:#bbb;') + '" onclick="indCraft(' + i + ')">做</button>' + (once ? '' : '<button style="' + IND_BTN + (can ? 'background:#1b5e20;' : 'background:#bbb;') + '" onclick="indCraftMax(' + i + ')">做最多</button>') + '</span>');
            }).join('');
            indPanelShow('bench', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">工作台</div><div style="color:#888;margin-bottom:4px;">用身上的原料做</div>' + rows +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }

        // ── 灶台 ──
        // 温度每秒往火候的温度靠 50°C（关火每秒降 10°C）；燃料按火候烧；原料够了、温度到了就开始做，
        // 做的时候温度超过烧焦线累计 8 秒，出来的就是焦炭
        // 炉子列表：灶台 + 放在基地里的小熔炉、大窑。每个 { id, ty, C 状态, x, z }
        function indCooks() {
            let St = IND_BASE_ST.stove, L = ind.base.off.stove ? [] : [{ id: 'stove', ty: 'stove', C: ind.base.stove, x: St.x, z: St.z }];
            ind.base.cookers.forEach(function (c) { L.push({ id: c.id, ty: c.ty, C: c, x: c.x, z: c.z }); });
            L.forEach(function (c) { if (!Array.isArray(c.C.spout)) c.C.spout = []; });
            return L;
        }
        function indCookById(id) { return indCooks().filter(function (c) { return c.id === id; })[0] || null; }
        function indCookCur() { return indCookById(ind.cookId || 'stove') || indCookById('stove'); }
        function indCookK(ty) {
            let D = IND_COOK[ty];
            return { rate: D.rate, burn: D.burn, only: D.only || null, top: D.top || 0, batch: ty === 'stove' ? { food: ind.base.pot ? IND_BATCH_POT : IND_BATCH, smelt: 1, bulk: 1, chem: 1 } : D.batch };
        }
        function indFireDef(ty, lv) { let F = IND_FIRE[lv]; return ty === 'furnace' && lv === 3 ? { name: F.name, t: IND_COOK.furnace.top, burn: F.burn } : F; }
        // 找第一个原料够、这个炉子做得了的配方
        // targetT：火候定下的温度。原料一样的配方（2 黏土：烧砖要 900°C、烧陶罐 600°C）按火候挑，大火出砖、中火出陶罐；火候不够哪个都挑不到就先等着第一个
        function indCookFind(items, K, targetT) {
            let first = -1;
            for (let j = 0; j < IND_RECIPES.length * 2; j++) {   // 先看带 pri 的配方（第 6 阶段的化学配方，原料里有水也不被"烧水"抢走），再看别的
                let i = j % IND_RECIPES.length, r = IND_RECIPES[i];
                if (!!r.pri !== (j < IND_RECIPES.length)) continue;
                if (r.hard && !indHard()) continue;
                if (K && K.only && (r.cls || 'food') !== K.only) continue;
                if (K && !indBatchCap(K, r)) continue;
                if (!Object.keys(r.in).every(function (k) { return indHave(items, k) >= r.in[k]; })) continue;
                if (targetT === undefined || targetT >= r.minT) return i;
                if (first < 0) first = i;
            }
            return first;
        }
        function indStoveFind(items) { return indCookFind(items, indCookK('stove')); }
        // 灶台一炉多份：做吃的（和烧水、煮盐）原料够几份就同时做几份，最多 4 份（装了黄铜大锅 8 份），时间和 1 份一样，燃料不多烧；
        // 冶炼、木炭、玻璃、砖还是一次 1 份。烧焦就整炉焦（每份出 1 焦炭，桶照样还）
        function indBatchCap(K, r) { return (K.batch[r.cls || 'food']) || 0; }
        function indBatchN(r, items, K) {
            let n = indBatchCap(K, r);
            Object.keys(r.in).forEach(function (k) { n = Math.min(n, Math.floor(indHave(items, k) / r.in[k])); });
            let hotPer = 0; Object.keys(r.out).forEach(function (k) { if (IND_ITEMS_RAW[k] && IND_ITEMS_RAW[k].hot) hotPer += r.out[k]; });
            if (hotPer) n = Math.min(n, Math.floor(IND_SPOUT_CAP / hotPer));   // 一炉烫锭要放得进出料槽
            return Math.max(0, n);
        }
        function indOutTxt(r, n) { return Object.keys(r.out).filter(function (k) { return k !== 'bucket'; }).map(function (k) { return indName(k, true) + (r.out[k] * n > 1 ? ' ×' + r.out[k] * n : ''); }).join('、'); }
        // 头顶飘的字（进度这类）：同一个 key 只画一张，字变了才重画
        function indBadge(key, x, y, z, text) {
            ind.badges = ind.badges || {};
            let b = ind.badges[key];
            if (!text) { if (b && b.mesh.visible) b.mesh.visible = false; return; }
            if (!b) {
                let cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
                let tex = new THREE.CanvasTexture(cv), sp = new THREE.Sprite(indMat(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
                sp.scale.set(5, 0.94, 1); indAdd(sp); b = ind.badges[key] = { mesh: sp, cv: cv, tex: tex, text: null };
            }
            b.mesh.position.set(x, y, z); b.mesh.visible = true;
            if (b.text === text) return;
            b.text = text;
            let g = b.cv.getContext('2d'); g.clearRect(0, 0, 512, 96); g.font = 'bold 54px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeText(text, 256, 50); g.fillStyle = '#fff'; g.fillText(text, 256, 50);
            b.tex.needsUpdate = true;
        }
        function indStoveTick(dt) {
            indCooks().forEach(function (c) { if (ind && !ind.over) indCookTick(c, dt); });
        }
        // 电炉（电器）放在炉子 3 米内：这个炉子的温度顶到 1800°C
        function indElecBoost(x, z) { return ind.where === 'base' && ind.base.devs.some(function (d) { return d.ty === 'furnace' && d.pw && Math.hypot(d.x - x, d.z - z) <= IND_GEN_R; }); }
        // 炉子里做好的某样东西有几个（烫锭在出料槽里，别的在"做好的"里）
        function indOutCount(C, k) { return (C.out[k] || 0) + (C.spout || []).filter(function (e) { return e.k === k; }).length; }
        function indSpoutTick(c, dt) { c.C.spout.forEach(function (e) { if (e.t > 0) e.t = Math.max(0, e.t - dt); }); }
        function indSpoutPos(c) { return { x: c.x + IND_COOK[c.ty].r + 0.9, z: c.z }; }
        function indSpoutTxt(c) {
            let by = {}, order = [];
            c.C.spout.forEach(function (e) { let k = IND_ITEMS_RAW[e.k].hot; if (!by[k]) { by[k] = { n: 0, t: 0 }; order.push(k); } by[k].n++; by[k].t = Math.max(by[k].t, e.t); });
            return order.map(function (k) { let b = by[k]; return indName(k) + ' ×' + b.n + '　' + (b.t > 0 ? '烫，还要 ' + Math.ceil(b.t) + ' 秒' : '已凉'); }).join('　');
        }
        function indCookTick(c, dt) {
            indSpoutTick(c, dt);
            let S = c.C, K = indCookK(c.ty), F = indFireDef(c.ty, S.fire);
            if (S.fire > 0) {
                let burn = F.burn * K.burn * dt;
                S.fuel -= burn;
                S.ashT = (S.ashT || 0) + burn;   // 烧掉 2 根木头的燃料攒出 1 份草木灰
                if (S.ashT >= IND_ASH_PER * 60) { S.ashT -= IND_ASH_PER * 60; S.out.ash = (S.out.ash || 0) + 1; }
                if (S.fuel <= 0) { S.fuel = 0; S.fire = 0; if (ind.panel === 'stove') ind.panelDirty = true; }
            }
            let target = Math.max(indFireDef(c.ty, S.fire).t, indElecBoost(c.x, c.z) ? IND_FURNACE_T : 20);
            if (S.temp < target) S.temp = Math.min(target, S.temp + K.rate * dt); else S.temp = Math.max(target, S.temp - (S.fire > 0 ? K.rate : Math.min(K.rate, 10)) * dt);
            if (ind.where === 'base') {   // 钢瓶放在炉子上就是炉子的温度：压力超过 100 个大气压，或者氢气氧气混装超过 500°C，就炸
                let boomR = 0;
                Object.keys(S.items).forEach(function (k) {
                    let g = IND_ITEMS[k] && IND_ITEMS[k].cyl; if (!g || !indCylN(g)) return;
                    let P = indCylP(g, S.temp);
                    if (P > IND_CYL_MAX_P || (g.h2 && g.o2 && S.temp > 500)) { boomR = Math.max(boomR, 1 + P / 50); delete S.items[k]; S.cook = null; }
                });
                if (boomR) { if (ind.panel === 'stove') ind.panelDirty = true; indBoom(c.x, c.z, boomR, '钢瓶炸了'); return; }
            }
            if (!S.cook) {
                let i = indCookFind(S.items, K, Math.max(F.t, indElecBoost(c.x, c.z) ? IND_FURNACE_T : 20));
                if (i >= 0 && S.temp >= IND_RECIPES[i].minT) S.cook = { i: i, t: 0, burn: 0, n: indBatchN(IND_RECIPES[i], S.items, K) };
                indCookBadge(c);
                return;
            }
            let r = IND_RECIPES[S.cook.i], n = S.cook.n || 1;
            if (Object.keys(r.in).some(function (k) { return indHave(S.items, k) < r.in[k] * n; })) { S.cook = null; indCookBadge(c); return; }   // 原料被拿走了
            if (S.temp >= r.minT) S.cook.t += dt;
            if (r.burnT && S.temp > r.burnT) S.cook.burn += dt;
            if (S.cook.t >= r.time || S.cook.burn >= IND_BURN_S) {
                let burnt = S.cook.burn >= IND_BURN_S;
                let hotN = 0; if (!burnt) Object.keys(r.out).forEach(function (k) { if (IND_ITEMS_RAW[k] && IND_ITEMS_RAW[k].hot) hotN += r.out[k] * n; });
                if (hotN && S.spout.length + hotN > IND_SPOUT_CAP) { S.cook.full = true; if (ind.panel === 'stove') ind.panelDirty = true; indCookBadge(c); return; }   // 出料槽满了，先停着不出料
                S.cook.full = false;
                let mats = indConsume(S.items, r, n), res = indCookResult(r, n, mats, burnt), out = res.out;   // 桶按用的材质还回去，陶罐有 1/10 碎掉
                Object.keys(out).forEach(function (k) {
                    if (IND_ITEMS_RAW[k] && IND_ITEMS_RAW[k].hot) { for (let i = 0; i < out[k]; i++) S.spout.push({ k: k, t: IND_HOT_COOL }); }   // 烫锭进出料槽
                    else S.out[k] = (S.out[k] || 0) + out[k];
                });
                if (res.broke && !ind.sleeping) indFlash('陶罐碎了' + (res.broke > 1 ? '（' + res.broke + ' 个）' : ''));
                S.cook = null;
                if (ind.panel === 'stove') ind.panelDirty = true;
                if (!ind.sleeping) indFlash(burnt ? '烧焦了！' + (n > 1 ? '整炉 ' + n + ' 份都焦了' : '') : '做好了：' + indOutTxt(r, n));
            }
            indCookBadge(c);
        }
        function indCookBadge(c) {
            if (ind.where !== 'base') return;
            let S = c.C, txt = '';
            if (S.cook) { let r = IND_RECIPES[S.cook.i]; txt = indOutTxt(r, S.cook.n || 1) + '　' + Math.min(99, Math.floor(S.cook.t / r.time * 100)) + '%'; }
            indBadge('cook' + c.id, c.x, c.ty === 'kiln' ? 3.6 : 3.1, c.z, txt);
            let sp = indSpoutPos(c), t2 = S.spout.length ? indSpoutTxt(c) : (S.cook && S.cook.full ? '出料槽满了' : '');
            indBadge('spout' + c.id, sp.x, 1.5, sp.z, t2);
        }
        function indStovePut(k, n) {
            if (!ind || !ind.bag[k]) return;
            if (k === 'gunpowder') { nkPowderInCooker(indCookCur()); return; }   // 火药放进炉子就炸
            let S = indCookCur().C, kc = indContOf(k);
            if (kc && kc.mat === 'wood') { indFlash('木桶不能上火'); return; }
            if (!S.items[k] && Object.keys(S.items).length >= IND_STOVE_CAP) { indFlash('放不下了'); return; }
            let t = indBagDel(k, n || 1); S.items[k] = (S.items[k] || 0) + t;
            indSave(); indPanelStove();
        }
        // 放满一炉：按配方把原料放够最多份数（炉子里已经有的算数；炉子是空的就挑背包里原料齐的第一个配方）
        function indBagFire(k) {   // 背包里能上火的 k（装在桶里的要不是木桶）
            if (IND_CONT_BASES.indexOf(k) < 0) return ind.bag[k] || 0;
            let n = 0; Object.keys(IND_MATS).forEach(function (m) { if (IND_MATS[m].fire) n += ind.bag[indFilledKey(k, m)] || 0; }); return n;
        }
        function indStoveFill() {
            if (!ind) return;
            let c = indCookCur(), S = c.C, K = indCookK(c.ty), ri = S.cook ? S.cook.i : indCookFind(S.items, K);
            if (ri < 0 || (!S.cook && Object.keys(S.items).length === 0)) {
                ri = -1;
                for (let i = 0; i < IND_RECIPES.length && ri < 0; i++) {
                    let r = IND_RECIPES[i];
                    if ((r.hard && !indHard()) || (K.only && (r.cls || 'food') !== K.only) || !indBatchCap(K, r)) continue;
                    if (Object.keys(r.in).every(function (k) { return indBagFire(k) + indHave(S.items, k) >= r.in[k]; })) ri = i;
                }
            }
            if (ri < 0) { indFlash('背包里的原料凑不出配方'); return; }
            let r = IND_RECIPES[ri], N = indBatchCap(K, r), hotPer = 0;
            Object.keys(r.out).forEach(function (k) { if (IND_ITEMS_RAW[k] && IND_ITEMS_RAW[k].hot) hotPer += r.out[k]; });
            if (hotPer) N = Math.min(N, Math.floor(IND_SPOUT_CAP / hotPer));
            Object.keys(r.in).forEach(function (k) { N = Math.min(N, Math.floor((indBagFire(k) + indHave(S.items, k)) / r.in[k])); });
            if (N <= 0) { indFlash('原料不够一份'); return; }
            Object.keys(r.in).forEach(function (k) {
                let need = r.in[k] * N - indHave(S.items, k);
                if (need <= 0) return;
                let keys = IND_CONT_BASES.indexOf(k) < 0 ? [k] : IND_TAKE_ORDER.filter(function (m) { return IND_MATS[m].fire; }).map(function (m) { return indFilledKey(k, m); });
                keys.forEach(function (key) { let t = Math.min(need, ind.bag[key] || 0); if (t > 0) { indStovePut(key, t); need -= t; } });
            });
            indFlash('放了 ' + N + ' 份的原料：' + indOutTxt(r, N));
            indPanelStove();
        }
        function indStoveFuel(k) {
            if (!ind || !ind.bag[k] || !IND_ITEMS[k].fuel) return;
            indBagDel(k, 1); indCookCur().C.fuel += IND_ITEMS[k].fuel;
            indSave(); indPanelStove();
        }
        function indStoveFire(lv) {
            if (!ind) return;
            let S = indCookCur().C;
            if (lv > 0 && S.fuel <= 0) { indFlash('先加燃料（木头、木炭、煤）'); return; }
            if (lv === 4 && !S.bellows) return;
            S.fire = lv; indSave(); indPanelStove();
        }
        function indStoveTakeAll() {
            if (!ind) return;
            let S = indCookCur().C, left = 0;
            [S.out, S.items].forEach(function (st) { Object.keys(st).forEach(function (k) { let t = indBagAdd(k, st[k]); st[k] -= t; if (st[k] <= 0) delete st[k]; else left += st[k]; }); });
            S.cook = null;
            if (left) indFlash('背包满了，还剩 ' + left + ' 个在' + IND_COOK[indCookCur().ty].name + '上');
            indSave(); indPanelStove();
        }

        // ── 面板：仓库箱、灶台 ──
        const IND_BTN = 'margin:3px;padding:7px 12px;border:none;border-radius:6px;background:#455a64;color:#fff;font-size:14px;cursor:pointer;';
        const IND_PANEL_CSS = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:#fff;border-radius:10px;padding:14px;width:min(92vw,440px);max-height:76vh;overflow:auto;font-family:"Microsoft YaHei",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);';
        function indPanelClose() { let p = document.getElementById('ind-panel'); if (p && p.parentNode) p.parentNode.removeChild(p); if (ind) { ind.panel = null; ind.cookId = null; ind.boxId = null; } }
        function indPanelShow(kind, html) {
            indPanelClose(); if (!ind) return;
            if (document.pointerLockElement) document.exitPointerLock();
            ind.panel = kind; ind.panelDirty = false;
            let p = document.createElement('div'); p.id = 'ind-panel'; p.style.cssText = IND_PANEL_CSS; p.innerHTML = html;
            document.body.appendChild(p);
        }
        function indRow(left, right) { return '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 0;border-bottom:1px solid #eee;"><span style="flex:1;min-width:0;">' + left + '</span><span style="white-space:nowrap;">' + right + '</span></div>'; }
        function indChestCur() { let C = ind.base.chests; return C.filter(function (c) { return c.id === ind.boxId; })[0] || indBoxTarget(); }
        function indChestCap(c) { return c.big ? 0 : IND_CHEST_SLOTS; }
        function indPanelBox(id) {
            if (!ind) return;
            if (id !== undefined) ind.boxId = id;
            let cid = ind.boxId, c = indChestCur();
            if (!c) { indFlash('没有仓库箱'); return; }
            let box = c.items, ks = Object.keys(box);
            let rows = ks.length ? ks.map(function (k) {
                return indRow(indName(k) + ' × ' + box[k], '<button style="' + IND_BTN + '" onclick="indBoxTake(\'' + k + '\',1)">拿 1</button><button style="' + IND_BTN + '" onclick="indBoxTake(\'' + k + '\',' + IND_STACK + ')">全拿</button>');
            }).join('') : '<div style="color:#999;padding:8px 0;">空的</div>';
            indPanelShow('box', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">仓库箱' + (c.big ? '' : '　' + indSlotsOf(box) + ' / ' + IND_CHEST_SLOTS + ' 格') + '</div>' + rows +
                '<div style="margin-top:8px;text-align:right;"><button id="ind-box-putall" style="' + IND_BTN + 'background:#2e7d32;" onclick="indBoxPutAll()">全部放进去</button><button id="ind-box-putsame" style="' + IND_BTN + 'background:#00838f;" onclick="indBoxPutSame()">同类放进去</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            ind.boxId = cid;
        }
        function indBoxTake(k, n) {
            let c = ind && indChestCur(); if (!c || !c.items[k]) return;
            let t = indBagAdd(k, Math.min(n, c.items[k]));
            if (t <= 0) indFlash('背包满了');
            c.items[k] -= t; if (c.items[k] <= 0) delete c.items[k];
            indSave(); if (ind.panel === 'box') indPanelBox();
        }
        // 背包里的放进箱子：全部，或者只放箱子里已经有的那几种；箱子放不下的留在背包里
        function indBoxPut(only) {
            if (!ind || ind.where !== 'base') return;
            let c = indChestCur(); if (!c) return;
            let cap = indChestCap(c), left = 0, moved = 0;
            Object.keys(ind.bag).forEach(function (k) {
                if (only && !c.items[k]) return;
                let t = indFits(c.items, cap, k, ind.bag[k]);
                if (t > 0) { c.items[k] = (c.items[k] || 0) + t; indBagDel(k, t); moved += t; }
                left += ind.bag[k] || 0;
            });
            if (!only && left) indFlash('箱子放满了，还剩 ' + left + ' 个在背包里');
            else if (only && !moved) indFlash('箱子里没有同类的');
            indSave(); indPanelBox();
        }
        function indBoxPutAll() { indBoxPut(false); }
        function indBoxPutSame() { indBoxPut(true); }
        function indStoveHtml() {
            let c = indCookCur(), S = c.C, D = IND_COOK[c.ty], F = indFireDef(c.ty, S.fire);
            let st = '火候：<b>' + F.name + '</b>　温度 <b>' + Math.round(S.temp) + '°C</b>　燃料 ' + Math.ceil(S.fuel) + '<br>';
            if (S.cook) { let r = IND_RECIPES[S.cook.i]; st += '正在做：' + indOutTxt(r, S.cook.n || 1) + (S.cook.n > 1 ? '（' + S.cook.n + ' 份）' : '') + ' ' + Math.floor(S.cook.t / r.time * 100) + '%'; }
            else st += '<span style="color:#888">原料放够、温度到了就自己开始做' + (D.only ? '（只做冶炼）' : '') + '</span>';
            let fire = IND_FIRE.map(function (f, i) { if (f.bellows && !S.bellows) return ''; let fd = indFireDef(c.ty, i); return '<button style="' + IND_BTN + (S.fire === i ? 'background:#d84315;' : '') + '" onclick="indStoveFire(' + i + ')">' + fd.name + '</button>'; }).join('');
            let on = Object.keys(S.items).map(function (k) { let g = IND_ITEMS[k].cyl; return (g && indCylN(g) ? indCylName(g, S.temp) : indName(k)) + '×' + S.items[k]; }).join('、') || '空';
            let out = Object.keys(S.out).map(function (k) { return indName(k) + '×' + S.out[k]; }).join('、') || '无';
            let spt = S.spout.length ? indSpoutTxt(c) + '（左键点炉子旁边的出料槽取出）' : '空';
            if (S.cook && S.cook.full) st += '<br><b style="color:#c62828">出料槽满了</b>';
            let put = Object.keys(ind.bag).map(function (k) {
                let b = '<button style="' + IND_BTN + '" onclick="indStovePut(\'' + k + '\',1)">放 1</button><button style="' + IND_BTN + '" onclick="indStovePut(\'' + k + '\',' + ind.bag[k] + ')">全放</button>';
                if (IND_ITEMS[k].fuel) b += '<button style="' + IND_BTN + 'background:#6d4c41;" onclick="indStoveFuel(\'' + k + '\')">当柴烧</button>';
                return indRow(indName(k) + ' × ' + ind.bag[k], b);
            }).join('') || '<div style="color:#999;padding:6px 0;">身上没东西</div>';
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">' + D.name + '</div><div style="line-height:1.7;">' + st + '</div><div>' + fire + '</div>' +
                '<div style="margin-top:6px;">锅里：' + on + '<br>做好的：' + out + '<br>出料槽：' + spt + '</div>' +
                '<div style="margin-top:6px;font-weight:bold;">身上的东西　<button style="' + IND_BTN + 'background:#00838f;" onclick="indStoveFill()">放满一炉</button></div>' + put +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + 'background:#2e7d32;" onclick="indStoveTakeAll()">全部拿出来</button><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        }
        function indPanelStove(id) { if (!ind) return; let cid = id !== undefined ? id : ind.cookId; ind.cookId = cid; indPanelShow('stove', indStoveHtml()); ind.cookId = cid; }
        function indPanelCook(id) { indPanelStove(id); }

        // ── 配方查询：搜一样东西，看它怎么做、能做什么 ──
        function indBookLines() {
            let L = [];
            IND_RECIPES.forEach(function (r) {
                if (r.hard && !indHard()) return;
                L.push({ ins: Object.keys(r.in), outs: Object.keys(r.out), txt: Object.keys(r.in).map(function (k) { return indName(k, true) + (IND_CONT_BASES.indexOf(k) >= 0 ? '（要能上火的容器装的）' : '') + '×' + r.in[k]; }).join(' + ') + ' → ' + Object.keys(r.out).map(function (k) { return (k === 'bucket' ? '空容器（陶罐有 1/10 碎掉）' : indName(k, true)) + '×' + r.out[k]; }).join(' + '), where: '灶台 ' + r.minT + '°C 以上，' + r.time + ' 秒' + (r.burnT ? '（超过 ' + r.burnT + '°C 会烧焦）' : '') });
            });
            IND_CRAFT.forEach(function (r) {
                if (!indCraftShow(r)) return;
                let out = r.gh ? '暖棚' : r.glass ? '玻璃暖棚' : r.pot ? '黄铜大锅' : indName(r.out);
                L.push({ ins: Object.keys(r.in), outs: r.out ? [r.out] : [], name: out, txt: Object.keys(r.in).map(function (k) { return indName(k) + '×' + r.in[k]; }).join(' + ') + ' → ' + out, where: '工作台' });
            });
            if (indHard()) {   // 压力：不在 IND_RECIPES / IND_CRAFT 里的做法
                L.push({ ins: ['b_h2', 'b_o2', 'b_cl2', 'b_co2', 'cyl'], outs: ['cyl'], txt: '气瓶 + 钢瓶 → 装了气的钢瓶（每 ' + IND_COMP_TIME + ' 秒压 1 瓶，最多 ' + IND_CYL_CAP + ' 份，压力 = 份数 × (温度 + 273) ÷ 293）', where: '压缩机，12 V，有活干时每秒 3 U' });
                L.push({ ins: ['cyl', 'b_co2'], outs: ['dry_ice'], txt: '液态二氧化碳钢瓶（20°C 超过 ' + IND_CYL_LIQ + ' 个大气压）→ 干冰（每 10 份一块）', where: '拿着按 Q' });
                L.push({ ins: IND_CARBON.concat(['diamond']), outs: ['diamond'], txt: '碳×5（木炭、煤、焦炭）→ 钻石×1', where: '压力机，24 V，旁边 3 米内 ' + IND_PRESS_T + '°C 以上的灶台，通电 ' + IND_PRESS_TIME + ' 秒，有活干时每秒 6 U' });
            }
            Object.keys(IND_CROPS).forEach(function (k) {
                let C = IND_CROPS[k];
                L.push({ ins: ['seed_' + k], outs: [k, 'seed_' + k], txt: indName('seed_' + k) + ' → ' + C.name + ' + 种子', where: '农田，' + C.grow + ' 秒，' + C.s.map(function (i) { return IND_SEASONS[i].name; }).join('') + '天长' });
            });
            return L;
        }
        function indPanelBook(q) {
            if (!ind) return;
            q = (q || '').trim();
            let L = indBookLines().filter(function (l) {
                if (!q) return true;
                return (l.name || '').indexOf(q) >= 0 || l.ins.concat(l.outs).some(function (k) { return indName(k).indexOf(q) >= 0; });
            });
            let rows = L.map(function (l) { return '<div style="padding:4px 0;border-bottom:1px solid #eee;"><div>' + l.txt + '</div><small style="color:#888">' + l.where + '</small></div>'; }).join('') || '<div style="color:#999;padding:8px 0;">没找到</div>';
            indPanelShow('book', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">配方</div>' +
                '<input id="ind-book-q" value="' + q.replace(/"/g, '') + '" placeholder="搜东西，比如：铁" style="width:100%;box-sizing:border-box;padding:6px;font-size:15px;margin-bottom:6px;" oninput="indBookSearch(this.value)">' +
                '<div id="ind-book-list">' + rows + '</div><div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            let inp = document.getElementById('ind-book-q'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }
        function indBookSearch(q) { indPanelBook(q); }

        // ── 键盘、界面 ──
        const IND_KEYMAP = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
        function indKeyDown(e) {
            if (!ind || ind.over || ind.dead) return;
            let t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
            let k = (e.key || '').toLowerCase();
            if (IND_KEYMAP[k]) { ind.k[IND_KEYMAP[k]] = true; e.preventDefault(); return; }
            if (k === ' ') { ind.k.jump = true; e.preventDefault(); return; }
            if (k === 'shift') { ind.k.run = true; return; }
            if (e.repeat) return;
            if (k === 'escape') { if (ind.panel) indPanelClose(); return; }
            if (ind.panel) return;
            if (k === 'q' || k === 'g') indDrop(); else if (k === 'e' || k === 'f') indAction(); else if (k === 'r') indUse();
            else if (/^[1-9]$/.test(k)) ind.selIdx = +k - 1;
        }
        function indKeyUp(e) {
            if (!ind) return;
            let k = (e.key || '').toLowerCase();
            if (IND_KEYMAP[k]) ind.k[IND_KEYMAP[k]] = false; else if (k === ' ') ind.k.jump = false; else if (k === 'shift') ind.k.run = false;
        }
        function indBindKeys() { window.addEventListener('keydown', indKeyDown); window.addEventListener('keyup', indKeyUp); }
        function indUnbindKeys() { window.removeEventListener('keydown', indKeyDown); window.removeEventListener('keyup', indKeyUp); }
        function indHold(dir, on) { if (ind) ind.k[dir] = !!on; }
        function indBuildHud() {
            let n = document.createElement('div'); n.id = 'ind-night';
            n.style.cssText = 'position:fixed;inset:0;z-index:39;pointer-events:none;background:#0a1030;opacity:0;';
            document.body.appendChild(n);
            let rd = document.createElement('div'); rd.id = 'ind-red';
            rd.style.cssText = 'position:fixed;inset:0;z-index:41;pointer-events:none;opacity:0;box-shadow:inset 0 0 140px 50px rgba(229,57,53,.85);';
            document.body.appendChild(rd);
            if (!document.getElementById('ind-style')) { let st = document.createElement('style'); st.id = 'ind-style'; st.textContent = '@keyframes indblink{50%{opacity:.25}}.ind-low{animation:indblink .6s infinite}'; document.head.appendChild(st); }
            let d = document.createElement('div'); d.id = 'ind-hud';
            d.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;font-family:"Microsoft YaHei",sans-serif;color:#222;';
            d.innerHTML =
                '<div style="position:absolute;left:8px;top:8px;"><div id="ind-status" style="background:rgba(255,255,255,.92);padding:7px 12px;border-radius:8px;font-size:14px;font-weight:bold;line-height:1.55;"></div>' +
                '<div id="ind-wear" style="margin-top:4px;background:rgba(255,255,255,.92);padding:4px 10px;border-radius:8px;font-size:13px;pointer-events:auto;"></div></div>' +
                '<div style="position:absolute;right:8px;top:8px;pointer-events:auto;"><button id="ind-btn-book" style="' + IND_BTN + 'font-size:16px;padding:10px 14px;" onclick="indPanelBook(\'\')">配方</button><button id="ind-btn-up" style="' + IND_BTN + 'background:#e65100;font-size:16px;padding:10px 14px;display:none;" onclick="indAskHard()">升级成硬核</button><button id="ind-btn-elems" style="' + IND_BTN + 'font-size:16px;padding:10px 14px;" onclick="indPanelElems()">元素表</button><button id="ind-btn-exit" style="' + IND_BTN + 'background:#d84315;font-size:18px;padding:10px 16px;" onclick="indExit()">返回大厅</button></div>' +
                '<div id="ind-hint" style="position:absolute;left:50%;bottom:150px;transform:translateX(-50%);color:#fff;padding:4px 12px;font-size:20px;font-weight:bold;white-space:nowrap;text-align:center;text-shadow:0 0 4px #000,0 0 4px #000;"></div>' +
                '<div style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #000;"></div>' +
                '<div style="position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:min(96vw,720px);text-align:center;pointer-events:auto;">' +
                '<div id="ind-bag" style="background:rgba(255,255,255,.92);border-radius:8px;padding:4px;min-height:34px;font-size:14px;"></div>' +
                '<div style="margin-top:2px;"><button id="ind-btn-act" style="' + IND_BTN + '" onclick="indAction()">左键动作</button><button id="ind-btn-use" style="' + IND_BTN + '" onclick="indUse()">吃喝/浇水 (R)</button><button id="ind-btn-put" style="' + IND_BTN + '" onclick="indDrop()">放下 (Q)</button>' +
                '<button style="' + IND_BTN + '" ontouchstart="event.preventDefault();indHold(\'jump\',true)" ontouchend="indHold(\'jump\',false)" onmousedown="indHold(\'jump\',true)" onmouseup="indHold(\'jump\',false)">跳</button>' +
                '<button style="' + IND_BTN + '" ontouchstart="event.preventDefault();indHold(\'run\',true)" ontouchend="indHold(\'run\',false)" onmousedown="indHold(\'run\',true)" onmouseup="indHold(\'run\',false)">跑</button></div></div>';
            document.body.appendChild(d);
        }
        function indBar(name, v, col) {
            return '<span style="display:inline-block;margin-right:8px;">' + name + ' <span style="display:inline-block;width:46px;height:8px;background:#ddd;border-radius:4px;vertical-align:middle;overflow:hidden;"><span style="display:block;height:100%;width:' + Math.round(Math.max(0, Math.min(100, v))) + '%;background:' + (v <= 15 ? '#e53935' : col) + ';"></span></span> ' + Math.round(v) + '</span>';
        }
        function indHudUpdate() {
            let R = ind; if (!R || R.over) return;
            if (R.panel === 'stove' && (R.panelDirty || R.t % 1 < 0.21)) { let p = document.getElementById('ind-panel'); if (p) { p.innerHTML = indStoveHtml(); R.panelDirty = false; } }
            if (R.panel === 'el' && (R.panelDirty || R.t % 1 < 0.21)) { let p = document.getElementById('ind-panel'), d = indDev(R.panelEl); if (p && d) { p.innerHTML = indElHtml(d); R.panelDirty = false; } }
            if (IND_DEV_HTML[R.panel] && (R.panelDirty || R.t % 1 < 0.21)) { let p = document.getElementById('ind-panel'), d = indDev(R.panelEl); if (p && d) { p.innerHTML = IND_DEV_HTML[R.panel](d); R.panelDirty = false; } }
            if ((R.panel === 'comp' || R.panel === 'press') && (R.panelDirty || R.t % 1 < 0.21)) { let p = document.getElementById('ind-panel'), d = indDev(R.panelEl); if (p && d) { p.innerHTML = R.panel === 'comp' ? indCompHtml(d) : indPressHtml(d); R.panelDirty = false; } }
            let upb = document.getElementById('ind-btn-up'); if (upb) upb.style.display = R.base.rule === 'casual' ? '' : 'none';
            let S = R.base.surv, rule = R.base.rule === 'hard' ? '硬核' : R.base.rule === 'casual' ? '悠闲' : '未选';
            let st = indClockTxt() + (indIsNight() ? '（夜里）' : '') + '　' + indSeasonTxt() + '　' + rule + '<br>';
            st += (indHard() ? (S.hp < 30 ? '<span class="ind-low">' + indBar('血', S.hp, '#e53935') + '</span>' : indBar('血', S.hp, '#e53935')) : '') + indBar('饱食', S.food, '#fb8c00') + indBar('口渴', S.water, '#039be5') + '<br>' + indBar('精力', S.energy, '#8e24aa') + indBar('体力', R.stam, '#43a047');
            let tc = S.temp < IND_BODY.chill ? '#1565c0' : S.temp > IND_BODY.sweat ? '#c62828' : '#2e7d32';
            st += '<br>体温 <b style="color:' + tc + '">' + S.temp.toFixed(1) + '°C</b>　气温 ' + Math.round(indAirTemp()) + '°C　保暖 ' + indWarmth();
            if (S.temp < IND_BODY.chill) st += '　<b style="color:#1565c0">冷得发抖</b>'; else if (S.temp > IND_BODY.sweat) st += '　<b style="color:#c62828">热得冒汗</b>';
            if (indHard() && S.hp < 30 && R.hurt) {
                let tags = {}; R.hurt.rec.forEach(function (r) { if (R.t - r.t <= 1.5) tags[IND_HURT[r.key].tag] = 1; });
                if (Object.keys(tags).length) st += '<br><b style="color:#e53935">正在掉血：' + Object.keys(tags).join('、') + '</b>';
            }
            if (R.inGas) st += '<br><b style="color:#c62828">' + (indHard() ? '中毒' : R.inGas + '（悠闲不扣血）') + '</b>';
            if (R.sickT > 0) st += '<br><b style="color:#c62828">拉肚子 ' + Math.ceil(R.sickT) + ' 秒</b>';
            if (indSlow()) st += '<br><b style="color:#c62828">' + (S.energy <= 0 ? '累得走不动' : '饿得/渴得走不动') + '</b>';
            if (R.where === 'base') st += '<br>基地　远征过 ' + R.base.trips + ' 次';
            else {
                let bm = IND_BIOMES[indBiome(R.map, R.p.x, R.p.z)].name;
                let near = R.exits.reduce(function (a, e) { let dd = Math.hypot(R.p.x - e.x, R.p.z - e.z); return dd < a ? dd : a; }, 1e9);
                st += '<br>远征　' + bm + '　最近的撤离点 ' + Math.round(near) + ' 米' + (R.exitT > 0 ? '　<b style="color:#2e7d32">撤离中 ' + Math.ceil(IND_T.extract - R.exitT) + '</b>' : '');
            }
            let SL = indSlots(), sel = indSel(), bag = '';
            for (let i = 0; i < IND_BAG_SLOTS; i++) {
                let it = SL[i];
                if (!it) { bag += '<span style="display:inline-block;margin:1px;padding:2px 6px;border-radius:10px;border:2px dashed #e0e0e0;color:#ccc;font-size:12px;">' + (i + 1) + '</span>'; continue; }
                let on = i === ind.selIdx, hotS = IND_ITEMS[it.k].hot ? Math.ceil(ind.hotT && ind.hotT[it.k] !== undefined ? ind.hotT[it.k] : IND_HOT_COOL) : 0;
                bag += '<span onclick="ind.selIdx=' + i + '" style="display:inline-block;margin:1px;padding:2px 6px;border-radius:10px;cursor:pointer;font-size:12px;border:2px solid ' + (on ? '#5e35b1' : hotS ? '#c62828' : '#cfd8dc') + ';background:' + (hotS ? '#ffcdd2;color:#b71c1c' : on ? '#ede7f6' : '#fff') + ';">' + (i + 1) + ' ' + indName(it.k) + '×' + it.n + (hotS ? ' 烫 ' + hotS + ' 秒' : '') + '</span>';
            }
            let a = indAim(), hint = '';
            let rh = R.rh && !R.rh.done ? R.rh : null;
            if (rh) hint = '收起' + indFurnName(rh.f.ty, rh.f.o) + ' ' + Math.min(99, Math.floor(rh.t / IND_PICK_HOLD * 100)) + '%';
            else if (a && a.kind === 'node') { let nd = IND_NODES[a.o.key], nm = a.o.key === 'seeds' ? '野生' + indName(a.o.seed) : (nd.name || indName(a.o.key)); hint = nm + ' ×' + a.o.n + '<br><small>' + (indTool() >= nd.tool ? '左键：采集' : '要' + IND_TOOL_NAME[nd.tool]) + '</small>'; }
            else if (R.onRaft) hint = '木筏<br><small>左键：下筏（水上 2 倍速，不能上岸）</small>';
            else if (a && a.kind === 'raft') hint = '木筏<br><small>左键：上去</small>';
            else if (a && a.kind === 'bomb') hint = a.o.t >= 0 ? '原子弹：' + Math.ceil(a.o.t) + ' 秒后爆炸，半径 40 米<br><small>左键：拆掉</small>' : '原子弹<br><small>左键：启动（30 秒后爆炸，半径 40 米）　长按右键：收起</small>';
            else if (a && a.kind === 'item') hint = indName(a.o.k) + '<br><small>左键：拿</small>';
            else if (a && a.kind === 'crop') { let C = IND_CROPS[a.o.k], ripe = indCropRipe(a.o); hint = C.name + (ripe ? '（熟了）' : ' ' + Math.floor(a.o.g / C.grow * 100) + '%' + (!indCropSeasonOK(a.o) ? '　这个季节不长' : a.o.wet > R.base.clock ? '' : '　没浇水') + (a.o.fert ? '　施过肥了' : '')) + '<br><small>' + (ripe ? '左键：收' : '拿着水右键：浇水　拿草木灰右键：施肥') + '</small>'; }
            else if (a && a.kind === 'fire') hint = '篝火' + (a.o.fuel > 0 ? ' 还能烧 ' + Math.ceil(a.o.fuel) + ' 秒' : '（灭了）') + '<br><small>拿着木头，左键：加柴</small>';
            else if (a && a.kind === 'door') hint = IND_HOUSE[a.o.ty].name + '的门（' + (a.o.open ? '开着' : '关着') + '）<br><small>左键：' + (a.o.open ? '关门' : '开门') + '　长按右键：收起房子</small>';
            else if (a && a.kind === 'house') hint = IND_HOUSE[a.o.ty].name + '<br><small>' + (indHouseHas(a.o) ? '里面有东西，先搬出来才能收' : '长按右键：收起') + '</small>';
            else if (a && a.kind === 'bench') hint = '工作台<br><small>左键：打开　长按右键：收起</small>';
            else if (a && a.kind === 'tile') hint = '空农田<br><small>拿种子，左键：种　长按右键：收回</small>';
            else if (a && a.kind === 'spout') hint = '出料槽 ' + (a.o.C.spout.length ? indSpoutTxt(a.o) : '空') + '<br><small>左键：取出（烫的要钳子）　拿水桶右键：浇凉</small>';
            else if (a && a.kind === 'cook') hint = IND_COOK[a.o.ty].name + ' ' + Math.round(a.o.temp) + '°C<br><small>左键：打开</small>';
            else if (a && a.kind === 'dev') { let D = IND_DEVS[a.o.ty]; hint = indDevInfo(a.o) + '<br><small>' + (sel === 'wire' ? '左键：接线　' : a.o.ty === 'bank' ? '拿电池左键：装电池　' : !D.src ? '左键：开关　' : '') + '右键：收起</small>'; }
            else if (a && a.kind === 'animal') {
                let o = a.o, D = IND_ANIMALS[o.k];
                if (R.where === 'trip') hint = (o.follow ? D.name + '（跟着你）' : '野生的' + D.name + (o.fed ? '（还要喂 ' + (D.tame - o.fed) + ' 次）' : '')) + '<br><small>爱吃：' + indFoodTxt(o.k) + '</small>';
                else hint = D.name + '　饱食 ' + Math.round(o.food) + (o.k === 'sheep' ? '　' + (R.base.clock >= o.woolAt ? '能剪毛了' : '毛还要 ' + Math.ceil(o.woolAt - R.base.clock) + ' 秒') : o.k === 'cow' ? '　' + (R.base.clock >= o.milkAt ? '能挤奶了' : '奶还要 ' + Math.ceil(o.milkAt - R.base.clock) + ' 秒') : '') + '<br><small>左键：' + (o.k === 'sheep' ? '喂／拿剪刀剪毛' : o.k === 'cow' ? '喂／拿空桶挤奶' : '喂') + '</small>';
            }
            else if (a && a.kind === 'chest') hint = '仓库箱' + (a.o.big ? '' : '（' + indSlotsOf(a.o.items) + '/' + IND_CHEST_SLOTS + ' 格）') + '<br><small>左键：打开　长按右键：收起</small>';
            else if (a && a.kind === 'stove') hint = '灶台 ' + Math.round(R.base.stove.temp) + '°C<br><small>左键：打开</small>';
            else if (a && a.kind === 'bed') hint = '床<br><small>左键：睡觉（夜里或累了）</small>';
            else if (a && a.kind === 'pool') hint = '水池<br><small>右键：喝一口，拿空桶右键接水</small>';
            else if (R.where === 'base' && sel && IND_ITEMS[sel].seed && indInField(R.p.x + indFace().x * 1.4, R.p.z + indFace().z * 1.4)) hint = '左键：种' + indName(sel);
            else if (R.where === 'base' && Math.hypot(R.p.x - IND_BASE_ST.gate.x, R.p.z - IND_BASE_ST.gate.z) < 6) hint = '从门里走出去就是远征';
            else if (sel === 'bell') hint = '<small>左键：摇铃，30 米内的动物走过来</small>';
            else if (sel && IND_ITEMS[sel].eat) hint = '<small>右键：' + (IND_ITEMS[sel].eat.f ? '吃' : '喝') + indName(sel) + '</small>';
            else if (sel && IND_ITEMS[sel].wear) hint = '<small>右键：穿上' + indName(sel) + '</small>';
            else if (sel === 'dirt') hint = '<small>右键：在面前开一格农田</small>';
            else if (sel && IND_ITEMS[sel].nuke) hint = '<small>右键：在面前放下原子弹</small>';
            else if (sel && IND_ITEMS[sel].raft) hint = '<small>右键：对着水面放下木筏</small>';
            else if (sel && IND_ITEMS[sel].house) hint = '<small>右键：在面前放下' + indName(sel) + '（门朝着你）</small>';
            else if (sel && IND_ITEMS[sel].furn) hint = '<small>右键：放下' + indName(sel) + '</small>';
            else if (sel && IND_ITEMS[sel].cook) hint = '<small>右键：放下' + indName(sel) + '</small>';
            else if (sel === 'campfire') hint = '<small>右键：在面前点篝火</small>';
            else if (sel && IND_ITEMS[sel].gas) hint = '<small>Q：打开放气</small>';
            else if (sel && IND_ITEMS[sel].cyl && indCylN(IND_ITEMS[sel].cyl)) hint = '<small>Q：放气' + (indCylLiquid(IND_ITEMS[sel].cyl) ? '（液态二氧化碳放出干冰）' : '') + '</small>';
            else if (sel === 'dry_ice') hint = '<small>拿在手上体温每秒 −0.05°C　右键：放进装水的桶</small>';
            else if (sel && IND_ITEMS[sel].dev) hint = '<small>右键：放下' + indName(sel) + '</small>';
            else if (sel === 'wire' && R.wirePend) hint = '<small>再点另一个设备接线</small>';
            let wr = ['body', 'head', 'neck'].filter(function (sl) { return R.base.wear[sl]; }).map(function (sl) { return '<span onclick="indTakeOff(\'' + sl + '\')" style="cursor:pointer;margin-right:6px;border-bottom:1px dashed #999;">' + indName(R.base.wear[sl]) + '</span>'; }).join('');
            wr = '穿着：' + (wr || '<span style="color:#999">什么都没穿</span>') + (wr ? '<small style="color:#999">（点一下脱下）</small>' : '');
            let sig = st + '|' + bag + '|' + hint + '|' + wr;
            if (sig === R.hudSig) return; R.hudSig = sig;
            let we = document.getElementById('ind-wear'); if (we) we.innerHTML = wr;
            let s = document.getElementById('ind-status'); if (s) s.innerHTML = st;
            let b = document.getElementById('ind-bag'); if (b) b.innerHTML = bag;
            let h = document.getElementById('ind-hint'); if (h) h.innerHTML = hint;
        }

        // ── 大厅入口（运行时插按钮、包一层选模式和开始游戏；原函数照样调用）──
        function indRefreshButton(m) {
            let b = document.getElementById('btn-mode-industry');
            if (b) { b.style.display = indVisible() ? '' : 'none'; b.style.borderColor = m === 'industry' ? '#ef6c00' : '#ccc'; b.style.color = m === 'industry' ? '#ef6c00' : '#333'; }
        }
        (function indHookLobby() {
            try {
                let grid = document.getElementById('game-mode-select');
                if (grid && !document.getElementById('btn-mode-industry')) {
                    let b = document.createElement('button'); b.id = 'btn-mode-industry'; b.textContent = '猫盾工业';
                    b.style.cssText = 'display:none; margin:0; font-size:11px; padding:7px 2px;';
                    b.onclick = function () { selectGameMode('industry'); };
                    let lb = document.getElementById('btn-mode-lab');
                    if (lb && lb.nextSibling) grid.insertBefore(b, lb.nextSibling); else grid.appendChild(b);
                }
            } catch (e) { }
        })();
        const IND_ORIG_SELECT = selectGameMode;
        selectGameMode = function (m) {
            if (m === 'industry' && !indVisible()) m = 'hunt';
            IND_ORIG_SELECT(m);
            indRefreshButton(m);
            if (m === 'industry') {
                let t = document.getElementById('lobby-title'); if (t) t.innerText = '猫盾工业';
                let mb = document.getElementById('mode-bar-current'); if (mb) mb.innerText = '猫盾工业';
            }
        };
        const IND_ORIG_START = lobbyPrimaryStart;
        lobbyPrimaryStart = function () {
            if (gState.gameMode === 'industry') { indEnter(); return; }
            return IND_ORIG_START.apply(this, arguments);
        };

        // ── 调试（只在 ?hcdebug=1 时有用，冒烟测试用）──
        function indAdvance(secs, step) {
            if (!indDebugOn() || !ind || ind.loading) return;
            step = step || 0.05;
            for (let t = 0; t < secs - 1e-9 && ind && !ind.over; t += step) indTick(step);
        }
        function indTeleport(x, z) { if (!indDebugOn() || !ind || ind.loading) return; ind.p.x = x; ind.p.z = z; ind.p.y = indGround(x, z); }
        // 面朝某个点（让瞄准对上）
        function indLookAt(x, z) { if (!indDebugOn() || !ind) return; camera.rotation.set(-0.3, Math.atan2(-(x - ind.p.x), -(z - ind.p.z)), 0, 'YXZ'); camera.updateMatrixWorld(); }
