# 提示词清单（任务 72）

11-04 之后加的玩家看得到的提示（`indFlash`）和几处面板灰字。留：动作被拒绝说原因、危险预警每次只提一次、状态变化、作者明确要的几句；删：画面看得出来的、教怎么玩的、每次都弹重复的、解释性废话。删的只删文字，功能不动；想恢复哪句，按"位置"和"原文"加回去。

行号是删之前的。范围：用 `git diff` 找 11-04 之后新增或改过的 `indFlash(...)`（162 处）和面板灰字（6 处）。物品说明（`use:`）和任务 70 之前就有的提示不在这张表里。

| # | 文件 | 行 | 原文 | 留／删 | 理由 |
|---|---|---|---|---|---|
| 1 | 19-industry-ach.js | 28 | `'成就：' + ACH_BY[id].name` | 留 | 状态变化 |
| 2 | 19-industry-ach.js | 74 | `'电池组两端接到一起了，在发烫'` | 留 | 危险预警 |
| 3 | 19-industry-cast.js | 45 | `'熔池里是' + CT_METAL[P.m].n + '，先倒完'` | 留 | 动作被拒绝说原因 |
| 4 | 19-industry-cast.js | 56 | `'黏土模具浇不了' + CT_METAL[P.m].n + '，裂了'` | 留 | 状态变化 |
| 5 | 19-industry-cast.js | 70 | `indName(M.part) + '还烫，等 ' + Math.ceil(M.t) + ' 秒'` | 留 | 动作被拒绝说原因 |
| 6 | 19-industry-cast.js | 71 | `'背包满了'` | 留 | 动作被拒绝说原因 |
| 7 | 19-industry-cast.js | 72 | `'取出了' + indName(M.part)` | 删 | 背包里看得见 |
| 8 | 19-industry-cast.js | 73 | `'模具用到头，碎了'` | 留 | 状态变化 |
| 9 | 19-industry-cast.js | 80 | `'先装出料槽'` | 留 | 动作被拒绝说原因 |
| 10 | 19-industry-cast.js | 81 | `'槽里已经有模具了'` | 留 | 动作被拒绝说原因 |
| 11 | 19-industry-cast.js | 82 | `'先把槽里的锭取走'` | 留 | 动作被拒绝说原因 |
| 12 | 19-industry-cast.js | 88 | `'里面有东西，先取零件'` | 留 | 动作被拒绝说原因 |
| 13 | 19-industry-cast.js | 89 | `'背包满了'` | 留 | 动作被拒绝说原因 |
| 14 | 19-industry-cast.js | 103 | `'正在雕' + CT_SHAPE[ind.carve.s].n + '模具：光标在亮区里按 X'` | 删 | 教怎么玩（面板里已有说明） |
| 15 | 19-industry-cast.js | 117 | `'拿上小刀接着雕'` | 留 | 动作被拒绝说原因 |
| 16 | 19-industry-cast.js | 118 | `'黏土不够了，不雕了'` | 留 | 动作被拒绝说原因 |
| 17 | 19-industry-cast.js | 126 | `'雕好了' + indName('mold_' + C.s + '_raw') + '（烧硬以后能用 ' + q + ' 次）'` | 留 | 状态变化 |
| 18 | 19-industry-cave.js | 69 | `c.gas ? '进矿洞了。有股怪味' : '进矿洞了，里面很黑'` | 改短 | 删"进矿洞了"，只留有瓦斯时的"有股怪味" |
| 19 | 19-industry-cave.js | 76 | `'出洞了'` | 删 | 画面看得出来 |
| 20 | 19-industry-cave.js | 94 | `'火把还在烧'` | 删 | 重复弹 |
| 21 | 19-industry-cave.js | 95 | `'点着了火把，能烧 ' + CV.torch + ' 秒'` | 删 | 火把状态 HUD 有 |
| 22 | 19-industry-cave.js | 101 | `'瓦斯爆炸了！洞里有瓦斯别点明火'` | 留 | 危险预警 |
| 23 | 19-industry-cave.js | 107 | `'火把烧完了'` | 留 | 状态变化 |
| 24 | 19-industry-cave.js | 114 | `'灯泡没电了'` | 留 | 状态变化 |
| 25 | 19-industry-circuit.js | 74 | `'电路太多了'` | 留 | 动作被拒绝说原因 |
| 26 | 19-industry-circuit.js | 81 | `K.name + '不用接铜线'` | 留 | 动作被拒绝说原因 |
| 27 | 19-industry-circuit.js | 82 | `'按了一下'` | 删 | 看得出来 |
| 28 | 19-industry-circuit.js | 83 | `'拉杆' + (d.on1 ? '拉上了' : '拉下了')` | 删 | 看得出来 |
| 29 | 19-industry-circuit.js | 86 | `K.name + '：' + st` | 删 | 重复 |
| 30 | 19-industry-circuit.js | 92 | `K.name + '没有输出口，先点输出的块'` | 留 | 动作被拒绝说原因 |
| 31 | 19-industry-circuit.js | 93 | `'选了' + K.name + '，再点输入的块'` | 删 | 教怎么玩 |
| 32 | 19-industry-circuit.js | 96 | `'不能自己连自己'` | 留 | 动作被拒绝说原因 |
| 33 | 19-industry-circuit.js | 98 | `K.name + '没有输入口'` | 留 | 动作被拒绝说原因 |
| 34 | 19-industry-circuit.js | 99 | `'电路太多了'` | 留 | 动作被拒绝说原因 |
| 35 | 19-industry-circuit.js | 101 | `'这个输入口已经接了线'` | 留 | 动作被拒绝说原因 |
| 36 | 19-industry-circuit.js | 102 | `'一个输出口最多 ' + RC.outMax + ' 根线'` | 留 | 动作被拒绝说原因 |
| 37 | 19-industry-circuit.js | 103 | `'信号线不够'` | 留 | 动作被拒绝说原因 |
| 38 | 19-industry-circuit.js | 105 | `'接上了：' + RC_KINDS[src.ty].name + ' → ' + K.name` | 删 | 线画出来了 |
| 39 | 19-industry-circuit.js | 155 | `'家里电路太复杂，只补了一部分'` | 留 | 动作被拒绝说原因 |
| 40 | 19-industry-circuit.js | 203 | `'这格放不了'` | 留 | 动作被拒绝说原因 |
| 41 | 19-industry-circuit.js | 204 | `'最多放 ' + RC.chipEl + ' 个元件'` | 留 | 动作被拒绝说原因 |
| 42 | 19-industry-circuit.js | 205 | `'背包里没有这个元件'` | 留 | 动作被拒绝说原因 |
| 43 | 19-industry-circuit.js | 217 | `'输出针脚是终点，先点源'` | 留 | 动作被拒绝说原因 |
| 44 | 19-industry-circuit.js | 219 | `'不能自己连自己'` | 留 | 动作被拒绝说原因 |
| 45 | 19-industry-circuit.js | 220 | `'输入针脚不能当终点'` | 留 | 动作被拒绝说原因 |
| 46 | 19-industry-circuit.js | 222 | `'这个输出针脚已经接了线'` | 留 | 动作被拒绝说原因 |
| 47 | 19-industry-circuit.js | 223 | `'这个元件的输入口都接满了'` | 留 | 动作被拒绝说原因 |
| 48 | 19-industry-circuit.js | 224 | `'里面线太多了'` | 留 | 动作被拒绝说原因 |
| 49 | 19-industry-cold.js | 44 | `'东西放坏了，放冷藏箱或冰箱能放久点'` | 留 | 作者明确要的 |
| 50 | 19-industry-cold.js | 87 | `'凿下 ' + n + ' 块冰' + (r.ground ? '，背包满了，掉在脚边' : '')` | 删 | 背包数字看得见 |
| 51 | 19-industry-fire.js | 29 | `'打火机没油了：对着装石油的桶右键加满'` | 改短 | 去掉"对着装石油的桶右键加满" |
| 52 | 19-industry-fire.js | 32 | `'打火石还要一块铁锭'` | 留 | 动作被拒绝说原因 |
| 53 | 19-industry-fire.js | 32 | `'打火石要草或松脂引火'` | 留 | 动作被拒绝说原因 |
| 54 | 19-industry-fire.js | 33 | `'没打着，再打一次'` | 留 | 动作被拒绝说原因 |
| 55 | 19-industry-fire.js | 42 | `'火把点着了（能烧 ' + CV.torch + ' 秒）'` | 删 | HUD 有 |
| 56 | 19-industry-fire.js | 44 | `'先放柴'` | 留 | 动作被拒绝说原因 |
| 57 | 19-industry-fire.js | 46 | `IND_COOK[c.ty].name + '点着了，面板里调火候'` | 删 | 教怎么玩 |
| 58 | 19-industry-fire.js | 58 | `'篝火要火种、火柴、打火机或点着的火把才点得着'` | 留 | 动作被拒绝说原因 |
| 59 | 19-industry-fire.js | 63 | `'正在钻木取火 ' + Math.floor(ind.drill.t / FI.drill * 100) + '%'` | 删 | 每次都弹的进度 |
| 60 | 19-industry-fire.js | 64 | `'钻木取火要草或松脂引火'` | 留 | 动作被拒绝说原因 |
| 61 | 19-industry-fire.js | 65 | `'钻木取火：拿着干木头，' + FI.drill + ' 秒'` | 删 | 教怎么玩 |
| 62 | 19-industry-fire.js | 70 | `'干木头或引火物没了，停了'` | 留 | 状态变化 |
| 63 | 19-industry-fire.js | 73 | `'钻出火种了！60 秒内去点炉子'` | 改短 | 去掉"60 秒内去点炉子" |
| 64 | 19-industry-fire.js | 80 | `'火种灭了'` | 留 | 状态变化 |
| 65 | 19-industry-fire.js | 101 | `'打火机还剩 ' + (ind.base.lighterN \|\| 0) + ' 次。背包里有装石油的桶，右键就能加满'` | 改短 | 去掉"背包里有装石油的桶…" |
| 66 | 19-industry-fire.js | 102 | `'打火机是满的（' + FI.lighterN + ' 次）'` | 留 | 动作被拒绝说原因 |
| 67 | 19-industry-fire.js | 103 | `'打火机加满了（' + FI.lighterN + ' 次）'` | 删 | 看得出来 |
| 68 | 19-industry-fire.js | 112 | `'敲出一块燧石'` | 删 | 背包看得见 |
| 69 | 19-industry-lava.js | 55 | `'火把烧焦了，变成了木炭'` | 留 | 状态变化 |
| 70 | 19-industry-mob.js | 112 | `indName(k) + '用坏了，变成' + indName('broken_' + k)` | 留 | 状态变化 |
| 71 | 19-industry-mob.js | 188 | `IND_ANIMALS[pa.k].name + '的' + indName(pa.shield) + '坏了'` | 留 | 状态变化 |
| 72 | 19-industry-mob.js | 245 | `'燃尽了'` | 留 | 作者明确要的 |
| 73 | 19-industry-mob.js | 297 | `'刀上的毒用完了'` | 留 | 状态变化 |
| 74 | 19-industry-mob.js | 307 | `'盾还在冷却（' + Math.ceil(B.cd) + ' 秒）'` | 留 | 动作被拒绝说原因 |
| 75 | 19-industry-mob.js | 323 | `'先带回家再给它装'` | 留 | 动作被拒绝说原因 |
| 76 | 19-industry-mob.js | 325 | `'最多 ' + MB.petMax + ' 只战斗的宠物'` | 留 | 动作被拒绝说原因 |
| 77 | 19-industry-mob.js | 327 | `nm + '装上了' + indName(k)` | 删 | 头顶有图标 |
| 78 | 19-industry-mob.js | 331 | `nm + '装上了' + indName(k)` | 删 | 头顶有图标 |
| 79 | 19-industry-mob.js | 335 | `'给' + nm + '喝了水'` | 删 | 看得出来 |
| 80 | 19-industry-mob.js | 365 | `IND_ANIMALS[p.k].name + '的' + indName(p.weapon) + '断了'` | 留 | 状态变化 |
| 81 | 19-industry-mob.js | 433 | `'撒了云絮，当浇了一次水'` | 删 | 看得出来 |
| 82 | 19-industry-mob.js | 435 | `'胶水出门时倒在地上，粘住怪'` | 留 | 动作被拒绝说原因 |
| 83 | 19-industry-mob.js | 436 | `'倒了一滩胶水，怪踩上去走不动'` | 删 | 看得出来 |
| 84 | 19-industry-mob.js | 442 | `'甜甜的，像棉花糖'` | 留 | 作者明确要的 |
| 85 | 19-industry-mob.js | 443 | `'毒蘑菇！中毒了'` | 留 | 危险预警 |
| 86 | 19-industry-mob.js | 443 | `'肚子不舒服'` | 留 | 危险预警 |
| 87 | 19-industry-mob.js | 461 | `indName(r.out) + '涂上毒了：接下来 ' + MB.poisonHits + ' 下让怪中毒'` | 改短 | 去掉"接下来 10 下…" |
| 88 | 19-industry-mob.js | 462 | `'修好了' + indName(r.out) + '（耐久一半）'` | 删 | 耐久看得出来 |
| 89 | 19-industry-nuke.js | 138 | `'反应堆没水冷了，现在只靠空气，温度会一路涨'` | 留 | 危险预警 |
| 90 | 19-industry-nuke.js | 142 | `'水塔只剩 ' + Math.max(0, Math.floor(t.wu \|\| 0)) + ' 桶了，反应堆的冷却水快没了'` | 留 | 危险预警 |
| 91 | 19-industry-pond.js | 28 | `'这里已经是水池了'` | 留 | 动作被拒绝说原因 |
| 92 | 19-industry-pond.js | 29 | `'池子太大了（最多 ' + PD.max + ' 格）'` | 留 | 动作被拒绝说原因 |
| 93 | 19-industry-pond.js | 30 | `'这里挖不了（农田、家具、房子、出发门旁边）'` | 留 | 动作被拒绝说原因 |
| 94 | 19-industry-pond.js | 36 | `'挖了一格水池（这个池子 ' + G.length + ' 格）'` | 删 | 画面看得出来 |
| 95 | 19-industry-pond.js | 43 | `'这格已经盖了'` | 留 | 动作被拒绝说原因 |
| 96 | 19-industry-pond.js | 43 | `'盖上了一格'` | 删 | 看得出来 |
| 97 | 19-industry-pond.js | 44 | `'掀开了木盖'` | 删 | 看得出来 |
| 98 | 19-industry-pond.js | 46 | `'这格已经铺了'` | 留 | 动作被拒绝说原因 |
| 99 | 19-industry-pond.js | 47 | `'铺一格要 ' + need + ' 份' + indName(k)` | 留 | 动作被拒绝说原因 |
| 100 | 19-industry-pond.js | 48 | `'铺好了：这格不漏水' + (k === 'brick' ? '，蒸发少两成' : '')` | 删 | 看得出来 |
| 101 | 19-industry-pond.js | 52 | `'填回一格要 ' + PD.fill + ' 份泥土或沙子'` | 留 | 动作被拒绝说原因 |
| 102 | 19-industry-pond.js | 56 | `'填回了一格'` | 删 | 看得出来 |
| 103 | 19-industry-pond.js | 59 | `'池子里没水了'` | 留 | 动作被拒绝说原因 |
| 104 | 19-industry-pond.js | 60 | `'接了一桶生水（池子还剩 ' + (Math.round((w - 1) * 10) / 10) + ' 桶）'` | 删 | 桶看得出来 |
| 105 | 19-industry-pond.js | 63 | `'池子满了（' + G.length * PD.cap + ' 桶）'` | 留 | 动作被拒绝说原因 |
| 106 | 19-industry-pond.js | 64 | `'倒进去一桶（池子 ' + (Math.round((w + 1) * 10) / 10) + ' / ' + G.length * PD.cap + ' 桶）'` | 删 | 看得出来 |
| 107 | 19-industry-pond.js | 67 | `'池子里没水了'` | 留 | 动作被拒绝说原因 |
| 108 | 19-industry-pond.js | 69 | `'喝了一口生水' + (sick ? '，肚子不舒服' : '')` | 留 | 动作被拒绝说原因 |
| 109 | 19-industry-power.js | 40 | `'没力气了'` | 留 | 动作被拒绝说原因 |
| 110 | 19-industry-ride.js | 49 | `'在筏上不能上车'` | 留 | 动作被拒绝说原因 |
| 111 | 19-industry-ride.js | 50 | `rdCarWhy()` | 留 | 动作被拒绝说原因 |
| 112 | 19-industry-ride.js | 51 | `'上车了：' + IND_ITEMS[k].name + (ty === 'bike' ? '（脚踏吃体力）' : '（' + rdCarV().toFixed(1) + ' V）') + '，右键下车'` | 删 | HUD 有 |
| 113 | 19-industry-ride.js | 57 | `msg` | 留 | 动作被拒绝说原因 |
| 114 | 19-industry-ride.js | 67 | `'骑着没法用'` | 留 | 动作被拒绝说原因 |
| 115 | 19-industry-ride.js | 74 | `rdCarWhy()` | 留 | 动作被拒绝说原因 |
| 116 | 19-industry-ride.js | 111 | `'目的地设好了：车自己开，碰方向键接管'` | 删 | 教怎么玩 |
| 117 | 19-industry-ride.js | 113 | `msg` | 留 | 动作被拒绝说原因 |
| 118 | 19-industry-ride.js | 140 | `'把自动驾驶芯片拆下来了'` | 删 | 看得出来 |
| 119 | 19-industry-ride.js | 141 | `'装上了自动驾驶芯片：开着车按 M 在地图上点目的地'` | 删 | 教怎么玩 |
| 120 | 19-industry-ride.js | 142 | `'背包里没有自动驾驶芯片'` | 留 | 动作被拒绝说原因 |
| 121 | 19-industry-stack.js | 23 | `'电压不一样，叠不上'` | 留 | 动作被拒绝说原因 |
| 122 | 19-industry-stack.js | 39 | `'最多叠 ' + STK.max + ' 个'` | 留 | 动作被拒绝说原因 |
| 123 | 19-industry-stack.js | 41 | `'叠上去了，现在一组 ' + (t.o.grp.length + 1) + ' 个电池组（并联）。左键点它给新的装电池'` | 删 | 教怎么玩 |
| 124 | 19-industry-stack.js | 45 | `'最多叠 ' + STK.max + ' 台'` | 留 | 动作被拒绝说原因 |
| 125 | 19-industry-stack.js | 47 | `'叠上去了，现在 ×' + t.o.n` | 删 | 面板里写了 ×n |
| 126 | 19-industry-stack.js | 99 | `'一个电池组只能装一种电池'` | 留 | 动作被拒绝说原因 |
| 127 | 19-industry-stack.js | 102 | `'背包里没有' + indName(key)` | 留 | 动作被拒绝说原因 |
| 128 | 19-industry-stack.js | 102 | `'装了 ' + put + ' 节'` | 删 | 背包看得见 |
| 129 | 19-industry-stack.js | 117 | `'收起了一个电池组，带着它自己的电池'` | 删 | 看得出来 |
| 130 | 19-industry-stack.js | 123 | `'正在做，等这一炉做完再收'` | 留 | 动作被拒绝说原因 |
| 131 | 19-industry-stack.js | 124 | `'还烫着：' + why` | 留 | 动作被拒绝说原因 |
| 132 | 19-industry-stack.js | 129 | `'收起了第 ' + (i + 1) + ' 台，现在 ×' + stkN(t.o) + (tot.bag ? '' : tot.box ? '（放进了仓库箱）' : '（掉在地上）')` | 删 | 面板里写了 |
| 133 | 19-industry-tree.js | 29 | `'拿小刀或斧子才割得了'` | 留 | 动作被拒绝说原因 |
| 134 | 19-industry-tree.js | 31 | `'这棵的松脂割完了，过一阵会再长'` | 留 | 动作被拒绝说原因 |
| 135 | 19-industry-tree.js | 33 | `'割了 1 份松脂'` | 删 | 背包看得见 |
| 136 | 19-industry-tree.js | 36 | `'这棵橡胶树割完了'` | 留 | 动作被拒绝说原因 |
| 137 | 19-industry-tree.js | 38 | `'开始割胶，站在旁边 ' + TR.tap + ' 秒（可以走动，别离太远）'` | 删 | 教怎么玩 |
| 138 | 19-industry-tree.js | 43 | `'割胶停了：手上要拿小刀或斧子'` | 留 | 动作被拒绝说原因 |
| 139 | 19-industry-tree.js | 44 | `'离树太远，割胶停了'` | 留 | 动作被拒绝说原因 |
| 140 | 19-industry-tree.js | 46 | `'割到 1 份乳胶' + (r.ground ? '，背包满了，掉在脚边' : '') + (P.o.lx < 1 ? '，这棵割完了' : '')` | 删 | 画面看得出来 |
| 141 | 19-industry-tree.js | 52 | `'这棵树上的椰子已经摇下来了'` | 留 | 动作被拒绝说原因 |
| 142 | 19-industry-tree.js | 54 | `'摇下来 ' + n + ' 个椰子' + (r.ground ? '，背包满了，掉在脚边' : '')` | 删 | 背包看得见 |
| 143 | 19-industry-world.js | 101 | `'空手砍不动，得有斧子或小刀'` | 留 | 动作被拒绝说原因 |
| 144 | 19-industry.js | 759 | `'太热了，离窑远点，喝点水'` | 留 | 作者明确要的 |
| 145 | 19-industry.js | 871 | `D.name + '跟着你了！'` | 留 | 状态变化 |
| 146 | 19-industry.js | 1700 | `'剪刀没了'` | 留 | 动作被拒绝说原因 |
| 147 | 19-industry.js | 1790 | `'骑着没法用'` | 留 | 动作被拒绝说原因 |
| 148 | 19-industry.js | 1929 | `'身上有放射性的东西，睡不着'` | 留 | 危险预警 |
| 149 | 19-industry.js | 1948 | `'骑着没法用'` | 留 | 动作被拒绝说原因 |
| 150 | 19-industry.js | 2001 | `nm + '烧坏了' + (r.fire ? '，旁边起火了' : '')` | 留 | 状态变化 |
| 151 | 19-industry.js | 2006 | `'电池组烧坏了，' + n + ' 节电池报废' + (r.fire ? '，旁边起火了' : '')` | 留 | 状态变化 |
| 152 | 19-industry.js | 2021 | `'两个电池电压不一样，会烧。'` | 留 | 作者明确要的 |
| 153 | 19-industry.js | 2039 | `msg + (ind.lastBoomLoot ? '；里面的 ' + ind.lastBoomLoot + ' 个东西掉在了地上' : '')` | 留 | 状态变化 |
| 154 | 19-industry.js | 2040 | `msg.replace('炸了', '冒烟了，3 秒后烧坏')` | 留 | 危险预警 |
| 155 | 19-industry.js | 2122 | `'放好了' + indName(k) + (IND_DEVS[IND_ITEMS[k].dev] && IND_DEVS[IND_ITEMS[k].dev].nowire ? '' : '（拿铜线点电源再点它，接上电）')` | 删 | 教怎么玩/看得出来 |
| 156 | 19-industry.js | 2276 | `'叠在一起的，左键点它选一台收'` | 留 | 状态变化 |
| 157 | 19-industry.js | 2403 | `'叠在一起的，左键点它选一台收'` | 留 | 状态变化 |
| 158 | 19-industry.js | 2483 | `'取消了'` | 删 | 看得出来 |
| 159 | 19-industry.js | 2838 | `'骑着没法用（只能做编织的活）'` | 留 | 动作被拒绝说原因 |
| 160 | 19-industry.js | 2999 | `'温度不够，要鼓风或者用电炉'` | 留 | 作者明确要的 |
| 161 | 19-industry.js | 3040 | `'这个不能放进炉子'` | 留 | 动作被拒绝说原因 |
| 162 | 19-industry.js | 3095 | `'先点火：拿火种、火柴、打火机、打火石或点着的火把左键点炉子'` | 改短 | 缩成"先点火"（炉子面板的红字同） |

## 面板灰字

| 文件 | 内容 | 留／删 | 理由 |
|---|---|---|---|
| 19-industry-cast.js | 雕模具面板：右下角的条：光标走到亮区里按 X… | 删 | 教怎么玩 |
| 19-industry-circuit.js | 芯片面板：选一个元件再点空格子放进去… | 删 | 教怎么玩 |
| 19-industry-nuke.js | 反应堆面板：一根燃料棒都没放 | 删 | 空着就看得出来 |
| 19-industry.js | 炉子面板：鼓风要有人拉风箱，或者装电动鼓风机　实际：大火 | 留 | 作者明确要的（炼钢缺条件） |
| 19-industry.js | 炉子面板：现在 N°C，升到 M°C 约要 S 秒 | 留 | 作者明确要的（窑升温估计） |
| 19-industry-ach.js | 成就表里的条件说明 | 留 | 成就表本身，不是提示 |
