// Cloudflare Pages Function — handles POST /api/contact from the homepage form.
// Requires a RESEND_API_KEY secret (set via the Cloudflare dashboard or
// `wrangler pages secret put RESEND_API_KEY`). Optional CONTACT_TO_EMAIL env
// var overrides the destination address.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const name = (data.name || '').trim();
  const school = (data.school || '').trim();
  const email = (data.email || '').trim();
  const message = (data.message || '').trim();

  if (!name || !school || !email) {
    return jsonResponse({ error: 'Missing required fields' }, 400);
  }
  if (!EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'RoxAI Website <onboarding@resend.dev>',
      to: env.CONTACT_TO_EMAIL || 'team.roxaiagency@gmail.com',
      reply_to: email,
      subject: `New contact form message from ${name} (${school})`,
      text: `Name: ${name}\nSchool: ${school}\nEmail: ${email}\n\nMessage:\n${message || '(no message provided)'}`,
    }),
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text();
    return jsonResponse({ error: 'Failed to send email', detail }, 502);
  }

  return jsonResponse({ success: true }, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
