// utils/cubeRender.js
// 3D 魔方渲染引擎（Canvas 2D，无第三方依赖）
//
// 坐标：模型坐标以魔方中心为原点，范围 -1..1，y 轴朝上。
// 屏幕：x 向右、y 向下。
//
// 渲染：画家算法，先背面剔除，再按深度从远到近绘制。
// 每个小方块可以有自己的尺寸（dim），因此同一套引擎也能画镜面魔方这类异形。

var COLOR = {
  W: "#FFFFFF",
  Y: "#FFD93B",
  G: "#2ECC71",
  B: "#3B82F6",
  R: "#EF4444",
  O: "#FF9F1C",
};

// 方向索引 → 单位向量
// 0:+x(R) 1:-x(L) 2:+y(U) 3:-y(D) 4:+z(F) 5:-z(B)
var AXES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

var PLASTIC = "#1B2030";
var PLASTIC_MIRROR = "#2A2418";
var STICKER_GAP = 0.88; // 贴纸相对格子的大小

// ---------- 向量 / 矩阵 ----------

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function normalize(a) {
  var l = Math.sqrt(dot(a, a)) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function matMul(a, b) {
  var out = [];
  for (var i = 0; i < 4; i++) {
    out[i] = [];
    for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[i][k] * b[k][j];
      out[i][j] = s;
    }
  }
  return out;
}

function rotX(a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]];
}
function rotY(a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]];
}

function applyMat(m, p) {
  return [
    m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
    m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
    m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3],
  ];
}

function applyVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

// 轴角旋转矩阵（右手法则）
function axisAngle(axis, angle) {
  var x = axis[0], y = axis[1], z = axis[2];
  var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0],
    [0, 0, 0, 1],
  ];
}

// 方向 → 法线轴 / 两个切向轴
function axisOf(dir) {
  return dir <= 1 ? 0 : dir <= 3 ? 1 : 2;
}
function faceBasis(dir) {
  var a = axisOf(dir);
  var u = [0, 0, 0], v = [0, 0, 0];
  u[(a + 1) % 3] = 1;
  v[(a + 2) % 3] = 1;
  return [u, v];
}

// ---------- 渲染器 ----------

function Renderer(opts) {
  this.canvas = opts.canvas;
  this.ctx = opts.canvas.getContext("2d");
  this.width = opts.width;
  this.height = opts.height;
  this.dpr = opts.dpr || 1;
  this.n = opts.n || 3;

  this.yaw = 0.62;
  this.pitch = 0.52;
  this.zoom = 1;

  this.cubies = [];
  this.centers = []; // centers[axis][layer] = 模型坐标
  this.uniform = 2 / this.n;
  this.monochrome = false;

  this.anim = null; // { axis, axisVec, angle, layers }
  this.highlight = null; // { axis, layer, color }
}

Renderer.prototype.setSize = function (w, h, dpr) {
  this.width = w;
  this.height = h;
  this.dpr = dpr || this.dpr;
  this.canvas.width = Math.round(w * this.dpr);
  this.canvas.height = Math.round(h * this.dpr);
};

// 每层的中心坐标：均匀魔方按等距排布；镜面魔方按 thickness 累计
function computeCenters(n, thickness) {
  var axes = [[], [], []];
  for (var a = 0; a < 3; a++) {
    if (thickness && thickness.length === n) {
      var pos = -1;
      for (var i = 0; i < n; i++) {
        axes[a].push(pos + thickness[i] / 2);
        pos += thickness[i];
      }
    } else {
      var step = 2 / n;
      for (var j = 0; j < n; j++) {
        axes[a].push(-1 + step / 2 + j * step);
      }
    }
  }
  return axes;
}

Renderer.prototype.setCube = function (cube) {
  this.n = cube.n;
  this.uniform = 2 / cube.n;
  this.centers = computeCenters(cube.n, cube.thickness);
  this.cubies = [];
  for (var i = 0; i < cube.cubies.length; i++) {
    var b = cube.cubies[i];
    this.cubies.push({ p: b.p.slice(), c: b.c.slice(), dim: b.dim ? b.dim.slice() : null });
  }
};

