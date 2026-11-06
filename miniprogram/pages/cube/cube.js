// pages/cube/cube.js - 3D 魔方
var C = require("../../utils/cube.js");
var R = require("../../utils/cubeRender.js");
var solver = require("../../utils/cubeSolver.js");

var TUTORIAL_KEY = "cube_tutorial_on";
var TURN_MODE_KEY = "cube_turn_mode";
var GUIDE_MODE_KEY = "cube_guide_mode";

var CUBE_TYPES = [
  { key: "2x2", label: "2 阶", n: 2, mirror: false, scramble: 14 },
  { key: "3x3", label: "3 阶", n: 3, mirror: false, scramble: 25 },
  { key: "4x4", label: "4 阶", n: 4, mirror: false, scramble: 30 },
  { key: "5x5", label: "5 阶", n: 5, mirror: false, scramble: 40 },
  { key: "mirror", label: "镜面", n: 3, mirror: true, scramble: 25 },
];

// 每一步阶段的教学说明（教程开关打开时展示）
var STAGE_GUIDE = {
  0: {
    goal: "在白色那一面拼出一个「十」字，并且十字的 4 条边颜色与侧面中心一致。",
    look: "先找 4 个带白色的棱块（两个颜色的小块）。把它们转到顶层，白色朝上，像一个白色花心。",
    how: "花心的每一条白棱，转动顶层让它侧面颜色对齐同色中心，再把那一面转 180° 落到底层。",
    check: "白色面朝下看是十字，四个侧面第一行中间都与中心同色。",
  },
  1: {
    goal: "把 4 个白色角块放进底层，整个第一层（含侧面一整圈）颜色一致。",
    look: "找 4 个带白色的角块。把它转到目标位置的正上方（底层该角位的正上方）。",
    how: "白色朝侧面：用对应侧面的三下公式（如 R U R'）。白色朝上：用插入公式重复三次。",
    check: "白色面完整，侧面第一层一圈颜色都与中心一致。",
  },
  2: {
    goal: "把中间层 4 个棱块归位，下面两层全部完成。",
    look: "在顶层找一个不带黄色的棱块，把它的侧面颜色对齐同色中心，看它要落到左边还是右边。",
    how: "要落右边用「U R U' R' U' F' U F」；要落左边用对称公式。已经在中层但位置错，先用同公式挤出来。",
    check: "下面两层每一面都是两行同色。",
  },
  3: {
    goal: "顶层 4 个棱块的黄色全部朝上，形成黄色十字。",
    look: "只看顶层的黄色棱块形状：只有中心=点，两个黄棱相邻=L，两个黄棱相对=一字。",
    how: "一字：F R U R' U' F'。L 形：F U R U' R' F'。点：先做一次一字公式转成一字或 L。",
    check: "顶面出现完整的黄色十字（侧面颜色此时还不一定对）。",
  },
  4: {
    goal: "顶层 4 个角块的黄色全部朝上，整个顶面变成纯黄色。",
    look: "看顶面黄色块组成的图案，找「鱼头」（单独一个黄色角块的方向）。",
    how: "把鱼头摆到左下角，执行小鱼公式 R U R' U R U2 R'。不是鱼形就先用小鱼公式转成鱼形。",
    check: "顶面整面都是黄色。",
  },
  5: {
    goal: "顶层 4 个角块回到正确位置（顶面已经是黄色，只需换位置）。",
    look: "沿顶层一圈找「两侧颜色都与下面两层对齐」的角块。",
    how: "找到已对好的角块，把它放在右前，执行 R B' R F2 R' B R F2 R2 做三角换。",
    check: "4 个角块都在正确位置，只剩 4 个棱块可能错位。",
  },
  6: {
    goal: "顶层 4 个棱块归位，魔方完全复原。",
    look: "找一个「侧面颜色已经与中心对齐」的棱块，把它放在后面。",
    how: "执行三棱换 R U' R U R U R U' R' U' R2，直到全部归位。",
    check: "六面颜色统一，恭喜复原！",
  },
};

var HELP_TEXT = [
  {
    title: "手指怎么转",
    body:
      "按住魔方的某个贴纸拖动，那一块会跟着手指一起转，松手自动吸附到整格。\n" +
      "从魔方外的空白处拖动是转视角，可以看背面。\n" +
      "想转中间那一层，把「转法」切到「单层」，按住那一行/列拖动即可。\n" +
      "中间层转了以后，教程会自动把魔方「换个握法」摆正，步骤照常继续。",
  },
  {
    title: "公式字母怎么看",
    body:
      "U 上层 / D 下层 / F 前面 / B 后面 / R 右面 / L 左面。\n" +
      "字母是「正对着这一面看」的顺时针；加 ' 是逆时针，加 2 是转 180°。\n" +
      "例如 R' 就是右面逆时针，U2 就是上层转两下。\n" +
      "教程默认把黄色中心朝上、绿色中心朝前，和公式一一对应。",
  },
  {
    title: "七步复原法",
    body:
      "1 底层白十字 → 2 底层角块 → 3 中层棱块 → 4 顶层黄十字 →\n" +
      "5 顶层角块朝向 → 6 顶层角块归位 → 7 顶层棱块归位。\n" +
      "顺序不能乱：前一步完成的结构，后面每一步都会保持不动。\n" +
      "记住这个顺序，你就有了复原任意魔方的路线图。",
  },
  {
    title: "怎么才算学会了",
    body:
      "第一遍用「跟着做」，点按钮让系统帮你完成每一步，重点是看清每一步是什么样子。\n" +
      "第二遍换成「我自己转」，自己按公式拧，拧完点「我转好了」，系统会检查这一阶段有没有成功。\n" +
      "反复几次，你会发现自己不再需要看公式，只要顺着七步走就能复原。",
  },
];

