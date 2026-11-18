CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE ai_daily_usage (
  day TEXT NOT NULL,
  service TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, service)
);
