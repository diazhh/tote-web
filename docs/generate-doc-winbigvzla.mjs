import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType,
  convertInchesToTwip
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Datos del proveedor ───
const ENDPOINT = 'https://toteback.atilax.io/api/webhooks/winbigvzla';
const TOKEN = '15da57c30f08198fccc469a3156bcd8473073e86c623cf48008ac4e76ffe1c4a';
const PORTAL_URL = 'https://tote.atilax.io/login';
const PORTAL_USER = 'winbigvzla';
const PORTAL_PASS = 'WBV-LPDhk9BaBlhQ';

// Reusable styles
const BLUE = '2563EB';
const DARK = '1E3A5F';
const GRAY = '6B7280';
const LIGHT_BG = 'F1F5F9';
const INFO_BG = 'EFF6FF';
const WARN_BG = 'FEFCE8';
const GREEN_BG = 'F0FDF4';

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
        { text: 'INTEGRACION COMPLETA', bold: true, size: 18, color: '166534' },
        { text: '    ', size: 18 },
        { text: 'CONFIDENCIAL', bold: true, size: 18, color: '991B1B' },
      ], { spacing: { after: 40 } }),
      para([
        { text: 'Proveedor: WinBigVzla (canal winbigvzla)  |  Fecha: 11 de junio de 2026  |  Version: 1.0', color: GRAY, size: 20 },
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
        ' desde su plataforma ',
        { text: 'WinBigVzla', bold: true },
        ' mediante webhooks. El sistema procesa las jugadas en tiempo real, crea tickets y retorna una respuesta indicando exactamente que se vendio de cada jugada.',
      ]),
      successBox([
        { text: 'Como funciona: ', bold: true },
        'Ustedes envian un POST con una o varias jugadas. El sistema valida y procesa cada jugada al instante. La respuesta incluye el estado del ticket (ACCEPTED o REJECTED) y, cuando es ACCEPTED, un arreglo items con el desglose exacto de lo que se vendio (sorteo, numero y monto).',
      ]),
      infoBox([
        { text: 'Aceptacion parcial por monto (diferencial): ', bold: true },
        'Cada numero tiene un cupo de venta por sorteo. Si una jugada pide mas de lo que queda disponible, el sistema vende SOLO el diferencial disponible y descarta el excedente — no rechaza el numero completo. El monto que aparece en items puede ser MENOR al que ustedes enviaron. Si el numero ya esta agotado o bloqueado (cupo 0), esa jugada no aparece en items. El ticket se acepta mientras al menos una jugada venda algo; si ninguna jugada vende, el ticket se rechaza con REJECTED.',
      ]),
      warnBox([
        { text: 'Regla clave de conciliacion: ', bold: true },
        'Siempre comparen el monto enviado contra el monto en items[].amount para cada jugada. El amount de items es el monto REALMENTE vendido y aceptado. La diferencia (enviado − vendido) fue descartada por cupo. El totalAmount de la respuesta es la suma de los amount de items, es decir lo realmente vendido y por lo que ustedes responden.',
      ]),

      // ── 2. Datos de Conexion ──
      heading('2. Datos de Conexion'),
      simpleTable(
        ['Parametro', 'Valor'],
        [
          ['URL del Endpoint', { text: ENDPOINT, mono: true }],
          ['Metodo HTTP', { text: 'POST', mono: true }],
          ['Header de Autenticacion', { text: 'X-Webhook-Token', mono: true }],
          ['Token', { text: TOKEN, mono: true }],
          ['Content-Type', { text: 'application/json', mono: true }],
          ['Limite de payload', '64 KB'],
        ],
        [25, 75],
      ),
      warnBox([
        { text: 'Seguridad: ', bold: true },
        'El token debe enviarse en el header X-Webhook-Token en cada solicitud. Las solicitudes sin token o con token invalido seran rechazadas con codigo 401. No compartan el token en canales no seguros.',
      ]),

      // ── 3. Portal del Proveedor ──
      heading('3. Portal del Proveedor (Reportes)'),
      para([
        'Ademas del webhook, cuentan con un acceso web al portal de TOTE donde pueden consultar su reporte de ventas (ventas, premios, utilidad y numero de tickets), filtrado automaticamente a su operacion. El portal es solo de lectura.',
      ]),
      simpleTable(
        ['Parametro', 'Valor'],
        [
          ['URL de Acceso', { text: PORTAL_URL, mono: true }],
          ['Usuario', { text: PORTAL_USER, mono: true }],
          ['Contrasena', { text: PORTAL_PASS, mono: true }],
        ],
        [25, 75],
      ),
      warnBox([
        { text: 'Importante: ', bold: true },
        'Cambien la contrasena tras el primer acceso si el portal lo permite, y no compartan estas credenciales. El usuario del portal es independiente del token del webhook: el token es para enviar ventas, el portal es para consultar reportes.',
      ]),

      // ── 4. Formato del Payload ──
      heading('4. Formato del Payload'),
      para([
        'El payload debe enviarse como JSON con la siguiente estructura. El campo ',
        { text: 'plays', bold: true },
        ' es un array que permite enviar una o varias jugadas en una sola solicitud.',
      ]),
      ...codeBlock([
        '{',
        '  "ticketId": "WBV-20260611-001",',
        '  "game": "lotoanimalito",',
        '  "plays": [',
        '    {',
        '      "drawSlotId": "3",',
        '      "amount": 1500,',
        '      "animal": "LEON",',
        '      "number": "05"',
        '    },',
        '    {',
        '      "drawSlotId": "16",',
        '      "amount": 2000,',
        '      "animal": "CABALLO",',
        '      "number": "12"',
        '    }',
        '  ],',
        '  "timestamp": "2026-06-11T14:30:00-04:00"',
        '}',
      ]),

      para([{ text: '\nDescripcion de campos:', bold: true }], { spacing: { before: 160 } }),
      simpleTable(
        ['Campo', 'Tipo', 'Requerido', 'Descripcion'],
        [
          [{ text: 'ticketId', mono: true }, 'string', 'Si', 'ID unico del ticket en su sistema. Se usa para evitar duplicados.'],
          [{ text: 'game', mono: true }, 'string', 'No', 'Nombre del juego (informativo). El juego real se determina por el drawSlotId.'],
          [{ text: 'plays', mono: true }, 'array', 'Si', 'Array de jugadas. Cada jugada tiene su propio sorteo, numero y monto.'],
          [{ text: 'plays[].drawSlotId', mono: true }, 'string/number', 'Si', 'ID del slot de sorteo (1-48). Ver referencia de slots. Puede ser string o numero.'],
          [{ text: 'plays[].amount', mono: true }, 'number', 'Si', 'Monto apostado en bolivares.'],
          [{ text: 'plays[].number', mono: true }, 'string', 'Si', 'Numero apostado (ej: "05", "12", "00"). Debe coincidir con un numero valido del juego.'],
          [{ text: 'plays[].animal', mono: true }, 'string', 'No', 'Nombre del animal (informativo). El sistema usa el campo number para identificar la jugada.'],
          [{ text: 'timestamp', mono: true }, 'string', 'No', 'Fecha/hora de la jugada en formato ISO 8601.'],
        ],
        [22, 12, 10, 56],
      ),

      warnBox([
        { text: 'Importante — drawSlotId: ', bold: true },
        'El drawSlotId determina a que juego y hora de sorteo va dirigida la jugada (ver seccion 8). El campo game es informativo y no se usa para resolver el sorteo. Cada juego tiene su propio rango de slots: no hay que enviar ninguna bandera adicional para distinguir TRIPLE de TERMINAL.',
      ]),

      warnBox([
        { text: 'Importante — number: ', bold: true },
        'El campo number debe ser un string con el numero exacto registrado en el sistema (ej: "05", no "5"). Si el numero no existe en el juego correspondiente, la jugada sera rechazada. Atencion: en LOTOANIMALITO y LOTTOPANTERA, "0" (DELFIN) y "00" (BALLENA) son numeros distintos — envien el string exacto.',
      ]),

      // ── 5. Respuestas del Servidor ──
      heading('5. Respuestas del Servidor'),

      para([{ text: 'Jugada aceptada (todo el monto vendido):', bold: true }], { spacing: { before: 80 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "logId": "83ddf68c-a1b2-4c3d-8e5f-6789abcdef01",',
        '  "ticket": {',
        '    "id": 599001,',
        '    "status": "ACCEPTED",',
        '    "totalAmount": 3500,',
        '    "items": [',
        '      { "drawSlotId": "3",  "number": "05", "amount": 1500 },',
        '      { "drawSlotId": "16", "number": "12", "amount": 2000 }',
        '    ]',
        '  }',
        '}',
      ]),
      infoBox([
        { text: 'ticket.id: ', bold: true },
        'Es un numero entero unico que identifica el ticket en nuestro sistema. Ustedes envian su ticketId (string) y nosotros retornamos nuestro id numerico. Guardenlo para referencia cruzada.',
      ]),
      infoBox([
        { text: 'ticket.items: ', bold: true },
        'Contiene las jugadas vendidas con el monto REALMENTE aceptado. El totalAmount es la suma de los amount del arreglo items. Comparen cada amount contra lo que enviaron para detectar ventas parciales por cupo.',
      ]),

      para([{ text: '\nAceptacion parcial (monto topeado al cupo disponible):', bold: true }], { spacing: { before: 160 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "logId": "83ddf68c-a1b2-4c3d-8e5f-6789abcdef01",',
        '  "ticket": {',
        '    "id": 599002,',
        '    "status": "ACCEPTED",',
        '    "totalAmount": 2300,',
        '    "items": [',
        '      { "drawSlotId": "3",  "number": "05", "amount": 1500 },',
        '      { "drawSlotId": "16", "number": "12", "amount": 800 }',
        '    ]',
        '  }',
        '}',
      ]),
      infoBox([
        { text: 'Ejemplo (venta diferencial): ', bold: true },
        'El payload pidio slot 3 numero "05" por 1500 y slot 16 numero "12" por 2000. El numero "12" solo tenia 800 de cupo disponible, asi que se vendio 800 y se descartaron 1200. La jugada "05" entro completa. El totalAmount (2300) refleja lo realmente vendido: 1500 + 800.',
      ]),

      para([{ text: '\nAceptacion parcial (numero agotado o bloqueado — no aparece):', bold: true }], { spacing: { before: 160 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "ticket": {',
        '    "id": 599003,',
        '    "status": "ACCEPTED",',
        '    "totalAmount": 1500,',
        '    "items": [',
        '      { "drawSlotId": "3", "number": "05", "amount": 1500 }',
        '    ]',
        '  }',
        '}',
      ]),
      infoBox([
        { text: 'Ejemplo (numero sin cupo): ', bold: true },
        'El payload pidio "05" (1500) y "12" (2000), pero "12" ya estaba agotado o bloqueado (cupo 0). No hay diferencial que vender, asi que "12" no aparece en items. Para saber que una jugada no entro, comparen items contra el array plays enviado.',
      ]),

      para([{ text: '\nJugada rechazada (ninguna jugada vendible):', bold: true }], { spacing: { before: 160 } }),
      ...codeBlock([
        'HTTP 200',
        '{',
        '  "received": true,',
        '  "logId": "83ddf68c-a1b2-4c3d-8e5f-6789abcdef01",',
        '  "ticket": {',
        '    "status": "REJECTED",',
        '    "reason": "Draw for slot 3 is DRAWN — bets not accepted"',
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

      // ── 6. Anulacion de Tickets ──
      heading('6. Anulacion de Tickets'),
      para([
        'Para anular un ticket previamente enviado, reenvien el ',
        { text: 'mismo ticketId', bold: true },
        ' sin el arreglo plays (o con plays vacio). El ticket se marca como anulado.',
      ]),
      ...codeBlock([
        'POST ' + ENDPOINT,
        '{',
        '  "ticketId": "WBV-20260611-001"',
        '}',
        '',
        'HTTP 200',
        '{ "received": true, "ticket": { "id": 599001, "status": "ANNULLED" } }',
      ]),
      warnBox([
        { text: 'Importante: ', bold: true },
        'La anulacion solo se permite mientras el sorteo del ticket sigue ABIERTO (estado SCHEDULED). Los sorteos cierran 5 minutos antes de la hora del sorteo; una vez cerrado, sorteado o cancelado, la anulacion es rechazada.',
      ]),

      // ── 7. Motivos de Rechazo ──
      heading('7. Motivos de Rechazo'),
      para(['Hay dos tipos de problemas que pueden afectar una jugada: errores estructurales (rechazan el ticket completo) y falta de cupo (vende el diferencial o descarta solo esa jugada).']),

      para([{ text: 'Errores estructurales (rechazan todo el ticket):', bold: true }], { spacing: { before: 160 } }),
      simpleTable(
        ['Motivo', 'Descripcion', 'Como corregir'],
        [
          ['drawSlotId invalido', 'El ID de slot no esta en el rango 1-48 o no es un numero valido', 'Usar solo IDs del 1 al 48 segun la referencia de slots'],
          ['Numero no encontrado', 'El numero apostado no existe en el juego correspondiente al slot', 'Verificar que el numero sea valido para el juego (ej: "00"-"36" para Lotoanimalito)'],
          ['Ticket duplicado', 'Ya existe un ticket con el mismo ticketId para el mismo proveedor', 'Usar un ticketId unico por cada solicitud'],
          ['Payload mal formado', 'JSON invalido o campos requeridos faltantes', 'Revisar la estructura segun la seccion 4'],
        ],
        [22, 43, 35],
      ),

      para([{ text: '\nFalta de cupo (aceptacion parcial por monto):', bold: true }], { spacing: { before: 160 } }),
      simpleTable(
        ['Situacion', 'Que hace el sistema', 'Como interpretarlo'],
        [
          ['Cupo parcial', 'La jugada pide mas de lo disponible. Se vende el diferencial y se descarta el excedente.', 'El amount en items es MENOR al enviado. La diferencia no se vendio.'],
          ['Numero agotado / bloqueado', 'No queda cupo (o el numero esta bloqueado). No hay diferencial que vender.', 'La jugada NO aparece en items. El resto del ticket sigue vendiendose.'],
          ['Sorteo cerrado/sorteado', 'El sorteo ya paso o esta en proceso (DRAWN, CANCELLED, CLOSED)', 'Si TODAS las jugadas apuntan a sorteos cerrados, el ticket completo se rechaza con REJECTED.'],
        ],
        [22, 43, 35],
      ),

      successBox([
        { text: 'Resumen de aceptacion parcial: ', bold: true },
        'El sistema vende todo lo que pueda: completa lo que cabe, topea al diferencial lo que excede el cupo, y omite lo que esta agotado o bloqueado. El ticket se crea con lo vendido y el arreglo items + totalAmount reflejan exactamente eso. Reconcilien siempre items contra el payload enviado.',
      ]),

      // ── 8. Referencia de Slots ──
      heading('8. Referencia de Slots'),
      para(['Los 48 slots se distribuyen en 4 juegos con 12 horarios cada uno (08:00 a 19:00). El drawSlotId resuelve al sorteo del dia de hoy para ese juego y hora.']),
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
      para([{ text: '\nMapeo de slot por hora (mismo patron para los 4 juegos):', bold: true }], { spacing: { before: 120 } }),
      simpleTable(
        ['Hora', 'LOTOANIMALITO', 'LOTTOPANTERA', 'TRIPLE PANTERA', 'TERMINAL PANTERA'],
        [
          ['08:00', '1', '13', '25', '37'],
          ['09:00', '2', '14', '26', '38'],
          ['10:00', '3', '15', '27', '39'],
          ['11:00', '4', '16', '28', '40'],
          ['12:00', '5', '17', '29', '41'],
          ['13:00', '6', '18', '30', '42'],
          ['14:00', '7', '19', '31', '43'],
          ['15:00', '8', '20', '32', '44'],
          ['16:00', '9', '21', '33', '45'],
          ['17:00', '10', '22', '34', '46'],
          ['18:00', '11', '23', '35', '47'],
          ['19:00', '12', '24', '36', '48'],
        ],
        [20, 20, 20, 20, 20],
      ),

      // ── 9. Ejemplos Completos ──
      heading('9. Ejemplos Completos'),

      para([{ text: 'Ejemplo: Jugada simple (una apuesta):', bold: true }], { spacing: { before: 80 } }),
      ...codeBlock([
        'curl -X POST ' + ENDPOINT + ' \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "X-Webhook-Token: ' + TOKEN + '" \\',
        '  -d \'{',
        '    "ticketId": "WBV-20260611-001",',
        '    "game": "lotoanimalito",',
        '    "plays": [',
        '      {',
        '        "drawSlotId": "3",',
        '        "amount": 1500,',
        '        "animal": "LEON",',
        '        "number": "05"',
        '      }',
        '    ],',
        '    "timestamp": "2026-06-11T14:30:00-04:00"',
        '  }\'',
      ]),

      para([{ text: '\nEjemplo: Multiples jugadas en un ticket:', bold: true }], { spacing: { before: 200 } }),
      ...codeBlock([
        'curl -X POST ' + ENDPOINT + ' \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "X-Webhook-Token: ' + TOKEN + '" \\',
        '  -d \'{',
        '    "ticketId": "WBV-20260611-002",',
        '    "game": "mixto",',
        '    "plays": [',
        '      { "drawSlotId": "3",  "amount": 1000, "number": "00" },',
        '      { "drawSlotId": "15", "amount": 2000, "number": "12" },',
        '      { "drawSlotId": "27", "amount": 500,  "number": "150" }',
        '    ],',
        '    "timestamp": "2026-06-11T10:15:00-04:00"',
        '  }\'',
      ]),
      infoBox([
        { text: 'Nota: ', bold: true },
        'En el ejemplo anterior, cada jugada va dirigida a un juego y hora diferente: slot 3 = LOTOANIMALITO 10:00, slot 15 = LOTTOPANTERA 10:00, slot 27 = TRIPLE PANTERA 10:00. El campo game es solo informativo.',
      ]),

      // ── 10. Pruebas Recomendadas ──
      heading('10. Pruebas Recomendadas'),
      para(['Antes de enviar jugadas reales, recomendamos las siguientes pruebas:']),
      ...step('1', 'Jugada simple aceptada',
        'Envie un payload con una sola jugada apuntando a un sorteo que aun no haya cerrado. Verifique que recibe status: "ACCEPTED", un ticket.id, e items con el monto completo.'),
      ...step('2', 'Jugada rechazada por sorteo cerrado',
        'Envie una jugada apuntando a un sorteo que ya paso (ej: slot de las 08:00 enviado a las 15:00). Verifique que recibe status: "REJECTED" con el motivo.'),
      ...step('3', 'Multiples jugadas',
        'Envie un payload con 2-3 jugadas en el array plays. Verifique que todas se procesan, recibe un solo ticket y todas aparecen en items.'),
      ...step('4', 'Aceptacion parcial por monto (diferencial)',
        'Envie una jugada cuyo monto exceda el cupo disponible de ese numero. Verifique que el ticket es ACCEPTED, el amount en items es MENOR al enviado (topeado al cupo) y totalAmount refleja lo realmente vendido.'),
      ...step('5', 'Deteccion de duplicados',
        'Envie el mismo ticketId dos veces. La segunda vez debe recibir una respuesta indicando duplicado.'),
      ...step('6', 'Anulacion',
        'Envie una jugada (sorteo abierto), guarde el ticketId, y reenvie el mismo ticketId sin plays. Verifique que el ticket queda ANNULLED.'),
      ...step('7', 'Acceso al portal',
        'Ingrese a ' + PORTAL_URL + ' con su usuario y contrasena y verifique que ve su reporte de ventas.'),

      // ── 11. Contacto ──
      heading('11. Contacto'),
      para([
        'Para cualquier duda sobre la integracion, pueden comunicarse con nuestro equipo tecnico. Si experimentan jugadas con monto reducido en items, es venta parcial por cupo (se vendio el diferencial disponible). Si una jugada no aparece en items, el numero estaba agotado o bloqueado. Si todo el ticket es REJECTED, revisen estructura del payload, unicidad del ticketId y estado del sorteo. Si reciben 401, verifiquen el header ',
        { text: 'X-Webhook-Token', mono: true, font: 'Consolas' },
        '.',
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
          text: 'TOTE Platform — Documento de integracion para proveedor WinBigVzla — Confidencial',
          size: 18,
          color: GRAY,
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: 'Generado el 11 de junio de 2026',
          size: 18,
          color: GRAY,
        })],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = path.join(__dirname, 'Webhook-Integracion-WinBigVzla.docx');
fs.writeFileSync(outPath, buffer);
console.log(`Document generated: ${outPath}`);
