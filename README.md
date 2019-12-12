# slack-issue-creator
slackメッセージからgithub issueをつくるやつ。

## slack側の設定
1. appを作る
2. `OAuth & Permissions` でscopeをきもち多めにつける
3. Install app してBot Tokenを控える
4. `Interactive Components` で `Request URL` を `${origin}/slack/events` に設定する
5. `Interactive Components` で `Actions` に `Callback ID` が `create_github_issue` なactionを追加する

## dev
1. `.env.example` をコピって `.env` ファイルをつくる
2. tokenとか発行してきて入れる
3. `yarn && yarn dev`

## release
手元で `docker build` してよしなにやれ