Renderer.prototype.resetView = function () {
  this.yaw = 0.62;
  this.pitch = 0.52;
  this.zoom = 1;
};

Renderer.prototype.viewMatrix = function () {
  return matMul(rotX(this.pitch), rotY(this.yaw));
};

// 模型坐标 → 屏幕像素
Renderer.prototype.projectWith = function (view, p) {
  var q = applyMat(view, p);
  var camDist = 9;
  var z = camDist - q[2];
  var f = (camDist * 0.9) / z;
  var unit = Math.min(this.width, this.height) / (this.n > 3 ? 4.0 : 3.7);
  return {
    x: this.width / 2 + q[0] * f * this.zoom * unit,
    y: this.height / 2 - q[1] * f * this.zoom * unit,
    z: q[2],
  };
};

Renderer.prototype.project = function (p) {
  return this.projectWith(this.viewMatrix(), p);
};

Renderer.prototype.dimOf = function (b) {
  return b.dim || [this.uniform, this.uniform, this.uniform];
};

Renderer.prototype.centerOf = function (b) {
  return [
    this.centers[0][b.p[0]],
    this.centers[1][b.p[1]],
    this.centers[2][b.p[2]],
  ];
};

// 小方块某个面的四个角（模型坐标）
function faceCorners(center, dim, dir) {
  var a = axisOf(dir);
  var basis = faceBasis(dir);
  var u = basis[0], v = basis[1];
  var ua = (a + 1) % 3;
  var va = (a + 2) % 3;
  var hu = dim[ua] / 2;
  var hv = dim[va] / 2;
  var c = center.slice();
  c[a] += AXES[dir][a] * (dim[a] / 2);
  function pt(su, sv) {
    return [
      c[0] + u[0] * su * hu + v[0] * sv * hv,
      c[1] + u[1] * su * hu + v[1] * sv * hv,
      c[2] + u[2] * su * hu + v[2] * sv * hv,
    ];
  }
  return [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)];
}

