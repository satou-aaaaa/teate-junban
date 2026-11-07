// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題は入れず、遊び方の例（指の切りきず）だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const card = (n, t, c) => `<div style="display:flex;align-items:center;gap:18px;background:#fff;border:5px solid ${c};border-radius:18px;padding:14px 22px;font-size:36px;font-weight:900"><span style="color:${c};font-size:40px">${n}</span>${t}</div>`;
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:56px 72px;background:#f3efe6;color:#1d2b36;display:grid;grid-template-columns:1fr 520px;gap:40px;align-items:center">
    <div><div style="font-size:30px;color:#842c12;letter-spacing:.08em">消防庁などの資料にもとづく</div>
    <div style="font-size:96px;font-weight:900;margin-top:8px;color:#083f3a;line-height:1.2">手当て<br><span style="color:#b5431f">じゅんばん</span></div>
    <div style="font-size:36px;margin-top:14px">けがの手当て、どの順でする？</div></div>
    <div style="display:flex;flex-direction:column;gap:18px">${card("①", "流水で汚れを洗い流す", "#0f5f58")}${card("②", "清潔な布で強く押さえる", "#0f5f58")}${card("③", "？", "#b5431f")}</div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
