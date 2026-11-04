// 云函数：去水印解析器
// 支持小红书和抖音的分享链接解析，提取无水印图片/视频URL
const cloud = require("wx-server-sdk");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ==================== HTTP 请求工具 ====================

/**
 * 发起 HTTP GET 请求，支持自动跟随重定向（含 HTML meta-refresh）
 * @param {string} requestUrl - 目标URL
 * @param {object} extraHeaders - 额外的请求头
 * @param {number} maxRedirects - 最大重定向次数
 * @returns {Promise<{body: string, finalUrl: string, statusCode: number}>}
 */
function httpGet(requestUrl, extraHeaders, maxRedirects) {
  return new Promise(function (resolve, reject) {
    var redirectCount = 0;
    var maxRedir = maxRedirects || 10;
    var redirectChain = []; // 记录重定向链，便于调试

    var defaultHeaders = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate",
      "Cache-Control": "no-cache",
    };

    function doRequest(targetUrl) {
      redirectChain.push(targetUrl);

      var parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (e) {
        reject(new Error("URL解析失败: " + targetUrl));
        return;
      }

      var mod = parsed.protocol === "https:" ? https : http;
      var headers = Object.assign({}, defaultHeaders, extraHeaders || {});
      headers.Host = parsed.hostname;

      var options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: headers,
        timeout: 10000,
      };

      var req = mod.request(options, function (res) {
        var statusCode = res.statusCode || 0;

        // 处理 HTTP 重定向 (301/302/307/308)
        if (
          (statusCode === 301 || statusCode === 302 || statusCode === 307 ||
            statusCode === 308) &&
          res.headers.location
        ) {
          redirectCount++;
          if (redirectCount > maxRedir) {
            reject(new Error("重定向次数过多"));
            return;
          }
          // 使用 new URL 解析重定向地址
          var redirectUrl;
          try {
            redirectUrl = new URL(res.headers.location, targetUrl).href;
          } catch (e) {
            redirectUrl = res.headers.location;
          }
          // 消耗掉响应体
          res.resume();
          doRequest(redirectUrl);
          return;
        }

        // 收集响应数据
        var chunks = [];
        var encoding = res.headers["content-encoding"] || "";
        var stream = res;

        if (encoding.indexOf("gzip") >= 0) {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding.indexOf("deflate") >= 0) {
          stream = res.pipe(zlib.createInflate());
        }

        stream.on("data", function (chunk) {
          chunks.push(chunk);
        });
        stream.on("end", function () {
          var body = Buffer.concat(chunks).toString("utf-8");

          // 尝试从 HTML 中提取 meta-refresh 重定向
          if (statusCode === 200 && redirectCount < maxRedir) {
            var metaMatch = body.match(
              /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\d+;\s*url=["']?([^"'\s>]+)/i
            );
            if (metaMatch && metaMatch[1]) {
              redirectCount++;
              var metaUrl;
              try {
                metaUrl = new URL(metaMatch[1], targetUrl).href;
              } catch (e) {
                metaUrl = metaMatch[1];
              }
              doRequest(metaUrl);
              return;
            }

            // 尝试从 JavaScript 跳转中提取 URL
            var jsMatch = body.match(
              /(?:location\.href|location\.replace|location)\s*=\s*["']([^"']+)["']/
            );
            if (jsMatch && jsMatch[1]) {
              redirectCount++;
              var jsUrl;
              try {
                jsUrl = new URL(jsMatch[1], targetUrl).href;
              } catch (e) {
                jsUrl = jsMatch[1];
              }
              doRequest(jsUrl);
              return;
            }
          }

          resolve({
            body: body,
            finalUrl: targetUrl,
            statusCode: statusCode,
            redirectChain: redirectChain,
          });
        });
        stream.on("error", function (err) {
          reject(err);
        });
      });

      req.on("error", function (err) {
        reject(err);
      });
      req.on("timeout", function () {
        req.destroy();
        reject(new Error("请求超时"));
      });
      req.end();
    }

    doRequest(requestUrl);
  });
}

/**
 * 发起 HTTPS GET 请求并解析JSON响应
 * @param {string} requestUrl
 * @param {object} extraHeaders
 * @returns {Promise<object>}
 */
async function httpGetJSON(requestUrl, extraHeaders) {
  var result = await httpGet(requestUrl, extraHeaders);
  try {
    return JSON.parse(result.body);
  } catch (e) {
    throw new Error("响应解析失败: " + e.message);
  }
}

// ==================== 小红书解析 ====================

/**
 * 从小红书分享链接中提取 noteId
 */
