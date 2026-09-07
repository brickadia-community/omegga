-- hand-corrected: drizzle-kit splits an expression index on the comma inside
-- json_extract, so the generated statement was invalid. The snapshot stores the
-- expression intact, so regenerating still reports no pending changes.
CREATE INDEX `chat_logs_user_id_action_created_idx` ON `chat_logs` (json_extract("user", '$.id'),`action`,`created`);
