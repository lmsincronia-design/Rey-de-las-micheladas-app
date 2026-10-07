-- Receipt crowns become available 24 hours after the code is redeemed.
-- pos_record_sale already sets this deadline. Remove the pilot-only shortcut.
begin;
drop function if exists public.activate_my_test_crowns();
commit;
