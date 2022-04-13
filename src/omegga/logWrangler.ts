/*
The wrapper combines the things looking at or waiting for logs with the actual server logs
*/

import Omegga from './server';

const GENERIC_LINE_REGEX =
  /^(\[(?<date>\d{4}\.\d\d.\d\d-\d\d.\d\d.\d\d:\d{3})\]\[\s*(?<counter>\d+)\])?(?<generator>\w+): (?<data>.+)$/;

export type WatcherPattern<T> = (
  line: string,
  match: RegExpMatchArray
) => T | RegExpMatchArray | '[OMEGGA_WATCHER_DONE]';

export type IMatcher<T> =
  | {
      pattern: RegExp;
      callback: (match: RegExpMatchArray) => boolean;
    }
  | {
      pattern: (line: string, match: RegExpMatchArray) => T;
      callback: (match: RegExpMatchArray) => T;
    };

export type IWatcher<T> = {
  bundle: boolean;
  debounce: boolean;
  timeoutDelay: number;
  afterMatchDelay: number;
  last: (match: T) => boolean;
  callback: () => void;
  resolve: (...args: any[]) => void;
  remove: () => void;
  done: () => void;
  timeout: ReturnType<typeof setTimeout>;
} & (
  | {
      pattern: WatcherPattern<T>;
      matches: T[];
    }
  | {
      pattern: RegExp;
      matches: RegExpMatchArray[];
    }
);

class LogWrangler {
  // list of patterns and callbacks watching the brickadia logs in general
  #matchers: IMatcher<unknown>[] = [];

  // list of patterns and promises waiting for specific console logs
  #watchers: IWatcher<unknown>[] = [];

  exec: (cmd: string) => void;
  getPlayer: Omegga['getPlayer'];
  getVersion: () => number;
  omegga: Omegga;
  callback: LogWrangler['handleLog'];

  constructor(omegga: Omegga) {
    // passthru functions
    this.exec = cmd => omegga.writeln(cmd);
    this.getPlayer = (arg: string) => omegga.getPlayer(arg);
    this.getVersion = () => omegga.version;

    // callback reads in new lines
    this.callback = this.handleLog.bind(this);

    this.addMatcher = this.addMatcher.bind(this);
    this.addWatcher = this.addWatcher.bind(this);
    this.watchLogArray = this.watchLogArray.bind(this);
    this.watchLogChunk = this.watchLogChunk.bind(this);
    this.omegga = omegga;
  }

  // add a new matcher to listen in on the logs
  // pattern is regex or a function that returns a match
  // callback is a function that receives the result of the pattern
  // returns a deregister function
  addMatcher<T>(
    pattern: IMatcher<T>['pattern'],
    callback: IMatcher<T>['callback']
  ) {
    if (
      (typeof pattern !== 'function' && !(pattern instanceof RegExp)) ||
      typeof callback !== 'function'
    )
      return undefined;

    // create the matcher from the callback and pattern, add it to the matchers
    const matcher = { pattern, callback } as IMatcher<T>;
    this.#matchers.push(matcher);

    // return a function to remove this matcher from the list of matchers
    return () => {
      const index = this.#matchers.indexOf(matcher);
      if (index > -1) this.#matchers.splice(index, 0);
    };
  }

