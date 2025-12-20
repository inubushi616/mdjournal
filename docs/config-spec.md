# mdJournal 設定ファイル仕様書

## 1. 概要

本ドキュメントは、mdJournalで使用する設定ファイル（YAML形式）の仕様を定義する。

---

## 2. 設定ファイル一覧

| ファイル | 説明 |
|---------|------|
| `mdjournal.config.yaml` | ルート設定ファイル |
| `config/projects.yaml` | プロジェクトマスタ |
| `config/routines.yaml` | ルーチン定義 |

---

## 3. mdjournal.config.yaml（ルート設定）

### 3.1 スキーマ

```yaml
# 各設定ファイルへのパス（このファイルからの相対パス）
projects: string           # プロジェクト定義ファイルのパス
routines: string           # ルーチン定義ファイルのパス

# 日報ディレクトリ
reports: string            # 日報ファイルの保存ディレクトリ

# タイムライン設定
timeline:
  hourHeight: number       # 1時間あたりの高さ（ピクセル）
  maxHours: number         # 最大表示時間
  defaultStartHour: number # デフォルト開始時刻
  defaultEndHour: number   # デフォルト終了時刻
  snapMinutes: number      # ドラッグ時のスナップ単位（分）

# サーバー設定
server:
  port: number             # サーバーポート

# Slack連携（オプション）
slack:
  enabled: boolean         # 有効/無効
  webhookUrl: string       # Webhook URL（${SLACK_WEBHOOK_URL}で環境変数参照可能）
  channel: string          # 投稿先チャンネル（オプション）
  username: string         # 投稿者名（オプション）
  iconEmoji: string        # アイコン絵文字（オプション）
```

### 3.2 設定例

```yaml
# mdJournal ルート設定ファイル
# 
# 使用方法:
#   npx mdjournal ./mdjournal.config.yaml
#   npx mdjournal -c ./mdjournal.config.yaml

# 各設定ファイルへのパス（このファイルからの相対パス）
projects: ./config/projects.yaml
routines: ./config/routines.yaml

# 日報ディレクトリ
reports: ./data

# タイムライン設定
timeline:
  hourHeight: 60          # 1時間あたりの高さ（ピクセル）
  maxHours: 36            # 最大表示時間（8:00から最大36時間 = 翌日20:00まで）
  defaultStartHour: 8     # デフォルト開始時刻（スロットが空の場合の表示開始時間）
  defaultEndHour: 20      # デフォルト終了時刻（スロットが空の場合の表示終了時間）
  snapMinutes: 15         # ドラッグ時のスナップ単位（分）

# サーバー設定（オプション）
server:
  port: 3001

# Slack連携（オプション）
slack:
  enabled: false
  webhookUrl: ${SLACK_WEBHOOK_URL}
  channel: "#daily_report"
  username: "日報"
  iconEmoji: ":memo:"
```

---

## 4. projects.yaml

### 4.1 スキーマ

```yaml
# プロジェクト定義
projects:
  - code: string           # プロジェクトコード（一意）
    name: string           # プロジェクト名
    fullName: string       # フルネーム（オプション）
    color: string          # 表示色（Hex）
    category: string       # カテゴリID（オプション）
    client: string         # クライアント名（オプション）
    description: string    # 説明（オプション）
    active: boolean        # アクティブ状態

# カテゴリ定義（オプション）
categories:
  - id: string
    name: string
    color: string          # オプション
```

### 4.2 設定例

```yaml
projects:
  # 社内業務
  - code: "P99"
    name: "社内業務"
    fullName: "社内管理・雑務"
    color: "#52c41a"
    category: "internal"
    active: true
  
  # クライアント案件
  - code: "P34"
    name: "クライアントA"
    fullName: "クライアントA システム開発"
    color: "#1890ff"
    category: "client"
    client: "A社"
    description: "クライアントAシステム開発・運用"
    active: true
  
  - code: "P14"
    name: "システムB"
    color: "#722ed1"
    category: "client"
    active: true

  # 非アクティブプロジェクト
  - code: "P18"
    name: "旧プロジェクト"
    color: "#14B8A6"
    category: "client"
    active: false

categories:
  - id: "internal"
    name: "社内業務"
    color: "#52c41a"
  
  - id: "client"
    name: "クライアント業務"
    color: "#1890ff"
  
  - id: "research"
    name: "研究・開発"
    color: "#722ed1"
```

