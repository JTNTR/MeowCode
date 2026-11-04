// utils/cubeSolver.js
// 3 阶魔方「层先法」教学求解器
//
// 目标不是最短解，而是按层先法（Beginner Method）告诉新人：
//   现在做到哪一步 → 看什么 → 转动什么 → 为什么
//
// 步骤：
//   1 底层十字（白十字）
//   2 底层角块（第一层）
//   3 中层棱块（第二层）
//   4 顶层十字（黄色十字）
//   5 顶层角块朝向（顶面全黄）
//   6 顶层角块归位
//   7 顶层棱块归位
//
// 面块坐标（与 utils/cube.js 的 getFacelets 一致）：
//   U 0..8  R 9..17  F 18..26  D 27..35  L 36..44  B 45..53
//   每面均为「从外面看」的行优先。
// 标准配色：U 黄 / D 白 / F 绿 / B 蓝 / R 红 / L 橙

var cubeLib = require("./cube.js");
var PERM = require("./cubeTables.js").PERM;

var FACE_COLOR = { U: "Y", R: "R", F: "G", D: "W", L: "O", B: "B" };
var COLOR_NAME = { W: "白色", Y: "黄色", R: "红色", O: "橙色", G: "绿色", B: "蓝色" };
var FACE_NAME = { U: "上层", D: "下层", F: "前面", B: "后面", R: "右面", L: "左面" };
// 侧面色 → 所在面
var COLOR_FACE = { Y: "U", W: "D", G: "F", B: "B", R: "R", O: "L" };

// 棱块位置：[面A下标, 面B下标]
var EDGE_SLOTS = {
  UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37],
  FR: [23, 12], FL: [21, 41], BR: [48, 14], BL: [50, 39],
  DF: [28, 25], DR: [32, 16], DB: [34, 52], DL: [30, 43],
};
var EDGE_FACES = {
  UF: ["U", "F"], UR: ["U", "R"], UB: ["U", "B"], UL: ["U", "L"],
  FR: ["F", "R"], FL: ["F", "L"], BR: ["B", "R"], BL: ["B", "L"],
  DF: ["D", "F"], DR: ["D", "R"], DB: ["D", "B"], DL: ["D", "L"],
};
var EDGE_KEYS = ["UF", "UR", "UB", "UL", "FR", "FL", "BR", "BL", "DF", "DR", "DB", "DL"];

// 角块：[D/U 面, F/B 面, R/L 面]
var CORNER_SLOTS = {
  DFR: [29, 26, 15], DFL: [27, 24, 44], DBR: [35, 51, 17], DBL: [33, 53, 42],
  UFR: [8, 20, 9], UFL: [6, 18, 38], UBR: [2, 45, 11], UBL: [0, 47, 36],
};
var CORNER_FACES = {
  DFR: ["D", "F", "R"], DFL: ["D", "F", "L"], DBR: ["D", "B", "R"], DBL: ["D", "B", "L"],
  UFR: ["U", "F", "R"], UFL: ["U", "F", "L"], UBR: ["U", "B", "R"], UBL: ["U", "B", "L"],
};
var CORNER_KEYS = ["DFR", "DFL", "DBR", "DBL", "UFR", "UFL", "UBR", "UBL"];

// ---------- 面块基础 ----------

function solvedFacelets() {
  var a = new Array(54);
  for (var f = 0; f < 6; f++) {
    var c = FACE_COLOR["URFDLB".charAt(f)];
    for (var i = 0; i < 9; i++) a[f * 9 + i] = c;
  }
  return a;
}

function parseAlg(str) {
  if (!str) return [];
  var tokens = String(str).trim().split(/\s+/);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (!t) continue;
    var face = t.charAt(0).toUpperCase();
    if (!FACE_COLOR[face]) continue;
    var times = 1;
    if (t.indexOf("2") > 0) times = 2;
    else if (t.indexOf("'") > 0) times = 3;
    out.push({ face: face, times: times });
  }
  return out;
}

function algToString(alg) {
  var out = [];
  for (var i = 0; i < alg.length; i++) {
    var m = alg[i];
    out.push(m.times === 1 ? m.face : m.times === 2 ? m.face + "2" : m.face + "'");
  }
  return out.join(" ");
}

function scaleAlg(alg, times) {
  var out = [];
  for (var k = 0; k < times; k++) out = out.concat(alg);
  return out;
}

function applyTurn(fl, face, times) {
  var perm = PERM[face];
  var cur = fl;
  var n = times % 4;
  for (var t = 0; t < n; t++) {
    var next = new Array(54);
    for (var i = 0; i < 54; i++) next[perm[i]] = cur[i];
    cur = next;
  }
  return cur;
}

