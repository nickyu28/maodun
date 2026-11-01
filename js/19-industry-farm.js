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
