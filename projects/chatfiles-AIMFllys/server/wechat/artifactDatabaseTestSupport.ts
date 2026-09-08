import { DatabaseSync } from 'node:sqlite'
import { resolveArtifactDatabasePath } from './artifactDatabase.js'

export function addClosedDocumentAsset(projectRoot: string, linkMaterialization: boolean) {
  const db = new DatabaseSync(resolveArtifactDatabasePath(projectRoot))
  const assetId = 'd'.repeat(64)
  db.exec(`
    UPDATE asset_runs SET source_count=1,resource_count=1,asset_count=1,
      association_count=1,materialization_count=1;
    INSERT INTO asset_sources VALUES(
      'source','run-v2','resource','message','row','type','0',4,1,1,1,'[]','[]',
      'sha256:${'a'.repeat(64)}','lookup_exact','present','ready.pdf',4,'sha256:${'b'.repeat(64)}'
    );
    INSERT INTO asset_associations VALUES(
      'association','run-v2','source','exact','confirmed',NULL,'uid','conv','[]','[]','[]',
      0,'lookup_evidence',0
    );
    INSERT INTO assets VALUES(
      '${assetId}','run-v2','association','document','resource','ready','pdf',NULL,1,0,
      '成员','', 'sha256:${'a'.repeat(64)}'
    );
    INSERT INTO asset_materializations(
      source_id,run_id,asset_id,status,preview_status,failure_reason
    ) VALUES('source','run-v2',${linkMaterialization ? `'${assetId}'` : 'NULL'},'ready','ready',NULL);
  `)
  db.close()
}
