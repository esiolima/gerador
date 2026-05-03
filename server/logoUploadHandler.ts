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

function getSafeLogoPath(fileName: string): string | null {
  const sanitizedName = sanitizeFileName(fileName);
  const resolvedPath = path.resolve(LOGOS_DIR, sanitizedName);
  const resolvedLogosDir = path.resolve(LOGOS_DIR);

  if (!resolvedPath.startsWith(resolvedLogosDir + path.sep)) {
    return null;
  }

  return resolvedPath;
}

function listLogoFiles() {
  ensureLogosDir();

  return fs
    .readdirSync(LOGOS_DIR)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return allowedExtensions.includes(ext);
    })
    .map((file) => {
      const filePath = path.join(LOGOS_DIR, file);
      const stat = fs.statSync(filePath);

      return {
        name: file,
        fileName: file,
        path: `/logos/${file}`,
        url: `/logos/${file}`,
        mtime: stat.mtimeMs,
      };
    });
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

export function setupLogoUploadRoute(app: Express) {
  ensureLogosDir();

  app.use("/logos", express.static(LOGOS_DIR));

  app.post(
    "/api/upload-logo",
    upload.single("logo"),
    (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: "Nenhum arquivo de logo enviado.",
          });
        }

        return res.json({
          success: true,
          fileName: req.file.filename,
          originalName: req.file.originalname,
          url: `/logos/${req.file.filename}`,
          path: `/logos/${req.file.filename}`,
        });
      } catch (error) {
        console.error("[logoUploadHandler] Erro ao enviar logo:", error);

        return res.status(500).json({
          success: false,
          error: "Erro ao enviar logo.",
        });
      }
    }
  );

  app.post(
    "/api/logo/upload",
    upload.single("file"),
    (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: "Nenhum arquivo de logo enviado.",
          });
        }

        const originalNameFromHeader = String(req.headers["x-file-name"] || "");
        const overwrite = String(req.headers["x-overwrite"] || "false") === "true";
        const safeName = sanitizeFileName(originalNameFromHeader || req.file.originalname);
        const finalPath = path.join(LOGOS_DIR, safeName);

        if (req.file.filename !== safeName) {
          if (fs.existsSync(finalPath) && !overwrite) {
            fs.unlinkSync(req.file.path);

            return res.status(409).json({
              success: false,
              error: `O arquivo "${safeName}" já existe.`,
            });
          }

          if (fs.existsSync(finalPath) && overwrite) {
            fs.unlinkSync(finalPath);
          }

          fs.renameSync(req.file.path, finalPath);
        }

        return res.json({
          success: true,
          fileName: safeName,
          originalName: req.file.originalname,
          url: `/logos/${safeName}`,
          path: `/logos/${safeName}`,
        });
      } catch (error) {
        console.error("[logoUploadHandler] Erro ao enviar logo:", error);

        return res.status(500).json({
          success: false,
          error: "Erro ao enviar logo.",
        });
      }
    }
  );

  app.get("/api/logos", (_req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        logos: listLogoFiles(),
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
          error: "Nome do logo não informado.",
        });
      }

      if (rawName === "blank.png") {
        return res.status(403).json({
          success: false,
          error: "O arquivo blank.png não pode ser excluído.",
        });
      }

      const logoPath = getSafeLogoPath(rawName);

      if (!logoPath) {
        return res.status(403).json({
          success: false,
          error: "Acesso negado ao arquivo solicitado.",
        });
      }

      if (!fs.existsSync(logoPath)) {
        return res.status(404).json({
          success: false,
          error: "Logo não encontrado.",
        });
      }

      fs.unlinkSync(logoPath);

      console.log(`[logoUploadHandler] Logo excluído: ${path.basename(logoPath)}`);

      return res.json({
        success: true,
        message: "Logo excluído com sucesso.",
        deleted: path.basename(logoPath),
        githubSync: false,
      });
    } catch (error) {
      console.error("[logoUploadHandler] Erro ao excluir logo:", error);

      return res.status(500).json({
        success: false,
        error: "Erro ao excluir logo.",
      });
    }
  });
}
