-- Add sf_admin column to User
ALTER TABLE "users" ADD COLUMN "sf_admin" BOOLEAN NOT NULL DEFAULT false;

-- Create SfSession table
CREATE TABLE "sf_sessions" (
    "id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "organizer_login" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_sessions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "sf_sessions_start_time_idx" ON "sf_sessions"("start_time");
CREATE INDEX "sf_sessions_organizer_login_idx" ON "sf_sessions"("organizer_login");

-- Foreign key
ALTER TABLE "sf_sessions" ADD CONSTRAINT "sf_sessions_organizer_login_fkey" FOREIGN KEY ("organizer_login") REFERENCES "users"("login") ON DELETE RESTRICT ON UPDATE CASCADE;
