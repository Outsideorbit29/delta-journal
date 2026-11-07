CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'legacy' NOT NULL,
	`message` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer
);
