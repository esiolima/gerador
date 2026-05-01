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
    const { html, jobId, fileName } = req.body ?? {};

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
    
    const basePdfName = fileName ? `${fileName.replace(/\.[^/.]+$/, "")}.pdf` : "jornal_gerado.pdf";
    const pdfPath = assertInsideOutput(path.join(jobDir, basePdfName));

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

      // Viewport inicial largo o suficiente
      await page.setViewport({
        width: 2400,
        height: 5000,
        deviceScaleFactor: 1,
      });

      await page.goto(`file://${htmlPath}`, {
        waitUntil: "networkidle0",
        timeout: 120000,
      });

      // Preparar o DOM e calcular a altura da página de cards
      const flowPageHeight = await page.evaluate(async () => {
        // Ativar Shadow DOM
        document.querySelectorAll("template[shadowrootmode]").forEach((template) => {
          const mode = template.getAttribute("shadowrootmode") || "open";
          const parent = template.parentElement;
          if (!parent || parent.shadowRoot) return;
          if (typeof parent.setHTMLUnsafe === 'function') {
            parent.setHTMLUnsafe(template.innerHTML);
          } else {
            const shadow = parent.attachShadow({ mode: mode as ShadowRootMode });
            shadow.appendChild(template.content.cloneNode(true));
            template.remove();
          }
        });

        document.querySelectorAll(".journal-page-label").forEach((el) => el.remove());

        const viewport = document.querySelector(".journal-preview-viewport") as HTMLElement | null;
        if (viewport) {
          viewport.style.cssText = "width:2400px !important; max-height:none !important; overflow:visible !important; display:block !important; padding:0 !important; border:0 !important; background:transparent !important;";
        }

        const scaler = document.querySelector(".journal-preview-scaler") as HTMLElement | null;
        if (scaler) {
          scaler.style.cssText = "transform:none !important; width:2400px !important; height:auto !important; min-height:0 !important; display:block !important;";
        }

        const root = document.querySelector(".journal-root") as HTMLElement | null;
        if (root) {
          root.style.cssText = "width:2400px !important; margin:0 !important; background:transparent !important;";
        }

        // Forçar as páginas a não quebrarem internamente
        const flowPage = document.querySelector('.journal-flow-page') as HTMLElement | null;
        const height = flowPage ? flowPage.scrollHeight : 4267;

        // @ts-ignore
        if (document.fonts?.ready) await document.fonts.ready;

        return height;
      });

      // Injetar CSS de impressão agressivo para evitar quebras automáticas
      await page.addStyleTag({
        content: `
          @page { margin: 0; }
          html, body { 
            margin: 0 !important; 
            padding: 0 !important; 
            width: 2400px !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
          }
          .journal-page { 
            width: 2400px !important; 
            height: 4267px !important; 
            position: relative !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
            display: block !important;
          }
          .journal-flow-page { 
            width: 2400px !important; 
            height: ${flowPageHeight}px !important; 
            min-height: 4267px !important;
            position: relative !important;
            overflow: visible !important;
            page-break-after: always !important;
            break-after: page !important;
            display: block !important;
          }
          /* Impedir quebras dentro dos cards */
          .journal-grid, .journal-card-wrap {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .journal-page:last-child, .journal-flow-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        `
      });

      // Gerar o PDF respeitando o CSS injetado
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        preferCSSPageSize: true, // Crucial para respeitar as alturas variadas do CSS
        width: "2400px",
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" }
      });

      await page.close();

      return res.json({
        success: true,
        pdfPath,
        pdfUrl: `/api/journal/download?path=${encodeURIComponent(pdfPath)}`,
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Erro ao gerar PDF do jornal.",
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
