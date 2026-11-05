        // ══════════════════════════════════════════════════════════
        //  猫盾工业：肉、皮、骨（任务 41）。排在 GAME_FILES 最后，往配方表追加的放这里。
        //  基地里成年的羊、牛，远征里的野兔、野鹿能宰：拿着工具对着它按住右键 1 秒（基地里再确认一次）。狗和猫永远不能宰。
        //  不流血、不倒地：冒一团烟就没了，原地掉东西。野兔、野鹿见人会跑，野鹿要打 3 下。
        // ══════════════════════════════════════════════════════════
        const FM = { hold: 1, fleeR: 4, fleeT: 1.5, restT: 2.5, fleeSp: 4, wildN: 10, reach: 4 };
        Object.assign(IND_ITEMS_RAW, {
            meat_raw: { name: '生肉', col: 0xe57373, eat: { f: 5, ache: 0.5 }, use: '烤成烤肉、煮肉汤；狗和猫爱吃（生吃一半可能肚子疼）' },
            meat_roast: { name: '烤肉', col: 0x8d4b2a, eat: { f: 55, w: -5 } },
            meat_soup: { name: '肉汤', col: 0xbf8040, eat: { f: 40, w: 20, back: 'bucket', hot: 1 } },
            hide: { name: '皮', col: 0xa1887f, use: '做风箱（以后）、皮鞋、自行车座和轮胎、皮背包要用' },
            bone: { name: '骨', col: 0xeeeeee, use: '放进粉碎机碎成骨粉；也能喂狗' },
            bonemeal: { name: '骨粉', col: 0xf5f5f5, use: '右键撒在有作物的农田上，这一季长得快 75%（比硝石弱）' }
        });
        IND_CONT_BASES.push('meat_soup');   // 肉汤跟别的汤一样装在桶里
        IND_FERTS.bonemeal = 3;
        Object.assign(IND_ANIMALS, {
            rabbit: { name: '野兔', col: 0xbcaaa4, size: [0.55, 0.4, 0.3], food: [], tame: 0, biome: [], wildOnly: true, hp: 1, spawn: ['plain', 'forest', 'desert'] },
            deer: { name: '野鹿', col: 0xa1663a, size: [1.5, 1.3, 0.55], food: [], tame: 0, biome: [], wildOnly: true, hp: 3, spawn: ['forest', 'plain'] }
        });
        const FM_DROP = { sheep: { meat_raw: 2, hide: 1 }, cow: { meat_raw: 3, hide: 2, bone: 1 }, rabbit: { meat_raw: 1, hide: 1 }, deer: { meat_raw: 2, hide: 2, bone: 1 } };
        IND_ANIMALS.dog.food.push('meat_raw', 'meat_roast', 'bone');
        IND_ANIMALS.cat.food.push('meat_raw', 'meat_roast');
        IND_RECIPES.push(
            { in: { meat_raw: 1 }, out: { meat_roast: 1 }, minT: 180, time: 30, burnT: 400 },
            { in: { water_boiled: 1, meat_raw: 1, salt: 1 }, out: { meat_soup: 1 }, minT: 150, time: 25, burnT: 400, pri: true }
        );
        // 远征图上撒野兔、野鹿（自己一个随机数，不改原来的动物和撤离点）
        function fmSpawnWild(M) {
            let r = indRng((M.seed ^ 0x2545f491) >>> 0), ks = ['rabbit', 'rabbit', 'deer'];
            for (let n = 0, t = 0; n < FM.wildN && t < 400; t++) {
                let x = (r() * 2 - 1) * (IND_MAP - 10), z = (r() * 2 - 1) * (IND_MAP - 10), k = ks[Math.floor(r() * ks.length)];
                if (Math.hypot(x, z) < 12 || indHeight(M, x, z) < -0.8 || IND_ANIMALS[k].spawn.indexOf(indBiome(M, x, z)) < 0) continue;
                ind.wild.push({ k: k, x: x, z: z, fed: 0, follow: false, hp: IND_ANIMALS[k].hp }); n++;
            }
        }
        // 见人就跑：人进 4 米跑 1.5 秒，再歇 2.5 秒（歇着的时候能打）
        function fmFlee(a, dt) {
            let D = IND_ANIMALS[a.k]; if (!D.wildOnly) return false;
            if (a.rest > 0) { a.rest -= dt; return false; }
            if (!(a.flee > 0)) {
                let d = Math.hypot(a.x - ind.p.x, a.z - ind.p.z);
                if (d > FM.fleeR) return false;
                a.flee = FM.fleeT;
            }
            a.flee -= dt;
            let dx = a.x - ind.p.x, dz = a.z - ind.p.z, d = Math.hypot(dx, dz) || 1;
            a.tx = a.x + dx / d * 5; a.tz = a.z + dz / d * 5;
            if (a.flee <= 0) { a.flee = 0; a.rest = FM.restT; }
            return true;
        }
        function fmIsTool(k) { return !!k && !!IND_ITEMS[k] && (!!IND_ITEMS[k].tool || ['axe', 'knife', 'shears', 'tongs'].indexOf(k) >= 0); }
        // 能不能宰：不能的返回原因
        function fmWhyNot(a) {
            let D = IND_ANIMALS[a.k];
            if (a.k === 'dog' || a.k === 'cat') return '这是朋友';
            if (!FM_DROP[a.k]) return '';
            if (ind.where === 'base' && indIsBaby(a)) return '还太小';
            if (ind.where === 'base' && a.brk > 0) return '怀着呢';
            if (ind.where === 'trip' && !D.wildOnly) return '野生的' + D.name + '可以驯回家';
            return null;
        }
        function fmKillStart(aim) {
            if (!aim || aim.kind !== 'animal' || !fmIsTool(indSel())) return false;
            let a = aim.o, why = fmWhyNot(a);
            if (why === '') return false;
            if (why) { indFlash(why); return true; }
            return wdChStart({ kind: 'kill', need: FM.hold, right: true, o: a, label: '宰', done: function () { fmHit(a); } });
        }
        // 按满 1 秒：野的打一下（野鹿 3 下），基地里的弹确认
        function fmHit(a) {
            if (indAnimals().indexOf(a) < 0) return false;
            if (Math.hypot(a.x - ind.p.x, a.z - ind.p.z) > FM.reach) { indFlash('跑远了'); return false; }
            if (ind.where === 'base') {
                showSysModal('宰了这只' + IND_ANIMALS[a.k].name + '？', '会得到 ' + fmDropTxt(a.k) + '。', [{ label: '宰', color: '#d84315', onClick: function () { fmKill(a); } }, { label: '算了' }]);
                return true;
            }
            a.hp = (a.hp === undefined ? IND_ANIMALS[a.k].hp : a.hp) - 1;
            if (a.hp > 0) { a.flee = FM.fleeT; a.rest = 0; indFlash('打中了，还要 ' + a.hp + ' 下'); return true; }
            return fmKill(a);
        }
        function fmDropTxt(k) { let d = FM_DROP[k]; return Object.keys(d).map(function (x) { return indName(x) + ' ×' + d[x]; }).join('、'); }
        function fmKill(a) {
            let A = indAnimals(), i = A.indexOf(a); if (i < 0 || !FM_DROP[a.k]) return false;
            A.splice(i, 1);
            let G = ind.where === 'trip' ? (ind.tripGround || (ind.tripGround = [])) : ind.base.ground, d = FM_DROP[a.k], j = 0;
            Object.keys(d).forEach(function (k) { for (let n = 0; n < d[k]; n++, j++) { let g = j * 2.399, rr = 0.3 + 0.2 * Math.sqrt(j); G.push({ k: k, x: a.x + Math.cos(g) * rr, z: a.z + Math.sin(g) * rr }); } });
            ind.itemDirty = true;
            try { let m = new THREE.Mesh(indGeo(new THREE.SphereGeometry(0.7, 10, 6)), indMat(new THREE.MeshBasicMaterial({ color: 0xbdbdbd, transparent: true, opacity: 0.7 }))); m.position.set(a.x, 0.8, a.z); indAdd(m); ind.booms = ind.booms || []; ind.booms.push({ m: m, t: 0 }); } catch (e) { }   // 一团烟
            if (ind.where === 'base') indSave();
            indFlash(IND_ANIMALS[a.k].name + '没了，掉了 ' + fmDropTxt(a.k));
            return true;
        }

        // ══ 任务 42：塑料和人造革 ══
        // 塑料：大窑化学批次，石油桶 1 + 氯气瓶 1 → 塑料 4（还空桶、空瓶）；天然气 1 + 氯气瓶 1 → 塑料 6（还空钢瓶、空瓶）。150°C、30 秒
        // 人造革：工作台 塑料 2 + 毛线 2 → 2（布上涂一层塑料）。凡是用"皮"的工作台配方，都自动多一条用人造革的（数量一样）
        Object.assign(IND_ITEMS_RAW, {
            plastic: { name: '塑料', col: 0xe0f7fa, use: '做人造革、管道（1 个出 6 段）；以后做自行车和车的轮胎' },
            pleather: { name: '人造革', col: 0x6d4c41, use: '能代替皮：用皮的配方都能用它做' }
        });
        IND_ITEMS_RAW.pipe.name = '管道';
        IND_RECIPES.push(
            { in: { oil: 1, b_cl2: 1 }, out: { plastic: 4, bucket: 1, bottle: 1 }, cls: 'chem', pri: true, minT: 150, time: 30, hard: true },
            { in: { gas_ng: 1, b_cl2: 1 }, out: { plastic: 6, cyl: 1, bottle: 1 }, cls: 'chem', pri: true, minT: 150, time: 30, hard: true }
        );
        IND_CRAFT.push({ out: 'pleather', n: 2, in: { plastic: 2, yarn: 2 }, hard: true }, { out: 'pipe', n: 6, in: { plastic: 1 }, hard: true });
        // 用皮的配方各加一条人造革的备选（放在文件最后统一加，以后新加的用皮配方也写在这句前面）
        function fmPleatherAlts() {
            IND_CRAFT.slice().forEach(function (r) {
                if (!r.in.hide || r.leather) return;
                let alt = Object.assign({}, r, { in: {}, leather: true }); Object.keys(r.in).forEach(function (k) { alt.in[k === 'hide' ? 'pleather' : k] = r.in[k]; });
                IND_CRAFT.splice(IND_CRAFT.indexOf(r) + 1, 0, alt);
            });
        }

        // ══ 任务 44：风箱要人拉 + 扇子 ══
        // 风箱（不用电）：炉子开着"鼓风"档、人站在旁边按住右键拉，目标温度才是 1600°C；松手掉回大火（1200）。拉的时候每秒吃 3 体力（扇炉子 4、扇自己 2）。
        // 扇子：手里拿着按住右键。对着点着的炉子（3 米内）扇，目标 1400°C；不对着炉子是扇自己，体温往 37°C 拉（每秒 0.3°C）。没体力就停
        const FM_PULL = { near: 3, grace: 0.3, bellows: 3, fanCook: 4, fanSelf: 2, fanT: 1400, selfRate: 0.3 };
        Object.assign(IND_ITEMS_RAW, { fan: { name: '扇子', col: 0xdce775, use: '按住右键扇：对着点着的炉子扇到 1400°C；不对着炉子是扇自己，热了凉快、冷了也往舒服拉（吃体力）' } });
        IND_ITEMS_RAW.bellows.use = '装在炉子上多一档「鼓风」，要人站在旁边按住右键拉才到 1600°C，松手掉回大火（吃体力）';
        IND_CRAFT.push({ out: 'fan', in: { grass: 6, rope: 2, wood: 1 }, hard: true });
        function fmBlowerOn(c) { return typeof fmBlowerPw === 'function' && fmBlowerPw(c); }   // 电动鼓风机（任务 51）
        // 这一帧炉子实际按哪档烧：鼓风档没人拉、也没电动鼓风机，就按大火；扇子扇着的炉子目标 1400
        function fmFireEff(c, dt) {
            let S = c.C, F = indFireDef(c.ty, S.fire);
            if (S.blow > 0) S.blow = Math.max(0, S.blow - dt);
            if (S.fan > 0) S.fan = Math.max(0, S.fan - dt);
            if (S.fire === 4 && !(S.blow > 0) && !fmBlowerOn(c)) F = indFireDef(c.ty, 3);
            if (S.fan > 0 && S.fire > 0 && F.t < FM_PULL.fanT) F = { name: F.name, t: FM_PULL.fanT, burn: F.burn };
            return F;
        }
        function fmCookOfAim(a) { return a && a.kind === 'stove' ? indCookById('stove') : a && a.kind === 'cook' ? indCookById(a.o.id) : null; }
        function fmPullDown(a) {
            let k = indSel(), c = fmCookOfAim(a);
            if (k === 'fan') { ind.pull = { c: c && c.C.fire > 0 ? c.id : null, fan: true, t: 0 }; return true; }
            if (c && c.C.bellows && c.C.fire === 4) { ind.pull = { c: c.id, fan: false, t: 0 }; return true; }
            return false;
        }
        function fmPullUp() { if (!ind || !ind.pull) return false; ind.pull = null; ind.effort = 0; return true; }
        function fmPullTick(dt) {
            ind.effort = 0;
            let P = ind.pull; if (!P) return;
            if (ind.stam <= 0) { ind.pull = null; indFlash('没力气了'); return; }
            if (P.fan && indSel() !== 'fan') { ind.pull = null; return; }
            P.t += dt;
            if (P.c === null) {   // 扇自己
                let S = ind.base.surv; S.temp += Math.max(-FM_PULL.selfRate * dt, Math.min(FM_PULL.selfRate * dt, 37 - S.temp));
                ind.effort = FM_PULL.fanSelf; return;
            }
            let c = indCookById(P.c), a = fmCookOfAim(indAim());
            if (!c || ind.where !== 'base' || !a || a.id !== c.id || Math.hypot(ind.p.x - c.x, ind.p.z - c.z) > FM_PULL.near + (IND_COOK[c.ty].r || 1)) { ind.pull = null; return; }
            if (P.fan) { c.C.fan = FM_PULL.grace; ind.effort = FM_PULL.fanCook; }
            else { c.C.blow = FM_PULL.grace; ind.effort = FM_PULL.bellows; }
        }

        // ══ 任务 51：电动鼓风机 ══
        // 设备（额定 12 V、minV 6、耗电 1，走电线）。放在炉子旁边（炉子边上 1.5 米内）就算装在这个炉子上：通电时炉子的「鼓风」档自己到 1600°C，不用人拉；没电掉回大火。
        // 一个炉子风箱和鼓风机只能装一个（装了风箱的炉子旁边的鼓风机不管用，装了鼓风机的炉子装不了风箱）。放在地上不挨着炉子：通电时 3 米内的毒气消得快一倍
        const FM_BLOW = { near: 1.5, gasR: 3, gasMul: 2 };
        Object.assign(IND_ITEMS_RAW, { dev_blower: { name: '电动鼓风机', col: 0x78909c, dev: 'blower', use: '放在炉子旁边、接上电：炉子开「鼓风」档自己到 1600°C，不用人拉（手摇发电机 6 V 也带得动，但还是得有人摇；无人值守要电池组）。放在地上接电：吹散 3 米内的毒气，消得快一倍' } });
        Object.assign(IND_DEVS, { blower: { name: '电动鼓风机', col: 0x78909c, rated: 12, minV: 6, draw: 1, size: [0.9, 0.8, 0.9] } });
        IND_CRAFT.push({ out: 'dev_blower', in: { coil: 2, steel: 2, wire: 6, wood: 2 }, hard: true });
        function fmBlowersOf(c) { return ind.where !== 'base' ? [] : ind.base.devs.filter(function (d) { return d.ty === 'blower' && Math.hypot(d.x - c.x, d.z - c.z) <= (IND_COOK[c.ty].r || 1.5) + FM_BLOW.near; }); }
        function fmHasBlower(c) { return !!c && !c.C.bellows && fmBlowersOf(c).length > 0; }
        function fmBlowerPw(c) {
            if (!fmHasBlower(c)) return false;
            let on = fmBlowersOf(c).some(function (d) { return d.pw; });
            if (c.C.fire === 4 && !on && !c.C.nbw && !(c.C.blow > 0)) { c.C.nbw = true; if (!ind.sleeping) indFlash('鼓风机没电，' + IND_COOK[c.ty].name + '掉回大火'); }
            if (on) c.C.nbw = false;
            return on;
        }
        function fmBlowerCook(d) { return indCooks().filter(function (c) { return Math.hypot(d.x - c.x, d.z - c.z) <= (IND_COOK[c.ty].r || 1.5) + FM_BLOW.near; })[0] || null; }
        IND_DEV_INFO.blower = function (d) {
            let c = fmBlowerCook(d), w = d.on ? (d.pw ? '　工作中' : '　没电') : '　关着';
            if (c && c.C.bellows) return '电动鼓风机（额定 12 V）　' + IND_COOK[c.ty].name + '装了风箱，鼓风机不管用' + w;
            return '电动鼓风机（额定 12 V）　' + (c ? '装在' + IND_COOK[c.ty].name + '上（开「鼓风」档）' : '在地上：吹散 3 米内的毒气') + w;
        };
        // 毒气云：通着电、不挨着炉子的鼓风机 3 米内，消得快一倍
        function fmCloudMul(cl) {
            if (ind.where !== 'base') return 1;
            return ind.base.devs.some(function (d) { return d.ty === 'blower' && d.pw && !fmBlowerCook(d) && Math.hypot(d.x - cl.x, d.z - cl.z) <= FM_BLOW.gasR; }) ? FM_BLOW.gasMul : 1;
        }

        // ══ 任务 45：地图 ══
        // 地图（物品）：工作台 指南针 1 + 纸 2；纸：草 4 → 2（硬核）、甘蔗 2 → 2（悠闲硬核都行）。带在背包里，远征时按 M（或右上角"地图"按钮）看。
        // 迷雾：走过的地方（30 米内）才显示；画出家（出生点）、撤离点、发现过的资源点（资源的颜色）、自己；点地图做记号（最多 8 个，再点去掉），记号存档
        const FM_MAP = { marks: 8, hit: 12 };
        Object.assign(IND_ITEMS_RAW, {
            paper: { name: '纸', col: 0xfafafa, use: '做地图；以后写东西也要用' },
            map: { name: '地图', col: 0xffe0b2, use: '带在背包里，远征时按 M 看：走过的地方、撤离点、发现的资源点；点地图做记号（最多 8 个）' }
        });
        IND_CRAFT.push({ out: 'paper', n: 2, in: { grass: 4 }, hard: true }, { out: 'paper', n: 2, in: { cane: 2 } }, { out: 'map', in: { compass: 1, paper: 2 } });
        function fmMapSeeNodes(r) {
            (ind.nodes || []).forEach(function (n) { if (!n.seen && !n.dead && Math.hypot(n.x - ind.p.x, n.z - ind.p.z) <= r) n.seen = true; });
        }
        function fmNodeCol(n) { let k = (IND_NODES[n.key] && IND_NODES[n.key].out) || n.key, it = IND_ITEMS_RAW[k]; return it && it.col !== undefined ? it.col : 0x795548; }
        function fmMapDrawMore(g, px) {
            (ind.nodes || []).forEach(function (n) {
                if (!n.seen || n.dead || n.tree || n.dry) return;   // 采完的油点（干井）不再标
                g.fillStyle = '#' + ('000000' + fmNodeCol(n).toString(16)).slice(-6); g.fillRect((n.x + IND_MAP) * px - 1.5, (n.z + IND_MAP) * px - 1.5, 3, 3);
            });
            g.fillStyle = '#5d4037'; g.fillRect(IND_MAP * px - 5, IND_MAP * px - 5, 10, 10);   // 家：出生点
            g.strokeStyle = '#ffd600'; g.lineWidth = 2;
            (ind.base.marks || []).forEach(function (m) { let x = (m.x + IND_MAP) * px, z = (m.z + IND_MAP) * px; g.beginPath(); g.moveTo(x - 5, z - 5); g.lineTo(x + 5, z + 5); g.moveTo(x + 5, z - 5); g.lineTo(x - 5, z + 5); g.stroke(); });
            let cv = g.canvas; if (cv && !cv.fmClick) { cv.fmClick = true; cv.addEventListener('click', function (e) { let r = cv.getBoundingClientRect(); fmMapClick((e.clientX - r.left) / r.width * IND_MAP * 2 - IND_MAP, (e.clientY - r.top) / r.height * IND_MAP * 2 - IND_MAP); }); }
        }
        // 点地图：点在记号旁边就去掉，不然加一个（最多 8 个）
        function fmMapClick(x, z) {
            let M = ind.base.marks = ind.base.marks || [];
            let i = M.findIndex(function (m) { return Math.hypot(m.x - x, m.z - z) <= FM_MAP.hit; });
            if (i >= 0) { M.splice(i, 1); indFlash('去掉了一个记号'); }
            else if (M.length >= FM_MAP.marks) { indFlash('记号最多 ' + FM_MAP.marks + ' 个，点一个旧的去掉'); return false; }
            else { M.push({ x: Math.round(x), z: Math.round(z) }); indFlash('做了个记号（' + M.length + ' / ' + FM_MAP.marks + '）'); }
            indSave(); if (ind.panel === 'map') wdMapDraw();
            return true;
        }

        // ══ 任务 48：太阳能板（基地里当固定电源；车顶那半等车做了再接）══
        // 玻璃板 2 + 铜线 10 + 硅 2（电池片用硅）。白天出电，电压跟着太阳：日出 0 → 正午 12 V → 傍晚 0，夜里 0。睡觉和回家补算按当时的时刻算
        Object.assign(IND_ITEMS_RAW, { dev_solar: { name: '太阳能板', col: 0x1a237e, dev: 'solar', use: '白天出电（正午 12 V，早晚低，夜里没有），接电线当电源；以后能装在车顶' } });
        Object.assign(IND_DEVS, { solar: { name: '太阳能板', col: 0x1a237e, src: true, volt: 12, size: [1.6, 0.2, 1.2] } });
        IND_CRAFT.push({ out: 'dev_solar', in: { glass_plate: 2, wire: 10, ingot_si: 2 }, hard: true });
        IND_ITEMS_RAW.ingot_si.use = '做太阳能板的电池片；以后做芯片的基片也要用'; delete IND_ITEMS_RAW.ingot_si.useLater;
        function fmSun() { let t = indTod(); return t >= IND_DUSK ? 0 : Math.sin(Math.PI * t / IND_DUSK); }
        IND_DEV_VOLT.solar = function (d) { return Math.round(IND_DEVS.solar.volt * fmSun() * 10) / 10; };
        IND_DEV_INFO.solar = function (d) { let v = IND_DEV_VOLT.solar(d); return '太阳能板　' + (v > 0 ? '出电 ' + v.toFixed(1) + ' V（正午最高 12 V）' : '夜里不出电'); };

        // ══ 任务 49：小型核电（先做成基地里的设备；车的铅仓等车做了再接）══
        // 钢 6 + 铅锭 6 + 电磁线圈 2 + 铜线 6。拿燃料棒（3.5% 或 5%）左键装一根，出 12 V，撑 3 个游戏日，烧完变乏燃料棒、停电。
        // 收起、被炸时棒子跟反应堆一样还回来（带烧了多少）；燃料棒在背包里照旧有弱辐射，要铅围裙或铅箱
        const FM_SNK = { days: 3, volt: 12 };
        Object.assign(IND_ITEMS_RAW, { dev_snuke: { name: '小型核电', col: 0x558b2f, dev: 'snuke', use: '装一根燃料棒出 12 V，撑 3 天；燃料棒带在身上有辐射。以后能装在车上（要铅仓）' } });
        Object.assign(IND_DEVS, { snuke: { name: '小型核电', col: 0x558b2f, src: true, volt: FM_SNK.volt, size: [1, 1.1, 1] } });
        IND_CRAFT.push({ out: 'dev_snuke', in: { steel: 6, ingot_pb: 6, coil: 2, wire: 6 }, hard: true });
        IND_DEV_FIX.snuke = function (d) { IND_DEV_FIX.reactor(d); d.rods = d.rods.slice(0, 1); };
        IND_DEV_VOLT.snuke = function (d) { return d.rods && d.rods[0] && !d.rods[0].spent ? FM_SNK.volt : 0; };
        IND_DEV_TICK.snuke = function (d, dt) {
            let r = d.rods && d.rods[0]; if (!r || r.spent) return;
            r.b += dt / (FM_SNK.days * IND_DAY);
            if (r.b >= 1) { d.rods[0] = { spent: true }; if (!ind.sleeping) indFlash('小型核电的燃料棒烧完了'); }
        };
        IND_DEV_INFO.snuke = function (d) {
            let r = d.rods && d.rods[0];
            if (!r) return '小型核电　没装燃料棒（拿燃料棒左键装）';
            if (r.spent) return '小型核电　燃料棒烧完了（右键收起拿出乏燃料棒）';
            return '小型核电　出电 12 V　还能用 ' + ((1 - r.b) * FM_SNK.days).toFixed(1) + ' 天';
        };
        function fmSnukeAct(d, k) {
            let r = typeof k === 'string' ? nkRod(k) : null;
            if (!r) { indFlash(IND_DEV_INFO.snuke(d)); return false; }
            if (r.i < 4) { indFlash('要丰度 3.5% 以上的燃料棒'); return false; }
            if (d.rods && d.rods.length) { indFlash('已经装了一根'); return false; }
            indBagDel(k, 1); d.rods = [{ i: r.i, b: r.b }]; indSave(); indFlash('装上燃料棒了，出 12 V'); return true;
        }

        // ══ 任务 56：面粉（面包先磨面）══
        // 硬核：粉碎机里 2 小麦 → 2 面粉；悠闲没有电，工作台手磨 2 小麦 → 2 面粉。面包 = 面粉 3 + 盐 1 + 水 1 → 3（200°C 40 秒，在 19-industry.js 原位置改的）
        Object.assign(IND_ITEMS_RAW, { flour: { name: '面粉', col: 0xfff8e1, use: '做面包（面粉 3 + 盐 1 + 水 1 → 3 个）' } });
        IND_CRAFT.push({ out: 'flour', n: 2, in: { wheat: 2 }, casual: true });

        // ↓↓ 这一行要留在文件最后（任务 42）：给所有用皮的配方加人造革备选
        fmPleatherAlts();
