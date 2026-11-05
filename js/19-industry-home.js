// 猫盾工业：石屋（docs/home-expand.md 分步第 1 步）。放在 19-industry-pond.js 后面。
// 工作台 石头 50 + 木头 10（悠闲 石头 25 + 木头 5）→ 石屋，6 × 6 米，保暖 9（木屋 6、砖房 12）。跟别的房子一起算上限。
// 扩展家园、石墙、石地板（分步第 2、3 步）这次没做：基地现在是按中心对称算边界的，往一边扩要改很多地方。
        IND_HOUSE.stone = { name: '石屋', w: 6, d: 6, warm: 9, wall: 0x9e9e9e, roof: 0x616161 };
        IND_ITEMS_RAW.house_stone = { name: '石屋', col: 0x9e9e9e, house: 'stone', use: '放下就是一间房，保暖 9' };
        IND_CRAFT.push({ out: 'house_stone', in: { stone: 50, wood: 10 }, hard: true }, { out: 'house_stone', in: { stone: 25, wood: 5 }, casual: true });
