var path = require("path");
var express = require("express");
var https = require("https");

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
    hostname: API_HOST,
    path: apiPath,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
      "Content-Length": Buffer.byteLength(postData)
    }
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
