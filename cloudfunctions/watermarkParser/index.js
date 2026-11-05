// 云函数：去水印解析器
// 支持小红书和抖音的分享链接解析，提取无水印图片
//
// 2026-11 实测结论（决定了下面所有实现细节）：
//   1. 抖音 https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/ 已废弃，
//      永远返回 200 + 空 body，JSON.parse 直接失败 —— 这是原来抖音必然解析失败的主因。
//   2. 抖音的 SSR 数据只给「搜索引擎爬虫 UA」：用 Baiduspider / Googlebot 访问
//      https://www.douyin.com/note/<id> 或 https://www.iesdouyin.com/share/note/<id>/，
//      页面里的 <script type="application/ld+json"> 带完整的图文 image 数组；
//      普通浏览器 UA 只会拿到 73KB 的 JS 空壳（_ROUTER_DATA 里没有 videoInfoRes）。
//   3. 小红书短链解析后的完整 URL 里带 xsec_token，现在必须原样回访，
//      丢掉 query 只拼 /explore/<id> 会得到 noteDetailMap 为空的空壳页。
//   4. 小红的 window.__INITIAL_STATE__ 里有裸 undefined（不是合法 JSON），
//      而且对象嵌套很深，非贪婪正则 {[\s\S]*?} 会提前截断 —— 必须用括号配平提取。
//   5. 图片 URL 带签名（x-signature / x-expires），不能删 query、不能改 tplv 模板，否则 403。
const cloud = require("wx-server-sdk");
const https = require("https");
const http = require("http");
const zlib = require("zlib");
const fs = require("fs");
const os = require("os");
const path = require("path");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ==================== 常量 ====================

var UA_PC =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
// 抖音只对「搜索引擎爬虫」吐出 SSR 数据，改名会立刻退化成 JS 空壳
var UA_SPIDER =
  "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)";
// 小红书视频笔记在没有 xsec_token 时会让普通 UA 跳到 /404（移动端）或 /login（PC 端），
// 只有 Googlebot / 搜狗爬虫能拿到旧版 note.noteDetailMap 的 SSR。
// 注意：Baiduspider 和 bingbot 在小红书上只会拿到 10KB 空壳，别混用。
var UA_GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

var REQ_TIMEOUT = 12000;
var MAX_REDIRECTS = 8;
// callFunction 返回体积有限，单张图片上限 5MB
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// 视频走云函数中转，但要先落盘再 uploadFile（见 uploadVideoToCloud 里的说明）
var MAX_VIDEO_BYTES = 48 * 1024 * 1024;

// ==================== HTTP 请求工具 ====================

/**
 * 发起 GET 请求并自动跟随 HTTP 重定向，返回原始 Buffer
 * @param {string} targetUrl
 * @param {object} opts { userAgent, headers, referer, accept, timeout, maxRedirects }
 * @returns {Promise<{body: Buffer, headers: object, statusCode: number, finalUrl: string, chain: string[]}>}
 */
function request(targetUrl, opts) {
  opts = opts || {};
  var maxRedir = opts.maxRedirects === undefined ? MAX_REDIRECTS : opts.maxRedirects;
  var timeout = opts.timeout || REQ_TIMEOUT;

  return new Promise(function (resolve, reject) {
    var redirectCount = 0;
    var chain = [];

    function doRequest(url, referer) {
      chain.push(url);

      var parsed;
      try {
        parsed = new URL(url);
      } catch (e) {
        reject(new Error("URL 解析失败: " + url));
        return;
      }

      var mod = parsed.protocol === "https:" ? https : http;
      var headers = {
        "User-Agent": opts.userAgent || UA_PC,
        Accept:
          opts.accept ||
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      };
      if (referer) headers.Referer = referer;
      if (opts.headers) {
        for (var k in opts.headers) {
          if (Object.prototype.hasOwnProperty.call(opts.headers, k)) {
            headers[k] = opts.headers[k];
          }
        }
      }
      headers.Host = parsed.hostname;

      var req = mod.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: headers,
          timeout: timeout,
          rejectUnauthorized: false,
        },
        function (res) {
          var status = res.statusCode || 0;

          if (
            (status === 301 || status === 302 || status === 303 ||
              status === 307 || status === 308) &&
            res.headers.location
          ) {
            res.resume();
            redirectCount++;
            if (redirectCount > maxRedir) {
              reject(new Error("重定向次数过多"));
              return;
            }
            var next;
            try {
              next = new URL(res.headers.location, url).href;
            } catch (e) {
              next = res.headers.location;
            }
            doRequest(next, url);
            return;
          }

          var chunks = [];
          res.on("data", function (c) {
            chunks.push(c);
          });
          res.on("error", reject);
          res.on("end", function () {
            var raw = Buffer.concat(chunks);
            var enc = String(res.headers["content-encoding"] || "").toLowerCase();
            try {
              if (enc.indexOf("gzip") >= 0) {
                raw = zlib.gunzipSync(raw);
              } else if (enc.indexOf("deflate") >= 0) {
                try {
                  raw = zlib.inflateSync(raw);
                } catch (e2) {
                  raw = zlib.inflateRawSync(raw);
                }
              } else if (enc.indexOf("br") >= 0 && zlib.brotliDecompressSync) {
                raw = zlib.brotliDecompressSync(raw);
              }
            } catch (e3) {
              // 解压失败就按原始数据处理
            }
            resolve({
              body: raw,
              headers: res.headers,
              statusCode: status,
              finalUrl: url,
              chain: chain,
            });
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", function () {
        req.destroy(new Error("请求超时"));
      });
      req.end();
    }

    doRequest(targetUrl, opts.referer || "");
  });
}

