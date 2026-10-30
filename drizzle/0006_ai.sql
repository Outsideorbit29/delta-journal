CREATE TABLE `ai_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`trade_count` integer NOT NULL,
	`model` text NOT NULL,
	`review` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_reviews_created` ON `ai_reviews` (`created_at`);--> statement-breakpoint
ALTER TABLE `telegram_messages` ADD `payload` text;