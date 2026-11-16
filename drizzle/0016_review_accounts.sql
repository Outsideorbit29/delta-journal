ALTER TABLE `ai_reviews` ADD `account_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill (hand-written): every review so far was of Delta trades.
UPDATE `ai_reviews` SET `account_id` = COALESCE((SELECT a.`id` FROM `accounts` a WHERE a.`user_id` = `ai_reviews`.`user_id` AND a.`broker` = 'delta'), '');
