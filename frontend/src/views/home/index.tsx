import { Button, Header, NavHeader, PageContent, SideNav } from '@components';
import { useHasScope } from '@hooks';
import {
  IconApps,
  IconChevronDownRight,
  IconGauge,
  IconList,
  IconMessageDots,
  IconMinus,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import { Permissions } from '../../permissions';
import { ChatWidget, StatusWidget, UtilizationWidget } from '../../widgets';

const WIDGET_DEFS = {
  chat: {
    component: ChatWidget,
    icon: IconMessageDots,
    tooltip: 'Chat with online players',
    scope: Permissions.ChatRecent,
  },
  status: {
    component: StatusWidget,
    icon: IconList,
    tooltip: 'View current online players and server status',
    scope: Permissions.ServerStatus,
  },
  utilization: {
    component: UtilizationWidget,
    icon: IconGauge,
    tooltip: 'View CPU, memory, disk, and network usage',
    scope: Permissions.ServerUtilization,
  },
};
const DEFAULT_LAYOUT = [
  { x: 0, y: 0, w: 4, h: 4, i: 'chat' },
  { x: 4, y: 0, w: 4, h: 4, i: 'status' },
] satisfies Layout[];

const GRID_DATA = {
  minW: 2,
  maxW: 10,
  minH: 2,
  maxH: 10,
};
const GRID_MARGIN = [8, 8] as [number, number];

export const HomeView = () => {
  const canChat = useHasScope(Permissions.ChatRecent);
  const canStatus = useHasScope(Permissions.ServerStatus);
  const canUtil = useHasScope(Permissions.ServerUtilization);

  const allowedWidgets = useMemo(() => {
    const allowed: Record<string, boolean> = {};
    if (canChat) allowed.chat = true;
    if (canStatus) allowed.status = true;
    if (canUtil) allowed.utilization = true;
    return allowed;
  }, [canChat, canStatus, canUtil]);

  const hasAnyPermission = canChat || canStatus || canUtil;

  const WIDGET_LIST = useMemo(() => {
    const list: Record<string, (typeof WIDGET_DEFS)[keyof typeof WIDGET_DEFS]> =
      {};
    for (const [k, v] of Object.entries(WIDGET_DEFS)) {
      if (allowedWidgets[k]) list[k] = v;
    }
    return list;
  }, [allowedWidgets]);

  const [layout, setLayout] = useState<Layout[]>(() => {
    if (localStorage.omeggaDashLayout2) {
      try {
        const parsed = JSON.parse(localStorage.omeggaDashLayout2);
        return parsed;
      } catch (err) {
        console.error(
          'Invalid layout in localStorage, using default layout',
          err,
        );
        return DEFAULT_LAYOUT;
      }
    }
    return DEFAULT_LAYOUT;
  });

  const filteredLayout = useMemo(
    () => layout.filter(w => allowedWidgets[w.i]),
    [layout, allowedWidgets],
  );

  useEffect(() => {
    localStorage.omeggaDashLayout2 = JSON.stringify(layout);
  }, [layout]);

  const removeWidget = (widget: string) => {
    setLayout(layout.filter(w => w.i !== widget));
  };

  const addWidget = (widget: string) => {
    if (!(widget in WIDGET_LIST)) return;
    setLayout([
      ...layout,
      {
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        i: widget,
      },
    ]);
  };

  const [showWidgets, setShowWidgets] = useState(false);
  const hasWidget = Object.fromEntries(layout.map(w => [w.i, true]));
  const onLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef.current]);

  return (
    <>
      <NavHeader title="Dashboard">
        {hasAnyPermission && (
          <div className="widgets-container">
            <Button
              normal
              boxy
              data-tooltip="Add more widgets to the dashboard"
              onClick={() => setShowWidgets(!showWidgets)}
            >
              <IconApps />
              Widgets
            </Button>
            <div
              className="widgets-list"
              style={{ display: showWidgets ? 'block' : 'none' }}
            >
              {Object.entries(WIDGET_LIST).map(([k, widget]) => (
                <div key={k} className="widget-item">
                  <div className="name" data-tooltip={widget.tooltip}>
                    <widget.icon />
                    {k}
                  </div>
                  {hasWidget[k] ? (
                    <Button
                      warn
                      icon
                      data-tooltip={`Remove ${k} widget`}
                      onClick={() => removeWidget(k)}
                    >
                      <IconMinus />
                    </Button>
                  ) : (
                    <Button
                      main
                      icon
                      data-tooltip={`Add ${k} widget`}
                      onClick={() => addWidget(k)}
                    >
                      <IconPlus />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="grid-container" ref={containerRef}>
          {!hasAnyPermission && (
            <div className="no-permissions-message">
              Contact your admin for support
            </div>
          )}
          {hasAnyPermission && width !== null && (
            <GridLayout
              layout={filteredLayout.map(l => ({ ...l, ...GRID_DATA }))}
              width={width}
              cols={10}
              autoSize
              useCSSTransforms={true}
              rowHeight={100}
              isBounded={true}
              isResizable={true}
              isDraggable={true}
              margin={GRID_MARGIN}
              onLayoutChange={onLayoutChange}
              draggableHandle=".drag-handle"
              draggableCancel=".no-drag"
              resizeHandles={['se']}
              resizeHandle={
                <IconChevronDownRight
                  style={{ cursor: 'se-resize' }}
                  className="resize-handle"
                />
              }
            >
              {filteredLayout.map(item => {
                const Component =
                  WIDGET_LIST[item.i as keyof typeof WIDGET_LIST]?.component;
                if (!Component) return null;
                return (
                  <div key={item.i} className="grid-item">
                    <Header className="drag-handle">
                      <span style={{ flex: 1 }}>{item.i}</span>
                      <Button
                        icon
                        error
                        className="no-drag"
                        data-tooltip="Close widget"
                        onClick={() => removeWidget(item.i)}
                      >
                        <IconX />
                      </Button>
                    </Header>
                    <div className="drag-contents">
                      <Component />
                    </div>
                  </div>
                );
              })}
            </GridLayout>
          )}
        </div>
      </PageContent>
    </>
  );
};
