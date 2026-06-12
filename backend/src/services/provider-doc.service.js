/**
 * Generador de la guía de integración webhook (.docx) para un proveedor PUSH.
 *
 * Plantilla parametrizada: el mismo documento que se entregó a WinBigVzla,
 * pero con los datos del proveedor inyectados y el texto de aceptación parcial
 * adaptado según `partialMode` (SPLIT | DROP | NONE).
 *
 * Uso:
 *   const buffer = await buildIntegrationDoc({ providerName, slug, endpoint,
 *     token, portalUrl, portalUser, portalPass, partialMode });
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType,
  convertInchesToTwip,
} from 'docx';

const BLUE = '2563EB';
const DARK = '1E3A5F';
const GRAY = '6B7280';
const LIGHT_BG = 'F1F5F9';
const INFO_BG = 'EFF6FF';
const WARN_BG = 'FEFCE8';
const GREEN_BG = 'F0FDF4';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, color: DARK, size: level === HeadingLevel.HEADING_1 ? 28 : 24 })],
  });
}

function para(texts, opts = {}) {
  const children = texts.map((t) => {
    if (typeof t === 'string') return new TextRun({ text: t, size: 22, font: 'Calibri' });
    return new TextRun({ size: 22, font: t.mono ? 'Consolas' : 'Calibri', ...t });
  });
  return new Paragraph({ spacing: { after: 120 }, ...opts, children });
}

function codeBlock(lines) {
  return lines.map((line) => new Paragraph({
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.CLEAR, fill: '1E293B' },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    children: [new TextRun({ text: line, font: 'Consolas', size: 17, color: 'E2E8F0' })],
  }));
}

function boxFactory(bg, borderColor) {
  return (texts) => new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: bg },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: borderColor } },
    children: texts.map((t) => (typeof t === 'string'
      ? new TextRun({ text: t, size: 22, font: 'Calibri' })
      : new TextRun({ size: 22, font: 'Calibri', ...t }))),
  });
}
const infoBox = boxFactory(INFO_BG, BLUE);
const successBox = boxFactory(GREEN_BG, '16A34A');
const warnBox = boxFactory(WARN_BG, 'EAB308');

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map((c) => new TableCell({
      shading: isHeader ? { type: ShadingType.CLEAR, fill: LIGHT_BG } : undefined,
      width: c.width ? { size: c.width, type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({
          text: c.text || c, bold: isHeader || c.bold,
          font: c.mono ? 'Consolas' : 'Calibri', size: 20,
        })],
      })],
    })),
  });
}

function simpleTable(headers, rows, colWidths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(headers.map((h, i) => ({ text: h, width: colWidths?.[i] })), true),
      ...rows.map((row) => tableRow(row.map((c, i) => ({
        ...(typeof c === 'string' ? { text: c } : c), width: colWidths?.[i],
      })))),
    ],
  });
}

function step(num, title, desc) {
  return [
    para([
      { text: `  ${num}  `, bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: BLUE } },
      { text: `  ${title}`, bold: true },
    ], { spacing: { before: 160, after: 40 } }),
    para([desc], { indent: { left: convertInchesToTwip(0.35) }, spacing: { after: 100 } }),
  ];
}

/**
 * Bloques de texto que dependen del modo de aceptación parcial.
 * @param {'NONE'|'DROP'|'SPLIT'} mode
 */
