import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_STAGES = [
  { name: 'New', color: '#94a3b8' },
  { name: 'Qualified', color: '#3b82f6' },
  { name: 'Visit Planned', color: '#8b5cf6' },
  { name: 'Negotiation', color: '#f59e0b' },
  { name: 'Approval', color: '#ec4899' },
  { name: 'Won', color: '#10b981' },
  { name: 'Lost', color: '#ef4444' },
];

export async function resolveDealContext(
  supabase: SupabaseClient,
  accountId: string,
  requestedStage = 'New'
) {
  const profile = await supabase
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (profile.error || !profile.data?.user_id) {
    throw new Error('No WACRM account member is available for this deal');
  }
  const userId = String(profile.data.user_id);
  let pipelineResult = await supabase
    .from('pipelines')
    .select('id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pipelineResult.error) throw pipelineResult.error;
  if (!pipelineResult.data) {
    pipelineResult = await supabase
      .from('pipelines')
      .insert({ account_id: accountId, user_id: userId, name: 'Sales Pipeline' })
      .select('id')
      .single();
    if (pipelineResult.error) throw pipelineResult.error;
  }
  const pipelineId = String(pipelineResult.data?.id || '');
  let stages = await supabase
    .from('pipeline_stages')
    .select('id,name,position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });
  if (stages.error) throw stages.error;
  if (!stages.data?.length) {
    stages = await supabase
      .from('pipeline_stages')
      .insert(DEFAULT_STAGES.map((stage, position) => ({
        pipeline_id: pipelineId, ...stage, position,
      })))
      .select('id,name,position')
      .order('position', { ascending: true });
    if (stages.error) throw stages.error;
  }
  const requested = requestedStage.trim().toLowerCase();
  const stage = stages.data?.find(
    (candidate) => String(candidate.name).toLowerCase() === requested
  ) || stages.data?.[0];
  if (!stage?.id) throw new Error('No pipeline stage is available');
  return { userId, pipelineId, stageId: String(stage.id) };
}

export function dealChanges(body: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const field of ['contact_id', 'title', 'notes', 'expected_close_date', 'status'] as const) {
    if (field in body) updates[field] = body[field] || null;
  }
  if ('value' in body) updates.value = Math.max(0, Number(body.value) || 0);
  if ('value' in body || 'currency' in body) updates.currency = 'INR';
  return updates;
}