// 构建绘制列表（含动画中的旋转）
Renderer.prototype.buildFaces = function () {
  var view = this.viewMatrix();
  var faces = [];
  var anim = this.anim;
  var animMat = anim ? axisAngle(anim.axisVec, anim.angle) : null;

  for (var i = 0; i < this.cubies.length; i++) {
    var b = this.cubies[i];
    var center = this.centerOf(b);
    var dim = this.dimOf(b);
    var m = null;
    if (animMat && anim.layers.indexOf(b.p[anim.axis]) >= 0) m = animMat;

    for (var d = 0; d < 6; d++) {
      var col = b.c[d];
      if (!col) continue;
      var normal = AXES[d];
      var corners = faceCorners(center, dim, d);
      if (m) {
        corners = [
          applyMat(m, corners[0]), applyMat(m, corners[1]),
          applyMat(m, corners[2]), applyMat(m, corners[3]),
        ];
        normal = applyVec(m, normal);
      }
      var nv = applyVec(view, normal);
      if (nv[2] < 0.02) continue; // 背面剔除

      var p0 = this.projectWith(view, corners[0]);
      var p1 = this.projectWith(view, corners[1]);
      var p2 = this.projectWith(view, corners[2]);
      var p3 = this.projectWith(view, corners[3]);
      faces.push({
        pts: [p0, p1, p2, p3],
        corners3: corners,
        center3: [
          (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4,
          (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4,
          (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4,
        ],
        color: this.monochrome ? "#E8C860" : COLOR[col] || "#999",
        depth: (p0.z + p1.z + p2.z + p3.z) / 4,
        cubie: b,
        dir: d,
      });
    }
  }
  faces.sort(function (a, b2) { return a.depth - b2.depth; });
  return faces;
};

function shrinkQuad(pts, inset) {
  var cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  var cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  var out = [];
  for (var i = 0; i < 4; i++) {
    out.push({ x: cx + (pts[i].x - cx) * inset, y: cy + (pts[i].y - cy) * inset });
  }
  return out;
}

// 圆角多边形（radius 为 0..0.5 的圆角比例）
function pathPolygon(ctx, pts, radius) {
  ctx.beginPath();
  if (radius <= 0.01) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  for (var k = 0; k < pts.length; k++) {
    var prev = pts[(k + pts.length - 1) % pts.length];
    var cur = pts[k];
    var next = pts[(k + 1) % pts.length];
    var p1 = { x: cur.x + (prev.x - cur.x) * radius, y: cur.y + (prev.y - cur.y) * radius };
    var p2 = { x: cur.x + (next.x - cur.x) * radius, y: cur.y + (next.y - cur.y) * radius };
    if (k === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    ctx.quadraticCurveTo(cur.x, cur.y, p2.x, p2.y);
  }
  ctx.closePath();
}

Renderer.prototype.draw = function () {
  var ctx = this.ctx;
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.clearRect(0, 0, this.width, this.height);

  var faces = this.buildFaces();
  var hl = this.highlight;

  for (var i = 0; i < faces.length; i++) {
    var f = faces[i];

    // 塑料底座
    pathPolygon(ctx, f.pts, 0.1);
    ctx.fillStyle = this.monochrome ? PLASTIC_MIRROR : PLASTIC;
    ctx.fill();

    // 贴纸
    var sticker = shrinkQuad(f.pts, STICKER_GAP);
    pathPolygon(ctx, sticker, 0.2);
    ctx.fillStyle = f.color;
    ctx.fill();
    pathPolygon(ctx, sticker, 0.2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.monochrome
      ? "rgba(120,96,30,0.55)"
      : f.color === "#FFFFFF" ? "rgba(170,170,170,0.65)" : "rgba(0,0,0,0.12)";
    ctx.stroke();

    // 教程高亮：该层所有贴纸描边
    if (hl && f.cubie.p[hl.axis] === hl.layer) {
      pathPolygon(ctx, sticker, 0.2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = hl.color || "#FF6B8A";
      ctx.stroke();
    }
  }
};

// 命中测试：返回最靠前的面
Renderer.prototype.pick = function (sx, sy) {
  var faces = this.buildFaces();
  for (var i = faces.length - 1; i >= 0; i--) {
    if (pointInQuad(sx, sy, faces[i].pts)) return faces[i];
  }
  return null;
};

function pointInQuad(x, y, pts) {
  var inside = false;
  for (var i = 0, j = 3; i < 4; j = i++) {
    var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// 屏幕点 → 该面片上的 3D 点（双线性反解）
Renderer.prototype.pointOnFace = function (face, sx, sy) {
  var pts = face.pts;
  var corners = face.corners3;
  if (!corners) return face.center3;

  function P(u, v) {
    var a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
    return {
      x: a * pts[0].x + b * pts[1].x + c * pts[2].x + d * pts[3].x,
      y: a * pts[0].y + b * pts[1].y + c * pts[2].y + d * pts[3].y,
    };
  }
  var u = 0.5, v = 0.5;
  for (var it = 0; it < 6; it++) {
    var p = P(u, v);
    var fx = p.x - sx, fy = p.y - sy;
    if (Math.abs(fx) + Math.abs(fy) < 0.05) break;
    var dux = (1 - v) * (pts[1].x - pts[0].x) + v * (pts[2].x - pts[3].x);
    var duy = (1 - v) * (pts[1].y - pts[0].y) + v * (pts[2].y - pts[3].y);
    var dvx = (1 - u) * (pts[3].x - pts[0].x) + u * (pts[2].x - pts[1].x);
    var dvy = (1 - u) * (pts[3].y - pts[0].y) + u * (pts[2].y - pts[1].y);
    var det = dux * dvy - duy * dvx;
    if (Math.abs(det) < 1e-6) break;
    u -= (fx * dvy - fy * dvx) / det;
    v -= (duy * fx - dux * fy) / det;
    u = Math.max(-0.2, Math.min(1.2, u));
    v = Math.max(-0.2, Math.min(1.2, v));
  }
  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  var bottom = lerp3(corners[0], corners[1], u);
  var top = lerp3(corners[3], corners[2], u);
  return lerp3(bottom, top, v);
};

// 由「抓住的贴纸 + 屏幕拖动方向」推导转动
//
// mode = "face"（默认）：转动你按住的那一面，判定依据是「按住的那个点跟着手指走」。
// mode = "slice"：转动被你拖动的那一行/列（4 阶以上转内层用）。
//
// grab、drag 都是屏幕坐标。返回 { axis, layer, dir } 或 null。
Renderer.prototype.inferTurn = function (face, grab, drag, mode) {
  var n = this.n;
  var view = this.viewMatrix();
  var c3 = this.pointOnFace(face, grab.x, grab.y);
  var eps = 0.2;

  function screenVel(v) {
    var p0 = this.projectWith(view, c3);
    var p1 = this.projectWith(view, [
      c3[0] + v[0] * eps,
      c3[1] + v[1] * eps,
      c3[2] + v[2] * eps,
    ]);
    return { x: p1.x - p0.x, y: p1.y - p0.y };
  }

  var normal = AXES[face.dir];
  var basis = faceBasis(face.dir);
  var su = screenVel.call(this, basis[0]);
  var sv = screenVel.call(this, basis[1]);
  var lu = Math.sqrt(su.x * su.x + su.y * su.y) || 1;
  var lv = Math.sqrt(sv.x * sv.x + sv.y * sv.y) || 1;
  var du = (su.x * drag.x + su.y * drag.y) / lu;
  var dv = (sv.x * drag.x + sv.y * drag.y) / lv;

  // 手指在面内的 3D 拖动方向
  var t = [
    basis[0][0] * du + basis[1][0] * dv,
    basis[0][1] * du + basis[1][1] * dv,
    basis[0][2] * du + basis[1][2] * dv,
  ];
  if (dot(t, t) < 1e-9) return null;

  if (mode === "slice") {
    // 转轴 = 面法线 × 拖动方向
    var w = cross(normal, t);
    var axis = -1;
    for (var i = 0; i < 3; i++) {
      if (axis < 0 || Math.abs(w[i]) > Math.abs(w[axis])) axis = i;
    }
    if (axis < 0 || Math.abs(w[axis]) < 1e-6) return null;
    var lay = face.cubie.p[axis];
    if (lay < 0 || lay >= n) return null;
    return { axis: axis, layer: lay, dir: w[axis] > 0 ? 1 : -1 };
  }

  // 面转：转动按住的那一面。
  // 方向 = 让「按住的那个点」跟着手指走的旋转方向；抓在正中心没有力臂时，
  // 用一条固定的参考力臂，保证「同方向滑动 = 同方向转面」始终一致。
  var ax = axisOf(face.dir);
  var s = dot(cross(normal, c3), t);
  if (Math.abs(s) < 0.06) {
    var ref = Math.abs(du) >= Math.abs(dv) ? basis[1] : basis[0];
    s = dot(cross(normal, ref), t);
  }
  if (Math.abs(s) < 1e-9) return null;
  return { axis: ax, layer: face.cubie.p[ax], dir: (s > 0 ? 1 : -1) * normal[ax] };
};

module.exports = {
  Renderer: Renderer,
  COLOR: COLOR,
  AXES: AXES,
  axisAngle: axisAngle,
  applyMat: applyMat,
  applyVec: applyVec,
  matMul: matMul,
  rotX: rotX,
  rotY: rotY,
  normalize: normalize,
  cross: cross,
  dot: dot,
  axisOf: axisOf,
  faceBasis: faceBasis,
};
