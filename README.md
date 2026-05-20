# 📋 demo-task-gas — 曜日別タスクを Notion へ自動投入する GAS ツール

Google スプレッドシートに「曜日 × タスク」で登録しておいた繰り返しタスクを、**毎朝 5:00 に自動で Notion データベースへページとして投入する** Google Apps Script (GAS) ツールです。

サイドバー UI から Notion 認証情報の保存・初期設定・トリガー ON/OFF・手動実行までワンストップで操作できます。

---

## 目次

1. [何ができるか](#1-何ができるか)
2. [動作イメージ](#2-動作イメージ)
3. [システム構成](#3-システム構成)
4. [ファイル構成](#4-ファイル構成)
5. [前提条件](#5-前提条件)
6. [セットアップ手順 (詳細)](#6-セットアップ手順-詳細)
   - 6.1 [Notion 側の準備](#61-notion-側の準備)
   - 6.2 [Google Apps Script へのデプロイ (2通り)](#62-google-apps-script-へのデプロイ-2通り)
   - 6.3 [スプレッドシートでの初期化](#63-スプレッドシートでの初期化)
7. [使い方](#7-使い方)
   - 7.1 [サイドバー UI 説明](#71-サイドバー-ui-説明)
   - 7.2 [タスクマスタシートの編集](#72-タスクマスタシートの編集)
   - 7.3 [設定シート (列マッピング) の編集](#73-設定シート-列マッピング-の編集)
8. [Notion データベースの構造](#8-notion-データベースの構造)
9. [対応している Notion プロパティ型](#9-対応している-notion-プロパティ型)
10. [Notion 側の構造を変えたい場合](#10-notion-側の構造を変えたい場合)
11. [トリガー仕様](#11-トリガー仕様)
12. [ログとステータス](#12-ログとステータス)
13. [よくあるトラブル](#13-よくあるトラブル)
14. [セキュリティと注意点](#14-セキュリティと注意点)
15. [開発メモ](#15-開発メモ)
16. [ライセンス](#16-ライセンス)

---

## 1. 何ができるか

- **曜日ごとのルーティンタスク**を Google スプレッドシートにまとめて登録できる
  例: 月曜=週次レポート、火曜=顧客フォローアップ、金曜=請求書発行準備…
- 毎朝 5 時 (Asia/Tokyo) に、**その日の曜日のタスクだけ**を Notion DB にページとして投入する
- Notion 側のプロパティ (Name, カテゴリ, 優先度, 備考, 実行日, 曜日 …) を自由に拡張できる
- サイドバー UI から Notion Integration Key と Database ID を入力 → スクリプトプロパティに保存 (シート本体には書き込まれない)
- 「今日分を今すぐ送信」「曜日を指定して送信」のテスト実行ボタン付き
- 送信履歴は `ログ` シートに自動追記
- すべての UI ・コメント・エラーメッセージは日本語

## 2. 動作イメージ

```
┌─────────────────────────┐
│  Google Spreadsheet     │
│  ┌─────────────────┐    │      毎朝 5:00 (Asia/Tokyo)
│  │ タスクマスタ    │    │  ─────────────────────►  ┌──────────────────┐
│  │ ┌────┬─────┬──┐│    │      GAS time trigger    │ Notion API       │
│  │ │ 月 │週次… │✓ ││    │  ──[POST /v1/pages]───►  │ /v1/pages        │
│  │ │ 月 │朝会  │✓ ││    │                          └──────────────────┘
│  │ │ 火 │営業…│✓ ││    │                                   │
│  │ └────┴─────┴──┘│    │                                   ▼
│  │ 設定 (マッピング) │  │                          ┌──────────────────┐
│  │ ログ            │    │                          │ Notion Database  │
│  └─────────────────┘    │                          │  (タスク管理)     │
│                          │                          └──────────────────┘
│  サイドバー UI           │
│   - 認証情報入力         │
│   - 初期設定             │
│   - トリガー ON/OFF      │
│   - 手動実行             │
│   - 右上にヘルプ (?)     │
└─────────────────────────┘
```

## 3. システム構成

| レイヤ | 内容 |
|---|---|
| 実行基盤 | Google Apps Script (V8 ランタイム / TimeZone: Asia/Tokyo) |
| データソース | Google スプレッドシート (3 シート構成: `タスクマスタ` / `設定` / `ログ`) |
| 連携先 | Notion API v1 (`/v1/pages` エンドポイント, `Notion-Version: 2022-06-28`) |
| 認証情報の保管 | `PropertiesService.ScriptProperties` (シートには書かない) |
| UI | サイドバー HTML + モーダルヘルプ HTML |
| トリガー | 時間ベース (毎日 5:00〜6:00 の間に発火) |

## 4. ファイル構成

```
demo-task-gas/
├── appsscript.json          # OAuthスコープ・タイムゾーン定義
├── Code.gs                  # メニュー / サイドバー / ヘルプ表示 / 認証情報保存
├── Setup.gs                 # 初期設定 (シート構築 + ダミーデータ) / トリガー管理
├── Notion.gs                # Notion API クライアント / 値→property 変換
├── TaskSender.gs            # 送信オーケストレーション / ログ書込
├── Sidebar.html             # サイドバー UI (右上ヘルプボタン付き)
├── Help.html                # ヘルプモーダル UI
├── 要件定義書.md            # 要件・データ仕様・OAuthスコープの定義
├── CHAT_HISTORY.md          # 作成までの対話ヒストリーまとめ
├── README.md                # ← このファイル
├── .clasp.json              # clasp デプロイ用設定 (scriptId)
├── .gitignore
└── .specstory/              # 自動生成された対話ログ (SpecStory)
    └── history/
```

### 関数一覧

| ファイル | 関数 | 役割 |
|---|---|---|
| `Code.gs` | `onOpen()` | スプレッドシート起動時にメニュー追加 |
| `Code.gs` | `showSidebar()` | サイドバーを表示 |
| `Code.gs` | `showHelp()` | ヘルプモーダルを表示 |
| `Code.gs` | `saveCredentials(payload)` | Integration Key / DB ID を ScriptProperties に保存 |
| `Code.gs` | `getStatus()` | 認証状態・トリガー状態・最終実行を返す (UI 表示用) |
| `Code.gs` | `testNotionConnection()` | DB を取得して接続確認 + プロパティ一覧返却 |
| `Setup.gs` | `runInitialSetup()` | `タスクマスタ` `設定` `ログ` の 3 枚を作成 + ダミー投入 |
| `Setup.gs` | `enableDailyTrigger()` | 毎朝 5 時の時間ベーストリガーを作成 |
| `Setup.gs` | `removeDailyTrigger()` | 既存トリガーを削除 |
| `Notion.gs` | `notionCreatePage_()` | `POST /v1/pages` でページ作成 |
| `Notion.gs` | `notionRetrieveDatabase_()` | `GET /v1/databases/{id}` (接続テスト用) |
| `Notion.gs` | `buildNotionProperties_()` | 行 + マッピング → Notion properties オブジェクト |
| `Notion.gs` | `toNotionProperty_(type, value)` | 8 種類の型に応じた変換 |
| `TaskSender.gs` | `sendTodayTasksToNotion()` | **トリガーから呼ばれるエントリ。今日分を送信** |
| `TaskSender.gs` | `sendTodayTasksManually()` | サイドバー「今日分を今すぐ送信」 |
| `TaskSender.gs` | `sendTasksForSpecifiedDay(dayJp)` | サイドバー「曜日を指定して送信」 |

## 5. 前提条件

- Google アカウント (スプレッドシートを使えるもの)
- Notion アカウント + Internal Integration を作成できる権限
- 投入先となる Notion データベース (新規作成 OK)
- (デプロイに `clasp` を使う場合) Node.js + `@google/clasp`

## 6. セットアップ手順 (詳細)

### 6.1 Notion 側の準備

1. **Integration を作成する**
   - [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) を開く
   - `+ New integration` をクリック
   - 名前 (例: `タスク連携 GAS`)・ワークスペース・Type=Internal を選択
   - 作成後、`Internal Integration Secret` (`secret_xxxxxxxxxxxx...`) をコピーしておく
2. **送信先データベースを作成 or 用意する**
   - Notion で新しい Database (Full page or Inline) を作成
   - 以下のプロパティを用意 (詳細は [§8](#8-notion-データベースの構造) 参照)
     - `Name` (title) … デフォルトで存在
     - `カテゴリ` (Select)
     - `優先度` (Select / 選択肢: 高 / 中 / 低)
     - `備考` (Text)
     - `実行日` (Date)
     - `曜日` (Select / 選択肢: 月 / 火 / 水 / 木 / 金 / 土 / 日)
3. **Integration を DB に接続する**
   - そのデータベースを開く
   - 右上の `…` → `+ Add connections` → 先ほど作った Integration を選択
4. **Database ID を取得する**
   - データベースを開いた URL を見る
     ```
     https://www.notion.so/your-workspace/abcdef1234567890abcdef1234567890?v=...
                                          └────────── 32桁の ID ──────────┘
     ```
   - `?` より前の最後の 32 文字が Database ID

### 6.2 Google Apps Script へのデプロイ (2通り)

#### 方法A: clasp でプッシュ (推奨)

```bash
# 1) clasp をインストール (未インストールなら)
npm install -g @google/clasp

# 2) Google アカウントでログイン
clasp login

# 3) このリポジトリをクローン
git clone https://github.com/groundcobra009/demo-task-gas.git
cd demo-task-gas

# 4) .clasp.json の scriptId を自分のスクリプトに書き換える
#    (もしくは clasp create でスプレッドシート付き新規プロジェクトを作る)
#
#    新規作成する場合:
#      clasp create --type sheets --title "曜日別タスク Notion 連携"
#    既存スクリプトに紐付ける場合:
#      .clasp.json の scriptId を編集

# 5) push
clasp push
```

#### 方法B: 手動コピペ

1. 任意のスプレッドシートを開く → 拡張機能 → Apps Script
2. 以下のファイルをそれぞれ作成して中身をコピペ
   - `Code.gs` / `Setup.gs` / `Notion.gs` / `TaskSender.gs` (スクリプトファイルとして追加)
   - `Sidebar.html` / `Help.html` (HTML ファイルとして追加)
3. プロジェクトの設定 → `appsscript.json` を編集モードで表示できるよう「マニフェスト ファイル」を表示
4. `appsscript.json` の中身をこのリポジトリのものに置き換え (OAuth スコープが反映される)
5. 保存

### 6.3 スプレッドシートでの初期化

1. 紐付けたスプレッドシートを開く (clasp なら自動連携、手動なら拡張機能で開いたスプレッドシート)
2. 一度シートを **再読み込み** すると、メニューバーに **`📋 タスク連携`** が追加される
3. `📋 タスク連携` → **`サイドバーを開く`**
4. サイドバーの **「3. 初期設定」 → `初期設定を実行`** をクリック
   - `タスクマスタ` / `設定` / `ログ` の 3 シートが自動生成される
   - ダミータスクが各曜日に 1〜2 件入る
5. サイドバーの **「2. Notion 認証情報」** に Integration Key と Database ID を入力 → `保存`
6. `接続テスト` を押して `✓ 接続成功` が出れば OK
7. **「4. トリガー」 → `毎朝5時トリガーを有効化`** をクリック

🎉 これで毎朝 5 時に Notion へ自動投入されます。

## 7. 使い方

### 7.1 サイドバー UI 説明

サイドバーは 5 ブロック構成 (右上に `?` ヘルプボタン)。

| ブロック | できること |
|---|---|
| **1. ステータス** | Integration Key / DB ID の設定有無 (マスク表示)、毎朝 5 時トリガーの有効/無効、最終実行日時と結果サマリ |
| **2. Notion 認証情報** | Key と DB ID を入力 → `保存` → `接続テスト` |
| **3. 初期設定** | `初期設定を実行` (3 シート構築 + ダミー投入)。既存シートは上書きしない |
| **4. トリガー** | `毎朝5時トリガーを有効化` / `トリガーを停止` |
| **5. 手動実行 (テスト)** | `今日分を今すぐ送信` / 曜日を選んで `送信` |
| **右上 `?`** | ヘルプモーダルを開く |

### 7.2 タスクマスタシートの編集

| 列 | 説明 | 入力規則 |
|---|---|---|
| **曜日** | 月 / 火 / 水 / 木 / 金 / 土 / 日 | プルダウン (必須) |
| **タスク名** | Notion ページのタイトル | 必須 (空欄行はスキップ) |
| **カテゴリ** | 任意の分類文字列 | Notion 側 Select 推奨 |
| **優先度** | 高 / 中 / 低 | プルダウン |
| **備考** | 補足テキスト (長文 OK) | - |
| **有効** | チェック ON のみ送信対象 | チェックボックス |

> 行は何行でも追加可能。`有効` を OFF にすれば一時的に停止できます。

### 7.3 設定シート (列マッピング) の編集

`設定` シートには「**スプレッドシートのどの列を / Notion のどのプロパティ名で / どの型で送るか**」を 1 行 1 マッピングで書きます。

| シート列名 | Notion プロパティ名 | 型 | 備考 |
|---|---|---|---|
| タスク名 | Name | title | ※ title は DB に 1 つだけ必須 |
| カテゴリ | カテゴリ | select | |
| 優先度 | 優先度 | select | 高 / 中 / 低 |
| 備考 | 備考 | rich_text | 長文 OK |

加えて以下は GAS が**自動付与**します (シートに列を作る必要なし)。

| プロパティ名 | 型 | 値 |
|---|---|---|
| 実行日 | date | 送信日 (今日) |
| 曜日 | select | 月 / 火 / 水 / 木 / 金 / 土 / 日 |

## 8. Notion データベースの構造

初期想定では以下のプロパティを Notion 側に作成しておきます。

| プロパティ名 | 型 | 内容 |
|---|---|---|
| **Name** | title | タスク名 (必須・最初から存在) |
| カテゴリ | Select | 任意の分類 |
| 優先度 | Select | 選択肢: 高 / 中 / 低 |
| 備考 | Text | 補足 |
| 実行日 | Date | 送信日 (自動付与) |
| 曜日 | Select | 選択肢: 月 / 火 / 水 / 木 / 金 / 土 / 日 (自動付与) |

> Select プロパティで新しい選択肢を自動作成させたい場合は、Notion 側で **`Allow new options`** を ON にしておくか、選択肢を事前定義しておくと安全です。

## 9. 対応している Notion プロパティ型

`設定` シートの「型」欄に書ける値と、その変換ルール。

| 型 | 変換ルール |
|---|---|
| `title` | セル値をタイトルにする (1 DB に 1 つだけ必須) |
| `rich_text` | セル値を本文テキストに |
| `select` | セル値をそのまま選択肢名に (Notion 側に同名選択肢が必要 / もしくは Allow new options を ON) |
| `multi_select` | セル値を `,` (カンマ) 区切りで複数選択肢に分割 |
| `date` | 日付文字列を ISO 形式 (`yyyy-MM-dd`) に変換。`Date` 型セルも OK |
| `number` | 数値に変換 |
| `checkbox` | TRUE / FALSE / "true" / "false" を真偽値に |
| `url` | セル値をそのまま URL に |

## 10. Notion 側の構造を変えたい場合

業務都合で Notion DB のプロパティ名を変えたり、新規プロパティを追加したい時の手順。

1. Notion 側でプロパティを追加 / 名称変更 / 型変更を行う
2. スプレッドシートの **`タスクマスタ`** に必要な列を追加 (列ヘッダ名は自由)
3. **`設定`** シートに新しい対応行を追加
   - `シート列名` = `タスクマスタ` のヘッダ名
   - `Notionプロパティ名` = Notion 側の実際の名前
   - `型` = `title` / `rich_text` / `select` / `multi_select` / `date` / `number` / `checkbox` / `url` のいずれか
4. サイドバーの `接続テスト` で Notion 側プロパティ一覧と照合
5. `手動実行` で 1 度送ってみてエラーが出ないか確認

## 11. トリガー仕様

| 項目 | 値 |
|---|---|
| 種類 | 時間ベース (Time-based) |
| 発火タイミング | 毎日 5:00〜6:00 (Asia/Tokyo) の間 |
| 呼ばれる関数 | `sendTodayTasksToNotion` |
| 多重作成防止 | 既存の同名トリガーを削除してから再作成 |
| 設定方法 | サイドバー「4. トリガー」から有効化 / 停止 |

> Apps Script の時間ベーストリガーは「5:00〜6:00 の間のどこか」で発火するため、5:00 ピッタリではありません。

## 12. ログとステータス

- **`ログ` シート** に送信のたびに以下が追記されます
  | 列 | 内容 |
  |---|---|
  | 日時 | 送信実行日時 (`yyyy-MM-dd HH:mm:ss`) |
  | 対象曜日 | `月` 等 |
  | 成功件数 | 成功した件数 |
  | 失敗件数 | 失敗した件数 |
  | 詳細 | エラー内容 (失敗時) または `OK` |
- **サイドバーのステータス欄** には最終実行日時とサマリが表示されます
- ScriptProperties にも `LAST_RUN_AT` / `LAST_RUN_RESULT` として保存されます

## 13. よくあるトラブル

| 症状 | 原因と対処 |
|---|---|
| メニュー `📋 タスク連携` が出ない | スプレッドシートを再読み込み。`onOpen()` が動いていない可能性 |
| `401 Unauthorized` | Integration Key が間違っている、または Notion DB に Integration が接続されていない (DB 右上 `…` → `+ Add connections`) |
| `404 / object_not_found` | Database ID が間違っている、または Integration がその DB にアクセス権を持っていない |
| `property does not exist` | `設定` シートの「Notion プロパティ名」と、実際の Notion DB のプロパティ名が一致していない |
| Select 選択肢が作成されない | Notion 側の対象 `Select` プロパティの **`Allow new options`** を ON にする、または選択肢を事前定義する |
| トリガーが動かない | サイドバー「4. トリガー」で再有効化。GAS の「実行数」画面 (左メニューの実行アイコン) でエラー履歴を確認 |
| `0 件でした` と出る | `タスクマスタ` でその曜日の行がない、または `有効` チェックが OFF |
| ページが大量に重複する | トリガーが多重設定されている可能性。`removeDailyTrigger()` → `enableDailyTrigger()` で 1 本に戻す |
| 6 分の実行制限に引っかかる | 1 日のタスクが多すぎる可能性。1 件ごとに 350ms スリープしているので、約 1000 件以上で限界。曜日分散などで調整を |

## 14. セキュリティと注意点

- ⚠️ **Integration Key はスクリプトプロパティに保存されます**。スプレッドシートを共有しても Key は閲覧されませんが、**スクリプトエディタを共有すると見えます**。スプレッドシートを「閲覧のみ」で共有する場合は問題ありませんが、編集権限を渡す相手には注意してください。
- **Notion の Integration を切ると** 即座に投入できなくなります。
- **無料の Notion ワークスペースには API 経由のページ数制限**はありませんが、Notion API のレートリミット (3 req/sec) があるため、本ツールは 1 件ごとに 350ms スリープしています。
- `.clasp.json` の `scriptId` はリポジトリに含まれていますが、これは Apps Script プロジェクトの識別子であり、Google アカウントのアクセス権がなければプロジェクトを読み書きできません。

## 15. 開発メモ

- **要件定義書**: [`要件定義書.md`](./要件定義書.md) — 設計の意図と仕様の根拠
- **対話ヒストリー**: [`CHAT_HISTORY.md`](./CHAT_HISTORY.md) — 構築までのユーザー指示と意思決定の流れ
- **詳細な対話ログ**: [`.specstory/history/`](./.specstory/history/) — SpecStory による自動記録 (ツール呼び出しを含む完全版)
- 本プロジェクトは Anthropic Claude Code (Opus 4.7) との対話によって構築されました

### OAuth スコープ

`appsscript.json` で以下を要求します。

| スコープ | 用途 |
|---|---|
| `https://www.googleapis.com/auth/spreadsheets` | シートの読み書き |
| `https://www.googleapis.com/auth/script.scriptapp` | トリガー作成・削除 |
| `https://www.googleapis.com/auth/script.container.ui` | サイドバー / モーダル表示 |
| `https://www.googleapis.com/auth/script.external_request` | Notion API へ `UrlFetch` |

## 16. ライセンス

特に指定なし (社内 / 個人用テンプレートとしてご自由にどうぞ)。

---

質問・改善要望は Issue でお気軽にどうぞ。
