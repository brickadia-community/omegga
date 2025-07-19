import {
  Button,
  Dropdown,
  Input,
  Loader,
  NavBar,
  NavHeader,
  PageContent,
  Scroll,
  SideNav,
  useConfirm,
} from '@components';
import { useStore } from '@nanostores/react';
import {
  IconCaretDown,
  IconCaretUp,
  IconClipboardPlus,
  IconDeviceFloppy,
  IconPlus,
  IconRotate,
  IconSettingsStar,
  IconStar,
  IconStarOff,
  IconWorld,
  IconWorldPlus,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { rpcReq } from '../../socket';
import { useServerLiveness } from '../../stores/liveness';
import { $activeWorld, $nextWorld } from '../../stores/worlds';
import { WorldInspector } from './WorldInspector';

const MAP_OPTIONS = ['Plate', 'Space', 'Studio', 'Peaks'];

export const WorldList = () => {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [worlds, setWorlds] = useState<string[]>([]);
  const [waiting, setWaiting] = useState(false);
  const nextWorld = useStore($nextWorld);
  const activeWorld = useStore($activeWorld);
  const [showWidgets, setShowWidgets] = useState(false);

  const liveness = useServerLiveness();

  const [_location, params] = useRoute('/worlds/*?');
  const selectedWorld = params?.['*'];

  const getWorlds = async () => {
    setLoading(true);
    const [worlds, active, next] = await Promise.all([
      rpcReq('world.list'),
      rpcReq('world.active'),
      rpcReq('world.next'),
    ]);
    setWorlds(worlds);
    $activeWorld.set(active);
    $nextWorld.set(next);
    setLoading(false);
  };
  useEffect(() => {
    getWorlds();
  }, []);

  const clearActiveWorld = async () => {
    setWaiting(true);
    const ok = await rpcReq('world.use', null);
    if (ok) {
      $activeWorld.set(null);
      const next = await rpcReq('world.next');
      $nextWorld.set(next);
    }
    setWaiting(false);
  };

  const saveWorld = async () => {
    setWaiting(true);
    await rpcReq('world.save');
    setWaiting(false);
  };

  const saveWorldAs = async (name: string) => {
    setWaiting(true);
    await rpcReq('world.save', name);
    setWaiting(false);
    getWorlds();
  };

  const createWorld = async (name: string, map: string) => {
    setWaiting(true);
    await rpcReq('world.create', name, map);
    setWaiting(false);
    getWorlds();
  };

  const matches = (w: string) => w.toLowerCase().includes(search.toLowerCase());
  const [worldName, setWorldName] = useState<string | null>(null);
  const saveAsConfirm = useConfirm<string | null>({
    title: 'Save World As',
    content: (
      <>
        <p>Enter a name for the new world</p>
        <p>
          <Input
            type="text"
            placeholder="World Name"
            value={worldName ?? ''}
            onChange={s => setWorldName(s)}
          />
        </p>
      </>
    ),
    leftButton: done => (
      <Button normal onClick={() => done(null)}>
        <IconX />
        Cancel
      </Button>
    ),
    rightButton: done => (
      <Button disabled={!worldName} main onClick={() => done(worldName)}>
        <IconPlus />
        Save As
      </Button>
    ),
  });
  const [newMap, setNewMap] = useState<string>('Plate');
  const newMapConfirm = useConfirm<{ name: string; map: string } | null>({
    title: 'Create New World',
    content: (
      <>
        <p>Select a name and map for the new world</p>
        <p>
          <Input
            type="text"
            placeholder="World Name"
            value={worldName ?? ''}
            onChange={s => setWorldName(s)}
          />
        </p>
        <p>
          <Dropdown
            value={newMap}
            options={MAP_OPTIONS}
            onChange={v => setNewMap(v as string)}
          />
        </p>
      </>
    ),
    leftButton: done => (
      <Button normal onClick={() => done(null)}>
        <IconX />
        Cancel
      </Button>
    ),
    rightButton: done => (
      <Button
        disabled={!worldName}
        main
        onClick={() => done({ name: worldName!, map: newMap })}
      >
        <IconPlus />
        Create
      </Button>
    ),
  });

  return (
    <>
      <NavHeader title="Worlds">
        <div className="widgets-container worlds">
          <Button
            normal
            boxy
            data-tooltip="Show more world actions"
            onClick={() => setShowWidgets(!showWidgets)}
          >
            {showWidgets ? <IconCaretUp /> : <IconCaretDown />}
            Actions
          </Button>
          <div
            className="widgets-list"
            style={{ display: showWidgets ? 'block' : 'none' }}
          >
            <Button
              info
              disabled={waiting || !liveness.started}
              data-tooltip="Save the currently loaded world"
              onClick={() => {
                setShowWidgets(false);
                saveWorld();
              }}
            >
              <IconDeviceFloppy />
              Save World
            </Button>
            <Button
              normal
              disabled={waiting || !liveness.started}
              data-tooltip="Save a copy of the currently loaded world"
              onClick={() => {
                setShowWidgets(false);
                setWorldName(null);
                saveAsConfirm.prompt().then(name => {
                  name && saveWorldAs(name);
                });
              }}
            >
              <IconClipboardPlus />
              Save As
            </Button>
            <Button
              main
              disabled={waiting || !liveness.started}
              data-tooltip="Create a new world"
              onClick={() => {
                setShowWidgets(false);
                setWorldName(null);
                setNewMap('Plate');
                newMapConfirm.prompt().then(data => {
                  if (data) {
                    createWorld(data.name, data.map);
                  }
                });
              }}
            >
              <IconWorldPlus />
              New World
            </Button>
            <Button
              normal={activeWorld === null}
              warn={activeWorld !== null}
              disabled={waiting || !activeWorld}
              data-tooltip="Remove the default world for the server (on startup)"
              onClick={() => {
                setShowWidgets(false);
                clearActiveWorld();
              }}
            >
              <IconStarOff />
              Clear Default
            </Button>
          </div>
        </div>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container worlds-container">
          <div className="worlds-list-container">
            <NavBar>
              <Input
                type="text"
                placeholder="Search Worlds..."
                value={search}
                onChange={s => setSearch(s)}
              />
              <span style={{ flex: 1 }} />
              <Button
                icon
                normal
                data-tooltip="Refresh world list"
                onClick={getWorlds}
              >
                <IconRotate />
              </Button>
            </NavBar>
            <div className="worlds-list">
              <Scroll>
                {worlds.map(
                  w =>
                    matches(w) && (
                      <Link
                        href={'/worlds/' + w}
                        key={w}
                        className={`world-item ${
                          w === selectedWorld ? 'selected' : ''
                        } ${w === activeWorld ? 'next' : ''}`}
                        data-tooltip={
                          w === activeWorld
                            ? 'This world will load when the server starts'
                            : ''
                        }
                      >
                        {w === activeWorld ? (
                          <IconStar className="world-item-active" />
                        ) : !activeWorld && w === nextWorld ? (
                          <IconSettingsStar className="world-item-next" />
                        ) : (
                          <IconWorld />
                        )}
                        {w}
                      </Link>
                    ),
                )}
              </Scroll>
              <Loader active={loading} size="huge">
                Loading Worlds
              </Loader>
            </div>
          </div>
          <div className="world-inspector-container">
            <NavBar attached>{selectedWorld ?? 'SELECT A WORLD'}</NavBar>
            <div className="world-inspector">
              <WorldInspector />
            </div>
          </div>
        </div>
      </PageContent>
      {saveAsConfirm.children}
      {newMapConfirm.children}
    </>
  );
};
