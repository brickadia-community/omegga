/**
 * sets all the bricks in saveData to target's ownership
 * @param  {String|Object} - player or player identifier
 * @param  {SaveData} - save data with unknown ownership
 * @return {SaveData} - save data with ownership changed
 */
function setOwnership(player, saveData) {
  saveData.brick_owners = [ {id: player.id, name: player.name, bricks: saveData.bricks.length} ];

  saveData.bricks = saveData.bricks.map((brick) => ({
    ...brick,
    owner_index: 1
  }));

  return saveData;  
}

module.exports = setOwnership;