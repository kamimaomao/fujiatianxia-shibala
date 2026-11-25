/**
 * 《富甲天下：十八啦！》9:16 竖屏交互界面与 B+A 舞台演出主控制器 (mvp/js/ui.js)
 * - 100% 兼容 file:// 直接打开（零 ES Module / 零 fetch）
 * - 严守 /Users/kamisola/.codex/AGENTS.md 后台休眠规范：
 *   页面隐藏时立即暂停 requestAnimationFrame 粒子循环、自动连掷与倒计时器并通知 FTX.Audio.setHidden(true)，
 *   恢复可见时平滑恢复，且单例监听绝不重复绑定！
 */
(function (root) {
  'use strict';

  var FTX = (root.FTX = root.FTX || {});

  // ==================== 运行态与后台休眠受管句柄 ====================
  var uiBound = false;
  var visibilityBound = false;
  var isPageHidden = false;
  var isBusy = false;
  var autoRollEnabled = false;

  // 开局配置选项
  var startConfig = {
    lordId: 'liubei',
    vanguardId: 'zhangfei',
    maxLoops: 8,
    specialMode: 'hulao'
  };

  // 受管定时器与 RAF 句柄
  var activeTimers = [];
  var autoRollTimer = null;
  var duelInterval = null;
  var duelRemainingMs = 0;
  var duelPendingCallback = null;
  var rafId = null;
  var silverAnimId = null;

  // 粒子池與银两缓存
  var particles = [];
  var displayedSilver = null;
  var lastFinaleReport = null;
  var finaleCheerMode = false;
  var finaleCheerHits = 0;
  var activeBoardCardToUse = null;

  // ==================== 工具辅助函数 ====================
  function $(id) {
    return document.getElementById(id);
  }

  function fmtNum(n) {
    var v = Math.round(Number(n) || 0);
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function speedDiv(ms) {
    var st = FTX.Engine && FTX.Engine.getState ? FTX.Engine.getState() : null;
    var sp = st && st.speed ? st.speed : 1;
    return Math.max(45, Math.round(ms / sp));
  }

  function managedTimeout(fn, delayMs) {
    var id = setTimeout(function () {
      var idx = activeTimers.indexOf(id);
      if (idx >= 0) activeTimers.splice(idx, 1);
      fn();
    }, Math.max(0, delayMs));
    activeTimers.push(id);
    return id;
  }

  function clearAutoRollTimer() {
    if (autoRollTimer !== null) {
      clearTimeout(autoRollTimer);
      autoRollTimer = null;
    }
  }

  function clearDuelTimer() {
    if (duelInterval !== null) {
      clearInterval(duelInterval);
      duelInterval = null;
    }
    duelRemainingMs = 0;
    duelPendingCallback = null;
  }

  function showToast(msg) {
    if (!msg) return;
    var box = $('toast-container');
    if (!box) return;
    var pill = document.createElement('div');
    pill.className = 'toast-pill';
    pill.textContent = msg;
    box.appendChild(pill);
    while (box.children.length > 3) {
      box.removeChild(box.firstChild);
    }
    setTimeout(function () {
      if (pill.parentNode) pill.parentNode.removeChild(pill);
    }, 1950);
  }

  function setTicker(msg) {
    var el = $('ui-ticker-text');
    if (el && msg) el.textContent = msg;
  }

  function shakeScreen() {
    var vp = $('app-viewport');
    if (!vp || isPageHidden) return;
    vp.classList.remove('screen-shake');
    void vp.offsetWidth;
    vp.classList.add('screen-shake');
    managedTimeout(function () {
      vp.classList.remove('screen-shake');
    }, 380);
  }

  function shortTileName(name) {
    if (!name) return '';
    return name
      .replace('涿县草鞋铺', '涿县')
      .replace('大营·起点', '起点')
      .replace('铁口算命摊', '算命摊')
      .replace('半仙算命摊', '算命摊')
      .replace('庙口夜市摊', '夜市摊')
      .replace('城隍夜市摊', '夜市摊')
      .replace('风水聚宝盆', '聚宝盆')
      .replace('街头心魔巷', '心魔巷')
      .replace('荒郊心魔林', '心魔林')
      .replace('红尘奇遇亭', '奇遇亭')
      .replace('江湖奇遇渡', '奇遇渡')
      .replace('官渡补习班', '补习班')
      .replace('皇家大赌场', '大赌场')
      .replace('虎牢黑心收费站', '虎牢关')
      .replace('赤壁连环战船', '赤壁船')
      .replace('州牧大官府', '大官府');
  }

  // ==================== Canvas 金币元宝与礼花粒子引擎（按需唤醒，零空转） ====================
  function resizeCanvas() {
    var cvs = $('fx-canvas');
    var vp = $('app-viewport');
    if (!cvs || !vp) return;
    var rect = vp.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      cvs.width = Math.round(rect.width);
      cvs.height = Math.round(rect.height);
    }
  }

  function spawnParticles(kind, count, originXRatio, originYRatio) {
    if (isPageHidden) return;
    var cvs = $('fx-canvas');
    if (!cvs) return;
    if (!cvs.width || !cvs.height) resizeCanvas();
    var ox = cvs.width * (originXRatio != null ? originXRatio : 0.5);
    var oy = cvs.height * (originYRatio != null ? originYRatio : 0.42);
    var total = count || 22;

    for (var i = 0; i < total; i++) {
      var angle = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
      var speed = 2.6 + Math.random() * 5.8;
      particles.push({
        kind: kind || 'coin',
        x: ox + (Math.random() - 0.5) * 36,
        y: oy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1) * 0.85 + (Math.random() - 0.5) * 3,
        vy: -3.2 - Math.random() * 5.5,
        g: 0.24 + Math.random() * 0.08,
        r: 5 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25,
        life: 1.0,
        decay: 0.016 + Math.random() * 0.012,
        color: kind === 'fire'
          ? ['#EF4444', '#F97316', '#FACC15', '#FEF08A'][i % 4]
          : ['#FACC15', '#F59E0B', '#FEF08A', '#FBBF24'][i % 4]
      });
    }
    ensureParticleLoop();
  }

  function ensureParticleLoop() {
    if (rafId !== null || isPageHidden || particles.length === 0) return;
    rafId = requestAnimationFrame(stepParticles);
  }

  function stopParticleLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function stepParticles() {
    rafId = null;
    if (isPageHidden) return;
    var cvs = $('fx-canvas');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.rot += p.vrot;
      p.life -= p.decay;

      if (p.life <= 0 || p.y > cvs.height + 24) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.kind === 'coin') {
        // 绘制金元宝 / 方孔铜钱
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#78350F';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#78350F';
        ctx.fillRect(-p.r * 0.28, -p.r * 0.28, p.r * 0.56, p.r * 0.56);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (particles.length > 0 && !isPageHidden) {
      rafId = requestAnimationFrame(stepParticles);
    } else {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
  }

  // ==================== 银两滚轮跳字动画 ====================
  function updateSilverDisplay(targetVal) {
    var el = $('ui-silver');
    var deltaEl = $('ui-silver-delta');
    var chip = $('chip-silver');
    if (!el) return;

    var target = Math.round(Number(targetVal) || 0);
    if (displayedSilver === null || isPageHidden) {
      displayedSilver = target;
      el.textContent = fmtNum(target);
      return;
    }

    var diff = target - displayedSilver;
    if (diff === 0) {
      el.textContent = fmtNum(target);
      return;
    }

    if (deltaEl) {
      deltaEl.textContent = (diff > 0 ? '+' : '') + fmtNum(diff);
      deltaEl.className = 'res-delta ' + (diff > 0 ? 'show-plus' : 'show-minus');
      managedTimeout(function () {
        deltaEl.className = 'res-delta';
      }, 950);
    }

    if (chip) {
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    }

    if (silverAnimId) {
      cancelAnimationFrame(silverAnimId);
      silverAnimId = null;
    }

    var startVal = displayedSilver;
    var steps = 12;
    var step = 0;

    function tickSilver() {
      silverAnimId = null;
      if (isPageHidden) {
        displayedSilver = target;
        el.textContent = fmtNum(target);
        return;
      }
      step++;
      var ratio = step / steps;
      var eased = 1 - Math.pow(1 - ratio, 3);
      var cur = Math.round(startVal + diff * eased);
      displayedSilver = cur;
      el.textContent = fmtNum(cur);
      if (step < steps) {
        silverAnimId = requestAnimationFrame(tickSilver);
      } else {
        displayedSilver = target;
        el.textContent = fmtNum(target);
      }
    }
    silverAnimId = requestAnimationFrame(tickSilver);
  }

  // ==================== 8×8 方环棋盘构建与实时同步 ====================
  function buildBoardDOM() {
    var grid = $('board-grid');
    if (!grid || !FTX.DATA || !FTX.DATA.TILES) return;

    // 清理旧格子，保留 #center-stage
    var oldTiles = grid.querySelectorAll('.board-tile');
    for (var i = 0; i < oldTiles.length; i++) {
      oldTiles[i].parentNode.removeChild(oldTiles[i]);
    }

    var centerStage = $('center-stage');
    FTX.DATA.TILES.forEach(function (t) {
      var cell = document.createElement('div');
      var isCorner = t.idx === 0 || t.idx === 7 || t.idx === 14 || t.idx === 21;
      cell.className = 'board-tile' +
        (isCorner ? ' tile-corner' : '') +
        (t.terrain ? ' terrain-' + t.terrain : '');
      cell.dataset.idx = String(t.idx);
      cell.style.gridRow = String(t.gridRow);
      cell.style.gridColumn = String(t.gridCol);

      var imgSrc = t.worldImg || FTX.DATA.ASSETS.world.city_lv1;
      cell.innerHTML =
        '<span class="tile-owner-flag hidden" data-role="flag"></span>' +
        '<span class="reach-badge hidden" data-role="reach"></span>' +
        '<div class="tile-model-wrap">' +
          '<img class="tile-model-img" data-role="model" src="' + escHtml(imgSrc) + '" alt="' + escHtml(t.name) + '" onerror="FTX_IMG_FALLBACK(this, \'' + escHtml(shortTileName(t.name)) + '\')" />' +
        '</div>' +
        '<span class="tile-fx-tag" data-role="fx"></span>' +
        '<div class="tile-bldg-badges" data-role="bldgs"></div>' +
        '<div class="tile-footer">' +
          '<span class="tile-name" data-role="name">' + escHtml(shortTileName(t.name)) + '</span>' +
          '<span class="tile-lv" data-role="lv"></span>' +
        '</div>';

      cell.addEventListener('click', function () {
        if (FTX.Audio) FTX.Audio.playUiClick();
        openTilePopover(t.idx);
      });

      grid.insertBefore(cell, centerStage);
    });
  }

  function getCityModelSrc(level, fallback) {
    var W = FTX.DATA.ASSETS.world;
    if (level >= 5) return W.city_lv5;
    if (level >= 3) return W.city_lv3;
    return fallback || W.city_lv1;
  }

  function syncBoardTiles(state) {
    if (!state || !state.board) return;
    var grid = $('board-grid');
    if (!grid) return;

    // 落点预览映射（仅 IDLE 阶段展示前方 2~12 步）
    var reachMap = {};
    if (state.phase === 'IDLE' && FTX.Engine && FTX.Engine.getReachPreview) {
      var list = FTX.Engine.getReachPreview() || [];
      for (var r = 0; r < list.length; r++) {
        reachMap[list[r].tileIdx] = list[r];
      }
    }

    for (var i = 0; i < state.board.length; i++) {
      var b = state.board[i];
      var staticTile = FTX.DATA.TILES[i];
      var el = grid.querySelector('.board-tile[data-idx="' + i + '"]');
      if (!el) continue;

      // 1. 势力归属色边 + 几何旗标双编码
      el.classList.remove('owner-player', 'owner-caocao', 'owner-sunquan', 'tile-lv5', 'is-smoked', 'reach-peak7', 'reach-danger');
      var flagEl = el.querySelector('[data-role="flag"]');
      if (b.owner === 'player') {
        el.classList.add('owner-player');
        if (flagEl) {
          flagEl.className = 'tile-owner-flag player';
          flagEl.textContent = state.player.lordId === 'dongzhuo' ? '●董' : '●汉';
        }
      } else if (b.owner === 'caocao') {
        el.classList.add('owner-caocao');
        if (flagEl) {
          flagEl.className = 'tile-owner-flag caocao';
          flagEl.textContent = '◆魏';
        }
      } else if (b.owner === 'sunquan') {
        el.classList.add('owner-sunquan');
        if (flagEl) {
          flagEl.className = 'tile-owner-flag sunquan';
          flagEl.textContent = '▲吴';
        }
      } else if (flagEl) {
        flagEl.className = 'tile-owner-flag hidden';
      }

      if (b.level >= 5) el.classList.add('tile-lv5');
      if (b.smoked) el.classList.add('is-smoked');

      // 2. 3D 模型图标更新
      var modelEl = el.querySelector('[data-role="model"]');
      var nameEl = el.querySelector('[data-role="name"]');
      var lvEl = el.querySelector('[data-role="lv"]');

      var targetSrc = staticTile.worldImg;
      var shortNm = shortTileName(b.name || staticTile.name);
      if (staticTile.type === 'city') {
        targetSrc = b.cityImg || getCityModelSrc(b.level || 1, staticTile.worldImg);
      } else if (i === 17 && state.specialMode && FTX.DATA.SPECIAL_MODES[state.specialMode]) {
        targetSrc = FTX.DATA.SPECIAL_MODES[state.specialMode].worldImg;
        shortNm = shortTileName(FTX.DATA.SPECIAL_MODES[state.specialMode].tileName);
      }
      if (modelEl && modelEl.getAttribute('src') !== targetSrc) {
        delete modelEl.dataset.fallbackApplied;
        modelEl.setAttribute('src', targetSrc);
      }
      if (nameEl) nameEl.textContent = shortNm;

      // 底部右侧微标：城池显示 Lv1..5 或空地价；聚宝盆显示奖池
      if (lvEl) {
        if (staticTile.type === 'city') {
          lvEl.textContent = b.owner ? ('L' + (b.level || 1)) : ('$' + staticTile.basePrice);
        } else if (staticTile.type === 'pot') {
          lvEl.textContent = fmtNum(state.jackpotPot || 1500);
        } else {
          lvEl.textContent = '';
        }
      }

      // 3. 城防建筑微缩角标（箭塔、屎王神带绿烟、市集等）
      var bldgsBox = el.querySelector('[data-role="bldgs"]');
      if (bldgsBox) {
        var bList = b.buildings || [];
        if (bList.length === 0) {
          bldgsBox.innerHTML = '';
        } else {
          var bHtml = '';
          for (var k = 0; k < Math.min(2, bList.length); k++) {
            var bid = bList[k];
            var bCfg = FTX.DATA.BUILDINGS[bid];
            if (!bCfg) continue;
            if (bid === 'poop_god') {
              bHtml += '<span class="poop-god-wrap"><img class="tile-bldg-icon" src="' + escHtml(bCfg.worldImg) + '" alt="屎王神" onerror="FTX_IMG_FALLBACK(this, \'屎神\')" /></span>';
            } else {
              bHtml += '<img class="tile-bldg-icon" src="' + escHtml(bCfg.worldImg) + '" alt="' + escHtml(bCfg.name) + '" onerror="FTX_IMG_FALLBACK(this, \'楼\')" />';
            }
          }
          bldgsBox.innerHTML = bHtml;
        }
      }

      // 4. 异变与状态角标（溃散白旗、乡民红包、五折夜市、路障乌龟、精英心魔）
      var fxEl = el.querySelector('[data-role="fx"]');
      if (fxEl) {
        var tags = '';
        if (b.brokenLoops > 0) tags += '🏳️';
        if (b.turtleBlock) tags += '🐢';
        if (b.bonusRedPacket > 0) tags += '🧧';
        if (b.halfPriceLoops > 0) tags += '🏷️';
        if (b.eliteDemon) tags += '👹';
        fxEl.textContent = tags;
      }

      // 5. 前方 2~12 步落点预览角标
      var reachEl = el.querySelector('[data-role="reach"]');
      var rInfo = reachMap[i];
      if (reachEl) {
        if (rInfo) {
          var rCls = 'reach-badge';
          if (rInfo.isPeak7 || rInfo.steps === 7) {
            rCls += ' peak7';
            el.classList.add('reach-peak7');
          }
          if (rInfo.dangerLevel === 'danger') {
            rCls += ' danger';
            el.classList.add('reach-danger');
          }
          reachEl.className = rCls;
          reachEl.textContent = String(rInfo.steps);
        } else {
          reachEl.className = 'reach-badge hidden';
        }
      }
    }
  }

  // ==================== 棋盘立牌棋子精确定位与逐格弹跳动画 ====================
  function getTileCenterInSandbox(tileIdx) {
    var sandbox = $('board-sandbox');
    var grid = $('board-grid');
    if (!sandbox || !grid) return { x: 40, y: 40 };
    var tileEl = grid.querySelector('.board-tile[data-idx="' + tileIdx + '"]');
    if (!tileEl) return { x: 40, y: 40 };
    var sRect = sandbox.getBoundingClientRect();
    var tRect = tileEl.getBoundingClientRect();
    return {
      x: tRect.left - sRect.left + tRect.width * 0.5,
      y: tRect.top - sRect.top + tRect.height * 0.62
    };
  }

  function placePieceAt(pieceEl, tileIdx, offsetX, offsetY, hop) {
    if (!pieceEl) return;
    var pt = getTileCenterInSandbox(tileIdx);
    pieceEl.style.left = (pt.x + (offsetX || 0)) + 'px';
    pieceEl.style.top = (pt.y + (offsetY || 0)) + 'px';
    if (hop && !isPageHidden) {
      pieceEl.classList.remove('hopping');
      void pieceEl.offsetWidth;
      pieceEl.classList.add('hopping');
    }
  }

  function syncPiecesPositions(state) {
    if (!state) return;
    var pPlayer = $('piece-player');
    var pPlayerImg = $('piece-player-img');
    var pPlayerFlag = $('piece-player-flag');
    var lordCfg = FTX.DATA.LORDS[state.player.lordId] || FTX.DATA.LORDS.liubei;

    if (pPlayerImg && pPlayerImg.getAttribute('src') !== lordCfg.pieceImg) {
      delete pPlayerImg.dataset.fallbackApplied;
      pPlayerImg.setAttribute('src', lordCfg.pieceImg);
    }
    if (pPlayerFlag) {
      pPlayerFlag.textContent = '●' + lordCfg.name;
    }

    // 统计同格棋子错位排布
    var occCount = {};
    function nextSlotOffset(pos) {
      var c = occCount[pos] || 0;
      occCount[pos] = c + 1;
      var offsets = [
        { dx: 0, dy: 0 },
        { dx: -9, dy: -5 },
        { dx: 9, dy: -5 },
        { dx: 0, dy: -10 }
      ];
      return offsets[c % offsets.length];
    }

    var offP = nextSlotOffset(state.player.pos);
    placePieceAt(pPlayer, state.player.pos, offP.dx, offP.dy, false);

    // 曹操与孙权车驾
    var hegMap = [
      { id: 'caocao', elId: 'piece-caocao', stId: 'piece-caocao-status' },
      { id: 'sunquan', elId: 'piece-sunquan', stId: 'piece-sunquan-status' }
    ];
    for (var h = 0; h < hegMap.length; h++) {
      var item = hegMap[h];
      var hState = state.hegemons && state.hegemons[item.id];
      var hEl = $(item.elId);
      var stEl = $(item.stId);
      if (!hEl || !hState) continue;
      if (hState.bankrupt) {
        hEl.classList.add('hidden');
      } else {
        hEl.classList.remove('hidden');
        var offH = nextSlotOffset(hState.pos);
        placePieceAt(hEl, hState.pos, offH.dx, offH.dy, false);
        if (stEl) {
          if (hState.paralyzedTicks > 0) {
            stEl.textContent = '💤' + hState.paralyzedTicks;
            stEl.classList.remove('hidden');
          } else {
            stEl.classList.add('hidden');
          }
        }
      }
    }

    // 讨债队恶霸棋子（第 11 圈起逆时针拦截）
    var debtBox = $('pieces-debt-container');
    if (debtBox) {
      var debts = state.debtTeams || [];
      debtBox.innerHTML = '';
      for (var d = 0; d < debts.length; d++) {
        var dt = debts[d];
        if (dt.active === false) continue;
        var dDiv = document.createElement('div');
        dDiv.className = 'board-piece piece-debt';
        dDiv.innerHTML =
          '<img src="' + escHtml(FTX.DATA.ASSETS.world.icon_debt_team) + '" alt="讨债队" onerror="FTX_IMG_FALLBACK(this, \'讨债\')" />' +
          '<span class="piece-flag debt">讨债</span>';
        debtBox.appendChild(dDiv);
        var offD = nextSlotOffset(dt.pos);
        placePieceAt(dDiv, dt.pos, offD.dx, offD.dy, false);
      }
    }
  }

  function animatePlayerPath(pathArr, doneCb) {
    if (!pathArr || pathArr.length === 0 || isPageHidden) {
      if (doneCb) doneCb();
      return;
    }
    var pPlayer = $('piece-player');
    var grid = $('board-grid');
    var idx = 0;
    var stepInterval = speedDiv(95);

    function nextHop() {
      if (idx >= pathArr.length) {
        var prevActive = grid ? grid.querySelectorAll('.tile-active-step') : [];
        for (var j = 0; j < prevActive.length; j++) prevActive[j].classList.remove('tile-active-step');
        if (doneCb) doneCb();
        return;
      }
      var tileIdx = pathArr[idx];
      if (FTX.Audio) FTX.Audio.playStep(idx);
      placePieceAt(pPlayer, tileIdx, 0, 0, true);

      if (grid) {
        var prev = grid.querySelectorAll('.tile-active-step');
        for (var k = 0; k < prev.length; k++) prev[k].classList.remove('tile-active-step');
        var curTile = grid.querySelector('.board-tile[data-idx="' + tileIdx + '"]');
        if (curTile) curTile.classList.add('tile-active-step');
      }

      idx++;
      managedTimeout(nextHop, stepInterval);
    }

    nextHop();
  }

  // ==================== 顶栏、手牌舱与拇指热区 HUD 全量同步 ====================
  function syncHUD(state) {
    if (!state) return;

    // 1. 圈数与宿敌倒计时
    var loopEl = $('ui-loop-text');
    var examEl = $('ui-exam-tag');
    if (loopEl) loopEl.textContent = '第 ' + state.loop + '/' + state.maxLoops + ' 圈';
    if (examEl) {
      var nextExam = state.loop < 5 && state.maxLoops >= 8 ? 5 : (state.loop < 10 && state.maxLoops >= 15 ? 10 : null);
      if (nextExam) {
        examEl.textContent = '距宿敌 ' + (nextExam - state.loop) + ' 圈';
      } else {
        examEl.textContent = '距决战 ' + Math.max(0, state.maxLoops - state.loop + 1) + ' 圈';
      }
    }

    // 2. 霸主手笔明牌预警胶囊
    var alertTxt = $('ui-hegemon-alert-text');
    if (alertTxt) {
      var cMove = state.hegemons && state.hegemons.caocao && !state.hegemons.caocao.bankrupt ? state.hegemons.caocao.nextMoveCard : null;
      var sMove = state.hegemons && state.hegemons.sunquan && !state.hegemons.sunquan.bankrupt ? state.hegemons.sunquan.nextMoveCard : null;
      var activeMove = cMove || sMove;
      if (activeMove) {
        var ownerNm = activeMove.owner === 'sunquan' ? '孙权' : '曹操';
        alertTxt.textContent = '⚠️ ' + ownerNm + '下圈手笔：《' + activeMove.name + '》[点看反制]';
      } else {
        var stageLabel = state.loop <= 5 ? '圈地期' : (state.loop <= 10 ? '筑防期' : '围剿期');
        alertTxt.textContent = '霸主动态：' + stageLabel + '（点看金库详情）';
      }
    }

    // 3. 第三幕（或全程后半局）火力 vs 魔王气血对比条
    var bossWrap = $('ui-boss-bar-wrap');
    if (bossWrap && state.bossPreview) {
      var showBossBar = state.loop >= Math.max(4, state.maxLoops - 5) || state.phase === 'BOSS_FINALE';
      bossWrap.classList.toggle('hidden', !showBossBar);
      var fireVal = Math.round(state.bossPreview.estFirepower || state.player.estFirepower || 0);
      var hpVal = Math.round(state.bossPreview.estHp || 10000);
      if ($('ui-fire-val')) $('ui-fire-val').textContent = fmtNum(fireVal);
      if ($('ui-bosshp-val')) $('ui-bosshp-val').textContent = fmtNum(hpVal);
      if ($('ui-fire-fill')) {
        var pct = Math.max(5, Math.min(100, Math.round((fireVal / Math.max(1, hpVal)) * 100)));
        $('ui-fire-fill').style.width = pct + '%';
      }
    }

    // 4. 倍速与音效按钮
    if ($('btn-speed')) $('btn-speed').textContent = (state.speed || 1) + 'x';
    if ($('btn-audio') && FTX.Audio) {
      $('btn-audio').textContent = FTX.Audio.isMuted() ? '🔇' : '🔊';
    }

    // 5. 核心资源数字（银两、兵力、气运签、正邪名望）
    updateSilverDisplay(state.player.silver);
    if ($('ui-troops')) $('ui-troops').textContent = fmtNum(state.player.troops);
    if ($('ui-sticks')) {
      var maxSt = state.player.maxLuckSticks || 3;
      $('ui-sticks').textContent = state.player.luckSticks + '/' + maxSt;
    }
    var fameBadge = $('ui-fame-badge');
    if (fameBadge) {
      var fm = state.player.stats ? state.player.stats.fame : 0;
      if (fm >= 30) {
        fameBadge.className = 'fame-badge righteous';
        fameBadge.textContent = '正道 +' + fm;
      } else if (fm <= -30) {
        fameBadge.className = 'fame-badge evil';
        fameBadge.textContent = '邪道 ' + fm;
      } else {
        fameBadge.className = 'fame-badge neutral';
        fameBadge.textContent = '名望 ' + (fm > 0 ? '+' + fm : fm);
      }
    }

    // 6. 中央舞台霸主小报与聚宝盆底池
    if ($('ui-pot-amount')) $('ui-pot-amount').textContent = fmtNum(state.jackpotPot || 1500);
    syncRivalMiniStrip(state);

    // 7. 构筑与手牌舱：先锋切换头像 + 四件装备槽 + 政见计数 + 锦囊/奇策双轨手牌
    var vgCfg = FTX.DATA.VANGUARDS[state.player.vanguardId] || FTX.DATA.VANGUARDS.zhangfei;
    var vgImg = $('ui-vanguard-img');
    if (vgImg && vgImg.getAttribute('src') !== vgCfg.horseImg) {
      delete vgImg.dataset.fallbackApplied;
      vgImg.setAttribute('src', vgCfg.horseImg);
    }
    if ($('ui-vanguard-name')) {
      $('ui-vanguard-name').innerHTML = escHtml(vgCfg.name) + ' <small>🔄换将</small>';
    }
    var eqBonus = calcPlayerEquipBonus(state);
    if ($('ui-vanguard-power')) {
      $('ui-vanguard-power').textContent = '武斗 ' + (vgCfg.duel + eqBonus);
    }
    if ($('ui-policy-count')) {
      $('ui-policy-count').textContent = String((state.player.policies || []).length);
    }

    renderEquipSlots(state);
    renderHandCards(state);

    // 8. 底部拇指区：加注档位、气运签改命救急钮、ROLL 键状态
    var bet = state.betMultiplier || 1;
    var betBtns = document.querySelectorAll('.bet-btn');
    for (var b = 0; b < betBtns.length; b++) {
      var bVal = Number(betBtns[b].dataset.bet);
      betBtns[b].classList.toggle('active', bVal === bet);
    }
    var betBox = $('ui-bet-box');
    if (betBox) betBox.classList.toggle('bet-flame-max', bet >= 3);

    var rollBtn = $('btn-roll');
    if (rollBtn) {
      if (finaleCheerMode) {
        rollBtn.disabled = false;
        rollBtn.classList.add('cheer-mode');
        if ($('ui-roll-title')) $('ui-roll-title').textContent = '🥁 擂鼓助威！(' + finaleCheerHits + '/5)';
        if ($('ui-roll-sub')) $('ui-roll-sub').textContent = '狂点为先锋冲阵加伤 +20%！';
      } else {
        rollBtn.classList.remove('cheer-mode');
        rollBtn.disabled = isBusy || state.phase !== 'IDLE';
        if ($('ui-roll-title')) {
          $('ui-roll-title').textContent = state.extraRollPending ? '🎊 免费再掷 · 十八啦！' : '掷骰 十八啦！';
        }
        if ($('ui-roll-sub')) {
          $('ui-roll-sub').textContent = state.extraRollPending
            ? '好事成双！本把对子赠送免费再掷一次！'
            : (bet > 1
              ? ('🔥 当前加注 ×' + bet + ' · 收支同乘' + bet + '倍')
              : '单手一击 · 霸主同步落子');
        }
      }
    }

    var autoBtn = $('btn-auto-roll');
    if (autoBtn) {
      autoBtn.classList.toggle('active', autoRollEnabled);
      if ($('ui-auto-txt')) $('ui-auto-txt').textContent = autoRollEnabled ? '连掷中…' : '自动连掷';
    }
  }

  function syncRivalMiniStrip(state) {
    var cityCount = { caocao: 0, sunquan: 0 };
    (state.board || []).forEach(function (t) {
      if (t.owner === 'caocao') cityCount.caocao++;
      if (t.owner === 'sunquan') cityCount.sunquan++;
    });

    var cc = state.hegemons && state.hegemons.caocao;
    var sq = state.hegemons && state.hegemons.sunquan;
    if (cc && $('ui-caocao-vault')) {
      $('mini-hegemon-caocao').classList.toggle('is-bankrupt', Boolean(cc.bankrupt));
      $('ui-caocao-vault').textContent = cc.bankrupt
        ? '裤衩破产退场！'
        : ('¥' + fmtNum(cc.vault) + ' · ' + cityCount.caocao + '城');
    }
    if (sq && $('ui-sunquan-vault')) {
      $('mini-hegemon-sunquan').classList.toggle('is-bankrupt', Boolean(sq.bankrupt));
      $('ui-sunquan-vault').textContent = sq.bankrupt
        ? '裤衩破产退场！'
        : ('¥' + fmtNum(sq.vault) + ' · ' + cityCount.sunquan + '城');
    }
  }

  function calcPlayerEquipBonus(state) {
    var eq = (state && state.player && state.player.equipment) || {};
    var sum = 0;
    ['weapon', 'helm', 'armor', 'mount'].forEach(function (slot) {
      var item = eq[slot];
      if (!item) return;
      var cfg = typeof item === 'string' ? FTX.DATA.EQUIPMENTS[item] : (FTX.DATA.EQUIPMENTS[item.id] || item);
      if (cfg && cfg.bonus) sum += cfg.bonus;
    });
    return sum;
  }

  function rarityTierClass(rarityCode) {
    var map = { N: 'tier-1', R: 'tier-2', SR: 'tier-3', SSR: 'tier-4', UR: 'tier-5' };
    return map[rarityCode] || 'tier-1';
  }

  function renderEquipSlots(state) {
    var box = $('ui-equip-slots');
    if (!box) return;
    var eq = (state.player && state.player.equipment) || {};
    var defs = [
      { key: 'weapon', icon: '🗡️', emptyTxt: '兵器' },
      { key: 'helm', icon: '🪖', emptyTxt: '头冠' },
      { key: 'armor', icon: '🥋', emptyTxt: '衣甲' },
      { key: 'mount', icon: '🐴', emptyTxt: '木马' }
    ];

    box.innerHTML = '';
    defs.forEach(function (d) {
      var raw = eq[d.key];
      var cfg = raw ? (typeof raw === 'string' ? FTX.DATA.EQUIPMENTS[raw] : (FTX.DATA.EQUIPMENTS[raw.id] || raw)) : null;
      var slotDiv = document.createElement('div');
      if (cfg) {
        slotDiv.className = 'equip-slot ' + rarityTierClass(cfg.rarity);
        slotDiv.innerHTML =
          '<span class="slot-icon">' + d.icon + '</span>' +
          '<span class="slot-name">' + escHtml(cfg.name.slice(0, 4)) + '+' + cfg.bonus + '</span>';
        slotDiv.addEventListener('click', function () {
          if (FTX.Audio) FTX.Audio.playUiClick();
          showToast(cfg.name + '（+' + cfg.bonus + '）：' + (cfg.perk || cfg.note || ''));
        });
      } else {
        slotDiv.className = 'equip-slot empty';
        slotDiv.innerHTML =
          '<span class="slot-icon">' + d.icon + '</span>' +
          '<span class="slot-name">' + d.emptyTxt + '</span>';
      }
      box.appendChild(slotDiv);
    });
  }

  function renderHandCards(state) {
    var bContainer = $('ui-board-cards');
    var cContainer = $('ui-combat-cards');
    if (!bContainer || !cContainer) return;

    var bCards = (state.player && state.player.boardCards) || [];
    bContainer.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var bc = bCards[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      if (bc) {
        var cfg = FTX.DATA.BOARD_CARDS[bc.cardId || bc.id] || bc;
        btn.className = 'hand-card';
        btn.dataset.instanceId = bc.instanceId || bc.id;
        btn.innerHTML =
          '<span class="hc-name">' + escHtml((cfg.name || '').replace(/[《》]/g, '')) + '</span>' +
          '<span class="hc-hint">' + (cfg.needParam === 'steps' ? '遥控1~6步' : '点此施放') + '</span>';
        (function (cardObj, cardCfg) {
          btn.addEventListener('click', function () {
            onClickBoardCard(cardObj, cardCfg);
          });
        })(bc, cfg);
      } else {
        btn.className = 'hand-card empty';
        btn.disabled = true;
        btn.textContent = '空锦囊';
      }
      bContainer.appendChild(btn);
    }

    var cCards = (state.player && state.player.combatCards) || [];
    var inDuelWindow = !$('duel-tactic-window').classList.contains('hidden');
    cContainer.innerHTML = '';
    for (var j = 0; j < 2; j++) {
      var cc = cCards[j];
      var cBtn = document.createElement('button');
      cBtn.type = 'button';
      if (cc) {
        var cCfg = FTX.DATA.COMBAT_CARDS[cc.cardId || cc.id] || cc;
        cBtn.className = 'hand-card combat' + (inDuelWindow ? ' ready-glow' : '');
        cBtn.dataset.instanceId = cc.instanceId || cc.id;
        cBtn.innerHTML =
          '<span class="hc-name">' + escHtml((cCfg.name || '').replace(/[《》]/g, '')) + '</span>' +
          '<span class="hc-hint">' + (inDuelWindow ? '⚡立即拍出' : '单挑/决战用') + '</span>';
        (function (cardObj, cardCfg) {
          cBtn.addEventListener('click', function () {
            if (duelPendingCallback) {
              triggerDuelCardChoice(cardObj.instanceId || cardObj.id);
            } else {
              if (FTX.Audio) FTX.Audio.playUiClick();
              showToast(cardCfg.name + '：' + cardCfg.desc + '（骑木马单挑或决战时拍出！）');
            }
          });
        })(cc, cCfg);
      } else {
        cBtn.className = 'hand-card combat empty';
        cBtn.disabled = true;
        cBtn.textContent = '空奇策';
      }
      cContainer.appendChild(cBtn);
    }
  }

  // ==================== 中央舞台面板切换 ====================
  function setStageMode(mode) {
    var stage = $('center-stage');
    if (stage) stage.dataset.mode = mode;
    var map = {
      idle: 'stage-panel-idle',
      duel: 'stage-panel-duel',
      show: 'stage-panel-show',
      finale: 'stage-panel-finale'
    };
    Object.keys(map).forEach(function (k) {
      var p = $(map[k]);
      if (p) p.classList.toggle('active', k === mode);
    });
  }

  function playStageMiniShow(opts, durationMs, cb) {
    setStageMode('show');
    if ($('show-title-badge')) $('show-title-badge').textContent = opts.badge || '盘面事件';
    var mainImg = $('show-main-img');
    var subImg = $('show-sub-img');
    if (mainImg && opts.mainImg) {
      delete mainImg.dataset.fallbackApplied;
      mainImg.setAttribute('src', opts.mainImg);
    }
    if (subImg) {
      if (opts.subImg) {
        delete subImg.dataset.fallbackApplied;
        subImg.setAttribute('src', opts.subImg);
        subImg.classList.remove('hidden');
      } else {
        subImg.classList.add('hidden');
      }
    }
    if ($('show-caption-text')) $('show-caption-text').textContent = opts.caption || '';

    managedTimeout(function () {
      setStageMode('idle');
      if (cb) cb();
    }, speedDiv(durationMs || 950));
  }

  // ==================== 核心动作 1：掷骰与霸主同步落子 ====================
  function handleRollClick() {
    if (FTX.Audio) FTX.Audio.unlock();

    // 决战第三段擂鼓助威模式
    if (finaleCheerMode) {
      if (finaleCheerHits < 5) {
        finaleCheerHits++;
        if (FTX.Audio) FTX.Audio.playGong(false);
        spawnParticles('coin', 10, 0.5, 0.45);
        syncHUD(FTX.Engine.getState());
      }
      return;
    }

    var state = FTX.Engine.getState();
    if (!state || state.phase !== 'IDLE' || isBusy) return;

    clearAutoRollTimer();
    closeTilePopover();
    $('sheet-card-use').classList.add('hidden');

    var res = FTX.Engine.rollDice();
    if (!res || !res.ok) {
      if (res && res.message) showToast(res.message);
      return;
    }

    playRollSequence(res);
  }

  function playRollSequence(res) {
    isBusy = true;
    setStageMode('idle');
    syncHUD(FTX.Engine.getState());

    var die1 = $('die-1');
    var die2 = $('die-2');
    var banner = $('ui-dice-banner');
    var sumTag = $('ui-bowl-sum');

    if (banner) banner.classList.add('hidden');
    if (FTX.Audio) FTX.Audio.playDiceRoll();

    if (die1 && die2) {
      die2.classList.remove('hidden');
      die1.classList.add('rolling');
      die2.classList.add('rolling');
    }
    if (sumTag) sumTag.textContent = '十八啦摇碗中…';

    var rollAnimMs = speedDiv(420);
    managedTimeout(function () {
      if (die1 && die2) {
        die1.classList.remove('rolling');
        die2.classList.remove('rolling');
        die1.dataset.face = String(res.dice[0] || 1);
        if (res.dice[1] === 0) {
          die2.classList.add('hidden');
        } else {
          die2.classList.remove('hidden');
          die2.dataset.face = String(res.dice[1]);
        }
      }

      var pairTxt = '';
      if (res.pairType === 'shibala') {
        pairTxt = '🎉 十八啦——豹子通杀！';
        if (FTX.Audio) FTX.Audio.playGong(true);
        spawnParticles('coin', 32, 0.5, 0.36);
        shakeScreen();
      } else if (res.pairType === 'snake') {
        pairTxt = '🎋 衰尾对！补气运签+再掷！';
        if (FTX.Audio) FTX.Audio.playGong(false);
      } else if (res.pairType === 'happy') {
        pairTxt = '🎊 欢喜对！敲锣免费再掷！';
        if (FTX.Audio) FTX.Audio.playGong(false);
        spawnParticles('coin', 16, 0.5, 0.38);
      }

      if (banner && pairTxt) {
        banner.textContent = pairTxt;
        banner.classList.remove('hidden');
      }
      if (sumTag) {
        sumTag.textContent = res.dice[1] === 0
          ? ('遥控精准走 ' + res.sum + ' 步！')
          : (res.dice[0] + ' + ' + res.dice[1] + ' = ' + res.sum + ' 点！');
      }

      // 主公逐格跳跃 + 同刻霸主车驾同步落子！
      var latestState = FTX.Engine.getState();
      animatePlayerPath(res.path || [], function () {
        syncBoardTiles(latestState);
        syncPiecesPositions(latestState);
        syncHUD(latestState);

        // 播报霸主同步落子趣事（如踩玩家城交租、挨箭塔瘫痪、或破产穿花裤衩跑路！）
        var bankruptHeg = findBankruptEvent(res.hegemonActions || res.events || []);
        if (res.hegemonActions && res.hegemonActions.length > 0) {
          var firstNote = res.hegemonActions[0].summary || res.hegemonActions[0].message || res.hegemonActions[0].quote;
          if (firstNote) setTicker(firstNote);
          // 若霸主踩我方城交了过路费，爆金币音效
          for (var i = 0; i < res.hegemonActions.length; i++) {
            var ha = res.hegemonActions[i];
            if (ha.silverToPlayer > 0 || ha.type === 'pay_player_toll' || ha.type === 'trouble_lose') {
              if (FTX.Audio) FTX.Audio.playCoin(true);
              spawnParticles('coin', 18, 0.5, 0.25);
              break;
            }
          }
        }

        if (bankruptHeg) {
          if (FTX.Audio) FTX.Audio.playGong(true);
          playStageMiniShow({
            badge: '🩲 霸主破产跑路！',
            mainImg: FTX.DATA.ASSETS.chars.bankrupt_pants,
            caption: bankruptHeg
          }, 1150, function () {
            finishRollStep(res);
          });
        } else {
          finishRollStep(res);
        }
      });
    }, rollAnimMs);
  }

  function findBankruptEvent(list) {
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it) continue;
      if (it.bankrupt || it.type === 'hegemon_bankrupt' || (it.summary && it.summary.indexOf('破产') >= 0)) {
        return it.quote || it.summary || '霸主赔光家产，穿碎花大裤衩紧酸跑路啦！';
      }
    }
    return null;
  }

  function finishRollStep(res) {
    isBusy = false;
    var st = FTX.Engine.getState();
    syncRerollButtons(Boolean(res && res.canReroll) && st.player.luckSticks > 0);
    routeByEnginePhase();
  }

  function syncRerollButtons(canShow) {
    var st = FTX.Engine.getState();
    var sticks = st && st.player ? st.player.luckSticks : 0;
    var visible = Boolean(canShow && sticks > 0);
    var thumbBtn = $('btn-luck-reroll');
    var sheetBtn = $('btn-sheet-reroll');
    if (thumbBtn) {
      thumbBtn.classList.toggle('hidden', !visible);
      if ($('ui-reroll-text')) $('ui-reroll-text').textContent = '气运签改命重摇！(剩' + sticks + '支)';
    }
    if (sheetBtn) {
      sheetBtn.classList.toggle('hidden', !visible);
      sheetBtn.textContent = '🎋 耗1签改命重摇(' + sticks + ')';
    }
  }

  function handleRerollClick() {
    if (isBusy || !FTX.Engine || !FTX.Engine.rerollLastDice) return;
    var st = FTX.Engine.getState();
    if (!st || st.player.luckSticks <= 0) return;

    $('sheet-landing').classList.add('hidden');
    syncRerollButtons(false);
    if (FTX.Audio) FTX.Audio.playGong(false);
    showToast(FTX.DATA.QUOTES.rerollUsed);

    var res = FTX.Engine.rerollLastDice();
    if (!res || !res.ok) {
      if (res && res.message) showToast(res.message);
      routeByEnginePhase();
      return;
    }
    playRollSequence(res);
  }

  // ==================== 核心枢纽：根据 Engine Phase 路由全链路面板 ====================
  function routeByEnginePhase() {
    var st = FTX.Engine.getState();
    if (!st) return;

    syncBoardTiles(st);
    syncPiecesPositions(st);
    syncHUD(st);

    // 先收起所有非常驻面板
    $('sheet-landing').classList.add('hidden');
    $('sheet-equip').classList.add('hidden');
    $('modal-estate').classList.remove('active');
    $('modal-estate').classList.add('hidden');
    $('modal-policy').classList.remove('active');
    $('modal-policy').classList.add('hidden');
    $('modal-rival').classList.remove('active');
    $('modal-rival').classList.add('hidden');

    if (st.phase === 'LANDING') {
      openLandingSheet();
    } else if (st.phase === 'EQUIP_PROMPT' || (st.phase === 'IDLE' && (st.pendingEquip || (st.player && st.player.pendingEquip)))) {
      openEquipCompareSheet(st);
    } else if (st.phase === 'LOOP_ESTATE') {
      openEstateModal(st);
    } else if (st.phase === 'LOOP_POLICY') {
      openPolicyModal(st);
    } else if (st.phase === 'RIVAL_EXAM') {
      openRivalExamModal(st);
    } else if (st.phase === 'BOSS_FINALE') {
      startBossFinaleSequence(st);
    } else if (st.phase === 'GAME_OVER') {
      openGameOverModal(st, lastFinaleReport);
    } else {
      // IDLE 待机态
      syncRerollButtons(false);
      setStageMode('idle');
      syncHUD(st);
      scheduleAutoRollIfNeeded();
    }
  }

  // ==================== 核心动作 2：落点面板 & 踩城四择 ====================
  function openLandingSheet() {
    var opts = FTX.Engine.getLandingOptions ? FTX.Engine.getLandingOptions() : null;
    var st = FTX.Engine.getState();
    if (!opts) {
      // 某些落点已在 rollDice 中直接自动结清
      routeByEnginePhase();
      return;
    }

    var sheet = $('sheet-landing');
    var titleEl = $('landing-tile-title');
    var fourBox = $('landing-four-choice');
    var genBox = $('landing-general-box');

    if (titleEl) titleEl.textContent = opts.title || (opts.tileIdx + '号格');
    syncRerollButtons(Boolean(opts.canReroll) && st.player.luckSticks > 0);

    var isEnemyFourChoice = opts.tileType === 'enemy_city' ||
      (opts.actions && opts.actions.length === 4 && opts.actions[0].key === 'pay_toll');

    if (isEnemyFourChoice) {
      fourBox.classList.remove('hidden');
      genBox.classList.add('hidden');
      renderEnemyFourChoice(opts, st);
    } else {
      fourBox.classList.add('hidden');
      genBox.classList.remove('hidden');
      renderGeneralLanding(opts, st);
    }

    sheet.classList.remove('hidden');

    // 自动连掷智能代操（仅普通非致命格自动点首推项；敌城若胜算高可自动单挑或交钱）
    if (autoRollEnabled && !isPageHidden) {
      managedTimeout(function () {
        if (!autoRollEnabled || isPageHidden || st.phase !== 'LANDING') return;
        autoPickLandingOption(opts, isEnemyFourChoice);
      }, speedDiv(620));
    }
  }

  function renderEnemyFourChoice(opts, st) {
    var lordCfg = FTX.DATA.LORDS[st.player.lordId] || FTX.DATA.LORDS.liubei;
    var moodImg = $('landing-mood-img');
    var imgSrc = opts.mood === 'happy' ? lordCfg.happyImg : lordCfg.cryImg;
    if (moodImg) {
      delete moodImg.dataset.fallbackApplied;
      moodImg.setAttribute('src', imgSrc);
    }

    if ($('landing-toll-num')) {
      $('landing-toll-num').textContent = '-' + fmtNum(opts.tollAmount || 0);
    }
    if ($('landing-sub-quote')) {
      $('landing-sub-quote').textContent = opts.subtitle || lordCfg.quotes.payToll[0];
    }

    var grid = $('landing-four-buttons');
    grid.innerHTML = '';

    var actions = opts.actions || [];
    actions.forEach(function (act, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';

      var colorCls = 'c-pay';
      var sendKey = act.key;
      var mainLabel = act.label;

      if (idx === 0) {
        if (act.fameRewrite === 'bounced_check') {
          colorCls = 'c-bounced';
          sendKey = 'bounced_check';
          mainLabel = '💜 开芭乐票（邪道免付！）';
        } else {
          colorCls = 'c-pay';
        }
      } else if (idx === 1) {
        colorCls = 'c-duel';
      } else if (idx === 2) {
        colorCls = 'c-field';
      } else if (idx === 3) {
        colorCls = act.fameRewrite === 'persuade' ? 'c-persuade' : 'c-siege';
      }

      btn.className = 'choice-gem-btn ' + colorCls;
      btn.dataset.actionKey = sendKey;
      btn.disabled = Boolean(act.disabled);

      var pct = act.winRatePct != null
        ? Math.round(act.winRatePct)
        : (act.winRate != null ? Math.round(act.winRate * 100) : null);

      var rateHtml = '';
      if (pct != null && idx > 0) {
        var rTier = pct >= 65 ? 'high' : (pct >= 40 ? 'mid' : 'low');
        rateHtml = '<span class="cg-rate-pill ' + rTier + '">胜算 ' + pct + '%</span>';
      } else if (idx === 0) {
        rateHtml = '<span class="cg-rate-pill">' + (sendKey === 'bounced_check' ? '0 两' : ('-' + fmtNum(opts.tollAmount || 0))) + '</span>';
      }

      var subTxt = act.disabled && act.disabledReason ? act.disabledReason : (act.sublabel || '');
      btn.innerHTML =
        '<div class="cg-left">' +
          '<span class="cg-title">' + (idx + 1) + '. ' + escHtml(mainLabel) + '</span>' +
          '<span class="cg-sub">' + escHtml(subTxt) + '</span>' +
        '</div>' +
        rateHtml;

      btn.addEventListener('click', function () {
        onSelectLandingAction(sendKey, act);
      });
      grid.appendChild(btn);
    });
  }

  function mapColorTagToClass(tag, idx) {
    var map = {
      gold: 'c-pay',
      amber: 'c-pay',
      green: 'c-field',
      blue: 'c-siege',
      red: 'c-duel',
      purple: 'c-bounced',
      gray: 'c-gray',
      'c-pay': 'c-pay',
      'c-duel': 'c-duel',
      'c-field': 'c-field',
      'c-siege': 'c-siege',
      'c-bounced': 'c-bounced',
      'c-persuade': 'c-persuade'
    };
    var palette = ['c-pay', 'c-field', 'c-siege', 'c-duel'];
    return map[tag] || palette[idx % palette.length];
  }

  function renderGeneralLanding(opts, st) {
    var lordCfg = FTX.DATA.LORDS[st.player.lordId] || FTX.DATA.LORDS.liubei;
    var genImg = $('gen-landing-img');
    var tileStatic = FTX.DATA.TILES[opts.tileIdx] || {};
    var iconSrc = opts.iconImg ||
      (opts.mood === 'cry' ? lordCfg.cryImg : (tileStatic.worldImg || lordCfg.happyImg));
    if (genImg) {
      delete genImg.dataset.fallbackApplied;
      genImg.setAttribute('src', iconSrc);
    }

    if ($('gen-landing-headline')) $('gen-landing-headline').textContent = opts.title || tileStatic.name || '棋盘奇遇';
    if ($('gen-landing-desc')) $('gen-landing-desc').textContent = opts.subtitle || tileStatic.desc || '';

    var list = $('gen-landing-actions');
    list.innerHTML = '';
    (opts.actions || []).forEach(function (act, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-gem-btn ' + mapColorTagToClass(act.colorTag, idx);
      btn.dataset.actionKey = act.key;
      btn.disabled = Boolean(act.disabled);

      var pct = act.winRatePct != null
        ? Math.round(act.winRatePct)
        : (act.winRate != null ? Math.round(act.winRate * 100) : null);

      var rightBadge = pct != null
        ? '<span class="cg-rate-pill">胜算 ' + pct + '%</span>'
        : (act.costText ? '<span class="cg-rate-pill">' + escHtml(act.costText) + '</span>' : '');

      btn.innerHTML =
        '<div class="cg-left">' +
          '<span class="cg-title">' + escHtml(act.label) + '</span>' +
          '<span class="cg-sub">' + escHtml(act.disabled ? (act.disabledReason || '条件不足') : (act.sublabel || '')) + '</span>' +
        '</div>' +
        rightBadge;

      btn.addEventListener('click', function () {
        onSelectLandingAction(act.key, act);
      });
      list.appendChild(btn);
    });
  }

  function autoPickLandingOption(opts, isEnemy) {
    var acts = (opts.actions || []).filter(function (a) { return !a.disabled; });
    if (acts.length === 0) return;
    if (isEnemy) {
      if (acts[0].fameRewrite === 'bounced_check') {
        onSelectLandingAction('bounced_check', acts[0]);
        return;
      }
      var duelAct = acts[1];
      var pct = duelAct && (duelAct.winRatePct != null ? duelAct.winRatePct : (duelAct.winRate || 0) * 100);
      if (duelAct && !duelAct.disabled && pct >= 55) {
        onSelectLandingAction(duelAct.key, duelAct);
      } else {
        onSelectLandingAction(acts[0].key, acts[0]);
      }
    } else {
      onSelectLandingAction(acts[0].key, acts[0]);
    }
  }

  function onSelectLandingAction(actionKey, actMeta) {
    if (isBusy) return;
    if (FTX.Audio) FTX.Audio.playUiClick();
    syncRerollButtons(false);
    $('sheet-landing').classList.add('hidden');

    // 骑木马单挑（或 17 号虎牢关与吕布骑木马单挑）走中央舞台两段式 2.0s 奇策交互窗！
    if ((actionKey === 'duel' || actionKey === 'hulao_duel') && FTX.Engine.startDuel) {
      runTwoStageHorseDuel(actionKey);
      return;
    }

    isBusy = true;
    var res = FTX.Engine.resolveLanding(actionKey, actMeta && actMeta.payload ? actMeta.payload : {});
    if (!res || !res.ok) {
      isBusy = false;
      if (res && res.message) showToast(res.message);
      routeByEnginePhase();
      return;
    }

    var st = FTX.Engine.getState();
    syncBoardTiles(st);
    syncPiecesPositions(st);
    syncHUD(st);

    if (res.quote || res.headline) {
      setTicker(res.quote || res.headline);
      showToast(res.headline || res.quote);
    }

    // 按动作类型呈现中央舞台微演出与音效
    if (actionKey === 'pay_toll') {
      if (FTX.Audio) FTX.Audio.playTollCry();
      shakeScreen();
      finishAfterDelay(320);
    } else if (actionKey === 'bounced_check') {
      if (FTX.Audio) FTX.Audio.playGong(false);
      playStageMiniShow({
        badge: '💜 邪道开芭乐票！',
        mainImg: FTX.DATA.LORDS[st.player.lordId].happyImg,
        caption: res.quote || '开张空头支票住霸王店，大摇大摆溜走啰！'
      }, 850, finishLandingTurn);
    } else if (actionKey === 'field_battle') {
      if (FTX.Audio) FTX.Audio.playDuelHit(res.win ? 'stool' : 'slip');
      if (res.win) spawnParticles('coin', 16, 0.5, 0.4);
      shakeScreen();
      playStageMiniShow({
        badge: res.win ? '🏳️ 地形野战大捷！' : '💥 地形野战受挫',
        mainImg: FTX.DATA.VANGUARDS[st.player.vanguardId].horseImg,
        subImg: FTX.DATA.ASSETS.chars.xiahoudun_horse,
        caption: res.quote || res.headline || ''
      }, 950, finishLandingTurn);
    } else if (actionKey === 'siege' || actionKey === 'persuade') {
      if (FTX.Audio) FTX.Audio.playCannon(true);
      shakeScreen();
      if (res.win) spawnParticles('coin', 28, 0.5, 0.38);
      playStageMiniShow({
        badge: res.win ? '🏯 破城易帜夺店面！' : '💣 攻城失利赔三倍',
        mainImg: FTX.DATA.VANGUARDS[st.player.vanguardId].horseImg,
        subImg: FTX.DATA.ASSETS.world.city_lv5,
        caption: res.quote || res.headline || ''
      }, 1050, finishLandingTurn);
    } else if (res.silverDelta > 0) {
      if (FTX.Audio) FTX.Audio.playCoin(res.silverDelta >= 1000);
      spawnParticles('coin', res.silverDelta >= 1000 ? 28 : 14, 0.5, 0.42);
      if (actionKey.indexOf('pot') >= 0 || (st.board[st.player.pos] && st.board[st.player.pos].type === 'pot')) {
        playStageMiniShow({
          badge: '💰 风水聚宝盆爆金！',
          mainImg: FTX.DATA.ASSETS.world.corner_pot,
          caption: res.quote || ('整碗抱走 +' + fmtNum(res.silverDelta) + ' 两！')
        }, 950, finishLandingTurn);
      } else {
        finishAfterDelay(320);
      }
    } else if (actionKey === 'buy_city' || actionKey === 'visit_upgrade') {
      if (FTX.Audio) FTX.Audio.playUpgrade();
      finishAfterDelay(260);
    } else if (st.board[st.player.pos] && st.board[st.player.pos].type === 'demon') {
      if (FTX.Audio) FTX.Audio.playDuelHit('stool');
      playStageMiniShow({
        badge: '👻 痛扁街头心魔！',
        mainImg: FTX.DATA.VANGUARDS[st.player.vanguardId].horseImg,
        subImg: FTX.DATA.ASSETS.chars.mind_demon,
        caption: res.quote || res.headline || '算盘小鬼抱头鼠窜！'
      }, 850, finishLandingTurn);
    } else {
      finishAfterDelay(260);
    }
  }

  function finishAfterDelay(ms) {
    managedTimeout(finishLandingTurn, speedDiv(ms));
  }

  function finishLandingTurn() {
    isBusy = false;
    routeByEnginePhase();
  }

  // ==================== 核心动作 3：不切屏「骑木马单挑」两段式舞台（含 2.0s 奇策高光窗） ====================
  function runTwoStageHorseDuel(actionKey) {
    isBusy = true;
    var duelInit = FTX.Engine.startDuel(actionKey);
    if (!duelInit || !duelInit.ok) {
      // 兜底直接一步结算
      var fallbackRes = FTX.Engine.resolveLanding(actionKey, {});
      isBusy = false;
      if (fallbackRes && fallbackRes.quote) showToast(fallbackRes.quote);
      routeByEnginePhase();
      return;
    }

    setStageMode('duel');
    var st = FTX.Engine.getState();
    var vgCfg = duelInit.playerVanguard || FTX.DATA.VANGUARDS[st.player.vanguardId] || FTX.DATA.VANGUARDS.zhangfei;
    var enemyGov = duelInit.enemyGovernor || FTX.DATA.GOVERNORS.lvbu;

    // 填充立牌图片与名字（全部来自真实 15 张 chars PNG）
    var allyImg = $('duel-ally-img');
    var enemyImg = $('duel-enemy-img');
    var allyFighter = $('duel-ally-fighter');
    var crowsLayer = $('duel-crows-layer');
    if (allyFighter) allyFighter.classList.remove('slip-fall');
    if (crowsLayer) crowsLayer.classList.add('hidden');

    if (allyImg) {
      delete allyImg.dataset.fallbackApplied;
      allyImg.setAttribute('src', vgCfg.horseImg || FTX.DATA.ASSETS.chars.zhangfei_horse);
    }
    if (enemyImg) {
      delete enemyImg.dataset.fallbackApplied;
      enemyImg.setAttribute('src', enemyGov.horseImg || FTX.DATA.ASSETS.chars.lvbu_horse);
    }
    if ($('duel-ally-name')) $('duel-ally-name').textContent = vgCfg.name || '先锋';
    if ($('duel-enemy-name')) $('duel-enemy-name').textContent = enemyGov.name || '太守';

    // 两侧军师摇扇口斗互喷气泡
    var clash = duelInit.advisorClash || {};
    if ($('duel-ally-bubble')) {
      $('duel-ally-bubble').textContent = (clash.skillName || '《夜市叫卖》') + ' 斗志↑';
    }
    if ($('duel-enemy-bubble')) {
      $('duel-enemy-bubble').textContent = '郭嘉：气急败坏！斗志↓';
    }
    if (clash.playerLine) setTicker(clash.playerLine);

    var mAlly = clash.playerMorale != null ? clash.playerMorale : 65;
    var mEnemy = clash.enemyMorale != null ? clash.enemyMorale : 45;
    updateDuelMoraleUI(mAlly, mEnemy, duelInit.baseWinRatePct || 60);

    if (FTX.Audio) {
      FTX.Audio.playDuelHit('spring');
      managedTimeout(function () { FTX.Audio.playDuelHit('fan'); }, 220);
    }

    // 开启 2.0 秒发光「拍出战斗奇策！」交互窗口
    var tacticWin = $('duel-tactic-window');
    var btnBox = $('duel-tactic-buttons');
    var timerFill = $('duel-timer-fill');
    var availCards = duelInit.availableCombatCards || st.player.combatCards || [];

    tacticWin.classList.remove('hidden');
    btnBox.innerHTML = '';

    if (availCards.length > 0) {
      availCards.forEach(function (cc) {
        var cfg = FTX.DATA.COMBAT_CARDS[cc.cardId || cc.id] || cc;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'glow-tactic-btn';
        var bonusPct = Math.round((cfg.winRateBonus || 0.2) * 100);
        b.textContent = '⚡ 拍出' + cfg.name + ' (+' + bonusPct + '%胜算)';
        b.addEventListener('click', function () {
          triggerDuelCardChoice(cc.instanceId || cc.id);
        });
        btnBox.appendChild(b);
      });
    } else {
      var directBtn = document.createElement('button');
      directBtn.type = 'button';
      directBtn.className = 'glow-tactic-btn';
      directBtn.textContent = '⚡ 折凳拍脸硬刚！（无手牌奇策）';
      directBtn.addEventListener('click', function () {
        triggerDuelCardChoice(null);
      });
      btnBox.appendChild(directBtn);
    }

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'skip-tactic-btn';
    skipBtn.textContent = '省牌硬刚';
    skipBtn.addEventListener('click', function () {
      triggerDuelCardChoice(null);
    });
    if (availCards.length > 0) btnBox.appendChild(skipBtn);

    // 同步点亮手牌区的奇策卡槽
    renderHandCards(st);

    var totalWindowMs = autoRollEnabled ? 550 : speedDiv(2000);
    duelRemainingMs = totalWindowMs;
    if (timerFill) timerFill.style.width = '100%';

    duelPendingCallback = function (chosenInstanceId) {
      tacticWin.classList.add('hidden');
      var res = FTX.Engine.finalizeDuel(chosenInstanceId || null);
      playDuelClimaxAndFinish(res);
    };

    startDuelCountdownTick(totalWindowMs);
  }

  function startDuelCountdownTick(totalMs) {
    if (duelInterval !== null) clearInterval(duelInterval);
    var timerFill = $('duel-timer-fill');
    var baseTotal = Math.max(200, totalMs || 2000);

    duelInterval = setInterval(function () {
      if (isPageHidden) return;
      duelRemainingMs -= 80;
      if (timerFill) {
        var pct = Math.max(0, Math.min(100, (duelRemainingMs / baseTotal) * 100));
        timerFill.style.width = pct + '%';
      }
      if (duelRemainingMs <= 0) {
        triggerDuelCardChoice(null);
      }
    }, 80);
  }

  function triggerDuelCardChoice(cardInstanceId) {
    if (!duelPendingCallback) return;
    var cb = duelPendingCallback;
    clearDuelTimer();
    if (cardInstanceId && FTX.Audio) FTX.Audio.playGong(false);
    cb(cardInstanceId);
  }

  function updateDuelMoraleUI(mAlly, mEnemy, winRatePct) {
    if ($('duel-morale-ally')) $('duel-morale-ally').textContent = String(Math.round(mAlly));
    if ($('duel-morale-enemy')) $('duel-morale-enemy').textContent = String(Math.round(mEnemy));
    if ($('duel-winrate-pill')) $('duel-winrate-pill').textContent = '胜算 ' + Math.round(winRatePct) + '%';
    if ($('duel-morale-fill')) {
      var sum = Math.max(1, mAlly + mEnemy);
      $('duel-morale-fill').style.width = Math.round((mAlly / sum) * 100) + '%';
    }
  }

  function playDuelClimaxAndFinish(res) {
    if (!res) {
      isBusy = false;
      setStageMode('idle');
      routeByEnginePhase();
      return;
    }

    if (res.finalWinRatePct != null) {
      updateDuelMoraleUI(res.win ? 90 : 30, res.win ? 20 : 85, res.finalWinRatePct);
    }

    var allyFighter = $('duel-ally-fighter');
    var crowsLayer = $('duel-crows-layer');
    var spark = $('duel-clash-spark');

    if (res.isSlipComedy) {
      // 放水摔马喜剧演出：金光扑街 + 三只黑乌鸦飞过！
      if (allyFighter) allyFighter.classList.add('slip-fall');
      if (crowsLayer) crowsLayer.classList.remove('hidden');
      if (spark) spark.textContent = '🍌扑街！';
      if (FTX.Audio) FTX.Audio.playDuelHit('slip');
    } else if (res.win) {
      if (spark) spark.textContent = '🪑暴击免单！';
      if (FTX.Audio) FTX.Audio.playDuelHit('stool');
      shakeScreen();
      spawnParticles('coin', 24, 0.5, 0.42);
    } else {
      if (spark) spark.textContent = '💥惜败赔款';
      if (FTX.Audio) FTX.Audio.playTollCry();
      shakeScreen();
    }

    if (res.buttonQuote) {
      setTicker(res.buttonQuote);
      showToast(res.buttonQuote);
    }

    var st = FTX.Engine.getState();
    syncBoardTiles(st);
    syncPiecesPositions(st);
    syncHUD(st);

    managedTimeout(function () {
      if (spark) spark.textContent = '⚡VS🔥';
      if (allyFighter) allyFighter.classList.remove('slip-fall');
      setStageMode('idle');
      isBusy = false;
      routeByEnginePhase();
    }, speedDiv(1050));
  }

  // ==================== 核心动作 4：即换即融、过圈置业（阿伯代办）、政见三选一、踢馆宿敌 ====================
  function openEquipCompareSheet(st) {
    var pending = st.pendingEquip || (st.player && st.player.pendingEquip);
    if (!pending) {
      FTX.Engine.resolveEquipPrompt('sell');
      routeByEnginePhase();
      return;
    }

    var newCfg = FTX.DATA.EQUIPMENTS[pending.id || pending.equipId] || pending;
    var curRaw = st.player.equipment && st.player.equipment[newCfg.slot];
    var oldCfg = curRaw ? (FTX.DATA.EQUIPMENTS[curRaw.id || curRaw] || curRaw) : null;

    var oldBox = $('equip-old-box');
    var newBox = $('equip-new-box');
    var slotNames = { weapon: '兵器', helm: '头冠', armor: '衣甲', mount: '坐骑' };

    if (oldBox) {
      oldBox.innerHTML = oldCfg
        ? ('<b>当前 · ' + escHtml(oldCfg.name) + '</b><br/>部位：' + slotNames[newCfg.slot] +
           '<br/>武斗加值：<b>+' + oldCfg.bonus + '</b><br/><small>' + escHtml(oldCfg.perk || '') + '</small>')
        : ('<b>当前 · 空置槽位</b><br/>部位：' + slotNames[newCfg.slot] + '<br/>武斗加值：+0');
    }

    var diff = newCfg.bonus - (oldCfg ? oldCfg.bonus : 0);
    var diffStr = diff >= 0
      ? ('<span style="color:#15803D;font-weight:900">(+' + diff + ' ↑)</span>')
      : ('<span style="color:#B91C1C;font-weight:900">(' + diff + ' ↓)</span>');

    if (newBox) {
      newBox.innerHTML =
        '<b>新爆出 · ' + escHtml(newCfg.name) + '</b><br/>部位：' + slotNames[newCfg.slot] +
        '<br/>武斗加值：<b>+' + newCfg.bonus + '</b> ' + diffStr +
        '<br/><small>' + escHtml(newCfg.perk || newCfg.note || '') + '</small>';
    }

    $('sheet-equip').classList.remove('hidden');

    if (autoRollEnabled && newCfg.rarity !== 'UR' && !isPageHidden) {
      managedTimeout(function () {
        if (!autoRollEnabled || isPageHidden || FTX.Engine.getState().phase !== 'EQUIP_PROMPT') return;
        handleEquipDecision(diff >= 0 ? 'equip' : 'sell');
      }, speedDiv(500));
    }
  }

  function handleEquipDecision(choice) {
    var res = FTX.Engine.resolveEquipPrompt(choice);
    $('sheet-equip').classList.add('hidden');
    if (res && res.silverGain > 0) {
      if (FTX.Audio) FTX.Audio.playCoin(false);
      spawnParticles('coin', 12, 0.5, 0.65);
    } else if (FTX.Audio) {
      FTX.Audio.playUpgrade();
    }
    if (res && res.quote) showToast(res.quote);
    routeByEnginePhase();
  }

  function openEstateModal(st) {
    var modal = $('modal-estate');
    modal.classList.remove('hidden');
    modal.classList.add('active');

    renderEstateModalBody(st);

    if (autoRollEnabled && !isPageHidden) {
      managedTimeout(function () {
        if (!autoRollEnabled || isPageHidden || FTX.Engine.getState().phase !== 'LOOP_ESTATE') return;
        if (FTX.Engine.autoEstateByUncle) FTX.Engine.autoEstateByUncle();
        if (FTX.Audio) FTX.Audio.playUpgrade();
        handleFinishEstate();
      }, speedDiv(600));
    }
  }

  function renderEstateModalBody(st) {
    var opts = FTX.Engine.getEstateOptions ? FTX.Engine.getEstateOptions() : { cities: [], availableGovernors: [] };
    if ($('estate-silver-val')) $('estate-silver-val').textContent = fmtNum(st.player.silver);
    if ($('estate-city-count')) $('estate-city-count').textContent = String((opts.cities || []).length);
    if ($('estate-loop-summary') && st.lastLoopSummary) {
      $('estate-loop-summary').textContent = st.lastLoopSummary;
    }

    var listEl = $('estate-cities-list');
    listEl.innerHTML = '';

    if (!opts.cities || opts.cities.length === 0) {
      listEl.innerHTML = '<div class="estate-city-row">当前名下暂无产业，快去盘面抢无主空城或机关攻城吧！</div>';
      return;
    }

    var govPool = opts.availableGovernors || [];

    opts.cities.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'estate-city-row';

      var curGov = c.governorId && FTX.DATA.GOVERNORS[c.governorId] ? FTX.DATA.GOVERNORS[c.governorId].name : '里长伯看门';
      var upBtnHtml = c.level >= 5
        ? '<span class="ecr-upgrade-btn" style="background:#DCFCE7">已满级 Lv.5</span>'
        : ('<button type="button" class="ecr-upgrade-btn" data-up-tile="' + c.tileIdx + '" ' +
           (c.canUpgrade ? '' : 'disabled') + '>升 Lv.' + (c.level + 1) + ' (-' + fmtNum(c.upgradeCost) + '两)</button>');

      var bldgsHtml = '';
      (c.availableBuildings || []).forEach(function (b) {
        var alreadyBuilt = (c.buildings || []).indexOf(b.id) >= 0;
        if (alreadyBuilt) {
          bldgsHtml += '<span class="bldg-chip-btn built"><img src="' + escHtml(b.worldImg) + '" alt="" onerror="FTX_IMG_FALLBACK(this, \'楼\')" />' + escHtml(b.name) + '✓</span>';
        } else {
          bldgsHtml += '<button type="button" class="bldg-chip-btn" data-bldg-tile="' + c.tileIdx + '" data-bldg-id="' + b.id + '" ' +
            (b.canBuild ? '' : 'disabled') + '>' +
            '<img src="' + escHtml(b.worldImg) + '" alt="" onerror="FTX_IMG_FALLBACK(this, \'楼\')" />' +
            escHtml(b.name) + '(' + fmtNum(b.cost) + ')' +
            '</button>';
        }
      });

      var govBtnHtml = govPool.length > 0
        ? ('<button type="button" class="bldg-chip-btn" data-gov-tile="' + c.tileIdx + '">👤 太守：' + escHtml(curGov) + ' [轮换]</button>')
        : ('<span class="bldg-chip-btn">👤 太守：' + escHtml(curGov) + '</span>');

      row.innerHTML =
        '<div class="ecr-top">' +
          '<strong>' + escHtml(c.name) + ' · Lv.' + c.level + ' <small>(槽 ' + (c.slotsUsed || 0) + '/' + (c.slotsMax || 1) + ')</small></strong>' +
          upBtnHtml +
        '</div>' +
        '<div class="ecr-bldgs">' + govBtnHtml + bldgsHtml + '</div>';

      listEl.appendChild(row);
    });

    // 绑定升级、盖楼、换太守事件
    var upBtns = listEl.querySelectorAll('[data-up-tile]');
    for (var i = 0; i < upBtns.length; i++) {
      upBtns[i].addEventListener('click', function () {
        var tIdx = Number(this.dataset.upTile);
        var r = FTX.Engine.applyEstateUpgrade({ type: 'upgrade', tileIdx: tIdx });
        if (r && r.ok) {
          if (FTX.Audio) FTX.Audio.playUpgrade();
        } else if (r && r.message) {
          showToast(r.message);
        }
        var ns = FTX.Engine.getState();
        syncBoardTiles(ns);
        syncHUD(ns);
        renderEstateModalBody(ns);
      });
    }

    var bBtns = listEl.querySelectorAll('[data-bldg-id]');
    for (var j = 0; j < bBtns.length; j++) {
      bBtns[j].addEventListener('click', function () {
        var tIdx = Number(this.dataset.bldgTile);
        var bId = this.dataset.bldgId;
        var r = FTX.Engine.applyEstateUpgrade({ type: 'build', tileIdx: tIdx, buildingId: bId });
        if (r && r.ok) {
          if (FTX.Audio) FTX.Audio.playUpgrade();
          showToast('落成「' + FTX.DATA.BUILDINGS[bId].name + '」！');
        } else if (r && r.message) {
          showToast(r.message);
        }
        var ns = FTX.Engine.getState();
        syncBoardTiles(ns);
        syncHUD(ns);
        renderEstateModalBody(ns);
      });
    }

    var gBtns = listEl.querySelectorAll('[data-gov-tile]');
    for (var k = 0; k < gBtns.length; k++) {
      gBtns[k].addEventListener('click', function () {
        var tIdx = Number(this.dataset.govTile);
        if (govPool.length === 0) return;
        var curId = FTX.Engine.getState().board[tIdx].governorId;
        var idxInPool = govPool.findIndex(function (g) { return (g.id || g) === curId; });
        var nextGov = govPool[(idxInPool + 1) % govPool.length];
        var nextId = nextGov.id || nextGov;
        var r = FTX.Engine.applyEstateUpgrade({ type: 'assign_governor', tileIdx: tIdx, governorId: nextId });
        if (r && r.ok && FTX.Audio) FTX.Audio.playUiClick();
        var ns = FTX.Engine.getState();
        syncHUD(ns);
        renderEstateModalBody(ns);
      });
    }
  }

  function handleUncleAutoEstate() {
    if (!FTX.Engine.autoEstateByUncle) return;
    var res = FTX.Engine.autoEstateByUncle();
    if (FTX.Audio) FTX.Audio.playUpgrade();
    if (res && res.quote) showToast(res.quote);
    else showToast('阿伯已按最快回本算法帮你把楼盖好啰！');
    var ns = FTX.Engine.getState();
    syncBoardTiles(ns);
    syncHUD(ns);
    renderEstateModalBody(ns);
  }

  function handleFinishEstate() {
    if (FTX.Audio) FTX.Audio.playUiClick();
    var res = FTX.Engine.finishEstatePhase();
    if (res && res.escalations && res.escalations.length > 0) {
      setTicker('盘面升阶：' + res.escalations.join('｜'));
    }
    routeByEnginePhase();
  }

  function openPolicyModal(st) {
    var modal = $('modal-policy');
    modal.classList.remove('hidden');
    modal.classList.add('active');
    renderPolicyChoices(st);

    if (autoRollEnabled && !isPageHidden) {
      managedTimeout(function () {
        if (!autoRollEnabled || isPageHidden || FTX.Engine.getState().phase !== 'LOOP_POLICY') return;
        var choices = FTX.Engine.getPolicyChoices ? FTX.Engine.getPolicyChoices() : [];
        if (choices.length > 0) handlePickPolicy(choices[0].id);
      }, speedDiv(520));
    }
  }

  function renderPolicyChoices(st) {
    var list = $('policy-cards-list');
    var choices = FTX.Engine.getPolicyChoices ? FTX.Engine.getPolicyChoices() : [];
    list.innerHTML = '';

    choices.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'policy-choice-card ' + rarityTierClass(p.rarity);
      btn.dataset.policyId = p.id;
      var pollTag = p.isPollGuaranteed ? ' · 🗳️民调保送' : '';
      btn.innerHTML =
        '<div class="pcc-head">' +
          '<span class="pcc-name">' + escHtml(p.name) + '</span>' +
          '<span class="pcc-school">' + escHtml(p.school) + '流' + pollTag + '</span>' +
        '</div>' +
        '<div class="pcc-desc">' + escHtml(p.desc) + '</div>';

      btn.addEventListener('click', function () {
        handlePickPolicy(p.id);
      });
      list.appendChild(btn);
    });

    var refBtn = $('btn-refresh-policy');
    if (refBtn) {
      refBtn.disabled = st.player.luckSticks <= 0;
      refBtn.textContent = '🎋 耗 1 支气运签重抽政见 (剩 ' + st.player.luckSticks + ' 支)';
    }
  }

  function handlePickPolicy(policyId) {
    var res = FTX.Engine.selectPolicy(policyId);
    if (FTX.Audio) FTX.Audio.playDongSuan();
    spawnParticles('coin', 16, 0.5, 0.5);
    showToast(FTX.DATA.QUOTES.dongSuan);
    if (res && res.message) setTicker(res.message);
    routeByEnginePhase();
  }

  function openRivalExamModal(st) {
    var exam = FTX.Engine.getRivalExam ? FTX.Engine.getRivalExam() : null;
    if (!exam) {
      FTX.Engine.resolveRivalExam('fight');
      routeByEnginePhase();
      return;
    }

    var modal = $('modal-rival');
    modal.classList.remove('hidden');
    modal.classList.add('active');

    if ($('rival-exam-title')) $('rival-exam-title').textContent = exam.name || '踢馆宿敌';
    var rImg = $('rival-exam-img');
    if (rImg && exam.img) {
      delete rImg.dataset.fallbackApplied;
      rImg.setAttribute('src', exam.img);
    }
    if ($('rival-exam-quote')) $('rival-exam-quote').textContent = exam.taunt || '';

    var actBox = $('rival-exam-actions');
    actBox.innerHTML = '';

    var btnCheck = document.createElement('button');
    btnCheck.type = 'button';
    btnCheck.className = 'choice-gem-btn c-pay';
    btnCheck.disabled = exam.canPassCheck === false;
    btnCheck.innerHTML =
      '<div class="cg-left"><span class="cg-title">1. ' + escHtml(exam.checkLabel || '验家底免战过关') + '</span>' +
      '<span class="cg-sub">' + (exam.canPassCheck === false ? '当前未达标，请选动手硬刚' : '达标直接稳过领奖！') + '</span></div>' +
      '<span class="cg-rate-pill high">免战</span>';
    btnCheck.addEventListener('click', function () {
      handleResolveRival('check');
    });

    var fightPct = exam.fightWinRatePct != null ? Math.round(exam.fightWinRatePct) : 65;
    var btnFight = document.createElement('button');
    btnFight.type = 'button';
    btnFight.className = 'choice-gem-btn c-duel';
    btnFight.innerHTML =
      '<div class="cg-left"><span class="cg-title">2. ' + escHtml(exam.fightLabel || '骑木马单挑宿敌！') + '</span>' +
      '<span class="cg-sub">过关领奇策+政见+纪念装；败也不出局！</span></div>' +
      '<span class="cg-rate-pill">胜算 ' + fightPct + '%</span>';
    btnFight.addEventListener('click', function () {
      handleResolveRival('fight');
    });

    actBox.appendChild(btnCheck);
    actBox.appendChild(btnFight);

    if (autoRollEnabled && !isPageHidden) {
      managedTimeout(function () {
        if (!autoRollEnabled || isPageHidden || FTX.Engine.getState().phase !== 'RIVAL_EXAM') return;
        handleResolveRival(exam.canPassCheck !== false ? 'check' : 'fight');
      }, speedDiv(550));
    }
  }

  function handleResolveRival(mode) {
    var res = FTX.Engine.resolveRivalExam(mode);
    $('modal-rival').classList.remove('active');
    $('modal-rival').classList.add('hidden');
    if (FTX.Audio) FTX.Audio.playDuelHit(res && res.win ? 'stool' : 'slip');
    if (res && res.win) spawnParticles('coin', 22, 0.5, 0.45);
    if (res && (res.quote || res.headline)) showToast(res.headline || res.quote);
    routeByEnginePhase();
  }

  // ==================== 核心动作 5：棋盘锦囊施放（含《安步当车》1~6步指哪打哪！） ====================
  function onClickBoardCard(cardObj, cardCfg) {
    var st = FTX.Engine.getState();
    if (!st || st.phase !== 'IDLE' || isBusy) {
      showToast('请在掷骰前的待机阶段施放棋盘锦囊！');
      return;
    }
    if (FTX.Audio) FTX.Audio.playUiClick();

    activeBoardCardToUse = cardObj;
    var sheet = $('sheet-card-use');
    $('card-use-title').textContent = '施放 ' + cardCfg.name;
    $('card-use-desc').textContent = cardCfg.desc;
    var optBox = $('card-use-options');
    optBox.innerHTML = '';

    var instId = cardObj.instanceId || cardObj.id;

    if (cardCfg.needParam === 'steps') {
      // 《安步当车》：1~6 步指哪打哪，明示每步目标格名与归属！
      for (var s = 1; s <= 6; s++) {
        var targetIdx = (st.player.pos + s) % 28;
        var bTile = st.board[targetIdx];
        var ownerTag = bTile.owner === 'player' ? '自家' : (bTile.owner ? '敌城' : (bTile.type === 'city' ? '空城' : '功能'));
        var stepBtn = document.createElement('button');
        stepBtn.type = 'button';
        stepBtn.className = 'step-pick-btn';
        stepBtn.dataset.stepVal = String(s);
        stepBtn.innerHTML = '🎲 走 <b>' + s + '</b> 步 → ' + escHtml(shortTileName(bTile.name || FTX.DATA.TILES[targetIdx].name)) +
          ' <small>(' + ownerTag + ')</small>';
        (function (stepsChosen) {
          stepBtn.addEventListener('click', function () {
            executeBoardCard(instId, { steps: stepsChosen });
          });
        })(s);
        optBox.appendChild(stepBtn);
      }
    } else if (cardCfg.needParam === 'tileIdx') {
      // 《路障乌龟》：优先列出自家高过路费城池或当前格
      var myCities = st.board.filter(function (c) { return c.owner === 'player'; });
      myCities.sort(function (a, b) { return (b.currentToll || 0) - (a.currentToll || 0); });
      var targets = myCities.slice(0, 3);
      if (targets.length === 0) targets.push(st.board[st.player.pos]);

      targets.forEach(function (tc) {
        var tBtn = document.createElement('button');
        tBtn.type = 'button';
        tBtn.className = 'step-pick-btn';
        tBtn.innerHTML = '🐢 摆在 <b>' + escHtml(shortTileName(tc.name || FTX.DATA.TILES[tc.idx].name)) + '</b>';
        tBtn.addEventListener('click', function () {
          executeBoardCard(instId, { tileIdx: tc.idx });
        });
        optBox.appendChild(tBtn);
      });
    } else {
      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'primary-cta-btn';
      confirmBtn.style.gridColumn = '1 / -1';
      confirmBtn.textContent = '✨ 立即打出 ' + cardCfg.name;
      confirmBtn.addEventListener('click', function () {
        executeBoardCard(instId, {});
      });
      optBox.appendChild(confirmBtn);
    }

    sheet.classList.remove('hidden');
  }

  function executeBoardCard(instanceId, param) {
    $('sheet-card-use').classList.add('hidden');
    var res = FTX.Engine.useBoardCard(instanceId, param || {});
    if (!res || !res.ok) {
      if (res && res.message) showToast(res.message);
      return;
    }

    if (FTX.Audio) FTX.Audio.playGong(false);
    spawnParticles('coin', 18, 0.5, 0.45);
    if (res.message) {
      showToast(res.message);
      setTicker(res.message);
    }

    // 若《安步当车》直接返回了一次移动结果（含 path / dice），播放走棋序列；若是预埋下一次骰子，则自动触发掷骰！
    if (res.dice && res.path) {
      playRollSequence(res);
    } else if (param && param.steps && FTX.Engine.getState().phase === 'IDLE') {
      var rollRes = FTX.Engine.rollDice();
      if (rollRes && rollRes.ok) playRollSequence(rollRes);
      else routeByEnginePhase();
    } else {
      routeByEnginePhase();
    }
  }

  // ==================== 核心动作 6：关底决战三段万炮轰天命魔王演出 ====================
  function startBossFinaleSequence(st) {
    isBusy = true;
    setStageMode('finale');

    var bossImg = $('finale-boss-img');
    var allyImg = $('finale-ally-img');
    var vgCfg = FTX.DATA.VANGUARDS[st.player.vanguardId] || FTX.DATA.VANGUARDS.zhangfei;
    if (bossImg) {
      delete bossImg.dataset.fallbackApplied;
      bossImg.setAttribute('src', FTX.DATA.ASSETS.chars.boss_caocao_mecha);
    }
    if (allyImg) {
      delete allyImg.dataset.fallbackApplied;
      allyImg.setAttribute('src', vgCfg.horseImg);
    }

    // 开启短暂擂鼓助威窗口，同时自动将手中全部战斗奇策投入决战第三段爆发！
    finaleCheerMode = true;
    finaleCheerHits = autoRollEnabled ? 5 : 2;
    syncHUD(st);

    if ($('finale-stage-tag')) $('finale-stage-tag').textContent = '⚠️ 天命魔王降临 · 准备三段总清算！';
    if ($('finale-log-line')) $('finale-log-line').textContent = '狂点下方红色擂鼓键为先锋助威加伤！';

    managedTimeout(function () {
      finaleCheerMode = false;
      var curSt = FTX.Engine.getState();
      var allCardIds = (curSt.player.combatCards || []).map(function (c) { return c.instanceId || c.id; });
      var report = FTX.Engine.computeBossFinale({
        combatCardIds: allCardIds,
        cheerHits: finaleCheerHits
      });
      lastFinaleReport = report;
      playThreeStageBossAnimation(report, false);
    }, speedDiv(900));
  }

  function playThreeStageBossAnimation(report, isRetry) {
    if (!report) {
      isBusy = false;
      openGameOverModal(FTX.Engine.getState(), null);
      return;
    }

    var maxHp = Math.max(1, (report.boss && report.boss.maxHp) || (report.boss && report.boss.totalHp) || 10000);
    var d1 = (report.stage1_artillery && report.stage1_artillery.damage) != null
      ? report.stage1_artillery.damage
      : (report.stage1Damage || 0);
    var d2 = (report.stage2_governors && report.stage2_governors.damage) != null
      ? report.stage2_governors.damage
      : (report.stage2Damage || 0);
    var d3 = (report.stage3_vanguard && report.stage3_vanguard.damage) != null
      ? report.stage3_vanguard.damage
      : (report.stage3Damage || 0);

    function setBossBar(remHp, stageTxt, logTxt) {
      var clamped = Math.max(0, Math.round(remHp));
      if ($('finale-stage-tag')) $('finale-stage-tag').textContent = stageTxt;
      if ($('finale-boss-hp-text')) $('finale-boss-hp-text').textContent = 'HP ' + fmtNum(clamped) + ' / ' + fmtNum(maxHp);
      if ($('finale-hp-fill')) $('finale-hp-fill').style.width = Math.round((clamped / maxHp) * 100) + '%';
      if ($('finale-log-line')) $('finale-log-line').textContent = logTxt;
    }

    setBossBar(maxHp, isRetry ? '🎋 逆天续命 · 重轰决战！' : '第一段 · 资产万炮齐发！', '全盘名下产业化作重炮轰击魔舰！');
    if (FTX.Audio) FTX.Audio.playCannon(true);
    shakeScreen();
    spawnParticles('fire', 26, 0.72, 0.42);

    managedTimeout(function () {
      var rem1 = maxHp - d1;
      setBossBar(rem1, '第一段结算 · 资产炮火 -' + fmtNum(d1), '第二段：各城驻守太守连携合击登场！');
      if (FTX.Audio) FTX.Audio.playCannon(false);
      spawnParticles('fire', 22, 0.72, 0.42);

      managedTimeout(function () {
        var rem2 = rem1 - d2;
        setBossBar(rem2, '第二段结算 · 太守连携 -' + fmtNum(d2), '第三段：先锋骑弹簧木马单骑冲阵收尾！');
        if (FTX.Audio) FTX.Audio.playDuelHit('stool');
        shakeScreen();
        spawnParticles('coin', 30, 0.55, 0.42);

        managedTimeout(function () {
          var rem3 = rem2 - d3;
          setBossBar(
            rem3,
            report.victory ? '🏆 轰沉魔舰 · 十八啦大捷！' : '💥 炮火耗尽 · 魔王残存',
            report.summaryQuote || (report.victory ? '万炮齐发轰翻曹丞相铁索巨舰！' : '就差一点身家炮火！')
          );
          if (FTX.Audio) {
            if (report.victory) FTX.Audio.playGong(true);
            else FTX.Audio.playTollCry();
          }
          managedTimeout(function () {
            isBusy = false;
            openGameOverModal(FTX.Engine.getState(), report);
          }, speedDiv(750));
        }, speedDiv(800));
      }, speedDiv(800));
    }, speedDiv(800));
  }

  function openGameOverModal(st, report) {
    autoRollEnabled = false;
    clearAutoRollTimer();
    syncHUD(st);

    var modal = $('modal-gameover');
    modal.classList.remove('hidden');
    modal.classList.add('active');

    var win = report ? Boolean(report.victory) : Boolean(st.victory);
    var lordCfg = FTX.DATA.LORDS[st.player.lordId] || FTX.DATA.LORDS.liubei;

    if ($('go-grade')) $('go-grade').textContent = (report && report.grade) || (win ? 'S' : 'B');
    if ($('go-headline')) {
      $('go-headline').textContent = win ? '🏆 富甲天下 · 十八啦大捷！' : '💸 惜败收摊 · 下局再讨回来！';
    }
    if ($('go-quote')) {
      $('go-quote').textContent = (report && report.summaryQuote) ||
        (win ? '十座满级店面化作万门火炮，天命魔王连裤衩都赔光啦！' : lordCfg.quotes.bankrupt[0]);
    }
    var goAvatar = $('go-avatar');
    if (goAvatar) {
      delete goAvatar.dataset.fallbackApplied;
      goAvatar.setAttribute('src', win ? lordCfg.happyImg : lordCfg.cryImg);
    }

    var bd = $('go-breakdown');
    if (bd) {
      var myCities = (st.board || []).filter(function (c) { return c.owner === 'player'; }).length;
      if (report) {
        var d1 = (report.stage1_artillery && report.stage1_artillery.damage) != null ? report.stage1_artillery.damage : (report.stage1Damage || 0);
        var d2 = (report.stage2_governors && report.stage2_governors.damage) != null ? report.stage2_governors.damage : (report.stage2Damage || 0);
        var d3 = (report.stage3_vanguard && report.stage3_vanguard.damage) != null ? report.stage3_vanguard.damage : (report.stage3Damage || 0);
        var maxHp = (report.boss && (report.boss.maxHp || report.boss.totalHp)) || 10000;
        bd.innerHTML =
          '<div>💰 <b>终局总身家</b>：' + fmtNum(st.player.netWorth || st.player.silver) + ' 两（名下 ' + myCities + ' 座城池）</div>' +
          '<div>🔥 <b>第一段·资产炮火 (D1)</b>：' + fmtNum(d1) + ' 点</div>' +
          '<div>🏯 <b>第二段·太守连携 (D2)</b>：' + fmtNum(d2) + ' 点</div>' +
          '<div>🐴 <b>第三段·先锋收尾 (D3)</b>：' + fmtNum(d3) + ' 点</div>' +
          '<hr style="margin:5px 0;border:none;border-top:1px dashed #D6CFC2"/>' +
          '<div>🎯 <b>总计轰出火力</b>：<b>' + fmtNum(report.totalDamage || (d1 + d2 + d3)) + '</b> vs 魔王气血 <b>' + fmtNum(maxHp) + '</b></div>';
      } else {
        bd.innerHTML =
          '<div>💰 <b>结算现银</b>：' + fmtNum(st.player.silver) + ' 两</div>' +
          '<div>🏯 <b>名下产业</b>：' + myCities + ' 座城池｜坚持至第 ' + st.loop + ' 圈</div>';
      }
    }

    var retryBtn = $('btn-retry-boss');
    if (retryBtn) {
      var canRetry = Boolean(report && !report.victory && report.canRetryWithStick && st.player.luckSticks > 0);
      retryBtn.classList.toggle('hidden', !canRetry);
    }
  }

  // ==================== 非阻塞浮窗与多功能信息抽屉 ====================
  function openTilePopover(tileIdx) {
    var st = FTX.Engine.getState();
    if (!st || !st.board[tileIdx]) return;
    var b = st.board[tileIdx];
    var t = FTX.DATA.TILES[tileIdx];
    var pop = $('tile-popover');
    if (!pop) return;

    $('pop-tile-title').textContent = tileIdx + ' · ' + (b.name || t.name);
    var html = '';
    if (t.type === 'city') {
      var ownerMap = { player: '我方主公', caocao: '◆曹操（魏）', sunquan: '▲孙权（吴）' };
      var govObj = b.governorId && FTX.DATA.GOVERNORS[b.governorId] ? FTX.DATA.GOVERNORS[b.governorId] : FTX.DATA.GOVERNORS.lizhangbo;
      var bNames = (b.buildings || []).map(function (id) { return FTX.DATA.BUILDINGS[id] ? FTX.DATA.BUILDINGS[id].name : id; });
      html =
        '<div>📍 州域：<b>' + escHtml(t.regionName) + '</b>｜地形：<b>' + escHtml(t.terrainName) + '</b>｜地价 P=' + t.basePrice + '两</div>' +
        '<div>🚩 归属：<b>' + (ownerMap[b.owner] || '无主空城') + '</b>' + (b.owner ? ('（Lv.' + b.level + '）') : '') + '</div>' +
        (b.owner ? ('<div>💸 当前过路费：<b>' + fmtNum(b.currentToll || 0) + ' 两</b>｜太守：' + escHtml(govObj.name) + '</div>') : '') +
        (b.owner ? ('<div>🛡️ 守军：' + fmtNum(b.garrison || 0) + '｜城防：' + fmtNum(b.defense || 0) + '</div>') : '') +
        '<div>🏗️ 城内建筑：' + (bNames.length ? escHtml(bNames.join('、')) : '暂无') + (b.smoked ? ' <b style="color:#65A30D">[被屎王神熏-25%]</b>' : '') + '</div>';
    } else {
      var desc = tileIdx === 17 && FTX.DATA.SPECIAL_MODES[st.specialMode]
        ? FTX.DATA.SPECIAL_MODES[st.specialMode].desc
        : t.desc;
      html = '<div>' + escHtml(desc) + '</div>';
    }

    $('pop-tile-body').innerHTML = html;
    pop.classList.remove('hidden');
  }

  function closeTilePopover() {
    var pop = $('tile-popover');
    if (pop) pop.classList.add('hidden');
  }

  function openInfoDrawer(kind) {
    var st = FTX.Engine.getState();
    if (!st) return;
    if (FTX.Audio) FTX.Audio.playUiClick();

    var modal = $('modal-info-drawer');
    var titleEl = $('drawer-title');
    var contentEl = $('drawer-content');
    var html = '';

    if (kind === 'hegemon') {
      titleEl.textContent = '⚠️ 霸主下圈手笔明牌与金库情报';
      ['caocao', 'sunquan'].forEach(function (hid) {
        var h = st.hegemons[hid];
        var cfg = FTX.DATA.HEGEMONS[hid];
        if (!h || !cfg) return;
        html += '<div class="estate-city-row">' +
          '<strong>' + escHtml(cfg.name + ' · ' + cfg.title) + '</strong>' +
          '<div>状态：' + (h.bankrupt ? '🩲 已破产跑路' : ('金库 ' + fmtNum(h.vault) + ' 两｜护卫 HP ' + Math.round(h.guardHp || 0) + '/' + Math.round(h.maxGuardHp || 300))) + '</div>';
        if (h.nextMoveCard && !h.bankrupt) {
          html += '<div style="color:#B91C1C;font-weight:800">📢 下圈预告：《' + escHtml(h.nextMoveCard.name) + '》— ' + escHtml(h.nextMoveCard.effectDesc) + '</div>' +
            '<div style="color:#15803D;font-weight:800">💡 ' + escHtml(h.nextMoveCard.counterTip) + '</div>';
        } else {
          html += '<div>📢 当前暂无点名手笔预告。</div>';
        }
        html += '</div>';
      });
    } else if (kind === 'policies') {
      titleEl.textContent = '📜 主公四维命格与已选政见构筑';
      var lordCfg = FTX.DATA.LORDS[st.player.lordId] || FTX.DATA.LORDS.liubei;
      var s = st.player.stats || {};
      html += '<div class="estate-city-row">' +
        '<strong>' + escHtml(lordCfg.name + ' · ' + lordCfg.traitName) + '</strong>' +
        '<div>' + escHtml(lordCfg.traitDesc) + '</div>' +
        '<div>📊 四维：体魄 <b>' + s.physique + '</b>｜谋略 <b>' + s.strategy + '</b>｜魅力 <b>' + s.charm + '</b>｜名望 <b>' + s.fame + '</b></div>' +
        '<div>💰 当前预估总身家：<b>' + fmtNum(st.player.netWorth || st.player.silver) + ' 两</b></div>' +
        '</div>';

      var pols = st.player.policies || [];
      if (pols.length === 0) {
        html += '<div class="estate-city-row">尚未召开里民大会选政见（跨过起点或掷出十八啦即可触发！）</div>';
      } else {
        pols.forEach(function (pid) {
          var pObj = typeof pid === 'string'
            ? FTX.DATA.POLICIES.find(function (x) { return x.id === pid; })
            : pid;
          if (!pObj) return;
          html += '<div class="estate-city-row"><strong>【' + escHtml(pObj.school) + '】' + escHtml(pObj.name) + '</strong><div>' + escHtml(pObj.desc) + '</div></div>';
        });
      }
    } else {
      titleEl.textContent = '📖 核心规则速查与实时战报';
      html += '<div class="estate-city-row">' +
        '<strong>🎲 三秒上手指南</strong>' +
        '<div>1. <b>同步落子零等待</b>：按「掷骰」，你走 2D6，曹操孙权同步走 1D6（7点概率最高琥珀高亮）。</div>' +
        '<div>2. <b>踩城四择真博弈</b>：踩敌城不一定要交钱！胜算高就点「骑木马单挑」免单，「机关攻城」直接抢他店面！名望 ≤-30 解锁「开芭乐票」白住赖账，≥+30 解锁「开城劝降」。</div>' +
        '<div>3. <b>缺德基建 & 关底万炮</b>：盖箭塔射瘫霸主车驾，盖屎王神熏臭邻居降租；第 ' + st.maxLoops + ' 圈拿全部身家化作火炮轰天命魔王！</div>' +
        '</div>';
      var logs = (st.logs || []).slice(-12).reverse();
      html += '<div class="estate-city-row"><strong>📢 最近盘面战报</strong>' +
        (logs.length ? logs.map(function (l) { return '<div>• ' + escHtml(typeof l === 'string' ? l : l.text) + '</div>'; }).join('') : '<div>刚刚开局，祝主公把把十八啦！</div>') +
        '</div>';
    }

    contentEl.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('active');
  }

  // ==================== 自动连掷托管调度 ====================
  function toggleAutoRoll() {
    autoRollEnabled = !autoRollEnabled;
    if (FTX.Audio) FTX.Audio.playUiClick();
    if (!autoRollEnabled) {
      clearAutoRollTimer();
      showToast('已关闭自动连掷托管');
    } else {
      showToast('已开启自动连掷（阿伯自动盖楼，随时再点可停）');
      scheduleAutoRollIfNeeded();
    }
    syncHUD(FTX.Engine.getState());
  }

  function scheduleAutoRollIfNeeded() {
    clearAutoRollTimer();
    if (!autoRollEnabled || isPageHidden || isBusy) return;
    var st = FTX.Engine.getState();
    if (!st || st.phase !== 'IDLE') return;
    autoRollTimer = setTimeout(function () {
      autoRollTimer = null;
      if (autoRollEnabled && !isPageHidden && !isBusy && FTX.Engine.getState().phase === 'IDLE') {
        handleRollClick();
      }
    }, speedDiv(460));
  }

  // ==================== 后台休眠守护（严守 AGENTS.md） ====================
  function applyVisibilityState(hiddenFlag) {
    var nextHidden = Boolean(hiddenFlag);
    if (isPageHidden === nextHidden) return;
    isPageHidden = nextHidden;

    if (FTX.Audio && FTX.Audio.setHidden) {
      FTX.Audio.setHidden(isPageHidden);
    }

    if (isPageHidden) {
      // 立即暂停全部 requestAnimationFrame 与自动连掷定时器
      stopParticleLoop();
      if (silverAnimId) {
        cancelAnimationFrame(silverAnimId);
        silverAnimId = null;
      }
      clearAutoRollTimer();
      if (duelInterval !== null) {
        clearInterval(duelInterval);
        duelInterval = null;
      }
    } else {
      // 页面恢复可见：平滑恢复未完粒子、单挑倒计时或自动连掷，绝不重绑监听器
      if (particles.length > 0) ensureParticleLoop();
      if (duelPendingCallback && duelRemainingMs > 0) {
        startDuelCountdownTick(duelRemainingMs);
      }
      scheduleAutoRollIfNeeded();
    }
  }

  // ==================== 事件绑定与开局启动 ====================
  function bindEventsOnce() {
    if (uiBound) return;
    uiBound = true;

    // 1. 后台休眠单例监听（严防重复绑定）
    if (!visibilityBound) {
      visibilityBound = true;
      isPageHidden = Boolean(document.hidden);
      document.addEventListener('visibilitychange', function () {
        applyVisibilityState(Boolean(document.hidden));
      });
    }

    window.addEventListener('resize', function () {
      resizeCanvas();
      var st = FTX.Engine && FTX.Engine.getState ? FTX.Engine.getState() : null;
      if (st) syncPiecesPositions(st);
    });

    // 2. 开局选主公与模式配置页
    var lordCards = document.querySelectorAll('.lord-pick-card');
    for (var i = 0; i < lordCards.length; i++) {
      lordCards[i].addEventListener('click', function () {
        if (FTX.Audio) FTX.Audio.playUiClick();
        startConfig.lordId = this.dataset.lord;
        lordCards.forEach(function (c) { c.classList.toggle('selected', c.dataset.lord === startConfig.lordId); });
      });
    }

    var vgPills = document.querySelectorAll('#start-vanguard-pick .opt-pill');
    vgPills.forEach(function (p) {
      p.addEventListener('click', function () {
        if (FTX.Audio) FTX.Audio.playUiClick();
        startConfig.vanguardId = this.dataset.vg;
        vgPills.forEach(function (el) { el.classList.toggle('selected', el.dataset.vg === startConfig.vanguardId); });
      });
    });

    var loopBtns = document.querySelectorAll('#start-loops-pick .seg-btn');
    loopBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (FTX.Audio) FTX.Audio.playUiClick();
        startConfig.maxLoops = Number(this.dataset.loops);
        loopBtns.forEach(function (el) { el.classList.toggle('selected', Number(el.dataset.loops) === startConfig.maxLoops); });
      });
    });

    var modeBtns = document.querySelectorAll('#start-mode-pick .seg-btn');
    modeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (FTX.Audio) FTX.Audio.playUiClick();
        startConfig.specialMode = this.dataset.mode;
        modeBtns.forEach(function (el) { el.classList.toggle('selected', el.dataset.mode === startConfig.specialMode); });
      });
    });

    $('btn-start-game').addEventListener('click', function () {
      if (FTX.Audio) {
        FTX.Audio.unlock();
        FTX.Audio.playGong(false);
      }
      startNewMatch();
    });

    // 3. 顶栏交互
    $('btn-speed').addEventListener('click', function () {
      if (FTX.Audio) FTX.Audio.playUiClick();
      var st = FTX.Engine.getState();
      var nextSp = st && st.speed === 2 ? 1 : 2;
      FTX.Engine.setSpeed(nextSp);
      showToast('已切换为 ' + nextSp + 'x 动画倍速');
      syncHUD(FTX.Engine.getState());
    });

    $('btn-audio').addEventListener('click', function () {
      if (!FTX.Audio) return;
      FTX.Audio.unlock();
      var muted = FTX.Audio.toggleMute();
      if (!muted && !FTX.Audio.isBgmEnabled()) {
        FTX.Audio.setBgmEnabled(true);
      }
      showToast(muted ? '已静音' : '已开启台味合成音效与庙会小调');
      syncHUD(FTX.Engine.getState());
    });

    $('btn-hegemon-alert').addEventListener('click', function () { openInfoDrawer('hegemon'); });
    $('btn-loop-info').addEventListener('click', function () { openInfoDrawer('hegemon'); });
    $('btn-lord-stats').addEventListener('click', function () { openInfoDrawer('policies'); });

    // 4. 构筑舱与手牌区
    $('btn-switch-vanguard').addEventListener('click', function () {
      var st = FTX.Engine.getState();
      if (!st || st.phase !== 'IDLE' || isBusy) {
        showToast('请在掷骰前的待机阶段切换先锋！');
        return;
      }
      var nextVg = st.player.vanguardId === 'zhangfei' ? 'zhaoyun' : 'zhangfei';
      FTX.Engine.switchVanguard(nextVg);
      if (FTX.Audio) FTX.Audio.playUiClick();
      var vgCfg = FTX.DATA.VANGUARDS[nextVg];
      showToast('切换先锋上阵：' + vgCfg.name + '（' + vgCfg.title + '）！');
      syncHUD(FTX.Engine.getState());
    });

    $('btn-policy-drawer').addEventListener('click', function () { openInfoDrawer('policies'); });
    $('btn-cancel-card').addEventListener('click', function () { $('sheet-card-use').classList.add('hidden'); });
    $('btn-close-popover').addEventListener('click', closeTilePopover);
    $('btn-close-drawer').addEventListener('click', function () {
      $('modal-info-drawer').classList.remove('active');
      $('modal-info-drawer').classList.add('hidden');
    });

    // 5. 底部大拇指热区
    $('btn-roll').addEventListener('click', handleRollClick);
    $('btn-luck-reroll').addEventListener('click', handleRerollClick);
    $('btn-sheet-reroll').addEventListener('click', handleRerollClick);
    $('btn-auto-roll').addEventListener('click', toggleAutoRoll);
    $('btn-open-log').addEventListener('click', function () { openInfoDrawer('log'); });

    var betBtns = document.querySelectorAll('.bet-btn');
    betBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var st = FTX.Engine.getState();
        if (!st || st.phase !== 'IDLE' || isBusy) return;
        var mult = Number(this.dataset.bet);
        FTX.Engine.setBetMultiplier(mult);
        if (FTX.Audio) FTX.Audio.playUiClick();
        showToast(mult === 1 ? '切回稳健 ×1 倍率' : ('🔥 开启加注 ×' + mult + '！本刻收支同乘 ' + mult + ' 倍！'));
        syncBoardTiles(FTX.Engine.getState());
        syncHUD(FTX.Engine.getState());
      });
    });

    // 6. 即换即融、过圈置业、政见刷新与结算重开
    $('btn-equip-sell').addEventListener('click', function () { handleEquipDecision('sell'); });
    $('btn-equip-wear').addEventListener('click', function () { handleEquipDecision('equip'); });
    $('btn-uncle-auto').addEventListener('click', handleUncleAutoEstate);
    $('btn-finish-estate').addEventListener('click', handleFinishEstate);

    $('btn-refresh-policy').addEventListener('click', function () {
      if (!FTX.Engine.refreshPolicies) return;
      var r = FTX.Engine.refreshPolicies();
      if (r && r.ok) {
        if (FTX.Audio) FTX.Audio.playUiClick();
        var ns = FTX.Engine.getState();
        syncHUD(ns);
        renderPolicyChoices(ns);
      } else if (r && r.message) {
        showToast(r.message);
      }
    });

    $('btn-retry-boss').addEventListener('click', function () {
      if (!FTX.Engine.retryBossWithStick) return;
      $('modal-gameover').classList.remove('active');
      $('modal-gameover').classList.add('hidden');
      var curSt = FTX.Engine.getState();
      var allCardIds = (curSt.player.combatCards || []).map(function (c) { return c.instanceId || c.id; });
      var report = FTX.Engine.retryBossWithStick({ combatCardIds: allCardIds, cheerHits: 5 });
      lastFinaleReport = report;
      isBusy = true;
      setStageMode('finale');
      playThreeStageBossAnimation(report, true);
    });

    $('btn-restart-game').addEventListener('click', function () {
      if (FTX.Audio) FTX.Audio.playUiClick();
      $('modal-gameover').classList.remove('active');
      $('modal-gameover').classList.add('hidden');
      $('modal-start').classList.remove('hidden');
      $('modal-start').classList.add('active');
    });
  }

  function startNewMatch() {
    autoRollEnabled = false;
    isBusy = false;
    displayedSilver = null;
    lastFinaleReport = null;
    finaleCheerMode = false;
    clearAutoRollTimer();
    clearDuelTimer();

    $('modal-start').classList.remove('active');
    $('modal-start').classList.add('hidden');
    $('modal-gameover').classList.remove('active');
    $('modal-gameover').classList.add('hidden');

    var st = FTX.Engine.newGame({
      lordId: startConfig.lordId,
      vanguardId: startConfig.vanguardId,
      maxLoops: startConfig.maxLoops,
      specialMode: startConfig.specialMode
    });

    var lordCfg = FTX.DATA.LORDS[st.player.lordId] || FTX.DATA.LORDS.liubei;
    setTicker(lordCfg.name + '：「' + lordCfg.quotes.start + '」');
    if ($('ui-dice-banner')) $('ui-dice-banner').classList.add('hidden');
    if ($('ui-bowl-sum')) $('ui-bowl-sum').textContent = '待掷骰 · 7点最高频';

    resizeCanvas();
    routeByEnginePhase();
  }

  function initUI() {
    if (!FTX.DATA || !FTX.Engine) return;
    buildBoardDOM();
    bindEventsOnce();
    resizeCanvas();

    // 预初始化一局默认盘面在背景展示，使开局弹窗背后也是鲜活的 3D 沙盘棋盘！
    FTX.Engine.newGame({
      lordId: startConfig.lordId,
      vanguardId: startConfig.vanguardId,
      maxLoops: startConfig.maxLoops,
      specialMode: startConfig.specialMode
    });
    var st = FTX.Engine.getState();
    syncBoardTiles(st);
    syncPiecesPositions(st);
    syncHUD(st);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  FTX.UI = {
    init: initUI,
    startNewMatch: startNewMatch,
    refresh: routeByEnginePhase,
    getDebugState: function () {
      return {
        isPageHidden: isPageHidden,
        isBusy: isBusy,
        autoRollEnabled: autoRollEnabled,
        rafActive: rafId !== null,
        autoRollTimerActive: autoRollTimer !== null,
        duelTimerActive: duelInterval !== null
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
