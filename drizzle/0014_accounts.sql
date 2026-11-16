CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'legacy' NOT NULL,
	`broker` text NOT NULL,
	`label` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_broker` ON `accounts` (`user_id`,`broker`);--> statement-breakpoint
ALTER TABLE `fills` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `trades` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallet_transactions` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill (hand-written): one Delta account for every user who has any synced data or a Delta key,
-- then every existing raw row and trade belongs to it.
INSERT INTO `accounts` (`id`, `user_id`, `broker`, `label`, `currency`, `created_at`)
SELECT 'acc_' || lower(hex(randomblob(8))), u.`user_id`, 'delta', 'Delta Exchange', 'USD', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (
	SELECT `user_id` FROM `fills` UNION SELECT `user_id` FROM `orders` UNION SELECT `user_id` FROM `wallet_transactions`
	UNION SELECT `user_id` FROM `trades` UNION SELECT `user_id` FROM `sync_state` UNION SELECT `user_id` FROM `delta_credentials`
) u;--> statement-breakpoint
UPDATE `fills` SET `account_id` = (SELECT a.`id` FROM `accounts` a WHERE a.`user_id` = `fills`.`user_id` AND a.`broker` = 'delta');--> statement-breakpoint
UPDATE `orders` SET `account_id` = (SELECT a.`id` FROM `accounts` a WHERE a.`user_id` = `orders`.`user_id` AND a.`broker` = 'delta');--> statement-breakpoint
UPDATE `wallet_transactions` SET `account_id` = (SELECT a.`id` FROM `accounts` a WHERE a.`user_id` = `wallet_transactions`.`user_id` AND a.`broker` = 'delta');--> statement-breakpoint
UPDATE `trades` SET `account_id` = (SELECT a.`id` FROM `accounts` a WHERE a.`user_id` = `trades`.`user_id` AND a.`broker` = 'delta');
