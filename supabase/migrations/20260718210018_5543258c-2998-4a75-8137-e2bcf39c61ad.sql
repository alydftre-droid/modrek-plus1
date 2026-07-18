DELETE FROM public.content WHERE file_url LIKE 'test://notification-%';
DELETE FROM public.notifications WHERE link LIKE '%8eb08ef4-9013-49ec-b800-35ed63ddc088%' OR link LIKE '%3f218cc8-6afa-49ad-a260-38790440b2ba%';
DELETE FROM public.notification_delivery_logs WHERE link LIKE '%8eb08ef4-9013-49ec-b800-35ed63ddc088%' OR link LIKE '%3f218cc8-6afa-49ad-a260-38790440b2ba%';