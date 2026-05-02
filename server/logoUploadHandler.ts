import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";

const LOGOS_DIR = path.resolve("logos");

/**
 * CONFIGURAÇÃO DO GITHUB
 * Prioriza variáveis de ambiente, mas mantém seus dados como fallback
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || "esiolima";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "gerador";
const BRANCH = process.env.GITHUB_BRANCH || "main"; // Geralmente 'main' ou 'master'

// Garante que a pasta de logos existe localmente
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

/**
 * Sincroniza as alterações na pasta /logos com o GitHub via API
 */
async function syncWithGithub(action: string, fileName: string, fileContent?: Buffer) {
  if (!GITHUB_TOKEN) {
    console.warn(`[GITHUB API SYNC] Ignorado: GITHUB_TOKEN não configurado.`);
    return;
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/logos/${fileName}`;
  const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    console.log(`[GITHUB API SYNC] Iniciando: ${action} em ${REPO_OWNER}/${REPO_NAME} (${BRANCH})`);

    // 1. Tenta obter o SHA do arquivo (necessário para atualizar ou deletar)
    let sha: string | null = null;
    try {
      const getResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers });
      if (getResponse.ok) {
        const data = await getResponse.json() as { sha: string };
        sha = data.sha;
      }
    } catch (e) {
      // Arquivo novo, sem SHA anterior
    }

    if (action === "upload" && fileContent) {
      // 2. Criar ou Atualizar no GitHub
      const body = JSON.stringify({
        message: `Upload: ${fileName} via Gerador`,
        content: fileContent.toString("base64"),
        branch: BRANCH,
        sha: sha || undefined,
      });

      const putResponse = await fetch(apiUrl, {
        method: "PUT",
        headers,
        body,
      });

      if (putResponse.ok) {
        console.log(`[GITHUB API SYNC] Sucesso: ${fileName} sincronizado.`);
      } else {
        const errorData = await putResponse.json();
        console.error(`[GITHUB API SYNC] Erro no upload:`, errorData);
      }
    } else if (action === "delete" && sha) {
      // 3. Deletar no GitHub
      const body = JSON.stringify({
        message: `Delete: ${fileName} via Gerador`,
        sha: sha,
        branch: BRANCH,
      });

      const deleteResponse = await fetch(apiUrl, {
        method: "DELETE",
        headers,
        body,
      });

      if (deleteResponse.ok) {
        console.log(`[GITHUB API SYNC] Sucesso: ${fileName} removido.`);
      } else {
        const errorData = await deleteResponse.json();
        console.error(`[GITHUB API SYNC] Erro na remoção:`, errorData);
      }
    }
  } catch (error: any) {
    console.error(`[GITHUB API SYNC] Erro crítico:`, error.message);
  }
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Formato inválido."));
    }
    cb(null, true);
  },
});

export function setupLogoUploadRoute(app: express.Express) {
  // Rota de Upload
  app.post("/api/logo/upload", (req, res, next) => {
    const fileName = req.headers['x-file-name'] as string;
    const overwrite = req.headers['x-overwrite'] === 'true';
    if (fileName && !overwrite && fs.existsSync(path.join(LOGOS_DIR, fileName))) {
      return res.status(409).json({ error: "CONFLITO", message: "Arquivo já existe." });
    }
    next();
  }, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Sem arquivo." });

    const fileName = req.file.originalname;
    const filePath = path.join(LOGOS_DIR, fileName);

    try {
      // Salva local e dispara sync assíncrono
      fs.writeFileSync(filePath, req.file.buffer);
      syncWithGithub('upload', fileName, req.file.buffer);

      res.json({
        success: true,
        filename: fileName,
        path: `/logos/${fileName}`,
      });
    } catch (err) {
      res.status(500).json({ error: "Erro ao salvar no servidor." });
    }
  });

  // Rota de Deleção
  app.delete("/api/logos/:name", async (req, res) => {
    const logoName = req.params.name;
    const filePath = path.join(LOGOS_DIR, logoName);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Não encontrado." });

    try {
      fs.unlinkSync(filePath);
      syncWithGithub('delete', logoName);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Erro ao excluir." });
    }
  });

  app.use("/logos", express.static(LOGOS_DIR));
}
