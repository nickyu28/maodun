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
            else pts.push(new THREE.Vector3(start ? start.x : n0.x * TILE, huntSurfY(n0.f, n0.x, n0.z), start ? start.z : n0.z * TILE));
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
        // 每帧：换了格子就从当前位置重算（走过的就没了）；走到了、换了楼层、找不到路就清掉
        function navRouteTick(force) {
            let to = huntNavRoute.to; if (!to) return;
            let from = huntPlayerNode();
            if (from.f !== to.f || (from.x === to.x && from.z === to.z)) { clearFootprints3D(); return; }
            let key = [from.f, from.x, from.z].join(',');
            if (force || key !== huntNavRoute.key) {
                huntRouteDispose(huntNavRoute);
                let r = huntRouteBuild(from, to, camera.position, to.f);
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
            let b = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ map: createProceduralTexture(reward.tex || 'generic', reward.c, '#ffffff') }));
            b.position.set(pos.fx * TILE, pos.fl * TILE + 1.5, pos.fz * TILE);
            b.userData = { ...reward, isItem: true, vel: new THREE.Vector3(0, 0, 0), fromSignal: true };
            scene.add(b); groundItems.push(b); s.mesh = b;
            signalRouteTick(true);
            if (!actionTarget) bar.style.display = 'none';
        }

        function updateHUD() {
            pouchViewTick();
            document.getElementById('hp-txt').innerText = Math.floor(gState.hp);
            let hpMaxEl = document.getElementById('hp-max-txt');
            if (hpMaxEl) hpMaxEl.innerText = effectiveMaxHp();
            document.getElementById('health-fill').style.width = Math.max(0, Math.min(100, gState.hp / (effectiveMaxHp() || 100) * 100)) + '%';
            let currentWeight = invWeight();
            document.getElementById('weight-txt').innerText = currentWeight;

            expandInventory();
            if (openPouch && gState.inv.indexOf(openPouch) < 0) openPouch = null;

            for (let i = 0; i < 3; i++) {
                let hudSlot = document.getElementById('hud-slot-' + i);
                hudSlot.className = 'slot' + (gState.selectedSlot === i ? ' selected' : '');
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
                slotEl.className = 'slot' + (gState.selectedSlot === i ? ' selected' : '');
                slotEl.innerHTML = slotLabelHtml(gState.inv[i]);
                setupSlotDrag(slotEl, 'inv', i);
                slotEl.onclick = function () { pouchToggleFor(gState.inv[i]); if (i <= 2) selectSlot(i); else updateHUD(); };
                if (i < 3) bpHotbarEl.appendChild(slotEl); else bpBackpackEl.appendChild(slotEl);
            }
            renderPouchSlots(pouchRowEl(bpBackpackEl, 'bp-pouch-row'), updateHUD);

            let hint = document.getElementById('bp-repair-hint');
            if (hint) {
                let sel = gState.inv[gState.selectedSlot];
                if (sel && sel.type === 'badge') hint.innerText = `地窖徽章 ${sel.uses}/${sel.maxUses}　维护费 $${BADGE_REPAIR_COST}　资金 $${gState.money}`;
                else if (sel && sel.type === 'med') hint.innerText = `医疗包 ${sel.uses}/${sel.maxUses}　维护费 $${(sel.maxUses - sel.uses) * 1000}　资金 $${gState.money}`;
                else hint.innerText = '在快捷栏选中地窖徽章或医疗包后可充能维护';
            }
            drawCapacityCircle();
        }

        // 手上（快捷栏 1～3）拿着腰包的时候，把它的 3 格列出来，按 1～3 把里面的东西拿到手上。
        // 腰包里的东西不能直接用，得先拿出来。
        function pouchOpen() {
            let it = gState.inv[gState.selectedSlot];
            return !!(isPouch(it) && gState.selectedSlot <= 2);
        }

        function pouchTake(n) {
            if (!pouchOpen()) return;
            let pi = gState.selectedSlot, bag = pouchBag(gState.inv[pi]);
            if (n < 0 || n >= POUCH_SLOTS || !bag[n]) return;
            let to = -1;
            for (let i = 0; i < 3; i++) if (i !== pi && !gState.inv[i]) { to = i; break; }              // 先找空的手上格
            if (to < 0) for (let i = 0; i < INV_BASE; i++) if (i !== pi && !gState.inv[i]) { to = i; break; }
            if (to < 0) for (let i = 0; i < 3; i++) if (i !== pi && !isPouch(gState.inv[i])) { to = i; break; }   // 实在没空位就对换（腰包不能换进腰包）
            if (to < 0) return;
            let a = bag[n];
            bag[n] = gState.inv[to];
            gState.inv[to] = a;
            if (to <= 2) selectSlot(to);
            updateHUD();
        }

        function pouchViewTick() {
            let el = document.getElementById('pouch-view'); if (!el) return;
            expandInventory();
            if (!isPlaying || !pouchOpen()) { el.classList.add('hidden'); return; }
            let bag = pouchBag(gState.inv[gState.selectedSlot]);
            el.innerHTML = '<div style="color:#ffd54f;">腰包（按 1～' + POUCH_SLOTS + ' 拿出来）</div>' +
                bag.map(function (it, n) {
                    return '<div>' + (n + 1) + '、' + (it ? it.n + '　重:' + itemWeight(it) : '<span style="color:#888;">空</span>') + '</div>';
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
            gState.runCash = (gState.runCash || 0) + cashNow;   // 只给本局任务「上交满 $30000」计数
            huntRefreshSubmitUI();

            tidyInv(); updateHUD(); saveProgress();
            return submittedNow;
        }

        function completeExtraction(text) {
            // isFirstRound/pityGuaranteed 不在这清零了——进图那一刻（startGameMap）已经
            // 处理过，不然连续撤离失败的人会一直卡在"首次必出"状态出不来。
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
            chatPush('系统', dispName(id) + why + '，AI 接管了他的位置', false);
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
            if (label) label.innerText = gState.spectating ? dispName(gState.spectating.userData.name) : '自己（原地）';
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
            // 这个分支之前漏了保底判断——你倒下算这局没拿到货，跟 forfeitRun 是一回事，
            // 不然连续几局都是"队友撤了但你倒下"的人永远攒不出保底。
            if (huntConsecutiveFails() >= 5) gState.pityGuaranteed = true;
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

        // 保底提示写的是"连续几把没出货了"，但原来的判断是"最近 10 把里失败次数
        // ≥5"——赢一把输一把交替来，10 把里凑够 5 输一样触发，跟"连续"对不上。
        // 改成从最近一把往前数真正连续失败了几把，碰到一次成功就停。
        function huntConsecutiveFails() {
            let h = gState.matchHistory, n = 0;
            for (let i = h.length - 1; i >= 0 && !h[i]; i--) n++;
            return n;
        }
        // 没撤出去：这局上交过的东西全部没收，返回没收了几件。上交本来就不给钱，所以不扣钱（H4）
        function forfeitRun() {
            let confiscated = (gState.submittedItems || []).length;
            gState.submittedItems = [];
            gState.matchHistory.push(false); if (gState.matchHistory.length > 10) gState.matchHistory.shift();
            if (huntConsecutiveFails() >= 5) gState.pityGuaranteed = true;
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
            if (gState.isDead) return; gState.isDead = true;

            gState.deathPos = camera.position.clone(); gState.spectating = null; gState.spectateIdx = -1;

            gState.inv.forEach(function (d, idx) {
                if (!d || d.type === 'backpack_ext') return;
                let box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
                box.position.copy(camera.position).add(new THREE.Vector3((Math.random() - 0.5) * 12, -4, (Math.random() - 0.5) * 12));
                box.userData = { ...d, isItem: true }; scene.add(box); groundItems.push(box); gState.inv[idx] = null;
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

        function clickLottery() {
            let slot = gState.selectedSlot; let item = gState.inv[slot];
            if (!item) { showSysModal('提示', '请先在快捷栏选择要用于抽奖的物品', [{ label: '确定' }]); return; }

            let isPurple = itemPool.purple.some(p => p.n === item.n);
            let isGold = itemPool.gold.some(g => g.n === item.n);
            if (!isPurple && !isGold) { showSysModal('提示', '只能投入紫色或金色物品进行抽奖！', [{ label: '确定' }]); return; }

            gState.inv[slot] = null; updateHUD();
            let r = Math.random(); let reward = null;

            if (isPurple) {
                if (r < 0.10) reward = null;
                else if (r < 0.30) reward = itemPool.gold[Math.floor(Math.random() * itemPool.gold.length)];
                else reward = itemPool.purple[Math.floor(Math.random() * itemPool.purple.length)];
            } else if (isGold) {
                if (r < 0.10) reward = null;
                else if (r < 0.20) reward = itemPool.purple[Math.floor(Math.random() * itemPool.purple.length)];
                else if (r < 0.75) reward = itemPool.gold[Math.floor(Math.random() * itemPool.gold.length)];
                else {
                    let uRoll = r - 0.75;
                    if (uRoll < 0.05) reward = { n: "帝王翡翠", v: 800000, w: 3, tex: 'jade', c: 0x00e676 };
                    else if (uRoll < 0.10) reward = { n: "王权之心", v: 1000000, w: 4, tex: 'heart', c: 0xff1744 };
                    else if (uRoll < 0.15) reward = { n: "eggy金条", v: 200000, w: 10, tex: 'statue', c: 0xffb300 };
                    else if (uRoll < 0.20) reward = { n: "时空沙漏", v: 1000000, w: 4, tex: 'glass', c: 0x00ffff, type: 'time_stop', uses: 3, maxUses: 3 };
                    else reward = { n: "永恒誓言", v: 2000000, w: 1, tex: 'heart', c: 0xffffff, type: 'amulet' };
                }
            }

            if (reward) {
                let tObj = createProceduralTexture(reward.tex || 'generic', reward.c || 0x3498db, '#ffffff');
                let itemMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ map: tObj }));
                let launchDir = new THREE.Vector3(); camera.getWorldDirection(launchDir); itemMesh.position.copy(camera.position).add(launchDir.clone().multiplyScalar(4)); itemMesh.userData = { ...reward, isItem: true, vel: launchDir.multiplyScalar(60), gravityActive: true }; scene.add(itemMesh); groundItems.push(itemMesh);
                showSysModal("抽奖结果", `不可思议！抽到了: ${reward.n}! 物品已弹出。`, [{ label: "太棒了" }]);
            } else { showSysModal('抽奖失败', '很遗憾，抽奖反应失败，物品被销毁了...', [{ label: '确定' }]); }
            saveProgress();
        }

        setupJoy('joystick-left', 'knob-left', tMove);
        setupBtn('jump-btn', 'jump'); setupBtn('interact-btn', 'interact'); setupBtn('ability-btn', 'ability');
        (function () {
            let rb = document.getElementById('run-btn');
            if (rb) rb.addEventListener('touchstart', function (e) { e.preventDefault(); padToggleRun(); }, { passive: false });
        })();

        // 平板：惊魂夜和超燃都是靠鼠标左右键 + 键盘触发的，触屏没有这些，
        // 之前完全没接，导致平板上这两个模式点了没反应。直接触发对应函数，
        // 不走 keys/touchBtn 那套轮询 —— 这些函数自己已经做好了状态判断。
        function bindTouchTap(id, fn) {
            let btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
        }

        bindTouchTap('esc-act-btn', function () { touchBtn.interact = true; });
        bindTouchTap('nm-act-btn', function () { touchBtn.nmAct = true; });
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


