import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { dealChanges, resolveDealContext } from '@/lib/api/v1/deals';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');
    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    const existing = await ctx.supabase.from('deals').select('id')
      .eq('id', id).eq('account_id', ctx.accountId).maybeSingle();
    if (existing.error || !existing.data) return fail('not_found', 'Deal not found', 404);
    const stageName = typeof body.stage === 'string' ? body.stage : 'New';
    const { pipelineId, stageId } = await resolveDealContext(
      ctx.supabase, ctx.accountId, stageName
    );
    const changes = dealChanges(body);
    delete changes.contact_id;
    const updated = await ctx.supabase.from('deals').update({
      ...changes, pipeline_id: pipelineId, stage_id: stageId,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('account_id', ctx.accountId);
    if (updated.error) throw updated.error;
    return ok({ id, updated: true });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
