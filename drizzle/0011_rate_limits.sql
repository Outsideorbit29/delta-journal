CREATE TABLE `rate_limits` (
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`subject`, `action`)
);
