import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { dealChanges, resolveDealContext } from '@/lib/api/v1/deals';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const contactId = typeof body.contact_id === 'string' ? body.contact_id : '';
    if (!title || !contactId) {
      return fail('bad_request', "'title' and 'contact_id' are required", 400);
    }
    const contact = await ctx.supabase
      .from('contacts').select('id').eq('id', contactId)
      .eq('account_id', ctx.accountId).maybeSingle();
    if (contact.error || !contact.data) return fail('not_found', 'Contact not found', 404);

    const stageName = typeof body.stage === 'string' ? body.stage : 'New';
    const { userId, pipelineId, stageId } = await resolveDealContext(
      ctx.supabase, ctx.accountId, stageName
    );
    const changes = dealChanges(body);
    const existing = await ctx.supabase
      .from('deals').select('id').eq('account_id', ctx.accountId)
      .eq('contact_id', contactId).eq('title', title)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const updated = await ctx.supabase.from('deals').update({
        ...changes, stage_id: stageId, pipeline_id: pipelineId,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.data.id).eq('account_id', ctx.accountId);
      if (updated.error) throw updated.error;
      return ok({ id: existing.data.id, created: false });
    }
    const created = await ctx.supabase.from('deals').insert({
      ...changes, account_id: ctx.accountId, user_id: userId,
      pipeline_id: pipelineId, stage_id: stageId, title,
      contact_id: contactId, currency: 'INR', status: changes.status || 'open',
    }).select('id').single();
    if (created.error) throw created.error;
    return ok({ id: created.data.id, created: true }, 201);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
