// utils/cube.js
// 3D 魔方核心模型（纯状态，不依赖渲染）
// 支持任意 N 阶魔方（2x2 ~ 5x5）
//
// 颜色约定（与标准配色一致）：
//   U 白  R 红  F 绿  D 黄  L 橙  B 蓝
//
// 每个小方块 cubie：
//   p: [x, y, z]  格子坐标，0 ~ n-1
//   c: 长度 6 的颜色数组，下标为「世界方向」
//      0:+x(R) 1:-x(L) 2:+y(U) 3:-y(D) 4:+z(F) 5:-z(B)
//   旋转时颜色随方块一起搬移，因此 c[dir] 始终表示该方向上的贴纸颜色。

var DIRS = [
  [1, 0, 0],   // 0 R
  [-1, 0, 0],  // 1 L
  [0, 1, 0],   // 2 U
  [0, -1, 0],  // 3 D
  [0, 0, 1],   // 4 F
  [0, 0, -1],  // 5 B
];

// 六个面的单字母颜色代号（标准配色：上黄 / 下白 / 前绿 / 后蓝 / 右红 / 左橙）
var FACE_COLOR = ["R", "O", "Y", "W", "G", "B"];

// 颜色代号 → 十六进制（渲染用）
var COLOR_HEX = {
  W: "#FFFFFF",
  Y: "#FFD93B",
  G: "#2ECC71",
  B: "#3B82F6",
  R: "#EF4444",
  O: "#FF9F1C",
};

function dirIndex(v) {
  for (var i = 0; i < 6; i++) {
    if (DIRS[i][0] === v[0] && DIRS[i][1] === v[1] && DIRS[i][2] === v[2]) {
      return i;
    }
  }
  return -1;
}

// 绕坐标轴旋转 90°，sign = +1 表示右手法则正方向
function rotateVec(v, axis, sign) {
  var x = v[0], y = v[1], z = v[2];
  if (axis === 0) {
    return sign > 0 ? [x, -z, y] : [x, z, -y];
  }
  if (axis === 1) {
    return sign > 0 ? [z, y, -x] : [-z, y, x];
  }
  return sign > 0 ? [-y, x, z] : [y, -x, z];
}

// 创建 n 阶魔方（已复原）
// opts.mirror 为 true 时创建「镜面魔方」：所有贴纸同色，但每个小方块尺寸不同，
// 靠形状辨识，属于常见的异形魔方（内部仍是 3 阶逻辑）。
var MIRROR_THICKNESS = [0.9, 1.24, 1.86]; // 3 阶镜面；总长 4，归一化后正好铺满 -1..1

function normalizeThickness(arr) {
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i];
  var out = [];
  for (var j = 0; j < arr.length; j++) out.push((arr[j] * 2) / sum);
  return out;
}

function createCube(n, opts) {
  opts = opts || {};
  var mirror = !!opts.mirror && n === 3;
  var thickness = mirror ? normalizeThickness(MIRROR_THICKNESS) : null;
  var cubies = [];
  for (var x = 0; x < n; x++) {
    for (var y = 0; y < n; y++) {
      for (var z = 0; z < n; z++) {
        var c = [null, null, null, null, null, null];
        if (x === n - 1) c[0] = FACE_COLOR[0];
        if (x === 0) c[1] = FACE_COLOR[1];
        if (y === n - 1) c[2] = FACE_COLOR[2];
        if (y === 0) c[3] = FACE_COLOR[3];
        if (z === n - 1) c[4] = FACE_COLOR[4];
        if (z === 0) c[5] = FACE_COLOR[5];
        var b = { p: [x, y, z], c: c };
        if (thickness) b.dim = [thickness[x], thickness[y], thickness[z]];
        cubies.push(b);
      }
    }
  }
  return { n: n, cubies: cubies, mirror: mirror, thickness: thickness };
}

function cloneCube(cube) {
  var cubies = [];
  for (var i = 0; i < cube.cubies.length; i++) {
    var b = cube.cubies[i];
    var nb = { p: [b.p[0], b.p[1], b.p[2]], c: b.c.slice() };
    if (b.dim) nb.dim = b.dim.slice();
    cubies.push(nb);
  }
  return {
    n: cube.n,
    cubies: cubies,
    mirror: cube.mirror,
    thickness: cube.thickness ? cube.thickness.slice() : null,
  };
}

