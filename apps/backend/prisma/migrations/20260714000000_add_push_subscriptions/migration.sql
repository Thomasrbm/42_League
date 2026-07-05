-- Abonnements Web Push (un par appareil ; purgés quand l'endpoint meurt).
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "user_login" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");
CREATE INDEX "push_subscription_user_login_idx" ON "push_subscription"("user_login");

ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_login_fkey" FOREIGN KEY ("user_login") REFERENCES "users"("login") ON DELETE CASCADE ON UPDATE CASCADE;
