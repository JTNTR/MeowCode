// pages/watermark/watermark.js
// 小红书 & 抖音无水印图片提取页面
Page({
  data: {
    platform: "xiaohongshu", // xiaohongshu | douyin
    inputText: "",            // 用户粘贴的文案（可能包含多余文字）
    loading: false,
    result: null, // { title, author, images[], videoUrl, cover }
    error: "",
    savingAll: false,
    saveProgress: { current: 0, total: 0 },
  },

  onLoad: function (options) {
    var platform = options.platform || "xiaohongshu";
    this.setData({ platform: platform });
    this._updateTitle(platform);
  },

  _updateTitle: function (platform) {
    wx.setNavigationBarTitle({
      title: platform === "xiaohongshu" ? "小红书去水印" : "抖音去水印",
    });
  },

  // ==================== 平台切换 ====================

  onSwitchPlatform: function (e) {
    var platform = e.currentTarget.dataset.platform;
    if (platform === this.data.platform) return;
    this.setData({
      platform: platform,
      inputText: "",
      result: null,
      error: "",
      loading: false,
    });
    this._updateTitle(platform);
  },

  // ==================== 输入处理 ====================

  onInputText: function (e) {
    this.setData({ inputText: e.detail.value, error: "" });
  },

  onClear: function () {
    this.setData({ inputText: "", error: "" });
  },

  onPaste: function () {
    var self = this;
    wx.getClipboardData({
      success: function (res) {
        if (res.data) {
          self.setData({ inputText: res.data.trim(), error: "" });
          wx.showToast({ title: "已粘贴", icon: "success", duration: 1000 });
        } else {
          wx.showToast({ title: "剪贴板为空", icon: "none" });
        }
      },
      fail: function () {
        wx.showToast({ title: "请长按输入框粘贴", icon: "none" });
      },
    });
  },

  // ==================== URL 自动提取 ====================

  /**
   * 从用户粘贴的文案中自动提取分享链接
   * 支持小红书和抖音的各种链接格式
   */
  _extractUrl: function (text) {
    if (!text) return null;

    // 小红书链接模式
    var xhsPatterns = [
      /https?:\/\/xhslink\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/xhsurl\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/www\.xiaohongshu\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/xiaohongshu\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
    ];

    // 抖音链接模式
    var dyPatterns = [
      /https?:\/\/v\.douyin\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/www\.douyin\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/douyin\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
      /https?:\/\/www\.iesdouyin\.com\/[^\s，,。\.！!？?）\)】\]》>、]+/i,
    ];

    var patterns = this.data.platform === "xiaohongshu"
      ? xhsPatterns.concat(dyPatterns)  // 兜底：也尝试匹配对方平台的链接
      : dyPatterns.concat(xhsPatterns);

    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match) {
        // 清理链接末尾的标点符号
        return match[0].replace(/[，,。\.！!？?）\)】\]》>、\s]+$/, "");
      }
    }

    return null;
  },

  // ==================== 解析链接 ====================

  onParse: function () {
    var self = this;
    var inputText = self.data.inputText.trim();

    if (!inputText) {
      self.setData({ error: "请粘贴分享文案" });
      return;
    }

    // 自动从文案中提取链接
    var shareUrl = self._extractUrl(inputText);
    if (!shareUrl) {
      self.setData({
        error: "未识别到有效的分享链接，请确认已复制完整的分享文案",
      });
      return;
    }

    self.setData({ loading: true, error: "", result: null });

    wx.cloud.callFunction({
      name: "watermarkParser",
      data: {
        platform: self.data.platform,
        shareUrl: shareUrl,
      },
    }).then(function (res) {
      if (res.result && res.result.success) {
        wx.vibrateShort({ type: "light" });
        self.setData({
          result: res.result.data,
          loading: false,
        });
      } else {
        self.setData({
          error: (res.result && res.result.error) || "解析失败，请检查链接",
          loading: false,
        });
      }
    }).catch(function (err) {
      console.error("云函数调用失败:", err);
      self.setData({
        error: "网络请求失败，请检查云开发环境配置或稍后重试",
        loading: false,
      });
    });
  },

  // ==================== 图片预览 ====================

  onPreviewImage: function (e) {
    var index = e.currentTarget.dataset.index;
    var images = this.data.result.images;
    if (images && images.length > 0) {
      wx.previewImage({
        urls: images,
        current: images[index] || images[0],
      });
    }
  },

  // ==================== 保存单张图片 ====================

  onSaveImage: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var imageUrl = self.data.result.images[index];

    if (!imageUrl) {
      wx.showToast({ title: "图片地址无效", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中..." });
    wx.getImageInfo({
      src: imageUrl,
      success: function (info) {
        wx.saveImageToPhotosAlbum({
          filePath: info.path,
          success: function () {
            wx.hideLoading();
            wx.showToast({ title: "已保存到相册", icon: "success" });
          },
          fail: function (err) {
            wx.hideLoading();
            if (err.errMsg && err.errMsg.indexOf("auth deny") >= 0) {
              wx.showModal({
                title: "需要相册权限",
                content: "请在设置中允许小程序保存图片到相册",
                showCancel: false,
                success: function () {
                  wx.openSetting();
                },
              });
            } else {
              wx.showToast({ title: "保存失败，请重试", icon: "none" });
            }
          },
        });
      },
      fail: function (err) {
        wx.hideLoading();
        console.error("下载图片失败:", err);
        wx.showToast({ title: "图片下载失败", icon: "none" });
      },
    });
  },

  // ==================== 保存全部图片 ====================

  onSaveAll: function () {
    var self = this;
    var images = self.data.result.images;

    if (!images || images.length === 0) {
      wx.showToast({ title: "没有可保存的图片", icon: "none" });
      return;
    }

    self.setData({
      savingAll: true,
      saveProgress: { current: 0, total: images.length },
    });

    var successCount = 0;
    var failCount = 0;
    var authDenied = false;

    function saveOne(index) {
      if (index >= images.length || authDenied) {
        self.setData({ savingAll: false });
        if (authDenied) {
          wx.showModal({
            title: "需要相册权限",
            content: "请在设置中允许小程序保存图片到相册",
            showCancel: false,
            success: function () {
              wx.openSetting();
            },
          });
        } else {
          wx.showToast({
            title: "已保存 " + successCount + " 张" + (failCount > 0 ? "，失败 " + failCount + " 张" : ""),
            icon: successCount > 0 ? "success" : "none",
          });
        }
        return;
      }

      self.setData({
        saveProgress: { current: index + 1, total: images.length },
      });

      wx.getImageInfo({
        src: images[index],
        success: function (info) {
          wx.saveImageToPhotosAlbum({
            filePath: info.path,
            success: function () {
              successCount++;
              saveOne(index + 1);
            },
            fail: function (err) {
              if (err.errMsg && err.errMsg.indexOf("auth deny") >= 0) {
                authDenied = true;
                saveOne(index + 1);
              } else {
                failCount++;
                saveOne(index + 1);
              }
            },
          });
        },
        fail: function () {
          failCount++;
          saveOne(index + 1);
        },
      });
    }

    saveOne(0);
  },

  // ==================== 分享 ====================

  onShareAppMessage: function () {
    return {
      title: "喵喵二维码 - 无水印提取",
      path: "/pages/watermark/watermark?platform=" + this.data.platform,
    };
  },
});