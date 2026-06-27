/**
 * 澶氬钩鍙扮煭瑙嗛瑙ｆ瀽 Worker锛堜豢 BugPk 杩斿洖鏍煎紡锛? * 鐢ㄦ硶: GET https://浣犵殑worker鍦板潃.workers.dev/?url=瑙嗛鍒嗕韩閾炬帴
 *
 * 杩斿洖鏍煎紡涓?BugPk 淇濇寔涓€鑷达紝鏂逛究浣犵殑 Flutter 绔皯鏀逛唬鐮侊細
 * {
 *   "code": 200,
 *   "msg": "瑙ｆ瀽鎴愬姛",
 *   "platform": "douyin",
 *   "data": {
 *     "type": "video" | "image",
 *     "title": "",
 *     "desc": "",
 *     "author": { "name": "", "id": "", "avatar": "" },
 *     "cover": "",
 *     "url": "",
 *     "images": []
 *   }
 * }
 *
 * 缁存姢璇存槑锛? * - 杩欑被瑙ｆ瀽闈犳姄"鍒嗕韩椤?HTML 閲屽祵鐨?JSON"锛屽钩鍙版敼鐗堜細瀵艰嚧姝ｅ垯/JSON璺緞澶辨晥銆? * - 骞冲彴涓€鏃︽敼鐗堬紝閫氬父鍙渶瑕佹敼瀵瑰簲 parseXxx() 鍑芥暟閲岀殑姝ｅ垯锛屼笉鐢ㄥぇ鏀规灦鏋勩€? * - 閮ㄧ讲锛氭妸杩欎釜鏂囦欢鍐呭绮樺埌 Cloudflare Workers 鐨勪唬鐮佺紪杈戝櫒锛屾垨杩炴帴 GitHub 浠撳簱鑷姩閮ㄧ讲銆? */

const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function sendJson(res, data, statusCode) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(statusCode || 200).json(data);
}

function ok(platform, data) {
  return { _vercel: true, code: 200, msg: '瑙ｆ瀽鎴愬姛', platform: platform, data: data };
}

function fail(msg, code = 500) {
  return { _vercel: true, code: code, msg: msg };
}

function detectPlatform(url) {
  if (/douyin\.com|iesdouyin\.com/.test(url)) return 'douyin';
  if (/bilibili\.com|b23\.tv/.test(url)) return 'bilibili';
  if (/kuaishou\.com|gifshow\.com|kwai/.test(url)) return 'kuaishou';
  if (/xiaohongshu\.com|xhslink\.com|xhs\.cn/.test(url)) return 'xiaohongshu';
  if (/weibo\.com/.test(url)) return 'weibo';
  return 'unknown';
}

// 璺熼殢鐭摼璺宠浆锛屾嬁鍒版渶缁堢湡瀹炲湴鍧€
async function resolveRedirect(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA_MOBILE },
    });
    return res.url || url;
  } catch (e) {
    return url;
  }
}

