import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType,
  convertInchesToTwip
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Reusable styles
const BLUE = '2563EB';
const DARK = '1E3A5F';
const GRAY = '6B7280';
const LIGHT_BG = 'F1F5F9';
const INFO_BG = 'EFF6FF';
const WARN_BG = 'FEFCE8';
const GREEN_BG = 'F0FDF4';

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, color: DARK, size: level === HeadingLevel.HEADING_1 ? 28 : 24 })],
  });
}

function para(texts, opts = {}) {
  const children = texts.map(t => {
    if (typeof t === 'string') return new TextRun({ text: t, size: 22, font: 'Calibri' });
    return new TextRun({ size: 22, font: t.mono ? 'Consolas' : 'Calibri', ...t });
  });
  return new Paragraph({ spacing: { after: 120 }, ...opts, children });
}

function codePara(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    children: [new TextRun({ text, font: 'Consolas', size: 18 })],
  });
}

function codeBlock(lines) {
  return lines.map(line =>
    new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { type: ShadingType.CLEAR, fill: '1E293B' },
      indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
      children: [new TextRun({ text: line, font: 'Consolas', size: 17, color: 'E2E8F0' })],
    })
  );
}

function infoBox(texts) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: INFO_BG },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: BLUE } },
    children: texts.map(t => typeof t === 'string'
      ? new TextRun({ text: t, size: 22, font: 'Calibri' })
      : new TextRun({ size: 22, font: 'Calibri', ...t })
    ),
  });
}

function successBox(texts) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: GREEN_BG },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: '16A34A' } },
    children: texts.map(t => typeof t === 'string'
      ? new TextRun({ text: t, size: 22, font: 'Calibri' })
      : new TextRun({ size: 22, font: 'Calibri', ...t })
    ),
  });
}

