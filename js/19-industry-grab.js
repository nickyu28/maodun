// 猫盾工业和实验室：测试用的"自取材料"面板（作者 11-19）。Shift+T 开关，不用先去采就能往背包里放东西，方便测。
// 设置页"游戏"组里有个开关"测试用自取材料"，默认关；面板只在开关打开、或网址带 ?hcdebug=1（工业）／?labdebug=1（实验室）时才开，没开时 Shift+T 什么也不做。
// 放进去的东西就是正常物品，能放箱子、能做配方，不影响存档和通关。Esc 关。放在 19-industry-cond.js 后面。
        settingsRegister({ group: '游戏', id: 'dev_grab', label: '测试用自取材料', type: 'toggle', def: false });
        function grabSwitch() { try { return settingsGet('dev_grab') === true; } catch (e) { return false; } }
        function grabOnInd() { return grabSwitch() || (typeof indDebugRead === 'function' && indDebugRead()); }
        function grabOnLab() { return grabSwitch() || (typeof labDebugOn === 'function' && labDebugOn()); }
        function grabItems(q, isLab) {
            let L = [];
            if (isLab) {
                Object.keys(LAB_FIXED).forEach(function (k) { L.push(k); });
                Object.keys(LAB_STABLE).forEach(function (z) { L.push('a:' + z + ':' + LAB_STABLE[z][0]); });
            } else Object.keys(IND_ITEMS).forEach(function (k) { if (!/[:@]/.test(k) && !IND_ITEMS[k].later_hide) L.push(k); });
            let nm = function (k) { return isLab ? labName(k) : indName(k); };
            q = String(q || '').trim();
            return L.filter(function (k) { return !q || nm(k).indexOf(q) >= 0 || k.indexOf(q) >= 0; }).slice(0, 80).map(function (k) { return { k: k, name: nm(k) }; });
        }
        function grabRows(q, isLab) {
            let rows = grabItems(q, isLab).map(function (e, i) {
                let id = (isLab ? 'lab' : 'ind') + '-grab-n-' + i;
                return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #eee;"><span style="flex:1;min-width:0;">' + e.name + '</span>' +
                    '<input id="' + id + '" value="1" inputmode="numeric" maxlength="4" style="width:52px;padding:5px 4px;font-size:14px;border:1px solid #bbb;border-radius:6px;" onpointerdown="event.stopPropagation()">' +
                    '<button class="grab-give" style="margin:2px;padding:8px 12px;min-height:44px;border:none;border-radius:6px;background:#2e7d32;color:#fff;font-size:14px;cursor:pointer;" onclick="grabGive(\'' + e.k.replace(/'/g, '') + '\',\'' + id + '\',' + (isLab ? 'true' : 'false') + ')">放进背包</button></div>';
            }).join('');
            return rows || '<div style="color:#999;padding:6px 0;">没有找到</div>';
        }
        function grabGive(k, id, isLab) {
            let el = document.getElementById(id), n = el ? parseInt(String(el.value).trim(), 10) : 1;
            if (!(n > 0)) { (isLab ? labFlash : indFlash)('填个数字'); return false; }
            n = Math.min(n, 9999);
            if (isLab) { if (!lab) return false; labBagGive(k, n); lab.hudSig = ''; labFlash('放进背包：' + labName(k) + ' ×' + n); }
            else { if (!ind) return false; indGive(k, n); ind.hudSig = ''; indSave(); indFlash('放进背包：' + indName(k) + ' ×' + n); }
            return true;
        }
        function grabFilter(isLab) {
            let q = document.getElementById(isLab ? 'lab-grab-q' : 'ind-grab-q'), z = document.getElementById(isLab ? 'lab-grab-list' : 'ind-grab-list');
            if (z) z.innerHTML = grabRows(q ? q.value : '', isLab);
        }
        const GRAB_HEAD = function (isLab) { return '<div style="margin:4px 0;color:#666;">测试用：点哪个就往背包里放多少，默认 1。Shift+T 或 Esc 关。</div><input id="' + (isLab ? 'lab' : 'ind') + '-grab-q" placeholder="搜名字" oninput="grabFilter(' + isLab + ')" style="width:60%;padding:6px;font-size:15px;border:1px solid #bbb;border-radius:6px;margin-bottom:6px;"><div id="' + (isLab ? 'lab' : 'ind') + '-grab-list">' + grabRows('', isLab) + '</div>'; };
        function indPanelGrab() {
            if (!ind || !grabOnInd()) return false;
            if (ind.panel === 'grab') { indPanelClose(); return true; }
            if (ind.panel) return false;
            indPanelShow('grab', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">自取材料</div>' + GRAB_HEAD(false) + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
            return true;
        }
        function labPanelGrab() {
            if (!lab || !grabOnLab()) return false;
            if (lab.panel === 'grab') { labPanelClose(); return true; }
            if (lab.panel) return false;
            labPanelOpen('grab', '自取材料', GRAB_HEAD(true));
            return true;
        }
