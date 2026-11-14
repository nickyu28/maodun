# 设置页和登记接口（任务 P3）

代码在 `js/02b-settings.js`（放在 `js/02-lobby.js` 后面，猫盾工业的文件在它后面，可以直接用）。设置存在 `SETTINGS`（`localStorage` 的 `TH_settings`），跟着设备走，不进 `gState`、不用改 `saveProgress`。

## 设置页
大厅的"设置"按钮、`openSettings(组名)`。四组：声音、操作、显示、游戏，换组不关窗；登记时起了新组名，页面上会多出一组。Esc 关（系统弹窗的"好了"）。按钮至少 40 像素。文字不用括号。

内置的有：总音量、音乐、音效、语音、静音、切走窗口时静音；左右和上下的转视角快慢、上下反转、触屏按键显示、触屏按钮大小和透明度；画面清晰或流畅；新手提示、关面板后自动锁鼠标、重玩教程、快捷语；通用按键的改键表。

## 登记选项
```js
settingsRegister({ group: '游戏', id: 'ind_tips', label: '工业提示', type: 'toggle', def: true, onChange: function (v) {} });
settingsRegister({ group: '声音', id: 'ind_hum', label: '机器声', type: 'slider', def: 0.5, min: 0, max: 1, step: 0.05 });
settingsRegister({ group: '工业', id: 'ind_unit', label: '单位', type: 'choice', def: 'u', choices: [['u', '伏'], ['k', '千伏']] });
settingsGet('ind_hum');      // 现在的值，没改过就是 def
settingsSet('ind_hum', 0.3); // 存下来，调 onChange
```
- `id` 全局不能重复，建议带自己的前缀。`group` 是已有四组之一就放进那一组，别的名字就新开一组。
- 登记时会马上用当前值调一次 `onChange`。值存在 `SETTINGS.reg[id]`，读不到或不合法就用 `def`。

## 登记按键
```js
keyRegister('industry', 'place', 'e', '放下设备', function (e) { /* 按了就调，连发不算，打字不算 */ }, { active: function () { return !!ind; } });
keyOf('industry', 'place');          // 现在的键，e.key 小写，比如 'e'、' '、'shift'、'tab'
keyIs(e, 'industry', 'place');       // 自己的 keydown 里判断用这个
```
- `mode` 是自己起的模式名，通用的是 `'all'`。**同一个 mode 里两个动作不能用同一个键**，不同 mode 可以重复。Esc 不能改。
- 有 `fn` 的，设置页的键一变就跟着变，按了就调 `fn`。自己在 keydown 里读键的，用 `keyOf` 或 `keyIs`，别写死。
- 老代码写死 `keys['w']`、`e.key === 'e'` 的：登记时加 `{ legacy: true }`（`fn` 传 `null`），玩家改键后，这里把新键翻译成原键再发给老代码，老代码一行不用改；原键同时被挡掉。通用的 WASD、空格、Shift、E、Tab、Q、R、L、M、回车已经这样登记了。
- 输入框和聊天打字时不翻译、不调 `fn`。

## 显示（第二批）
都是登记出来的，在"显示"组：界面大小，快捷栏位置（下边、左边），小地图、准星、血条体力条数字、左上角信息条的开关，视野（50 到 100 度），看多远（近、中、远，改相机的 far），帧率上限（30、60、不限，只限制画，逻辑照常跑）。
- 给猫盾工业用的：`:root` 上有 `--hud-scale`（界面大小）和 `--pad-scale`、`--pad-alpha`（触屏按钮），工业自己的 HUD 想跟着缩放，可以用 `scale: var(--hud-scale, 1)`。
- "工业右上那排按钮"这一项（右上、左上、右下、左下）是 index.html 里的 CSS 靠 `div:has(> #ind-btn-book)` 找到那排按钮的盒子，改它的角。**`#ind-btn-book` 这个 id 和盒子的 `right:8px; top:8px` 内联样式不要改**，改了要同步改 index.html 里 `data-btnpos` 那三行。
- 没做：触屏按钮拖动摆放，换成"触屏按钮大小、透明度"；按 `body.dataset` 和 CSS 变量套的显示项，别的模式的 HUD 只有主游戏里这几个元素跟着变。

## 冒烟
SET1 设置页和存档，SET2 按键绑定和登记，SET3 显示设置。
