// アプリのアイコン（icon-192.png・icon-512.png）を作る。生成りの地に、番号つきの札が3枚（並べる遊び）。
// 赤十字の印は法律で使い方が決められているので使わない（十字の形を入れない）。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    const card = (y, n, c) => `<rect x="18" y="${y}" width="64" height="18" rx="4" fill="#fff" stroke="${c}" stroke-width="2.4"/><circle cx="28" cy="${y + 9}" r="6" fill="${c}"/><text x="28" y="${y + 13}" font-size="9" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="900">${n}</text><rect x="38" y="${y + 7}" width="36" height="4" rx="2" fill="#1d2b3655"/>`;
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#f3efe6"/>${card(20, 1, "#0f5f58")}${card(42, 2, "#0f5f58")}${card(64, 3, "#b5431f")}</svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
