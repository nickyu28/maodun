# Code2 交接文档（11-08）

接手的人先读：CLAUDE.md、docs/queue-code2.md（排队和最近一次汇报）、docs/code2-tasks.md（每个任务的原话要求）、docs/industry.md（每个系统的说明）。跟作者沟通用中文。

## 我是谁、管什么
Code2 负责猫盾工业（硬核模式）+ 实验室：`js/19-industry*.js`、`js/18-lab.js`、`docs/industry*.md`、`docs/lab-spec.md`、`docs/chem.md`、`tests/smoke.js` 里 `IND`／`LB` 开头的检查。主游戏和别的东西归 Code1，不要改。

## 推送规矩（作者 11-06 定的，最新）
1. 每个提交只跑快速档：`SMOKE_ONLY='检查名1|检查名2' node tests/smoke.js`（总会先跑电脑、触屏两项启动检查）。`SMOKE_ONLY` 是前缀匹配，`IND11` 会连 `IND111…` 一起跑。
2. 一批做完、推送前跑一次全量（不设 `SMOKE_ONLY`），约 50 分钟。跑的时候别改 `js/`、`index.html`。
3. 全量过了：`git pull --rebase origin main`（冲突时保留带"猫盾工业"注释的行），再普通 `git push`。不强推，不改写历史。
4. 推之前看 `gh run list --branch main`：main 最近一次运行 smoke 和 deploy 都成功才推（deploy 不能是跳过）；还在跑就等；红的先不推，等 Code1 修。
5. 推完盯这次运行到 smoke 和 deploy 都成功；红了先修，不堆新活。
6. 推完在 `docs/queue-code2.md` 的"最近一次汇报"写：提交号、全量冒烟结果、CI 和 deploy 状态、线上版本号、没做的东西。
7. 版本号：玩家能玩到的改动把 `index.html` 的 `GAME_VERSION` 的 N 加一（现在 `2026.11.5-36`）；不写 CHANGELOG；不动 `DATA_WIPE_VER`；联机消息格式没动，`NET_PROTO` 不动。

## 本机环境
- 跑冒烟要先 `export CHROME_PATH=/opt/pw-browsers/chromium`，不然报"Chrome 没起来"。起不来时 `pkill -f chromium` 再跑。
- 命令别接 `| grep` 在长跑上：会被挪到后台、输出为空。要重定向到文件（`> /tmp/x.log 2>&1`）再读。
- 测试字符串在模板字面量里，eval 的代码里**不能写 `//` 注释**（会吞掉后面的 `})()`）。
- 新测试必须做变异检查：故意改坏功能，确认测试会红，再改回来。

## 代码约定（踩过的坑）
- 配方表 `IND_CRAFT`／`IND_RECIPES` 只能往最后加（炉子里存的是下标）。`IND_RECIPES` 匹配是"第一条原料够的"，要优先的配方加 `pri: true`。
- 物品用不上体检（IND0）的，要写 `later: '说明'`。
- 新文件加进 `index.html` 的 `GAME_FILES`，按顺序拼成一份脚本；现在最后几个是 `…cast2, repair, asu, moon, moonpick`。
- 存档整个 `ind.base` 都存；新字段要在某个 `xxFixBase` 里清理（`pwFixBase` 里挂），老存档没有这个字段不能报错。
- 玩家看得到的文字不许出现"保底""必出"；文案短、口语。
- 不要往 `industry` 分支提交；`IND` 开头的检查和 industry 命名的文件你说了算，别人别动。

## 现在的状态（线上 2026.11.5-36）
最近推了：`d69808b`（元素表补锡铅钚、TNT 炸户外设备、任务 80～83）、`eb168c9`（汇报）。CI 绿，已部署。

| 任务 | 文件 | 检查 | 入口 |
|---|---|---|---|
| 80 冰淇淋、冰棍 | `19-industry-cold.js`、`cast2.js` | IND115 | 工作台（硬核） |
| 81 空气分离塔、氮氩氖氪 | `19-industry-asu.js` | IND116 | 设备"空气分离塔" |
| 82 月球地图 M1 | `19-industry-moon.js` | IND117 | `?hcdebug=1` 控制台 `indMoonEnter()` |
| 83 月球选落点 M2 | `19-industry-moonpick.js` | IND118 | `?hcdebug=1` 控制台 `indMoonPick()` |

- 月球：`IND_PLANETS.moon` 是星球数据表（重力、大气、昼夜、温度现在只记着）。固定种子 20261107，自己的随机数，不用 `indRand`／`Math.random`。存档 `ind.base.moon = {seed, dug, cells, site?, flat?}`。矿量按 `moonNeed()`／`moonCover()` 算，都 ≥3 倍，改了配方表要重跑 IND117。
- 氩气灯泡：`js/19-industry-cave.js` 的 `cvBulbIs()`／`cvBulbDraw()`。氮气灭火挂在 `indUse` 里。

## 没做、留给下一个人
- 月球和选落点**没有玩家入口**，等火箭发射那期接。火箭第二期起（docs/rocket.md "火箭之后"、docs/rocket-steps.md）没做。
- 氖、氪只点元素表，用处等作者定。我提议：氖——氖灯、制冷剂；氪——氪灯泡、隔热玻璃填充。
- 返程火箭燃料现在按 400 份水冰折算（`MN_FUEL_WATER`），火箭做出来按真数重算。橄榄石、KREEP 没配方用，按 100 份底线。铁没算火箭箭体的钢。
- 重力、大气、温度没接上。
- 作者说**不做**的：品质系统、LED（任务 65）、任务 76（已取消）、电路第 2～3 期。
- 任务 78 里"拆设备、拆电池"要等作者确认。
- Code1 真玩报给 Code2 的问题（没排期，等作者）：基站没电整块丢了；死了以后没围成的基站还丢（见 docs/queue-code2.md 上一次汇报）。
- 作者的第三类星球设想"分界星"只是草稿，没排期（docs/moon.md 末尾）。

## 夜间自动跑
每天北京时间凌晨 2 点前后各起一个会话照着清单做。没活的夜里只看 CI、在"最近一次汇报"写一行、结束，不跑全量、不重读大文档、不自己找活。
