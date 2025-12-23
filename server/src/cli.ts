#!/usr/bin/env node
/**
 * 日報管理ダッシュボード CLI
 * 
 * Usage:
 *   npx report-dashboard [config.yaml]              # サーバー起動
 *   npx report-dashboard --config ./my-config.yaml  # 設定ファイル指定
 *   npx report-dashboard validate ./reports         # バリデーション実行
 *   npx report-dashboard --help
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';
import { setTimelineConfig, setRootConfig } from './utils/fileManager.js';
import {
  validateReport,
  formatValidationResult,
  formatValidationSummary,
  VALIDATION_RULES,
  type ValidationResult,
} from './utils/validator.js';
import {
  validateConfigFiles,
  formatValidationResults,
} from './utils/configValidator.js';
import { parseMarkdown, calculateStats } from './utils/markdown.js';
import type { ReportStats } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ルート設定ファイルの型
interface RootConfig {
  // 各設定ファイルへのパス
  projects?: string;      // projects.yaml へのパス
  routines?: string;      // routines.yaml へのパス
  reports?: string;       // 日報ディレクトリへのパス
  
  // タイムライン設定
  timeline?: {
    hourHeight?: number;       // 1時間あたりの高さ（ピクセル）
    maxHours?: number;         // 最大表示時間
    defaultStartHour?: number; // デフォルト開始時刻
    defaultEndHour?: number;   // デフォルト終了時刻
    snapMinutes?: number;      // ドラッグ時のスナップ単位（分）
  };
  
  // サーバー設定
  server?: {
    port?: number;
    cors?: string;
  };
}

function printHelp() {
  console.log(`
日報管理ダッシュボード

Usage:
  npx report-dashboard [options] [config-file]    # サーバー起動
  npx report-dashboard config <config-file>       # 設定ファイルのチェック
  npx report-dashboard validate [options] <path>  # 日報バリデーション実行
  npx report-dashboard stats [options] <path>     # 統計情報(frontmatter)を再集計

Server Options:
  -c, --config <file>   設定ファイルを指定 (YAML形式)
  -p, --port <port>     サーバーポートを指定 (デフォルト: 3001)
  -h, --help            このヘルプを表示

Config Check Options:
  (設定ファイルパスを指定して、設定ファイルのバリデーションを実行)

Validate Options:
  --strict              警告もエラーとして扱う
  --verbose             詳細な出力（提案を含む）
  --json                JSON形式で出力
  --rules               利用可能なルール一覧を表示
  --skip <rules>        スキップするルール（カンマ区切り）

Stats Options:
  --dry-run             実際にファイルを更新せず、変更内容のみ表示
  --verbose             詳細な出力
  --json                JSON形式で出力
  --validate            事前にバリデーションを実行し、エラーがあるファイルはスキップ

Examples:
  # サーバー起動
  npx report-dashboard                              # サンプルデータで起動
  npx report-dashboard ./mdjournal.config.yaml      # 設定ファイルを指定して起動
  npx report-dashboard -c ./mdjournal.config.yaml   # 同上
  npx report-dashboard -p 8080                      # ポートを指定して起動

  # 設定ファイルのチェック
  npx report-dashboard config ./mdjournal.config.yaml

  # 日報バリデーション
  npx report-dashboard validate ./reports              # ディレクトリ内の全.mdを検証
  npx report-dashboard validate ./reports/2020         # 2020年のみ検証
  npx report-dashboard validate ./reports --strict     # 厳格モード
  npx report-dashboard validate ./reports --verbose    # 詳細出力
  npx report-dashboard validate ./reports --json       # JSON形式で出力
  npx report-dashboard validate --rules                # ルール一覧を表示

  # 統計情報(frontmatter)再集計
  npx report-dashboard stats ./reports                 # frontmatterを付与・更新
  npx report-dashboard stats ./reports --dry-run      # 変更内容のプレビュー
  npx report-dashboard stats ./reports --validate     # バリデーション後に実行

Config File Format (YAML):
  # 各設定ファイルへのパス（相対パスは設定ファイルからの相対）
  projects: ./config/projects.yaml
  routines: ./config/routines.yaml
  reports: ./reports
  
  # タイムライン設定（オプション）
  timeline:
    hourHeight: 60          # 1時間あたりの高さ（ピクセル）
    maxHours: 36            # 最大表示時間
    defaultStartHour: 8     # デフォルト開始時刻
    defaultEndHour: 20      # デフォルト終了時刻
    snapMinutes: 15         # ドラッグ時のスナップ単位（分）
  
  # サーバー設定（オプション）
  server:
    port: 3001
    cors: http://localhost:5173
`);
}

function printValidationRules() {
  console.log(`
利用可能なバリデーションルール:
`);
  for (const [code, description] of Object.entries(VALIDATION_RULES)) {
    console.log(`  ${code.padEnd(25)} ${description}`);
  }
  console.log('');
}

async function loadRootConfig(configPath: string): Promise<RootConfig> {
  const absolutePath = path.resolve(configPath);
  const configDir = path.dirname(absolutePath);
  
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const config = yaml.load(content) as RootConfig;
    
    // 相対パスを絶対パスに変換
    const resolvePath = (p?: string) => p ? path.resolve(configDir, p) : undefined;
    
    return {
      projects: resolvePath(config.projects),
      routines: resolvePath(config.routines),
      reports: resolvePath(config.reports),
      timeline: config.timeline,
      server: config.server,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`Error: 設定ファイルが見つかりません: ${absolutePath}`);
      process.exit(1);
    }
    throw error;
  }
}

interface ServerArgs {
  configPath?: string;
  port?: number;
  help: boolean;
}

interface ValidateArgs {
  targetPath?: string;
  strict: boolean;
  verbose: boolean;
  json: boolean;
  rules: boolean;
  skipRules: string[];
  help: boolean;
}

function parseServerArgs(args: string[]): ServerArgs {
  let configPath: string | undefined;
  let port: number | undefined;
  let help = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-c' || arg === '--config') {
      configPath = args[++i];
    } else if (arg === '-p' || arg === '--port') {
      port = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-') && !configPath) {
      // 位置引数として設定ファイルを受け取る
      configPath = arg;
    }
  }
  
  return { configPath, port, help };
}

function parseValidateArgs(args: string[]): ValidateArgs {
  let targetPath: string | undefined;
  let strict = false;
  let verbose = false;
  let json = false;
  let rules = false;
  let help = false;
  const skipRules: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--rules') {
      rules = true;
    } else if (arg === '--skip') {
      const skipValue = args[++i];
      if (skipValue) {
        skipRules.push(...skipValue.split(','));
      }
    } else if (!arg.startsWith('-')) {
      targetPath = arg;
    }
  }
  
  return { targetPath, strict, verbose, json, rules, skipRules, help };
}

interface StatsArgs {
  targetPath?: string;
  dryRun: boolean;
  verbose: boolean;
  json: boolean;
  validate: boolean;
  help: boolean;
}

function parseStatsArgs(args: string[]): StatsArgs {
  let targetPath: string | undefined;
  let dryRun = false;
  let verbose = false;
  let json = false;
  let validate = false;
  let help = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--validate') {
      validate = true;
    } else if (!arg.startsWith('-')) {
      targetPath = arg;
    }
  }
  
  return { targetPath, dryRun, verbose, json, validate, help };
}

/**
 * ディレクトリから再帰的に.mdファイルを収集
 */
