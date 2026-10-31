CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`last_sent_at` integer,
	`failures` integer DEFAULT 0 NOT NULL
);