function readStorage(key, fallback) {
  try {
    var v = wx.getStorageSync(key);
    if (v === "" || v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {}
}

// 标准记号取逆：R → R'，R' → R，R2 → R2
function invertToken(token) {
  if (!token) return token;
  if (token.charAt(token.length - 1) === "2") return token;
  if (token.charAt(token.length - 1) === "'") return token.slice(0, -1);
  return token + "'";
}

Page({
  data: {
    types: CUBE_TYPES.map(function (t) { return { key: t.key, label: t.label }; }),
    typeIndex: 1,
    turnMode: "face",
    guideMode: "auto",
    solved: true,
    tutorialOn: true,
    tutorialSupported: true,
    showHelp: false,
    helpSections: HELP_TEXT,
    mirrorTip: "",

    // 教程状态
    tutorialReady: false,
    tutorialError: "",
    planSteps: [],
    stageChips: [],
    stepIndex: 0,
    currentStep: null,
    currentGuide: null,
    stepTokens: [],
    totalSteps: 0,
    tutorialDone: false,
    busy: false,
    scrambling: false,
    resetting: false,
    showGuide: false,
  },

  // ========== 生命周期 ==========
  onLoad: function () {
    var tutorialOn = !!readStorage(TUTORIAL_KEY, true);
    var turnMode = readStorage(TURN_MODE_KEY, "face");
    if (turnMode !== "face" && turnMode !== "slice") turnMode = "face";
    var guideMode = readStorage(GUIDE_MODE_KEY, "auto");
    if (guideMode !== "auto" && guideMode !== "manual") guideMode = "auto";

    this._alive = true;
    this._r = null;
    this._canvas = null;
    this._canvasRect = null;
    this._history = [];
    this._animating = false;
    this._touch = null;
    this._rebuildTimer = null;
    this._seq = null; // 正在播放的连转序列（打乱 / 复位）
    this._seqId = 0;

    this.setData({
      tutorialOn: tutorialOn,
      turnMode: turnMode,
      guideMode: guideMode,
    });
    this._createCube(1);
  },

  onReady: function () {
    this._initCanvas();
  },

  onShow: function () {
    this._alive = true;
    if (this._r) this._draw();
  },

  onHide: function () {
    // 切后台时把没播完的打乱/复位立刻结算，回来不会卡在半转的动画里
    this._cancelSequence(true);
    this._abortLiveTurn();
    if (this._r) this._r.anim = null;
    this._animating = false;
  },

  onUnload: function () {
    this._alive = false;
    this._clearRebuildTimer();
    this._seq = null;
    this._seqId++;
    if (this._r) this._r.anim = null;
  },

  _clearRebuildTimer: function () {
    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = null;
    }
  },

  // ========== 初始化 ==========
  _createCube: function (typeIndex) {
    var t = CUBE_TYPES[typeIndex];
    this._cancelSequence(false);
    this.cube = C.createCube(t.n, { mirror: t.mirror });
    this._history = [];
    this._clearRebuildTimer();
    this.setData({
      typeIndex: typeIndex,
      solved: true,
      tutorialDone: false,
      tutorialReady: false,
      tutorialError: "",
      planSteps: [],
      stageChips: [],
      currentStep: null,
      currentGuide: null,
      stepTokens: [],
      stepIndex: 0,
      totalSteps: 0,
      tutorialSupported: t.n === 3,
      showGuide: false,
      busy: false,
      scrambling: false,
      resetting: false,
      mirrorTip: t.mirror ? "镜面魔方：所有贴纸同色，靠小方块的长短判断位置。" : "",
    });
    if (this._r) {
      this._r.highlight = null;
      this._r.setCube(this.cube);
      this._r.monochrome = !!this.cube.mirror;
      this._draw();
    }
  },

  _initCanvas: function () {
    var self = this;
    if (this._canvas) return;
    wx.createSelectorQuery()
      .in(this)
      .select("#cubeCanvas")
      .fields({ node: true, size: true, rect: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        var info = res[0];
        var canvas = info.node;
        var width = info.width;
        var height = info.height;
        var dpr = 2;
        try {
          dpr = wx.getWindowInfo
            ? wx.getWindowInfo().pixelRatio
            : wx.getSystemInfoSync().pixelRatio;
        } catch (e) {}

        self._canvas = canvas;
        self._canvasRect = { left: info.left || 0, top: info.top || 0 };
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        self._r = new R.Renderer({
          canvas: canvas,
          width: width,
          height: height,
          dpr: dpr,
          n: self.cube.n,
        });
        self._r.setCube(self.cube);
        self._r.monochrome = !!self.cube.mirror;
        self._draw();
      });
  },

  _raf: function (fn) {
    if (this._canvas && this._canvas.requestAnimationFrame) {
      this._canvas.requestAnimationFrame(fn);
    } else {
      setTimeout(fn, 16);
    }
  },

  _draw: function () {
    if (!this._r) return;
    this._r.monochrome = !!this.cube.mirror;
    this._r.draw();
  },

  // ========== 转动 ==========
  // animate = false 时立即生效，仅用于「用户看不到的」内部状态推进
  // opts.gen：所属动画序列的编号；序列被取消后旧帧会自行退出，不会继续改魔方
  _applyMove: function (move, duration, cb, opts) {
    var self = this;
    var r = this._r;
    opts = opts || {};
    var gen = opts.gen;

    function stale() {
      return gen !== undefined && gen !== self._seqId;
    }

    if (!r || opts.animate === false) {
      C.applyMove(this.cube, move);
      if (!opts.noHistory) this._pushHistory(move);
      if (r) {
        r.anim = null;
        r.setCube(this.cube);
        this._draw();
      }
      if (!opts.quiet) this._afterMove();
      if (cb) cb();
      return;
    }
    duration = duration || 140;
    var axisVec = [0, 0, 0];
    axisVec[move.axis] = 1;
    var turns = move.double ? 2 : 1;
    var target = (turns * Math.PI) / 2 * (move.dir > 0 ? 1 : -1);

    var myAnim = { axis: move.axis, axisVec: axisVec, angle: 0, layers: [move.layer] };
    r.anim = myAnim;
    var start = Date.now();
    this._animating = true;

    function frame() {
      if (!self._alive) {
        if (r.anim === myAnim) r.anim = null;
        if (r.anim === null) self._animating = false;
        return;
      }
      // 序列已被取消：直接放弃这一帧，剩余转动交给 _cancelSequence 结算
      if (stale()) {
        if (r.anim === myAnim) r.anim = null;
        return;
      }
      var t = Math.min(1, (Date.now() - start) / duration);
      var e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      if (r.anim === myAnim) myAnim.angle = target * e;
      self._draw();
      if (t < 1) {
        self._raf(frame);
      } else {
        if (r.anim === myAnim) r.anim = null;
        C.applyMove(self.cube, move);
        r.setCube(self.cube);
        self._draw();
        if (!opts.noHistory) self._pushHistory(move);
        self._animating = false;
        // 打乱/复位这种连转过程中不逐次刷新状态和提示
        if (!opts.quiet) self._afterMove();
        if (cb) cb();
      }
    }
    frame();
  },

  // 依次播放一串转动（打乱 / 复位用）。
  // 被打断时可通过 _cancelSequence(true) 立刻结算剩余部分。
  _runMoves: function (moves, duration, done, opts) {
    var self = this;
    opts = opts || {};
    var seq = {
      moves: moves,
      i: 0,
      dur: duration,
      done: done,
      opts: opts,
      gen: ++this._seqId,
      inflight: false,
    };
    this._seq = seq;

    function next() {
      if (self._seq !== seq) return; // 已被新序列或取消顶掉
      if (!self._alive) return;
      if (seq.i >= moves.length) {
        seq.inflight = false;
        self._seq = null;
        if (done) done();
        return;
      }
      seq.inflight = true;
      var mv = moves[seq.i++];
      var o = { gen: seq.gen, quiet: !!opts.quiet, noHistory: !!opts.noHistory };
      self._applyMove(mv, seq.dur, next, o);
    }
    next();
  },

  // finish = true 时把没播完的转动立即算到魔方上（切后台时用），
  // 保证回来看到的是一个完整状态，而不是卡在半转的动画里。
  _cancelSequence: function (finish) {
    var seq = this._seq;
    if (!seq) return;
    this._seq = null;
    this._seqId++;
    if (this._r) this._r.anim = null;
    this._animating = false;
    if (!finish) return;

    // inflight 的那一步还没写进 this.cube，需要一起补上
    var start = seq.inflight ? seq.i - 1 : seq.i;
    for (var i = start; i < seq.moves.length; i++) {
      C.applyMove(this.cube, seq.moves[i]);
      if (!seq.opts.noHistory) this._pushHistory(seq.moves[i]);
    }
    if (this._r) {
      this._r.setCube(this.cube);
      this._draw();
    }
    if (seq.done) seq.done();
  },

  _pushHistory: function (move) {
    if (!move) return;
    this._history.push(move);
    if (this._history.length > 400) this._history.shift();
  },

  // 把魔方状态倒回到第 target 步之前（undoCount 步）
  _undoSteps: function (undoCount, cb) {
    var self = this;
    var times = Math.min(undoCount, this._history.length);
    if (!times) {
      if (cb) cb();
      return;
    }
    var moves = [];
    for (var i = 0; i < times; i++) moves.push(this._history.pop());
    // 逐条倒放：最后一步最先撤销
    var i2 = moves.length - 1;
    function next() {
      if (!self._alive) return;
      if (i2 < 0) {
        if (cb) cb();
        return;
      }
      var mv = moves[i2--];
      // 撤销产生的转动不再写进历史，否则会无限增长
      self._applyMove(
        { axis: mv.axis, layer: mv.layer, dir: -mv.dir, double: !!mv.double },
        90,
        next,
        { noHistory: true }
      );
    }
    next();
  },

  _afterMove: function () {
    var solved = C.isSolved(this.cube);
    if (solved !== this.data.solved) {
      this.setData({ solved: solved });
      if (solved) {
        wx.showToast({ title: "复原啦 🎉", icon: "none" });
        if (this.data.tutorialOn) {
          this._clearHighlight();
          this.setData({
            tutorialDone: true,
            tutorialReady: false,
            currentStep: null,
            currentGuide: null,
            stepTokens: [],
          });
        }
      }
    }
  },

  runAlg: function (alg, cb) {
    var self = this;
    var tokens = alg ? String(alg).split(/\s+/).filter(Boolean) : [];
    var i = 0;
    function next() {
      if (!self._alive) return;
      if (i >= tokens.length) {
        if (cb) cb();
        return;
      }
      var mv = C.parseMove(tokens[i++], self.cube.n);
      if (!mv) {
        next();
        return;
      }
      self._applyMove(mv, 110, next);
    }
    next();
  },

  // ========== 触摸手势 ==========
  _touchPoint: function (t) {
    // 小程序 canvas 的 CanvasTouch 自带相对画布的 x/y；兜底用 clientX 减画布偏移
    if (typeof t.x === "number" && typeof t.y === "number") {
      return { x: t.x, y: t.y };
    }
    var rect = this._canvasRect || { left: 0, top: 0 };
    return { x: (t.clientX || 0) - rect.left, y: (t.clientY || 0) - rect.top };
  },

  onTouchStart: function (e) {
    if (this._animating || this.data.busy || !this._r) return;
    var t = e.touches && e.touches[0];
    if (!t) return;
    var p = this._touchPoint(t);
    var face = this._r.pick(p.x, p.y);
    this._touch = {
      startX: p.x,
      startY: p.y,
      lastX: p.x,
      lastY: p.y,
      face: face,
      mode: null,
      // 拖动中实时跟手用
      turn: null,
      angle: 0,
      grabbed: false,
    };
  },

  onTouchMove: function (e) {
    var tc = this._touch;
    if (!tc || !this._r) return;
    var t = e.touches && e.touches[0];
    if (!t) return;
    var p = this._touchPoint(t);
    var dx0 = p.x - tc.startX;
    var dy0 = p.y - tc.startY;

    if (!tc.mode) {
      if (Math.abs(dx0) < 10 && Math.abs(dy0) < 10) return;
      if (tc.face) {
        tc.mode = "turn";
        this._startLiveTurn(tc, dx0, dy0);
      } else {
        tc.mode = "view";
      }
    }

    if (tc.mode === "turn") {
      this._updateLiveTurn(tc, dx0, dy0);
      return;
    }

    if (tc.mode === "view") {
      var r = this._r;
      r.yaw += (p.x - tc.lastX) * 0.011;
      r.pitch += (p.y - tc.lastY) * 0.011;
      if (r.pitch > 1.35) r.pitch = 1.35;
      if (r.pitch < -1.35) r.pitch = -1.35;
      tc.lastX = p.x;
      tc.lastY = p.y;
      this._draw();
    }
  },

  // ---------- 跟手转层 ----------
  // 真魔方是「手指带多少，层就转多少」，松手前一直跟着走；
  // 这里同样用 r.anim 把这一层实时画到当前角度，松手再吸附到最近的 90°。
  _startLiveTurn: function (tc, dx, dy) {
    var r = this._r;
    // 第一次真正开始拖动时，用「起手方向」定下转轴 / 层 / 方向，
    // 之后整个拖动过程都跟这一条轴走（手指再转弯也不换轴，和真魔方一致）
    var t = r.inferTurn(tc.face, { x: tc.startX, y: tc.startY }, { x: dx, y: dy }, this.data.turnMode);
    if (!t) {
      // 退化点：按起手方向转一格
      this._doTurn(tc.face, { x: tc.startX, y: tc.startY }, { x: dx, y: dy });
      tc.mode = "done";
      return;
    }
    tc.turn = t;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    t.ux = dx / len;
    t.uy = dy / len;

    var k = r.turnPxPerRad(tc.face, { x: tc.startX, y: tc.startY }, t);
    if (k === null || k === 0) {
      this._doTurn(tc.face, { x: tc.startX, y: tc.startY }, { x: dx, y: dy });
      tc.mode = "done";
      return;
    }
    // k 是「抓点绕 turn 轴正方向转 1 弧度」时沿拖动方向的屏幕位移。
    // 它可能为负（抓点在转轴另一侧 / 转过斜视角），负号正是判断
    // 「该往哪边转」的依据，所以这里必须保留符号，不能取绝对值。
    // 另外这类点的投影速度可能极小，不设下限的话一点手指就会转过 180°，
    // 看起来就像「转反了」，所以给一个最小灵敏度。
    var MIN_PX_PER_RAD = 45;
    if (Math.abs(k) < MIN_PX_PER_RAD) {
      k = (k < 0 ? -1 : 1) * MIN_PX_PER_RAD;
    }
    tc.pxPerRad = k;
    var along = dx * t.ux + dy * t.uy;
    tc.offset = along;
    tc.angle = 0;
    this._animating = true; // 拖动期间锁住按钮，避免中途被打乱/复位打断
    this._liveAngle(tc, dx, dy);
  },

  // 拖动方向在屏幕上的单位向量 + 当前手指位移 → 该层转到哪个角度
  _liveAngle: function (tc, dx, dy) {
    var along = dx * tc.turn.ux + dy * tc.turn.uy - (tc.offset || 0);
    // pxPerRad 带符号，除以它得到的角度天然就是「让抓点跟手」的那个方向
    var raw = along / tc.pxPerRad;
    tc.angle = raw;
    var av = [0, 0, 0];
    av[tc.turn.axis] = 1;
    this._r.anim = {
      axis: tc.turn.axis,
      axisVec: av,
      angle: raw,
      layers: [tc.turn.layer],
    };
    this._draw();
  },

  _updateLiveTurn: function (tc, dx, dy) {
    if (tc.mode === "done") return;
    this._liveAngle(tc, dx, dy);
  },

  // 打断正在进行的跟手拖动：把已经转过的角度立即结算掉，避免卡在半转的姿势
  _abortLiveTurn: function () {
    var tc = this._touch;
    this._touch = null;
    if (!tc || tc.mode !== "turn" || tc.mode === "done" || !tc.turn) {
      // 只是点了魔方没拖动：把可能残留的拖动视角干掉
      if (this._r) this._r.anim = null;
      this._animating = false;
      if (this._r) this._draw();
      return;
    }
    this._settleTurn(tc);
  },

  onTouchEnd: function () {
    var tc = this._touch;
    this._touch = null;
    if (!tc || tc.mode !== "turn" || tc.mode === "done" || !tc.turn) return;
    this._settleTurn(tc);
  },

  // 松手：把当前角度吸附到最近的 90°，再一次性写进魔方状态
  _settleTurn: function (tc) {
    var r = this._r;
    if (!r) return;
    var t = tc.turn;
    var quarter = Math.round(tc.angle / (Math.PI / 2)); // 正方向格数
    if (quarter === 0) {
      r.anim = null;
      this._animating = false;
      this._draw();
      return;
    }
    // 转满 4 格的整数倍等于原地转，丢掉即可
    quarter = ((quarter % 4) + 4) % 4;
    if (quarter === 0) {
      r.anim = null;
      this._animating = false;
      this._draw();
      return;
    }
    // 3 格 = 反向 1 格，动作更短
    var steps = quarter;
    if (steps === 3) steps = -1;

    var self = this;
    var moves = [];
    var stepDir = steps > 0 ? 1 : -1;
    var count = Math.abs(steps);
    for (var i = 0; i < count; i++) {
      moves.push({ axis: t.axis, layer: t.layer, dir: stepDir, double: false });
    }

    // 吸附动画：从当前角度平滑补到目标角度（正方向）
    var startAngle = tc.angle;
    var endAngle = steps * (Math.PI / 2);
    var dur = 100;
    var began = Date.now();
    var myAnim = { axis: t.axis, axisVec: [0, 0, 0], angle: startAngle, layers: [t.layer] };
    myAnim.axisVec[t.axis] = 1;
    r.anim = myAnim;
    this._animating = true;

    function frame() {
      if (!self._alive) {
        if (r.anim === myAnim) r.anim = null;
        self._animating = false;
        return;
      }
      var k = Math.min(1, (Date.now() - began) / dur);
      var e = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k;
      if (r.anim === myAnim) myAnim.angle = startAngle + (endAngle - startAngle) * e;
      self._draw();
      if (k < 1) {
        self._raf(frame);
        return;
      }
      if (r.anim === myAnim) r.anim = null;
      for (var j = 0; j < moves.length; j++) {
        C.applyMove(self.cube, moves[j]);
        self._pushHistory(moves[j]);
      }
      r.setCube(self.cube);
      self._draw();
      self._animating = false;
      self._afterMove();
      try {
        wx.vibrateShort({ type: "light" });
      } catch (err) {}
      if (self.data.tutorialOn && self.data.tutorialReady) self._scheduleRebuild();
    }
    frame();
  },

  _doTurn: function (face, grab, drag) {
    var turn = this._r.inferTurn(face, grab, drag, this.data.turnMode);
    if (!turn) return;
    try {
      wx.vibrateShort({ type: "light" });
    } catch (err) {}
    var self = this;
    this._applyMove(
      { axis: turn.axis, layer: turn.layer, dir: turn.dir, double: false },
      130,
      function () {
        // 手动转动后，教程计划已失效：稍等片刻再重新规划，避免连续滑动时反复求解
        if (self.data.tutorialOn && self.data.tutorialReady) {
          self._scheduleRebuild();
        }
      }
    );
  },

  // ========== 顶部操作 ==========
  onSwitchType: function (e) {
    if (this._animating || this.data.busy) return;
    var index = Number(e.currentTarget.dataset.index);
    if (index === this.data.typeIndex) return;
    this._createCube(index);
    if (this.data.tutorialOn) this._buildTutorial(true);
  },

  onTurnMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.turnMode) return;
    this.setData({ turnMode: mode });
    writeStorage(TURN_MODE_KEY, mode);
  },

  onGuideMode: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.guideMode) return;
    this.setData({ guideMode: mode });
    writeStorage(GUIDE_MODE_KEY, mode);
  },

  onReset: function () {
    if (this._animating || this.data.busy) return;
    this._resetWithAnimation();
  },

  // 复位：逐个倒放历史转动，用户能看到魔方一步步回到复原态。
  _resetWithAnimation: function () {
    var self = this;
    var moves = this._history.slice();
    if (!moves.length) {
      if (C.isSolved(this.cube)) {
        wx.showToast({ title: "已经是复原状态", icon: "none" });
        return;
      }
      // 理论不会发生（有转动就一定有历史），兜底直接复位
      this._createCube(this.data.typeIndex);
      if (this.data.tutorialOn) this._buildTutorial(true);
      return;
    }

    this.setData({ busy: true, resetting: true });
    this._clearTutorial();

    // 倒放速度随步数自适应：总时长约 1.7s，步数很多时自动加快（仍逐层转，不瞬移）
    var dur = Math.round(Math.max(22, Math.min(130, 1700 / moves.length)));
    var seq = [];
    for (var i = moves.length - 1; i >= 0; i--) {
      var mv = moves[i];
      seq.push({ axis: mv.axis, layer: mv.layer, dir: -mv.dir, double: !!mv.double });
    }

    this._runMoves(seq, dur, function () {
      self._history = [];
      self.setData({ busy: false, resetting: false, solved: true });
      try {
        wx.vibrateShort({ type: "light" });
      } catch (err) {}
      wx.showToast({ title: "已复位", icon: "none" });
      if (self.data.tutorialOn) self._buildTutorial(true);
    }, { noHistory: true, quiet: true });
  },

  onScramble: function () {
    if (this._animating || this.data.busy) return;
    var t = CUBE_TYPES[this.data.typeIndex];
    var n = t.n;
    var opts = n % 2 === 1 ? { skipMiddle: true } : {};

    // 先在影子魔方上生成打乱序列（只产生序列，不动真魔方）
    var shadow = C.createCube(n, { mirror: t.mirror });
    var moves = C.scramble(shadow, t.scramble, opts);

    // 教程/计划先清空，避免转动过程中还在显示旧步骤
    this._clearTutorial();
    this._clearRebuildTimer();

    // 过渡：每转一步都写进历史，这样打乱后「复位」也能倒放回去
    var self = this;
    this.setData({ busy: true, scrambling: true, solved: false });
    try {
      wx.vibrateShort({ type: "medium" });
    } catch (err) {}

    // 每步时长随步数自适应：总时长约 1.7s，步数很多时加快，但始终逐层转
    var dur = Math.round(Math.max(22, Math.min(110, 1700 / moves.length)));

    this._runMoves(moves, dur, function () {
      var solvedNow = C.isSolved(self.cube);
      self.setData({ busy: false, scrambling: false, solved: solvedNow });
      if (!solvedNow) {
        try {
          wx.vibrateShort({ type: "light" });
        } catch (err) {}
      }
      if (self.data.tutorialOn) self._buildTutorial(!solvedNow);
    }, { quiet: true });
  },

  _clearTutorial: function () {
    this._clearHighlight();
    this.setData({
      tutorialDone: false,
      tutorialReady: false,
      tutorialError: "",
      planSteps: [],
      stageChips: [],
      currentStep: null,
      currentGuide: null,
      stepTokens: [],
      stepIndex: 0,
      totalSteps: 0,
      showGuide: false,
    });
  },

  onUndo: function () {
    if (this._animating || this.data.busy || !this._history.length) return;
    this.setData({ busy: true });
    this._undoSteps(1, function () {
      this.setData({ busy: false });
      this._afterMove();
      // 魔方状态变了，教程必须按新状态重排
      if (this.data.tutorialOn && this.data.tutorialReady) this._rebuildKeepStage();
    }.bind(this));
  },

  onResetView: function () {
    if (!this._r) return;
    this._r.resetView();
    this._draw();
  },

  // ========== 教程 ==========
  onToggleTutorial: function (e) {
    var on = e.detail.value;
    this.setData({ tutorialOn: on });
    writeStorage(TUTORIAL_KEY, on);
    if (on) {
      this._buildTutorial(false);
    } else {
      this._clearHighlight();
      this.setData({
        tutorialReady: false,
        tutorialError: "",
        planSteps: [],
        stageChips: [],
        currentStep: null,
        currentGuide: null,
        stepTokens: [],
        stepIndex: 0,
        totalSteps: 0,
        showGuide: false,
      });
    }
  },

  onStartTutorial: function () {
    this._buildTutorial(true);
  },

  onReplanTutorial: function () {
    this._buildTutorial(true);
  },

  onToggleGuide: function () {
    this.setData({ showGuide: !this.data.showGuide });
  },

  onHelp: function () {
    this.setData({ showHelp: true });
  },

  onCloseHelp: function () {
    this.setData({ showHelp: false });
  },

  onNoop: function () {},

  // 判断某个阶段是否已完成
  _stageDone: function (fn, stageId) {
    if (stageId === 6) return C.isSolved(this.cube);
    var fl = C.getFacelets(this.cube);
    switch (stageId) {
      case 0:
        return solver.crossSolved(fl);
      case 1:
        return solver.firstLayerSolved(fl);
      case 2:
        return solver.middleSolved(fl);
      case 3:
        return solver.ollEdgesDone(fl) && solver.f2lIntact(fl);
      case 4:
        return solver.ollCornersDone(fl) && solver.ollEdgesDone(fl);
      case 5:
        return solver.cornersPositioned(fl) && solver.ollCornersDone(fl);
      default:
        return false;
    }
  },

  _firstUnfinishedStage: function () {
    for (var i = 0; i < 7; i++) {
      if (!this._stageDone(null, i)) return i;
    }
    return 6;
  },

  // 生成教程计划（从第一个未完成的阶段开始）
  _buildTutorial: function (showToast) {
    var t = CUBE_TYPES[this.data.typeIndex];
    if (t.n !== 3) {
      this._clearHighlight();
      this.setData({
        tutorialReady: false,
        tutorialError: "",
        tutorialSupported: false,
        tutorialDone: false,
        planSteps: [],
        stageChips: [],
        currentStep: null,
        currentGuide: null,
        stepTokens: [],
        totalSteps: 0,
      });
      return;
    }

    if (C.isSolved(this.cube)) {
      this._clearHighlight();
      this.setData({
        tutorialReady: false,
        tutorialError: "",
        tutorialSupported: true,
        tutorialDone: true,
        planSteps: [],
        stageChips: [],
        currentStep: null,
        currentGuide: null,
        stepTokens: [],
        totalSteps: 0,
      });
      return;
    }

    var result = solver.solveCube(this.cube);
    if (result.error) {
      // 转了中间层（M/E/S）之后面心块会跟着转，整体朝向就变了。
      // 真魔方遇到这种情况把魔方转一转让黄上绿前就行，这里自动做同样的「换手」。
      var regrip = solver.findCanonicalRotation(this.cube);
      if (regrip && regrip.length) {
        C.applyMoves(this.cube, regrip);
        this._history = [];
        if (this._r) this._r.setCube(this.cube);
        result = solver.solveCube(this.cube);
      }
    }
    if (result.error) {
      this._clearHighlight();
      this.setData({
        tutorialReady: false,
        tutorialError: result.error,
        tutorialSupported: true,
        tutorialDone: false,
        planSteps: [],
        stageChips: [],
        currentStep: null,
        currentGuide: null,
        stepTokens: [],
        totalSteps: 0,
      });
      return;
    }

    // 三阶下，只有魔方整体朝向不为「黄上绿前」时 solver 才会报错，
    // 而我们的交互不会产生整体转体，所以这里正常都能通过。

    var flat = [];
    var chips = [];
    for (var i = 0; i < result.stages.length; i++) {
      var st = result.stages[i];
      chips.push({
        id: st.id,
        name: st.name,
        tip: st.tip,
        count: st.steps.length,
        from: flat.length,
        done: !this._stageDone(null, i) ? false : true,
      });
      for (var j = 0; j < st.steps.length; j++) {
        var s = st.steps[j];
        flat.push({
          stageId: st.id,
          stageName: st.name,
          stageTip: st.tip,
          alg: s.alg || "",
          note: s.note || "",
          stageCount: st.steps.length,
        });
      }
    }

    // 计划由 solveCube 针对「当前魔方状态」整体求解，每一步的公式只在
    // 「从第 0 步依次执行」时才保证正确。已经完成的阶段，其步骤本来就是空的，
    // 所以永远从第 0 步开始展示，绝不跳步（跳步会让公式在别的状态上执行而失效）。
    var startIdx = 0;

    this.setData({
      tutorialReady: true,
      tutorialError: "",
      tutorialSupported: true,
      tutorialDone: false,
      planSteps: flat,
      stageChips: chips,
      totalSteps: flat.length,
      stepIndex: startIdx,
      showGuide: false,
    });
    this._r && this._r.resetView();
    this._showStep(startIdx);
    if (showToast) wx.showToast({ title: "步骤已生成", icon: "none" });
  },

  // 手动转动 / 撤销之后重新规划。
  // 注意：整份计划是「从第 0 步依次执行」才成立的，所以重排后一律回到第 0 步。
  // 已经完成的阶段本来就没有步骤，回到第 0 步看到的仍是当前该做的那一步。
  _rebuildKeepStage: function () {
    if (!this.data.tutorialReady) return;
    this._buildTutorialSilent();
  },

  _buildTutorialSilent: function () {
    var wasToast = false;
    this._buildTutorial(wasToast);
  },

  // 防抖：连续手动转动时只在停手后重新求解一次
  _scheduleRebuild: function () {
    var self = this;
    this._clearRebuildTimer();
    this._rebuildTimer = setTimeout(function () {
      self._rebuildTimer = null;
      if (!self._alive) return;
      self._rebuildKeepStage();
    }, 320);
  },

  _showStep: function (index) {
    var flat = this.data.planSteps;
    if (!flat.length) {
      this._clearHighlight();
      this.setData({ currentStep: null, currentGuide: null, stepTokens: [] });
      return;
    }
    var i = Math.max(0, Math.min(index, flat.length - 1));
    var cur = flat[i];
    var tokens = [];
    if (cur.alg) {
      var raw = cur.alg.split(/\s+/).filter(Boolean);
      for (var k = 0; k < raw.length; k++) {
        var tk = raw[k];
        var cls = "";
        if (tk.indexOf("2") > 0) cls = "alg-double";
        else if (tk.indexOf("'") > 0) cls = "alg-prime";
        tokens.push({ key: k + "-" + tk, text: tk, cls: cls });
      }
    }
    var guide = STAGE_GUIDE[cur.stageId] || null;
    this.setData({
      stepIndex: i,
      currentStep: cur,
      currentGuide: guide,
      stepTokens: tokens,
    });
    // 高亮接下来要转的层，帮新人找到那一面
    this._highlightStep(tokens);
  },

  // 高亮：抓住这一步公式里第一个字母对应的面
  _highlightStep: function (tokens) {
    var r = this._r;
    if (!r) return;
    r.highlight = null;
    if (!tokens || !tokens.length) {
      this._draw();
      return;
    }
    var first = tokens[0].text.charAt(0).toUpperCase();
    var def = C.FACE_DEF && C.FACE_DEF[first];
    if (!def) {
      this._draw();
      return;
    }
    var n = this.cube.n;
    var layer = def.layer === "max" ? n - 1 : 0;
    r.highlight = { axis: def.axis, layer: layer, color: "#FF6B8A" };
    this._draw();
  },

  // 教程结束 / 关闭 / 复位时清除高亮，否则那一层会一直亮着
  _clearHighlight: function () {
    var r = this._r;
    if (!r || !r.highlight) return;
    r.highlight = null;
    this._draw();
  },

  // 跟着做：执行当前一步
  onApplyStep: function () {
    if (this._animating || this.data.busy) return;
    var cur = this.data.currentStep;
    if (!cur) return;
    if (!cur.alg) {
      this._advanceStep();
      return;
    }
    var self = this;
    this.setData({ busy: true });
    this.runAlg(cur.alg, function () {
      self.setData({ busy: false });
      self._advanceStep();
    });
  },

  // 前进一步。
  // 计划是 solveCube 针对「当前状态」整体求解的，已完成阶段的步骤为空，
  // 所以自然前进（idx + 1）就是下一步该做的动作，不需要按阶段跳跃。
  _advanceStep: function () {
    var cur = this.data.currentStep;
    var idx = this.data.stepIndex;
    var flat = this.data.planSteps;

    if (C.isSolved(this.cube)) {
      this._finishTutorial();
      return;
    }
    if (!flat.length) return;
    if (idx + 1 >= flat.length) {
      this._endOfPlan();
      return;
    }

    var next = flat[idx + 1];
    // 跨阶段时把已经过去的阶段点亮，并提示一下
    if (cur && next.stageId !== cur.stageId) {
      this._markStageDone(cur.stageId);
      wx.showToast({ title: "第 " + (cur.stageId + 1) + " 步完成", icon: "none" });
    }
    this._showStep(idx + 1);
  },

  _finishTutorial: function () {
    this._clearHighlight();
    this.setData({
      tutorialDone: true,
      tutorialReady: false,
      currentStep: null,
      currentGuide: null,
      stepTokens: [],
    });
    var chips = this.data.stageChips;
    var changed = false;
    for (var d = 0; d < chips.length; d++) {
      if (!chips[d].done) {
        chips[d].done = true;
        changed = true;
      }
    }
    if (changed) this.setData({ stageChips: chips });
  },

  // 计划走完但魔方还没复原：说明有步骤被「跳过」了（跳过不改变魔方状态）。
  // 此时不自动重排——那会把进度无声地拨回第 1 步——而是提示用户去执行或重排。
  _endOfPlan: function () {
    if (C.isSolved(this.cube)) {
      this._clearHighlight();
      this.setData({
        tutorialDone: true,
        tutorialReady: false,
        currentStep: null,
        currentGuide: null,
        stepTokens: [],
      });
      return;
    }
    wx.showToast({ title: "已是最后一步，请先执行或点「重新生成步骤」", icon: "none" });
  },

  onNextStep: function () {
    if (this._animating || this.data.busy) return;
    // 「我转好了」：用户自己转了魔方，状态已经变成新样子，
    // 旧计划里剩下的公式不再成立，必须按当前状态重新求解。
    if (this.data.guideMode === "manual") {
      this._rebuildKeepStage();
      return;
    }
    this._advanceStep();
  },

  // 计划是「从第 0 步依次执行」才成立的，所以从当前步骤倒回第 to 步（to < 当前步）
  // 只需把 [to, 当前步) 的公式「倒序取逆」执行，不依赖历史记录。
  _rewindTo: function (to, cb) {
    var self = this;
    var flat = this.data.planSteps;
    var idx = this.data.stepIndex;
    var tokens = [];
    for (var i = idx - 1; i >= to; i--) {
      var alg = flat[i] && flat[i].alg;
      if (!alg) continue;
      var parts = alg.split(/\s+/).filter(Boolean);
      for (var k = parts.length - 1; k >= 0; k--) tokens.push(invertToken(parts[k]));
    }
    if (!tokens.length) {
      this._showStep(to);
      if (cb) cb();
      return;
    }
    this.setData({ busy: true });
    this.runAlg(tokens.join(" "), function () {
      self.setData({ busy: false });
      self._showStep(to);
      self._afterMove();
      if (cb) cb();
    });
  },

  onPrevStep: function () {
    if (this._animating || this.data.busy) return;
    var idx = this.data.stepIndex;
    if (idx <= 0) return;
    this._rewindTo(idx - 1);
  },

  // 直接完成本阶段
  onApplyStage: function () {
    if (this._animating || this.data.busy) return;
    var cur = this.data.currentStep;
    if (!cur) return;
    var flat = this.data.planSteps;
    var end = this.data.stepIndex;
    while (end < flat.length && flat[end].stageId === cur.stageId) end++;
    var stageId = cur.stageId;
    var algs = [];
    for (var i = this.data.stepIndex; i < end; i++) {
      if (flat[i].alg) algs.push(flat[i].alg);
    }
    if (!algs.length) {
      this._markStageDone(stageId);
      if (end < flat.length) this._showStep(end);
      else this._endOfPlan();
      return;
    }
    var self = this;
    this.setData({ busy: true });
    this.runAlg(algs.join(" "), function () {
      self.setData({ busy: false });
      // 阶段做完后，状态可能已经变了，锚点作废
      self._markStageDone(stageId);
      if (C.isSolved(self.cube)) {
        self._clearHighlight();
        self.setData({
          tutorialDone: true,
          tutorialReady: false,
          currentStep: null,
          currentGuide: null,
          stepTokens: [],
        });
        var chips = self.data.stageChips;
        for (var k = 0; k < chips.length; k++) chips[k].done = true;
        self.setData({ stageChips: chips });
        return;
      }
      if (end < flat.length) {
        // 直接用原计划里的下一步，避免整份重新求解
        self._showStep(end);
        wx.showToast({ title: "本阶段完成", icon: "none" });
        return;
      }
      self._endOfPlan();
    });
  },

  _markStageDone: function (stageId) {
    var chips = this.data.stageChips;
    var changed = false;
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].id === stageId && !chips[i].done) {
        chips[i].done = true;
        changed = true;
      }
    }
    if (changed) this.setData({ stageChips: chips });
  },

  // 点阶段标签跳转。计划必须「按顺序从第 0 步执行」才成立，
  // 所以往前跳要先真正做完中间步骤、往回跳要真正倒回魔方状态，
  // 只改文字不改魔方会让后续公式全部对不上。
  onJumpStage: function (e) {
    if (this._animating || this.data.busy) return;
    var from = Number(e.currentTarget.dataset.from);
    var idx = this.data.stepIndex;
    var flat = this.data.planSteps;
    if (!flat.length || from === idx) return;
    from = Math.max(0, Math.min(from, flat.length - 1));

    var self = this;

    if (from < idx) {
      this._rewindTo(from);
      return;
    }

    var algs = [];
    for (var i = idx; i < from; i++) {
      if (flat[i].alg) algs.push(flat[i].alg);
    }
    if (!algs.length) {
      this._showStep(from);
      return;
    }
    this.setData({ busy: true });
    this.runAlg(algs.join(" "), function () {
      self.setData({ busy: false });
      if (C.isSolved(self.cube)) {
        self._finishTutorial();
        return;
      }
      self._showStep(Math.min(from, self.data.planSteps.length - 1));
      self._afterMove();
    });
  },

  onShareAppMessage: function () {
    return {
      title: "喵喵游戏 - 3D 魔方，跟着教程一步步复原",
      path: "/pages/cube/cube",
    };
  },
});
