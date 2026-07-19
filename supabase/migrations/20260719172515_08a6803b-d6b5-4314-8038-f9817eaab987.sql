DROP POLICY IF EXISTS "Authenticated may subscribe to own topic" ON realtime.messages;
CREATE POLICY "Authenticated may subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'user:' || auth.uid()::text
);