async function collectMarkdownFiles(targetPath: string): Promise<string[]> {
  const files: string[] = [];
  const stat = await fs.stat(targetPath);
  
  if (stat.isFile()) {
    if (targetPath.endsWith('.md')) {
      files.push(targetPath);
    }
  } else if (stat.isDirectory()) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  return files.sort();
}

/**
 * バリデーションを実行
 */
async function runValidation(args: ValidateArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  if (args.rules) {
    printValidationRules();
    process.exit(0);
  }
  
  if (!args.targetPath) {
    console.error('Error: バリデーション対象のパスを指定してください');
    console.error('Usage: npx report-dashboard validate <path>');
    process.exit(1);
  }
  
  const absolutePath = path.resolve(args.targetPath);
  
  try {
    await fs.access(absolutePath);
  } catch {
    console.error(`Error: パスが見つかりません: ${absolutePath}`);
    process.exit(1);
  }
  
  console.log(`バリデーション対象: ${absolutePath}`);
  console.log('');
  
  const files = await collectMarkdownFiles(absolutePath);
  
  if (files.length === 0) {
    console.log('Markdownファイルが見つかりませんでした');
    process.exit(0);
  }
  
  console.log(`${files.length} ファイルを検証中...`);
  console.log('');
  
  const results: ValidationResult[] = [];
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const result = validateReport(content, file, {
        strict: args.strict,
        skipRules: args.skipRules,
      });
      results.push(result);
      
      // 問題があるファイルのみ出力（JSON以外）
      if (!args.json && (result.issues.length > 0 || args.verbose)) {
        console.log(formatValidationResult(result, { verbose: args.verbose }));
      }
    } catch (err) {
      console.error(`Error reading ${file}: ${(err as Error).message}`);
    }
  }
  
  // JSON出力
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.every(r => r.isValid) ? 0 : 1);
  }
  
  // サマリー出力
  console.log(formatValidationSummary(results));
  
  // 終了コード
  const hasErrors = results.some(r => !r.isValid);
  process.exit(hasErrors ? 1 : 0);
}

