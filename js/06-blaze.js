        // 进钱的统一入口
        // ── 场上的钱箱 ──
        // 定时在能站人的格子上刷一个，谁走过去谁捡。捡了直接进那个人的钱包。
        // 主机负责刷和判定，捡走这件事广播出去，四台机器上箱子才会一起消失。
        // 箱子刷在固定点位上，越靠中间点位越密 —— 想要钱就得往中间挤。
        function blazeFfaChestSpots() {
            if (blaze.chestSpots) return blaze.chestSpots;
            let mid = Math.floor(mSize / 2), out = [];
            // 三圈：中间一圈很密，往外越来越稀
            [{ r: 0, n: 1 }, { r: 4, n: 6 }, { r: 9, n: 6 }, { r: 15, n: 4 }].forEach(function (ring) {
                for (let i = 0; i < ring.n; i++) {
                    let ang = (i / ring.n) * Math.PI * 2 + ring.r * 0.3;
                    let x = Math.round(mid + Math.cos(ang) * ring.r);
                    let z = Math.round(mid + Math.sin(ang) * ring.r);
                    let c = maze[0] && maze[0][z] && maze[0][z][x];
                    if (c && c.type === 0) out.push({ x: x, z: z });
                }
            });
            blaze.chestSpots = out;
            return out;
        }

        function blazeFfaSpawnChest() {
            let spots = blazeFfaChestSpots().filter(function (q) {
                return !(blaze.chests || []).some(function (c) { return c.sx === q.x && c.sz === q.z; });
            });
            if (!spots.length) return;
            let sp = spots[Math.floor(Math.random() * spots.length)];
            let gold = Math.random() < BLAZE.ffaGoldChance;
            let g = new THREE.Group();
            let body = gold ? 0xffd54f : 0x8d6e63, lidc = gold ? 0xfff59d : 0xa1887f;
            let box = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 6),
                new THREE.MeshLambertMaterial({ color: body, emissive: gold ? 0x8d6a00 : 0x2e1f16 }));
            box.position.y = 3.5; g.add(box);
            let lid = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.4, 6.6),
                new THREE.MeshLambertMaterial({ color: lidc, emissive: gold ? 0x8d6a00 : 0x2e1f16 }));
            lid.position.y = 7; g.add(lid);
            if (blaze.tomb) {
                let halo = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 70, 8, 1, true),
                    new THREE.MeshBasicMaterial({
                        color: gold ? 0xffd54f : 0xffab91, transparent: true, opacity: 0.35,
                        fog: false, side: THREE.DoubleSide, depthWrite: false
                    }));
                halo.position.y = 38; halo.renderOrder = 780; g.add(halo);
                g.userData.halo = halo;
            }
            g.position.set(sp.x * TILE, 0, sp.z * TILE);
            scene.add(g);
            blaze.chests.push({
                id: (blaze.chestId = (blaze.chestId || 0) + 1), mesh: g, t: 0, halo: g.userData.halo,
                sx: sp.x, sz: sp.z, gold: gold,
                hp: BLAZE.ffaChestHp, maxHp: BLAZE.ffaChestHp
            });
        }

        // 打箱子：任何攻击落在箱子附近都算数，打空了才开
        function blazeFfaHitChests(a, x, z, r, dmg) {
            if (!blaze || !blaze.ffa || !blaze.chests) return;
            blaze.chests.slice().forEach(function (c) {
                if (c.hp <= 0) return;
                if (Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z) > r) return;
                c.hp -= dmg;
                blazeBurst(c.mesh.position.x, c.mesh.position.z, c.gold ? 0xffd54f : 0xa1887f, 5, 10, 0.2);
                if (c.hp > 0) return;
                blazeFfaOpenChest(a, c);
            });
        }

        function blazeFfaOpenChest(a, c) {
            blazeBurst(c.mesh.position.x, c.mesh.position.z, c.gold ? 0xffd54f : 0xffca28, 8, 20, 0.5);
            sfxPlay(c.gold ? [784, 1046, 1318] : [660, 880], 0.2, 0.06, 'triangle');
            if (c.gold) {
                if (a && a.isPlayer) {
                    blaze.ffaFreeN = (blaze.ffaFreeN || 0) + 1;
                    blaze.ffaFree = null;
                    blazeFlash('金箱：免费 ' + BLAZE.ffaGoldPickN + ' 选 1');
                    blazeFfaCardToggle(true);
                } else if (a) {
                    // AI 拿到金箱就当一笔大钱花
                    a.money = (a.money || 0) + BLAZE.ffaChestMoney * 3;
                }
            } else {
                blazeFfaEarn(a, BLAZE.ffaChestMoney, '打开钱箱');
            }
            blazeFfaRemoveChest(c.id);
            blazeNetEv({ ev: 'chest', id: c.id });
        }

        function blazeFfaRemoveChest(id) {
            blaze.chests = (blaze.chests || []).filter(function (c) {
                if (c.id !== id) return true;
                scene.remove(c.mesh); return false;
            });
        }

        function blazeFfaClearChests() {
            (blaze.chests || []).forEach(function (c) { scene.remove(c.mesh); });
            blaze.chests = [];
            blaze.chestSpots = null;
        }

        function blazeFfaChestTick(dt) {
            if (!blaze.ffa || blaze.over) return;
            if (!blaze.chests) blaze.chests = [];
            // 转一转、上下浮一浮，老远就看得见
            blaze.chests.forEach(function (c) {
                c.t += dt;
                c.mesh.rotation.y += dt * 1.1;
                c.mesh.position.y = Math.sin(c.t * 2) * 1.2;
            });
            if (blazeIsHost()) {
                blaze.chestT -= dt;
                if (blaze.chestT <= 0) {
                    blaze.chestT = BLAZE.ffaChestEvery;
                    if (blaze.chests.length < BLAZE.ffaChestMax) blazeFfaSpawnChest();
                }
            }

        }

        function blazeFfaEarn(a, n, why) {
            if (!blaze || !blaze.ffa || !a) return;
            if (a.isPlayer) {
                blaze.ffaMoney += n;
                if (why) blazeFlash('+' + n + '　' + why);
            } else a.money = (a.money || 0) + n;
        }

        function blazeFfaCardToggle(force) {
            if (!blaze || !blaze.ffa || blaze.over) return;
            blaze.ffaCardOpen = (force === undefined) ? !blaze.ffaCardOpen : !!force;
            // 卡面板要用鼠标点，得先把指针从锁定状态里放出来
            if (blaze.ffaCardOpen) { if (document.pointerLockElement) document.exitPointerLock(); }
            blazeFfaCardRender();
        }

        // 选中的那一下：给按钮套一个爆闪的 class，等动画播完再重画面板
        function blazeCardPop(el, then) {
            if (!el) { then(); return; }
            el.classList.add('bz-pop');
            setTimeout(then, 170);
        }

        function blazeFfaCardPick(id) {
            if (!blaze || !blaze.ffa || !blaze.me) return;
            let o = (blaze.ffaDraw || []).filter(function (q) { return q.id === id; })[0];
            if (!o) return;
            let price = blazeFfaPrice(o);
            if (blaze.ffaMoney < price) { blazeFlash('钱不够（要 ' + price + '）'); return; }
            blaze.ffaMoney -= price;
            blazeApplyPerkNet(blaze.me, id);
            // 买完整架刷新，并且换成另一种卡
            blaze.ffaShopKind = (blazeFfaKind() === 'func') ? 'stat' : 'func';
            blaze.ffaDraw = null;
            blazeFfaCardRender();
        }

        // 面板右上角那个 ×：只是收起来，选卡次数还留着，下次自己会再弹
        function blazeFfaCloseBtn() {
            return '<div onclick="blazeFfaCardToggle(false)" title="收起" ' +
                'style="position:absolute; right:8px; top:6px; width:22px; height:22px; line-height:20px; ' +
                'text-align:center; border-radius:5px; cursor:pointer; color:#ffab91; ' +
                'border:1px solid rgba(255,255,255,.25); background:rgba(0,0,0,.3); font-size:14px;">×</div>';
        }

        function blazeFfaCardRender() {
            let el = document.getElementById('blaze-ffa-cards'); if (!el) return;
            if (!blaze || !blaze.ffa || !blaze.ffaCardOpen) { el.classList.add('hidden'); el._sig = ''; return; }
            let me = blaze.me;
            // 这个函数每帧都被 HUD 调一次。以前每次都重写 innerHTML，
            // 按钮在 mousedown 和 mouseup 之间就被换成新的了 —— click 事件根本凑不齐，
            // 点上去毫无反应。现在内容没变就不重画。
            let draw = blazeFfaDraw();
            let rc = blazeFfaRefreshCost();
            let sig = blaze.ffaMoney + '|' + rc + '|' + blazeFfaKind() + '|' +
                (blaze.ffaFreeN || 0) + '|' + (blaze.ffaCustom ? 'C' : '') + '|' +
                ((blaze.ffaFree || []).map(function (o) { return o.id; }).join(',')) + '|' +
                draw.map(function (o) { return o.id; }).join(',');
            if (el._sig === sig) { el.classList.remove('hidden'); return; }
            el._sig = sig;
            let cell = function (o, onclick, priceTxt, priceCol, cls) {
                let n = me.perkCount[o.id] || 0;
                let k = cls || (o.kind === 'func' ? 'bz-func' : 'bz-stat');
                return '<button onclick="' + onclick + '" class="bz-card ' + k + '" ' +
                    'style="margin:0; padding:7px 6px; font-size:11px; ' +
                    'line-height:1.4; white-space:normal; height:100%;">' +
                    (priceTxt ? '<span style="color:' + priceCol + ';">' + priceTxt + '</span>　' : '') +
                    o.label + (n ? '<br><span style="color:#ffd54f;">已有 ' + n + '</span>' : '') + '</button>';
            };
            let grid = function (inner, minw) {
                return '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(' +
                    (minw || 170) + 'px, 1fr)); gap:5px;">' + inner + '</div>';
            };

            // 金箱开出来的免费 5 选 1 优先弹
            if ((blaze.ffaFreeN || 0) > 0) {
                let fd = blazeFfaFreeDraw();
                el.innerHTML = blazeFfaCloseBtn() +
                    '<div style="font-size:13px; margin-bottom:6px;"><b style="color:#ffd54f;">金箱 · 免费 ' +
                    BLAZE.ffaGoldPickN + ' 选 1</b>　还剩 ' + blaze.ffaFreeN + ' 次</div>' +
                    grid(fd.map(function (o) {
                        return cell(o, 'blazeFfaFreePick(\'' + o.id + '\')', '免费', '#8bc34a', 'bz-free');
                    }).join(''));
                el.classList.remove('hidden');
                return;
            }

            // 任选一张：把整个池子摊开
            if (blaze.ffaCustom) {
                let all = blazeFfaPool(me, 'func').concat(blazeFfaPool(me, 'stat'));
                let can = blaze.ffaMoney >= BLAZE.ffaCustomPrice;
                el.innerHTML = blazeFfaCloseBtn() +
                    '<div style="font-size:13px; margin-bottom:6px;"><b style="color:#ffd54f;">任选一张</b>　' +
                    '<span style="color:' + (can ? '#8bc34a' : '#e57373') + ';">' + BLAZE.ffaCustomPrice + '</span>' +
                    '　余额 ' + blaze.ffaMoney +
                    '　<button onclick="blazeFfaCustomToggle()" style="margin:0; padding:2px 10px; font-size:11px; background:#555; color:#fff; border:none;">返回货架</button></div>' +
                    grid(all.map(function (o) {
                        return cell(o, 'blazeFfaCustomPick(\'' + o.id + '\')', '', '');
                    }).join(''), 150);
                el.classList.remove('hidden');
                return;
            }

            let canCustom = blaze.ffaMoney >= BLAZE.ffaCustomPrice;
            el.innerHTML = blazeFfaCloseBtn() +
                '<div style="font-size:13px; margin-bottom:6px;">' +
                '<b style="color:#ffd54f;">商店 · ' + (blazeFfaKind() === 'func' ? '功能卡' : '数值卡') + '</b>' +
                '　余额 <b style="color:#8bc34a;">' + blaze.ffaMoney + '</b>' +
                '　<button onclick="blazeFfaRefresh()" style="margin:0; padding:2px 10px; font-size:11px; ' +
                'background:' + (blaze.ffaMoney >= rc ? '#5e35b1' : '#555') + '; color:#fff; border:none;">刷新 ' + rc + '</button>' +
                '　<button onclick="blazeFfaCustomToggle()" style="margin:0; padding:2px 10px; font-size:11px; ' +
                'background:' + (canCustom ? '#c62828' : '#555') + '; color:#fff; border:none;">任选一张 ' + BLAZE.ffaCustomPrice + '</button>' +
                '　<span style="font-size:11px; color:#9fb3c8;">买完整架换一批，并换成另一种卡</span></div>' +
                (draw.length
                    ? grid(draw.map(function (o) {
                        let price = blazeFfaPrice(o);
                        let can = blaze.ffaMoney >= price;
                        return cell(o, 'blazeFfaCardPick(\'' + o.id + '\')', price, can ? '#8bc34a' : '#e57373',
                            can ? null : ((o.kind === 'func' ? 'bz-func' : 'bz-stat') + ' bz-poor'));
                    }).join(''))
                    : '<div style="color:#888;">没货了</div>');
            el.classList.remove('hidden');
        }

        // AI 也会自己拿卡，不然打到后面只有你一个人越滚越大
        // 每张卡贴一个标签，AI 不用背一张几十行的表，按「我现在缺什么」去权衡
        const BLAZE_CARD_TAG = {
            hp: 'tank', hppct: 'tank', bulk: 'tank', tough: 'tank', armor: 'tank', bastion: 'tank',
            cut: 'tank', cutuni: 'tank', tankmax: 'tank', endure: 'tank', tenacity: 'tank', winhp: 'tank',
            dmg: 'dmg', dmgpct: 'dmg', glass: 'dmg', hpdmg: 'dmg', skillup: 'dmg', windmg: 'dmg',
            rage: 'dmg', execute: 'dmg', fullhp: 'dmg', backstab: 'dmg', triple: 'dmg', surge: 'dmg',
            opener: 'dmg', lastone: 'dmg', swordexec: 'dmg', invisburst: 'dmg', tankskill: 'dmg',
            crit: 'crit', critdmg: 'crit', critrate: 'crit', critpow: 'crit', critswap2: 'crit', critheal: 'crit',
            cdr: 'cd', dmgcd: 'cd', atkcdr: 'cd', lifecd: 'cd', refund: 'cd', as: 'cd',
            regen: 'heal', healcast: 'heal', lifesteal: 'heal', healpct: 'heal', healpct2: 'heal',
            speed: 'move', gale: 'move', shiftspeed: 'move', guarddash: 'move', blinkfar: 'move', shiftback: 'move',
            dslow: 'debuff', dwound: 'debuff', dweak: 'debuff', ctrltime: 'debuff', ctrlextra: 'debuff', swordstun: 'debuff'
        };

        // 这张卡对「现在的我」值不值这个钱
        function blazeAiCardScore(a, o) {
            let price = blazeFfaPrice(o);
            if ((a.money || 0) < price) return -1;
            let sc = 1 + Math.random() * 0.7;               // 掺一点随机，别每局都长一个样
            if (o.only === a.key) sc += 2.5;                // 专属卡就是给我这个猫盾做的
            sc -= ((a.perkCount && a.perkCount[o.id]) || 0) * 1.2;   // 同一张越堆越不划算
            let tag = BLAZE_CARD_TAG[o.id];
            let dead = (a.deaths || 0) > (a.kills || 0);
            if (tag === 'tank') sc += (a.maxHp < 130 ? 1.5 : 0.2) + (dead ? 1.0 : 0);
            else if (tag === 'dmg') sc += (blazeFlatDmg(a) < 30 ? 1.3 : 0.4);
            // 暴击是滚雪球的：已经有暴击率了才值得往上堆
            else if (tag === 'crit') sc += (a.critChance > 0.1 ? 1.7 : 0.3);
            else if (tag === 'cd') sc += (blazeCdr(a) < 0.4 ? 1.0 : 0.1);
            else if (tag === 'heal') sc += (dead ? 1.2 : 0.3);
            else if (tag === 'move') sc += 0.6;
            else if (tag === 'debuff') sc += 0.7;
            else if (o.id === 'lucky') sc += 0.8;
            sc += ((a.money || 0) - price) / 400;           // 钱厚就敢买贵的
            return sc;
        }

        function blazeFfaAiCards(dt) {
            if (!blaze.ffa) return;
            blaze.actors.forEach(function (a) {
                if (a.isPlayer || !blazeMine(a)) return;
                a.cardT = (a.cardT || 0) - dt;
                if (a.cardT > 0) return;
                a.cardT = 4 + Math.random() * 4;
                let best = null, bs = 0.8;                  // 分不够就先攒着，别乱花
                blazeFfaPool(a).forEach(function (o) {
                    let sc = blazeAiCardScore(a, o);
                    if (sc > bs) { bs = sc; best = o; }
                });
                if (!best) return;
                a.money -= blazeFfaPrice(best);
                blazeApplyPerkNet(a, best.id);
            });
        }

        function blazePerkReroll() {
            let me = blaze && blaze.me;
            if (!blaze || blaze.phase !== 'perk' || !me || me.pickedPerk) return;
            if ((me.perkRerollsLeft || 0) <= 0) return;
            me.perkRerollsLeft--;
            me.perkDraw = null;
            blaze.perkUIActor = null;   // 逼界面重画，不然还是老那三张
        }

        function blazeApplyPerk(a, id, mul) {
            mul = mul || 1;
            if (mul === 1) { blazeApplyPerkBody(a, id); return; }
            a.perkMul = a.perkMul || {};
            a.perkMul[id] = (a.perkMul[id] || 1) * mul;
            // 选牌当场就落地的那些数值：把 BLAZE 里对应的常量临时放大，
            // 套完立刻还原 —— 省得给每张牌都写一份「加强版」。
            let bak = {};
            Object.keys(BLAZE).forEach(function (k) {
                if (typeof BLAZE[k] !== 'number' || BLAZE_NO_SCALE[k]) return;
                if (!/^(perk|crit)/.test(k)) return;
                bak[k] = BLAZE[k]; BLAZE[k] = BLAZE[k] * mul;
            });
            try { blazeApplyPerkBody(a, id); }
            finally { Object.keys(bak).forEach(function (k) { BLAZE[k] = bak[k]; }); }
        }

        function blazeApplyPerkBody(a, id) {
            a.perkCount[id] = (a.perkCount[id] || 0) + 1;
            if (id === 'hp') a.perkHpBonus += BLAZE.perkHp;
            else if (id === 'dmg') a.perkDmgBonus += BLAZE.perkDmg;
            else if (id === 'as') a.perkAsBonus += BLAZE.perkAs;
            else if (id === 'swordstun') a.perkSwordStun += BLAZE.perkSwordStun;
            else if (id === 'healpct2') a.perkHealBonus += BLAZE.perkHealPct2;
            else if (id === 'tankmax') { /* 走 blazeBaseHp，按 perkCount 算 */ }
            else if (id === 'cut') a.perkCutBonus += BLAZE.perkCut;
            else if (id === 'lifesteal') a.perkLifesteal += BLAZE.perkLifesteal;
            else if (id === 'ctrltime') a.perkCtrlTime += BLAZE.perkCtrlTime;
            else if (id === 'invisatk') a.perkInvisAtk += BLAZE.perkInvisAtk;
            else if (id === 'healcast') a.perkHealCast = true;
            else if (id === 'glass') a.perkGlassDmg += BLAZE.perkGlassDmg;   // 生命上限走 blazeBaseHp
            else if (id === 'bowstack') a.perkStackBonus += BLAZE.perkBowStack;
            else if (id === 'swordexec') a.perkSwordExec += BLAZE.perkSwordExec;
            else if (id === 'healpct') a.perkHealBonus += BLAZE.perkHealPct;
            else if (id === 'tankskill') a.perkTankSkill += BLAZE.perkTankSkill;
            else if (id === 'guarddash') a.perkDashBonus += BLAZE.perkDashRange;
            else if (id === 'ctrlextra') a.perkCtrlExtra += BLAZE.perkCtrlExtra;
            else if (id === 'invisburst') a.perkBurstMul += (BLAZE.perkBurstMul - 1);
            else if (id === 'laserwide') a.perkLaserWidth += BLAZE.perkLaserWidth;
            else if (id === 'blinkfar') a.perkBlinkDist += BLAZE.perkBlinkDist;
            else if (id === 'shiftspeed') a.perkShiftSpeed += BLAZE.shiftSpeedBuff;
            else if (id === 'shiftback') a.perkSpeed += BLAZE.shiftFuncSpeed;
            else if (id === 'engtime') a.perkBuildLife += BLAZE.engTimeBonus;
            else if (id === 'engboom') a.perkTurretBoom = true;
            else if (id === 'mirblock') a.perkBlockT += BLAZE.mirBlockBonus;
            else if (id === 'mirwide') a.perkBlockWide = true;
            else if (id === 'cdr') a.perkCdrStat = Math.min(BLAZE.perkCdrStatMax, (a.perkCdrStat || 0) + BLAZE.perkCdr);
            else if (id === 'tough') a.perkToughDmg += BLAZE.perkToughDmg;   // 生命上限走 blazeBaseHp
            else if (id === 'winhp') a.perkWinHp = true;
            else if (id === 'rage') a.perkRage = true;
            else if (id === 'execute') a.perkExec = true;
            else if (id === 'tenacity') a.perkTenacity = true;
            else if (id === 'regen') a.perkRegen = true;
            else if (id === 'backstab') a.perkBackstab = true;
            else if (id === 'windmg') a.perkWinDmg = true;
            else if (id === 'crit') a.critChance += BLAZE.perkCritChance;
            else if (id === 'critrate') a.critChance += BLAZE.perkCritRate;
            else if (id === 'critdmg') a.critMul += BLAZE.perkCritMulBig;
            else if (id === 'critpow') a.critMul += BLAZE.perkCritPow;
            else if (id === 'critheal') a.perkCritHeal = true;
            else if (id === 'critswap2') { /* 常驻效果，走 blazeCritMul 实时算 */ }
            else if (id === 'fullhp') a.perkFullHp = true;
            else if (id === 'skillup') a.perkSkillDmg += BLAZE.perkSkillDmg;
            else if (id === 'dmgpct') a.perkDmgPct += BLAZE.perkDmgPct;
            else if (id === 'hppct') a.perkHpPctMul = (a.perkHpPctMul || 1) * (1 + BLAZE.perkHpPct);
            else if (id === 'cutuni') a.perkCutBonus += BLAZE.perkCutUni;
            else if (id === 'armor') a.perkArmor = true;
            else if (id === 'bastion') a.perkBastion = true;
            else if (id === 'triple') a.perkTriple = true;
            else if (id === 'surge') a.perkSurge = true;
            else if (id === 'opener') a.perkOpener = true;
            else if (id === 'endure') a.perkEndure = true;
            else if (id === 'refund') a.perkRefund = true;
            else if (id === 'dslow') a.perkSlow = true;
            else if (id === 'dwound') a.perkWound = true;
            else if (id === 'dweak') a.perkWeak = true;
            else if (id === 'gale') a.perkSpeed += BLAZE.perkGaleSpeed;
            else if (id === 'lastone') a.perkLast = true;
            else if (id === 'bulk') { a.perkHpBonus += BLAZE.perkBulkHp; a.perkSpeed -= BLAZE.perkBulkSpeed; }
            else if (id === 'hpdmg') a.perkHpDmg = true;
            else if (id === 'dmgcd') a.perkDmgCd = true;
            else if (id === 'atkcdr') a.perkAtkCdr = true;
            else if (id === 'lifecd') a.perkCdrFunc = (a.perkCdrFunc || 0) + BLAZE.perkConvCdr;
            else if (id === 'speed') a.perkSpeed += BLAZE.perkSpeed;
        }
        const BLAZE_CHARS = {
            bow: {
                name: '远程猫盾', color: 0x66bb6a, css: '#66bb6a', hp: 70, atk: '普攻 cd 0.8s：射一箭，10 伤，基础射程 10 身位，会被墙挡住',
                act: '穿墙狙 cd 5s：无视墙体锁定最近敌人，10 伤，射程固定 10 身位',
                act2: '疾射 cd 15s：攻速 +10%，持续 7 秒',
                pas: '每打中一次，普攻射程 +1 身位（最多 5 层），5 秒没打中就清空。血量 70'
            },
            sword: {
                name: '剑猫盾', color: 0xef5350, css: '#ef5350', atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '突进 cd 10s：向前冲 5 身位，撞到的第一个敌人吃 20 伤并眩晕 1 秒',
                act2: '击晕 cd 7s：面前一名敌人 10 伤并眩晕 1 秒（面前没人就放不出去）',
                pas: '技能每命中一次，之后技能伤害 +2，最多 3 层（挨打不清空）'
            },
            heal: {
                name: '回血猫盾', color: 0x42a5f5, css: '#42a5f5', atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '治疗 cd 7s：自己回 10% 最大生命；6 身位内的队友也各回各自 10% 上限',
                act2: '汲取 cd 5s：6 身位内所有敌人各 10 伤，自己回 10% 上限（没敌人也照回）',
                pas: '被你治疗的队友 5 秒内伤害 ×1.5'
            },
            tank: {
                name: '抗伤猫盾', color: 0xffa726, css: '#ffa726', atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '震地 cd 5s：5 身位内所有敌人 10 伤并眩晕 1 秒，自己同时减伤 20% 持续 5 秒',
                act2: '护盾 cd 20s：获得最大生命 50% 的护盾，10 秒匀速掉完（毒圈无视护盾）',
                pas: '受到的伤害 −30%'
            },
            guard: {
                name: '保命猫盾', color: 0xab47bc, css: '#ab47bc', atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '闪身 cd 10s：3 段位移，每段 2 身位；撞到敌人 15 伤，不管撞没撞到都回 10% 上限。' +
                    '每段之间只有 5 秒窗口，超时没接上就直接进冷却',
                act2: '回溯 cd 20s：回到 5 秒前的位置和血量，并立刻刷新 1 技能',
                pas: '每回合一次：受到致命伤害时免疫，血量拉回 5% 最大生命'
            },
            control: {
                name: '控制猫盾', color: 0x26c6da, css: '#26c6da', atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '钩锁 cd 10s：向前甩出钩子，命中造成 15 伤并把人拖向自己，' +
                    '拖拽期间对方放不出技能，撞到自己身上再定身 1 秒（钩空了不进冷却）',
                act2: '震慑 cd 15s：5 身位内所有敌人 10 伤并眩晕 3 秒（范围内没人就放不出去）',
                pas: '普攻和眩晕每命中一次，下一次眩晕再长 0.1 秒，最多叠 5 层'
            },
            mage: {
                name: '法师猫盾', color: 0x7e57c2, css: '#7e57c2', hp: 70, atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '激光 cd 10s：向正前方射出一道贯穿激光，长度 21 身位（约地图边长 1/3），' +
                    '路径上的敌人全部命中，每个 15 伤',
                act2: '瞬移 cd 10s：直接闪到面前 4 身位的位置，撞墙会停在墙前',
                pas: '滚雪球：每过一局，伤害永久 +5（第 N 局就是 +5×(N−1)）。血量只有 70'
            },
            assassin: {
                name: '刺客猫盾', color: 0x78909c, css: '#78909c', hp: 70, atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '隐身 cd 15s：隐身 7 秒，期间不会被锁定；范围技能照样打得到，' +
                    '普攻预判准了也能砍中。自己放技能或普攻会立刻现身',
                act2: '爆发 cd 20s：前方 3 身位内的敌人各吃 20 伤（面前没人就放不出去）',
                pas: '每回合一次：血量掉到 10% 以下时刷新全部冷却并立刻隐身。血量 70'
            },
            engineer: {
                name: '工程猫盾', color: 0x6d4c41, css: '#6d4c41', hp: 90, atk: '普攻 cd 0.8s：扳手近战，10 伤',
                act: '炮台 cd 12s：放一座炮台，存在 15 秒，自动打 8 身位内的敌人。' +
                    '炮台完全继承你的攻击力和你身上所有伤害卡，最多同时 2 座（40 血，能被打掉）',
                act2: '立墙 cd 8s：面前 3 身位立一堵墙，挡视线和弹道，存在 8 秒（60 血）。' +
                    '再按一次引爆：4 身位内 20 伤并眩晕 1 秒',
                pas: '过载：场上每有一个你的建筑，你自己伤害 +15%、冷却缩减 +8%（最多算 3 个）。血量 90'
            },
            mirror: {
                name: '镜猫盾', color: 0x3949ab, css: '#3949ab', hp: 85, atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '格挡 cd 10s：架起 1.5 秒，期间受到的伤害 −70%。只要挡下至少一次攻击，' +
                    '所有打过你的人眩晕 0.5 秒并减速 15% 持续 2 秒，并立刻刷新 2 技能。挡空只走冷却',
                act2: '换位 cd 14s：和 8 身位内最近的敌人交换位置，不造成伤害但眩晕对方 1 秒。' +
                    '3 秒内可再按一次，向前突进 3 身位，路径上敌人受 10 伤',
                pas: '余像：每 15 秒攒一层（最多一层，存不下第二层）。受到伤害时自动消耗，' +
                    '完全免疫那一次，并让攻击者接下来 3 秒造成的伤害 −25%。血量 85'
            },
            shift: {
                name: '位移猫盾', color: 0x26a69a, css: '#26a69a', hp: 80, atk: '普攻 cd 0.8s：近身挥砍，10 伤',
                act: '贯影（要满充能）：向前冲 5 身位，穿过路径上所有敌人，每个 12 伤。撞墙就停',
                act2: '跃击（要满充能）：闪到 8 身位内最近敌人的背后，落地造成 15 伤。附近没人就放不出去',
                pas: '疾行：移速永久 +10%，之后每 20 秒再永久 +5%（最多 +100%），活得越久跑得越快。' +
                    '两个技能靠跑动攒充能，全速跑约 2.8 秒攒满，不吃冷却，用掉清零且存不下第二次。血量 80'
            }
        };
        const BLAZE_ORDER = ['bow', 'sword', 'heal', 'tank', 'guard', 'control', 'assassin', 'mage', 'shift', 'engineer', 'mirror'];
        // 分配用的强度表：控制最高（一串眩晕接起来是真的能锁死人），
        // 纯输出和位移偏低。发 AI 的时候按这个把两边配平。
        const BLAZE_POWER = {
            control: 5, tank: 4, mage: 4, engineer: 4, mirror: 4,
            heal: 3, sword: 3, guard: 3, bow: 3, assassin: 3, shift: 3
        };
        function blazePower(k) { return BLAZE_POWER[k] || 3; }
        function blazeShuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                let j = Math.floor(Math.random() * (i + 1)); let t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }

        // 每局开打之前发三个猫盾，挑一个上场 —— 想一直玩控制猫盾是不行的。
        // 只从你已经拥有的里面发。
        function blazeCharOffer(mode) {
            let owned = BLAZE_ORDER.filter(function (k) { return charOwned('blaze', k); });
            if (!owned.length) owned = ['bow'];
            let pool = blazeShuffle(owned.slice());
            let offer = pool.slice(0, 3);
            let go = function (k) {
                gState.blazeChar = k; saveProgress();
                if (mode === 'ffa') blazeFfaStartGo(false);
                else if (mode === 'ffaduo') blazeFfaStartGo(true);
                else if (mode === 'tomb') blazeTombStartGo();
                else if (mode === 'law') blazeLawStartGo();
                else blazeStartGo();
            };
            let txt = '<div style="font-size:12px; color:#888; margin-bottom:6px;">每局随机发三个，挑一个上场</div>' +
                offer.map(function (k) {
                    let c = BLAZE_CHARS[k];
                    return '<div style="margin:7px 0; text-align:left; border-left:3px solid ' + c.css + '; padding-left:7px;">' +
                        '<b style="color:' + c.css + ';">' + c.name + '</b>' +
                        '<br><span style="font-size:12px; color:#666;">' + c.pas + '</span></div>';
                }).join('');
            showSysModal('本局三选一', txt, offer.map(function (k) {
                return { label: BLAZE_CHARS[k].name, color: BLAZE_CHARS[k].css, onClick: function () { go(k); } };
            }));
        }
        // ── 立法的规则池 ──
        // 每一条都是「改规则」，不是「我变强」，而且一律对所有人生效，
        // 包括选它的那个人。ai 里写的是哪些猫盾偏爱这条。
        const BLAZE_LAWS = [
            {
                id: 'wallwalk', name: '穿墙', color: '#26c6da',
                desc: '所有人无视墙体，地图作废（场地外墙除外）',
                ai: { bow: 3, mage: 3, assassin: 2, shift: 2 }
            },
            {
                id: 'glass', name: '玻璃', color: '#ef5350',
                desc: '所有人血量变成 1/3，伤害不变',
                ai: { assassin: 3, mage: 3, sword: 2, bow: 2 }
            },
            {
                id: 'nostand', name: '站着就死', color: '#ffa726',
                desc: '原地不动超过 2 秒开始持续掉血',
                ai: { shift: 3, assassin: 2, guard: 2, sword: 1 }
            },
            {
                id: 'pctdmg', name: '破防', color: '#ab47bc',
                desc: '所有技能额外造成敌方 5% 最大生命的伤害',
                ai: { control: 2, tank: 2, engineer: 2, heal: 2, mirror: 2 }
            },
            {
                id: 'tanky', name: '高血低伤', color: '#66bb6a',
                desc: '所有人血量 ×2，伤害 ×0.6 —— 打得久，死得慢',
                ai: { tank: 3, heal: 3, guard: 2, mirror: 2, engineer: 1 }
            },
            {
                id: 'rollcall', name: '点名', color: '#ffd54f',
                desc: '每 10 秒，所有人的位置公开 1.5 秒',
                ai: { bow: 3, mage: 2, assassin: 2, control: 1 }
            },
            {
                id: 'litfrail', name: '显形易伤', color: '#ff7043',
                desc: '发光的人受到的伤害 ×1.5（配合「点名」用）',
                ai: { bow: 3, mage: 2, sword: 2, assassin: 2 }
            }
        ];
        function blazeLaw(id) { return !!(blaze && blaze.laws && blaze.laws[id]); }

        const BLAZE_TEAM_COL = [0x4fc3f7, 0xff7043];
        // 乱斗里每个人自成一队，脚下那圈按序号给个颜色，别都长一样
        function blazeTeamCol(team) {
            if (team < 2) return BLAZE_TEAM_COL[team];
            let c = new THREE.Color();
            c.setHSL(((team * 0.137) % 1), 0.65, 0.55);
            return c.getHex();
        }

        let blaze = null;
        let race = null;   // 竞速的状态。声明提到这里，触屏那几个判断在它之前就会用到
        let jail = null;   // 监狱救援的状态
        let dodge = null;  // 躲避球的状态
        let escapeRoom = null;  // 合作密室的状态（不叫 escape，那是浏览器自带的全局函数名）
        let park = null;        // 猫盾乐园当前在玩的小游戏
        let hub = null;         // 大厅广场（跑酷+遇到人组队）的状态
        let cake = null;        // 松饼大作战（自由混战抓人）的状态
        let cakePlatforms = [];  // 松饼地图里能跳上去的矮台子（不进 maze 网格，单独判定高度）
        let cakePlatformMeshes = [];  // 上面那些台子对应的 3D 网格，重新生成地图时先拿掉旧的

        // ── 竞速的轮间三选一 ──
        // 每轮开跑前抽三张，**只在这一轮生效**，下一轮重新抽。
        // 所以不存在叠加，也不存在越滚越强 —— 每轮大家都是干净的一张牌。
        // buff 是被动数值；技能是主动的，按 E（平板点「技能」）放，有自己的冷却，一轮里能反复用。
        const RACE_CARDS = [
            { id: 'speed', kind: 'buff', name: '疾风', desc: '移速 +10%' },
            { id: 'jump', kind: 'buff', name: '弹跳', desc: '跳跃高度 +15%' },
            { id: 'air', kind: 'buff', name: '悬浮', desc: '空中操控 +40%' },
            { id: 'dashcd', kind: 'buff', name: '疾冲', desc: '冲刺冷却 −35%' },
            { id: 'respawn', kind: 'buff', name: '回魂', desc: '掉下去后复位快 50%' },
            { id: 'accel', kind: 'buff', name: '起步', desc: '加速到满速快 35%' },
            { id: 'brake', kind: 'buff', name: '抓地', desc: '松手刹得住，滑行少 40%' },
            { id: 'sturdy', kind: 'buff', name: '沉身', desc: '被撞飞的力度 −40%' },
            { id: 'dbljump', kind: 'skill', name: '腾空', desc: '空中放技能冲天一跳，比正常跳高六成', cd: 12 },
            { id: 'blink', kind: 'skill', name: '瞬移', desc: '朝正前方闪 8 身位，缺口直接跨过去', cd: 14 },
            { id: 'hook', kind: 'skill', name: '抓钩', desc: '射程 14 身位；勾到人就拽到他身前并把他撞开，直接反超', cd: 16 },
            { id: 'small', kind: 'skill', name: '缩小', desc: '8 秒内体积减半，期间完全撞不飞', cd: 18 },
            { id: 'bridge', kind: 'skill', name: '浮桥', desc: '脚下往前架出一条三块的浮桥，存在 6 秒，能直接跨过断桥', cd: 14 }
        ];
        function raceCardDef(id) { return RACE_CARDS.filter(function (c) { return c.id === id; })[0]; }

        // ── 本轮事件 ──
        // 每轮开跑前公布，全场统一生效，所有人都知道，可以据此挑卡。
        // 好事多、坏事少（6 : 2）—— 它是用来制造变数的，不是用来恶心人的。
        const RACE_EVENTS = [
            { id: 'none', good: 1, name: '风平浪静', desc: '本轮没有特殊情况' },
            { id: 'dashfree', good: 1, name: '无限冲刺', desc: '本轮冲刺冷却减半' },
            { id: 'boxrain', good: 1, name: '道具雨', desc: '本轮道具箱翻倍' },
            { id: 'moonjump', good: 1, name: '低重力', desc: '全员跳跃高度 +20%' },
            { id: 'fastback', good: 1, name: '即时复位', desc: '掉下去几乎立刻回到检查点' },
            { id: 'solid', good: 1, name: '地板加固', desc: '本轮塌陷地板不塌' },
            { id: 'gift', good: 1, name: '开局礼包', desc: '开跑就人手一个随机道具' },
            { id: 'slow', good: 0, name: '逆风', desc: '全员移速 −10%' },
            { id: 'nobox', good: 0, name: '空赛道', desc: '本轮一个道具箱都没有' }
        ];
        function raceEv(id) { return race && race.event === id; }

        // ── 道具 ──
        // 赛道生成时就把箱子摆好（位置固定、大约每 10 秒跑程一个），
        // 但**开出什么完全随机** —— 这是这个模式最主要的运气来源。
        // 一次性，同时只能揣一个，按 Q（触屏「道具」）用掉。
        const RACE_ITEMS = [
            { id: 'charm', name: '护身符', desc: '掉下去立刻在原地复活，并无敌 1.5 秒' },
            { id: 'spring', name: '弹簧腿', desc: '接下来 3 次跳跃高度 ×1.6' },
            { id: 'boost', name: '加速', desc: '3 秒内移速 +35%' },
            { id: 'recharge', name: '冲刺充能', desc: '立刻刷新冲刺，下一次冲刺距离翻倍' },
            { id: 'cushion', name: '气垫', desc: '脚下放一块弹跳垫 —— 谁踩都弹，包括后面的人' },
            { id: 'goo', name: '粘板', desc: '身后放一块粘板，踩到的人减速 40%，持续 1.5 秒' }
        ];
        function raceItemDef(id) { return RACE_ITEMS.filter(function (o) { return o.id === id; })[0]; }
        function raceRollItem() { return RACE_ITEMS[Math.floor(Math.random() * RACE_ITEMS.length)].id; }

        function raceUseItem(r) {
            if (!r.item || r.respawnT > 0) return;
            if (race && race.phase !== 'run') return;   // 栏杆还没收起
            let id = r.item; r.item = null;
            if (id === 'charm') { r.charm = 1; }
            else if (id === 'spring') { r.springLeft = 3; }
            else if (id === 'boost') { r.boostT = Math.max(r.boostT || 0, 3); }
            else if (id === 'recharge') { r.dashCd = 0; r.bigDash = 1; }
            else if (id === 'cushion' || id === 'goo') {
                let back = (id === 'goo') ? -1 : 0;
                let dir = new THREE.Vector3(r.vel.x, 0, r.vel.z);
                if (dir.lengthSq() < 1) dir.set(0, 0, 1);
                dir.normalize();
                let px = r.p.x + dir.x * back * 18, pz = r.p.z + dir.z * back * 18;
                let m = racePlat(px, r.p.y + 0.4, pz, 20, 20,
                    id === 'cushion' ? 0x66bb6a : 0x8e24aa,
                    { h: 1.6, kind: id === 'cushion' ? 'bounce' : 'goo', emis: id === 'cushion' ? 0x1b5e20 : 0x4a148c });
                if (id === 'cushion') m.userData.power = 2.0;
                race.savePads.push({ mesh: m, t: 12 });
            }
            raceBurst(r.p.x, r.p.y, r.p.z, 0xffee58, 6, 16, 0.35);
            if (r.isPlayer) blazeFlash('用了【' + raceItemDef(id).name + '】');
        }
        function raceEventDef(id) { return RACE_EVENTS.filter(function (e) { return e.id === id; })[0]; }
        // 一轮里手上最多两样：三选一挑的技能 + 70% 摇到的 buff。
        // 都只管这一轮，下一轮重来，所以没有「几层」这回事。
        function raceHas(r, id) { return (r.skill === id || r.buff === id) ? 1 : 0; }
        function raceSkillOf(r) { return raceCardDef(r.skill); }

        // 加成算进实际数值。全部走这几个函数，别的地方不直接读 RACE.xxx
        // 一轮只有一张牌，所以这些系数只有「有」和「没有」两种情况。
        // 不叠加，就把单张的效果给足一点。
        function raceSpeedOf(r) {
            return RACE.moveSpeed * (raceHas(r, 'speed') ? 1.10 : 1) * (raceEv('slow') ? 0.90 : 1) * DAILY_MOD.speedMul * bondSpeedMul();
        }
        function raceJumpOf(r) {
            return RACE.jumpV * (raceHas(r, 'jump') ? 1.15 : 1) * (raceEv('moonjump') ? 1.20 : 1) * DAILY_MOD.jumpMul;
        }
        function raceAirOf(r) { return Math.min(1, RACE.airCtrl * (raceHas(r, 'air') ? 1.40 : 1)); }
        function raceDashCdOf(r) {
            return RACE.dashCd * (raceHas(r, 'dashcd') ? 0.65 : 1) * (raceEv('dashfree') ? 0.5 : 1);
        }
        function raceRespawnOf(r) {
            if (raceEv('fastback')) return 0.15;
            return RACE.respawnT * (raceHas(r, 'respawn') ? 0.50 : 1);
        }
        function raceAccelOf(r) { return RACE.accel * (raceHas(r, 'accel') ? 0.65 : 1); }
        function raceBrakeOf(r) { return RACE.brake * (raceHas(r, 'brake') ? 0.60 : 1); }
        function raceKnockOf(r) { return raceHas(r, 'sturdy') ? 0.60 : 1; }
        function raceRadiusOf(r) { return (r.smallT > 0) ? 6.5 : 10; }
        function raceDashMaxOf(r) { return 1; }

        const RACE_LINES = {
            skill: ['我先冲了！', '看我的！'],
            finish: ['冲线！这轮稳了', '就这速度，没得追'],
            finishMate: ['我先到了，你也加把劲', '到了！卡着点冲']
        };
        function raceGive(r, id) {
            let d = raceCardDef(id);
            if (!d) return;
            if (d.kind === 'skill') { r.skill = id; r.skillCd = 0; r.smallT = 0; }
            else r.buff = id;
        }

        // 三选一只抽技能；buff 是另外单独摇的
        function raceDrawSkills() {
            return blazeShuffle(RACE_CARDS.filter(function (c) { return c.kind === 'skill'; })).slice(0, 3);
        }
        function raceRollBuff() {
            let pool = RACE_CARDS.filter(function (c) { return c.kind === 'buff'; });
            return pool[Math.floor(Math.random() * pool.length)].id;
        }
        // 每轮给一个人发牌：技能由外面定，buff 各摇各的
        function raceDealBuff(r) {
            r.buff = null;
            if (Math.random() < RACE.cardChance) raceGive(r, raceRollBuff());
        }

        // ── 主动技能：按 E 放，有自己的冷却，一轮里能反复用 ──
        function raceSkill(r) {
            let def = raceSkillOf(r);
            if (!def) return;
            if (race && race.phase !== 'run') return;   // 开跑前放不了技能
            if ((r.skillCd > 0 && !RACE_TEST_NO_CD) || r.stunT > 0 || r.respawnT > 0) return;
            let dir = new THREE.Vector3(r.vel.x, 0, r.vel.z);
            if (dir.lengthSq() < 1) {
                if (r.isPlayer) { camera.getWorldDirection(dir); dir.y = 0; }
                else dir.set(0, 0, 1);
            }
            dir.normalize();
            if (!r.isPlayer) aiSay(r, r.name, 'skill', RACE_LINES.skill);

            if (def.id === 'dbljump') {
                if (r.onGround) return;                 // 腾空只在空中有意义
                r.vel.y = raceJumpOf(r) * 1.6;
                raceBurst(r.p.x, r.p.y, r.p.z, 0xb2ff59, 6, 16, 0.35);
            } else if (def.id === 'blink') {
                r.p.x += dir.x * 64; r.p.z += dir.z * 64;
                raceBurst(r.p.x, r.p.y, r.p.z, 0xba68c8, 7, 18, 0.35);
            } else if (def.id === 'hook') {
                // 勾到人就拽到他身前 —— 这是唯一能直接反超的手段
                let best = null, bd = 112;
                race.racers.forEach(function (o) {
                    if (o === r || o.out || o.respawnT > 0) return;
                    let dx = o.p.x - r.p.x, dz = o.p.z - r.p.z;
                    let along = dx * dir.x + dz * dir.z;
                    if (along < 6 || along > 112) return;
                    let side = Math.abs(dx * dir.z - dz * dir.x);
                    if (side > 14) return;
                    if (along < bd) { bd = along; best = o; }
                });
                if (best) {
                    r.p.x = best.p.x + dir.x * 8; r.p.z = best.p.z + dir.z * 8; r.p.y = best.p.y + 2;
                    raceKnock(best, -dir.x, -dir.z, 60);   // 顺手把他撞开
                    raceBurst(best.p.x, best.p.y, best.p.z, 0xffd54f, 7, 20, 0.4);
                } else {
                    // 勾空了：只给一点点距离，不然「勾空=112 距离」比瞬移的 64 还远，
                    // 两张牌就变成同一个东西了——抓钩的价值必须押在「有没有人可勾」上。
                    r.p.x += dir.x * 20; r.p.z += dir.z * 20;
                }
                r.vel.y = Math.max(r.vel.y, 8);
                raceBurst(r.p.x, r.p.y, r.p.z, 0xffd54f, 6, 15, 0.3);
            } else if (def.id === 'small') {
                r.smallT = 8;
                raceBurst(r.p.x, r.p.y, r.p.z, 0x80deea, 6, 15, 0.3);
            } else if (def.id === 'bridge') {
                // 三块连着往前铺，正好够架过一个断桥缺口
                for (let i = 0; i < 3; i++) {
                    let m = racePlat(r.p.x + dir.x * i * 22, r.p.y - 2, r.p.z + dir.z * i * 22,
                        20, 20, 0xb2ff59, { h: 2, emis: 0x33691e });
                    race.savePads.push({ mesh: m, t: 6 });
                }
                if (r.vel.y < 0) r.vel.y = 0;
                raceBurst(r.p.x, r.p.y, r.p.z, 0xb2ff59, 7, 20, 0.4);
            }
            r.skillCd = RACE_TEST_NO_CD ? 0 : def.cd;
        }

        function blazeRenderChars() {
            let box = document.getElementById('blaze-chars'); if (!box) return;
            if (!gState.blazeChar) gState.blazeChar = 'bow';
            box.innerHTML = BLAZE_ORDER.map(function (k) {
                let c = BLAZE_CHARS[k], on = gState.blazeChar === k, owned = charOwned('blaze', k);
                return '<button onclick="blazePick(\'' + k + '\')" style="margin:0; padding:8px 0; font-size:14px; border:2px solid ' +
                    (on ? c.css : '#ddd') + '; color:' + (on ? c.css : (owned ? '#777' : '#bbb')) + '; background:' + (on ? '#fff' : '#fafafa') + ';">' +
                    c.name + (owned ? '' : '<br><span style="font-size:11px; color:#e6a23c;">' + COIN_PRICE + ' 猫盾币</span>') + '</button>';
            }).join('');
            let cw = document.getElementById('blaze-coins');
            if (cw) cw.innerText = '猫盾币 ' + coinsOf() + (gState.streak && gState.streak.blaze ? '　连胜 ' + gState.streak.blaze : '');
            let c = BLAZE_CHARS[gState.blazeChar];
            document.getElementById('blaze-detail').innerHTML =
                '<b style="color:' + c.css + ';">' + kTxt('空格', '普攻') + '</b>　' + c.atk +
                '<br><b style="color:' + c.css + ';">' + kTxt('左键', '1技能') + '</b>　' + c.act +
                '<br><b style="color:' + c.css + ';">' + kTxt('右键', '2技能') + '</b>　' + c.act2 +
                '<br><b style="color:' + c.css + ';">被动</b>　' + c.pas;
        }
        function blazePick(k) {
            if (!charOwned('blaze', k)) { if (!charBuy('blaze', k)) { blazeRenderChars(); return; } }
            gState.blazeChar = k; blazeRenderChars(); blazeAnnounceChar();
        }

        function blazeFlash(txt) {
            let el = document.getElementById('blaze-flash'); if (!el) return;
            el.innerText = txt; el.style.opacity = '1';
            clearTimeout(blazeFlash._t);
            blazeFlash._t = setTimeout(function () { el.style.opacity = '0'; }, 1100);
        }

        // ── 场地：21×21，中心对称，两队斜角出生 ──
        function blazeBuildArena(ffa, tomb, law) {
            mSize = tomb ? BLAZE.tombSize : law ? BLAZE.lawSize : ffa ? BLAZE.ffaSize : BLAZE.size;
            blazeLayout(mSize);
            clearFootprints3D();
            huntDropMerged();
            clearMazeMeshes();
            if (night) {
                (night.survivors || []).forEach(function (a) { if (a.mesh) scene.remove(a.mesh); });
                if (night.hunter && night.hunter.mesh) scene.remove(night.hunter.mesh);
                night = null;
            }

            if (tomb) {
                // 葬场：几乎全黑 + 极浓的雾。3 身位以外什么都看不见，
                // 唯一穿得透雾的是死亡光柱、尸体墙的辉光、和挨打时亮起来的人。
                scene.background = new THREE.Color(0x05070c);
                scene.fog = new THREE.FogExp2(0x05070c, 0.016);
            } else {
                scene.background = new THREE.Color(0x8fd3f4);
                scene.fog = new THREE.FogExp2(0x8fd3f4, 0.0012);
            }

            let mid = Math.floor(mSize / 2);
            // 两根柱子（中间那根位置留给竖井），每层形状完全一样，
            // 两队站哪层都是同一张图，不会有人吃地形亏。
            let pd = Math.max(3, Math.round(mSize / 7));
            let pillars = [{ x: mid, z: mid - pd }, { x: mid, z: mid + pd }];
            // 乱斗的掩体：主要是成段的墙（横的竖的都有），零星补几根柱子。
            // 每一段都做中心对称的镜像，两边地形完全一样。
            let ffaWalls = [];
            if (tomb) pillars.length = 0;   // 葬场开局是一马平川，墙全靠死人堆出来
            if (ffa && !tomb) {
                let seen = {};
                let put = function (x, z) {
                    if (x < 2 || z < 2 || x > mSize - 3 || z > mSize - 3) return;
                    if (Math.abs(x - mid) <= 1 && Math.abs(z - mid) <= 1) return;   // 正中间留空
                    let k = x + ',' + z;
                    if (seen[k]) return;
                    seen[k] = 1;
                    ffaWalls.push({ x: x, z: z });
                };
                for (let i = 0; i < BLAZE.ffaWallRuns; i++) {
                    let x = 2 + Math.floor(Math.random() * (mSize - 4));
                    let z = 2 + Math.floor(Math.random() * (mSize - 4));
                    let len = BLAZE.ffaWallMin + Math.floor(Math.random() * (BLAZE.ffaWallMax - BLAZE.ffaWallMin + 1));
                    let hor = Math.random() < 0.5;
                    for (let t = 0; t < len; t++) {
                        let wx = hor ? x + t : x, wz = hor ? z : z + t;
                        put(wx, wz);
                        put(mSize - 1 - wx, mSize - 1 - wz);   // 镜像那一段
                    }
                }
                for (let i = 0; i < BLAZE.ffaPillars; i++) {
                    let x = 2 + Math.floor(Math.random() * (mSize - 4));
                    let z = 2 + Math.floor(Math.random() * (mSize - 4));
                    put(x, z); put(mSize - 1 - x, mSize - 1 - z);
                }
                ffaWalls.forEach(function (q) { pillars.push(q); });
            }
            let isFfaWall = function (x, z) {
                return ffaWalls.some(function (q) { return q.x === x && q.z === z; });
            };
            let isPillar = function (x, z) {
                return pillars.some(function (q) { return q.x === x && q.z === z; });
            };
            let isShaft = function (x, z) { return x === BLAZE_SHAFT.x && z === BLAZE_SHAFT.z; };
            let grid = [];
            for (let z = 0; z < mSize; z++) {
                grid[z] = [];
                for (let x = 0; x < mSize; x++) {
                    let edge = (x === 0 || z === 0 || x === mSize - 1 || z === mSize - 1);
                    grid[z][x] = (edge || isPillar(x, z)) ? 1 : 0;
                }
            }
            let spawns = [{ x: 3, z: 3 }, { x: 3, z: 6 }, { x: mSize - 4, z: mSize - 4 }, { x: mSize - 4, z: mSize - 7 }];

            const floorTex = tomb
                ? createProceduralTexture('tombfloor', '#232936', '#1c2230')
                : ffa
                    ? createProceduralTexture('ffafloor', '#5d7a44', '#4e6a39')
                    : createProceduralTexture('floor', '#cfe8a8', '#b7d98e');
            const edgeTex = tomb
                ? createProceduralTexture('tombwall', '#161a24', '#10131b')
                : ffa
                    ? createProceduralTexture('ffawall', '#3e5230', '#334426')
                    : createProceduralTexture('wall', '#9ab87a', '#7f9c62');

            let floors = ffa ? 1 : BLAZE.floors;   // 乱斗只有一层，不用爬楼
            for (let fl = 0; fl < floors; fl++) {
                let fy = fl * BLAZE.floorH;
                maze[fl] = Array(mSize).fill().map(function () { return Array(mSize).fill(null); });
                for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) {
                    let px = x * TILE, pz = z * TILE;

                    // 竖井：一楼是普通地板（人真的站在洞底），楼上那格直接不铺地板 ——
                    // 没有楼板挡着，居高临下能一路打到底，反过来因为隔着楼板看不见也打不着。
                    if (isShaft(x, z) && fl > 0 && !ffa) {
                        maze[fl][z][x] = { type: 1 };
                        continue;
                    }
                    if (isPillar(x, z) && isFfaWall(x, z)) {
                        // 乱斗的墙：一整块方的，成段连起来看着就是一堵墙
                        // 深色的墙：地面是浅绿的，掩体必须压得住，
                        // 不然墙、地面、技能特效三样全是浅色，什么都看不出来
                        let w = new THREE.Mesh(new THREE.BoxGeometry(TILE, 24, TILE),
                            new THREE.MeshLambertMaterial({ color: 0x455a64, emissive: 0x11191d }));
                        w.position.set(px, fy + 12, pz); scene.add(w);
                        maze[fl][z][x] = { type: 1, mesh: w };
                        continue;
                    }
                    if (isPillar(x, z)) {
                        let g = new THREE.Group();
                        let col = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 34, 16),
                            new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x7a6a2a }));
                        col.position.y = 17; g.add(col);
                        let cap = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 3, 16),
                            new THREE.MeshLambertMaterial({ color: 0xffe082, emissive: 0x8d6e00 }));
                        cap.position.y = 35.5; g.add(cap);
                        g.position.set(px, fy, pz); scene.add(g);
                        maze[fl][z][x] = { type: 1, mesh: g };
                        continue;
                    }
                    if (grid[z][x] === 1) {
                        let m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 26, TILE),
                            new THREE.MeshLambertMaterial({ map: edgeTex }));
                        m.position.set(px, fy + 13, pz); scene.add(m);
                        maze[fl][z][x] = { type: 1, mesh: m };
                    } else {
                        let f = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE),
                            new THREE.MeshLambertMaterial({ map: floorTex }));
                        f.rotation.x = -Math.PI / 2; f.position.set(px, fy, pz); scene.add(f);
                        maze[fl][z][x] = { type: 0, mesh: f };
                        walkableMeshes.push(f);
                    }
                }
            }

            // 竖井周围一圈矮护栏（每层都有，除了一楼地面）+ 一根贯穿全楼的光柱，
            // 老远就看得出这里能打穿到底
            for (let fl = 1; fl < floors; fl++) {
                let rail = new THREE.Mesh(new THREE.TorusGeometry(TILE * 0.62, 1.4, 6, 20),
                    new THREE.MeshBasicMaterial({ color: 0xffab91 }));
                rail.rotation.x = -Math.PI / 2;
                rail.position.set(BLAZE_SHAFT.x * TILE, fl * BLAZE.floorH + 1, BLAZE_SHAFT.z * TILE);
                mapExtraAdd(rail);
            }
            let beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, BLAZE.floorH * (floors - 1) + 30, 10, 1, true),
                new THREE.MeshBasicMaterial({ color: 0xffccbc, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
            beam.position.set(BLAZE_SHAFT.x * TILE, (BLAZE.floorH * (floors - 1) + 30) / 2, BLAZE_SHAFT.z * TILE);
            beam.visible = !ffa;
            mapExtraAdd(beam);

            // 楼梯：发光柱子 + 头顶悬浮箭头，隔着半张地图都看得见，
            // 走近了自动换层（见 blazeStairTick），不用真的爬台阶
            if (!ffa) BLAZE_STAIRS.forEach(function (s) {
                [s.fA, s.fB].forEach(function (fl) {
                    let fy = fl * BLAZE.floorH;
                    let m = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 1.5, 20),
                        new THREE.MeshBasicMaterial({ color: 0xffca28 }));
                    m.position.set(s.x * TILE, fy + 0.8, s.z * TILE); mapExtraAdd(m);

                    let pillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 26, 8),
                        new THREE.MeshBasicMaterial({ color: 0xffca28, transparent: true, opacity: 0.55 }));
                    pillar.position.set(s.x * TILE, fy + 13, s.z * TILE); mapExtraAdd(pillar);

                    let arrow = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4),
                        new THREE.MeshBasicMaterial({ color: 0xffe082 }));
                    arrow.position.set(s.x * TILE, fy + 30, s.z * TILE); mapExtraAdd(arrow);
                });
            });

            // 传送门：一对同色的发光圆盘，两端一眼配对
            if (!ffa) BLAZE_TELEPORTS.forEach(function (pr) {
                [pr.a, pr.b].forEach(function (pad) {
                    let m = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 1.5, 20),
                        new THREE.MeshBasicMaterial({ color: pr.color, transparent: true, opacity: 0.75 }));
                    m.position.set(pad.x * TILE, pad.floor * BLAZE.floorH + 1, pad.z * TILE);
                    mapExtraAdd(m);
                    let ring = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 6, 20),
                        new THREE.MeshBasicMaterial({ color: pr.color }));
                    ring.rotation.x = -Math.PI / 2;
                    ring.position.set(pad.x * TILE, pad.floor * BLAZE.floorH + 8, pad.z * TILE);
                    mapExtraAdd(ring);
                });
            });

            blazeSafeTile = [];
            for (let fl = 0; fl < floors; fl++) blazeSafeTile[fl] = blazeFindSafeTile(fl);

            return spawns;
        }

        // 表情：拿 canvas 画一张脸贴在身体正面。只有你自己的角色会带表情，
        // 别人的脸各自由各自的机器决定，不用同步。
        function makeFaceTexture(faceKey) {
            let t = new THREE.CanvasTexture(faceCanvas(faceKey));
            t.needsUpdate = true;
            return t;
        }

        function faceCanvas(faceKey) {
            let f = SHOP_FACES[faceKey] || SHOP_FACES.cat;
            if (f.special === 'cat') { let cv0 = document.createElement('canvas'); cv0.width = 64; cv0.height = 64; drawCatFace(cv0.getContext('2d')); return cv0; }
            let cv = document.createElement('canvas');
            cv.width = 64; cv.height = 64;
            let g = cv.getContext('2d');
            g.clearRect(0, 0, 64, 64);
            g.strokeStyle = '#1b1b1b'; g.fillStyle = '#1b1b1b';
            g.lineWidth = 4; g.lineCap = 'round';

            [18, 46].forEach(function (x, i) {
                if (f.eyes === 'dot') { g.beginPath(); g.arc(x, 26, 4, 0, 7); g.fill(); }
                else if (f.eyes === 'big') { g.beginPath(); g.arc(x, 26, 8, 0, 7); g.stroke(); }
                else if (f.eyes === 'arc') { g.beginPath(); g.arc(x, 30, 7, Math.PI, 0); g.stroke(); }
                else if (f.eyes === 'slant') {
                    g.beginPath();
                    g.moveTo(x - 7, 20 + (i ? 6 : 0)); g.lineTo(x + 7, 20 + (i ? 0 : 6)); g.stroke();
                } else if (f.eyes === 'wink') {
                    if (i) { g.beginPath(); g.arc(x, 30, 7, Math.PI, 0); g.stroke(); }
                    else { g.beginPath(); g.moveTo(x - 6, 26); g.lineTo(x + 6, 26); g.stroke(); }
                } else if (f.eyes === 'tear') {
                    g.beginPath(); g.arc(x, 26, 4, 0, 7); g.fill();
                    g.strokeStyle = '#4fc3f7';
                    g.beginPath(); g.moveTo(x, 32); g.lineTo(x, 44); g.stroke();
                    g.strokeStyle = '#1b1b1b';
                }
            });

            if (f.mouth === 'line') { g.beginPath(); g.moveTo(24, 46); g.lineTo(40, 46); g.stroke(); }
            else if (f.mouth === 'smile') { g.beginPath(); g.arc(32, 42, 10, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
            else if (f.mouth === 'frown') { g.beginPath(); g.arc(32, 54, 10, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
            else if (f.mouth === 'o') { g.beginPath(); g.arc(32, 46, 6, 0, 7); g.stroke(); }
            else if (f.mouth === 'smirk') { g.beginPath(); g.arc(38, 42, 8, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
            return cv;
        }

        function blazeMakeBody(key, team, faceKey, acc) {
            let g = new THREE.Group();
            let col = BLAZE_CHARS[key].color;
            let mat = new THREE.MeshLambertMaterial({ color: col });
            let body = new THREE.Mesh(new THREE.BoxGeometry(6, 11, 4), mat);
            body.position.y = 5.5; g.add(body);
            addCatFace(g, 8, 2.02, faceKey);   // 超燃的身体原来没有脸
            if (acc) addAccessories(g, 8, 2.02, 12.9, 4.2, acc);   // 配饰原来在超燃里也不显示
            // 圆锥段数从 4 提到 8——4 段是个尖顶四棱锥，贴脸/侧着看某些角度会显得
            // 像一块扁扁的三角形（跟贴图似的），8 段看着才是个正常的圆锥耳朵。
            // 身体箱体半宽是 3，耳朵半径 1.6——之前偏移 1.8 会让耳朵外沿到 3.4，
            // 超出身体边缘 0.4，看着像耳朵支棱到头外面去了。收到 1.2，外沿到 2.8，缩进去一点。
            let earGeo = new THREE.ConeGeometry(1.6, 3.4, 8);
            [-1, 1].forEach(function (sdir) {
                let ear = new THREE.Mesh(earGeo, mat);
                ear.position.set(sdir * 1.2, 12.5, 0); g.add(ear);
            });

            // 四个角色除了颜色不一样，剪影完全一样，混战里根本认不出谁是谁。
            // 每个人背/身上加一件专属道具，远处看轮廓就能分：
            // 弓背弓、剑扛剑、回血头顶十字、抗伤举盾牌。
            let propMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, emissive: new THREE.Color(col).multiplyScalar(0.25) });
            if (key === 'bow') {
                let bow = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 6, 12, Math.PI * 1.3), propMat);
                bow.rotation.y = Math.PI / 2; bow.position.set(0, 7, -3.2); g.add(bow);
                let arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 6, 6), propMat);
                arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 7, -3.2); g.add(arrow);
            } else if (key === 'sword') {
                let blade = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 0.6), propMat);
                blade.position.set(3.2, 10, -1.5); blade.rotation.z = -0.5; g.add(blade);
                let guard = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.8), propMat);
                guard.position.set(2, 6, -0.8); guard.rotation.z = -0.5; g.add(guard);
            } else if (key === 'heal') {
                let barV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 1.2), propMat);
                barV.position.set(0, 15.5, 0); g.add(barV);
                let barH = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 1.2), propMat);
                barH.position.set(0, 15.5, 0); g.add(barH);
            } else if (key === 'tank') {
                let shield = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 16), propMat);
                shield.rotation.z = Math.PI / 2; shield.position.set(0, 7, -3.4); g.add(shield);
                let boss = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), propMat);
                boss.position.set(0, 7, -3.9); g.add(boss);
            } else if (key === 'guard') {
                // 沙漏：上下两个锥形对顶
                [1, -1].forEach(function (sgn) {
                    let cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.4, 8), propMat);
                    cone.position.set(0, 15.5 + sgn * 1.7, 0);
                    cone.rotation.x = sgn > 0 ? Math.PI : 0;
                    g.add(cone);
                });
            } else if (key === 'control') {
                // 一截垂下来的铁链
                for (let i = 0; i < 4; i++) {
                    let link = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.35, 5, 8), propMat);
                    link.position.set(3.4, 9 - i * 2.2, -1);
                    link.rotation.y = Math.PI / 2; link.rotation.x = (i % 2) * 0.9;
                    g.add(link);
                }
            } else if (key === 'mage') {
                let staff = new THREE.Mesh(new THREE.BoxGeometry(0.8, 15, 0.8), propMat);
                staff.position.set(3.2, 8, -1.6); staff.rotation.z = -0.25; g.add(staff);
                let orb = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8),
                    new THREE.MeshLambertMaterial({ color: 0xd1c4e9, emissive: 0x5e35b1 }));
                orb.position.set(5.1, 15.4, -1.6); g.add(orb);
            } else if (key === 'engineer') {
                // 背后一个工具箱 + 头顶一根天线
                let box = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2), propMat);
                box.position.set(0, 8, -3.2); g.add(box);
                let ant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), propMat);
                ant.position.set(2, 15, 0); g.add(ant);
            } else if (key === 'mirror') {
                // 手上一面圆镜
                let mir = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.6, 18), propMat);
                mir.rotation.z = Math.PI / 2; mir.rotation.y = 0.3;
                mir.position.set(3.4, 8, 1); g.add(mir);
            } else if (key === 'shift') {
                // 背后两片斜着张开的风翼，一看就是跑得快的
                [-1, 1].forEach(function (sgn) {
                    let wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 3.4), propMat);
                    wing.position.set(sgn * 2.2, 10, -3.2);
                    wing.rotation.x = 0.5; wing.rotation.z = sgn * 0.4;
                    g.add(wing);
                });
            } else if (key === 'assassin') {
                // 背后交叉两把匕首
                [-1, 1].forEach(function (sgn) {
                    let dag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.5), propMat);
                    dag.position.set(sgn * 1.6, 9, -3);
                    dag.rotation.z = sgn * 0.55;
                    g.add(dag);
                });
            }

            // 两条腿：跑动的时候前后摆。摆的支点在胯部，所以腿做成
            // 一个空 Group（支点）里挂一块向下的方块，转 Group 就是抬腿。
            let legs = [];
            [-1, 1].forEach(function (sdir) {
                let hip = new THREE.Group();
                hip.position.set(sdir * 1.7, 3.2, 0);
                let leg = new THREE.Mesh(new THREE.BoxGeometry(2, 3.6, 2), mat);
                leg.position.y = -1.6;
                hip.add(leg);
                g.add(hip);
                legs.push(hip);
            });
            g.userData.legs = legs;
            // 身体和耳朵是最先加进去的三块，剩下的是这个角色的专属道具，
            // 攻击的时候整体挥出去
            g.userData.body = body;
            g.userData.props = g.children.filter(function (o) {
                return o !== body && legs.indexOf(o) < 0;
            });

            // 描边：把身上每块零件复制一份、稍微放大、只画背面，
            // 看起来就是围着角色的一圈边框。颜色在 blazeBarTick 里按敌我刷。
            let outMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false });
            let parts = [];
            g.traverse(function (o) { if (o.isMesh) parts.push(o); });
            parts.forEach(function (m) {
                let o = new THREE.Mesh(m.geometry, outMat);
                o.position.copy(m.position);
                o.rotation.copy(m.rotation);
                o.scale.copy(m.scale).multiplyScalar(1.09);
                o.renderOrder = -1;
                (m.parent || g).add(o);
            });
            g.userData.outMat = outMat;

            // 脚下一圈队伍色：远远一眼分敌我，不用看名字
            let ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.8, 6, 20),
                new THREE.MeshBasicMaterial({ color: blazeTeamCol(team) }));
            ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; g.add(ring);

            // 头顶血条：一个始终面向相机的小组，里面三层叠着
            let hb = new THREE.Group();
            hb.position.y = BLAZE_BAR.y;
            let mk = function (c, z) {
                let m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
                    new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true }));
                m.renderOrder = 900 + z; m.position.z = z * 0.01;
                hb.add(m); return m;
            };
            hb.userData.bg = mk(0x101014, 0);
            hb.userData.bg.scale.set(BLAZE_BAR.w + 0.8, BLAZE_BAR.h + 0.8, 1);
            hb.userData.hp = mk(0x66bb6a, 1);
            hb.userData.shield = mk(0xffffff, 2);
            hb.userData.stunBg = mk(0x101014, 3);
            hb.userData.stun = mk(0xffd54f, 4);
            g.add(hb);
            g.userData.hpBar = hb;
            return g;
        }

        const BLAZE_BAR = { w: 14, h: 1.8, y: 17 };

        // 宠物：一个跟在你身后飘的小几何体。纯装饰 + 一点点数值，
        // 位置每帧插值过去，看着像跟着飞。
        function blazeMakePet() {
            let sh = shopState();
            if (!sh.pet) return null;
            let st = petStage(sh.pet); if (!st) return null;
            return makePetMesh(st.def, st.st, sh.petFace);
        }
        // AI 也会带宠物（纯外观，不给它们加数值）：随机一种宠物、随机一个阶段、随机一张脸
        function aiRandomPet() {
            if (Math.random() > AI_PET_CHANCE) return null;
            let ks = Object.keys(SHOP_PETS);
            let d = SHOP_PETS[ks[Math.floor(Math.random() * ks.length)]];
            let st = d.stages[Math.floor(Math.random() * d.stages.length)];
            return makePetMesh(d, st, Math.random() < 0.5 ? 'normal' : aiRandomFace());
        }
        function makePetMesh(d, stage, faceKey) {
            let st = { st: stage };
            let geo = d.shape === 'cone' ? new THREE.ConeGeometry(2, 4, 8)
                : d.shape === 'box' ? new THREE.BoxGeometry(3.2, 3.2, 3.2)
                    : d.shape === 'octa' ? new THREE.OctahedronGeometry(2.2)
                        : new THREE.SphereGeometry(2, 10, 8);
            let col = new THREE.Color(d.css);
            let g = new THREE.Group();
            let body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
                color: col, emissive: col.clone().multiplyScalar(0.35)
            }));
            g.add(body);
            g.userData.body = body;

            // 表情贴在宠物脸上。用 Sprite 是因为宠物一直在自转，
            // 贴片会转到背面去看不见；Sprite 永远正对镜头。
            let face = new THREE.Sprite(new THREE.SpriteMaterial({
                map: faceTexFor(faceKey), transparent: true, depthTest: false
            }));
            face.renderOrder = 940;
            face.scale.set(4.4, 4.4, 1);
            face.position.set(0, 0.2, 0);
            g.add(face);
            g.userData.face = face;

            g.scale.setScalar(st.st.scale);
            scene.add(g);
            return g;
        }

        function blazePetTick(dt) {
            if (blaze && blaze.aiPets) blaze.aiPets.forEach(function (pm) {
                let a = pm.userData.owner; if (!a) return;
                pm.userData.t = (pm.userData.t || Math.random() * 6) + dt;
                let f = blazeDirOf(a);
                let tx = a.p.x - f.x * 9 - f.z * 7, tz = a.p.z - f.z * 9 + f.x * 7;
                let ty = (a.floor || 0) * BLAZE.floorH + 14 + Math.sin(pm.userData.t * 2.2) * 1.6;
                pm.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 6));
                if (pm.userData.body) pm.userData.body.rotation.y += dt * 1.4;
                pm.visible = a.alive;
            });
            if (!blaze || !blaze.pet || !blaze.me) return;
            let a = blaze.me;
            blaze.petT = (blaze.petT || 0) + dt;
            // 停在角色左后方，加一点上下浮动
            let f = blazeDirOf(a);
            let tx = a.p.x - f.x * 9 - f.z * 7;
            let tz = a.p.z - f.z * 9 + f.x * 7;
            let ty = a.floor * BLAZE.floorH + 14 + Math.sin(blaze.petT * 2.2) * 1.6;
            blaze.pet.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 6));
            if (blaze.pet.userData.body) blaze.pet.userData.body.rotation.y += dt * 1.4;
            blaze.pet.visible = a.alive;
        }
        const BLAZE_ALLY_COL = 0x2196f3;   // 队友：蓝
        const BLAZE_FOE_COL = 0xe53935;    // 敌人：红

        // 每帧刷新头顶血条：血从左往右，护盾白色从右往左盖在上面
        // ── 角色动画 ──
        // 全靠 mesh 变换，没有骨骼也没有模型：
        // 跑 = 腿前后摆 + 身体上下颠 + 前倾；站 = 缓慢呼吸；
        // 挨打 = 后仰 + 闪红；攻击 = 道具挥出去；死 = 向后倒下沉进地里。
        function blazeAnimTick(a, dt) {
            let u = a.mesh.userData;
            let fy = a.floor * BLAZE.floorH;

            // 死亡：往后倒，边倒边沉
            if (!a.alive) {
                a.deadT = Math.min(1, (a.deadT || 0) + dt * 3.5);
                let k = a.deadT;
                a.mesh.position.set(a.p.x, fy - k * 5, a.p.z);
                a.mesh.rotation.x = -k * Math.PI / 2;
                return;
            }
            if (a.deadT) { a.deadT = 0; a.mesh.rotation.x = 0; a.mesh.rotation.z = 0; }

            // 跑了多快：拿这一帧真实走过的距离算，被墙卡住就自动变成站立
            let dx = a.p.x - (a.animX === undefined ? a.p.x : a.animX);
            let dz = a.p.z - (a.animZ === undefined ? a.p.z : a.animZ);
            a.animX = a.p.x; a.animZ = a.p.z;
            let sp = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
            let run = Math.min(1, sp / 40);
            a.animT = (a.animT || 0) + dt * (2.2 + run * 16);

            let sw = Math.sin(a.animT);
            if (u.legs) {
                u.legs[0].rotation.x = sw * 0.9 * run;
                u.legs[1].rotation.x = -sw * 0.9 * run;
            }
            // 跑起来身体上下颠一点、前倾一点；冲刺前倾更狠
            let bob = Math.abs(Math.cos(a.animT)) * 1.4 * run;
            let lean = run * 0.16 + (a.dash ? 0.35 : 0);
            a.mesh.position.set(a.p.x, fy + bob + (a.jy || 0), a.p.z);
            a.mesh.rotation.x = lean;

            // 站着不动：缓慢呼吸
            if (u.body) u.body.scale.y = 1 + (1 - run) * Math.sin(a.animT * 0.9) * 0.04;

            // 攻击：道具往前挥一下（0.22 秒一个来回）
            if (a.atkAnimT > 0) {
                a.atkAnimT = Math.max(0, a.atkAnimT - dt);
                let k = 1 - a.atkAnimT / 0.22;
                let swing = Math.sin(k * Math.PI);
                if (u.props) u.props.forEach(function (o) { o.rotation.x = -swing * 1.5; });
                a.mesh.rotation.x = lean + swing * 0.25;
            } else if (u.props) {
                u.props.forEach(function (o) { if (o.rotation.x) o.rotation.x *= 0.8; });
            }

            // 挨打：整个人往后仰，同时闪红（红色在 blazeBarTick 里刷回来）
            if (a.hurtT > 0) {
                a.hurtT = Math.max(0, a.hurtT - dt);
                a.mesh.rotation.x = lean - (a.hurtT / BLAZE.hurtAnimT) * 0.4;
            }
        }

        function blazeBarTick() {
            blaze.actors.forEach(function (a) {
                let hb = a.mesh && a.mesh.userData.hpBar;
                if (!hb) return;
                // 自己是第一人称，看不到自己头顶；倒下的人也不用显示
                let show = a.alive && a.mesh.visible;
                hb.visible = show;
                if (!show) return;

                // 血条挂在模型底下，会继承模型的旋转。想让它的「世界朝向」正好等于
                // 相机朝向，本地四元数就得是 父物体世界旋转的逆 × 相机旋转。
                if (!hb.userData.q) hb.userData.q = new THREE.Quaternion();
                a.mesh.getWorldQuaternion(hb.userData.q);
                hb.quaternion.copy(hb.userData.q).invert().multiply(camera.quaternion);

                let maxHp = a.maxHp || 1;
                let hpFrac = Math.max(0, Math.min(1, a.hp / maxHp));
                let shFrac = Math.max(0, Math.min(1, (a.shield || 0) / maxHp));

                // 队友（含自己）蓝，敌人红 —— 血条和描边用同一个颜色
                let friend = blaze.me && a.team === blaze.me.team;
                let col = friend ? BLAZE_ALLY_COL : BLAZE_FOE_COL;
                if (a.hurtT > 0) col = 0xff1744;   // 挨打的那零点几秒，描边整个烧红
                if (a.mesh.userData.outMat) a.mesh.userData.outMat.color.setHex(col);

                // 复活保护：整个人半透明地闪一下，告诉所有人「现在打不动」
                if (a.invulT > 0) {
                    a.mesh.traverse(function (o) {
                        if (!o.material || o.isSprite) return;
                        o.material.transparent = true;
                        o.material.opacity = 0.45 + 0.25 * Math.sin(blaze.clock * 14);
                    });
                    a.mesh.userData._wasInvul = true;
                } else if (a.mesh.userData._wasInvul) {
                    a.mesh.userData._wasInvul = false;
                    a.mesh.traverse(function (o) {
                        if (!o.material || o.isSprite) return;
                        o.material.opacity = 1;
                    });
                }

                let hpW = BLAZE_BAR.w * hpFrac;
                hb.userData.hp.scale.set(Math.max(0.0001, hpW), BLAZE_BAR.h, 1);
                // 从左端开始长：左边缘固定在 -w/2
                hb.userData.hp.position.x = -BLAZE_BAR.w / 2 + hpW / 2;
                hb.userData.hp.material.color.setHex(col);

                let shW = BLAZE_BAR.w * shFrac;
                hb.userData.shield.visible = shW > 0.01;
                if (shW > 0.01) {
                    // 从右端往左长：右边缘固定在 +w/2
                    hb.userData.shield.scale.set(shW, BLAZE_BAR.h, 1);
                    hb.userData.shield.position.x = BLAZE_BAR.w / 2 - shW / 2;
                }

                // 眩晕条：血条上面再来一条，剩余时间越少越短
                let stunned = a.stunT > 0;
                hb.userData.stunBg.visible = stunned;
                hb.userData.stun.visible = stunned;
                if (stunned) {
                    let full = a.stunMax || a.stunT;
                    let frac = Math.max(0, Math.min(1, a.stunT / full));
                    let w = BLAZE_BAR.w * frac;
                    hb.userData.stunBg.scale.set(BLAZE_BAR.w + 0.6, BLAZE_BAR.h * 0.7 + 0.4, 1);
                    hb.userData.stunBg.position.set(0, BLAZE_BAR.h + 0.7, 0);
                    hb.userData.stun.scale.set(Math.max(0.0001, w), BLAZE_BAR.h * 0.7, 1);
                    hb.userData.stun.position.set(-BLAZE_BAR.w / 2 + w / 2, BLAZE_BAR.h + 0.7, 0);
                }
            });
        }

        // 同房间的人凑成两队：前两个位置一队、后两个一队，
        // 也就是先进房间的人自动跟你同边，人不够就用 AI 补。
        function blazeStart() { blazeCharOffer('blaze'); }
        function blazeTombStart() { blazeCharOffer('tomb'); }
        function blazeLawStart() { blazeCharOffer('law'); }
        function blazeFfaStart() { blazeCharOffer('ffa'); }
        function blazeFfaDuoStart() { blazeCharOffer('ffaduo'); }

        // 队友看 lobbyParty（组队面板里双方都同意过的人），不是随便抓房间里谁都算——
        // 之前是抓 roomList，房间里随便一个不相干的人也会被拉进 2v2。
        function blazeStartGo() {
            if (!gState.blazeChar) gState.blazeChar = 'bow';
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, PARTY_CAP - 1));
                let humans = ids.map(function (id) {
                    return { id: id, key: id === gState.id ? gState.blazeChar : (blazePeerChar[id] || 'bow') };
                });
                let plan = blazePlan(humans);
                if (ids.length > 1) bc.postMessage({ type: 'BZ_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                blazeBegin(plan, gState.id);
                return;
            }
            // 没组队：先等最多 15 秒看房间里有没有陌生人也想打这个模式，凑到人就真联机
            mmStart('blaze', 4, function (ids) {
                let humans = ids.map(function (id) {
                    return { id: id, key: id === gState.id ? gState.blazeChar : (blazePeerChar[id] || 'bow') };
                });
                let plan = blazePlan(humans);
                if (ids.length > 1) bc.postMessage({ type: 'BZ_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                blazeBegin(plan, gState.id);
            });
        }
        // 组队人数自动挑玩法：1 人乱斗单排，2 人乱斗双人（跟组队的那个人一队），
        // 3/4 人开 2v2（3 人的话 blazePlan 自动补一个 AI 凑成 4）。
        function blazeUnifiedStart() {
            let n = 1 + lobbyParty.length;
            if (n <= 1) { blazeCharOffer('ffa'); return; }
            if (n === 2) { blazeCharOffer('ffaduo'); return; }
            blazeCharOffer('blaze');
        }

        // 四个位置：0/1 是一队，2/3 是另一队。真人先坐，剩下的位置发 AI，
        // 角色不重复 —— 一局里四个猫盾各出现一次。
        function blazePlan(humans) {
            let plan = [];
            for (let i = 0; i < 4; i++) plan.push({ team: i < 2 ? 0 : 1, id: null, key: null });
            humans.slice(0, 4).forEach(function (h, i) { plan[i].id = h.id; plan[i].key = h.key; });
            let used = {};
            plan.forEach(function (q) { if (q.key) used[q.key] = 1; });
            let pool = blazeShuffle(BLAZE_ORDER.filter(function (k) { return !used[k]; }));
            // 空位不是随便发：把所有发法都试一遍，挑两边强度总和最接近的那种。
            // 这样不管你三选一挑了谁，AI 都会自动配平，不会一边倒。
            // 空位最多 3 个、池子最多 11 个，撑死一千次循环。
            let empty = plan.filter(function (q) { return !q.key; });
            let base = [0, 0];
            plan.forEach(function (r) { if (r.key) base[r.team] += blazePower(r.key); });
            let best = null;
            (function walk(i, used, sum) {
                if (i >= empty.length) {
                    let d = Math.abs(sum[0] - sum[1]);
                    // pool 已经洗过牌，严格小于 —— 一样平的几种发法里随机取一种
                    if (!best || d < best.d) best = { d: d, pick: used.slice() };
                    return;
                }
                for (let j = 0; j < pool.length; j++) {
                    if (used.indexOf(j) >= 0) continue;
                    let t = empty[i].team, w = blazePower(pool[j]);
                    sum[t] += w; used.push(j);
                    walk(i + 1, used, sum);
                    used.pop(); sum[t] -= w;
                }
            })(0, [], base.slice());
            if (best) empty.forEach(function (q, i) { q.key = pool[best.pick[i]] || 'bow'; });
            plan.forEach(function (q) { if (!q.key) q.key = 'bow'; });
            return plan;
        }

        // 乱斗：单排混战，每个人自成一队，人不够全用 AI 补。
        // 立法：6 个人的小场，开局每人公开选一条规则，整局只能选一次
        function blazeLawStartGo() {
            if (!gState.blazeChar) gState.blazeChar = 'bow';
            let n = BLAZE.lawCount;
            let plan = [];
            for (let i = 0; i < n; i++) plan.push({ team: i, id: null, key: null });
            plan[0].id = gState.id; plan[0].key = gState.blazeChar;
            let bag = [];
            for (let i = 1; i < n; i++) {
                if (!bag.length) bag = blazeShuffle(BLAZE_ORDER.slice());
                plan[i].key = bag.shift();
            }
            blazeBegin(plan, gState.id, true, false, true);
            blazeLawOpen();
        }

        // 选规则的时候整局先停住，选完才开打
        function blazeLawOpen() {
            blaze.phase = 'law';
            blaze.lawTable = blazeShuffle(BLAZE_LAWS.slice()).slice(0, BLAZE.lawShow);
            blaze.lawT = BLAZE.lawPickTime;
            blazeLawRender();
        }

        function blazeLawRender() {
            let txt = '<div style="font-size:12px; color:#888; margin-bottom:8px;">' +
                '抖杆一条。<b>它对全场所有人生效，包括你自己</b>。' +
                '6 个人各选一条，不能重复，最后会剩一条没人要。</div>' +
                blaze.lawTable.map(function (o) {
                    return '<div style="margin:6px 0; text-align:left; border-left:3px solid ' + o.color + '; padding-left:8px;">' +
                        '<b style="color:' + o.color + ';">' + o.name + '</b>' +
                        '<br><span style="font-size:12px; color:#666;">' + o.desc + '</span></div>';
                }).join('');
            showSysModal('立法 · 选一条规则（' + Math.ceil(blaze.lawT) + 's）', txt, blaze.lawTable.map(function (o) {
                return { label: o.name, color: o.color, onClick: function () { blazeLawPick(o.id); } };
            }));
        }

        function blazeLawPick(id) {
            if (!blaze || !blaze.lawTable) return;
            blazeLawApply(blaze.me, id);
            // 剩下的人依次挑：先按「这条对我这个猫盾有多顺手」打分，再掺一点随机
            let left = blaze.lawTable.filter(function (o) { return !blaze.laws[o.id]; });
            blaze.actors.forEach(function (a) {
                if (a === blaze.me || !left.length) return;
                let best = left[0], bs = -1;
                left.forEach(function (o) {
                    let sc = (o.ai[a.key] || 0) + Math.random() * 1.5;
                    if (sc > bs) { bs = sc; best = o; }
                });
                blazeLawApply(a, best.id);
                left = left.filter(function (o) { return o !== best; });
            });
            blaze.phase = 'live';
            blaze.lawTable = null;
            // 玻璃 / 高血低伤会改血量上限，定完规则统一刷一次
            blaze.actors.forEach(function (a) {
                a.maxHp = blazeBaseHp(a); a.hp = a.maxHp;
            });
            blazeFlash('本局规则：' + Object.keys(blaze.laws).map(function (k) {
                return blazeLawDef(k).name;
            }).join('、'));
        }

        function blazeLawDef(id) {
            return BLAZE_LAWS.filter(function (o) { return o.id === id; })[0] || { name: id, color: '#fff' };
        }

        function blazeLawApply(a, id) {
            blaze.laws[id] = true;
            blaze.lawBy[id] = a.name;
        }

        // 每帧：点名、站着就死
        function blazeLawTick(dt) {
            if (!blaze.law) return;
            // 还在选规则：整局冻着（phase 不是 live，谁也动不了），
            // 头上走一个 10 秒的倒计时，到点自动替你随机挑一条
            if (blaze.lawTable) {
                blaze.lawT -= dt;
                let el = document.getElementById('sys-modal-title');
                if (el) el.innerText = '立法 · 选一条规则（' + Math.max(0, Math.ceil(blaze.lawT)) + 's）';
                if (blaze.lawT <= 0) {
                    let pool = blaze.lawTable;
                    let pick = pool[Math.floor(Math.random() * pool.length)];
                    document.getElementById('sys-modal').classList.add('hidden');
                    blazeFlash('没选，随机给你一条：' + pick.name);
                    blazeLawPick(pick.id);
                }
                return;
            }
            if (blaze.phase !== 'live') return;
            if (blazeLaw('rollcall')) {
                blaze.callT = (blaze.callT || 0) - dt;
                if (blaze.callT <= 0) {
                    blaze.callT = BLAZE.lawCallEvery;
                    blaze.actors.forEach(function (a) { if (a.alive) a.litT = BLAZE.lawCallT; });
                    blazeFlash('点名！所有人暴露 ' + BLAZE.lawCallT + ' 秒');
                    sfxPlay([880, 1174], 0.3, 0.05, 'square');
                }
            }
            if (blazeLaw('nostand')) {
                blaze.actors.forEach(function (a) {
                    if (!a.alive) return;
                    if (a.stillX === undefined) { a.stillX = a.p.x; a.stillZ = a.p.z; a.stillT = 0; return; }
                    let moved = Math.hypot(a.p.x - a.stillX, a.p.z - a.stillZ);
                    if (moved > 1.5) { a.stillX = a.p.x; a.stillZ = a.p.z; a.stillT = 0; return; }
                    a.stillT = (a.stillT || 0) + dt;
                    if (a.stillT > BLAZE.lawStillT && blazeMine(a)) {
                        blazeDamage(null, a, BLAZE.lawStillDps * dt, true);
                        if (Math.random() < dt * 4) blazeBurst(a.p.x, a.p.z, 0xffa726, 4, 9, 0.25);
                    }
                });
            }
        }

        // 葬场：8 个人，每人自成一队，走的还是乱斗那一整套（商店、决赛、名次）
        function blazeTombStartGo() {
            if (!gState.blazeChar) gState.blazeChar = 'bow';
            let n = BLAZE.tombCount;
            let plan = [];
            for (let i = 0; i < n; i++) plan.push({ team: i, id: null, key: null });
            plan[0].id = gState.id; plan[0].key = gState.blazeChar;
            let bag = [];
            for (let i = 1; i < n; i++) {
                if (!bag.length) bag = blazeShuffle(BLAZE_ORDER.slice());
                plan[i].key = bag.shift();
            }
            blazeBegin(plan, gState.id, true, true);
        }

        // 角色轮流发：整份名单洗一次牌依次发，发完再洗一次——以前是纯随机，
        // 16 个人里能刷出五六个控制猫盾，从头被控到尾；这样每种猫盾最多比别人多出现一次。
        function blazeFfaBuildSolo(realIds) {
            let n = BLAZE.ffaCount;
            let plan = [];
            for (let i = 0; i < n; i++) plan.push({ team: i, id: null, key: null });
            realIds.slice(0, n).forEach(function (id, i) {
                plan[i].id = id;
                plan[i].key = id === gState.id ? gState.blazeChar : (blazePeerChar[id] || 'bow');
            });
            let bag = [];
            for (let i = 0; i < n; i++) {
                if (plan[i].id) continue;
                if (!bag.length) bag = blazeShuffle(BLAZE_ORDER.slice());
                plan[i].key = bag.shift();
            }
            return plan;
        }
        function blazeFfaStartGo(duo) {
            if (!gState.blazeChar) gState.blazeChar = 'bow';
            if (duo) {
                let n = BLAZE.ffaCount;
                let plan = [];
                // duo：相邻两个位置一队，正好 8 队 ×2 人
                for (let i = 0; i < n; i++) plan.push({ team: Math.floor(i / 2), id: null, key: null });
                plan[0].id = gState.id; plan[0].key = gState.blazeChar;
                // 组队面板里那个人（真人）顶替 1 号位，跟你一队；不是随便发个 AI 上去凑数
                let partnerId = lobbyParty[0];
                if (partnerId) { plan[1].id = partnerId; plan[1].key = blazePeerChar[partnerId] || 'bow'; }
                let bag = [];
                for (let i = 1; i < n; i++) {
                    if (plan[i].id) continue;
                    if (!bag.length) bag = blazeShuffle(BLAZE_ORDER.slice());
                    plan[i].key = bag.shift();
                }
                if (partnerId) bc.postMessage({ type: 'BZ_START', target: '*', sender: gState.id, plan: plan, host: gState.id, ffa: true, duo: true });
                blazeBegin(plan, gState.id, true);
                blaze.ffaDuo = true;
                return;
            }
            // 单排乱斗，没组队：这是没组队时"开始游戏！"按钮真正会走到的路——先等最多
            // 15 秒看房间里有没有陌生人也想上乱斗，凑到人就真联机，凑不到照旧自己配 AI。
            mmStart('blazeffa', BLAZE.ffaCount, function (ids) {
                let plan = blazeFfaBuildSolo(ids);
                if (ids.length > 1) bc.postMessage({ type: 'BZ_START', target: '*', sender: gState.id, plan: plan, host: gState.id, ffa: true, duo: false });
                blazeBegin(plan, gState.id, true);
                blaze.ffaDuo = false;
            });
        }

        function blazeBegin(plan, hostId, ffa, tomb, law) {
            // 别的模式的 Begin 都会先退出还开着的其它模式，超燃这里漏了：被联机拉进超燃时旧那局还在后台跑，
            // 两边抢镜头和按键。
            // 放在最前面：这些 Exit 会回大厅、藏起 blaze-hud，得在下面摆超燃自己的界面之前做完。（B2，重做夜间 PR #14；顺带加上后来才有的新模式 nm）
            if (race) { try { raceExit(); } catch (e) { } }
            if (jail) { try { jailExit(); } catch (e) { } }
            if (dodge) { try { dodgeExit(); } catch (e) { } }
            if (escapeRoom) { try { escapeExit(); } catch (e) { } }
            if (park) { try { parkExit(); } catch (e) { } }
            if (cake) { try { cakeExit(); } catch (e) { } }
            if (nm) { try { nmTeardown(); } catch (e) { } }
            showModeIntroIfFirstTime('blaze');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let perkElBegin = document.getElementById('blaze-perk');
            if (perkElBegin) { perkElBegin.classList.add('hidden'); perkElBegin.innerHTML = ''; }
            // 平板选完设备会把所有 .action-btn 一股脑设成 flex（包括竞速那四个键和商店键），
            // 之前只有竞速/监狱救援自己的开场会把这些摆正，超燃这条路从来没人管过 ——
            // 于是在平板上打超燃，冲刺/技能/道具四个键会跟超燃自己的按钮重叠在同一个位置。
            // 商店键同理：只有乱斗用得上，2v2/葬场/立法这三种压根没人管它，一直显示着一个按了没用的键。
            ['race-jump-btn', 'race-dash-btn', 'race-skill-btn', 'race-item-btn'].forEach(function (id) {
                let e = document.getElementById(id); if (e) e.style.display = 'none';
            });
            let cardBtn0 = document.getElementById('blaze-card-btn');
            if (cardBtn0) cardBtn0.style.display = (ffa && gState.control === 'pad') ? 'flex' : 'none';
            ensureScene();
            if (gState.control === 'laptop') {
                document.body.onmousedown = function (e) {
                    if (!blaze || blaze.over) return;
                    // 选卡面板里的点击归面板自己处理，别当成「点了游戏画面」
                    if (e.target.closest && e.target.closest('#blaze-ffa-cards')) return;
                    // 面板开着但你点了外面：收起面板、把鼠标锁回去 ——
                    // 但这一下点击照样算数，不吞掉
                    if (blaze.ffaCardOpen) {
                        blaze.ffaCardOpen = false;
                        blazeFfaCardRender();
                    }
                    if (e.target.closest && e.target.closest('button')) return;
                    // 鼠标没锁住（按了 Esc、或者刚从面板里出来）：顺手锁回去，
                    // 但不要把这次操作吞掉，不然「退出鼠标」会白白打断一次出招
                    if (!document.pointerLockElement) { safeLockPointer(); }
                    if (e.button === 0) blazeAimStart(1);
                    else if (e.button === 2) blazeAimStart(2);
                };
                document.body.onmouseup = function (e) {
                    if (!blaze || blaze.over) return;
                    if (e.button === 0) blazeAimRelease(1);
                    else if (e.button === 2) blazeAimRelease(2);
                };
            }
            shopTickDay();
            let spawns = blazeBuildArena(ffa, tomb, law);

            blaze = {
                ffa: !!ffa, tomb: !!tomb, beacons: [], tombWalls: [],
                law: !!law, laws: {}, lawBy: {}, lawTable: null, callT: BLAZE.lawCallEvery,
                ffaLeft: tomb ? BLAZE.tombTime : law ? BLAZE.lawTime : BLAZE.ffaTime, ffaCardOpen: false,
                ffaMoney: BLAZE.ffaStartMoney, ffaRefreshN: 0,
                ffaShopKind: 'func', ffaFreeN: 0, ffaFree: null, ffaCustom: false,
                chests: [], chestT: 4, chestSpots: null,
                ffaPickT: BLAZE.ffaPickEvery, ffaDraw: null, ffaFinal: false,
                score: [0, 0], round: 1, over: false, phase: 'live', wait: 0,
                actors: [], me: null, raf: null, last: performance.now(), fx: [], projectiles: [], perkUIActor: null,
                host: hostId, net: plan.some(function (q) { return q.id && q.id !== gState.id; }),
                poison: blazePoisonStart(), poisonT: 0, ring: null, clock: 0, openingPerk: false, aiming: null,
                sendSelf: 0, sendWorld: 0, builds: []
            };

            if (ffa) spawns = blazeFfaSpawns(plan.length);
            plan.forEach(function (q, i) {
                let sp = spawns[i];
                let mine = q.id === gState.id;
                let a = {
                    idx: i, team: q.team, key: q.key, isPlayer: mine, netId: q.id || null,
                    remote: !!(q.id && !mine),
                    name: q.id ? dispName(q.id) : BLAZE_CHARS[q.key].name,
                    home: { x: sp.x * TILE, z: sp.z * TILE },
                    p: new THREE.Vector3(sp.x * TILE, 0, sp.z * TILE),
                    hp: (BLAZE_CHARS[q.key].hp || BLAZE.hp), maxHp: (BLAZE_CHARS[q.key].hp || BLAZE.hp),
                    shield: 0, shieldInit: 0, alive: true, yaw: q.team ? Math.PI : 0,
                    atkCd: 0, skillCd: 0, skill2Cd: 0, bowStacks: 0, bowIdleT: 0, bow2T: 0,
                    swordStacks: 0, buffT: 0, tank2T: 0, stunT: 0,
                    invisT: 0, silenced: false, hooked: null,
                    dashCharges: 0, dashWindow: 0, snaps: [], snapT: 0,
                    dash: null, path: null, pathAge: 0, pathFloor: 0, stuckT: 0, swingT: 0,
                    perkHpBonus: 0, perkDmgBonus: 0, perkAsBonus: 0, perkHealBonus: 0,
                    perkCutBonus: 0, perkStunBonus: 0, pickedPerk: false, perkCount: {}, perkSeen: [],
                    perkMul: {}, perkHpPctMul: 1, killStreak: 0,
                    charge: 0, shiftSpeedT: 0, perkShiftSpeed: 0,
                    blockT: 0, blockedBy: [], swapWindow: 0, echo: 0, echoT: 0,
                    perkBuildLife: 0, perkTurretBoom: false, perkBlockT: 0, perkBlockWide: false,
                    slowAmt: 0,
                    skill: mine ? 1 : (ffa
                        ? Math.max(BLAZE.ffaAiFloor, aiSkillRoll('blaze'))
                        : aiSkillRoll('blaze')), castT: 0,
                    kills: 0, assists: 0, deaths: 0, respawnT: 0, lifeT: 0, aliveT: 0, invulT: 0,
                    lives: 0, out: false, outAt: 0, kb: null, hurtT: 0, animT: 0, atkAnimT: 0,
                    litT: 0, litKill: 0, litMesh: null, jy: 0, jvy: 0, mvx: 0, mvz: 0,
                    money: BLAZE.ffaStartMoney,
                    debuffBy: {}, healedBy: {},
                    perkHealCast: false, perkDashBonus: 0, perkCdPenalty: 0,
                    perkGlassDmg: 0, perkCtrlTime: 0, perkBurstMul: 1,
                    perkSwordStun: 0, perkLifesteal: 0, perkInvisAtk: 0, perkStackBonus: 0,
                    perkSwordExec: 0, perkTankSkill: 0, perkCtrlExtra: 0,
                    perkLaserWidth: 0, perkBlinkDist: 0, perkCdrStat: 0, perkCdrFunc: 0,
                    perkToughDmg: 0, perkWinHp: false,
                    perkRage: false, perkExec: false,
                    perkTenacity: false, perkRegen: false, perkBackstab: false,
                    perkWinDmg: false, perkFullHp: false, perkSkillDmg: 0,
                    perkDmgPct: 0, perkHpDmg: false,
                    perkDmgCd: false, perkAtkCdr: false,
                    perkArmor: false, perkBastion: false, perkTriple: false, perkSurge: false,
                    perkOpener: false, perkEndure: false, perkRefund: false,
                    perkSlow: false, perkWound: false, perkWeak: false,
                    slowT: 0, woundT: 0, weakT: 0,
                    perkLast: false,
                    atkSeq: 0, surgeReady: false,
                    critChance: 0, critMul: BLAZE.critMulBase,
                    perkCritHeal: false, perkRerollsLeft: 0,
                    perkSpeed: 0, noHitT: 0,
                    invisAtk: 0, invisGrace: 0, burstLock: 0,
                    usedRevive: false, usedPanic: false, stunGrow: 0,
                    floor: 0, teleCd: 0,
                    mesh: blazeMakeBody(q.key, q.team, mine ? myFace() : (q.id ? peerFaceOf(q.id) : aiRandomFace()), mine ? gState.acc : (q.id ? peerAccOf(q.id) : aiRandomAcc()))
                };
                scene.add(a.mesh);
                // 头顶名字：混战/联机的时候光看剪影分不出谁是真人朋友、谁是 AI
                let lbl = nightMakeLabel(a.name, blazeTeamCol(q.team), false, mine ? myTitle() : (q.id ? peerTitleOf(q.id) : aiRandomTitle()));
                lbl.position.y = 20; a.mesh.add(lbl);
                if (mine) lbl.visible = false;   // 自己头顶的名字不用给自己看
                blaze.actors.push(a);
                if (mine) blaze.me = a;
            });
            if (!blaze.me) blaze.me = blaze.actors[0];   // 第 5 个人进来只能看着

            // 毒圈：一圈亮环，缩到哪儿就画到哪儿
            // 半径 1 的空心圆柱，之后靠 scale 拉到毒圈半径。
            // 两面都画，人在圈里也看得到墙；不写深度，免得挡住后面的人。
            let ringGeo = new THREE.CylinderGeometry(1, 1, BLAZE.ringH, 64, 1, true);
            blaze.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                color: 0xba68c8, transparent: true, opacity: 0.25,
                side: THREE.DoubleSide, depthWrite: false
            }));
            blaze.ring.renderOrder = 5;
            scene.add(blaze.ring);

            blazeResetRound();
            bgmStart();
            // 第一局开打前先选一次加成 —— 之前只有局与局之间才有，开局那次漏了
            if (!blaze.ffa) {
                blaze.phase = 'perk'; blaze.wait = BLAZE.perkPickTime;
                blaze.openingPerk = true;
                blaze.actors.forEach(function (a) { a.pickedPerk = false; a.perkDraw = null; a.perkRerollsLeft = BLAZE.perkRerolls; });
                blazeAutoPickPerks(false);
            }
            blaze.pet = blazeMakePet();
            blaze.aiPets = [];
            blaze.actors.forEach(function (a) {
                if (a.isPlayer || a.netId) return;
                let pm = aiRandomPet(); if (pm) { pm.userData.owner = a; blaze.aiPets.push(pm); }
            });
            blaze.raf = requestAnimationFrame(blazeLoop);
        }

        function blazeLawHpMul() {
            let m = 1;
            if (blazeLaw('glass')) m *= BLAZE.lawGlassHp;
            if (blazeLaw('tanky')) m *= BLAZE.lawTankHp;
            return m;
        }

        function blazeBaseHp(a) {
            let c = BLAZE_CHARS[a.key];
            let base = ((c && c.hp) || BLAZE.hp) + (a.perkHpBonus || 0);
            if (a.isPlayer) base += petBonus().hp;   // 宠物：一点点血
            let pc = a.perkCount || {};
            // 每赢一局上限 +100（那张只能选一次的功能卡）
            if (a.perkWinHp && blaze) base += blazePk(a, 'winhp', 'perkWinHp') * (blaze.score[a.team] || 0);
            // 抗伤专属：每拿一张，上限再 ×1.2
            base *= Math.pow(1 + BLAZE.perkTankMax, pc.tankmax || 0);
            // 玻璃大炮：每拿一张，上限再 ×0.7
            base *= Math.pow(1 - blazePk(a, 'glass', 'perkGlassHp'), pc.glass || 0);
            // 铁壁（玻璃大炮的反面）：每拿一张，上限再 ×1.3
            base *= Math.pow(1 + blazePk(a, 'tough', 'perkToughHp'), pc.tough || 0);
            // 数值卡：每张 +15%（选牌时就乘好了，存在 perkHpPctMul 里）
            base *= (a.perkHpPctMul || 1);
            // 转化：拿上限换冷却
            base *= Math.pow(1 - blazePk(a, 'lifecd', 'perkConvHp'), pc.lifecd || 0);
            // 疾风：跑得快，纸也薄
            base *= Math.pow(1 - blazePk(a, 'gale', 'perkGaleHp'), pc.gale || 0);
            // 立法：玻璃 / 高血低伤是全场生效的，放在最后乘
            base *= blazeLawHpMul();
            return Math.max(10, Math.round(base));
        }

        function blazeIsHost() { return !blaze || !blaze.net || blaze.host === gState.id; }

        // 这个人归不归我算：自己永远算，AI 只有主机算，别人的角色一律不算
        function blazeMine(a) { return a.isPlayer || (!a.netId && blazeIsHost()); }

        function blazeResetRound() {
            blaze.phase = 'live'; blaze.wait = 0;
            blaze.poison = blazePoisonStart(); blaze.poisonT = 0;
            blaze.actors.forEach(function (a) {
                a.maxHp = blazeBaseHp(a); a.hp = a.maxHp; a.alive = true;
                a.shield = 0; a.shieldInit = 0;
                a.p.set(a.home.x, 0, a.home.z); a.floor = 0; a.teleCd = 0;
                a.atkCd = 0; a.skillCd = 0; a.bowStacks = 0; a.bowIdleT = 0;
                a.swordStacks = 0; a.buffT = 0; a.dash = null; a.path = null; a.pathAge = 0; a.stuckT = 0;
                a.skill2Cd = 0; a.bow2T = 0; a.tank2T = 0; a.stunT = 0; a.inPoison = false; a.target = null; a.swingT = 0;
                a.invisT = 0; a.silenced = false; a.hooked = null;
                a.dashCharges = 0; a.dashWindow = 0; a.snaps = []; a.snapT = 0;
                a.usedRevive = false; a.usedPanic = false; a.stunGrow = 0;
                a.invisAtk = 0; a.invisGrace = 0; a.burstLock = 0;
                a.noHitT = 0; a.regenT = 0; a.atkSeq = 0; a.surgeReady = false;
                a.killStreak = a.killStreak || 0;
                a.slowT = 0; a.slowAmt = 0; a.woundT = 0; a.weakT = 0; a.lifeT = 0; a.aliveT = 0; a.invulT = 0;
                a.out = false; a.outAt = 0; a.lives = 0; a.kb = null; a.hurtT = 0;
                a.jy = 0; a.jvy = 0; a.mvx = 0; a.mvz = 0;
                a.charge = 0; a.shiftSpeedT = 0; a.lastCx = undefined; a.lastCz = undefined;
                a.blockT = 0; a.blockedBy = []; a.swapWindow = 0; a.echo = 0; a.echoT = 0;
                a.fleeing = false;
                a.mesh.visible = true;
            });
            blaze.projectiles.forEach(function (q) { if (q.mesh) scene.remove(q.mesh); });
            blaze.projectiles = [];
            blazeClearBuilds();
            camera.position.set(blaze.me.p.x, BLAZE.eye, blaze.me.p.z);
            blazeFlash('第 ' + blazeRoundNo() + ' 局');
        }

        function blazeExit() {
            if (blaze && blaze.raf) cancelAnimationFrame(blaze.raf);
            if (blaze && blaze.ring) scene.remove(blaze.ring);
            if (blaze) { blazeClearBuilds(); blazeFfaClearChests(); blazeTombClear(); }
            if (blaze && blaze.pet) scene.remove(blaze.pet);
            if (blaze && blaze.aiPets) blaze.aiPets.forEach(function (pm) { scene.remove(pm); });
            if (blaze && blaze.aimRing) scene.remove(blaze.aimRing);
            if (blaze && blaze.aimCone) scene.remove(blaze.aimCone);
            if (blaze && blaze.aimLine) scene.remove(blaze.aimLine);
            if (blaze) blaze.actors.forEach(function (a) { if (a.mesh) scene.remove(a.mesh); });
            if (blaze) blaze.projectiles.forEach(function (q) { if (q.mesh) scene.remove(q.mesh); });
            if (blaze) blaze.atkHold = false;
            // 先把 blaze 清掉再停音乐 —— bgmFightMode() 看的就是这个变量，
            // 不先清的话会被判成「还在战斗」，回大厅还在放打斗曲。
            blaze = null;
            bgmStop();
            document.body.onclick = null; document.body.onmousedown = null; document.body.onmouseup = null;
            if (document.pointerLockElement) document.exitPointerLock();
            document.getElementById('blaze-hud').classList.add('hidden');
            blazeStatsOpen = false;
            let bdExit = document.getElementById('blaze-ffa-board');
            if (bdExit) { bdExit.classList.add('hidden'); bdExit.innerHTML = ''; }
            let cbExit = document.getElementById('blaze-card-btn');
            if (cbExit) cbExit.style.display = 'none';
            let fcExit = document.getElementById('blaze-ffa-cards');
            if (fcExit) { fcExit.classList.add('hidden'); fcExit.innerHTML = ''; }
            let statsElExit = document.getElementById('blaze-stats');
            if (statsElExit) { statsElExit.classList.add('hidden'); statsElExit.innerHTML = ''; }
            let perkElExit = document.getElementById('blaze-perk');
            if (perkElExit) { perkElExit.classList.add('hidden'); perkElExit.innerHTML = ''; }
            // 其它模式的 tick 循环每帧都会把 blaze-roster 清空再按需重写，退出超燃
            // 却唯独没人清过它——这行以前没加，回大厅后上一局的排位表会一直糊在左上角。
            let rosterExit = document.getElementById('blaze-roster');
            if (rosterExit) rosterExit.innerHTML = '';
            if (scene) {
                scene.background = new THREE.Color(0xf0f0f5);
                scene.fog = new THREE.FogExp2(0xf0f0f5, 0.004);
            }
            nav('screen-lobby'); selectGameMode('blaze');
        }

        function blazeBlocked(x, z, floor) {
            // 立法「穿墙」：内墙统统穿过去，但场地外圈还留着 —— 不然人会走出地图
            if (blaze && blaze.laws && blaze.laws.wallwalk) {
                let gx = Math.round(x / TILE), gz = Math.round(z / TILE);
                return gx <= 0 || gz <= 0 || gx >= mSize - 1 || gz >= mSize - 1;
            }
            let r = P_RADIUS, by = (floor || 0) * TILE;
            return checkCol(x + r, z, 9, by) || checkCol(x - r, z, 9, by) ||
                checkCol(x, z + r, 9, by) || checkCol(x, z - r, 9, by);
        }
        function blazeStep(a, mx, mz) {
            if (!blazeBlocked(a.p.x + mx, a.p.z, a.floor)) a.p.x += mx;
            if (!blazeBlocked(a.p.x, a.p.z + mz, a.floor)) a.p.z += mz;
        }

        // ── 人和人的碰撞 ──
        // 不做硬阻挡：16 个人挤在小圈里，硬挡会互相锁死谁也动不了。
        // 改成每帧把重叠的两个人各推开一半，撞进墙里的那一步照样被墙判定挡掉。
        // 效果上就是「撞得到、推得动、但不会卡住」。
        function blazeSeparate(dt) {
            let list = blaze.actors.filter(function (a) { return a.alive; });
            let d2 = BLAZE.bodyR * 2;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    let a = list[i], b = list[j];
                    if (a.floor !== b.floor) continue;
                    let dx = a.p.x - b.p.x, dz = a.p.z - b.p.z;
                    let d = Math.hypot(dx, dz);
                    if (d >= d2) continue;
                    if (d < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
                    let push = Math.min((d2 - d) / 2, BLAZE.sepForce * dt);
                    let ux = dx / d, uz = dz / d;
                    blazeStep(a, ux * push, uz * push);
                    blazeStep(b, -ux * push, -uz * push);
                }
            }
        }

        // 被封在墙里就推出去。blazeStep 只判断「下一步是不是墙」，
        // 一旦人已经在墙里，每个方向都是墙，他会永远卡死在那儿。
        // 从这一格出发能走到多大一片地方（最多数到 cap 格就够判断了）
        function blazeRoomSize(floor, gx, gz, cap) {
            let seen = {}, q = [[gx, gz]], n = 0;
            seen[gx + ',' + gz] = 1;
            while (q.length && n < cap) {
                let c = q.shift(); n++;
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
                    let x = c[0] + d[0], z = c[1] + d[1], k = x + ',' + z;
                    if (seen[k]) return;
                    let row = maze[floor] && maze[floor][z];
                    if (!row || !row[x] || row[x].type !== 0) return;
                    seen[k] = 1; q.push([x, z]);
                });
            }
            return n;
        }

        // 找一块真正待得住的空地：离自己最近、而且那一片至少能转开身
        function blazeFreeTile(a, minRoom) {
            let gx = Math.round(a.p.x / TILE), gz = Math.round(a.p.z / TILE);
            let best = null, bd = Infinity;
            for (let r = 1; r <= 10; r++) {
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    let x = gx + dx, z = gz + dz;
                    let row = maze[a.floor] && maze[a.floor][z];
                    if (!row || !row[x] || row[x].type !== 0) continue;
                    if (blazeRoomSize(a.floor, x, z, minRoom) < minRoom) continue;
                    let d = Math.hypot(x * TILE - a.p.x, z * TILE - a.p.z);
                    if (d < bd) { bd = d; best = { x: x, z: z }; }
                }
                if (best) break;
            }
            return best;
        }

        // 两种「出不去」都要救：
        // 1) 人整个陷在墙里 —— blazeStep 每个方向都是墙，他会永远卡死在原地
        // 2) 人站在空地上，但四周被封死了，那一小块地根本走不出去
        function blazeUnstick(a, dt) {
            if (!a.alive) return;
            let inWall = blazeBlocked(a.p.x, a.p.z, a.floor);
            if (!inWall) {
                // 围死判定比较贵，一秒查一次就够
                a.roomT = (a.roomT || 0) - (dt || 0);
                if (a.roomT > 0) return;
                a.roomT = 1;
                let gx = Math.round(a.p.x / TILE), gz = Math.round(a.p.z / TILE);
                if (blazeRoomSize(a.floor, gx, gz, BLAZE.minRoom) >= BLAZE.minRoom) return;
            }
            let sp = blazeFreeTile(a, BLAZE.minRoom);
            if (!sp) return;
            a.p.set(sp.x * TILE, 0, sp.z * TILE);
            a.path = null; a.kb = null;
            blazeBurst(a.p.x, a.p.z, 0xffffff, 5, 14, 0.4);
            if (a.isPlayer) {
                camera.position.set(a.p.x, BLAZE.eye, a.p.z);
                blazeFlash(inWall ? '卡在墙里，把你挪出来了' : '被围死了，把你挪出来了');
            }
        }

        // 这个位置上站着谁（冲刺撞人用）
        function blazeBodyAt(a, x, z) {
            let d2 = BLAZE.bodyR * 2;
            for (let i = 0; i < blaze.actors.length; i++) {
                let o = blaze.actors[i];
                if (o === a || !o.alive || o.floor !== a.floor) continue;
                if (Math.hypot(x - o.p.x, z - o.p.z) < d2) return o;
            }
            return null;
        }
        function blazeEnemies(a) {
            return blaze.actors.filter(function (o) { return o.alive && o.team !== a.team; });
        }
        function blazeAllies(a) {
            return blaze.actors.filter(function (o) { return o.alive && o.team === a.team && o !== a; });
        }
        function blazeNearest(a, list) {
            let best = null, bd = Infinity;
            list.forEach(function (o) {
                let d = Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z);
                if (d < bd) { bd = d; best = o; }
            });
            return best ? { t: best, d: bd } : null;
        }
        function blazeFacing(a) {
            return a.isPlayer ? camera.rotation.y : a.yaw;
        }

        function blazeInShaft(o) {
            let cx = BLAZE_SHAFT.x * TILE, cz = BLAZE_SHAFT.z * TILE;
            return Math.hypot(o.p.x - cx, o.p.z - cz) <= BLAZE.shaftRadius;
        }
        // 楼层规则：同层随便打；跨层只有「高层朝竖井里往下打」，反过来不行 ——
        // 一楼的人不管站在哪都够不着三楼，除非对面自己也凑到竖井边探头。
        function blazeCanEngage(a, t) {
            if (a.floor === t.floor) return true;
            if (a.floor > t.floor && blazeInShaft(a) && blazeInShaft(t)) return true;
            return false;
        }
        function blazeDirOf(a) {
            let y = blazeFacing(a);
            return { x: -Math.sin(y), z: -Math.cos(y) };
        }

        // 减伤是乘算叠的：抗伤被动 30% + 2 技能 20% = 实际 0.7×0.8 = 少挨 44%，
        // 不是直接 50%，免得两个一叠就免疫。
        // 连杀称号：下标就是连杀数。1 杀没有称号，从双杀开始喊。
        const BLAZE_STREAK = [null, '双杀！', '三连击！', '四连击！', '五连击！', '超神！'];

        // 谁被谁杀了。src 可能是 null（毒圈毒死的）。
        const BLAZE_LINES = {
            kill: ['一个下去了', '别浪，稳住', '这波稳了'],
            died: ['我没了，你们继续', '死得有点冤']
        };
        function blazeOnKill(src, tgt) {
            if (!blaze || !tgt) return;
            let mine = blaze.me;
            if (!src || src === tgt) {
                blazeFlash(tgt.name + ' 倒下了');
                sfxPlay([220, 165], 0.35, 0.05, 'sine');
            } else {
                src.killStreak = (src.killStreak || 0) + 1;
                let word = BLAZE_STREAK[Math.min(src.killStreak, BLAZE_STREAK.length) - 1];
                let head = (src === mine) ? '你击杀了 ' + tgt.name
                    : (tgt === mine) ? '你被 ' + src.name + ' 击杀'
                        : src.name + ' 击杀了 ' + tgt.name;
                blazeFlash(head + (word ? '　' + word : ''));
                // 连得越长，音阶爬得越高
                if (src === mine) {
                    let n = Math.min(src.killStreak, 5);
                    let base = 523.25 * Math.pow(1.12, n - 1);
                    sfxPlay([base, base * 1.26, base * 1.5].slice(0, 1 + n), 0.22, 0.07, 'triangle');
                } else if (tgt === mine) {
                    sfxPlay([196, 147], 0.4, 0.05, 'sine');
                }
            }
            tgt.killStreak = 0;
            tgt.deaths = (tgt.deaths || 0) + 1;
            if (src && src !== tgt && !src.isPlayer && !src.remote) aiSay(src, src.name, 'kill', BLAZE_LINES.kill);
            if (!tgt.isPlayer && !tgt.remote) aiSay(tgt, tgt.name, 'died', BLAZE_LINES.died);
            if (blaze.tomb) {
                blazeTombBeacon(tgt);
                // 拿了人头的人自己也会亮一会儿 —— 杀完站在原地是要付代价的。
                // 这一道是「凶手在哪」的情报，全场可见而且恒定最亮，不吃 8 身位衰减。
                if (src && src !== tgt && src.alive) {
                    src.litT = Math.max(src.litT || 0, BLAZE.tombKillLitT);
                    src.litKill = BLAZE.tombKillLitT;
                }
            }

            if (!blaze.ffa) return;
            blazeFfaEarn(tgt, BLAZE.ffaMoneyDeath, '阵亡补贴');
            if (src && src !== tgt) {
                src.kills = (src.kills || 0) + 1;
                blazeFfaEarn(src, BLAZE.ffaMoneyKill, '击杀');
            }

            // 助攻：死前 5 秒内控过死者的人，或者治疗过凶手的人
            let now = blaze.clock, win = BLAZE.ffaAssistWindow, credited = {};
            Object.keys(tgt.debuffBy || {}).forEach(function (k) {
                if (now - tgt.debuffBy[k] > win) return;
                let o = blazeActor(+k);
                if (!o || o === tgt || o === src) return;
                credited[k] = 1;
            });
            if (src) Object.keys(src.healedBy || {}).forEach(function (k) {
                if (now - src.healedBy[k] > win) return;
                let o = blazeActor(+k);
                if (!o || o === tgt || o === src) return;
                credited[k] = 1;
            });
            Object.keys(credited).forEach(function (k) {
                let o = blazeActor(+k);
                if (o) { o.assists = (o.assists || 0) + 1; blazeFfaEarn(o, BLAZE.ffaMoneyAssist, '助攻'); }
            });

            // 决赛：每死一次扣一条命，扣光了就是真的出局，不再复活
            if (blaze.ffaFinal) {
                tgt.lives = (tgt.lives || 0) - 1;
                if (tgt.lives <= 0) { blazeFfaEliminate(tgt); return; }
                if (tgt.isPlayer) blazeFlash('还剩 ' + tgt.lives + ' 条命');
            }
            tgt.respawnT = BLAZE.ffaRespawn;
            if (tgt.isPlayer) {
                blazeFlash(BLAZE.ffaRespawn + ' 秒后随机地点复活');
                blazeFfaCardToggle(true);   // 顺手把商店开出来，等复活的时候正好逛
            }
        }

        // ── 葬场：死亡光柱 ──
        // 谁死了，那一格升起一根死者颜色的光柱，穿透浓雾全场可见 ——
        // 这是这个模式里唯一的公开情报，想打架就往光柱跑。
        // 光柱灭了，那一格连同周围一小片永久变成墙：场地是被死亡长出来的。
        function blazeTombBeacon(a) {
            if (!blaze || !blaze.tomb) return;
            let col = BLAZE_CHARS[a.key].color;
            let gx = Math.max(1, Math.min(mSize - 2, Math.round(a.p.x / TILE)));
            let gz = Math.max(1, Math.min(mSize - 2, Math.round(a.p.z / TILE)));
            let h = 260;
            // fog:false —— 雾再浓也挡不住它，不然这根柱子就没意义了
            let m = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, h, 12, 1, true),
                new THREE.MeshBasicMaterial({
                    color: col, transparent: true, opacity: 0.5, fog: false,
                    side: THREE.DoubleSide, depthWrite: false
                }));
            m.position.set(gx * TILE, h / 2, gz * TILE);
            m.renderOrder = 800;
            scene.add(m);
            blaze.beacons.push({ mesh: m, t: BLAZE.tombBeamT, gx: gx, gz: gz, col: col });
            sfxPlay([98, 74], 0.9, 0.05, 'sine');
        }

        // 把一格变成永久的尸体墙
        function blazeTombWallAt(gx, gz, col) {
            if (gx < 1 || gz < 1 || gx > mSize - 2 || gz > mSize - 2) return false;
            let row = maze[0] && maze[0][gz];
            let cell = row && row[gx];
            if (!cell || cell.type !== 0) return false;
            // 有活人正踩在这格上就不封，不然人会被关进墙里
            let occupied = blaze.actors.some(function (a) {
                return a.alive && a.floor === 0 &&
                    Math.round(a.p.x / TILE) === gx && Math.round(a.p.z / TILE) === gz;
            });
            if (occupied) return false;
            let g = new THREE.Group();
            // 一根碑一样的圆柱。原来是整整一格的方块，一死封一大片，
            // 打两轮场地就被切成迷宫了。
            let body = new THREE.Mesh(new THREE.CylinderGeometry(8, 9.5, 26, 14),
                new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.3) }));
            body.position.y = 13; g.add(body);
            // 整根碑罩一层不吃雾的辉光壳，不只是顶上那一圈 ——
            // 8 身位内隔着什么都看得见，看颜色就知道谁死在这儿
            let glow = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 10.1, 27, 14),
                new THREE.MeshBasicMaterial({
                    color: col, transparent: true, opacity: 0.5, fog: false,
                    depthTest: false, depthWrite: false, side: THREE.DoubleSide
                }));
            glow.position.y = 13.5; glow.renderOrder = 700; g.add(glow);
            let cap = new THREE.Mesh(new THREE.CylinderGeometry(10.1, 10.1, 2.4, 14),
                new THREE.MeshBasicMaterial({
                    color: col, transparent: true, opacity: 0.9, fog: false,
                    depthTest: false, depthWrite: false
                }));
            cap.position.y = 27.5; cap.renderOrder = 701; g.add(cap);
            g.userData.glow = [glow, cap];
            g.position.set(gx * TILE, 0, gz * TILE);
            scene.add(g);
            maze[0][gz][gx] = { type: 1, mesh: cell.mesh };
            blaze.tombWalls.push(g);
            return true;
        }

        // 发光的东西（碑、光柱、亮起来的人、箱子、火花）能穿墙，
        // 但只穿 8 身位 —— 再远就淡没了，不然整张图一览无余。
        function blazeGlowFade(x, z) {
            let me = blaze && blaze.me;
            if (!me) return 1;
            let d = Math.hypot(x - me.p.x, z - me.p.z);
            let r = BLAZE.tombGlowSight;
            if (d >= r) return 0;
            if (d <= r * 0.6) return 1;
            return 1 - (d - r * 0.6) / (r * 0.4);
        }

        function blazeTombTick(dt) {
            if (!blaze.tomb) { blazeLitTick(dt); return; }
            // 碑：整根的辉光按距离淡出
            (blaze.tombWalls || []).forEach(function (g) {
                let f = blazeGlowFade(g.position.x, g.position.z);
                (g.userData.glow || []).forEach(function (m, i) {
                    m.visible = f > 0.02;
                    m.material.opacity = (i ? 0.9 : 0.5) * f;
                });
            });
            // 箱子的光晕同理
            (blaze.chests || []).forEach(function (c) {
                if (!c.halo) return;
                let f = blazeGlowFade(c.mesh.position.x, c.mesh.position.z);
                c.halo.visible = f > 0.02;
                c.halo.material.opacity = 0.35 * f;
            });
            blaze.beacons = (blaze.beacons || []).filter(function (b) {
                b.t -= dt;
                // 快灭的时候闪一下，提示这儿马上要变成墙
                // 死亡光柱同样是定位凶手用的：全场可见、恒定最亮，不吃距离衰减
                b.mesh.visible = true;
                b.mesh.material.opacity = b.t < 2 ? 0.6 * Math.abs(Math.sin(b.t * 8)) : 0.6;
                if (b.t > 0) return true;
                scene.remove(b.mesh); b.mesh.material.dispose();
                blazeTombWallAt(b.gx, b.gz, b.col);
                // 再往四周长几格，长成一小片而不是一根柱子
                let dirs = blazeShuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
                let put = 0;
                for (let i = 0; i < dirs.length && put < BLAZE.tombWallExtra; i++) {
                    if (blazeTombWallAt(b.gx + dirs[i][0], b.gz + dirs[i][1], b.col)) put++;
                }
                return false;
            });
            blazeLitTick(dt);
        }

        // 头顶那根「我被看见了」的光柱：葬场靠挨打点亮，立法靠点名点亮，
        // 两边共用这一套。
        function blazeLitTick(dt) {
            blaze.actors.forEach(function (a) {
                if (a.litT > 0) a.litT -= dt;
                if (a.litKill > 0) a.litKill -= dt;
                let want = a.alive && a.litT > 0;
                if (want && !a.litMesh) {
                    let col = BLAZE_CHARS[a.key].color;
                    a.litMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 90, 8, 1, true),
                        new THREE.MeshBasicMaterial({
                            color: col, transparent: true, opacity: 0.5, fog: false,
                            side: THREE.DoubleSide, depthWrite: false
                        }));
                    a.litMesh.renderOrder = 790;
                    scene.add(a.litMesh);
                }
                if (a.litMesh) {
                    if (!want) {
                        scene.remove(a.litMesh); a.litMesh.material.dispose(); a.litMesh = null;
                    } else {
                        // 凶手的光：无视距离、恒定最亮。其余的（挨打、出手）才吃衰减。
                        let kill = (a.litKill || 0) > 0;
                        let lf = (blaze.tomb && !kill) ? blazeGlowFade(a.p.x, a.p.z) : 1;
                        a.litMesh.visible = kill || lf > 0.02;
                        a.litMesh.material.opacity = kill ? 0.75
                            : (0.18 + 0.4 * Math.min(1, a.litT / BLAZE.tombLitT)) * lf;
                        a.litMesh.position.set(a.p.x, a.floor * BLAZE.floorH + 68, a.p.z);
                    }
                }
            });
        }

        function blazeTombClear() {
            (blaze.beacons || []).forEach(function (b) { scene.remove(b.mesh); });
            (blaze.tombWalls || []).forEach(function (g) { scene.remove(g); });
            blaze.actors.forEach(function (a) { if (a.litMesh) { scene.remove(a.litMesh); a.litMesh = null; } });
            blaze.beacons = []; blaze.tombWalls = [];
        }

        // 出局：名次按出局的先后倒着排 —— 撑得越久名次越高
        function blazeFfaEliminate(a) {
            if (a.out) return;
            a.out = true;
            a.outAt = blaze.clock;
            a.respawnT = Infinity;
            a.mesh.visible = false;
            blazeFlash(a.isPlayer ? '你出局了' : (a.name + ' 出局'));
            sfxPlay([392, 262, 175], 0.5, 0.06, 'sine');
            blazeNetEv({ ev: 'ffaout', i: a.idx });
            // 只剩一个人（双人局只剩一队）就直接收工
            if (blazeIsHost() && !blaze.over) {
                let live = blaze.actors.filter(function (o) { return !o.out; });
                let teams = {};
                live.forEach(function (o) { teams[o.team] = 1; });
                if (Object.keys(teams).length <= 1) blazeFfaEnd();
            }
        }

        function blazeAliveAllies(a) {
            if (!blaze) return 0;
            let n = 0;
            blaze.actors.forEach(function (o) { if (o !== a && o.team === a.team && o.alive) n++; });
            return n;
        }

        // ── 工程的建筑 ──
        // 墙是真的把格子改成「不可通行」，所以挡人、挡子弹、挡视线全都自动生效，
        // 到期或者被打掉再把格子还回去。
        function blazeBuilds(a) {
            if (!blaze.builds) return [];
            return blaze.builds.filter(function (b) { return b.owner === a && b.hp > 0; });
        }
        function blazeBuildBonus(a) {
            if (a.key !== 'engineer') return 0;
            return Math.min(BLAZE.engBuildMax, blazeBuilds(a).length);
        }

        function blazeAddBuild(b) {
            if (!blaze.builds) blaze.builds = [];
            blaze.builds.push(b);
        }

        function blazeRemoveBuild(b) {
            if (b.mesh) scene.remove(b.mesh);
            if (b.cell) {
                // 把地板还回去
                maze[b.floor][b.gz][b.gx] = b.cell;
                if (b.cell.mesh) b.cell.mesh.visible = true;
            }
            b.hp = 0;
        }

        function blazeClearBuilds() {
            (blaze.builds || []).forEach(blazeRemoveBuild);
            blaze.builds = [];
        }

        function blazeBuildTick(dt) {
            if (!blaze.builds || !blaze.builds.length) return;
            blaze.builds = blaze.builds.filter(function (b) {
                b.life -= dt;
                if (b.life <= 0 || b.hp <= 0 || !b.owner.alive) {
                    // 专属功能卡：炮台没的时候炋一下
                    if (b.type === 'turret' && b.owner.perkTurretBoom && b.owner.alive) {
                        let bx = b.mesh.position.x, bz = b.mesh.position.z;
                        blazeBurst(bx, bz, 0xff7043, 8, BLAZE.engBoomRange, 0.4);
                        blazeEnemies(b.owner).forEach(function (o) {
                            if (o.floor !== b.floor) return;
                            if (Math.hypot(o.p.x - bx, o.p.z - bz) > BLAZE.engBoomRange) return;
                            blazeDamage(b.owner, o, BLAZE.engBoomOnDeath);
                        });
                    }
                    blazeRemoveBuild(b); return false;
                }
                if (b.type === 'turret') {
                    b.atkCd -= dt;
                    if (b.atkCd <= 0 && blazeMine(b.owner)) {
                        let hit = blazeNearest({ p: b.mesh.position, team: b.owner.team, floor: b.floor },
                            blazeEnemies(b.owner).filter(function (e) {
                                return e.floor === b.floor && blazeTargetable(e) &&
                                    Math.hypot(e.p.x - b.mesh.position.x, e.p.z - b.mesh.position.z) <= BLAZE.engTurretRange;
                            }));
                        if (hit) {
                            b.atkCd = BLAZE.engTurretCd2;
                            // 用主人当伤害来源：暴击、伤害 %、专精这些卡全都照吃
                            blazeDamage(b.owner, hit.t, BLAZE.atk, false, 'atk');
                            blazeBeam({ p: { x: b.mesh.position.x, z: b.mesh.position.z }, floor: b.floor }, hit.t, 0xffa726);
                        }
                    }
                    b.mesh.rotation.y += dt * 2;
                }
                return true;
            });
        }

        function blazeEngTurret(a) {
            if (a.skillCd > 0) return;
            let mine = blazeBuilds(a).filter(function (b) { return b.type === 'turret'; });
            if (mine.length >= BLAZE.engTurretMax) blazeRemoveBuild(mine[0]);
            a.skillCd = blazeCd(a, BLAZE.engTurretCd);
            let g = new THREE.Group();
            let base = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 2, 10),
                new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
            base.position.y = 1; g.add(base);
            let head = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 5),
                new THREE.MeshLambertMaterial({ color: 0xffa726, emissive: 0x8a4b00 }));
            head.position.y = 4; g.add(head);
            g.position.set(a.p.x, a.floor * BLAZE.floorH, a.p.z);
            scene.add(g);
            blazeAddBuild({
                type: 'turret', owner: a, mesh: g, floor: a.floor,
                hp: BLAZE.engTurretHp, maxHp: BLAZE.engTurretHp,
                life: BLAZE.engTurretLife + (a.perkBuildLife || 0), atkCd: 0.4
            });
            blazeBurst(a.p.x, a.p.z, 0xffa726, 5, 11, 0.25);
        }

        function blazeEngWall(a) {
            // 已经有墙了：这一按是引爆
            let wall = blazeBuilds(a).filter(function (b) { return b.type === 'wall'; })[0];
            if (wall) {
                let wx = wall.mesh.position.x, wz = wall.mesh.position.z;
                blazeBurst(wx, wz, 0xff7043, 8, BLAZE.engBoomRange, 0.45);
                blazeEnemies(a).forEach(function (o) {
                    if (o.floor !== wall.floor) return;
                    if (Math.hypot(o.p.x - wx, o.p.z - wz) > BLAZE.engBoomRange) return;
                    blazeDamage(a, o, BLAZE.engBoomDmg);
                    blazeStun(o, BLAZE.engBoomStun, a);
                });
                blazeRemoveBuild(wall);
                blaze.builds = blaze.builds.filter(function (b) { return b.hp > 0; });
                return;
            }
            if (a.skill2Cd > 0) return;
            let dir = blazeDirOf(a);
            let tx = a.p.x + dir.x * BLAZE.engWallDist, tz = a.p.z + dir.z * BLAZE.engWallDist;
            let gx = Math.round(tx / TILE), gz = Math.round(tz / TILE);
            let row = maze[a.floor] && maze[a.floor][gz];
            let cell = row && row[gx];
            if (!cell || cell.type !== 0) return;      // 只能立在空地上
            a.skill2Cd = blazeCd(a, BLAZE.engWallCd);
            if (cell.mesh) cell.mesh.visible = true;   // 地板留着，墙盖在上面
            let m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 22, TILE * 0.5),
                new THREE.MeshLambertMaterial({ color: 0xffcc80, emissive: 0x7a4b00 }));
            m.position.set(gx * TILE, a.floor * BLAZE.floorH + 11, gz * TILE);
            scene.add(m);
            // 把这一格改成墙：走不过去、看不过去、子弹也过不去
            maze[a.floor][gz][gx] = { type: 1, mesh: cell.mesh };
            blazeAddBuild({
                type: 'wall', owner: a, mesh: m, floor: a.floor,
                gx: gx, gz: gz, cell: cell,
                hp: BLAZE.engWallHp, maxHp: BLAZE.engWallHp, life: BLAZE.engWallLife + (a.perkBuildLife || 0)
            });
            blazeBurst(gx * TILE, gz * TILE, 0xffcc80, 5, 12, 0.3);
        }

        // ── 镜猫盾 ──
        // 统一的减速入口：同时只留最狠的那一份
        // ── 击退 ──
        // 只有「物理」伤害推得动人。非物理的那几个在 BLAZE_NO_KB 里列着：
        // 法师激光是穿透光束、远程穿墙狙无视墙体、回血汲取是抽生命、
        // 钩锁本来就在往自己拽（再加一份击退会打架）、毒圈更不是打击。
        const BLAZE_NO_KB = { laser: 1, snipe: 1, drain: 1, hook: 1, poison: 1 };
        function blazeCanKnock(kind) { return !BLAZE_NO_KB[kind]; }

        // 力度固定，方向来自攻击者，暴击更狠
        function blazeKnock(src, tgt, crit) {
            if (!tgt || !tgt.alive || tgt.invulT > 0) return;
            let dx = tgt.p.x - src.p.x, dz = tgt.p.z - src.p.z;
            let d = Math.hypot(dx, dz);
            if (d < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
            let pow = BLAZE.kbForce * (crit ? BLAZE.kbCritMul : 1);
            tgt.kb = { x: dx / d * pow, z: dz / d * pow, t: BLAZE.kbTime };
        }

        function blazeKnockTick(a, dt) {
            if (!a.kb || a.kb.t <= 0) { a.kb = null; return; }
            let k = Math.min(dt, a.kb.t);
            a.kb.t -= dt;
            blazeStep(a, a.kb.x * k, a.kb.z * k);
            if (a.kb.t <= 0) a.kb = null;
        }

        function blazeSlow(tgt, amt, secs) {
            if (!tgt || !tgt.alive) return;
            if (tgt.invulT > 0) return;          // 复活保护：减速也免疫
            tgt.slowT = Math.max(tgt.slowT || 0, secs);
            tgt.slowAmt = Math.max(tgt.slowAmt || 0, amt);
        }

        function blazeMirBlock(a) {
            if (a.skillCd > 0) return;
            a.skillCd = blazeCd(a, BLAZE.mirBlockCd);
            a.blockT = BLAZE.mirBlockT + (a.perkBlockT || 0);
            a.blockedBy = [];
            blazeBurst(a.p.x, a.p.z, 0x3949ab, 6, 13, 0.3);
        }

        // 格挡结束的那一刻结算：挡到人就把他们全定住，并刷新换位
        function blazeMirBlockTick(a, dt) {
            if (a.key !== 'mirror' || !(a.blockT > 0)) return;
            a.blockT -= dt;
            if (a.blockT > 0) return;
            let hitters = (a.blockedBy || []).filter(function (o) { return o && o.alive; });
            a.blockedBy = [];
            if (!hitters.length) return;             // 挡空了，什么都不给
            // 专属功能卡：不只定打你的人，旁边一圈一起定
            if (a.perkBlockWide) {
                blazeEnemies(a).forEach(function (o) {
                    if (o.floor !== a.floor) return;
                    if (Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) > BLAZE.mirWideRange) return;
                    if (hitters.indexOf(o) < 0) hitters.push(o);
                });
            }
            hitters.forEach(function (o) {
                blazeStun(o, BLAZE.mirBlockStun, a);
                blazeSlow(o, BLAZE.mirBlockSlow, BLAZE.mirBlockSlowT);
                blazeMarkDebuff(o, a);
                blazeBurst(o.p.x, o.p.z, 0x3949ab, 6, 12, 0.3);
            });
            a.skill2Cd = 0;                          // 挡中了就刷新换位
            blazeBurst(a.p.x, a.p.z, 0x7986cb, 8, 18, 0.4);
        }

        function blazeMirSwap(a) {
            // 第二段：换位之后 3 秒内再按一次，往前撞一段
            if (a.swapWindow > 0) {
                a.swapWindow = 0;
                a.dash = { left: BLAZE.mirDashDist, dir: blazeDirOf(a), done: false, mir: true };
                blazeBurst(a.p.x, a.p.z, 0x7986cb, 6, 12, 0.25);
                return;
            }
            if (a.skill2Cd > 0) return;
            let e = blazeNearest(a, blazeEnemies(a).filter(function (o) {
                return blazeCanEngage(a, o) && blazeTargetable(o) && !(o.invulT > 0) &&
                    Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.mirSwapRange;
            }));
            if (!e) return;                          // 附近没人就不放，冷却也不走
            a.skill2Cd = blazeCd(a, BLAZE.mirSwapCd);
            let ax = a.p.x, az = a.p.z, af = a.floor;
            blazeBurst(ax, az, 0x3949ab, 6, 13, 0.3);
            a.p.set(e.t.p.x, 0, e.t.p.z); a.floor = e.t.floor;
            e.t.p.set(ax, 0, az); e.t.floor = af;
            e.t.path = null;
            blazeStun(e.t, BLAZE.mirSwapStun, a);
            blazeMarkDebuff(e.t, a);
            a.swapWindow = BLAZE.mirDashWindow;
            if (a.isPlayer) camera.position.set(a.p.x, BLAZE.eye, a.p.z);
            blazeBurst(a.p.x, a.p.z, 0x7986cb, 6, 13, 0.3);
            blazeNetEv({ ev: 'swap', i: a.idx, j: e.t.idx, x: a.p.x, z: a.p.z, ex: e.t.p.x, ez: e.t.p.z });
        }

        // 余像：15 秒攒一层，最多一层（满了就停，存不下第二层）
        function blazeMirEchoTick(a, dt) {
            if (a.key !== 'mirror') return;
            if (a.echo >= 1) { a.echoT = 0; return; }
            a.echoT = (a.echoT || 0) + dt;
            if (a.echoT >= BLAZE.mirEchoCd) { a.echoT = 0; a.echo = 1; }
        }

        function blazeCut(tgt) {
            let m = 1;
            if (tgt.key === 'tank') m *= (1 - BLAZE.tankCut);
            if (tgt.tank2T > 0) m *= (1 - BLAZE.tankBlockCut);
            if (tgt.perkCutBonus) m *= (1 - tgt.perkCutBonus);
            if (tgt.perkArmor) m *= (1 - blazePk(tgt, 'armor', 'perkArmor'));
            // 壁垒：血还厚的时候特别硬，被磨下来之后就没了
            if (tgt.perkBastion && tgt.hp > tgt.maxHp * BLAZE.perkBastionAt) m *= (1 - blazePk(tgt, 'bastion', 'perkBastionCut'));
            // 孤注：队友全没了之后，一个人反而更难杀
            if (tgt.perkLast && blazeAliveAllies(tgt) === 0) m *= (1 - blazePk(tgt, 'lastone', 'perkLastCut'));
            return m;
        }

        function blazeApplyDamage(tgt, dmg, ignoreShield) {
            if (!tgt || !tgt.alive) return;
            if (dmg > 0) tgt.noHitT = 0;   // 挨打了，再生要重新数
            // 护盾先扛，破了之后剩下的才扣血。毒圈是例外 —— 站在圈外照样掉血，
            // 不然抗伤可以顶着盾在毒里站 10 秒。
            if (tgt.shield > 0 && !ignoreShield) {
                let absorb = Math.min(tgt.shield, dmg);
                tgt.shield -= absorb; dmg -= absorb;
                if (tgt.shield <= 0) { tgt.shield = 0; tgt.shieldInit = 0; }
                if (dmg <= 0) return;
            }
            tgt.hp -= dmg;
            if (tgt.hp <= 0) {
                // 保命猫盾被动：每回合一次，致命伤害免疫，血量拉回 5% 最大生命
                if (tgt.key === 'guard' && !tgt.usedRevive) {
                    tgt.usedRevive = true;
                    tgt.hp = Math.max(1, tgt.maxHp * BLAZE.guardRevivePct);
                    blazeBurst(tgt.p.x, tgt.p.z, 0xab47bc, 8, 18, 0.5);
                    return;
                }
                tgt.hp = 0; tgt.alive = false; tgt.mesh.visible = false;
            }
            // 刺客被动：残到 10% 以下，每回合一次，刷新所有冷却并立刻隐身
            if (tgt.key === 'assassin' && !tgt.usedPanic && tgt.alive && tgt.hp <= tgt.maxHp * BLAZE.assassinPanicPct) {
                tgt.usedPanic = true;
                tgt.skillCd = 0; tgt.skill2Cd = 0; tgt.atkCd = 0;
                tgt.invisT = BLAZE.assassinInvisTime;
                blazeBurst(tgt.p.x, tgt.p.z, 0x78909c, 8, 18, 0.5);
                blazeNetEv({ ev: 'invis', i: tgt.idx, t: tgt.invisT });
            }
        }

        // 谁打的谁算伤害，然后把结果广播出去 —— 四台机器上血量才对得上。
        // 法师被动：局数越靠后打得越疼。用局数直接算，不用另存状态，
        // 联机两边算出来也一定一样。
        // 这条命活了多久。2v2 里每局开头都重生，所以它就是本局时间；
        // 乱斗里每次复活重新数 —— 两个模式用同一个口径。
        function blazeLifeT(a) { return a.lifeT || 0; }
        // 持久看的是「这一局你总共活了多久」——死了复活也接着往上加，不清零。
        // 2v2 里每局开头统一重置，所以那边它就等于本局时长。
        function blazeAliveT(a) { return a.aliveT || 0; }

        function blazeFlatDmg(a) {
            let v = (a.perkDmgBonus || 0) + (a.invisAtk || 0);
            if (a.isPlayer) v += petBonus().dmg;   // 宠物：一点点伤害
            if (a.key === 'mage') v += BLAZE.mageRoundDmg * (blazeRoundNo() - 1);
            // 持久：这一局拖得越久，伤害越高
            if (a.perkEndure && blaze) {
                v += Math.floor(blazeAliveT(a) / BLAZE.perkEndurePer) * blazePk(a, 'endure', 'perkEndureAdd');
            }
            // 血怒：血越厚打得越疼
            if (a.perkHpDmg) v += Math.floor((a.maxHp || 0) / BLAZE.perkHpDmgPer) * blazePk(a, 'hpdmg', 'perkHpDmgAdd');
            return v;
        }

        function blazeDamage(src, tgt, amount, raw, kind) {
            if (!tgt.alive) return 0;
            // 复活保护：真·无敌。照样能被锁定、照样进伤害结算（所以攻击方的
            // 吸血、嗜血、回气这些效果全都照常触发），唯一的区别就是你不掉血、
            // 也不吃任何控制和负面。
            let immune = tgt.invulT > 0;
            // 镜的格挡：这 1.5 秒大幅减伤（不是免疫），
            // 同时把打你的人记下来，格挡结束时一起减速
            let mirBlocked = (!raw && tgt.key === 'mirror' && tgt.blockT > 0);
            if (mirBlocked && src && src !== tgt) {
                tgt.blockedBy = tgt.blockedBy || [];
                if (tgt.blockedBy.indexOf(src) < 0) tgt.blockedBy.push(src);
            }
            // 余像：攒着的那一层自动挡下这一次，并且削攻击者接下来的输出
            if (!raw && !immune && tgt.key === 'mirror' && tgt.echo >= 1 && amount > 0) {
                tgt.echo = 0; tgt.echoT = 0;
                if (src && src !== tgt) src.weakT = Math.max(src.weakT || 0, BLAZE.mirEchoWeakT);
                blazeBurst(tgt.p.x, tgt.p.z, 0x3949ab, 6, 14, 0.35);
                return 0;
            }
            let dmg = amount;
            let crit = false;
            if (!raw) {
                let isAtk = (kind === 'atk');
                if (src) dmg += blazeFlatDmg(src);
                if (src && !isAtk && src.perkSkillDmg) dmg *= (1 + src.perkSkillDmg);  // 专精：只加技能
                if (src && src.perkDmgPct) dmg *= Math.max(0.1, 1 + src.perkDmgPct);   // 伤害 %：数值卡
                // 工程被动：场上每个建筑给一份伤害
                if (src && src.key === 'engineer') dmg *= (1 + blazeBuildBonus(src) * BLAZE.engBuildDmg);
                if (src && src.weakT > 0) dmg *= (1 - BLAZE.debuffWeak);               // 破胆：自己被削了输出
                // 孤注：只剩自己一个人的时候彻底放开打
                if (src && src.perkLast && blazeAliveAllies(src) === 0) dmg *= (1 + blazePk(src, 'lastone', 'perkLastDmg'));
                // 先锋：每局开场那阵子打得凶
                if (src && src.perkOpener && blaze && blazeLifeT(src) <= BLAZE.perkOpenerT) {
                    dmg *= (1 + blazePk(src, 'opener', 'perkOpenerDmg'));
                }
                // 三连：普攻数到第三下翻倍
                if (src && src.perkTriple && isAtk) {
                    src.atkSeq = (src.atkSeq || 0) + 1;
                    if (src.atkSeq % BLAZE.perkTripleEvery === 0) dmg *= blazePk(src, 'triple', 'perkTripleMul');
                }
                // 怒涛：技能打中之后，紧接着的那一下普攻更疼
                if (src && src.perkSurge) {
                    if (isAtk) {
                        if (src.surgeReady) { dmg *= (1 + blazePk(src, 'surge', 'perkSurgeMul')); src.surgeReady = false; }
                    } else src.surgeReady = true;
                }
                // 每赢一局伤害 +50
                if (src && src.perkWinDmg && blaze) dmg += blazePk(src, 'windmg', 'perkWinDmg') * (blaze.score[src.team] || 0);
                // 先手：专打满血的
                if (src && src.perkFullHp && tgt.hp >= tgt.maxHp * BLAZE.perkFullHpAt) dmg *= (1 + blazePk(src, 'fullhp', 'perkFullHpDmg'));
                if (src && src.perkGlassDmg) dmg *= (1 + src.perkGlassDmg);   // 玻璃大炮：打得更疼
                if (src && src.perkToughDmg) dmg *= (1 - src.perkToughDmg);   // 铁壁：换来的代价是输出变低
                if (src && src.buffT > 0) dmg *= BLAZE.healBuff;              // 回血猫盾给的增伤
                // 背水：自己残血时打得更凶
                if (src && src.perkRage && src.hp < src.maxHp * BLAZE.perkRagePct) dmg *= (1 + blazePk(src, 'rage', 'perkRageDmg'));
                // 处决：专门收残血
                if (src && src.perkExec && tgt.hp < tgt.maxHp * BLAZE.perkExecPct) dmg *= (1 + blazePk(src, 'execute', 'perkExecDmg'));
                // 背刺：从对方背后打
                if (src && src.perkBackstab && blazeIsBehind(src, tgt)) dmg *= (1 + blazePk(src, 'backstab', 'perkBackstab'));
                // 暴击：按暴击率掷一次，中了乘暴击倍率
                if (src && Math.random() < blazeCritChance(src)) {
                    dmg *= blazeCritMul(src);
                    crit = true;
                }
                // ── 立法的三条改伤害的规则 ──
                if (blaze.law) {
                    // 破防：技能额外打掉对方一截最大生命（普攻不算）
                    if (blazeLaw('pctdmg') && kind !== 'atk') dmg += tgt.maxHp * BLAZE.lawPctDmg;
                    if (blazeLaw('tanky')) dmg *= BLAZE.lawTankDmg;
                    // 显形易伤：亮着的时候挨打更疼
                    if (blazeLaw('litfrail') && tgt.litT > 0) dmg *= BLAZE.lawLitMul;
                }
                dmg *= blazeCut(tgt);
                if (mirBlocked) {
                    dmg *= (1 - BLAZE.mirBlockCut);
                    blazeBurst(tgt.p.x, tgt.p.z, 0x7986cb, 5, 10, 0.2);
                }
            }
            let wasAlive = tgt.alive;
            if (!immune) {
                blazeApplyDamage(tgt, dmg, !!raw);
                blazeNetEv({ ev: 'dmg', i: tgt.idx, amt: dmg, raw: !!raw, c: crit, s: src ? src.idx : -1 });
            }
            if (!raw) blazeDamageText(tgt, dmg, crit, immune);
            if (wasAlive && !tgt.alive) blazeOnKill(src, tgt);

            if (!raw && src) {
                if (crit) {
                    blazeBurst(tgt.p.x, tgt.p.z, 0xffee58, 8, 12, 0.3);
                    // 嗜血：暴击之后再掷一次，中了才回血
                    if (src.perkCritHeal && src.alive && Math.random() < blazePk(src, 'critheal', 'perkCritHealChance')) {
                        blazeHeal(src, src.maxHp * blazePk(src, 'critheal', 'perkCritHealPct'));
                    }
                }
                // 三张负面效果卡：打中就挂上，同时计一笔助攻
                if (dmg > 0 && !immune && (src.perkSlow || src.perkWound || src.perkWeak)) {
                    if (src.perkSlow) blazeSlow(tgt, BLAZE.debuffSlow, BLAZE.debuffSlowT);
                    if (src.perkWound) tgt.woundT = Math.max(tgt.woundT || 0, BLAZE.debuffWoundT);
                    if (src.perkWeak) tgt.weakT = Math.max(tgt.weakT || 0, BLAZE.debuffWeakT);
                    blazeMarkDebuff(tgt, src);
                }
                // 回气：打中人就把技能冷却往回拨一点
                if (src.perkRefund && dmg > 0) {
                    src.skillCd = Math.max(0, src.skillCd - blazePk(src, 'refund', 'perkRefundCd'));
                    src.skill2Cd = Math.max(0, src.skill2Cd - blazePk(src, 'refund', 'perkRefundCd'));
                }
                // 保命专属：吸血
                if (src.perkLifesteal > 0 && dmg > 0) blazeHeal(src, dmg * src.perkLifesteal);
                // 击退 + 打击粒子：无敌的人推不动，但火花照冒（打在盾上的感觉）
                if (dmg > 0 && src !== tgt && blazeCanKnock(kind)) {
                    if (!immune) blazeKnock(src, tgt, crit);
                    blazeHitFx(src, tgt, crit, immune);
                    // 只有自己打人/被打才出声——AI 之间满场对砍要都出声，
                    // 吵得没法听，而且大部分时候压根不在你屏幕附近。
                    if (blaze.me && (src === blaze.me || tgt === blaze.me)) sfxThud(crit);
                }
                if (dmg > 0 && !immune) tgt.hurtT = BLAZE.hurtAnimT;
                // 葬场：打起来两边都会亮 —— 挨打的亮，出手的也亮。
                // 想偷偷摸摸就别开火，一动手你自己也在广播位置。
                if (dmg > 0 && blaze.tomb) {
                    if (!immune) tgt.litT = Math.max(tgt.litT || 0, BLAZE.tombLitT);
                    src.litT = Math.max(src.litT || 0, BLAZE.tombAtkLitT);
                }
            }
            return dmg;
        }

        // 记一笔「谁对谁做了什么」，死的时候回头查 5 秒内的算助攻
        function blazeMarkDebuff(tgt, src) {
            if (!tgt || !src || src === tgt || !blaze) return;
            tgt.debuffBy = tgt.debuffBy || {};
            tgt.debuffBy[src.idx] = blaze.clock;
        }
        function blazeMarkHeal(tgt, src) {
            if (!tgt || !src || src === tgt || !blaze) return;
            tgt.healedBy = tgt.healedBy || {};
            tgt.healedBy[src.idx] = blaze.clock;
        }

        function blazeStun(tgt, secs, src) {
            if (!tgt.alive) return;
            if (tgt.invulT > 0) return;          // 复活保护：控制也免疫
            blazeMarkDebuff(tgt, src);
            // 控制猫盾被动：每次普攻/眩晕命中都让下一次眩晕再长 0.1 秒，最多叠 5 层
            if (src && src.key === 'control') {
                secs += (src.stunGrow || 0) * BLAZE.ctrlStunGrow;
                secs += (src.perkCtrlTime || 0);            // 数值卡：控制时长 +0.1
                src.stunGrow = Math.min(BLAZE.ctrlStunGrowMax, (src.stunGrow || 0) + 1);
            }
            // 控制专属功能卡：按目标最大生命再追加一点控制时间
            if (src && src.perkCtrlExtra > 0) secs += tgt.maxHp * src.perkCtrlExtra;
            // 韧性：吃到的控制统统砍半
            if (tgt.perkTenacity) secs *= (1 - BLAZE.perkTenacity);
            tgt.stunT = Math.max(tgt.stunT, secs);
            tgt.stunMax = tgt.stunT;
            tgt.dash = null;
            blazeNetEv({ ev: 'stun', i: tgt.idx, t: secs });
        }

        function blazeHeal(tgt, amt) {
            if (tgt.woundT > 0) amt *= (1 - BLAZE.debuffWound);   // 重创：治疗减半
            // 站在毒圈外面，所有治疗打对折 —— 不然可以躲在圈外互相奶着耗时间
            if (tgt.inPoison) amt *= BLAZE.poisonHealMul;
            tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
            blazeNetEv({ ev: 'heal', i: tgt.idx, amt: amt });
        }

        // 选了「放技能回血」这张功能卡之后，任何技能都会顺带回一点
        function blazeCastHeal(a) {
            if (!a.perkHealCast) return;
            blazeHeal(a, a.maxHp * BLAZE.perkHealCastPct * (1 + a.perkHealBonus));
        }
        // 治疗量：一律按目标最大生命的百分比算
        function blazeHealAmount(src, tgt) {
            return tgt.maxHp * BLAZE.healPct * (1 + (src.perkHealBonus || 0));
        }

        // 护盾：初始 = 最大生命的 50%，10 秒整匀速掉完。
        // 重复施放直接盖掉旧盾，不叠加。
        function blazeGiveShield(a) {
            a.shieldInit = blazeBaseHp(a) * BLAZE.tankShieldPct;
            a.shield = a.shieldInit;
        }
        function blazeShieldTick(a, dt) {
            if (a.shield <= 0) return;
            a.shield -= (a.shieldInit / BLAZE.tankShieldSec) * dt;
            if (a.shield <= 0) { a.shield = 0; a.shieldInit = 0; }
        }

        // 被钩子拖着的时候放不出技能
        // 冷却缩减：所有技能冷却统一从这儿过一遍
        // 实际生效的冷却缩减 = 卡面上攒的那份 + 提速把伤害换来的那份。
        // 数值卡那一路单独封 60%；功能卡（转化 / 提速）不封顶，只在总和处拦在 100%。
        // 提速读的是总固定伤害，里面没有任何一项反过来读冷却，不会成环。
        // 实际暴击倍率：自己攒的那份，再加上「换算」按当前暴击率换来的那份。
        // 这张牌是常驻的 —— 暴击率为 0 时拿也没关系，后面涨上去它自己就跟着涨。
        // 换算读的是暴击率，加到倍率上，两边不同的量，不会自己喂自己。
        // 暴击率最多 100%，多出来的部分不作用于任何人，纯浪费。
        function blazeCritChance(a) { return Math.min(1, a.critChance || 0); }

        function blazeCritMul(a) {
            let v = a.critMul || BLAZE.critMulBase;
            let n = (a.perkCount && a.perkCount['critswap2']) || 0;
            if (n) v += n * blazeCritChance(a) * blazePk(a, 'critswap2', 'perkSwapToMul');
            return v;
        }

        function blazeCdr(a) {
            let v = Math.min(BLAZE.perkCdrStatMax, a.perkCdrStat || 0) + (a.perkCdrFunc || 0);
            v += blazeBuildBonus(a) * BLAZE.engBuildCdr;   // 工程被动：建筑也给冷却缩减
            if (a.perkDmgCd) {
                v += Math.min(blazePk(a, 'dmgcd', 'perkDmgCdMax'),
                    Math.floor(blazeFlatDmg(a) / BLAZE.perkDmgCdPer) * blazePk(a, 'dmgcd', 'perkDmgCdAdd'));
            }
            return Math.min(1, v);
        }
        function blazeCd(a, v) { return v * (1 - blazeCdr(a)); }

        // 普攻冷却：默认完全不吃冷却缩减，只有拿了「贯通」才分到一半。
        function blazeAtkCd(a, base) {
            let cut = 0;
            if (a.perkAtkCdr) cut = Math.min(blazePk(a, 'atkcdr', 'perkAtkCdrMax'), blazeCdr(a) * blazePk(a, 'atkcdr', 'perkAtkCdrShare'));
            return base * (1 - Math.min(0.8, cut));
        }

        // src 是不是站在 tgt 的背后（tgt 朝向和「tgt→src」方向夹角大于 90°）
        function blazeIsBehind(src, tgt) {
            let f = blazeDirOf(tgt);
            let dx = src.p.x - tgt.p.x, dz = src.p.z - tgt.p.z;
            let d = Math.hypot(dx, dz);
            if (d < 0.01) return false;
            return ((dx / d) * f.x + (dz / d) * f.z) < 0;
        }

        // 移速：疾行卡加成
        function blazeSpeed(a) {
            let m = 1 + (a.perkSpeed || 0);
            // 位移猫盾专属数值卡：刚位移完那两秒跑得更快
            if (a.shiftSpeedT > 0) m += (a.perkShiftSpeed || 0);
            // 位移被动：一上场就永久 +10%，再往后每 20 秒永久 +5%（封顶 +100%）——
            // 原来是「充满才快 15%」，充能大部分时间是 0，位移猫盾反而比谁都慢。
            if (a.key === 'shift') m += BLAZE.shiftBaseSpeed + (a.shiftPerm || 0);
            if (a.slowT > 0) m *= (1 - (a.slowAmt || BLAZE.debuffSlow));   // 减速：强度跟着来源走
            return BLAZE.speed * Math.max(0.2, m) * DAILY_MOD.speedMul * bondSpeedMul();
        }

        // 充能满了没有 —— 位移猫盾的两个技能都看这个
        function blazeShiftReady(a) { return (a.charge || 0) >= 1; }

        // 跑动攒充能。位移本身产生的移动不算，不然放完技能立刻又满了；
        // 瞬移那一下距离很大，也靠这个上限挡掉。
        function blazeChargeTick(a, dt) {
            if (a.key !== 'shift') return;
            let dx = a.p.x - (a.lastCx === undefined ? a.p.x : a.lastCx);
            let dz = a.p.z - (a.lastCz === undefined ? a.p.z : a.lastCz);
            a.lastCx = a.p.x; a.lastCz = a.p.z;
            if (a.dash || !a.alive || blaze.phase !== 'live') return;
            let step = Math.hypot(dx, dz);
            if (step > blazeSpeed(a) * dt * 1.6) return;   // 瞬移 / 传送门，不算跑动
            a.charge = Math.min(1, (a.charge || 0) + step / BLAZE.shiftChargeDist);
        }

        // 移速永久成长：活着就计时，每凑够一段就加一层，死亡期间不计时但也不清零
        function blazeShiftPassiveTick(a, dt) {
            if (a.key !== 'shift' || !a.alive || blaze.phase !== 'live') return;
            if ((a.shiftPerm || 0) >= BLAZE.shiftPassiveCap) return;
            a.shiftPassiveT = (a.shiftPassiveT || 0) + dt;
            if (a.shiftPassiveT >= BLAZE.shiftPassiveEvery) {
                a.shiftPassiveT -= BLAZE.shiftPassiveEvery;
                a.shiftPerm = Math.min(BLAZE.shiftPassiveCap, (a.shiftPerm || 0) + BLAZE.shiftPassiveStep);
            }
        }

        function blazeCanAct(a) {
            return a && a.alive && blaze.phase === 'live' && a.stunT <= 0 && !a.silenced;
        }

        // 隐身的人不能被「锁定」——单体技能一律跳过，但范围技能照样打得到
        function blazeTargetable(o) { return o.alive && !(o.invisT > 0); }

        // 面前最近的那一个敌人。单体技能全走这个 —— 除了几个范围技能。
        function blazeAimed(a, range) {
            let dir = blazeDirOf(a), hit = null;
            blazeEnemies(a).forEach(function (e) {
                if (!blazeCanEngage(a, e) || !blazeTargetable(e)) return;
                let dx = e.p.x - a.p.x, dz = e.p.z - a.p.z;
                let d = Math.hypot(dx, dz);
                if (d > range || d < 0.01) return;
                if ((dx / d) * dir.x + (dz / d) * dir.z < 0.4) return;
                if (!hit || d < hit.d) hit = { e: e, d: d };
            });
            return hit ? hit.e : null;
        }

        // 放技能 / 普攻会立刻现身
        function blazeBreakInvis(a) {
            if (a.invisT > 0) {
                a.invisT = 0; a.invisGrace = 0.4;
                // 拿了爆发强化卡的话，现身后还有一段时间不能用爆发
                if (a.perkBurstMul > 1) a.burstLock = BLAZE.perkBurstLock;
                blazeNetEv({ ev: 'invis', i: a.idx, t: 0 });
            }
        }

        // 普攻（空格）：伤害一律等于攻击力。弓是一箭，其他人是近身挥砍。
        function blazeBasicAttack(a) {
            if (!blazeCanAct(a) || a.atkCd > 0) return;
            blazeBreakInvis(a);
            if (a.key === 'bow') { blazeBowShot(a); return; }
            a.atkCd = blazeAtkCd(a, BLAZE.atkCd);
            let dir = blazeDirOf(a);
            let hit = null;
            blazeEnemies(a).forEach(function (e) {
                // 注意这里不看 blazeTargetable：隐身的人锁不上，但普攻是靠站位和朝向
                // 判定的，预判得准照样能砍中。
                if (!blazeCanEngage(a, e)) return;
                let dx = e.p.x - a.p.x, dz = e.p.z - a.p.z;
                let d = Math.hypot(dx, dz);
                if (d > BLAZE.atkRange || d < 0.01) return;
                if ((dx / d) * dir.x + (dz / d) * dir.z < 0.55) return;
                if (!hit || d < hit.d) hit = { e: e, d: d };
            });
            blazeSwing(a, BLAZE_CHARS[a.key].color);
            // 面前的箱子也一起挨这一下
            blazeFfaHitChests(a, a.p.x + dir.x * 8, a.p.z + dir.z * 8, BLAZE.ffaChestHitR, BLAZE.atk);
            if (hit) {
                blazeDamage(a, hit.e, BLAZE.atk, false, 'atk');
                // 控制被动：普攻命中也算一层，让下一次眩晕更长
                if (a.key === 'control') a.stunGrow = Math.min(BLAZE.ctrlStunGrowMax, (a.stunGrow || 0) + 1);
            }
        }

        // 弓的普攻：真的是一箭，会被墙挡住 —— 出膛前先做视线检查，
        // 挡住了就干脆不放（免得箭卡在墙里凭空消失，看着像 bug）。
        function blazeBowShot(a) {
            let range = blazeBowShotRange(a);
            let hit = blazeNearest(a, blazeEnemies(a).filter(function (e) {
                return blazeCanEngage(a, e) && blazeTargetable(e) &&
                    Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z) <= range &&
                    blazeClear(a.p.x, a.p.z, e.p.x, e.p.z, a.floor);
            }));
            a.atkCd = blazeAtkCd(a, BLAZE.bowShotCd);
            if (!blazeMine(a)) return;
            if (hit) {
                blazeSpawnMissile(a, hit.t, { dmg: BLAZE.atk, speed: BLAZE.bowShotSpeed, color: 0x9ccc65, kind: 'atk' });
                return;
            }
            // 附近没人也照样往正前方射一箭 —— 空放看着才像在开枪，
            // 而且飞出去的箭撞到人一样算伤害。
            blazeSpawnArrow(a, { dmg: BLAZE.atk, speed: BLAZE.bowShotSpeed, color: 0x9ccc65, kind: 'atk', range: range });
        }

        // 普攻射程会随命中数变长，5 秒不中就掉光
        function blazeBowIdleTick(a, dt) {
            if (a.key !== 'bow') return;
            a.bowIdleT += dt;
            if (a.bowIdleT > BLAZE.bowIdleReset && a.bowStacks > 0) a.bowStacks = 0;
        }
        function blazeBowStackMax(a) { return BLAZE.bowStackMax + (a.perkStackBonus || 0); }

        // 打中了（普攻箭或者穿墙狙都算）就攒一层，每层 +1 身位普攻射程
        function blazeBowGainRange(a) {
            if (!a || a.key !== 'bow') return;
            a.bowIdleT = 0;
            a.bowStacks = Math.min(blazeBowStackMax(a), a.bowStacks + 1);
        }
        // 被动现在加的是普攻射程
        function blazeBowShotRange(a) {
            return BLAZE.bowShotRange + (a.bowStacks || 0) * BLAZE.bowRangeStep;
        }
        // 穿墙狙射程固定，不再跟着被动涨
        function blazeBowMissileRange(a) { return BLAZE.bowMissileRange; }

        // 弓的 1 技能：无视墙体的穿墙狙，锁定最近的敌人，射程带被动加成
        function blazeBowMissile(a) {
            if (a.skillCd > 0) return;
            let range = blazeBowMissileRange(a);
            let hit = blazeNearest(a, blazeEnemies(a).filter(function (e) {
                return blazeCanEngage(a, e) && blazeTargetable(e) && Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z) <= range;
            }));
            if (!hit) return;                      // 没目标就不放，冷却也不走
            a.skillCd = blazeCd(a, BLAZE.bowMissileCd / blazeAtkSpeed(a));
            if (blazeMine(a)) blazeSpawnMissile(a, hit.t, { dmg: BLAZE.bowMissileDmg, speed: BLAZE.bowMissileSpeed, color: 0x66bb6a, kind: 'snipe' });
        }

        function blazeSkill1(a) {
            if (!blazeCanAct(a)) return;
            blazeBreakInvis(a);
            if (a.key === 'heal' && a.skillCd <= 0) { /* 回血自己在下面处理 */ }
            if (a.key === 'bow') { if (a.skillCd <= 0) blazeCastHeal(a); blazeBowMissile(a); return; }
            if (a.key === 'guard') { blazeGuardDash(a); return; }   // 3 段冲刺，自己管冷却
            if (a.skillCd > 0) return;
            blazeCastHeal(a);
            if (a.key === 'sword') {
                a.skillCd = blazeCd(a, BLAZE.swordCd);
                a.dash = { left: BLAZE.swordDash, dir: blazeDirOf(a), done: false, stun: BLAZE.swordStun + (a.perkSwordStun || 0) };
                blazeBurst(a.p.x, a.p.z, 0xef5350, 6, 10, 0.2);
                return;
            }
            if (a.key === 'heal') {
                a.skillCd = blazeCd(a, BLAZE.healCd);
                // 自己永远回 10% 最大生命；附近有队友的话队友也各回 10%
                blazeHeal(a, blazeHealAmount(a, a));
                blazeBurst(a.p.x, a.p.z, 0x42a5f5, 5, 12, 0.4);
                let list = blazeAllies(a).filter(function (o) {
                    return o.floor === a.floor && Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.healRange;
                });
                list.forEach(function (o) {
                    blazeHeal(o, blazeHealAmount(a, o));
                    blazeMarkHeal(o, a);
                    o.buffT = BLAZE.healBuffTime;
                    blazeNetEv({ ev: 'buff', i: o.idx, t: BLAZE.healBuffTime });
                    blazeBurst(o.p.x, o.p.z, 0x42a5f5, 5, 12, 0.4);
                });
                return;
            }
            if (a.key === 'tank') {
                // 1 技能：震地 —— 5 身位内全部眩晕 1 秒并吃一下攻击力的伤害
                a.skillCd = blazeCd(a, BLAZE.tankBlockCd); a.tank2T = BLAZE.tankBlockTime;
                blazeBurst(a.p.x, a.p.z, 0xffcc80, 8, BLAZE.tankStunRange, 0.45);
                blazeNetEv({ ev: 'block', i: a.idx });
                blazeEnemies(a).filter(function (o) {
                    return blazeCanEngage(a, o) && Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.tankStunRange;
                }).forEach(function (o) {
                    blazeDamage(a, o, BLAZE.atk + (a.perkTankSkill > 0 ? o.maxHp * a.perkTankSkill : 0));
                    blazeStun(o, BLAZE.tankStunTime + (a.perkStunBonus || 0), a);
                    blazeBurst(o.p.x, o.p.z, 0xffcc80, 6, 11, 0.25);
                });
                return;
            }
            if (a.key === 'engineer') { blazeEngTurret(a); return; }
            if (a.key === 'mirror') { blazeMirBlock(a); return; }
            if (a.key === 'shift') {
                if (!blazeShiftReady(a)) return;   // 充能没满，技能根本按不出去
                a.charge = 0;
                a.skillCd = BLAZE.shiftCd;
                // pierce: 一路穿过去，每个敌人只吃一次
                a.dash = { left: BLAZE.shiftDashDist, dir: blazeDirOf(a), done: false, pierce: [] };
                a.shiftSpeedT = BLAZE.shiftSpeedTime;
                blazeBurst(a.p.x, a.p.z, 0x26a69a, 6, 12, 0.25);
                return;
            }
            if (a.key === 'control') {
                let e = blazeAimed(a, BLAZE.ctrlHookRange);
                if (!e) return;                    // 钩空了就不放，冷却也不走
                a.skillCd = blazeCd(a, BLAZE.ctrlHookCd);
                blazeDamage(a, e, BLAZE.ctrlHookDmg, false, 'hook');
                blazeBeam(a, e, 0x26c6da);
                blazeBurst(e.p.x, e.p.z, 0x26c6da, 6, 11, 0.25);
                // 拖拽期间对方放不出技能，撞到自己身上再定身 1 秒
                // 复活保护期间钩不动人 —— 伤害照冒，但拖不走也封不住
                if (!(e.invulT > 0)) {
                    e.hooked = { by: a, t: 0 };
                    e.silenced = true;
                    blazeMarkDebuff(e, a);
                    blazeNetEv({ ev: 'hook', i: e.idx, by: a.idx });
                }
                return;
            }
            if (a.key === 'mage') {
                // 激光：沿正前方一条直线，贯穿所有挡在路上的敌人
                let dir = blazeDirOf(a);
                let width = BLAZE.mageLaserWidth + (a.perkLaserWidth || 0);
                let list = blazeEnemies(a).filter(function (o) {
                    if (!blazeCanEngage(a, o)) return false;
                    let dx = o.p.x - a.p.x, dz = o.p.z - a.p.z;
                    let along = dx * dir.x + dz * dir.z;                 // 沿射线走了多远
                    if (along < 0 || along > BLAZE.mageLaserRange) return false;
                    let side = Math.abs(dx * dir.z - dz * dir.x);        // 离射线中轴多远
                    return side <= width;
                });
                if (!list.length) return;                                // 一个都打不到就不放
                a.skillCd = blazeCd(a, BLAZE.mageLaserCd);
                blazeLaserFx(a, dir, BLAZE.mageLaserRange, width);
                list.forEach(function (o) {
                    blazeDamage(a, o, BLAZE.atk * BLAZE.mageLaserMul, false, 'laser');
                    blazeBurst(o.p.x, o.p.z, 0x7e57c2, 6, 12, 0.25);
                });
                return;
            }
            if (a.key === 'assassin') {
                a.skillCd = blazeCd(a, BLAZE.assassinInvisCd);
                a.invisT = BLAZE.assassinInvisTime;
                a.invisAtk = 0; a.invisGrace = 0;
                if (a.perkBurstMul > 1) a.burstLock = Math.max(a.burstLock, BLAZE.assassinInvisTime + BLAZE.perkBurstLock);
                blazeBurst(a.p.x, a.p.z, 0x78909c, 5, 13, 0.3);
                blazeNetEv({ ev: 'invis', i: a.idx, t: a.invisT });
                return;
            }
        }

        // ── 保命猫盾 1 技能：3 段冲刺 ──
        // 点一次走一段，每段之间只有 5 秒窗口；窗口内没接上就把剩下的段数作废、进冷却。
        // 撞到人 15 伤，不管撞没撞到都回 10 血。
        function blazeGuardDash(a) {
            if (a.dashCharges > 0) {
                a.dashCharges--;
                a.dashWindow = BLAZE.guardDashWindow;
                a.dash = { left: BLAZE.guardDashDist + a.perkDashBonus, dir: blazeDirOf(a), done: false, guard: true };
                blazeCastHeal(a);
                blazeHeal(a, blazeHealAmount(a, a));
                blazeBurst(a.p.x, a.p.z, 0xab47bc, 5, 11, 0.25);
                if (a.dashCharges <= 0) { a.dashWindow = 0; a.skillCd = blazeCd(a, BLAZE.guardDashCd + 0); }
                return;
            }
            if (a.skillCd > 0) return;
            // 冷却好了：开一轮新的 3 段
            a.dashCharges = BLAZE.guardDashCharges - 1;
            a.dashWindow = BLAZE.guardDashWindow;
            a.dash = { left: BLAZE.guardDashDist + a.perkDashBonus, dir: blazeDirOf(a), done: false, guard: true };
            blazeCastHeal(a);
            blazeHeal(a, blazeHealAmount(a, a));
            blazeBurst(a.p.x, a.p.z, 0xab47bc, 5, 11, 0.25);
        }

        // 段与段之间的 5 秒窗口：超时就把没用完的段作废，直接进冷却
        function blazeGuardWindowTick(a, dt) {
            if (a.key !== 'guard' || a.dashWindow <= 0) return;
            a.dashWindow -= dt;
            if (a.dashWindow <= 0) {
                a.dashWindow = 0;
                if (a.dashCharges > 0) { a.dashCharges = 0; a.skillCd = blazeCd(a, BLAZE.guardDashCd); }
            }
        }

        // 每 0.25 秒记一次位置和血量，回溯要用
        function blazeSnapTick(a, dt) {
            if (a.key !== 'guard') return;
            a.snapT = (a.snapT || 0) + dt;
            if (a.snapT < BLAZE.guardSnapEvery) return;
            a.snapT = 0;
            a.snaps.push({ x: a.p.x, z: a.p.z, floor: a.floor, hp: a.hp, at: blaze.clock });
            let cut = blaze.clock - BLAZE.guardRewindBack - 1;
            while (a.snaps.length > 1 && a.snaps[0].at < cut) a.snaps.shift();
        }

        // 钩锁：把被钩的人一路拖到钩子主人身上，到了就定身 1 秒
        function blazeHookTick(a, dt) {
            if (!a.hooked) return;
            let by = a.hooked.by;
            if (!by || !by.alive || !a.alive) { a.hooked = null; a.silenced = false; return; }
            a.hooked.t += dt;
            let dx = by.p.x - a.p.x, dz = by.p.z - a.p.z;
            let d = Math.hypot(dx, dz);
            if (d < 12 || a.hooked.t > 3) {
                if (d < 12) blazeStun(a, BLAZE.ctrlHookStun + (by.perkStunBonus || 0), by);
                a.hooked = null; a.silenced = false;
                return;
            }
            a.floor = by.floor;
            blazeStep(a, (dx / d) * BLAZE.ctrlHookPull * dt, (dz / d) * BLAZE.ctrlHookPull * dt);
        }

        function blazeSkill2(a) {
            if (!blazeCanAct(a)) return;
            if (a.skill2Cd > 0) return;
            blazeCastHeal(a);
            if (a.key === 'bow') {
                a.skill2Cd = blazeCd(a, BLAZE.bow2Cd); a.bow2T = BLAZE.bow2Time;
                blazeNetEv({ ev: 'bow2', i: a.idx });
                blazeBurst(a.p.x, a.p.z, 0x66bb6a, 5, 11, 0.3);
                return;
            }
            if (a.key === 'sword') {
                let e = blazeAimed(a, BLAZE.hitRange);
                if (!e) return;                    // 击晕纯打人，没人就不放
                a.skill2Cd = blazeCd(a, BLAZE.sword2Cd);
                blazeSwing(a, 0xff8a80);
                blazeDamage(a, e, BLAZE.sword2Dmg);
                if (a.perkSwordExec > 0) {
                    let extra = e.maxHp * a.perkSwordExec;
                    blazeDamage(a, e, extra);
                    blazeHeal(a, extra);
                }
                blazeStun(e, BLAZE.sword2Stun + (a.perkStunBonus || 0), a);
                blazeBeam(a, e, 0xff8a80);
                blazeBurst(e.p.x, e.p.z, 0xff8a80, 6, 11, 0.25);
                return;
            }
            if (a.key === 'tank') {
                // 2 技能现在是护盾（跟 1 技能换过来了）
                a.skill2Cd = blazeCd(a, BLAZE.tankShieldCd);
                blazeGiveShield(a);
                blazeNetEv({ ev: 'shield', i: a.idx });
                blazeBurst(a.p.x, a.p.z, 0xffa726, 5, 13, 0.3);
                return;
            }
            if (a.key === 'heal') {
                a.skill2Cd = blazeCd(a, BLAZE.heal2Cd);
                let list = blazeEnemies(a).filter(function (o) {
                    return blazeCanEngage(a, o) && Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.heal2Range;
                });
                list.forEach(function (o) { blazeDamage(a, o, BLAZE.heal2Dmg, false, 'drain'); blazeBeam(a, o, 0x80d8ff); blazeBurst(o.p.x, o.p.z, 0x80d8ff, 6, 11, 0.25); });
                // 自愈部分不管有没有打到人都生效
                blazeHeal(a, blazeHealAmount(a, a));
                blazeBurst(a.p.x, a.p.z, 0x42a5f5, 5, 12, 0.3);
                return;
            }
            if (a.key === 'engineer') { blazeEngWall(a); return; }
            if (a.key === 'mirror') { blazeMirSwap(a); return; }
            if (a.key === 'shift') {
                if (!blazeShiftReady(a)) return;
                // 闪到最近敌人背后。附近一个人都没有就不放，充能也不扣。
                let e = blazeNearest(a, blazeEnemies(a).filter(function (o) {
                    return blazeCanEngage(a, o) && blazeTargetable(o) &&
                        Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.shiftLeapRange;
                }));
                if (!e) return;
                a.charge = 0;
                a.skill2Cd = BLAZE.shiftCd;
                let f = blazeDirOf(e.t);
                let bx = e.t.p.x - f.x * BLAZE.shiftLeapBack;
                let bz = e.t.p.z - f.z * BLAZE.shiftLeapBack;
                blazeBurst(a.p.x, a.p.z, 0x26a69a, 6, 12, 0.25);
                if (!blazeBlocked(bx, bz, a.floor)) { a.p.x = bx; a.p.z = bz; }
                a.floor = e.t.floor;
                a.shiftSpeedT = BLAZE.shiftSpeedTime;
                blazeDamage(a, e.t, BLAZE.shiftLeapDmg);
                blazeBurst(e.t.p.x, e.t.p.z, 0x26a69a, 6, 12, 0.3);
                return;
            }
            if (a.key === 'guard') {
                // 回溯：位置和血量都退回 5 秒前，并且立刻刷新 1 技能
                a.skill2Cd = blazeCd(a, BLAZE.guardRewindCd);
                let want = blaze.clock - BLAZE.guardRewindBack;
                let snap = null;
                for (let i = 0; i < a.snaps.length; i++) { if (a.snaps[i].at <= want) snap = a.snaps[i]; }
                if (!snap) snap = a.snaps[0];
                if (snap) {
                    blazeBurst(a.p.x, a.p.z, 0xab47bc, 6, 13, 0.35);
                    a.p.set(snap.x, 0, snap.z); a.floor = snap.floor;
                    a.hp = Math.min(a.maxHp, snap.hp);
                    a.path = null;
                    blazeBurst(a.p.x, a.p.z, 0xab47bc, 6, 13, 0.35);
                }
                a.skillCd = 0; a.dashCharges = 0; a.dashWindow = 0;   // 刷新 1 技能
                blazeNetEv({ ev: 'rewind', i: a.idx, x: Math.round(a.p.x), z: Math.round(a.p.z), floor: a.floor, hp: Math.round(a.hp) });
                return;
            }
            if (a.key === 'control') {
                let list = blazeEnemies(a).filter(function (o) {
                    return blazeCanEngage(a, o) && Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.ctrlStunRange;
                });
                if (!list.length) return;          // 范围内一个人都没有就不放
                a.skill2Cd = blazeCd(a, BLAZE.ctrlStunCd);
                blazeBurst(a.p.x, a.p.z, 0x26c6da, 8, BLAZE.ctrlStunRange, 0.45);
                list.forEach(function (o) {
                    blazeDamage(a, o, BLAZE.ctrlStunDmg);
                    blazeStun(o, BLAZE.ctrlStunTime + (a.perkStunBonus || 0), a);
                    blazeBurst(o.p.x, o.p.z, 0x26c6da, 6, 11, 0.25);
                });
                return;
            }
            if (a.key === 'mage') {
                // 瞬移：往正前方挪 4 身位，撞墙就停在墙前（一小段一小段试）
                a.skill2Cd = blazeCd(a, BLAZE.mageBlinkCd);
                let dir = blazeDirOf(a);
                let want = BLAZE.mageBlinkDist + (a.perkBlinkDist || 0);
                blazeBurst(a.p.x, a.p.z, 0x7e57c2, 6, 13, 0.3);
                let step = 4, moved = 0;
                while (moved < want) {
                    let d = Math.min(step, want - moved);
                    let nx = a.p.x + dir.x * d, nz = a.p.z + dir.z * d;
                    if (blazeBlocked(nx, nz, a.floor)) break;
                    a.p.x = nx; a.p.z = nz; moved += d;
                }
                a.path = null;
                blazeBurst(a.p.x, a.p.z, 0x7e57c2, 6, 13, 0.3);
                return;
            }
            if (a.key === 'assassin') {
                if (a.burstLock > 0) return;   // 隐身中 / 刚现身，爆发被锁着
                let dir = blazeDirOf(a);
                let list = blazeEnemies(a).filter(function (o) {
                    if (!blazeCanEngage(a, o)) return false;
                    let dx = o.p.x - a.p.x, dz = o.p.z - a.p.z, d = Math.hypot(dx, dz);
                    if (d > BLAZE.assassinBurstRange || d < 0.01) return false;
                    return (dx / d) * dir.x + (dz / d) * dir.z >= 0.35;
                });
                if (!list.length) return;          // 面前没人就不放
                a.skill2Cd = blazeCd(a, BLAZE.assassinBurstCd);
                blazeSwing(a, 0x5c6bc0);
                list.forEach(function (o) {
                    blazeDamage(a, o, BLAZE.atk * BLAZE.assassinBurstMul * a.perkBurstMul);
                    blazeBurst(o.p.x, o.p.z, 0x5c6bc0, 7, 13, 0.3);
                });
                return;
            }
        }

        // 技能音效：11 个角色 22 条技能分支各自判"放没放出去"太琐碎，干脆包一层——
        // 放之前记一下冷却/连突次数/护盾/格挡这几个"技能真的生效了"才会变的字段，
        // 放完了比一下，只要有一个变了就说明真打出去了（放空/冷却没到直接 return
        // 的分支不会碰这些字段，不会误触发），不用挨个分支手动加声音。
        function blazeSkillFired(a, snap) {
            return a.skillCd > snap.cd || a.skill2Cd > snap.cd2 || a.dash !== snap.dash ||
                a.dashCharges !== snap.dc || a.shield !== snap.shield || a.blockT !== snap.blockT;
        }
        let blazeSkill1Raw = blazeSkill1;
        blazeSkill1 = function (a) {
            let snap = { cd: a.skillCd, cd2: a.skill2Cd, dash: a.dash, dc: a.dashCharges, shield: a.shield, blockT: a.blockT };
            blazeSkill1Raw(a);
            if (blazeSkillFired(a, snap)) sfxZap(1);
        };
        let blazeSkill2Raw = blazeSkill2;
        blazeSkill2 = function (a) {
            let snap = { cd: a.skillCd, cd2: a.skill2Cd, dash: a.dash, dc: a.dashCharges, shield: a.shield, blockT: a.blockT };
            blazeSkill2Raw(a);
            if (blazeSkillFired(a, snap)) sfxZap(2);
        };

        // 攻速影响的是普攻的冷却，弓每次普攻打完就用这个刷新
        // bowStacks 现在管的是穿墙狙的射程，不再管攻速了——攻速只看疾射和加成
        function blazeAtkSpeed(a) {
            return 1 + (a.bow2T > 0 ? BLAZE.bow2As : 0) + (a.perkAsBonus || 0);
        }

        function blazeBeam(a, t, col) {
            let g = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(a.p.x, BLAZE.eye - 2, a.p.z),
                new THREE.Vector3(t.p.x, BLAZE.eye - 2, t.p.z)
            ]);
            let ln = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col || 0xaed581 }));
            scene.add(ln);
            blaze.fx.push({ o: ln, t: 0.14 });
        }

        // 打在谁身上就在谁脚下炸一个圈：从小圈胀大到大圈，同时淡出。
        // life 秒后自动收掉，不需要另外管理。
        // 伤害飘字：在目标头顶冒一个数字往上飘。
        // 暴击用金色、字明显更大，不然根本感觉不出来暴没暴。
        function blazeDamageText(tgt, amount, crit, immune) {
            if (!blaze || !tgt || amount <= 0) return;
            // 远处别人互殴不用冒字 —— 看不见，还白烧一张贴图
            if (tgt !== blaze.me) {
                let dx = tgt.p.x - camera.position.x, dz = tgt.p.z - camera.position.z;
                if (dx * dx + dz * dz > 200 * 200) return;
            }
            let cv = document.createElement('canvas');
            cv.width = 256; cv.height = 128;
            let g = cv.getContext('2d');
            g.font = 'bold ' + (crit ? 92 : 62) + 'px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineWidth = 8; g.strokeStyle = '#000';
            let txt = immune ? '免疫' : String(Math.round(amount));
            if (immune) g.font = 'bold 56px sans-serif';
            g.strokeText(txt, 128, 64);
            g.fillStyle = immune ? '#80deea' : (crit ? '#ffd54f' : '#ffffff');
            g.fillText(txt, 128, 64);
            let mat = new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false
            });
            let sp = new THREE.Sprite(mat);
            sp.renderOrder = 950;
            let sc = crit ? 11 : 7;
            sp.scale.set(sc * 2, sc, 1);
            sp.position.set(
                tgt.p.x + (Math.random() - 0.5) * 6,
                tgt.floor * BLAZE.floorH + BLAZE_BAR.y + 4,
                tgt.p.z + (Math.random() - 0.5) * 6
            );
            scene.add(sp);
            blaze.fx.push({ o: sp, t: 0.9, life: 0.9, mat: mat, rise: 26 });
        }

        function blazeBurst(x, z, color, r0, r1, life) {
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85 });
            let m = new THREE.Mesh(new THREE.RingGeometry(r0 * 0.7, r0, 20), mat);
            m.rotation.x = -Math.PI / 2; m.position.set(x, 1.2, z);
            scene.add(m);
            blaze.fx.push({ o: m, t: life, life: life, mat: mat, r0: r0, r1: r1 });
        }

        // 打击火花：沿着「攻击者 → 被打的人」这个方向溅出去几颗，带重力往下落。
        // 暴击更多更大更金，打在无敌的人身上是青色的（弹开的感觉）。
        function blazeHitFx(src, tgt, crit, immune) {
            if (!blaze) return;
            // 远处别人互殴不用生成粒子
            let dxc = tgt.p.x - camera.position.x, dzc = tgt.p.z - camera.position.z;
            if (dxc * dxc + dzc * dzc > 260 * 260) return;
            // 葬场：火花能穿墙，但也只穿 8 身位
            if (blaze.tomb && blazeGlowFade(tgt.p.x, tgt.p.z) <= 0) return;
            let dx = tgt.p.x - src.p.x, dz = tgt.p.z - src.p.z;
            let d = Math.hypot(dx, dz) || 1;
            let ux = dx / d, uz = dz / d;
            let col = immune ? 0x80deea : (crit ? 0xffd54f : 0xffe0b2);
            let n = crit ? 9 : 5;
            let y0 = tgt.floor * BLAZE.floorH + 7;
            for (let i = 0; i < n; i++) {
                // depthTest 关掉：隔着墙也看得见火花，知道那边正在打起来
                let mat = new THREE.MeshBasicMaterial({
                    color: col, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
                });
                let sz = (crit ? 1.5 : 1.1) * (0.7 + Math.random() * 0.6);
                let m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
                m.renderOrder = 940;
                m.position.set(tgt.p.x + (Math.random() - 0.5) * 3, y0 + (Math.random() - 0.5) * 5,
                    tgt.p.z + (Math.random() - 0.5) * 3);
                scene.add(m);
                // 主体朝受击方向飞，再撒一点横向散射
                let spread = (Math.random() - 0.5) * 1.4;
                let sp = (crit ? 58 : 38) * (0.6 + Math.random() * 0.8);
                blaze.fx.push({
                    o: m, t: 0.42, life: 0.42, mat: mat,
                    vx: (ux + -uz * spread) * sp, vy: 26 + Math.random() * 26, vz: (uz + ux * spread) * sp,
                    grav: 150
                });
            }
        }

        // 拍平后要让「局部 +Y」指向 dir（长条类：PlaneGeometry 的长边在 Y 上）
        function blazeFlatYawY(dir) { return Math.atan2(-dir.x, -dir.z); }
        // 拍平后要让「局部 +X」指向 dir（扇形类：RingGeometry 的弧心在 +X 上）
        function blazeFlatYawX(dir) { return Math.atan2(-dir.z, dir.x); }

        // 激光：沿朝向铺一条发亮的长条，很快淡掉
        function blazeLaserFx(a, dir, len, width) {
            let mat = new THREE.MeshBasicMaterial({ color: 0xb39ddb, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.PlaneGeometry(width * 2, len), mat);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = blazeFlatYawY(dir);
            m.position.set(a.p.x + dir.x * len / 2, a.floor * BLAZE.floorH + 2, a.p.z + dir.z * len / 2);
            scene.add(m);
            blaze.fx.push({ o: m, t: 0.3, life: 0.3, mat: mat });
        }

        // 挥砍：攻击者面前劈出一道扇形，跟着淡出
        function blazeSwing(a, color) {
            a.atkAnimT = 0.22;       // 顺手触发挥武器的动画
            let dir = blazeDirOf(a);
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.RingGeometry(4, 11, 10, 1, -0.7, 1.4), mat);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = blazeFlatYawX(dir);
            m.position.set(a.p.x, 3, a.p.z);
            scene.add(m);
            blaze.fx.push({ o: m, t: 0.16, life: 0.16, mat: mat });
        }

        // 一颗贴地飞行、锁定目标的导弹。ownerMine 由调用方保证 —— 只有自己算的
        // 攻击者才会在本机生成真弹体，远端只看得到命中同步过来的血量变化。
        // opt: { dmg, speed, color } —— 普通箭和穿墙狙共用同一套飞行/命中逻辑，
        // 差别只在数值和颜色（要不要穿墙这件事在发射前就已经判断过了）
        // 无目标的直线箭：朝着当前朝向飞，飞满射程或者撞墙就没了，
        // 路上碰到敌人照常结算伤害。
        function blazeSpawnArrow(a, opt) {
            opt = opt || {};
            let col = opt.color || 0x9ccc65;
            let mat = new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.35) });
            let m = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.2, 6), mat);
            let y = a.floor * BLAZE.floorH + 8;
            m.position.set(a.p.x, y, a.p.z);
            let dir = blazeDirOf(a);
            m.rotation.y = Math.atan2(dir.x, dir.z);
            scene.add(m);
            blaze.projectiles.push({
                mesh: m, src: a, target: null, dir: dir, floor: a.floor,
                left: opt.range || BLAZE.bowShotRange,
                dmg: opt.dmg || BLAZE.atk, speed: opt.speed || BLAZE.bowShotSpeed,
                kind: opt.kind, color: col
            });
        }

        function blazeSpawnMissile(a, target, opt) {
            opt = opt || {};
            let col = opt.color || 0x66bb6a;
            let mat = new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.35) });
            let m = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.2, 6), mat);
            let fromY = a.floor * BLAZE.floorH + 8, toY = target.floor * BLAZE.floorH + 8;
            m.position.set(a.p.x, fromY, a.p.z);
            scene.add(m);
            let d0 = Math.hypot(target.p.x - a.p.x, target.p.z - a.p.z) || 1;
            blaze.projectiles.push({
                mesh: m, src: a, target: target,
                dmg: opt.dmg || BLAZE.bowMissileDmg, speed: opt.speed || BLAZE.bowMissileSpeed, kind: opt.kind,
                color: col, fromY: fromY, toY: toY, d0: d0
            });
        }

        function blazeMissileTick(dt) {
            if (!blaze.projectiles.length) return;
            blaze.projectiles = blaze.projectiles.filter(function (q) {
                // 没锁定目标的那种：直着飞，撞到人或者飞完射程就结束
                if (!q.target) {
                    let step = q.speed * dt;
                    q.left -= step;
                    q.mesh.position.x += q.dir.x * step;
                    q.mesh.position.z += q.dir.z * step;
                    if (q.left <= 0 || blazeBlocked(q.mesh.position.x, q.mesh.position.z, q.floor)) {
                        scene.remove(q.mesh); return false;
                    }
                    let hit = null;
                    blazeEnemies(q.src).forEach(function (e) {
                        if (!e.alive || e.floor !== q.floor) return;
                        if (Math.hypot(e.p.x - q.mesh.position.x, e.p.z - q.mesh.position.z) > 6) return;
                        if (!hit) hit = e;
                    });
                    if (hit) {
                        let dmg = blazeDamage(q.src, hit, q.dmg, false, q.kind);
                        if (dmg > 0) blazeBowGainRange(q.src);
                        blazeBurst(hit.p.x, hit.p.z, q.color, 8, 14, 0.22);
                        scene.remove(q.mesh); return false;
                    }
                    blazeFfaHitChests(q.src, q.mesh.position.x, q.mesh.position.z, 8, q.dmg);
                    return true;
                }
                if (!q.target.alive) { scene.remove(q.mesh); return false; }
                let dx = q.target.p.x - q.mesh.position.x, dz = q.target.p.z - q.mesh.position.z;
                let d = Math.hypot(dx, dz);
                if (d < 6) {
                    let dmg = blazeDamage(q.src, q.target, q.dmg, false, q.kind);
                    if (dmg > 0) blazeBowGainRange(q.src);
                    blazeBurst(q.target.p.x, q.target.p.z, q.color, 8, 14, 0.22);
                    scene.remove(q.mesh);
                    return false;
                }
                let step = q.speed * dt;
                q.mesh.position.x += (dx / d) * step; q.mesh.position.z += (dz / d) * step;
                let frac = Math.max(0, Math.min(1, 1 - d / q.d0));
                q.mesh.position.y = q.fromY + (q.toY - q.fromY) * frac;
                q.mesh.rotation.y = Math.atan2(dx, dz);
                return true;
            });
        }

        // 楼梯：走近了直接换层，走一步补齐三层不用绕远路
        function blazeStairTick(a) {
            if (!blazeMine(a) || !a.alive) return;
            for (let i = 0; i < BLAZE_STAIRS.length; i++) {
                let s = BLAZE_STAIRS[i];
                if (s.fA !== a.floor && s.fB !== a.floor) continue;
                if (Math.hypot(s.x * TILE - a.p.x, s.z * TILE - a.p.z) < 14) {
                    a.floor = (s.fA === a.floor) ? s.fB : s.fA;
                    a.path = null;
                    return;
                }
            }
        }

        // 传送门：走近一对里的任意一头，瞬间挪到另一头。落地有个短暂免疫，
        // 不然会在两个盘子之间来回跳。
        function blazeTeleportTick(a, dt) {
            if (a.teleCd > 0) { a.teleCd -= dt; return; }
            if (!blazeMine(a) || !a.alive) return;
            for (let i = 0; i < BLAZE_TELEPORTS.length; i++) {
                let pr = BLAZE_TELEPORTS[i];
                let pads = [pr.a, pr.b];
                for (let j = 0; j < 2; j++) {
                    let pad = pads[j];
                    if (pad.floor !== a.floor) continue;
                    if (Math.hypot(pad.x * TILE - a.p.x, pad.z * TILE - a.p.z) >= 10) continue;
                    let dst = pads[1 - j];
                    a.p.set(dst.x * TILE, 0, dst.z * TILE);
                    a.floor = dst.floor;
                    a.teleCd = BLAZE.teleCd;
                    a.path = null;
                    blazeBurst(a.p.x, a.p.z, pr.color, 5, 12, 0.3);
                    return;
                }
            }
        }

        // ── 毒圈：每秒往里收，站外面一直掉血 ──
        // 圈的起始半径按地图算：正好把整张图套进去还多一点，
        // 不然换地图尺寸的时候开局就有人在圈外。
        function blazePoisonStart() {
            let half = (mSize - 1) * TILE / 2;
            return Math.round(half * 1.45);
        }

        function blazePoisonTick(dt) {
            // 圈一直画着，哪怕还没开始收 —— 以前只有 live 阶段才画，
            // 前一分钟场上完全看不到边界在哪。
            if (blaze.tomb) { if (blaze.ring) blaze.ring.visible = false; return; }
            if (blaze.ring) {
                let cc = (mSize - 1) * TILE / 2;
                let delay0 = blaze.ffa ? BLAZE.ffaPoisonDelay : BLAZE.poisonDelay;
                let armed = blaze.poisonT > delay0;
                blaze.ring.visible = true;
                blaze.ring.material.color.setHex(armed ? 0xba68c8 : 0x4a3a55);
                blaze.ring.material.opacity = armed ? 0.25 : 0.16;
                blaze.ring.scale.set(blaze.poison, 1, blaze.poison);
                blaze.ring.position.set(cc, (blaze.me ? blaze.me.floor : 0) * BLAZE.floorH + BLAZE.ringH / 2, cc);
            }
            if (blaze.phase !== 'live') return;
            blaze.poisonT += dt;
            // 乱斗一局 8 分钟，收得比 2v2 慢一截，前一分钟先不动
            let delay = blaze.ffa ? BLAZE.ffaPoisonDelay : BLAZE.poisonDelay;
            let rate = blaze.ffa ? BLAZE.ffaPoisonRate : BLAZE.poisonRate;
            // 乱斗的圈有下限：以前一路收到 0，最后十几个人全站在同一格上互砍，
            // 什么都看不清。现在收到一个还能走位的场地就停，剩下的交给决赛的命数。
            let floorR = blaze.ffa ? BLAZE.ffaPoisonMin : BLAZE.poisonMin;
            if (blazeIsHost() && blaze.poisonT > delay) {
                blaze.poison = Math.max(floorR, blaze.poison - rate * dt);
            }
            let c = (mSize - 1) * TILE / 2;
            // 圈画成一堵半透明的立墙，站在场地里往外看就知道边在哪。
            // 只缩 x/z，高度不动 —— 以前贴地放一个 Torus，scale 一乘半径，
            // 管子粗细跟着放大几百倍，整片地面被糊成紫色，那就是那个显示 bug。
            blaze.ring.visible = true;
            blaze.ring.scale.set(blaze.poison, 1, blaze.poison);
            blaze.ring.position.set(c, (blaze.me ? blaze.me.floor : 0) * BLAZE.floorH + BLAZE.ringH / 2, c);
            blaze.actors.forEach(function (a) {
                if (!a.alive) return;
                let out = Math.hypot(a.p.x - c, a.p.z - c) > blaze.poison;
                a.inPoison = out;
                // 血量各管各的：只有你自己（和主机管的 AI）扣自己的血，不然会扣四遍
                if (!out) return;
                if (blazeMine(a)) blazeDamage(null, a, BLAZE.poisonDps * dt, true);
            });
        }

        function blazeDashTick(a, dt) {
            if (!a.dash || !blazeMine(a)) return;
            let step = Math.min(a.dash.left, 180 * dt);
            a.dash.left -= step;
            let bx = a.p.x, bz = a.p.z;
            blazeStep(a, a.dash.dir.x * step, a.dash.dir.z * step);
            if (Math.abs(a.p.x - bx) < 0.01 && Math.abs(a.p.z - bz) < 0.01) a.dash.left = 0;   // 撞墙
            if (a.dash.pierce) {
                // 贯影：一路穿过去，同一个人只打一次
                blazeEnemies(a).forEach(function (e) {
                    if (!blazeCanEngage(a, e)) return;
                    if (Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z) > 12) return;
                    if (a.dash.pierce.indexOf(e.idx) >= 0) return;
                    a.dash.pierce.push(e.idx);
                    blazeDamage(a, e, BLAZE.shiftDashDmg);
                    blazeBurst(e.p.x, e.p.z, 0x26a69a, 6, 11, 0.25);
                });
            } else if (a.dash.left > 0 && blazeBodyAt(a, a.p.x + a.dash.dir.x * 4, a.p.z + a.dash.dir.z * 4)) {
                a.dash.left = 0;      // 撞到人就停下，不再从人身上穿过去
            }
            if (a.dash && !a.dash.pierce && !a.dash.done) {
                let hit = blazeNearest(a, blazeEnemies(a).filter(function (e) {
                    return blazeCanEngage(a, e) && Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z) <= 12;
                }));
                if (hit) {
                    a.dash.done = true;   // 单体：只打撞到的第一个
                    if (a.dash.mir) {
                        blazeDamage(a, hit.t, BLAZE.mirDashDmg);
                        blazeBurst(hit.t.p.x, hit.t.p.z, 0x7986cb, 6, 11, 0.25);
                    } else if (a.dash.guard) {
                        // 保命猫盾的闪身：撞到人也有伤害，但不叠剑的层数
                        blazeDamage(a, hit.t, BLAZE.guardDashDmg);
                        blazeBurst(hit.t.p.x, hit.t.p.z, 0xab47bc, 6, 11, 0.25);
                    } else {
                        blazeDamage(a, hit.t, BLAZE.swordDmg + a.swordStacks * BLAZE.swordStep);
                        a.swordStacks = Math.min(BLAZE.swordStackMax, a.swordStacks + 1);
                        if (a.dash.stun) blazeStun(hit.t, a.dash.stun + (a.perkStunBonus || 0), a);
                    }
                }
            }
            if (a.dash.left <= 0) a.dash = null;
        }

        // 跳：只是把人抬起来，不改变任何命中判定 —— 战斗全是平面距离算的，
        // 让跳跃能躲技能等于把十一个角色全部重做一遍。
        function blazeJump(a) {
            if (!a || !a.alive || (a.jy || 0) > 0 || a.stunT > 0 || a.dash) return false;
            a.jvy = BLAZE.jumpV * DAILY_MOD.jumpMul;
            return true;
        }
        function blazeJumpTick(a, dt) {
            if (!a.jy && !a.jvy) return;
            a.jvy = (a.jvy || 0) - BLAZE.gravity * dt;
            a.jy = (a.jy || 0) + a.jvy * dt;
            if (a.jy <= 0) { a.jy = 0; a.jvy = 0; }
        }

        function blazePlayerMove(dt) {
            let a = blaze.me;
            if (!a.alive || blaze.phase !== 'live' || a.dash || a.stunT > 0) { a.mvx = 0; a.mvz = 0; return; }
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let len = Math.hypot(strafe, fwd); if (len > 1) { strafe /= len; fwd /= len; }

            // 轻惯性：起步 0.12 秒到满速，松手 0.15 秒滑停。
            // 有一点重量感，但不至于像开船 —— 走位是这个模式的命根子。
            let wx = 0, wz = 0;
            if (fwd !== 0 || strafe !== 0) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;
                let n = Math.hypot(mx, mz) || 1;
                let sp = blazeSpeed(a);
                wx = mx / n * sp; wz = mz / n * sp;
            }
            let rate = (wx || wz) ? 1 / BLAZE.accel : 1 / BLAZE.brake;
            let k = Math.min(1, rate * dt);
            a.mvx = (a.mvx || 0) + (wx - (a.mvx || 0)) * k;
            a.mvz = (a.mvz || 0) + (wz - (a.mvz || 0)) * k;
            if (Math.abs(a.mvx) < 0.4 && Math.abs(a.mvz) < 0.4) { a.mvx = 0; a.mvz = 0; return; }
            blazeStep(a, a.mvx * dt, a.mvz * dt);
        }

        // 两点之间有没有墙（同一层内）。看得见就直着走，看不见才走寻路。
        function blazeClear(ax, az, bx, bz, floor) {
            let d = Math.hypot(bx - ax, bz - az);
            let n = Math.ceil(d / 5);
            for (let i = 1; i < n; i++) {
                let t = i / n;
                if (blazeBlocked(ax + (bx - ax) * t, az + (bz - az) * t, floor)) return false;
            }
            return true;
        }

        // 朝目标走一步：能直着走就直着走，被掩体挡住就用 BFS 绕（按自己当前楼层的那张图找路）。
        // 路线 0.4 秒重算一次就够了，场地很小。
        function blazeAdvance(a, tx, tz, dt) {
            let sp = blazeSpeed(a) * 0.92 * dt;
            if (blazeClear(a.p.x, a.p.z, tx, tz, a.floor)) {
                a.path = null;
                let d = Math.hypot(tx - a.p.x, tz - a.p.z); if (d < 0.01) return;
                blazeStep(a, ((tx - a.p.x) / d) * sp, ((tz - a.p.z) / d) * sp);
                return;
            }
            a.pathAge = (a.pathAge || 0) - dt;
            if (!a.path || !a.path.length || a.pathAge <= 0 || a.pathFloor !== a.floor) {
                a.path = huntBfsPath(a.floor,
                    { x: Math.floor((a.p.x + TILE / 2) / TILE), z: Math.floor((a.p.z + TILE / 2) / TILE) },
                    { x: Math.floor((tx + TILE / 2) / TILE), z: Math.floor((tz + TILE / 2) / TILE) });
                a.pathAge = 0.4; a.pathFloor = a.floor;
            }
            if (!a.path || !a.path.length) return;
            let wp = a.path[0];
            let dx = wp.x * TILE - a.p.x, dz = wp.z * TILE - a.p.z;
            let d = Math.hypot(dx, dz);
            if (d < 5) { a.path.shift(); return; }
            let bx0 = a.p.x, bz0 = a.p.z;
            blazeStep(a, (dx / d) * sp, (dz / d) * sp);
            if (Math.hypot(a.p.x - bx0, a.p.z - bz0) < sp * 0.2) {
                a.stuckT = (a.stuckT || 0) + dt;
                if (a.stuckT > 0.25) {
                    a.stuckT = 0; a.path = null; a.pathAge = 0;
                    blazeStep(a, (-dz / d) * sp, (dx / d) * sp);   // 横着挪一下脱身
                }
            } else a.stuckT = 0;
        }

        // 楼层里没有能打的目标：找一处能换到「有敌人的方向」的楼梯走过去。
        // AI 不会主动凑竖井偷袭跨层目标 —— 那是留给玩家自己判断的花活。
        // 葬场里 AI 看不见人的时候怎么走
        function blazeTombRoam(a, dt) {
            // 1) 场上有人亮着就往那儿冲 —— 光柱穿雾，全场可见
            let lit = null, ld = BLAZE.tombGlowSight;
            blazeEnemies(a).forEach(function (e) {
                if (!e.alive || e.litT <= 0) return;
                let d = Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z);
                // 刚拿人头的那个人无视距离都看得见，优先冲他
                if ((e.litKill || 0) > 0) { if (!lit || (lit.litKill || 0) <= 0 || d < ld) { ld = d; lit = e; } return; }
                if (lit && (lit.litKill || 0) > 0) return;
                if (d < ld) { ld = d; lit = e; }
            });
            if (lit) { blazeAdvance(a, lit.p.x, lit.p.z, dt); return; }
            // 2) 死亡光柱还亮着的地方，去捡人头/看热闹
            let bc = null, bd = Infinity;   // 死亡光柱全场可见，AI 也一样
            (blaze.beacons || []).forEach(function (b) {
                let d = Math.hypot(b.gx * TILE - a.p.x, b.gz * TILE - a.p.z);
                if (d < bd) { bd = d; bc = b; }
            });
            if (bc) { blazeAdvance(a, bc.gx * TILE, bc.gz * TILE, dt); return; }
            // 3) 最近的钱箱：箱子有穿雾的辉光，谁都看得见，是个公平的集合点
            let ch = null, cd2 = Infinity;
            (blaze.chests || []).forEach(function (c) {
                let d = Math.hypot(c.mesh.position.x - a.p.x, c.mesh.position.z - a.p.z);
                if (d < cd2) { cd2 = d; ch = c; }
            });
            if (ch) { blazeAdvance(a, ch.mesh.position.x, ch.mesh.position.z, dt); return; }
            // 4) 什么都没有就往中间压，逼大家碰面
            let cx = (mSize - 1) * TILE / 2;
            blazeAdvance(a, cx, cx, dt);
        }

        function blazeAiSeekFloor(a, dt) {
            let floors = {};
            blazeEnemies(a).forEach(function (e) { floors[e.floor] = 1; });
            let wantUp = false, wantDown = false;
            Object.keys(floors).forEach(function (f) {
                f = +f;
                if (f > a.floor) wantUp = true;
                if (f < a.floor) wantDown = true;
            });
            if (!wantUp && !wantDown) return;
            let cands = BLAZE_STAIRS.filter(function (s) {
                if (s.fA !== a.floor && s.fB !== a.floor) return false;
                let other = s.fA === a.floor ? s.fB : s.fA;
                return (other > a.floor && wantUp) || (other < a.floor && wantDown);
            });
            if (!cands.length) cands = BLAZE_STAIRS.filter(function (s) { return s.fA === a.floor || s.fB === a.floor; });
            if (!cands.length) return;
            let best = null, bd = Infinity;
            cands.forEach(function (s) {
                let d = Math.hypot(s.x * TILE - a.p.x, s.z * TILE - a.p.z);
                if (d < bd) { bd = d; best = s; }
            });
            blazeAdvance(a, best.x * TILE, best.z * TILE, dt);
        }

        // AI：先保证自己在圈里，再贴到自己的舒适距离上，然后两个技能轮着放
        function blazeAi(a, dt) {
            if (a.isPlayer || a.remote || !blazeMine(a)) return;
            if (!a.alive || a.dash || a.stunT > 0) return;
            let c = (mSize - 1) * TILE / 2;
            let dc = Math.hypot(a.p.x - c, a.p.z - c);
            // 圈快压到脸上了就先往里跑，打架排后面 —— 目标是自己这层真正能站的
            // 安全点，不是几何正中心（那格在二三楼是竖井的洞，走不进去）
            if (dc > blaze.poison - 20) {
                let safe = blazeSafeTile[a.floor] || { x: BLAZE_SHAFT.x, z: BLAZE_SHAFT.z };
                blazeAdvance(a, safe.x * TILE, safe.z * TILE, dt);
            }

            let near = blazeNearest(a, blazeEnemies(a).filter(function (e) {
                if (e.floor !== a.floor || !blazeTargetable(e)) return false;
                // 葬场：AI 和你用同一副眼罩 —— 3 身位以外只看得见亮着的人。
                // 记忆保留一小会儿，不然人一出视野 AI 就当场失忆，转身就走。
                if (blaze.tomb) {
                    let d = Math.hypot(e.p.x - a.p.x, e.p.z - a.p.z);
                    // 亮着的人看得到 8 身位（跟玩家一样），没亮的只能看到 3 身位出头
                    if ((e.litKill || 0) > 0) { a.lastSeen = { e: e, t: blaze.clock }; return true; }
                    let r = e.litT > 0 ? BLAZE.tombGlowSight : BLAZE.tombSight * 1.5;
                    if (d <= r) { a.lastSeen = { e: e, t: blaze.clock }; return true; }
                    return a.lastSeen && a.lastSeen.e === e && blaze.clock - a.lastSeen.t < 3;
                }
                return true;
            }));
            if (!near) {
                if (blaze.tomb) { blazeTombRoam(a, dt); return; }
                blazeAiSeekFloor(a, dt); return;
            }
            let sk = (a.skill === undefined) ? 0.6 : a.skill;
            // 手越生瞄得越飘。朝向直接歪一点，贯穿类和方向类技能会跟着打偏。
            a.yaw = Math.atan2(-(near.t.p.x - a.p.x), -(near.t.p.z - a.p.z)) +
                (1 - sk) * (Math.random() - 0.5) * 0.55;

            // 近战的停靠距离必须让「停下来的位置」落在普攻范围里：
            // 下面只有 d > want+4 才继续靠近，所以 want+4 得小于 atkRange(14)，
            // 否则 AI 会停在 17 左右 —— 刚好够不着，站着不打人。
            let want = a.key === 'bow' ? blazeBowMissileRange(a) * 0.55 :
                (a.key === 'heal' ? BLAZE.heal2Range * 0.75 :
                    (a.key === 'control' ? BLAZE.ctrlStunRange * 0.8 : BLAZE.atkRange - 6));
            // 血少了就掉头跑。跑到能站住了再回来打 —— 中间留一段回差，
            // 不然血量在阈值附近来回抖，AI 会原地反复转身。
            if (a.hp < a.maxHp * BLAZE.aiFleeHp) a.fleeing = true;
            else if (a.hp > a.maxHp * BLAZE.aiFleeBack) a.fleeing = false;

            if (sk < 0.35) a.fleeing = false;   // 太生的 AI 不会撤，血再少也往上冲
            // 圈已经很小了就别跑了，跑也无处可逃，而且一直跑会把局拖死
            if (blaze.poison < BLAZE.poisonNoFlee) a.fleeing = false;
            if (a.fleeing && dc <= blaze.poison - 20) {
                let fx = (near.t.p.x - a.p.x) / near.d, fz = (near.t.p.z - a.p.z) / near.d;
                blazeStep(a, -fx * blazeSpeed(a) * dt, -fz * blazeSpeed(a) * dt);
            } else if (dc <= blaze.poison - 20) {
                if (near.d > want + 4) blazeAdvance(a, near.t.p.x, near.t.p.z, dt);
                else if (near.d < want - 6) {
                    // 后撤故意比追击慢一截（0.55 而不是 1）——不然近战永远追不上
                    // 一直往后走的弓箭手，这就是所谓「被放风筝」。
                    let dx = (near.t.p.x - a.p.x) / near.d, dz = (near.t.p.z - a.p.z) / near.d;
                    blazeStep(a, -dx * blazeSpeed(a) * 0.55 * dt, -dz * blazeSpeed(a) * 0.55 * dt);
                }
            }

            // 找技能机会的间隔：手生的隔很久才想起来放一次
            a.castT = (a.castT || 0) - dt;
            let mayCast = a.castT <= 0;
            if (mayCast) a.castT = 0.15 + (1 - sk) * 1.3;
            if (!mayCast) {
                // 技能这一拍跳过，但普攻照打
                if (a.key === 'bow') {
                    if (near.d <= blazeBowShotRange(a) && blazeClear(a.p.x, a.p.z, near.t.p.x, near.t.p.z, a.floor)) blazeBasicAttack(a);
                } else if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
                return;
            }

            if (a.key === 'bow') {
                if (a.skillCd <= 0 && near.d <= blazeBowMissileRange(a)) blazeSkill1(a);
                else if (near.d <= BLAZE.bowShotRange && blazeClear(a.p.x, a.p.z, near.t.p.x, near.t.p.z, a.floor)) blazeBasicAttack(a);
                if (a.skill2Cd <= 0) blazeSkill2(a);
            } else if (a.key === 'sword') {
                if (a.skillCd <= 0 && near.d < BLAZE.swordDash + 10) blazeSkill1(a);
                else if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
                if (a.skill2Cd <= 0 && near.d <= BLAZE.hitRange) blazeSkill2(a);
            } else if (a.key === 'heal') {
                let hurt = blazeAllies(a).some(function (o) {
                    return o.hp < o.maxHp * 0.7 && Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z) <= BLAZE.healRange;
                });
                if (a.skillCd <= 0 && hurt) blazeSkill1(a);
                if (a.skill2Cd <= 0 && near.d <= BLAZE.heal2Range) blazeSkill2(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'tank') {
                if (a.skillCd <= 0 && near.d <= BLAZE.hitRange) blazeSkill1(a);        // 格挡
                // 盾还在就别急着补，等掉光了再开
                if (a.skill2Cd <= 0 && a.shield <= 0 && a.hp < a.maxHp * 0.75) blazeSkill2(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'guard') {
                // 残血了先回溯保命，其余时候用闪身贴脸 + 顺手回血
                if (a.skill2Cd <= 0 && a.hp < a.maxHp * 0.35) blazeSkill2(a);
                else if (near.d < BLAZE.guardDashDist + 14 && (a.skillCd <= 0 || a.dashCharges > 0)) blazeSkill1(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'control') {
                // 远了钩过来，近了直接震慑
                if (a.skill2Cd <= 0 && near.d <= BLAZE.ctrlStunRange) blazeSkill2(a);
                else if (a.skillCd <= 0 && near.d <= BLAZE.ctrlHookRange) blazeSkill1(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'mage') {
                // 激光射程很长，一好就放；离得远用瞬移拉近；贴上了就普攻
                if (a.skillCd <= 0 && near.d <= BLAZE.mageLaserRange) blazeSkill1(a);
                if (a.skill2Cd <= 0 && near.d > BLAZE.mageBlinkDist) blazeSkill2(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'engineer') {
                // 先铺炮台，贴上了就立墙往脚下炸
                if (a.skillCd <= 0) blazeSkill1(a);
                if (near.d <= BLAZE.engBoomRange) blazeSkill2(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'mirror') {
                // 被贴脸就架格挡，离得远就换位过去
                if (a.skillCd <= 0 && near.d <= BLAZE.atkRange + 6) blazeSkill1(a);
                else if (a.skill2Cd <= 0 && near.d > BLAZE.atkRange && near.d <= BLAZE.mirSwapRange) blazeSkill2(a);
                else if (a.swapWindow > 0) blazeSkill2(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'shift') {
                // 充能满了才有的用：远了贯影冲过去，贴上了跃击绕背
                if (blazeShiftReady(a)) {
                    if (near.d > BLAZE.atkRange && near.d <= BLAZE.shiftDashDist + 10) blazeSkill1(a);
                    else if (near.d <= BLAZE.shiftLeapRange) blazeSkill2(a);
                }
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            } else if (a.key === 'assassin') {
                // 离得远先隐身摸过去，贴脸了再爆发
                if (a.skill2Cd <= 0 && near.d <= BLAZE.assassinBurstRange) blazeSkill2(a);
                else if (a.skillCd <= 0 && a.invisT <= 0 && near.d > BLAZE.atkRange) blazeSkill1(a);
                if (near.d <= BLAZE.atkRange) blazeBasicAttack(a);
            }
        }

        // 从这一层能站人的格子里随机挑一批当出生点，尽量互相离远一点
        function blazeFfaSpawns(n) {
            let free = [];
            for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                let c = maze[0] && maze[0][z] && maze[0][z][x];
                if (c && c.type === 0) free.push({ x: x, z: z });
            }
            let out = [];
            for (let i = 0; i < n; i++) {
                // 随机抽几个候选，取离已有出生点最远的那个
                let best = null, bd = -1;
                for (let t = 0; t < 8 && free.length; t++) {
                    let c = free[Math.floor(Math.random() * free.length)];
                    let d = out.length ? Math.min.apply(null, out.map(function (o) {
                        return Math.hypot(o.x - c.x, o.z - c.z);
                    })) : 999;
                    if (d > bd) { bd = d; best = c; }
                }
                out.push(best || { x: 3, z: 3 });
            }
            return out;
        }

        function blazeFfaRespawnAt(a) {
            // 复活点必须落在毒圈里，不然一出生就在圈外挨毒。
            // 抽几个候选，只留圈内的；真的一个都没有就直接回中心。
            // 葬场没有毒圈，规则换成「离所有活人最远的那个候选点」。
            let c = (mSize - 1) * TILE / 2;
            let lim = Math.max(TILE, blaze.poison * BLAZE.ffaSpawnMargin);
            let sp = null;
            let cand = blazeFfaSpawns(blaze.tomb ? 14 : 10);
            if (blaze.tomb) {
                let best = -1;
                cand.forEach(function (q) {
                    let near = Infinity;
                    blaze.actors.forEach(function (o) {
                        if (o === a || !o.alive) return;
                        near = Math.min(near, Math.hypot(q.x * TILE - o.p.x, q.z * TILE - o.p.z));
                    });
                    if (near > best) { best = near; sp = q; }
                });
            }
            for (let i = 0; !sp && i < cand.length; i++) {
                let q = cand[i];
                if (Math.hypot(q.x * TILE - c, q.z * TILE - c) <= lim) { sp = q; break; }
            }
            if (!sp) sp = blazeSafeTile[0] || { x: Math.floor(mSize / 2), z: Math.floor(mSize / 2) };
            a.p.set(sp.x * TILE, 0, sp.z * TILE);
            a.floor = 0;
            a.hp = a.maxHp = blazeBaseHp(a);
            a.alive = true; a.mesh.visible = true;
            a.shield = 0; a.shieldInit = 0; a.stunT = 0; a.dash = null; a.path = null;
            a.atkCd = 0; a.skillCd = 0; a.skill2Cd = 0; a.invisT = 0; a.silenced = false;
            a.hooked = null; a.charge = 0; a.usedRevive = false; a.usedPanic = false;
            a.debuffBy = {}; a.healedBy = {};
            a.slowT = 0; a.slowAmt = 0; a.woundT = 0; a.weakT = 0; a.lifeT = 0;
            a.invulT = BLAZE.ffaSpawnInvul;      // 落地两秒无敌，别一睁眼就被人秒了
            a.kb = null; a.hurtT = 0; a.litT = 0; a.jy = 0; a.jvy = 0; a.mvx = 0; a.mvz = 0;
            a.stillX = undefined; a.stillZ = undefined; a.stillT = 0; a.litKill = 0;
            a.inPoison = false;
            blazeBurst(a.p.x, a.p.z, 0x80deea, 6, 16, 0.5);
            blazeBurst(a.p.x, a.p.z, 0xffffff, 10, 26, 0.6);
            if (a.isPlayer) camera.position.set(a.p.x, BLAZE.eye, a.p.z);
        }

        // 乱斗每帧：倒计时、复活排队、时间到了结算
        function blazeFfaTick(dt) {
            if (!blaze.ffa || blaze.over || blaze.phase !== 'live') return;
            blaze.ffaLeft -= dt;
            blaze.ffaPickT -= dt;
            if (blaze.ffaPickT <= 0) {
                blaze.ffaPickT += BLAZE.ffaPickEvery;
                // 定期进账，顺便把刷新价打回底价 —— 一轮刷贵了，下一轮重新来
                blaze.ffaRefreshN = 0;
                blaze.actors.forEach(function (a) { blazeFfaEarn(a, BLAZE.ffaMoneyTick, ''); });
                { blazeFlash('进账 +' + BLAZE.ffaMoneyTick); introOnce('blaze.shop', '商店', '乱斗里会慢慢进账，' + kTxt('按 <b>C</b>', '点 <b>商店</b>') + ' 花钱买卡。'); }
                blazeFfaCardToggle(true);   // 有钱了就自己弹出来
            }
            // 决赛：最后两分钟每人发几条命，死光出局。
            // 不然圈收到底之后就是十几个人挤在一格里无限复活对砍，永远分不出胜负。
            if (!blaze.ffaFinal && blaze.ffaLeft <= BLAZE.ffaFinalT) {
                blaze.ffaFinal = true;
                blaze.actors.forEach(function (a) { a.lives = BLAZE.ffaFinalLives; });
                blazeFlash('决赛！每人 ' + BLAZE.ffaFinalLives + ' 条命，死光出局');
                sfxPlay([523, 659, 784], 0.5, 0.07, 'square');
            }
            blaze.actors.forEach(function (a) {
                if (a.alive || a.out) return;
                a.respawnT -= dt;
                if (a.respawnT <= 0) blazeFfaRespawnAt(a);
            });
            if (blaze.ffaLeft <= 0) blazeFfaEnd();
        }

        function blazeFfaScore(a) {
            return a.kills * BLAZE.ffaKill + a.assists * BLAZE.ffaAssist + a.deaths * BLAZE.ffaDeath;
        }

        // 名次 = 活到最后。分数（击杀/助攻/死亡）不再决定名次，只用来评 MVP。
        // 时间到了还有好几个人在场的话，先比剩几条命，实在都一样才拿分数兜底。
        function blazeFfaRank() {
            return blaze.actors.slice().sort(function (x, y) {
                if (!!x.out !== !!y.out) return x.out ? 1 : -1;   // 还没出局的一律排前面
                if (x.out && y.out) return y.outAt - x.outAt;     // 撑得久的名次高
                if ((y.lives || 0) !== (x.lives || 0)) return (y.lives || 0) - (x.lives || 0);
                return blazeFfaScore(y) - blazeFfaScore(x);
            });
        }

        // 全场 MVP：分数最高的那个人（双人局用它决定谁是本场 MVP）
        function blazeFfaMvp() {
            return blaze.actors.slice().sort(function (x, y) {
                let d = blazeFfaScore(y) - blazeFfaScore(x);
                return d || (y.kills - x.kills);
            })[0];
        }

        // 双人局的队伍榜：两个人的分加在一起
        function blazeFfaTeamRank() {
            let by = {};
            blaze.actors.forEach(function (a) {
                if (!by[a.team]) by[a.team] = { team: a.team, score: 0, k: 0, as: 0, d: 0, out: true, outAt: 0, lives: 0 };
                let t = by[a.team];
                t.score += blazeFfaScore(a); t.k += a.kills; t.as += a.assists; t.d += a.deaths;
                t.lives += Math.max(0, a.lives || 0);
                if (!a.out) t.out = false;
                t.outAt = Math.max(t.outAt, a.outAt || 0);
            });
            return Object.keys(by).map(function (k) { return by[k]; })
                .sort(function (x, y) {
                    if (x.out !== y.out) return x.out ? 1 : -1;
                    if (x.out && y.out) return y.outAt - x.outAt;
                    if (y.lives !== x.lives) return y.lives - x.lives;
                    return y.score - x.score;
                });
        }

        function blazeFfaEnd() {
            blaze.over = true;
            if (blaze.ffaDuo) { blazeFfaEndDuo(); return; }
            let list = blazeFfaRank();
            let place = list.indexOf(blaze.me) + 1;
            let gain = coinsSettle('blaze', place <= 3);
            // 结算就报一个名次，别再糊一屏数字
            let txt = '<div style="font-size:34px; font-weight:bold; color:#ff9800;">第 ' + place + ' 名</div>' +
                '<div style="color:#888; margin-top:4px;">共 ' + list.length + ' 人　猫盾币 +' + gain + '</div>';
            showSysModal('乱斗结束', txt, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { blazeExit(); } }]);
        }

        function blazeFfaEndDuo() {
            let list = blazeFfaTeamRank();
            let mine = blaze.me.team;
            let place = list.map(function (t) { return t.team; }).indexOf(mine) + 1;
            let gain = coinsSettle('blaze', place <= 3);
            let mvp = blazeFfaMvp();
            let who = (mvp === blaze.me) ? '你' : (mvp.team === mine ? mvp.name + '（你队友）' : mvp.name);
            let txt = '<div style="font-size:34px; font-weight:bold; color:#ff9800;">队伍第 ' + place + ' 名</div>' +
                '<div style="color:#888; margin-top:4px;">共 ' + list.length + ' 队　猫盾币 +' + gain + '</div>' +
                '<div style="margin-top:10px; padding-top:8px; border-top:1px solid #eee;">' +
                '<b style="color:#ffb300;">MVP</b>　' + who + '　' + blazeFfaScore(mvp) + ' 分' +
                '（' + mvp.kills + '/' + mvp.assists + '/' + mvp.deaths + '）</div>' +
                '<div style="font-size:12px; color:#aaa; margin-top:3px;">你 ' + blazeFfaScore(blaze.me) + ' 分（' +
                blaze.me.kills + '/' + blaze.me.assists + '/' + blaze.me.deaths + '）</div>';
            showSysModal('乱斗结束', txt, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { blazeExit(); } }]);
        }

        function blazeRoundCheck() {
            if (blaze.ffa) return;   // 乱斗没有回合，走 blazeFfaTick
            if (blaze.phase !== 'live' || !blazeIsHost()) return;
            let left = [0, 1].map(function (t) {
                return blaze.actors.filter(function (a) { return a.team === t && a.alive; }).length;
            });
            if (left[0] > 0 && left[1] > 0) return;
            blazeAwardRound(left[0] > 0 ? 0 : 1);
        }

        // 测试用：按 Q 跳过这一局，判给目前赢得少的那一方 —— 这样比分会一直咬着，
        // 能反复看到加成界面，不会两下就打完。
        function blazeSkipRound() {
            if (!blaze || blaze.over || blaze.phase !== 'live') return;
            blazeAwardRound(blaze.score[0] <= blaze.score[1] ? 0 : 1);
        }

        function blazeAwardRound(winner) {
            blaze.score[winner]++;
            let matchOver = blaze.score[winner] >= BLAZE.roundsToWin;
            blaze.phase = matchOver ? 'between' : 'perk';
            blaze.wait = matchOver ? BLAZE.resetDelay : BLAZE.perkPickTime;
            if (!matchOver) {
                blaze.actors.forEach(function (a) { a.pickedPerk = false; a.perkDraw = null; a.perkRerollsLeft = BLAZE.perkRerolls; });
                blazeAutoPickPerks(false);   // AI 立刻定好，只剩你一个人在选
            }
            blazeNetEv({ ev: 'round', w: winner, sc: blaze.score.slice(), perk: !matchOver });
            if (blaze.score[winner] >= BLAZE.roundsToWin) {
                blaze.over = true;
                // 隐藏彩蛋：一整场打完，自己一次都没倒下
                if (blaze.me && !blaze.me.deaths) unlockEgg('blaze_flawless');
                // 循环马上就停了，顶上比分最后刷一次，不然结算弹窗写 10 : 3，头顶还停在 9 : 3
                try { blazeHud(); } catch (e) { }
                if (blaze.raf) cancelAnimationFrame(blaze.raf);
                if (document.pointerLockElement) document.exitPointerLock();
                let win = winner === blaze.me.team;
                rankAdd('blaze', win);
                let gain = coinsSettle('blaze', win);
                showSysModal(win ? '超燃 · 你赢了' : '超燃 · 你输了',
                    '比分 ' + blaze.score[blaze.me.team] + ' : ' + blaze.score[1 - blaze.me.team] +
                    '　　猫盾币 +' + gain + '（共 ' + coinsOf() + '）',
                    [{ label: '返回大厅', color: '#ff5722', onClick: blazeExit }]);
                return;
            }
            blazeFlash((winner === blaze.me.team ? '本局获胜' : '本局失利') +
                '　' + blaze.score[0] + ' : ' + blaze.score[1]);
        }

        // 局间加成：给归本机管的角色随机塞一个。
        // withPlayer=false 时只处理 AI —— AI 不需要思考时间，进选择界面就直接定好，
        // 这样唯一在等的就是你，你一点完马上开下一局。
        function blazeAutoPickPerks(withPlayer) {
            blaze.actors.forEach(function (a) {
                if (a.pickedPerk || !blazeMine(a)) return;
                if (!withPlayer && a.isPlayer) return;
                let opts = a.isPlayer ? blazePerkDraw(a) : blazePerkOptions(a);
                if (!opts.length) { a.pickedPerk = true; return; }
                let pick = opts[Math.floor(Math.random() * opts.length)];
                a.pickedPerk = true;
                if (pick.id === 'lucky') {
                    let rolled = blazeRollLucky(a);
                    blazeTakeLucky(a, rolled);
                    blazeNetEv({ ev: 'perk', i: a.idx, id: 'lucky', r: rolled });
                    return;
                }
                blazeApplyPerk(a, pick.id);
                blazeNetEv({ ev: 'perk', i: a.idx, id: pick.id });
            });
        }

        // 该等的人都选完了没有？（只看这台机器管的角色，远端的人各自会广播过来）
        function blazePerksSettled() {
            return !blaze.actors.some(function (a) { return blazeMine(a) && !a.pickedPerk; });
        }

        function blazePickPerk(id) {
            if (!blaze || blaze.phase !== 'perk' || !blaze.me || blaze.me.pickedPerk) return;
            if (id === 'lucky') {
                let rolled = blazeRollLucky(blaze.me);
                blazeTakeLucky(blaze.me, rolled);
                blaze.me.pickedPerk = true;
                blazeNetEv({ ev: 'perk', i: blaze.me.idx, id: 'lucky', r: rolled });
                if (blazePerksSettled()) blazeStartNextRound();
                // 开局那句「第 N 局」会把这条盖掉，所以稍微延后再弹
                let luckyMsg = '' + blazeLuckyLabel(rolled) + '　效果 ×' + BLAZE.perkLuckyMul;
                setTimeout(function () { blazeFlash(luckyMsg); }, 80);
                return;
            }
            blazeApplyPerk(blaze.me, id);
            blaze.me.pickedPerk = true;
            blazeNetEv({ ev: 'perk', i: blaze.me.idx, id: id });
            // 选完立刻开下一局，不用等倒计时走完
            // 选完立刻开下一局，不用等倒计时走完
            if (blaze.phase === 'perk' && blazePerksSettled()) blazeStartNextRound();
        }

        function blazeStartNextRound() {
            blazeAutoPickPerks(true);
            if (blaze.openingPerk) blaze.openingPerk = false;   // 开局那次不算「进入下一局」
            else blaze.round++;
            blazeResetRound();
        }

        // 每个技能的形状和范围，指示器照着这个画
        function blazeSkillShape(a, slot) {
            let k = a.key;
            if (slot === 0) {
                return { type: 'circle', r: (k === 'bow') ? blazeBowShotRange(a) : BLAZE.atkRange };
            }
            if (slot === 1) {
                if (k === 'bow') return { type: 'circle', r: blazeBowMissileRange(a) };
                if (k === 'sword') return { type: 'line', r: BLAZE.swordDash };
                if (k === 'heal') return { type: 'circle', r: BLAZE.healRange };
                if (k === 'tank') return { type: 'circle', r: BLAZE.tankStunRange };
                if (k === 'guard') return { type: 'line', r: BLAZE.guardDashDist + a.perkDashBonus };
                if (k === 'control') return { type: 'line', r: BLAZE.ctrlHookRange };
                if (k === 'engineer') return { type: 'self' };
                if (k === 'mirror') return { type: 'self' };
                if (k === 'shift') return { type: 'line', len: BLAZE.shiftDashDist, w: 7 };
                if (k === 'assassin') return { type: 'self' };
                if (k === 'mage') return { type: 'line', r: BLAZE.mageLaserRange };
            }
            if (slot === 2) {
                if (k === 'bow') return { type: 'self' };
                if (k === 'sword') return { type: 'cone', r: BLAZE.hitRange };
                if (k === 'heal') return { type: 'circle', r: BLAZE.heal2Range };
                if (k === 'tank') return { type: 'self' };
                if (k === 'guard') return { type: 'self' };
                if (k === 'control') return { type: 'circle', r: BLAZE.ctrlStunRange };
                if (k === 'engineer') return { type: 'line', r: BLAZE.engWallDist };
                if (k === 'mirror') return { type: 'circle', r: BLAZE.mirSwapRange };
                if (k === 'shift') return { type: 'circle', r: BLAZE.shiftLeapRange };
                if (k === 'assassin') return { type: 'cone', r: BLAZE.assassinBurstRange };
                if (k === 'mage') return { type: 'line', r: BLAZE.mageBlinkDist + (a.perkBlinkDist || 0) };
            }
            return { type: 'self' };
        }

        // 按住技能键时画出来的瞄准指示器。松手才真正放技能。
        function blazeAimTick() {
            let me = blaze.me;
            if (!blaze.aimRing) {
                blaze.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 44),
                    new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
                blaze.aimRing.rotation.x = -Math.PI / 2; scene.add(blaze.aimRing);
            }
            if (!blaze.aimCone) {
                blaze.aimCone = new THREE.Mesh(new THREE.RingGeometry(0.12, 1, 24, 1, -0.6, 1.2),
                    new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
                blaze.aimCone.rotation.x = -Math.PI / 2; scene.add(blaze.aimCone);
            }
            if (!blaze.aimLine) {
                blaze.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
                    new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
                blaze.aimLine.rotation.x = -Math.PI / 2; scene.add(blaze.aimLine);
            }
            blaze.aimRing.visible = false; blaze.aimCone.visible = false; blaze.aimLine.visible = false;

            let slot = blaze.aiming;
            if (slot === null || slot === undefined) return;
            if (!me || !me.alive || blaze.phase !== 'live') return;

            let sh = blazeSkillShape(me, slot);
            // 抬到膝盖以上：贴地画的话，人物模型和地面起伏会把它整个挡掉
            let fy = me.floor * BLAZE.floorH + BLAZE.aimY;
            let dir = blazeDirOf(me);

            if (sh.type === 'circle') {
                blaze.aimRing.visible = true;
                blaze.aimRing.scale.set(sh.r, sh.r, 1);
                blaze.aimRing.position.set(me.p.x, fy, me.p.z);
            } else if (sh.type === 'cone') {
                blaze.aimCone.visible = true;
                blaze.aimCone.scale.set(sh.r, sh.r, 1);
                blaze.aimCone.rotation.z = blazeFlatYawX(dir);
                blaze.aimCone.position.set(me.p.x, fy, me.p.z);
            } else if (sh.type === 'line') {
                blaze.aimLine.visible = true;
                blaze.aimLine.scale.set(7, sh.r, 1);
                blaze.aimLine.rotation.z = blazeFlatYawY(dir);
                blaze.aimLine.position.set(me.p.x + dir.x * sh.r / 2, fy, me.p.z + dir.z * sh.r / 2);
            }
        }

        // 按下 = 开始瞄准，松手 = 真正释放。
        // 平板上普攻没有独立按钮，所以右半屏空白处按住也算「瞄准普攻」。
        function blazeAimStart(slot) {
            if (!blaze || blaze.over || !blaze.me) return;
            // 普攻按下就开始连打，松手才停
            if (slot === 0) blaze.atkHold = true;
            blaze.aiming = slot;
        }
        function blazeAimRelease(slot) {
            if (!blaze || blaze.over || !blaze.me) return;
            if (slot === 0) blaze.atkHold = false;
            if (blaze.aiming !== slot) return;
            blaze.aiming = null;
            blazeTapSkill(slot);
        }

        // 回血的 1 技能只在附近真有队友时才亮 —— 没人可治的时候按了也是白按
        function blazeSkillUsable(me, slot) {
            if (me.key === 'shift' && (slot === 1 || slot === 2)) return blazeShiftReady(me);
            if (slot === 1 && me.key === 'heal') {
                return blazeAllies(me).some(function (o) {
                    return o.floor === me.floor && Math.hypot(o.p.x - me.p.x, o.p.z - me.p.z) <= BLAZE.healRange;
                });
            }
            return true;
        }

        // 三个图标：普攻 / 1 技能 / 2 技能。只有图标和冷却数字，说明文字在大厅看。
        // 图标可以直接点，平板不用另外准备一套按钮。
        function blazeSkillBar(me) {
            let bar = document.getElementById('blaze-skillbar'); if (!bar) return;
            let c = BLAZE_CHARS[me.key];
            let slots = [
                { slot: 0, icon: '普攻', cd: me.atkCd },
                { slot: 1, icon: '1技能', cd: me.skillCd },
                { slot: 2, icon: '2技能', cd: me.skill2Cd }
            ];
            // 保命的 1 技能有段数，段数没用完的时候永远是可点的
            if (me.key === 'guard' && me.dashCharges > 0) slots[1].cd = 0;
            // 位移猫盾看的不是冷却而是充能，没满就当作「用不了」
            if (me.key === 'shift') { slots[1].cd = 0; slots[2].cd = 0; }

            let sig = me.key + '|' + slots.map(function (q) {
                return (q.cd > 0 ? 1 : 0) + (blazeSkillUsable(me, q.slot) ? 'y' : 'n');
            }).join(',');
            if (bar._sig !== sig) {
                bar.innerHTML = slots.map(function (q) {
                    let usable = blazeSkillUsable(me, q.slot);
                    let dim = (q.cd > 0 || !usable);
                    return '<div onmousedown="blazeAimStart(' + q.slot + ')" onmouseup="blazeAimRelease(' + q.slot + ')" ' +
                        'ontouchstart="event.preventDefault();blazeAimStart(' + q.slot + ')" ' +
                        'ontouchend="event.preventDefault();blazeAimRelease(' + q.slot + ')" ' +
                        'style="width:62px; height:44px; border-radius:8px; cursor:pointer; ' +
                        'display:flex; align-items:center; justify-content:center; position:relative; ' +
                        'font-size:14px; font-weight:bold; user-select:none; ' +
                        'background:' + (dim ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.16)') + '; ' +
                        'border:2px solid ' + (dim ? 'rgba(255,255,255,.2)' : c.css) + '; ' +
                        'color:' + (dim ? 'rgba(255,255,255,.35)' : '#fff') + ';">' +
                        q.icon + '<span id="blaze-cd-' + q.slot + '" style="position:absolute; bottom:1px; right:3px; font-size:11px; color:#ffd54f;"></span></div>';
                }).join('');
                bar._sig = sig;
            }
            slots.forEach(function (q) {
                let el = document.getElementById('blaze-cd-' + q.slot);
                if (el) el.innerText = q.cd > 0 ? Math.ceil(q.cd) : '';
            });
        }

        // 乱斗的 HUD：左上没有花名册，右上一块计分板，中间是倒计时
        function blazeFfaHud() {
            let me = blaze.me;
            let t = Math.max(0, blaze.ffaLeft);
            document.getElementById('blaze-score').innerText =
                Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2);
            let list = blazeFfaRank();
            let place = list.indexOf(me) + 1;
            if (blaze.ffaDuo) {
                let tr = blazeFfaTeamRank();
                place = tr.map(function (t) { return t.team; }).indexOf(me.team) + 1;
                list = tr;
            }
            // 名次只在你出局之后才有意义（活着的人都还没分出先后），
            // 所以在场的时候报的是「还剩多少人」，出局了才报第几名。
            let live = list.filter(function (o) { return !o.out; }).length;
            let unit = blaze.ffaDuo ? ' 队' : ' 人';
            document.getElementById('blaze-round').innerText =
                (blaze.law ? '立法 · ' : blaze.tomb ? '葬场 · ' : blaze.ffaDuo ? '乱斗双人 · ' : '乱斗 · ') +
                (me.out ? '已出局 · 第 ' + place + ' 名 / ' + list.length + unit
                    : '存活 ' + live + '/' + list.length + unit) + '　' +
                blazeFfaScore(me) + ' 分（' + me.kills + '/' + me.assists + '/' + me.deaths + '）' +
                (!blaze.tomb && blaze.poisonT <= BLAZE.ffaPoisonDelay
                    ? '　毒圈 ' + Math.ceil(BLAZE.ffaPoisonDelay - blaze.poisonT) + 's 后开始收'
                    : '') +
                (blaze.ffaFinal && !me.out ? '　决赛 ❤×' + Math.max(0, me.lives) : '') +
                (!me.out && !me.alive ? '　复活 ' + Math.ceil(Math.max(0, me.respawnT)) + 's' : '') +
                '　钱 ' + blaze.ffaMoney;
            document.getElementById('blaze-roster').innerHTML = '';

            let bd = document.getElementById('blaze-ffa-board');
            if (bd) {
                bd.classList.remove('hidden');
                bd.innerHTML = (blaze.law
                    ? '<div style="color:#ffd54f;">本局规则</div>' +
                    Object.keys(blaze.laws).map(function (k) {
                        let d = blazeLawDef(k);
                        return '<div style="color:' + d.color + '; font-size:10px;">· ' + d.name +
                            '<span style="color:#78909c;">（' + (blaze.lawBy[k] || '') + '）</span></div>';
                    }).join('') + '<div style="height:5px;"></div>'
                    : '') +
                    '<div style="color:#ffd54f;">击杀榜　击杀/助攻/死亡</div>' +
                    '<div style="color:#9fb3c8; font-size:10px; margin-bottom:2px;">名次只看活到最后</div>' +
                    (blaze.ffaDuo
                        ? blazeFfaTeamRank().slice(0, 6).map(function (t, i) {
                            return '<div style="color:' + (t.team === me.team ? '#80d8ff' : '#fff') + ';">' +
                                (i + 1) + '. 第' + (t.team + 1) + '队　' + t.score + '　' +
                                t.k + '/' + t.as + '/' + t.d + '</div>';
                        }).join('')
                        : blazeFfaRank().slice(0, 6).map(function (a, i) {
                            return '<div style="color:' + (a.out ? '#e57373' : a === me ? '#80d8ff' : '#fff') + '; opacity:' + (a.alive ? 1 : 0.45) + ';">' +
                                (i + 1) + '. ' + a.name + (a.out ? '（出局）' : '') + '　' + blazeFfaScore(a) + '　' +
                                a.kills + '/' + a.assists + '/' + a.deaths + '</div>';
                        }).join(''));
            }
            let cb = document.getElementById('blaze-card-btn');
            if (cb) cb.style.display = (gState.control === 'pad') ? 'flex' : 'none';

            document.getElementById('blaze-hpbar').style.width = Math.max(0, (me.hp / me.maxHp) * 100) + '%';
            document.getElementById('blaze-hpbar').style.background = '#2196f3';
            document.getElementById('blaze-hptxt').innerText = Math.round(me.hp) + ' / ' + Math.round(me.maxHp);
            blazeSkillBar(me);

            let perkEl = document.getElementById('blaze-perk');
            if (perkEl) { perkEl.classList.add('hidden'); blaze.perkUIActor = null; }
            blazeFfaCardRender();
            if (blazeStatsOpen) {
                let sEl = document.getElementById('blaze-stats');
                if (sEl) sEl.innerHTML = blazeStatsHtml();
            }
        }

        // 普攻按住不放就一直打：冷却一好立刻再来一下。
        // 键盘空格、平板的「攻」按钮、技能条上的普攻图标都走这一个开关。
        // Shift 跳。空格是普攻，不能占；跳跃纯粹是位移表达，不参与任何命中判定。
        function blazeJumpKeyTick(dt) {
            if (!blaze || blaze.over || !blaze.me) return;
            // 落地前一点按的跳，缓冲住，落地那一帧补上（不然按早了就是白按）
            if (keys['shift'] || touchBtn.jump) {
                blaze.jumpBuf = 0.16;
                keys['shift'] = false; touchBtn.jump = false;
            }
            if (blaze.jumpBuf > 0) {
                blaze.jumpBuf -= (dt || 1 / 60);
                if (blazeJump(blaze.me)) blaze.jumpBuf = 0;
            }
        }

        function blazeAtkHoldTick() {
            if (!blaze || blaze.over || !blaze.me) return;
            if (!blaze.atkHold) return;
            // 选卡面板开着照样能打 —— 面板只是浮在上面的 UI，不是暂停
            blazeBasicAttack(blaze.me);
        }

        function blazeTapSkill(slot) {
            if (!blaze || blaze.over || !blaze.me) return;
            if (slot === 0) blazeBasicAttack(blaze.me);
            else if (slot === 1) blazeSkill1(blaze.me);
            else blazeSkill2(blaze.me);
        }

        let blazeStatsOpen = false;
        function blazeToggleStats() {
            blazeStatsOpen = !blazeStatsOpen;
            let el = document.getElementById('blaze-stats');
            if (el) el.classList.toggle('hidden', !blazeStatsOpen);
        }

        // 面板内容：把这局身上所有生效中的数值摊开给你看，省得靠猜
        function blazeStatsHtml() {
            let a = blaze && blaze.me;
            if (!a) return '';
            let c = BLAZE_CHARS[a.key] || {};
            let pct = function (v) { return Math.round(v * 100) + '%'; };
            let row = function (k, v) {
                return '<div style="display:flex; justify-content:space-between; gap:8px;">' +
                    '<span style="color:#9fb3c8;">' + k + '</span><span>' + v + '</span></div>';
            };
            let head = function (t) {
                return '<div style="margin:8px 0 3px; color:#ffd54f; border-bottom:1px solid rgba(255,255,255,.15);">' + t + '</div>';
            };

            let atk = BLAZE.atk + blazeFlatDmg(a);
            let out = head('角色') +
                row('名字', (c.name || a.key) + '　' + (a.team === blaze.me.team ? '本队' : '')) +
                row('生命', Math.round(a.hp) + ' / ' + Math.round(a.maxHp)) +
                ((a.killStreak || 0) > 0 ? row('当前连杀', a.killStreak) : '') +
                (function () {
                    let sh = shopState();
                    if (!a.isPlayer || !sh.pet) return '';
                    let q = petStage(sh.pet);
                    return row('宠物', q.def.name + ' · ' + q.st.label +
                        '（生命 +' + q.st.hp + ' 伤害 +' + q.st.dmg + '）');
                })() +
                (a.shield > 0 ? row('护盾', Math.round(a.shield)) : '');

            out += head('输出') + row('攻击力', Math.round(atk * 10) / 10);
            let mul = [];
            if (a.perkGlassDmg) mul.push('玻璃大炮 ×' + (1 + a.perkGlassDmg).toFixed(2));
            if (a.perkToughDmg) mul.push('坚韧 ×' + (1 - a.perkToughDmg).toFixed(2));
            if (a.perkSkillDmg) mul.push('专精（只算技能）×' + (1 + a.perkSkillDmg).toFixed(2));
            if (a.perkDmgPct) mul.push('伤害 % ×' + (1 + a.perkDmgPct).toFixed(2));
            if (a.perkOpener && blaze) mul.push('先锋 ×' + (1 + BLAZE.perkOpenerDmg).toFixed(2) + '（这条命前 ' + BLAZE.perkOpenerT + 's 内，已活 ' + Math.round(blazeLifeT(a)) + 's）');
            if (a.perkEndure && blaze) mul.push('持久 +' + Math.floor(blazeAliveT(a) / BLAZE.perkEndurePer) * BLAZE.perkEndureAdd +
                '（累计存活 ' + Math.round(blazeAliveT(a)) + 's，死了也不清零）');
            if (a.perkTriple) mul.push('三连 ×2（下一下是第 ' + ((a.atkSeq || 0) % BLAZE.perkTripleEvery + 1) + ' 下）');
            if (a.perkSurge) mul.push('怒涛 ×1.5' + (a.surgeReady ? '（已就绪）' : '（等一次技能命中）'));
            if (a.perkHpDmg) mul.push('血怒 +' + Math.floor(a.maxHp / BLAZE.perkHpDmgPer) * BLAZE.perkHpDmgAdd);
            if (a.perkRage) mul.push('背水 ×' + (1 + BLAZE.perkRageDmg).toFixed(2) + '（自己血 <' + pct(BLAZE.perkRagePct) + '）');
            if (a.perkExec) mul.push('处决 ×' + (1 + BLAZE.perkExecDmg).toFixed(2) + '（敌血 <' + pct(BLAZE.perkExecPct) + '）');
            if (a.perkFullHp) mul.push('先手 ×' + (1 + BLAZE.perkFullHpDmg).toFixed(2) + '（敌血 >' + pct(BLAZE.perkFullHpAt) + '）');
            if (a.perkBackstab) mul.push('背刺 ×' + (1 + BLAZE.perkBackstab).toFixed(2) + '（从背后）');
            if (a.perkWinDmg) mul.push('胜利伤害 +' + BLAZE.perkWinDmg * (blaze.score[a.team] || 0));
            if (a.buffT > 0) mul.push('受治疗增伤 ×' + BLAZE.healBuff + '（' + a.buffT.toFixed(1) + 's）');
            out += mul.length
                ? mul.map(function (t) { return '<div style="color:#ffab91;">· ' + t + '</div>'; }).join('')
                : '<div style="color:#6b7c8c;">没有额外的伤害加成</div>';

            out += head('暴击') +
                row('暴击率', pct(blazeCritChance(a)) +
                    ((a.critChance || 0) > 1 ? '（超出的 ' + pct(a.critChance - 1) + ' 无效）' : '')) +
                row('暴击倍率', '×' + blazeCritMul(a).toFixed(2)) +
                row('期望增伤', '×' + (1 + blazeCritChance(a) * (blazeCritMul(a) - 1)).toFixed(2)) +
                (a.perkCritHeal ? '<div style="color:#ffab91;">· 嗜血：暴击时 ' + pct(BLAZE.perkCritHealChance) + ' 概率回 ' + pct(BLAZE.perkCritHealPct) + ' 最大生命</div>' : '');

            out += head('生存 / 机动') +
                row('减伤', pct(1 - blazeCut(a))) +
                row('移速', Math.round(blazeSpeed(a))) +
                row('冷却缩减', pct(blazeCdr(a)) +
                    '（数值卡 ' + pct(Math.min(BLAZE.perkCdrStatMax, a.perkCdrStat || 0)) +
                    ' + 功能卡 ' + pct(blazeCdr(a) - Math.min(BLAZE.perkCdrStatMax, a.perkCdrStat || 0)) + '）') +
                row('普攻冷却', blazeAtkCd(a, BLAZE.atkCd).toFixed(2) + 's') +
                (a.perkLifesteal ? row('吸血', pct(a.perkLifesteal)) : '') +
                (a.perkRegen ? row('再生', '脱战 ' + BLAZE.perkRegenDelay + 's 后每秒回 ' + pct(BLAZE.perkRegenPct)) : '') +
                (a.perkTenacity ? row('韧性', '控制时长减半') : '') +
                (a.slowT > 0 ? '<div style="color:#ef9a9a;">· 迟滞：移速 −30%（' + a.slowT.toFixed(1) + 's）</div>' : '') +
                (a.woundT > 0 ? '<div style="color:#ef9a9a;">· 重创：治疗减半（' + a.woundT.toFixed(1) + 's）</div>' : '') +
                (a.weakT > 0 ? '<div style="color:#ef9a9a;">· 破胆：伤害 −25%（' + a.weakT.toFixed(1) + 's）</div>' : '') +
                (a.inPoison ? '<div style="color:#ef9a9a;">· 圈外：持续掉血，治疗减半</div>' : '');

            let ids = Object.keys(a.perkCount || {});
            out += head('已选卡牌（' + ids.reduce(function (n, id) { return n + a.perkCount[id]; }, 0) + '）');
            out += ids.length
                ? ids.map(function (id) {
                    let o = BLAZE_PERKS.filter(function (q) { return q.id === id; })[0];
                    let n = a.perkCount[id];
                    return '<div style="color:#ffd54f;">· ' + (o ? o.label : id) + (n > 1 ? '　×' + n : '') + '</div>';
                }).join('')
                : '<div style="color:#6b7c8c;">还没选过</div>';
            return out;
        }

        function blazeHud() {
            if (blaze.ffa) { blazeFfaHud(); return; }
            document.getElementById('blaze-score').innerText = blaze.score[blaze.me.team] + ' : ' + blaze.score[1 - blaze.me.team];
            document.getElementById('blaze-round').innerText = '第 ' + blaze.round + ' 局 · 先赢 ' + BLAZE.roundsToWin + ' 局';
            document.getElementById('blaze-roster').innerHTML = blaze.actors.map(function (a) {
                let col = a.team === blaze.me.team ? '#81d4fa' : '#ff8a65';
                return '<div style="opacity:' + (a.alive ? 1 : 0.4) + ';"><span style="color:' + col + ';">■</span> ' +
                    a.name + '　' + Math.ceil(a.hp) + (a.alive ? '' : '　倒下') + '</div>';
            }).join('');
            let me = blaze.me;
            document.getElementById('blaze-hpbar').style.width = Math.max(0, (me.hp / me.maxHp) * 100) + '%';
            document.getElementById('blaze-hpbar').style.background = '#2196f3';   // 自己也算队友，统一用蓝
            document.getElementById('blaze-hptxt').innerText = Math.ceil(me.hp) + ' / ' + me.maxHp;
            blazeSkillBar(me);
            let sk = '';
            if (!me.alive) sk = '你已倒下，等这一局结束';
            else if (me.stunT > 0) sk = '被眩晕 ' + me.stunT.toFixed(1) + 's';
            else if (me.silenced) sk = '被钩住了，放不出技能';
            if (me.key === 'sword' && me.alive) sk += '　层数 ' + me.swordStacks + '/' + BLAZE.swordStackMax;
            if (me.key === 'bow' && me.alive) sk += '　射程 ' + Math.round(blazeBowMissileRange(me) / 8) + ' 身位';
            if (me.key === 'guard' && me.dashCharges > 0) sk += '　闪身剩 ' + me.dashCharges + ' 段（' + Math.max(0, me.dashWindow).toFixed(1) + 's）';
            if (me.invulT > 0) sk += '　复活保护 ' + me.invulT.toFixed(1) + 's';
            if (me.key === 'shift') sk += '　充能 ' + Math.round((me.charge || 0) * 100) + '%' + (blazeShiftReady(me) ? '（满）' : '');
            if (me.invisT > 0) sk += '　隐身 ' + me.invisT.toFixed(1) + 's';
            if (me.buffT > 0) sk += '　增伤 ' + me.buffT.toFixed(1) + 's';
            if (me.shield > 0) sk += '　护盾 ' + Math.round(me.shield);
            if (me.tank2T > 0) sk += '　格挡 ' + me.tank2T.toFixed(1) + 's';
            if (me.inPoison) sk += '　圈外掉血';
            document.getElementById('blaze-skill').innerText = sk;

            let perkEl = document.getElementById('blaze-perk');
            if (perkEl) {
                if (blaze.phase === 'perk' && me && !me.pickedPerk) {
                    if (blaze.perkUIActor !== me) {
                        perkEl.innerHTML = '<div style="margin-bottom:8px;">这回合发到的牌　<span id="blaze-perk-count"></span></div>' +
                            blazePerkDraw(me).map(function (o) {
                                return '<button onclick="blazePickPerk(\'' + o.id + '\')" ' +
                                    'class="bz-card ' + (o.kind === 'func' ? 'bz-func' : 'bz-stat') + '" ' +
                                    'style="display:block; width:100%; margin:4px 0; padding:8px 0;">' + o.label + '</button>';
                            }).join('') +
                            ((me.perkRerollsLeft || 0) > 0
                                ? '<button onclick="blazePerkReroll()" style="display:block; width:100%; margin:10px 0 0; padding:8px 0; background:#4a2b57; color:#ffd54f; border:1px solid #ffd54f;">换一批（剩 ' + me.perkRerollsLeft + ' 次）</button>'
                                : '');
                        blaze.perkUIActor = me;
                    }
                    let cd = document.getElementById('blaze-perk-count');
                    if (cd) cd.innerText = BLAZE_TEST_NO_PERK_TIMER ? '测试：不计时' : (Math.max(0, Math.ceil(blaze.wait)) + 's 后自动选');
                    perkEl.classList.remove('hidden');
                } else {
                    perkEl.classList.add('hidden');
                    blaze.perkUIActor = null;
                }
            }
            let c = (mSize - 1) * TILE / 2;
            document.getElementById('blaze-round').innerText =
                '第 ' + blazeRoundNo() + ' 局 · 先赢 ' + BLAZE.roundsToWin + ' 局　' + (me.floor + 1) + '楼　毒圈 ' + Math.round(blaze.poison) +
                '（你 ' + Math.round(Math.hypot(me.p.x - c, me.p.z - c)) + '）';

            if (blazeStatsOpen) {
                let sEl = document.getElementById('blaze-stats');
                if (sEl) sEl.innerHTML = blazeStatsHtml();
            }
        }

        function blazeLoopBody() {
            let now = performance.now();
            let dt = Math.min(0.06, (now - blaze.last) / 1000);
            blaze.last = now;
            blaze.clock += dt;

            if (blaze.phase === 'perk') {
                if (!BLAZE_TEST_NO_PERK_TIMER) blaze.wait -= dt;
                if (blaze.wait <= 0) blazeStartNextRound();   // 超时没选就随机给一个，直接开打
            } else if (blaze.phase === 'between') {
                blaze.wait -= dt;
                if (blaze.wait <= 0) { blaze.round++; blazeResetRound(); }
            }

            blaze.actors.forEach(function (a) {
                if (a.skillCd > 0) a.skillCd -= dt;
                if (a.skill2Cd > 0) a.skill2Cd -= dt;
                if (a.buffT > 0) a.buffT -= dt;
                if (a.bow2T > 0) a.bow2T -= dt;
                if (a.tank2T > 0) a.tank2T -= dt;
                if (a.stunT > 0) a.stunT -= dt;
                if (a.atkCd > 0) a.atkCd -= dt;
                if (a.invisT > 0) {
                    a.invisT -= dt;
                    // 隐身专属数值卡：藏着的时候攻击力一直涨
                    if (a.perkInvisAtk > 0) a.invisAtk += a.perkInvisAtk * dt;
                    if (a.invisT <= 0) a.invisGrace = 0.4;
                } else if (a.invisGrace > 0) {
                    // 现身之后留一点点余韵，让「破隐那一下」吃到加成，然后清零
                    a.invisGrace -= dt;
                    if (a.invisGrace <= 0) a.invisAtk = 0;
                }
                if (a.burstLock > 0) a.burstLock -= dt;
                // 再生：脱战一段时间之后开始自愈
                if (a.perkRegen && a.alive) {
                    a.noHitT += dt;
                    if (a.noHitT > BLAZE.perkRegenDelay) {   // 再生：脱战之后每秒回一口
                        // 一秒攒够了才整块回一次，不是每帧回一丁点
                        a.regenT = (a.regenT || 0) + dt;
                        while (a.regenT >= 1) {
                            a.regenT -= 1;
                            blazeHeal(a, a.maxHp * blazePk(a, 'regen', 'perkRegenPct'));
                            blazeBurst(a.p.x, a.p.z, 0x81c784, 4, 10, 0.3);
                        }
                    } else a.regenT = 0;
                }
                if (a.shiftSpeedT > 0) a.shiftSpeedT -= dt;
                if (a.swapWindow > 0) a.swapWindow -= dt;
                blazeMirBlockTick(a, dt);
                blazeMirEchoTick(a, dt);
                if (a.alive) { a.lifeT = (a.lifeT || 0) + dt; a.aliveT = (a.aliveT || 0) + dt; }
                if (a.invulT > 0) a.invulT -= dt;
                if (a.slowT > 0) { a.slowT -= dt; if (a.slowT <= 0) a.slowAmt = 0; }
                if (a.woundT > 0) a.woundT -= dt;
                if (a.weakT > 0) a.weakT -= dt;
                blazeJumpTick(a, dt);
                blazeChargeTick(a, dt);
                blazeShiftPassiveTick(a, dt);
                blazeBowIdleTick(a, dt);
                blazeShieldTick(a, dt);
                blazeGuardWindowTick(a, dt);
                blazeSnapTick(a, dt);
                blazeHookTick(a, dt);
            });

            if (BLAZE_TEST_NO_CD && blaze.me && blazeMine(blaze.me)) {
                // 只清你自己的冷却。AI 的一律不碰 —— 全清的话对面会无限放大招，
                // 想测什么都测不了。
                let me = blaze.me;
                me.atkCd = 0; me.skillCd = 0; me.skill2Cd = 0;
                if (me.key === 'guard' && me.dashCharges <= 0) {
                    me.dashCharges = BLAZE.guardDashCharges; me.dashWindow = BLAZE.guardDashWindow;
                }
            }

            if (blaze.phase === 'live') {
                blazePlayerMove(dt);
                blaze.actors.forEach(function (a) {
                    blazeAi(a, dt);
                    blazeDashTick(a, dt);
                    blazeKnockTick(a, dt);
                    blazeUnstick(a, dt);
                    blazeStairTick(a);
                    blazeTeleportTick(a, dt);
                });
                blazeSeparate(dt);
                blaze.actors.forEach(function (a) { blazeUnstick(a, 0); });
            }
            blazePoisonTick(dt);
            blazeMissileTick(dt);
            blazeNetTick(dt);
            blazeLerpRemotes(dt);

            // 第三人称：相机挂在自己身后上方，撞墙就把距离收短，免得穿进墙里。
            // 用完整 3D 朝向（含俯仰）算位置——只看 blazeDirOf 那套纯水平朝向的话，
            // 抬头低头时人物会偏出屏幕中心，跟其他模式的镜头不一致。
            (function () {
                let t = blaze.me;
                if (!t.alive) { let ally = blazeAllies(blaze.me)[0]; if (ally) t = ally; }
                let dir = chaseCamDir();
                let baseY = BLAZE.eye + t.floor * BLAZE.floorH + (t.jy || 0);
                let ay = baseY + BLAZE.camUp;
                let back = BLAZE.camBack;
                if (Math.hypot(dir.x, dir.z) > 0.3) {
                    for (let i = 0; i < 6; i++) {
                        let cx = t.p.x - dir.x * back, cz = t.p.z - dir.z * back;
                        if (!blazeBlocked(cx, cz, t.floor)) break;
                        back *= 0.7;
                    }
                }
                camera.position.set(t.p.x - dir.x * back, ay - dir.y * back, t.p.z - dir.z * back);
            })();

            blaze.actors.forEach(function (a) {
                blazeAnimTick(a, dt);
                a.mesh.rotation.y = blazeFacing(a);
                let vis = a.alive;
                // 隐身：敌方完全看不见；自己人还能看到（不然队友配合没法打）
                if (vis && a.invisT > 0 && a.team !== blaze.me.team) vis = false;
                // 葬场：3 身位以外根本渲染不出来。挨打亮起来的人是例外 ——
                // 那正是这个模式让你找到人的方式。
                if (vis && blaze.tomb && a !== blaze.me && a.litT <= 0) {
                    if (Math.hypot(a.p.x - blaze.me.p.x, a.p.z - blaze.me.p.z) > BLAZE.tombSight) vis = false;
                }
                a.mesh.visible = vis;
                if (vis) {
                    let ghost = a.invisT > 0;
                    a.mesh.traverse(function (o) {
                        if (!o.material || !o.material.color) return;
                        if (o.material.transparent !== ghost) { o.material.transparent = ghost; }
                        o.material.opacity = ghost ? 0.35 : 1;
                    });
                }
            });

            blazeBarTick();
            blazePetTick(dt);

            blaze.fx = blaze.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) {
                    scene.remove(f.o);
                    if (f.mat) { if (f.mat.map) f.mat.map.dispose(); f.mat.dispose(); }
                    return false;
                }
                // 存活比例驱动的动画：圈从 r0 胀到 r1，同时淡出
                if (f.life) {
                    let frac = 1 - f.t / f.life;
                    if (f.r0 !== undefined) {
                        let r = f.r0 + (f.r1 - f.r0) * frac;
                        f.o.scale.set(r / f.r0, r / f.r0, 1);
                    }
                    if (f.rise) f.o.position.y += f.rise * dt;
                    if (f.vx !== undefined) {
                        f.o.position.x += f.vx * dt;
                        f.o.position.z += f.vz * dt;
                        f.o.position.y += f.vy * dt;
                        f.vy -= (f.grav || 0) * dt;
                        if (f.o.position.y < 0.6) { f.o.position.y = 0.6; f.vy = 0; f.vx *= 0.5; f.vz *= 0.5; }
                        f.o.rotation.x += dt * 9; f.o.rotation.y += dt * 7;
                    }
                    if (f.mat) f.mat.opacity = (f.rise || f.vx !== undefined ? 1 : 0.85) * (1 - frac * frac);
                }
                return true;
            });

            bgmTick();
            blazeBuildTick(dt);
            blazeAtkHoldTick();
            blazeJumpKeyTick(dt);
            blazeFfaTick(dt);
            blazeTombTick(dt);
            blazeLawTick(dt);
            blazeFfaChestTick(dt);
            blazeFfaAiCards(dt);
            blazeRoundCheck();
            blazeAimTick();
            blazeHud();
            renderer.render(scene, camera);
        }

        function blazeLoop() {
            if (!blaze || blaze.over) return;
            blaze.raf = requestAnimationFrame(blazeLoop);
            try { blazeLoopBody(); }
            catch (e) { nightShowError(e); try { renderer.render(scene, camera); } catch (e2) { } }
        }

        window.addEventListener('keydown', function (e) {
            if (!blaze || blaze.over) return;
            if (e.key === 'm' || e.key === 'M') { bgmToggle(); return; }
            if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) blazeAimStart(0); }
            if (BLAZE_TEST_SKIP_KEY && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); blazeSkipRound(); }
            if (blaze.ffa && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); blazeFfaCardToggle(); }
            if (e.key === 'Escape') blazeExit();
        });

        window.addEventListener('keyup', function (e) {
            if (!blaze || blaze.over) return;
            if (e.code === 'Space') { e.preventDefault(); blazeAimRelease(0); }
        });

