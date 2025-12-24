/**
 * 未保存レポート管理フック
 * 複数日付の未保存変更を管理
 */

import { useState, useCallback, useMemo } from 'react';
import type { DailyReport } from '../types';

export interface UnsavedReport {
  date: string;
  report: DailyReport;
  originalMarkdown: string;  // 元のMarkdown（変更検知用）
  currentMarkdown: string;   // 現在のMarkdown
}

export interface UseUnsavedReportsReturn {
  // 未保存レポートの一覧
  unsavedReports: Map<string, UnsavedReport>;
  
  // 未保存レポートがあるかどうか
  hasUnsavedChanges: boolean;
  
  // 未保存の日付一覧
  unsavedDates: string[];
  
  // 特定の日付に未保存の変更があるか
  hasUnsavedChangesForDate: (date: string) => boolean;
  
  // 未保存レポートを登録/更新
  setUnsavedReport: (date: string, report: DailyReport, originalMarkdown: string, currentMarkdown: string) => void;
  
  // 未保存レポートを削除（保存完了時）
  clearUnsavedReport: (date: string) => void;
  
  // すべての未保存レポートをクリア
  clearAllUnsavedReports: () => void;
  
  // 未保存レポートを取得
  getUnsavedReport: (date: string) => UnsavedReport | undefined;
}

export function useUnsavedReports(): UseUnsavedReportsReturn {
  const [unsavedReports, setUnsavedReports] = useState<Map<string, UnsavedReport>>(new Map());
  
  const hasUnsavedChanges = useMemo(() => {
    return unsavedReports.size > 0;
  }, [unsavedReports]);
  
  const unsavedDates = useMemo(() => {
    return Array.from(unsavedReports.keys());
  }, [unsavedReports]);
  
  const hasUnsavedChangesForDate = useCallback((date: string) => {
    return unsavedReports.has(date);
  }, [unsavedReports]);
  
  const setUnsavedReport = useCallback((
    date: string, 
    report: DailyReport, 
    originalMarkdown: string, 
    currentMarkdown: string
  ) => {
    // 変更がない場合は未保存リストから削除
    if (originalMarkdown === currentMarkdown) {
      setUnsavedReports(prev => {
        const next = new Map(prev);
        next.delete(date);
        return next;
      });
      return;
    }
    
    setUnsavedReports(prev => {
      const next = new Map(prev);
      next.set(date, { date, report, originalMarkdown, currentMarkdown });
      return next;
    });
  }, []);
  
  const clearUnsavedReport = useCallback((date: string) => {
    setUnsavedReports(prev => {
      const next = new Map(prev);
      next.delete(date);
      return next;
    });
  }, []);
  
  const clearAllUnsavedReports = useCallback(() => {
    setUnsavedReports(new Map());
  }, []);
  
  const getUnsavedReport = useCallback((date: string) => {
    return unsavedReports.get(date);
  }, [unsavedReports]);
  
  return {
    unsavedReports,
    hasUnsavedChanges,
    unsavedDates,
    hasUnsavedChangesForDate,
    setUnsavedReport,
    clearUnsavedReport,
    clearAllUnsavedReports,
    getUnsavedReport,
  };
}



