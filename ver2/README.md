# SOMATIC / OTHERWHERE ver2

速い手の動き・複数の指の複雑な動きに反応して形が崩れ、落ち着くと手の形へ戻る試作です。

[アプリを開く](https://noro2024.github.io/somatic-otherwhere/ver2/)

[公開用ビルドZIP](https://noro2024.github.io/somatic-otherwhere/somatic-otherwhere-ver2-web.zip)

[ソースZIP](https://noro2024.github.io/somatic-otherwhere/somatic-otherwhere-ver2-source.zip)

「カメラで読み取り」で開始。「停止」でカメラと音を停止。HTTPSまたはlocalhostが必要です。
カメラ映像・座標は端末内処理で、サーバーへ送信しません。

開発: Node.js 24で `npm ci` → `npm run assets` → `npm run dev`。
公開用ビルド: `npm run build`。distの中身を静的HTTPSサーバーへ配置してください。
骨・筋肉は補間表示であり、医療用計測ではありません。
