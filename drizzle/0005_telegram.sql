CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_messages` (
	`chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`trade_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chat_id`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `telegram_messages_trade` ON `telegram_messages` (`trade_id`);