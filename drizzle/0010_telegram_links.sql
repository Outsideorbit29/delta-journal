CREATE TABLE `telegram_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`chat_id` text,
	`chat_name` text,
	`linked_at` integer,
	`code_hash` text,
	`code_expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_id_unique` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_code_hash_unique` ON `telegram_links` (`code_hash`);