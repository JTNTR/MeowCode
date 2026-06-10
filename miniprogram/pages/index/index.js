// index.js - 喵喵二维码首页
Page({
  data: {},

  onLoad: function () {
    // 检查扫码API
    if (!wx.scanCode) {
      console.warn("当前版本不支持扫码API");
    }
  },

  // 条形码扫描
  onScanBarcode: function () {
    wx.navigateTo({
      url: "/pages/scan/scan?type=barcode",
      fail: function (err) {
        console.error("跳转失败:", err);
        wx.showToast({ title: "跳转失败", icon: "none" });
      },
    });
  },

  // 二维码扫描
  onScanQRCode: function () {
    wx.navigateTo({
      url: "/pages/scan/scan?type=qrcode",
      fail: function (err) {
        console.error("跳转失败:", err);
        wx.showToast({ title: "跳转失败", icon: "none" });
      },
    });
  },

  // 条形码生成
  onGenBarcode: function () {
    wx.navigateTo({
      url: "/pages/generate/generate?type=barcode",
      fail: function (err) {
        console.error("跳转失败:", err);
        wx.showToast({ title: "跳转失败", icon: "none" });
      },
    });
  },

  // 二维码生成
  onGenQRCode: function () {
    wx.navigateTo({
      url: "/pages/generate/generate?type=qrcode",
      fail: function (err) {
        console.error("跳转失败:", err);
        wx.showToast({ title: "跳转失败", icon: "none" });
      },
    });
  },

  onShareAppMessage: function () {
    return {
      title: "喵喵二维码 - 扫码识别与生成",
      path: "/pages/index/index",
    };
  },
});
