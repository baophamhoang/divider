CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text,
	`source_filename` text,
	`residual` real DEFAULT 0 NOT NULL,
	`balances` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`from_name` text NOT NULL,
	`to_name` text NOT NULL,
	`amount` real NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`paid_at` integer,
	`sort_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transfers_session_id_idx` ON `transfers` (`session_id`);