interface StatsResult {
  file: string;
  date: string;
  stats: ReportStats;
  updated: boolean;
  error?: string;
}

/**
 * frontmatter付きMarkdownを生成
 */
function generateFrontmatter(stats: ReportStats): string {
  const lines = [
    '---',
    `planHours: ${stats.planHours}`,
    `resultHours: ${stats.resultHours}`,
    `todoCount: ${stats.todoCount}`,
    `todoCompleted: ${stats.todoCompleted}`,
    `todoInProgress: ${stats.todoInProgress}`,
  ];
  
  if (Object.keys(stats.projectHours).length > 0) {
    lines.push('projectHours:');
    for (const [project, hours] of Object.entries(stats.projectHours)) {
      lines.push(`  ${project}: ${hours}`);
    }
  } else {
    lines.push('projectHours: {}');
  }
  
  lines.push(`updatedAt: ${stats.updatedAt}`);
  lines.push('---');
  
  return lines.join('\n');
}

/**
 * 統計情報(frontmatter)を再集計
 */
async function runStats(args: StatsArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  if (!args.targetPath) {
    console.error('Error: 対象のパスを指定してください');
    console.error('Usage: npx report-dashboard stats <path>');
    process.exit(1);
  }
  
  const absolutePath = path.resolve(args.targetPath);
  
  try {
    await fs.access(absolutePath);
  } catch {
    console.error(`Error: パスが見つかりません: ${absolutePath}`);
    process.exit(1);
  }
  
  console.log(`統計情報(frontmatter)再集計対象: ${absolutePath}`);
  if (args.dryRun) {
    console.log('\x1b[33m[DRY-RUN] ファイルは更新されません\x1b[0m');
  }
  console.log('');
  
  const files = await collectMarkdownFiles(absolutePath);
  
  if (files.length === 0) {
    console.log('Markdownファイルが見つかりませんでした');
    process.exit(0);
  }
  
  console.log(`${files.length} ファイルを処理中...`);
  console.log('');
  
  const results: StatsResult[] = [];
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    try {
      const fileContent = await fs.readFile(file, 'utf-8');
      
      // frontmatterと本文を分離
      const { content } = matter(fileContent);
      
      // バリデーションオプションが有効な場合、事前チェック
      if (args.validate) {
        const validationResult = validateReport(content, file);
        if (!validationResult.isValid) {
          if (!args.json) {
            console.log(`\x1b[33m⚠\x1b[0m ${file} \x1b[2m(バリデーションエラーのためスキップ)\x1b[0m`);
          }
          results.push({
            file,
            date: '',
            stats: {} as ReportStats,
            updated: false,
            error: 'validation_error',
          });
          skippedCount++;
          continue;
        }
      }
      
      // 日付をファイル名から抽出
      const dateMatch = path.basename(file, '.md').match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) {
        if (!args.json && args.verbose) {
          console.log(`\x1b[33m⚠\x1b[0m ${file} \x1b[2m(日付形式のファイル名ではないためスキップ)\x1b[0m`);
        }
        skippedCount++;
        continue;
      }
      const date = dateMatch[1];
      
      // Markdownをパース
      const report = parseMarkdown(date, content);
      
      // 統計情報を計算
      const stats = calculateStats(report);
      
      // frontmatter生成
      const newFrontmatter = generateFrontmatter(stats);
      const newContent = newFrontmatter + '\n' + content.trim() + '\n';
      
      // 変更があるか確認
      const hasChanges = newContent !== fileContent;
      
      if (hasChanges) {
        if (!args.dryRun) {
          await fs.writeFile(file, newContent, 'utf-8');
        }
        updatedCount++;
        
        if (!args.json) {
          console.log(`\x1b[33m⟳\x1b[0m ${file}`);
          if (args.verbose) {
            console.log(`  planHours: ${stats.planHours.toFixed(1)}, resultHours: ${stats.resultHours.toFixed(1)}, todos: ${stats.todoCount} (${stats.todoCompleted} completed)`);
          }
        }
      } else {
        if (!args.json && args.verbose) {
          console.log(`\x1b[32m✓\x1b[0m ${file} \x1b[2m(変更なし)\x1b[0m`);
        }
      }
      
      results.push({
        file,
        date,
        stats,
        updated: hasChanges,
      });
    } catch (err) {
      errorCount++;
      if (!args.json) {
        console.error(`\x1b[31m✗\x1b[0m ${file}: ${(err as Error).message}`);
      }
      results.push({
        file,
        date: '',
        stats: {} as ReportStats,
        updated: false,
        error: (err as Error).message,
      });
    }
  }
  
  // JSON出力
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(errorCount > 0 ? 1 : 0);
  }
  
  // サマリー出力
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('統計情報(frontmatter)再集計サマリー');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`ファイル数: ${files.length}`);
  if (args.dryRun) {
    console.log(`  \x1b[33m⟳ 更新予定: ${updatedCount}\x1b[0m`);
  } else {
    console.log(`  \x1b[33m⟳ 更新: ${updatedCount}\x1b[0m`);
  }
  console.log(`  \x1b[32m✓ 変更なし: ${files.length - updatedCount - skippedCount - errorCount}\x1b[0m`);
  if (skippedCount > 0) {
    console.log(`  \x1b[33m⚠ スキップ: ${skippedCount}\x1b[0m`);
  }
  if (errorCount > 0) {
    console.log(`  \x1b[31m✗ エラー: ${errorCount}\x1b[0m`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  
  process.exit(errorCount > 0 ? 1 : 0);
}

/**
 * サーバーを起動
 */
async function runServer(args: ServerArgs): Promise<void> {
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // 環境変数を設定
  if (args.configPath) {
    const configAbsolutePath = path.resolve(args.configPath);
    
    // 設定ファイルのバリデーション
    console.log('設定ファイルをチェック中...\n');
    const validationResult = await validateConfigFiles(configAbsolutePath);
    
    // バリデーション結果を表示
    if (!validationResult.valid || validationResult.warnings.length > 0) {
      console.log(formatValidationResults(validationResult));
      console.log('');
    }
    
    // エラーがある場合は終了
    if (!validationResult.valid) {
      console.error('\x1b[31m設定ファイルにエラーがあります。修正してから再度実行してください。\x1b[0m\n');
      process.exit(1);
    }
    
    const rootConfig = await loadRootConfig(args.configPath);
    
    // 環境変数経由でサーバーに設定を渡す
    if (rootConfig.projects) process.env.CONFIG_PROJECTS = rootConfig.projects;
    if (rootConfig.routines) process.env.CONFIG_ROUTINES = rootConfig.routines;
    if (rootConfig.reports) process.env.CONFIG_REPORTS = rootConfig.reports;
    if (rootConfig.server?.port) process.env.PORT = String(rootConfig.server.port);
    if (rootConfig.server?.cors) process.env.CORS_ORIGIN = rootConfig.server.cors;
    
    // タイムライン設定をfileManagerにセット
    if (rootConfig.timeline) {
      setTimelineConfig(rootConfig.timeline);
    }
    
    // ルート設定全体をfileManagerに保存（Slack設定などで使用）
    setRootConfig(rootConfig as Record<string, unknown>);
    
    console.log(`設定ファイル: ${configAbsolutePath}`);
  } else {
    // カレントディレクトリのmdjournal.config.yamlを探す
    const cwdConfigPath = path.join(process.cwd(), 'mdjournal.config.yaml');
    
    if (existsSync(cwdConfigPath)) {
      // カレントディレクトリに設定ファイルがある場合はそれを使用
      console.log(`設定ファイルを検出: ${cwdConfigPath}`);
      
      const validationResult = await validateConfigFiles(cwdConfigPath);
      if (!validationResult.valid) {
        console.log(formatValidationResults(validationResult));
        const hasErrors = validationResult.errors.some(e => e.severity === 'error');
        if (hasErrors) {
          console.log('\n\x1b[31m設定ファイルにエラーがあります。修正してから再度実行してください。\x1b[0m\n');
          process.exit(1);
        }
      }
      
      const rootConfig = await loadRootConfig(cwdConfigPath);
      
      if (rootConfig.projects) process.env.CONFIG_PROJECTS = rootConfig.projects;
      if (rootConfig.routines) process.env.CONFIG_ROUTINES = rootConfig.routines;
      if (rootConfig.reports) process.env.CONFIG_REPORTS = rootConfig.reports;
      if (rootConfig.server?.port) process.env.PORT = String(rootConfig.server.port);
      if (rootConfig.server?.cors) process.env.CORS_ORIGIN = rootConfig.server.cors;
      
      if (rootConfig.timeline) {
        setTimelineConfig(rootConfig.timeline);
      }
      setRootConfig(rootConfig as Record<string, unknown>);
      
      console.log(`設定ファイル: ${cwdConfigPath}`);
    } else {
      // デフォルト: サンプルデータを使用
      const samplePath = path.join(__dirname, '..', 'sample');
      const sampleConfigPath = path.join(samplePath, 'mdjournal.config.yaml');
      
      // サンプル設定のバリデーション（エラーは警告として表示、起動は継続）
      try {
        const validationResult = await validateConfigFiles(sampleConfigPath);
        if (!validationResult.valid) {
          console.log('\x1b[33mサンプルデータの設定に問題があります:\x1b[0m');
          console.log(formatValidationResults(validationResult));
          console.log('');
        }
      } catch {
        // サンプルがない場合は無視
      }
      
      process.env.CONFIG_PROJECTS = path.join(samplePath, 'config', 'projects.yaml');
      process.env.CONFIG_ROUTINES = path.join(samplePath, 'config', 'routines.yaml');
      process.env.CONFIG_REPORTS = path.join(samplePath, 'reports');
      
      console.log('サンプルデータで起動します');
    }
  }
  
  // コマンドライン引数のポートを優先
  if (args.port) {
    process.env.PORT = String(args.port);
  }
  
  // サーバーを起動
  await import('./index.js');
}

/**
 * 設定ファイルのチェックを実行
 */
async function runConfigCheck(configPath: string): Promise<void> {
  const absolutePath = path.resolve(configPath);
  
  console.log('設定ファイルをチェック中...\n');
  console.log(`対象: ${absolutePath}\n`);
  
  const result = await validateConfigFiles(absolutePath);
  
  console.log(formatValidationResults(result));
  console.log('');
  
  // サマリー
  console.log('═══════════════════════════════════════════════════════════════');
  if (result.valid) {
    console.log(`  \x1b[32m✓ 有効な設定ファイルです\x1b[0m`);
  } else {
    console.log(`  \x1b[31m✗ エラー: ${result.errors.length}\x1b[0m`);
  }
  if (result.warnings.length > 0) {
    console.log(`  \x1b[33m⚠ 警告: ${result.warnings.length}\x1b[0m`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  
  process.exit(result.valid ? 0 : 1);
}

async function main() {
  const args = process.argv.slice(2);
  
  // サブコマンドの判定
  if (args[0] === 'validate') {
    const validateArgs = parseValidateArgs(args.slice(1));
    await runValidation(validateArgs);
  } else if (args[0] === 'stats') {
    const statsArgs = parseStatsArgs(args.slice(1));
    await runStats(statsArgs);
  } else if (args[0] === 'config') {
    // 設定ファイルのチェック
    if (!args[1]) {
      console.error('\x1b[31mエラー: 設定ファイルのパスを指定してください\x1b[0m');
      console.log('\n使用方法: npx report-dashboard config <config-file>');
      console.log('例: npx report-dashboard config ./mdjournal.config.yaml\n');
      process.exit(1);
    }
    await runConfigCheck(args[1]);
  } else {
    const serverArgs = parseServerArgs(args);
    await runServer(serverArgs);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
