// Sale notification email: Brevo first, Resend if Brevo fails.
// Email is best effort: nothing here throws, a failed email must never break the site.

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

export function saleEmail(sale, quantity) {
  const amount = `RD$${(sale.amountCents / 100).toFixed(2)}`;
  return {
    subject: `🥥 Venta: ${quantity} coco(s) · ${amount}`,
    body: `
      <h3>Nuevo pago aprobado en El Cocotazo</h3>
      <ul>
        <li><strong>Cocos:</strong> ${escapeHtml(quantity)}</li>
        <li><strong>Monto:</strong> ${escapeHtml(amount)}</li>
        <li><strong>Orden:</strong> ${escapeHtml(sale.orderNumber)}</li>
        <li><strong>Autorización:</strong> ${escapeHtml(sale.authorizationCode)}</li>
        <li><strong>RRN:</strong> ${escapeHtml(sale.rrn)}</li>
        <li><strong>Fecha AZUL:</strong> ${escapeHtml(sale.dateTime)}</li>
      </ul>
    `,
  };
}

async function sendViaBrevo(env, email) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // Must be a sender address verified in Brevo.
      sender: { name: 'El Cocotazo', email: env.SENDER_EMAIL },
      to: [{ email: env.OWNER_EMAIL }],
      subject: email.subject,
      htmlContent: email.body,
    }),
  });
  return response.status;
}

async function sendViaResend(env, email) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // resend.dev sender only delivers to the Resend account's own address.
      from: 'El Cocotazo <onboarding@resend.dev>',
      to: env.OWNER_EMAIL,
      subject: email.subject,
      html: email.body,
    }),
  });
  return response.status;
}

// Returns true if some provider accepted the email, false otherwise.
export async function sendEmailWithFallback(env, email) {
  if (!env.OWNER_EMAIL) {
    console.warn('Sale email skipped: OWNER_EMAIL is not configured');
    return false;
  }

  const providers = [
    { name: 'Brevo', configured: env.BREVO_API_KEY && env.SENDER_EMAIL, send: sendViaBrevo },
    { name: 'Resend', configured: env.RESEND_API_KEY, send: sendViaResend },
  ];

  const configured = providers.filter((provider) => provider.configured);
  if (configured.length === 0) {
    // Names only, never values: Brevo needs both of its variables, Resend needs one.
    const missing = ['BREVO_API_KEY', 'SENDER_EMAIL', 'RESEND_API_KEY'].filter((name) => !env[name]);
    console.error(`Sale email not sent: no provider configured (missing ${missing.join(', ')})`);
    return false;
  }

  for (const provider of configured) {
    try {
      const status = await provider.send(env, email);
      if (status >= 200 && status < 300) {
        console.log(`Email delivered via ${provider.name}`);
        return true;
      }
      console.warn(`${provider.name} returned status ${status}`);
    } catch (err) {
      console.warn(`${provider.name} network error`, err);
    }
  }

  const tried = configured.map((provider) => provider.name).join(', ');
  console.error(`Sale email not sent: all configured providers failed (tried ${tried})`);
  return false;
}
