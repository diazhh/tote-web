import { welcomeVerifyTemplate } from './welcome-verify.js';
import { forgotPasswordTemplate } from './forgot-password.js';
import { withdrawalRequestTemplate } from './withdrawal-request.js';
import { depositApprovedTemplate } from './deposit-approved.js';

const templates = {
  'welcome-verify': welcomeVerifyTemplate,
  'forgot-password': forgotPasswordTemplate,
  'withdrawal-request': withdrawalRequestTemplate,
  'deposit-approved': depositApprovedTemplate,
};

function wrapLayout(content) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://tote.atilax.io';
  const logoUrl = `${frontendUrl}/images/multiloterias-logo.png`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multiloterias</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
              <img src="${logoUrl}" alt="Multiloterias" width="180" style="display:block;margin:0 auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef;">
              <p style="margin:0;font-size:12px;color:#6c757d;text-align:center;line-height:1.5;">
                Este correo fue enviado por <strong>Multiloterias</strong>.<br>
                Si no solicitaste esta acción, puedes ignorar este mensaje.<br>
                <a href="${frontendUrl}" style="color:#2563eb;text-decoration:none;">tote.atilax.io</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderTemplate(name, data) {
  const templateFn = templates[name];
  if (!templateFn) throw new Error(`Email template "${name}" not found`);
  const content = templateFn(data);
  return wrapLayout(content);
}
