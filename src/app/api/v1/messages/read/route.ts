import { requireApiKey } from '@/lib/auth/api-context'
import { fail, ok, toApiErrorResponse } from '@/lib/api/v1/respond'
import { decrypt } from '@/lib/whatsapp/encryption'
import { markMessageRead } from '@/lib/whatsapp/meta-api'

/** Mark a received WhatsApp message read and display the typing indicator. */
export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'messages:send')
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const messageId = typeof body?.message_id === 'string' ? body.message_id.trim() : ''
    if (!messageId) {
      return fail('bad_request', "'message_id' is required", 400)
    }

    const { data: config, error } = await ctx.supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', ctx.accountId)
      .single()

    if (error || !config) {
      return fail('whatsapp_not_configured', 'WhatsApp is not configured', 400)
    }

    try {
      await markMessageRead({
        phoneNumberId: config.phone_number_id,
        accessToken: decrypt(config.access_token),
        messageId,
        showTyping: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Meta API request failed'
      return fail('meta_error', message, 502)
    }

    return ok({ message_id: messageId, read: true, typing: true })
  } catch (error) {
    return toApiErrorResponse(error)
  }
}