// 应用一个转动
// move = { axis: 0|1|2, layer: 0..n-1（-1 表示整体旋转）, dir: 1|-1, double: bool }
function applyMove(cube, move) {
  var n = cube.n;
  var c = (n - 1) / 2;
  var times = move.double ? 2 : 1;
  for (var t = 0; t < times; t++) {
    for (var i = 0; i < cube.cubies.length; i++) {
      var b = cube.cubies[i];
      if (move.layer !== -1 && b.p[move.axis] !== move.layer) continue;
      var pc = [b.p[0] - c, b.p[1] - c, b.p[2] - c];
      var np = rotateVec(pc, move.axis, move.dir);
      var nc = [null, null, null, null, null, null];
      for (var d = 0; d < 6; d++) {
        if (b.c[d] === null) continue;
        var nd = dirIndex(rotateVec(DIRS[d], move.axis, move.dir));
        nc[nd] = b.c[d];
      }
      b.p = [Math.round(np[0] + c), Math.round(np[1] + c), Math.round(np[2] + c)];
      b.c = nc;
      // 异形魔方（镜面）的小方块尺寸也随方块一起转
      if (b.dim) b.dim = rotateVec(b.dim, move.axis, move.dir);
    }
  }
}

function applyMoves(cube, moves) {
  for (var i = 0; i < moves.length; i++) {
    applyMove(cube, typeof moves[i] === "string" ? parseMove(moves[i], cube.n) : moves[i]);
  }
}

// 面 → 轴/层/方向（顺时针方向）
// U: y=n-1, dir=-1 ; D: y=0, dir=+1
// R: x=n-1, dir=-1 ; L: x=0, dir=+1
// F: z=n-1, dir=-1 ; B: z=0, dir=+1
var FACE_DEF = {
  U: { axis: 1, layer: "max", dir: -1 },
  D: { axis: 1, layer: "min", dir: 1 },
  R: { axis: 0, layer: "max", dir: -1 },
  L: { axis: 0, layer: "min", dir: 1 },
  F: { axis: 2, layer: "max", dir: -1 },
  B: { axis: 2, layer: "min", dir: 1 },
};

// 解析标准记号：U D L R F B，可带 ' 或 2
// 支持层数前缀，如 2R（第 2 层，4 阶以上内层）
function parseMove(str, n) {
  if (!str) return null;
  var s = String(str).trim();
  var mod = 1;
  if (s.charAt(s.length - 1) === "'") {
    mod = -1;
    s = s.slice(0, -1);
  } else if (s.charAt(s.length - 1) === "2") {
    mod = 2;
    s = s.slice(0, -1);
  }
  var double = mod === 2;
  var dirFactor = mod === -1 ? -1 : 1;

  // 整体旋转 x / y / z
  if (s === "x" || s === "y" || s === "z") {
    var ax = s === "x" ? 0 : s === "y" ? 1 : 2;
    return { axis: ax, layer: -1, dir: dirFactor, double: double, name: str };
  }

  // 层数前缀：2R / 3F ...
  var layerNum = -1;
  if (s.length > 1 && s.charAt(0) >= "1" && s.charAt(0) <= "9") {
    layerNum = parseInt(s.charAt(0), 10) - 1;
    s = s.slice(1);
  }
  // 双层记号 Rw → 等价于只转外层（视觉上足够，教程中不使用）
  if (s.length === 2 && (s.charAt(1) === "w" || s.charAt(1) === "W")) {
    s = s.charAt(0);
  }

  var face = s.toUpperCase();
  var d = FACE_DEF[face];
  if (!d) return null;
  var lay = layerNum >= 0
    ? (d.layer === "max" ? n - 1 - layerNum : layerNum)
    : (d.layer === "max" ? n - 1 : 0);
  if (lay < 0 || lay >= n) return null;
  return { axis: d.axis, layer: lay, dir: dirFactor * d.dir, double: double, name: str };
}

function moveToString(move) {
  if (move.layer === -1) {
    var a = ["x", "y", "z"][move.axis];
    if (move.double) return a + "2";
    return move.dir > 0 ? a : a + "'";
  }
  return JSON.stringify(move);
}

// 生成一次随机打乱
// opts: { facesOnly: bool } 为 true 时只转外层（教程默认），否则包含内部层
// opts.skipMiddle: 奇数阶时跳过正中间一层（它只转内部的 4 个棱块，物理上等价于
//                  整块转体，会让中心块颜色错位）
function scramble(cube, count, opts) {
  opts = opts || {};
  var n = cube.n;
  var moves = [];
  var lastAxis = -1;
  for (var i = 0; i < count; i++) {
    var axis, layer, dir;
    var guard = 0;
    do {
      axis = Math.floor(Math.random() * 3);
      dir = Math.random() < 0.5 ? 1 : -1;
      if (opts.facesOnly) {
        layer = Math.random() < 0.5 ? 0 : n - 1;
        // 避免连续同一轴（视觉上容易抵消）
      } else {
        layer = Math.floor(Math.random() * n);
        if (opts.skipMiddle && n % 2 === 1 && layer === (n - 1) / 2) {
          layer = Math.random() < 0.5 ? 0 : n - 1;
        }
      }
      guard++;
    } while (axis === lastAxis && guard < 10);
    lastAxis = axis;
    var mv = { axis: axis, layer: layer, dir: dir, double: false };
    applyMove(cube, mv);
    moves.push(mv);
  }
  return moves;
}

