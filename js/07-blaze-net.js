        // ══════════════ 超燃 · 联机 ══════════════
        // 分工：自己的人自己算（位置、技能、自己吃的伤害），主机额外负责 AI、
        // 毒圈和回合切换。伤害算完广播结果，四台机器上血量才一致 ——
        // 不这么做的话每台机器各算各的，同一刀有人扣有人没扣。
        function blazeAnnounceChar() {
            if (!roomList || roomList.length < 2) return;
            bc.postMessage({ type: 'BZ_CHAR', target: '*', sender: gState.id, key: gState.blazeChar });
        }

        function blazeNetEv(m) {
            if (!blaze || !blaze.net) return;
            m.type = 'BZ_EV'; m.target = '*'; m.sender = gState.id;
            bc.postMessage(m);
        }

        function blazeActor(i) { return blaze && blaze.actors[i]; }

        function blazeNetTick(dt) {
            if (!blaze || !blaze.net) return;
            blaze.sendSelf -= dt;
            if (blaze.sendSelf <= 0) {
                blaze.sendSelf = 1 / 15;
                let me = blaze.me;
                bc.postMessage({
                    type: 'BZ_ME', target: '*', sender: gState.id, i: me.idx,
                    x: Math.round(me.p.x), z: Math.round(me.p.z), floor: me.floor,
                    yaw: +blazeFacing(me).toFixed(2), hp: Math.round(me.hp), alive: me.alive
                });
            }
            if (!blazeIsHost()) return;
            blaze.sendWorld -= dt;
            if (blaze.sendWorld > 0) return;
            blaze.sendWorld = 1 / 10;
            let list = blaze.actors.filter(function (a) { return !a.netId; }).map(function (a) {
                return {
                    i: a.idx, x: Math.round(a.p.x), z: Math.round(a.p.z), floor: a.floor,
                    yaw: +a.yaw.toFixed(2), hp: Math.round(a.hp), alive: a.alive
                };
            });
            bc.postMessage({
                type: 'BZ_W', target: '*', sender: gState.id, ai: list,
                po: Math.round(blaze.poison), ph: blaze.phase, rd: blaze.round,
                sc: blaze.score.slice(), wt: +blaze.wait.toFixed(2)
            });
        }

        // 远端的人按收到的坐标平滑过去，不然 15Hz 会一跳一跳
        function blazeLerpRemotes(dt) {
            if (!blaze || !blaze.net) return;
            blaze.actors.forEach(function (a) {
                if (!a.target) return;
                a.p.x += (a.target.x - a.p.x) * Math.min(1, dt * 12);
                a.p.z += (a.target.z - a.p.z) * Math.min(1, dt * 12);
            });
        }

        function blazeOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!netStartAllowed('blaze', m)) return;
            // 真人对局是别人那边先广播成的——本机万一还在自己那套匹配计时里挂着
            // （倒计时没停），不清掉的话它几秒后会自己再触发一次，把刚建好的对局
            // 顶掉，人卡在选技能选一半的画面上动不了。跟惊魂夜收到 START_NIGHT
            // 先 nightCancelMatch() 一样的道理。
            mmCancel();
            if (blaze) { if (blaze.raf) cancelAnimationFrame(blaze.raf); blaze = null; }
            blazeBegin(m.plan, m.host, !!m.ffa);
            if (m.ffa) blaze.ffaDuo = !!m.duo;
        }

        function blazeOnMe(m) {
            if (!blaze || m.sender === gState.id) return;
            let a = blazeActor(m.i);
            if (!a || a.netId !== m.sender) {
                a = blaze.actors.filter(function (o) { return o.netId === m.sender; })[0];
            }
            if (!a) return;
            a.target = { x: m.x, z: m.z };
            a.floor = m.floor;
            a.yaw = m.yaw;
            a.hp = m.hp;
            if (a.alive && !m.alive) { a.alive = false; a.mesh.visible = false; }
            else if (!a.alive && m.alive) { a.alive = true; a.mesh.visible = true; }
        }

        function blazeOnWorld(m) {
            if (!blaze || blazeIsHost()) return;
            (m.ai || []).forEach(function (q) {
                let a = blazeActor(q.i); if (!a || a.netId) return;
                a.target = { x: q.x, z: q.z }; a.floor = q.floor; a.yaw = q.yaw; a.hp = q.hp;
                if (a.alive !== q.alive) { a.alive = q.alive; a.mesh.visible = q.alive; }
            });
            blaze.poison = m.po; blaze.wait = m.wt; blaze.score = m.sc;
            if (blaze.round !== m.rd) { blaze.round = m.rd; blazeResetRound(); blaze.phase = m.ph; }
            blaze.phase = m.ph;
        }

        function blazeOnEv(m) {
            if (!blaze || m.sender === gState.id) return;
            let a = blazeActor(m.i);
            if (m.ev === 'dmg') {
                if (a) {
                    let alive = a.alive;
                    blazeApplyDamage(a, m.amt, !!m.raw);
                    if (!m.raw) blazeDamageText(a, m.amt, !!m.c);
                    if (alive && !a.alive) blazeOnKill(m.s >= 0 ? blazeActor(m.s) : null, a);
                }
            }
            else if (m.ev === 'heal') { if (a) a.hp = Math.min(a.maxHp, a.hp + m.amt); }
            else if (m.ev === 'stun') { if (a) { a.stunT = Math.max(a.stunT, m.t); a.stunMax = a.stunT; a.dash = null; } }
            else if (m.ev === 'buff') { if (a) a.buffT = m.t; }
            else if (m.ev === 'bow2') { if (a) a.bow2T = BLAZE.bow2Time; }
            else if (m.ev === 'block') { if (a) a.tank2T = BLAZE.tankBlockTime; }
            else if (m.ev === 'shield') { if (a) blazeGiveShield(a); }
            else if (m.ev === 'invis') { if (a) a.invisT = m.t; }
            else if (m.ev === 'hook') {
                let by = blazeActor(m.by);
                if (a && by) { a.hooked = { by: by, t: 0 }; a.silenced = true; }
            }
            else if (m.ev === 'chest') { blazeFfaRemoveChest(m.id); }
            else if (m.ev === 'ffaout') { if (a && !a.out) { a.out = true; a.outAt = blaze.clock; a.mesh.visible = false; } }
            else if (m.ev === 'rewind') {
                if (a) { a.p.set(m.x, 0, m.z); a.floor = m.floor; a.hp = m.hp; a.path = null; a.skillCd = 0; }
            }
            else if (m.ev === 'perk') {
                if (a) {
                    if (m.id === 'lucky') blazeTakeLucky(a, m.r);
                    else blazeApplyPerk(a, m.id, m.m || 1);
                    a.pickedPerk = true;
                }
            } else if (m.ev === 'round') {
                blaze.score = m.sc;
                if (m.perk) {
                    blaze.phase = 'perk'; blaze.wait = BLAZE.perkPickTime;
                    blaze.actors.forEach(function (a) { a.pickedPerk = false; a.perkDraw = null; a.perkRerollsLeft = BLAZE.perkRerolls; });
                    blazeAutoPickPerks(false);
                }
                else { blaze.phase = 'between'; blaze.wait = BLAZE.resetDelay; }
                blazeFlash((m.w === blaze.me.team ? '本局获胜' : '本局失利') + '　' + m.sc[0] + ' : ' + m.sc[1]);
                if (m.sc[m.w] >= BLAZE.roundsToWin) {
                    blaze.over = true;
                    if (blaze.raf) cancelAnimationFrame(blaze.raf);
                    if (document.pointerLockElement) document.exitPointerLock();
                    rankAdd('blaze', m.w === blaze.me.team);
                    let gain2 = coinsSettle('blaze', m.w === blaze.me.team);
                    showSysModal(m.w === blaze.me.team ? '超燃 · 你赢了' : '超燃 · 你输了',
                        '比分 ' + blaze.score[blaze.me.team] + ' : ' + blaze.score[1 - blaze.me.team] +
                        '　　猫盾币 +' + gain2 + '（共 ' + coinsOf() + '）',
                        [{ label: '返回大厅', color: '#ff5722', onClick: blazeExit }]);
                }
            }
        }

        let night = null;
        let nightMapReady = false;

        function startNightGame(side, charKey) {
            showModeIntroIfFirstTime('night');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.remove('hidden');
            ensureScene();
            if (gState.control === 'laptop') {
                document.body.onclick = function (e) {
                    if (night && !night.over && !e.target.closest('button')) { safeLockPointer(); }
                };
            }

            if (nightMapReady) nightMapReady = false;
            else { gameSeed = Math.floor(Math.random() * 1000000); buildNightMap(); }

            night = {
                // 这局 AI 有多强：每局在你的隐藏分上下拖一下，不会局局一个样
                aiSkill: aiSkillRoll('night'),
                side: side, t: 0, done: 0, over: false, rateBoosted: false,
                repairing: null, calib: null, nextCalibAt: 0, stun: 0,
                doorTarget: null, escapeProg: 0, rescueTarget: null, rescueProg: 0,
                spectating: false, spectateIdx: 0, action: null, fx: [],
                fish: [], fishEating: 0, fishEaten: 0, fishNextAt: 0, fishSpawned: false, healCd: 0, blockT: 0, blockCd: 0, slamReady: 0,
                blockCharges: SKILL.dogBlockCharges, blockRecharge: SKILL.dogBlockRecharge,
                miCd: 0, meowCd: 0, boostT: 0, healBar: null, charge: null,
                spikes: [], spikeCd: 0, tpCd: 0, tpIndex: 0, tpCast: null, tpBoostUntil: 0, c2Cast: null, c2Mark: null,
                hookCd: 0, hookBoostUntil: 0, hookFx: null, sealCd: 0, throwCd: 0, rushT: 0, order: null, c1Cd: 0, c2Cd: 0,
                spear: null, groundSpear: null, stunRing: null, rangeRing: null, spearRing: null,
                hitBoost: 0, last: performance.now(), raf: null,
                survivors: [], hunter: null
            };

            if (gState.nightSeed) gameSeed = gState.nightSeed;
            nightSpawnActors(side);
            nightResetCamera(side);
            pVel.set(0, 0, 0); onGround = true;
            night.char = charKey || (side === 'hunter' ? 'hunter' : 'cat');
            document.getElementById('night-side').innerText = (side === 'survivor' ? '逃生者 · ' : '追捕 · ') + NIGHT_CHARS[night.char].name;
            if (side === 'survivor') night.survivors[0].charKey = night.char;

            night.friendly = (side === 'survivor') && nightIsFriendly();

            let hunterPool = ['hunter', 'hmi', 'hgou', 'hmeow', 'h3', 'h4'];
            if (side === 'hunter') night.hunterChar = night.char;
            else if (night.friendly && seededRandom() < 0.4) night.hunterChar = EGG_PAIRS[night.char];
            else {
                let pool = night.friendly ? hunterPool.filter(function (k) { return k !== EGG_PAIRS[night.char]; }) : hunterPool;
                night.hunterChar = pool[Math.floor(seededRandom() * pool.length)];
            }

            if (night.hunter && night.hunter.mesh) {
                scene.remove(night.hunter.mesh);
                night.hunter.mesh = nightMakeBody(night.hunterChar, true);
                scene.add(night.hunter.mesh); nightSyncMesh(night.hunter);
                let hc = NIGHT_CHARS[night.hunterChar] || NIGHT_CHARS.hunter;

                let hlb = nightMakeLabel(hc.name, HUNTER_BODY[night.hunterChar] || 0xffd21e, false,
                    night.hunter.isPlayer ? myTitle() : night.hunter.remote ? peerTitleOf(night.hunter.key) : aiRandomTitle());
                hlb.position.y = HUNTER_H + 8; night.hunter.mesh.add(hlb);
            }
            nightRefreshFish();
            nightC2Mark();

            chatLoad(); chatSetMode(0);
            document.getElementById('chat-log').innerHTML = '';
            night.netGame = netOn();
            isPlaying = false;
            bgmStart();
            nightLoop();
        }

        function startNightGameSafe(side, charKey) {
            try { startNightGame(side, charKey); }
            catch (e) { nightShowError(e); }
        }

        function endNightGame(text, fromNet) {
            if (!night || night.over) return;

            if (netOn() && !fromNet) {
                if (!netIsHost()) return;
                netEvent('end', { text: text });
            }
            // 中途回了大厅的人在等这局打完（nightAway）；只剩一个真人时 netOn() 已经是 false、
            // 上面的 end 不会发，所以单独广播一条
            if (night.netGame && !fromNet) bc.postMessage({ type: 'NIGHT_DONE', target: '*', sender: gState.id });
            night.over = true;

            if (!night.friendly && night.side === 'survivor') {
                let me = night.survivors && night.survivors[0];
                nightRecordResult(!!(me && me.escaped));
                rankAdd('night', !!(me && me.escaped));
            } else if (!night.friendly && night.side === 'hunter') {
                let out = (night.survivors || []).filter(function (q) { return q.escaped; }).length;
                rankAdd('night', out <= 1);
            }
            if (!night.quit) {
                let me0 = night.survivors && night.survivors[0];
                let won0 = night.side === 'survivor' ? !!(me0 && me0.escaped)
                    : (night.survivors || []).filter(function (q) { return q.escaped; }).length <= 1;
                coinsSettle('night', won0); text += '<br>' + coinsLine();
            }
            if (night.raf) cancelAnimationFrame(night.raf);
            nightShowAllBodies();
            bgmStop();
            nightDisposeActors();
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('night-danger').style.opacity = 0;
            document.getElementById('night-spectate-bar').style.display = 'none';
            if (document.pointerLockElement) document.exitPointerLock();
            nightFlushEggs(function () {
                showSysModal('本局结束', text, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { night = null; nav('screen-lobby'); selectGameMode('night'); } }]);
            });
        }

        function nightCellOf(pos) { return { x: Math.floor((pos.x + TILE / 2) / TILE), z: Math.floor((pos.z + TILE / 2) / TILE) }; }

        function nightDisposeActors() {
            if (!night) return;

            let dropLabels = function (root) {
                if (!root) return;
                root.traverse(function (o) {
                    if (o.isSprite && o.material) {
                        if (o.material.map) o.material.map.dispose();
                        o.material.dispose();
                    }
                });
                scene.remove(root);
            };
            (night.survivors || []).forEach(function (a) {
                if (a.mesh) { dropLabels(a.mesh); a.mesh = null; }
                if (a.xray) { scene.remove(a.xray); a.xray = null; }
                if (a.shield) { scene.remove(a.shield); a.shield = null; }
            });
            if (night.hunter && night.hunter.mesh) { dropLabels(night.hunter.mesh); night.hunter.mesh = null; }
            (night.fx || []).forEach(function (f) { scene.remove(f.mesh); }); night.fx = [];
            (night.spikes || []).forEach(function (s) { scene.remove(s.mesh); }); night.spikes = [];
            (night.fish || []).forEach(function (f) { if (f.mesh) scene.remove(f.mesh); }); night.fish = [];
            if (night.stunRing) { scene.remove(night.stunRing); night.stunRing = null; }
            if (night.rangeRing) { scene.remove(night.rangeRing); night.rangeRing = null; }
            if (night.spearRing) { scene.remove(night.spearRing); night.spearRing = null; }
            if (night.spear) { scene.remove(night.spear.mesh); night.spear = null; }
            if (night.groundSpear) { scene.remove(night.groundSpear.mesh); night.groundSpear = null; }
            if (night.hookFx) { scene.remove(night.hookFx.head); scene.remove(night.hookFx.rope); night.hookFx = null; }
            if (night.healBar) { scene.remove(night.healBar.bg); scene.remove(night.healBar.fill); night.healBar = null; }
        }

        function nightTintGroup(obj, hex) {
            if (!obj) return;
            if (obj.material) { obj.material.color.setHex(hex); return; }
            (obj.children || []).forEach(function (c) { nightTintGroup(c, hex); });
        }

        function nightSyncMesh(a) {
            if (!a) return;
            let fy = a.gy || 0;
            if (a.mesh) a.mesh.position.set(a.p.x, fy, a.p.z);
            if (a.xray) a.xray.position.set(a.p.x, fy, a.p.z);
        }

        const NIGHT_BODY = { cat: 0x9b59b6, dog: 0xe67e22, mi: 0x16a085, meow: 0x3498db, c1: 0xec407a, c2: 0x26c6da };
        const HUNTER_H = 20, SURV_H = 11;

        const HUNTER_BODY = { hunter: 0xffd21e, hmi: 0x6ec6ff, hgou: 0x8bc34a, hmeow: 0xba68c8, h3: 0xff7043, h4: 0x9e9e9e };
        const HUNTER_HORN = { hunter: 0xa1671b, hmi: 0x1e5f8f, hgou: 0x33691e, hmeow: 0x5e35b1, h3: 0x8c3a1c, h4: 0x4f4f4f };

        function nightMakeBody(charKey, isHunter, faceKey, acc) {
            let g = new THREE.Group();
            let col = isHunter ? (HUNTER_BODY[charKey] || 0xffd21e) : (NIGHT_BODY[charKey] || 0x3498db);
            let h = isHunter ? HUNTER_H : SURV_H;

            let bodyMat = new THREE.MeshLambertMaterial({ color: col });
            if (isHunter) bodyMat.emissive = new THREE.Color(col).multiplyScalar(0.22);
            let body = new THREE.Mesh(new THREE.BoxGeometry(isHunter ? 9 : 6, h, isHunter ? 6 : 4), bodyMat);
            body.position.y = h / 2; g.add(body);

            let hornMat = new THREE.MeshLambertMaterial({
                color: isHunter ? (HUNTER_HORN[charKey] || 0xa1671b) : col, emissive: 0x000000
            });
            if (!isHunter) {
                let hornGeo = new THREE.ConeGeometry(1.6, 3.4, 8);
                [-1, 1].forEach(function (s) {
                    let horn = new THREE.Mesh(hornGeo, hornMat);
                    // 身体半宽 3，角/耳朵半径 1.6，偏移收到 1.2 避免外沿(2.8)超出身体边缘。
                    horn.position.set(s * 1.2, h + 1.5, 0);
                    g.add(horn);
                });
            } else if (charKey === 'hmi') {

                let rod = new THREE.Mesh(new THREE.BoxGeometry(1, 11, 1), hornMat);
                rod.position.set(0, h + 5.5, 0); g.add(rod);
                let ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8),
                    new THREE.MeshLambertMaterial({ color: 0xe8f6ff, emissive: 0x24506b }));
                ball.position.set(0, h + 12, 0); g.add(ball);
            } else if (charKey === 'hgou') {

                [-1, 0, 1].forEach(function (k) {
                    let sp = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.5, 4), hornMat);
                    sp.position.set(k * 3.2, h + 2.6, 0); g.add(sp);
                });
            } else if (charKey === 'hmeow') {

                [-1, 1].forEach(function (k) {
                    let ear = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 3), hornMat);
                    ear.position.set(k * 3.4, h + 2.8, 0);
                    ear.rotation.z = -k * 0.12; g.add(ear);
                });
            } else {

                [-1, 1].forEach(function (k) {
                    let horn = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 4), hornMat);
                    horn.position.set(k * 3, h + 3, 0);
                    horn.rotation.z = -k * 0.45; g.add(horn);
                });
            }

            if (isHunter) {
                let eyeGeo = new THREE.BoxGeometry(1.6, 1.6, 0.4);
                let eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
                [-1, 1].forEach(function (s) {
                    let eye = new THREE.Mesh(eyeGeo, eyeMat);
                    eye.position.set(s * 2.2, h - 3.5, 3.1);
                    g.add(eye);
                });
            } else {
                // 逃生者跟别的模式一样戴商店表情和配饰（身体尺寸跟 raceMakeBody 一样，位置参数照抄）
                addCatFace(g, 8, 2.02, faceKey);
                if (acc) addAccessories(g, 8, 2.02, 12.9, 4.2, acc);
            }

            if (isHunter) {

                let len = charKey === 'hmeow' ? 26 : 16;
                let spear = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, len),
                    new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
                spear.position.set(5.4, h * 0.62, len / 2 - 6); g.add(spear);
                let tip = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 4),
                    new THREE.MeshLambertMaterial({ color: 0xbdbdbd }));
                tip.position.set(5.4, h * 0.62, len - 5); tip.rotation.x = Math.PI / 2; g.add(tip);
            }
            return g;
        }

        // title：称号 key（TITLES），有的话在名字上面多画一个小牌子
        function nightMakeLabel(text, colorHex, through, title) {
            let T = title && TITLES[title], top = T ? 40 : 0;
            let cv = document.createElement('canvas'); cv.width = 320; cv.height = 80 + top;
            let ctx = cv.getContext('2d');
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (T) {
                ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
                let tw = Math.min(300, ctx.measureText(T.name).width + 28);
                ctx.fillStyle = 'rgba(38,50,56,0.9)';
                ctx.fillRect(160 - tw / 2, 8, tw, 34);
                ctx.fillStyle = T.col;
                ctx.fillText(T.name, 160, 26);
            }
            ctx.fillStyle = 'rgba(15,15,20,0.78)';
            ctx.fillRect(0, 12 + top, 320, 56);
            ctx.fillStyle = cssColor(colorHex, '#ffffff');
            ctx.fillRect(0, 12 + top, 320, 5);
            ctx.font = 'bold 38px "Microsoft YaHei", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(dispNameText(text), 160, 42 + top);
            let tex = new THREE.CanvasTexture(cv);
            let sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex, transparent: true, depthTest: !through
            }));
            // 之前是固定世界坐标大小(22x5.5)，两个真人贴脸站在一起的时候，名字牌
            // 完全不会跟着变小，糊满大半个屏幕，看着像个渲染出错的黑色方块——
            // 用 onBeforeRender 按跟镜头的距离动态缩放，远处保持原大小，贴近了收小，
            // 但留个下限（35%）不会完全缩没。
            let ntBaseW = 22, ntBaseH = 22 * cv.height / 320, ntWorldPos = new THREE.Vector3();
            sp.scale.set(ntBaseW, ntBaseH, 1);
            sp.userData.aspect = cv.height / 320;
            sp.userData.label = dispNameText(text);   // 画上去的名字（测试看这个）
            if (T) sp.center.set(0.5, 40 / cv.height);   // 名字还在原来的位置，称号往上长
            sp.onBeforeRender = function (renderer, sc, cam) {
                sp.getWorldPosition(ntWorldPos);
                let d = cam.position.distanceTo(ntWorldPos);
                // 30 格以内才开始缩、下限 35%：大厅广场第三人称镜头下，路过的 AI 离镜头
                // 三四十格时名字牌照样占掉 1/4~1/3 屏宽。改成 100 格起按距离等比缩——
                // 近处屏幕上的大小基本恒定（约 10% 屏宽，字 16px 左右依然看得清），远处跟原来一样。
                let s = Math.min(1, Math.max(0.08, d / 100));
                sp.scale.set(ntBaseW * s, ntBaseH * s, 1);
            };
            if (through) sp.renderOrder = 999;
            return sp;
        }

        function nightMakeXray(charKey) {
            let g = new THREE.Group();
            let col = NIGHT_BODY[charKey] || 0x3498db;
            let mat = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.62 });
            let body = new THREE.Mesh(new THREE.BoxGeometry(7, SURV_H, 5), mat);
            body.position.y = SURV_H / 2; g.add(body);
            [-1.8, 1.8].forEach(function (dx) {
                let ear = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.8, 4), mat);
                ear.position.set(dx, SURV_H + 1.5, 0); g.add(ear);
            });
            g.traverse(function (o) { o.renderOrder = 997; });
            return g;
        }

        function nightSpawnActors(playerSide) {
            let pool = [];
            for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) if (maze[0][z][x].type === 0) pool.push({ x: x, z: z });
            for (let i = pool.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
            let spread = [];

            let keys = netSurvKeys(playerSide);
            let chars = gState.netChars || {};

            let all = ['cat', 'dog', 'meow', 'mi', 'c1', 'c2'];
            let taken = keys.map(function (k) { return chars[k]; }).filter(Boolean);
            if (playerSide === 'survivor' && gState.nightChar) taken.push(gState.nightChar);
            let roster = all.filter(function (k) { return taken.indexOf(k) < 0; });
            if (roster.length < 3) roster = all.slice();

            for (let q = roster.length - 1; q > 0; q--) {
                let w = Math.floor(seededRandom() * (q + 1));
                let tmp = roster[q]; roster[q] = roster[w]; roster[w] = tmp;
            }
            night.survivors = [];
            let aiN = 0;
            for (let i = 0; i < 4; i++) {
                let cell = pickSpread(pool, spread);
                let isPlayer = (playerSide === 'survivor' && i === 0);
                let key = keys[i];
                let remote = !isPlayer && !/^ai\d+$/.test(key);
                let ck = isPlayer ? (gState.nightChar || 'cat')
                    : (chars[key] || roster[(aiN++) % roster.length]);
                let a = {
                    isPlayer: isPlayer, key: key, remote: remote,
                    charKey: ck, p: new THREE.Vector3(cell.x * TILE, 9, cell.z * TILE),
                    hp: 2, downed: false, bleed: 0, onChair: false, chairTime: 0, chairCount: 0,
                    escaped: false, out: false, hitBoost: 0, repairing: null, rescueProg: 0, mesh: null,
                    struggle: 0, struggleAt: 0
                };
                if (!isPlayer) {
                    a.mesh = nightMakeBody(ck, false, remote ? peerFaceOf(key) : aiRandomFace(), remote ? peerAccOf(key) : aiRandomAcc()); scene.add(a.mesh);

                    let ch = NIGHT_CHARS[ck];
                    let lb = nightMakeLabel(remote ? key : ch.name, NIGHT_BODY[ck] || 0x3498db, playerSide === 'survivor', remote ? peerTitleOf(key) : aiRandomTitle());
                    lb.position.y = SURV_H + 8; a.mesh.add(lb);
                    if (playerSide === 'survivor') { a.xray = nightMakeXray(ck); scene.add(a.xray); }
                    nightSyncMesh(a);
                }
                night.survivors.push(a);
            }

            let edgeMargin = Math.ceil(mSize / 16);
            let hunterPool = [];
            for (let m = edgeMargin; m >= 0; m--) {
                hunterPool = pool.filter(function (c) {
                    return c.x >= 1 + m && c.x <= mSize - 2 - m && c.z >= 1 + m && c.z <= mSize - 2 - m;
                });
                if (hunterPool.length > 0) break;
            }
            if (hunterPool.length === 0) hunterPool = pool;
            let hcell = pickSpread(hunterPool, spread);
            let hReal = netIds('hunter')[0] || null;
            night.hunter = {
                isPlayer: playerSide === 'hunter', p: new THREE.Vector3(hcell.x * TILE, 9, hcell.z * TILE),
                key: hReal || 'aiHunter', remote: !!(hReal && hReal !== gState.id),
                recover: 0, spearCd: 0, spearLeft: 0, spearDir: new THREE.Vector3(), carrying: null, mesh: null
            };
            if (!night.hunter.isPlayer) {
                night.hunter.mesh = nightMakeBody('hunter', true);
                scene.add(night.hunter.mesh); nightSyncMesh(night.hunter);
            }

        }

        function nightResetCamera(side) {
            let me = (side === 'hunter') ? night.hunter : night.survivors[0];
            if (me) camera.position.copy(me.p);
            camera.rotation.set(0, seededRandom() * Math.PI * 2, 0);
            camera.updateProjectionMatrix();
        }

        function nightDroppedPalletAt(x, z, gy) {
            let cx = Math.floor((x + TILE / 2) / TILE), cz = Math.floor((z + TILE / 2) / TILE);
            return gState.pallets.find(function (p) {
                if (p.state !== 'down' || p.x !== cx || p.z !== cz) return false;
                if (gy === undefined) return true;
                return Math.abs((p.gy || 0) - gy) < DECK_H / 2;
            }) || null;
        }

        function nightObjSameLevel(o, gy) {
            return Math.abs((o.gy || 0) - (gy || 0)) < DECK_H / 2;
        }

        function nightPalletSameLevel(p, gy) {
            return Math.abs((p.gy || 0) - (gy || 0)) < DECK_H / 2;
        }

        const DECK_H = 24, EYE_H = 9, FALL_SPEED = 110;

        const STAIR_STEPS = 6;
        const STAIR_RISE = DECK_H / STAIR_STEPS;

        const NIGHT_STEP_UP = 7;
        const CRATE_SIDE = (TILE - 4) / 2;
        const CRATE_H = CRATE_SIDE;
        const FLOOR_SLAB = 2;
        let RACE_TEST_CARD = null;     // 不为 null 就每轮强制发这张牌
        let RACE_TEST_NO_CD = false;         // 冲刺和技能都不进冷却
        let RACE_TEST_NO_PICK_TIMER = false; // 选技能不计时，慢慢挑
        let HUNT_TEST_AI_NOLOOT = false;   // AI 队友不去抢箱子，全场的箱子都留给你
        let HUNT_TEST_NOWEIGHT = false;    // 负重不减速
        let HUNT_TEST_MONEY = false;
        let HUNT_TEST_GOD = false;
        let HUNT_TEST_NOMOB = false;
        let NIGHT_DEBUG_CAM = false;
        let NIGHT_NO_CD = false;
        const NIGHT_SKELETON_SEED = 424242;
        function nightCellKey(wx, wz) {
            return Math.floor((wx + TILE / 2) / TILE) + ',' + Math.floor((wz + TILE / 2) / TILE);
        }

        function nightSurface(wx, wz, level) {
            let d = gState.nightDeck; if (!d) return 0;
            let k = nightCellKey(wx, wz);
            if (d.stairs[k] !== undefined) {

                if (level >= 1 && d.covered && d.covered[k]) return DECK_H;
                return d.stairs[k];
            }
            if (level >= 1 && d.cells[k]) return DECK_H;
            return 0;
        }

        function nightLevelAt(wx, wz, level) {
            let d = gState.nightDeck; if (!d) return 0;
            let k = nightCellKey(wx, wz);
            if (d.stairs[k] !== undefined) {
                if (level >= 1 && d.covered && d.covered[k]) return 1;
                return d.stairs[k] >= DECK_H - 1 ? 1 : 0;
            }
            if (d.cells[k]) return level || 0;
            return 0;
        }

        function nightGroundTick(actor, wx, wz, dt) {
            actor.level = nightLevelAt(wx, wz, actor.level || 0);
            let want = nightSurface(wx, wz, actor.level);
            let cur = actor.gy === undefined ? want : actor.gy;
            actor.gy = want > cur ? want : Math.max(want, cur - FALL_SPEED * dt);
            return actor.gy;
        }
        function nightEyeAt(wx, wz) { return EYE_H + nightSurface(wx, wz, 0); }

        function nightFlatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

        function nightCanHit(from, to, range) {
            return nightSameLevel(from, to) && nightFlatDist(from, to) <= range && nightClearShot(from, to);
        }

        function nightSameLevel(from, to) {
            if (from.y === undefined || to.y === undefined) return true;
            return Math.abs(from.y - to.y) < DECK_H / 2;
        }

        function nightClearShot(from, to) {
            if (!nightSameLevel(from, to)) return false;
            let dx = to.x - from.x, dz = to.z - from.z;
            let dist = Math.hypot(dx, dz);
            if (dist < 0.01) return true;
            let steps = Math.ceil(dist / 6);
            for (let i = 1; i < steps; i++) {
                let t = i / steps;
                let px = from.x + dx * t, pz = from.z + dz * t;
                if (checkCol(px, pz, 9, 0)) return false;
                if (nightDroppedPalletAt(px, pz, from.y - EYE_H)) return false;
            }
            return true;
        }

        function nightStairRail(actor, nx, nz) {
            let d = gState.nightDeck; if (!d || !d.stairs) return false;
            if (d.stairs[nightCellKey(actor.p.x, actor.p.z)] === undefined) return false;
            if (d.stairs[nightCellKey(nx, nz)] !== undefined) return false;
            let want = nightSurface(nx, nz, actor.level || 0);
            return Math.abs(want - (actor.gy || 0)) > NIGHT_STEP_UP;
        }

