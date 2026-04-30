import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";

const LOGOS_DIR = path.resolve("logos");

// O Token deve ser configurado como variável de ambiente no Railway (GITHUB_TOKEN)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "esiolima";
const REPO_NAME = "cards_trade_v2";
const BRANCH = "fix-logos";

// Ensure logos directory exists
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

/**
 * Sincroniza as alterações na pasta /logos com o GitHub via API
 */
async function syncWithGithub(action: string, fileName: string, fileContent?: Buffer) {
  if (!GITHUB_TOKEN) {
    console.warn(`[GITHUB API SYNC] Sincronização ignorada: GITHUB_TOKEN não configurado.`);
    return;
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/logos/${fileName}`;
  const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    console.log(`[GITHUB API SYNC] Iniciando sincronização: ${action} ${fileName}`);

    // 1. Obter o SHA do arquivo (necessário para atualizar ou deletar)
    let sha: string | null = null;
    try {
      const getResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers });
      if (getResponse.ok) {
        const data = await getResponse.json() as { sha: string };
        sha = data.sha;
      }
    } catch (e) {
      // Arquivo pode não existir, o que é normal para novos uploads
    }

    if (action === "upload" && fileContent) {
      // 2. Criar ou Atualizar arquivo no GitHub
      const body = JSON.stringify({
        message: `Plataforma: ${sha ? 'Atualizado' : 'Adicionado'} logo ${fileName}`,
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
        console.log(`[GITHUB API SYNC] Sucesso: ${fileName} enviado para GitHub.`);
      } else {
        const errorData = await putResponse.json();
        console.error(`[GITHUB API SYNC] Erro no upload:`, errorData);
      }
    } else if (action === "delete" && sha) {
      // 3. Deletar arquivo no GitHub
      const body = JSON.stringify({
        message: `Plataforma: Removido logo ${fileName}`,
        sha: sha,
        branch: BRANCH,
      });

      const deleteResponse = await fetch(apiUrl, {
        method: "DELETE",
        headers,
        body,
      });

      if (deleteResponse.ok) {
        console.log(`[GITHUB API SYNC] Sucesso: ${fileName} removido do GitHub.`);
      } else {
        const errorData = await deleteResponse.json();
        console.error(`[GITHUB API SYNC] Erro na deleção:`, errorData);
      }
    }
  } catch (error: any) {
    console.error(`[GITHUB API SYNC] ERRO CRÍTICO:`, error.message);
  }
}

// Configure multer for logo uploads
const storage = multer.memoryStorage(); // Usar memoryStorage para facilitar o envio para API

const fileFilter = (
  req: express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
  if (!allowedMimes.includes(file.mimetype)) {
    cb(new Error("Apenas arquivos PNG, JPG, JPEG, WEBP e SVG são permitidos"));
    return;
  }

  if (file.originalname.includes("..") || file.originalname.includes("/")) {
    cb(new Error("Nome de arquivo inválido"));
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export function setupLogoUploadRoute(app: express.Express) {
  // Rota de Upload com suporte a substituição e sincronização via API GitHub
  app.post("/api/logo/upload", (req, res, next) => {
    const fileName = req.headers['x-file-name'] as string;
    const overwrite = req.headers['x-overwrite'] === 'true';

    if (fileName && !overwrite && fs.existsSync(path.join(LOGOS_DIR, fileName))) {
      return res.status(409).json({ 
        error: "CONFLITO", 
        message: `O arquivo "${fileName}" já existe. Deseja substituir?` 
      });
    }
    next();
  }, upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo foi enviado" });
    }

    const fileName = req.file.originalname;
    const filePath = path.join(LOGOS_DIR, fileName);

    try {
      // 1. Salvar localmente no servidor (Railway)
      fs.writeFileSync(filePath, req.file.buffer);

      // 2. Sincronizar com GitHub via API (em background)
      syncWithGithub('upload', fileName, req.file.buffer);

      res.json({
        success: true,
        message: `Logo "${fileName}" enviado com sucesso`,
        filename: fileName,
        path: `/logos/${fileName}`,
      });
    } catch (err) {
      res.status(500).json({ error: "Erro ao salvar o arquivo no servidor" });
    }
  });

  // Rota de Deleção de Logo com sincronização via API GitHub
  app.delete("/api/logos/:name", async (req, res) => {
    const logoName = req.params.name;
    const filePath = path.join(LOGOS_DIR, logoName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    try {
      // 1. Remover localmente
      fs.unlinkSync(filePath);
      
      // 2. Sincronizar com GitHub via API (em background)
      syncWithGithub('delete', logoName);
      
      res.json({ success: true, message: `Logo "${logoName}" excluída com sucesso` });
    } catch (err) {
      res.status(500).json({ error: "Erro ao excluir o arquivo" });
    }
  });

  app.use("/logos", express.static(LOGOS_DIR));
}
