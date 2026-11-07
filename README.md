# 手当てじゅんばん

やけど・切りきず・熱中症・人が倒れたとき。けがや急病の応急手当てのカードを、する順に並べる1日5問の学習ゲーム。押すだけ、時間制限なし。

- 遊ぶ: https://satou-aaaaa.github.io/teate-junban/
- 今日の5問（やさしい2・ふつう2・むずかしい1）はだれでも同じで1日1回。上級（むずかしい3問・ヒントなし・やってはいけない手当てを全部まぜる）、練習（難しさ・分野で何度でも）、とことん（全部の場面を次々に）、まちがえた場面のおさらい、並べた場面が集まる「手当て帳」があります。
- 「やってはいけない手当て」のカード（水ぶくれをつぶす・服の上からAEDのパッドをはる など）もまざっています。並べ終わると、なぜその順なのかと出典が出ます。
- 文字の大きさは3段から選べます。見やすさの設定（読みやすい文字・色の見分け・動きを減らす・読み上げ）もあります。
- 機種を変えるときは「引き継ぎ」で、記録をコードと QR にして移せます。

## 中身の出どころ

手順は、次の公的な資料に書いてあることだけから作りました（資料に無いことは足していません）。場面ごとの出典はゲームの中に出ます。

- 総務省消防庁「一般市民向け 応急手当WEB講習」 <https://www.fdma.go.jp/relocation/kyukyukikaku/oukyu/06ichiran/index.html>
- 札幌市消防局「その他の応急手当（けが・事故）」 <https://www.city.sapporo.jp/shobo/kyukyu/oukyu/sonota-oukyu2.html>
- 千葉市消防局「けがややけどの応急手当」 <https://www.city.chiba.jp/shobo/keibo/kyukyu/kyuukyujusingaido/yakedo-kyotu/kegayayakedonooukyuuteate.html>
- 仙台市消防局「熱中症の応急処置」 <https://www.city.sendai.jp/kyukyukanri/kurashi/anzen/tobani/joho/nettyusyo.html>
- 日本赤十字社「動物にかまれた・蜂に刺された」 <https://www.jrc.or.jp/study/safety/animal/>

## 本当の場面では

命にかかわるとき・迷ったときは、すぐ119番に電話してください。このゲームは学ぶためのもので、医師の判断や講習の代わりにはなりません。消防署や日本赤十字社の講習で、実際に手を動かして練習するのがおすすめです。

## 記録と通信

記録は遊ぶ人のブラウザにだけ残り、ゲームから自動で外へ送ることはありません。例外は2つ：文字（Google Fonts）を読み込むとき、まだ端末に保存が無ければ Google に IP アドレスが届きます。「Xで投稿」「LINEで送る」「結果をシェア」を押したときだけ、結果の文が選んだ先に渡ります（場面の名前と答えは入りません）。

## 開発

```bash
bash scripts/setup.sh   # 最初に一度
node qa/run.mjs         # 検査（CI と同じ）
```

場面のデータは `data.js`（決まりは AGENTS.md）。

感想は [Issue のフォーム](https://github.com/satou-aaaaa/teate-junban/issues/new?template=feedback.yml) からどうぞ。
