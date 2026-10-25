-- Recreate column_type enum with 'formula' added (transaction-safe alternative to ALTER TYPE ... ADD VALUE)
CREATE TYPE "column_type_new" AS ENUM('notes', 'dropdown', 'date', 'status', 'link', 'formula');
--> statement-breakpoint
ALTER TABLE "column" ALTER COLUMN "type" TYPE "column_type_new" USING "type"::text::"column_type_new";
--> statement-breakpoint
DROP TYPE "column_type";
--> statement-breakpoint
ALTER TYPE "column_type_new" RENAME TO "column_type";
--> statement-breakpoint
ALTER TABLE "column" ADD COLUMN "formula" text;
