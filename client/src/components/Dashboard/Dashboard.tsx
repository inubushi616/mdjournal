import { Layout, ConfigProvider, theme as antTheme, Modal, Drawer, message } from 'antd';
import { useState, useRef, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';

import { DashboardHeader } from './DashboardHeader';
import { DashboardContext, type DashboardContextType } from './DashboardContext';
import { CalendarView } from '../Calendar';
import { TimelineView } from '../Timeline';
import { TodoView } from '../Todo';
import { ProjectView } from '../Project';
import { RoutineView } from '../Routine';
import { ReportEditor } from '../Editor';
import { useReport, useConfig, useCalendar, useUnsavedReports } from '../../hooks';
import { reportApi } from '../../api';
import type { RoutineItem, ScheduleItem } from '../../types';
import './Dashboard.css';

dayjs.locale('ja');

const { Content } = Layout;

export const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [editorOpen, setEditorOpen] = useState(false);
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  
  // カスタムフック
  const report = useReport(selectedDate.format('YYYY-MM-DD'));
  const config = useConfig();
  const calendar = useCalendar(selectedDate.year(), selectedDate.month() + 1);
  const unsavedReports = useUnsavedReports();
  
  // unsavedReportsの関数をrefで保持（依存関係による無限ループを防ぐ）
  const unsavedReportsRef = useRef(unsavedReports);
  unsavedReportsRef.current = unsavedReports;
  
  // 日付変更を追跡（日付変更直後のuseEffectをスキップするため）
  const lastSavedDateRef = useRef<string>(selectedDate.format('YYYY-MM-DD'));
  const isDateChangingRef = useRef(false);
  
  // 日付が変更された時にフラグを立てる
  useEffect(() => {
    const currentDate = selectedDate.format('YYYY-MM-DD');
    if (lastSavedDateRef.current !== currentDate) {
      isDateChangingRef.current = true;
      lastSavedDateRef.current = currentDate;
    }
  }, [selectedDate]);
  
  // 現在の日付のレポートが変更されたら未保存リストを更新
  // ただし、日付切り替え直後は（古いレポートのisDirtyが残っている可能性があるので）スキップ
  useEffect(() => {
    // 日付切り替え中はスキップし、次回からリセット
    if (isDateChangingRef.current) {
      isDateChangingRef.current = false;
      return;
    }
    
    const currentDate = selectedDate.format('YYYY-MM-DD');
    if (report.isDirty && report.report) {
      unsavedReportsRef.current.setUnsavedReport(
        currentDate,
        report.report,
        '', // originalMarkdown
        report.markdownContent
      );
    }
  }, [report.isDirty, report.report, report.markdownContent, selectedDate]);
  
  // リサイザー用の状態（ピクセル単位、nullは自動）
  const [timelineWidth, setTimelineWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleDateChange = useCallback(async (date: dayjs.Dayjs | null) => {
    if (date) {
      const newDateStr = date.format('YYYY-MM-DD');
      
      // 新しい日付に切り替え
      setSelectedDate(date);
      
      // カレンダーの月が変わった場合
      if (date.month() !== selectedDate.month() || date.year() !== selectedDate.year()) {
        calendar.loadCalendar(date.year(), date.month() + 1);
      }
      
      // 未保存の変更がある場合は先に取得
      const unsaved = unsavedReportsRef.current.getUnsavedReport(newDateStr);
      
      // レポートを読み込む
      await report.loadReport(newDateStr);
      
      // 未保存の変更がある場合は復元
      if (unsaved) {
        report.updateMarkdown(unsaved.currentMarkdown);
      }
    }
  }, [report, calendar, selectedDate]);

  const handleDateSelect = useCallback(async (dateStr: string) => {
    const date = dayjs(dateStr);
    setSelectedDate(date);
    
    // 未保存の変更がある場合は先に取得
    const unsaved = unsavedReportsRef.current.getUnsavedReport(dateStr);
    
    // レポートを読み込む
    await report.loadReport(dateStr);
    
    // 未保存の変更がある場合は復元
    if (unsaved) {
      report.updateMarkdown(unsaved.currentMarkdown);
    }
  }, [report]);

  // プロジェクトフィルタのトグル
  const handleToggleProject = useCallback((projectCode: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectCode)
        ? prev.filter(c => c !== projectCode)
        : [...prev, projectCode]
    );
  }, []);

  // プロジェクトフィルタのクリア
  const handleClearProjectFilter = useCallback(() => {
    setSelectedProjects([]);
  }, []);

  // 選択中のプロジェクトデータ一覧
  const selectedProjectsData = selectedProjects
    .map(code => config.getProject(code))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  // 日報保存
  const handleSaveReport = useCallback(async (options?: { git?: { commit?: boolean; push?: boolean }; slack?: { post?: boolean } }) => {
    const success = await report.saveReport(options);
    if (success) {
      // 保存成功時に未保存リストから削除
      unsavedReports.clearUnsavedReport(selectedDate.format('YYYY-MM-DD'));
      message.success('日報を保存しました');
      // カレンダーを更新
      calendar.loadCalendar(calendar.year, calendar.month);
    } else {
      message.error('日報の保存に失敗しました');
    }
  }, [report, calendar, unsavedReports, selectedDate]);

  // 複数レポート保存
  const handleSaveMultipleReports = useCallback(async (
    dates: string[],
    options?: { git?: { commit?: boolean; push?: boolean }; slack?: { post?: boolean } }
  ) => {
    let successCount = 0;
    let failCount = 0;
    
    for (const date of dates) {
      try {
        // 現在表示中の日付の場合
        if (date === selectedDate.format('YYYY-MM-DD')) {
          const success = await report.saveReport(options);
          if (success) {
            successCount++;
            unsavedReports.clearUnsavedReport(date);
          } else {
            failCount++;
          }
        } else {
          // 未保存レポートから取得
          const unsavedReport = unsavedReports.getUnsavedReport(date);
          if (unsavedReport) {
            const response = await reportApi.save(date, {
              content: unsavedReport.currentMarkdown,
              git: options?.git,
              slack: options?.slack,
            });
            if (response.saved) {
              successCount++;
              unsavedReports.clearUnsavedReport(date);
            } else {
              failCount++;
            }
          }
        }
      } catch {
        failCount++;
      }
    }
    
    if (successCount > 0) {
      message.success(`${successCount}件の日報を保存しました`);
      calendar.loadCalendar(calendar.year, calendar.month);
    }
    if (failCount > 0) {
      message.error(`${failCount}件の日報の保存に失敗しました`);
    }
  }, [report, selectedDate, unsavedReports, calendar]);

  // ルーチンを計画またはTODOに追加
  const handleApplyRoutine = useCallback((items: RoutineItem[]) => {
    // categoryがplanか、categoryが未設定で時間があるアイテムは計画（タイムライン）に追加
    const planItems = items.filter(r => r.category === 'plan' || (!r.category && r.time && r.time !== ''));
    // categoryがtodoか、categoryが未設定で時間がないアイテムはTODOに追加
    const todoItems = items.filter(r => r.category === 'todo' || (!r.category && (!r.time || r.time === '')));
    
    if (planItems.length > 0) {
      const scheduleItems: ScheduleItem[] = planItems.map((r, index) => ({
        id: `routine-${Date.now()}-${index}`,
        time: r.time!,
        project: r.project,
        task: r.task,
        duration: r.duration,
      }));
      report.applyRoutine(scheduleItems);
    }
    
    if (todoItems.length > 0) {
      todoItems.forEach((r) => {
        report.addTodo({
          project: r.project,
          task: r.task,
          status: 'pending',
        });
      });
    }
    
    setImportDrawerOpen(false);
  }, [report]);

  // リサイザーのドラッグ開始
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // 現在のタイムラインの幅を取得
    const timelineEl = containerRef.current?.firstElementChild as HTMLElement;
    if (!timelineEl || !containerRef.current) return;
    
    startXRef.current = e.clientX;
    startWidthRef.current = timelineEl.getBoundingClientRect().width;
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const deltaX = e.clientX - startXRef.current;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const rightColumnWidth = 296; // 右カラム280 + gap16
      const minWidth = 200;
      const maxWidth = containerWidth - rightColumnWidth - minWidth - 20; // TODO用の最小幅を確保
      
      let newWidth = startWidthRef.current + deltaX;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      setTimelineWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // コンテキスト値
  const contextValue: DashboardContextType = {
    selectedDate,
    setSelectedDate: handleDateChange,
    selectedProjects,
    toggleProject: handleToggleProject,
    clearProjectFilter: handleClearProjectFilter,
    report,
    config,
    calendar,
    unsavedReports,
    editorOpen,
    setEditorOpen,
    saveReport: handleSaveReport,
    saveMultipleReports: handleSaveMultipleReports,
  };

  return (
    <DashboardContext.Provider value={contextValue}>
      <ConfigProvider
        theme={{
          algorithm: antTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
          },
        }}
        locale={{
          locale: 'ja',
        }}
      >
        <Layout style={{ height: '100vh', overflow: 'hidden' }}>
          <DashboardHeader
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onImportClick={() => setImportDrawerOpen(true)}
            selectedProjects={selectedProjectsData}
            onRemoveProject={handleToggleProject}
            onClearProjectFilter={handleClearProjectFilter}
          />

          <Content
            className="dashboard-content"
            style={{
              padding: 16,
              background: '#f0f2f5',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Flex Layout: Timeline | Resizer | TODO | Calendar/Project */}
            <div
              ref={containerRef}
              className="dashboard-container"
            >
              {/* Left: Timeline */}
              <div 
                className="dashboard-timeline"
                style={{ 
                  width: timelineWidth ?? undefined,
                  flex: timelineWidth ? undefined : 1,
                }}
              >
                <TimelineView 
                  selectedDate={selectedDate}
                  onEditClick={() => setEditorOpen(true)}
                  selectedProjects={selectedProjects}
                />
              </div>

              {/* Resizer */}
              <div
                className="dashboard-resizer"
                onMouseDown={handleResizeStart}
              >
                <div className="dashboard-resizer-handle" />
              </div>

              {/* Center: TODO */}
              <div className="dashboard-todo">
                <TodoView 
                  selectedDate={selectedDate} 
                  selectedProjects={selectedProjects}
                />
              </div>

              {/* Right: Calendar & Project */}
              <div className="dashboard-right-column">
                {/* Calendar */}
                <div className="dashboard-calendar">
                  <CalendarView
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                    selectedProjects={selectedProjects}
                  />
                </div>

                {/* Project */}
                <div className="dashboard-project">
                  <ProjectView 
                    selectedProjects={selectedProjects}
                    onToggleProject={handleToggleProject}
                  />
                </div>
              </div>
            </div>
          </Content>

          {/* Editor Modal */}
          <Modal
            title={null}
            open={editorOpen}
            onCancel={() => setEditorOpen(false)}
            footer={null}
            width="90%"
            style={{ top: 20 }}
            styles={{
              body: { height: 'calc(100vh - 120px)', padding: 0 },
            }}
            destroyOnHidden
          >
            <ReportEditor
              selectedDate={selectedDate}
              onClose={() => setEditorOpen(false)}
            />
          </Modal>

          {/* Import Drawer (Routine) */}
          <Drawer
            title="ルーチンから取り込み"
            placement="right"
            size="large"
            onClose={() => setImportDrawerOpen(false)}
            open={importDrawerOpen}
          >
            <RoutineView onApplyRoutine={handleApplyRoutine} />
          </Drawer>

        </Layout>
      </ConfigProvider>
    </DashboardContext.Provider>
  );
};
