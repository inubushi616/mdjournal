/**
 * タイムラインビューコンポーネント
 * 1日の計画と実績を時間軸で表示
 */

import { Card, Space, Tag, Typography, Button, message, Input, Modal } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import dayjs from 'dayjs';
import { useDashboard } from '../Dashboard/DashboardContext';
import type { ScheduleItem } from '../../types';
import type { RenderSlot } from '../../models';
import { formatDuration } from '../../utils';
import { TimelineItem } from './TimelineItem';
import { DragPreview } from './DragPreview';
import { useTimelineDrag } from './useTimelineDrag';
import {
  generateScheduleMarkdown,
  parseScheduleMarkdown,
  getTimeRange,
  calculateRenderSlots,
  calculateBreakSlots,
} from '../../models';

const { Text } = Typography;
const { TextArea } = Input;

interface TimelineViewProps {
  selectedDate: dayjs.Dayjs;
  onEditClick?: () => void;
  selectedProjects?: string[];
}

// プロジェクト別稼働時間の集計結果
interface ProjectSummary {
  project: string;
  projectName: string;
  color: string;
  planMinutes: number;
  resultMinutes: number;
}

export const TimelineView = ({ selectedDate, selectedProjects = [] }: TimelineViewProps) => {
  const { report, config } = useDashboard();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const resultAreaRef = useRef<HTMLDivElement>(null);
  
  // 現在の日報データ
  const currentReport = report.report;
  const projects = config.projects;
  
  // プランとリザルトをメモ化
  const planItems = useMemo(() => currentReport?.plan || [], [currentReport?.plan]);
  const resultItems = useMemo(() => currentReport?.result || [], [currentReport?.result]);
  
  // タイムライン設定
  const timelineConfig = config.config?.timeline || {
    hourHeight: 60,
    maxHours: 36,
    defaultStartHour: 8,
    defaultEndHour: 20,
    snapMinutes: 15,
  };
  const hourHeight = timelineConfig.hourHeight;
  const maxHours = timelineConfig.maxHours;
  const defaultStartHour = timelineConfig.defaultStartHour;
  const defaultEndHour = timelineConfig.defaultEndHour;
  const snapMinutes = timelineConfig.snapMinutes;
  
  // 時間範囲を計算（計画と実績の両方を考慮）
  const timeRange = useMemo(() => {
    const allItems = [...planItems, ...resultItems];
    return getTimeRange(allItems, { maxHours, defaultStartHour, defaultEndHour });
  }, [planItems, resultItems, maxHours, defaultStartHour, defaultEndHour]);
  
  const { startHour, endHour, totalHours } = timeRange;
  
  // タイムラインの総高さ（ピクセル）
  const timelineHeight = totalHours * hourHeight;
  
  // Markdown編集用のテキスト（編集モード時のみ使用）
  const [planMarkdown, setPlanMarkdown] = useState('');
  const [resultMarkdown, setResultMarkdown] = useState('');

  // ドラッグ機能
  const { dragState, dragOffset, isDraggingToResult, handleDragStart } = useTimelineDrag({
    timelineRef,
    resultAreaRef,
    currentReport,
    updatePlan: report.updatePlan,
    updateResult: report.updateResult,
    startHour,
    totalHours,
    hourHeight,
    snapMinutes,
  });

  const getProjectColor = (projectCode: string) => {
    return config.getProjectColor(projectCode);
  };

  // 現在時刻
  const now = dayjs();
  const isToday = selectedDate.isSame(now, 'day');
  const currentMinutes = now.hour() * 60 + now.minute();

  // 時間軸の目盛り（動的）
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  // 全アイテムでレンダリング用スロットを計算（durationは動的に計算される）
  // ※プロジェクトフィルタ前に計算することで、duration計算が正しく行われる
  const allPlanSlots = useMemo(() => 
    calculateRenderSlots(planItems, startHour, totalHours, hourHeight),
    [planItems, startHour, totalHours, hourHeight]
  );
  const allResultSlots = useMemo(() => 
    calculateRenderSlots(resultItems, startHour, totalHours, hourHeight),
    [resultItems, startHour, totalHours, hourHeight]
  );
  
  // 休憩スロットを計算（全アイテムベース）
  const allPlanBreaks = useMemo(() => 
    calculateBreakSlots(planItems, startHour, totalHours, hourHeight),
    [planItems, startHour, totalHours, hourHeight]
  );
  const allResultBreaks = useMemo(() => 
    calculateBreakSlots(resultItems, startHour, totalHours, hourHeight),
    [resultItems, startHour, totalHours, hourHeight]
  );
  
  // プロジェクトフィルタ適用（duration計算後に表示をフィルタ）
  const planSlots = useMemo(() => 
    selectedProjects.length > 0
      ? allPlanSlots.filter(slot => selectedProjects.includes(slot.project))
      : allPlanSlots,
    [allPlanSlots, selectedProjects]
  );
  const resultSlots = useMemo(() => 
    selectedProjects.length > 0
      ? allResultSlots.filter(slot => selectedProjects.includes(slot.project))
      : allResultSlots,
    [allResultSlots, selectedProjects]
  );
  
  // 休憩スロット（フィルタなし、常に全体を表示）
  const planBreaks = allPlanBreaks;
  const resultBreaks = allResultBreaks;

  // 日付変更時のスクロールフラグ
  const lastScrolledDateRef = useRef<string | null>(null);

  // 最初の予定にスクロール（日付変更時のみ）
  useEffect(() => {
    const dateKey = selectedDate.format('YYYY-MM-DD');
    
    // 同じ日付で既にスクロール済みの場合はスキップ
    if (lastScrolledDateRef.current === dateKey) {
      return;
    }
    
    // データがまだ読み込まれていない場合はスキップ（後で再実行される）
    const allItems = [...planItems, ...resultItems];
    if (allItems.length === 0) {
      return;
    }
    
    // 計画と実績の最初の予定時刻を取得
    const firstItemTime = allItems.reduce((min, item) => {
      const [h, m] = item.time.split(':').map(Number);
      const minutes = h * 60 + m;
      return minutes < min ? minutes : min;
    }, Infinity);
    
    // 最初の予定の30分前にスクロール（見やすくするため）
    const scrollToMinutes = Math.max(firstItemTime - 30, startHour * 60);
    const targetScrollTop = ((scrollToMinutes - startHour * 60) / 60) * hourHeight;
    
    // requestAnimationFrameで確実にDOM更新後にスクロール
    requestAnimationFrame(() => {
      if (timelineRef.current && !isEditing) {
        timelineRef.current.scrollTop = targetScrollTop;
        // スクロール済みとしてマーク
        lastScrolledDateRef.current = dateKey;
        console.log(`[Timeline] Scrolled to ${scrollToMinutes}min (${Math.floor(scrollToMinutes/60)}:${String(scrollToMinutes%60).padStart(2,'0')}), scrollTop=${targetScrollTop}px, firstItem=${firstItemTime}min, startHour=${startHour}`);
      }
    });
  }, [selectedDate, isEditing, startHour, hourHeight, planItems, resultItems]);

  // アイテム削除
  const handleDeleteItem = (id: string, type: 'plan' | 'result') => {
    report.deleteScheduleItem(type, id);
    message.success(`${type === 'plan' ? '計画' : '実績'}を削除しました`);
  };

  // プロジェクト変更
  const handleChangeProject = useCallback((id: string, projectCode: string, type: 'plan' | 'result') => {
    report.updateScheduleItem(type, id, { project: projectCode });
    message.success(`プロジェクトを ${projectCode} に変更しました`);
  }, [report]);

  // 計画を実績にコピー（個別）
  const handleCopyToResult = (item: ScheduleItem) => {
    report.addScheduleItem('result', {
      time: item.time,
      project: item.project,
      task: item.task,
      duration: item.duration,
    });
    message.success(`「${item.task}」を実績にコピーしました`);
  };

  // メニューアクション
  const handleMenuAction = useCallback((key: string) => {
    if (key.startsWith('project:')) {
      const parts = key.split(':');
      const id = parts[1];
      const type = parts[2] as 'plan' | 'result';
      const projectCode = parts[3];
      handleChangeProject(id, projectCode, type);
    } else if (key.startsWith('toResult:')) {
      const [, id] = key.split(':');
      const item = currentReport?.plan.find(i => i.id === id);
      if (item) handleCopyToResult(item);
    } else if (key.startsWith('delete:')) {
      const [, id, type] = key.split(':');
      handleDeleteItem(id, type as 'plan' | 'result');
    }
  }, [currentReport, handleChangeProject]);

  // 稼働時間の集計（レンダースロットから動的に計算）
  const totalPlanMinutes = useMemo(() => 
    planSlots.reduce((sum, slot) => sum + slot.duration, 0),
    [planSlots]
  );
  const totalResultMinutes = useMemo(() => 
    resultSlots.reduce((sum, slot) => sum + slot.duration, 0),
    [resultSlots]
  );

  // プロジェクト別稼働時間の集計
  const projectSummary = useMemo((): ProjectSummary[] => {
    // プランからプロジェクト別に集計
    const planByProject = new Map<string, number>();
    for (const slot of allPlanSlots) {
      if (slot.project && !slot.isBreak) {
        planByProject.set(slot.project, (planByProject.get(slot.project) || 0) + slot.duration);
      }
    }

    // 実績からプロジェクト別に集計
    const resultByProject = new Map<string, number>();
    for (const slot of allResultSlots) {
      if (slot.project && !slot.isBreak) {
        resultByProject.set(slot.project, (resultByProject.get(slot.project) || 0) + slot.duration);
      }
    }

    // すべてのプロジェクトを統合
    const allProjects = new Set([...planByProject.keys(), ...resultByProject.keys()]);

    // 結果を配列に変換し、実績時間の降順でソート
    return Array.from(allProjects)
      .map((projectCode) => {
        const proj = projects.find(p => p.code === projectCode);
        return {
          project: projectCode,
          projectName: proj?.name || projectCode,
          color: proj?.color || '#999',
          planMinutes: planByProject.get(projectCode) || 0,
          resultMinutes: resultByProject.get(projectCode) || 0,
        };
      })
      .sort((a, b) => b.resultMinutes - a.resultMinutes || b.planMinutes - a.planMinutes);
  }, [allPlanSlots, allResultSlots, projects]);

  // 編集モード切替
  const handleToggleEdit = () => {
    if (!isEditing && currentReport) {
      setPlanMarkdown(generateScheduleMarkdown(currentReport.plan, '[PLAN]'));
      setResultMarkdown(generateScheduleMarkdown(currentReport.result, '[RESULT]'));
    }
    setIsEditing(!isEditing);
  };

  const handleSaveMarkdown = () => {
    const parsedPlan = parseScheduleMarkdown(planMarkdown);
    const parsedResult = parseScheduleMarkdown(resultMarkdown);
    report.updatePlan(parsedPlan);
    report.updateResult(parsedResult);
    message.success('反映しました');
    setIsEditing(false);
  };

  // アイテム描画
  const renderTimeItem = (item: RenderSlot, isResult: boolean) => {
    const type = isResult ? 'result' : 'plan';
    const isHovered = hoveredItem === `${type}-${item.id}`;
    const isDragging = dragState?.itemId === item.id && dragState?.type === type;
    const isDraggingToResultArea = isDragging && isDraggingToResult;

    return (
      <TimelineItem
        key={item.id}
        item={item}
        type={type}
        isHovered={isHovered}
        isDragging={isDragging}
        isDraggingToResultArea={isDraggingToResultArea}
        dragOffset={dragOffset}
        getProjectColor={getProjectColor}
        projects={projects}
        onHover={setHoveredItem}
        onDragStart={handleDragStart}
        onMenuAction={handleMenuAction}
      />
    );
  };

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          <span>タイムライン</span>
          <Tag>{selectedDate.format('MM/DD (ddd)')}</Tag>
        </Space>
      }
      extra={
        <Space>
          {isEditing ? (
            <>
              <Button size="small" icon={<CloseOutlined />} onClick={() => setIsEditing(false)}>
                キャンセル
              </Button>
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleSaveMarkdown}>
                OK
              </Button>
            </>
          ) : (
            <>
              <Button size="small" icon={<BarChartOutlined />} onClick={() => setIsSummaryOpen(true)}>
                集計
              </Button>
              <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleToggleEdit}>
                編集
              </Button>
            </>
          )}
        </Space>
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: 12, height: 'calc(100% - 57px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      {isEditing ? (
        /* Markdown編集モード */
        <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Text strong style={{ marginBottom: 4, color: '#1890ff' }}>計画</Text>
            <TextArea
              value={planMarkdown}
              onChange={(e) => setPlanMarkdown(e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Text strong style={{ marginBottom: 4, color: '#52c41a' }}>実績</Text>
            <TextArea
              value={resultMarkdown}
              onChange={(e) => setResultMarkdown(e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
        </div>
      ) : (
        /* タイムライン表示モード */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* 固定ヘッダー */}
          <div style={{ 
            display: 'flex', 
            flexShrink: 0, 
            paddingBottom: 4,
            borderBottom: '1px solid #f0f0f0',
          }}>
            {/* 時間軸のスペース */}
            <div style={{ width: 40, flexShrink: 0 }} />
            {/* 計画ヘッダー */}
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: 6,
              minWidth: 80,
            }}>
              <PlayCircleOutlined style={{ fontSize: 12, color: '#1890ff' }} />
              <Text style={{ fontSize: 11, color: '#1890ff' }}>計画</Text>
              <Text strong style={{ fontSize: 12, color: '#1890ff' }}>{formatDuration(totalPlanMinutes)}</Text>
            </div>
            {/* 実績ヘッダー */}
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: 6,
              minWidth: 80,
              marginLeft: 8,
            }}>
              <CheckCircleOutlined style={{ fontSize: 12, color: '#52c41a' }} />
              <Text style={{ fontSize: 11, color: '#52c41a' }}>
                {isDraggingToResult ? 'ここにドロップでコピー' : '実績'}
              </Text>
              <Text strong style={{ fontSize: 12, color: '#52c41a' }}>{formatDuration(totalResultMinutes)}</Text>
            </div>
          </div>

          {/* スクロール可能なタイムライン */}
          <div ref={timelineRef} style={{ display: 'flex', flex: 1, overflow: 'auto', minHeight: 0 }}>
            {/* 時間軸 */}
            <div style={{ width: 40, flexShrink: 0, position: 'relative', height: timelineHeight }}>
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  style={{
                    position: 'absolute',
                    top: index * hourHeight,
                    left: 0,
                    right: 0,
                    height: index < hours.length - 1 ? hourHeight : 0,
                    borderTop: '1px solid #f0f0f0',
                    paddingRight: 4,
                    textAlign: 'right',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {hour}:00
                  </Text>
                </div>
              ))}
            </div>

            {/* 計画 */}
            <div style={{ flex: 1, position: 'relative', minWidth: 80, height: timelineHeight, background: '#fafafa' }}>
              {/* 時間グリッド */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    position: 'absolute',
                    top: (hour - startHour) * hourHeight,
                    left: 0,
                    right: 0,
                    borderTop: '1px dashed #e8e8e8',
                  }}
                />
              ))}
              {/* 現在時刻インジケーター */}
              {isToday && currentMinutes >= startHour * 60 && currentMinutes <= endHour * 60 && (
                <div
                  style={{
                    position: 'absolute',
                    top: ((currentMinutes - startHour * 60) / 60) * hourHeight,
                    left: 0,
                    right: 0,
                    borderTop: '2px solid #ff4d4f',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -4,
                      top: -6,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#ff4d4f',
                    }}
                  />
                </div>
              )}
              {/* 休憩スロット（ドラッグ可能） */}
              {planBreaks.map((breakSlot) => {
                const isBreakDragging = dragState?.itemId === breakSlot.id && dragState?.isBreak;
                return (
                  <div
                    key={breakSlot.id}
                    style={{
                      position: 'absolute',
                      top: ((breakSlot.startMinutes - startHour * 60) / 60) * hourHeight + (isBreakDragging ? dragOffset : 0),
                      height: (breakSlot.duration / 60) * hourHeight,
                      left: 4,
                      right: 4,
                      background: 'repeating-linear-gradient(45deg, #f5f5f5, #f5f5f5 4px, #e8e8e8 4px, #e8e8e8 8px)',
                      borderRadius: 4,
                      border: '1px dashed #d9d9d9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isBreakDragging ? 0.5 : 0.8,
                      cursor: 'grab',
                      transition: isBreakDragging ? 'none' : 'opacity 0.2s',
                    }}
                    onMouseDown={(e) => handleDragStart(e, breakSlot.id, 'plan', breakSlot.startMinutes, true, breakSlot.duration)}
                  >
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      休憩
                    </Text>
                  </div>
                );
              })}
              {/* 予定アイテム */}
              {planSlots.map((item) => renderTimeItem(item, false))}
            </div>

            {/* 実績 */}
            <div 
              ref={resultAreaRef}
              style={{ 
                flex: 1, 
                position: 'relative', 
                minWidth: 80, 
                marginLeft: 8,
                height: timelineHeight,
                background: '#fafafa',
                transition: 'all 0.2s',
                ...(isDraggingToResult && {
                  boxShadow: '0 0 0 2px #52c41a',
                }),
              }}
            >
              {/* 時間グリッド */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    position: 'absolute',
                    top: (hour - startHour) * hourHeight,
                    left: 0,
                    right: 0,
                    borderTop: '1px dashed #e8e8e8',
                  }}
                />
              ))}
              {/* 休憩スロット（ドラッグ可能） */}
              {resultBreaks.map((breakSlot) => {
                const isBreakDragging = dragState?.itemId === breakSlot.id && dragState?.isBreak;
                return (
                  <div
                    key={breakSlot.id}
                    style={{
                      position: 'absolute',
                      top: ((breakSlot.startMinutes - startHour * 60) / 60) * hourHeight + (isBreakDragging ? dragOffset : 0),
                      height: (breakSlot.duration / 60) * hourHeight,
                      left: 4,
                      right: 4,
                      background: 'repeating-linear-gradient(45deg, #f5f5f5, #f5f5f5 4px, #e8e8e8 4px, #e8e8e8 8px)',
                      borderRadius: 4,
                      border: '1px dashed #d9d9d9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isBreakDragging ? 0.5 : 0.8,
                      cursor: 'grab',
                      transition: isBreakDragging ? 'none' : 'opacity 0.2s',
                    }}
                    onMouseDown={(e) => handleDragStart(e, breakSlot.id, 'result', breakSlot.startMinutes, true, breakSlot.duration)}
                  >
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      休憩
                    </Text>
                  </div>
                );
              })}
              {/* 実績アイテム */}
              {resultSlots.map((item) => renderTimeItem(item, true))}
              {/* ドラッグプレビュー */}
              <DragPreview
                dragState={dragState}
                dragOffset={dragOffset}
                isDraggingToResult={isDraggingToResult}
                planItems={planItems}
                getProjectColor={getProjectColor}
                startHour={startHour}
                hourHeight={hourHeight}
              />
            </div>
          </div>
        </div>
      )}

      {/* 集計モーダル */}
      <Modal
        title={
          <Space>
            <BarChartOutlined />
            <span>プロジェクト別稼働時間</span>
            <Tag>{selectedDate.format('MM/DD (ddd)')}</Tag>
          </Space>
        }
        open={isSummaryOpen}
        onCancel={() => setIsSummaryOpen(false)}
        footer={null}
        width={600}
      >
        <div style={{ padding: '16px 0' }}>
          {/* 合計 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-around', 
            marginBottom: 24,
            padding: '12px 16px',
            background: '#fafafa',
            borderRadius: 8,
          }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>計画</Text>
              <div>
                <Text strong style={{ fontSize: 20, color: '#1890ff' }}>
                  {formatDuration(totalPlanMinutes)}
                </Text>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>実績</Text>
              <div>
                <Text strong style={{ fontSize: 20, color: '#52c41a' }}>
                  {formatDuration(totalResultMinutes)}
                </Text>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>差分</Text>
              <div>
                <Text 
                  strong 
                  style={{ 
                    fontSize: 20, 
                    color: totalResultMinutes >= totalPlanMinutes ? '#52c41a' : '#ff4d4f' 
                  }}
                >
                  {totalResultMinutes >= totalPlanMinutes ? '+' : '-'}
                  {formatDuration(Math.abs(totalResultMinutes - totalPlanMinutes))}
                </Text>
              </div>
            </div>
          </div>

          {/* プロジェクト別棒グラフ */}
          {projectSummary.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projectSummary.map((item) => {
                const maxMinutes = Math.max(
                  ...projectSummary.map(p => Math.max(p.planMinutes, p.resultMinutes)),
                  60 // 最低1時間幅を確保
                );
                const planWidth = (item.planMinutes / maxMinutes) * 100;
                const resultWidth = (item.resultMinutes / maxMinutes) * 100;

                return (
                  <div key={item.project} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* プロジェクト名 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div 
                        style={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: 2, 
                          background: item.color,
                          flexShrink: 0,
                        }} 
                      />
                      <Text strong style={{ fontSize: 13 }}>
                        [{item.project}] {item.projectName}
                      </Text>
                    </div>
                    
                    {/* 棒グラフ */}
                    <div style={{ marginLeft: 20 }}>
                      {/* 計画 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text type="secondary" style={{ fontSize: 11, width: 32 }}>計画</Text>
                        <div style={{ flex: 1, height: 16, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              width: `${planWidth}%`, 
                              height: '100%', 
                              background: `linear-gradient(90deg, ${item.color}88, ${item.color}cc)`,
                              transition: 'width 0.3s ease',
                            }} 
                          />
                        </div>
                        <Text style={{ fontSize: 12, width: 50, textAlign: 'right', color: '#1890ff' }}>
                          {formatDuration(item.planMinutes)}
                        </Text>
                      </div>
                      
                      {/* 実績 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text type="secondary" style={{ fontSize: 11, width: 32 }}>実績</Text>
                        <div style={{ flex: 1, height: 16, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              width: `${resultWidth}%`, 
                              height: '100%', 
                              background: item.color,
                              transition: 'width 0.3s ease',
                            }} 
                          />
                        </div>
                        <Text style={{ fontSize: 12, width: 50, textAlign: 'right', color: '#52c41a' }}>
                          {formatDuration(item.resultMinutes)}
                        </Text>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Text type="secondary">データがありません</Text>
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
};
