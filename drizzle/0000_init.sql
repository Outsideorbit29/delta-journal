CREATE TABLE `fills` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`contract_type` text NOT NULL,
	`contract_value` real NOT NULL,
	`notional_type` text,
	`side` text NOT NULL,
	`size` integer NOT NULL,
	`price` real NOT NULL,
	`commission` real NOT NULL,
	`credits_used` real NOT NULL,
	`role` text,
	`fill_type` text NOT NULL,
	`leverage` real,
	`source` text,
	`position_size_after` integer,
	`realized_pnl_after` real,
	`created_at` text NOT NULL,
	`ts` integer NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fills_product_ts` ON `fills` (`product_id`,`ts`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`order_type` text NOT NULL,
	`stop_order_type` text,
	`stop_price` real,
	`limit_price` real,
	`bracket_stop_loss_price` real,
	`bracket_take_profit_price` real,
	`size` integer NOT NULL,
	`unfilled_size` integer,
	`state` text NOT NULL,
	`reduce_only` integer,
	`cancellation_reason` text,
	`created_at` text NOT NULL,
	`ts` integer NOT NULL,
	`updated_ts` integer,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_product_ts` ON `orders` (`product_id`,`ts`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`resource` text PRIMARY KEY NOT NULL,
	`last_ts` integer,
	`last_run_at` integer,
	`last_count` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `trade_fills` (
	`trade_id` text NOT NULL,
	`fill_id` text NOT NULL,
	`qty` integer NOT NULL,
	`kind` text NOT NULL,
	`price` real NOT NULL,
	`fee` real NOT NULL,
	`ts` integer NOT NULL,
	PRIMARY KEY(`trade_id`, `fill_id`)
);
--> statement-breakpoint
CREATE TABLE `trade_tags` (
	`trade_id` text NOT NULL,
	`tag` text NOT NULL,
	`source` text NOT NULL,
	`detail` text,
	PRIMARY KEY(`trade_id`, `tag`)
);
--> statement-breakpoint
CREATE INDEX `trade_tags_tag` ON `trade_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`contract_type` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`opened_ts` integer NOT NULL,
	`closed_ts` integer,
	`hold_seconds` integer,
	`entry_qty` integer NOT NULL,
	`exit_qty` integer NOT NULL,
	`max_qty` integer NOT NULL,
	`contract_value` real NOT NULL,
	`avg_entry` real NOT NULL,
	`avg_exit` real,
	`max_notional` real NOT NULL,
	`leverage` real,
	`margin_used` real,
	`wallet_balance_at_open` real,
	`gross_pnl` real NOT NULL,
	`fees` real NOT NULL,
	`fee_credits` real NOT NULL,
	`funding` real NOT NULL,
	`net_pnl` real NOT NULL,
	`delta_realized_pnl` real,
	`pnl_matches_delta` integer,
	`fill_count` integer NOT NULL,
	`add_count` integer NOT NULL,
	`reduce_count` integer NOT NULL,
	`exit_reason` text,
	`stop_price` real,
	`stop_placed_after_sec` integer,
	`risk_amount` real,
	`r_multiple` real,
	`warnings` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trades_opened` ON `trades` (`opened_ts`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`uuid` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`balance` real,
	`asset_symbol` text NOT NULL,
	`product_id` integer,
	`created_at` text NOT NULL,
	`ts` integer NOT NULL,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wallet_type_ts` ON `wallet_transactions` (`type`,`ts`);