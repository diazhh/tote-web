export function depositApprovedTemplate({ username, amount, newBalance }) {
  return `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">
      Saldo acreditado
    </h2>
    <p style="margin:0 0 16px;color:#495057;font-size:15px;line-height:1.6;">
      Hola <strong>${username}</strong>, tu depósito ha sido aprobado y el saldo fue acreditado en tu cuenta.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#d4edda;border-radius:8px;margin:20px 0;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#155724;font-size:13px;padding:6px 0;">Monto acreditado</td>
              <td align="right" style="font-size:20px;font-weight:bold;color:#155724;padding:6px 0;">+ Bs. ${parseFloat(amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color:#155724;font-size:13px;padding:6px 0;">Nuevo saldo</td>
              <td align="right" style="font-size:18px;font-weight:bold;color:#1e3a5f;padding:6px 0;">Bs. ${parseFloat(newBalance).toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL || 'https://tote.atilax.io'}/dashboard" style="display:inline-block;background-color:#28a745;color:#ffffff;font-size:16px;font-weight:bold;padding:14px 40px;border-radius:8px;text-decoration:none;">
        Ir a jugar
      </a>
    </div>
    <p style="margin:0;color:#6c757d;font-size:13px;line-height:1.5;">
      ¡Buena suerte en tus jugadas!
    </p>
  `;
}
