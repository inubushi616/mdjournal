/**
 * タイムラインのドラッグ機能を管理するカスタムフック
 * 
 * アルゴリズム:
 * - ドラッグした項目の開始時刻のみ変更
 * - 移動後の開始時刻順でソートを行う
 * - durationはレンダリング時に動的に計算（このフックでは扱わない）
 */

import { useState, useCallback, useEffect, type RefObject } from 'react';
import { message } from 'antd';
import type { ScheduleItem, DailyReport } from '../../types';

/**
 * 分を時刻文字列に変換
 */
function formatMinutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * ピクセルオフセットから新しい時刻を計算
 */
function calculateNewTime(
  startMinutes: number,
  offsetPx: number,
  hourHeight: number,
  maxHours: number,
  startHour: number,
  snapMinutes: number = 15
): string {
  // オフセットを分に変換
  const offsetMinutes = (offsetPx / hourHeight) * 60;
  let newMinutes = Math.round(startMinutes + offsetMinutes);
  
  // 指定された分単位にスナップ
  newMinutes = Math.round(newMinutes / snapMinutes) * snapMinutes;
  
  // 範囲制限（最小0時、最大 startHour + maxHours）
  const minMinutes = 0; // 0時まで遡れる
  const maxMinutes = (startHour + maxHours) * 60;
  newMinutes = Math.max(minMinutes, Math.min(maxMinutes - 60, newMinutes));
  
  const hour = Math.floor(newMinutes / 60);
  const min = newMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export interface DragState {
  itemId: string;
  type: 'plan' | 'result';
  startY: number;
  startMinutes: number; // ドラッグ開始時のアイテム開始時刻（分）
  isBreak?: boolean; // 休憩スロットかどうか
  breakDuration?: number; // 休憩の長さ（分）
}

interface UseTimelineDragProps {
  timelineRef: RefObject<HTMLDivElement | null>;
  resultAreaRef: RefObject<HTMLDivElement | null>;
  currentReport: DailyReport | null;
  updatePlan: (items: ScheduleItem[]) => void;
  updateResult: (items: ScheduleItem[]) => void;
  startHour?: number;
  totalHours?: number;
  hourHeight?: number;
  snapMinutes?: number;
}

export function useTimelineDrag({
  resultAreaRef,
  currentReport,
  updatePlan,
  updateResult,
  startHour = 8,
  totalHours = 12,
  hourHeight = 60,
  snapMinutes = 15,
}: UseTimelineDragProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState(0); // ピクセルオフセット
  const [isDraggingToResult, setIsDraggingToResult] = useState(false);

  // ドラッグ開始
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    itemId: string,
    type: 'plan' | 'result',
    startMinutes: number,
    isBreak?: boolean,
    breakDuration?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      itemId,
      type,
      startY: e.clientY,
      startMinutes,
      isBreak,
      breakDuration,
    });
    setDragOffset(0);
  }, []);

  // ドラッグ中
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    
    const deltaY = e.clientY - dragState.startY;
    
    // 15分単位でスナップ（ピクセルベース）
    const snapPx = hourHeight / 4; // 15分 = hourHeight/4ピクセル
    const snappedDelta = Math.round(deltaY / snapPx) * snapPx;
    
    setDragOffset(snappedDelta);
    
    // 計画アイテムを実績エリアにドラッグしているかチェック
    if (dragState.type === 'plan' && resultAreaRef.current) {
      const resultRect = resultAreaRef.current.getBoundingClientRect();
      const isOverResult = e.clientX >= resultRect.left && e.clientX <= resultRect.right;
      setIsDraggingToResult(isOverResult);
    }
  }, [dragState, resultAreaRef, hourHeight]);

  // ドラッグ終了
  const handleMouseUp = useCallback(() => {
    if (!dragState || !currentReport) return;
    
    // 計画から実績へのコピー
    if (dragState.type === 'plan' && isDraggingToResult) {
      // 休憩スロットの場合
      if (dragState.isBreak) {
        const newTime = dragOffset !== 0 
          ? calculateNewTime(dragState.startMinutes, dragOffset, hourHeight, totalHours, startHour, snapMinutes)
          : formatMinutesToTime(dragState.startMinutes);
        
        // 休憩アイテムを作成
        const breakItem: ScheduleItem = {
          id: `r${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          time: newTime,
          project: '---',
          task: '休憩',
        };
        
        // 休憩終了時刻のマーカーも追加（休憩の長さを保持）
        const endMinutes = dragState.startMinutes + (dragState.breakDuration || 60);
        const endTime = dragOffset !== 0
          ? calculateNewTime(endMinutes, dragOffset, hourHeight, totalHours, startHour, snapMinutes)
          : formatMinutesToTime(endMinutes);
        
        // 実績リストに追加してソート
        const updatedResult = [...currentReport.result, breakItem];
        updatedResult.sort((a, b) => a.time.localeCompare(b.time));
        updateResult(updatedResult);
        
        message.success(`休憩（${newTime}〜${endTime}）を実績にコピーしました`);
      } else {
        // 通常のアイテムの場合
        const planItem = currentReport.plan.find(item => item.id === dragState.itemId);
        if (planItem) {
          const newTime = dragOffset !== 0 
            ? calculateNewTime(dragState.startMinutes, dragOffset, hourHeight, totalHours, startHour, snapMinutes)
            : planItem.time;
          
          // 新しいアイテムを作成（durationは持たない）
          const newItem: ScheduleItem = {
            id: `r${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            time: newTime,
            project: planItem.project,
            task: planItem.task,
          };
          
          // 実績リストに追加してソート
          const updatedResult = [...currentReport.result, newItem];
          updatedResult.sort((a, b) => a.time.localeCompare(b.time));
          updateResult(updatedResult);
          
          message.success(`「${planItem.task}」を実績にコピーしました`);
        }
      }
    } else if (dragOffset !== 0) {
      // 通常の時刻移動
      const newTime = calculateNewTime(dragState.startMinutes, dragOffset, hourHeight, totalHours, startHour, snapMinutes);
      
      // アイテムの時刻のみ更新（durationは触らない）
      const items = dragState.type === 'plan' ? [...currentReport.plan] : [...currentReport.result];
      const updatedItems = items.map(item => 
        item.id === dragState.itemId ? { ...item, time: newTime } : item
      );
      // 時刻順でソート
      updatedItems.sort((a, b) => a.time.localeCompare(b.time));
      
      if (dragState.type === 'plan') {
        updatePlan(updatedItems);
      } else {
        updateResult(updatedItems);
      }
      
      message.success(`予定を ${newTime} に移動しました`);
    }
    
    setDragState(null);
    setDragOffset(0);
    setIsDraggingToResult(false);
  }, [dragState, dragOffset, isDraggingToResult, currentReport, updatePlan, updateResult, startHour, totalHours, hourHeight, snapMinutes]);

  // グローバルなマウスイベントリスナー
  useEffect(() => {
    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  return {
    dragState,
    dragOffset,
    isDraggingToResult,
    handleDragStart,
  };
}
