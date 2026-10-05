        // ── 惊魂夜的人和人碰撞 ──
        // 同样用「软推开」而不是硬阻挡：这个模式里追捕要扛人、要挂钩、
        // 逃生者要贴着救人，硬挡会把救援和扛人整套流程卡死。
        // 所以扛着的、倒地的、被救的、挂在椅子上的一律不参与推挤。
        const NIGHT_BODY_R = 6;
        function nightSolid(a) {
            return a && !a.out && !a.escaped && !a.downed && !a.onChair &&
                a !== (night.hunter && night.hunter.carrying);
        }
        function nightSeparate(dt) {
            let list = night.survivors.filter(nightSolid);
            if (nightSolid(night.hunter)) list = list.concat([night.hunter]);
            let d2 = NIGHT_BODY_R * 2;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    let a = list[i], b = list[j];
                    if (Math.abs((a.gy || 0) - (b.gy || 0)) > 8) continue;
                    let dx = a.p.x - b.p.x, dz = a.p.z - b.p.z;
                    let d = Math.hypot(dx, dz);
                    if (d >= d2) continue;
                    if (d < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz) || 1; }
                    let push = Math.min((d2 - d) / 2, 70 * dt);
                    let ux = dx / d * push, uz = dz / d * push;
                    if (!nightBlockedFor(a, a.p.x + ux, a.p.z)) a.p.x += ux;
                    if (!nightBlockedFor(a, a.p.x, a.p.z + uz)) a.p.z += uz;
                    if (!nightBlockedFor(b, b.p.x - ux, b.p.z)) b.p.x -= ux;
                    if (!nightBlockedFor(b, b.p.x, b.p.z - uz)) b.p.z -= uz;
                }
            }
        }

        function nightBlockedFor(actor, x, z) {
            if (checkCol(x, z, 9, 0)) return true;
            if (actor && nightStairRail(actor, x, z)) return true;

            if (actor && actor.gy !== undefined) {
                let want = nightSurface(x, z, actor.level || 0);
                if (want - actor.gy > NIGHT_STEP_UP) return true;
            }
            if (!nightDroppedPalletAt(x, z, actor ? (actor.gy || 0) : undefined)) return false;

            if (actor === night.hunter && (actor.hookPull || actor.hookMove)) return false;

            return true;
        }

        const PALLET_THIN = CRATE_SIDE / 16, PALLET_LEN = CRATE_SIDE, PALLET_TALL = CRATE_H;

        const PALLET_STAND_Z = -(TILE - CRATE_SIDE / 2 - PALLET_THIN / 2);
        const PALLET_LIE_Z = 0;

        const PALLET_DETOUR_CELLS = Math.floor(20 * 8 / TILE);
        const PALLET_HARD_MAX = 1;
        const PALLET_GAP = 2 * TILE - CRATE_SIDE;

        function nightMakePallet(axis, indoor) {
            let g = new THREE.Group();

            let plank = new THREE.Mesh(new THREE.BoxGeometry(PALLET_LEN, PALLET_TALL, PALLET_THIN),
                new THREE.MeshLambertMaterial({ color: 0x6b3f1d }));
            plank.position.y = PALLET_TALL / 2;

            plank.position.z = indoor ? -(TILE / 2 - PALLET_THIN / 2 - 0.5) : PALLET_STAND_Z;
            g.add(plank);

            g.rotation.y = axis === 'x' ? 0 : Math.PI / 2;
            g.userData = { plank: plank };
            return g;
        }

        function nightDropPallet(p, fromNet) {
            if (netOn() && !fromNet) netEvent('pallet', { i: gState.pallets.indexOf(p), st: 1 });
            p.state = 'down';
            let plank = p.mesh.userData.plank;
            plank.material.color.setHex(0x4e2d15);

            p.fall = { t: 0 };

            let h = night.hunter;
            let d = Math.hypot(p.x * TILE - h.p.x, p.z * TILE - h.p.z);
            if (d <= TILE / 2 + NIGHT.palletHitRange && nightPalletSameLevel(p, h.gy)) nightStunHunter(NIGHT.palletStun, '板子砸中！');
            nightEjectFromPallet(p);

        }

        const PALLET_BREAK = 0.45;
        function nightBreakPallet(p) {
            p.state = 'broken';
            p.fall = null;
            if (!p.mesh) return;
            let plank = p.mesh.userData.plank;
            plank.material.transparent = true;
            p.breakAnim = { t: 0, y0: plank.position.y, rz: plank.rotation.z, s0: plank.scale.clone() };
        }

        function nightPalletBreakTick(dt) {
            gState.pallets.forEach(function (p) {
                if (!p.breakAnim || !p.mesh) return;
                let a = p.breakAnim;
                a.t = Math.min(PALLET_BREAK, a.t + dt);
                let u = a.t / PALLET_BREAK;
                let plank = p.mesh.userData.plank;

                plank.rotation.z = a.rz + Math.sin(u * Math.PI * 6) * 0.25 * (1 - u);
                plank.position.y = a.y0 - u * u * 5;
                plank.scale.set(a.s0.x * (1 - u * 0.5), a.s0.y * Math.max(0.02, 1 - u), a.s0.z * (1 - u * 0.5));
                plank.material.opacity = 1 - u;
                if (u >= 1) { scene.remove(p.mesh); p.mesh = null; p.breakAnim = null; }
            });
        }

        const PALLET_FALL = 0.28;
        function nightPalletFallTick(dt) {
            gState.pallets.forEach(function (p) {
                if (!p.fall || !p.mesh) return;
                p.fall.t = Math.min(PALLET_FALL, p.fall.t + dt);
                let u = p.fall.t / PALLET_FALL;
                let e = 1 - (1 - u) * (1 - u);
                let plank = p.mesh.userData.plank;
                plank.rotation.x = e * Math.PI / 2;
                plank.position.y = PALLET_TALL / 2 - e * (PALLET_TALL / 2 - PALLET_THIN / 2);

                plank.position.z = PALLET_STAND_Z + e * (PALLET_LIE_Z - PALLET_STAND_Z);

                plank.scale.set(1, 1 + e * (PALLET_GAP / PALLET_TALL - 1), 1);
                if (u >= 1) p.fall = null;
            });
        }

        function nightVaultSideFrom(p, from, face) {
            let cx = p.x * TILE, cz = p.z * TILE;
            let axis = p.axis || (Math.abs(from.x - cx) > Math.abs(from.z - cz) ? 'x' : 'z');
            let along = axis === 'x' ? (from.x - cx) : (from.z - cz);

            if (Math.abs(along) < 2 && face) along = -(axis === 'x' ? face.x : face.z);
            if (Math.abs(along) < 0.001) along = 1;
            return { axis: axis, side: along >= 0 ? 1 : -1 };
        }

        function nightVaultLandingFrom(p, from, face) {
            let cx = p.x * TILE, cz = p.z * TILE;
            let s = nightVaultSideFrom(p, from, face), axis = s.axis;

            for (let sign of [-s.side, s.side]) {
                for (let f of [0.85, 0.72, 0.6]) {
                    let tx = cx + (axis === 'x' ? sign * TILE * f : 0);
                    let tz = cz + (axis === 'z' ? sign * TILE * f : 0);
                    if (nightDroppedPalletAt(tx, tz)) continue;
                    if (!checkCol(tx, tz, 9, 0) &&
                        !blockedX(tx, tz, 9, 1) && !blockedX(tx, tz, 9, -1) &&
                        !blockedZ(tx, tz, 9, 1) && !blockedZ(tx, tz, 9, -1)) {
                        return new THREE.Vector3(tx, nightEyeAt(tx, tz), tz);
                    }
                }
            }
            return null;
        }

        function nightCamDir() { let d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; return d; }
        function nightVaultSide(p) { return nightVaultSideFrom(p, camera.position, nightCamDir()); }
        function nightVaultLanding(p) { return nightVaultLandingFrom(p, camera.position, nightCamDir()); }

        function nightPalletAhead(actor, target) {
            let dir = new THREE.Vector3().subVectors(target, actor.p); dir.y = 0;
            if (dir.lengthSq() < 0.01) return null;
            dir.normalize();
            let px = actor.p.x + dir.x * (P_RADIUS + 7), pz = actor.p.z + dir.z * (P_RADIUS + 7);
            let c = nightCellOf({ x: px, z: pz });
            return gState.pallets.find(function (q) { return q.state === 'down' && q.x === c.x && q.z === c.z; }) || null;
        }

        function nightStartActorVault(a, pal, target) {
            let dir = new THREE.Vector3().subVectors(target, a.p); dir.y = 0;
            if (dir.lengthSq() < 0.01) return false;
            dir.normalize();
            let to = nightVaultLandingFrom(pal, a.p, dir);
            if (!to) return false;
            a.vault = { t: 0, from: a.p.clone(), to: to };
            return true;
        }

        function nightActorVaultTick(a, dt) {
            let v = a.vault;
            v.t += dt;
            let u = Math.min(1, v.t / NIGHT.palletVault);
            let e = u * u * (3 - 2 * u);
            a.p.x = v.from.x + (v.to.x - v.from.x) * e;
            a.p.z = v.from.z + (v.to.z - v.from.z) * e;
            a.p.y = EYE_H + nightGroundTick(a, a.p.x, a.p.z, dt);
            nightSyncMesh(a);
            if (a.mesh) a.mesh.position.y = (a.gy || 0) + Math.sin(u * Math.PI) * NIGHT.palletVaultLift;
            if (u >= 1) { a.vault = null; if (a.mesh) a.mesh.position.y = a.gy || 0; }
        }

        function nightEjectFromPallet(pal) {
            let cx = pal.x * TILE, cz = pal.z * TILE;
            let ax = pal.axis === 'x' ? 'x' : 'z';
            let base = ax === 'x' ? cx : cz;
            let fix = function (pos, actor) {
                if (Math.abs(pos.x - cx) > TILE / 2 || Math.abs(pos.z - cz) > TILE / 2) return;
                let sign = (pos[ax] - base) >= 0 ? 1 : -1;
                for (let sg of [sign, -sign]) {
                    for (let f of [0.85, 1.0, 1.2]) {
                        let tx = ax === 'x' ? base + sg * TILE * f : pos.x;
                        let tz = ax === 'z' ? base + sg * TILE * f : pos.z;
                        if (!checkCol(tx, tz, 9, 0) && !nightDroppedPalletAt(tx, tz)) {
                            pos.x = tx; pos.z = tz; if (actor) nightSyncMesh(actor); return;
                        }
                    }
                }
            };
            if (night.side === 'survivor' && !night.spectating) fix(camera.position, null);
            night.survivors.forEach(function (a) { if (!a.isPlayer) fix(a.p, a); });
        }

        function nightStep(actor, dx, dz) {

            if (checkCol(actor.p.x, actor.p.z, actor.p.y, actor.p.y - 9)) {
                actor.p.x += dx; actor.p.z += dz;
                nightSyncMesh(actor);
                return;
            }
            if (!nightBlockedFor(actor, actor.p.x + dx + Math.sign(dx) * P_RADIUS, actor.p.z)) actor.p.x += dx;
            if (!nightBlockedFor(actor, actor.p.x, actor.p.z + dz + Math.sign(dz) * P_RADIUS)) actor.p.z += dz;
            actor.p.y = EYE_H + nightGroundTick(actor, actor.p.x, actor.p.z, 1 / 60);
            nightSyncMesh(actor);
        }

        const WALL_KEEP = 11;
        function nightWallPush(pos) {
            let push = new THREE.Vector3();
            let cx = Math.floor((pos.x + TILE / 2) / TILE), cz = Math.floor((pos.z + TILE / 2) / TILE);
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dz === 0) continue;
                let nx = cx + dx, nz = cz + dz;
                if (!maze[0] || !maze[0][nz] || !maze[0][nz][nx]) continue;
                if (maze[0][nz][nx].type !== 1) continue;

                let wx = nx * TILE, wz = nz * TILE;
                let qx = Math.max(wx - TILE / 2, Math.min(pos.x, wx + TILE / 2));
                let qz = Math.max(wz - TILE / 2, Math.min(pos.z, wz + TILE / 2));
                let ox = pos.x - qx, oz = pos.z - qz;
                let d = Math.hypot(ox, oz);
                if (d > WALL_KEEP) continue;
                if (d < 0.01) { ox = -dx; oz = -dz; d = 1; }
                let w = (WALL_KEEP - d) / WALL_KEEP;
                push.x += (ox / d) * w; push.z += (oz / d) * w;
            }
            return push;
        }

        function nightCellIdx(x, z) { return z * mSize + x; }
        function nightWalkable(x, z) {
            if (x < 1 || x >= mSize - 1 || z < 1 || z >= mSize - 1) return false;
            if (!maze[0][z] || !maze[0][z][x]) return false;
            return maze[0][z][x].type === 0;
        }

        let nightFlowCache = {};
        function nightResetFlowCache() { nightFlowCache = {}; }
        function nightFlowFrom(tx, tz) {
            let key = tx + ',' + tz;
            if (nightFlowCache[key]) return nightFlowCache[key];
            let from = new Int32Array(mSize * mSize).fill(-1);
            if (!nightWalkable(tx, tz)) {

                let seeds = [];
                [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (v) {
                    if (nightWalkable(tx + v[0], tz + v[1])) seeds.push([tx + v[0], tz + v[1]]);
                });
                if (seeds.length === 0) { nightFlowCache[key] = from; return from; }
                let q = seeds.map(function (c) { return nightCellIdx(c[0], c[1]); });
                q.forEach(function (i) { from[i] = i; });
                nightBfs(q, from);
            } else {
                let s = nightCellIdx(tx, tz); from[s] = s;
                nightBfs([s], from);
            }
            nightFlowCache[key] = from;
            return from;
        }
        function nightBfs(queue, from) {
            let head = 0;
            while (head < queue.length) {
                let cur = queue[head++];
                let cx = cur % mSize, cz = (cur - cx) / mSize;
                for (let d = 0; d < 4; d++) {
                    let nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
                    let nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
                    if (!nightWalkable(nx, nz)) continue;
                    let ni = nightCellIdx(nx, nz);
                    if (from[ni] !== -1) continue;
                    from[ni] = cur;
                    queue.push(ni);
                }
            }
        }

        function nightNextStep(actor, target) {
            let a = nightCellOf(actor.p), t = nightCellOf(target);
            if (a.x === t.x && a.z === t.z) return null;
            if (!nightWalkable(a.x, a.z)) return null;
            let from = nightFlowFrom(t.x, t.z);
            let me = nightCellIdx(a.x, a.z);
            let nxt = from[me];
            if (nxt === -1 || nxt === me) return null;
            let nx = nxt % mSize, nz = (nxt - nx) / mSize;
            return new THREE.Vector3(nx * TILE, actor.p.y, nz * TILE);
        }

        function nightStairList() {
            let d = gState.nightDeck;
            if (!d) return [];
            if (gState._stairList && gState._stairSeed === gState.nightSeed) return gState._stairList;
            let out = [];
            Object.keys(d.stairs).forEach(function (k) {
                let q = k.split(',');
                out.push({ x: +q[0], z: +q[1], h: d.stairs[k] });
            });
            gState._stairList = out; gState._stairSeed = gState.nightSeed;
            return out;
        }

        function nightRouteTo(actor, target) {
            if (!target || target.y === undefined) return target;
            if (nightSameLevel(actor.p, target)) return target;
            let list = nightStairList();
            if (!list.length) return target;
            let up = target.y > actor.p.y;
            let want = null, best = -Infinity;
            list.forEach(function (st) {
                let v = up ? st.h : -st.h;
                if (v > best) { best = v; want = st; }
            });
            if (!want) return target;
            return new THREE.Vector3(want.x * TILE, actor.p.y, want.z * TILE);
        }

        function nightSmoothStep(actor, target) {
            let a = nightCellOf(actor.p), t = nightCellOf(target);
            if (a.x === t.x && a.z === t.z) return null;
            if (!nightWalkable(a.x, a.z)) return null;
            let from = nightFlowFrom(t.x, t.z);
            let cur = nightCellIdx(a.x, a.z);
            let best = null;
            for (let i = 0; i < 6; i++) {
                let nxt = from[cur];
                if (nxt === -1 || nxt === cur) break;
                let nx = nxt % mSize, nz = (nxt - nx) / mSize;
                let pt = new THREE.Vector3(nx * TILE, actor.p.y, nz * TILE);
                if (!nightClearShot(actor.p, pt)) break;
                best = pt; cur = nxt;
            }
            return best;
        }

        function nightMoveToward(actor, target, speed, dt, away) {

            if (!away) {
                target = nightRouteTo(actor, target);
                let step = nightSmoothStep(actor, target) || nightNextStep(actor, target);
                if (step) target = step;

                if (!actor.isPlayer && actor !== night.hunter && !actor.vault) {
                    let pal = nightPalletAhead(actor, target);
                    if (pal && nightStartActorVault(actor, pal, target)) return;
                }
            }
            let dir = new THREE.Vector3().subVectors(target, actor.p); dir.y = 0;
            let arrived = dir.lengthSq() < 0.01;

            if (arrived) {
                if (nightClearShot(actor.p, target)) { actor.stuckT = 0; actor.stuckCycles = 0; actor.slideSign = undefined; return; }
                dir.set(1, 0, 0);
            } else dir.normalize();
            if (away) dir.negate();

            if (actor.charKey === 'c1' && night.hunter && actor !== night.hunter &&
                nightTowardHunter(actor.p, dir.x, dir.z)) speed *= SKILL.c1TowardMul;

            if ((actor.stuckCycles || 0) >= 2) {
                let dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                let origin = actor.p.clone();
                let bestP = null, bestMoved = 0;
                dirs.forEach(function (v) {
                    actor.p.copy(origin);
                    nightStep(actor, v[0] * speed * dt, v[1] * speed * dt);
                    let moved = actor.p.distanceTo(origin);
                    if (moved > bestMoved) { bestMoved = moved; bestP = actor.p.clone(); }
                });
                actor.p.copy(origin);
                if (bestP && bestMoved > speed * dt * 0.4) {
                    actor.p.copy(bestP); nightSyncMesh(actor);
                    actor.stuckT = 0; actor.stuckCycles = 0; actor.slideSign = undefined;
                }
                return;
            }

            if (actor.stuckT > 0.25) {
                if (actor.slideSign === undefined) actor.slideSign = seededRandom() < 0.5 ? 1 : -1;
                let perp = new THREE.Vector3(-dir.z * actor.slideSign, 0, dir.x * actor.slideSign);
                dir.addScaledVector(perp, 1.8).normalize();
                if (actor.stuckT > 2.5) { actor.slideSign *= -1; actor.stuckT = 0.3; actor.stuckCycles = (actor.stuckCycles || 0) + 1; }
            } else actor.slideSign = undefined;

            let push = nightWallPush(actor.p);
            if (push.lengthSq() > 0.0001) dir.addScaledVector(push, 0.85).normalize();

            if (!actor.isPlayer) {
                let want = Math.atan2(dir.z, dir.x);
                if (actor.faceA === undefined) actor.faceA = want;
                let diff = want - actor.faceA;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                let maxTurn = NIGHT.aiTurnRate * dt;
                if (diff > maxTurn) diff = maxTurn; else if (diff < -maxTurn) diff = -maxTurn;
                actor.faceA += diff;
                dir.set(Math.cos(actor.faceA), 0, Math.sin(actor.faceA));
            }

            let before = actor.p.clone();
            nightStep(actor, dir.x * speed * dt, dir.z * speed * dt);

            let moved = actor.p.distanceTo(before);
            if (moved < speed * dt * 0.4) actor.stuckT = (actor.stuckT || 0) + dt;
            else { actor.stuckT = 0; actor.stuckCycles = 0; }
        }

        function nightAliveSurvivors() { return night.survivors.filter(function (a) { return !a.out && !a.escaped; }); }

        const RESCUE_ORDER = { c1: 0, meow: 1, dog: 2, cat: 3, c2: 4, mi: 5 };

        function nightRescueUrgency(v) {
            let u = 0;
            u += (v.chairCount || 0) * 1000;
            if (v.onChair) u += 500 + (v.chairTime || 0);
            else if (v.downed) u += (v.bleed || 0) * 0.5;
            return u;
        }
        function nightMostUrgent(list) {
            let best = null, bu = -1;
            list.forEach(function (v) { let u = nightRescueUrgency(v); if (u > bu) { bu = u; best = v; } });
            return best;
        }
        function nightRescuerFor(victim) {
            let cands = night.survivors.filter(function (a) {
                return a !== victim && !a.isPlayer && !a.out && !a.escaped && !a.downed && !a.onChair;
            });
            if (cands.length === 0) return null;

            let h = night.hunter;
            let pinned = function (o) { return h && nightFlatDist(h.p, o.p) < DANGER_NEAR; };
            let free = cands.filter(function (o) { return !pinned(o); });
            if (free.length) cands = free;
            cands.sort(function (x, y) {
                if ((y.hp || 0) !== (x.hp || 0)) return (y.hp || 0) - (x.hp || 0);
                let ox = RESCUE_ORDER[x.charKey] === undefined ? 9 : RESCUE_ORDER[x.charKey];
                let oy = RESCUE_ORDER[y.charKey] === undefined ? 9 : RESCUE_ORDER[y.charKey];
                if (ox !== oy) return ox - oy;
                return nightFlatDist(x.p, victim.p) - nightFlatDist(y.p, victim.p);
            });
            return cands[0];
        }

        function nightDamage(a, fromNet) {
            if (a.downed || a.out || a.escaped) return;

            if (netOn() && !fromNet && a.remote) { netEvent('dmg', { key: a.key }); }
            if (night.friendly && a.isPlayer) return;

            if (nightHC() === 'hunter') night.rushPending = true;
            if (nightTryBlock(a)) return;

            let aiDog = night.survivors.filter(function (o) {
                return !o.isPlayer && o.charKey === 'dog' && o.blockArmed > 0 && !o.out && !o.escaped && !o.downed && !o.onChair;
            }).find(function (o) { return o === a || o.p.distanceTo(a.p) <= SKILL.dogBlockRange; });
            if (aiDog) {
                aiDog.blockArmed = 0;
                nightStunHunter(SKILL.dogBlockStun, null);
                nightAliveSurvivors().forEach(function (o) {
                    if (aiDog.p.distanceTo(o.p) <= SKILL.dogBlockBoostRange) o.hitBoost = SKILL.dogBlockBoostTime;
                });
                if (a.isPlayer) nightFlash('队友狗盾替你挡下了！');
                return;
            }

            if (a.tempHpUntil && performance.now() < a.tempHpUntil) {
                a.tempHpUntil = 0; a.hitBoost = NIGHT.hitBoostTime;
                if (a.isPlayer) nightFlash('临时生命值挡下了这一刀');
                return;
            }
            a.hp--; a.hitBoost = NIGHT.hitBoostTime;
            if (!a.isPlayer) a.reactT = NIGHT.aiReact * nightSkillK().react;
            nightRefreshFish(true);
            if (a.isPlayer) night.hitBoost = NIGHT.hitBoostTime;
            if (a.hp <= 0 && nightHC() === 'hmeow' && night.throwCd > 0) {

                night.throwCd = Math.max(0, night.throwCd - SKILL.hmeowDownCut);
                if (night.side === 'hunter') nightFlashHunter('击倒 —— 投矛冷却 ' + night.throwCd.toFixed(0) + 's');
            }
            if (a.hp <= 0) {
                a.downed = true; a.bleed = 0; a.healProg = 0; a.repairing = null; nightAISay(a, 'down');
                if (a.isPlayer) { night.repairing = null; night.calib = null; nightFlash('你被击倒了'); sfxBuzz(); }
                else if (night.side === 'hunter') sfxThud(true);
            }
            else if (a.isPlayer) nightFlash('受伤！剩 1 滴血');
        }

        function nightStrugglePress() {
            if (!night || night.over || night.side !== 'survivor') return false;
            let h = night.hunter, me = night.survivors[0];
            if (!h || h.carrying !== me) return false;
            let now = performance.now();
            if (now - (me.struggleAt || 0) < NIGHT.struggleGap * 1000) return true;
            me.struggleAt = now;
            me.struggle = (me.struggle || 0) + 1;
            if (me.struggle >= NIGHT.struggleNeed) {
                me.struggle = 0;
                h.carrying = null;
                me.downed = false; me.hp = 1; me.bleed = 0;
                me.hitBoost = NIGHT.hitBoostTime;
                if (me.mesh) { me.mesh.rotation.z = 0; me.mesh.position.y = 0; }
                nightSyncMesh(me);
                nightFlash('挣脱了！');
            }
            return true;
        }

        function nightCarryChairPos() {
            let h = night.hunter;
            let free = gState.chairs.filter(function (c) { return !c.used && !c.occupant && nightObjSameLevel(c, h.gy); });
            if (free.length === 0) free = gState.chairs.filter(function (c) { return !c.used && !c.occupant; });
            if (free.length === 0) return null;
            let best = free[0], bd = Infinity;
            free.forEach(function (c) { let d = Math.hypot(c.x * TILE - h.p.x, c.z * TILE - h.p.z); if (d < bd) { bd = d; best = c; } });
            return new THREE.Vector3(best.x * TILE, h.p.y, best.z * TILE);
        }

        function nightPutOnChair(a, fromNet) {
            if (netOn() && !fromNet && a.remote) netEvent('chair', { key: a.key });
            a.struggle = 0;
            nightAISay(a, 'chair');
            let free = gState.chairs.filter(function (c) { return !c.used && !c.occupant && nightObjSameLevel(c, a.gy); });
            if (free.length === 0) free = gState.chairs.filter(function (c) { return !c.used && !c.occupant; });
            if (free.length === 0) { a.downed = true; a.bleed = 0; return; }
            let best = free[0], bestD = Infinity;
            free.forEach(function (c) { let d = Math.hypot(c.x * TILE - a.p.x, c.z * TILE - a.p.z); if (d < bestD) { bestD = d; best = c; } });
            a.chairCount++;
            if (a.chairCount >= 3) {
                a.out = true; a.downed = false; if (a.mesh) a.mesh.visible = false;
                nightFlash(a.isPlayer ? '你被淘汰了' : '一名队友被淘汰');
                if (a.isPlayer && !a.everRescued) unlockEgg('chair_alone');
                return;
            }
            a.onChair = true; a.downed = false; a.chairTime = 0; a.chair = best; best.occupant = a;

            a.gy = best.gy || 0;
            a.hangAnim = { from: a.p.clone(), to: new THREE.Vector3(best.x * TILE, EYE_H + (best.gy || 0), best.z * TILE), t: 0 };
        }

        function nightRescue(a, fromNet) {
            if (netOn() && !fromNet && a.remote) netEvent('rescue', { key: a.key });
            a.everRescued = true;
            if (a.onChair) { a.chair.occupant = null; a.chair = null; a.onChair = false; }
            // 正被扛着的话，把人抢下来 —— 不然下一帧 carry 逻辑会继续拖着他走，
            // 到椅子边直接挂上，没空椅子时甚至会把他重新按成倒地。
            if (night.hunter && night.hunter.carrying === a) {
                night.hunter.carrying = null;
                night.hunter.recover = Math.max(night.hunter.recover || 0, 0.6);
            }
            // 扛人的时候模型被横过来放到了半空，救下来要摆回去
            if (a.mesh) { a.mesh.rotation.z = 0; a.mesh.scale.y = 1; }
            a.downed = false; a.hp = 1; a.bleed = 0; a.chairTime = 0; a.healProg = 0;
            a.beingRescued = false;
            nightSyncMesh(a);
        }

        function nightHunterSees(h, a) {
            if (!a || a.out || a.escaped) return false;
            if (!nightSameLevel(h.p, a.p)) return false;
            let d = nightFlatDist(h.p, a.p);
            if (d > NIGHT.hunterSight * nightSkillK().sight) return false;
            if (!nightClearShot(h.p, a.p)) return false;
            if (d <= NIGHT.atkRange + 12) return true;
            if (h.faceA === undefined) return true;
            let dot = Math.cos(h.faceA) * (a.p.x - h.p.x) / d + Math.sin(h.faceA) * (a.p.z - h.p.z) / d;
            return dot >= NIGHT.hunterFov;
        }

        const HUNT_ORDER = { mi: 0, cat: 1, c2: 1, c1: 2, meow: 2, dog: 3 };
        function nightHuntScore(h, a) {
            let ord = HUNT_ORDER[a.charKey];
            if (ord === undefined) ord = 2;
            return {
                hurt: (a.hp <= 1) ? 0 : 1,
                ord: ord,
                d: nightFlatDist(h.p, a.p)
            };
        }
        function nightPickHuntTarget(h, list) {
            let best = null, bk = null;
            list.forEach(function (a) {
                let k = nightHuntScore(h, a);
                if (!bk || k.hurt < bk.hurt ||
                    (k.hurt === bk.hurt && k.ord < bk.ord) ||
                    (k.hurt === bk.hurt && k.ord === bk.ord && k.d < bk.d)) { bk = k; best = a; }
            });
            return best;
        }

        function nightHunterAI(dt) {
            let h = night.hunter;
            if (h.recover > 0) { h.recover -= dt; return; }

            if (h.hookPull || h.hookMove) return;

            if (night.friendly && night.side === 'survivor') {
                if (h.mesh) h.mesh.rotation.y += dt * 2.6;
                let me = night.survivors[0];
                if (!me || me.out || me.escaped || me.onChair || me.downed) return;
                if (h.p.distanceTo(me.p) > 12) nightMoveToward(h, me.p, nightHunterSpeed() * 0.55, dt);
                return;
            }

            let tryBreak = function (goal) {
                let block = null, bd = Infinity;
                gState.pallets.forEach(function (p) {
                    if (p.state !== 'down' || !nightPalletSameLevel(p, h.gy)) return;
                    let d = Math.hypot(p.x * TILE - h.p.x, p.z * TILE - h.p.z);
                    if (d < bd) { bd = d; block = p; }
                });
                if (!block || bd >= NIGHT.palletBreakRange) { h.breakT = 0; return false; }

                let wants = h.stuckT > 1.2;
                if (!wants && goal) {
                    let step = nightNextStep(h, goal);
                    if (step) {
                        let sc = nightCellOf(step);
                        if (sc.x === block.x && sc.z === block.z) wants = true;
                    }
                }
                if (!wants) { h.breakT = 0; return false; }

                h.breakT = (h.breakT || 0) + dt;
                if (h.breakT >= NIGHT.palletBreak) { nightBreakPallet(block); h.breakT = 0; h.stuckT = 0; }
                return true;
            };

            if (h.carrying) {
                if (tryBreak(nightCarryChairPos())) return;
                let free = gState.chairs.filter(function (c) { return !c.used && !c.occupant && nightObjSameLevel(c, h.gy); });
                if (free.length === 0) free = gState.chairs.filter(function (c) { return !c.used && !c.occupant; });
                if (free.length === 0) { h.carrying.downed = true; h.carrying = null; return; }
                let best = free[0], bestD = Infinity;
                free.forEach(function (c) { let d = Math.hypot(c.x * TILE - h.p.x, c.z * TILE - h.p.z); if (d < bestD) { bestD = d; best = c; } });
                let tgt = new THREE.Vector3(best.x * TILE, h.p.y, best.z * TILE);
                nightMoveToward(h, tgt, nightHunterSpeed(), dt);

                h.carrying.p.copy(h.p); nightSyncMesh(h.carrying);
                if (h.carrying.mesh) { h.carrying.mesh.position.y = 13; h.carrying.mesh.rotation.z = Math.PI / 2; }
                if (h.p.distanceTo(tgt) < 14) { let a = h.carrying; h.carrying = null; nightPutOnChair(a); }
                return;
            }

            let alive = nightAliveSurvivors().filter(function (a) { return !a.onChair; });
            if (alive.length === 0) return;
            let standing = alive.filter(function (a) { return !a.downed; });
            let downed = alive.filter(function (a) { return a.downed; });

            let pick = null, pd = Infinity;
            downed.forEach(function (a) {
                let d = nightFlatDist(h.p, a.p);
                if (d < 44 && d < pd && nightHunterSees(h, a)) { pd = d; pick = a; }
            });

            h.noHitT = (h.noHitT || 0) + dt;
            let lock = h.lockOn;
            if (lock && (lock.out || lock.escaped || lock.onChair || lock.downed)) lock = null;
            if (lock) {
                if (nightHunterSees(h, lock)) { h.lostT = 0; h.lastSeen = lock.p.clone(); }
                else {
                    h.lostT = (h.lostT || 0) + dt;
                    if (h.lostT > NIGHT.hunterMemory) lock = null;
                }
            }
            if (lock && h.noHitT > NIGHT.hunterSwitchT) {
                let others = standing.filter(function (a) { return a !== lock && nightHunterSees(h, a); });
                if (others.length) {
                    lock = nightPickHuntTarget(h, others);
                    h.noHitT = 0; h.lostT = 0;
                }
            }
            if (!lock) {
                let vis = standing.filter(function (a) { return nightHunterSees(h, a); });
                lock = nightPickHuntTarget(h, vis);
                if (lock) { h.lostT = 0; h.noHitT = 0; h.lastSeen = lock.p.clone(); }
            }
            h.lockOn = lock;

            let tgt = pick || lock;
            if (!tgt) {

                let goal = h.lastSeen;
                if (goal && nightFlatDist(h.p, goal) < 18) { h.lastSeen = null; goal = null; }
                if (!goal) {
                    if (!h.patrol || nightFlatDist(h.p, h.patrol) < 22) {
                        let ms = gState.machines.filter(function (m) { return !m.done; });
                        if (!ms.length) ms = gState.machines;
                        let m = ms[Math.floor(Math.random() * ms.length)];
                        h.patrol = m ? new THREE.Vector3(m.x * TILE, h.p.y, m.z * TILE) : null;
                    }
                    goal = h.patrol;
                }
                if (goal) { if (tryBreak(goal)) return; nightMoveToward(h, goal, nightHunterSpeed(), dt); }
                return;
            }
            let bestD = nightFlatDist(h.p, tgt.p);

            if (tgt.downed) {
                if (bestD < 12 && nightSameLevel(h.p, tgt.p)) { h.stuckT = 0; h.carrying = tgt; return; }
                if (tryBreak(tgt.p)) return;
                nightMoveToward(h, tgt.p, nightHunterSpeed(), dt); return;
            }

            if (nightCanHit(h.p, tgt.p, NIGHT.atkRange)) {
                h.stuckT = 0; h.breakT = 0;
                let aim = new THREE.Vector3().subVectors(tgt.p, h.p).setY(0).normalize();
                nightSlashFx(h.p, aim, true);
                nightDamage(tgt); h.recover = NIGHT.hitRecover; h.noHitT = 0; return;
            }

            if (tryBreak(tgt.p)) return;

            let hc = nightHC();
            if (hc === 'hmi') {
                if (night.tpCd <= 0 && bestD > 200) { night.tpIndex = 0; nightHunterTeleport(); return; }
            } else if (hc === 'hgou') {

                let occ = gState.chairs.some(function (c) { return c.occupant && Math.hypot(c.x * TILE - h.p.x, c.z * TILE - h.p.z) < 60; });
                let nearPallet = gState.pallets.some(function (q) {
                    return q.state === 'down' && Math.hypot(q.x * TILE - h.p.x, q.z * TILE - h.p.z) < 40;
                });
                if (night.spikeCd <= 0 && (occ || nearPallet)) { nightPlaceSpike(); return; }
            } else if (hc === 'hmeow') {
                if (!night.spear && night.throwCd <= 0 && bestD > NIGHT.atkRange && bestD < SKILL.hmeowThrowRange) {
                    let dir = new THREE.Vector3().subVectors(tgt.p, h.p).setY(0).normalize();
                    let m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 12), new THREE.MeshLambertMaterial({ color: 0xcfcfcf }));
                    m.position.set(h.p.x, 8, h.p.z); scene.add(m);
                    night.spear = { p: m.position, dir: dir, left: SKILL.hmeowThrowRange, mesh: m };
                    night.throwCd = nightCd(SKILL.hmeowThrowCd);
                    return;
                }

            }

            if (hc === 'h4' && night.sealCd <= 0 && bestD < 120) {
                let near = null, nd2 = Infinity;
                gState.pallets.forEach(function (q) {
                    if (q.state !== 'up' || nightSealed(q) || !nightPalletSameLevel(q, h.gy)) return;
                    let d = Math.hypot(q.x * TILE - h.p.x, q.z * TILE - h.p.z);
                    if (d < nd2 && d <= SKILL.h4SealRange) { nd2 = d; near = q; }
                });
                if (near) {
                    near.sealedUntil = performance.now() + SKILL.h4SealTime * 1000;
                    night.sealCd = nightCd(SKILL.h4SealCd);
                    nightSealFx(near);
                    return;
                }
            }

            if (hc === 'h3' && night.hookCd <= 0 && !h.hookPull && !h.hookMove &&
                bestD > NIGHT.atkRange + 20 && bestD < SKILL.h3HookRange) {
                let d = new THREE.Vector3().subVectors(tgt.p, h.p).setY(0).normalize();
                if (h.faceA === undefined) h.faceA = Math.atan2(d.z, d.x);
                nightHookAI(d);
                return;
            }

            if (hc === 'hunter' && h.spearCd <= 0 && bestD > NIGHT.atkRange && bestD < NIGHT.spearRange) {
                h.spearCd = NIGHT.spearCd; h.spearLeft = NIGHT.spearRange;
                h.spearDir.subVectors(tgt.p, h.p).setY(0).normalize();
                return;
            }
            nightMoveToward(h, tgt.p, nightHunterSpeed(), dt);
        }

        function nightFleeTarget(a) {
            let now = performance.now();
            if (a.fleeTo && now < a.fleeUntil && nightFlatDist(a.p, a.fleeTo) > 20) return a.fleeTo;
            let t = nightPickFleeSpot(a);
            a.fleeTo = t; a.fleeUntil = now + NIGHT.aiFleeHold * 1000;
            return t;
        }

        function nightPickFleeSpot(a) {
            let h = night.hunter;
            let away = new THREE.Vector3().subVectors(a.p, h.p); away.y = 0;
            if (away.lengthSq() < 0.01) away.set(1, 0, 0);
            away.normalize();

            let sep = new THREE.Vector3();
            night.survivors.forEach(function (o) {
                if (o === a || o.out || o.escaped) return;
                let d = a.p.distanceTo(o.p);
                if (d > 0.01 && d < 56) {
                    let push = new THREE.Vector3().subVectors(a.p, o.p); push.y = 0;
                    sep.addScaledVector(push.normalize(), (56 - d) / 56);
                }
            });

            let mid = (mSize - 1) / 2 * TILE;
            let toMid = new THREE.Vector3(mid - a.p.x, 0, mid - a.p.z);
            let edge = Math.min(1, Math.max(Math.abs(a.p.x - mid), Math.abs(a.p.z - mid)) / mid);
            if (toMid.lengthSq() > 0.01) toMid.normalize(); else toMid.set(0, 0, 0);

            let dir = away.clone().addScaledVector(sep, 1.1).addScaledVector(toMid, edge * edge * 2.0);
            if (dir.lengthSq() < 0.01) dir.copy(away);
            dir.normalize();
            return new THREE.Vector3(a.p.x + dir.x * 140, a.p.y, a.p.z + dir.z * 140);
        }

        const AI_LINES = {
            chased:  ['追捕在我这！', '被盯上了，你们快修！'],
            hurt:    ['我残血了，求个治疗', '给我治疗！'],
            down:    ['我倒了，来人！'],
            chair:   ['我被挂了，快救！'],
            rescue:  ['我去救他！'],
            repair:  ['我去修机子', '这台交给我'],
            doorOpen:['门开了，走！'],
            toDoor:  ['我去门那边了'],
            toHeal:  ['别动，我来给你治'],
            toHealCat: ['过来，我给你补一口'],
            healed:  ['治好了，去修机'],
            toFish:  ['我去吃小鱼干，不用管我', '有鱼干，我自己回血']
        };
        function nightAISay(a, key) {
            if (!a || a.isPlayer) return;
            let lines = AI_LINES[key]; if (!lines) return;
            a.sayCd = a.sayCd || {};
            let now = performance.now();
            if (now - (a.sayCd[key] || 0) < 14000) return;
            if (now - (a.sayAny || 0) < 3500) return;
            a.sayCd[key] = now; a.sayAny = now;
            if (night && night.side !== 'survivor') return;
            let name = NIGHT_CHARS[a.charKey] ? NIGHT_CHARS[a.charKey].name : '队友';
            chatPush(name, lines[Math.floor(Math.random() * lines.length)], false);
        }

        const CHAT_ORDERS = [

            { key: 'norescue', words: ['我去救', '我来救', '我救', '别救', '不用救', '我去接', '我接'] },
            { key: 'heal',   words: ['治疗', '治一下', '奶', '回血', '加血'] },
            { key: 'rescue', words: ['救', '接人', '下椅', '拉我'] },
            { key: 'door',   words: ['撤', '开门', '走了', '跑', '逃', '出去'] },
            { key: 'come',   words: ['过来', '集合', '跟着我', '来我这'] },
            { key: 'repair', words: ['修', '挖煤', '开机', '机子', '破译', '发电'] }
        ];
        function nightApplyChatOrder(text) {
            if (!night || night.over) return;
            for (let i = 0; i < CHAT_ORDERS.length; i++) {
                let o = CHAT_ORDERS[i];
                for (let j = 0; j < o.words.length; j++) {
                    if (text.indexOf(o.words[j]) !== -1) {
                        night.order = { key: o.key, until: performance.now() + 20000 };
                        return;
                    }
                }
            }
        }
        function nightOrder() {
            if (!night || !night.order) return null;
            if (performance.now() > night.order.until) { night.order = null; return null; }
            return night.order.key;
        }

        function nightSurvivorAI(a, dt) {
            if (a.out || a.escaped || a.onChair) return;
            let h = night.hunter;
            if (a.downed) {
                a.beingHealed = false;

                let od = null, odd = Infinity;
                gState.doors.forEach(function (o) {
                    if (!o.open) return;
                    let d = Math.hypot(o.x * TILE - a.p.x, o.z * TILE - a.p.z);
                    if (d < odd) { odd = d; od = o; }
                });
                if (od) {
                    if (odd < 20) { a.escaped = true; if (a.mesh) a.mesh.visible = false; }
                    else nightMoveToward(a, new THREE.Vector3(od.x * TILE, a.p.y, od.z * TILE), NIGHT.crawl, dt);
                    return;
                }
                let mate = null, md = Infinity;
                nightAliveSurvivors().forEach(function (o) {
                    if (o === a || o.downed || o.onChair) return;
                    let d = nightFlatDist(a.p, o.p); if (d < md) { md = d; mate = o; }
                });
                if (mate && md > 14) nightMoveToward(a, mate.p, NIGHT.crawl, dt);
                else if (!mate) nightMoveToward(a, nightFleeTarget(a), NIGHT.crawl, dt);
                return;
            }
            if (a.beingHealed) return;

            let dh = nightFlatDist(h.p, a.p);
            let survSpd = NIGHT.surv * (a.slowUntil && performance.now() < a.slowUntil ? SKILL.hgouSpikeSlow : 1);

            let safeAt = DANGER_FAR * 1.35;
            let inDanger = nightSameLevel(h.p, a.p) && (a.fleeing ? dh < safeAt : dh < DANGER_FAR);
            a.fleeing = inDanger;
            if (!inDanger) { a.fleeTo = null; }

            let need = nightAliveSurvivors().filter(function (o) { return o !== a && (o.onChair || o.downed); });
            let victim = need.length > 0 ? nightMostUrgent(need) : null;
            let iAmRescuer = !!(victim && nightRescuerFor(victim) === a);

            let closeEnough = victim && nightFlatDist(a.p, victim.p) < 40;
            let hunterFar = victim && nightFlatDist(h.p, victim.p) > DANGER_FAR;

            let rescueCost = !victim ? 0 : (victim.onChair ? nightRescueTimeFor(a)
                : NIGHT.pickupTime * (1 - (victim.healProg || 0)));
            let hunterBusy = h.recover > rescueCost;

            let chaseT = null, chaseD = Infinity;
            nightAliveSurvivors().forEach(function (o) {
                if (o === victim || o.downed || o.onChair) return;
                let d = nightFlatDist(h.p, o.p);
                if (d < chaseD) { chaseD = d; chaseT = o; }
            });
            let chasingOther = !!chaseT && chaseT !== a && chaseD < DANGER_FAR;

            let committed = iAmRescuer && victim &&
                ((a.rescueProg || 0) > 0 || nightFlatDist(a.p, victim.p) < 20);

            if (nightOrder() === 'norescue' && !committed) iAmRescuer = false;
            let rescueFirst = iAmRescuer &&
                (a.hp >= 2 || committed || hunterFar || (closeEnough && (hunterBusy || chasingOther)));

            if (inDanger && !night.friendly && !rescueFirst) {

                if (dh < 30) {
                    let near = null, nd = Infinity;
                    gState.pallets.forEach(function (p) {
                        if (p.state !== 'up' || nightSealed(p) || !nightPalletSameLevel(p, a.gy)) return;
                        let d = Math.hypot(p.x * TILE - a.p.x, p.z * TILE - a.p.z); if (d < nd) { nd = d; near = p; }
                    });
                    if (near && nd < 16) { nightDropPallet(near); return; }
                }
                a.repairing = null;
                if (dh < 70) nightAISay(a, 'chased');
                nightSurvivorAISkill(a, dh, dt);
                nightMoveToward(a, nightFleeTarget(a), survSpd * (a.hitBoost > 0 ? NIGHT.hitBoost : 1), dt); return;
            }

            if (iAmRescuer) {
                let t = victim;
                let td = nightFlatDist(a.p, t.p);
                if (td < 12) {
                    // 目标被扛起来了：这次救援作废，进度归零
                    if (night.hunter && night.hunter.carrying === t) {
                        a.rescueProg = 0; t.healProg = 0; t.beingRescued = false;
                        return;
                    }
                    a.rescueProg += dt;
                    let downPick = t.downed && !t.onChair;
                    t.beingRescued = true;
                    if (downPick) t.healProg = Math.min(1, (t.healProg || 0) + dt / NIGHT.pickupTime);
                    if (downPick ? t.healProg >= 1 : a.rescueProg >= nightRescueTimeFor(a)) {
                        nightRescue(t);
                        if (a.charKey === 'meow') t.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000;
                        a.rescueProg = 0;
                    }
                } else {
                    a.rescueProg = 0; nightAISay(a, 'rescue');

                    if (a.charKey === 'meow' && a.hp >= 2 && (a.skillCd || 0) <= 0 &&
                        td <= SKILL.meowChargeRange && nightSameLevel(a.p, t.p) &&
                        nightClearShot(a.p, t.p)) {

                        let d = new THREE.Vector3().subVectors(t.p, a.p); d.y = 0;
                        if (d.lengthSq() > 0.01) {
                            d.normalize();
                            nightStep(a, d.x * Math.min(td, SKILL.meowChargeRange), d.z * Math.min(td, SKILL.meowChargeRange));
                            if (nightFlatDist(a.p, t.p) < 16) {
                                a.skillCd = SKILL.meowCd;
                                nightRescue(t);
                                t.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000;
                                nightAISay(a, 'rescue');
                            }
                            return;
                        }
                    }
                    nightMoveToward(a, t.p, survSpd, dt);
                }
                return;
            }
            a.rescueProg = 0;

            let order = nightOrder();
            if (order === 'heal') {

                if (a.charKey === 'cat' && (a.skillCd || 0) <= 0) {
                    let t = null, td = Infinity;
                    nightAliveSurvivors().forEach(function (o) {
                        if (o.onChair || (o.hp >= 2 && !o.downed)) return;
                        let d = nightFlatDist(a.p, o.p); if (d < td) { td = d; t = o; }
                    });
                    if (t) {
                        if (td <= SKILL.catHealRange) {
                            if (t.downed) nightRescue(t); else t.hp = 2;
                            a.skillCd = SKILL.catHealCd; nightRefreshFish();
                        } else { nightMoveToward(a, t.p, survSpd, dt); }
                        return;
                    }
                }
            } else if (order === 'come') {

                let me0 = night.survivors[0];
                if (me0 && me0 !== a && !me0.out && !me0.escaped && nightFlatDist(a.p, me0.p) > 26) {
                    nightMoveToward(a, me0.p, survSpd, dt); return;
                }
            } else if (order === 'door') {
                let od = null, ob = Infinity;
                gState.doors.forEach(function (o) {
                    let v = nightFlatDist({ x: o.x * TILE, z: o.z * TILE }, a.p);
                    if (o.open) v -= 80;
                    if (v < ob) { ob = v; od = o; }
                });
                if (od) {
                    let dd = Math.hypot(od.x * TILE - a.p.x, od.z * TILE - a.p.z);
                    if (dd < 20) {
                        if (nightSealed(od)) { /* 被封住了，只能等 */ }
                        else if (!od.open) { od.openProgress += dt; if (od.openProgress >= NIGHT.doorOpenTime) nightOpenDoor(od); }
                        else { a.escaped = true; if (a.mesh) a.mesh.visible = false; }
                    } else { nightAISay(a, 'toDoor'); nightMoveToward(a, new THREE.Vector3(od.x * TILE, a.p.y, od.z * TILE), survSpd, dt); }
                    return;
                }
            }

            if (a.hp >= 2 && !a.downed) {
                let sick = null, sd = Infinity;
                nightAliveSurvivors().forEach(function (o) {
                    if (o === a || o.downed || o.onChair || o.hp >= 2) return;
                    if (o.beingHealed && o.healer !== a) return;

                    if (nightMyFish(o).length >= SKILL.fishCount) return;
                    let d = nightFlatDist(a.p, o.p); if (d < sd) { sd = d; sick = o; }
                });
                let safe = sick && dh > DANGER_FAR && nightFlatDist(h.p, sick.p) > DANGER_FAR;
                if (safe && sd < 240) {
                    if (sd < 14) {

                        if (!sick.isPlayer) { sick.beingHealed = true; sick.healer = a; }
                        a.healT = (a.healT || 0) + dt;
                        if (a.healT >= SKILL.healTime) {
                            sick.hp = 2; a.healT = 0;
                            sick.beingHealed = false; sick.healer = null;
                            if (a.charKey === 'meow') sick.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000;
                            if (sick.isPlayer) nightFlash('队友把你治好了');
                            nightRefreshFish(); nightAISay(a, 'healed');
                        }
                    } else {
                        a.healT = 0;
                        nightAISay(a, a.charKey === 'cat' ? 'toHealCat' : 'toHeal');
                        nightMoveToward(a, sick.p, survSpd, dt);
                    }
                    return;
                }
                if (a.healT) { a.healT = 0; if (sick && sick.healer === a) { sick.beingHealed = false; sick.healer = null; } }
            }

            if (a.hp === 1) nightAISay(a, 'hurt');

            let myFish = nightMyFish(a);

            let anyDoorOpen = gState.doors.some(function (o) { return o.open; });
            if (myFish.length >= SKILL.fishCount && !inDanger && a.hp === 1 &&
                !anyDoorOpen && !nightMachinesLocked()) nightAISay(a, 'toFish');
            if (order !== 'repair' && a.hp === 1 && a.charKey !== 'cat' && myFish.length > 0) {
                if (nightEatFish(a)) return;
                let f = null, fd = Infinity;
                myFish.forEach(function (o) { let d = Math.hypot(o.p.x - a.p.x, o.p.z - a.p.z); if (d < fd) { fd = d; f = o; } });
                if (f && fd < 260) { nightMoveToward(a, new THREE.Vector3(f.p.x, a.p.y, f.p.z), survSpd, dt); return; }
            }

            let anyOpen = gState.doors.some(function (o) { return o.open; });
            if ((nightMachinesLocked() || anyOpen) && gState.doors.length > 0) {
                let d = null, best = Infinity;
                gState.doors.forEach(function (o) {
                    let v = Math.hypot(o.x * TILE - a.p.x, o.z * TILE - a.p.z);
                    if (o.open) v -= 80;
                    if (v < best) { best = v; d = o; }
                });
                let dd = Math.hypot(d.x * TILE - a.p.x, d.z * TILE - a.p.z);
                if (dd < 20) {
                    if (nightSealed(d)) { /* 被封住了 */ }
                    else if (!d.open) {
                        d.openProgress += dt;
                        if (d.openProgress >= NIGHT.doorOpenTime) nightOpenDoor(d);
                    } else {
                        a.escapeProg = (a.escapeProg || 0) + dt;
                        if (a.escapeProg >= NIGHT.escapeTime) { a.escaped = true; if (a.mesh) a.mesh.visible = false; }
                    }
                } else { a.escapeProg = 0; nightAISay(a, d.open ? 'doorOpen' : 'toDoor'); nightMoveToward(a, new THREE.Vector3(d.x * TILE, a.p.y, d.z * TILE), survSpd, dt); }
                return;
            }

            let ms = nightMachinesLocked() ? [] : gState.machines.filter(function (m) {
                return !m.done && nightObjSameLevel(m, a.gy);
            });
            if (ms.length === 0) return;

            let claimed = {};
            night.survivors.forEach(function (o) { if (o !== a && o.aiMachine && !o.aiMachine.done) claimed[o.aiMachine.x + ',' + o.aiMachine.z] = 1; });
            let cands = ms.filter(function (o) { return !claimed[o.x + ',' + o.z]; });
            if (cands.length === 0) cands = ms;

            let left = Math.max(1, NIGHT.needed - night.done);
            let progW = (left <= 2) ? 2.4 : 1.2;
            let m = null, best = -Infinity;
            cands.forEach(function (o) {
                let d = Math.hypot(o.x * TILE - a.p.x, o.z * TILE - a.p.z);
                let score = o.progress * progW - d * 0.35;
                if (o.c2Boost) score += 25;
                if (score > best) { best = score; m = o; }
            });
            if (!m) m = cands[0];
            a.aiMachine = m;

            let md = Math.hypot(m.x * TILE - a.p.x, m.z * TILE - a.p.z);
            if (md < 14) {
                nightAISay(a, 'repair');
                nightSurvivorAISkill(a, dh, dt);
                let mult = a.charKey === 'mi' ? SKILL.miRepairMult : 1;
                if (m.c2Boost) mult *= SKILL.c2BoostMul;
                mult *= nightC2MarkMul(a);
                mult *= nightSealSlow(a);
                m.progress = Math.min(100, m.progress + nightBaseRate() * mult * NIGHT.aiRepairFactor * nightSkillK().repair * dt * NIGHT.gamePerReal / nightActMul(a));
                nightAICalib(a, m, dt);
                nightAIMiBurst(a, m);
                nightCheckMachine(m);
            }
            else { a.calibT = 0; nightMoveToward(a, new THREE.Vector3(m.x * TILE, a.p.y, m.z * TILE), survSpd, dt); }
        }

        function nightAICalib(a, m, dt) {
            a.calibT = (a.calibT || 0) + dt;
            if (a.calibT < NIGHT.calibInterval) return;
            a.calibT = 0;
            let r = seededRandom();
            let buffed = night.t >= NIGHT.calibBuffAt;
            if (r < 0.45) m.progress = Math.min(100, m.progress + (buffed ? 5.5 : 4.5));
            else if (r < 0.88) m.progress = Math.min(100, m.progress + (buffed ? 4.5 : 3.5));
            else m.progress = m.progress + NIGHT.calibMiss;
        }

        function nightAIMiBurst(a, m) {
            if (a.charKey !== 'mi') return;
            if ((a.miCd || 0) > 0) return;
            a.miCd = SKILL.miBurstCd;
            m.progress = Math.min(100, m.progress + Math.max(SKILL.miBurstMin, night.done * SKILL.miBurstPer));
        }

        function nightSurvivorAISkill(a, dh, dt) {
            a.skillCd = Math.max(0, (a.skillCd || 0) - dt);
            if (a.skillCd > 0) return;

            a.reactT = (a.reactT || 0) - dt;
            if (a.reactT > 0) return;
            let h = night.hunter;

            if (a.charKey === 'cat') {
                let t = null;
                if (a.hp < 2) t = a;
                else {
                    nightAliveSurvivors().forEach(function (o) {
                        if (o === a || o.onChair) return;
                        if (o.hp >= 2 && !o.downed) return;
                        if (a.p.distanceTo(o.p) <= SKILL.catHealRange) t = o;
                    });
                }
                if (t) {
                    if (t.downed) nightRescue(t); else t.hp = 2;
                    a.skillCd = SKILL.catHealCd;
                }
                return;
            }

            if (a.charKey === 'dog') {
                if (dh <= NIGHT.atkRange + 10 && h.recover <= 0) {
                    a.blockArmed = 1.0;
                    a.skillCd = SKILL.dogBlockRecharge;
                }
                return;
            }

            if (a.charKey === 'c1') {
                let worth = (h.carrying && h.carrying !== a) || dh <= NIGHT.atkRange + 10;
                if (worth && nightC1Stun(a)) a.skillCd = SKILL.c1SaveCd;
                return;
            }

            if (a.charKey === 'c2') {
                let list = nightC2Options(a);
                if (list.length) {
                    let m2 = list[0];
                    list.forEach(function (o) { if (o.progress > m2.progress) m2 = o; });
                    m2.c2Boost = true; a.skillCd = SKILL.c2BoostCd;
                }
                return;
            }

            if (a.charKey === 'meow') {
                if (dh <= SKILL.meowChargeRange) {
                    let d = new THREE.Vector3().subVectors(a.p, h.p); d.y = 0;
                    if (d.lengthSq() > 0.01) {
                        d.normalize();
                        nightStep(a, d.x * SKILL.meowChargeRange, d.z * SKILL.meowChargeRange);
                        a.skillCd = SKILL.meowCd;
                    }
                }
                return;
            }
        }

        function nightActorsTick(dt) {
            let me = night.side === 'hunter' ? night.hunter : night.survivors[0];
            if (!night.spectating) me.p.copy(camera.position);

            let h = night.hunter;
            if (h.spearCd > 0) h.spearCd -= dt;
            if (h.spearLeft > 0) {
                let stepLen = Math.min(h.spearLeft, NIGHT.spearSpeed * dt);
                let before = h.p.clone();
                nightSpearTrailFx(h.p);
                nightStep(h, h.spearDir.x * stepLen, h.spearDir.z * stepLen);
                if (h.p.distanceTo(before) < stepLen * 0.5) h.spearLeft = 0; else h.spearLeft -= stepLen;
                if (h.isPlayer) camera.position.copy(h.p);

                if (h.spearLeft > 0) {
                    let victim = null, vd = Infinity;
                    nightAliveSurvivors().forEach(function (a) {
                        if (a.downed || a.onChair) return;
                        let d = nightFlatDist(h.p, a.p);
                        if (d < vd && nightCanHit(h.p, a.p, NIGHT.atkRange)) { vd = d; victim = a; }
                    });
                    if (victim) { nightDamage(victim); h.spearLeft = 0; h.recover = NIGHT.hitRecover; }
                }
            } else if (!h.isPlayer && !h.remote && netIsHost()) nightHunterAI(dt);
            else if (h.recover > 0) h.recover -= dt;

            night.survivors.forEach(function (a) {

                if (a.hangAnim) {
                    a.hangAnim.t += dt / 0.6;
                    let k = Math.min(1, a.hangAnim.t);
                    a.p.lerpVectors(a.hangAnim.from, a.hangAnim.to, k); a.p.y = 9;
                    nightSyncMesh(a);
                    if (a.mesh) a.mesh.position.y = 10 * Math.sin(k * Math.PI);
                    if (k >= 1) { a.hangAnim = null; if (a.mesh) { a.mesh.rotation.z = 0; a.mesh.position.y = 0; } }
                }
                if (a.hitBoost > 0) a.hitBoost -= dt;

                let rescuing = !!a.beingRescued;
                a.beingRescued = false;

                if (a.downed && !rescuing) {
                    a.healProg = Math.min(NIGHT.selfHealCap,
                        (a.healProg || 0) + dt / NIGHT.selfHealTime);
                }
                if (a.miCd > 0) a.miCd -= dt;
                if (a.blockArmed > 0) a.blockArmed -= dt;
                if (a.remote) return;
                if (a.downed && !rescuing) { a.bleed += dt; if (a.bleed >= NIGHT.bleedOut) { a.out = true; a.downed = false; if (a.mesh) a.mesh.visible = false; if (a.isPlayer) nightFlash('你流血倒地淘汰'); } }
                if (a.onChair && !rescuing) {

                    a.chairTime += dt;
                    if (a.chairTime >= NIGHT.chairStage) {
                        a.chairTime = 0; a.chairCount++;
                        if (a.chairCount >= 3) {
                            a.out = true; a.onChair = false;
                            if (a.chair) { a.chair.used = true; a.chair.occupant = null; nightTintGroup(a.chair.mesh, 0x333333); a.chair = null; }
                            if (a.mesh) a.mesh.visible = false;
                            if (a.isPlayer) {
                                nightFlash('你被淘汰了');
                                if (!a.everRescued) unlockEgg('chair_alone');
                            }
                        } else if (a.isPlayer) nightFlash('挂数 +1（' + a.chairCount + '/3）');
                    }
                }
                if (!a.isPlayer && !a.remote && netIsHost()) { if (a.vault) nightActorVaultTick(a, dt); else nightSurvivorAI(a, dt); }
            });

            let p0 = night.survivors[0];
            if (night.side === 'survivor' && (p0.out || p0.escaped) && !night.spectating) {
                nightEnterSpectate(p0.escaped ? '你已撤离 —— 继续观战队友' : '你已被淘汰 —— 继续观战队友');
            }

            if (night.spectating) {
                let list = nightSpectateTargets();
                if (list.length > 0) {
                    if (night.spectateIdx >= list.length) night.spectateIdx = 0;
                    let t = list[night.spectateIdx];
                    camera.position.set(t.p.x, t.p.y + 4, t.p.z);

                    night.survivors.forEach(function (a) {
                        if (a.mesh && !a.out && !a.escaped) a.mesh.visible = (a !== t);
                        if (a.xray) a.xray.visible = (a !== t);
                    });
                }
                nightApplySpectate();
            }
            else if (night.side === 'hunter') camera.position.copy(h.p);
            else if (p0.downed || p0.onChair) camera.position.copy(p0.p);

            let escaped = night.survivors.filter(function (a) { return a.escaped; }).length;
            let left = nightAliveSurvivors().length;

            let active = night.survivors.filter(function (a) {
                return !a.out && !a.escaped && !a.onChair && !a.downed;
            }).length;

            if (left === 0 || active === 0) {
                let txt = escaped >= NIGHT.winEscapes
                    ? '逃生者获胜 —— ' + escaped + ' 人成功撤离。'
                    : (escaped >= 2 ? '平局 —— ' + escaped + ' 人撤离。'
                        : '追捕获胜 —— 逃生者仅 ' + escaped + ' 人撤离。');
                endNightGame(txt);
            }
        }

        function nightReachableCell(o) {

            let oy = (o.gy !== undefined) ? (EYE_H + o.gy) : nightEyeAt(o.x * TILE, o.z * TILE);
            return Math.abs(oy - camera.position.y) < DECK_H / 2;
        }
        function nightNearest(list) {
            let best = null, bestD = Infinity;
            list.forEach(function (o) {
                if (!nightReachableCell(o)) return;
                let d = Math.hypot(o.x * TILE - camera.position.x, o.z * TILE - camera.position.z);
                if (d < bestD) { bestD = d; best = o; }
            });
            return { obj: best, dist: bestD };
        }

        function nightMove(dt) {
            if (night.spectating || night.stun > 0 || night.repairing || night.doorTarget || night.action) return;

            if (night.side === 'survivor' && night.survivors[0].onChair) return;

            if (night.side === 'hunter' && night.hunter.recover > 0) return;
            if (night.side === 'hunter' && (night.hunter.hookPull || night.hunter.hookMove)) return;
            if (night.c2Cast) return;
            if (night.tpCast) return;
            let me0 = night.survivors[0];
            let speed = (night.side === 'survivor' && me0.downed) ? NIGHT.crawl : (night.side === 'hunter' ? nightHunterSpeed() : NIGHT.surv);
            if (night.hitBoost > 0) speed *= NIGHT.hitBoost;
            if (night.boostT > 0) speed *= SKILL.dogRescueBoost;
            if (me0.slowUntil && performance.now() < me0.slowUntil) speed *= SKILL.hgouSpikeSlow;

            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1; if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let len = Math.hypot(strafe, fwd); if (len > 1) { strafe /= len; fwd /= len; }
            if (fwd === 0 && strafe === 0) return;

            let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;

            if (night.char === 'c1' && nightTowardHunter(me0.p, mx, mz)) speed *= SKILL.c1TowardMul;
            let step = new THREE.Vector3(mx, 0, mz).normalize().multiplyScalar(speed * dt);

            let me0self = night.side === 'hunter' ? night.hunter : me0;
            let tooHigh = function (nx, nz) {
                if (nightStairRail(me0self, nx, nz)) return true;
                let want = nightSurface(nx, nz, me0self.level || 0);
                return want - (me0self.gy || 0) > NIGHT_STEP_UP;
            };
            let px2 = camera.position.x + step.x + Math.sign(step.x) * P_RADIUS;
            let pz2 = camera.position.z + step.z + Math.sign(step.z) * P_RADIUS;
            if (!blockedX(camera.position.x + step.x, camera.position.z, camera.position.y, Math.sign(step.x) || 1) &&
                !nightDroppedPalletAt(px2, camera.position.z, me0self.gy || 0) &&
                !tooHigh(px2, camera.position.z)) camera.position.x += step.x;
            if (!blockedZ(camera.position.x, camera.position.z + step.z, camera.position.y, Math.sign(step.z) || 1) &&
                !nightDroppedPalletAt(camera.position.x, pz2, me0self.gy || 0) &&
                !tooHigh(camera.position.x, pz2)) camera.position.z += step.z;
        }

        function nightC1Stun(user) {
            let h = night.hunter;
            if (!h) return false;
            if (!nightSameLevel(user.p, h.p)) return false;
            if (nightFlatDist(user.p, h.p) > SKILL.c1StunRange) return false;
            nightStunHunter(SKILL.c1StunTime, '震慑');
            if (user.isPlayer) night.hitBoost = SKILL.c1BoostTime;
            else user.hitBoost = SKILL.c1BoostTime;
            return true;
        }

        function nightC2Mark() {
            night.c2Mark = null;
            let has = night.survivors.some(function (a) { return a.charKey === 'c2'; });
            if (!has) return;
            let pool = night.survivors.filter(function (a) { return a.charKey !== 'c2'; });
            if (!pool.length) return;
            night.c2Mark = pool[Math.floor(seededRandom() * pool.length)];
        }
        function nightC2MarkMul(a) {
            return (night.c2Mark && night.c2Mark === a) ? SKILL.c2MarkMul : 1;
        }

        function nightMachineHasDigger(m, except) {
            if (night.repairing === m && night.survivors[0] !== except) return true;
            return night.survivors.some(function (o) {
                if (o === except) return false;
                if (o.remote) return (o.netRep !== undefined && gState.machines[o.netRep] === m);
                return !o.isPlayer && !o.out && !o.escaped && !o.downed && !o.onChair &&
                    o.aiMachine === m && Math.hypot(m.x * TILE - o.p.x, m.z * TILE - o.p.z) < 14;
            });
        }

        function nightC2Options(me) {
            return gState.machines.filter(function (m) {
                return !m.done && !m.c2Boost && nightMachineHasDigger(m, me);
            });
        }

        function nightC2CastTick(dt) {
            let c = night.c2Cast; if (!c) return;
            c.t += dt;
            if (c.phase === 'pre' && c.t >= SKILL.c2CastPre) { c.phase = 'pick'; c.t = 0; }
            else if (c.phase === 'post' && c.t >= SKILL.c2CastPost) { night.c2Cast = null; }
        }
        function nightC2Cycle(dir) {
            let c = night.c2Cast; if (!c || c.phase !== 'pick' || !c.list.length) return;
            c.idx = ((c.idx + dir) % c.list.length + c.list.length) % c.list.length;
            let m = c.list[c.idx];
            nightFlash('矿机 ' + (c.idx + 1) + '/' + c.list.length + '　进度 ' + m.progress.toFixed(0));
        }
        function nightC2Confirm() {
            let c = night.c2Cast;
            if (!c || c.phase !== 'pick') return false;
            let m = c.list[c.idx];
            if (m && !m.done) {
                m.c2Boost = true;
                night.c2Cd = SKILL.c2BoostCd;
                nightFlash('矿机提速 ×' + SKILL.c2BoostMul);
            }
            c.phase = 'post'; c.t = 0;
            return true;
        }

        function nightC2BoostTick() {
            gState.machines.forEach(function (m) {
                if (m.c2Boost && !nightMachineHasDigger(m)) m.c2Boost = false;
            });
        }

        function nightTowardHunter(from, mx, mz) {
            let h = night.hunter; if (!h) return false;
            let dx = h.p.x - from.x, dz = h.p.z - from.z;
            let l = Math.hypot(dx, dz), ml = Math.hypot(mx, mz);
            if (l < 1 || ml < 0.001) return false;
            return (dx / l) * (mx / ml) + (dz / l) * (mz / ml) > 0.35;
        }

        function nightBaseRate() { return night.t >= NIGHT.rateBoostAt ? NIGHT.baseRateLate : NIGHT.baseRateEarly; }

        function nightStartCalib() { night.calib = { pos: 0 }; night.nextCalibAt = NIGHT.calibInterval; }

        function nightApplyCalib(zone) {
            let m = night.repairing; if (!m) return;
            let gain = calibGain(zone, night.t);
            m.progress = Math.min(100, m.progress + gain);
            if (zone === 'red') nightShowMsg('红区 +' + gain, '#ff5fbd', 700);
            else if (zone === 'white') nightShowMsg('白区 +' + gain, '#8ef58e', 700);
            else {
                nightShowMsg('校准失败 ' + gain + '，眩晕 2 秒', '#ff6b6b', 700);
                night.stun = NIGHT.calibStun; night.repairing = null; night.calib = null;
            }
            nightCheckMachine(m);
        }

        function nightCheckMachine(m) {
            if (m.progress < 100 || m.done) return;
            m.progress = 100; m.done = true; night.done++;
            night.repairing = null; night.calib = null;
            m.mesh.material.color.setHex(0x2ecc71);
            if (night.done >= NIGHT.needed) {

                gState.machines.forEach(function (o) { if (!o.done) o.mesh.material.color.setHex(0x555555); });
                nightFlash('逃生门已开启！'); sfxMechanism();
            } else { nightFlash('矿机修好了！' + night.done + ' / ' + NIGHT.needed); sfxChime(2); }
        }

        function nightMachinesLocked() { return night.done >= NIGHT.needed; }

        function nightOpenDoor(d) {
            if (d.open) return;
            d.open = true;
            d.mesh.material.color.setHex(0x2ecc71);
            if (d.lintel) { d.lintel.material.color.setHex(0x69f0ae); d.lintel.material.emissive.setHex(0x00391c); }
            nightFlash('逃生门已开启！走进去撤离'); sfxMechanism();
        }

        function nightCalibPress() {
            if (!night || !night.calib) return;
            let zone = calibZoneAt(night.calib.pos); night.calib = null; nightApplyCalib(zone);
        }

        function nightInteract() {
            if (!night || night.spectating || night.stun > 0) return;
            if (night.c2Cast) { nightC2Confirm(); return; }
            if (night.action) return;

            if (night.side === 'survivor') {
                let s = night.survivors[0];
                if (s.onChair || s.out) { night.repairing = null; night.calib = null; night.action = null; return; }
                if (s.downed) {
                    night.repairing = null; night.calib = null; night.action = null;
                    let dd = nightNearest(gState.doors);
                    if (dd.obj && dd.dist < 20 && dd.obj.open) { night.doorTarget = dd.obj; }
                    return;
                }
            }
            if (night.repairing) { night.repairing = null; night.calib = null; return; }
            if (night.doorTarget) { night.doorTarget = null; return; }

            if (night.side === 'survivor') {
                let me = night.survivors[0];

                if (nightEatFish(me)) return;

                let hurt = night.survivors.filter(function (a) { return !a.isPlayer && !a.out && !a.escaped && (a.downed || a.onChair); });
                let t = null, td = Infinity;
                hurt.forEach(function (a) {
                    if (!nightSameLevel(camera.position, a.p)) return;
                    let d = nightFlatDist(camera.position, a.p); if (d < td) { td = d; t = a; }
                });
                if (t && td < 16) { night.action = { type: 'rescue', t: 0, target: t }; return; }

                let sick = null, sd = Infinity;
                night.survivors.forEach(function (a) {
                    if (a.isPlayer || a.out || a.escaped || a.onChair || a.downed || a.hp >= 2) return;
                    if (!nightSameLevel(camera.position, a.p)) return;
                    let d = nightFlatDist(camera.position, a.p); if (d < sd) { sd = d; sick = a; }
                });
                if (sick && sd < 16) { sick.beingHealed = true; night.action = { type: 'heal', t: 0, target: sick }; return; }
            }

            let up = nightNearest(gState.pallets.filter(function (p) { return p.state === 'up'; }));
            let down = nightNearest(gState.pallets.filter(function (p) { return p.state === 'down'; }));
            if (night.side === 'survivor') {
                if (up.obj && up.dist < 16) {
                    if (nightSealed(up.obj)) { nightFlash('这块板被封住了'); return; }
                    nightDropPallet(up.obj); return;
                }
                if (down.obj && down.dist < 20) {
                    let to = nightVaultLanding(down.obj);
                    if (!to) { nightFlash('两边都落不下脚，翻不过去'); return; }

                    night.action = { type: 'vault', t: 0, target: down.obj, from: camera.position.clone(), to: to };
                    return;
                }
            } else if (down.obj && down.dist < 16) { night.action = { type: 'break', t: 0, target: down.obj }; return; }

            let m = nightNearest(gState.machines.filter(function (o) { return !o.done; }));
            if (m.obj && m.dist < 16 && !nightMachinesLocked()) { night.repairing = m.obj; night.calib = null; night.nextCalibAt = NIGHT.firstCalibDelay; return; }

            let d = nightNearest(gState.doors);
            if (d.obj && d.dist < 20) {
                if (night.done < NIGHT.needed) { nightFlash('还需要修好 ' + (NIGHT.needed - night.done) + ' 台矿机'); return; }
                night.doorTarget = d.obj; return;
            }
        }

        function nightAddFx(mesh, life) {
            mesh.material.transparent = true;
            scene.add(mesh);
            night.fx.push({ mesh: mesh, t: 0, life: life });
        }

        function nightFxTick(dt) {
            for (let i = night.fx.length - 1; i >= 0; i--) {
                let f = night.fx[i]; f.t += dt;
                let k = 1 - f.t / f.life;
                if (k <= 0) { scene.remove(f.mesh); night.fx.splice(i, 1); continue; }
                f.mesh.material.opacity = k;
                f.mesh.scale.setScalar(1 + (1 - k) * 0.6);
            }
        }

        function nightSlashFx(from, dir, hit) {
            let g = new THREE.RingGeometry(NIGHT.atkRange * 0.35, NIGHT.atkRange * 1.1, 14, 1, -0.9, 1.8);
            let m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: hit ? 0xff4d4d : 0xbbbbbb, side: THREE.DoubleSide, opacity: 0.9, transparent: true }));
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = -Math.atan2(dir.z, dir.x);
            m.position.set(from.x, 7, from.z);
            nightAddFx(m, 0.28);
        }

        function nightSpearTrailFx(pos) {
            let m = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5),
                new THREE.MeshBasicMaterial({ color: 0xff7043, opacity: 0.55, transparent: true }));
            m.position.set(pos.x, 6, pos.z);
            nightAddFx(m, 0.35);
        }

        function nightEggTick(dt) {
            if (night.side !== 'survivor' || night.spectating) { night.eggHold = 0; return; }
            let me = night.survivors[0];
            if (me.downed || me.onChair || me.out || me.escaped) { night.eggHold = 0; return; }
            if (EGG_PAIRS[night.char] !== night.hunterChar) { night.eggHold = 0; return; }
            if (gState.eggs && gState.eggs['pair_' + night.char]) { night.eggHold = 0; return; }

            let h = night.hunter;
            let d = h.p.distanceTo(me.p);
            let moving = keys['w'] || keys['a'] || keys['s'] || keys['d'] || tMove.x || tMove.y;

            let fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
            let to = new THREE.Vector3().subVectors(h.p, me.p).setY(0);
            let facing = to.lengthSq() > 0.01 && fwd.dot(to.normalize()) > 0.6;

            if (d <= 14 && !moving && facing && night.action === null && !night.repairing) {
                night.eggHold = (night.eggHold || 0) + dt;
                nightFlash('对视中… ' + night.eggHold.toFixed(1) + ' / 3.0');
                if (night.eggHold >= 3) { night.eggHold = 0; unlockEgg('pair_' + night.char); }
            } else night.eggHold = 0;
        }

        function nightIndicatorTick(dt) {
            let h = night.hunter;

            if (night.side === 'hunter' && !night.spectating) {
                if (!night.rangeRing) {
                    let g = new THREE.Mesh(new THREE.RingGeometry(NIGHT.atkRange - 1, NIGHT.atkRange, 28),
                        new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
                    g.rotation.x = -Math.PI / 2; scene.add(g); night.rangeRing = g;
                }
                if (!night.spearRing) {
                    let g2 = new THREE.Mesh(new THREE.RingGeometry(NIGHT.spearRange - 1, NIGHT.spearRange, 40),
                        new THREE.MeshBasicMaterial({ color: 0xff9e40, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
                    g2.rotation.x = -Math.PI / 2; scene.add(g2); night.spearRing = g2;
                }
                let showAtk = h.recover <= 0 && h.spearLeft <= 0 && !night.action;
                night.rangeRing.visible = showAtk;
                if (showAtk) night.rangeRing.position.set(h.p.x, 1, h.p.z);
                let showSpear = nightHC() === 'hunter' && h.spearCd <= 0 && showAtk;
                night.spearRing.visible = showSpear;
                if (showSpear) night.spearRing.position.set(h.p.x, 0.8, h.p.z);
            } else {
                if (night.rangeRing) night.rangeRing.visible = false;
                if (night.spearRing) night.spearRing.visible = false;
            }

            if (!night.stunRing) {
                let g = new THREE.Group();
                for (let i = 0; i < 3; i++) {
                    let s = new THREE.Mesh(new THREE.OctahedronGeometry(1.7),
                        new THREE.MeshBasicMaterial({ color: 0xffd54f }));
                    s.position.set(Math.cos(i / 3 * Math.PI * 2) * 5, 0, Math.sin(i / 3 * Math.PI * 2) * 5);
                    g.add(s);
                }
                g.visible = false; scene.add(g); night.stunRing = g;
            }
            let stunned = h.recover > 0;
            night.stunRing.visible = stunned;
            if (stunned) {
                night.stunRing.position.set(h.p.x, 19, h.p.z);
                night.stunRing.rotation.y += dt * 5;
            }

            night.survivors.forEach(function (a) {
                if (!a.shield) {
                    a.shield = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8),
                        new THREE.MeshBasicMaterial({ color: 0x64b5f6, wireframe: true, transparent: true, opacity: 0.55 }));
                    a.shield.visible = false; scene.add(a.shield);
                }
                let on = !a.out && !a.escaped && a.tempHpUntil && performance.now() < a.tempHpUntil;
                a.shield.visible = !!on;
                if (on) { a.shield.position.set(a.p.x, 6, a.p.z); a.shield.rotation.y += dt * 1.2; }

                if (a.mesh && !a.onChair && !a.hangAnim) a.mesh.scale.y = a.downed ? 0.22 : 1;

                if (a.xray) {
                    a.xray.visible = !a.out && !a.escaped;
                    a.xray.position.set(a.p.x, a.mesh ? a.mesh.position.y : 0, a.p.z);
                    a.xray.scale.y = a.downed ? 0.22 : 1;
                }
            });
        }

        function nightHealBarTick() {
            let act = night.action;
            let show = act && act.type === 'heal';
            if (!show) {
                if (night.healBar) { scene.remove(night.healBar.bg); scene.remove(night.healBar.fill); night.healBar = null; }
                return;
            }
            if (!night.healBar) {
                let bg = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 0.6), new THREE.MeshBasicMaterial({ color: 0x222222 }));
                let fill = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 0.9), new THREE.MeshBasicMaterial({ color: 0x5cb85c }));
                scene.add(bg); scene.add(fill);
                night.healBar = { bg: bg, fill: fill };
            }
            let t = act.target, k = Math.min(1, act.t / SKILL.healTime);
            let y = 20;
            night.healBar.bg.position.set(t.p.x, y, t.p.z);
            night.healBar.fill.scale.x = Math.max(0.001, k);
            night.healBar.fill.position.set(t.p.x - 7 * (1 - k), y, t.p.z);
            [night.healBar.bg, night.healBar.fill].forEach(function (m) { m.quaternion.copy(camera.quaternion); });
        }

        function nightStunHunter(seconds, why, fromNet) {
            let h = night.hunter;
            if (netOn() && !fromNet) netEvent('stun', { sec: seconds });
            h.recover = Math.max(h.recover, seconds);
            h.spearLeft = 0;
            nightStunFx(h.p);
            if (h.carrying) {
                let a = h.carrying; h.carrying = null;
                a.struggle = 0;
                a.downed = true; a.bleed = 0; nightSyncMesh(a);
                if (a.mesh) { a.mesh.rotation.z = 0; a.mesh.position.y = 0; }
                nightFlash((why || '眩晕') + ' —— 队友被救下了！');
            } else if (why) nightFlash(why + '　追捕眩晕 ' + seconds + ' 秒');
        }

        function nightStunFx(pos) {
            let m = new THREE.Mesh(new THREE.TorusGeometry(4, 0.8, 6, 14),
                new THREE.MeshBasicMaterial({ color: 0xffd54f, opacity: 0.9, transparent: true }));
            m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 17, pos.z);
            nightAddFx(m, 0.8);
        }

        function nightHunterAttack() {
            if (!night || night.over || night.side !== 'hunter') return;
            let h = night.hunter;
            if (h.recover > 0 || h.spearLeft > 0 || night.action) return;
            let hit = null, bestD = Infinity;
            nightAliveSurvivors().forEach(function (a) {
                if (a.onChair || a.downed) return;
                let d = nightFlatDist(h.p, a.p);
                if (d < bestD && nightCanHit(h.p, a.p, NIGHT.atkRange)) { bestD = d; hit = a; }
            });
            let aim = new THREE.Vector3(); camera.getWorldDirection(aim); aim.y = 0; aim.normalize();
            if (hit) {
                nightSlashFx(h.p, aim, true);
                nightDamage(hit); h.recover = NIGHT.hitRecover; nightFlashHunter('命中！');
            } else { nightSlashFx(h.p, aim, false); h.recover = NIGHT.whiffRecover; nightFlashHunter('空刀'); }
        }

        function nightHunterBreak() {
            if (!night || night.over || night.side !== 'hunter') return;
            if (night.action || night.hunter.recover > 0) return;
            let pd = nightNearest(gState.pallets.filter(function (p) { return p.state === 'down'; }));

            if (pd.obj && pd.dist < NIGHT.palletBreakRange) night.action = { type: 'break', t: 0, target: pd.obj };
            else nightFlashHunter('附近没有放倒的板子');
        }

        function nightHunterGrab() {
            if (!night || night.over || night.side !== 'hunter') return;
            let h = night.hunter;
            if (h.recover > 0 || h.spearLeft > 0 || night.action) return;
            if (h.carrying) {
                let free = gState.chairs.filter(function (c) { return !c.used && !c.occupant; });
                let best = null, bd = Infinity;
                free.forEach(function (c) { let d = Math.hypot(c.x * TILE - h.p.x, c.z * TILE - h.p.z); if (d < bd) { bd = d; best = c; } });
                if (!best) { nightFlashHunter('场上没有空椅子了'); return; }
                if (bd > 20) { nightFlashHunter('离椅子还有 ' + Math.round(bd / 8) + ' 身位'); return; }
                let a = h.carrying; h.carrying = null; nightPutOnChair(a);
                return;
            }
            let t = null, bd = Infinity;
            nightAliveSurvivors().forEach(function (a) {
                if (!a.downed || a.onChair) return;
                let d = nightFlatDist(h.p, a.p);
                if (d < bd && nightCanHit(h.p, a.p, NIGHT.atkRange + 6)) { bd = d; t = a; }
            });
            if (!t) { nightFlashHunter('附近没有倒地的人'); return; }
            h.carrying = t; h.recover = 0.5; { nightFlashHunter('已抓起'); introOnce('night.carry', '抓起来了', '扛到椅子边，按 ' + nightKey('space') + ' 挂上去。'); }
        }

        function nightHC() { return night.side === 'hunter' ? night.char : (night.hunterChar || 'hunter'); }

        function nightHunterSpeed() {
            let hc = nightHC();
            let extra = 1;
            let now = performance.now();
            if (night.tpBoostUntil && now < night.tpBoostUntil) extra *= SKILL.hmiTpBoost;
            if (night.hookBoostUntil && now < night.hookBoostUntil) extra *= SKILL.h3Boost;

            let s = NIGHT.surv * NIGHT.hunterSpdMul * (NIGHT_CHARS[hc] && NIGHT_CHARS[hc].spd || 1) * extra;

            if (hc === 'hunter' && night.rushT > 0) s *= SKILL.maoRushBoost;

            if (hc === 'hgou' && gState.chairs.some(function (c) { return c.occupant; })) s *= SKILL.hgouChairBoost;
            return s;
        }

        function nightCd(v) { return v; }

        function nightActMul(actor) {
            if (actor && actor.slowUntil && performance.now() < actor.slowUntil) return SKILL.hgouSpikeActMul;
            return 1;
        }

        function nightRescueTimeFor(actor) {
            let base = (night.char === 'meow' && actor === night.survivors[0]) ? SKILL.meowRescueTime : NIGHT.rescueTime;
            return base * nightActMul(actor);
        }

        function nightPlaceSpike() {
            if (night.spikeCd > 0) { nightFlashHunter('钉刺冷却 ' + night.spikeCd.toFixed(0) + 's'); return; }
            if (night.spikes.length >= SKILL.hgouSpikeMax) {
                let old = night.spikes.shift(); scene.remove(old.mesh);
            }
            let h = night.hunter;
            let m = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 5), new THREE.MeshLambertMaterial({ color: 0x555555 }));
            m.position.set(h.p.x, 3, h.p.z); scene.add(m);
            night.spikes.push({ p: h.p.clone(), mesh: m, life: SKILL.hgouSpikeLife, rearm: 0 });
            night.spikeCd = nightCd(SKILL.hgouSpikeCd);
            nightFlashHunter('埋下钉刺（' + night.spikes.length + '/' + SKILL.hgouSpikeMax + '）');
        }

        function nightSpikeTick(dt) {
            for (let i = night.spikes.length - 1; i >= 0; i--) {
                let s = night.spikes[i]; s.life -= dt;
                if (s.life <= 0) { scene.remove(s.mesh); night.spikes.splice(i, 1); continue; }
                s.mesh.rotation.y += dt * 2;
                if (s.rearm > 0) { s.rearm -= dt; s.mesh.scale.setScalar(0.45); continue; }
                s.mesh.scale.setScalar(1);
                nightAliveSurvivors().forEach(function (a) {
                    if (a.onChair || a.downed || s.rearm > 0) return;
                    if (Math.hypot(s.p.x - a.p.x, s.p.z - a.p.z) < SKILL.hgouSpikeRange) {
                        a.slowUntil = performance.now() + SKILL.hgouSpikeSlowTime * 1000;
                        s.rearm = SKILL.hgouSpikeRearm;
                        if (a.isPlayer) nightFlash('踩到钉刺！减速 ' + SKILL.hgouSpikeSlowTime + ' 秒，位置暴露');
                    }
                });
            }
        }

        function nightTpTargets() { return gState.machines.filter(function (m) { return !m.done; }); }

        function nightCycleTpTarget(dir) {
            let list = nightTpTargets(); if (list.length === 0) return;
            night.tpIndex = ((night.tpIndex + dir) % list.length + list.length) % list.length;
            let m = list[night.tpIndex];
            nightTpMark(m);
            nightFlashHunter('跃迁目标：矿机 ' + (night.tpIndex + 1) + '/' + list.length + '　进度 ' + m.progress.toFixed(0));
        }

        function nightTpMarkTick() {
            if (nightHC() !== 'hmi' || night.side !== 'hunter') return;
            let list = nightTpTargets();
            if (!list.length) { nightTpMark(null); return; }
            if (night.tpIndex >= list.length) night.tpIndex = 0;
            nightTpMark(list[night.tpIndex]);
        }

        function nightTpLanding(m) {
            let cx = m.x * TILE, cz = m.z * TILE;
            let ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (let f of [1, 1.4]) {
                for (let v of ring) {
                    let tx = cx + v[0] * TILE * f, tz = cz + v[1] * TILE * f;
                    if (checkCol(tx, tz, 9, 0)) continue;
                    if (nightDroppedPalletAt(tx, tz)) continue;
                    if (blockedX(tx, tz, 9, 1) || blockedX(tx, tz, 9, -1)) continue;
                    if (blockedZ(tx, tz, 9, 1) || blockedZ(tx, tz, 9, -1)) continue;
                    return new THREE.Vector3(tx, nightEyeAt(tx, tz), tz);
                }
            }
            return null;
        }

        function nightHunterTeleport() {
            if (night.tpCast) { nightFlashHunter('正在跃迁'); return; }
            if (night.tpCd > 0) { nightFlashHunter('跃迁冷却 ' + night.tpCd.toFixed(0) + 's'); return; }
            let list = nightTpTargets();
            if (list.length === 0) { nightFlashHunter('没有可跃迁的矿机'); return; }
            if (night.tpIndex >= list.length) night.tpIndex = 0;
            let best = list[night.tpIndex];
            let to = nightTpLanding(best);
            if (!to) { nightFlashHunter('那台机子周围没有落脚的地方'); return; }
            night.tpCast = { t: 0, m: best, to: to, from: night.hunter.p.clone() };

            if (night.hunter.mesh) night.hunter.mesh.visible = false;
            if (night.hunter.xray) night.hunter.xray.visible = false;
            nightTpMark(best);

            let ring = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 6, 20),
                new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.9 }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(best.x * TILE, 16, best.z * TILE);
            nightAddFx(ring, SKILL.hmiTpCast);
            nightFlashHunter('跃迁读条 ' + SKILL.hmiTpCast + ' 秒…');
        }

        function nightTpMark(m) {
            if (night.side !== 'hunter') return;
            gState.machines.forEach(function (o) {
                if (!o.mesh || !o.mesh.material) return;
                if (o === m) { o.mesh.material.color.setHex(0xff3b30); o.mesh.material.emissive.setHex(0x4a0000); }
                else if (!o.done) { o.mesh.material.color.setHex(0xffffff); o.mesh.material.emissive.setHex(0x000000); }
            });
        }

        function nightTpTick(dt) {
            let c = night.tpCast; if (!c) return;
            let h = night.hunter;
            c.t += dt;

            let u = Math.min(1, c.t / SKILL.hmiTpCast);
            let e = u * u * (3 - 2 * u);
            h.p.x = c.from.x + (c.to.x - c.from.x) * e;
            h.p.z = c.from.z + (c.to.z - c.from.z) * e;
            h.gy = (c.from.y - EYE_H) + ((c.to.y - EYE_H) - (c.from.y - EYE_H)) * e;
            h.p.y = EYE_H + h.gy;
            if (h.mesh) h.mesh.visible = false;
            nightSyncMesh(h);
            if (h.isPlayer) camera.position.copy(h.p);
            if (u < 1) return;
            night.tpCast = null;
            if (h.mesh) h.mesh.visible = true;
            if (h.xray) h.xray.visible = true;
            h.p.copy(c.to); h.gy = c.to.y - EYE_H; nightSyncMesh(h);
            if (h.isPlayer) camera.position.copy(h.p);
            night.tpCd = nightCd(SKILL.hmiTpCd);
            night.tpBoostUntil = performance.now() + SKILL.hmiTpBoostTime * 1000;
            nightStunFx(h.p);
            nightFlashHunter('跃迁完成 —— 加速 ' + SKILL.hmiTpBoostTime + ' 秒');
        }

        function nightThrowSpear() {
            if (night.spear) { nightFlashHunter('长矛还在外面'); return; }
            if (night.throwCd > 0) { nightFlashHunter('投矛冷却 ' + night.throwCd.toFixed(0) + 's'); return; }
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 12), new THREE.MeshLambertMaterial({ color: 0xcfcfcf }));
            m.position.set(night.hunter.p.x, 8, night.hunter.p.z); scene.add(m);
            night.spear = { p: m.position, dir: dir, left: SKILL.hmeowThrowRange, mesh: m };
            night.throwCd = nightCd(SKILL.hmeowThrowCd);
        }

        function nightSpearTick(dt) {
            let s = night.spear; if (!s) return;
            let step = Math.min(s.left, SKILL.hmeowThrowSpeed * dt);
            let nx = s.p.x + s.dir.x * step, nz = s.p.z + s.dir.z * step;

            if (checkCol(nx, nz, 9, 0)) { nightLandSpear(s); return; }
            s.p.set(nx, 8, nz); s.left -= step;
            s.mesh.lookAt(nx + s.dir.x, 8, nz + s.dir.z);
            let hit = null, hd = Infinity;
            nightAliveSurvivors().forEach(function (a) {
                if (a.onChair) return;
                let d = Math.hypot(s.p.x - a.p.x, s.p.z - a.p.z);
                if (d < 8 && d < hd && nightSameLevel(s.p, a.p)) { hd = d; hit = a; }
            });
            if (hit) {
                scene.remove(s.mesh); night.spear = null;
                nightDamage(hit);
                nightFlashHunter('投矛命中');
                return;
            }
            if (s.left <= 0) nightLandSpear(s);
        }

        function nightLandSpear(s) {
            s.mesh.position.y = 3; s.mesh.rotation.set(0, s.mesh.rotation.y, Math.PI / 2.2);

            night.spear = null;
            s.mesh.position.y = 3;
            nightAddFx(s.mesh, 1.0);
            nightFlashHunter('投矛落空');
        }

        function nightSeal() {
            let h = night.hunter;
            if (night.sealCd > 0) { nightFlashHunter('封锁冷却 ' + night.sealCd.toFixed(0) + 's'); return; }
            let best = null, bd = Infinity, kind = '';
            gState.pallets.forEach(function (q) {
                if (q.state !== 'up' || !nightPalletSameLevel(q, h.gy)) return;
                let d = Math.hypot(q.x * TILE - h.p.x, q.z * TILE - h.p.z);
                if (d < bd && d <= SKILL.h4SealRange) { bd = d; best = q; kind = '板子'; }
            });
            gState.doors.forEach(function (o) {
                if (o.open) return;
                let d = Math.hypot(o.x * TILE - h.p.x, o.z * TILE - h.p.z);
                if (d < bd && d <= SKILL.h4SealRange) { bd = d; best = o; kind = '逃生门'; }
            });
            if (!best) { nightFlashHunter('附近没有可封的板子或门'); return; }
            best.sealedUntil = performance.now() + SKILL.h4SealTime * 1000;
            night.sealCd = nightCd(SKILL.h4SealCd);
            nightSealFx(best);
            nightFlashHunter('封住了一' + (kind === '板子' ? '块板子' : '道门') + '　' + SKILL.h4SealTime + ' 秒');
        }
        function nightSealed(o) { return !!(o && o.sealedUntil && performance.now() < o.sealedUntil); }

        function nightSealSlow(a) {
            if (nightHC() !== 'h4' || !a) return 1;
            let hit = null;
            let inAura = function (o) {
                return nightSealed(o) &&
                    Math.hypot(o.x * TILE - a.p.x, o.z * TILE - a.p.z) <= SKILL.h4AuraRange;
            };
            gState.pallets.forEach(function (q) { if (!hit && inAura(q)) hit = q; });
            gState.doors.forEach(function (o) { if (!hit && inAura(o)) hit = o; });
            if (!hit) return 1;

            let n = nightAliveSurvivors().filter(function (o) {
                return !o.downed && !o.onChair &&
                    Math.hypot(hit.x * TILE - o.p.x, hit.z * TILE - o.p.z) <= SKILL.h4AuraRange;
            }).length;
            return 1 - Math.min(SKILL.h4AuraMax, SKILL.h4AuraPer * n);
        }
        function nightSealFx(o) {
            let m = new THREE.Mesh(new THREE.TorusGeometry(11, 1.4, 6, 18),
                new THREE.MeshBasicMaterial({ color: 0x7e57c2, transparent: true, opacity: 0.9 }));
            m.rotation.x = -Math.PI / 2;
            m.position.set(o.x * TILE, 14 + (o.gy || 0), o.z * TILE);
            nightAddFx(m, 1.2);
        }

        function nightSealTick() {
            let tint = function (o, on) {
                let mesh = o.mesh;
                if (!mesh) return;
                let target = mesh.userData && mesh.userData.plank ? mesh.userData.plank : mesh;
                if (!target.material) return;
                if (on) { if (!o._sealTinted) { o._sealBase = target.material.color.getHex(); o._sealTinted = 1; } target.material.color.setHex(0x7e57c2); }
                else if (o._sealTinted) { target.material.color.setHex(o._sealBase); o._sealTinted = 0; }
            };
            gState.pallets.forEach(function (q) { tint(q, nightSealed(q)); });
            gState.doors.forEach(function (o) { tint(o, nightSealed(o)); });
        }

        function nightCeilingAt(x, z, gy) {
            let d = gState.nightDeck;
            if (!d || !d.cells[nightCellKey(x, z)]) return Infinity;

            return ((gy || 0) >= DECK_H - 1) ? (gState.nightBldH || DECK_H * 2) : DECK_H;
        }

        function nightHookAnchor(from, dir, gy) {
            let prev = null;
            for (let d = 8; d <= SKILL.h3HookRange; d += 4) {
                let tx = from.x + dir.x * d, ty = from.y + dir.y * d, tz = from.z + dir.z * d;
                if (tx < 0 || tz < 0 || tx > mSize * TILE || tz > mSize * TILE) break;
                if (ty <= 1) break;
                let blocked = checkCol(tx, tz, 9, 0) || nightDroppedPalletAt(tx, tz);
                let ceil = nightCeilingAt(tx, tz, gy);
                if (blocked || ty >= ceil - 4) return prev;
                prev = new THREE.Vector3(tx, ty, tz);
            }
            return null;
        }

        function nightHookVisual(h, to) {
            nightHookClear();
            let head = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 4),
                new THREE.MeshLambertMaterial({ color: 0xff7043 }));
            head.position.copy(to); scene.add(head);
            let rope = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1),
                new THREE.MeshBasicMaterial({ color: 0xffccbc }));
            scene.add(rope);
            night.hookFx = { head: head, rope: rope, to: to.clone() };
        }
        function nightHookClear() {
            if (!night.hookFx) return;
            scene.remove(night.hookFx.head); scene.remove(night.hookFx.rope);
            night.hookFx = null;
        }
        function nightHookVisualTick() {
            let f = night.hookFx; if (!f) return;
            let h = night.hunter;
            let a = h.p, b = f.to;
            let len = Math.max(1, a.distanceTo(b));
            f.rope.scale.z = len;
            f.rope.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
            f.rope.lookAt(b.x, b.y, b.z);
            f.head.lookAt(a.x, a.y, a.z);
        }

        function nightHook() {
            let h = night.hunter;

            if (h.hookPull) {
                let d = new THREE.Vector3().subVectors(h.hookPull.to, h.p);
                if (d.lengthSq() < 0.01) d.set(Math.cos(h.faceA || 0), 0, Math.sin(h.faceA || 0));
                d.normalize();
                h.hookPull = null; nightHookClear();
                h.hookMove = { dir: d, left: SKILL.h3Momentum };
                return;
            }
            if (h.hookMove) return;
            if (night.hookCd > 0) { nightFlashHunter('钩锁冷却 ' + night.hookCd.toFixed(0) + 's'); return; }

            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            if (dir.lengthSq() < 0.01) return;
            dir.normalize();
            let hit = nightHookAnchor(h.p, dir, h.gy);
            night.hookCd = nightCd(SKILL.h3HookCd);
            if (!hit) return;
            nightHookVisual(h, hit);
            h.hookPull = { to: hit };
        }

        function nightHookAI(dir) {
            let h = night.hunter;
            if (night.hookCd > 0 || h.hookPull || h.hookMove) return;
            let hit = nightHookAnchor(h.p, dir, h.gy);
            night.hookCd = nightCd(SKILL.h3HookCd);
            if (hit) { nightHookVisual(h, hit); h.hookPull = { to: hit }; }
        }

        function nightHookTick(dt) {
            let h = night.hunter; if (!h) return;
            nightHookVisualTick();
            if (h.hookPull) {
                let d = new THREE.Vector3().subVectors(h.hookPull.to, h.p);
                let dist = d.length();
                if (dist < 8) {
                    h.hookPull = null; nightHookClear();
                    night.hookBoostUntil = performance.now() + SKILL.h3BoostTime * 1000;
                } else {
                    d.normalize();
                    let step = Math.min(dist, SKILL.h3PullSpeed * dt);
                    let before = h.p.clone();
                    let beforeGy = h.gy || 0;
                    nightStep(h, d.x * step, d.z * step);

                    let capY = nightCeilingAt(h.p.x, h.p.z, beforeGy);
                    let maxGy = (capY === Infinity) ? 9999 : Math.max(0, capY - EYE_H - 4);
                    h.gy = Math.min(maxGy, Math.max(0, beforeGy + d.y * step));
                    h.p.y = EYE_H + h.gy;
                    let movedFlat = Math.hypot(h.p.x - before.x, h.p.z - before.z);
                    if (movedFlat < step * 0.4 && Math.abs(d.y) < 0.2) {
                        h.hookPull = null; nightHookClear();
                        night.hookBoostUntil = performance.now() + SKILL.h3BoostTime * 1000;
                    }
                }
            } else if (h.hookMove) {
                let step = Math.min(h.hookMove.left, SKILL.h3PullSpeed * 0.8 * dt);
                let before = h.p.clone();
                nightStep(h, h.hookMove.dir.x * step, h.hookMove.dir.z * step);
                h.hookMove.left -= step;
                if (h.hookMove.dir.y) { h.gy = Math.max(0, (h.gy || 0) + h.hookMove.dir.y * step); h.p.y = EYE_H + h.gy; }
                if (h.hookMove.left <= 0 || Math.hypot(h.p.x - before.x, h.p.z - before.z) < step * 0.4) {
                    h.hookMove = null;
                    night.hookBoostUntil = performance.now() + SKILL.h3BoostTime * 1000;
                }
            }
            if (h.isPlayer && (h.hookPull || h.hookMove)) camera.position.copy(h.p);
        }

        function nightHunterSpear() {
            if (!night || night.over || night.side !== 'hunter') return;
            let h = night.hunter;

            if (night.char === 'h3' && (h.hookPull || h.hookMove)) { nightHook(); return; }
            if (h.recover > 0 || h.spearLeft > 0 || night.action) return;
            if (night.char === 'h3') { nightHook(); return; }
            if (night.char === 'h4') { nightSeal(); return; }
            if (night.char === 'hmi') { nightHunterTeleport(); return; }
            if (night.char === 'hgou') { nightPlaceSpike(); return; }
            if (night.char === 'hmeow') { nightThrowSpear(); return; }

            if (h.spearCd > 0) { nightFlashHunter('突刺冷却 ' + h.spearCd.toFixed(1) + 's'); return; }
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            h.spearDir.copy(dir); h.spearLeft = NIGHT.spearRange; h.spearCd = NIGHT.spearCd;
        }

        const SKILL = {
            catHealCd: 40, catHealRange: 28, fishCount: 3, fishEatTime: 5, fishCooldown: 30,
            dogBlockTime: 0.5, dogBlockRange: 40,
            dogBlockCharges: 2, dogBlockRecharge: 20,
            dogBlockStun: 3, dogBlockBoost: 1.5, dogBlockBoostTime: 2, dogBlockBoostRange: 40,
            dogSlamRange: 40,
            dogRescueBoost: 1.5, dogRescueBoostTime: 2,
            miRepairMult: 1.5, miBurstPer: 20, miBurstMin: 20, miBurstCd: 40,
            healTime: 10,
            meowRescueTime: 1.0, meowTempHpTime: 30,
            meowChargeRange: 48, meowChargeSpeed: 110, meowChargeStun: 3, meowCd: 24,
            c1StunRange: 48, c1StunTime: 3, c1BoostTime: 4, c1SaveCd: 45, c1TowardMul: 1.5,
            c2BoostMul: 1.5, c2BoostCd: 30, c2MarkMul: 1.1,
            c2CastPre: 0.5, c2CastPost: 0.5,
            meowWhiffRefund: 0.6,
            maoRushBoost: 1.15, maoRushTime: 5,
            hmiTpCd: 34,
            hgouSpikeCd: 11, hgouSpikeRange: 24, hgouSpikeLife: 90, hgouSpikeMax: 5, hgouSpikeRearm: 8,
            hgouSpikeSlow: 0.5, hgouSpikeSlowTime: 3, hgouRevealTime: 5, hgouSpikeActMul: 1 / 0.7,
            hgouGuardRange: 160, hgouGuardMult: 2, hgouChairBoost: 1.1,
            hmeowThrowCd: 14, hmeowThrowRange: 240, hmeowThrowSpeed: 95,
            hmeowDownCut: 7,
            h3HookRange: 2000, h3HookCd: 20, h3PullSpeed: 220, h3Momentum: 100,
            h3Boost: 1.4, h3BoostTime: 4,
            h4SealTime: 20, h4SealCd: 35, h4SealRange: 60,
            h4AuraRange: 64, h4AuraPer: 0.12, h4AuraMax: 0.4,
            hmiTpCast: 2, hmiTpBoost: 1.3, hmiTpBoostTime: 3
        };

        function nightSpawnFishFor(a) {
            for (let i = 0; i < SKILL.fishCount; i++) {

                let fx = a.p.x, fz = a.p.z;
                for (let tries = 0; tries < 40; tries++) {
                    let ang = seededRandom() * Math.PI * 2, r = 72 + seededRandom() * 144;
                    let tx = a.p.x + Math.cos(ang) * r, tz = a.p.z + Math.sin(ang) * r;
                    if (checkCol(tx, tz, 9, 0)) continue;
                    if (night.fish.some(function (f) { return Math.hypot(f.p.x - tx, f.p.z - tz) < 60; })) continue;
                    fx = tx; fz = tz; break;
                }

                let mine = a.isPlayer;
                let fm = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6),
                    new THREE.MeshBasicMaterial({
                        color: 0xffb74d, depthTest: false, transparent: true, opacity: 0.95
                    }));
                fm.renderOrder = 998;
                fm.visible = mine;
                fm.position.set(fx, 2, fz); scene.add(fm);
                night.fish.push({ p: fm.position.clone(), mesh: fm, owner: a });
            }
        }

        function nightClearFishFor(a) {
            night.fish.forEach(function (f) { if (f.owner === a && f.mesh) scene.remove(f.mesh); });
            night.fish = night.fish.filter(function (f) { return f.owner !== a; });
            a.fishEaten = 0;
        }

        function nightClearFish() {
            (night.fish || []).forEach(function (f) { if (f.mesh) scene.remove(f.mesh); });
            night.fish = []; night.fishEating = null;
            (night.survivors || []).forEach(function (a) { a.fishEaten = 0; });
        }

        function nightMyFish(a) {
            return night.fish.filter(function (f) { return f.owner === a; });
        }

        function nightRefreshFish(force) {
            if (!night.survivors) return;
            let hasCat = night.survivors.some(function (a) { return a.charKey === 'cat' && !a.out && !a.escaped; });
            let now = performance.now();

            let ready = !night.fishNextAt || now >= night.fishNextAt;
            night.survivors.forEach(function (a) {
                let want = hasCat && !a.out && !a.escaped && !a.downed && !a.onChair &&
                    a.hp === 1 && a.charKey !== 'cat';
                let has = night.fish.some(function (f) { return f.owner === a; });
                if (!want) { if (has) nightClearFishFor(a); return; }
                if (force && has) { nightClearFishFor(a); has = false; }
                if (!has && ready) { nightSpawnFishFor(a); night.fishSpawned = true; }
            });
            if (night.fishSpawned && ready) {
                night.fishNextAt = now + SKILL.fishCooldown * 1000;
                night.fishSpawned = false;
            }
        }

        function nightEatFish(a) {
            if (a.hp >= 2 || a.downed || a.onChair || a.out || a.escaped) return false;
            if (a.charKey === 'cat') return false;
            let near = null, nd = Infinity;
            night.fish.forEach(function (f) {
                if (f.owner !== a) return;
                if (!nightSameLevel(a.p, f.p)) return;
                let d = Math.hypot(f.p.x - a.p.x, f.p.z - a.p.z); if (d < nd) { nd = d; near = f; }
            });
            if (!near || nd >= 14) return false;

            scene.remove(near.mesh);
            night.fish = night.fish.filter(function (f) { return f !== near; });
            a.fishEaten = (a.fishEaten || 0) + 1;
            if (a.fishEaten >= SKILL.fishCount) {
                a.hp = 2; a.fishEaten = 0;
                if (a.isPlayer) nightFlash('吃满 3 条小鱼干，回复 1 滴血');
                nightRefreshFish();
            } else if (a.isPlayer) nightFlash('小鱼干 ' + a.fishEaten + ' / ' + SKILL.fishCount);
            return true;
        }

        function nightSurvivorSkill() {
            if (!night || night.over || night.spectating || night.side !== 'survivor') return;
            let me = night.survivors[0];
            if (me.downed || me.onChair || me.out) return;

            if (night.action) return;

            if (night.char === 'cat') {
                if (night.healCd > 0) { nightFlash('治疗冷却 ' + night.healCd.toFixed(0) + 's'); return; }

                let t = null, td = Infinity;
                night.survivors.forEach(function (a) {
                    if (a.out || a.escaped || a.onChair) return;
                    if (a.hp >= 2 && !a.downed) return;
                    let d = (a === me) ? 0 : me.p.distanceTo(a.p);
                    if (d < td) { td = d; t = a; }
                });
                if (!t || td > SKILL.catHealRange) { nightFlash('身边没有需要治疗的人'); return; }
                if (t.downed) nightRescue(t); else t.hp = 2;
                night.healCd = SKILL.catHealCd; nightRefreshFish();
                nightFlash(t === me ? '已自我治疗' : '已治疗队友');
                return;
            }

            if (night.char === 'dog') {
                if (night.blockCharges <= 0) { nightFlash('格挡没有充能（' + night.blockRecharge.toFixed(0) + 's 后回充）'); return; }
                night.blockCharges--; night.blockT = SKILL.dogBlockTime;
                nightFlash('举盾（余 ' + night.blockCharges + ' 次）');
                return;
            }

            if (night.char === 'meow') {
                if (night.meowCd > 0) { nightFlash('冲撞冷却 ' + night.meowCd.toFixed(0) + 's'); return; }
                if (night.charge) return;
                let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
                night.charge = { dir: dir, left: SKILL.meowChargeRange, hit: false };
                night.meowCd = SKILL.meowCd;
                return;
            }

            if (night.char === 'c1') {
                if (night.c1Cd > 0) { nightFlash('震慑冷却 ' + night.c1Cd.toFixed(0) + 's'); return; }
                if (!nightC1Stun(me)) { nightFlash('追捕不在 5 身位内'); return; }
                night.c1Cd = SKILL.c1SaveCd;
                return;
            }

            if (night.char === 'c2') {
                if (night.c2Cast) return;
                if (night.c2Cd > 0) { nightFlash('提速冷却 ' + night.c2Cd.toFixed(0) + 's'); return; }
                let list = nightC2Options(me);
                if (!list.length) { nightFlash('场上没有正在被挖的矿机'); return; }
                night.c2Cast = { t: 0, phase: 'pre', list: list, idx: 0 };
                nightFlash('选择矿机：' + kTxt('Q / E', '「切换」') + ' 切换，' + nightKey('act') + ' 确认');
                return;
            }

            if (night.char === 'mi') {
                if (nightMachinesLocked()) { nightFlash('矿机已经够了，去开门'); return; }
                if (!night.repairing) { nightFlash('要先在修矿机时才能使用'); return; }
                if (night.miCd > 0) { nightFlash('技能冷却 ' + night.miCd.toFixed(0) + 's'); return; }
                let gain = Math.max(SKILL.miBurstMin, night.done * SKILL.miBurstPer);
                night.repairing.progress = Math.min(100, night.repairing.progress + gain);
                night.miCd = SKILL.miBurstCd;
                nightFlash('挖煤爆发 +' + gain);
                nightCheckMachine(night.repairing);
                return;
            }
        }

        function nightTryBlock(victim) {
            if (night.side !== 'survivor' || night.char !== 'dog' || night.blockT <= 0) return false;
            let me = night.survivors[0];
            if (victim !== me && me.p.distanceTo(victim.p) > SKILL.dogBlockRange) return false;
            night.blockT = 0;
            night.slamReady = 1;

            night.boostT = SKILL.dogBlockBoostTime;
            night.survivors.forEach(function (a) {
                if (a === me || a.out || a.escaped) return;
                if (me.p.distanceTo(a.p) <= SKILL.dogBlockBoostRange) a.hitBoost = SKILL.dogBlockBoostTime;
            });
            nightFlash((victim === me ? '格挡成功！' : '替队友挡下！') + '　' + nightKey('space') + ' 砸地');
            return true;
        }

        function nightDogSlam() {
            if (!night || night.over || night.side !== 'survivor' || night.char !== 'dog') return false;
            if (!(night.slamReady > 0)) return false;
            night.slamReady = 0;
            let me = night.survivors[0];
            let h = night.hunter;
            nightSlamFx(me.p);
            if (h.p.distanceTo(me.p) > SKILL.dogSlamRange) { nightFlash('砸空了 —— 追捕不在 5 身位内'); return true; }

            nightStunHunter(SKILL.dogBlockStun, null);
            night.boostT = SKILL.dogBlockBoostTime;
            night.survivors.forEach(function (a) {
                if (a === me || a.out || a.escaped) return;
                if (me.p.distanceTo(a.p) <= SKILL.dogBlockBoostRange) a.hitBoost = SKILL.dogBlockBoostTime;
            });
            nightFlash('砸地命中！追捕眩晕 3 秒，全队加速');
            return true;
        }

        function nightSlamFx(pos) {
            let m = new THREE.Mesh(new THREE.TorusGeometry(SKILL.dogSlamRange * 0.5, 1.6, 6, 24),
                new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.9 }));
            m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 2, pos.z);
            m.userData.slamGrow = true;
            nightAddFx(m, 0.5);
        }

        function nightChargeTick(dt) {
            let c = night.charge; if (!c) return;
            let me = night.survivors[0], h = night.hunter;
            let step = Math.min(c.left, SKILL.meowChargeSpeed * dt);
            let before = me.p.clone();
            nightStep(me, c.dir.x * step, c.dir.z * step);
            camera.position.copy(me.p);
            nightSpearTrailFx(me.p);
            if (me.p.distanceTo(before) < step * 0.5) { night.charge = null; night.meowCd *= (1 - SKILL.meowWhiffRefund); nightFlash('撞到墙了（冷却已返还）'); return; }
            c.left -= step;

            if (h.p.distanceTo(me.p) <= NIGHT.atkRange + 4) {
                nightStunHunter(SKILL.meowChargeStun, '冲撞命中！');
                night.charge = null; return;
            }

            let t = null, td = Infinity;
            night.survivors.forEach(function (a) {
                if (a === me || a.out || a.escaped) return;
                if (!a.downed && !a.onChair) return;
                if (!nightSameLevel(me.p, a.p)) return;
                let d = nightFlatDist(me.p, a.p);
                if (d <= 16 && d < td) { td = d; t = a; }
            });
            if (t) {
                nightRescue(t);
                t.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000;
                nightFlash('冲撞救援成功 —— 队友半血站起，并获得 30 秒临时生命');
                night.charge = null; return;
            }
            if (c.left <= 0) { night.charge = null; night.meowCd *= (1 - SKILL.meowWhiffRefund); nightFlash('冲撞落空（冷却已返还）'); }
        }

        function nightSkillTick(dt) {
            if (NIGHT_NO_CD) {

                if (night.side === 'survivor') {
                    night.healCd = 0; night.miCd = 0; night.meowCd = 0;
                    night.c1Cd = 0; night.c2Cd = 0;
                    night.blockCharges = SKILL.dogBlockCharges; night.blockRecharge = 0;
                    night.slamReady = 1;
                } else {

                    night.spikeCd = 0; night.tpCd = 0; night.throwCd = 0;
                    night.hookCd = 0; night.sealCd = 0;
                    if (night.hunter) night.hunter.spearCd = 0;
                }
            }
            if (night.healCd > 0) night.healCd -= dt;
            if (night.miCd > 0) night.miCd -= dt;
            if (night.meowCd > 0) night.meowCd -= dt;
            if (night.spikeCd > 0) night.spikeCd -= dt;
            if (night.tpCd > 0) night.tpCd -= dt;
            if (night.throwCd > 0) night.throwCd -= dt;
            if (night.rushT > 0) night.rushT -= dt;

            if (night.rushPending && night.hunter.recover <= 0) { night.rushPending = false; night.rushT = SKILL.maoRushTime; }
            nightChargeTick(dt); nightSpikeTick(dt); nightSpearTick(dt);
            if (night.blockT > 0) night.blockT -= dt;
            if (night.hookCd > 0) night.hookCd -= dt;
            if (night.sealCd > 0) night.sealCd -= dt;
            if (night.c1Cd > 0) night.c1Cd -= dt;
            if (night.c2Cd > 0) night.c2Cd -= dt;
            if (night.boostT > 0) night.boostT -= dt;

            if (night.blockCharges < SKILL.dogBlockCharges) {
                night.blockRecharge -= dt;
                if (night.blockRecharge <= 0) { night.blockCharges++; night.blockRecharge = SKILL.dogBlockRecharge; }
            } else night.blockRecharge = SKILL.dogBlockRecharge;

        }

        function nightSpectateTargets() {
            let list = night.survivors.filter(function (a) { return !a.out && !a.escaped && !a.isPlayer; });
            if (list.length === 0 && night.hunter && !night.hunter.isPlayer) list = [night.hunter];
            return list;
        }

        function nightEnterSpectate(reason) {
            if (night.spectating) return;
            night.spectating = true; night.spectateIdx = 0;
            night.repairing = null; night.calib = null; night.doorTarget = null;
            document.getElementById('night-spectate-bar').style.display = 'flex';
            if (document.pointerLockElement) document.exitPointerLock();
            if (reason) nightFlash(reason);
            nightApplySpectate();
        }

        function nightShowAllBodies() {
            if (!night) return;
            night.survivors.forEach(function (a) {
                if (a.mesh) a.mesh.visible = !(a.out || a.escaped);
                if (a.xray) a.xray.visible = !(a.out || a.escaped);
            });
        }

        function nightCycleSpectate(dir) {
            if (!night || !night.spectating) return;
            nightShowAllBodies();
            let list = nightSpectateTargets(); if (list.length === 0) return;
            night.spectateIdx = ((night.spectateIdx + dir) % list.length + list.length) % list.length;
            nightApplySpectate();
        }

        function nightApplySpectate() {
            let list = nightSpectateTargets();
            let label = document.getElementById('night-spectate-target');
            if (list.length === 0) { if (label) label.innerText = '无人可观战'; return; }
            if (night.spectateIdx >= list.length) night.spectateIdx = 0;
            let t = list[night.spectateIdx];
            if (label) label.innerText = (t === night.hunter ? '追捕' : '队友 ' + (night.survivors.indexOf(t) + 1)) +
                (t.downed ? '（倒地）' : (t.onChair ? '（椅上）' : ''));
        }

        function nightLeaveSpectate() {
            if (!night) return;
            let n = night.survivors.filter(function (a) { return a.escaped; }).length;
            // 联机：不管是不是房主，都只是自己回大厅——原来房主一点离开整局就结束了，别人打到一半全被踢回大厅。
            // 房主走的话把房主交给下一个人（nightNetLeave）。
            if (netOn()) { nightNetLeave('你已离开观战。当前 ' + n + ' 人撤离。队友那局会继续打完。'); return; }
            endNightGame('你已离开观战。当前 ' + n + ' 人撤离。');
        }

        // 惊魂夜原来只有被抓出局后的观战条里才有"离开"，活着的时候没有任何退出方式。
        // 联机的时候你的角色交给 AI 接着打（nightNetLeave），队友那局不受影响。
        function nightQuitAsk() {
            if (!night || night.over) return;
            if (document.pointerLockElement) document.exitPointerLock();
            let net = netOn();
            showSysModal('离开本局？', net ? '算这局输，你的角色交给 AI。' : '算这局输。', [
                {
                    label: '离开', color: '#d9534f', onClick: function () {
                        if (!night || night.over) return;
                        night.quit = true;   // 中途走不给猫盾币
                        if (netOn()) nightNetLeave('你中途离开了本局，角色已交给 AI。');
                        else endNightGame('你中途离开了本局。');
                    }
                },
                { label: '继续玩' }
            ]);
        }

        // night-msg 这个提示条被 nightFlash 和 nightApplyCalib（校准小游戏反馈）两处
        // 共用，各自原来都是各调各的 setTimeout，互不知道对方的存在。矿机进度这种
        // 连续触发的提示，每次调用都叠一个新的隐藏定时器，最早那个先到时间就把还
        // 在显示的新消息藏起来了——玩家还在修机器，进度提示却一闪一闪地消失/出现。
        // 校准反馈同理，还会跟 nightFlash 的消息互相抢着隐藏对方。统一走一个共享
        // 定时器，每次显示都先清掉上一个，不会再互相打架。
        let nightMsgTimer = null;
        function nightShowMsg(text, color, duration) {
            let msg = document.getElementById('night-msg'); if (!msg) return;
            msg.style.color = color; msg.innerText = text; msg.style.display = 'block';
            clearTimeout(nightMsgTimer);
            nightMsgTimer = setTimeout(function () { msg.style.display = 'none'; }, duration);
        }
        function nightFlash(text) { nightShowMsg(text, '#ffd54f', 1200); }

        function nightFlashHunter(text) { if (night && night.side === 'hunter') nightFlash(text); }

        let nightErrShown = '';
        function nightShowError(e) {
            let msg = (e && e.stack) ? e.stack : String(e && e.message ? e.message : e);
            if (msg === nightErrShown) return;
            nightErrShown = msg;
            let el = document.getElementById('night-err');
            if (el) { el.style.display = 'block'; el.innerText = '出错了：\n' + msg; }
        }

        window.addEventListener('error', function (ev) { nightShowError(ev.error || ev.message); });

        // 音效跟背景音乐分开走：音乐嫌吵关掉了，击杀音还是要有的
        let sfxCtx = null;
        let SFX_ENABLED = SETTINGS.sfx !== false;   // 设置里可以关
        function sfxPlay(freqs, len, peak, type) {
            if (!SFX_ENABLED) return;
            try {
                if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (sfxCtx.state === 'suspended') sfxCtx.resume();
                let ctx = sfxCtx, now = ctx.currentTime;
                freqs.forEach(function (f, i) {
                    let o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = type || 'triangle';
                    o.frequency.value = f;
                    let t = now + i * 0.075;
                    g.gain.setValueAtTime(0.0001, t);
                    g.gain.linearRampToValueAtTime(peak, t + 0.015);
                    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
                    o.connect(g); g.connect(ctx.destination);
                    o.start(t); o.stop(t + len + 0.05);
                });
            } catch (e) { }
        }

        // sfxPlay 只有振荡器，音色全是"叮"——扔球的呼啸声、砸中人的闷响这种，
        // 振荡器怎么调都不像。加一路白噪声过滤波器，配合 sfxPlay 一起用，
        // 音色能明显分开（呼啸=噪声扫频，闷响=噪声+低频振荡器叠一下）。
        let sfxNoiseBuf = null;
        function sfxNoiseBuffer(ctx) {
            if (sfxNoiseBuf && sfxNoiseBuf.ctx === ctx) return sfxNoiseBuf.buf;
            let n = ctx.sampleRate * 1.0;
            let buf = ctx.createBuffer(1, n, ctx.sampleRate);
            let d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            sfxNoiseBuf = { ctx: ctx, buf: buf };
            return buf;
        }
        // filterFrom/filterTo：滤波器中心频率随时间滑动，做"呼啸而过"这种扫频感；
        // 只给一个数字就是不滑动，固定音色。
        function sfxNoise(len, peak, filterFrom, filterTo, q) {
            if (!SFX_ENABLED) return;
            try {
                if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (sfxCtx.state === 'suspended') sfxCtx.resume();
                let ctx = sfxCtx, now = ctx.currentTime;
                let src = ctx.createBufferSource();
                src.buffer = sfxNoiseBuffer(ctx); src.loop = true;
                let filt = ctx.createBiquadFilter();
                filt.type = 'bandpass'; filt.Q.value = q || 1;
                filt.frequency.setValueAtTime(filterFrom, now);
                filt.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo || filterFrom), now + len);
                let g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, now);
                g.gain.linearRampToValueAtTime(peak, now + Math.min(0.03, len * 0.3));
                g.gain.exponentialRampToValueAtTime(0.0005, now + len);
                src.connect(filt); filt.connect(g); g.connect(ctx.destination);
                src.start(now); src.stop(now + len + 0.05);
            } catch (e) { }
        }
        // ── 下面这几个是给各个模式复用的"语义化"音效，不用每处自己调参数 ──
        // 扔出去：噪声从高频往低频快速扫一下，像东西"嗖"地飞出去
        function sfxThrow() { sfxNoise(0.22, 0.05, 2600, 500, 1.2); }
        // 砸中/命中/抓到：短促闷响——噪声炸一下 + 一个低音振荡器托底，扎实但不刺耳
        function sfxThud(big) {
            sfxNoise(big ? 0.18 : 0.12, big ? 0.09 : 0.06, big ? 900 : 1400, big ? 120 : 220, 0.9);
            sfxPlay([big ? 90 : 130], 0.18, 0.045, 'sine');
        }
        // 接住/捡到/救到/送达这类"成功"反馈：音阶往上走的一小串琶音，tier 越大听着越振奋
        function sfxChime(tier) {
            let base = 587.33;
            let freqs = [base, base * 1.26, base * 1.5, base * 2];
            sfxPlay(freqs.slice(0, Math.max(2, Math.min(4, tier || 2))), 0.22, 0.055, 'triangle');
        }
        // 被抓/被淘汰/没接住这类"失败"反馈：短促下滑的两个音
        function sfxBuzz() { sfxPlay([246, 174.6], 0.3, 0.05, 'sawtooth'); }
        // 技能施放：滑音"嗞"一下，1 技能音调比 2 技能亮一点，两个技能听感不一样
        function sfxZap(slot) {
            if (slot === 2) sfxNoise(0.16, 0.05, 700, 1900, 2.2);
            else sfxNoise(0.14, 0.05, 1200, 2800, 2.2);
            sfxPlay([slot === 2 ? 220 : 440], 0.14, 0.03, 'square');
        }
        // 机关/开门这类"世界状态变化"：低沉的一声，跟"成功"琶音区分开
        function sfxMechanism() { sfxPlay([220, 293.66], 0.55, 0.05, 'sine'); sfxNoise(0.3, 0.04, 300, 150, 1); }

        let bgm = null;
        let BGM_ENABLED = true;   // 各模式的背景乐都写好了，默认打开，不想听的人自己去设置里关
        const BGM_CALM = [329.63, 392.00, 440.00, 587.33];
        const BGM_TENSE = [220.00, 261.63, 220.00, 174.61];

        function bgmMuted() {
            try { return localStorage.getItem('TH_mute') === '1'; } catch (e) { return false; }
        }
        function bgmToggle() {
            let now = !bgmMuted();
            try { localStorage.setItem('TH_mute', now ? '1' : '0'); } catch (e) { }
            if (now) bgmStop();
            else if ((night && !night.over) || (blaze && !blaze.over) || (race && !race.over)) bgmStart();
            if (blaze && !blaze.over) blazeFlash(now ? '音乐已关闭' : '音乐已开启');
            else nightFlash(now ? '音乐已关闭（M 开启）' : '音乐已开启（M 关闭）');
        }

        function bgmPad(ctx, dest, freqs, type) {
            let g = ctx.createGain(); g.gain.value = 0; g.connect(dest);
            let osc = freqs.map(function (f, i) {
                let o = ctx.createOscillator(); o.type = type;
                // 之前这里是 f * 1.003，两个差 0.3% 的音叠在一起会打拍，
                // 结果就是一直「嗡嗡」。改成几乎不失谐，只留一点点厚度。
                o.frequency.value = f * (i ? 1.0004 : 1);
                o.connect(g); o.start(); return o;
            });
            return { gain: g, osc: osc };
        }

        function bgmStart() {
            if (!BGM_ENABLED || bgm || bgmMuted()) return;
            let AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            let ctx;
            try { ctx = new AC(); } catch (e) { return; }
            let master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

            let lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(master);
            let calm = bgmPad(ctx, master, [110, 164.81], 'triangle');

            let tense = bgmPad(ctx, lp, [55, 82.41], 'triangle');
            calm.gain.gain.value = 0.05;
            bgm = { ctx: ctx, master: master, calm: calm, tense: tense, next: 0, step: 0, mode: 0 };
            try { ctx.resume(); } catch (e) { }
            master.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 3);
        }

        function bgmStop() {
            if (!bgm) return;
            try {
                bgm.calm.osc.concat(bgm.tense.osc).forEach(function (o) { o.stop(); });
                bgm.ctx.close();
            } catch (e) { }
            bgm = null;
        }

        // 超燃：G 大调琶音循环，配底鼓和踩镲。八分音符一直走，听着就想动。
        const BGM_FIGHT = [392.00, 493.88, 587.33, 493.88, 659.25, 587.33, 493.88, 392.00];

        function bgmKick(ctx, dest) {
            let now = ctx.currentTime;
            let o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(140, now);
            o.frequency.exponentialRampToValueAtTime(45, now + 0.12);
            g.gain.setValueAtTime(0.16, now);
            g.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
            o.connect(g); g.connect(dest); o.start(now); o.stop(now + 0.2);
        }
        function bgmHat(ctx, dest) {
            let now = ctx.currentTime;
            // 用一小段白噪当踩镲
            let len = Math.floor(ctx.sampleRate * 0.05);
            let buf = ctx.createBuffer(1, len, ctx.sampleRate);
            let d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
            let src = ctx.createBufferSource(); src.buffer = buf;
            let hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
            let g = ctx.createGain(); g.gain.value = 0.05;
            src.connect(hp); hp.connect(g); g.connect(dest);
            src.start(now);
        }

        // 寻宝队：C 大调的慢速分解和弦，走得很稳，纯背景，不制造压力
        const BGM_HUNT = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];

        // 竞速：D 大调往上冲的跑句，十六分音符不停歇，比超燃还快一档 —— 催着你往前跑
        const BGM_RACE = [
            587.33, 739.99, 880.00, 1174.66, 880.00, 739.99,
            659.25, 830.61, 987.77, 1318.51, 987.77, 830.61
        ];

        // 超燃在打的时候用战斗曲；寻宝队用探索曲；惊魂夜还是原来那套平静/紧张
        function bgmFightMode() { return !!(blaze && !blaze.over); }
        function bgmRaceMode() { return !!(race && !race.over); }
        function bgmHuntMode() { return !!(isPlaying && !night && !blaze); }

        function bgmDanger() {
            if (!night || night.over) return false;
            if (night.side !== 'survivor') return false;
            let me = night.survivors && night.survivors[0];
            if (!me || !night.hunter) return false;
            return nightFlatDist(night.hunter.p, me.p) < DANGER_FAR;
        }

        function bgmNote(ctx, dest, f, len, peak, type) {
            let now = ctx.currentTime;
            let o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(peak, now + 0.04);
            g.gain.exponentialRampToValueAtTime(0.0005, now + len);
            o.connect(g); g.connect(dest);
            o.start(now); o.stop(now + len + 0.05);
        }

        function bgmTick() {
            if (!bgm) return;
            let ctx = bgm.ctx, now = ctx.currentTime;

            // ── 寻宝队：慢悠悠的探索曲 ──
            if (bgmHuntMode()) {
                if (bgm.mode !== 3) {
                    bgm.mode = 3; bgm.next = 0; bgm.step = 0;   // 换曲子要清掉上一条排好的音符
                    bgm.calm.gain.gain.cancelScheduledValues(now);
                    bgm.tense.gain.gain.cancelScheduledValues(now);
                    bgm.calm.gain.gain.linearRampToValueAtTime(0.035, now + 1.2);
                    bgm.tense.gain.gain.linearRampToValueAtTime(0.0, now + 1.2);
                }
                if (now < bgm.next) return;
                bgm.next = now + 1.1;
                bgmNote(ctx, bgm.master, BGM_HUNT[bgm.step % BGM_HUNT.length], 1.0, 0.03, 'triangle');
                bgm.step++;
                return;
            }

            // ── 竞速：一路往上冲的跑句 ──
            if (bgmRaceMode()) {
                if (bgm.mode !== 4) {
                    bgm.mode = 4; bgm.next = 0; bgm.step = 0;
                    bgm.calm.gain.gain.cancelScheduledValues(now);
                    bgm.tense.gain.gain.cancelScheduledValues(now);
                    bgm.calm.gain.gain.linearRampToValueAtTime(0.028, now + 0.6);
                    bgm.tense.gain.gain.linearRampToValueAtTime(0.0, now + 0.6);
                }
                if (now < bgm.next) return;
                bgm.next = now + 0.16;                       // 十六分音符，约 156 BPM
                bgmNote(ctx, bgm.master, BGM_RACE[bgm.step % BGM_RACE.length], 0.14, 0.028, 'square');
                if (bgm.step % 4 === 0) bgmKick(ctx, bgm.master);
                if (bgm.step % 2 === 1) bgmHat(ctx, bgm.master);
                bgm.step++;
                return;
            }

            // ── 超燃：欢快的打斗曲 ──
            if (bgmFightMode()) {
                if (bgm.mode !== 2) {
                    bgm.mode = 2; bgm.next = 0; bgm.step = 0;
                    bgm.calm.gain.gain.cancelScheduledValues(now);
                    bgm.tense.gain.gain.cancelScheduledValues(now);
                    bgm.calm.gain.gain.linearRampToValueAtTime(0.03, now + 0.6);
                    bgm.tense.gain.gain.linearRampToValueAtTime(0.0, now + 0.6);
                }
                if (now < bgm.next) return;
                bgm.next = now + 0.22;                       // 八分音符，约 136 BPM
                let st = bgm.step % 8;
                bgmNote(ctx, bgm.master, BGM_FIGHT[st], 0.2, 0.05, 'square');
                if (st % 4 === 0) bgmKick(ctx, bgm.master);  // 每小节头和中间来一下底鼓
                if (st % 2 === 1) bgmHat(ctx, bgm.master);   // 反拍踩镲
                bgm.step++;
                return;
            }

            let danger = bgmDanger();

            let want = danger ? 1 : 0;
            if (want !== bgm.mode) {
                bgm.mode = want; bgm.next = 0; bgm.step = 0;
                bgm.calm.gain.gain.cancelScheduledValues(now);
                bgm.tense.gain.gain.cancelScheduledValues(now);
                bgm.calm.gain.gain.linearRampToValueAtTime(danger ? 0.0 : 0.05, now + 1.0);
                bgm.tense.gain.gain.linearRampToValueAtTime(danger ? 0.05 : 0.0, now + 1.0);
            }

            if (now < bgm.next) return;
            if (danger) {

                bgm.next = now + 0.75;
                bgmNote(ctx, bgm.master, BGM_TENSE[bgm.step % BGM_TENSE.length], 0.6, 0.04, 'sine');
            } else {

                bgm.next = now + 2.4;
                bgmNote(ctx, bgm.master, BGM_CALM[bgm.step % BGM_CALM.length], 1.6, 0.035, 'sine');
            }
            bgm.step++;
        }

        function nightLoop() {
            if (!night || night.over) return;
            night.raf = requestAnimationFrame(nightLoop);
            try { nightLoopBody(); }
            catch (e) {
                nightShowError(e);

                try { renderer.render(scene, camera); } catch (e2) { }
            }
        }

        function nightLoopBody() {
            if (!night || night.over) return;

            if (!night.camFixed) {
                night.camFixed = true;
                let self0 = night.side === 'hunter' ? night.hunter : night.survivors[0];
                if (self0 && Math.abs(camera.position.y - self0.p.y) > 40) nightResetCamera(night.side);
            }
            let now = performance.now(); let dt = Math.min(0.05, (now - night.last) / 1000); night.last = now;
            let gdt = dt * NIGHT.gamePerReal;
            night.t += gdt;
            if (night.stun > 0) night.stun = Math.max(0, night.stun - dt);
            if (night.hitBoost > 0) night.hitBoost = Math.max(0, night.hitBoost - dt);

            if (night.t >= NIGHT.limit) { endNightGame('时间到 —— 逃生者未能撤离，追捕获胜。'); return; }
            nightSeparate(dt);

            let movingKeys = keys['w'] || keys['a'] || keys['s'] || keys['d'] || tMove.x || tMove.y;
            if (movingKeys && (night.repairing || night.doorTarget)) { night.repairing = null; night.calib = null; night.doorTarget = null; }

            if (night.side === 'survivor') {
                let s0 = night.survivors[0];
                if (s0.onChair || s0.out) { night.repairing = null; night.calib = null; night.doorTarget = null; night.action = null; }

                else if (s0.downed) {
                    night.repairing = null; night.calib = null; night.action = null;
                    if (night.doorTarget && !night.doorTarget.open) night.doorTarget = null;
                }
            }

            if (night.action && night.action.type === 'heal') {
                let act = night.action, t = act.target;
                act.t += dt;
                let stop = function () { t.beingHealed = false; night.action = null; };
                let moving = keys['w'] || keys['a'] || keys['s'] || keys['d'] || tMove.x || tMove.y;
                if (t.out || t.escaped || t.downed || t.onChair || t.hp >= 2) stop();
                else if (moving) { stop(); nightFlash('移动中断了治疗'); }
                else if (camera.position.distanceTo(t.p) > 22) { stop(); nightFlash('离开了治疗范围'); }
                else if (act.t >= SKILL.healTime * nightActMul(night.survivors[0])) {
                    t.hp = 2;
                    if (night.char === 'meow') { t.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000; }
                    nightRefreshFish(); nightFlash('治疗完成'); stop();
                }
            }
            else if (night.action && night.action.type === 'rescue') {
                let act = night.action; act.t += dt;
                let t = act.target;

                let downPick = t.downed && !t.onChair;
                // 扶到一半人被追捕扛走了：进度清零，救援直接中断
                if (night.hunter && night.hunter.carrying === t) {
                    t.healProg = 0; t.beingRescued = false;
                    night.action = null;
                    nightFlash('他被扛走了，救援中断');
                    return;
                }
                t.beingRescued = true;
                if (downPick) t.healProg = Math.min(1, (t.healProg || 0) + dt / NIGHT.pickupTime);
                if (t.out || t.escaped || (!t.downed && !t.onChair) || !nightSameLevel(camera.position, t.p)) night.action = null;
                else if (downPick ? t.healProg >= 1 : act.t >= nightRescueTimeFor(night.survivors[0])) {
                    nightRescue(t);

                    if (night.char === 'dog') { night.boostT = SKILL.dogRescueBoostTime; t.hitBoost = SKILL.dogRescueBoostTime; nightFlash('救援成功！双方加速 2 秒'); }

                    else if (night.char === 'meow') { t.tempHpUntil = performance.now() + SKILL.meowTempHpTime * 1000; nightFlash('救援成功！队友获得 30 秒临时生命'); }
                    else nightFlash('救援成功');
                    nightRefreshFish(); night.action = null;
                }
            }
            else if (night.action) {
                let act = night.action; act.t += dt;
                if (act.target.state !== 'down') {

                    let pal = act.target;
                    if (pal.mesh && pal.mesh.userData.plank && pal.breakAnimBase !== undefined) {
                        pal.mesh.userData.plank.position.y = pal.breakAnimBase;
                        pal.mesh.userData.plank.rotation.z = 0;
                        pal.breakAnimBase = undefined;
                    }
                    night.action = null;
                }
                else if (act.type === 'vault') {

                    let u = Math.min(1, act.t / (NIGHT.palletVault * nightActMul(night.survivors[0])));
                    let e = u * u * (3 - 2 * u);
                    camera.position.x = act.from.x + (act.to.x - act.from.x) * e;
                    camera.position.z = act.from.z + (act.to.z - act.from.z) * e;

                    camera.position.y = act.from.y + (act.to.y - act.from.y) * e;
                    night.vaultApplied = 0;
                    night.vaultLift = Math.sin(u * Math.PI) * NIGHT.palletVaultLift;
                    if (u >= 1) { night.action = null; nightFlash('翻越'); }
                }
                else {

                    let pal = act.target;
                    if (pal.mesh && pal.mesh.userData.plank) {
                        let pk = pal.mesh.userData.plank;
                        let u2 = act.t / NIGHT.palletBreak;
                        let beat = Math.abs(Math.sin(u2 * Math.PI * 3));
                        if (pal.breakAnimBase === undefined) pal.breakAnimBase = pk.position.y;
                        pk.position.y = pal.breakAnimBase - beat * 1.6;
                        pk.rotation.z = Math.sin(u2 * Math.PI * 6) * 0.12 * beat;
                        if (!pal.breakFxAt || act.t - pal.breakFxAt > NIGHT.palletBreak / 3) {
                            pal.breakFxAt = act.t;
                            nightSlamFx(new THREE.Vector3(pal.x * TILE, 2, pal.z * TILE));
                        }
                    }
                    if (act.t >= NIGHT.palletBreak) {
                        pal.breakAnimBase = undefined; pal.breakFxAt = 0;
                        nightBreakPallet(pal); nightFlash('板子已破坏'); night.action = null;
                    }
                }
            }

            nightResetFlowCache();
            nightPalletFallTick(dt);
            nightPalletBreakTick(dt);
            nightFxTick(dt);
            nightEggTick(dt);
            nightIndicatorTick(dt);
            nightLabelButtons();
            nightHealBarTick();
            nightSkillTick(dt);
            nightC2CastTick(dt);
            bgmTick();
            nightSealTick();
            nightTpMarkTick();
            nightTpTick(dt);
            nightHookTick(dt);
            nightC2BoostTick();

            if (night.vaultApplied) { camera.position.y -= night.vaultApplied; night.vaultApplied = 0; }
            nightMove(dt);

            let hooking = night.side === 'hunter' && (night.hunter.hookPull || night.hunter.hookMove);
            if (!(night.action && night.action.type === 'vault') && !hooking) {
                let self = night.side === 'hunter' ? night.hunter : night.survivors[0];
                camera.position.y = EYE_H + nightGroundTick(self, camera.position.x, camera.position.z, dt);
            } else if (hooking) {
                camera.position.y = night.hunter.p.y;
            }
            nightActorsTick(dt);
            netLerpRemotes(dt);
            netRemoteRepairTick(dt);
            netTick(dt);
            if (night.action && night.action.type === 'vault' && !night.spectating) {
                night.vaultApplied = night.vaultLift;
                camera.position.y += night.vaultApplied;
            }
            if (night.over) return;

            if (!night.rateBoosted && night.t >= NIGHT.rateBoostAt) { night.rateBoosted = true; nightFlash('挖煤速度增加！'); }

            if (night.repairing && nightMachinesLocked()) { night.repairing = null; night.calib = null; }
            if (night.repairing) {
                let m = night.repairing;
                let mult = night.char === 'mi' ? SKILL.miRepairMult : 1;
                if (m.c2Boost) mult *= SKILL.c2BoostMul;
                mult *= nightC2MarkMul(night.survivors[0]);
                mult *= nightSealSlow(night.survivors[0]);
                m.progress = Math.min(100, m.progress + nightBaseRate() * mult * gdt / nightActMul(night.survivors[0]));
                nightCheckMachine(m);
            }
            if (night.repairing) {
                night.nextCalibAt -= dt;
                if (night.calib) {
                    night.calib.pos += dt / NIGHT.calibSweep;
                    if (night.calib.pos >= 1) { night.calib = null; nightApplyCalib('gray'); }
                } else if (night.nextCalibAt <= 0) { nightStartCalib(); }
            }

            if (night.doorTarget) {
                let d = night.doorTarget;
                if (nightSealed(d)) { night.doorTarget = null; nightFlash('这道门被封住了'); }
                else if (!d.open) {
                    d.openProgress += dt / nightActMul(night.survivors[0]);
                    if (d.openProgress >= NIGHT.doorOpenTime) nightOpenDoor(d);
                } else {
                    night.escapeProg += dt;
                    if (night.escapeProg >= NIGHT.escapeTime) {

                        night.survivors[0].escaped = true;
                        night.doorTarget = null; night.escapeProg = 0;
                    }
                }
            } else { night.escapeProg = 0; }

            nightHUD();
            nightRender(dt);
        }

        function nightRender(dt) {
            let hunterSide = night.side === 'hunter';
            let me = hunterSide ? night.hunter : night.survivors[0];
            let show = !night.spectating && me && !me.out && !me.escaped && !me.onChair &&
                !(night.hunter && night.hunter.carrying === me);
            if (!night.selfMesh || !night.selfMesh.parent) {
                night.selfMesh = nightMakeBody(night.char, hunterSide, myFace(), gState.acc);
                // 追捕个子高（20），镜头被压在一层楼高度以内的话它会挡住准星——自己看自己半透明
                if (hunterSide) night.selfMesh.traverse(function (o) {
                    if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; }
                });
                mapExtraAdd(night.selfMesh);
            }
            let sm = night.selfMesh;
            sm.visible = show;
            if (show) {
                let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
                sm.position.set(camera.position.x, me.gy || 0, camera.position.z);
                sm.rotation.y = -Math.atan2(dir.z, dir.x) + Math.PI / 2;
                sm.scale.y = me.downed ? 0.22 : 1;
            }
            // 楼里（楼板底下/二楼）头顶有天花板，镜头最高只到脚下往上一层楼，不然会穿到屋顶上面去
            let feet = camera.position.y - EYE_H;
            tpRender({
                back: hunterSide ? 32 : 26, up: hunterSide ? 18 : 7, self: show ? sm : null,
                yMin: feet + 3, yMax: feet + DECK_H - 3, hideBelow: hunterSide ? 20 : 8,
                blocked: function (x, z) { return checkCol(x, z, 9, 0); }
            });
        }

        // 右上角每个逃生者的状态图标：用开始页那只猫盾的样子（圆角身体 + 两只尖耳朵）。
        // 站着的时候身体往上拉长；倒地了整只压扁趴下。受伤程度用红色填充：
        // 满血白色、半血下半截红、倒地整只红（原来是黑色方块，看着像没加载出来）。
        let nightIconSeq = 0;
        function nightStatusBox(a) {
            let s = '<svg width="26" height="34" viewBox="0 0 26 34" style="display:block; margin:0 auto 2px">';
            if (a.out || a.chairCount >= 3) {
                s += '<line x1="4" y1="6" x2="22" y2="30" stroke="#d9534f" stroke-width="3" stroke-linecap="round"/>';
                s += '<line x1="22" y1="6" x2="4" y2="30" stroke="#d9534f" stroke-width="3" stroke-linecap="round"/>';
                return s + '</svg>';
            }
            let stroke = a.escaped ? '#5cb85c' : (a.onChair ? '#ff6b6b' : '#bbb');
            let flat = a.downed && !a.onChair;
            // 一整条轮廓（耳朵长在身体两个上角），耳朵和身体之间不会多出一道线
            let shape = flat
                ? '<path d="M2,28 Q2,32 6,32 L20,32 Q24,32 24,28 L24,23 L20.5,18 L17.5,22.5 L8.5,22.5 L5.5,18 L2,23 Z"/>'
                : '<path d="M3,27 Q3,32 8,32 L18,32 Q23,32 23,27 L23,11 L19,2.5 L15.5,9 L10.5,9 L7,2.5 L3,11 Z"/>';
            let fill = a.downed ? '#e53935' : '#fff';
            s += '<g fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4" stroke-linejoin="round">' + shape + '</g>';
            if (!a.downed && a.hp <= 1) {   // 半血：下半截红
                let id = 'nsi' + (nightIconSeq++ % 1000);
                s += '<clipPath id="' + id + '"><rect x="0" y="20.5" width="26" height="14"/></clipPath>' +
                    '<g clip-path="url(#' + id + ')" fill="#e53935">' + shape + '</g>' +
                    '<g fill="none" stroke="' + stroke + '" stroke-width="1.4" stroke-linejoin="round">' + shape + '</g>';
            }
            let dot = (a.downed || a.hp <= 1) ? '#fff' : '#555';
            let dy = flat ? 28 : 27;
            if (a.chairCount >= 1) s += '<circle cx="9" cy="' + dy + '" r="2.4" fill="' + dot + '"/>';
            if (a.chairCount >= 2) s += '<circle cx="17" cy="' + dy + '" r="2.4" fill="' + dot + '"/>';
            // 眼睛：让它一眼看得出是只猫盾，不是一个框
            if (!flat) s += '<circle cx="9.5" cy="17" r="1.3" fill="#333"/><circle cx="16.5" cy="17" r="1.3" fill="#333"/>';
            else s += '<line x1="8" y1="26.5" x2="11" y2="26.5" stroke="#fff" stroke-width="1.2"/><line x1="15" y1="26.5" x2="18" y2="26.5" stroke="#fff" stroke-width="1.2"/>';
            return s + '</svg>';
        }

        const DANGER_FAR = 144, DANGER_NEAR = 32;
        function nightDangerVignette() {
            let el = document.getElementById('night-danger'); if (!el) return;

            let me = null;
            if (night.spectating) { let l = nightSpectateTargets(); me = l[night.spectateIdx] || null; }
            else if (night.side === 'survivor') me = night.survivors[0];

            let target = 0;
            if (me && !me.out && !me.escaped && night.hunter) {
                let d = me.p.distanceTo(night.hunter.p);
                let k = Math.max(0, Math.min(1, (DANGER_FAR - d) / (DANGER_FAR - DANGER_NEAR)));
                target = k <= 0 ? 0 : 0.15 + 0.70 * k * k;
            }

            let now = performance.now();
            let step = Math.min(1, (now - (night.dangerAt || now)) / 1000 * 5);
            night.dangerAt = now;
            night.dangerCur = (night.dangerCur || 0) + (target - (night.dangerCur || 0)) * step;
            if (night.dangerCur < 0.004) night.dangerCur = target === 0 ? 0 : night.dangerCur;
            el.style.opacity = night.dangerCur;
        }

        // 平板按钮的字随阵营变：
        //   逃生者 —— 互（交互）、1（技能，有才显示）、2（第二个技能，有才显示）
        //   追捕   —— 刀（普攻）、1（技能）、互（抓人挂人也算交互）
        function nightLabelButtons() {
            if (gState.control !== 'pad' || !night) return;
            let atk = document.getElementById('night-atk-btn');
            let s2 = document.getElementById('night-skill2-btn');
            let sp = document.getElementById('night-space-btn');
            let e3 = document.getElementById('night-e-btn');
            if (!atk || !s2 || !sp || !e3) return;
            if (night.side === 'hunter') {
                atk.innerText = '普攻';
                s2.innerText = '1技能';
                sp.innerText = '抓人';
                e3.innerText = '破板';
                e3.style.display = 'flex';
            } else {
                atk.innerText = '互动';
                s2.innerText = '1技能';
                sp.innerText = '动作';
                e3.style.display = 'none';     // 逃生者没有第三个键
            }
        }

        function nightHUD() {
            nightDangerVignette();
            let left = Math.max(0, NIGHT.limit - night.t);
            document.getElementById('night-timer').innerText = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
            document.getElementById('night-machines').innerText = '矿机 ' + night.done + ' / ' + NIGHT.needed;

            let sk = '';
            let me = night.side === 'survivor' ? night.survivors[0] : null;
            if (night.side === 'survivor') {
                sk = '血量 ' + (me.downed ? '倒地' : me.hp + ' / 2');
                if (night.char === 'cat') sk += '　治疗 ' + (night.healCd > 0 ? night.healCd.toFixed(0) + 's' : '就绪');
                if (night.char === 'dog') {
                    sk += '　格挡 ' + night.blockCharges + '/' + SKILL.dogBlockCharges +
                        (night.blockT > 0 ? '（举盾中）' : (night.blockCharges < SKILL.dogBlockCharges ? '（' + night.blockRecharge.toFixed(0) + 's 回充）' : ''));
                    if (night.slamReady > 0) sk += '　【' + nightKey('space') + ' 砸地 就绪】';
                }
                if (night.char === 'meow') sk += '　救援 ' + (night.meowCd > 0 ? night.meowCd.toFixed(0) + 's' : '就绪');
                if (night.char === 'c1') sk += '　震慑 ' + (night.c1Cd > 0 ? night.c1Cd.toFixed(0) + 's' : '就绪') +
                    ((night.hunter && night.hunter.carrying) ? '（有人被扛着）' : '');
                if (night.char === 'c2') {
                    if (night.c2Cast) {
                        let c = night.c2Cast;
                        sk += c.phase === 'pick'
                            ? '　选择矿机 ' + (c.idx + 1) + '/' + c.list.length + '（' + kTxt('Q/E', '「切换」') + ' 切换，' + nightKey('act') + ' 确认）'
                            : (c.phase === 'pre' ? '　起手中…' : '　收手中…');
                    } else sk += '　提速 ' + (night.c2Cd > 0 ? night.c2Cd.toFixed(0) + 's' : '就绪');
                }
                if (night.char === 'mi') sk += '　爆发 ' + (night.miCd > 0 ? night.miCd.toFixed(0) + 's' : '+' + Math.max(SKILL.miBurstMin, night.done * SKILL.miBurstPer));
                if (me.tempHpUntil && performance.now() < me.tempHpUntil) sk += '　临时生命 ' + ((me.tempHpUntil - performance.now()) / 1000).toFixed(0) + 's';
                if (nightMyFish(me).length > 0) sk += '　小鱼干 ' + (me.fishEaten || 0) + '/' + SKILL.fishCount + '（你的还剩 ' + nightMyFish(me).length + ' 条）';
            } else {
                if (night.char === 'hmi') {
                    let list = nightTpTargets();
                    let cur = list[Math.min(night.tpIndex, Math.max(0, list.length - 1))];
                    sk = (night.tpCast ? '跃迁读条 ' + night.tpCast.t.toFixed(1) + ' / ' + SKILL.hmiTpCast + 's'
                        : '跃迁 ' + (night.tpCd > 0 ? night.tpCd.toFixed(0) + 's' : '就绪')) +
                        '　目标 ' + (list.length ? (night.tpIndex + 1) + '/' + list.length + '（进度 ' + cur.progress.toFixed(0) + '）' : '无') + '　' + kTxt('Q', '「切换」') + ' 切换';
                }
                else if (night.char === 'hgou') sk = '钉刺 ' + (night.spikeCd > 0 ? night.spikeCd.toFixed(0) + 's' : '就绪') + '（场上 ' + night.spikes.length + '/' + SKILL.hgouSpikeMax + '）';
                else if (night.char === 'hmeow') sk = night.spear ? '长矛飞行中' : ('投矛 ' + (night.throwCd > 0 ? night.throwCd.toFixed(0) + 's' : '就绪'));
                else if (night.char === 'h3') sk = '钩锁 ' + (night.hookCd > 0 ? night.hookCd.toFixed(0) + 's' : '就绪');
                else if (night.char === 'h4') sk = '封锁 ' + (night.sealCd > 0 ? night.sealCd.toFixed(0) + 's' : '就绪');
                else sk = '突刺 ' + (night.hunter.spearCd > 0 ? night.hunter.spearCd.toFixed(0) + 's' : '就绪') + (night.rushT > 0 ? '　追击加速 ' + night.rushT.toFixed(1) + 's' : '');
            }
            let dbg = '';
            if (NIGHT_DEBUG_CAM) {
                let self0 = night.side === 'hunter' ? night.hunter : night.survivors[0];
                let gy0 = (self0 && self0.gy) || 0, lv0 = (self0 && self0.level) || 0;

                let probe = function (dx, dz) {
                    let nx = camera.position.x + dx * (P_RADIUS + 6);
                    let nz = camera.position.z + dz * (P_RADIUS + 6);
                    if (checkCol(nx, nz, camera.position.y, undefined)) return '墙';
                    if (nightDroppedPalletAt(nx, nz, gy0)) return '板';
                    let want = nightSurface(nx, nz, lv0);
                    if (want - gy0 > NIGHT_STEP_UP) return '高' + Math.round(want);
                    return '通';
                };
                let cellK = nightCellKey(camera.position.x, camera.position.z);
                let d0 = gState.nightDeck || { cells: {}, stairs: {} };
                dbg = '　[' + camera.position.x.toFixed(0) + ',' + camera.position.z.toFixed(0) +
                    '　gy' + gy0.toFixed(0) + ' lv' + lv0 +
                    '　cf' + Math.floor(camera.position.y / TILE) +
                    (d0.cells[cellK] ? ' 楼板' : '') + (d0.stairs[cellK] !== undefined ? ' 台阶' + Math.round(d0.stairs[cellK]) : '') +
                    '　东' + probe(1, 0) + ' 西' + probe(-1, 0) + ' 南' + probe(0, 1) + ' 北' + probe(0, -1) + ']';
            }
            document.getElementById('night-side').innerText =
                (night.side === 'survivor' ? '逃生者 · ' : '追捕 · ') + NIGHT_CHARS[night.char].name + '　' + sk + dbg;

            document.getElementById('night-roster').innerHTML = night.survivors.map(function (a, i) {
                let name = (a.isPlayer ? '你' : 'P' + (i + 1)) + (a.charKey ? '·' + NIGHT_CHARS[a.charKey].name.slice(0, 1) : '');
                let sub = '';
                if (a.escaped) sub = '已撤离';
                else if (a.out) sub = '淘汰';
                else if (a.onChair) sub = Math.max(0, NIGHT.chairStage - a.chairTime).toFixed(0) + 's';
                else if (a.downed) sub = Math.max(0, NIGHT.bleedOut - a.bleed).toFixed(0) + 's';
                return '<div style="text-align:center; color:#eee; font-size:10px; line-height:1.4;">' +
                    nightStatusBox(a) + name + (sub ? '<br>' + sub : '') + '</div>';
            }).join('');

            let prompt = document.getElementById('night-prompt'), wrap = document.getElementById('night-bar-wrap'), bar = document.getElementById('night-bar');
            let cv = document.getElementById('night-calib');
            let show = null, frac = null;

            if (night.spectating) {
                prompt.style.display = 'none'; wrap.style.display = 'none'; cv.style.display = 'none';
                return;
            }

            if (night.side === 'survivor' && night.hunter && night.hunter.carrying === night.survivors[0]) {
                let st = night.survivors[0].struggle || 0;
                show = nightKey('space') + ' 挣扎 ' + st + ' / ' + NIGHT.struggleNeed;
                frac = st / NIGHT.struggleNeed;
            }
            else if (night.stun > 0) show = '眩晕中 ' + night.stun.toFixed(1) + 's';
            else if (night.action) {
                let a = night.action;
                let need = a.type === 'vault' ? NIGHT.palletVault
                    : a.type === 'rescue' ? (night.char === 'meow' ? SKILL.meowRescueTime : NIGHT.rescueTime)
                        : a.type === 'heal' ? SKILL.healTime : NIGHT.palletBreak;
                let label = a.type === 'vault' ? '翻越板子 ' : (a.type === 'rescue' ? '救援队友 ' : (a.type === 'heal' ? '治疗队友 ' : '破坏板子 '));
                show = label + a.t.toFixed(1) + ' / ' + need + 's';
                frac = a.t / need;
            }
            else if (night.side === 'survivor' && (me.downed || me.onChair)) {

                let dNear = nightNearest(gState.doors);
                if (me.downed && dNear.obj && dNear.obj.open && dNear.dist < 20) {
                    show = nightKey('act') + ' 爬出去撤离';
                }
                else if (me.downed) {
                    show = '自愈 ' + Math.round((me.healProg || 0) * 100) + '%';
                    introOnce('night.down', '倒地了', '自己能慢慢恢复到 ' + Math.round(NIGHT.selfHealCap * 100) + '%，剩下的要队友过来扶你。');
                    frac = me.healProg || 0;
                } else {
                    show = '挂在椅子上　' + me.chairCount + '/3';
                    introOnce('night.chair', '被挂上椅子了', '等队友来把你放下来。挂满 3 次就出局。');
                    frac = 1 - me.chairTime / NIGHT.chairStage;
                }
            }
            else if (night.repairing) {
                show = '修理中 ' + night.repairing.progress.toFixed(1) + ' / 100'; frac = night.repairing.progress / 100;
                introOnce('night.repair', '修矿机', '修的时候会跳出校准圈，指针转到红区按 ' + nightKey('space') + '。走开就停下来。');
            }
            else if (night.doorTarget && !night.doorTarget.open) { show = '开门中 ' + night.doorTarget.openProgress.toFixed(1) + ' / ' + NIGHT.doorOpenTime + 's'; frac = night.doorTarget.openProgress / NIGHT.doorOpenTime; }
            else if (night.doorTarget && night.doorTarget.open) { show = '撤离中 ' + night.escapeProg.toFixed(1) + ' / ' + NIGHT.escapeTime + 's'; frac = night.escapeProg / NIGHT.escapeTime; }
            else {
                let m = nightNearest(gState.machines.filter(function (o) { return !o.done; }));
                let d = nightNearest(gState.doors);
                let pu = nightNearest(gState.pallets.filter(function (p) { return p.state === 'up'; }));
                let pd = nightNearest(gState.pallets.filter(function (p) { return p.state === 'down'; }));
                let lvOk = function (q) { return nightSameLevel(camera.position, q); };
                let fishNear = night.fish.some(function (f) { return f.owner === me && lvOk(f.p) && Math.hypot(f.p.x - camera.position.x, f.p.z - camera.position.z) < 14; });
                let sickNear = night.survivors.some(function (a) { return !a.isPlayer && !a.out && !a.escaped && !a.downed && !a.onChair && a.hp < 2 && lvOk(a.p) && nightFlatDist(camera.position, a.p) < 16; });
                let downNear = night.survivors.some(function (a) { return !a.isPlayer && !a.out && !a.escaped && (a.downed || a.onChair) && lvOk(a.p) && nightFlatDist(camera.position, a.p) < 16; });
                if (night.side === 'survivor' && fishNear && me.hp < 2 && night.char !== 'cat') show = nightKey('act') + ' 吃小鱼干';
                else if (night.side === 'survivor' && downNear) show = nightKey('act') + ' 救援队友';
                else if (night.side === 'survivor' && sickNear) show = nightKey('act') + ' 治疗队友（10 秒）';
                else if (night.side === 'survivor' && pu.obj && pu.dist < 16) show = nightKey('act') + ' 放倒板子';
                else if (night.side === 'survivor' && pd.obj && pd.dist < 20) {
                    show = nightVaultLanding(pd.obj) ? nightKey('act') + ' 翻越板子（' + NIGHT.palletVault + ' 秒）'
                        : '两边都落不下脚，翻不过去';
                }
                else if (night.side === 'hunter' && night.hunter.carrying) show = nightKey('space') + ' 挂上椅子';
                else if (night.side === 'hunter' && nightAliveSurvivors().some(function (a) { return a.downed && !a.onChair && nightCanHit(night.hunter.p, a.p, NIGHT.atkRange + 6); })) show = nightKey('space') + ' 抓起';
                else if (night.side === 'hunter' && pd.obj && pd.dist < NIGHT.palletBreakRange) show = nightKey('e') + ' 破坏板子（3 秒）';
                else if (m.obj && m.dist < 16 && night.side === 'survivor') show = nightMachinesLocked() ? '矿机已经够了 —— 去开逃生门' : nightKey('act') + ' 修理矿机（' + m.obj.progress.toFixed(0) + '/100）';
                else if (d.obj && d.dist < 20) show = night.done >= NIGHT.needed ? nightKey('act') + ' 开门（20 秒）' : '还需修好 ' + (NIGHT.needed - night.done) + ' 台矿机';
            }

            prompt.style.display = show ? 'block' : 'none'; if (show) prompt.innerText = show;
            wrap.style.display = frac === null ? 'none' : 'block'; if (frac !== null) bar.style.width = (frac * 100) + '%';

            if (night.calib) { cv.style.display = 'block'; drawNightCalib(cv); } else cv.style.display = 'none';
        }

        function drawNightCalib(c) {
            let ctx = c.getContext('2d'), W = c.width, H = c.height;
            ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            CALIB.zones.forEach(function (z) {
                let y0 = H - z[1] * H, y1 = H - z[0] * H;
                ctx.fillStyle = z[2] === 'red' ? '#e91e8c' : (z[2] === 'gray' ? '#b0b0b0' : '#ffffff');
                ctx.fillRect(0, y0, W, y1 - y0); ctx.strokeStyle = '#ccc'; ctx.strokeRect(0, y0, W, y1 - y0);
            });
            let y = H - night.calib.pos * H;
            ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(W - 4, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W / 2, y + 14); ctx.stroke();
            ctx.lineWidth = 1;
        }

        function spawnLobbyAgents() {
            gState.team.forEach(function (member, idx) {
                if (member.id === gState.id) return;
                if (member.isAI && !huntAiOn()) return;
                let m = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 10), new THREE.MeshLambertMaterial({ color: 0x3498db })); m.position.set(camera.position.x + (idx + 1) * 4, 5, camera.position.z + 4);
                // 队友原来就是一根蓝色圆柱。圆柱留着（逻辑/碰撞/射线都认它），只是不画出来，
                // 上面挂一只猫盾身体——AI 队友也会随机戴商店里的表情/配饰/颜色，真人队友戴他自己的。
                m.material.visible = false;
                let body = raceMakeBody(member.isAI ? aiSkinColor(0x3498db) : 0x3498db, 0, true,
                    member.isAI ? aiRandomAcc() : peerAccOf(member.id), member.isAI ? aiRandomFace() : peerFaceOf(member.id));
                body.scale.setScalar(0.8); body.position.y = -5; m.add(body);
                m.userData = { type: 'ai', name: member.id, hp: 100, hasMed: true, hasRev: true, hasWep: true, atkCd: 0, chest: null, openTimer: 0, path: null, pathFloor: -1, stairGoal: null, skip: {}, skipAge: 0, floorLock: 0, stuck: 0, isRealPlayer: !member.isAI }; scene.add(m); entities.push(m);
            });
        }

        function spawnMonstersWithData(spawns) {
            if (HUNT_TEST_NOMOB) return;
            spawns.forEach((p) => {
                let f, type, name, hp, dmg, speed, split = 0, color;
                if (p.type === 1) { color = 0x95a5a6; name = "凝视者"; hp = 10; speed = 42 * 1.5; dmg = 40; type = 'angel'; }
                else if (p.type === 2) { color = 0x3498db; name = "伪装者"; hp = 15; speed = 30; dmg = 40; type = 'puppet'; }
                else if (p.type === 3) { color = 0x8e44ad; name = "高空者"; hp = 10; speed = 25; dmg = 20; type = 'high'; }
                else if (p.type === 4) { color = 0x2ecc71; name = "分裂者"; hp = 10; speed = 20; dmg = 40; type = 'splitter'; split = 0; }
                else if (p.type === 5) { color = 0x2c3e50; name = "诅咒之灵"; hp = 80; speed = 20; dmg = 0; type = 'curser'; }

                if (type === 'puppet') { f = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 10), new THREE.MeshLambertMaterial({ color: color })); f.position.set(p.fx * TILE, p.fl * TILE + 5, p.fz * TILE); }
                else if (type === 'curser') { f = new THREE.Mesh(new THREE.SphereGeometry(5), new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: 0.7 })); f.position.set(p.fx * TILE, p.fl * TILE + 5, p.fz * TILE); }
                else { f = new THREE.Mesh(new THREE.SphereGeometry(4.5), new THREE.MeshLambertMaterial({ color: color })); f.position.set(p.fx * TILE, p.fl * TILE + 4.5, p.fz * TILE); }

                f.userData = { type: type, name: name, hp: hp, maxHp: hp, speed: speed, dmg: dmg, atkCd: 0, split: split, attacked: false }; scene.add(f); entities.push(f);
            });
        }

        function triggerSpawnWave(w) {
            if (HUNT_TEST_NOMOB) return;
            let me = gState.team.find(t => t.id === gState.id);
            if (!me || !me.isLeader) return;
            let list = (gState.preGenSpawns || []).filter(function (s) { return (s.wave || 1) === w; });
            if (list.length === 0) return;
            bc.postMessage({ type: 'SPAWN_MOBS', target: '*', wave: w, spawns: list });
            spawnMonstersWithData(list);
        }


        // 地上的东西捡起来：整件拷回来（腰包里装的东西、商店道具标记、宝石/底座的数据都跟着），去掉地上用的字段
        function huntItemFromGround(ud) {
            let it = Object.assign({}, ud);
            delete it.isItem; delete it.vel; delete it.fromSignal; delete it.loot;
            return it;
        }
        function executeThrow(idx) {
            if (idx < 0 || idx >= gState.maxInv) return; let itemData = gState.inv[idx]; if (!itemData) return;
            if (openPouch === itemData) openPouch = null;   // 腰包扔出去，里面的东西跟着它走（it.bag）
            gState.inv[idx] = null; updateHUD();

            let blockColor = itemData.v >= 30000 ? (itemData.v >= 200000 ? '#e74c3c' : '#f1c40f') : '#9b59b6';
            let tObj = createProceduralTexture('generic', blockColor, '#ffffff');
            let itemMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ map: tObj }));
            let launchDir = new THREE.Vector3(); camera.getWorldDirection(launchDir); itemMesh.position.copy(camera.position).add(launchDir.clone().multiplyScalar(4)); itemMesh.userData = { ...itemData, isItem: true, vel: launchDir.multiplyScalar(60), gravityActive: true }; scene.add(itemMesh); groundItems.push(itemMesh);
        }

        // 扔出去的东西会不会撞墙。物品比人小很多，用一个小半径就行，
        // 不然贴着墙根都放不下。
        const ITEM_RADIUS = 1.6;
        function itemBlocked(x, z, floor) {
            let by = (floor || 0) * TILE, r = ITEM_RADIUS;
            return checkCol(x + r, z, 9, by) || checkCol(x - r, z, 9, by) ||
                checkCol(x, z + r, 9, by) || checkCol(x, z - r, 9, by);
        }

        // 地上的合成表。两件东西扔到一块儿（靠得够近）就自动合。
        // 加新配方就是在这里添一行。
        const GROUND_RECIPES = [
            {
                id: 'gcat', a: '猫盾', b: '小鱼干',
                out: { n: '黄金猫盾', v: 50000, w: 1, tex: 'cat_shield', c: 0xffeb3b, main: '#ffd700', detail: '#b8860b' }
            },
            {
                id: 'ucat', a: '黄金猫盾', b: '黄金小鱼干',
                out: { n: '至臻猫盾', v: 800000, w: 2, tex: 'cat_shield', c: 0xe056fd, main: '#e056fd', detail: '#9b59b6' }
            },
            {
                id: 'feast', a: '金苹果', b: '黄金圣杯',
                out: { n: '丰饶圣餐', v: 250000, w: 5, tex: 'cup', c: 0xffb300, main: '#ffb300', detail: '#e65100' }
            },
            {
                id: 'catblade', a: '骑士团圣剑', b: '至臻猫盾',
                // spd/hp 是装备这把剑时的加成（移动速度倍率、额外生命上限）——
                // 不是随便加在这就生效的，ground-merge 生成物、捡进背包两处都是
                // 显式一个个字段复制过去的，两边都要照着加，不然装备了也没用。
                out: { n: '猫盾骑士剑', v: 1000000, w: 5, tex: 'sword', c: 0xff4081, main: '#ff4081', detail: '#880e4f', type: 'wep', dmg: 150, spd: 1.15, hp: 40 }
            }
        ];
        const GROUND_MERGE_RANGE = 8;
        // 装备栏里 type 为 wep 的东西，除了攻击力，也可能带跑得更快 / 生命上限加成
        // （目前只有猫盾骑士剑有）。没装备/装备的不是武器就都是 0（速度倍率是 1）。
        function huntEquippedWeapon() {
            let w = gState.inv && gState.inv[gState.selectedSlot];
            return (w && w.type === 'wep') ? w : null;
        }
        function weaponSpeedMul() { let w = huntEquippedWeapon(); return (w && w.spd) || 1; }
        function weaponHpBonus() { let w = huntEquippedWeapon(); return (w && w.hp) || 0; }
        function effectiveMaxHp() { return (gState.maxHp || 100) + weaponHpBonus(); }

        // ── 配方图鉴 ──
        // 一条配方都不预先告诉你。你把两样东西扔到一块儿、真合出来了，
        // 图鉴上才会多一行。没发现的那几条只显示问号。
        function recipeBook() {
            if (!gState.recipes) gState.recipes = {};
            return gState.recipes;
        }
        function huntFoundRecipe(id) { return !!recipeBook()[id]; }
        function huntFindRecipe(id) {
            if (huntFoundRecipe(id)) return false;
            recipeBook()[id] = Date.now();
            saveProgress();
            return true;
        }
        // 皇冠那条不在 GROUND_RECIPES 里（它是镶嵌出来的），单独登记
        const CROWN_RECIPE = { id: 'crown', a: '王冠底座', b: '六颗宝石', out: { n: '皇冠', v: CROWN_FULL_V } };
        function allRecipes() { return GROUND_RECIPES.concat([CROWN_RECIPE]); }

        // ── 合成的动静 ──
        // 合成不是白捡：那一下会炸出光柱和声音，把附近的怪全招过来。
        // 合出来的东西越贵，动静越大、引怪范围越广、持续越久。
        let huntLure = null;   // { p, t, r }
        let huntLureFx = [];

        function huntMergeBoom(pos, value, name) {
            // 越贵越吵：3 万级别 40 半径，百万级别 160
            let lvl = Math.max(0, Math.min(1, Math.log10(Math.max(1, value) / 20000) / Math.log10(100)));
            let radius = 40 + lvl * 120;
            let secs = 4 + lvl * 6;
            huntLure = { p: pos.clone(), t: secs, r: radius };

            let h = 400;
            let mat = new THREE.MeshBasicMaterial({
                color: 0xfff59d, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide, depthWrite: false, fog: false
            });
            let beam = new THREE.Mesh(new THREE.CylinderGeometry(3 + lvl * 5, 3 + lvl * 5, h, 12, 1, true), mat);
            beam.position.set(pos.x, h / 2, pos.z);
            beam.renderOrder = 800;
            scene.add(beam);
            huntLureFx.push({ o: beam, mat: mat, t: secs, life: secs });

            let ringMat = new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
            let ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.96, radius, 48), ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(pos.x, pos.y - 1, pos.z);
            scene.add(ring);
            huntLureFx.push({ o: ring, mat: ringMat, t: 1.2, life: 1.2 });

            sfxPlay([523, 784, 1046], 0.5, 0.06, 'triangle');
            let el = document.getElementById('debuff-msg');
            if (el) {
                el.innerText = '合成了【' + name + '】—— 动静传出去了！';
                el.style.display = 'block';
                clearTimeout(huntMergeBoom._t);
                huntMergeBoom._t = setTimeout(function () { el.style.display = 'none'; }, 2200);
            }
        }

        function huntLureTick(dt) {
            if (huntLure) { huntLure.t -= dt; if (huntLure.t <= 0) huntLure = null; }
            huntLureFx = huntLureFx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); f.mat.dispose(); return false; }
                let frac = 1 - f.t / f.life;
                f.mat.opacity = 0.55 * (1 - frac);
                return true;
            });
        }

        // 怪在被吸引的范围里就往合成点跑，不再管玩家在哪
        function huntLurePoint(entity) {
            if (!huntLure) return null;
            if (entity.position.distanceTo(huntLure.p) > huntLure.r) return null;
            return huntLure.p;
        }

        function executeGroundCombinationsLogic() {
            if (groundItems.length < 2) return;
            let consumed = [];
            let isConsumed = function (o) { return consumed.indexOf(o) > -1; };

            // 王冠底座会把旁边的宝石吸上去。镶满六颗它自己就变成皇冠。
            groundItems.filter(function (i) { return i.userData.type === 'base'; }).forEach(function (bi) {
                if (isConsumed(bi)) return;
                groundItems.forEach(function (gi) {
                    if (isConsumed(gi) || gi === bi || gi.userData.type !== 'gem') return;
                    if (bi.userData.type !== 'base') return;   // 已经镶满变皇冠了就不再吃
                    if (bi.position.distanceTo(gi.position) >= GROUND_MERGE_RANGE) return;
                    if (!crownSocketGem(bi.userData, gi.userData.gem)) return;
                    consumed.push(gi); scene.remove(gi);
                    huntMergeBoom(bi.position, bi.userData.v, bi.userData.n);
                });
            });

            GROUND_RECIPES.forEach(function (rec) {
                let as = groundItems.filter(function (i) { return i.userData.n === rec.a; });
                let bs = groundItems.filter(function (i) { return i.userData.n === rec.b; });
                if (!as.length || !bs.length) return;
                bs.forEach(function (bi) {
                    if (isConsumed(bi)) return;
                    for (let k = 0; k < as.length; k++) {
                        let ai = as[k];
                        if (isConsumed(ai)) continue;
                        if (ai.position.distanceTo(bi.position) >= GROUND_MERGE_RANGE) continue;
                        consumed.push(ai, bi); scene.remove(ai); scene.remove(bi);
                        let up = rec.out;
                        let ns = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4),
                            new THREE.MeshLambertMaterial({ map: createProceduralTexture('gold_chest', up.main, up.detail) }));
                        ns.position.copy(ai.position);
                        ns.userData = { n: up.n, v: up.v, w: up.w, tex: up.tex, c: up.c, isItem: true, feeds: 0 };
                        if (up.type) { ns.userData.type = up.type; ns.userData.dmg = up.dmg; ns.userData.spd = up.spd; ns.userData.hp = up.hp; }
                        scene.add(ns); groundItems.push(ns);
                        huntFindRecipe(rec.id);
                        huntMergeBoom(ns.position, up.v, up.n);
                        break;
                    }
                });
            });

            if (consumed.length > 0) groundItems = groundItems.filter(function (i) { return !isConsumed(i); });
        }

        function refreshRadarMinimap() {
            const mmCanvas = document.getElementById('minimap'); if (!mmCanvas) return; const mCtx = mmCanvas.getContext('2d'); mCtx.fillStyle = '#f8f9fa'; mCtx.fillRect(0, 0, 150, 150); let cellW = 150 / mSize;
            let cf = playerFloor();
            document.getElementById('floor-txt').innerText = (cf + 1) + "层";

            if (gState.debuff.type === 1) { mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, 150, 150); return; }

            for (let z = 0; z < mSize; z++) { for (let x = 0; x < mSize; x++) { if (explored[cf] && explored[cf][z] && explored[cf][z][x]) { if (cf === 0 && x === 1 && z === 1) mCtx.fillStyle = '#f1c40f'; else if (maze[cf][z][x].isGoldShop) mCtx.fillStyle = '#e74c3c'; else if (maze[cf][z][x].type === 1) mCtx.fillStyle = '#b2bec3'; else if (maze[cf][z][x].isLeaf && !(cf === 0 && x === mSize - 2 && z === mSize - 2) && maze[cf][z][x].type !== 3) mCtx.fillStyle = '#e74c3c'; else if (maze[cf][z][x].type === 2) mCtx.fillStyle = '#ffeaa7'; else if (maze[cf][z][x].type === 3) mCtx.fillStyle = '#8e44ad'; else mCtx.fillStyle = '#ffffff'; mCtx.fillRect(x * cellW, z * cellW, cellW, cellW); } else { mCtx.fillStyle = '#2d3436'; mCtx.fillRect(x * cellW, z * cellW, cellW, cellW); } } }
            chests.forEach(function (c) { let cz = Math.floor(c.position.z / TILE), cx = Math.floor(c.position.x / TILE), ccf = Math.floor(c.position.y / TILE); if (ccf === cf && explored[cf] && explored[cf][cz] && explored[cf][cz][cx]) { if (c.userData.hidden) return; mCtx.fillStyle = c.userData.opened ? '#000000' : '#7f8c8d'; mCtx.fillRect(cx * cellW + 2, cz * cellW + 2, cellW - 4, cellW - 4); } });
            let px = (camera.position.x / TILE) * cellW; let pz = (camera.position.z / TILE) * cellW; mCtx.fillStyle = '#0984e3'; mCtx.beginPath(); mCtx.arc(px, pz, 3.5, 0, Math.PI * 2); mCtx.fill();
        }

        function refreshLargeMinimap() {
            const lmCanvas = document.getElementById('largemap'); if (!lmCanvas) return; const mCtx = lmCanvas.getContext('2d'); mCtx.fillStyle = '#f8f9fa'; mCtx.fillRect(0, 0, 450, 450); let cellW = 450 / mSize;
            let cf = playerFloor();

            if (gState.debuff.type === 1) { mCtx.fillStyle = '#000'; mCtx.fillRect(0, 0, 450, 450); return; }

            for (let z = 0; z < mSize; z++) { for (let x = 0; x < mSize; x++) { if (explored[cf] && explored[cf][z] && explored[cf][z][x]) { if (cf === 0 && x === 1 && z === 1) mCtx.fillStyle = '#f1c40f'; else if (maze[cf][z][x].isGoldShop) mCtx.fillStyle = '#e74c3c'; else if (maze[cf][z][x].type === 1) mCtx.fillStyle = '#b2bec3'; else if (maze[cf][z][x].isLeaf && !(cf === 0 && x === mSize - 2 && z === mSize - 2) && maze[cf][z][x].type !== 3) mCtx.fillStyle = '#e74c3c'; else if (maze[cf][z][x].type === 2) mCtx.fillStyle = '#ffeaa7'; else if (maze[cf][z][x].type === 3) mCtx.fillStyle = '#8e44ad'; else mCtx.fillStyle = '#ffffff'; mCtx.fillRect(x * cellW, z * cellW, cellW, cellW); } else { mCtx.fillStyle = '#2d3436'; mCtx.fillRect(x * cellW, z * cellW, cellW, cellW); } } }
            chests.forEach(function (c) { let cz = Math.floor(c.position.z / TILE), cx = Math.floor(c.position.x / TILE), ccf = Math.floor(c.position.y / TILE); if (ccf === cf && explored[cf] && explored[cf][cz] && explored[cf][cz][cx]) { if (c.userData.hidden) return; mCtx.fillStyle = c.userData.opened ? '#000000' : '#7f8c8d'; mCtx.fillRect(cx * cellW + 4, cz * cellW + 4, cellW - 8, cellW - 8); } });
            let px = (camera.position.x / TILE) * cellW; let pz = (camera.position.z / TILE) * cellW; mCtx.fillStyle = '#0984e3'; mCtx.beginPath(); mCtx.arc(px, pz, 6, 0, Math.PI * 2); mCtx.fill();
        }

        let keys = {};
        window.addEventListener('keydown', function (e) {
            // chat-input 自己的回车/Esc 不能被这条总闸拦掉，不然 chatMode===2
            // 那条分支永远走不到 —— 这就是「聊天栏发不出去」的病根。
            if (e.target.tagName === 'INPUT' && e.target.id !== 'chat-input') return;
            let code = e.keyCode; let keyStr = e.key.toLowerCase();

            if (chatMode === 2) {
                if (keyStr === 'enter') { chatSend(document.getElementById('chat-input').value); }
                else if (keyStr === 'escape') { chatSetMode(0); }
                return;
            }

            // 数字键原来在任何模式里都直接发快捷语——寻宝队的 1/2/3 选物品栏、腰包 1~5 全被它吃掉了，
            // 按了没反应还往聊天里发一句话。改成：回车打开快捷语列表，列表开着的时候数字才是快捷语。
            if (chatMode === 1 && keyStr >= '1' && keyStr <= '5') { chatSend(chatQuick[Number(keyStr) - 1]); return; }
            if (keyStr === 'enter' && chatIsActive() && !calib) { e.preventDefault(); chatSetMode(chatMode === 0 ? 1 : 2); return; }
            if (chatMode === 1 && keyStr === 'escape') { chatSetMode(0); return; }
            if (race && !race.over && race.phase === 'ready' && race.draw && keyStr >= '1' && keyStr <= '3') {
                let c = race.draw[Number(keyStr) - 1]; if (c) racePick(c.id); return;
            }

            if (calib) { if (keyStr === ' ') { e.preventDefault(); calibPress(); } return; }
            keys[keyStr] = true;
            moveKeyDown(keyStr, e);
            if (night && !night.over) {
                if (night.spectating) {
                    if (keyStr === 'a' || keyStr === 'arrowleft') nightCycleSpectate(-1);
                    if (keyStr === 'd' || keyStr === 'arrowright') nightCycleSpectate(1);
                    return;
                }

                if (keyStr === ' ') {
                    e.preventDefault();
                    // 空格不再兼管挖煤 —— 之前狗盾砸地和挖煤都挤在空格上，
                    // 一边修机器一边想砸地，两件事会互相抢。挖煤已经挪到右键。
                    if (night.side === 'hunter') nightHunterGrab();
                    else if (nightStrugglePress()) { /* 被扣着，空格用来挣扎 */ }
                    else nightDogSlam();
                }
                if (night.c2Cast) { if (keyStr === 'q') nightC2Cycle(-1); if (keyStr === 'e') nightC2Cycle(1); }
                else if (keyStr === 'e' && night.side === 'hunter') nightHunterBreak();
                if (keyStr === 'm') { bgmToggle(); return; }
                if (keyStr === 'f') { if (night.side === 'hunter') nightHunterAttack(); else nightInteract(); }
                if (keyStr === 'q' && night.side === 'hunter' && night.char === 'hmi') nightCycleTpTarget(1);
                return;
            }
            if (nm && !nm.over && (nm.me.out || nm.me.downed)) {
                if (keyStr === 'a' || keyStr === 'arrowleft') nmSpecCycle(-1);
                if (keyStr === 'd' || keyStr === 'arrowright') nmSpecCycle(1);
            }
            if (race && !race.over && race.racers[0].out) {
                if (keyStr === 'a' || keyStr === 'arrowleft') raceSpecCycle(-1);
                if (keyStr === 'd' || keyStr === 'arrowright') raceSpecCycle(1);
            }
            if (dodge && !dodge.over && dodge.spectating) {
                if (keyStr === 'a' || keyStr === 'arrowleft') dodgeCycleSpectate(-1);
                if (keyStr === 'd' || keyStr === 'arrowright') dodgeCycleSpectate(1);
                return;
            }
            if (isPlaying && !gState.isDead) {
                if (keyStr === 'e') { toggleBackpackUI(); }
                if (keyStr === 'm') { toggleLargeMapUI(); }
                if (!gState.backpackOpen && !gState.largeMapOpen) {
                    if (keyStr === 'q') { if (gState.selectedSlot >= 0 && gState.selectedSlot <= 2 && gState.inv[gState.selectedSlot]) executeThrow(gState.selectedSlot); }
                    // 手上拿着腰包时，1～3 改成从腰包里取东西
                    if (code >= 49 && code <= 51 && pouchOpen()) pouchTake(code - 49);
                    else if (code >= 49 && code <= 51) selectSlot(code - 49);
                }
                if (gState.needsLock && !gState.backpackOpen && !gState.largeMapOpen && ['w', 'a', 's', 'd', ' '].includes(keyStr)) { safeLockPointer(); gState.needsLock = false; }
            }
            else if (isPlaying && gState.isDead && !gState.hasLeft && !document.getElementById('spectate-bar').classList.contains('hidden')) {
                if (keyStr === 'a' || keyStr === 'arrowleft') cycleSpectate(-1);
                if (keyStr === 'd' || keyStr === 'arrowright') cycleSpectate(1);
            }
        });
        window.addEventListener('keyup', function (e) { let k = e.key.toLowerCase(); keys[k] = false; moveKeyUp(k); });

        // 方向键跟 WASD 一样能走：所有模式读的都是 keys['w'/'a'/'s'/'d']，这里把方向键映射过去。
        // 两边分开记，松开其中一个不会把另一个还按着的也算成松开。
        const ARROW_TO_WASD = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
        let moveHeld = { arrow: {}, letter: {} };
        function moveKeyDown(k, e) {
            let m = ARROW_TO_WASD[k];
            if (m) { moveHeld.arrow[m] = true; keys[m] = true; if (chatIsActive() && e) e.preventDefault(); }
            else if ('wasd'.indexOf(k) >= 0 && k.length === 1) moveHeld.letter[k] = true;
        }
        function moveKeyUp(k) {
            let m = ARROW_TO_WASD[k];
            if (m) { moveHeld.arrow[m] = false; keys[m] = !!moveHeld.letter[m]; }
            else if ('wasd'.indexOf(k) >= 0 && k.length === 1) { moveHeld.letter[k] = false; if (moveHeld.arrow[k]) keys[k] = true; }
        }
        window.addEventListener('mousedown', function (e) {
            if (e.target.closest('.joystick-zone') || e.target.closest('.action-btn') || e.target.closest('.slot') || e.target.closest('button')) return;
            if (night && !night.over) {

                if (!document.pointerLockElement) {
                    safeLockPointer();
                    return;
                }

                if (e.button === 0) { if (night.side === 'hunter') nightHunterAttack(); else nightInteract(); }
                if (e.button === 2) {
                    if (night.side === 'hunter') nightHunterSpear();
                    // 正在校准（挖煤）就优先当作挖煤键，没在挖煤才是逃生者技能
                    else if (night.calib) nightCalibPress();
                    else nightSurvivorSkill();
                }
                return;
            }
            if (!gState.backpackOpen) { if (e.button === 0) keys['lmb'] = true; if (e.button === 2) keys['rmb'] = true; }
            if (gState.needsLock && !gState.backpackOpen && !gState.largeMapOpen && isPlaying) { safeLockPointer(); gState.needsLock = false; }
        });
        window.addEventListener('mouseup', function (e) { if (e.button === 0) keys['lmb'] = false; if (e.button === 2) keys['rmb'] = false; });
        window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

        const tMove = { x: 0, y: 0 }; let touchBtn = { jump: false, interact: false, ability: false, item: false, throw: false };
        let padRun = false;   // 平板：跑 / 走的开关（默认走）
        let huntJumpBuf = 0;  // 跳键缓冲：落地前按的那一下留着，落地补上

        function padToggleRun() {
            padRun = !padRun;
            let b = document.getElementById('run-btn');
            if (b) {
                b.innerText = padRun ? '跑' : '走';
                b.style.background = padRun ? 'rgba(255,213,79,.9)' : 'rgba(255,255,255,.85)';
            }
        }

        function drawCapacityCircle() {
            let canvas = document.getElementById('cap-circle'); if (!canvas) return; let ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 60, 60);
            let all = carriedSlots(); let max = all.length; let used = all.filter(function (sl) { return sl[0][sl[1]]; }).length; let remain = max - used;   // 背包 + 身上腰包的格子
            let cx = 30, cy = 30, r = 24; ctx.lineWidth = 6;
            for (let i = 0; i < max; i++) {
                ctx.beginPath(); let startAngle = (i * 2 * Math.PI / max) - Math.PI / 2; let endAngle = ((i + 1) * 2 * Math.PI / max) - Math.PI / 2 - 0.1;
                ctx.arc(cx, cy, r, startAngle, endAngle); ctx.strokeStyle = i < used ? '#e74c3c' : '#bdc3c7'; ctx.stroke();
            }
            ctx.fillStyle = '#333'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(remain, cx, cy);
        }

        let lastSyncTime = 0;
        function animate() {
            if (!isPlaying) return; requestAnimationFrame(animate);
            let dt = clock.getDelta(); if (dt > 0.08) dt = 0.08;
            bgmTick();

            if (gState.debuff.cooldown > 0) {
                gState.debuff.cooldown -= dt;
                if (gState.debuff.cooldown <= 20 && gState.debuff.type !== 0) {
                    gState.debuff.type = 0; gState.maxHp = 100; document.getElementById('debuff-msg').style.display = 'none'; updateHUD();
                }
            }

            if (gState.timeStop > 0) {
                gState.timeStop -= dt; if (gState.timeStop <= 0) document.getElementById('time-stop-overlay').style.display = 'none';
            } else {
                timeSecs += 24 * dt;
                if (timeSecs >= endTime) { finishGame(false, "时间超出限制。"); return; }
                for (let wi = 0; wi < MOB_WAVES_AT.length; wi++) {
                    let flag = 'wave' + (wi + 1) + 'Spawned';
                    if (timeSecs >= MOB_WAVES_AT[wi] && !gState[flag]) { gState[flag] = true; triggerSpawnWave(wi + 1); }
                }

                let h = Math.floor(timeSecs / 3600); let m = Math.floor((timeSecs % 3600) / 60); let ampm = h >= 12 ? 'PM' : 'AM'; let dh = h % 12; if (dh === 0) dh = 12;
                document.getElementById('time-txt').innerText = `${dh.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
            }

            if (HUNT_TEST_GOD) { gState.hp = effectiveMaxHp(); stamina = 100; }

            let cf = playerFloor();
            let pcx = Math.floor((camera.position.x + TILE / 2) / TILE), pcz = Math.floor((camera.position.z + TILE / 2) / TILE);
            if (pcx >= 0 && pcx < mSize && pcz >= 0 && pcz < mSize) { for (let rz = -2; rz <= 2; rz++) { for (let rx = -2; rx <= 2; rx++) { if (pcz + rz >= 0 && pcz + rz < mSize && pcx + rx >= 0 && pcx + rx < mSize) explored[cf][pcz + rz][pcx + rx] = true; } } }

            entities.forEach(function (e) {
                if (e.userData.isRealPlayer) {
                    let ecf = Math.floor(e.position.y / TILE); if (ecf < 0) ecf = 0; if (ecf > FLOORS - 1) ecf = FLOORS - 1;
                    let ecx = Math.floor((e.position.x + TILE / 2) / TILE), ecz = Math.floor((e.position.z + TILE / 2) / TILE);
                    if (ecx >= 0 && ecx < mSize && ecz >= 0 && ecz < mSize) { for (let rz = -2; rz <= 2; rz++) { for (let rx = -2; rx <= 2; rx++) { if (ecz + rz >= 0 && ecz + rz < mSize && ecx + rx >= 0 && ecx + rx < mSize) explored[ecf][ecz + rz][ecx + rx] = true; } } }
                }
            });

            navRouteTick(false);

            refreshRadarMinimap(); if (gState.largeMapOpen) refreshLargeMinimap();
            tickSignal(dt);
            signalRouteTick(false);
            if (!gState.isDead && !gState.hasLeft && !gState.backpackOpen && !gState.largeMapOpen) handlePlayerEngine(dt);
            handleThrownItemsAndEntitiesEngine(dt);

            if (gState.isDead) {
                if (gState.spectating && gState.spectating.parent) { camera.position.set(gState.spectating.position.x, gState.spectating.position.y + 4, gState.spectating.position.z); }
                else if (gState.deathPos) { camera.position.copy(gState.deathPos); }
            }

            huntRender(dt);

            let now = Date.now();
            if (now - lastSyncTime > 50) { bc.postMessage({ type: 'POS_SYNC', sender: gState.id, target: '*', x: camera.position.x, y: camera.position.y, z: camera.position.z }); lastSyncTime = now; }
        }

        let huntSelf = null;
        function huntRender(dt) {
            let alive = !gState.isDead && !gState.hasLeft;
            if (alive && (!huntSelf || !huntSelf.parent)) {
                // 外层在脚下管朝向；中间一层在半身高度管翻滚/后仰（绕身体中间转，不是绕脚底甩）
                let body = raceMakeBody(mySkinColor(gState.char === 'yellow' ? 0xffd54f : 0x66bb6a), 0, true, gState.acc, myFace());
                body.scale.setScalar(0.8);   // 眼睛高 9，身体压到 9 以下，镜头从头顶看过去不挡准星
                body.position.y = -4.4;
                let pivot = new THREE.Group(); pivot.position.y = 4.4; pivot.add(body);
                huntSelf = new THREE.Group(); huntSelf.add(pivot);
                huntSelf.userData = body.userData; huntSelf.userData.pivot = pivot;
                huntSelf.userData.mats = [];
                body.traverse(function (o) { if (o.isMesh && o.material && o.material.emissive && huntSelf.userData.mats.indexOf(o.material) < 0) huntSelf.userData.mats.push(o.material); });
                mapExtraAdd(huntSelf);   // 退出/下一张图时跟地图一起清掉
            }
            if (huntSelf) {
                huntSelf.visible = alive;
                if (alive) { tpPoseSelf(huntSelf, camera.position.y - 9, camera.rotation.y + Math.PI, dt); huntSelfAnim(dt); }
            }
            huntAgentsAnim(dt);
            huntTaskTick();
            let cf = Math.max(0, Math.min(FLOORS - 1, Math.floor(camera.position.y / TILE)));
            tpRender({
                back: 22, up: 6, self: alive ? huntSelf : null, hideBelow: 8,
                yMin: cf * TILE + 3, yMax: cf * TILE + TILE - 3,   // 别穿到楼上/楼下去
                blocked: function (x, z, y) { return checkCol(x, z, y, y); }
            });
        }

        // 自己的动作：黄猫盾「滚动」时整个人往前翻滚；掉血时往后一仰、闪红；绿猫盾回血时身上泛绿光
        function huntSelfAnim(dt) {
            let u = huntSelf.userData, pv = u.pivot;
            if (u.lastHp !== undefined && gState.hp < u.lastHp) u.hurtT = 0.4;
            u.lastHp = gState.hp;
            let rollOn = gState.char === 'yellow' && abilityActive > 0;
            if (rollOn) { u.rollA = (u.rollA || 0) + dt * 16; pv.rotation.x = u.rollA; }
            else { u.rollA = 0; pv.rotation.x = 0; }
            let glow = 0x000000;
            if (u.hurtT > 0) {
                u.hurtT -= dt;
                let k = Math.max(0, u.hurtT / 0.4);
                if (!rollOn) pv.rotation.x = -0.5 * k;
                glow = new THREE.Color(0x000000).lerp(new THREE.Color(0xcc1f1f), k).getHex();
            } else if (gState.char !== 'yellow' && abilityActive > 0) {
                glow = new THREE.Color(0x0a3d0a).lerp(new THREE.Color(0x2e7d32), 0.5 + 0.5 * Math.sin(performance.now() / 180)).getHex();
            }
            u.mats.forEach(function (m) { m.emissive.setHex(glow); });
        }
        // 队友（猫盾身体挂在逻辑圆柱上）：转向走的方向、走起来摆腿
        function huntAgentsAnim(dt) {
            entities.forEach(function (e) {
                if (e.userData.type !== 'ai' || !e.children.length) return;
                let b = e.children[0], u = b.userData;
                let lp = u.lastP || e.position.clone();
                let dx = e.position.x - lp.x, dz = e.position.z - lp.z;
                u.lastP = e.position.clone();
                let sp = Math.hypot(dx, dz) / Math.max(dt, 0.001);
                if (sp > 2) b.rotation.y = Math.atan2(dx, dz);
                let run = Math.min(1, sp / 30);
                u.animT = (u.animT || 0) + dt * (2 + run * 14);
                if (u.legs) { u.legs[0].rotation.x = Math.sin(u.animT) * 0.9 * run; u.legs[1].rotation.x = -Math.sin(u.animT) * 0.9 * run; }
                if (u.arms) { u.arms[0].rotation.x = -Math.sin(u.animT) * 0.7 * run; u.arms[1].rotation.x = Math.sin(u.animT) * 0.7 * run; }
                b.scale.y = e.userData.hp <= 0 ? 0.25 * 0.8 : 0.8;   // 倒地的队友趴下
            });
        }

        // ── 每局一个随机小任务，做完给猫盾币 ──
        const HUNT_TASKS = [
            { id: 'gold', text: '开一个金箱子', n: 1 },
            { id: 'chest', text: '开 4 个箱子', n: 4 },
            { id: 'kill', text: '打倒 3 只怪', n: 3 },
            { id: 'floor', text: '上到 3 楼', n: 1 },
            { id: 'cash', text: '上交满 $30000', n: 30000 }
        ];
        const HUNT_TASK_REWARD = 8;
        function huntTaskNew() {
            let t = HUNT_TASKS[Math.floor(Math.random() * HUNT_TASKS.length)];
            gState.huntTask = { id: t.id, text: t.text, n: t.n, got: 0, done: false };
            huntTaskHud();
        }
        function huntTaskEvent(kind, arg) {
            let t = gState.huntTask; if (!t || t.done) return;
            if (kind === 'chest') { if (t.id === 'chest') t.got++; if (t.id === 'gold' && arg === 'gold') t.got++; }
            else if (kind === 'kill' && t.id === 'kill') t.got++;
            else if (kind === 'floor' && t.id === 'floor' && arg >= 2) t.got = 1;
            else if (kind === 'cash' && t.id === 'cash') t.got = arg;
            if (t.got >= t.n) {
                t.done = true;
                coinsAdd('hunt', HUNT_TASK_REWARD);
                blazeFlash('任务完成！' + t.text + '　+' + HUNT_TASK_REWARD + ' 猫盾币');
                if (typeof achCheck === 'function') achCheck('huntTask');
            }
            huntTaskHud();
        }
        function huntTaskTick() {
            let t = gState.huntTask; if (!t || t.done || gState.isDead) return;
            if (t.id === 'floor') { let cf = Math.floor(camera.position.y / TILE); if (cf >= 2) huntTaskEvent('floor', cf); }
            if (t.id === 'cash' && (gState.runCash || 0) !== t.got) huntTaskEvent('cash', gState.runCash || 0);
        }
        function huntTaskHud() {
            let el = document.getElementById('hunt-task-txt'); if (!el) return;
            let t = gState.huntTask; if (!t) { el.innerText = ''; return; }
            el.innerText = '任务：' + t.text + (t.done ? '　✔' : (t.n > 1 && t.id !== 'cash' ? '（' + t.got + '/' + t.n + '）' : '')) + '　+' + HUNT_TASK_REWARD;
            el.style.color = t.done ? '#43a047' : '#e65100';
        }

        function handlePlayerEngine(dt) {
            let w = HUNT_TEST_NOWEIGHT ? 0 : invWeight();
            let abilityTrigger = keys['rmb'] || touchBtn.ability; let selectedInv = gState.inv[gState.selectedSlot];

            if (abilityTrigger && gState.selectedSlot <= 2 && selectedInv && selectedInv.type === 'signal') {
                keys['rmb'] = false; touchBtn.ability = false;
                if (gState.signal.active) showSysModal('提示', '信号接收器正在工作，找到它指引的物品才算用完。', [{ label: '确定' }]);
                else if (selectedInv.uses > 0) { gState.signal.active = true; gState.signal.timer = 0; gState.signal.mesh = null; }
                else showSysModal('提示', '信号接收器已耗尽。', [{ label: '确定' }]);
                return;
            }

            if (abilityTrigger && gState.selectedSlot <= 2 && selectedInv && selectedInv.type === 'badge') {
                keys['rmb'] = false; touchBtn.ability = false;
                if (selectedInv.uses > 0) {
                    selectedInv.uses = 0;
                    camera.position.set(TILE, 9, TILE); pVel.set(0, 0, 0); onGround = true;
                    clearFootprints3D(); currentNavPath = [];
                    gState.inSafeZone = true; if (document.pointerLockElement) document.exitPointerLock();
                    updateHUD();
                } else {
                    showSysModal('提示', '地窖徽章已耗尽，需要回仓库充能维护。', [{ label: '确定' }]);
                }
                return;
            }

            if (abilityTrigger && gState.selectedSlot <= 2 && selectedInv && selectedInv.type === 'carriage') {
                keys['rmb'] = false; touchBtn.ability = false;
                gState.inv[gState.selectedSlot] = null;
                submitLoot(); gState.safeOpenedThisGame = true; completeExtraction("皇家马车撤离成功"); return;
            }
            if (abilityCd > 0) abilityCd -= dt;

            // 第一次背到超过 10 负重的时候弹一次提示——不然新手只会觉得"怎么突然变慢了"，
            // 得自己瞎猜半天才想到是负重的事，只提示一次，不会每局都弹。
            if (w > 10 && !gState.weightWarnShown) {
                gState.weightWarnShown = true; saveProgress();
                showSysModal('负重过高', '背太多了，走得会变慢。丢掉点东西就好。', [{ label: '知道了' }]);
            }
            let f_w = w <= 10 ? 0 : Math.min(90, w - 10); let speedMult = (100 - f_w) / 100; let wMod = 1 * speedMult;

            if (gState.char === 'yellow') {
                if (abilityTrigger && abilityCd <= 0) { abilityActive = 2.0; abilityCd = 40; }
                if (abilityActive > 0) { abilityActive -= dt; wMod = 1; }
            } else {
                if (abilityTrigger && abilityCd <= 0) { abilityActive = 15.0; abilityCd = 40; }
                if (abilityActive > 0) { abilityActive -= dt; gHpRegenAcc += 8 * dt; if (gHpRegenAcc >= 1) { gState.hp = Math.min(effectiveMaxHp(), gState.hp + Math.floor(gHpRegenAcc)); gHpRegenAcc -= Math.floor(gHpRegenAcc); } updateHUD(); }
            }

            let baseMoveSpeed = 42 * wMod * DAILY_MOD.speedMul * bondSpeedMul() * weaponSpeedMul();
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); let side = new THREE.Vector3(-dir.z, 0, dir.x); let moveX = 0, moveZ = 0;

            let fwd = 0; let strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1; if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let len = Math.hypot(strafe, fwd); if (len > 1.0) { strafe /= len; fwd /= len; }
            moveX = dir.x * fwd + side.x * strafe; moveZ = dir.z * fwd + side.z * strafe;

            let isMoving = (moveX !== 0 || moveZ !== 0);
            let isRunning = (keys['shift'] || padRun) && isMoving && stamina > 0;
            let drainMult = gState.debuff.type === 2 ? 2.5 : 1.0;
            if (isRunning) { baseMoveSpeed *= staminaBoostMul(stamina, 1.6); stamina = Math.max(0, stamina - 28 * drainMult * dt); } else { stamina = Math.min(100, stamina + 16 * dt); } document.getElementById('stamina-fill').style.width = stamina + '%';
            let staminaTxt = document.getElementById('stamina-txt'); if (staminaTxt) staminaTxt.innerText = Math.floor(stamina);

            let isMovingAllowed = (actionTarget !== 'med' && actionTarget !== 'time_stop');

            if (actionTarget === 'med' || actionTarget === 'time_stop') {
                if (isMoving) { actionTimer = 0; actionTarget = null; document.getElementById('progress-bg').style.display = 'none'; } else {
                    actionTimer += dt; document.getElementById('progress-bg').style.display = 'block';
                    let needed = actionTarget === 'med' ? 4 : 1.5; document.getElementById('progress-fill').style.width = (actionTimer / needed) * 100 + '%';
                    if (actionTimer >= needed) {
                        if (actionTarget === 'med') gState.hp = Math.min(effectiveMaxHp(), gState.hp + 40);
                        if (actionTarget === 'time_stop') { gState.timeStop = 30.0; document.getElementById('time-stop-overlay').style.display = 'block'; }
                        let currentItem = gState.inv[gState.selectedSlot]; if (currentItem) { currentItem.uses--; if (currentItem.uses <= 0) gState.inv[gState.selectedSlot] = null; }
                        actionTimer = 0; actionTarget = null; document.getElementById('progress-bg').style.display = 'none'; updateHUD();
                    }
                }
            }

            if (isMovingAllowed) {

                if (keys[' '] || touchBtn.jump) { huntJumpBuf = 0.16; keys[' '] = false; touchBtn.jump = false; }
                if (huntJumpBuf > 0) {
                    huntJumpBuf -= dt;
                    if (onGround) { pVel.y = 44; onGround = false; huntJumpBuf = 0; }
                }
                huntPhysics(dt, moveX, moveZ, baseMoveSpeed);
                let cf = playerFloor();

                let inSafeZone = (cf === 0 && Math.floor((camera.position.x + TILE / 2) / TILE) === 1 && Math.floor((camera.position.z + TILE / 2) / TILE) === 1);
                if (inSafeZone && !gState.inSafeZone) { if (document.pointerLockElement) document.exitPointerLock(); }
                else if (!inSafeZone && gState.inSafeZone) { gState.needsLock = true; }
                gState.inSafeZone = inSafeZone;
            }

            let executeClick = keys['f'] || keys['lmb'] || touchBtn.interact;
            if (executeClick) { keys['f'] = false; keys['lmb'] = false; touchBtn.interact = false; }
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); let interactions = raycaster.intersectObjects([...chests, ...groundItems, ...entities]);

            if (gState.pAtkCd > 0) gState.pAtkCd -= dt;

            let activeObj = (interactions.length > 0 && interactions[0].distance < 25) ? interactions[0].object : null;
            // 第三人称下准星很难正好压在地上的小箱子上（平板连准星都没有），没瞄中就拿身边最近的
            if (!activeObj && executeClick) activeObj = huntNearestInteract();
            if (activeObj) {
                if (executeClick) {
                    if (activeObj.userData.type === 'angel' || activeObj.userData.type === 'puppet' || activeObj.userData.type === 'high' || activeObj.userData.type === 'splitter' || activeObj.userData.type === 'curser') {
                        if (activeObj.userData.type === 'curser') activeObj.userData.attacked = true;
                        let hasWep = gState.inv.find(function (i) { return i && i.type === 'wep'; });
                        if (hasWep && gState.pAtkCd <= 0) {
                            gState.pAtkCd = 1.0;
                            let equippedWep = gState.inv[gState.selectedSlot];
                            let currentWeaponDamage = (equippedWep && equippedWep.type === 'wep') ? (equippedWep.dmg || 5) : 5;
                            activeObj.userData.hp -= currentWeaponDamage;
                            if (activeObj.userData.hp <= 0) {
                                huntTaskEvent('kill');
                                if (activeObj.userData.type === 'splitter' && activeObj.userData.split < 2) {
                                    for (let i = 0; i < 2; i++) {
                                        let f = new THREE.Mesh(new THREE.SphereGeometry(4.5 * (0.7 ** (activeObj.userData.split + 1))), new THREE.MeshLambertMaterial({ color: 0x2ecc71 }));
                                        f.position.copy(activeObj.position); f.position.x += (Math.random() - 0.5) * 5; f.position.z += (Math.random() - 0.5) * 5;
                                        f.userData = { type: 'splitter', name: "分裂者", hp: 10, maxHp: 10, speed: 20, dmg: 40, atkCd: 0, split: activeObj.userData.split + 1 };
                                        scene.add(f); entities.push(f);
                                    }
                                }
                                scene.remove(activeObj); let eIdx = entities.indexOf(activeObj); if (eIdx > -1) entities.splice(eIdx, 1);
                            }
                        }
                    }
                    else if (activeObj.userData.isChest && !activeObj.userData.opened) {
                        activeObj.userData.opened = true; activeObj.material.color.setHex(0x1a1a1a);
                        bc.postMessage({ type: 'CHEST_OPENED', target: '*', cx: Math.floor(activeObj.position.x / TILE), cz: Math.floor(activeObj.position.z / TILE), cf: Math.floor(activeObj.position.y / TILE) });

                        let boxType = activeObj.userData.type;
                        huntTaskEvent('chest', boxType);
                        if (boxType === 'safe') gState.safeOpenedThisGame = true;
                        let singleLoot = huntChestLoot(activeObj);

                        if (singleLoot) {
                            let tObj = createProceduralTexture(singleLoot.tex, singleLoot.c, '#ffffff');
                            let box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ map: tObj }));
                            box.position.copy(activeObj.position).add(new THREE.Vector3(0, activeObj.userData.type === 'safe' ? 4 : 1.5, 0));

                            let ang = Math.random() * Math.PI * 2;
                            box.userData = { ...singleLoot, isItem: true, vel: new THREE.Vector3(Math.cos(ang) * 18, 0, Math.sin(ang) * 18) };
                            scene.add(box); groundItems.push(box);
                        }
                    }
                    else if (activeObj.userData.isItem) {
                        expandInventory();
                        let picked = huntItemFromGround(activeObj.userData), slot = carryFreeSlot(picked);   // 背包满了就放进身上腰包的空格
                        if (slot) {
                            huntItemIntro(activeObj.userData);
                            slot[0][slot[1]] = picked;

                            if (activeObj.userData.fromSignal || activeObj === gState.signal.mesh) {
                                let recv = gState.inv.find(function (i) { return i && i.type === 'signal'; });
                                if (recv) recv.uses = 0;
                                gState.signal = { active: false, timer: 0, mesh: null };
                                signalRouteClear();
                            }
                            scene.remove(activeObj); let index = groundItems.indexOf(activeObj); if (index > -1) groundItems.splice(index, 1); updateHUD();
                        }
                    }
                }
            }
        }

        const HUNT_GRAB_TYPES = { angel: 1, puppet: 1, high: 1, splitter: 1, curser: 1 };
        // 第一次碰到某种怪/某种道具，弹一张说明（只弹一次）
        const HUNT_MOB_INTRO = {
            angel: '你看着它，它就不动；一转身它就冲过来。',
            puppet: '看着它它就不动，背过去它就追你。',
            high: '会隔着楼层打到你，上下楼也躲不开。',
            splitter: '打死会分成两个小的。',
            curser: '被它盯上会中诅咒：地图乱掉、体力掉得快、或者血量上限变低。'
        };
        const HUNT_ITEM_INTRO = {
            wep: ['武器', '拿在手上，' + '对着怪物「互动」就能打它。'],
            signal: ['信号接收器', '拿在手上用一下，图上会出现一件好东西，跟着蓝线就能走过去，换楼层也认路。'],
            time_stop: ['时空沙漏', '用了以后怪物会停住一会儿。'],
            amulet: ['永恒誓言', '带在身上，凝视者和伪装者就不会靠近你。'],
            badge: ['地窖徽章', '用了直接回到起点。只能用一次，回仓库能充能。']
        };
        function huntItemIntro(d) {
            let t = HUNT_ITEM_INTRO[d && d.type]; if (!t) return;
            introOnce('hunt.item.' + d.type, t[0], t[1] + (d.type === 'wep' ? '' : '<br>' + kTxt('选中它按 <b>右键</b> 用。', '选中它点 <b>道具</b> 用。')));
        }
        function huntNearestInteract() {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let best = null, bestD = 1e9, p = camera.position;
            let consider = function (o) {
                let dx = o.position.x - p.x, dz = o.position.z - p.z, d = Math.hypot(dx, dz);
                if (Math.abs(o.position.y - (p.y - 7)) > TILE * 0.6 || d > 18) return;
                let front = d < 0.01 ? 1 : (dx * dir.x + dz * dir.z) / d;
                if (d > 8 && front < 0.3) return;   // 远一点的要在前面，贴身的哪个方向都行
                let score = d - front * 4;
                if (score < bestD) { bestD = score; best = o; }
            };
            groundItems.forEach(consider);
            chests.forEach(function (c) { if (!c.userData.opened) consider(c); });
            entities.forEach(function (e) { if (HUNT_GRAB_TYPES[e.userData.type]) consider(e); });
            return best;
        }

        function handleThrownItemsAndEntitiesEngine(dt) {
            camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
            viewProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); viewFrustum.setFromProjectionMatrix(viewProjMatrix);

            groundItems.forEach(function (item) {
                let moving = item.userData.vel && item.userData.vel.lengthSq() > 0.1;
                if (item.userData.settled && !moving) return;
                if (moving) {
                    // 不穿墙：x / z 分开试，哪一轴撞墙就沿墙滑，
                    // 同时把那一轴的速度反弹并衰减一大截
                    let v = item.userData.vel;
                    let fl = Math.floor(item.position.y / TILE); if (fl < 0) fl = 0;
                    let nx = item.position.x + v.x * dt, nz = item.position.z + v.z * dt;
                    if (itemBlocked(nx, item.position.z, fl)) { v.x *= -0.35; } else { item.position.x = nx; }
                    if (itemBlocked(item.position.x, nz, fl)) { v.z *= -0.35; } else { item.position.z = nz; }
                    item.position.y += v.y * dt;
                    v.multiplyScalar(Math.exp(-2.5 * dt));
                    item.userData.settled = false;
                }
                let cf = Math.floor(item.position.y / TILE); if (cf < 0) cf = 0;
                let downRay = new THREE.Raycaster(item.position, new THREE.Vector3(0, -1, 0), 0, 10);
                let intersects = downRay.intersectObjects(walkableMeshes);
                let tgY = cf * TILE + 1.5; if (intersects.length > 0) tgY = intersects[0].point.y + 1.5;
                if (item.position.y > tgY + 0.01) { item.position.y = Math.max(tgY, item.position.y - 15 * dt); }
                else { item.position.y = tgY; if (!moving) item.userData.settled = true; }
            });

            executeGroundCombinationsLogic();
            huntLureTick(dt);

            if (gState.timeStop > 0) return;

            let hasOath = gState.inv.some(i => i && i.n === '永恒誓言');

            // AI 队友打死的怪等这一圈走完再从 entities 里拿掉：边遍历边 splice 会跳过下一个怪这一帧的更新
            let aiKillTargets = [];
            entities.forEach(function (entity) {
                if (aiKillTargets.indexOf(entity) >= 0) return;   // 这一帧已经被打死了
                let meta = entity.userData;
                if (HUNT_MOB_INTRO[meta.type] && Math.abs(entity.position.y - camera.position.y) < TILE * 0.6 && entity.position.distanceTo(camera.position) < 45)
                    introOnce('hunt.mob.' + meta.type, meta.name || '怪物', HUNT_MOB_INTRO[meta.type]);
                if (meta.type === 'ai') {
                    if (!meta.isRealPlayer) {
                        let anchor = playerAnchor();
                        let dToPlayer = entity.position.distanceTo(anchor);
                        // 你倒地了就先来救你；否则自己去搜刮；实在没箱子可开才回来跟着你
                        let looting = false;
                        if (!gState.isDead && !gState.hasLeft) looting = huntAiLootTick(entity, dt);
                        else { meta.chest = null; meta.openTimer = 0; }
                        let wantsToApproach = gState.isDead ? (meta.hasRev && !gState.hasLeft && dToPlayer > 6) : (!looting && dToPlayer > 10);
                        if (wantsToApproach) { let track = anchor.clone().sub(entity.position).normalize(); moveWithCollision(entity, track.x * 24 * dt, track.z * 24 * dt); }
                        if (gState.isDead && !gState.hasLeft && meta.hasRev) aiSay(meta, huntAiDispName(meta), 'down', HUNT_LINES.down);
                        if (meta.atkCd > 0) meta.atkCd -= dt;
                        if (meta.atkCd <= 0 && meta.hasWep && !gState.isDead) {
                            let target = entities.find(function (e) { return (e.userData.type === 'fake' || e.userData.type === 'angel' || e.userData.type === 'puppet' || e.userData.type === 'high' || e.userData.type === 'splitter' || e.userData.type === 'curser') && e.position.distanceTo(entity.position) < 25; });
                            if (target) { target.userData.hp -= 5; meta.atkCd = 1.0; if (target.userData.hp <= 0 && aiKillTargets.indexOf(target) < 0) { scene.remove(target); aiKillTargets.push(target); } }
                        }

                        if (gState.isDead && !gState.hasLeft && meta.hasRev && dToPlayer < 12) {
                            meta.hasRev = false; gState.hp = 100; gState.isDead = false;
                            camera.position.copy(gState.deathPos || camera.position);
                            gState.spectating = null; gState.spectateIdx = -1; hideDeathUI();
                            bc.postMessage({ type: 'PLAYER_REVIVED', sender: gState.id, target: '*' });
                            gState.needsLock = true; updateHUD();
                            aiSay(meta, huntAiDispName(meta), 'revive', HUNT_LINES.revive);
                        }
                    }
                }
                else if (meta.type === 'angel') {
                    if (hasOath) return;
                    let dToPlayer = entity.position.distanceTo(camera.position);
                    let camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
                    let mobDir = entity.position.clone().sub(camera.position).normalize();
                    let isSeen = camDir.dot(mobDir) > 0.5 && dToPlayer < 150;

                    let lureA = huntLurePoint(entity);
                    if (!isSeen && !gState.isDead && (lureA || dToPlayer < 120)) {
                        let chase = (lureA || camera.position).clone().sub(entity.position).normalize(); moveWithCollision(entity, chase.x * meta.speed * dt, chase.z * meta.speed * dt);
                        if (dToPlayer < 7 && Math.abs(camera.position.y - entity.position.y) < 10) {
                            if (meta.atkCd === undefined) meta.atkCd = 0; if (meta.atkCd > 0) meta.atkCd -= dt;
                            if (meta.atkCd <= 0) { gState.hp -= meta.dmg; updateHUD(); meta.atkCd = 1.0; if (gState.hp <= 0) triggerAgentDeath(); }
                        }
                    }
                }
                else if (meta.type === 'curser') {
                    let dToPlayer = entity.position.distanceTo(camera.position);
                    let camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
                    let mobDir = entity.position.clone().sub(camera.position).normalize();
                    let isSeen = camDir.dot(mobDir) > 0.5 && dToPlayer < 100;

                    if (isSeen && (gState.hp < gState.maxHp || meta.attacked) && gState.debuff.cooldown <= 0) {
                        let dType = Math.floor(Math.random() * 3) + 1;
                        gState.debuff = { type: dType, timer: 20, cooldown: 40 };
                        if (dType === 3) gState.maxHp = 75; else gState.maxHp = 100;
                        if (gState.hp > effectiveMaxHp()) gState.hp = effectiveMaxHp();
                        updateHUD();

                        let msg = dType === 1 ? "地图被干扰！" : (dType === 2 ? "体力加速流失！" : "生命上限受损！");
                        let el = document.getElementById('debuff-msg'); el.innerText = msg; el.style.display = 'block';
                    }
                    let lureC = huntLurePoint(entity);
                    if (!gState.isDead && (lureC || dToPlayer < 120)) {
                        let chase = (lureC || camera.position).clone().sub(entity.position).normalize(); moveWithCollision(entity, chase.x * meta.speed * dt, chase.z * meta.speed * dt);
                    }
                }
                else if (meta.type === 'fake' || meta.type === 'puppet' || meta.type === 'high' || meta.type === 'splitter') {
                    let distToPlayer = entity.position.distanceTo(camera.position); let aiMovementPermit = !hasOath;
                    if (meta.type === 'puppet' && viewFrustum.containsPoint(entity.position)) aiMovementPermit = false;

                    let lureF = huntLurePoint(entity);
                    if (aiMovementPermit && !gState.isDead && (lureF || distToPlayer < 120)) {
                        let chase = (lureF || camera.position).clone().sub(entity.position).normalize(); moveWithCollision(entity, chase.x * meta.speed * dt, chase.z * meta.speed * dt);

                        let yRange = meta.type === 'high' ? 30 : 10;
                        if (distToPlayer < 7 && Math.abs(camera.position.y - entity.position.y) < yRange) {
                            if (meta.atkCd === undefined) meta.atkCd = 0; if (meta.atkCd > 0) meta.atkCd -= dt;
                            if (meta.atkCd <= 0) { gState.hp -= meta.dmg; updateHUD(); meta.atkCd = 1.0; moveWithCollision(entity, chase.x * -20, chase.z * -20); if (gState.hp <= 0) triggerAgentDeath(); }
                        }
                    }
                }

                if (meta.type !== 'ai' || !meta.isRealPlayer) {
                    let downRay = new THREE.Raycaster(entity.position, new THREE.Vector3(0, -1, 0), 0, 10);
                    let intersects = downRay.intersectObjects(walkableMeshes);
                    let eFloor = Math.floor(entity.position.y / TILE);
                    let targetY = eFloor * TILE + 4.5;
                    if (intersects.length > 0) targetY = intersects[0].point.y + 4.5;
                    if (entity.position.y > targetY) entity.position.y -= 30 * dt; else entity.position.y = targetY;
                }
            });
            aiKillTargets.forEach(function (target) { let tIdx = entities.indexOf(target); if (tIdx > -1) entities.splice(tIdx, 1); });
        }

