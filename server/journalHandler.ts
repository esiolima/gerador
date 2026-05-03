import { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";

const OUTPUT_DIR = path.resolve("output");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeFileName(value: string): string {
  const safe =
    String(value || "jornal-diagramado")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .trim() || "jornal-diagramado";

  return safe.endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function getExecutablePath() {
  return (
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_BIN ||
    process.env.CHROMIUM_PATH ||
    "/usr/bin/chromium"
  );
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = getExecutablePath();

  console.log(`[JournalHandler] Launching browser with: ${executablePath}`);

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-features=Translate,BackForwardCache,AcceptCHFrame",
      "--no-first-run",
      "--no-zygote",
    ],
  });
}

function buildSafeHtml(html: string) {
  return String(html || "").replace(
    "</head>",
    `
<style id="journal-pdf-safety">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }

  body {
    width: 2400px;
    overflow: visible !important;
  }

  .journal-page-label {
    display: none !important;
  }

  .journal-page,
  .journal-flow-page {
    width: 2400px !important;
    min-height: 4267px !important;
    margin: 0 !important;
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
  }

  .journal-page:last-child,
  .journal-flow-page:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
</style>
</head>`
  );
}

export function setupJournalRoute(app: Express) {
  ensureDir(OUTPUT_DIR);

  app.post("/api/journal/pdf", async (req: Request, res: Response) => {
    let browser: Browser | null = null;

    try {
      const html = String(req.body?.html || "");
      const jobId = String(req.body?.jobId || `journal_${Date.now()}`);
      const requestedFileName = String(req.body?.fileName || "jornal-diagramado.pdf");

      if (!html.trim()) {
        return res.status(400).json({
          success: false,
          error: "HTML do jornal não foi recebido pelo servidor.",
        });
      }

      const jobDir = path.join(OUTPUT_DIR, jobId);
      ensureDir(jobDir);

      const pdfName = sanitizeFileName(requestedFileName.replace(/\.zip$/i, ""));
      const pdfPath = path.join(jobDir, pdfName);

      browser = await launchBrowser();
      const page = await browser.newPage();

      page.on("console", (msg) => {
        const text = msg.text();
        if (text.toLowerCase().includes("erro") || text.toLowerCase().includes("error")) {
          console.log(`[JournalHandler][console] ${text}`);
        }
      });

      page.on("pageerror", (error) => {
        console.error("[JournalHandler][pageerror]", error);
      });

      await page.setViewport({
        width: 2400,
        height: 4267,
        deviceScaleFactor: 1,
      });

      await page.setContent(buildSafeHtml(html), {
        waitUntil: "load",
        timeout: 90000,
      });

      await page.evaluate(async () => {
        // @ts-ignore
        if (document.fonts?.ready) await document.fonts.ready;

        const images = Array.from(document.images);

        await Promise.all(
          images.map((img) => {
            if (img.complete) return Promise.resolve();

            return new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            });
          })
        );

        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      await page.pdf({
        path: pdfPath,
        width: "2400px",
        height: "4267px",
        printBackground: true,
        preferCSSPageSize: false,
        margin: {
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
        timeout: 120000,
      });

      await page.close().catch(() => {});

      return res.json({
        success: true,
        pdfPath,
        pdfUrl: `/output/${jobId}/${pdfName}`,
        downloadUrl: `/api/journal/download?pdfPath=${encodeURIComponent(pdfPath)}`,
        fileName: pdfName,
      });
    } catch (error) {
      console.error("[JournalHandler] Erro ao gerar PDF do jornal:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar PDF do jornal diagramado.",
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  });

  app.get("/api/journal/download", async (req: Request, res: Response) => {
    try {
      const pdfPath = String(req.query?.pdfPath || "");

      if (!pdfPath) {
        return res.status(400).json({
          success: false,
          error: "Caminho do PDF não informado.",
        });
      }

      const resolvedPath = path.resolve(pdfPath);
      const resolvedOutputDir = path.resolve(OUTPUT_DIR);

      if (!resolvedPath.startsWith(resolvedOutputDir)) {
        return res.status(403).json({
          success: false,
          error: "Acesso negado ao arquivo solicitado.",
        });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({
          success: false,
          error: "PDF não encontrado.",
        });
      }

      const fileName = path.basename(resolvedPath);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );

      return res.download(resolvedPath, fileName);
    } catch (error) {
      console.error("[JournalHandler] Erro ao baixar PDF do jornal:", error);

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao baixar PDF do jornal diagramado.",
      });
    }
  });

}
