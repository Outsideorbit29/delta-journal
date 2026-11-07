CREATE TABLE `app_errors` (
	`key` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`route_path` text NOT NULL,
	`route_type` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`count` integer NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`alerted_at` integer,
	`alerted_count` integer DEFAULT 0 NOT NULL
);
