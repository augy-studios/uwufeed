-- The dispatcher listens on Realtime inserts instead of sweeping the items
-- table, so uwufeed_items has to be in the publication.

alter publication supabase_realtime add table uwufeed_items;

-- Realtime needs the full row in the payload, not just the primary key.
alter table uwufeed_items replica identity full;
