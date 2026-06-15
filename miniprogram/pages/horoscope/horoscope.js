// horoscope.js - 喵喵运势页
var horoscope = require("../../utils/horoscope.js");

// Canvas 逻辑尺寸
var CANVAS_W = 400;

Page({
  data: {
    signs: horoscope.SIGNS,
    selectedSignId: -1,
    fortune: null,
    loading: false,

    // 展开状态
    expanded: {
      love: false,
      career: false,
      health: false,
      wealth: false
    },

    // Canvas 导出
    showCanvas: false,
    exporting: false
  },

  onLoad: function () {
    var cur = horoscope.getCurrentSign();
    this.setData({ selectedSignId: cur.id });
    this.loadFortune(cur.id);
  },

  // ==================== 选择星座 ====================
  onSelectSign: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.selectedSignId) return;
    this.setData({
      selectedSignId: id,
      showCanvas: false,
      expanded: { love: false, career: false, health: false, wealth: false }
    });
    this.loadFortune(id);
  },

  // ==================== 展开/收起运势详情 ====================
  onToggleDetail: function (e) {
    var key = e.currentTarget.dataset.key;
    var expanded = this.data.expanded;
    expanded[key] = !expanded[key];
    this.setData({ expanded: expanded });
  },

  // ==================== 加载运势 ====================
  loadFortune: function (signId) {
    var self = this;
    self.setData({ loading: true });
    var fortune = horoscope.getDailyFortune(signId);
    self.setData({ fortune: fortune, loading: false });
  },

  // ==================== 导出运势图片 ====================
  onExportImage: function () {
    var self = this;
    if (!self.data.fortune) return;

    wx.vibrateShort({ type: "light" });
    self.setData({ exporting: true, showCanvas: true });

    setTimeout(function () {
      self._drawFortuneCard();
    }, 200);
  },

  // ==================== Canvas 绘制 ====================
  _drawFortuneCard: function () {
    var self = this;
    var fortune = self.data.fortune;

    wx.createSelectorQuery()
      .select("#fortuneCanvas")
      .fields({ node: true, size: true })
      .exec(function (r) {
        if (!r || !r[0]) {
          setTimeout(function () { self._drawFortuneCard(); }, 150);
          return;
        }

        var c = r[0].node;
        var ctx = c.getContext("2d");
        var dpr = wx.getSystemInfoSync().pixelRatio || 2;

        // 先计算需要的高度
        var H = self._calcCanvasHeight(fortune);
        c.width = CANVAS_W * dpr;
        c.height = H * dpr;
        ctx.scale(dpr, dpr);

        self._renderCard(ctx, fortune, H);

        setTimeout(function () {
          wx.canvasToTempFilePath({
            canvas: c,
            x: 0, y: 0,
            width: CANVAS_W,
            height: H,
            destWidth: CANVAS_W * 2,
            destHeight: H * 2,
            success: function (res) {
              // 直接保存到相册
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: function () {
                  self.setData({ showCanvas: false, exporting: false });
                  wx.showToast({ title: "已保存到相册 🎉", icon: "success" });
                },
                fail: function (err) {
                  self.setData({ showCanvas: false, exporting: false });
                  if (err.errMsg && err.errMsg.indexOf("auth deny") >= 0) {
                    wx.showModal({
                      title: "提示",
                      content: "请允许保存图片到相册",
                      showCancel: false,
                      success: function () { wx.openSetting(); }
                    });
                  } else {
                    wx.showToast({ title: "保存失败，请重试", icon: "none" });
                  }
                }
              });
            },
            fail: function (err) {
              console.error("导出失败:", err);
              self.setData({ showCanvas: false, exporting: false });
              wx.showToast({ title: "导出失败，请重试", icon: "none" });
            }
          });
        }, 400);
      });
  },

  // ==================== 计算画布高度 ====================
  _calcCanvasHeight: function (f) {
    var h = 0;
    var self = this;
    h += 50;  // 顶部标题栏 padding
    h += 50;  // 标题栏
    h += 30;  // 间距
    h += 70;  // 星座图标
    h += 60;  // 名称+日期
    h += 20;  // 间距
    h += 60;  // 综合运势星
    h += 20;  // 间距
    // 四个维度（标题行 + 详情文本）
    var cats = ['love','career','health','wealth'];
    for (var i = 0; i < cats.length; i++) {
      h += 36; // 标题行
      h += self._textHeight(f.texts[cats[i]], 330) + 10; // 详情
    }
    h += 20;
    h += 50; // 幸运元素
    h += 10;
    h += 36; // 箴言
    h += 40; // 底部
    h += 20; // 底部留白
    return Math.max(h + 20, 800);
  },

  // 计算文本在指定宽度下的高度
  _textHeight: function (text, maxW) {
    var lines = this._wrapText(text, maxW);
    return lines.length * 22 + 16;
  },

  // ==================== Canvas 渲染 ====================
  _renderCard: function (ctx, f, H) {
    var W = CANVAS_W;
    var self = this;
    var y = 0;

    // ---- 全局背景 ----
    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#FFF5F0');
    bgGrad.addColorStop(0.5, '#FFF0F3');
    bgGrad.addColorStop(1, '#FFE8EC');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 装饰圆
    ctx.fillStyle = 'rgba(255,107,138,0.05)';
    ctx.beginPath(); ctx.arc(W / 2, -20, 200, 0, Math.PI * 2); ctx.fill();

    // ---- 标题栏 ----
    y = 20;
    self._roundRect(ctx, 20, y, W - 40, 50, 18);
    var hGrad = ctx.createLinearGradient(20, y, W - 20, y + 50);
    hGrad.addColorStop(0, '#FF6B8A'); hGrad.addColorStop(1, '#FF8E9E');
    ctx.fillStyle = hGrad; ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 20px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐱 喵喵运势 · 今日星运', W / 2, y + 25);
    y += 70;

    // ---- 星座主卡 ----
    var cardTop = y;
    var sign = f.sign;

    // 图标
    ctx.fillStyle = '#333';
    ctx.font = '52px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(sign.emoji, W / 2, y);
    y += 62;

    // 名称 + 日期
    ctx.fillStyle = '#333';
    ctx.font = 'bold 26px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(sign.name, W / 2, y);
    y += 30;

    var dateRange = sign.month[0] + '/' + sign.month[1] + ' - ' + sign.monthEnd[0] + '/' + sign.monthEnd[1];
    ctx.fillStyle = '#BB9A9A';
    ctx.font = '15px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(dateRange + ' · ' + sign.element + '象 · ' + sign.ruler, W / 2, y);
    y += 28;

    // 关键词徽章
    var kwW = ctx.measureText(f.keyword).width + 24;
    self._roundRect(ctx, W / 2 - kwW / 2, y, kwW, 28, 14);
    ctx.fillStyle = 'rgba(255,107,138,0.12)';
    ctx.fill();
    ctx.fillStyle = '#FF6B8A';
    ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(f.keyword, W / 2, y + 14);
    y += 40;

    // ---- 主卡片背景 ----
    var cardH = y - cardTop;
    // 画卡片背景（在内容之后画，作为底层）
    // 实际上canvas不能layering，所以我们已经画了内容，现在画一个半透明底

    // ---- 综合运势 ----
    y += 4;
    ctx.strokeStyle = '#FFE8EC'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
    y += 16;

    ctx.fillStyle = '#555';
    ctx.font = 'bold 17px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('今日综合运势', W / 2, y);
    y += 30;

    // 五颗星 + 分数
    var starW = 30, starGap = 4, totalStarW = 5 * starW + 4 * starGap;
    var starStartX = W / 2 - totalStarW / 2;
    ctx.font = '26px sans-serif';
    ctx.textBaseline = 'middle';
    for (var si = 0; si < f.starsArray.length; si++) {
      var ss = f.starsArray[si];
      ctx.fillStyle = (ss === 'full' || ss === 'half') ? '#FFA940' : '#E8E0D8';
      ctx.textAlign = 'center';
      ctx.fillText('★', starStartX + si * (starW + starGap) + starW / 2, y);
    }
    // 数值评分
    ctx.fillStyle = '#FF6B8A';
    ctx.font = 'bold 24px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(f.overall.toFixed(1), starStartX + totalStarW + 10, y);
    y += 38;

    // ---- 分隔 ----
    ctx.strokeStyle = '#FFE8EC';
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
    y += 16;

    // ---- 各维度运势（含详情文案） ----
    var categories = [
      { key: 'love', icon: '💕', label: '爱情运势' },
      { key: 'career', icon: '💼', label: '事业学业' },
      { key: 'health', icon: '🏥', label: '健康运势' },
      { key: 'wealth', icon: '💰', label: '财运运势' }
    ];

    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var starArr = f.scoreStars[cat.key];
      var detailText = f.texts[cat.key];

      // 图标
      ctx.fillStyle = '#333';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(cat.icon, 36, y + 12);

      // 标签
      ctx.fillStyle = '#555';
      ctx.font = 'bold 16px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(cat.label, 64, y + 12);

	      // 星星 + 分数
	      var smallStarW = 15, smallGap = 2;
	      var totalSmallW = 5 * smallStarW + 4 * smallGap;
	      var sStartX = W - 40 - totalSmallW - 30;
	      ctx.font = '14px sans-serif';
	      for (var sj = 0; sj < starArr.length; sj++) {
	        var st = starArr[sj];
	        ctx.fillStyle = (st === 'full' || st === 'half') ? '#FFA940' : '#E8E0D8';
	        ctx.textAlign = 'center';
	        ctx.fillText('★', sStartX + sj * (smallStarW + smallGap) + smallStarW / 2, y + 12);
	      }
	      ctx.fillStyle = '#FF6B8A';
	      ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
	      ctx.textAlign = 'right';
	      ctx.fillText(f.scores[cat.key].toFixed(1), W - 40, y + 12);
      y += 30;

      // 详情文案（自动换行）
      var lines = self._wrapText(detailText, W - 72);
      for (var li = 0; li < lines.length; li++) {
        ctx.fillStyle = '#888';
        ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(lines[li], 36, y);
        y += 22;
      }
      y += 10;

      // 小分隔
      if (i < categories.length - 1) {
        ctx.strokeStyle = '#FFF5F0';
        ctx.beginPath(); ctx.moveTo(60, y - 4); ctx.lineTo(W - 60, y - 4); ctx.stroke();
      }
    }

    // ---- 分隔 ----
    ctx.strokeStyle = '#FFE8EC';
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
    y += 16;

    // ---- 幸运元素 ----
    ctx.fillStyle = '#555';
    ctx.font = 'bold 16px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('🍀 今日幸运元素', W / 2, y);
    y += 30;

    var lucky = f.lucky;
    // 三栏分布
    var colW = W / 3;
    // 幸运色
    ctx.fillStyle = '#888';
    ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('幸运色', colW / 2, y);
    ctx.fillStyle = lucky.color.hex;
    ctx.beginPath(); ctx.arc(colW / 2, y + 26, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#666';
    ctx.fillText(lucky.color.name, colW / 2, y + 44);

    // 幸运数字
    ctx.fillStyle = '#888';
    ctx.fillText('幸运数字', W / 2, y);
    ctx.fillStyle = '#FF6B8A';
    ctx.font = 'bold 28px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(String(lucky.number), W / 2, y + 26);

    // 幸运方位
    ctx.fillStyle = '#888';
    ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('幸运方位', W - colW / 2, y);
    ctx.fillStyle = '#666';
    ctx.font = 'bold 18px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(lucky.direction, W - colW / 2, y + 26);
    y += 60;

    // ---- 分隔 ----
    ctx.strokeStyle = '#FFE8EC';
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
    y += 16;

    // ---- 每日箴言 ----
    ctx.fillStyle = '#FF6B8A';
    ctx.font = 'italic 15px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    var mottoLines = self._wrapText('「' + f.motto + '」', W - 80);
    for (var ml = 0; ml < mottoLines.length; ml++) {
      ctx.fillText(mottoLines[ml], W / 2, y);
      y += 22;
    }
    y += 10;

    // ---- 底部 ----
    ctx.fillStyle = '#DDC0C0';
    ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🐾 喵喵二维码 · 星座运势', W / 2, y);
    y += 18;
    ctx.fillText(f.date + ' ' + f.weekDay, W / 2, y);
    y += 18;
    ctx.fillStyle = '#DDD0D0';
    ctx.fillText('仅供娱乐 · 愿你每天都开心快乐 ✨', W / 2, y);
  },

  // ==================== 文本自动换行 ====================
  _wrapText: function (text, maxW) {
    var lines = [];
    var current = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var test = current + ch;
      // 用一个大致的测量（中文约14px宽，英文约7px宽）
      var w = this._measureText(test);
      if (w > maxW && current.length > 0) {
        lines.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  },

  _measureText: function (text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code > 127) {
        w += 14; // 中文等宽字符
      } else {
        w += 7;  // 英文/数字
      }
    }
    return w;
  },

  // 辅助：绘制圆角矩形
  _roundRect: function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // ==================== 分享 ====================
  onShareAppMessage: function () {
    var f = this.data.fortune;
    var title = f
      ? '🐱 ' + f.sign.emoji + ' ' + f.sign.name + '今日运势'
      : '🐱 喵喵运势 - 查看你的今日星座运势';
    return {
      title: title,
      path: '/pages/horoscope/horoscope'
    };
  }
});
