CREATE TABLE `plugin_config` (
	`plugin` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugin_store` (
	`plugin` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`plugin`, `key`)
);
