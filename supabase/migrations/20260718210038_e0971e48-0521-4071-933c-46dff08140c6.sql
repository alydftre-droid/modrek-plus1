DELETE FROM public.content WHERE id = 'e8d0f941-d772-43a4-83c5-7da4ffd88553'::uuid;
DELETE FROM public.notifications WHERE link LIKE '%e8d0f941-d772-43a4-83c5-7da4ffd88553%';
DELETE FROM public.notification_delivery_logs WHERE link LIKE '%e8d0f941-d772-43a4-83c5-7da4ffd88553%';