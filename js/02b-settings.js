// 设置页和登记接口（任务 P3，作者 11-14：设置里能调所有东西）。放在 02-lobby.js 后面。
// 三件事：
//   1. 登记接口：settingsRegister 登记选项，keyRegister 登记按键。别的模式（猫盾工业归 Code2）在自己的文件里调，设置页自己画、自己存、自己读。说明在 docs/settings.md。
//   2. 按键改键：登记时带 legacy 的按键（通用的 WASD、空格、Shift、E 等）改键靠"翻译"：玩家按了新键，这里换成原来的键再发给老代码，老代码一行不用改。
//   3. 设置页：声音、操作、显示、游戏四组，换组不关窗。全部存在 TH_settings（SETTINGS 里的字段，跟着设备走），读不到就用默认。
// 文字规矩：不用括号，短句；按钮至少 40 像素；Esc 关（系统弹窗的"好了"）；改键时按 Esc 是取消。
const SETREG = { opts: [], keys: [] };
const KEY_RESERVED = ['escape'];
const KEY_NAMES = { ' ': '空格', shift: 'Shift', tab: 'Tab', enter: '回车', arrowup: '上', arrowdown: '下', arrowleft: '左', arrowright: '右', control: 'Ctrl', alt: 'Alt', backspace: '退格' };
function keyShow(k) { return KEY_NAMES[k] || (k && k.length === 1 ? k.toUpperCase() : (k || '')); }

// ── 选项登记 ──
// o: { group: '声音' | '操作' | '显示' | '游戏' | 自己起的名字, id, label, type: 'slider' | 'toggle' | 'choice', def, min, max, step, choices: [[值, 文字]], onChange(值) }
function settingsRegister(o) {
    if (!o || !o.id || !o.label) return false;
    if (SETREG.opts.some(function (x) { return x.id === o.id; })) return false;
    let t = o.type === 'toggle' || o.type === 'choice' ? o.type : 'slider';
    SETREG.opts.push({ group: o.group || '游戏', id: o.id, label: o.label, type: t, def: o.def, min: o.min === undefined ? 0 : o.min, max: o.max === undefined ? 1 : o.max, step: o.step || 0.05, choices: o.choices || [], onChange: o.onChange || null });
    if (o.onChange) { try { o.onChange(settingsGet(o.id)); } catch (e) { } }
    return true;
}
function settingsOpt(id) { return SETREG.opts.filter(function (x) { return x.id === id; })[0] || null; }
function settingsGet(id) {
    let o = settingsOpt(id), v = SETTINGS.reg ? SETTINGS.reg[id] : undefined;
    return v === undefined ? (o ? o.def : undefined) : v;
}
function settingsSet(id, v) {
    let o = settingsOpt(id); if (!o) return false;
    if (o.type === 'slider') { v = +v; if (!isFinite(v)) return false; v = Math.max(o.min, Math.min(o.max, v)); }
    else if (o.type === 'toggle') v = !!v;
    else if (!o.choices.some(function (c) { return c[0] === v; })) return false;
    if (!SETTINGS.reg || typeof SETTINGS.reg !== 'object') SETTINGS.reg = {};
    SETTINGS.reg[id] = v; settingsSave();
    if (o.onChange) { try { o.onChange(v); } catch (e) { } }
    return true;
}

