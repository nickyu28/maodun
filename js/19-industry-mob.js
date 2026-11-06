// 猫盾工业：怪（很菜、很可爱）、刀和盾、宠物装刀盾、狗叫（任务 70 + 补充 + 补充 2）。放在 19-industry-stack.js 后面。
// 怪只在出门的地图和矿洞里有，基地里不刷。附近同时最多 5 只（史莱姆分裂出来的不算），死了 3 分钟内同一块地方（30 米一格）不再刷。
//  史莱姆：平原森林夜里绿的、山地洞里蓝的、古老岩层洞里粉的；大 3 血、中 2、小 1，血打没了就裂成 2 个小一号的，小的打死就没了；蹭一下大 4、中 3、小 2 血；掉黏液 0～2
//  小蘑菇：森林、古老岩层的洞里，2 血，蹭一下 3 血；掉蘑菇 0～2，另外 15% 掉毒蘑菇
//  云团：平原、沙漠的白天，飘着，1 血，蹭一下体温 −0.3（不掉血）；掉云絮 0～1
//  火苗仔：矿洞里，飘着，1 血，蹭一下体温 +0.5（不掉血）；掉木炭 0～1（35% 掉火种等"起火"那条做了再接）
//  刺球：沙漠，3 血，看见你缩 0.8 秒再滚过来撞，撞一下 5 血，撞完歇 2 秒；掉仙人掌 1
//  小野猪：森林、平原，5 血，刨地 1 秒再冲 5 米，撞上 8 血、击退 2 米；掉肉 1～2、皮 0～1
//  小蜜蜂：平原白天，3 只一群，1 血，蜇一下 2 血，蜇完飞开 2 秒；掉蜂蜜 0～1
// 看见（10 米）才追，离开 15 米不追。悠闲伤害 ×0.5、不会被打死（最少剩 1 血）。
// 刀：木 1、石（原来的小刀）2、青铜 3、铁 4、钢 6、钻石 8；左键对着怪挥（冷却 0.6 秒），打一下耐久 −1，用完变断刀（修、拆、熔见 19-industry-repair.js）。
// 盾：选中盾点一下右键举 0.45～0.9 秒，正前方 120° 内挡掉一部分伤害，挡一下耐久 −1，然后冷却；举着走路 ×0.6；选中盾不拉风箱。
// 宠物（驯服的狗、猫）：右键拿刀装刀、拿盾装盾；装了刀的是战斗宠物（最多 5 只），出门跟着你，8 米内有怪就上去打（每秒一下，饱食 −1）。
//  宠物有饱食（狗猫每分钟 −1）和保湿度（每 1.5 分钟 −1，被怪蹭掉），哪个到 0 就睡着（不动、不打），喂吃的／喂水醒；水边 3 米内自己喝。
//  装了盾的宠物，被蹭时按概率这一下不掉保湿度、自己打怪时按概率不掉饱食（木 50%、青铜 65%、铁 80%、钢和钻石 90%），用上一次盾耐久 −1。
// 点一只驯服的狗（左键或右键）它大叫一声"汪！"（1.5 秒），12 米内别的狗 0.2～0.5 秒后跟着叫；一只狗 3 秒内最多叫一次。猫点一下"喵"。声音用 WebAudio 合成（IND_BARK_SRC 填了就用录音）。
        const IND_BARK_SRC = '', IND_MEOW_SRC = '';   // 以后想换真录音：填音频地址
        const MB = { cap: 5, cell: 30, respawn: 180, see: 10, lose: 15, near: 1.3, spawnT: 2, r0: 16, r1: 28, far: 45, swing: 0.6, reach: 2.6, petR: 8, petHit: 1, petMax: 5,
            petFood: 1 / 60, petHyd: 1 / 90, barkT: 1.5, barkCd: 3, barkR: 12, glueR: 1, glueT: 60, glueSlow: 0.3, poisonHits: 10, poisonT: 5, eatPoisonT: 10 };
        const MB_T = {
            slime: { name: '史莱姆', hp: [3, 2, 1], dmg: [4, 3, 2], pet: [8, 6, 4], sp: 7 / 3, r: [0.75, 0.55, 0.38], cd: 1.5 },
            mush: { name: '小蘑菇', hp: 2, dmg: 3, pet: 4, sp: 1.6, r: 0.5, cd: 1.5 },
            cloud: { name: '云团', hp: 1, cool: 0.3, pet: 0, sp: 1.8, r: 0.6, cd: 1.5, fly: 1.7 },
            flame: { name: '火苗仔', hp: 1, warm: 0.5, pet: 0, sp: 2, r: 0.4, cd: 1.5, fly: 0.7 },
            cactus: { name: '刺球', hp: 3, dmg: 5, pet: 4, sp: 1.6, r: 0.5, wind: 0.8, dash: 8, rest: 2 },
            boar: { name: '小野猪', hp: 5, dmg: 8, pet: 6, sp: 2.4, r: 0.6, wind: 1, dash: 12, dashLen: 5, rest: 2, knock: 2 },
            bee: { name: '小蜜蜂', hp: 1, dmg: 2, pet: 2, sp: 3.5, r: 0.3, cd: 0.6, fly: 1.3, away: 2 }
        };
        // 冒烟测试开的页面网址带 ?notut=1：别的检查要在远征里待很久，怪会自己刷出来把人打死，所以测试页默认不自己刷（IND91 打开）。玩家的网址没有这个
        let IND_MB_AUTO = !/[?&]notut\b/.test(location.search);
        const MB_SLIME_COL = { green: 0x3ddc84, blue: 0x42a5f5, pink: 0xf48fb1 };
        Object.assign(IND_HURT, {
            mob_slime: { die: '被史莱姆蹭死了', tag: '史莱姆' }, mob_mush: { die: '被小蘑菇撞死了', tag: '小蘑菇' }, mob_cactus: { die: '被刺球撞死了', tag: '刺球' },
            mob_boar: { die: '被小野猪撞死了', tag: '小野猪' }, mob_bee: { die: '被小蜜蜂蜇死了', tag: '小蜜蜂' }, shroom: { die: '吃了毒蘑菇', tag: '中毒' }, mob_poison: { die: '中毒', tag: '中毒' }
        });
        // ── 刀和盾 ──
        const MB_KNIFE = {
            knife_wood: { dmg: 1, dura: 40, name: '木刀', col: 0xa1887f, in: { wood: 3 }, back: ['wood', 1] },
            knife: { dmg: 2, dura: 60, back: ['stone', 1] },
            knife_bronze: { dmg: 3, dura: 120, name: '青铜刀', col: 0xb87333, in: { bronze: 2, wood: 1 }, back: ['bronze', 1], hard: true },
            knife_iron: { dmg: 4, dura: 200, name: '铁刀', col: 0x757575, in: { ingot_fe: 2, wood: 1 }, back: ['ingot_fe', 1], hard: true },
            knife_steel: { dmg: 6, dura: 500, name: '钢刀', col: 0x90a4ae, in: { steel: 2, wood: 1 }, back: ['steel', 1], hard: true },
            knife_diamond: { dmg: 8, dura: 1500, name: '钻石刀', col: 0x80deea, in: { diamond: 2, steel: 1, wood: 1 }, back: ['diamond', 1], hard: true }
        };
        const MB_SHIELD = {
            shield_wood: { cut: 0.5, up: 0.45, cd: 8, dura: 20, pet: 0.5, name: '木盾', col: 0x8d6e63, in: { wood: 4, rope: 1 }, inCasual: { wood: 5 }, back: ['wood', 2] },   // 悠闲没有草绳：木 5
            shield_bronze: { cut: 0.65, up: 0.55, cd: 7, dura: 40, pet: 0.65, name: '青铜盾', col: 0xb87333, in: { bronze: 4 }, back: ['bronze', 2], hard: true },
            shield_iron: { cut: 0.8, up: 0.65, cd: 6, dura: 60, pet: 0.8, name: '铁盾', col: 0x757575, in: { ingot_fe: 4 }, back: ['ingot_fe', 2], hard: true },
            shield_steel: { cut: 1, up: 0.75, cd: 5, dura: 120, pet: 0.9, name: '钢盾', col: 0x90a4ae, in: { steel: 4 }, back: ['steel', 2], hard: true },
            shield_diamond: { cut: 1, up: 0.9, cd: 4, dura: 300, pet: 0.9, name: '钻石盾', col: 0x80deea, in: { diamond: 3, steel: 2 }, back: ['diamond', 1], hard: true }
        };
        (function () {
            let add = {};
            Object.keys(MB_KNIFE).forEach(function (k) {
                let K = MB_KNIFE[k];
                if (K.name) add[k] = { name: K.name, col: K.col, use: '刀：左键对着怪挥，伤害 ' + K.dmg + '，耐久 ' + K.dura + '；右键狗或猫给它装上' };
                add['broken_' + k] = { name: '断了的' + (K.name || '小刀'), col: 0x616161, use: '工作台：回收一半主料，或者加 1 胶水修好（耐久一半）' };
                if (K.in) IND_CRAFT.push(Object.assign({ out: k, in: K.in }, K.hard ? { hard: true } : {}));
                IND_CRAFT.push(Object.assign({ out: K.back[0], n: K.back[1], in: { ['broken_' + k]: 1 } }, K.hard ? { hard: true } : {}), Object.assign({ out: k, fix: true, in: { ['broken_' + k]: 1, glue: 1 } }, K.hard ? { hard: true } : {}));
                IND_CRAFT.push(Object.assign({ out: k, poison: true, in: { [k]: 1, shroom_bad: 1 } }, K.hard ? { hard: true } : {}));   // 涂毒：刀原样还你，接下来 10 下带毒
            });
            Object.keys(MB_SHIELD).forEach(function (k) {
                let S = MB_SHIELD[k];
                add[k] = { name: S.name, col: S.col, use: '盾：选中点一下右键举 ' + S.up + ' 秒，正前方挡 ' + Math.round(S.cut * 100) + '% 伤害，冷却 ' + S.cd + ' 秒，耐久 ' + S.dura + '；右键狗或猫给它装上' };
                add['broken_' + k] = { name: '断了的' + S.name, col: 0x616161, use: '工作台：回收一半主料，或者加 1 胶水修好（耐久一半）' };
                if (S.inCasual) IND_CRAFT.push({ out: k, in: S.in, hard: true }, { out: k, in: S.inCasual, casual: true });
                else IND_CRAFT.push(Object.assign({ out: k, in: S.in }, S.hard ? { hard: true } : {}));
                IND_CRAFT.push(Object.assign({ out: S.back[0], n: S.back[1], in: { ['broken_' + k]: 1 } }, S.hard ? { hard: true } : {}), Object.assign({ out: k, fix: true, in: { ['broken_' + k]: 1, glue: 1 } }, S.hard ? { hard: true } : {}));
            });
            Object.assign(add, {
                goo: { name: '黏液', col: 0x69f0ae, fuel: 80, use: '①当燃料，一团烧 80 ②撒在农田当肥料（长得快 75%）③炉子里 2 团熬成胶水' },
                glue: { name: '胶水', col: 0xfff9c4, use: '①修断了的刀和盾（工作台）②出门时对着地面右键倒一滩，怪踩上去慢 70%（留 60 秒）' },
                shroom: { name: '蘑菇', col: 0xd7ccc8, use: '灶台烤熟能吃；2 个加一桶开水煮蘑菇汤' },
                shroom_roast: { name: '烤蘑菇', col: 0x8d6e63, eat: { f: 8 } },
                shroom_soup: { name: '蘑菇汤', col: 0xbcaaa4, eat: { f: 20, w: 10, hot: 1 } },
                shroom_bad: { name: '毒蘑菇', col: 0xe53935, eat: { f: 2 }, use: '吃了中毒！工作台：毒蘑菇 + 刀 → 接下来 10 下让怪中毒' },
                fluff: { name: '云絮', col: 0xffffff, eat: { f: 3 }, use: '吃了饱食 +3、体温 −0.5（甜甜的，像棉花糖）；拿着右键作物当浇一次水' },
                honey: { name: '蜂蜜', col: 0xffb300, eat: { f: 10, w: 3 }, use: '能吃；灶台 1 蜂蜜熬 2 糖' }
            });
            Object.assign(IND_ITEMS_RAW, add);
            IND_FERTS.goo = 3;
            IND_RECIPES.push(
                { in: { goo: 2 }, out: { glue: 1 }, cls: 'smelt', minT: 80, time: 10 },   // 胶水：灶台、小熔炉、大窑都能熬（小熔炉只做"冶炼"这一类，所以归这类）
                { in: { shroom: 1 }, out: { shroom_roast: 1 }, minT: 150, time: 15, burnT: 350 },
                { in: { shroom: 2, water_boiled: 1 }, out: { shroom_soup: 1, bucket: 1 }, minT: 100, time: 20, burnT: 400 },   // 汤盛出来，桶还你
                { in: { honey: 1 }, out: { sugar: 2 }, minT: 100, time: 10 }
            );
            ACH.push(
                { id: 'dogsword', hide: 1, ico: '🐕', name: '我的刀盾', desc: '给狗装上刀和盾' },
                { id: 'catshield', hide: 1, ico: '🐈', name: '我的猫盾', desc: '给猫装上刀和盾' },
                { id: 'bark3', hide: 1, ico: '📢', name: '大狗叫叫叫', desc: '同时三只狗在叫' },
                { id: 'bark3arm', hide: 1, ico: '🛡️', name: '我的刀盾大狗叫叫叫', desc: '三只装着刀和盾的狗同时叫' }
            );
            ACH.slice(-4).forEach(function (a) { ACH_BY[a.id] = a; });
        })();
        function mbKnife(k) { return MB_KNIFE[k] || null; }
        function mbShield(k) { return MB_SHIELD[k] || null; }
        function mbIsKnife(k) { return !!MB_KNIFE[k]; }
        // 手上那把刀／盾剩的耐久（同一种叠在一起，只记正在用的那一把）
        // 耐久上限：刀、盾、工具（19-industry-tool.js）；悠闲 ×2
        function mbDurTab(k) { return MB_KNIFE[k] || MB_SHIELD[k] || (typeof TL_TOOL !== 'undefined' && TL_TOOL[k]) || null; }
        // 原始满耐久（不算修过降的上限）；mbMax 是正在用的那一把的上限（修过 N 次少 N × 10%，任务 78，19-industry-repair.js）
        function mbMax0(k) { let T = mbDurTab(k); return T ? T.dura * (indHard() ? 1 : 2) : 0; }
        function mbMax(k) { return rpCap(mbMax0(k), rpCurN(k)); }
        function mbDura(k) {
            let B = ind.base, D = B.dura = B.dura || {};
            if (!(D[k] > 0)) { rpNext(k); D[k] = mbMax(k); }   // 换下一把：先用修过的
            return D[k];
        }
        function mbWear(k) {   // 用掉 1 点耐久；用完这一把变成断的（修过几次跟着它）
            let B = ind.base, left = mbDura(k) - 1;
            if (left > 0) { B.dura[k] = left; return false; }
            rpBroke(k); delete B.dura[k]; indBagDel(k, 1); indBoxAdd('broken_' + k, 1);
            indFlash(indName(k) + '用坏了，变成' + indName('broken_' + k)); ind.hudSig = '';
            return true;
        }
        // ── 怪的样子：圆润、豆豆眼，被打抖一下 ──
        function mbMat(col, o) {
            let M = ind.mbM = ind.mbM || {}, key = col + (o ? 'b' : '');
            if (!M[key]) M[key] = indMat(o ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshLambertMaterial({ color: col }));
            return M[key];
        }
        function mbGeo() {
            if (!ind.mbG) ind.mbG = { s: indGeo(new THREE.SphereGeometry(1, 14, 10)), c: indGeo(new THREE.ConeGeometry(1, 1, 10)), y: indGeo(new THREE.CylinderGeometry(1, 1, 1, 10)) };
            return ind.mbG;
        }
        function mbMesh(m) {
            let G = mbGeo(), g = new THREE.Group(), T = MB_T[m.ty];
            let part = function (geo, col, x, y, z, sx, sy, sz, basic) { let p = new THREE.Mesh(geo, mbMat(col, basic)); p.position.set(x, y, z); p.scale.set(sx, sy, sz); g.add(p); return p; };
            let eyes = function (y, z, s) { [-1, 1].forEach(function (k) { part(G.s, 0xffffff, k * 0.28 * s, y, z, 0.17 * s, 0.17 * s, 0.1 * s, true); part(G.s, 0x111111, k * 0.28 * s, y - 0.02 * s, z + 0.08 * s, 0.09 * s, 0.09 * s, 0.05 * s, true); }); };
            let r = T.r instanceof Array ? T.r[m.sz] : T.r;
            if (m.ty === 'slime') { part(G.s, m.col, 0, r * 0.8, 0, r, r * 0.8, r); eyes(r * 0.95, r * 0.85, r / 0.75 * 1.2); }
            else if (m.ty === 'mush') { part(G.y, 0xfff8e1, 0, 0.25, 0, 0.22, 0.5, 0.22); part(G.s, 0xe53935, 0, 0.55, 0, 0.5, 0.3, 0.5); part(G.s, 0xffffff, 0.2, 0.75, 0.15, 0.08, 0.05, 0.08, true); eyes(0.3, 0.2, 0.8); }
            else if (m.ty === 'cloud') { part(G.s, 0xffffff, 0, 0, 0, 0.5, 0.35, 0.4); part(G.s, 0xffffff, -0.4, -0.05, 0, 0.32, 0.25, 0.3); part(G.s, 0xffffff, 0.4, -0.05, 0, 0.32, 0.25, 0.3); [-1, 1].forEach(function (k) { part(G.s, 0xf8bbd0, k * 0.3, -0.1, 0.33, 0.09, 0.06, 0.03, true); }); eyes(0.05, 0.36, 0.9); }
            else if (m.ty === 'flame') { part(G.c, 0xff9800, 0, 0.35, 0, 0.35, 0.8, 0.35); part(G.s, 0xffeb3b, 0, 0.05, 0, 0.36, 0.3, 0.36, true); eyes(0.15, 0.3, 0.8); }
            else if (m.ty === 'cactus') { part(G.s, 0x43a047, 0, 0.5, 0, 0.5, 0.5, 0.5); [0, 1, 2, 3, 4, 5].forEach(function (i) { let a = i * Math.PI / 3; part(G.c, 0xfff9c4, Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5, 0.05, 0.15, 0.05); }); eyes(0.6, 0.45, 1); }
            else if (m.ty === 'boar') { part(G.s, 0xf48fb1, 0, 0.45, 0, 0.45, 0.4, 0.6); part(G.s, 0xf06292, 0, 0.42, 0.58, 0.17, 0.13, 0.08); [-1, 1].forEach(function (k) { part(G.c, 0xffffff, k * 0.12, 0.33, 0.62, 0.04, 0.14, 0.04); }); eyes(0.62, 0.48, 0.9); }
            else if (m.ty === 'bee') { part(G.s, 0xfdd835, 0, 0, 0, 0.3, 0.26, 0.34); part(G.y, 0x212121, 0, 0, 0, 0.31, 0.08, 0.31); [-1, 1].forEach(function (k) { part(G.s, 0xe3f2fd, k * 0.22, 0.25, -0.05, 0.16, 0.05, 0.12); }); eyes(0.05, 0.28, 0.6); }
            indAdd(g); return g;
        }
        function mbDrop(m) { if (m.g) { scene.remove(m.g); m.g = null; } }
        // ── 刷怪：哪儿刷什么 ──
        function mbKinds(bm, cave) {
            let night = indIsNight(), L = [];
            if (cave) { L.push(cave.bm === 'ancient' ? 'slime:pink' : 'slime:blue', 'flame'); if (cave.bm === 'ancient') L.push('mush'); return L; }
            if ((bm === 'plain' || bm === 'forest') && night) L.push('slime:green');
            if (bm === 'forest') L.push('mush');
            if ((bm === 'plain' || bm === 'desert') && !night) L.push('cloud');
            if (bm === 'desert') L.push('cactus');
            if (bm === 'forest' || bm === 'plain') L.push('boar');
            if (bm === 'plain' && !night) L.push('bee');
            return L;
        }
        function mbCellKey(x, z) { return Math.floor(x / MB.cell) + ',' + Math.floor(z / MB.cell); }
        function mbNew(kind, x, z, o) {
            let p = kind.split(':'), ty = p[0], T = MB_T[ty], m = { ty: ty, x: x, z: z, sz: 0, child: false, hp: 0, cd: 0, st: '', stT: 0, shake: 0, ry: 0 };
            if (o) Object.assign(m, o);
            m.hp = T.hp instanceof Array ? T.hp[m.sz] : T.hp;
            if (ty === 'flame') { m.pts = 3; m.pt = 0; m.life = 5; m.lt = 0; }   // 点数最高 3（每 90 秒回 1）、寿命 5 次（任务 70 补充 4、5）
            m.col = ty === 'slime' ? (m.col || MB_SLIME_COL[p[1] || 'green']) : 0;
            m.g = mbMesh(m); ind.mobs.push(m); return m;
        }
        function mbCount() { return (ind.mobs || []).filter(function (m) { return !m.child && !m.dead && m.ty !== 'flame'; }).length; }   // 火苗仔不死、不算在上限里
        function mbSpawnTry() {
            let n = mbCount(); if (n >= MB.cap) return null;
            let cave = ind.cave, x, z;
            if (cave) { x = cave.cx + 15 + indRand() * (CV.len - 18); z = cave.cz + (indRand() * 2 - 1) * (CV.w - 2); if (Math.hypot(x - ind.p.x, z - ind.p.z) < 8) return null; }
            else { let a = indRand() * Math.PI * 2, d = MB.r0 + indRand() * (MB.r1 - MB.r0); x = ind.p.x + Math.cos(a) * d; z = ind.p.z + Math.sin(a) * d; if (Math.abs(x) > IND_MAP - 4 || Math.abs(z) > IND_MAP - 4 || indHeight(ind.map, x, z) < IND_WATER_Y + 0.3) return null; }
            let dead = ind.mbDead || {}, key = mbCellKey(x, z); if (dead[key] !== undefined && ind.t - dead[key] < MB.respawn) return null;
            let L = mbKinds(indBiome(ind.map, x, z), cave); if (!L.length) return null;
            let kind = L[Math.floor(indRand() * L.length)];
            if (kind === 'bee') { let k = Math.min(3, MB.cap - n), out = []; for (let i = 0; i < k; i++) out.push(mbNew('bee', x + i * 0.8, z + (i % 2) * 0.7)); return out[0]; }
            return mbNew(kind, x, z);
        }
        // ── 打人、打宠物 ──
        function mbBlocking() { return ind.mbBlock && ind.mbBlock.t > 0; }
        function mbFront(x, z) { let f = indFace(), dx = x - ind.p.x, dz = z - ind.p.z, d = Math.hypot(dx, dz) || 1; return (f.x * dx + f.z * dz) / d >= Math.cos(Math.PI / 3) - 1e-6; }
        function mbHitPlayer(m, dmg, key) {
            let T = MB_T[m.ty], cut = 0;
            if (mbBlocking() && mbFront(m.x, m.z)) { let S = MB_SHIELD[ind.mbBlock.k]; cut = S.cut; if (mbWear(ind.mbBlock.k)) ind.mbBlock.t = 0; }
            if (T.cool || T.warm) {   // 云团、火苗仔：不掉血，只改体温
                if (cut >= 1) return 0;
                let S = ind.base.surv; S.temp += (T.warm || -T.cool) * (1 - cut); return 0;
            }
            let n = dmg * (indHard() ? 1 : 0.5) * (1 - cut); if (!(n > 0)) return 0;
            if (!indHard()) n = Math.min(n, Math.max(0, ind.base.surv.hp - 1));   // 悠闲不会被打死
            if (n > 0) indHurt(n, key, T.name, true);
            return n;
        }
        function mbPetShield(pa) { let S = pa.shield && MB_SHIELD[pa.shield]; if (!S || !(indRand() < S.pet)) return false; pa.sd = (pa.sd > 0 ? pa.sd : S.dura) - 1; if (pa.sd <= 0) { indBoxAdd('broken_' + pa.shield, 1); indFlash(IND_ANIMALS[pa.k].name + '的' + indName(pa.shield) + '坏了'); pa.shield = null; delete pa.sd; } return true; }
        function mbHitPet(m, e, amt) { let pa = e.petRef || e; if (!(amt > 0)) return; if (mbPetShield(pa)) return; pa.hyd = Math.max(0, mbHyd(pa) - amt); }
        function mbHyd(a) { return a.hyd === undefined ? 100 : a.hyd; }
        function mbAsleep(a) { let p = a.petRef || a; return (p.k === 'dog' || p.k === 'cat') && (p.food <= 0 || mbHyd(p) <= 0); }
        // ── 每帧（远征里）──
        function mbTargets() {
            let L = [{ x: ind.p.x, z: ind.p.z, me: true }];
            (ind.wild || []).forEach(function (a) { if (a.petRef && a.petRef.weapon && !mbAsleep(a)) L.push({ x: a.x, z: a.z, pet: a }); });
            return L;
        }
        function mbTick(dt) {
            if (ind.where !== 'trip') { if (ind.mobs && ind.mobs.length) { ind.mobs.forEach(mbDrop); ind.mobs = []; } return; }
            if (!ind.mobs) ind.mobs = [];
            ind.mbSpawn = (ind.mbSpawn || 0) - dt;
            if (ind.mbSpawn <= 0) { ind.mbSpawn = MB.spawnT; if (IND_MB_AUTO) mbSpawnTry(); }
            if (ind.glue) ind.glue = ind.glue.filter(function (g) { return g.t > ind.t; });
            let tg = mbTargets();
            ind.mobs.forEach(function (m) {
                let T = MB_T[m.ty];
                m.cd = Math.max(0, m.cd - dt); m.shake = Math.max(0, m.shake - dt);
                if (m.poison > 0) { m.poison -= dt; m.pt = (m.pt || 0) + dt; if (m.pt >= 1) { m.pt -= 1; mbDamage(m, 1, true); } }
                if (m.dead) return;
                if (m.ty === 'flame') { mbFlameTick(m, dt); if (m.dead) return; }
                let best = null, bd = 1e9; tg.forEach(function (t) { let d = Math.hypot(t.x - m.x, t.z - m.z); if (d < bd) { bd = d; best = t; } });
                if (!m.aggro && bd <= MB.see) m.aggro = true; else if (m.aggro && bd > MB.lose) m.aggro = false;
                let slow = (ind.glue || []).some(function (g) { return Math.hypot(g.x - m.x, g.z - m.z) <= MB.glueR; }) ? MB.glueSlow : 1;
                let mv = function (tx, tz, sp) { let dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz); if (d < 0.05) return; let s = Math.min(d, sp * slow * dt); m.x += dx / d * s; m.z += dz / d * s; m.ry = Math.atan2(dx, dz); };
                if (m.st === 'rest' || m.st === 'away') { m.stT -= dt; if (m.st === 'away' && best) mv(m.x + (m.x - best.x), m.z + (m.z - best.z), T.sp); if (m.stT <= 0) m.st = ''; return; }
                if (!m.aggro || !best) { m.wt = (m.wt || 0) - dt; if (m.wt <= 0) { m.wt = 2 + indRand() * 3; m.tx = m.x + (indRand() * 2 - 1) * 4; m.tz = m.z + (indRand() * 2 - 1) * 4; } mv(m.tx, m.tz, T.sp * 0.5); return; }
                if (T.wind) {   // 刺球、小野猪：先缩一下／刨地，再冲
                    if (m.st === '') { if (bd <= (T.dashLen || 6) + 1) { m.st = 'wind'; m.stT = T.wind; m.dx = best.x; m.dz = best.z; } else mv(best.x, best.z, T.sp); return; }
                    if (m.st === 'wind') { m.stT -= dt; m.ry = Math.atan2(best.x - m.x, best.z - m.z); if (m.stT <= 0) { let dx = best.x - m.x, dz = best.z - m.z, d = Math.hypot(dx, dz) || 1; m.st = 'dash'; m.vx = dx / d; m.vz = dz / d; m.left = T.dashLen || Math.max(2, d + 1); } return; }
                    if (m.st === 'dash') {
                        let s = Math.min(m.left, T.dash * slow * dt); m.x += m.vx * s; m.z += m.vz * s; m.left -= s;
                        let hit = tg.filter(function (t) { return Math.hypot(t.x - m.x, t.z - m.z) <= MB.near; })[0];
                        if (hit) { mbHit(m, hit); if (T.knock && hit.me) { ind.p.x += m.vx * T.knock; ind.p.z += m.vz * T.knock; } m.st = 'rest'; m.stT = T.rest; return; }
                        if (m.left <= 0) { m.st = 'rest'; m.stT = T.rest; }
                        return;
                    }
                }
                if (bd > MB.near) { mv(best.x, best.z, T.sp); return; }
                if (m.cd <= 0) { m.cd = T.cd; mbHit(m, best); if (T.away) { m.st = 'away'; m.stT = T.away; } }
            });
            ind.mobs = ind.mobs.filter(function (m) {
                if (!m.dead && Math.hypot(m.x - ind.p.x, m.z - ind.p.z) <= MB.far) return true;
                mbDrop(m); return false;
            });
            mbPetTick(dt);
            mbBlockTick(dt);
            mbFlameSpawn(); lvTick(dt);
        }
        // ── 火苗仔：点数（颜色）、寿命、岩浆边不燃尽（任务 70 补充 4、5）──
        const MB_FLAME = { cols: [0x37474f, 0xb71c1c, 0xffb300, 0xff9800], ptT: 90, lifeT: 60, lifeMax: 5, lavaR: 3, volcR: 30 };
        function mbFlameLook(m) {
            if (!m.g) return; let c = MB_FLAME.cols[Math.max(0, Math.min(3, m.pts))];
            m.g.children[0].material = mbMat(c, false); m.g.children[1].material = mbMat(m.pts > 0 ? 0xffeb3b : 0x616161, true);
        }
        function mbFlameOut(m) { m.dead = true; mbDrop(m); indFlash('燃尽了'); }
        function mbFlameTick(m, dt) {
            if (m.pts < 3) { m.pt += dt; if (m.pt >= MB_FLAME.ptT) { m.pt = 0; m.pts++; } }
            if (m.life < MB_FLAME.lifeMax && lvDist(m.x, m.z) <= MB_FLAME.lavaR) { m.lt += dt; if (m.lt >= MB_FLAME.lifeT) { m.lt = 0; m.life++; } } else if (lvDist(m.x, m.z) > MB_FLAME.lavaR) m.lt = 0;
            if (m.look !== m.pts) { m.look = m.pts; mbFlameLook(m); }
        }
        // 出门地图上的火山边（30 米内）同一时刻最多 1 只；玩家走到火山附近才刷
        function mbFlameSpawn() {
            if (!IND_MB_AUTO || ind.cave || !ind.map || !ind.map.volc) return;
            ind.map.volc.forEach(function (v, i) {
                if (Math.hypot(ind.p.x - v.x, ind.p.z - v.z) > v.r * 1.6 + 40) return;
                if (ind.mobs.some(function (m) { return m.ty === 'flame' && !m.dead && Math.hypot(m.x - v.x, m.z - v.z) < MB_FLAME.volcR + v.r; })) return;
                let k = (ind.mbFl = ind.mbFl || {}); if (k[i] !== undefined && ind.t - k[i] < MB.respawn) return;
                k[i] = ind.t; let a = indRand() * Math.PI * 2, d = v.r * 0.45 + 6 + indRand() * 10;
                mbNew('flame', v.x + Math.cos(a) * d, v.z + Math.sin(a) * d);
            });
        }
        function mbHit(m, t) {
            let T = MB_T[m.ty], dmg = T.dmg instanceof Array ? T.dmg[m.sz] : (T.dmg || 0);
            if (t.me) mbHitPlayer(m, dmg, 'mob_' + (m.ty === 'slime' ? 'slime' : m.ty));
            else mbHitPet(m, t.pet, T.pet instanceof Array ? T.pet[m.sz] : T.pet);
        }
        // 打怪：血打没了史莱姆裂开，别的掉东西
        function mbDamage(m, n, poison) {
            if (m.dead) return;
            if (m.ty === 'flame') { m.shake = 0.3; return; }   // 火苗仔打不死，只抖一下
            m.hp -= n; m.shake = 0.3;
            if (m.hp > 0) return;
            m.dead = true; mbDrop(m);
            if (m.ty === 'slime' && m.sz < 2) { for (let i = 0; i < 2; i++) { let a = indRand() * Math.PI * 2; mbNew('slime', m.x + Math.cos(a) * 0.6, m.z + Math.sin(a) * 0.6, { sz: m.sz + 1, child: true, col: m.col, aggro: true }); } return; }
            (ind.mbDead = ind.mbDead || {})[mbCellKey(m.x, m.z)] = ind.t;
            let G = ind.tripGround = ind.tripGround || [], put = function (k, n) { for (let i = 0; i < n; i++) G.push({ k: k, x: m.x + (indRand() - 0.5), z: m.z + (indRand() - 0.5) }); };
            let r = function (a, b) { return a + Math.floor(indRand() * (b - a + 1)); };
            if (m.ty === 'slime') put('goo', r(0, 2));
            else if (m.ty === 'mush') { put('shroom', r(0, 2)); if (indRand() < 0.15) put('shroom_bad', 1); }
            else if (m.ty === 'cloud') put('fluff', r(0, 1));
            else if (m.ty === 'cactus') put('cactus', 1);
            else if (m.ty === 'boar') { put('meat_raw', r(1, 2)); put('hide', r(0, 1)); }
            else if (m.ty === 'bee') put('honey', r(0, 1));
            if (typeof nkTripItemsSync === 'function') nkTripItemsSync();
        }
        // 左键拿着刀：打面前 2.6 米内最近的怪
        function mbAttack() {
            if (ind.where !== 'trip' || !ind.mobs || !ind.mobs.length) return false;
            let k = indSel(); if (!mbIsKnife(k)) return false;
            let best = null, bd = MB.reach;
            ind.mobs.forEach(function (m) { let d = Math.hypot(m.x - ind.p.x, m.z - ind.p.z); if (!m.dead && d <= bd && (d < 0.8 || mbFront(m.x, m.z))) { bd = d; best = m; } });
            if (!best) return false;
            if (best.ty === 'flame') { best.shake = 0.3; return true; }   // 刀打火苗仔：抖一下，不伤刀、不弹字
            if (ind.mbSwing > ind.t) return true;
            ind.mbSwing = ind.t + MB.swing;
            let P = ind.base.poisonK, pois = P && P.k === k && P.n > 0;
            if (pois) { P.n--; best.poison = MB.poisonT; best.pt = 0; if (!P.n) { delete ind.base.poisonK; indFlash('刀上的毒用完了'); } }
            mbDamage(best, MB_KNIFE[k].dmg);
            mbWear(k);
            return true;
        }
        // ── 盾：选中点一下右键举起 ──
        function mbShieldDown() {
            let k = indSel(), S = MB_SHIELD[k]; if (!S) return false;
            let B = ind.mbBlock = ind.mbBlock || { t: 0, cd: 0, k: k };
            if (B.t > 0) return true;
            if (B.cd > 0) { indFlash('盾还在冷却（' + Math.ceil(B.cd) + ' 秒）'); return true; }
            B.k = k; B.t = S.up; B.cd = S.up + S.cd;
            return true;
        }
        function mbBlockTick(dt) {
            let B = ind.mbBlock; if (!B) return;
            B.t = Math.max(0, B.t - dt); B.cd = Math.max(0, B.cd - dt);
        }
        function mbMoveMul() { return ind && mbBlocking() ? 0.6 : 1; }
        // ── 宠物 ──
        function mbPetCount(except) { return ind.base.animals.filter(function (a) { return a !== except && a.weapon; }).length; }
        function mbPetOf(a) { if (!a) return null; if (a.petRef) return a.petRef; if (ind.where === 'base' && (a.k === 'dog' || a.k === 'cat')) return a; if (a.follow && (a.k === 'dog' || a.k === 'cat')) return a; return null; }
        // 右键宠物：拿刀装刀、拿盾装盾、拿水喂水
        function mbPetUse(a, k) {
            let p = mbPetOf(a); if (!p || !k) return false;
            let nm = IND_ANIMALS[p.k].name;
            if ((mbIsKnife(k) || MB_SHIELD[k]) && ind.where === 'trip' && !a.petRef) { indFlash('先带回家再给它装'); return true; }
            if (mbIsKnife(k)) {
                if (!p.weapon && mbPetCount(p) >= MB.petMax) { indFlash('最多 ' + MB.petMax + ' 只战斗的宠物'); return true; }
                if (p.weapon) indBagAdd(p.weapon, 1);
                indBagDel(k, 1); p.weapon = k; p.wd = MB_KNIFE[k].dura; mbPetAch(p); indSave(); return true;
            }
            if (MB_SHIELD[k]) {
                if (p.shield) indBagAdd(p.shield, 1);
                indBagDel(k, 1); p.shield = k; p.sd = MB_SHIELD[k].dura; mbPetAch(p); indSave(); return true;
            }
            let kc = indContOf(k);
            if ((p.k === 'dog' || p.k === 'cat') && kc && (kc.base === 'water_raw' || kc.base === 'water_boiled')) {
                indBagDel(k, 1); indBagAdd(indEmptyKey(kc.mat), 1); p.hyd = 100; indSave(); return true;
            }
            return false;
        }
        function mbPetAch(p) { if (p.weapon && p.shield) indAch(p.k === 'dog' ? 'dogsword' : 'catshield'); }
        // 狗猫每帧（基地和出门都走）：饱食、保湿度、水边喝水
        function mbPetLife(p, x, z, dt, trip) {
            if (p.k !== 'dog' && p.k !== 'cat') return;
            p.hyd = Math.max(0, mbHyd(p) - MB.petHyd * dt);
            let wet = trip ? indHeight(ind.map, x, z) < IND_WATER_Y + 0.4 : Math.hypot(x - IND_BASE_ST.pool.x, z - IND_BASE_ST.pool.z) <= 3 && !ind.base.off.pool;
            if (wet && p.hyd < 100) p.hyd = 100;
        }
        // 出门：装了刀、醒着的宠物跟着（记着基地那只，不另存），回家不用走回撤离点
        function mbPetsOut() {
            ind.base.animals.forEach(function (a) { if (a.weapon && !mbAsleep(a)) ind.wild.push({ k: a.k, x: ind.p.x + 1 + indRand(), z: ind.p.z + 1 + indRand(), follow: true, fed: 99, petRef: a }); });
        }
        function mbPetTick(dt) {
            (ind.wild || []).forEach(function (e) {
                let p = e.petRef; if (!p) return;
                p.food = Math.max(0, p.food - MB.petFood * dt); mbPetLife(p, e.x, e.z, dt, true);
                e.fight = false;
                if (mbAsleep(e) || !p.weapon) return;
                let best = null, bd = MB.petR; (ind.mobs || []).forEach(function (m) { let d = Math.hypot(m.x - e.x, m.z - e.z); if (!m.dead && d <= bd) { bd = d; best = m; } });
                if (!best) return;
                e.fight = true;
                if (bd > 1.2) { let s = Math.min(bd - 1, 6 * dt); e.x += (best.x - e.x) / bd * s; e.z += (best.z - e.z) / bd * s; e.ry = Math.atan2(best.x - e.x, best.z - e.z); return; }
                e.hitT = (e.hitT || 0) - dt; if (e.hitT > 0) return; e.hitT = MB.petHit;
                mbDamage(best, MB_KNIFE[p.weapon].dmg);
                if (!mbPetShield(p)) p.food = Math.max(0, p.food - 1);
                p.wd = (p.wd > 0 ? p.wd : MB_KNIFE[p.weapon].dura) - 1;
                if (p.wd <= 0) { indBoxAdd('broken_' + p.weapon, 1); indFlash(IND_ANIMALS[p.k].name + '的' + indName(p.weapon) + '断了'); p.weapon = null; delete p.wd; }
            });
        }
        // ── 狗叫、猫叫 ──
        function mbBark(a, chain) {
            let p = mbPetOf(a) || a; if (!p || (p.k !== 'dog' && p.k !== 'cat')) return false;
            if (!(a.follow || a.petRef || ind.where === 'base')) return false;   // 野的不叫
            if (a.barkCd > ind.t) return false;
            a.barkCd = ind.t + MB.barkCd; a.barkT = ind.t + MB.barkT;
            mbSound(p.k === 'dog' ? 'bark' : 'meow');
            if (p.k === 'dog' && !chain) indAnimals().forEach(function (b) { if (b !== a && (mbPetOf(b) || {}).k === 'dog' && Math.hypot(b.x - a.x, b.z - a.z) <= MB.barkR) b.barkAt = ind.t + 0.2 + indRand() * 0.3; });
            mbBarkAch();
            return true;
        }
        function mbBarking() { return indAnimals().filter(function (b) { let p = mbPetOf(b); return p && p.k === 'dog' && b.barkT > ind.t; }); }
        function mbBarkAch() {
            let L = mbBarking(); if (L.length < 3) return;
            indAch('bark3');
            if (L.filter(function (b) { let p = mbPetOf(b); return p.weapon && p.shield; }).length >= 3) indAch('bark3arm');
        }
        function mbBarkTick() { indAnimals().forEach(function (b) { if (b.barkAt && ind.t >= b.barkAt) { b.barkAt = 0; mbBark(b, true); } }); }
        let MB_AC = null;
        function mbSound(kind) {
            try {
                let src = kind === 'bark' ? IND_BARK_SRC : IND_MEOW_SRC;
                if (src) { new Audio(src).play(); return; }
                MB_AC = MB_AC || new (window.AudioContext || window.webkitAudioContext)();
                let C = MB_AC, t = C.currentTime, g = C.createGain(); g.connect(C.destination);
                if (kind === 'bark') {   // 一下短噪声 + 两段往下滑的低音
                    let b = C.createBuffer(1, C.sampleRate * 0.06, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
                    let ns = C.createBufferSource(); ns.buffer = b; ns.connect(g); ns.start(t);
                    [0, 0.13].forEach(function (o) { let os = C.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(420, t + o); os.frequency.exponentialRampToValueAtTime(160, t + o + 0.12); os.connect(g); os.start(t + o); os.stop(t + o + 0.12); });
                    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
                } else {
                    let os = C.createOscillator(); os.type = 'triangle'; os.frequency.setValueAtTime(700, t); os.frequency.linearRampToValueAtTime(1000, t + 0.12); os.frequency.linearRampToValueAtTime(600, t + 0.3); os.connect(g); os.start(t); os.stop(t + 0.32);
                    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.32);
                }
            } catch (e) { }
        }
        // ── 头顶的字（汪！、喵、Zzz、刀盾图标）和怪的位置：一帧画一次 ──
        function mbTex(text) {
            let T = ind.mbTx = ind.mbTx || {}; if (T[text]) return T[text];
            let cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; let g = cv.getContext('2d');
            g.font = 'bold 60px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeText(text, 128, 52); g.fillStyle = '#fff'; g.fillText(text, 128, 52);
            T[text] = indMat(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
            return T[text];
        }
        function mbSync() {
            if (!ind || ind.dead) return;
            (ind.mobs || []).forEach(function (m) {
                if (!m.g) return; let T = MB_T[m.ty], s = m.shake > 0 ? 1 + Math.sin(m.shake * 60) * 0.15 : 1, sq = m.st === 'wind' ? 0.8 : 1;
                m.g.position.set(m.x, indGround(m.x, m.z) + (T.fly ? T.fly + Math.sin(ind.t * 3 + m.x) * 0.15 : 0), m.z); m.g.rotation.y = m.ry || 0; m.g.scale.set(s, s * sq, s);
            });
            let P = ind.mbSpr = ind.mbSpr || [], used = 0;
            let show = function (text, x, y, z) { let sp = P[used]; if (!sp || !sp.parent) { sp = new THREE.Sprite(mbTex(text)); indAdd(sp); P[used] = sp; } sp.material = mbTex(text); sp.scale.set(1.6, 0.6, 1); sp.position.set(x, y, z); sp.visible = true; used++; };
            indAnimals().forEach(function (a) {
                let p = mbPetOf(a); if (!p) return;
                let y = indGround(a.x, a.z) + IND_ANIMALS[p.k].size[1] + 0.7, txt = a.barkT > ind.t ? (p.k === 'dog' ? '汪！' : '喵') : mbAsleep(a) ? 'Zzz' : (p.weapon ? '刀' : '') + (p.shield ? '盾' : '');
                if (txt && used < 40) show(txt, a.x, y, a.z);
            });
            for (let i = used; i < P.length; i++) if (P[i]) P[i].visible = false;
            if (mbBlocking()) {
                if (!ind.mbShieldMesh || !ind.mbShieldMesh.parent) { ind.mbShieldMesh = new THREE.Mesh(mbGeo().y, mbMat(MB_SHIELD[ind.mbBlock.k].col)); indAdd(ind.mbShieldMesh); }
                let f = indFace(); ind.mbShieldMesh.visible = true; ind.mbShieldMesh.position.set(ind.p.x + f.x * 0.7, ind.p.y + 1.1, ind.p.z + f.z * 0.7); ind.mbShieldMesh.scale.set(0.5, 0.08, 0.5); ind.mbShieldMesh.rotation.set(Math.PI / 2, Math.atan2(f.x, f.z), 0, 'YXZ');
            } else if (ind.mbShieldMesh) ind.mbShieldMesh.visible = false;
        }
        // ── 用东西：吃毒蘑菇、吃云絮、云絮浇地、胶水倒地上 ──
        function mbUse(k, a) {
            if (k === 'fluff' && a && a.kind === 'crop') { indBagDel(k, 1); let end = (Math.floor(ind.base.clock / IND_DAY) + 1) * IND_DAY; a.o.wet = end; ind.cropDirty = true; indSave(); return true; }
            if (k === 'glue') {
                if (ind.where !== 'trip') { indFlash('胶水出门时倒在地上，粘住怪'); return true; }
                let f = indFace(); indBagDel('glue', 1); (ind.glue = ind.glue || []).push({ x: ind.p.x + f.x * 1.5, z: ind.p.z + f.z * 1.5, t: ind.t + MB.glueT }); return true;
            }
            return false;
        }
        function mbAte(k) {
            let S = ind.base.surv;
            if (k === 'fluff') { S.temp -= 0.5; indFlash('甜甜的，像棉花糖'); }
            if (k === 'shroom_bad') { if (indHard()) { ind.mbSick = MB.eatPoisonT; indFlash('毒蘑菇！中毒了'); } else indFlash('肚子不舒服'); }
        }
        function mbBodyTick(dt) {
            if (ind.mbSick > 0) { let h = Math.min(dt, ind.mbSick); ind.mbSick -= dt; if (indHurt(h, 'shroom', '吃了毒蘑菇')) return; }
            mbBarkTick();
        }
        function mbHud() {
            let k = indSel(), D = mbDurTab(k); if (!D) return '';
            let s = indName(k) + ' 耐久 ' + mbDura(k) + ' / ' + mbMax(k);
            if (MB_SHIELD[k] && ind.mbBlock && ind.mbBlock.cd > 0) s += ind.mbBlock.t > 0 ? '　<b>举着</b>' : '　冷却 ' + Math.ceil(ind.mbBlock.cd) + ' 秒';
            let P = ind.base.poisonK; if (P && P.k === k) s += '　带毒还剩 ' + P.n + ' 下';
            return s;
        }
        // 合成：涂毒、胶水 + 原料修（每修一次上限少 10%）
        (function () {
            let c0 = indCraft;
            indCraft = function (i) {
                let r = IND_CRAFT[i];
                if (r && r.fix && !rpFixOk(r.out)) return false;   // 修到上限只剩 0 就修不了（任务 78）
                let ok = c0(i);
                if (ok && r && r.poison) { ind.base.poisonK = { k: r.out, n: MB.poisonHits }; indFlash(indName(r.out) + '涂上毒了'); }
                if (ok && r && r.fix) rpFixed(r.out);
                return ok;
            };
        })();
        function mbFixBase(b) {
            let fx = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return {}; let r = {}; Object.keys(o).forEach(function (k) { if (mbDurTab(k)) r[k] = indNum(o[k], 1, 1, 1e4) | 0; }); return r; };
            let T = null;
            b.dura = fx(b.dura); b.duraHalf = fx(b.duraHalf);
            if (b.poisonK && !(MB_KNIFE[b.poisonK.k] && b.poisonK.n > 0)) delete b.poisonK; else if (b.poisonK) b.poisonK = { k: b.poisonK.k, n: indNum(b.poisonK.n, 1, 1, MB.poisonHits) | 0 };
            (b.animals || []).forEach(function (a) {
                if (a.weapon !== undefined && !MB_KNIFE[a.weapon]) a.weapon = null;
                if (a.shield !== undefined && !MB_SHIELD[a.shield]) a.shield = null;
                if (a.wd !== undefined) a.wd = indNum(a.wd, 1, 1, 1e4); if (a.sd !== undefined) a.sd = indNum(a.sd, 1, 1, 1e4);
                if (a.hyd !== undefined) a.hyd = indNum(a.hyd, 100, 0, 100);
            });
        }
        // 换地图（出门、回家）：怪和共用的模型、贴图跟着世界一起清掉
        function mbReset() { if (!ind) return; ind.mobs = []; ind.mbG = null; ind.mbM = null; ind.mbTx = null; ind.mbSpr = null; ind.mbShieldMesh = null; ind.glue = null; ind.mbBlock = null; }
