// ── 存档导出、导入（换设备用）──
// 存档只在各自浏览器里。导出：把这个号的存档打成一个文件，换到别的设备导入，用同一个名字进游戏就是原来的号。
// 猫盾工业等别的存档用 saveportRegister(名字, { out: function () { return 要存的东西，可以是 Promise; }, inn: function (东西) { 写回去，可以是 Promise; } }) 接进来。
// 文件格式：{ app: 'maodun', v: 1, id: 名字, t: 时间, main: 主存档文本, ext: { 名字: 东西 } }。说明在 docs/settings.md。
const SAVEPORT = { ext: [], busy: false };

function saveportRegister(name, o) {
    if (!name || !o || typeof o.out !== 'function' || typeof o.inn !== 'function') return false;
    if (SAVEPORT.ext.some(function (x) { return x.name === name; })) return false;
    SAVEPORT.ext.push({ name: name, out: o.out, inn: o.inn });
    return true;
}

function saveportName() { return dispNameBase(gState.id || ''); }

// 打包：返回 Promise，给字符串
function saveportBuild() {
    if (!gState.id) return Promise.reject(new Error('还没进游戏'));
    if (!gState.tutorial) saveProgress();
    let main = null; try { main = localStorage.getItem('TH_save_' + gState.id); } catch (e) { }
    if (!main) return Promise.reject(new Error('这个号还没有存档'));
    let box = { app: 'maodun', v: 1, id: saveportName(), t: Date.now(), main: main, ext: {} };
    return Promise.all(SAVEPORT.ext.map(function (x) {
        return Promise.resolve().then(function () { return x.out(); }).then(function (d) { if (d !== undefined && d !== null) box.ext[x.name] = d; }, function () { });
    })).then(function () { return JSON.stringify(box); });
}

// 检查一段文字是不是存档，返回 { ok, why, box }
function saveportParse(text) {
    let box; try { box = JSON.parse(String(text || '').trim()); } catch (e) { return { ok: false, why: '这不是猫盾存档' }; }
    if (!box || box.app !== 'maodun' || typeof box.main !== 'string' || typeof box.id !== 'string' || !box.id) return { ok: false, why: '这不是猫盾存档' };
    let d; try { d = JSON.parse(box.main); } catch (e) { return { ok: false, why: '存档坏了' }; }
    if (!d || d.ver !== SAVE_VER) return { ok: false, why: '存档版本对不上，换新版导出再试' };
    if (/[<>&"']/.test(box.id) || box.id.length > 24) return { ok: false, why: '名字不对' };
    return { ok: true, box: box };
}

// 写进这台设备：覆盖同名的，再按名字重新进游戏。返回 Promise
function saveportApply(box) {
    let key = 'TH_save_' + box.id;
    try { localStorage.setItem(key, box.main); } catch (e) { return Promise.reject(new Error('存不进去，浏览器没空间了')); }
    return Promise.all(SAVEPORT.ext.map(function (x) {
        if (!box.ext || box.ext[x.name] === undefined) return null;
        return Promise.resolve().then(function () { return x.inn(box.ext[x.name]); }).catch(function () { });
    }));
}

function saveportHave(name) { try { return !!localStorage.getItem('TH_save_' + name); } catch (e) { return false; } }

function saveportDone(name) {
    // 当前号在内存里还有一份，不刷新的话下次存档会盖掉刚导入的，所以直接刷新
    window.__saveportReload = true;
    showSysModal('导入好了', '存档放进这台设备了。马上刷新，刷新后用名字「' + name + '」进游戏，就是原来的号。', [{ label: '刷新', color: '#4caf50', onClick: function () { location.reload(); } }]);
    setTimeout(function () { location.reload(); }, 2500);
}

function saveportImportText(text) {
    let r = saveportParse(text);
    if (!r.ok) { showSysModal('导入不了', r.why, [{ label: '知道了' }]); return; }
    let box = r.box, go = function () {
        saveportApply(box).then(function () { saveportDone(box.id); }, function (e) { showSysModal('导入不了', e && e.message || '出错了', [{ label: '知道了' }]); });
    };
    if (saveportHave(box.id)) {
        showSysModal('覆盖这个号', '这台设备上已经有「' + box.id + '」的存档，导入会把它换掉，换了就回不来。', [{ label: '覆盖', color: '#d9534f', onClick: go }, { label: '取消' }]);
    } else go();
}

function saveportExportFile() {
    saveportBuild().then(function (txt) {
        let name = '猫盾存档-' + saveportName() + '.json';
        try {
            let a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name;
            document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 3000);
        } catch (e) { }
        saveportMsg('导出了，文件名 ' + name);
    }, function (e) { saveportMsg(e && e.message || '导出不了'); });
}

function saveportExportCopy() {
    saveportBuild().then(function (txt) {
        let ok = function () { saveportMsg('复制了，到另一台设备点粘贴导入'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { saveportShowText(txt); });
        else saveportShowText(txt);
    }, function (e) { saveportMsg(e && e.message || '导出不了'); });
}

function saveportShowText(txt) {
    showSysModal('存档文字', '<textarea id="saveport-text" readonly style="width:min(86vw,360px); height:120px; font-size:12px;">' + txt.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea><div style="font-size:12px; color:#888; padding-top:4px;">全选复制，带到另一台设备粘贴导入</div>', [{ label: '关上' }]);
    setTimeout(function () { let t = document.getElementById('saveport-text'); if (t) { t.focus(); t.select(); } }, 50);
}

function saveportPickFile() {
    let f = document.getElementById('saveport-file');
    if (!f) { f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json,text/plain'; f.id = 'saveport-file'; f.style.display = 'none'; document.body.appendChild(f); }
    f.value = ''; f.onchange = function () {
        let file = f.files && f.files[0]; if (!file) return;
        let rd = new FileReader(); rd.onload = function () { saveportImportText(String(rd.result || '')); }; rd.onerror = function () { saveportMsg('读不了这个文件'); }; rd.readAsText(file);
    };
    f.click();
}

function saveportPasteBox() {
    showSysModal('粘贴导入', '<textarea id="saveport-in" placeholder="把复制的存档文字粘贴到这里" style="width:min(86vw,360px); height:120px; font-size:12px;"></textarea>', [
        { label: '导入', color: '#4caf50', onClick: function () { let t = document.getElementById('saveport-in'); saveportImportText(t ? t.value : ''); } }, { label: '取消' }]);
    setTimeout(function () { let t = document.getElementById('saveport-in'); if (t) t.focus(); }, 50);
}

function saveportMsg(s) { let e = document.getElementById('saveport-msg'); if (e) e.innerText = s; }

// 设置页「游戏」组里的一块
function saveportHtml() {
    let b = function (label, fn) { return '<button onclick="' + fn + '" style="' + setBtnStyle(false) + '">' + label + '</button>'; };
    return '<div style="font-size:12px; color:#888; padding:8px 0 2px;">存档，换设备用</div>' +
        '<div style="font-size:12px; color:#888; padding:0 0 6px;">导出这个号的存档，到另一台设备导入，再用同一个名字进游戏。</div>' +
        '<div style="display:flex; flex-wrap:wrap; gap:6px; padding:0 0 4px;">' + b('导出文件', 'saveportExportFile()') + b('复制存档文字', 'saveportExportCopy()') + b('导入文件', 'saveportPickFile()') + b('粘贴导入', 'saveportPasteBox()') + '</div>' +
        '<div id="saveport-msg" style="font-size:12px; color:#4caf50; padding:2px 0;"></div>';
}
