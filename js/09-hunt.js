        // ══════════════ 信号接收器的蓝色路线（H10）══════════════
        // 在 (楼层, x, z) 格子上找路，楼梯按真实走法连：下层的楼梯格只能从开口那一侧进；爬上去到上层的平台；
        // 上层楼梯格靠开口那一侧是楼梯井，从那边走进去会掉到下层台阶上；平台不能直接走回楼梯井那一侧。
        // 路线画成一条连续的管子（一个 mesh），沿着人真正踩的面：过桌子抬到桌面、上楼梯沿台阶面、跳井就竖着往下。
        const HUNT_ROUTE_LIFT = 0.8;   // 管子离脚下表面多高（不插进地面）
        function huntCellKind(f, x, z) {
            let c = maze[f] && maze[f][z] && maze[f][z][x];
            if (!c || c.type === 1) return null;
            if (c.type === 3 && c.stair) return c.stair.base === f ? 'stairLo' : 'stairHi';
            return c.type === 2 ? 'table' : 'floor';
        }
        function huntStairAxis(s) { return s.axis === 'x' ? { dx: s.sign, dz: 0 } : { dx: 0, dz: s.sign }; }
        // 一个节点能走到哪些节点
        function huntRouteNbrs(n) {
            let out = [], k = huntCellKind(n.f, n.x, n.z); if (!k) return out;
            let c = maze[n.f][n.z][n.x];
            if (k === 'stairLo') out.push({ f: n.f + 1, x: n.x, z: n.z, via: 'up' });
            if (k === 'stairHi') out.push({ f: n.f - 1, x: n.x, z: n.z, via: 'down' });
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
                let x = n.x + d[0], z = n.z + d[1];
                if (x < 0 || z < 0 || x >= mSize || z >= mSize) return;
                let kn = huntCellKind(n.f, x, z); if (!kn) return;
                if (k === 'stairLo') { let a = huntStairAxis(c.stair); if (d[0] !== -a.dx || d[1] !== -a.dz) return; }   // 只能从开口出去
                if (k === 'stairHi') {   // 平台往井那一侧：走过去会掉下去，只能从平台边上跳过井
                    let a = huntStairAxis(c.stair);
                    if (d[0] === -a.dx && d[1] === -a.dz) { out.push({ f: n.f, x: x, z: z, via: 'leap' }); return; }
                }
                let cn = maze[n.f][z][x];
                if (kn === 'stairLo') { let a = huntStairAxis(cn.stair); if (d[0] !== a.dx || d[1] !== a.dz) return; }  // 只能从开口进
                if (kn === 'stairHi') {
                    let a = huntStairAxis(cn.stair);
                    if (d[0] === a.dx && d[1] === a.dz) { out.push({ f: n.f - 1, x: x, z: z, via: 'well' }); return; }   // 从井那一侧走进去，掉到下层台阶上
                }
                out.push({ f: n.f, x: x, z: z, via: 'walk' });
            });
            return out;
        }
        // floor 给了就只在这一层里找（小地图导航用）
        function huntRouteFind(from, to, floor) {
            let key = function (n) { return (n.f * 64 + n.z) * 64 + n.x; };
            if (!huntCellKind(from.f, from.x, from.z) || !huntCellKind(to.f, to.x, to.z)) return null;
            let prev = {}, q = [{ f: from.f, x: from.x, z: from.z }]; prev[key(from)] = null;
            for (let h = 0; h < q.length; h++) {
                let n = q[h];
                if (n.f === to.f && n.x === to.x && n.z === to.z) {
                    let path = [], cur = n; while (cur) { path.unshift(cur); cur = prev[key(cur)]; } return path;
                }
                huntRouteNbrs(n).forEach(function (m) { if (floor !== undefined && m.f !== floor) return; let k = key(m); if (!(k in prev)) { prev[k] = n; q.push(m); } });
            }
            return null;
        }
        // 楼梯格里沿轴向 t 处的点；side 是横向偏移
        function huntStairPt(s, x, z, t, y, side) {
            let along = s.edge + s.sign * t;
            return s.axis === 'x' ? new THREE.Vector3(along, y, z * TILE + (side || 0)) : new THREE.Vector3(x * TILE + (side || 0), y, along);
        }
        function huntStepTop(s, t) { let i = Math.floor(t / s.depth); i = Math.max(0, Math.min(s.count - 1, i)); return s.base * TILE + s.rise * (i + 1); }
        function huntPlatT(s) { return s.count * s.depth + (TILE - s.count * s.depth) / 2; }
        // 沿台阶面的折线：从 t0 走到 t1（可以往回走），每级台阶的边上竖着上下
        function huntStairWalk(pts, s, x, z, t0, t1) {
            let dir = t1 >= t0 ? 1 : -1, t = t0;
            pts.push(huntStairPt(s, x, z, t, huntStepTop(s, t + dir * 0.01)));
            while (dir > 0 ? t < t1 - 1e-6 : t > t1 + 1e-6) {
                let i = Math.floor(t / s.depth + (dir > 0 ? 1e-6 : -1e-6));
                let nb = dir > 0 ? Math.min(t1, (i + 1) * s.depth) : Math.max(t1, i * s.depth);
                let y = huntStepTop(s, (t + nb) / 2);
                // 竖线永远放在矮的那一级上（t 小的一侧），上楼下楼都不会插进台阶
                pts.push(huntStairPt(s, x, z, nb - 0.05, y));                                                   // 走到这一级的边
                t = nb;
                if (dir > 0 ? t < t1 - 1e-6 : t > t1 + 1e-6) pts.push(huntStairPt(s, x, z, t - 0.05, huntStepTop(s, t + dir * 0.01)));   // 竖着到下一级
            }
        }
        function huntSurfY(f, x, z) { return f * TILE + (huntCellKind(f, x, z) === 'table' ? HUNT_TABLE_H : 0); }
        // 两格交界的中点；toward 'a' 就往 a 那边偏一点点，竖线不会正好压在交界上
        function huntEdgePt(a, b, y, toward) {
            let mx = (a.x + b.x) / 2 * TILE, mz = (a.z + b.z) / 2 * TILE, k = toward === 'a' ? -0.05 : 0.05;
            return new THREE.Vector3(mx + (b.x - a.x) * k, y, mz + (b.z - a.z) * k);
        }
        // 节点序列 → 脚踩的面上的折线
        function huntRoutePoints(path, start) {
            let pts = [];
            let platPt = function (n) { let s = maze[n.f][n.z][n.x].stair; return huntStairPt(s, n.x, n.z, huntPlatT(s), n.f * TILE); };
            let tOn = {};   // 在下层楼梯格里，现在走到了 t 的哪里
            let n0 = path[0], k0 = huntCellKind(n0.f, n0.x, n0.z);
            if (k0 === 'stairHi') pts.push(platPt(n0));
            else if (k0 === 'stairLo') {
                let s = maze[n0.f][n0.z][n0.x].stair;
                let t = Math.max(0.1, Math.min(s.count * s.depth - 0.1, s.sign * ((s.axis === 'z' ? start.z : start.x) - s.edge)));
                pts.push(huntStairPt(s, n0.x, n0.z, t, huntStepTop(s, t))); tOn[0] = t;
            }
            else pts.push(new THREE.Vector3(n0.x * TILE, huntSurfY(n0.f, n0.x, n0.z), n0.z * TILE));   // H25：线走在路正中间，从所在格子的中心起，不从脚下起
            for (let i = 1; i < path.length; i++) {
                let a = path[i - 1], b = path[i], ka = huntCellKind(a.f, a.x, a.z), kb = huntCellKind(b.f, b.x, b.z);
                if (b.via === 'up') {                 // 下层楼梯格 → 爬到上层平台
                    let s = maze[a.f][a.z][a.x].stair;
                    huntStairWalk(pts, s, a.x, a.z, tOn[i - 1] || 0, s.count * s.depth);
                    pts.push(platPt(b));
                } else if (b.via === 'down') {        // 上层平台 → 沿台阶走到底
                    let s = maze[b.f][b.z][b.x].stair;
                    pts.push(huntStairPt(s, b.x, b.z, s.count * s.depth + 0.05, a.f * TILE));
                    huntStairWalk(pts, s, b.x, b.z, s.count * s.depth - 0.05, 0.1); tOn[i] = 0.1;
                } else if (b.via === 'leap') {        // 从平台边上起跳，跳过楼梯井
                    let s = maze[a.f][a.z][a.x].stair, y = a.f * TILE;
                    let take = huntStairPt(s, a.x, a.z, s.count * s.depth + 0.5, y); take.jump = true;
                    pts.push(take);
                    // 落到桌子上：在井这一侧竖着抬到桌面再过去，不斜着穿进桌子
                    let yb = huntSurfY(b.f, b.x, b.z), e = huntEdgePt(a, b, y, yb > y ? 'a' : 'b');
                    pts.push(e); if (yb > y) pts.push(new THREE.Vector3(e.x, yb, e.z));
                    pts.push(new THREE.Vector3(b.x * TILE, yb, b.z * TILE));
                } else if (b.via === 'well') {        // 走到井边，竖着掉到台阶上（从桌子上走过去就是桌面的高度）
                    let s = maze[b.f][b.z][b.x].stair, y = huntSurfY(a.f, a.x, a.z);
                    pts.push(huntEdgePt(a, b, y, 'a'));
                    pts.push(huntStairPt(s, b.x, b.z, 1, y));
                    pts.push(huntStairPt(s, b.x, b.z, 1, huntStepTop(s, 1))); tOn[i] = 1;
                } else {                               // 同层相邻
                    if (ka === 'stairLo') {            // 先沿台阶走回开口那一级
                        let s = maze[a.f][a.z][a.x].stair;
                        if ((tOn[i - 1] || 0) > 0.1) huntStairWalk(pts, s, a.x, a.z, tOn[i - 1], 0.1);
                    }
                    let ya = ka === 'stairHi' ? a.f * TILE : ka === 'stairLo' ? huntStepTop(maze[a.f][a.z][a.x].stair, 0) : huntSurfY(a.f, a.x, a.z);
                    let yb = kb === 'stairHi' ? b.f * TILE : kb === 'stairLo' ? huntStepTop(maze[b.f][b.z][b.x].stair, 0) : huntSurfY(b.f, b.x, b.z);
                    // 高差走不上去（桌子）时，竖线离交界 P_RADIUS+0.5：身子贴不到桌子边，人是在这儿起跳/落地的；
                    // 上下台阶第一级这种走得上去的就在交界上
                    let off = Math.abs(ya - yb) > MAX_STEP_UP ? P_RADIUS + 0.5 : 0;
                    let ux = b.x - a.x, uz = b.z - a.z;   // a→b 方向
                    if (ka === 'stairHi') {            // 从平台下去：先在平台上走到这一侧（要上桌子就停在起跳的地方）
                        let q = platPt(a), e = huntEdgePt(a, b, a.f * TILE, 'a'), s = maze[a.f][a.z][a.x].stair;
                        if (ya <= yb) { e.x -= ux * off; e.z -= uz * off; }
                        pts.push(s.axis === 'x' ? new THREE.Vector3(q.x, q.y, e.z) : new THREE.Vector3(e.x, q.y, q.z));
                    }
                    let ea = huntEdgePt(a, b, ya, 'a'), eb = huntEdgePt(a, b, yb, 'b');
                    // 从侧面上下平台：交界点放在平台那一段（不在井上面）
                    let side = function (n) { let s = maze[n.f][n.z][n.x].stair; return s.axis === 'x' ? a.x === b.x : a.z === b.z; };
                    if (kb === 'stairHi' && side(b)) { let s = maze[b.f][b.z][b.x].stair, q = platPt(b); if (s.axis === 'x') { ea.x = eb.x = q.x; } else { ea.z = eb.z = q.z; } }
                    if (ka === 'stairHi' && side(a)) { let s = maze[a.f][a.z][a.x].stair, q = platPt(a); if (s.axis === 'x') { ea.x = eb.x = q.x; } else { ea.z = eb.z = q.z; } }
                    // 在矮的那一侧竖着上下
                    if (ya <= yb) {
                        let lo = ea.clone(); lo.x -= ux * off; lo.z -= uz * off;
                        pts.push(lo); if (yb > ya) { pts.push(new THREE.Vector3(lo.x, yb, lo.z)); if (off) pts.push(new THREE.Vector3(ea.x, yb, ea.z)); }
                    } else {
                        let lo = eb.clone(); lo.x += ux * off; lo.z += uz * off;
                        if (off) pts.push(new THREE.Vector3(eb.x, ya, eb.z));
                        pts.push(new THREE.Vector3(lo.x, ya, lo.z)); pts.push(lo);
                    }
                    if (kb === 'stairHi') pts.push(platPt(b));
                    else if (kb === 'stairLo') { let s = maze[b.f][b.z][b.x].stair; pts.push(huntStairPt(s, b.x, b.z, 0.1, huntStepTop(s, 0))); tOn[i] = 0.1; }
                    else pts.push(new THREE.Vector3(b.x * TILE, yb, b.z * TILE));
                }
            }
            return pts;
        }
        let huntSignalRoute = { mesh: null, key: '', pts: null, ok: false };
        function huntRouteDispose(r) {
            if (r && r.mesh) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); r.mesh = null; }
        }
        function huntRouteMesh(pts, color) {
            let path = new THREE.CurvePath(), len = 0;
            for (let i = 1; i < pts.length; i++) {
                let a = pts[i - 1].clone(), b = pts[i].clone(); a.y += HUNT_ROUTE_LIFT; b.y += HUNT_ROUTE_LIFT;
                if (a.distanceTo(b) < 1e-3) continue;
                path.add(new THREE.LineCurve3(a, b)); len += a.distanceTo(b);
            }
            if (!path.curves.length) return null;
            let geo = new THREE.TubeGeometry(path, Math.max(8, Math.ceil(len / 2)), 0.45, 6, false);
            let m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85 }));
            m.renderOrder = 2;
            return m;
        }
        function huntPlayerNode() {
            let feet = camera.position.y - 9, f = huntFloorOf(feet);
            let x = Math.floor((camera.position.x + TILE / 2) / TILE), z = Math.floor((camera.position.z + TILE / 2) / TILE);
            if (!huntCellKind(f, x, z) && huntCellKind(f + 1, x, z)) f++;
            return { f: f, x: x, z: z };
        }
        function huntRouteBuild(from, to, start, floor) {
            let path = huntRouteFind(from, to, floor); if (!path) return null;
            return { path: path, pts: huntRoutePoints(path, start) };
        }
        function signalHint(t) {
            let el = document.getElementById('signal-hint');
            if (!el) {
                el = document.createElement('div'); el.id = 'signal-hint';
                el.style.cssText = 'position:absolute; top:58px; left:50%; transform:translateX(-50%); background:rgba(25,118,210,.85); color:#fff; padding:4px 10px; border-radius:6px; font-size:13px; pointer-events:none; z-index:5;';
                (document.getElementById('ui-layer') || document.body).appendChild(el);
            }
            el.innerText = t; el.style.display = t ? 'block' : 'none';
        }
        function signalRouteClear() { huntRouteDispose(huntSignalRoute); huntSignalRoute = { mesh: null, key: '', pts: null, ok: false }; signalHint(''); }
        // 每帧：玩家换了格子或楼层就从当前位置重算（走过的部分就没了）；诅咒期间藏起来，结束后恢复；找不到路就提示几楼、大致方向
        function signalRouteTick(force) {
            let s = gState.signal, it = s && s.mesh;
            if (!it || groundItems.indexOf(it) < 0) { if (huntSignalRoute.key) signalRouteClear(); return; }
            let to = { f: Math.floor(it.position.y / TILE), x: Math.floor((it.position.x + TILE / 2) / TILE), z: Math.floor((it.position.z + TILE / 2) / TILE) };
            let from = huntPlayerNode(), key = [from.f, from.x, from.z, to.f, to.x, to.z].join(',');
            if (force || key !== huntSignalRoute.key) {
                huntRouteDispose(huntSignalRoute);
                let r = huntRouteBuild(from, to, camera.position);
                huntSignalRoute = { mesh: null, key: key, pts: r ? r.pts : null, ok: !!r };
                if (r) { huntSignalRoute.mesh = huntRouteMesh(r.pts, 0x1e88e5); if (huntSignalRoute.mesh) scene.add(huntSignalRoute.mesh); }
            }
            let cursed = gState.debuff && gState.debuff.type === 1;
            if (huntSignalRoute.mesh) huntSignalRoute.mesh.visible = !cursed;
            if (cursed) { signalHint(''); return; }
            if (huntSignalRoute.ok) { signalHint(to.f !== from.f ? '东西在 ' + (to.f + 1) + ' 楼，跟着蓝线走' : ''); return; }
            let dx = it.position.x - camera.position.x, dz = it.position.z - camera.position.z;
            let fw = new THREE.Vector3(); camera.getWorldDirection(fw);
            let ang = Math.atan2(dx, dz) - Math.atan2(fw.x, fw.z); ang = Math.atan2(Math.sin(ang), Math.cos(ang));
            let dirTxt = Math.abs(ang) < Math.PI / 4 ? '前面' : Math.abs(ang) > Math.PI * 3 / 4 ? '后面' : ang > 0 ? '左边' : '右边';
            signalHint('东西在 ' + (to.f + 1) + ' 楼，在你' + dirTxt);
        }

        // ══════════════ 小地图导航（H11）：点小地图/大地图，画一条绿线，只在当前这一层 ══════════════
        // 跟信号接收器的蓝线是两条各管各的线，画法一样；清掉一条不影响另一条
        let huntNavRoute = { mesh: null, key: '', pts: null, to: null };
        function clearFootprints3D() { huntRouteDispose(huntNavRoute); huntNavRoute = { mesh: null, key: '', pts: null, to: null }; currentNavPath = []; }
        function generateFootprintGuide(tx, tz) {
            if (gState.debuff.type === 1) return;
            if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
            let from = huntPlayerNode(), f = from.f;
            if (tx < 0 || tx >= mSize || tz < 0 || tz >= mSize) return;
            if (!huntCellKind(f, tx, tz)) return;
            clearFootprints3D();
            huntNavRoute.to = { f: f, x: tx, z: tz };
            navRouteTick(true);
        }
        // 每帧：换了格子就从当前位置重算（走过的就没了）；走到了、找不到路就清掉；换了楼层不清，跨楼层接着导航（H25）
        function navRouteTick(force) {
            let to = huntNavRoute.to; if (!to) return;
            let from = huntPlayerNode();
            if (from.f === to.f && from.x === to.x && from.z === to.z) { clearFootprints3D(); return; }
            let key = [from.f, from.x, from.z].join(',');
            if (force || key !== huntNavRoute.key) {
                huntRouteDispose(huntNavRoute);
                // H25：同一层走得到就只走这一层；这一层走不到（要绕别的楼层）或者玩家已经换了楼层，就跨楼层接着导航
                let r = from.f === to.f ? huntRouteBuild(from, to, camera.position, to.f) : null;
                if (!r) r = huntRouteBuild(from, to, camera.position);
                if (!r) { clearFootprints3D(); return; }
                huntNavRoute.key = key; huntNavRoute.pts = r.pts; currentNavPath = r.path;
                huntNavRoute.mesh = huntRouteMesh(r.pts, 0x2ecc71); if (huntNavRoute.mesh) scene.add(huntNavRoute.mesh);
            }
            if (huntNavRoute.mesh) huntNavRoute.mesh.visible = !(gState.debuff && gState.debuff.type === 1);
        }

        function tickSignal(dt) {
            let s = gState.signal;
            if (!s.active || s.mesh) return;
            s.timer += dt;
            let bar = document.getElementById('progress-bg');
            if (!actionTarget) { bar.style.display = 'block'; document.getElementById('progress-fill').style.width = Math.min(100, (s.timer / 1.5) * 100) + '%'; }
            if (s.timer < 1.5) return;

            // H13：奖励是造图时按队员预先抽好的（算在这张图的大金上限里）；用完了就出不占上限的紫/金
            let me = Math.max(0, (gState.team || []).findIndex(function (m) { return m.id === gState.id; }));
            let list = huntSignalLoot[me] || [], reward = list[gState.signalN || 0];
            gState.signalN = (gState.signalN || 0) + 1;
            if (!reward) reward = Math.random() < 0.6 / 0.9 ? itemPool.purple[Math.floor(Math.random() * itemPool.purple.length)] : itemPool.gold[Math.floor(Math.random() * itemPool.gold.length)];

            let pos = getHiddenSpawnPos();
            let b = huntGroundMesh(reward);
            b.position.set(pos.fx * TILE, pos.fl * TILE + 1.5, pos.fz * TILE);
            b.userData = { ...reward, isItem: true, vel: new THREE.Vector3(0, 0, 0), fromSignal: true };
            huntItemGlow(b);
            scene.add(b); groundItems.push(b); s.mesh = b;
            signalRouteTick(true);
            if (!actionTarget) bar.style.display = 'none';
        }

        // H20：上方血条、体力条里直接写数字（如 240/300）；带骑士剑时超出原来上限的那一段显示金色
        function huntBarsRender() {
            let max = effectiveMaxHp() || 100, base = huntBaseMax(), hp = Math.max(0, gState.hp);
            let red = Math.min(hp, base), gold = Math.max(0, hp - base);
            let f = document.getElementById('health-fill'), g = document.getElementById('health-gold'), n = document.getElementById('health-num');
            if (f) f.style.width = Math.min(100, red / max * 100) + '%';
            if (g) g.style.width = Math.min(100 - Math.min(100, red / max * 100), gold / max * 100) + '%';
            if (n) n.innerText = Math.floor(hp) + '/' + max;
            let sn = document.getElementById('stamina-num'); if (sn) sn.innerText = Math.floor(stamina) + '/100';
        }
        function updateHUD() {
            pouchViewTick();
            huntBarsRender();
            let currentWeight = invWeight();
            document.getElementById('weight-txt').innerText = currentWeight;

            expandInventory();
            if (openPouch && gState.inv.indexOf(openPouch) < 0) openPouch = null;

            for (let i = 0; i < 3; i++) {
                let hudSlot = document.getElementById('hud-slot-' + i);
                hudSlot.className = 'slot' + slotTierClass(gState.inv[i]) + (gState.selectedSlot === i ? ' selected' : '');
                hudSlot.onclick = function () { selectSlot(i); };
                // 左上角标上 1/2/3，键盘玩的一看就知道按哪个（数字键不再被快捷语抢走了）
                let keyTag = '<span style="position:absolute; top:1px; left:4px; font-size:10px; color:#999;">' + (i + 1) + '</span>';
                hudSlot.style.position = 'relative';
                hudSlot.innerHTML = keyTag + slotLabelHtml(gState.inv[i]);
            }

            const bpHotbarEl = document.getElementById('bp-hotbar-slots'); const bpBackpackEl = document.getElementById('bp-backpack-slots');
            bpHotbarEl.innerHTML = ''; bpBackpackEl.innerHTML = '';

            for (let i = 0; i < gState.maxInv; i++) {
                let slotEl = document.createElement('div');
                slotEl.className = 'slot' + slotTierClass(gState.inv[i]) + (gState.selectedSlot === i ? ' selected' : '');
                slotEl.innerHTML = slotLabelHtml(gState.inv[i]);
                setupSlotDrag(slotEl, 'inv', i);
                slotEl.onclick = function () { pouchToggleFor(gState.inv[i]); if (i <= 2) selectSlot(i); else updateHUD(); };
                if (i < 3) bpHotbarEl.appendChild(slotEl); else bpBackpackEl.appendChild(slotEl);
            }
            renderPouchSlots(pouchRowEl(bpBackpackEl, 'bp-pouch-row'), updateHUD);

            let hint = document.getElementById('bp-repair-hint');
            if (hint) {
                let sel = gState.inv[gState.selectedSlot];
                if (sel && sel.type === 'badge') hint.innerText = `地窖徽章 ${sel.uses}/${sel.maxUses}　维护费 $${BADGE_REPAIR_COST}　资金 ${HUNT_TEST_MONEY ? '无限' : '$' + gState.money}`;
                else if (sel && sel.type === 'med') hint.innerText = `医疗包 ${sel.uses}/${sel.maxUses}　维护费 $${(sel.maxUses - sel.uses) * 1000}　资金 ${HUNT_TEST_MONEY ? '无限' : '$' + gState.money}`;
                else hint.innerText = '在快捷栏选中地窖徽章或医疗包后可充能维护';
            }
            drawCapacityCircle();
        }

        // U5：腰包的 3 格对应按键 4/5/6（触屏是快捷栏旁边的 3 个小格）。用哪个腰包：手上（快捷栏）选中的是腰包就用它，不然用背包里第一个腰包。
        // 腰包里的东西不能直接用：按键/点小格把那件拿到手上（手上有空格放空格，没有就跟当前手上的对换）。
        function pouchActive() {
            let held = gState.inv[gState.selectedSlot];
            if (gState.selectedSlot >= 0 && gState.selectedSlot <= 2 && isPouch(held)) return held;
            for (let i = 0; i < gState.inv.length; i++) if (isPouch(gState.inv[i])) return gState.inv[i];
            return null;
        }
        function pouchOpen() { return !!pouchActive(); }
        function pouchKeyTake(n) {
            let p = pouchActive();
            if (!p) { blazeFlash('身上没有腰包'); return; }
            if (!pouchBag(p)[n]) { blazeFlash('腰包第 ' + (n + 1) + ' 格是空的'); return; }
            pouchTakeToHand(n, p);
        }

        // 点腰包里第 n 格：放到手上的空格；手上没空格，就跟当前手上这格对换（腰包不能放进腰包）
        function pouchTakeToHand(n, src) {
            src = src || openPouch;
            let bag = pouchBag(src);
            if (!bag || n < 0 || n >= POUCH_SLOTS || !bag[n]) return;
            let cur = gState.selectedSlot >= 0 && gState.selectedSlot <= 2 ? gState.selectedSlot : 0, to = -1;
            if (!gState.inv[cur]) to = cur;
            else for (let i = 0; i < 3; i++) if (!gState.inv[i]) { to = i; break; }
            if (to < 0) {
                if (isPouch(gState.inv[cur])) { blazeFlash('腰包不能放进腰包'); return; }
                to = cur;
            }
            if (isPouch(gState.inv[to])) { blazeFlash('腰包不能放进腰包'); return; }
            let a = bag[n];
            bag[n] = gState.inv[to];
            gState.inv[to] = a;
            selectSlot(to);
            updateHUD();
        }

        function pouchViewTick() {
            let el = document.getElementById('pouch-view'); if (!el) return;
            expandInventory();
            let cells = document.getElementById('pouch-cells');
            let p = isPlaying ? pouchActive() : null;
            if (!p) { el.classList.add('hidden'); if (cells) cells.style.display = 'none'; return; }
            let bag = pouchBag(p);
            if (padOn()) {   // 触屏：快捷栏旁边 3 个小格，点一下把那件拿到手上
                el.classList.add('hidden');
                if (cells) {
                    cells.style.display = 'flex';
                    Array.prototype.forEach.call(cells.children, function (c, n) {
                        let it = bag[n];
                        c.className = 'slot pouch-cell' + slotTierClass(it);
                        c.innerHTML = it ? '<div>' + it.n + '</div>' : '<div style="color:#aaa;">空</div>';
                        if (!c._wired) { c._wired = true; c.addEventListener('touchstart', function (e) { e.preventDefault(); pouchKeyTake(n); }, { passive: false }); c.addEventListener('click', function () { pouchKeyTake(n); }); }
                    });
                }
                return;
            }
            if (cells) cells.style.display = 'none';
            el.innerHTML = '<div style="color:#ffd54f;">腰包（按 4 / 5 / 6 拿到手上）</div>' +
                bag.map(function (it, n) {
                    return '<div>' + (n + 4) + '、' + (it ? it.n + '　重:' + itemWeight(it) : '<span style="color:#888;">空</span>') + '</div>';
                }).join('');
            el.classList.remove('hidden');
        }

        function selectSlot(i) { if (i > 2) return; gState.selectedSlot = i; let activeItem = gState.inv[i]; if (activeItem && activeItem.type === 'med') actionTarget = 'med'; else if (activeItem && activeItem.type === 'time_stop') actionTarget = 'time_stop'; else actionTarget = null; updateHUD(); }

        function clickSubmit() {
            let cf = Math.floor(camera.position.y / TILE);
            let cx = Math.floor((camera.position.x + TILE / 2) / TILE), cz = Math.floor((camera.position.z + TILE / 2) / TILE);
            if (cf !== 0 || cx !== 1 || cz !== 1) return;
            submitLoot();
        }

        const HUNT_AI_CHEST_SHARE = 0.35;   // AI 全队最多开走这么大比例的箱子
        const HUNT_AI_PROGRESS_CAP = 0.5;   // AI 最多帮你顶掉撤离目标的这么多
        const HUNT_AI_SPEED = 26;      // AI 探图移速
        const HUNT_AI_OPEN_TIME = 2.5; // AI 开一个箱子要几秒
        const HUNT_AI_REACH = 9;       // 走到多近算到箱子跟前

        function huntRefreshSubmitUI() {
            let el = document.getElementById('submit-progress'); if (!el) return;
            let extra = gState.aiSubmitted > 0 ? `（队友 ${gState.aiSubmitted}）` : '';
            el.innerText = `上交进度: ${gState.totalSubmitted} / ${gState.extractTarget}${extra}`;
            if (gState.totalSubmitted >= gState.extractTarget) {
                el.style.color = '#5cb85c';
                let b = document.getElementById('btn-extract'); if (b) b.classList.remove('hidden');
            }
        }

        function huntAiCount() {
            return entities.filter(function (e) {
                return e.userData.type === 'ai' && !e.userData.isRealPlayer && e.userData.hp > 0;
            }).length;
        }

        // 补齐的 AI 不再凭空刷进度 —— 他们真的在图里跑，真的去开箱子。
        // 箱子只有那么多，他们开走一个你就少一个：这就是补齐的代价。
        // 用 floor 不用 round：AI 站在桌面上 y=13.5，round 会把它算成二楼
        function huntFloorOf(y) { return Math.max(0, Math.min(2, Math.floor(y / TILE))); }

        function huntCellOf(v) {
            return { x: Math.floor((v.x + TILE / 2) / TILE), z: Math.floor((v.z + TILE / 2) / TILE) };
        }

        // 单层 BFS。宝箱都藏在死角，直线走必卡墙，所以 AI 得真的会寻路。
        function huntBfsPath(fl, from, to) {
            if (!maze[fl] || !maze[fl][to.z] || !maze[fl][to.z][to.x]) return null;
            let ok = function (x, z) {
                let c = maze[fl][z][x];
                if (!c) return false;
                if (x === to.x && z === to.z) return c.type !== 1;   // 终点只要不是墙
                return c.type === 0 || c.type === 2;                 // 平地和桌子，台阶不算
            };
            let prev = {}, seen = {}, q = [from];
            seen[from.x + ',' + from.z] = 1;
            let found = false;
            while (q.length) {
                let c = q.shift();
                if (c.x === to.x && c.z === to.z) { found = true; break; }
                let nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (let i = 0; i < nb.length; i++) {
                    let nx = c.x + nb[i][0], nz = c.z + nb[i][1];
                    if (nx < 0 || nz < 0 || nx >= mSize || nz >= mSize) continue;
                    if (!ok(nx, nz)) continue;
                    let k = nx + ',' + nz;
                    if (seen[k]) continue;
                    seen[k] = 1; prev[k] = c; q.push({ x: nx, z: nz });
                }
            }
            if (!found) return null;
            let path = [], cur = to;
            while (!(cur.x === from.x && cur.z === from.z)) {
                path.push(cur);
                cur = prev[cur.x + ',' + cur.z];
                if (!cur) return null;
            }
            return path.reverse();
        }

        // 去别层的箱子：先找本层通往那个方向的楼梯格
        function huntStairCell(fl, up) {
            let base = up ? fl : fl - 1;
            let out = [];
            if (!maze[fl]) return out;
            for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) {
                let c = maze[fl][z][x];
                if (c && c.type === 3 && c.stair && c.stair.base === base) out.push({ x: x, z: z });
            }
            return out;
        }

        // 按距离依次试，挑第一个真的有路可走的箱子；试不通的记进黑名单
        function huntAiQuota() {
            if (HUNT_TEST_AI_NOLOOT) return 0;   // 测试：箱子全留给你
            return Math.max(1, Math.round(chests.length * HUNT_AI_CHEST_SHARE));
        }

        function huntAiPlan(entity, meta, me, myFloor) {
            if ((gState.aiChestsTaken || 0) >= huntAiQuota()) return null;
            let list = [];
            chests.forEach(function (c, i) {
                if (c.userData.cid === undefined) c.userData.cid = i;
                if (c.userData.opened || c.userData.hidden) return;
                if (meta.skip[c.userData.cid]) return;
                if (c.userData.claimedBy && c.userData.claimedBy !== meta.name) return;
                list.push(c);
            });
            list.sort(function (a, b) {
                return entity.position.distanceTo(a.position) - entity.position.distanceTo(b.position);
            });
            // 第一轮：只看本层
            for (let i = 0; i < list.length; i++) {
                let c = list[i];
                if (huntFloorOf(c.position.y) !== myFloor) continue;
                let pth = huntBfsPath(myFloor, me, huntCellOf(c.position));
                if (!pth) { meta.skip[c.userData.cid] = 1; continue; }
                return { chest: c, path: pth, stair: null };
            }
            // 第二轮：本层搜干净了才上下楼。刚换完层的几秒内不许再换，防止在楼梯上反复横跳。
            if ((meta.floorLock || 0) > 0) return null;
            for (let i = 0; i < list.length; i++) {
                let c = list[i];
                let cf = huntFloorOf(c.position.y);
                if (cf === myFloor) continue;
                let cands = huntStairCell(myFloor, cf > myFloor);
                for (let j = 0; j < cands.length; j++) {
                    let pth = huntBfsPath(myFloor, me, cands[j]);
                    if (pth) return { chest: c, path: pth.length ? pth : [cands[j]], stair: cands[j] };
                }
                meta.skip[c.userData.cid] = 1;
            }
            return null;
        }

        const HUNT_LINES = {
            chest: ['开到箱子了，分你一份', '这箱子东西还不错'],
            down: ['你倒下了，我马上到', '别急，这就来救你'],
            revive: ['先把你拉起来', '扶稳了啊，起来']
        };
        function huntAiDispName(meta) { return meta.name && meta.name.indexOf('_AI_1') !== -1 ? '队友1' : '队友2'; }

        function huntAiLootTick(entity, dt) {
            let meta = entity.userData;
            let myFloor = huntFloorOf(entity.position.y);

            if (meta.openTimer > 0) {
                meta.openTimer -= dt;
                if (meta.openTimer <= 0 && meta.chest && !meta.chest.userData.opened) {
                    let c = meta.chest;
                    c.userData.opened = true; c.material.color.setHex(0x1a1a1a);
                    // AI 开了也告诉别人（复用 CHEST_OPENED），不然别人那边这个箱子还能再开一次，大金就会超过上限
                    bc.postMessage({ type: 'CHEST_OPENED', target: '*', cx: Math.floor(c.position.x / TILE), cz: Math.floor(c.position.z / TILE), cf: Math.floor(c.position.y / TILE) });
                    gState.aiChestsTaken = (gState.aiChestsTaken || 0) + 1;
                    let loot = huntChestLoot(c);
                    if (loot) {
                        let cap = Math.floor(gState.extractTarget * HUNT_AI_PROGRESS_CAP);
                        let add = Math.min(loot.v, Math.max(0, cap - (gState.aiSubmitted || 0)));
                        gState.totalSubmitted += add;
                        gState.aiSubmitted = (gState.aiSubmitted || 0) + add;
                        huntRefreshSubmitUI();
                        aiSay(meta, huntAiDispName(meta), 'chest', HUNT_LINES.chest);
                    }
                    meta.chest = null; meta.path = null;
                }
                return true;
            }

            let me = huntCellOf(entity.position);
            if (!meta.skip) meta.skip = {};
            meta.skipAge = (meta.skipAge || 0) + dt;
            if (meta.skipAge > 20) { meta.skip = {}; meta.skipAge = 0; }
            if (meta.floorLock > 0) meta.floorLock -= dt;

            if (meta.chest && (meta.chest.userData.opened || meta.chest.userData.claimedBy !== meta.name)) {
                meta.chest = null; meta.path = null; meta.stairGoal = null;
            }

            // 目标 + 路线一起定。迷宫里有靠切断做出来的「必须绕层才能到」的区域，
            // 所以最近的箱子经常根本走不过去 —— 走不通就拉黑，换下一个，
            // 不然 AI 会死盯着一个够不着的箱子原地打转。
            if (!meta.chest || !meta.path || meta.pathFloor !== myFloor) {
                let plan = huntAiPlan(entity, meta, me, myFloor);
                if (!plan) { meta.chest = null; meta.path = null; return false; }
                if (meta.chest && meta.chest !== plan.chest) meta.chest.userData.claimedBy = null;
                plan.chest.userData.claimedBy = meta.name;
                meta.chest = plan.chest; meta.path = plan.path;
                meta.pathFloor = myFloor; meta.stairGoal = plan.stair;
            }

            let chestFloor = huntFloorOf(meta.chest.position.y);
            if (chestFloor === myFloor && entity.position.distanceTo(meta.chest.position) <= HUNT_AI_REACH) {
                meta.openTimer = HUNT_AI_OPEN_TIME; return true;
            }
            if (!meta.path.length) { meta.path = null; meta.skip[meta.chest.userData.cid] = 1; return true; }

            // 到楼梯口就换层。台阶格半截高度会被 checkCol 拦住，等不到「走进那一格」。
            if (meta.stairGoal) {
                let sd = Math.hypot(meta.stairGoal.x * TILE - entity.position.x, meta.stairGoal.z * TILE - entity.position.z);
                if (sd < 16) {
                    let nf = chestFloor > myFloor ? myFloor + 1 : myFloor - 1;
                    entity.position.x = meta.stairGoal.x * TILE;
                    entity.position.z = meta.stairGoal.z * TILE;
                    entity.position.y = nf * TILE + 4.5;
                    meta.stairGoal = null; meta.path = null; meta.skip = {}; meta.floorLock = 4;
                    return true;
                }
            }

            let wp = meta.path[0];
            let cellAt = function (cx, cz) {
                return (maze[myFloor] && maze[myFloor][cz] && maze[myFloor][cz][cx]) || null;
            };
            let here = cellAt(me.x, me.z), next = cellAt(wp.x, wp.z);
            let onTable = (here && here.type === 2) || (next && next.type === 2);
            entity.position.y = myFloor * TILE + (onTable ? 13.5 : 4.5);

            let dx = wp.x * TILE - entity.position.x, dz = wp.z * TILE - entity.position.z;
            let dist = Math.hypot(dx, dz);
            if (dist < 4) { meta.path.shift(); return true; }

            let before = entity.position.x + entity.position.z;
            moveWithCollision(entity, (dx / dist) * HUNT_AI_SPEED * dt, (dz / dist) * HUNT_AI_SPEED * dt);
            // 卡住检测：连续几秒一步没挪，说明这条路走不通，拉黑目标重新规划
            if (Math.abs(entity.position.x + entity.position.z - before) < 0.01) {
                meta.stuck = (meta.stuck || 0) + dt;
                if (meta.stuck > 1.5) {
                    meta.stuck = 0;
                    if (meta.chest) { meta.skip[meta.chest.userData.cid] = 1; meta.chest.userData.claimedBy = null; }
                    meta.chest = null; meta.path = null; meta.stairGoal = null;
                }
            } else meta.stuck = 0;
            return true;
        }

        function submitLoot() {
            let submittedNow = 0, cashNow = 0;
            if (!gState.submittedItems) gState.submittedItems = [];
            // 背包和身上腰包里的宝物一起上交（H14）
            carriedSlots().forEach(function (sl) {
                let item = sl[0][sl[1]];
                if (item && !item.isShop) {
                    nightTreasureEgg(item.n);

                    submittedNow += item.v; cashNow += item.v;
                    // 上交只算进度，不给钱（H4）：东西先寄存起来，撤离成功就一起进仓库，卖掉才有钱。
                    // 没撤出去的话一起没收。
                    gState.submittedItems.push(item);
                    sl[0][sl[1]] = null;
                }
            });

            gState.totalSubmitted += submittedNow;
            if (submittedNow > 0) tutEvent('submit');
            gState.runCash = (gState.runCash || 0) + cashNow;   // 只给本局任务「上交满 $30000」计数
            huntRefreshSubmitUI();

            tidyInv(); updateHUD(); saveProgress();
            return submittedNow;
        }

        function completeExtraction(text) {
            if (gState.tutorial) { tutEvent('extract'); return; }   // T0：教程里的撤离不结算、不进仓库
            // huntDiffPlayed 不在这清零了——进图那一刻（startGameMap）已经处理过。
            gState.matchHistory.push(true); if (gState.matchHistory.length > 10) gState.matchHistory.shift();

            gState.inv.forEach(function (i) { if (i) nightTreasureEgg(i.n); });

            tidyGarage();
            // 背上的宝物 + 这一局上交过的，搬进仓库；商店道具（鱼叉、医疗包、腰包、徽章……）留在背包，下局接着用（H9）
            // 腰包里的宝物也进仓库，工具留在腰包里（H14）
            let carry = [];
            carriedSlots().forEach(function (sl) { let it = sl[0][sl[1]]; if (it && !it.isShop) { carry.push(it); sl[0][sl[1]] = null; } });
            carry = carry.concat(gState.submittedItems || []);
            gState.submittedItems = [];
            carry.forEach(function (it) {
                let emptyG = gState.garage.findIndex(function (g) { return g === null; });
                if (emptyG !== -1) gState.garage[emptyG] = it;
            });
            saveProgress(); finishGame(true, text);
        }

        function clickExtract() {
            if (gState.totalSubmitted >= gState.extractTarget) { completeExtraction("撤离成功"); }
        }

        function playerAnchor() { return (gState.isDead && gState.deathPos) ? gState.deathPos : camera.position; }

        function reviveTargets() { return entities.filter(function (e) { return e.userData.type === 'ai' && !e.userData.isRealPlayer && e.userData.hasRev; }); }

        function liveHumanTeammates() {
            return gState.team.filter(function (m) {
                return !m.isAI && m.id !== gState.id && gState.peerState[m.id] !== 'down' && gState.peerState[m.id] !== 'left';
            });
        }

        function updateDeathWaitStatus() {
            let el = document.getElementById('death-wait-status'); if (!el) return;
            let medics = reviveTargets().length; let humans = liveHumanTeammates().length;
            if (medics > 0) el.innerText = `还有 ${medics} 位队友能救你。选择等待可以继续这一局，期间可以观战队友。`;
            else if (humans > 0) el.innerText = `没有队友能救你了，但队伍还有人在场。你可以留下观战，或直接离开结算。`;
            else el.innerText = `全队已经没人能行动了，本局即将结束。`;
        }

        function showDeathWaitUI() {
            document.getElementById('death-wait-page').classList.remove('hidden');
            document.getElementById('spectate-bar').classList.add('hidden');
            updateDeathWaitStatus();
        }

        function chooseWait() {
            document.getElementById('death-wait-page').classList.add('hidden');
            document.getElementById('spectate-bar').classList.remove('hidden');
            gState.spectateIdx = -1; applySpectate();
        }

        // 寻宝队活着的时候原来没有任何退出方式，只能等死了在死亡页点离开，或者硬撑到撤离。
        // 这里就是"原地放弃"：跟死亡后离开走同一套——物资散落、本局已上交的没收。
        function huntQuitAsk() {
            if (!isPlaying || gState.isDead || gState.hasLeft) return;
            if (document.pointerLockElement) document.exitPointerLock();
            showSysModal('离开本局？', '算撤离失败：背包里的东西全丢（腰包、徽章也是），这局上交的也没收。' +
                (liveHumanTeammates().length ? '<br>你的位置交给 AI。' : ''), [
                { label: '离开', color: '#d9534f', onClick: function () { if (!isPlaying || gState.isDead) return; gState.leavingAlive = true; triggerAgentDeath(); chooseLeave(); } },
                { label: '继续玩' }
            ]);
        }

        function chooseLeave() {
            if (gState.tutorial) { tutLeave(false); return; }
            gState.hasLeft = true; gState.spectating = null;
            document.getElementById('death-wait-page').classList.add('hidden');
            document.getElementById('spectate-bar').classList.add('hidden');
            bc.postMessage({ type: 'PLAYER_LEFT', sender: gState.id, target: '*', alive: !!gState.leavingAlive });
            let alive = gState.leavingAlive; gState.leavingAlive = false;
            gState.quitNoPay = !!alive;   // 活着中途走的不给猫盾币
            finishGame(false, alive && liveHumanTeammates().length ? "你中途离开了本局，携带的物资散落在地，你的位置交给 AI 队友接着打。" : "你选择离开本局，携带的物资散落在地。");
        }

        // 寻宝队里真人队友的那个身体，原来只是跟着他的 POS_SYNC 走；他活着离开或者掉线了，
        // 身体就原地僵住，还一直被当成"真人"（不会救你、不会搜刮）。改成交给 AI：
        // 每台机器的 AI 队友本来就是各自本地跑的，把 isRealPlayer 关掉，下一帧就按 AI 队友的逻辑动起来。
        function huntPeerToAi(id, why) {
            if (!entities) return;
            let e = entities.find(function (x) { return x.userData.type === 'ai' && x.userData.name === id && x.userData.isRealPlayer; });
            if (!e) return;
            e.userData.isRealPlayer = false; e.userData.aiTakeover = true;
            e.userData.path = null; e.userData.chest = null; e.userData.openTimer = 0; e.userData.stuck = 0;
            if (e.userData.hp <= 0) e.userData.hp = 100;
            chatPush('系统', dispNameText(id) + why + '，AI 接管了他的位置', false);
            updateDeathWaitStatus();
        }
        const HUNT_DROP_MS = 6000;
        setInterval(function () {
            if (!isPlaying || !entities) return;
            let now = performance.now();
            entities.forEach(function (e) {
                let u = e.userData;
                if (u.type !== 'ai' || !u.isRealPlayer || !u.lastSync) return;
                let st = gState.peerState[u.name];
                if (st === 'down' || st === 'left') return;   // 倒地/已离开的不算掉线
                if (now - u.lastSync > HUNT_DROP_MS) huntPeerToAi(u.name, ' 掉线了');
            });
        }, 1000);

        function spectateTargets() { return entities.filter(function (e) { return e.userData.type === 'ai' && e.userData.hp > 0; }); }

        function cycleSpectate(dir) {
            let list = spectateTargets();
            if (list.length === 0) { gState.spectateIdx = -1; applySpectate(); return; }
            let next = gState.spectateIdx + dir;
            if (next < -1) next = list.length - 1;
            if (next >= list.length) next = -1;
            gState.spectateIdx = next; applySpectate();
        }

        function applySpectate() {
            let list = spectateTargets();
            gState.spectating = (gState.spectateIdx >= 0 && gState.spectateIdx < list.length) ? list[gState.spectateIdx] : null;
            let label = document.getElementById('spectate-target');
            if (label) label.innerText = gState.spectating ? dispNameText(gState.spectating.userData.name) : '自己（原地）';
        }

        function hideDeathUI() {
            document.getElementById('death-wait-page').classList.add('hidden');
            document.getElementById('spectate-bar').classList.add('hidden');
        }

        function checkRunAutoEnd() {
            if (!isPlaying || !gState.isDead || gState.hasLeft) return;
            let teamAlive = reviveTargets().length > 0 || liveHumanTeammates().length > 0;
            // 你倒下了，但队伍把上交进度打满了 —— 他们带着战利品撤了。
            // 你上交过的东西跟着一起出去，身上的那些早在倒地时就掉光了。
            if (teamAlive && gState.totalSubmitted >= gState.extractTarget) {
                teamExtractWithoutYou();
                return;
            }
            if (!teamAlive) {
                finishGame(false, "全队已阵亡或离开，本局结束。");
            }
        }

        function teamExtractWithoutYou() {
            gState.matchHistory.push(false); if (gState.matchHistory.length > 10) gState.matchHistory.shift();
            huntSafeAddFail();   // S4：你倒下了，这算死亡一次
            tidyGarage();
            let saved = (gState.submittedItems || []).slice();
            gState.submittedItems = [];
            saved.forEach(function (it) {
                let g = gState.garage.findIndex(function (q) { return q === null; });
                if (g !== -1) gState.garage[g] = it;
            });
            // 身上的不算数：倒地那一刻已经散落在地图上了
            carriedSlots().forEach(function (sl) { let it = sl[0][sl[1]]; if (it && !it.isShop) sl[0][sl[1]] = null; });
            expandInventory(); saveProgress();
            finishGame(true, '你倒下了，但队友完成了撤离。你上交过的 ' + saved.length +
                ' 件东西保住了，身上带的全丢了。');
        }

        // 没撤出去：这局上交过的东西全部没收，返回没收了几件。上交本来就不给钱，所以不扣钱（H4）
        function forfeitRun() {
            let confiscated = (gState.submittedItems || []).length;
            gState.submittedItems = [];
            gState.matchHistory.push(false); if (gState.matchHistory.length > 10) gState.matchHistory.shift();
            if (!gState.quitNoPay) huntSafeAddFail();   // S4：死了（倒下后离开 / 全队阵亡）算一次；活着中途退出（quitNoPay）不加
            // 撤离失败：背包里剩下的全部丢掉，腰包和徽章也一样（H5）
            gState.inv = new Array(INV_BASE).fill(null); expandInventory();

            if (confiscated > 0 || gState.totalSubmitted > 0) {
                gState.totalSubmitted = 0; gState.runCash = 0;
                document.getElementById('submit-progress').innerText = `上交进度: 0 / ${gState.extractTarget}`;
                document.getElementById('submit-progress').style.color = '#ffeb3b';
                document.getElementById('btn-extract').classList.add('hidden');
            }
            return confiscated;
        }

        function triggerAgentDeath() {
            if (gState.isDead) return;
            if (!gState.leavingAlive && huntGodCatSave()) return;   // H22：带着猫神护身符，这次不死
            gState.isDead = true;

            gState.deathPos = camera.position.clone(); gState.spectating = null; gState.spectateIdx = -1;

            gState.inv.forEach(function (d, idx) {
                if (!d || d.type === 'backpack_ext') return;
                let box = huntGroundMesh(d, 2);
                box.position.copy(camera.position).add(new THREE.Vector3((Math.random() - 0.5) * 12, -4, (Math.random() - 0.5) * 12));
                box.userData = { ...d, isItem: true }; huntItemGlow(box); scene.add(box); groundItems.push(box); gState.inv[idx] = null;
            });

            updateHUD(); saveProgress(); if (document.pointerLockElement) document.exitPointerLock();
            // 活着主动离开（huntQuitAsk）不算倒地：队友那边马上会收到 PLAYER_LEFT(alive) 把你交给 AI
            if (!gState.leavingAlive) bc.postMessage({ type: 'PLAYER_DOWN', sender: gState.id, target: '*' });
            showDeathWaitUI();
        }

        function returnToGarageFromOver() { isPlaying = false; bgmStop(); if (document.pointerLockElement) document.exitPointerLock(); document.getElementById('game-over').classList.add('hidden'); document.getElementById('ui-layer').classList.add('hidden'); nav('screen-garage'); initGarage(); }

        setInterval(function () {
            if (isPlaying && !gState.isDead) {
                let cf = Math.floor(camera.position.y / TILE);
                let cx = Math.floor((camera.position.x + TILE / 2) / TILE), cz = Math.floor((camera.position.z + TILE / 2) / TILE);
                let insideSafeZone = (cf === 0 && cx === 1 && cz === 1); document.getElementById('submit-btn-container').style.display = insideSafeZone ? 'flex' : 'none';
            } else if (isPlaying && gState.isDead) {
                document.getElementById('submit-btn-container').style.display = 'none';
                updateDeathWaitStatus(); applySpectate(); checkRunAutoEnd();
            }
        }, 800);

        function finishGame(won, text) {
            if (!isPlaying) return;
            isPlaying = false; if (document.pointerLockElement) document.exitPointerLock();

            gState.huntRunActive = false;
            if (!won) { let lost = forfeitRun(); text += lost > 0 ? '这局上交的 ' + lost + ' 件东西没收了，背包里的也全丢了。' : '背包里的东西全丢了。'; }
            // 活着撤离也告诉队友一声，不然他们那边你的身体停止同步 6 秒后会被当成"掉线"
            else if (!gState.isDead) bc.postMessage({ type: 'PLAYER_LEFT', sender: gState.id, target: '*', alive: true, extracted: true });
            if (!gState.quitNoPay) { coinsSettle('hunt', won); text += '\n' + coinsBreakText(); }
            gState.quitNoPay = false;
            hideDeathUI(); gState.spectating = null;

            document.getElementById('ui-layer').classList.add('hidden'); const goView = document.getElementById('game-over'); goView.classList.remove('hidden');
            document.getElementById('go-title').innerText = won ? "撤离成功" : "撤离失败"; document.getElementById('go-title').style.color = won ? "#5cb85c" : "#d9534f"; document.getElementById('go-desc').innerText = text;
            saveProgress();
            nightFlushEggs();
        }

        function setupJoy(z, k, d) {
            const zone = document.getElementById(z), knob = document.getElementById(k);
            if (!zone || !knob) return; let rect, id = null;

            zone.addEventListener('touchstart', function (e) { e.preventDefault(); rect = zone.getBoundingClientRect(); let t = e.changedTouches[0]; id = t.identifier; updateJoy(t); }, { passive: false });
            zone.addEventListener('touchmove', function (e) { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === id) updateJoy(e.changedTouches[i]); } }, { passive: false });
            let end = function (e) { for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === id) { id = null; d.x = 0; d.y = 0; knob.style.transform = 'translate(0,0)'; } } };
            zone.addEventListener('touchend', end, { passive: false }); zone.addEventListener('touchcancel', end, { passive: false });

            function updateJoy(t) {
                let cx = rect.width / 2, cy = rect.height / 2;
                let x = t.clientX - rect.left - cx, y = t.clientY - rect.top - cy, dist = Math.hypot(x, y);
                let maxD = cx - knob.offsetWidth / 2; if (dist > maxD) { x = (x / dist) * maxD; y = (y / dist) * maxD; }
                knob.style.transform = 'translate(' + x + 'px, ' + y + 'px)'; d.x = x / maxD; d.y = y / maxD;
            }
        }
        function setupBtn(id, act) {
            let btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', function (e) { e.preventDefault(); touchBtn[act] = true; }, { passive: false });
            btn.addEventListener('touchend', function (e) { e.preventDefault(); touchBtn[act] = false; }, { passive: false });
            btn.addEventListener('touchcancel', function (e) { e.preventDefault(); touchBtn[act] = false; }, { passive: false });
        }

        // H16：抽奖机。投金色：5% 大金 / 25% 销毁 / 15% 变紫 / 55% 变金；投紫色：15% 变金 / 60% 变紫 / 25% 销毁。
        // 大金走 huntTakeBig(huntBigPool('safe'))（占这张图的大金上限），奖励都从 itemPool 里拿，不手写。
        // 抽奖机收什么：背包里能拿在手上的东西都收（以前只认紫色池、金色池里的名字，药剂、合成物、商店道具都被拒）。
        // 紫色池、金色池里的按自己的池子，宝石算金色；别的（药剂、合成物、商店道具、大金……）按格子底色 slotTier：紫/蓝 → 投紫色，金/红 → 投金色。
        // 例外：里面有东西的腰包不收（clickLottery 里提示"先清空腰包"），空腰包照常收
        function huntLotteryKind(it) {
            if (!it) return null;
            if (itemPool.purple.some(function (p) { return p.n === it.n; })) return 'purple';
            if (itemPool.gold.some(function (g) { return g.n === it.n; }) || it.type === 'gem') return 'gold';
            let t = slotTier(it);
            return (t === 'gold' || t === 'red') ? 'gold' : 'purple';
        }
        function huntLotteryTable(kind) {
            if (kind === 'gold') return [['big', 0.05], ['destroy', 0.25], ['purple', 0.15], ['gold', 0.55]];
            return [['gold', 0.15], ['purple', 0.60], ['destroy', 0.25]];
        }
        function huntLotteryPick(kind, r) {
            let acc = 0, t = huntLotteryTable(kind);
            for (let i = 0; i < t.length; i++) { acc += t[i][1]; if (r < acc) return t[i][0]; }
            return t[t.length - 1][0];
        }
        function huntLotteryReward(res) {
            let pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
            if (res === 'big') return huntTakeBig(huntBigPool('safe'), pick);
            if (res === 'gold') return pick(itemPool.gold);
            if (res === 'purple') return pick(itemPool.purple);
            return null;
        }
        function clickLottery() {
            let slot = gState.selectedSlot; let item = gState.inv[slot];
            if (!item) { showSysModal('提示', '请先在快捷栏选择要用于抽奖的物品', [{ label: '确定' }]); return; }

            // 腰包里还有东西不让投（不然里面的东西会跟着一起没了），东西不动；空腰包可以投
            if (isPouch(item) && pouchBag(item).some(function (q) { return q; })) { showSysModal('提示', '先清空腰包', [{ label: '好' }]); return; }
            let kind = huntLotteryKind(item);
            if (openPouch === item) openPouch = null;
            gState.inv[slot] = null; updateHUD();
            let res = huntLotteryPick(kind, Math.random());
            // 大金要先问队长（H16b）；别的结果马上有
            if (res === 'big') huntTakeBigAsync(huntBigPool('safe'), function (a) { return a[Math.floor(Math.random() * a.length)]; }, huntLotteryShow);
            else huntLotteryShow(huntLotteryReward(res));
        }
        function huntLotteryShow(reward) {
            if (reward) {
                let itemMesh = huntGroundMesh(reward);
                let launchDir = new THREE.Vector3(); camera.getWorldDirection(launchDir); itemMesh.position.copy(camera.position).add(launchDir.clone().multiplyScalar(4)); itemMesh.userData = { ...reward, isItem: true, vel: launchDir.multiplyScalar(60), gravityActive: true }; huntItemGlow(itemMesh); scene.add(itemMesh); groundItems.push(itemMesh);
                showSysModal("抽奖结果", `抽到了：${reward.n}`, [{ label: "好" }]);
            } else { showSysModal('抽奖结果', '没抽中，东西没了', [{ label: '好' }]); }
            saveProgress();
        }

        setupJoy('joystick-left', 'knob-left', tMove);
        (function () {
            let ib = document.getElementById('interact-btn');
            if (ib) { ib.addEventListener('touchstart', function () { huntHold.touch = true; }, { passive: true }); ['touchend', 'touchcancel'].forEach(function (t) { ib.addEventListener(t, function () { huntHold.touch = false; }, { passive: true }); }); }
        })();
        (function () {   // R3：跑键——点一下切换跑/走（触屏用 touchstart，鼠标/触屏模拟用 click，两边不会重复触发）
            let rb = document.getElementById('run-btn'); if (!rb) return;
            rb.addEventListener('touchstart', function (e) { e.preventDefault(); padRunSet(!padRunToggle); }, { passive: false });
            rb.addEventListener('click', function () { padRunSet(!padRunToggle); });
        })();
        setupBtn('jump-btn', 'jump'); setupBtn('interact-btn', 'interact'); setupBtn('ability-btn', 'ability'); setupBtn('skill-btn', 'skill');

        // 平板：惊魂夜和超燃都是靠鼠标左右键 + 键盘触发的，触屏没有这些，
        // 之前完全没接，导致平板上这两个模式点了没反应。直接触发对应函数，
        // 不走 keys/touchBtn 那套轮询 —— 这些函数自己已经做好了状态判断。
        function bindTouchTap(id, fn) {
            let btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
        }

        bindTouchTap('esc-act-btn', function () { touchBtn.interact = true; });
        bindTouchTap('nm-act-btn', function () { touchBtn.nmAct = true; touchBtn.nmHold = true; });
        ['touchend', 'touchcancel'].forEach(function (t) {
            let b = document.getElementById('nm-act-btn');
            if (b) b.addEventListener(t, function () { touchBtn.nmHold = false; }, { passive: true });
        });
        bindTouchTap('night-atk-btn', function () {
            if (!night || night.over || night.spectating) return;
            if (night.side === 'hunter') nightHunterAttack(); else nightInteract();
        });
        bindTouchTap('night-skill2-btn', function () {
            if (!night || night.over || night.spectating) return;
            if (night.side === 'hunter') nightHunterSpear(); else nightSurvivorSkill();
        });
        bindTouchTap('night-space-btn', function () {
            if (!night || night.over || night.spectating) return;
            if (night.side === 'hunter') nightHunterGrab();
            else if (!nightStrugglePress() && !nightDogSlam()) nightCalibPress();
        });
        bindTouchTap('night-e-btn', function () {
            if (!night || night.over || night.spectating) return;
            if (night.side === 'hunter') nightHunterBreak();
        });

        // 躲避球模式下这颗键被专门借去当「跳」，此时 touchBtn.jump 另有用途（接球），
        // 不能被跳跃键顺带带上，不然一按跳就顺手打开接球判定窗口
        bindTouchTap('blaze-jump-btn', function () { if (!(dodge && !dodge.over)) touchBtn.jump = true; });
        bindTouchTap('blaze-jump-btn', function () { touchBtn.dodgeJump = true; });   // 躲避球复用同一颗「跳」键，单独一个标记位
        bindTouchTap('race-jump-btn', function () { touchBtn.jump = true; });
        bindTouchTap('race-dash-btn', function () { touchBtn.ability = true; });
        bindTouchTap('race-skill-btn', function () { touchBtn.interact = true; });
        bindTouchTap('race-item-btn', function () { touchBtn.item = true; });
        bindTouchTap('blaze-atk-btn', function () { if (blaze && !blaze.over) blazeBasicAttack(blaze.me); });
        (function () {
            // 躲避球复用「攻」这颗键当「投」——手空点一下捡球，拿着球点一下放下，
            // 拿着球按住瞄准松手才真的丢出去，跟鼠标左键一套逻辑
            let b = document.getElementById('blaze-atk-btn'); if (!b) return;
            let downAt = 0;
            let on = function (e) {
                if (e) e.preventDefault();
                if (dodge && !dodge.over && !dodge.me.out) { dodge.me.aiming = true; downAt = performance.now(); }
            };
            let off = function () {
                if (dodge && !dodge.over && dodge.me.aiming) {
                    dodge.me.aiming = false;
                    let quick = performance.now() - downAt < 220;
                    if (quick) { if (dodge.me.holding) dodgeDoDrop(dodge.me.idx); else dodgePickupNearby(dodge.me); }
                    else if (dodge.me.holding) dodgeTryThrow(dodge.me);
                }
            };
            b.addEventListener('touchstart', on, { passive: false });
            b.addEventListener('touchend', off);
            b.addEventListener('touchcancel', off);
        })();
        (function () {
            // 平板的「攻」按钮：按着不放也连打
            let b = document.getElementById('blaze-atk-btn'); if (!b) return;
            let on = function (e) { if (e) e.preventDefault(); if (blaze && !blaze.over) blaze.atkHold = true; };
            let off = function () { if (blaze) blaze.atkHold = false; };
            b.addEventListener('touchstart', on, { passive: false });
            b.addEventListener('touchend', off);
            b.addEventListener('touchcancel', off);
            b.addEventListener('mousedown', on);
            window.addEventListener('mouseup', off);
        })();
        bindTouchTap('blaze-skill1-btn', function () { if (blaze && !blaze.over) blazeSkill1(blaze.me); });
        bindTouchTap('blaze-skill2-btn', function () { if (blaze && !blaze.over) blazeSkill2(blaze.me); });



        // ══════════════ T0 新手教程 ══════════════
        // 新玩家起完名字自动开始（右上角能跳过），设置里能重玩。专门一张小图（TUT_SIZE×TUT_SIZE，只有一个木箱），
        // 没有怪、没有队友、不刷任务，走的是寻宝队同一套移动、开箱、背包、上交、撤离，所以学到的操作跟真打一模一样。
        // 教程里什么都不存、不进经济：背包开始时备份、结束时还原，saveProgress() 在教程里直接返回，
        // 撤离不结算不进仓库；只有做完（第一次）给 TUT_REWARD 个猫盾币。gState.tutDone：false 还没做过 / 'skip' 跳过 / 'done' 做完 / 'old' 老存档。
        const TUT_SIZE = 9, TUT_REWARD = 20, TUT_LOOT_V = 10000;
        const TUT_STEPS = [
            { id: 'ring', text: '走进地上发光的圈', hint: function () { return kTxt('<b>WASD</b> 走路', '用左边的摇杆走路'); } },
            { id: 'mark', text: '转动视角，看向橙色的柱子', hint: function () { return kTxt('移动<b>鼠标</b>转视角', '在屏幕右半边<b>拖动</b>转视角'); } },
            { id: 'table', text: '跳到灰色的桌子上', hint: function () { return kTxt('<b>空格</b> 跳', '点右下角的 <b>跳</b>'); } },
            { id: 'run', text: '跑一小段', hint: function () { return kTxt('按住 <b>Shift</b> 再走', '摇杆推到底就会跑'); } },
            { id: 'chest', text: '走到木箱前，把它打开', hint: function () { return kTxt('准星对着箱子，按 <b>F</b> 或点<b>左键</b>', '走近箱子，点 <b>互动</b>'); } },
            { id: 'pick', text: '把掉出来的东西捡起来', hint: function () { return kTxt('走近，按 <b>F</b> 或点<b>左键</b>', '走近，点 <b>互动</b>'); } },
            { id: 'bag', text: '打开背包看一眼', hint: function () { return kTxt('按 <b>E</b>（再按一次关上）', '点屏幕上的 <b>背包</b>'); } },
            { id: 'submit', text: '回到绿色的出生点，上交', hint: function () { return '站在绿色格子里，点右上角的 <b>上交</b>'; } },
            { id: 'extract', text: '上交够了，点撤离', hint: function () { return '点右上角出现的 <b>撤离</b>'; } }
        ];
        function tutPassed() { return !!gState.tutDone; }
        function tutAutoStart() {
            if (gState.tutDone || /[?&]notut\b/.test(location.search)) return;
            let tries = 0;
            (function go() {
                if (gState.tutDone || gState.tutorial || isPlaying) return;
                if (sysModalVisible() && tries++ < 15) { setTimeout(go, 800); return; }   // 先让"数据重置"之类的提示看完
                tutorialStart();
            })();
        }
        function tutorialStart() {
            if (gState.tutorial || isPlaying) return;
            let k = chatActiveModeKey(); if (k && k !== 'hub') return;   // 只能在大厅里开
            sysModalCloseNormal();
            gState.tutorial = {
                step: 0, runT: 0, ring: null, mark: null, beam: null, tableCell: null,
                back: { inv: JSON.parse(JSON.stringify(gState.inv)), mapDifficulty: gState.mapDifficulty, extractTarget: gState.extractTarget, team: gState.team, selectedSlot: gState.selectedSlot }
            };
            gState.mapDifficulty = 'tutorial'; gState.extractTarget = mapConfigs.tutorial.extr;
            gState.team = [{ id: gState.id, isLeader: true, isReady: true, isAI: false }];
            startGameMap(4242, []);
            let q = document.getElementById('hunt-quit-btn'); if (q) q.style.display = 'none';
            tutPanelRender();
        }
        // 造完图以后：箱子里放练习宝物、摆圈、摆桌子
        function tutSetupMap() {
            let T = gState.tutorial;
            for (let wi = 0; wi < MOB_WAVES_AT.length; wi++) gState['wave' + (wi + 1) + 'Spawned'] = true;   // 没有怪
            gState.monstersSpawned = true;
            if (chests[0]) chests[0].userData.loot = { n: '练习宝物', v: TUT_LOOT_V, w: 1, tex: 'disc', c: 0x9c27b0 };
            gState.extractTarget = TUT_LOOT_V;
            // 从出生点走得到的地面格子，按走多远分
            let key = function (n) { return (n.f * 64 + n.z) * 64 + n.x; }, dist = {}, q = [{ f: 0, x: 1, z: 1 }];
            dist[key(q[0])] = 0;
            for (let h = 0; h < q.length; h++) huntRouteNbrs(q[h]).forEach(function (m) { let k = key(m); if (dist[k] === undefined) { dist[k] = dist[key(q[h])] + 1; q.push(m); } });
            let chestCell = chests[0] ? { x: Math.floor((chests[0].position.x + TILE / 2) / TILE), z: Math.floor((chests[0].position.z + TILE / 2) / TILE) } : null;
            let cells = q.filter(function (n) { return n.f === 0 && huntCellKind(0, n.x, n.z) === 'floor' && !(n.x <= 2 && n.z <= 2) && !(chestCell && n.x === chestCell.x && n.z === chestCell.z); })
                .map(function (n) { return { x: n.x, z: n.z, d: dist[key(n)] }; });
            let near = function (d) { return cells.slice().sort(function (a, b) { return Math.abs(a.d - d) - Math.abs(b.d - d); }); };
            let ringC = near(3)[0] || cells[0];
            let tableC = near(2).filter(function (c) { return !ringC || c.x !== ringC.x || c.z !== ringC.z; })[0];
            T.cells = cells;
            let ring = new THREE.Mesh(new THREE.RingGeometry(4, 6, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
            ring.rotation.x = -Math.PI / 2;
            if (ringC) { ring.position.set(ringC.x * TILE, 0.4, ringC.z * TILE); T.ringC = ringC; }
            mapExtraAdd(ring); T.ring = ring;
            if (tableC) {
                let c = maze[0][tableC.z][tableC.x];
                let tm = new THREE.Mesh(new THREE.BoxGeometry(TILE, 8, TILE), new THREE.MeshLambertMaterial({ map: createProceduralTexture('table', '#7f8c8d', '#95a5a6') }));
                tm.position.set(tableC.x * TILE, 4, tableC.z * TILE);
                mapExtraAdd(tm); walkableMeshes.push(tm);
                c.type = 2; c.table = tm; T.tableCell = tableC;
            }
            let beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
            mapExtraAdd(beam); T.beam = beam;
            tutBeaconFor('ring');
        }
        // 当前这一步该去的地方立一根光柱
        function tutBeaconFor(id) {
            let T = gState.tutorial; if (!T || !T.beam) return;
            let at = null, col = 0x00e5ff;
            if (id === 'ring' && T.ringC) at = { x: T.ringC.x * TILE, z: T.ringC.z * TILE };
            else if (id === 'mark' && T.mark) { at = { x: T.mark.position.x, z: T.mark.position.z }; col = 0xff9800; }
            else if (id === 'table' && T.tableCell) at = { x: T.tableCell.x * TILE, z: T.tableCell.z * TILE };
            else if (id === 'chest' && chests[0]) at = { x: chests[0].position.x, z: chests[0].position.z };
            else if (id === 'pick' && groundItems[0]) at = { x: groundItems[0].position.x, z: groundItems[0].position.z };
            else if (id === 'submit') { at = { x: TILE, z: TILE }; col = 0x66bb6a; }
            T.beam.visible = !!at;
            if (at) { T.beam.position.set(at.x, 35, at.z); T.beam.material.color.setHex(col); }
        }
        // 第 2 步开始时摆橙色柱子：挑一个离玩家几格远、方向跟现在镜头朝向最相反的地面格子，逼着转视角
        function tutSpawnMarker() {
            let T = gState.tutorial, p = camera.position, fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
            let best = null, bestDot = 2;
            (T.cells || []).forEach(function (c) {
                let dx = c.x * TILE - p.x, dz = c.z * TILE - p.z, d = Math.hypot(dx, dz);
                if (d < TILE * 3 || d > TILE * 9) return;
                let dot = (dx * fwd.x + dz * fwd.z) / d;
                if (dot < bestDot) { bestDot = dot; best = c; }
            });
            if (!best) best = { x: 1, z: 1 };
            let g = new THREE.Group();
            let pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 60, 12), new THREE.MeshBasicMaterial({ color: 0xff9800 }));
            pillar.position.y = 30; g.add(pillar);
            let cap = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffc107 }));
            cap.position.y = 64; g.add(cap);
            g.position.set(best.x * TILE, 0, best.z * TILE);
            mapExtraAdd(g); T.mark = g;
        }
        function tutTick(dt) {
            let T = gState.tutorial; if (!T) return;
            let st = TUT_STEPS[T.step]; if (!st) return;
            let p = camera.position, feet = p.y - 9;
            if (T.ring && T.ring.visible) { let s = 1 + 0.12 * Math.sin(performance.now() / 260); T.ring.scale.set(s, s, 1); }
            if (st.id === 'ring') {
                if (T.ringC && Math.hypot(p.x - T.ringC.x * TILE, p.z - T.ringC.z * TILE) < 6 && feet < 4) tutNext();
            } else if (st.id === 'mark') {
                if (T.mark) {
                    let fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
                    let dx = T.mark.position.x - p.x, dz = T.mark.position.z - p.z, d = Math.hypot(dx, dz) || 1;
                    if ((dx * fwd.x + dz * fwd.z) / d > Math.cos(18 * Math.PI / 180)) tutNext();
                }
            } else if (st.id === 'table') {
                let tc = T.tableCell;
                if (!tc || (Math.abs(p.x - tc.x * TILE) < TILE / 2 && Math.abs(p.z - tc.z * TILE) < TILE / 2 && feet >= HUNT_TABLE_H - 0.6)) tutNext();
            } else if (st.id === 'run') {
                if (T.runT >= 1.2) tutNext();
            } else if (st.id === 'pick') {
                tutBeaconFor('pick');
            }
        }
        function tutEvent(name) {
            let T = gState.tutorial; if (!T) return;
            let st = TUT_STEPS[T.step];
            if (st && st.id === name) tutNext();
        }
        function tutNext() {
            let T = gState.tutorial; if (!T) return;
            T.step++;
            if (T.step >= TUT_STEPS.length) { tutLeave(true); return; }
            let id = TUT_STEPS[T.step].id;
            if (id === 'mark') { if (T.ring) T.ring.visible = false; tutSpawnMarker(); }
            if (id === 'table' && T.mark) T.mark.visible = false;
            tutBeaconFor(id);
            blazeFlash('✔ 好，下一步');
            tutPanelRender();
        }
        function tutPanelRender() {
            let T = gState.tutorial, on = !!T;
            ['tut-panel', 'tut-skip'].forEach(function (id) { let e = document.getElementById(id); if (e) e.classList.toggle('hidden', !on); });
            if (!on) return;
            let st = TUT_STEPS[Math.min(T.step, TUT_STEPS.length - 1)];
            document.getElementById('tut-step').innerText = '新手教程　第 ' + (T.step + 1) + ' / ' + TUT_STEPS.length + ' 步';
            document.getElementById('tut-text').innerText = st.text;
            document.getElementById('tut-hint').innerHTML = st.hint();
        }
        // 做完或跳过：还原背包，回大厅。done=true 才算做完（第一次做完给猫盾币）
        function tutLeave(done) {
            let T = gState.tutorial; if (!T) return;
            gState.tutorial = null;
            isPlaying = false; bgmStop(); if (document.pointerLockElement) document.exitPointerLock();
            gState.inv = T.back.inv; gState.mapDifficulty = T.back.mapDifficulty; gState.extractTarget = T.back.extractTarget; gState.team = T.back.team;
            gState.selectedSlot = T.back.selectedSlot || 0;
            gState.totalSubmitted = 0; gState.submittedItems = []; gState.runCash = 0; gState.huntTask = null; gState.huntRunActive = false;
            gState.backpackOpen = false; gState.largeMapOpen = false; gState.hp = 100; gState.isDead = false;
            ['backpack-overlay-page', 'large-map-panel', 'ui-layer', 'game-over'].forEach(function (id) { let e = document.getElementById(id); if (e) e.classList.add('hidden'); });
            let be = document.getElementById('btn-extract'); if (be) be.classList.add('hidden');
            let q = document.getElementById('hunt-quit-btn'); if (q) q.style.display = '';
            clearMazeMeshes(); huntTaskHud();
            let first = gState.tutDone !== 'done';
            gState.tutDone = done ? 'done' : (gState.tutDone || 'skip');
            saveProgress();
            tutPanelRender();
            nav('screen-lobby');
            if (done && first) { coinsAdd('tutorial', TUT_REWARD); }
            if (done) showSysModal('教程做完了', first ? ('得到 ' + TUT_REWARD + ' 个猫盾币。想再看一遍，在设置里点“新手教程”。') : '想再看一遍，在设置里点“新手教程”。', [{ label: '好', color: '#5cb85c' }]);
        }

        // ══════════════ G2 怪物外形 + 怪物图鉴 ══════════════
        // 一个函数造模型（huntMobModel），游戏里和图鉴里共用。模型朝 +z，体型对着原来的碰撞球/圆柱（半径 4.5 左右），碰撞和判定不变：
        // 游戏里的怪本体还是原来那个看不见的球/圆柱（huntMobMesh），模型挂在它下面。
        const HUNT_MOBS = {
            angel: { n: 1, name: '凝视者', hp: 10, speed: 63, dmg: 40, tip: '盯着它，它就不动；别背对它，贴脸用武器打。' },
            puppet: { n: 2, name: '伪装者', hp: 15, speed: 30, dmg: 40, tip: '它在你视野里不会动，背过去才追。看到不对劲的柜子、灯柱，多看两眼再靠近，用武器打。' },
            high: { n: 3, name: '高空者', hp: 10, speed: 25, dmg: 20, tip: '隔着楼层也能打到你，别在楼梯井下面停；它血少，贴上去打。' },
            splitter: { n: 4, name: '分裂者', hp: 10, speed: 20, dmg: 40, tip: '打死会分成两个小的，小的还会再分一次。一只一只来，别被围住。' },
            curser: { n: 5, name: '诅咒之灵', hp: 80, speed: 20, dmg: 0, tip: '血没满时被它看到就中诅咒。先躲开视线，或者带着武器把它打掉；永恒誓言能让它不靠近。' }
        };
        const HUNT_MOB_ORDER = ['angel', 'puppet', 'high', 'splitter', 'curser'];
        // 血量、速度、伤害写成高中低
        function huntMobLevel(kind, v) {
            let hi = { hp: 50, speed: 50, dmg: 40 }[kind], mid = { hp: 12, speed: 25, dmg: 20 }[kind];
            return v >= hi ? '高' : v >= mid ? '中' : '低';
        }
        function huntMobModel(type, opt) {
            opt = opt || {};
            let g = new THREE.Group(); g.userData = { mobType: type, t0: Math.random() * 10 };
            let lam = function (c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})); };
            let bas = function (c, o) { return new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {})); };
            let add = function (geo, mat, x, y, z, parent) { let m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); (parent || g).add(m); return m; };
            let bone = function (a, b, r, mat, parent) {
                let d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
                let m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
                m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); (parent || g).add(m); return m;
            };
            // 毛绒玩具风：圆眼睛带高光、软颜色、小嘴；危险靠颜色和动作，不靠吓人
            let cuteEye = function (x, y, z, r, parent) {
                let e = new THREE.Group(); e.position.set(x, y, z);
                let ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), bas(0x1a1226)); ball.scale.set(1, 1.12, 0.6); e.add(ball);
                let h1 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.34, 12), bas(0xffffff)); h1.position.set(r * 0.28, r * 0.38, r * 0.62); e.add(h1);
                let h2 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 10), bas(0xffffff)); h2.position.set(-r * 0.3, -r * 0.3, r * 0.62); e.add(h2);
                (parent || g).add(e); return e;
            };
            if (type === 'angel') {
                // 凝视者：灰色圆石球，圆疙瘩，正中一只发光的大眼睛（瞳孔大、带高光）
                let stone = new THREE.MeshPhongMaterial({ color: 0x8d959c, flatShading: false, shininess: 4, specular: 0x222222 });
                add(new THREE.IcosahedronGeometry(4.5, 2), stone, 0, 0, 0);
                let lump = new THREE.MeshPhongMaterial({ color: 0x7a838a, shininess: 4, specular: 0x222222 });
                [[-3.3, 2.6, 1.8, 1.0], [3.6, -2.2, 1.4, 0.9], [-1.2, -3.7, 1.9, 0.8], [2.2, 3.4, -1.5, 0.9]].forEach(function (c) { add(new THREE.SphereGeometry(c[3], 12, 10), lump, c[0], c[1], c[2]); });
                let ring = add(new THREE.TorusGeometry(2.75, 0.55, 10, 24), lump, 0, 0.3, 3.45);
                let halo = add(new THREE.CircleGeometry(3.2, 24), bas(0xffe082, { transparent: true, opacity: 0.3, depthWrite: false }), 0, 0.3, 4.1);
                let eye = add(new THREE.SphereGeometry(2.35, 20, 14), bas(0xfffde7), 0, 0.3, 3.1);
                let iris = add(new THREE.CircleGeometry(1.5, 20), bas(0xff9800), 0, 0.3, 5.42);
                let pupil = add(new THREE.CircleGeometry(1.0, 18), bas(0x1a0d0d), 0, 0.3, 5.46);
                add(new THREE.CircleGeometry(0.42, 12), bas(0xffffff), 0.45, 0.85, 5.5);   // 高光
                add(new THREE.CircleGeometry(0.2, 10), bas(0xffffff), -0.4, -0.2, 5.5);
                g.userData.eye = { halo: halo, iris: iris, pupil: pupil };
            } else if (type === 'puppet') {
                // 伪装者：平时像柜子或灯柱，靠近时只冒出一对圆圆的大眼睛，像偷看的小猫
                let variant = opt.variant !== undefined ? opt.variant : Math.floor(Math.random() * 2);
                g.userData.variant = variant;
                let eyes = new THREE.Group(); g.add(eyes);
                let wood = lam(0x7b4a24), wood2 = lam(0x5a3416);
                let peek = function (y, z, r) {
                    [-1, 1].forEach(function (sd) {
                        let e = cuteEye(sd * r * 1.25, y, z - 0.4, r, eyes); e.userData.rest = z - 0.4; e.userData.out = z + 0.5;
                        e.scale.setScalar(0.001);
                    });
                };
                if (variant === 0) {
                    add(new THREE.BoxGeometry(5.2, 9.2, 3.8), wood, 0, -0.1, 0);
                    add(new THREE.BoxGeometry(5.8, 0.7, 4.4), wood2, 0, 4.6, 0);
                    add(new THREE.BoxGeometry(5.6, 0.5, 4.2), wood2, 0, -4.6, 0);
                    add(new THREE.BoxGeometry(0.16, 8.2, 0.2), lam(0x2e1a0a), 0, -0.1, 1.95);   // 门缝
                    add(new THREE.SphereGeometry(0.34, 8, 6), lam(0xffc107), -0.7, 0, 2.05); add(new THREE.SphereGeometry(0.34, 8, 6), lam(0xffc107), 0.7, 0, 2.05);
                    peek(2.0, 1.95, 1.05);
                } else {
                    add(new THREE.CylinderGeometry(1.1, 1.5, 0.9, 10), lam(0x37474f), 0, -4.5, 0);
                    add(new THREE.CylinderGeometry(0.5, 0.7, 9.0, 10), lam(0x546e7a), 0, -0.2, 0);
                    add(new THREE.ConeGeometry(2.1, 1.4, 12), lam(0x37474f), 0, 4.2, 0);
                    add(new THREE.SphereGeometry(1.5, 14, 10), bas(0xffe082), 0, 3.0, 0);   // 灯泡
                    peek(2.55, 1.35, 0.55);
                }
                g.userData.eyes = eyes;
            } else if (type === 'high') {
                // 高空者：紫色球，带蝙蝠翅膀
                add(new THREE.SphereGeometry(4.0, 22, 16), lam(0x8e44ad), 0, 0, 0);
                add(new THREE.SphereGeometry(2.6, 16, 12), lam(0xb57edc), 0, -1.0, 1.9);   // 肚皮
                [-1, 1].forEach(function (s) {
                    add(new THREE.ConeGeometry(0.9, 2.2, 6), lam(0x6c3483), s * 2.5, 4.1, 0.2);   // 耳朵
                    add(new THREE.SphereGeometry(0.85, 10, 8), bas(0xffeb3b), s * 1.45, 1.0, 3.35);
                    add(new THREE.SphereGeometry(0.34, 8, 6), bas(0x1b1b1b), s * 1.45, 1.0, 4.05);
                    add(new THREE.ConeGeometry(0.28, 0.9, 5), bas(0xffffff), s * 0.8, -1.7, 3.6).rotation.x = Math.PI;   // 獠牙
                });
                let wingMat = new THREE.MeshLambertMaterial({ color: 0x4a235a, side: THREE.DoubleSide }), boneMat = lam(0x2d1236);
                let shape = new THREE.Shape();
                [[0, 1], [4.5, 5.6], [11.5, 4.4], [8.6, 1.6], [10.0, -2.0], [6.2, -0.2], [5.4, -3.8], [2.6, -0.9], [0, -1.6]].forEach(function (p, i) { if (i) shape.lineTo(p[0], p[1]); else shape.moveTo(p[0], p[1]); });
                let wings = [];
                [-1, 1].forEach(function (s) {
                    let w = new THREE.Group(); w.position.set(s * 3.4, 1.0, -0.6); w.scale.set(s * 0.85, 0.85, 0.85);
                    w.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), wingMat));
                    bone([0, 1, 0.05], [4.5, 5.6, 0.05], 0.3, boneMat, w); [[11.5, 4.4], [10.0, -2.0], [5.4, -3.8]].forEach(function (t) { bone([4.5, 5.6, 0.05], [t[0], t[1], 0.05], 0.18, boneMat, w); });
                    g.add(w); wings.push(w);
                });
                g.userData.wings = wings;
            } else if (type === 'splitter') {
                // 分裂者：绿色史莱姆（每分裂一次变小：游戏里按碰撞半径缩放整个模型）
                let slime = lam(0x3ddc84, { transparent: true, opacity: 0.86 });
                let blob = add(new THREE.SphereGeometry(4.5, 24, 16), slime, 0, -0.7, 0); blob.scale.set(1, 0.8, 1);
                add(new THREE.SphereGeometry(2.1, 14, 10), lam(0x1b9a56, { transparent: true, opacity: 0.55 }), 0, -1.0, -0.2);
                [[-3.6, -3.3, 1.2], [3.3, -3.4, 1.6], [0.4, -3.7, 3.4], [-1.2, -3.6, -3]].forEach(function (p) { add(new THREE.SphereGeometry(1.0, 8, 6), slime, p[0], p[1], p[2]).scale.y = 0.6; });
                [-1, 1].forEach(function (s) {
                    add(new THREE.SphereGeometry(1.0, 12, 10), bas(0xffffff), s * 1.7, 0.9, 3.95);
                    add(new THREE.SphereGeometry(0.5, 10, 8), bas(0x111111), s * 1.7, 0.8, 4.8);
                });
                let smile = add(new THREE.TorusGeometry(1.35, 0.24, 6, 14, Math.PI), bas(0x0d3b22), 0, -0.2, 4.45); smile.rotation.z = Math.PI;
                let shine = add(new THREE.SphereGeometry(1.0, 10, 8), bas(0xffffff, { transparent: true, opacity: 0.55 }), -2.0, 2.4, 2.5); shine.scale.set(1.3, 0.6, 0.6); shine.rotation.z = 0.5;
                g.userData.blob = blob;
            } else if (type === 'curser') {
                // 诅咒之灵：圆滚滚的深紫小幽灵，大黑眼睛带高光、小“o”嘴、腮红，拖一条越来越细的飘带
                let ghost = lam(0x2f1a58, { transparent: true, opacity: 0.9, emissive: 0x120826, depthWrite: false });
                let profPts = [[0.01, 5.2], [1.8, 5.0], [3.2, 4.0], [3.9, 2.4], [4.0, 0.6], [3.6, -1.3], [2.8, -2.9], [1.6, -3.9], [0.01, -4.2]];
                add(new THREE.LatheGeometry(profPts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), 24), ghost, 0, 0, 0);
                // 脸上的东西贴着脑袋的弧度：按身体在这个高度的半径算出表面位置，往里收 inset，并跟着表面朝向转（侧面看不会伸出轮廓）
                let rAt = function (y) {
                    for (let i = 0; i < profPts.length - 1; i++) {
                        let a = profPts[i], b = profPts[i + 1];
                        if (y <= a[1] && y >= b[1]) return a[0] + (b[0] - a[0]) * (a[1] - y) / (a[1] - b[1]);
                    }
                    return 0.01;
                };
                let hug = function (o, x, y, inset) {
                    let R = rAt(y), slope = (rAt(y + 0.2) - rAt(y - 0.2)) / 0.4, z = Math.sqrt(Math.max(0.01, R * R - x * x));
                    o.rotation.order = 'YXZ'; o.position.set(x, y, z - inset);
                    o.rotation.y = Math.atan2(x, z); o.rotation.x = Math.atan(slope);
                    g.add(o); return o;
                };
                [-1, 1].forEach(function (s) {
                    add(new THREE.SphereGeometry(0.95, 10, 8), ghost, s * 4.0, -0.8, 0.3);   // 小圆手
                    hug(cuteEye(0, 0, 0, 1.0, new THREE.Group()), s * 1.45, 1.7, 0.52);
                    hug(new THREE.Mesh(new THREE.CircleGeometry(0.75, 14), bas(0xff8fb1, { transparent: true, opacity: 0.7, depthWrite: false })), s * 2.3, 0.2, 0.02);   // 腮红
                });
                hug(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 8, 14), bas(0x21122f)), 0, 0.2, 0.12);   // 小“o”嘴
                // 飘带：一条平的带子，越到末端越细，每帧摆一摆
                let N = 14, pos = new Float32Array((N + 1) * 2 * 3), idx = [];
                for (let i = 0; i < N; i++) { let a0 = i * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
                let rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setIndex(idx);
                let ribbon = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x3e2470, emissive: 0x160a2e, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
                ribbon.frustumCulled = false; g.add(ribbon);
                g.userData.ribbon = { geo: rg, n: N };
                huntMobRibbon(g.userData.ribbon, 0, g.userData.t0);
            }
            return g;
        }
        // 飘带的形状：沿着身后（-z）一路往下飘，宽度越来越细到一点；t 是时间，摆起来
        function huntMobRibbon(r, t, t0) {
            let p = r.geo.attributes.position.array, N = r.n;
            for (let i = 0; i <= N; i++) {
                let f = i / N, w = 1.5 * Math.pow(1 - f, 0.9) + 0.02;
                let cx = 2.0 + f * 2.0 + Math.sin(t * 3 - f * 4 + t0) * (0.2 + f * 1.4), cy = -2.8 - f * 2.4 + Math.sin(t * 2 - f * 3 + t0) * 0.4 * f, cz = -1.0 - f * 3.2;
                // 带子的宽度朝上下斜着放，从侧面和正面都看得见
                let wx = w * 0.45, wy = w * 0.9;
                p[i * 6] = cx - wx; p[i * 6 + 1] = cy - wy; p[i * 6 + 2] = cz;
                p[i * 6 + 3] = cx + wx; p[i * 6 + 4] = cy + wy; p[i * 6 + 5] = cz;
            }
            r.geo.attributes.position.needsUpdate = true; r.geo.computeVertexNormals();
        }
        // 每帧动一动：t 是秒，dist 是离玩家多远（伪装者靠近时冒眼睛）。force 给图鉴用：直接指定冒出来多少（0~1）
        function huntMobAnim(model, t, dist, popForce) {
            let u = model.userData, type = u.mobType;
            if (type === 'angel') {
                let k = 0.5 + 0.5 * Math.sin(t * 2.2 + u.t0);
                u.eye.halo.material.opacity = 0.18 + 0.2 * k; u.eye.pupil.scale.setScalar(0.85 + 0.35 * k);
            } else if (type === 'puppet') {
                let pop = popForce !== undefined ? popForce : Math.max(0, Math.min(1, (46 - dist) / 22));
                u.eyes.children.forEach(function (e, i) {
                    let k = Math.max(0, Math.min(1, pop * 1.4 - i * 0.15));
                    e.scale.setScalar(Math.max(0.001, k)); e.position.z = e.userData.rest + (e.userData.out - e.userData.rest) * k;
                });
                model.position.x = pop > 0.6 ? Math.sin(t * 40) * 0.08 : 0;
            } else if (type === 'high') {
                let f = Math.sin(t * 9 + u.t0) * 0.55;
                u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f;
                model.position.y = Math.sin(t * 3 + u.t0) * 0.35;
            } else if (type === 'splitter') {
                let k = Math.sin(t * 4 + u.t0) * 0.07;
                u.blob.scale.set(1 - k, 0.8 + k * 1.4, 1 - k);
            } else if (type === 'curser') {
                huntMobRibbon(u.ribbon, t, u.t0);
                model.position.y = Math.sin(t * 2 + u.t0) * 0.5;
            }
        }
        // 游戏里的怪：本体是原来那个看不见的碰撞球/圆柱（碰撞、射线、位置都不变），长相挂在它下面
        function huntMobMesh(type, opt) {
            opt = opt || {};
            let geo = type === 'puppet' ? new THREE.CylinderGeometry(2, 2, 10) : type === 'curser' ? new THREE.SphereGeometry(5) : new THREE.SphereGeometry(opt.radius || 4.5);
            let root = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
            let model = huntMobModel(type, opt);
            if (opt.radius) model.scale.setScalar(opt.radius / 4.5);
            root.add(model); root.userData.model = model;
            return root;
        }
        // 每帧给场景里所有怪的长相动一动，并转向玩家
        function huntMobsAnim() {
            let t = performance.now() / 1000;
            entities.forEach(function (e) {
                let m = e.userData.model; if (!m) return;
                let d = e.position.distanceTo(camera.position);
                if (d > 220) return;
                huntMobAnim(m, t, d);
                let want = Math.atan2(camera.position.x - e.position.x, camera.position.z - e.position.z);
                let diff = Math.atan2(Math.sin(want - m.rotation.y), Math.cos(want - m.rotation.y));
                m.rotation.y += diff * 0.15;
            });
        }
        // 图鉴解锁：怪第一次出现在视野里（在镜头里、不太远、差不多同一层）
        function huntMobSeenCheck(entity) {
            let tp = entity.userData.type; if (!HUNT_MOBS[tp]) return;
            if (!gState.huntMobSeen) gState.huntMobSeen = {};
            if (gState.huntMobSeen[tp]) return;
            if (entity.position.distanceTo(camera.position) < 130 && Math.abs(entity.position.y - camera.position.y) < TILE * 1.2 && viewFrustum.containsPoint(entity.position)) {
                gState.huntMobSeen[tp] = 1; saveProgress();
                blazeFlash('图鉴新增：' + HUNT_MOBS[tp].name);
            }
        }
        function huntMobKill(entity) {
            let tp = entity.userData.type; if (!HUNT_MOBS[tp]) return;
            if (!gState.huntMobKills) gState.huntMobKills = {};
            gState.huntMobKills[tp] = (gState.huntMobKills[tp] || 0) + 1;
            if (!gState.huntMobSeen) gState.huntMobSeen = {};
            gState.huntMobSeen[tp] = 1;
            saveProgress();
        }

        // ── 图鉴“怪物”页：没见过的是剪影和 ？？？；见过的有转动的 3D 模型、名字、介绍、血量速度伤害（高中低）、怎么对付、打死几只 ──
        let mobDex = null;   // { renderer, scene, camera, models, raf }
        function mobDexRenderer() {
            if (mobDex) return mobDex;
            let r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
            r.setPixelRatio(1); r.setSize(220, 220); r.setClearColor(0x000000, 0);
            let sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, 0.85));
            let dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(8, 14, 12); sc.add(dl);
            let cam = new THREE.PerspectiveCamera(34, 1, 0.5, 200); cam.position.set(0, 3, 24); cam.lookAt(0, 0.5, 0);
            mobDex = { renderer: r, scene: sc, camera: cam, models: {}, raf: 0 };
            return mobDex;
        }
        // 把一种怪画到 2D 画布上。yaw 转角；silhouette 为真画成剪影；bg 给截图用
        function huntMobDraw(canvas, type, yaw, silhouette, t, bg) {
            let D = mobDexRenderer();
            if (!D.models[type]) D.models[type] = huntMobModel(type, { variant: 0 });
            let m = D.models[type]; D.scene.add(m);
            m.rotation.y = yaw; huntMobAnim(m, t || 0, 9999, 0.5 + 0.5 * Math.sin((t || 0) * 1.6));
            D.scene.overrideMaterial = silhouette ? new THREE.MeshBasicMaterial({ color: 0x2b2f3a }) : null;
            D.renderer.setClearColor(bg !== undefined ? bg : 0x000000, bg !== undefined ? 1 : 0);
            D.renderer.setSize(canvas.width, canvas.height, false); D.camera.aspect = canvas.width / canvas.height; D.camera.updateProjectionMatrix();
            D.renderer.render(D.scene, D.camera);
            D.scene.overrideMaterial = null; D.scene.remove(m);
            let c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(D.renderer.domElement, 0, 0, canvas.width, canvas.height);
        }
        function mobDexPage() {
            let seen = gState.huntMobSeen || {}, kills = gState.huntMobKills || {};
            let got = HUNT_MOB_ORDER.filter(function (k) { return seen[k]; }).length;
            let html = '<div style="font-size:12px; color:#888; margin-bottom:8px;">怪物第一次出现在你视野里就会点亮。<br><b>已发现 ' + got + ' / ' + HUNT_MOB_ORDER.length + '</b></div>';
            HUNT_MOB_ORDER.forEach(function (k) {
                let M = HUNT_MOBS[k], on = !!seen[k];
                html += '<div class="mobcard" style="display:flex; gap:10px; margin:6px 0; padding:8px; border-radius:6px; background:' + (on ? '#f3efff' : '#f1f1f1') + ';">' +
                    '<canvas data-mob="' + k + '" width="220" height="220" style="width:96px; height:96px; flex-shrink:0;"></canvas>' +
                    '<div style="flex:1; font-size:12px; line-height:1.6; color:#444;">' +
                    (on ? '<div style="font-size:15px; font-weight:bold; color:#5e35b1;">' + M.name + '</div>' +
                        '<div>' + (HUNT_MOB_INTRO[k] || '') + '</div>' +
                        '<div style="margin:2px 0;"><span class="mobstat">血量 ' + huntMobLevel('hp', M.hp) + '</span> <span class="mobstat">速度 ' + huntMobLevel('speed', M.speed) + '</span> <span class="mobstat">伤害 ' + huntMobLevel('dmg', M.dmg) + '</span></div>' +
                        '<div><b>怎么对付：</b>' + M.tip + '</div>' +
                        '<div style="color:#888;">打死过 ' + (kills[k] || 0) + ' 只</div>'
                        : '<div style="font-size:15px; font-weight:bold; color:#aaa;">？？？</div><div style="color:#aaa;">还没见过。</div>') +
                    '</div></div>';
            });
            return html;
        }
        // 画布每帧转一转
        function mobDexLoop() {
            let body = document.getElementById('book-body');
            if (!body || document.getElementById('book-modal').classList.contains('hidden') || bookTab !== 'mob') { if (mobDex) mobDex.raf = 0; return; }
            let t = performance.now() / 1000, seen = gState.huntMobSeen || {};
            body.querySelectorAll('canvas[data-mob]').forEach(function (cv) { huntMobDraw(cv, cv.getAttribute('data-mob'), 0.5 + t * 0.9, !seen[cv.getAttribute('data-mob')], t); });
            mobDexRenderer().raf = requestAnimationFrame(mobDexLoop);
        }
        function mobDexStart() { let D = mobDexRenderer(); if (!D.raf) D.raf = requestAnimationFrame(mobDexLoop); }
