// 手当てじゅんばんの検査。場面のデータ（形・字数・出典）・札の作り方（全部の場面×300通り）・今日の5問と上級の組み方（3年分）・
// 通しで遊ぶ・順番ちがい・やってはいけない札・ヒント・続きから・上級・練習・おさらい・とことん（何百回）・手当て帳・実績・
// カレンダー・あとから・古いタブ・記録の形・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";
import { checkDepth } from "./depth-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const firstClose = async (q) => { if (await q.locator("#howto[open]").count()) await q.click("#howto-ok"); if (await q.evaluate(() => !!(window.Core && Core.coach && Core.coach.active()))) { await q.evaluate(() => { Core.coach.leave(); scrollTo(0, 0); }); await q.waitForTimeout(100); } }; // はじめての練習の吹き出しをやめてホームへ（sync-template の migrateFirstQa が足した）
const G = createRequire(import.meta.url)(path.join(root, "data.js"));
const len = (t) => [...t].length;

// ---- 1. 場面のデータ（ブラウザを使わない）----
{
  const bad = [];
  const ids = new Set();
  for (const s of G.SCENES) {
    if (ids.has(s.id)) bad.push(s.id + " 同じ id"); ids.add(s.id);
    if (![0, 1, 2].includes(s.lv)) bad.push(s.id + " 難しさ");
    if (!G.CAT[s.cat]) bad.push(s.id + " 分野");
    if (s.steps.length < 2 || s.steps.length > 5) bad.push(s.id + " 手順は2〜5");
    if (!s.src.length || s.src.some((k) => !G.SRC[k] || !/^https:\/\/www\.(fdma\.go\.jp|city\.[a-z]+\.(lg\.)?jp|jrc\.or\.jp)\//.test(G.SRC[k][1]))) bad.push(s.id + " 出典が公的機関の URL でない");
    if (len(s.scene) > 32) bad.push(s.id + " 場面が32字より長い");
    if (len(s.look) > 30) bad.push(s.id + " ヒントが30字より長い");
    for (const [t, w] of [...s.steps, ...s.ng]) { if (len(t) > 18) bad.push(`${s.id} 札「${t}」が18字より長い`); if (!w || len(w) > 40) bad.push(`${s.id} 「${t}」のなぜが空か40字より長い`); }
    const texts = [...s.steps, ...s.ng].map((x) => x[0]);
    if (new Set(texts).size !== texts.length) bad.push(s.id + " 同じ文の札がある");
    if (s.call && len(s.call) > 40) bad.push(s.id + " 119番の目安が40字より長い");
  }
  check(`場面のデータ：${G.SCENES.length}場面すべて、手順2〜5・札は18字以内・なぜは40字以内・出典は公的機関`, bad.length === 0, bad.slice(0, 6).join(" / "));
  check("場面は32（やさしい7・ふつう14・むずかしい11）。足したら数も直す", G.SCENES.length === 32 && [0, 1, 2].map((l) => G.idsOf(l).length).join() === "7,14,11");
  check("どの分野にも場面がある・命を救う（胸骨圧迫・AED）の場面がある", Object.keys(G.CAT).every((c) => G.SCENES.some((x) => x.cat === c)) && ["cpr", "aed", "collapse"].every((id) => G.BY[id]));
  check("むずかしい場面は、やってはいけない札を持つものが半分以上", G.idsOf(2).filter((id) => G.BY[id].ng.length).length * 2 >= G.idsOf(2).length);
  const allTxt = JSON.stringify(G.SCENES);
  check("言い方：医療の効果を言い切らない・治る／治せるを書かない", !/必ず治|治せます|これで安心|完治/.test(allTxt));
  check("赤十字の印（十字）や実在の会社名を使わない（エピペン® は資料どおりの例としてだけ）", !/✚|➕|✙|十字マーク/.test(allTxt) && (allTxt.match(/エピペン/g) || []).length <= 1);
}
{
  // 札の作り方：同じ tag で同じ並び・手順が全部ある・しない札の数・正しい順のままにしない（全部の場面×300通り）
  const bad = [], kinds = {};
  for (const s of G.SCENES) for (let i = 0; i < 300; i++) {
    for (const hard of [false, true]) {
      const tag = `${s.id}|qa${i}`, P = G.make(tag, hard), why = [];
      const st = P.cards.filter((c) => c.k === "s"), ng = P.cards.filter((c) => c.k === "n");
      if (st.length !== s.steps.length || st.map((c) => c.o).sort((a, b) => a - b).join() !== s.steps.map((_, j) => j).join()) why.push("手順の札が足りない");
      const want = hard ? s.ng.length : Math.min(s.ng.length, s.lv === 0 ? 1 : s.lv === 1 ? 1 : 2);
      if (ng.length > want || (s.lv > 0 && ng.length !== want)) why.push(`しない札の数 ${ng.length}`);
      if (P.cards.length >= 2 && P.cards.every((c, j) => c.k === "s" && c.o === j)) why.push("正しい順のまま");
      if (JSON.stringify(G.make(tag, hard)) !== JSON.stringify(P)) why.push("同じ種で同じにならない");
      if (why.length) bad.push(`${tag}${hard ? "（上級）" : ""}：${why.join("・")}`);
      if (!hard) { kinds[s.id] = kinds[s.id] || new Set(); kinds[s.id].add(P.cards.map((c) => c.t).join("/")); }
    }
  }
  check("札の作り方：32場面×300通り×（ふつう・上級）で、手順が全部そろい、しない札の数が合い、正しい順のまま出ない", bad.length === 0, bad.slice(0, 5).join(" / "));
  const few = G.SCENES.filter((s) => kinds[s.id].size < (s.steps.length + s.ng.length > 2 ? 2 : 1)).map((s) => s.id); // 札2枚だけの場面は、正しい順でない並びが1つしか無い
  check("どの場面も札の並びが2通り以上出る（同じ並びばかりにならない）", few.length === 0, few.join(","));
  const total = Object.values(kinds).reduce((a, k) => a + k.size, 0);
  check("札の並び・しない札の組み合わせは合わせて300通り以上（とことん・練習で同じ問題が続かない）", total >= 300, `${total}通り`);
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], cover = new Set(); let sameAsPrev = 0, prev = "";
  const d0 = Date.parse("2026-11-07");
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10), dl = G.dailyTags(d), hl = G.hardTags(d);
    const dk = dl.map((t) => t.split("|")[0]), hk = hl.map((t) => t.split("|")[0]);
    if (dl.length !== 5 || new Set(dk).size !== 5 || dk.map((k) => G.BY[k].lv).join() !== "0,0,1,1,2") bad.push(d + " 今日");
    if (hl.length !== 3 || new Set(hk).size !== 3 || hk.some((k) => G.BY[k].lv !== 2) || hk.includes(dk[4])) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
    if (dk.join() === prev) sameAsPrev++; prev = dk.join();
    if (i < 60) [...dk, ...hk].forEach((k) => cover.add(k));
  }
  check("今日の5問（やさしい2・ふつう2・むずかしい1、場面は重ねない）と上級（むずかしい3・今日のむずかしいと別）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("2か月のうちに全部の場面が出る・前の日と同じ組の日が無い", cover.size === G.SCENES.length && sameAsPrev === 0, `${cover.size}場面・前の日と同じ ${sameAsPrev}日`);
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), data = readFileSync(path.join(root, "data.js"), "utf8"), readme = readFileSync(path.join(root, "README.md"), "utf8");
// ひな形の写し（<!-- 名前:begin〜end -->）はゲームの言葉ではないので外し、Core.kofi・Core.KOFI は写す前の形にもどして見る（shared-workflows の sync-template が足した）
const gameOwn = (t) => t.replace(/<!-- ([a-z0-9-]+):begin[\s\S]*?<!-- \1:end -->/g, "").split("${Core.KOFI}").join("https://ko-fi.com/satouaaaaa").replace(/Core\.kofi\(("(?:[^"\\]|\\.)*"), ("(?:[^"\\]|\\.)*")\)/g, (m, a, b) => "`<p class=\"note kofi\">" + JSON.parse(a) + "、<a href=\"https://ko-fi.com/satouaaaaa\" target=\"_blank\" rel=\"noopener\">Ko-fi でコーヒー1杯の応援</a>をもらえると、" + JSON.parse(b) + "の励みになります（任意・遊ぶのはずっと無料）。</p>`");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの並びと回の名札だけ（今日の5問・上級は日付の乱数。data.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(data));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + data));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(data.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("チケット・回数制限・🔒で開くモードを入れない（好きなだけ遊べる。2026-11-06 satou さん）", !/🎫|チケット|スタミナ|すると開く|のあとで開く/.test(gameOwn(html)));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html + data));
check("言い方：本当の場面では119番・学ぶためのもので講習の代わりではない、を画面と README に書く", /すぐ119番/.test(gameOwn(html)) && /講習の代わり/.test(gameOwn(html)) && /119/.test(readme) && /講習/.test(readme));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキー（記録・文字・復習）だけで読む・depth.js も前に読む", /<script src="transfer\.js" data-game="teate-junban" data-keys="teate-v1,teate-fs,teate-depth"><\/script>\s*<script src="depth\.js" data-game="teate-junban" data-key="teate-depth"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="data.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/teate-junban/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readme.replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js・深さの depth.js も）、外へ何も送らない", ["./index.html", "./data.js", "./transfer.js", "./depth.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：install は取り直して保存する（cache: reload）", /new Request\(u, \{ cache: "reload" \}\)/.test(sw));
  { const st = await checkSwStall(sw); check("PWA：本文の途中で通信が止まっても4秒で保存したものを返す・ふつうはネットの返事", st.ok, JSON.stringify(st)); }
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "手当てじゅんばん" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { await firstClose(p); };
const order = (p) => p.evaluate(() => { const c = __tj.cur(); return c.P.cards.map((x, j) => [x, j]).filter(([x]) => x.k === "s").sort((a, b) => a[0].o - b[0].o).map(([, j]) => j); });
const ngIdx = (p) => p.evaluate(() => { const c = __tj.cur(); return c.P.cards.findIndex((x, j) => x.k === "n" && !c.ngs.includes(j)); });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("teate-v1") || "{}"));
// 並べる。early=1 なら最後の手順を先に押して「まだ」を1回出す
async function solve(p, { early = 0 } = {}) {
  const o = await order(p), done = await p.evaluate(() => __tj.cur().p);
  if (early && o.length - done >= 2) await p.click(`.cd[data-j="${o[o.length - 1]}"]`);
  for (const j of o.slice(done)) await p.click(`.cd[data-j="${j}"]`);
  await p.waitForSelector(".verdict");
}

