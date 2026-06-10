CREATE TABLE `ban_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`banned` text NOT NULL,
	`banner_id` text DEFAULT '' NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`expires` integer DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ban_history_unique_idx` ON `ban_history` (`banned`,`banner_id`,`created`,`expires`,`reason`);--> statement-breakpoint
CREATE INDEX `ban_history_banned_created_idx` ON `ban_history` (`banned`,`created`);--> statement-breakpoint
CREATE TABLE `chat_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created` integer NOT NULL,
	`instance_id` text NOT NULL,
	`action` text NOT NULL,
	`user` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `chat_logs_created_idx` ON `chat_logs` (`created`);--> statement-breakpoint
CREATE INDEX `chat_logs_instance_created_idx` ON `chat_logs` (`instance_id`,`created`);--> statement-breakpoint
CREATE TABLE `heartbeats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created` integer NOT NULL,
	`bricks` integer NOT NULL,
	`players` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `heartbeats_created_idx` ON `heartbeats` (`created`);--> statement-breakpoint
CREATE TABLE `kick_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kicked` text NOT NULL,
	`kicker_id` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kick_history_unique_idx` ON `kick_history` (`kicked`,`kicker_id`,`created`,`reason`);--> statement-breakpoint
CREATE INDEX `kick_history_kicked_created_idx` ON `kick_history` (`kicked`,`created`);--> statement-breakpoint
CREATE TABLE `player_history` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`name_history` text DEFAULT '[]' NOT NULL,
	`ips` text DEFAULT '[]' NOT NULL,
	`created` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`last_instance_id` text NOT NULL,
	`heartbeats` integer DEFAULT 0 NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	`instances` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `player_history_name_idx` ON `player_history` (`name`);--> statement-breakpoint
CREATE INDEX `player_history_display_name_idx` ON `player_history` (`display_name`);--> statement-breakpoint
CREATE INDEX `player_history_last_seen_idx` ON `player_history` (`last_seen`);--> statement-breakpoint
CREATE TABLE `player_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `player_notes_player_id_idx` ON `player_notes` (`player_id`);--> statement-breakpoint
CREATE TABLE `punchcards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`month` integer NOT NULL,
	`year` integer NOT NULL,
	`punchcard` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `punchcards_kind_month_year_idx` ON `punchcards` (`kind`,`month`,`year`);--> statement-breakpoint
CREATE TABLE `server_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `server_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`last_online` integer DEFAULT 0 NOT NULL,
	`username` text NOT NULL,
	`hash` text NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`player_id` text DEFAULT '' NOT NULL,
	`is_banned` integer DEFAULT false NOT NULL,
	`permissions` text,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`passkeys` text DEFAULT '[]' NOT NULL,
	`recovery_codes` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `web_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`order` integer NOT NULL,
	`permissions` text NOT NULL
);
