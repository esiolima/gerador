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

    const allowedExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".svg",
      ".avif",
      ".jfif",
    ];

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
      ensureLogosDir();

      const files = fs
        .readdirSync(LOGOS_DIR)
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return [".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif", ".jfif"].includes(ext);
        })
        .map((file) => ({
          fileName: file,
          url: `/logos/${file}`,
        }));

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
}
