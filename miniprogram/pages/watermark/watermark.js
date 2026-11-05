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
    savingVideo: false,
    // <video> 不能稳定识别 cloud:// fileID，解析成功后换成临时 https 链接
    videoPlayUrl: "",
    videoMeta: "",
    videoPoster: "",
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
      videoPlayUrl: "",
      videoMeta: "",
      videoPoster: "",
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
   *
   * 注意：URL 的 path/query 里本来就可以有「.」（域名、文件名、%2E），
   * 所以字符类里不能排除「.」，只在末尾统一把标语点去掉。
   */
  _extractUrl: function (text) {
    if (!text) return null;

    // 链接允许的字符：只排除空白和中文标点，ASCII 的 ? = . & ! 都要保留，
    // 否则会把 query 里的 xsec_token 截掉。
    var TAIL = "[^\\s，。！？；：（）【】《》「」『』、…—\"'<>\\u3000]+";

    // 小红书链接模式
    // 短链域名有两个：老的 xhslink.com 和 App 现在分享出来的 xhslink.cn
    var xhsPatterns = [
      new RegExp("https?://(?:www\\.)?xhslink\\.(?:com|cn)/" + TAIL, "i"),
      new RegExp("https?://xhsurl\\.com/" + TAIL, "i"),
      new RegExp("https?://(?:www\\.)?xiaohongshu\\.com/" + TAIL, "i"),
    ];

    // 抖音链接模式
    var dyPatterns = [
      new RegExp("https?://v\\.douyin\\.com/" + TAIL, "i"),
      new RegExp("https?://(?:www\\.)?iesdouyin\\.com/" + TAIL, "i"),
      new RegExp("https?://(?:www\\.)?douyin\\.com/" + TAIL, "i"),
    ];

    var patterns = this.data.platform === "xiaohongshu"
      ? xhsPatterns.concat(dyPatterns)  // 兜底：也尝试匹配对方平台的链接
      : dyPatterns.concat(xhsPatterns);

    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match) {
        // 去掉链接末尾粘连的中英文标点
        return match[0].replace(/[，,。.！!？?）\)】\]》>、\s]+$/, "");
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

    self.setData({ loading: true, error: "", result: null, videoPlayUrl: "", videoMeta: "", videoPoster: "" });

    wx.cloud.callFunction({
      name: "watermarkParser",
      data: {
        platform: self.data.platform,
        shareUrl: shareUrl,
      },
    }).then(function (res) {
      var result = res.result || {};
      if (result.success && result.data) {
        wx.vibrateShort({ type: "light" });
        // rawImages 只是云存储下载失败时的兜底地址，不参与渲染，
        // 放在页面实例上，避免 setData 传一大串 URL
        self._rawImages = result.data.rawImages || [];
        delete result.data.rawImages;
        self.setData({
          result: result.data,
          loading: false,
        });
        self._resolveVideoUrl(result.data);
      } else {
        self._rawImages =
          (result.data && result.data.rawImages) ||
          (result.data && result.data.images) ||
          [];
        if (result.data) delete result.data.rawImages;
        self.setData({
          error: result.error || "解析失败，请检查链接",
          // 视频作品会带上标题/封面，让用户知道链接本身是有效的
          result: result.data || null,
          loading: false,
        });
        self._resolveVideoUrl(result.data);
      }
    }).catch(function (err) {
      console.error("云函数调用失败:", err);
      var msg = (err && (err.errMsg || err.message)) || "";
      self.setData({
        error:
          msg.indexOf("timeout") >= 0 || msg.indexOf("TIME_LIMIT") >= 0
            ? "解析超时了，请稍后重试（视频作品要先下载并转存，通常需要 20~40 秒，可再试一次）"
            : "网络请求失败，请检查云开发环境配置或稍后重试",
        loading: false,
      });
    });
  },

  // ==================== 视频 ====================

  /**
   * <video> 组件的 src / poster 对 cloud:// fileID 支持不稳定（基础库、机型差异大），
   * 统一换成临时 https 链接再喂给播放器。
   * 没有 fileID（云函数转存失败）时不设播放地址，页面会退回封面 + 错误提示。
   */
  _resolveVideoUrl: function (data) {
    var self = this;
    var video = data && data.video;
    if (!video || !video.fileID) return;

    self.setData({ videoMeta: self._videoMeta(video) });

    wx.cloud.getTempFileURL({
      fileList: [video.fileID],
      success: function (res) {
        var url = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || "";
        self.setData({ videoPlayUrl: url || video.url || "" });
      },
      fail: function () {
        self.setData({ videoPlayUrl: video.url || "" });
      },
    });

    // <video> 的 poster 同样不认 cloud:// fileID，封面也换成临时链接；
    // 换不到就交给 <image> 渲染（<image> 支持 cloud://）
    var cover = data.cover;
    if (cover && cover.indexOf("cloud://") === 0) {
      wx.cloud.getTempFileURL({
        fileList: [cover],
        success: function (res) {
          var u = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
          if (u) self.setData({ videoPoster: u });
        },
      });
    } else {
      self.setData({ videoPoster: cover || "" });
    }
  },

  /**
   * 拼「时长 · 分辨率 · 体积」一行信息，字段缺失就跳过
   */
  _videoMeta: function (video) {
    var parts = [];

    var ms = video.duration || 0;
    if (ms > 0) {
      var total = Math.round(ms / 1000);
      var m = Math.floor(total / 60);
      var s = total % 60;
      parts.push((m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s));
    }

    if (video.width && video.height) {
      parts.push(video.width + "×" + video.height);
    }

    var bytes = video.size || 0;
    if (bytes > 0) {
      parts.push((bytes / 1048576).toFixed(1) + "MB");
    }

    return parts.join(" · ");
  },

  onSaveVideo: function () {
    var self = this;
    var video = self.data.result && self.data.result.video;
    if (!video) {
      wx.showToast({ title: "视频地址无效", icon: "none" });
      return;
    }
    if (self.data.savingVideo) return;

    self.setData({ savingVideo: true });
    wx.showLoading({ title: "保存中...", mask: true });

    function done(err) {
      wx.hideLoading();
      self.setData({ savingVideo: false });
      if (!err) {
        wx.showToast({ title: "已保存到相册", icon: "success" });
        return;
      }
      console.error("保存视频失败:", err);
      if (self._isAuthDenied(err)) {
        self._showAuthModal();
      } else {
        wx.showToast({ title: "保存失败，请重试", icon: "none" });
      }
    }

    function save(filePath) {
      wx.saveVideoToPhotosAlbum({
        filePath: filePath,
        success: function () {
          done(null);
        },
        fail: function (err) {
          done(err || new Error("保存失败"));
        },
      });
    }

    // 云存储文件只能通过 wx.cloud.downloadFile 下载，不受合法域名限制
    if (video.fileID) {
      wx.cloud.downloadFile({
        fileID: video.fileID,
        success: function (res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            save(res.tempFilePath);
          } else {
            done(new Error("视频下载失败"));
          }
        },
        fail: function (err) {
          done(err || new Error("视频下载失败"));
        },
      });
      return;
    }

    // 转存失败时云函数只回了 CDN 地址，直连下载需要配 downloadFile 合法域名
    wx.downloadFile({
      url: video.url,
      success: function (res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          save(res.tempFilePath);
        } else {
          done(new Error("视频下载失败（" + res.statusCode + "）"));
        }
      },
      fail: function (err) {
        done(err || new Error("视频下载失败"));
      },
    });
  },

  // ==================== 图片下载 ====================

  /**
   * 把图片源（cloud:// fileID 或 http 地址）落到本地临时文件。
   * 云函数已把图片转存到云存储，所以正常情况下走 wx.cloud.downloadFile，
   * 不受 downloadFile 合法域名限制；转存失败或云存储权限不足时，
   * 调用方会传 fallbackSrc（原始 CDN 地址）再试一次。
   */
  _downloadImage: function (src, cb, fallbackSrc) {
    if (!src) {
      cb(new Error("图片地址为空"));
      return;
    }

    var self = this;

    if (src.indexOf("cloud://") === 0) {
      wx.cloud.downloadFile({
        fileID: src,
        success: function (res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            cb(null, res.tempFilePath);
          } else {
            self._downloadRemote(fallbackSrc, cb);
          }
        },
        fail: function () {
          self._downloadRemote(fallbackSrc, cb);
        },
      });
      return;
    }

    self._downloadRemote(src, cb);
  },

  _downloadRemote: function (src, cb) {
    if (!src) {
      cb(new Error("图片下载失败"));
      return;
    }
    wx.downloadFile({
      src: src,
      success: function (res) {
        if (res.statusCode === 200 && res.tempFilePath) {
          cb(null, res.tempFilePath);
        } else {
          cb(new Error("图片下载失败（" + res.statusCode + "）"));
        }
      },
      fail: function (err) {
        cb(err || new Error("图片下载失败"));
      },
    });
  },

  _saveOne: function (src, cb, fallbackSrc) {
    var self = this;
    self._downloadImage(src, function (err, filePath) {
      if (err) {
        cb(err);
        return;
      }
      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success: function () {
          cb(null);
        },
        fail: function (saveErr) {
          cb(saveErr || new Error("保存失败"));
        },
      });
    }, fallbackSrc);
  },

  _isAuthDenied: function (err) {
    var msg = (err && (err.errMsg || err.message)) || "";
    return msg.indexOf("auth deny") >= 0 || msg.indexOf("auth denied") >= 0;
  },

  _showAuthModal: function () {
    wx.showModal({
      title: "需要相册权限",
      content: "请在设置中允许小程序保存图片到相册",
      showCancel: false,
      success: function () {
        wx.openSetting();
      },
    });
  },

  // ==================== 图片预览 ====================

  onPreviewImage: function (e) {
    var index = e.currentTarget.dataset.index;
    var images = this.data.result.images;
    if (!images || images.length === 0) return;

    var current = images[index] || images[0];
    var hasCloud = false;
    for (var i = 0; i < images.length; i++) {
      if (images[i].indexOf("cloud://") === 0) {
        hasCloud = true;
        break;
      }
    }

    // previewImage 不认 cloud:// fileID，先换成临时 https 链接
    if (!hasCloud) {
      wx.previewImage({ urls: images, current: current });
      return;
    }

    wx.cloud.getTempFileURL({
      fileList: images.filter(function (u) {
        return u.indexOf("cloud://") === 0;
      }),
      success: function (res) {
        var map = {};
        (res.fileList || []).forEach(function (f) {
          if (f.tempFileURL) map[f.fileID] = f.tempFileURL;
        });
        var urls = images.map(function (u) {
          return map[u] || u;
        });
        wx.previewImage({
          urls: urls,
          current: map[current] || urls[index] || urls[0],
        });
      },
      fail: function () {
        wx.previewImage({ urls: images, current: current });
      },
    });
  },

  // ==================== 保存单张图片 ====================

  onSaveImage: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var imageUrl = self.data.result.images[index];
    var rawUrl = (self._rawImages || [])[index] || "";

    if (!imageUrl) {
      wx.showToast({ title: "图片地址无效", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中...", mask: true });
    self._saveOne(imageUrl, function (err) {
      wx.hideLoading();
      if (!err) {
        wx.showToast({ title: "已保存到相册", icon: "success" });
        return;
      }
      console.error("保存图片失败:", err);
      if (self._isAuthDenied(err)) {
        self._showAuthModal();
      } else {
        wx.showToast({ title: "保存失败，请重试", icon: "none" });
      }
    }, rawUrl);
  },

  // ==================== 保存全部图片 ====================

  onSaveAll: function () {
    var self = this;
    var images = self.data.result.images;

    if (!images || images.length === 0) {
      wx.showToast({ title: "没有可保存的图片", icon: "none" });
      return;
    }
    if (self.data.savingAll) return;

    self.setData({
      savingAll: true,
      saveProgress: { current: 0, total: images.length },
    });

    var successCount = 0;
    var failCount = 0;
    var authDenied = false;
    var rawImages = self._rawImages || [];

    function saveOne(index) {
      if (index >= images.length || authDenied) {
        self.setData({ savingAll: false });
        if (authDenied) {
          self._showAuthModal();
        } else {
          wx.showToast({
            title:
              "已保存 " + successCount + " 张" +
              (failCount > 0 ? "，失败 " + failCount + " 张" : ""),
            icon: successCount > 0 ? "success" : "none",
          });
        }
        return;
      }

      self.setData({
        saveProgress: { current: index + 1, total: images.length },
      });

      self._saveOne(images[index], function (err) {
        if (!err) {
          successCount++;
        } else if (self._isAuthDenied(err)) {
          authDenied = true;
        } else {
          failCount++;
          console.error("保存第 " + (index + 1) + " 张失败:", err);
        }
        saveOne(index + 1);
      }, rawImages[index] || "");
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