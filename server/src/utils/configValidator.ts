/**
 * 設定ファイルバリデーター
 * 
 * 設定ファイルの必須項目をチェックし、エラーを収集する
 */

import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';

/**
 * バリデーションエラー
 */
export interface ConfigValidationError {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * バリデーション結果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationError[];
}

/**
 * ルート設定ファイルの型
 */
interface RootConfig {
  projects?: string;
  routines?: string;
  reports?: string;
  timeline?: {
    hourHeight?: number;
    maxHours?: number;
    defaultStartHour?: number;
    defaultEndHour?: number;
    snapMinutes?: number;
  };
  server?: {
    port?: number;
    cors?: string;
  };
}

/**
 * プロジェクト設定の型
 */
interface ProjectConfig {
  projects?: Array<{
    code?: string;
    name?: string;
    color?: string;
    active?: boolean;
  }>;
}

/**
 * ルーチン設定の型
 */
interface RoutineConfig {
  routines?: {
    weekly?: {
      [key: string]: Array<{
        time?: string;
        project?: string;
        task?: string;
      }>;
    };
    monthly?: {
      start_of_month?: Array<{
        project?: string;
        task?: string;
      }>;
      end_of_month?: Array<{
        project?: string;
        task?: string;
      }>;
    };
  };
}

/**
 * ルート設定ファイルをバリデート
 */
