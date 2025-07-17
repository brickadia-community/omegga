import {
  Button,
  Footer,
  Input,
  Loader,
  NavBar,
  NavHeader,
  PageContent,
  Scroll,
  SideNav,
  SortIcons,
  Toggle,
} from '@components';
import type { GetPlayersRes } from '@omegga/webserver/backend/api';
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconFilter,
  IconMapPin,
  IconRotate,
} from '@tabler/icons-react';
import { debounce, duration, heartbeatAgo } from '@utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { rpcReq } from '../../socket';
import { PlayerInspector } from './PlayerInspector';

export const PlayerList = () => {
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [players, setPlayers] = useState<GetPlayersRes['players']>([]);

  const [_location, navigate] = useLocation();
  const [_match, params] = useRoute('/players/:id?');

  const query = useRef({
    page: 0,
    search: '',
    sort: 'lastSeen',
    direction: -1,
    filterBanned: false,
  });
  const { page, search, sort, direction, filterBanned } = query.current;
  const [_searchKey, setSearchKey] = useState(0);
  const setSearch = (search: string) => {
    query.current.search = search;
    doSearch();
    setSearchKey(k => k + 1);
  };
  const setPage = (page: number | ((old: number) => number)) => {
    if (typeof page === 'function') page = page(query.current.page);
    query.current.page = page;
    getPlayers();
  };
  const setDirection = (dir: number | ((old: number) => number)) => {
    if (typeof dir === 'function') dir = dir(query.current.direction);
    query.current.direction = dir;
  };
  const setFilterBanned = (filter: boolean) => {
    query.current.filterBanned = filter;
    doSearch();
  };

  const getPlayers = useCallback(async () => {
    setLoading(true);
    const { page, search, sort, direction, filterBanned } = query.current;
    const { players, total, pages }: GetPlayersRes = await rpcReq(
      'players.list',
      {
        page,
        search,
        sort,
        direction,
        filter: filterBanned ? 'banned' : '',
      },
    );
    setPages(pages);
    setTotal(total);
    setPlayers(players);
    setLoading(false);
  }, []);

  useEffect(() => {
    getPlayers();
  }, []);

  const doSearch = useMemo(
    () =>
      debounce(() => {
        query.current.page = 0;
        getPlayers();
      }, 500),
    [],
  );

  // update table sort direction
  const setSort = (s: string) => {
    // flip direction if it's the same column
    if (s == sort) {
      setDirection(d => d * -1);
    } else {
      // otherwise, use the new column
      query.current.sort = s;
      // sort only name ascending on first click, all metrics are descending
      setDirection(s === 'name' ? 1 : -1);
    }
    getPlayers();
  };

  return (
    <>
      <NavHeader title="Players">
        <div className="widgets-container">
          <Button
            normal
            boxy
            data-tooltip="Player list filters"
            onClick={() => setShowFilters(f => !f)}
          >
            <IconFilter />
            Filters
          </Button>
          <div
            className="widgets-list"
            style={{ display: showFilters ? 'block' : 'none' }}
          >
            <div
              className="widget-item"
              data-tooltip="Filter by banned players"
            >
              <div className="name">
                <IconBan />
                Banned
              </div>
              <Toggle onChange={setFilterBanned} value={filterBanned} />
            </div>
          </div>
        </div>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container players-container">
          <div className="player-table-container">
            <NavBar attached>
              <Input
                type="text"
                placeholder="Search Players..."
                value={search}
                onChange={setSearch}
              />
              <span style={{ flex: 1 }} />
              <Button
                icon
                normal
                data-tooltip="Refresh player list"
                onClick={getPlayers}
              >
                <IconRotate />
              </Button>
            </NavBar>
            <div className="players-list">
              <Scroll>
                <table className="br-table">
                  <thead>
                    <tr>
                      <th
                        style={{ textAlign: 'left', width: '100%' }}
                        onClick={() => setSort('name')}
                      >
                        <span>
                          Name
                          <SortIcons
                            name="name"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('heartbeats')}
                        data-tooltip="Number of heartbeats the player has been part of (minutely)"
                      >
                        <span>
                          Played
                          <SortIcons
                            name="heartbeats"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('lastSeen')}
                        data-tooltip="When the player was last seen"
                      >
                        <span>
                          Seen
                          <SortIcons
                            name="lastSeen"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('created')}
                        data-tooltip="When the player joined"
                      >
                        <span>
                          Joined
                          <SortIcons
                            name="created"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('sessions')}
                        data-tooltip="Number of Visits"
                      >
                        <span className="icon-cell">
                          <IconMapPin className="label" size="30" />
                          <SortIcons
                            name="sessions"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(player => (
                      <tr
                        onClick={() => navigate(`/players/${player.id}`)}
                        className={player.id === params?.id ? 'active' : ''}
                        key={player.id}
                      >
                        <td className={player.ban ? 'ban' : ''}>
                          {player.name}
                          {player.ban && <IconBan size="18" />}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {heartbeatAgo(player.heartbeats)}
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(player.lastSeen)}
                        >
                          {duration(player.seenAgo)}
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(player.created)}
                        >
                          {duration(player.createdAgo)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {player.sessions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
              <Footer className="pagination-footer">
                <Button
                  icon
                  normal
                  disabled={page === 0}
                  onClick={() => {
                    setPage(0);
                  }}
                >
                  <IconArrowBarToLeft />
                </Button>
                <Button
                  icon
                  normal
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  <IconArrowLeft />
                </Button>
                <div className="current-page">
                  <div>
                    Page {page + 1} of {pages}
                  </div>
                  <div>
                    Showing {players.length} of {total}
                  </div>
                </div>
                <Button
                  icon
                  normal
                  disabled={page >= pages - 1}
                  onClick={() =>
                    setPage(p => Math.min(players.length - 1, p + 1))
                  }
                >
                  <IconArrowRight />
                </Button>
                <Button
                  icon
                  normal
                  disabled={page >= pages - 1}
                  onClick={() => setPage(players.length - 1)}
                >
                  <IconArrowBarToRight />
                </Button>
              </Footer>
              <Loader active={loading} size="huge">
                Loading Players
              </Loader>
            </div>
          </div>
          <Switch>
            <Route path="/players/:id" component={PlayerInspector} />
            <Route>
              <div
                className="player-inspector-container"
                v-if="!$route.params.id"
              >
                <NavBar attached>SELECT A PLAYER</NavBar>
                <div className="player-inspector" />
              </div>
            </Route>
          </Switch>
        </div>
      </PageContent>
    </>
  );
};