  // wait for stdout to match this regex or matcher fn, returns the match or times out
  // pattern is regex or a function that returns a match
  // if bundle is set to true, it returns all matches after the timeout ends rather than resolving (can't be used with delay 0)
  // exec is a function run after adding the watcher
  // debounce (used with bundle) waits extra time after each match before timing out
  // afterMatchDelay (used with debounce) indicates to run a new timeout after the first match
  // last (used with bundle) is a function run on the match. when it returns true, the watcher resolves early
  // returns a promise, rejects after timeout ends
  addWatcher<T = RegExpMatchArray>(
    pattern: IWatcher<T>['pattern'],
    {
      timeoutDelay = 50,
      bundle = false,
      debounce = false,
      afterMatchDelay = 0,
      last,
      exec,
    }: {
      timeoutDelay?: number;
      bundle?: boolean;
      debounce?: boolean;
      afterMatchDelay?: number;
      last?: IWatcher<T>['last'];
      exec?: () => void;
    } = {}
  ): Promise<IWatcher<T>['matches']> {
    if (typeof pattern !== 'function' && !(pattern instanceof RegExp))
      return undefined;

    return new Promise((resolve, reject) => {
      // create the watcher
      const watcher = {
        pattern,
        bundle,
        debounce,
        timeoutDelay,
        afterMatchDelay,
        last,
        matches: [],
      } as Partial<IWatcher<T>>;

      (watcher.resolve = (...args) => {
        clearTimeout(watcher.timeout);
        resolve(args);
      }),
        // remove helper
        (watcher.remove = () => {
          const index = this.#watchers.indexOf(watcher as IWatcher<T>);
          if (index > -1) {
            this.#watchers.splice(index, 1);
          }
        });

      // what the watcher dones when it completes
      watcher.done = () => {
        // remove the watcher if it exists
        watcher.remove();

        // if the bundle option is set to true, resolve on timeout end
        if (bundle) {
          resolve(watcher.matches);
        } else {
          // reject the promise
          reject('timed out');
        }
      };

      // if the delay is non 0, kill the promise after some time
      if (timeoutDelay !== 0) {
        watcher.timeout = setTimeout(watcher.done, timeoutDelay);
      }

      this.#watchers.push(watcher as IWatcher<T>);
      exec && exec();
    });
  }

  // match a group of console logs that have the same counter (ran on the same thread)
  // first is a function or 'index' for the index capture group that determines if this is match is the first log
  // last is a function that determines if this match is the last log (and can terminate early)
  // aftermatch delay is borrowed from addWatcher
  watchLogChunk<T = string>(
    cmd: string,
    pattern: IWatcher<T>['pattern'],
    {
      first,
      last,
      afterMatchDelay = 10,
      timeoutDelay = 100,
    }: {
      first?: 'index' | ((match: T) => boolean);
      last?: IWatcher<T>['last'];
      afterMatchDelay?: number;
      timeoutDelay?: number;
    }
  ): Promise<IWatcher<T>['matches']> {
    // we're focused on the counter part of this, the rest will be passed to the pattern matcher
    const logLineRegExp =
      /\[(?<date>\d{4}\.\d\d.\d\d-\d\d.\d\d.\d\d:\d{3})\]\[\s*(?<counter>\d+)\](?<rest>.*)$/;

    // keep track of the current log line
    let currentCounter: number | string = -1;

    // create the
    return this.addWatcher<T>(
      (line: string, _match: RegExpMatchArray) => {
        const logLineMatch = line.match(logLineRegExp);
        if (!logLineMatch) return;

        // get the counter and rest of line from the log line match
        const {
          groups: { counter, rest },
        } = logLineMatch;

        // run the regular pattern matcher
        const match =
          pattern instanceof RegExp
            ? rest.match(pattern)
            : pattern(rest, rest.match(GENERIC_LINE_REGEX));

        // end the watcher early if there is no match and the match has started (log chunks are uninterrupted)
        // this usually means that two commands were run so quickly that the output occured on the same counter
        if (!match && currentCounter !== -1) {
          return '[OMEGGA_WATCHER_DONE]';
        }

        // ignore things that don't match
        if (!match) return;

        // determine if this is the first log in the chunk
        let isFirst = false;

        // if there is a first parameter
        if (first) {
          // if it's a function, use that function to match
          if (typeof first === 'function') isFirst = first(match as T);
          // if it's 'index', use the index capture group
          else if (
            first === 'index' &&
            typeof match === 'object' &&
            'groups' in match
          )
            isFirst = match.groups.index === '0';
        } else {
          // otherwise, it doesn't matter
          isFirst = true;
        }

        // assign counter if it's not set and it's the first, or no first function is set
        if (currentCounter === -1 && isFirst) {
          currentCounter = counter;
        }
        if (currentCounter === -1 && !isFirst) {
          return;
        }

        // prematurely terminate the match if another log is found
        if (counter !== currentCounter) return '[OMEGGA_WATCHER_DONE]';

        // add the match to the bundle
        return match;
      },
      {
        last,
        exec: () => this.exec(cmd),
        bundle: true,
        debounce: true,
        timeoutDelay,
        afterMatchDelay,
      }
    );
  }

