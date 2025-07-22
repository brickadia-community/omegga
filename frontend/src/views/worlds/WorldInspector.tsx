import {
  Button,
  Dimmer,
  Footer,
  Loader,
  Scroll,
  SortIcons,
  useConfirm,
} from '@components';
import { useStore } from '@nanostores/react';
import type {
  WorldMetaRes,
  WorldRevisionsRes,
} from '@omegga/webserver/backend/api';
import { IconPlayerPlay, IconStar, IconStarOff } from '@tabler/icons-react';
import range from 'lodash/range';
import sortBy from 'lodash/sortBy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
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
  const [meta, setWorldMeta] = useState<WorldMetaRes | null>(null);
  const selectedWorldRef = useRef(selectedWorld);
  selectedWorldRef.current = selectedWorld;

  const confirm = useConfirm();

  // Load the revisions if the world is selected and the server is started
  // TODO: load revisions by parsing the brdb file
  useEffect(() => {
    if (!selectedWorld || !liveness.started) return;
    setLoading(true);
    setRevisions(null);
    Promise.all([
      rpcReq('world.revisions', selectedWorld),
      rpcReq('world.meta', selectedWorld),
    ]).then(([revs, meta]) => {
      if (selectedWorldRef.current !== selectedWorld) return;
      setRevisions(revs?.reverse() ?? null);
      setWorldMeta(meta ?? null);
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
                <b data-tooltip="World map">Map:</b>{' '}
                {meta?.meta.world.environment ?? 'Unknown'}
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
              data-tooltip="A list of all brick, component, or entity owners in this world."
            >
              Owners
            </div>
            <div className="owners-table">
              <MetaTable meta={meta} />
            </div>
            <div
              className="section-header"
              data-tooltip="A list of all the revisions made to this world. Click the buttons on the right to load a specific revision."
            >
              Revisions
            </div>
            <div className="revision-list">
              <Dimmer visible={loading}>
                <Loader active={loading} size="huge">
                  Loading World
                </Loader>
              </Dimmer>
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

const MetaTable = ({ meta }: { meta: WorldMetaRes | null }) => {
  const [_, navigate] = useLocation();

  const entities = useMemo(
    () =>
      Object.fromEntries(meta?.owners.map(owner => [owner.id, owner]) ?? []),
    [meta],
  );

  const sorted = useMemo(() => {
    const ids = Object.keys(entities);
    const display_name = sortBy(ids, id => entities[id].display_name);
    const brick_count = sortBy(ids, id => entities[id].brick_count);
    const component_count = sortBy(ids, id => entities[id].component_count);
    const entity_count = sortBy(ids, id => entities[id].entity_count);
    const wire_count = sortBy(ids, id => entities[id].wire_count);
    const reverse = range(ids.length).reverse();
    const inorder = range(ids.length);
    return {
      display_name,
      brick_count,
      component_count,
      entity_count,
      wire_count,
      reverse,
      inorder,
    };
  }, [meta]);

  const [sort, setSortInner] = useState('brick_count');
  const [direction, setDirection] = useState(-1);

  // update table sort direction
  const setSort = (s: string) => {
    // flip direction if it's the same column
    if (s == sort) {
      setDirection(d => d * -1);
    } else {
      // otherwise, use the new column
      setSortInner(s);
      // sort only name ascending on first click, all metrics are descending
      setDirection(s === 'display_name' ? 1 : -1);
    }
  };

  if (!meta) return null;

  return (
    <Scroll>
      <table className="br-table">
        <thead>
          <tr>
            <th
              style={{ textAlign: 'left', width: '100%' }}
              onClick={() => setSort('display_name')}
            >
              <span>
                Name
                <SortIcons
                  name="display_name"
                  sort={sort}
                  direction={direction}
                />
              </span>
            </th>
            <th onClick={() => setSort('brick_count')}>
              <span>
                Bricks
                <SortIcons
                  name="brick_count"
                  sort={sort}
                  direction={direction}
                />
              </span>
            </th>
            <th onClick={() => setSort('component_count')}>
              <span>
                Components
                <SortIcons
                  name="component_count"
                  sort={sort}
                  direction={direction}
                />
              </span>
            </th>
            <th onClick={() => setSort('entity_count')}>
              <span>
                Entities
                <SortIcons
                  name="entity_count"
                  sort={sort}
                  direction={direction}
                />
              </span>
            </th>
            <th onClick={() => setSort('wire_count')}>
              <span>
                Wires
                <SortIcons
                  name="wire_count"
                  sort={sort}
                  direction={direction}
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {meta?.owners.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center' }}>
                No owners found in this world
              </td>
            </tr>
          )}
          {(direction > 0 ? sorted.inorder : sorted.reverse).map(i => {
            const id = sorted[sort as keyof typeof sorted][i] as string;
            const owner = entities[id];

            if (!owner) return null; // skip if no owner found
            // skip if no bricks, components, entities, or wires
            if (
              owner.brick_count +
                owner.component_count +
                owner.entity_count +
                owner.wire_count ===
              0
            )
              return null;

            return (
              <tr onClick={() => navigate(`/players/${id}`)} key={id}>
                <td className={`player-name`}>
                  <div className="player-name-container">
                    <div>
                      <div
                        data-tooltip={
                          owner.display_name ? 'Display Name' : 'Username'
                        }
                      >
                        {owner.display_name ?? owner.name}
                      </div>
                      {owner.display_name && (
                        <div className="username" data-tooltip="Username">
                          {owner.name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {owner.brick_count.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {owner.component_count.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {owner.entity_count.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {owner.wire_count.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Scroll>
  );
};
