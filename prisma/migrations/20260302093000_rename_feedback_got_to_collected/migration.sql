DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'FeedbackAction' AND e.enumlabel = 'GOT'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'FeedbackAction' AND e.enumlabel = 'COLLECTED'
    ) THEN
      UPDATE "PostcardFeedback"
      SET "action" = 'COLLECTED'::"FeedbackAction"
      WHERE "action" = 'GOT'::"FeedbackAction";
    ELSE
      ALTER TYPE "FeedbackAction" RENAME VALUE 'GOT' TO 'COLLECTED';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'FeedbackAction' AND e.enumlabel = 'COLLECTED'
  ) THEN
    ALTER TYPE "FeedbackAction" ADD VALUE 'COLLECTED';
  END IF;
END
$$;