  // get a chunked array from the log
  // patterns are actually regex and must have capture groups
  // the itemPattern must have an (?<index>) capture group
  // the return is in the format of:
  /*
    [{
      item: (itemPattern group),
      members: [
        ...memberPattern groups,
      ],
    }, ...]
  */
  async watchLogArray<
    Item extends Record<string, string> = Record<string, string>,
    Member extends Record<string, string> = Record<string, string>
  >(cmd: string, itemPattern: RegExp, memberPattern: RegExp) {
    const results = (await this.watchLogChunk<[string, RegExpMatchArray]>(
      cmd,
      (line: string) => {
        // match on items
        const itemMatch = line.match(itemPattern);
        if (itemMatch) return ['item', itemMatch];

        // match on members
        const memberMatch = line.match(memberPattern);
        if (memberMatch) return ['member', memberMatch];
      },
      { first: arr => arr[0] === 'item' && arr[1].groups.index === '0' }
    )) as [string, RegExpMatchArray][];

    const array: { item: Item; members: Member[] }[] = [];

    // insert the results into the array
    for (const [type, { groups }] of results) {
      // insert an item into the array
      if (type === 'item') {
        array.push({ item: groups as Item, members: [] });

        // insert a member into an item
      } else if (type === 'member' && array.length > 0) {
        array[array.length - 1].members.push(groups as Member);
      }
    }

    return array;
  }

  // check all the matchers against this line
  handleLog(line: string) {
    // generic match the log
    const logMatch = line.match(GENERIC_LINE_REGEX);

    // pattern matcher handlers
    const patternMatchers = [
      {
        array: this.#matchers,
        onMatch<T>(match: RegExpMatchArray, matcher: IMatcher<T>) {
          matcher.callback?.(match);
        },
      },
      {
        array: this.#watchers,
        onMatch<T>(
          match: T | RegExpMatchArray | '[OMEGGA_WATCHER_DONE]',
          watcher: IWatcher<T>
        ) {
          // if the watcher is in bundle mode, add the match to its matches
          if (watcher.bundle) {
            // allow the watcher to terminate early
            if (match === '[OMEGGA_WATCHER_DONE]') {
              clearTimeout(watcher.timeout);
              watcher.done();
              return;
            }

            watcher.matches = [...watcher.matches, match] as
              | RegExpMatchArray[]
              | T[];

            // check if this is the last line and terminate early
            if (watcher?.last?.(match as T)) {
              clearTimeout(watcher.timeout);
              watcher.done();
              return;
            }

            // if the watcher is debounced, reset the timer
            if (watcher.debounce) {
              clearTimeout(watcher.timeout);
              watcher.timeout = setTimeout(
                watcher.done,
                watcher.afterMatchDelay || watcher.timeoutDelay
              );
            }

            // otherwise resolve with the result and remove the watcher from the list
          } else {
            watcher.resolve(match);
            watcher.remove();
          }
        },
      },
    ];

    // loop through matchers and run callbacks if they match
    for (const { array, onMatch } of patternMatchers) {
      // iterate in reverse because removing indices will not skip over any elements
      for (let i = array.length - 1; i >= 0; i--) {
        const matcher = array[i] as IWatcher<unknown> | IMatcher<unknown>;
        try {
          // run the match on a pattern or test with a function
          const match =
            matcher.pattern instanceof RegExp
              ? line.match(matcher.pattern)
              : matcher.pattern(line, logMatch);

          // if there's  match, handle it for this type of matcher
          if (match)
            onMatch(
              match as RegExpMatchArray,
              matcher as IWatcher<unknown> & IMatcher<unknown>
            );
        } catch (e) {
          Omegga.error('error in matcher', matcher.pattern, e);
        }
      }
    }
  }
}

export default LogWrangler;
