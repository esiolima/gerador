import express from "express";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer-core";

const OUTPUT_DIR = path.resolve("output");
const PROJECT_ROOT = path.resolve();

function assertInsideOutput(filePath: string) {
  const resolved = path.resolve(filePath);
  const outputResolved = path.resolve(OUTPUT_DIR);

  if (!resolved.startsWith(outputResolved)) {
    throw new Error("Acesso negado ao caminho solicitado.");
  }

  return resolved;
}

function getChromiumExecutablePath() {
  return (
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_BIN ||
    process.env.CHROMIUM_PATH ||
    "/usr/bin/chromium"
  );
}

function prepareHtmlForPdf(html: string) {
  let preparedHtml = html.includes("<base")
    ? html
    : html.replace(
        "<head>",
        `<head><base href="file://${PROJECT_ROOT}/">`
      );

  preparedHtml = preparedHtml.replaceAll(
    'src="/assets/',
    `src="file://${path.join(PROJECT_ROOT, "assets").replace(/\\/g, "/")}/`
  );

  preparedHtml = preparedHtml.replaceAll(
    'src="/fonts/',
    `src="file://${path.join(PROJECT_ROOT, "fonts").replace(/\\/g, "/")}/`
  );

  return preparedHtml;
}

export function setupJournalRoute(app: express.Express) {
  app.post("/api/journal/pdf", async (req, res) => {
    const { html, jobId } = req.body ?? {};

    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "HTML do jornal não recebido." });
    }

    const safeJobId = String(jobId || `journal_${Date.now()}`).replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );

    const jobDir = path.join(OUTPUT_DIR, safeJobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const htmlPath = assertInsideOutput(path.join(jobDir, "jornal_editado.html"));
    const pdfPath = assertInsideOutput(path.join(jobDir, "jornal_gerado.pdf"));

    const finalHtml = prepareHtmlForPdf(html);
    fs.writeFileSync(htmlPath, finalHtml, "utf8");

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

    try {
      browser = await puppeteer.launch({
        executablePath: getChromiumExecutablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--font-render-hinting=none",
          "--allow-file-access-from-files",
        ],
        headless: true,
      });

      const page = await browser.newPage();

      await page.setViewport({
        width: 2400,
        height: 4267,
        deviceScaleFactor: 1,
      });

      await page.goto(`file://${htmlPath}`, {
        waitUntil: "networkidle0",
        timeout: 120000,
      });

      await page.evaluate(async () => {
        document.querySelectorAll("template[shadowrootmode]").forEach((template) => {
          const mode = template.getAttribute("shadowrootmode") || "open";
          const parent = template.parentElement;

          if (!parent || parent.shadowRoot) return;

          const shadow = parent.attachShadow({ mode: mode as ShadowRootMode });
          shadow.appendChild(template.content.cloneNode(true));
          template.remove();
        });

        document.querySelectorAll(".journal-page-label").forEach((el) => el.remove());

        const viewport = document.querySelector(".journal-preview-viewport") as HTMLElement | null;
        if (viewport) {
          viewport.style.width = "2400px";
          viewport.style.maxHeight = "none";
          viewport.style.overflow = "visible";
          viewport.style.display = "block";
          viewport.style.padding = "0";
          viewport.style.border = "0";
          viewport.style.borderRadius = "0";
          viewport.style.background = "transparent";
        }

        const scaler = document.querySelector(".journal-preview-scaler") as HTMLElement | null;
        if (scaler) {
          scaler.style.transform = "none";
          scaler.style.transformOrigin = "top left";
          scaler.style.width = "2400px";
          scaler.style.height = "auto";
          scaler.style.minHeight = "0";
          scaler.style.display = "block";
        }

        const root = document.querySelector(".journal-root") as HTMLElement | null;
        if (root) {
          root.style.transform = "none";
          root.style.width = "2400px";
          root.style.margin = "0";
          root.style.background = "transparent";
        }

        document.body.style.margin = "0";
        document.body.style.padding = "0";
        document.body.style.background = "transparent";

        document.documentElement.style.margin = "0";
        document.documentElement.style.padding = "0";
        document.documentElement.style.background = "transparent";

        const style = document.createElement("style");
        style.innerHTML = `
          @page {
            size: 2400px 4267px;
            margin: 0;
          }

          html,
          body {
            width: 2400px !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .journal-preview-viewport,
          .journal-preview-scaler,
          .journal-root {
            width: 2400px !important;
            max-height: none !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            transform: none !important;
            box-shadow: none !important;
          }

          .journal-page {
            width: 2400px !important;
            height: 4267px !important;
            min-height: 4267px !important;
            max-height: 4267px !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .journal-flow-page {
            width: 2400px !important;
            min-height: 4267px !important;
            height: auto !important;
            overflow: visible !important;
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
          }

          .journal-page:last-child,
          .journal-flow-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .journal-cover img,
          .journal-header img {
            display: block !important;
          }

          .journal-placeholder {
            z-index: 0 !important;
          }

          .journal-cover img[src],
          .journal-header img[src] {
            z-index: 2 !important;
          }
        `;
        document.head.appendChild(style);

        // @ts-ignore
        if (document.fonts?.ready) await document.fonts.ready;

        const images = Array.from(document.images);

        await Promise.all(
          images.map((img) => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();

            return new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(() => resolve(), 8000);
            });
          })
        );

        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      await page.pdf({
        path: pdfPath,
        printBackground: true,
        width: "2400px",
        height: "4267px",
        margin: {
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
        preferCSSPageSize: true,
      });

      await page.close();

      return res.json({
        success: true,
        pdfPath,
        pdfUrl: `/api/journal/download?path=${encodeURIComponent(pdfPath)}`,
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar PDF do jornal.",
      });
    } finally {
      if (browser) await browser.close();
    }
  });

  app.get("/api/journal/download", (req, res) => {
    const requested = req.query.path;

    if (!requested || typeof requested !== "string") {
      return res.status(400).json({ error: "PDF inválido." });
    }

    try {
      const resolved = assertInsideOutput(requested);

      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: "PDF não encontrado." });
      }

      return res.download(resolved, path.basename(resolved));
    } catch (error) {
      return res.status(403).json({
        error: error instanceof Error ? error.message : "Acesso negado.",
      });
    }
  });
}
