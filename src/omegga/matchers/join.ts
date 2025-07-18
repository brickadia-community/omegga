import Player from '@omegga/player';
import { MatchGenerator } from './types';

const join: MatchGenerator<Player> = omegga => {
  // username + id and a log counter to keep track of actual join messages
  const userJoinInfo: {
    counter: string;
    UserName?: string;
    UserId?: string;
    DisplayName?: string;
  }[] = [];

  // username + id to get player state and controller
  const joiningPlayers: {
    displayName: string;
    name: string;
    id: string;
    state?: string;
    controller?: string;
  }[] = [];

  // patterns to match PlayerState and PlayerController objects in GetAll commands
  const stateRegExp =
    /BP_PlayerState_C .+?PersistentLevel\.(?<state>BP_PlayerState_C_\d+)\.UserName = (?<name>.+)$/;
  const controllerRegExp =
    /BP_PlayerState_C .+?PersistentLevel\.(?<state>BP_PlayerState_C_\d+)\.Owner = .*?BP_PlayerController_C'.+?:PersistentLevel.(?<controller>BP_PlayerController_C_\d+)'/;

  return {
    // listen for join events and wait for PlayerController info
    pattern(line, logMatch) {
      if (logMatch) {
        const { generator, counter, data } = logMatch.groups;
        let joinData = userJoinInfo.find(l => l.counter === counter);

        // LogServerList includes the new user information
        if (generator === 'LogServerList') {
          // create joindata if it doesn't exist
          if (!joinData) {
            joinData = { counter };
            userJoinInfo.push(joinData);
          }

          // match on username or user id
          const match = data.match(
            /^(?<field>UserName|UserId|DisplayName): (?<value>.+)$/,
          );

          // put that value in the join data
          if (match) {
            joinData[
              match.groups.field as 'UserName' | 'UserId' | 'DisplayName'
            ] = match.groups.value;
          }

          // LogNet lets us know the player successfully joined
        } else if (generator == 'LogNet') {
          // find which player joined
          const match = data.match(/^Join succeeded: (.+)$/);

          // make sure this joindata corresponds to this player
          // TODO: [BRICKADIA] display name used here instead of username...
          if (match && joinData.DisplayName === match[1]) {
            // remove that player from our buffer
            userJoinInfo.splice(userJoinInfo.indexOf(joinData), 1);

            // found joined player, now we need to find the BRPlayerState
            joiningPlayers.push({
              displayName: joinData.DisplayName,
              name: joinData.UserName,
              id: joinData.UserId,
            });

            // get the state of the joining player
            omegga.writeln(
              `GetAll BRPlayerState UserName UserName=${joinData.UserName}`,
            );
          }
        }

        // only match state and controllers if we have joining players
      } else if (joiningPlayers.length) {
        const stateMatch = line.match(stateRegExp);
        const controllerMatch = line.match(controllerRegExp);

        // this line matches our PlayerName -> PlayerState pattern
        if (stateMatch) {
          const { name, state } = stateMatch.groups;

          // find the joining player that has a matching name
          const player = joiningPlayers.find(p => p.name === name);

          // check if another player is already using this state or if there's any joining player with this name
          if (!player || omegga.players.some(p => p.state === state)) return;

          // this player owns this state, find the controller now
          player.state = state;
          omegga.writeln(`GetAll BRPlayerState Owner Name=${state}`);

          // this line matches our PlayerState -> PlayerController pattern
        } else if (controllerMatch) {
          const { controller, state } = controllerMatch.groups;

          // find the joining player that has a matching state
          const player = joiningPlayers.find(p => p.state === state);

          // no player found
          if (!player) return;

          // assign the controller and state, remove the player from the joining players
          player.controller = controller;
          player.state = state;
          joiningPlayers.splice(joiningPlayers.indexOf(player), 1);

          // return the newly joined player
          return new Player(
            omegga,
            player.name,
            player.displayName,
            player.id,
            player.controller,
            player.state,
          );
        }
      }
    },
    // when there's a match, emit a join event and add the player to the player list
    callback(player) {
      omegga.emit('join', player);
      omegga.players.push(player);
      omegga.emit(
        'plugin:players:raw',
        omegga.players.map(p => p.raw()),
      );
    },
  };
};

export default join;
