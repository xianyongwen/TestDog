import { createContext, useContext, useMemo } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { HolderOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// ---- 拖拽排序（@dnd-kit）----
// 通过 context 把 useSortable 的 listeners 透传给行内的拖拽手柄，
// 这样只有手柄可发起拖拽，行内的输入框/下拉框/链接仍可正常交互。
type Sortable = ReturnType<typeof useSortable>;
const DragHandleCtx = createContext<Pick<Sortable, 'setActivatorNodeRef' | 'listeners'> | null>(null);

function DragHandle() {
  const { t } = useTranslation();
  const ctx = useContext(DragHandleCtx);
  return (
    <span
      title={t('projectCases.dragSort')}
      ref={ctx?.setActivatorNodeRef}
      {...ctx?.listeners}
      className="inline-flex cursor-grab touch-none text-ink-3"
    >
      <HolderOutlined />
    </span>
  );
}

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key'?: string;
}

const SortableRow = ({ 'data-row-key': id, style, ...rest }: RowProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: id ?? '' });
  const rowStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: 'var(--tk-accent-subtle)' } : {}),
  };
  return (
    <DragHandleCtx.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr ref={setNodeRef} data-row-key={id} style={rowStyle} {...attributes} {...rest} />
    </DragHandleCtx.Provider>
  );
};

export interface SortableTableProps<RecordType = any> extends TableProps<RecordType> {
  /** 开启拖拽排序：自动注入拖拽手柄列并启用 DndContext/SortableContext。默认 false。 */
  sortable?: boolean;
  /** 拖拽结束回调，参数为 active/over 行的 rowKey。开启 sortable 后必传。 */
  onSortEnd?: (activeKey: string | number, overKey: string | number) => void;
  /** 自定义拖拽手柄列（默认 36px 居中的 HolderOutlined 手柄）。 */
  dragHandleColumn?: ColumnsType<RecordType>[number];
}

/** 按 antd rowKey 规则从记录中提取行 key，用于 SortableContext items（需与 data-row-key 一致）。 */
function getRowKey<RecordType>(rowKey: TableProps<RecordType>['rowKey'], record: RecordType, index: number): string | number {
  const key = typeof rowKey === 'function'
    ? (rowKey as (r: RecordType, i: number) => React.Key)(record, index)
    : typeof rowKey === 'string'
      ? (record as Record<string, unknown>)?.[rowKey] as React.Key
      : (record as Record<string, unknown>)?.['key'] as React.Key;
  return typeof key === 'bigint' ? index : (key as string | number);
}

/**
 * 通用表格：透传 antd Table 全部 props，默认 bordered + 无分页；
 * 传 sortable 后自动提供拖拽排序能力（手柄列、DndContext、SortableRow）。
 */
export default function SortableTable<RecordType extends object>(props: SortableTableProps<RecordType>) {
  const {
    sortable = false,
    onSortEnd,
    dragHandleColumn,
    columns,
    dataSource = [],
    rowKey,
    components,
    bordered,
    pagination,
    ...rest
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = useMemo(
    () => (dataSource ?? []).map((r, i) => getRowKey(rowKey, r, i)),
    [dataSource, rowKey],
  );

  const mergedColumns = useMemo<ColumnsType<RecordType>>(() => {
    const base = columns ? [...columns] : [];
    if (!sortable) return base;
    return [
      dragHandleColumn ?? { title: '', width: 36, align: 'center', render: () => <DragHandle /> },
      ...base,
    ];
  }, [columns, sortable, dragHandleColumn]);

  const table = (
    <Table<RecordType>
      {...rest}
      bordered={bordered ?? true}
      columns={mergedColumns}
      dataSource={dataSource}
      size='small'
      rowKey={rowKey}
      pagination={pagination ?? false}
      components={sortable ? { ...components, body: { row: SortableRow } } : components}
    />
  );

  if (!sortable) return table;

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onSortEnd?.(active.id, over.id);
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {table}
      </SortableContext>
    </DndContext>
  );
}
