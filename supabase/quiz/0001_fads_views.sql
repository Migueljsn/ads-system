-- QuizzBuilder (Neon "bystep") → Fonil Ads read-only views. No personal data:
-- only aggregates, UTMs/campaign ids and choice-question option labels.
-- Restricted to Fonil's own account (other SaaS customers never exposed).
create schema if not exists fads;
revoke all on schema fads from public;

create or replace view fads.quizzes as
select q.id as quiz_id, q.name as quiz_name, q.slug, q.status, p.name as project_name,
       q.views, q.created_at
from quizzes q left join projects p on p.id = q.project_id
where q.owner_id = '334fca06-0159-4456-8341-2ac8e2a2839d';

create or replace view fads.quiz_lead_daily as
select l.quiz_id,
       (l.created_at at time zone 'UTC' at time zone 'America/Sao_Paulo')::date as day,
       nullif(l.utm_json->>'utm_source','')   as utm_source,
       nullif(l.utm_json->>'utm_medium','')   as utm_medium,
       nullif(l.utm_json->>'utm_campaign','') as utm_campaign,
       nullif(l.utm_json->>'campaign_id','')  as campaign_id,
       nullif(l.utm_json->>'adset_id','')     as adset_id,
       nullif(l.utm_json->>'ad_id','')        as ad_id,
       (l.fbc is not null or l.utm_json ? 'fbclid') as has_fbclid,
       count(*)::int as leads,
       count(*) filter (where l.answers_json ?| array['__nome__','__phone__','__email__','__cpf__','__cnpj__'])::int as leads_identified,
       round(avg(l.score), 1) as avg_score
from leads l join fads.quizzes q on q.quiz_id = l.quiz_id
group by 1,2,3,4,5,6,7,8,9;

create or replace view fads.quiz_profile_daily as
select l.quiz_id,
       (l.created_at at time zone 'UTC' at time zone 'America/Sao_Paulo')::date as day,
       l.score_profile, count(*)::int as leads
from leads l join fads.quizzes q on q.quiz_id = l.quiz_id
where l.score_profile is not null
group by 1,2,3;

create or replace view fads.quiz_step_daily as
select v.quiz_id, v.step_id, s."order" as step_order,
       (select left(regexp_replace(coalesce(b->>'question', b->>'headline', b->>'content'), '<[^>]+>', '', 'g'), 120)
          from jsonb_array_elements(s.blocks_json) b
         where coalesce(b->>'question', b->>'headline', b->>'content') is not null limit 1) as step_label,
       exists (select 1 from jsonb_array_elements(s.blocks_json) b where b->>'type' = 'lead') as has_lead_form,
       (v.created_at at time zone 'UTC' at time zone 'America/Sao_Paulo')::date as day,
       count(*)::int as sessions
from quiz_step_views v
join fads.quizzes q on q.quiz_id = v.quiz_id
join steps s on s.id = v.step_id
group by v.quiz_id, v.step_id, s."order", s.blocks_json, 6;

create or replace view fads.quiz_answer_daily as
select l.quiz_id,
       (l.created_at at time zone 'UTC' at time zone 'America/Sao_Paulo')::date as day,
       left(regexp_replace(b->>'question', '<[^>]+>', '', 'g'), 160) as question,
       left(regexp_replace(o->>'label', '<[^>]+>', '', 'g'), 120) as answer,
       count(*)::int as leads
from leads l
join fads.quizzes q on q.quiz_id = l.quiz_id
join steps s on s.quiz_id = l.quiz_id
cross join lateral jsonb_array_elements(s.blocks_json) b
cross join lateral jsonb_array_elements(b->'options') o
where b->>'type' = 'choice'
  and l.answers_json ? (b->>'id')
  and (o->>'id') = any (string_to_array(l.answers_json->>(b->>'id'), ','))
group by 1,2,3,4;
