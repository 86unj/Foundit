INSERT INTO "campus" ("campus_id", "campus_name", "address", "retention_days")
VALUES ('00000000-0000-0000-0000-000000000000', 'missing', NULL, 30)
ON CONFLICT ("campus_id") DO UPDATE
SET
  "campus_name" = EXCLUDED."campus_name",
  "address" = EXCLUDED."address",
  "retention_days" = EXCLUDED."retention_days";
