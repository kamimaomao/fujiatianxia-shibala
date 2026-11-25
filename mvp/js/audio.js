/**
 * 《富甲天下：十八啦！》纯 WebAudio API 程序化台味合成音效引擎
 * - 零外部音频文件，100% 兼容 file:// 直接打开与 Node 无头测试环境
 * - 严守 /Users/kamisola/.codex/AGENTS.md 后台休眠铁律：
 *   提供 setHidden(isHidden) 并内置单次 visibilitychange 守护，页面隐藏立即挂起 AudioContext 并清理全部定时器！
 */
(function (root) {
  'use strict';

  var FTX = (root.FTX = root.FTX || {});

  var ctx = null;
  var masterGain = null;
  var noiseBuffer = null;

  var muted = false;
  var bgmEnabled = false;
  var pageHidden = false;
  var userUnlocked = false;
  var visibilityBound = false;

  var bgmTimer = null;
  var bgmStep = 0;
  var pendingTimers = [];

  // 台湾庙会夜市五声欢快小调音符（C5 D5 E5 G5 A5 C6）
  var PENTATONIC_MELODY = [
    523.25, 587.33, 659.25, 783.99,
    880.00, 783.99, 659.25, 587.33,
    523.25, 659.25, 783.99, 1046.50,
    880.00, 783.99, 659.25, 0
  ];

  function hasWebAudio() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  function clearPendingTimers() {
    while (pendingTimers.length > 0) {
      var id = pendingTimers.pop();
      clearTimeout(id);
    }
  }

  function scheduleTask(fn, delayMs) {
    if (pageHidden || muted) return;
    if (delayMs <= 0) {
      fn();
      return;
    }
    var tid = setTimeout(function () {
      var idx = pendingTimers.indexOf(tid);
      if (idx >= 0) pendingTimers.splice(idx, 1);
      if (!pageHidden && !muted) fn();
    }, delayMs);
    pendingTimers.push(tid);
  }

  function ensureContext() {
    if (!hasWebAudio() || pageHidden) return null;
    if (!ctx) {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 0.65;
        masterGain.connect(ctx.destination);
        buildNoiseBuffer();
      } catch (e) {
        ctx = null;
      }
    }
    return ctx;
  }

  function buildNoiseBuffer() {
    if (!ctx) return;
    var sampleRate = ctx.sampleRate || 44100;
    var length = Math.floor(sampleRate * 1.0);
    noiseBuffer = ctx.createBuffer(1, length, sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  function unlock() {
    userUnlocked = true;
    var c = ensureContext();
    if (c && c.state === 'suspended' && !pageHidden && !muted) {
      c.resume().catch(function () {});
    }
    if (bgmEnabled && !pageHidden && !muted) {
      startBgmLoop();
    }
  }

  function canPlay() {
    if (muted || pageHidden || !hasWebAudio()) return false;
    var c = ensureContext();
    if (!c) return false;
    if (c.state === 'suspended' && userUnlocked) {
      c.resume().catch(function () {});
    }
    return c.state === 'running' || userUnlocked;
  }

  // 基础单音合成器
  function playTone(freqStart, freqEnd, duration, type, volume, delaySec) {
    if (!canPlay() || !ctx || !masterGain) return;
    var now = ctx.currentTime + (delaySec || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    var vol = Math.min(1, Math.max(0.001, volume || 0.25));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(vol, now + Math.min(0.012, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // 滤波白噪脉冲合成（用于陶碗碰撞、木折凳闷响、火炮爆炸）
  function playNoiseBurst(duration, filterType, cutoffFreq, qVal, volume, delaySec) {
    if (!canPlay() || !ctx || !masterGain || !noiseBuffer) return;
    var now = ctx.currentTime + (delaySec || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    var filter = ctx.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(cutoffFreq || 1200, now);
    filter.Q.setValueAtTime(qVal || 2.0, now);

    var g = ctx.createGain();
    var vol = Math.min(1, Math.max(0.001, volume || 0.25));
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  // 1. 陶碗掷双骰清脆碰撞滚落声
  function playDiceRoll() {
    userUnlocked = true;
    if (!canPlay()) return;
    var hits = [0, 0.055, 0.115, 0.185, 0.265, 0.36, 0.47];
    for (var i = 0; i < hits.length; i++) {
      var t = hits[i];
      var baseFreq = 1350 + (i % 3) * 260 + Math.random() * 180;
      var amp = 0.26 * (1 - i * 0.09);
      // 陶瓷碗高频清脆叮当 + 骨骰碰撞短噪
      playTone(baseFreq, baseFreq * 0.88, 0.045, 'triangle', amp, t);
      playTone(baseFreq * 1.62, baseFreq * 1.5, 0.032, 'sine', amp * 0.65, t + 0.004);
      playNoiseBurst(0.028, 'bandpass', 2400, 4.5, amp * 0.5, t);
    }
  }

  // 2. 木棋盘啪嗒跳格声
  function playStep(stepIdx) {
    if (!canPlay()) return;
    var idx = typeof stepIdx === 'number' ? stepIdx : 0;
    var pitchMult = 1 + Math.min(idx, 12) * 0.035;
    playTone(230 * pitchMult, 95 * pitchMult, 0.055, 'triangle', 0.28, 0);
    playNoiseBurst(0.022, 'bandpass', 950 * pitchMult, 3.0, 0.16, 0);
  }

  // 3. 铜钱落袋叮当声
  function playCoin(isBig) {
    if (!canPlay()) return;
    if (isBig) {
      var notes = [1046.5, 1318.5, 1568.0, 2093.0, 2637.0];
      for (var i = 0; i < notes.length; i++) {
        playTone(notes[i], notes[i] * 1.01, 0.16, 'sine', 0.22, i * 0.055);
        playTone(notes[i] * 2, notes[i] * 2, 0.09, 'triangle', 0.08, i * 0.055 + 0.01);
      }
    } else {
      playTone(1318.5, 1318.5, 0.09, 'sine', 0.22, 0);
      playTone(1975.5, 1975.5, 0.16, 'sine', 0.24, 0.055);
    }
  }

  // 4. 「十八啦 / 欢喜对」喜庆铜锣声
  function playGong(isShibala) {
    if (!canPlay()) return;
    // 非谐波泛音群模拟传统大铜锣共振
    var partials = [196, 249, 311, 418, 542, 688];
    var dur = isShibala ? 1.15 : 0.65;
    for (var i = 0; i < partials.length; i++) {
      playTone(
        partials[i],
        partials[i] * (i % 2 === 0 ? 0.96 : 1.03),
        dur * (1 - i * 0.08),
        i === 0 ? 'triangle' : 'sine',
        (isShibala ? 0.22 : 0.16) / (1 + i * 0.35),
        0
      );
    }
    playNoiseBurst(isShibala ? 0.55 : 0.32, 'bandpass', 1850, 1.4, isShibala ? 0.24 : 0.15, 0.01);

    if (isShibala) {
      // 十八啦加奏喜庆庙会唢呐风上行欢呼音
      var fanfare = [587.33, 659.25, 783.99, 1046.5];
      for (var j = 0; j < fanfare.length; j++) {
        playTone(fanfare[j], fanfare[j] * 1.02, 0.14, 'sawtooth', 0.11, 0.12 + j * 0.085);
      }
    }
  }

  // 5. 木马弹簧吱呀、折凳闷响、摇扇口斗、放水摔马声
  function playDuelHit(type) {
    if (!canPlay()) return;
    var mode = type || 'stool';
    if (mode === 'spring') {
      // 弹簧摇摇木马吱呀连弹音
      playTone(210, 440, 0.09, 'triangle', 0.20, 0);
      playTone(440, 240, 0.09, 'triangle', 0.18, 0.09);
      playTone(250, 490, 0.10, 'sine', 0.16, 0.18);
    } else if (mode === 'fan') {
      // 羽扇破风口斗声
      playNoiseBurst(0.09, 'highpass', 1600, 1.2, 0.18, 0);
      playTone(660, 880, 0.08, 'sine', 0.15, 0.03);
    } else if (mode === 'slip') {
      // 放水摔下木马：经典卡通踩香蕉皮下滑 + 扑通着地
      playTone(780, 130, 0.28, 'sawtooth', 0.18, 0);
      playTone(125, 42, 0.18, 'sine', 0.32, 0.26);
      playNoiseBurst(0.14, 'lowpass', 480, 1.5, 0.25, 0.26);
    } else {
      // 默认折凳拍脸厚重木板闷响
      playTone(155, 46, 0.14, 'triangle', 0.34, 0);
      playNoiseBurst(0.085, 'bandpass', 620, 1.8, 0.30, 0);
    }
  }

  // 6. 交过路费肉痛惨叫下滑音
  function playTollCry() {
    if (!canPlay()) return;
    playTone(440, 330, 0.16, 'sawtooth', 0.14, 0);
    playTone(320, 220, 0.18, 'sawtooth', 0.14, 0.16);
    playTone(215, 125, 0.28, 'sawtooth', 0.16, 0.34);
  }

  // 7. 攻城 / 决战万炮齐发火炮重低音轰鸣声
  function playCannon(isHeavy) {
    if (!canPlay()) return;
    var dur = isHeavy ? 0.52 : 0.34;
    playTone(110, 28, dur, 'sine', isHeavy ? 0.40 : 0.30, 0);
    playTone(75, 24, dur * 0.9, 'triangle', isHeavy ? 0.28 : 0.20, 0.01);
    playNoiseBurst(dur * 0.85, 'lowpass', isHeavy ? 420 : 560, 0.9, isHeavy ? 0.34 : 0.24, 0);
  }

  // 8. 盖楼敲印章、政见「冻蒜」欢呼与 UI 按键声
  function playUpgrade() {
    if (!canPlay()) return;
    playTone(160, 68, 0.09, 'triangle', 0.28, 0);
    playTone(523.25, 659.25, 0.12, 'sine', 0.20, 0.07);
    playTone(783.99, 1046.5, 0.16, 'sine', 0.22, 0.15);
  }

  function playDongSuan() {
    if (!canPlay()) return;
    // 「冻—蒜！」两声铿锵有力的庙会造势和弦
    playTone(392.0, 392.0, 0.14, 'triangle', 0.24, 0);
    playTone(587.33, 587.33, 0.14, 'sine', 0.20, 0);
    playTone(523.25, 523.25, 0.26, 'triangle', 0.28, 0.18);
    playTone(783.99, 783.99, 0.26, 'sine', 0.24, 0.18);
    playTone(1046.5, 1046.5, 0.28, 'sine', 0.18, 0.18);
  }

  function playUiClick() {
    userUnlocked = true;
    if (!canPlay()) return;
    playTone(540, 360, 0.035, 'sine', 0.15, 0);
  }

  // 9. 可选开关的五声音阶庙会小调节拍器（严格受后台休眠管理）
  function stopBgmLoop() {
    if (bgmTimer !== null) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function startBgmLoop() {
    stopBgmLoop();
    if (!bgmEnabled || muted || pageHidden || !userUnlocked || !hasWebAudio()) return;
    bgmTimer = setInterval(function () {
      if (!bgmEnabled || muted || pageHidden) {
        stopBgmLoop();
        return;
      }
      var freq = PENTATONIC_MELODY[bgmStep % PENTATONIC_MELODY.length];
      // 轻柔木鱼节拍
      if (bgmStep % 2 === 0) {
        playTone(190, 95, 0.035, 'triangle', 0.045, 0);
      }
      if (freq > 0) {
        playTone(freq, freq, 0.14, 'sine', 0.055, 0);
      }
      bgmStep = (bgmStep + 1) % PENTATONIC_MELODY.length;
    }, 260);
  }

  function setMuted(flag) {
    muted = Boolean(flag);
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.65, ctx.currentTime);
    }
    if (muted) {
      stopBgmLoop();
      clearPendingTimers();
    } else if (bgmEnabled && !pageHidden && userUnlocked) {
      startBgmLoop();
    }
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function setBgmEnabled(flag) {
    bgmEnabled = Boolean(flag);
    if (bgmEnabled) {
      userUnlocked = true;
      ensureContext();
      startBgmLoop();
    } else {
      stopBgmLoop();
    }
    return bgmEnabled;
  }

  function toggleBgm() {
    return setBgmEnabled(!bgmEnabled);
  }

  /**
   * 严守 /Users/kamisola/.codex/AGENTS.md：
   * 页面隐藏时立即停止定时器、清除待播队列并调用 AudioContext.suspend()；
   * 恢复可见时仅在用户已交互且未静音时恢复，绝不重复建循环！
   */
  function setHidden(isHidden) {
    var nextHidden = Boolean(isHidden);
    if (pageHidden === nextHidden) return;
    pageHidden = nextHidden;

    if (pageHidden) {
      stopBgmLoop();
      clearPendingTimers();
      if (ctx && ctx.state === 'running') {
        ctx.suspend().catch(function () {});
      }
    } else {
      if (ctx && ctx.state === 'suspended' && userUnlocked && !muted) {
        ctx.resume().catch(function () {});
      }
      if (bgmEnabled && userUnlocked && !muted) {
        startBgmLoop();
      }
    }
  }

  function init() {
    if (typeof document !== 'undefined' && !visibilityBound) {
      visibilityBound = true;
      pageHidden = Boolean(document.hidden);
      document.addEventListener('visibilitychange', function () {
        setHidden(Boolean(document.hidden));
      });
    }
    return FTX.Audio;
  }

  // 模块加载时自动初始化一次监听（幂等防重绑）
  init();

  FTX.Audio = {
    init: init,
    unlock: unlock,
    setHidden: setHidden,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    setBgmEnabled: setBgmEnabled,
    toggleBgm: toggleBgm,
    isBgmEnabled: function () { return bgmEnabled; },
    playDiceRoll: playDiceRoll,
    playStep: playStep,
    playCoin: playCoin,
    playGong: playGong,
    playDuelHit: playDuelHit,
    playTollCry: playTollCry,
    playCannon: playCannon,
    playUpgrade: playUpgrade,
    playDongSuan: playDongSuan,
    playUiClick: playUiClick
  };
})(typeof window !== 'undefined' ? window : globalThis);
