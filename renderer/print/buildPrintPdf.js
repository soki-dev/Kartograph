import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BIOMES } from '../../src/engine/biomeClassifier.js';

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792]
};

const MARGIN = 36;
const LEGEND_WIDTH = 160;

function hexToRgb01(hex) {
  const value = parseInt(String(hex).replace('#', ''), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function biomeLabel(key, locale) {
  const labels = {
    de: {
      ocean: 'Ozean', beach: 'Strand', desert: 'Wüste', plains: 'Ebene', forest: 'Wald',
      swamp: 'Sumpf', hills: 'Hügel', mountains: 'Gebirge', snow: 'Schnee'
    },
    en: {
      ocean: 'Ocean', beach: 'Beach', desert: 'Desert', plains: 'Plains', forest: 'Forest',
      swamp: 'Swamp', hills: 'Hills', mountains: 'Mountains', snow: 'Snow'
    }
  };
  return (labels[locale] || labels.de)[key] || key;
}

/**
 * Baut eine druckfertige PDF-Seite: Kartenbild + Titel + optionale Legende
 * (verwendete Biome + benannte Regionen mit Farbe). Läuft komplett im
 * Renderer (pdf-lib ist reines JS, keine Node-Abhängigkeiten nötig).
 */
export async function buildPrintPdf({ pngBuffer, title, pageSize, orientation, includeLegend, mapState, locale }) {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let [pageWidth, pageHeight] = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  if (orientation === 'landscape') [pageWidth, pageHeight] = [pageHeight, pageWidth];

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const pngImage = await pdfDoc.embedPng(pngBuffer);

  let cursorY = pageHeight - MARGIN;

  if (title) {
    page.drawText(title, { x: MARGIN, y: cursorY - 18, size: 18, font: fontBold, color: rgb(0.13, 0.12, 0.1) });
    cursorY -= 34;
  }

  const legendWidth = includeLegend ? LEGEND_WIDTH : 0;
  const imageAreaWidth = pageWidth - MARGIN * 2 - legendWidth - (includeLegend ? 16 : 0);
  const imageAreaHeight = cursorY - MARGIN;

  const imageAspect = pngImage.width / pngImage.height;
  let drawWidth = imageAreaWidth;
  let drawHeight = drawWidth / imageAspect;
  if (drawHeight > imageAreaHeight) {
    drawHeight = imageAreaHeight;
    drawWidth = drawHeight * imageAspect;
  }
  const imageX = MARGIN + (imageAreaWidth - drawWidth) / 2;
  const imageY = MARGIN + (imageAreaHeight - drawHeight) / 2;

  page.drawImage(pngImage, { x: imageX, y: imageY, width: drawWidth, height: drawHeight });
  page.drawRectangle({ x: imageX, y: imageY, width: drawWidth, height: drawHeight, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });

  if (includeLegend) {
    const legendX = pageWidth - MARGIN - legendWidth + 12;
    let legendY = cursorY - 6;
    const swatchSize = 11;

    const usedBiomeIds = new Set(mapState.biomes);
    const usedBiomes = BIOMES.filter((b) => usedBiomeIds.has(b.id));

    page.drawText(locale === 'en' ? 'Legend' : 'Legende', { x: legendX, y: legendY, size: 11, font: fontBold, color: rgb(0.13, 0.12, 0.1) });
    legendY -= 18;

    for (const biome of usedBiomes) {
      page.drawRectangle({ x: legendX, y: legendY - swatchSize + 2, width: swatchSize, height: swatchSize, color: hexToRgb01(biome.color) });
      page.drawText(biomeLabel(biome.key, locale), { x: legendX + swatchSize + 6, y: legendY, size: 9, font: fontRegular, color: rgb(0.13, 0.12, 0.1) });
      legendY -= 16;
    }

    if (mapState.regions.length > 0) {
      legendY -= 8;
      page.drawText(locale === 'en' ? 'Regions' : 'Regionen', { x: legendX, y: legendY, size: 11, font: fontBold, color: rgb(0.13, 0.12, 0.1) });
      legendY -= 18;
      for (const region of mapState.regions) {
        page.drawRectangle({ x: legendX, y: legendY - swatchSize + 2, width: swatchSize, height: swatchSize, color: hexToRgb01(region.color || '#aa3355') });
        page.drawText(region.name || '—', { x: legendX + swatchSize + 6, y: legendY, size: 9, font: fontRegular, color: rgb(0.13, 0.12, 0.1) });
        legendY -= 16;
      }
    }
  }

  return pdfDoc.save();
}
