import { ReadSaveObject, Brick } from 'brs-js';

/**
 * sets all the bricks in saveData to target's ownership
 * @param player - player
 * @param saveData - save data with unknown ownership
 * @return save data with ownership changed
 */
export function setOwnership(
  player: { id: string; name: string },
  saveData: ReadSaveObject
) {
  if ('brick_owners' in saveData)
    saveData.brick_owners = [
      { id: player.id, name: player.name, bricks: saveData.bricks.length },
    ];

  if (saveData.bricks.length > 0 && 'owner_index' in saveData.bricks[0])
    saveData.bricks = saveData.bricks.map(brick => ({
      ...brick,
      owner_index: 1,
    })) as typeof saveData.bricks;

  return saveData;
}

export default setOwnership;