/**
 * 请求一个网页并返回文本。短链落地页偶尔是「小 HTML + JS 跳转」，
 * 这里只对 4KB 以内的小页面识别一次 JS 跳转，避免误伤正常页面里的脚本。
 */
async function httpGetHtml(url, opts) {
  opts = opts || {};
  var res = await request(url, opts);
  var text = res.body.toString("utf-8");

  if (opts.followJs !== false && text.length < 4096) {
    var m = text.match(/location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
    var target = m && m[1];
    if (target && /^https?:\/\//i.test(target) && target !== url) {
      var res2 = await request(target, opts);
      return {
        body: res2.body.toString("utf-8"),
        finalUrl: res2.finalUrl,
        statusCode: res2.statusCode,
      };
    }
  }

  return { body: text, finalUrl: res.finalUrl, statusCode: res.statusCode };
}

// ==================== 通用 HTML 工具 ====================

function unescapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * 从 marker 之后按「花括号配平」截取一个完整 JSON 对象。
 * 小红书页面对象嵌套很深，非贪婪正则一定会截断。
 */
function extractBalancedObject(text, marker) {
  var at = text.indexOf(marker);
  if (at < 0) return null;
  var start = text.indexOf("{", at);
  if (start < 0) return null;

  var depth = 0;
  var inStr = false;
  var quote = "";
  var escaped = false;

  for (var i = start; i < text.length; i++) {
    var ch = text.charAt(i);

    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inStr = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * 把 JS 对象字面量里不合法的裸 undefined / NaN / Infinity 换成 null。
 * 只在字符串外替换，不会破坏正文内容。
 */
function sanitizeJsObject(text) {
  var out = "";
  var inStr = false;
  var quote = "";
  var escaped = false;
  var i = 0;
  var len = text.length;

  function matchesAt(word, pos) {
    if (text.substr(pos, word.length) !== word) return false;
    var before = pos > 0 ? text.charAt(pos - 1) : "";
    var after = pos + word.length < len ? text.charAt(pos + word.length) : "";
    if (/[A-Za-z0-9_$]/.test(before)) return false;
    if (/[A-Za-z0-9_$]/.test(after)) return false;
    return true;
  }

  while (i < len) {
    var ch = text.charAt(i);

    if (inStr) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inStr = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      out += ch;
      i++;
      continue;
    }

    if (
      matchesAt("undefined", i) ||
      matchesAt("NaN", i) ||
      matchesAt("Infinity", i)
    ) {
      out += "null";
      i += matchesAt("undefined", i) ? 9 : matchesAt("NaN", i) ? 3 : 8;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function parseLooseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      return JSON.parse(sanitizeJsObject(text));
    } catch (e2) {
      return null;
    }
  }
}

/**
 * 提取页面里所有 application/ld+json 片段
 */
function extractLdJsonBlocks(html) {
  var blocks = [];
  var re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) {
    var obj = parseLooseJson(m[1]);
    if (obj) blocks.push(obj);
  }
  return blocks;
}

function typeName(obj) {
  if (!obj || typeof obj !== "object") return "";
  var t = obj["@type"] || obj.type || "";
  if (Array.isArray(t)) t = t[0] || "";
  return String(t).toLowerCase();
}

// ==================== 小红书解析 ====================

/**
 * 从小红书分享链接中提取 noteId
 */
function extractXhsNoteId(url) {
  var s = String(url || "");
  var onXhs = /(^|\.)xiaohongshu\.com([\/:?#]|$)/i.test(s);
  var patterns = [
    /\/explore\/([a-zA-Z0-9]+)/,
    /\/discovery\/item\/([a-zA-Z0-9]+)/,
    /\/note\/([a-zA-Z0-9]+)/,
    /note[_-]?id[=:]([a-zA-Z0-9]+)/i,
  ];
  // /a/xxx 只在 xiaohongshu.com 上才是笔记地址；xhslink.com/a/xxx 是短链码，不能当 noteId
  if (onXhs) patterns.push(/\/a\/([a-zA-Z0-9]+)/);

  for (var i = 0; i < patterns.length; i++) {
    var match = s.match(patterns[i]);
    if (match) return match[1];
  }
  return null;
}

/**
 * 从链接中取 xsec_token —— 小红书现在靠它放行笔记详情
 */
function extractXhsToken(url) {
  var m = url.match(/[?&]xsec_token=([^&#]+)/);
  return m ? m[1] : "";
}

/**
 * 图片地址只做去空白处理。CDN 地址带签名，删 query 会直接 403。
 * 状态里给的常常是 http:// —— 统一升到 https，云存储下载失败时
 * 小程序端退回这个地址才不会被 downloadFile 拒绝。
 */
function cleanXhsImageUrl(url) {
  if (!url) return "";
  var u = unescapeHtml(String(url)).trim();
  if (/^http:\/\//i.test(u)) u = "https://" + u.slice(7);
  return u;
}

/**
 * 从 __INITIAL_STATE__ 中定位笔记详情
 */
function extractNoteFromState(state, noteId) {
  if (!state || typeof state !== "object") return null;

  // 新版移动端 SSR（2026-11 实测）：noteData.data.noteData
  // 旧版 PC 端：note.noteDetailMap[<id>].note
  // 两种都试，谁有内容用谁。
  var noteData = state.noteData;
  if (noteData && typeof noteData === "object") {
    var inner = noteData.data && noteData.data.noteData;
    if (inner && typeof inner === "object") {
      if (!noteId || !inner.noteId || inner.noteId === noteId) return inner;
    }
    var preload = noteData.normalNotePreloadData;
    if (preload && Array.isArray(preload.imagesList) && preload.imagesList.length) {
      return {
        title: preload.title,
        desc: preload.desc,
        imageList: preload.imagesList.map(function (it) {
          return { url: it.url, urlSizeLarge: it.urlSizeLarge };
        }),
      };
    }
  }

  var noteState = state.note || state.noteDetail || null;
  if (noteState && typeof noteState === "object") {
    var map = noteState.noteDetailMap;
    if (map && typeof map === "object") {
      if (noteId && map[noteId] && map[noteId].note) return map[noteId].note;
      if (noteId && map[noteId]) return map[noteId];
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var entry = map[keys[i]];
        if (entry && entry.note) return entry.note;
        if (entry && entry.imageList) return entry;
      }
    }
    if (noteState.noteDetail && typeof noteState.noteDetail === "object") {
      return noteState.noteDetail;
    }
  }

  if (state.noteDetail && typeof state.noteDetail === "object") {
    return state.noteDetail;
  }
  return null;
}

/**
 * 从笔记数据中提取图片列表。
 *
 * 2026-11 实测：笔记里给的 url 是 `...!h5_1080jpg`，这是 H5 详情页用的压缩图，
 * 画面上被官方压了「小红书」水印（在图片中间偏下的位置）。
 * 原图需要用 imageList[i].fileId 自己拼：
 *   https://sns-img-qc.xhscdn.com/<fileId>?imageView2/format/jpg
 * 这个地址返回的是原始尺寸（和 width/height 完全一致）、无水印。
 *
 * 返回 { images, fallbacks }：
 *   images[i]    —— 优先使用的无水印原图
 *   fallbacks[i] —— 原图地址不可用时（少数活动图 / 相册图）退回水印图
 */
function xhsOriginalUrl(fileId) {
  if (!fileId) return "";
  var id = String(fileId).replace(/^\/+/, "");
  return "https://sns-img-qc.xhscdn.com/" + id + "?imageView2/format/jpg";
}

/**
 * 有些数据源（如 normalNotePreloadData）只给完整 URL、不给 fileId，
 * 但 URL 的路径里就藏着 fileId：
 *   .../202611050933/<hash>/notes_pre_post/<id>!h5_1080jpg  ->  notes_pre_post/<id>
 * 从 URL 里把它抠出来，同样能换到无水印原图。
 */
function xhsFileIdFromUrl(url) {
  var m = String(url || "").match(
    /\/(notes_[a-z0-9_]+)\/([^!?#\/]+)(?:![^?]*)?(?:\?|$)/i
  );
  return m ? m[1] + "/" + m[2] : "";
}

function extractImagesFromNote(note) {
  var list = note.imageList || note.image_list || note.imagesList || [];
  var images = [];
  var fallbacks = [];
  var seen = {};

  function push(url, originalUrl) {
    var u = cleanXhsImageUrl(url);
    var orig = cleanXhsImageUrl(originalUrl);
    var key = orig || u;
    if (!u && !orig) return;
    if (seen[key]) return;
    seen[key] = true;
    // 原图优先；拿不到原图时至少保证有个能用的地址
    images.push(orig || u);
    fallbacks.push(u);
  }

  if (Array.isArray(list)) {
    for (var i = 0; i < list.length; i++) {
      var img = list[i];
      if (!img) continue;
      if (typeof img === "string") {
        push(img, "");
        continue;
      }

      var primary =
        img.urlDefault ||
        img.url_default ||
        img.url ||
        img.urlPre ||
        img.url_pre ||
        "";
      if (!primary && Array.isArray(img.infoList) && img.infoList.length) {
        primary = img.infoList[img.infoList.length - 1].url;
      }
      if (!primary && Array.isArray(img.info_list) && img.info_list.length) {
        primary = img.info_list[img.info_list.length - 1].url;
      }

      // fileId 优先；没有的话从 URL 路径里反推
      var fileId = img.fileId || img.file_id || xhsFileIdFromUrl(primary);
      push(primary, xhsOriginalUrl(fileId));
    }
  }

  return { images: images, fallbacks: fallbacks };
}

function xhsTitle(note) {
  return (
    note.title ||
    note.displayTitle ||
    note.display_title ||
    (note.desc ? String(note.desc).split("\n")[0].slice(0, 40) : "") ||
    ""
  );
}

/**
 * 兜底：直接在 HTML 里捞 CDN 图片地址
 */
function xhsImagesFromHtml(html) {
  var re = /https?:\/\/sns-[a-z0-9-]*\.xhscdn\.com\/[^"'\s\\<>]+/gi;
  var images = [];
  var seen = {};
  var m;
  while ((m = re.exec(html))) {
    var url = unescapeHtml(m[0]);
    var key = url.split("?")[0];
    if (seen[key]) continue;
    seen[key] = true;
    images.push(url);
  }
  return images;
}

/**
 * 从笔记数据里取无水印视频流地址。
 *
 * 2026-11 实测：视频笔记的 `note.video.media.stream` 结构是
 *   { h264:[{ masterUrl, backupUrls, width, height, size, qualityType }], h265:[], h266:[], av1:[] }
 * masterUrl 就是官方播放器用的地址，画面上没有水印（水印只在 App 播放器 UI 层）。
 *
 * 优先 h264：小程序 <video> 对 h265 支持不稳定，h264 兼容性最好。
 * 同一编码里取分辨率最高的那条。
 */
function extractVideoFromNote(note) {
  var stream =
    (note.video && note.video.media && note.video.media.stream) ||
    (note.video && note.video.media && note.video.media.streams) ||
    null;
  if (!stream || typeof stream !== "object") return null;

  var codecs = ["h264", "h265", "av1", "h266"];
  var best = null;

  for (var c = 0; c < codecs.length; c++) {
    var list = stream[codecs[c]];
    if (!Array.isArray(list) || list.length === 0) continue;

    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      var url = item.masterUrl || item.master_url || "";
      if (!url && Array.isArray(item.backupUrls) && item.backupUrls.length) {
        url = item.backupUrls[0];
      }
      if (!url) continue;

      var w = item.width || 0;
      var h = item.height || 0;
      if (!best || w * h > best.width * best.height) {
        best = {
          url: cleanXhsImageUrl(url), // 同样要做 http->https 和实体还原
          backupUrls: (item.backupUrls || []).map(cleanXhsImageUrl),
          width: w,
          height: h,
          size: item.size || 0,
          duration: item.duration || 0,
          codec: item.videoCodec || codecs[c],
        };
      }
    }
    // h264 只要有就不再看 h265/av1
    if (best) break;
  }

  return best;
}

/**
 * 解析小红书分享链接
 */
async function parseXiaohongshu(shareUrl) {
  try {
    var finalUrl = shareUrl;
    var shortBody = "";

    // 1. 短链（xhslink.com / xhslink.cn / xhsurl.com）：跳转后的完整地址里带 xsec_token，必须保留
    if (/xhslink\.(com|cn)|xhsurl\.com/.test(finalUrl)) {
      try {
        var shortRes = await httpGetHtml(finalUrl, {
          userAgent: UA_MOBILE,
          referer: "https://www.xiaohongshu.com/",
        });
        if (shortRes.finalUrl) finalUrl = shortRes.finalUrl;
        shortBody = shortRes.body || "";
      } catch (e) {
        return {
          success: false,
          error: "小红书短链解析失败，请确认链接是否完整（或在 App 里重新「分享 → 复制链接」）",
        };
      }
    }

    var noteId = extractXhsNoteId(finalUrl);
    if (!noteId && shortBody) {
      var htmlId =
        shortBody.match(/\/explore\/([a-zA-Z0-9]{16,})/) ||
        shortBody.match(/\/discovery\/item\/([a-zA-Z0-9]{16,})/) ||
        shortBody.match(/note[_-]?id["']?\s*[:=]\s*["']?([a-zA-Z0-9]{16,})/i);
      if (htmlId) noteId = htmlId[1];
    }

    if (!noteId) {
      // 短链只跳回首页，说明这个分享码已经失效（小红书短链默认一段时间后过期）
      var landedHome = /^https?:\/\/(www\.)?xiaohongshu\.com\/?(\?.*)?$/.test(finalUrl || "");
      return {
        success: false,
        error: landedHome
          ? "这个短链已经失效（只跳回了小红书首页），请在 App 里重新「分享 → 复制链接」"
          : "无法识别小红书链接，请粘贴 App 里「分享 → 复制链接」得到的完整文案",
      };
    }

    var token = extractXhsToken(finalUrl) || extractXhsToken(shareUrl);

    // 2. 页面候选：优先原链接（保留 token），其次自己拼 explore / discovery
    var candidates = [];
    if (/xiaohongshu\.com/.test(finalUrl)) candidates.push(finalUrl);
    var qs = token
      ? "?xsec_token=" + token + "&xsec_source=pc_share"
      : "";
    candidates.push("https://www.xiaohongshu.com/explore/" + noteId + qs);
    candidates.push(
      "https://www.xiaohongshu.com/discovery/item/" + noteId +
        (token ? "?source=webshare&xsec_token=" + token + "&xsec_source=pc_share" : "")
    );

    var title = "";
    var author = "";
    var cover = "";
    var images = [];
    var fallbacks = [];
    var pageHtml = "";
    var lastError = "";
    var video = null;

    // 2026-11 实测：小红书 PC 网页版不带登录态会 302 到 /login，
    // 只有移动端 UA 才能直接拿到带 __INITIAL_STATE__ 的笔记页。
    // 所以每个候选地址先用移动端 UA 试，拿不到再用 PC UA 兜一次。
    // 视频笔记在移动端 UA 下会被跳到 /404，但 Googlebot 能拿到旧版 SSR —— 见 UA 常量说明。
    var pageUAs = [UA_MOBILE, UA_PC, UA_GOOGLEBOT];

    // 图文和视频的「有没有拿到内容」判断不同：视频笔记 imageList 只有一张封面，
    // 所以循环条件不能只看 images.length。
    function hasContent() {
      return images.length > 0 || !!video;
    }

    for (var ci = 0; ci < candidates.length && !hasContent(); ci++) {
      var pageUrl = candidates[ci];

      for (var ui = 0; ui < pageUAs.length && !hasContent(); ui++) {
        var html = "";
        var landedUrl = "";
        try {
          var pageRes = await httpGetHtml(pageUrl, {
            userAgent: pageUAs[ui],
            referer: "https://www.xiaohongshu.com/",
            followJs: false,
          });
          html = pageRes.body || "";
          landedUrl = pageRes.finalUrl || "";
        } catch (e) {
          lastError = e.message || "网络错误";
          continue;
        }
        if (!html) continue;
        // 被踢到登录页说明这个 UA 拿不到笔记内容，换下一个 UA
        if (/\/login/i.test(landedUrl) && html.indexOf("__INITIAL_STATE__") < 0) {
          continue;
        }
        pageHtml = pageHtml || html;

        var stateText = extractBalancedObject(html, "__INITIAL_STATE__");
        var state = parseLooseJson(stateText);
        var note = extractNoteFromState(state, noteId);

        if (note) {
          title = title || xhsTitle(note);
          if (!author && note.user) {
            author = note.user.nickname || note.user.nickName || "";
          }
          var parsedImages = extractImagesFromNote(note);
          images = parsedImages.images;
          fallbacks = parsedImages.fallbacks;
          video = extractVideoFromNote(note);
          if (note.video && note.video.image) {
            // 视频封面同样优先用 fileId 拼的原图，避开 H5 水印
            var videoImage = note.video.image;
            cover =
              xhsOriginalUrl(videoImage.fileId || videoImage.file_id) ||
              cleanXhsImageUrl(
                videoImage.urlDefault ||
                  videoImage.url_default ||
                  videoImage.url ||
                  ""
              ) ||
              cover;
          }
          // 实测 note.video.image 里只有 { thumbnailFileid: "frame/..." }，
          // 拿不到能直接下载的地址，真正的封面是 note.imageList[0].fileId。
          if (!cover && note.imageList && note.imageList.length) {
            var coverImg = note.imageList[0] || {};
            cover = xhsOriginalUrl(
              coverImg.fileId ||
                coverImg.file_id ||
                xhsFileIdFromUrl(coverImg.urlDefault || coverImg.url || "")
            );
          }
        }

        // 状态里没拿到就退回正则捞 CDN 地址（这些只能是 H5 水印图）
        if (images.length === 0 && !video) {
          images = xhsImagesFromHtml(html);
          fallbacks = images.slice();
        }
      }
    }

    var xhsImages = images;
    var xhsFallbacks = fallbacks;

    if (!title && pageHtml) {
      var titleMatch = pageHtml.match(/<title[^>]*>([^<]+)<\/title>/);
      if (titleMatch) {
        title = unescapeHtml(titleMatch[1]).replace(/[-\s]*小红书[\/\s-]*.*$/, "").trim();
        if (title === "小红书") title = "";
      }
    }

    // 视频笔记：视频流是主产物，imageList 里那张只是封面，不再当图片返回
    if (video) {
      return {
        success: true,
        data: {
          title: title,
          author: author,
          isVideo: true,
          video: video,
          images: [],
          cover: cover || video.cover || "",
        },
      };
    }

    if (xhsImages.length === 0) {
      return {
        success: false,
        error: token
          ? "没有解析到图片，可能是笔记已删除、仅粉丝可见，或链接已过期，请重新复制分享链接"
          : "该链接缺少 xsec_token（小红书 2024 年后要求），请在 App 里点「分享 → 复制链接」后粘贴完整文案",
      };
    }

    return {
      success: true,
      data: {
        title: title,
        author: author,
        images: xhsImages,
        // 原图地址失效时退回带水印的 H5 图，至少还能保存
        fallbackImages: xhsFallbacks,
        cover: cover || xhsImages[0],
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
 * 从抖音分享链接中提取作品 ID 与类型
 */
function extractDyAwemeId(url) {
  var videoMatch = url.match(/\/video\/(\d{10,25})/);
  if (videoMatch) return { type: "video", id: videoMatch[1] };

  var noteMatch = url.match(/\/(?:note|slides)\/(\d{10,25})/);
  if (noteMatch) return { type: "note", id: noteMatch[1] };

  var paramMatch = url.match(/[?&](?:aweme_id|item_id|video_id)=(\d{10,25})/);
  if (paramMatch) return { type: "video", id: paramMatch[1] };

  var modalMatch = url.match(/[?&]modal_id=(\d{10,25})/);
  if (modalMatch) return { type: "unknown", id: modalMatch[1] };

  return null;
}

/**
 * 抖音 CDN 图片地址里的 &amp; 要还原，否则签名参数带不进去
 */
function cleanDyImageUrl(url) {
  if (!url) return "";
  return unescapeHtml(String(url)).trim();
}

function cleanDyTitle(title) {
  if (!title) return "";
  return String(title)
    .replace(/[\s,，]*-\s*抖音$/,'')
    .replace(/[,\s]*-?\s*抖音\s*$/,'')
    .trim();
}

/**
 * 从 SSR 页的 ld+json 里取图文/视频信息
 */
function parseDyLdJson(html) {
  var blocks = extractLdJsonBlocks(html);
  var images = [];
  var seen = {};
  var title = "";
  var author = "";
  var videoCover = "";
  var isVideo = false;

  function push(url) {
    var u = cleanDyImageUrl(url);
    if (!u || seen[u]) return;
    seen[u] = true;
    images.push(u);
  }

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (!b || typeof b !== "object") continue;
    var t = typeName(b);

    if (t === "article" || t === "imageobject" || t === "newsarticle") {
      if (!title) title = b.headline || b.name || "";
      if (!author && b.author) {
        author =
          (typeof b.author === "string" ? b.author : b.author.name || b.author["@name"]) || "";
      }
      var arr = b.image;
      if (typeof arr === "string") arr = [arr];
      if (Array.isArray(arr)) {
        for (var j = 0; j < arr.length; j++) push(arr[j]);
      }
    } else if (t === "videoobject") {
      isVideo = true;
      if (!title) title = b.name || "";
      if (!author && b.creator) {
        author =
          (typeof b.creator === "string" ? b.creator : b.creator.name) || "";
      }
      var thumbs = b.thumbnailUrl;
      if (typeof thumbs === "string") thumbs = [thumbs];
      if (!videoCover && Array.isArray(thumbs) && thumbs.length) {
        videoCover = cleanDyImageUrl(thumbs[0]);
      }
    }
  }

  return {
    title: cleanDyTitle(title),
    author: author,
    images: images,
    videoCover: videoCover,
    isVideo: isVideo && images.length === 0,
  };
}

/**
 * 旧版分享页（_ROUTER_DATA.videoInfoRes）兜底，部分老链接仍然是这种结构
 */
function parseDyRouterData(html) {
  var text = extractBalancedObject(html, "_ROUTER_DATA");
  var data = parseLooseJson(text);
  if (!data || !data.loaderData) return null;

  var loader = data.loaderData;
  var keys = Object.keys(loader);
  for (var i = 0; i < keys.length; i++) {
    var page = loader[keys[i]];
    var res = page && page.videoInfoRes;
    var item = res && res.item_list && res.item_list[0];
    if (!item) continue;

    var images = [];
    if (Array.isArray(item.images)) {
      for (var j = 0; j < item.images.length; j++) {
        var list = item.images[j].url_list || [];
        if (list.length) images.push(cleanDyImageUrl(list[0]));
      }
    }
    var cover = "";
    if (item.video && item.video.cover && item.video.cover.url_list && item.video.cover.url_list.length) {
      cover = cleanDyImageUrl(item.video.cover.url_list[0]);
    }
    return {
      title: item.desc || "",
      author: (item.author && item.author.nickname) || "",
      images: images,
      videoCover: cover,
      isVideo: images.length === 0,
    };
  }
  return null;
}

/**
 * 兜底：直接从 HTML 里捞 CDN 图片
 */
function dyImagesFromHtml(html) {
  var re = /https?:\/\/[a-z0-9-]+\.douyinpic\.com\/[^"'\s\\<>]+/gi;
  var images = [];
  var seen = {};
  var m;
  while ((m = re.exec(html))) {
    var url = unescapeHtml(m[0]);
    // 只要作品图，不要头像 / 封面缩略图
    if (url.indexOf("aweme-images") < 0 && url.indexOf("/tos-cn-i-") < 0) continue;
    if (url.indexOf("aweme-avatar") >= 0) continue;
    var key = url.split("?")[0];
    if (seen[key]) continue;
    seen[key] = true;
    images.push(url);
  }
  return images;
}

/**
 * 解析抖音分享链接
 */
async function parseDouyin(shareUrl) {
  try {
    var finalUrl = shareUrl;
    var shareBody = "";

    // 1. 短链（v.douyin.com）：解析出真正的作品地址
    if (/v\.douyin\.com/.test(finalUrl)) {
      try {
        var shortRes = await httpGetHtml(finalUrl, {
          userAgent: UA_MOBILE,
          referer: "https://www.douyin.com/",
        });
        if (shortRes.finalUrl) finalUrl = shortRes.finalUrl;
        shareBody = shortRes.body || "";
      } catch (e) {
        return {
          success: false,
          error: "抖音短链解析失败，请确认链接是否完整（或在 App 里重新「分享 → 复制链接」）",
        };
      }
    }

    var info = extractDyAwemeId(finalUrl);

    // 短链落地成 JS 空壳时，从 HTML 里再捞一次 ID
    if (!info || !info.id) {
      var idMatch = shareBody && shareBody.match(/(?:aweme_id|item_ids|modal_id)[=:"'\s]+(\d{15,25})/);
      if (idMatch) info = { type: "unknown", id: idMatch[1] };
    }

    if (!info || !info.id) {
      var landedHome2 = /^https?:\/\/(www\.)?douyin\.com\/?(\?.*)?$/.test(finalUrl || "");
      return {
        success: false,
        error: landedHome2
          ? "这个短链已经失效（只跳回了抖音首页），请在 App 里重新「分享 → 复制链接」"
          : "无法识别抖音作品链接，请粘贴 App 里「分享 → 复制链接」得到的完整文案",
      };
    }

    var awemeId = info.id;
    var order = info.type === "video" ? ["video", "note"] : ["note", "video", "slides"];

    var pageUrls = [];
    for (var oi = 0; oi < order.length; oi++) {
      var kind = order[oi];
      pageUrls.push("https://www.douyin.com/" + kind + "/" + awemeId);
      pageUrls.push("https://www.iesdouyin.com/share/" + kind + "/" + awemeId + "/");
    }

    var parsed = null;
    var pageHtml = "";

    for (var pi = 0; pi < pageUrls.length; pi++) {
      var html = "";
      try {
        // 关键：必须用爬虫 UA，普通浏览器 UA 只会拿到 JS 空壳
        var res = await httpGetHtml(pageUrls[pi], {
          userAgent: UA_SPIDER,
          referer: "https://www.douyin.com/",
          followJs: false,
        });
        html = res.body || "";
      } catch (e) {
        continue;
      }
      if (!html) continue;
      pageHtml = pageHtml || html;

      var byLd = parseDyLdJson(html);
      if (byLd && (byLd.images.length > 0 || byLd.title || byLd.isVideo)) {
        // 后面的候选页不一定更好：note/slides 页常常只有标题没有图，
        // 不能把前面已经拿到图片/封面的结果覆盖掉
        if (!parsed || byLd.images.length > 0 || (!parsed.videoCover && byLd.videoCover)) {
          parsed = byLd;
        }
        if (parsed.images.length > 0) break;
      }

      var byRouter = parseDyRouterData(html);
      if (byRouter && byRouter.images.length > 0) {
        parsed = byRouter;
        break;
      }
    }

    if (parsed && parsed.images.length === 0 && pageHtml) {
      parsed.images = dyImagesFromHtml(pageHtml);
    }

    if (!parsed || (!parsed.title && parsed.images.length === 0 && !parsed.isVideo)) {
      return {
        success: false,
        error: "作品不存在、已删除，或抖音拒绝了本次解析请求，请稍后重试",
      };
    }

    if (parsed.images.length === 0) {
      return {
        success: false,
        error: "该抖音作品是视频，暂不支持去水印下载；图文作品可以直接提取图片",
        data: {
          title: parsed.title,
          author: parsed.author,
          images: [],
          cover: parsed.videoCover,
        },
      };
    }

    return {
      success: true,
      data: {
        title: parsed.title,
        author: parsed.author,
        images: parsed.images,
        cover: parsed.videoCover || parsed.images[0],
      },
    };
  } catch (e) {
    return {
      success: false,
      error: "解析失败: " + (e.message || "未知错误"),
    };
  }
}

// ==================== 图片中转 ====================
//
// 为什么不用「把 CDN 地址直接返回给小程序」：
//   小程序里 <image src> 和 wx.getImageInfo 都要求域名配置在「downloadFile 合法域名」里，
//   而 douyinpic / xhscdn 的图片还带签名和 Referer 校验，小程序端根本发不出去。
// 所以这里由云函数下载后再传到云存储，返回 cloud:// fileID：
//   <image src="{{fileID}}"> 原生支持 fileID，保存时 wx.cloud.downloadFile(fileID) 即可，
//   完全绕开合法域名和 Referer 两个限制。

function sniffExt(buf, contentType) {
  var ct = String(contentType || "").toLowerCase();
  if (buf.length > 12) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      return "webp";
    }
    if (buf.toString("ascii", 0, 3) === "GIF") return "gif";
  }
  if (ct.indexOf("png") >= 0) return "png";
  if (ct.indexOf("webp") >= 0) return "webp";
  if (ct.indexOf("gif") >= 0) return "gif";
  return "jpg";
}

// 同一张图重复解析时复用同一个云存储文件，避免越存越多。
// 签名参数（x-signature / x-expires）和 xhscdn 路径里的时间戳（202611050922）每次都不一样，
// 先抹掉再算 key，才能命中同一个文件。
function hashKey(str) {
  var normalized = String(str)
    .replace(/[?&](x-signature|x-expires|sign|expires|token)=[^&]*/gi, "")
    .replace(/\/\d{12}\//, "/");
  var h = 5381;
  for (var i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + "_" + normalized.length.toString(36);
}

/**
 * 下载一张图并转存到云存储，返回 fileID。失败返回 null（调用方回退到 CDN 地址）
 */
async function uploadImageToCloud(imageUrl) {
  var referer = "https://www.douyin.com/";
  if (/xhscdn\.com|xiaohongshu\.com/.test(imageUrl)) {
    referer = "https://www.xiaohongshu.com/";
  }

  var res;
  try {
    res = await request(imageUrl, {
      userAgent: UA_PC,
      referer: referer,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      timeout: 15000,
    });
  } catch (e) {
    return null;
  }

  if (res.statusCode !== 200 || !res.body || !res.body.length) return null;
  if (res.body.length > MAX_IMAGE_BYTES) return null;

  var ext = sniffExt(res.body, res.headers["content-type"]);
  var cloudPath = "watermark/" + hashKey(imageUrl) + "." + ext;

  try {
    var up = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: res.body });
    return up && up.fileID ? up.fileID : null;
  } catch (e) {
    return null;
  }
}

/**
 * 并发有限地转存一组图片；任何一张失败就保留原 CDN 地址。
 * fallbacks[i] 是「原图地址拿不到时」的备选（小红书 H5 水印图）。
 */
async function toCloudUrls(images, fallbacks) {
  var out = new Array(images.length);
  var used = new Array(images.length);
  var cursor = 0;
  var LIMIT = 4;

  async function worker() {
    while (cursor < images.length) {
      var idx = cursor++;
      var src = images[idx];
      var fileID = await uploadImageToCloud(src);
      if (!fileID) {
        var alt = fallbacks && fallbacks[idx];
        if (alt && alt !== src) {
          var altFileID = await uploadImageToCloud(alt);
          if (altFileID) {
            fileID = altFileID;
            src = alt;
          }
        }
      }
      out[idx] = fileID || src;
      used[idx] = src;
    }
  }

  var workers = [];
  for (var i = 0; i < Math.min(LIMIT, images.length); i++) workers.push(worker());
  await Promise.all(workers);
  return { cloud: out, used: used };
}

function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

/**
 * 视频不能像图片那样整个读进内存再 uploadFile —— 一条 40MB 的流再复制一份
 * 很容易把云函数 256MB 内存顶爆，而且 cloud.uploadFile 支持传流/路径，
 * 这里先流式写到 /tmp，再交给 uploadFile，避免内存翻倍。
 */
function downloadToFile(url, filePath, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    var headers = {
      "User-Agent": opts.userAgent || UA_PC,
      Accept: "*/*",
      Referer: opts.referer || "https://www.xiaohongshu.com/",
    };
    var req = https.get(url, { headers: headers, timeout: 30000 }, function (res) {
      var status = res.statusCode || 0;

      // 跟着跳转走，视频 CDN 有时会 302 到另一个节点
      if (
        (status === 301 || status === 302 || status === 303 ||
          status === 307 || status === 308) &&
        res.headers.location
      ) {
        res.resume();
        var next;
        try {
          next = new URL(res.headers.location, url).href;
        } catch (e) {
          next = res.headers.location;
        }
        downloadToFile(next, filePath, opts).then(resolve, reject);
        return;
      }

      if (status !== 200 && status !== 206) {
        res.resume();
        reject(new Error("视频下载失败（HTTP " + status + "）"));
        return;
      }

      var out = fs.createWriteStream(filePath);
      var size = 0;
      var aborted = false;

      res.on("data", function (chunk) {
        size += chunk.length;
        if (size > (opts.maxBytes || MAX_VIDEO_BYTES)) {
          aborted = true;
          res.destroy();
          out.destroy();
          reject(new Error("视频超过大小上限"));
          return;
        }
        out.write(chunk);
      });
      res.on("end", function () {
        if (aborted) return;
        out.end(function () {
          resolve({ bytes: size, contentType: res.headers["content-type"] || "" });
        });
      });
      res.on("error", function (err) {
        if (aborted) return;
        out.destroy();
        reject(err);
      });
    });

    req.on("error", reject);
    req.on("timeout", function () {
      req.destroy(new Error("视频下载超时"));
    });
  });
}

/**
 * 把视频转存到云存储，返回 { fileID, bytes }；失败返回 null
 */
async function uploadVideoToCloud(videoUrl) {
  var tmpPath = path.join(
    os.tmpdir(),
    "xhs-" + process.pid + "-" + Date.now() + ".mp4"
  );

  try {
    var info = await downloadToFile(videoUrl, tmpPath, {
      referer: "https://www.xiaohongshu.com/",
      maxBytes: MAX_VIDEO_BYTES,
    });

    var cloudPath = "watermark/video/" + hashKey(videoUrl) + ".mp4";
    var up = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: fs.createReadStream(tmpPath),
    });

    if (up && up.fileID) return { fileID: up.fileID, bytes: info.bytes };
    return null;
  } catch (e) {
    // 云函数日志里能看到具体原因（超限 / 403 / 超时），方便排查
    console.error("视频转存失败:", (e && e.message) || e);
    return null;
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch (e2) {
      // 临时文件清理失败不影响结果
    }
  }
}

// ==================== 主入口 ====================

exports.main = async function (event, context) {
  event = event || {};

  var platform = event.platform;
  var shareUrl = String(event.shareUrl || event.url || "").trim();

  if (!shareUrl) {
    return { success: false, error: "请提供分享链接" };
  }

  var result;
  switch (platform) {
    case "xiaohongshu":
      result = await parseXiaohongshu(shareUrl);
      break;
    case "douyin":
      result = await parseDouyin(shareUrl);
      break;
    default:
      return {
        success: false,
        error: "不支持的平台，请选择小红书或抖音",
      };
  }

  // 解析成功就把图片转存到云存储，页面上直接用 fileID 渲染 / 保存
  if (result && result.data) {
    var rawImages = result.data.images || [];
    var fallbackImages = result.data.fallbackImages || [];
    delete result.data.fallbackImages;

    // 视频笔记：只中转视频本身（封面单独中转），不走图片数组那条路
    if (result.data.isVideo && result.data.video && result.data.video.url) {
      var videoInfo = result.data.video;
      var relayedVideo = await uploadVideoToCloud(videoInfo.url);

      if (relayedVideo) {
        result.data.video = {
          fileID: relayedVideo.fileID,
          url: videoInfo.url, // 兜底：小程序端可用 wx.downloadFile 直连（需配合法域名）
          width: videoInfo.width,
          height: videoInfo.height,
          duration: videoInfo.duration,
          size: relayedVideo.bytes,
          codec: videoInfo.codec,
        };
      } else {
        // 转存失败也要让页面知道这是视频，而不是「没有结果」
        result.success = false;
        result.error = "视频转存失败，可能是视频过大或云端存储权限未开通";
        result.data.video = {
          url: videoInfo.url,
          width: videoInfo.width,
          height: videoInfo.height,
          duration: videoInfo.duration,
          size: videoInfo.size,
          codec: videoInfo.codec,
        };
      }

      if (isRemoteUrl(result.data.cover)) {
        var videoCoverFileID = await uploadImageToCloud(result.data.cover);
        if (videoCoverFileID) result.data.cover = videoCoverFileID;
      }
      return result;
    }

    if (rawImages.length) {
      var relayed = await toCloudUrls(rawImages, fallbackImages);
      result.data.images = relayed.cloud;
      // rawImages 只作为云存储下载失败时的兜底，用实际取到的那一版
      result.data.rawImages = relayed.used;
      result.data.cover = relayed.cloud[0];
    } else if (isRemoteUrl(result.data.cover)) {
      // 视频作品只解析出封面时，封面也要转存，否则小程序端渲染不出来
      var coverFileID = await uploadImageToCloud(result.data.cover);
      if (coverFileID) result.data.cover = coverFileID;
    }
  }

  return result;
};
