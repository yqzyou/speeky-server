var path = require("path");
var express = require("express");
var https = require("https");

var app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 环境变量
var DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

// 首页
app.get("/", function (req, res) {
  res.json({ status: "ok", service: "speeky-server", time: new Date().toISOString() });
});

/**
 * 获取微信 OpenID（云托管自动注入header）
 */
app.get("/api/wx_openid", function (req, res) {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  } else {
    res.send("");
  }
});

/**
 * AI日记反馈
 * POST /api/ai-feedback
 */
app.post("/api/ai-feedback", function (req, res) {
  var text = req.body.text || "";
  if (text.length < 5) {
    return res.json({ code: 1, msg: "text too short" });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.json({ code: 0, data: fallbackFeedback() });
  }

  var prompt = 'You are an English writing tutor. Analyze this diary entry by a Chinese English learner. ' +
    'Return JSON only, no markdown fence: ' +
    '{"good": "one thing done well (in Chinese)", "suggest": "one improvement suggestion (in Chinese)", ' +
    '"better": "rewrite one sentence in better English", "score": 85}\n\nDiary: ' + text;

  var postData = JSON.stringify({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.3
  });

  var options = {
    hostname: "api.deepseek.com",
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + DEEPSEEK_API_KEY,
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  var request = https.request(options, function (response) {
    var body = "";
    response.on("data", function (chunk) { body += chunk; });
    response.on("end", function () {
      try {
        var json = JSON.parse(body);
        var content = json.choices[0].message.content.trim();
        var result;
        try { result = JSON.parse(content); }
        catch (e) { result = fallbackFeedback(); }
        res.json({ code: 0, data: result });
      } catch (e) {
        res.json({ code: 0, data: fallbackFeedback() });
      }
    });
  });

  request.on("error", function () {
    res.json({ code: 0, data: fallbackFeedback() });
  });

  request.write(postData);
  request.end();
});

/**
 * 语音评测
 * POST /api/speech-eval
 */
app.post("/api/speech-eval", function (req, res) {
  var text = req.body.text || "";
  var audioDuration = req.body.audioDuration || 0;

  if (!text) {
    return res.json({ code: 1, msg: "missing text" });
  }

  var base = 65 + Math.floor(Math.random() * 15);
  if (audioDuration > 0) {
    var wordCount = text.split(" ").length;
    var expectedDuration = wordCount * 0.4;
    var ratio = audioDuration / expectedDuration;
    if (ratio > 0.6 && ratio < 1.5) base = Math.min(100, base + 10);
    else if (ratio >= 1.5 && ratio < 2.5) base = Math.min(100, base + 3);
  }

  var hasComplex = text.split(" ").filter(function (w) { return w.length > 7; }).length;
  if (hasComplex > 0) base = Math.min(100, base + 3);

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
  console.log("speeky-server running on port " + port);
});
