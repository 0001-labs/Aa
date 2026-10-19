export type Cleanup = () => void;

export type DragKind = 'element';

export type DragData = Record<PropertyKey, unknown>;

export type NativeDragData = Record<string, string>;

export type DropEffect = 'copy' | 'move' | 'link';

export type DragInput = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
};

export type DropTargetRecord = {
  element: HTMLElement;
  kind: DragKind;
  data: DragData;
  dropEffect: DropEffect;
};

export type DragLocation = {
  input: DragInput;
  dropTargets: DropTargetRecord[];
};

export type DragLocationHistory = {
  initial: DragLocation;
  current: DragLocation;
  previous: Pick<DragLocation, 'dropTargets'>;
};

export type ElementDragSource = {
  element: HTMLElement;
  dragHandle: HTMLElement | null;
  data: DragData;
};

export type DragEventPayload<Source = ElementDragSource> = {
  sessionId: string;
  kind: DragKind;
  source: Source;
  location: DragLocationHistory;
  nativeEvent: DragEvent;
  nativeSetDragImage: DataTransfer['setDragImage'] | null;
};

export type DragFeedbackArgs = {
  input: DragInput;
  nativeEvent: DragEvent;
};

export type ElementDragEventPayload = DragEventPayload<ElementDragSource>;

export type DragLifecycle = {
  onGenerateDragPreview?: (payload: ElementDragEventPayload) => void;
  onDragStart?: (payload: ElementDragEventPayload) => void;
  onDropTargetChange?: (payload: ElementDragEventPayload) => void;
  onDragEnter?: (payload: ElementDragEventPayload) => void;
  onDragLeave?: (payload: ElementDragEventPayload) => void;
  onDrag?: (payload: ElementDragEventPayload) => void;
  onDrop?: (payload: ElementDragEventPayload) => void;
};

export type DraggableArgs = DragLifecycle & {
  element: HTMLElement;
  dragHandle?: HTMLElement | null;
  canDrag?: (args: DragFeedbackArgs) => boolean;
  getData?: (args: DragFeedbackArgs) => DragData;
  getNativeData?: (args: DragFeedbackArgs) => NativeDragData;
};

export type DropTargetArgs = DragLifecycle & {
  element: HTMLElement;
  canDrop?: (payload: ElementDragEventPayload) => boolean;
  getData?: (payload: ElementDragEventPayload) => DragData;
  getDropEffect?: (payload: ElementDragEventPayload) => DropEffect;
  getIsSticky?: (payload: ElementDragEventPayload) => boolean;
};

export type MonitorArgs = DragLifecycle & {
  canMonitor?: (payload: ElementDragEventPayload) => boolean;
};