async function fetchHtml(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA_MOBILE,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...extraHeaders,
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

// ================= 鎶栭煶 =================
// 鎬濊矾锛氬垎浜煭閾捐烦杞埌 iesdouyin SSR 璇︽儏椤碉紝椤甸潰 HTML 閲屽祵鏈夊畬鏁磋棰戞暟鎹殑 JSON锛坕tem_list锛夛紝
// 鐩存帴鍦?HTML 涓彁鍙栨瘮璋?API 鏇寸ǔ瀹氾紙API 闇€瑕佺鍚?鐧诲綍鎬侊級
function extractDouyinItemId(url) {
  var m = url.match(/\/(?:share\/)?video\/(\d{6,})/);
  if (m) return m[1];
  m = url.match(/item_ids?=(\d{6,})/);
  if (m) return m[1];
  m = url.match(/modal_id=(\d{6,})/);
  if (m) return m[1];
  m = url.match(/aweme_id=(\d+)/);
  if (m) return m[1];
  return null;
}

// 浠?HTML 涓彁鍙?item_list JSON 鏁扮粍
function extractDouyinDataFromHtml(html) {
  var start = html.indexOf('"item_list":[');
  if (start < 0) return null;
  start += '"item_list":['.length;
  // 鐢ㄦ爤鍖归厤鎵惧埌闂悎鐨?]
  var depth = 1;
  var inStr = false;
  var escape = false;
  for (var i = start; i < html.length && depth > 0; i++) {
    var ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"' && !escape) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    if (ch === ']') depth--;
  }
  if (depth !== 0) return null;
  var jsonStr = html.substring(start, i - 1);
  try {
    var arr = JSON.parse('[' + jsonStr + ']');
    return arr.length ? arr[0] : null;
  } catch(e) {
    return null;
  }
}

async function parseDouyin(originalUrl) {
  var realUrl = await resolveRedirect(originalUrl);
  var itemId = extractDouyinItemId(realUrl) || extractDouyinItemId(originalUrl);
  if (!itemId) throw new Error('鏈兘浠庨摼鎺ヤ腑鎻愬彇瑙嗛ID');

  // 浠?HTML 涓彁鍙栨暟鎹?  var html = await fetchHtml(realUrl, { Referer: 'https://www.douyin.com/' });
  var item = extractDouyinDataFromHtml(html);
  if (!item) throw new Error('浠庨〉闈?HTML 涓彁鍙栬棰戞暟鎹け璐ワ紝item_id=' + itemId + '锛岄〉闈㈢粨鏋勫彲鑳藉凡鍙樺寲');

  var video = item.video || {};
  var author = item.author || {};

  var playUrl = (video.play_addr && video.play_addr.url_list && video.play_addr.url_list[0]) || '';
  // 鍘绘按鍗帮細playwm -> play
  if (playUrl) playUrl = playUrl.replace('playwm', 'play');
  // unicode 杞箟淇
  if (playUrl) playUrl = playUrl.replace(/\\u002F/g, '/');

  var images = (item.images || [])
    .map(function(img) { return img.url_list && img.url_list[0]; })
    .filter(Boolean);

    return {
    type: images.length ? 'image' : 'video',
    title: item.desc || (item.share_info && item.share_info.share_title) || item.video && item.video.text || (item.promotions && item.promotions[0] && item.promotions[0].title) || '',
    desc: item.desc || '',
    author: {
      name: author.nickname || '',
      id: author.unique_id || author.short_id || author.uid || '',
      avatar: (author.avatar_larger && author.avatar_larger.url_list && author.avatar_larger.url_list[0]) ||
              (author.avatar_medium && author.avatar_medium.url_list && author.avatar_medium.url_list[0]) ||
              (author.avatar_thumb && author.avatar_thumb.url_list && author.avatar_thumb.url_list[0]) || '',
    },
    cover: (video.origin_cover && video.origin_cover.url_list && video.origin_cover.url_list[0]) ||
           (video.cover && video.cover.url_list && video.cover.url_list[0]) ||
           (video.dynamic_cover && video.dynamic_cover.url_list && video.dynamic_cover.url_list[0]) || '',
    url: playUrl,
    images: images,
  };
}
// ================= B绔?=================
// 瀹樻柟鍏紑API锛屼笉闇€瑕佺櫥褰曪細鍏堟嬁 bvid -> view 鎺ュ彛鎷?cid/aid -> playurl 鎺ュ彛鎷跨湡瀹炴祦鍦板潃
async function parseBilibili(originalUrl) {
  var realUrl = originalUrl;
  if (realUrl.includes('b23.tv')) realUrl = await resolveRedirect(realUrl);

  var bvMatch = realUrl.match(/BV[0-9A-Za-z]+/);
  if (!bvMatch) throw new Error('鏈瘑鍒埌BV鍙?);
  var bvid = bvMatch[0];

  var info = null;
  var videoUrl = '';

  // 鏂瑰紡1: 璋冨畼鏂?API锛堝甫鏇村璇锋眰澶达級
  try {
    var viewRes = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (viewRes.ok) {
      var viewJson = await viewRes.json();
      if (viewJson.code === 0) info = viewJson.data;
    }
  } catch(e) {}

  // 鏂瑰紡2: 浠庨〉闈?HTML 鎻愬彇鏁版嵁
  if (!info) {
    try {
      var html = await fetchHtml(realUrl, { Referer: 'https://www.bilibili.com/' });
      // 灏濊瘯澶氱 __INITIAL_STATE__ 鏍煎紡
      var stateStr = null;
      var m1 = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\})\s*;?\s*(?:<\/script>|\(function)/);
      if (m1) stateStr = m1[1];
      if (!stateStr) {
        var m2 = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]+?)<\/script>/);
        if (m2) stateStr = m2[1];
      }
      if (stateStr) {
        try {
          var state = JSON.parse(stateStr.replace(/undefined/g, 'null'));
          var vd = state.videoData || state.videoInfo || (state.video && state.video.info) || null;
          if (vd) {
            info = {
              title: vd.title || '',
              desc: vd.desc || '',
              pic: vd.pic || '',
              owner: vd.owner || { name: '', mid: '', face: '' },
              cid: vd.cid || 0,
              aid: vd.aid || 0,
            };
          }
        } catch(e) {}
      }
      // 澶囬€? 浠?og:meta 鎻愬彇
      if (!info) {
        var ogT = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
        var ogI = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
        if (ogT || ogI) {
          info = { title: ogT ? ogT[1] : '', desc: '', pic: ogI ? ogI[1] : '', owner: { name: '', mid: '', face: '' }, cid: 0, aid: 0 };
        }
      }
    } catch(e) {}
  }

  if (!info) throw new Error('鑾峰彇B绔欒棰戜俊鎭け璐?);

  // 鑾峰彇瑙嗛娴佸湴鍧€
  if (info.cid && info.aid) {
    try {
      var playRes = await fetch('https://api.bilibili.com/x/player/playurl?avid=' + info.aid + '&cid=' + info.cid + '&qn=80&fnval=16', {
        headers: { 'User-Agent': UA_MOBILE, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json, text/plain, */*' },
      });
      if (playRes.ok) {
        var playJson = await playRes.json();
        if (playJson.code === 0) {
          var d = playJson.data;
          if (d.dash && d.dash.video && d.dash.video.length) {
            videoUrl = d.dash.video[0].baseUrl || d.dash.video[0].base_url || '';
          } else if (d.durl && d.durl.length) {
            videoUrl = d.durl[0].url;
          }
        }
      }
    } catch(e) {}
  }

  return {
    type: 'video',
    title: info.title || '',
    desc: info.desc || '',
    author: { name: (info.owner && info.owner.name) || '', id: (info.owner && info.owner.mid && info.owner.mid.toString()) || '', avatar: (info.owner && info.owner.face) || '' },
    cover: info.pic || '',
    url: videoUrl,
    images: [],
  };
}// ================= 蹇墜 =================
// 鎬濊矾鍚屾姈闊筹細鍒嗕韩椤甸噷鏈?window.__APOLLO_STATE__ 鎴?__NUXT__ 鍐呭祵JSON
async function parseKuaishou(originalUrl) {
  var realUrl = await resolveRedirect(originalUrl);
  var html = await fetchHtml(realUrl, { Referer: 'https://www.kuaishou.com/' });

  var videoUrl = '';
  var title = '';
  var cover = '';
  var authorName = '';

  // 鏂瑰紡1: 浠?HTML 涓彁鍙栬棰戝湴鍧€锛堝绉嶆ā寮忥級
  var patterns = [/"srcUrl"\s*:\s*"([^"]+)"/, /"playUrl"\s*:\s*"([^"]+)"/, /"url"\s*:\s*"([^"]*\.(?:mp4|m3u8)[^"]*)"/, /video-url=\"([^\"]+)\"/, /data-url=\"([^"']+)\"/];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) { videoUrl = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/'); break; }
  }

  // 鏂瑰紡2: 浠?og:meta 鎻愬彇
  var ogT = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
  if (ogT) title = ogT[1];
  var ogI = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
  if (ogI) cover = ogI[1];
  var ogV = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"/);
  if (ogV && !videoUrl) videoUrl = ogV[1];
  var ogVU = html.match(/<meta[^>]*property="og:video:url"[^>]*content="([^"]+)"/);
  if (ogVU && !videoUrl) videoUrl = ogVU[1];

  // 鏂瑰紡3: 浠?HTML 涓彁鍙栧皝闈?  if (!cover) {
    var cMatch = html.match(/<meta[^>]*name="og:image"[^>]*content="([^"]+)"/);
    if (cMatch) cover = cMatch[1];
  }

  // 鏂瑰紡4: 鎵句綔鑰呭悕
  if (!authorName) {
    var aMatch = html.match(/"name"\s*:\s*"([^"]+)"\s*,\s*"avatar"/);
    if (!aMatch) aMatch = html.match(/"user_name"\s*:\s*"([^"]+)"/);
    if (!aMatch) aMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    if (aMatch) authorName = aMatch[1];
  }

  if (!videoUrl && !cover) {
    throw new Error('鏈彁鍙栧埌蹇墜瑙嗛鍦板潃锛岄〉闈㈢粨鏋勫彲鑳藉凡鍙樺寲');
  }

  return {
    type: 'video',
    title: title || '',
    desc: title || '',
    author: { name: authorName || '', id: '', avatar: '' },
    cover: cover || '',
    url: videoUrl || '',
    images: [],
  };
}// ================= 灏忕孩涔?=================
// 鎬濊矾鍚屾姈闊筹細璇︽儏椤甸噷鏈?window.__INITIAL_STATE__锛屼絾鍐欐硶/杞箟鏂瑰紡鍙兘鍥犻〉闈㈢増鏈笉鍚屾湁宸紓锛?// 杩欓噷鍋氬绉嶅閿欏尮閰?+ 鍏滃簳鐢?og:meta 鏍囩
async function parseXiaohongshu(originalUrl) {
  var realUrl = await resolveRedirect(originalUrl);
  var html = await fetchHtml(realUrl, { Referer: 'https://www.xiaohongshu.com/' });

  var videoUrl = '';
  var title = '';
  var cover = '';
  var authorName = '';
  var authorAvatar = '';
  var images = [];

  // 鏂瑰紡1: 浠?SSR HTML 涓彁鍙栧皝闈㈠浘
  var posterMatch = html.match(/id=["']video_note_poster["'][^>]*src=["']([^"']+)["']/);
  if (posterMatch) {
    cover = posterMatch[1];
    if (cover.indexOf('http://') === 0) cover = 'https://' + cover.substring(7);
  }
  // 涔熷皾璇曞叾浠栧皝闈㈠浘
  if (!cover) {
    var ogI = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/);
    if (ogI) cover = ogI[1];
  }

  // 鏂瑰紡2: 浠?SSR HTML 涓彁鍙栨爣棰橈紙<title> 鍙湁'灏忕孩涔?锛屼富瑕佺湅 note-card 鎴栧叾浠栵級
  var h1Match = html.match(/note-card-title[^>]*><!--\[-->([^<]+)/);
  if (h1Match) title = h1Match[1].trim();

  // 鏂瑰紡3: 浠?HTML 涓彁鍙栦綔鑰呬俊鎭?  var nameMatch = html.match(/note-card-name[^>]*><!--\[-->([^<]+)/);
  if (nameMatch) authorName = nameMatch[1].trim();
  var avaMatch = html.match(/<img[^>]*alt=["']澶村儚["'][^>]*src=["']([^"']+)["']/);
  if (avaMatch) authorAvatar = avaMatch[1];

  // 鏂瑰紡4: 浠?__INITIAL_STATE__ 涓彁鍙栵紙鎷彿鍖归厤锛?  var stateStart = html.indexOf('__INITIAL_STATE__=');
  if (stateStart >= 0) {
    stateStart += '__INITIAL_STATE__='.length;
    while (stateStart < html.length && (html[stateStart] === ' ' || html[stateStart] === '"')) stateStart++;
    if (html[stateStart] === '{') {
      var depth = 1, inStr = false, escape = false;
      var endIdx = stateStart + 1;
      for (; endIdx < html.length && depth > 0; endIdx++) {
        var ch = html[endIdx];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inStr) { escape = true; continue; }
        if (ch === '"' && !escape) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth === 0) {
        try {
          var stateStr = html.substring(stateStart, endIdx).replace(/undefined/g, 'null');
          var state = JSON.parse(stateStr);
          var noteDetail = state.note && state.note.noteDetailMap;
          if (noteDetail) {
            var keys = Object.keys(noteDetail);
            if (keys.length) {
              var note = noteDetail[keys[0]] && noteDetail[keys[0]].note;
              if (note) {
                if (!title) title = note.title || note.desc || note.display_title || '';
                if (!authorName) authorName = (note.user && note.user.nickname) || '';
                if (!authorAvatar) authorAvatar = (note.user && note.user.avatar) || '';
                if (!cover && note.cover) cover = note.cover.urlDefault || note.cover.url || '';
                if (note.video && note.video.media && note.video.media.stream) {
                  var candidates = note.video.media.stream.h264 || note.video.media.stream.h265 || [];
                  if (candidates.length) videoUrl = candidates[0].masterUrl || (candidates[0].backupUrls && candidates[0].backupUrls[0]) || '';
                }
                if (note.imageList && note.imageList.length) {
                  note.imageList.forEach(function(img) { images.push(img.urlDefault || img.url || ''); });
                  if (!cover) cover = note.imageList[0].urlDefault || note.imageList[0].url || '';
                }
              }
            }
          }
        } catch(e) {}
      }
    }
  }

  // 鏂瑰紡5: 鐢?edith API锛堥渶瑕?xsec_token锛?  if (!videoUrl && !images.length) {
    var noteIdMatch = realUrl.match(/\/item\/([a-f0-9]+)/);
    if (noteIdMatch) {
      var noteId = noteIdMatch[1];
      var xsecMatch = realUrl.match(/xsec_token=([^&]+)/);
      var xsec = xsecMatch ? xsecMatch[1] : '';
      if (xsec) {
        try {
          var apiUrl = 'https://edith.xiaohongshu.com/api/sns/web/v1/feed?note_id=' + noteId + '&xsec_token=' + xsec;
          var apiRes = await fetch(apiUrl, { headers: { 'User-Agent': UA_MOBILE, 'Referer': 'https://www.xiaohongshu.com/', 'Accept': 'application/json' } });
          if (apiRes.ok) {
            var apiJson = await apiRes.json();
            if (apiJson.success && apiJson.data && apiJson.data.items && apiJson.data.items.length) {
              var note = apiJson.data.items[0].note_card;
              if (note) {
                if (!title) title = note.title || note.display_title || '';
                if (!authorName) authorName = (note.user && note.user.nickname) || (note.user_info && note.user_info.nickname) || '';
                if (!cover) cover = note.cover && (note.cover.url_default || note.cover.url) || '';
                if (!videoUrl && note.video && note.video.media && note.video.media.stream) {
                  var c = note.video.media.stream.h264 || note.video.media.stream.h265 || [];
                  if (c.length) videoUrl = c[0].masterUrl || (c[0].backupUrls && c[0].backupUrls[0]) || '';
                }
                if (!images.length && note.image_list && note.image_list.length) {
                  note.image_list.forEach(function(img) { images.push(img.url_default || img.url || ''); });
                }
              }
            }
          }
        } catch(e) {}
      }
    }
  }

  // 鏈夊皝闈㈠浘灏辩畻鎴愬姛锛岄伩鍏嶆姤閿?  if (!videoUrl && !images.length && !cover) {
    throw new Error('鏈彁鍙栧埌灏忕孩涔﹀唴瀹癸紙鍚勬柟妗堝潎澶辫触锛夛紝椤甸潰缁撴瀯鍙兘宸插彉鍖?);
  }

  return {
    type: images.length ? 'image' : 'video',
    title: title || '',
    desc: title || '',
    author: { name: authorName || '', id: '', avatar: authorAvatar || '' },
    cover: cover || '',
    url: videoUrl || '',
    images: images,
  };
}// ================= 寰崥 =================
async function parseWeibo(originalUrl) {
  const html = await fetchHtml(originalUrl, { Referer: 'https://weibo.com/' });

  let videoUrl = '';
  const v1 = html.match(/"stream_url_hd"\s*:\s*"([^"]+)"/) || html.match(/"stream_url"\s*:\s*"([^"]+)"/);
  if (v1) videoUrl = v1[1].replace(/\\\//g, '/');

  const titleMatch = html.match(/<meta\s+property="og:title"[^>]*content="([^"]+)"/);
  const coverMatch = html.match(/<meta\s+property="og:image"[^>]*content="([^"]+)"/);
  const authorMatch = html.match(/"screen_name"\s*:\s*"([^"]+)"/);

  if (!videoUrl) throw new Error('鏈彁鍙栧埌寰崥瑙嗛鍦板潃');

  return {
    type: 'video',
    title: titleMatch ? titleMatch[1] : '',
    desc: titleMatch ? titleMatch[1] : '',
    author: { name: authorMatch ? authorMatch[1] : '', id: '', avatar: '' },
    cover: coverMatch ? coverMatch[1] : '',
    url: videoUrl,
    images: [],
  };
}


// ================= 璋冭瘯宸ュ叿 =================
// 鍦?URL 涓婂姞 &debug=1 鍙互鏌ョ湅椤甸潰鐗囨锛屾柟渚垮畾浣嶉棶棰?async function fetchDebugHtml(url) {
  const res = await fetch(url, { headers: {
    'User-Agent': UA_MOBILE,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  } });
  const text = await res.text();
  let debug = '=== URL ===\n' + (res.url || url) + '\n\n';
  debug += '=== 鍏ㄩ儴 HTML 鍓?50000 瀛楃 ===\n' + text.substring(0, 50000) + '\n\n';
  debug += '=== script 鏍囩鎽樿 ===\n';
  var scriptRe = /<script[^>]*>([\s\S]{0,800})?<\/script>/g;
  var m; var count = 0;
  while ((m = scriptRe.exec(text)) !== null && count < 30) {
    const attrs = m[0].match(/<script([^>]*)>/);
    const snippet = (m[1] || '(empty)').substring(0, 600);
    debug += '[' + count + '] <script' + (attrs ? attrs[1] : '') + '> -> ' + snippet + '\n';
    count++;
  }
  var patterns = ['__INITIAL_STATE__', '__NEXT_DATA__', '__NUXT__', '__APOLLO_STATE__', 'RENDER_DATA', 'item_list', 'aweme_list', 'note_detail', 'play_addr'];
  debug += '\n=== JSON 鏁版嵁鎼滅储 ===\n';
  var found = false;
  patterns.forEach(function(p) {
    var idx = text.indexOf(p);
    if (idx >= 0) {
      found = true;
      var before = text.substring(Math.max(0, idx - 200), idx);
      var after = text.substring(idx, Math.min(text.length, idx + 2000));
      debug += '鎵惧埌 [' + p + '] 浣嶇疆: ' + idx + '\n鍓嶆枃: ' + before + '\n鍚庢枃: ' + after + '\n\n';
    }
  });
  if (!found) debug += '(椤甸潰涓婃病鏈?\n';
  return debug;
}
module.exports = async function(req, res) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      return res.status(204).end();
    }

    const targetUrl = req.query.url;
        if (!targetUrl) return sendJson(res, { code: 400, msg: '缂哄皯 url 鍙傛暟' }, 400);
    
        // 璋冭瘯妯″紡
        if (req.query.debug === '1') {
          try {
            const debugInfo = await fetchDebugHtml(targetUrl);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).send(debugInfo);
          } catch (e) {
            return sendJson(res, { code: 500, msg: '璋冭瘯鎶撳彇澶辫触: ' + e.message }, 500);
          }
        }
    if (!targetUrl) return fail('缂哄皯 url 鍙傛暟', 400);

    const platform = detectPlatform(targetUrl);

    try {
      let data;
      switch (platform) {
        case 'douyin':
          data = await parseDouyin(targetUrl);
          break;
        case 'bilibili':
          data = await parseBilibili(targetUrl);
          break;
        case 'kuaishou':
          data = await parseKuaishou(targetUrl);
          break;
        case 'xiaohongshu':
          data = await parseXiaohongshu(targetUrl);
          break;
        case 'weibo':
          data = await parseWeibo(targetUrl);
          break;
        default:
          return sendJson(res, { code: 400, msg: '鏆備笉鏀寔璇ュ钩鍙伴摼鎺? }, 400);
      }
      return sendJson(res, { code: 200, msg: '瑙ｆ瀽鎴愬姛', platform: platform, data: data });
    } catch (e) {
      return sendJson(res, { code: 500, msg: '瑙ｆ瀽澶辫触: ' + (e && e.message ? e.message : String(e)) }, 500);
    }
  
}