// 判断是否复原：每个面上的贴纸颜色一致
// 镜面魔方所有贴纸同色，改为判断「六个外表面是否都是平的」
function isSolved(cube) {
  var n = cube.n;
  if (cube.mirror) return isShapeSolved(cube);
  // 以六个面「第一个遇到」的贴纸颜色为该面基准色（偶数阶无中心块也成立）
  var ref = [null, null, null, null, null, null];
  for (var i = 0; i < cube.cubies.length; i++) {
    var b = cube.cubies[i];
    for (var d = 0; d < 6; d++) {
      if (b.c[d] === null) continue;
      var onFace =
        (d === 0 && b.p[0] === n - 1) ||
        (d === 1 && b.p[0] === 0) ||
        (d === 2 && b.p[1] === n - 1) ||
        (d === 3 && b.p[1] === 0) ||
        (d === 4 && b.p[2] === n - 1) ||
        (d === 5 && b.p[2] === 0);
      if (!onFace) return false; // 贴纸跑到面内，说明状态非法
      if (ref[d] === null) ref[d] = b.c[d];
      else if (ref[d] !== b.c[d]) return false;
    }
  }
  return true;
}

// 镜面魔方：六个外表面各自平齐即视为复原
function isShapeSolved(cube) {
  var n = cube.n;
  for (var a = 0; a < 3; a++) {
    for (var side = 0; side < 2; side++) {
      var layer = side === 0 ? 0 : n - 1;
      var ref = null;
      for (var i = 0; i < cube.cubies.length; i++) {
        var b = cube.cubies[i];
        if (b.p[a] !== layer) continue;
        var d = b.dim[a];
        if (ref === null) ref = d;
        else if (Math.abs(ref - d) > 1e-6) return false;
      }
    }
  }
  return true;
}

// 3 阶面块读取。索引：
// U 0..8  R 9..17  F 18..26  D 27..35  L 36..44  B 45..53
// 每个面均为「从外面看」的行优先排列，具体朝向见下方注释：
//   U: row0=后排, col0=左
//   R: row0=上,   col0=前
//   F: row0=上,   col0=左
//   D: row0=前,   col0=左
//   L: row0=上,   col0=后
//   B: row0=上,   col0=右
function getFacelets(cube) {
  var n = cube.n;
  if (n !== 3) throw new Error("getFacelets 仅支持 3 阶");
  var fl = new Array(54);
  for (var i = 0; i < cube.cubies.length; i++) {
    var b = cube.cubies[i];
    var x = b.p[0], y = b.p[1], z = b.p[2];
    for (var d = 0; d < 6; d++) {
      var col = b.c[d];
      if (col === null) continue;
      // R (+x)
      if (d === 0 && x === 2) fl[9 + (2 - y) * 3 + (2 - z)] = col;
      // L (-x)
      if (d === 1 && x === 0) fl[36 + (2 - y) * 3 + z] = col;
      // U (+y)
      if (d === 2 && y === 2) fl[0 + z * 3 + x] = col;
      // D (-y)
      if (d === 3 && y === 0) fl[27 + (2 - z) * 3 + x] = col;
      // F (+z)
      if (d === 4 && z === 2) fl[18 + (2 - y) * 3 + x] = col;
      // B (-z)
      if (d === 5 && z === 0) fl[45 + (2 - y) * 3 + (2 - x)] = col;
    }
  }
  return fl;
}

module.exports = {
  DIRS: DIRS,
  FACE_COLOR: FACE_COLOR,
  COLOR_HEX: COLOR_HEX,
  FACE_DEF: FACE_DEF,
  createCube: createCube,
  cloneCube: cloneCube,
  applyMove: applyMove,
  applyMoves: applyMoves,
  parseMove: parseMove,
  moveToString: moveToString,
  scramble: scramble,
  isSolved: isSolved,
  getFacelets: getFacelets,
  rotateVec: rotateVec,
  dirIndex: dirIndex,
};
