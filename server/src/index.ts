/**
 * 日報管理ダッシュボード バックエンドサーバー
 * 
 * Express.jsベースのREST APIサーバー
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import reportsRouter from './routes/reports.js';
import calendarRouter from './routes/calendar.js';
import configRouter from './routes/config.js';
import gcalRouter from './routes/gcal.js';
import gitRouter from './routes/git.js';
import { initConfigPaths, getConfigPaths } from './utils/fileManager.js';
import type { ApiError } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定パスを初期化（環境変数から読み込み）
initConfigPaths();

// 環境変数
const PORT = parseInt(process.env.PORT || '3001', 10);

// Express アプリケーション
const app = express();

// ミドルウェア
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173', // Vite default
  credentials: true,
}));
app.use(express.json());

// リクエストログ
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ヘルスチェック
app.get('/api/health', (_req: Request, res: Response) => {
  const paths = getConfigPaths();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      projects: paths.projects,
      routines: paths.routines,
      reports: paths.reports,
    },
  });
});

// APIルーター
app.use('/api/reports', reportsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/config', configRouter);
app.use('/api/gcal', gcalRouter);
app.use('/api/git', gitRouter);

// 404ハンドラー (API)
app.use('/api/*', (_req: Request, res: Response) => {
  const error: ApiError = {
    code: 'NOT_FOUND',
    message: 'APIエンドポイントが見つかりません',
  };
  res.status(404).json(error);
});

// 静的ファイルの配信（クライアントビルド）
// パッケージ配布時: dist/client、開発時: ../../client/dist
const findClientDist = (): string | null => {
  const candidates = [
    process.env.CLIENT_DIST,
    path.join(__dirname, 'client'),                    // パッケージ配布時 (dist/client)
    path.join(__dirname, '..', '..', 'client', 'dist'), // 開発時 (../../client/dist)
  ].filter(Boolean) as string[];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
};
const clientDistPath = findClientDist();
if (clientDistPath) {
  console.log(`クライアント配信: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  
  // SPA対応: API以外のルートはindex.htmlを返す
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// エラーハンドラー
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  const error: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'サーバー内部エラーが発生しました',
  };
  res.status(500).json(error);
});

// サーバー起動
const paths = getConfigPaths();
const hasClient = clientDistPath !== null;
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         日報管理ダッシュボード                            ║
╠═══════════════════════════════════════════════════════════╣
║  URL:       http://localhost:${String(PORT).padEnd(27)}║
║  API:       http://localhost:${PORT}/api                      ║
║  Client:    ${hasClient ? '配信中'.padEnd(43) : '未ビルド（npm run build in client）'.padEnd(43)}║
╠═══════════════════════════════════════════════════════════╣
║  設定ファイル:                                            ║
║    projects:  ${(paths.projects || '(未設定)').slice(-42).padEnd(42)}║
║    routines:  ${(paths.routines || '(未設定)').slice(-42).padEnd(42)}║
║    reports:   ${(paths.reports || '(未設定)').slice(-42).padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);
});

// ポート使用中エラーのハンドリング
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║                      起動エラー                              ║
╚══════════════════════════════════════════════════════════════╝

✗ ポート ${PORT} は既に使用されています。

以下のいずれかを試してください:
  1. 別のポートを指定して起動:
     npx mdjournal -p 3200

  2. ポート ${PORT} を使用しているプロセスを終了:
     lsof -ti:${PORT} | xargs kill -9

`);
    process.exit(1);
  } else {
    console.error('サーバー起動エラー:', err);
    process.exit(1);
  }
});

export default app;