// ── 按键登记 ──
// keyRegister(mode, action, defKey, label, fn, opts)：mode 是模式名，通用的用 'all'；defKey 是 e.key 小写，比如 'e'、' '、'shift'。
// fn：玩家按了这个动作现在的键就调 fn(e)（不在打字、不是连发、opts.active 返回真或没写）。老代码自己读键的，不用 fn，用 opts.legacy 让这里翻译。
function keyRegister(mode, action, defKey, label, fn, opts) {
    if (!mode || !action || !defKey) return false;
    if (SETREG.keys.some(function (x) { return x.mode === mode && x.action === action; })) return false;
    SETREG.keys.push({ mode: mode, action: action, def: String(defKey).toLowerCase(), label: label || action, fn: fn || null, legacy: !!(opts && opts.legacy), active: (opts && opts.active) || null });
    keyRebuild();
    return true;
}
function keyEntry(mode, action) { return SETREG.keys.filter(function (x) { return x.mode === mode && x.action === action; })[0] || null; }
function keyOf(mode, action) {
    let k = keyEntry(mode, action); if (!k) return null;
    let v = SETTINGS.keymap && SETTINGS.keymap[mode + ':' + action];
    return typeof v === 'string' && v ? v : k.def;
}
function keyIs(e, mode, action) { return !!e && !!e.key && e.key.toLowerCase() === keyOf(mode, action); }
// 改键。返回 { ok, why }。同一个模式里两个动作不能用同一个键，Esc 不能改
function keyBind(mode, action, key) {
    let k = keyEntry(mode, action); if (!k) return { ok: false, why: '没有这个动作' };
    key = String(key || '').toLowerCase();
    if (!key || KEY_RESERVED.indexOf(key) >= 0) return { ok: false, why: key === 'escape' ? 'Esc 不能改' : '没按到键' };
    let clash = SETREG.keys.filter(function (x) { return x.mode === mode && x.action !== action && keyOf(x.mode, x.action) === key; })[0];
    if (clash) return { ok: false, why: keyShow(key) + ' 已经用在「' + clash.label + '」上' };
    if (!SETTINGS.keymap || typeof SETTINGS.keymap !== 'object') SETTINGS.keymap = {};
    if (key === k.def) delete SETTINGS.keymap[mode + ':' + action]; else SETTINGS.keymap[mode + ':' + action] = key;
    settingsSave(); keyRebuild();
    return { ok: true };
}
function keyReset(mode, action) { if (SETTINGS.keymap) { delete SETTINGS.keymap[mode + ':' + action]; settingsSave(); keyRebuild(); } }
function keyResetAll() { SETTINGS.keymap = {}; settingsSave(); keyRebuild(); }

