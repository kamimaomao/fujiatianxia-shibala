/**
 * 《富甲天下：十八啦！》MVP 核心规则状态机与数学公式引擎 (F1~F9)
 * - 100% 挂载至 window.FTX.Engine，零外部依赖，兼容 file:// 直开与 Node 无头模拟
 * - 完整实现：28格方环、落点预览、加注×1~×3、2D6欢喜对/衰尾对/十八啦、霸主同步走1D6、
 *   箭塔射瘫、私掠拔毛、上门找茬、割地抵债与花裤衩破产清盘、逆时针讨债队、
 *   固定四键踩城四择（含邪道开芭乐票/正道开城劝降、军师口斗互喷、2秒奇策窗、50%放水摔马喜剧）、
 *   即换即融装备栏、跨圈Callback奇遇、过圈置业阿伯代办、政见三选一冻蒜、关底三段万炮轰魔王！
 */
(function (root) {
  'use strict';

  var FTX = (root.FTX = root.FTX || {});
  var DATA = FTX.DATA;

  if (!DATA) {
    throw new Error('FTX.DATA 未加载！请确保先引入 ./js/data.js');
  }

  var state = null;
  var preRollSnapshot = null; // 供气运签「重摇落点」一键无损回滚本刻状态
  var uidCounter = 1000;

  function nextUid(prefix) {
    uidCounter += 1;
    return (prefix || 'id') + '_' + uidCounter;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickOne(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getAlignment(fame) {
    if (fame >= 30) return 'righteous'; // 正道
    if (fame <= -30) return 'evil';     // 邪道
    return 'neutral';                   // 墙头草
  }

  function getAlignmentLabel(fame) {
    if (fame >= 30) return '正道侠商';
    if (fame <= -30) return '邪道恶霸';
    return '市井墙头草';
  }

  // ==================== 九大核心数学公式 (F1 ~ F9) ====================

  // F6: 圈压系数 = 1.12 ^ (圈数 - 1)
  function calcLoopScale(loop) {
    var l = Math.max(1, loop || (state ? state.loop : 1));
    return Math.pow(1.12, l - 1);
  }

  function hasPolicy(policyId, st) {
    var s = st || state;
    if (!s || !s.player) return false;
    return s.player.policies.indexOf(policyId) >= 0;
  }

  // 计算同州连城倍率（2城 ×1.5，全州垄断 ×2.0，持 P06 时全州垄断 ×2.5）
  function calcChainMultiplier(tile, st) {
    var s = st || state;
    if (!tile || tile.type !== 'city' || !tile.owner || !tile.region) return 1.0;
    var reg = DATA.REGIONS[tile.region];
    if (!reg) return 1.0;
    var ownedCount = 0;
    for (var i = 0; i < reg.tiles.length; i++) {
      var t = s.board[reg.tiles[i]];
      if (t && t.owner === tile.owner) ownedCount++;
    }
    if (ownedCount >= reg.tiles.length) {
      return (tile.owner === 'player' && hasPolicy('P06', s)) ? 2.5 : 2.0;
    }
    if (ownedCount >= 2) return 1.5;
    return 1.0;
  }

  // 计算单座城池累计造价（严格对齐总纲 F7：只计规模阶梯，不计建筑）
  function calcCityCumCost(tile) {
    if (!tile || tile.type !== 'city' || !tile.owner || tile.level < 1) return 0;
    var scale = DATA.CITY_SCALE[clamp(tile.level, 1, 5)];
    return Math.round(tile.basePrice * scale.cumCostFactor);
  }

  // 计算升下一级所需费用（置业时间若有 P04 享 -25%）
  function calcCityUpgradeCost(tile, isEstatePhase, st) {
    var s = st || state;
    if (!tile || tile.type !== 'city' || tile.level >= 5) return 0;
    var nextLv = tile.level + 1;
    var raw = Math.round(tile.basePrice * DATA.CITY_SCALE[nextLv].stepCostFactor);
    if (isEstatePhase && tile.owner === 'player' && hasPolicy('P04', s)) {
      return Math.round(raw * 0.75);
    }
    return raw;
  }

  // F1: 过路费计算（payer = 'raw' 返回城池面板过路费；payer = 'player' 计入魅力杀价与正邪/通行贴修正）
  function calcToll(tileIdx, payer, st) {
    var s = st || state;
    var tile = s.board[tileIdx];
    if (!tile || tile.type !== 'city' || !tile.owner || tile.level < 1) return 0;
    if (tile.sealedLoops && tile.sealedLoops > 0) return 0;

    var scale = DATA.CITY_SCALE[clamp(tile.level, 1, 5)];
    var base = tile.basePrice * scale.tollMult;
    var chainMult = calcChainMultiplier(tile, s);

    var bldgBonus = 0;
    for (var i = 0; i < tile.buildings.length; i++) {
      var bDef = DATA.BUILDINGS[tile.buildings[i]];
      if (bDef && bDef.tollBonus) bldgBonus += bDef.tollBonus;
    }
    if (tile.smoked && tile.buildings.indexOf('wind_orb') < 0) {
      bldgBonus -= 0.25;
    }
    if (s.worldEffects && s.worldEffects.waterBlockadeLoops > 0 && tile.terrain === 'water') {
      bldgBonus += 0.40;
    }
    if (s.specialMode === 'chibi' && tile.terrain === 'water') {
      // 赤壁连环船异变：同势力占≥2座水城，水城过路费 +25%
      var waterCount = 0;
      for (var k = 0; k < s.board.length; k++) {
        if (s.board[k].type === 'city' && s.board[k].owner === tile.owner && s.board[k].terrain === 'water') {
          waterCount++;
        }
      }
      if (waterCount >= 2) bldgBonus += 0.25;
    }
    if (tile.owner === 'player' && hasPolicy('P01', s)) {
      bldgBonus += 0.15;
    }

    var govBonus = 0;
    if (tile.governorId && tile.buildings.indexOf('poop_god') < 0 && (!tile.govHolidayLoops || tile.govHolidayLoops <= 0)) {
      var gDef = DATA.GOVERNORS[tile.governorId];
      if (gDef && gDef.ecoBonus) govBonus = Math.min(0.60, gDef.ecoBonus);
    }

    var rawToll = Math.max(40, Math.round(base * chainMult * Math.max(0.25, 1 + bldgBonus + govBonus)));

    if (payer === 'player') {
      var charm = s.player.stats.charm || 0;
      var charmDisc = Math.min(0.30, charm * 0.003);
      var afterCharm = rawToll * (1 - charmDisc);
      if (s.player.buffs.hulaoPassLoops > 0) {
        afterCharm *= 0.80;
      }
      // 加注倍率（F4），支持 P28 稳赚不赔每圈首笔支出按 ×1 计
      var effBet = getEffectiveExpenseMultiplier(s);
      return Math.max(20, Math.round(afterCharm * effBet));
    }

    if (payer === 'hegemon' && tile.owner === 'player') {
      var mult = 1.0;
      if (s.player.buffs.godPossessTicks > 0) mult *= 1.5;
      return Math.max(30, Math.round(rawToll * mult));
    }

    return rawToll;
  }

  function getEffectiveExpenseMultiplier(st) {
    var s = st || state;
    if (!s) return 1;
    var mult = s.betMultiplier || 1;
    if (mult > 1 && hasPolicy('P28', s) && !s.player.buffs.p28UsedThisLoop) {
      return 1;
    }
    return mult;
  }

  function consumeP28IfApplicable(st) {
    var s = st || state;
    if (s && s.betMultiplier > 1 && hasPolicy('P28', s) && !s.player.buffs.p28UsedThisLoop) {
      s.player.buffs.p28UsedThisLoop = true;
      addLog('触发政见《稳赚不赔》：本笔加注支出锁死按 ×1 结算！', 'good');
      return true;
    }
    return false;
  }

  // 当圈基准俸禄
  function calcBaseStipend(loop, st) {
    var s = st || state;
    var l = Math.max(1, loop || (s ? s.loop : 1));
    var raw = 500 + 100 * (l - 1);
    if (s && hasPolicy('P25', s)) raw = Math.round(raw * 1.35);
    return raw;
  }

  // 单城单次税收
  function calcCityTax(tile, st) {
    var s = st || state;
    if (!tile || tile.type !== 'city' || !tile.owner || tile.level < 1) return 0;
    var scale = DATA.CITY_SCALE[clamp(tile.level, 1, 5)];
    var base = tile.basePrice * scale.taxRate;
    var bonus = 0;
    for (var i = 0; i < tile.buildings.length; i++) {
      var bDef = DATA.BUILDINGS[tile.buildings[i]];
      if (bDef && bDef.taxBonus) bonus += bDef.taxBonus;
    }
    if (tile.smoked && tile.buildings.indexOf('wind_orb') < 0) bonus -= 0.25;
    if (tile.owner === 'player' && hasPolicy('P02', s)) bonus += 0.30;
    if (tile.governorId && tile.buildings.indexOf('poop_god') < 0 && (!tile.govHolidayLoops || tile.govHolidayLoops <= 0)) {
      var gDef = DATA.GOVERNORS[tile.governorId];
      if (gDef && gDef.ecoBonus) bonus += Math.min(0.60, gDef.ecoBonus);
    }
    return Math.max(15, Math.round(base * Math.max(0.25, 1 + bonus)));
  }

  // F2: 玩家过圈总收入（俸禄 + 全部自家城池税收）
  function calcLoopIncome(st) {
    var s = st || state;
    var stipend = calcBaseStipend(s.loop, s);
    var taxTotal = 0;
    var troopRecruit = 0;
    for (var i = 0; i < s.board.length; i++) {
      var t = s.board[i];
      if (t.type === 'city' && t.owner === 'player') {
        taxTotal += calcCityTax(t, s);
        if (t.buildings.indexOf('granary') >= 0) {
          troopRecruit += t.level * 40;
        }
      }
    }
    return {
      stipend: stipend,
      taxTotal: taxTotal,
      totalSilver: stipend + taxTotal,
      troopRecruit: troopRecruit
    };
  }

  // F7: 身家计算（银两/金库 + 名下城池累计造价之和）
  function calcEntityNetWorth(ownerId, st) {
    var s = st || state;
    var cash = 0;
    if (ownerId === 'player') {
      cash = Math.max(0, s.player.silver);
    } else {
      var heg = getHegemonById(ownerId, s);
      if (!heg || heg.bankrupt) return 0;
      cash = Math.max(0, heg.vault);
    }
    var estateVal = 0;
    for (var i = 0; i < s.board.length; i++) {
      var t = s.board[i];
      if (t.type === 'city' && t.owner === ownerId) {
        estateVal += calcCityCumCost(t);
      }
    }
    return cash + estateVal;
  }

  // 计算先锋四槽装备有效总加值与特殊属性
  function calcPlayerEquipStats(st) {
    var s = st || state;
    var eq = s.player.equipment;
    var slots = ['weapon', 'helm', 'armor', 'mount'];
    var totalBonus = 0;
    var moraleBonus = 0;
    var lossDiscount = 0;
    var forceMaxPhysique = false;
    var extraHits = 0;

    for (var i = 0; i < slots.length; i++) {
      var slotKey = slots[i];
      var itemId = eq[slotKey];
      if (!itemId || !DATA.EQUIPMENTS[itemId]) continue;
      var def = DATA.EQUIPMENTS[itemId];
      var val = def.bonus || 0;
      if (slotKey === 'weapon' && def.isStreet && hasPolicy('P11', s)) {
        val *= 3;
      }
      if ((slotKey === 'mount' || slotKey === 'helm') && hasPolicy('P13', s)) {
        val *= 2;
      }
      if (def.lowCashDouble && s.player.silver < 1500) {
        val *= 2;
      }
      if (def.moraleBonus) moraleBonus += def.moraleBonus;
      if (def.lossDiscount) lossDiscount += def.lossDiscount;
      if (def.maxPhysique) forceMaxPhysique = true;
      if (itemId === 'red_hare') extraHits += 1;
      totalBonus += val;
    }

    return {
      totalBonus: totalBonus,
      moraleBonus: moraleBonus,
      lossDiscount: lossDiscount,
      forceMaxPhysique: forceMaxPhysique,
      extraHits: extraHits
    };
  }

  // 式 4-1 ~ 4-3 + F5 胜算计算
  function calcCombatPowerAndWinRate(mode, tile, extraMoraleDiff, st) {
    var s = st || state;
    var p = s.player;
    var vanguard = DATA.VANGUARDS[p.vanguardId] || DATA.VANGUARDS.zhangfei;
    var advisor = DATA.ADVISORS[p.advisorId] || DATA.ADVISORS.zhugeliang;
    var govId = (tile && tile.governorId) ? tile.governorId : 'lizhangbo';
    if (tile && tile.govHolidayLoops > 0) govId = 'lizhangbo';
    var gov = DATA.GOVERNORS[govId] || DATA.GOVERNORS.lizhangbo;
    var scale = calcLoopScale(s.loop);

    var myPower = 100;
    var enemyPower = 100;

    if (mode === 'duel') {
      var eqStats = calcPlayerEquipStats(s);
      var effPhysique = eqStats.forceMaxPhysique ? 99 : p.stats.physique;
      var baseMyMorale = 50 + eqStats.moraleBonus + (p.vanguardId === 'zhangfei' ? 15 : 5) + (hasPolicy('P09', s) ? 25 : 0);
      var baseEnemyMorale = 50 + (tile && tile.buildings.indexOf('altar') >= 0 ? 20 : 0);
      var moraleDiff = (baseMyMorale - baseEnemyMorale) + (extraMoraleDiff || 0);

      var policyMult = 1 + (p.vanguardId === 'zhangfei' ? 0.12 : 0) + (hasPolicy('P16', s) ? 0.25 : 0);
      myPower = (vanguard.duel + p.permDuelBonus + eqStats.totalBonus) *
        (1 + effPhysique * 0.01) *
        Math.max(0.5, 1 + moraleDiff * 0.005) *
        policyMult;

      var woundMult = (tile && tile.woundedLoops > 0) ? 0.70 : 1.0;
      var docMult = (s.worldEffects && s.worldEffects.enemyDoctorBuff) ? 1.15 : 1.0;
      enemyPower = gov.duel * scale * woundMult * docMult;
    } else if (mode === 'field_battle') {
      var terrain = (tile && tile.terrain) || 'land';
      var myApt = (advisor.terrainApt && advisor.terrainApt[terrain]) || 1.0;
      var enApt = (gov.terrainApt && gov.terrainApt[terrain]) || 1.0;
      myPower = Math.max(1, p.troops) * (1 + advisor.fieldBonus + p.stats.strategy * 0.01) * myApt;
      enemyPower = Math.max(60, tile ? tile.garrison : 300) * (1 + gov.field) * enApt;
    } else if (mode === 'siege') {
      myPower = Math.max(1, p.troops) * (1 + vanguard.siege) * (1 + p.siegeGearBonus);
      enemyPower = Math.max(90, (tile ? tile.garrison + tile.defense : 400)) * (1 + gov.siege);
    }

    var rawRate = clamp(myPower / (myPower + enemyPower), 0.05, 0.95);
    var pityApplied = false;
    var finalRate = rawRate;
    if (p.pityCount >= 2) {
      finalRate = clamp(rawRate + 0.15, 0.05, 0.95);
      pityApplied = true;
    }

    return {
      myPower: Math.round(myPower),
      enemyPower: Math.round(enemyPower),
      rawWinRate: rawRate,
      winRate: finalRate,
      winRatePct: Math.round(finalRate * 100),
      pityApplied: pityApplied
    };
  }

  // F9: 关底天命魔王气血与预估总火力计算
  function calcBossPreview(st) {
    var s = st || state;
    var isShort = s.maxLoops <= 8;
    var chapterBaseHp = isShort ? 7800 : 17500;
    var targetNw = isShort ? DATA.HEGEMONS.caocao.targetNetWorth8 : DATA.HEGEMONS.caocao.targetNetWorth15;

    var mainHeg = getHegemonById('caocao', s);
    var allBankrupt = s.hegemons.every(function (h) { return h.bankrupt; });
    var remnantRatio = 0;
    if (!allBankrupt && mainHeg && !mainHeg.bankrupt) {
      remnantRatio = clamp(calcEntityNetWorth('caocao', s) / targetNw, 0, 1);
    }

    var hasWindOrb = s.board.some(function (t) {
      return t.owner === 'player' && t.buildings.indexOf('wind_orb') >= 0;
    });
    var shield = s.worldEffects.bossExtraShield || 0;
    if (hasWindOrb || s.player.buffs.chibiWindBroken || s.player.buffs.hulaoLvbuBeaten) {
      shield = 0;
    }

    var estHp = Math.round(chapterBaseHp * (0.6 + 0.4 * remnantRatio)) + shield;

    // 预估三段火力 D1 + D2 + D3
    var pNetWorth = calcEntityNetWorth('player', s);
    var d1 = Math.round((pNetWorth / 10) * (1 + s.player.artilleryBonusPct));
    if (hasPolicy('P08', s)) {
      for (var i = 0; i < s.board.length; i++) {
        var ct = s.board[i];
        if (ct.owner === 'player' && ct.level >= 4) {
          d1 += Math.round((calcCityCumCost(ct) / 10) * 0.8);
        }
      }
    }
    if (s.player.buffs.lubanCannonBonus > 0) d1 += s.player.buffs.lubanCannonBonus;

    var govCities = s.board.filter(function (t) {
      return t.type === 'city' && t.owner === 'player' && t.governorId;
    }).slice(0, 6);
    var d2 = 0;
    for (var j = 0; j < govCities.length; j++) {
      d2 += Math.round(calcToll(govCities[j].idx, 'raw', s) / 10);
    }
    if (s.player.buffs.diaochanComboMult) d2 = Math.round(d2 * 1.5);

    var duelInfo = calcCombatPowerAndWinRate('duel', null, 15, s);
    var eqStats = calcPlayerEquipStats(s);
    var estHits = 5 + eqStats.extraHits + (hasPolicy('P13', s) ? 2 : 0) + (hasPolicy('P16', s) ? 3 : 0) + s.player.combatCards.length * 2;
    var d3 = Math.round(duelInfo.myPower * 0.45 * estHits);

    var brokenWeaknesses = [];
    if (remnantRatio < 0.35) brokenWeaknesses.push('主霸主被薅瘦（魔王气血大幅削减）');
    if (s.player.buffs.chibiWindBroken) brokenWeaknesses.push('已借东风（破除水战装甲）');
    if (s.player.buffs.hulaoLvbuBeaten) brokenWeaknesses.push('已击败吕布（无人护驾）');
    if (s.player.buffs.diaochanComboMult) brokenWeaknesses.push('红颜助阵（连携×1.5）');

    var estFirepower = d1 + d2 + d3;
    return {
      name: '赤壁铁索巨舰·魔化机关曹丞相',
      bossImg: DATA.ASSETS.chars.boss_caocao_mecha,
      chapterBaseHp: chapterBaseHp,
      remnantRatio: Number(remnantRatio.toFixed(2)),
      shield: shield,
      estHp: estHp,
      estD1: d1,
      estD2: d2,
      estD3: d3,
      estFirepower: estFirepower,
      ratio: Number((estFirepower / Math.max(1, estHp)).toFixed(2)),
      brokenWeaknesses: brokenWeaknesses
    };
  }

  // ==================== 全局派生指标实时重算 ====================

  function getHegemonById(id, st) {
    var s = st || state;
    if (!s || !s.hegemons) return null;
    for (var i = 0; i < s.hegemons.length; i++) {
      if (s.hegemons[i].id === id) return s.hegemons[i];
    }
    return null;
  }

  function recomputeAllDerived(st) {
    var s = st || state;
    if (!s) return;

    var scale = calcLoopScale(s.loop);

    // 1. 先标记全盘「屎王神」熏臭范围（前后各 2 格内非本势力城池）
    for (var i = 0; i < s.board.length; i++) {
      s.board[i].smoked = false;
    }
    for (var pIdx = 0; pIdx < s.board.length; pIdx++) {
      var src = s.board[pIdx];
      if (src.type === 'city' && src.owner && src.buildings.indexOf('poop_god') >= 0) {
        for (var delta = -2; delta <= 2; delta++) {
          if (delta === 0) continue;
          var targetIdx = (pIdx + delta + 28) % 28;
          var tgt = s.board[targetIdx];
          if (tgt.type === 'city' && tgt.owner && tgt.owner !== src.owner && tgt.buildings.indexOf('wind_orb') < 0) {
            tgt.smoked = true;
          }
        }
      }
    }

    // 2. 更新每格守军、城防、过路费、升级费与微缩城楼图片
    for (var k = 0; k < s.board.length; k++) {
      var t = s.board[k];
      if (t.type === 'city') {
        if (t.owner && t.level >= 1) {
          var cs = DATA.CITY_SCALE[clamp(t.level, 1, 5)];
          var ownerParalyzed = false;
          if (t.owner !== 'player') {
            var h = getHegemonById(t.owner, s);
            if (h && h.paralyzedTicks > 0) ownerParalyzed = true;
          }
          var garMult = (1 + (t.buildings.indexOf('granary') >= 0 ? 0.30 : 0)) *
            (t.brokenLoops > 0 ? 0.50 : 1.0) *
            (ownerParalyzed ? 0.70 : 1.0) *
            (t.smoked ? 0.80 : 1.0);
          var defMult = 1 + (t.buildings.indexOf('arrow_tower') >= 0 ? 0.35 : 0);

          t.garrison = Math.max(40, Math.round(t.basePrice * cs.garrisonFactor * scale * garMult));
          t.defense = Math.round(t.basePrice * cs.defenseFactor * scale * defMult);
          t.currentToll = calcToll(t.idx, 'raw', s);
          t.playerPayToll = t.owner !== 'player' ? calcToll(t.idx, 'player', s) : 0;
          t.upgradeCost = calcCityUpgradeCost(t, s.phase === 'LOOP_ESTATE', s);
          t.cityImg = cs.img;
        } else {
          t.garrison = 0;
          t.defense = 0;
          t.currentToll = 0;
          t.playerPayToll = 0;
          t.upgradeCost = 0;
          t.cityImg = DATA.ASSETS.world.city_lv1;
        }
      } else if (t.idx === 17) {
        var sp = DATA.SPECIAL_MODES[s.specialMode] || DATA.SPECIAL_MODES.hulao;
        t.name = sp.tileName;
        t.worldImg = sp.worldImg;
        t.desc = sp.desc;
      }
    }

    // 3. 更新主公上限、正邪立场与身家
    var stipend = calcBaseStipend(s.loop, s);
    s.player.maxTroops = Math.max(1000, stipend * 2 + (hasPolicy('P25', s) ? 400 : 0));
    s.player.troops = clamp(s.player.troops, 0, s.player.maxTroops);
    s.player.alignment = getAlignment(s.player.stats.fame);
    s.player.alignmentLabel = getAlignmentLabel(s.player.stats.fame);
    s.player.netWorth = calcEntityNetWorth('player', s);

    // 4. 更新霸主野心阶段、护卫上限与身家（同时挂载 .caocao / .sunquan 键值引用兼容 UI 读取）
    var ambition = s.loop <= 5 ? 1 : (s.loop <= 10 ? 2 : 3);
    if (s.maxLoops <= 8) {
      ambition = s.loop <= 3 ? 1 : (s.loop <= 5 ? 2 : 3);
    }
    for (var m = 0; m < s.hegemons.length; m++) {
      var hg = s.hegemons[m];
      hg.ambitionStage = ambition;
      hg.maxGuardHp = Math.round(300 * scale);
      if (hg.guardHp > hg.maxGuardHp) hg.guardHp = hg.maxGuardHp;
      hg.netWorth = calcEntityNetWorth(hg.id, s);
      s.hegemons[hg.id] = hg;
    }

    // 5. 更新关底魔王实时火力对比条
    s.bossPreview = calcBossPreview(s);
    s.player.estFirepower = s.bossPreview.estFirepower;
  }

  function addLog(text, tone) {
    if (!state) return;
    state.logs.push({
      id: nextUid('log'),
      loop: state.loop,
      tick: state.tick,
      text: text,
      tone: tone || 'info'
    });
    if (state.logs.length > 60) {
      state.logs.shift();
    }
  }

  // ==================== 开局初始化 newGame ====================

  function createCardInstance(cardId, deckType) {
    var dict = deckType === 'combat' ? DATA.COMBAT_CARDS : DATA.BOARD_CARDS;
    var def = dict[cardId];
    if (!def) return null;
    return Object.assign({}, def, {
      instanceId: nextUid(deckType === 'combat' ? 'cc' : 'bc')
    });
  }

  function giveBoardCard(cardId) {
    var inst = createCardInstance(cardId, 'board');
    if (!inst) return { added: false, soldSilver: 0 };
    if (state.player.boardCards.length >= 3) {
      state.player.silver += 250;
      addLog(DATA.QUOTES.equipAutoSell + '（锦囊满槽折现 +250 两）', 'info');
      return { added: false, soldSilver: 250, card: inst };
    }
    state.player.boardCards.push(inst);
    return { added: true, soldSilver: 0, card: inst };
  }

  function giveCombatCard(cardId) {
    var inst = createCardInstance(cardId, 'combat');
    if (!inst) return { added: false, soldSilver: 0 };
    if (state.player.combatCards.length >= 2) {
      state.player.silver += 220;
      return { added: false, soldSilver: 220, card: inst };
    }
    state.player.combatCards.push(inst);
    return { added: true, soldSilver: 0, card: inst };
  }

  function newGame(options) {
    var opts = options || {};
    var lordId = DATA.LORDS[opts.lordId] ? opts.lordId : 'liubei';
    var vanguardId = DATA.VANGUARDS[opts.vanguardId] ? opts.vanguardId : 'zhangfei';
    var advisorId = DATA.ADVISORS[opts.advisorId] ? opts.advisorId : 'zhugeliang';
    var maxLoops = opts.maxLoops === 8 ? 8 : 15;
    var specialMode = opts.specialMode === 'chibi' ? 'chibi' : 'hulao';

    var lordDef = DATA.LORDS[lordId];

    // 初始化 28 格动态盘面
    var board = DATA.TILES.map(function (t) {
      var owner = t.initOwner;
      var level = t.initLevel || 0;
      var govId = t.initGov || null;

      // 主公起手产业置换：刘备起手 1 号涿县，董卓起手 10 号陈留砂石场
      if (t.idx === 1) {
        if (lordId === 'liubei') {
          owner = 'player';
          level = 1;
          govId = 'guanyu';
        } else {
          owner = null;
          level = 0;
          govId = null;
        }
      } else if (t.idx === 10 && lordId === 'dongzhuo') {
        owner = 'player';
        level = 1;
        govId = 'guanyu';
      }

      return Object.assign({}, t, {
        owner: owner,
        level: level,
        buildings: [],
        governorId: govId,
        garrison: 0,
        defense: 0,
        brokenLoops: 0,
        woundedLoops: 0,
        sealedLoops: 0,
        govHolidayLoops: 0,
        smoked: false,
        bonusRedPacket: 0,
        eliteDemon: false,
        halfPriceLoops: 0,
        turtleBlock: false,
        currentToll: 0,
        playerPayToll: 0,
        upgradeCost: 0,
        cityImg: DATA.ASSETS.world.city_lv1
      });
    });

    // 初始化两大霸主（曹操、孙权）
    var hegemons = ['caocao', 'sunquan'].map(function (hid) {
      var hDef = DATA.HEGEMONS[hid];
      return {
        id: hDef.id,
        name: hDef.name,
        title: hDef.title,
        isMainBoss: hDef.isMainBoss,
        color: hDef.color,
        badgeShape: hDef.badgeShape,
        chariotImg: hDef.chariotImg,
        cryImg: hDef.cryImg || hDef.chariotImg,
        bankruptImg: hDef.bankruptImg,
        pos: hDef.homeTile,
        homeTile: hDef.homeTile,
        vault: hDef.initVault,
        guardHp: 300,
        maxGuardHp: 300,
        paralyzedTicks: 0,
        bankrupt: false,
        ambitionStage: 1,
        evadeTollShield: 0,
        nextMoveCard: null,
        netWorth: 0
      };
    });

    state = {
      phase: 'IDLE',
      loop: 1,
      maxLoops: maxLoops,
      tick: 0,
      speed: 1,
      betMultiplier: 1,
      specialMode: specialMode,
      jackpotPot: 1500,
      foreclosedTiles: [],
      pendingLoopPass: false,
      exactStartBonusPending: false,
      extraRollPending: false,
      consecPairs: 0,
      pendingPoliciesCount: 0,
      currentPolicyChoices: [],
      policyRefreshUsed: 0,
      currentMarketItems: [],
      currentEventData: null,
      currentFortuneStick: null,
      currentDuelCtx: null,
      currentRivalExam: null,
      lastFinaleResult: null,
      canReroll: false,
      lastRollResult: null,
      worldEffects: {
        waterBlockadeLoops: 0,
        badFortuneBiasLoops: 0,
        enemyDoctorBuff: false,
        bossExtraShield: 0
      },
      player: {
        lordId: lordDef.id,
        name: lordDef.name,
        title: lordDef.title,
        color: lordDef.color,
        badgeShape: lordDef.badgeShape,
        pieceImg: lordDef.pieceImg,
        happyImg: lordDef.happyImg,
        cryImg: lordDef.cryImg,
        pos: 0,
        silver: lordDef.initSilver,
        troops: lordDef.initTroops,
        maxTroops: 1000,
        luckSticks: 2, // 开局给 2 支气运签方便体验改命重摇与改签
        maxLuckSticks: 3,
        stats: Object.assign({}, lordDef.stats),
        alignment: getAlignment(lordDef.stats.fame),
        alignmentLabel: getAlignmentLabel(lordDef.stats.fame),
        vanguardId: vanguardId,
        advisorId: advisorId,
        rosterGovernors: ['guanyu', 'ganning', 'lusu', 'zhouyu', 'xiahoudun', 'lvbu'],
        equipment: {
          weapon: 'toothpick', // 开局手持凡品牙签，等心魔/夜市掉折凳菜刀触发即换即融！
          helm: null,
          armor: 'cardboard_armor',
          mount: null
        },
        pendingEquip: null,
        policies: [],
        boardCards: [],
        combatCards: [],
        permDuelBonus: 0,
        siegeGearBonus: 0.25, // 默认带基础冲车 +25%
        artilleryBonusPct: 0,
        tollCollectedTotal: 0,
        pityCount: 0,
        bouncedCooldown: 0,
        firstShibalaDone: false,
        monopolyRewardedRegions: [],
        estateUpgradedTilesThisLoop: [],
        callbackFlags: {},
        seenEvents: [],
        buffs: {
          forcedSteps: 0,
          godPossessTicks: 0,
          freeTollCharges: 0,
          hulaoPassLoops: 0,
          hulaoPaidThisLoop: false,
          hulaoLvbuBeaten: false,
          chibiWindBroken: false,
          diaochanComboMult: false,
          lubanCannonBonus: 0,
          huatuoPreventLossOnce: false,
          p22UsedThisLoop: false,
          p28UsedThisLoop: false
        },
        netWorth: 0,
        estFirepower: 0
      },
      hegemons: hegemons,
      debtTeams: [],
      board: board,
      bossPreview: null,
      logs: []
    };

    // 开局赠送 2 张棋盘锦囊（专属起始卡 + 均富天下/路障乌龟）与 2 张战斗奇策（偷龙转凤 + 草鞋糊脸）
    giveBoardCard(lordDef.startCard || 'step_control');
    giveBoardCard(lordId === 'liubei' ? 'turtle_block' : 'equal_wealth');
    giveCombatCard('swap_dragon');
    giveCombatCard('straw_slap');

    recomputeAllDerived(state);
    preRollSnapshot = null;
    addLog(lordDef.name + '登场：「' + lordDef.quotes.start + '」', 'good');

    return getState();
  }

  function getState() {
    if (!state) return newGame();
    recomputeAllDerived(state);
    return state;
  }

  // ==================== 待机预览与手牌操控 ====================

  // 前方 2~12 步实时落点预览（含精确 2D6 概率、7点钟形顶点高亮、预估收支与危险等级）
  function getReachPreview() {
    if (!state) newGame();
    recomputeAllDerived(state);

    var p = state.player;
    var forced = p.buffs.forcedSteps;
    var list = [];

    for (var steps = 2; steps <= 12; steps++) {
      var ways = DATA.DICE_2D6_WAYS[steps] || 0;
      // 若持有 P24 灌铅品管，1点变6点轻微改变概率分布，精确换算
      if (hasPolicy('P24')) {
        ways = calcP24Ways(steps);
      }
      var prob = forced > 0 ? (forced === steps ? 1.0 : 0.0) : (ways / 36);
      var tileIdx = (p.pos + steps) % 28;

      // 检查路径中是否会被 17 号虎牢收费站提前拦停
      var interceptedBy17 = false;
      if (state.specialMode === 'hulao' && !p.buffs.hulaoPaidThisLoop) {
        for (var sIdx = 1; sIdx < steps; sIdx++) {
          if ((p.pos + sIdx) % 28 === 17) {
            interceptedBy17 = true;
            break;
          }
        }
      }

      var tile = state.board[tileIdx];
      var tollIfEnemy = 0;
      var estDelta = 0;
      var danger = 'safe';
      var tags = [];

      if (interceptedBy17) {
        tags.push('虎牢必停');
        danger = 'warn';
      }

      if (tile.type === 'city') {
        if (!tile.owner) {
          var buyPrice = p.lordId === 'dongzhuo' ? Math.round(tile.basePrice * 0.8) : tile.basePrice;
          estDelta = tile.bonusRedPacket > 0 ? tile.bonusRedPacket : -buyPrice;
          danger = 'jackpot';
          tags.push('空城可买');
          if (tile.bonusRedPacket > 0) tags.push('红包+' + tile.bonusRedPacket);
        } else if (tile.owner === 'player') {
          estDelta = calcCityTax(tile, state) * state.betMultiplier * (p.lordId === 'liubei' ? 2 : 1);
          danger = 'safe';
          tags.push('自家探班');
        } else {
          tollIfEnemy = calcToll(tileIdx, 'player', state);
          estDelta = -tollIfEnemy;
          danger = tollIfEnemy >= Math.max(800, p.silver * 0.35) ? 'danger' : 'warn';
          tags.push('过路费-' + tollIfEnemy);
        }
      } else if (tile.type === 'pot') {
        estDelta = state.jackpotPot * state.betMultiplier * (hasPolicy('P23') ? 2 : 1);
        danger = 'jackpot';
        tags.push('聚宝盆+' + estDelta);
      } else if (tile.type === 'demon') {
        danger = 'safe';
        tags.push(tile.eliteDemon ? '精英爆神装' : '打怪掉装');
      } else if (tile.type === 'market' && tile.halfPriceLoops > 0) {
        danger = 'jackpot';
        tags.push('夜市五折');
      }

      // 检查是否有讨债队蹲守
      var hasDebt = state.debtTeams.some(function (dt) { return dt.pos === tileIdx; });
      if (hasDebt) {
        tags.push('讨债队拦截');
        if (danger === 'safe') danger = 'warn';
      }

      list.push({
        steps: steps,
        tileIdx: tileIdx,
        tileName: tile.name,
        prob: Number(prob.toFixed(4)),
        probPct: Math.round(prob * 1000) / 10,
        isPeak7: steps === 7,
        estSilverDelta: Math.round(estDelta),
        tollIfEnemy: tollIfEnemy,
        dangerLevel: danger,
        tags: tags
      });
    }

    // 若《安步当车》选了 1 步，单独补入 1 步预览
    if (forced === 1) {
      var idx1 = (p.pos + 1) % 28;
      list.unshift({
        steps: 1,
        tileIdx: idx1,
        tileName: state.board[idx1].name,
        prob: 1.0,
        probPct: 100,
        isPeak7: false,
        estSilverDelta: 0,
        tollIfEnemy: state.board[idx1].owner && state.board[idx1].owner !== 'player' ? calcToll(idx1, 'player', state) : 0,
        dangerLevel: 'jackpot',
        tags: ['遥控1步精准达']
      });
    }

    return list;
  }

  function calcP24Ways(sum) {
    // 骰子 A 面为 [6,2,3,4,5,6]，骰子 B 面为 [1,2,3,4,5,6]
    var dieA = [6, 2, 3, 4, 5, 6];
    var count = 0;
    for (var i = 0; i < 6; i++) {
      for (var j = 1; j <= 6; j++) {
        if (dieA[i] + j === sum) count++;
      }
    }
    return count;
  }

  function setBetMultiplier(mult) {
    if (!state) newGame();
    var m = Number(mult);
    if ([1, 2, 3].indexOf(m) >= 0) {
      state.betMultiplier = m;
      recomputeAllDerived(state);
    }
    return state.betMultiplier;
  }

  function switchVanguard(vanguardId) {
    if (!state) newGame();
    if (DATA.VANGUARDS[vanguardId]) {
      state.player.vanguardId = vanguardId;
      recomputeAllDerived(state);
      addLog('切换出战先锋为：' + DATA.VANGUARDS[vanguardId].name + '（装备自动继承）！', 'info');
    }
    return getState();
  }

  function setSpeed(spd) {
    if (!state) newGame();
    state.speed = spd === 2 ? 2 : 1;
    return state.speed;
  }

  // 施放棋盘锦囊
  function useBoardCard(instanceId, param) {
    if (!state) newGame();
    if (state.phase !== 'IDLE') {
      return { ok: false, message: '请在掷骰前待机阶段施放棋盘锦囊哦！', state: getState() };
    }
    var cards = state.player.boardCards;
    var idx = -1;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].instanceId === instanceId || cards[i].id === instanceId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return { ok: false, message: '未找到该棋盘锦囊！', state: getState() };
    }

    var card = cards[idx];
    var events = [];
    var msg = '';

    if (card.id === 'step_control') {
      var steps = clamp(Number(param && param.steps ? param.steps : 6) || 6, 1, 6);
      state.player.buffs.forcedSteps = steps;
      msg = '施放《安步当车》：下一次掷骰锁定精准前进 ' + steps + ' 步！';
      events.push({ type: 'card_used', cardId: card.id, text: msg });
    } else if (card.id === 'steal_gold') {
      var alive = state.hegemons.filter(function (h) { return !h.bankrupt; });
      alive.sort(function (a, b) { return b.vault - a.vault; });
      if (alive.length > 0) {
        var target = alive[0];
        var stolen = Math.min(target.vault, Math.max(600, Math.round(target.vault * 0.22)));
        target.vault -= stolen;
        state.player.silver += stolen;
        msg = '施放《顺手牵羊》：从' + target.name + '金库顺走 ' + stolen + ' 两现银！';
        events.push({ type: 'steal_gold', targetId: target.id, amount: stolen, text: msg });
      } else {
        state.player.silver += 600;
        msg = '施放《顺手牵羊》：搜刮残余暗桩得 600 两！';
      }
    } else if (card.id === 'equal_wealth') {
      var activeHegs = state.hegemons.filter(function (h) { return !h.bankrupt; });
      var pool = state.player.silver;
      for (var h = 0; h < activeHegs.length; h++) pool += activeHegs[h].vault;
      var share = Math.round(pool / (1 + activeHegs.length));
      var diff = share - state.player.silver;
      state.player.silver = share;
      for (var h2 = 0; h2 < activeHegs.length; h2++) activeHegs[h2].vault = share;
      msg = '施放《均富天下》！全场金库强行平分，每人分得 ' + share + ' 两（主公净变 ' + (diff >= 0 ? '+' : '') + diff + ' 两）！';
      events.push({ type: 'equal_wealth', share: share, delta: diff, text: msg });
    } else if (card.id === 'turtle_block') {
      var targetTileIdx = (param && typeof param.tileIdx === 'number') ? clamp(param.tileIdx, 0, 27) : null;
      if (targetTileIdx === null) {
        // 默认优先摆在玩家过路费最高的巨城格，拦截霸主车驾收巨额过路费！
        var myCities = state.board.filter(function (t) { return t.type === 'city' && t.owner === 'player'; });
        myCities.sort(function (a, b) { return b.currentToll - a.currentToll; });
        targetTileIdx = myCities.length > 0 ? myCities[0].idx : ((state.player.pos + 3) % 28);
      }
      state.board[targetTileIdx].turtleBlock = true;
      msg = '施放《路障乌龟》：在【' + state.board[targetTileIdx].name + '】摆下慢吞吞乌龟，路过车驾必停踩雷！';
      events.push({ type: 'turtle_placed', tileIdx: targetTileIdx, text: msg });
    } else if (card.id === 'fire_camp') {
      var enemyCities = state.board.filter(function (t) { return t.type === 'city' && t.owner && t.owner !== 'player'; });
      enemyCities.sort(function (a, b) { return b.level - a.level || b.basePrice - a.basePrice; });
      if (enemyCities.length > 0) {
        var burnCity = enemyCities[0];
        burnCity.brokenLoops = Math.max(burnCity.brokenLoops, 3);
        var removedBldg = burnCity.buildings.pop();
        msg = '施放《火烧连营》：【' + burnCity.name + '】陷入火海挂 3 圈溃散白旗' + (removedBldg ? '，烧毁敌方' + DATA.BUILDINGS[removedBldg].name : '') + '！';
        events.push({ type: 'fire_camp', tileIdx: burnCity.idx, text: msg });
      } else {
        msg = '敌方已无城可烧，篝火烤肉补兵 +300！';
        state.player.troops += 300;
      }
    } else if (card.id === 'god_possess') {
      state.player.buffs.godPossessTicks = 3;
      state.player.buffs.freeTollCharges = 1;
      msg = '施放《神明附体》：3 刻内免交过路费 1 次，且收租与聚宝盆收益 +50%！';
      events.push({ type: 'god_possess', text: msg });
    }

    cards.splice(idx, 1);
    addLog(msg, 'good');
    recomputeAllDerived(state);

    return {
      ok: true,
      card: card,
      message: msg,
      quote: card.quote,
      events: events,
      state: getState()
    };
  }

  // ==================== 割地抵债、破产与清盘公共处理 ====================

  // 霸主支付银两给债主（toOwner = 'player' | hegemonId | 'pot'），不足时触发割地抵债或穿花裤衩破产！
  function chargeHegemon(heg, amount, toOwner, events) {
    if (!heg || heg.bankrupt || amount <= 0) return { paidCash: 0, mortgagedCities: [], bankrupted: false };

    var remaining = Math.round(amount);
    var paidCash = Math.min(heg.vault, remaining);
    heg.vault -= paidCash;
    remaining -= paidCash;

    if (toOwner === 'player') {
      state.player.silver += paidCash;
      state.player.tollCollectedTotal += paidCash;
      if (hasPolicy('P07')) {
        var chunks = Math.floor(paidCash / 1000);
        if (chunks > 0) {
          state.player.troops = Math.min(state.player.maxTroops, state.player.troops + chunks * 60);
          state.player.artilleryBonusPct = Math.min(0.30, state.player.artilleryBonusPct + chunks * 0.02);
        }
      }
    } else if (toOwner && toOwner !== 'system') {
      var otherHeg = getHegemonById(toOwner, state);
      if (otherHeg && !otherHeg.bankrupt) otherHeg.vault += paidCash;
    }

    var mortgagedCities = [];
    var bankrupted = false;

    // 现金不够，触发割地抵债！
    if (remaining > 0) {
      var myCities = state.board.filter(function (t) {
        return t.type === 'city' && t.owner === heg.id;
      });
      myCities.sort(function (a, b) {
        return calcCityCumCost(a) - calcCityCumCost(b);
      });

      while (remaining > 0 && myCities.length > 0) {
        // 若单座城即可覆盖优先找最接近且能覆盖的，否则从低到高割
        var pickIdx = 0;
        for (var c = 0; c < myCities.length; c++) {
          if (calcCityCumCost(myCities[c]) >= remaining) {
            pickIdx = c;
            break;
          }
        }
        var deedCity = myCities.splice(pickIdx, 1)[0];
        var val = calcCityCumCost(deedCity);
        remaining -= val;

        if (toOwner === 'player') {
          deedCity.owner = 'player';
          // 换上玩家空闲候补太守
          deedCity.governorId = pickFreePlayerGovernor(state);
          checkPlayerRegionMonopoly(deedCity.region);
        } else if (toOwner && getHegemonById(toOwner, state)) {
          deedCity.owner = toOwner;
        } else {
          deedCity.owner = null;
          state.foreclosedTiles.push(deedCity.idx);
        }

        mortgagedCities.push({ tileIdx: deedCity.idx, name: deedCity.name, value: val });
        var mText = heg.name + '现金见底，割让【' + deedCity.name + '】（估值' + val + '两）抵债过户！';
        addLog(mText, 'good');
        if (events) {
          events.push({
            type: 'hegemon_mortgage',
            hegemonId: heg.id,
            tileIdx: deedCity.idx,
            cityName: deedCity.name,
            toOwner: toOwner,
            quote: DATA.HEGEMONS[heg.id].quotes.mortgage,
            text: mText
          });
        }
      }

      // 割光所有城池仍还不上 -> 穿碎花裤衩破产退场！
      if (remaining > 0 && myCities.length === 0) {
        heg.bankrupt = true;
        heg.vault = 0;
        heg.paralyzedTicks = 0;
        bankrupted = true;
        // 移除该霸主的讨债队与任何残留飞地
        state.debtTeams = state.debtTeams.filter(function (dt) { return dt.ownerId !== heg.id; });
        for (var k = 0; k < state.board.length; k++) {
          if (state.board[k].owner === heg.id) {
            state.board[k].owner = null;
            if (state.foreclosedTiles.indexOf(k) < 0) state.foreclosedTiles.push(k);
          }
        }
        var bQuote = DATA.HEGEMONS[heg.id].quotes.bankrupt;
        var bText = heg.name + '破产退场！穿上碎花裤衩背小包袱狂奔：「' + bQuote + '」';
        addLog(bText, 'good');
        if (events) {
          events.push({
            type: 'hegemon_bankrupt',
            hegemonId: heg.id,
            hegemonName: heg.name,
            img: DATA.ASSETS.chars.bankrupt_pants,
            quote: bQuote,
            text: bText
          });
        }
      }
    }

    return {
      paidCash: paidCash,
      mortgagedCities: mortgagedCities,
      bankrupted: bankrupted
    };
  }

  // 玩家扣付银两（不足时自动割地抵债 -> 气运签救命 -> 破产）
  function chargePlayer(amount, creditorId, events) {
    var cost = Math.round(amount);
    if (cost <= 0) return { paid: 0, mortgaged: [], savedByStick: false, bankrupt: false };

    var potFeed = Math.round(cost * 0.20);
    state.jackpotPot += potFeed;

    if (state.player.silver >= cost) {
      state.player.silver -= cost;
      if (creditorId && creditorId !== 'system') {
        var cred = getHegemonById(creditorId, state);
        if (cred && !cred.bankrupt) cred.vault += cost;
      }
      return { paid: cost, mortgaged: [], savedByStick: false, bankrupt: false };
    }

    var cashPaid = Math.max(0, state.player.silver);
    var deficit = cost - cashPaid;
    state.player.silver = 0;
    if (creditorId && creditorId !== 'system') {
      var cred2 = getHegemonById(creditorId, state);
      if (cred2 && !cred2.bankrupt) cred2.vault += cashPaid;
    }

    var mortgaged = [];
    var myCities = state.board.filter(function (t) {
      return t.type === 'city' && t.owner === 'player';
    });
    myCities.sort(function (a, b) {
      return calcCityCumCost(a) - calcCityCumCost(b);
    });

    while (deficit > 0 && myCities.length > 0) {
      var cCity = myCities.shift();
      var val = calcCityCumCost(cCity);
      deficit -= val;
      if (creditorId && creditorId !== 'system' && getHegemonById(creditorId, state) && !getHegemonById(creditorId, state).bankrupt) {
        cCity.owner = creditorId;
        cCity.governorId = creditorId === 'caocao' ? 'xiahoudun' : 'zhouyu';
      } else {
        cCity.owner = null;
        cCity.governorId = null;
      }
      mortgaged.push({ tileIdx: cCity.idx, name: cCity.name, value: val });
      var msg = '荷包见底！忍痛割让【' + cCity.name + '】抵债，留得青山在！';
      addLog(msg, 'bad');
      if (events) events.push({ type: 'player_mortgage', tileIdx: cCity.idx, cityName: cCity.name, text: msg });
    }

    if (deficit > 0) {
      if (state.player.luckSticks > 0) {
        state.player.luckSticks -= 1;
        state.player.silver = 300;
        var saveMsg = '濒临破产！消耗 1 支气运签逆天续命，乡亲凑出 300 两救急盘缠！';
        addLog(saveMsg, 'warn');
        if (events) events.push({ type: 'player_stick_save', text: saveMsg });
        return { paid: cost, mortgaged: mortgaged, savedByStick: true, bankrupt: false };
      }
      state.phase = 'GAME_OVER';
      var loseQuote = DATA.LORDS[state.player.lordId].quotes.bankrupt[0];
      addLog('主公破产跑路：「' + loseQuote + '」', 'bad');
      if (events) events.push({ type: 'player_bankrupt', quote: loseQuote });
      return { paid: cashPaid, mortgaged: mortgaged, savedByStick: false, bankrupt: true };
    }

    return { paid: cost, mortgaged: mortgaged, savedByStick: false, bankrupt: false };
  }

  function pickFreePlayerGovernor(st) {
    var s = st || state;
    var used = {};
    for (var i = 0; i < s.board.length; i++) {
      if (s.board[i].owner === 'player' && s.board[i].governorId) {
        used[s.board[i].governorId] = true;
      }
    }
    var roster = s.player.rosterGovernors;
    for (var j = 0; j < roster.length; j++) {
      if (!used[roster[j]]) return roster[j];
    }
    return null;
  }

  function checkPlayerRegionMonopoly(regionId) {
    if (!regionId || !state) return false;
    if (state.player.monopolyRewardedRegions.indexOf(regionId) >= 0) return false;
    var reg = DATA.REGIONS[regionId];
    if (!reg) return false;
    var allMine = reg.tiles.every(function (tIdx) {
      return state.board[tIdx].owner === 'player';
    });
    if (allMine) {
      state.player.monopolyRewardedRegions.push(regionId);
      state.pendingPoliciesCount += 1;
      addLog('霸业里程碑：全州垄断【' + reg.name + '】！过路费翻倍并获赠 1 次里民大会政见！', 'good');
      return true;
    }
    return false;
  }

  // ==================== 掷骰、同步落子与重摇回滚 ====================

  function rollSingleDie(isFirstDieWithP24) {
    var v = randInt(1, 6);
    if (isFirstDieWithP24 && v === 1) return 6; // P24 灌铅品管：1点改刻6点
    return v;
  }

  function rollDice(forcedD1, forcedD2) {
    if (!state) newGame();
    if (state.phase !== 'IDLE') {
      return { ok: false, message: '当前阶段（' + state.phase + '）请先完成面板操作再掷骰！', state: getState() };
    }

    // 保存掷骰前干净快照（供气运签改命重摇）
    var snapshotCandidate = deepClone(state);
    snapshotCandidate.canReroll = false;

    state.tick += 1;
    var events = [];
    var p = state.player;

    // 1. 生成双骰点数（或消费《安步当车》遥控步数）
    var d1, d2, sum;
    var usedRemoteSteps = false;
    if (p.buffs.forcedSteps > 0) {
      sum = clamp(p.buffs.forcedSteps, 1, 12);
      p.buffs.forcedSteps = 0;
      usedRemoteSteps = true;
      if (sum === 1) {
        d1 = 1; d2 = 0;
      } else {
        d1 = Math.max(1, Math.min(6, Math.floor(sum / 2)));
        d2 = sum - d1;
      }
    } else if (typeof forcedD1 === 'number' && typeof forcedD2 === 'number') {
      d1 = clamp(Math.round(forcedD1), 1, 6);
      d2 = clamp(Math.round(forcedD2), 1, 6);
      sum = d1 + d2;
    } else {
      d1 = rollSingleDie(hasPolicy('P24'));
      d2 = rollSingleDie(false);
      sum = d1 + d2;
    }

    // 2. 对子判定（衰尾对 1+1 / 十八啦 6+6 / 欢喜对 / P22 差1点准对子）
    var pairType = 'none';
    var bonusSilver = 0;
    var extraRollGranted = false;
    var stipend = calcBaseStipend(state.loop, state);

    if (!usedRemoteSteps && d1 > 0 && d2 > 0) {
      if (d1 === 1 && d2 === 1) {
        pairType = 'snake';
      } else if (d1 === 6 && d2 === 6) {
        pairType = 'shibala';
      } else if (d1 === d2) {
        pairType = 'happy';
      } else if (Math.abs(d1 - d2) === 1 && hasPolicy('P22') && !p.buffs.p22UsedThisLoop) {
        pairType = 'happy';
        p.buffs.p22UsedThisLoop = true;
        events.push({ type: 'policy_proc', text: '触发《差一点也算对》：视同欢喜对！' });
      }
    }

    // P19 逢六进宝
    if (hasPolicy('P19')) {
      var sixCount = (d1 === 6 ? 1 : 0) + (d2 === 6 ? 1 : 0);
      if (sixCount > 0) {
        var sixBonus = Math.round(stipend * 0.35 * sixCount);
        p.silver += sixBonus;
        bonusSilver += sixBonus;
      }
    }

    if (pairType !== 'none') {
      state.consecPairs += 1;
      if (state.consecPairs >= 3) {
        // 连掷 3 次对子封顶赏 500 两赌神花红，防无限连掷
        state.consecPairs = 0;
        extraRollGranted = false;
        p.silver += 500;
        bonusSilver += 500;
        events.push({ type: 'pair_cap_bonus', amount: 500, text: '连开三把欢喜对！赏「赌神花红」500 两！' });
      } else {
        extraRollGranted = true;
      }
      state.extraRollPending = extraRollGranted;

      if (hasPolicy('P17')) {
        var p17Cash = Math.round(stipend * 0.60);
        p.silver += p17Cash;
        bonusSilver += p17Cash;
      }

      if (pairType === 'snake') {
        if (p.luckSticks < p.maxLuckSticks) {
          p.luckSticks += 1;
          events.push({ type: 'snake_eyes', stickAdded: 1, text: DATA.QUOTES.snakeEyesCall });
        } else {
          var halfStip = Math.round(stipend * 0.5);
          p.silver += halfStip;
          bonusSilver += halfStip;
          events.push({ type: 'snake_eyes', silverAdded: halfStip, text: '衰尾对！气运签已满，折发半份俸禄 +' + halfStip + ' 两！' });
        }
        addLog(DATA.QUOTES.snakeEyesCall, 'good');
      } else if (pairType === 'shibala') {
        var shibalaPrize = Math.round(stipend * state.betMultiplier);
        p.silver += shibalaPrize;
        bonusSilver += shibalaPrize;
        if (!p.firstShibalaDone) {
          p.firstShibalaDone = true;
          state.pendingPoliciesCount += 1;
        }
        var sbQuote = pickOne(DATA.LORDS[p.lordId].quotes.shibala);
        events.push({ type: 'shibala', prize: shibalaPrize, quote: sbQuote, text: DATA.QUOTES.shibalaCall + ' 彩金 +' + shibalaPrize + ' 两！' });
        addLog('掷出双六「十八啦！」获彩金 +' + shibalaPrize + ' 两！' + p.name + '：「' + sbQuote + '」', 'good');
      } else {
        events.push({ type: 'happy_pair', text: DATA.QUOTES.happyPairCall });
        addLog(DATA.QUOTES.happyPairCall, 'good');
      }
    } else {
      state.consecPairs = 0;
      state.extraRollPending = false;
    }

    // 3. 玩家沿顺时针逐格移动（检查过 0 起点、17 号虎牢拦停、敌方箭塔与讨债队）
    var path = [];
    var stoppedAt17 = false;
    var passedStart = false;
    var scale = calcLoopScale(state.loop);

    for (var step = 1; step <= sum; step++) {
      var nextPos = (p.pos + 1) % 28;
      p.pos = nextPos;
      path.push(nextPos);

      if (nextPos === 0) {
        passedStart = true;
        state.pendingLoopPass = true;
      }

      // 路过敌方箭塔挨箭
      var curTile = state.board[nextPos];
      if (curTile.type === 'city' && curTile.owner && curTile.owner !== 'player' && curTile.buildings.indexOf('arrow_tower') >= 0) {
        var arrowDmg = Math.round(85 * scale);
        p.troops = Math.max(0, p.troops - arrowDmg);
        events.push({ type: 'player_hit_by_arrow', tileIdx: nextPos, dmg: arrowDmg, text: '经过【' + curTile.name + '】挨敌箭塔一箭，护卫兵力 -' + arrowDmg + '！' });
      }

      // 检查是否撞上讨债队
      var debtHit = checkAndResolveDebtCollision(nextPos, events);
      if (debtHit) {
        // 已结算快斩讨债队，继续走到终点
      }

      // 17 号虎牢黑心收费站：经过必停（每圈限拦 1 次）
      if (nextPos === 17 && state.specialMode === 'hulao' && !p.buffs.hulaoPaidThisLoop && step < sum) {
        stoppedAt17 = true;
        events.push({ type: 'hulao_intercept', tileIdx: 17, text: '吕布横戟拦在【虎牢黑心收费站】：此树是我栽，交养护费或下马单挑！' });
        break;
      }
    }

    if (p.pos === 0 && passedStart) {
      state.exactStartBonusPending = true;
    }

    // 4. 逆时针讨债队同步走 1D6（若尚未撞上玩家）
    moveDebtTeams(events);

    // 5. 同刻！场上未破产霸主车驾各走 1D6 并自动完成非阻塞结算！
    var hegemonActions = moveAllHegemonsSimultaneously(events);

    // 神明附体剩余刻递减
    if (p.buffs.godPossessTicks > 0) {
      p.buffs.godPossessTicks -= 1;
      if (p.buffs.godPossessTicks <= 0) p.buffs.freeTollCharges = 0;
    }

    recomputeAllDerived(state);

    // 检查是否全灭霸主触发「清盘」大捷！
    var clearedAll = state.hegemons.every(function (h) { return h.bankrupt; });
    if (clearedAll) {
      var remainLoops = Math.max(0, state.maxLoops - state.loop);
      var clearBonus = remainLoops * calcBaseStipend(state.loop, state);
      p.silver += clearBonus;
      state.phase = 'BOSS_FINALE';
      state.canReroll = false;
      preRollSnapshot = null;
      recomputeAllDerived(state);
      var cMsg = DATA.QUOTES.clearBoardWin + (clearBonus > 0 ? '（提前领取剩余圈数保底俸禄 +' + clearBonus + ' 两）' : '');
      addLog(cMsg, 'good');
      events.push({ type: 'clear_board_victory', bonus: clearBonus, text: cMsg });
      var clearRes = {
        ok: true,
        dice: [d1, d2],
        sum: sum,
        pairType: pairType,
        extraRollGranted: false,
        bonusSilver: bonusSilver,
        path: path,
        stoppedAt17: stoppedAt17,
        hegemonActions: hegemonActions,
        passedStart: passedStart,
        clearedAllHegemons: true,
        canReroll: false,
        landingOptions: null,
        events: events,
        state: getState()
      };
      state.lastRollResult = {
        dice: [d1, d2],
        sum: sum,
        pairType: pairType,
        clearedAllHegemons: true
      };
      return clearRes;
    }

    // 准备当前落点可执行动作
    state.phase = 'LANDING';
    prepareTileDynamicDataOnLand(p.pos);
    recomputeAllDerived(state);

    preRollSnapshot = snapshotCandidate;
    state.canReroll = state.player.luckSticks > 0;

    var landingOptions = getLandingOptions();
    var result = {
      ok: true,
      dice: [d1, d2],
      sum: sum,
      pairType: pairType,
      extraRollGranted: extraRollGranted,
      bonusSilver: bonusSilver,
      path: path,
      finalTileIdx: p.pos,
      stoppedAt17: stoppedAt17,
      hegemonActions: hegemonActions,
      passedStart: passedStart,
      clearedAllHegemons: false,
      canReroll: state.canReroll,
      landingOptions: landingOptions,
      events: events,
      state: getState()
    };

    state.lastRollResult = {
      dice: [d1, d2],
      sum: sum,
      pairType: pairType,
      finalTileIdx: p.pos
    };
    return result;
  }

  // 消耗 1 支气运签撤回本刻凶险落点，重新摇一把！
  function rerollLastDice() {
    if (!state || !preRollSnapshot || !state.canReroll) {
      return { ok: false, message: '当前无法使用气运签重摇落点！', state: getState() };
    }
    if (preRollSnapshot.player.luckSticks <= 0) {
      return { ok: false, message: '气运签已经用光啦！', state: getState() };
    }

    var oldTileIdx = state.player.pos;
    // 无损回滚到掷骰前并扣 1 支签
    state = deepClone(preRollSnapshot);
    state.player.luckSticks -= 1;
    preRollSnapshot = null;
    addLog(DATA.QUOTES.rerollUsed + '（撤回原落点【' + DATA.TILES[oldTileIdx].name + '】）', 'warn');

    // 重新摇点（若恰巧摇出同一凶格，再重投一次骰子保证重摇体感爽快）
    var d1 = rollSingleDie(hasPolicy('P24', state));
    var d2 = rollSingleDie(false);
    if ((state.player.pos + d1 + d2) % 28 === oldTileIdx) {
      d1 = rollSingleDie(hasPolicy('P24', state));
      d2 = rollSingleDie(false);
    }

    var res = rollDice(d1, d2);
    // 重摇之后本刻不再叠加二次重摇快照（也可保留只要还有签就能继续改命）
    res.rerolledFromTile = oldTileIdx;
    return res;
  }

  // ==================== 讨债队与霸主车驾同步落子逻辑 ====================

  function checkAndResolveDebtCollision(tileIdx, events) {
    var foundIdx = -1;
    for (var i = 0; i < state.debtTeams.length; i++) {
      if (state.debtTeams[i].pos === tileIdx) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx < 0) return false;

    var dt = state.debtTeams.splice(foundIdx, 1)[0];
    var scale = calcLoopScale(state.loop);
    var eqStats = calcPlayerEquipStats(state);
    var vanguard = DATA.VANGUARDS[state.player.vanguardId];
    var myPwr = (vanguard.duel + state.player.permDuelBonus + eqStats.totalBonus) * (1 + state.player.stats.physique * 0.01);
    var dtPwr = 58 * scale;
    var winProb = clamp(myPwr / (myPwr + dtPwr), 0.15, 0.95);
    var win = Math.random() < winProb;
    var stipend = calcBaseStipend(state.loop, state);

    if (win) {
      var reward = Math.round(stipend * 0.8);
      state.player.silver += reward;
      var wMsg = '迎面撞上' + dt.ownerName + '讨债队！' + vanguard.name + '三拳揍翻恶霸，搜出走路工赏金 +' + reward + ' 两！';
      addLog(wMsg, 'good');
      events.push({ type: 'debt_team_clash', win: true, amount: reward, tileIdx: tileIdx, text: wMsg });
    } else {
      var charmDisc = Math.min(0.30, state.player.stats.charm * 0.003);
      var fine = Math.round(stipend * 1.1 * (1 - charmDisc));
      chargePlayer(fine, dt.ownerId, events);
      var lMsg = '被' + dt.ownerName + '讨债队堵个正着！被强收治安保护费 -' + fine + ' 两！';
      addLog(lMsg, 'bad');
      events.push({ type: 'debt_team_clash', win: false, amount: -fine, tileIdx: tileIdx, text: lMsg });
    }
    return true;
  }

  function moveDebtTeams(events) {
    for (var i = state.debtTeams.length - 1; i >= 0; i--) {
      var dt = state.debtTeams[i];
      if (!dt) continue;
      var steps = randInt(1, 6);
      var collided = false;
      for (var s = 1; s <= steps; s++) {
        dt.pos = (dt.pos - 1 + 28) % 28;
        if (dt.pos === state.player.pos) {
          checkAndResolveDebtCollision(dt.pos, events);
          collided = true;
          break;
        }
      }
      if (!collided) {
        events.push({ type: 'debt_team_move', id: dt.id, pos: dt.pos, steps: steps });
      }
    }
  }

  function isTileInPlayerArrowRange(tileIdx) {
    var hasP05 = hasPolicy('P05');
    var range = hasP05 ? [-1, 0, 1] : [0];
    var towers = [];
    for (var i = 0; i < range.length; i++) {
      var checkIdx = (tileIdx + range[i] + 28) % 28;
      var t = state.board[checkIdx];
      if (t.type === 'city' && t.owner === 'player' && t.buildings.indexOf('arrow_tower') >= 0) {
        towers.push(t);
      }
    }
    return towers;
  }

  function moveAllHegemonsSimultaneously(events) {
    var scale = calcLoopScale(state.loop);
    var safetyLine = calcBaseStipend(state.loop, state) * 1.5;
    var actions = [];

    for (var i = 0; i < state.hegemons.length; i++) {
      var heg = state.hegemons[i];
      if (heg.bankrupt) continue;

      if (heg.paralyzedTicks > 0) {
        heg.paralyzedTicks -= 1;
        actions.push({
          hegemonId: heg.id,
          name: heg.name,
          status: 'paralyzed',
          pos: heg.pos,
          remainingParalyzed: heg.paralyzedTicks,
          text: heg.name + '车驾在主城冒烟大修中（剩 ' + heg.paralyzedTicks + ' 刻）'
        });
        continue;
      }

      var roll = randInt(1, 6);
      var startPos = heg.pos;
      var path = [];
      var hitTowersMap = {};
      var paralyzedNow = false;

      for (var step = 1; step <= roll; step++) {
        heg.pos = (heg.pos + 1) % 28;
        path.push(heg.pos);
        var stepTile = state.board[heg.pos];

        // 检查玩家《路障乌龟》绊停
        if (stepTile.turtleBlock) {
          stepTile.turtleBlock = false;
          events.push({ type: 'turtle_triggered', hegemonId: heg.id, tileIdx: heg.pos, text: heg.name + '车驾被路障乌龟绊住，一脚停在【' + stepTile.name + '】！' });
          break;
        }

        // 检查路过（未停）玩家私掠站拔毛 10%
        if (step < roll && stepTile.type === 'city' && stepTile.owner === 'player' && stepTile.buildings.indexOf('plunder') >= 0) {
          var skim = Math.min(heg.vault, Math.max(25, Math.round(calcToll(heg.pos, 'hegemon', state) * 0.10)));
          if (skim > 0) {
            heg.vault -= skim;
            state.player.silver += skim;
            events.push({ type: 'plunder_skim', hegemonId: heg.id, tileIdx: heg.pos, amount: skim, text: heg.name + '路过【' + stepTile.name + '】私掠站被拔毛 +' + skim + ' 两！' });
          }
        }

        // 检查玩家箭塔射程（每座箭塔每刻对同一车驾最多射 1 箭）
        var nearTowers = isTileInPlayerArrowRange(heg.pos);
        for (var tw = 0; tw < nearTowers.length; tw++) {
          var twCity = nearTowers[tw];
          if (!hitTowersMap[twCity.idx]) {
            hitTowersMap[twCity.idx] = true;
            var dmg = Math.round(110 * scale * (hasPolicy('P05') ? 1.5 : 1.0));
            heg.guardHp = Math.max(0, heg.guardHp - dmg);
            events.push({
              type: 'arrow_tower_shot',
              hegemonId: heg.id,
              fromTileIdx: twCity.idx,
              dmg: dmg,
              guardHpLeft: heg.guardHp,
              text: '【' + twCity.name + '】箭塔劲弩破空！' + heg.name + '车驾护卫 -' + dmg + '！'
            });
            if (heg.guardHp <= 0) {
              heg.paralyzedTicks = 3;
              heg.pos = heg.homeTile;
              paralyzedNow = true;
              var pQuote = DATA.HEGEMONS[heg.id].quotes.paralyzed;
              var pMsg = heg.name + '保镖被射穿！车驾瘫痪拖回老家修 3 刻（名下全城守军打七折）！';
              addLog(pMsg, 'good');
              events.push({ type: 'hegemon_paralyzed', hegemonId: heg.id, quote: pQuote, text: pMsg });
              break;
            }
          }
        }
        if (paralyzedNow) break;
      }

      if (paralyzedNow) {
        actions.push({
          hegemonId: heg.id,
          name: heg.name,
          roll: roll,
          fromPos: startPos,
          pos: heg.pos,
          path: path,
          outcome: 'paralyzed',
          quote: DATA.HEGEMONS[heg.id].quotes.paralyzed
        });
        continue;
      }

      // 车驾落点自动结算（严守同刻先后律：玩家所在无主城留给玩家优先买！）
      var landTile = state.board[heg.pos];
      var outcome = 'pass';
      var quote = '';
      var deltaSilver = 0;

      if (landTile.type === 'city') {
        if (!landTile.owner && heg.pos !== state.player.pos) {
          var buyProb = heg.ambitionStage === 1 ? 0.80 : (heg.ambitionStage === 2 ? 0.92 : 1.0);
          if (heg.vault - landTile.basePrice >= safetyLine * 0.5 && Math.random() < buyProb) {
            heg.vault -= landTile.basePrice;
            landTile.owner = heg.id;
            landTile.level = heg.ambitionStage >= 3 && heg.vault > landTile.basePrice ? 2 : 1;
            landTile.governorId = heg.id === 'caocao' ? 'xiahoudun' : 'ganning';
            outcome = 'buy_city';
            quote = DATA.HEGEMONS[heg.id].quotes.buyCity;
            events.push({ type: 'hegemon_buy', hegemonId: heg.id, tileIdx: heg.pos, cityName: landTile.name, text: heg.name + '占领了【' + landTile.name + '】！' });
          }
        } else if (landTile.owner === heg.id) {
          var upCost = calcCityUpgradeCost(landTile, false, state);
          if (landTile.level < 5 && heg.vault - upCost >= safetyLine * 0.6 && Math.random() < 0.72) {
            heg.vault -= upCost;
            landTile.level += 1;
            outcome = 'upgrade_city';
            quote = DATA.HEGEMONS[heg.id].quotes.upgrade;
            events.push({ type: 'hegemon_upgrade', hegemonId: heg.id, tileIdx: heg.pos, level: landTile.level, text: heg.name + '将【' + landTile.name + '】扩建至 Lv.' + landTile.level + '！' });
          } else if (heg.ambitionStage >= 2 && landTile.buildings.length < DATA.CITY_SCALE[landTile.level].slots) {
            var prefs = DATA.HEGEMONS[heg.id].preferredBuildings;
            for (var pb = 0; pb < prefs.length; pb++) {
              var bId = prefs[pb];
              var bCost = Math.round(landTile.basePrice * DATA.BUILDINGS[bId].costFactor);
              if (landTile.buildings.indexOf(bId) < 0 && heg.vault - bCost >= safetyLine) {
                heg.vault -= bCost;
                landTile.buildings.push(bId);
                outcome = 'build';
                events.push({ type: 'hegemon_build', hegemonId: heg.id, tileIdx: heg.pos, buildingName: DATA.BUILDINGS[bId].name, text: heg.name + '在【' + landTile.name + '】加盖了' + DATA.BUILDINGS[bId].name + '！' });
                break;
              }
            }
          }
        } else if (landTile.owner === 'player') {
          // 霸主踩进玩家城池！
          recomputeAllDerived(state);
          var toll = calcToll(landTile.idx, 'hegemon', state);
          if (heg.evadeTollShield > 0) {
            heg.evadeTollShield -= 1;
            toll = Math.round(toll * 0.40);
          }

          // 判断是否触发「上门找茬」（第1~5圈 100% 乖乖交钱送第一桶金！）
          var tryTrouble = false;
          var rivalWinProb = 0;
          if (heg.ambitionStage >= 2 && heg.guardHp > heg.maxGuardHp * 0.4) {
            var playerGov = DATA.GOVERNORS[landTile.governorId || 'lizhangbo'] || DATA.GOVERNORS.lizhangbo;
            var hegPower = 92 * scale;
            var defPower = Math.max(50, landTile.garrison * 0.12 + playerGov.duel * (1 + playerGov.field));
            if (landTile.buildings.indexOf('altar') >= 0) defPower *= 1.25;
            rivalWinProb = hegPower / (hegPower + defPower);
            var threshold = heg.ambitionStage === 2 ? 0.62 : 0.52;
            if (rivalWinProb >= threshold) tryTrouble = true;
          }

          if (tryTrouble) {
            var rivalWins = Math.random() < rivalWinProb;
            if (rivalWins) {
              landTile.brokenLoops = Math.max(landTile.brokenLoops, 2);
              outcome = 'trouble_win';
              quote = DATA.HEGEMONS[heg.id].quotes.troubleWin;
              var twText = heg.name + '在【' + landTile.name + '】上门找茬得手，白住一晚并挂上溃散白旗！';
              addLog(twText, 'warn');
              events.push({ type: 'hegemon_trouble', hegemonId: heg.id, playerDefended: false, tileIdx: heg.pos, quote: quote, text: twText });
            } else {
              var doubleToll = toll * 2;
              heg.guardHp = Math.max(20, Math.floor(heg.guardHp * 0.5));
              var payRes2 = chargeHegemon(heg, doubleToll, 'player', events);
              deltaSilver = payRes2.paidCash;
              outcome = 'trouble_lose_double_pay';
              quote = DATA.HEGEMONS[heg.id].quotes.troubleLose;
              var tlText = heg.name + '在【' + landTile.name + '】上门找茬踢到铁板！向主公双倍赔付 +' + doubleToll + ' 两！';
              addLog(tlText, 'good');
              events.push({ type: 'hegemon_trouble', hegemonId: heg.id, playerDefended: true, amount: doubleToll, tileIdx: heg.pos, cryImg: heg.cryImg, quote: quote, text: tlText });
            }
          } else {
            // 天师坛额外抽香油钱 5%（上限 0.5T）
            var altarExtra = 0;
            if (landTile.buildings.indexOf('altar') >= 0 && heg.vault > toll) {
              altarExtra = Math.min(Math.round(toll * 0.5), Math.round((heg.vault - toll) * 0.05));
            }
            var totalDue = toll + altarExtra;
            var payRes = chargeHegemon(heg, totalDue, 'player', events);
            deltaSilver = payRes.paidCash;
            outcome = 'pay_player_toll';
            quote = DATA.HEGEMONS[heg.id].quotes.payToll;
            var payText = heg.name + '一脚踩进你家【' + landTile.name + '】，肉痛掏出过路费 +' + totalDue + ' 两！';
            addLog(payText, 'good');
            events.push({
              type: 'hegemon_pay_player',
              hegemonId: heg.id,
              hegemonName: heg.name,
              cryImg: heg.cryImg,
              tileIdx: heg.pos,
              cityName: landTile.name,
              amount: totalDue,
              paidCash: payRes.paidCash,
              mortgagedCities: payRes.mortgagedCities,
              bankrupted: payRes.bankrupted,
              quote: quote,
              text: payText
            });
          }
        } else if (landTile.owner && landTile.owner !== heg.id) {
          // 霸主互踩交过路费
          var interToll = calcToll(landTile.idx, 'raw', state);
          chargeHegemon(heg, interToll, landTile.owner, events);
          outcome = 'pay_other_hegemon';
        }
      } else if (landTile.type === 'pot' && heg.pos !== state.player.pos) {
        var grabbed = state.jackpotPot;
        heg.vault += grabbed;
        state.jackpotPot = 1500;
        outcome = 'grab_pot';
        var potMsg = '夭寿哦！攒了 ' + grabbed + ' 两的风水聚宝盆被' + heg.name + '截胡抱走啦！';
        addLog(potMsg, 'warn');
        events.push({ type: 'hegemon_grab_pot', hegemonId: heg.id, amount: grabbed, text: potMsg });
      }

      var summaryText = '';
      if (outcome === 'pay_player_toll') summaryText = heg.name + '踩中你家【' + landTile.name + '】，缴交过路费 +' + deltaSilver + ' 两！';
      else if (outcome === 'trouble_lose_double_pay') summaryText = heg.name + '上门找茬踢铁板，双倍赔你 +' + deltaSilver + ' 两！';
      else if (outcome === 'trouble_win') summaryText = heg.name + '在【' + landTile.name + '】找茬白住一晚！';
      else if (outcome === 'buy_city') summaryText = heg.name + '占领了无主城【' + landTile.name + '】';
      else if (outcome === 'upgrade_city') summaryText = heg.name + '将【' + landTile.name + '】升至 Lv.' + landTile.level;
      else if (outcome === 'grab_pot') summaryText = heg.name + '截胡抱走了风水聚宝盆！';

      actions.push({
        hegemonId: heg.id,
        name: heg.name,
        cryImg: heg.cryImg,
        roll: roll,
        fromPos: startPos,
        pos: heg.pos,
        path: path,
        type: outcome === 'trouble_lose_double_pay' ? 'trouble_lose' : outcome,
        outcome: outcome,
        deltaSilver: deltaSilver,
        silverToPlayer: deltaSilver,
        summary: summaryText || quote,
        quote: quote,
        bankrupt: heg.bankrupt
      });
    }

    return actions;
  }

  // ==================== 落点准备与 getLandingOptions ====================

  function prepareTileDynamicDataOnLand(tileIdx) {
    var tile = state.board[tileIdx];
    state.currentMarketItems = [];
    state.currentEventData = null;
    state.currentFortuneStick = null;

    if (tile.type === 'market') {
      var half = tile.halfPriceLoops > 0 ? 0.5 : 1.0;
      var charmDisc = Math.min(0.30, state.player.stats.charm * 0.003);
      var stipend = calcBaseStipend(state.loop, state);

      // 货位1：高阶装备
      var eqPool = ['butcher_knife', 'stool', 'tiger_hat', 'rattan_armor', 'green_dragon', 'red_hare'];
      if (state.loop >= 9) eqPool.push('golden_cudgel');
      var eqId = pickOne(eqPool);
      var eqDef = DATA.EQUIPMENTS[eqId];
      var eqPrice = Math.max(180, Math.round(stipend * DATA.RARITY[eqDef.rarity].sellFactor * 1.8 * half * (1 - charmDisc)));

      // 货位2：棋盘锦囊
      var bcKey = pickOne(Object.keys(DATA.BOARD_CARDS));
      var bcDef = DATA.BOARD_CARDS[bcKey];
      var bcPrice = Math.max(120, Math.round(bcDef.price * half * (1 - charmDisc)));

      // 货位3：战斗奇策
      var ccKey = pickOne(Object.keys(DATA.COMBAT_CARDS));
      var ccDef = DATA.COMBAT_CARDS[ccKey];
      var ccPrice = Math.max(100, Math.round(ccDef.price * half * (1 - charmDisc)));

      // 货位4：补兵烧饼 + 冲车零件
      var bunPrice = Math.max(80, Math.round(220 * half * (1 - charmDisc)));

      state.currentMarketItems = [
        { slotIdx: 0, kind: 'equip', itemId: eqId, name: eqDef.name, rarity: eqDef.rarity, price: eqPrice, desc: '+' + eqDef.bonus + '｜' + eqDef.perk, bought: false },
        { slotIdx: 1, kind: 'board_card', itemId: bcKey, name: bcDef.name, rarity: bcDef.rarity, price: bcPrice, desc: bcDef.desc, bought: false },
        { slotIdx: 2, kind: 'combat_card', itemId: ccKey, name: ccDef.name, rarity: ccDef.rarity, price: ccPrice, desc: ccDef.desc, bought: false },
        { slotIdx: 3, kind: 'troops_bun', itemId: 'bun', name: '胡椒大烧饼×3笼', rarity: 'R', price: bunPrice, desc: '随行护卫兵力立即 +350，攻城加成 +15%！', bought: false }
      ];
    } else if (tile.type === 'event') {
      // 检查是否触发 Callback 跨圈因果重逢！
      var flagKeys = Object.keys(state.player.callbackFlags);
      var readyFlag = null;
      for (var i = 0; i < flagKeys.length; i++) {
        var fk = flagKeys[i];
        var rec = state.player.callbackFlags[fk];
        if (rec && !rec.resolved && (tileIdx === 27 || state.loop - rec.plantedLoop >= 2)) {
          readyFlag = rec;
          break;
        }
      }
      if (readyFlag) {
        var evDef = DATA.CALLBACK_EVENTS.find(function (e) { return e.id === readyFlag.eventId; });
        if (evDef && evDef.payoffs[readyFlag.flag]) {
          state.currentEventData = {
            mode: 'payoff',
            eventId: evDef.id,
            flag: readyFlag.flag,
            title: evDef.title + ' · 因果兑现！',
            payoff: evDef.payoffs[readyFlag.flag]
          };
          return;
        }
      }

      // 否则抽取一段新奇遇种因
      var unseen = DATA.CALLBACK_EVENTS.filter(function (e) {
        return state.player.seenEvents.indexOf(e.id) < 0;
      });
      var chosen = pickOne(unseen.length > 0 ? unseen : DATA.CALLBACK_EVENTS);
      state.currentEventData = {
        mode: 'plant',
        eventId: chosen.id,
        title: chosen.title,
        intro: chosen.intro,
        choices: chosen.choices
      };
    }
  }

  function colorTagForWinRate(pct) {
    if (pct >= 65) return 'green';
    if (pct >= 42) return 'amber';
    return 'red';
  }

  function getLandingOptions() {
    if (!state) newGame();
    recomputeAllDerived(state);

    var p = state.player;
    var tile = state.board[p.pos];
    var actions = [];
    var title = tile.name;
    var subtitle = tile.desc;
    var mood = 'neutral';
    var tollAmount = 0;
    var extraData = {};

    if (tile.type === 'start') {
      mood = 'happy';
      var bonus = state.exactStartBonusPending ? Math.round(calcBaseStipend(state.loop, state) * 0.5) : 0;
      subtitle = bonus > 0 ? (DATA.QUOTES.exactStart + '（+' + bonus + ' 两）') : DATA.QUOTES.loopPass;
      actions.push({ key: 'start_pass', label: '领赏过圈置业！', sublabel: bonus > 0 ? ('全勤奖 +' + bonus + ' 两') : '进入过圈结算', colorTag: 'gold', disabled: false });
    } else if (tile.type === 'city') {
      if (!tile.owner) {
        mood = 'happy';
        var price = p.lordId === 'dongzhuo' ? Math.round(tile.basePrice * 0.8) : tile.basePrice;
        var canBuy = p.silver >= price;
        var redText = tile.bonusRedPacket > 0 ? ('（乡民集资红包倒贴 +' + tile.bonusRedPacket + ' 两！）') : '';
        subtitle = tile.regionName + '·' + tile.tier + '（' + tile.terrainName + '地）地价 ' + price + ' 两' + (p.lordId === 'dongzhuo' ? '［董卓强占八折］' : '') + redText;
        actions.push({
          key: 'buy_city',
          label: DATA.QUOTES.buyCityBtn + '（-' + price + ' 两）',
          sublabel: canBuy ? ('占为 Lv.1 产业' + (tile.bonusRedPacket > 0 ? ' 领红包+' + tile.bonusRedPacket : '')) : '现金不足买下此城',
          cost: price,
          colorTag: 'green',
          disabled: !canBuy,
          disabledReason: canBuy ? '' : '银两不足'
        });
        actions.push({
          key: 'skip',
          label: '先逛逛不买',
          sublabel: '留着银两防身',
          colorTag: 'gray',
          disabled: false
        });
      } else if (tile.owner === 'player') {
        mood = 'happy';
        var visitTax = calcCityTax(tile, state) * state.betMultiplier * (p.lordId === 'liubei' ? 2 : 1) * (hasPolicy('P03') ? 2 : 1);
        if (tile.buildings.indexOf('market') >= 0) {
          visitTax += Math.round(calcBaseStipend(state.loop, state) * 0.25);
        }
        var upCost = calcCityUpgradeCost(tile, false, state);
        var canUp = tile.level < 5 && p.silver + visitTax >= upCost;
        subtitle = DATA.QUOTES.visitCity + '（探班私房税 +' + visitTax + ' 两）';
        if (tile.level < 5) {
          actions.push({
            key: 'visit_upgrade',
            label: '领税 +' + visitTax + ' 并插队升 Lv.' + (tile.level + 1) + '（-' + upCost + ' 两）',
            sublabel: '探班特权：过路费当场翻倍！',
            colorTag: 'gold',
            disabled: !canUp,
            disabledReason: canUp ? '' : '银两不足升级'
          });
        }
        actions.push({
          key: 'visit_collect',
          label: '笑纳私房税 +' + visitTax + ' 两' + (p.lordId === 'liubei' ? '（回兵+150）' : ''),
          sublabel: '视察完毕继续发财',
          colorTag: 'green',
          disabled: false
        });
      } else {
        // ========== 核心红线 R3：踩中敌城永远固定四键顺序！ ==========
        mood = 'cry';
        tollAmount = calcToll(tile.idx, 'player', state);
        var hegOwner = getHegemonById(tile.owner, state);
        var ownerName = hegOwner ? hegOwner.name : '敌军';
        var govDef = DATA.GOVERNORS[tile.governorId || 'lizhangbo'] || DATA.GOVERNORS.lizhangbo;

        var duelCalc = calcCombatPowerAndWinRate('duel', tile, 15, state);
        var fieldCalc = calcCombatPowerAndWinRate('field_battle', tile, 0, state);
        var siegeCalc = calcCombatPowerAndWinRate('siege', tile, 0, state);

        var canBouncedCheck = p.stats.fame <= -30 && p.bouncedCooldown <= 0;
        var canPersuade = p.stats.fame >= 30;
        var freeByGod = p.buffs.freeTollCharges > 0;
        var noTroops = p.troops <= 0;

        subtitle = ownerName + '的 Lv.' + tile.level + '【' + tile.name + '】（驻守：' + govDef.name + '｜' + tile.terrainName + '地）';

        // 按钮 ①：缴交过路费（或邪道改写「开芭乐票」/ 神明免单）
        var btn1Label = '缴交过路费';
        var btn1Sub = '魅力已杀价 ' + Math.round(Math.min(30, p.stats.charm * 0.3)) + '%，破财消灾';
        var btn1Rewrite = 'none';
        if (freeByGod) {
          btn1Label = '神明护体免单过关';
          btn1Sub = '妈祖显灵替你挡下一劫！';
        } else if (canBouncedCheck) {
          btn1Label = '开芭乐票赖账免付！';
          btn1Sub = '邪道特权：分文不掏溜走（名望-10，下圈放讨债队）';
          btn1Rewrite = 'bounced_check';
        }

        var eqStats = calcPlayerEquipStats(state);
        var duelLossFactor = 2.0;
        if (p.vanguardId === 'zhaoyun' || p.lordId === 'liubei') duelLossFactor -= 0.5;
        if (hasPolicy('P12')) duelLossFactor -= 0.5;
        duelLossFactor *= (1 - eqStats.lossDiscount);
        duelLossFactor = Math.max(1.0, Number(duelLossFactor.toFixed(2)));

        actions = [
          {
            key: 'pay_toll',
            slotOrder: 1,
            standardName: '缴交过路费',
            label: btn1Label,
            sublabel: btn1Sub,
            cost: (canBouncedCheck || freeByGod) ? 0 : tollAmount,
            fameRewrite: btn1Rewrite,
            colorTag: canBouncedCheck ? 'purple' : 'blue',
            disabled: false
          },
          {
            key: 'duel',
            slotOrder: 2,
            standardName: '骑木马单挑',
            label: '骑木马单挑',
            sublabel: '派' + DATA.VANGUARDS[p.vanguardId].name + '出马：胜免单' + (hasPolicy('P14') ? '+拆城' : '') + '，败赔 ' + duelLossFactor + 'T' + (duelCalc.pityApplied ? ' · 保底+15%' : ''),
            winRate: duelCalc.winRate,
            winRatePct: duelCalc.winRatePct,
            pityBonusNote: duelCalc.pityApplied ? DATA.QUOTES.pityTriggered : '',
            fameRewrite: 'none',
            colorTag: colorTagForWinRate(duelCalc.winRatePct),
            disabled: false
          },
          {
            key: 'field_battle',
            slotOrder: 3,
            standardName: '地形野战',
            label: '地形野战（' + tile.terrainName + '）',
            sublabel: noTroops ? DATA.QUOTES.noTroopsHint : '胜免单+挂3圈溃散白旗，败赔 2T 折兵',
            winRate: fieldCalc.winRate,
            winRatePct: fieldCalc.winRatePct,
            pityBonusNote: fieldCalc.pityApplied ? DATA.QUOTES.pityTriggered : '',
            fameRewrite: 'none',
            colorTag: noTroops ? 'gray' : colorTagForWinRate(fieldCalc.winRatePct),
            disabled: noTroops,
            disabledReason: noTroops ? DATA.QUOTES.noTroopsHint : ''
          },
          {
            key: 'siege',
            slotOrder: 4,
            standardName: '机关攻城',
            label: canPersuade ? '开城劝降夺城' : '机关攻城夺城',
            sublabel: noTroops ? DATA.QUOTES.noTroopsHint : (canPersuade ? '正道感召：胜直接夺城保全部建筑（折损减半）！' : '胜免单且直接夺取整座城池！败赔 3T'),
            winRate: siegeCalc.winRate,
            winRatePct: siegeCalc.winRatePct,
            pityBonusNote: siegeCalc.pityApplied ? DATA.QUOTES.pityTriggered : '',
            fameRewrite: canPersuade ? 'persuade' : 'none',
            colorTag: noTroops ? 'gray' : colorTagForWinRate(siegeCalc.winRatePct),
            disabled: noTroops,
            disabledReason: noTroops ? DATA.QUOTES.noTroopsHint : ''
          }
        ];

        extraData = {
          isEnemyCity: true,
          ownerId: tile.owner,
          ownerName: ownerName,
          governor: govDef,
          canAlsoPayNormally: canBouncedCheck,
          normalToll: tollAmount,
          pityApplied: duelCalc.pityApplied
        };
      }
    } else if (tile.type === 'pot') {
      mood = 'happy';
      var potGain = Math.round(state.jackpotPot * state.betMultiplier * (hasPolicy('P23') ? 2 : 1) * (p.buffs.godPossessTicks > 0 ? 1.5 : 1));
      subtitle = '当前底池 ' + state.jackpotPot + ' 两 × 加注 ×' + state.betMultiplier + ' ＝ 抱走 ' + potGain + ' 两！';
      actions.push({ key: 'claim_pot', label: '整碗抱走 +' + potGain + ' 两！', sublabel: p.silver < 1500 ? '穷神怜悯：额外必爆跨次元神兵【光剑】！' : '财源滚滚入袋', colorTag: 'gold', disabled: false });
    } else if (tile.type === 'casino') {
      mood = 'happy';
      var stake = Math.round(calcBaseStipend(state.loop, state) * state.betMultiplier);
      var canBet = p.silver >= stake;
      subtitle = '皇家十八啦大碗公（本注筹码：' + stake + ' 两）';
      actions = [
        { key: 'bet_big', label: '押大（8~12点，赢×2）', sublabel: '赢净赚 +' + stake + ' 两', colorTag: 'green', disabled: !canBet },
        { key: 'bet_small', label: '押小（2~6点，赢×2）', sublabel: '赢净赚 +' + stake + ' 两', colorTag: 'blue', disabled: !canBet },
        { key: 'bet_seven', label: '押七点或欢喜对（赢×4！）', sublabel: '一发暴富净赚 +' + (stake * 3) + ' 两', colorTag: 'gold', disabled: !canBet },
        { key: 'leave_casino', label: '戒赌走人（领150两茶水钱）', sublabel: '不赌就是赢！', colorTag: 'gray', disabled: false }
      ];
    } else if (tile.type === 'gov') {
      mood = 'happy';
      var stipHalf = Math.round(calcBaseStipend(state.loop, state) * 0.6);
      actions.push({ key: 'gov_stipend', label: '领治安赏金 +' + stipHalf + ' 两 & 补兵+250', sublabel: '官府免费便当补贴', colorTag: 'green', disabled: false });

      // 法拍屋或无主特批地捡漏
      var targetForeclose = null;
      if (state.foreclosedTiles.length > 0) {
        targetForeclose = state.board[state.foreclosedTiles[0]];
      } else {
        var emptyCities = state.board.filter(function (t) { return t.type === 'city' && !t.owner; });
        if (emptyCities.length > 0) targetForeclose = emptyCities[0];
      }
      if (targetForeclose) {
        var halfPrice = Math.round(targetForeclose.basePrice * 0.5);
        actions.push({
          key: 'gov_foreclosure',
          label: '半价法拍过户【' + targetForeclose.name + '】（-' + halfPrice + ' 两）',
          sublabel: '远程拿地俗搁大碗！',
          colorTag: 'gold',
          disabled: p.silver < halfPrice,
          extraTileIdx: targetForeclose.idx
        });
      }
      actions.push({ key: 'gov_card', label: '申领官府战备奇策/锦囊 ×1', sublabel: '充实手牌弹药库', colorTag: 'blue', disabled: false });
    } else if (tile.type === 'fortune') {
      actions.push({ key: 'draw_stick', label: '摇签筒求一卦！', sublabel: '上上签发横财选政见，下下签可用气运签逆改', colorTag: 'gold', disabled: false });
    } else if (tile.type === 'demon') {
      mood = 'happy';
      subtitle = tile.eliteDemon ? '【发财精英心魔】现身！战胜必爆高品阶神兵行头！' : '算盘穷神拦路，快斩爆装备「即换即融」！';
      actions.push({ key: 'fight_demon', label: '拎家伙快斩心魔！', sublabel: '3秒快斩掉行头加赏银', colorTag: 'green', disabled: false });
    } else if (tile.type === 'school') {
      var tuition = calcBaseStipend(state.loop, state);
      var afford = p.silver >= tuition;
      subtitle = '名师一对一特训（学费：' + tuition + ' 两）';
      actions = [
        { key: 'study_physique', label: '特训体魄 +6（-' + tuition + ' 两）', sublabel: '单挑战力永久提升', colorTag: 'green', disabled: !afford },
        { key: 'study_strategy', label: '特训谋略 +6（-' + tuition + ' 两）', sublabel: '野战与口斗门槛永久提升', colorTag: 'blue', disabled: !afford },
        { key: 'study_charm', label: '特训魅力 +6（-' + tuition + ' 两）', sublabel: '过路费与夜市杀价更狠', colorTag: 'gold', disabled: !afford },
        { key: 'skip', label: '逃课溜走（0 两）', sublabel: '省下学费去买地', colorTag: 'gray', disabled: false }
      ];
    } else if (tile.type === 'market') {
      mood = 'happy';
      subtitle = tile.halfPriceLoops > 0 ? '跳楼大拍卖全场五折！点选货位即买！' : '庙口夜市香气扑鼻（魅力已自动杀价）';
      extraData.marketItems = state.currentMarketItems;
      for (var m = 0; m < state.currentMarketItems.length; m++) {
        var it = state.currentMarketItems[m];
        if (!it.bought) {
          actions.push({
            key: 'buy_item',
            payload: { slotIdx: it.slotIdx },
            label: '买【' + it.name + '】（-' + it.price + ' 两）',
            sublabel: it.desc,
            colorTag: it.rarity === 'UR' || it.rarity === 'SSR' ? 'gold' : 'green',
            disabled: p.silver < it.price
          });
        }
      }
      actions.push({ key: 'leave_market', label: '吃饱逛完离开夜市', sublabel: '继续跑圈', colorTag: 'gray', disabled: false });
    } else if (tile.type === 'event') {
      var ev = state.currentEventData;
      if (ev && ev.mode === 'payoff') {
        mood = ev.payoff.good ? 'happy' : 'cry';
        title = ev.title;
        subtitle = ev.payoff.quote;
        actions.push({ key: 'event_payoff', label: ev.payoff.headline, sublabel: '结算跨圈因果报应！', colorTag: ev.payoff.good ? 'gold' : 'red', disabled: false });
      } else if (ev) {
        title = ev.title;
        subtitle = ev.intro;
        extraData.event = ev;
        for (var c = 0; c < ev.choices.length; c++) {
          var ch = ev.choices[c];
          var reqMet = true;
          if (ch.req) {
            reqMet = (p.stats[ch.req.stat] || 0) >= ch.req.val;
          }
          var cashMet = ch.cost > 0 ? p.silver >= ch.cost : true;
          actions.push({
            key: 'event_choice',
            payload: { choiceKey: ch.key },
            label: ch.label,
            sublabel: ch.desc,
            colorTag: reqMet && cashMet ? 'blue' : 'gray',
            disabled: !reqMet || !cashMet,
            disabledReason: !reqMet ? '属性未达标' : (!cashMet ? '银两不足' : '')
          });
        }
      }
    } else if (tile.type === 'special') {
      if (state.specialMode === 'hulao') {
        var fee = Math.round(calcBaseStipend(state.loop, state) * 0.8);
        var lvbuFakeTile = { governorId: 'lvbu', buildings: [], woundedLoops: 0, terrain: 'land' };
        var lvbuDuel = calcCombatPowerAndWinRate('duel', lvbuFakeTile, 10, state);
        mood = 'cry';
        title = '虎牢黑心收费站 · 吕布拦路！';
        subtitle = '吕布骑赤兔弹簧马横戟：「留下 ' + fee + ' 两买路钱送八折通行贴，或跟本将军骑木马练练！」';
        actions = [
          { key: 'hulao_pay', label: '交道路养护费（-' + fee + ' 两）', sublabel: '获赠2圈免死通行贴（踩敌城过路费-20%）', colorTag: 'blue', disabled: false },
          { key: 'hulao_duel', label: '拎折凳单挑吕布！｜胜算 ' + lvbuDuel.winRatePct + '%', sublabel: '打赢整箱端走 +1,800 两买路财并破魔王护驾！', winRatePct: lvbuDuel.winRatePct, colorTag: colorTagForWinRate(lvbuDuel.winRatePct), disabled: false }
        ];
      } else {
        mood = 'happy';
        title = '赤壁连环战船 · 七星祭坛';
        subtitle = '江风猎猎：登坛借东风可破除关底曹操水战装甲，并获赠奇策《火上浇油》！';
        actions = [
          { key: 'chibi_wind', label: '登坛借东风！（破防魔王+领奇策）', sublabel: '获赠《火上浇油》并回复 200 水军兵力', colorTag: 'gold', disabled: false }
        ];
      }
    }

    return {
      tileIdx: tile.idx,
      tileType: extraData.isEnemyCity ? 'enemy_city' : tile.type,
      title: title,
      subtitle: subtitle,
      mood: mood,
      tollAmount: tollAmount,
      canReroll: state.canReroll && p.luckSticks > 0,
      actions: actions,
      extraData: extraData
    };
  }

  // ==================== 骑木马单挑两段式（支持 2 秒战斗奇策高光窗） ====================

  function pickAdvisorClash(st) {
    var s = st || state;
    var p = s.player;
    var discount = p.advisorId === 'zhugeliang' ? 5 : 0;
    var eligible = DATA.KOUDOU_SKILLS.filter(function (k) {
      return (p.stats[k.stat] || 0) >= (k.req - discount);
    });
    var chosen = pickOne(eligible.length > 0 ? eligible : [DATA.KOUDOU_SKILLS[0]]);
    var enemyPenalty = p.advisorId === 'guojia' ? -10 : 0;
    return {
      skillId: chosen.id,
      skillName: chosen.name,
      speakerName: DATA.ADVISORS[p.advisorId].name,
      playerFanImg: DATA.ADVISORS[p.advisorId].fanImg,
      enemyFanImg: DATA.ASSETS.chars.guojia_fan,
      playerLine: chosen.zhugeLine,
      enemyLine: chosen.guojiaReply,
      playerMorale: 50 + chosen.myMorale,
      enemyMorale: Math.max(10, 50 + chosen.enemyMorale + enemyPenalty),
      playerMoraleDelta: chosen.myMorale,
      enemyMoraleDelta: chosen.enemyMorale + enemyPenalty,
      netMoraleSwing: chosen.myMorale - (chosen.enemyMorale + enemyPenalty)
    };
  }

  function startDuel() {
    if (!state) newGame();
    var p = state.player;
    var tile = state.board[p.pos];
    var isHulao = tile.idx === 17 && state.specialMode === 'hulao';
    if (!isHulao && (tile.type !== 'city' || !tile.owner || tile.owner === 'player')) {
      return { ok: false, message: '当前不在可单挑的敌方城池或虎牢关卡！', state: getState() };
    }

    state.canReroll = false;
    preRollSnapshot = null;

    var duelTile = isHulao ? { idx: 17, name: '虎牢黑心收费站', governorId: 'lvbu', buildings: [], woundedLoops: 0, terrain: 'land', isHulao: true } : tile;
    var clash = pickAdvisorClash(state);
    var calc = calcCombatPowerAndWinRate('duel', duelTile, clash.netMoraleSwing, state);
    var vanguard = DATA.VANGUARDS[p.vanguardId];
    var gov = DATA.GOVERNORS[duelTile.governorId || 'lizhangbo'] || DATA.GOVERNORS.lizhangbo;

    state.phase = 'DUEL_STAGE';
    state.currentDuelCtx = {
      tileIdx: tile.idx,
      isHulao: isHulao,
      clash: clash,
      baseWinRate: calc.winRate,
      baseWinRatePct: calc.winRatePct,
      pityApplied: calc.pityApplied,
      myPower: calc.myPower,
      enemyPower: calc.enemyPower,
      playerVanguard: vanguard,
      enemyGovernor: gov
    };

    return {
      ok: true,
      isHulao: isHulao,
      tileIdx: tile.idx,
      cityName: duelTile.name,
      playerVanguard: {
        id: vanguard.id,
        name: vanguard.name,
        horseImg: vanguard.horseImg,
        skillName: vanguard.skillName,
        power: calc.myPower
      },
      enemyGovernor: {
        id: gov.id,
        name: gov.name,
        horseImg: gov.horseImg,
        power: calc.enemyPower
      },
      advisorClash: clash,
      baseWinRate: calc.winRate,
      baseWinRatePct: calc.winRatePct,
      pityApplied: calc.pityApplied,
      availableCombatCards: p.combatCards.slice(),
      canUseCombatCard: p.combatCards.length > 0,
      lordOpenQuote: pickOne(DATA.LORDS[p.lordId].quotes.duelStart),
      state: getState()
    };
  }

  function finalizeDuel(combatCardInstanceId) {
    if (!state) newGame();
    if (state.phase !== 'DUEL_STAGE' || !state.currentDuelCtx) {
      var initRes = startDuel();
      if (!initRes.ok) return initRes;
    }

    var ctx = state.currentDuelCtx;
    var p = state.player;
    var tile = state.board[ctx.tileIdx];
    var events = [];

    var cardPlayed = null;
    var winRate = ctx.baseWinRate;
    var preventDoubleLoss = false;
    var twiceRoll = false;
    var extraPlunderRatio = 0;

    if (combatCardInstanceId) {
      var cIdx = -1;
      for (var i = 0; i < p.combatCards.length; i++) {
        if (p.combatCards[i].instanceId === combatCardInstanceId || p.combatCards[i].id === combatCardInstanceId) {
          cIdx = i;
          break;
        }
      }
      if (cIdx >= 0) {
        cardPlayed = p.combatCards.splice(cIdx, 1)[0];
        winRate = clamp(winRate + (cardPlayed.winRateBonus || 0.20), 0.05, 0.95);
        if (cardPlayed.preventDoubleLoss) preventDoubleLoss = true;
        if (cardPlayed.twiceRoll) twiceRoll = true;
        if (cardPlayed.plunderRatio) extraPlunderRatio = cardPlayed.plunderRatio;
        events.push({ type: 'combat_card_used', card: cardPlayed, text: '拍出战斗奇策' + cardPlayed.name + '：「' + cardPlayed.quote + '」' });
      }
    }

    var r1 = Math.random();
    var r2 = Math.random();
    var win = twiceRoll ? (r1 < winRate || r2 < winRate) : (r1 < winRate);

    // 诚信骰律 R7 连败计数更新
    if (ctx.pityApplied) {
      p.pityCount = 0;
    } else if (!win && winRate >= 0.60) {
      p.pityCount += 1;
    } else if (win) {
      p.pityCount = 0;
    }

    var vanguard = DATA.VANGUARDS[p.vanguardId];
    var silverDelta = 0;
    var cityLevelDelta = 0;
    var cityCaptured = false;
    var isSlipComedy = false;
    var buttonQuote = '';
    var droppedEquip = null;

    if (ctx.isHulao) {
      p.buffs.hulaoPaidThisLoop = true;
      if (win) {
        var boxCash = 1800 * state.betMultiplier;
        p.silver += boxCash;
        silverDelta = boxCash;
        p.buffs.hulaoLvbuBeaten = true;
        if (hasPolicy('P10')) p.stats.physique = Math.min(99, p.stats.physique + 3);
        buttonQuote = '张飞/赵云一招掀翻赤兔木马，把虎牢收费箱 +' + boxCash + ' 两整箱端走！';
        addLog(buttonQuote, 'good');
        droppedEquip = triggerEquipmentDrop(['stool', 'green_dragon', 'red_hare']);
      } else {
        isSlipComedy = Math.random() < 0.5;
        var fine = Math.round(calcBaseStipend(state.loop, state) * 1.0);
        if (!preventDoubleLoss) {
          chargePlayer(fine, 'caocao', events);
          silverDelta = -fine;
        }
        buttonQuote = isSlipComedy ? pickOne(vanguard.slipQuotes) : '吕奉先戟法太猛，交了买路钱灰溜溜过关！';
        addLog('虎牢关单挑落败（' + silverDelta + ' 两）：' + buttonQuote, 'warn');
      }
    } else {
      var toll = calcToll(tile.idx, 'player', state);
      var ownerHeg = getHegemonById(tile.owner, state);

      if (win) {
        tile.woundedLoops = 2;
        if (hasPolicy('P10')) p.stats.physique = Math.min(99, p.stats.physique + 3);
        if (p.equipment.weapon === 'green_dragon') {
          p.troops = Math.min(p.maxTroops, p.troops + 120);
        }

        var teaMoney = p.vanguardId === 'zhangfei' ? 180 : 80;
        p.silver += teaMoney;
        silverDelta += teaMoney;

        // P15 或《火上浇油》讹霸主金库
        var extortRatio = (hasPolicy('P15') ? 0.60 : 0) + extraPlunderRatio;
        if (extortRatio > 0 && ownerHeg && !ownerHeg.bankrupt) {
          var extortAmt = Math.round(toll * extortRatio);
          var exRes = chargeHegemon(ownerHeg, extortAmt, 'player', events);
          silverDelta += exRes.paidCash;
        }

        // P14 赢了不只免单，还要拆招牌！
        if (hasPolicy('P14')) {
          if (tile.level <= 1) {
            tile.owner = 'player';
            tile.governorId = pickFreePlayerGovernor(state);
            cityCaptured = true;
            checkPlayerRegionMonopoly(tile.region);
            events.push({ type: 'duel_capture_city', tileIdx: tile.idx, text: '触发《赢了还要拆招牌》：Lv.1【' + tile.name + '】当场归顺主公！' });
          } else {
            var stepVal = Math.round(tile.basePrice * DATA.CITY_SCALE[tile.level].stepCostFactor * 0.5);
            tile.level -= 1;
            cityLevelDelta = -1;
            p.silver += stepVal;
            silverDelta += stepVal;
            events.push({ type: 'duel_demolish', tileIdx: tile.idx, newLevel: tile.level, bonus: stepVal, text: '拆掉【' + tile.name + '】一层招牌，顺走建材折现 +' + stepVal + ' 两！' });
          }
        }

        buttonQuote = pickOne(vanguard.winQuotes);
        addLog('骑木马单挑大胜【' + tile.name + '】免单（净赚 +' + silverDelta + ' 两）！「' + buttonQuote + '」', 'good');
      } else {
        // 50% 概率呈现高能「放水摔下木马」喜剧包装（守 R7/R8：纯失败包装，不暗扣胜算）
        isSlipComedy = Math.random() < 0.50;
        if (preventDoubleLoss) {
          silverDelta = 0;
          buttonQuote = '《草鞋糊脸》掩护撤退，输阵不输钱，全身而退！';
        } else if (p.buffs.huatuoPreventLossOnce) {
          p.buffs.huatuoPreventLossOnce = false;
          silverDelta = 0;
          buttonQuote = '华佗九转大力丸护体，免除本次单挑赔款！';
        } else {
          consumeP28IfApplicable(state);
          var eqStats2 = calcPlayerEquipStats(state);
          var mult = 2.0;
          if (p.vanguardId === 'zhaoyun' || p.lordId === 'liubei') mult -= 0.5;
          if (hasPolicy('P12')) mult -= 0.5;
          mult = Math.max(1.0, mult * (1 - eqStats2.lossDiscount));
          var penalty = Math.round(toll * mult);
          chargePlayer(penalty, tile.owner, events);
          silverDelta = -penalty;
          buttonQuote = isSlipComedy ? pickOne(vanguard.slipQuotes) : pickOne(DATA.LORDS[p.lordId].quotes.duelSlip);
        }
        addLog('骑木马单挑失利（' + silverDelta + ' 两）：「' + buttonQuote + '」', 'bad');
      }
    }

    state.currentDuelCtx = null;
    var nextPhase = advanceAfterLandingResolved(events);
    recomputeAllDerived(state);

    return {
      ok: true,
      actionKey: 'duel',
      win: win,
      finalWinRatePct: Math.round(winRate * 100),
      cardPlayed: cardPlayed,
      isSlipComedy: isSlipComedy,
      silverDelta: silverDelta,
      cityLevelDelta: cityLevelDelta,
      cityCaptured: cityCaptured,
      droppedEquip: droppedEquip,
      buttonQuote: buttonQuote,
      nextPhase: nextPhase,
      events: events,
      state: getState()
    };
  }

  // ==================== 通用落点一击结算 resolveLanding ====================

  function triggerEquipmentDrop(poolIds) {
    var id = pickOne(poolIds || Object.keys(DATA.EQUIPMENTS));
    var newDef = DATA.EQUIPMENTS[id];
    if (!newDef) return null;

    var slot = newDef.slot;
    var curId = state.player.equipment[slot];
    var curDef = curId ? DATA.EQUIPMENTS[curId] : null;
    var stipend = calcBaseStipend(state.loop, state);
    var sellVal = Math.max(60, Math.round(stipend * DATA.RARITY[newDef.rarity].sellFactor * state.betMultiplier));

    // 免打扰规则（02 6.1）：若新货加值与品阶均不如身上旧装，自动当场折银飘字不弹窗阻塞！
    if (curDef && newDef.bonus <= curDef.bonus && DATA.RARITY[newDef.rarity].dots <= DATA.RARITY[curDef.rarity].dots) {
      state.player.silver += sellVal;
      addLog('掉落【' + newDef.name + '】不如身上【' + curDef.name + '】，自动卖废铁折现 +' + sellVal + ' 两！', 'info');
      return {
        autoSold: true,
        newItem: newDef,
        oldItem: curDef,
        silverGain: sellVal
      };
    }

    var oldSellVal = curDef ? Math.max(50, Math.round(stipend * DATA.RARITY[curDef.rarity].sellFactor * state.betMultiplier)) : 0;
    state.player.pendingEquip = Object.assign({}, newDef, {
      equipId: newDef.id,
      slot: slot,
      newItem: newDef,
      oldItem: curDef,
      newSellValue: sellVal,
      oldSellValue: oldSellVal,
      bonusDiff: newDef.bonus - (curDef ? curDef.bonus : 0)
    });
    return {
      autoSold: false,
      prompt: state.player.pendingEquip
    };
  }

  function resolveEquipPrompt(choice) {
    if (!state || !state.player.pendingEquip) {
      return { ok: false, message: '当前没有待处理的即换即融装备！', state: getState() };
    }
    var pe = state.player.pendingEquip;
    var equipped = choice !== 'sell';
    var silverGain = 0;
    var quote = '';

    if (equipped) {
      state.player.equipment[pe.slot] = pe.newItem.id;
      silverGain = pe.oldSellValue;
      state.player.silver += silverGain;
      quote = '换上新行头【' + pe.newItem.name + '】（+' + pe.newItem.bonus + '）' + (pe.oldItem ? ('，旧【' + pe.oldItem.name + '】折现 +' + silverGain + ' 两！') : '！');
    } else {
      silverGain = pe.newSellValue;
      state.player.silver += silverGain;
      quote = '保留旧行头，把【' + pe.newItem.name + '】当场折银 +' + silverGain + ' 两！';
    }

    state.player.pendingEquip = null;
    addLog(quote, 'good');

    var events = [];
    var nextPhase = state.phase === 'EQUIP_PROMPT' ? advanceAfterLandingResolved(events) : state.phase;
    recomputeAllDerived(state);

    return {
      ok: true,
      equipped: equipped,
      silverGain: silverGain,
      quote: quote,
      nextPhase: nextPhase,
      state: getState()
    };
  }

  function resolveLanding(actionKey, payload) {
    if (!state) newGame();
    if (state.phase === 'GAME_OVER' || state.phase === 'BOSS_FINALE') {
      return { ok: false, message: '本局已进入终局阶段！', state: getState() };
    }

    state.canReroll = false;
    preRollSnapshot = null;

    // 兼容一步式单挑（供自动连掷或测试脚本直接调用）
    if (actionKey === 'duel' || actionKey === 'hulao_duel') {
      startDuel();
      return finalizeDuel(payload && payload.combatCardId ? payload.combatCardId : null);
    }

    var p = state.player;
    var tile = state.board[p.pos];
    var events = [];
    var win = true;
    var silverDelta = 0;
    var headline = '';
    var quote = '';
    var droppedEquip = null;
    var callbackTriggered = false;

    if (actionKey === 'start_pass') {
      headline = '经过大营·起点';
      quote = DATA.QUOTES.loopPass;
    } else if (actionKey === 'buy_city') {
      var price = p.lordId === 'dongzhuo' ? Math.round(tile.basePrice * 0.8) : tile.basePrice;
      if (!tile.owner && p.silver >= price) {
        p.silver -= price;
        tile.owner = 'player';
        tile.level = 1;
        tile.governorId = pickFreePlayerGovernor(state);
        silverDelta = -price;
        if (tile.bonusRedPacket > 0) {
          p.silver += tile.bonusRedPacket;
          silverDelta += tile.bonusRedPacket;
          tile.bonusRedPacket = 0;
        }
        var mono = checkPlayerRegionMonopoly(tile.region);
        headline = '成功占领【' + tile.name + '】！';
        quote = '盖下去啦！' + (mono ? '达成全州垄断，过路费翻倍！' : '插上咱家大旗开门收租！');
        addLog(headline + quote, 'good');
      } else {
        headline = '现金不足，错失良地';
        quote = '摸摸空荷包，下圈攒够钱再来买！';
      }
    } else if (actionKey === 'visit_collect' || actionKey === 'visit_upgrade') {
      var vTax = calcCityTax(tile, state) * state.betMultiplier * (p.lordId === 'liubei' ? 2 : 1) * (hasPolicy('P03') ? 2 : 1);
      if (tile.buildings.indexOf('market') >= 0) {
        vTax += Math.round(calcBaseStipend(state.loop, state) * 0.25);
      }
      p.silver += vTax;
      silverDelta += vTax;
      if (p.lordId === 'liubei' || hasPolicy('P03')) {
        p.troops = Math.min(p.maxTroops, p.troops + 150);
        tile.brokenLoops = 0;
      }
      headline = '回城探班【' + tile.name + '】';
      quote = DATA.QUOTES.visitCity + '（+' + vTax + ' 两）';

      if (actionKey === 'visit_upgrade' && tile.level < 5) {
        var uCost = calcCityUpgradeCost(tile, false, state);
        if (p.silver >= uCost) {
          p.silver -= uCost;
          tile.level += 1;
          silverDelta -= uCost;
          headline = '探班插队将【' + tile.name + '】升至 Lv.' + tile.level + '！';
          quote = '连收带盖一条龙，过路费当场翻倍啰！';
        }
      }
      addLog(headline + ' ' + quote, 'good');
    } else if (actionKey === 'bounced_check') {
      // 邪道特权：开芭乐票免付赖账！
      p.stats.fame = clamp(p.stats.fame - 10, -100, 100);
      p.bouncedCooldown = 3;
      var victimHeg = getHegemonById(tile.owner, state);
      if (victimHeg && !victimHeg.bankrupt) {
        state.debtTeams.push({
          id: nextUid('debt'),
          ownerId: victimHeg.id,
          ownerName: victimHeg.name,
          pos: victimHeg.homeTile
        });
      }
      headline = '邪道绝活：开芭乐票免付溜走！';
      quote = '甩下一张空头芭乐票分文不掏！' + (victimHeg ? victimHeg.name : '债主') + '气歪鼻子派出了讨债队！';
      addLog(headline + ' ' + quote, 'good');
    } else if (actionKey === 'pay_toll') {
      if (p.buffs.freeTollCharges > 0) {
        p.buffs.freeTollCharges -= 1;
        headline = '神明附体免交过路费！';
        quote = '财神显灵挡灾，分文未损大步走人！';
        addLog(headline, 'good');
      } else {
        consumeP28IfApplicable(state);
        var toll = calcToll(tile.idx, 'player', state);
        if (tile.buildings.indexOf('altar') >= 0 && p.silver > toll) {
          toll += Math.min(Math.round(toll * 0.4), Math.round((p.silver - toll) * 0.05));
        }
        chargePlayer(toll, tile.owner, events);
        silverDelta = -toll;
        win = false;
        headline = '缴交【' + tile.name + '】过路费 -' + toll + ' 两';
        quote = pickOne(DATA.LORDS[p.lordId].quotes.payToll);
        addLog(headline + '：「' + quote + '」', 'bad');
      }
    } else if (actionKey === 'field_battle') {
      var fCalc = calcCombatPowerAndWinRate('field_battle', tile, 0, state);
      win = Math.random() < fCalc.winRate;
      if (fCalc.pityApplied) p.pityCount = 0;
      else if (!win && fCalc.winRate >= 0.60) p.pityCount += 1;
      else if (win) p.pityCount = 0;

      if (win) {
        tile.brokenLoops = 3;
        var lossTroops = Math.round(p.troops * 0.10);
        p.troops = Math.max(0, p.troops - lossTroops);
        headline = '地形野战大捷！免交过路费！';
        quote = '借' + tile.terrainName + '地之利冲垮守军，给【' + tile.name + '】挂上 3 圈溃散白旗（守军减半）！';
        addLog(headline + quote, 'good');
      } else {
        consumeP28IfApplicable(state);
        var fToll = calcToll(tile.idx, 'player', state);
        var fMult = (p.lordId === 'liubei' || hasPolicy('P12')) ? 1.5 : 2.0;
        var fPen = Math.round(fToll * fMult);
        p.troops = Math.max(0, Math.round(p.troops * 0.65));
        chargePlayer(fPen, tile.owner, events);
        silverDelta = -fPen;
        headline = '地形野战失利（-' + fPen + ' 两）';
        quote = '水土不服阵脚大乱，赔了双倍房钱快撤！';
        addLog(headline + '：' + quote, 'bad');
      }
    } else if (actionKey === 'siege' || actionKey === 'persuade') {
      var sCalc = calcCombatPowerAndWinRate('siege', tile, 0, state);
      win = Math.random() < sCalc.winRate;
      if (sCalc.pityApplied) p.pityCount = 0;
      else if (!win && sCalc.winRate >= 0.60) p.pityCount += 1;
      else if (win) p.pityCount = 0;

      var isPersuade = p.stats.fame >= 30;
      if (win) {
        var oldOwner = tile.owner;
        tile.owner = 'player';
        tile.brokenLoops = 0;
        // 赵云 / 董卓 / 正道开城劝降 保全全部既有建筑，否则保留一半向上取整
        if (!isPersuade && p.vanguardId !== 'zhaoyun' && p.lordId !== 'dongzhuo' && tile.buildings.length > 1) {
          tile.buildings = tile.buildings.slice(0, Math.max(1, Math.floor(tile.buildings.length / 2)));
        }
        // 魅力 ≥ 55 有 50% 概率当场招降原敌太守留任，否则派自家太守
        if (p.stats.charm < 55 || Math.random() >= 0.5) {
          tile.governorId = pickFreePlayerGovernor(state);
        }
        var troopCostRatio = isPersuade ? 0.10 : 0.20;
        p.troops = Math.max(0, Math.round(p.troops * (1 - troopCostRatio)));
        checkPlayerRegionMonopoly(tile.region);
        headline = (isPersuade ? '开城劝降大捷！' : '机关攻城破门夺城！') + '拿下 Lv.' + tile.level + '【' + tile.name + '】！';
        quote = isPersuade ? '乡民箪食壶浆迎王师，整座城池完好改姓咱家啦！' : '火炮轰折' + (oldOwner === 'caocao' ? '大魏' : '江东') + '旗杆，连楼带地整座笑纳！';
        addLog(headline + quote, 'good');
      } else {
        consumeP28IfApplicable(state);
        var sToll = calcToll(tile.idx, 'player', state);
        var sPen = Math.round(sToll * 3.0);
        p.troops = Math.max(0, Math.round(p.troops * 0.45));
        chargePlayer(sPen, tile.owner, events);
        silverDelta = -sPen;
        headline = '攻城受挫（赔付 -' + sPen + ' 两）';
        quote = '城墙太厚没啃动，赔夫人又折兵，紧酸！';
        addLog(headline + '：' + quote, 'bad');
      }
    } else if (actionKey === 'claim_pot') {
      var potAmt = Math.round(state.jackpotPot * state.betMultiplier * (hasPolicy('P23') ? 2 : 1) * (p.buffs.godPossessTicks > 0 ? 1.5 : 1));
      var lowCashTrigger = p.silver < 1500;
      p.silver += potAmt;
      silverDelta = potAmt;
      state.jackpotPot = 1500;
      headline = '抱走风水聚宝盆 +' + potAmt + ' 两！';
      quote = '金元宝喷泉入怀，俗搁大碗发大财啰！';
      addLog(headline, 'good');
      if (lowCashTrigger && p.equipment.weapon !== 'lightsaber') {
        droppedEquip = triggerEquipmentDrop(['lightsaber']);
        quote += ' 盆底闪出跨次元神兵【光剑】！';
      }
    } else if (actionKey === 'bet_big' || actionKey === 'bet_small' || actionKey === 'bet_seven') {
      var stake = Math.round(calcBaseStipend(state.loop, state) * state.betMultiplier);
      var cd1 = randInt(1, 6);
      var cd2 = randInt(1, 6);
      var csum = cd1 + cd2;
      var wonBet = false;
      var payoutMult = 2;
      if (actionKey === 'bet_big') wonBet = csum >= 8;
      else if (actionKey === 'bet_small') wonBet = csum <= 6;
      else {
        wonBet = (csum === 7 || cd1 === cd2);
        payoutMult = 4;
      }
      if (p.advisorId === 'guojia' && !wonBet && Math.random() < 0.25) {
        wonBet = true; // 郭嘉鬼才算路救场
      }
      if (wonBet) {
        var netWin = stake * (payoutMult - 1) * (hasPolicy('P23') ? 2 : 1);
        p.silver += netWin;
        silverDelta = netWin;
        headline = '赌场开碗【' + cd1 + '+' + cd2 + '=' + csum + '点】大赢 +' + netWin + ' 两！';
        quote = '十八啦通杀！庄家脸都绿了！';
        addLog(headline, 'good');
      } else {
        win = false;
        chargePlayer(stake, 'system', events);
        silverDelta = -stake;
        headline = '赌场开碗【' + cd1 + '+' + cd2 + '=' + csum + '点】小输 -' + stake + ' 两';
        quote = '十赌九诈，输掉的筹码流进聚宝盆底池啰！';
        addLog(headline, 'warn');
      }
    } else if (actionKey === 'leave_casino') {
      p.silver += 150;
      silverDelta = 150;
      headline = '自律戒赌领茶水钱 +150 两';
      quote = '不赌就是赚，喝碗冰粉拍拍屁股走人！';
      addLog(headline, 'info');
    } else if (actionKey === 'gov_stipend') {
      var stipGain = Math.round(calcBaseStipend(state.loop, state) * 0.6);
      p.silver += stipGain;
      p.troops = Math.min(p.maxTroops, p.troops + 250);
      silverDelta = stipGain;
      headline = '官府领治安赏金 +' + stipGain + ' 两 & 补兵+250';
      quote = '公务便当管饱，队伍精神抖擞！';
      addLog(headline, 'good');
    } else if (actionKey === 'gov_foreclosure') {
      var fTarget = null;
      if (state.foreclosedTiles.length > 0) {
        fTarget = state.board[state.foreclosedTiles.shift()];
      } else {
        fTarget = state.board.find(function (t) { return t.type === 'city' && !t.owner; });
      }
      if (fTarget) {
        var hp = Math.round(fTarget.basePrice * 0.5);
        if (p.silver >= hp) {
          p.silver -= hp;
          silverDelta = -hp;
          fTarget.owner = 'player';
          fTarget.level = Math.max(1, fTarget.level || 1);
          fTarget.governorId = pickFreePlayerGovernor(state);
          checkPlayerRegionMonopoly(fTarget.region);
          headline = '官府法拍捡漏！半价过户【' + fTarget.name + '】！';
          quote = '五折买房当场拿红本，俗搁大碗！';
          addLog(headline, 'good');
        }
      }
    } else if (actionKey === 'gov_card') {
      if (p.combatCards.length < 2) {
        var ccRes = giveCombatCard(pickOne(Object.keys(DATA.COMBAT_CARDS)));
        headline = '官府拨发战斗奇策' + ccRes.card.name;
      } else {
        var bcRes = giveBoardCard(pickOne(Object.keys(DATA.BOARD_CARDS)));
        headline = '官府拨发棋盘锦囊' + bcRes.card.name;
      }
      quote = '锦囊妙计揣进怀，出门不怕鬼门关！';
      addLog(headline, 'good');
    } else if (actionKey === 'draw_stick' || actionKey === 'reroll_stick') {
      var stick;
      if (actionKey === 'reroll_stick' && p.luckSticks > 0) {
        p.luckSticks -= 1;
        stick = DATA.FORTUNE_STICKS[0]; // 改签必转上上签
      } else {
        var rollW = randInt(1, 100);
        if (state.worldEffects.badFortuneBiasLoops > 0) rollW = Math.min(100, rollW + 20);
        if (rollW <= 28) stick = DATA.FORTUNE_STICKS[0];
        else if (rollW <= 42) stick = DATA.FORTUNE_STICKS[1];
        else if (rollW <= 76) stick = DATA.FORTUNE_STICKS[2];
        else stick = DATA.FORTUNE_STICKS[3];
      }
      state.currentFortuneStick = stick;
      var stip = calcBaseStipend(state.loop, state);

      if (stick.tier === 'bad' && actionKey === 'draw_stick' && p.luckSticks > 0 && !(payload && payload.acceptBad)) {
        // 自动或询问改签：若 UI 传了 autoReroll 或默认留给玩家改签机会；为保证一击闭环不卡死，若有气运签可提供改签或直接结算
        if (payload && payload.useStickToFix) {
          p.luckSticks -= 1;
          stick = DATA.FORTUNE_STICKS[0];
        }
      }

      if (stick.silverFactor) {
        var gain = Math.round(stip * stick.silverFactor * state.betMultiplier);
        p.silver += gain;
        silverDelta = gain;
        headline = stick.name + '（+' + gain + ' 两）';
      } else if (stick.grantPolicy) {
        state.pendingPoliciesCount += 1;
        p.silver += 300;
        silverDelta = 300;
        headline = stick.name + '（获赠政见三选一 +300 两）';
      } else if (stick.statAdd) {
        p.stats.charm = Math.min(99, p.stats.charm + 5);
        p.stats.strategy = Math.min(99, p.stats.strategy + 5);
        p.troops = Math.min(p.maxTroops, p.troops + 200);
        headline = stick.name + '（魅力+5、谋略+5、兵力+200）';
      } else {
        win = false;
        var loss = Math.round(stip * 0.55);
        chargePlayer(loss, 'system', events);
        silverDelta = -loss;
        headline = stick.name + '（破财消灾 -' + loss + ' 两）';
      }
      quote = stick.quote;
      addLog('算命摊抽签：' + headline, win ? 'good' : 'warn');
    } else if (actionKey === 'fight_demon') {
      var dScale = calcLoopScale(state.loop);
      var eqSt = calcPlayerEquipStats(state);
      var myP = (DATA.VANGUARDS[p.vanguardId].duel + eqSt.totalBonus) * (1 + p.stats.physique * 0.01);
      var dmP = (tile.eliteDemon ? 68 : 42) * dScale;
      win = Math.random() < clamp(myP / (myP + dmP), 0.25, 0.95);
      if (win) {
        var bounty = Math.round((tile.eliteDemon ? 650 : 320) * state.betMultiplier * (p.equipment.helm === 'tiger_hat' ? 1.25 : 1.0));
        p.silver += bounty;
        silverDelta = bounty;
        if (hasPolicy('P10')) p.stats.physique = Math.min(99, p.stats.physique + 3);
        var pool = tile.eliteDemon
          ? ['stool', 'rattan_armor', 'green_dragon', 'red_hare', 'lightsaber', 'golden_cudgel']
          : ['butcher_knife', 'tiger_hat', 'stool', 'rattan_armor', 'green_dragon'];
        tile.eliteDemon = false;
        droppedEquip = triggerEquipmentDrop(pool);
        headline = '快斩心魔大胜！赏银 +' + bounty + ' 两！';
        quote = '算盘穷神抱头鼠窜，掉下一地宝贝行头！';
        addLog(headline, 'good');
      } else {
        p.troops = Math.max(0, p.troops - 140);
        headline = '被心魔绊了一跤（护卫 -140）';
        quote = '穷神拍拍屁股溜了，还好银子没丢！';
        addLog(headline, 'warn');
      }
    } else if (actionKey === 'study_physique' || actionKey === 'study_strategy' || actionKey === 'study_charm') {
      var tui = calcBaseStipend(state.loop, state);
      if (p.silver >= tui) {
        p.silver -= tui;
        silverDelta = -tui;
        var stKey = actionKey.replace('study_', '');
        p.stats[stKey] = Math.min(99, p.stats[stKey] + 6);
        var stNames = { physique: '体魄', strategy: '谋略', charm: '魅力' };
        headline = '官渡补习结业：' + stNames[stKey] + '永久 +6！';
        quote = '知识就是金钱，下回砍人杀价更有底气！';
        addLog(headline, 'good');
      }
    } else if (actionKey === 'buy_item') {
      var sIdx = payload && typeof payload.slotIdx === 'number' ? payload.slotIdx : 0;
      var item = state.currentMarketItems[sIdx];
      if (item && !item.bought && p.silver >= item.price) {
        p.silver -= item.price;
        silverDelta = -item.price;
        item.bought = true;
        if (item.kind === 'equip') {
          droppedEquip = triggerEquipmentDrop([item.itemId]);
        } else if (item.kind === 'board_card') {
          giveBoardCard(item.itemId);
        } else if (item.kind === 'combat_card') {
          giveCombatCard(item.itemId);
        } else if (item.kind === 'troops_bun') {
          p.troops = Math.min(p.maxTroops, p.troops + 350);
          p.siegeGearBonus = Math.min(1.20, p.siegeGearBonus + 0.15);
        }
        headline = '夜市扫货购入【' + item.name + '】！';
        quote = '老板打包加辣，俗搁大碗！';
        addLog(headline, 'good');

        // 夜市买完单件若没有触发装备对比窗，可留在夜市继续买或若为自动模式直接收摊
        if (!(droppedEquip && !droppedEquip.autoSold) && !(payload && payload.stayInMarket)) {
          // 默认买完顺畅收摊推进下一刻，若 UI 传 stayInMarket: true 则可连买多件！
        } else if (payload && payload.stayInMarket && !(droppedEquip && !droppedEquip.autoSold)) {
          recomputeAllDerived(state);
          return {
            ok: true,
            actionKey: actionKey,
            win: true,
            silverDelta: silverDelta,
            headline: headline,
            quote: quote,
            nextPhase: 'LANDING',
            landingOptions: getLandingOptions(),
            events: events,
            state: getState()
          };
        }
      }
    } else if (actionKey === 'event_payoff') {
      var evPay = state.currentEventData;
      if (evPay && evPay.mode === 'payoff') {
        callbackTriggered = true;
        var rec = p.callbackFlags[evPay.flag];
        if (rec) rec.resolved = true;
        var pf = evPay.payoff;
        headline = pf.headline;
        quote = pf.quote;
        win = pf.good;

        if (pf.effect === 'gift_city_or_silver') {
          var freeCity = state.board.find(function (t) { return t.type === 'city' && !t.owner; });
          if (freeCity) {
            freeCity.owner = 'player';
            freeCity.level = 2;
            freeCity.governorId = pickFreePlayerGovernor(state);
            checkPlayerRegionMonopoly(freeCity.region);
          } else {
            p.silver += pf.val;
            silverDelta = pf.val;
          }
          state.pendingPoliciesCount += 1;
        } else if (pf.effect === 'silver') {
          p.silver += pf.val * state.betMultiplier;
          silverDelta = pf.val * state.betMultiplier;
        } else if (pf.effect === 'fine_and_break') {
          chargePlayer(Math.abs(pf.val), 'system', events);
          silverDelta = pf.val;
          var topMyCity = state.board.filter(function (t) { return t.owner === 'player'; }).sort(function (a, b) { return b.level - a.level; })[0];
          if (topMyCity) topMyCity.sealedLoops = 1;
        } else if (pf.effect === 'perm_duel') {
          p.permDuelBonus += pf.val;
          p.buffs.huatuoPreventLossOnce = true;
        } else if (pf.effect === 'paralyze_sub_and_silver') {
          var subH = getHegemonById('sunquan', state);
          if (subH && !subH.bankrupt) subH.paralyzedTicks = 3;
          p.silver += pf.val;
          silverDelta = pf.val;
        } else if (pf.effect === 'buff_boss') {
          state.worldEffects.enemyDoctorBuff = true;
          chargePlayer(400, 'caocao', events);
          silverDelta = -400;
        } else if (pf.effect === 'boss_weakness_combo') {
          p.buffs.diaochanComboMult = true;
          p.silver += pf.val;
          silverDelta = pf.val;
        } else if (pf.effect === 'drain_main_hegemon') {
          var mainH = getHegemonById('caocao', state);
          if (mainH && !mainH.bankrupt) {
            var dr = Math.round(mainH.vault * 0.30);
            mainH.vault -= dr;
            p.silver += dr;
            silverDelta = dr;
          }
        } else if (pf.effect === 'troops_loss') {
          p.troops = Math.max(0, p.troops - 300);
        } else if (pf.effect === 'grand_cannon') {
          p.siegeGearBonus = Math.max(p.siegeGearBonus, 1.0);
          p.buffs.lubanCannonBonus = 1500;
        } else if (pf.effect === 'catapult') {
          p.siegeGearBonus = Math.max(p.siegeGearBonus, 0.55);
          p.silver += pf.val;
          silverDelta = pf.val;
        } else if (pf.effect === 'enemy_fortify') {
          var xuchang = state.board[13];
          if (xuchang && xuchang.owner && xuchang.owner !== 'player' && xuchang.buildings.indexOf('arrow_tower') < 0) {
            xuchang.buildings.push('arrow_tower');
          }
        }
        addLog('奇遇因果兑现【' + headline + '】：' + quote, win ? 'good' : 'warn');
      }
    } else if (actionKey === 'event_choice') {
      var evPlant = state.currentEventData;
      var cKey = payload && payload.choiceKey ? payload.choiceKey : (evPlant && evPlant.choices[0] ? evPlant.choices[0].key : null);
      if (evPlant && evPlant.choices) {
        var chObj = evPlant.choices.find(function (c) { return c.key === cKey; }) || evPlant.choices[0];
        if (chObj.cost > 0) {
          p.silver = Math.max(0, p.silver - chObj.cost);
          silverDelta = -chObj.cost;
        } else if (chObj.cost < 0) {
          p.silver += Math.abs(chObj.cost);
          silverDelta = Math.abs(chObj.cost);
        }
        if (chObj.fameDelta) p.stats.fame = clamp(p.stats.fame + chObj.fameDelta, -100, 100);
        if (chObj.troopsDelta) p.troops = clamp(p.troops + chObj.troopsDelta, 0, p.maxTroops);
        if (chObj.statDelta) {
          Object.keys(chObj.statDelta).forEach(function (sk) {
            p.stats[sk] = Math.min(99, (p.stats[sk] || 0) + chObj.statDelta[sk]);
          });
        }
        if (chObj.flag) {
          p.callbackFlags[chObj.flag] = {
            eventId: evPlant.eventId,
            flag: chObj.flag,
            plantedLoop: state.loop,
            resolved: false
          };
        }
        if (p.seenEvents.indexOf(evPlant.eventId) < 0) p.seenEvents.push(evPlant.eventId);
        headline = evPlant.title + '：选择「' + chObj.label + '」';
        quote = '已在江湖种下因果，且看日后渡口重逢如何收场！';
        addLog(headline, 'info');
      }
    } else if (actionKey === 'hulao_pay') {
      var hFee = Math.round(calcBaseStipend(state.loop, state) * 0.8);
      chargePlayer(hFee, 'caocao', events);
      silverDelta = -hFee;
      p.buffs.hulaoPaidThisLoop = true;
      p.buffs.hulaoPassLoops = 2;
      headline = '缴纳虎牢养护费 -' + hFee + ' 两';
      quote = '领到吕将军签字免死通行贴：2圈内踩敌城过路费直减 20%！';
      addLog(headline + '，' + quote, 'info');
    } else if (actionKey === 'chibi_wind') {
      p.buffs.chibiWindBroken = true;
      p.troops = Math.min(p.maxTroops, p.troops + 200);
      giveCombatCard('add_oil');
      headline = '七星坛借东风成功！';
      quote = '江面东南风大作！关底魔王水战装甲已破除，另获奇策《火上浇油》！';
      addLog(headline, 'good');
    } else {
      headline = '路过【' + tile.name + '】';
      quote = '吹着小曲继续往前逛啰！';
    }

    var nextPhase;
    if (state.phase === 'GAME_OVER') {
      nextPhase = 'GAME_OVER';
    } else if (droppedEquip && !droppedEquip.autoSold) {
      state.phase = 'EQUIP_PROMPT';
      nextPhase = 'EQUIP_PROMPT';
    } else {
      nextPhase = advanceAfterLandingResolved(events);
    }

    recomputeAllDerived(state);
    return {
      ok: true,
      actionKey: actionKey,
      win: win,
      silverDelta: silverDelta,
      headline: headline,
      quote: quote,
      droppedEquip: droppedEquip,
      callbackTriggered: callbackTriggered,
      nextPhase: nextPhase,
      events: events,
      state: getState()
    };
  }

  // ==================== 落点结清后的阶段推进与过圈结算链 ====================

  function advanceAfterLandingResolved(events) {
    if (state.phase === 'GAME_OVER' || state.phase === 'BOSS_FINALE') {
      return state.phase;
    }

    var allDead = state.hegemons.every(function (h) { return h.bankrupt; });
    if (allDead) {
      state.phase = 'BOSS_FINALE';
      return 'BOSS_FINALE';
    }

    if (state.pendingLoopPass) {
      processLoopPass(events);
      return state.phase;
    }

    if (state.pendingPoliciesCount > 0) {
      enterPolicyPhase();
      return state.phase;
    }

    state.phase = 'IDLE';
    return 'IDLE';
  }

  // 过圈结算第一步：发放俸禄+税收+征兵、执行上一圈预告的霸主手笔、圈数 +1、进入置业时间或决战！
  function processLoopPass(events) {
    if (!state) newGame();
    state.pendingLoopPass = false;

    var income = calcLoopIncome(state);
    var exactBonus = state.exactStartBonusPending ? Math.round(income.stipend * 0.5) : 0;
    state.exactStartBonusPending = false;

    var totalIn = income.totalSilver + exactBonus;
    state.player.silver += totalIn;

    var troopRefill = Math.round(income.stipend * 0.30 * (hasPolicy('P25') ? 2.0 : 1.0)) + income.troopRecruit;
    state.player.troops = Math.min(state.player.maxTroops, state.player.troops + troopRefill);

    // 递减全盘持续圈数 Buff/Debuff
    if (state.player.bouncedCooldown > 0) state.player.bouncedCooldown -= 1;
    if (state.player.buffs.hulaoPassLoops > 0) state.player.buffs.hulaoPassLoops -= 1;
    state.player.buffs.hulaoPaidThisLoop = false;
    state.player.buffs.p22UsedThisLoop = false;
    state.player.buffs.p28UsedThisLoop = false;
    state.player.estateUpgradedTilesThisLoop = [];

    if (state.worldEffects.waterBlockadeLoops > 0) state.worldEffects.waterBlockadeLoops -= 1;
    if (state.worldEffects.badFortuneBiasLoops > 0) state.worldEffects.badFortuneBiasLoops -= 1;

    for (var i = 0; i < state.board.length; i++) {
      var bt = state.board[i];
      if (bt.brokenLoops > 0) bt.brokenLoops -= 1;
      if (bt.woundedLoops > 0) bt.woundedLoops -= 1;
      if (bt.sealedLoops > 0) bt.sealedLoops -= 1;
      if (bt.govHolidayLoops > 0) bt.govHolidayLoops -= 1;
      if (bt.halfPriceLoops > 0) bt.halfPriceLoops -= 1;
    }

    // 生效上一圈提前明牌预告的「霸主手笔」！
    executePreviewedHegemonMoves(events);

    var completedLoop = state.loop;
    state.loop += 1;

    var summary = {
      completedLoop: completedLoop,
      newLoop: state.loop,
      stipend: income.stipend,
      taxTotal: income.taxTotal,
      exactBonus: exactBonus,
      totalSilver: totalIn,
      troopRefill: troopRefill
    };
    state.lastLoopSummaryData = summary;
    state.lastLoopSummary = '过圈发薪水啰！俸禄+店面税银 +' + totalIn + ' 两，征兵补给 +' + troopRefill + '！';

    addLog('跨越起点进第 ' + Math.min(state.loop, state.maxLoops) + ' 圈！俸禄+税银入袋 +' + totalIn + ' 两，补兵 +' + troopRefill + '！', 'good');
    if (events) events.push({ type: 'loop_pass', summary: summary });

    recomputeAllDerived(state);

    // 若已跑满总圈数（第 8 圈或第 15 圈结束），直接开启期末关底决战三段！
    if (state.loop > state.maxLoops) {
      state.loop = state.maxLoops;
      state.phase = 'BOSS_FINALE';
      addLog('跑满 ' + state.maxLoops + ' 圈！天命魔王【赤壁铁索巨舰·曹丞相】压境，全军万炮齐发！', 'warn');
      return summary;
    }

    // 登记里民大会政见节点（标准局偶数年圈；8圈快局第2,3,5,6,7圈）
    var isPolicyLoop = state.maxLoops <= 8
      ? ([2, 3, 5, 6, 7].indexOf(state.loop) >= 0)
      : ([2, 4, 6, 8, 10, 12, 14].indexOf(state.loop) >= 0);
    if (isPolicyLoop) {
      state.pendingPoliciesCount += 1;
    }

    state.phase = 'LOOP_ESTATE';
    return summary;
  }

  function executePreviewedHegemonMoves(events) {
    var seeThrough = DATA.ADVISORS[state.player.advisorId].seeThrough || 0.20;
    for (var i = 0; i < state.hegemons.length; i++) {
      var heg = state.hegemons[i];
      if (heg.bankrupt || !heg.nextMoveCard) continue;
      var card = heg.nextMoveCard;
      heg.nextMoveCard = null;

      var targetId = card.targetTileIdx;
      var msg = '';

      if (card.id === 'H01') {
        var tCity = typeof targetId === 'number' ? state.board[targetId] : null;
        if (tCity && tCity.owner === 'player') {
          if (tCity.level > (card.recordedLevel || 1) || tCity.buildings.indexOf('wind_orb') >= 0) {
            msg = '反制成功！你提前升级/加装定风珠，曹操《恶意并购》当场作废！';
            addLog(msg, 'good');
          } else {
            var buyout = Math.round(calcCityCumCost(tCity) * 1.2);
            if (heg.vault >= buyout) {
              heg.vault -= buyout;
              state.player.silver += buyout;
              tCity.owner = heg.id;
              tCity.governorId = 'xiahoudun';
              msg = '曹操发动《恶意并购》：花 ' + buyout + ' 两强行买走了你的【' + tCity.name + '】！';
              addLog(msg, 'warn');
            }
          }
        }
      } else if (card.id === 'H02') {
        var taxCut = Math.round(state.player.silver * 0.18 * (1 - seeThrough));
        if (taxCut > 0) {
          state.player.silver -= taxCut;
          heg.vault += taxCut;
          msg = '曹操《挟天子征税》生效（军师看破减损后）：征收勤王税 -' + taxCut + ' 两！';
          addLog(msg, 'warn');
        } else {
          msg = '你手头现金早已花在房产上，曹操《挟天子征税》一文没收着！';
          addLog(msg, 'good');
        }
      } else if (card.id === 'H03') {
        state.worldEffects.waterBlockadeLoops = 2;
        msg = '孙权《江东水产封锁》生效：2 圈内全盘水城过路费 +40%！';
        addLog(msg, 'info');
      } else if (card.id === 'H04') {
        var jianye = state.board[15];
        if (jianye && jianye.owner === 'sunquan' && jianye.buildings.indexOf('arrow_tower') < 0) {
          jianye.buildings.push('arrow_tower');
        }
        heg.guardHp = heg.maxGuardHp;
        msg = '孙权《隔岸观火》：建业加盖箭塔并补满水军护卫！';
        addLog(msg, 'info');
      } else if (card.id === 'H05') {
        var topC = state.board.filter(function (t) { return t.owner === 'player'; }).sort(function (a, b) { return b.currentToll - a.currentToll; })[0];
        if (topC) {
          if (topC.buildings.indexOf('wind_orb') >= 0) {
            msg = '【' + topC.name + '】定风珠神光护体，弹飞了拆迁队！';
            addLog(msg, 'good');
          } else if (topC.buildings.length > 0) {
            var bRemoved = topC.buildings.pop();
            msg = heg.name + '《西凉拆迁队》拆掉了【' + topC.name + '】的' + DATA.BUILDINGS[bRemoved].name + '！';
            addLog(msg, 'warn');
          } else {
            topC.brokenLoops = 2;
            msg = heg.name + '《西凉拆迁队》踹门，【' + topC.name + '】挂 2 圈溃散！';
            addLog(msg, 'warn');
          }
        }
      } else if (card.id === 'H06') {
        var myCs = state.board.filter(function (t) { return t.owner === 'player'; });
        var feast = 0;
        myCs.forEach(function (c) { feast += c.level * 80; });
        feast = Math.min(state.player.silver, Math.round(feast * (1 - seeThrough)));
        state.player.silver -= feast;
        heg.vault += feast;
        msg = heg.name + '《豪华尾牙摊派》收走礼金 -' + feast + ' 两！';
        addLog(msg, 'warn');
      } else if (card.id === 'H07') {
        var freeC = state.board.find(function (t) { return t.type === 'city' && !t.owner; });
        if (freeC && heg.vault >= freeC.basePrice * 0.5) {
          heg.vault -= Math.round(freeC.basePrice * 0.5);
          freeC.owner = heg.id;
          freeC.level = 1;
          msg = heg.name + '《低价圈地招标》半价收编了【' + freeC.name + '】！';
          addLog(msg, 'info');
        }
      } else if (card.id === 'H08') {
        if (state.player.stats.charm < 55) {
          var gCity = state.board.find(function (t) { return t.owner === 'player' && t.governorId && t.buildings.indexOf('wind_orb') < 0; });
          if (gCity) {
            gCity.govHolidayLoops = 1;
            msg = heg.name + '《高薪挖墙脚》请【' + gCity.name + '】太守喝茶休假 1 圈！';
            addLog(msg, 'warn');
          }
        } else {
          msg = '主公魅力过人，麾下太守断然拒绝了曹老板下午茶挖角！';
          addLog(msg, 'good');
        }
      } else if (card.id === 'H09') {
        if (!state.player.equipment.helm && !state.player.equipment.armor) {
          var lostT = Math.round(160 * (1 - seeThrough));
          state.player.troops = Math.max(0, state.player.troops - lostT);
          msg = '未穿戴头冠护甲，水警临检扣减护卫兵力 -' + lostT + '！';
          addLog(msg, 'warn');
        }
      } else if (card.id === 'H10') {
        heg.evadeTollShield = 1;
        msg = heg.name + '挂出《老赖免单护盾》：下次踩你城少付六成！';
        addLog(msg, 'info');
      } else if (card.id === 'H11') {
        state.worldEffects.badFortuneBiasLoops = 1;
      } else if (card.id === 'H12') {
        state.worldEffects.bossExtraShield += 500;
        msg = '曹操《赤壁铁索蓄力》：魔王决战护盾充能 +500（定风珠或借东风可一击破除）！';
        addLog(msg, 'warn');
      }

      if (msg && events) {
        events.push({ type: 'hegemon_move_executed', hegemonId: heg.id, cardId: card.id, text: msg });
      }
    }
  }

  // ==================== 置业时间（一屏盖楼 + 阿伯代办） ====================

  function hasGlobalPoopGod(st) {
    var s = st || state;
    return s.board.some(function (t) {
      return t.buildings && t.buildings.indexOf('poop_god') >= 0;
    });
  }

  function getEstateOptions() {
    if (!state) newGame();
    recomputeAllDerived(state);

    var p = state.player;
    var poopBuilt = hasGlobalPoopGod(state);
    var costMult = hasPolicy('P04') ? 0.75 : 1.0;

    var myCities = state.board.filter(function (t) {
      return t.type === 'city' && t.owner === 'player';
    }).map(function (t) {
      var slotsMax = DATA.CITY_SCALE[t.level].slots;
      var slotsUsed = 0;
      for (var i = 0; i < t.buildings.length; i++) {
        slotsUsed += DATA.BUILDINGS[t.buildings[i]].slots;
      }
      var slotsFree = Math.max(0, slotsMax - slotsUsed);
      var alreadyUpgraded = p.estateUpgradedTilesThisLoop.indexOf(t.idx) >= 0;
      var upCost = calcCityUpgradeCost(t, true, state);
      var canUpgrade = t.level < 5 && !alreadyUpgraded && p.silver >= upCost;

      var availableBuildings = Object.keys(DATA.BUILDINGS).map(function (bKey) {
        var bDef = DATA.BUILDINGS[bKey];
        var bCost = Math.round(t.basePrice * bDef.costFactor * costMult);
        var alreadyHas = t.buildings.indexOf(bKey) >= 0;
        var blockedByUnique = bDef.uniqueGlobal && poopBuilt;
        var canBuild = !alreadyHas && !blockedByUnique && slotsFree >= bDef.slots && p.silver >= bCost;
        return {
          id: bDef.id,
          name: bDef.name,
          series: bDef.series,
          cost: bCost,
          slots: bDef.slots,
          worldImg: bDef.worldImg,
          desc: bDef.desc,
          alreadyHas: alreadyHas,
          canBuild: canBuild
        };
      });

      return {
        tileIdx: t.idx,
        name: t.name,
        regionName: t.regionName,
        terrainName: t.terrainName,
        level: t.level,
        currentToll: t.currentToll,
        alreadyUpgraded: alreadyUpgraded,
        canUpgrade: canUpgrade,
        upgradeCost: upCost,
        slotsMax: slotsMax,
        slotsUsed: slotsUsed,
        slotsFree: slotsFree,
        buildings: t.buildings.slice(),
        availableBuildings: availableBuildings,
        governorId: t.governorId,
        governorName: t.governorId && DATA.GOVERNORS[t.governorId] ? DATA.GOVERNORS[t.governorId].name : '未派驻'
      };
    });

    var govList = p.rosterGovernors.map(function (gid) {
      var g = DATA.GOVERNORS[gid];
      var assignedTile = state.board.find(function (t) { return t.owner === 'player' && t.governorId === gid; });
      return {
        id: g.id,
        name: g.name,
        title: g.title,
        ecoBonusPct: Math.round(g.ecoBonus * 100),
        desc: g.desc,
        assignedTileIdx: assignedTile ? assignedTile.idx : null,
        assignedCityName: assignedTile ? assignedTile.name : null
      };
    });

    return {
      silver: p.silver,
      cities: myCities,
      availableGovernors: govList
    };
  }

  function applyEstateUpgrade(op) {
    if (!state) newGame();
    if (!op || typeof op.tileIdx !== 'number') {
      return { ok: false, message: '参数缺失！', state: getState() };
    }
    var tile = state.board[op.tileIdx];
    if (!tile || tile.type !== 'city' || tile.owner !== 'player') {
      return { ok: false, message: '只能经营自家名下城池哦！', state: getState() };
    }

    var p = state.player;
    var costMult = hasPolicy('P04') ? 0.75 : 1.0;
    var msg = '';

    if (op.type === 'upgrade') {
      if (tile.level >= 5) return { ok: false, message: '该城已是满级 Lv.5 首富巨城！', state: getState() };
      if (p.estateUpgradedTilesThisLoop.indexOf(tile.idx) >= 0) {
        return { ok: false, message: '置业时间每城每圈限升 1 级哦！', state: getState() };
      }
      var uCost = calcCityUpgradeCost(tile, true, state);
      if (p.silver < uCost) return { ok: false, message: '银两不足升级！', state: getState() };
      p.silver -= uCost;
      tile.level += 1;
      p.estateUpgradedTilesThisLoop.push(tile.idx);
      msg = '【' + tile.name + '】扩建升至 Lv.' + tile.level + '（过路费翻倍）！';
    } else if (op.type === 'build') {
      var bDef = DATA.BUILDINGS[op.buildingId];
      if (!bDef) return { ok: false, message: '未知建筑蓝图！', state: getState() };
      if (tile.buildings.indexOf(bDef.id) >= 0) return { ok: false, message: '同名建筑一城限盖一座！', state: getState() };
      if (bDef.uniqueGlobal && hasGlobalPoopGod(state)) return { ok: false, message: '屎王神全盘限供一尊！', state: getState() };

      var used = 0;
      tile.buildings.forEach(function (bid) { used += DATA.BUILDINGS[bid].slots; });
      var free = DATA.CITY_SCALE[tile.level].slots - used;
      if (free < bDef.slots) return { ok: false, message: '城池建筑槽位不足，请先升城扩槽！', state: getState() };

      var bCost = Math.round(tile.basePrice * bDef.costFactor * costMult);
      if (p.silver < bCost) return { ok: false, message: '银两不足加盖建筑！', state: getState() };

      p.silver -= bCost;
      tile.buildings.push(bDef.id);
      msg = '在【' + tile.name + '】落成新建筑：' + bDef.name + '！';
    } else if (op.type === 'assign_governor') {
      var gId = op.governorId;
      if (gId && p.rosterGovernors.indexOf(gId) >= 0) {
        // 若该太守原本在别的城，互换防务
        var prevCity = state.board.find(function (t) { return t.owner === 'player' && t.governorId === gId; });
        if (prevCity && prevCity.idx !== tile.idx) {
          prevCity.governorId = tile.governorId || null;
        }
        tile.governorId = gId;
        msg = '调派【' + DATA.GOVERNORS[gId].name + '】出任【' + tile.name + '】太守！';
      }
    } else {
      return { ok: false, message: '不支持的置业操作类型！', state: getState() };
    }

    addLog(msg, 'good');
    recomputeAllDerived(state);
    return {
      ok: true,
      message: msg,
      estateOptions: getEstateOptions(),
      state: getState()
    };
  }

  // 「阿伯代办」一键按最快回本比（ROI）自动派太守、反制恶意并购、升级高优地王并加盖高收益建筑！
  function autoEstateByUncle() {
    if (!state) newGame();
    recomputeAllDerived(state);

    var p = state.player;
    var reserve = Math.min(600, Math.round(calcBaseStipend(state.loop, state) * 0.4)); // 留一点买路底钱防裸奔
    var spent = 0;
    var actionsTaken = [];

    var myCities = state.board.filter(function (t) { return t.type === 'city' && t.owner === 'player'; });
    if (myCities.length === 0) {
      return { ok: true, actionsTaken: [], spentSilver: 0, quote: '阿伯摊手：「主公名下还没店面，快去买块地再来找阿伯盖楼啦！」', state: getState() };
    }

    // 1. 自动把高经营加成太守派驻到地价/规模最高的城池（避开建了屎王神的城）
    var sortedCitiesForGov = myCities.slice().sort(function (a, b) {
      var aPoop = a.buildings.indexOf('poop_god') >= 0 ? 1 : 0;
      var bPoop = b.buildings.indexOf('poop_god') >= 0 ? 1 : 0;
      if (aPoop !== bPoop) return aPoop - bPoop;
      return (b.basePrice * b.level) - (a.basePrice * a.level);
    });
    var sortedGovs = p.rosterGovernors.slice().sort(function (ga, gb) {
      return DATA.GOVERNORS[gb].ecoBonus - DATA.GOVERNORS[ga].ecoBonus;
    });
    for (var c = 0; c < myCities.length; c++) myCities[c].governorId = null;
    for (var g = 0; g < Math.min(sortedCitiesForGov.length, sortedGovs.length); g++) {
      sortedCitiesForGov[g].governorId = sortedGovs[g];
    }

    // 2. 优先检查是否有曹操《恶意并购》点名的城，优先升1级反制！
    var caocao = getHegemonById('caocao', state);
    if (caocao && caocao.nextMoveCard && caocao.nextMoveCard.id === 'H01' && typeof caocao.nextMoveCard.targetTileIdx === 'number') {
      var threatened = state.board[caocao.nextMoveCard.targetTileIdx];
      if (threatened && threatened.owner === 'player' && threatened.level < 5) {
        var tCost = calcCityUpgradeCost(threatened, true, state);
        if (p.silver - tCost >= 200) {
          var r0 = applyEstateUpgrade({ type: 'upgrade', tileIdx: threatened.idx });
          if (r0.ok) {
            spent += tCost;
            actionsTaken.push('反制并购升【' + threatened.name + '】至Lv.' + threatened.level);
          }
        }
      }
    }

    // 3. 按连城倍率 × 地价回本速度排序，依次升级城池！
    var roiCities = myCities.slice().sort(function (a, b) {
      var scoreA = a.basePrice * calcChainMultiplier(a, state);
      var scoreB = b.basePrice * calcChainMultiplier(b, state);
      return scoreB - scoreA;
    });

    for (var i = 0; i < roiCities.length; i++) {
      var city = roiCities[i];
      if (city.level < 5 && p.estateUpgradedTilesThisLoop.indexOf(city.idx) < 0) {
        var uCost = calcCityUpgradeCost(city, true, state);
        if (p.silver - uCost >= reserve) {
          var resUp = applyEstateUpgrade({ type: 'upgrade', tileIdx: city.idx });
          if (resUp.ok) {
            spent += uCost;
            actionsTaken.push('升【' + city.name + '】Lv.' + city.level);
          }
        }
      }
    }

    // 4. 若仍有闲钱与空建筑槽，智能加盖屎王神（若相邻敌城多）、箭塔或市集！
    for (var j = 0; j < roiCities.length; j++) {
      var bCity = roiCities[j];
      var neighEnemies = 0;
      for (var d = -2; d <= 2; d++) {
        if (d === 0) continue;
        var nt = state.board[(bCity.idx + d + 28) % 28];
        if (nt.type === 'city' && nt.owner && nt.owner !== 'player') neighEnemies++;
      }

      var candidateBldgs = [];
      if (neighEnemies >= 2 && !hasGlobalPoopGod(state) && bCity.level <= 2) {
        candidateBldgs.push('poop_god');
      }
      candidateBldgs.push('market', 'arrow_tower', 'plunder', 'granary');

      for (var cb = 0; cb < candidateBldgs.length; cb++) {
        var bId = candidateBldgs[cb];
        var costMult = hasPolicy('P04') ? 0.75 : 1.0;
        var bCost = Math.round(bCity.basePrice * DATA.BUILDINGS[bId].costFactor * costMult);
        if (p.silver - bCost >= reserve) {
          var resB = applyEstateUpgrade({ type: 'build', tileIdx: bCity.idx, buildingId: bId });
          if (resB.ok) {
            spent += bCost;
            actionsTaken.push('【' + bCity.name + '】盖' + DATA.BUILDINGS[bId].name);
            break;
          }
        }
      }
    }

    recomputeAllDerived(state);
    var quote = actionsTaken.length > 0
      ? ('阿伯拍胸脯：「搞定啰！共砸 ' + spent + ' 两办好 ' + actionsTaken.length + ' 桩建设，等曹老板上门挨宰！」')
      : '阿伯拨算盘：「手头现银留着跑圈周转刚好，太守都帮你排妥当啦！」';

    return {
      ok: true,
      actionsTaken: actionsTaken,
      spentSilver: spent,
      quote: quote,
      state: getState()
    };
  }

  // 结束置业时间 -> 霸主过圈扩张与下圈手笔亮牌 -> 盘面升阶 -> 进入政见三选一 / 踢馆宿敌 / IDLE
  function finishEstatePhase() {
    if (!state) newGame();

    var hegemonExpansion = runHegemonLoopExpansion();
    var escalations = runBoardEscalation();
    recomputeAllDerived(state);

    var nextMoveCards = state.hegemons
      .filter(function (h) { return !h.bankrupt && h.nextMoveCard; })
      .map(function (h) { return h.nextMoveCard; });

    // 检查是否进入政见三选一或踢馆宿敌期中考
    if (state.pendingPoliciesCount > 0) {
      enterPolicyPhase();
    } else if (shouldTriggerRivalExam()) {
      enterRivalExamPhase();
    } else {
      state.phase = 'IDLE';
    }

    return {
      ok: true,
      nextPhase: state.phase,
      policyChoices: state.phase === 'LOOP_POLICY' ? state.currentPolicyChoices : [],
      rivalExam: state.phase === 'RIVAL_EXAM' ? state.currentRivalExam : null,
      hegemonExpansion: hegemonExpansion,
      escalations: escalations,
      nextMoveCards: nextMoveCards,
      state: getState()
    };
  }

  function runHegemonLoopExpansion() {
    var logs = [];
    var safety = calcBaseStipend(state.loop, state) * 1.6;

    for (var i = 0; i < state.hegemons.length; i++) {
      var heg = state.hegemons[i];
      if (heg.bankrupt) continue;

      // 过圈回满车驾护卫兵力，领取名下城池税收 + 保底集团补贴
      heg.guardHp = heg.maxGuardHp;
      var hTax = Math.round(380 * calcLoopScale(state.loop));
      var hCities = state.board.filter(function (t) { return t.type === 'city' && t.owner === heg.id; });
      for (var c = 0; c < hCities.length; c++) {
        hTax += calcCityTax(hCities[c], state);
      }
      heg.vault += hTax;

      // 野心 Ⅱ/Ⅲ 自动扩建 1 座城池
      if (hCities.length > 0 && (heg.ambitionStage >= 2 || state.loop % 2 === 0)) {
        hCities.sort(function (a, b) { return b.basePrice - a.basePrice; });
        var targetC = hCities.find(function (ct) { return ct.level < 5; });
        if (targetC) {
          var upCost = calcCityUpgradeCost(targetC, false, state);
          if (heg.vault - upCost >= safety) {
            heg.vault -= upCost;
            targetC.level += 1;
            logs.push(heg.name + '过圈扩张，将【' + targetC.name + '】升至 Lv.' + targetC.level);
          }
        }
      }

      // 第 11 圈起（8圈局第 6 圈起）野心 Ⅲ：放出 1 支逆时针讨债队！
      var debtStartLoop = state.maxLoops <= 8 ? 6 : 11;
      if (state.loop >= debtStartLoop) {
        var hasTeam = state.debtTeams.some(function (dt) { return dt.ownerId === heg.id; });
        if (!hasTeam) {
          state.debtTeams.push({
            id: nextUid('debt'),
            ownerId: heg.id,
            ownerName: heg.name,
            pos: heg.homeTile
          });
          var dMsg = DATA.QUOTES.bouncedCheckBtn ? (heg.name + '从主城派出了逆时针追缉【讨债队】！') : '';
          logs.push(dMsg);
          addLog(dMsg, 'warn');
        }
      }

      // 提前 1 圈明牌亮出下一圈「霸主手笔」预告卡！
      var shouldDrawCard = (heg.ambitionStage === 1 && state.loop === 3) ||
        (heg.ambitionStage === 2 && state.loop % 2 === 0) ||
        (heg.ambitionStage === 3);
      if (shouldDrawCard) {
        var pool = DATA.HEGEMON_MOVES.filter(function (m) {
          return m.owner === heg.id && m.stage <= heg.ambitionStage;
        });
        var picked = pickOne(pool);
        if (picked) {
          var cardCopy = Object.assign({}, picked);
          if (cardCopy.id === 'H01') {
            var pCities = state.board.filter(function (t) { return t.owner === 'player'; });
            pCities.sort(function (a, b) { return calcCityCumCost(a) - calcCityCumCost(b); });
            if (pCities.length > 0) {
              cardCopy.targetTileIdx = pCities[0].idx;
              cardCopy.targetCityName = pCities[0].name;
              cardCopy.recordedLevel = pCities[0].level;
              cardCopy.effectDesc = '点名下圈强买【' + pCities[0].name + '】（本圈将其升1级或盖定风珠即作废）！';
            }
          }
          heg.nextMoveCard = cardCopy;
          logs.push('明牌预警：' + cardCopy.previewQuote);
          addLog('霸主手笔预告｜' + cardCopy.previewQuote, 'warn');
        }
      }
    }
    return logs;
  }

  // 盘面升阶（Loop Escalation）：随机 2~3 个格子塞乡民红包、精英心魔或夜市五折！
  function runBoardEscalation() {
    var changes = [];

    var emptyCities = state.board.filter(function (t) { return t.type === 'city' && !t.owner && t.bonusRedPacket === 0; });
    if (emptyCities.length > 0) {
      var rc = pickOne(emptyCities);
      rc.bonusRedPacket = 350;
      changes.push('【' + rc.name + '】塞入乡民红包+350两');
    }

    var demonTile = pickOne([state.board[9], state.board[23]]);
    if (demonTile && !demonTile.eliteDemon) {
      demonTile.eliteDemon = true;
      changes.push('【' + demonTile.name + '】刷出精英心魔必爆神装');
    }

    if (state.loop % 2 === 1) {
      var mkt = pickOne([state.board[5], state.board[19]]);
      mkt.halfPriceLoops = 1;
      changes.push('【' + mkt.name + '】跳楼五折拍卖');
    }

    return changes;
  }

  // ==================== 政见三选一（冻蒜！）与踢馆宿敌 ====================

  function enterPolicyPhase() {
    state.phase = 'LOOP_POLICY';
    state.policyRefreshUsed = 0;
    state.currentPolicyChoices = rollThreePolicies();
  }

  function rollThreePolicies() {
    var owned = state.player.policies;
    var hasP18 = owned.indexOf('P18') >= 0;
    var hasP24 = owned.indexOf('P24') >= 0;

    var pool = DATA.POLICIES.filter(function (pol) {
      if (owned.indexOf(pol.id) >= 0) return false;
      if (pol.id === 'P24' && hasP18) return false; // P18 与 P24 互斥
      if (pol.id === 'P18' && hasP24) return false;
      return true;
    });

    // 统计流派倾向（「民调显示」保底位）
    var schoolCounts = {};
    for (var i = 0; i < owned.length; i++) {
      var pDef = DATA.POLICIES.find(function (x) { return x.id === owned[i]; });
      if (pDef) schoolCounts[pDef.school] = (schoolCounts[pDef.school] || 0) + 1;
    }
    var favoredSchool = null;
    Object.keys(schoolCounts).forEach(function (sc) {
      if (schoolCounts[sc] >= 2) favoredSchool = sc;
    });

    var result = [];
    var copyPool = pool.slice();

    if (favoredSchool) {
      var schoolSub = copyPool.filter(function (x) { return x.school === favoredSchool; });
      if (schoolSub.length > 0) {
        var favoredPick = pickOne(schoolSub);
        result.push(Object.assign({}, favoredPick, { pollRecommended: true, isPollGuaranteed: true }));
        copyPool = copyPool.filter(function (x) { return x.id !== favoredPick.id; });
      }
    }

    while (result.length < 3 && copyPool.length > 0) {
      var idx = randInt(0, copyPool.length - 1);
      var item = copyPool.splice(idx, 1)[0];
      result.push(Object.assign({}, item, { pollRecommended: false, isPollGuaranteed: false }));
    }

    return result;
  }

  function getPolicyChoices() {
    if (!state) newGame();
    if (state.currentPolicyChoices.length === 0 && state.pendingPoliciesCount > 0) {
      state.currentPolicyChoices = rollThreePolicies();
    }
    return state.currentPolicyChoices;
  }

  function refreshPolicies() {
    if (!state || state.phase !== 'LOOP_POLICY') {
      return { ok: false, message: '当前不在政见三选一阶段！', state: getState() };
    }
    if (state.player.luckSticks <= 0 || state.policyRefreshUsed >= 2) {
      return { ok: false, message: '气运签不足或本轮刷新已达上限！', state: getState() };
    }
    state.player.luckSticks -= 1;
    state.policyRefreshUsed += 1;
    state.currentPolicyChoices = rollThreePolicies();
    return {
      ok: true,
      choices: state.currentPolicyChoices,
      state: getState()
    };
  }

  function selectPolicy(policyId) {
    if (!state) newGame();
    var chosen = state.currentPolicyChoices.find(function (c) { return c.id === policyId; }) ||
      DATA.POLICIES.find(function (c) { return c.id === policyId; }) ||
      state.currentPolicyChoices[0];

    if (!chosen) {
      state.phase = 'IDLE';
      return { ok: false, message: '无可选政见', state: getState() };
    }

    if (state.player.policies.indexOf(chosen.id) < 0) {
      state.player.policies.push(chosen.id);
      if (chosen.id === 'P18') {
        state.player.maxLuckSticks = 4;
        state.player.luckSticks = Math.min(4, state.player.luckSticks + 1);
      }
    }

    state.pendingPoliciesCount = Math.max(0, state.pendingPoliciesCount - 1);
    state.currentPolicyChoices = [];

    var msg = '政见拍板【' + chosen.name + '】！' + DATA.QUOTES.dongSuan;
    addLog(msg, 'good');

    if (state.pendingPoliciesCount > 0) {
      enterPolicyPhase();
    } else if (shouldTriggerRivalExam()) {
      enterRivalExamPhase();
    } else {
      state.phase = 'IDLE';
    }

    recomputeAllDerived(state);
    return {
      ok: true,
      selected: chosen,
      quote: DATA.QUOTES.dongSuan,
      nextPhase: state.phase,
      state: getState()
    };
  }

  function shouldTriggerRivalExam() {
    var examLoop = state.maxLoops <= 8 ? (state.loop === 4 ? 5 : 0) : (state.loop === 5 || state.loop === 10 ? state.loop : 0);
    if (!examLoop) return false;
    var examDef = DATA.RIVAL_EXAMS[examLoop];
    if (!examDef) return false;
    var doneKey = 'exam_done_' + examLoop;
    return !state.player.buffs[doneKey];
  }

  function enterRivalExamPhase() {
    var examKey = state.maxLoops <= 8 ? 5 : state.loop;
    var examDef = DATA.RIVAL_EXAMS[examKey];
    state.player.buffs['exam_done_' + examKey] = true;

    var fakeTile = { governorId: examKey === 5 ? 'xiahoudun' : 'lvbu', buildings: [], woundedLoops: 0, terrain: 'land' };
    var duelInfo = calcCombatPowerAndWinRate('duel', fakeTile, 10, state);
    var canPassCheck = examKey === 5 ? (state.player.silver >= 2400) : (state.player.stats.strategy >= 52 && state.player.silver >= 600);

    state.phase = 'RIVAL_EXAM';
    state.currentRivalExam = {
      examKey: examKey,
      name: examDef.name,
      img: examDef.img,
      taunt: examDef.taunt,
      canPassCheck: canPassCheck,
      checkLabel: examDef.checkLabel,
      fightLabel: examDef.fightLabel,
      winRate: duelInfo.winRate,
      winRatePct: duelInfo.winRatePct,
      fightWinRatePct: duelInfo.winRatePct,
      loseQuote: examDef.loseQuote
    };
  }

  function getRivalExam() {
    return state ? state.currentRivalExam : null;
  }

  function resolveRivalExam(choiceKey) {
    if (!state || state.phase !== 'RIVAL_EXAM' || !state.currentRivalExam) {
      return { ok: false, message: '当前无踢馆宿敌检定！', state: getState() };
    }
    var ex = state.currentRivalExam;
    var p = state.player;
    var passed = false;
    var headline = '';
    var quote = '';
    var droppedEquip = null;

    if (choiceKey === 'check' && ex.canPassCheck) {
      if (ex.examKey === 10) p.silver -= 600;
      passed = true;
      headline = '期中考【' + ex.name + '】轻松免战过关！';
      quote = ex.loseQuote;
    } else {
      passed = Math.random() < ex.winRate;
      if (passed) {
        headline = '骑木马揍翻踢馆宿敌【' + ex.name + '】！';
        quote = ex.loseQuote;
      } else {
        var fine = Math.round(calcBaseStipend(state.loop, state) * 1.2);
        chargePlayer(fine, 'system', []);
        if (p.luckSticks < p.maxLuckSticks) p.luckSticks += 1;
        headline = '踢馆惜败罚银 -' + fine + ' 两（获赠 1 支安慰气运签）';
        quote = '没关系不出局！塞支安慰签下半场讨回来！';
      }
    }

    if (passed) {
      giveCombatCard(ex.examKey === 5 ? 'add_oil' : 'redraw_fate');
      state.pendingPoliciesCount += 1;
      droppedEquip = triggerEquipmentDrop(ex.examKey === 5 ? ['stool', 'rattan_armor'] : ['green_dragon', 'red_hare']);
    }

    state.currentRivalExam = null;
    addLog(headline, passed ? 'good' : 'warn');

    if (droppedEquip && !droppedEquip.autoSold) {
      state.phase = 'EQUIP_PROMPT';
    } else if (state.pendingPoliciesCount > 0) {
      enterPolicyPhase();
    } else {
      state.phase = 'IDLE';
    }

    recomputeAllDerived(state);
    return {
      ok: true,
      win: passed,
      passed: passed,
      headline: headline,
      quote: quote,
      droppedEquip: droppedEquip,
      nextPhase: state.phase,
      state: getState()
    };
  }

  // ==================== 关底决战三段 computeBossFinale & 气运签逆天重轰 ====================

  function computeBossFinale(options) {
    if (!state) newGame();
    recomputeAllDerived(state);

    var opts = options || {};
    var p = state.player;
    var preview = state.bossPreview;
    var maxHp = preview.estHp;

    // 第一段：资产炮火（身家 ÷ 10 万炮齐发）
    var myCities = state.board.filter(function (t) { return t.type === 'city' && t.owner === 'player'; });
    myCities.sort(function (a, b) { return a.level - b.level || a.basePrice - b.basePrice; });

    var cityShots = [];
    var cityFireSum = 0;
    var hasP08 = hasPolicy('P08');
    for (var i = 0; i < myCities.length; i++) {
      var c = myCities[i];
      var cVal = calcCityCumCost(c);
      var shot = Math.round((cVal / 10) * (1 + p.artilleryBonusPct) * (hasP08 && c.level >= 4 ? 1.8 : 1.0));
      cityFireSum += shot;
      cityShots.push({
        tileIdx: c.idx,
        name: c.name,
        level: c.level,
        cumCost: cVal,
        shotDamage: shot
      });
    }
    var cashShot = Math.round((Math.max(0, p.silver) / 10) * (1 + p.artilleryBonusPct));
    var cannonExtra = p.buffs.lubanCannonBonus || 0;
    var d1Total = cityFireSum + cashShot + cannonExtra;

    // 第二段：名下驻城太守连携开火（至多 6 手，相邻羁绊 ×1.5）
    var govCities = myCities.filter(function (t) { return Boolean(t.governorId); }).slice(0, 6);
    var combos = [];
    var d2Total = 0;
    for (var j = 0; j < govCities.length; j++) {
      var gc = govCities[j];
      var gDef = DATA.GOVERNORS[gc.governorId] || DATA.GOVERNORS.lizhangbo;
      var rawT = calcToll(gc.idx, 'raw', state);
      var prevGovId = j > 0 ? govCities[j - 1].governorId : null;
      var hasBond = prevGovId && gDef.bondWith && gDef.bondWith.indexOf(prevGovId) >= 0;
      var mult = (hasBond ? 1.5 : 1.0) * (p.buffs.diaochanComboMult ? 1.5 : 1.0);
      var dmg = Math.max(40, Math.round((rawT / 10) * mult));
      d2Total += dmg;
      combos.push({
        tileIdx: gc.idx,
        cityName: gc.name,
        governorId: gDef.id,
        governorName: gDef.name,
        toll: rawT,
        hasBond: Boolean(hasBond),
        damage: dmg
      });
    }

    // 第三段：先锋骑木马单骑冲阵收尾（支持拍完手里剩余战斗奇策 + 吆喝助威连击！）
    var duelCalc = calcCombatPowerAndWinRate('duel', null, 20, state);
    var eqStats = calcPlayerEquipStats(state);
    var cardsUsed = p.combatCards.slice();
    if (Array.isArray(opts.combatCardIds)) {
      cardsUsed = p.combatCards.filter(function (cc) {
        return opts.combatCardIds.indexOf(cc.instanceId) >= 0 || opts.combatCardIds.indexOf(cc.id) >= 0;
      });
    }
    var hitCount = 5 + eqStats.extraHits + (hasPolicy('P13') ? 2 : 0) + (hasPolicy('P16') ? 3 : 0) + cardsUsed.length * 2;
    var cheerHits = clamp(typeof opts.cheerHits === 'number' ? opts.cheerHits : 3, 0, 5);
    var cheerBonusMult = 1 + cheerHits * 0.04; // 最高 +20%
    var miracleMult = opts._miracleBoost || 1.0;

    var hits = [];
    var d3Total = 0;
    for (var h = 1; h <= hitCount; h++) {
      var isCrit = h === hitCount || h % 3 === 0;
      var singleHit = Math.round(duelCalc.myPower * 0.45 * cheerBonusMult * miracleMult * (isCrit ? 1.25 : 1.0));
      d3Total += singleHit;
      hits.push({ hitIdx: h, damage: singleHit, isCrit: isCrit });
    }

    var totalDamage = d1Total + d2Total + d3Total;
    var victory = totalDamage >= maxHp;
    var remainingHp = Math.max(0, maxHp - totalDamage);
    var isSlipOverkill = victory && (totalDamage - maxHp > maxHp * 0.35);

    var grade = 'C';
    if (victory) {
      if (totalDamage >= maxHp * 1.45) grade = 'S';
      else if (totalDamage >= maxHp * 1.15) grade = 'A';
      else grade = 'B';
    }

    var summaryQuote = victory
      ? '曹操巨舰冒烟沉江：「夭寿哦，连东风跟房产炮弹都要开发票？大魏集团服了啦！」'
      : '魔王巨舰还剩一丝血皮：「差一点点炮弹！要不要塞支气运签逆天续命再轰一轮？！」';

    state.victory = victory;
    state.phase = victory ? 'GAME_OVER' : 'BOSS_FINALE';
    var res = {
      boss: {
        name: preview.name,
        img: preview.bossImg,
        chapterBaseHp: preview.chapterBaseHp,
        remnantRatio: preview.remnantRatio,
        shield: preview.shield,
        maxHp: maxHp,
        totalHp: maxHp,
        brokenWeaknesses: preview.brokenWeaknesses
      },
      stage1_artillery: {
        netWorth: p.netWorth,
        cashShot: cashShot,
        cannonExtra: cannonExtra,
        cityShots: cityShots,
        damage: d1Total,
        totalDamage: d1Total
      },
      stage2_governors: {
        combos: combos,
        damage: d2Total,
        totalDamage: d2Total
      },
      stage3_vanguard: {
        vanguardName: DATA.VANGUARDS[p.vanguardId].name,
        horseImg: DATA.VANGUARDS[p.vanguardId].horseImg,
        singlePower: duelCalc.myPower,
        hitCount: hitCount,
        cheerBonusPct: Math.round((cheerBonusMult - 1) * 100),
        cardsUsed: cardsUsed,
        hits: hits,
        damage: d3Total,
        totalDamage: d3Total,
        isSlipOverkill: isSlipOverkill
      },
      stage1Damage: d1Total,
      stage2Damage: d2Total,
      stage3Damage: d3Total,
      totalDamage: totalDamage,
      victory: victory,
      remainingHp: remainingHp,
      canRetryWithStick: !victory && p.luckSticks > 0,
      grade: grade,
      summaryQuote: summaryQuote
    };

    state.lastFinaleResult = res;
    addLog(victory ? ('决战通关（评级 ' + grade + '）！总火力 ' + totalDamage + ' 轰穿魔王 ' + maxHp + ' 气血！') : ('决战火力 ' + totalDamage + ' / ' + maxHp + '，还差 ' + remainingHp + ' 点！'), victory ? 'good' : 'warn');
    return Object.assign({}, res, { state: getState() });
  }

  // 战败时消耗 1 支气运签激发「草根逆天狂暴」重轰关底魔王！
  function retryBossWithStick(options) {
    if (!state || state.player.luckSticks <= 0) {
      return { ok: false, message: '没有气运签可供逆天重打啦！', state: getState() };
    }
    state.player.luckSticks -= 1;
    addLog('消耗 1 支气运签逆天续命！全军悲愤交加，先锋冲阵威力暴涨！', 'good');
    var mergedOpts = Object.assign({ cheerHits: 5, _miracleBoost: 1.85 }, options || {});
    return computeBossFinale(mergedOpts);
  }

  // ==================== 暴露全局 API ====================

  FTX.Engine = {
    newGame: newGame,
    getState: getState,
    getReachPreview: getReachPreview,
    setBetMultiplier: setBetMultiplier,
    switchVanguard: switchVanguard,
    setSpeed: setSpeed,
    useBoardCard: useBoardCard,
    rollDice: rollDice,
    rerollLastDice: rerollLastDice,
    getLandingOptions: getLandingOptions,
    startDuel: startDuel,
    finalizeDuel: finalizeDuel,
    resolveLanding: resolveLanding,
    resolveEquipPrompt: resolveEquipPrompt,
    processLoopPass: processLoopPass,
    getEstateOptions: getEstateOptions,
    applyEstateUpgrade: applyEstateUpgrade,
    autoEstateByUncle: autoEstateByUncle,
    finishEstatePhase: finishEstatePhase,
    getPolicyChoices: getPolicyChoices,
    refreshPolicies: refreshPolicies,
    selectPolicy: selectPolicy,
    getRivalExam: getRivalExam,
    resolveRivalExam: resolveRivalExam,
    computeBossFinale: computeBossFinale,
    retryBossWithStick: retryBossWithStick,
    Formulas: {
      calcLoopScale: calcLoopScale,
      calcChainMultiplier: calcChainMultiplier,
      calcCityCumCost: calcCityCumCost,
      calcCityUpgradeCost: calcCityUpgradeCost,
      calcToll: calcToll,
      calcLoopIncome: calcLoopIncome,
      calcEntityNetWorth: calcEntityNetWorth,
      calcCombatPowerAndWinRate: calcCombatPowerAndWinRate,
      calcBossPreview: calcBossPreview
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
