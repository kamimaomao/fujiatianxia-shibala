/**
 * 《富甲天下：十八啦！》MVP 静态配置、棋盘格点、角色卡牌与地道台味台词库
 * 100% 兼容 file:// 直接打开与 Node 无头模拟环境（零 ES Module / 零 fetch）
 */
(function (root) {
  'use strict';

  var FTX = (root.FTX = root.FTX || {});

  // 28 张真实 PNG 资产标准相对路径映射（与 @codex-assets / @codex-world / @mvp-ui 100% 对齐）
  var ASSETS = {
    chars: {
      liubei_piece: './assets/chars/liubei_piece.png',
      liubei_happy: './assets/chars/liubei_happy.png',
      liubei_cry: './assets/chars/liubei_cry.png',
      dongzhuo_piece: './assets/chars/dongzhuo_piece.png',
      caocao_chariot: './assets/chars/caocao_chariot.png',
      sunquan_chariot: './assets/chars/sunquan_chariot.png',
      bankrupt_pants: './assets/chars/bankrupt_pants.png',
      zhangfei_horse: './assets/chars/zhangfei_horse.png',
      zhaoyun_horse: './assets/chars/zhaoyun_horse.png',
      lvbu_horse: './assets/chars/lvbu_horse.png',
      xiahoudun_horse: './assets/chars/xiahoudun_horse.png',
      zhugeliang_fan: './assets/chars/zhugeliang_fan.png',
      guojia_fan: './assets/chars/guojia_fan.png',
      mind_demon: './assets/chars/mind_demon.png',
      boss_caocao_mecha: './assets/chars/boss_caocao_mecha.png'
    },
    world: {
      board_backdrop: './assets/world/board_backdrop.png',
      city_lv1: './assets/world/city_lv1.png',
      city_lv3: './assets/world/city_lv3.png',
      city_lv5: './assets/world/city_lv5.png',
      corner_start: './assets/world/corner_start.png',
      corner_pot: './assets/world/corner_pot.png',
      corner_casino: './assets/world/corner_casino.png',
      corner_gov: './assets/world/corner_gov.png',
      bldg_arrow_tower: './assets/world/bldg_arrow_tower.png',
      bldg_poop_god: './assets/world/bldg_poop_god.png',
      bldg_market: './assets/world/bldg_market.png',
      icon_fortune: './assets/world/icon_fortune.png',
      icon_debt_team: './assets/world/icon_debt_team.png'
    }
  };

  // 品阶色标与双编码圆点（守总纲 3.2 色弱友好规范）
  var RARITY = {
    N: { code: 'N', name: '凡品', color: '#9AA3AF', dots: 0, sellFactor: 0.2 },
    R: { code: 'R', name: '良品', color: '#3B82F6', dots: 1, sellFactor: 0.5 },
    SR: { code: 'SR', name: '奇品', color: '#A855F7', dots: 2, sellFactor: 1.2 },
    SSR: { code: 'SSR', name: '绝品', color: '#F5B301', dots: 3, sellFactor: 3.0 },
    UR: { code: 'UR', name: '神品', color: '#E8452C', dots: 4, sellFactor: 8.0 }
  };

  // 城池规模 Lv.1~5 阶梯表（对齐总纲 3.4 与 02 表 4-1~4-3）
  var CITY_SCALE = {
    1: { level: 1, stepCostFactor: 1.0, cumCostFactor: 1.0, tollMult: 0.25, taxRate: 0.05, slots: 1, garrisonFactor: 0.30, defenseFactor: 0.00, img: ASSETS.world.city_lv1 },
    2: { level: 2, stepCostFactor: 0.5, cumCostFactor: 1.5, tollMult: 0.50, taxRate: 0.08, slots: 1, garrisonFactor: 0.40, defenseFactor: 0.10, img: ASSETS.world.city_lv1 },
    3: { level: 3, stepCostFactor: 1.0, cumCostFactor: 2.5, tollMult: 1.00, taxRate: 0.12, slots: 2, garrisonFactor: 0.55, defenseFactor: 0.20, img: ASSETS.world.city_lv3 },
    4: { level: 4, stepCostFactor: 2.0, cumCostFactor: 4.5, tollMult: 2.00, taxRate: 0.18, slots: 2, garrisonFactor: 0.70, defenseFactor: 0.35, img: ASSETS.world.city_lv3 },
    5: { level: 5, stepCostFactor: 4.0, cumCostFactor: 8.5, tollMult: 4.00, taxRate: 0.25, slots: 3, garrisonFactor: 0.85, defenseFactor: 0.50, img: ASSETS.world.city_lv5 }
  };

  // 2D6 点数精确组合数（总计 36）
  var DICE_2D6_WAYS = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1
  };

  // 天下四州（连城倍率：2城 ×1.5，全州垄断 ×2.0）
  var REGIONS = {
    yizhou: { id: 'yizhou', name: '益州', side: '西边', color: '#22C55E', tiles: [1, 2, 4, 6] },
    zhongyuan: { id: 'zhongyuan', name: '中原', side: '北边', color: '#EF4444', tiles: [8, 10, 13] },
    jiangdong: { id: 'jiangdong', name: '江东', side: '东边', color: '#3B82F6', tiles: [15, 16, 18, 20] },
    jingzhou: { id: 'jingzhou', name: '荆州', side: '南边', color: '#F59E0B', tiles: [22, 24, 26] }
  };

  var TERRAIN_NAMES = { land: '陆', water: '水', forest: '林' };

  /**
   * 8×8 外环顺时针坐标计算辅助：
   * 0: 左下角 [8,1] -> 1..6: 左边向上 [7..2, 1] -> 7: 左上角 [1,1]
   * -> 8..13: 顶边向右 [1, 2..7] -> 14: 右上角 [1,8] -> 15..20: 右边向下 [2..7, 8]
   * -> 21: 右下角 [8,8] -> 22..27: 底边向左 [8, 7..2]
   */
  function calcGridPos(idx) {
    if (idx === 0) return { row: 8, col: 1 };
    if (idx >= 1 && idx <= 6) return { row: 8 - idx, col: 1 };
    if (idx === 7) return { row: 1, col: 1 };
    if (idx >= 8 && idx <= 13) return { row: 1, col: idx - 6 };
    if (idx === 14) return { row: 1, col: 8 };
    if (idx >= 15 && idx <= 20) return { row: idx - 13, col: 8 };
    if (idx === 21) return { row: 8, col: 8 };
    return { row: 8, col: 29 - idx }; // 22->col 7 ... 27->col 2
  }

  // 0~27 号共 28 格标准方环棋盘（严格对齐 02 表 3-1）
  var RAW_TILES = [
    { idx: 0, name: '大营·起点', type: 'start', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.corner_start, desc: '经过领俸禄与税收并开启置业时间；精准停靠额外赏半份俸禄当全勤奖！' },
    { idx: 1, name: '涿县草鞋铺', type: 'city', tier: '县城', region: 'yizhou', basePrice: 600, terrain: 'land', initOwner: 'player', initLevel: 1, worldImg: ASSETS.world.city_lv1, desc: '刘皇叔祖传草鞋老店，买一双送一段哭穷身世。' },
    { idx: 2, name: '绵竹', type: 'city', tier: '县城', region: 'yizhou', basePrice: 600, terrain: 'forest', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '益州首圈黄金抢地县城，林深竹茂易守难攻。' },
    { idx: 3, name: '铁口算命摊', type: 'fortune', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.icon_fortune, desc: '摇签筒抽上上签、中平签或下下签，不爽可塞支气运签逆天改签！' },
    { idx: 4, name: '汉中', type: 'city', tier: '郡城', region: 'yizhou', basePrice: 900, terrain: 'forest', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '巴蜀咽喉郡城，派林战猛将驻守威慑力拉满。' },
    { idx: 5, name: '庙口夜市摊', type: 'market', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.bldg_market, desc: '混摆神兵行头、棋盘锦囊与补兵大烧饼，魅力越高杀价越狠！' },
    { idx: 6, name: '成都', type: 'city', tier: '州府', region: 'yizhou', basePrice: 1200, terrain: 'land', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '西边天府地王！凑齐益州 4 城即享全州垄断 ×2.0 暴利收租。' },
    { idx: 7, name: '风水聚宝盆', type: 'pot', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.corner_pot, desc: '初始底池 1,500 两；全盘每次交过路费或赌场输钱注资 20%，踩中整碗抱走（吃加注放大）！' },
    { idx: 8, name: '洛阳', type: 'city', tier: '州府', region: 'zhongyuan', basePrice: 1200, terrain: 'land', initOwner: 'caocao', initLevel: 2, initGov: 'xiahoudun', worldImg: ASSETS.world.city_lv1, desc: '北边中原高危区开端！中原仅 3 城即可凑满垄断。' },
    { idx: 9, name: '街头心魔巷', type: 'demon', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.chars.mind_demon, desc: '刷出贪财小鬼与穷神，快斩爆装备触发左旧右新「即换即融」！' },
    { idx: 10, name: '陈留', type: 'city', tier: '郡城', region: 'zhongyuan', basePrice: 900, terrain: 'land', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '夹在洛阳与许昌之间的黄金钉子户地块，盖尊屎王神专熏曹老板！' },
    { idx: 11, name: '红尘奇遇亭', type: 'event', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.icon_fortune, desc: '市井两难抉择，前半程种下的因，后半程在渡口必结出爆笑因果！' },
    { idx: 12, name: '官渡补习班', type: 'school', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.corner_gov, desc: '缴交 1 份当圈俸禄学费，在体魄、谋略、魅力中任选一维永久 +6！' },
    { idx: 13, name: '许昌', type: 'city', tier: '州府', region: 'zhongyuan', basePrice: 1200, terrain: 'land', initOwner: 'caocao', initLevel: 2, isCapital: true, initGov: 'lvbu', worldImg: ASSETS.world.city_lv1, desc: '全盘头号鬼门关！大魏建设集团总部大楼，曹老板最爱升满 Lv.5 宰客。' },
    { idx: 14, name: '皇家大赌场', type: 'casino', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.corner_casino, desc: '十八啦大碗公：押大(×2)、押小(×2)、押七点或欢喜对(×4)，戒赌走人领 150 两茶水钱。' },
    { idx: 15, name: '建业', type: 'city', tier: '州府', region: 'jiangdong', basePrice: 1200, terrain: 'water', initOwner: 'sunquan', initLevel: 2, isCapital: true, initGov: 'zhouyu', worldImg: ASSETS.world.city_lv1, desc: '江东水产行总部大本营，旱鸭子在此打地形野战吃大亏！' },
    { idx: 16, name: '吴郡', type: 'city', tier: '县城', region: 'jiangdong', basePrice: 600, terrain: 'water', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '江南富庶水乡县城，低门槛凑江东连城倍率。' },
    { idx: 17, name: '虎牢黑心收费站', type: 'special', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.chars.lvbu_horse, desc: '章节异变点：吕布拦路收道路养护费，可交钱拿减租贴，或骑木马单挑端走整箱买路财！' },
    { idx: 18, name: '会稽', type: 'city', tier: '县城', region: 'jiangdong', basePrice: 600, terrain: 'forest', initOwner: 'sunquan', initLevel: 1, initGov: 'taishici', worldImg: ASSETS.world.city_lv1, desc: '孙少东第二据点，与建业开局即形成江东 2 连城（×1.5）小垄断。' },
    { idx: 19, name: '城隍夜市摊', type: 'market', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.bldg_market, desc: '下半圈决战前补齐战斗奇策、攻城加农炮与神兵的关键夜市！' },
    { idx: 20, name: '柴桑', type: 'city', tier: '郡城', region: 'jiangdong', basePrice: 900, terrain: 'water', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '紧邻官府的江东水寨重镇，水战名将驻守固若金汤。' },
    { idx: 21, name: '州牧大官府', type: 'gov', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.corner_gov, desc: '三合一政务厅：免费领治安赏金补兵、踢馆补考、或半价捡漏破产霸主的法拍屋！' },
    { idx: 22, name: '襄阳', type: 'city', tier: '州府', region: 'jingzhou', basePrice: 1200, terrain: 'water', initOwner: 'caocao', initLevel: 1, initGov: 'zhangliao', worldImg: ASSETS.world.city_lv1, desc: '曹老板跨州南下飞地，水陆通衢的荆州州府。' },
    { idx: 23, name: '荒郊心魔林', type: 'demon', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.chars.mind_demon, desc: '出没算盘精与发财心魔，盘面升阶后必掉高阶奇品/绝品行头！' },
    { idx: 24, name: '江陵', type: 'city', tier: '郡城', region: 'jingzhou', basePrice: 900, terrain: 'water', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '荆州水路腰眼郡城，夺下江陵往往决定南线垄断归属。' },
    { idx: 25, name: '半仙算命摊', type: 'fortune', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.icon_fortune, desc: '过起点前最后一次求签改命、搏上上签横财的摊位。' },
    { idx: 26, name: '长沙', type: 'city', tier: '县城', region: 'jingzhou', basePrice: 600, terrain: 'forest', initOwner: null, initLevel: 0, worldImg: ASSETS.world.city_lv1, desc: '距起点仅 2 步的收官县城，盖座箭塔专门拦截即将过圈的霸主车驾！' },
    { idx: 27, name: '江湖奇遇渡', type: 'event', region: null, basePrice: 0, terrain: null, initOwner: null, initLevel: 0, worldImg: ASSETS.world.icon_fortune, desc: '因果重逢渡口：此前在红尘奇遇亭种下的善恶因果，极高概率在此兑现！' }
  ];

  var TILES = RAW_TILES.map(function (t) {
    var pos = calcGridPos(t.idx);
    return Object.assign({}, t, {
      gridRow: pos.row,
      gridCol: pos.col,
      regionName: t.region ? REGIONS[t.region].name : '公共',
      terrainName: t.terrain ? TERRAIN_NAMES[t.terrain] : '—'
    });
  });

  // 17 号格双章节异变配置（虎牢黑心收费站 / 赤壁连环船）
  var SPECIAL_MODES = {
    hulao: {
      id: 'hulao',
      tileName: '虎牢黑心收费站',
      worldImg: ASSETS.chars.lvbu_horse,
      desc: '经过必停！吕布拦路收「道路养护费」（0.8倍俸禄），交钱享本圈过路费8折，或骑木马单挑赢走整箱买路财！'
    },
    chibi: {
      id: 'chibi',
      tileName: '赤壁连环战船',
      worldImg: ASSETS.world.bldg_arrow_tower,
      desc: '水城铁索连环（同势力≥2水城过路费+25%）；踩中可「借东风」破除关底曹操水战装甲并获赠战斗奇策《火上浇油》！'
    }
  };

  // 可选主公 2 位：刘备 vs 董卓
  var LORDS = {
    liubei: {
      id: 'liubei',
      name: '刘备',
      title: '哭穷的草鞋摊老板',
      rarity: 'SSR',
      color: '#16A34A',
      badgeShape: 'circle', // 圆标（双编码）
      pieceImg: ASSETS.chars.liubei_piece,
      happyImg: ASSETS.chars.liubei_happy,
      cryImg: ASSETS.chars.liubei_cry,
      startTile: 1, // 起手占 1 号涿县草鞋铺
      initSilver: 3000,
      initTroops: 1000,
      stats: { physique: 42, strategy: 55, charm: 45, fame: 40 },
      creed: '仁义是天底下最好用的杀价工具！',
      traitName: '仁义草鞋',
      traitDesc: '魅力 45 杀价狠；自带正道命格（名望+40 开局解锁「开城劝降」）；回城探班收税翻倍并额外回兵 150；起手占涿县草鞋铺。',
      startCard: 'step_control',
      quotes: {
        start: '备只有草鞋和眼泪，各位乡亲多担待啦！',
        collectToll: ['歹势啦，小本生意，这笔算乡亲赞助汉室重建基金哦！', '二弟把门堵好！这位贵客心善，说要再包十双精装草鞋！'],
        payToll: ['夭寿哦！住一晚这么贵，你们城里是有送卤肉饭吃到饱哦？', '连阿斗的奶粉钱都掏空了，能拿草鞋抵零头吗？'],
        duelStart: ['备最不爱动刀动枪……三弟，拿折凳好好跟人家搏感情！', '仁义讲不通是吧？账本收起来，骑木马砍他！'],
        duelSlip: ['地上凉，先锋先替备拜个早年……歹势手滑啦！', '这不是摔跤，这是汉室祖传五体投地礼啦！'],
        shibala: ['十八啦！列祖列宗显灵，今晚草鞋摊全员加卤蛋！', '又来十八啦？憨人有憨福，哭穷真的有用耶！'],
        badLuck: ['呜呜，算命仙你是不是收了曹老板的红包？', '连老天爷都欺负摆地摊的！拿气运签来重哭一卦！'],
        bankrupt: ['紧酸！留得草鞋在，换个夜市继续哭！', '代志大条了，草鞋摊被查封，各位债主咱们下局见啦！']
      }
    },
    dongzhuo: {
      id: 'dongzhuo',
      name: '董卓',
      title: '西凉拆迁砂石大亨',
      rarity: 'UR',
      color: '#9333EA',
      badgeShape: 'diamond', // 菱形标
      pieceImg: ASSETS.chars.dongzhuo_piece,
      happyImg: ASSETS.chars.dongzhuo_piece,
      cryImg: ASSETS.chars.liubei_cry,
      startTile: 10, // 起手占 10 号中原陈留砂石场
      initSilver: 3600,
      initTroops: 1300,
      stats: { physique: 75, strategy: 35, charm: 15, fame: -35 },
      creed: '能用抢的，干嘛用买的？！',
      traitName: '西凉拆迁办',
      traitDesc: '体魄 75 单挑威猛；自带邪道命格（名望-35 开局即可「开芭乐票」免付赖账！）；强占无主空城享八折特权；攻城夺城保留全部建筑！',
      startCard: 'steal_gold',
      quotes: {
        start: '太师进城啰！哪间店面地段好，砂石车直接开过去！',
        collectToll: ['算你识相！太师地盘的空气都是镶金边的，拿钱来！', '才收这点塞牙缝都不够！把你身上破棉袄也扒下来！'],
        payToll: ['反了反了！敢收太师的钱，小心半夜砂石车堵你家门！', '哭夭（鬼叫抱怨）啊！抢了一辈子人，今天被你们当肥羊宰？！'],
        duelStart: ['能动手就别吵吵，把这不长眼的摊子给老子掀了！', '打赢赏十坛好酒，打输扣光今年伙食！'],
        duelSlip: ['太师吨位太重，把木马弹簧压塌了而已，换匹铁的来！', '你是不是没吃饱？！连个看门阿伯都砍不倒？！'],
        shibala: ['十八啦！哈哈哈，老天爷都怕太师掀桌子！', '通杀通杀！今晚郿坞烤全羊，谁也别想跑！'],
        badLuck: ['放屁！太师命硬得很，把签筒劈了当柴烧！', '庸医算命仙统统拖出去打！塞支签给老子重摇！'],
        bankrupt: ['紧酸！老子去夜市摆摊卖烤香肠东山再起！', '别扯我花裤衩啦！再扯真的一丝不挂了啦！']
      }
    }
  };

  // 盘面两大霸主（曹操、孙权）
  var HEGEMONS = {
    caocao: {
      id: 'caocao',
      name: '曹操',
      title: '大魏建设集团董事长',
      isMainBoss: true,
      color: '#DC2626',
      badgeShape: 'square', // 方标
      chariotImg: ASSETS.chars.caocao_chariot,
      bankruptImg: ASSETS.chars.bankrupt_pants,
      homeTile: 13, // 许昌主城
      initVault: 6800,
      targetNetWorth15: 36000,
      targetNetWorth8: 18000,
      preferredBuildings: ['market', 'plunder', 'arrow_tower'],
      combatStyle: 'field', // 统帅型
      quotes: {
        collectToll: '欢迎下榻大魏连锁名城，含公摊加电梯费，谢绝赊账！',
        payToll: '宁教我负天下人，休教天下人收我停车费！开发票！',
        buyCity: '地段不错，大魏建设集团全款拿下！',
        upgrade: '许昌二期封顶大吉，过路费翻倍啰！',
        troubleWin: '大魏法务部巡街，今天住你这间免单记账！',
        troubleLose: '夭寿，踢到铁板了！会计，赔双倍医药费快走！',
        paralyzed: '哎哟喂，保镖全中箭趴窝了，拖回许昌大修三刻！',
        mortgage: '资金链暂时周转不开，这座分店先抵给你抵债！',
        bankrupt: '战略性退市而已！紧酸——公章揣好去谯县借壳重来！'
      }
    },
    sunquan: {
      id: 'sunquan',
      name: '孙权',
      title: '江东水产行少东',
      isMainBoss: false,
      color: '#2563EB',
      badgeShape: 'triangle', // 三角标
      chariotImg: ASSETS.chars.sunquan_chariot,
      bankruptImg: ASSETS.chars.bankrupt_pants,
      homeTile: 15, // 建业主城
      initVault: 5200,
      preferredBuildings: ['granary', 'arrow_tower', 'market'],
      combatStyle: 'field',
      quotes: {
        collectToll: '江东活虾现捞现算，过路顺便带两斤大闸蟹走嘛！',
        payToll: '歹势啦周都督，这笔付完，水军下个月改划澡盆了……',
        buyCity: '靠水吃水，这处码头归我们江东水产行啰！',
        upgrade: '建业冷链扩建完工，外地船只加收停泊费哦！',
        troubleWin: '周都督算过了，今天这顿霸王餐稳赚不赔！',
        troubleLose: '哩咧冲啥（你在搞什么）？算盘打歪赔双倍啦！',
        paralyzed: '船桨被箭塔射断啦！快划回建业修船三刻！',
        mortgage: '代志大条了，把这座水寨过户抵债救急先！',
        bankrupt: '紧酸！回江东老家钓鱼，再也不出长江口了啦！'
      }
    }
  };

  // 可选先锋 2 位：张飞 vs 赵云
  var VANGUARDS = {
    zhangfei: {
      id: 'zhangfei',
      name: '张飞',
      title: '当阳折凳王',
      rarity: 'SSR',
      horseImg: ASSETS.chars.zhangfei_horse,
      duel: 96,
      field: 78,
      siege: 0.35, // 攻城值 +35%
      terrainApt: { land: 1.15, forest: 1.15, water: 0.85 },
      skillName: '当阳掀桌一板凳',
      passiveDesc: '单挑开场斗志 +15，暴击威慑单挑战力 +12%，单挑获胜额外吓出敌太守 180 两茶水费！',
      winQuotes: ['免单啦！顺便把你家招牌拆一块当茶水费！', '燕人张翼德在此，谁敢收俺大哥停车费？！'],
      slipQuotes: ['……俺是看地板脏，故意拿脸帮你们擦一下！', '哪个黑心木匠做的弹簧木马，卡裆了啦！']
    },
    zhaoyun: {
      id: 'zhaoyun',
      name: '赵云',
      title: '使命必达外送员',
      rarity: 'SSR',
      horseImg: ASSETS.chars.zhaoyun_horse,
      duel: 90,
      field: 88,
      siege: 0.30,
      terrainApt: { land: 1.15, forest: 1.0, water: 1.0 },
      skillName: '七进七出急送枪',
      passiveDesc: '使命必达：单挑落败赔付由 2T 降为 1.5T（省心敢刚！），且机关攻城获胜时 100% 保全城内全部既有建筑！',
      winQuotes: ['常山赵子龙使命必达，五星好评免过路费哦！', '少主还在竹篓里睡着，速战速决签收免单！'],
      slipQuotes: ['夭寿哦，低头看了一眼阿斗奶嘴，木马劈叉了！', '歹势歹势，外送超时滑倒，这把算意外啦！']
    }
  };

  // 随行军师与敌方军师
  var ADVISORS = {
    zhugeliang: {
      id: 'zhugeliang',
      name: '诸葛亮',
      title: '卧龙补习班名师',
      fanImg: ASSETS.chars.zhugeliang_fan,
      fieldBonus: 0.28, // 军师野战值 +28%
      seeThrough: 0.25, // 看破减损 25%
      terrainApt: { land: 1.15, forest: 1.30, water: 1.15 },
      desc: '羽扇纶巾嘴炮无敌：口斗技门槛减免 5 点，陆水林全地形适性优异，看破霸主手笔减损 25%。'
    },
    guojia: {
      id: 'guojia',
      name: '郭嘉',
      title: '大魏熬夜鬼才精算师',
      fanImg: ASSETS.chars.guojia_fan,
      fieldBonus: 0.25,
      seeThrough: 0.20,
      terrainApt: { land: 1.30, forest: 1.00, water: 0.90 },
      desc: '毒舌攻心鬼才：单挑口斗额外压低敌方斗志 10 点，皇家赌场与算命摊吉签率提升。'
    }
  };

  // 太守与守将名册（含我方 6 位候补太守 + 敌方镇守名将）
  var GOVERNORS = {
    guanyu: { id: 'guanyu', name: '关羽', title: '美髯公账房总管', faction: 'player', duel: 98, field: 0.25, siege: 0.25, ecoBonus: 0.18, terrainApt: { land: 1.15, water: 1.15, forest: 1.0 }, horseImg: ASSETS.chars.zhangfei_horse, bondWith: ['zhangfei', 'zhaoyun', 'huangzhong'], desc: '经营 +18%，镇守威慑极高' },
    huangzhong: { id: 'huangzhong', name: '黄忠', title: '定军山神射阿伯', faction: 'player', duel: 86, field: 0.20, siege: 0.30, ecoBonus: 0.12, terrainApt: { land: 1.15, water: 0.85, forest: 1.30 }, horseImg: ASSETS.chars.zhaoyun_horse, bondWith: ['guanyu', 'weiyan'], desc: '经营 +12%，林战王牌 ×1.3' },
    weiyan: { id: 'weiyan', name: '魏延', title: '子午谷抄近路狂人', faction: 'player', duel: 84, field: 0.22, siege: 0.22, ecoBonus: 0.10, terrainApt: { land: 1.15, water: 0.85, forest: 1.30 }, horseImg: ASSETS.chars.zhangfei_horse, bondWith: ['huangzhong'], desc: '经营 +10%，反骨凶悍善守山林' },
    ganning: { id: 'ganning', name: '甘宁', title: '锦帆海鲜大盘商', faction: 'player', duel: 85, field: 0.26, siege: 0.20, ecoBonus: 0.15, terrainApt: { land: 0.90, water: 1.30, forest: 1.00 }, horseImg: ASSETS.chars.zhaoyun_horse, bondWith: ['lusu'], desc: '经营 +15%，水战王牌 ×1.3' },
    lusu: { id: 'lusu', name: '鲁肃', title: '东吴散财老好人', faction: 'player', duel: 52, field: 0.18, siege: 0.15, ecoBonus: 0.25, terrainApt: { land: 1.00, water: 1.15, forest: 1.00 }, horseImg: ASSETS.chars.zhaoyun_horse, bondWith: ['ganning'], desc: '经营 +25%，包租流金牌掌柜' },
    diaochan: { id: 'diaochan', name: '貂蝉', title: '郿坞讨薪头牌歌姬', faction: 'player', duel: 58, field: 0.15, siege: 0.15, ecoBonus: 0.30, terrainApt: { land: 1.15, water: 1.00, forest: 1.00 }, horseImg: ASSETS.chars.zhaoyun_horse, bondWith: ['guanyu'], desc: '经营 +30%，决战连携对魔王特攻' },
    // 敌方专属守将
    lvbu: { id: 'lvbu', name: '吕布', title: '虎牢收费站扛霸子', faction: 'enemy', duel: 112, field: 0.20, siege: 0.20, ecoBonus: 0.10, terrainApt: { land: 1.30, water: 0.80, forest: 1.00 }, horseImg: ASSETS.chars.lvbu_horse, desc: '单挑凶神，水战旱鸭子' },
    xiahoudun: { id: 'xiahoudun', name: '夏侯惇', title: '独眼拆迁工头', faction: 'enemy', duel: 84, field: 0.22, siege: 0.25, ecoBonus: 0.12, terrainApt: { land: 1.15, water: 0.85, forest: 1.00 }, horseImg: ASSETS.chars.xiahoudun_horse, desc: '大魏铁卫，拔矢啖睛' },
    zhangliao: { id: 'zhangliao', name: '张辽', title: '合肥止啼店长', faction: 'enemy', duel: 88, field: 0.28, siege: 0.25, ecoBonus: 0.15, terrainApt: { land: 1.30, water: 1.00, forest: 1.15 }, horseImg: ASSETS.chars.xiahoudun_horse, desc: '威震逍遥津，能守善战' },
    zhouyu: { id: 'zhouyu', name: '周瑜', title: '江东水军总账房', faction: 'enemy', duel: 76, field: 0.32, siege: 0.25, ecoBonus: 0.20, terrainApt: { land: 1.00, water: 1.30, forest: 1.00 }, horseImg: ASSETS.chars.xiahoudun_horse, desc: '江东水战王牌统帅' },
    taishici: { id: 'taishici', name: '太史慈', title: '神亭岭快闪骑手', faction: 'enemy', duel: 82, field: 0.20, siege: 0.18, ecoBonus: 0.12, terrainApt: { land: 1.15, water: 1.15, forest: 1.15 }, horseImg: ASSETS.chars.lvbu_horse, desc: '弓马娴熟水陆皆通' },
    lizhangbo: { id: 'lizhangbo', name: '看门里长伯', title: '穿汗衫摇蒲扇大爷', faction: 'neutral', duel: 32, field: 0.0, siege: 0.0, ecoBonus: 0.0, terrainApt: { land: 1.0, water: 1.0, forest: 1.0 }, horseImg: ASSETS.chars.xiahoudun_horse, desc: '没派太守时临时看门的大爷' }
  };

  // 12 条军师场边「口斗技」地道台味互喷库（对齐 02 表 9-7，诸葛亮 vs 郭嘉）
  var KOUDOU_SKILLS = [
    { id: 'K01', name: '《夜市叫卖》', stat: 'strategy', req: 20, myMorale: 15, enemyMorale: -10, zhugeLine: '诸葛亮：「对面太守手上那把破刀夜市清仓三把五十，要不要顺便带块抹布？」', guojiaReply: '郭嘉捂脸：「靠，老板明明收我们曹丞相五百两一把！」' },
    { id: 'K02', name: '《算盘打歪》', stat: 'strategy', req: 20, myMorale: 10, enemyMorale: -15, zhugeLine: '诸葛亮：「老兄，你们老板上个月发你的薪水是不是拿冥币凑数的啊？」', guojiaReply: '郭嘉嘴角抽搐：「难怪早市买烧饼老板拿扫帚赶我！」' },
    { id: 'K03', name: '《发际线警告》', stat: 'charm', req: 25, myMorale: 15, enemyMorale: -15, zhugeLine: '诸葛亮：「风这么大，奉孝兄头顶那三根熬夜毛就别梳中分了，看着怪冷的！」', guojiaReply: '郭嘉捂头冠跳脚：「你才秃头！写PPT熬夜算工伤懂不懂？！」' },
    { id: 'K04', name: '《赌场黑历史》', stat: 'strategy', req: 30, myMorale: 20, enemyMorale: -15, zhugeLine: '诸葛亮：「听说郭奉孝昨晚在皇家赌场连押八把小全开大，裤腰带还是借夏侯惇的？」', guojiaReply: '郭嘉冷汗狂飙捂嘴：「夭寿哦，谁大嘴巴传出去的啦？！」' },
    { id: 'K05', name: '《芭乐支票》', stat: 'charm', req: 35, myMorale: 20, enemyMorale: -20, zhugeLine: '诸葛亮：「别替曹老板卖命啦，他画的升官大饼比洛阳锅盔还硬，来蜀汉包劳健保！」', guojiaReply: '敌太守木马一顿陷入沉思：「好像……有点道理哦？郭军师咱有劳保吗？」' },
    { id: 'K06', name: '《羞惭满面》', stat: 'strategy', req: 45, myMorale: 25, enemyMorale: -20, zhugeLine: '诸葛亮：「亮观奉孝印堂发暗、算盘缺珠，连九九乘法表都背不利索，也敢摇扇子？」', guojiaReply: '郭嘉一口枸杞茶喷在扇面上：「歹势，今天没喝冰美式发挥失常！」' },
    { id: 'K07', name: '《乌鸦铁嘴》', stat: 'strategy', req: 35, myMorale: 12, enemyMorale: -22, zhugeLine: '诸葛亮：「亮夜观天象，你胯下那匹木马左前腿螺丝没拧紧，三秒内必劈叉！」', guojiaReply: '敌太守死抓马脖子不敢挥刀：「代志大条，怎么真的在嘎吱晃？！」' },
    { id: 'K08', name: '《抓包私房钱》', stat: 'charm', req: 30, myMorale: 15, enemyMorale: -18, zhugeLine: '诸葛亮：「喂——你藏在战靴夹层那两百两私房钱，要不要亮写信告诉你家夫人呀？」', guojiaReply: '敌太守浑身一哆嗦差点跌下马：「诸葛先生饶命，我放水还不行吗！」' },
    { id: 'K09', name: '《祖宗查账》', stat: 'strategy', req: 48, myMorale: 20, enemyMorale: -25, zhugeLine: '诸葛亮：「查过了，贵城连续三圈漏报营业税，打完这场官府封条直接贴你脑门上！」', guojiaReply: '郭嘉急翻账本：「冤枉啊，那是董事长走的公摊报销科目！」' },
    { id: 'K10', name: '《鸡排冷掉》', stat: 'strategy', req: 15, myMorale: 22, enemyMorale: -8, zhugeLine: '诸葛亮：「将军砍快点！后厨刚炸好的脆皮大鸡排加辣，晚一秒就被主公偷吃光啦！」', guojiaReply: '郭嘉咽口水：「喂，分一块鸡排过来，本军师少喷两句行不行？」' },
    { id: 'K11', name: '《无中生有》', stat: 'strategy', req: 55, myMorale: 25, enemyMorale: -28, zhugeLine: '诸葛亮：「快看你背后！曹老板带着小姨子卷着许昌公款跑路啦！」', guojiaReply: '敌太守猛回头挨了一板凳：「靠北（抱怨），兵不厌诈也不是这么诈的吧！」' },
    { id: 'K12', name: '《骂死王朗》', stat: 'strategy', req: 60, myMorale: 30, enemyMorale: -30, zhugeLine: '诸葛亮：「皓首匹夫、苍髯老贼！占着茅坑不交税，今天连人带木马一并收归国有！」', guojiaReply: '郭嘉当场翻白眼把扇子一丢：「紧酸！这嘴皮子比机关炮还猛！」' }
  ];

  // 七种四系建筑蓝图（对齐 02 表 4-5）
  var BUILDINGS = {
    granary: {
      id: 'granary',
      name: '粮仓',
      series: '收租系',
      costFactor: 0.5,
      slots: 1,
      tollBonus: 0.0,
      taxBonus: 0.50,
      garrisonBonus: 0.30,
      worldImg: ASSETS.world.bldg_market,
      desc: '该城税收+50%、守军+30%，每次过圈为主公额外征兵「规模×40」。',
      note: '有粮才有兵，有兵讲话才大声。'
    },
    market: {
      id: 'market',
      name: '市集',
      series: '收租系',
      costFactor: 1.0,
      slots: 1,
      tollBonus: 0.15,
      taxBonus: 1.00,
      garrisonBonus: 0.0,
      worldImg: ASSETS.world.bldg_market,
      desc: '该城过路费+15%、税收+100%；回城探班时另得当圈俸禄的 25%。',
      note: '人潮就是钱潮，卤肉饭试吃不买的麻烦让一让。'
    },
    plunder: {
      id: 'plunder',
      name: '私掠站',
      series: '收租系',
      costFactor: 1.5,
      slots: 2,
      tollBonus: 0.25,
      taxBonus: 0.0,
      garrisonBonus: 0.0,
      worldImg: ASSETS.world.bldg_market,
      desc: '该城过路费+25%；霸主车驾路过不停照拔毛该城过路费的 10%！',
      note: '路过也算踩，这叫高速公路使用者付费。'
    },
    arrow_tower: {
      id: 'arrow_tower',
      name: '箭塔',
      series: '剥皮系',
      costFactor: 1.0,
      slots: 1,
      tollBonus: 0.0,
      taxBonus: 0.0,
      defenseBonus: 0.35,
      worldImg: ASSETS.world.bldg_arrow_tower,
      desc: '该城城防+35%；霸主车驾经过或停在射程内挨 1 箭（110×圈压），射归零当场「瘫痪」3 刻！',
      note: '射人先射马。他坐的是车？那就射保镖！'
    },
    altar: {
      id: 'altar',
      name: '天师坛',
      series: '剥皮系',
      costFactor: 1.5,
      slots: 2,
      tollBonus: 0.10,
      taxBonus: 0.0,
      worldImg: ASSETS.world.icon_fortune,
      desc: '过路费+10%；踩中交租者另被抽 5% 现金当香油钱（上限0.5T），守城单挑开场斗志+20。',
      note: '心诚则灵，钱包诚更灵。'
    },
    wind_orb: {
      id: 'wind_orb',
      name: '定风珠',
      series: '禁魔系',
      costFactor: 1.0,
      slots: 1,
      tollBonus: 0.0,
      taxBonus: 0.15,
      worldImg: ASSETS.world.corner_pot,
      desc: '该城免疫点名类「霸主手笔」（恶意并购/拆迁/落雷）与屎王神恶臭！',
      note: '风平浪静百毒不侵，专治曹老板强买强拆。'
    },
    poop_god: {
      id: 'poop_god',
      name: '屎王神',
      series: '恶搞系',
      costFactor: 1.0,
      slots: 1,
      uniqueGlobal: true,
      tollBonus: 0.0,
      taxBonus: 0.0,
      worldImg: ASSETS.world.bldg_poop_god,
      desc: '全盘限1尊！前后各 2 格内他人城池被熏绿：过路费-25%、税收-25%、守军-20%（本城太守捏鼻理财失效）。',
      note: '请神容易送神难。隔壁曹老板的房价，祂会负责。'
    }
  };

  // 22 条精选「政见」词条（覆盖收租包租 / 莽夫单挑 / 老千十八啦 / 通用正邪，对齐 02 表 6-2）
  var POLICIES = [
    { id: 'P01', name: '过路费年年涨，包租公笑嘻嘻', rarity: 'N', school: '收租', desc: '自家全部城池过路费 +15%。' },
    { id: 'P02', name: '路平灯亮水沟通', rarity: 'N', school: '收租', desc: '自家全部城池每圈税收 +30%。' },
    { id: 'P03', name: '主公探班，鸡排加蛋', rarity: 'R', school: '收租', desc: '回城探班多收的税银再 ×2，并补满该城守军与主公 150 兵力。' },
    { id: 'P04', name: '违章建筑，就地合法', rarity: 'R', school: '收租', desc: '置业时间内升级与盖楼造价 −25%，累计造价仍按原价计入身家炮火！' },
    { id: 'P05', name: '箭塔加盖顶楼，视野更好', rarity: 'R', school: '收租', desc: '箭塔射程扩至前后各 1 格，且对霸主车驾护卫伤害 +50%！' },
    { id: 'P06', name: '一州一霸，肥水不流外人田', rarity: 'SR', school: '收租', desc: '全州垄断时连城倍率由 ×2.0 飙升至 ×2.5！' },
    { id: 'P07', name: '收租强身，保养有方', rarity: 'SR', school: '收租', desc: '每收到 1,000 两过路费：主公兵力 +60，决战资产炮火 +2%（上限+30%）。' },
    { id: 'P08', name: '万炮齐发保证班', rarity: 'SSR', school: '收租', desc: '决战第一段，Lv.4~5 高级城池化作的资产炮火伤害 ×1.8！' },

    { id: 'P09', name: '先下手为强，后下手没便当', rarity: 'N', school: '莽夫', desc: '骑木马单挑开场我方斗志 +25。' },
    { id: 'P10', name: '打完收工，便当加卤蛋', rarity: 'N', school: '莽夫', desc: '每赢 1 场单挑或心魔战，主公体魄永久 +3（上限+30）。' },
    { id: 'P11', name: '厨房就是军火库', rarity: 'R', school: '莽夫', desc: '凡品、良品市井兵器（牙签/杀猪刀）的装备加值直接 ×3！' },
    { id: 'P12', name: '输人不输阵，赔钱打七五折', rarity: 'R', school: '莽夫', desc: '单挑与野战落败赔付降低 0.5T（最低只赔 1.0T）。' },
    { id: 'P13', name: '木马改装，排气管要大声', rarity: 'R', school: '莽夫', desc: '坐骑与头冠加值 ×2；决战第三段先锋冲阵连击数 +2。' },
    { id: 'P14', name: '赢了不只免单，还要拆招牌', rarity: 'SR', school: '莽夫', desc: '单挑获胜：拆掉敌城 1 级规模（Lv.1 则直接夺城易主！）并拿走半数造价！' },
    { id: 'P15', name: '打狗看主人，打赢找主人收钱', rarity: 'SR', school: '莽夫', desc: '单挑获胜：不仅免单，反从该霸主金库讹走 0.6T 精神损失费！' },
    { id: 'P16', name: '一个打十个，我说的', rarity: 'SSR', school: '莽夫', desc: '单挑战力直接 +25%，决战第三段先锋收尾连击数 +3！' },

    { id: 'P17', name: '欢喜对对碰，红包拿不完', rarity: 'N', school: '老千', desc: '每次掷出欢喜对，立领当圈俸禄的 60% 彩金！' },
    { id: 'P18', name: '衰到底，就会弹起来', rarity: 'N', school: '老千', desc: '立即获赠 1 支气运签，且气运签持有上限升至 4 支！' },
    { id: 'P19', name: '逢六进宝，六六大顺', rarity: 'R', school: '老千', desc: '每掷出 1 颗 6 点，当场进账当圈俸禄的 35%（十八啦拿双份）！' },
    { id: 'P22', name: '差一点也算对，做人别计较', rarity: 'SR', school: '老千', desc: '每圈首次掷出两骰只差 1 点（如 3+4）亦视同「欢喜对」触发彩金！' },
    { id: 'P23', name: '赌场当自己家，聚宝盆当自己碗', rarity: 'SR', school: '老千', desc: '风水聚宝盆与皇家大赌场的银两收益直接 ×2！' },
    { id: 'P24', name: '灌铅不算作弊，叫品管', rarity: 'SSR', school: '老千', desc: '一颗骰子的 1 点改刻为 6 点！「十八啦」概率翻倍，远离衰尾 1 点！' },

    { id: 'P25', name: '里长伯发便当，人人有份', rarity: 'R', school: '收租', desc: '每次过圈俸禄 +35%，且兵力补给翻倍。' },
    { id: 'P28', name: '稳赚不赔，骗你是小狗', rarity: 'SSR', school: '老千', desc: '每圈首回在加注 ×2/×3 下交过路费或赔款时，支出只按 ×1 计算！' }
  ];

  // ≥6 张棋盘锦囊（上限持 3 张，溢出自动折银 250 两）
  var BOARD_CARDS = {
    step_control: {
      id: 'step_control',
      name: '《安步当车》',
      rarity: 'SR',
      needParam: 'steps', // 1~6 步遥控
      price: 450,
      desc: '遥控骰子：指定下一次移动精准走 1~6 步（指哪打哪，专踩聚宝盆或躲鬼门关）！',
      quote: '算命仙顾骰子啰，说走几步就走几步！'
    },
    steal_gold: {
      id: 'steal_gold',
      name: '《顺手牵羊》',
      rarity: 'R',
      needParam: null,
      price: 380,
      desc: '妙手空空：当场从当前最有钱的霸主金库顺走 22% 现金（保底 600 两）塞进自己口袋！',
      quote: '曹老板荷包太鼓走路会歪，帮他减轻一点负担啦！'
    },
    equal_wealth: {
      id: 'equal_wealth',
      name: '《均富天下》',
      rarity: 'SSR',
      needParam: null,
      price: 750,
      desc: '社会主义铁拳：将主公与场上所有未破产霸主的现金加总后平分！（先花光钱盖楼再开直接暴富！）',
      quote: '有福同享有钱同花，各位大老板把金库交出来平分啰！'
    },
    turtle_block: {
      id: 'turtle_block',
      name: '《路障乌龟》',
      rarity: 'R',
      needParam: 'tileIdx', // 可选格号，不传默认放在前方或自家最肥巨城上
      price: 320,
      desc: '在自家最贵巨城（或指定格）摆一只慢吞吞路障乌龟：霸主车驾路过必被绊停踩雷交租！',
      quote: '乌龟爬马路——曹老板踩刹车，住一晚交钱再走啦！'
    },
    fire_camp: {
      id: 'fire_camp',
      name: '《火烧连营》',
      rarity: 'SR',
      needParam: null,
      price: 500,
      desc: '一把大火烧向主霸主最高级城池：蒸发其 40% 守军、挂 2 圈溃散白旗，并烧毁 1 座敌建筑！',
      quote: '风干物燥小心火烛，给大魏总部放个大烟花！'
    },
    god_possess: {
      id: 'god_possess',
      name: '《神明附体》',
      rarity: 'SR',
      needParam: null,
      price: 480,
      desc: '妈祖保佑 3 刻：期间踩敌城免交过路费 1 次，且收到过路费与聚宝盆收益 +50%！',
      quote: '天灵灵地灵灵，财神关公齐附体，逢凶化吉发大财！'
    }
  };

  // ≥4 张战斗奇策（木马单挑 2 秒高光窗 & 关底决战第三段可拍出，上限持 2 张）
  var COMBAT_CARDS = {
    swap_dragon: {
      id: 'swap_dragon',
      name: '《偷龙转凤》',
      rarity: 'SSR',
      price: 450,
      winRateBonus: 0.30,
      moraleSwing: 40,
      desc: '把敌太守手里的兵器掉包成夜市烤香肠！本场单挑胜算直接飙升 +30%（封顶95%）！',
      quote: '看招！咦，你手里怎么变成大肠包小肠了？！'
    },
    add_oil: {
      id: 'add_oil',
      name: '《火上浇油》',
      rarity: 'SR',
      price: 360,
      winRateBonus: 0.20,
      plunderRatio: 0.40,
      desc: '往木马弹簧喷辣椒油：单挑胜算 +20%，若获胜额外从敌霸主金库爆出 0.5T 金币（决战加2连击）！',
      quote: '火上浇油催油门，连人带钱袋一起撞飞啦！'
    },
    straw_slap: {
      id: 'straw_slap',
      name: '《草鞋糊脸》',
      rarity: 'R',
      price: 280,
      winRateBonus: 0.18,
      preventDoubleLoss: true,
      desc: '陈年包浆草鞋糊脸：单挑胜算 +18%，且万一失手落败也免除双倍惩罚（0 赔付全身而退）！',
      quote: '吃我一记八二年陈酿汗味草鞋！输了也不给钱，紧酸！'
    },
    redraw_fate: {
      id: 'redraw_fate',
      name: '《底牌重开》',
      rarity: 'SR',
      price: 380,
      winRateBonus: 0.22,
      twiceRoll: true,
      desc: '老千翻桌重算：胜算 +22% 并执行「两次检定取最优」（只要有一次过就判我方大胜）！',
      quote: '慢着！刚才裁判眨眼了，翻开底牌按咱们规矩算！'
    }
  };

  // 10 件即换即融四槽装备（含 brief 全部点名装备：牙签、木折凳、菜市场杀猪刀、青龙偃月刀、光剑、金箍棒、藤甲、虎头帽 + 纸箱甲、赤兔木马）
  var EQUIPMENTS = {
    toothpick: {
      id: 'toothpick', name: '牙签', rarity: 'N', slot: 'weapon', bonus: 6, isStreet: true,
      perk: '市井凡品：配政见《厨房就是军火库》加值翻三倍',
      note: '吃完卤肉饭顺手剔牙带的，伤害不高，侮辱性极强。'
    },
    butcher_knife: {
      id: 'butcher_knife', name: '菜市场杀猪刀', rarity: 'R', slot: 'weapon', bonus: 42, isStreet: true,
      perk: '市井良品：配《厨房就是军火库》暴涨至 +126 砍翻名将！',
      note: '猪肉荣赞助前期砍人性价比之王，砍完记得洗干净还厨房。'
    },
    stool: {
      id: 'stool', name: '木折凳', rarity: 'SR', slot: 'weapon', bonus: 65, isStreet: false,
      moraleBonus: 20,
      perk: '七大武器之首：单挑开场斗志 +20',
      note: '藏于民居唾手可得，能打能坐，打赢直接坐着等对方赔钱！'
    },
    green_dragon: {
      id: 'green_dragon', name: '青龙偃月刀', rarity: 'SSR', slot: 'weapon', bonus: 120, isStreet: false,
      perk: '武圣威压：单挑获胜额外恢复 120 兵力',
      note: '号称八十二斤，夜市摊老板悄悄说这把是铝合金空心的。'
    },
    lightsaber: {
      id: 'lightsaber', name: '光剑', rarity: 'UR', slot: 'weapon', bonus: 165, isStreet: false,
      lowCashDouble: true,
      perk: '跨次元神兵：主公银两低于 1,500 两时加值翻倍至 +330！',
      note: '嗡——！来路不明的发光灯管，夜间切西瓜照明两用。'
    },
    golden_cudgel: {
      id: 'golden_cudgel', name: '金箍棒', rarity: 'UR', slot: 'weapon', bonus: 199, isStreet: false,
      maxPhysique: true,
      perk: '定海神珍：穿戴期间主公体魄直接按 99 满值计算！',
      note: '向东海姓孙的大哥借的，脾气不太好，打完魔王记得归还。'
    },
    tiger_hat: {
      id: 'tiger_hat', name: '虎头帽', rarity: 'R', slot: 'helm', bonus: 26, isStreet: false,
      perk: '庙会辟邪：骑木马防摔护头，心魔战奖励 +25%',
      note: '阿嬷一针一线缝的，张飞戴上萌中带凶，官府免开罚单。'
    },
    cardboard_armor: {
      id: 'cardboard_armor', name: '纸箱甲', rarity: 'N', slot: 'armor', bonus: 10, isStreet: false,
      perk: '防风保暖，不防水更不防刀',
      note: '水果摊收摊捡的富士苹果纸箱，剪两个洞就能上阵。'
    },
    rattan_armor: {
      id: 'rattan_armor', name: '藤甲', rarity: 'SR', slot: 'armor', bonus: 55, isStreet: false,
      lossDiscount: 0.25,
      perk: '刀枪不入：单挑落败赔付减免 25%（请远离烤香肠炭火摊）',
      note: '南蛮进口手工编织，轻便透气，就是千万别挨火烧。'
    },
    red_hare: {
      id: 'red_hare', name: '赤兔弹簧木马', rarity: 'SSR', slot: 'mount', bonus: 82, isStreet: false,
      perk: '进口粗弹簧：决战先锋冲阵连击数 +1',
      note: '人中吕布马中赤兔，这匹底座装了德系减震大弹簧！'
    }
  };

  // 12 张「霸主手笔」完整预告牌库（提前 1 圈明牌亮出 + 附清晰反制提示，对齐 02 表 5-2）
  var HEGEMON_MOVES = [
    { id: 'H01', name: '恶意并购', owner: 'caocao', stage: 2, previewQuote: '曹操：「曹某看上你那间小破店了，下圈带银子来强行办过户！」', effectDesc: '下圈过圈时按造价×1.2强买你造价最低的1座城。', counterTip: '反制：在本圈置业或探班把你最便宜的那座城升 1 级，或盖「定风珠」即可令并购当场作废！' },
    { id: 'H02', name: '挟天子征税', owner: 'caocao', stage: 3, previewQuote: '曹操：「奉天子诏：今年中原地价税补缴两成，统统开发票！」', effectDesc: '下圈过圈时抽取你手头现金的 18% 入曹操金库。', counterTip: '反制：过圈前去夜市或置业时间把现金花光变成城池规模，让他连一个铜板都收不到！' },
    { id: 'H03', name: '江东水产封锁', owner: 'sunquan', stage: 2, previewQuote: '孙权：「周都督说了，今年江面禁渔，所有水城加收四成停泊费哦！」', effectDesc: '持续 2 圈：全盘所有「水」地形城池过路费一律 +40%。', counterTip: '反制：顺水推舟！趁生效前抢下荆州或江东水城，跟着孙少东一起涨价收租！' },
    { id: 'H04', name: '隔岸观火', owner: 'sunquan', stage: 3, previewQuote: '孙权：「你们先打，我们江东在建业嗑瓜子加盖箭塔就好。」', effectDesc: '孙权主城建业免费加盖 1 座箭塔并补满守军。', counterTip: '反制：用《均富天下》或《顺手牵羊》隔空薅他金库，不用踩他主城！' },
    { id: 'H05', name: '西凉拆迁队', owner: 'caocao', stage: 2, previewQuote: '曹操：「哪间违章建筑挡了大魏视线？派夏侯惇带锤子去拆一项！」', effectDesc: '拆毁你过路费最高且无定风珠城池的 1 座建筑（无建筑则挂溃散）。', counterTip: '反制：在核心巨城盖一座「定风珠」，拆迁队撞上当场弹回！' },
    { id: 'H06', name: '豪华尾牙摊派', owner: 'caocao', stage: 3, previewQuote: '曹操：「大魏集团办年终流水席，沿街每家店赞助一百两礼金啦！」', effectDesc: '你每座城被抽「100×规模」两礼金注入主霸主金库。', counterTip: '反制：留一张《顺手牵羊》等他收完礼金直接连本带利偷回来！' },
    { id: 'H07', name: '低价圈地招标', owner: 'sunquan', stage: 1, previewQuote: '孙权：「鲁子敬看中两块空地，下圈没人买我们就半价收编啰！」', effectDesc: '若盘面仍有无主城，孙权下圈自动半价占领 1 座无主城。', counterTip: '反制：趁本圈踩中无主好地果断按下「盖下去啦」抢先占走！' },
    { id: 'H08', name: '高薪挖墙脚', owner: 'caocao', stage: 2, previewQuote: '曹操：「听说贵城太守没年终奖？来大魏请喝两天下午茶！」', effectDesc: '若你主公魅力<55，随机 1 位驻城太守休假 1 圈（定风珠可免疫）。', counterTip: '反制：去官渡补习班把魅力补到 55 以上，或盖定风珠稳住军心！' },
    { id: 'H09', name: '城管巡街路检', owner: 'sunquan', stage: 2, previewQuote: '孙权：「江东水警上路临检啰，没戴安全帽的小心扣护卫兵！」', effectDesc: '下圈过圈时若你无虎头帽/藤甲护身，随行兵力损耗 180。', counterTip: '反制：穿戴头冠/衣甲即可无视临检，或去大官府免费补兵！' },
    { id: 'H10', name: '老赖免单护盾', owner: 'sunquan', stage: 3, previewQuote: '孙权：「账本忘带出门啦，下次踩中你家店面先打三折记账哦！」', effectDesc: '孙权获得 1 层赖账盾：下次踩你城过路费少付 60%。', counterTip: '反制：盖箭塔把孙权车驾射进瘫痪，或踩他城用单挑把钱揍出来！' },
    { id: 'H11', name: '买通算命半仙', owner: 'caocao', stage: 1, previewQuote: '曹操：「孤已包下庙口签筒广告位，小心抽到穿小鞋签哦！」', effectDesc: '下圈算命摊抽到下下签概率暂时升高。', counterTip: '反制：手握 1 支气运签即可当场逆天改签变上上签！' },
    { id: 'H12', name: '赤壁铁索蓄力', owner: 'caocao', stage: 3, previewQuote: '曹操：「铁索连环巨舰即将合拢！决战前看你攒够几门炮！」', effectDesc: '主霸主往魔王护盾充能 600 点（踩过17号格或有定风珠自动击碎）。', counterTip: '反制：盖定风珠、去17号格破防，或直接把曹操薅穷削减魔王四成血量！' }
  ];

  // 铁口算命摊签文库
  var FORTUNE_STICKS = [
    { id: 'S_GREAT_1', tier: 'great', name: '上上签·财神撞门', weight: 28, silverFactor: 1.4, quote: '算命仙拍桌：「红鸾星配偏财星，老天爷硬往你兜里塞红包啦！」' },
    { id: 'S_GREAT_2', tier: 'great', name: '上上签·贵人指路', weight: 12, grantPolicy: true, quote: '算命仙捋须：「紫气东来！乡亲抬轿请你开里民大会选政见啰！」' },
    { id: 'S_MID_1', tier: 'mid', name: '中平签·吃饱睡好', weight: 35, statAdd: { charm: 5, strategy: 5 }, troopsAdd: 200, quote: '算命仙点头：「平安是福，送你两笼烧饼补补兵、涨涨人缘！」' },
    { id: 'S_BAD_1', tier: 'bad', name: '下下签·踩到香蕉皮', weight: 25, silverLossFactor: 0.6, quote: '算命仙瞪眼：「印堂发黑出门漏财！要不要塞支气运签重摇一卦？」' }
  ];

  // 4 组「连续剧式 Callback 跨圈因果奇遇」完整剧本（对齐 02 表 9-9：11号亭种因 -> 27号渡/跨圈结果）
  var CALLBACK_EVENTS = [
    {
      id: 'scholar_yam',
      title: '《落魄书生的烤地瓜》',
      intro: '寒门书生蹲在桥头啃冷地瓜：「主公，小生赴洛阳赶考差 400 两盘缠，可否借一步周转？」',
      choices: [
        { key: 'kind', label: '仗义借他 400 两', req: null, desc: '银两 -400，名望 +12（种下善因）', cost: 400, fameDelta: 12, flag: 'scholar_kind' },
        { key: 'loan', label: '签九出十三归借据', req: { stat: 'strategy', val: 40 }, desc: '需谋略≥40：银两 -250（种下高利贷因）', cost: 250, fameDelta: -5, flag: 'scholar_loan' },
        { key: 'rob', label: '不借！顺手抢他半块烤地瓜', req: null, desc: '兵力 +120，名望 -15（小心记仇！）', cost: 0, troopsDelta: 120, fameDelta: -15, flag: 'scholar_rob' }
      ],
      payoffs: {
        scholar_kind: { good: true, headline: '状元报恩赠城！', effect: 'gift_city_or_silver', val: 2400, quote: '当年书生高中状元出任州牧：「当年四百两，今日赠主公重礼外加政见一桩，划算啦！」' },
        scholar_loan: { good: true, headline: '主簿连本带利还钱', effect: 'silver', val: 1800, quote: '书生当了官府主簿，黑着脸连本带利拍给你 1,800 两：「两清了啊吸血鬼！」' },
        scholar_rob: { good: false, headline: '御史带队查封报仇！', effect: 'fine_and_break', val: -600, quote: '当年书生当上督察御史：「抢我烤地瓜那位！贴封条罚六百两，天打雷劈哦！」' }
      }
    },
    {
      id: 'huatuo_pill',
      title: '《神医华佗的试药摊》',
      intro: '背药篓的老郎中神秘拦路：「老夫新搓一粒九转大力丸，还没找活人试过，敢不敢一口闷？」',
      choices: [
        { key: 'swallow', label: '闭眼仰头生吞！', req: { stat: 'physique', val: 40 }, desc: '需体魄≥40：体魄 +8（种下药人因）', cost: 0, statDelta: { physique: 8 }, flag: 'huatuo_swallow' },
        { key: 'resell', label: '花 350 两买药方转卖', req: null, desc: '银两 -350（准备卖给冤大头）', cost: 350, fameDelta: -5, flag: 'huatuo_resell' },
        { key: 'kick', label: '骂他骗子顺走铜药盖', req: null, desc: '银两 +250，名望 -12', cost: -250, fameDelta: -12, flag: 'huatuo_kick' }
      ],
      payoffs: {
        huatuo_swallow: { good: true, headline: '九转药力彻底化开！', effect: 'perm_duel', val: 28, quote: '华佗抚掌大笑：「没毒死就是神药！先锋筋骨大开，单挑永久暴涨 +28！」' },
        huatuo_resell: { good: true, headline: '假药卖翻孙少东！', effect: 'paralyze_sub_and_silver', val: 1600, quote: '把大力丸高价卖给霸主车驾，对方拉肚子瘫痪 3 刻还倒付你 1,600 两咨询费！' },
        huatuo_kick: { good: false, headline: '华佗跳槽给曹老板当军医', effect: 'buff_boss', val: -400, quote: '华佗指着你鼻子：「得罪谁都别得罪拿手术刀的！今天收你四百两挂号费！」' }
      }
    },
    {
      id: 'diaochan_wage',
      title: '《郿坞歌舞团讨薪记》',
      intro: '蒙面歌姬抱琵琶叹气：「黑心老板拖欠三个月工钱还拿砂石抵账，谁肯替小女子主持公道？」',
      choices: [
        { key: 'hire', label: '垫付 600 两聘为客卿', req: { stat: 'charm', val: 38 }, desc: '需魅力≥38：银两 -600，名望 +12', cost: 600, fameDelta: 12, flag: 'diaochan_hire' },
        { key: 'scheme', label: '献连环计挑拨内讧', req: { stat: 'strategy', val: 42 }, desc: '需谋略≥42：零成本拱火看戏', cost: 0, fameDelta: 5, flag: 'diaochan_scheme' },
        { key: 'snitch', label: '收 500 两线人费通风报信', req: null, desc: '银两 +500，名望 -18', cost: -500, fameDelta: -18, flag: 'diaochan_snitch' }
      ],
      payoffs: {
        diaochan_hire: { good: true, headline: '红颜助阵破防魔王！', effect: 'boss_weakness_combo', val: 1500, quote: '歌姬登台献艺：「主公高义！决战时太守连携火力直接 ×1.5，另献私房钱千五两！」' },
        diaochan_scheme: { good: true, headline: '连环计成掏空霸主金库！', effect: 'drain_main_hegemon', val: 0.30, quote: '敌营为抢歌姬大打出手，主霸主金库当场蒸发三成补贴给你！' },
        diaochan_snitch: { good: false, headline: '吕奉先提戟上门算账！', effect: 'troops_loss', val: -300, quote: '歌姬冷笑：「卖友求荣，吕将军顺路捅你护卫三百兵，活该啦！」' }
      }
    },
    {
      id: 'luban_cannon',
      title: '《鲁班传人的拼夕夕图纸》',
      intro: '满脸煤灰的墨家工匠凑过来：「老兄，跨时代秘密火炮蓝图，只要 800 两天使轮，赌一把？」',
      choices: [
        { key: 'invest', label: '豪爽拍出 800 两入股！', req: null, desc: '银两 -800（搏跨次元重器）', cost: 800, fameDelta: 5, flag: 'luban_invest' },
        { key: 'trial', label: '靠嘴皮子忽悠免费样机', req: { stat: 'charm', val: 40 }, desc: '需魅力≥40：白嫖试用装', cost: 0, fameDelta: 0, flag: 'luban_trial' },
        { key: 'report', label: '举报违禁烟花领 300 两', req: null, desc: '银两 +300，名望 -8', cost: -300, fameDelta: -8, flag: 'luban_report' }
      ],
      payoffs: {
        luban_invest: { good: true, headline: '跨次元加农炮交付！', effect: 'grand_cannon', val: 1500, quote: '工匠推来黄金巨炮：「股东大人，时代变了！攻城加成 +100%，决战第一段额外 +1,500 炮火！」' },
        luban_trial: { good: true, headline: '获赠霹雳投石车！', effect: 'catapult', val: 600, quote: '工匠塞来一台半成品霹雳车：「攻城战力 +50%，外送六百两分红，俗搁大碗！」' },
        luban_report: { good: false, headline: '工匠出狱投靠曹老板！', effect: 'enemy_fortify', val: -300, quote: '工匠在许昌城头冷笑：「省八百两，给你家曹老板免费加盖两座箭塔，真会算！」' }
      }
    }
  ];

  // 第 5 / 10 圈「踢馆宿敌」期中考配置（对齐 02 表 7-1）
  var RIVAL_EXAMS = {
    5: {
      loop: 5,
      id: 'duyou',
      name: '督邮·黑心查税官',
      img: ASSETS.chars.xiahoudun_horse,
      taunt: '「例行查税！存款证明拿出来，不够的话派张飞出来挨鞭子也可以啦！」',
      checkLabel: '亮出存款验资（需银两 ≥ 2,400 两，分文不扣）',
      fightLabel: '骑木马鞭督邮！（单挑检定，赢了免查还掉装备）',
      duelBase: 48,
      loseQuote: '「这……算工伤吗？！」'
    },
    10: {
      loop: 10,
      id: 'xuchu',
      name: '虎痴·许褚',
      img: ASSETS.chars.lvbu_horse,
      taunt: '「丞相说打赢你有卤肉便当加菜！歹势，俺肚子饿了！」',
      checkLabel: '请吃大碗卤肉饭支开（需谋略 ≥ 52，花 600 两）',
      fightLabel: '骑木马硬刚虎痴！（单挑检定，赢了转职领绝品装）',
      duelBase: 86,
      loseQuote: '「……那便当还有我的份吗？」'
    }
  };

  // 全局高频台味 UI 标准提示字典（对齐 02 表 9-10，“歹势”“夭寿哦”“紧酸”“冻蒜”“十八啦”“俗搁大碗”“开芭乐票”全齐）
  var QUOTES = {
    buyCityBtn: '盖下去啦！',
    visitCity: '主公回城探班，掌柜孝敬一笔私房税银！',
    loopPass: '过圈发薪水啰！名下店面税银一并入袋！',
    exactStart: '一步不差踩中大营，赏半份俸禄当全勤奖啦！',
    estateTitle: '收租婆时间：趁热盖楼，下圈等冤大头上门！',
    uncleBtn: '阿伯代办（挑回本最快的盖，俗搁大碗！）',
    dongSuan: '冻蒜——！冻蒜——！乡亲一致力挺！',
    shibalaCall: '十八啦——！豹子通杀，红光冲天发彩金！',
    snakeEyesCall: '衰尾对！衰到底老天爷塞支气运签补你，再掷一次！',
    happyPairCall: '欢喜对！好事成双敲铜锣，免费再掷一把！',
    bouncedCheckBtn: '开芭乐票（邪道免付赖账溜走，小心讨债队！）',
    persuadeBtn: '开城劝降（正道感召，兵损减半保建筑！）',
    noTroopsHint: '身边连个摇旗的小兵都没啦，只能交钱或骑木马单挑啰！',
    pityTriggered: '老天爷看不下去了：本场胜算实打实 +15%！',
    rerollUsed: '我命由我不由天——塞支气运签重摇一把！',
    clearBoardWin: '清盘大吉！霸主全穿花裤衩紧酸跑路，提前万炮轰魔王！',
    equipAutoSell: '品相不如身上这件，当场卖废铁换碎银入袋啰！'
  };

  FTX.DATA = {
    ASSETS: ASSETS,
    RARITY: RARITY,
    CITY_SCALE: CITY_SCALE,
    DICE_2D6_WAYS: DICE_2D6_WAYS,
    REGIONS: REGIONS,
    TERRAIN_NAMES: TERRAIN_NAMES,
    TILES: TILES,
    SPECIAL_MODES: SPECIAL_MODES,
    LORDS: LORDS,
    HEGEMONS: HEGEMONS,
    VANGUARDS: VANGUARDS,
    ADVISORS: ADVISORS,
    GOVERNORS: GOVERNORS,
    KOUDOU_SKILLS: KOUDOU_SKILLS,
    BUILDINGS: BUILDINGS,
    POLICIES: POLICIES,
    BOARD_CARDS: BOARD_CARDS,
    COMBAT_CARDS: COMBAT_CARDS,
    EQUIPMENTS: EQUIPMENTS,
    HEGEMON_MOVES: HEGEMON_MOVES,
    FORTUNE_STICKS: FORTUNE_STICKS,
    CALLBACK_EVENTS: CALLBACK_EVENTS,
    RIVAL_EXAMS: RIVAL_EXAMS,
    QUOTES: QUOTES
  };
})(typeof window !== 'undefined' ? window : globalThis);
