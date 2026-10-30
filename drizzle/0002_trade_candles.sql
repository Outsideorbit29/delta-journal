CREATE TABLE `trade_candles` (
	`trade_id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`resolution` text NOT NULL,
	`start_sec` integer NOT NULL,
	`end_sec` integer NOT NULL,
	`candles` text NOT NULL,
	`fetched_at` integer NOT NULL
);