// ── 翻译：玩家按的新键换成老代码认的原键 ──
let KEYTR = { map: {}, block: {} };
function keyRebuild() {
    let map = {}, block = {}, used = {};
    SETREG.keys.forEach(function (x) { if (x.legacy) used[keyOf(x.mode, x.action)] = 1; });
    SETREG.keys.forEach(function (x) {
        if (!x.legacy) return;
        let cur = keyOf(x.mode, x.action);
        if (cur !== x.def) { map[cur] = x.def; if (!used[x.def]) block[x.def] = 1; }
    });
    KEYTR = { map: map, block: block };
}
const KEY_CODES = { ' ': ['Space', 32], shift: ['ShiftLeft', 16], tab: ['Tab', 9], enter: ['Enter', 13], arrowup: ['ArrowUp', 38], arrowdown: ['ArrowDown', 40], arrowleft: ['ArrowLeft', 37], arrowright: ['ArrowRight', 39] };
function keyCodeOf(k) {
    if (KEY_CODES[k]) return KEY_CODES[k];
    if (/^[a-z]$/.test(k)) return ['Key' + k.toUpperCase(), k.toUpperCase().charCodeAt(0)];
    if (/^[0-9]$/.test(k)) return ['Digit' + k, k.charCodeAt(0)];
    return ['', 0];
}
(function () {
    ['keydown', 'keyup'].forEach(function (type) {
        window.addEventListener(type, function (e) {
            if (e.__remap || window.__keyCapture || !e.key) return;
            let t = e.target && e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (typeof chatMode !== 'undefined' && chatMode === 2)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            let k = e.key.toLowerCase();
            let d = KEYTR.map[k];
            if (d !== undefined) {
                e.stopImmediatePropagation(); e.preventDefault();
                let c = keyCodeOf(d), ne;
                try { ne = new KeyboardEvent(type, { key: d === ' ' ? ' ' : (d.length === 1 ? d : d.charAt(0).toUpperCase() + d.slice(1)), code: c[0], keyCode: c[1], which: c[1], repeat: e.repeat, shiftKey: e.shiftKey, bubbles: true, cancelable: true }); } catch (x) { return; }
                ne.__remap = true;
                (e.target && e.target.dispatchEvent ? e.target : document.body).dispatchEvent(ne);
            } else if (KEYTR.block[k]) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
    });
    // 登记时带了 fn 的按键：按了就调（连发不算）
    window.addEventListener('keydown', function (e) {
        if (e.repeat || !e.key || e.ctrlKey || e.metaKey || e.altKey || window.__keyCapture) return;
        let t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (typeof chatMode !== 'undefined' && chatMode === 2)) return;
        let k = e.key.toLowerCase();
        SETREG.keys.forEach(function (x) {
            if (!x.fn || keyOf(x.mode, x.action) !== k) return;
            try { if (x.active && !x.active()) return; x.fn(e); } catch (er) { }
        });
    }, true);
})();

// 通用按键：老代码写死的 WASD 之类，登记成 legacy，设置页里能改
[['move_f', 'w', '前进'], ['move_b', 's', '后退'], ['move_l', 'a', '左移'], ['move_r', 'd', '右移'], ['jump', ' ', '跳，动作'], ['run', 'shift', '跑'],
['bag', 'e', '背包'], ['map', 'tab', '大地图'], ['throw', 'q', '扔东西'], ['skill', 'r', '角色技能'], ['lamp', 'l', '开关灯，化学寻宝队'], ['mute', 'm', '静音'], ['chat', 'enter', '聊天']].forEach(function (a) {
    keyRegister('all', a[0], a[1], a[2], null, { legacy: true });
});

// ── 设置页 ──
const SET_TABS = ['声音', '操作', '显示', '游戏'];
let setTab = '声音', setCaptureFor = null, setMsg = '';
function setBtnStyle(on) { return 'margin:0; padding:8px 12px; min-height:40px; min-width:40px; font-size:13px; border:none; border-radius:6px; background:' + (on ? '#5cb85c' : '#eceff1') + '; color:' + (on ? '#fff' : '#555') + '; cursor:pointer;'; }
function setRow(label, ctrl) {
    return '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid #eee; min-height:44px;">' +
        '<span style="font-size:14px; color:#444;">' + label + '</span>' + ctrl + '</div>';
}
function setToggle(id, on, a, b) {
    return '<span style="display:flex; gap:4px;"><button id="' + id + '-on" onclick="setToggleSet(\'' + id + '\', true)" style="' + setBtnStyle(on) + '">' + a + '</button><button id="' + id + '-off" onclick="setToggleSet(\'' + id + '\', false)" style="' + setBtnStyle(!on) + '">' + b + '</button></span>';
}
function setSlider(id, v, min, max, step, shown) {
    return '<span style="display:flex; align-items:center; gap:6px;"><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" style="width:120px; height:30px;" oninput="setSliderSet(\'' + id + '\', this.value)" onchange="setSliderDone(\'' + id + '\')">' +
        '<span id="' + id + '-val" style="font-size:12px; color:#666; min-width:34px; text-align:right;">' + shown + '</span></span>';
}
// 内置选项：id 对应 SETTINGS 里的字段
const SET_BUILTIN = {
    'set-volMaster': { key: 'volMaster', min: 0, max: 100, step: 5, scale: 100 }, 'set-volMusic': { key: 'volMusic', min: 0, max: 100, step: 5, scale: 100 },
    'set-volSfx': { key: 'volSfx', min: 0, max: 100, step: 5, scale: 100 }, 'set-volVoice': { key: 'volVoice', min: 0, max: 100, step: 5, scale: 100 },
    'set-sens': { key: 'sens', min: 0.3, max: 2.5, step: 0.05, scale: 1 }, 'set-sensV': { key: 'sensV', min: 0.3, max: 2.5, step: 0.05, scale: 1 },
    'set-padScale': { key: 'padScale', min: 0.8, max: 1.6, step: 0.05, scale: 1 }, 'set-padAlpha': { key: 'padAlpha', min: 0.3, max: 1, step: 0.05, scale: 1 }
};
const SET_TOGGLES = { 'set-touch': 'touch', 'set-inv': 'invertY', 'set-hq': 'hq', 'set-muteBg': 'muteBg', 'set-autoLock': 'autoLock', 'set-tips': 'tips' };
function setBuiltinVal(id) {
    let b = SET_BUILTIN[id], v = SETTINGS[b.key];
    if (v === undefined || v === null || !isFinite(+v)) v = b.key === 'padScale' || b.key === 'padAlpha' || b.key === 'sensV' || b.key === 'sens' ? 1 : 1;
    return b.scale === 100 ? Math.round(audioClamp(v) * 100) : +v;
}
function setBuiltinRow(label, id) {
    let b = SET_BUILTIN[id], v = setBuiltinVal(id);
    return setRow(label, setSlider(id, v, b.min, b.max, b.step, b.scale === 100 ? v : v.toFixed(2)));
}
function setSliderSet(id, v) {
    let b = SET_BUILTIN[id], shown;
    if (b) {
        let n = +v; if (!isFinite(n)) return;
        SETTINGS[b.key] = b.scale === 100 ? audioClamp(n / 100) : n;
        if (b.key === 'sens') gState.mouseSensitivity = SETTINGS.sens;
        if (b.scale === 100) audioApply(); else settingsApply();
        shown = b.scale === 100 ? Math.round(SETTINGS[b.key] * 100) : (+SETTINGS[b.key]).toFixed(2);
    } else if (id.indexOf('set-reg-') === 0) {
        let rid = id.slice(8); if (!settingsSet(rid, v)) return;
        shown = (+settingsGet(rid)).toFixed(2).replace(/\.?0+$/, '');
    } else return;
    let el = document.getElementById(id + '-val'); if (el) el.innerText = shown;
}
function setSliderDone(id) {
    let b = SET_BUILTIN[id]; if (!b) return;
    settingsSave();
    if (id === 'set-volSfx' || id === 'set-volMaster') sfxPlay([659, 880], 0.2, 0.06, 'triangle');
}
function setToggleSet(id, on) {
    if (id.indexOf('set-reg-') === 0) settingsSet(id.slice(8), on);
    else if (SET_TOGGLES[id]) { SETTINGS[SET_TOGGLES[id]] = on; settingsSave(); settingsApply(); audioApply(); }
    else if (id === 'set-mute') { if (audioMuted() !== on) audioMuteToggle(); }
    else return;
    let a = document.getElementById(id + '-on'), b = document.getElementById(id + '-off');
    if (a && b) { a.setAttribute('style', setBtnStyle(on)); b.setAttribute('style', setBtnStyle(!on)); }
}
function setChoiceSet(rid, i) {
    let o = settingsOpt(rid); if (!o || !o.choices[i]) return;
    settingsSet(rid, o.choices[i][0]); setRender();
}
function setRegRows(group) {
    return SETREG.opts.filter(function (o) { return o.group === group; }).map(function (o) {
        let v = settingsGet(o.id), id = 'set-reg-' + o.id;
        if (o.type === 'toggle') return setRow(o.label, setToggle(id, !!v, '开', '关'));
        if (o.type === 'choice') return setRow(o.label, '<span style="display:flex; gap:4px; flex-wrap:wrap;">' + o.choices.map(function (c, i) { return '<button onclick="setChoiceSet(\'' + o.id + '\', ' + i + ')" style="' + setBtnStyle(c[0] === v) + '">' + c[1] + '</button>'; }).join('') + '</span>');
        return setRow(o.label, setSlider(id, v, o.min, o.max, o.step, (+v).toFixed(2).replace(/\.?0+$/, '')));
    }).join('');
}
function setKeyRows() {
    let modes = []; SETREG.keys.forEach(function (x) { if (modes.indexOf(x.mode) < 0) modes.push(x.mode); });
    return modes.map(function (m) {
        let rows = SETREG.keys.filter(function (x) { return x.mode === m; }).map(function (x) {
            let cur = keyOf(x.mode, x.action), cap = setCaptureFor && setCaptureFor.mode === x.mode && setCaptureFor.action === x.action;
            let ch = cur !== x.def;
            return setRow(x.label, '<span style="display:flex; gap:4px; align-items:center;"><button id="set-key-' + x.mode + '-' + x.action + '" onclick="setKeyStart(\'' + x.mode + '\', \'' + x.action + '\')" style="' + setBtnStyle(cap) + ' min-width:84px;">' + (cap ? '按新键' : keyShow(cur)) + '</button>' +
                (ch ? '<button onclick="setKeyReset(\'' + x.mode + '\', \'' + x.action + '\')" style="' + setBtnStyle(false) + '">默认</button>' : '') + '</span>');
        }).join('');
        return '<div style="font-size:12px; color:#888; padding:8px 0 2px;">按键，' + (m === 'all' ? '通用' : m) + '</div>' + rows;
    }).join('') + '<div style="padding:8px 0;"><button onclick="setKeyResetAll()" style="' + setBtnStyle(false) + '">全部恢复默认</button></div>';
}
function setKeyStart(mode, action) {
    setCaptureFor = { mode: mode, action: action }; window.__keyCapture = true; setMsg = '按一下新键，Esc 取消';
    window.addEventListener('keydown', setKeyCapture, true);
    setRender();
}
function setKeyEnd() { window.removeEventListener('keydown', setKeyCapture, true); window.__keyCapture = false; setCaptureFor = null; }
function setKeyCapture(e) {
    if (!setCaptureFor) { setKeyEnd(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    let k = (e.key || '').toLowerCase();
    if (k === 'escape') { setKeyEnd(); setMsg = '没改'; setRender(); return; }
    if (['control', 'alt', 'meta', 'capslock', 'os'].indexOf(k) >= 0) return;
    let r = keyBind(setCaptureFor.mode, setCaptureFor.action, k);
    setKeyEnd(); setMsg = r.ok ? '改好了' : r.why; setRender();
}
function setKeyReset(mode, action) { keyReset(mode, action); setMsg = '恢复了'; setRender(); }
function setKeyResetAll() { keyResetAll(); setMsg = '全部恢复了'; setRender(); }

function setTabHtml(t) {
    let touchOn = gState.control === 'pad';
    if (t === '声音') {
        return setBuiltinRow('总音量', 'set-volMaster') + setBuiltinRow('音乐', 'set-volMusic') + setBuiltinRow('音效', 'set-volSfx') + setBuiltinRow('语音，别人说话', 'set-volVoice') +
            setRow('静音', setToggle('set-mute', audioMuted(), '静音', '有声')) + setRow('切走窗口时静音', setToggle('set-muteBg', !!SETTINGS.muteBg, '开', '关')) +
            '<div style="font-size:12px; color:#888; padding:4px 0 6px;">' + kTxt('按 <b>' + keyShow(keyOf('all', 'mute')) + '</b> 一键静音，再按恢复。', '电脑上按键盘能一键静音。') + '</div>' + setRegRows('声音');
    }
    if (t === '操作') {
        return setBuiltinRow('转视角快慢，左右', 'set-sens') + setBuiltinRow('转视角快慢，上下', 'set-sensV') + setRow('上下视角反转', setToggle('set-inv', !!SETTINGS.invertY, '开', '关')) +
            setRow('触屏按键', setToggle('set-touch', touchOn, '显示', '隐藏')) + setBuiltinRow('触屏按钮大小', 'set-padScale') + setBuiltinRow('触屏按钮透明度', 'set-padAlpha') + setRegRows('操作') + setKeyRows();
    }
    if (t === '显示') {
        return setRow('画面', setToggle('set-hq', !!SETTINGS.hq, '清晰', '流畅')) + setRegRows('显示');
    }
    return setRow('新手提示', setToggle('set-tips', SETTINGS.tips !== false, '开', '关')) + setRow('关面板后自动锁鼠标', setToggle('set-autoLock', SETTINGS.autoLock !== false, '开', '关')) +
        setRow('新手教程', '<button onclick="tutorialStart()" style="' + setBtnStyle(false) + '">重玩一遍</button>') + setRow('快捷语', '<button onclick="openChatSetup()" style="' + setBtnStyle(false) + '">改一下</button>') + setRegRows('游戏');
}
function setGroups() {
    let g = SET_TABS.slice(); SETREG.opts.forEach(function (o) { if (g.indexOf(o.group) < 0) g.push(o.group); });
    return g;
}
function setRender() {
    let el = document.getElementById('set-content'); if (!el) return;
    let tabs = document.getElementById('set-tabs');
    if (tabs) tabs.innerHTML = setGroups().map(function (t) { return '<button id="set-tab-' + t + '" onclick="setTabGo(\'' + t + '\')" style="' + setBtnStyle(t === setTab) + ' flex:1;">' + t + '</button>'; }).join('');
    el.innerHTML = (setMsg ? '<div id="set-msg" style="font-size:12px; color:#d9534f; padding:4px 0;">' + setMsg + '</div>' : '') + (setGroups().indexOf(setTab) < SET_TABS.length ? setTabHtml(setTab) : setRegRows(setTab));
}
function setTabGo(t) { setKeyEnd(); setMsg = ''; setTab = t; setRender(); }
function openSettings(tab) {
    setKeyEnd(); setMsg = ''; setTab = tab && setGroups().indexOf(tab) >= 0 ? tab : setTab;
    showSysModal('设置', '<div style="text-align:left; min-width:270px; max-width:92vw;"><div id="set-tabs" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px;"></div><div id="set-content" style="max-height:60vh; overflow-y:auto;"></div></div>', [{ label: '好了', color: '#5cb85c' }]);
    setRender();
    let mo = document.getElementById('sys-modal');
    if (mo && !mo.__setObs && window.MutationObserver) { mo.__setObs = new MutationObserver(function () { if (mo.classList.contains('hidden')) setKeyEnd(); }); mo.__setObs.observe(mo, { attributes: true, attributeFilter: ['class'] }); }
}
keyRebuild();
