const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: '50mb' }));

const baseDir = __dirname;
const outputDir = path.join(baseDir, 'output');
const jobsDir = path.join(baseDir, 'jobs');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true });

app.use('/files', express.static(outputDir));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getJobPaths(jobId) {
  const jobMetaDir = path.join(jobsDir, jobId);
  const payloadPath = path.join(jobMetaDir, 'payload.json');
  const statusPath = path.join(jobMetaDir, 'status.json');

  const outputJobDir = path.join(outputDir, jobId);
  const jobResultPath = path.join(outputJobDir, 'job-result.json');
  const pdfResultPath = path.join(outputJobDir, 'pdf', 'pdf-result.json');

  return {
    jobMetaDir,
    payloadPath,
    statusPath,
    outputJobDir,
    jobResultPath,
    pdfResultPath
  };
}

function buildFileUrl(jobId, relativePath) {
  return `${BASE_URL}/files/${jobId}/${relativePath}`.replace(/\\/g, '/');
}

function startGenerationInBackground(jobId, payloadPath, statusPath) {
  const child = spawn('node', ['index.js', payloadPath, jobId], {
    cwd: baseDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  child.unref();

  writeJson(statusPath, {
    success: true,
    job_id: jobId,
    status: 'processing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.post('/generate', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.template_id) {
      return res.status(400).json({
        success: false,
        message: 'template_id é obrigatório'
      });
    }

    if (!payload.quantity || payload.quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'quantity inválido'
      });
    }

    const jobId = `${payload.template_id}-${Date.now()}`;
    const { jobMetaDir, payloadPath, statusPath } = getJobPaths(jobId);

    ensureDir(jobMetaDir);

    const payloadToSave = {
      ...payload,
      auto_generate_pdf: true
    };

    writeJson(payloadPath, payloadToSave);

    writeJson(statusPath, {
      success: true,
      job_id: jobId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    startGenerationInBackground(jobId, payloadPath, statusPath);

    return res.json({
      success: true,
      job_id: jobId,
      status: 'pending'
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar job',
      details: err?.message || err
    });
  }
});

app.get('/status_generate/:job_id', (req, res) => {
  try {
    const { job_id } = req.params;
    const { statusPath } = getJobPaths(job_id);

    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({
        success: false,
        message: 'Job não encontrado'
      });
    }

    const status = readJson(statusPath);
    return res.json(status);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: 'Erro ao consultar status',
      details: err?.message || err
    });
  }
});

app.get('/get_generate/:job_id', (req, res) => {
  try {
    const { job_id } = req.params;
    const { statusPath, pdfResultPath } = getJobPaths(job_id);

    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({
        success: false,
        message: 'Job não encontrado'
      });
    }

    const status = readJson(statusPath);

    if (status.status !== 'completed') {
      return res.status(400).json({
        success: false,
        job_id,
        status: status.status,
        message: 'Job ainda não finalizado'
      });
    }

    if (!fs.existsSync(pdfResultPath)) {
      return res.status(404).json({
        success: false,
        message: 'Resultado do PDF não encontrado'
      });
    }

    return res.json({
      success: true,
      job_id,
      status: 'completed',
      front_pdf_url: buildFileUrl(job_id, 'pdf/front.pdf'),
      back_pdf_url: buildFileUrl(job_id, 'pdf/back.pdf'),
      final_pdf_url: buildFileUrl(job_id, 'pdf/final.pdf')
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: 'Erro ao obter resultado do job',
      details: err?.message || err
    });
  }
});

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});