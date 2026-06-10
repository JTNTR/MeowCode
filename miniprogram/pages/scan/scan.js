// scan.js
Page({
  data: {
    isBarcode: true,
    scanResult: "",
    scanError: "",
    scanFormat: "",
    scanRawResult: "",
    scanCharSet: "",
  },

  onLoad(options) {
    const type = options.type || "barcode";
    this.setData({
      isBarcode: type === "barcode",
    });
  },

  // Switch between barcode and QR code mode
  onSwitchType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      isBarcode: type === "barcode",
      scanResult: "",
      scanError: "",
    });
  },

  // Start scanning
  onStartScan() {
    const that = this;
    const scanType = this.data.isBarcode ? "barCode" : "qrCode";

    wx.scanCode({
      scanType: [scanType],
      success(res) {
        console.log("scan success:", res);
        that.setData({
          scanResult: res.result || "",
          scanError: "",
          scanFormat: res.scanType || "",
          scanRawResult: res.rawData || "",
          scanCharSet: res.charSet || "",
        });

        // Vibrate on success
        wx.vibrateShort({
          type: "light",
        });
      },
      fail(err) {
        console.log("scan fail:", err);
        // User cancelled or error
        if (err.errMsg && err.errMsg.indexOf("cancel") === -1) {
          let errorMsg = "扫描失败，请重试";
          if (err.errMsg) {
            if (err.errMsg.indexOf("not support") > -1) {
              errorMsg = "当前设备不支持扫码功能";
            } else if (err.errMsg.indexOf("auth deny") > -1) {
              errorMsg = "相机权限被拒绝，请在设置中开启";
            } else if (err.errMsg.indexOf("camera") > -1) {
              errorMsg = "相机不可用，请检查权限设置";
            }
          }
          that.setData({
            scanError: errorMsg,
            scanResult: "",
          });
        }
      },
    });
  },

  // Copy scan result to clipboard
  onCopyResult() {
    if (!this.data.scanResult) return;

    wx.setClipboardData({
      data: this.data.scanResult,
      success() {
        wx.showToast({
          title: "已复制",
          icon: "success",
          duration: 1500,
        });
      },
      fail() {
        wx.showToast({
          title: "复制失败",
          icon: "none",
        });
      },
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.isBarcode ? "条形码扫描" : "二维码扫描",
      path: "/pages/scan/scan?type=" + (this.data.isBarcode ? "barcode" : "qrcode"),
    };
  },
});
