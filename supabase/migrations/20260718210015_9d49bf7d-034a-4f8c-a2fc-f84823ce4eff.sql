DELETE FROM public.content WHERE id = '3f218cc8-6afa-49ad-a260-38790440b2ba'::uuid;
DELETE FROM public.notifications WHERE link LIKE '%3f218cc8-6afa-49ad-a260-38790440b2ba%';
DELETE FROM public.notification_delivery_logs WHERE link LIKE '%3f218cc8-6afa-49ad-a260-38790440b2ba%';