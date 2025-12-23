import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Servicio para generar reportes PDF de sorteos
 */
class PdfReportService {
  constructor() {
    this.reportsPath = process.env.REPORTS_PATH || './storage/reports';
    this.ensureReportsDirectory();
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsPath)) {
      fs.mkdirSync(this.reportsPath, { recursive: true });
    }
  }

  /**
   * Generar reporte PDF de cierre de sorteo
   * @param {object} data - Datos del sorteo
   * @returns {Promise<string>} - Ruta del archivo PDF generado
   */
  async generateDrawClosingReport(data) {
    const {
      drawId,
      game,
      scheduledAt,
      prewinnerItem,
      totalSales,
      maxPayout,
      potentialPayout,
      allItems,
      salesByItem,
      candidates,
      tripletaRiskData
    } = data;

    const dateStr = format(new Date(scheduledAt), 'yyyy-MM-dd');
    const timeStr = format(new Date(scheduledAt), 'HH-mm');
    const filename = `cierre_${game.slug}_${dateStr}_${timeStr}.pdf`;
    const filepath = path.join(this.reportsPath, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'LETTER',
          margins: { top: 50, bottom: 70, left: 50, right: 50 },
          bufferPages: true // Habilitar buffer de páginas para footer
        });

        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Header
        this.drawHeader(doc, game, scheduledAt, totalSales, maxPayout, prewinnerItem);

        // Top 10 Candidates section
        this.drawCandidatesSection(doc, candidates, prewinnerItem);

        // Triplet Risk section
        if (tripletaRiskData && tripletaRiskData.activeTripletas > 0) {
          this.drawTripletaRiskSection(doc, tripletaRiskData);
        }

        // All items table
        this.drawItemsTable(doc, allItems, salesByItem, game);

        // Footer
        this.drawFooter(doc, drawId);

        doc.end();

        stream.on('finish', () => {
          logger.info(`📄 PDF generado: ${filepath}`);
          resolve(filepath);
        });

        stream.on('error', (error) => {
          logger.error('Error generando PDF:', error);
          reject(error);
        });

      } catch (error) {
        logger.error('Error en generateDrawClosingReport:', error);
        reject(error);
      }
    });
  }

  /**
   * Dibujar encabezado del reporte
   */
  drawHeader(doc, game, scheduledAt, totalSales, maxPayout, prewinnerItem) {
    const dateStr = format(new Date(scheduledAt), "EEEE d 'de' MMMM, yyyy", { locale: es });
    const timeStr = format(new Date(scheduledAt), 'hh:mm a');
    const percentageToDistribute = game.config?.percentageToDistribute || 70;

    // Título
    doc.fontSize(20).font('Helvetica-Bold')
       .text('REPORTE DE CIERRE DE SORTEO', { align: 'center' });
    
    doc.moveDown(0.5);

    // Información del juego
    doc.fontSize(16).font('Helvetica-Bold')
       .text(game.name, { align: 'center' });
    
    doc.fontSize(12).font('Helvetica')
       .text(`${dateStr} - ${timeStr}`, { align: 'center' });

    doc.moveDown(1);

    // Línea separadora
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // Resumen financiero
    doc.fontSize(14).font('Helvetica-Bold')
       .text('RESUMEN FINANCIERO');
    
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica');

    const col1 = 60;
    const col2 = 300;
    let y = doc.y;

    doc.text('Ventas Totales:', col1, y);
    doc.text(`$${totalSales.toFixed(2)}`, col2, y);
    
    y += 18;
    doc.text(`Máximo a Pagar (${percentageToDistribute}%):`, col1, y);
    doc.text(`$${maxPayout.toFixed(2)}`, col2, y);

    if (prewinnerItem) {
      y += 18;
      doc.text('Pre-ganador Seleccionado:', col1, y);
      doc.font('Helvetica-Bold')
         .text(`${prewinnerItem.number} - ${prewinnerItem.name}`, col2, y);
      
      y += 18;
      doc.font('Helvetica')
         .text('Multiplicador:', col1, y);
      doc.text(`x${prewinnerItem.multiplier}`, col2, y);
    }

    doc.y = y + 30;

    // Línea separadora
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
  }

  /**
   * Dibujar sección de candidatos (Top 10)
   */
  drawCandidatesSection(doc, candidates, prewinnerItem) {
    doc.fontSize(14).font('Helvetica-Bold')
       .text('TOP 10 CANDIDATOS A GANAR');
    
    doc.moveDown(0.3);

    if (!candidates || candidates.length === 0) {
      doc.fontSize(10).font('Helvetica')
         .text('No hay candidatos disponibles', { italic: true });
      doc.moveDown(1);
      return;
    }

    // Encabezados de tabla
    const headers = ['#', 'Número', 'Nombre', 'Tickets', 'Ventas', 'Pago Potencial', 'Días', 'Score'];
    const colWidths = [20, 45, 85, 45, 65, 80, 40, 45];
    const startX = 50;
    let x = startX;
    let y = doc.y;

    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    y += 15;
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    y += 5;

    // Filas de candidatos
    doc.fontSize(9).font('Helvetica');
    
    candidates.slice(0, 10).forEach((candidate, index) => {
      x = startX;
      const isPrewinner = prewinnerItem && candidate.item.number === prewinnerItem.number;
      
      if (isPrewinner) {
        doc.font('Helvetica-Bold');
        // Highlight row
        doc.rect(startX - 5, y - 2, colWidths.reduce((a, b) => a + b, 0) + 10, 14)
           .fill('#e6ffe6');
        doc.fillColor('black');
      } else {
        doc.font('Helvetica');
      }

      const rowData = [
        `${index + 1}`,
        candidate.item.number,
        candidate.item.name.substring(0, 12),
        `${candidate.sales.count}`,
        `$${candidate.sales.amount.toFixed(2)}`,
        `$${candidate.potentialPayout.toFixed(2)}`,
        `${candidate.daysSinceLastWin}`,
        candidate.score.toFixed(2)
      ];

      rowData.forEach((cell, i) => {
        doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      if (isPrewinner) {
        doc.text('← SELECCIONADO', x, y);
      }

      y += 14;

      // Nueva página si es necesario
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc.y = y + 15;

    // Línea separadora
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
  }

  /**
   * Dibujar tabla de todos los items
   */
  drawItemsTable(doc, allItems, salesByItem, game) {
    doc.fontSize(14).font('Helvetica-Bold')
       .text('DETALLE DE VENTAS POR NÚMERO');
    
    doc.moveDown(0.3);

    // Encabezados
    const headers = ['Número', 'Nombre', 'Tickets', 'Ventas', 'Multiplicador', 'Pago si Gana'];
    const colWidths = [50, 100, 50, 70, 70, 90];
    const startX = 50;
    let x = startX;
    let y = doc.y;

    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    y += 15;
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    y += 5;

    // Filas
    doc.fontSize(8).font('Helvetica');

    // Ordenar items por número
    const sortedItems = [...allItems].sort((a, b) => {
      return parseInt(a.number) - parseInt(b.number);
    });

    for (const item of sortedItems) {
      const sales = salesByItem[item.id] || { amount: 0, count: 0 };
      const potentialPayout = sales.amount * parseFloat(item.multiplier);

      // Solo mostrar items con ventas o todos si el juego tiene pocos items
      if (sales.amount === 0 && allItems.length > 100) {
        continue;
      }

      x = startX;

      const rowData = [
        item.number,
        item.name.substring(0, 15),
        `${sales.count}`,
        `$${sales.amount.toFixed(2)}`,
        `x${item.multiplier}`,
        `$${potentialPayout.toFixed(2)}`
      ];

      rowData.forEach((cell, i) => {
        doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      y += 12;

      // Nueva página si es necesario
      if (y > 720) {
        doc.addPage();
        y = 50;

        // Re-dibujar encabezados en nueva página
        x = startX;
        doc.fontSize(9).font('Helvetica-Bold');
        headers.forEach((header, i) => {
          doc.text(header, x, y, { width: colWidths[i], align: 'left' });
          x += colWidths[i];
        });
        y += 15;
        doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
        y += 5;
        doc.fontSize(8).font('Helvetica');
      }
    }

    doc.y = y + 10;
  }

  /**
   * Dibujar sección de riesgo de tripletas
   */
  drawTripletaRiskSection(doc, tripletaRiskData) {
    const {
      activeTripletas,
      highRiskItems,
      mediumRiskItems,
      noRiskItems,
      totalHighRiskPrize,
      highRiskDetails
    } = tripletaRiskData;

    // Check if we need a new page
    if (doc.y > 600) {
      doc.addPage();
    }

    doc.fontSize(14).font('Helvetica-Bold')
       .text('RIESGO DE TRIPLETAS');
    
    doc.moveDown(0.3);

    // Summary boxes
    const startX = 50;
    let y = doc.y;
    const boxWidth = 160;
    const boxHeight = 50;
    const boxSpacing = 10;

    // High Risk Box
    doc.rect(startX, y, boxWidth, boxHeight)
       .fill('#fee2e2');
    doc.fillColor('#991b1b')
       .fontSize(10).font('Helvetica-Bold')
       .text('ALTO RIESGO', startX + 10, y + 8, { width: boxWidth - 20 });
    doc.fontSize(16)
       .text(`${highRiskItems}`, startX + 10, y + 22, { width: boxWidth - 20 });
    doc.fontSize(8).font('Helvetica')
       .text(`Premio: $${totalHighRiskPrize.toFixed(2)}`, startX + 10, y + 38, { width: boxWidth - 20 });

    // Medium Risk Box
    doc.rect(startX + boxWidth + boxSpacing, y, boxWidth, boxHeight)
       .fill('#fef3c7');
    doc.fillColor('#92400e')
       .fontSize(10).font('Helvetica-Bold')
       .text('RIESGO MEDIO', startX + boxWidth + boxSpacing + 10, y + 8, { width: boxWidth - 20 });
    doc.fontSize(16)
       .text(`${mediumRiskItems}`, startX + boxWidth + boxSpacing + 10, y + 22, { width: boxWidth - 20 });
    doc.fontSize(8).font('Helvetica')
       .text('En tripletas activas', startX + boxWidth + boxSpacing + 10, y + 38, { width: boxWidth - 20 });

    // No Risk Box
    doc.rect(startX + (boxWidth + boxSpacing) * 2, y, boxWidth, boxHeight)
       .fill('#dcfce7');
    doc.fillColor('#166534')
       .fontSize(10).font('Helvetica-Bold')
       .text('SIN RIESGO', startX + (boxWidth + boxSpacing) * 2 + 10, y + 8, { width: boxWidth - 20 });
    doc.fontSize(16)
       .text(`${noRiskItems}`, startX + (boxWidth + boxSpacing) * 2 + 10, y + 22, { width: boxWidth - 20 });
    doc.fontSize(8).font('Helvetica')
       .text('Opciones seguras', startX + (boxWidth + boxSpacing) * 2 + 10, y + 38, { width: boxWidth - 20 });

    doc.fillColor('black');
    doc.y = y + boxHeight + 15;

    // High risk details table
    if (highRiskDetails && highRiskDetails.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold')
         .text('Detalle de Tripletas de Alto Riesgo:');
      doc.moveDown(0.3);

      const headers = ['Número', 'Nombre', 'Tripletas', 'Premio Tripletas'];
      const colWidths = [60, 150, 80, 100];
      let x = startX;
      y = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });

      y += 15;
      doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
      y += 5;

      doc.fontSize(9).font('Helvetica');
      
      for (const item of highRiskDetails.slice(0, 10)) {
        x = startX;
        
        // Highlight row
        doc.rect(startX - 5, y - 2, colWidths.reduce((a, b) => a + b, 0) + 10, 14)
           .fill('#fef2f2');
        doc.fillColor('black');

        const rowData = [
          item.number,
          item.name.substring(0, 20),
          `${item.completedCount} completarían`,
          `$${item.totalPrize.toFixed(2)}`
        ];

        rowData.forEach((cell, i) => {
          doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
          x += colWidths[i];
        });

        y += 14;

        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      }

      doc.y = y + 10;
    }

    // Separator line
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
  }

  /**
   * Dibujar pie de página en todas las páginas
   */
  drawFooter(doc, drawId) {
    const range = doc.bufferedPageRange();
    
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      
      // Línea de pie
      doc.save();
      doc.moveTo(50, 730).lineTo(562, 730).stroke();
      
      // Información del pie
      doc.fontSize(8).font('Helvetica')
         .text(
           `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm:ss")} | ID: ${drawId.substring(0, 8)}... | Página ${i - range.start + 1} de ${range.count}`,
           50, 735,
           { align: 'center', width: 512 }
         );
      doc.restore();
    }
  }

  /**
   * Generar reporte completo para un sorteo
   * @param {string} drawId - ID del sorteo
   * @param {Array} candidates - Lista de candidatos evaluados
   * @returns {Promise<string>} - Ruta del PDF generado
   */
  async generateReportForDraw(drawId, candidates = []) {
    try {
      logger.info(`📄 Generando reporte PDF para sorteo ${drawId}...`);

      // Obtener datos del sorteo
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: true,
          preselectedItem: true,
          tickets: {
            include: {
              details: {
                include: {
                  gameItem: true
                }
              }
            }
          }
        }
      });

      if (!draw) {
        throw new Error(`Sorteo ${drawId} no encontrado`);
      }

      // Obtener todos los items del juego
      const allItems = await prisma.gameItem.findMany({
        where: {
          gameId: draw.gameId,
          isActive: true
        },
        orderBy: { number: 'asc' }
      });

      // Calcular ventas por item
      const tickets = draw.tickets || [];
      const salesByItem = {};
      
      for (const ticket of tickets) {
        for (const detail of ticket.details) {
          if (!salesByItem[detail.gameItemId]) {
            salesByItem[detail.gameItemId] = { amount: 0, count: 0 };
          }
          salesByItem[detail.gameItemId].amount += parseFloat(detail.amount);
          salesByItem[detail.gameItemId].count += 1;
        }
      }

      const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.totalAmount), 0);
      const percentageToDistribute = draw.game.config?.percentageToDistribute || 70;
      const maxPayout = (totalSales * percentageToDistribute) / 100;

      // Calcular pago potencial del pre-ganador
      let potentialPayout = 0;
      if (draw.preselectedItem) {
        const prewinnerSales = salesByItem[draw.preselectedItem.id] || { amount: 0 };
        potentialPayout = prewinnerSales.amount * parseFloat(draw.preselectedItem.multiplier);
      }

      // Generar PDF
      const filepath = await this.generateDrawClosingReport({
        drawId,
        game: draw.game,
        scheduledAt: draw.scheduledAt,
        prewinnerItem: draw.preselectedItem,
        totalSales,
        maxPayout,
        potentialPayout,
        allItems,
        salesByItem,
        candidates
      });

      return filepath;

    } catch (error) {
      logger.error(`Error generando reporte para ${drawId}:`, error);
      throw error;
    }
  }
}

export default new PdfReportService();
