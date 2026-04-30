import express from "express";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer-core";

const OUTPUT_DIR = path.resolve("output");

function assertInsideOutput(filePath: string) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(OUTPUT_DIR)) throw new Error("Acesso negado ao caminho solicitado.");
  return resolved;
}

export function setupJournalRoute(app: express.Express) {
  app.post("/api/journal/pdf", async (req, res) => {
    const { html, jobId } = req.body ?? {};
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "HTML do jornal não recebido." });
    }

    const safeJobId = String(jobId || `journal_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");
    const jobDir = path.join(OUTPUT_DIR, safeJobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const htmlPath = assertInsideOutput(path.join(jobDir, "jornal_editado.html"));
    const pdfPath = assertInsideOutput(path.join(jobDir, "jornal_gerado.pdf"));

    const finalHtml = html.includes("<base")
      ? html
      : html.replace("<head>", `<head><base href="file://${path.resolve()}/">`);
    fs.writeFileSync(htmlPath, finalHtml, "utf8");

    let browser: any = null;
    try {
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
      await page.evaluate(async () => {
        // @ts-ignore
        if (document.fonts?.ready) await document.fonts.ready;
      });
      const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        width: "1080px",
        height: `${Math.max(height, 1920)}px`,
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
        preferCSSPageSize: false,
      });
      await page.close();
      return res.json({ success: true, pdfPath, pdfUrl: `/api/journal/download?path=${encodeURIComponent(pdfPath)}` });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Erro ao gerar PDF do jornal." });
    } finally {
      if (browser) await browser.close();
    }
  });

  app.get("/api/journal/download", (req, res) => {
    const requested = req.query.path;
    if (!requested || typeof requested !== "string") return res.status(400).json({ error: "PDF inválido." });
    try {
      const resolved = assertInsideOutput(requested);
      if (!fs.existsSync(resolved)) return res.status(404).json({ error: "PDF não encontrado." });
      res.download(resolved, path.basename(resolved));
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : "Acesso negado." });
    }
  });
}
