CREATE TABLE `delta_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`key_hint` text NOT NULL,
	`sealed` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
