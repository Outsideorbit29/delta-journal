CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`created_at` integer NOT NULL,
	`plan` text DEFAULT 'founder' NOT NULL,
	`access_until` integer
);
--> statement-breakpoint
DROP INDEX `ai_reviews_created`;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `ai_reviews_user_created` ON `ai_reviews` (`user_id`,`created_at`);--> statement-breakpoint
DROP INDEX `fills_product_ts`;--> statement-breakpoint
ALTER TABLE `fills` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `fills_user_product_ts` ON `fills` (`user_id`,`product_id`,`ts`);--> statement-breakpoint
DROP INDEX `orders_product_ts`;--> statement-breakpoint
ALTER TABLE `orders` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_user_product_ts` ON `orders` (`user_id`,`product_id`,`ts`);--> statement-breakpoint
DROP INDEX `trade_tags_tag`;--> statement-breakpoint
ALTER TABLE `trade_tags` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `trade_tags_user_tag` ON `trade_tags` (`user_id`,`tag`);--> statement-breakpoint
DROP INDEX `trades_opened`;--> statement-breakpoint
ALTER TABLE `trades` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `trades_user_opened` ON `trades` (`user_id`,`opened_ts`);--> statement-breakpoint
DROP INDEX `wallet_type_ts`;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX `wallet_user_type_ts` ON `wallet_transactions` (`user_id`,`type`,`ts`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_app_state` (
	`user_id` text DEFAULT '' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
INSERT INTO `__new_app_state`("user_id", "key", "value") SELECT CASE WHEN "key" IN ('telegram.notify_since', 'telegram.weekly_review_for') THEN 'legacy' ELSE '' END, "key", "value" FROM `app_state`;--> statement-breakpoint
DROP TABLE `app_state`;--> statement-breakpoint
ALTER TABLE `__new_app_state` RENAME TO `app_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_sync_state` (
	`user_id` text DEFAULT 'legacy' NOT NULL,
	`resource` text NOT NULL,
	`last_ts` integer,
	`last_run_at` integer,
	`last_count` integer,
	`last_error` text,
	PRIMARY KEY(`user_id`, `resource`)
);
--> statement-breakpoint
INSERT INTO `__new_sync_state`("user_id", "resource", "last_ts", "last_run_at", "last_count", "last_error") SELECT 'legacy', "resource", "last_ts", "last_run_at", "last_count", "last_error" FROM `sync_state`;--> statement-breakpoint
DROP TABLE `sync_state`;--> statement-breakpoint
ALTER TABLE `__new_sync_state` RENAME TO `sync_state`;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_messages` ADD `user_id` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `trade_fills` ADD `user_id` text DEFAULT 'legacy' NOT NULL;