// generate.js
var qrcode = require("../../utils/qrcode");
var barcode = require("../../utils/barcode");

var CANVAS = 400;

Page({
  data: {
    isBarcode: true,
    inputText: "",
    imagePath: "",
    errorMsg: "",
    generating: false,
    showCanvas: false,
    canvasHeight: 200,
    resultBg: "#FFFFFF",

    // 条形码
    barcodeFormats: [
      { name: "CODE128（通用）", value: "code128" },
      { name: "CODE39", value: "code39" },
      { name: "EAN-13（商品码）", value: "ean13" },
    ],
    barcodeFormatIndex: 0,
    barcodeColors: [
      { name: "经典黑", fg: "#333333" },
      { name: "喵喵粉", fg: "#FF6B8A" },
      { name: "天空蓝", fg: "#4A90D9" },
      { name: "薄荷绿", fg: "#5CDBD3" },
      { name: "活力橙", fg: "#FF8C42" },
      { name: "薰衣草", fg: "#9B7ED8" },
    ],
    barcodeColorIndex: 0,

    // 二维码
    moduleStyles: [
      { name: "方块", value: "square", icon: "◼️" },
      { name: "圆角", value: "rounded", icon: "🔲" },
      { name: "圆点", value: "circle", icon: "🔵" },
    ],
    moduleStyleIndex: 0,
    colorThemes: [
      { name: "经典黑白", fg: "#333333", bg: "#FFFFFF" },
      { name: "喵喵粉", fg: "#FF6B8A", bg: "#FFF5F0" },
      { name: "天空蓝", fg: "#3B7DD8", bg: "#F5F9FF" },
      { name: "薄荷绿", fg: "#4CB8B0", bg: "#F5FFFD" },
      { name: "薰衣草", fg: "#8B6FC0", bg: "#FAF8FF" },
      { name: "活力橙", fg: "#F07B3F", bg: "#FFFBF7" },
      { name: "樱花粉", fg: "#E87D8E", bg: "#FFF5F5" },
      { name: "深海蓝", fg: "#1B3A5C", bg: "#F8FBFF" },
      { name: "抹茶绿", fg: "#5B8C5A", bg: "#F8FFF6" },
      { name: "暗夜紫", fg: "#3D2175", bg: "#FCFAFF" },
    ],
    colorThemeIndex: 0,
    customFg: "",
    customBg: "",

    fgPalette: [
      "#333333", "#000000", "#FF6B8A", "#E54545",
      "#FF8C42", "#F0A020", "#5CDBD3", "#3BA89F",
      "#3B7DD8", "#1B5C9E", "#8B6FC0", "#6C4EA0",
      "#5B8C5A", "#3D7A3D", "#8D6E63", "#555555",
    ],
    bgPalette: [
      "#FFFFFF", "#FFF5F0", "#FFF0F3", "#FFF8F0",
      "#FFFDE8", "#F0FFF8", "#F0F7FF", "#F5F0FF",
      "#F0FFFF", "#F8F8F8", "#FFF0E0", "#E8F5E9",
      "#E3F2FD", "#F3E5F5", "#FFF9C4", "#EFEBE9",
    ],
  },

  // ========== 生命周期 ==========
  onLoad: function (opts) {
    var t = opts.type || "barcode";
    this.setData({
      isBarcode: t === "barcode",
      canvasHeight: t === "barcode" ? 200 : 400,
    });
  },

  // ========== 切换类型 ==========
  onSwitchType: function (e) {
    var t = e.currentTarget.dataset.type;
    var isBarcode = t === "barcode";
    this.setData({
      isBarcode: isBarcode,
      inputText: "",
      imagePath: "",
      errorMsg: "",
      generating: false,
      showCanvas: false,
      canvasHeight: isBarcode ? 200 : 400,
    });
    this._ctx = null;
    this._canvas = null;
  },

  // ========== 输入 ==========
  onInputChange: function (e) {
    this.setData({ inputText: e.detail.value, errorMsg: "" });
  },

  // ========== 条形码设置 ==========
  onBarcodeFormatChange: function (e) {
    this.setData({ barcodeFormatIndex: parseInt(e.detail.value) });
    this._auto();
  },
  onBarcodeColorChange: function (e) {
    this.setData({ barcodeColorIndex: parseInt(e.currentTarget.dataset.index) });
    this._auto();
  },

  // ========== 二维码设置 ==========
  onModuleStyleChange: function (e) {
    this.setData({ moduleStyleIndex: parseInt(e.currentTarget.dataset.index) });
    this._auto();
  },
  onColorThemeChange: function (e) {
    var i = parseInt(e.currentTarget.dataset.index);
    this.setData({
      colorThemeIndex: i,
      customFg: "",
      customBg: "",
      resultBg: this.data.colorThemes[i].bg,
    });
    this._auto();
  },
  onFgPick: function (e) {
    this.setData({ customFg: e.currentTarget.dataset.color, colorThemeIndex: -1 });
    this._auto();
  },
  onBgPick: function (e) {
    this.setData({ customBg: e.currentTarget.dataset.color, colorThemeIndex: -1 });
    this._auto();
  },

  // ========== 自动重新生成 ==========
  _auto: function () {
    if (!this.data.inputText.trim()) return;
    // 条码验证
    if (this.data.isBarcode) {
      var t = this.data.inputText.trim();
      var f = this.data.barcodeFormats[this.data.barcodeFormatIndex].value;
      if (f === "ean13" && !/^\d{12,13}$/.test(t)) return;
      if (!/^[a-zA-Z0-9 .$/+%\-*]+$/.test(t)) return;
    }
    this._ctx = null;
    this._canvas = null;
    this._generate();
  },

  // ========== 获取颜色 ==========
  _colors: function () {
    if (this.data.isBarcode) {
      var c = this.data.barcodeColors[this.data.barcodeColorIndex];
      return { fg: c.fg, bg: "#FFFFFF" };
    }
    if (this.data.colorThemeIndex >= 0) {
      var t = this.data.colorThemes[this.data.colorThemeIndex];
      return { fg: t.fg, bg: t.bg };
    }
    return {
      fg: this.data.customFg || "#333333",
      bg: this.data.customBg || "#FFFFFF",
    };
  },

  // ========== 初始化Canvas ==========
  _initCanvas: function (cb) {
    var self = this;
    if (self._ctx) { cb(null, self._ctx, self._canvas); return; }

    var retry = 0;
    (function q() {
      wx.createSelectorQuery()
        .select("#barcodeCanvas")
        .fields({ node: true, size: true })
        .exec(function (r) {
          if (r && r[0] && r[0].node) {
            var c = r[0].node;
            var ctx = c.getContext("2d");
            var dpr = wx.getSystemInfoSync().pixelRatio || 2;
            c.width = CANVAS * dpr;
            c.height = self.data.canvasHeight * dpr;
            ctx.scale(dpr, dpr);
            self._canvas = c;
            self._ctx = ctx;
            cb(null, ctx, c);
          } else if (++retry < 6) {
            setTimeout(q, 250);
          } else {
            cb(new Error("Canvas init failed"));
          }
        });
    })();
  },

  // ========== 手动点击生成 ==========
  onGenerate: function () {
    var t = (this.data.inputText || "").trim();
    if (!t) { this.setData({ errorMsg: "请输入内容喵~" }); return; }

    if (this.data.isBarcode) {
      var f = this.data.barcodeFormats[this.data.barcodeFormatIndex].value;
      if (f === "ean13" && !/^\d{12,13}$/.test(t)) {
        this.setData({ errorMsg: "EAN-13需要12或13位数字哦~" }); return;
      }
      if (!/^[a-zA-Z0-9 .$/+%\-*]+$/.test(t)) {
        this.setData({ errorMsg: "包含不支持的字符" }); return;
      }
    }

    this._generate();
  },

  // ========== 核心生成逻辑 ==========
  _generate: function () {
    var self = this;
    var text = (self.data.inputText || "").trim();

    self.setData({ generating: true, showCanvas: true, imagePath: "", errorMsg: "" });

    setTimeout(function () {
      self._initCanvas(function (err, ctx, canvas) {
        if (err) { self.setData({ errorMsg: err.message, generating: false, showCanvas: false }); return; }

        try {
          var clr = self._colors();
          ctx.clearRect(0, 0, CANVAS, self.data.canvasHeight);

          if (self.data.isBarcode) {
            var fmt = self.data.barcodeFormats[self.data.barcodeFormatIndex].value;
            barcode.drawBarcode(text, fmt, ctx, CANVAS, self.data.canvasHeight, {
              foreground: clr.fg,
              background: clr.bg,
              showText: true,
            });
          } else {
            var sty = self.data.moduleStyles[self.data.moduleStyleIndex].value;
            qrcode.drawQRCode(text, ctx, CANVAS, {
              foreground: clr.fg,
              background: clr.bg,
              padding: 2,
              moduleStyle: sty,
            });
          }

          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0, y: 0,
            width: CANVAS,
            height: self.data.canvasHeight,
            destWidth: CANVAS * 2,
            destHeight: self.data.canvasHeight * 2,
            fileType: "png",
            quality: 1,
            success: function (res) {
              self.setData({
                imagePath: res.tempFilePath,
                generating: false,
                showCanvas: false,
                resultBg: clr.bg,
              });
              wx.vibrateShort({ type: "light" });
            },
            fail: function (e) {
              self.setData({ errorMsg: "导出失败", generating: false, showCanvas: false });
            },
          });
        } catch (e) {
          self.setData({ errorMsg: e.message || "生成失败", generating: false, showCanvas: false });
        }
      });
    }, 350);
  },

  // ========== 操作 ==========
  onRetry: function () { this._ctx = null; this._canvas = null; this._generate(); },
  onSaveImage: function () {
    if (!this.data.imagePath) return;
    var self = this;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: function () { wx.showToast({ title: "已保存到相册~", icon: "success" }); },
      fail: function (e) {
        if (e.errMsg && e.errMsg.indexOf("auth deny") > -1) {
          wx.showModal({ title: "需要相册权限", content: "请在设置中允许喵喵保存图片哦~", showCancel: false, confirmText: "知道啦" });
        } else {
          wx.showModal({ title: "保存失败", content: "是否前往设置？", success: function (r) { if (r.confirm) wx.openSetting(); } });
        }
      },
    });
  },
  onShareImage: function () {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath], current: this.data.imagePath });
  },
  onShareAppMessage: function () {
    return {
      title: "喵喵二维码",
      path: "/pages/generate/generate?type=" + (this.data.isBarcode ? "barcode" : "qrcode"),
    };
  },
});
