import express from "express";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";

const OUTPUT_DIR = path.resolve("output");
const PROJECT_ROOT = path.resolve();

/**
 * Garante que o caminho solicitado está dentro da pasta de output por segurança.
 */
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

/**
 * Prepara o HTML ajustando os caminhos das fontes e assets para o sistema de arquivos local.
 */
function prepareHtmlForPdf(html: string) {
  let preparedHtml = html.includes("<base")
    ? html
    : html.replace("<head>", `<head><base href="file://${PROJECT_ROOT}/">`);

  preparedHtml = preparedHtml.replaceAll('src="/assets/', `src="file://${path.join(PROJECT_ROOT, "assets").replace(/\\/g, "/")}/`);
  preparedHtml = preparedHtml.replaceAll('src="/fonts/', `src="file://${path.join(PROJECT_ROOT, "fonts").replace(/\\/g, "/")}/`);
  return preparedHtml;
}

export function setupJournalRoute(app: express.Express) {
  app.post("/api/journal/pdf", async (req, res) => {
    const { html, jobId, fileName } = req.body ?? {};
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "HTML do jornal não recebido ou inválido." });
    }

    const safeJobId = String(jobId || `journal_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const jobDir = path.join(OUTPUT_DIR, safeJobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const basePdfName = fileName ? `${fileName.replace(/\.[^/.]+$/, "")}.pdf` : "jornal_gerado.pdf";
    const finalPdfPath = assertInsideOutput(path.join(jobDir, basePdfName));
    const htmlPath = path.join(jobDir, "temp_journal_render.html");

    const finalHtml = prepareHtmlForPdf(html);
    fs.writeFileSync(htmlPath, finalHtml, "utf8");

    let browser: any = null;
    try {
      browser = await puppeteer.launch({
        executablePath: getChromiumExecutablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--font-render-hinting=none",
          "--allow-file-access-from-files"
        ],
        headless: true,
      });

      const page = await browser.newPage();
      // Viewport largo para garantir renderização correta
      await page.setViewport({ width: 2400, height: 5000, deviceScaleFactor: 1 });
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 120000 });

      // Ativar Shadow DOM e preparar layout para impressão
      await page.evaluate(() => {
        // Ativação moderna do Shadow DOM Declarativo
        document.querySelectorAll("template[shadowrootmode]").forEach((template: any) => {
          const parent = template.parentElement;
          if (!parent || parent.shadowRoot) return;
          if (typeof parent.setHTMLUnsafe === 'function') {
            parent.setHTMLUnsafe(template.innerHTML);
          } else {
            const shadow = parent.attachShadow({ mode: template.getAttribute("shadowrootmode") || "open" });
            shadow.appendChild(template.content.cloneNode(true));
            template.remove();
          }
        });

        // Limpeza de elementos de UI do preview
        document.querySelectorAll(".journal-page-label").forEach((el) => el.remove());

        // Forçar estilos de impressão
        const viewport = document.querySelector(".journal-preview-viewport") as HTMLElement;
        if (viewport) viewport.style.cssText = "width:2400px !important; max-height:none !important; overflow:visible !important; display:block !important; padding:0 !important; border:0 !important; background:white !important;";
        
        const scaler = document.querySelector(".journal-preview-scaler") as HTMLElement;
        if (scaler) scaler.style.cssText = "transform:none !important; width:2400px !important; height:auto !important; display:block !important;";
        
        const root = document.querySelector(".journal-root") as HTMLElement;
        if (root) root.style.cssText = "width:2400px !important; margin:0 !important; background:white !important;";
      });

      // Identificar as páginas (Capa, Cards, Anúncio)
      const pages = await page.$$('.journal-page, .journal-flow-page');
      const pdfDocs: Buffer[] = [];

      // Gerar cada página individualmente com sua altura real
      for (let i = 0; i < pages.length; i++) {
        const box = await pages[i].boundingBox();
        if (!box) continue;

        const pagePdf = await page.pdf({
          printBackground: true,
          width: "2400px",
          height: `${Math.ceil(box.height)}px`,
          pageRanges: `${i + 1}`,
          margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" }
        });
        pdfDocs.push(pagePdf);
      }

      // Mesclar as páginas em um único documento PDF
      const mergedPdf = await PDFDocument.create();
      for (const pdfBytes of pdfDocs) {
        const doc = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      }

      const pdfBytes = await mergedPdf.save();
      fs.writeFileSync(finalPdfPath, pdfBytes);

      // Limpeza do HTML temporário
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);

      return res.json({ 
        success: true, 
        pdfUrl: `/api/journal/download?path=${encodeURIComponent(finalPdfPath)}` 
      });

    } catch (error: any) {
      console.error("Erro na geração do Jornal:", error);
      return res.status(500).json({ error: error.message || "Erro interno ao gerar PDF." });
    } finally {
      if (browser) await browser.close();
    }
  });

  /**
   * Rota para download do PDF gerado.
   */
  app.get("/api/journal/download", (req, res) => {
    const requested = req.query.path as string;
    if (!requested) return res.status(400).json({ error: "Caminho do PDF não fornecido." });

    try {
      const resolved = assertInsideOutput(requested);
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: "Arquivo PDF não encontrado no servidor." });
      }
      return res.download(resolved, path.basename(resolved));
    } catch (error: any) {
      return res.status(403).json({ error: error.message || "Acesso negado." });
    }
  });
}
