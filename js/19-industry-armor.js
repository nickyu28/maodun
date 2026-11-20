// 猫盾工业：盔甲（作者 11-19「加入盔甲」）。放在 19-industry-hammer.js 后面。
// 头盔、胸甲、护腿、护靴四件，皮、青铜、铁、钢四档，穿在自己的四个格子里（ahead、abody、aleg、afoot），跟衣服、鞋、灯泡不抢格子。
// 挨打（怪、爆炸、仙人掌）按身上盔甲的减伤值少掉血，穿着的每件掉 1 点耐久，用坏了变成坏了的盔甲，工作台加胶水修好（耐久一半）。
// 走得慢一点、跑步更费体力：越重越明显。身上和第三人称模型看得见，颜色按材质。
        const AR = {
            tiers: ['lth', 'bz', 'fe', 'st'],
            tn: { lth: '皮', bz: '青铜', fe: '铁', st: '钢' },
            col: { lth: 0x8d5a3b, bz: 0xb87333, fe: 0x78909c, st: 0xcfd8dc },
            mat: { lth: 'leather', bz: 'bronze', fe: 'ingot_fe', st: 'steel' },
            mult: { lth: 1, bz: 1.6, fe: 2.2, st: 3 },       // 减伤倍数
            dura: { lth: 80, bz: 160, fe: 320, st: 640 },
            walk: { lth: 0.004, bz: 0.012, fe: 0.02, st: 0.028 },   // 每份"重量"让走路慢多少
            stam: { lth: 0.01, bz: 0.03, fe: 0.05, st: 0.07 },      // 每份重量让跑步多耗多少体力
            part: { helm: { sl: 'ahead', name: ['皮盔', '青铜盔', '铁盔', '钢盔'], cut: 0.04, w: 1, n: 4 }, chest: { sl: 'abody', name: ['皮甲', '青铜胸甲', '铁胸甲', '钢胸甲'], cut: 0.10, w: 2.5, n: 8 }, legs: { sl: 'aleg', name: ['皮护腿', '青铜护腿', '铁护腿', '钢护腿'], cut: 0.06, w: 1.5, n: 6 }, boot: { sl: 'afoot', name: ['皮护靴', '青铜护靴', '铁护靴', '钢护靴'], cut: 0.04, w: 1, n: 4 } },
            slots: ['ahead', 'abody', 'aleg', 'afoot'],
            maxCut: 0.75
        };
        let AR_ITEM = {};   // key → { part, tier }
        (function () {
            let add = {};
            Object.keys(AR.part).forEach(function (p) {
                let P = AR.part[p];
                AR.tiers.forEach(function (t, i) {
                    let k = p + '_' + t, cut = Math.round(P.cut * AR.mult[t] * 1000) / 1000, nm = P.name[i];
                    AR_ITEM[k] = { part: p, tier: t, cut: cut };
                    add[k] = { name: nm, col: AR.col[t], wear: P.sl, warm: 0, armor: cut, heavy: 1 - P.w * AR.walk[t], arw: P.w * AR.stam[t], use: '穿上少受伤' + Math.round(cut * 100) + '%，每挨一下掉 1 点耐久，耐久 ' + AR.dura[t] };
                    add['broken_' + k] = { name: '坏了的' + nm, col: 0x616161, use: '工作台：加 1 胶水修好，耐久一半' + (t === 'lth' ? '，或者回收一半皮革' : '') };
                    let need = t === 'lth' ? { leather: P.n, rope: Math.ceil(P.n / 4) } : (function () { let o = {}; o[AR.mat[t]] = P.n; return o; })();
                    IND_CRAFT.push(Object.assign({ out: k, in: need, hard: true }, t === 'lth' ? {} : { need: 'hammer' }));
                    IND_CRAFT.push({ out: k, fix: true, in: { ['broken_' + k]: 1, glue: 1 }, hard: true });
                    if (t === 'lth') IND_CRAFT.push({ out: 'leather', n: Math.floor(P.n / 2), in: { ['broken_' + k]: 1 }, hard: true });
                });
            });
            Object.assign(IND_ITEMS_RAW, add);
        })();
        function arTier(k) { return AR_ITEM[k] || null; }
        function arWorn() { let o = []; if (!ind || !ind.base || !ind.base.wear) return o; AR.slots.forEach(function (sl) { let k = ind.base.wear[sl]; if (k && AR_ITEM[k]) o.push(k); }); return o; }
        // 身上盔甲的减伤，最多 75%
        function arCut() { let c = 0; arWorn().forEach(function (k) { c += AR_ITEM[k].cut; }); return Math.min(AR.maxCut, c); }
        // 跑步多耗的体力倍数
        function indArStam() { let m = 1; arWorn().forEach(function (k) { m += IND_ITEMS_RAW[k].arw || 0; }); return m; }
        // 挨一下：穿着的每件掉 1 点耐久，用坏了脱掉变成坏了的盔甲
        function arWearAll() {
            arWorn().forEach(function (k) {
                let B = ind.base, left = mbDura(k) - 1, sl = AR_ITEM[k] && IND_ITEMS_RAW[k].wear;
                if (left > 0) { B.dura[k] = left; return; }
                rpBroke(k); delete B.dura[k]; delete B.wear[sl]; indBoxAdd('broken_' + k, 1);
                indFlash(indName(k) + '用坏了，变成' + indName('broken_' + k)); ind.hudSig = '';
            });
        }
        (function () {
            let h0 = indHurt;
            indHurt = function (n, key, detail, instant) {
                if (n > 0 && ind && ind.base && typeof key === 'string' && (/^mob_/.test(key) || key === 'boom' || key === 'thorn')) {
                    let c = arCut(); if (c > 0) { n *= 1 - c * (key === 'boom' ? 0.5 : 1); arWearAll(); }
                }
                return h0.call(this, n, key, detail, instant);
            };
            let t0 = indTick;
            indTick = function (dt) { let r = t0.apply(this, arguments); if (ind && !ind.over) arSync(); return r; };
        })();
        // 第三人称的模型上画出来：头盔盖在头上，胸甲罩身体，护腿罩在两条腿上，护靴在脚上
        function arSync() {
            let me = ind && ind.me; if (!me) return;
            let sig = arWorn().join(','); if (me.userData.arSig === sig) return;
            me.userData.arSig = sig;
            (me.userData.arMesh || []).forEach(function (m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
            let list = []; me.userData.arMesh = list;
            let box = function (w, h, d, col, parent, x, y, z) { let m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); parent.add(m); list.push(m); return m; };
            arWorn().forEach(function (k) {
                let I = AR_ITEM[k], c = AR.col[I.tier], legs = me.userData.legs || [];
                if (I.part === 'helm') { box(6.8, 2.2, 4.8, c, me, 0, 10.4, 0); box(6.8, 4.2, 1, c, me, 0, 8.6, -2.1); }
                else if (I.part === 'chest') box(6.8, 5.4, 4.8, c, me, 0, 4.6, 0);
                else if (I.part === 'legs') legs.forEach(function (h) { box(2.6, 2.4, 2.6, c, h, 0, -0.6, 0); });
                else if (I.part === 'boot') legs.forEach(function (h) { box(2.6, 1.3, 3.2, c, h, 0, -3.1, 0.3); });
            });
        }
