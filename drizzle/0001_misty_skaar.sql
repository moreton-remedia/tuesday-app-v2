ALTER TABLE "workspace" ADD COLUMN "invite_token" text;--> statement-breakpoint
UPDATE "workspace" SET "invite_token" = encode(sha256((id || extract(epoch from now())::text)::bytea), 'hex') WHERE "invite_token" IS NULL;--> statement-breakpoint
ALTER TABLE "workspace" ALTER COLUMN "invite_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ALTER COLUMN "invite_token" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_invite_token_unique" UNIQUE("invite_token");
