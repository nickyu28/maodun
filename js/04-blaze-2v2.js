        // ══════════════ 超燃：2v2 一条命，先赢 5 局 ══════════════
        // 每日效果：按当天日期定一条全局手感修正，所有模式共用同一份——
        // 只动"跑多快、跳多高"这两个最通用、最不容易搞坏平衡的维度，不碰球的物理、
        // 平台机关这些跟"公平/关卡设计"绑死的数值。换个日期就换一条，明天又不一样。
        const DAILY_MODIFIERS = [
            // E1（10-06 作者定）：幅度都改小了，地图不用为每日效果另做一套
            { id: 'turbo', name: '风驰电掣', desc: '所有人跑得快一点', speedMul: 1.15, jumpMul: 1 },
            { id: 'moon', name: '月球重力', desc: '跳得更高更远', speedMul: 1, jumpMul: 1.25 },
            { id: 'slow', name: '举步维艰', desc: '所有人都慢了一点', speedMul: 0.9, jumpMul: 0.95 },
            { id: 'hop', name: '弹簧腿', desc: '走路照常，跳得更高', speedMul: 1, jumpMul: 1.35 },
            { id: 'rush', name: '全员疾跑', desc: '速度和跳跃都往上提一点', speedMul: 1.1, jumpMul: 1.1 },
            { id: 'normal', name: '平常日子', desc: '今天没有特殊效果', speedMul: 1, jumpMul: 1 }
        ];
        function computeDailyModifier() {
            let key = new Date().toDateString();
            let hash = 0;
            for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
            return DAILY_MODIFIERS[hash % DAILY_MODIFIERS.length];
        }
        const DAILY_MOD = computeDailyModifier();

        const BLAZE = {
            size: 21, eye: 9, hp: 100, speed: 36, roundsToWin: 10, resetDelay: 0,
            // 普攻：空格。剑/回血/抗伤是近战小挥砍；弓箭手不一样 —— 弓天生是远程，
            // 普攻就该是一箭，不该跟别人一样贴脸砍。
            // 攻击力：所有人的普攻伤害直接等于这个数
            atk: 10, atkCd: 0.8, atkRange: 14,
            bowShotCd: 0.8, bowShotRange: 10 * 8, bowShotSpeed: 260,   // 普通箭：会被墙挡住
            // 弓 1 技能（左键）：无视墙体的大狙，锁定最近的敌人，射程约地图边长的 1/3
            bowMissileDmg: 10, bowMissileRange: 10 * 8, bowMissileCd: 5, bowMissileSpeed: 300,
            bowRangeStep: 8, bowStackMax: 5, bowIdleReset: 5,
            swordDmg: 20, swordCd: 10, swordStun: 1, swordDash: 5 * 8, swordStep: 2, swordStackMax: 3,
            // 治疗一律按「最大生命的百分比」算，不再是固定数字
            healPct: 0.10, healCd: 7, healRange: 6 * 8, healBuff: 1.5, healBuffTime: 5,
            // 抗伤：1 技能是范围眩晕，2 技能是护盾
            tankStunRange: 5 * 8, tankStunTime: 1, tankBlockCd: 5, tankBlockCut: 0.2, tankBlockTime: 5, tankCut: 0.3,
            // 护盾初始 = 最大生命 50%，10 秒整掉完（每秒掉最大生命的 5%）
            tankShieldPct: 0.5, tankShieldSec: 10, tankShieldCd: 20,
            // 2 技能
            hitRange: 2 * 8,                                   // 单体近身技能的够到距离
            bow2As: 0.10, bow2Time: 7, bow2Cd: 15,
            sword2Dmg: 10, sword2Stun: 1, sword2Cd: 7,
            heal2Dmg: 10, heal2Range: 6 * 8, heal2Cd: 5,
            // ── 保命猫盾 ──
            guardDashDist: 2 * 8, guardDashDmg: 15,
            guardDashCharges: 3, guardDashWindow: 5, guardDashCd: 10,
            guardRewindBack: 5, guardRewindCd: 20, guardSnapEvery: 0.25,
            // ── 控制猫盾 ──
            ctrlHookRange: 8 * 8, ctrlHookDmg: 15, ctrlHookPull: 150, ctrlHookStun: 1, ctrlHookCd: 10,
            ctrlStunRange: 5 * 8, ctrlStunDmg: 10, ctrlStunTime: 3, ctrlStunCd: 15,
            // ── 刺客猫盾 ──
            // ── 位移猫盾 ──
            // 它的两个技能都不看冷却，只看「充能」：充能全靠跑，跑够了才有一次位移。
            // 用掉就清零，也存不下第二次 —— 站着不动就等于没有技能。
            ffaAiFloor: 0.60,         // 乱斗的 AI 至少这个水平，不然 15 个木桩没意思
            aiFleeHp: 0.30, aiFleeBack: 0.55,         // AI 掉到三成血就跑，回到五成半才敢再上
            shiftChargeDist: 100,                     // 攒满一次充能要跑多远（基础移速下大约 2.8 秒）
            shiftBaseSpeed: 0.10,                     // 移速永久基础加成：不用等任何条件，一上场就比别人快
            shiftPassiveEvery: 20, shiftPassiveStep: 0.05, shiftPassiveCap: 1.0,   // 每 20 秒再永久 +5%，最多 +100%
            shiftCd: 1,                               // 只是防手抖连点，不是真正的门槛
            shiftDashDist: 5 * 8, shiftDashDmg: 12,   // 1 技能：贯影
            shiftLeapRange: 8 * 8, shiftLeapDmg: 15, shiftLeapBack: 8,   // 2 技能：跃击
            shiftFuncSpeed: 0.20,                     // 专属功能卡：移速 +20%（移速快 = 充能快）
            shiftSpeedBuff: 0.10, shiftSpeedTime: 2,  // 专属数值卡「疾风」
            // ── 工程猫盾 ──
            engBuildDmg: 0.15, engBuildCdr: 0.08, engBuildMax: 3,   // 被动：场上每个建筑给的加成
            engTurretCd: 12, engTurretLife: 15, engTurretHp: 40,
            engTurretRange: 8 * 8, engTurretCd2: 1.0, engTurretMax: 2,
            engWallCd: 8, engWallLife: 8, engWallHp: 60, engWallDist: 3 * 8,
            engBoomDmg: 20, engBoomRange: 4 * 8, engBoomStun: 1,
            // ── 镜猫盾 ──
            mirBlockT: 1.5, mirBlockCd: 10,
            mirBlockCut: 0.70,                        // 格挡期间受到的伤害 −70%
            mirBlockSlow: 0.15, mirBlockSlowT: 2,     // 挡下的攻击者减速 15% 两秒
            mirBlockStun: 0.5,                        // 外加一小段眩晕，不然减速太没存在感
            mirSwapRange: 8 * 8, mirSwapCd: 14, mirSwapStun: 1,
            mirDashWindow: 3, mirDashDist: 3 * 8, mirDashDmg: 10,
            mirBlockBonus: 0.3, mirWideRange: 5 * 8,   // 镜的专属卡
            engTimeBonus: 5, engBoomOnDeath: 25,       // 工程的专属卡
            mirEchoCd: 15, mirEchoWeakT: 3,        // 余像：15 秒攒一层，最多一层，触发后削攻击者的输出
            assassinInvisTime: 7, assassinInvisCd: 15,
            assassinBurstMul: 2, assassinBurstRange: 3 * 8, assassinBurstCd: 20,
            // ── 法师猫盾 ──
            mageRoundDmg: 5,                          // 法师被动：每过一局，伤害 +5
            mageLaserMul: 1.5, mageLaserRange: Math.round(21 * TILE / 3), mageLaserWidth: 10, mageLaserCd: 10,
            mageBlinkDist: 4 * 8, mageBlinkCd: 10,
            // 毒圈（地图机制，不是角色 cd，不跟着改）
            poisonStart: 300, poisonMin: 0, poisonRate: 3, poisonDps: 6, poisonDelay: 8,
            // ── 乱斗 ──
            ffaCount: 16,             // 单排混战的人数
            ffaSize: 37,              // 乱斗的地图比 2v2 大一大圈，16 个人才站得开
            ffaWallRuns: 14,          // 撒几段墙（每段还会镜像一份）
            ffaWallMin: 3, ffaWallMax: 6,
            ffaPillars: 5,            // 再补几根单独的柱子
            ffaTime: 480,             // 一局 8 分钟
            ffaShopN: 3,              // 商店同时上架几件
            ffaPriceStat: 30, ffaPriceFunc: 60,       // 数值卡便宜，功能卡贵
            ffaMoneyKill: 30, ffaMoneyAssist: 30,     // 打人赚钱
            ffaMoneyDeath: 25, ffaMoneyTick: 30,      // 死了也给一点，另外每半分钟进一次账
            ffaRefreshBase: 30, ffaRefreshStep: 20,   // 刷新价：30 起步，之后每刷一次 +20
            ffaStartMoney: 60,
            // ── 箱子 ──
            ffaChestEvery: 30,        // 多久刷一个箱子
            ffaChestMax: 8,           // 场上最多几个
            ffaChestMoney: 40,        // 打碎一个多少钱
            ffaChestHp: 60,           // 箱子有血，得打碎
            ffaChestHitR: 16,         // 打到多近算命中箱子
            ffaGoldChance: 0.22,      // 多大概率刷成金箱
            ffaGoldPickN: 5,          // 金箱给的免费选卡是几选一
            ffaCustomPrice: 400,      // 商店里「任选一张」的价钱
            ffaSpawnInvul: 2,         // 复活后的无敌时间
            ffaSpawnMargin: 0.8,      // 复活点必须落在毒圈半径的这个比例以内
            bodyR: 5,                 // 人的碰撞半径：两个人中心离得比 2×这个近就互相顶开
            sepForce: 60,             // 顶开的速度（单位/秒）
            minRoom: 5,               // 脚下这片空地至少要连通这么多格，不然算「被围死」
            kbForce: 90,              // 击退力度，固定值，跟伤害无关
            kbCritMul: 1.8,           // 暴击的击退更狠
            kbTime: 0.16,             // 击退持续多久
            hurtAnimT: 0.18,          // 挨打后仰 + 闪红持续多久
            // ── 葬场 ──
            tombCount: 8,             // 几个人
            tombSize: 27,             // 场地边长（格）
            tombTime: 420,            // 一局 7 分钟
            tombSight: 24,            // 能看见人的距离：3 身位
            tombBeamT: 8,             // 死亡光柱亮多久，灭了就变墙
            tombLitT: 1.5,            // 挨打之后暴露多久
            tombAtkLitT: 1.2,         // 打人的那一方也会亮 —— 开火就是暴露自己
            tombKillLitT: 3,          // 拿到人头，亮得更久
            tombGlowSight: 64,        // 发光的东西能穿墙看多远：8 身位
            tombWallExtra: 0,         // 一次死亡只封一格，不再往四周摊
            // ── 立法 ──
            lawCount: 6,              // 6 个人
            lawShow: 7,               // 桌上摆 7 条，每人选一条，剩一条没人要
            lawSize: 23,
            lawTime: 300,             // 5 分钟
            lawGlassHp: 0.34,         // 玻璃：血量剩三分之一
            lawTankHp: 2.0, lawTankDmg: 0.6,   // 高血低伤
            lawPctDmg: 0.05,          // 破防：技能附带对方 5% 最大生命
            lawStillT: 2, lawStillDps: 12,     // 站着就死
            lawCallEvery: 10, lawCallT: 1.5,   // 点名：每 10 秒亮 1.5 秒
            lawLitMul: 1.5,           // 发光的时候挨打更疼
            lawPickTime: 10,          // 选规则的时间，超时自动随机一条
            ffaFinalT: 120,           // 最后这么多秒进入决赛
            ffaFinalLives: 3,         // 决赛每人几条命，用光出局
            ffaPoisonMin: 110,        // 乱斗毒圈收到这里就不收了，别把所有人挤成一坨
            ffaPickEvery: 30,         // 每半分钟白送一次选卡机会
            ffaRespawn: 10,           // 死了 10 秒复活，随机位置
            ffaKill: 2, ffaAssist: 2, ffaDeath: -1,
            ffaAssistWindow: 5,       // 死前这几秒内的助攻才算
            debuffSlowT: 3, debuffSlow: 0.30,     // 迟滞：命中后对方变慢
            debuffWoundT: 4, debuffWound: 0.50,   // 重创：命中后对方治疗减半
            debuffWeakT: 3, debuffWeak: 0.25,     // 破胆：命中后对方伤害变低
            ringH: 70,                                // 毒圈那堵墙有多高
            ffaPoisonDelay: 60, ffaPoisonRate: 1.4,   // 乱斗：先给一分钟，然后慢慢收
            poisonNoFlee: 120,                        // 圈小到这个程度之后，AI 不再回身逃
            // 局间加成：每局结束后选一项，永久生效到本场结束
            perkPickTime: 10,
            // ── 数值卡 ──
            perkHp: 100, perkDmg: 20,                 // 通用
            perkAs: 0.10,                             // 远程专属：攻速 +10%
            perkSwordStun: 1,                         // 剑专属：1 技能眩晕 +1 秒
            perkHealPct2: 0.10,                       // 回血专属：回血量 +10%
            perkTankMax: 0.2,                         // 抗伤专属：每回合生命上限 ×1.2
            perkCut: 0.10,                            // 抗伤专属：减伤 +10%
            perkLifesteal: 0.15,                      // 保命专属：吸血 +15%
            perkCtrlTime: 0.1,                        // 控制专属：控制时长 +0.1
            perkInvisAtk: 5,                          // 刺客专属：隐身每秒攻击力 +5
            poisonHealMul: 0.5,                       // 站在毒圈外，一切治疗减半
            // ── 功能卡 ──
            perkHealCastPct: 0.02,                    // 通用：放技能回 2% 最大生命
            perkGlassDmg: 0.40, perkGlassHp: 0.30,    // 通用：伤害 +40%，生命上限 −30%（最多叠 3 张）
            // ── 一批专门加输出的功能卡 ──
            perkWinDmg: 50,                           // 每赢一局，伤害 +50
            perkFullHpAt: 0.90, perkFullHpDmg: 0.40,  // 先手：专打满血的人
            perkSkillDmg: 0.30,                       // 专精：只加技能伤害
            // ── 暴击一套 ──
            critMulBase: 1.5,                         // 暴击基础倍率
            perkCritChance: 0.30,                     // 功能卡 暴击：暴击率 +30%
            perkCritMulBig: 0.5,                      // 功能卡 会心：暴击倍率 +0.5（1.5 倍变 2 倍）
            perkCritHealChance: 0.30,                 // 功能卡 嗜血：暴击后再掷一次，这个概率才回血
            perkCritHealPct: 0.20,                    // 功能卡 嗜血：回 20% 最大生命
            perkSwapToMul: 1.0,                       // 功能卡 换算：暴击倍率 += 当前暴击率 × 这个数（常驻，实时算）
            perkCritRate: 0.15,                       // 数值卡 暴击率 +15%
            perkCritPow: 0.50,                        // 数值卡 暴击倍率 +0.5
            // ── 生命 / 冷却 / 伤害 一批 ──
            perkBulkHp: 200, perkBulkSpeed: 0.10,     // 巨力：换命的移速
            perkHpDmgPer: 100, perkHpDmgAdd: 5,       // 血怒：每 100 上限换 5 伤害
            perkDmgCdPer: 10, perkDmgCdAdd: 0.05, perkDmgCdMax: 0.30,   // 提速：伤害换冷却
            perkAtkCdrShare: 0.5, perkAtkCdrMax: 0.30,                  // 贯通：冷却缩减分一半给普攻
            perkConvHp: 0.20, perkConvCdr: 0.20,      // 转化：拿上限换冷却
            perkArmor: 0.15,                          // 护甲：减伤 +15%
            perkCutUni: 0.05,                         // 数值卡 减伤 +5%
            perkTripleMul: 2, perkTripleEvery: 3,     // 三连：每第 3 下普攻翻倍
            perkSurgeMul: 0.5,                        // 怒涛：技能之后那一下普攻
            perkOpenerT: 10, perkOpenerDmg: 0.30,     // 先锋：开局那阵子
            perkEndurePer: 30, perkEndureAdd: 10,     // 持久：拖得越久越强
            perkRefundCd: 0.3,                        // 回气：命中削冷却
            perkBastionAt: 0.80, perkBastionCut: 0.25,// 壁垒：血厚时更硬
            perkHpPct: 0.15,                          // 数值卡 生命上限 +15%
            perkDmgPct: 0.15,                         // 数值卡 伤害 +15%
            // ── 双刃卡：好处很大，代价也很大 ──
            perkGaleSpeed: 0.40, perkGaleHp: 0.25,          // 疾风
            perkLastDmg: 1.20, perkLastCut: 0.30,           // 孤注：队友死光之后
            perkLuckyMul: 1.5,                        // 随机强化卡：抽到的那张效果乘这个数
            perkDrawN: 5,                             // 每回合发这么多张
            perkRerolls: 100,                           // 每回合能换几次牌
            perkNoRepeat: 3,                          // 最近这几手发过的牌不再出现
            perkHealPct: 0.15,                        // 回血专属：治疗量 +15%
            perkBowStack: 3,                          // 远程专属：被动层数上限 +3
            perkSwordExec: 0.01,                      // 剑专属：2 技能额外 1% 最大生命伤害并回等量
            perkTankSkill: 0.01,                      // 抗伤专属：技能额外 1% 最大生命伤害
            perkCtrlExtra: 0.002,                     // 控制专属：附带 0.2% 最大生命的额外控制
            perkDashRange: 2 * 8,                     // 保命专属：闪身距离 +2 身位
            perkBurstMul: 1.5, perkBurstLock: 3,      // 刺客专属：爆发 ×1.5，隐身中+退出 3 秒不能用
            perkLaserWidth: 6,                        // 法师专属：激光变宽
            perkBlinkDist: 2 * 8,                     // 法师专属：瞬移距离 +2 身位
            // ── 新增通用卡 ──
            perkCdr: 0.15, perkCdrStatMax: 0.60,      // 数值卡：冷却缩减 +15%，这一路最多 60%
            perkToughHp: 0.30, perkToughDmg: 0.20,    // 功能卡：生命上限 +30%，伤害 −20%
            perkWinHp: 100,                           // 功能卡：每回合胜利时生命上限 +100
            // ── 新一批通用卡（全部只能选一次）──
            perkRagePct: 0.30, perkRageDmg: 0.50,     // 背水：残血时输出暴涨
            perkExecPct: 0.25, perkExecDmg: 0.60,     // 处决：专杀残血
            perkTenacity: 0.50,                       // 韧性：控制时长减半
            perkRegenDelay: 5, perkRegenPct: 0.03,    // 再生：脱战自愈
            perkBackstab: 0.50,                       // 背刺：绕后收益
            perkSpeed: 0.15,                          // 疾行：移速
            // 被动
            guardRevivePct: 0.05,                     // 保命：每回合一次免死，回到 5% 最大生命
            ctrlStunGrow: 0.1, ctrlStunGrowMax: 5,    // 控制：每次普攻/眩晕命中，下次眩晕 +0.1，最多 5 层
            assassinPanicPct: 0.10,                   // 刺客：血量低于 10% 触发一次刷新 + 隐身
            // 三层楼：楼层不显示、不加成任何数值，纯靠地形本身让站位有高低之分
            floors: 2, floorH: 40, shaftRadius: 26, teleCd: 1.2,
            jumpV: 46, gravity: 150,      // 跳跃：纯位移表达，不影响任何命中判定
            accel: 0.12, brake: 0.15,     // 惯性：比竞速轻得多，重了走位就变成开船
            camBack: 34, camUp: 14,
            aimY: 7, rangeY: 6
        };

        // 地图中心那根柱子挖空当竖井：三层贯通，从上往下能打穿，反过来不行。
        // 只有双方都站在竖井范围内才算「够得着」——不是随便哪个角落都能开黑枪。
        const BLAZE_SHAFT = { x: 10, z: 10 };
        let blazeSafeTile = [];   // 每层一个：离竖井最近、真正能站的格子

        function blazeFindSafeTile(fl) {
            let c = maze[fl][BLAZE_SHAFT.z][BLAZE_SHAFT.x];
            if (c && c.type === 0) return { x: BLAZE_SHAFT.x, z: BLAZE_SHAFT.z };
            for (let r = 1; r < 6; r++) {
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    let x = BLAZE_SHAFT.x + dx, z = BLAZE_SHAFT.z + dz;
                    if (x < 1 || z < 1 || x > mSize - 2 || z > mSize - 2) continue;
                    let cell = maze[fl][z] && maze[fl][z][x];
                    if (cell && cell.type === 0) return { x: x, z: z };
                }
            }
            return { x: BLAZE_SHAFT.x, z: BLAZE_SHAFT.z };
        }

        // 楼梯：走近就直接换层。0<->1 两处、1<->2 两处，两侧对称，
        // 想上三楼必须先经过二楼，没有能一步登顶的近道（近道是传送门的事）。
        let BLAZE_STAIRS = [];

        // 传送门：3 对。一对上下楼（还顺带换到对角），另外两对分别是一楼、二楼
        // 各自的同层捷径，两头拉到地图两端。走近自动传送，传完有个短暂冷却防止反复横跳。
        let BLAZE_TELEPORTS = [];

        // 楼梯、传送门、竖井的位置全按地图边长算出来 —— 这样换个尺寸
        // （2v2 用 21，乱斗用 31）不用另抄一份坐标。
        function blazeLayout(size) {
            let mid = Math.floor(size / 2), lo = 3, hi = size - 4;
            BLAZE_SHAFT.x = mid; BLAZE_SHAFT.z = mid;
            BLAZE_STAIRS = [
                { x: hi, z: lo, fA: 0, fB: 1 },
                { x: lo, z: hi, fA: 0, fB: 1 }
            ];
            BLAZE_TELEPORTS = [
                { a: { x: hi - 1, z: lo + 2, floor: 0 }, b: { x: lo + 1, z: hi - 2, floor: 1 }, color: 0x00e5ff },
                { a: { x: lo, z: mid, floor: 0 }, b: { x: hi, z: mid, floor: 0 }, color: 0xff4081 },
                { a: { x: mid, z: lo, floor: 1 }, b: { x: mid, z: hi, floor: 1 }, color: 0xb388ff }
            ];
        }

