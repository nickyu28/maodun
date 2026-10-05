        // ══════════════════════════════════════════════════════════
        //  大厅广场：进游戏前的一个可以走来走去的 3D 空间，边上搭了一小段
        //  跑酷，还有几个 AI 路人在晃悠——凑近谁都会弹出「组队」，是真人
        //  好友（同房间里认识的）还能顺手「加好友」。没有服务器存不了全网
        //  在线玩家列表，所以"其他玩家"目前是本地模拟的路人，不是真人。
        // ══════════════════════════════════════════════════════════
        const HUB = {
            plazaHalf: 650, moveSpeed: 44, jumpV: 48, gravity: 140,
            wanderCount: 30, proximityRange: 14
        };
        function hubBuildWorld() {
            let floor = new THREE.Mesh(new THREE.PlaneGeometry(HUB.plazaHalf * 2, HUB.plazaHalf * 2),
                new THREE.MeshLambertMaterial({ color: 0xc8e6c9 }));
            floor.rotation.x = -Math.PI / 2; scene.add(floor); hub.meshes.push(floor);
            // 跑酷：加过一版移动/销毁平台+更窄间隔，试了下太难了，退回原来的静态台阶——
            // 每一步都跳得到，不用死记机关规律。台阶数从 7 块加到 9 块，course 更长一点，
            // 但每一步的宽度/间隔还是原来那套好跳的参数，不是"更长更难"。
            let widths = [12, 11, 10, 9, 8, 7, 7, 6, 6];
            let xOffsets = [0, 13, -9, 15, -13, 11, -6, 10, -7];
            let gapVoid = 7.5, stepRise = 5, baseX = 30, baseZ = -14;
            hub.platforms = [];
            let z = baseZ, prevHalf = 0;
            for (let i = 0; i < widths.length; i++) {
                let half = widths[i] / 2;
                z = (i === 0) ? baseZ : (z - prevHalf - half - gapVoid);
                let x = baseX + xOffsets[i], y = 4 + i * stepRise;
                let isLast = i === widths.length - 1;
                let m = new THREE.Mesh(new THREE.BoxGeometry(widths[i], 2, widths[i]),
                    new THREE.MeshLambertMaterial({ color: isLast ? 0xffd54f : 0x90a4ae }));
                m.position.set(x, y, z); scene.add(m); hub.meshes.push(m);
                hub.platforms.push({ x: x, y: y + 1, z: z, half: half, mesh: m, meshBaseY: y, solid: true });
                prevHalf = half;
            }
            // 场地边缘围一圈矮墙，好认出边界在哪
            function wall(x, z, w, d) {
                let m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), new THREE.MeshLambertMaterial({ color: 0x81c784 }));
                m.position.set(x, 3, z); scene.add(m); hub.meshes.push(m);
            }
            let half = HUB.plazaHalf;
            wall(0, -half, half * 2, 2); wall(0, half, half * 2, 2); wall(-half, 0, 2, half * 2); wall(half, 0, 2, half * 2);

            // 公告板：走近了能直接看更新公告，顺便让广场不那么空——之前除了跑酷/路人
            // 什么装饰都没有，站在原地看四周全是空地。
            let boardCv = document.createElement('canvas'); boardCv.width = 256; boardCv.height = 128;
            let bctx = boardCv.getContext('2d');
            bctx.fillStyle = '#fff8e1'; bctx.fillRect(0, 0, 256, 128);
            bctx.strokeStyle = '#8d6e63'; bctx.lineWidth = 8; bctx.strokeRect(4, 4, 248, 120);
            bctx.fillStyle = '#5d4037'; bctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
            bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.fillText('公告板', 128, 64);
            let boardTex = new THREE.CanvasTexture(boardCv);
            // 放在广场正中间、出生点正前方——一进大厅抬头就能看见，不用到处找。
            // 只用正面（去掉 DoubleSide）：之前背面也贴着同一张贴图，绕到背后看字是镜像反的。
            HUB.board = { x: 0, z: -30 };
            let post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 14, 8), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
            post.position.set(HUB.board.x, 7, HUB.board.z); scene.add(post); hub.meshes.push(post);
            let board = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: boardTex }));
            board.position.set(HUB.board.x, 13, HUB.board.z); scene.add(board); hub.meshes.push(board);

            // 顺手加几个长椅/路灯凑个热闹，纯装饰不参与任何判定
            [[50, 60], [-50, -60], [70, -40]].forEach(function (pos) {
                let bench = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 4), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
                bench.position.set(pos[0], 1, pos[1]); scene.add(bench); hub.meshes.push(bench);
            });
            [[80, 80], [-80, 80], [80, -80], [-80, -80]].forEach(function (pos) {
                let poleMat = new THREE.MeshLambertMaterial({ color: 0x616161 });
                let pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 16, 8), poleMat);
                pole.position.set(pos[0], 8, pos[1]); scene.add(pole); hub.meshes.push(pole);
                let lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfff59d }));
                lamp.position.set(pos[0], 16.5, pos[1]); scene.add(lamp); hub.meshes.push(lamp);
            });
        }
        // 路人名字要像真玩家会取的 ID，不是"路人猫盾A"这种一看就是机器人的占位名；
        // 同时尽量挑生僻/少见的组合，避免正好跟真玩家自己取的昵称撞名。
        const HUB_BOT_NAMES = ['小鱼干', '摸鱼冠军', '深夜猫盾', '打工猫', '半糖去冰', '橘子汽水',
            '一只咸鱼', '桃子罐头', '奶茶不加糖', '晚风', '路过的猫', '装睡大师', '柠檬味的风', '今天也很困',
            '第九颗纽扣', '会漏电的猫', '过期薯片', '拖鞋去哪了', '猫盾守夜人', '芝士味叹气',
            '掉线的云', '第三只手套', '硬币的反面', '发霉的勇气', '倒着走的钟', '半只耳朵',
            '不想改名的猫', '塑料袋在飞', '错位的拼图', '偷懒的齿轮', '融化的雪糕棍', '生锈的闹钟'];
        // 路人颜色池——之前全员统一灰色（0xb0bec5），一群路人挤在一起完全分不清谁是谁，
        // 远处看就是一片灰扑扑的东西。换成从这个色板里随机挑，一眼能看出是好几个人。
        const HUB_WANDER_COLORS = [0xef9a9a, 0x90caf9, 0xa5d6a7, 0xffe082, 0xce93d8, 0xffab91, 0x80cbc4, 0xf48fb1, 0xbcaaa4, 0x9fa8da];
        function hubSpawnWanderers() {
            let pool = HUB_BOT_NAMES.slice();
            for (let i = 0; i < HUB.wanderCount; i++) {
                let idx = Math.floor(Math.random() * pool.length);
                let name = pool.length ? pool.splice(idx, 1)[0] : ('路人' + (i + 1));
                let col = HUB_WANDER_COLORS[Math.floor(Math.random() * HUB_WANDER_COLORS.length)];
                let mesh = raceMakeBody(aiSkinColor(col), 0, true, aiRandomAcc(), aiRandomFace());
                // 真人头顶有名字，路人却没有——一群猫盾凑一起，光看身体颜色根本分不出
                // 谁是真人朋友、谁是凑数的路人，得靠头顶名字才能看清爽。
                let label = nightMakeLabel(name, col, false, aiRandomTitle());
                label.position.y = 13.5; mesh.add(label);
                scene.add(mesh);
                let x = (Math.random() - 0.5) * HUB.plazaHalf, z = (Math.random() - 0.5) * HUB.plazaHalf;
                hub.wanderers.push({
                    name: name, isAI: true, mesh: mesh,
                    p: new THREE.Vector3(x, 0, z), faceDir: { x: 0, z: 1 }, animT: 0,
                    target: null, idleT: Math.random() * 2
                });
            }
        }
        function hubWandererTick(a, dt) {
            if (a.idleT > 0) { a.idleT -= dt; return; }
            if (!a.target || Math.hypot(a.target.x - a.p.x, a.target.z - a.p.z) < 2) {
                a.target = { x: (Math.random() - 0.5) * HUB.plazaHalf, z: (Math.random() - 0.5) * HUB.plazaHalf };
                if (Math.random() < 0.3) { a.idleT = 1 + Math.random() * 2; return; }
            }
            let dx = a.target.x - a.p.x, dz = a.target.z - a.p.z, n = Math.hypot(dx, dz) || 1;
            a.p.x += dx / n * HUB.moveSpeed * 0.5 * dt; a.p.z += dz / n * HUB.moveSpeed * 0.5 * dt;
            a.faceDir = { x: dx / n, z: dz / n };
        }
        function hubGroundYAt(x, z, curY) {
            // curY 是这一帧之前的高度：平台只有在「玩家已经在它表面高度附近或更高」时才
            // 算脚下的地——不然贴着台阶下方走过去，x/z 一进台阶范围就会被直接吸到台阶顶上，
            // 变成不用跳、走两步就瞬移上去。台阶更高的时候只当墙看待，不当地面。
            let best = 0;
            for (let i = 0; i < hub.platforms.length; i++) {
                let p = hub.platforms[i];
                if (p.solid === false) continue;   // 塌掉的销毁平台暂时不算地面，直接踩空
                if (Math.abs(x - p.x) < p.half && Math.abs(z - p.z) < p.half && p.y <= curY + 0.6 && p.y > best) best = p.y;
            }
            return best;
        }
        function hubPlayerMove(dt) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }

            let prevY = hub.p.y;
            // 起跳判定要用「移动前」的脚下位置：不然贴着台阶边缘按跳的时候，
            // 这一帧正好走出台阶范围、地面高度瞬间归零，会被当成已经悬空、跳跃失败——
            // 变成边缘按跳没反应，得往回退一步才跳得动，助跑跳完全跳不起来。
            let curGroundY = hubGroundYAt(hub.p.x, hub.p.z, hub.p.y);
            let onGround = hub.p.y <= curGroundY + 0.5;
            let now = performance.now();
            if (onGround) hub.lastGroundedAt = now;
            if (keys[' '] || touchBtn.jump) hub.lastJumpPressAt = now;
            keys[' '] = false; touchBtn.jump = false;
            // 土狼时间 + 跳跃缓冲：不用卡着刚好落地/离台那一帧按空格才跳得起来——
            // 边缘掉落后 120ms 内、或提前按了跳跃键 150ms 内落地，都算数，手感才不涩。
            let canJump = (now - (hub.lastGroundedAt || -9999) <= 120) && (hub.vy || 0) <= 0;
            let wantsJump = (now - (hub.lastJumpPressAt || -9999)) <= 150;
            if (canJump && wantsJump) {
                hub.vy = HUB.jumpV;
                hub.lastJumpPressAt = -9999; hub.lastGroundedAt = -9999;
            }

            let newX = hub.p.x, newZ = hub.p.z;
            if (fwd || strafe) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe, n = Math.hypot(mx, mz) || 1;
                newX = hub.p.x + mx / n * HUB.moveSpeed * dt; newZ = hub.p.z + mz / n * HUB.moveSpeed * dt;
                hub.faceDir = { x: mx / n, z: mz / n };
            }
            // 台子侧面要当墙挡住，不然朝台子横着走/半空中蹭到侧面会直接穿模过去——
            // 只在人确实比台面矮一截时才挡（不是正要落到台子上那一下，留点余量避免误挡）。
            // pad 得盖过猫盾模型自己的半宽（身体+耳朵大概 3~3.5 个单位），不然挡住的只是
            // 中心点还没碰到边，但耳朵/身体的网格已经先一步露在台子里面，看着照样像穿模。
            // 台子实体厚度是 2（从 p.y-2 到 p.y），之前 1.2 的余量比实体还厚，等于台子
            // 上半截完全没挡——第二块台阶最先撞上这个（往上跳的落点正好卡在那段空当里），
            // 贴着边一走就直接穿过去了。缩到 0.3，落地那一帧还是留得住，实体范围不再重叠。
            // 之前只查"这一帧的目的地"这一个点，横着快速斜穿台子边角的时候，起点和终点
            // 可能都不在台子的判定框里，但中间那段路其实是穿过去的——沿着这段位移多采
            // 几个点一起查，不会再从边角"抄近道"穿过去。
            let blockedBySide = false;
            outer:
            for (let s = 1; s <= 4; s++) {
                let t = s / 4;
                let sx = hub.p.x + (newX - hub.p.x) * t, sz = hub.p.z + (newZ - hub.p.z) * t;
                for (let i = 0; i < hub.platforms.length; i++) {
                    let p = hub.platforms[i], pad = 3.5;
                    if (p.solid === false) continue;   // 塌掉的销毁平台没有实体，不挡人
                    if (Math.abs(sx - p.x) < p.half + pad && Math.abs(sz - p.z) < p.half + pad &&
                        prevY < p.y - 0.2 && prevY > p.y - 7) { blockedBySide = true; break outer; }
                }
            }
            if (!blockedBySide) { hub.p.x = newX; hub.p.z = newZ; }
            let half = HUB.plazaHalf - 2;
            hub.p.x = Math.max(-half, Math.min(half, hub.p.x));
            hub.p.z = Math.max(-half, Math.min(half, hub.p.z));
            hub.vy = (hub.vy || 0) - HUB.gravity * dt;
            hub.p.y += hub.vy * dt;
            // 落地判定要用「这一帧移动前」的高度来筛台子：不然摔得快、一帧就掉穿了整块台子时，
            // 用摔完之后的新高度去筛，会发现台子早就在头顶上方而判定不算地面，直接穿模摔穿过去。
            let groundY = hubGroundYAt(hub.p.x, hub.p.z, prevY);
            if (hub.p.y < groundY) { hub.p.y = groundY; hub.vy = 0; }
            if (hub.p.y < -10) { hub.p.set(0, 0, 0); hub.vy = 0; }   // 掉下去了，回广场中心重来
            hubParkourCheck();
        }
        // 跑酷通关奖励：踩上最后一块（金色）台阶就算通关，一次大厅会话只给一次——
        // 不然贴着最后一块台阶反复上下跳，几秒钟就能刷无限猫盾币。
        function hubParkourCheck() {
            let top = hub.platforms[hub.platforms.length - 1];
            if (!top) return;
            // vy===0 是刚落地那一帧的信号（hubPlayerMove 贴地会把它归零）——只在真正
            // 站稳的时候才算数，不然跳跃弧线正好掠过顶台高度那一下也会被误判成通关。
            if (hub.vy === 0 && Math.abs(hub.p.x - top.x) < top.half && Math.abs(hub.p.z - top.z) < top.half && Math.abs(hub.p.y - top.y) < 0.5) {
                if (!hub.parkourDone) {
                    hub.parkourDone = true;
                    coinsAdd('hub', 5);
                    blazeFlash('跑酷通关！+5 猫盾币');
                }
                // 到顶直接瞬移回起点，不用自己找路走下去——省事，也顺便清出金色台子
                // 让别人接着挑战（人不用非得留在台顶上）。
                hub.p.set(0, 0, 20); hub.vy = 0;
            }
        }
        function hubCameraPos() {
            let dir = chaseCamDir();
            let back = 24, up = 9;
            // 锚点是人物头顶上方那一点，镜头从锚点沿完整 3D 朝向（含俯仰）退开 back——
            // 这样不管抬头低头，人物都精确落在锚点上，也就是屏幕正中间。
            // up 原来是 16，锚点比头顶还高出不少，导致整个人（尤其是腰部配饰）落在屏幕
            // 偏下的位置，正好被大厅底部那条"组队/联机/好友/麦克风/聊天"的白条盖住。
            // 收到 9（65°视场角、back=24 算下来大约把人往上提了一块屏幕高度的两成左右），
            // 人物在屏幕里的位置会明显往上移，给底部留出净空。
            let ax = hub.p.x, ay = hub.p.y + up, az = hub.p.z;
            // 跑酷台子挡镜头：贴着台子站的时候，镜头吊在身后可能正好落在台子实体里面
            // （一片贴脸的灰色）——跟 cake/jail 那套一样，沿"人→镜头"这条线探几步，
            // 撞进台子范围就把距离收短，退到台子外面。
            // 只在水平朝向分量够大的时候才探——接近抬头/低头 90° 时水平分量趋近 0，
            // cx/cz 会几乎等于人物自己的位置，这时候人正好站在自己脚下这块台子上，
            // 会被误判成"撞到前面的台子"，把镜头一路收到贴脸（看到的就是角色模型内部
            // 那圈白色描边）。这时候镜头是几乎垂直摆动，本来就不会横向撞穿台子，不用探。
            if (Math.hypot(dir.x, dir.z) > 0.3) {
                for (let i = 0; i < 6; i++) {
                    let cx = ax - dir.x * back, cz = az - dir.z * back, cy = ay - dir.y * back;
                    let hit = hub.platforms.some(function (p) {
                        return p.solid !== false && Math.abs(cx - p.x) < p.half && Math.abs(cz - p.z) < p.half && cy < p.y && cy > p.y - 6;
                    });
                    if (!hit) break;
                    back *= 0.7;
                }
            }
            return { x: ax - dir.x * back, y: ay - dir.y * back, z: az - dir.z * back };
        }
        function hubProximityTick() {
            let nearest = null, bestD = HUB.proximityRange;
            hub.wanderers.concat(Object.keys(hub.realPlayers).map(function (id) { return hub.realPlayers[id]; })).forEach(function (w) {
                let d = Math.hypot(w.p.x - hub.p.x, w.p.z - hub.p.z);
                if (d < bestD) { bestD = d; nearest = w; }
            });
            hub.nearby = nearest;
            let el = document.getElementById('hub-prompt');
            if (!el) return;
            if (nearest) {
                el.style.display = 'flex';
                // 真人走正式组队（lobbyParty，对方要真的同意），AI 路人还是原来那套哄一下的假流程
                let already = nearest.isAI ? (hub.party.indexOf(nearest.name) >= 0) : (lobbyParty.indexOf(nearest.name) >= 0);
                document.getElementById('hub-prompt-name').innerText = nearest.name + (already ? '（已组队）' : '');
                document.getElementById('hub-prompt-friend').style.display = nearest.isAI ? 'none' : '';
                let teamBtn = document.getElementById('hub-prompt-team');
                teamBtn.style.display = already ? 'none' : '';
                teamBtn.disabled = !!nearest.teamPending;
                teamBtn.innerText = nearest.teamPending ? '等待同意…' : '组队';
            } else {
                el.style.display = 'none';
            }
            let boardEl = document.getElementById('hub-board-prompt');
            if (boardEl && HUB.board) {
                let bd = Math.hypot(HUB.board.x - hub.p.x, HUB.board.z - hub.p.z);
                boardEl.style.display = bd < HUB.proximityRange ? 'block' : 'none';
            }
        }
        // 组队现在要「对方同意」才算数：点一下是发邀请，AI 会有个短暂的"考虑"延迟再答复，
        // 不是点了就秒进队伍——大概率会同意，小概率说自己在忙（更像真实的组队交互）。
        function hubTeamUp() {
            if (!hub || !hub.nearby) return;
            let w = hub.nearby;
            if (!w.isAI) {
                // 真人：走正式组队邀请（跟大厅下方"组队"面板是同一套 lobbyParty，
                // 对方要真的点同意——碰到的是真朋友，不该用假路人那套随机答复哄你）
                teamInvite(w.name);
                return;
            }
            if (hub.party.indexOf(w.name) >= 0) { blazeFlash(w.name + ' 已经在队伍里了'); return; }
            if (hub.party.length >= 3) { blazeFlash('队伍已经满了（最多 3 人）'); return; }
            if (w.teamPending) return;
            w.teamPending = true;
            hubProximityTick();
            blazeFlash('已经向 ' + w.name + ' 发出组队邀请，等 TA 同意…');
            setTimeout(function () {
                w.teamPending = false;
                if (!hub) return;
                let accept = Math.random() < 0.8;
                if (accept) {
                    hub.party.push(w.name);
                    blazeFlash(w.name + ' 同意组队了！');
                } else {
                    blazeFlash(w.name + ' 说自己在忙，拒绝了组队邀请');
                }
                hubProximityTick();
            }, 900 + Math.random() * 600);
        }
        function hubAddFriend() {
            if (!hub || !hub.nearby || hub.nearby.isAI) return;
            friendAdd(hub.nearby.name);
            blazeFlash('已经加 ' + dispNameText(hub.nearby.name) + ' 为好友');
        }
        function hubHud() {
            // 在线人数 = 真实房间人数（roomOnlineCount）+ 大厅广场路人机器人数量。
            // 真人部分看真实房间人数，不是路人机器人数量——路人是本地模拟的，
            // 之前这里写的是 hub.wanderers.length+1，两台设备各自算各自的路人，
            // 数字永远一样、永远不变，看着就跟假的一样；现在加回路人数只是为了凑热闹感。
            document.getElementById('blaze-score').innerText = '在线 ' + (roomOnlineCount() + hub.wanderers.length) + ' 人';
            let team = lobbyParty.concat(hub.party);
            document.getElementById('blaze-round').innerText = '队伍：' +
                (team.length ? team.map(dispNameText).join('、') : '（还没组队）') +
                (nightAwayActive() ? '　· 队友还在惊魂夜里，等他们打完' : '');
        }
        // ── 大厅广场联机：跟房间里其他真人互相广播位置，不经过房主转发。
        // 频率比正式对局低一些（8Hz）——大厅是常驻空间，没必要那么密。
        function hubNetTick(dt) {
            if (!hub || !peerWant) return;
            hub.netSelfT = (hub.netSelfT || 0) + dt;
            if (hub.netSelfT < 1 / 8) return;
            hub.netSelfT = 0;
            bc.postMessage({
                type: 'HUB_ME', target: '*', sender: gState.id,
                x: Math.round(hub.p.x), y: +hub.p.y.toFixed(1), z: Math.round(hub.p.z),
                fx: +hub.faceDir.x.toFixed(2), fz: +hub.faceDir.z.toFixed(2)
            });
        }
        const HUB_REAL_STALE = 6000;   // 这么久没收到更新就当对方离开大厅了
        function hubOnMe(m) {
            if (!hub || !m.sender || m.sender === gState.id) return;
            let w = hub.realPlayers[m.sender];
            if (!w) {
                let mesh = raceMakeBody(0xff8a65, 0, true, peerAccOf(m.sender), peerFaceOf(m.sender));
                let label = nightMakeLabel(m.sender, 0xff8a65, false, peerTitleOf(m.sender));
                label.position.y = 13.5; mesh.add(label);
                scene.add(mesh);
                w = hub.realPlayers[m.sender] = {
                    name: m.sender, isAI: false, mesh: mesh,
                    p: new THREE.Vector3(m.x, m.y || 0, m.z), target: null,
                    faceDir: { x: m.fx || 0, z: m.fz || 1 }, animT: 0, spd: 0
                };
            }
            w.target = { x: m.x, y: m.y || 0, z: m.z };
            if (m.fx !== undefined) w.faceDir = { x: m.fx, z: m.fz };
            w.lastSeen = performance.now();
        }
        // 移动平台：沿一根轴做正弦来回摆动，数据(p.x/p.z)和网格位置一起动——碰撞判定
        // 直接读 p.x/p.z，动了就是动了，不用额外同步。
        // 销毁平台：人站上去攒够时间会先抖一下再塌掉（solid=false，判定/落地都跳过它），
        // 塌一段时间后自动长回来，不是永久消失。
        function hubPlatformsTick(dt) {
            hub.clock = (hub.clock || 0) + dt;
            let now = performance.now();
            hub.platforms.forEach(function (p) {
                if (p.mover) {
                    let off = Math.sin(hub.clock * p.mover.speed + p.mover.phase) * p.mover.range;
                    if (p.mover.axis === 'x') p.x = p.mover.base + off; else p.z = p.mover.base + off;
                    p.mesh.position.x = p.x; p.mesh.position.z = p.z;
                }
                if (p.crumble) {
                    if (p.crumble.gone) {
                        if (now >= p.crumble.respawnAt) { p.crumble.gone = false; p.solid = true; p.mesh.visible = true; p.crumble.standT = 0; }
                        return;
                    }
                    let standing = Math.abs(hub.p.x - p.x) < p.half && Math.abs(hub.p.z - p.z) < p.half && Math.abs(hub.p.y - p.y) < 0.6;
                    p.crumble.standT = standing ? p.crumble.standT + dt : 0;
                    if (p.crumble.standT > 1.2) {
                        p.crumble.gone = true; p.solid = false; p.mesh.visible = false;
                        p.crumble.respawnAt = now + 3000;
                    } else if (p.crumble.standT > 0.8) {
                        p.mesh.position.y = p.meshBaseY + Math.sin(now * 0.05) * 0.3;
                    } else {
                        p.mesh.position.y = p.meshBaseY;
                    }
                }
            });
        }
        function hubTick(dt) {
            let prevPx = hub.p.x, prevPz = hub.p.z;
            hubPlatformsTick(dt);
            hubPlayerMove(dt);
            hub.spd = Math.hypot(hub.p.x - prevPx, hub.p.z - prevPz) / dt;
            hub.wanderers.forEach(function (w) {
                let px0 = w.p.x, pz0 = w.p.z;
                hubWandererTick(w, dt);
                w.spd = Math.hypot(w.p.x - px0, w.p.z - pz0) / dt;
            });
            hubNetTick(dt);
            // 联机来的真人路人：位置是网络给的坐标，插值挪过去，离线太久就撤掉模型
            let now = performance.now();
            Object.keys(hub.realPlayers).forEach(function (id) {
                let w = hub.realPlayers[id];
                if (now - (w.lastSeen || 0) > HUB_REAL_STALE) {
                    scene.remove(w.mesh); delete hub.realPlayers[id]; return;
                }
                if (w.target) {
                    let px0 = w.p.x, pz0 = w.p.z, k = Math.min(1, dt * 10);
                    w.p.x += (w.target.x - w.p.x) * k; w.p.z += (w.target.z - w.p.z) * k;
                    w.p.y += (w.target.y - w.p.y) * k;
                    w.spd = Math.hypot(w.p.x - px0, w.p.z - pz0) / dt;
                }
            });
            let realList = Object.keys(hub.realPlayers).map(function (id) { return hub.realPlayers[id]; });
            // 站着不动的时候腿不该还在原地摆——之前不管有没有真的在移动都按固定频率甩腿，
            // 看着就是「人没在动脚在动」。现在按这一步真实挪动的距离算摆动幅度，站定就归零。
            [hub].concat(hub.wanderers).concat(realList).forEach(function (real) {
                real.mesh.position.set(real.p.x, real.p.y, real.p.z);
                if (real.faceDir) real.mesh.rotation.y = Math.atan2(real.faceDir.x, real.faceDir.z);
                let u = real.mesh.userData;
                let run = Math.min(1, (real.spd || 0) / HUB.moveSpeed);
                real.animT = (real.animT || 0) + dt * (2 + run * 14);
                if (u.legs) { u.legs[0].rotation.x = Math.sin(real.animT) * 0.6 * run; u.legs[1].rotation.x = -Math.sin(real.animT) * 0.6 * run; }
                tickAccStarOrbit(u, dt);
            });
            hubProximityTick();
            let camPos = hubCameraPos();
            camera.position.set(camPos.x, camPos.y, camPos.z);
            hubHud();
            renderer.render(scene, camera);
        }
        function hubLoop() {
            if (!hub) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - hub.last) / 1000);
            hub.last = now;
            hubTick(dt);
            hub.raf = requestAnimationFrame(hubLoop);
        }
        function hubTouchUI(on) {
            ['blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn', 'blaze-atk-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn', 'race-jump-btn', 'run-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = (gState.control === 'pad');
            let jump = document.getElementById('blaze-jump-btn');
            if (jump) { jump.innerText = '跳'; jump.style.display = (on && pad) ? 'flex' : 'none'; }
            let stats = document.getElementById('blaze-stats-btn'); if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            // 大厅现在是常驻的家，没有"退出"这回事了——想去玩哪个模式，
            // 点大厅 UI 里的模式/开始游戏就行，所以这颗按钮直接藏起来。
            if (ex) { if (on) ex.style.display = 'none'; else { ex.style.display = ''; ex.onclick = blazeExit; } }
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id); if (e && on) e.classList.add('hidden');
            });
        }
        function hubBegin() {
            if (hub) return;   // 已经在大厅里了，不重复搭一遍（不然模型、路人会叠出重影）
            // 大厅现在就是常驻的 3D 广场，屏幕上的大厅 UI（选模式/商店/好友…）
            // 一直盖在上面，所以这里不再隐藏 screen-lobby，也不清屏——nav() 已经
            // 处理了"离开大厅就关掉它"这件事，这里只管把 3D 世界搭起来。
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            // blaze-roster 是超燃对局专用的，大厅从来不写它——但退出超燃时没人清过它，
            // 上一局的排位表就一直糊在左上角，正好压在 lobby-tl 那块菜单上。
            let rosterHub = document.getElementById('blaze-roster'); if (rosterHub) rosterHub.innerHTML = '';
            // 在线人数/大厅提示这行本来是屏幕水平居中的，套用到大厅里就会跟右上角
            // lobby-tr 那块选模式面板撞在一起——按跟 lobby-tl/tr 同样的断点公式，
            // 把它的左右边界卡在两块面板中间那条真正空着的缝里，不再整屏居中。
            // 手机竖屏这么窄的时候，lobby-tl/tr 两块面板本身就占了 92vw，中间缝
            // 只剩几个像素，left/right 算出来的宽度是负的——这行字被挤到只剩几像
            // 素宽，每个字自己换一行，一整列竖排文字糊满大半个屏幕。补一个
            // min-width 兜底，宽度不够就宁可稍微盖到旁边面板上，也不要挤成负数。
            let scoreWrap = document.getElementById('blaze-score-wrap');
            if (scoreWrap) {
                scoreWrap.style.left = 'calc(14px + min(190px, 42vw) + 12px)';
                scoreWrap.style.right = 'calc(14px + min(320px, 50vw) + 12px)';
                scoreWrap.style.transform = 'none';
                scoreWrap.style.minWidth = '150px';
                scoreWrap.style.width = 'auto'; scoreWrap.style.maxWidth = 'none';   // 左右两边卡住了，别用通用的 max-content
                // min-width 兜底之后，窄屏下这行会比中间缝更宽，往右盖住 lobby-tr
                // 那排"选择模式/寻宝队/开始游戏"按钮——挪到那排按钮下方，就不叠字了。
                scoreWrap.style.top = window.innerWidth < 480 ? '74px' : '10px';
            }
            if (blaze) { try { blazeExit(); } catch (e) { } }
            if (race) { try { raceExit(); } catch (e) { } }
            if (jail) { try { jailExit(); } catch (e) { } }
            if (dodge) { try { dodgeExit(); } catch (e) { } }
            if (escapeRoom) { try { escapeExit(); } catch (e) { } }
            if (park) { try { parkExit(); } catch (e) { } }
            if (cake) { try { cakeExit(); } catch (e) { } }
            if (nm) { try { nmTeardown(); } catch (e) { } }
            ensureScene();
            clearMazeMeshes();   // 保险：万一某个模式退出时没清干净，进大厅前兜底扫一遍
            scene.background = new THREE.Color(0x8fd3f4);
            scene.fog = new THREE.FogExp2(0x8fd3f4, 0.0015);

            let mesh = raceMakeBody(mySkinColor(0x66bb6a), 0, true, gState.acc, myFace());
            scene.add(mesh);
            hub = {
                meshes: [], wanderers: [], realPlayers: {}, party: [], nearby: null,
                p: new THREE.Vector3(0, 0, 20), vy: 0, faceDir: { x: 0, z: -1 }, mesh: mesh, animT: 0,
                last: performance.now(), raf: null, netSelfT: 0, parkourDone: false
            };
            hubBuildWorld();
            hubSpawnWanderers();
            camera.rotation.set(0, 0, 0);   // 面朝 -Z，正对着广场中央和跑酷那一侧

            document.body.onmousedown = function (e) {
                if (!hub) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            document.body.onmouseup = null;
            hubTouchUI(true);
            bgmStart();
            hubLoop();
        }
        function hubExit() {
            if (!hub) return;
            if (hub.raf) cancelAnimationFrame(hub.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            (hub.meshes || []).forEach(function (m) { scene.remove(m); });
            hub.wanderers.forEach(function (w) { scene.remove(w.mesh); });
            Object.keys(hub.realPlayers).forEach(function (id) { scene.remove(hub.realPlayers[id].mesh); });
            scene.remove(hub.mesh);
            hub = null;
            hubTouchUI(false);
            let hp = document.getElementById('hub-prompt'); if (hp) hp.style.display = 'none';
            // 大厅专用的窄化定位只对大厅有意义——其它模式没有 lobby-tl/tr 那两块面板，
            // 离开大厅要把这行改回原来的整屏水平居中，不然进了正式对局这行会一直偏在中间偏左。
            let scoreWrapExit = document.getElementById('blaze-score-wrap');
            if (scoreWrapExit) { scoreWrapExit.style.left = '50%'; scoreWrapExit.style.right = ''; scoreWrapExit.style.transform = 'translateX(-50%)'; scoreWrapExit.style.minWidth = ''; scoreWrapExit.style.top = '10px'; scoreWrapExit.style.width = ''; scoreWrapExit.style.maxWidth = ''; }
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            // 不在这调 nav() —— hubExit 本来就是被 nav() 自己（离开大厅时）
            // 或者某个模式的 Begin() 调用的，这里再调一次会互相递归。
        }

        let hudSlots = document.querySelectorAll('#hud-hotbar-container .slot');
        hudSlots.forEach(function (slot, i) { setupSlotDrag(slot, 'inv', i); });
