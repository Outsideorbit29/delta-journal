CREATE TABLE `broker_credentials` (
	`user_id` text NOT NULL,
	`broker` text NOT NULL,
	`key_hint` text NOT NULL,
	`sealed` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`checked_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `broker`)
);
