import { Group, Panel, Separator, type GroupProps, type PanelProps, type SeparatorProps } from 'react-resizable-panels'

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      className={joinClasses('resizable-panel-group', className)}
      {...props}
    />
  )
}

export function ResizablePanel({ className, ...props }: PanelProps) {
  return (
    <Panel
      className={joinClasses(className)}
      {...props}
    />
  )
}

export function ResizableHandle({ className, ...props }: SeparatorProps) {
  return (
    <Separator
      className={joinClasses('resizable-handle', className)}
      {...props}
    >
      <span className="resizable-handle-grip" />
    </Separator>
  )
}