---

## 5. routines.yaml

### 5.1 スキーマ

```yaml
routines:
  # 週次ルーチン（曜日別）
  weekly:
    monday: RoutineItem[]
    tuesday: RoutineItem[]
    wednesday: RoutineItem[]
    thursday: RoutineItem[]
    friday: RoutineItem[]
    saturday: RoutineItem[]
    sunday: RoutineItem[]

  # 随時ルーチン
  adhoc: AdhocRoutineItem[]

  # 月次ルーチン
  monthly:
    start_of_month: MonthlyTask[]    # 月初タスク
    end_of_month: MonthlyTask[]      # 月末タスク

  # 四半期ルーチン
  quarterly:
    - months: number[]       # 対象月（例: [3, 6, 9, 12]）
      tasks: QuarterlyTask[]

  # 年次ルーチン
  yearly:
    - month: number          # 月
      day: number            # 日
      project: string
      task: string

# RoutineItem定義（週次・随時）
RoutineItem:
  time: string             # HH:MM
  project: string          # プロジェクトコード
  task: string             # タスク名
  duration: number         # 時間（分）、オプション

# MonthlyTask/QuarterlyTask定義
MonthlyTask:
  project: string
  task: string
```

### 5.2 設定例

```yaml
routines:
  weekly:
    monday:
      - time: "08:00"
        project: "P99"
        task: "タスク確認・整理、日報返信"
      - time: "09:00"
        project: "P99"
        task: "定例会議"
    
    tuesday:
      - time: "08:00"
        project: "P99"
        task: "タスク確認・整理、日報返信"
    
    friday:
      - time: "08:00"
        project: "P99"
        task: "タスク確認・整理、日報返信"
      - time: "17:00"
        project: "P99"
        task: "週報作成"

  adhoc:
    - time: "14:00"
      project: "P14"
      task: "システムB 開発MTG"

  monthly:
    start_of_month:
      - project: "P99"
        task: "経費精算申請"
    
    end_of_month:
      - project: "P99"
        task: "面談スケジュール調整"

  quarterly:
    - months: [3, 6, 9, 12]
      tasks:
        - project: "P99"
          task: "四半期レビュー"

  yearly:
    - month: 11
      day: 10
      project: "P99"
      task: "クラウドサービス契約更新"
```

---

## 6. Git連携

Gitはローカルリポジトリの設定と自動連携します。設定ファイルでの明示的な設定は不要です。

- 日報ディレクトリがGitリポジトリ内にある場合、自動的にGit連携が有効になります
- 保存時に「Commit & Push」ボタンからcommit/pushを実行できます

---

## 7. 環境変数の参照

設定ファイル内で `${ENV_VAR_NAME}` 形式で環境変数を参照可能。

```yaml
slack:
  webhookUrl: "${SLACK_WEBHOOK_URL}"
```

実行時に環境変数の値に置換される。

---

## 8. 設定ファイルのバリデーション

起動時に以下のバリデーションを実施：

1. **必須項目チェック**
   - `projects` が1つ以上定義されている

2. **参照整合性チェック**
   - ルーチンの `project` が `projects.yaml` に存在

3. **形式チェック**
   - 色コードが有効なHex形式
   - 時刻がHH:MM形式

エラー時はログに警告を出力し、デフォルト値で補完。

CLIで設定ファイルのチェックを実行することも可能：

```bash
npx mdjournal config ./mdjournal.config.yaml
```

---

## 更新履歴

| バージョン | 日付 | 更新内容 |
|-----------|------|---------|
| 1.1 | 2025-12-20 | 未実装の設定を削除、実装済み設定のみ記載 |
| 1.0 | 2025-12-20 | mdJournalとして公開準備 |
| 0.2 | 2025-12-19 | 四半期・年次ルーチンの定義を明確化 |
| 0.1 | 2025-12-18 | 初版作成 |
