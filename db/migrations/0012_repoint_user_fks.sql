-- Repoint the user foreign keys from uwu_users to uwufeed_users.
--
-- Only needed for a database created before uwuFeed had its own accounts
-- table. A fresh run of 0001 through 0011 already points at the right
-- place, and this migration then does nothing.
--
-- If any of these tables already hold rows whose user_id exists in
-- uwu_users but not in uwufeed_users, the constraint will refuse to be
-- added. That is the correct outcome: it means there is real data to
-- migrate, and silently dropping the constraint would be worse.

do $$
declare
  t text;
begin
  foreach t in array array['uwufeed_subscriptions', 'uwufeed_templates', 'uwufeed_targets']
  loop
    -- Drop whatever foreign key currently sits on user_id, whichever table
    -- it happens to point at.
    execute (
      select coalesce(
        string_agg(format('alter table %I drop constraint %I;', t, conname), ' '),
        ''
      )
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      where rel.relname = t
        and c.contype = 'f'
        and c.conkey = array[
          (select attnum from pg_attribute
            where attrelid = rel.oid and attname = 'user_id')
        ]
    );

    execute format(
      'alter table %I add constraint %I foreign key (user_id)
         references uwufeed_users(id) on delete cascade',
      t, t || '_user_id_fkey'
    );
  end loop;
end $$;
