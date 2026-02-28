export function forgotPasswordTemplate({ username, resetUrl }) {
  return `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">
      Recuperar contraseña
    </h2>
    <p style="margin:0 0 12px;color:#495057;font-size:15px;line-height:1.6;">
      Hola <strong>${username}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta en Multiloterias.
    </p>
    <p style="margin:0 0 24px;color:#495057;font-size:15px;line-height:1.6;">
      Haz clic en el siguiente botón para crear una nueva contraseña:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:bold;padding:14px 40px;border-radius:8px;text-decoration:none;">
        Restablecer contraseña
      </a>
    </div>
    <p style="margin:0 0 12px;color:#6c757d;font-size:13px;line-height:1.5;">
      Si no puedes hacer clic en el botón, copia y pega este enlace en tu navegador:<br>
      <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
    </p>
    <p style="margin:16px 0 0;color:#6c757d;font-size:13px;line-height:1.5;background-color:#f8d7da;padding:12px 16px;border-radius:8px;border-left:4px solid #dc3545;">
      Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no será modificada.
    </p>
  `;
}
