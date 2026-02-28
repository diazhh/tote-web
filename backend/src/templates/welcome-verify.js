export function welcomeVerifyTemplate({ username, code }) {
  return `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">
      ¡Bienvenido a Multiloterias, ${username}!
    </h2>
    <p style="margin:0 0 12px;color:#495057;font-size:15px;line-height:1.6;">
      Tu cuenta ha sido creada exitosamente. Para mayor seguridad, te pedimos que verifiques tu correo electrónico ingresando el siguiente código en la plataforma:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background-color:#f0f4ff;border:2px dashed #2563eb;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;">${code}</span>
      </div>
    </div>
    <p style="margin:0 0 12px;color:#495057;font-size:15px;line-height:1.6;">
      Este código expira en <strong>10 minutos</strong>.
    </p>
    <p style="margin:0 0 12px;color:#6c757d;font-size:13px;line-height:1.5;background-color:#fff3cd;padding:12px 16px;border-radius:8px;border-left:4px solid #ffc107;">
      <strong>¿No ves el correo?</strong> Revisa tu carpeta de <strong>spam</strong> o <strong>correo no deseado</strong>. Si lo encuentras allí, marca este correo como "No es spam" para recibir futuros mensajes correctamente.
    </p>
    <p style="margin:24px 0 0;color:#495057;font-size:15px;">
      ¡Buena suerte en tus jugadas!
    </p>
  `;
}
