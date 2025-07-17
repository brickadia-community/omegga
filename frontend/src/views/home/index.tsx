import { Button, Header, NavHeader, PageContent, SideNav } from '@components';
import {
  IconApps,
  IconChevronDownRight,
  IconList,
  IconMessageDots,
  IconMinus,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import { ChatWidget, StatusWidget } from '../../widgets';

const WIDGET_LIST = {
  chat: {
    component: ChatWidget,
    icon: IconMessageDots,
    tooltip: 'Chat with online players',
  },
  status: {
    component: StatusWidget,
    icon: IconList,
    tooltip: 'View current online players and server status',
  },
};
const DEFAULT_LAYOUT = [
  { x: 0, y: 0, w: 2, h: 2, i: 'chat' },
  { x: 2, y: 0, w: 2, h: 2, i: 'status' },
] satisfies Layout[];

export const HomeView = () => {
  const [layout, setLayout] = useState<Layout[]>(() => {
    if (localStorage.omeggaDashLayout2) {
      try {
        return JSON.parse(localStorage.omeggaDashLayout2);
      } catch (err) {
        console.error(
          'Invalid layout in localStorage, using default layout',
          err
        );
        return DEFAULT_LAYOUT;
      }
    }
    return DEFAULT_LAYOUT;
  });
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
        w: 2,
        h: 2,
        i: widget,
      },
    ]);
  };

  const [showWidgets, setShowWidgets] = useState(true);
  const hasWidget = Object.fromEntries(layout.map(w => [w.i, true]));

  return (
    <>
      <NavHeader title="Dashboard">
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
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="grid-container">
          <GridLayout
            layout={layout}
            cols={5}
            rowHeight={100}
            isDraggable
            isResizable
            verticalCompact={false}
            margin={[8, 8]}
            useCSSTransforms
            onLayoutChange={newLayout => setLayout(newLayout)}
            draggableHandle=".drag-handle"
            draggableCancel=".no-drag"
            resizeHandle={() => (
              <IconChevronDownRight className="resize-handle" />
            )}
          >
            {layout.map(item => {
              const Component =
                WIDGET_LIST[item.i as keyof typeof WIDGET_LIST]!.component;
              return (
                <div
                  key={item.i}
                  data-grid={{ minW: 2, maxW: 10, minH: 2, maxH: 10 }}
                >
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
        </div>
      </PageContent>
    </>
  );
};
