const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const nodeHtmlToImage = require('node-html-to-image');

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';

  return 'application/octet-stream';
}

function fileToDataUri(filePath) {
  const file = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  return `data:${mimeType};base64,${file.toString('base64')}`;
}

function svgToColoredDataUri(filePath, fillColor) {
  let svg = fs.readFileSync(filePath, 'utf8');
  svg = svg.replace(/fill="[^"]*"/g, `fill="${fillColor}"`);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function padNumber(num, size = 3) {
  return String(num).padStart(size, '0');
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function buildIcons(iconsDir, content) {
  return {
    icon_home: fs.existsSync(path.join(iconsDir, 'home.svg'))
      ? fileToDataUri(path.join(iconsDir, 'home.svg'))
      : '',

    icon_grid: fs.existsSync(path.join(iconsDir, 'list.svg'))
      ? fileToDataUri(path.join(iconsDir, 'list.svg'))
      : '',

    icon_options: fs.existsSync(path.join(iconsDir, 'options.svg'))
      ? fileToDataUri(path.join(iconsDir, 'options.svg'))
      : '',

    icon_profile: fs.existsSync(path.join(iconsDir, 'profile.svg'))
      ? fileToDataUri(path.join(iconsDir, 'profile.svg'))
      : '',

    icon_search: fs.existsSync(path.join(iconsDir, 'search.svg'))
      ? fileToDataUri(path.join(iconsDir, 'search.svg'))
      : '',

    icon_reels: fs.existsSync(path.join(iconsDir, 'svgexport-3.svg'))
      ? fileToDataUri(path.join(iconsDir, 'svgexport-3.svg'))
      : '',

    icon_add: fs.existsSync(path.join(iconsDir, 'add.svg'))
      ? fileToDataUri(path.join(iconsDir, 'add.svg'))
      : '',

    heart_icon: fs.existsSync(path.join(iconsDir, 'heart.svg'))
      ? fileToDataUri(path.join(iconsDir, 'heart.svg'))
      : '',

    shape_1: fs.existsSync(path.join(iconsDir, 'shape_1.svg'))
      ? svgToColoredDataUri(
          path.join(iconsDir, 'shape_1.svg'),
          content.shape_1_color || '#ffca28'
        )
      : '',

    shape_2: fs.existsSync(path.join(iconsDir, 'shape_2.svg'))
      ? svgToColoredDataUri(
          path.join(iconsDir, 'shape_2.svg'),
          content.shape_2_color || '#ffca28'
        )
      : '',

    icon_instagram: fs.existsSync(path.join(iconsDir, 'icon_instagram.svg'))
      ? fileToDataUri(path.join(iconsDir, 'icon_instagram.svg'))
      : '',

    icon_whatsapp: fs.existsSync(path.join(iconsDir, 'icon_whatsapp.svg'))
      ? fileToDataUri(path.join(iconsDir, 'icon_whatsapp.svg'))
      : '',

    nome_instagram: fs.existsSync(path.join(iconsDir, 'nome_instagram.webp'))
      ? fileToDataUri(path.join(iconsDir, 'nome_instagram.webp'))
      : '',
    cedula_20_front: fs.existsSync(path.join(iconsDir, '20_front.jpg'))
      ? fileToDataUri(path.join(iconsDir, '20_front.jpg'))
      : '',
  };
}

function getTemplatePaths(templateId, options = {}) {
  const variant = String(options.backVariant || '01').padStart(2, '0');

  const templateMap = {
    'template-0': {
      front: path.join('template-0', 'template-0_frente.html'),
      back: null
    },
    'cartao-feed-instagram-01': {
      front: path.join('cartao-feed-instagram-01', 'cartao-feed-instagram-01_frente.html'),
      back: path.join('cartao-feed-instagram-01', 'cartao-feed-instagram-01_verso.html')
    },
    'cartao-feed-instagram-02': {
      front: path.join('cartao-feed-instagram-02', 'cartao-feed-instagram-02_frente.html'),
      back: path.join('cartao-feed-instagram-01', 'cartao-feed-instagram-01_verso.html')
    },
    'cartao-feed-instagram-03': {
      front: path.join('cartao-feed-instagram-03', 'cartao-feed-instagram-03_frente.html'),
      back: path.join('cartao-feed-instagram-03', `cartao-feed-instagram-03_verso_${variant}.html`)
    }
  };

  const found = templateMap[templateId];

  if (!found) {
    throw new Error(`Template ID não encontrado: ${templateId}`);
  }

  return found;
}

function buildQrUrl(baseData, index) {
  if (baseData.qr_base_url) {
    return `${baseData.qr_base_url}${index}`;
  }

  return baseData.qr_url || '';
}

function getViewport(templateId, data) {
  if (templateId === 'template-0') {
    return {
      width: data.qr_width || 250,
      height: data.qr_height || 250
    };
  }

  return {
    width: 636,
    height: 1116
  };
}

async function renderImage({
  htmlPath,
  data,
  outputPath,
  iconsDir,
  templateId
}) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const icons = buildIcons(iconsDir, data);
  const viewport = getViewport(templateId, data);

  await nodeHtmlToImage({
    output: outputPath,
    html,
    content: {
      ...data,
      ...icons
    },
    transparent: true,
    waitUntil: 'networkidle0',
    puppeteerArgs: {
      defaultViewport: viewport,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    }
  });
}