export function validateRootConfig(config: unknown, filePath: string): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const c = config as RootConfig;

  // 必須フィールドチェック
  if (!c.reports) {
    errors.push({
      file: filePath,
      path: 'reports',
      message: '日報ディレクトリ (reports) が指定されていません',
      severity: 'error',
    });
  }

  if (!c.projects) {
    errors.push({
      file: filePath,
      path: 'projects',
      message: 'プロジェクト設定ファイル (projects) が指定されていません',
      severity: 'error',
    });
  }

  // routinesはオプショナル（未指定でも起動可能）
  // if (!c.routines) {
  //   errors.push({
  //     file: filePath,
  //     path: 'routines',
  //     message: 'ルーチン設定ファイル (routines) が指定されていません',
  //     severity: 'warning',
  //   });
  // }

  // タイムライン設定の警告チェック
  if (c.timeline) {
    if (c.timeline.hourHeight !== undefined && (c.timeline.hourHeight < 20 || c.timeline.hourHeight > 200)) {
      errors.push({
        file: filePath,
        path: 'timeline.hourHeight',
        message: `hourHeight (${c.timeline.hourHeight}) は 20〜200 の範囲を推奨します`,
        severity: 'warning',
      });
    }
    if (c.timeline.defaultStartHour !== undefined && (c.timeline.defaultStartHour < 0 || c.timeline.defaultStartHour > 23)) {
      errors.push({
        file: filePath,
        path: 'timeline.defaultStartHour',
        message: `defaultStartHour (${c.timeline.defaultStartHour}) は 0〜23 の範囲で指定してください`,
        severity: 'error',
      });
    }
    if (c.timeline.defaultEndHour !== undefined && (c.timeline.defaultEndHour < 1 || c.timeline.defaultEndHour > 24)) {
      errors.push({
        file: filePath,
        path: 'timeline.defaultEndHour',
        message: `defaultEndHour (${c.timeline.defaultEndHour}) は 1〜24 の範囲で指定してください`,
        severity: 'error',
      });
    }
    if (c.timeline.snapMinutes !== undefined && ![1, 5, 10, 15, 30, 60].includes(c.timeline.snapMinutes)) {
      errors.push({
        file: filePath,
        path: 'timeline.snapMinutes',
        message: `snapMinutes (${c.timeline.snapMinutes}) は 1, 5, 10, 15, 30, 60 のいずれかを推奨します`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

/**
 * プロジェクト設定ファイルをバリデート
 */
export function validateProjectsConfig(config: unknown, filePath: string): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const c = config as ProjectConfig;

  if (!c.projects) {
    errors.push({
      file: filePath,
      path: 'projects',
      message: 'プロジェクトリスト (projects) が定義されていません',
      severity: 'error',
    });
    return errors;
  }

  if (!Array.isArray(c.projects)) {
    errors.push({
      file: filePath,
      path: 'projects',
      message: 'projects は配列である必要があります',
      severity: 'error',
    });
    return errors;
  }

  if (c.projects.length === 0) {
    errors.push({
      file: filePath,
      path: 'projects',
      message: 'プロジェクトが1つも定義されていません',
      severity: 'error',
    });
    return errors;
  }

  // 各プロジェクトのバリデーション
  const codes = new Set<string>();
  c.projects.forEach((project, index) => {
    const prefix = `projects[${index}]`;

    if (!project.code) {
      errors.push({
        file: filePath,
        path: `${prefix}.code`,
        message: `プロジェクト ${index + 1} に code が指定されていません`,
        severity: 'error',
      });
    } else {
      // 重複チェック
      if (codes.has(project.code)) {
        errors.push({
          file: filePath,
          path: `${prefix}.code`,
          message: `プロジェクトコード "${project.code}" が重複しています`,
          severity: 'error',
        });
      }
      codes.add(project.code);
    }

    if (!project.name) {
      errors.push({
        file: filePath,
        path: `${prefix}.name`,
        message: `プロジェクト ${project.code || index + 1} に name が指定されていません`,
        severity: 'error',
      });
    }

    // 色のフォーマットチェック（警告）
    if (project.color && !/^#[0-9A-Fa-f]{6}$/.test(project.color)) {
      errors.push({
        file: filePath,
        path: `${prefix}.color`,
        message: `プロジェクト ${project.code || index + 1} の color "${project.color}" は #RRGGBB 形式を推奨します`,
        severity: 'warning',
      });
    }
  });

  return errors;
}

/**
 * ルーチン設定ファイルをバリデート
 */
export function validateRoutinesConfig(
  config: unknown,
  filePath: string,
  projectCodes: Set<string>
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  const c = config as RoutineConfig;

  if (!c.routines) {
    errors.push({
      file: filePath,
      path: 'routines',
      message: 'ルーチン定義 (routines) がありません',
      severity: 'error',
    });
    return errors;
  }

  // weekly ルーチンのバリデーション
  if (c.routines.weekly) {
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const [day, items] of Object.entries(c.routines.weekly)) {
      if (!validDays.includes(day)) {
        errors.push({
          file: filePath,
          path: `routines.weekly.${day}`,
          message: `不正な曜日名 "${day}" です。使用可能: ${validDays.join(', ')}`,
          severity: 'warning',
        });
        continue;
      }

      if (!Array.isArray(items)) {
        errors.push({
          file: filePath,
          path: `routines.weekly.${day}`,
          message: `${day} のルーチンは配列である必要があります`,
          severity: 'error',
        });
        continue;
      }

      items.forEach((item, index) => {
        const prefix = `routines.weekly.${day}[${index}]`;

        if (!item.time) {
          errors.push({
            file: filePath,
            path: `${prefix}.time`,
            message: `${day} のルーチン ${index + 1} に time が指定されていません`,
            severity: 'error',
          });
        } else if (!/^\d{1,2}:\d{2}$/.test(item.time)) {
          errors.push({
            file: filePath,
            path: `${prefix}.time`,
            message: `${day} のルーチン ${index + 1} の time "${item.time}" は HH:MM 形式で指定してください`,
            severity: 'error',
          });
        }

        if (!item.project) {
          errors.push({
            file: filePath,
            path: `${prefix}.project`,
            message: `${day} のルーチン ${index + 1} に project が指定されていません`,
            severity: 'error',
          });
        } else if (projectCodes.size > 0 && !projectCodes.has(String(item.project))) {
          errors.push({
            file: filePath,
            path: `${prefix}.project`,
            message: `${day} のルーチン ${index + 1} の project "${item.project}" はプロジェクト定義に存在しません`,
            severity: 'warning',
          });
        }

        if (!item.task) {
          errors.push({
            file: filePath,
            path: `${prefix}.task`,
            message: `${day} のルーチン ${index + 1} に task が指定されていません`,
            severity: 'error',
          });
        }
      });
    }
  }

  // monthly ルーチンのバリデーション
  if (c.routines.monthly) {
    const validateMonthlyItems = (items: Array<{ project?: string; task?: string }>, type: string) => {
      if (!Array.isArray(items)) return;

      items.forEach((item, index) => {
        const prefix = `routines.monthly.${type}[${index}]`;

        if (!item.project) {
          errors.push({
            file: filePath,
            path: `${prefix}.project`,
            message: `${type} のルーチン ${index + 1} に project が指定されていません`,
            severity: 'error',
          });
        } else if (projectCodes.size > 0 && !projectCodes.has(String(item.project))) {
          errors.push({
            file: filePath,
            path: `${prefix}.project`,
            message: `${type} のルーチン ${index + 1} の project "${item.project}" はプロジェクト定義に存在しません`,
            severity: 'warning',
          });
        }

        if (!item.task) {
          errors.push({
            file: filePath,
            path: `${prefix}.task`,
            message: `${type} のルーチン ${index + 1} に task が指定されていません`,
            severity: 'error',
          });
        }
      });
    };

    if (c.routines.monthly.start_of_month) {
      validateMonthlyItems(c.routines.monthly.start_of_month, 'start_of_month');
    }
    if (c.routines.monthly.end_of_month) {
      validateMonthlyItems(c.routines.monthly.end_of_month, 'end_of_month');
    }
  }

  return errors;
}

/**
 * 設定ファイル全体をバリデート
 */
export async function validateConfigFiles(configPath: string): Promise<ConfigValidationResult> {
  const allErrors: ConfigValidationError[] = [];
  const configDir = path.dirname(configPath);

  // ルート設定ファイルを読み込み
  let rootConfig: RootConfig;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    rootConfig = yaml.load(content) as RootConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      allErrors.push({
        file: configPath,
        path: '',
        message: `設定ファイルが見つかりません: ${configPath}`,
        severity: 'error',
      });
    } else {
      allErrors.push({
        file: configPath,
        path: '',
        message: `設定ファイルの読み込みエラー: ${(error as Error).message}`,
        severity: 'error',
      });
    }
    return {
      valid: false,
      errors: allErrors.filter(e => e.severity === 'error'),
      warnings: allErrors.filter(e => e.severity === 'warning'),
    };
  }

  // ルート設定のバリデーション
  allErrors.push(...validateRootConfig(rootConfig, configPath));

  // プロジェクトコードを収集（ルーチンバリデーション用）
  const projectCodes = new Set<string>();

  // プロジェクト設定ファイルのバリデーション
  if (rootConfig.projects) {
    const projectsPath = path.resolve(configDir, rootConfig.projects);
    try {
      const content = await fs.readFile(projectsPath, 'utf-8');
      const projectsConfig = yaml.load(content) as ProjectConfig;
      allErrors.push(...validateProjectsConfig(projectsConfig, projectsPath));
      
      // プロジェクトコードを収集
      if (projectsConfig.projects && Array.isArray(projectsConfig.projects)) {
        projectsConfig.projects.forEach(p => {
          if (p.code) projectCodes.add(String(p.code));
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        allErrors.push({
          file: projectsPath,
          path: '',
          message: `プロジェクト設定ファイルが見つかりません: ${projectsPath}`,
          severity: 'error',
        });
      } else {
        allErrors.push({
          file: projectsPath,
          path: '',
          message: `プロジェクト設定ファイルの読み込みエラー: ${(error as Error).message}`,
          severity: 'error',
        });
      }
    }
  }

  // ルーチン設定ファイルのバリデーション
  if (rootConfig.routines) {
    const routinesPath = path.resolve(configDir, rootConfig.routines);
    try {
      const content = await fs.readFile(routinesPath, 'utf-8');
      const routinesConfig = yaml.load(content);
      allErrors.push(...validateRoutinesConfig(routinesConfig, routinesPath, projectCodes));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        allErrors.push({
          file: routinesPath,
          path: '',
          message: `ルーチン設定ファイルが見つかりません: ${routinesPath}`,
          severity: 'error',
        });
      } else {
        allErrors.push({
          file: routinesPath,
          path: '',
          message: `ルーチン設定ファイルの読み込みエラー: ${(error as Error).message}`,
          severity: 'error',
        });
      }
    }
  }

  // 日報ディレクトリの存在チェック
  if (rootConfig.reports) {
    const reportsPath = path.resolve(configDir, rootConfig.reports);
    try {
      await fs.access(reportsPath);
    } catch {
      allErrors.push({
        file: configPath,
        path: 'reports',
        message: `日報ディレクトリが見つかりません: ${reportsPath}`,
        severity: 'warning',
      });
    }
  }

  const errors = allErrors.filter(e => e.severity === 'error');
  const warnings = allErrors.filter(e => e.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * バリデーション結果をフォーマットして出力
 */
export function formatValidationResults(result: ConfigValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('\x1b[31m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    lines.push('\x1b[31m║                    設定ファイルエラー                        ║\x1b[0m');
    lines.push('\x1b[31m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    lines.push('');

    result.errors.forEach(err => {
      lines.push(`\x1b[31m✗ エラー:\x1b[0m ${err.message}`);
      lines.push(`  ファイル: ${err.file}`);
      if (err.path) {
        lines.push(`  パス: ${err.path}`);
      }
      lines.push('');
    });
  }

  if (result.warnings.length > 0) {
    if (result.errors.length > 0) {
      lines.push('');
    }
    lines.push('\x1b[33m警告:\x1b[0m');
    result.warnings.forEach(warn => {
      lines.push(`  \x1b[33m⚠\x1b[0m ${warn.message}`);
      lines.push(`    ファイル: ${warn.file}`);
    });
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push('\x1b[32m✓ 設定ファイルのバリデーションが完了しました\x1b[0m');
  }

  return lines.join('\n');
}

