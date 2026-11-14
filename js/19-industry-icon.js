// 物品小图标（任务 157）：canvas 现画，不用图片文件。按类别画形状，用物品自己的颜色上色，再加区分用的小标记（元素符号、内容物符号、名字首字）。
// indIcon(key, size) 返回 dataURL，按 key 和尺寸缓存；indIconImg(key, px) 返回 <img> 的 HTML。
        const IC_SYM = { cu: '铜', zn: '锌', sn: '锡', fe: '铁', ni: '镍', pb: '铅', al: '铝', u: '铀', ge: '锗', ga: '镓', li: '锂', si: '硅', ti: '钛', na: '钠', mg: '镁', bronze: '青', brass: '黄', steel: '钢' };   // 任务 157 补充：图标上写中文，不写化学式
        const IC_GAS = { h2: '氢', o2: '氧', n2: '氮', cl2: '氯', ar: '氩', co2: '碳', so2: '硫', hf: '氟', h2so4: '酸', hno3: '酸', freon: '冷', ne: '氖', kr: '氪' };
        let IC_TXT = {};
        const IC_TIER = { wood: '#a1887f', stone: '#9e9e9e', bronze: '#a0642d', iron: '#546e7a', steel: '#78909c', diamond: '#4fc3f7' };
        const IC_LIQ = { water_raw: '#42a5f5', water_sea: '#1e88e5', water_boiled: '#90caf9', milk: '#fafafa', oil: '#212121', tomato_soup: '#e53935', radish_soup: '#ef9a9a', cabbage_stew: '#aed581' };
        let IC_CACHE = {};
        function icHex(c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); }
        function icHash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
        function icZh(k) { let n = (IND_ITEMS[k] && IND_ITEMS[k].name) || '物', m = n.match(/[\u4e00-\u9fff]/); return m ? m[0] : '物'; }
        function icKind(k, d) {
            let base = k.split('@')[0], c = typeof indContOf === 'function' ? indContOf(k) : null;
            if (/^hot_/.test(k) || d.hot) return 'hot';
            if (/^ore_/.test(k)) return 'ore';
            if (/^ingot_/.test(k) || /^(steel|bronze|brass)$/.test(k)) return 'ingot';
            if (/^broken_/.test(k) || (typeof tlKind === 'function' && tlKind(k))) return 'tool';
            if (/^(tongs|hammer|shears)$/.test(k)) return 'tool';
            if (c || /^bucket/.test(k)) return 'bucket';
            if (d.cyl || /^cyl/.test(k)) return 'cyl';
            if (d.gas || /^b_/.test(k) || k === 'bottle') return 'bottle';
            if (k === 'jar') return 'bucket';
            if (d.dev || /^dev_/.test(k)) return 'dev';
            if (d.wear) return 'wear';
            if (d.seed || /^seed_/.test(k)) return 'seed';
            if (d.eat || /^(bread|meat|fish|cheese|bake|potato|tomato|wheat|corn|pumpkin|cabbage|radish)/.test(k)) return 'food';
            return 'other';
        }
        function icDraw(k, size) {
            let d = IND_ITEMS_RAW[k] || (IND_ITEMS[k] || {}), cv = document.createElement('canvas'); cv.width = cv.height = size;
            let g = cv.getContext('2d'), s = size, col = icHex(d.col || 0x888888), kind = icKind(k, d), t = s / 32;
            let rr = function (x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
            let txt = function (str, x, y, px, c) { g.font = 'bold ' + Math.max(7, Math.round(px * t)) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; IC_TXT[str] = 1; g.lineWidth = 2 * t; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(str, x, y); g.fillStyle = c || '#fff'; g.fillText(str, x, y); };
            g.lineJoin = 'round'; g.lineWidth = 1.5 * t; g.strokeStyle = '#263238';
            let suffix = k.replace(/^(ore|ingot|hot)_/, '').replace(/@.*/, '');
            if (kind === 'ore') {
                g.fillStyle = col; g.beginPath(); g.moveTo(4 * t, 22 * t); g.lineTo(8 * t, 9 * t); g.lineTo(17 * t, 5 * t); g.lineTo(27 * t, 11 * t); g.lineTo(28 * t, 23 * t); g.lineTo(16 * t, 28 * t); g.closePath(); g.fill(); g.stroke();
                g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 4; i++) { g.fillRect((8 + (icHash(k + i) % 14)) * t, (9 + (icHash(k + 'y' + i) % 12)) * t, 3 * t, 3 * t); }
                txt(IC_SYM[suffix] || icZh(k), 16 * t, 18 * t, 14);
            } else if (kind === 'ingot' || kind === 'hot') {
                g.fillStyle = col; g.beginPath(); g.moveTo(6 * t, 24 * t); g.lineTo(10 * t, 10 * t); g.lineTo(24 * t, 10 * t); g.lineTo(28 * t, 24 * t); g.closePath();
                if (kind === 'hot') { g.shadowColor = '#ff6d00'; g.shadowBlur = 6 * t; g.strokeStyle = '#ff6d00'; g.lineWidth = 2.5 * t; }
                g.fill(); g.stroke(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(11 * t, 11 * t, 12 * t, 3 * t);
                let sy = kind === 'hot' ? (d.hot || suffix).replace(/^ingot_/, '') : suffix; txt(IC_SYM[sy] || icZh(k), 17 * t, 19 * t, 13);
            } else if (kind === 'tool') {
                let bk = /^broken_/.test(k), kk = bk ? k.replace(/^broken_/, '') : k, tier = (typeof TL_TOOL !== 'undefined' && TL_TOOL[kk] && TL_TOOL[kk].tier) || (kk.split('_')[1] || 'stone'), hc = IC_TIER[tier] || col, kd = (typeof tlKind === 'function' && tlKind(kk)) || kk.split('_')[0];
                g.strokeStyle = '#4e342e'; g.lineWidth = 3 * t; g.beginPath(); g.moveTo(8 * t, 27 * t); g.lineTo(22 * t, 8 * t); g.stroke();
                g.fillStyle = hc; g.strokeStyle = '#263238'; g.lineWidth = 1.5 * t;
                if (kd === 'pick') { g.beginPath(); g.moveTo(10 * t, 9 * t); g.quadraticCurveTo(22 * t, 2 * t, 29 * t, 14 * t); g.lineTo(26 * t, 15 * t); g.quadraticCurveTo(21 * t, 8 * t, 13 * t, 12 * t); g.closePath(); g.fill(); g.stroke(); }
                else if (kd === 'axe') { g.beginPath(); g.moveTo(15 * t, 6 * t); g.lineTo(27 * t, 8 * t); g.lineTo(26 * t, 19 * t); g.lineTo(18 * t, 14 * t); g.closePath(); g.fill(); g.stroke(); }
                else if (kd === 'shovel') { g.beginPath(); g.moveTo(19 * t, 4 * t); g.lineTo(28 * t, 10 * t); g.lineTo(23 * t, 17 * t); g.lineTo(16 * t, 11 * t); g.closePath(); g.fill(); g.stroke(); }
                else if (kd === 'shears') { g.beginPath(); g.moveTo(8 * t, 6 * t); g.lineTo(24 * t, 26 * t); g.moveTo(24 * t, 6 * t); g.lineTo(8 * t, 26 * t); g.lineWidth = 3 * t; g.strokeStyle = hc; g.stroke(); }
                else if (kd === 'shield') { g.beginPath(); g.moveTo(6 * t, 6 * t); g.lineTo(26 * t, 6 * t); g.lineTo(24 * t, 20 * t); g.lineTo(16 * t, 28 * t); g.lineTo(8 * t, 20 * t); g.closePath(); g.fill(); g.stroke(); }
                else if (kd === 'knife') { g.beginPath(); g.moveTo(14 * t, 18 * t); g.lineTo(26 * t, 5 * t); g.lineTo(24 * t, 17 * t); g.closePath(); g.fill(); g.stroke(); }
                else { g.beginPath(); g.arc(21 * t, 10 * t, 6 * t, 0, 7); g.fill(); g.stroke(); }
                if (bk) { g.strokeStyle = '#c62828'; g.beginPath(); g.moveTo(4 * t, 6 * t); g.lineTo(28 * t, 28 * t); g.stroke(); }
            } else if (kind === 'bucket' || kind === 'bottle' || kind === 'cyl') {
                let c = typeof indContOf === 'function' ? indContOf(k) : null, liq = c && c.base ? (IC_LIQ[c.base] || col) : null, mat = c ? c.mat : 'wood', body = { wood: '#8d6e63', jar: '#bf6b3c', fe: '#607d8b', cu: '#d4a017' }[mat] || col;
                if (kind === 'bucket') { g.fillStyle = body; g.beginPath(); g.moveTo(7 * t, 8 * t); g.lineTo(25 * t, 8 * t); g.lineTo(22 * t, 28 * t); g.lineTo(10 * t, 28 * t); g.closePath(); g.fill(); g.stroke(); if (liq) { g.fillStyle = liq; g.fillRect(8 * t, 9 * t, 16 * t, 5 * t); } }
                else if (kind === 'cyl') { g.fillStyle = '#78909c'; rr(10 * t, 6 * t, 12 * t, 22 * t, 5 * t); g.fill(); g.stroke(); g.fillStyle = col; g.fillRect(11 * t, 14 * t, 10 * t, 6 * t); }
                else { g.fillStyle = col; rr(11 * t, 12 * t, 11 * t, 16 * t, 4 * t); g.fill(); g.stroke(); g.fillStyle = 'rgba(200,230,255,.8)'; g.fillRect(14 * t, 5 * t, 5 * t, 8 * t); g.strokeRect(14 * t, 5 * t, 5 * t, 8 * t); }
                let sym = kind === 'bottle' ? (IC_GAS[k.replace(/^b_/, '')] || (k === 'bottle' ? null : icZh(k))) : kind === 'bucket' && c && c.base ? ({ water_raw: '水', water_sea: '海', water_boiled: '开', milk: '奶', oil: '油', tomato_soup: '汤', radish_soup: '汤', cabbage_stew: '汤' }[c.base] || null) : null;
                if (sym) txt(sym, 17 * t, 21 * t, sym.length > 1 ? 8 : 11);
            } else if (kind === 'dev') {
                g.fillStyle = col; rr(4 * t, 8 * t, 24 * t, 18 * t, 3 * t); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(7 * t, 11 * t, 18 * t, 4 * t); txt(icZh(k), 16 * t, 21 * t, 12);
            } else if (kind === 'wear') {
                g.fillStyle = col; g.beginPath(); g.moveTo(8 * t, 6 * t); g.lineTo(24 * t, 6 * t); g.lineTo(28 * t, 14 * t); g.lineTo(23 * t, 17 * t); g.lineTo(23 * t, 27 * t); g.lineTo(9 * t, 27 * t); g.lineTo(9 * t, 17 * t); g.lineTo(4 * t, 14 * t); g.closePath(); g.fill(); g.stroke();
            } else if (kind === 'seed') {
                g.fillStyle = col; g.beginPath(); g.ellipse(16 * t, 18 * t, 6 * t, 9 * t, 0.5, 0, 7); g.fill(); g.stroke(); g.strokeStyle = '#2e7d32'; g.lineWidth = 2 * t; g.beginPath(); g.moveTo(16 * t, 10 * t); g.lineTo(18 * t, 4 * t); g.stroke();
            } else if (kind === 'food') {
                g.fillStyle = col; g.beginPath(); g.arc(16 * t, 17 * t, 10 * t, 0, 7); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(12 * t, 13 * t, 3 * t, 0, 7); g.fill(); txt(icZh(k), 17 * t, 19 * t, 11);
            } else {   // 兜底：物品颜色的圆角方块加名字首字，再按 key 打几个小点，保证不重样
                g.fillStyle = col; rr(4 * t, 4 * t, 24 * t, 24 * t, 6 * t); g.fill(); g.stroke();
                let h = icHash(k); g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc((7 + ((h >> (i * 5)) % 18)) * t, (7 + ((h >> (i * 5 + 2)) % 18)) * t, 1.4 * t, 0, 7); g.fill(); }
                txt(icZh(k), 16 * t, 17 * t, 15);
            }
            return cv;
        }
        function indIcon(k, size) {
            size = size || 32; let ck = k + '|' + size;
            if (!IC_CACHE[ck]) { try { IC_CACHE[ck] = icDraw(k, size).toDataURL(); } catch (e) { IC_CACHE[ck] = ''; } }
            return IC_CACHE[ck];
        }
        function indIconImg(k, px) {
            px = px || 32; let u = indIcon(k, px <= 24 ? 24 : px <= 32 ? 32 : 48); if (!u) return '';
            return '<img src="' + u + '" width="' + px + '" height="' + px + '" style="vertical-align:middle;margin-right:3px;pointer-events:none;" alt="">';
        }
