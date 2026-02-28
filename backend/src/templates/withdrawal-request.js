export function withdrawalRequestTemplate({ username, amount, createdAt }) {
  const date = new Date(createdAt).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">
      Solicitud de retiro recibida
    </h2>
    <p style="margin:0 0 16px;color:#495057;font-size:15px;line-height:1.6;">
      Hola <strong>${username}</strong>, hemos recibido tu solicitud de retiro de fondos.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4ff;border-radius:8px;margin:20px 0;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#6c757d;font-size:13px;padding:6px 0;">Monto solicitado</td>
              <td align="right" style="font-size:20px;font-weight:bold;color:#1e3a5f;padding:6px 0;">Bs. ${parseFloat(amount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="color:#6c757d;font-size:13px;padding:6px 0;">Fecha de solicitud</td>
              <td align="right" style="color:#495057;font-size:14px;padding:6px 0;">${date}</td>
            </tr>
            <tr>
              <td style="color:#6c757d;font-size:13px;padding:6px 0;">Estado</td>
              <td align="right" style="padding:6px 0;">
                <span style="display:inline-block;background-color:#fff3cd;color:#856404;font-size:12px;font-weight:bold;padding:4px 12px;border-radius:12px;">Pendiente</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6c757d;font-size:13px;line-height:1.5;">
      Tu solicitud será procesada por nuestro equipo. Te notificaremos cuando el retiro sea completado.
    </p>
  `;
}