function applyAlg(fl, alg) {
  var moves = typeof alg === "string" ? parseAlg(alg) : alg;
  var cur = fl;
  for (var i = 0; i < moves.length; i++) {
    cur = applyTurn(cur, moves[i].face, moves[i].times);
  }
  return cur;
}

function invertAlg(alg) {
  var moves = typeof alg === "string" ? parseAlg(alg) : alg;
  var out = [];
  for (var i = moves.length - 1; i >= 0; i--) {
    out.push({ face: moves[i].face, times: 4 - (moves[i].times % 4) });
  }
  return out;
}

function sameFacelets(a, b) {
  for (var i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------- 块查找 ----------

function sortedColors(arr) {
  return arr.slice().sort().join("");
}

function findEdge(fl, c1, c2) {
  var target = sortedColors([c1, c2]);
  for (var i = 0; i < EDGE_KEYS.length; i++) {
    var slot = EDGE_KEYS[i];
    var idx = EDGE_SLOTS[slot];
    var v0 = fl[idx[0]], v1 = fl[idx[1]];
    if (sortedColors([v0, v1]) === target) {
      return { slot: slot, ori: v0 === c1 ? 0 : 1, faces: EDGE_FACES[slot], colors: [v0, v1] };
    }
  }
  return null;
}

function findCorner(fl, colors) {
  var target = sortedColors(colors);
  for (var i = 0; i < CORNER_KEYS.length; i++) {
    var slot = CORNER_KEYS[i];
    var idx = CORNER_SLOTS[slot];
    var v = [fl[idx[0]], fl[idx[1]], fl[idx[2]]];
    if (sortedColors(v) === target) {
      return { slot: slot, facelets: idx, faces: CORNER_FACES[slot], colors: v };
    }
  }
  return null;
}

function edgeColors(fl, slot) {
  var faces = EDGE_FACES[slot];
  var idx = EDGE_SLOTS[slot];
  var o = {};
  o[faces[0]] = fl[idx[0]];
  o[faces[1]] = fl[idx[1]];
  return o;
}

function cornerColors(fl, slot) {
  var faces = CORNER_FACES[slot];
  var idx = CORNER_SLOTS[slot];
  var o = {};
  for (var i = 0; i < 3; i++) o[faces[i]] = fl[idx[i]];
  return o;
}

// ---------- 整体旋转 ----------

var ROTATION_SEQS = [
  [], ["y"], ["y2"], ["y'"],
  ["x"], ["x", "y"], ["x", "y2"], ["x", "y'"],
  ["x2"], ["x2", "y"], ["x2", "y2"], ["x2", "y'"],
  ["x'"], ["x'", "y"], ["x'", "y2"], ["x'", "y'"],
  ["z"], ["z", "y"], ["z", "y2"], ["z", "y'"],
  ["z'"], ["z'", "y"], ["z'", "y2"], ["z'", "y'"],
];

var ROTATION_PERMS = null;

function faceletIndex(p, dir) {
  var x = p[0], y = p[1], z = p[2];
  if (dir === 2) return z * 3 + x;
  if (dir === 0) return 9 + (2 - y) * 3 + (2 - z);
  if (dir === 4) return 18 + (2 - y) * 3 + x;
  if (dir === 3) return 27 + (2 - z) * 3 + x;
  if (dir === 1) return 36 + (2 - y) * 3 + z;
  return 45 + (2 - y) * 3 + (2 - x);
}

function buildRotationPerms() {
  var out = [];
  var base = cubeLib.createCube(3);
  for (var r = 0; r < ROTATION_SEQS.length; r++) {
    var cube = cubeLib.createCube(3);
    cubeLib.applyMoves(cube, ROTATION_SEQS[r]);
    var perm = new Array(54);
    for (var ci = 0; ci < 27; ci++) {
      var b0 = base.cubies[ci];
      var b1 = cube.cubies[ci];
      for (var d = 0; d < 6; d++) {
        if (b0.c[d] === null) continue;
        var color = b0.c[d];
        var nd = -1;
        for (var k = 0; k < 6; k++) if (b1.c[k] === color) nd = k;
        perm[faceletIndex(b0.p, d)] = faceletIndex(b1.p, nd);
      }
    }
    out.push({ seq: ROTATION_SEQS[r], perm: perm });
  }
  return out;
}

function applyFaceletPerm(fl, perm) {
  var out = new Array(54);
  for (var i = 0; i < 54; i++) out[perm[i]] = fl[i];
  return out;
}

function isCanonical(fl) {
  return (
    fl[4] === "Y" && fl[13] === "R" && fl[22] === "G" &&
    fl[31] === "W" && fl[40] === "O" && fl[49] === "B"
  );
}

function findCanonicalRotation(cube) {
  var fl = cubeLib.getFacelets(cube);
  if (isCanonical(fl)) return [];
  if (!ROTATION_PERMS) ROTATION_PERMS = buildRotationPerms();
  for (var i = 0; i < ROTATION_PERMS.length; i++) {
    if (isCanonical(applyFaceletPerm(fl, ROTATION_PERMS[i].perm))) {
      return ROTATION_SEQS[i];
    }
  }
  return null;
}
// =====================================================================
// 层先法教学求解
// =====================================================================
//
// 阶段：
//   0 底层白十字  1 底层角块  2 中层棱块
//   3 顶层黄十字  4 顶层角块朝向  5 顶层角块归位  6 顶层棱块归位
//
// 每个阶段返回 { fl, steps: [{ alg, note }] }。
// 所有公式都是层先法的标准公式；具体选哪条由「执行后校验」决定，
// 因此朝向判断不会卡住。

var STAGES = [
  { id: 0, name: "底层白十字", tip: "把 4 个白色棱块拼到底层，侧面颜色要与中心块对齐" },
  { id: 1, name: "底层角块", tip: "把 4 个白色角块放进底层，第一层完成" },
  { id: 2, name: "中层棱块", tip: "把中间层 4 个棱块归位，下面两层完成" },
  { id: 3, name: "顶层黄十字", tip: "让顶面 4 个棱块全部黄色朝上" },
  { id: 4, name: "顶层角块朝向", tip: "让顶面 4 个角块全部黄色朝上" },
  { id: 5, name: "顶层角块归位", tip: "转动顶层并交换角块，让每个角块回到正确位置" },
  { id: 6, name: "顶层棱块归位", tip: "交换棱块，把整个魔方复原" },
];

var COLOR_OF_FACE = { U: "Y", D: "W", F: "G", B: "B", R: "R", L: "O" };
var FACE_OF_COLOR = { Y: "U", W: "D", G: "F", B: "B", R: "R", O: "L" };

// U 层顺时针 n 次的记号
function uAlg(n) {
  n = ((n % 4) + 4) % 4;
  return n === 0 ? "" : n === 1 ? "U" : n === 2 ? "U2" : "U'";
}

function faceCN(face) {
  return FACE_NAME[face] || face;
}

function colorCN(c) {
  return COLOR_NAME[c] || c;
}

function joinAlg(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a + " " + b;
}

// 依次尝试「U 调整 n 次 + 策略公式」，返回第一个满足 goal 的结果
function tryCandidates(fl, strategies, goal) {
  for (var s = 0; s < strategies.length; s++) {
    for (var n = 0; n < 4; n++) {
      var before = n === 0 ? fl : applyTurn(fl, "U", n);
      var after = applyAlg(before, strategies[s].alg);
      if (goal(after, before)) {
        return {
          fl: after,
          alg: joinAlg(uAlg(n), strategies[s].alg),
          note: strategies[s].note,
        };
      }
    }
  }
  return null;
}

// 有界广度搜索：返回把 start 变成满足 goal 的一组单面转动
// 返回字符串数组（如 ["R", "U2"]），找不到返回 null
function searchMoves(start, goal, maxDepth, allowedFaces) {
  if (goal(start)) return [];
  var faces = allowedFaces || ["U", "D", "L", "R", "F", "B"];
  var layer = [{ fl: start, algs: [], last: "" }];
  for (var d = 0; d < maxDepth; d++) {
    var next = [];
    for (var qi = 0; qi < layer.length; qi++) {
      var node = layer[qi];
      for (var fi = 0; fi < faces.length; fi++) {
        var f = faces[fi];
        if (f === node.last) continue;
        for (var t = 1; t <= 3; t++) {
          var nf = applyTurn(node.fl, f, t);
          var algs = node.algs.concat([f + (t === 1 ? "" : t === 2 ? "2" : "'")]);
          if (goal(nf)) return algs;
          next.push({ fl: nf, algs: algs, last: f });
        }
      }
    }
    layer = next;
  }
  return null;
}

// ---------- 阶段 1：底层白十字 ----------

var WHITE_EDGES = [
  { colors: ["W", "G"], slot: "DF", side: "F" },
  { colors: ["W", "R"], slot: "DR", side: "R" },
  { colors: ["W", "B"], slot: "DB", side: "B" },
  { colors: ["W", "O"], slot: "DL", side: "L" },
];

function crossEdgePlaced(fl, e) {
  var c = edgeColors(fl, e.slot);
  return c.D === "W" && c[e.side] === COLOR_OF_FACE[e.side];
}

function crossSolved(fl) {
  for (var i = 0; i < 4; i++) if (!crossEdgePlaced(fl, WHITE_EDGES[i])) return false;
  return true;
}

function daisySolved(fl) {
  var slots = ["UF", "UR", "UB", "UL"];
  for (var i = 0; i < slots.length; i++) if (edgeColors(fl, slots[i]).U !== "W") return false;
  return true;
}

function solveCross(fl) {
  var steps = [];
  var cur = fl;
  var pairs = [["W", "G"], ["W", "R"], ["W", "B"], ["W", "O"]];
  var faces = ["U", "F", "R", "B", "L", "D"];

  // 1) 白花心
  var guard = 0;
  while (!daisySolved(cur) && guard++ < 10) {
    var progressed = false;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var e0 = findEdge(cur, p[0], p[1]);
      if (!e0) return null;
      if (e0.slot.charAt(0) === "U" && edgeColors(cur, e0.slot).U === "W") continue;

      var keep = [];
      var upSlots = ["UF", "UR", "UB", "UL"];
      for (var k = 0; k < upSlots.length; k++) {
        var cc = edgeColors(cur, upSlots[k]);
        if (cc.U === "W") keep.push([cc.U, cc[upSlots[k].charAt(1)]]);
      }
      var goal = (function (pair, kept) {
        return function (state) {
          var me = findEdge(state, pair[0], pair[1]);
          if (!me || me.slot.charAt(0) !== "U" || edgeColors(state, me.slot).U !== "W") return false;
          for (var q = 0; q < kept.length; q++) {
            if (kept[q][0] === pair[0] && kept[q][1] === pair[1]) continue;
            var ke = findEdge(state, kept[q][0], kept[q][1]);
            if (!ke || ke.slot.charAt(0) !== "U" || edgeColors(state, ke.slot).U !== "W") return false;
          }
          return true;
        };
      })(p, keep);

      var mv = searchMoves(cur, goal, 4, faces);
      if (!mv) return null;
      var algStr = mv.join(" ");
      cur = applyAlg(cur, algStr);
      steps.push({
        alg: algStr,
        note: "白色-" + colorCN(p[1]) + "棱块：执行「" + algStr + "」，把它转到顶面且白色朝上",
      });
      progressed = true;
    }
    if (!progressed) break;
  }
  if (!daisySolved(cur)) return null;
  steps.push({ alg: "", note: "顶面出现白色花心：4 条白色棱块的白色都朝上" });

  // 2) 花心 → 白十字
  for (var j = 0; j < 4; j++) {
    var t = WHITE_EDGES[j];
    var side = t.side;
    if (crossEdgePlaced(cur, t)) continue;
    var goal2 = (function (sd) {
      return function (state) {
        var ee = findEdge(state, "W", COLOR_OF_FACE[sd]);
        return !!(ee && ee.slot === "U" + sd && edgeColors(state, ee.slot).U === "W");
      };
    })(side);
    var r2 = tryCandidates(cur, [{ alg: "", note: "" }], goal2);
    if (!r2) return null;
    if (r2.alg) {
      steps.push({
        alg: r2.alg,
        note: "转动顶层，让" + colorCN(COLOR_OF_FACE[side]) + "色白棱对齐" + faceCN(side) + "中心",
      });
    }
    cur = r2.fl;
    cur = applyAlg(cur, side + "2");
    steps.push({ alg: side + "2", note: "把" + faceCN(side) + "转 180°，白棱落到下层，白十字再完成一道" });
  }
  return { fl: cur, steps: steps };
}

// ---------- 阶段 2：底层角块 ----------

var WHITE_CORNERS = [
  { slot: "DFR", above: "UFR", colors: ["W", "G", "R"] },
  { slot: "DFL", above: "UFL", colors: ["W", "G", "O"] },
  { slot: "DBR", above: "UBR", colors: ["W", "B", "R"] },
  { slot: "DBL", above: "UBL", colors: ["W", "B", "O"] },
];

// 教科书角块插入法（前提：角块已转到目标槽正上方）
// 白色朝向不同，用不同的「单次插入」或「三次重复」：
//   U 面 → 三次插入公式  侧面 → 一次对应侧面的插入公式
var CORNER_INS = {
  DFR: { repeat: "R U R' U'", side: { R: "R U R'", F: "F' U' F" } },
  DFL: { repeat: "L' U' L U", side: { L: "L' U' L", F: "F U F'" } },
  DBR: { repeat: "R' U' R U", side: { R: "R' U' R", B: "B U B'" } },
  DBL: { repeat: "L U L' U'", side: { L: "L U L'", B: "B' U' B" } },
};

// 角块卡在底层错误位置时，用与它所在槽相关的公式弹出
var CORNER_EJECT = {
  DFR: "R U R'",
  DFL: "L' U' L",
  DBR: "R' U' R",
  DBL: "L U L'",
};

function cornerPlaced(fl, c) {
  var cc = cornerColors(fl, c.slot);
  var faces = CORNER_FACES[c.slot];
  if (cc[faces[0]] !== "W") return false;
  for (var i = 1; i < 3; i++) if (cc[faces[i]] !== COLOR_OF_FACE[faces[i]]) return false;
  return true;
}

function firstLayerSolved(fl) {
  if (!crossSolved(fl)) return false;
  for (var i = 0; i < 4; i++) if (!cornerPlaced(fl, WHITE_CORNERS[i])) return false;
  return true;
}

function cornerCount(fl) {
  var n = 0;
  for (var i = 0; i < 4; i++) if (cornerPlaced(fl, WHITE_CORNERS[i])) n++;
  return n;
}

function solveFirstLayerCorners(fl) {
  var steps = [];
  var cur = fl;
  for (var i = 0; i < 4; i++) {
    var r = placeCorner(cur, WHITE_CORNERS[i]);
    if (!r) return null;
    cur = r.fl;
    steps = steps.concat(r.steps);
  }
  return { fl: cur, steps: steps };
}

function placeCorner(fl, target) {
  var steps = [];
  var cur = fl;
  var guard = 0;
  var upSlot = target.above;

  while (guard++ < 8) {
    if (cornerPlaced(cur, target)) return { fl: cur, steps: steps };
    var found = findCorner(cur, target.colors);
    if (!found) return null;
    var beforeCount = cornerCount(cur);

    if (found.slot.charAt(0) === "D") {
      var eject = CORNER_EJECT[found.slot];
      cur = applyAlg(cur, eject);
      steps.push({ alg: eject, note: "角块卡在底层错误位置：执行「" + eject + "」把它转到顶层" });
      continue;
    }

    var strategies = [];
    var ins = CORNER_INS[target.slot];
    var faces = CORNER_FACES[upSlot];
    for (var fi = 0; fi < 3; fi++) {
      var wf = faces[fi];
      if (wf === "U") {
        strategies.push({
          alg: ins.repeat + " " + ins.repeat + " " + ins.repeat,
          note: "白色朝上：执行「" + ins.repeat + "」三次，角块会落进底层",
        });
      } else if (ins.side[wf]) {
        strategies.push({
          alg: ins.side[wf],
          note: "白色朝向" + faceCN(wf) + "：执行「" + ins.side[wf] + "」，把角块放入" + faceCN(target.slot.charAt(1)) + faceCN(target.slot.charAt(2)) + "角",
        });
      }
    }
    var goal = (function (tg, cnt) {
      return function (state) {
        return cornerPlaced(state, tg) && cornerCount(state) >= cnt;
      };
    })(target, beforeCount);
    var r = tryCandidates(cur, strategies, goal);
    if (!r) {
      r = tryCandidates(cur, strategies, (function (tg) {
        return function (state) { return cornerPlaced(state, tg); };
      })(target));
    }
    if (!r) return null;
    cur = r.fl;
    steps.push({ alg: r.alg, note: r.note });
  }
  return null;
}

// ---------- 阶段 3：中层棱块 ----------

var MIDDLE_EDGES = [
  { slot: "FR", a: "F", b: "R" },
  { slot: "FL", a: "F", b: "L" },
  { slot: "BR", a: "B", b: "R" },
  { slot: "BL", a: "B", b: "L" },
];

function middleEdgePlaced(fl, e) {
  var c = edgeColors(fl, e.slot);
  return c[e.a] === COLOR_OF_FACE[e.a] && c[e.b] === COLOR_OF_FACE[e.b];
}

function middleSolved(fl) {
  for (var i = 0; i < 4; i++) if (!middleEdgePlaced(fl, MIDDLE_EDGES[i])) return false;
  return true;
}

function middleCount(fl) {
  var n = 0;
  for (var i = 0; i < 4; i++) if (middleEdgePlaced(fl, MIDDLE_EDGES[i])) n++;
  return n;
}

var SIDE_CYCLE = ["F", "R", "B", "L"];

function sideRight(f) {
  return SIDE_CYCLE[(SIDE_CYCLE.indexOf(f) + 1) % 4];
}
function sideLeft(f) {
  return SIDE_CYCLE[(SIDE_CYCLE.indexOf(f) + 3) % 4];
}

// 中层插入公式（已验证）：
//   右插（目标槽在 a 的右侧）：U b U' b' U' a' U a
//   左插（目标槽在 a 的左侧）：U' b' U b U a U' a'
// 前提：棱块已转到 Ua 位，侧面颜色对齐 a 面中心。
function middleInsert(a, b, toRight) {
  if (toRight) return "U " + b + " U' " + b + "' U' " + a + "' U " + a;
  return "U' " + b + "' U " + b + " U " + a + " U' " + a + "'";
}

function solveMiddleLayer(fl) {
  var steps = [];
  var cur = fl;
  for (var i = 0; i < 4; i++) {
    var r = placeMiddleEdge(cur, MIDDLE_EDGES[i]);
    if (!r) return null;
    cur = r.fl;
    steps = steps.concat(r.steps);
  }
  return { fl: cur, steps: steps };
}

function placeMiddleEdge(fl, target) {
  var steps = [];
  var cur = fl;
  var guard = 0;
  var ca = COLOR_OF_FACE[target.a];
  var cb = COLOR_OF_FACE[target.b];

  while (guard++ < 8) {
    if (middleEdgePlaced(cur, target)) return { fl: cur, steps: steps };
    var found = findEdge(cur, ca, cb);
    if (!found) return null;

    // 卡在中间层（不在顶层）：用「它所在那个槽」的公式把它顶到顶层
    if (found.slot.charAt(0) !== "U") {
      var fa = found.slot.charAt(0);
      var fb = found.slot.charAt(1);
      var eje = middleInsert(fa, fb, sideRight(fa) === fb);
      cur = applyAlg(cur, eje);
      steps.push({
        alg: eje,
        note: "这个棱块卡在中间层的错误位置：先执行「" + eje + "」把它转到顶层",
      });
      continue;
    }

    // 在顶层：先对齐侧面颜色
    var e = edgeColors(cur, found.slot);
    var x = found.slot.charAt(1);
    if (e[x] !== COLOR_OF_FACE[x]) {
      var alignFace = FACE_OF_COLOR[e[x]];
      var d = (SIDE_CYCLE.indexOf(alignFace) - SIDE_CYCLE.indexOf(x) + 4) % 4;
      var ua = uAlg(d);
      cur = applyAlg(cur, ua);
      steps.push({ alg: ua, note: "转动顶层，让棱块的侧面颜色对齐中心块" });
      continue;
    }

    // 对齐后：顶面颜色 > 它要去的另一个面，从而确定插左还是插右
    var dest = FACE_OF_COLOR[e.U];
    var goRight = sideRight(x) === dest;
    var alg2 = middleInsert(x, goRight ? sideRight(x) : sideLeft(x), goRight);
    cur = applyAlg(cur, alg2);
    steps.push({
      alg: alg2,
      note: (goRight ? "右插公式「" : "左插公式「") + alg2 + "」：把" +
        colorCN(COLOR_OF_FACE[x]) + "-" + colorCN(e.U) + "棱块插入中间层",
    });
  }
  return null;
}

// ---------- 最后一层通用工具 ----------

// 最后一层必须保持下面两层不变
function f2lIntact(fl) {
  if (!crossSolved(fl)) return false;
  for (var i = 0; i < 4; i++) {
    var c = WHITE_CORNERS[i];
    var cc = cornerColors(fl, c.slot);
    var faces = CORNER_FACES[c.slot];
    if (cc[faces[0]] !== "W") return false;
    for (var k = 1; k < 3; k++) if (cc[faces[k]] !== COLOR_OF_FACE[faces[k]]) return false;
  }
  return middleSolved(fl);
}

var TOP_SLOTS_E = ["UF", "UR", "UB", "UL"];
var TOP_SLOTS_C = ["UFR", "UFL", "UBR", "UBL"];

// 某个阶段的操作集合：4 种 U 调整 × 若干公式
// 返回 [{ alg, algLabel, note }]
function layerOps(algs, noteFor) {
  var out = [];
  for (var i = 0; i < algs.length; i++) {
    for (var n = 0; n < 4; n++) {
      out.push({
        alg: joinAlg(uAlg(n), algs[i]),
        algLabel: algs[i],
        note: noteFor(algs[i], n),
      });
    }
  }
  return out;
}

// 在最后一层做 BFS：每一步都是「U 调整 + 一条公式」，且必须保持 F2L
// 返回 [{ alg, note }] 或 null
function solveLayerBFS(fl, goal, ops, maxDepth) {
  if (goal(fl)) return { fl: fl, steps: [] };
  var queue = [{ fl: fl, steps: [], lastIdx: -1 }];
  var seen = {};
  seen[fl.join("")] = true;
  for (var d = 0; d < maxDepth; d++) {
    var next = [];
    for (var qi = 0; qi < queue.length; qi++) {
      var node = queue[qi];
      for (var oi = 0; oi < ops.length; oi++) {
        var nf = applyAlg(node.fl, ops[oi].alg);
        if (!f2lIntact(nf)) continue;
        var key = nf.join("");
        if (seen[key]) continue;
        seen[key] = true;
        var steps = node.steps.concat([{ alg: ops[oi].alg, note: ops[oi].note }]);
        if (goal(nf)) return { fl: nf, steps: steps };
        next.push({ fl: nf, steps: steps });
      }
    }
    queue = next;
  }
  return null;
}

// 黄十字的图案判断，用于给新人更准确的提示
function topCrossPattern(fl) {
  var ups = 0;
  var bar = 0;
  for (var i = 0; i < 4; i++) {
    var slot = TOP_SLOTS_E[i];
    var c = edgeColors(fl, slot);
    if (c.U === "Y") ups++;
  }
  if (ups === 4) return "done";
  if (ups === 0) return "dot";
  if (ups === 2) {
    // 两条黄棱相对（一字）还是相邻（L 形）
    var upIdx = [];
    for (var j = 0; j < 4; j++) if (edgeColors(fl, TOP_SLOTS_E[j]).U === "Y") upIdx.push(j);
    return (upIdx[1] - upIdx[0] === 2) ? "line" : "L";
  }
  return "other";
}

// ---------- 阶段 4：顶层黄十字 ----------

function ollEdgesDone(fl) {
  for (var i = 0; i < 4; i++) if (edgeColors(fl, TOP_SLOTS_E[i]).U !== "Y") return false;
  return true;
}

var OLL_EDGE_LINE = "F R U R' U' F'";
var OLL_EDGE_L = "F U R U' R' F'";

function solveTopCross(fl) {
  var pattern = topCrossPattern(fl);
  var ops = layerOps([OLL_EDGE_LINE, OLL_EDGE_L], function (alg, n) {
    var word = pattern === "dot"
      ? "顶层只有中心是黄色（点）：先用「" + alg + "」把点变成一字或 L 形"
      : "把顶层黄色棱块摆成" + (alg === OLL_EDGE_LINE ? "一字" : "L 形") + "，再执行「" + alg + "」";
    return word;
  });
  var r = solveLayerBFS(fl, ollEdgesDone, ops, 3);
  if (!r) return null;
  return { fl: r.fl, steps: r.steps };
}

// ---------- 阶段 5：顶层角块朝向 ----------

function ollCornersDone(fl) {
  for (var i = 0; i < 4; i++) if (cornerColors(fl, TOP_SLOTS_C[i]).U !== "Y") return false;
  return true;
}

var SUNE = "R U R' U R U2 R'";
var ANTI_SUNE = "R U2 R' U' R U' R'";
var SUNE_L = "L' U' L U' L' U2 L";
var ANTI_SUNE_L = "L' U2 L U L' U L";

function solveTopCornersOrientation(fl) {
  var ops = layerOps([SUNE, ANTI_SUNE, SUNE_L, ANTI_SUNE_L], function (alg) {
    return "观察顶面黄色图案，把「鱼头」摆到左下角后执行小鱼公式「" + alg + "」";
  });
  var r = solveLayerBFS(fl, function (st) { return ollCornersDone(st) && ollEdgesDone(st); }, ops, 4);
  if (!r) return null;
  return { fl: r.fl, steps: r.steps };
}

// ---------- 阶段 6：顶层角块归位 ----------

function positionedCornerCount(fl) {
  var n = 0;
  for (var i = 0; i < 4; i++) {
    var cc = cornerColors(fl, TOP_SLOTS_C[i]);
    var faces = CORNER_FACES[TOP_SLOTS_C[i]];
    var ok = true;
    for (var k = 0; k < 3; k++) if (cc[faces[k]] !== COLOR_OF_FACE[faces[k]]) ok = false;
    if (ok) n++;
  }
  return n;
}

function cornersPositioned(fl) {
  return positionedCornerCount(fl) === 4;
}

var CORNER_CYCLE_A = "R B' R F2 R' B R F2 R2";
var CORNER_CYCLE_B = "R' F R' B2 R F' R' B2 R2";
var CORNER_CYCLE_C = "L F' L B2 L' F L B2 L2";

function solveTopCornersPosition(fl) {
  var ops = layerOps([CORNER_CYCLE_A, CORNER_CYCLE_B, CORNER_CYCLE_C], function (alg) {
    return "找出两个「已经在对的角块」，把它们放在正确的一侧，执行三角换「" + alg + "」";
  });
  var r = solveLayerBFS(fl, function (st) { return cornersPositioned(st) && ollCornersDone(st) && ollEdgesDone(st); }, ops, 5);
  if (!r) return null;
  return { fl: r.fl, steps: r.steps };
}

// ---------- 阶段 7：顶层棱块归位 ----------

function solvedEdgesCount(fl) {
  var n = 0;
  for (var i = 0; i < 4; i++) {
    var cc = edgeColors(fl, TOP_SLOTS_E[i]);
    var faces = EDGE_FACES[TOP_SLOTS_E[i]];
    var ok = true;
    for (var k = 0; k < 2; k++) if (cc[faces[k]] !== COLOR_OF_FACE[faces[k]]) ok = false;
    if (ok) n++;
  }
  return n;
}

function topEdgesDone(fl) {
  return solvedEdgesCount(fl) === 4;
}

var U_PERM_A = "R U' R U R U R U' R' U' R2";
var U_PERM_B = "R2 U R U R' U' R' U' R' U R'";

function solveTopEdgesPosition(fl) {
  var ops = layerOps([U_PERM_A, U_PERM_B], function (alg) {
    return "找出唯一「已经对好的棱块」放在后面，执行三棱换「" + alg + "」";
  });
  var r = solveLayerBFS(fl, function (st) { return topEdgesDone(st) && cornersPositioned(st); }, ops, 5);
  if (!r) return null;
  return { fl: r.fl, steps: r.steps };
}

// ---------- 总入口 ----------

// 把 3D 模型转成面块；非 3 阶或状态非法返回 null
function faceletsOf(cube) {
  if (!cube || cube.n !== 3) return null;
  return cubeLib.getFacelets(cube);
}

// 求解主流程
// 返回 { stages: [{ id, name, tip, steps }], solved, error }
function solveCube(cube) {
  var fl = faceletsOf(cube);
  if (!fl) return { error: "仅支持 3 阶魔方教程" };

  // 中心块必须是标准配色，否则说不上「复原」
  if (
    fl[4] !== "Y" || fl[13] !== "R" || fl[22] !== "G" ||
    fl[31] !== "W" || fl[40] !== "O" || fl[49] !== "B"
  ) {
    return { error: "魔方整体朝向变了：请先把黄色中心朝上、绿色中心朝前" };
  }

  // 先检查是否已复原
  if (cubeLib.isSolved(cube)) {
    return {
      solved: true,
      stages: STAGES.map(function (s) {
        return { id: s.id, name: s.name, tip: s.tip, steps: [] };
      }),
    };
  }

  var solvers = [
    solveCross,
    solveFirstLayerCorners,
    solveMiddleLayer,
    solveTopCross,
    solveTopCornersOrientation,
    solveTopCornersPosition,
    solveTopEdgesPosition,
  ];

  var stages = [];
  var cur = fl;
  for (var i = 0; i < solvers.length; i++) {
    var r = solvers[i](cur);
    if (!r) {
      return {
        error: "第 " + (i + 1) + " 步（" + STAGES[i].name + "）求解失败，请复位后重新打乱",
        stages: stages,
        failedStage: i,
      };
    }
    cur = r.fl;
    stages.push({ id: STAGES[i].id, name: STAGES[i].name, tip: STAGES[i].tip, steps: r.steps });
  }

  // 全局校验：所有阶段串起来能复原
  var check = fl;
  for (var si = 0; si < stages.length; si++) {
    for (var sj = 0; sj < stages[si].steps.length; sj++) {
      if (stages[si].steps[sj].alg) check = applyAlg(check, stages[si].steps[sj].alg);
    }
  }
  var solvedFl = solvedFacelets();
  var ok = sameFacelets(check, solvedFl);
  if (!ok) return { error: "求解校验失败", stages: stages };

  return { solved: true, stages: stages };
}

module.exports = {
  STAGES: STAGES,
  solvedFacelets: solvedFacelets,
  parseAlg: parseAlg,
  algToString: algToString,
  applyAlg: applyAlg,
  applyTurn: applyTurn,
  invertAlg: invertAlg,
  sameFacelets: sameFacelets,
  findEdge: findEdge,
  findCorner: findCorner,
  edgeColors: edgeColors,
  cornerColors: cornerColors,
  FACE_COLOR: FACE_COLOR,
  COLOR_NAME: COLOR_NAME,
  FACE_NAME: FACE_NAME,
  COLOR_OF_FACE: COLOR_OF_FACE,
  crossSolved: crossSolved,
  firstLayerSolved: firstLayerSolved,
  middleSolved: middleSolved,
  isCanonical: isCanonical,
  findCanonicalRotation: findCanonicalRotation,
  solveCube: solveCube,
  topCrossPattern: topCrossPattern,
  f2lIntact: f2lIntact,
  ollEdgesDone: ollEdgesDone,
  ollCornersDone: ollCornersDone,
  cornersPositioned: cornersPositioned,
  topEdgesDone: topEdgesDone,
  TOP_SLOTS_E: TOP_SLOTS_E,
  TOP_SLOTS_C: TOP_SLOTS_C,
  CORNER_SLOTS: CORNER_SLOTS,
  CORNER_FACES: CORNER_FACES,
  EDGE_SLOTS: EDGE_SLOTS,
  EDGE_FACES: EDGE_FACES,
  __test: {
    solveCross: solveCross,
    solveFirstLayerCorners: solveFirstLayerCorners,
    solveMiddleLayer: solveMiddleLayer,
    solveTopCross: solveTopCross,
    solveTopCornersOrientation: solveTopCornersOrientation,
    solveTopCornersPosition: solveTopCornersPosition,
    solveTopEdgesPosition: solveTopEdgesPosition,
    tryCandidates: tryCandidates,
  },
};
