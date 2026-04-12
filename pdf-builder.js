const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

const A4_WIDTH = 2480;
const A4_HEIGHT = 3508;

function ensureFileExists(filePath, label = 'arquivo') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function getLatestJobDir(outputDir) {
  ensureFileExists(outputDir, 'diretório output');

  const entries = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(outputDir, entry.name),
      mtime: fs.statSync(path.join(outputDir, entry.name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!entries.length) {
    throw new Error(`Nenhum job encontrado em: ${outputDir}`);
  }

  return entries[0].fullPath;
}

function buildLayout(config = {}) {
  const columns = config.columns || 4;
  const rows = config.rows || 3;
  const cardsPerPage = config.cards_per_page || 12;

  const trimWidth = config.trim_width || 584;
  const trimHeight = config.trim_height || 1051;
  const bleed = config.bleed_px || 18;

  const slotWidth = trimWidth + bleed * 2;
  const slotHeight = trimHeight + bleed * 2;

  const totalWidth = columns * slotWidth;
  const totalHeight = rows * slotHeight;

  const offsetX = Math.floor((A4_WIDTH - totalWidth) / 2);
  const offsetY = Math.floor((A4_HEIGHT - totalHeight) / 2);

  return {
    pageWidth: A4_WIDTH,
    pageHeight: A4_HEIGHT,

    columns,
    rows,
    cardsPerPage,

    trimWidth,
    trimHeight,
    bleed,
    slotWidth,
    slotHeight,

    offsetX,
    offsetY,

    showGuides: config.show_guides ?? true,
    showCropMarks: config.show_crop_marks ?? true,

    guideColor: rgb(0.75, 0.75, 0.75),
    guideThickness: config.guide_thickness || 0.8,

    cropMarkColor: rgb(0, 0, 0),
    cropMarkThickness: config.crop_mark_thickness || 1.2,
    cropMarkLength: config.crop_mark_length || 24,
    cropMarkOffset: config.crop_mark_offset || 8
  };
}

function getSlotPosition(index, layout) {
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);

  const x = layout.offsetX + col * layout.slotWidth;
  const yFromTop = layout.offsetY + row * layout.slotHeight;

  const y = layout.pageHeight - yFromTop - layout.slotHeight;

  return { x, y };
}

function getTrimPosition(slotX, slotY, layout) {
  return {
    x: slotX + layout.bleed,
    y: slotY + layout.bleed
  };
}

function drawGuideGrid(page, layout) {
  if (!layout.showGuides) return;

  const totalWidth = layout.columns * layout.slotWidth;
  const totalHeight = layout.rows * layout.slotHeight;

  const left = layout.offsetX;
  const right = layout.offsetX + totalWidth;
  const top = layout.pageHeight - layout.offsetY;
  const bottom = top - totalHeight;

  for (let c = 0; c <= layout.columns; c++) {
    const x = left + c * layout.slotWidth;
    page.drawLine({
      start: { x, y: bottom },
      end: { x, y: top },
      thickness: layout.guideThickness,
      color: layout.guideColor,
      opacity: 0.35
    });
  }

  for (let r = 0; r <= layout.rows; r++) {
    const y = top - r * layout.slotHeight;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: layout.guideThickness,
      color: layout.guideColor,
      opacity: 0.35
    });
  }
}

function drawCropMarks(page, trimX, trimY, trimW, trimH, layout) {
  if (!layout.showCropMarks) return;

  const len = layout.cropMarkLength;
  const off = layout.cropMarkOffset;
  const t = layout.cropMarkThickness;
  const color = layout.cropMarkColor;

  const left = trimX;
  const right = trimX + trimW;
  const bottom = trimY;
  const top = trimY + trimH;

  // topo esquerdo
  page.drawLine({
    start: { x: left - off - len, y: top },
    end: { x: left - off, y: top },
    thickness: t,
    color
  });
  page.drawLine({
    start: { x: left, y: top + off },
    end: { x: left, y: top + off + len },
    thickness: t,
    color
  });

  // topo direito
  page.drawLine({
    start: { x: right + off, y: top },
    end: { x: right + off + len, y: top },
    thickness: t,
    color
  });
  page.drawLine({
    start: { x: right, y: top + off },
    end: { x: right, y: top + off + len },
    thickness: t,
    color
  });

  // baixo esquerdo
  page.drawLine({
    start: { x: left - off - len, y: bottom },
    end: { x: left - off, y: bottom },
    thickness: t,
    color
  });
  page.drawLine({
    start: { x: left, y: bottom - off - len },
    end: { x: left, y: bottom - off },
    thickness: t,
    color
  });

  // baixo direito
  page.drawLine({
    start: { x: right + off, y: bottom },
    end: { x: right + off + len, y: bottom },
    thickness: t,
    color
  });
  page.drawLine({
    start: { x: right, y: bottom - off - len },
    end: { x: right, y: bottom - off },
    thickness: t,
    color
  });
}

async function embedImage(pdfDoc, imgPath) {
  ensureFileExists(imgPath, 'imagem');

  const imgBytes = fs.readFileSync(imgPath);
  const ext = path.extname(imgPath).toLowerCase();

  if (ext === '.jpg' || ext === '.jpeg') {
    return pdfDoc.embedJpg(imgBytes);
  }

  return pdfDoc.embedPng(imgBytes);
}