function runPdfBuilder(baseDir, jobDir) {
  const pdfBuilderPath = path.join(baseDir, 'pdf-builder.js');

  if (!fs.existsSync(pdfBuilderPath)) {
    throw new Error(`pdf-builder.js não encontrado em: ${pdfBuilderPath}`);
  }

  execFileSync('node', [pdfBuilderPath, jobDir], {
    stdio: 'ignore',
    cwd: baseDir,
    windowsHide: true
  });
}

async function generateTemplateZero({
  baseDir,
  templateId,
  quantity,
  front,
  config,
  jobId,
  iconsDir,
  outputDir
}) {
  const templatePaths = getTemplatePaths(templateId);
  const frontHtmlPath = path.join(baseDir, 'templates', templatePaths.front);

  if (!fs.existsSync(frontHtmlPath)) {
    throw new Error(`Template do template-0 não encontrado: ${frontHtmlPath}`);
  }

  const jobDir = path.join(outputDir, jobId);
  const frontsDir = path.join(jobDir, 'fronts');

  ensureDir(jobDir);
  ensureDir(frontsDir);

  const frontBaseData = {
    ...front,
    qr_width: front?.qr_width || 250,
    qr_height: front?.qr_height || 250
  };

  const frontImages = [];

  for (let i = 0; i < quantity; i++) {
    const qrUrl = buildQrUrl(frontBaseData, i);

    const frontData = {
      ...frontBaseData,
      qr_url: qrUrl
    };

    const frontFileName = `front-${padNumber(i, 3)}.png`;
    const frontOutputPath = path.join(frontsDir, frontFileName);

    await renderImage({
      htmlPath: frontHtmlPath,
      data: frontData,
      outputPath: frontOutputPath,
      iconsDir,
      templateId
    });

    frontImages.push(frontOutputPath);
  }

  const result = {
    job_id: jobId,
    template_id: templateId,
    template_mode: 'front-only',
    quantity,
    front_images: frontImages,
    config,
    front_meta: {
      qr_width: frontBaseData.qr_width,
      qr_height: frontBaseData.qr_height
    },
    output_dir: jobDir
  };

  writeJson(path.join(jobDir, 'job-result.json'), result);

  return result;
}

