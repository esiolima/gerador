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
    : html.replace("<head>", `<head><base href="file://${PROJECT_ROOT}/">`);

  preparedHtml = preparedHtml.replaceAll('src="/assets/', `src="file://${path.join(PROJECT_ROOT, "assets").replace(/\\/g, "/")}/`);
  preparedHtml = preparedHtml.replaceAll('src="/fonts/', `src="file://${path.join(PROJECT_ROOT, "fonts").replace(/\\/g, "/")}/`);
  return preparedHtml;
}

export function setupJournalRoute(app: express.Express) {
  app.post("/api/journal/pdf", async (req, res) => {
    const { html, jobId, fileName } = req.body ?? {};
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "HTML inválido." });
    }

    const safeJobId = String(jobId || `journal_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const jobDir = path.join(OUTPUT_DIR, safeJobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const finalPdfPath = assertInsideOutput(path.join(jobDir, fileName || "jornal.pdf"));
    const htmlPath = path.join(jobDir, "temp_render.html");

    fs.writeFileSync(htmlPath, prepareHtmlForPdf(html), "utf8");

    let browser: any = null;
    try {
      browser = await puppeteer.launch({
        executable_path: getChromiumExecutablePath(),
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: true,
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 2400, height: 3500 });
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0", timeout: 60000 });

      await page.pdf({
        path: finalPdfPath,
        printBackground: true,
        width: "2400px",
        height: "3500px", // Tamanho fixo estável
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" }
      });

      return res.json({ 
        success: true, 
        pdfUrl: `/api/journal/download?path=${encodeURIComponent(finalPdfPath)}` 
      });

    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    } finally {
      if (browser) await browser.close();
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  });

  app.get("/api/journal/download", (req, res) => {
    const requested = req.query.path as string;
    try {
      const resolved = assertInsideOutput(requested);
      return res.download(resolved);
    } catch {
      return res.status(403).send("Acesso negado.");
    }
  });
}
