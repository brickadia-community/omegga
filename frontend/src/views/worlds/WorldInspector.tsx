import { Button, Footer, Loader, Scroll, useConfirm } from '@components';
import { useStore } from '@nanostores/react';
import type { WorldRevisionsRes } from '@omegga/webserver/backend/api';
import { IconPlayerPlay, IconStar, IconStarOff } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { rpcReq } from '../../socket';
import { $liveness } from '../../stores/liveness';
import { $activeWorld, $nextWorld } from '../../stores/worlds';

export const WorldInspector = () => {
  const [_location, params] = useRoute('/worlds/*');
  const selectedWorld = params?.['*'];
  const [waiting, setWaiting] = useState(false);
  const nextWorld = useStore($nextWorld);
  const activeWorld = useStore($activeWorld);
  const liveness = useStore($liveness);

  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<WorldRevisionsRes | null>(null);
  const selectedWorldRef = useRef(selectedWorld);
  selectedWorldRef.current = selectedWorld;

  const confirm = useConfirm();

  // Load the revisions if the world is selected and the server is started
  // TODO: load revisions by parsing the brdb file
  useEffect(() => {
    if (!selectedWorld || !liveness.started) return;
    setLoading(true);
    setRevisions(null);
    rpcReq('world.revisions', selectedWorld).then(revs => {
      if (selectedWorldRef.current !== selectedWorld) return;
      setRevisions(revs?.reverse() ?? null);
      setLoading(false);
    });
  }, [selectedWorld, liveness.started]);

  const setWorldActive = async () => {
    if (!selectedWorld) return;
    setWaiting(true);
    const ok = await rpcReq('world.use', selectedWorld);
    if (ok) {
      $activeWorld.set(selectedWorld);
      $nextWorld.set(selectedWorld);
    }
    setWaiting(false);
  };

  const clearWorldActive = async () => {
    if (!selectedWorld) return;
    setWaiting(true);
    const ok = await rpcReq('world.use');
    if (ok) {
      const nextWorld = await rpcReq('world.next');
      const active = await rpcReq('world.active');
      $activeWorld.set(active);
      $nextWorld.set(nextWorld);
    }
    setWaiting(false);
  };

  const loadWorld = async (revision?: number) => {
    if (!selectedWorld) return;
    setWaiting(true);
    const ok = await rpcReq('world.load', selectedWorld, revision ?? null);
    // TODO: handle this status?
    console.info('world loaded', ok);
    setWaiting(false);
  };

  return (
    <div className="world-view">
      <div className="world-info">
        {selectedWorld && (
          <Scroll>
            <div className="stats">
              <div className="stat">
                <b data-tooltip="World name">Name:</b> {selectedWorld}
              </div>
              <div className="stat">
                <b data-tooltip="If yes, this world will be loaded on the next server start">
                  Is Default:
                </b>{' '}
                {activeWorld === selectedWorld ? 'Yes' : 'No'}
              </div>
              {nextWorld !== activeWorld && (
                <div className="stat">
                  <b data-tooltip="Whether this world is configured to load next start if no other default is specified">
                    Is Fallback World:
                  </b>{' '}
                  {nextWorld === selectedWorld ? 'Yes' : 'No'}
                </div>
              )}
              {/* TODO: parse the brdb */}
            </div>
            <div
              className="section-header"
              data-tooltip="Ways to configure the plugin. Changes take place the next time a plugin is loaded."
            >
              Revisions
            </div>
            <div className="revision-list">
              <Loader active={loading} size="huge">
                Loading World
              </Loader>
              {revisions?.length === 0 && (
                <div className="revision-item">
                  <i className="revision-note">
                    Something went wrong listing the revisions
                  </i>
                </div>
              )}
              {revisions === null && !loading && liveness.started && (
                <div className="revision-item">
                  <i className="revision-note">World might not exist</i>
                </div>
              )}
              {revisions?.map(r => (
                <div className="revision-item config" key={r.index}>
                  <div className="revision-index">{r.index}</div>
                  <div className="revision-note">
                    {r.note}
                    <div className="revision-date">
                      {new Date(r.date).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    icon
                    main
                    disabled={waiting || !liveness.started}
                    onClick={() =>
                      confirm
                        .prompt(
                          <p>
                            Are you sure you want to load revision {r.index} of{' '}
                            <b style={{ color: 'white' }}>{selectedWorld}</b>?
                            Unsaved work will be lost.
                          </p>,
                        )
                        .then(ok => {
                          ok && loadWorld(r.index);
                        })
                    }
                    data-tooltip={`Load revision ${r.index}`}
                  >
                    <IconPlayerPlay />
                  </Button>
                </div>
              ))}
            </div>
          </Scroll>
        )}
      </div>
      <Footer attached>
        {activeWorld !== selectedWorld && (
          <Button
            normal
            disabled={waiting || !selectedWorld}
            data-tooltip="Make this the default world for the server (on startup)"
            onClick={() => setWorldActive()}
          >
            <IconStar />
            Make Default
          </Button>
        )}
        {activeWorld === selectedWorld && (
          <Button
            warn
            disabled={waiting || !selectedWorld}
            data-tooltip="Remove this world as the default world for the server (on startup)"
            onClick={() => clearWorldActive()}
          >
            <IconStarOff />
            Clear Default
          </Button>
        )}
        <span style={{ flex: 1 }} />

        <Button
          main
          data-tooltip="Load this world immediately"
          disabled={waiting || !liveness.started || !selectedWorld}
          onClick={() =>
            confirm
              .prompt(
                <p>
                  Are you sure you want to load{' '}
                  <b style={{ color: 'white' }}>{selectedWorld}</b>? Unsaved
                  work will be lost.
                </p>,
              )
              .then(ok => {
                ok && loadWorld();
              })
          }
        >
          <IconPlayerPlay />
          Load
        </Button>
      </Footer>
      {confirm.children}
    </div>
  );
};
