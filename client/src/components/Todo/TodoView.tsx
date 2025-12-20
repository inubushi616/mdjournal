/**
 * TODOビューコンポーネント
 * TODOリストの表示・管理
 */

import { Card, Space, Typography, List, Badge, Input, Button, message, Divider } from 'antd';
import {
  CheckSquareOutlined,
  EditOutlined,
  WarningOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '../Dashboard/DashboardContext';
import type { TodoItem } from '../../types';
import { TodoItemComponent } from './TodoItem';
import { TodoTabBar, type FilterType } from './TodoTabBar';
import { generateTodoMarkdown, parseTodoMarkdown, isOverdue } from '../../models';

const { Text } = Typography;
const { TextArea } = Input;

interface TodoViewProps {
  selectedDate: dayjs.Dayjs;
  selectedProjects?: string[];
}

import dayjs from 'dayjs';

export const TodoView = ({ selectedProjects = [] }: TodoViewProps) => {
  const { report, config } = useDashboard();
  
  const [filter, setFilter] = useState<FilterType>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editDeadline, setEditDeadline] = useState<string | undefined>(undefined);
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low' | undefined>(undefined);
  
  // 現在の日報データ
  const currentReport = report.report;
  const allTodos = currentReport?.todos || [];
  const projects = config.projects;
  
  // NOTE（メモ）の状態
  const [notes, setNotes] = useState(currentReport?.notes || '');

  // Markdown編集用のテキスト
  const [todoMarkdown, setTodoMarkdown] = useState('');
  
  // 日報データが変更されたら状態を更新
  useEffect(() => {
    if (currentReport) {
      setNotes(currentReport.notes || '');
      setTodoMarkdown(generateTodoMarkdown(currentReport.todos, currentReport.notes || ''));
    }
  }, [currentReport]);
  
  // NOTE変更時に日報を更新
  useEffect(() => {
    if (currentReport && notes !== currentReport.notes) {
      report.updateNotes(notes);
    }
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const getProjectColor = (projectCode: string) => {
    return config.getProjectColor(projectCode);
  };

  const getProjectName = (projectCode: string) => {
    return config.getProjectName(projectCode);
  };

  // プロジェクトフィルタ適用後のTODO（複数選択対応）
  const projectFilteredTodos = selectedProjects.length > 0
    ? allTodos.filter(todo => selectedProjects.includes(todo.project))
    : allTodos;

  // フィルタリング
  const filteredTodos = projectFilteredTodos.filter((todo) => {
    if (filter !== 'all' && todo.status !== filter) return false;
    return true;
  });

  // 持ち越しTODO（期限切れの未完了TODO）- 現在表示中のTODOから計算
  const carryOverTodos = filteredTodos.filter(
    (todo) => todo.deadline && isOverdue(todo.deadline) && todo.status !== 'completed'
  );

  // プロジェクト別にグルーピング
  const groupedTodos = filteredTodos.reduce(
    (acc, todo) => {
      const key = todo.project;
      if (!acc[key]) acc[key] = [];
      acc[key].push(todo);
      return acc;
    },
    {} as Record<string, TodoItem[]>
  );

  // ステータス変更
  const handleStatusChange = (todoId: string) => {
    report.toggleTodoStatus(todoId);
  };

  // プロジェクト変更
  const handleChangeProject = (todoId: string, projectCode: string) => {
    report.updateTodo(todoId, { project: projectCode });
    message.success(`プロジェクトを ${projectCode} に変更しました`);
  };

  // 削除
  const handleDelete = (todoId: string) => {
    report.deleteTodo(todoId);
    message.success('TODOを削除しました');
  };

  // インライン編集開始
  const handleStartEdit = (todo: TodoItem) => {
    setEditingTodo(todo.id);
    const text = todo.description 
      ? `${todo.task}\n${todo.description}`
      : todo.task;
    setEditText(text);
    setEditDeadline(todo.deadline);
    setEditPriority(todo.priority);
  };

  // インライン編集保存
  const handleSaveEdit = () => {
    if (editingTodo) {
      const lines = editText.split('\n');
      const task = lines[0].trim();
      const description = lines.slice(1).join('\n').trim() || undefined;
      
      report.updateTodo(editingTodo, { 
        task,
        description,
        deadline: editDeadline,
        priority: editPriority,
      });
      message.success('更新しました');
      setEditingTodo(null);
      setEditText('');
      setEditDeadline(undefined);
      setEditPriority(undefined);
    }
  };

  // インライン編集キャンセル
  const handleCancelEdit = () => {
    setEditingTodo(null);
    setEditText('');
    setEditDeadline(undefined);
    setEditPriority(undefined);
  };

  // アイテムメニュー用ハンドラ
  const handleMenuAction = useCallback((key: string, todo: TodoItem) => {
    if (key === 'edit') {
      handleStartEdit(todo);
    } else if (key.startsWith('project:')) {
      const parts = key.split(':');
      const todoId = parts[1];
      const projectCode = parts[2];
      handleChangeProject(todoId, projectCode);
    } else if (key === 'delete') {
      handleDelete(todo.id);
    }
  }, [handleChangeProject]);

  // カウント（プロジェクトフィルタ適用後）
  const counts = {
    all: projectFilteredTodos.length,
    pending: projectFilteredTodos.filter((t) => t.status === 'pending').length,
    in_progress: projectFilteredTodos.filter((t) => t.status === 'in_progress').length,
    completed: projectFilteredTodos.filter((t) => t.status === 'completed').length,
    on_hold: projectFilteredTodos.filter((t) => t.status === 'on_hold').length,
  };

  // 編集モード切替
  const handleToggleEdit = () => {
    if (!isEditing && currentReport) {
      setTodoMarkdown(generateTodoMarkdown(currentReport.todos, currentReport.notes || ''));
    }
    setIsEditing(!isEditing);
  };

  const handleSaveMarkdown = () => {
    const { todos, notes: parsedNotes } = parseTodoMarkdown(todoMarkdown);
    report.updateTodos(todos);
    report.updateNotes(parsedNotes);
    setNotes(parsedNotes);
    message.success('反映しました');
    setIsEditing(false);
  };

  return (
    <Card
      title={
        <Space>
          <CheckSquareOutlined />
          <span>TODO</span>
          <Badge count={counts.pending + counts.in_progress} style={{ backgroundColor: '#1890ff' }} />
          {carryOverTodos.length > 0 && (
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 4, 
              marginLeft: 8,
              padding: '2px 8px',
              backgroundColor: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: 4,
              fontSize: 11,
              color: '#d46b08',
            }}>
              <WarningOutlined />
              <span>{carryOverTodos.length}件期限切れ</span>
            </span>
          )}
        </Space>
      }
      extra={
        isEditing ? (
          <Space>
            <Button size="small" icon={<CloseOutlined />} onClick={() => setIsEditing(false)}>
              キャンセル
            </Button>
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleSaveMarkdown}>
              OK
            </Button>
          </Space>
        ) : (
          <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleToggleEdit}>
            編集
          </Button>
        )
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: 0, height: 'calc(100% - 57px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      {isEditing ? (
        /* Markdown編集モード */
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column' }}>
          <Text type="secondary" style={{ marginBottom: 8, fontSize: 11 }}>
            TODO: - [ ] タスク名 @期日 !優先度 ／ NOTE: ## [NOTE] 以降に自由記述
          </Text>
          <TextArea
            value={todoMarkdown}
            onChange={(e) => setTodoMarkdown(e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      ) : (
        <>
          {/* タブバー */}
          <TodoTabBar filter={filter} counts={counts} onFilterChange={setFilter} />

          {/* TODOリスト */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 12px 12px' }}>
            {Object.entries(groupedTodos).map(([key, todos]) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                    padding: '6px 10px',
                    background: '#f5f5f5',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: getProjectColor(key),
                      flexShrink: 0,
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 10 }}>[{key}]</Text>
                  <Text strong style={{ fontSize: 12 }}>{getProjectName(key)}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>({todos.length})</Text>
                </div>
                <List
                  dataSource={todos}
                  renderItem={(todo) => (
                    <TodoItemComponent
                      key={todo.id}
                      todo={todo}
                      isHovered={hoveredItem === todo.id}
                      isEditing={editingTodo === todo.id}
                      editText={editText}
                      editDeadline={editDeadline}
                      editPriority={editPriority}
                      projects={projects}
                      getProjectColor={getProjectColor}
                      onHover={setHoveredItem}
                      onStatusChange={handleStatusChange}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onEditTextChange={setEditText}
                      onEditDeadlineChange={setEditDeadline}
                      onEditPriorityChange={setEditPriority}
                      onMenuAction={handleMenuAction}
                    />
                  )}
                  size="small"
                  split={false}
                />
              </div>
            ))}

            {/* NOTE（メモ）セクション */}
            <Divider style={{ margin: '16px 0 12px 0' }} />
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Space>
                  <FileTextOutlined style={{ color: '#666' }} />
                  <Text strong style={{ fontSize: 12 }}>NOTE</Text>
                </Space>
              </div>
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoSize={{ minRows: 3, maxRows: 8 }}
                placeholder="メモを入力..."
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
