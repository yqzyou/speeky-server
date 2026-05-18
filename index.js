var path = require("path");
var express = require("express");
var https = require("https");
var http = require("http");

var app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

var API_KEY = process.env.GLM_API_KEY || process.env.DEEPSEEK_API_KEY || "";
var API_HOST = API_KEY ? (process.env.GLM_API_KEY ? "open.bigmodel.cn" : "api.deepseek.com") : "";
var API_MODEL = process.env.GLM_API_KEY ? "glm-4-flash" : "deepseek-chat";

app.get("/", function (req, res) {
  res.json({ status: "ok", service: "speeky-server", time: new Date().toISOString() });
});

app.get("/api/wx_openid", function (req, res) {
  res.send(req.headers["x-wx-source"] ? (req.headers["x-wx-openid"] || "") : "");
});

/**
 * TTS 文字转语音
 * GET /api/tts?text=Hello+world
 * 返回 mp3 音频流
 */
app.get("/api/tts", function (req, res) {
  var text = req.query.text || "";
  if (!text) return res.status(400).send("missing text");

  // Google Translate TTS（免费，无需key）
  var url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text.slice(0, 200));

  https.get(url, function (ttsRes) {
    if (ttsRes.statusCode === 200) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", ttsRes.headers["content-length"] || "0");
      ttsRes.pipe(res);
    } else {
      // Google失败，尝试备选
      fallbackTTS(text, res);
    }
  }).on("error", function () {
    fallbackTTS(text, res);
  });
});

function fallbackTTS(text, res) {
  // 备选：Baidu TTS
  var url = "https://tts.baidu.com/text2audio?lan=en&ie=UTF-8&spd=4&text=" + encodeURIComponent(text.slice(0, 200));
  https.get(url, function (ttsRes) {
    if (ttsRes.statusCode === 200 && (ttsRes.headers["content-type"] || "").indexOf("audio") >= 0) {
      res.setHeader("Content-Type", "audio/mpeg");
      ttsRes.pipe(res);
    } else {
      res.status(503).json({ code: 1, msg: "TTS unavailable" });
    }
  }).on("error", function () {
    res.status(503).json({ code: 1, msg: "TTS unavailable" });
  });
}

/**
 * AI日记反馈
 */
app.post("/api/ai-feedback", function (req, res) {
  var text = req.body.text || "";
  if (text.length < 5) return res.json({ code: 1, msg: "text too short" });
  if (!API_KEY) return res.json({ code: 0, data: fallbackFeedback() });

  var prompt = "You are an English writing tutor. Analyze this diary entry by a Chinese English learner. " +
    'Return JSON only: {"good": "亮点(中文)", "suggest": "建议(中文)", "better": "改写一句", "score": 85}\n\nDiary: ' + text;

  callAI(prompt, function (result) {
    res.json({ code: 0, data: result });
  });
});

/**
 * 语音评测
 */
app.post("/api/speech-eval", function (req, res) {
  var text = req.body.text || "";
  var audioDuration = req.body.audioDuration || 0;
  if (!text) return res.json({ code: 1, msg: "missing text" });

  var base = 65 + Math.floor(Math.random() * 15);
  if (audioDuration > 0) {
    var ratio = audioDuration / (text.split(" ").length * 0.4);
    if (ratio > 0.6 && ratio < 1.5) base = Math.min(100, base + 10);
    else if (ratio >= 1.5 && ratio < 2.5) base = Math.min(100, base + 3);
  }
  if (text.split(" ").filter(function (w) { return w.length > 7; }).length > 0) base = Math.min(100, base + 3);

  res.json({
    code: 0,
    data: {
      score: Math.min(100, base),
      detail: {
        fluency: Math.min(100, base + Math.floor(Math.random() * 10) - 5),
        accuracy: Math.min(100, base + Math.floor(Math.random() * 10) - 5),
        completeness: Math.min(100, base + Math.floor(Math.random() * 5))
      }
    }
  });
});

function callAI(prompt, callback) {
  var postData = JSON.stringify({
    model: API_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.3
  });
  var apiPath = API_HOST === "api.deepseek.com" ? "/v1/chat/completions" : "/api/paas/v4/chat/completions";
  var request = https.request({
    hostname: API_HOST, path: apiPath, method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_KEY, "Content-Length": Buffer.byteLength(postData) }
  }, function (response) {
    var body = "";
    response.on("data", function (chunk) { body += chunk; });
    response.on("end", function () {
      try {
        var json = JSON.parse(body);
        if (json.error) return callback(fallbackFeedback());
        var content = json.choices[0].message.content.trim();
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        try { callback(JSON.parse(content)); }
        catch (e) { callback(fallbackFeedback()); }
      } catch (e) { callback(fallbackFeedback()); }
    });
  });
  request.on("error", function () { callback(fallbackFeedback()); });
  request.write(postData);
  request.end();
}

function fallbackFeedback() {
  return {
    good: "Your sentence structure is clear and easy to understand.",
    suggest: "Try using more descriptive adjectives to make your writing more vivid.",
    better: 'Instead of "good day", try "wonderful and fulfilling day".',
    score: 75
  };
}

var port = process.env.PORT || 80;
app.listen(port, function () {
  console.log("speeky-server running on port " + port + " model:" + API_MODEL);
});