async function createPdfFromImages({
  imagePaths,
  outputPath,
  layout,
  repeatSingleImage = false,
  totalCount = null
}) {
  const pdfDoc = await PDFDocument.create();

  let imageChunks;

  if (repeatSingleImage) {
    if (!imagePaths.length) {
      throw new Error('Nenhuma imagem informada para repetição.');
    }

    if (typeof totalCount !== 'number' || totalCount < 1) {
      throw new Error('totalCount inválido para PDF de repetição.');
    }

    const repeated = Array.from({ length: totalCount }, () => imagePaths[0]);
    imageChunks = chunkArray(repeated, layout.cardsPerPage);
  } else {
    imageChunks = chunkArray(imagePaths, layout.cardsPerPage);
  }

  for (const chunk of imageChunks) {
    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

    drawGuideGrid(page, layout);

    for (let i = 0; i < chunk.length; i++) {
      const imgPath = chunk[i];
      const embeddedImage = await embedImage(pdfDoc, imgPath);

      const { x: slotX, y: slotY } = getSlotPosition(i, layout);
      const { x: trimX, y: trimY } = getTrimPosition(slotX, slotY, layout);

      // desenha a imagem ocupando a área total com sangria
      page.drawImage(embeddedImage, {
        x: slotX,
        y: slotY,
        width: layout.slotWidth,
        height: layout.slotHeight
      });

      drawCropMarks(page, trimX, trimY, layout.trimWidth, layout.trimHeight, layout);
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
}

async function createMergedPdf({
  frontPdfPath,
  backPdfPath,
  outputPath
}) {
  ensureFileExists(frontPdfPath, 'PDF da frente');
  ensureFileExists(backPdfPath, 'PDF do verso');

  const mergedPdf = await PDFDocument.create();

  const frontPdf = await PDFDocument.load(fs.readFileSync(frontPdfPath));
  const backPdf = await PDFDocument.load(fs.readFileSync(backPdfPath));

  const frontPages = await mergedPdf.copyPages(frontPdf, frontPdf.getPageIndices());
  const backPages = await mergedPdf.copyPages(backPdf, backPdf.getPageIndices());

  for (const page of frontPages) mergedPdf.addPage(page);
  for (const page of backPages) mergedPdf.addPage(page);

  const mergedBytes = await mergedPdf.save();
  fs.writeFileSync(outputPath, mergedBytes);
}

async function main() {
  const baseDir = __dirname;
  const outputDir = path.join(baseDir, 'output');
  const dadosFeedPath = path.join(baseDir, 'dados-feed.json');

  let jobDir;
  const argJobDir = process.argv[2];

  if (argJobDir) {
    jobDir = path.isAbsolute(argJobDir)
      ? argJobDir
      : path.join(baseDir, argJobDir);
  } else {
    jobDir = getLatestJobDir(outputDir);
  }

  const jobResultPath = path.join(jobDir, 'job-result.json');
  ensureFileExists(jobResultPath, 'job-result.json');

  const jobResult = JSON.parse(fs.readFileSync(jobResultPath, 'utf8'));

  const frontImage = jobResult.front_image;
  const backImages = jobResult.back_images || [];
  const quantity = jobResult.quantity;

  if (!frontImage) {
    throw new Error('front_image não encontrado no job-result.json');
  }

  if (!backImages.length) {
    throw new Error('Nenhuma imagem de verso encontrada no job-result.json');
  }

  let config = {};
  if (fs.existsSync(dadosFeedPath)) {
    const dadosFeed = JSON.parse(fs.readFileSync(dadosFeedPath, 'utf8'));
    config = dadosFeed.config || {};
  }

  const layout = buildLayout(config);

  const pdfDir = path.join(jobDir, 'pdf');
  ensureDir(pdfDir);

  const frontPdfPath = path.join(pdfDir, 'front.pdf');
  const backPdfPath = path.join(pdfDir, 'back.pdf');
  const finalPdfPath = path.join(pdfDir, 'final.pdf');

  console.log('Gerando PDF da frente com sangria...');
  await createPdfFromImages({
    imagePaths: [frontImage],
    outputPath: frontPdfPath,
    layout,
    repeatSingleImage: true,
    totalCount: quantity
  });

  console.log('Gerando PDF do verso com sangria...');
  await createPdfFromImages({
    imagePaths: backImages,
    outputPath: backPdfPath,
    layout,
    repeatSingleImage: false
  });

  console.log('Gerando PDF final...');
  await createMergedPdf({
    frontPdfPath,
    backPdfPath,
    outputPath: finalPdfPath
  });

  const result = {
    job_id: jobResult.job_id,
    template_id: jobResult.template_id,
    quantity,
    total_pages: jobResult.total_pages,
    layout: {
      pageWidth: layout.pageWidth,
      pageHeight: layout.pageHeight,
      columns: layout.columns,
      rows: layout.rows,
      cardsPerPage: layout.cardsPerPage,
      trimWidth: layout.trimWidth,
      trimHeight: layout.trimHeight,
      bleed: layout.bleed,
      slotWidth: layout.slotWidth,
      slotHeight: layout.slotHeight,
      offsetX: layout.offsetX,
      offsetY: layout.offsetY
    },
    front_pdf: frontPdfPath,
    back_pdf: backPdfPath,
    final_pdf: finalPdfPath
  };

  fs.writeFileSync(
    path.join(pdfDir, 'pdf-result.json'),
    JSON.stringify(result, null, 2),
    'utf8'
  );

  console.log('\nPDFs com sangria gerados com sucesso.');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Erro ao gerar PDF:', error);
  process.exit(1);
});