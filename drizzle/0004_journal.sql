CREATE TABLE `journal_entries` (
	`trade_id` text PRIMARY KEY NOT NULL,
	`setup` text,
	`emotions` text NOT NULL,
	`mistakes` text NOT NULL,
	`followed_plan` integer,
	`rating` integer,
	`notes` text,
	`planned_stop` real,
	`planned_target` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trades` ADD `stop_order_risk` real;--> statement-breakpoint
ALTER TABLE `trades` ADD `risk_source` text;