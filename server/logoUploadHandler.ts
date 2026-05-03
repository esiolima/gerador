import express, { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const LOGOS_DIR = path.resolve("logos");

const allowedMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/avif",
];

const allowedExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".avif",
  ".jfif",
];

type GitHubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  logosPath: string;
};

function ensureLogosDir() {
  if (!fs.existsSync(LOGOS_DIR)) {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
  }
}

function sanitizeFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext);

  const safeBase =
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .trim() || "logo";

  return `${safeBase}${ext}`;
}

function resolveLogoPath(fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  const resolvedPath = path.resolve(LOGOS_DIR, safeName);
  const resolvedLogosDir = path.resolve(LOGOS_DIR);

  if (!resolvedPath.startsWith(resolvedLogosDir)) {
    throw new Error("Nome de arquivo inválido.");
  }

  return resolvedPath;
}

function getGitHubConfig(): GitHubConfig | null {
  const token = process.env.GITHUB_TOKEN || "";
  const owner = process.env.GITHUB_OWNER || "";
  const repo = process.env.GITHUB_REPO || "";
  const branch = process.env.GITHUB_BRANCH || "main";
  const logosPath = process.env.GITHUB_LOGOS_PATH || "logos";

  if (!token || !owner || !repo) {
    return null;
  }

  return {
    token,
    owner,
    repo,
    branch,
    logosPath: logosPath.replace(/^\/+|\/+$/g, ""),
  };
}

function getGitHubFilePath(fileName: string) {
  const config = getGitHubConfig();

  if (!config) {
    return "";
  }

  return `${config.logosPath}/${sanitizeFileName(fileName)}`;
}

async function githubRequest(
  url: string,
  options: RequestInit,
  config: GitHubConfig
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      json?.message ||
      `GitHub API retornou erro ${response.status} ao sincronizar logo.`;

    throw new Error(message);
  }

  return json;
}

async function getGitHubFileSha(
  config: GitHubConfig,
  githubPath: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(
    githubPath
  ).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.branch)}`;

  try {
    const json = await githubRequest(
      url,
      {
        method: "GET",
      },
      config
    );

    return json?.sha || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("not found")) {
      return null;
    }

    throw error;
  }
}

async function syncLogoUploadToGitHub(fileName: string, filePath: string) {
  const config = getGitHubConfig();

  if (!config) {
    console.log("[GitHub] Variáveis não configuradas. Upload não sincronizado.");
    return {
      enabled: false,
      action: "skipped",
      message: "GitHub não configurado.",
    };
  }

  const githubPath = getGitHubFilePath(fileName);
  const sha = await getGitHubFileSha(config, githubPath);
  const content = fs.readFileSync(filePath).toString("base64");

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(
    githubPath
  ).replace(/%2F/g, "/")}`;

  await githubRequest(
    url,
    {
      method: "PUT",
      body: JSON.stringify({
        message: sha
          ? `Atualiza logo ${fileName}`
          : `Adiciona logo ${fileName}`,
        content,
        branch: config.branch,
        ...(sha ? { sha } : {}),
      }),
    },
    config
  );

  console.log(`[GitHub] Logo sincronizada: ${githubPath}`);

  return {
    enabled: true,
    action: sha ? "updated" : "created",
    path: githubPath,
    message: "Logo sincronizada com GitHub.",
  };
}

async function syncLogoDeleteFromGitHub(fileName: string) {
  const config = getGitHubConfig();

  if (!config) {
    console.log("[GitHub] Variáveis não configuradas. Delete não sincronizado.");
    return {
      enabled: false,
      action: "skipped",
      message: "GitHub não configurado.",
    };
  }

  const githubPath = getGitHubFilePath(fileName);
  const sha = await getGitHubFileSha(config, githubPath);

  if (!sha) {
    console.log(`[GitHub] Arquivo não encontrado no repo: ${githubPath}`);
    return {
      enabled: true,
      action: "not_found",
      path: githubPath,
      message: "Arquivo não existia no GitHub.",
    };
  }

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(
    githubPath
  ).replace(/%2F/g, "/")}`;

  await githubRequest(
    url,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: `Remove logo ${fileName}`,
        sha,
        branch: config.branch,
      }),
    },
    config
  );

  console.log(`[GitHub] Logo removida: ${githubPath}`);

  return {
    enabled: true,
    action: "deleted",
    path: githubPath,
    message: "Logo removida do GitHub.",
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureLogosDir();
    cb(null, LOGOS_DIR);
  },
  filename: (_req, file, cb) => {
    const safeName = sanitizeFileName(file.originalname);
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
      cb(null, true);
      return;
    }

    cb(new Error("Formato de imagem não permitido."));
  },
});

async function handleLogoUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Nenhum arquivo de logo enviado.",
      });
    }

    const github = await syncLogoUploadToGitHub(
      req.file.filename,
      req.file.path
    );

    return res.json({
      success: true,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      url: `/logos/${req.file.filename}`,
      github,
    });
  } catch (error) {
    console.error("[logoUploadHandler] Erro ao enviar logo:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao enviar logo.",
    });
  }
}

export function setupLogoUploadRoute(app: Express) {
  ensureLogosDir();

  app.use("/logos", express.static(LOGOS_DIR));

  app.post(
    "/api/upload-logo",
    upload.single("logo"),
    handleLogoUpload
  );

  // Compatibilidade com versões anteriores do frontend
  app.post(
    "/api/logo/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Nenhum arquivo de logo enviado.",
        });
      }

      return handleLogoUpload(req, res);
    }
  );

  app.get("/api/logos", (_req: Request, res: Response) => {
    try {
      ensureLogosDir();

      const files = fs
        .readdirSync(LOGOS_DIR)
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return allowedExtensions.includes(ext);
        })
        .map((file) => {
          const filePath = path.join(LOGOS_DIR, file);
          const stats = fs.statSync(filePath);

          return {
            name: file,
            fileName: file,
            path: `/logos/${file}`,
            url: `/logos/${file}`,
            mtime: stats.mtimeMs,
          };
        });

      return res.json({
        success: true,
        logos: files,
      });
    } catch (error) {
      console.error("[logoUploadHandler] Erro ao listar logos:", error);

      return res.status(500).json({
        success: false,
        error: "Erro ao listar logos.",
      });
    }
  });

  app.delete("/api/logos/:name", async (req: Request, res: Response) => {
    try {
      const rawName = String(req.params.name || "").trim();

      if (!rawName) {
        return res.status(400).json({
          success: false,
          error: "Nome do arquivo não informado.",
        });
      }

      const fileName = sanitizeFileName(rawName);

      if (fileName === "blank.png") {
        return res.status(400).json({
          success: false,
          error: "O arquivo blank.png não pode ser excluído.",
        });
      }

      const filePath = resolveLogoPath(fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: "Logo não encontrada no servidor.",
        });
      }

      fs.unlinkSync(filePath);

      const github = await syncLogoDeleteFromGitHub(fileName);

      return res.json({
        success: true,
        fileName,
        message: `Logo "${fileName}" excluída com sucesso.`,
        github,
      });
    } catch (error) {
      console.error("[logoUploadHandler] Erro ao excluir logo:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao excluir logo.",
      });
    }
  });
}
