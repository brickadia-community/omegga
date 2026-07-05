import BetterSqlite3 from 'better-sqlite3';
import { Brdb, brdb as brdbLib } from 'brs-js';
import { existsSync } from 'node:fs';

const { guidToUuid } = brdbLib;

/** Open a brdb file if it exists, wrapping a readonly better-sqlite3 handle
 * in the brs-js Brdb container reader. */
function openBrdb(path: string): Brdb | null {
  if (!existsSync(path)) return null;
  try {
    const db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
    return new Brdb(db);
  } catch (err) {
    console.error(`Error reading BRDB metadata from ${path}:`, err);
    return null;
  }
}

/** read the meta and owner data from a brdb file */
export function readBrdbMeta(path: string) {
  const brdb = openBrdb(path);
  if (!brdb) return null;

  try {
    const reader = brdb.worldReader();
    const worldJson = reader.environment();
    const bundleJson = reader.bundle();

    // Convert the owner struct-of-arrays into an array of structs. Empty or
    // unpopulated worlds (e.g. a freshly created world) carry only the
    // Meta/*.json files and no World/0 data, so the owner table is absent —
    // treat that as no owners rather than an error.
    const owners: {
      id: string;
      name: string;
      display_name: string;
      entity_count: number;
      brick_count: number;
      component_count: number;
      wire_count: number;
    }[] = [];

    const hasOwners =
      brdb.findFileByPath('World/0/Owners.mps') &&
      brdb.findFileByPath('World/0/Owners.schema');

    if (hasOwners) {
      const ownersSoa = reader.owners();
      for (let i = 0; i < ownersSoa.UserIds.length; i++) {
        owners.push({
          id: guidToUuid(ownersSoa.UserIds[i]),
          name: ownersSoa.UserNames[i],
          display_name: ownersSoa.DisplayNames[i],
          entity_count: ownersSoa.EntityCounts[i],
          brick_count: ownersSoa.BrickCounts[i],
          component_count: ownersSoa.ComponentCounts[i],
          wire_count: ownersSoa.WireCounts[i],
        });
      }
    }

    brdb.close();

    return {
      meta: { world: worldJson, bundle: bundleJson },
      owners,
    };
  } catch (err) {
    console.error(`Error reading BRDB metadata from ${path}:`, err);
    brdb.close();
    return null;
  }
}

/** read the revision history from a brdb file, newest revision last. Indices
 * and notes match the game's `World.ListRevisions` output, so the returned
 * `index` can be passed to `World.LoadRevision`. */
export function readBrdbRevisions(
  path: string,
): { index: number; date: Date; note: string }[] | null {
  const brdb = openBrdb(path);
  if (!brdb) return null;

  try {
    // brdb createdAt is unix seconds; revisionId is the 1-based revision index
    const revisions = brdb.revisions().map(r => ({
      index: r.revisionId,
      date: new Date(r.createdAt * 1000),
      note: r.description,
    }));
    brdb.close();
    return revisions;
  } catch (err) {
    console.error(`Error reading BRDB revisions from ${path}:`, err);
    brdb.close();
    return null;
  }
}

/** read the screenshot from a brdb file */
export function readBrdbScreenshot(path: string): Buffer | null {
  const brdb = openBrdb(path);
  if (!brdb) return null;
  try {
    const found = brdb.findFileByPath('Meta/Screenshot.jpg');
    const file = found ? Buffer.from(brdb.readBlob(found.contentId)) : null;
    brdb.close();
    return file;
  } catch (err) {
    console.error(`Error reading BRDB screenshot from ${path}:`, err);
    brdb.close();
    return null;
  }
}