function warnBox(texts) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: WARN_BG },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' } },
    children: texts.map(t => typeof t === 'string'
      ? new TextRun({ text: t, size: 22, font: 'Calibri' })
      : new TextRun({ size: 22, font: 'Calibri', ...t })
    ),
  });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(c => new TableCell({
      shading: isHeader ? { type: ShadingType.CLEAR, fill: LIGHT_BG } : undefined,
      width: c.width ? { size: c.width, type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({
          text: c.text || c,
          bold: isHeader || c.bold,
          font: c.mono ? 'Consolas' : 'Calibri',
          size: 20,
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
      ...rows.map(row => tableRow(row.map((c, i) => ({
        ...(typeof c === 'string' ? { text: c } : c),
        width: colWidths?.[i],
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

// ─── Build Document ───

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(0.6), bottom: convertInchesToTwip(0.5), left: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8) },
      },
    },
    children: [
      // ── Header ──
      para([
        { text: 'Guia de Integracion Webhook', bold: true, size: 36, color: DARK },
      ]),
      para([
        { text: 'FASE 2 — INTEGRACION COMPLETA', bold: true, size: 18, color: '166534' },
        { text: '    ', size: 18 },
        { text: 'CONFIDENCIAL', bold: true, size: 18, color: '991B1B' },
      ], { spacing: { after: 40 } }),
      para([
        { text: 'Proveedor: Premier  |  Fecha: 14 de abril de 2026  |  Version: 2.0', color: GRAY, size: 20 },
      ]),
      new Paragraph({
        spacing: { after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: BLUE } },
        children: [],
      }),

      // ── 1. Resumen ──
      heading('1. Resumen'),
      para([
        'Este documento describe como enviar jugadas al sistema ',
        { text: 'TOTE', bold: true },
        ' en la ',
        { text: 'Fase 2 — Integracion Completa', bold: true },
        '. El sistema ahora procesa las jugadas en tiempo real, crea tickets y retorna respuestas indicando si cada jugada fue aceptada o rechazada.',
      ]),
      successBox([
        { text: 'Cambio principal vs Fase 1: ', bold: true },
        'Ahora el sistema valida y procesa cada jugada. La respuesta incluye el estado del ticket (ACCEPTED o REJECTED) con el motivo si fue rechazada. El endpoint y token siguen siendo los mismos.',
      ]),

      // ── 2. Datos de Conexion ──
      heading('2. Datos de Conexion'),
      simpleTable(
        ['Parametro', 'Valor'],
        [
          ['URL del Endpoint', { text: 'https://toteback.atilax.io/api/webhooks/premier', mono: true }],
          ['Metodo HTTP', { text: 'POST', mono: true }],
          ['Header de Autenticacion', { text: 'X-Webhook-Token', mono: true }],
          ['Token', { text: '7ec15f3c38754e38075330940ab9c65aa1a223bee356e627a51b23ce297d3c34', mono: true }],
          ['Content-Type', { text: 'application/json', mono: true }],
          ['Limite de payload', '1 MB'],
        ],
        [25, 75],
      ),
      infoBox([
        { text: 'Sin cambios: ', bold: true },
        'El endpoint, token y metodo de autenticacion son identicos a la Fase 1. No necesitan modificar su configuracion de conexion.',
      ]),

      // ── 3. Formato del Payload ──
      heading('3. Formato del Payload'),
      para([
        'El payload debe enviarse como JSON con la siguiente estructura. El campo ',
        { text: 'plays', bold: true },
        ' es un array que permite enviar una o varias jugadas en una sola solicitud.',
      ]),
      ...codeBlock([
        '{',
        '  "ticketId": "PRM-20260414-001",',
        '  "game": "lotoanimalito",',
        '  "plays": [',
        '    {',
        '      "drawSlotId": "5",',
        '      "amount": 1500,',
        '      "animal": "LEON",',
        '      "number": "05"',
        '    },',
        '    {',
        '      "drawSlotId": "18",',
        '      "amount": 2000,',
        '      "animal": "CABALLO",',
        '      "number": "12"',
        '    }',
        '  ],',
        '  "timestamp": "2026-04-14T14:30:00-04:00"',
        '}',
      ]),

      para([{ text: '\nDescripcion de campos:', bold: true }], { spacing: { before: 160 } }),
      simpleTable(
        ['Campo', 'Tipo', 'Requerido', 'Descripcion'],
        [
          [{ text: 'ticketId', mono: true }, 'string', 'Si', 'ID unico del ticket en su sistema. Se usa para evitar duplicados.'],
          [{ text: 'game', mono: true }, 'string', 'No', 'Nombre del juego (informativo). El juego real se determina por el drawSlotId.'],
          [{ text: 'plays', mono: true }, 'array', 'Si', 'Array de jugadas. Cada jugada tiene su propio sorteo, numero y monto.'],
          [{ text: 'plays[].drawSlotId', mono: true }, 'string/number', 'Si', 'ID del slot de sorteo (1-48). Ver catalogo de sorteos. Puede ser string o numero.'],
          [{ text: 'plays[].amount', mono: true }, 'number', 'Si', 'Monto apostado en bolivares.'],
          [{ text: 'plays[].number', mono: true }, 'string', 'Si', 'Numero apostado (ej: "05", "12", "00"). Debe coincidir con un numero valido del juego.'],
          [{ text: 'plays[].animal', mono: true }, 'string', 'No', 'Nombre del animal (informativo). El sistema usa el campo number para identificar la jugada.'],
          [{ text: 'timestamp', mono: true }, 'string', 'No', 'Fecha/hora de la jugada en formato ISO 8601.'],
        ],
        [22, 12, 10, 56],
      ),

      warnBox([
        { text: 'Importante — drawSlotId: ', bold: true },
        'El drawSlotId determina a que juego y hora de sorteo va dirigida la jugada. Consulte el documento "Catalogo de Sorteos Premier" para ver la tabla completa de 48 slots. El campo game es informativo y no se usa para resolver el sorteo.',
      ]),

      warnBox([
        { text: 'Importante — number: ', bold: true },
        'El campo number debe ser un string con el numero exacto registrado en el sistema (ej: "05", no "5"). Si el numero no existe en el juego correspondiente, la jugada sera rechazada. Atencion: en LOTOANIMALITO y LOTTOPANTERA, "0" (DELFIN) y "00" (BALLENA) son numeros distintos — envien el string exacto.',
      ]),

      // ── 4. Respuestas del Servidor ──
      heading('4. Respuestas del Servidor'),

      para([{ text: 'Jugada aceptada (ticket creado exitosamente):', bold: true }], { spacing: { before: 80 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "logId": "83ddf68c-a1b2-4c3d-8e5f-6789abcdef01",',
        '  "ticket": {',
        '    "id": 106504,',
        '    "status": "ACCEPTED"',
        '  }',
        '}',
      ]),
      infoBox([
        { text: 'ticket.id: ', bold: true },
        'Es un numero entero unico y secuencial que identifica el ticket en nuestro sistema. Ustedes envian su ticketId (string) y nosotros retornamos nuestro id numerico. Guardenlo para referencia cruzada.',
      ]),

      para([{ text: '\nJugada rechazada (con motivo):', bold: true }], { spacing: { before: 160 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "logId": "83ddf68c-a1b2-4c3d-8e5f-6789abcdef01",',
        '  "ticket": {',
        '    "status": "REJECTED",',
        '    "reason": "Draw for slot 5 is DRAWN — bets not accepted"',
        '  }',
        '}',
      ]),

      para([{ text: '\nToken invalido:', bold: true }], { spacing: { before: 160 } }),
      ...codeBlock([
        'HTTP 401',
        '{',
        '  "error": "Unauthorized"',
        '}',
      ]),

      infoBox([
        { text: 'Nota: ', bold: true },
        'El servidor siempre retorna HTTP 200 cuando el token es valido, incluso si la jugada es rechazada. El campo ticket.status indica si la jugada fue aceptada o rechazada. Solo un token invalido genera HTTP 401.',
      ]),

      // ── 5. Motivos de Rechazo ──
      heading('5. Motivos de Rechazo'),
      para(['Las jugadas pueden ser rechazadas por las siguientes razones:']),
      simpleTable(
        ['Motivo', 'Descripcion', 'Como corregir'],
        [
          ['Sorteo cerrado/sorteado', 'El sorteo ya paso o esta en proceso de sorteo (estado DRAWN, CANCELLED o CLOSED)', 'Verificar que el drawSlotId corresponda a un sorteo que aun no ha cerrado'],
          ['drawSlotId invalido', 'El ID de slot no esta en el rango 1-48 o no es un numero valido', 'Usar solo IDs del 1 al 48 segun el catalogo de sorteos'],
          ['Numero no encontrado', 'El numero apostado no existe en el juego correspondiente al slot', 'Verificar que el numero sea valido para el juego (ej: "00"-"36" para Lotoanimalito)'],
          ['Ticket duplicado', 'Ya existe un ticket con el mismo ticketId para el mismo sorteo', 'Usar un ticketId unico por cada solicitud'],
        ],
        [22, 43, 35],
      ),

      warnBox([
        { text: 'Todo o nada: ', bold: true },
        'Si un payload contiene multiples jugadas (plays) y alguna de ellas es invalida, el ticket completo es rechazado. Todas las jugadas deben ser validas para que el ticket sea aceptado. Corrija la jugada invalida y reenvie el payload completo.',
      ]),

      // ── 6. Ejemplos Completos ──
      heading('6. Ejemplos Completos'),

      para([{ text: 'Ejemplo: Jugada simple (una apuesta):', bold: true }], { spacing: { before: 80 } }),
      ...codeBlock([
        'curl -X POST https://toteback.atilax.io/api/webhooks/premier \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "X-Webhook-Token: 7ec15f3c38754e38075330940ab9c65aa1a223bee356e627a51b23ce297d3c34" \\',
        '  -d \'{',
        '    "ticketId": "PRM-20260414-001",',
        '    "game": "lotoanimalito",',
        '    "plays": [',
        '      {',
        '        "drawSlotId": "5",',
        '        "amount": 1500,',
        '        "animal": "LEON",',
        '        "number": "05"',
        '      }',
        '    ],',
        '    "timestamp": "2026-04-14T14:30:00-04:00"',
        '  }\'',
      ]),

      para([{ text: '\nEjemplo: Multiples jugadas en un ticket:', bold: true }], { spacing: { before: 200 } }),
      ...codeBlock([
        'curl -X POST https://toteback.atilax.io/api/webhooks/premier \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "X-Webhook-Token: 7ec15f3c38754e38075330940ab9c65aa1a223bee356e627a51b23ce297d3c34" \\',
        '  -d \'{',
        '    "ticketId": "PRM-20260414-002",',
        '    "game": "mixto",',
        '    "plays": [',
        '      { "drawSlotId": "1", "amount": 1000, "number": "00" },',
        '      { "drawSlotId": "13", "amount": 2000, "number": "12" },',
        '      { "drawSlotId": "25", "amount": 500, "number": "150" }',
        '    ],',
        '    "timestamp": "2026-04-14T10:15:00-04:00"',
        '  }\'',
      ]),
      infoBox([
        { text: 'Nota: ', bold: true },
        'En el ejemplo anterior, cada jugada va dirigida a un juego y hora diferente: slot 1 = LOTOANIMALITO 08:00, slot 13 = LOTTOPANTERA 08:00, slot 25 = TRIPLE PANTERA 08:00. El campo game es solo informativo.',
      ]),

      // ── 7. Referencia de Slots ──
      heading('7. Referencia Rapida de Slots'),
      para(['Los 48 slots se distribuyen en 4 juegos con 12 horarios cada uno (08:00 a 19:00):']),
      simpleTable(
        ['Juego', 'Slots', 'Rango de Numeros'],
        [
          ['LOTOANIMALITO', '1 - 12', '"0", "00" a "36" (38 numeros — "0" es DELFIN, "00" es BALLENA)'],
          ['LOTTOPANTERA', '13 - 24', '"0", "00" a "48" (50 numeros — "0" es DELFIN, "00" es BALLENA)'],
          ['TRIPLE PANTERA', '25 - 36', '"000" a "999" (1000 triples)'],
          ['TERMINAL PANTERA', '37 - 48', '"00" a "99" (100 terminales)'],
        ],
        [30, 15, 55],
      ),
      infoBox([
        { text: 'Catalogo completo: ', bold: true },
        'Consulte el documento "Catalogo de Sorteos Premier" para ver la tabla detallada con los 48 slots, sus juegos, horarios y rangos de numeros validos.',
      ]),

      // ── 8. Pruebas Recomendadas ──
      heading('8. Pruebas Recomendadas'),
      para(['Antes de enviar jugadas reales, recomendamos las siguientes pruebas:']),
      ...step('1', 'Jugada simple aceptada',
        'Envie un payload con una sola jugada apuntando a un sorteo que aun no haya cerrado. Verifique que recibe status: "ACCEPTED" y un ticket.id.'),
      ...step('2', 'Jugada rechazada por sorteo cerrado',
        'Envie una jugada apuntando a un sorteo que ya paso (ej: slot de las 08:00 enviado a las 15:00). Verifique que recibe status: "REJECTED" con el motivo.'),
      ...step('3', 'Multiples jugadas',
        'Envie un payload con 2-3 jugadas en el array plays. Verifique que todas se procesan y recibe un solo ticket.'),
      ...step('4', 'Deteccion de duplicados',
        'Envie el mismo ticketId dos veces. La segunda vez debe recibir una respuesta indicando duplicado.'),

      // ── 9. Contacto ──
      heading('9. Contacto'),
      para([
        'Para cualquier duda sobre la integracion, pueden comunicarse con nuestro equipo tecnico. Si experimentan rechazos inesperados, verifiquen: (1) que el drawSlotId corresponda a un sorteo abierto, (2) que el numero sea valido para el juego, y (3) que el ticketId sea unico.',
      ]),

      // ── Footer ──
      new Paragraph({
        spacing: { before: 400 },
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' } },
        children: [],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [new TextRun({
          text: 'TOTE Platform — Documento de integracion para proveedor Premier — Confidencial',
          size: 18,
          color: GRAY,
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: 'Generado el 14 de abril de 2026',
          size: 18,
          color: GRAY,
        })],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = path.join(__dirname, 'Webhook-Integracion-Premier-Fase2.docx');
fs.writeFileSync(outPath, buffer);
console.log(`Document generated: ${outPath}`);