try {
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#core-coach").waitFor({ timeout: 3000 }).then(() => true, () => false));
  await firstClose(p);
  check("ホームに「本当の場面では、すぐ119番」の注意", (await p.textContent(".warn")).includes("119番"));
  check("上級・とことん・練習ははじめから押せる（鍵なし）", await p.locator("#go-h:not([disabled])").count() === 1 && await p.locator("#go-e:not([disabled])").count() === 1 && await p.locator("#go-p:not([disabled])").count() === 1);
  await p.click('.fsrow button[data-fs="3"]'); await p.reload(); await p.waitForTimeout(150);
  check("文字の大きさ：「とても大きい」にすると開き直しても残る", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "22px");
  await p.click('.fsrow button[data-fs="2"]');

  await p.click("#go-d");
  const tags = await p.evaluate(() => __tj.load().runs.d.list);
  check("今日の5問は日付から決まる（data.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("問題の画面：場面・番号の枠（手順の数）・札（手順＋しない札）", await p.locator(".scene").count() === 1 && await p.locator(".slots li").count() === (await p.evaluate(() => __tj.cur().P.n)) && await p.locator(".cd").count() === (await p.evaluate(() => __tj.cur().P.cards.length)));
  // 1問目：順番ちがいを1回
  const o1 = await order(p);
  await p.click(`.cd[data-j="${o1[o1.length - 1]}"]`);
  check("順番ちがいは ✕ と「まだです」の文字（色だけで分けない）・知らせは role=status", (await p.textContent("#msg")).includes("✕ まだです") && await p.getAttribute("#msg", "role") === "status");
  await p.click(`.cd[data-j="${o1[0]}"]`);
  check("正しい札は番号の枠に入り、✓ と理由が出る・札は消える", await p.locator(".slots li.got").count() === 1 && (await p.textContent(".slots li.got")).length > 8 && await p.locator(`.cd[data-j="${o1[0]}"].used`).count() === 1);
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（並べた枠・まちがいの数のまま）", await p.locator(".slots li.got").count() === 1 && await p.evaluate(() => __tj.cur().m) === 1);
  await solve(p);
  check("並べ終えると、順番と理由・やってはいけないこと・出典・★2（まちがい1回）", await p.locator(".verdict ol li").count() === o1.length && await p.locator(".verdict .src a").count() >= 1 && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  check("取れなかった星は ☆ で出す（色だけで分けない）", (await p.textContent(".verdict .stars")).includes("☆"));
  await p.click("#next");
  // 2問目：ヒント2回
  await p.click("#hint");
  check("ヒント1は見るところを言う（札は光らせない）", (await p.textContent("#hintbox")).includes("💡") && await p.locator(".cd.hl").count() === 0);
  await p.click("#hint");
  const o2 = await order(p);
  check("ヒント2は次の札を光らせ 👉 を付ける・ヒントは2回まで", await p.locator(`.cd.hl[data-j="${o2[0]}"]`).count() === 1 && await p.locator("#hint:disabled").count() === 1);
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  // 3〜5問目：しない札があれば押す
  let ngHit = false;
  for (let i = 2; i < 5; i++) {
    const nj = await ngIdx(p);
    if (nj >= 0 && !ngHit) {
      await p.click(`.cd[data-j="${nj}"]`); ngHit = true;
      check("やってはいけない札は ✕・取り消し線・「しません」と理由を出し、押せなくなる", await p.locator(`.cd[data-j="${nj}"].ng:disabled`).count() === 1 && (await p.textContent("#msg")).includes("✕ これはしません") && (await p.evaluate((j) => getComputedStyle(document.querySelector(`.cd[data-j="${j}"]`)).textDecorationLine, nj)).includes("line-through"));
    }
    await solve(p); await p.click("#next");
  }
  // しない札の無い場面（arm-fx など8場面）だけが3〜5問目に並ぶ日は、年に6日ほどある（2026-11-17 はその日で、QA が日付で落ちた）。その日はデータでそうなっていることを確かめる
  const noNgToday = G.dailyTags(TODAY).slice(2).every((t) => !G.make(t).cards.some((x) => x.k === "n"));
  check("今日の5問のどこかに、やってはいけない札が出る（しない札の無い場面だけの日を除く）", ngHit || noNgToday, noNgToday ? "今日の3〜5問目はしない札の無い場面だけ" : "");
  check("しない札の無い場面だけが3〜5問目に並ぶ日は、年に10日より少ない", (() => { let n = 0; for (let i = 0; i < 365; i++) { const d = new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10); if (G.dailyTags(d).slice(2).every((t) => !G.make(t).cards.some((x) => x.k === "n"))) n++; } return n < 10; })());
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい（1・2・…）", s1.days[TODAY] && s1.days[TODAY].m[0] === 1 && s1.days[TODAY].m[1] === 2 && s1.days[TODAY].m.length === 5);
  const share = await p.textContent(".share");
  check("シェアの文に答え・場面の名前を出さない（印だけ）", /第\d+回/.test(share) && /🟢|🔶|🔺/.test(share) && !G.SCENES.some((x) => share.includes(x.name)), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」・続けて遊ぶ（とことん）・上級のボタン", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("手当て帳に並べた場面が載り、まちがえた場面はおさらいに入る", Object.keys(s1.dex).length === 5 && Object.keys(s1.miss).length >= 2);
  await p.click("#back");
  check("ホームに「まちがえた場面のおさらい」", await p.locator("#go-miss").count() === 1);
  // 上級：ヒントなし・3問・しない札は全部
  await p.click("#go-h");
  const hl = await p.evaluate(() => __tj.load().runs.h.list);
  check("上級はヒントのボタンが無い・3問・しない札を全部出す", await p.locator("#hint").count() === 0 && hl.length === 3 && (await p.evaluate(() => __tj.cur().P.cards.filter((c) => c.k === "n").length)) === G.BY[hl[0].split("|")[0]].ng.length);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // おさらい：まちがえた場面だけ。まちがいなしで並べると外れる
  await p.click("#back");
  const missBefore = Object.keys((await mem(p)).miss);
  await p.click("#go-miss");
  const ml = await p.evaluate(() => __tj.load().runs.p.list.map((t) => t.split("|")[0]));
  check("おさらいは、まちがえた場面だけ", ml.length === missBefore.length && ml.every((id) => missBefore.includes(id)));
  for (let i = 0; i < ml.length; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("まちがいなしで並べた場面はおさらいから外れる・練習は今日の記録を増やさない", Object.keys((await mem(p)).miss).length === 0 && JSON.stringify((await mem(p)).days) === JSON.stringify(s1.days));
  // 練習：分野
  await p.click("#back"); await p.click("#go-p"); await p.click('.lv button[data-c="life"]');
  check("練習の分野を選ぶと、その分野の場面だけ", (await p.evaluate(() => __tj.load().runs.p.list)).every((t) => G.BY[t.split("|")[0]].cat === "life"));
  // 練習のボタンは全部、押すと場面が出る（2026-11-07「ぜんぶまぜる」でホームに戻っていた。CodeRabbit）
  for (const t of ["0", "1", "2", "all"]) {
    await p.click("#back"); await p.click("#go-p"); await p.click(`.lv button[data-t="${t}"]`);
    const pl = await p.evaluate(() => (__tj.load().runs.p || {}).list || []);
    const lvs = await p.evaluate((l) => l.map((x) => G.BY[x.split("|")[0]]?.lv), pl);
    check(`練習「${t}」を押すと、その難しさの場面が並ぶ画面になる`, pl.length > 0 && lvs.every((v) => v !== undefined && (t === "all" || v === +t)) && await p.locator(".cd").count() > 0);
  }
  // 分野のボタンも全部押す（2026-11-07 CodeRabbit）
  for (const c of Object.keys(G.CAT)) {
    await p.click("#back"); await p.click("#go-p"); await p.click(`.lv button[data-c="${c}"]`);
    const pl = await p.evaluate(() => (__tj.load().runs.p || {}).list || []);
    check(`練習の分野「${c}」を押すと、その分野の場面が並ぶ画面になる`, pl.length > 0 && pl.every((t) => G.BY[t.split("|")[0]]?.cat === c) && await p.locator(".cd").count() > 0);
  }
  // 練習の並びは何百回作っても、毎回5つのちがう正しい場面（分野は場面の数まで）
  {
    const bad = await p.evaluate(() => {
      const G = __tj.G, s = __tj.load(), out = [];
      const opts = [0, 1, 2, "all", ...Object.keys(G.CAT).map((c) => "cat:" + c)];
      for (const o of opts) for (let i = 0; i < 400; i++) {
        const ids = __tj.practiceList(o, s).map((t) => t.split("|")[0]);
        const pool = o === "all" ? G.SCENES : typeof o === "number" ? G.SCENES.filter((x) => x.lv === o) : G.SCENES.filter((x) => x.cat === o.slice(4));
        const want = Math.min(5, pool.length);
        if (ids.length !== want || new Set(ids).size !== want || !ids.every((id) => pool.some((x) => x.id === id))) { out.push(o + ":" + ids.join(",")); break; }
      }
      return out;
    });
    check("練習の並びは400回ずつ作っても、毎回ちがう正しい場面が5つ（分野は場面の数まで）", bad.length === 0, bad.join(" "));
  }
  // 手当て帳 → 見直し → その場面を並べる
  await p.click("#back"); await p.click("#go-dex");
  const firstId = await p.getAttribute(".book button", "data-k");
  await p.click(".book button");
  check("手当て帳の場面を押すと、手順・理由・出典を見直せる", await p.locator("#review ol li").count() >= 2 && await p.locator("#review .src a").count() >= 1);
  await p.click("#go-one");
  check("見直しから、その場面だけを並べられる", (await p.evaluate(() => __tj.load().runs.p.list)).every((t) => t.startsWith(firstId + "|")));
  // とことん：まちがえても終わらない・ここで降りる・自己ベストはまちがいなしの数
  await p.click("#back"); await p.click("#go-e");
  check("とことんは全部の場面を1回ずつ（やさしい→ふつう→むずかしい）", await p.evaluate(() => { const l = __tj.load().runs.e.list.map((t) => t.split("|")[0]); return l.length === __tj.G.SCENES.length && new Set(l).size === l.length; }));
  await solve(p); await p.click("#next"); await solve(p); await p.click("#next");
  await solve(p, { early: 1 }); await p.click("#next");
  check("とことんはまちがえても続く（次の場面が出る）", await p.locator(".cd").count() > 0 && await p.evaluate(() => __tj.cur().i) === 3);
  await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、まちがいなしの場面（2）を自己ベストに", (await mem(p)).ebest === 2 && (await p.textContent("#ebest")).includes("2") && (await p.textContent("#eres")).includes("3場面"));
  // 並べ終えた直後（次へを押す前）でも「ここで降りる」で終われ、その場面が数に入る（前は押しても何も起きなかった）
  await p.click("#go-e"); await solve(p);
  check("とことん：並べ終えた直後に「ここで降りる」を押すと結果になり、その場面が数に入る", (await p.textContent("#quit")).includes("1場面で終える") && (await p.click("#quit"), await p.waitForTimeout(150), await p.locator("#eres").count() === 1) && (await p.textContent("#eres")).includes("1場面") && (await p.textContent("#ebest")).includes("まちがいなしの場面 1") && (await mem(p)).runs.e === null);
  {
    // 遊び方を Esc で閉じても「見た」が残る（前は「わかった」でしか残らず、Esc で閉じた人に毎回出た）
    const q = await newPage(); const shown = await q.locator("#core-coach").waitFor({ timeout: 3000 }).then(() => true, () => false);
    await q.keyboard.press("Escape"); await q.reload(); await q.waitForTimeout(200);
    check("初めて開いて遊び方を Esc で閉じ、開き直すと遊び方が出ない", shown && await q.locator("#howto[open]").count() === 0);
    await q.context().close();
  }
  {
    // 保存できないブラウザ：帯で知らせ、知らせ続け、保存できたら消す（前は黙って、開き直すと記録が消えた）
    const sctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await sctx.addInitScript(() => { window.__origSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; });
    const q = await newPage(390, sctx); await closeHow(q); await q.click("#go-d"); await solve(q);
    const one = await q.locator("#savewarn").count() === 1 && (await q.textContent("#savewarn")).includes("保存できませんでした");
    await q.waitForTimeout(2000);
    const stay = await q.locator("#savewarn").count() === 1;
    await q.evaluate(() => { Storage.prototype.setItem = window.__origSetItem; });
    await q.click("#next"); await solve(q);
    check("保存できないと帯がちょうど1つ出て2秒たっても残り、保存できるようになったら消える", one && stay && await q.locator("#savewarn").count() === 0, `one=${one} stay=${stay}`);
    await sctx.close();
  }
  {
    // とことんの並びを何百回：1つの並びの中で重ならない・つなぎ目で同じ場面を続けない
    const r = await p.evaluate(() => { let bad = 0, joint = 0; for (let i = 0; i < 500; i++) { const a = __tj.endlessList(), ids = a.map((t) => t.split("|")[0]); if (new Set(ids).size !== ids.length || ids.length !== __tj.G.SCENES.length) bad++; const b = __tj.endlessList(ids[ids.length - 1]); if (b[0].split("|")[0] === ids[ids.length - 1]) joint++; } return [bad, joint]; });
    check("とことんの並びを500回作って、1つの並びの中で重ならず、つなぎ目で同じ場面を続けない", r[0] === 0 && r[1] === 0, r.join(","));
  }
  {
    // 使い切っても続く：残り1つで新しい並びを足す
    const q = await newPage(); await closeHow(q); await q.click("#go-e");
    await q.evaluate(() => __tj.save((s) => { const r = s.runs.e; r.res = r.list.slice(0, -1).map(() => ({ m: 1 })); r.cur = null; }));
    await q.reload(); await q.waitForTimeout(150); await q.click("#go-e");
    const n = await q.evaluate(() => __tj.load().runs.e.list.length);
    check("とことんは全部の場面を使い切っても、新しい並びを足して続く", n === G.SCENES.length * 2 && await q.locator(".cd").count() > 0, n);
    await q.context().close();
  }
  {
    // 記録の形を直す（引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない）
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("teate-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { cut: '"><b id="xss2">', nope: 3 }; s.miss = { cut: "x", bee: "2026-11-07" }; s.runs = { e: { mode: "e", id: "x", date: "2026-11-07", list: ["cut|1"], res: [], clean: '"><i id="xss3">' }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-07", list: ["constructor|1"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["cut|1"], res: [] }, a3: { mode: "a", id: "a3", date: "2026-11-07", list: ["cut|1", "bee|2"], res: [{ m: 0 }], cur: { i: 1, tag: "bee|2", ngs: "x" } } }; s.days = { "2026-11-07": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] } }; localStorage.setItem("teate-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __tj.load());
    check("記録の形を直す：数の所の文字は0に・知らない場面・形のちがう途中経過と日ごとの記録は捨てる", st.ebest === 0 && st.dex.cut === 0 && !("nope" in st.dex) && !("cut" in st.miss) && st.miss.bee && st.runs.e.clean === 0 && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && st.runs.a3 && st.runs.a3.cur === null && Object.keys(st.days).length === 0);
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3").count() === 0);
    await q.context().close();
  }
  await p.goto(url); await p.waitForTimeout(150); await p.click("#go-ach");
  check("実績は16個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 16 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 2);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：資料の出どころと、本当の場面では119番", (await p.textContent("#about")).includes("119番") && await p.locator("#about a").count() >= 10);
  await p.context().close();

  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから
  {
    const q = await newPage();
    await q.evaluate(([d2, d3]) => { localStorage.setItem("teate-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0], k: [] }, [d3]: { m: [1, 0, 0, 2, 0], k: [] } }, hdays: {}, adays: {}, dex: {}, miss: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __tj.lateDays(__tj.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= "2026-11-07");
    check("カレンダー：取りこぼした過去7日（第1回より後）だけを押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    // 第1回の日から日がたっていないうちは、日付をずらして見る
    const d = dayBefore(1) >= "2026-11-07" ? dayBefore(1) : null;
    if (d) {
      await q.click(`.cal .miss[data-k="${d}"]`).catch(() => {});
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __tj.load().runs["a:" + d]?.list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日・シェア・Ko-fi には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("あとから：第1回（2026-11-07）より前の日は遊べない", lateList.length === 0);
    await q.context().close();
  }

  // 1問を深くする（shared-workflows routines/game-dev.md「1問を深くする」）：自信をかける（全部まちがえずに並べられる？）・復習
  {
    const q = await newPage(); await closeHow(q);
    await q.evaluate((t) => __tj.save((s) => { s.runs.p = { mode: "p", date: __tj.todayKey(), list: t, res: [], cur: null, id: "dp" }; }), ["cut|dp1", "scrape|dp2", "bruise|dp3"]);
    await q.evaluate(() => { Depth.runStart(); __tj.play("p"); });
    const sb = await q.$eval("#dp-sure", (b) => [b.getBoundingClientRect().height, b.getAttribute("aria-pressed"), b.textContent]);
    check("自信のボタン：高さ44px以上・はじめは押していない", sb[0] >= 44 && sb[1] === "false", sb.join(","));
    await q.click("#dp-sure");
    check("自信のボタンを押すと ✓ が出る（色だけで分けない）", (await q.getAttribute("#dp-sure", "aria-pressed")) === "true" && (await q.textContent("#dp-sure")).includes("✓"));
    { const o = await order(q); await q.click(`.cd[data-j="${o[o.length - 1]}"]`); }
    check("自信ありでまちがえると、知らせに「思いこみ」と出て、自信は変えられない", (await q.textContent("#msg")).includes("思いこみ") && await q.locator("#dp-sure:disabled").count() === 1);
    check("まちがえたその時に復習へ入る（並べ終えずにやめても残る）", await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("teate-depth") || "{}"); return !!(d.rv && d.rv[__tj.cur().tag]); }));
    await solve(q);
    check("並べ終えた画面に、自信ありでまちがえたことが出る", (await q.textContent(".verdict")).includes("自信ありでまちがえた"));
    await q.click("#next");
    { const o = await order(q); await q.click("#dp-sure"); await q.click(`.cd[data-j="${o[0]}"]`); }
    check("1枚目を押したあとは、自信のボタンは押せない（並べ始めてからは変えられない）", await q.locator("#dp-sure:disabled").count() === 1 && (await q.getAttribute("#dp-sure", "aria-pressed")) === "true");
    await solve(q);
    check("自信ありで、まちがえずに並べると「自信ありで、まちがえずに並べた」", (await q.textContent(".verdict")).includes("まちがえずに並べた"));
    await q.click("#next"); await solve(q); await q.click("#next"); await q.waitForTimeout(150);
    check("終えた直後の結果に「自信ありの当たり」が出る", (await q.textContent("#surestat")).includes("1/2"));
    const dp = await q.evaluate(() => JSON.parse(localStorage.getItem("teate-depth") || "{}"));
    check("まちがえた・ヒントを使った場面だけ復習に入る", Object.keys(dp.rv || {}).join() === "cut|dp1", Object.keys(dp.rv || {}).join(","));
    const n = await q.evaluate(() => { __tj.save((s) => { s.runs.p = { mode: "p", date: __tj.todayKey(), list: ["cut|s1", "scrape|s1"], res: [], cur: null, id: "sc1" }; }); __tj.play("p"); __tj.sureCount(true); __tj.sureCount(true); return __tj.load().runs.p.ds; });
    check("「自信あり」の数は1問につき1回だけ（2つのタブで同じ場面を当てても2回足さない）", n && n.n === 1 && n.ok === 1, JSON.stringify(n));
    await q.evaluate(() => { __tj.save((s) => { s.runs.p = null; }); const d = JSON.parse(localStorage.getItem("teate-depth")); for (const k in d.rv) d.rv[k].due = "2026-01-01"; localStorage.setItem("teate-depth", JSON.stringify(d)); });
    await q.goto(url); await q.waitForTimeout(150);
    check("日の来た復習があると、ホームに「復習 1場面」", (await q.textContent("#go-r")).includes("復習 1場面"));
    const before = await mem(q);
    await q.click("#go-r");
    check("復習の画面は「復習」と出る・同じ場面", (await q.textContent("header")).includes("復習") && await q.evaluate(() => __tj.cur().tag) === "cut|dp1");
    await solve(q); await q.click("#next"); await q.waitForTimeout(150);
    const after = await mem(q), dp2 = await q.evaluate(() => JSON.parse(localStorage.getItem("teate-depth")));
    check("復習を終えると結果は「復習」・今日の記録・あとからは増えない・シェアと Ko-fi は出ない", (await q.textContent("h1")).includes("復習") && JSON.stringify(after.days) === JSON.stringify(before.days) && JSON.stringify(after.adays) === JSON.stringify(before.adays) && await q.locator("#share").count() === 0 && await q.locator(".kofi").count() === 0);
    check("復習でまちがえずに並べると、次は3日後へ進む", Object.values(dp2.rv).every((x) => x.s === 1 && x.due > TODAY));
    await q.goto(url); await q.waitForTimeout(150);
    check("復習を終えたら、ホームの「復習」は消える", await q.locator("#go-r").count() === 0);
    await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("teate-depth")); d.rv["nai|1"] = { s: 0, due: "2026-01-01", t: 1 }; d.rv["constructor|x"] = { s: 0, due: "2026-01-01", t: 2 }; localStorage.setItem("teate-depth", JSON.stringify(d)); });
    await q.goto(url); await q.waitForTimeout(150);
    check("作り直せない鍵（無い場面・constructor）は復習に数えず、ホームも出る", await q.locator("#go-d").count() === 1 && await q.locator("#go-r").count() === 0);
    // 別のタブで先に進んだ古い画面は、復習の段を戻さない
    { const tq = "scrape|dq1";
      await q.evaluate((t) => { __tj.save((s) => { s.runs.p = { mode: "p", date: __tj.todayKey(), list: [t, "cut|dq2"], res: [], cur: null, id: "dq" }; }); __tj.play("p"); }, tq);
      await q.evaluate((t) => { __tj.save((s) => { s.runs.p.res.push({ m: 0 }); s.runs.p.cur = null; }); const d = JSON.parse(localStorage.getItem("teate-depth")); d.rv[t] = { s: 2, due: "2099-01-01", t: 9 }; localStorage.setItem("teate-depth", JSON.stringify(d)); }, tq);
      await q.click("#hint"); await q.waitForTimeout(80);
      check("別のタブで先に進んだ古い画面でヒントを押しても、復習の段は戻らない", await q.evaluate((t) => JSON.parse(localStorage.getItem("teate-depth")).rv[t].s, tq) === 2);
    }
    // 復習の途中でヒントを使って日の来た場面が0になっても・日が替わっても、ホームの「復習の続きから」で戻れる
    { const rk = Object.keys(dp2.rv)[0];
      await q.evaluate((k) => { __tj.save((s) => { s.runs.p = null; }); const d = JSON.parse(localStorage.getItem("teate-depth")); d.rv = { [k]: { s: 0, due: "2026-01-01", t: 3 } }; localStorage.setItem("teate-depth", JSON.stringify(d)); }, rk);
      await q.goto(url); await q.waitForTimeout(150); await q.click("#go-r"); await q.click("#hint");
      await q.evaluate(() => __tj.save((s) => { s.runs.r.date = "2026-01-02"; }));
      await q.goto(url); await q.waitForTimeout(150);
      check("復習の途中でヒントを使って日の来た場面が0になっても・日が替わっても、ホームの「復習の続きから」で戻れる", ((await q.locator("#go-r").count()) ? await q.textContent("#go-r") : "").includes("続きから"));
      if (await q.locator("#go-r").count()) { await q.click("#go-r"); check("復習の続きは同じ場面・使ったヒントはそのまま", await q.evaluate(() => __tj.cur().tag) === rk && await q.evaluate(() => __tj.cur().hints) === 1); }
    }
    { const t = await q.evaluate(() => { const d = JSON.parse(localStorage.getItem("teate-depth")); d.sure = 12; d.sureOk = 10; d.learned = 5; localStorage.setItem("teate-depth", JSON.stringify(d)); return __tj.achGot(__tj.load()); });
      check("実績「たしかの目」（自信ありで10場面）・「覚えなおし」（復習で5場面覚えた）が取れる", t.includes("sure10") && t.includes("learn5"), t.join(",")); }
    await q.context().close();
  }
  // 「自信あり」を押して1枚並べたあと開き直しても、並べ終えたら自信ありで数える（2026-11-17 CodeRabbit）
  {
    const q = await newPage(); await closeHow(q);
    await q.evaluate((t) => __tj.save((s) => { s.runs.p = { mode: "p", date: __tj.todayKey(), list: t, res: [], cur: null, id: "sr" }; }), ["cut|sr1", "scrape|sr2"]);
    await q.evaluate(() => { Depth.runStart(); __tj.play("p"); });
    await q.click("#dp-sure"); { const o = await order(q); await q.click(`.cd[data-j="${o[0]}"]`); }
    await q.reload(); await q.waitForTimeout(150); await q.evaluate(() => __tj.play("p"));
    check("自信ありで1枚並べたあと開き直しても、自信のボタンは押したまま・変えられない", await q.evaluate(() => __tj.cur().p) === 1 && (await q.getAttribute("#dp-sure", "aria-pressed")) === "true" && await q.locator("#dp-sure:disabled").count() === 1);
    await solve(q);
    const r = await q.evaluate(() => [__tj.load().runs.p.ds, JSON.parse(localStorage.getItem("teate-depth") || "{}")]);
    check("開き直したあと並べ終えても、自信ありで当てたと数える（画面・回の数・通しの数）", (await q.textContent(".verdict")).includes("自信ありで、まちがえずに並べた") && r[0] && r[0].n === 1 && r[0].ok === 1 && r[1].sure === 1 && r[1].sureOk === 1, JSON.stringify([r[0], r[1].sure, r[1].sureOk]));
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で並べ終えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    const ob = await order(b);
    await solve(a);
    await b.click(`.cd[data-j="${ob[0]}"]`);
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題を進めても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    await ctx.close();
  }

  // スマホ幅・大きい文字でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const [w, fs] of [[320, 3], [390, 2], [320, 1]]) {
      const q = await newPage(w); await closeHow(q);
      await q.evaluate((fs) => (localStorage.setItem("teate-fs", String(fs)), localStorage.setItem("a11y-v1", JSON.stringify({ ...JSON.parse(localStorage.getItem("a11y-v1") || "{}"), fs: undefined }))), fs); await q.reload(); await q.waitForTimeout(150);
      for (const go of [null, "#go-d", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e", "#go-p"]) {
        if (go === "solve") { await solve(q); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px 文字${fs} ${go || "ホーム"} ${ov}px`);
        // 動きの途中で測らない（2026-11-07 CI で1回だけ出典のリンクが44px未満と出た。値と display も残して原因を追えるようにする）
        await q.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1000))]));
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => Math.round(b.getBoundingClientRect().height) < 44).map((b) => `${(b.id || b.className || b.textContent).slice(0, 20)} ${b.getBoundingClientRect().height.toFixed(2)}px ${getComputedStyle(b).display}`))).map((x) => `${w}/${fs}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320px・とても大きい文字でも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // 札が画面の下のほうでも、押したあとの「✕ しません。理由」「✕ まだです」が画面の中に見える（2026-11-15 週1の改善。前は上級で押した回の3割ほどが画面の外だった）
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    const q = await newPage(360, ctx); await closeHow(q);
    await q.click("#go-h");
    const out = [];
    const seen = async (what) => { const r = await q.evaluate(() => { const m = document.getElementById("msg"), b = m.getBoundingClientRect(); return [m.textContent, Math.round(b.top), Math.round(b.bottom), innerHeight]; }); if (!r[0] || r[1] < 0 || r[2] > r[3]) out.push(`${what}:${r.join(",")}`); };
    for (let i = 0; i < 3; i++) {
      for (let j; (j = await ngIdx(q)) >= 0;) { await q.click(`.cd[data-j="${j}"]`); await seen(`${i + 1}問目しない札`); }
      const o = await order(q); await q.click(`.cd[data-j="${o[o.length - 1]}"]`); await seen(`${i + 1}問目まだ`);
      await solve(q); await q.click("#next"); await q.waitForTimeout(100);
    }
    check("スマホ（360×640）で札が画面の下のほうでも、まる・ばつと理由が画面の中に見え、その下の札も押せる", out.length === 0, out.join(" / "));
    await ctx.close();
  }
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    for (const j of await order(q)) { await q.focus(`.cd[data-j="${j}"]`); await q.keyboard.press("Enter"); await q.waitForTimeout(50); }
    check("キーボードだけで札を並べられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }
// 深さの部品（shared-workflows template/qa/depth-check.mjs）
{ const e = await checkDepth(readFileSync(path.join(root, "depth.js"), "utf8")); check("depth.js（自信をかける・復習）の動き", e.length === 0, e.join(" / ")); }
// 引き継ぎコード
try {
  const sample = { "teate-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2], k: ["cut", "scrape", "bee", "tooth", "aed"] } }, hdays: {}, adays: {}, dex: { cut: 1, scrape: 1, bee: 1, tooth: 1, aed: 1 }, miss: { aed: "2026-11-07" }, runs: {}, kofi: {}, ach: {}, ebest: 7, t: 1 }), "teate-fs": "3", "teate-depth": JSON.stringify({ v: 1, rv: { "cut|x1": { s: 1, due: "2026-11-20", t: 5 } } }) }; // 復習の記録も引き継ぐかを見る
  await checkTransfer({ browser, url, game: "teate-junban", sample, check, open: async (pg) => { await firstClose(pg); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
  { const c = await browser.newContext(); const r = await c.newPage(); const big = []; // 題が h1{flex:1} で縦に伸び（伸びない形と比べて4pxより高ければ失敗）、iPad の縦で大きなすき間が出た（shared-workflows incidents/2026-11-07-title-stretched.md）
    for (const [w, h] of [[820, 1180], [390, 844], [1280, 800]]) { await r.setViewportSize({ width: w, height: h }); await r.goto(url); await r.waitForTimeout(200); await r.keyboard.press("Escape"); await r.waitForTimeout(100);
      const v = await r.evaluate(() => { const e = [...document.querySelectorAll(".title")].find((x) => x.offsetParent); if (!e) return null; const h = e.getBoundingClientRect().height; const f = e.style.flex; e.style.flex = "none"; const n = e.getBoundingClientRect().height; e.style.flex = f; return h - n; });
      if (v === null || v > 4) big.push(`${w}x${h}:${v === null ? "題なし" : "+" + Math.round(v) + "px"}`); }
    check("ホームの題は縦長の画面でも縦に伸びない（820×1180・390×844・1280×800）", big.length === 0, big.join(" ")); await c.close(); }
{ // 知らせ（.toast）は下のボタンを塞がない（shared-workflows incidents/2026-11-17-known-game-bugs-spread.md）
  const pt = await browser.newPage(); await pt.goto(url);
  check("知らせ（.toast）が出ていても、その下のボタンを押せる（pointer-events:none）", await pt.evaluate(() => { const d = document.createElement("div"); d.className = "toast"; document.body.appendChild(d); const v = getComputedStyle(d).pointerEvents; d.remove(); return v === "none"; }));
  await pt.close(); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 手当てじゅんばん QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