function extractXhsNoteId(shareUrl) {
  // 尝试多种URL模式
  var patterns = [
    /\/explore\/([a-zA-Z0-9]+)/,
    /\/discovery\/item\/([a-zA-Z0-9]+)/,
    /\/a\/([a-zA-Z0-9]+)/,
    /\/note\/([a-zA-Z0-9]+)/,
    /note[_-]?id[=:](\w+)/i,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = shareUrl.match(patterns[i]);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * 去除小红书图片URL中的水印参数
 */
function cleanXhsImageUrl(imageUrl) {
  if (!imageUrl) return "";
  // 移除 trace 相关的 query 参数
  var cleaned = imageUrl.replace(/\?.*$/, "");
  return cleaned;
}

/**
 * 从HTML中提取 __INITIAL_STATE__ JSON数据
 */
function extractInitialState(html) {
  // 模式1: window.__INITIAL_STATE__ = {...}
  var match1 = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (match1) {
    try {
      return JSON.parse(match1[1]);
    } catch (e) {
      // 继续尝试
    }
  }

  // 模式2: <script id="__NEXT_DATA__">...</script>
  var match2 = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (match2) {
    try {
      return JSON.parse(match2[1]);
    } catch (e) {
      // 继续尝试
    }
  }

  // 模式3: 直接在HTML中搜索 note 数据
  var match3 = html.match(/"noteId"\s*:\s*"([a-zA-Z0-9]+)"/);
  if (match3) {
    return { noteId: match3[1] };
  }

  return null;
}

/**
 * 从 __INITIAL_STATE__ 中提取笔记数据
 */
function extractNoteFromState(state, noteId) {
  if (!state) return null;

  // 尝试多种路径
  var paths = [
    ["note", "noteDetailMap", noteId, "note"],
    ["note", "noteDetail"],
    ["note", "currentNoteId"],
    ["noteDetail"],
    ["noteData"],
  ];

  for (var i = 0; i < paths.length; i++) {
    var obj = state;
    var valid = true;
    for (var j = 0; j < paths[i].length; j++) {
      if (obj && typeof obj === "object" && obj[paths[i][j]] !== undefined) {
        obj = obj[paths[i][j]];
      } else {
        valid = false;
        break;
      }
    }
    if (valid && obj && typeof obj === "object") {
      return obj;
    }
  }

  return null;
}

/**
 * 从笔记数据中提取图片列表
 */
function extractImagesFromNote(noteData) {
  var images = [];
  var imageList =
    noteData.image_list ||
    noteData.images_list ||
    noteData.imageList ||
    [];

  if (imageList && imageList.length > 0) {
    for (var i = 0; i < imageList.length; i++) {
      var img = imageList[i];
      var imgUrl = "";
      if (typeof img === "string") {
        imgUrl = img;
      } else if (img.url) {
        imgUrl = img.url;
      } else if (img.url_default) {
        imgUrl = img.url_default;
      } else if (img.urlDefault) {
        imgUrl = img.urlDefault;
      } else if (img.info_list && img.info_list.length > 0) {
        var best = img.info_list[img.info_list.length - 1];
        imgUrl = best.url || "";
      }

      if (imgUrl) {
        images.push(cleanXhsImageUrl(imgUrl));
      }
    }
  }

  return images;
}

/**
 * 解析小红书分享链接
 */
async function parseXiaohongshu(shareUrl) {
  try {
    var finalUrl = shareUrl;
    var htmlBody = "";

    // 1. 处理短链 (xhslink.com / xhsurl.com)
    if (
      finalUrl.indexOf("xhslink.com") >= 0 ||
      finalUrl.indexOf("xhsurl.com") >= 0
    ) {
      try {
        var redirectResult = await httpGet(finalUrl);
        finalUrl = redirectResult.finalUrl;
        htmlBody = redirectResult.body || "";
      } catch (e) {
        return {
          success: false,
          error: "短链解析失败: " + (e.message || "网络错误") + "，请确认链接是否有效",
        };
      }
    }

    // 2. 提取 noteId（先从URL，再从HTML中尝试）
    var noteId = extractXhsNoteId(finalUrl);

    if (!noteId && htmlBody) {
      var htmlNoteMatch = htmlBody.match(/note[_-]?id["']?\s*[:=]\s*["']?([a-zA-Z0-9]+)["']?/i);
      if (htmlNoteMatch) noteId = htmlNoteMatch[1];
      if (!noteId) {
        var htmlLinkMatch = htmlBody.match(/\/explore\/([a-zA-Z0-9]+)/);
        if (htmlLinkMatch) noteId = htmlLinkMatch[1];
      }
      if (!noteId) {
        var htmlItemMatch = htmlBody.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
        if (htmlItemMatch) noteId = htmlItemMatch[1];
      }
    }

    if (!noteId) {
      return {
        success: false,
        error: "无法识别小红书链接格式，请提供有效的分享链接（如：xhslink.com 开头的短链）",
      };
    }

    // 3. 获取笔记页面HTML，从中提取 __INITIAL_STATE__ 数据
    //    比直接调API更可靠，因为API需要签名验证
    var pageUrl = "https://www.xiaohongshu.com/explore/" + noteId;
    var pageHtml = "";
    var pageResult;

    try {
      pageResult = await httpGet(pageUrl, {
        Referer: "https://www.xiaohongshu.com/",
      });
      pageHtml = pageResult.body || "";
    } catch (e) {
      // HTML获取失败，尝试API兜底
      pageHtml = "";
    }

    var title = "";
    var author = "";
    var cover = "";
    var images = [];

    // 尝试从 HTML 中的 __INITIAL_STATE__ 提取数据
    var initialState = pageHtml ? extractInitialState(pageHtml) : null;
    var noteData = initialState ? extractNoteFromState(initialState, noteId) : null;

    if (noteData) {
      // 从 __INITIAL_STATE__ 成功提取
      title = noteData.title || noteData.displayTitle || noteData.display_title || "";
      author = (noteData.user && noteData.user.nickname) || "";
      images = extractImagesFromNote(noteData);

      if (noteData.video && noteData.video.image) {
        cover = cleanXhsImageUrl(
          noteData.video.image.url_default ||
          noteData.video.image.urlDefault ||
          ""
        );
      }
      if (!cover && images.length > 0) {
        cover = images[0];
      }
    }

    // 如果 __INITIAL_STATE__ 提取失败，尝试直接从HTML中提取图片URL
    if (images.length === 0 && pageHtml) {
      var imgMatches = pageHtml.match(/https?:\/\/sns-webpic-qc\.xhscdn\.com\/[^"'\s]+/g);
      if (imgMatches) {
        var seen = {};
        for (var mi = 0; mi < imgMatches.length; mi++) {
          var rawUrl = imgMatches[mi];
          // 去重
          var baseUrl = rawUrl.split("?")[0];
          if (!seen[baseUrl]) {
            seen[baseUrl] = true;
            images.push(cleanXhsImageUrl(rawUrl));
          }
        }
      }
    }

    // 如果HTML解析也失败，尝试API兜底
    if (images.length === 0) {
      try {
        var apiUrl =
          "https://www.xiaohongshu.com/web_api/sns/v1/note/feed?note_id=" +
          noteId + "&source_note_id=" + noteId + "&image_formats=jpg,webp,avif";
        var apiResponse = await httpGetJSON(apiUrl, {
          Referer: "https://www.xiaohongshu.com/explore/" + noteId,
          Origin: "https://www.xiaohongshu.com",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        });

        if (apiResponse && apiResponse.data && apiResponse.data.note) {
          var apiNote = apiResponse.data.note;
          if (!title) title = apiNote.title || "";
          if (!author) author = (apiNote.user && apiNote.user.nickname) || "";
          images = extractImagesFromNote(apiNote);
          if (!cover && apiNote.video && apiNote.video.image) {
            cover = cleanXhsImageUrl(apiNote.video.image.url_default || "");
          }
        }
      } catch (e) {
        // API兜底也失败，使用已提取的图片
      }
    }

    if (images.length === 0) {
      return {
        success: false,
        error: "该笔记没有可提取的图片，或笔记需要登录才能查看",
      };
    }

    if (!title && pageHtml) {
      var titleMatch = pageHtml.match(/<title[^>]*>([^<]+)<\/title>/);
      if (titleMatch) title = titleMatch[1].replace(/[-\s]*小红书[\/\s]*$/, "").trim();
    }

    return {
      success: true,
      data: {
        title: title,
        author: author,
        images: images,
        cover: cover || (images.length > 0 ? images[0] : ""),
      },
    };
  } catch (e) {
    return {
      success: false,
      error: "解析失败: " + (e.message || "未知错误"),
    };
  }
}

// ==================== 抖音解析 ====================

/**
 * 从抖音分享链接中提取 awemeId
 */
function extractDyAwemeId(shareUrl) {
  // 视频链接
  var videoMatch = shareUrl.match(/\/video\/(\d+)/);
  if (videoMatch) return { type: "video", id: videoMatch[1] };

  // 图文链接
  var noteMatch = shareUrl.match(/\/note\/(\d+)/);
  if (noteMatch) return { type: "note", id: noteMatch[1] };

  // 从URL参数中提取
  var paramMatch = shareUrl.match(/[?&](?:aweme_id|item_id|video_id)=(\d+)/);
  if (paramMatch) return { type: "video", id: paramMatch[1] };

  // 短链可能重定向到带有ID的URL
  var modalMatch = shareUrl.match(/modal_id=(\d+)/);
  if (modalMatch) return { type: "note", id: modalMatch[1] };

  return null;
}

/**
 * 去除抖音URL中的水印标记
 */
function cleanDyWatermark(playAddrUrl) {
  if (!playAddrUrl) return "";
  // 替换 playwm 为 play (水印版 vs 无水印版)
  var cleaned = playAddrUrl.replace(/playwm\./, "play.");
  // 某些情况下需要替换域名
  cleaned = cleaned.replace(/aweme\.snssdk\.com/, "aweme.snssdk.com");
  return cleaned;
}

/**
 * 解析抖音分享链接
 */
async function parseDouyin(shareUrl) {
  try {
    var finalUrl = shareUrl;

    // 1. 处理短链 (v.douyin.com)
    if (finalUrl.indexOf("v.douyin.com") >= 0) {
      try {
        var redirectResult = await httpGet(finalUrl, {
          Referer: "https://www.douyin.com/",
        });
        finalUrl = redirectResult.finalUrl;
      } catch (e) {
        return {
          success: false,
          error: "短链解析失败，请确认链接是否有效",
        };
      }
    }

    // 2. 提取 awemeId
    var awemeInfo = extractDyAwemeId(finalUrl);
    if (!awemeInfo || !awemeInfo.id) {
      return {
        success: false,
        error: "无法识别抖音链接格式，请提供有效的分享链接",
      };
    }

    // 3. 请求作品详情API
    var apiUrl =
      "https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=" +
      awemeInfo.id;
    var apiHeaders = {
      Referer: "https://www.douyin.com/video/" + awemeInfo.id,
      Origin: "https://www.douyin.com",
    };

    var response;
    try {
      response = await httpGetJSON(apiUrl, apiHeaders);
    } catch (e) {
      return {
        success: false,
        error: "获取作品信息失败，请检查链接或稍后重试",
      };
    }

    // 4. 解析响应数据
    if (
      !response ||
      !response.item_list ||
      response.item_list.length === 0
    ) {
      return {
        success: false,
        error: "作品不存在或已被删除",
      };
    }

    var item = response.item_list[0];
    var title = item.desc || "";
    var author = (item.author && item.author.nickname) || "";
    var cover = "";
    var videoUrl = "";

    // 提取封面
    if (item.video && item.video.cover) {
      var coverList = item.video.cover.url_list || [];
      if (coverList.length > 0) {
        cover = coverList[0];
      }
    }

    // 提取图片列表（图文作品）
    var images = [];
    if (item.images && item.images.length > 0) {
      for (var i = 0; i < item.images.length; i++) {
        var img = item.images[i];
        var urlList = img.url_list || [];
        if (urlList.length > 0) {
          // 取无水印的URL（通常是第一个或最后一个）
          images.push(urlList[0]);
        }
      }
    }

    // 提取视频URL（视频作品）
    if (item.video && item.video.play_addr) {
      var playList = item.video.play_addr.url_list || [];
      if (playList.length > 0) {
        videoUrl = cleanDyWatermark(playList[0]);
      }
    }

    // 如果既没有图片也没有视频
    if (images.length === 0 && !videoUrl) {
      return {
        success: false,
        error: "该作品没有可提取的图片或视频",
      };
    }

    return {
      success: true,
      data: {
        title: title,
        author: author,
        images: images,
        videoUrl: videoUrl,
        cover: cover,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: "解析失败: " + (e.message || "未知错误"),
    };
  }
}

// ==================== 主入口 ====================

exports.main = async function (event, context) {
  var platform = event.platform;
  var shareUrl = (event.shareUrl || event.url || "").trim();

  if (!shareUrl) {
    return { success: false, error: "请提供分享链接" };
  }

  switch (platform) {
    case "xiaohongshu":
      return await parseXiaohongshu(shareUrl);
    case "douyin":
      return await parseDouyin(shareUrl);
    default:
      return {
        success: false,
        error: "不支持的平台，请选择小红书或抖音",
      };
  }
};