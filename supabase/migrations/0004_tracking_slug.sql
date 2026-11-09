-- vínculo do cliente com o tracking (Fonil CRM): slug do Client lá
alter table public.clients add column if not exists tracking_slug text;
update public.clients set tracking_slug = slug where tracking_slug is null and slug in ('rio-piranhas', 'mz3-cosmeticos', 'gol-distribuidora', 'so-aco', 'vem-da-fruta', 'fonil-group');
update public.clients set tracking_slug = 'bioextratus' where tracking_slug is null and slug = 'bio-nature';
