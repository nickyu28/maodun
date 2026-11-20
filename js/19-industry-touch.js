// 猫盾工业：触屏补充（作者 11-20：触屏只有点击和按钮）。放在 19-industry-launch.js 后面。
// 1 右键按钮的字按准星指着的东西现算现写（两到四个字），没有右键动作可做就藏起来。
// 2 面板、弹窗右上角的叉，点一下等于 Esc（猫盾工业里 Esc 一次关掉所有窗口，叉也一样）。
// 3 快捷栏旁边的背包按钮，等于按 E。
        const IND_X_STYLE = 'position:absolute;right:8px;top:6px;width:36px;height:36px;border:none;border-radius:50%;background:#e0e0e0;color:#333;font-size:24px;line-height:30px;padding:0;cursor:pointer;z-index:5;';
        function indCrossBtn(js) { return '<button class="ind-x" style="' + IND_X_STYLE + '" onpointerdown="event.stopPropagation()" onclick="' + js + '" aria-label="关上">×</button>'; }
        // 面板里的叉：粘在面板右上角，面板滚动也在
        function indPanelCross() { return '<div class="ind-x-wrap" style="position:sticky;top:0;float:right;height:0;z-index:5;overflow:visible;"><button class="ind-x" style="position:absolute;right:0;top:0;width:36px;height:36px;border:none;border-radius:50%;background:#e0e0e0;color:#333;font-size:24px;line-height:30px;padding:0;cursor:pointer;" onpointerdown="event.stopPropagation()" onclick="indCloseAll()" aria-label="关上">×</button></div>'; }
        // 右键现在会做什么：返回两到四个字，没有就返回空
        function indRightLabel() {
            let R = ind; if (!R || R.over || R.dead || R.paused || R.panel) return '';
            let k = indSel(), a = null; try { a = indAim(); } catch (e) { }
            let it = k && IND_ITEMS[k], hard = indHard(), tree = a && a.kind === 'node' && a.o.tree;
            if (tree === 'palm') return '摇椰子';
            if (tree === 'pine') return '割松脂';
            if (tree === 'rubber') return '割胶';
            if (a && a.kind === 'animal') { if (k && fmIsTool(k)) return '宰杀'; if (k && it.eat) return '喂食'; return '叫一声'; }
            if (a && a.kind === 'dev' && a.o.ty === 'crank' && !(it && it.dev)) return '摇手柄';
            if (a && a.kind === 'dev' && !(it && it.dev) && k) return '拿起设备';
            if (!k) { if (a && a.kind === 'dev') return '拿起设备'; if (R.where === 'base' && a && a.kind === 'pool') return '喝水'; return ''; }
            if (it.veh) return R.ride ? '下车' : '上车';
            if (k === 'fan' || k === 'hand_fan') return '扇风';
            if (k === 'torch') return '点火把';
            if (k === 'cactus') return '拔刺';
            if (k === 'fishing_rod') return '钓鱼';
            if (k === 'fish_net') return '撒网';
            if (k === 'campfire') return '放篝火';
            if (k === 'wood_dry' && hard) return '钻木取火';
            if (k === 'tnt') return '放炸药';
            if (k === 'gunpowder' && a && a.kind === 'node' && a.o.hard) return '点引线';
            if (k === 'cyl' && a && a.kind === 'node' && a.o.key === 'vent_ng') return '装天然气';
            if (it.potion) return '喝药';
            if (it.dev) return '放设备';
            if (it.furn) return '放炉子';
            if (it.house) return '盖房子';
            if (it.raft) return '放木筏';
            if (it.cook) return '放炉灶';
            if (it.nuke) return '放炸弹';
            if (it.attach) return '装上去';
            if (k === 'dirt') return '铺地';
            if (typeof IND_FERTS !== 'undefined' && IND_FERTS[k] && a && a.kind === 'crop') return '施肥';
            if (indIsEmptyCont(k)) {
                if (a && a.kind === 'node' && a.o.key === 'oil') return '装油';
                if ((a && a.kind === 'pool') || indAtWater()) return '装水';
                return '';
            }
            let kc = indContOf(k), kb = kc && kc.base;
            if (kb === 'oil') return '倒油';
            if ((kb === 'water_raw' || kb === 'water_boiled' || kb === 'water_sea') && a && a.kind === 'spout') return '浇凉';
            if ((kb === 'water_raw' || kb === 'water_boiled') && a && a.kind === 'crop') return '浇水';
            if (kb === 'water_raw' && !a && Object.keys(R.bag).some(function (x) { return IND_ITEMS[x] && IND_ITEMS[x].hot && R.bag[x] > 0; })) return '浇凉';
            if (k === 'dry_ice') return '做冰';
            if (it.hot) return (a && a.kind === 'pool') || indAtWater() ? '放凉' : '';
            if (it.eat) return it.eat.w >= (it.eat.f || 0) && it.eat.w > 0 ? '喝水' : '吃东西';
            if (it.wear) return '穿上';
            if (tlKind(k) === 'knife' && (R.bag.clay || 0) >= 2) return '雕模具';
            if (k === 'lighter') return '装燃料';
            return '';
        }
        // 每 0.2 秒刷一次：右键按钮的字、能不能用、背包按钮
        function indTouchHud() {
            let b = document.getElementById('ind-btn-use'); if (!b) return;
            let t = ''; try { t = indRightLabel(); } catch (e) { }
            if (b.getAttribute('data-t') !== t) { b.setAttribute('data-t', t); b.textContent = t; b.style.display = t ? '' : 'none'; }
        }
