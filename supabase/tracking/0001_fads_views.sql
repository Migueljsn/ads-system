-- Views agregadas no banco do tracking (Fonil CRM) para o Fonil Ads.
-- Sem dados pessoais (nome/telefone/e-mail) e sem acesso à ClientSettings.
create schema if not exists fads;

create or replace view fads.lead_daily as
select c.slug as client_slug,
       ((l."capturedAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date as day,
       l.source::text as source,
       nullif(l."metaCampaignId", '') as meta_campaign_id,
       nullif(l."utmCampaign", '') as utm_campaign,
       nullif(lower(l."utmSource"), '') as utm_source,
       (l.gclid is not null) as has_gclid,
       count(*)::int as leads,
       count(*) filter (where l.status = 'SOLD')::int as leads_sold,
       count(*) filter (where l.status = 'LOST')::int as leads_lost
  from public."Lead" l join public."Client" c on c.id = l."clientId"
 group by 1, 2, 3, 4, 5, 6, 7;

create or replace view fads.sale_daily as
select c.slug as client_slug,
       ((s."soldAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date as day,
       l.source::text as source,
       nullif(l."metaCampaignId", '') as meta_campaign_id,
       nullif(l."utmCampaign", '') as utm_campaign,
       nullif(lower(l."utmSource"), '') as utm_source,
       coalesce(l.gclid is not null, false) as has_gclid,
       count(*)::int as sales,
       coalesce(sum(s.value), 0)::numeric(14,2) as revenue,
       count(*) filter (where s."isRepeatPurchase")::int as repeat_sales
  from public."Sale" s
  join public."Client" c on c.id = s."clientId"
  left join public."Lead" l on l.id = s."leadId"
 group by 1, 2, 3, 4, 5, 6, 7;

-- funil atual: leads abertos por etapa
create or replace view fads.pipeline_now as
select c.slug as client_slug, p.name as stage, p.position, count(l.id)::int as leads
  from public."PipelineStage" p
  join public."Client" c on c.id = p."clientId"
  left join public."Lead" l on l."pipelineStageId" = p.id and l.status not in ('SOLD', 'LOST')
 group by 1, 2, 3;

-- motivos de perda por dia
create or replace view fads.loss_daily as
select c.slug as client_slug,
       ((l."updatedAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date as day,
       coalesce(r.label, 'Sem motivo') as reason, count(*)::int as leads
  from public."Lead" l
  join public."Client" c on c.id = l."clientId"
  left join public."LossReason" r on r.id = l."lossReasonId"
 where l.status = 'LOST'
 group by 1, 2, 3;

revoke all on schema fads from public, anon, authenticated;