function partialContent(mode) {
  if (mode === 'SPLIT') {
    return {
      summaryBox: [
        { text: 'Aceptacion parcial por monto (diferencial): ', bold: true },
        'Cada numero tiene un cupo de venta por sorteo. Si una jugada pide mas de lo disponible, el sistema vende SOLO el diferencial disponible y descarta el excedente — no rechaza el numero completo. El monto en items puede ser MENOR al enviado. Si el numero ya esta agotado o bloqueado (cupo 0), esa jugada no aparece en items. El ticket se acepta mientras al menos una jugada venda algo; si ninguna vende, se rechaza con REJECTED.',
      ],
      reconBox: [
        { text: 'Regla de conciliacion: ', bold: true },
        'Comparen el monto enviado contra items[].amount por jugada. El amount de items es lo REALMENTE vendido; la diferencia fue descartada por cupo. El totalAmount es la suma de items, es decir lo realmente vendido.',
      ],
      partialExampleTitle: 'Aceptacion parcial (monto topeado al cupo):',
      partialExample: [
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "ticket": {',
        '    "id": 599002, "status": "ACCEPTED", "totalAmount": 2300,',
        '    "items": [',
        '      { "drawSlotId": "3",  "number": "05", "amount": 1500 },',
        '      { "drawSlotId": "16", "number": "12", "amount": 800 }',
        '    ]',
        '  }',
        '}',
      ],
      partialExampleNote: [
        { text: 'Ejemplo: ', bold: true },
        'Se pidio "05" por 1500 y "12" por 2000, pero "12" solo tenia 800 de cupo: se vendio 800 y se descartaron 1200. totalAmount = 1500 + 800 = 2300.',
      ],
      quotaRows: [
        ['Cupo parcial', 'La jugada pide mas de lo disponible. Vende el diferencial, descarta el excedente.', 'El amount en items es MENOR al enviado.'],
        ['Numero agotado / bloqueado', 'No queda cupo. No hay diferencial que vender.', 'La jugada NO aparece en items.'],
        ['Sorteo cerrado/sorteado', 'El sorteo ya paso o esta en proceso (DRAWN, CANCELLED, CLOSED).', 'Si TODAS apuntan a sorteos cerrados, el ticket se rechaza.'],
      ],
    };
  }
  if (mode === 'DROP') {
    return {
      summaryBox: [
        { text: 'Aceptacion parcial por jugada (descarte): ', bold: true },
        'Si un numero no tiene cupo o esta bloqueado, NO se rechaza el ticket completo: se crea el ticket solo con las jugadas disponibles y esa jugada se omite del arreglo items. Cada numero es todo-o-nada. Si ninguna jugada del ticket tiene cupo, se rechaza con REJECTED.',
      ],
      reconBox: [
        { text: 'Regla de conciliacion: ', bold: true },
        'Si una jugada no aparece en items, no se vendio (sin cupo o bloqueada). Comparen el arreglo plays enviado contra items para identificar las descartadas. El totalAmount es la suma de lo vendido.',
      ],
      partialExampleTitle: 'Aceptacion parcial (jugada sin cupo omitida):',
      partialExample: [
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "ticket": {',
        '    "id": 599002, "status": "ACCEPTED", "totalAmount": 1500,',
        '    "items": [',
        '      { "drawSlotId": "3", "number": "05", "amount": 1500 }',
        '    ]',
        '  }',
        '}',
      ],
      partialExampleNote: [
        { text: 'Ejemplo: ', bold: true },
        'Se pidio "05" por 1500 y "12" por 2000, pero "12" no tenia cupo: se acepto solo "05" y "12" no aparece en items. totalAmount = 1500.',
      ],
      quotaRows: [
        ['Sin cupo', 'El numero alcanzo su limite de venta.', 'La jugada no aparece en items. El resto del ticket se vende.'],
        ['Numero bloqueado', 'El administrador bloqueo ese numero.', 'La jugada no aparece en items. El resto del ticket se vende.'],
        ['Sorteo cerrado/sorteado', 'El sorteo ya paso o esta en proceso (DRAWN, CANCELLED, CLOSED).', 'Si TODAS apuntan a sorteos cerrados, el ticket se rechaza.'],
      ],
    };
  }
  // NONE
  return {
    summaryBox: [
      { text: 'Sin aceptacion parcial (todo-o-nada): ', bold: true },
      'Si CUALQUIER jugada del ticket excede el cupo disponible o esta bloqueada, se rechaza el TICKET COMPLETO con status REJECTED. El ticket solo se acepta si todas las jugadas tienen cupo.',
    ],
    reconBox: [
      { text: 'Regla de conciliacion: ', bold: true },
      'O el ticket entra completo (ACCEPTED con todas las jugadas en items) o se rechaza completo (REJECTED con el motivo). No hay ventas parciales.',
    ],
    partialExampleTitle: 'Rechazo por cupo (alguna jugada excede el cupo):',
    partialExample: [
      'HTTP 200',
      '{',
      '  "received": true,',
      '  "ticket": {',
      '    "status": "REJECTED",',
      '    "reason": "Cupo insuficiente para el numero 12"',
      '  }',
      '}',
    ],
    partialExampleNote: [
      { text: 'Nota: ', bold: true },
      'Como este canal es todo-o-nada, basta que una jugada no tenga cupo para rechazar el ticket completo.',
    ],
    quotaRows: [
      ['Cupo insuficiente', 'Alguna jugada excede el cupo disponible del numero.', 'Se rechaza el TICKET COMPLETO (REJECTED).'],
      ['Numero bloqueado', 'El administrador bloqueo un numero del ticket.', 'Se rechaza el TICKET COMPLETO (REJECTED).'],
      ['Sorteo cerrado/sorteado', 'El sorteo ya paso o esta en proceso (DRAWN, CANCELLED, CLOSED).', 'Se rechaza el ticket.'],
    ],
  };
}

/**
 * Construye el .docx de integración y devuelve un Buffer.
 *
 * @param {object} p
 * @param {string} p.providerName
 * @param {string} p.slug
 * @param {string} p.endpoint        - URL completa del webhook
 * @param {string} p.token           - webhookToken
 * @param {string} [p.portalUrl]     - URL de login del portal
 * @param {string} [p.portalUser]    - usuario del portal
 * @param {string} [p.portalPass]    - contraseña (solo si se acaba de generar)
 * @param {'NONE'|'DROP'|'SPLIT'} [p.partialMode='SPLIT']
 * @param {Date}   [p.date]
 * @returns {Promise<Buffer>}
 */
export async function buildIntegrationDoc(p) {
  const {
    providerName, slug, endpoint, token,
    portalUrl, portalUser, portalPass,
    partialMode = 'SPLIT', date = new Date(),
  } = p;

  const fecha = `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
  const pc = partialContent(partialMode);

  // Sección de portal (solo si hay usuario configurado)
  const portalSection = portalUser ? [
    heading('3. Portal del Proveedor (Reportes)'),
    para(['Ademas del webhook, cuentan con acceso web al portal de TOTE para consultar su reporte de ventas (ventas, premios, utilidad y numero de tickets), filtrado a su operacion. El portal es solo de lectura.']),
    simpleTable(['Parametro', 'Valor'], [
      ['URL de Acceso', { text: portalUrl || 'https://tote.atilax.io/login', mono: true }],
      ['Usuario', { text: portalUser, mono: true }],
      ['Contrasena', portalPass
        ? { text: portalPass, mono: true }
        : { text: '(entregada al crear el usuario — use "Resetear contrasena" si la perdio)' }],
    ], [25, 75]),
    warnBox([
      { text: 'Importante: ', bold: true },
      'No compartan estas credenciales. El usuario del portal es independiente del token del webhook: el token es para enviar ventas, el portal es para consultar reportes.',
    ]),
  ] : [];

  const sec = (n, extra = 0) => n + (portalUser ? 0 : -1) + extra; // renumera si no hay portal

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      properties: {
        page: { margin: { top: convertInchesToTwip(0.6), bottom: convertInchesToTwip(0.5), left: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8) } },
      },
      children: [
        // Header
        para([{ text: 'Guia de Integracion Webhook', bold: true, size: 36, color: DARK }]),
        para([
          { text: 'INTEGRACION COMPLETA', bold: true, size: 18, color: '166534' },
          { text: '    ', size: 18 },
          { text: 'CONFIDENCIAL', bold: true, size: 18, color: '991B1B' },
        ], { spacing: { after: 40 } }),
        para([{ text: `Proveedor: ${providerName} (canal ${slug})  |  Fecha: ${fecha}  |  Version: 1.0`, color: GRAY, size: 20 }]),
        new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: BLUE } }, children: [] }),

        // 1. Resumen
        heading('1. Resumen'),
        para([
          'Este documento describe como enviar jugadas al sistema ',
          { text: 'TOTE', bold: true }, ' desde su plataforma ', { text: providerName, bold: true },
          ' mediante webhooks. El sistema procesa las jugadas en tiempo real, crea tickets y retorna una respuesta indicando que se vendio de cada jugada.',
        ]),
        successBox([
          { text: 'Como funciona: ', bold: true },
          'Ustedes envian un POST con una o varias jugadas. El sistema valida y procesa cada jugada al instante. La respuesta incluye el estado del ticket (ACCEPTED o REJECTED) y, cuando es ACCEPTED, un arreglo items con el desglose de lo vendido (sorteo, numero y monto).',
        ]),
        infoBox(pc.summaryBox),
        warnBox(pc.reconBox),

        // 2. Conexion
        heading('2. Datos de Conexion'),
        simpleTable(['Parametro', 'Valor'], [
          ['URL del Endpoint', { text: endpoint, mono: true }],
          ['Metodo HTTP', { text: 'POST', mono: true }],
          ['Header de Autenticacion', { text: 'X-Webhook-Token', mono: true }],
          ['Token', { text: token || '(genere el token en el panel)', mono: true }],
          ['Content-Type', { text: 'application/json', mono: true }],
          ['Limite de payload', '64 KB'],
        ], [25, 75]),
        warnBox([
          { text: 'Seguridad: ', bold: true },
          'El token debe enviarse en el header X-Webhook-Token en cada solicitud. Las solicitudes sin token o con token invalido seran rechazadas con codigo 401. No compartan el token en canales no seguros.',
        ]),

        // 3. Portal (opcional)
        ...portalSection,

        // 4. Payload
        heading(`${sec(4)}. Formato del Payload`),
        para([
          'El payload debe enviarse como JSON con la siguiente estructura. El campo ',
          { text: 'plays', bold: true }, ' es un array que permite enviar una o varias jugadas en una sola solicitud.',
        ]),
        ...codeBlock([
          '{',
          `  "ticketId": "${slug.toUpperCase().slice(0, 6)}-0001",`,
          '  "game": "lotoanimalito",',
          '  "plays": [',
          '    { "drawSlotId": "3",  "amount": 1500, "animal": "LEON",    "number": "05" },',
          '    { "drawSlotId": "16", "amount": 2000, "animal": "CABALLO", "number": "12" }',
          '  ],',
          '  "timestamp": "2026-06-11T14:30:00-04:00"',
          '}',
        ]),
        para([{ text: '\nDescripcion de campos:', bold: true }], { spacing: { before: 160 } }),
        simpleTable(['Campo', 'Tipo', 'Req.', 'Descripcion'], [
          [{ text: 'ticketId', mono: true }, 'string', 'Si', 'ID unico del ticket en su sistema. Evita duplicados.'],
          [{ text: 'game', mono: true }, 'string', 'No', 'Nombre del juego (informativo). El juego real lo determina el drawSlotId.'],
          [{ text: 'plays', mono: true }, 'array', 'Si', 'Array de jugadas. Cada una con su sorteo, numero y monto.'],
          [{ text: 'plays[].drawSlotId', mono: true }, 'str/num', 'Si', 'ID del slot de sorteo (1-48). Ver seccion de slots.'],
          [{ text: 'plays[].amount', mono: true }, 'number', 'Si', 'Monto apostado en bolivares.'],
          [{ text: 'plays[].number', mono: true }, 'string', 'Si', 'Numero apostado (ej: "05", "12", "00"). Debe existir en el juego.'],
          [{ text: 'plays[].animal', mono: true }, 'string', 'No', 'Nombre del animal (informativo). El sistema usa number.'],
          [{ text: 'timestamp', mono: true }, 'string', 'No', 'Fecha/hora ISO 8601.'],
        ], [22, 12, 8, 58]),
        warnBox([
          { text: 'number: ', bold: true },
          'Debe ser un string con el numero exacto (ej: "05", no "5"). En LOTOANIMALITO y LOTTOPANTERA, "0" (DELFIN) y "00" (BALLENA) son distintos — envien el string exacto.',
        ]),

        // 5. Respuestas
        heading(`${sec(5)}. Respuestas del Servidor`),
        para([{ text: 'Jugada aceptada (todo vendido):', bold: true }], { spacing: { before: 80 } }),
        ...codeBlock([
          'HTTP 200',
          '{',
          '  "received": true,',
          '  "ticket": {',
          '    "id": 599001, "status": "ACCEPTED", "totalAmount": 3500,',
          '    "items": [',
          '      { "drawSlotId": "3",  "number": "05", "amount": 1500 },',
          '      { "drawSlotId": "16", "number": "12", "amount": 2000 }',
          '    ]',
          '  }',
          '}',
        ]),
        infoBox([
          { text: 'ticket.id: ', bold: true },
          'Numero entero unico del ticket en nuestro sistema. Ustedes envian su ticketId (string) y nosotros retornamos nuestro id. Guardenlo para referencia cruzada.',
        ]),
        para([{ text: `\n${pc.partialExampleTitle}`, bold: true }], { spacing: { before: 160 } }),
        ...codeBlock(pc.partialExample),
        infoBox(pc.partialExampleNote),
        para([{ text: '\nRechazado (ninguna jugada vendible / sorteo cerrado):', bold: true }], { spacing: { before: 160 } }),
        ...codeBlock([
          'HTTP 200',
          '{ "received": true, "ticket": { "status": "REJECTED", "reason": "Draw for slot 3 is DRAWN — bets not accepted" } }',
        ]),
        para([{ text: '\nToken invalido:', bold: true }], { spacing: { before: 160 } }),
        ...codeBlock(['HTTP 401', '{ "error": "Unauthorized" }']),
        infoBox([
          { text: 'Nota: ', bold: true },
          'El servidor siempre retorna HTTP 200 cuando el token es valido, incluso si la jugada se rechaza. ticket.status indica el resultado. Solo un token invalido genera HTTP 401.',
        ]),

        // 6. Anulacion
        heading(`${sec(6)}. Anulacion de Tickets`),
        para([
          'Para anular un ticket, reenvien el ', { text: 'mismo ticketId', bold: true },
          ' sin el arreglo plays (o con plays vacio).',
        ]),
        ...codeBlock([
          `POST ${endpoint}`,
          `{ "ticketId": "${slug.toUpperCase().slice(0, 6)}-0001" }`,
          '',
          'HTTP 200',
          '{ "received": true, "ticket": { "id": 599001, "status": "ANNULLED" } }',
        ]),
        warnBox([
          { text: 'Importante: ', bold: true },
          'La anulacion solo se permite mientras el sorteo sigue ABIERTO (SCHEDULED). Los sorteos cierran 5 minutos antes de la hora; una vez cerrado/sorteado/cancelado, la anulacion se rechaza.',
        ]),

        // 7. Motivos de rechazo
        heading(`${sec(7)}. Motivos de Rechazo`),
        para([{ text: 'Errores estructurales (rechazan todo el ticket):', bold: true }], { spacing: { before: 120 } }),
        simpleTable(['Motivo', 'Descripcion', 'Como corregir'], [
          ['drawSlotId invalido', 'El ID de slot no esta en 1-48.', 'Usar solo IDs del 1 al 48.'],
          ['Numero no encontrado', 'El numero no existe en el juego del slot.', 'Verificar el numero valido para el juego.'],
          ['Ticket duplicado', 'Ya existe un ticket con ese ticketId.', 'Usar un ticketId unico por solicitud.'],
          ['Payload mal formado', 'JSON invalido o campos faltantes.', 'Revisar la estructura del payload.'],
        ], [22, 43, 35]),
        para([{ text: '\nDisponibilidad / cupo:', bold: true }], { spacing: { before: 160 } }),
        simpleTable(['Situacion', 'Que hace el sistema', 'Como interpretarlo'], pc.quotaRows, [22, 43, 35]),

        // 8. Slots
        heading(`${sec(8)}. Referencia de Slots`),
        para(['Los 48 slots se distribuyen en 4 juegos con 12 horarios cada uno (08:00 a 19:00). El drawSlotId resuelve al sorteo del dia de hoy para ese juego y hora.']),
        simpleTable(['Juego', 'Slots', 'Rango de Numeros'], [
          ['LOTOANIMALITO', '1 - 12', '"0", "00" a "36" ("0"=DELFIN, "00"=BALLENA)'],
          ['LOTTOPANTERA', '13 - 24', '"0", "00" a "48" ("0"=DELFIN, "00"=BALLENA)'],
          ['TRIPLE PANTERA', '25 - 36', '"000" a "999"'],
          ['TERMINAL PANTERA', '37 - 48', '"00" a "99"'],
        ], [30, 15, 55]),
        para([{ text: '\nMapeo de slot por hora:', bold: true }], { spacing: { before: 120 } }),
        simpleTable(['Hora', 'LOTOANIM.', 'LOTTOPANT.', 'TRIPLE', 'TERMINAL'], [
          ['08:00', '1', '13', '25', '37'], ['09:00', '2', '14', '26', '38'],
          ['10:00', '3', '15', '27', '39'], ['11:00', '4', '16', '28', '40'],
          ['12:00', '5', '17', '29', '41'], ['13:00', '6', '18', '30', '42'],
          ['14:00', '7', '19', '31', '43'], ['15:00', '8', '20', '32', '44'],
          ['16:00', '9', '21', '33', '45'], ['17:00', '10', '22', '34', '46'],
          ['18:00', '11', '23', '35', '47'], ['19:00', '12', '24', '36', '48'],
        ], [20, 20, 20, 20, 20]),

        // 9. Ejemplo curl
        heading(`${sec(9)}. Ejemplo (curl)`),
        ...codeBlock([
          `curl -X POST ${endpoint} \\`,
          '  -H "Content-Type: application/json" \\',
          `  -H "X-Webhook-Token: ${token || '<TOKEN>'}" \\`,
          '  -d \'{',
          `    "ticketId": "${slug.toUpperCase().slice(0, 6)}-0001",`,
          '    "plays": [ { "drawSlotId": "3", "amount": 1500, "number": "05" } ]',
          '  }\'',
        ]),

        // 10. Pruebas
        heading(`${sec(10)}. Pruebas Recomendadas`),
        ...step('1', 'Jugada aceptada', 'Envie una jugada a un sorteo abierto. Verifique status ACCEPTED, ticket.id e items.'),
        ...step('2', 'Sorteo cerrado', 'Envie a un sorteo ya pasado. Verifique status REJECTED con el motivo.'),
        ...step('3', 'Multiples jugadas', 'Envie 2-3 jugadas en plays. Verifique un solo ticket con todas en items.'),
        ...step('4', 'Cupo / parcial', 'Envie una jugada que toque un numero con cupo limitado y observe el comportamiento descrito en la seccion de respuestas.'),
        ...step('5', 'Duplicado', 'Reenvie el mismo ticketId. Debe recibir respuesta de duplicado.'),
        ...step('6', 'Anulacion', 'Envie una jugada (sorteo abierto) y reenvie el mismo ticketId sin plays. Verifique ANNULLED.'),

        // Footer
        new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' } }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 80 },
          children: [new TextRun({ text: `TOTE Platform — Documento de integracion para ${providerName} — Confidencial`, size: 18, color: GRAY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Generado el ${fecha}`, size: 18, color: GRAY })],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