async function generateRegularTemplate({
  baseDir,
  templateId,
  quantity,
  front,
  back,
  config,
  jobId,
  iconsDir,
  outputDir
}) {
  
  const templatePaths = getTemplatePaths(templateId, {
    backVariant: back?.template_variant || '01'
  });

  const jobDir = path.join(outputDir, jobId);
  const backsDir = path.join(jobDir, 'backs');

  ensureDir(jobDir);
  ensureDir(backsDir);

  const frontHtmlPath = path.join(baseDir, 'templates', templatePaths.front);
  const backHtmlPath = templatePaths.back
    ? path.join(baseDir, 'templates', templatePaths.back)
    : null;

  if (!fs.existsSync(frontHtmlPath)) {
    throw new Error(`Template da frente não encontrado: ${frontHtmlPath}`);
  }

  if (backHtmlPath && !fs.existsSync(backHtmlPath)) {
    throw new Error(`Template do verso não encontrado: ${backHtmlPath}`);
  }

  const frontOutputPath = path.join(jobDir, 'front.png');

  await renderImage({
    htmlPath: frontHtmlPath,
    data: front,
    outputPath: frontOutputPath,
    iconsDir,
    templateId
  });

  const backOutputPaths = [];

  if (backHtmlPath) {
    for (let i = 0; i < quantity; i++) {
      const qrUrl = buildQrUrl(back, i);

      const backData = {
        ...back,
        qr_url: qrUrl
      };

      const backFileName = `back-${padNumber(i, 3)}.png`;
      const backOutputPath = path.join(backsDir, backFileName);

      await renderImage({
        htmlPath: backHtmlPath,
        data: backData,
        outputPath: backOutputPath,
        iconsDir,
        templateId
      });

      backOutputPaths.push(backOutputPath);
    }
  }

  const cardsPerPage = config?.cards_per_page || 12;
  const totalPages = Math.ceil(quantity / cardsPerPage);

  const result = {
    job_id: jobId,
    template_id: templateId,
    template_mode: 'front-back',
    quantity,
    cards_per_page: cardsPerPage,
    total_pages: totalPages,
    front_image: frontOutputPath,
    back_images: backOutputPaths,
    config,
    output_dir: jobDir
  };

  writeJson(path.join(jobDir, 'job-result.json'), result);

  return result;
}

async function main() {
  const baseDir = __dirname;
  const argDataPath = process.argv[2];
  const argJobId = process.argv[3];

  const dataPath = argDataPath
    ? path.isAbsolute(argDataPath)
      ? argDataPath
      : path.join(baseDir, argDataPath)
    : path.join(baseDir, 'dados-feed.json');

  const iconsDir = path.join(baseDir, 'icons');
  const outputDir = path.join(baseDir, 'output');
  const jobsDir = path.join(baseDir, 'jobs');

  ensureDir(outputDir);
  ensureDir(jobsDir);

  if (!fs.existsSync(dataPath)) {
    throw new Error(`Arquivo JSON não encontrado em: ${dataPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const {
    template_id,
    quantity,
    front,
    back,
    config = {},
    auto_generate_pdf = false
  } = payload;

  if (!template_id) throw new Error('template_id não informado');
  if (!quantity || quantity < 1) throw new Error('quantity inválido');
  if (!front) throw new Error('front não informado');

  const jobId = argJobId || `${template_id}-${Date.now()}`;
  const statusPath = path.join(jobsDir, `${jobId}.status.json`);

  writeJson(statusPath, {
    success: true,
    job_id: jobId,
    status: 'processing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  try {
    let result;

    if (template_id === 'template-0') {
      result = await generateTemplateZero({
        baseDir,
        templateId: template_id,
        quantity,
        front,
        config,
        jobId,
        iconsDir,
        outputDir
      });
    } else {
      if (!back) {
        throw new Error('back não informado para template com verso');
      }

      result = await generateRegularTemplate({
        baseDir,
        templateId: template_id,
        quantity,
        front,
        back,
        config,
        jobId,
        iconsDir,
        outputDir
      });
    }

    if (auto_generate_pdf) {
      runPdfBuilder(baseDir, result.output_dir);
    }

    writeJson(statusPath, {
      success: true,
      job_id: jobId,
      status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    writeJson(statusPath, {
      success: false,
      job_id: jobId,
      status: 'failed',
      error: error.message,
      updated_at: new Date().toISOString()
    });

    throw error;
  }
}

main().catch((error) => {
  console.error('Erro no processo:', error);
  process.exit(1);
});